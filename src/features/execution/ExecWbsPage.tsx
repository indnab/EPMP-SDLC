/**
 * Project Execution → WBS Management. Every tagged member sees the complete WBS; the Project Manager assigns owners and
 * updates status, and members update only the items assigned to them. VCF and QA checklist rows are milestones that open
 * their own view. JIRA-defined milestones can trigger a JIRA workspace; its items roll up read-only.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Modal, PageHeader } from '../../components'
import { Icon } from '../../components/Icon'
import { useInitiationStore } from '../../store/initiationStore'
import { useQAStore } from '../../store/qaStore'
import type { PlanItem } from '../../domain/planning'
import { LEVEL_LABEL, PM_USER, flatten, taggedOf } from '../../domain/planning'
import { JIRA_MAP, WORK_CLS, WORK_STATUSES, execRights, isJira, isQa, isVcf, ownerOptions, progressOf, qaStatusOf, QA_STATUS_CLS, statusErrors, workStatusOf } from '../../domain/execution'
import type { WorkStatus } from '../../domain/execution'
import { cellCls } from '../initiation/shared'
import { VcfTab, VersionModal } from '../initiation/InitiationFormPage'
import { QaChecklistModal } from '../quality/QaChecklistModal'
import { NoPlanAccess, canSeeProject, usePlanRole } from '../planning/shared'
import { usePersonaStore } from '../../store/personaStore'
import type { VcfVersion } from '../../domain/initiation'

const th = 'px-2 py-2.5 text-left text-[10.5px] font-medium text-[#344054] whitespace-nowrap'
const today = () => new Date().toISOString().slice(0, 10)

export function ExecWbsPage() {
  const { demandId = '' } = useParams<{ demandId: string }>()
  const role = usePlanRole()
  const persona = usePersonaStore((s) => s.currentPersona)
  const navigate = useNavigate()
  const { records, programs, updateItem, triggerJira, patch } = useInitiationStore()
  const archetypes = useQAStore((s) => s.archetypes)
  const rec = records[demandId]
  const [qaFor, setQaFor] = useState<string | null>(null)
  const [vcfOpen, setVcfOpen] = useState(false)
  const [version, setVersion] = useState<VcfVersion | null>(null)
  const [jiraFor, setJiraFor] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const items = useMemo(() => rec?.wbs?.items ?? [], [rec])
  const flat = useMemo(() => flatten(items), [items])
  const codeOf = useMemo(() => new Map(flat.map((f) => [f.item.id, f.code])), [flat])

  if (!role) return (<div><PageHeader title="WBS Management" section="Project Execution" /><NoPlanAccess /></div>)
  if (!rec || !canSeeProject(role, rec) || !rec.wbs) {
    return (
      <div className="py-20 text-center text-[var(--color-muted)]">
        <p className="font-medium">{rec && !rec.wbs ? 'The WBS has not been created yet.' : 'Project not found'}</p>
        <Link to="/execution" className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline">← Back to Project Execution</Link>
      </div>
    )
  }
  const arc = archetypes.find((a) => a.id === rec.projectType)
  const sdlc = !!arc?.sdlc
  const closed = rec.closure?.status === 'Closed'
  const isPm = role === 'ProjectManager' && rec.pm === PM_USER
  const tagged = taggedOf(rec)
  const baselined = rec.wbs.status === 'Approved'
  const program = programs.find((p) => p.programId === rec.programId)
  const qaItem = items.find((i) => i.id === qaFor)
  const by = persona

  const change = (it: PlanItem, p: Partial<PlanItem>) => {
    setErrors((e) => ({ ...e, [it.id]: '' }))
    updateItem(demandId, it.id, p, role === 'ProjectManager' ? PM_USER : by)
  }
  const setStatus = (it: PlanItem, s: WorkStatus) => {
    const p: Partial<PlanItem> = { status: s }
    if (s !== 'Open' && !it.actualStart) p.actualStart = today()
    if (s === 'Completed') { p.actualEnd = it.actualEnd ?? today(); p.progress = 100 }
    if (s === 'Open') { p.actualStart = undefined; p.actualEnd = undefined; p.progress = 0 }
    const err = statusErrors({ ...it, ...p })
    if (err) { setErrors((e) => ({ ...e, [it.id]: err })); return }
    change(it, p)
  }

  return (
    <div className="pb-8">
      <PageHeader title="WBS Management" section="Project Execution" crumb={`${rec.projectId} · WBS Management`} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-[16px] font-semibold text-[#101828]">{rec.projectName}</h1>
          <span className="font-mono text-[10.5px] text-[var(--color-muted)]">{rec.projectId}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${closed ? 'bg-emerald-100 text-emerald-800' : baselined ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{closed ? 'Closed' : baselined ? 'Baselined' : 'Plan not approved'}</span>
          <span className="ml-auto text-[10.5px] text-[var(--color-muted)]">Project Manager {rec.pm ?? '—'} · {tagged.length} tagged · {arc?.name ?? ''}{sdlc ? ' · SDLC' : ''}</span>
        </div>
        <p className="mt-2 text-[10.5px] text-[var(--color-muted)]">
          {isPm ? 'You assign owners and update status. The planned baseline is read-only.'
            : role === 'TeamMember' || role === 'ReleaseManager' ? 'You can see the complete WBS. You can update only the items assigned to you; they are highlighted.'
            : 'Read-only view of the execution WBS.'}
          {closed ? ' The project is closed and archived.' : ''}
        </p>
        {!baselined && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">Execution starts once the CoE Head approves the WBS.</p>}
      </Card>

      <Card flush className="!overflow-visible">
        <div className="table-scroll">
          <table className="w-full text-[11.5px]">
            <thead><tr className="border-b border-[var(--color-border)] bg-[#dce8fb]">
              <th className={th}>WBS ID</th><th className={th + ' min-w-[260px]'}>Milestone / Activity / Task / Sub-task</th><th className={th + ' w-16'}>EV %</th><th className={th + ' w-20'}>Planned Effort</th>
              <th className={th + ' w-36'}>Actual Start</th><th className={th + ' w-36'}>Actual End</th><th className={th + ' min-w-[110px]'}>Dependency</th>
              <th className={th + ' w-28'}>Status</th><th className={th + ' min-w-[150px]'}>Owner</th><th className={th + ' w-28'}>Progress</th>
            </tr></thead>
            <tbody>
              {flat.map(({ item: it, code, depth }) => {
                const rights = execRights(role, it, { isPm })
                const canStatus = rights.status && baselined && !closed
                const canOwner = rights.owner && baselined && !closed
                const isLeaf = !items.some((k) => k.parentId === it.id)
                const st = workStatusOf(it)
                const prog = progressOf(items, it.id)
                const mine = !!it.owner && rights.status && !isPm
                const opts = ownerOptions(it, tagged, !!it.qaRmOnly || sdlc)
                const jiraDone = (rec.jiraTriggered ?? []).includes(it.id)
                return (
                  <tr key={it.id} className={`border-b border-[var(--color-border)] last:border-0 align-middle ${it.level === 'Milestone' ? 'bg-[#f8faff]' : ''} ${mine ? 'bg-teal-50' : ''}`}>
                    <td className="px-2 py-1.5 font-mono text-[10.5px] text-[#344054]">{code}</td>
                    <td className="px-2 py-1.5">
                      <div style={{ paddingLeft: depth * 16 }} className="flex flex-wrap items-center gap-1.5">
                        <span className={`${it.level === 'Milestone' ? 'font-semibold' : ''} text-[#101828]`}>{it.name}</span>
                        <span className="rounded bg-[#f2f4f7] px-1 text-[9.5px] text-[#475467]">{LEVEL_LABEL[it.level]}</span>
                        {it.source === 'JIRA' && <span className="rounded bg-[#e0f2fe] px-1 text-[9.5px] text-sky-800" title={`JIRA ${it.jiraKey}`}>JIRA {it.jiraType} · {it.jiraKey}</span>}
                        {isQa(it) && (
                          <button type="button" onClick={() => setQaFor(it.id)} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-secondary)]">
                            <Icon name="clipboard-list" size={11} /> QA checklist <span className={`rounded-full px-1.5 ${QA_STATUS_CLS[qaStatusOf(it)]}`}>{qaStatusOf(it)}</span>
                          </button>
                        )}
                        {isVcf(it) && <button type="button" onClick={() => setVcfOpen(true)} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-secondary)]"><Icon name="file-lines" size={11} /> {isPm && !closed ? 'Update VCF' : 'View VCF'}</button>}
                        {isJira(it) && it.source !== 'JIRA' && (jiraDone
                          ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-800">JIRA workspace requested</span>
                          : isPm && baselined && !closed && <button type="button" onClick={() => setJiraFor(it.id)} className="rounded-full border border-sky-600 px-2 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-50">Trigger JIRA workspace</button>)}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{it.weight}</td>
                    <td className="px-2 py-1.5 tabular-nums">{it.effort}</td>
                    <td className="px-2 py-1.5"><input type="date" value={it.actualStart ?? ''} disabled={!canStatus || !it.owner || !isLeaf || isQa(it)} aria-label={`${code} actual start`} onChange={(e) => change(it, { actualStart: e.target.value || undefined })} className={cellCls} /></td>
                    <td className="px-2 py-1.5"><input type="date" value={it.actualEnd ?? ''} min={it.actualStart} disabled={!canStatus || !it.owner || !isLeaf || isQa(it)} aria-label={`${code} actual end`} onChange={(e) => change(it, { actualEnd: e.target.value || undefined })} className={cellCls} /></td>
                    <td className="px-2 py-1.5 text-[10.5px]">{it.deps.length ? it.deps.map((d) => `${d.type} ${codeOf.get(d.onId) ?? '?'}${d.lag ? ` +${d.lag}d` : ''}`).join(', ') : <span className="text-[var(--color-muted)]">—</span>}</td>
                    <td className="px-2 py-1.5">
                      {isLeaf && it.source !== 'JIRA' && !isQa(it) && canStatus && it.owner ? (
                        <select value={st} aria-label={`${code} status`} onChange={(e) => setStatus(it, e.target.value as WorkStatus)} className={cellCls}>{WORK_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                      ) : isLeaf ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${WORK_CLS[st]}`}>{st}</span> : <span className="text-[var(--color-muted)]">—</span>}
                      {errors[it.id] && <span className="mt-0.5 block text-[9.5px] text-red-600">{errors[it.id]}</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {canOwner && it.level !== 'Milestone' ? (
                        <select value={it.owner ?? ''} aria-label={`${code} owner`} onChange={(e) => change(it, { owner: e.target.value || undefined })} className={cellCls}>
                          <option value="">{opts.length ? 'Assign…' : 'No eligible owner'}</option>{opts.map((n) => <option key={n}>{n}</option>)}
                        </select>
                      ) : (it.owner ?? <span className="text-[var(--color-muted)]">—</span>)}
                      {canOwner && isQa(it) && (it.qaRmOnly || sdlc) && <span className="block text-[9.5px] text-[var(--color-muted)]">Release Managers only</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5" title={`${prog}%`}>
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[#e5e7eb]"><div className="h-full rounded-full bg-[#245bff]" style={{ width: `${prog}%` }} /></div>
                        {isLeaf && it.source !== 'JIRA' && !isQa(it) && canStatus && it.owner && st === 'Ongoing' ? (
                          <input type="number" min={0} max={100} value={it.progress ?? 0} aria-label={`${code} progress`} onChange={(e) => change(it, { progress: Math.max(0, Math.min(100, Number(e.target.value))) })} className="h-6 w-12 rounded border border-[var(--color-border)] px-1 text-[10.5px]" />
                        ) : <span className="text-[10.5px] tabular-nums">{prog}%</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-2 text-[10.5px] text-[var(--color-muted)]">
        Statuses: Open, Ongoing, Completed. Actual dates are entered manually in this tracking mode. JIRA mapping: Activity → {JIRA_MAP.Activity}, Task → {JIRA_MAP.Task}, Sub-task → {JIRA_MAP.Subtask}; changes are made in JIRA.
      </p>
      <div className="mt-3"><Button variant="secondary" size="md" onClick={() => navigate('/execution')}>Back</Button></div>

      {qaItem && <QaChecklistModal item={qaItem} role={role} closed={closed} onSave={(p, who) => updateItem(demandId, qaItem.id, p, who)} onClose={() => setQaFor(null)} />}
      {vcfOpen && (
        <Modal open onClose={() => setVcfOpen(false)} size="lg" title={`Project VCF · ${rec.projectId}`}
          footer={<Button variant="primary" size="md" onClick={() => setVcfOpen(false)}>Done</Button>}>
          <p className="mb-3 text-[10.5px] text-[var(--color-muted)]">{isPm && !closed ? 'Changes save as you type. The VCF milestone completes when you mark it Completed on the WBS.' : 'View only.'}</p>
          <VcfTab rec={rec} program={program} editable={isPm && !closed} errors={{}} onChange={(vcf) => patch(demandId, { vcf })} onViewVersion={setVersion} />
        </Modal>
      )}
      {version && <VersionModal version={version} programName={program?.name ?? ''} onClose={() => setVersion(null)} />}
      {jiraFor && (
        <Modal open onClose={() => setJiraFor(null)} size="sm" title="Trigger the JIRA workspace?"
          footer={<><Button variant="secondary" size="md" onClick={() => setJiraFor(null)}>Cancel</Button><Button variant="primary" size="md" onClick={() => { triggerJira(demandId, jiraFor); setJiraFor(null) }}>Trigger</Button></>}>
          <p className="text-[11.5px] text-[#344054]">The JIRA Admin is asked to create the workspace for <strong>{items.find((i) => i.id === jiraFor)?.name}</strong>. Work created in JIRA then appears here read-only, and EPMS keeps the link.</p>
        </Modal>
      )}
    </div>
  )
}
