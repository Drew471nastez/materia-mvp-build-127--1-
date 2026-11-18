/**
 * The marketing header's links hold still on a reload (onboarding round 5,
 * the owner: "when I reload, the menu links move from left to right"). A
 * reload draws the guest buttons at the right while the account is read,
 * then the signed in icons and photo. The row is three columns
 * (components/platform/platform-header-client, data-marketing-row), so the
 * links' place does not depend on the right side's width. Measured with the
 * app's own stylesheet at 768 to 1920, against the old row spread apart.
 */
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"
const css = await appCss(process.cwd())
const links = ["Home","Discover","Blog","Pricing","FAQ"].map((l,i)=>`<a class="px-3 lg:px-4 py-2 text-[15px] lg:text-[16px] font-medium ${i===0?"hidden lg:inline":""}">${l}</a>`).join("")
const row = (grid, right, reserve) => `<div class="mx-auto max-w-[1440px] px-6"><div class="${grid}"><a class="shrink-0 flex items-center gap-2"><span style="display:inline-block;width:38px;height:38px;background:#7c3aed;border-radius:8px"></span><span class="text-[20px] font-semibold">Storelib</span></a><nav id="nav" class="flex items-center gap-1 lg:gap-2">${links}</nav>${reserve ? `<div class="grid items-center justify-items-end [&>*]:[grid-area:1/1]">${reserve === "on" ? `<div aria-hidden class="pointer-events-none"><div class="flex shrink-0 items-center invisible">${guestInner}</div></div>` : ""}<div class="flex items-center gap-2.5">${right}</div></div>` : `<div class="flex items-center gap-2.5">${right}</div>`}</div></div>`
/* The guest row as GuestHeaderActions draws it: one flex box, its own margins. */
const guestInner = `<span class="ml-1 h-6 w-px" style="background:#ccc"></span><a class="ml-5 whitespace-nowrap px-2 py-2 text-[15px] font-medium">Sell on Storelib</a><a class="ml-2.5 h-10 px-4 inline-flex items-center border rounded-lg">Log in</a><a class="ml-2.5 h-10 px-4 inline-flex items-center rounded-lg bg-purple-600 text-white">Sign up</a>`
const guest = `<div class="flex shrink-0 items-center">${guestInner}</div>`
const user = `<span style="display:inline-block;width:42px;height:42px;border-radius:99px;background:#ddd"></span><span style="display:inline-block;width:42px;height:42px;border-radius:99px;background:#ddd"></span><a class="h-10 px-4 inline-flex items-center rounded-lg border">Dashboard</a><span style="display:inline-block;width:40px;height:40px;border-radius:99px;background:#999"></span>`
const ROW = "hidden md:flex items-center justify-between w-full"
const problems = []
const b = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })
const p = await b.newPage()
for (const w of [768, 1024, 1280, 1440, 1920]) {
  await p.setViewport({ width: w, height: 200 })
  const out = {}
  for (const [name, reserved] of [["before", false], ["after", true]]) {
    const xs = []
    for (const [right, reserve] of [[guest, reserved ? "off" : false], [user, reserved ? "on" : false]]) {
      await p.setContent(`<html><head><style>${css}</style></head><body style="margin:0;font-family:Inter,system-ui">${row(ROW, right, reserve)}</body></html>`)
      xs.push(await p.$eval("#nav", (n) => Math.round(n.getBoundingClientRect().left)))
      const over = await p.evaluate(() => { const n = document.querySelector("#nav").getBoundingClientRect(); const r = document.querySelector("#nav").nextElementSibling.getBoundingClientRect(); return Math.round(r.left - n.right) })
      if (over < 0) xs.push(`OVERLAP ${over}`)
    }
    out[name] = `guest x=${xs[0]}, signed in x=${xs[xs.length > 2 ? 2 : 1]}, moves ${typeof xs[1] === "number" ? Math.abs(xs[0]-xs[1]) : "?"}px ${xs.filter((v)=>typeof v==="string").join(" ")}`
  }
  console.log(w, JSON.stringify(out))
  if (!/moves 0px $/.test(out.after)) problems.push(`at ${w}: ${out.after}`)
}
await b.close()
if (problems.length) { console.error(`\nThe header's links still move:\n  ${problems.join("\n  ")}`); process.exit(1) }
console.log("The header's links hold still between the guest row and the signed in row at every width.")
