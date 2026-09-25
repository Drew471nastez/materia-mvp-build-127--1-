/**
 * ===========================================================================
 *  THE REFUND NOTE AND THE SHARE BUTTON ON A PRODUCT PAGE
 * ===========================================================================
 * The shapes, pinned. What they do on screen is measured by
 * scripts/check-buy-extras.mjs at 390 and 1280.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const refund = read("components/product/refund-policy-display.tsx")
const share = read("components/product/share-button.tsx")

console.log("\nThe refund note\n")
check("a phone gets the shared bottom sheet", /<BottomSheet isOpen=\{open\}/.test(refund))
check("a computer gets an anchored popover", /PopoverPrimitive\.Content/.test(refund) && /collisionPadding=\{12\}/.test(refund))
check("chosen by the screen, not the builder's phone frame", /matchMedia\?\.\("\(max-width: 639px\)"\)/.test(refund) && !/isMobile \|\|/.test(refund))
check("no hand-placed box centred on the screen", !/translate\(-50%, -50%\)/.test(refund))
check("no violet in it", !/7c3aed|c4b5fd|124, 58, 237/i.test(refund))
check("the popover moves on opacity and transform", /\.refund-popover\[data-state="open"\]/.test(read("app/globals.css")))

console.log("\nThe share button\n")
check("a phone with a system share sheet uses it", /navigator\.share\(\{ title: productTitle, text: shareText, url: shareUrl \}\)/.test(share))
check("and a dismissed sheet is not an error", /name === "AbortError"\) return/.test(share))
check("otherwise the action list: a menu, or the shared sheet on a phone", /<ResponsiveActionMenu/.test(share))
check("no modal dialog with a dimmed page", !/DialogContent|<Dialog /.test(share))
check("copying says so with the dark pill", /showPillToast\(ok \? "Link copied"/.test(share))
check("the X row is not a close icon", !/from "lucide-react"[^\n]*\bX\b/.test(share))
check("the address is still the canonical one", /getProductShareUrl\(creatorUsername \|\| "", productSlug, pageHost\)/.test(share))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
