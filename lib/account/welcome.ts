import { BUYER_HOME, SELL_INTENT, SELL_PATH, type AuthIntent } from "@/lib/auth/continue"

/**
 * ===========================================================================
 *  A NEW ACCOUNT IS ASKED ONCE WHAT BROUGHT IT HERE
 * ===========================================================================
 * The owner: "branch at the start: 'I want to sell' (current flow) or 'I'm
 * here to join and buy' (name, photo, notifications, done, no store
 * fields)". Seller onboarding was only ever reached through Sell on
 * Storelib (/sell); everybody else landed on Discover with whatever name
 * the database made from their email.
 *
 * Now the end of a sign up (app/auth/continue and app/auth/callback, the
 * one decision every way in ends with) sends a NEW account through
 * /onboarding/start once, carrying where it was going:
 *
 *   seller access                  never (they are past this)
 *   came through Sell on Storelib  never: /sell is the selling branch already
 *   answered before                never (WELCOMED_KEY on the account)
 *   made more than WINDOW_DAYS ago never: an account from before this
 *                                  existed is not stopped on its way in
 *   otherwise                      /onboarding/start?next=<where it was going>
 *
 * The two slides are the account's own (a profile, then notifications).
 * They end where the person was going: the community they signed up from
 * (joined when it is free, by the community's own ?join=1), a product, a
 * creator, a course, the invite they followed, or Discover. Never their
 * profile.
 *
 * Pure and browser safe: the routes, the page and the tests read the same
 * table (tests/profile-display-name.test.ts).
 */

/** The page the question is asked on. Under /onboarding, which is already an auth screen (never a `next`). */
export const WELCOME_PATH = "/onboarding/start"

/** On the account (user_metadata) once the question is answered or put aside, so it is asked once. */
export const WELCOMED_KEY = "storelib_welcomed"

/** Join onboarding step left off (11 profile, 12 username); cleared when welcomed. */
export const JOIN_STEP_KEY = "storelib_join_step"

export const JOIN_STEP_PROFILE = 11
export const JOIN_STEP_USERNAME = 12

export function readJoinStep(meta: Record<string, unknown> | null | undefined): number | null {
  const n = meta?.[JOIN_STEP_KEY]
  return n === JOIN_STEP_PROFILE || n === JOIN_STEP_USERNAME ? n : null
}

/** How new an account is for the question to be asked at all. */
export const WELCOME_WINDOW_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

export function welcomeWanted(input: {
  createdAt: string | null | undefined
  meta: Record<string, unknown> | null | undefined
  seller: boolean
  intent: AuthIntent | null
  now?: number
}): boolean {
  if (input.seller || input.intent === SELL_INTENT) return false
  if (input.meta?.[WELCOMED_KEY] === true) return false
  const made = input.createdAt ? Date.parse(input.createdAt) : NaN
  if (!Number.isFinite(made)) return false
  const now = input.now ?? Date.now()
  return now - made >= -60_000 && now - made <= WELCOME_WINDOW_DAYS * DAY_MS
}

/** /onboarding/start, carrying where they were going. Discover is where it ends anyway, so it is not carried. */
export function welcomeHref(destination: string | null | undefined): string {
  const next = typeof destination === "string" && destination.startsWith("/") && !destination.startsWith("//") && destination !== BUYER_HOME ? destination : null
  return next ? `${WELCOME_PATH}?next=${encodeURIComponent(next)}` : WELCOME_PATH
}

/*
  NO QUESTION AT THE DOOR (the owner: "get rid of the intent thing; Sell,
  Log in or Sign up on Storelib takes me through the normal onboarding").
  A new account that came to Storelib itself (the home page, pricing,
  features, nothing at all) is here to make something, so it goes straight
  into seller onboarding on /sell. Only an account that came for something
  it can buy or join (a product, a download, the library, a community, a
  creator's page, an invite, Discover itself) gets the short profile slides
  and then goes back to that thing.
*/
const PLAIN_PAGES = ["/", "/pricing", "/features", "/themes", "/alternatives", "/blog", "/faq", "/developers", "/sell", "/help", "/legal", "/instagram-bio"]

/** The page they came from says nothing about buying or joining: no page at all, or Storelib's own marketing. */
export function isPlainArrival(from: string | null | undefined): boolean {
  if (from == null || from === "") return true
  if (!from.startsWith("/") || from.startsWith("//")) return false
  const path = from.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "") || "/"
  return PLAIN_PAGES.some((p) => path === p || (p !== "/" && path.startsWith(`${p}/`)))
}

/**
 * Where the decision sends them: through the first steps when they are wanted, else straight on.
 * `from` is the page carried through the sign in (null when there was none); left out, it is not
 * known and the profile slides are used as before.
 */
export function throughWelcome(destination: string, input: Parameters<typeof welcomeWanted>[0] & { from?: string | null }): string {
  if (!welcomeWanted(input)) return destination
  if (input.from !== undefined && isPlainArrival(input.from)) return SELL_PATH
  return welcomeHref(destination)
}

/** Where to send someone who has not finished join onboarding, or null when they may stay. */
export function welcomeGate(here: string, input: Parameters<typeof welcomeWanted>[0]): string | null {
  if (here.startsWith(WELCOME_PATH)) return null
  return welcomeWanted(input) ? welcomeHref(here) : null
}

/**
 * Where the join branch ends. An invite's landing is asked to accept on
 * arrival (?accept=1, components/community/member/invite-landing.tsx), and a
 * community's page to join (?join=1, its join controls), so a person who
 * signed up from either is in it, not one more press away. Anything else is
 * left as it was; nothing is Discover.
 */
export function welcomeDone(next: string | null | undefined): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return BUYER_HOME
  const [path, query = ""] = next.split("?", 2)
  const params = new URLSearchParams(query)
  if (/^\/community\/[^/]+\/join\/?$/.test(path) && params.get("invite")) {
    params.set("accept", "1")
    return `${path}?${params.toString()}`
  }
  return next
}

/** A short bio on the profile slide. profiles.bio allows 400; the slide asks for a line. */
export const WELCOME_BIO_MAX = 160

/** A bio worth saving, or null for empty. Not a type check: a non-string is null. */
export function cleanBio(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const text = raw.replace(/\s+/g, " ").trim().slice(0, WELCOME_BIO_MAX)
  return text || null
}

/** The answer the page sends back (app/api/account/welcome). */
export type WelcomeAnswer = { name?: string; bio?: string | null; skip?: boolean }
