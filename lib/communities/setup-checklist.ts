/**
 * ===========================================================================
 *  A NEW COMMUNITY'S SETUP LIST, FOR ITS OWNER AND ADMINS (round 33)
 * ===========================================================================
 * The owner: "make the setup checklist smart and useful". One list, read by
 * the Overview's Set up card (lib/communities/server/creator.ts loadOverview
 * hands it the steps still to do) and by the floating Setup pill on every
 * section of the community (components/community/creator/setup-pill.tsx).
 * Every step is ticked from real rows, never by a click that says it is done:
 *
 *   payouts     Stripe connected, for a paid community (the owner only)
 *   group       a logo, a cover and a description beside the name
 *   rules       at least one rule
 *   publish     published
 *   invite      three people: invites sent plus members who joined without
 *               one, so nobody is counted twice
 *   post        a post by the owner or by this admin
 *   app         a phone with the Storelib app signed in to this account (a
 *               push token from iOS or Android), or "I have it"
 *   intro       the three minute intro, watched from the list; hidden while
 *               INTRO_VIDEO_URL is empty
 *   customize   what members get, written on the page
 *   course, event, event_payouts   as the Overview always had them
 *
 * Any step not done can be skipped; a skipped step counts as done and leaves
 * both lists. The pill can be hidden on its own; the Overview card stays
 * until everything is done or skipped. Skips and the two ticks by hand are
 * kept per person in community_setup_progress (run-now part 202); before
 * that part they cannot be saved, and every step is still ticked from rows.
 *
 * Pure and browser safe.
 */
import { nextSteps, type NextStep, type NextStepFacts } from "@/components/community/creator/logic"
import { PLAY_URL } from "@/lib/platform/open-in-app"
import { tt } from "@/lib/i18n/text"
import { APP_CONFIRMED, INTRO_WATCHED, PILL_HIDDEN, SETUP_STEP_IDS, skipKey, type AppLink, type SetupChecklistView, type SetupStepId, type SetupStepView } from "./setup-keys"

/** The three minute intro. Empty hides the step; put the video's https address here when it is ready. */
export const INTRO_VIDEO_URL = ""

/** People to bring in before the invite step is done. */
export const INVITE_GOAL = 3

export { SETUP_STEP_IDS, PILL_HIDDEN, INTRO_WATCHED, APP_CONFIRMED, skipKey }
export type { SetupStepId, AppLink, SetupStepView, SetupChecklistView }

export function isSetupStepId(v: unknown): v is SetupStepId {
  return typeof v === "string" && (SETUP_STEP_IDS as readonly string[]).includes(v)
}

/** A progress key a person may write: a skip of a known step, the two ticks by hand, the pill hidden. */
export function progressKey(v: unknown): string | null {
  if (v === PILL_HIDDEN || v === INTRO_WATCHED || v === APP_CONFIRMED) return v
  if (typeof v === "string" && v.startsWith("skip_") && isSetupStepId(v.slice(5))) return v
  return null
}

export interface SetupFacts extends NextStepFacts {
  name: string
  hasLogo: boolean
  hasCover: boolean
  hasDescription: boolean
  invitesSent: number
  /** Active members other than the owner who joined without an invite. */
  joinedWithoutInvite: number
  /** Posts by the owner or by the person reading the list. */
  staffPosts: number
  appInstalled: boolean
  /** This person's rows in community_setup_progress. */
  progress: ReadonlySet<string>
  /** The payouts step is the owner's: an admin cannot connect Stripe for them. */
  isOwner: boolean
}

/** The App Store's address for the app: NEXT_PUBLIC_IOS_APP_STORE_ID or _URL when set, else none (the step then offers Google Play only). */
export function appStoreUrl(env: { id?: string | null; url?: string | null } = { id: process.env.NEXT_PUBLIC_IOS_APP_STORE_ID, url: process.env.NEXT_PUBLIC_IOS_APP_STORE_URL }): string | null {
  const id = (env.id || "").trim()
  if (/^\d+$/.test(id)) return `https://apps.apple.com/app/id${id}`
  const url = (env.url || "").trim()
  return /^https:\/\//.test(url) ? url : null
}

export function appLinks(ios: string | null = appStoreUrl()): AppLink[] {
  return [...(ios ? [{ store: "ios" as const, label: tt("App Store"), href: ios }] : []), { store: "android" as const, label: tt("Google Play"), href: PLAY_URL }]
}

/** What is still missing from the group: the words for its detail line. */
function groupMissing(f: SetupFacts): string[] {
  return [!f.hasLogo ? tt("an icon") : null, !f.hasCover ? tt("a cover") : null, !f.hasDescription ? tt("a description") : null].filter((x): x is string => !!x)
}

function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return tt("{first} and {last}", { first: parts.slice(0, -1).join(", "), last: parts[parts.length - 1] })
}

/**
 * The whole list, in the order it is best done, each with whether it is done
 * or skipped. `introUrl` and `ios` are given by the tests; the screens use
 * the defaults.
 */
export function setupChecklist(f: SetupFacts, base: string, opts: { introUrl?: string; ios?: string | null } = {}): SetupChecklistView {
  const introUrl = opts.introUrl ?? INTRO_VIDEO_URL
  const older = new Map(nextSteps(f, base).map((s) => [s.id, s]))
  const invited = Math.max(0, f.invitesSent) + Math.max(0, f.joinedWithoutInvite)
  const missing = groupMissing(f)
  type Draft = (Omit<SetupStepView, "skipped" | "id"> & { id: SetupStepId }) | null
  const drafts: Draft[] = [
    f.paid && f.isOwner
      ? { id: "payouts", title: tt("Connect payouts"), detail: tt("Members pay you through Stripe. Nobody can join a paid community until payouts are connected."), href: "/app/settings?tab=payments", action: tt("Connect"), done: f.paymentsReady }
      : null,
    {
      id: "group",
      title: tt("Set up your group"),
      detail: missing.length ? tt("Add {missing}, so people know what they are joining.", { missing: listWords(missing) }) : tt("Name, icon, cover and description are in."),
      href: `${base}/settings?tab=page`,
      action: tt("Edit"),
      done: missing.length === 0,
    },
    { id: "rules", title: tt("Write the rules"), detail: tt("Members see them before they join and when they post."), href: `${base}/moderation?tab=rules`, action: tt("Write"), done: f.rules > 0 },
    { id: "publish", title: tt("Publish your community"), detail: tt("It is a draft. Only you can see it until you publish."), href: `${base}/settings?tab=advanced`, action: tt("Publish"), done: f.published },
    {
      id: "invite",
      title: tt("Invite {n} people", { n: INVITE_GOAL }),
      detail: invited >= INVITE_GOAL ? tt("{n} people invited or joined.", { n: invited }) : tt("Send an invite by email or share a link. {n} of {goal} so far.", { n: invited, goal: INVITE_GOAL }),
      href: `${base}/members?invite=1`,
      action: tt("Invite"),
      done: invited >= INVITE_GOAL,
      progress: { n: Math.min(invited, INVITE_GOAL), of: INVITE_GOAL },
    },
    { id: "post", title: tt("Write your first post"), detail: tt("Say who it is for and how to get started."), href: `${base}/feed?compose=welcome`, action: tt("Write"), done: f.staffPosts > 0 },
    {
      id: "app",
      title: tt("Download the app"),
      detail: tt("Get a notification when someone posts, comments or asks to join."),
      href: "/api/get-app",
      action: tt("Get the app"),
      done: f.appInstalled || f.progress.has(APP_CONFIRMED),
      links: appLinks(opts.ios === undefined ? appStoreUrl() : opts.ios),
      external: true,
    },
    introUrl
      ? { id: "intro", title: tt("Watch the 3 minute intro"), detail: tt("How the community works, from the first post to the first payout."), href: introUrl, action: tt("Watch"), done: f.progress.has(INTRO_WATCHED), external: true }
      : null,
    older.get("customize") ? { ...older.get("customize")!, id: "customize", done: false } : f.customized ? { id: "customize", title: tt("Customize the page"), detail: tt("Add pictures, a video and what members get."), href: `${base}/settings?tab=page`, action: tt("Edit"), done: true } : null,
    f.classroomEnabled ? { id: "course", title: tt("Add something to Learn"), detail: tt("A program of lessons, or a course you already sell."), href: `${base}/learn`, action: tt("Add"), done: f.courses > 0 } : null,
    f.eventsEnabled ? { id: "event", title: tt("Schedule an event"), detail: tt("A call, a workshop or a Q&A."), href: `${base}/events?new=1`, action: tt("Schedule"), done: f.events > 0 } : null,
    older.get("event_payouts") ? { ...older.get("event_payouts")!, id: "event_payouts", done: false } : null,
  ]
  const steps: SetupStepView[] = drafts
    .filter((d): d is NonNullable<Draft> => d !== null)
    .map((d) => ({ ...d, skipped: !d.done && f.progress.has(skipKey(d.id)) }) as SetupStepView)
  const done = steps.filter((s) => s.done || s.skipped).length
  return { name: f.name, steps, done, total: steps.length, percent: steps.length ? Math.round((done / steps.length) * 100) : 100, pillHidden: f.progress.has(PILL_HIDDEN) }
}

/** What the Overview's Set up card is given: the steps still to do, in the shape it has always drawn. */
export function stepsLeft(list: SetupChecklistView): NextStep[] {
  return list.steps.filter((s) => !s.done && !s.skipped).map(({ id, title, detail, href, action }) => ({ id, title, detail, href, action }))
}
