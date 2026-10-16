/**
 * ===========================================================================
 *  MAKING A COMMUNITY, STEP BY STEP (round 33)
 * ===========================================================================
 * The owner: "a clean multi step wizard". Five steps, each checked on its
 * own before Next, with the same rules the server checks again on Create
 * (components/community/creator/logic.ts checkCreate, and checkWizard here
 * for the three things only the wizard asks):
 *
 *   name      the name, the address (made from the name until it is typed),
 *             a line about it
 *   look      the logo and the cover; without a picture, one of six
 *             gradients the browser draws and uploads as the cover and,
 *             with the first letter, as the logo (create-flow.tsx)
 *   access    free, paid with a price, or private
 *   welcome   the first space's name (General until changed) and the
 *             welcome post pinned in it, written for them and editable
 *   review    everything on one card, each part a tap from its step
 *
 * The draft is kept in this browser (localStorage, a per person
 * convenience), so a refresh or a closed tab comes back where it was.
 *
 * Pure and browser safe.
 */
import { checkCreate, checkPrice, DESCRIPTION_CHARS, type CommunityType, type CreateInput, type PriceInterval } from "@/components/community/creator/logic"
import { LENGTHS } from "./limits"
import { slugify, validSlug, SLUG_MAX, SLUG_MIN } from "./slug"
import { tt } from "@/lib/i18n/text"

export const WIZARD_STEPS = ["name", "look", "access", "welcome", "review"] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

export const DRAFT_KEY = "storelib:new-community:v1"
export const WELCOME_BODY_MAX = 5000

/** Six covers for a community with no picture yet: calm, in the app's own inks, no purple. */
export const COVER_PALETTES = [
  { id: "ink", from: "#1a1a2e", to: "#45506b" },
  { id: "forest", from: "#173f31", to: "#5f8f6f" },
  { id: "clay", from: "#7c3524", to: "#d9905f" },
  { id: "sea", from: "#0d4352", to: "#3b9d9a" },
  { id: "sand", from: "#8a6a3a", to: "#e3c995" },
  { id: "slate", from: "#2f3a4a", to: "#9aa6b5" },
] as const
export type PaletteId = (typeof COVER_PALETTES)[number]["id"]

export function paletteOf(id: unknown): (typeof COVER_PALETTES)[number] {
  return COVER_PALETTES.find((p) => p.id === id) ?? COVER_PALETTES[0]
}

/** The CSS of a palette, for the previews; the uploaded cover is drawn from the same two stops. */
export function paletteCss(id: unknown): string {
  const p = paletteOf(id)
  return `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)`
}

/** The letter on a drawn icon: the name's first letter or digit, else a dot. */
export function initialOf(name: string): string {
  const m = /[\p{L}\p{N}]/u.exec(name ?? "")
  return m ? m[0].toLocaleUpperCase() : "·"
}

export interface WizardDraft {
  step: number
  name: string
  /** What the person typed for the address; empty means made from the name. */
  slug: string
  /** The address field is being typed in, so it shows what was typed, even nothing, rather than the name's. */
  slugEdited: boolean
  description: string
  logoUrl: string | null
  coverUrl: string | null
  palette: PaletteId
  type: CommunityType
  price: string
  interval: PriceInterval
  spaceName: string
  welcomeTitle: string
  welcomeBody: string
  /** The welcome post was changed by hand, so a new name does not rewrite it. */
  welcomeEdited: boolean
}

export function emptyDraft(): WizardDraft {
  return { step: 0, name: "", slug: "", slugEdited: false, description: "", logoUrl: null, coverUrl: null, palette: "ink", type: "free", price: "", interval: "month", spaceName: "General", welcomeTitle: "", welcomeBody: "", welcomeEdited: false }
}

/** The address the community will have: what was typed, else the name's. */
export function addressOf(d: Pick<WizardDraft, "name" | "slug">): string {
  return d.slug.trim() ? slugify(d.slug) : slugify(d.name)
}

/** The welcome post written for them, in their language, until they change it. */
export function welcomeFor(name: string): { title: string; body: string } {
  const n = name.trim() || tt("the community")
  return {
    title: tt("Welcome to {name}", { name: n }),
    body: tt("Glad you are here. Start by saying hello in Introductions: who you are and what you want to get out of {name}. Then have a look around and ask anything.", { name: n }),
  }
}

const isPalette = (v: unknown): v is PaletteId => COVER_PALETTES.some((p) => p.id === v)
const https = (v: unknown): string | null => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/i.test(v) && v.length <= 1000 ? v : null)
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "")

/** A draft read back from this browser: anything malformed is left as a new one would have it. */
export function readDraft(text: string | null | undefined): WizardDraft | null {
  if (!text) return null
  let r: Record<string, unknown>
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object") return null
    r = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const e = emptyDraft()
  const step = Number(r.step)
  return {
    step: Number.isInteger(step) && step >= 0 && step < WIZARD_STEPS.length ? step : 0,
    name: str(r.name, LENGTHS.communityName.max),
    slug: str(r.slug, SLUG_MAX),
    slugEdited: r.slugEdited === true && !!str(r.slug, SLUG_MAX),
    description: str(r.description, DESCRIPTION_CHARS),
    logoUrl: https(r.logoUrl),
    coverUrl: https(r.coverUrl),
    palette: isPalette(r.palette) ? r.palette : e.palette,
    type: r.type === "paid" || r.type === "private" ? r.type : "free",
    price: str(r.price, 12),
    interval: r.interval === "year" || r.interval === "once" ? r.interval : "month",
    spaceName: str(r.spaceName, LENGTHS.spaceName.max) || e.spaceName,
    welcomeTitle: str(r.welcomeTitle, LENGTHS.postTitle.max),
    welcomeBody: str(r.welcomeBody, WELCOME_BODY_MAX),
    welcomeEdited: r.welcomeEdited === true,
  }
}

/** Whether a draft has anything in it worth offering back. */
export function draftTouched(d: WizardDraft): boolean {
  return Boolean(d.name.trim() || d.description.trim() || d.logoUrl || d.coverUrl || d.price || d.slug)
}

export type StepCheck = { ok: true } | { ok: false; field: string; error: string }

/** One step's own fields, before Next. */
export function checkWizardStep(step: WizardStep, d: WizardDraft): StepCheck {
  if (step === "name") {
    const name = d.name.replace(/\s+/g, " ").trim()
    if (!name) return { ok: false, field: "name", error: tt("Give your community a name.") }
    if (name.length > LENGTHS.communityName.max) return { ok: false, field: "name", error: tt("A name is up to {max} characters.", { max: LENGTHS.communityName.max }) }
    if (d.slug.trim()) {
      const s = slugify(d.slug)
      if (s.length < SLUG_MIN) return { ok: false, field: "slug", error: tt("An address is at least {min} letters or numbers.", { min: SLUG_MIN }) }
      if (!validSlug(s)) return { ok: false, field: "slug", error: tt("That address is kept for Storelib. Try another.") }
    }
    if (d.description.length > DESCRIPTION_CHARS) return { ok: false, field: "description", error: tt("A description is up to {descriptionChars} characters.", { descriptionChars: DESCRIPTION_CHARS }) }
    return { ok: true }
  }
  if (step === "access" && d.type === "paid") {
    const p = checkPrice(d.price, d.interval)
    if (!p.ok) return { ok: false, field: (p as { field: string }).field, error: (p as { error: string }).error }
  }
  if (step === "welcome") {
    if (!d.spaceName.trim()) return { ok: false, field: "spaceName", error: tt("Name the first space.") }
    if (d.spaceName.trim().length > LENGTHS.spaceName.max) return { ok: false, field: "spaceName", error: tt("A space name is up to {max} characters.", { max: LENGTHS.spaceName.max }) }
    if (d.welcomeTitle.length > LENGTHS.postTitle.max) return { ok: false, field: "welcomeTitle", error: tt("A title is up to {max} characters.", { max: LENGTHS.postTitle.max }) }
    if (d.welcomeBody.length > WELCOME_BODY_MAX) return { ok: false, field: "welcomeBody", error: tt("The welcome post is up to {max} characters.", { max: WELCOME_BODY_MAX }) }
  }
  return { ok: true }
}

/** The first step that does not pass, for Create from the review. */
export function firstProblem(d: WizardDraft): { step: number; check: Exclude<StepCheck, { ok: true }> } | null {
  for (let i = 0; i < WIZARD_STEPS.length; i++) {
    const c = checkWizardStep(WIZARD_STEPS[i], d)
    if (!c.ok) return { step: i, check: c }
  }
  return null
}

export interface WizardInput extends CreateInput {
  slug: string | null
  spaceName: string | null
  welcome: { title: string; body: string } | null
}

type Checked<T> = { ok: true; value: T } | { ok: false; field: string; error: string }

/**
 * What POST /api/app/community reads: the create flow's fields (checkCreate)
 * and, from the wizard, the address asked for, the first space's name and the
 * welcome post. Each of the three is optional, so an older caller is read as
 * it always was.
 */
export function checkWizard(raw: unknown): Checked<WizardInput> {
  const base = checkCreate(raw)
  if (!base.ok) return base as { ok: false; field: string; error: string }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  let slug: string | null = null
  if (typeof r.slug === "string" && r.slug.trim()) {
    slug = slugify(r.slug)
    if (!validSlug(slug)) return { ok: false, field: "slug", error: tt("That address cannot be used. Try another.") }
  }
  const spaceName = typeof r.spaceName === "string" ? r.spaceName.replace(/\s+/g, " ").trim().slice(0, LENGTHS.spaceName.max) || null : null
  const title = typeof r.welcomeTitle === "string" ? r.welcomeTitle.replace(/\s+/g, " ").trim().slice(0, LENGTHS.postTitle.max) : ""
  const body = typeof r.welcomeBody === "string" ? r.welcomeBody.replace(/\r\n?/g, "\n").trim().slice(0, WELCOME_BODY_MAX) : ""
  return { ok: true, value: { ...base.value, slug, spaceName, welcome: title || body ? { title, body } : null } }
}
