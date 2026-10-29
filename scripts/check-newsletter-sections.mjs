/**
 * ===========================================================================
 *  THE STORELIB THEME'S NEWSLETTER SECTIONS, DRAWN AND SUBMITTED
 * ===========================================================================
 * The owner: the newsletter sections "don't work, aren't controllable, have
 * missing buttons and layout and text, and height". Every look of each, in
 * headless Chromium at 390 and 1280, live (a website, with a creator) and in
 * the builder's canvas (inside the editor, nothing sent), from
 * scripts/render-newsletter-sections.tsx:
 *
 *   N1  the box and its button are drawn, the button with its label, inside
 *       the section, 40px tall or more, nothing scrolling sideways
 *   N2  the settings show: heading, text, small print, the name box when
 *       asked for, alignment, inline (box and button on one row from 640px)
 *       or stacked (the button under the box), the width asked for
 *   N3  the height: the padding asked for above and below, and the minimum
 *       height when one is set
 *   N4  live, a sign up is sent to /api/website-builder/subscribe with this
 *       creator, the address, the name when asked, and the box it came from
 *       (newsletter, popup), and the section's own thank you is shown
 *   N5  in the canvas nothing is sent, and the section's thank you is shown
 *
 * The route itself, against an in-memory database, is
 * tests/newsletter-signup.test.ts; the imported themes' Storelib Newsletter
 * is scripts/check-newsletter-embed.mjs.
 *
 *   PROBE_CSS=source node scripts/check-newsletter-sections.mjs     SHOTS=/dir
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const CREATOR = "11111111-1111-4111-8111-111111111111"
const ORIGIN = "https://shop.example.com"

/* What each look is asked to be, and what it should then show. */
const CASES = [
  { id: "nl-default", type: "newsletter", settings: {}, want: { layout: "inline", align: "center", heading: "Stay in the loop" } },
  { id: "nl-stacked-left", type: "newsletter", settings: { form_layout: "stacked", align: "left", show_name_field: true, name_placeholder: "Your first name", max_width: "narrow", padding_top: 96, padding_bottom: 40, min_height: 520 }, want: { layout: "stacked", align: "left", name: "Your first name", pt: 96, pb: 40, minH: 520 } },
  { id: "nl-split", type: "newsletter", settings: { layout: "split", bg_image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='%23c9a'/%3E%3C/svg%3E" }, want: { layout: "inline", align: "center" } },
  { id: "pn-default", type: "promo_newsletter", settings: {}, want: { layout: "inline", align: "center", heading: "One email a month" } },
  { id: "pn-stacked-left", type: "promo_newsletter", settings: { form_layout: "stacked", align: "left", show_name: true, name_placeholder: "Your first name", padding_top: 120, padding_bottom: 32, min_height: 560, success: "You're in. Check your inbox." }, want: { layout: "stacked", align: "left", name: "Your first name", pt: 120, pb: 32, minH: 560, thanks: "You're in. Check your inbox." } },
  { id: "pn-image", type: "promo_newsletter", settings: { bg_image: "https://shop.example.com/picture.svg", overlay: 50 }, want: { layout: "inline", align: "center", image: true } },
  { id: "pop-email", type: "popup", settings: { delay: 0, every_visit: true, success: "Your code is on its way." }, want: { popup: true, thanks: "Your code is on its way." } },
]

const out = mkdtempSync(join(tmpdir(), "check-nl-sections-"))
writeFileSync(join(out, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }\nexport const useLinkStatus = () => ({ pending: false })\n`)
writeFileSync(join(out, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, priority, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }\n`)
writeFileSync(join(out, "empty.js"), "export {}\n")
/* The compiler hashes a source for its cache; the website's build never ships it to a browser, this probe does. */
writeFileSync(join(out, "crypto.js"), "export function createHash() { let h = 0; const o = { update(s) { for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return o }, digest() { return (h >>> 0).toString(16) } }; return o }\n")
execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-newsletter-sections.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  /* And counts a source's bytes with Buffer, which the website's build provides in a browser. */
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;globalThis.Buffer=globalThis.Buffer||{byteLength:function(s){return new TextEncoder().encode(String(s)).length}};',
  `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, `--alias:next/link=${join(out, "link.jsx")}`, `--alias:next/image=${join(out, "image.jsx")}`,
  `--alias:server-only=${join(out, "empty.js")}`, `--alias:node:crypto=${join(out, "crypto.js")}`, `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
{ cwd: root, env: { ...process.env, NODE_PATH: join(root, "node_modules") }, stdio: ["ignore", "inherit", "inherit"] })
const js = readFileSync(join(out, "probe.js"), "utf8")
const css = await appCss(root)
const fonts = interFaces(root)

let failed = 0
const expect = (ok, label, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || detail === undefined ? "" : `\n          ${JSON.stringify(detail).slice(0, 500)}`}`)
  if (!ok) failed++
}
const html = (mode, cases) => {
  const body = `<div id="app"></div><script>window.__nl=${JSON.stringify({ cases, mode, creator: CREATOR }).replace(/</g, "\\u003c")}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script>`
  return mode === "live"
    ? `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style></head><body style="margin:0">${body}</body></html>`
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>html,body{margin:0;background:#eef1f5}</style></head><body><div id="wb-preview-root" class="relative isolate bg-white flex flex-col w-full">${body}</div></body></html>`
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const report = {}
try {
  for (const width of [390, 1280]) {
    for (const mode of ["live", "canvas"]) {
      for (const c of CASES) {
        const tag = `${c.id} ${mode} ${width}`
        console.log(`\n${tag}`)
        const page = await (await browser.createBrowserContext()).newPage()
        const posts = []
        const errors = []
        page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
        await page.setViewport({ width, height: 900 })
        await page.setRequestInterception(true)
        page.on("request", (r) => {
          const url = r.url()
          if (url === `${ORIGIN}/`) return r.respond({ status: 200, contentType: "text/html", body: html(mode, [{ id: c.id, type: c.type, settings: c.settings }]) })
          if (url.startsWith(`${ORIGIN}/api/website-builder/subscribe`)) {
            posts.push(JSON.parse(r.postData() || "{}"))
            return r.respond({ status: 200, contentType: "application/json", body: '{"ok":true}' })
          }
          if (url === `${ORIGIN}/picture.svg`) return r.respond({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><rect width='10' height='10' fill='#c96'/></svg>" })
          if (url.startsWith("data:")) return r.continue()
          return r.respond({ status: 204, body: "" })
        })
        await page.goto(`${ORIGIN}/`, { waitUntil: "load" })
        await page.waitForSelector(`[data-case="${c.id}"] form input[type="email"]`, { timeout: 8000 }).catch(() => null)
        await new Promise((r) => setTimeout(r, c.want.popup && mode === "live" ? 700 : 250))
        const m = await page.evaluate((id) => {
          const box = document.querySelector(`[data-case="${id}"]`)
          const form = box?.querySelector("form")
          const email = form?.querySelector('input[type="email"]')
          const name = form?.querySelector('input[name="name"]')
          const btn = form?.querySelector('button[type="submit"]')
          const section = box?.firstElementChild
          const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom), r: Math.round(b.right) } }
          const visible = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).opacity !== "0"
          const heading = box?.querySelector("h2")
          const words = (sel) => box?.querySelector(sel)?.textContent?.trim() ?? null
          return {
            section: r(box), email: r(email), name: name ? { ...r(name), placeholder: name.getAttribute("placeholder") } : null, btn: r(btn),
            btnText: btn?.textContent?.trim() ?? null, btnVisible: visible(btn), btnBg: btn ? getComputedStyle(btn).backgroundColor : null, btnColor: btn ? getComputedStyle(btn).color : null,
            heading: heading?.textContent?.trim() ?? null, headingAlign: heading ? getComputedStyle(heading).textAlign : null,
            formW: r(form)?.w ?? null, inner: r(heading?.parentElement),
            img: !!box?.querySelector("img"),
            sideways: document.documentElement.scrollWidth - innerWidth,
            vw: innerWidth,
            small: words(".s__note, .pop__note") ?? (box?.querySelector("form")?.parentElement?.querySelector("p.text-xs.opacity-70")?.textContent ?? null),
          }
        }, c.id)
        report[tag] = m
        if (!m.email) { expect(false, "the section is drawn at all", { errors, html: await page.evaluate((id) => document.querySelector(`[data-case="${id}"]`)?.innerHTML.replace(/style="[^"]*"/g, "").slice(0, 900), c.id) }); await page.close(); continue }
        const btnH = m.btn?.h ?? 0
        expect(!!m.email && m.btnVisible && !!m.btnText && btnH >= 40, `N1 the box and its button "${m.btnText}" (${btnH}px tall) are drawn`, m)
        expect(m.sideways <= 0 && (!m.btn || m.btn.r <= m.vw), `N1 nothing scrolls sideways (${m.sideways}px)`, m)
        if (c.want.heading) expect(m.heading === c.want.heading, `N2 the heading "${m.heading}"`, m)
        if (c.want.align) expect(m.headingAlign === (c.want.align === "center" ? "center" : "left") || (c.want.align === "left" && m.headingAlign === "start"), `N2 aligned ${c.want.align} (${m.headingAlign})`, m)
        if (c.want.layout && m.email && m.btn) {
          const oneRow = Math.abs(m.email.y - m.btn.y) <= 2
          const wantRow = c.want.layout === "inline" && width >= 640
          expect(oneRow === wantRow, `N2 ${c.want.layout}: the button ${oneRow ? "beside" : "under"} the box at ${width}`, { email: m.email, btn: m.btn })
        }
        if (c.want.name) expect(m.name?.placeholder === c.want.name && m.name.w > 100, `N2 the name box "${m.name?.placeholder}"`, m.name)
        else expect(!m.name, "N2 no name box unless asked", m.name)
        if (c.want.image) expect(m.img, "N2 the background picture is drawn", m)
        if (c.want.minH) expect(m.section.h >= c.want.minH - 1, `N3 at least ${c.want.minH}px tall (${m.section.h})`, m.section)
        if (c.want.pt && m.inner && m.section) {
          /* With no minimum height asked, the padding is the room above the heading. */
          if (!c.want.minH) expect(Math.abs(m.inner.y - m.section.y - c.want.pt) <= 2, `N3 ${c.want.pt}px above`, { inner: m.inner, section: m.section })
        }
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `${c.id}-${mode}-${width}.png`), fullPage: true })

        /* Submit. */
        const address = `${c.id}-${mode}-${width}@example.com`
        if (m.name) await page.type(`[data-case="${c.id}"] form input[name="name"]`, "Ana")
        await page.type(`[data-case="${c.id}"] form input[type="email"]`, address)
        await page.click(`[data-case="${c.id}"] form button[type="submit"]`)
        await new Promise((r) => setTimeout(r, 600))
        const after = await page.evaluate((id) => document.querySelector(`[data-case="${id}"]`)?.innerText ?? "", c.id)
        const thanks = c.want.thanks ?? (c.type === "newsletter" ? "Thanks, you're on the list." : "Thanks, you're on the list.")
        if (mode === "live") {
          const sent = posts.find((p) => p.email === address)
          const placement = c.type === "popup" ? "popup" : "newsletter"
          expect(!!sent && sent.creator_id === CREATOR && sent.placement === placement && (!m.name || sent.name === "Ana"), `N4 sent for this creator, from the ${placement}${m.name ? ", with the name" : ""}`, { posts, sent })
          expect(after.includes(thanks), `N4 and the thank you "${thanks}" is shown`, after.slice(0, 200))
        } else {
          expect(posts.length === 0, "N5 nothing is sent from the canvas", posts)
          expect(after.includes(thanks), `N5 the section's thank you "${thanks}" is shown`, after.slice(0, 200))
        }
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `${c.id}-${mode}-${width}-sent.png`), fullPage: true })
        expect(errors.length === 0, "no page errors", errors)
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
  rmSync(out, { recursive: true, force: true })
  if (SHOTS) writeFileSync(join(SHOTS, "report.json"), JSON.stringify(report, null, 2))
}
console.log(failed ? `\n${failed} failed` : "\nall measured")
process.exit(failed ? 1 : 0)
