/**
 * Project Planning → Schedule (simulation). The Business Partner compares the Project Manager's estimates with their own,
 * simulates against other running projects, and submits the planned start and end. Submitting locks the PM's estimates.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Modal, PageHeader } from '../../components'
import { Icon } from '../../components/Icon'
import { useInitiationStore } from '../../store/initiationStore'
import type { EstRow, SimResult } from '../../domain/initiation'
import { SEED_ONGOING, SKILLSETS, durationDays, estimateErrors, fmtCr, simulate, toIso, toMs, uid } from '../../domain/initiation'
import { cellCls, fmtD, inputCls } from '../initiation/shared'
import { NoPlanAccess, usePlanRole } from './shared'

const DAY = 86400000
const th = 'px-3 py-2.5 text-left text-[10.5px] font-medium text-[#344054]'

export function SchedulePage() {
  const { demandId = '' } = useParams<{ demandId: string }>()
  const role = usePlanRole()
  const navigate = useNavigate()
  const { demands, records, saveSchedule, decideSchedule } = useInitiationStore()
  const demand = demands.find((d) => d.demandId === demandId)
  const rec = records[demandId]

  const [rows, setRows] = useState<EstRow[]>(rec?.bpEstimates ?? [])
  const [usedPm, setUsedPm] = useState(rec?.schedule?.usedPmEstimates ?? false)
  const [sim, setSim] = useState<SimResult | null>(null)
  const [start, setStart] = useState(rec?.schedule?.plannedStart ?? '')
  const [end, setEnd] = useState(rec?.schedule?.plannedEnd ?? '')
  const [showErrors, setShowErrors] = useState(false)
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [decision, setDecision] = useState<null | 'approve' | 'sendBack' | 'reject'>(null)
  const [comment, setComment] = useState('')

  // Running projects other than this one: the sample list plus other approved initiation projects.
  const others = useMemo(() => {
    const fromStore = Object.values(records)
      .filter((r) => r.projectId && r.demandId !== demandId)
      .map((r) => {
        const d = demands.find((x) => x.demandId === r.demandId)
        return { projectId: r.projectId!, name: r.projectName, budget: d?.budget ?? 0, status: 'Ongoing', start: r.schedule?.plannedStart ?? r.expectedStart, end: r.schedule?.plannedEnd ?? r.expectedEnd, load: 0.4 }
      })
      .filter((p) => p.start && p.end)
    return [...SEED_ONGOING, ...fromStore]
  }, [records, demands, demandId])

  if (!role) return (<div><PageHeader title="Schedule" section="Project Planning" /><NoPlanAccess /></div>)
  if (!demand || !rec?.projectId) {
    return (
      <div className="py-20 text-center text-[var(--color-muted)]">
        <p className="font-medium">Scheduling opens once the Project ID is created.</p>
        <Link to="/planning" className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline">← Back to Project Planning</Link>
      </div>
    )
  }

  const st = rec.schedule?.status
  const locked = st === 'Submitted' || st === 'Approved' || st === 'Rejected'
  const editable = role === 'BusinessPartner' && !locked
  // The CoE Head reviews a submitted schedule: they may adjust the planned dates, then decide.
  const reviewing = role === 'CoEHead' && st === 'Submitted'
  const pm = rec.pmEstimates ?? []
  const errors = estimateErrors(rows)
  const startError = !start ? 'Run the simulation to get a start date.' : sim && start < sim.earliestStart ? `Earliest available start is ${fmtD(sim.earliestStart)}.` : ''
  const endError = !end ? 'Enter an end date.' : end < start ? 'End is before start.' : ''

  // Any change to the estimates makes the last simulation stale.
  const edit = (next: EstRow[]) => { setRows(next); setSim(null); setMessage('') }
  const setRow = (id: string, p: Partial<EstRow>) => edit(rows.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const addRow = () => edit([...rows, { id: uid('be'), skillset: '', resources: 1, utilization: 100, from: rec.expectedStart, to: rec.expectedEnd }])
  const movePm = () => {
    // Days become a date range starting at the project's expected start.
    edit(pm.map((r) => ({ id: uid('be'), skillset: r.skillset, resources: r.headcount, utilization: r.utilization, from: rec.expectedStart, to: toIso(toMs(rec.expectedStart) + (r.days - 1) * DAY) })))
    setUsedPm(true)
  }

  const runSim = () => {
    setShowErrors(true)
    if (Object.keys(errors).length) return
    const r = simulate(rows, others)
    setSim(r)
    // Planned dates follow the simulation: the earliest start, held for the estimated duration.
    setStart(r.earliestStart)
    setEnd(toIso(toMs(r.earliestStart) + (r.durationDays - 1) * DAY))
    setMessage('')
  }
  const persist = (submit: boolean) => saveSchedule(demandId, rows, { plannedStart: start, plannedEnd: end, earliestStart: sim?.earliestStart ?? rec.schedule?.earliestStart, status: 'Draft', usedPmEstimates: usedPm }, submit)
  const draft = () => { persist(false); setMessage('Draft saved.') }
  const trySubmit = () => {
    setShowErrors(true)
    if (Object.keys(errors).length) return
    if (!sim) { setMessage('Run the simulation before submitting.'); return }
    if (startError || endError) return
    setConfirm(true)
  }

  return (
    <div className="pb-24">
      <PageHeader title="Schedule" section="Project Planning" crumb={`${rec.projectId} · Schedule`} />
      <h1 className="mb-1 text-[20px] font-semibold text-[#101828]">Schedule</h1>
      <p className="mb-3 text-[11px] text-[var(--color-muted)]">{rec.projectId} · {rec.projectName}{st === 'Approved' ? ' · approved' : st === 'Rejected' ? ' · rejected' : st === 'Submitted' ? ' · submitted, the Project Manager\'s estimates are locked' : ''}</p>

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Project Manager's estimates (reference, never editable here) */}
          <section aria-label="Project Manager's Estimates">
            <h2 className="m-0 mb-3 text-[13px] font-semibold text-[#101828]">Project Manager's Estimates</h2>
            <div className="table-scroll rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-[11.5px]">
                <thead><tr className="bg-[#dce8fb]"><th className={th}>Skillset</th><th className={th}>Resources</th><th className={th}>Utilization (%)</th><th className={th}>Duration (Days)</th></tr></thead>
                <tbody>
                  {pm.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-[var(--color-muted)]">No estimates from the Project Manager{rec.pm ? ` (${rec.pm})` : ''}. You can use your own.</td></tr>
                  ) : pm.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--color-border)] bg-[#f4f5f8] text-[#475467]">
                      <td className="px-3 py-2.5">{r.skillset}</td><td className="px-3 py-2.5 tabular-nums">{r.headcount}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.utilization}</td><td className="px-3 py-2.5 tabular-nums">{r.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Business Partner's own estimates */}
          <section aria-label="My Estimates">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="m-0 mr-auto text-[13px] font-semibold text-[#101828]">My Estimates</h2>
              {editable && (
                <>
                  <button type="button" onClick={movePm} disabled={pm.length === 0} title={pm.length === 0 ? 'The Project Manager has not submitted estimates' : "Copy the Project Manager's estimates into My Estimates"}
                    className="rounded-full border border-[var(--color-primary)] px-3 py-1 text-[10.5px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
                    » Move Project Manager's Estimates
                  </button>
                  <button type="button" onClick={addRow}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)] px-3 py-1 text-[10.5px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-secondary)]">
                    <Icon name="circle-plus" size={13} /> Add Skillset
                  </button>
                </>
              )}
            </div>
            <div className="table-scroll rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-[11.5px]">
                <thead><tr className="bg-[#dce8fb]">
                  <th className={th + ' min-w-[130px]'}>Skillset</th><th className={th + ' w-20'}>Resources</th><th className={th + ' w-20'}>Utilization (%)</th>
                  <th className={th + ' w-36'}>From</th><th className={th + ' w-36'}>To</th><th className={th + ' w-20'}>Duration (Days)</th>{editable && <th className="w-8" />}
                </tr></thead>
                <tbody>
                  {showErrors && errors._rows && <tr><td colSpan={7} className="px-3 py-2 text-[10.5px] text-red-600">{errors._rows}</td></tr>}
                  {rows.length === 0 && !(showErrors && errors._rows) && <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--color-muted)]">No estimates yet. Add a skillset{pm.length ? " or move the Project Manager's estimates" : ''}.</td></tr>}
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-t border-[var(--color-border)] align-top">
                      <td className="px-2 py-1.5"><select value={r.skillset} disabled={!editable} aria-label={`Skillset ${i + 1}`} onChange={(e) => setRow(r.id, { skillset: e.target.value })} className={cellCls}>
                        <option value="">Select…</option>{[...new Set([...SKILLSETS, r.skillset].filter(Boolean))].map((s) => <option key={s}>{s}</option>)}</select>
                        {showErrors && errors[`${i}.skillset`] && <span className="text-[10px] text-red-600">{errors[`${i}.skillset`]}</span>}</td>
                      <td className="px-2 py-1.5"><input type="number" min={1} value={r.resources || ''} disabled={!editable} aria-label={`Resources ${i + 1}`} onChange={(e) => setRow(r.id, { resources: Number(e.target.value) })} className={cellCls} />
                        {showErrors && errors[`${i}.resources`] && <span className="text-[10px] text-red-600">{errors[`${i}.resources`]}</span>}</td>
                      <td className="px-2 py-1.5"><input type="number" min={1} max={100} value={r.utilization || ''} disabled={!editable} aria-label={`Utilization ${i + 1}`} onChange={(e) => setRow(r.id, { utilization: Number(e.target.value) })} className={cellCls} />
                        {showErrors && errors[`${i}.utilization`] && <span className="text-[10px] text-red-600">{errors[`${i}.utilization`]}</span>}</td>
                      <td className="px-2 py-1.5"><input type="date" value={r.from} disabled={!editable} aria-label={`From ${i + 1}`} onChange={(e) => setRow(r.id, { from: e.target.value })} className={cellCls} /></td>
                      <td className="px-2 py-1.5"><input type="date" value={r.to} min={r.from} disabled={!editable} aria-label={`To ${i + 1}`} onChange={(e) => setRow(r.id, { to: e.target.value })} className={cellCls} />
                        {showErrors && errors[`${i}.to`] && <span className="text-[10px] text-red-600">{errors[`${i}.to`]}</span>}</td>
                      <td className="px-2 py-2.5 tabular-nums">{durationDays(r.from, r.to) || '—'}</td>
                      {editable && <td className="px-1 py-1.5"><button type="button" aria-label={`Delete row ${i + 1}`} onClick={() => edit(rows.filter((x) => x.id !== r.id))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[#fef2f2] hover:text-[var(--color-destructive)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editable && <div className="mt-3 flex justify-end"><Button variant="primary" size="md" className="!rounded-full" onClick={runSim}>Simulate</Button></div>}
          </section>
        </div>
      </Card>

      <Card className="mb-4">
        <label className="block max-w-xs">
          <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Earliest available project start date</span>
          <input readOnly value={sim ? fmtD(sim.earliestStart) : rec.schedule?.earliestStart ? fmtD(rec.schedule.earliestStart) : ''} placeholder="Run Simulate" aria-label="Earliest available project start date" className={inputCls + ' !bg-[#f2f4f7]'} />
        </label>
        <h3 className="m-0 mb-2 mt-5 text-[13px] font-semibold text-[#101828]">Conflicting Projects</h3>
        <div className="table-scroll rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-[11.5px]">
            <thead><tr className="bg-[#dce8fb]"><th className={th + ' w-12'}>No.</th><th className={th}>Project ID</th><th className={th}>Project Name</th><th className={th}>Budget</th><th className={th}>Status</th><th className={th}>Conflict Percentage</th></tr></thead>
            <tbody>
              {!sim ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">Run the simulation to see conflicting projects.</td></tr>
              ) : sim.conflicts.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-emerald-700">No conflicts. The estimated window is free.</td></tr>
              ) : sim.conflicts.map((c, i) => (
                <tr key={c.projectId} className="border-t border-[var(--color-border)] bg-[#f8faff]">
                  <td className="px-3 py-2.5">{i + 1}</td>
                  <td className="px-3 py-2.5">Project ID: {c.projectId}</td>
                  <td className="px-3 py-2.5">{c.name}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmtCr(c.budget)}</td>
                  <td className="px-3 py-2.5"><span className="rounded border border-[#bfdbfe] bg-[#eef4ff] px-2 py-0.5 text-[10px] text-primary">{c.status}</span></td>
                  <td className={`px-3 py-2.5 tabular-nums ${c.conflictPct >= 30 ? 'font-semibold text-red-600' : ''}`}>{c.conflictPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mb-4 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Planned Start Date <span className="text-red-500">*</span></span>
          <input type="date" value={start} min={sim?.earliestStart} disabled={!editable && !reviewing} onChange={(e) => setStart(e.target.value)} className={inputCls} />
          {showErrors && startError && <span className="mt-1 block text-[10.5px] text-red-600">{startError}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Planned End Date <span className="text-red-500">*</span></span>
          <input type="date" value={end} min={start} disabled={!editable && !reviewing} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
          {showErrors && endError && <span className="mt-1 block text-[10.5px] text-red-600">{endError}</span>}
        </label>
      </div>
      {st === 'SentBack' && rec.schedule?.lastComment && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900"><strong>Sent back:</strong> {rec.schedule.lastComment}</p>}
      {st === 'Rejected' && rec.schedule?.lastComment && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800"><strong>Rejected:</strong> {rec.schedule.lastComment}</p>}
      {message && <p role="status" className="mb-3 text-[11px] text-[#344054]">{message}</p>}

      <div className="fixed bottom-0 right-0 z-30 flex justify-end gap-3 border-t border-[var(--color-border)] bg-white/90 px-7 py-3 backdrop-blur left-0 lg:left-[var(--nav-w)]">
        {editable && <Button variant="secondary" size="md" className="!rounded-full" onClick={draft}>Save as Draft</Button>}
        <Button variant="secondary" size="md" className="!rounded-full" onClick={() => navigate('/planning')}>{editable ? 'Cancel' : 'Back'}</Button>
        {editable && <Button variant="primary" size="md" className="!rounded-full" onClick={trySubmit}>Submit</Button>}
        {reviewing && (
          <>
            <Button variant="secondary" size="md" className="!rounded-full" onClick={() => { setComment(''); setDecision('reject') }}>Reject</Button>
            <Button variant="secondary" size="md" className="!rounded-full" onClick={() => { setComment(''); setDecision('sendBack') }}>Send Back</Button>
            <Button variant="primary" size="md" className="!rounded-full" disabled={!start || !end || end < start} onClick={() => setDecision('approve')}>Approve</Button>
          </>
        )}
      </div>

      {decision && (
        <Modal open onClose={() => setDecision(null)} size="sm" title={decision === 'approve' ? 'Approve the schedule?' : decision === 'sendBack' ? 'Send back for changes' : 'Reject the schedule'}
          footer={<><Button variant="secondary" size="md" onClick={() => setDecision(null)}>{decision === 'approve' ? 'No' : 'Cancel'}</Button>
            <Button variant="primary" size="md" disabled={decision !== 'approve' && !comment.trim()}
              onClick={() => { decideSchedule(demandId, decision, comment.trim(), { plannedStart: start, plannedEnd: end }); navigate('/planning') }}>{decision === 'approve' ? 'Yes' : decision === 'sendBack' ? 'Send back' : 'Reject'}</Button></>}>
          {decision === 'approve' ? (
            <p className="text-[11.5px] text-[#344054]">Planned {fmtD(start)} to {fmtD(end)}. The Project Manager can then tag resources and build the WBS.</p>
          ) : (
            <label className="block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Comment <span className="text-red-500">*</span></span>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] p-2 text-[11.5px]" /></label>
          )}
        </Modal>
      )}
      {confirm && (
        <Modal open onClose={() => setConfirm(false)} size="sm" title="Submit the schedule?"
          footer={<>
            <Button variant="secondary" size="md" onClick={() => setConfirm(false)}>No</Button>
            <Button variant="primary" size="md" onClick={() => { persist(true); navigate('/planning') }}>Yes</Button>
          </>}>
          <p className="text-[11.5px] text-[#344054]">Planned {fmtD(start)} to {fmtD(end)}. After you submit, the Project Manager's estimates are locked and you can no longer edit this schedule.</p>
        </Modal>
      )}
    </div>
  )
}
