/**
 * ===========================================================================
 *  ROUND 13, WORKER M: THE MEMBERSHIP LIFECYCLE, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real components (scripts/render-community-membership.tsx) at 1440x900
 * and 390x844:
 *
 *   MEMBERSHIP   the plan card (price, "Renews on ..."), Cancel opening the
 *                Storelib sheet (bottom sheet on a phone, a centred dialog
 *                on a computer) that rises or settles over a few frames, sits
 *                inside the screen and says "You keep access until <date>. No
 *                further charges after that." first; a reason and a note are
 *                posted; the card then reads "Your membership ends on <date>.
 *                No further charges." with Resume
 *   CONTACT      subject and message posted to /contact, the Sent state; a
 *                refused send (rate limit) says the server's words
 *   POLICY       the refund policy folded under one line, opening to the text
 *   REFUND       the owner's Payments rows, Refund opening the dialog, Part
 *                of it with $5 typed reading "Refund $5", the post, the row's
 *                "Refunded $5. Ana was emailed."
 *   CHECKOUT     a community membership's checkout: the refund policy, the
 *                EU waiver in the consent, the price the buyer's way (de-DE)
 *   EVERYWHERE   nothing scrolls sideways, every control 40px or taller on a
 *                phone, no page errors
 *
 *   PROBE_CSS=source node scripts/check-community-membership.mjs
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fonts = interFaces(root)
const stubs = join(root, ".community-membership-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-membership-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const CID = "c0000000-0000-4000-8000-000000000001"
const ENDS = new Date(Date.UTC(2026, 9, 31, 12)).toISOString()

const cancelledView = {
  communityId: CID,
  communityName: "Clay Studio",
  kind: "subscription",
  membershipId: "m1",
  status: "canceled",
  access: true,
  amountCents: 1900,
  currency: "usd",
  interval: "month",
  periodEnd: ENDS,
  cancelAtPeriodEnd: true,
  canCancel: false,
  canResume: true,
  cardLast4: "4242",
  manageUrl: "/account/library/memberships/m1",
  refundPolicy: "Full refund within 7 days.",
  contact: { form: true, publicEmail: null, ownerName: "Mara Lindqvist" },
}
const PAYMENTS = [
  { orderId: "o1", productTitle: "Clay Studio", kind: "membership", amountCents: 1900, refundedCents: 0, refundableCents: 1900, currency: "usd", status: "completed", createdAt: "2026-10-02T09:00:00Z", buyerId: "u1", buyerName: "Ana Lopez", buyerEmail: "ana@example.com", subscriptionRunning: true },
  { orderId: "o2", productTitle: "Clay Studio lifetime", kind: "purchase", amountCents: 24900, refundedCents: 24900, refundableCents: 0, currency: "usd", status: "refunded", createdAt: "2026-09-20T09:00:00Z", buyerId: "u2", buyerName: "Jonas Berg", buyerEmail: "jonas@example.com", subscriptionRunning: false },
  { orderId: "o3", productTitle: "Clay Studio", kind: "membership", amountCents: 1900, refundedCents: 0, refundableCents: 1900, currency: "usd", status: "completed", createdAt: "2026-09-02T09:00:00Z", buyerId: "u3", buyerName: "Priya Raman with a rather long name", buyerEmail: "priya@example.com", subscriptionRunning: false },
]

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "stripe-pay.jsx"), `import React from "react"
export function StripePay(p) { return React.createElement("div", { "data-stripe-pay-stub": "" }, p.contactExtra, React.createElement("div", { style: { height: 220, border: "1px dashed #d5d9e0", borderRadius: 10, margin: "16px 0" } }), p.beforePay, React.createElement("button", { type: "button", className: "mt-4 h-12 w-full rounded-lg bg-[#1a1a2e] text-white" }, p.payLabel)) }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-membership.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-membership-probe/navigation.js", "next/link": "./.community-membership-probe/link.jsx" },
    plugins: [{ name: "stripe-stub", setup(b) { b.onResolve({ filter: /parts\/stripe-pay$/ }, () => ({ path: join(stubs, "stripe-pay.jsx") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

  const DESKTOP = ["desktop-1440", { width: 1440, height: 900, deviceScaleFactor: 1 }]
  const PHONE = ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]

  async function open(path, vp, { contact = "ok" } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        const post = r.method() === "POST" ? r.postData() : null
        const respond = (status, body) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) })
        if (post) void p.evaluate((u, b) => (window.__posts ||= []).push([u, JSON.parse(b)]), short, post).catch(() => {})
        if (short.endsWith("/membership") && !post) return void respond(200, { membership: { ...cancelledView, status: "active", cancelAtPeriodEnd: false, canCancel: true, canResume: false } })
        if (short.endsWith("/membership") && post) return void setTimeout(() => respond(200, { membership: JSON.parse(post).action === "cancel" ? cancelledView : { ...cancelledView, status: "active", canCancel: true, canResume: false } }), 350)
        if (short.endsWith("/contact")) return void setTimeout(() => (contact === "ok" ? respond(200, { sent: true }) : respond(429, { error: "You have written to the owner a few times already. Give them time to reply." })), 300)
        if (short.includes("/payments")) return void respond(200, { payments: PAYMENTS })
        if (short.endsWith("/refunds")) {
          const b = JSON.parse(post || "{}")
          return void setTimeout(() => respond(200, { refund: { refundId: "re_1", status: "succeeded", amountCents: b.amountCents ?? 1900, full: !b.amountCents, pending: false, emailed: true, endedMembership: !!b.endMembership } }), 350)
        }
        return void respond(200, {})
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(350)
    return { p, errors }
  }
  const shot = (p, name, fullPage = false) => p.screenshot({ path: join(shots, `${name}.png`), fullPage })
  const sideScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  const smallTargets = (p, scope) =>
    p.evaluate((scope) => {
      const out = []
      const root = document.querySelector(scope) || document.body
      for (const el of root.querySelectorAll("button, a, input, textarea, summary")) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden" || cs.display === "none") continue
        if (el.matches("input[type=checkbox]")) {
          const box = el.closest("label")?.getBoundingClientRect()
          if (box && box.height < 40) out.push({ tag: "label", h: Math.round(box.height) })
          continue
        }
        /* A link inside a sentence is text, not a control. */
        if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue
        if (r.height < 40) out.push({ tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 28), h: Math.round(r.height) })
      }
      return out
    }, scope)
  /** The open sheet or dialog, and whether it rose or settled over several frames rather than appearing at once. */
  const sheet = async (p, marker, phone) => {
    const frames = await p.evaluate(async (marker, phone) => {
      const sel = phone ? `[data-membership-sheet="${marker}"]` : `[data-membership-dialog="${marker}"]`
      const out = []
      const t0 = performance.now()
      while (performance.now() - t0 < 700) {
        const el = document.querySelector(sel)
        const box = el ? (phone ? el.closest("[data-sheet-panel]") || el.parentElement : el) : null
        if (box) {
          const r = box.getBoundingClientRect()
          out.push({ top: Math.round(r.top), opacity: Number(getComputedStyle(box).opacity) })
        }
        await new Promise((r) => requestAnimationFrame(r))
      }
      return out
    }, marker, phone)
    const box = await p.evaluate((marker, phone) => {
      const el = document.querySelector(phone ? `[data-membership-sheet="${marker}"]` : `[data-membership-dialog="${marker}"]`)
      if (!el) return null
      const b = (phone ? el.closest("[data-sheet-panel]") || el.parentElement : el).getBoundingClientRect()
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), vw: innerWidth, vh: innerHeight }
    }, marker, phone)
    const tops = new Set(frames.map((f) => f.top))
    const opacities = new Set(frames.map((f) => f.opacity.toFixed(2)))
    return { box, moved: tops.size > 2 || opacities.size > 2, frames: frames.length }
  }

  /* ── The member's Membership page ──────────────────────────────────── */
  console.log("\nMEMBERSHIP: the plan, Cancel, the reason, the result")
  for (const [name, vp] of [DESKTOP, PHONE]) {
    const phone = name.startsWith("phone")
    const { p, errors } = await open(`/community/clay-studio/membership?case=member`, vp)
    const line = await p.evaluate(() => document.querySelector("[data-membership-line]")?.textContent?.trim())
    expect(line === "Renews on Oct 31, 2026 for $19.", `${name}: "Renews on Oct 31, 2026 for $19."`, line)
    expect((await sideScroll(p)) <= 0, `${name}: nothing scrolls sideways`, await sideScroll(p))
    if (phone) {
      const small = await smallTargets(p, "[data-probe-frame]")
      expect(small.length === 0, `${name}: every control 40px or taller`, small)
    }
    await shot(p, `${name}-membership`, true)

    await p.click("[data-membership-cancel]")
    const s = await sheet(p, "cancel", phone)
    expect(!!s.box && s.box.top >= 0 && s.box.bottom <= s.box.vh + 1 && s.box.left >= 0 && s.box.right <= s.box.vw, `${name}: the ${phone ? "sheet" : "dialog"} is inside the screen`, s.box)
    expect(s.moved, `${name}: it ${phone ? "rises" : "fades and settles"} over several frames (not a jump)`, s.frames)
    const keeps = await p.evaluate(() => document.querySelector("[data-membership-keeps]")?.textContent?.trim())
    expect(keeps === "You keep access until Oct 31, 2026. No further charges after that.", `${name}: the sheet says first what they keep`, keeps)
    if (phone) {
      const small = await smallTargets(p, "[data-membership-sheet]")
      expect(small.length === 0, `${name}: every control in the sheet 40px or taller`, small)
    }
    await p.click('[data-cancel-reason="too_expensive"]')
    await p.type("[data-cancel-note]", "Saving for a kiln")
    await sleep(700)
    if (phone) {
      /* Settled, the sheet is opaque and on top: what is under a point inside it is the sheet itself. */
      const settled = await p.evaluate(() => {
        const panel = document.querySelector("[data-membership-sheet]")?.closest("[data-sheet-panel]")
        if (!panel) return null
        const r = panel.getBoundingClientRect()
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + 260)
        let o = 1
        for (let el = panel; el; el = el.parentElement) o *= Number(getComputedStyle(el).opacity)
        return { opacity: Number(o.toFixed(3)), onTop: !!top && panel.contains(top), bg: getComputedStyle(panel).backgroundColor }
      })
      expect(settled && settled.opacity >= 0.99 && settled.onTop && settled.bg === "rgb(255, 255, 255)", `${name}: settled, the sheet is opaque white and on top of the page`, settled)
    }
    await shot(p, `${name}-cancel-sheet`)
    await p.click("[data-membership-confirm]")
    await sleep(120)
    const busy = await p.evaluate(() => document.querySelector("[data-membership-confirm]")?.textContent?.trim())
    expect(busy === "Cancelling", `${name}: the button says Cancelling while it goes`, busy)
    await sleep(900)
    const posted = await p.evaluate(() => (window.__posts || []).find(([u]) => u.endsWith("/membership"))?.[1])
    expect(posted?.action === "cancel" && posted.reason === "too_expensive" && posted.note === "Saving for a kiln", `${name}: posted { action: cancel, reason, note }`, posted)
    const after = await p.evaluate(() => ({ line: document.querySelector("[data-membership-line]")?.textContent?.trim(), resume: !!document.querySelector("[data-membership-resume]"), cancel: !!document.querySelector("[data-membership-cancel]"), open: !!document.querySelector("[data-membership-sheet],[data-membership-dialog]") }))
    expect(after.line === "Your membership ends on Oct 31, 2026. No further charges." && after.resume && !after.cancel && !after.open, `${name}: "Your membership ends on Oct 31, 2026. No further charges." with Resume, sheet closed`, after)
    await shot(p, `${name}-cancelled`)

    /* The refund policy, folded. */
    await p.click("[data-membership-refund-policy] summary")
    await sleep(120)
    const policy = await p.evaluate(() => ({ open: document.querySelector("[data-membership-refund-policy]")?.open, text: document.querySelector("[data-membership-refund-policy] p")?.textContent?.slice(0, 40) }))
    expect(policy.open && /^Full refund within 7 days/.test(policy.text || ""), `${name}: the refund policy opens to the owner's words`, policy)

    /* Contact. */
    await p.type("#contact-subject", "Pausing for a month")
    await p.type("#contact-message", "Hi Mara, can I pause my membership while I travel in November?")
    await p.click("[data-contact-send]")
    await sleep(700)
    const contactPost = await p.evaluate(() => (window.__posts || []).find(([u]) => u.endsWith("/contact"))?.[1])
    expect(contactPost?.subject === "Pausing for a month" && /pause my membership/.test(contactPost.message || ""), `${name}: posted the subject and message`, contactPost)
    const sentState = await p.evaluate(() => document.querySelector("[data-contact-sent]")?.textContent?.replace(/\s+/g, " ").trim())
    expect(/^Sent/.test(sentState || ""), `${name}: Sent, and where the reply comes`, sentState)
    const ownerAddress = await p.evaluate(() => /@claystudio|owner@/.test(document.body.innerText))
    expect(!ownerAddress, `${name}: no owner address on the page when they did not choose to show one`)
    await shot(p, `${name}-contact-sent`, true)
    expect(errors.length === 0, `${name}: no page errors`, errors)
    await p.close()
  }

  console.log("\nCONTACT: a refused send, and an owner who shows their address")
  for (const [name, vp] of [DESKTOP, PHONE]) {
    const { p, errors } = await open(`/community/clay-studio/membership?case=member&public=1`, vp, { contact: "limited" })
    const pub = await p.evaluate(() => document.querySelector("[data-contact-public] a")?.getAttribute("href"))
    expect(pub === "mailto:studio@claystudio.co", `${name}: the chosen public address is a mailto with Copy`, pub)
    await p.type("#contact-subject", "Another question")
    await p.type("#contact-message", "One more thing about the glaze recipes.")
    await p.click("[data-contact-send]")
    await sleep(700)
    const err = await p.evaluate(() => document.querySelector("[data-contact-form] [role=alert]")?.textContent?.trim())
    expect(err === "You have written to the owner a few times already. Give them time to reply.", `${name}: the rate limit says the server's words`, err)
    expect((await sideScroll(p)) <= 0, `${name}: nothing scrolls sideways`)
    await shot(p, `${name}-contact-limited`, true)
    expect(errors.length === 0, `${name}: no page errors`, errors)
    await p.close()
  }

  console.log("\nMEMBERSHIP: other states")
  for (const [state, want] of [["canceled", "Your membership ends on Oct 31, 2026. No further charges."], ["trialing", "Free trial until Oct 31, 2026, then $19."], ["purchase", "Paid once. Yours for as long as the community runs."]]) {
    const { p, errors } = await open(`/community/clay-studio/membership?case=member&state=${state}`, PHONE[1])
    const got = await p.evaluate(() => ({ line: document.querySelector("[data-membership-line]")?.textContent?.trim(), cancel: !!document.querySelector("[data-membership-cancel]"), resume: !!document.querySelector("[data-membership-resume]"), trial: document.querySelector("[data-membership-cancel]")?.textContent?.trim() }))
    expect(got.line === want, `phone-390 ${state}: "${want}"`, got)
    if (state === "canceled") expect(got.resume && !got.cancel, "phone-390 canceled: Resume, no Cancel", got)
    if (state === "trialing") expect(got.trial === "Cancel free trial", "phone-390 trialing: Cancel free trial", got)
    if (state === "purchase") expect(!got.cancel && !got.resume, "phone-390 purchase: nothing to cancel", got)
    await shot(p, `phone-390-state-${state}`)
    expect(errors.length === 0, `phone-390 ${state}: no page errors`, errors)
    await p.close()
  }

  /* ── Worker F2's Membership page, with these parts in its slots ─────── */
  console.log("\nPAGE: F2's Membership page with Cancel and Contact mounted")
  for (const [name, vp] of [DESKTOP, PHONE]) {
    const phone = name.startsWith("phone")
    const { p, errors } = await open(`/community/clay-studio/membership?case=page`, vp)
    await sleep(300)
    const got = await p.evaluate(() => {
      const billing = document.querySelector("[data-membership-billing]")
      const manage = billing?.querySelector("[data-membership-manage]")
      const cancel = billing?.querySelector("[data-membership-cancel]")
      const a = manage?.getBoundingClientRect()
      const b = cancel?.getBoundingClientRect()
      return { manage: !!manage, cancel: !!cancel, sameRow: !!a && !!b && Math.abs(a.top - b.top) < 2, cancelAfter: !!a && !!b && (b.top > a.top + 2 || b.left > a.left), overlap: !!a && !!b && a.right > b.left && b.right > a.left && a.bottom > b.top && b.bottom > a.top, contact: !!document.querySelector("[data-contact-owner]"), order: [...document.querySelectorAll("[data-membership-page] > section")].map((x) => x.getAttribute("aria-labelledby") || "") }
    })
    expect(got.manage && got.cancel && !got.overlap && (phone || got.sameRow) && got.cancelAfter, `${name}: Cancel membership comes after Manage subscription (${phone ? "wrapping on a phone" : "on one row"}), never over it`, got)
    expect(got.contact && got.order.indexOf("contact-owner-title") > got.order.indexOf("membership-notify") && got.order.indexOf("contact-owner-title") < got.order.length - 1, `${name}: the contact form is its own section after Notifications, before Leave`, got.order)
    expect((await sideScroll(p)) <= 0, `${name}: nothing scrolls sideways`)
    if (phone) {
      const small = await smallTargets(p, "[data-membership-page]")
      expect(small.length === 0, `${name}: every control 40px or taller`, small)
    }
    await shot(p, `${name}-f2-page`, true)
    await p.click("[data-membership-billing] [data-membership-cancel]")
    await sleep(700)
    await p.click("[data-membership-confirm]")
    await sleep(900)
    const after = await p.evaluate(() => ({ line: document.querySelector("[data-membership-billing] [data-membership-line]")?.textContent?.trim(), resume: !!document.querySelector("[data-membership-billing] [data-membership-resume]") }))
    expect(after.line === "Your membership ends on Oct 31, 2026. No further charges." && after.resume, `${name}: cancelled in place: the line and Resume beside Manage subscription`, after)
    await shot(p, `${name}-f2-page-cancelled`)
    expect(errors.length === 0, `${name}: no page errors`, errors)
    await p.close()
  }

  /* ── The owner's refund ────────────────────────────────────────────── */
  console.log("\nREFUND: the owner's Payments and the dialog")
  for (const [name, vp] of [DESKTOP, PHONE]) {
    const phone = name.startsWith("phone")
    const { p, errors } = await open(`/app/community/${CID}/members?case=refund`, vp)
    const rows = await p.evaluate(() => [...document.querySelectorAll("[data-payment]")].map((r) => ({ id: r.getAttribute("data-payment"), text: r.textContent.replace(/\s+/g, " ").trim(), h: Math.round(r.getBoundingClientRect().height), refund: !!r.querySelector("[data-payment-refund]") })))
    expect(rows.length === 3 && rows.every((r) => r.h >= 56), `${name}: three rows, each at least 56px`, rows.map((r) => r.h))
    expect(rows[0].refund && !rows[1].refund && /Refunded/.test(rows[1].text), `${name}: Refund on a paid row, none on a refunded one (which says Refunded)`, rows.map((r) => r.text))
    expect((await sideScroll(p)) <= 0, `${name}: nothing scrolls sideways (a long name truncates)`, await sideScroll(p))
    if (phone) {
      const small = await smallTargets(p, "[data-community-payments]")
      expect(small.length === 0, `${name}: every control 40px or taller`, small)
    }
    await shot(p, `${name}-payments`)
    await p.click('[data-payment-refund="o1"]')
    const s = await sheet(p, "refund", phone)
    expect(!!s.box && s.box.top >= 0 && s.box.bottom <= s.box.vh + 1, `${name}: the refund ${phone ? "sheet" : "dialog"} is inside the screen`, s.box)
    expect(s.moved, `${name}: it ${phone ? "rises" : "fades and settles"} over several frames`, s.frames)
    const full = await p.evaluate(() => document.querySelector("[data-refund-submit]")?.textContent?.trim())
    expect(full === "Refund $19", `${name}: Full refund is the default: "Refund $19"`, full)
    const endBox = await p.evaluate(() => !!document.querySelector("[data-refund-end]"))
    expect(endBox, `${name}: a running membership offers "End their membership now"`)
    await p.click('[data-refund-choice="part"]')
    await sleep(80)
    await p.type("[data-refund-amount]", "5")
    await sleep(80)
    const part = await p.evaluate(() => document.querySelector("[data-refund-submit]")?.textContent?.trim())
    expect(part === "Refund $5", `${name}: Part of it, $5 typed: "Refund $5"`, part)
    if (phone) {
      const small = await smallTargets(p, "[data-membership-sheet]")
      expect(small.length === 0, `${name}: every control in the sheet 40px or taller`, small)
    }
    await shot(p, `${name}-refund-dialog`)
    await p.click("[data-refund-submit]")
    await sleep(900)
    const posted = await p.evaluate(() => (window.__posts || []).find(([u]) => u.endsWith("/refunds"))?.[1])
    expect(posted?.orderId === "o1" && posted.amountCents === 500 && posted.endMembership === false, `${name}: posted { orderId, amountCents: 500, endMembership: false }`, posted)
    const done = await p.evaluate(() => document.querySelector('[data-payment="o1"] [role=status]')?.textContent?.trim())
    expect(done === "Refunded $5. Ana was emailed.", `${name}: the row says "Refunded $5. Ana was emailed."`, done)
    await shot(p, `${name}-refunded`)
    expect(errors.length === 0, `${name}: no page errors`, errors)
    await p.close()
  }

  /* ── A community's checkout ────────────────────────────────────────── */
  console.log("\nCHECKOUT: refund policy, EU waiver, the buyer's way of writing money")
  for (const [name, vp] of [DESKTOP, PHONE]) {
    const { p, errors } = await open(`/checkout?productId=p1&case=checkout&locale=de-DE&currency=eur`, vp)
    const got = await p.evaluate(() => ({
      policy: !!document.querySelector("[data-community-refund-policy]"),
      consent: document.querySelector("#membership-terms")?.textContent?.replace(/\s+/g, " ").trim(),
      total: document.querySelector("[data-total]")?.textContent?.replace(/\s+/g, " ").trim(),
    }))
    expect(got.policy, `${name}: the community's refund policy is on the checkout`)
    expect(/until I cancel\. I want access to start right away, and I understand that I lose my 14 day right of withdrawal once it does\./.test(got.consent || ""), `${name}: the consent carries the EU waiver`, got.consent)
    expect(/^19,50 €/.test(got.total || ""), `${name}: the price in euros, the German way`, got.total)
    expect((await sideScroll(p)) <= 0, `${name}: nothing scrolls sideways`)
    await p.click("[data-community-refund-policy] summary")
    await sleep(150)
    await shot(p, `${name}-checkout`, true)
    expect(errors.length === 0, `${name}: no page errors`, errors)
    await p.close()
  }
  {
    const { p, errors } = await open(`/checkout?productId=p1&case=checkout&waiver=0`, PHONE[1])
    const consent = await p.evaluate(() => document.querySelector("#membership-terms")?.textContent?.replace(/\s+/g, " ").trim())
    expect(!/withdrawal/.test(consent || "") && /\$19\.50/.test(await p.evaluate(() => document.querySelector("[data-total]")?.textContent || "")), "phone-390: a US buyer's consent has no waiver, and the price is $19.50", consent)
    expect(errors.length === 0, "phone-390 US checkout: no page errors", errors)
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
