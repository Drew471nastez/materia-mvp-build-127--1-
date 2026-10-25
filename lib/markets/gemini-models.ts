/**
 * ===========================================================================
 *  WHICH GEMINI MODEL: ASKED OF GOOGLE, NOT WRITTEN DOWN HERE
 * ===========================================================================
 * Google retires Gemini models every few months (2.0 Flash and Flash-Lite
 * answered 404 "no longer available" in October 2026, and the translator
 * stopped until someone changed a name in the code). So the model is not
 * a name in the code: once a day Storelib asks the API which models this key
 * can use (GET /v1beta/models) and picks the best cheap text model by its
 * family and what it can do:
 *
 *   1. it can generateContent, and is a plain text model (no image, audio,
 *      live, embedding, robotics or computer use variant)
 *   2. Flash-Lite before Flash (the cheapest, the largest free allowance;
 *      Pro and others are not used: tiny or no free allowance)
 *   3. stable before a "-latest" alias, before preview, before experimental
 *   4. the newest version first
 *
 * GEMINI_TRANSLATE_MODEL (comma separated) is asked first when set; the
 * discovered ones follow, so an override that names a retired model never
 * stops translating. Without an answer from the listing (network, an old
 * key), the last known good list is used.
 *
 * Pure apart from the fetch, which is passed in, so the tests can answer
 * with any list Google might send.
 */

export interface ListedModel {
  name?: string
  baseModelId?: string
  displayName?: string
  supportedGenerationMethods?: string[]
  outputTokenLimit?: number
  inputTokenLimit?: number
  thinking?: boolean
}

/** Used when the listing cannot be read. Checked against ai.google.dev/gemini-api/docs/pricing on 2026-10-25. */
export const KNOWN_GOOD = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.6-flash", "gemini-2.5-flash"]

const NOT_TEXT = /(image|imagen|tts|audio|live|embed|vision|robotics|computer-use|native|aqa|learnlm|veo|lyria|banana|nano|gemma|search|deep-research|-it$)/i

const idOf = (m: ListedModel) => String(m.name ?? m.baseModelId ?? "").replace(/^models\//, "")

/** The model's family: 0 Flash-Lite, 1 Flash, null not used for translating. */
export function familyOf(id: string): 0 | 1 | null {
  if (!/^gemini-/i.test(id) || NOT_TEXT.test(id)) return null
  if (/flash-?lite/i.test(id)) return 0
  if (/flash/i.test(id) && !/pro|ultra|thinking/i.test(id)) return 1
  return null
}

/** 0 stable, 1 the "-latest" alias, 2 preview, 3 experimental. */
export function stabilityOf(id: string): number {
  if (/exp/i.test(id)) return 3
  if (/preview/i.test(id)) return 2
  if (/latest/i.test(id)) return 1
  return 0
}

/** "gemini-3.5-flash-lite-001" -> 3.5; an alias without a number -> 0. */
export function versionOf(id: string): number {
  const m = id.match(/^gemini-(\d+(?:\.\d+)?)/i)
  return m ? Number(m[1]) : 0
}

/** The models to try for translating, best first. */
export function rankModels(list: ListedModel[]): string[] {
  const seen = new Set<string>()
  const out: { id: string; f: number; s: number; v: number; dated: number }[] = []
  for (const m of list) {
    const id = idOf(m)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const methods = m.supportedGenerationMethods
    if (Array.isArray(methods) && !methods.includes("generateContent")) continue
    const f = familyOf(id)
    if (f === null) continue
    /* "-001" or "-09-2025": a pinned snapshot of the same model, after its plain name. */
    out.push({ id, f, s: stabilityOf(id), v: versionOf(id), dated: /-\d{2,3}$|-\d{2}-\d{4}$/.test(id) ? 1 : 0 })
  }
  out.sort((a, b) => a.f - b.f || a.s - b.s || b.v - a.v || a.dated - b.dated || a.id.localeCompare(b.id))
  return out.map((x) => x.id)
}

/** Every page of GET /v1beta/models for this key. Throws on a refusal, with the HTTP status. */
export async function listModels(base: string, key: string, fetchImpl: typeof fetch = fetch, timeoutMs = 8000): Promise<ListedModel[]> {
  const all: ListedModel[] = []
  let token = ""
  for (let page = 0; page < 5; page++) {
    const url = `${base.replace(/\/+$/, "")}/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`
    const res = await fetchImpl(url, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) {
      const e = new Error(`models list answered HTTP ${res.status}`) as Error & { status?: number }
      e.status = res.status
      throw e
    }
    const json = (await res.json()) as { models?: ListedModel[]; nextPageToken?: string }
    all.push(...(json.models ?? []))
    token = json.nextPageToken ?? ""
    if (!token) break
  }
  return all
}

/** The order to try: the override first, then the discovered ones, then (only when nothing was discovered) the known good list. */
export function modelOrder(override: string[], discovered: string[] | null): string[] {
  const out: string[] = []
  for (const m of [...override, ...(discovered && discovered.length ? discovered : KNOWN_GOOD)]) if (m && !out.includes(m)) out.push(m)
  return out
}
