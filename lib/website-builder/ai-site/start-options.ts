/**
 * ===========================================================================
 *  START WITH AI: WHAT THE PERSON CHOSE, BESIDE WHAT THEY WROTE
 * ===========================================================================
 * Describe your website has a box for the words and a row of examples
 * ("Fitness coach"). Before round L only the words reached the server: the
 * example was text in the box and nothing else, so the job never knew which
 * one was picked, and there was nowhere to say "start from a blank page"
 * (docs: L-architecture D4, D7). This module is the one place that says:
 *
 *   • which examples exist, by id (START_CATEGORIES in lib/ai-builder/types)
 *     and the exact words each puts in the box;
 *   • what a press on an example does to words already there
 *     (chipAction): it only replaces the box when the box is empty or still
 *     holds the last example's words untouched; words the person typed are
 *     never overwritten without asking;
 *   • the options sent with Create, checked on the server (parseStartOptions)
 *     before anything is made, and stored on the job row (ai_site_jobs.options,
 *     SQL part 401) with the prompt, exactly as written;
 *   • the one line of context the generator reads them as (startContext);
 *   • the idempotency key kept per prompt and options in this tab
 *     (pendingStartKey), so a reload after a lost answer sends the same key
 *     and the server answers with the first website and job, not a second.
 *
 * Pure and safe in the browser and on the server.
 */
import { msg } from "@/lib/i18n/text"
import { START_CATEGORIES, type GenerationMode, type StartCategory, type StartOptions } from "@/lib/ai-builder/types"

export type { GenerationMode, StartCategory, StartOptions }

/** The examples on Describe your website: the chip's name and the description it puts in the box. Translated where shown (tt). */
export const START_PRESETS: readonly { id: StartCategory; label: string; prompt: string; industry: string }[] = [
  {
    id: "candle_shop",
    label: msg("Candle shop"),
    prompt: msg("An online shop for my hand-poured soy candles, with a warm and calm look, best sellers on the home page and the story of how they are made."),
    industry: "Candles and home fragrance shop",
  },
  {
    id: "fitness_coach",
    label: msg("Fitness coach"),
    prompt: msg("A website for my personal training business with my programs, client results, prices and a way to book a free first call."),
    industry: "Personal trainer and fitness coach",
  },
  {
    id: "photographer",
    label: msg("Photographer"),
    prompt: msg("A portfolio for my wedding and portrait photography with galleries, packages and prices, and a contact form."),
    industry: "Wedding and portrait photographer",
  },
  {
    id: "online_course",
    label: msg("Online course"),
    prompt: msg("A website that sells my watercolor course for beginners, with what is inside, reviews, an FAQ and a clear buy button."),
    industry: "Online course creator",
  },
]

/**
 * ROUND N: how Start with AI builds when the person picks nothing. From
 * scratch ("blank"): the AI designs every page, the header and the footer
 * (Andrew: "It should NOT take me to the default theme"). Inside the theme
 * is the second option. The server's own default for a body without options
 * stays "theme" (parseStartOptions), for anything sent before this round.
 */
/* Round 26: from the closest of Storelib's templates (the owner: build like the templates are built); From scratch stays a choice. */
export const START_GENERATION: GenerationMode = "theme"

/**
 * What a press sends, given the choice on screen and whether the new AI
 * builder is on for the account. From scratch needs it; without it the press
 * builds inside the theme, which the page says in words beside the choice.
 * Never the other way round. Pure.
 */
export function startGeneration(chosen: GenerationMode, agent: boolean): GenerationMode {
  return agent ? chosen : "theme"
}

export function isStartCategory(v: unknown): v is StartCategory {
  return typeof v === "string" && (START_CATEGORIES as readonly string[]).includes(v)
}

export function presetFor(id: StartCategory) {
  return START_PRESETS.find((p) => p.id === id)!
}

/* ── an example pressed ──────────────────────────────────────────────── */

/**
 * What pressing an example does to the box.
 *
 *   • replace: the box is empty (spaces only), or it still holds exactly the
 *     words the last example put there. Nothing of the person's is lost.
 *   • ask: they wrote or changed something. The page asks: replace it, or
 *     add the example under it. Never overwritten silently.
 *   • none: the box already holds this example's words.
 */
export type ChipAction = { kind: "replace"; text: string } | { kind: "ask"; replace: string; append: string } | { kind: "none" }

export function chipAction(current: string, lastInserted: string | null, presetText: string): ChipAction {
  if (current === presetText) return { kind: "none" }
  if (current.trim() === "" || (lastInserted !== null && current === lastInserted)) return { kind: "replace", text: presetText }
  const sep = /\n\s*$/.test(current) ? "\n" : "\n\n"
  return { kind: "ask", replace: presetText, append: `${current.replace(/\s+$/, "")}${sep}${presetText}` }
}

/* ── the options, checked ────────────────────────────────────────────── */

const PREF_TEXT_MAX = 80
const PAGE_MAX = 12
const HEX = /^#[0-9a-f]{6}$/i
const PRESET_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/

export type ParsedOptions = { ok: true; options: StartOptions } | { ok: false; error: string }

/**
 * The options the Website page sends with Create, checked. Missing means the
 * old behaviour (`generation: "theme"`, inside Storelib's own theme with its
 * header and footer). Anything not understood is refused, never dropped, so
 * a choice the person made can not silently become another.
 */
export function parseStartOptions(raw: unknown): ParsedOptions {
  if (raw === undefined || raw === null) return { ok: true, options: { generation: "theme" } }
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "options must be an object" }
  const o = raw as Record<string, unknown>
  const generation = o.generation === undefined ? "theme" : o.generation
  if (generation !== "blank" && generation !== "theme") return { ok: false, error: "generation must be blank or theme" }
  const out: StartOptions = { generation }
  if (o.category !== undefined && o.category !== null) {
    if (!isStartCategory(o.category)) return { ok: false, error: "Unknown category" }
    out.category = o.category
  }
  if (o.preset !== undefined && o.preset !== null) {
    if (typeof o.preset !== "string" || !PRESET_ID.test(o.preset)) return { ok: false, error: "Unknown design preset" }
    out.preset = o.preset
  }
  if (o.preferences !== undefined && o.preferences !== null) {
    const p = o.preferences
    if (typeof p !== "object" || Array.isArray(p)) return { ok: false, error: "preferences must be an object" }
    const pr = p as Record<string, unknown>
    const prefs: NonNullable<StartOptions["preferences"]> = {}
    if (pr.pages !== undefined) {
      if (!Array.isArray(pr.pages) || pr.pages.length > PAGE_MAX || !pr.pages.every((x) => typeof x === "string" && x.trim() && x.length <= PREF_TEXT_MAX)) return { ok: false, error: "pages must be a short list of names" }
      prefs.pages = (pr.pages as string[]).map((x) => x.trim())
    }
    if (pr.tone !== undefined) {
      if (typeof pr.tone !== "string" || pr.tone.length > PREF_TEXT_MAX) return { ok: false, error: "tone must be short text" }
      if (pr.tone.trim()) prefs.tone = pr.tone.trim()
    }
    if (pr.colors !== undefined) {
      if (!Array.isArray(pr.colors) || pr.colors.length > 6 || !pr.colors.every((x) => typeof x === "string" && HEX.test(x))) return { ok: false, error: "colors must be up to six #rrggbb values" }
      prefs.colors = (pr.colors as string[]).map((x) => x.toLowerCase())
    }
    if (pr.language !== undefined) {
      if (typeof pr.language !== "string" || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(pr.language)) return { ok: false, error: "language must be a language code" }
      prefs.language = pr.language
    }
    if (Object.keys(prefs).length) out.preferences = prefs
  }
  return { ok: true, options: out }
}

/**
 * The options as context for the generator, in plain words: what the person
 * picked, never instead of their prompt. Empty when they picked nothing. The
 * job reads the prompt as written and this beside it.
 */
export function startContext(options: StartOptions | null | undefined): string {
  if (!options) return ""
  const lines: string[] = []
  if (options.category) lines.push(`Kind of website (the example they picked): ${presetFor(options.category).industry}.`)
  if (options.generation === "blank") lines.push("Start from a blank page: no theme header, footer or sections exist. Make the header and footer too, or none if the site is better without.")
  else if (options.template) lines.push(`Started in Storelib's "${options.template}" template on the Materia theme, as its frame: its header, footer and other pages are in place; home and the look are composed for this business. Make every page this business's.`)
  else lines.push("Build inside Storelib's own theme: keep its header and footer and fill the pages.")
  if (options.preset) lines.push(`Design preset they chose: ${options.preset}.`)
  const p = options.preferences
  if (p?.pages?.length) lines.push(`Pages they want: ${p.pages.join(", ")}.`)
  if (p?.tone) lines.push(`Tone: ${p.tone}.`)
  if (p?.colors?.length) lines.push(`Brand colours: ${p.colors.join(", ")}.`)
  if (p?.language) lines.push(`Write the site in: ${p.language}.`)
  return lines.join("\n")
}

/* ── one key per press, kept across a reload ─────────────────────────── */

/** FNV-1a, 32 bit, hex: the same prompt and options give the same name, in any browser. Not a secret. */
export function startHash(prompt: string, options: StartOptions): string {
  const text = JSON.stringify([prompt, options.generation, options.category ?? null, options.preset ?? null, options.preferences ?? null])
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

type KeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
const PENDING = "storelib:start-ai-pending"
/** A press older than this is a new press: its key is not reused. */
export const PENDING_TTL_MS = 30 * 60_000

/**
 * The idempotency key for Create with these words and options. A press with
 * the same ones as the last unanswered press, within PENDING_TTL_MS, gets
 * the same key (a double press, a retry, a reload after the answer was
 * lost); anything else gets a new one, kept until the answer arrives
 * (forgetPendingStart). Storage refused: a new key each time, as before.
 */
export function pendingStartKey(storage: KeyStorage | null | undefined, prompt: string, options: StartOptions, makeKey: () => string, now = Date.now()): string {
  const hash = startHash(prompt, options)
  try {
    const raw = storage?.getItem(PENDING)
    if (raw) {
      const p = JSON.parse(raw) as { hash?: unknown; key?: unknown; at?: unknown }
      if (p.hash === hash && typeof p.key === "string" && typeof p.at === "number" && now - p.at >= 0 && now - p.at < PENDING_TTL_MS) return p.key
    }
  } catch {
    /* unreadable: a new key */
  }
  const key = makeKey()
  try {
    storage?.setItem(PENDING, JSON.stringify({ hash, key, at: now }))
  } catch {
    /* kept in memory only */
  }
  return key
}

/** The answer came: the next press is a new website. */
export function forgetPendingStart(storage: KeyStorage | null | undefined): void {
  try {
    storage?.removeItem(PENDING)
  } catch {
    /* nothing kept */
  }
}

/* ── the box, kept across a reload of the Website page ───────────────── */

const DRAFT = "storelib:start-ai-draft"
/** Round N: drafts saved since From scratch became the default say so; an older draft's "theme" was only the old default, not a choice. */
/* 3 since round 26: a draft from before kept the old default (From scratch) as if it were chosen; it reads the new default. */
const DRAFT_VERSION = 3

export interface StartDraft {
  prompt: string
  category: StartCategory | null
  /** The words the last example put in the box, to tell them from the person's own. */
  inserted: string | null
  generation: GenerationMode
}

export function saveStartDraft(storage: KeyStorage | null | undefined, draft: StartDraft): void {
  try {
    if (!draft.prompt && !draft.category && draft.generation === START_GENERATION) storage?.removeItem(DRAFT)
    else storage?.setItem(DRAFT, JSON.stringify({ ...draft, v: DRAFT_VERSION }))
  } catch {
    /* a tab that keeps nothing starts empty next time */
  }
}

export function readStartDraft(storage: KeyStorage | null | undefined): StartDraft | null {
  try {
    const raw = storage?.getItem(DRAFT)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<StartDraft> & { v?: unknown }
    return {
      prompt: typeof d.prompt === "string" ? d.prompt : "",
      category: isStartCategory(d.category) ? d.category : null,
      inserted: typeof d.inserted === "string" ? d.inserted : null,
      /* Inside the theme only when it was picked (a draft of this round); an older draft's was the old default. */
      generation: d.v === DRAFT_VERSION && (d.generation === "theme" || d.generation === "blank") ? d.generation : START_GENERATION,
    }
  } catch {
    return null
  }
}

export function clearStartDraft(storage: KeyStorage | null | undefined): void {
  try {
    storage?.removeItem(DRAFT)
  } catch {
    /* nothing kept */
  }
}
