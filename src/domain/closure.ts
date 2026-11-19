/**
 * Project Closure: the Project Manager completes the archetype's closure checklist, the CoE Head reviews, the
 * Governance Head gives the final approval. Final approval locks the project and archives the closure artefacts.
 */
import type { InitiationRecord } from './initiation'
import type { PlanItem } from './planning'
import { isQa, workStatusOf } from './execution'

export interface ClosureItem { id: string; label: string; /** Archetype ids the item applies to. */ archetypeIds: string[] }
export type ClosureStatus = 'Draft' | 'WithCoE' | 'WithGovernance' | 'SentBack' | 'Closed'
export const CLOSURE_STATUS_LABEL: Record<ClosureStatus | 'Eligible', string> = {
  Eligible: 'Ready to close', Draft: 'Draft', WithCoE: 'With CoE Head', WithGovernance: 'With Governance Head', SentBack: 'Sent back', Closed: 'Closed',
}
export const CLOSURE_STATUS_CLS: Record<ClosureStatus | 'Eligible', string> = {
  Eligible: 'bg-slate-100 text-slate-700', Draft: 'bg-slate-100 text-slate-700', WithCoE: 'bg-indigo-100 text-indigo-800',
  WithGovernance: 'bg-violet-100 text-violet-800', SentBack: 'bg-amber-100 text-amber-800', Closed: 'bg-emerald-100 text-emerald-800',
}

export interface ClosureAnswer { done: boolean; file?: string }
export interface ClosureReview { by: string; role: string; decision: 'Approved' | 'Sent back'; text: string; at: string }
export interface ArchiveArtefact { kind: 'Closure report' | 'QA' | 'Risk' | 'Change requests' | 'Financial'; name: string }
export interface ClosureReport { generatedAt: string; lines: { label: string; value: string }[]; artefacts: ArchiveArtefact[] }
export interface ClosureRecord {
  status: ClosureStatus
  answers: Record<string, ClosureAnswer>
  comments: string
  reviews: ClosureReview[]
  submittedAt?: string
  closedAt?: string
  report?: ClosureReport
}
export const emptyClosure = (): ClosureRecord => ({ status: 'Draft', answers: {}, comments: '', reviews: [] })

export const SEED_CLOSURE_ITEMS: ClosureItem[] = [
  { id: 'cl1', label: 'All deliverables handed over and accepted', archetypeIds: ['ARC-001'] },
  { id: 'cl2', label: 'Final budget reconciliation attached', archetypeIds: ['ARC-001'] },
  { id: 'cl3', label: 'Lessons learnt documented', archetypeIds: ['ARC-001'] },
  { id: 'cl4', label: 'Open risks and issues closed or transferred', archetypeIds: ['ARC-001'] },
  { id: 'cl5', label: 'Support and handover plan signed off', archetypeIds: ['ARC-001'] },
]

/** Closure items an archetype's projects have to complete. */
export const itemsFor = (master: ClosureItem[], archetypeId: string) => master.filter((i) => i.archetypeIds.includes(archetypeId))

/** Eligible when the plan is baselined and every leaf of the WBS is Completed. A closed project is not eligible again. */
export function closureEligible(r: InitiationRecord): boolean {
  const items = r.wbs?.items ?? []
  if (r.wbs?.status !== 'Approved' || items.length === 0 || r.closure?.status === 'Closed') return false
  return items.filter((i) => !items.some((k) => k.parentId === i.id)).every((i) => workStatusOf(i) === 'Completed')
}
export const closureStatusOf = (r: InitiationRecord): ClosureStatus | 'Eligible' => r.closure?.status ?? 'Eligible'

/** Missing answers: every item must be marked done, with a file when it needs evidence (all do in this prototype). */
export function closureErrors(items: ClosureItem[], c: ClosureRecord): Record<string, string> {
  const e: Record<string, string> = {}
  if (items.length === 0) e._items = 'No closure checklist is configured for this archetype. Ask the Admin to add one.'
  for (const it of items) {
    const a = c.answers[it.id]
    if (!a?.done) e[it.id] = 'Mark this item as completed.'
    else if (!a.file) e[it.id] = 'Upload the supporting file.'
  }
  return e
}

/** The closure package archived on final approval: QA, risk, change requests and financial artefacts. */
export function buildReport(r: InitiationRecord, projectName: string, budget: number, consumed: number): ClosureReport {
  const items: PlanItem[] = r.wbs?.items ?? []
  const qa = items.filter(isQa)
  const passed = qa.filter((i) => i.qa?.outcome === 'Pass').length
  return {
    generatedAt: new Date().toISOString(),
    lines: [
      { label: 'Project', value: `${r.projectId} · ${projectName}` },
      { label: 'Planned period', value: `${r.schedule?.plannedStart ?? '—'} to ${r.schedule?.plannedEnd ?? '—'}` },
      { label: 'WBS items completed', value: String(items.filter((i) => !items.some((k) => k.parentId === i.id)).length) },
      { label: 'QA checklists passed', value: `${passed} of ${qa.length}` },
      { label: 'Approved budget', value: `₹ ${budget} Cr` },
      { label: 'Consumed budget', value: `₹ ${consumed} Cr` },
    ],
    artefacts: [
      { kind: 'Closure report', name: `${r.projectId}-closure-report.pdf` },
      { kind: 'QA', name: `${r.projectId}-qa-results.xlsx` },
      { kind: 'Risk', name: `${r.projectId}-risk-register.xlsx` },
      { kind: 'Change requests', name: `${r.projectId}-change-request-log.xlsx` },
      { kind: 'Financial', name: `${r.projectId}-financial-summary.xlsx` },
    ],
  }
}
