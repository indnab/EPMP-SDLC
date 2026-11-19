/**
 * Project Closure landing. The Project Manager sees only closure-eligible projects (baselined plan, every WBS item
 * Completed) and those already in the closure flow. The CoE Head and Governance Head see their approval queues.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, PageHeader } from '../../components'
import { useInitiationStore } from '../../store/initiationStore'
import { CLOSURE_STATUS_CLS, CLOSURE_STATUS_LABEL, closureEligible, closureStatusOf } from '../../domain/closure'
import { PM_USER } from '../../domain/planning'
import { fmtD } from '../initiation/shared'
import { NoPlanAccess, usePlanRole } from '../planning/shared'

export function ClosurePage() {
  const role = usePlanRole()
  const navigate = useNavigate()
  const { demands, records } = useInitiationStore()
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    if (!role) return []
    const t = q.trim().toLowerCase()
    return demands.map((d) => ({ d, r: records[d.demandId] }))
      .filter((x) => x.r?.projectId)
      .filter(({ r }) => {
        const c = r!.closure?.status
        if (role === 'ProjectManager') return r!.pm === PM_USER && (closureEligible(r!) || (!!c && c !== 'Draft') || c === 'Draft')
        if (role === 'CoEHead') return c === 'WithCoE' || c === 'WithGovernance' || c === 'Closed' || c === 'SentBack'
        if (role === 'GovernanceHead') return c === 'WithGovernance' || c === 'Closed'
        return role === 'Admin' && (closureEligible(r!) || !!c)
      })
      .filter(({ d, r }) => !t || [r!.projectId, r!.projectName, d.coe].some((v) => (v ?? '').toLowerCase().includes(t)))
      .map(({ d, r }) => {
        const st = closureStatusOf(r!)
        const act = role === 'ProjectManager' ? (st === 'Eligible' || st === 'Draft' ? 'Start closure' : st === 'SentBack' ? 'Rework' : 'View')
          : role === 'CoEHead' ? (st === 'WithCoE' ? 'Review' : 'View') : role === 'GovernanceHead' ? (st === 'WithGovernance' ? 'Review' : 'View') : 'View'
        return { d, r: r!, st, act }
      })
      .sort((a, b) => Number(b.act !== 'View') - Number(a.act !== 'View') || (a.r.projectId ?? '').localeCompare(b.r.projectId ?? ''))
  }, [role, demands, records, q])

  if (!role) return (<div><PageHeader title="Project Closure" section="Project" /><NoPlanAccess /></div>)
  const hint = {
    ProjectManager: 'Only projects that are ready to close are listed: the plan is baselined and every WBS item is Completed.',
    CoEHead: 'Closure packages submitted by Project Managers for your review.',
    GovernanceHead: 'Closure packages approved by the CoE Head, waiting for final approval.',
  }[role as 'ProjectManager' | 'CoEHead' | 'GovernanceHead'] ?? 'Read-only.'
  return (
    <div>
      <PageHeader title="Project Closure" section="Project"
        actions={<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search work items" aria-label="Search work items"
          className="h-8 w-56 rounded-lg border border-[var(--color-border)] bg-white px-3 text-[11px] text-[#344054]" />} />
      <p className="mb-3 text-[10.5px] text-[var(--color-muted)]">{hint}</p>
      <Card flush className="!overflow-visible">
        <div className="table-scroll cta-pin">
          <table className="w-full text-[11.5px]">
            <thead><tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[10.5px] font-medium text-[#344054]">
              {['Project ID', 'Project Name', 'CoE', 'Start Date', 'End Date', 'Closure Status'].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}
              <th className="px-3 py-3 text-center">Action</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--color-muted)]">{q ? 'No work items match your search.' : role === 'ProjectManager' ? 'No projects are ready to close yet.' : 'Nothing waiting for you.'}</td></tr> : rows.map(({ d, r, st, act }) => (
                <tr key={d.demandId} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                  <td className="px-3 py-2.5"><Link to={`/closure/${d.demandId}`} className="font-mono text-[10.5px] font-semibold text-[var(--color-accent)] underline">{r.projectId}</Link></td>
                  <td className="px-3 py-2.5 font-medium text-[#101828]">{r.projectName}</td>
                  <td className="px-3 py-2.5">{d.coe}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtD(r.schedule?.plannedStart)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtD(r.schedule?.plannedEnd)}</td>
                  <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${CLOSURE_STATUS_CLS[st]}`}>{CLOSURE_STATUS_LABEL[st]}</span></td>
                  <td className="px-3 py-2.5 text-center"><Button variant={act === 'View' ? 'secondary' : 'primary'} size="sm" className="whitespace-nowrap" onClick={() => navigate(`/closure/${d.demandId}`)}>{act}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
