/**
 * The setting types added to close the gap with Shopify's theme settings,
 * the resolver that now holds every value to its type, and dynamic sources.
 *
 * Each new type is checked three ways, the way a theme developer meets it:
 * the schema validator (does a declaration pass), the resolver (what does a
 * template receive for a good value, a bad one and no value), and the
 * template (what reaches the page). Security cases are written as the
 * attacks they are, not as abstractions.
 *
 *   npx esbuild tests/theme-setting-types.test.ts --bundle --platform=node --format=cjs \
 *     --alias:@=. --alias:server-only=/tmp/claude-0/empty.js --outfile=/tmp/t.cjs && node /tmp/t.cjs
 */
import {
  CONTROLS,
  CONTROL_TYPES,
  DYNAMIC_SOURCES,
  Linked,
  cleanBackground,
  cleanFocalPoint,
  cleanMenus,
  compileSection,
  compileTemplate,
  fillSources,
  formatDatetime,
  parseDatetime,
  parseVideoUrl,
  renderSection,
  renderTemplate,
  resolveSettings,
  resolveInstance,
  safeHref,
  sanitizeInlineHtml,
  sourcesFor,
  sourcesIn,
  validateSectionSchema,
  wholeSource,
  type DynamicContext,
  type RenderContext,
  type SectionSchema,
} from "../lib/storelib-theme"
import { insertPlaceholder, placeholderParts } from "../lib/storelib-theme/dynamic"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else { failed++; failures.push(name) }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
function section(t: string) { console.log(`\n${t}`) }

const valid = (settings: unknown[]) => validateSectionSchema({ type: "x", name: "X", settings }).ok
const errorsOf = (settings: unknown[]) => {
  const r = validateSectionSchema({ type: "x", name: "X", settings })
  return r.ok === false ? r.errors.map((e) => e.message).join(" | ") : ""
}
const one = (setting: Record<string, unknown>, saved: unknown, opts = {}) =>
  resolveSettings([setting as never], saved === undefined ? {} : { [String(setting.id)]: saved }, opts)[String(setting.id)]
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  settings: {}, blocks: [], theme: {}, page: { template: "index" }, section: { id: "s1", type: "t" }, scheme: {}, assets: {}, ...over,
})
const render = (src: string, c: Partial<RenderContext> = {}) => {
  const t = compileTemplate(src)
  if (t.ok === false) throw new Error(t.errors.map((e) => e.message).join("; "))
  return renderTemplate(t.value, ctx(c))
}

// ═══════════════════════════════════════════════════════════════════════════
section("The new types are in the registry, and each example is a working declaration")
// ═══════════════════════════════════════════════════════════════════════════
{
  const added = ["inline_richtext", "html", "color_background", "datetime", "focal_point", "video_url", "product_list", "link_list"]
  check("all eight are control types", added.every((t) => (CONTROL_TYPES as readonly string[]).includes(t)), added.filter((t) => !(CONTROL_TYPES as readonly string[]).includes(t)))
  check("each has an editor component and a description", added.every((t) => CONTROLS[t as keyof typeof CONTROLS].component && CONTROLS[t as keyof typeof CONTROLS].description.length > 40))
  check("each one's example validates on its own", added.every((t) => valid([CONTROLS[t as keyof typeof CONTROLS].example])))
  check("none of their descriptions has an em dash", added.every((t) => !/[—–]/.test(CONTROLS[t as keyof typeof CONTROLS].description)))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Shopify's names validate, and Shopify types with nothing to point at say why")
// ═══════════════════════════════════════════════════════════════════════════
{
  check("text_alignment is alignment", valid([{ type: "text_alignment", id: "a", label: "A", default: "center" }]))
  check("product is product_picker", valid([{ type: "product", id: "p", label: "P" }]))
  check("page is page_picker", valid([{ type: "page", id: "p", label: "P" }]))
  /* Collections exist now (Products › Collections), so Shopify's names for picking them mean Storelib's pickers. */
  check("collection is collection_picker", valid([{ type: "collection", id: "c", label: "C" }]))
  check("collection_list is its own control", valid([{ type: "collection_list", id: "c", label: "C", limit: 6 }]))
  check("liquid is html: kept, cleaned, never run", valid([{ type: "liquid", id: "l", label: "L" }]))
  check("blog is still refused, with the reason", /is a type Storelib does not have\. A Storelib website has no blog/.test(errorsOf([{ type: "blog", id: "b", label: "B" }])), errorsOf([{ type: "blog", id: "b", label: "B" }]))
  check("and so is metaobject", /no metaobjects/.test(errorsOf([{ type: "metaobject", id: "m", label: "M" }])))
  check("a type that is simply wrong still lists the real ones", /not a Storelib control\. Use one of: text/.test(errorsOf([{ type: "txet", id: "t", label: "T" }])))
}

// ═══════════════════════════════════════════════════════════════════════════
section("inline_richtext: one line, rebuilt from an allow list")
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = { type: "inline_richtext", id: "h", label: "H", default: "Made <em>slowly</em>" }
  check("a default with markup validates", valid([s]))
  check("a number default does not", !valid([{ ...s, default: 5 }]))
  check("unset, the default is what the template gets", one(s, undefined) === "Made <em>slowly</em>")
  const attack = `<script>alert(1)</script><strong onclick="steal()">Hi</strong> <a href="javascript:alert(1)">x</a> <a href="jav&#97;script:alert(2)">y</a> <a href="  JaVaScRiPt:alert(3)">z</a> <img src=x onerror=alert(4)><svg onload=alert(5)></svg><a href="/about" target="_blank">About</a>`
  const out = String(one(s, attack))
  check("no script, no handler, no javascript: link survives", !/script|onclick|onerror|onload|javascript|<img|<svg/i.test(out), out)
  check("the words of the refused links are kept", out.includes("x") && out.includes("y") && out.includes("z"))
  check("bold stays bold, with nothing on it", out.includes("<strong>Hi</strong>"), out)
  check("a safe link stays, and _blank gets its rel", out.includes(`<a href="/about" target="_blank" rel="noopener noreferrer">About</a>`), out)
  check("an unclosed tag is closed at the end", sanitizeInlineHtml("<em>open") === "<em>open</em>")
  check("a stray closing tag is ignored", sanitizeInlineHtml("a</strong>b") === "ab")
  check("a paragraph is not inline: its words are kept, the block is not", sanitizeInlineHtml("<p>One</p><h1>Two</h1>") === "OneTwo")
  check("text that looks like markup is escaped, not dropped", sanitizeInlineHtml("1 < 2 & 3 > 2") === "1 &lt; 2 &amp; 3 &gt; 2", sanitizeInlineHtml("1 < 2 & 3 > 2"))
  check("an entity already escaped stays one entity", sanitizeInlineHtml("Tom &amp; Jerry") === "Tom &amp; Jerry")
  check("new lines become spaces: it is one line", sanitizeInlineHtml("a\nb") === "a b")
  check("a quote in an address cannot leave the attribute", !sanitizeInlineHtml(`<a href='/x" onmouseover="alert(1)'>x</a>`).includes(`" onmouseover`), sanitizeInlineHtml(`<a href='/x" onmouseover="alert(1)'>x</a>`))
  check("a link inside a link is not nested", (sanitizeInlineHtml(`<a href="/a"><a href="/b">x</a></a>`).match(/<a /g) ?? []).length === 1)
  const tpl = render(`<h2>{{ settings.h | raw }}</h2>`, { settings: { h: out } })
  check("printed with raw, what reaches the page is only the clean markup", !/script|onclick/i.test(tpl) && tpl.includes("<strong>Hi</strong>"))
}

// ═══════════════════════════════════════════════════════════════════════════
section("color_background: a colour or a gradient, and nothing that leaves the declaration")
// ═══════════════════════════════════════════════════════════════════════════
{
  const ok = [
    "#fff", "#1a1a2e", "rgba(0, 0, 0, 0.4)", "transparent",
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(to right, #fff, #000)",
    "radial-gradient(circle at center, rgba(0,0,0,0.5) 0%, transparent 70%)",
    "conic-gradient(from 90deg, #f00, #00f)",
  ]
  const bad = [
    "red; background-image: url(https://evil.example/x.png)",
    "url(https://evil.example/x.png)",
    "linear-gradient(#fff, #000), url(x)",
    "expression(alert(1))",
    "var(--secret)",
    "linear-gradient(#fff, #000",
    "linear-gradient(#fff, #000))",
    "linear-gradient(#fff, #000)} body { display: none",
    "linear-gradient(\"x\", #000)",
    "</style><script>alert(1)</script>",
  ]
  check("every real background passes", ok.every((v) => cleanBackground(v) !== ""), ok.filter((v) => cleanBackground(v) === ""))
  check("every attack is refused", bad.every((v) => cleanBackground(v) === ""), bad.filter((v) => cleanBackground(v) !== ""))
  const s = { type: "color_background", id: "bg", label: "BG", default: "#f8f9fa" }
  check("a gradient default validates", valid([{ ...s, default: ok[4] }]))
  check("an attack as a default is refused by the validator", !valid([{ ...s, default: bad[0] }]))
  check("a saved attack is drawn as the default", one(s, bad[0]) === "#f8f9fa", one(s, bad[0]))
  check("a saved gradient is drawn as it is", one(s, ok[4]) === ok[4])
}

// ═══════════════════════════════════════════════════════════════════════════
section("datetime: read as written, in no time zone but its own")
// ═══════════════════════════════════════════════════════════════════════════
{
  check("a date, a date and time, and with a zone all parse", ["2026-03-14", "2026-03-14T23:00", "2026-03-14T23:00:30", "2026-03-14T23:00+02:00", "2026-03-14T23:00Z"].every((v) => parseDatetime(v) !== null))
  check("30 February, month 13 and 14/03/2026 do not", ["2026-02-30", "2026-13-01", "14/03/2026", "2026-03-14T24:00", "tomorrow"].every((v) => parseDatetime(v) === null))
  check("29 February only in a leap year", parseDatetime("2028-02-29") !== null && parseDatetime("2027-02-29") === null)
  check("long, short and time read as a person writes them", formatDatetime("2026-03-14T23:00", "long") === "14 March 2026" && formatDatetime("2026-03-14T23:00", "short") === "14 Mar 2026" && formatDatetime("2026-03-14T23:00", "time") === "23:00")
  check("a zone never moves the time it says", formatDatetime("2026-03-14T23:30-08:00", "long_time") === "14 March 2026, 23:30")
  const s = { type: "datetime", id: "ends", label: "Ends" }
  check("garbage saved is drawn as nothing", one(s, "next friday") === "")
  check("the date filter formats it in a template", render(`{{ settings.ends | date: "short" }}`, { settings: { ends: "2026-03-14" } }) === "14 Mar 2026")
}

// ═══════════════════════════════════════════════════════════════════════════
section("focal_point: two percentages, clamped, for object-position")
// ═══════════════════════════════════════════════════════════════════════════
{
  check("30% 70% is kept", cleanFocalPoint("30% 70%") === "30% 70%")
  check("out of range is clamped", cleanFocalPoint("130% -5%") === "100% 0%")
  check("words and CSS are not focal points", ["center", "50%", "50% 50%; background:red", "calc(50%) 10%"].every((v) => cleanFocalPoint(v) === ""))
  const s = { type: "focal_point", id: "focus", label: "Focus" }
  check("unset, it is the middle", one(s, undefined) === "50% 50%")
  check("garbage is the middle", one(s, "top; background:url(x)") === "50% 50%")
  check("image must name an image_picker beside it", valid([{ type: "image_picker", id: "photo", label: "P" }, { ...s, image: "photo" }]) && /not an image_picker/.test(errorsOf([{ type: "text", id: "photo", label: "P" }, { ...s, image: "photo" }])))
}

// ═══════════════════════════════════════════════════════════════════════════
section("video_url: a YouTube or Vimeo link, however it was pasted")
// ═══════════════════════════════════════════════════════════════════════════
{
  const yt = ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ"]
  check("five YouTube shapes are one video", yt.every((u) => parseVideoUrl(u)?.id === "dQw4w9WgXcQ"), yt.map((u) => parseVideoUrl(u)?.id))
  check("Vimeo, page or player", parseVideoUrl("https://vimeo.com/76979871")?.id === "76979871" && parseVideoUrl("https://player.vimeo.com/video/76979871")?.host === "vimeo")
  check("the player address is the privacy-respecting one", parseVideoUrl(yt[0])?.embed === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")
  check("a lookalike host is not YouTube", parseVideoUrl("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ") === null && parseVideoUrl("https://evil.example/?u=https://youtu.be/dQw4w9WgXcQ") === null)
  check("javascript: is not a video", parseVideoUrl("javascript:alert(1)//youtu.be/dQw4w9WgXcQ") === null)
  const s = { type: "video_url", id: "v", label: "V" }
  check("a saved non-video is drawn as nothing", one(s, "https://example.com/film.mp4") === "")
  check("accept narrows it", one({ ...s, accept: ["vimeo"] }, yt[0]) === "" && one({ ...s, accept: ["vimeo"] }, "https://vimeo.com/76979871") === "https://vimeo.com/76979871")
  check("an accept naming another host is refused", /accept lists the hosts/.test(errorsOf([{ ...s, accept: ["dailymotion"] }])))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Every value is held to its type as it is drawn, and the stored value is not touched")
// ═══════════════════════════════════════════════════════════════════════════
{
  const sel = { type: "select", id: "shape", label: "Shape", default: "1 / 1", options: [{ label: "Square", value: "1 / 1" }, { label: "Tall", value: "3 / 4" }] }
  check("a select value it does not list is drawn as the default", one(sel, "1 / 1; background: url(//evil)") === "1 / 1")
  check("one it lists is drawn", one(sel, "3 / 4") === "3 / 4")
  const range = { type: "range", id: "pad", label: "Pad", min: 0, max: 100, default: 40 }
  check("a word in a range is the default", one(range, "big") === 40)
  check("a number written as text is the number", one(range, "24") === 24)
  const resp = { ...range, responsive: true, default: { desktop: 40, mobile: 16 } }
  check("each breakpoint is held to it on its own", JSON.stringify(one(resp, { desktop: 60, tablet: "x" })) === JSON.stringify({ desktop: 60, tablet: 40, mobile: 16 }), one(resp, { desktop: 60, tablet: "x" }))
  check("a colour that is not a colour is the default", one({ type: "color", id: "c", label: "C", default: "#ffffff" }, "red; x: y") === "#ffffff")
  check("a font name cannot end its declaration", one({ type: "font_picker", id: "f", label: "F", default: "Inter" }, "Inter; background: red") === "Inter")
  check("a toggle written as text is a boolean", one({ type: "toggle", id: "t", label: "T", default: false }, "true") === true)
  check("an alignment that is not one is the default", one({ type: "alignment", id: "a", label: "A", default: "center" }, "middle") === "center")
  const url = { type: "url", id: "link", label: "L", default: "/products" }
  check("a javascript: link is # before any template sees it", one(url, "javascript:alert(document.cookie)") === "#")
  check("so a template that forgot | url is still safe", !/javascript/i.test(render(`<a href="{{ settings.link }}">x</a>`, { settings: { link: one(url, "javascript:alert(1)") } })))
  check("/\\host is another site to a browser, so it is not ours", safeHref("/\\evil.example") === "#" && safeHref("//evil.example") === "#")
  check("one of ours, a web address, mailto and tel pass", ["/about", "https://x.example/a?b=c", "mailto:a@b.co", "tel:+44123", "#faq"].every((u) => safeHref(u) === u))
  const img = { type: "image_picker", id: "img", label: "I" }
  check("a picture cannot be javascript: or an HTML data URL", one(img, "javascript:alert(1)") === "" && one(img, "data:text/html,<script>alert(1)</script>") === "")
  check("a real picture and an inline PNG are kept", one(img, "https://cdn.example/a.webp") === "https://cdn.example/a.webp" && String(one(img, "data:image/png;base64,iVBOR")).startsWith("data:image/png"))
  const stored = { shape: "1 / 1; background: url(//evil)" }
  resolveSettings([sel as never], stored)
  check("and the stored value is exactly as it was", stored.shape === "1 / 1; background: url(//evil)")
}

// ═══════════════════════════════════════════════════════════════════════════
section("product_picker and product_list read the real products")
// ═══════════════════════════════════════════════════════════════════════════
{
  const catalog = [
    { id: "p1", type: "product", settings: { title: "Linen apron", price: "$64.00", compare_price: "", image: "https://cdn.example/a.webp", url: "/products/linen-apron", tag: "" } },
    { id: "p2", type: "product", settings: { title: "Card wallet", price: "$29.00", compare_price: "$35.00", image: "", url: "/products/card-wallet", tag: "Sold out" } },
    { id: "p3", type: "product", settings: { title: "Wash bag", price: "$38.00", compare_price: "", image: "", url: "/products/wash-bag", tag: "" } },
  ]
  const picker = { type: "product_picker", id: "product", label: "Product" }
  const linked = one(picker, "/products/card-wallet", { catalog })
  check("a picked product the page knows becomes a Linked value", linked instanceof Linked)
  check("it prints as its address, as it always did", render(`<a href="{{ settings.product | url }}">{{ settings.product.title }}</a>`, { settings: { product: linked } }) === `<a href="/products/card-wallet">Card wallet</a>`)
  check("it compares as its address", render(`{% if settings.product == "/products/card-wallet" %}yes{% endif %}`, { settings: { product: linked } }) === "yes")
  check("and reads price and id", render(`{{ settings.product.price }} {{ settings.product.id }}`, { settings: { product: linked } }) === "$29.00 p2")
  check("picked by id works too", (one(picker, "p1", { catalog }) as Linked).href === "/products/linen-apron")
  check("a product the page does not know stays the address it holds", one(picker, "/products/gone", { catalog }) === "/products/gone")
  check("a javascript: address in a picker is #", one(picker, "javascript:alert(1)", { catalog }) === "#")

  const list = { type: "product_list", id: "featured", label: "Products", limit: 2 }
  check("a list arrives in the creator's order, block-shaped", JSON.stringify((one(list, ["p3", "p1"], { catalog }) as { id: string }[]).map((p) => p.id)) === JSON.stringify(["p3", "p1"]))
  check("unknown ids are dropped, repeats counted once, and the limit holds", JSON.stringify((one(list, ["nope", "p2", "p2", "p1", "p3"], { catalog }) as { id: string }[]).map((p) => p.id)) === JSON.stringify(["p2", "p1"]))
  check("with no catalogue it is an empty list, never an error", Array.isArray(one(list, ["p1"])) && (one(list, ["p1"]) as unknown[]).length === 0)
  check("a limit of 0 or 25 is refused", /limit is a whole number from 1 to 24/.test(errorsOf([{ ...list, limit: 0 }])) && !valid([{ ...list, limit: 25 }]))
  const tpl = render(`{% for block in settings.featured %}<b>{{ block.settings.title }}</b>{% endfor %}`, { settings: { featured: one(list, ["p1", "p2"], { catalog }) } })
  check("the same card body that loops over products loops over it", tpl === "<b>Linen apron</b><b>Card wallet</b>", tpl)
}

// ═══════════════════════════════════════════════════════════════════════════
section("link_list: a menu by handle, every address already safe")
// ═══════════════════════════════════════════════════════════════════════════
{
  const menus = cleanMenus({
    "main-menu": { title: "Main", links: [{ title: "Shop", url: "/products", links: [{ title: "Ebooks", url: "/products?type=ebook" }] }, { title: "Bad", url: "javascript:alert(1)" }, { title: "", url: "/empty" }] },
    "Bad Handle": { title: "x", links: [] },
  })
  check("a handle that is not a handle is dropped", !("Bad Handle" in menus))
  check("a link with no title is dropped", menus["main-menu"].links.length === 2)
  check("a javascript: link in a menu is #", menus["main-menu"].links[1].url === "#")
  const s = { type: "link_list", id: "menu", label: "Menu", default: "main-menu" }
  const m = one(s, undefined, { menus }) as { title: string; links: { title: string; links?: { title: string }[] }[] }
  check("the template receives title and nested links", m.title === "Main" && m.links[0].links?.[0].title === "Ebooks")
  check("an unknown handle is an empty menu", JSON.stringify(one(s, "footer", { menus })) === JSON.stringify({ handle: "footer", title: "", links: [] }))
  check("a handle with capitals is refused by the validator", !valid([{ ...s, default: "Main Menu" }]))
  const deep = cleanMenus({ m: { title: "M", links: [{ title: "1", url: "/1", links: [{ title: "2", url: "/2", links: [{ title: "3", url: "/3", links: [{ title: "4", url: "/4" }] }] }] }] } })
  check("nothing deeper than three levels", deep.m.links[0].links?.[0].links?.[0].links === undefined)
}

// ═══════════════════════════════════════════════════════════════════════════
section("A renamed setting keeps its value (migrations)")
// ═══════════════════════════════════════════════════════════════════════════
{
  const schema = { type: "t", name: "T", schema_version: 1, version: "1.1.0", settings: [{ type: "text", id: "heading", label: "H", default: "" }], migrations: [{ from: "title", to: "heading", since: "1.1.0" }] } as unknown as SectionSchema
  check("the old value is read under the new name", resolveInstance(schema, { type: "t", settings: { title: "Old words" } }).settings.heading === "Old words")
  check("a value saved under the new name wins", resolveInstance(schema, { type: "t", settings: { title: "Old", heading: "New" } }).settings.heading === "New")
}

// ═══════════════════════════════════════════════════════════════════════════
section("The storefront's own facts: shop, creator and product")
// ═══════════════════════════════════════════════════════════════════════════
{
  const src = `<template><p>{{ shop.name }} by {{ creator.name }}</p>{% if product %}<h1>{{ product.title }}</h1>{% endif %}</template>\n<schema>{"type":"facts","name":"Facts","settings":[]}</schema>`
  const c = compileSection(src, { file: "sections/facts.storelib" })
  check("a section may read them", c.ok === true, c.ok === false ? c.errors : undefined)
  if (c.ok === true) {
    const home = renderSection({ compiled: c.value, id: "f1", instance: { type: "facts" }, theme: {}, page: { template: "index" }, data: { shop: { name: "Drew & Co" }, creator: { name: "Drew" } } })
    check("they are escaped like any value", home.html.includes("Drew &amp; Co by Drew"))
    check("off the product page there is no product", !home.html.includes("<h1>"))
    const pdp = renderSection({ compiled: c.value, id: "f1", instance: { type: "facts" }, theme: {}, page: { template: "product" }, data: { product: { title: "<Tee>" } } })
    check("on it, the product, escaped", pdp.html.includes("<h1>&lt;Tee&gt;</h1>"))
    const none = renderSection({ compiled: c.value, id: "f1", instance: { type: "facts" }, theme: {}, page: { template: "index" } })
    check("and with nothing supplied, nothing is drawn rather than an error", none.html.includes("<p> by </p>"))
  }
  check("strip_html gives the words", render(`{{ settings.h | strip_html }}`, { settings: { h: "<strong>A</strong> &amp; B" } }) === "A &amp; B")
}

// ═══════════════════════════════════════════════════════════════════════════
section("Dynamic sources: a closed list, escaped for where it lands")
// ═══════════════════════════════════════════════════════════════════════════
{
  const dyn: DynamicContext = {
    shop: { name: "Drew & Co", url: "https://drew.storelib.com", product_count: 12 },
    creator: { name: "Drew", avatar: "https://cdn.example/drew.webp", bio: "Makes <things>" },
    product: { title: "Tee <b>", price: "$20.00", description_html: "<p>Soft <strong>cotton</strong></p>", url: "/products/tee", image: "https://cdn.example/tee.webp" },
    date: { year: 2026 },
  }
  check("every source has a label and a description, and none has an em dash", DYNAMIC_SOURCES.every((s) => s.label && s.description && !/[—–]/.test(s.description + s.label)))
  check("a text setting gets the words, left for the template to escape", fillSources("Buy {{ product.title }} now", "text", dyn) === "Buy Tee <b> now")
  check("and the template does escape them", render(`<h2>{{ settings.h }}</h2>`, { settings: { h: fillSources("Buy {{ product.title }} now", "text", dyn) } }) === "<h2>Buy Tee &lt;b&gt; now</h2>")
  check("a rich text setting gets them escaped, because it is printed raw", fillSources("<p>{{ product.title }}</p>", "richtext", dyn) === "<p>Tee &lt;b&gt;</p>")
  check("a description in a heading is its words", fillSources("{{ product.description }}", "text", dyn) === "Soft cotton")
  check("in a rich text setting it is its cleaned markup", fillSources("{{ product.description }}", "richtext", dyn) === "<p>Soft <strong>cotton</strong></p>")
  check("in inline rich text only the inline part of it", fillSources("{{ product.description }}", "inline_richtext", dyn) === "Soft <strong>cotton</strong>")
  check("a description with no cleaned markup is escaped, never trusted", fillSources("{{ product.description }}", "richtext", { product: { description: "<img src=x onerror=alert(1)>" } }) === "&lt;img src=x onerror=alert(1)&gt;")
  check("a link takes a source only as its whole value", fillSources("{{ product.url }}", "url", dyn) === "/products/tee" && fillSources("/x/{{ product.url }}", "url", dyn) === "/x/{{ product.url }}")
  check("and only an address: a title in a link is left alone", fillSources("{{ product.title }}", "url", dyn) === "{{ product.title }}")
  check("a picture takes a picture", fillSources("{{ creator.avatar }}", "image_picker", dyn) === "https://cdn.example/drew.webp")
  check("a hostile picture address is refused", fillSources("{{ creator.avatar }}", "image_picker", { creator: { avatar: "javascript:alert(1)" } }) === "")
  check("a number takes a number", fillSources("{{ shop.product_count }}", "range", dyn) === 12)
  check("text reads a number and a year as words", fillSources("© {{ date.year }} {{ shop.name }}", "text", dyn) === "© 2026 Drew & Co")
  check("a name that is not a source is left exactly as typed", fillSources("{{ product.cost_price }} and {{ hello }}", "text", dyn) === "{{ product.cost_price }} and {{ hello }}")
  check("a product source with no product is empty", fillSources("Buy {{ product.title }}", "text", { shop: dyn.shop }) === "Buy ")
  check("a value that holds a placeholder is not scanned twice", fillSources("{{ creator.name }}", "text", { creator: { name: "{{ shop.name }}" } }) === "{{ shop.name }}")
  check("a colour or a select holds no source", fillSources("{{ shop.name }}", "color", dyn) === "{{ shop.name }}" && fillSources("{{ shop.name }}", "select", dyn) === "{{ shop.name }}")
  check("a value with no placeholder is the same value", fillSources("plain", "text", dyn) === "plain")
  check("sources a value names are listed", JSON.stringify(sourcesIn("{{ shop.name }} {{ nope.x }} {{shop.name}} {{ date.year }}")) === JSON.stringify(["shop.name", "date.year"]))
  check("a whole binding is recognised with or without spaces", wholeSource("{{product.image}}") === "product.image" && wholeSource(" {{ product.image }} ") === "product.image" && wholeSource("x {{ product.image }}") === null)
  check("the editor reads a value back as words and source names", JSON.stringify(placeholderParts("Get {{ product.title }} today &amp; {{ nope.x }}")) === JSON.stringify([{ text: "Get " }, { source: "product.title", label: "Product title" }, { text: " today & {{ nope.x }}" }]))
  check("and markup around a source as words", JSON.stringify(placeholderParts("<p>By {{creator.name}}</p>")) === JSON.stringify([{ text: "By " }, { source: "creator.name", label: "Creator name" }]))
  check("a placeholder goes in at the caret with a space where it would run into a word", insertPlaceholder("Gettoday", "product.title", 3).value === "Get {{ product.title }} today" && insertPlaceholder("Get today", "product.title", 4).value === "Get {{ product.title }} today")
  check("and at the end when there is no caret", insertPlaceholder("Hi", "shop.name").value === "Hi {{ shop.name }}" && insertPlaceholder("", "shop.name").value === "{{ shop.name }}" && insertPlaceholder("x", "shop.name", 99).value === "x {{ shop.name }}")
  check("the caret lands after what went in", (() => { const r = insertPlaceholder("Get today", "product.title", 4); return r.value.slice(0, r.caret) === "Get {{ product.title }} " })())
  check("the editor offers product sources on the product page only", sourcesFor("text", "index").every((s) => !s.id.startsWith("product.")) && sourcesFor("text", "product").some((s) => s.id === "product.title"))
  check("a picture setting is offered pictures, a link addresses, a colour nothing", sourcesFor("image_picker", "product").every((s) => s.kind === "image") && sourcesFor("url", "index").every((s) => s.kind === "url") && sourcesFor("color", "index").length === 0)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
