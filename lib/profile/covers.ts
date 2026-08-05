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
 * Each is one soft radial highlight over a two-stop base, which is what gives
 * them depth rather than the flat ramp that reads as a placeholder. They are
 * chosen to sit under a white avatar ring and white glass controls without
 * either fighting: mid-to-deep, never pastel and never black.
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
  // Twelve, and quieter than the eight they replace.
  //
  // The first set was built to be obviously colourful, and on a profile that is
  // the wrong target: a cover is a BACKDROP for a photograph of a person, a
  // name, and a row of controls, and the more it does the less any of those
  // read. Three fully saturated stops fighting each other is a banner competing
  // with the thing it is behind.
  //
  // So each of these is one soft highlight over a two-stop base, in a narrower
  // band of lightness — deep enough that the white avatar ring and the glass
  // buttons stay legible, far enough from black that it never looks like a
  // placeholder that failed to load. Named after the thing they look like
  // rather than after a colour, which is how anybody actually picks one.
  {
    id: "iris",
    label: "Iris",
    css:
      "radial-gradient(115% 120% at 12% 0%, rgba(196,181,253,0.55) 0%, rgba(196,181,253,0) 58%)," +
      "linear-gradient(145deg, #7c5cd6 0%, #4c3a94 100%)",
  },
  {
    id: "zori",
    label: "Zori",
    css:
      "radial-gradient(120% 120% at 85% 5%, rgba(253,186,164,0.55) 0%, rgba(253,186,164,0) 58%)," +
      "linear-gradient(150deg, #c4677e 0%, #6d3557 100%)",
  },
  {
    id: "golf",
    label: "Golf",
    css:
      "radial-gradient(115% 125% at 18% 8%, rgba(125,211,252,0.5) 0%, rgba(125,211,252,0) 58%)," +
      "linear-gradient(150deg, #2b7a9b 0%, #1b3a5c 100%)",
  },
  {
    id: "cedru",
    label: "Cedru",
    css:
      "radial-gradient(118% 120% at 15% 0%, rgba(190,225,175,0.45) 0%, rgba(190,225,175,0) 56%)," +
      "linear-gradient(150deg, #4a7f5c 0%, #24402f 100%)",
  },
  {
    id: "chihlimbar",
    label: "Chihlimbar",
    css:
      "radial-gradient(120% 120% at 20% 0%, rgba(253,224,171,0.6) 0%, rgba(253,224,171,0) 55%)," +
      "linear-gradient(150deg, #c07a3e 0%, #6b3d24 100%)",
  },
  {
    id: "grafit",
    label: "Grafit",
    css:
      "radial-gradient(120% 120% at 14% 4%, rgba(203,213,225,0.35) 0%, rgba(203,213,225,0) 58%)," +
      "linear-gradient(150deg, #4b5563 0%, #232a35 100%)",
  },
  {
    id: "piatra",
    label: "Piatră",
    css:
      "radial-gradient(120% 120% at 82% 6%, rgba(231,215,196,0.5) 0%, rgba(231,215,196,0) 58%)," +
      "linear-gradient(150deg, #8a7461 0%, #453930 100%)",
  },
  {
    id: "ceata",
    label: "Ceață",
    css:
      "radial-gradient(120% 125% at 16% 0%, rgba(214,228,240,0.5) 0%, rgba(214,228,240,0) 58%)," +
      "linear-gradient(150deg, #64748b 0%, #33414f 100%)",
  },
  {
    id: "pruna",
    label: "Prună",
    css:
      "radial-gradient(115% 120% at 88% 8%, rgba(232,164,200,0.5) 0%, rgba(232,164,200,0) 56%)," +
      "linear-gradient(150deg, #8e3f74 0%, #45204a 100%)",
  },
  {
    id: "cobalt",
    label: "Cobalt",
    css:
      "radial-gradient(118% 120% at 14% 2%, rgba(165,180,252,0.5) 0%, rgba(165,180,252,0) 58%)," +
      "linear-gradient(150deg, #3d5bbd 0%, #1e2a63 100%)",
  },
  {
    id: "menta",
    label: "Mentă",
    css:
      "radial-gradient(120% 120% at 84% 4%, rgba(167,232,214,0.5) 0%, rgba(167,232,214,0) 58%)," +
      "linear-gradient(150deg, #2f8878 0%, #17403c 100%)",
  },
  {
    id: "carbune",
    label: "Cărbune",
    css:
      "radial-gradient(120% 120% at 50% 0%, rgba(148,163,184,0.28) 0%, rgba(148,163,184,0) 60%)," +
      "linear-gradient(150deg, #33373d 0%, #17191c 100%)",
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
