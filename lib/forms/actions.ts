/**
 * ===========================================================================
 *  WHAT A BUTTON DOES: ONE MODEL FOR EVERY ONEPAGE DESTINATION
 * ===========================================================================
 * A link, a card, a form's last step and any block with a destination keep
 * an `action` here, and the page asks this file for the address it opens.
 * The creator never writes a wa.me or mailto address by hand: they give a
 * phone number, a username or an email, and the address is built, encoded
 * and checked here.
 *
 * MESSAGES ARE TEMPLATES. A WhatsApp, Telegram, SMS or email message may
 * carry {name} (the visitor's; {visitor_name} is the same), {service},
 * {product_name}, {date}, {time} and {answer:field_id} (TEMPLATE_VARIABLES
 * says where each comes from). They are filled when the button is used
 * (fillTemplate): from the action (the service it books), the block (a
 * product's name, its words as the service), a pre-chat form's answers and
 * a booking form's chosen time. A variable with no value, or one this file does not know,
 * is removed, never left in the text. Every value is stripped of control
 * characters and capped before it is encoded.
 *
 * NOTHING BUT THE EXPECTED SCHEME LEAVES THIS FILE. A web address is http or
 * https with no credentials; WhatsApp is https://wa.me or chat.whatsapp.com;
 * Telegram is https://t.me; the rest are mailto:, tel: and sms:. A
 * javascript: or data: address can never come out, whatever was saved.
 *
 * OLD LINKS KEEP WORKING. A link saved before actions existed is a plain URL;
 * actionFromUrl reads a wa.me, t.me, mailto, tel or sms address back into
 * this model, so the editor shows it as what it is.
 *
 * Kept free of React and the DOM so the builders are unit tested
 * (tests/native-actions.test.ts). The push test runner compiles with strict
 * off, so nothing here relies on a discriminated union narrowing.
 */
import { platformOrigin } from "@/lib/onepage/return-address"

/** A form shown before a chat opens; its answers fill the message's variables. */
export interface PreChat {
  form_id: string
}

export type NativeAction =
  | { type: "url"; url: string; label?: string }
  | {
      type: "whatsapp"
      phone: string
      message?: string
      /** What {service} says in the message, typed by the creator. A visitor's own answer wins. */
      service?: string
      country?: string
      pre_chat?: PreChat
      label?: string
    }
  | { type: "whatsapp_group"; url: string; label?: string }
  | {
      type: "telegram"
      target: string
      message?: string
      service?: string
      pre_chat?: PreChat
      label?: string
    }
  | {
      type: "email"
      email: string
      subject?: string
      message?: string
      service?: string
      label?: string
    }
  | { type: "phone"; phone: string; country?: string; label?: string }
  | {
      type: "sms"
      phone: string
      message?: string
      service?: string
      country?: string
      label?: string
    }
  | {
      type: "product"
      product_id: string
      slug?: string
      title?: string
      image?: string
      open?: "sheet" | "checkout"
      label?: string
    }
  | { type: "form"; form_id: string; label?: string }
  | { type: "booking"; form_id?: string; url?: string; label?: string }
  /** An external booking address. Kept as saved by earlier pages; the editor writes `booking`. */
  | { type: "appointment"; url: string; label?: string }
  /** A page on this site: a path ("/shop") or a place on this page ("#faq"). */
  | { type: "internal"; path: string; label?: string }

export type ActionType = NativeAction["type"]

/** What a template can be filled with when the button is used. */
export interface ActionVars {
  product_name?: string | null
  visitor_name?: string | null
  service?: string | null
  /** The day and the time the visitor chose: a booking form's slot, or a date or time question, as words ("Fri 14 Nov", "3:30 PM"). */
  date?: string | null
  time?: string | null
  /** A pre-chat form's answers, by field id. */
  answers?: Record<string, string | string[] | null | undefined> | null
}

export const UUID =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

const MESSAGE_MAX = 4000
const VALUE_MAX = 500

/* ── phone numbers ─────────────────────────────────────────────────────── */

/**
 * An international number as its E.164 digits, without the plus: a country
 * code that does not start with 0 and 8 to 15 digits in all. "+40 (712)
 * 345-678" and "0040 712 345 678" are both "40712345678". A number written
 * without its country code is refused rather than guessed.
 */
export function internationalPhone(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!/^[+\d\s().\-/]+$/.test(trimmed)) return null
  const digits = trimmed
    .replace(/^00/, "+")
    .replace(/[\s()+.\-/]/g, "")
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

/** The number as kept: "+40712345678" (E.164), or what was typed when it is not a full number yet. */
export function e164(value: unknown): string {
  const digits = internationalPhone(value)
  return digits ? `+${digits}` : typeof value === "string" ? value.trim().slice(0, 40) : ""
}

/* ── addresses ─────────────────────────────────────────────────────────── */

/** An http(s) address with no credentials, or a path on this site. Anything else, javascript: and data: included, is null. */
export function webUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\u0000-\u001f\u007f\\]/.test(value)
  )
    return null
  if (value.startsWith("/") && !value.startsWith("//")) return value
  try {
    const url = new URL(value)
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

/** A path on this site or a place on this page: "/shop", "/p/print?x=1", "#faq". */
export function internalPath(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  if (/^#[\w-]{1,80}$/.test(v)) return v
  if (!v.startsWith("/") || v.startsWith("//") || v.length > 512) return null
  if (/[\u0000-\u001f\u007f\\\s<>"']/.test(v)) return null
  return v
}

export function formPath(id: string): string {
  return `/request/forms/${encodeURIComponent(id)}`
}

/** A WhatsApp group invite (chat.whatsapp.com/<code>) or a channel (whatsapp.com/channel/<id>), as its one https address. */
export function whatsappGroupUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  let raw = value.trim()
  if (!raw) return null
  if (!/^[a-z]+:\/\//i.test(raw)) raw = "https://" + raw
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  const path = url.pathname.replace(/\/+$/, "")
  if (host === "chat.whatsapp.com") {
    const m = path.match(/^\/(?:invite\/)?([A-Za-z0-9]{10,40})$/)
    return m ? `https://chat.whatsapp.com/${m[1]}` : null
  }
  if (host === "whatsapp.com" || host === "www.whatsapp.com") {
    const m = path.match(/^\/channel\/([A-Za-z0-9]{10,40})$/)
    return m ? `https://whatsapp.com/channel/${m[1]}` : null
  }
  return null
}

export type TelegramTarget =
  | { kind: "username"; path: string }
  | { kind: "invite"; path: string }
  | { kind: "phone"; path: string }
  | { kind: "post"; path: string }

const TG_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/
const TG_HOSTS = new Set(["t.me", "telegram.me", "telegram.dog", "www.t.me", "www.telegram.me"])

/**
 * A Telegram user, bot, group or channel, however it was written: @name,
 * name, t.me/name, telegram.me/name, tg://resolve?domain=name, an invite
 * (t.me/+code, t.me/joinchat/code), a phone (t.me/+447911123456) or a post
 * (t.me/name/42, t.me/c/1234/42). Null for anything else.
 */
export function telegramTarget(value: unknown): TelegramTarget | null {
  if (typeof value !== "string") return null
  const raw = value.trim()
  if (!raw || raw.length > 300) return null
  const bare = raw.replace(/^@/, "")
  if (TG_USERNAME.test(bare)) return { kind: "username", path: bare }
  if (/^tg:/i.test(raw)) {
    const m = raw.match(/^tg:\/\/resolve\?domain=([A-Za-z][A-Za-z0-9_]{3,31})(?:&|$)/i)
    return m ? { kind: "username", path: m[1] } : null
  }
  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : "https://" + raw)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password || url.port) return null
  if (!TG_HOSTS.has(url.hostname.toLowerCase())) return null
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, "")
  let m = path.match(/^\/\+(\d{7,15})$/)
  if (m) return { kind: "phone", path: `+${m[1]}` }
  m = path.match(/^\/(?:\+|joinchat\/)([A-Za-z0-9_-]{10,64})$/)
  if (m) return { kind: "invite", path: `+${m[1]}` }
  m = path.match(/^\/c\/(\d{4,20})\/(\d{1,12})$/)
  if (m) return { kind: "post", path: `c/${m[1]}/${m[2]}` }
  m = path.match(/^\/(?:s\/)?([A-Za-z][A-Za-z0-9_]{3,31})(?:\/(\d{1,12}))?$/)
  if (m) return m[2] ? { kind: "post", path: `${m[1]}/${m[2]}` } : { kind: "username", path: m[1] }
  return null
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/

export function validEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  return v.length <= 254 && EMAIL.test(v) ? v : null
}

/* ── templates ─────────────────────────────────────────────────────────── */

/**
 * The variables a message can use, for the editor's chips, each with what
 * it puts in the message. A variable with nothing to put in is left out of
 * the message, never sent as braces.
 */
export const TEMPLATE_VARIABLES = [
  { token: "{name}", label: "Name", means: "The visitor's name, when your questions ask for it" },
  { token: "{service}", label: "Service", means: "The service you type below, else what the visitor picks in your questions, else this button's words" },
  { token: "{product_name}", label: "Product", means: "The product this button is for" },
  { token: "{date}", label: "Date", means: "The day the visitor picks: a booking form's time, or a date question" },
  { token: "{time}", label: "Time", means: "The time the visitor picks in a booking form, or a time question" },
] as const

/** The variables a message or subject uses, each once, in the order of TEMPLATE_VARIABLES ({visitor_name} reads as {name}). */
export function templateVariablesIn(...texts: unknown[]): string[] {
  const used = new Set<string>()
  for (const t of texts) {
    if (typeof t !== "string") continue
    for (const m of t.matchAll(/\{\s*([a-z_]{1,32})\s*\}/gi)) {
      const n = m[1].toLowerCase()
      used.add(n === "visitor_name" ? "name" : n)
    }
  }
  return TEMPLATE_VARIABLES.map((v) => v.token).filter((t) => used.has(t.slice(1, -1)))
}

/** Starting messages the editor offers. Plain, short, and each one reads well with its variables removed. */
export const MESSAGE_TEMPLATES = [
  { id: "hello", label: "Say hello", text: "Hi, I found you on your page and have a question." },
  { id: "product", label: "Ask about a product", text: "Hi, I'm interested in {product_name}. Is it available?" },
  { id: "booking", label: "Book a service", text: "Hi, I'd like to book {service}. When are you free?" },
  { id: "intro", label: "Introduce the visitor", text: "Hi, my name is {visitor_name}. I'd like to know more about {service}." },
] as const

/** A value a visitor or a page supplied, safe to put in a message: no control characters but line breaks, one line ending, capped. */
export function cleanValue(value: unknown): string {
  const v = Array.isArray(value) ? value.map((x) => String(x ?? "")).join(", ") : value == null ? "" : String(value)
  return v
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .trim()
    .slice(0, VALUE_MAX)
}

const VARIABLE = /\{\s*([a-z_]{1,32})(?:\s*:\s*([\w-]{1,64}))?\s*\}/gi

/**
 * The message with its variables filled. Unknown variables and variables
 * with no value are removed, and the spaces they leave are tidied so a
 * sentence still reads ("Hi {visitor_name}, ..." becomes "Hi, ...").
 */
export function fillTemplate(template: unknown, vars: ActionVars = {}): string {
  if (typeof template !== "string" || !template) return ""
  /* A marker where a variable came out empty, so only the gap it left is tidied, never the creator's own spacing. */
  const GAP = "\u0000"
  const value = (v: string) => v || GAP
  const filled = template
    .slice(0, MESSAGE_MAX)
    .replace(/\u0000/g, "")
    .replace(VARIABLE, (_, name: string, key?: string) => {
      const n = name.toLowerCase()
      if (n === "answer") return value(key ? cleanValue(vars.answers?.[key]) : "")
      if (key) return GAP
      if (n === "product_name" || n === "product") return value(cleanValue(vars.product_name))
      if (n === "visitor_name" || n === "name") return value(cleanValue(vars.visitor_name))
      if (n === "service") return value(cleanValue(vars.service))
      if (n === "date") return value(cleanValue(vars.date))
      if (n === "time") return value(cleanValue(vars.time))
      return GAP
    })
  if (!filled.includes(GAP)) return filled.trim().slice(0, MESSAGE_MAX)
  return filled
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line.includes(GAP)
        ? line
            .replace(/[ \t]*\u0000[ \t]*/g, (m) => (/^[ \t]/.test(m) && /[ \t]$/.test(m) ? " " : m.replace(/\u0000/, "")))
            .replace(/\u0000/g, "")
            .replace(/ +([,.!?;:])/g, "$1")
            .replace(/([,;:])(?=[,.!?;:])/g, "")
            .trim()
        : line,
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MESSAGE_MAX)
}

/**
 * The variables a pre-chat form's answers give: every answer by its field
 * id, the visitor's name from the first name field, and {service} or
 * {product_name} from a field with that id.
 */
export function formVars(
  fields: readonly { id: string; type?: string; options?: readonly { id: string; label?: string }[] }[] | null | undefined,
  answers: Record<string, unknown> | null | undefined,
): ActionVars {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(answers || {})) {
    if (!/^[\w-]{1,64}$/.test(k)) continue
    /* A choice is kept as its option's id ("b1"); the message reads its words ("Under 200"). */
    const options = (fields || []).find((f) => f.id === k)?.options
    const word = (x: unknown) => {
      const o = options?.find((opt) => opt.id === x)
      return o && o.label ? o.label : x
    }
    out[k] = cleanValue(options?.length ? (Array.isArray(v) ? v.map(word) : word(v)) : v)
  }
  const nameField = (fields || []).find((f) => f.type === "name")
  const dateField = (fields || []).find((f) => f.type === "date")
  const day = out.date || (dateField && out[dateField.id]) || null
  return {
    answers: out,
    visitor_name: (nameField && out[nameField.id]) || out.name || out.visitor_name || null,
    service: out.service || null,
    product_name: out.product_name || out.product || null,
    date: day ? dayWords(day) : null,
    time: out.time || null,
  }
}

/** A date answer ("2026-11-14") as a person writes it ("Sat, 14 Nov 2026"); anything else as it was given. */
export function dayWords(value: string, locale = "en-GB"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return value
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(d.getTime())) return value
  try {
    return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
  } catch {
    return value
  }
}

/**
 * A booked slot's day and time as {date} and {time}, in the booking's own
 * time zone (the one its times were offered in), so the message says the
 * time the visitor clicked.
 */
export function slotVars(startsAt: string | null | undefined, timeZone: string | null | undefined, locale = "en-GB"): Pick<ActionVars, "date" | "time"> {
  const at = startsAt ? new Date(startsAt) : null
  if (!at || Number.isNaN(at.getTime())) return {}
  const tz = timeZone || "UTC"
  try {
    return {
      date: at.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: tz }),
      time: at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: tz }),
    }
  } catch {
    return {}
  }
}

/** The variables an action carries itself (the service the creator typed), under what the page and the visitor give. */
function withOwnVars(a: Record<string, any>, vars: ActionVars): ActionVars {
  const own = typeof a.service === "string" ? cleanValue(a.service) : ""
  return own && !cleanValue(vars.service) ? { ...vars, service: own } : vars
}

/** Percent encoding for a query value: spaces as %20 (a mail app shows a "+" as a plus), line breaks as %0A, and every character outside ASCII as UTF-8. */
function q(value: string): string {
  return encodeURIComponent(value)
}

/* ── building the address ──────────────────────────────────────────────── */

/**
 * The address the button opens, filled with `vars`, or null when the action
 * is not complete enough to work. A form, a product shown in its sheet and
 * a chat with a pre-chat form are also handled on the page
 * (components/forms/native-form-block NativeActionFrame); this address is
 * what a visitor without JavaScript, or a crawler, follows.
 */
export function actionHref(
  action: NativeAction | null | undefined,
  vars: ActionVars = {},
): string | null {
  if (!action || typeof action !== "object") return null
  const a = action as Record<string, any>
  vars = withOwnVars(a, vars)
  switch (action.type) {
    case "url":
    case "appointment":
      return webUrl(a.url)
    case "internal":
      return internalPath(a.path)
    case "whatsapp": {
      const phone = internationalPhone(a.phone)
      if (!phone) return null
      const text = fillTemplate(a.message, vars)
      return `https://wa.me/${phone}${text ? "?text=" + q(text) : ""}`
    }
    case "whatsapp_group":
      return whatsappGroupUrl(a.url)
    case "telegram": {
      const t = telegramTarget(a.target)
      if (!t) return null
      const text = t.kind === "username" ? fillTemplate(a.message, vars) : ""
      return `https://t.me/${t.path}${text ? "?text=" + q(text) : ""}`
    }
    case "phone": {
      const phone = internationalPhone(a.phone)
      return phone ? `tel:+${phone}` : null
    }
    case "sms": {
      const phone = internationalPhone(a.phone)
      if (!phone) return null
      const text = fillTemplate(a.message, vars)
      return `sms:+${phone}${text ? "?body=" + q(text) : ""}`
    }
    case "email": {
      const email = validEmail(a.email)
      if (!email) return null
      const subject = fillTemplate(a.subject, vars).replace(/\s*\n\s*/g, " ").slice(0, 300)
      const body = fillTemplate(a.message, vars)
      const query = [subject ? "subject=" + q(subject) : "", body ? "body=" + q(body) : ""].filter(Boolean).join("&")
      return `mailto:${q(email).replace(/%40/g, "@")}${query ? "?" + query : ""}`
    }
    case "product":
      return UUID.test(a.product_id || "")
        ? `${platformOrigin()}/checkout?productId=${encodeURIComponent(a.product_id)}`
        : null
    case "form":
      return UUID.test(a.form_id || "")
        ? `${platformOrigin()}${formPath(a.form_id)}`
        : null
    case "booking":
      if (UUID.test(a.form_id || "")) return `${platformOrigin()}${formPath(a.form_id)}`
      return webUrl(a.url)
    default:
      return null
  }
}

/** The form a visitor fills on the page before this action goes on: a form or booking form, or a chat's pre-chat form. */
export function actionFormId(action: NativeAction | null | undefined): string | null {
  if (!action) return null
  const a = action as Record<string, any>
  if (action.type === "form" || action.type === "booking") return UUID.test(a.form_id || "") ? a.form_id : null
  if (action.type === "whatsapp" || action.type === "telegram") {
    const id = a.pre_chat?.form_id
    return typeof id === "string" && UUID.test(id) ? id : null
  }
  return null
}

/** Whether the address leaves for another site in a new tab. A call, a text, an email and a page on this site stay in place. */
export function actionOpensNewTab(action: NativeAction | null | undefined): boolean {
  const t = action?.type
  return !(t === "phone" || t === "sms" || t === "email" || t === "internal")
}

/* ── reading what was saved ────────────────────────────────────────────── */

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const keepText = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").slice(0, MESSAGE_MAX) : "")

function preChat(v: unknown): PreChat | undefined {
  const id = v && typeof v === "object" ? (v as { form_id?: unknown }).form_id : null
  return typeof id === "string" && UUID.test(id.trim()) ? { form_id: id.trim() } : undefined
}

function country(v: unknown): string | undefined {
  return typeof v === "string" && /^[A-Z]{2}$/.test(v) ? v : undefined
}

/**
 * A saved action, as a clean copy with only the fields this file knows, or
 * null when it would not work. Unknown fields are dropped so nothing a
 * client sent is published by accident.
 */
export function normaliseAction(raw: unknown): NativeAction | null {
  if (!raw || typeof raw !== "object") return null
  const a = raw as Record<string, unknown>
  const label = s(a.label, 80) || undefined
  const withLabel = <T extends object>(o: T): T => (label ? { ...o, label } : o)
  let out: NativeAction
  switch (a.type) {
    case "url":
    case "appointment":
      out = withLabel({ type: a.type, url: s(a.url, 2048) })
      break
    case "internal":
      out = withLabel({ type: "internal" as const, path: s(a.path, 512) })
      break
    case "whatsapp":
      out = withLabel({
        type: "whatsapp" as const,
        phone: e164(s(a.phone, 40)),
        message: keepText(a.message),
        ...(s(a.service, 120) ? { service: s(a.service, 120) } : {}),
        ...(country(a.country) ? { country: country(a.country) } : {}),
        ...(preChat(a.pre_chat) ? { pre_chat: preChat(a.pre_chat) } : {}),
      })
      break
    case "whatsapp_group":
      out = withLabel({ type: "whatsapp_group" as const, url: whatsappGroupUrl(a.url) || s(a.url, 300) })
      break
    case "telegram":
      out = withLabel({
        type: "telegram" as const,
        target: s(a.target, 300),
        message: keepText(a.message),
        ...(s(a.service, 120) ? { service: s(a.service, 120) } : {}),
        ...(preChat(a.pre_chat) ? { pre_chat: preChat(a.pre_chat) } : {}),
      })
      break
    case "phone":
      out = withLabel({ type: "phone" as const, phone: e164(s(a.phone, 40)), ...(country(a.country) ? { country: country(a.country) } : {}) })
      break
    case "sms":
      out = withLabel({
        type: "sms" as const,
        phone: e164(s(a.phone, 40)),
        message: keepText(a.message),
        ...(s(a.service, 120) ? { service: s(a.service, 120) } : {}),
        ...(country(a.country) ? { country: country(a.country) } : {}),
      })
      break
    case "email":
      out = withLabel({
        type: "email" as const,
        email: s(a.email, 254),
        subject: s(a.subject, 300).replace(/[\r\n]+/g, " "),
        message: keepText(a.message),
        ...(s(a.service, 120) ? { service: s(a.service, 120) } : {}),
      })
      break
    case "product": {
      const image = webUrl(s(a.image, 2048))
      out = withLabel({
        type: "product" as const,
        product_id: s(a.product_id, 36),
        slug: s(a.slug, 200),
        ...(s(a.title, 200) ? { title: s(a.title, 200) } : {}),
        ...(image && /^https:/.test(image) ? { image } : {}),
        open: a.open === "checkout" ? ("checkout" as const) : ("sheet" as const),
      })
      break
    }
    case "form":
      out = withLabel({ type: "form" as const, form_id: s(a.form_id, 36) })
      break
    case "booking": {
      const formId = s(a.form_id, 36)
      out = withLabel(UUID.test(formId) ? { type: "booking" as const, form_id: formId } : { type: "booking" as const, url: s(a.url, 2048) })
      break
    }
    default:
      return null
  }
  return actionHref(out) ? out : null
}

/**
 * A plain address saved before actions existed, read as the action it is:
 * wa.me and api.whatsapp.com as WhatsApp (number and message), a group
 * invite, t.me as Telegram, mailto, tel and sms, and any other web address
 * as a web address. Null for something that is not an address.
 */
export function actionFromUrl(value: unknown): NativeAction | null {
  if (typeof value !== "string") return null
  const raw = value.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  const params = (query: string) => {
    try {
      return new URLSearchParams(query)
    } catch {
      return new URLSearchParams()
    }
  }
  if (lower.startsWith("mailto:")) {
    const [addr, query = ""] = raw.slice(7).split("?")
    const p = params(query)
    let email = addr
    try {
      email = decodeURIComponent(addr)
    } catch {
      /* kept as written */
    }
    return normaliseAction({ type: "email", email, subject: p.get("subject") || "", message: p.get("body") || "" })
  }
  if (lower.startsWith("tel:")) return normaliseAction({ type: "phone", phone: raw.slice(4) })
  if (lower.startsWith("sms:")) {
    const [num, query = ""] = raw.slice(4).split("?")
    return normaliseAction({ type: "sms", phone: num, message: params(query).get("body") || "" })
  }
  if (lower.startsWith("whatsapp://send")) {
    const p = params(raw.split("?")[1] || "")
    return normaliseAction({ type: "whatsapp", phone: "+" + (p.get("phone") || "").replace(/\D/g, ""), message: p.get("text") || "" })
  }
  if (lower.startsWith("tg://")) return normaliseAction({ type: "telegram", target: raw })
  let url: URL | null = null
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(raw) ? "https://" + raw : raw)
  } catch {
    url = null
  }
  if (url && (url.protocol === "https:" || url.protocol === "http:")) {
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    if (host === "wa.me") {
      const digits = url.pathname.replace(/\D/g, "")
      return normaliseAction({ type: "whatsapp", phone: "+" + digits, message: url.searchParams.get("text") || "" }) ?? normaliseAction({ type: "url", url: url.href })
    }
    if (host === "api.whatsapp.com" || (host === "whatsapp.com" && url.pathname.startsWith("/send"))) {
      const digits = (url.searchParams.get("phone") || "").replace(/\D/g, "")
      return normaliseAction({ type: "whatsapp", phone: "+" + digits, message: url.searchParams.get("text") || "" }) ?? normaliseAction({ type: "url", url: url.href })
    }
    if (whatsappGroupUrl(url.href)) return normaliseAction({ type: "whatsapp_group", url: url.href })
    if (TG_HOSTS.has(url.hostname.toLowerCase()) && telegramTarget(url.href)) {
      return normaliseAction({ type: "telegram", target: url.href, message: url.searchParams.get("text") || "" })
    }
  }
  return normaliseAction({ type: "url", url: raw })
}

/** What a block's destination is: its saved action, or the plain address it was saved with, read as one. */
export function readAction(data: { action?: unknown; url?: unknown } | null | undefined): NativeAction | null {
  if (!data) return null
  return normaliseAction(data.action) ?? (typeof data.url === "string" && data.url ? actionFromUrl(data.url) : null)
}

/** The button's words when the creator gave none. */
export function actionLabel(action: NativeAction | undefined | null) {
  const own = typeof (action as { label?: unknown } | null)?.label === "string" ? ((action as { label?: string }).label || "").trim() : ""
  if (own) return own
  switch (action?.type) {
    case "whatsapp":
      return "Continue on WhatsApp"
    case "whatsapp_group":
      return "Join the WhatsApp group"
    case "telegram":
      return "Message on Telegram"
    case "email":
      return "Send an email"
    case "phone":
      return "Call"
    case "sms":
      return "Send a text"
    case "appointment":
    case "booking":
      return "Book an appointment"
    case "product":
      return "View product"
    case "form":
      return "Open form"
    default:
      return "Continue"
  }
}
