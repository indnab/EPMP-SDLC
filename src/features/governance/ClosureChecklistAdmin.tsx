/** Governance → Closure Checklist: the Admin keeps the closure checklist master and maps each item to project archetypes. */
import { useState } from 'react'
import { Button, Card, Modal } from '../../components'
import { Icon } from '../../components/Icon'
import { useInitiationStore } from '../../store/initiationStore'
import { useQAStore } from '../../store/qaStore'
import type { ClosureItem } from '../../domain/closure'
import { inputCls } from '../initiation/shared'

export function ClosureChecklistAdmin() {
  const { closureItems, addClosureItem, updateClosureItem, deleteClosureItem } = useInitiationStore()
  const archetypes = useQAStore((s) => s.archetypes)
  const [editing, setEditing] = useState<ClosureItem | 'new' | null>(null)
  const [del, setDel] = useState<ClosureItem | null>(null)
  const nameOf = (id: string) => archetypes.find((a) => a.id === id)?.name ?? id

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <p className="m-0 text-[10.5px] text-[var(--color-muted)]">The Project Manager completes the items mapped to the project's archetype at closure. Keep labels short; add detail in the supporting file.</p>
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setEditing('new')}>+ Add item</Button>
      </div>
      <Card flush className="!overflow-visible">
        <div className="table-scroll">
          <table className="w-full text-[11.5px]">
            <thead><tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[10.5px] font-medium text-[#344054]">
              <th className="w-12 px-4 py-3">No.</th><th className="px-4 py-3">Checklist item</th><th className="px-4 py-3">Mapped archetypes</th><th className="w-24 px-4 py-3 text-center">Actions</th>
            </tr></thead>
            <tbody>
              {closureItems.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-[var(--color-muted)]">No closure checklist items yet. Click “+ Add item”.</td></tr> : closureItems.map((i, n) => (
                <tr key={i.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-2.5 tabular-nums">{n + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-[#101828]">{i.label}</td>
                  <td className="px-4 py-2.5">{i.archetypeIds.length ? i.archetypeIds.map((a) => <span key={a} className="mr-1 rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10px] text-primary">{nameOf(a)}</span>) : <span className="text-amber-700">Not mapped, so it does not appear at closure</span>}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button type="button" aria-label={`Edit ${i.label}`} onClick={() => setEditing(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-accent)] hover:bg-[var(--color-secondary)]"><Icon name="pen" size={14} /></button>
                    <button type="button" aria-label={`Delete ${i.label}`} onClick={() => setDel(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[#fef2f2] hover:text-[var(--color-destructive)]"><Icon name="close" size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <ItemDialog item={editing === 'new' ? undefined : editing} archetypes={archetypes.map((a) => ({ id: a.id, name: a.name }))} onClose={() => setEditing(null)}
          onSave={(label, ids) => { if (editing === 'new') addClosureItem(label, ids); else updateClosureItem(editing.id, { label, archetypeIds: ids }); setEditing(null) }} />
      )}
      {del && (
        <Modal open onClose={() => setDel(null)} size="sm" title="Delete this checklist item?"
          footer={<><Button variant="secondary" size="md" onClick={() => setDel(null)}>Cancel</Button><Button variant="primary" size="md" onClick={() => { deleteClosureItem(del.id); setDel(null) }}>Delete</Button></>}>
          <p className="text-[11.5px] text-[#344054]">“{del.label}” stops appearing on closures that have not been submitted. Closures already submitted keep their answers.</p>
        </Modal>
      )}
    </div>
  )
}

function ItemDialog({ item, archetypes, onClose, onSave }: { item?: ClosureItem; archetypes: { id: string; name: string }[]; onClose: () => void; onSave: (label: string, ids: string[]) => void }) {
  const [label, setLabel] = useState(item?.label ?? '')
  const [ids, setIds] = useState<string[]>(item?.archetypeIds ?? [])
  const [shown, setShown] = useState(false)
  const err = !label.trim() ? 'Enter the checklist item.' : label.trim().length > 120 ? 'Keep it to 120 characters.' : ''
  return (
    <Modal open onClose={onClose} size="md" title={item ? 'Edit checklist item' : 'Add checklist item'}
      footer={<><Button variant="secondary" size="md" onClick={onClose}>Cancel</Button><Button variant="primary" size="md" onClick={() => { setShown(true); if (!err) onSave(label.trim(), ids) }}>Save</Button></>}>
      <label className="mb-4 block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Checklist item <span className="text-red-500">*</span></span>
        <input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} className={inputCls} />{shown && err && <span className="mt-1 block text-[10.5px] text-red-600">{err}</span>}</label>
      <fieldset><legend className="mb-1.5 text-[10.5px] font-medium text-[#344054]">Map to project archetypes</legend>
        <div className="space-y-1.5">{archetypes.map((a) => (
          <label key={a.id} className="flex items-center gap-2 text-[11.5px] text-[#344054]">
            <input type="checkbox" checked={ids.includes(a.id)} onChange={(e) => setIds(e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id))} /> {a.name} <span className="font-mono text-[10px] text-[var(--color-muted)]">{a.id}</span>
          </label>
        ))}</div>
      </fieldset>
    </Modal>
  )
}
