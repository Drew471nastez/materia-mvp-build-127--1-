/**
 * ===========================================================================
 *  THE STORY EDITOR STILL OPENS, AND STILL HAS EVERY FIELD
 * ===========================================================================
 * Its render was replaced: it built its own dialog and now uses the shared
 * EditorSheet. `pnpm build` cannot tell you whether a component runs —
 * next.config.mjs sets ignoreBuildErrors, and three separate features shipped
 * dead behind that this month. So this clicks the real pencil and reads what
 * appears.
 *
 *   pnpm build && node scripts/check-about-sheet.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const cssDir = join(root, ".next/static/chunks")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
const out = mkdtempSync(join(tmpdir(), "storelib-about-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-about-sheet.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--alias:next/navigation=/tmp/claude-0/-home-user-materia-mvp-build-127--1-/68737670-c97a-5eb7-8405-30ea4d9942e8/scratchpad/router-stub.ts", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0}[data-slot="dialog-content"]{animation:none!important;transform:none!important;opacity:1!important}</style></head><body><script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});</script><div id="app"></div><script src="probe.js"></script>
<script>
setTimeout(function () {
  var btn = document.querySelector('[aria-label="Edit your story"]')
  if (btn) btn.click()
  setTimeout(function () {
    var panel = document.querySelector('[data-slot="dialog-content"]')
    var text = panel ? (panel.textContent || "") : ""
    var res = {
      errors: window.__err,
      opened: !!panel,
      title: !!document.querySelector('[data-slot="dialog-title"]'),
      titleText: (document.querySelector('[data-slot="dialog-title"]') || {}).textContent || "",
      headline: !!document.getElementById("ea-headline"),
      contact: !!document.getElementById("ea-contact"),
      richText: !!(panel && panel.querySelector('[contenteditable]')),
      footerButtons: panel ? Array.prototype.map.call(panel.querySelectorAll('[data-editor-footer] button'), function (b) { return (b.textContent || "").trim() }) : [],
      mentionsMedia: text.indexOf("Photos and video") !== -1,
    }
    var pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(res); document.body.append(pre)
  }, 600)
}, 600)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--force-device-scale-factor=1", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("Nothing reported at all — the page threw before it could answer.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
console.log(JSON.stringify(r, null, 2))

const problems = []
if (r.errors.length) problems.push(`it threw: ${r.errors.join(" | ")}`)
if (!r.opened) problems.push("the pencil does not open anything.")
if (r.titleText.trim() !== "Your story") problems.push(`the sheet is titled "${r.titleText.trim()}".`)
if (!r.headline) problems.push("the story headline field is gone.")
if (!r.richText) problems.push("the story itself is not editable — the rich text field is missing.")
if (!r.contact) problems.push("the contact email field is gone.")
if (!r.mentionsMedia) problems.push("the photos and video section is gone.")
if (r.footerButtons.join("/") !== "Cancel/Save") problems.push(`the footer reads ${JSON.stringify(r.footerButtons)}, not Cancel then Save.`)

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nThe story editor opens with every field, and Cancel and Save are where they were.\n")
