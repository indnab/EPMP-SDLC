/**
 * Project Planning → WBS. The Project Manager imports the archetype's WBS template, grooms it (Milestone > Activity >
 * Task > Sub-task), links tasks and submits it. The CoE Head approves, sends back or rejects; approval locks the plan as
 * the baseline. Every tagged project member can see the complete WBS (read-only).
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Modal, PageHeader } from '../../components'
import { Icon } from '../../components/Icon'
import { useInitiationStore } from '../../store/initiationStore'
import { useQAStore } from '../../store/qaStore'
import { DEP_TYPES } from '../../domain/governance'
import type { DependencyType } from '../../domain'
import { archetypeAtVersion } from '../../domain/governance'
import type { PlanDep, PlanItem } from '../../domain/planning'
import { LEVEL_LABEL, LEVEL_ORDER, PM_USER, PRIORITIES, TEAM_MEMBER_USER, TRACKING_MODE, canDepend, childOf, flatten, importWbs, itemErrors, subtreeIds, taggedOf, wbsErrors } from '../../domain/planning'
import { Field, cellCls, fmtD, inputCls } from '../initiation/shared'
import { NoPlanAccess, canSeeProject, usePlanRole } from './shared'

const th = 'px-2 py-2.5 text-left text-[10.5px] font-medium text-[#344054] whitespace-nowrap'
const uid = () => `wbs-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const STATUS_CLS = { Draft: 'bg-slate-100 text-slate-700', Submitted: 'bg-indigo-100 text-indigo-800', Approved: 'bg-emerald-100 text-emerald-800', SentBack: 'bg-amber-100 text-amber-800', Rejected: 'bg-red-100 text-red-700' } as const

type FormState = { mode: 'new' | 'edit'; item: PlanItem } | null

export function PlanWbsPage() {
  const { demandId = '' } = useParams<{ demandId: string }>()
  const role = usePlanRole()
  const navigate = useNavigate()
  const { records, saveWbs, submitWbs, decideWbs } = useInitiationStore()
  const archetypes = useQAStore((s) => s.archetypes)
  const rec = records[demandId]
  const [view, setView] = useState<'table' | 'gantt'>('table')
  const [form, setForm] = useState<FormState>(null)
  const [del, setDel] = useState<PlanItem | null>(null)
  const [errorsShown, setErrorsShown] = useState<string[]>([])
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [decision, setDecision] = useState<null | 'approve' | 'sendBack' | 'reject'>(null)
  const [comment, setComment] = useState('')

  const items = rec?.wbs?.items ?? []
  const flat = useMemo(() => flatten(items), [items])
  const codeOf = useMemo(() => new Map(flat.map((f) => [f.item.id, f.code])), [flat])

  if (!role) return (<div><PageHeader title="WBS" section="Project Planning" /><NoPlanAccess /></div>)
  if (!rec || !canSeeProject(role, rec)) {
    return (
      <div className="py-20 text-center text-[var(--color-muted)]">
        <p className="font-medium">Project not found</p>
        <Link to="/planning" className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline">← Back to Project Planning</Link>
      </div>
    )
  }
  const arc = archetypes.find((a) => a.id === rec.projectType)
  const wbs = rec.wbs
  const scheduleApproved = rec.schedule?.status === 'Approved'
  const isPm = role === 'ProjectManager' && rec.pm === PM_USER
  const editable = isPm && scheduleApproved && (!wbs || wbs.status === 'Draft' || wbs.status === 'SentBack')
  const reviewing = role === 'CoEHead' && wbs?.status === 'Submitted'
  const hasJira = items.some((i) => i.type === 'ImportJira')
  const tagged = taggedOf(rec)

  const setItems = (next: PlanItem[]) => saveWbs(demandId, next)
  const patchItem = (id: string, p: Partial<PlanItem>) => setItems(items.map((i) => (i.id === id ? { ...i, ...p } : i)))
  const canEdit = (i: PlanItem) => editable && !i.frozen && !i.locked

  const doImport = () => {
    if (!arc || !rec.schedule) return
    const a = archetypeAtVersion(arc, arc.version)
    saveWbs(demandId, [], importWbs(a, a.version ?? 1, rec.schedule.plannedStart, rec.schedule.plannedEnd))
  }
  const trySubmit = () => {
    const errs = wbsErrors(items)
    setErrorsShown(errs)
    if (errs.length === 0) setConfirmSubmit(true)
  }
  const remove = (it: PlanItem) => {
    const gone = subtreeIds(items, it.id)
    setItems(items.filter((i) => !gone.has(i.id)).map((i) => ({ ...i, deps: i.deps.filter((d) => !gone.has(d.onId)) })))
    setDel(null)
  }
  const openNew = (parent: PlanItem) => {
    const level = childOf(parent.level)
    if (!level) return
    setForm({ mode: 'new', item: { id: uid(), parentId: parent.id, level, type: 'General', name: '', description: '', weight: 0, plannedStart: parent.plannedStart, plannedEnd: parent.plannedEnd, effort: 0, priority: 'Medium', locked: false, deps: [] } })
  }

  // Gantt scale.
  const min = items.reduce((m, i) => (i.plannedStart && i.plannedStart < m ? i.plannedStart : m), '9999-12-31')
  const max = items.reduce((m, i) => (i.plannedEnd > m ? i.plannedEnd : m), '0000-01-01')
  const span = Math.max(1, (Date.parse(max) - Date.parse(min)) / 86400000 + 1)
  const pos = (d: string) => Math.max(0, Math.min(100, ((Date.parse(d) - Date.parse(min)) / 86400000 / span) * 100))

  return (
    <div className="pb-24">
      <PageHeader title="WBS" section="Project Planning" crumb={`${rec.projectId} · WBS`} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-[16px] font-semibold text-[#101828]">{rec.projectName}</h1>
          <span className="font-mono text-[10.5px] text-[var(--color-muted)]">{rec.projectId}</span>
          {wbs && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLS[wbs.status]}`}>{wbs.status === 'SentBack' ? 'Sent back' : wbs.status}</span>}
          {wbs && <span className="text-[10.5px] text-[var(--color-muted)]">from {arc?.name ?? wbs.importedFrom.archetypeId} v{wbs.importedFrom.version}</span>}
          <div className="ml-auto flex items-center gap-2">
            {wbs && <div className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)] text-[10.5px]" role="group" aria-label="View">
              {(['table', 'gantt'] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`px-3 py-1.5 ${view === v ? 'bg-[var(--color-secondary)] font-semibold text-primary' : 'bg-white text-[#344054]'}`}>{v === 'table' ? 'Table view' : 'Gantt view'}</button>)}
            </div>}
          </div>
        </div>
        {role === 'TeamMember' && <p className="mt-2 text-[10.5px] text-[var(--color-muted)]">You can see the complete WBS, including work that is not assigned to you. Items assigned to you are highlighted.</p>}
        {wbs?.status === 'Approved' && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">Approved. This plan is locked and is the execution baseline.</p>}
        {wbs?.status === 'SentBack' && wbs.lastComment && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900"><strong>Sent back:</strong> {wbs.lastComment}</p>}
        {wbs?.status === 'Rejected' && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800"><strong>Rejected:</strong> {wbs.lastComment}. This WBS stays in the rejected state.</p>}
        {!scheduleApproved && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">The WBS can be created once the CoE Head approves the schedule.</p>}
        {isPm && scheduleApproved && tagged.length === 0 && <p className="mt-2 text-[10.5px] text-[var(--color-muted)]">Tag resources on the Project Planning page to assign owners.</p>}
      </Card>

      {!wbs ? (
        <Card>
          <div className="py-8 text-center">
            <p className="mb-1 text-[12px] font-medium text-[#101828]">No WBS yet</p>
            <p className="mb-4 text-[11px] text-[var(--color-muted)]">Import the {arc?.name ?? 'archetype'} template to start from the governed structure. Milestones are frozen.</p>
            {editable && arc ? <Button variant="primary" size="md" onClick={doImport}>Import WBS</Button> : <p className="text-[11px] text-[var(--color-muted)]">Nothing to show yet.</p>}
          </div>
        </Card>
      ) : view === 'table' ? (
        <Card flush className="!overflow-visible">
          <div className="table-scroll">
            <table className="w-full text-[11.5px]">
              <thead><tr className="border-b border-[var(--color-border)] bg-[#dce8fb]">
                <th className={th}>WBS ID</th><th className={th + ' min-w-[260px]'}>Milestone / Activity / Task / Sub-task</th><th className={th + ' w-20'}>EV Weight %</th>
                <th className={th + ' w-36'}>Planned Start</th><th className={th + ' w-36'}>Planned End</th><th className={th + ' w-24'}>Effort (days)</th>
                <th className={th}>Owner</th><th className={th + ' min-w-[140px]'}>Dependency</th><th className={th + ' w-28'}>Priority</th>{(editable || reviewing) && <th className={th + ' w-24'}>Actions</th>}
              </tr></thead>
              <tbody>
                {flat.map(({ item: it, code, depth }) => {
                  const e = itemErrors(it, items)
                  const mine = it.owner === TEAM_MEMBER_USER && role === 'TeamMember'
                  return (
                    <tr key={it.id} className={`border-b border-[var(--color-border)] last:border-0 align-middle ${it.level === 'Milestone' ? 'bg-[#f8faff]' : ''} ${mine ? 'bg-teal-50' : ''}`}>
                      <td className="px-2 py-1.5 font-mono text-[10.5px] text-[#344054]">{code}</td>
                      <td className="px-2 py-1.5"><div style={{ paddingLeft: depth * 16 }} className="flex items-center gap-1.5">
                        <span className={`${it.level === 'Milestone' ? 'font-semibold' : ''} text-[#101828]`}>{it.name}</span>
                        <span className="rounded bg-[#f2f4f7] px-1 text-[9.5px] text-[#475467]">{LEVEL_LABEL[it.level]}</span>
                        {it.type !== 'General' && <span className="rounded bg-[#eef4ff] px-1 text-[9.5px] text-primary">{it.type}</span>}
                        {it.locked && <Icon name="lock" size={11} />}{it.frozen && <span className="text-[9.5px] text-[var(--color-muted)]">frozen</span>}
                      </div></td>
                      <td className="px-2 py-1.5"><input type="number" min={0} max={100} value={it.weight} disabled={!canEdit(it)} aria-label={`${code} weight`} onChange={(ev) => patchItem(it.id, { weight: Number(ev.target.value) })} className={cellCls} /></td>
                      <td className="px-2 py-1.5"><input type="date" value={it.plannedStart} disabled={!canEdit(it)} aria-label={`${code} start`} onChange={(ev) => patchItem(it.id, { plannedStart: ev.target.value })} className={cellCls} />{e.plannedStart && <span className="block max-w-[140px] text-[9.5px] text-red-600">{e.plannedStart}</span>}</td>
                      <td className="px-2 py-1.5"><input type="date" value={it.plannedEnd} min={it.plannedStart} disabled={!canEdit(it)} aria-label={`${code} end`} onChange={(ev) => patchItem(it.id, { plannedEnd: ev.target.value })} className={cellCls} />{e.plannedEnd && <span className="block text-[9.5px] text-red-600">{e.plannedEnd}</span>}</td>
                      <td className="px-2 py-1.5"><input type="number" min={0} value={it.effort} disabled={!canEdit(it)} aria-label={`${code} effort`} onChange={(ev) => patchItem(it.id, { effort: Number(ev.target.value) })} className={cellCls} /></td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{it.owner ?? <span className="text-[var(--color-muted)]">—</span>}</td>
                      <td className="px-2 py-1.5 text-[10.5px]">{it.deps.length ? it.deps.map((d) => `${d.type} ${codeOf.get(d.onId) ?? '?'}${d.lag ? ` +${d.lag}d` : ''}`).join(', ') : <span className="text-[var(--color-muted)]">—</span>}</td>
                      <td className="px-2 py-1.5">{it.priority}</td>
                      {(editable || reviewing) && (
                        <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1">
                          {editable && childOf(it.level) && !it.locked && <button type="button" title="Add below" aria-label={`Add under ${code}`} onClick={() => openNew(it)} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-accent)]"><Icon name="circle-plus" size={15} /></button>}
                          {!it.frozen && <button type="button" title={editable ? 'Edit' : 'View'} aria-label={`${editable ? 'Edit' : 'View'} ${code}`} onClick={() => setForm({ mode: 'edit', item: structuredClone(it) })} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-accent)] hover:bg-[var(--color-secondary)]"><Icon name={editable ? 'pen' : 'eye'} size={14} /></button>}
                          {canEdit(it) && <button type="button" title="Delete" aria-label={`Delete ${code}`} onClick={() => setDel(it)} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[#fef2f2] hover:text-[var(--color-destructive)]"><Icon name="close" size={13} /></button>}
                        </span></td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {errorsShown.length > 0 && (
            <ul role="alert" className="list-disc space-y-0.5 border-t border-[var(--color-border)] bg-red-50 px-8 py-2 text-[10.5px] text-red-800">{errorsShown.map((m) => <li key={m}>{m}</li>)}</ul>
          )}
        </Card>
      ) : (
        <Card>
          <div className="mb-2 flex justify-between text-[10px] text-[var(--color-muted)]"><span>{fmtD(min)}</span><span>{fmtD(max)}</span></div>
          <div className="space-y-1">
            {flat.map(({ item: it, code, depth }) => (
              <div key={it.id} className="flex items-center gap-3">
                <div className="w-64 flex-none truncate text-[11px]" style={{ paddingLeft: depth * 12 }} title={`${code} ${it.name}`}><span className="font-mono text-[10px] text-[var(--color-muted)]">{code}</span> {it.name}</div>
                <div className="relative h-5 flex-1 rounded bg-[#f2f4f7]">
                  <div title={`${fmtD(it.plannedStart)} to ${fmtD(it.plannedEnd)}`} className={`absolute top-0.5 h-4 rounded ${it.level === 'Milestone' ? 'bg-[#2d3394]' : it.level === 'Activity' ? 'bg-[#245bff]' : 'bg-[#7fa3ff]'}`}
                    style={{ left: `${pos(it.plannedStart)}%`, width: `${Math.max(1, pos(it.plannedEnd) - pos(it.plannedStart))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="fixed bottom-0 right-0 z-30 flex justify-end gap-3 border-t border-[var(--color-border)] bg-white/90 px-7 py-3 backdrop-blur left-0 lg:left-[var(--nav-w)]">
        <Button variant="secondary" size="md" onClick={() => navigate('/planning')}>Back</Button>
        {editable && wbs && <Button variant="primary" size="md" onClick={trySubmit}>Submit for approval</Button>}
        {reviewing && (<>
          <Button variant="secondary" size="md" onClick={() => { setComment(''); setDecision('reject') }}>Reject</Button>
          <Button variant="secondary" size="md" onClick={() => { setComment(''); setDecision('sendBack') }}>Send Back</Button>
          <Button variant="primary" size="md" onClick={() => setDecision('approve')}>Approve</Button>
        </>)}
      </div>

      {form && <ItemForm state={form} items={items} rec={rec} archetypeName={arc?.name ?? ''} tagged={tagged} editable={editable && !form.item.locked && !form.item.frozen} codeOf={codeOf}
        onClose={() => setForm(null)}
        onSave={(it, next) => {
          const exists = items.some((i) => i.id === it.id)
          setItems(exists ? items.map((i) => (i.id === it.id ? it : i)) : [...items, it])
          if (next) openNew(items.find((i) => i.id === it.parentId) ?? it); else setForm(null)
        }} />}
      {del && (
        <Modal open onClose={() => setDel(null)} size="sm" title={`Delete ${del.name}?`}
          footer={<><Button variant="secondary" size="md" onClick={() => setDel(null)}>Cancel</Button><Button variant="primary" size="md" onClick={() => remove(del)}>Delete</Button></>}>
          <p className="text-[11.5px] text-[#344054]">This also removes everything under it and any links to it.</p>
        </Modal>
      )}
      {confirmSubmit && (
        <Modal open onClose={() => setConfirmSubmit(false)} size="sm" title="Submit the WBS for approval?"
          footer={<><Button variant="secondary" size="md" onClick={() => setConfirmSubmit(false)}>No</Button><Button variant="primary" size="md" onClick={() => { submitWbs(demandId); navigate('/planning') }}>Yes</Button></>}>
          <p className="text-[11.5px] text-[#344054]">The CoE Head reviews it. You cannot edit it while it is under review.</p>
        </Modal>
      )}
      {decision && (
        <Modal open onClose={() => setDecision(null)} size="sm" title={decision === 'approve' ? 'Approve the WBS?' : decision === 'sendBack' ? 'Send back for changes' : 'Reject the WBS'}
          footer={<><Button variant="secondary" size="md" onClick={() => setDecision(null)}>{decision === 'approve' ? 'No' : 'Cancel'}</Button>
            <Button variant="primary" size="md" disabled={decision !== 'approve' && !comment.trim()}
              onClick={() => { decideWbs(demandId, decision, comment.trim(), !!arc?.sdlc || hasJira); navigate('/planning') }}>{decision === 'approve' ? 'Yes' : decision === 'sendBack' ? 'Send back' : 'Reject'}</Button></>}>
          {decision === 'approve' ? (
            <p className="text-[11.5px] text-[#344054]">Approving locks the plan as the execution baseline{arc?.sdlc || hasJira ? ' and requests the JIRA workspace for the JIRA-defined milestones' : ''}.</p>
          ) : (
            <label className="block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Comment <span className="text-red-500">*</span></span>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] p-2 text-[11.5px]" /></label>
          )}
        </Modal>
      )}
    </div>
  )
}

/** WBS Task Creation form: fields, owner (tagged resources only), actuals, and inline linked tasks / dependencies. */
function ItemForm({ state, items, rec, archetypeName, tagged, editable, codeOf, onClose, onSave }: {
  state: NonNullable<FormState>
  items: PlanItem[]
  rec: NonNullable<ReturnType<typeof useInitiationStore.getState>['records'][string]>
  archetypeName: string
  tagged: string[]
  editable: boolean
  codeOf: Map<string, string>
  onClose: () => void
  onSave: (it: PlanItem, next: boolean) => void
}) {
  const isNew = state.mode === 'new'
  const [it, setIt] = useState<PlanItem>(state.item)
  const [shown, setShown] = useState(false)
  const [search, setSearch] = useState('')
  const [depOn, setDepOn] = useState('')
  const [depType, setDepType] = useState<DependencyType>('FS')
  const [lag, setLag] = useState(0)
  const set = (p: Partial<PlanItem>) => setIt((x) => ({ ...x, ...p }))
  const errors = itemErrors(it, items)
  // Valid parents: rows one level above this row's level (never itself or something under it).
  const parentLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(it.level) - 1]
  const own = subtreeIds(items, it.id)
  const parents = items.filter((p) => p.level === parentLevel && !own.has(p.id))
  const typeOptions = isNew ? LEVEL_ORDER.filter((l) => l !== 'Milestone') : [it.level]
  const candidates = items
    .filter((p) => p.id !== it.id && canDepend([...items.filter((x) => x.id !== it.id), { ...it, deps: [...it.deps] }], it.id, p.id))
    .filter((p) => !search || `${codeOf.get(p.id) ?? ''} ${p.name}`.toLowerCase().includes(search.toLowerCase()))
  const addDep = () => {
    if (!depOn || it.deps.some((d) => d.onId === depOn)) return
    set({ deps: [...it.deps, { onId: depOn, type: depType, lag: Math.max(0, Math.min(100, lag)) } as PlanDep] })
    setDepOn(''); setLag(0)
  }
  const actualsOn = editable && !!it.owner && TRACKING_MODE === 'Manual'
  const save = (next: boolean) => {
    setShown(true)
    if (Object.keys(errors).length || !it.parentId) return
    onSave({ ...it, name: it.name.trim() }, next)
  }
  return (
    <Modal open onClose={onClose} size="lg" title={isNew ? 'WBS Task Creation' : `${codeOf.get(it.id) ?? ''} ${it.name}`}
      footer={editable ? (<>
        <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
        {isNew && <Button variant="secondary" size="md" onClick={() => save(true)}>Next</Button>}
        <Button variant="primary" size="md" onClick={() => save(false)}>Submit</Button>
      </>) : <Button variant="secondary" size="md" onClick={onClose}>Close</Button>}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Project ID"><input readOnly value={rec.projectId ?? ''} className={inputCls + ' !bg-[#f2f4f7]'} /></Field>
        <Field label="Project Name"><input readOnly value={rec.projectName} className={inputCls + ' !bg-[#f2f4f7]'} /></Field>
        <Field label="Project Type"><input readOnly value={archetypeName} className={inputCls + ' !bg-[#f2f4f7]'} /></Field>
        <Field label="WBS Element Type" required>
          <select value={it.level} disabled={!editable || !isNew} onChange={(e) => set({ level: e.target.value as PlanItem['level'], parentId: undefined })} className={inputCls}>
            {typeOptions.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </select>
        </Field>
        <Field label="WBS Parent" required error={shown && !it.parentId ? 'Select a parent.' : undefined}>
          <select value={it.parentId ?? ''} disabled={!editable} onChange={(e) => set({ parentId: e.target.value || undefined })} className={inputCls}>
            <option value="">Select…</option>{parents.map((p) => <option key={p.id} value={p.id}>{codeOf.get(p.id)} · {p.name}</option>)}
          </select>
        </Field>
        <Field label="Priority"><select value={it.priority} disabled={!editable} onChange={(e) => set({ priority: e.target.value as PlanItem['priority'] })} className={inputCls}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <div className="md:col-span-3"><Field label="WBS Title" required error={shown ? errors.name : undefined}><input value={it.name} maxLength={255} disabled={!editable} onChange={(e) => set({ name: e.target.value })} className={inputCls} /></Field></div>
        <div className="md:col-span-3"><Field label="WBS Description"><textarea value={it.description} rows={2} disabled={!editable} onChange={(e) => set({ description: e.target.value })} className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] p-2 text-[11.5px] disabled:opacity-70" /></Field></div>
        <Field label="Planned Effort (days)"><input type="number" min={0} value={it.effort} disabled={!editable} onChange={(e) => set({ effort: Number(e.target.value) })} className={inputCls} /></Field>
        <Field label="Planned Start Date" required error={shown ? errors.plannedStart : undefined}><input type="date" value={it.plannedStart} disabled={!editable} onChange={(e) => set({ plannedStart: e.target.value })} className={inputCls} /></Field>
        <Field label="Planned Finish Date" required error={shown ? errors.plannedEnd : undefined}><input type="date" value={it.plannedEnd} min={it.plannedStart} disabled={!editable} onChange={(e) => set({ plannedEnd: e.target.value })} className={inputCls} /></Field>
        <Field label="Owner">
          <select value={it.owner ?? ''} disabled={!editable || tagged.length === 0} onChange={(e) => set({ owner: e.target.value || undefined, ...(e.target.value ? {} : { actualStart: undefined, actualEnd: undefined }) })} className={inputCls}>
            <option value="">{tagged.length ? 'Select an owner…' : 'Tag resources first'}</option>{tagged.map((n) => <option key={n}>{n}</option>)}
          </select>
          {it.owner && editable && <span className="mt-1 block text-[10px] text-[var(--color-muted)]">{it.owner} is notified when this is saved.</span>}
        </Field>
        <Field label="Actual Start Date"><input type="date" value={it.actualStart ?? ''} disabled={!actualsOn} title={actualsOn ? undefined : 'Available once an owner is assigned'} onChange={(e) => set({ actualStart: e.target.value || undefined })} className={inputCls} /></Field>
        <Field label="Actual Finish Date" error={shown ? errors.actualEnd : undefined}><input type="date" value={it.actualEnd ?? ''} disabled={!actualsOn} onChange={(e) => set({ actualEnd: e.target.value || undefined })} className={inputCls} /></Field>
        <Field label="Earned Value Weightage (%)" error={shown ? errors.weight : undefined}><input type="number" min={0} max={100} value={it.weight} disabled={!editable} onChange={(e) => set({ weight: Number(e.target.value) })} className={inputCls} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-[11.5px] text-[#344054]"><input type="checkbox" checked={it.locked} disabled={!editable} onChange={(e) => set({ locked: e.target.checked })} /> Lock (no further edits)</label>
      </div>

      <h3 className="mb-2 mt-5 text-[12px] font-semibold text-[#101828]">Linked Tasks / Dependency</h3>
      {it.deps.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {it.deps.map((d) => (
            <span key={d.onId} className="inline-flex items-center gap-2 rounded-full bg-[#eef4ff] px-3 py-1 text-[10.5px] text-primary">
              {d.type} · {codeOf.get(d.onId) ?? '?'} {items.find((x) => x.id === d.onId)?.name}{d.lag ? ` · +${d.lag}d` : ''}
              {editable && <button type="button" aria-label="Remove link" onClick={() => set({ deps: it.deps.filter((x) => x.onId !== d.onId) })} className="text-[var(--color-muted)] hover:text-[var(--color-destructive)]"><Icon name="close" size={11} /></button>}
            </span>
          ))}
        </div>
      )}
      {editable && (
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <p className="mb-2 text-[10.5px] text-[var(--color-muted)]">Dependent task: <strong className="text-[#101828]">{it.name || 'this task'}</strong>. Pick the task it depends on. Links show up in Dependency Management.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Search by WBS ID"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. 1.2" className={inputCls} /></Field>
            <Field label="Predecessor"><select value={depOn} onChange={(e) => setDepOn(e.target.value)} className={inputCls}><option value="">Select…</option>{candidates.map((p) => <option key={p.id} value={p.id}>{codeOf.get(p.id)} · {p.name}</option>)}</select></Field>
            <Field label="Dependency Type"><select value={depType} onChange={(e) => setDepType(e.target.value as DependencyType)} className={inputCls}>{DEP_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></Field>
            <Field label="Lag (days)"><input type="number" min={0} max={100} value={lag} onChange={(e) => setLag(Number(e.target.value))} className={inputCls} /></Field>
          </div>
          <div className="mt-2 flex justify-end"><Button variant="secondary" size="sm" disabled={!depOn} onClick={addDep}>Add</Button></div>
        </div>
      )}
    </Modal>
  )
}
