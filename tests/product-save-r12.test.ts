/**
 * Round 12: every change in the product editor turns Save on, and changing it
 * back turns Save off.
 *
 * The owner: "if I go to app > products > edit product page and I uncheck a
 * sales channel there, it doesn't trigger the Save button." The cards that
 * keep their own draft (sales channels, a physical product's stock, shipping
 * and variants, custom fields, the limit per order) called markDirty, and the
 * snapshot effect, which only knew the snapshot's own fields, put "saved"
 * straight back on the next draw. Fields outside the snapshot (the address,
 * the SEO title and description, the kind) never counted at all.
 *
 * Now there is one answer (app/app/products/new/editor-form.ts changedFields
 * and the card drafts, lib/forms/dirty.ts): the form now against the form as
 * saved, every card's draft against what it loaded or last saved.
 *
 * This suite enumerates the form's fields from initialForm() and the editor's
 * and the physical cards' state from their source, so a field added later
 * without being wired in fails here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { asSet, num, richText, sameValue, stableKey } from "../lib/forms/dirty"
import {
  NOT_SAVED_WITH_FORM,
  cardsSaved,
  changedCards,
  changedFields,
  dirtyFieldsOf,
  initialForm,
  reportCardDraft,
  snapshotOf,
  type CardDrafts,
  type DirtyField,
  type DirtyFields,
  type LoadedProduct,
} from "../app/app/products/new/editor-form"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`)
  }
}
const root = process.cwd()
const read = (f: string) => readFileSync(join(root, f), "utf8")

console.log("\nThe comparison (lib/forms/dirty.ts)\n")
{
  check("a number typed as 10, 10.00 or ' 10 ' is the same", num("10") === 10 && num("10.00") === 10 && num(" 10 ") === 10 && num("") === null && num("abc") === "abc")
  check("text is trimmed and empty text is nothing", sameValue({ a: " x ", b: "" }, { a: "x", b: null }) && sameValue({ a: undefined }, {}))
  check("object key order does not matter", stableKey({ a: 1, b: 2 }) === stableKey({ b: 2, a: 1 }))
  check("a set's order does not matter, a list's does", sameValue(asSet(["b", "a"]), asSet(["a", "b"])) && !sameValue(["b", "a"], ["a", "b"]))
  check("rich text: the same words in other spacing, an empty paragraph or a &nbsp; are the same", richText("<p>Hi&nbsp;there</p><p></p>") === richText("<p>Hi there</p>") && richText("<p>a</p>\n<p>b</p>") === richText("<p>a</p><p>b</p>"))
  check("rich text: other words or other marks are not", richText("<p>a</p>") !== richText("<p>b</p>") && richText("<p><b>a</b></p>") !== richText("<p>a</p>"))
  check("no false 'same' between real numbers and text", !sameValue(num("10"), num("10.5")) && !sameValue("007", "7"))
}

/* A saved product with something in every field, so every field can change. */
const loaded: LoadedProduct = {
  product: {
    id: "p1",
    title: "Pack",
    description: "<p>All of it</p>",
    price_cents: 2900,
    compare_at_cents: 3900,
    slug: "pack",
    type: "digital",
    status: "published",
    show_sales_badge: true,
    refund_policy_enabled: true,
    refund_policy_type: "7_day",
    seo_title: "Pack",
    seo_description: "All of it",
    call_to_action: "Buy",
    category: "Design",
    pay_what_you_want: true,
    pwyw_min_price_cents: 500,
    pwyw_suggested_price_cents: 1000,
    thumbnail_url: "https://x/a.jpg",
    gallery_urls: ["https://x/a.jpg", "https://x/b.jpg"],
    whats_included: ["One", "Two"],
    faqs: [{ question: "Q", answer: "A" }],
    custom_fields: { size: { value: "10 cm", label: "Size", type: "text", show: true, pos: 0 } },
  },
  assets: [{ id: "f1", file_name: "pack.zip", file_path: "c/pack.zip", file_size: 10 }],
  variants: [{ id: "v1", name: "Basic", price_cents: 2900, position: 0, product_variant_files: [{ digital_asset_id: "f1" }] }],
  sales: { limit: 100, sold: 2, missing: false },
}
const form = initialForm(loaded)
const saved = dirtyFieldsOf(form)

/*
  ONE CHANGE PER FIELD, BY THE FIELD'S TYPE. A field of a type with no change
  here fails "has a change", so a new kind of field gets one before it ships.
*/
function changeOf(key: DirtyField, value: unknown): unknown {
  switch (key) {
    case "description":
      return "<p>All of it, and more</p>"
    case "productType":
      return "course"
    case "refundPolicyType":
      return "30_day"
    case "mediaItems":
      return [...(value as DirtyFields["mediaItems"])].reverse()
    case "digitalFiles":
      return (value as DirtyFields["digitalFiles"]).map((f) => ({ ...f, file_name: "renamed.zip" }))
    case "variants":
      return (value as DirtyFields["variants"]).map((v) => ({ ...v, price: "31" }))
    case "whatsIncluded":
      return [...(value as string[]), "Three"]
    case "faqs":
      return (value as DirtyFields["faqs"]).map((f) => ({ ...f, answer: "B" }))
    case "customFields":
      return (value as DirtyFields["customFields"]).map((f) => ({ ...f, value: "12 cm" }))
  }
  if (typeof value === "boolean") return !value
  if (value === null) return "Other"
  if (typeof value === "string") return /^\d+(\.\d+)?$/.test(value) ? String(Number(value) + 1) : `${value} new`
  return undefined
}

console.log("\nEvery field of the form is a change, and changing it back is not\n")
{
  const keys = Object.keys(form) as (keyof typeof form)[]
  const fields = keys.filter((k) => !(NOT_SAVED_WITH_FORM as readonly string[]).includes(k)) as DirtyField[]
  check("the form has fields (enumerated from initialForm)", fields.length >= 24, fields.length)
  check("a saved product opens with nothing to save", changedFields(saved, saved).length === 0 && changedFields(dirtyFieldsOf(initialForm(loaded)), saved).length === 0)
  for (const key of fields) {
    const next = changeOf(key, saved[key])
    if (next === undefined) {
      check(`${key}: has a change in this test`, false)
      continue
    }
    const changed = { ...saved, [key]: next } as DirtyFields
    check(`${key}: a change turns Save on`, changedFields(changed, saved).includes(key), changedFields(changed, saved))
    const back = { ...changed, [key]: saved[key] } as DirtyFields
    check(`${key}: changing it back turns Save off`, changedFields(back, saved).length === 0, changedFields(back, saved))
  }
  check("the fields left out are the ones that save on their own or are not values", NOT_SAVED_WITH_FORM.join() === "productId,seoEdited,isPublished")
}

console.log("\nWhat a save cannot tell apart is no change\n")
{
  const same = (patch: Partial<DirtyFields>) => changedFields({ ...saved, ...patch }, saved).length === 0
  const diff = (patch: Partial<DirtyFields>) => changedFields({ ...saved, ...patch }, saved).length > 0
  check("a price typed as 29.00 is 29", same({ price: "29.00" }) && same({ price: " 29 " }))
  check("a title with a space at the end is the title", same({ title: "Pack " }))
  check("an empty line in What's included, or an empty question, is not saved and not a change", same({ whatsIncluded: [...saved.whatsIncluded, " "], faqs: [...saved.faqs, { id: "n", question: "", answer: "" }] }))
  check("a question typed in a new FAQ is a change", diff({ faqs: [...saved.faqs, { id: "n", question: "New?", answer: "" }] }))
  check("a variant's files in another order are the same files", same({ variants: saved.variants.map((v) => ({ ...v, assignedFiles: [...v.assignedFiles].reverse() })) }))
  check("opening a variant's card, or a new variant taking its saved id, is no change", same({ variants: saved.variants.map((v) => ({ ...v, id: "uuid", isExpanded: true })) }))
  check("moving a photo is a change (the first is the cover)", diff({ mediaItems: [...saved.mediaItems].reverse() }))
  const refundOff = { ...saved, refundPolicyEnabled: false }
  check("the refund kind is only a change while the refund policy is on", changedFields({ ...refundOff, refundPolicyType: "30_day" }, refundOff).length === 0 && changedFields({ ...saved, refundPolicyType: "30_day" }, saved).join() === "refundPolicyType")
  const limitOff = { ...saved, limitSalesEnabled: false }
  check("a sales limit's number is only a change while the limit is on", changedFields({ ...limitOff, salesLimit: "5" }, limitOff).length === 0 && changedFields({ ...saved, salesLimit: "5" }, saved).join() === "salesLimit")
  check("a file uploaded or deleted is saved when it happens, so not a change; a rename is", same({ digitalFiles: [] }) && same({ digitalFiles: [...saved.digitalFiles, { file_name: "b.pdf", file_path: "c/b.pdf", file_size: 1 }] }) && diff({ digitalFiles: saved.digitalFiles.map((f) => ({ ...f, file_name: "x.zip" })) }))
  check("rich text written differently is the same description", same({ description: "<p>All of it&nbsp;</p><p></p>".replace("&nbsp;", "") }))
  const physical = { ...saved, productType: "physical" as const }
  check("a thing that ships saves no sales badge, refund policy or button text, so they are no change there", changedFields({ ...physical, showSalesBadge: false, refundPolicyEnabled: false, callToAction: "Get" }, physical).length === 0)
  check("the older snapshotOf still says the same (a new product opens clean)", snapshotOf(dirtyFieldsOf(initialForm(null))) === snapshotOf(dirtyFieldsOf(initialForm(null))) && snapshotOf({ ...saved, compareAtPrice: "49" }) !== snapshotOf(saved))
}

console.log("\nThe cards' own drafts: the sales channel the owner unchecked\n")
{
  let cards: CardDrafts = {}
  cards = reportCardDraft(cards, "channels", ["creator_page", "marketplace", "online_store"], true)
  check("a card opens saved", changedCards(cards).length === 0)
  cards = reportCardDraft(cards, "channels", ["creator_page", "online_store"], false)
  check("unchecking a sales channel turns Save on", changedCards(cards).join() === "channels")
  cards = reportCardDraft(cards, "channels", asSet(["online_store", "marketplace", "creator_page"]), false)
  check("checking it again turns Save off", changedCards(cards).length === 0)
  cards = reportCardDraft(cards, "channels", ["online_store"], false)
  const sent = cards
  cards = cardsSaved(cards, sent)
  check("a save makes what was sent the saved value", changedCards(cards).length === 0)
  cards = reportCardDraft(cards, "physical", { weight: num("1.5") }, false)
  check("a card's first word is what it loaded", changedCards(cards).length === 0)
  cards = reportCardDraft(cards, "physical", { weight: num("1.50") }, false)
  check("and the same value typed another way is no change", changedCards(cards).length === 0)
  cards = reportCardDraft(cards, "physical", { weight: num("2") }, false)
  cards = reportCardDraft(cards, "physical", { weight: num("2") }, true)
  check("a save's read-back is saved", changedCards(cards).length === 0)
  check("a card that goes takes its draft with it", !("physical" in reportCardDraft(cards, "physical", undefined, true)))
}

/* The body of a function in a source file, from its line to the next top-level function. */
function bodyOf(src: string, start: string): string {
  const at = src.indexOf(start)
  if (at < 0) return ""
  const rest = src.slice(at + start.length)
  const end = rest.search(/\n(export )?(function|const [A-Z]\w* = )/)
  return end < 0 ? rest : rest.slice(0, end)
}
const statesOf = (body: string) => [...body.matchAll(/const \[(\w+), set\w+\] = (?:React\.)?useState/g)].map((m) => m[1])

console.log("\nThe editor's state, enumerated: each piece is in the form, a card, or named here as not saved\n")
{
  const editor = read("app/app/products/new/product-editor.tsx")
  const body = bodyOf(editor, "export function ProductEditor(")
  const literal = body.match(/const currentForm: DirtyFields = \{([\s\S]*?)\n {2}\}/)?.[1] ?? ""
  const inForm = new Set(literal.split(/[\s,]+/).filter(Boolean))
  const formKeys = (Object.keys(form) as string[]).filter((k) => !(NOT_SAVED_WITH_FORM as readonly string[]).includes(k))
  check("the editor's current form names every field of the form", formKeys.every((k) => inForm.has(k)), formKeys.filter((k) => !inForm.has(k)))
  /* Not a value Save writes, each with its reason. */
  const NOT_SAVED: Record<string, string> = {
    isLoading: "a request in flight",
    isSaving: "a request in flight",
    error: "a message",
    productId: "which product",
    savedTitle: "the saved name, for the more menu",
    isPublished: "Publish and Unpublish save at once (more menu)",
    showNotification: "a notice",
    notificationMessage: "a notice",
    savedFlash: "Save's check",
    saveBusy: "Save in flight",
    savedThisVisit: "Save's word",
    savedForm: "what is saved",
    cards: "the cards' drafts",
    showYoutubeInput: "a sheet",
    choosingFiles: "a sheet",
    youtubeInput: "typed before it is added as media",
    showCtaSheet: "a sheet",
    showRefundPolicySheet: "a sheet",
    isMobileViewport: "the screen",
    isScrolled: "the screen",
    pendingMedia: "uploads in flight; each is media once uploaded",
    compareOpen: "a fold",
    seoOpen: "a fold",
    lessonCount: "lessons save as they are made (course-editor)",
    isExternalDragOver: "a drag",
    priceMode: "read from payWhatYouWant and price, which are compared",
    faqOpen: "a fold",
    toast: "a message",
    orderLimit: "a card of its own (reportCard orderLimit)",
    releasedAt: "Discard answered",
    leaving: "the way out",
    deleting: "a request in flight",
  }
  const states = statesOf(body)
  check("the editor's state was found", states.length > 40, states.length)
  const unaccounted = states.filter((s) => !inForm.has(s) && !(s in NOT_SAVED))
  check("every piece of the editor's state is in the form or named as not saved", unaccounted.length === 0, unaccounted)
  check("and nothing named as not saved is in the form", states.filter((s) => inForm.has(s) && s in NOT_SAVED).length === 0)
}

console.log("\nThe physical product's cards, enumerated the same way\n")
{
  const src = read("components/physical/product-cards.tsx")
  const body = bodyOf(src, "function CardsInner(")
  const input = src.match(/export interface PhysicalDraftInput \{([\s\S]*?)\n\}/)?.[1] ?? ""
  const inDraft = new Set([...input.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]))
  const NOT_SAVED: Record<string, string> = {
    loading: "a request in flight",
    loadError: "a message",
    ctx: "the store's locations and settings, read",
    customsOpen: "a fold",
    advancedOpen: "a fold",
    stockAt: "which place's stock is shown",
    imageFor: "a picker",
    filesFor: "a picker",
    pending: "photos uploading",
    photoError: "a message",
  }
  const states = statesOf(body)
  check("the cards' state was found", states.length >= 25, states.length)
  const unaccounted = states.filter((s) => !inDraft.has(s) && !(s in NOT_SAVED))
  check("every piece of the cards' state is in their draft or named as not saved", unaccounted.length === 0, unaccounted)
  const draftCall = body.match(/physicalDraft\(\{([^}]*)\}\)/)?.[1] ?? ""
  check("the draft is made from every input", [...inDraft].every((k) => new RegExp(`\\b${k}\\b`).test(draftCall)), [...inDraft].filter((k) => !new RegExp(`\\b${k}\\b`).test(draftCall)))
  check("what they hold is told to the editor after each draw, as saved while a load settles", /tell\.current\?\.\(draft, settling\.current > 0\)/.test(body) && /const apply = React\.useCallback\([^)]*\) => \{\s*settle\(\)/.test(body))
}

console.log("\nWired in the editor\n")
{
  const editor = read("app/app/products/new/product-editor.tsx")
  const channels = read("app/app/products/new/sales-channels-card.tsx")
  check("Save is on exactly while something differs", /const canSave = !isLoading && !!title\.trim\(\) && isDirty/.test(editor) && /const isDirty = unsavedFields\.length > 0/.test(editor))
  check("no flag that a later draw can put back: no justSaved, no markDirty, no snapshot effect", !/justSaved|markDirty|savedValuesRef|setHasUnsavedChanges/.test(editor))
  check("the sales channels card says what is ticked, as a set, and the editor counts it", /told\.current\?\.\(\[\.\.\.on\]\.sort\(\), asLoaded\.current\)/.test(channels) && /onValue=\{reportChannels\}/.test(editor) && !/onChange\?\.\(\)/.test(channels))
  check("the physical cards and their limit per order are cards too", /onValue=\{reportPhysical\}/.test(editor) && /onOrderLimitLoaded=\{orderLimitLoaded\}/.test(editor) && /reportCard\("orderLimit", orderLimitValue\(next\), false\)/.test(editor))
  check("custom fields and the kind are fields of the form now, not a mark", /const \[customFields, setCustomFields\] = useState<CustomField\[\]>\(initial\.customFields\)/.test(editor))
  check("a save, and a draft saved on the way to Settings, make what was sent the saved value", (editor.match(/markSaved\(sentForm, sentCards, /g) ?? []).length === 2)
  check("the address and the SEO text are the saved ones while the title and description are", /if \(title === saved\.title\) \{\s*setSlug\(saved\.slug\)\s*setSeoTitle\(saved\.seoTitle\)/.test(editor) && /if \(description === savedFormRef\.current\.description\) \{\s*setSeoDescription\(savedFormRef\.current\.seoDescription\)/.test(editor))
  check("leaving still asks while anything is unsaved, and Discard lets go until the next change", /const hasUnsavedChanges = isDirty && releasedAt !== changeKey/.test(editor) && /if \(leave\) releaseUnsaved\(\)/.test(editor) && /handleBeforeUnload/.test(editor))
  check("a renamed file's name is saved (PATCH /api/storage/upload-file), and the route checks the owner", /method: "PATCH"/.test(editor) && /export async function PATCH/.test(read("app/api/storage/upload-file/route.ts")) && /ownerId !== creator\.id/.test(read("app/api/storage/upload-file/route.ts").split("export async function PATCH")[1] ?? ""))
  check("the page says which fields differ, for the probe", /data-unsaved-fields=\{unsavedFields\.join\(" "\)\}/.test(editor))
}

console.log("\nThe membership's settings, the same rule\n")
{
  const screen = read("components/memberships/creator-screen.tsx")
  check("compared as a save writes them: prices as numbers, the included products as a set", /const dirty = settingsKey\(s\) !== saved/.test(screen) && /included: asSet\(x\.included\)/.test(screen) && /monthly: num\(x\.monthly\)/.test(screen))
  check("and leaving with changes asks", /askBeforeLeaving\(\(\) => ask\(/.test(screen) && /beforeunload/.test(screen))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
