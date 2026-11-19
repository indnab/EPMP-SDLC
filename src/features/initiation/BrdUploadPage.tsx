/** Upload BRD: opens with the project context already filled; the Business User only attaches the document and submits. */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, PageHeader } from '../../components'
import { useInitiationStore } from '../../store/initiationStore'
import { NoInitAccess, fmtD, programNameOf, useInitRole } from './shared'

const ACCEPT = '.doc,.docx,.pdf'

export function BrdUploadPage() {
  const { demandId = '' } = useParams<{ demandId: string }>()
  const role = useInitRole()
  const navigate = useNavigate()
  const { demands, records, programs, uploadBrd } = useInitiationStore()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const demand = demands.find((d) => d.demandId === demandId)
  const rec = records[demandId]

  if (!role) return (<div><PageHeader title="Upload BRD" section="Project Initiation" /><NoInitAccess /></div>)
  if (!demand || !rec?.projectId) {
    return (
      <div className="py-20 text-center text-[var(--color-muted)]">
        <p className="font-medium">A BRD can be uploaded once the Project ID is created.</p>
        <Link to="/initiation" className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline">← Back to Project Initiation</Link>
      </div>
    )
  }
  const canUpload = role === 'BusinessUser' && !rec.brd

  const submit = () => {
    if (!file) { setError('Choose the BRD file first.'); return }
    if (!/\.(docx?|pdf)$/i.test(file.name)) { setError('Upload a Word or PDF document.'); return }
    uploadBrd(demandId, file.name)
    navigate('/initiation')
  }

  return (
    <div>
      <PageHeader title="Upload BRD" section="Project Initiation" crumb={`${rec.projectId} · Upload BRD`} />
      <Card>
        <h2 className="m-0 mb-3 text-[13px] font-semibold text-[#101828]">Upload the detailed BRD for {rec.projectId}</h2>
        <dl className="mb-4 grid grid-cols-1 gap-x-8 gap-y-2 text-[11.5px] md:grid-cols-3">
          {([['Demand ID', demand.demandId], ['Project ID', rec.projectId], ['Program', `${rec.programId ?? rec.createdProgramId ?? ''} ${programNameOf(rec, programs)}`],
            ['Project Name', rec.projectName], ['Division', demand.division], ['CoE', demand.coe ?? '—']] as const).map(([k, v]) => (
            <div key={k}><dt className="text-[10.5px] text-[var(--color-muted)]">{k}</dt><dd className="m-0 font-medium text-[#101828]">{v}</dd></div>
          ))}
        </dl>
        {rec.brd ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">BRD uploaded: <strong>{rec.brd.fileName}</strong> on {fmtD(rec.brd.uploadedAt)}.</p>
        ) : canUpload ? (
          <>
            <p className="mb-2 text-[11.5px] text-[#344054]">Attach the BRD for Project ID <strong>{rec.projectId}</strong> (Word or PDF), then submit.</p>
            <input type="file" accept={ACCEPT} aria-label="Upload BRD" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError('') }} className="block text-[11px]" />
            {error && <p role="alert" className="mt-2 text-[10.5px] text-red-600">{error}</p>}
          </>
        ) : (
          <p className="text-[11.5px] text-[var(--color-muted)]">The BRD has not been uploaded yet. The Business User uploads it; you will be notified.</p>
        )}
      </Card>
      <div className="mt-4 flex gap-3">
        <Button variant="secondary" size="md" onClick={() => navigate('/initiation')}>{canUpload ? 'Cancel' : 'Back'}</Button>
        {canUpload && <Button variant="primary" size="md" onClick={submit}>Submit</Button>}
      </div>
    </div>
  )
}
