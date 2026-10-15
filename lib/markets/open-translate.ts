import "server-only"

/**
 * ===========================================================================
 *  TRANSLATED BY OPEN MODELS, KEPT FOR GOOD
 * ===========================================================================
 * The website's texts are translated by free, open source models rather than
 * a paid chat model:
 *
 *   LibreTranslate   LIBRETRANSLATE_URL (your own server, `docker run
 *                    libretranslate/libretranslate`, or a hosted one), plus
 *                    LIBRETRANSLATE_API_KEY when that server asks for one.
 *                    Argos Translate's models, MIT and CC0. Long texts go
 *                    with source "auto", so a text already written in
 *                    another language is detected and translated from it.
 *   Hugging Face     HF_TOKEN (a free access token). Helsinki-NLP's opus-mt
 *                    model for the pair when there is one, else Meta's NLLB
 *                    200 (HF_TRANSLATE_MODEL to choose another).
 *
 * The first one set up is used, and the next one when a batch fails on it.
 *
 * Only the words are sent (./translate-segments.ts): HTML, Liquid,
 * placeholders, links, e-mail addresses and the store's name stay exactly as
 * they were. Every run of words translated is kept in translation_memory
 * (SQL part 178), for every store, so the same words are never sent twice;
 * without part 178 nothing is kept and everything still works.
 */
import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { baseLanguage } from "./locales"
import { cut, join, wordsOf, type Part } from "./translate-segments"

export type OpenProvider = "libretranslate" | "huggingface"

const env = (k: string) => (process.env[k] ?? "").trim()

/** The open translators set up on this Storelib, first choice first. */
export function openProviders(): OpenProvider[] {
  const out: OpenProvider[] = []
  if (env("LIBRETRANSLATE_URL")) out.push("libretranslate")
  if (env("HF_TOKEN") || env("HUGGINGFACE_API_KEY")) out.push("huggingface")
  return out
}

export const canTranslateOpen = () => openProviders().length > 0

/* ------------------------------------------------------------------ codes */

/** LibreTranslate's code for a website language ("pt-BR" is "pb", Traditional Chinese "zt"). */
export function libreCode(locale: string): string {
  if (locale === "pt-BR") return "pb"
  if (locale === "zh-Hant" || locale === "zh-TW" || locale === "zh-HK") return "zt"
  if (locale === "zh-Hans" || locale === "zh-CN") return "zh"
  if (baseLanguage(locale) === "fil") return "tl"
  return baseLanguage(locale)
}

/** NLLB 200's FLORES code for a website language. */
const FLORES: Record<string, string> = {
  en: "eng_Latn", es: "spa_Latn", fr: "fra_Latn", de: "deu_Latn", it: "ita_Latn", pt: "por_Latn", nl: "nld_Latn", ro: "ron_Latn",
  pl: "pol_Latn", cs: "ces_Latn", sk: "slk_Latn", hu: "hun_Latn", bg: "bul_Cyrl", el: "ell_Grek", hr: "hrv_Latn", sl: "slv_Latn",
  sr: "srp_Cyrl", sv: "swe_Latn", da: "dan_Latn", nb: "nob_Latn", no: "nob_Latn", fi: "fin_Latn", et: "est_Latn", lv: "lvs_Latn",
  lt: "lit_Latn", uk: "ukr_Cyrl", ru: "rus_Cyrl", tr: "tur_Latn", ar: "arb_Arab", he: "heb_Hebr", fa: "pes_Arab", hi: "hin_Deva",
  bn: "ben_Beng", ur: "urd_Arab", th: "tha_Thai", vi: "vie_Latn", id: "ind_Latn", ms: "zsm_Latn", fil: "tgl_Latn", ja: "jpn_Jpan",
  ko: "kor_Hang", ca: "cat_Latn", ga: "gle_Latn", is: "isl_Latn", sq: "als_Latn", mk: "mkd_Cyrl", ka: "kat_Geor", hy: "hye_Armn",
  az: "azj_Latn", kk: "kaz_Cyrl", sw: "swh_Latn", af: "afr_Latn", ta: "tam_Taml", te: "tel_Telu", mr: "mar_Deva", gu: "guj_Gujr",
}
export function floresCode(locale: string): string | null {
  if (locale === "zh-Hant" || locale === "zh-TW" || locale === "zh-HK") return "zho_Hant"
  if (baseLanguage(locale) === "zh") return "zho_Hans"
  return FLORES[baseLanguage(locale)] ?? null
}

/* ----------------------------------------------------------------- memory */

const hash = (s: string) => createHash("sha256").update(s).digest("hex")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let memoryDb: any = null
let memoryOff = false
function memory() {
  if (memoryOff) return null
  try {
    memoryDb ??= createAdminClient()
    return memoryDb
  } catch {
    memoryOff = true
    return null
  }
}

/** Words translated before, from translation_memory; an empty map without part 178. */
async function recall(from: string, to: string, words: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const db = memory()
  if (!db || words.length === 0) return out
  const byHash = new Map(words.map((w) => [hash(w), w]))
  const hashes = [...byHash.keys()]
  for (let at = 0; at < hashes.length; at += 200) {
    const { data, error } = await db.from("translation_memory").select("source_hash, translated").eq("source_lang", from).eq("target_lang", to).in("source_hash", hashes.slice(at, at + 200)).then(
      (r: { data: unknown; error: unknown }) => r,
      (e: unknown) => ({ data: null, error: e }),
    )
    if (error) return out
    for (const r of (data ?? []) as { source_hash: string; translated: string }[]) {
      const w = byHash.get(r.source_hash)
      if (w !== undefined && r.translated) out.set(w, r.translated)
    }
  }
  return out
}

/** Keeps what was translated, for good. Best effort: a failure here never fails the translation. */
async function remember(from: string, to: string, pairs: [string, string][], provider: OpenProvider): Promise<void> {
  const db = memory()
  if (!db || pairs.length === 0) return
  const now = new Date().toISOString()
  const rows = pairs.filter(([w, t]) => w.length <= 20000 && t.length <= 40000).map(([w, t]) => ({ source_lang: from, target_lang: to, source_hash: hash(w), source_text: w, translated: t, provider, used_at: now }))
  for (let at = 0; at < rows.length; at += 200) {
    await db.from("translation_memory").upsert(rows.slice(at, at + 200), { onConflict: "source_lang,target_lang,source_hash" }).then(
      () => undefined,
      () => undefined,
    )
  }
}

/* -------------------------------------------------------------- providers */

class Refused extends Error {
  constructor(
    message: string,
    /** "language": this pair is not offered; "setup": the provider refused us (key, address); "busy": try later. */
    readonly kind: "language" | "setup" | "busy" | "failed",
  ) {
    super(message)
  }
}

async function post(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    throw new Refused(e instanceof Error && e.name === "TimeoutError" ? "timed out" : "could not be reached", "busy")
  }
  const text = await res.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    /* not JSON: said below by status */
  }
  if (res.ok) return json
  const said = (json as { error?: unknown } | null)?.error
  const message = typeof said === "string" ? said : `HTTP ${res.status}`
  if (res.status === 401 || res.status === 403) throw new Refused(message, "setup")
  if (res.status === 404) throw new Refused(message, "language")
  if (res.status === 400 && /language|not supported|is not available|src_lang|tgt_lang/i.test(message)) throw new Refused(message, "language")
  if (res.status === 429 || res.status === 503 || res.status >= 500) throw new Refused(message, "busy")
  throw new Refused(message, "failed")
}

let libreLanguages: { at: number; codes: Set<string> } | null = null

/** The language codes the LibreTranslate server offers, read once an hour; null when it would not say. */
async function libreOffers(): Promise<Set<string> | null> {
  if (libreLanguages && Date.now() - libreLanguages.at < 3_600_000) return libreLanguages.codes
  try {
    const res = await fetch(`${env("LIBRETRANSLATE_URL").replace(/\/+$/, "")}/languages`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const list = (await res.json()) as { code?: string; targets?: string[] }[]
    const codes = new Set<string>()
    for (const l of list) {
      if (l.code) codes.add(l.code)
      for (const t of l.targets ?? []) codes.add(t)
    }
    libreLanguages = { at: Date.now(), codes }
    return codes
  } catch {
    return null
  }
}

/** One batch through LibreTranslate. `source` "auto": it detects the language itself. */
async function libreBatch(texts: string[], source: string, target: string, timeoutMs: number): Promise<string[]> {
  const key = env("LIBRETRANSLATE_API_KEY")
  const json = (await post(`${env("LIBRETRANSLATE_URL").replace(/\/+$/, "")}/translate`, { q: texts, source, target, format: "text", ...(key ? { api_key: key } : {}) }, {}, timeoutMs)) as { translatedText?: unknown }
  const t = json?.translatedText
  const out = Array.isArray(t) ? t : typeof t === "string" && texts.length === 1 ? [t] : null
  if (!out || out.length !== texts.length) throw new Refused("answered in an unexpected shape", "failed")
  return out.map((x) => (typeof x === "string" ? x : ""))
}

const HF_BASE = () => env("HF_INFERENCE_URL").replace(/\/+$/, "") || "https://router.huggingface.co/hf-inference/models"
/** Pairs whose opus-mt model is not there, so the next batch goes straight to NLLB. */
const noOpus = new Set<string>()

async function hfCall(model: string, texts: string[], params: Record<string, string> | null, timeoutMs: number): Promise<string[]> {
  const token = env("HF_TOKEN") || env("HUGGINGFACE_API_KEY")
  const json = await post(`${HF_BASE()}/${model}`, { inputs: texts, ...(params ? { parameters: params } : {}) }, { Authorization: `Bearer ${token}`, "x-wait-for-model": "true" }, timeoutMs)
  const list = (Array.isArray(json) ? json : []).map((r) => (Array.isArray(r) ? r[0] : r)) as { translation_text?: unknown }[]
  if (list.length !== texts.length) throw new Refused("answered in an unexpected shape", "failed")
  return list.map((r) => (typeof r?.translation_text === "string" ? r.translation_text : ""))
}

/** One batch through Hugging Face: the pair's opus-mt model, else NLLB 200. */
async function hfBatch(texts: string[], from: string, to: string, timeoutMs: number): Promise<string[]> {
  const chosen = env("HF_TRANSLATE_MODEL")
  const nllb = async (model: string) => {
    const src = floresCode(from)
    const tgt = floresCode(to)
    if (!src || !tgt) throw new Refused("language not offered", "language")
    return hfCall(model, texts, { src_lang: src, tgt_lang: tgt }, timeoutMs)
  }
  if (chosen) return /nllb|m2m|madlad/i.test(chosen) ? nllb(chosen) : hfCall(chosen, texts, null, timeoutMs)
  const pair = `${baseLanguage(from)}-${baseLanguage(to)}`
  if (!noOpus.has(pair) && !to.includes("-") && from !== "auto") {
    try {
      return await hfCall(`Helsinki-NLP/opus-mt-${pair}`, texts, null, timeoutMs)
    } catch (e) {
      if (!(e instanceof Refused) || (e.kind !== "language" && e.kind !== "failed")) throw e
      noOpus.add(pair)
    }
  }
  return nllb("facebook/nllb-200-distilled-600M")
}

/* ------------------------------------------------------------------ press */

/** A batch: at most this many runs of words, or this many characters. */
const BATCH_ITEMS = 50
const BATCH_CHARS = 5_000
/** Texts this long or longer are sent to LibreTranslate with source "auto": long enough to detect their language well. */
const DETECT_FROM = 40

export interface OpenResult {
  /** Each text's translation, by its index in the input; missing when it could not be translated now. */
  out: Map<number, string>
  /** Nothing is set up, or every provider refused: the reason, in the merchant's words. */
  unavailable: string | null
  /** How many runs of words came from translation_memory. */
  remembered: number
}

export const OPEN_NOT_SET_UP = "Automatic translation isn't set up on Storelib yet. You can still write each translation yourself."

/**
 * Translates `texts` from `from` into `to`, keeping `keep` (the store's
 * name) as written. No batch starts after `deadlineAt`.
 */
export async function translateOpen(texts: string[], from: string, to: string, opts: { keep?: string[]; deadlineAt?: number; concurrency?: number } = {}): Promise<OpenResult> {
  const out = new Map<number, string>()
  const providers = openProviders()
  if (providers.length === 0) return { out, unavailable: OPEN_NOT_SET_UP, remembered: 0 }
  const parts: Part[][] = texts.map((t) => cut(t, opts.keep ?? []))
  const all = [...new Set(parts.flatMap(wordsOf))]
  const done = await recall(from, to, all)
  const remembered = done.size
  const todo = all.filter((w) => !done.has(w))

  /* Long runs are detected by LibreTranslate; short ones (labels, buttons) go from the language they are known to be in. */
  type Batch = { words: string[]; source: string }
  const batches: Batch[] = []
  const pack = (words: string[], source: string) => {
    let b: string[] = []
    let size = 0
    for (const w of words) {
      if (b.length && (b.length >= BATCH_ITEMS || size + w.length > BATCH_CHARS)) {
        batches.push({ words: b, source })
        b = []
        size = 0
      }
      b.push(w)
      size += w.length
    }
    if (b.length) batches.push({ words: b, source })
  }
  const detect = providers[0] === "libretranslate"
  pack(todo.filter((w) => !detect || w.length < DETECT_FROM), from)
  if (detect) pack(todo.filter((w) => w.length >= DETECT_FROM), "auto")

  let unavailable: string | null = null
  let refusedAll = 0
  const offers = providers.includes("libretranslate") ? await libreOffers() : null
  let next = 0
  const run = async () => {
    while (next < batches.length) {
      const left = (opts.deadlineAt ?? Infinity) - Date.now()
      if (left < 12_000) return
      const b = batches[next++]
      let got: string[] | null = null
      let lastRefusal: Refused | null = null
      for (const p of providers) {
        try {
          if (p === "libretranslate") {
            const src = b.source === "auto" ? "auto" : libreCode(b.source)
            const tgt = libreCode(to)
            if (offers && (!offers.has(tgt) || (src !== "auto" && !offers.has(src)))) throw new Refused("language not offered", "language")
            got = await libreBatch(b.words, src, tgt, Math.min(60_000, left - 5_000))
          } else {
            got = await hfBatch(b.words, b.source === "auto" ? from : b.source, to, Math.min(60_000, left - 5_000))
          }
          remember(from, to, b.words.map((w, i) => [w, got![i]] as [string, string]).filter(([, t]) => t.trim()), p).catch(() => undefined)
          break
        } catch (e) {
          lastRefusal = e instanceof Refused ? e : new Refused(e instanceof Error ? e.message : "failed", "failed")
          console.error(`[open-translate] ${p} ${from}->${to}: ${lastRefusal.kind}: ${lastRefusal.message.slice(0, 120)}`)
        }
      }
      if (got) b.words.forEach((w, i) => got![i]?.trim() && done.set(w, got![i]))
      else if (lastRefusal) {
        refusedAll++
        unavailable =
          lastRefusal.kind === "language"
            ? "This language can't be translated automatically yet. You can still write each translation yourself."
            : lastRefusal.kind === "setup"
              ? "The translation server refused Storelib's key. Check LIBRETRANSLATE_API_KEY or HF_TOKEN."
              : "The translation server is busy. Try again in a few minutes."
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 3, batches.length)) }, run))
  texts.forEach((_, i) => {
    const t = join(parts[i], (w) => done.get(w))
    if (t !== null) out.set(i, t)
  })
  /* Said only when nothing at all came through: a few refused batches among many are simply left for the next round. */
  return { out, unavailable: refusedAll > 0 && out.size === 0 ? unavailable : null, remembered }
}
