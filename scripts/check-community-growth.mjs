/**
 * ===========================================================================
 *  ROUND 8, COMMUNITY GROWTH, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real components (scripts/render-community-growth.tsx) at 1440x900 and
 * on phones at 375x812 and 390x844:
 *
 *   INVITE       Invite on the community card (a computer) and at the end
 *                of the row of tabs (a phone), each opening the sheet: a
 *                centred dialog on a computer, Storelib's bottom sheet on a
 *                phone, inside the screen; the link is the community's own
 *                address and Copy writes it; Share only where the browser
 *                has a share sheet; Email always; what the link does said
 *                from the community's access (free, paid, approval, invite
 *                only); a member sees no Private invites, an admin does, and
 *                Send (email) and Create link post to /invites and show the
 *                link that came back with its own Copy
 *   ROLE BADGES  Owner, Admin, Moderator beside names: small words with a
 *                glyph, no fill, no border, no pill; a member none
 *   LIBRARY      no stray "Members" (or "Member") beside "by <creator>": a
 *                plain member's row says nothing, an owner's "Owner", a
 *                request "Request sent"
 *   PHONE FRAME  at 375 and 390: the bar's name gets two lines rather than
 *                "Clay Stu...", the actions stay 40px and on screen, the
 *                tabs scroll under a pinned Invite, nothing scrolls sideways,
 *                nothing overlaps in the bar, every control 40px or taller
 *
 *   PROBE_CSS=source node scripts/check-community-growth.mjs
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
const stubs = join(root, ".community-growth-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-growth-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

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
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}) }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-growth.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-growth-probe/navigation.js", "next/link": "./.community-growth-probe/link.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
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

  const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 }
  const PHONES = [
    ["phone-375", { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]

  async function open(query, vp, { share = false } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    const ctx = browser.defaultBrowserContext()
    await ctx.overridePermissions(ORIGIN, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"])
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        let body = {}
        if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: false, communities: [] }
        else if (short.startsWith("/api/notifications/inbox")) body = { unread: 0, items: [], nextCursor: null }
        else if (short.includes("/dms")) body = { ready: true, unread: 2, conversations: [] }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    /* A phone's share sheet where the probe says there is one; a desktop Chromium has none here. */
    await p.evaluateOnNewDocument((s) => {
      window.__shared = []
      if (s) navigator.share = async (d) => { window.__shared.push(d) }
      else try { delete Navigator.prototype.share } catch { /* fine */ }
    }, share)
    await p.goto(`${ORIGIN}/community/clay-studio?${query}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(400)
    return { p, errors }
  }
  const shot = (p, name, fullPage = false) => p.screenshot({ path: join(shots, `${name}.png`), fullPage })
  const sideScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  const smallTargets = (p, scope = "body") =>
    p.evaluate((scope) => {
      const out = []
      for (const el of document.querySelector(scope).querySelectorAll("button, a[data-community-nav], [data-invite-mail], [data-account-more], select, input")) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden" || cs.display === "none") continue
        if (el.closest("[data-invite-sheet] select")) continue
        if (el.tagName === "SELECT" || (el.tagName === "INPUT" && el.closest("label"))) {
          const box = el.closest("label").getBoundingClientRect()
          if (box.height < 40) out.push({ tag: el.tagName, h: Math.round(box.height) })
          continue
        }
        if (r.height < 40) out.push({ tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24), h: Math.round(r.height) })
      }
      return out
    }, scope)
  const sheetBox = (p) =>
    p.evaluate(() => {
      const el = document.querySelector("[data-invite-sheet]")
      if (!el) return null
      const box = (el.closest("[data-sheet-panel]") || el.closest("[role=dialog]") || el).getBoundingClientRect()
      /* Nothing inside drawn past the dialog's or the sheet's own edge (a long invite link once pushed it wide). */
      const spills = [...el.querySelectorAll("*")].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.right > box.right + 0.5 || r.left < box.left - 0.5) }).length
      return { spills, top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right), vw: innerWidth, vh: innerHeight, line: document.querySelector("[data-invite-line]")?.textContent, url: document.querySelector("[data-invite-url]")?.getAttribute("data-invite-url"), share: !!document.querySelector("[data-invite-share]"), mail: document.querySelector("[data-invite-mail]")?.getAttribute("href"), staff: !!document.querySelector("[data-invite-staff]"), manage: document.querySelector("[data-invite-manage]")?.getAttribute("href") ?? null }
    })

  /* ── A computer: the card's Invite, the dialog ─────────────────────── */
  console.log("\nINVITE, a computer")
  {
    const { p, errors } = await open("case=feed&access=paid", DESKTOP)
    const card = await p.evaluate(() => {
      const b = document.querySelector('[data-community-invite="card"]')
      const r = b?.getBoundingClientRect()
      const settings = document.querySelector("[data-wall-settings]")
      const tabsInvite = document.querySelector('[data-community-invite="tabs"]')
      return { h: r ? Math.round(r.height) : 0, w: r ? Math.round(r.width) : 0, text: b?.textContent?.trim(), settings: !!settings, tabsInviteVisible: !!tabsInvite && tabsInvite.getBoundingClientRect().width > 0 && getComputedStyle(tabsInvite.closest("[data-community-top-tabs]")).display !== "none" }
    })
    expect(card.text === "Invite" && card.h === 40 && card.w > 200 && !card.settings, "a member: Invite across the card, 40px, no Settings", card)
    expect(!card.tabsInviteVisible, "from 1024px the tabs (and their Invite) are not drawn: the card has it", card)
    await shot(p, "desktop-feed")
    await p.click('[data-community-invite="card"]')
    await sleep(450)
    const box = await sheetBox(p)
    expect(!!box && box.left > 400 && box.right < 1040 && box.top > 60 && box.bottom < 860, "a centred dialog, inside the screen", box)
    expect(box?.url === "storelib.com/community/clay-studio", "the link is the community's own address", box?.url)
    expect(box?.line === "Anyone with the link sees the page and the price, and joins when they pay.", "paid: says the link leads to the page and the price", box?.line)
    expect(box && !box.share && /^mailto:\?subject=Join%20me%20in%20Clay%20Studio%20on%20Storelib&body=/.test(box.mail || ""), "no share sheet on this browser: Email, never a dead Share", box)
    expect(box && !box.staff, "a member sees no Private invites", box)
    await p.click('[data-invite-copy="community"]')
    await sleep(150)
    const copied = await p.evaluate(async () => ({ text: await navigator.clipboard.readText().catch(() => "?"), label: document.querySelector('[data-invite-copy="community"]').textContent.trim() }))
    expect(copied.text === "https://storelib.com/community/clay-studio" && copied.label === "Copied", "Copy writes the full address and says Copied", copied)
    await shot(p, "desktop-invite-member")
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }
  {
    const { p, errors } = await open("case=feed&access=invite_only&staff=1", DESKTOP)
    const both = await p.evaluate(() => ({ invite: !!document.querySelector('[data-community-invite="card"]'), settings: !!document.querySelector("[data-wall-settings]"), row: (() => { const a = document.querySelector('[data-community-invite="card"]').getBoundingClientRect(); const b = document.querySelector("[data-wall-settings]").getBoundingClientRect(); return { sameRow: Math.abs(a.top - b.top) < 1, aw: Math.round(a.width), bw: Math.round(b.width) } })() }))
    expect(both.invite && both.settings && both.row.sameRow && Math.abs(both.row.aw - both.row.bw) <= 1, "staff: Invite and Settings side by side, the same width", both)
    await p.click('[data-community-invite="card"]')
    await sleep(450)
    const box = await sheetBox(p)
    expect(box?.staff && box.manage === "/app/community/c0000000-0000-4000-8000-000000000001/members", "an admin with a creator account: Private invites and Manage invites", box)
    expect(box?.line?.startsWith("This community is invite only"), "invite only: says an admin's invite lets people in", box?.line)
    const sendDisabled = await p.$eval("[data-invite-send]", (b) => b.disabled)
    await p.type("[data-invite-email]", "ana@example.com")
    const sendEnabled = await p.$eval("[data-invite-send]", (b) => !b.disabled)
    expect(sendDisabled && sendEnabled, "Send waits for an address")
    await p.click("[data-invite-send]")
    await sleep(400)
    const afterEmail = await p.evaluate(() => ({ sent: window.__invites, made: document.querySelector("[data-invite-made] [data-invite-url]")?.getAttribute("data-invite-url"), note: document.querySelector("[data-invite-made] p")?.textContent }))
    expect(JSON.stringify(afterEmail.sent) === JSON.stringify([{ email: "ana@example.com" }]) && /join\?invite=tok-email/.test(afterEmail.made || "") && /^Sent to ana@example\.com/.test(afterEmail.note || ""), "Send posts the address and shows the link it made", afterEmail)
    await p.select("[data-invite-days]", "7")
    await p.select("[data-invite-uses]", "10")
    await p.click("[data-invite-create]")
    await sleep(400)
    const afterLink = await p.evaluate(() => ({ sent: window.__invites.at(-1), made: document.querySelector("[data-invite-made] [data-invite-url]")?.getAttribute("data-invite-url") }))
    expect(JSON.stringify(afterLink.sent) === JSON.stringify({ maxUses: "10", expiresInDays: "7" }) && /join\?invite=tok-link/.test(afterLink.made || ""), "Create link posts the uses and the days, and shows the link", afterLink)
    const after = await sheetBox(p)
    expect(after && after.spills === 0 && after.right - after.left <= 520, "with a long invite link in it the dialog keeps its width, nothing spills", { spills: after?.spills, w: after && after.right - after.left })
    await shot(p, "desktop-invite-staff")
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── Phones: the bar, the tabs' Invite, the sheet ──────────────────── */
  for (const [name, vp] of PHONES) {
    console.log(`\nPHONE FRAME and INVITE, ${name}`)
    for (const long of [false, true]) {
      const { p, errors } = await open(`case=feed&access=free${long ? "&name=long" : ""}`, vp, { share: true })
      const bar = await p.evaluate(() => {
        const q = (s) => document.querySelector(s)?.getBoundingClientRect()
        const nameEl = document.querySelector("[data-community-name]")
        const lh = parseFloat(getComputedStyle(nameEl).lineHeight)
        const nameBox = nameEl.getBoundingClientRect()
        const actions = q("[data-community-top-actions]")
        const lead = q("[data-community-top-lead]")
        const end = q("[data-community-tabs-end]")
        const track = document.querySelector("[data-community-tabs-track]")
        const inv = q('[data-community-invite="tabs"]')
        return {
          lines: Math.round(nameBox.height / lh),
          clipped: nameEl.scrollHeight > nameEl.clientHeight + 1,
          nameW: Math.round(nameBox.width),
          overlap: Math.round(lead.right - actions.left),
          actionsRight: Math.round(actions.right),
          barH: Math.round(q("[data-community-top-row]").height),
          invite: inv ? { h: Math.round(inv.height), right: Math.round(inv.right), top: Math.round(inv.top) } : null,
          endRight: end ? Math.round(end.right) : null,
          trackScrolls: track.scrollWidth > track.clientWidth,
          trackRight: Math.round(track.getBoundingClientRect().right),
          saved: (() => { const c = document.querySelector('[data-space-chip="saved"]'); const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), name: c.textContent.trim() } })(),
          chipsTrack: Math.round(document.querySelector("[data-space-chips-track]").getBoundingClientRect().width),
        }
      })
      const tag = `${name}${long ? "-long-name" : ""}`
      expect(bar.lines <= 2 && bar.overlap <= 0 && bar.actionsRight <= vp.width, `${tag}: the name in at most two lines, never under the actions, the actions on screen`, bar)
      if (!long) expect(!bar.clipped, `${tag}: "Clay Studio" whole (one line, or two at 375), not "Clay Stu..."`, bar)
      expect(bar.invite && bar.invite.h >= 40 && bar.invite.right <= vp.width && bar.trackRight <= (bar.endRight ?? vp.width), `${tag}: Invite pinned at the end of the tabs, 40px, the tabs scrolling before it`, bar)
      expect(bar.saved.w === 40 && bar.saved.h === 40 && bar.saved.name === "Saved" && bar.chipsTrack >= 200, `${tag}: Saved is its bookmark in a 40px circle (named for a screen reader), the spaces get the row`, { saved: bar.saved, chipsTrack: bar.chipsTrack })
      expect((await sideScroll(p)) <= 0, `${tag}: nothing scrolls sideways`)
      const small = await smallTargets(p, "[data-community-top]")
      expect(small.length === 0, `${tag}: every control in the bar 40px or taller`, small)
      await shot(p, `${tag}-feed`)
      if (!long) {
        await p.tap('[data-community-invite="tabs"]')
        await sleep(700)
        const box = await sheetBox(p)
        expect(!!box && box.bottom <= vp.height + 1 && box.top > 40 && box.left >= 0 && box.right <= vp.width, `${tag}: the sheet rises from the bottom, inside the screen`, box)
        expect(box?.share && box.line === "Anyone with the link can join for free.", `${tag}: the phone's share sheet is offered; free says it joins`, box)
        await p.tap("[data-invite-share]")
        await sleep(150)
        const shared = await p.evaluate(() => window.__shared)
        expect(shared.length === 1 && shared[0].url === "https://storelib.com/community/clay-studio" && shared[0].title === "Clay Studio", `${tag}: Share hands the address to the phone`, shared)
        const small2 = await smallTargets(p, "[data-invite-sheet]")
        expect(small2.length === 0, `${tag}: every control in the sheet 40px or taller`, small2)
        await shot(p, `${tag}-invite`)
      }
      expect(errors.length === 0, `${tag}: no page errors`, errors)
      await p.close()
    }
    {
      const { p, errors } = await open("case=feed&access=free&staff=1&name=long", vp, { share: true })
      await p.tap('[data-community-invite="tabs"]')
      await sleep(700)
      const box = await sheetBox(p)
      expect(box?.staff && box.bottom <= vp.height + 1 && box.top >= 0 && box.spills === 0, `${name}: an admin's sheet, Private invites included, still inside the screen, nothing spilling`, box)
      expect((await sideScroll(p)) <= 0, `${name}: nothing scrolls sideways with the sheet open`)
      await shot(p, `${name}-invite-staff`)
      expect(errors.length === 0, `${name}: no page errors`, errors)
      await p.close()
    }
  }

  /* ── Role badges ───────────────────────────────────────────────────── */
  console.log("\nROLE BADGES")
  for (const [name, vp] of [["desktop-1440", DESKTOP], PHONES[1]]) {
    const { p, errors } = await open("case=members", vp)
    const badges = await p.evaluate(() =>
      [...document.querySelectorAll("[data-role-badge]")].map((b) => {
        const cs = getComputedStyle(b)
        const r = b.getBoundingClientRect()
        return { role: b.getAttribute("data-role-badge"), text: b.textContent, h: Math.round(r.height), bg: cs.backgroundColor, border: cs.borderTopWidth, shadow: cs.boxShadow, glyph: !!b.querySelector("svg") }
      }),
    )
    expect(JSON.stringify(badges.map((b) => b.text)) === JSON.stringify(["Owner", "Admin", "Moderator"]), `${name}: Owner, Admin, Moderator beside their names; members none`, badges.map((b) => b.text))
    expect(badges.every((b) => b.bg === "rgba(0, 0, 0, 0)" && b.border === "0px" && b.shadow === "none" && b.glyph && b.h <= 16), `${name}: small words with a glyph, no fill, no border, no shadow`, badges)
    await shot(p, `${name}-members`)
    expect(errors.length === 0, `${name}: no page errors`, errors)
    await p.close()
  }

  /* ── The library ───────────────────────────────────────────────────── */
  console.log("\nLIBRARY")
  for (const [name, vp] of [["desktop-1440", DESKTOP], PHONES[1]]) {
    const { p, errors } = await open("case=library", vp)
    const rows = await p.evaluate(() =>
      [...document.querySelectorAll("[data-community-row]")].map((r) => ({ slug: r.getAttribute("data-community-row"), creator: r.querySelector("[data-community-creator]")?.textContent?.replace(/\s+/g, " ").trim(), standing: r.querySelector("[data-community-standing]")?.textContent ?? null })),
    )
    expect(rows.find((r) => r.slug === "clay-studio")?.standing === null && !/Members?\b/.test(rows.find((r) => r.slug === "clay-studio")?.creator || ""), `${name}: a member's row is "by <creator>" alone`, rows[0])
    expect(rows.find((r) => r.slug === "night-runners")?.standing === "Owner", `${name}: an owner's row says Owner`, rows[1])
    expect(rows.find((r) => r.slug === "glaze-lab")?.standing === "Request sent", `${name}: a request says Request sent`, rows[3])
    expect(rows.every((r) => !/·\s*Members?$/.test(r.creator || "")), `${name}: no row ends in "· Members"`, rows.map((r) => r.creator))
    await shot(p, `${name}-library`)
    expect(errors.length === 0, `${name}: no page errors`, errors)
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
