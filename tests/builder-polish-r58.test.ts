/**
 * ===========================================================================
 *  ROUND 58 (f2): ADD BLOCK ON A PHONE, THE BENEFIT ICONS, CHECK DNS, READ
 *  MORE AND THE PAYMENT ROW
 * ===========================================================================
 *   ADD BLOCK   a phone's opening is the sheet wherever Add block is pressed
 *               (the canvas, an imported theme's frame), not only from the
 *               sections sheet; a row that cannot be added because its kind
 *               is already there says Added, readable (#6b7280, not #9ca3af)
 *   ICONS       Materia's vertical benefits block (product pages of 16
 *               templates): one set, 24 box, one stroke width on the <svg>,
 *               nothing filled, currentColor only, the glyph a whole number
 *               of pixels with width and height on the <svg>, the styles
 *               before the list, no dark-filled fallback
 *   CHECK DNS   Website Settings passes its primary button to DnsSetup, and
 *               the light tone's button never carries `text-white` (which
 *               the light sheet turns dark: dark words on a dark fill)
 *   READ MORE   the fold ends on a real line (snapClamp), the fade is never
 *               more than half the box; the story, the community summary and
 *               the membership description use it
 *   PAYMENTS    the row shows what checkout takes: no PayPal, also on a page
 *               saved with it in its list
 *
 * Measured in Chromium: scripts/check-block-picker-phone.mjs (the sheet at
 * 360 and 390 from the canvas, the panel at 768 and 1280).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pickerIsPhone, typesAt } from "@/lib/website-builder/block-picker"
import { fadeFor, snapClamp } from "@/lib/ui/clamp-lines"
import { CHECKOUT_PAYMENT_METHODS, checkoutPaymentMethods } from "@/lib/store-builder/payment-methods"
import { defaultAboutSettings } from "@/lib/store-builder/defaults"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nAdd block on a phone\n")
{
  check("pressed on the canvas of a 390 wide phone: the sheet", pickerIsPhone(false, 390))
  check("  and at 767", pickerIsPhone(false, 767))
  check("  from the sections sheet at any width: the sheet", pickerIsPhone(true, 1280))
  check("  a 768 wide window on the canvas: the panel", !pickerIsPhone(false, 768))
  const picker = read("components/website-builder/editor/block-picker.tsx")
  check("the opener asks the window's width too", /pickerIsPhone\(!!request\.anchor\.closest\(PHONE_SHEET\), window\.innerWidth\)/.test(picker))
  const section = { blocks: [{ id: "a", type: "heading" }, { id: "g", type: "group", blocks: [{ id: "b", type: "button" }] }] }
  check("the kinds at the section's own level", [...typesAt(section, [])].sort().join() === "group,heading")
  check("  and inside a group", [...typesAt(section, ["g"])].join() === "button")
  check("  a path to nothing is empty", typesAt(section, ["zz"]).size === 0)
  check("a used row says Added", picker.includes('tt("Added")') && picker.includes("present.has(c.type)"))
  check("  in #6b7280, not the 2.5:1 #9ca3af", !/reason \? cn\("cursor-default", groups\.open\.length \? "text-\[#9ca3af\]"/.test(picker) && picker.includes('reason ? "cursor-default text-[#6b7280]"'))
}

console.log("\nMateria benefit icons\n")
{
  const src = read("theme-packages/materia/base/snippets/product-info-blocks.liquid")
  const block = src.slice(src.indexOf("{%- when 'vertical_benefits' -%}"), src.indexOf("{%- when 'modern_collapsible_row' -%}"))
  const icons = [...block.matchAll(/when '(\w+)'\s*-%\}\{%- assign lib_paths = '([^']*)'/g)]
  check("every icon of the library is there", icons.map((m) => m[1]).join() === "truck,shield,leaf,gift,lock,clock,star,heart,sparkle,recycle,medal,cart,support,globe,thumbsup", icons.map((m) => m[1]))
  check("  the paths only: no stroke, fill, width or colour of their own", icons.every((m) => !/stroke|fill|#[0-9a-f]{3,6}|style=/i.test(m[2])))
  check("  one <svg> for all of them: 24 box, stroke 1.75, round, nothing filled, currentColor", /<svg viewBox="0 0 24 24" width="\{\{ vb_glyph \}\}" height="\{\{ vb_glyph \}\}" fill="none" stroke="currentColor" stroke-width="1\.75" stroke-linecap="round" stroke-linejoin="round"/.test(block))
  check("  a title with no icon chosen gets the check, not a dark-filled circle", /\{%- else -%\}\{%- assign lib_paths = '<path d="m5 12\.5/.test(block) && !block.includes("#1C274C") && !block.includes("SVGRepo"))
  check("the glyph is a whole number of pixels, worked out in Liquid", block.includes("assign vb_glyph = bs.vb_icon_size | default: 48 | times: 3 | divided_by: 4"))
  check("the styles come before the list (a page that moves them to a file loads them first)", block.indexOf("<style>") > 0 && block.indexOf("<style>") < block.indexOf('<ul class="vb__list"'))
  check("  and the list is laid out without them", /<ul class="vb__list" role="list" style="list-style:none;margin:0;padding:0;display:flex/.test(block) && /<li class="vb__item" style="display:flex;align-items:flex-start;">/.test(block))
  check("no left padding pushing the glyph off its column, no non-scaling stroke", !block.includes("padding-left:4px") && !block.includes("non-scaling-stroke"))
  check("icons follow the text's colour unless one is chosen", block.includes("{% else %}var(--vb-text-color){% endif %}"))
  check("a pasted SVG keeps its own drawing, coloured by its stroke only", block.includes("vb__svg--custom") && block.includes("| replace: '<svg', vb_svg_open"))
}

console.log("\nCheck DNS\n")
{
  const dns = read("components/domains/dns-setup.tsx")
  const domains = read("components/website-builder/website-settings/domains.tsx")
  check("Website Settings gives Check DNS its primary button (Connect's)", /checkClassName=\{cn\(primaryButtonClass, "md:h-10"\)\}/.test(domains))
  check("DnsSetup takes it", /checkClassName \?\?/.test(dns))
  const light = dns.slice(dns.indexOf("light: {"), dns.indexOf("dark: {"))
  check("the light tone's button has no text-white (the light sheet makes it dark)", !/button:[\s\S]*?text-white[\s"]/.test(light.slice(light.indexOf("button:"), light.indexOf("found:"))))
}

console.log("\nRead more\n")
{
  /* The owner's story at 360: a heading, a paragraph, a gap, a paragraph. Six lines of 20 is 120, inside the gap. */
  const bottoms = [27, 54, 77, 97, 132, 152, 172]
  check("the fold ends on a line, not in a gap", snapClamp(bottoms, 120, 20) === 132, snapClamp(bottoms, 120, 20))
  check("  never more than a line past the target", snapClamp([50, 200], 120, 20) === 50)
  check("  the target when there are no lines", snapClamp([], 120, 20) === 120)
  check("  a line exactly on the target is the fold", snapClamp([100, 120, 140], 120, 20) === 120)
  check("the fade is two and a half lines, at most half the box", fadeFor(144, 24) === 60 && fadeFor(60, 24) === 30)
  const story = read("components/store-builder/unified-section-renderer.tsx")
  check("the story uses it", story.includes("snapClamp(lineBottoms(el), line * 6, line)") && story.includes("fadeFor(collapsedHeight, lineHeight)"))
  check("  it opens to the text's height, not past it", story.includes("isExpanded ? `${fullHeight ?? 4000}px`"))
  check("the community summary folds the same way, no line-clamp", read("components/community/public/card-summary.tsx").includes("useFold<HTMLParagraphElement>(3, open") && !read("components/community/public/card-summary.tsx").includes("line-clamp-3"))
  const member = read("components/memberships/member-page.tsx")
  check("the membership description too, More only when something is folded", member.includes("useFold(5, aboutOpen") && member.includes("{aboutFold.cut ? <button") && !member.includes("max-h-[120px]"))
  check("the fade and the ease are app/globals.css's, with a reduced motion path", /\[data-clamp-fade\] \{[\s\S]*?transition: max-height 240ms/.test(read("app/globals.css")) && /prefers-reduced-motion: reduce\) \{ \[data-clamp-fade\] \{ transition: none; \}/.test(read("app/globals.css")))
}

console.log("\nPayment methods\n")
{
  check("what checkout takes: cards and the two wallets", CHECKOUT_PAYMENT_METHODS.join() === "visa,mastercard,amex,applepay,googlepay")
  check("a page saved with PayPal no longer shows it", checkoutPaymentMethods(["paypal", "visa", "applepay"]).join() === "visa,applepay")
  check("  nothing saved: all of them", checkoutPaymentMethods(undefined).join() === CHECKOUT_PAYMENT_METHODS.join())
  check("  unknown and repeated names dropped", checkoutPaymentMethods(["visa", "visa", "bitcoin"]).join() === "visa")
  check("a new About section's list has no PayPal", !(defaultAboutSettings.paymentMethods ?? []).includes("paypal"))
  const r = read("components/store-builder/unified-section-renderer.tsx")
  check("the renderer has no PayPal badge to draw", !r.includes("PayPalIcon") && !/"paypal"/.test(r))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
