/**
 * Project Initiation form: Project Details → Program → VCF → Submission.
 * The Business Partner edits while the record is a Draft or Sent back. Approvers (BP Head, Governance Head, CoE Head)
 * open the same pages read-only and decide on the Submission tab.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Modal, PageHeader, Tabs } from '../../components'
import { Icon } from '../../components/Icon'
import { useInitiationStore } from '../../store/initiationStore'
import { useQAStore } from '../../store/qaStore'
import type { InitiationRecord, Lever, ManpowerRow, ProgramDetails, Vcf, VcfVersion } from '../../domain/initiation'
import {
  BUSINESS_VERTICALS, DE_PILLARS, HRMS_EMPLOYEES, INVESTMENT_CATEGORIES, IRR_HURDLE, LEVER_YEARS, PROGRAM_CLASSIFICATIONS, PROGRAM_TYPES, SKILLSETS,
  fmtCr, fmtPct, summarize, uid, validateDetails, validateProgram, validateVcf,
} from '../../domain/initiation'
import { Field, NoInitAccess, StatusChip, cellCls, fmtD, inputCls, programNameOf, useInitRole } from './shared'

type Tab = 'details' | 'program' | 'vcf' | 'submit'
const TAB_LABEL: Record<Tab, string> = { details: 'Project Details', program: 'Program', vcf: 'VCF', submit: 'Submission' }

const copyVcf = (v: Vcf): Vcf => structuredClone(v)

export function InitiationFormPage() {
  const { demandId = '' } = useParams<{ demandId: string }>()
  const role = useInitRole()
  const navigate = useNavigate()
  const { demands, programs, records, ensureRecord, patch, submit, decide } = useInitiationStore()
  const archetypes = useQAStore((s) => s.archetypes)
  const demand = demands.find((d) => d.demandId === demandId)
  const [tab, setTab] = useState<Tab>('details')
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState<null | 'submit' | 'approve'>(null)
  const [decision, setDecision] = useState<null | 'sendBack' | 'reject'>(null)
  const [comment, setComment] = useState('')
  const [viewVersion, setViewVersion] = useState<VcfVersion | null>(null)
  const [openProgram, setOpenProgram] = useState(true)

  // A Business Partner opening an eligible demand creates its draft.
  useEffect(() => { if (role === 'BusinessPartner' && demandId) ensureRecord(demandId) }, [role, demandId, ensureRecord])
  const rec = records[demandId]

  const projectTypes = useMemo(() => archetypes.filter((a) => a.active && a.status !== 'Draft'), [archetypes])
  if (!role) return (<div><PageHeader title="Project Initiation" section="Project" /><NoInitAccess /></div>)
  if (!demand || !rec) {
    return (
      <div className="py-20 text-center text-[var(--color-muted)]">
        <p className="font-medium">{demand ? 'No project has been started for this demand yet.' : 'Demand not found'}</p>
        <Link to="/initiation" className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline">← Back to Project Initiation</Link>
      </div>
    )
  }

  const editable = role === 'BusinessPartner' && (rec.status === 'Draft' || rec.status === 'SentBack')
  const set = (p: Partial<InitiationRecord>) => patch(demandId, p)
  const eDetails = validateDetails(rec), eProgram = validateProgram(rec), eVcf = validateVcf(rec)
  const allErrors = { ...eDetails, ...eProgram, ...eVcf }
  const invalid = Object.keys(allErrors).length > 0
  const err = (e: Record<string, string>, k: string) => (showErrors ? e[k] : undefined)
  const selectedArchetype = projectTypes.find((a) => a.id === rec.projectType) ?? archetypes.find((a) => a.id === rec.projectType)
  const program = rec.programMode === 'existing' ? programs.find((p) => p.programId === rec.programId) : undefined
  const sum = summarize(rec.vcf)
  const mine =
    (role === 'BPHead' && rec.status === 'PendingBPHead') ||
    (role === 'GovernanceHead' && rec.status === 'PendingGovernance') ||
    (role === 'CoEHead' && rec.status === 'PendingCoE')

  const choosePage = (t: Tab) => {
    // Linked-program path: the project VCF starts from the program's latest VCF.
    if (t === 'vcf' && editable && rec.programMode === 'existing' && program && rec.vcf.levers.length === 0) {
      set({ vcf: copyVcf(program.vcfVersions[program.vcfVersions.length - 1].vcf) })
    }
    setTab(t)
  }

  const doSubmit = () => {
    setShowErrors(true)
    if (invalid) {
      setConfirm(null)
      setTab(Object.keys(eDetails).length ? 'details' : Object.keys(eProgram).length ? 'program' : 'vcf')
      return
    }
    submit(demandId)
    navigate('/initiation')
  }
  const doDecide = (d: 'approve' | 'sendBack' | 'reject') => {
    if (role !== 'BPHead' && role !== 'GovernanceHead' && role !== 'CoEHead') return
    decide(demandId, role, d, comment.trim(), !!selectedArchetype?.sdlc)
    navigate('/initiation')
  }

  return (
    <div className="pb-24">
      <PageHeader title={demand.demandId} section="Project Initiation" crumb={`${demand.demandId} · ${rec.projectName || demand.title}`} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10.5px] text-[var(--color-muted)]">{demand.demandId}</span>
          <StatusChip status={rec.status} />
          {rec.projectId && <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-primary">{rec.projectId}</span>}
          {(rec.programId ?? rec.createdProgramId) && <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-primary">{rec.programId ?? rec.createdProgramId}</span>}
          <span className="ml-auto text-[10.5px] text-[var(--color-muted)]">{demand.division} · {demand.coe} · Budget {fmtCr(demand.budget)}</span>
        </div>
        {!editable && <p className="mt-2 text-[10.5px] text-[var(--color-muted)]">Read-only{role === 'BusinessPartner' ? ' · submitted for approval' : ''}.</p>}
        {rec.status === 'SentBack' && rec.lastComment && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900"><strong>Sent back:</strong> {rec.lastComment}</p>
        )}
        {rec.status === 'Rejected' && rec.lastComment && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800"><strong>Rejected:</strong> {rec.lastComment}. This record is closed.</p>
        )}
      </Card>

      <Tabs className="mb-4" activeId={tab} onChange={(id) => choosePage(id as Tab)}
        items={(Object.keys(TAB_LABEL) as Tab[]).map((t) => ({ id: t, label: TAB_LABEL[t] }))} />

      {tab === 'details' && (
        <Card>
          <h2 className="m-0 mb-3 text-[13px] font-semibold text-[#101828]">Project Details</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Demand ID" required>
              <input value={demand.demandId} disabled className={inputCls} />
            </Field>
            <Field label="Project Name" required error={err(eDetails, 'projectName')}>
              <input value={rec.projectName} disabled={!editable} maxLength={120} onChange={(e) => set({ projectName: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Expected Start Date" required error={err(eDetails, 'expectedStart')}>
              <input type="date" value={rec.expectedStart} disabled={!editable} onChange={(e) => set({ expectedStart: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Expected End Date" required error={err(eDetails, 'expectedEnd')}>
              <input type="date" value={rec.expectedEnd} min={rec.expectedStart} disabled={!editable} onChange={(e) => set({ expectedEnd: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Project Type" required error={err(eDetails, 'projectType')}>
              <select value={rec.projectType} disabled={!editable} onChange={(e) => set({ projectType: e.target.value })} className={inputCls}>
                <option value="">Select a project archetype…</option>
                {projectTypes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>
          <ManpowerGrid rec={rec} editable={editable} errors={showErrors ? eDetails : {}} onChange={(manpower, requestPmEstimates) => set({ manpower, requestPmEstimates })} />
        </Card>
      )}

      {tab === 'program' && (
        <Card>
          <h2 className="m-0 mb-3 text-[13px] font-semibold text-[#101828]">Program</h2>
          <div className="mb-4 flex flex-wrap gap-6">
            {(['existing', 'new'] as const).map((m) => (
              <label key={m} className="flex items-center gap-2 text-[11.5px] text-[#344054]">
                <input type="radio" name="programMode" checked={rec.programMode === m} disabled={!editable}
                  onChange={() => set(m === 'existing'
                    ? { programMode: 'existing', vcf: { levers: [], metrics: [], consumedBudget: 0, notes: '' } }
                    : { programMode: 'new', programId: undefined, vcf: { levers: [], metrics: [], consumedBudget: 0, notes: '' } })} />
                {m === 'existing' ? 'Link to an existing program' : 'Create a new program'}
              </label>
            ))}
          </div>
          {err(eProgram, 'programMode') && <p className="mb-3 text-[10.5px] text-red-600">{err(eProgram, 'programMode')}</p>}

          {rec.programMode === 'existing' && (
            <>
              <div className="mb-3 max-w-md">
                <Field label="Program" required error={err(eProgram, 'programId')}>
                  <select value={rec.programId ?? ''} disabled={!editable} className={inputCls}
                    onChange={(e) => set({ programId: e.target.value || undefined, vcf: { levers: [], metrics: [], consumedBudget: 0, notes: '' } })}>
                    <option value="">Search or select a program…</option>
                    {programs.map((p) => <option key={p.programId} value={p.programId}>{p.programId} · {p.name}</option>)}
                  </select>
                </Field>
                {demand.requestType === 'ExistingApplication' && <p className="mt-1 text-[10.5px] text-[var(--color-muted)]">This request is on an existing application, so its program is prefilled.</p>}
              </div>
              {program && (
                <div className="rounded-lg border border-[var(--color-border)]">
                  <button type="button" onClick={() => setOpenProgram((o) => !o)} aria-expanded={openProgram}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[11.5px] font-semibold text-[#101828]">
                    Program details <span className="text-[10.5px] font-normal text-[var(--color-muted)]">{openProgram ? 'Collapse' : 'Expand'}</span>
                  </button>
                  {openProgram && <ProgramReadOnly p={program} />}
                </div>
              )}
            </>
          )}

          {rec.programMode === 'new' && (
            <>
              <div className="mb-3 max-w-md">
                <Field label="Search existing program"><input disabled placeholder="Disabled while creating a new program" className={inputCls} /></Field>
              </div>
              <NewProgramForm p={rec.newProgram} editable={editable} errors={showErrors ? eProgram : {}} onChange={(np) => set({ newProgram: np })} />
            </>
          )}
        </Card>
      )}

      {tab === 'vcf' && (
        <VcfTab rec={rec} program={program} editable={editable} errors={showErrors ? eVcf : {}} onChange={(vcf) => set({ vcf })}
          onViewVersion={setViewVersion} />
      )}

      {tab === 'submit' && (
        <Card>
          <h2 className="m-0 mb-3 text-[13px] font-semibold text-[#101828]">{rec.programMode === 'new' ? 'Program & Project Submission' : 'Project Submission'}</h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-[11.5px] md:grid-cols-2">
            <Item k="Program Name" v={programNameOf(rec, programs)} />
            <Item k="Division Name" v={demand.division} />
            <Item k="CoE Name" v={demand.coe ?? '—'} />
            <Item k="Project Name" v={rec.projectName} />
            <div className="md:col-span-2"><Item k="Program Description" v={(program?.description ?? rec.newProgram.description) || '—'} /></div>
            <Item k="Investment" v={fmtCr(sum.investment)} />
            <Item k="Returns" v={fmtCr(sum.returns)} />
            <Item k="Return on Investment" v={sum.roi === null ? '—' : `${sum.roi.toFixed(1)}%`} />
            <Item k="Approval path" v={rec.programMode === 'new' ? 'BP Head → Governance Head (Program ID) → CoE Head (Project ID)' : 'BP Head → CoE Head (Project ID)'} />
          </dl>
          {showErrors && invalid && (
            <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800">
              Complete the missing details first: {Object.keys(eDetails).length ? 'Project Details' : ''}{Object.keys(eProgram).length ? ' Program' : ''}{Object.keys(eVcf).length ? ' VCF' : ''}.
            </div>
          )}
          <h3 className="mb-2 mt-5 text-[12px] font-semibold text-[#101828]">History</h3>
          {rec.events.length === 0 ? <p className="text-[11px] text-[var(--color-muted)]">Nothing submitted yet.</p> : (
            <ul className="space-y-1.5 text-[11px] text-[#344054]">
              {rec.events.map((e, i) => (
                <li key={i}><span className="text-[var(--color-muted)]">{fmtD(e.at)}</span> · <strong>{e.by}</strong>: {e.text}{e.to?.length ? <span className="text-[var(--color-muted)]"> · notified {e.to.join(', ')}</span> : null}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="fixed bottom-0 right-0 z-30 flex justify-end gap-3 border-t border-[var(--color-border)] bg-white/90 px-7 py-3 backdrop-blur left-0 lg:left-[var(--nav-w)]">
        <Button variant="secondary" size="md" onClick={() => navigate('/initiation')}>{editable ? 'Cancel' : 'Back'}</Button>
        {editable && tab !== 'submit' && (
          <Button variant="primary" size="md" onClick={() => choosePage((['details', 'program', 'vcf', 'submit'] as Tab[])[(['details', 'program', 'vcf', 'submit'] as Tab[]).indexOf(tab) + 1])}>Next</Button>
        )}
        {editable && tab === 'submit' && <Button variant="primary" size="md" onClick={() => { setShowErrors(true); if (invalid) doSubmit(); else setConfirm('submit') }}>Submit</Button>}
        {mine && (
          <>
            <Button variant="secondary" size="md" onClick={() => { setComment(''); setDecision('reject') }}>Reject</Button>
            <Button variant="secondary" size="md" onClick={() => { setComment(''); setDecision('sendBack') }}>Send Back</Button>
            <Button variant="primary" size="md" onClick={() => setConfirm('approve')}>Approve</Button>
          </>
        )}
      </div>

      {confirm && (
        <Modal open onClose={() => setConfirm(null)} size="sm" title={confirm === 'submit' ? 'Submit for approval?' : 'Approve this submission?'}
          footer={<>
            <Button variant="secondary" size="md" onClick={() => setConfirm(null)}>No</Button>
            <Button variant="primary" size="md" onClick={() => (confirm === 'submit' ? doSubmit() : doDecide('approve'))}>Yes</Button>
          </>}>
          <p className="text-[11.5px] text-[#344054]">
            {confirm === 'submit'
              ? 'The package goes to the Business Partner Head. You cannot edit it while it is under review.'
              : role === 'GovernanceHead' ? 'Approving creates the Program ID and sends the project to the CoE Head.'
              : role === 'CoEHead' ? 'Approving creates the Project ID, asks the Business User for the BRD' + (selectedArchetype?.sdlc ? ' and requests the JIRA workspace.' : '.')
              : rec.programMode === 'new' ? 'The package moves to the Governance Head.' : 'The package moves to the CoE Head.'}
          </p>
        </Modal>
      )}
      {decision && (
        <Modal open onClose={() => setDecision(null)} size="sm" title={decision === 'sendBack' ? 'Send back for changes' : 'Reject'}
          footer={<>
            <Button variant="secondary" size="md" onClick={() => setDecision(null)}>Cancel</Button>
            <Button variant="primary" size="md" disabled={!comment.trim()} onClick={() => doDecide(decision)}>{decision === 'sendBack' ? 'Send back' : 'Reject'}</Button>
          </>}>
          <p className="mb-2 text-[11.5px] text-[#344054]">{decision === 'sendBack' ? 'The Business Partner can edit and resubmit.' : 'The record stays in a terminated state.'}</p>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Comment <span className="text-red-500">*</span></span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] p-2 text-[11.5px]" />
          </label>
        </Modal>
      )}
      {viewVersion && <VersionModal version={viewVersion} programName={program?.name ?? ''} onClose={() => setViewVersion(null)} />}
    </div>
  )
}

const Item = ({ k, v }: { k: string; v: string }) => (
  <div><dt className="text-[10.5px] text-[var(--color-muted)]">{k}</dt><dd className="m-0 font-medium text-[#101828]">{v}</dd></div>
)

function ManpowerGrid({ rec, editable, errors, onChange }: {
  rec: InitiationRecord; editable: boolean; errors: Record<string, string>
  onChange: (rows: ManpowerRow[], requestPm: boolean) => void
}) {
  const rows = rec.manpower
  const locked = rec.requestPmEstimates || !editable
  const setRow = (id: string, p: Partial<ManpowerRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)), rec.requestPmEstimates)
  return (
    <div className="mt-6">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="m-0 text-[12px] font-semibold text-[#101828]">Manpower Estimates <span className="font-normal text-[var(--color-muted)]">(optional)</span></h3>
        <label className="ml-auto flex items-center gap-2 text-[11px] text-[#344054]">
          <input type="checkbox" checked={rec.requestPmEstimates} disabled={!editable} onChange={(e) => onChange(rows, e.target.checked)} />
          Request manpower estimates from Project Manager
        </label>
      </div>
      <div className={`table-scroll rounded-lg border border-[var(--color-border)] ${rec.requestPmEstimates ? 'opacity-50' : ''}`}>
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[10.5px] font-medium text-[#344054]">
              <th className="min-w-[180px] px-3 py-2">Skillset</th><th className="w-24 px-3 py-2">Headcount</th><th className="w-40 px-3 py-2">Start Date</th>
              <th className="w-40 px-3 py-2">End Date</th><th className="w-32 px-3 py-2">Utilization %</th>{!locked && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-[var(--color-muted)]">{rec.requestPmEstimates ? 'The Project Manager will provide the estimates.' : 'No rows. Add a skillset to estimate manpower.'}</td></tr>}
            {rows.map((m, i) => (
              <tr key={m.id} className="border-b border-[var(--color-border)] last:border-0 align-top">
                <td className="px-3 py-1.5"><select value={m.skillset} disabled={locked} aria-label={`Skillset ${i + 1}`} onChange={(e) => setRow(m.id, { skillset: e.target.value })} className={cellCls}>
                  <option value="">Select…</option>{SKILLSETS.map((s) => <option key={s}>{s}</option>)}</select>{errors[`mp.${i}.skillset`] && <span className="text-[10px] text-red-600">{errors[`mp.${i}.skillset`]}</span>}</td>
                <td className="px-3 py-1.5"><input type="number" min={1} value={m.headcount || ''} disabled={locked} aria-label={`Headcount ${i + 1}`} onChange={(e) => setRow(m.id, { headcount: Number(e.target.value) })} className={cellCls} />{errors[`mp.${i}.headcount`] && <span className="text-[10px] text-red-600">{errors[`mp.${i}.headcount`]}</span>}</td>
                <td className="px-3 py-1.5"><input type="date" value={m.startDate} disabled={locked} aria-label={`Start ${i + 1}`} onChange={(e) => setRow(m.id, { startDate: e.target.value })} className={cellCls} /></td>
                <td className="px-3 py-1.5"><input type="date" value={m.endDate} min={m.startDate} disabled={locked} aria-label={`End ${i + 1}`} onChange={(e) => setRow(m.id, { endDate: e.target.value })} className={cellCls} />{errors[`mp.${i}.endDate`] && <span className="text-[10px] text-red-600">{errors[`mp.${i}.endDate`]}</span>}</td>
                <td className="px-3 py-1.5"><input type="number" min={1} max={100} value={m.utilization || ''} disabled={locked} aria-label={`Utilization ${i + 1}`} onChange={(e) => setRow(m.id, { utilization: Number(e.target.value) })} className={cellCls} />{errors[`mp.${i}.utilization`] && <span className="text-[10px] text-red-600">{errors[`mp.${i}.utilization`]}</span>}</td>
                {!locked && <td className="px-2 py-1.5"><button type="button" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter((r) => r.id !== m.id), false)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[#fef2f2] hover:text-[var(--color-destructive)]"><Icon name="close" size={14} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!locked && (
        <button type="button" onClick={() => onChange([...rows, { id: uid('mp'), skillset: '', headcount: 1, startDate: rec.expectedStart, endDate: rec.expectedEnd, utilization: 100 }], false)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-secondary)]">
          <Icon name="circle-plus" size={16} /> Add skillset
        </button>
      )}
    </div>
  )
}

function ProgramReadOnly({ p }: { p: ProgramDetails & { programId?: string } }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2 border-t border-[var(--color-border)] px-3 py-3 text-[11.5px] md:grid-cols-3">
      {p.programId && <Item k="Program ID" v={p.programId} />}
      <Item k="Program Name" v={p.name} /><Item k="Type of Program" v={p.type} /><Item k="Starting Year" v={p.startYear} />
      <Item k="Program Ownership" v={p.ownership} /><Item k="Business SPOC" v={p.businessSpoc} /><Item k="Business Vertical" v={p.businessVertical} />
      <Item k="DE Pillar" v={p.dePillar} /><Item k="Investment Category" v={p.investmentCategory} /><Item k="Program Classification" v={p.classification} />
      <div className="md:col-span-3"><Item k="Program Description" v={p.description} /></div>
    </dl>
  )
}

function NewProgramForm({ p, editable, errors, onChange }: { p: ProgramDetails; editable: boolean; errors: Record<string, string>; onChange: (p: ProgramDetails) => void }) {
  const text = (k: keyof ProgramDetails, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <Field label={label} required error={errors[`np.${k}`]}>
      <input value={p[k]} disabled={!editable} onChange={(e) => onChange({ ...p, [k]: e.target.value })} className={inputCls} {...extra} />
    </Field>
  )
  const pick = (k: keyof ProgramDetails, label: string, options: string[]) => (
    <Field label={label} required error={errors[`np.${k}`]}>
      <select value={p[k]} disabled={!editable} onChange={(e) => onChange({ ...p, [k]: e.target.value })} className={inputCls}>
        <option value="">Select…</option>{options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </Field>
  )
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {text('name', 'Program Name', { maxLength: 120 })}
      {pick('type', 'Type of Program', PROGRAM_TYPES)}
      <div className="md:col-span-2">
        <Field label="Program Description" required error={errors['np.description']}>
          <textarea value={p.description} disabled={!editable} rows={2} onChange={(e) => onChange({ ...p, description: e.target.value })} className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] p-2 text-[11.5px] disabled:opacity-70" />
        </Field>
      </div>
      {text('startYear', 'Program Starting Year', { inputMode: 'numeric', maxLength: 4, placeholder: 'e.g. 2027' })}
      {pick('ownership', 'Program Ownership (HRMS)', HRMS_EMPLOYEES)}
      {pick('businessSpoc', 'Business SPOC (HRMS)', HRMS_EMPLOYEES)}
      {pick('businessVertical', 'Business Vertical', BUSINESS_VERTICALS)}
      {pick('dePillar', 'DE Pillars', DE_PILLARS)}
      {pick('investmentCategory', 'Investment Category', INVESTMENT_CATEGORIES)}
      {pick('classification', 'Program Classification', PROGRAM_CLASSIFICATIONS)}
    </div>
  )
}

function VcfTab({ rec, program, editable, errors, onChange, onViewVersion }: {
  rec: InitiationRecord
  program?: { programId: string; name: string; investmentCategory: string; classification: string; vcfVersions: VcfVersion[] }
  editable: boolean
  errors: Record<string, string>
  onChange: (v: Vcf) => void
  onViewVersion: (v: VcfVersion) => void
}) {
  const v = rec.vcf
  const linked = rec.programMode === 'existing'
  const sum = summarize(v)
  const setLever = (id: string, p: Partial<Lever>) => onChange({ ...v, levers: v.levers.map((l) => (l.id === id ? { ...l, ...p } : l)) })
  const setAmount = (l: Lever, i: number, val: string) => setLever(l.id, { amounts: l.amounts.map((a, j) => (j === i ? Number(val) || 0 : a)) })
  const canAdd = editable && !linked
  const kinds: Lever['kind'][] = ['value', 'cost']
  const np = rec.newProgram
  if (rec.programMode === '') return <Card><p className="py-6 text-center text-[11.5px] text-[var(--color-muted)]">Choose an existing or new program on the Program tab first.</p></Card>
  if (linked && !program) return <Card><p className="py-6 text-center text-[11.5px] text-[var(--color-muted)]">Select a program on the Program tab first.</p></Card>
  return (
    <>
      <Card className="mb-4">
        <h2 className="m-0 mb-3 text-[13px] font-semibold text-[#101828]">{linked ? 'Project VCF (linked program)' : 'Program VCF (first version)'}</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-[11.5px] md:grid-cols-3">
          <Item k="Program Name" v={linked ? program!.name : np.name || '—'} />
          <Item k="Investment Category" v={(linked ? program!.investmentCategory : np.investmentCategory) || '—'} />
          <Item k="Program Classification" v={(linked ? program!.classification : np.classification) || '—'} />
        </dl>
        {linked && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="text-[10.5px] font-medium text-[#344054]" htmlFor="prev-vcf">Previous VCF versions</label>
            <select id="prev-vcf" value="" onChange={(e) => { const x = program!.vcfVersions.find((z) => String(z.version) === e.target.value); if (x) onViewVersion(x) }}
              className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]">
              <option value="">Select a version to view…</option>
              {program!.vcfVersions.map((x) => <option key={x.version} value={x.version}>Version {x.version} · {fmtD(x.savedAt)}</option>)}
            </select>
            <span className="text-[10.5px] text-[var(--color-muted)]">Reference only. Only existing levers can be updated for this project.</span>
          </div>
        )}
      </Card>

      {kinds.map((k) => {
        const list = v.levers.filter((l) => l.kind === k)
        return (
          <Card key={k} flush className="mb-4 !overflow-visible">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
              <h3 className="m-0 text-[12px] font-semibold text-[#101828]">{k === 'value' ? 'Value Levers' : 'Cost Levers'} <span className="font-normal text-[var(--color-muted)]">(₹ Cr)</span></h3>
              {canAdd && <button type="button" onClick={() => onChange({ ...v, levers: [...v.levers, { id: uid('lv'), name: '', kind: k, amounts: LEVER_YEARS.map(() => 0) }] })}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-secondary)]"><Icon name="circle-plus" size={16} /> Add {k} lever</button>}
            </div>
            <div className="table-scroll">
              <table className="w-full text-[11.5px]">
                <thead><tr className="border-b border-[var(--color-border)] bg-[#f8faff] text-left text-[10.5px] font-medium text-[#344054]">
                  <th className="min-w-[220px] px-3 py-2">Lever</th>{LEVER_YEARS.map((y) => <th key={y} className="w-24 px-3 py-2">{y}</th>)}{canAdd && <th className="w-10" />}
                </tr></thead>
                <tbody>
                  {list.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-[var(--color-muted)]">No {k} levers.</td></tr>}
                  {list.map((l) => {
                    const idx = v.levers.indexOf(l)
                    return (
                      <tr key={l.id} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-3 py-1.5"><input value={l.name} disabled={!canAdd} aria-label="Lever name" onChange={(e) => setLever(l.id, { name: e.target.value })} className={cellCls} />{errors[`lever.${idx}`] && <span className="text-[10px] text-red-600">{errors[`lever.${idx}`]}</span>}</td>
                        {LEVER_YEARS.map((y, i) => <td key={y} className="px-3 py-1.5"><input type="number" min={0} value={l.amounts[i]} disabled={!editable} aria-label={`${l.name || 'Lever'} ${y}`} onChange={(e) => setAmount(l, i, e.target.value)} className={cellCls} /></td>)}
                        {canAdd && <td className="px-2"><button type="button" aria-label="Remove lever" onClick={() => onChange({ ...v, levers: v.levers.filter((x) => x.id !== l.id) })} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-destructive)]"><Icon name="close" size={14} /></button></td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}
      {errors.levers && <p className="mb-3 text-[10.5px] text-red-600">{errors.levers}</p>}

      <Card className="mb-4">
        <h3 className="m-0 mb-2 text-[12px] font-semibold text-[#101828]">Value Metrics</h3>
        <div className="space-y-2">
          {v.metrics.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <input value={m.name} disabled={!canAdd} aria-label="Metric" onChange={(e) => onChange({ ...v, metrics: v.metrics.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)) })} className={inputCls + ' flex-1'} />
              <input value={m.target} disabled={!editable} aria-label="Target" placeholder="Target" onChange={(e) => onChange({ ...v, metrics: v.metrics.map((x) => (x.id === m.id ? { ...x, target: e.target.value } : x)) })} className={inputCls + ' w-32'} />
              {canAdd && <button type="button" aria-label="Remove metric" onClick={() => onChange({ ...v, metrics: v.metrics.filter((x) => x.id !== m.id) })} className="text-[var(--color-muted)] hover:text-[var(--color-destructive)]"><Icon name="close" size={14} /></button>}
            </div>
          ))}
          {v.metrics.length === 0 && <p className="text-[11px] text-[var(--color-muted)]">No value metrics.</p>}
        </div>
        {canAdd && <button type="button" onClick={() => onChange({ ...v, metrics: [...v.metrics, { id: uid('vm'), name: '', target: '' }] })} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-secondary)]"><Icon name="circle-plus" size={16} /> Add metric</button>}
      </Card>

      <Card className="mb-4">
        <h3 className="m-0 mb-3 text-[12px] font-semibold text-[#101828]">Budget & Ringi</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={`Upload Ringi${linked ? '' : ' (optional)'}`}>
            <input type="file" disabled={!editable} aria-label="Upload Ringi" className="block w-full text-[11px]"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange({ ...v, ringi: { fileName: f.name, uploadedAt: new Date().toISOString(), allocatedBudget: v.ringi?.allocatedBudget ?? 0 } }) }} />
            {v.ringi && <span className="mt-1 block text-[10.5px] text-[var(--color-muted)]">{v.ringi.fileName} · uploaded {fmtD(v.ringi.uploadedAt)}</span>}
          </Field>
          <Field label="Allocated budget (₹ Cr)">
            <input type="number" min={0} value={v.ringi?.allocatedBudget ?? ''} disabled={!editable || !v.ringi} onChange={(e) => onChange({ ...v, ringi: v.ringi && { ...v.ringi, allocatedBudget: Number(e.target.value) || 0, uploadedAt: new Date().toISOString() } })} className={inputCls} />
            {!v.ringi && <span className="mt-1 block text-[10.5px] text-[var(--color-muted)]">Upload a Ringi to set this. It is stamped with the upload time.</span>}
          </Field>
          <Field label="Consumed budget (₹ Cr, entered manually)">
            <input type="number" min={0} value={v.consumedBudget} disabled={!editable} onChange={(e) => onChange({ ...v, consumedBudget: Number(e.target.value) || 0 })} className={inputCls} />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="m-0 mb-3 text-[12px] font-semibold text-[#101828]">VCF Calculation</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="NPV" value={fmtCr(sum.npv)} red={sum.npv <= 0} />
          <Kpi label="IRR" value={fmtPct(sum.irr)} red={sum.irr === null || sum.irr <= IRR_HURDLE} />
          <Kpi label="Payback" value={sum.payback === null ? '—' : `${sum.payback.toFixed(1)} yrs`} />
          <Kpi label="Investment" value={fmtCr(sum.investment)} />
          <Kpi label="Returns" value={fmtCr(sum.returns)} />
        </div>
        {sum.red && v.levers.length > 0 && <p className="mt-3 text-[11px] text-red-600">NPV is zero or negative, or IRR is at or below {Math.round(IRR_HURDLE * 100)}%. You can still submit; approvers will see this in red.</p>}
        <p className="mt-2 text-[10.5px] text-[var(--color-muted)]">Calculated from the levers at a 10% discount rate. Consumed budget is not part of the calculation.</p>
      </Card>
    </>
  )
}

function Kpi({ label, value, red }: { label: string; value: string; red?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${red ? 'border-red-200 bg-red-50' : 'border-[var(--color-border)] bg-[#f8faff]'}`}>
      <div className="text-[10px] text-[var(--color-muted)]">{label}</div>
      <div className={`text-[13px] font-semibold tabular-nums ${red ? 'text-red-600' : 'text-[#101828]'}`}>{value}</div>
    </div>
  )
}

function VersionModal({ version, programName, onClose }: { version: VcfVersion; programName: string; onClose: () => void }) {
  const s = summarize(version.vcf)
  const download = () => {
    const blob = new Blob([JSON.stringify({ program: programName, version: version.version, savedAt: version.savedAt, ...version.vcf }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${programName || 'program'}-VCF-v${version.version}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <Modal open onClose={onClose} size="lg" title={`${programName} · VCF version ${version.version}`}
      footer={<>
        <Button variant="secondary" size="md" onClick={download}>Download</Button>
        <Button variant="primary" size="md" onClick={onClose}>Close</Button>
      </>}>
      <p className="mb-3 text-[10.5px] text-[var(--color-muted)]">Saved {fmtD(version.savedAt)} by {version.by}. Reference only.</p>
      <table className="mb-3 w-full text-[11.5px]">
        <thead><tr className="border-b border-[var(--color-border)] text-left text-[10.5px] text-[#344054]"><th className="py-1.5">Lever</th><th>Type</th>{LEVER_YEARS.map((y) => <th key={y}>{y}</th>)}</tr></thead>
        <tbody>{version.vcf.levers.map((l) => <tr key={l.id} className="border-b border-[var(--color-border)] last:border-0"><td className="py-1.5">{l.name}</td><td>{l.kind}</td>{l.amounts.map((a, i) => <td key={i} className="tabular-nums">{a}</td>)}</tr>)}</tbody>
      </table>
      <p className="text-[11.5px]">NPV <strong className={s.npv <= 0 ? 'text-red-600' : ''}>{fmtCr(s.npv)}</strong> · IRR <strong className={s.irr === null || s.irr <= IRR_HURDLE ? 'text-red-600' : ''}>{fmtPct(s.irr)}</strong></p>
    </Modal>
  )
}
