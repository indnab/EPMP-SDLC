/**
 * Quality Management dashboard: QA checklist activities across the projects you can see.
 * The Project Manager adds QA activities (WBS Task Creation - QA) and reviews completed ones; the assignee (Release
 * Manager or tagged member) opens the checklist and records Pass or Fail.
 */
import { useMemo, useState } from 'react'
import { Button, Card, Modal, PageHeader, Tabs } from '../../components'
import { Icon } from '../../components/Icon'
import { useInitiationStore } from '../../store/initiationStore'
import { useQAStore } from '../../store/qaStore'
import type { InitiationRecord } from '../../domain/initiation'
import type { PlanItem } from '../../domain/planning'
import { LEVEL_LABEL, PM_USER, PRIORITIES, childOf, flatten, itemErrors, taggedOf } from '../../domain/planning'
import { DEFAULT_CHECKLIST, QA_STATUS_CLS, isQa, ownerOptions, qaStatusOf, userOf } from '../../domain/execution'
import { Field, fmtD, inputCls, programNameOf } from '../initiation/shared'
import { NoPlanAccess, canSeeProject, usePlanRole } from '../planning/shared'
import { QaChecklistModal } from './QaChecklistModal'

const uid = () => `qa-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function QualityPage() {
  const role = usePlanRole()
  const { demands, records, programs, updateItem, addQaItem } = useInitiationStore()
  const archetypes = useQAStore((s) => s.archetypes)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<{ demandId: string; itemId: string } | null>(null)
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => {
    if (!role) return []
    const t = q.trim().toLowerCase()
    return demands.flatMap((d) => {
      const r = records[d.demandId]
      if (!r?.wbs || !canSeeProject(role, r)) return []
      return r.wbs.items.filter((i) => isQa(i)).map((i) => ({ d, r, i }))
    })
      .filter(({ i }) => role !== 'ReleaseManager' && role !== 'TeamMember' ? true : i.owner === userOf(role))
      .filter(({ d, r, i }) => !t || [d.demandId, r.projectId, r.projectName, i.name, i.owner].some((v) => (v ?? '').toLowerCase().includes(t)))
      .sort((a, b) => Number(qaStatusOf(a.i) === 'Complete') - Number(qaStatusOf(b.i) === 'Complete') || (a.r.projectId ?? '').localeCompare(b.r.projectId ?? ''))
  }, [role, demands, records, q])

  if (!role) return (<div><PageHeader title="Quality Management" section="Project Execution" /><NoPlanAccess /></div>)
  const isPm = role === 'ProjectManager'
  const myProjects = demands.map((d) => records[d.demandId]).filter((r): r is InitiationRecord => !!r?.wbs && r.wbs.status === 'Approved' && r.pm === PM_USER && r.closure?.status !== 'Closed')
  const openRow = open ? records[open.demandId] : undefined
  const openItem = openRow?.wbs?.items.find((i) => i.id === open?.itemId)
  const actionFor = (i: PlanItem) => {
    const s = qaStatusOf(i)
    if (isPm) return s === 'Awaiting review' ? 'Review' : s === 'Complete' ? 'View' : 'Open'
    if (i.owner === userOf(role) && s !== 'Complete') return 'Open checklist'
    return 'View'
  }

  return (
    <div>
      <PageHeader title="Quality Management" section="Project Execution"
        actions={<>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search work items" aria-label="Search work items"
            className="h-8 w-56 rounded-lg border border-[var(--color-border)] bg-white px-3 text-[11px] text-[#344054]" />
          {isPm && <Button variant="primary" size="sm" onClick={() => setAdding(true)}>+ Add</Button>}
        </>} />
      <p className="mb-3 text-[10.5px] text-[var(--color-muted)]">
        {isPm ? 'QA checklist activities of your projects. Add one, mark checklists ready, and review completed ones.' : 'QA checklists assigned to you. Pass or Fail opens once the Project Manager marks the checklist ready.'}
      </p>
      <Card flush className="!overflow-visible">
        <div className="table-scroll cta-pin">
          <table className="w-full text-[11.5px]">
            <thead><tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[10.5px] font-medium text-[#344054]">
              {['Project ID', 'Project Name', 'Program', 'QA checklist activity', 'Owner', 'Planned End', 'Status', 'Outcome'].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}
              <th className="px-3 py-3 text-center">Action</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={9} className="px-4 py-10 text-center text-[var(--color-muted)]">{q ? 'No work items match your search.' : 'No QA checklist activities yet.'}</td></tr> : rows.map(({ d, r, i }) => {
                const s = qaStatusOf(i)
                const a = actionFor(i)
                return (
                  <tr key={`${d.demandId}-${i.id}`} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                    <td className="px-3 py-2.5 font-mono text-[10.5px]">{r.projectId}</td>
                    <td className="px-3 py-2.5">{r.projectName}</td>
                    <td className="px-3 py-2.5">{programNameOf(r, programs)}</td>
                    <td className="px-3 py-2.5 font-medium text-[#101828]">{i.name}{i.addedInExecution && <span className="ml-1.5 rounded bg-[#eef4ff] px-1 text-[9.5px] text-primary">added</span>}</td>
                    <td className="px-3 py-2.5">{i.owner ?? <span className="text-[var(--color-muted)]">Unassigned</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtD(i.plannedEnd)}</td>
                    <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${QA_STATUS_CLS[s]}`}>{s}</span></td>
                    <td className="px-3 py-2.5">{i.qa?.outcome ? <span className={`font-semibold ${i.qa.outcome === 'Pass' ? 'text-emerald-700' : 'text-red-600'}`}>{i.qa.outcome}</span> : '—'}</td>
                    <td className="px-3 py-2.5 text-center"><Button variant={a === 'View' ? 'secondary' : 'primary'} size="sm" className="whitespace-nowrap" onClick={() => setOpen({ demandId: d.demandId, itemId: i.id })}>{a}</Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {open && openItem && openRow && (
        <QaChecklistModal item={openItem} role={role} closed={openRow.closure?.status === 'Closed'}
          onSave={(p, by) => updateItem(open.demandId, open.itemId, p, by)} onClose={() => setOpen(null)} />
      )}
      {adding && <AddQaDialog projects={myProjects} sdlcOf={(r) => !!archetypes.find((a) => a.id === r.projectType)?.sdlc} typeName={(r) => archetypes.find((a) => a.id === r.projectType)?.name ?? ''}
        onClose={() => setAdding(false)} onAdd={(r, item) => { addQaItem(r.demandId, item, PM_USER); setAdding(false) }} />}
    </div>
  )
}

/** WBS Task Creation - QA: adds a QA checklist activity under the QA section only. */
function AddQaDialog({ projects, sdlcOf, typeName, onClose, onAdd }: {
  projects: InitiationRecord[]
  sdlcOf: (r: InitiationRecord) => boolean
  typeName: (r: InitiationRecord) => string
  onClose: () => void
  onAdd: (r: InitiationRecord, item: PlanItem) => void
}) {
  const [pid, setPid] = useState(projects[0]?.demandId ?? '')
  const rec = projects.find((p) => p.demandId === pid)
  const items = rec?.wbs?.items ?? []
  // QA section: milestones that hold QA work, and QA activities (a task can sit under one).
  const qaMs = items.filter((m) => m.level === 'Milestone' && items.some((c) => c.parentId === m.id && isQa(c)))
  const parents = [...qaMs, ...items.filter((i) => isQa(i) && childOf(i.level))]
  const flat = flatten(items)
  const codeOf = new Map(flat.map((f) => [f.item.id, f.code]))
  const [parentId, setParentId] = useState('NONE')
  const [tab, setTab] = useState<'details' | 'deps' | 'log'>('details')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [effort, setEffort] = useState(0)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [owner, setOwner] = useState('')
  const [priority, setPriority] = useState<PlanItem['priority']>('Medium')
  const [actualEffort, setActualEffort] = useState(0)
  const [aStart, setAStart] = useState('')
  const [aEnd, setAEnd] = useState('')
  const [checks, setChecks] = useState(DEFAULT_CHECKLIST.map((c) => ({ ...c })))
  const [depOn, setDepOn] = useState('')
  const [shown, setShown] = useState(false)

  const sdlc = rec ? sdlcOf(rec) : false
  // NONE = the next topmost element: under the first QA section.
  const parent = parentId === 'NONE' ? qaMs[0] : items.find((i) => i.id === parentId)
  const level = parent ? childOf(parent.level) : undefined
  const tagged = rec ? taggedOf(rec) : []
  const owners = ownerOptions({ type: 'QA' }, tagged, sdlc)
  const draft: PlanItem = { id: 'new', parentId: parent?.id, level: level ?? 'Activity', type: 'QA', name, description, weight: 0, plannedStart: start, plannedEnd: end, effort, priority, locked: true, deps: [], actualStart: aStart || undefined, actualEnd: aEnd || undefined }
  const errors = itemErrors(draft, items)
  const missingParent = !parent || !level
  const filled = checks.filter((c) => c.label.trim())
  const save = () => {
    setShown(true)
    if (!rec || missingParent || Object.keys(errors).length || filled.length === 0) return
    onAdd(rec, {
      ...draft, id: uid(), owner: owner || undefined, actualEffort, checklist: filled.map((c) => ({ ...c, label: c.label.trim() })), qaRmOnly: sdlc,
      deps: depOn ? [{ onId: depOn, type: 'FS', lag: 0 }] : [],
    })
  }
  return (
    <Modal open onClose={onClose} size="lg" title="WBS Task Creation - QA"
      footer={<><Button variant="secondary" size="md" onClick={onClose}>Cancel</Button><Button variant="primary" size="md" disabled={!rec} onClick={save}>Submit</Button></>}>
      {projects.length === 0 ? <p className="text-[11.5px] text-[var(--color-muted)]">You have no approved, open projects to add QA activities to.</p> : (
        <>
          <Tabs className="mb-3" activeId={tab} onChange={(t) => setTab(t as typeof tab)} items={[{ id: 'details', label: 'Details' }, { id: 'deps', label: 'Linked Tasks / Dependency' }, { id: 'log', label: 'Activity Log' }]} />
          {tab === 'details' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Project ID"><select value={pid} onChange={(e) => { setPid(e.target.value); setParentId('NONE'); setOwner('') }} className={inputCls}>{projects.map((p) => <option key={p.demandId} value={p.demandId}>{p.projectId}</option>)}</select></Field>
              <Field label="Project Name"><input readOnly value={rec?.projectName ?? ''} className={inputCls + ' !bg-[#f2f4f7]'} /></Field>
              <Field label="Project Type"><input readOnly value={`${rec ? typeName(rec) : ''} · ${sdlc ? 'SDLC' : 'Non-SDLC'}`} className={inputCls + ' !bg-[#f2f4f7]'} /></Field>
              <Field label="WBS Element Type"><input readOnly value={level ? LEVEL_LABEL[level] : '—'} className={inputCls + ' !bg-[#f2f4f7]'} /></Field>
              <Field label="WBS Parent" required error={shown && missingParent ? 'There is no QA section to add under.' : undefined}>
                <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputCls}>
                  <option value="NONE">NONE (next topmost element)</option>{parents.map((p) => <option key={p.id} value={p.id}>{codeOf.get(p.id)} · {p.name}</option>)}
                </select></Field>
              <Field label="Priority"><select value={priority} onChange={(e) => setPriority(e.target.value as PlanItem['priority'])} className={inputCls}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <div className="md:col-span-3"><Field label="WBS Title" required error={shown ? errors.name : undefined}><input value={name} maxLength={255} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field></div>
              <div className="md:col-span-3"><Field label="WBS Description"><textarea value={description} rows={2} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] p-2 text-[11.5px]" /></Field></div>
              <Field label="Planned Effort (days)"><input type="number" min={0} value={effort} onChange={(e) => setEffort(Number(e.target.value))} className={inputCls} /></Field>
              <Field label="Planned Start Date" required error={shown ? errors.plannedStart : undefined}><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
              <Field label="Planned Finish Date" required error={shown ? errors.plannedEnd : undefined}><input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></Field>
              <Field label={sdlc ? 'Owner (Release Manager)' : 'Owner'}>
                <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls}><option value="">{owners.length ? 'Select…' : sdlc ? 'No Release Manager tagged' : 'No tagged resources'}</option>{owners.map((n) => <option key={n}>{n}</option>)}</select></Field>
              <Field label="Actual Effort (days)"><input type="number" min={0} value={actualEffort} disabled={!owner} onChange={(e) => setActualEffort(Number(e.target.value))} className={inputCls} /></Field>
              <div />
              <Field label="Actual Start Date"><input type="date" value={aStart} disabled={!owner} onChange={(e) => setAStart(e.target.value)} className={inputCls} /></Field>
              <Field label="Actual Finish Date" error={shown ? errors.actualEnd : undefined}><input type="date" value={aEnd} min={aStart} disabled={!owner} onChange={(e) => setAEnd(e.target.value)} className={inputCls} /></Field>
              <div className="md:col-span-3">
                <h4 className="mb-1.5 mt-2 text-[11.5px] font-semibold text-[#101828]">Quality Checklists</h4>
                <div className="space-y-2">
                  {checks.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <input value={c.label} aria-label={`Checklist item ${i + 1}`} onChange={(e) => setChecks(checks.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))} className={inputCls + ' flex-1'} />
                      <select value={c.mandatory ? 'm' : 'n'} aria-label={`Mandatory ${i + 1}`} onChange={(e) => setChecks(checks.map((x) => (x.id === c.id ? { ...x, mandatory: e.target.value === 'm' } : x)))} className={inputCls + ' w-40'}><option value="m">Mandatory</option><option value="n">Non-mandatory</option></select>
                      <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => setChecks(checks.filter((x) => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-[var(--color-destructive)]"><Icon name="close" size={14} /></button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setChecks([...checks, { id: uid(), label: '', mandatory: true }])} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-secondary)]"><Icon name="circle-plus" size={16} /> Add checklist item</button>
                {shown && filled.length === 0 && <p className="mt-1 text-[10.5px] text-red-600">Add at least one checklist item.</p>}
              </div>
            </div>
          )}
          {tab === 'deps' && (
            <div>
              <p className="mb-2 text-[11px] text-[var(--color-muted)]">This QA activity can follow another task (finish to start).</p>
              <Field label="Depends on"><select value={depOn} onChange={(e) => setDepOn(e.target.value)} className={inputCls}><option value="">None</option>{flat.map((f) => <option key={f.item.id} value={f.item.id}>{f.code} · {f.item.name}</option>)}</select></Field>
            </div>
          )}
          {tab === 'log' && <p className="text-[11px] text-[var(--color-muted)]">The activity log starts when the item is created. The owner is notified, and the item appears on the QA dashboard.</p>}
        </>
      )}
    </Modal>
  )
}
