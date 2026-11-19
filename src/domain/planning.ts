/**
 * Project Planning: PM manpower estimates, schedule decision, and the project WBS (imported from the archetype, groomed
 * by the Project Manager, approved by the CoE Head). Pure helpers; state lives in the initiation store.
 */
import type { DependencyType, ProjectArchetype, WbsLevel } from './index'
import type { InitiationRecord } from './initiation'
import { durationDays, toIso, toMs } from './initiation'

/** Prototype people. The Project Manager and Team Member personas stand for these named users. */
export const PM_USER = 'Aman Singh'
export const TEAM_MEMBER_USER = 'Neha Verma'
/** Resource pool the Project Manager tags from (the live system reads the resource master). */
export const RESOURCE_POOL = ['Neha Verma', 'Rakesh Gupta', 'Anita Sharma', 'Vikram Rao', 'Pooja Iyer', 'Sameer Khan']

/** Estimate row in the Project Manager's own window. */
export interface PmRow { id: string; skillset: string; headcount: number; days: number; utilization: number }
export function pmRowErrors(rows: PmRow[]): Record<string, string> {
  const e: Record<string, string> = {}
  if (rows.length === 0) e._rows = 'Add at least one skillset, or cancel if you have no estimates.'
  rows.forEach((r, i) => {
    if (!r.skillset) e[`${i}.skillset`] = 'Select a skillset.'
    if (!(r.headcount > 0)) e[`${i}.headcount`] = 'Enter a headcount.'
    if (!(r.days > 0)) e[`${i}.days`] = 'Enter days.'
    if (!(r.utilization > 0 && r.utilization <= 100)) e[`${i}.utilization`] = '1 to 100.'
  })
  return e
}

export type Priority = 'High' | 'Medium' | 'Low'
export const PRIORITIES: Priority[] = ['High', 'Medium', 'Low']
/** Actual dates are typed in by hand in this mode; a time-driven mode would fill them from execution. */
export const TRACKING_MODE: 'Manual' | 'Time-driven' = 'Manual'

export interface PlanDep { onId: string; type: DependencyType; lag: number }
export interface PlanItem {
  id: string
  parentId?: string
  level: WbsLevel
  /** Archetype object type (General, QA, VCF, RiskSphere, ImportJira, …) or 'General' for rows added in planning. */
  type: string
  name: string
  description: string
  /** Earned value weightage, % of the parent. Children of one parent add up to 100. */
  weight: number
  plannedStart: string
  plannedEnd: string
  /** Person-days. */
  effort: number
  owner?: string
  actualStart?: string
  actualEnd?: string
  priority: Priority
  /** Row cannot be edited or deleted once locked. */
  locked: boolean
  /** Milestones from the archetype: not changeable or removable by the PM. */
  frozen?: boolean
  deps: PlanDep[]
}

export type WbsStatus = 'Draft' | 'Submitted' | 'Approved' | 'SentBack' | 'Rejected'
export interface PlanWbs { items: PlanItem[]; status: WbsStatus; lastComment?: string; importedFrom: { archetypeId: string; version: number } }

export interface FlatItem { item: PlanItem; code: string; depth: number }
/** Pre-order walk with WBS IDs like 1, 1.2, 1.2.1. */
export function flatten(items: PlanItem[]): FlatItem[] {
  const ids = new Set(items.map((i) => i.id))
  const kids = new Map<string, PlanItem[]>()
  for (const i of items) {
    const p = i.parentId && ids.has(i.parentId) ? i.parentId : ''
    kids.set(p, [...(kids.get(p) ?? []), i])
  }
  const out: FlatItem[] = []
  const walk = (parent: string, prefix: string, depth: number) =>
    (kids.get(parent) ?? []).forEach((i, n) => {
      const code = prefix ? `${prefix}.${n + 1}` : `${n + 1}`
      out.push({ item: i, code, depth })
      walk(i.id, code, depth + 1)
    })
  walk('', '', 0)
  return out
}
export const LEVEL_ORDER: WbsLevel[] = ['Milestone', 'Activity', 'Task', 'Subtask']
export const LEVEL_LABEL: Record<WbsLevel, string> = { Milestone: 'Milestone', Activity: 'Activity', Task: 'Task', Subtask: 'Sub-task' }
export const childOf = (l: WbsLevel): WbsLevel | undefined => LEVEL_ORDER[LEVEL_ORDER.indexOf(l) + 1]
export const subtreeIds = (items: PlanItem[], id: string): Set<string> => {
  const out = new Set([id])
  let grew = true
  while (grew) { grew = false; for (const i of items) if (i.parentId && out.has(i.parentId) && !out.has(i.id)) { out.add(i.id); grew = true } }
  return out
}

/** Equal split of 100 with the remainder on the last child. */
export const equalWeights = (n: number): number[] => {
  if (n <= 0) return []
  const base = Math.floor((100 / n) * 100) / 100
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base))
}

/**
 * Import the archetype's WBS as the starting plan: same hierarchy, milestones frozen, weights split equally among
 * siblings, milestones spread across the approved schedule and every child starting with its parent's dates.
 */
export function importWbs(arc: ProjectArchetype, version: number, start: string, end: string): PlanWbs {
  const src = arc.wbs.filter((o) => o.name.trim())
  const ids = new Set(src.map((o) => o.id))
  const parentOf = (o: (typeof src)[number]) => (o.parentId && ids.has(o.parentId) ? o.parentId : undefined)
  const roots = src.filter((o) => !parentOf(o))
  const span = durationDays(start, end) || 1
  const slice = Math.max(1, Math.floor(span / Math.max(1, roots.length)))
  const dates = new Map<string, [string, string]>()
  roots.forEach((m, i) => {
    const s = toMs(start) + i * slice * 86400000
    const e = i === roots.length - 1 ? toMs(end) : s + (slice - 1) * 86400000
    dates.set(m.id, [toIso(s), toIso(e)])
  })
  const items: PlanItem[] = []
  const weightOf = new Map<string, number>()
  const group = new Map<string, typeof src>()
  for (const o of src) group.set(parentOf(o) ?? '', [...(group.get(parentOf(o) ?? '') ?? []), o])
  for (const list of group.values()) equalWeights(list.length).forEach((w, i) => weightOf.set(list[i].id, w))
  const place = (o: (typeof src)[number]) => {
    const p = parentOf(o)
    if (p && !dates.has(o.id)) dates.set(o.id, dates.get(p) ?? [start, end])
    const [ps, pe] = dates.get(o.id) ?? [start, end]
    items.push({
      id: o.id, parentId: p, level: o.level, type: o.type, name: o.name, description: '', weight: weightOf.get(o.id) ?? 0,
      plannedStart: ps, plannedEnd: pe, effort: 0, priority: 'Medium', locked: false, frozen: o.level === 'Milestone',
      deps: [],
    })
  }
  // Parents before children so dates cascade.
  const order = (o: (typeof src)[number]): void => { place(o); src.filter((c) => parentOf(c) === o.id).forEach(order) }
  roots.forEach(order)
  // Archetype dependencies carry over.
  for (const o of src) {
    if (!o.dependency || !ids.has(o.dependency.onObjectId)) continue
    const it = items.find((i) => i.id === o.id)
    if (it) it.deps.push({ onId: o.dependency.onObjectId, type: o.dependency.type, lag: o.dependency.lagDays })
  }
  return { items, status: 'Draft', importedFrom: { archetypeId: arc.id, version } }
}

/** True when `from` can depend on `on` without creating a cycle. */
export function canDepend(items: PlanItem[], from: string, on: string): boolean {
  if (from === on) return false
  const seen = new Set<string>()
  const stack = [on]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === from) return false
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const d of items.find((i) => i.id === cur)?.deps ?? []) stack.push(d.onId)
  }
  return true
}

export type PlanErrors = Record<string, string>
/** Field checks for one row, against its parent's dates. */
export function itemErrors(it: PlanItem, items: PlanItem[]): PlanErrors {
  const e: PlanErrors = {}
  if (!it.name.trim()) e.name = 'Enter a title.'
  if (!it.plannedStart) e.plannedStart = 'Enter a start date.'
  if (!it.plannedEnd) e.plannedEnd = 'Enter a finish date.'
  else if (it.plannedStart && it.plannedEnd < it.plannedStart) e.plannedEnd = 'Finish is before start.'
  if (!(it.effort >= 0)) e.effort = 'Effort cannot be negative.'
  if (!(it.weight >= 0 && it.weight <= 100)) e.weight = '0 to 100.'
  const parent = items.find((p) => p.id === it.parentId)
  if (parent && it.plannedStart && it.plannedEnd && (it.plannedStart < parent.plannedStart || it.plannedEnd > parent.plannedEnd))
    e.plannedStart = `Keep dates within the parent (${parent.plannedStart} to ${parent.plannedEnd}).`
  if (it.actualStart && it.actualEnd && it.actualEnd < it.actualStart) e.actualEnd = 'Finish is before start.'
  return e
}
/** Whole-plan checks before submitting for approval. */
export function wbsErrors(items: PlanItem[]): string[] {
  const out: string[] = []
  if (items.length === 0) out.push('The WBS is empty. Import the archetype WBS first.')
  const flat = flatten(items)
  for (const { item, code } of flat) if (Object.keys(itemErrors(item, items)).length) out.push(`${code} ${item.name || '(untitled)'}: fix the highlighted fields.`)
  const parents = new Set(items.map((i) => i.parentId ?? ''))
  for (const p of parents) {
    const sibs = items.filter((i) => (i.parentId ?? '') === p)
    const total = Math.round(sibs.reduce((s, i) => s + (Number(i.weight) || 0), 0) * 100) / 100
    if (sibs.length && Math.abs(total - 100) > 0.05) {
      const code = flat.find((f) => f.item.id === p)?.code
      out.push(`${code ? `Under ${code}` : 'Milestones'}: earned value weightage adds up to ${total}%, not 100%.`)
    }
  }
  return out
}

/** Names tagged to the project (owners are picked from these only). */
export const taggedOf = (r: InitiationRecord): string[] => r.tagged ?? []

export type PlanningStatus =
  | 'AwaitingPM' | 'EstimatesPending' | 'SchedulePending' | 'ScheduleSubmitted' | 'ScheduleSentBack' | 'ScheduleRejected'
  | 'TaggingPending' | 'WbsPending' | 'WbsInProgress' | 'WbsSubmitted' | 'WbsSentBack' | 'WbsRejected' | 'Baselined'
export const PLANNING_STATUS_LABEL: Record<PlanningStatus, string> = {
  AwaitingPM: 'Awaiting Project Manager', EstimatesPending: 'Estimates pending', SchedulePending: 'Schedule pending',
  ScheduleSubmitted: 'Schedule awaiting approval', ScheduleSentBack: 'Schedule sent back', ScheduleRejected: 'Schedule rejected',
  TaggingPending: 'Resource tagging pending', WbsPending: 'WBS creation pending', WbsInProgress: 'WBS in progress',
  WbsSubmitted: 'WBS awaiting approval', WbsSentBack: 'WBS sent back', WbsRejected: 'WBS rejected', Baselined: 'Plan baselined',
}
/**
 * Where a project stands in planning. Order: PM assigned → (optional) PM estimates → BP schedule, approved by CoE →
 * resource tagging → WBS (non-SDLC; SDLC work is built in JIRA) → CoE WBS approval.
 */
export function planningStatus(r: InitiationRecord, sdlc: boolean): PlanningStatus {
  if (!r.pm) return 'AwaitingPM'
  const s = r.schedule
  if (!s) return r.pmEstimateStatus ? 'SchedulePending' : 'EstimatesPending'
  if (s.status === 'Draft') return 'SchedulePending'
  if (s.status === 'Submitted') return 'ScheduleSubmitted'
  if (s.status === 'SentBack') return 'ScheduleSentBack'
  if (s.status === 'Rejected') return 'ScheduleRejected'
  if (!(r.tagged?.length)) return 'TaggingPending'
  if (sdlc) return 'Baselined'
  const w = r.wbs
  if (!w) return 'WbsPending'
  return { Draft: 'WbsInProgress', Submitted: 'WbsSubmitted', Approved: 'Baselined', SentBack: 'WbsSentBack', Rejected: 'WbsRejected' }[w.status] as PlanningStatus
}
