/**
 * ===========================================================================
 *  THE CREATOR'S PHOTO IN THE CHECKOUT BAR IS NEVER A BROKEN PICTURE
 * ===========================================================================
 * "Sometimes in the checkout top bar the profile pictures of creators don't
 * fetch well, sometimes it lacks the image." The bar showed the browser's
 * broken picture icon for a creator whose photo is the one Google sent at
 * sign up: the bar drew it with next/image, which sends it through
 * /_next/image, and the optimizer refuses any host that is not in
 * next.config's remotePatterns (400, INVALID_IMAGE_OPTIMIZE_REQUEST).
 * lh3.googleusercontent.com is not.
 *
 * The other checkout probes stand next/image in with a plain <img>, which is
 * why none of them saw it. This one bundles the real next/image with
 * next.config's own image settings, and answers /_next/image with Next's own
 * remotePatterns matcher, the way production does.
 *
 * scripts/render-checkout-avatar.tsx draws the real checkout with each photo
 * (a working one, one that 404s, one on a host the optimizer refuses, one
 * that 403s, none), rendered in the browser and as server HTML hydrated
 * after the photo has already settled, at 1440x900 and 390x844. Every frame
 * from the first:
 *
 *   NEVER BROKEN   no visible <img> that failed, on any frame
 *   A PHOTO        when it can be fetched from anywhere: it ends on screen,
 *                  at full opacity, and it faded in rather than popped
 *   INITIALS       when there is none or it fails, on a neutral circle
 *   NO SHIFT       the circle is 28x28 on every frame and the name beside it
 *                  never moves
 *
 *   PROBE_CSS=source node scripts/check-checkout-avatar.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const require = createRequire(join(root, "package.json"))
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const { imageConfigDefault } = require("next/dist/shared/lib/image-config")
const { hasRemoteMatch } = require("next/dist/shared/lib/match-remote-pattern")
const nextConfig = (await import(pathToFileURL(join(root, "next.config.mjs")).href)).default
const images = { ...imageConfigDefault, ...nextConfig.images }
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-ckavatar-")), "shots")
mkdirSync(shots, { recursive: true })
const photo = readFileSync(join(root, "public/placeholder-user.jpg"))
const css = await appCss(root)
const stubs = join(root, ".ckavatar-probe")
mkdirSync(stubs, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

let html
try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/checkout"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-checkout-avatar.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    /* The real next/image, configured the way the build configures it. */
    define: { "process.env.NODE_ENV": '"production"', "process.env.__NEXT_IMAGE_OPTS": JSON.stringify(images), "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": '""' },
    alias: { "@": ".", "next/navigation": "./.ckavatar-probe/navigation.js", "next/link": "./.ckavatar-probe/link.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

/** What the photo's own address answers, held back so a fade has time to show. */
function upstream(url) {
  if (/\/avatars\/probe\/ok\.jpg$/.test(url.pathname) || /ProbeOk/.test(url.pathname)) return { status: 200, contentType: "image/jpeg", body: photo, delay: 350 }
  if (/ProbeRefused/.test(url.pathname)) return { status: 403, contentType: "text/plain", body: "Forbidden", delay: 60 }
  return { status: 404, contentType: "text/plain", body: "Not found", delay: 60 }
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  for (const [label, vp] of [
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop-1440", { width: 1440, height: 900 }],
  ]) {
    for (const mode of ["client", "hydrate"]) {
      for (const which of ["ok", "missing", "foreign", "refused", "none"]) {
        const p = await browser.newPage()
        await p.setViewport(vp)
        const errors = []
        p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
        const optimizer = []
        await p.setRequestInterception(true)
        p.on("request", (r) => {
          const url = new URL(r.url())
          const answer = (a) => setTimeout(() => r.respond({ status: a.status, contentType: a.contentType, body: a.body }).catch(() => {}), a.delay || 0)
          if (url.hostname === "storelib.com" && url.pathname === "/__ckavatar") return r.respond({ status: 200, contentType: "text/html", body: html })
          if (url.hostname === "storelib.com" && url.pathname === "/_next/image") {
            /* Next's optimizer: a host outside remotePatterns is a 400, not a picture. */
            const src = new URL(url.searchParams.get("url") || "", "https://storelib.com")
            const allowed = hasRemoteMatch(images.domains, images.remotePatterns, src)
            optimizer.push({ host: src.hostname, allowed })
            if (!allowed) return answer({ status: 400, contentType: "text/plain", body: '"url" parameter is not allowed', delay: 40 })
            return answer(upstream(src))
          }
          if (/\.(supabase\.co|googleusercontent\.com)$/.test(url.hostname)) return answer(upstream(url))
          if (url.hostname === "storelib.com") return r.respond({ status: 200, contentType: "application/json", body: "{}" })
          return r.abort()
        })
        /* Every frame from the first, read before React has done anything. */
        await p.evaluateOnNewDocument(() => {
          window.__frames = []
          const t0 = performance.now()
          const read = () => {
            const link = document.querySelector("[data-creator-link]") || document.querySelector("header span.flex.min-w-0")
            const face = link?.firstElementChild
            if (face) {
              const r = face.getBoundingClientRect()
              const name = link.querySelector(".truncate")?.getBoundingClientRect()
              const imgs = [...face.querySelectorAll("img")].map((img) => {
                const cs = getComputedStyle(img)
                const ir = img.getBoundingClientRect()
                const visible = cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0 && ir.width > 0 && ir.height > 0
                return { visible, opacity: parseFloat(cs.opacity), failed: img.complete && img.naturalWidth === 0 && !!img.getAttribute("src"), loaded: img.complete && img.naturalWidth > 0, src: img.currentSrc || img.src }
              })
              const text = [...face.childNodes].filter((n) => !(n instanceof HTMLImageElement)).map((n) => n.textContent).join("").trim()
              window.__frames.push({ t: Math.round(performance.now() - t0), w: r.width, h: r.height, nameX: name ? Math.round(name.left * 10) / 10 : null, imgs, text, bg: getComputedStyle(face).backgroundColor })
            }
            if (performance.now() - t0 < 2200) requestAnimationFrame(read)
          }
          requestAnimationFrame(read)
        })
        await p.goto(`https://storelib.com/__ckavatar?case=${which}${mode === "hydrate" ? "&hydrate" : ""}`, { waitUntil: "domcontentloaded" })
        await new Promise((r) => setTimeout(r, 2400))
        const frames = await p.evaluate(() => window.__frames)
        const bar = await p.$("header")
        if (bar) await bar.screenshot({ path: join(shots, `${label}-${mode}-${which}.png`) })
        await p.close()

        console.log(`\n${label} ${mode} ${which}`)
        const last = frames[frames.length - 1] || { imgs: [], text: "" }
        const brokenFrames = frames.filter((f) => f.imgs.some((i) => i.visible && i.failed))
        expect(frames.length > 20, "the bar was read on every frame", frames.length)
        expect(brokenFrames.length === 0, "NEVER BROKEN: no failed picture is visible on any frame", brokenFrames.length ? { first: brokenFrames[0].t, frames: brokenFrames.length, src: brokenFrames[0].imgs.find((i) => i.failed)?.src.slice(0, 90) } : 0)
        const sizes = [...new Set(frames.map((f) => `${f.w}x${f.h}`))]
        const nameXs = [...new Set(frames.map((f) => f.nameX))]
        expect(sizes.length === 1 && sizes[0] === "28x28" && nameXs.length === 1, "NO SHIFT: 28x28 on every frame, and the name never moves", { sizes, nameXs })
        const shown = last.imgs.find((i) => i.visible)
        if (which === "ok" || which === "foreign") {
          expect(!!shown && shown.loaded && shown.opacity === 1 && !last.text, "A PHOTO: it ends on screen, loaded, at full opacity", { shown: shown && { loaded: shown.loaded, opacity: shown.opacity, src: shown.src.slice(0, 80) }, text: last.text })
          if (mode === "client") {
            const mids = frames.filter((f) => f.imgs.some((i) => i.opacity > 0.02 && i.opacity < 0.98)).length
            expect(mids >= 2, "and it faded in over several frames, not a pop", mids)
          }
        } else {
          expect(!shown && !!last.text, "INITIALS: no picture, the initials", { text: last.text, imgs: last.imgs.length })
          expect(last.bg !== "rgba(0, 0, 0, 0)", "on a neutral circle", last.bg)
        }
        if (optimizer.length) console.log(`        optimizer asked: ${JSON.stringify([...new Set(optimizer.map((o) => `${o.host} ${o.allowed ? "allowed" : "REFUSED"}`))])}`)
        expect(errors.length === 0, "no page errors", errors)
      }
    }
  }
} finally {
  await browser.close()
}

console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
