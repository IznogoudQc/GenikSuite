import { dialog, BrowserWindow, type IpcMain } from 'electron'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import { eq, asc } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { networkProfiles } from '../../db/schema'
import {
  IPC,
  type NetworkProfileDTO,
  type NetworkInterfaceDTO,
  type NetshResult,
  type ImportLegacyResult
} from '../../src/shared/types'
import { getConfigValue } from './config'

const execFileAsync = promisify(execFile)

function toDTO(r: {
  id: number
  name: string
  interfaceName: string
  ip: string
  subnet: string
  gateway: string | null
  position: number | null
}): NetworkProfileDTO {
  return {
    id: r.id,
    name: r.name,
    interfaceName: r.interfaceName,
    ip: r.ip,
    subnet: r.subnet,
    gateway: r.gateway ?? '',
    position: r.position ?? 0
  }
}

/**
 * Exécute une commande netsh élevée via UAC. Retourne dès que l'utilisateur
 * a accepté/refusé le prompt. On utilise `Start-Process -Verb RunAs -Wait`
 * pour bloquer jusqu'à la fin de la commande.
 *
 * On ne capture pas stdout (passe via une fenêtre cmd élevée séparée), donc
 * le succès est inféré en relisant la config réseau après coup.
 */
function runElevatedNetsh(args: string[]): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    // Construit la liste d'arguments pour cmd /c (séparés par espaces, valeurs
    // contenant des espaces guillotées).
    const cmdLine = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')

    // PowerShell : Start-Process cmd -Verb RunAs -Wait -ArgumentList '/c <cmd>'
    // On échappe les guillemets pour PowerShell.
    const psArg = `Start-Process cmd -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '/c ${cmdLine.replace(/'/g, "''")}'`

    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psArg],
      { windowsHide: true }
    )

    let stderr = ''
    ps.stderr.on('data', (d) => (stderr += d.toString()))

    ps.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else {
        // Code 1 quand l'utilisateur refuse UAC.
        resolve({
          ok: false,
          message: stderr.trim() || (code === 1 ? 'UAC refusé.' : `Code: ${code}`)
        })
      }
    })

    ps.on('error', (err) => resolve({ ok: false, message: err.message }))
  })
}

/**
 * Encode une commande PowerShell en base64 UTF-16LE, format attendu par
 * `-EncodedCommand`. Permet de passer des caractères Unicode (accents,
 * apostrophes, etc.) sans subir l'encodage CP1252 par défaut de la console.
 */
function encodePsCommand(cmd: string): string {
  return Buffer.from(cmd, 'utf16le').toString('base64')
}

/**
 * Exécute une commande PowerShell et parse la sortie JSON.
 * - `-EncodedCommand` : argv en UTF-16LE base64 (évite la corruption CP1252 des accents).
 * - `[Console]::OutputEncoding = UTF8` : force stdout en UTF-8 pour la relecture côté Node.
 */
async function runPsJson<T = unknown>(psCommand: string): Promise<T | null> {
  try {
    const wrapped = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${psCommand}`
    const encoded = encodePsCommand(wrapped)
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, maxBuffer: 5 * 1024 * 1024, encoding: 'utf8' }
    )
    const trimmed = stdout.trim()
    if (!trimmed) return null
    return JSON.parse(trimmed) as T
  } catch (err) {
    // Bruit : certaines interfaces (Bluetooth désactivé, etc.) n'ont pas de config IPv4.
    // On retourne null silencieusement plutôt que polluer la console.
    return null
  }
}

/**
 * Liste les interfaces réseau via `Get-NetAdapter` (PowerShell).
 * Plus fiable que netsh : sortie JSON, pas de dépendance à la locale.
 */
async function listInterfacesRaw(): Promise<NetworkInterfaceDTO[]> {
  type RawAdapter = { Name: string; Status: string; InterfaceDescription?: string }
  const adapters = await runPsJson<RawAdapter | RawAdapter[]>(
    'Get-NetAdapter | Select-Object Name, Status, InterfaceDescription | ConvertTo-Json -Compress'
  )
  if (!adapters) return []
  const arr = Array.isArray(adapters) ? adapters : [adapters]

  const out: NetworkInterfaceDTO[] = []
  for (const a of arr) {
    const state =
      a.Status === 'Up' ? 'Connected' : a.Status === 'Down' ? 'Disconnected' : a.Status
    const iface: NetworkInterfaceDTO = {
      name: a.Name,
      state,
      type: a.InterfaceDescription ?? 'Dedicated'
    }
    const info = await getInterfaceConfig(a.Name)
    iface.currentIp = info.ip
    iface.mode = info.mode
    out.push(iface)
  }
  return out
}

/**
 * Récupère l'IP courante et le mode (DHCP / statique) d'une interface
 * via Get-NetIPAddress + Get-NetIPInterface. Sortie JSON, indépendant de la locale.
 */
async function getInterfaceConfig(
  ifaceName: string
): Promise<{ ip?: string; mode: 'dhcp' | 'static' | 'unknown' }> {
  // Escape pour PowerShell : on entoure de simples quotes et on double les '.
  const ps = ifaceName.replace(/'/g, "''")

  type IPAddr = { IPAddress: string }
  const addrs = await runPsJson<IPAddr | IPAddr[]>(
    `Get-NetIPAddress -InterfaceAlias '${ps}' -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object IPAddress | ConvertTo-Json -Compress`
  )
  let ip: string | undefined
  if (addrs) {
    const arr = Array.isArray(addrs) ? addrs : [addrs]
    // Prend la première IP non-APIPA (169.254.x.x).
    ip = arr.map((a) => a.IPAddress).find((s) => s && !s.startsWith('169.254.'))
  }

  type IPIface = { Dhcp: string }
  const ifaceInfo = await runPsJson<IPIface | IPIface[]>(
    `Get-NetIPInterface -InterfaceAlias '${ps}' -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object Dhcp | ConvertTo-Json -Compress`
  )
  let mode: 'dhcp' | 'static' | 'unknown' = 'unknown'
  if (ifaceInfo) {
    const arr = Array.isArray(ifaceInfo) ? ifaceInfo : [ifaceInfo]
    const dhcp = arr[0]?.Dhcp
    // Dhcp peut être "Enabled"/"Disabled" (texte) ou 1/0 (int) selon Windows.
    if (dhcp === 'Enabled' || (dhcp as unknown) === 1) mode = 'dhcp'
    else if (dhcp === 'Disabled' || (dhcp as unknown) === 0) mode = 'static'
  }

  return { ip, mode }
}

export function registerNetworkHandlers(
  ipcMain: IpcMain,
  db: BetterSQLite3Database<Record<string, unknown>>
) {
  // ---------------- Profils ----------------
  ipcMain.handle(IPC.NetworkProfilesList, async (): Promise<NetworkProfileDTO[]> => {
    const rows = await db.select().from(networkProfiles).orderBy(asc(networkProfiles.position))
    return rows.map((r) =>
      toDTO({
        id: r.id,
        name: r.name,
        interfaceName: r.interfaceName,
        ip: r.ip,
        subnet: r.subnet,
        gateway: r.gateway ?? '',
        position: r.position ?? 0
      })
    )
  })

  ipcMain.handle(
    IPC.NetworkProfileUpsert,
    async (
      _e,
      payload: {
        id?: number
        name: string
        interfaceName: string
        ip: string
        subnet: string
        gateway?: string
        position?: number
      }
    ): Promise<NetworkProfileDTO> => {
      if (payload.id) {
        const updated = await db
          .update(networkProfiles)
          .set({
            name: payload.name,
            interfaceName: payload.interfaceName,
            ip: payload.ip,
            subnet: payload.subnet,
            gateway: payload.gateway ?? '',
            position: payload.position ?? 0,
            updatedAt: new Date()
          })
          .where(eq(networkProfiles.id, payload.id))
          .returning()
        const r = updated[0]
        return toDTO({ ...r, gateway: r.gateway ?? '', position: r.position ?? 0 })
      }
      const inserted = await db
        .insert(networkProfiles)
        .values({
          name: payload.name,
          interfaceName: payload.interfaceName,
          ip: payload.ip,
          subnet: payload.subnet,
          gateway: payload.gateway ?? '',
          position: payload.position ?? 0
        })
        .returning()
      const r = inserted[0]
      return toDTO({ ...r, gateway: r.gateway ?? '', position: r.position ?? 0 })
    }
  )

  ipcMain.handle(IPC.NetworkProfileDelete, async (_e, id: number): Promise<boolean> => {
    await db.delete(networkProfiles).where(eq(networkProfiles.id, id))
    return true
  })

  // ---------------- Interfaces ----------------
  ipcMain.handle(IPC.NetworkInterfacesList, async (): Promise<NetworkInterfaceDTO[]> => {
    return await listInterfacesRaw()
  })

  // ---------------- Actions netsh (admin) ----------------
  /**
   * Applique un profil : passe l'interface en IP statique via netsh.
   * Déclenche un prompt UAC à chaque appel.
   */
  ipcMain.handle(
    IPC.NetworkApplyProfile,
    async (_e, profileId: number): Promise<NetshResult> => {
      const rows = await db
        .select()
        .from(networkProfiles)
        .where(eq(networkProfiles.id, profileId))
        .limit(1)
      const p = rows[0]
      if (!p) return { ok: false, message: 'Profil introuvable.' }

      // Interface réseau cible : valeur globale en config (configurable par PC),
      // pas celle stockée dans le profil. Permet d'utiliser les mêmes profils
      // sur plusieurs postes où la carte porte un nom différent.
      const iface = (await getConfigValue(db, 'networkInterface')) || p.interfaceName

      const args = [
        'netsh',
        'interface',
        'ip',
        'set',
        'address',
        `name=${iface}`,
        'static',
        p.ip,
        p.subnet
      ]
      if (p.gateway) args.push(p.gateway)

      const r = await runElevatedNetsh(args)
      if (!r.ok) return { ok: false, message: r.message }

      // Relit l'IP pour confirmer
      const conf = await getInterfaceConfig(iface)
      return {
        ok: conf.ip === p.ip,
        newIp: conf.ip,
        message: conf.ip === p.ip ? undefined : `IP courante : ${conf.ip ?? 'inconnue'}`
      }
    }
  )

  /**
   * Bascule une interface en DHCP (IP + DNS). Deux commandes netsh à élever.
   * Une seule UAC suffit grâce au chaînage `&&` dans cmd.
   */
  ipcMain.handle(
    IPC.NetworkSetDhcp,
    async (_e, interfaceName: string): Promise<NetshResult> => {
      const cmd = [
        'cmd',
        '/c',
        `netsh interface ip set address name="${interfaceName}" source=dhcp && netsh interface ip set dns name="${interfaceName}" source=dhcp`
      ]
      // Adaptation : on passe par runElevatedNetsh mais comme cmd /c gère déjà
      // le chaînage, on construit directement.
      const r = await runElevatedNetshRaw(cmd[2])
      if (!r.ok) return { ok: false, message: r.message }

      const conf = await getInterfaceConfig(interfaceName)
      return { ok: conf.mode === 'dhcp', newIp: conf.ip, message: `Mode: ${conf.mode}` }
    }
  )

  /**
   * Importe un profiles.ini legacy (Manage_ip Python) :
   *   [Section]
   *   interface = Ethernet2
   *   ip = 192.168.0.50
   *   subnet = 255.255.255.0
   * Ouvre un dialog si filePath non fourni.
   */
  ipcMain.handle(
    IPC.NetworkImportLegacyIni,
    async (_e, payload?: { filePath?: string }): Promise<ImportLegacyResult> => {
      let filePath = payload?.filePath
      if (!filePath) {
        const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        const opts = {
          title: 'Sélectionne profiles.ini (Manage_ip)',
          properties: ['openFile' as const],
          filters: [{ name: 'INI', extensions: ['ini'] }]
        }
        const result = parent
          ? await dialog.showOpenDialog(parent, opts)
          : await dialog.showOpenDialog(opts)
        if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true }
        filePath = result.filePaths[0]
      }

      let content: string
      try {
        content = fs.readFileSync(filePath, 'utf-8')
      } catch (err) {
        return { ok: false, path: filePath, error: (err as Error).message }
      }

      const sections = parseIni(content)
      let inserted = 0
      let updated = 0
      let position = (
        await db.select().from(networkProfiles)
      ).reduce((max, p) => Math.max(max, p.position ?? 0), -1)

      for (const [name, values] of Object.entries(sections)) {
        const iface = values.interface || ''
        const ip = values.ip || ''
        const subnet = values.subnet || ''
        if (!iface || !ip || !subnet) continue

        const existing = await db
          .select()
          .from(networkProfiles)
          .where(eq(networkProfiles.name, name))
          .limit(1)

        if (existing[0]) {
          await db
            .update(networkProfiles)
            .set({
              interfaceName: iface,
              ip,
              subnet,
              gateway: values.gateway || '',
              updatedAt: new Date()
            })
            .where(eq(networkProfiles.id, existing[0].id))
          updated++
        } else {
          position += 1
          await db.insert(networkProfiles).values({
            name,
            interfaceName: iface,
            ip,
            subnet,
            gateway: values.gateway || '',
            position
          })
          inserted++
        }
      }

      return {
        ok: true,
        path: filePath,
        inserted,
        updated,
        total: Object.keys(sections).length
      }
    }
  )
}

/**
 * Variante de runElevatedNetsh qui accepte une chaîne cmd complète (déjà formatée).
 * Utile pour chaîner plusieurs netsh avec un seul prompt UAC.
 */
function runElevatedNetshRaw(cmdLine: string): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    const psArg = `Start-Process cmd -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '/c ${cmdLine.replace(/'/g, "''")}'`
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psArg],
      { windowsHide: true }
    )
    let stderr = ''
    ps.stderr.on('data', (d) => (stderr += d.toString()))
    ps.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, message: stderr.trim() || (code === 1 ? 'UAC refusé.' : `Code: ${code}`) })
    })
    ps.on('error', (err) => resolve({ ok: false, message: err.message }))
  })
}

/** Parse minimaliste d'un fichier INI : `[Section]` + `key = value`. */
function parseIni(content: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  let current: string | null = null
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    const sec = line.match(/^\[(.+)\]$/)
    if (sec) {
      current = sec[1].trim()
      out[current] = {}
      continue
    }
    if (!current) continue
    const kv = line.match(/^([^=]+)=(.*)$/)
    if (kv) out[current][kv[1].trim().toLowerCase()] = kv[2].trim()
  }
  return out
}
