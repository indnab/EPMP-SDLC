/**
 * Project Execution: resource tagging, WBS ownership and status, governance milestones (VCF, QA checklist), hybrid JIRA
 * roll-up and Internal QA. Pure helpers and types; state lives in the initiation store.
 */
import type { PlanItem } from './planning'
import { TEAM_MEMBER_USER, flatten } from './planning'

/** Prototype people for the Release Manager and Resource Manager personas. */
export const RELEASE_MANAGER_USER = 'Anil Kapoor'
export const RESOURCE_MANAGER_USER = 'Meera Pillai'

export interface Resource { id: string; name: string; skill: string; designation: string }
/** Resource master (the live system reads this from the resource / skill master). */
export const RESOURCES: Resource[] = [
  { id: 'R101', name: 'Neha Verma', skill: 'Java Developer', designation: 'Senior Engineer' },
  { id: 'R102', name: 'Rakesh Gupta', skill: 'Java Developer', designation: 'Engineer' },
  { id: 'R103', name: 'Anita Sharma', skill: 'QA Engineer', designation: 'Lead QA' },
  { id: 'R104', name: 'Vikram Rao', skill: 'QA Engineer', designation: 'QA Analyst' },
  { id: 'R105', name: 'Pooja Iyer', skill: 'UI/UX Designer', designation: 'Designer' },
  { id: 'R106', name: 'Sameer Khan', skill: 'Data Engineer', designation: 'Data Engineer' },
  { id: 'R107', name: 'Anil Kapoor', skill: 'QA Engineer', designation: 'Release Manager' },
  { id: 'R108', name: 'Neha Bansal', skill: 'DevOps Engineer', designation: 'Release Manager' },
  { id: 'R109', name: 'Kiran Desai', skill: 'Business Analyst', designation: 'Analyst' },
  { id: 'R110', name: 'Rohit Sinha', skill: 'Solution Architect', designation: 'Architect' },
]
export const RELEASE_MANAGER_NAMES = RESOURCES.filter((r) => r.designation === 'Release Manager').map((r) => r.name)
export const UTILIZATIONS = [50, 100] as const

export interface TagRow {
  id: string
  skill: string
  resourceId: string
  name: string
  designation: string
  start: string
  end: string
  utilization: 50 | 100
  /** Approved by the Resource Manager. Only approved rows count as tagged. */
  approved: boolean
}
export interface Tagging { status: 'Draft' | 'Submitted' | 'Approved' | 'SentBack'; rows: TagRow[]; lastComment?: string }
export const taggedNames = (t: Tagging | undefined, legacy?: string[]): string[] => [...new Set([...(legacy ?? []), ...(t?.rows.filter((r) => r.approved).map((r) => r.name) ?? [])])]
export function tagErrors(rows: TagRow[]): Record<string, string> {
  const e: Record<string, string> = {}
  if (rows.length === 0) e._rows = 'Add at least one resource.'
  rows.forEach((r, i) => {
    if (!r.start || !r.end) e[`${i}.end`] = 'Enter both dates.'
    else if (r.end < r.start) e[`${i}.end`] = 'End is before start.'
  })
  return e
}

export type WorkStatus = 'Open' | 'Ongoing' | 'Completed'
export const WORK_STATUSES: WorkStatus[] = ['Open', 'Ongoing', 'Completed']
export const workStatusOf = (i: PlanItem): WorkStatus => i.status ?? 'Open'
export const WORK_CLS: Record<WorkStatus, string> = { Open: 'bg-slate-100 text-slate-700', Ongoing: 'bg-blue-100 text-blue-800', Completed: 'bg-emerald-100 text-emerald-800' }

/** Validate a status change: Ongoing needs an actual start, Completed needs both dates in order. */
export function statusErrors(i: PlanItem): string | null {
  const s = workStatusOf(i)
  if (s !== 'Open' && !i.actualStart) return 'Enter the actual start date.'
  if (s === 'Completed' && !i.actualEnd) return 'Enter the actual end date.'
  if (i.actualStart && i.actualEnd && i.actualEnd < i.actualStart) return 'Actual end is before start.'
  return null
}

/** Progress of a row: leaves use their own value (Completed = 100); parents roll up the weighted progress of their children. */
export function progressOf(items: PlanItem[], id: string): number {
  const it = items.find((x) => x.id === id)
  if (!it) return 0
  const kids = items.filter((k) => k.parentId === id)
  if (kids.length === 0) return workStatusOf(it) === 'Completed' ? 100 : Math.max(0, Math.min(100, it.progress ?? 0))
  const total = kids.reduce((s, k) => s + (Number(k.weight) || 0), 0) || 1
  return Math.round(kids.reduce((s, k) => s + progressOf(items, k.id) * ((Number(k.weight) || 0) / total), 0))
}

/** Who may change which fields during execution. The planned baseline is never editable here. */
export function execRights(role: string, item: PlanItem, ctx: { isPm: boolean }): { status: boolean; owner: boolean } {
  if (item.source === 'JIRA' || item.frozen) return { status: false, owner: false }
  if (role === 'ProjectManager') return { status: ctx.isPm, owner: ctx.isPm }
  const me = role === 'TeamMember' ? TEAM_MEMBER_USER : role === 'ReleaseManager' ? RELEASE_MANAGER_USER : ''
  return { status: !!me && item.owner === me, owner: false }
}

// ── Governance milestones ───────────────────────────────────────────────────
export interface CheckAnswer { ok: boolean | null; comment: string }
export interface QaState {
  answers: Record<string, CheckAnswer>
  /** Marked ready by the assignor / PM: Pass / Fail stays unavailable until then. */
  ready: boolean
  outcome?: 'Pass' | 'Fail'
  evidence: string[]
  outcomeBy?: string
  /** PM / QA Manager confirmed the completed QA item. */
  reviewed?: boolean
  reviewComment?: string
}
export const emptyQa = (): QaState => ({ answers: {}, ready: false, evidence: [] })
export const DEFAULT_CHECKLIST = [
  { id: 'dc1', label: 'Test cases executed', mandatory: true },
  { id: 'dc2', label: 'Defects triaged and closed or accepted', mandatory: true },
  { id: 'dc3', label: 'Business sign-off obtained', mandatory: false },
]
export const isQa = (i: PlanItem) => i.type === 'QA'
export const isVcf = (i: PlanItem) => i.type === 'VCF'
export const isJira = (i: PlanItem) => i.type === 'ImportJira'

/** Checklist items complete: every mandatory item has an answer. */
export function checklistComplete(items: { id: string; mandatory: boolean }[], qa: QaState | undefined): boolean {
  return items.every((c) => !c.mandatory || qa?.answers[c.id]?.ok !== undefined && qa?.answers[c.id]?.ok !== null)
}

/** Owners a QA item may have: Release Managers only when the archetype rule or an SDLC project says so; else any tagged member. */
export function ownerOptions(item: Pick<PlanItem, 'type'>, tagged: string[], releaseManagerOnly: boolean): string[] {
  if (item.type === 'QA' && releaseManagerOnly) return tagged.filter((n) => RELEASE_MANAGER_NAMES.includes(n))
  return tagged
}

// ── Hybrid JIRA ──────────────────────────────────────────────────────────────
export const JIRA_MAP = { Activity: 'Epic', Task: 'Story', Subtask: 'Task' } as const
/** Prototype of the JIRA sync: a small hierarchy rolled up under a JIRA-defined milestone, read-only in EPMS. */
export function mockJiraItems(parent: PlanItem, key: string): PlanItem[] {
  const base = { type: 'General', description: '', weight: 0, plannedStart: parent.plannedStart, plannedEnd: parent.plannedEnd, effort: 0, priority: 'Medium' as const, locked: true, deps: [], source: 'JIRA' as const }
  const epic = `${parent.id}-jira-e1`
  const rows: [string, string, PlanItem['level'], string | undefined, number, PlanItem['status']][] = [
    [epic, 'Platform services', 'Activity', parent.id, 100, 'Ongoing'],
    [`${parent.id}-jira-s1`, 'Service API contracts', 'Task', epic, 50, 'Completed'],
    [`${parent.id}-jira-s2`, 'Event streaming', 'Task', epic, 50, 'Ongoing'],
    [`${parent.id}-jira-t1`, 'Schema review', 'Subtask', `${parent.id}-jira-s2`, 100, 'Completed'],
  ]
  return rows.map(([id, name, level, parentId, weight, status], n) => ({ ...base, id, name, level, parentId, weight, status, jiraKey: `${key}-${100 + n}`, jiraType: JIRA_MAP[level as keyof typeof JIRA_MAP] }))
}

/** The execution WBS in tree order with codes (JIRA rows appear under their milestone). */
export const execRows = (items: PlanItem[]) => flatten(items)

/** The named user each execution persona stands for (prototype). */
export const userOf = (role: string): string =>
  role === 'ProjectManager' ? 'Aman Singh' : role === 'TeamMember' ? TEAM_MEMBER_USER : role === 'ReleaseManager' ? RELEASE_MANAGER_USER : role === 'ResourceManager' ? RESOURCE_MANAGER_USER : ''

export type QaStatus = 'Checklist open' | 'Ready for outcome' | 'Awaiting review' | 'Complete'
export function qaStatusOf(i: PlanItem): QaStatus {
  if (i.qa?.reviewed) return 'Complete'
  if (i.qa?.outcome) return 'Awaiting review'
  return i.qa?.ready ? 'Ready for outcome' : 'Checklist open'
}
export const QA_STATUS_CLS: Record<QaStatus, string> = {
  'Checklist open': 'bg-slate-100 text-slate-700', 'Ready for outcome': 'bg-blue-100 text-blue-800', 'Awaiting review': 'bg-violet-100 text-violet-800', Complete: 'bg-emerald-100 text-emerald-800',
}
