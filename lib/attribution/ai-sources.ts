/**
 * ===========================================================================
 *  A VISIT FROM AN AI ASSISTANT, WHEN THE VISIT SAYS SO
 * ===========================================================================
 * Pure, for the browser and the server alike. Two signals, and nothing else:
 *
 *   the referring host   chatgpt.com, perplexity.ai, copilot.microsoft.com,
 *                        gemini.google.com, claude.ai and the rest below,
 *                        matched by domain (a subdomain counts, a lookalike
 *                        such as notchatgpt.com does not);
 *   utm_source           ChatGPT search adds utm_source=chatgpt.com to the
 *                        links it shows, and some assistants and people tag
 *                        links with the assistant's name (perplexity,
 *                        copilot.com).
 *
 * WHAT THIS CANNOT SEE. Most visits from an assistant arrive with no
 * referrer and no tag at all: a link copied out of an app, an app that
 * sends nothing, a browser that strips the referrer. Those are counted as
 * Direct, as they always were, and nothing here guesses otherwise. So every
 * figure built on this is "AI-referred (where the source is known)", never
 * all the traffic an assistant sent.
 *
 * No user agent, no fingerprint, no third party: the same referrer and tags
 * lib/analytics/sources already reads.
 */

export type AiSourceKey =
  | "chatgpt"
  | "perplexity"
  | "copilot"
  | "gemini"
  | "claude"
  | "you"
  | "phind"
  | "poe"
  | "meta_ai"
  | "grok"
  | "deepseek"
  | "mistral"

export interface AiSource {
  key: AiSourceKey
  label: string
}

/** The label every figure built on this carries. */
export const AI_REFERRED_LABEL = "AI-referred (where the source is known)"

/** Each assistant: its name, the hosts a visit from it comes from, and the utm_source words it is tagged with. */
const ASSISTANTS: ReadonlyArray<{ key: AiSourceKey; label: string; hosts: string[]; utm: string[] }> = [
  { key: "chatgpt", label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"], utm: ["chatgpt.com", "chatgpt", "chat.openai.com", "openai"] },
  { key: "perplexity", label: "Perplexity", hosts: ["perplexity.ai"], utm: ["perplexity", "perplexity.ai"] },
  { key: "copilot", label: "Copilot", hosts: ["copilot.microsoft.com", "copilot.cloud.microsoft"], utm: ["copilot", "copilot.com", "copilot.microsoft.com"] },
  { key: "gemini", label: "Gemini", hosts: ["gemini.google.com", "bard.google.com"], utm: ["gemini", "gemini.google.com", "bard"] },
  { key: "claude", label: "Claude", hosts: ["claude.ai"], utm: ["claude", "claude.ai"] },
  { key: "you", label: "You.com", hosts: ["you.com"], utm: ["you.com"] },
  { key: "phind", label: "Phind", hosts: ["phind.com"], utm: ["phind", "phind.com"] },
  { key: "poe", label: "Poe", hosts: ["poe.com"], utm: ["poe.com"] },
  { key: "meta_ai", label: "Meta AI", hosts: ["meta.ai"], utm: ["meta.ai", "metaai", "meta_ai"] },
  { key: "grok", label: "Grok", hosts: ["grok.com", "x.ai"], utm: ["grok", "grok.com", "x.ai"] },
  { key: "deepseek", label: "DeepSeek", hosts: ["deepseek.com"], utm: ["deepseek", "deepseek.com"] },
  { key: "mistral", label: "Le Chat (Mistral)", hosts: ["chat.mistral.ai"], utm: ["mistral", "chat.mistral.ai", "lechat"] },
]

export const AI_SOURCE_KEYS: readonly AiSourceKey[] = ASSISTANTS.map((a) => a.key)

const LABELS = new Map<string, string>(ASSISTANTS.map((a) => [a.key, a.label]))

export function isAiSourceKey(value: unknown): value is AiSourceKey {
  return typeof value === "string" && LABELS.has(value)
}

export function aiSourceLabel(key: string | null | undefined): string | null {
  return key ? LABELS.get(key) ?? null : null
}

/** A host as the visit named it: lower case, no port, no trailing dot, no www. Accepts a whole address too. */
function bareHost(value: string | null | undefined): string {
  let h = (value ?? "").trim().toLowerCase()
  if (!h) return ""
  if (h.includes("://")) {
    try {
      h = new URL(h).hostname
    } catch {
      return ""
    }
  }
  return h.split("/")[0].split(":")[0].replace(/\.$/, "").replace(/^www\./, "")
}

const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)

/** The assistant a referring host belongs to, or null. */
export function aiSourceOfHost(host: string | null | undefined): AiSource | null {
  const h = bareHost(host)
  if (!h) return null
  for (const a of ASSISTANTS) if (a.hosts.some((d) => onDomain(h, d))) return { key: a.key, label: a.label }
  return null
}

/**
 * The assistant a utm_source names, or null. Matched whole (after trimming
 * and lower casing, and a host's www.), never as a substring: "chatgpt.com"
 * and "ChatGPT" are ChatGPT, "notperplexity" and "you" (a word anybody
 * writes) are nothing.
 */
export function aiSourceOfUtm(utmSource: string | null | undefined): AiSource | null {
  const s = (utmSource ?? "").trim().toLowerCase().replace(/^www\./, "")
  if (!s) return null
  for (const a of ASSISTANTS) if (a.utm.includes(s)) return { key: a.key, label: a.label }
  /* A host given as the source: "chat.openai.com", "www.perplexity.ai". */
  if (s.includes(".") && !/\s/.test(s)) return aiSourceOfHost(s)
  return null
}

/**
 * The assistant a visit came from, or null when the visit does not say. The
 * tag wins over the referrer, as UTM tags win everywhere else in Storelib
 * (lib/analytics/sources categorizeServerSource): a ChatGPT link opened in
 * a browser that strips the referrer still carries utm_source=chatgpt.com.
 */
export function aiSourceOf(input: { referrerHost?: string | null; utmSource?: string | null }): AiSource | null {
  return aiSourceOfUtm(input.utmSource) ?? aiSourceOfHost(input.referrerHost)
}
