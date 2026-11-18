/**
 * Round 56 (r56-d): the scripted model's answer to finish's
 * render.action_mismatch (lib/ai-builder/render-check.ts actionMismatch), in
 * its own module so a unit suite can drive it without the journey kit.
 */
import type { SectionInstance } from "@/lib/website-builder/types"
import { asksToTalk } from "@/lib/website-builder/action-words"

type Call = [string, Record<string, unknown>]

/** The settings that hold a link's words beside its address setting. */
function labelIds(urlId: string): string[] {
  if (urlId === "url" || urlId === "link") return ["label", "text", "title", "link_text", "link_label"]
  const base = /^(.*?)_(?:url|link)$/.exec(urlId)?.[1]
  return base ? [`${base}_label`, `${base}_text`, base, ...(base === "cta" ? ["button_label", "button_text"] : [])] : []
}

/**
 * What a careful model does with finish's render.action_mismatch (round 56):
 * the scripted copy put "Book an intro call" or "Ask a question" on a
 * template's button whose address is the shop. On the page and section type
 * finish names, every pair of settings whose words are the ones named and
 * whose address is the shop is pointed at the page finish suggests; with no
 * such page on the site, the words become one of the site's own words that
 * fit the shop (`shopWords`, from its deck), and the address stays.
 */
export function actionRepairs(said: string, pages: { key: string; sections: SectionInstance[] }[], shopWords: string[] = []): Call[] {
  const calls: Call[] = []
  const seen = new Set<string>()
  const fallback = shopWords.find((w) => w.trim() && !asksToTalk(w)) ?? "See what is on offer"
  /* The refusal arrives as a tool result inside the turns, JSON in JSON: its quotes escaped once or more. */
  const plain = said.replace(/\\+"/g, '"')
  for (const m of plain.matchAll(/sections\/(ai_[a-z0-9_]+)\.storelib: ([a-z0-9-]+): (?:The call to action "[^"]*"|A menu link|A link): "([^"]+)" asks the visitor to get in touch, and it goes to (\/[^\s,]+), the shop\. Point it at (?:the site's (\/[a-z0-9-]+) page|the page that takes the request)/g)) {
    const [, type, pageKey, words, from, to] = m
    const page = pages.find((p) => p.key === pageKey)
    for (const s of page?.sections ?? []) {
      if (s.type !== type) continue
      const holders = [{ blockId: undefined as string | undefined, settings: s.settings ?? {} }, ...(s.blocks ?? []).map((b) => ({ blockId: b.id as string | undefined, settings: b.settings ?? {} }))]
      for (const h of holders) {
        const set: Record<string, unknown> = {}
        for (const [id, v] of Object.entries(h.settings)) {
          if (v !== from) continue
          const label = labelIds(id).find((l) => typeof h.settings[l] === "string" && (h.settings[l] as string).trim() === words.trim())
          if (!label) continue
          if (to) set[id] = to
          else set[label] = fallback
        }
        const key = `${pageKey} ${s.id} ${h.blockId ?? ""} ${JSON.stringify(set)}`
        if (Object.keys(set).length && !seen.has(key)) {
          seen.add(key)
          calls.push(["set_section_settings", { page: pageKey, sectionId: s.id, settings: set, ...(h.blockId ? { blockId: h.blockId } : {}) }])
        }
      }
    }
  }
  return calls
}
