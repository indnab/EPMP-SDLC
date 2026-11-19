import { Card } from '../../components'
import { usePersonaStore } from '../../store/personaStore'
import type { InitiationRecord, InitRole, InitStatus, Program } from '../../domain/initiation'
import { INIT_ROLES, INIT_STATUS_CLS, INIT_STATUS_LABEL } from '../../domain/initiation'

export const INIT_ROLE_LABEL: Record<InitRole, string> = {
  BusinessPartner: 'Business Partner', BPHead: 'Business Partner Head', GovernanceHead: 'Governance Head', CoEHead: 'CoE Head', BusinessUser: 'Business User',
}

/** The initiation role of the current persona, or 'Admin' (read-only view of everything), or null (no access). */
export function useInitRole(): InitRole | 'Admin' | null {
  const p = usePersonaStore((s) => s.currentPersona)
  if (p === 'Admin') return 'Admin'
  return (INIT_ROLES as string[]).includes(p) ? (p as InitRole) : null
}

export function NoInitAccess() {
  return (
    <Card>
      <p className="py-10 text-center text-sm text-[var(--color-muted)]">
        Project Initiation is available to the Business Partner, Business Partner Head, Governance Head, CoE Head and Business User. Switch persona to see it.
      </p>
    </Card>
  )
}

export function StatusChip({ status }: { status: InitStatus | 'NoProject' }) {
  if (status === 'NoProject') return <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">No project yet</span>
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${INIT_STATUS_CLS[status]}`}>{INIT_STATUS_LABEL[status]}</span>
}

export const fmtD = (iso?: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function programNameOf(r: InitiationRecord | undefined, programs: Program[]): string {
  if (!r) return '—'
  if (r.programMode === 'existing') return programs.find((p) => p.programId === r.programId)?.name ?? '—'
  if (r.programMode === 'new') return r.newProgram.name || '(new program)'
  return '—'
}

export const inputCls = 'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11.5px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe] disabled:opacity-70'
export const cellCls = 'h-8 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-[11.5px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe] disabled:bg-transparent disabled:border-transparent'
export function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
      {error && <span className="mt-1 block text-[10.5px] text-red-600">{error}</span>}
    </label>
  )
}
