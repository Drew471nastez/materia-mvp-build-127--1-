// node sheet.mjs <framesdir> <out.png> [cols=8] [from=0] [count=24] [width=180] [crop=0-844]
import puppeteer from "puppeteer-core"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
const [dir, out, cols = 8, from = 0, count = 24, w = 180, crop = "0-844"] = process.argv.slice(2)
const [c0, c1] = crop.split("-").map(Number)
const files = readdirSync(dir).filter((f) => /^f\d+-\d+\.jpg$/.test(f)).sort().slice(Number(from), Number(from) + Number(count))
const scale = Number(w) / (Number(process.env.SRCW) || 390)
const cells = files.map((f) => `<div class=c><div class=l>${f.replace(/^f(\d+)-(\d+)\.jpg$/, "#$1 $2ms")}</div><div class=v style="height:${(c1 - c0) * scale}px"><img style="width:${w}px;margin-top:${-c0 * scale}px" src="data:image/jpeg;base64,${readFileSync(join(dir, f)).toString("base64")}"></div></div>`).join("")
const html = `<style>body{margin:0;background:#222;font:12px monospace}.g{display:grid;grid-template-columns:repeat(${cols},${w}px);gap:4px;padding:4px}.l{color:#ff0;padding:2px}.v{overflow:hidden;outline:1px solid #555}img{display:block}</style><div class=g>${cells}</div>`
const b = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })
const p = await b.newPage()
await p.setViewport({ width: Number(cols) * (Number(w) + 4) + 8, height: 400 })
await p.setContent(html)
await p.screenshot({ path: out, fullPage: true })
await b.close()
