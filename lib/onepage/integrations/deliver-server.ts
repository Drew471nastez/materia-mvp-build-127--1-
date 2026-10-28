import "server-only"

/**
 * ===========================================================================
 *  A ONEPAGE SIGNUP, SENT ON TO THE CREATOR'S OWN TOOLS
 * ===========================================================================
 * Called after a signup is saved on Storelib (app/api/onepage/leads,
 * email-capture, lead-magnet, subscribe), inside `after()`, so the visitor
 * never waits for Mailchimp. Each connected tool (SQL part 315,
 * onepage_integrations) gets the signup once; a busy or down provider is
 * asked once more a moment later; a refusal (a wrong key, a deleted list, a
 * dead hook) is written on the connection, and the card in the editor's
 * Settings › Integrations says it, in the provider's own words where they
 * are short. Nothing here can fail the signup: Storelib's own list already
 * has the person.
 *
 * Keys are opened here, on the server, and nowhere else. Webhook addresses
 * are connected to through lib/api/public-fetch's lookup, so an address that
 * resolves to a private network is refused at the socket.
 */

import https from "node:https"
import type net from "node:net"
import { randomUUID } from "node:crypto"
import { openSecret } from "@/lib/physical/secrets"
import { publicLookup, publicUrlProblem } from "@/lib/api/public-fetch"
import {
  PAGE_INTEGRATION_NAME,
  isPageIntegration,
  isWebhookIntegration,
  outcomeOf,
  refusalText,
  signupRequests,
  webhookPayload,
  webhookSignature,
  type ConnectionConfig,
  type Outcome,
  type PageIntegration,
  type PageSignup,
  type ProviderRequest,
} from "./providers"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const SEND_TIMEOUT_MS = 8000
const RETRY_AFTER_MS = 1500

export interface ConnectionRow {
  id: string
  creator_id: string
  provider: string
  status: string
  config: ConnectionConfig | null
  secret_ciphertext: string | null
}

/** The webhook's sealed half: its address and its signing secret. */
export type WebhookSecret = { url: string; secret: string }

export function openWebhook(sealed: string | null | undefined): WebhookSecret | null {
  const plain = openSecret(sealed)
  if (!plain) return null
  try {
    const v = JSON.parse(plain) as Partial<WebhookSecret>
    return typeof v.url === "string" && typeof v.secret === "string" ? { url: v.url, secret: v.secret } : null
  } catch {
    return null
  }
}

/* ── sending ─────────────────────────────────────────────────────────────── */

export type Answer = { status: number; body: unknown }

/** A provider's API, by its own fixed host: plain fetch, with a time limit. */
async function ask(req: ProviderRequest, timeoutMs: number): Promise<Answer> {
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(timeoutMs), cache: "no-store", redirect: "manual" })
    const text = await res.text().catch(() => "")
    let body: unknown = text
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      /* not JSON: kept as text for the refusal line */
    }
    return { status: res.status, body }
  } catch {
    return { status: 0, body: null }
  }
}

/**
 * A POST to an address the creator typed: public hosts only, checked when
 * the socket connects, no redirect followed (an Apps Script's 302 is its
 * answer), at most 64 KB read back.
 */
export function postPublic(url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<Answer> {
  const problem = publicUrlProblem(url)
  if (problem || !url.startsWith("https://")) return Promise.resolve({ status: 0, body: `refused: ${problem ?? "not https"}` })
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: "POST", lookup: publicLookup as unknown as net.LookupFunction, headers: { ...headers, "content-length": String(Buffer.byteLength(body)) } },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (c: Buffer) => {
          size += c.length
          if (size <= 64 * 1024) chunks.push(c)
        })
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8").slice(0, 2000) }))
        res.on("error", () => resolve({ status: 0, body: null }))
      },
    )
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timed out")))
    req.on("error", () => resolve({ status: 0, body: null }))
    req.end(body)
  })
}

export interface Transport {
  ask: (req: ProviderRequest) => Promise<Answer>
  post: (url: string, body: string, headers: Record<string, string>) => Promise<Answer>
  wait: (ms: number) => Promise<void>
}

const realTransport: Transport = {
  ask: (req) => ask(req, SEND_TIMEOUT_MS),
  post: (url, body, headers) => postPublic(url, body, headers, SEND_TIMEOUT_MS),
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
}

export type SendResult = { ok: true } | { ok: false; error: string }

/** One signup into one connection: each request in turn, one more try for a busy provider. */
export async function sendToConnection(row: ConnectionRow, signup: PageSignup, transport: Transport = realTransport, payloadId: string = randomUUID()): Promise<SendResult> {
  const provider = row.provider
  if (!isPageIntegration(provider)) return { ok: false, error: "Unknown integration." }
  const name = PAGE_INTEGRATION_NAME[provider]

  const once = async (): Promise<{ outcome: Outcome; error?: string }> => {
    if (isWebhookIntegration(provider)) {
      const hook = openWebhook(row.secret_ciphertext)
      if (!hook) return { outcome: "refused", error: `${name} needs connecting again.` }
      const body = JSON.stringify(webhookPayload(signup, payloadId))
      const a = await transport.post(hook.url, body, { "content-type": "application/json", "user-agent": "Storelib-Webhooks/1.0", "x-storelib-event": "onepage.signup", "x-storelib-delivery": payloadId, "x-storelib-signature": webhookSignature(hook.secret, body) })
      const outcome = outcomeOf(provider, a.status, a.body)
      return outcome === "ok" ? { outcome } : { outcome, error: a.status === 0 ? `${name} did not answer.` : refusalText(provider, a.status, a.body) }
    }
    const key = openSecret(row.secret_ciphertext)
    if (!key) return { outcome: "refused", error: `${name} needs connecting again.` }
    const requests = signupRequests(provider as "mailchimp" | "kit" | "beehiiv", key, row.config ?? {}, signup)
    if (requests.length === 0) return { outcome: "refused", error: `Choose a list for ${name}.` }
    for (const req of requests) {
      const a = await transport.ask(req)
      const outcome = outcomeOf(provider, a.status, a.body)
      if (outcome !== "ok") return { outcome, error: a.status === 0 ? `${name} did not answer.` : refusalText(provider, a.status, a.body) }
    }
    return { outcome: "ok" }
  }

  let r = await once()
  if (r.outcome === "retry") {
    await transport.wait(RETRY_AFTER_MS)
    r = await once()
  }
  return r.outcome === "ok" ? { ok: true } : { ok: false, error: r.error || `${name} did not take it.` }
}

/* ── the connections, and what happened ──────────────────────────────────── */

const ROW = "id, creator_id, provider, status, config, secret_ciphertext"

export async function connectedRows(db: Db, creatorId: string): Promise<ConnectionRow[]> {
  const { data, error } = await db.from("onepage_integrations").select(ROW).eq("creator_id", creatorId).eq("status", "connected")
  /* Part 315 not run yet: there is nothing connected, and nothing to say. */
  if (error) return []
  return ((data ?? []) as ConnectionRow[]).filter((r) => isPageIntegration(r.provider))
}

/** Counts and the last error, in one step (the part's own function, so two signups at once both count). */
export async function noteResult(db: Db, rowId: string, result: SendResult): Promise<void> {
  try {
    await db.rpc("onepage_integration_note", { p_id: rowId, p_ok: result.ok, p_error: "error" in result ? result.error.slice(0, 500) : null })
  } catch {
    /* the record is a nicety; the signup is on Storelib already */
  }
}

/**
 * Every connected tool, at once. Never throws. Returns what happened per
 * provider for the caller's log line and the tests.
 */
export async function deliverSignup(db: Db, creatorId: string | null | undefined, signup: PageSignup, transport: Transport = realTransport): Promise<Partial<Record<PageIntegration, SendResult>>> {
  const out: Partial<Record<PageIntegration, SendResult>> = {}
  if (!creatorId || !signup.email) return out
  let rows: ConnectionRow[] = []
  try {
    rows = await connectedRows(db, creatorId)
  } catch {
    return out
  }
  await Promise.all(
    rows.map(async (row) => {
      let result: SendResult
      try {
        result = await sendToConnection(row, signup, transport)
      } catch {
        result = { ok: false, error: "That could not be sent." }
      }
      out[row.provider as PageIntegration] = result
      await noteResult(db, row.id, result)
      if ("error" in result) console.warn(`[onepage-integrations] ${row.provider} for ${creatorId}: ${result.error}`)
    }),
  )
  return out
}

/** The signup as the routes have it, into the shape that goes out. */
export function pageSignup(input: { email: string; name?: string | null; form: string; magnet?: string | null; detail?: string | null; blockId?: string | null; onepageId?: string | null; pageUrl?: string | null }): PageSignup {
  let pageUrl: string | null = null
  try {
    pageUrl = input.pageUrl ? new URL(input.pageUrl).toString().slice(0, 500) : null
  } catch {
    pageUrl = null
  }
  return {
    email: input.email.trim().toLowerCase(),
    name: input.name ? String(input.name).slice(0, 80) : null,
    form: input.form,
    magnet: input.magnet ?? null,
    detail: input.detail ? String(input.detail).slice(0, 200) : null,
    blockId: typeof input.blockId === "string" ? input.blockId.slice(0, 80) : null,
    onepageId: input.onepageId ?? null,
    pageUrl,
    at: new Date().toISOString(),
  }
}
