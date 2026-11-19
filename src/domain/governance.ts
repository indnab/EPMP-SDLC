/**
 * Governance → Activity Builder link.
 *
 * An Admin defines project archetypes; each archetype has a WBS template of objects. 'Activity Builder' objects become
 * activities in the Activity Builder: saving an archetype creates (or updates) one ActivityDefinition per such object,
 * named after it, with its trial as the default milestone and its QA checklist items as Yes/No fields. The Admin then
 * configures the rest (fields, flow, timeline) in the Builder and publishes. Objects that are removed or changed away
 * from QA retire their activity.
 */
import type {
  AccessLevel, AccessRule, ActivityDefinition, ApprovalFlow, BuilderDraft, DependencyType, FieldDefinition, ProjectArchetype, WbsObject, WbsObjectType
} from './index'
import { isBuildable } from './index'
import { milestoneOf } from './wbsTree'

export const WBS_TYPES: { id: WbsObjectType; label: string }[] = [
  { id: 'General', label: 'General' },
  { id: 'ActivityBuilder', label: 'Activity Builder' },
  { id: 'QA', label: 'QA' },
  { id: 'VCF', label: 'VCF' },
  { id: 'RiskSphere', label: 'RiskSphere' },
  { id: 'ImportJira', label: 'Import Jira' },
  { id: 'EAReview', label: 'EA Review' },
]
export const WBS_TYPE_LABEL = Object.fromEntries(WBS_TYPES.map((t) => [t.id, t.label])) as Record<WbsObjectType, string>

export const DEP_TYPES: { id: DependencyType; label: string; short: string }[] = [
  { id: 'FS', label: 'Finish to Start (FS)', short: 'Finish to Start (FS)' },
  { id: 'SS', label: 'Start to Start (SS)', short: 'Start to Start (SS)' },
  { id: 'FF', label: 'Finish to Finish (FF)', short: 'Finish to Finish (FF)' },
  { id: 'SF', label: 'Start to Finish (SF)', short: 'Start to Finish (SF)' },
]
export const DEP_LABEL = Object.fromEntries(DEP_TYPES.map((d) => [d.id, d.label])) as Record<DependencyType, string>

/** Default approval flow for a new activity created from a QA WBS object (PIC confirms). */
export const DEFAULT_ACTIVITY_FLOW: ApprovalFlow = {
  steps: [{ stepIndex: 0, role: 'PIC', label: 'PIC Confirmation', allowedOutcomes: ['Approve', 'Edit'] }],
}

const CHECKLIST_PREFIX = 'chk_'

/** Stable activity id for a QA object of an archetype. */
export const activityIdFor = (arc: ProjectArchetype, obj: WbsObject) =>
  obj.activityId ?? `${arc.id.toLowerCase()}-${obj.id}`

/** The Yes/No fields generated from a QA object's checklist. */
export function checklistFields(obj: WbsObject): FieldDefinition[] {
  return (obj.checklist ?? [])
    .filter((it) => it.label.trim())
    .map((it) => ({
      key: `${CHECKLIST_PREFIX}${it.id}`,
      label: it.label.trim(),
      type: 'yesNo' as const,
      mandatory: it.mandatory,
      enteredBy: 'PIC' as const,
      source: 'manual' as const,
      validatedBy: null,
      showOnDashboard: false,
    }))
}

/** Replace an activity's checklist-generated fields with the current checklist; other fields are untouched. */
function withChecklist(fields: FieldDefinition[], obj: WbsObject): FieldDefinition[] {
  return [...fields.filter((f) => !f.key.startsWith(CHECKLIST_PREFIX)), ...checklistFields(obj)]
}

/**
 * Apply a saved archetype to the activity list. Returns the archetype (QA objects get their activityId), the updated
 * activities, and drafts with any open builder draft kept in step (name / trial / checklist fields).
 */
export function syncArchetype(
  arc: ProjectArchetype,
  previous: ProjectArchetype | undefined,
  activities: ActivityDefinition[],
  drafts: BuilderDraft[]
): { archetype: ProjectArchetype; activities: ActivityDefinition[]; drafts: BuilderDraft[] } {
  let acts = [...activities]
  let drs = [...drafts]
  const link = (a: { archetypeId?: string; wbsObjectId?: string }) => ({ archetypeId: arc.id, ...a })

  const wbs = arc.wbs.map((obj) => {
    if (!isBuildable(obj)) {
      // Changed away from Activity Builder: its activity is retired and the link dropped.
      if (obj.activityId) acts = acts.map((a) => (a.id === obj.activityId ? { ...a, retired: true } : a))
      // QA objects keep their checklist and ownership rule: it is completed in Project Execution (no Activity Builder activity).
      if (obj.type === 'QA') return { ...obj, activityId: undefined }
      return { ...obj, activityId: undefined, checklist: undefined, qaOwnershipReleaseManager: undefined }
    }
    const id = activityIdFor(arc, obj)
    const name = obj.name.trim() || 'Untitled activity'
    // The activity's milestone is the Milestone row it sits under.
    const trial = milestoneOf(arc.wbs, obj)?.id
    const existing = acts.find((a) => a.id === id)
    if (existing) {
      acts = acts.map((a) =>
        a.id === id
          ? { ...a, ...link({ wbsObjectId: obj.id }), name, defaultMilestoneId: trial, fields: withChecklist(a.fields, obj), retired: false }
          : a
      )
    } else {
      acts.push({
        id, name, scope: 'Both', fields: checklistFields(obj), flow: DEFAULT_ACTIVITY_FLOW, ownerPersona: 'PIC',
        description: '', published: false, allowNotApplicable: true, deviationFlow: ['PIC', 'SIC', 'DPM'],
        ...link({ wbsObjectId: obj.id }), defaultMilestoneId: trial,
      })
    }
    // Keep an open builder draft of this activity in step, so publishing it doesn't undo the archetype change.
    drs = drs.map((d) =>
      d.sourceId === id ? { ...d, name, defaultMilestoneId: trial, fields: withChecklist(d.fields, obj) } : d
    )
    return { ...obj, activityId: id }
  })

  // Objects removed from the archetype retire their activities.
  const kept = new Set(wbs.map((o) => o.activityId).filter(Boolean))
  for (const old of previous?.wbs ?? []) {
    if (old.activityId && !kept.has(old.activityId)) {
      acts = acts.map((a) => (a.id === old.activityId ? { ...a, retired: true } : a))
    }
  }
  return { archetype: { ...arc, wbs }, activities: acts, drafts: drs }
}

/** Next free archetype id, e.g. ARC-002. */
export function nextArchetypeId(existing: ProjectArchetype[]): string {
  const n = existing.reduce((m, a) => Math.max(m, parseInt(a.id.replace(/\D/g, ''), 10) || 0), 0) + 1
  return `ARC-${String(n).padStart(3, '0')}`
}

/** Release Manager list (reference data; in the live system this comes from the configured database). */
export const RELEASE_MANAGERS = ['Anil Kapoor', 'Neha Bansal', 'Sandeep Rawat']
export const ACCESS_LEVELS: { id: AccessLevel; label: string }[] = [
  { id: 'None', label: 'No access' },
  { id: 'View', label: 'View' },
  { id: 'Edit', label: 'View & edit' },
]
/** Personas an archetype's access rules cover. */
export const ACCESS_PERSONAS = ['Vendor', 'PIC', 'SIC', 'DPM', 'ModelCoordinator', 'SectionAdmin', 'Admin'] as const

/** Default rules for the given objects: everyone can view, Admin and the owning personas can edit. */
export function defaultAccessRules(objectIds: string[]): AccessRule[] {
  return objectIds.flatMap((objectId) =>
    ACCESS_PERSONAS.map((persona) => ({ objectId, persona, level: (persona === 'Admin' || persona === 'PIC' ? 'Edit' : 'View') as AccessLevel }))
  )
}

/** The archetype as it stood at `version` (what a project started on that version runs on). */
export function archetypeAtVersion(arc: ProjectArchetype, version: number | undefined): ProjectArchetype {
  const v = version ?? 1
  if (v >= (arc.version ?? 1)) return arc
  const snap = arc.versions?.find((x) => x.version === v)
  return snap ? { ...arc, wbs: snap.wbs, version: v } : arc
}

/** True when the archetype can be used to initiate projects. */
export const isUsable = (a: ProjectArchetype) => a.active && a.status !== 'Draft'
