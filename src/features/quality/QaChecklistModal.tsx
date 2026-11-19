/**
 * QA checklist for one QA WBS item. The assignee (Release Manager or tagged member) answers the checklist, uploads
 * evidence and records Pass / Fail. Pass / Fail stays unavailable until the Project Manager marks the checklist ready
 * and every mandatory item is answered. The Project Manager then reviews and marks the QA task complete.
 */
import { useState } from 'react'
import { Button, Modal } from '../../components'
import type { PlanItem } from '../../domain/planning'
import { DEFAULT_CHECKLIST, checklistComplete, emptyQa, qaStatusOf, QA_STATUS_CLS, userOf } from '../../domain/execution'
import type { QaState } from '../../domain/execution'
import { fmtD } from '../initiation/shared'

const today = () => new Date().toISOString().slice(0, 10)

export function QaChecklistModal({ item, role, closed, onSave, onClose }: {
  item: PlanItem
  role: string
  closed: boolean
  /** Writes the QA state and (optionally) other item fields. */
  onSave: (patch: Partial<PlanItem>, by: string) => void
  onClose: () => void
}) {
  const checklist = item.checklist?.length ? item.checklist : DEFAULT_CHECKLIST
  const [qa, setQa] = useState<QaState>(() => structuredClone(item.qa ?? emptyQa()))
  const [open, setOpen] = useState(true)
  const [review, setReview] = useState(qa.reviewComment ?? '')
  const [confirmReview, setConfirmReview] = useState(false)
  const me = userOf(role)
  const isAssignee = !!me && item.owner === me
  const isPm = role === 'ProjectManager'
  const done = !!qa.reviewed
  const canAnswer = isAssignee && !closed && !done && !qa.outcome
  const canMark = isPm && !closed && !done && !qa.outcome
  const complete = checklistComplete(checklist, qa)
  const canOutcome = canAnswer && qa.ready && complete
  const canReview = isPm && !closed && !!qa.outcome && !done
  const status = qaStatusOf({ ...item, qa })

  const answer = (id: string, ok: boolean | null, comment?: string) =>
    setQa((q) => ({ ...q, answers: { ...q.answers, [id]: { ok, comment: comment ?? q.answers[id]?.comment ?? '' } } }))
  const save = (next: QaState, extra: Partial<PlanItem> = {}) => {
    setQa(next)
    onSave({ qa: next, ...extra }, me || role)
  }
  const outcome = (o: 'Pass' | 'Fail') => {
    const next = { ...qa, outcome: o, outcomeBy: me }
    save(next, { status: 'Ongoing', actualStart: item.actualStart ?? today() })
  }
  const approve = () => {
    const next = { ...qa, reviewed: true, reviewComment: review.trim() || undefined }
    save(next, { status: 'Completed', actualEnd: today(), progress: 100 })
    setConfirmReview(false)
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="lg" title={`QA checklist · ${item.name}`}
      footer={<>
        <Button variant="secondary" size="md" onClick={() => { if (canAnswer) onSave({ qa }, me); onClose() }}>Close</Button>
        {canAnswer && <Button variant="secondary" size="md" onClick={() => save(qa, { status: item.status === 'Open' ? 'Ongoing' : item.status, actualStart: item.actualStart ?? today() })}>Save</Button>}
      </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-[#344054]">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${QA_STATUS_CLS[status]}`}>{status}</span>
        <span>Owner <strong>{item.owner ?? '—'}</strong></span>
        {qa.outcome && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${qa.outcome === 'Pass' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>{qa.outcome}</span>}
        {closed && <span className="text-[var(--color-muted)]">Project closed, read-only.</span>}
        {!isAssignee && !isPm && <span className="text-[var(--color-muted)]">View only. Only the assigned owner fills the checklist.</span>}
      </div>

      <section className="rounded-lg border border-[var(--color-border)]">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-semibold text-[#101828]">
          Checklist <span className="text-[10.5px] font-normal text-[var(--color-muted)]">{open ? 'Collapse' : 'Expand'}</span>
        </button>
        {open && (
          <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
            {checklist.map((c) => {
              const a = qa.answers[c.id]
              return (
                <li key={c.id} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 text-[11.5px] text-[#101828]">{c.label}{c.mandatory && <span className="text-red-500"> *</span>}</span>
                    {([['Yes', true], ['No', false]] as const).map(([l, v]) => (
                      <label key={l} className="flex items-center gap-1 text-[11px] text-[#344054]">
                        <input type="radio" name={`ck-${c.id}`} checked={a?.ok === v} disabled={!canAnswer} onChange={() => answer(c.id, v)} /> {l}
                      </label>
                    ))}
                  </div>
                  <input value={a?.comment ?? ''} disabled={!canAnswer} onChange={(e) => answer(c.id, a?.ok ?? null, e.target.value)} placeholder="Comment"
                    aria-label={`Comment for ${c.label}`} className="mt-1.5 h-8 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-[11px] disabled:bg-[#f9fafb]" />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5">
        <h3 className="m-0 mb-1.5 text-[12px] font-semibold text-[#101828]">Evidence</h3>
        {qa.evidence.length === 0 ? <p className="text-[11px] text-[var(--color-muted)]">No files uploaded.</p> : (
          <ul className="mb-2 space-y-0.5 text-[11px] text-[#344054]">{qa.evidence.map((f) => <li key={f}>{f}</li>)}</ul>
        )}
        {canAnswer && (
          <input type="file" aria-label="Upload evidence" className="block text-[11px]"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setQa((q) => ({ ...q, evidence: [...q.evidence, f.name] })); setOpen(false) } }} />
        )}
      </section>

      {canMark && (
        <label className="mt-3 flex items-center gap-2 text-[11.5px] text-[#344054]">
          <input type="checkbox" checked={qa.ready} onChange={(e) => save({ ...qa, ready: e.target.checked })} />
          Mark ready: the owner can then record Pass or Fail
        </label>
      )}
      {!qa.outcome && isAssignee && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="md" disabled={!canOutcome} onClick={() => outcome('Pass')}>Pass</Button>
            <Button variant="secondary" size="md" disabled={!canOutcome} onClick={() => outcome('Fail')}>Fail</Button>
            {!canOutcome && !closed && (
              <span className="text-[10.5px] text-[var(--color-muted)]">
                {!qa.ready ? 'Waiting for the Project Manager to mark the checklist ready.' : !complete ? 'Answer every mandatory item first.' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {(canReview || done) && (
        <section className="mt-4 rounded-lg bg-[#f8faff] px-3 py-3">
          <h3 className="m-0 mb-2 text-[12px] font-semibold text-[#101828]">Review</h3>
          {done ? (
            <p className="text-[11.5px] text-emerald-800">QA task complete{qa.reviewComment ? `: ${qa.reviewComment}` : '.'} Outcome recorded: {qa.outcome}. {fmtD(item.actualEnd)}</p>
          ) : (
            <>
              <textarea value={review} onChange={(e) => setReview(e.target.value)} rows={2} placeholder="Review comments (optional)" className="w-full rounded-lg border border-[var(--color-border)] bg-white p-2 text-[11.5px]" />
              <div className="mt-2 flex justify-end"><Button variant="primary" size="md" onClick={() => setConfirmReview(true)}>Approve and mark complete</Button></div>
            </>
          )}
        </section>
      )}
      {confirmReview && (
        <Modal open onClose={() => setConfirmReview(false)} size="sm" title="Mark this QA task complete?"
          footer={<><Button variant="secondary" size="md" onClick={() => setConfirmReview(false)}>No</Button><Button variant="primary" size="md" onClick={approve}>Yes</Button></>}>
          <p className="text-[11.5px] text-[#344054]">The outcome ({qa.outcome}) stays on record for reporting. The Project Manager and the QA owner are notified.</p>
        </Modal>
      )}
    </Modal>
  )
}
