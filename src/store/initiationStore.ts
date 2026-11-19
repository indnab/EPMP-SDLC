/**
 * Project Initiation store (demands, programs and initiation records). Kept apart from the QA store: it is its own
 * module and persists under its own key. Notifications are recorded as events on the record (portal + email in the
 * live system).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Demand, EstRow, InitEvent, InitiationRecord, InitRole, Lever, Program, Vcf } from '../domain/initiation'
import type { PlanItem, PmRow } from '../domain/planning'
import { emptyProgram, emptyVcf, nextId, todayIso, uid } from '../domain/initiation'

const lever = (name: string, kind: Lever['kind'], amounts: number[]): Lever => ({ id: uid('lv'), name, kind, amounts })
const sampleVcf = (scale = 1): Vcf => ({
  levers: [
    lever('Process automation savings', 'value', [0, 6, 9, 11, 12].map((x) => x * scale)),
    lever('Revenue uplift', 'value', [0, 3, 6, 8, 9].map((x) => x * scale)),
    lever('Implementation cost', 'cost', [10, 3, 1, 1, 1].map((x) => x * scale)),
    lever('Licences & support', 'cost', [2, 2, 2, 2, 2].map((x) => x * scale)),
  ],
  metrics: [{ id: uid('vm'), name: 'Cycle time reduction', target: '30%' }],
  ringi: { fileName: 'Ringi_approval.pdf', uploadedAt: '2026-08-14T10:00:00.000Z', allocatedBudget: 14 * scale },
  consumedBudget: 3 * scale,
  notes: '',
})

export const SEED_DEMANDS: Demand[] = [
  { demandId: 'DM-1001', title: 'Dealer onboarding portal', requestType: 'New', division: 'Sales & Marketing', coe: 'Digital CoE', approved: true, startDate: '2027-01-04', endDate: '2027-09-30', budget: 12 },
  { demandId: 'DM-1002', title: 'Supplier quality portal enhancements', requestType: 'ExistingApplication', division: 'Quality', coe: 'Quality CoE', approved: true, startDate: '2027-02-01', endDate: '2027-08-31', budget: 6, programId: 'PGM-2002' },
  { demandId: 'DM-1003', title: 'Warranty analytics', requestType: 'New', division: 'Customer Care', coe: null, approved: true, startDate: '2027-03-01', endDate: '2027-12-31', budget: 8 },
  { demandId: 'DM-1004', title: 'Connected vehicle platform phase 2', requestType: 'ExistingApplication', division: 'R&D', coe: 'Digital CoE', approved: true, startDate: '2027-01-15', endDate: '2027-10-15', budget: 18, programId: 'PGM-2001' },
  { demandId: 'DM-1005', title: 'Plant energy dashboard', requestType: 'New', division: 'Manufacturing', coe: 'Manufacturing CoE', approved: true, startDate: '2027-02-15', endDate: '2027-07-31', budget: 5 },
  { demandId: 'DM-1006', title: 'Vendor payment automation', requestType: 'New', division: 'Finance', coe: 'Digital CoE', approved: true, startDate: '2027-03-15', endDate: '2027-11-30', budget: 9 },
  { demandId: 'DM-1007', title: 'Spare parts demand forecasting', requestType: 'New', division: 'Supply Chain', coe: 'Digital CoE', approved: true, startDate: '2026-12-01', endDate: '2027-06-30', budget: 7 },
  { demandId: 'DM-1008', title: 'Showroom lead tracker', requestType: 'ExistingApplication', division: 'Sales & Marketing', coe: 'Digital CoE', approved: true, startDate: '2026-11-01', endDate: '2027-04-30', budget: 4, programId: 'PGM-2001' },
  { demandId: 'DM-1009', title: 'Driver app refresh', requestType: 'New', division: 'Customer Care', coe: null, approved: false, startDate: '2027-04-01', endDate: '2027-12-31', budget: 3 },
]

export const SEED_PROGRAMS: Program[] = [
  {
    programId: 'PGM-2001', name: 'Connected Vehicle Platform', type: 'Digital', description: 'Telematics and connected services for the vehicle range.', startYear: '2025',
    ownership: 'E1001: Ritu Malhotra', businessSpoc: 'E1003: Priya Nair', businessVertical: 'Sales & Marketing', dePillar: 'Digital Core', investmentCategory: 'Growth',
    classification: 'Transformation', division: 'R&D',
    vcfVersions: [
      { version: 1, savedAt: '2025-06-10T09:00:00.000Z', by: 'Business Partner', vcf: sampleVcf(1) },
      { version: 2, savedAt: '2026-03-02T09:00:00.000Z', by: 'Business Partner', vcf: sampleVcf(1.4) },
    ],
  },
  {
    programId: 'PGM-2002', name: 'Supplier Quality Portal', type: 'Quality', description: 'One portal for supplier quality records and approvals.', startYear: '2024',
    ownership: 'E1002: Sandeep Kulkarni', businessSpoc: 'E1004: Manoj Tiwari', businessVertical: 'Quality', dePillar: 'Data & Analytics', investmentCategory: 'Efficiency',
    classification: 'Enhancement', division: 'Quality',
    vcfVersions: [{ version: 1, savedAt: '2025-01-20T09:00:00.000Z', by: 'Business Partner', vcf: sampleVcf(0.8) }],
  },
]

const ev = (by: string, text: string, to?: string[]): InitEvent => ({ at: todayIso(), by, text, to })

/** A record at a given stage, for the seed (so each role's landing page has something to act on). */
function seedRecord(d: Demand, status: InitiationRecord['status'], extra: Partial<InitiationRecord> = {}): InitiationRecord {
  const base = newRecord(d)
  return { ...base, projectType: 'ARC-001', ...extra, status, events: [ev('Business Partner', 'Submitted for approval', ['BP Head'])] }
}

export function newRecord(d: Demand): InitiationRecord {
  const existing = d.requestType === 'ExistingApplication' && !!d.programId
  return {
    demandId: d.demandId,
    projectName: d.title,
    expectedStart: d.startDate,
    expectedEnd: d.endDate,
    projectType: '',
    manpower: [],
    requestPmEstimates: false,
    // Request on an existing application: application equals program, so the program is prefilled.
    programMode: existing ? 'existing' : '',
    programId: existing ? d.programId : undefined,
    newProgram: emptyProgram(),
    vcf: emptyVcf(),
    status: 'Draft',
    events: [],
  }
}

const D = (id: string) => SEED_DEMANDS.find((d) => d.demandId === id)!
export const SEED_RECORDS: Record<string, InitiationRecord> = {
  'DM-1004': seedRecord(D('DM-1004'), 'PendingBPHead', { programMode: 'existing', programId: 'PGM-2001', vcf: sampleVcf(1.6) }),
  'DM-1005': seedRecord(D('DM-1005'), 'PendingGovernance', {
    programMode: 'new', vcf: sampleVcf(0.7),
    newProgram: { name: 'Plant Energy Insights', type: 'Manufacturing', description: 'Energy monitoring across plants.', startYear: '2027', ownership: 'E1005: Kavita Joshi', businessSpoc: 'E1002: Sandeep Kulkarni', businessVertical: 'Manufacturing', dePillar: 'Smart Manufacturing', investmentCategory: 'Efficiency', classification: 'Transformation' },
  }),
  'DM-1006': seedRecord(D('DM-1006'), 'PendingCoE', { programMode: 'existing', programId: 'PGM-2002', vcf: sampleVcf(1.1) }),
  'DM-1007': seedRecord(D('DM-1007'), 'Approved', { programMode: 'existing', programId: 'PGM-2001', projectId: 'PID-3001', vcf: sampleVcf(1.2) }),
  'DM-1008': seedRecord(D('DM-1008'), 'Approved', {
    programMode: 'existing', programId: 'PGM-2001', projectId: 'PID-3002', pm: 'Aman Singh', vcf: sampleVcf(0.9),
    brd: { fileName: 'Showroom_lead_tracker_BRD.docx', uploadedAt: '2026-10-20T10:00:00.000Z' },
    pmEstimateStatus: 'Submitted',
    pmEstimates: [
      { id: 'pe1', skillset: 'Java Developer', headcount: 5, days: 13, utilization: 57 },
      { id: 'pe2', skillset: 'QA Engineer', headcount: 4, days: 13, utilization: 46 },
      { id: 'pe3', skillset: 'UI/UX Designer', headcount: 4, days: 13, utilization: 46 },
    ],
    schedule: { plannedStart: '2027-01-12', plannedEnd: '2027-06-30', earliestStart: '2027-01-12', status: 'Approved', usedPmEstimates: true },
    tagged: ['Neha Verma', 'Rakesh Gupta', 'Anita Sharma'],
  }),
}

interface InitiationState {
  demands: Demand[]
  programs: Program[]
  records: Record<string, InitiationRecord>
  /** The record for a demand, created as a draft on first open. */
  ensureRecord: (demandId: string) => InitiationRecord | undefined
  patch: (demandId: string, patch: Partial<InitiationRecord>) => void
  /** Business Partner submits the package (also resubmits after a send back). */
  submit: (demandId: string) => void
  /** BP Head, Governance Head or CoE Head decides. Comment is required for send back and reject (checked in the UI). */
  decide: (demandId: string, role: Extract<InitRole, 'BPHead' | 'GovernanceHead' | 'CoEHead'>, decision: 'approve' | 'sendBack' | 'reject', comment: string, sdlc: boolean) => void
  assignPm: (demandId: string, pm: string) => void
  /** Business Partner saves (draft) or submits the schedule. Submitting locks the Project Manager's estimates. */
  saveSchedule: (demandId: string, bpEstimates: EstRow[], schedule: NonNullable<InitiationRecord['schedule']>, submit: boolean) => void
  uploadBrd: (demandId: string, fileName: string) => void
  /** Project Manager saves (draft) or submits manpower estimates. Refused once the schedule is submitted. */
  savePmEstimates: (demandId: string, rows: PmRow[], submit: boolean) => void
  /** CoE Head decides the submitted schedule; may have adjusted the planned dates first. */
  decideSchedule: (demandId: string, decision: 'approve' | 'sendBack' | 'reject', comment: string, dates?: { plannedStart: string; plannedEnd: string }) => void
  tagResources: (demandId: string, names: string[]) => void
  /** Replace the WBS items (Project Manager grooming). Notifies owners newly assigned to an item. */
  saveWbs: (demandId: string, items: PlanItem[], wbs?: InitiationRecord['wbs']) => void
  submitWbs: (demandId: string) => void
  decideWbs: (demandId: string, decision: 'approve' | 'sendBack' | 'reject', comment: string, jira: boolean) => void
  reset: () => void
}

const upd = (s: InitiationState, id: string, fn: (r: InitiationRecord) => InitiationRecord) =>
  ({ records: { ...s.records, [id]: fn(s.records[id]) } })

export const useInitiationStore = create<InitiationState>()(
  persist(
    (set, get) => ({
      demands: SEED_DEMANDS,
      programs: SEED_PROGRAMS,
      records: SEED_RECORDS,
      ensureRecord: (demandId) => {
        const s = get()
        if (s.records[demandId]) return s.records[demandId]
        const d = s.demands.find((x) => x.demandId === demandId)
        if (!d || !d.approved || !d.coe) return undefined
        const r = newRecord(d)
        set({ records: { ...s.records, [demandId]: r } })
        return r
      },
      patch: (demandId, patch) => set((s) => upd(s, demandId, (r) => ({ ...r, ...patch }))),
      submit: (demandId) =>
        set((s) => upd(s, demandId, (r) => ({
          ...r, status: 'PendingBPHead', lastComment: undefined,
          events: [...r.events, ev('Business Partner', r.status === 'SentBack' ? 'Resubmitted for approval' : 'Submitted for approval', ['BP Head'])],
        }))),
      decide: (demandId, role, decision, comment, sdlc) =>
        set((s) => {
          const label = { BPHead: 'BP Head', GovernanceHead: 'Governance Head', CoEHead: 'CoE Head' }[role]
          const rec = s.records[demandId]
          if (!rec) return s
          if (decision !== 'approve') {
            const sent = decision === 'sendBack'
            return upd(s, demandId, (r) => ({
              ...r, status: sent ? 'SentBack' : 'Rejected', lastComment: comment,
              events: [...r.events, ev(label, `${sent ? 'Sent back' : 'Rejected'}: ${comment}`, ['Business Partner'])],
            }))
          }
          if (role === 'BPHead') {
            const next = rec.programMode === 'new' ? 'PendingGovernance' : 'PendingCoE'
            return upd(s, demandId, (r) => ({
              ...r, status: next, lastComment: undefined,
              events: [...r.events, ev(label, 'Approved', [next === 'PendingGovernance' ? 'Governance Head' : 'CoE Head', 'Business Partner'])],
            }))
          }
          if (role === 'GovernanceHead') {
            // New program: the Program ID is created now and the package goes to the CoE Head.
            const d = s.demands.find((x) => x.demandId === demandId)
            const pid = nextId('PGM-', s.programs.map((p) => p.programId), 2001)
            const program: Program = { ...rec.newProgram, programId: pid, division: d?.division ?? '', vcfVersions: [{ version: 1, savedAt: todayIso(), by: 'Business Partner', vcf: rec.vcf }] }
            return {
              programs: [...s.programs, program],
              ...upd(s, demandId, (r) => ({
                ...r, status: 'PendingCoE', createdProgramId: pid, programId: pid, lastComment: undefined,
                events: [...r.events, ev(label, `Approved. Program ID ${pid} created`, ['Business Partner', 'CoE Head'])],
              })),
            }
          }
          // CoE Head: Project ID is created; Business User is asked for the BRD; SDLC projects also trigger JIRA.
          const projectId = nextId('PID-', Object.values(s.records).map((r) => r.projectId ?? ''), 3001)
          return upd(s, demandId, (r) => ({
            ...r, status: 'Approved', projectId, lastComment: undefined,
            events: [...r.events, ev(label, `Approved. Project ID ${projectId} created`, ['Business Partner', 'Business User']),
              ...(sdlc ? [ev('System', 'JIRA workspace creation requested', ['JIRA Admin'])] : [])],
          }))
        }),
      assignPm: (demandId, pm) =>
        set((s) => upd(s, demandId, (r) => ({ ...r, pm, events: [...r.events, ev('CoE Head', `Project Manager set to ${pm}`, [pm, 'Business Partner'])] }))),
      saveSchedule: (demandId, bpEstimates, schedule, submit) =>
        set((s) => upd(s, demandId, (r) => ({
          ...r, bpEstimates, schedule: { ...schedule, status: submit ? 'Submitted' : 'Draft' },
          events: submit
            ? [...r.events, ev('Business Partner', `Schedule submitted (${schedule.plannedStart} to ${schedule.plannedEnd})`, ['CoE Head', ...(r.pm ? [r.pm] : [])])]
            : r.events,
        }))),
      uploadBrd: (demandId, fileName) =>
        set((s) => upd(s, demandId, (r) => ({ ...r, brd: { fileName, uploadedAt: todayIso() }, events: [...r.events, ev('Business User', `BRD uploaded: ${fileName}`, ['Business Partner'])] }))),
      savePmEstimates: (demandId, rows, submit) =>
        set((s) => {
          const r = s.records[demandId]
          if (!r || r.schedule?.status === 'Submitted' || r.schedule?.status === 'Approved') return s
          return upd(s, demandId, (x) => ({
            ...x, pmEstimates: rows, pmEstimateStatus: submit ? 'Submitted' : 'Draft',
            events: submit ? [...x.events, ev('Project Manager', 'Manpower estimates submitted', ['Business Partner'])] : x.events,
          }))
        }),
      decideSchedule: (demandId, decision, comment, dates) =>
        set((s) => upd(s, demandId, (r) => {
          if (!r.schedule) return r
          const status = decision === 'approve' ? 'Approved' : decision === 'sendBack' ? 'SentBack' : 'Rejected'
          const sch = { ...r.schedule, ...(dates ?? {}), status, lastComment: comment || undefined } as NonNullable<InitiationRecord['schedule']>
          const text = decision === 'approve' ? `Schedule approved (${sch.plannedStart} to ${sch.plannedEnd})` : `Schedule ${decision === 'sendBack' ? 'sent back' : 'rejected'}: ${comment}`
          return { ...r, schedule: sch, events: [...r.events, ev('CoE Head', text, ['Business Partner', ...(r.pm ? [r.pm] : [])])] }
        })),
      tagResources: (demandId, names) =>
        set((s) => upd(s, demandId, (r) => ({ ...r, tagged: names, events: [...r.events, ev('Project Manager', `Resources tagged: ${names.join(', ') || 'none'}`, ['Resource Manager'])] }))),
      saveWbs: (demandId, items, wbs) =>
        set((s) => upd(s, demandId, (r) => {
          const base = wbs ?? r.wbs
          if (!base) return r
          const before = new Map((r.wbs?.items ?? []).map((i) => [i.id, i.owner]))
          // Each owner newly assigned to an item is notified.
          const notes = items.filter((i) => i.owner && before.get(i.id) !== i.owner).map((i) => ev('Project Manager', `${i.name} assigned to ${i.owner}`, [i.owner!]))
          return { ...r, wbs: { ...base, items }, events: [...r.events, ...notes] }
        })),
      submitWbs: (demandId) =>
        set((s) => upd(s, demandId, (r) => r.wbs ? ({
          ...r, wbs: { ...r.wbs, status: 'Submitted', lastComment: undefined },
          events: [...r.events, ev('Project Manager', 'WBS submitted for approval', ['CoE Head'])],
        }) : r)),
      decideWbs: (demandId, decision, comment, jira) =>
        set((s) => upd(s, demandId, (r) => {
          if (!r.wbs) return r
          const status = decision === 'approve' ? 'Approved' : decision === 'sendBack' ? 'SentBack' : 'Rejected'
          // Approval locks every row: the plan becomes the execution baseline.
          const items = decision === 'approve' ? r.wbs.items.map((i) => ({ ...i, locked: true })) : r.wbs.items
          const text = decision === 'approve' ? 'WBS approved. The plan is now the baseline' : `WBS ${decision === 'sendBack' ? 'sent back' : 'rejected'}: ${comment}`
          return {
            ...r, wbs: { ...r.wbs, items, status, lastComment: comment || undefined },
            events: [...r.events, ev('CoE Head', text, [...(r.pm ? [r.pm] : []), 'Business Partner']),
              ...(decision === 'approve' && jira ? [ev('System', 'JIRA workspace requested for the JIRA-defined milestones', ['JIRA Admin'])] : [])],
          }
        })),
      reset: () => set({ demands: SEED_DEMANDS, programs: SEED_PROGRAMS, records: SEED_RECORDS }),
    }),
    { name: 'epmp-initiation', version: 3, migrate: () => ({}) }
  )
)
