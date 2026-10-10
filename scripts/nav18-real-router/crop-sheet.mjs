// node crop-sheet.mjs <framesdir> <out.png> x y w h scale [from] [count] [cols]
import puppeteer from "puppeteer-core"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
const [dir, out, x, y, w, h, scale = 3, from = 0, count = 30, cols = 10] = process.argv.slice(2)
const files = readdirSync(dir).filter((f) => /^f\d+-\d+\.jpg$/.test(f)).sort().slice(Number(from), Number(from) + Number(count))
const W = w * scale, H = h * scale
const cells = files.map((f) => `<div><div class=l>${f.replace(/^f(\d+)-(\d+)\.jpg$/, "#$1 $2ms")}</div><div class=v style="width:${W}px;height:${H}px"><img style="width:${390 * scale}px;margin-left:${-x * scale}px;margin-top:${-y * scale}px" src="data:image/jpeg;base64,${readFileSync(join(dir, f)).toString("base64")}"></div></div>`).join("")
const html = `<style>body{margin:0;background:#222;font:11px monospace}.g{display:grid;grid-template-columns:repeat(${cols},${W}px);gap:4px;padding:4px}.l{color:#ff0}.v{overflow:hidden;outline:1px solid #555}img{display:block;image-rendering:pixelated}</style><div class=g>${cells}</div>`
const b = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })
const p = await b.newPage()
await p.setViewport({ width: cols * (W + 4) + 8, height: 300 })
await p.setContent(html)
await p.screenshot({ path: out, fullPage: true })
await b.close()
