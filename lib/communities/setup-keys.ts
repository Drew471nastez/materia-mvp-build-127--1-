/**
 * The setup list's names and shapes alone (round 33), for the floating pill
 * (components/community/creator/setup-pill.tsx), which rides in the /app
 * shell on every page and so carries none of the rules
 * (./setup-checklist.ts has them).
 */

export const SETUP_STEP_IDS = ["payouts", "group", "rules", "publish", "invite", "post", "app", "intro", "customize", "course", "event", "event_payouts"] as const
export type SetupStepId = (typeof SETUP_STEP_IDS)[number]

/** Kept per person in community_setup_progress: a skip, a tick by hand, the pill hidden. */
export const PILL_HIDDEN = "pill_hidden"
export const INTRO_WATCHED = "intro_watched"
export const APP_CONFIRMED = "app_confirmed"
export const skipKey = (id: SetupStepId) => `skip_${id}`

export interface AppLink {
  store: "ios" | "android"
  label: string
  href: string
}

export interface SetupStepView {
  id: SetupStepId
  title: string
  detail: string
  href: string
  action: string
  done: boolean
  skipped: boolean
  /** A count toward a goal, as "1 of 3". */
  progress?: { n: number; of: number }
  /** The app's stores, for the app step. */
  links?: AppLink[]
  /** Opens outside Storelib (the intro video, a store). */
  external?: boolean
}

export interface SetupChecklistView {
  name: string
  steps: SetupStepView[]
  done: number
  total: number
  percent: number
  pillHidden: boolean
}
