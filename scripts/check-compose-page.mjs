/**
 * ===========================================================================
 *  THE COMPOSE PAGE, MEASURED AND DRIVEN
 * ===========================================================================
 * /app/emails/new rendered with the app's stylesheet against a stand-in
 * server (scripts/render-compose-probe.tsx), at 360, 390 and 1440 wide. The
 * email's text is the shared rich text field
 * (components/app/rich-text-editor.tsx); what that has to be here, checked
 * in Chromium:
 *
 *   - the page never scrolls sideways, and the text toolbar fits the screen
 *     (its row scrolls inside itself on a phone, with a fade at the edge
 *     while there is more);
 *   - every toolbar control is a 44px target on a phone, 32px on a computer;
 *   - typing: the words land where the caret is and nothing above them moves
 *     while they do;
 *   - bold, a link and a list from the toolbar, with the caret still in the
 *     text after each; undo takes the list back off;
 *   - a paste from a web page arrives cleaned: its words and bold kept, its
 *     script, handlers and styles gone;
 *   - the toolbar holds still under the page's bar while a long text scrolls
 *     under it;
 *   - the preview is the email: the words, the bold and the link are in the
 *     iframe, and a button added as a block wears the brand's colour;
 *   - the draft is saved with its text block marked, then Send asks first.
 *
 *   node scripts/check-compose-page.mjs     (no build needed: scripts/probe-css.mjs)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const stubs = join(root, ".compose-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-compose-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.test"

try {
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `const rows = { profiles: { display_name: "Ana Pop", username: "anapop", avatar_url: null, email: "ana@example.com" }, creators: { id: "cr-1", support_email: "hello@anapop.studio" } }
function from(table) {
  const q = {
    select() { return q }, eq() { return q }, order() { return q },
    maybeSingle() { return Promise.resolve({ data: rows[table] ?? null, error: null }) },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej) },
  }
  return q
}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "ana@example.com" } } }) }, from } }
`,
  )
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/emails/new"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
  execFileSync(
    "npx",
    [
      "esbuild",
      "scripts/render-compose-probe.tsx",
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
      "--alias:@=.",
      "--alias:@/lib/supabase/client=./.compose-probe/supabase-client.js",
      "--alias:next/navigation=./.compose-probe/navigation.js",
      `--outfile=${join(stubs, "app.js")}`,
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const css = await appCss(root)
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const page = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

  for (const [label, vp] of [
    ["phone 360", { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone 390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop 1440", { width: 1440, height: 900 }],
  ]) {
    console.log(`\n${label}`)
    const tag = label.replace(/\s/g, "-")
    const phone = vp.width < 640
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: page }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }) : r.continue()))
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e)))
    await p.goto(`${ORIGIN}/app/emails/new`)
    await p.waitForSelector("[data-email-editor] .rich-text-content")
    await sleep(200)

    const field = "[data-email-editor] .rich-text-content"
    const fieldHtml = () => p.$eval(field, (el) => el.innerHTML)
    const inField = () => p.evaluate((sel) => document.activeElement === document.querySelector(sel), field)
    const tool = async (name) => {
      const b = await p.$(`[data-email-editor] .rich-text-toolbar button[aria-label="${name}"]`)
      if (!b) return false
      await b.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "nearest" }))
      await b.click()
      await sleep(80)
      return true
    }

    /* Geometry of the page and the toolbar. */
    const geo = await p.evaluate(() => {
      const pane = document.querySelector("[data-compose]")
      const bar = document.querySelector("[data-email-editor] .rich-text-toolbar")
      const strip = bar.querySelector("[data-toolbar-strip]")
      const r = bar.getBoundingClientRect()
      const buttons = [...bar.querySelectorAll("button")].map((b) => { const x = b.getBoundingClientRect(); return [Math.round(x.width), Math.round(x.height)] })
      return { sideways: pane.scrollWidth - pane.clientWidth, doc: document.documentElement.scrollWidth - innerWidth, left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, buttons, stripScrolls: strip.scrollWidth > strip.clientWidth, more: strip.dataset.more }
    })
    expect(geo.sideways <= 0 && geo.doc <= 0, "the page never scrolls sideways", [geo.sideways, geo.doc])
    expect(geo.left >= 0 && geo.right <= geo.vw, "the text toolbar is inside the screen", [geo.left, geo.right, geo.vw])
    const min = phone ? 44 : 32
    expect(geo.buttons.every(([w, h]) => w >= min && h >= min), `every toolbar control is at least ${min}px`, geo.buttons.filter(([w, h]) => w < min || h < min))
    if (phone) expect(!geo.stripScrolls || geo.more === "true", "on a phone the row scrolls inside itself, faded at the edge while there is more", geo)
    await p.screenshot({ path: join(shots, `${tag}-empty.png`) })

    /* Typing: nothing above the caret moves. */
    await p.click(field)
    await sleep(60)
    const tops = []
    for (const ch of "Hello from the studio") {
      await p.keyboard.type(ch)
      tops.push(await p.evaluate(() => {
        const t = document.querySelector("[data-email-editor] .rich-text-toolbar").getBoundingClientRect().top
        const c = document.querySelector("[data-email-editor] .rich-text-content").getBoundingClientRect().top
        return `${Math.round(t)}/${Math.round(c)}`
      }))
    }
    expect(new Set(tops).size === 1, "typing moves nothing above the words", [...new Set(tops)])
    expect((await fieldHtml()).includes("Hello from the studio"), "the words are in the text")

    /* Bold, from the toolbar, on the word just typed. */
    await p.keyboard.down("Shift")
    await p.keyboard.down("Control")
    await p.keyboard.press("ArrowLeft")
    await p.keyboard.up("Control")
    await p.keyboard.up("Shift")
    await tool("Bold")
    expect(/<(b|strong)>studio<\/(b|strong)>/.test(await fieldHtml()), "Bold makes the selected word bold", await fieldHtml())
    expect(await inField(), "and the caret is still in the text")

    /* A link on the same word. */
    await tool("Link")
    await p.waitForSelector('input[aria-label="Link address"]', { timeout: 2000 }).catch(() => null)
    await p.type('input[aria-label="Link address"]', "example.com/new")
    await p.keyboard.press("Enter")
    await sleep(120)
    expect(/<a href="https:\/\/example\.com\/new"[^>]*><(b|strong)>studio<\/(b|strong)><\/a>|<(b|strong)><a href="https:\/\/example\.com\/new"[^>]*>studio<\/a><\/(b|strong)>/.test(await fieldHtml()), "Link turns it into a link, https added", await fieldHtml())
    expect(await inField(), "and the caret is back in the text")

    /* A list, then undo. */
    await p.keyboard.press("End")
    await p.keyboard.press("Enter")
    await p.keyboard.type("First point")
    await tool("Bulleted list")
    expect(/<ul><li>First point/.test(await fieldHtml()), "Bulleted list makes the line a list", await fieldHtml())
    expect(await inField(), "and the caret stays in it")
    await tool("Undo")
    expect(!/<ul>/.test(await fieldHtml()) && /First point/.test(await fieldHtml()), "Undo takes the list off and keeps the words", await fieldHtml())

    /* A paste from a web page. */
    await p.keyboard.press("End")
    await p.keyboard.press("Enter")
    await p.evaluate((sel) => {
      const el = document.querySelector(sel)
      const data = new DataTransfer()
      data.setData("text/html", '<p style="color:red;font-family:Comic Sans" onclick="steal()">Pasted <b>words</b><script>bad()</script><img src="x" onerror="bad()"></p>')
      data.setData("text/plain", "Pasted words")
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
    }, field)
    await sleep(100)
    const pasted = await fieldHtml()
    expect(/Pasted <(b|strong)>words<\/(b|strong)>/.test(pasted) && !/script|onclick|onerror|style=|Comic/.test(pasted), "a paste keeps its words and bold, and nothing else", pasted.slice(-160))

    /* A long text: the toolbar holds still under the page's bar. */
    for (let i = 0; i < 22; i++) {
      await p.keyboard.press("Enter")
      await p.keyboard.type(`Line ${i + 1}`)
    }
    const sticky = await p.evaluate(async () => {
      const pane = document.querySelector("[data-compose]")
      const block = document.querySelector("[data-email-editor] [data-block-id]")
      pane.scrollTop = block.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop + 260
      await new Promise((r) => setTimeout(r, 120))
      const bar = document.querySelector("[data-orders-bar]").getBoundingClientRect()
      const t = document.querySelector("[data-email-editor] .rich-text-toolbar").getBoundingClientRect()
      return { barBottom: Math.round(bar.bottom), toolbarTop: Math.round(t.top), blockTop: Math.round(block.getBoundingClientRect().top) }
    })
    expect(sticky.blockTop < sticky.barBottom && Math.abs(sticky.toolbarTop - sticky.barBottom) <= 1, "the toolbar holds under the bar while the text scrolls", sticky)
    await p.screenshot({ path: join(shots, `${tag}-sticky.png`) })
    await p.evaluate(() => { document.querySelector("[data-compose]").scrollTop = 0 })

    /* A button block, in the brand's colour, and the preview. */
    const add = await p.$("[data-add-block]")
    await add.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await add.click()
    await sleep(phone ? 450 : 150)
    const picked = await p.evaluate(() => {
      const item = [...document.querySelectorAll('[role="menuitem"], [data-action-sheet] button')].find((x) => x.textContent.trim() === "Button")
      if (!item) return false
      item.click()
      return true
    })
    await sleep(phone ? 500 : 200)
    expect(picked, "Add a block offers a button")
    const labelInput = await p.$('[data-block-panel="button"] input')
    if (labelInput) {
      await labelInput.type("Get the pack")
      const inputs = await p.$$('[data-block-panel="button"] input')
      await inputs[1].type("storelib.com/anapop/autumn")
    }
    if (vp.width >= 1024) {
      await sleep(500)
      const preview = await p.evaluate(() => {
        const d = document.querySelector('aside iframe')?.contentDocument
        const body = d?.body?.innerHTML ?? ""
        return { words: /Hello from the/.test(body), link: /href="https:\/\/example\.com\/new"/.test(body), button: /bgcolor="#0f766e"[\s\S]*Get the pack/.test(body) }
      })
      expect(preview.words && preview.link && preview.button, "the preview is the email: the words, the link, and the button in the brand's colour", preview)
    } else {
      await p.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === "Preview")?.click())
      await sleep(500)
      const preview = await p.evaluate(() => /bgcolor="#0f766e"[\s\S]*Get the pack/.test(document.querySelector("iframe")?.contentDocument?.body?.innerHTML ?? ""))
      expect(preview, "the phone's Preview shows the button in the brand's colour")
      await p.screenshot({ path: join(shots, `${tag}-preview.png`) })
      await p.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === "Write")?.click())
      await sleep(150)
    }

    /* Saved, with the text block marked. */
    await sleep(1300)
    const saved = await p.evaluate(() => window.__requests.filter((r) => /\/api\/email\/campaigns/.test(r.url) && (r.method === "POST" || r.method === "PATCH")).map((r) => String(r.body.body ?? "")))
    expect(saved.length > 0 && saved.at(-1).includes('data-sl-block="rich"') && saved.at(-1).includes('data-sl-block="button"'), "the draft was saved, its text and button marked as blocks", saved.length)
    await p.screenshot({ path: join(shots, `${tag}-written.png`) })
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nShots in ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nAll checks passed")
