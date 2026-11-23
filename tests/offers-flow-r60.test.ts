/**
 * ===========================================================================
 *  ROUND 60 (h4): NEW OFFER ASKS THE KIND, THEN THE OFFER'S OWN PAGE
 * ===========================================================================
 * The owner: "when I click Create offer, it should open a smooth, clean modal
 * like the Add product one. I choose what kind of offer I create, then it
 * takes me to the subpage. Not a modal for creating the offer."
 *
 *   THE CHOOSER  app/(storelib)/app/offers/offer-kind-chooser.tsx: Add
 *                product's shell (components/ui/sheet-dialog, a bottom sheet
 *                on a phone), Bundle, Upsell, Quantity break with a drawing
 *                and one line each; a pick goes to /app/offers/new?kind=.
 *   THE PAGE     app/(storelib)/app/offers/offer-editor.tsx: the coupon
 *                editor's frame (a top bar under lg, a header and a foot bar
 *                from lg, a page layer on a phone), the round 58 form in
 *                cards, everything round 58 kept (problems under fields, the
 *                buyer's price line, More options, the currency lock,
 *                Cmd/Ctrl+S, Discard changes?, Delete) and a way back that
 *                tints the saved row.
 *   THE GATE     every offers address still goes through OffersScreen, which
 *                asks teamPageStore("marketing").
 *   THE BACKEND  untouched: the body each kind sends is the one round 58
 *                sent (offer-draft bodyOf), and tests/offers-r58.test.ts
 *                walks it to the charge.
 *
 * scripts/check-offers-flow-r60.mjs drives the real components in Chromium
 * at 360, 390, 768 and 1280 and measures the motion.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { OfferKindList, KIND_ORDER, KIND_HINT } from "@/app/(storelib)/app/offers/offer-kind-chooser"
import { bodyOf, draftOf } from "@/app/(storelib)/app/offers/offer-draft"
import { newOfferHref, offerHref } from "@/app/(storelib)/app/offers/list-return"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
/* Code without its comments, so a pin reads what runs. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const DIR = "app/(storelib)/app/offers"

console.log("\n1. The chooser\n")
{
  const html = renderToStaticMarkup(React.createElement(OfferKindList, { onChoose: () => undefined }))
  const kinds = [...html.matchAll(/data-kind="([a-z_]+)"/g)].map((m) => m[1])
  check("three rows in order: Bundle, Upsell, Quantity break", kinds.join() === "bundle,checkout,quantity_break" && KIND_ORDER.join() === kinds.join(), kinds)
  check("  each with its name and one line", /Bundle/.test(html) && /Upsell/.test(html) && /Quantity break/.test(html) && (html.match(/data-kind-hint=/g) ?? []).length === 3)
  check("  each a real button, at least 76px high, with its drawing", (html.match(/<button type="button" data-kind=/g) ?? []).length === 3 && /min-h-\[76px\]/.test(html) && (html.match(/aria-hidden="true" class="flex h-\[52px\] w-\[76px\]/g) ?? []).length === 3)
  const words = KIND_ORDER.map((k) => KIND_HINT[k]()).join(" ")
  check("  the lines say what each does, no sales words, no em dash", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(words), words)
  const chooser = code(`${DIR}/offer-kind-chooser.tsx`)
  check("Add product's shell: SheetDialog, the app's phone width, the sheet on a phone, the dialog from 768px", /<SheetDialog/.test(chooser) && /window\.matchMedia\(LAYER_PHONE\)/.test(chooser) && /phone=\{phone\}/.test(chooser))
  check("  the same size and surface as Add product's dialog", /max-w-\[520px\]/.test(chooser) && /shadow-\[0_24px_64px_-16px_rgba\(17,24,39,0\.28\),0_2px_6px_rgba\(17,24,39,0\.06\)\]/.test(chooser) && /max-w-\[520px\]/.test(code("app/(storelib)/app/products/new/kind-chooser.tsx")))
  check("  a pick closes it; on a phone the page rises after the sheet has left, on a computer at once", /target\.current = newOfferHref\(kind\)\s*setOpen\(false\)\s*if \(!phone\) go\(\)/.test(chooser) && /onClosed: go/.test(chooser))
  check("  and goes through the list's one round trip (a layer rising on a phone)", /offersReturn\.open\(router, href\)/.test(chooser))
  check("  the three pages are fetched ahead when it opens", /warmOfferKinds\(router\)/.test(chooser) && /for \(const k of KIND_ORDER\) prefetchAppPage\(router, newOfferHref\(k\)\)/.test(chooser))
  check("  the keyboard: the first row takes the focus, arrows move", /querySelector<HTMLButtonElement>\("\[data-kind\]"\)\?\.focus/.test(chooser) && /ArrowDown/.test(chooser) && /ArrowUp/.test(chooser))
  check("  reduced motion: no dialog animation, no chevron slide", /motion-reduce:data-\[state=open\]:animate-none/.test(chooser) && /motion-reduce:transition-none/.test(chooser))
  check("  its close button is 44px on a phone", /max-md:h-11 max-md:w-11/.test(chooser))
  check("the address a pick goes to", newOfferHref("bundle") === "/app/offers/new?kind=bundle" && newOfferHref("quantity_break") === "/app/offers/new?kind=quantity_break" && offerHref("x") === "/app/offers/x")
}

console.log("\n2. The list\n")
{
  const list = code(`${DIR}/offers-client.tsx`)
  check("New offer opens the chooser; a kind named (Create bundle) goes straight to its page", /if \(!offer && !kind\) return openChooser\(\)/.test(list) && /offersReturn\.open\(router, offer \? offerHref\(offer\.id\) : newOfferHref\(kind\)\)/.test(list) && /\{chooser\}/.test(list))
  check("  no form over the list any more", !/OfferEditor|SheetDialog/.test(list))
  check("a save or a delete on the page is laid over the rows, said, and the row tinted", /rowsWithReturn\(initialOffers, offersReturn\.peek\(\)\)/.test(list) && /const back = offersReturn\.take\(\)/.test(list) && /if \(back\.message\) say\(back\.message\)/.test(list) && /tintReturnedRow\(sectionRef\.current, back\.id, LAYER_LEAVE_MS\)/.test(list) && /router\.refresh\(\)/.test(list))
  check("  back to the list is the list as it was: its view, no landing", /holdLanding\(\)/.test(list) && /returning && leftAt \? leftAt : "all"/.test(list))
  check("?choose=1 lands with the chooser open, and the address goes back to /app/offers", /if \(!choose\) return/.test(list) && /replaceState\(window\.history\.state, "", OFFERS_HREF\)/.test(list) && /openChooser\(\)/.test(list))
  check("rows are fetched ahead on hover and touch, the first three when idle", /onMouseEnter=\{\(\) => warm\(offerHref\(o\.id\)\)\}/.test(list) && /onPointerDown=\{\(\) => warm\(offerHref\(o\.id\)\)\}/.test(list) && /whenIdle\(/.test(list))
}

console.log("\n3. The page\n")
{
  const editor = code(`${DIR}/offer-editor.tsx`)
  check("a page, not a modal", !/SheetDialog|Dialog\b/.test(editor))
  check("the coupon editor's frame: a sticky top bar under lg under the status bar, the header from lg, a sticky foot bar from lg over the safe area", /data-editor-bar=""[\s\S]{0,200}sticky top-0[\s\S]{0,200}pt-\[env\(safe-area-inset-top\)\][\s\S]{0,40}lg:hidden/.test(editor) && /data-editor-head=""/.test(editor) && /data-editor-foot=""[\s\S]{0,80}sticky bottom-0[\s\S]{0,80}lg:block|sticky bottom-0[\s\S]{0,120}pb-\[env\(safe-area-inset-bottom\)\][\s\S]{0,200}lg:block/.test(editor))
  check("  room for the nav pill at the foot of a phone layer", /max-md:\[\[data-page-layer\]_&\]:pb-\[calc\(32px\+env\(safe-area-inset-bottom\)\)\]/.test(editor))
  check("  the header: back to Offers and the title (New bundle, or the offer's name with where it stands)", /aria-label=\{tt\("Back to offers"\)\}/.test(editor) && /tt\("New \{kind\}", \{ kind: kindWord \}\)/.test(editor) && /<StatusBadge tone=\{STATE_TONE\[state\]\}>/.test(editor))
  check("  the form in /app cards, two columns from lg", /const CARD = "[^"]*rounded-2xl border border-\[#e5e7eb\]\/60 bg-white[^"]*shadow-\[0_1px_3px_rgba\(0,0,0,0\.04\)\]/.test(editor) && /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(272px,1fr\)\]/.test(editor))
  check("  Storelib's own controls: switches, choice tracks, radio rows, product pickers; no platform select", /<FormSwitch /.test(editor) && /<SwitchRow /.test(editor) && /<ChoiceGrid/.test(editor) && /<RadioRows/.test(editor) && /<ProductPicker /.test(editor) && /<TierEditor /.test(editor) && readdirSync(join(root, DIR), { recursive: true }).every((f) => !String(f).endsWith(".tsx") || !/<select/.test(read(`${DIR}/${f}`))))
  check("kept from round 58: problems under fields, the first brought into view", /setTried\(true\)/.test(editor) && /querySelector<HTMLElement>\("\[data-problem\]"\)/.test(editor) && /scrollIntoView\(\{ block: "center", behavior: reducedMotion\(\) \? "auto" : "smooth" \}\)/.test(editor))
  check("  what the buyer pays, by the checkout's own arithmetic", /bundlePrice\(/.test(editor) && /offerUnitPrice\(/.test(editor) && /data-offer-price=""/.test(editor))
  check("  More options folded, with a line of what it holds", /data-offer-more=/.test(editor) && /aria-expanded=\{moreShown\}/.test(editor) && /data-offer-more-line=""/.test(editor))
  check("  the currency lock: the amounts are sent in the currency they were typed in", /const \[currency\] = React\.useState\(currencyNow\)/.test(editor) && /formCurrency: currency/.test(editor))
  check("  Cmd or Ctrl and S saves", /e\.metaKey \|\| e\.ctrlKey/.test(editor) && /e\.key\.toLowerCase\(\) !== "s"/.test(editor))
  check("  leaving with a change asks (a new offer too), and a reload asks the browser's question", /Discard changes\?/.test(editor) && /Discard this offer\?/.test(editor) && /addEventListener\("beforeunload"/.test(editor))
  check("  Delete for a saved offer asks first", /data-delete-offer=""/.test(editor) && /tt\("Delete \{title\}\?"/.test(editor) && /sendOffer\("DELETE"/.test(editor))
  check("  a save goes back to the list with the row and a line to say", /offersReturn\.leave\(router, \{ id: saved\?\.id \?\? offer\?\.id \?\? null, saved, message:/.test(editor) && /offersReturn\.useOrigin\(\)/.test(editor))
  check("the same page for a new and a saved offer, POST or PUT", /sendOffer\(offer \? "PUT" : "POST", offer \? \{ \.\.\.sent, id: offer\.id \} : sent\)/.test(editor))
  const fields = code(`${DIR}/offer-fields.tsx`)
  check("on a phone: 16px fields 44px high, choices and Remove 44px", /h-11 w-full min-w-0 rounded-\[10px\][^"]*text-\[16px\][^"]*sm:h-10[^"]*sm:text-\[14px\]/.test(fields) && /"relative h-11 min-w-0 flex-1/.test(fields) && /data-tier-remove=\{i\}[\s\S]{0,160}className="-my-2\.5 h-11/.test(fields))
  check("motion on transform and opacity only: nothing animates a size or a position", ![editor, code(`${DIR}/offer-kind-chooser.tsx`)].some((s) => /transition-\[[^\]]*(height|width|top|left|margin|padding)/.test(s) || /transition-all/.test(s)))
  check("  reduced motion: More options and the chevron do not move", /animate-in fade-in-0 duration-150 motion-reduce:animate-none/.test(editor) && /transition-\[rotate\] duration-200 motion-reduce:transition-none/.test(editor))
  const copy = [...read(`${DIR}/offer-editor.tsx`).matchAll(/tt\("([^"]+)"/g), ...read(`${DIR}/offer-kind-chooser.tsx`).matchAll(/tt\("([^"]+)"/g)].map((m) => m[1]).join(" | ")
  check("no AI words and no em dash in the copy", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(copy))
}

console.log("\n4. The addresses and the gate\n")
{
  const screen = code(`${DIR}/offers-screen.tsx`)
  check("every offers page goes through OffersScreen", ["page.tsx", "new/page.tsx", "[id]/page.tsx"].every((f) => /return OffersScreen\(/.test(read(`${DIR}/${f}`))))
  check("  which asks teamPageStore(\"marketing\") before anything is read, and draws You don't have access when refused", screen.indexOf('teamPageStore("marketing")') < screen.indexOf("offersArea(") && /<TeamAreaClosed area="marketing"/.test(screen) && /return noStorePage\(from\)/.test(screen))
  check("  then the page: a new one of the kind named, or the saved one (another store's id goes back to the list)", /<OfferEditor/.test(screen) && /if \("id" in opening && !offer\) redirect\("\/app\/offers"\)/.test(screen) && /sold=\{offer \? \(area\.sold\[offer\.id\] \?\? 0\) : 0\}/.test(screen))
  check("  /app/offers/new with no kind: the list with the chooser open", /if \(opening && "new" in opening && !opening\.kind\) redirect\("\/app\/offers\?choose=1"\)/.test(screen) && /choose: choose === "1"/.test(read(`${DIR}/page.tsx`)))
  check("both pages are layers on a phone, in the shell from 768px, as the coupon's", ["new/layout.tsx", "[id]/layout.tsx"].every((f) => /<PageLayer pill inset="bar" phoneOnly>/.test(read(`${DIR}/${f}`))) && !existsSync(join(root, DIR, "loading.tsx")))
  check("a slow move to the page keeps the list on screen (no spinner surface)", /\^\\\/app\\\/offers\\\/\[\^\/\]\+\(\\\/\|\$\)/.test(read("lib/ui/app-navigation.ts")))
}

console.log("\n5. The backend is untouched\n")
{
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  const bundle = bodyOf({ ...draftOf(null, "bundle", "USD"), productIds: [A, B] }, "USD")
  check("a new bundle's body: its products and 10% off, never a price", bundle.kind === "bundle" && bundle.productIds.join() === `${A},${B}` && bundle.discountType === "percent" && bundle.discountValue === 10 && !("priceCents" in bundle), bundle)
  const qb = bodyOf({ ...draftOf(null, "quantity_break", "USD"), productIds: [A] }, "USD")
  check("a new quantity break starts on Buy 2 get 1 free, Buy 3 get 2 free", qb.tiers?.length === 2 && qb.tiers[0].quantity === 2 && qb.tiers[0].freeQuantity === 1 && qb.tiers[1].freeQuantity === 2)
  const up = bodyOf({ ...draftOf(null, "checkout", "USD"), productIds: [B], condition: "products", triggerIds: [A], discountType: "fixed", amount: "5.00" }, "USD")
  check("an upsell: one product, its trigger, $5.00 off in cents", up.productIds.join() === B && up.triggerIds.join() === A && up.discountValue === 500)
  check("the API route and the offer rules are not part of this change (the round 58 journey walks them)", existsSync(join(root, "app/api/store/offers/route.ts")) && /bodyOf, draftOf/.test(read("tests/offers-r58.test.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
