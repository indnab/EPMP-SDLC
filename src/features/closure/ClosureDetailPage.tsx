/**
 * Project Closure details. The project header is filled in and collapsible; the archetype's closure checklist is open by
 * default. The Project Manager completes it (file per item), adds comments and submits. CoE Head and Governance Head
 * open the same package read-only, add review comments, and approve or send back. Final approval locks and archives.
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Modal, PageHeader } from '../../components'
import { useInitiationStore } from '../../store/initiationStore'
import { useQAStore } from '../../store/qaStore'
import { CLOSURE_STATUS_CLS, CLOSURE_STATUS_LABEL, closureEligible, closureErrors, closureStatusOf, emptyClosure, itemsFor } from '../../domain/closure'
import { PM_USER } from '../../domain/planning'
import { fmtCr } from '../../domain/initiation'
import { Field, fmtD, programNameOf } from '../initiation/shared'
import { NoPlanAccess, canSeeProject, usePlanRole } from '../planning/shared'

export function ClosureDetailPage() {
  const { demandId = '' } = useParams<{ demandId: string }>()
  const role = usePlanRole()
  const navigate = useNavigate()
  const { demands, records, programs, closureItems, saveClosure, submitClosure, decideClosure } = useInitiationStore()
  const archetypes = useQAStore((s) => s.archetypes)
  const demand = demands.find((d) => d.demandId === demandId)
  const rec = records[demandId]
  const [headerOpen, setHeaderOpen] = useState(true)
  const [listOpen, setListOpen] = useState(true)
  const [shown, setShown] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [decision, setDecision] = useState<null | 'approve' | 'sendBack'>(null)
  const [comment, setComment] = useState('')

  if (!role) return (<div><PageHeader title="Project Closure" section="Project" /><NoPlanAccess /></div>)
  if (!demand || !rec?.projectId || !canSeeProject(role, rec)) {
    return (
      <div className="py-20 text-center text-[var(--color-muted)]">
        <p className="font-medium">Project not found</p>
        <Link to="/closure" className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline">← Back to Project Closure</Link>
      </div>
    )
  }
  const c = rec.closure ?? emptyClosure()
  const st = closureStatusOf(rec)
  const arc = archetypes.find((a) => a.id === rec.projectType)
  const list = itemsFor(closureItems, rec.projectType)
  const errors = closureErrors(list, c)
  const isPm = role === 'ProjectManager' && rec.pm === PM_USER
  const editable = isPm && (st === 'Eligible' || st === 'Draft' || st === 'SentBack') && (closureEligible(rec) || st === 'SentBack' || st === 'Draft')
  const reviewing = (role === 'CoEHead' && st === 'WithCoE') || (role === 'GovernanceHead' && st === 'WithGovernance')
  const closed = st === 'Closed'
  const setAnswer = (id: string, p: { done?: boolean; file?: string }) => saveClosure(demandId, { answers: { ...c.answers, [id]: { ...c.answers[id], done: c.answers[id]?.done ?? false, ...p } } })
  const doSubmit = () => { setConfirm(false); submitClosure(demandId); navigate('/closure') }

  return (
    <div className="pb-24">
      <PageHeader title="Project Closure" section="Project Closure" crumb={`${rec.projectId} · Closure`} />
      <Card className="mb-4">
        <button type="button" onClick={() => setHeaderOpen((o) => !o)} aria-expanded={headerOpen} className="flex w-full items-center gap-2 text-left">
          <h2 className="m-0 text-[13px] font-semibold text-[#101828]">{rec.projectName}</h2>
          <span className="font-mono text-[10.5px] text-[var(--color-muted)]">{rec.projectId}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CLOSURE_STATUS_CLS[st]}`}>{CLOSURE_STATUS_LABEL[st]}</span>
          <span className="ml-auto text-[10.5px] text-[var(--color-muted)]">{headerOpen ? 'Collapse' : 'Expand'}</span>
        </button>
        {headerOpen && (
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-[11.5px] md:grid-cols-3">
            {([['Project Archetype', arc?.name ?? rec.projectType], ['Program', programNameOf(rec, programs)], ['CoE', demand.coe ?? '—'], ['Project Manager', rec.pm ?? '—'],
              ['Start Date', fmtD(rec.schedule?.plannedStart)], ['End Date', fmtD(rec.schedule?.plannedEnd)], ['Budget', fmtCr(demand.budget)], ['Consumed budget', fmtCr(rec.vcf.consumedBudget)]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-[10.5px] text-[var(--color-muted)]">{k}</dt><dd className="m-0 font-medium text-[#101828]">{v}</dd></div>
            ))}
          </dl>
        )}
      </Card>

      {closed && (
        <Card className="mb-4">
          <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">The project is closed on {fmtD(c.closedAt)}. The record is locked and available read-only in the archive.</p>
          <h3 className="m-0 mb-2 text-[12px] font-semibold text-[#101828]">Closure report</h3>
          <dl className="mb-3 grid grid-cols-1 gap-x-8 gap-y-1.5 text-[11.5px] md:grid-cols-2">{c.report?.lines.map((l) => <div key={l.label}><dt className="text-[10.5px] text-[var(--color-muted)]">{l.label}</dt><dd className="m-0 font-medium">{l.value}</dd></div>)}</dl>
          <h3 className="m-0 mb-1 text-[12px] font-semibold text-[#101828]">Archived artefacts</h3>
          <ul className="space-y-0.5 text-[11.5px] text-[#344054]">{c.report?.artefacts.map((a) => <li key={a.name}><span className="inline-block w-32 text-[var(--color-muted)]">{a.kind}</span>{a.name}</li>)}</ul>
          <p className="mt-3 text-[10.5px] text-[var(--color-muted)]">A later change request against this project is raised through Change Request Management against the archived project reference. The closure trail stays as it is.</p>
        </Card>
      )}

      <Card flush className="mb-4 !overflow-visible">
        <button type="button" onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen} className="flex w-full items-center border-b border-[var(--color-border)] px-4 py-3 text-left">
          <h2 className="m-0 text-[13px] font-semibold text-[#101828]">Closure checklist <span className="font-normal text-[var(--color-muted)]">· {arc?.name}</span></h2>
          <span className="ml-auto text-[10.5px] text-[var(--color-muted)]">{listOpen ? 'Collapse' : 'Expand'}</span>
        </button>
        {listOpen && (list.length === 0 ? <p className="px-4 py-6 text-[11.5px] text-[var(--color-muted)]">No closure checklist is configured for this archetype. The Admin adds one under Governance.</p> : (
          <ul className="divide-y divide-[var(--color-border)]">
            {list.map((it) => {
              const a = c.answers[it.id]
              return (
                <li key={it.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-[11.5px] text-[#101828]">
                    <input type="checkbox" checked={!!a?.done} disabled={!editable} onChange={(e) => setAnswer(it.id, { done: e.target.checked })} /> {it.label}
                  </label>
                  {a?.file && <span className="text-[10.5px] text-emerald-700">{a.file}</span>}
                  {editable && <input type="file" aria-label={`Upload for ${it.label}`} className="w-56 text-[10.5px]" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setAnswer(it.id, { file: f.name }); setListOpen(true) } }} />}
                  {shown && errors[it.id] && <span className="w-full text-[10.5px] text-red-600">{errors[it.id]}</span>}
                </li>
              )
            })}
          </ul>
        ))}
        {shown && errors._items && <p className="px-4 py-2 text-[10.5px] text-red-600">{errors._items}</p>}
      </Card>

      <Card className="mb-4">
        <Field label="Comments">
          <textarea value={c.comments} disabled={!editable} rows={3} onChange={(e) => saveClosure(demandId, { comments: e.target.value })} className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] p-2 text-[11.5px] disabled:opacity-70" />
        </Field>
        {c.reviews.length > 0 && (
          <div className="mt-3">
            <h3 className="m-0 mb-1 text-[12px] font-semibold text-[#101828]">Review comments</h3>
            <ul className="space-y-1 text-[11.5px] text-[#344054]">{c.reviews.map((r, i) => <li key={i}><span className="text-[var(--color-muted)]">{fmtD(r.at)}</span> · <strong>{r.by}</strong> {r.decision.toLowerCase()}{r.text ? `: ${r.text}` : ''}</li>)}</ul>
          </div>
        )}
        {st === 'SentBack' && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">Sent back for rework. Update the checklist and submit again.</p>}
        {!editable && !reviewing && !closed && <p className="mt-3 text-[10.5px] text-[var(--color-muted)]">Read-only{role === 'ProjectManager' ? ' while the closure is under review' : ''}.</p>}
      </Card>

      <div className="fixed bottom-0 right-0 z-30 flex justify-end gap-3 border-t border-[var(--color-border)] bg-white/90 px-7 py-3 backdrop-blur left-0 lg:left-[var(--nav-w)]">
        <Button variant="secondary" size="md" onClick={() => navigate('/closure')}>{editable ? 'Cancel' : 'Back'}</Button>
        {editable && <Button variant="primary" size="md" onClick={() => { setShown(true); if (Object.keys(errors).length === 0) setConfirm(true) }}>Submit</Button>}
        {reviewing && (<>
          <Button variant="secondary" size="md" onClick={() => { setComment(''); setDecision('sendBack') }}>Send Back</Button>
          <Button variant="primary" size="md" onClick={() => { setComment(''); setDecision('approve') }}>Approve</Button>
        </>)}
      </div>

      {confirm && (
        <Modal open onClose={() => setConfirm(false)} size="sm" title="Submit the closure?"
          footer={<><Button variant="secondary" size="md" onClick={() => setConfirm(false)}>No</Button><Button variant="primary" size="md" onClick={doSubmit}>Yes</Button></>}>
          <p className="text-[11.5px] text-[#344054]">The CoE Head reviews the package first, then the Governance Head. You cannot edit it while it is under review.</p>
        </Modal>
      )}
      {decision && (role === 'CoEHead' || role === 'GovernanceHead') && (
        <Modal open onClose={() => setDecision(null)} size="sm" title={decision === 'approve' ? (role === 'GovernanceHead' ? 'Give final approval?' : 'Approve the closure?') : 'Send back for rework'}
          footer={<><Button variant="secondary" size="md" onClick={() => setDecision(null)}>Cancel</Button>
            <Button variant="primary" size="md" disabled={decision === 'sendBack' && !comment.trim()}
              onClick={() => { decideClosure(demandId, role, decision, comment.trim(), { projectName: rec.projectName, budget: demand.budget }); navigate('/closure') }}>{decision === 'approve' ? 'Approve' : 'Send back'}</Button></>}>
          <p className="mb-2 text-[11.5px] text-[#344054]">
            {decision === 'approve'
              ? role === 'GovernanceHead' ? 'The project is locked, the closure report is generated and the QA, risk, change request and financial artefacts are archived.' : 'The package goes to the Governance Head for final approval.'
              : 'The Project Manager reworks the package and resubmits.'}
          </p>
          <label className="block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Review comments{decision === 'sendBack' ? ' *' : ''}</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] p-2 text-[11.5px]" /></label>
        </Modal>
      )}
    </div>
  )
}
