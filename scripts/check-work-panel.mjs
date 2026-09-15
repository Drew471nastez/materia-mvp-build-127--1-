/**
 * ===========================================================================
 *  THE RUN, SHOWN AS IT HAPPENS
 * ===========================================================================
 * tests/work-panel.test.ts proves the loop emits a plan, a pair of events per
 * tool call, and the source of anything it writes. This is the other half:
 * whether a person watching the panel sees the work.
 *
 * The real chat is mounted in Chromium with the agent endpoint answered by a
 * local stream of those same events, one at a time with a gap between them.
 * So what is measured is the panel updating during a run, not a finished list
 * rendered in one go.
 *
 *   pnpm build && node scripts/check-work-panel.mjs   (add KEEP_SHOT=1)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/probe-install"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({ installId: "probe-install" })
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\n`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, ...rest }) { const { fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...ok } = rest; return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...ok }) }\n`)
writeFileSync(join(stubs, "supabase-client.js"), `const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? undefined : chain, apply: () => chain() })
export function createClient() {
  return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    from: () => chain(), channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }), removeChannel() {} }

export const useLinkStatus = () => ({ pending: false })
}
`)

const out = mkdtempSync(join(tmpdir(), "storelib-work-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-work-panel.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/image=${join(stubs, "image.jsx")}`, `--alias:@/lib/supabase/client=${join(stubs, "supabase-client.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })


const DRIVE = `
<script>
(function () {
  var report = function (o) { var pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(o); document.body.append(pre) }
  function box(el) { if (!el) return null; var r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } }
  function panel() { return document.querySelector("[data-work-panel]") }
  function steps() {
    var p = panel()
    if (!p) return []
    var out = []
    var items = p.querySelectorAll("li[data-step]")
    for (var i = 0; i < items.length; i++) {
      out.push({ label: (items[i].textContent || "").trim(), state: items[i].getAttribute("data-step") })
    }
    return out
  }

  var tries = 0
  function waitForComposer() {
    var field = document.querySelector("textarea")
    if (!field && tries++ < 400) { setTimeout(waitForComposer, 10); return }
    if (!field) { report({ error: "no composer after 4s" }); return }
    start(field)
  }

  function start(field) {
    /* Type a request and send it, the way a person does. */
    var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    setter.call(field, "Add a pricing section")
    field.dispatchEvent(new Event("input", { bubbles: true }))
    setTimeout(function () {
      var send = null
      var all = document.querySelectorAll("button[aria-label]")
      for (var i = 0; i < all.length; i++) { var l = all[i].getAttribute("aria-label"); if (l === "Send" || l === "Queue") send = all[i] }
      if (!send) { report({ error: "no send button" }); return }
      send.click()

      /*
       * MID-RUN, sampled where the run is genuinely in flight: two calls have
       * come back and a third has not. That is the state the panel exists to
       * show and the one a finished screenshot never captures. Sampling
       * earlier caught a step running with none ticked yet, which proves the
       * list appears but not that it SETTLES as it goes.
       */
      var result = { midRun: null, ended: null }

      /*
       * WATCHED, NOT SAMPLED AT A GUESSED MOMENT.
       *
       * The claim is "the list settles as it goes": at some point during the
       * run, some steps have ticked and one is still in flight. Sampling at a
       * fixed millisecond tests that claim only if the guess lands inside a
       * window a few hundred milliseconds wide, and a miss reads exactly like
       * a panel that only appears at the end. So watch for the state instead,
       * and keep the best one seen.
       */
      var looks = 0
      function watch() {
        var p = panel()
        var st = steps()
        var running = st.filter(function (s) { return s.state === "running" }).length
        var done = st.filter(function (s) { return s.state === "done" }).length
        if (p && (!result.midRun || running + done > (result.midRun.running + result.midRun.done))) {
          result.midRun = {
            panelShown: true,
            open: p.getAttribute("data-open") === "true",
            plan: (p.querySelector("[data-plan]") || {}).textContent || null,
            steps: st,
            running: running,
            done: done,
            summary: ((p.querySelector("[data-summary]") || {}).textContent || "").trim(),
          }
          /* The moment the claim is actually true, recorded as such. */
          if (running >= 1 && done >= 1) result.midRun.caughtInFlight = true
        }
        if (result.midRun && result.midRun.caughtInFlight) { finish(); return }
        if (p && p.getAttribute("data-running") === "false") { finish(); return }
        if (looks++ > 600) { finish(); return }
        setTimeout(watch, 15)
      }
      watch()

      function finish() {
        if (!result.midRun) result.midRun = { panelShown: false, steps: [], running: 0, done: 0 }
        /*
         * AND ONCE IT IS OVER, which is not the same as "once the steps have
         * settled". The reply arrives after the last step, and the panel
         * shuts itself on the RUN ending — measuring before that caught it
         * still open and still saying "Working", then clicked its toggle and
         * closed the very panel the next measurement was about.
         */
        var waited = 0
        function settle() {
          var st2 = steps()
          var p2 = panel()
          var over = p2 && p2.getAttribute("data-running") === "false"
          if ((!over || st2.length < 4) && waited++ < 600) { setTimeout(settle, 20); return }
          /*
           * The SHUT state first: whether it collapsed itself and what its
           * one remaining line says. Reading the step list here would find
           * nothing, because a collapsed panel does not render one — which
           * is the panel working, not the panel empty.
           */
          result.ended = {
            panelShown: !!p2,
            open: !!(p2 && p2.getAttribute("data-open") === "true"),
            summary: p2 ? ((p2.querySelector("[data-summary]") || {}).textContent || "").trim() : null,
          }
          /* Then open it back up: the list and the code it wrote are in there. */
          var toggle = p2 ? p2.querySelector("[data-toggle]") : null
          if (toggle) toggle.click()
          setTimeout(function () {
            var p3 = panel()
            var pre = p3 ? p3.querySelector("pre") : null
            var st3 = steps()
            result.ended.steps = st3
            result.ended.failed = st3.filter(function (s) { return s.state === "failed" }).length
            result.code = {
              shown: !!pre,
              path: p3 ? ((p3.querySelector("[data-code-path]") || {}).textContent || "").trim() : null,
              box: box(pre),
              scrolls: pre ? pre.scrollHeight > pre.clientHeight + 1 : false,
              overflowY: pre ? getComputedStyle(pre).overflowY : null,
              text: pre ? (pre.textContent || "").slice(0, 40) : null,
            }
            result.reopened = !!(p3 && p3.getAttribute("data-open") === "true")
            result.panelBox = box(p3)
            result.panelWidth = p3 ? box(p3).w : 0
            result.containerWidth = Math.round(document.querySelector("#app > div").getBoundingClientRect().width)
            report(result)
          }, 120)
        }
        settle()
      }
    }, 60)
  }
  waitForComposer()
})()
</script>`

const page = (hold) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}
  #app{padding:16px}
  /* Headless never advances a transition under virtual time; the settled state is what is measured. */
  *,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}
</style></head><body><div id="app"></div>${hold ? "<script>window.__hold=true</script>" : ""}<script src="probe.js"></script>${DRIVE}</body></html>`
const file = join(out, "index.html")
writeFileSync(file, page(false))

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=440,780", "--virtual-time-budget=20000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The panel never reported. Nothing was measured.")
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
const r = JSON.parse(decode(m[1]))
if (r.error) fail(r.error)

if (process.env.KEEP_SHOT) {
  execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--window-size=440,780", "--virtual-time-budget=20000",
    `--screenshot=${join(root, ".wb-probe/work-panel.png")}`, "--screenshot-full-page", `file://${file}`],
    { stdio: ["ignore", "ignore", "ignore"] })
  console.log("  shot: .wb-probe/work-panel.png")
}

const mid = r.midRun, end = r.ended
console.log(`  mid-run: panel ${mid.panelShown ? "shown" : "MISSING"}, open: ${mid.open}, caught part-finished: ${!!mid.caughtInFlight} (${mid.done} done, ${mid.running} running, of ${mid.steps.length} listed)`)
console.log(`  its plan: ${mid.plan ? `"${mid.plan.slice(0, 62)}…"` : "NOT SHOWN"}`)
console.log(`  its header says: "${mid.summary}"`)
console.log(`  ended: shut: ${!end.open}, its one line reads "${end.summary}"`)
console.log(`  reopened: ${end.steps.length} steps, ${end.failed} did not land`)
console.log(`  steps: ${end.steps.map((s) => `${s.label} [${s.state}]`).join(", ")}`)
console.log(`  code: ${r.code.shown ? `${r.code.path}, ${r.code.box.w}x${r.code.box.h}px, scrolls: ${r.code.scrolls} (${r.code.overflowY})` : "NOT SHOWN"}`)
console.log(`  panel ${r.panelWidth}px inside a ${r.containerWidth}px column`)

const problems = []
if (!mid.panelShown) problems.push("no panel appeared during the run")
else {
  if (!mid.open) problems.push("the panel was shut while the run was going, which is when it is worth watching")
  if (!mid.plan) problems.push("the plan was never shown")
  else if (!/pricing/i.test(mid.plan)) problems.push(`the plan shown is not the plan sent: "${mid.plan}"`)
  /* The point of the whole thing: caught mid-flight, not after. */
  /* One claim, checked as one thing: settled steps and an unsettled one, together. */
  if (!mid.caughtInFlight) {
    problems.push(
      `the list was never seen part-finished (best: ${mid.done} done, ${mid.running} running): it does not settle as it goes`,
    )
  }
  if (mid.steps.length >= end.steps.length) problems.push(`the step list did not grow during the run: ${mid.steps.length} mid-run, ${end.steps.length} at the end`)
}
if (end.steps.length !== 4) problems.push(`${end.steps.length} steps at the end, not the 4 the run made`)
if (end.steps.some((s) => s.state === "running")) problems.push("a step is still spinning after the run ended")
if (end.failed !== 1) problems.push(`${end.failed} steps marked as not landing, not the 1 that did not`)
if (end.open) problems.push("the panel stayed open after the run: an old exchange re-reads itself every time you scroll past")
if (!/did not land/.test(end.summary ?? "")) problems.push(`the shut panel does not say a step failed: "${end.summary}"`)
if (!r.reopened) problems.push("the panel cannot be opened again after it shuts")
if (!r.code.shown) problems.push("the code it wrote is not shown")
else {
  if (!/pricing_tiers\.storelib/.test(r.code.path ?? "")) problems.push(`the code is labelled "${r.code.path}"`)
  if (!/<template>/.test(r.code.text ?? "")) problems.push("the code block is not showing the source that was sent")
  if (r.code.box.h > 260) problems.push(`the code block is ${r.code.box.h}px tall and fills the thread`)
  if (r.code.overflowY !== "auto" && r.code.overflowY !== "scroll") problems.push(`a capped code block with overflow-y ${r.code.overflowY} hides the rest of the file with no way to reach it`)
}
if (r.panelWidth > r.containerWidth) problems.push(`the panel is ${r.panelWidth}px in a ${r.containerWidth}px column`)

if (problems.length) { console.error("\n" + problems.map((p) => `  ${p}`).join("\n") + "\n"); process.exit(1) }
console.log("\nthe plan, the steps and the code appear while the run is going, the list ticks off as each step settles, a step that did not land says so, and the panel shuts itself afterwards.")
