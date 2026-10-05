/**
 * ===========================================================================
 *  WORDS A COMMUNITY DOES NOT ALLOW
 * ===========================================================================
 * Two lists are read against every post, comment, chat message and direct
 * message (lib/communities/server/safety.ts screenWrite and screenEdit):
 *
 *   PLATFORM   Storelib's own (./word-blocklist.ts), for every community and
 *              everybody in it, the team included.
 *   COMMUNITY  the owner's, in Moderation, Rules, kept in the community's
 *              settings (communities.onboarding.safety.words), up to
 *              WORD_LIST_MAX words or phrases. It applies to members; the
 *              owner, admins and moderators can still write the words (to
 *              say which ones are not allowed, for one).
 *
 * HOW A WORD MATCHES. Whole words only, so "class" never trips on "ass" and
 * "Scunthorpe" is just a town. A phrase matches its words in a row. A word
 * that ends in * matches every word starting with it ("scam*" finds
 * "scammer"), and needs three letters before the star. The usual ways round
 * a list are read through, for a list word written in plain Latin letters:
 *
 *   case, accents, wide letters    "PÓRN", "ｐｏｒｎ"            read as porn
 *   digits and signs for letters   "p0rn", "a$$", "sh1t"        read as letters
 *   letters from other alphabets   Cyrillic "р" and "о" in porn  read as Latin
 *   letters spelled out            "p o r n", "p.o.r.n"         joined
 *   invisible characters           a zero width space inside     dropped
 *   stretched letters              "pooorn", "asssss"            shortened
 *
 * A word written in another alphabet (an owner's Russian or Greek list) is
 * matched as written, accents and case aside. A word in a language written
 * without spaces (Chinese, Japanese, Thai) matches anywhere in the text.
 *
 * Pure and browser safe: the settings screen uses the same cleaning rules.
 */

export const WORD_LIST_MAX = 200
export const WORD_MAX_CHARS = 60
export const WORD_MAX_WORDS = 5
/** Letters needed before a trailing star, so "a*" can never match half the language. */
export const WORD_PREFIX_MIN = 3

/** What happens to a write with a community list word: refused, or written hidden for a moderator. */
export type WordsAction = "block" | "hold"
export const WORDS_ACTIONS: readonly WordsAction[] = ["block", "hold"]

export interface WordSettings {
  words: string[]
  action: WordsAction
}

/* ── Reading text ───────────────────────────────────────────────────────── */

const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁪-⁯ㅤ︀-️﻿ﾠ]/g
const MARKS = /\p{M}+/gu
/** Scripts written without spaces between words. */
const NO_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u
/** A token: letters, digits, and the signs people put in place of letters. */
const TOKEN = /[\p{L}\p{N}$@!|]+/gu
const NOT_ALNUM = /[^\p{L}\p{N}]+/gu

/**
 * Letters and signs drawn like a Latin letter, mapped to it: Cyrillic and
 * Greek look-alikes, digits and signs. "1", "!" and "|" can be i or l, so
 * they are read both ways (LEET_IL).
 */
const LOOKS_LIKE: Record<string, string> = {
  /* Cyrillic */
  "а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x", "ѕ": "s", "і": "i", "ї": "i", "ј": "j", "ԁ": "d", "ԛ": "q", "ԝ": "w", "һ": "h", "ӏ": "l", "ь": "b", "п": "n", "г": "r",
  /* Greek */
  "α": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x", "γ": "y", "η": "n", "ω": "w",
  /* Digits and signs */
  "0": "o", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "$": "s", "@": "a",
  /* Other Latin look-alikes */
  "ı": "i", "ł": "l", "ⅼ": "l", "ɡ": "g",
}
const LEET_IL = /[1!|]/g

/** Lower case, wide letters made ordinary (NFKC), accents and invisible characters dropped. */
export function plainText(text: string): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(MARKS, "")
    .normalize("NFC")
}

/** A token read as Latin letters: the two readings of 1, ! and | (i and l), anything left that is not a letter or digit dropped. */
function latinReadings(token: string): string[] {
  let mapped = ""
  for (const ch of token) mapped += LOOKS_LIKE[ch] ?? ch
  const out = new Set<string>()
  for (const il of ["i", "l"]) {
    const v = mapped.replace(LEET_IL, il).replace(NOT_ALNUM, "")
    if (v) out.add(v)
  }
  return [...out]
}

/** A stretched word ("pooorn") shortened two ways: runs of three or more to one letter and to two. */
function unstretched(word: string): string[] {
  if (!/(.)\1\1/u.test(word)) return []
  return [word.replace(/(.)\1{2,}/gu, "$1"), word.replace(/(.)\1{2,}/gu, "$1$1")]
}

/** Every way one token of the text may be read: as written, and as Latin letters. */
export interface Readings {
  /** As written (accents and case aside), and unstretched. */
  plain: string[]
  /** Read as Latin letters too (look-alikes, digits and signs), for a Latin entry. */
  all: string[]
}

function readings(token: string): Readings {
  const plain = new Set<string>()
  const base = token.replace(NOT_ALNUM, "")
  if (base) {
    plain.add(base)
    for (const u of unstretched(base)) plain.add(u)
  }
  const all = new Set(plain)
  for (const v of latinReadings(token)) {
    all.add(v)
    for (const u of unstretched(v)) all.add(u)
  }
  return { plain: [...plain], all: [...all] }
}

/** A text, read once, ready for any number of lists. */
export interface ReadText {
  /** The words in order, each with every way it may be read. */
  words: Readings[]
  /** Runs of three or more single characters, joined ("p o r n"). */
  spelled: Readings[]
  /** The whole text with no spaces, for words in scripts written without them. */
  joined: string
}

export function readText(text: string): ReadText {
  const plain = plainText(text)
  const tokens = plain.match(TOKEN) ?? []
  const words = tokens.map(readings).filter((r) => r.all.length > 0)
  const spelled: Readings[] = []
  let run: string[] = []
  const flush = () => {
    if (run.length >= 3) spelled.push(readings(run.join("")))
    run = []
  }
  for (const t of tokens) {
    if ([...t].length === 1) run.push(t)
    else flush()
  }
  flush()
  return { words, spelled, joined: plain.replace(/\s+/gu, "") }
}

/* ── Lists ──────────────────────────────────────────────────────────────── */

interface EntryWord {
  text: string
  prefix: boolean
}

export interface CompiledEntry {
  /** The entry as the list holds it, for the log. */
  entry: string
  /** Its words, or null for an entry matched anywhere in the text (no spaces script). */
  words: EntryWord[] | null
  /** The text an anywhere entry looks for. */
  needle: string
  /** True when every letter is plain Latin, so look-alike readings count. */
  latin: boolean
}

/**
 * One list entry as it is kept: trimmed, lower case, inner spaces single.
 * Null when it is not a word (no letter or digit), too long, too many
 * words, or a star with fewer than WORD_PREFIX_MIN letters before it.
 */
export function cleanWordEntry(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = plainText(raw).replace(/\s+/gu, " ").trim()
  if (!s || s.length > WORD_MAX_CHARS) return null
  const parts = s.split(" ")
  if (parts.length > WORD_MAX_WORDS) return null
  for (const [i, p] of parts.entries()) {
    const star = p.endsWith("*")
    const core = star ? p.slice(0, -1) : p
    if (core.includes("*")) return null
    if (star && (i !== parts.length - 1 || core.replace(NOT_ALNUM, "").length < WORD_PREFIX_MIN)) return null
    if (!core.replace(NOT_ALNUM, "")) return null
  }
  return s
}

/** The words typed into the settings box: one per line or separated by commas. */
export function splitWordInput(text: string): string[] {
  return String(text ?? "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** A whole list from a settings body: each entry cleaned, repeats dropped, or the first entry that cannot be kept. */
export function cleanWordList(raw: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  const list = typeof raw === "string" ? splitWordInput(raw) : Array.isArray(raw) ? raw : null
  if (!list) return { ok: false, error: "Send the words as a list." }
  const out: string[] = []
  for (const item of list) {
    if (typeof item !== "string" || !item.trim()) continue
    const clean = cleanWordEntry(item)
    if (!clean) {
      const shown = String(item).trim().slice(0, 40)
      if (String(item).trim().length > WORD_MAX_CHARS) return { ok: false, error: `"${shown}..." is too long. Keep each one under ${WORD_MAX_CHARS} characters.` }
      if (/\*/.test(item)) return { ok: false, error: `"${shown}": a star goes at the end of the last word, after at least ${WORD_PREFIX_MIN} letters.` }
      if (String(item).trim().split(/\s+/).length > WORD_MAX_WORDS) return { ok: false, error: `"${shown}" is a long phrase. Use up to ${WORD_MAX_WORDS} words.` }
      return { ok: false, error: `"${shown}" is not a word.` }
    }
    if (!out.includes(clean)) out.push(clean)
  }
  if (out.length > WORD_LIST_MAX) return { ok: false, error: `Up to ${WORD_LIST_MAX} words or phrases.` }
  return { ok: true, value: out }
}

export function compileEntry(entry: string): CompiledEntry | null {
  const clean = cleanWordEntry(entry)
  if (!clean) return null
  if (NO_SPACES.test(clean)) return { entry: clean, words: null, needle: clean.replace(/\s+/gu, "").replace(/\*$/, ""), latin: false }
  const words = clean.split(" ").map((p) => {
    const prefix = p.endsWith("*")
    return { text: (prefix ? p.slice(0, -1) : p).replace(NOT_ALNUM, ""), prefix }
  })
  return { entry: clean, words, needle: "", latin: words.every((w) => /^[a-z]+$/.test(w.text)) }
}

export function compileList(entries: readonly string[]): CompiledEntry[] {
  return entries.map(compileEntry).filter((e): e is CompiledEntry => e !== null)
}

function wordMatches(r: Readings, w: EntryWord, latin: boolean): boolean {
  /* Look-alike readings count only for an entry in plain Latin letters. */
  const pool = latin ? r.all : r.plain
  return pool.some((r) => (w.prefix ? r.startsWith(w.text) : r === w.text))
}

/** The entries of a list found in a text, each once, in list order. */
export function findWords(read: ReadText, list: readonly CompiledEntry[]): string[] {
  const found: string[] = []
  for (const e of list) {
    if (!e.words) {
      if (e.needle && read.joined.includes(e.needle)) found.push(e.entry)
      continue
    }
    const ws = e.words
    let hit = false
    for (let i = 0; !hit && i + ws.length <= read.words.length; i++) {
      hit = ws.every((w, j) => wordMatches(read.words[i + j], w, e.latin))
    }
    if (!hit && ws.length === 1) hit = read.spelled.some((r) => wordMatches(r, ws[0], e.latin))
    if (hit) found.push(e.entry)
  }
  return found
}

/* ── A short one way fingerprint, for words not spelled out in the code ─── */

/**
 * cyrb53 (bryc, public domain): a fast 53 bit string hash, as 14 hex digits.
 * Used for the platform's slurs, so the list works without the words being
 * written out in the code (./word-blocklist.ts). Not a secret: anybody can
 * hash a guess. It only keeps the file readable.
 */
export function wordPrint(word: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < word.length; i++) {
    const ch = word.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0")
}

/** Whether any single word of the text, in any of its readings, has one of these fingerprints. */
export function hasPrintedWord(read: ReadText, prints: ReadonlySet<string>): boolean {
  if (!prints.size) return false
  for (const r of [...read.words, ...read.spelled]) for (const v of r.all) if (prints.has(wordPrint(v))) return true
  return false
}

/* ── Where the community's list lives ──────────────────────────────────── */

/** The community's list and what it does, from its settings (communities.onboarding.safety). */
export function wordSettingsOf(onboarding: unknown): WordSettings {
  const safety = onboarding && typeof onboarding === "object" ? (onboarding as { safety?: unknown }).safety : null
  const s = safety && typeof safety === "object" ? (safety as { words?: unknown; wordsAction?: unknown }) : {}
  const words = Array.isArray(s.words) ? s.words.filter((w): w is string => typeof w === "string").slice(0, WORD_LIST_MAX) : []
  const action: WordsAction = s.wordsAction === "hold" ? "hold" : "block"
  return { words, action }
}

/** The settings with this list, keeping everything else in them (slow mode, the welcome steps). */
export function withWordSettings(onboarding: unknown, s: WordSettings): Record<string, unknown> {
  const base = onboarding && typeof onboarding === "object" ? (onboarding as Record<string, unknown>) : {}
  const safety = base.safety && typeof base.safety === "object" ? (base.safety as Record<string, unknown>) : {}
  return { ...base, safety: { ...safety, words: s.words, wordsAction: s.action } }
}
