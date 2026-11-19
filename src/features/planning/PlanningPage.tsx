/**
 * Project Planning landing: the projects each role can act on, with a status-led action instead of a menu.
 *  Project Manager: only their projects. Submit Estimates → Tag Resources → Create WBS → edit / resubmit.
 *  Business Partner: Schedule (simulation). CoE Head: Assign PM, Review Schedule, Review WBS.
 *  Team Member: projects they are tagged to, to view the complete WBS.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Modal, PageHeader } from '../../components'
import { useInitiationStore } from '../../store/initiationStore'
import { useQAStore } from '../../store/qaStore'
import { PROJECT_MANAGERS, fmtCr } from '../../domain/initiation'
import type { PlanningStatus } from '../../domain/planning'
import { PLANNING_STATUS_LABEL, RESOURCE_POOL, planningStatus } from '../../domain/planning'
import { fmtD, programNameOf } from '../initiation/shared'
import type { PlanRole } from './shared'
import { NoPlanAccess, canSeeBudget, canSeeProject, usePlanRole } from './shared'

type ActionKind = 'estimates' | 'schedule' | 'reviewSchedule' | 'tag' | 'assign' | 'wbs' | 'view'
interface Act { label: string; kind: ActionKind; primary: boolean }

function actionFor(role: PlanRole, st: PlanningStatus, hasWbs: boolean, sched?: string): Act {
  const view: Act = { label: hasWbs ? 'View WBS' : 'View', kind: hasWbs ? 'wbs' : 'view', primary: false }
  if (role === 'ProjectManager') {
    if (st === 'EstimatesPending') return { label: 'Submit Estimates', kind: 'estimates', primary: true }
    if (st === 'TaggingPending') return { label: 'Tag Resources', kind: 'tag', primary: true }
    if (st === 'WbsPending') return { label: 'Create WBS', kind: 'wbs', primary: true }
    if (st === 'WbsInProgress' || st === 'WbsSentBack') return { label: 'Open WBS', kind: 'wbs', primary: true }
    return view
  }
  if (role === 'BusinessPartner') {
    // Scheduling does not wait for the Project Manager: their estimates are optional.
    if (!sched || sched === 'Draft') return { label: 'Schedule', kind: 'schedule', primary: true }
    if (st === 'ScheduleSentBack') return { label: 'Revise Schedule', kind: 'schedule', primary: true }
    return { label: 'View', kind: 'schedule', primary: false }
  }
  if (role === 'CoEHead') {
    if (st === 'AwaitingPM') return { label: 'Assign PM', kind: 'assign', primary: true }
    if (st === 'ScheduleSubmitted') return { label: 'Review Schedule', kind: 'reviewSchedule', primary: true }
    if (st === 'WbsSubmitted') return { label: 'Review WBS', kind: 'wbs', primary: true }
    return view
  }
  if (role === 'TeamMember') return { label: 'View WBS', kind: 'wbs', primary: false }
  return view
}

export function PlanningPage() {
  const role = usePlanRole()
  const navigate = useNavigate()
  const { demands, records, programs, assignPm, tagResources } = useInitiationStore()
  const archetypes = useQAStore((s) => s.archetypes)
  const [q, setQ] = useState('')
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const [pm, setPm] = useState('')
  const [tagFor, setTagFor] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])

  const rows = useMemo(() => {
    if (!role) return []
    const t = q.trim().toLowerCase()
    return demands
      .map((d) => ({ d, r: records[d.demandId] }))
      .filter((x) => x.r && canSeeProject(role, x.r))
      .map(({ d, r }) => {
        const sdlc = !!archetypes.find((a) => a.id === r!.projectType)?.sdlc
        const status = planningStatus(r!, sdlc)
        return { d, r: r!, status, act: actionFor(role, status, !!r!.wbs && r!.schedule?.status === 'Approved', r!.schedule?.status) }
      })
      .filter((x) => !t || [x.d.demandId, x.r.projectId, x.r.projectName, x.d.coe, x.d.division, programNameOf(x.r, programs)].some((v) => (v ?? '').toLowerCase().includes(t)))
      // Work waiting for this role first.
      .sort((a, b) => Number(b.act.primary) - Number(a.act.primary) || a.d.demandId.localeCompare(b.d.demandId))
  }, [role, demands, records, archetypes, programs, q])

  if (!role) return (<div><PageHeader title="Project Planning" section="Project" /><NoPlanAccess /></div>)
  const budget = canSeeBudget(role)
  const go = (id: string, a: Act) => {
    if (a.kind === 'estimates') navigate(`/planning/${id}/estimates`)
    else if (a.kind === 'schedule' || a.kind === 'reviewSchedule' || a.kind === 'view') navigate(`/planning/${id}/schedule`)
    else if (a.kind === 'wbs') navigate(`/planning/${id}/wbs`)
    else if (a.kind === 'assign') { setAssignFor(id); setPm(records[id]?.pm ?? '') }
    else if (a.kind === 'tag') { setTagFor(id); setPicked(records[id]?.tagged ?? []) }
  }
  const waiting = rows.filter((x) => x.act.primary).length

  return (
    <div>
      <PageHeader title="Project Planning" section="Project"
        actions={<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search work items" aria-label="Search work items"
          className="h-8 w-56 rounded-lg border border-[var(--color-border)] bg-white px-3 text-[11px] text-[#344054]" />} />
      <p className="mb-3 text-[10.5px] text-[var(--color-muted)]">
        {{ ProjectManager: 'Your projects. The action column shows the next step.', BusinessPartner: 'Projects ready for schedule simulation.', CoEHead: 'Projects awaiting a Project Manager, schedule approval or WBS approval.',
          TeamMember: 'Projects you are tagged to. You can see the complete WBS.', ReleaseManager: 'Projects you are tagged to.', ResourceManager: 'Projects with resource tagging.', GovernanceHead: 'All projects, read-only.', BPHead: 'All projects, read-only.', Admin: 'All projects, read-only.' }[role]}
        {waiting > 0 && role !== 'Admin' && role !== 'BPHead' ? ` ${waiting} waiting for you.` : ''}
      </p>
      <Card flush className="!overflow-visible">
        <div className="table-scroll cta-pin">
          <table className="w-full text-[11.5px]">
            <thead><tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[10.5px] font-medium text-[#344054]">
              {['#', 'Demand ID', 'Proj ID', 'Prog ID', 'Prog Name', 'Proj Name', 'Division', 'CoE', 'Start Date', 'End Date', ...(budget ? ['Budget'] : []), 'Status'].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}
              <th className="px-3 py-3 text-center">Action</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={14} className="px-4 py-10 text-center text-[var(--color-muted)]">{q ? 'No work items match your search.' : 'No projects for you yet.'}</td></tr> : rows.map(({ d, r, status, act }, i) => (
                <tr key={d.demandId} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                  <td className="px-3 py-2.5 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5 font-mono text-[10.5px]">{d.demandId}</td>
                  <td className="px-3 py-2.5 font-mono text-[10.5px]">{r.projectId}</td>
                  <td className="px-3 py-2.5 font-mono text-[10.5px]">{r.programId ?? r.createdProgramId ?? '—'}</td>
                  <td className="px-3 py-2.5">{programNameOf(r, programs)}</td>
                  <td className="px-3 py-2.5 font-medium text-[#101828]">{r.projectName}</td>
                  <td className="px-3 py-2.5">{d.division}</td><td className="px-3 py-2.5">{d.coe}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtD(r.schedule?.plannedStart ?? r.expectedStart)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtD(r.schedule?.plannedEnd ?? r.expectedEnd)}</td>
                  {budget && <td className="px-3 py-2.5 tabular-nums">{fmtCr(d.budget)}</td>}
                  <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${status === 'Baselined' ? 'bg-emerald-100 text-emerald-800' : /SentBack|Rejected/.test(status) ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{PLANNING_STATUS_LABEL[status]}</span></td>
                  <td className="px-3 py-2.5 text-center"><Button variant={act.primary ? 'primary' : 'secondary'} size="sm" className="whitespace-nowrap" onClick={() => go(d.demandId, act)}>{act.label}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {assignFor && (
        <Modal open onClose={() => setAssignFor(null)} size="sm" title={`Assign Project Manager · ${assignFor}`}
          footer={<><Button variant="secondary" size="md" onClick={() => setAssignFor(null)}>Cancel</Button>
            <Button variant="primary" size="md" disabled={!pm} onClick={() => { assignPm(assignFor, pm); setAssignFor(null) }}>Submit</Button></>}>
          <select value={pm} onChange={(e) => setPm(e.target.value)} aria-label="Project Manager" className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11.5px]">
            <option value="">Select…</option>{PROJECT_MANAGERS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Modal>
      )}
      {tagFor && (
        <Modal open onClose={() => setTagFor(null)} size="sm" title={`Tag resources · ${records[tagFor]?.projectId}`}
          footer={<><Button variant="secondary" size="md" onClick={() => setTagFor(null)}>Cancel</Button>
            <Button variant="primary" size="md" disabled={picked.length === 0} onClick={() => { tagResources(tagFor, picked); setTagFor(null) }}>Submit</Button></>}>
          <p className="mb-2 text-[11px] text-[var(--color-muted)]">Only tagged resources can own WBS items. Tagged members see the complete WBS. The Resource Manager is notified.</p>
          <div className="space-y-1.5">
            {RESOURCE_POOL.map((n) => (
              <label key={n} className="flex items-center gap-2 text-[11.5px] text-[#344054]">
                <input type="checkbox" checked={picked.includes(n)} onChange={(e) => setPicked(e.target.checked ? [...picked, n] : picked.filter((x) => x !== n))} /> {n}
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
