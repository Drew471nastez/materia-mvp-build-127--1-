/**
 * ===========================================================================
 *  WHERE A ONEPAGE SIGNUP CAN GO, BESIDES STORELIB'S OWN LIST
 * ===========================================================================
 * Every signup on a OnePage (the email signup, a lead magnet, the contact
 * form's box) is kept in Emails › Subscribers first. Klaviyo and Omnisend
 * take it from that list on their own sync (lib/integrations/marketing),
 * which a OnePage signup now starts at once (./deliver-server). These take
 * each signup as it happens, from the server, with the creator's own key
 * sealed in the database (lib/physical/secrets) and never sent back:
 *
 *   mailchimp   an audience member, PUT by the address's hash so a second
 *               signup is the same member (Marketing API 3.0). A member who
 *               unsubscribed in Mailchimp stays unsubscribed (status_if_new
 *               only). skip_merge_validation, so an audience with a required
 *               field of its own still takes the signup.
 *   kit         a Kit subscriber (v4, upserted by address), then on the
 *               chosen form and tag.
 *   beehiiv     a subscription on the chosen publication (v2), the
 *               publication's own double opt in setting kept.
 *   mailerlite  a subscriber upserted by address on the chosen group (the
 *               new API, connect.mailerlite.com). No status is sent, so an
 *               unsubscribed person stays so and the account's own double
 *               opt in setting for the API decides.
 *   brevo       a contact created or updated (updateEnabled) on the chosen
 *               list (v3). A blocklisted contact stays blocklisted.
 *   flodesk     a subscriber created or updated by address, on the chosen
 *               segment, with Flodesk's own double opt in when asked (v1).
 *   zapier      a JSON POST to a Zapier catch hook, a Make webhook, a
 *   make        Google Sheets Apps Script web app (the script appends a
 *   sheets      row), or any https address of the creator's: signed with
 *   webhook     HMAC SHA-256 in X-Storelib-Signature.
 *
 * Plain functions: each builds the request it would send, so the tests can
 * read exactly what goes to a provider without a network
 * (tests/onepage-integrations-r41.test.ts). ./deliver-server.ts sends them.
 */

import { createHash, createHmac } from "node:crypto"
import { PAGE_INTEGRATION_NAME, isWebhookIntegration, type KeyIntegration, type PageIntegration, type WebhookIntegration } from "./catalog"

export {
  KEY_INTEGRATIONS,
  PAGE_INTEGRATIONS,
  PAGE_INTEGRATION_DOCS,
  PAGE_INTEGRATION_NAME,
  isKeyIntegration,
  isPageIntegration,
  isWebhookIntegration,
  needsList,
  offersDoubleOptin,
  type KeyIntegration,
  type PageIntegration,
  type WebhookIntegration,
} from "./catalog"

/** What one signup carries. Only what the visitor typed and where they typed it. */
export interface PageSignup {
  email: string
  name?: string | null
  /** "signup" (the email block), "lead_magnet", "subscribe", "contact". */
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

export const MAILERLITE_API = "https://connect.mailerlite.com/api"
export const BREVO_API = "https://api.brevo.com/v3"
export const FLODESK_API = "https://api.flodesk.com/v1"

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
  if (provider === "mailerlite") {
    /* A MailerLite Classic key is 32 hex characters, and only the old API takes it. */
    if (/^[0-9a-f]{32}$/i.test(k)) return "That is a MailerLite Classic key. Make a new one in MailerLite under Integrations, API."
    return /^[A-Za-z0-9._-]{40,2000}$/.test(k) ? null : "Paste a MailerLite API token (Integrations, API)."
  }
  if (provider === "brevo") {
    if (/^xsmtpsib-/.test(k)) return "That is a Brevo SMTP key. Paste an API key, which starts with xkeysib-."
    return /^xkeysib-[A-Za-z0-9-]{20,200}$/.test(k) ? null : "A Brevo API key starts with xkeysib-."
  }
  if (provider === "flodesk") return /^[A-Za-z0-9._-]{20,300}$/.test(k) ? null : "Paste a Flodesk API key (Account settings, Integrations, API keys)."
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

/** Flodesk: the key as the Basic user name, no password. */
function flodeskAuth(key: string): string {
  return `Basic ${Buffer.from(`${key.trim()}:`).toString("base64")}`
}

/** Each key provider's headers: its own way of carrying the key, never in the address. */
export function keyHeaders(provider: KeyIntegration, key: string): Record<string, string> {
  const k = key.trim()
  if (provider === "mailchimp") return { ...JSON_HEADERS, authorization: mailchimpAuth(k) }
  if (provider === "kit") return { ...JSON_HEADERS, "x-kit-api-key": k }
  if (provider === "brevo") return { ...JSON_HEADERS, "api-key": k }
  if (provider === "flodesk") return { ...JSON_HEADERS, authorization: flodeskAuth(k) }
  return { ...JSON_HEADERS, authorization: `Bearer ${k}` }
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

/** The account check and the lists to choose from, per provider: one read that only a working key answers. */
export function accountRequest(provider: KeyIntegration, key: string): ProviderRequest | null {
  const headers = keyHeaders(provider, key)
  if (provider === "mailchimp") {
    const base = mailchimpBase(key)
    return base ? { method: "GET", url: `${base}/lists?count=100&fields=lists.id,lists.name`, headers } : null
  }
  if (provider === "kit") return { method: "GET", url: "https://api.kit.com/v4/forms?status=active&per_page=100", headers }
  if (provider === "beehiiv") return { method: "GET", url: "https://api.beehiiv.com/v2/publications?limit=100", headers }
  if (provider === "mailerlite") return { method: "GET", url: `${MAILERLITE_API}/groups?limit=100&sort=name`, headers }
  if (provider === "brevo") return { method: "GET", url: `${BREVO_API}/contacts/lists?limit=50&offset=0&sort=desc`, headers }
  return { method: "GET", url: `${FLODESK_API}/segments?per_page=100`, headers }
}

export function kitTagsRequest(key: string): ProviderRequest {
  return { method: "GET", url: "https://api.kit.com/v4/tags?per_page=100", headers: keyHeaders("kit", key) }
}

export type ProviderList = { id: string; name: string }

function namedRows(raw: unknown): ProviderList[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => x as { id?: unknown; name?: unknown; title?: unknown })
    .map((x) => ({ id: x.id, name: typeof x.name === "string" ? x.name : x.title }))
    .filter((x) => (typeof x.id === "string" || typeof x.id === "number") && typeof x.name === "string")
    .map((x) => ({ id: String(x.id), name: String(x.name).slice(0, 120) }))
    .slice(0, 100)
}

/** The lists, forms, publications, groups or segments in a provider's answer. */
export function listsFrom(provider: KeyIntegration, body: unknown): ProviderList[] {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  if (provider === "mailchimp") return namedRows(b.lists)
  if (provider === "kit") return namedRows(b.forms)
  if (provider === "brevo") return namedRows(b.lists)
  /* beehiiv, MailerLite and Flodesk all answer { data: [...] }. */
  return namedRows(b.data)
}

export function kitTagsFrom(body: unknown): ProviderList[] {
  return namedRows((body as { tags?: unknown } | null)?.tags)
}

export interface ConnectionConfig {
  /** Mailchimp audience, Kit form, beehiiv publication, MailerLite group, Brevo list, Flodesk segment. */
  list_id?: string | null
  list_name?: string | null
  /** Kit: a tag as well, or instead of a form. */
  tag_id?: string | null
  tag_name?: string | null
  /** Mailchimp and Flodesk: send the provider's own confirmation email first. */
  double_optin?: boolean
  /** Mailchimp: a tag on every member that came from the page. */
  tag?: string | null
  /** Webhooks: the address. Kept sealed with the secret, never in config. */
}

/** The shape a list id must have for each provider before it is put in a path or a body. */
export const LIST_ID: Record<KeyIntegration, RegExp> = {
  mailchimp: /^[A-Za-z0-9]{1,40}$/,
  kit: /^\d{1,20}$/,
  beehiiv: /^pub_[A-Za-z0-9-]{8,60}$/,
  mailerlite: /^\d{1,24}$/,
  brevo: /^\d{1,10}$/,
  flodesk: /^[A-Za-z0-9_-]{4,64}$/,
}

/** The requests that put one signup into one provider, in order. None when the connection cannot take it (no list where one is needed). */
export function signupRequests(provider: KeyIntegration, key: string, config: ConnectionConfig, signup: PageSignup): ProviderRequest[] {
  const email = signup.email.trim().toLowerCase()
  const first = firstName(signup.name)
  const headers = keyHeaders(provider, key)
  const listId = config.list_id && LIST_ID[provider].test(config.list_id) ? config.list_id : null
  if (provider === "mailchimp") {
    const base = mailchimpBase(key)
    if (!base || !listId) return []
    const member = `${base}/lists/${listId}/members/${emailHashMd5(email)}`
    const out: ProviderRequest[] = [
      {
        method: "PUT",
        url: `${member}?skip_merge_validation=true`,
        headers,
        body: JSON.stringify({ email_address: email, status_if_new: config.double_optin ? "pending" : "subscribed", ...(first ? { merge_fields: { FNAME: first } } : {}) }),
      },
    ]
    const tag = (config.tag || "").trim()
    if (tag) out.push({ method: "POST", url: `${member}/tags`, headers, body: JSON.stringify({ tags: [{ name: tag.slice(0, 100), status: "active" }] }) })
    return out
  }
  if (provider === "kit") {
    const out: ProviderRequest[] = [{ method: "POST", url: "https://api.kit.com/v4/subscribers", headers, body: JSON.stringify({ email_address: email, ...(first ? { first_name: first } : {}), state: "active" }) }]
    if (listId) out.push({ method: "POST", url: `https://api.kit.com/v4/forms/${listId}/subscribers`, headers, body: JSON.stringify({ email_address: email, ...(signup.pageUrl ? { referrer: signup.pageUrl } : {}) }) })
    if (config.tag_id && /^\d{1,20}$/.test(config.tag_id)) out.push({ method: "POST", url: `https://api.kit.com/v4/tags/${config.tag_id}/subscribers`, headers, body: JSON.stringify({ email_address: email }) })
    return out
  }
  if (provider === "beehiiv") {
    if (!listId) return []
    return [
      {
        method: "POST",
        url: `https://api.beehiiv.com/v2/publications/${listId}/subscriptions`,
        headers,
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
  if (provider === "mailerlite") {
    return [
      {
        method: "POST",
        url: `${MAILERLITE_API}/subscribers`,
        headers,
        body: JSON.stringify({ email, ...(first ? { fields: { name: first } } : {}), ...(listId ? { groups: [listId] } : {}) }),
      },
    ]
  }
  if (provider === "brevo") {
    if (!listId) return []
    return [
      {
        method: "POST",
        url: `${BREVO_API}/contacts`,
        headers,
        body: JSON.stringify({ email, ...(first ? { attributes: { FIRSTNAME: first } } : {}), listIds: [Number(listId)], updateEnabled: true }),
      },
    ]
  }
  /* Flodesk */
  const out: ProviderRequest[] = [
    {
      method: "POST",
      url: `${FLODESK_API}/subscribers`,
      headers,
      body: JSON.stringify({ email, ...(first ? { first_name: first } : {}), ...(listId ? { segment_ids: [listId] } : {}), double_optin: config.double_optin === true }),
    },
  ]
  /* An address already in Flodesk: put on the segment too (the same call twice changes nothing). */
  if (listId) out.push({ method: "POST", url: `${FLODESK_API}/subscribers/${encodeURIComponent(email)}/segments`, headers, body: JSON.stringify({ segment_ids: [listId] }) })
  return out
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

/**
 * The same signup is the same delivery: an address that signs up on the
 * same block again is not a second Zapier run or a second Sheets row.
 * A hash, so the record of what was sent holds no address.
 */
export function deliveryKey(signup: PageSignup): string {
  return createHash("sha256").update([signup.email.trim().toLowerCase(), signup.form, signup.magnet ?? "", signup.blockId ?? "", signup.onepageId ?? ""].join("|")).digest("hex")
}

/* ─── What an answer means ────────────────────────────────────────────── */

/**
 * ok          it is there
 * retry       busy or down, worth one more try
 * refused     the key, the list or the address is wrong: say so on the card
 */
export type Outcome = "ok" | "retry" | "refused"

const said = (body: unknown) => (typeof body === "string" ? body : JSON.stringify(body ?? ""))

export function outcomeOf(provider: PageIntegration, status: number, body: unknown): Outcome {
  if (status >= 200 && status < 300) return "ok"
  /* An Apps Script web app answers its POST with a 302 to its output: the script has run. */
  if (provider === "sheets" && (status === 302 || status === 303)) return "ok"
  if (status === 429 || status >= 500 || status === 0) return "retry"
  const text = said(body)
  /*
    THE ADDRESS, NOT THE CONNECTION. Each provider has its own word for an
    address it will never take (one that unsubscribed or bounced there, a
    role address, a typo that got past the form): nothing to fix on the
    card and nothing to retry, so it counts as handled.
  */
  if (provider === "mailchimp" && status === 400) {
    if (/compliance state|forgotten email|looks fake|valid email|has signed up to a lot of lists/i.test(text)) return "ok"
    return "refused"
  }
  if (provider === "kit" && status === 422 && /email/i.test(text)) return "ok"
  if (provider === "beehiiv" && (status === 400 || status === 422) && /email/i.test(text) && !/publication/i.test(text)) return "ok"
  if (provider === "mailerlite" && status === 422 && /"email"\s*:\s*\[/.test(text)) return "ok"
  if (provider === "brevo" && status === 400 && /invalid email|email is not valid|blocklist|blacklist/i.test(text)) return "ok"
  if (provider === "flodesk" && (status === 400 || status === 422) && /email/i.test(text) && !/segment/i.test(text)) return "ok"
  return "refused"
}

/** The line a card shows for a refusal: the provider's words when they are short, ours when not. */
export function refusalText(provider: PageIntegration, status: number, body: unknown): string {
  const name = PAGE_INTEGRATION_NAME[provider]
  if (status === 401 || status === 403) return isWebhookIntegration(provider) ? `${name} refused the request (${status}). Check the address.` : `${name} did not accept the key. Connect it again.`
  if (status === 404) return isWebhookIntegration(provider) ? `${name} says that address does not exist. Paste it again.` : `${name} could not find the list. Choose it again.`
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const first = Array.isArray(b.errors) ? b.errors[0] : null
  const said = [b.detail, b.title, b.message, typeof first === "string" ? first : (first as { message?: unknown } | null)?.message].find((x) => typeof x === "string" && x.length > 0 && x.length < 160) as string | undefined
  return said ? `${name}: ${said}` : `${name} answered ${status}.`
}
