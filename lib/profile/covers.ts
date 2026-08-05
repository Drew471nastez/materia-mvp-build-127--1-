/**
 * The band behind every profile.
 *
 * ---------------------------------------------------------------------------
 * Why every account starts with one
 * ---------------------------------------------------------------------------
 * A profile with an empty cover looks unfinished, and the person it belongs to
 * did nothing wrong — they simply have not uploaded a photograph of a bridge.
 * Worse, an empty band is a hole the eye reads as a failed image load, so a new
 * account's first impression of the app is a screen that appears broken.
 *
 * ---------------------------------------------------------------------------
 * PHOTOGRAPHS, replacing the gradients that were here
 * ---------------------------------------------------------------------------
 * The first library was twelve gradients, and the case for them was real: zero
 * bytes over the network, correct at any density, nothing to decode, nothing to
 * fail. It was also the wrong answer for this product. A gradient says nothing
 * about a second-hand fashion marketplace, and a person picking a cover for
 * their shop is not choosing a colour — they are choosing an image of the thing
 * they sell. Twelve colour fields are twelve ways of having no cover.
 *
 * These are from Unsplash, whose licence permits commercial use without
 * permission or attribution, and whose CDN is already a configured image host
 * for this project. They are chosen on three rules:
 *
 *   NO FACES. A stranger's portrait on your own profile is somebody else's
 *   picture pretending to be yours, and the default cover — the one an account
 *   gets before it has chosen anything — must never be a photograph of a person
 *   who is not them.
 *
 *   Clothing, fabric and shops only, so a cover is always about what this
 *   marketplace is for.
 *
 *   A quiet upper band. The avatar, the name and the four glass controls all
 *   sit against the top of this image, so anything busy up there is a cover
 *   that fights the page it belongs to.
 *
 * ---------------------------------------------------------------------------
 * The tint, and why every entry carries one
 * ---------------------------------------------------------------------------
 * A photograph has to be fetched and decoded, and until it is the band would be
 * a grey box that then fills in — which is exactly the "empty space, then the
 * image loads badly" a cover is supposed to avoid. So each entry also carries
 * the image's own mean colour, darkened a fifth. That is painted immediately,
 * costs nothing, and the photograph dissolves into it: the band is the right
 * colour from the first frame, and an image that is slow — or never arrives —
 * degrades to a plausible version of itself rather than to a hole.
 *
 * Measured from the files rather than picked by eye, so a swapped photograph
 * cannot quietly keep the previous one's colour.
 *
 * ---------------------------------------------------------------------------
 * How a cover is stored
 * ---------------------------------------------------------------------------
 * One nullable `profiles.cover_url` column, holding one of three things:
 *
 *   null          → the library entry this account id resolves to
 *   "lib:<id>"    → an entry chosen deliberately
 *   "https://…"   → an image they uploaded
 *
 * Null and "lib:x" stay different states even when they render identically.
 * Null means "never decided", so improving the library later moves everybody
 * who never cared; an explicit choice must not be changed underneath somebody.
 *
 * Values written by the gradient version ("preset:iris" and the rest) resolve
 * to the account default rather than to nothing — an unrecognised string must
 * never cost a profile its cover.
 */

export type CoverPreset = {
  id: string
  /** Shown in the picker. */
  label: string
  /** Unsplash photo id, without the CDN prefix. */
  photo: string
  /** The image's own mean colour, darkened — painted under it while it loads. */
  tint: string
}

/** Sized for the band it fills, and served in whatever format the browser
 *  prefers. Composed in one place so a change of width or quality cannot apply
 *  to the picker and not to the profile. */
export function coverImageUrl(preset: CoverPreset, width = 1200): string {
  return `https://images.unsplash.com/photo-${preset.photo}?w=${width}&q=72&auto=format&fit=crop`
}

export const COVER_PRESETS: CoverPreset[] = [
  { id: "umerase", label: "Umerașe", photo: "1490481651871-ab68de25d43d", tint: "#9d948e" },
  { id: "tinuta", label: "Ținută", photo: "1479064555552-3ef4979f8908", tint: "#aca6a4" },
  { id: "tricotaj", label: "Tricotaj", photo: "1434389677669-e08b4cac3105", tint: "#a59e96" },
  { id: "denim", label: "Denim", photo: "1525507119028-ed4c629a60a3", tint: "#6f6867" },
  { id: "dantela", label: "Dantelă", photo: "1509319117193-57bab727e09d", tint: "#7f7872" },
  { id: "neutre", label: "Neutre", photo: "1558769132-cb1aea458c5e", tint: "#88776d" },
  { id: "bumbac", label: "Bumbac", photo: "1523381210434-271e8be1f52b", tint: "#535b56" },
  { id: "culori", label: "Culori", photo: "1489987707025-afc232f7ea0f", tint: "#6e564c" },
  { id: "boutique", label: "Boutique", photo: "1445205170230-053b83016050", tint: "#5e5138" },
  { id: "atelier", label: "Atelier", photo: "1441986300917-64674bd600d8", tint: "#3b3333" },
  { id: "dressing", label: "Dressing", photo: "1567401893414-76b7b1e5a7a5", tint: "#403932" },
  { id: "galben", label: "Galben", photo: "1515886657613-9f3515b0c78f", tint: "#908d62" },
]

const BY_ID = new Map(COVER_PRESETS.map((p) => [p.id, p]))

/**
 * Which preset an account gets when it has never chosen one.
 *
 * Derived from the id rather than picked at random, so a profile looks the same
 * on every device, on every visit, and to everybody — a cover that changed on
 * each load would be the most distracting thing on the screen. FNV-1a because
 * it is four lines and spreads short similar strings (which uuids are) evenly;
 * nothing here is security-sensitive.
 */
export function defaultCoverFor(userId: string): CoverPreset {
  let h = 0x811c9dc5
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return COVER_PRESETS[h % COVER_PRESETS.length]
}

export type Cover =
  /** An upload of their own. */
  | { kind: "image"; url: string }
  /** One of the library photographs, with the colour to paint under it. */
  | { kind: "preset"; preset: CoverPreset }

/**
 * What to actually draw, from whatever is in the column.
 *
 * Every unrecognised value falls back to the account's default rather than to
 * nothing: a preset that has been retired, a half-written row, a column that
 * does not exist in this database yet. A profile must never render a hole
 * because of a string it did not understand.
 */
export function resolveCover(coverUrl: string | null | undefined, userId: string): Cover {
  const raw = typeof coverUrl === "string" ? coverUrl.trim() : ""
  if (raw.startsWith("http://") || raw.startsWith("https://")) return { kind: "image", url: raw }
  // `lib:` is the current form. `preset:` was the gradient library's, and the
  // ids do not carry over — anything it names is gone, so those accounts fall
  // through to their default, which is the same thing "never chose one" gets.
  if (raw.startsWith("lib:")) {
    const found = BY_ID.get(raw.slice("lib:".length))
    if (found) return { kind: "preset", preset: found }
  }
  return { kind: "preset", preset: defaultCoverFor(userId) }
}

/** The longest a bio may be. Long enough for three sentences, short enough that
 *  the header stays a header rather than becoming a page of its own. */
export const MAX_BIO_CHARS = 240

/** A display name is one line. Long enough for a full name or a shop name,
 *  short enough that the header cannot be pushed onto three lines. */
export const MAX_NAME_CHARS = 40

/** One line, always — newlines pasted in from anywhere become spaces rather
 *  than turning a heading into a paragraph. */
export function normaliseName(input: unknown): string {
  if (typeof input !== "string") return ""
  return input.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_CHARS)
}

/** Normalised the same way on the server and in the editor's counter, so the
 *  count somebody is typing against is the count that will be enforced. */
export function normaliseBio(input: unknown): string {
  if (typeof input !== "string") return ""
  return input
    .replace(/\r\n/g, "\n")
    // Three blank lines in a bio is somebody pushing their text off the card.
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_BIO_CHARS)
}
