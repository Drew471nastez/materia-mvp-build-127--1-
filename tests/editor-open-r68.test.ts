/** probe draft 2 */
import { world, net, seedStore, resetCounts, installFetch, holdRequest, CREATOR_ID, USER_ID } from "./_r65-rest-world"
import { composeTemplateFiles } from "@/lib/themes/template-packages"
import { convertTemplateFiles } from "@/lib/themes/template-install"
import { storeImportedTheme } from "@/lib/themes/imported-theme-store"
import { createAdminClient } from "@/lib/supabase/admin"
import { forgetSigningKeys } from "@/lib/auth/verify-token"
import { forgetHeldBlobs } from "@/lib/website-builder/theme-file-refs"
import { forgetSectionFileMemo } from "@/lib/website-builder/custom-schemas"
import { GET as installGet } from "@/app/api/website-builder/themes/[installId]/route"
import { GET as sectionsGet } from "@/app/api/website-builder/themes/[installId]/sections/route"
import { GET as filesGet } from "@/app/api/website-builder/themes/[installId]/files/route"
import { POST as publishPost } from "@/app/api/website-builder/themes/[installId]/publish/route"
import * as nextCache from "../scripts/speed18/shims/next-cache"
const out = console.log.bind(console)
console.warn = () => {}; console.error = () => {}; console.info = () => {}
let INSTALL = ""
const afterTasks: (() => unknown)[] = []
;(globalThis as Record<string, unknown>).__PUSH_TEST_AFTER__ = (task: () => unknown) => void afterTasks.push(task)
async function app(path: string, init?: RequestInit): Promise<Response> {
  holdRequest()
  const req = new Request(`https://storelib.com${path}`, init)
  const id = path.split("/")[4]?.split("?")[0] ?? ""
  const params = { params: Promise.resolve({ installId: id }) }
  const p = path.split("?")[0]
  if (p === `/api/website-builder/themes/${id}`) return (await installGet(req, params)) as Response
  if (p === `/api/website-builder/themes/${id}/sections`) return (await sectionsGet(req, params)) as Response
  if (p === `/api/website-builder/themes/${id}/files`) return (await filesGet(req, params)) as Response
  if (p === `/api/website-builder/themes/${id}/publish`) return (await publishPost(req, params)) as Response
  return new Response("{}", { status: 404 })
}
installFetch(app)
const base = () => `/api/website-builder/themes/${INSTALL}`
async function timed(path: string) {
  const t = performance.now()
  const r = await fetch(path)
  const body = await r.text()
  return { status: r.status, ms: Math.round(performance.now() - t), kb: Math.round(body.length / 1024), end: performance.now() }
}
async function editorOpen() {
  const t0 = performance.now()
  const [a, b] = await Promise.all([timed(base()), timed(`${base()}/sections?page=home`)])
  const first = Math.round(performance.now() - t0)
  const [c, d] = await Promise.all([timed(`${base()}/files?compat=1`), timed(`${base()}/files?sources=1`)])
  return { first, install: a, sections: b, compat: c, sources: d, canvasData: Math.round(performance.now() - t0) }
}
async function main() {
  ;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
  forgetSigningKeys(); seedStore()
  const converted = await convertTemplateFiles(composeTemplateFiles("materia/clothing"), "Clothing")
  holdRequest(); net.rttMs = 0; net.mbps = 1e6
  const stored = await storeImportedTheme(createAdminClient(), { userId: USER_ID, creatorId: CREATOR_ID }, converted!.theme, converted!.report, { name: "Clothing" })
  if (!stored.ok) { out("store failed", stored); return }
  INSTALL = stored.installId
  await fetch(base())
  net.rttMs = 25
  for (const mbps of [25, 10, 3]) {
    net.mbps = mbps; net.shared = true; net.pool = 10
    forgetHeldBlobs(); forgetSectionFileMemo(); resetCounts()
    const q = await editorOpen()
    out(`quiet ${mbps}MB/s`, JSON.stringify(q), "db", (world.bytes / 1e6).toFixed(1), "MB")
    afterTasks.length = 0
    holdRequest()
    const pub = await fetch(`${base()}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publish" }) })
    await pub.text()
    forgetHeldBlobs(); forgetSectionFileMemo(); resetCounts()
    const tAfter = performance.now()
    const running = Promise.all(afterTasks.splice(0).map((task) => Promise.resolve().then(task).catch(() => {})))
    await new Promise((r) => setTimeout(r, Number(process.env.EDIT_AT ?? 2500)))
    const busy = await editorOpen()
    await running
    out(`after publish ${mbps}MB/s`, JSON.stringify(busy), "after work", Math.round(performance.now() - tAfter), "ms db", (world.bytes / 1e6).toFixed(1), "MB")
  }
}
main().catch((e) => out(e)).finally(() => process.exit(0))
