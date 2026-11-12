import "server-only"

/**
 * What the builder may save, checked on the server. The builder is a page a
 * signed-in creator controls, which is a page anybody with an account
 * controls, so every field is read as untrusted: the steps are rebuilt from
 * known shapes, the email bodies are sanitised to markup an email may carry,
 * and anything else is dropped.
 */

import sanitizeHtml from "sanitize-html"
import { createClient } from "@/lib/supabase/server"
import {
  MAX_BODY,
  MAX_STEPS,
  MAX_SUBJECT,
  entryRule,
  isPurchaseTrigger,
  isTriggerType,
  normalizeSteps,
  serializeSteps,
  type FlowStep,
  type TriggerConfig,
  type TriggerType,
} from "./flow-model"

const STYLE_VALUE = /^[#(),.%\s\w-]{1,120}$/

const EMAIL_BODY: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "hr", "div", "span", "blockquote", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3", "ul", "ol", "li", "a", "img"],
  allowedAttributes: {
    a: ["href", "title", "target", "rel", "style"],
    img: ["src", "alt", "width", "height", "style"],
    p: ["style"],
    div: ["style"],
    span: ["style"],
    h1: ["style"],
    h2: ["style"],
    h3: ["style"],
  },
  /**
   * Email clients read inline styles and nothing else, so a button needs
   * them. Only properties that lay text out, each value plain characters: no
   * url(), no expression(), no quotes.
   */
  allowedStyles: {
    "*": Object.fromEntries(
      ["color", "background-color", "text-align", "font-size", "font-weight", "font-style", "text-decoration", "padding", "margin", "border", "border-radius", "display", "width", "max-width", "height", "line-height"].map((p) => [p, [STYLE_VALUE]]),
    ),
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, ...(attribs.target === "_blank" ? { rel: "noopener noreferrer" } : {}) } }),
  },
  nonTextTags: ["script", "style", "textarea", "noscript", "option", "title"],
}

export function cleanBody(html: unknown): string {
  if (typeof html !== "string") return ""
  return sanitizeHtml(html.slice(0, MAX_BODY), EMAIL_BODY)
}

function cleanLine(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").slice(0, max) : ""
}

/** The steps as they will be stored: known shapes only, bodies sanitised, at most MAX_STEPS. */
export function cleanSteps(raw: unknown): FlowStep[] {
  return serializeSteps(
    normalizeSteps(Array.isArray(raw) ? raw.slice(0, MAX_STEPS) : []).map((s) =>
      s.type === "email"
        ? { ...s, config: { subject: cleanLine(s.config.subject, MAX_SUBJECT), body: cleanBody(s.config.body), ...(s.config.preview_text ? { preview_text: cleanLine(s.config.preview_text, 200) } : {}) } }
        : s,
    ),
  )
}

export function cleanTriggerConfig(trigger: TriggerType, raw: unknown, existing?: TriggerConfig | null): TriggerConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const out: TriggerConfig = {}
  if (typeof existing?.template === "string") out.template = existing.template
  out.entry = entryRule(trigger, { entry: r.entry as TriggerConfig["entry"] })
  if (isPurchaseTrigger(trigger) && Array.isArray(r.product_ids)) {
    const ids = r.product_ids.filter((p): p is string => typeof p === "string" && /^[0-9a-f-]{36}$/i.test(p)).slice(0, 50)
    if (ids.length) out.product_ids = ids
  }
  if (isPurchaseTrigger(trigger) && (r.audience === "buyers" || r.audience === "subscribers")) out.audience = r.audience
  /* Round 51: the kinds of product a template starts on (Course onboarding: courses), kept through every save. */
  if (isPurchaseTrigger(trigger)) {
    const kinds = cleanKinds(r.product_kinds) ?? cleanKinds(existing?.product_kinds)
    if (kinds) out.product_kinds = kinds
  }
  return out
}

const KINDS = new Set(["digital", "course", "membership", "physical", "community"])

function cleanKinds(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const kinds = [...new Set(v.filter((k): k is string => typeof k === "string" && KINDS.has(k)))]
  return kinds.length ? kinds : null
}

/**
 * Postgres refused the trigger (23514, the check on email_flows.trigger_type):
 * a trigger newer than the database, before its SQL part has run (round 51,
 * part 379 for membership_started). Said plainly instead of "try again".
 */
export function triggerNotReady(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23514"
}

export const TRIGGER_NOT_READY = "This kind of automation is not available yet. Storelib is finishing an update. Try again later, or start from another one."

export function cleanName(v: unknown): string | null {
  const name = cleanLine(v, 80).trim()
  return name || null
}

/** The name a flow is saved under when it has none. */
export const UNTITLED = "Untitled automation"

/** "Copy of Welcome series", kept within the 80 characters a name can have. */
export function copyName(name: unknown): string {
  const base = cleanName(name) ?? UNTITLED
  return `Copy of ${base}`.slice(0, 80)
}

export function cleanTrigger(v: unknown): TriggerType | null {
  return isTriggerType(v) ? v : null
}

/**
 * The store an automation route acts for, or null: the signed in owner's own
 * on their own client (row level security as before), or the store a team
 * member given Marketing works in (lib/team), through the service role, and
 * every route filters by this creator id.
 */
/*
  Round rel2-auth: a refusal is handed back as the gate gave it. Every refusal was null, and every route said 401
  "Sign in again." to it, a 503 (Supabase Auth or the store not answering) and a 403 (no Marketing) included.
  Only a 401 still reads "Sign in again."
*/
export async function signedInCreator(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; creatorId: string; userEmail: string | null } | Response> {
  const { requireTeamPermission } = await import("@/lib/team/server")
  const { NextResponse } = await import("next/server")
  const gate = await requireTeamPermission("marketing")
  if (gate instanceof NextResponse) return gate.status === 401 ? NextResponse.json({ error: "Sign in again." }, { status: 401 }) : gate
  const supabase = gate.isOwner ? await createClient() : (gate.db as Awaited<ReturnType<typeof createClient>>)
  return { supabase, creatorId: gate.creatorId, userEmail: gate.userEmail }
}
