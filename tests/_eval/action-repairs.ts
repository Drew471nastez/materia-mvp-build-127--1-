/**
 * Round 56 (r56-d): the scripted model's answer to finish's
 * render.action_mismatch (lib/ai-builder/render-check.ts actionMismatch), in
 * its own module so a unit suite can drive it without the journey kit.
 */
import type { SectionInstance } from "@/lib/website-builder/types"

type Call = [string, Record<string, unknown>]

/**
 * What a careful model does with finish's render.action_mismatch (round 56):
 * "Book an intro call" kept a template's /products address. On the page and
 * section type finish names, every pair of settings (<x>_label or <x>_text
 * with <x>_url) whose words are the ones named and whose address is the shop
 * is pointed at the page finish suggests.
 */
export function actionRepairs(said: string, pages: { key: string; sections: SectionInstance[] }[]): Call[] {
  const calls: Call[] = []
  const seen = new Set<string>()
  for (const m of said.matchAll(/sections\/(ai_[a-z0-9_]+)\.storelib: ([a-z0-9-]+): (?:The call to action "[^"]*"|A menu link|A link): "([^"]+)" asks the visitor to get in touch, and it goes to (\/[^\s,]+), the shop\. Point it at the site's (\/[a-z0-9-]+) page/g)) {
    const [, type, pageKey, words, from, to] = m
    const page = pages.find((p) => p.key === pageKey)
    for (const s of page?.sections ?? []) {
      if (s.type !== type) continue
      const holders = [{ blockId: undefined as string | undefined, settings: s.settings ?? {} }, ...(s.blocks ?? []).map((b) => ({ blockId: b.id as string | undefined, settings: b.settings ?? {} }))]
      for (const h of holders) {
        const set: Record<string, unknown> = {}
        for (const [id, v] of Object.entries(h.settings)) {
          const base = /^(.*)_url$/.exec(id)?.[1]
          if (!base || v !== from) continue
          const label = h.settings[`${base}_label`] ?? h.settings[`${base}_text`] ?? (base === "cta" ? h.settings.button_label : undefined)
          if (typeof label === "string" && label.trim() === words.trim()) set[id] = to
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
