import { useEffect, useRef, useState } from 'react'
import { invoke, IPC, CONFIG_CHANGED_EVENT } from '../lib/ipc'
import { safeConfirm } from '../lib/dialogs'
import type {
  NetworkProfileDTO,
  NetworkInterfaceDTO,
  NetshResult,
  ImportLegacyResult
} from '../shared/types'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Button } from '../components/Button'

/**
 * Page Réseau : équivalent de l'ancien Manage_ip Python.
 * Liste les profils IP statique stockés en DB, affiche l'interface Windows
 * configurée et son IP courante, applique un profil via netsh (UAC à chaque action).
 *
 * Le nom de la carte réseau est configurable car il varie selon les PC
 * ("Ethernet", "Ethernet 2", "Wi-Fi"…). On filtre l'affichage pour ne montrer
 * que celle-là.
 */
export function NetworkPage() {
  const [profiles, setProfiles] = useState<NetworkProfileDTO[]>([])
  const [allInterfaces, setAllInterfaces] = useState<NetworkInterfaceDTO[]>([])
  const [configuredIface, setConfiguredIface] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [editing, setEditing] = useState<NetworkProfileDTO | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [ifaceSaved, setIfaceSaved] = useState(false)
  // Timer pour debouncer la sauvegarde du nom d'interface pendant la frappe.
  const saveDebounce = useRef<number | null>(null)
  // Trace la dernière valeur sauvegardée pour éviter d'écrire à l'identique.
  const lastSavedRef = useRef<string>('')

  // Interface filtrée : on n'affiche QUE celle configurée.
  const interfaces = configuredIface
    ? allInterfaces.filter(
        (i) => i.name.toLowerCase() === configuredIface.toLowerCase()
      )
    : []

  useEffect(() => {
    void refresh()
    function reload() {
      void refresh()
    }
    window.addEventListener(CONFIG_CHANGED_EVENT, reload)
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, reload)
  }, [])

  async function refresh() {
    setRefreshing(true)
    const [ps, ifs, iface] = await Promise.all([
      invoke<NetworkProfileDTO[]>(IPC.NetworkProfilesList),
      invoke<NetworkInterfaceDTO[]>(IPC.NetworkInterfacesList),
      invoke<string>(IPC.ConfigGet, 'networkInterface')
    ])
    setProfiles(ps)
    setAllInterfaces(ifs)
    setConfiguredIface(iface)
    lastSavedRef.current = iface
    setRefreshing(false)
  }

  async function apply(p: NetworkProfileDTO) {
    setStatus(`Application de « ${p.name} » — accepte le prompt UAC…`)
    const r = await invoke<NetshResult>(IPC.NetworkApplyProfile, p.id)
    if (r.ok) setStatus(`✅ ${configuredIface || p.interfaceName} → ${p.ip}`)
    else setStatus(`❌ Échec : ${r.message ?? 'inconnu'}`)
    void refresh()
  }

  async function setDhcp(iface: string) {
    setStatus(`Passage de ${iface} en DHCP — accepte UAC…`)
    const r = await invoke<NetshResult>(IPC.NetworkSetDhcp, iface)
    if (r.ok) setStatus(`✅ ${iface} en DHCP (${r.newIp ?? 'IP en attente'})`)
    else setStatus(`❌ Échec : ${r.message ?? 'inconnu'}`)
    void refresh()
  }

  /**
   * Sauvegarde immédiate du nom d'interface en base. Idempotent (no-op si
   * identique à la dernière valeur écrite). Affiche un petit « ✓ enregistré ».
   */
  async function persistInterface(name: string) {
    const trimmed = name.trim()
    if (trimmed === lastSavedRef.current) return
    await invoke(IPC.ConfigSet, { key: 'networkInterface', value: trimmed })
    lastSavedRef.current = trimmed
    setIfaceSaved(true)
    setTimeout(() => setIfaceSaved(false), 1500)
  }

  /**
   * Appelé à chaque keystroke : met à jour l'état local immédiatement,
   * et déclenche une sauvegarde DB debouncée (500ms après la dernière frappe).
   */
  function handleIfaceChange(name: string) {
    setConfiguredIface(name)
    if (saveDebounce.current) window.clearTimeout(saveDebounce.current)
    saveDebounce.current = window.setTimeout(() => {
      void persistInterface(name)
    }, 500)
  }

  /** Force la sauvegarde immédiate (sur Enter ou blur). */
  function handleIfaceCommit(name: string) {
    if (saveDebounce.current) {
      window.clearTimeout(saveDebounce.current)
      saveDebounce.current = null
    }
    void persistInterface(name)
    void refresh()
  }

  // Cleanup du timer si le composant se démonte avant la sauvegarde.
  useEffect(() => {
    return () => {
      if (saveDebounce.current) {
        // Sauvegarde finale au démontage : évite de perdre une frappe en cours.
        window.clearTimeout(saveDebounce.current)
        void persistInterface(configuredIface)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function deleteProfile(p: NetworkProfileDTO) {
    if (!(await safeConfirm(`Supprimer le profil « ${p.name} » ?`))) return
    await invoke(IPC.NetworkProfileDelete, p.id)
    void refresh()
  }

  async function importIni() {
    const r = await invoke<ImportLegacyResult>(IPC.NetworkImportLegacyIni)
    if (r.cancelled) return
    if (!r.ok) {
      setStatus(`Import échoué : ${r.error ?? 'erreur inconnue'}`)
      return
    }
    setStatus(`Import OK : ${r.inserted} nouveau(x), ${r.updated} mis à jour (${r.total}).`)
    void refresh()
  }

  function startNew() {
    setIsNew(true)
    setEditing({
      id: 0,
      name: '',
      interfaceName: configuredIface || 'Ethernet',
      ip: '',
      subnet: '255.255.255.0',
      gateway: '',
      position: profiles.length
    })
  }

  function startEdit(p: NetworkProfileDTO) {
    setIsNew(false)
    setEditing({ ...p })
  }

  async function saveEdit() {
    if (!editing) return
    if (!editing.name.trim() || !editing.ip.trim()) {
      setStatus('Nom et IP sont obligatoires.')
      return
    }
    await invoke(IPC.NetworkProfileUpsert, {
      id: isNew ? undefined : editing.id,
      name: editing.name.trim(),
      // L'interface effective vient de la config globale au moment d'appliquer.
      interfaceName: (configuredIface || editing.interfaceName).trim(),
      ip: editing.ip.trim(),
      subnet: editing.subnet.trim(),
      gateway: editing.gateway.trim(),
      position: editing.position
    })
    setEditing(null)
    setIsNew(false)
    void refresh()
  }

  return (
    <div>
      <PageHeader
        title="Réseau"
        subtitle={`${profiles.length} profil${profiles.length > 1 ? 's' : ''} — IP statique`}
      />

      <div className="p-8 space-y-6 max-w-4xl">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-900">Carte réseau utilisée</h3>
            <Button variant="ghost" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Actualisation…' : '↻ Actualiser'}
            </Button>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm text-zinc-600">Nom :</label>
            <input
              list="iface-list-top"
              value={configuredIface}
              onChange={(e) => handleIfaceChange(e.target.value)}
              onBlur={(e) => handleIfaceCommit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleIfaceCommit((e.target as HTMLInputElement).value)
              }}
              placeholder="ex: Ethernet 2"
              className="w-64 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
            <datalist id="iface-list-top">
              {allInterfaces.map((i) => (
                <option key={i.name} value={i.name} />
              ))}
            </datalist>
            {ifaceSaved && <span className="text-xs text-green-600">✓ enregistré</span>}
            <span className="text-xs text-zinc-500">
              Modifiable par PC. Le nom varie d'un poste à l'autre.
            </span>
          </div>

          {interfaces.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Interface « {configuredIface || '—'} » introuvable.{' '}
              {allInterfaces.length > 0 && (
                <>Disponibles : {allInterfaces.map((i) => i.name).join(', ')}</>
              )}
            </p>
          ) : (
            interfaces.map((i) => (
              <div
                key={i.name}
                className="flex items-center gap-3 px-3 py-2 bg-zinc-50 rounded-lg text-sm"
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    /Connected|Connecté/i.test(i.state) ? 'bg-green-500' : 'bg-zinc-300'
                  }`}
                />
                <span className="font-medium text-zinc-800 w-28">{i.name}</span>
                <span className="text-zinc-600 font-mono text-xs w-32">
                  {i.currentIp ?? '—'}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    i.mode === 'dhcp'
                      ? 'bg-blue-100 text-blue-700'
                      : i.mode === 'static'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-zinc-200 text-zinc-600'
                  }`}
                >
                  {i.mode === 'dhcp' ? 'DHCP' : i.mode === 'static' ? 'Statique' : '?'}
                </span>
                <span className="text-xs text-zinc-500 ml-auto mr-2">{i.state}</span>
                <Button variant="secondary" onClick={() => setDhcp(i.name)}>
                  Passer en DHCP
                </Button>
              </div>
            ))
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-900">Profils IP statique</h3>
            <div className="flex gap-2">
              <Button variant="secondary" icon="📥" onClick={importIni}>
                Importer profiles.ini
              </Button>
              <Button variant="primary" icon="+" onClick={startNew}>
                Nouveau profil
              </Button>
            </div>
          </div>

          {profiles.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Aucun profil. Crée-en un ou importe l'ancien <code>profiles.ini</code>.
            </p>
          ) : (
            <div className="space-y-1.5">
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 bg-zinc-50 rounded-lg text-sm"
                >
                  <span className="font-medium text-zinc-800 w-48 truncate">{p.name}</span>
                  <span className="font-mono text-xs text-zinc-700 w-36">{p.ip}</span>
                  <span className="font-mono text-xs text-zinc-500 w-36">{p.subnet}</span>
                  <div className="ml-auto flex gap-2">
                    <Button variant="primary" onClick={() => apply(p)}>
                      Appliquer
                    </Button>
                    <Button variant="ghost" onClick={() => startEdit(p)}>
                      ✎
                    </Button>
                    <Button variant="danger" onClick={() => deleteProfile(p)}>
                      🗑
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {status && <div className="text-sm text-zinc-700 pl-1">{status}</div>}
      </div>

      {editing && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white rounded-xl p-6 w-[480px] shadow-2xl border border-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-900 mb-4">
              {isNew ? 'Nouveau profil' : `Modifier « ${editing.name} »`}
            </h3>

            <Row label="Nom">
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="ex: Camera_Atelier"
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
            </Row>
            <Row label="IP">
              <input
                value={editing.ip}
                onChange={(e) => setEditing({ ...editing, ip: e.target.value })}
                placeholder="192.168.0.50"
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
            </Row>
            <Row label="Masque">
              <input
                value={editing.subnet}
                onChange={(e) => setEditing({ ...editing, subnet: e.target.value })}
                placeholder="255.255.255.0"
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
            </Row>
            <Row label="Passerelle">
              <input
                value={editing.gateway}
                onChange={(e) => setEditing({ ...editing, gateway: e.target.value })}
                placeholder="(optionnel)"
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
            </Row>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button variant="primary" onClick={saveEdit}>
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <label className="text-sm text-zinc-600 w-24 text-right">{label}</label>
      {children}
    </div>
  )
}
