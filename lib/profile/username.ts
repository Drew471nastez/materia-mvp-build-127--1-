import { isValidUsername } from "@/lib/reserved-words"

/**
 * ===========================================================================
 *  TURNING A NAME INTO A HANDLE
 * ===========================================================================
 *
 * "Andrew Rullz" has to become "andrewrullz", and it has to do so the same way
 * on the client — where the field fills itself in as you type — and on the
 * server, which is the only place that decides. Two implementations of this
 * would mean a form that shows you one handle and saves another.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE RULES ACTUALLY ARE
 * ---------------------------------------------------------------------------
 * `isValidUsername` in lib/reserved-words.ts already owns them and this does not
 * restate them: lowercase letters, digits and dashes, 3 to 30, no leading,
 * trailing or doubled dash, and not a reserved word. This is the transformation
 * that gets an arbitrary human name INTO that shape, and then the validator is
 * still the one that says yes.
 *
 * Diacritics are folded rather than dropped. "Ștefan Mureșan" becoming
 * "tefanmurean" is the kind of mangling that makes somebody give up on the
 * suggestion and type their own — on a Romanian marketplace it would be most
 * accounts.
 *
 * NFD is what does it, and it does it on its own: normalising splits "Ș" into
 * "S" plus a combining mark, and the character class below then removes the
 * mark along with everything else that is not a handle character. There is no
 * separate strip-the-marks step, because there does not need to be — an
 * explicit one was written here first and deleting it changed no output, which
 * is the definition of a line that is not doing anything.
 *
 * Spaces close up rather than becoming dashes. It is what people expect from a
 * handle, and "andrew-rullz" reads as two words where "andrewrullz" reads as a
 * name. Dashes somebody TYPED are kept, because those are a choice.
 */
export function slugifyUsername(input: string): string {
  return (
    input
      .normalize("NFD")
      .toLowerCase()
      // Everything that is not a handle character goes, INCLUDING spaces —
      // which is the whole of "the username should not have spaces".
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30)
  )
}

/**
 * A handle that is at least legal, if not necessarily free.
 *
 * A name of one or two characters, or one written entirely in a script this
 * strips, leaves nothing behind — and an empty handle is not something the
 * caller can do anything with. `user` plus the seed's digits is the same answer
 * every platform lands on for the same reason.
 */
export function baseUsernameFor(name: string, seed?: string): string {
  const slug = slugifyUsername(name)
  if (isValidUsername(slug).valid) return slug
  if (slug.length >= 3) {
    // Long enough but refused for another reason — reserved, most likely. The
    // suffix below is what resolves that, and it is applied by the caller.
    return slug
  }
  const digits = (seed ?? "").replace(/[^0-9]/g, "").slice(0, 6)
  return `user${digits || Math.abs(hash(seed ?? name)) % 100000}`
}

/**
 * Deterministic, so the same account is offered the same fallback twice.
 * `Math.random()` here would mean a suggestion that changes while you look at
 * it.
 */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

/**
 * Candidates to offer when the handle somebody wants is gone.
 *
 * Numbers first, because that is what people take. Then the two shapes that
 * read as a deliberate handle rather than as a consolation prize: a dash before
 * the last word, and the word "real" — both of which are what the platforms
 * this is modelled on suggest, and both of which somebody might actually keep.
 *
 * The base is trimmed before a suffix is added so the result cannot exceed the
 * 30-character limit and be refused after being offered.
 */
export function usernameSuggestions(base: string, name?: string): string[] {
  const root = slugifyUsername(base) || "user"
  const words = slugifyUsername(name ?? "")
  const out: string[] = []

  const add = (candidate: string) => {
    const v = candidate.slice(0, 30).replace(/-+$/g, "")
    if (v.length >= 3 && isValidUsername(v).valid && !out.includes(v)) out.push(v)
  }

  const trimmedTo = (n: number) => root.slice(0, Math.max(1, 30 - n))

  for (const n of [1, 2, 7, 21, 99]) {
    const suffix = String(n)
    add(`${trimmedTo(suffix.length)}${suffix}`)
  }
  add(`${trimmedTo(5)}-real`)
  if (words && words !== root) add(words)
  add(`${trimmedTo(3)}.ro`.replace(/\./g, ""))

  return out.slice(0, 5)
}
