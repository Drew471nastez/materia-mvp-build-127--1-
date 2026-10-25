/**
 * ===========================================================================
 *  ROUND 35: A SECTION'S SETTING DRAGGED ON AN IMPORTED THEME
 * ===========================================================================
 * The owner: "I adjust the header height and it's very laggy and bad ...
 * everything should feel native, very smooth, clean, no lags at all."
 * Measured on Dawn in the real editor by scripts/check-compat-live-edit.ts,
 * at 1x and 4x CPU. What each part promises is held here; what it does to
 * the frames is the probe's.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { applyCut, cutBetween, editBetween, fillTemplate, learnTemplate, oneChange, templateCut, withLeaf } from "@/lib/storelib-theme/compat/live-draw"
import { CANVAS_BRIDGE } from "@/lib/storelib-theme/compat/canvas-bridge"
import { currencySymbol, flagImage } from "@/lib/storelib-theme/compat/objects"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nONE SETTING THAT MOVED")
{
  const a = { id: "h", type: "header", settings: { header_height: 76, logo: "x" }, blocks: [{ id: "b", type: "link", settings: { gap: 4 } }] }
  const c = oneChange(a, { ...a, settings: { ...a.settings, header_height: 80 } })
  check("a section setting is found with its path, its old and its new value", JSON.stringify(c) === JSON.stringify({ path: ["settings", "header_height"], from: 76, to: 80 }), c)
  const blocks = [{ ...a.blocks[0], settings: { gap: 10 } }]
  const d = oneChange(a, { ...a, blocks })
  check("so is a block's", JSON.stringify(d?.path) === JSON.stringify(["blocks", 0, "settings", "gap"]) && d?.to === 10, d)
  check("two settings moved is not one", oneChange(a, { ...a, settings: { header_height: 80, logo: "y" } }) === null)
  check("nothing moved is not one", oneChange(a, JSON.parse(JSON.stringify(a))) === null)
  check("a block added is not one setting", oneChange(a, { ...a, blocks: [...a.blocks, a.blocks[0]] }) === null)
  const put = withLeaf(a, ["blocks", 0, "settings", "gap"], 7)
  check("a value is put at a path, the rest of the section untouched", put.blocks[0].settings.gap === 7 && a.blocks[0].settings.gap === 4 && put.settings === a.settings)
}

console.log("\nA TEMPLATE OF THE SECTION FOR ONE NUMBER")
{
  /* A stand-in for Liquid: Dawn's padding (raw on a computer, `times: 0.75 | round: 0` on a phone) and a header height printed as it is. */
  const header = (v: unknown) => `<div class="section-x"><style>.header{min-height:${v}px}@media(max-width:749px){.header{padding-top:${Math.round(Number(v) * 0.75)}px}}</style><h2 class="h0">Shop 2024</h2></div>`
  const t = learnTemplate(header, { value: 76, html: header(76) })
  check("learned from drawings at the probe values", t !== null && t.kind === "number")
  let exact = true
  for (let v = 0; v <= 200; v++) if (fillTemplate(t!, v) !== header(v)) exact = false
  check("for every whole value it draws what Liquid draws, a rounded line included", exact)
  check("a value with decimals is left to Liquid", fillTemplate(t!, 76.5) === null)
  const floor = (v: unknown) => `<p style="gap:${Math.floor(Number(v) / 2)}px">${v}</p>`
  const tf = learnTemplate(floor, { value: 9, html: floor(9) })
  let floors = tf !== null
  for (let v = 0; v <= 50; v++) if (tf && fillTemplate(tf, v) !== floor(v)) floors = false
  check("an integer division (Liquid's divided_by) is read as a floor", floors)
  const branch = (v: unknown) => (Number(v) > 100 ? `<p class="tall">${v}</p>` : `<p>${v}</p>`)
  check("a section that branches on the value has no template (its probes and its drawing disagree)", learnTemplate(branch, { value: 60, html: branch(60) }) === null)
  const glued = (v: unknown) => `<p>1${v}</p>`
  check("a number printed against other digits has no template", learnTemplate(glued, { value: 5, html: glued(5) }) === null)
  const colour = (v: unknown) => `<div style="background:${v}"></div><style>.x{color:${v}}</style>`
  const tc = learnTemplate(colour, { value: "#ff0000", html: colour("#ff0000") })
  check("a colour printed as it is has a template", tc !== null && fillTemplate(tc, "#12ab9f") === colour("#12ab9f"))
  const filtered = (v: unknown) => `<div style="background:${String(v).toUpperCase()}"></div>`
  check("a colour through a filter has none", learnTemplate(filtered, { value: "#ff0000", html: filtered("#ff0000") }) === null)
  let cuts = true
  for (const [x, y] of [[76, 78], [76, 140], [99, 100], [8, 1000], [100, 9]]) {
    const c = templateCut(t!, x, y)
    if (!c || applyCut(header(x), c) !== header(y)) cuts = false
  }
  check("a template's cut, read from where its numbers are, makes the next drawing from the last", cuts)
  check("the same value is no cut", templateCut(t!, 76, 76) === null)
}

console.log("\nA CUT AND A CHANGE, NOT THE MARKUP")
{
  const big = "<ul>" + "<li>Country</li>".repeat(20000) + "</ul>"
  const before = `<div id="shopify-section-h"><style>.header{min-height:76px}</style>${big}<div style="min-height: 36px" class="bar">x</div></div>`
  const after = before.replace("min-height:76px", "min-height:140px")
  const c = cutBetween(before, after)!
  check("a cut is a few characters, not the section", c.put.length < 8 && applyCut(before, c) === after, c)
  check("a cut does not fit a drawing of another length", applyCut(before + " ", c) === null)
  const e = editBetween(before, after, c)
  check("inside one <style>: that style's text, as it was and as it is", !!e && "style" in e && e.from === ".header{min-height:76px}" && e.to === ".header{min-height:140px}", e)
  const after2 = before.replace("min-height: 36px", "min-height: 50px")
  const e2 = editBetween(before, after2)
  check("inside one tag: the tag, as it was and as it is", !!e2 && "tag" in e2 && e2.from === '<div style="min-height: 36px" class="bar">' && e2.to === '<div style="min-height: 50px" class="bar">', e2)
  const after3 = before.replace(">x</div>", ">y</div>")
  check("words between tags are not a change the frame writes by itself", editBetween(before, after3) === null)
  const after4 = before.replace("<li>Country</li>", "<li>Country</li><li>More</li>")
  check("a new element is not either", editBetween(before, after4) === null)
}

console.log("\nTHE FRAME WRITES IT WHERE IT IS")
{
  check("a cut is made from the drawing the frame holds, and a cut that does not fit asks for the section whole", /m\.type === "section" && m\.cut/.test(CANVAS_BRIDGE) && /before\.length !== c\.len\) \{ post\(\{ type: "resend", id: m\.id \}\)/.test(CANVAS_BRIDGE))
  check("a cut is never skipped for a newer message: every one is made, in order", !/m\.cut[\s\S]{0,400}asked\[m\.id\] !== n/.test(CANVAS_BRIDGE.slice(CANVAS_BRIDGE.indexOf('m.type === "section" && m.cut'), CANVAS_BRIDGE.indexOf('} else if (m.type === "section") {'))))
  check("a named change is tried first, then restyle, morph and a swap", /if \(m\.edit\) \{ try \{ done = edit\(m\.id, m\.edit, html\)[\s\S]{0,200}done = restyle\(m\.id, html, before\)[\s\S]{0,200}done = morph\(m\.id, html, before\)[\s\S]{0,120}return Promise\.resolve\(swap\(m\.id, html, before\)\)\.then\(function \(\) \{ sectionLoaded\(m\.id\); \}\)/.test(CANVAS_BRIDGE) /* Changed on purpose (round ed-1022): the swap is followed by storelib:section-load, as an in-place change is. */)
  check("restyle compares the two markups, never the page, and finds each change by what it was drawn as", /var differences = function \(a, b, out\)/.test(CANVAS_BRIDGE) && /var onPage = function \(x, drawnRoot, live\)/.test(CANVAS_BRIDGE))
  check("a <style>'s new text is written into its rules, declaration by declaration, when the rules line up", /var ruleOps = function \(live, a, b, ops\)/.test(CANVAS_BRIDGE) && /st\.setProperty\(q, v, pr\)/.test(CANVAS_BRIDGE) && /s\.__slText = to/.test(CANVAS_BRIDGE))
  check("a style rule holding nested rules is still a style rule", /if \(ra\.style && rb\.style && rl\.style\) \{/.test(CANVAS_BRIDGE))
  check("what morph writes as text forgets the rules' text", /live\.__slText = undefined; live\.textContent = b\.textContent;/.test(CANVAS_BRIDGE))
  check("a change written in place reads no scroll back (a layout per value)", !/var written = function[\s\S]{0,300}scrollY/.test(CANVAS_BRIDGE))
  /* Changed on purpose (round 14): streaming ends two quiet frames after the last value or scroll (streamingOn), not 250ms after it, which a slow frame outlasted. */
  check("while values stream in, the outline follows the box without hit tests", /if \(streamingOn\) \{/.test(CANVAS_BRIDGE) && /streaming\(\);\n    drawn\[id\] = html;/.test(CANVAS_BRIDGE))
  check("the marked elements are found from what marked them, not by searching the page", /var hov = hovered && hovered\.isConnected/.test(CANVAS_BRIDGE) && !/document\.querySelector\("\[data-sl-hover\]"\)/.test(CANVAS_BRIDGE))
  /* Changed on purpose (round BC): looked up again only when the page's elements changed, not once a frame. */
  check("the header's sticky bars are read once a frame", /if \(!topsCache \|\| !topsHere\(\)\) topsCache = document\.querySelectorAll\(HEADER_TOPS\)/.test(CANVAS_BRIDGE) && /records\[j\]\.type === "childList"\) \{ topsCache = null; break; \}/.test(CANVAS_BRIDGE))
  let parses = true
  try { new Function(CANVAS_BRIDGE) } catch { parses = false }
  check("the bridge still parses", parses)
}

console.log("\nTHE CANVAS")
{
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("a live value is drawn from the live layer when it is set, not after a render and an effect", /useEffect\(\(\) => onLiveChange\(\(\) => \{/.test(canvas) && /sync\.current\(list\)/.test(canvas))
  check("a live value is drawn from its section's template once learned, and Liquid is asked only otherwise", /html = known\.t \? fillTemplate\(known\.t, change\.to\) : null/.test(canvas) && /ctx \?\?= pageContextFor\(compatTheme, page, list\)/.test(canvas))
  check("a template is learned one drawing a task, each with a context of its own", /window\.setTimeout\(next, 0\)/.test(canvas) && /drawSection\(theme, pageContextFor\(theme, drawnPage, list\)/.test(canvas))
  check("a section shown from its template keeps what Liquid last drew as what it was drawn from, so the release draws it by Liquid", /Shown, not drawn: the release draws it by Liquid/.test(canvas) && /slot\.liveShown \?\?= new Map\(\)\)\.set\(s\.id, jsonOf\(s\)\)/.test(canvas))
  check("only the first drawing of a section goes whole; after it, cuts", /slot\.sent\?\.has\(s\.id\)\s*\?/.test(canvas) && /type: "section", id: s\.id, cut,/.test(canvas))
  check("the frame asking again is answered with the section whole", /m\.type === "resend"/.test(canvas))
  check("a page drawn whole forgets what the frame was sent section by section", /now\.sent\?\.clear\(\)/.test(canvas) && /now\.realHtml\?\.clear\(\)/.test(canvas))
  check("the ghost box asks the toolbar to measure only when its place moved", /\}, \[ghostPlace\]\)/.test(canvas))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the section toolbar renders only when its place changed", /setBox\(\(was\) => \(was && was\.top === next\.top && was\.right === next\.right \? was : next\)\)/.test(editor))
}

console.log("\nA PAGE'S CONTEXT IS CHEAPER TO READ")
{
  check("a currency's sign is read once", currencySymbol("EUR") === currencySymbol("EUR") && currencySymbol("EUR") === "€")
  check("a flag is drawn once", flagImage("IT") === flagImage("IT") && flagImage("IT").startsWith("data:image/svg+xml,"))
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
