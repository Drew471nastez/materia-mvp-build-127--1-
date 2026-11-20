import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"
import type { Env } from "./config"

/**
 * THE STATE CARRIED THROUGH DISCORD'S AUTHORIZE SCREEN. Signed, naming who
 * started it (the signed in Storelib account), what for (a creator adding
 * the bot, or a buyer joining with a product), a nonce also kept in an http
 * only cookie, and an expiry: the callback refuses a state made for someone
 * else, one from another browser, one altered, or one older than ten
 * minutes. The same rule as Google Calendar's (lib/google-calendar/api).
 */

export type StateKind = "install" | "join"

export interface StatePayload {
  kind: StateKind
  userId: string
  /** The buyer's product, for a join. */
  productId: string | null
  /** Where the buyer goes back to on a problem, a same site path. */
  back: string | null
}

export const NONCE_COOKIE = "slb_discord_nonce"
export const STATE_TTL_MS = 10 * 60_000

function stateKey(env: Env = process.env): Buffer {
  const own = env.COMMERCE_SECRETS_KEY
  const base = own || env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No key to sign the Discord state with: set COMMERCE_SECRETS_KEY")
  return Buffer.from(hkdfSync("sha256", Buffer.from(base, "utf8"), Buffer.from("storelib-community-roles-state"), Buffer.from(own ? "own" : "service"), 32))
}

export function makeState(p: StatePayload, now = Date.now()): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url")
  const body = Buffer.from(JSON.stringify({ k: p.kind, u: p.userId, p: p.productId, b: p.back, n: nonce, e: now + STATE_TTL_MS })).toString("base64url")
  const mac = createHmac("sha256", stateKey()).update(body).digest("base64url")
  return { state: `${body}.${mac}`, nonce }
}

/** The payload when the state is good for this person, this browser and now; null otherwise. */
export function readState(state: unknown, nonce: unknown, userId: string, now = Date.now()): StatePayload | null {
  if (typeof state !== "string" || typeof nonce !== "string" || !nonce || state.length > 1200) return null
  const [body, mac] = state.split(".")
  if (!body || !mac) return null
  const want = Buffer.from(createHmac("sha256", stateKey()).update(body).digest("base64url"))
  const got = Buffer.from(mac)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { k?: string; u?: string; p?: string | null; b?: string | null; n?: string; e?: number }
    if (v.u !== userId || v.n !== nonce || typeof v.e !== "number" || v.e <= now) return null
    if (v.k !== "install" && v.k !== "join") return null
    return { kind: v.k, userId: v.u, productId: typeof v.p === "string" ? v.p : null, back: safeBack(v.b) }
  } catch {
    return null
  }
}

/** A path on this site only: "/library", never "//evil.com" or "https://...". */
export function safeBack(path: unknown): string | null {
  if (typeof path !== "string" || path.length > 300) return null
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) return null
  return path
}
