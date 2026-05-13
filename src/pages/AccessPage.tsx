import { useEffect, useState } from 'react'
import { invoke, IPC } from '../lib/ipc'
import { safeConfirm } from '../lib/dialogs'
import type { ProjectDTO, SubfolderDTO } from '../shared/types'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Button } from '../components/Button'

export function AccessPage() {
  const [projects, setProjects] = useState<ProjectDTO[]>([])
  const [subfolders, setSubfolders] = useState<SubfolderDTO[]>([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [newNumber, setNewNumber] = useState('')
  const [comment, setComment] = useState('')
  const [checkedSubs, setCheckedSubs] = useState<Set<number>>(new Set())
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    void refresh()
  }, [])

  // Quand on change de projet dans le dropdown, pré-remplit le champ commentaire
  // avec le commentaire actuel du projet (vide si nouveau projet ou aucune sélection).
  useEffect(() => {
    if (!selectedNumber) {
      setComment('')
      return
    }
    const found = projects.find((p) => p.number === selectedNumber)
    setComment(found?.comment ?? '')
  }, [selectedNumber, projects])

  async function refresh() {
    const [ps, ss] = await Promise.all([
      invoke<ProjectDTO[]>(IPC.ProjectsList),
      invoke<SubfolderDTO[]>(IPC.SubfoldersList)
    ])
    setProjects(ps)
    setSubfolders(ss.filter((s) => s.enabled))
  }

  async function handleResolve() {
    const number = (newNumber || selectedNumber).trim()
    if (!number) {
      setStatus('Entre un numéro de projet.')
      return
    }
    const result = await invoke<ProjectDTO | null>(IPC.ProjectResolve, {
      number,
      comment: comment.trim()
    })
    if (!result) {
      setStatus(`Projet ${number} introuvable sur P:\\`)
      return
    }
    setStatus(`Projet ${number} validé.`)
    setNewNumber('')
    // Garde le commentaire affiché (au lieu de l'effacer) pour que l'utilisateur
    // voie ce qui a été enregistré. Il sera re-synchronisé par le useEffect.
    setSelectedNumber(number)
    void refresh()
  }

  async function handleOpen() {
    const number = selectedNumber || newNumber
    if (!number) return setStatus('Sélectionne un projet.')

    if (checkedSubs.size === 0) {
      const r = await invoke<{ ok: boolean; reason?: string }>(IPC.ProjectOpen, {
        projectNumber: number
      })
      setStatus(r.ok ? 'Dossier ouvert.' : `Erreur : ${r.reason}`)
      return
    }

    let opened = 0
    const missing: string[] = []
    for (const id of checkedSubs) {
      const sub = subfolders.find((s) => s.id === id)
      if (!sub) continue
      const r = await invoke<{ ok: boolean; reason?: string }>(IPC.ProjectOpen, {
        projectNumber: number,
        subfolderRelative: sub.relativePath
      })
      if (r.ok) opened++
      else missing.push(sub.name)
    }
    setStatus(`${opened} ouvert(s)${missing.length ? ` — manquants : ${missing.join(', ')}` : ''}`)
  }

  async function handleDelete() {
    if (!selectedNumber) return
    if (!safeConfirm(`Retirer ${selectedNumber} de la liste ?`)) return
    await invoke(IPC.ProjectDelete, selectedNumber)
    setSelectedNumber('')
    void refresh()
  }

  function toggleSub(id: number) {
    const next = new Set(checkedSubs)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCheckedSubs(next)
  }

  return (
    <div>
      <PageHeader
        title="Accès projets"
        subtitle={`${projects.length} projet${projects.length > 1 ? 's' : ''}`}
        actions={
          <Button variant="primary" icon="📂" onClick={handleOpen}>
            Ouvrir
          </Button>
        }
      />

      <div className="p-8 space-y-6 max-w-3xl">
        <Card className="p-6 space-y-4">
          <Field label="Projet existant">
            <select
              value={selectedNumber}
              onChange={(e) => setSelectedNumber(e.target.value)}
              className="w-72 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            >
              <option value="">— choisir —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.number}>
                  {p.number}
                  {p.comment ? ` — ${p.comment}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nouveau projet">
            <input
              type="text"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder="ex: 17528"
              className="w-72 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </Field>

          <Field label="Commentaire">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="ex: Ligne d'assemblage A"
              className="w-72 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <Button variant="primary" onClick={handleResolve}>
              Sélectionner / Vérifier
            </Button>
            <Button variant="danger" icon="🗑" onClick={handleDelete} disabled={!selectedNumber}>
              Retirer
            </Button>
          </div>
        </Card>

        {subfolders.length > 0 && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">
              Sous-dossiers {selectedNumber && <span className="text-zinc-500 font-normal">(projet {selectedNumber})</span>}
            </h3>
            <div className="space-y-2">
              {subfolders.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checkedSubs.has(s.id)}
                    onChange={() => toggleSub(s.id)}
                    className="accent-orange-500 w-4 h-4"
                  />
                  <span className="text-sm text-zinc-800 font-medium">{s.name}</span>
                  <span className="text-xs text-zinc-500 ml-auto">{s.relativePath}</span>
                </label>
              ))}
            </div>
          </Card>
        )}

        {status && <div className="text-sm text-zinc-600 pl-1">{status}</div>}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <label className="text-sm text-zinc-600 w-36 text-right">{label}</label>
      {children}
    </div>
  )
}
