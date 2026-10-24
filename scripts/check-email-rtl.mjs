/**
 * ===========================================================================
 *  AD4, MEASURED: A BUYER'S EMAIL IN ARABIC READS RIGHT TO LEFT
 * ===========================================================================
 * The order confirmation email (scripts/render-ad4-email.tsx) drawn in
 * Chromium at a phone's width (390px) and a mail client's (600px):
 *
 *   ENGLISH   the document's direction is ltr; the Subtotal label sits left
 *             of its amount, the amount ends at the row's right edge
 *   ARABIC    the document's direction is rtl; the label sits right of its
 *             amount, and the amount ends at the row's left edge
 *
 *   node scripts/check-email-rtl.mjs
 */
import { execFileSync } from "node:child_process"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const mails = JSON.parse(execFileSync("npx", ["tsx", "scripts/render-ad4-email.tsx"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 24 }))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

/* A row: the cell holding `label`, and the last cell of the same row (its amount). */
const measure = (label, amount) => {
  const cells = [...document.querySelectorAll("td")]
  const labelCell = cells.filter((td) => td.children.length === 0 || td.querySelectorAll("td").length === 0).find((td) => td.innerText.trim() === label)
  if (!labelCell) return null
  const row = labelCell.parentElement
  const amountCell = [...row.children].find((td) => td !== labelCell && td.innerText.includes(amount))
  if (!amountCell) return null
  const range = document.createRange()
  range.selectNodeContents(amountCell)
  const text = range.getBoundingClientRect()
  const l = labelCell.getBoundingClientRect()
  const a = amountCell.getBoundingClientRect()
  const table = row.closest("table").getBoundingClientRect()
  return {
    dir: getComputedStyle(document.body).direction,
    labelX: Math.round(l.left + l.width / 2),
    amountX: Math.round(a.left + a.width / 2),
    amountTextLeft: Math.round(text.left - table.left),
    amountTextRight: Math.round(table.right - text.right),
  }
}

for (const width of [390, 600]) {
  console.log(`\n${width}px wide`)
  for (const [lang, mail, subtotal] of [["en", mails.en, "Subtotal"], ["ar", mails.ar, "المجموع الفرعي"]]) {
    const p = await browser.newPage()
    await p.setViewport({ width, height: 1200 })
    await p.setContent(mail, { waitUntil: "load" })
    const row = await p.evaluate(measure, subtotal, "40")
    console.log(`  ${lang}: subtotal ${JSON.stringify(row)}`)
    if (lang === "en") {
      expect(row?.dir === "ltr", "English: left to right", row?.dir)
      expect(row && row.labelX < row.amountX, "English: the label left of its amount", row && [row.labelX, row.amountX])
      expect(row && row.amountTextRight <= 1, "English: the amount ends at the row's right edge", row?.amountTextRight)
    } else {
      expect(row?.dir === "rtl", "Arabic: right to left", row?.dir)
      expect(row && row.labelX > row.amountX, "Arabic: the label right of its amount", row && [row.labelX, row.amountX])
      expect(row && row.amountTextLeft <= 1, "Arabic: the amount ends at the row's left edge", row?.amountTextLeft)
    }
    await p.close()
  }
}

await browser.close()
console.log(broken ? `\n${broken} failed` : "\nall measured")
process.exit(broken ? 1 : 0)
