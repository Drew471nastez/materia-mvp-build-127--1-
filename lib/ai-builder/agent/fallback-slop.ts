/**
 * ===========================================================================
 *  A SMALL ANTI SLOP CHECK, UNTIL L6'S EVALUATOR IS MERGED
 * ===========================================================================
 * Deterministic and narrow on purpose: only findings that are facts about
 * the files. Severity "error" is what the architecture calls high: the verify
 * phase sends the agent back to fix those; warnings are reported only.
 *
 *   slop.fake_proof       testimonials, reviews, client counts or ratings
 *                         typed into a store that has no reviews (error)
 *   slop.fake_metric      "10,000+ clients", "98%", "5 star" in copy when the
 *                         store has no such number (error)
 *   slop.banned_words     unlock, elevate, seamless... (CLAUDE.md) (error)
 *   slop.purple_gradient  a violet/purple gradient (warning)
 *   slop.glass            backdrop-filter blur (warning)
 *   slop.emoji_icons      emoji used as icons in markup (warning)
 *
 * TODO(L6 merge): replace with lib/ai-builder/slop.ts through
 * AgentDeps.slop; L6's reads the concept, so a declared glass look is not
 * penalised there.
 */
import type { ValidationIssue } from "../types"
import type { SlopEvaluator } from "./ports"

export const BANNED_WORDS = ["unlock", "elevate", "seamless", "seamlessly", "powerful", "effortless", "effortlessly", "supercharge", "transform your", "revolutionize", "game-changer", "next-level", "cutting-edge", "world-class"]

const PROOF_WORDS = /testimonial|review|what (?:our|my) clients say|rated|stars?\b|trusted by|happy (?:clients|customers)/i
const METRIC = /\b\d{1,3}(?:[,.]\d{3})+\+?\s*(?:clients|customers|students|members|people|users|sold)|\b\d{2,3}%\s*(?:of|success|satisfaction|happy)|\b[45](?:\.\d)?\s*(?:\/\s*5|stars?|-star)/i

/** The words a visitor reads: defaults of text settings and the template's own text. */
function visibleText(text: string): string {
  const template = /<template>([\s\S]*?)<\/template>/i.exec(text)?.[1] ?? ""
  const words = template.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}|<[^>]+>/g, " ")
  const schema = /<schema>([\s\S]*?)<\/schema>/i.exec(text)?.[1] ?? ""
  const defaults = [...schema.matchAll(/"default"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join(" \n ")
  return `${words}\n${defaults}`
}

export const fallbackSlop: SlopEvaluator = async ({ files, capabilities }) => {
  const issues: ValidationIssue[] = []
  const hasReviews = (capabilities?.reviews.count ?? 0) > 0
  for (const f of files) {
    const words = visibleText(f.text)
    const style = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(f.text)?.[1] ?? ""
    const banned = BANNED_WORDS.filter((w) => new RegExp(`\\b${w.replace(/[-\s]/g, "[-\\s]")}\\b`, "i").test(words))
    if (banned.length) issues.push({ severity: "error", code: "slop.banned_words", message: `Copy uses ${banned.map((w) => `"${w}"`).join(", ")}. Name what actually happens instead.`, path: f.path })
    if (!hasReviews && PROOF_WORDS.test(words) && /"(?:name|author|quote|rating)"/.test(f.text)) {
      issues.push({ severity: "error", code: "slop.fake_proof", message: "This component shows testimonials or reviews with typed in people, and the store has no reviews. Remove it, or make it an empty, clearly editable placeholder the creator fills with real words.", path: f.path })
    }
    const metric = METRIC.exec(words)
    if (metric) issues.push({ severity: "error", code: "slop.fake_metric", message: `"${metric[0]}" is a number nobody gave. Use only numbers from list_capabilities, or leave the setting empty for the creator.`, path: f.path })
    if (/linear-gradient\([^)]*(?:#(?:8b5cf6|7c3aed|a855f7|9333ea|6d28d9|c084fc)|purple|violet)/i.test(style)) issues.push({ severity: "warning", code: "slop.purple_gradient", message: "A purple gradient is the default AI look. Use the concept's palette.", path: f.path })
    if (/backdrop-filter\s*:\s*blur/i.test(style)) issues.push({ severity: "warning", code: "slop.glass", message: "Glassmorphism (backdrop blur). Keep it only if the concept asks for it.", path: f.path })
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(words)) issues.push({ severity: "warning", code: "slop.emoji_icons", message: "Emoji used as icons. Use an icon setting or none.", path: f.path })
  }
  return issues
}
