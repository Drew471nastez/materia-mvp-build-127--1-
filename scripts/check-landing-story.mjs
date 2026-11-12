/** Real editorial sections, SSR and hydration. Remote image delivery and WebGL
 * are fixture boundaries; this does not benchmark production footage or GPU. */
import { build } from "esbuild"
import puppeteer from "puppeteer-core"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
} from "node:fs"
import { join, resolve, extname } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { appCss } from "./probe-css.mjs"
const root = process.cwd(),
  out = mkdtempSync(join(tmpdir(), "storelib-story-"))
const aliases = {
  name: "boundary-fixtures",
  setup(b) {
    b.onResolve({ filter: /^next\/(image|link|navigation|dynamic)$/ }, (a) => ({
      path: a.path,
      namespace: "boundary",
    }))
    b.onLoad({ filter: /.*/, namespace: "boundary" }, (a) => ({
      resolveDir: root,
      loader: "jsx",
      contents:
        a.path === "next/image"
          ? 'import React from "react"; export default function Image({src,fill,priority,preload,unoptimized,loader,onLoadingComplete,...props}) { return <img {...props} src={typeof src==="string"?src:src.src}/> }'
          : a.path === "next/link"
            ? 'import React from "react"; export default function Link({prefetch,scroll,replace,children,...props}){return <a {...props}>{children}</a>}'
            : a.path === "next/navigation"
              ? 'export const usePathname=()=>"/"; export const useRouter=()=>({push(){},replace(){}})'
              : 'import React from "react"; export default function dynamic(){return ()=> <div data-webgl-fixture="" style={{width:220,height:220}}/>}',
    }))
    b.onResolve({ filter: /^@\// }, (a) =>
      b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }),
    )
  },
}
const opts = {
  bundle: true,
  jsx: "automatic",
  plugins: [aliases],
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.STORY_DEBUG ? "development" : "production",
    ),
  },
  logLevel: "warning",
}
await build({
  ...opts,
  entryPoints: ["scripts/render-landing-story.tsx"],
  platform: "browser",
  format: "iife",
  outfile: join(out, "client.js"),
})
await build({
  ...opts,
  stdin: {
    contents:
      'import React from "react"; import {renderToString} from "react-dom/server"; import {LandingStoryFixture} from "./scripts/render-landing-story"; process.stdout.write(renderToString(<LandingStoryFixture/>))',
    loader: "tsx",
    resolveDir: root,
  },
  platform: "node",
  format: "cjs",
  outfile: join(out, "ssr.cjs"),
})
const ssr = execFileSync(process.execPath, [join(out, "ssr.cjs")], {
    maxBuffer: 10e6,
  }).toString(),
  css = await appCss(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Arial,system-ui,sans-serif}</style></head><body><div id="app">${ssr}</div><script>window.process={env:{NODE_ENV:"production"}}</script><script src="/client.js"></script></body></html>`
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://local")
  if (url.pathname === "/") {
    res.setHeader("content-type", "text/html")
    return res.end(html)
  }
  if (url.pathname.startsWith("/api/")) {
    res.setHeader("content-type", "application/json")
    return res.end("{}")
  }
  if (url.pathname === "/_next/image") {
    res.setHeader("content-type", "image/webp")
    return res.end(
      readFileSync(join(root, "public/marketing/hero/slide-street.webp")),
    )
  }
  const file =
    url.pathname === "/client.js"
      ? join(out, "client.js")
      : resolve(root, "public", "." + decodeURIComponent(url.pathname))
  if (
    (file.startsWith(root + "/public/") || file === join(out, "client.js")) &&
    existsSync(file)
  ) {
    res.setHeader(
      "content-type",
      {
        ".js": "text/javascript",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      }[extname(file)] || "application/octet-stream",
    )
    return res.end(readFileSync(file))
  }
  res.writeHead(404)
  res.end()
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
})
const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  errors = []
try {
  for (const width of [320, 390, 768, 1440, 1920]) {
    const p = await browser.newPage()
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      if (r.url().startsWith(origin)) return r.continue()
      if (r.resourceType() === "image")
        return r.respond({
          contentType: "image/webp",
          body: readFileSync(
            join(root, "public/marketing/hero/slide-street.webp"),
          ),
        })
      return r.abort()
    })
    await p.setViewport({ width, height: 900 })
    await p.goto(origin, { waitUntil: "networkidle0" })
    await wait(400)
    assert.equal(
      await p.$$eval("[data-story-heading]", (es) => es.length),
      10,
      "all major sections share editorial headings",
    )
    assert.ok(
      await p.$eval(
        "#build-showcase-title",
        (e) =>
          e.getBoundingClientRect().height /
            parseFloat(getComputedStyle(e).lineHeight) <=
          (innerWidth < 768 ? 4.05 : 2.05),
      ),
    )
    // Freeze movement for geometry/screenshots; the hero probe separately exercises autoplay and settled slide navigation.
    await p.focus(".build-showcase-track")
    await p.keyboard.press("Home")
    await wait(1200)
    await p.keyboard.press("Space")
    await p.$eval(".build-showcase-track", (e) => e.blur())
    const cards = await p.$$eval(
      '[data-showcase-slide]:not([aria-hidden="true"])',
      (es) =>
        es.slice(0, 3).map((e) => ({
          x: e.getBoundingClientRect().x,
          right: e.getBoundingClientRect().right,
          w: e.getBoundingClientRect().width,
          h: e.querySelector("img").getBoundingClientRect().height,
          fit: getComputedStyle(e.querySelector("img")).objectFit,
        })),
    )
    assert.ok(
      cards.every((c) => c.fit === "contain"),
      "screenshots are never cover-cropped",
    )
    assert.ok(
      Math.abs(cards[0].w / cards[0].h - 4 / 3) < 0.015,
      "wide cards are 4:3",
    )
    assert.ok(
      Math.abs(cards[1].w / cards[1].h - 9 / 16) < 0.015,
      "OnePage cards are 9:16",
    )
    assert.ok(
      await p.$$eval('[data-format="portrait"] figcaption', (es) =>
        es.every((e) => e.textContent === "OnePage"),
      ),
      "portrait captions consistently say OnePage",
    )
    if (width >= 1024) {
      assert.ok(
        cards[0].x >= 20 && cards[2].right <= width - 20,
        "wide / phone / wide cards fit completely on desktop",
      )
      assert.ok(
        cards.every((c) => Math.abs(c.h - cards[0].h) < 2),
        "all card heights align",
      )
    }
    if (width < 768) {
      assert.ok(
        cards.every((c) => Math.abs(c.h - cards[0].h) < 2),
        "mobile card heights align",
      )
      const headingX = await p.$eval(
        "#build-showcase-title",
        (e) => e.getBoundingClientRect().left,
      )
      assert.ok(
        Math.abs(cards[0].x - headingX) <= 2,
        "initial mobile card aligns with heading",
      )
      assert.ok(
        await p.$eval(
          ".build-showcase-viewport",
          (e) => innerWidth - e.getBoundingClientRect().right <= 2,
        ),
        "mobile rail extends to right edge",
      )
    }
    for (const heading of await p.$$("[data-story-heading]")) {
      await heading.evaluate((e) =>
        e.scrollIntoView({ block: "center", behavior: "instant" }),
      )
      await wait(150)
      const overflow = await p.evaluate(() => ({
        width: innerWidth,
        doc: document.documentElement.scrollWidth,
        sections: [
          ...document.querySelectorAll(
            "html,body,#app,[data-landing-story],[data-story-section],.storelib-footer,.build-showcase",
          ),
        ].map((e) => ({
          tag: e.tagName,
          section: e.dataset.storySection,
          w: e.getBoundingClientRect().width,
          right: e.getBoundingClientRect().right,
        })),
        nodes: [...document.querySelectorAll("body *")]
          .filter((e) => {
            if (e.getBoundingClientRect().right <= innerWidth + 1) return false
            for (
              let a = e.parentElement;
              a && a !== document.documentElement;
              a = a.parentElement
            ) {
              if (/hidden|clip|auto|scroll/.test(getComputedStyle(a).overflowX))
                return false
            }
            return true
          })
          .slice(0, 12)
          .map((e) => ({
            tag: e.tagName,
            class: e.className,
            right: e.getBoundingClientRect().right,
            text: e.textContent.slice(0, 50),
          })),
      }))
      assert.ok(
        overflow.doc <= width + 1,
        `${width}: no overflow at ${await heading.evaluate((e) => e.getAttribute("aria-label"))}: ${JSON.stringify(overflow)}`,
      )
    }
    await p.$eval('[data-story-section="faq"]', (e) =>
      e.scrollIntoView({ block: "start", behavior: "instant" }),
    )
    await wait(800)
    const question = await p.$('[data-story-section="faq"] button')
    await question.click()
    await wait(500)
    await question.click()
    await wait(500)
    const section = await p.$('[data-story-section="pricing"]')
    assert.equal(
      await section.$$eval('a[href="/signup"]', (es) => es.length),
      2,
      "both existing signup actions survive",
    )
    assert.equal(
      await p.$eval(
        ".storelib-footer",
        (e) => getComputedStyle(e).backgroundColor,
      ),
      "rgb(255, 255, 255)",
    )
    assert.deepEqual(errors, [], "hydrated sections have no runtime errors")
    assert.ok(
      await p.$$eval(
        '[data-story-section][data-story-in-view="false"] [data-story-continuous]',
        (es) =>
          es.length > 0 &&
          es.every((e) => getComputedStyle(e).animationPlayState === "paused"),
      ),
      "offscreen loops pause",
    )
    if (process.env.STORY_SHOTS) {
      mkdirSync(process.env.STORY_SHOTS, { recursive: true })
      await p.evaluate(() => scrollTo(0, 0))
      await wait(500)
      await p.screenshot({
        path: join(process.env.STORY_SHOTS, `landing-${width}.png`),
        fullPage: true,
      })
    }
    console.log(
      `PASS ${width}: all sections, typography, uncropped mixed cards, native scrolling, FAQ, pricing links, footer and offscreen motion`,
    )
    if (width === 1440) {
      await p.evaluate(() => scrollTo(0, 0))
      const intervals = await p.evaluate(
        () =>
          new Promise((resolve) => {
            let last = performance.now(),
              n = 0
            const times = []
            const tick = (now) => {
              times.push(now - last)
              last = now
              scrollBy(0, 100)
              if (++n < 120) requestAnimationFrame(tick)
              else resolve(times)
            }
            requestAnimationFrame(tick)
          }),
      )
      intervals.sort((a, b) => a - b)
      console.log(
        `Scroll fixture timing: median ${intervals[60].toFixed(1)}ms, p95 ${intervals[114].toFixed(1)}ms (device-dependent; WebGL/remote images are boundaries)`,
      )
    }
    await p.close()
  }
  assert.deepEqual(errors, [], "no browser runtime errors")
  const p = await browser.newPage()
  await p.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ])
  await p.goto(origin, { waitUntil: "networkidle0" })
  await wait(300)
  assert.ok(
    await p.$$eval("[data-story-heading]", (es) =>
      es.every((e) => getComputedStyle(e).transform === "none"),
    ),
    "reduced motion disables heading translations",
  )
  await p.close()
  console.log("PASS reduced motion and browser runtime checks")
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
  rmSync(out, { recursive: true, force: true })
}
