/**
 * ===========================================================================
 *  TWO COVERS AT ONCE, ONE BROWSER UNPACKED (lib/website-builder/cover-shot)
 * ===========================================================================
 * "[cover] could not take the screenshots: spawn ETXTBSY". @sparticuz/chromium
 * writes its browser to /tmp/chromium the first time and says "it is there"
 * as soon as the file exists, while it is still being written, so a second
 * cover asked for in the same moment started a half written program.
 *
 * The first part makes the real error: a program started while a stream
 * still has it open for writing. The rest drives the unpacking and the
 * start with stand-ins: five covers at once unpack once, a busy file is
 * tried again once, and a failed unpacking is not kept.
 */
import { spawn } from "node:child_process"
import { createWriteStream, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isTextBusy, launchPacked, unpackOnce } from "@/lib/website-builder/cover-shot"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const forget = () => { (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("storelib.cover.chromium-unpacking")] = null }

async function main() {
  console.log("\nThe error itself: starting a program that is still being written")
  if (process.platform === "linux") {
    const file = join(mkdtempSync(join(tmpdir(), "etxtbsy-")), "chromium")
    const w = createWriteStream(file, { mode: 0o700 })
    w.write("#!/bin/sh\nexit 0\n")
    await sleep(50)
    /* Node throws it at once, as it did in production ("spawn ETXTBSY"). */
    const err = await new Promise<unknown>((resolve) => {
      try {
        const child = spawn(file)
        child.once("error", resolve)
        child.once("exit", () => resolve(null))
      } catch (e) {
        resolve(e)
      }
    })
    w.end()
    check("spawn answers ETXTBSY, and it is recognised", isTextBusy(err), (err as Error)?.message)
  }
  check("an ordinary failure is not taken for it", !isTextBusy(new Error("Failed to launch the browser process")) && !isTextBusy(null))

  console.log("\nFive covers at once unpack the browser once")
  {
    forget()
    let unpacks = 0
    const pack = { args: ["--single-process"], executablePath: async () => { unpacks++; await sleep(80); return "/tmp/chromium" } }
    const started: string[] = []
    const puppeteer = { launch: async (o: { executablePath: string; args: string[] }) => { started.push(o.executablePath); return { o } } }
    const browsers = await Promise.all(Array.from({ length: 5 }, () => launchPacked(puppeteer, pack, 5)))
    check("one unpacking", unpacks === 1, unpacks)
    check("and five browsers, each started after it was done", browsers.length === 5 && started.every((p) => p === "/tmp/chromium"), started)
    check("with the package's own arguments", (browsers[0] as { o: { args: string[] } }).o.args[0] === "--single-process")
    await launchPacked(puppeteer, pack, 5)
    check("a later cover does not unpack again", unpacks === 1)
  }

  console.log("\nA busy file is tried once more, and only once")
  {
    forget()
    const pack = { args: [], executablePath: async () => "/tmp/chromium" }
    const busy = Object.assign(new Error("spawn ETXTBSY"), { code: "ETXTBSY" })
    let tries = 0
    const once = { launch: async () => { tries++; if (tries === 1) throw busy; return "browser" } }
    check("busy, then fine: the cover is taken", (await launchPacked(once, pack, 5)) === "browser" && tries === 2, tries)
    tries = 0
    const always = { launch: async () => { tries++; throw busy } }
    let thrown: unknown = null
    try { await launchPacked(always, pack, 5) } catch (e) { thrown = e }
    check("busy twice: it gives up and says why", thrown === busy && tries === 2, tries)
    tries = 0
    const other = { launch: async () => { tries++; throw new Error("no memory") } }
    try { await launchPacked(other, pack, 5) } catch { /* expected */ }
    check("any other failure is not retried", tries === 1, tries)
  }

  console.log("\nA failed unpacking is not kept")
  {
    forget()
    let n = 0
    const pack = { args: [], executablePath: async () => { n++; if (n === 1) throw new Error("disk full"); return "/tmp/chromium" } }
    let first: unknown = null
    try { await unpackOnce(pack) } catch (e) { first = e }
    check("the first cover fails with the reason", (first as Error)?.message === "disk full")
    check("the next one unpacks again, and succeeds", (await unpackOnce(pack)) === "/tmp/chromium" && n === 2, n)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
}
main()
