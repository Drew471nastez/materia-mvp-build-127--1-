import "server-only"

/**
 * Connecting, changing and disconnecting the tools a OnePage's signups go to
 * (./providers, ./deliver-server). The owner's own store only
 * (app/api/onepage/integrations, shopCaller). A key is asked of the provider
 * before it is kept, sealed (lib/physical/secrets), and comes back as its
 * last four characters; a webhook is sent a test event before it is kept,
 * and its signing secret is shown once, on that answer.
 */

import { randomBytes } from "node:crypto"
import { sealSecret, openSecret, secretHint } from "@/lib/physical/secrets"
import { openWebhook, postPublic, SEND_TIMEOUT_MS, type Answer } from "./deliver-server"
import {
  PAGE_INTEGRATIONS,
  PAGE_INTEGRATION_NAME,
  accountRequest,
  isPageIntegration,
  isWebhookIntegration,
  keyProblem,
  kitTagsFrom,
  kitTagsRequest,
  listsFrom,
  outcomeOf,
  refusalText,
  webhookProblem,
  webhookSignature,
  webhookTestPayload,
  type ConnectionConfig,
  type PageIntegration,
  type ProviderList,
  type ProviderRequest,
  type WebhookIntegration,
} from "./providers"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface PageIntegrationView {
  provider: PageIntegration
  connected: boolean
  /** The key's last four characters, or the webhook's host. */
  hint: string | null
  listId: string | null
  listName: string | null
  tagId: string | null
  tagName: string | null
  doubleOptin: boolean
  tag: string | null
  sent: number
  failed: number
  lastSentAt: string | null
  lastError: string | null
  lastErrorAt: string | null
}

export interface PageIntegrationsAnswer {
  integrations: PageIntegrationView[]
  /** Part 315 has not run: nothing can be connected yet. */
  ready: boolean
}

const ROW = "id, provider, status, account_label, config, secret_ciphertext, sent_count, failed_count, last_sent_at, last_error, last_error_at"

type Row = {
  id: string
  provider: string
  status: string
  account_label: string | null
  config: ConnectionConfig | null
  secret_ciphertext: string | null
  sent_count: number | null
  failed_count: number | null
  last_sent_at: string | null
  last_error: string | null
  last_error_at: string | null
}

function hintOf(provider: PageIntegration, sealed: string | null): string | null {
  if (!sealed) return null
  if (isWebhookIntegration(provider)) {
    const hook = openWebhook(sealed)
    try {
      return hook ? new URL(hook.url).host : null
    } catch {
      return null
    }
  }
  return secretHint(openSecret(sealed))
}

export async function loadPageIntegrations(db: Db, creatorId: string): Promise<PageIntegrationsAnswer> {
  const { data, error } = await db.from("onepage_integrations").select(ROW).eq("creator_id", creatorId)
  const rows = new Map<string, Row>(((error ? [] : data) ?? []).map((r: Row) => [r.provider, r]))
  const integrations = PAGE_INTEGRATIONS.map((provider): PageIntegrationView => {
    const r = rows.get(provider)
    const c = r?.config ?? {}
    return {
      provider,
      connected: !!r && r.status === "connected",
      hint: r ? hintOf(provider, r.secret_ciphertext) : null,
      listId: typeof c.list_id === "string" ? c.list_id : null,
      listName: typeof c.list_name === "string" ? c.list_name : null,
      tagId: typeof c.tag_id === "string" ? c.tag_id : null,
      tagName: typeof c.tag_name === "string" ? c.tag_name : null,
      doubleOptin: c.double_optin === true,
      tag: typeof c.tag === "string" ? c.tag : null,
      sent: Number(r?.sent_count ?? 0),
      failed: Number(r?.failed_count ?? 0),
      lastSentAt: r?.last_sent_at ?? null,
      lastError: r?.last_error ?? null,
      lastErrorAt: r?.last_error_at ?? null,
    }
  })
  return { integrations, ready: !error }
}

/* ── asking a provider ─────────────────────────────────────────────────── */

async function askJson(req: ProviderRequest): Promise<Answer> {
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, signal: AbortSignal.timeout(SEND_TIMEOUT_MS), cache: "no-store" })
    const text = await res.text().catch(() => "")
    try {
      return { status: res.status, body: text ? JSON.parse(text) : null }
    } catch {
      return { status: res.status, body: text }
    }
  } catch {
    return { status: 0, body: null }
  }
}

export type ListsAnswer = { ok: true; lists: ProviderList[]; tags: ProviderList[] } | { ok: false; error: string; status: number }

/** The lists (Mailchimp audiences, Kit forms and tags, beehiiv publications) a key can reach. */
export async function listsFor(provider: "mailchimp" | "kit" | "beehiiv", key: string, asker: (r: ProviderRequest) => Promise<Answer> = askJson): Promise<ListsAnswer> {
  const shape = keyProblem(provider, key)
  if (shape) return { ok: false, error: shape, status: 400 }
  const req = accountRequest(provider, key)
  if (!req) return { ok: false, error: keyProblem(provider, "") ?? "That key cannot be read.", status: 400 }
  const a = await asker(req)
  if (a.status === 0) return { ok: false, error: `${PAGE_INTEGRATION_NAME[provider]} did not answer. Try again in a moment.`, status: 502 }
  if (outcomeOf(provider, a.status, a.body) !== "ok") return { ok: false, error: refusalText(provider, a.status, a.body), status: 400 }
  const lists = listsFrom(provider, a.body)
  let tags: ProviderList[] = []
  if (provider === "kit") {
    const t = await asker(kitTagsRequest(key))
    if (t.status >= 200 && t.status < 300) tags = kitTagsFrom(t.body)
  }
  return { ok: true, lists, tags }
}

/* ── saving ─────────────────────────────────────────────────────────────── */

export type SaveResult =
  | { ok: true; lists?: ProviderList[]; tags?: ProviderList[]; signingSecret?: string }
  | { ok: false; error: string; status?: number }

const clean = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

async function rowOf(db: Db, creatorId: string, provider: PageIntegration): Promise<Row | null> {
  const { data } = await db.from("onepage_integrations").select(ROW).eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  return (data as Row | null) ?? null
}

function tableMissing(error: { code?: string } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || error.code === "42703")
}
const NEEDS_SQL = "Connecting needs SQL part 315 run in Supabase first."

/** Send a webhook its test event. */
export async function testWebhook(provider: WebhookIntegration, url: string, secret: string, post: (u: string, b: string, h: Record<string, string>) => Promise<Answer> = (u, b, h) => postPublic(u, b, h, SEND_TIMEOUT_MS)): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = `test_${randomBytes(6).toString("hex")}`
  const body = JSON.stringify(webhookTestPayload(id, new Date().toISOString()))
  const a = await post(url, body, { "content-type": "application/json", "user-agent": "Storelib-Webhooks/1.0", "x-storelib-event": "onepage.test", "x-storelib-delivery": id, "x-storelib-signature": webhookSignature(secret, body) })
  if (outcomeOf(provider, a.status, a.body) === "ok") return { ok: true }
  return { ok: false, error: a.status === 0 ? `${PAGE_INTEGRATION_NAME[provider]} did not answer at that address.` : refusalText(provider, a.status, a.body) }
}

/**
 * One request from the card:
 *   { provider, step: "lists", apiKey? }      the lists the key reaches (the stored key when none is given)
 *   { provider, step: "connect", apiKey?, listId, listName, tagId, tagName, doubleOptin, tag }
 *   { provider, step: "connect", url }        a webhook, tested first
 *   { provider, step: "test" }                ask again with what is stored
 *   { provider, disconnect: true }
 */
export async function savePageIntegration(db: Db, creatorId: string, body: Record<string, unknown>): Promise<SaveResult> {
  const provider = body.provider
  if (!isPageIntegration(provider)) return { ok: false, error: "Bad request.", status: 400 }
  const name = PAGE_INTEGRATION_NAME[provider]
  const now = new Date().toISOString()

  if (body.disconnect === true) {
    const { error } = await db.from("onepage_integrations").delete().eq("creator_id", creatorId).eq("provider", provider)
    if (error && !tableMissing(error)) return { ok: false, error: "That could not be disconnected. Try again.", status: 500 }
    return { ok: true }
  }

  const existing = await rowOf(db, creatorId, provider)
  const step = body.step

  if (isWebhookIntegration(provider)) {
    if (step === "test") {
      const hook = existing ? openWebhook(existing.secret_ciphertext) : null
      if (!hook) return { ok: false, error: `Connect ${name} first.`, status: 400 }
      const t = await testWebhook(provider, hook.url, hook.secret)
      await db.from("onepage_integrations").update("error" in t ? { last_error: t.error.slice(0, 500), last_error_at: now, updated_at: now } : { last_error: null, last_error_at: null, updated_at: now }).eq("id", existing!.id)
      return "error" in t ? { ok: false, error: t.error, status: 400 } : { ok: true }
    }
    if (step !== "connect") return { ok: false, error: "Bad request.", status: 400 }
    const url = clean(body.url, 600)
    const problem = url ? webhookProblem(provider, url) : "Paste the address."
    if (problem || !url) return { ok: false, error: problem ?? "Paste the address.", status: 400 }
    const secret = randomBytes(24).toString("base64url")
    const t = await testWebhook(provider, url, secret)
    if ("error" in t) return { ok: false, error: t.error, status: 400 }
    const row = { creator_id: creatorId, provider, status: "connected", account_label: new URL(url).host, config: {}, secret_ciphertext: sealSecret(JSON.stringify({ url, secret })), last_error: null, last_error_at: null, updated_at: now }
    const { error } = await db.from("onepage_integrations").upsert(row, { onConflict: "creator_id,provider" })
    if (error) return { ok: false, error: tableMissing(error) ? NEEDS_SQL : "That could not be saved. Try again.", status: tableMissing(error) ? 409 : 500 }
    return { ok: true, signingSecret: secret }
  }

  const given = clean(body.apiKey, 200)
  const key = given ?? (existing ? openSecret(existing.secret_ciphertext) : null)
  if (!key) return { ok: false, error: `Paste your ${name} API key.`, status: 400 }

  const found = await listsFor(provider as "mailchimp" | "kit" | "beehiiv", key)
  if (found.ok === false) {
    if (existing && step === "test") await db.from("onepage_integrations").update({ last_error: found.error.slice(0, 500), last_error_at: now, updated_at: now }).eq("id", existing.id)
    return { ok: false, error: found.error, status: found.status }
  }
  if (step === "lists") return { ok: true, lists: found.lists, tags: found.tags }

  if (step === "test") {
    if (!existing) return { ok: false, error: `Connect ${name} first.`, status: 400 }
    const listId = existing.config?.list_id
    const stillThere = !listId || found.lists.some((l) => l.id === listId)
    const error = stillThere ? null : `${name} no longer has the list ${existing.config?.list_name ?? ""}. Choose another.`.replace(/\s+\./, ".")
    await db.from("onepage_integrations").update(error ? { last_error: error, last_error_at: now, updated_at: now } : { last_error: null, last_error_at: null, updated_at: now }).eq("id", existing.id)
    return error ? { ok: false, error, status: 400 } : { ok: true, lists: found.lists, tags: found.tags }
  }

  if (step !== "connect") return { ok: false, error: "Bad request.", status: 400 }
  const listId = clean(body.listId, 80)
  const list = listId ? found.lists.find((l) => l.id === listId) : null
  const tagId = provider === "kit" ? clean(body.tagId, 40) : null
  const tagRow = tagId ? found.tags.find((t) => t.id === tagId) : null
  /* Mailchimp and beehiiv put a member on a list; Kit takes a form, a tag, or neither (a subscriber on the account). */
  if (provider !== "kit" && !list) return { ok: false, error: provider === "mailchimp" ? "Choose an audience." : "Choose a publication.", status: 400 }
  if (listId && !list) return { ok: false, error: "That list is not on this account.", status: 400 }
  const config: ConnectionConfig = {
    list_id: list?.id ?? null,
    list_name: list?.name ?? null,
    ...(provider === "kit" ? { tag_id: tagRow?.id ?? null, tag_name: tagRow?.name ?? null } : {}),
    ...(provider === "mailchimp" ? { double_optin: body.doubleOptin === true, tag: clean(body.tag, 100) } : {}),
  }
  const row = { creator_id: creatorId, provider, status: "connected", account_label: list?.name ?? null, config, secret_ciphertext: sealSecret(key), last_error: null, last_error_at: null, updated_at: now }
  const { error } = await db.from("onepage_integrations").upsert(row, { onConflict: "creator_id,provider" })
  if (error) return { ok: false, error: tableMissing(error) ? NEEDS_SQL : "That could not be saved. Try again.", status: tableMissing(error) ? 409 : 500 }
  return { ok: true }
}
