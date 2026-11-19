/**
 * Project Execution landing.
 *  Project Manager: Resource Tagging worklist (opens the existing tagging dialog) and Manage WBS.
 *  Resource Manager: reviews tagging requests. CoE Head: Manage Projects with Actions > Change PM.
 *  Team Member / Release Manager: their projects. The list opens in "Me" mode.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Modal, PageHeader } from '../../components'
import { Icon } from '../../components/Icon'
import { useInitiationStore } from '../../store/initiationStore'
import { useQAStore } from '../../store/qaStore'
import { PROJECT_MANAGERS } from '../../domain/initiation'
import type { InitiationRecord } from '../../domain/initiation'
import type { TagRow } from '../../domain/execution'
import { RESOURCES, UTILIZATIONS, tagErrors } from '../../domain/execution'
import { PM_USER, taggedOf } from '../../domain/planning'
import { cellCls, fmtD, inputCls, programNameOf } from '../initiation/shared'
import { NoPlanAccess, canSeeProject, usePlanRole } from '../planning/shared'

type Act = { label: string; kind: 'tag' | 'wbs' | 'review' | 'changePm' | 'view'; primary: boolean }
const uid = () => `tg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

function execStatus(r: InitiationRecord): string {
  if (r.closure?.status === 'Closed') return 'Closed'
  if (r.tagging?.status === 'Submitted') return 'Tagging with Resource Manager'
  if (r.tagging?.status === 'SentBack') return 'Tagging sent back'
  if (taggedOf(r).length === 0) return 'Resource tagging pending'
  return 'In execution'
}

export function ExecutionPage() {
  const role = usePlanRole()
  const navigate = useNavigate()
  const { demands, records, programs, submitTagging, decideTagging, changePm } = useInitiationStore()
  const archetypes = useQAStore((s) => s.archetypes)
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'me' | 'all'>('me')
  const [tagFor, setTagFor] = useState<string | null>(null)
  const [pmFor, setPmFor] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!role) return []
    const t = q.trim().toLowerCase()
    return demands.map((d) => ({ d, r: records[d.demandId] }))
      // Only projects in the execution setup state: the schedule is approved.
      .filter((x) => x.r?.projectId && x.r.schedule?.status === 'Approved')
      .filter((x) => (mode === 'all' ? true : canSeeProject(role, x.r!)))
      .filter((x) => role !== 'ResourceManager' || mode === 'all' || !!x.r!.tagging)
      .filter((x) => !t || [x.d.demandId, x.r!.projectId, x.r!.projectName, x.d.coe, programNameOf(x.r, programs)].some((v) => (v ?? '').toLowerCase().includes(t)))
      .map(({ d, r }) => {
        const rec = r!
        const status = execStatus(rec)
        let act: Act = { label: rec.wbs ? 'View WBS' : 'View', kind: rec.wbs ? 'wbs' : 'view', primary: false }
        if (role === 'ProjectManager' && rec.pm === PM_USER) {
          act = taggedOf(rec).length === 0 || rec.tagging?.status === 'SentBack' ? { label: 'Tag Resources', kind: 'tag', primary: true } : { label: 'Manage WBS', kind: 'wbs', primary: true }
        } else if (role === 'ResourceManager' && rec.tagging?.status === 'Submitted') act = { label: 'Review', kind: 'review', primary: true }
        else if (role === 'CoEHead') act = { label: 'Change PM', kind: 'changePm', primary: false }
        else if (role === 'TeamMember' || role === 'ReleaseManager') act = { label: 'Open WBS', kind: 'wbs', primary: true }
        return { d, r: rec, status, act }
      })
      .sort((a, b) => Number(b.act.primary) - Number(a.act.primary) || a.d.demandId.localeCompare(b.d.demandId))
  }, [role, demands, records, programs, q, mode])

  if (!role) return (<div><PageHeader title="Project Execution" section="Project" /><NoPlanAccess /></div>)
  const actualStart = (r: InitiationRecord) => (r.wbs?.items ?? []).map((i) => i.actualStart).filter(Boolean).sort()[0]
  const arcName = (id: string) => archetypes.find((a) => a.id === id)?.name ?? id
  const go = (id: string, a: Act) => {
    if (a.kind === 'tag' || a.kind === 'review') setTagFor(id)
    else if (a.kind === 'changePm') setPmFor(id)
    else if (a.kind === 'wbs') navigate(`/execution/${id}`)
    else setTagFor(id)
  }

  return (
    <div>
      <PageHeader title="Project Execution" section="Project"
        actions={<>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'me' | 'all')} aria-label="List filter" className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[10.5px] text-[#344054]">
            <option value="me">Me</option><option value="all">All projects</option>
          </select>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search work items" aria-label="Search work items"
            className="h-8 w-56 rounded-lg border border-[var(--color-border)] bg-white px-3 text-[11px] text-[#344054]" />
        </>} />
      <p className="mb-3 text-[10.5px] text-[var(--color-muted)]">
        {{ ProjectManager: 'Tag resources, then manage the WBS: owners and status.', ResourceManager: 'Tagging requests from Project Managers.', CoEHead: 'Manage Projects. Change the Project Manager from Actions.',
          TeamMember: 'Projects you are tagged to.', ReleaseManager: 'Projects you are tagged to.', Admin: 'Read-only.', BusinessPartner: 'Read-only.', BPHead: 'Read-only.', GovernanceHead: 'Read-only.' }[role]}
        {mode === 'all' && role !== 'Admin' ? ' Showing all projects (view only unless you own them).' : ''}
      </p>
      <Card flush className="!overflow-visible">
        <div className="table-scroll cta-pin">
          <table className="w-full text-[11.5px]">
            <thead><tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[10.5px] font-medium text-[#344054]">
              {['Program Name', 'Business Vertical', 'Program ID', 'Project ID', 'Project Name', 'CoE', 'Project Manager', 'Expected Start', 'Actual Start', 'Status'].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}
              <th className="px-3 py-3 text-center">Actions</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={11} className="px-4 py-10 text-center text-[var(--color-muted)]">{q ? 'No work items match your search.' : 'No projects in execution setup for you.'}</td></tr> : rows.map(({ d, r, status, act }) => (
                <tr key={d.demandId} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                  <td className="px-3 py-2.5">{programNameOf(r, programs)}</td>
                  <td className="px-3 py-2.5">{programs.find((p) => p.programId === r.programId)?.businessVertical ?? r.newProgram.businessVertical ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-[10.5px]">{r.programId ?? r.createdProgramId ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-[10.5px]">{r.projectId}</td>
                  <td className="px-3 py-2.5"><div className="font-medium text-[#101828]">{r.projectName}</div><div className="text-[10px] text-[var(--color-muted)]">{arcName(r.projectType)}</div></td>
                  <td className="px-3 py-2.5">{d.coe}</td>
                  <td className="px-3 py-2.5">{r.pm ?? '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtD(r.schedule?.plannedStart)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtD(actualStart(r))}</td>
                  <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${status === 'In execution' ? 'bg-blue-100 text-blue-800' : status === 'Closed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{status}</span></td>
                  <td className="px-3 py-2.5 text-center"><Button variant={act.primary ? 'primary' : 'secondary'} size="sm" className="whitespace-nowrap" onClick={() => go(d.demandId, act)}>{act.label}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {tagFor && records[tagFor] && (
        <TaggingDialog rec={records[tagFor]} canEdit={role === 'ProjectManager' && records[tagFor].pm === PM_USER} isReviewer={role === 'ResourceManager'}
          onClose={() => setTagFor(null)}
          onSubmit={(rows) => { submitTagging(tagFor, rows); setTagFor(null) }}
          onDecide={(d, c) => { decideTagging(tagFor, d, c); setTagFor(null) }} />
      )}
      {pmFor && records[pmFor] && <ChangePmDialog rec={records[pmFor]} onClose={() => setPmFor(null)} onSave={(pm, reason) => { changePm(pmFor, pm, reason); setPmFor(null) }} />}
    </div>
  )
}

/** The existing resource assignment dialog: search by skill type, tag resources with dates and 50% / 100% allocation. */
function TaggingDialog({ rec, canEdit, isReviewer, onClose, onSubmit, onDecide }: {
  rec: InitiationRecord; canEdit: boolean; isReviewer: boolean
  onClose: () => void
  onSubmit: (rows: TagRow[]) => void
  onDecide: (d: 'approve' | 'sendBack', comment: string) => void
}) {
  const start = rec.schedule?.plannedStart ?? rec.expectedStart
  const end = rec.schedule?.plannedEnd ?? rec.expectedEnd
  const [rows, setRows] = useState<TagRow[]>(rec.tagging?.rows ?? [])
  const [skill, setSkill] = useState('')
  const [resId, setResId] = useState('')
  const [from, setFrom] = useState(start)
  const [to, setTo] = useState(end)
  const [util, setUtil] = useState<50 | 100>(100)
  const [comment, setComment] = useState('')
  const [shown, setShown] = useState(false)
  const skills = [...new Set(RESOURCES.map((r) => r.skill))]
  const pool = RESOURCES.filter((r) => (!skill || r.skill === skill) && !rows.some((x) => x.resourceId === r.id) && !taggedOf(rec).includes(r.name))
  const res = RESOURCES.find((r) => r.id === resId)
  const counts = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.skill]: (m[r.skill] ?? 0) + 1 }), {})
  const errors = tagErrors(rows)
  const pending = rows.filter((r) => !r.approved)
  const add = () => {
    if (!res || !from || !to || to < from) return
    setRows([...rows, { id: uid(), skill: res.skill, resourceId: res.id, name: res.name, designation: res.designation, start: from, end: to, utilization: util, approved: false }])
    setResId('')
  }
  const patch = (id: string, p: Partial<TagRow>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const reviewing = isReviewer && rec.tagging?.status === 'Submitted'
  return (
    <Modal open onClose={onClose} size="lg" title={`Resource tagging · ${rec.projectId}`}
      footer={reviewing ? (<>
        <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
        <Button variant="secondary" size="md" disabled={!comment.trim()} onClick={() => onDecide('sendBack', comment.trim())}>Send back</Button>
        <Button variant="primary" size="md" onClick={() => onDecide('approve', '')}>Approve</Button>
      </>) : canEdit ? (<>
        <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="md" disabled={pending.length === 0} onClick={() => { setShown(true); if (Object.keys(errors).length === 0) onSubmit(rows) }}>Submit</Button>
      </>) : <Button variant="secondary" size="md" onClick={onClose}>Close</Button>}>
      <p className="mb-3 text-[11px] text-[var(--color-muted)]">
        {reviewing ? 'Review the requested resources. Approving tags them to the project.' : 'Search the resource pool by skill type. Submitting notifies the Resource Manager for approval. You can tag more team members later.'}
        {rec.tagging?.status === 'SentBack' && rec.tagging.lastComment ? ` Sent back: ${rec.tagging.lastComment}` : ''}
      </p>
      {canEdit && (
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-[#f8faff] p-3 md:grid-cols-6">
          <label className="block md:col-span-2"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Skill Type</span>
            <select value={skill} onChange={(e) => { setSkill(e.target.value); setResId('') }} className={inputCls}><option value="">All skills</option>{skills.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="block md:col-span-2"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Resource Name / ID</span>
            <select value={resId} onChange={(e) => setResId(e.target.value)} className={inputCls}><option value="">Select…</option>{pool.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.name}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Start Date</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">End Date</span><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Allocation</span>
            <select value={util} onChange={(e) => setUtil(Number(e.target.value) as 50 | 100)} className={inputCls}>{UTILIZATIONS.map((u) => <option key={u} value={u}>{u}%</option>)}</select></label>
          <div className="flex items-end text-[10.5px] text-[var(--color-muted)] md:col-span-3">{res ? `${res.skill} · ${res.designation}` : ''}</div>
          <div className="flex items-end justify-end md:col-span-2"><Button variant="secondary" size="md" disabled={!res || !from || !to || to < from} onClick={add}><Icon name="circle-plus" size={14} /> Add resource</Button></div>
        </div>
      )}
      {Object.keys(counts).length > 0 && (
        <p className="mb-2 flex flex-wrap items-center gap-2 text-[10.5px] text-[#344054]">Resource count by skill type:
          {Object.entries(counts).map(([k, v]) => <span key={k} className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-primary">{k}: {v}</span>)}</p>
      )}
      <div className="table-scroll rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-[11.5px]">
          <thead><tr className="bg-[#dce8fb] text-left text-[10.5px] font-medium text-[#344054]">
            {['Resource', 'Skill Type', 'Role', 'Start', 'End', 'Allocation', 'Status'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}{canEdit && <th className="w-8" />}
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-5 text-center text-[var(--color-muted)]">No resources tagged yet.</td></tr>}
            {rows.map((r, i) => {
              const edit = canEdit && !r.approved
              return (
                <tr key={r.id} className="border-t border-[var(--color-border)] align-top">
                  <td className="px-3 py-2">{r.resourceId} · {r.name}</td><td className="px-3 py-2">{r.skill || '—'}</td><td className="px-3 py-2">{r.designation || '—'}</td>
                  <td className="px-2 py-1.5"><input type="date" value={r.start} disabled={!edit} aria-label={`Start ${i + 1}`} onChange={(e) => patch(r.id, { start: e.target.value })} className={cellCls} /></td>
                  <td className="px-2 py-1.5"><input type="date" value={r.end} min={r.start} disabled={!edit} aria-label={`End ${i + 1}`} onChange={(e) => patch(r.id, { end: e.target.value })} className={cellCls} />{shown && errors[`${i}.end`] && <span className="text-[10px] text-red-600">{errors[`${i}.end`]}</span>}</td>
                  <td className="px-2 py-1.5"><select value={r.utilization} disabled={!edit} aria-label={`Allocation ${i + 1}`} onChange={(e) => patch(r.id, { utilization: Number(e.target.value) as 50 | 100 })} className={cellCls}>{UTILIZATIONS.map((u) => <option key={u} value={u}>{u}%</option>)}</select></td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.approved ? 'Tagged' : 'Awaiting approval'}</span></td>
                  {canEdit && <td className="px-1">{!r.approved && <button type="button" aria-label={`Remove ${r.name}`} onClick={() => setRows(rows.filter((x) => x.id !== r.id))} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-destructive)]"><Icon name="close" size={14} /></button>}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {reviewing && (
        <label className="mt-3 block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Comment (required to send back)</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] p-2 text-[11.5px]" /></label>
      )}
    </Modal>
  )
}

/** CoE Head: change the Project Manager. Allowed after baseline approval; the baseline and plan stay as they are. */
function ChangePmDialog({ rec, onClose, onSave }: { rec: InitiationRecord; onClose: () => void; onSave: (pm: string, reason: string) => void }) {
  const [pm, setPm] = useState(rec.pm ?? '')
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const closed = rec.closure?.status === 'Closed'
  return (
    <>
      <Modal open onClose={onClose} size="md" title={`Change Project Manager · ${rec.projectId}`}
        footer={<><Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" disabled={closed || !pm || pm === rec.pm} onClick={() => setConfirm(true)}>Change PM</Button></>}>
        <p className="mb-3 text-[11.5px] text-[#344054]">Current Project Manager: <strong>{rec.pm ?? 'none'}</strong>. The approved baseline dates and plan do not change.</p>
        {closed && <p className="mb-3 text-[11px] text-amber-800">The project is closed, so the Project Manager cannot be changed.</p>}
        <label className="mb-3 block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">New Project Manager <span className="text-red-500">*</span></span>
          <select value={pm} onChange={(e) => setPm(e.target.value)} className={inputCls}><option value="">Select…</option>{PROJECT_MANAGERS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="mb-3 block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Reason (optional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></label>
        {(rec.pmHistory?.length ?? 0) > 0 && (
          <div><h4 className="m-0 mb-1 text-[11px] font-semibold text-[#101828]">Audit history</h4>
            <ul className="space-y-0.5 text-[10.5px] text-[#344054]">{[...(rec.pmHistory ?? [])].reverse().map((h, i) => <li key={i}>{fmtD(h.at)} · <strong>{h.pm}</strong> set by {h.by}{h.reason ? ` (${h.reason})` : ''}</li>)}</ul></div>
        )}
      </Modal>
      {confirm && (
        <Modal open onClose={() => setConfirm(false)} size="sm" title="Change the Project Manager?"
          footer={<><Button variant="secondary" size="md" onClick={() => setConfirm(false)}>No</Button><Button variant="primary" size="md" onClick={() => onSave(pm, reason.trim())}>Yes</Button></>}>
          <p className="text-[11.5px] text-[#344054]">{pm} takes over the project and its landing view. {rec.pm} loses it. The baseline stays approved.</p>
        </Modal>
      )}
    </>
  )
}
