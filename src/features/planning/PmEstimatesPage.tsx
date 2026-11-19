/** Project Planning → Submit Estimates: the Project Manager's manpower estimates. Optional; locked once the schedule is submitted. */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Modal, PageHeader } from '../../components'
import { Icon } from '../../components/Icon'
import { useInitiationStore } from '../../store/initiationStore'
import { useQAStore } from '../../store/qaStore'
import { SKILLSETS, uid } from '../../domain/initiation'
import type { PmRow } from '../../domain/planning'
import { PM_USER, pmRowErrors } from '../../domain/planning'
import { cellCls, inputCls } from '../initiation/shared'
import { NoPlanAccess, usePlanRole } from './shared'

const th = 'px-3 py-2.5 text-left text-[10.5px] font-medium text-[#344054]'

export function PmEstimatesPage() {
  const { demandId = '' } = useParams<{ demandId: string }>()
  const role = usePlanRole()
  const navigate = useNavigate()
  const { records, savePmEstimates } = useInitiationStore()
  const archetypes = useQAStore((s) => s.archetypes)
  const rec = records[demandId]
  const [rows, setRows] = useState<PmRow[]>(rec?.pmEstimates ?? [])
  const [showErrors, setShowErrors] = useState(false)
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState(false)

  if (!role) return (<div><PageHeader title="Submit Estimates" section="Project Planning" /><NoPlanAccess /></div>)
  if (!rec?.projectId) {
    return (
      <div className="py-20 text-center text-[var(--color-muted)]">
        <p className="font-medium">Project not found</p>
        <Link to="/planning" className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline">← Back to Project Planning</Link>
      </div>
    )
  }
  const locked = rec.schedule?.status === 'Submitted' || rec.schedule?.status === 'Approved'
  const editable = role === 'ProjectManager' && rec.pm === PM_USER && !locked
  const errors = pmRowErrors(rows)
  const typeName = archetypes.find((a) => a.id === rec.projectType)?.name ?? '—'
  const setRow = (id: string, p: Partial<PmRow>) => { setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r))); setMessage('') }

  return (
    <div className="pb-24">
      <PageHeader title="Submit Estimates" section="Project Planning" crumb={`${rec.projectId} · Estimates`} />
      <h1 className="mb-3 text-[20px] font-semibold text-[#101828]">Manpower Estimates</h1>
      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {([['Project ID', rec.projectId], ['Project Name', rec.projectName], ['Project Type', typeName]] as const).map(([k, v]) => (
            <label key={k} className="block"><span className="mb-1 block text-[10.5px] font-medium text-[#344054]">{k}</span><input readOnly value={v} className={inputCls + ' !bg-[#f2f4f7]'} /></label>
          ))}
        </div>
        {locked && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">The Business Partner has submitted the schedule, so these estimates are locked.</p>}
        {!locked && <p className="mt-3 text-[10.5px] text-[var(--color-muted)]">Estimates are optional. The Business Partner uses them as a reference when simulating the schedule.</p>}
      </Card>

      <Card flush className="!overflow-visible">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="m-0 text-[13px] font-semibold text-[#101828]">Skillsets</h2>
          {editable && <button type="button" onClick={() => setRows([...rows, { id: uid('pe'), skillset: '', headcount: 1, days: 1, utilization: 100 }])}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-secondary)]"><Icon name="circle-plus" size={16} /> Add Skillset</button>}
        </div>
        <div className="table-scroll">
          <table className="w-full text-[11.5px]">
            <thead><tr className="bg-[#dce8fb]"><th className={th + ' min-w-[200px]'}>Skillset</th><th className={th + ' w-28'}>Headcount</th><th className={th + ' w-28'}>Days</th><th className={th + ' w-32'}>Utilization (%)</th>{editable && <th className="w-10" />}</tr></thead>
            <tbody>
              {showErrors && errors._rows && <tr><td colSpan={5} className="px-3 py-2 text-[10.5px] text-red-600">{errors._rows}</td></tr>}
              {rows.length === 0 && !(showErrors && errors._rows) && <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--color-muted)]">No skillsets added.</td></tr>}
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-[var(--color-border)] align-top">
                  <td className="px-2 py-1.5"><select value={r.skillset} disabled={!editable} aria-label={`Skillset ${i + 1}`} onChange={(e) => setRow(r.id, { skillset: e.target.value })} className={cellCls}>
                    <option value="">Select…</option>{[...new Set([...SKILLSETS, r.skillset].filter(Boolean))].map((s) => <option key={s}>{s}</option>)}</select>
                    {showErrors && errors[`${i}.skillset`] && <span className="text-[10px] text-red-600">{errors[`${i}.skillset`]}</span>}</td>
                  {(['headcount', 'days', 'utilization'] as const).map((k) => (
                    <td key={k} className="px-2 py-1.5"><input type="number" min={1} max={k === 'utilization' ? 100 : undefined} value={r[k] || ''} disabled={!editable} aria-label={`${k} ${i + 1}`}
                      onChange={(e) => setRow(r.id, { [k]: Number(e.target.value) })} className={cellCls} />
                      {showErrors && errors[`${i}.${k}`] && <span className="text-[10px] text-red-600">{errors[`${i}.${k}`]}</span>}</td>
                  ))}
                  {editable && <td className="px-1 py-1.5"><button type="button" aria-label={`Remove row ${i + 1}`} onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[#fef2f2] hover:text-[var(--color-destructive)]"><Icon name="close" size={14} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {message && <p role="status" className="mt-3 text-[11px] text-emerald-700">{message}</p>}

      <div className="fixed bottom-0 right-0 z-30 flex justify-end gap-3 border-t border-[var(--color-border)] bg-white/90 px-7 py-3 backdrop-blur left-0 lg:left-[var(--nav-w)]">
        {editable && <Button variant="secondary" size="md" className="!rounded-full" onClick={() => { savePmEstimates(demandId, rows, false); setMessage('Draft saved.') }}>Save as Draft</Button>}
        <Button variant="secondary" size="md" className="!rounded-full" onClick={() => navigate('/planning')}>{editable ? 'Cancel' : 'Back'}</Button>
        {editable && <Button variant="primary" size="md" className="!rounded-full" onClick={() => { setShowErrors(true); if (Object.keys(errors).length === 0) setConfirm(true) }}>Submit</Button>}
      </div>
      {confirm && (
        <Modal open onClose={() => setConfirm(false)} size="sm" title="Submit the estimates?"
          footer={<><Button variant="secondary" size="md" onClick={() => setConfirm(false)}>No</Button>
            <Button variant="primary" size="md" onClick={() => { savePmEstimates(demandId, rows, true); navigate('/planning') }}>Yes</Button></>}>
          <p className="text-[11.5px] text-[#344054]">The Business Partner will see these as a reference. You can still change them until the schedule is submitted.</p>
        </Modal>
      )}
    </div>
  )
}
