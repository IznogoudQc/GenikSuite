import { useEffect, useMemo, useState } from 'react'
import { invoke, IPC } from '../lib/ipc'
import { safeConfirm } from '../lib/dialogs'
import type { DocumentDTO, DocumentGroupDTO } from '../shared/types'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Button } from '../components/Button'

const UNGROUPED_ID = -1 // pseudo-id pour la section "Non classé"

/**
 * Page Documents : raccourcis vers fichiers (normes ISO, manuels Stäubli,
 * gabarits Genik…) groupés par catégorie configurable.
 */
export function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentDTO[]>([])
  const [groups, setGroups] = useState<DocumentGroupDTO[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<DocumentDTO | null>(null)
  const [keyword, setKeyword] = useState('')
  const [isNew, setIsNew] = useState(false)
  // Groupes ouverts : Set vide = tous fermés par défaut.
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())

  function toggleGroup(id: number) {
    const next = new Set(expandedGroups)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedGroups(next)
  }
  const [groupsOpen, setGroupsOpen] = useState(false) // modale gestion groupes
  const [status, setStatus] = useState('')

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    const [ds, gs] = await Promise.all([
      invoke<DocumentDTO[]>(IPC.DocumentsList),
      invoke<DocumentGroupDTO[]>(IPC.DocumentGroupsList)
    ])
    setDocs(ds)
    setGroups(gs)
  }

  // Filtre par recherche : matche nom + chemin + commentaire (insensible casse).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.filePath.toLowerCase().includes(q) ||
        d.comment.toLowerCase().includes(q)
    )
  }, [docs, query])

  // Regroupe les documents filtrés par groupe. Les sections vides sont masquées.
  const sections = useMemo(() => {
    const map = new Map<number, DocumentDTO[]>()
    for (const d of filtered) {
      const key = d.groupId ?? UNGROUPED_ID
      const arr = map.get(key) ?? []
      arr.push(d)
      map.set(key, arr)
    }
    // Ordre : groupes triés par position, puis "Non classé" à la fin.
    const out: Array<{ id: number; name: string; docs: DocumentDTO[] }> = []
    for (const g of groups) {
      const arr = map.get(g.id)
      if (arr && arr.length) out.push({ id: g.id, name: g.name, docs: arr })
    }
    const ungrouped = map.get(UNGROUPED_ID)
    if (ungrouped && ungrouped.length)
      out.push({ id: UNGROUPED_ID, name: 'Non classé', docs: ungrouped })
    return out
  }, [filtered, groups])

  async function openDoc(d: DocumentDTO) {
    const r = await invoke<{ ok: boolean; reason?: string }>(IPC.DocumentOpen, d.id)
    if (r.ok) setStatus(`Ouvert : ${d.name}`)
    else setStatus(`❌ ${d.name} : ${r.reason ?? 'erreur'}`)
    setTimeout(() => setStatus(''), 2500)
  }

  function startNew() {
    setIsNew(true)
    setKeyword('')
    setEditing({
      id: 0,
      name: '',
      filePath: '',
      comment: '',
      isProjectRelative: false,
      groupId: null,
      position: docs.length
    })
  }

  function startEdit(d: DocumentDTO) {
    setIsNew(false)
    setKeyword('')
    setEditing({ ...d })
  }

  /**
   * Applique un mot-clé au pattern : remplace le filename par `*<mot-clé>*.<ext>`
   * (l'extension est conservée depuis le pattern actuel). Le sous-dossier est
   * gardé tel quel. Utile pour cibler une famille de fichiers (ex: tous les
   * "Configuration Robot_RobN.xlsm").
   */
  function applyKeyword(keyword: string) {
    if (!editing) return
    const kw = keyword.trim()
    if (!kw) return

    const norm = editing.filePath.replace(/\//g, '\\')
    const lastSep = norm.lastIndexOf('\\')
    const subDir = lastSep >= 0 ? norm.slice(0, lastSep) : ''
    const oldFile = lastSep >= 0 ? norm.slice(lastSep + 1) : norm
    const extMatch = oldFile.match(/\.([^.]+)$/)
    const ext = extMatch ? `.${extMatch[1]}` : ''
    const newFile = `*${kw}*${ext}`
    const newPath = subDir ? `${subDir}\\${newFile}` : newFile
    setEditing({ ...editing, filePath: newPath })
  }

  /**
   * Sélectionne un fichier et auto-détecte si c'est un fichier de projet.
   *   - Si le fichier est sous P:\ ET son nom contient un numéro projet :
   *     bascule en mode pattern et remplit le champ avec un pattern généré
   *     (`{PROJECT}` à la place du numéro, `*` pour dates/versions).
   *   - Sinon : mode chemin absolu classique.
   */
  async function browseFile() {
    if (!editing) return
    const r = await invoke<{
      cancelled?: boolean
      filePath?: string
      suggestedName?: string
      pattern?: string
      detectedProject?: string
    }>(IPC.DocumentPickFile)
    if (r.cancelled || !r.filePath) return

    if (r.pattern && r.detectedProject) {
      // Pattern détecté → mode projet-relatif automatique.
      setEditing({
        ...editing,
        filePath: r.pattern,
        isProjectRelative: true,
        name: editing.name.trim() || r.suggestedName || editing.name
      })
      setStatus(`Pattern détecté depuis projet ${r.detectedProject}.`)
      setTimeout(() => setStatus(''), 3000)
    } else {
      // Fichier hors structure projet → chemin absolu.
      setEditing({
        ...editing,
        filePath: r.filePath,
        isProjectRelative: false,
        name: editing.name.trim() || r.suggestedName || editing.name
      })
    }
  }

  async function saveEdit() {
    if (!editing) return
    if (!editing.name.trim() || !editing.filePath.trim()) {
      setStatus('Nom et chemin sont obligatoires.')
      return
    }
    await invoke(IPC.DocumentUpsert, {
      id: isNew ? undefined : editing.id,
      name: editing.name.trim(),
      filePath: editing.filePath.trim(),
      comment: editing.comment.trim(),
      isProjectRelative: editing.isProjectRelative,
      groupId: editing.groupId,
      position: editing.position
    })
    setEditing(null)
    setIsNew(false)
    void refresh()
  }

  async function deleteDoc(d: DocumentDTO) {
    if (!(await safeConfirm(`Supprimer « ${d.name} » de la liste ?`))) return
    await invoke(IPC.DocumentDelete, d.id)
    void refresh()
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle={`${docs.length} raccourci${docs.length > 1 ? 's' : ''} — ${groups.length} groupe${groups.length > 1 ? 's' : ''}`}
      />

      <div className="p-8 space-y-4 max-w-4xl">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 Rechercher un document..."
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
            <Button variant="secondary" onClick={() => setGroupsOpen(true)}>
              ⚙ Groupes
            </Button>
            <Button variant="primary" icon="+" onClick={startNew}>
              Ajouter
            </Button>
          </div>

          {sections.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4 text-center">
              {docs.length === 0
                ? "Aucun document. Crée un groupe puis ajoute des raccourcis vers tes normes, manuels, gabarits."
                : 'Aucun résultat pour cette recherche.'}
            </p>
          ) : (
            <div className="space-y-5">
              {sections.map((sec) => {
                const isOpen = expandedGroups.has(sec.id)
                return (
                  <div key={sec.id} className="border border-zinc-200 rounded-lg">
                    <button
                      onClick={() => toggleGroup(sec.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 rounded-lg"
                    >
                      <span className="text-zinc-500 text-xs">{isOpen ? '▼' : '▶'}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                        {sec.name}
                      </span>
                      <span className="text-zinc-400 text-xs">· {sec.docs.length}</span>
                    </button>
                    {isOpen && (
                      <div className="space-y-1.5 px-2 pb-2">
                        {sec.docs.map((d) => (
                          <DocRow
                            key={d.id}
                            doc={d}
                            onOpen={() => openDoc(d)}
                            onEdit={() => startEdit(d)}
                            onDelete={() => deleteDoc(d)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {status && <div className="text-sm text-zinc-700 pl-1">{status}</div>}
      </div>

      {/* Modale d'édition / création de document */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white rounded-xl p-6 w-[540px] shadow-2xl border border-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-900 mb-4">
              {isNew ? 'Nouveau document' : `Modifier « ${editing.name} »`}
            </h3>

            <label className="block text-sm text-zinc-600 mb-1.5">Nom affiché</label>
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="ex: Norme ISO 14120"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />

            <label className="block text-sm text-zinc-600 mb-1.5">Groupe</label>
            <select
              value={editing.groupId ?? ''}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  groupId: e.target.value === '' ? null : parseInt(e.target.value, 10)
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            >
              <option value="">— Non classé —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <label className="block text-sm text-zinc-600 mb-1.5">Fichier</label>
            <div className="flex gap-2 mb-1">
              <input
                value={editing.filePath}
                onChange={(e) => setEditing({ ...editing, filePath: e.target.value })}
                placeholder="Clique « Parcourir » pour sélectionner un fichier"
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
              <Button variant="secondary" onClick={browseFile}>
                📂 Parcourir
              </Button>
            </div>
            {editing.isProjectRelative ? (
              <p className="text-xs text-orange-600 mb-3 leading-relaxed flex items-start gap-1">
                <span>🔗</span>
                <span>
                  <strong>Pattern projet détecté</strong> — ce document apparaîtra dans
                  la page Accès pour tous les projets où le fichier existe au même
                  emplacement.
                </span>
              </p>
            ) : (
              <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
                Si tu sélectionnes un fichier dans un dossier projet, GenikSuite détectera
                automatiquement le pattern.
              </p>
            )}

            <label className="block text-sm text-zinc-600 mb-1.5">
              Mot-clé du nom (optionnel)
            </label>
            <div className="flex gap-2 mb-1">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyKeyword(keyword)
                  }
                }}
                placeholder="ex: Configuration Robot"
                disabled={!editing.filePath}
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40 disabled:bg-zinc-100 disabled:text-zinc-400"
              />
              <Button
                variant="secondary"
                onClick={() => applyKeyword(keyword)}
                disabled={!editing.filePath || !keyword.trim()}
              >
                Appliquer
              </Button>
            </div>
            <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
              {editing.filePath
                ? <>Remplace la partie nom du pattern par <code className="text-orange-600">{'*<mot-clé>*'}</code>. Utile pour matcher tous les variants (ex: <code>Configuration Robot_Rob1</code>, <code>Configuration Robot_Rob2</code>…).</>
                : <>Disponible après sélection d'un fichier avec « Parcourir ».</>}
            </p>

            <label className="block text-sm text-zinc-600 mb-1.5">Commentaire (optionnel)</label>
            <input
              value={editing.comment}
              onChange={(e) => setEditing({ ...editing, comment: e.target.value })}
              placeholder="ex: Sécurité des machines — Protecteurs"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 mb-5 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />

            <div className="flex justify-end gap-2">
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

      {/* Modale gestion des groupes */}
      {groupsOpen && (
        <GroupsManager
          groups={groups}
          onClose={() => {
            setGroupsOpen(false)
            void refresh()
          }}
        />
      )}
    </div>
  )
}

function DocRow({
  doc,
  onOpen,
  onEdit,
  onDelete
}: {
  doc: DocumentDTO
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-zinc-50 hover:bg-zinc-100 rounded-lg group min-w-0">
      <button
        onClick={onOpen}
        className="flex-1 min-w-0 text-left flex flex-col overflow-hidden"
        title={`Ouvrir : ${doc.filePath}`}
      >
        <span className="font-medium text-sm text-orange-600 hover:text-orange-700 truncate block w-full">
          📄 {doc.name}
        </span>
        <span className="text-xs text-zinc-500 truncate font-mono block w-full">
          {doc.filePath}
        </span>
        {doc.comment && (
          <span className="text-xs text-zinc-600 italic truncate block w-full">
            {doc.comment}
          </span>
        )}
      </button>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          title="Modifier"
          className="px-2 py-1 text-zinc-500 hover:text-zinc-800 hover:bg-white rounded"
        >
          ✎
        </button>
        <button
          onClick={onDelete}
          title="Supprimer"
          className="px-2 py-1 text-zinc-500 hover:text-red-600 hover:bg-white rounded"
        >
          🗑
        </button>
      </div>
    </div>
  )
}

/**
 * Modale de gestion des groupes : créer, renommer, supprimer.
 * Toutes les modifications sont persistées immédiatement en DB.
 */
function GroupsManager({
  groups,
  onClose
}: {
  groups: DocumentGroupDTO[]
  onClose: () => void
}) {
  const [local, setLocal] = useState<DocumentGroupDTO[]>(groups)
  const [newName, setNewName] = useState('')

  async function addGroup() {
    const name = newName.trim()
    if (!name) return
    const created = await invoke<DocumentGroupDTO>(IPC.DocumentGroupUpsert, {
      name,
      position: local.length
    })
    setLocal([...local, created])
    setNewName('')
  }

  async function renameGroup(g: DocumentGroupDTO, newName: string) {
    const name = newName.trim()
    if (!name || name === g.name) return
    await invoke(IPC.DocumentGroupUpsert, { id: g.id, name, position: g.position })
    setLocal(local.map((x) => (x.id === g.id ? { ...x, name } : x)))
  }

  async function removeGroup(g: DocumentGroupDTO) {
    if (
      !(await safeConfirm(
        `Supprimer le groupe « ${g.name} » ? Les documents associés passeront en « Non classé ».`
      ))
    )
      return
    await invoke(IPC.DocumentGroupDelete, g.id)
    setLocal(local.filter((x) => x.id !== g.id))
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-6 w-[480px] shadow-2xl border border-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-900 mb-4">Groupes de documents</h3>

        <div className="space-y-1.5 mb-4 max-h-[300px] overflow-y-auto">
          {local.length === 0 ? (
            <p className="text-sm text-zinc-400 py-3 text-center">Aucun groupe.</p>
          ) : (
            local.map((g) => (
              <div key={g.id} className="flex items-center gap-2 px-2 py-1.5 bg-zinc-50 rounded-lg">
                <input
                  defaultValue={g.name}
                  onBlur={(e) => renameGroup(g, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  className="flex-1 px-2 py-1 text-sm bg-transparent border border-transparent hover:border-zinc-200 focus:border-zinc-300 focus:bg-white rounded focus:outline-none"
                />
                <button
                  onClick={() => removeGroup(g)}
                  title="Supprimer le groupe"
                  className="px-2 py-1 text-zinc-500 hover:text-red-600 hover:bg-white rounded"
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 pt-3 border-t border-zinc-200 mb-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addGroup()
            }}
            placeholder="Nouveau groupe (ex: Normes ISO)"
            className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
          <Button variant="primary" icon="+" onClick={addGroup}>
            Ajouter
          </Button>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  )
}
