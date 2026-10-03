import "server-only"

/**
 * ===========================================================================
 *  GETTING PAST A WEBSITE'S PASSWORD PAGE
 * ===========================================================================
 * Two ways in, both ending in the same pass (./pass.ts) in an httpOnly
 * cookie on the website's own host:
 *
 *   THE PASSWORD   a visitor the creator gave it to types it on the password
 *                  page, which posts to /api/site-password on the website.
 *                  The host is looked up as a creator's published website
 *                  (lib/site-accounts/hosts.ts, from the database), the
 *                  attempt is counted against two limits before anything is
 *                  compared, and the typed password is checked against the
 *                  stored hash (./hash.ts). A wrong one goes back to the
 *                  page with one fixed sentence.
 *
 *   THE OWNER      the creator, signed in on storelib.com, presses "Enter as
 *                  the owner" on their password page. storelib.com checks
 *                  who they are and that the website is theirs, and hands
 *                  them on with a two minute note (`ownerHandOff`); the
 *                  website spends the note once (`spendOwnerPass`, the id
 *                  kept in site_account_codes, the table that already keeps
 *                  every one-time hand off to a website) and gives the pass.
 *
 * The routes are thin; everything that decides is here, with what it reaches
 * passed in, so tests/site-customer-pages.test.ts drives the real thing.
 */
import { randomUUID } from "node:crypto"
import type { Db } from "@/lib/site-accounts/db"
import { verifyPassword } from "./hash"
import { mintPass, OWNER_TTL_MS, PASS_TTL_MS, readPass } from "./pass"
import { readSiteAccess } from "./store"
import { passReturnPath } from "./gate"

export interface EnterDeps {
  db: Db
  /** The creator whose published website answers at this host, or null (lib/site-accounts/hosts siteOwnerOfHost). */
  owner: (host: string) => Promise<{ creatorId: string } | null>
  /** True when this attempt is over a limit (lib/api/rate-limit). Asked before any password is compared. */
  limited: (creatorId: string) => Promise<boolean>
  now?: number
}

/** Why the password page is shown again, as its `?error=`. */
export type EnterRefusal = "wrong" | "limit" | "unavailable"

export type EnterResult =
  | { ok: true; pass: string; to: string }
  /** The website does not ask for a password (any more): straight on, no pass needed. */
  | { ok: "open"; to: string }
  | { ok: false; why: EnterRefusal; to: string }

/** The password page with a reason and the page to go back to, as a path on the website. */
export function passwordPagePath(why: EnterRefusal | null, back: string): string {
  const q = new URLSearchParams()
  if (why) q.set("error", why)
  if (back !== "/") q.set("return", back)
  const s = q.toString()
  return `/password${s ? `?${s}` : ""}`
}

export async function enterPassword(input: { host: string; password: unknown; returnTo: unknown }, deps: EnterDeps): Promise<EnterResult> {
  const now = deps.now ?? Date.now()
  const back = passReturnPath(input.returnTo)
  const site = await deps.owner(input.host)
  if (!site) return { ok: "open", to: "/" }
  const access = await readSiteAccess(deps.db, site.creatorId)
  if (!access.enabled || !access.hash) return { ok: "open", to: back }
  if (await deps.limited(site.creatorId)) return { ok: false, why: "limit", to: passwordPagePath("limit", back) }
  if (!(await verifyPassword(input.password, access.hash))) return { ok: false, why: "wrong", to: passwordPagePath("wrong", back) }
  const pass = await mintPass({ t: "pass", c: site.creatorId, h: input.host, v: access.version, e: now + PASS_TTL_MS })
  if (!pass) return { ok: false, why: "unavailable", to: passwordPagePath("unavailable", back) }
  return { ok: true, pass, to: back }
}

/**
 * storelib.com's half of letting the owner in: the signed in user owns the
 * creator whose website answers at this host, and that website asks for a
 * password. The answer is the website's own address with a two minute note.
 */
export type HandOffResult = { ok: true; url: string } | { ok: false; why: "site" | "owner" | "open" | "unavailable" }

export async function ownerHandOff(
  input: { host: string; userId: string; returnTo: unknown; origin: (host: string) => string },
  deps: { db: Db; owner: (host: string) => Promise<{ creatorId: string } | null>; ownsCreator: (userId: string, creatorId: string) => Promise<boolean>; now?: number },
): Promise<HandOffResult> {
  const now = deps.now ?? Date.now()
  const site = await deps.owner(input.host)
  if (!site) return { ok: false, why: "site" }
  if (!(await deps.ownsCreator(input.userId, site.creatorId))) return { ok: false, why: "owner" }
  const access = await readSiteAccess(deps.db, site.creatorId)
  if (!access.enabled) return { ok: false, why: "open" }
  const note = await mintPass({ t: "owner", c: site.creatorId, h: input.host, v: access.version, e: now + OWNER_TTL_MS, j: randomUUID(), u: input.userId })
  if (!note) return { ok: false, why: "unavailable" }
  const to = new URL("/api/site-password", input.origin(input.host))
  to.searchParams.set("pass", note)
  const back = passReturnPath(input.returnTo)
  if (back !== "/") to.searchParams.set("return", back)
  return { ok: true, url: to.toString() }
}

/** The website's half: the note is this host's, still fresh, for the creator whose website this is, and has not been used. */
export async function spendOwnerPass(input: { host: string; note: unknown; returnTo: unknown }, deps: { db: Db; owner: (host: string) => Promise<{ creatorId: string } | null>; now?: number }): Promise<EnterResult> {
  const now = deps.now ?? Date.now()
  const back = passReturnPath(input.returnTo)
  const claims = await readPass(input.note, now)
  if (!claims || claims.t !== "owner" || claims.h !== input.host) return { ok: false, why: "unavailable", to: passwordPagePath(null, back) }
  const site = await deps.owner(input.host)
  if (!site || site.creatorId !== claims.c) return { ok: false, why: "unavailable", to: passwordPagePath(null, back) }
  const access = await readSiteAccess(deps.db, site.creatorId)
  if (!access.enabled) return { ok: "open", to: back }
  /* Spent once: the id's row is unique. A table that is not there yet leaves the two minutes as the only limit. */
  try {
    const { error } = await deps.db.from("site_account_codes").insert({ jti: claims.j, creator_id: site.creatorId, user_id: claims.u, host: input.host })
    if (error && String(error.code) === "23505") return { ok: false, why: "unavailable", to: passwordPagePath(null, back) }
  } catch {
    /* The expiry stands. */
  }
  const pass = await mintPass({ t: "pass", c: site.creatorId, h: input.host, v: access.version, e: now + PASS_TTL_MS })
  if (!pass) return { ok: false, why: "unavailable", to: passwordPagePath("unavailable", back) }
  return { ok: true, pass, to: back }
}

/** The sentence the password page shows for an `?error=`. Fixed words; nothing from the address is printed. */
export function passwordNotice(error: unknown): string | null {
  switch (error) {
    case "wrong":
      return "That password is not right. Try again."
    case "limit":
      return "Too many tries. Wait a few minutes and try again."
    case "unavailable":
      return "Something went wrong. Try again."
    case "owner":
      return "Only the owner of this website can enter that way."
    default:
      return null
  }
}
