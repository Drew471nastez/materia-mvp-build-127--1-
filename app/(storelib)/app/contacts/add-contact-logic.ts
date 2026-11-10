/**
 * ===========================================================================
 *  ADD CONTACT, THE RULES (wave 9)
 * ===========================================================================
 * The owner: "add contact ... smooth, clean, simple, easy to understand, all
 * fully working". What the sheet asks for (an email, then a name, a phone,
 * tags and notes, all optional), what it checks before anything is sent,
 * how a person already in the store is recognised, and the row that shows
 * in the list the moment Add contact is pressed (before the server answers).
 * Plain functions, no React, so tests/contacts-add-w9.test.ts reads them.
 */
import type { PersonRow } from "@/lib/contacts/identity"

export interface AddDraft {
  email: string
  name: string
  phone: string
  tags: string
  notes: string
  agreed: boolean
}

export const EMPTY_DRAFT: AddDraft = { email: "", name: "", phone: "", tags: "", notes: "", agreed: false }

/* The same plain check every sign-up route makes (lib/contacts/identity normalizeEmail). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** An address as the lists key it, or null when it is not one. */
export function draftEmail(v: string): string | null {
  const e = v.trim().toLowerCase()
  return e.length <= 254 && EMAIL.test(e) ? e : null
}

/** The server's rule (lib/contacts/write-server cleanPhone): digits, spaces and + ( ) - . only. */
export function draftPhone(v: string): string | null {
  const p = v.replace(/\s+/g, " ").trim()
  return p.length >= 3 && p.length <= 40 && /^[+0-9()\-. ]+$/.test(p) && /\d{3}/.test(p.replace(/\D/g, "")) ? p : null
}

/** Tags as typed, comma separated: trimmed, each once (whatever its case), at most 50. */
export function draftTags(v: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of v.split(",")) {
    const t = raw.trim().slice(0, 40)
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
  }
  return out.slice(0, 50)
}

export type DraftProblem = { field: "email" | "phone"; code: "email_missing" | "email_invalid" | "phone_invalid" }

/** What stops the draft from being sent, field by field, before any request. */
export function checkDraft(d: AddDraft): DraftProblem[] {
  const out: DraftProblem[] = []
  if (!d.email.trim()) out.push({ field: "email", code: "email_missing" })
  else if (!draftEmail(d.email)) out.push({ field: "email", code: "email_invalid" })
  if (d.phone.trim() && !draftPhone(d.phone)) out.push({ field: "phone", code: "phone_invalid" })
  return out
}

/** What POST /api/contacts is sent. */
export function draftBody(d: AddDraft, marketing: boolean) {
  return {
    email: draftEmail(d.email) ?? d.email.trim(),
    name: d.name.replace(/\s+/g, " ").trim().slice(0, 120),
    phone: draftPhone(d.phone) ?? "",
    tags: draftTags(d.tags),
    notes: d.notes.trim().slice(0, 5000),
    subscribe: marketing && d.agreed,
  }
}

/** The person among these rows with this address, if any (the list's rows, a search's answer). */
export function sameEmail(rows: readonly PersonRow[], email: string): PersonRow | null {
  const e = email.trim().toLowerCase()
  if (!e) return null
  return rows.find((r) => (r.email ?? "").trim().toLowerCase() === e) ?? null
}

/** The id an optimistic row wears until the server names the person. */
export const PENDING_PREFIX = "pending:"
export const isPendingId = (id: string) => id.startsWith(PENDING_PREFIX)

/** The row shown in the list the moment Add contact is pressed. */
export function optimisticRow(d: AddDraft, now: string): PersonRow {
  const email = draftEmail(d.email) ?? d.email.trim().toLowerCase()
  const name = d.name.replace(/\s+/g, " ").trim() || null
  return {
    id: `${PENDING_PREFIX}${email}`,
    userId: null,
    email,
    name,
    firstSeen: now,
    lastSeen: now,
    lead: false,
    customer: false,
    subscriber: false,
    member: false,
    student: false,
    subscription: "none",
    origin: "manual",
    orders: 0,
    forms: 0,
    tags: draftTags(d.tags),
    communities: [],
    tiers: [],
    access: [],
    leadStatuses: [],
    hasContact: true,
  }
}

/**
 * The list as shown with the people just added: on the first page of All with
 * no search (the only view a person added by hand is sure to belong in), on
 * top, each once; a person already on the page is not drawn twice.
 */
export function withAdded(rows: readonly PersonRow[], added: readonly PersonRow[], view: { filter: string; page: number; filtered: boolean }): PersonRow[] {
  if (!added.length || view.filter !== "all" || view.page !== 1 || view.filtered) return rows as PersonRow[]
  const emails = new Set(added.map((r) => (r.email ?? "").toLowerCase()))
  return [...added, ...rows.filter((r) => !emails.has((r.email ?? "").toLowerCase()))]
}
