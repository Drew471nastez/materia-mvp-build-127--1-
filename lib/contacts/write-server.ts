import "server-only"

/**
 * ===========================================================================
 *  WHAT CONTACTS MAY CHANGE (round 51)
 * ===========================================================================
 * Only what the creator owns about a person, in public.creator_contacts
 * (SQL part 378): a name they typed, notes, tags, and people they added by
 * hand or imported. Never an order, a membership, a community member, a form
 * answer or a course enrollment; those are kept where they are, and a person
 * made of them stays in the list for as long as they are there.
 *
 * Two existing list actions are reused exactly as the Emails page does them:
 * taking someone off the marketing list (subscribers: unsubscribed, not
 * active), and adding people who agreed to emails as new subscribers. An
 * import never puts back on the list anybody who left it, bounced or
 * complained, and never upgrades a buyer who did not ask; it only adds
 * addresses the list does not have yet, and only when the creator confirms
 * the people agreed. It sends no welcome email.
 */
import { randomUUID } from "node:crypto"
import { cleanTag, isUuid, normalizeEmail, parseContactKey } from "./identity"
import { ownedSeed } from "./profile-server"
import { readSources, type Db } from "./people-server"
import type { ContactsScope } from "./gate"
import type { ImportRow } from "./csv"

export const CONTACTS_MISSING = "contacts_missing"

/** The table is not there yet (part 378 not run). */
export function contactsTableMissing(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code ?? "")
  return code === "42P01" || code === "PGRST205" || /creator_contacts/.test(String(error.message ?? "")) && /does not exist|could not find/i.test(String(error.message ?? ""))
}

export class ContactsMissing extends Error {
  code = CONTACTS_MISSING
  constructor() {
    super("Notes, tags and adding people need the Contacts database update (SQL part 378). Everything else keeps working.")
  }
}

/** Who a contact row is about: an account, or an address. */
export type Identity = { contactId: string } | { userId: string } | { email: string }

/**
 * Many keys at once, each to who it is, checked to be this store's. Keys
 * of other stores, or of nobody, are left out. One read per kind, never one
 * per key, except an account (read by its rows with the store, 20 at a time).
 */
export async function resolveKeys(db: Db, scope: ContactsScope, keys: readonly string[]): Promise<Map<string, Identity>> {
  const out = new Map<string, Identity>()
  const byKind = new Map<string, string[]>()
  for (const key of keys.slice(0, 500)) {
    const p = parseContactKey(key)
    if (!p) continue
    byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p.id])
  }
  const c = scope.creatorId
  const rows = async (q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const r = await q
    if (r.error && contactsTableMissing(r.error as { code?: string })) throw new ContactsMissing()
    return (Array.isArray(r.data) ? r.data : []) as Record<string, unknown>[]
  }
  const emailOf = (prefix: string, list: Record<string, unknown>[], col: string) => {
    for (const r of list) {
      const e = normalizeEmail(r[col])
      if (e) out.set(`${prefix}_${String(r.id).toLowerCase()}`, { email: e })
    }
  }
  const tasks: Promise<void>[] = []
  const ids = (k: string) => (byKind.get(k) ?? []).slice(0, 200)
  if (ids("contact").length) tasks.push(rows(db.from("creator_contacts").select("id").eq("creator_id", c).in("id", ids("contact"))).then((l) => l.forEach((r) => out.set(`c_${String(r.id).toLowerCase()}`, { contactId: String(r.id) }))))
  if (ids("subscriber").length) tasks.push(rows(db.from("subscribers").select("id, email").eq("creator_id", c).in("id", ids("subscriber"))).then((l) => emailOf("s", l, "email")))
  if (ids("customer").length) tasks.push(rows(db.from("customers").select("id, email").eq("creator_id", c).in("id", ids("customer"))).then((l) => emailOf("k", l, "email")))
  if (ids("message").length) tasks.push(rows(db.from("site_contact_messages").select("id, email").eq("creator_id", c).in("id", ids("message"))).then((l) => emailOf("m", l, "email")))
  if (ids("form_submission").length && scope.ownerUserId) tasks.push(rows(db.from("form_submissions").select("id, contact_email").eq("owner_id", scope.ownerUserId).in("id", ids("form_submission"))).then((l) => emailOf("f", l, "contact_email")))
  for (const kind of ["order", "membership", "lead", "community_member", "enrollment"] as const)
    for (const id of ids(kind).slice(0, 50))
      tasks.push(
        ownedSeed(db, scope, kind, id).then((seed) => {
          if (!seed || !("record" in seed)) return
          const key = `${kind === "order" ? "o" : kind === "membership" ? "b" : kind === "lead" ? "l" : kind === "community_member" ? "g" : "e"}_${id}`
          if (seed.record.userId) out.set(key, { userId: seed.record.userId })
          else if (seed.record.email) out.set(key, { email: seed.record.email })
        }),
      )
  const users = ids("user")
  for (let i = 0; i < users.length; i += 20) {
    const chunk = users.slice(i, i + 20)
    tasks.push(
      readSources(db, scope, { users: chunk, emails: [] }).then((read) => {
        const seen = new Set(read.records.map((r) => r.userId).filter(Boolean))
        for (const u of chunk) if (seen.has(u)) out.set(`u_${u}`, { userId: u })
      }),
    )
  }
  await Promise.all(tasks)
  return out
}

type ContactRow = { id: string; tags: string[] | null; name: string | null }

async function findRow(db: Db, scope: ContactsScope, who: Identity): Promise<ContactRow | null> {
  let q = db.from("creator_contacts").select("id, tags, name").eq("creator_id", scope.creatorId)
  q = "contactId" in who ? q.eq("id", who.contactId) : "userId" in who ? q.eq("user_id", who.userId) : q.eq("email_normalized", who.email)
  const { data, error } = await q.maybeSingle()
  if (error && contactsTableMissing(error)) throw new ContactsMissing()
  return data ? { ...(data as ContactRow), tags: tagList((data as ContactRow).tags) } : null
}

/* A text[] as an array whatever the client hands back. */
const tagList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [])

/** The creator's row for this person, made when there is none. */
export async function ensureRow(db: Db, scope: ContactsScope, who: Identity, opts: { source?: "manual" | "import"; name?: string | null; by?: string | null } = {}): Promise<ContactRow> {
  const found = await findRow(db, scope, who)
  if (found) return found
  if ("contactId" in who) throw new Error("not_found")
  const row = {
    creator_id: scope.creatorId,
    user_id: "userId" in who ? who.userId : null,
    email_normalized: "email" in who ? who.email : null,
    name: opts.name ?? null,
    source: opts.source ?? "manual",
    created_by: opts.by && isUuid(opts.by) ? opts.by : null,
  }
  const { data, error } = await db.from("creator_contacts").insert(row).select("id, tags, name").single()
  if (error) {
    if (contactsTableMissing(error)) throw new ContactsMissing()
    /* Two saves at once: the other one made it. */
    if (String(error.code) === "23505") {
      const again = await findRow(db, scope, who)
      if (again) return again
    }
    throw new Error("save_failed")
  }
  return { ...(data as ContactRow), tags: tagList((data as ContactRow).tags) }
}

export const cleanTags = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : []).map(cleanTag).filter((t): t is string => !!t))].slice(0, 50)

export async function updateRow(db: Db, scope: ContactsScope, id: string, patch: { name?: string | null; notes?: string | null; tags?: string[] }): Promise<void> {
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) set.name = patch.name ? patch.name.replace(/\s+/g, " ").trim().slice(0, 120) || null : null
  if (patch.notes !== undefined) set.notes = patch.notes ? patch.notes.slice(0, 5000) : null
  if (patch.tags !== undefined) set.tags = cleanTags(patch.tags)
  const { error } = await db.from("creator_contacts").update(set).eq("id", id).eq("creator_id", scope.creatorId)
  if (error) {
    if (contactsTableMissing(error)) throw new ContactsMissing()
    throw new Error("save_failed")
  }
}

/** A tag added to (or taken off) each person. Returns how many changed. */
export async function tagPeople(db: Db, scope: ContactsScope, keys: string[], tag: string, add: boolean, by: string | null): Promise<number> {
  const clean = cleanTag(tag)
  if (!clean) return 0
  const who = await resolveKeys(db, scope, keys)
  let changed = 0
  for (const identity of who.values()) {
    if (!add) {
      const row = await findRow(db, scope, identity)
      if (!row) continue
      const next = (row.tags ?? []).filter((t) => t.toLowerCase() !== clean.toLowerCase())
      if (next.length === (row.tags ?? []).length) continue
      await updateRow(db, scope, row.id, { tags: next })
      changed++
      continue
    }
    const row = await ensureRow(db, scope, identity, { by })
    const tags = row.tags ?? []
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) continue
    await updateRow(db, scope, row.id, { tags: [...tags, clean] })
    changed++
  }
  return changed
}

/**
 * Deleting a person removes only the creator's own row for them (notes,
 * tags, a person added by hand or imported). Orders, memberships,
 * community members, form answers and subscribers are never deleted here.
 */
export async function deleteContactRows(db: Db, scope: ContactsScope, contactIds: string[]): Promise<number> {
  const ids = contactIds.filter(isUuid).slice(0, 500)
  if (!ids.length) return 0
  const { data, error } = await db.from("creator_contacts").delete().eq("creator_id", scope.creatorId).in("id", ids).select("id")
  if (error) {
    if (contactsTableMissing(error)) throw new ContactsMissing()
    throw new Error("delete_failed")
  }
  return Array.isArray(data) ? data.length : 0
}

/** The Emails page's own "take off the list": the row stays, marked unsubscribed. */
export async function unsubscribe(db: Db, scope: ContactsScope, subscriberId: string): Promise<boolean> {
  if (!isUuid(subscriberId)) return false
  const { data, error } = await db
    .from("subscribers")
    .update({ is_active: false, status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", subscriberId)
    .eq("creator_id", scope.creatorId)
    .select("id")
  if (error) {
    /* A database from before unsubscribed_at: the two columns the Emails page writes. */
    const again = await db.from("subscribers").update({ is_active: false, status: "unsubscribed" }).eq("id", subscriberId).eq("creator_id", scope.creatorId).select("id")
    return !again.error && Array.isArray(again.data) && again.data.length > 0
  }
  return Array.isArray(data) && data.length > 0
}

export interface ImportResult {
  /** New contact rows. */
  added: number
  /** People already kept, given the import's tags or name. */
  updated: number
  /** New subscribers (only with the creator's confirmation). */
  subscribed: number
  /** Already on the list. */
  alreadySubscribed: number
  /** On the list's records as unsubscribed, bounced, complained or a buyer who never asked: left as they are. */
  keptOff: number
  /** Contact rows could not be kept (part 378 not run). */
  contactsMissing: boolean
}

export const IMPORT_CONSENT_TEXT = "Imported by the store, which confirmed these people agreed to get its emails"

/**
 * People into the store: a contact row each (when part 378 has run), and,
 * when the creator confirmed the people agreed to emails, a new subscriber
 * for each address the list does not have yet.
 */
export async function importPeople(db: Db, scope: ContactsScope, input: ImportRow[], opts: { subscribe: boolean; tags: string[]; source: "manual" | "import"; by: string | null }): Promise<ImportResult> {
  const res: ImportResult = { added: 0, updated: 0, subscribed: 0, alreadySubscribed: 0, keptOff: 0, contactsMissing: false }
  const extra = cleanTags(opts.tags)
  const now = new Date().toISOString()
  for (let i = 0; i < input.length; i += 200) {
    const chunk = input.slice(i, i + 200)
    const emails = chunk.map((r) => r.email)
    if (!res.contactsMissing) {
      const { data: have, error } = await db.from("creator_contacts").select("id, email_normalized, tags, name").eq("creator_id", scope.creatorId).in("email_normalized", emails)
      if (error && contactsTableMissing(error)) res.contactsMissing = true
      else if (error) throw new Error("save_failed")
      else {
        const kept = new Map(((have ?? []) as { id: string; email_normalized: string; tags: string[] | null; name: string | null }[]).map((r) => [r.email_normalized, r]))
        const fresh = chunk.filter((r) => !kept.has(r.email))
        if (fresh.length) {
          const { error: insertError } = await db.from("creator_contacts").upsert(
            fresh.map((r) => ({ creator_id: scope.creatorId, email_normalized: r.email, name: r.name, tags: cleanTags([...r.tags, ...extra]), source: opts.source, created_by: opts.by && isUuid(opts.by) ? opts.by : null })),
            { onConflict: "creator_id,email_normalized", ignoreDuplicates: true },
          )
          if (insertError) throw new Error("save_failed")
          res.added += fresh.length
        }
        for (const r of chunk) {
          const row = kept.get(r.email)
          if (!row) continue
          const tags = cleanTags([...tagList(row.tags), ...r.tags, ...extra])
          const name = row.name || r.name
          if (tags.length === tagList(row.tags).length && name === row.name) continue
          await updateRow(db, scope, row.id, { tags, name })
          res.updated++
        }
      }
    }
    if (!opts.subscribe) continue
    const { data: subs, error: subError } = await db.from("subscribers").select("email, status, is_active").eq("creator_id", scope.creatorId).in("email", emails)
    if (subError) throw new Error("save_failed")
    const onFile = new Map(((subs ?? []) as { email: string; status: string | null; is_active: boolean | null }[]).map((s) => [String(s.email).toLowerCase(), s]))
    const add = chunk.filter((r) => !onFile.has(r.email))
    for (const s of onFile.values()) {
      if (s.status === "subscribed" && s.is_active !== false) res.alreadySubscribed++
      else res.keptOff++
    }
    if (add.length) {
      const rowOf = (r: ImportRow) => ({
        creator_id: scope.creatorId,
        email: r.email,
        name: r.name,
        source: opts.source,
        status: "subscribed",
        is_active: true,
        subscribed_at: now,
        consent_text: IMPORT_CONSENT_TEXT,
        consent_timestamp: now,
        unsubscribe_token: randomUUID(),
      })
      const { error } = await db.from("subscribers").insert(add.map(rowOf))
      if (error) {
        if (String(error.code) !== "23505") throw new Error("save_failed")
        /* Someone joined while this ran: one at a time, the one already there left as it is. */
        for (const r of add) {
          const one = await db.from("subscribers").insert(rowOf(r))
          if (one.error && String(one.error.code) !== "23505") throw new Error("save_failed")
        }
      }
      res.subscribed += add.length
      /* Where they came from, written after and allowed to fail (lib/contacts/contact-source). */
      await db.from("subscribers").update({ source_detail: { surface: opts.source } }).eq("creator_id", scope.creatorId).in("email", add.map((r) => r.email)).is("source_detail", null).then(
        () => undefined,
        () => undefined,
      )
    }
  }
  return res
}
