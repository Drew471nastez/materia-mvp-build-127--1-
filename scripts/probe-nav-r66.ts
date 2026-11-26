import JSZip from "jszip"
import puppeteer, { type Frame } from "puppeteer-core"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { editorFor } from "./check-builder-nav19"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const within = <T,>(p: Promise<T>, ms = 1500): Promise<T> => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error("no answer")), ms))])
void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  const zip = await JSZip.loadAsync(await composeTemplateZip(`materia/${process.env.TEMPLATE ?? "space"}`))
  const ed = await editorFor(browser, 1440, 900, false, undefined, zip)
  const page = ed.page
  await page.setRequestInterception(true)
  const refused: string[] = []
  page.on("request", (req) => {
    if (req.isNavigationRequest() && req.frame() !== page.mainFrame()) {
      refused.push(req.url())
      void req.respond({ status: 200, contentType: "text/html", headers: { "X-Frame-Options": "DENY" }, body: "<h1>live page</h1>" })
      return
    }
    if (/storelib\.com/.test(req.url())) { void req.abort(); return }
    void req.continue()
  })
  await ed.frame(); await sleep(3000)
  const vectors: Record<string, (f: Frame) => Promise<unknown>> = {
    "script location.href relative": (f) => f.evaluate(() => { setTimeout(() => { location.href = "/products/black-sleeves" }, 10) }),
    "script location.assign live host": (f) => f.evaluate(() => { setTimeout(() => { location.assign("https://andrewrullz.storelib.com/products/black-sleeves") }, 10) }),
    "window.open _self": (f) => f.evaluate(() => { setTimeout(() => { window.open("/collections/all", "_self") }, 10) }),
    "detached anchor click": (f) => f.evaluate(() => { setTimeout(() => { const a = document.createElement("a"); a.href = "/pages/about"; a.click() }, 10) }),
    "meta refresh": (f) => f.evaluate(() => { const m = document.createElement("meta"); m.httpEquiv = "refresh"; m.content = "0;url=/cart"; document.head.appendChild(m) }),
    "window capture stop + link click": async (f) => {
      const at = await f.evaluate(() => {
        addEventListener("click", (e) => e.stopPropagation(), { capture: true, once: true })
        const a = [...document.querySelectorAll<HTMLAnchorElement>("a[href^='/']")].find((x) => x.getClientRects().length && x.getBoundingClientRect().top > 0 && x.getBoundingClientRect().top < innerHeight - 50)
        if (!a) return null
        const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      const fb = await (await page.$("[data-compat-frame='front']"))!.boundingBox()
      if (at && fb) await page.mouse.click(fb.x + at.x, fb.y + at.y)
    },
    "absolute live link click": async (f) => {
      const at = await f.evaluate(() => {
        const a = [...document.querySelectorAll<HTMLAnchorElement>("a[href^='/']")].find((x) => x.getClientRects().length && x.getBoundingClientRect().top > 0 && x.getBoundingClientRect().top < innerHeight - 50)
        if (!a) return null
        a.href = "https://andrewrullz.storelib.com" + a.getAttribute("href")
        const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      const fb = await (await page.$("[data-compat-frame='front']"))!.boundingBox()
      if (at && fb) await page.mouse.click(fb.x + at.x, fb.y + at.y)
    },
    "form submit GET via requestSubmit": (f) => f.evaluate(() => { const fm = document.createElement("form"); fm.action = "/search"; fm.innerHTML = "<input name=q value=x>"; document.body.appendChild(fm); fm.requestSubmit() }),
    "form target _blank": (f) => f.evaluate(() => { const fm = document.createElement("form"); fm.action = "/contact"; fm.method = "post"; fm.target = "_self"; document.body.appendChild(fm); HTMLFormElement.prototype.requestSubmit.call(fm) }),
  }
  let bad = 0
  for (const [name, act] of Object.entries(vectors)) {
    if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) continue
    const f = await ed.frame()
    refused.length = 0
    await act(f).catch((e) => console.log("   act error", String(e).slice(0, 100)))
    let errorShown = 0, samples = 0
    for (let i = 0; i < 40; i++) {
      await sleep(100)
      samples++
      const front = await page.$("[data-compat-frame='front']")
      const fr = front ? await front.contentFrame() : null
      const url = fr ? fr.url() : "none"
      const seen = front ? await front.evaluate((el) => getComputedStyle(el).visibility !== "hidden" && el.getBoundingClientRect().width > 0) : false
      if (!/^about:srcdoc/.test(url) && seen) errorShown++
    }
    const front = await page.$("[data-compat-frame='front']")
    const fr = front ? await front.contentFrame() : null
    const drawn = fr ? await within(fr.evaluate(() => document.querySelectorAll(".shopify-section").length)).catch(() => -1) : -1
    const ok = errorShown === 0 && drawn > 3
    if (!ok) bad++
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: refused page seen in ${errorShown}/${samples} samples, sections now ${drawn}, frame navigations ${JSON.stringify(refused)}`)
    if (!ok) await page.screenshot({ path: `${process.env.OUT ?? "/tmp"}/nav-${name.replace(/\W+/g, "-")}.png` })
  }
  console.log(`\n${bad} vectors left the canvas`)
  ed.close(); await browser.close()
})()
