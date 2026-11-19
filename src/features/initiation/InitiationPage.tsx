/**
 * Project Initiation landing page. One list, shaped by role:
 *  Business Partner: approved demands with a CoE; row action Create Project / Continue / Edit.
 *  BP Head / Governance Head / CoE Head: their approval queue on top; NPV, IRR and Payback shown to approvers.
 *  Business User: projects with a Project ID; row action Upload BRD.
 * Rows without a Project ID or Program ID come first.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Modal, PageHeader } from '../../components'
import { useInitiationStore } from '../../store/initiationStore'
import { useQAStore } from '../../store/qaStore'
import type { Demand, InitiationRecord, InitRole } from '../../domain/initiation'
import { PROJECT_MANAGERS, canStartProject, fmtCr, fmtPct, summarize } from '../../domain/initiation'
import { INIT_ROLE_LABEL, NoInitAccess, StatusChip, fmtD, programNameOf, useInitRole } from './shared'

interface Row {
  d: Demand
  r?: InitiationRecord
  /** Lower sorts first. */
  rank: number
  action?: { label: string; kind: 'open' | 'assign' | 'brd' | 'view' | 'none'; hint?: string }
}

function actionFor(role: InitRole | 'Admin', d: Demand, r: InitiationRecord | undefined): Row['action'] {
  if (role === 'Admin') return r ? { label: 'View', kind: 'view' } : undefined
  if (role === 'BusinessPartner') {
    if (!r) return canStartProject(d) ? { label: 'Create Project', kind: 'open' } : { label: d.approved ? 'Awaiting CoE' : 'Not approved', kind: 'none', hint: 'A project can be created once the demand is approved and a CoE is assigned.' }
    if (r.status === 'Draft') return { label: 'Continue', kind: 'open' }
    if (r.status === 'SentBack') return { label: 'Edit', kind: 'open' }
    return { label: 'View', kind: 'view' }
  }
  if (!r) return undefined
  if (role === 'BPHead') return r.status === 'PendingBPHead' ? { label: 'Approve', kind: 'open' } : { label: 'View', kind: 'view' }
  if (role === 'GovernanceHead') return r.status === 'PendingGovernance' ? { label: 'Approve', kind: 'open' } : { label: 'View', kind: 'view' }
  if (role === 'CoEHead') {
    if (r.status === 'PendingCoE') return { label: 'Approve', kind: 'open' }
    if (r.status === 'Approved') return { label: r.pm ? 'Change PM' : 'Assign PM', kind: 'assign' }
    return { label: 'View', kind: 'view' }
  }
  // Business User
  return r.brd ? { label: 'View', kind: 'view' } : { label: 'Upload BRD', kind: 'brd' }
}

function rowsFor(role: InitRole | 'Admin', demands: Demand[], records: Record<string, InitiationRecord>): Row[] {
  const out: Row[] = []
  for (const d of demands) {
    const r = records[d.demandId]
    const include =
      role === 'BusinessPartner' || role === 'Admin' ? (role === 'Admin' ? !!r : true)
      : role === 'BPHead' ? !!r && r.status !== 'Draft'
      : role === 'GovernanceHead' ? !!r && r.programMode === 'new' && r.status !== 'Draft'
      : role === 'CoEHead' ? !!r && r.status !== 'Draft' && r.status !== 'PendingBPHead' && !(r.programMode === 'new' && r.status === 'PendingGovernance')
      : !!r?.projectId
    if (!include) continue
    const action = actionFor(role, d, r)
    const needsAction = action?.kind === 'open' || action?.kind === 'assign' || action?.kind === 'brd'
    // Needs action first; then records without Project ID / Program ID; then the rest.
    const noIds = !r?.projectId || !(r.programId ?? r.createdProgramId)
    out.push({ d, r, action, rank: (needsAction ? 0 : 2) + (noIds ? 0 : 1) })
  }
  return out.sort((a, b) => a.rank - b.rank || a.d.demandId.localeCompare(b.d.demandId))
}

export function InitiationPage() {
  const role = useInitRole()
  const navigate = useNavigate()
  const { demands, records, programs, assignPm } = useInitiationStore()
  const { archetypes } = useQAStore()
  const [q, setQ] = useState('')
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const [pm, setPm] = useState('')
  const [justApproved, setJustApproved] = useState('')

  const rows = useMemo(() => (role ? rowsFor(role, demands, records) : []), [role, demands, records])
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(({ d, r }) =>
      [d.demandId, r?.projectId, r?.programId, r?.createdProgramId, d.title, r?.projectName, programNameOf(r, programs), d.division, d.coe].some((x) => (x ?? '').toLowerCase().includes(t)))
  }, [rows, q, programs])

  if (!role) return (<div><PageHeader title="Project Initiation" section="Project" /><NoInitAccess /></div>)
  const showFin = role === 'BPHead' || role === 'CoEHead'
  const waiting = rows.filter((x) => x.action?.kind === 'open' || x.action?.kind === 'assign' || x.action?.kind === 'brd').length
  const hint = {
    BusinessPartner: 'Create Project is available once a demand is approved and a CoE is assigned.',
    BPHead: 'Submitted projects and programs waiting for your review are on top.',
    GovernanceHead: 'New programs waiting for approval are on top. Approval creates the Program ID.',
    CoEHead: 'Projects awaiting approval are on top, then approved projects awaiting a Project Manager.',
    BusinessUser: 'Projects appear here once the Project ID is created. Upload the detailed BRD for each.',
    Admin: 'Read-only view of every initiation record.',
  }[role]
  const arcName = (id: string) => archetypes.find((a) => a.id === id)?.name ?? id

  const act = (row: Row) => {
    const a = row.action
    if (!a || a.kind === 'none') return
    if (a.kind === 'assign') { setAssignFor(row.d.demandId); setPm(row.r?.pm ?? ''); return }
    if (a.kind === 'brd') { navigate(`/initiation/${row.d.demandId}/brd`); return }
    navigate(`/initiation/${row.d.demandId}`)
  }

  return (
    <div>
      <PageHeader title="Project Initiation" section="Project"
        actions={<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search work items" aria-label="Search work items"
          className="h-8 w-56 rounded-lg border border-[var(--color-border)] bg-white px-3 text-[11px] text-[#344054]" />} />
      <p className="mb-3 text-[10.5px] text-[var(--color-muted)]">
        {INIT_ROLE_LABEL[role as InitRole] ?? 'Admin'} · {hint}{waiting > 0 && role !== 'Admin' ? ` ${waiting} waiting for you.` : ''}
      </p>
      {justApproved && <p role="status" className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">{justApproved}</p>}
      <Card flush className="!overflow-visible">
        <div className="table-scroll cta-pin">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[10.5px] font-medium text-[#344054]">
                <th className="px-3 py-3">Demand ID</th><th className="px-3 py-3">Project ID</th><th className="px-3 py-3">Program ID</th>
                <th className="px-3 py-3">Program Name</th><th className="px-3 py-3">Project Name</th><th className="px-3 py-3">Division</th><th className="px-3 py-3">CoE</th>
                {showFin && <><th className="px-3 py-3">NPV</th><th className="px-3 py-3">IRR</th>{role === 'BPHead' && <th className="px-3 py-3">Payback</th>}</>}
                <th className="px-3 py-3">Start Date</th><th className="px-3 py-3">End Date</th>
                {!showFin && <th className="px-3 py-3">Budget</th>}
                {role === 'CoEHead' && <th className="px-3 py-3">Project Manager</th>}
                <th className="px-3 py-3">Status</th><th className="px-3 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={14} className="px-4 py-10 text-center text-[var(--color-muted)]">{q ? 'No work items match your search.' : 'Nothing here yet.'}</td></tr>
              ) : filtered.map((row) => {
                const { d, r, action } = row
                const s = r && r.vcf.levers.length ? summarize(r.vcf) : null
                return (
                  <tr key={d.demandId} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                    <td className="px-3 py-2.5 font-mono text-[10.5px]">{d.demandId}</td>
                    <td className="px-3 py-2.5 font-mono text-[10.5px]">{r?.projectId ?? '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-[10.5px]">{r?.programId ?? r?.createdProgramId ?? '—'}</td>
                    <td className="px-3 py-2.5">{programNameOf(r, programs)}</td>
                    <td className="px-3 py-2.5"><div className="font-medium text-[#101828]">{r?.projectName || d.title}</div>{r?.projectType && <div className="text-[10px] text-[var(--color-muted)]">{arcName(r.projectType)}</div>}</td>
                    <td className="px-3 py-2.5">{d.division}</td>
                    <td className="px-3 py-2.5">{d.coe ?? <span className="text-[var(--color-muted)]">Not assigned</span>}</td>
                    {showFin && <>
                      <td className={`px-3 py-2.5 tabular-nums ${s && s.npv <= 0 ? 'font-semibold text-red-600' : ''}`}>{s ? fmtCr(s.npv) : '—'}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${s && (s.irr === null || s.irr <= 0.14) ? 'font-semibold text-red-600' : ''}`}>{s ? fmtPct(s.irr) : '—'}</td>
                      {role === 'BPHead' && <td className="px-3 py-2.5 tabular-nums">{s?.payback != null ? `${s.payback.toFixed(1)} yrs` : '—'}</td>}
                    </>}
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtD(r?.expectedStart || d.startDate)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtD(r?.expectedEnd || d.endDate)}</td>
                    {!showFin && <td className="px-3 py-2.5 tabular-nums">{fmtCr(d.budget)}</td>}
                    {role === 'CoEHead' && <td className="px-3 py-2.5">{r?.pm ?? <span className="text-[var(--color-muted)]">Not assigned</span>}</td>}
                    <td className="px-3 py-2.5"><StatusChip status={r?.status ?? 'NoProject'} /></td>
                    <td className="px-3 py-2.5 text-center">
                      {action ? (
                        <Button variant={action.kind === 'view' || action.kind === 'none' ? 'secondary' : 'primary'} size="sm" disabled={action.kind === 'none'} title={action.hint}
                          className="whitespace-nowrap" onClick={() => act(row)}>{action.label}</Button>
                      ) : <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {assignFor && (
        <Modal open onClose={() => setAssignFor(null)} size="sm" title={`Assign Project Manager · ${assignFor}`}
          footer={<>
            <Button variant="secondary" size="md" onClick={() => setAssignFor(null)}>Cancel</Button>
            <Button variant="primary" size="md" disabled={!pm} onClick={() => { assignPm(assignFor, pm); setJustApproved(`Project Manager for ${assignFor} set to ${pm}. Planning is under ${pm} from now on.`); setAssignFor(null) }}>Submit</Button>
          </>}>
          <p className="mb-3 text-[11.5px] text-[var(--color-muted)]">The Project Manager can be changed at any stage. Existing approved dates and plans are not affected.</p>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Project Manager <span className="text-red-500">*</span></span>
            <select value={pm} onChange={(e) => setPm(e.target.value)} className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11.5px]">
              <option value="">Select…</option>
              {PROJECT_MANAGERS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </Modal>
      )}
    </div>
  )
}
