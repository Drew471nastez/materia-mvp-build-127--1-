/**
 * ===========================================================================
 *  WHERE A ONEPAGE SIGNUP CAN GO, BESIDES STORELIB'S OWN LIST
 * ===========================================================================
 * Every signup on a OnePage (the email signup, a lead magnet, the contact
 * form's box) is kept in Emails › Subscribers first. Klaviyo and Omnisend
 * take the whole list on their own sync (lib/integrations/marketing). These
 * take each signup as it happens, from the server, with the creator's own
 * key sealed in the database (lib/physical/secrets) and never sent back:
 *
 *   mailchimp   an audience member, PUT by the address's hash so a second
 *               signup is the same member. A member who unsubscribed in
 *               Mailchimp stays unsubscribed (status_if_new only).
 *   kit         a Kit (ConvertKit) subscriber, then on the chosen form or
 *               tag, through Kit's v4 API.
 *   beehiiv     a subscription on the chosen publication.
 *   zapier      a JSON POST to a Zapier catch hook, a Make webhook, or a
 *   make        Google Sheets Apps Script web app (the script appends a
 *   sheets      row), or any https address of the creator's: signed with
 *   webhook     HMAC SHA-256 in X-Storelib-Signature.
 *
 * Plain functions: each builds the request it would send, so the tests can
 * read exactly what goes to a provider without a network
 * (tests/onepage-blocks-r40.test.ts). ./deliver-server.ts sends them.
 */

import { createHash, createHmac } from "node:crypto"
import { PAGE_INTEGRATION_NAME, isWebhookIntegration, type PageIntegration, type WebhookIntegration } from "./catalog"

export { PAGE_INTEGRATIONS, PAGE_INTEGRATION_DOCS, PAGE_INTEGRATION_NAME, isPageIntegration, isWebhookIntegration, type PageIntegration, type WebhookIntegration } from "./catalog"

/** What one signup carries. Only what the visitor typed and where they typed it. */
export interface PageSignup {
  email: string
  name?: string | null
  /** "signup" (the email block), "lead_magnet", "contact". */
  form: string
  /** download, discount or waitlist, for a lead magnet. */
  magnet?: string | null
  /** The waitlist's name, a free file's title. */
  detail?: string | null
  blockId?: string | null
  onepageId?: string | null
  pageUrl?: string | null
  at: string
}

export interface ProviderRequest {
  method: "GET" | "POST" | "PUT"
  url: string
  headers: Record<string, string>
  body?: string
}

/* ─── The shape of a key, checked before anything is asked ─────────────── */

/** A Mailchimp key is 32 hex characters, a dash and its data centre: "…-us21". */
export function mailchimpDc(key: string): string | null {
  const m = /^[0-9a-f]{32}-(us\d{1,2})$/i.exec(key.trim())
  return m ? m[1].toLowerCase() : null
}

export function keyProblem(provider: PageIntegration, key: string): string | null {
  const k = key.trim()
  if (provider === "mailchimp") return mailchimpDc(k) ? null : "A Mailchimp API key looks like 0123…abcd-us21."
  if (provider === "kit") return /^[A-Za-z0-9_-]{20,120}$/.test(k) ? null : "Paste a Kit v4 API key (Settings, Developer)."
  if (provider === "beehiiv") return /^[A-Za-z0-9_-]{20,200}$/.test(k) ? null : "Paste a beehiiv API key (Settings, API)."
  return null
}

/**
 * A webhook address that may be asked: https, a public host (the address
 * is checked again when it is connected to, lib/api/public-fetch), and for
 * the named services their own hosts, so a Zapier card holds a Zapier hook.
 */
export function webhookProblem(provider: WebhookIntegration, raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return "Paste the whole address, starting with https://."
  }
  if (url.protocol !== "https:") return "The address has to start with https://."
  if (url.username || url.password) return "Leave the user name and password out of the address."
  if (url.port && url.port !== "443") return "Use the address without a port."
  const host = url.hostname.toLowerCase()
  if (provider === "zapier" && host !== "hooks.zapier.com") return "A Zapier catch hook starts with https://hooks.zapier.com/."
  if (provider === "make" && !/^hook\.[a-z0-9-]+\.make\.com$/.test(host) && host !== "hook.integromat.com") return "A Make webhook starts with https://hook.…make.com/."
  if (provider === "sheets" && !(host === "script.google.com" && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname))) return "Paste the Apps Script web app address, ending in /exec."
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || !host.includes(".")) return "Use a public address."
  return null
}

/* ─── The requests ────────────────────────────────────────────────────── */

const JSON_HEADERS = { "content-type": "application/json", accept: "application/json", "user-agent": "Storelib/1.0 (+https://storelib.com)" }

function mailchimpAuth(key: string): string {
  return `Basic ${Buffer.from(`storelib:${key.trim()}`).toString("base64")}`
}

export function mailchimpBase(key: string): string | null {
  const dc = mailchimpDc(key)
  return dc ? `https://${dc}.api.mailchimp.com/3.0` : null
}

export function emailHashMd5(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex")
}

/** First name only for the provider's first name field: the first word of what was typed. */
export function firstName(name: string | null | undefined): string | null {
  const t = (name || "").trim()
  return t ? t.split(/\s+/)[0].slice(0, 60) : null
}

/** The account check and the lists to choose from, per provider. */
export function accountRequest(provider: "mailchimp" | "kit" | "beehiiv", key: string): ProviderRequest | null {
  if (provider === "mailchimp") {
    const base = mailchimpBase(key)
    return base ? { method: "GET", url: `${base}/lists?count=100&fields=lists.id,lists.name`, headers: { ...JSON_HEADERS, authorization: mailchimpAuth(key) } } : null
  }
  if (provider === "kit") return { method: "GET", url: "https://api.kit.com/v4/forms?status=active&per_page=100", headers: { ...JSON_HEADERS, "x-kit-api-key": key.trim() } }
  return { method: "GET", url: "https://api.beehiiv.com/v2/publications?limit=100", headers: { ...JSON_HEADERS, authorization: `Bearer ${key.trim()}` } }
}

export function kitTagsRequest(key: string): ProviderRequest {
  return { method: "GET", url: "https://api.kit.com/v4/tags?per_page=100", headers: { ...JSON_HEADERS, "x-kit-api-key": key.trim() } }
}

export type ProviderList = { id: string; name: string }

/** The lists, forms or publications in a provider's answer. */
export function listsFrom(provider: "mailchimp" | "kit" | "beehiiv", body: unknown): ProviderList[] {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const raw = (provider === "mailchimp" ? b.lists : provider === "kit" ? b.forms : b.data) as unknown
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => x as { id?: unknown; name?: unknown })
    .filter((x) => (typeof x.id === "string" || typeof x.id === "number") && typeof x.name === "string")
    .map((x) => ({ id: String(x.id), name: String(x.name).slice(0, 120) }))
    .slice(0, 100)
}

export function kitTagsFrom(body: unknown): ProviderList[] {
  const raw = (body as { tags?: unknown } | null)?.tags
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => x as { id?: unknown; name?: unknown })
    .filter((x) => (typeof x.id === "string" || typeof x.id === "number") && typeof x.name === "string")
    .map((x) => ({ id: String(x.id), name: String(x.name).slice(0, 120) }))
}

export interface ConnectionConfig {
  /** Mailchimp audience, Kit form, beehiiv publication. */
  list_id?: string | null
  list_name?: string | null
  /** Kit: a tag as well, or instead of a form. */
  tag_id?: string | null
  tag_name?: string | null
  /** Mailchimp: send Mailchimp's own confirmation email first (the member is "pending" until they confirm). */
  double_optin?: boolean
  /** Mailchimp: a tag on every member that came from the page. */
  tag?: string | null
  /** Webhooks: the address. Kept sealed with the secret, never in config. */
}

/** The requests that put one signup into one provider, in order. */
export function signupRequests(provider: "mailchimp" | "kit" | "beehiiv", key: string, config: ConnectionConfig, signup: PageSignup): ProviderRequest[] {
  const email = signup.email.trim().toLowerCase()
  const first = firstName(signup.name)
  if (provider === "mailchimp") {
    const base = mailchimpBase(key)
    if (!base || !config.list_id || !/^[A-Za-z0-9]{1,40}$/.test(config.list_id)) return []
    const headers = { ...JSON_HEADERS, authorization: mailchimpAuth(key) }
    const member = `${base}/lists/${config.list_id}/members/${emailHashMd5(email)}`
    const out: ProviderRequest[] = [
      {
        method: "PUT",
        url: member,
        headers,
        body: JSON.stringify({ email_address: email, status_if_new: config.double_optin ? "pending" : "subscribed", ...(first ? { merge_fields: { FNAME: first } } : {}) }),
      },
    ]
    const tag = (config.tag || "").trim()
    if (tag) out.push({ method: "POST", url: `${member}/tags`, headers, body: JSON.stringify({ tags: [{ name: tag.slice(0, 100), status: "active" }] }) })
    return out
  }
  if (provider === "kit") {
    const headers = { ...JSON_HEADERS, "x-kit-api-key": key.trim() }
    const out: ProviderRequest[] = [{ method: "POST", url: "https://api.kit.com/v4/subscribers", headers, body: JSON.stringify({ email_address: email, ...(first ? { first_name: first } : {}), state: "active" }) }]
    if (config.list_id && /^\d{1,20}$/.test(config.list_id)) out.push({ method: "POST", url: `https://api.kit.com/v4/forms/${config.list_id}/subscribers`, headers, body: JSON.stringify({ email_address: email, ...(signup.pageUrl ? { referrer: signup.pageUrl } : {}) }) })
    if (config.tag_id && /^\d{1,20}$/.test(config.tag_id)) out.push({ method: "POST", url: `https://api.kit.com/v4/tags/${config.tag_id}/subscribers`, headers, body: JSON.stringify({ email_address: email }) })
    return out
  }
  if (!config.list_id || !/^pub_[A-Za-z0-9-]{8,60}$/.test(config.list_id)) return []
  return [
    {
      method: "POST",
      url: `https://api.beehiiv.com/v2/publications/${config.list_id}/subscriptions`,
      headers: { ...JSON_HEADERS, authorization: `Bearer ${key.trim()}` },
      body: JSON.stringify({
        email,
        /* A signup on the page is the person asking: someone who left before and signs up again is back. */
        reactivate_existing: true,
        send_welcome_email: true,
        utm_source: "storelib",
        utm_medium: "onepage",
        ...(signup.pageUrl ? { referring_site: signup.pageUrl } : {}),
      }),
    },
  ]
}

/** What a webhook receives: one event, the same shape for Zapier, Make, Sheets and a server of the creator's own. */
export function webhookPayload(signup: PageSignup, id: string): Record<string, unknown> {
  return {
    id,
    event: "onepage.signup",
    created_at: signup.at,
    email: signup.email.trim().toLowerCase(),
    name: signup.name || null,
    first_name: firstName(signup.name),
    form: signup.form,
    lead_magnet: signup.magnet || null,
    detail: signup.detail || null,
    block_id: signup.blockId || null,
    onepage_id: signup.onepageId || null,
    page_url: signup.pageUrl || null,
  }
}

export function webhookTestPayload(id: string, at: string): Record<string, unknown> {
  return { id, event: "onepage.test", created_at: at, email: "test@example.com", name: "Storelib test", first_name: "Storelib", form: "test", lead_magnet: null, detail: null, block_id: null, onepage_id: null, page_url: null }
}

/** sha256=<hex> of the body with the connection's secret, as X-Storelib-Signature. */
export function webhookSignature(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
}

/* ─── What an answer means ────────────────────────────────────────────── */

/**
 * ok          it is there
 * retry       busy or down, worth one more try
 * refused     the key, the list or the address is wrong: say so on the card
 */
export type Outcome = "ok" | "retry" | "refused"

export function outcomeOf(provider: PageIntegration, status: number, body: unknown): Outcome {
  if (status >= 200 && status < 300) return "ok"
  /* An Apps Script web app answers its POST with a 302 to its output: the script has run. */
  if (provider === "sheets" && (status === 302 || status === 303)) return "ok"
  if (status === 429 || status >= 500 || status === 0) return "retry"
  /* Mailchimp says 400 "Member In Compliance State" for an address that unsubscribed or bounced there: nothing to fix, nothing to retry. */
  if (provider === "mailchimp" && status === 400 && /compliance|fake|invalid resource/i.test(JSON.stringify(body ?? ""))) return "ok"
  /* Kit answers 422 for an address it will not take (a role address, a typo): the same. */
  if (provider === "kit" && status === 422 && /email/i.test(JSON.stringify(body ?? ""))) return "ok"
  return "refused"
}

/** The line a card shows for a refusal: the provider's words when they are short, ours when not. */
export function refusalText(provider: PageIntegration, status: number, body: unknown): string {
  const name = PAGE_INTEGRATION_NAME[provider]
  if (status === 401 || status === 403) return isWebhookIntegration(provider) ? `${name} refused the request (${status}). Check the address.` : `${name} did not accept the key. Connect it again.`
  if (status === 404) return isWebhookIntegration(provider) ? `${name} says that address does not exist. Paste it again.` : `${name} could not find the list. Choose it again.`
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const said = [b.detail, b.title, b.message, Array.isArray(b.errors) ? b.errors[0] : null].find((x) => typeof x === "string" && x.length > 0 && x.length < 160) as string | undefined
  return said ? `${name}: ${said}` : `${name} answered ${status}.`
}
