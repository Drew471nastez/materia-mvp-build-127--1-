/**
 * ===========================================================================
 *  THE EDITOR'S CANVAS AND THE WEBSITE PAGE'S COVER NEVER WAIT FOREVER
 * ===========================================================================
 * "Sometimes the website builder editor doesn't load the theme at all": the
 * canvas stayed on its grey outline of a page for good, on a computer and on
 * a phone. "Preparing preview" stayed on the Website page's card for good.
 * "The white flash when you switch pages inside the builder."
 *
 * The waits themselves are run here (lib/website-builder/load-guard.ts, the
 * theme's files in compat-canvas.tsx), and the rest is held to its source.
 * The browser half is scripts/check-canvas-loading.ts: the real editor with
 * the theme's files failing, a script of the theme's never answering, a
 * phone, and pages switched frame by frame.
 */
import { readFileSync } from "node:fs"

import { deadline, fetchWithin, LoadTimeout, retrying, within } from "../lib/website-builder/load-guard"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

;(async () => {
  const realFetch = globalThis.fetch

  console.log("\nEvery wait ends (lib/website-builder/load-guard.ts)\n")
  {
    let aborted = false
    globalThis.fetch = ((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true
          reject(new Error("aborted"))
        })
      })) as typeof fetch
    const t0 = Date.now()
    const err = await fetchWithin("/api/never", {}, 60).then(() => null, (e: unknown) => e)
    check("a request that never answers is an error after its time, not a hang", err instanceof LoadTimeout && Date.now() - t0 < 1000, String(err))
    check("  and the request itself is aborted", aborted)

    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch
    const ok = await fetchWithin("/api/fine", {}, 1000)
    check("one that answers is answered", ok.status === 200)

    let tries = 0
    const third = await retrying(async () => {
      tries++
      if (tries < 3) throw new Error(`try ${tries}`)
      return "in"
    }, [5, 5])
    check("a failure is tried again, and the third try's answer is the answer", third === "in" && tries === 3)
    tries = 0
    const last = await retrying(async () => {
      tries++
      throw new Error(`try ${tries}`)
    }, [5, 5]).then(() => null, (e: Error) => e.message)
    check("  and when every try fails, the last error is said, after exactly that many tries", last === "try 3" && tries === 3, last)

    const late = await deadline(new Promise(() => {}), 30, "a body").then(() => null, (e: unknown) => e)
    check("a body that never finishes reading is an error too", late instanceof LoadTimeout)
    check("a wait with a fallback settles on it", (await within(new Promise<number>(() => {}), 20, -1)) === -1 && (await within(Promise.reject(new Error("x")), 20, -2)) === -2)
  }

  console.log("\nAn imported theme's files (components/website-builder/compat/compat-files.ts)\n")
  {
    const { loadCompatFiles } = await import("../components/website-builder/compat/compat-files")
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      if (calls <= 2) return new Response("{}", { status: 500 })
      return new Response(JSON.stringify({ files: { "shopify/layout/theme.liquid": "x" } }), { status: 200 })
    }) as typeof fetch
    const files = await loadCompatFiles("install-a")
    check("two 500s and then an answer: the files, after three asks", files["shopify/layout/theme.liquid"] === "x" && calls === 3, calls)

    calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response("{}", { status: 503 })
    }) as typeof fetch
    const failedAsk = await loadCompatFiles("install-b").then(() => "resolved", () => "rejected")
    check("files that never come are a failure the canvas can say, not an empty theme", failedAsk === "rejected", failedAsk)
    globalThis.fetch = (async () => new Response(JSON.stringify({ files: { a: "1" } }), { status: 200 })) as typeof fetch
    await new Promise((r) => setTimeout(r, 0))
    const again = await loadCompatFiles("install-b").then((f) => f.a, () => null)
    check("  and the failure is not kept: the next ask asks the server again", again === "1")
  }
  globalThis.fetch = realFetch

  console.log("\nThe canvas of an imported theme\n")
  {
    const canvas = code("components/website-builder/compat/compat-canvas.tsx")
    const filesCode = code("components/website-builder/compat/compat-files.ts")
    check("its files are tried again and each try has an end", /retrying\(/.test(filesCode) && /deadline\(/.test(filesCode) && /fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}\/files\?compat=1`, \{\}, FILES_WAIT_MS\)/.test(filesCode))
    check("a theme that cannot be read, or a first page that cannot be drawn, is said with Try again", /setFailure\("files"\)/.test(canvas) && /setFailure\("draw"\)/.test(canvas) && /<CanvasProblem kind=/.test(canvas) && /onRetry=\{retry\}/.test(canvas))
    // Changed on purpose (round AA): the files are also read again when a push to GitHub changed them (filesVersion). Round G: the first draw also waits for the shop's cards (holdForData).
    check("  Try again asks for everything again", /setAttempt\(\(n\) => n \+ 1\)/.test(canvas) && /\[installId, attempt(, filesVersion)?\]/.test(canvas) && /accountPath, attempt, holdForData\]/.test(canvas))
    /* Round G: not at once. The load event does not wait for a picture the theme loads lazily, so a page shown at it landed with its hero empty; a page that has said it is ready is shown by its own "loaded" or FIRST_PAINT_MS. */
    check("the frame's own load event shows a page that has said nothing, and asks it again whether it is ready", /onLoad=\{\(\) => onFrameLoad\(slot\.n\)\}/.test(canvas) && /type: "hello"/.test(canvas) && /if \(at === 0\) \{\s*if \(!slot\.ready\) window\.setTimeout\(\(\) => setPainted\(true\), 400\)/.test(canvas))
    check("a frame that says nothing is shown as it is after FRAME_CAP_MS", /const FRAME_CAP_MS = 6_000/.test(canvas) && /\}, FRAME_CAP_MS\)/.test(canvas))
    check("a page behind that never says it loaded still comes forward", /window\.setTimeout\(\(\) => promote\(slot\.n\), BEHIND_CAP_MS\)/.test(canvas))
    check("a page that comes forward takes the outline away with it (a first page replaced before it said ready)", /const at = list\.findIndex\(\(x\) => x\.n === n\)\s*\n\s*if \(at <= 0\) return[\s\S]{0,240}setPainted\(true\)/.test(canvas))
    check("nothing to show after SLOW_MS says so", /const SLOW_MS = 15_000/.test(canvas) && /setFailure\(\(f\) => f \?\? "slow"\)/.test(canvas))
    check("the editor's loader steps aside for a failure as for a page", /if \(!shown && !stuck\) return\s*\n\s*let id = requestAnimationFrame\(\(\) => \{ id = requestAnimationFrame\(\(\) => onPainted\.current\?\.\(\)\) \}\)/.test(canvas))
    check("and every one of these is told to the error log", (canvas.match(/reportLoadProblem\("compat-canvas"/g) ?? []).length >= 3 && /reportLoadProblem\("compat-canvas", e\)/.test(filesCode))
    check("  and Try again after an answer that could not be drawn asks the server afresh", /forgetCompatFiles\(installId\)/.test(canvas))
    const bridge = read("lib/storelib-theme/compat/canvas-bridge.ts")
    check("the page answers hello with ready, in whatever order the two happen", /m\.type === "hello"\) \{[\s\S]{0,200}ready\(\);/.test(bridge))
    check("  and says ready anyway when a deferred script of the theme's holds DOMContentLoaded back", /setTimeout\(function \(\) \{ if \(!saidReady\) ready\(\); \}, 2500\)/.test(bridge))
    const settings = code("components/website-builder/compat/compat-theme-settings.tsx")
    /* Changed on purpose: Storelib's group comes through compatThemeGroups (lib/storelib-theme/platform-settings.ts), which leaves out what the theme places itself; tests/repo-export-platform-settings.test.ts runs it. */
    check("Theme settings never stays on Loading when the files do not come", /\}, \(\) => \{\s*if \(live\) setGroups\(themeGroups\(\[\]\)\)/.test(settings))
  }

  console.log("\nThe editor (app/website-builder/editor/[installId]/page.tsx)\n")
  {
    const editor = code("app/website-builder/editor/[installId]/page.tsx")
    check("the website and its sections are asked for with an end", /fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}`, \{\}, SECTIONS_WAIT_MS\)/.test(editor) && /fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}\/sections\?page=\$\{page\}`, \{\}, SECTIONS_WAIT_MS\)/.test(editor))
    check("a first load that fails says so over the canvas, with Try again", /setLoadFailed\(true\)/.test(editor) && /\{loadFailed && !loading && \(/.test(editor) && /onRetry=\{\(\) => void loadData\(\)\}/.test(editor))
    check("a server error is never drawn as an empty page (an autosave would write it)", /if \(res\.status >= 500\) throw new Error/.test(editor))
    check("a page or product that cannot be opened lets go of the sidebar and the canvas, and says so", /pageOpenFailed\(err\)/.test(editor) && /function pageOpenFailed\(err: unknown\) \{[\s\S]{0,300}setSectionsLoading\(false\)[\s\S]{0,80}setCanvasLoading\(false\)[\s\S]{0,80}openingPage\.current = false/.test(editor))
    check("a product opened from the address never holds the canvas for good", /\}, CANVAS_HOLD_CAP_MS\)/.test(editor))
    check("another page: the one being left stays until the next is drawn, then a cut (a page of Storelib's own)",
      /if \(!importedTheme\.current\) swapCanvasPage\(show\)/.test(editor) &&
        /swapCanvasPage\(show\)/.test(editor) &&
        /setCurrentPage\(page\)/.test(editor) &&
        /setSelectedProductPage\(productTitle\)/.test(editor))
    check("  and the new page is not faded up from white under it", !/page\.animate\(\[\{ opacity: 0\.35 \}/.test(editor))
    check("an imported theme's canvas code on its way shows the outline, never a white page, and a long wait offers a reload",
      /dynamic\(\(\) => loadCompatCanvas\(\)\.then\(\(m\) => m\.CompatCanvas\), \{ ssr: false, loading: \(\) => <CompatCanvasWaiting \/> \}\)/.test(editor) &&
        /export function CompatCanvasWaiting\(\)/.test(read("components/website-builder/canvas-problem.tsx")) && /window\.location\.reload\(\)/.test(read("components/website-builder/canvas-problem.tsx")))
    const still = code("lib/website-builder/canvas-still.ts")
    check("the fallback copy is laid in the host the editor leaves alone, scrolled where the page was, taking no presses", /host\.append\(copy\)/.test(still) && /copy\.scrollTop = root\.scrollTop/.test(still) && /pointer-events:none/.test(still) && /copy\.inert = true/.test(still) && /data-canvas-still-host/.test(still))
    check("  it waits for the new page and its first pictures, each for a bounded time, then cuts", /STILL_WAIT_MS = 350/.test(still) && /STILL_ARRIVE_MS = 1500/.test(still) && /img\.decode\(\)/.test(still) && /const cap = window\.setTimeout\(done,/.test(still) && !/\.animate\(/.test(still))
    check("  the browser's own picture of the page being left is held, and the handover is not a fade", /startViewTransition/.test(still) && /flushSync\(apply\)/.test(still) && /html\.setAttribute\(SWAP_ATTR, ""\)/.test(still))
  }

  console.log("\nThe Website page's cover\n")
  {
    const client = code("app/app/website-builder/website-builder-client.tsx")
    const route = code("app/api/website-builder/themes/[installId]/cover/route.ts")
    const refresh = code("lib/website-builder/cover-refresh.ts")
    check("asking for a cover has an end", /fetchWithin\(`\/api\/website-builder\/themes\/\$\{encodeURIComponent\(installId\)\}\/cover`, \{\s*method: "POST",\s*keepalive: true,\s*\}, REQUEST_WAIT_MS\)/.test(refresh))
    check("no photograph yet: the big card shows the page itself, small, until one lands", /const wantsMini = eager && \(!face\.url \|\| broken === face\.url\)/.test(client) && /<LiveMiniature installId=\{install\.id\}/.test(client))
    check("  from the owner's own pass, in a sandbox with no origin, taking no presses", /cover\?render=1/.test(client) && /sandbox="allow-scripts"/.test(client) && /pointer-events-none/.test(client) && /tabIndex=\{-1\}/.test(client))
    check("  a pass only the owner is handed, for the page the photograph is taken of", /searchParams\.get\("render"\) === "1"/.test(route) && route.indexOf("const who = await owned(installId)") < route.indexOf('searchParams.get("render")') && /mintCoverPass\(installId\)/.test(route))
    check("  framed only by this origin, and only when it asks to be", /url\.pathname\.startsWith\("\/cover-render\/"\) \?/.test(read("proxy.ts")) && /"sandbox allow-scripts; frame-ancestors 'self'"/.test(read("proxy.ts")) && /sandbox allow-scripts; frame-ancestors 'self'/.test(read("app/api/site-theme/cover/[pass]/route.ts")))
    check("  a picture whose file will not load is treated as none", /onBroken\?\.\(url\)/.test(client))
  }

  console.log("\nAdd a section, for an imported theme (compat-section-preview.tsx)\n")
  {
    const preview = code("components/website-builder/compat/compat-section-preview.tsx")
    check("a card's height is remembered for the theme, so it opens at it", /rememberedHeights\(ctx\.installId, renderWidth\)\[key\]/.test(preview) && /window\.localStorage\.setItem\(k, JSON\.stringify\(all\)\)/.test(preview))
    check("a card is never made shorter where it can be seen", /if \(wanted > kept\.h \|\| !inSight\(box\.current\)\)/.test(preview) && /releaseCompatHeld\(\)/.test(read("components/website-builder/editor/section-library.tsx")))
    check("a card that is coming shimmers, and only while the library is open", /wb-preview-shimmer/.test(preview) && /\.wb-library-layer\[data-state="closed"\] \.wb-preview-shimmer::after/.test(read("app/globals.css")))
    check("the sections are drawn ahead in quiet moments, the first cards first", /onIdle\(\(d\) => this\.run\(/.test(preview) && /score = card\.eager \? i - 1e6 : i/.test(preview) && /eager=\{eager\} \/>/.test(read("components/website-builder/editor/section-library.tsx")))
    check("an open list is filled nearest its own view first (the list, not the window)", /this\.grid\?\.closest\("\[data-library-scroll\]"\)\?\.getBoundingClientRect\(\)/.test(preview))
    check("files that never come name each card instead of a shimmer for good", /failed: failed \|\| \(!!files && !theme\)/.test(preview) && /const unavailable = !!ctx\?\.failed/.test(preview))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
  process.exit(0)
})()
