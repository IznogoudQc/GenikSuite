import { useEffect, useState } from 'react'
import { invoke, IPC, CONFIG_CHANGED_EVENT } from '../lib/ipc'
import { safeConfirm } from '../lib/dialogs'
import type { SubfolderDTO } from '../shared/types'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Button } from '../components/Button'

export function SettingsPage() {
  const [rootProjects, setRootProjects] = useState('')
  const [intervalMin, setIntervalMin] = useState('30')
  const [startHour, setStartHour] = useState('8')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [subfolders, setSubfolders] = useState<SubfolderDTO[]>([])

  const [newName, setNewName] = useState('')
  const [newPath, setNewPath] = useState('')

  const [status, setStatus] = useState('')

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    const [r, i, h, snd, subs] = await Promise.all([
      invoke<string>(IPC.ConfigGet, 'rootProjects'),
      invoke<string>(IPC.ConfigGet, 'intervalMinutes'),
      invoke<string>(IPC.ConfigGet, 'startHour'),
      invoke<string>(IPC.ConfigGet, 'soundEnabled'),
      invoke<SubfolderDTO[]>(IPC.SubfoldersList)
    ])
    setRootProjects(r)
    setIntervalMin(i)
    setStartHour(h)
    setSoundEnabled(snd !== 'false')
    setSubfolders(subs)
  }

  async function saveConfig() {
    await Promise.all([
      invoke(IPC.ConfigSet, { key: 'rootProjects', value: rootProjects }),
      invoke(IPC.ConfigSet, { key: 'intervalMinutes', value: intervalMin }),
      invoke(IPC.ConfigSet, { key: 'startHour', value: startHour }),
      invoke(IPC.ConfigSet, { key: 'soundEnabled', value: soundEnabled ? 'true' : 'false' })
    ])
    window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT))
    setStatus('Paramètres enregistrés.')
    setTimeout(() => setStatus(''), 2000)
  }

  async function addSubfolder() {
    if (!newName.trim() || !newPath.trim()) return
    await invoke(IPC.SubfolderUpsert, {
      name: newName.trim(),
      relativePath: newPath.trim(),
      position: subfolders.length,
      enabled: true
    })
    setNewName('')
    setNewPath('')
    void load()
  }

  async function deleteSubfolder(id: number) {
    if (!(await safeConfirm('Supprimer ce sous-dossier ?'))) return
    await invoke(IPC.SubfolderDelete, id)
    void load()
  }

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Configuration de l'application" />

      <div className="p-8 space-y-6 max-w-3xl">
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-900">Général</h3>

          <Field label="Racine projets">
            <input
              value={rootProjects}
              onChange={(e) => setRootProjects(e.target.value)}
              placeholder="P:\\"
              className="w-72 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </Field>

          <Field label="Intervalle popup (min)">
            <input
              type="number"
              value={intervalMin}
              onChange={(e) => setIntervalMin(e.target.value)}
              className="w-24 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </Field>

          <Field label="Heure de début">
            <input
              type="number"
              value={startHour}
              onChange={(e) => setStartHour(e.target.value)}
              className="w-24 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </Field>

          <Field label="Son du popup">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
              />
              {"Jouer un son à l'ouverture du popup"}
            </label>
          </Field>

          <div className="flex items-center gap-3 pt-1">
            <Button variant="primary" onClick={saveConfig}>
              Enregistrer
            </Button>
            {status && <span className="text-sm text-zinc-600">{status}</span>}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-semibold text-zinc-900 mb-4">Sous-dossiers ouvrables</h3>

          <div className="space-y-2 mb-4">
            {subfolders.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-zinc-50 rounded-lg"
              >
                <span className="font-medium text-zinc-800 text-sm">{s.name}</span>
                <span className="text-zinc-500 text-xs">→ {s.relativePath}</span>
                <button
                  onClick={() => deleteSubfolder(s.id)}
                  className="ml-auto text-zinc-400 hover:text-red-500"
                >
                  🗑
                </button>
              </div>
            ))}
            {subfolders.length === 0 && (
              <p className="text-sm text-zinc-400">Aucun sous-dossier configuré.</p>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-zinc-200">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom (ex: Plans)"
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder={'Chemin relatif (ex: 01-Plans\\Mécanique)'}
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
            <Button variant="primary" icon="+" onClick={addSubfolder}>
              Ajouter
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <label className="text-sm text-zinc-600 w-44 text-right">{label}</label>
      {children}
    </div>
  )
}
