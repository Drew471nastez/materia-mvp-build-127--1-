/**
 * The band of colour behind every profile.
 *
 * ---------------------------------------------------------------------------
 * Why every account starts with one
 * ---------------------------------------------------------------------------
 * A profile with an empty cover is a profile that looks unfinished, and the
 * person it belongs to did nothing wrong — they simply have not uploaded a
 * photograph of a bridge. Worse, an empty band is a hole the eye reads as a
 * failed image load, so a brand-new account's first impression of the app is a
 * screen that appears to be broken. Every serious profile surface solves this
 * the same way: give it something by default, and let anyone who cares replace
 * it.
 *
 * ---------------------------------------------------------------------------
 * Why gradients rather than stock photographs
 * ---------------------------------------------------------------------------
 * Photographs would mean shipping image files, downloading them on a phone
 * before the profile can paint, and every account without a cover looking like
 * the same eight accounts. These are drawn by the browser: zero bytes over the
 * network, correct at any size and any pixel density, no decode, and nothing to
 * fail. They also cannot be wrong — a stock photo of a beach on the profile of
 * somebody selling winter coats is a small, constant mismatch that a colour
 * field never has.
 *
 * Each is built from overlapping radial gradients over a base, which is what
 * gives them depth rather than the flat two-stop ramp that reads as a
 * placeholder. They are chosen to sit under WHITE text and a white avatar ring
 * without either fighting: mid-to-deep, never pastel and never black.
 *
 * ---------------------------------------------------------------------------
 * How a cover is stored
 * ---------------------------------------------------------------------------
 * One nullable `profiles.cover_url` column, holding one of three things:
 *
 *   null              → the preset picked for this account by `defaultCoverFor`
 *   "preset:<id>"     → a preset the person chose deliberately
 *   "https://…"       → an image they uploaded
 *
 * Null and "preset:x" are deliberately different states even when they render
 * identically. Null means "never decided", so improving the default set later
 * moves everybody who never cared; an explicit preset is a choice, and a choice
 * must not be silently changed underneath somebody.
 */

export type CoverPreset = {
  id: string
  /** Shown in the picker. */
  label: string
  /** A complete `background` value — layers and base colour in one. */
  css: string
}

export const COVER_PRESETS: CoverPreset[] = [
  {
    id: "iris",
    label: "Iris",
    css:
      "radial-gradient(120% 120% at 8% 0%, rgba(167,139,250,0.95) 0%, rgba(167,139,250,0) 55%)," +
      "radial-gradient(100% 130% at 92% 15%, rgba(236,72,153,0.55) 0%, rgba(236,72,153,0) 60%)," +
      "linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%)",
  },
  {
    id: "dusk",
    label: "Amurg",
    css:
      "radial-gradient(110% 130% at 85% 0%, rgba(251,146,60,0.85) 0%, rgba(251,146,60,0) 58%)," +
      "radial-gradient(120% 120% at 5% 100%, rgba(124,58,237,0.75) 0%, rgba(124,58,237,0) 62%)," +
      "linear-gradient(160deg, #db2777 0%, #7c2d92 100%)",
  },
  {
    id: "atlantic",
    label: "Atlantic",
    css:
      "radial-gradient(120% 120% at 15% 10%, rgba(56,189,248,0.85) 0%, rgba(56,189,248,0) 55%)," +
      "radial-gradient(110% 120% at 95% 90%, rgba(45,212,191,0.6) 0%, rgba(45,212,191,0) 60%)," +
      "linear-gradient(140deg, #0369a1 0%, #0f2f57 100%)",
  },
  {
    id: "moss",
    label: "Mușchi",
    css:
      "radial-gradient(120% 130% at 10% 0%, rgba(163,230,53,0.7) 0%, rgba(163,230,53,0) 55%)," +
      "radial-gradient(110% 120% at 90% 100%, rgba(20,184,166,0.55) 0%, rgba(20,184,166,0) 58%)," +
      "linear-gradient(150deg, #15803d 0%, #14312a 100%)",
  },
  {
    id: "ember",
    label: "Jar",
    css:
      "radial-gradient(120% 120% at 20% 0%, rgba(251,191,36,0.85) 0%, rgba(251,191,36,0) 52%)," +
      "radial-gradient(120% 130% at 88% 95%, rgba(220,38,38,0.7) 0%, rgba(220,38,38,0) 60%)," +
      "linear-gradient(145deg, #c2410c 0%, #5b1a12 100%)",
  },
  {
    id: "slate",
    label: "Ardezie",
    css:
      "radial-gradient(120% 120% at 12% 5%, rgba(148,163,184,0.6) 0%, rgba(148,163,184,0) 55%)," +
      "radial-gradient(110% 120% at 92% 95%, rgba(99,102,241,0.5) 0%, rgba(99,102,241,0) 58%)," +
      "linear-gradient(150deg, #334155 0%, #16202e 100%)",
  },
  {
    id: "bloom",
    label: "Petale",
    css:
      "radial-gradient(115% 125% at 88% 5%, rgba(244,114,182,0.85) 0%, rgba(244,114,182,0) 55%)," +
      "radial-gradient(120% 120% at 8% 92%, rgba(129,140,248,0.65) 0%, rgba(129,140,248,0) 58%)," +
      "linear-gradient(140deg, #9d174d 0%, #4a1d5e 100%)",
  },
  {
    id: "sand",
    label: "Nisip",
    css:
      "radial-gradient(120% 120% at 15% 0%, rgba(253,224,71,0.7) 0%, rgba(253,224,71,0) 52%)," +
      "radial-gradient(110% 130% at 95% 100%, rgba(217,119,6,0.6) 0%, rgba(217,119,6,0) 60%)," +
      "linear-gradient(150deg, #a16207 0%, #4a2c10 100%)",
  },
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

export type Cover = { kind: "image"; url: string } | { kind: "preset"; preset: CoverPreset }

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
  if (raw.startsWith("preset:")) {
    const found = BY_ID.get(raw.slice("preset:".length))
    if (found) return { kind: "preset", preset: found }
  }
  return { kind: "preset", preset: defaultCoverFor(userId) }
}

/** The longest a bio may be. Long enough for three sentences, short enough that
 *  the header stays a header rather than becoming a page of its own. */
export const MAX_BIO_CHARS = 240

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
