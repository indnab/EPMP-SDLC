import { Card } from '../../components'
import { usePersonaStore } from '../../store/personaStore'
import type { PersonaId } from '../../store/personaStore'
import type { Demand, InitiationRecord } from '../../domain/initiation'
import { PM_USER, TEAM_MEMBER_USER } from '../../domain/planning'

export const PLAN_ROLES = ['BusinessPartner', 'BPHead', 'CoEHead', 'ProjectManager', 'TeamMember', 'Admin'] as const
export type PlanRole = (typeof PLAN_ROLES)[number]

/** The planning role of the current persona, or null when the persona has no access. */
export function usePlanRole(): PlanRole | null {
  const p = usePersonaStore((s) => s.currentPersona as PersonaId)
  return (PLAN_ROLES as readonly string[]).includes(p) ? (p as PlanRole) : null
}

export function NoPlanAccess() {
  return (
    <Card>
      <p className="py-10 text-center text-sm text-[var(--color-muted)]">
        Project Planning is available to the Business Partner, BP Head, CoE Head, Project Manager and Team Member. Switch persona to see it.
      </p>
    </Card>
  )
}

/** Whether the role may see this project at all. Project Managers see only theirs; team members only tagged projects. */
export function canSeeProject(role: PlanRole, r: InitiationRecord): boolean {
  if (!r.projectId) return false
  if (role === 'ProjectManager') return r.pm === PM_USER
  if (role === 'TeamMember') return (r.tagged ?? []).includes(TEAM_MEMBER_USER)
  return true
}
/** Budget is shown to business and approval roles only. */
export const canSeeBudget = (role: PlanRole) => role !== 'ProjectManager' && role !== 'TeamMember'

export type DemandOf = (id: string) => Demand | undefined
