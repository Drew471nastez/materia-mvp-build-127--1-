/**
 * ===========================================================================
 *  ROUND AL: THE BLOCK SHEET, THE INTERACTION CHOICE, INSTAGRAM'S HEIGHT
 * ===========================================================================
 * The rules behind what scripts/check-onepage-block-sheet.mjs measures in a browser:
 *
 *   INTERACTION  what a tap on an embedding block does (lib/onepage/block-sheet): a saved block without a choice
 *                is drawn on the page as before, Calendly's older fields are read, a new block opens in the sheet
 *   SHEET        the motion's numbers, one provider around the page (which the editor's preview draws too), the
 *                page held still, a history entry, focus kept, reduced motion
 *   INSTAGRAM    the post's height in Instagram's own units: folded to the account line and a 4:5 picture, whole
 *                when it is short or in a sheet, "View full post" only when there is more
 *
 *   npx tsx tests/onepage-block-sheet-al.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BLOCK_SHEET_HISTORY_KEY, SHEET_MOTION, blockInteraction, blockSheetEntryOf, interactionPatch, offersInteraction } from "@/lib/onepage/block-sheet"
import { FOLD_SLACK, instagramBox, instagramFoldHeight, instagramFrameWidth } from "@/components/onepage/compact-post"
import { createDefaultBlock } from "@/lib/onepage/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

console.log("INTERACTION")
{
  const b = (type: string, data: Record<string, unknown>) => ({ type, data })
  check("a saved video with no choice stays on the page", blockInteraction(b("video", { url: "x" })) === "inline")
  check("so do music, embeds, maps and the contact form", ["music", "embed", "map", "contact_form"].every((t) => blockInteraction(b(t, {})) === "inline"))
  check("a chosen sheet is read", blockInteraction(b("embed", { open_mode: "sheet" })) === "sheet")
  check("a chosen link is read", blockInteraction(b("map", { open_mode: "direct" })) === "direct")
  check("a contact form has no address to go to: direct is not one of its choices", blockInteraction(b("contact_form", { open_mode: "direct" })) === "inline")
  check("a plain link is not offered the choice", !offersInteraction("link_button") && blockInteraction(b("link_button", { open_mode: "sheet" })) === "direct")
  check("Calendly's pop-up is the sheet", blockInteraction(b("calendly", { embed_mode: "embedded", embed_type: "modal" })) === "sheet")
  check("Calendly's new tab is the link", blockInteraction(b("calendly", { embed_mode: "direct_link" })) === "direct")
  check("Calendly drawn inline stays inline", blockInteraction(b("calendly", { embed_mode: "embedded", embed_type: "inline" })) === "inline")
  check("a Calendly block with nothing saved opens the sheet", blockInteraction(b("calendly", {})) === "sheet")
  check("open_mode wins over Calendly's older fields", blockInteraction(b("calendly", { open_mode: "direct", embed_mode: "embedded", embed_type: "modal" })) === "direct")
  const cal = interactionPatch("calendly", "inline")
  check("Calendly's older fields follow the choice", cal.embed_mode === "embedded" && cal.embed_type === "inline" && interactionPatch("calendly", "direct").embed_mode === "direct_link")
  check("other blocks save only open_mode", JSON.stringify(interactionPatch("video", "sheet")) === JSON.stringify({ open_mode: "sheet" }))
  /* Changed on purpose (round AR): a new music or video block plays on the page (the owner: "music blocks as default show on the page"). */
  for (const t of ["embed", "map", "contact_form", "calendly"] as const) {
    check(`a new ${t} block opens in the sheet`, blockInteraction(createDefaultBlock(t)) === "sheet")
  }
  for (const t of ["video", "music"] as const) {
    check(`a new ${t} block plays on the page`, blockInteraction(createDefaultBlock(t)) === "inline")
  }
}

console.log("SHEET")
{
  check("open 300ms, close 250ms, as the recording", SHEET_MOTION.openMs === 300 && SHEET_MOTION.closeMs === 250)
  check("it rises from a smaller card, lower down", SHEET_MOTION.from.scale < 1 && SHEET_MOTION.from.scale >= 0.9 && SHEET_MOTION.from.translateY === "12%")
  check("its history entry is read back by its own key", blockSheetEntryOf({ [BLOCK_SHEET_HISTORY_KEY]: "a:1" }) === "a:1" && blockSheetEntryOf({}) === null && blockSheetEntryOf(null) === null)
  const sheet = read("components/onepage/block-sheet.tsx")
  check("the exported API is kept", /export function useBlockSheet\(\): BlockSheetApi/.test(sheet) && /export function openModeOf\(data: unknown, fallback: OpenMode = "direct"\): OpenMode/.test(sheet) && /export function BlockSheetProvider\(/.test(sheet) && /available: true/.test(sheet))
  check("the page behind is held still, html and body untouched", /* Round AS: a kept sheet (hidden, for the next tap) holds nothing still. */ /useStillPage\(!kept, rootRef\)/.test(sheet) && !/documentElement\.style\.overflow|body\.style\.overflow/.test(sheet))
  check("Back closes it, from an entry of its own", /window\.history\.pushState\(historyWith\(m\)/.test(sheet) && /addEventListener\("popstate", onPop\)/.test(sheet))
  check("not in the editor's preview, where Back is the editor's", /if \(kept \|\| isOnePagePreview\(\)\) return\s+const m =/.test(sheet))
  check("Escape closes it, Tab stays inside", /e\.key === "Escape"/.test(sheet) && /data-focus-guard/.test(sheet) && /addEventListener\("focusin", onFocusIn, true\)/.test(sheet))
  check("reduced motion only fades", /prefers-reduced-motion: reduce/.test(sheet) && /still \? M\.reducedMs : M\.openMs/.test(sheet))
  check("the block's button runs once the sheet and its entry are gone", /if \(!a\.run \|\| !a\.gone \|\| !a\.left\) return/.test(sheet))
  const live = read("components/onepage/public-onepage.tsx")
  check("drawn once around the public page (the preview frame draws the same component)", (live.match(/<BlockSheetProvider\b/g) ?? []).length === 1 && /<PublicOnePage onepage=\{page as never\} \/>/.test(read("components/onepage/preview-document.tsx")))
  check("Calendly's own pop-ups are gone; it opens the sheet", !/showCalendlyModal/.test(live) && /blockSheet\.open\(\{/.test(live))
  const extra = read("components/onepage/extra-blocks.tsx")
  check("the Interaction choice sits in every embedding block's settings", /offersInteraction\(block\.type\) \? <InteractionChoice/.test(extra) && /<ModeChoice/.test(extra))
  check("Calendly's two switches gave way to it", !/Go Directly To Link/.test(read("components/onepage/tabs/links-tab.tsx")))
}

console.log("INSTAGRAM")
{
  check("the frame is drawn at a width Instagram supports", instagramFrameWidth(200) === 326 && instagramFrameWidth(400) === 400 && instagramFrameWidth(900) === 540)
  check("the fold is the account line and a 4:5 picture", instagramFoldHeight(400) === 560)
  const tall = instagramBox(400, 1100, false, false)
  check("a tall post folds, with a button", tall.height === 560 && tall.folds)
  check("opened, it is exactly as tall as Instagram said", instagramBox(400, 1100, true, false).height === 1100)
  const short = instagramBox(400, 560 + FOLD_SLACK, false, false)
  check("a post hardly taller than the fold is shown whole, no button", short.height === 560 && !short.folds && instagramBox(400, 520, false, false).height === 520)
  const before = instagramBox(400, null, false, false)
  check("before Instagram speaks, nothing is promised", !before.folds && before.height === 560)
  const sheet = instagramBox(400, 1100, false, true)
  check("in a sheet, whole and no button", sheet.height === 1100 && !sheet.folds)
  const post = read("components/onepage/compact-post.tsx")
  check("the button sits on the post's own fade, inside its box", /data-post-fade/.test(post) && /data-post-more/.test(post) && /useContext\(InBlockSheetContext\)/.test(post))
  check("the frame never scrolls inside itself", /scrolling="no"/.test(post))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
