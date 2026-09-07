import "server-only"

/**
 * What a project IS, remembered between runs.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The agent used to begin every run with a generic system prompt and the
 * creator's one sentence. Nothing told it what the site was for, who it served,
 * or what had already been decided — so it re-derived all of that from the
 * files each time, and a fresh reader every time keeps arriving somewhere
 * slightly different. Ask for a testimonials section twice and you get two
 * visual languages.
 *
 * ---------------------------------------------------------------------------
 *  WHAT IS STORED HERE, AND WHAT DELIBERATELY IS NOT
 * ---------------------------------------------------------------------------
 * Only what CANNOT be read back out of the code: the business, the audience,
 * the design direction in words, and decisions the creator has already made
 * ("keep the header dark", "no stock photography", "German copy").
 *
 * Colours, fonts, spacing and radii are NOT here, even though they are part of
 * the project's identity. They live in src/styles.css as tokens, and that file
 * is the truth. A copy in this record would be a SECOND truth that goes stale
 * the first time somebody edits a token — and a manifest confidently stating
 * the wrong primary colour is worse than no manifest at all, because the agent
 * would believe it. Those are derived fresh from the files on every run
 * instead; see agent/context.ts.
 */

import { createClient } from "@/lib/supabase/server"

export interface ProjectManifest {
  /** What the site is for, in a sentence. */
  purpose?: string
  /** The business or brand it belongs to. */
  business?: string
  /** Who it is for. */
  audience?: string
  /** What the site is meant to make happen — enquiries, bookings, sales. */
  primaryGoal?: string
  /** How it should sound — "plain and direct", "warm", "playful". */
  tone?: string
  /** landing page, portfolio, store, agency site, funnel… */
  siteType?: string
  /** The design direction in words — "warm, editorial, lots of air". */
  designDirection?: string
  /**
   * Decisions already made, newest last. These are the things a creator
   * should never have to say twice.
   */
  decisions?: string[]
  updatedAt?: string
}

const MAX_DECISIONS = 40
const MAX_FIELD = 400

function trim(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const clean = value.trim().slice(0, MAX_FIELD)
  return clean || undefined
}

/**
 * Merge what the agent learned into what was already known.
 *
 * Fields are replaced when supplied and LEFT ALONE when not, so an agent that
 * only learned one new thing cannot erase the rest by omission. Decisions
 * append rather than replace, de-duplicated, and keep the newest — a decision
 * list that silently drops the oldest entry is better than one that grows
 * without limit until it crowds the prompt.
 */
export function mergeManifest(
  current: ProjectManifest | null,
  incoming: Partial<ProjectManifest> & { decision?: string },
): ProjectManifest {
  const base: ProjectManifest = { ...(current ?? {}) }

  for (const key of [
    "purpose",
    "business",
    "audience",
    "siteType",
    "primaryGoal",
    "tone",
    "designDirection",
  ] as const) {
    const value = trim(incoming[key])
    if (value) base[key] = value
  }

  const decision = trim(incoming.decision)
  const incomingList = Array.isArray(incoming.decisions) ? incoming.decisions : []
  const additions = [...incomingList.map(trim), decision].filter((d): d is string => !!d)

  if (additions.length) {
    const seen = new Set((base.decisions ?? []).map((d) => d.toLowerCase()))
    const merged = [...(base.decisions ?? [])]
    for (const add of additions) {
      if (seen.has(add.toLowerCase())) continue
      seen.add(add.toLowerCase())
      merged.push(add)
    }
    base.decisions = merged.slice(-MAX_DECISIONS)
  }

  base.updatedAt = new Date().toISOString()
  return base
}

/**
 * Read the manifest, tolerating a database that has not run the migration.
 *
 * NOT part of the shared column list in projects.ts, and that is the whole
 * point: SQL here is applied by hand, so a column added in code is live before
 * it exists in the database. Putting `preview_revision` in that shared list
 * once already made a creator's dashboard report that they had no sites at
 * all. A missing manifest column means the agent works without memory —
 * exactly as it did before this feature — rather than the run failing.
 */
export async function readManifest(siteId: string): Promise<ProjectManifest | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("sites")
    .select("manifest")
    .eq("id", siteId)
    .maybeSingle()

  if (error || !data) return null
  return ((data as { manifest?: ProjectManifest | null }).manifest ?? null) as ProjectManifest | null
}

/** Returns false when the column is not there yet; the caller carries on. */
export async function writeManifest(siteId: string, manifest: ProjectManifest): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase.from("sites").update({ manifest }).eq("id", siteId)
  if (error) {
    console.error("[writeManifest] could not save project memory:", error.message)
    return false
  }
  return true
}

/**
 * Is there enough here to be worth calling a project's understanding?
 *
 * A manifest with a purpose and nothing else is the shape a bootstrap leaves
 * behind; one with a business, an audience and a design direction has actually
 * been filled in. The distinction decides whether this run is asked to
 * establish the rest.
 */
export function manifestIsThin(manifest: ProjectManifest | null): boolean {
  if (!manifest) return true
  const filled = [
    manifest.business,
    manifest.audience,
    manifest.siteType,
    manifest.designDirection,
  ].filter(Boolean).length
  return filled < 2
}

/**
 * The cheapest possible first draft, written without asking a model anything.
 *
 * A project created from "build me a barber shop in Frankfurt" already contains
 * its own purpose — it is the sentence that made it. Reading the first thing
 * the creator ever said costs one indexed query and is more accurate than
 * anything inferred from the code, because it is what they actually asked for.
 *
 * Everything else is left blank on purpose. The next run reads the code anyway,
 * so having it fill in the rest costs nothing extra; guessing here would only
 * put low-confidence text where the model would otherwise look and find
 * nothing.
 */
export async function seedManifest(siteId: string): Promise<ProjectManifest | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("site_chat_messages")
    .select("content")
    .eq("site_id", siteId)
    .eq("role", "user")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return null
  const brief = (data as { content?: string } | null)?.content?.trim()
  if (!brief) return null

  return { purpose: brief.slice(0, MAX_FIELD), updatedAt: new Date().toISOString() }
}

/** The manifest as the model should read it. Empty string when there is none. */
export function describeManifest(manifest: ProjectManifest | null): string {
  if (!manifest) return ""
  const lines: string[] = []
  if (manifest.business) lines.push(`Business: ${manifest.business}`)
  if (manifest.purpose) lines.push(`Purpose: ${manifest.purpose}`)
  if (manifest.audience) lines.push(`Audience: ${manifest.audience}`)
  if (manifest.primaryGoal) lines.push(`What it is for: ${manifest.primaryGoal}`)
  if (manifest.tone) lines.push(`Tone: ${manifest.tone}`)
  if (manifest.siteType) lines.push(`Site type: ${manifest.siteType}`)
  if (manifest.designDirection) lines.push(`Design direction: ${manifest.designDirection}`)
  if (manifest.decisions?.length) {
    lines.push("Decisions already made (do not undo these without being asked):")
    for (const decision of manifest.decisions) lines.push(`  - ${decision}`)
  }
  return lines.join("\n")
}
