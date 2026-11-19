/**
 * Project Initiation (demand → program → project). A Business Partner turns an approved, CoE-tagged demand into a
 * project package: project details, a program (existing or new) and the VCF (value / cost framework). The package goes
 * through Business Partner Head → Governance Head (new program only) → CoE Head. Program ID is created on Governance
 * approval and Project ID on CoE approval.
 */

export type InitRole = 'BusinessPartner' | 'BPHead' | 'GovernanceHead' | 'CoEHead' | 'BusinessUser'
export const INIT_ROLES: InitRole[] = ['BusinessPartner', 'BPHead', 'GovernanceHead', 'CoEHead', 'BusinessUser']

export type InitStatus = 'Draft' | 'PendingBPHead' | 'PendingGovernance' | 'PendingCoE' | 'Approved' | 'SentBack' | 'Rejected'
export const INIT_STATUS_LABEL: Record<InitStatus, string> = {
  Draft: 'Draft',
  PendingBPHead: 'With BP Head',
  PendingGovernance: 'With Governance Head',
  PendingCoE: 'With CoE Head',
  Approved: 'Approved',
  SentBack: 'Sent back',
  Rejected: 'Rejected',
}
export const INIT_STATUS_CLS: Record<InitStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700',
  PendingBPHead: 'bg-blue-100 text-blue-800',
  PendingGovernance: 'bg-violet-100 text-violet-800',
  PendingCoE: 'bg-indigo-100 text-indigo-800',
  Approved: 'bg-emerald-100 text-emerald-800',
  SentBack: 'bg-amber-100 text-amber-800',
  Rejected: 'bg-red-100 text-red-700',
}

/** An approved request that has been tagged to a CoE; the entry point for a project. */
export interface Demand {
  demandId: string
  title: string
  /** 'ExistingApplication': the request is on an existing application, so the program is that application's program. */
  requestType: 'New' | 'ExistingApplication'
  division: string
  /** Null until a CoE is assigned. */
  coe: string | null
  /** Approved to demand. */
  approved: boolean
  startDate: string
  endDate: string
  /** ₹ Cr */
  budget: number
  programId?: string
}

export interface ManpowerRow { id: string; skillset: string; headcount: number; startDate: string; endDate: string; utilization: number }

export const LEVER_YEARS = ['FY27', 'FY28', 'FY29', 'FY30', 'FY31']
export interface Lever { id: string; name: string; kind: 'value' | 'cost'; amounts: number[] }
export interface ValueMetric { id: string; name: string; target: string }
export interface Ringi { fileName: string; uploadedAt: string; allocatedBudget: number }
export interface Vcf {
  levers: Lever[]
  metrics: ValueMetric[]
  ringi?: Ringi
  /** Entered by hand; never calculated. */
  consumedBudget: number
  notes: string
}
export const emptyVcf = (): Vcf => ({ levers: [], metrics: [], consumedBudget: 0, notes: '' })

export interface VcfVersion { version: number; savedAt: string; by: string; vcf: Vcf }

export interface ProgramDetails {
  name: string
  type: string
  description: string
  startYear: string
  /** Employee from HRMS. */
  ownership: string
  businessSpoc: string
  businessVertical: string
  dePillar: string
  investmentCategory: string
  classification: string
}
export const emptyProgram = (): ProgramDetails => ({
  name: '', type: '', description: '', startYear: '', ownership: '', businessSpoc: '', businessVertical: '', dePillar: '', investmentCategory: '', classification: '',
})
export interface Program extends ProgramDetails { programId: string; division: string; vcfVersions: VcfVersion[] }

import type { PlanWbs, PmRow } from './planning'
/** One estimate row (Project Manager's or Business Partner's): a skillset needed over a date range. */
export interface EstRow { id: string; skillset: string; resources: number; utilization: number; from: string; to: string }
export interface Schedule {
  plannedStart: string
  plannedEnd: string
  earliestStart?: string
  /** Submitting locks the Project Manager's estimates for this project. CoE Head then approves, sends back or rejects. */
  status: 'Draft' | 'Submitted' | 'Approved' | 'SentBack' | 'Rejected'
  usedPmEstimates: boolean
  lastComment?: string
}

export interface InitEvent { at: string; by: string; text: string; to?: string[] }

export interface InitiationRecord {
  demandId: string
  projectName: string
  expectedStart: string
  expectedEnd: string
  /** Archetype id. */
  projectType: string
  manpower: ManpowerRow[]
  /** The Project Manager supplies the estimates later; the grid is then disabled. */
  requestPmEstimates: boolean
  programMode: '' | 'existing' | 'new'
  programId?: string
  newProgram: ProgramDetails
  /** The project VCF (linked program) or the first program VCF (new program). */
  vcf: Vcf
  status: InitStatus
  projectId?: string
  createdProgramId?: string
  pm?: string
  brd?: { fileName: string; uploadedAt: string }
  /** Last approver comment (send back / reject). */
  lastComment?: string
  /** Project Manager's manpower estimates (Planning). Locked once the Business Partner submits the schedule. */
  pmEstimates?: PmRow[]
  pmEstimateStatus?: 'Draft' | 'Submitted'
  /** Resources tagged to the project (owners of WBS items are picked from these). */
  tagged?: string[]
  wbs?: PlanWbs
  /** Business Partner's own estimates for schedule simulation. */
  bpEstimates?: EstRow[]
  schedule?: Schedule
  events: InitEvent[]
}

// ── Reference data (prototype) ───────────────────────────────────────────────
export const SKILLSETS = ['Java Developer', 'UI/UX Designer', 'QA Engineer', 'Data Engineer', 'Business Analyst', 'Solution Architect', 'DevOps Engineer']
/** HRMS employees (ownership and SPOC pick-lists). */
export const HRMS_EMPLOYEES = ['E1001: Ritu Malhotra', 'E1002: Sandeep Kulkarni', 'E1003: Priya Nair', 'E1004: Manoj Tiwari', 'E1005: Kavita Joshi']
export const PROJECT_MANAGERS = ['Aman Singh', 'Deepa Menon', 'Rohan Kapoor', 'Sunita Rao']
export const PROGRAM_TYPES = ['Digital', 'Manufacturing', 'Quality', 'Supply chain']
export const BUSINESS_VERTICALS = ['Sales & Marketing', 'Manufacturing', 'Supply Chain', 'Quality', 'Finance']
export const DE_PILLARS = ['Digital Core', 'Data & Analytics', 'Customer Experience', 'Smart Manufacturing']
export const INVESTMENT_CATEGORIES = ['Growth', 'Efficiency', 'Compliance', 'Strategic']
export const PROGRAM_CLASSIFICATIONS = ['Transformation', 'Enhancement', 'Maintenance']

// ── VCF maths ────────────────────────────────────────────────────────────────
export const DISCOUNT_RATE = 0.1
export const IRR_HURDLE = 0.14

/** Net cash flow per year: value levers minus cost levers. */
export function netFlows(v: Vcf): number[] {
  return LEVER_YEARS.map((_, i) =>
    v.levers.reduce((s, l) => s + (l.kind === 'value' ? 1 : -1) * (Number(l.amounts[i]) || 0), 0))
}
export function npv(flows: number[], rate = DISCOUNT_RATE): number {
  return flows.reduce((s, f, t) => s + f / Math.pow(1 + rate, t), 0)
}
/** IRR by bisection; null when the flows never change sign. */
export function irr(flows: number[]): number | null {
  if (!(flows.some((f) => f < 0) && flows.some((f) => f > 0))) return null
  let lo = -0.99, hi = 10
  if (npv(flows, lo) * npv(flows, hi) > 0) return null
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (npv(flows, lo) * npv(flows, mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}
/** Years until cumulative net flow turns positive (fractional), or null. */
export function payback(flows: number[]): number | null {
  let cum = 0
  for (let t = 0; t < flows.length; t++) {
    const prev = cum
    cum += flows[t]
    if (cum >= 0 && flows.some((f) => f < 0)) return t === 0 ? 0 : t - 1 + (-prev) / flows[t]
  }
  return null
}
export interface VcfSummary { investment: number; returns: number; roi: number | null; npv: number; irr: number | null; payback: number | null; red: boolean }
export function summarize(v: Vcf): VcfSummary {
  const flows = netFlows(v)
  const investment = v.levers.filter((l) => l.kind === 'cost').reduce((s, l) => s + l.amounts.reduce((a, b) => a + (Number(b) || 0), 0), 0)
  const returns = v.levers.filter((l) => l.kind === 'value').reduce((s, l) => s + l.amounts.reduce((a, b) => a + (Number(b) || 0), 0), 0)
  const n = npv(flows)
  const r = irr(flows)
  return {
    investment, returns, roi: investment > 0 ? ((returns - investment) / investment) * 100 : null,
    npv: n, irr: r, payback: payback(flows),
    // Red when NPV <= 0 or IRR <= 14% (an IRR that cannot be computed also counts as red).
    red: n <= 0 || r === null || r <= IRR_HURDLE,
  }
}

// ── Validation ───────────────────────────────────────────────────────────────
export type InitErrors = Record<string, string>
export function validateDetails(r: InitiationRecord): InitErrors {
  const e: InitErrors = {}
  if (!r.projectName.trim()) e.projectName = 'Enter a project name.'
  if (!r.expectedStart) e.expectedStart = 'Select a start date.'
  if (!r.expectedEnd) e.expectedEnd = 'Select an end date.'
  else if (r.expectedStart && r.expectedEnd < r.expectedStart) e.expectedEnd = 'End date must be on or after the start date.'
  if (!r.projectType) e.projectType = 'Select a project type.'
  if (!r.requestPmEstimates) {
    r.manpower.forEach((m, i) => {
      if (!m.skillset) e[`mp.${i}.skillset`] = 'Select a skillset.'
      if (!(m.headcount > 0)) e[`mp.${i}.headcount`] = 'Enter a headcount.'
      if (!(m.utilization > 0 && m.utilization <= 100)) e[`mp.${i}.utilization`] = '1 to 100.'
      if (m.startDate && m.endDate && m.endDate < m.startDate) e[`mp.${i}.endDate`] = 'End is before start.'
    })
  }
  return e
}
export function validateProgram(r: InitiationRecord): InitErrors {
  const e: InitErrors = {}
  if (!r.programMode) { e.programMode = 'Choose an existing program or create a new one.'; return e }
  if (r.programMode === 'existing') { if (!r.programId) e.programId = 'Select a program.'; return e }
  const p = r.newProgram
  const need: [keyof ProgramDetails, string][] = [
    ['name', 'Program name'], ['type', 'Type of program'], ['description', 'Program description'], ['startYear', 'Starting year'],
    ['ownership', 'Program ownership'], ['businessSpoc', 'Business SPOC'], ['businessVertical', 'Business vertical'],
    ['dePillar', 'DE pillar'], ['investmentCategory', 'Investment category'], ['classification', 'Program classification'],
  ]
  for (const [k, label] of need) if (!String(p[k]).trim()) e[`np.${k}`] = `${label} is required.`
  if (p.startYear && !/^(19|20)\d{2}$/.test(p.startYear)) e['np.startYear'] = 'Enter a 4-digit year.'
  return e
}
export function validateVcf(r: InitiationRecord): InitErrors {
  const e: InitErrors = {}
  if (!r.vcf.levers.some((l) => l.kind === 'value')) e.levers = 'Add at least one value lever.'
  if (!r.vcf.levers.some((l) => l.kind === 'cost')) e.levers = (e.levers ? e.levers + ' ' : '') + 'Add at least one cost lever.'
  r.vcf.levers.forEach((l, i) => { if (!l.name.trim()) e[`lever.${i}`] = 'Name the lever.' })
  return e
}

// ── Helpers ──────────────────────────────────────────────────────────────────
/** True when the demand can start a project: approved to demand and a CoE is assigned. */
export const canStartProject = (d: Demand) => d.approved && !!d.coe
export const todayIso = () => new Date().toISOString()
export const fmtCr = (n: number) => `₹ ${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`
export const fmtPct = (n: number | null, d = 1) => (n === null ? '—' : `${(n * 100).toFixed(d)}%`)
export function nextId(prefix: string, existing: string[], start: number): string {
  const max = existing.reduce((m, id) => Math.max(m, parseInt(id.replace(/\D/g, ''), 10) || 0), start - 1)
  return `${prefix}${max + 1}`
}
let seq = 0
export const uid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`

// ── Schedule simulation ──────────────────────────────────────────────────────
const DAY = 86400000
export const toMs = (iso: string) => Date.parse(iso + 'T00:00:00Z')
export const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
/** Calendar days from → to, inclusive; 0 when a date is missing or reversed. */
export const durationDays = (from: string, to: string) => (from && to && to >= from ? Math.round((toMs(to) - toMs(from)) / DAY) + 1 : 0)

export interface ConflictProject { projectId: string; name: string; budget: number; status: string; start: string; end: string; /** Share of the shared pool this project uses, 0 to 1. */ load: number }
/** Other projects already running (sample data), alongside approved initiation projects. */
export const SEED_ONGOING: ConflictProject[] = [
  { projectId: 'PRJ-1234-ID', name: 'EPMS Design', budget: 500, status: 'Ongoing', start: '2026-11-01', end: '2027-03-31', load: 0.6 },
  { projectId: 'PRJ-4839-ID', name: 'Dealer CRM Upgrade', budget: 56, status: 'Ongoing', start: '2027-01-10', end: '2027-05-30', load: 0.4 },
  { projectId: 'PRJ-5120-ID', name: 'Plant MES Rollout', budget: 3488, status: 'Ongoing', start: '2027-02-15', end: '2027-08-15', load: 0.5 },
]
export interface ConflictRow extends ConflictProject { conflictPct: number }
export interface SimResult { earliestStart: string; durationDays: number; conflicts: ConflictRow[] }
export const BLOCKING_CONFLICT_PCT = 30

export function estimateErrors(rows: EstRow[]): InitErrors {
  const e: InitErrors = {}
  if (rows.length === 0) e._rows = 'Add at least one skillset to simulate.'
  rows.forEach((r, i) => {
    if (!r.skillset) e[`${i}.skillset`] = 'Select a skillset.'
    if (!(r.resources > 0)) e[`${i}.resources`] = 'Enter resources.'
    if (!(r.utilization > 0 && r.utilization <= 100)) e[`${i}.utilization`] = '1 to 100.'
    if (!r.from || !r.to) e[`${i}.to`] = 'Enter both dates.'
    else if (r.to < r.from) e[`${i}.to`] = 'End is before start.'
  })
  return e
}

/**
 * Prototype simulation: the estimates' overall window is checked against other running projects. A project's conflict %
 * is its overlap with the window times its load on the shared pool. Conflicts of 30% or more push the earliest start to
 * the day after the latest such project ends.
 */
export function simulate(rows: EstRow[], others: ConflictProject[]): SimResult {
  const from = rows.reduce((m, r) => (r.from < m ? r.from : m), rows[0].from)
  const to = rows.reduce((m, r) => (r.to > m ? r.to : m), rows[0].to)
  const days = durationDays(from, to)
  const conflicts: ConflictRow[] = others
    .map((o) => {
      const overlap = Math.max(0, Math.round((Math.min(toMs(to), toMs(o.end)) - Math.max(toMs(from), toMs(o.start))) / DAY) + 1)
      return { ...o, conflictPct: Math.round((overlap / days) * o.load * 100) }
    })
    .filter((c) => c.conflictPct > 0)
    .sort((a, b) => b.conflictPct - a.conflictPct)
  const blockers = conflicts.filter((c) => c.conflictPct >= BLOCKING_CONFLICT_PCT)
  const latest = blockers.reduce((m, c) => Math.max(m, toMs(c.end)), 0)
  const earliest = latest ? toIso(Math.max(toMs(from), latest + DAY)) : from
  return { earliestStart: earliest, durationDays: days, conflicts }
}
