/**
 * ===========================================================================
 *  THE EDITOR'S OWN ROUTES, HELD TO WHAT THEY PROMISE
 * ===========================================================================
 * The builder saves through a handful of routes under
 * app/api/website-builder/themes/[installId]. Each of these checks is a thing
 * one of them used to get wrong: a write whose failure was reported as
 * success, a publish that could leave a creator with no website, a copy of
 * the header that skipped the cleaning every other save goes through.
 *
 * The routes need a signed-in session and a database, so what is checked
 * here is the code itself, the same way tests/published-site.test.ts does.
 *
 * Run with:  pnpm test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { LIMITS } from "@/lib/api/rate-limit"
import { AGENT_LIMITS } from "@/lib/sites/rate-limit"
import { toPageSlug } from "@/lib/sites/slug"
import { POLICY_PAGE_KEYS } from "@/lib/website-builder/policy-pages"
import { previewBase } from "@/lib/website-builder/preview-link"
import { BUILT_IN_PAGE_KEYS, isPageKey } from "@/lib/website-builder/site-pages"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const ROUTES = "app/api/website-builder/themes/[installId]"

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The header and footer copied to every page")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const sync = read(`${ROUTES}/sections/sync-global/route.ts`)
    check("cleaned by the same function as the sections route, with the install's own files",
      /const own = await readOwnSectionFields\(supabase, installId, sent\.map\(\(s\) => s\.type\)\)/.test(sync)
        && /const header = sentHeader \? sanitizeSections\(\[sentHeader\], own\)\[0\] : null/.test(sync)
        && /const footer = sentFooter \? sanitizeSections\(\[sentFooter\], own\)\[0\] : null/.test(sync))
    check("held to the same block limit, before anything is read or written",
      /\(s\.blocks\?\.length \?\? 0\) > LIMITS\.blocksPerSection/.test(sync)
        && sync.indexOf("LIMITS.blocksPerSection") < sync.indexOf('.from("store_theme_pages")'))
    check("a page that goes live is cleaned whole, as publishing cleans it",
      /\? \{ sections: sanitizeSections\(merged, pageOwn\), draft_sections: null \}/.test(sync))
    check("a failed read of the other pages is an error, not an empty success",
      /if \(readErr\) return NextResponse\.json\(/.test(sync))
    check("and a write that failed is not reported as a sync",
      /if \(failed > 0\) \{/.test(sync) && /status: 500/.test(sync.slice(sync.indexOf("if (failed > 0) {"))))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Publishing never leaves a creator with no website")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const route = read(`${ROUTES}/publish/route.ts`)
    const publish = route.slice(route.indexOf('if (action === "publish")'), route.indexOf('if (action === "unpublish")'))
    const promoted = publish.indexOf("draft_sections: null")
    const down = publish.indexOf('.update({ status: "unpublished" })')
    const up = publish.indexOf('.update({ status: "published", published_at')
    check("the drafts are promoted before any status changes", promoted > 0 && down > promoted && up > down)
    check("every write that makes up the publish is checked",
      /if \(settingsErr\) return failed\(/.test(publish) && /if \(pageErr\) return failed\(/.test(publish)
        && /if \(settingsReadErr\) return failed\(/.test(publish) && /if \(pagesReadErr\) return failed\(/.test(publish)
        && /if \(downErr\) return failed\(/.test(publish))
    check("the sites it takes down are remembered, and put back if this one will not go up",
      /\.neq\("id", installId\)\s*\n\s*\.select\("id"\)/.test(publish)
        && /\.update\(\{ status: "published" \}\)\.in\("id", wasLive\)/.test(publish))
    check("and a failure says which website is live now, in plain words",
      /The website that was live still is\./.test(publish) && /is now offline\. Publish again\./.test(publish))
    check("a partial publish still clears the cached site",
      /if \(touchedLive\) await revalidatePublishedSite\(creator\.id\)/.test(publish))
    check("the section types the install wrote are cleaned by their own files on the way live",
      /sanitizeSections\(page\.draft_sections as SectionInstance\[\], own\)/.test(publish))
    const unpublish = route.slice(route.indexOf('if (action === "unpublish")'), route.indexOf('if (action === "save_draft")'))
    check("a take-down that did not happen is not reported as one", /if \(downErr\) \{/.test(unpublish))
    check("and neither is a draft that was not saved", /if \(draftErr\) return NextResponse\.json\(/.test(route.slice(route.indexOf('if (action === "save_draft")'))))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The backup taken after an AI task")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const backups = read(`${ROUTES}/backups/route.ts`)
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    const agent = read(`${ROUTES}/agent/route.ts`)
    const prompt = Number(agent.match(/const MAX_PROMPT = ([\d_]+)/)?.[1].replace(/_/g, "") ?? 0)
    const kept = Number(backups.match(/const LABEL_MAX = (\d+)/)?.[1] ?? 0)
    check("the editor labels it with the prompt, which can be longer than a label", /source: "ai", label: prompt/.test(editor) && prompt > kept && kept > 0)
    check("so a long label is shortened, not refused",
      /label: z\.string\(\)\.transform\(\(s\) => Array\.from\(s\)\.slice\(0, LABEL_MAX\)\.join\(""\)\)\.optional\(\)/.test(backups)
        && !/label: z\.string\(\)\.max\(/.test(backups))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A preview link points at one of our addresses, and nowhere else")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const allowed = { requestOrigin: "https://storelib.com", mainDomain: "storelib.com", canonical: "https://storelib.com" }
    const kept = (base: string, a = allowed) => previewBase(base, a)
    check("the address the publish panel sends is kept as it was", kept("https://mara.storelib.com") === "https://mara.storelib.com/"
      && kept("https://mara.storelib.com/?ref=panel") === "https://mara.storelib.com/?ref=panel")
    check("and so is a deployment's own main domain",
      kept("https://mara.example.test", { ...allowed, mainDomain: "example.test" }) === "https://mara.example.test/")
    check("a local build, which is http on its own address, still works",
      kept("http://localhost:3000/w/mara", { requestOrigin: "http://localhost:3000", mainDomain: "localhost:3000", canonical: "http://localhost:3000" }) === "http://localhost:3000/w/mara")
    const hostile = [
      "https://evil.example/x",
      "https://storelib.com.evil.example/",
      "https://storelib.com@evil.example/",
      "https://user:pass@mara.storelib.com/",
      "http://mara.storelib.com/",
      "javascript:alert(1)",
      "data:text/html,x",
      "//evil.example",
      "not an address",
    ]
    const leaked = hostile.filter((b) => kept(b) !== "https://storelib.com")
    check(`${hostile.length} other addresses all fall back to the canonical origin`, leaked.length === 0, leaked.join(" | "))
    check("a fragment is dropped rather than carried into the link", kept("https://mara.storelib.com/#x") === "https://mara.storelib.com/")
    const route = read(`${ROUTES}/preview/route.ts`)
    check("every link the route hands out goes through it",
      /const base = previewBase\(sent, \{ requestOrigin: req\.nextUrl\.origin, mainDomain: getMainDomain\(\), canonical: getCanonicalSiteUrl\(\) \}\)/.test(route)
        && (route.match(/withToken\(req, /g) ?? []).length === 3)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A page key: the editor's shape for a new page, any existing key for the rest")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const made = ["About us", "Size guide!", "Ünïcode Café", "  spaced  out  ", "x".repeat(90), "404 page"].map(toPageSlug)
    const built = [...BUILT_IN_PAGE_KEYS, ...POLICY_PAGE_KEYS]
    check("every key the editor makes, and every page the theme ships, has the shape", [...made, ...built].every((k) => !k || isPageKey(k)), [...made, ...built].filter((k) => k && !isPageKey(k)).join(", "))
    check("a path, an upper case letter or a dot does not", !isPageKey("../x") && !isPageKey("About") && !isPageKey("page.about") && !isPageKey("") && !isPageKey("-a"))
    const sections = read(`${ROUTES}/sections/route.ts`)
    const put = sections.slice(sections.indexOf("export async function PUT"), sections.indexOf("export async function DELETE"))
    const del = sections.slice(sections.indexOf("export async function DELETE"))
    check("a new page must have the shape, and an existing one keeps its key",
      /if \(!existing && !isPageKey\(page_key\)\)/.test(put) && put.indexOf("if (!existing && !isPageKey(page_key))") < put.indexOf(".insert("))
    check("delete matches the key exactly as stored, as save does", !/toLowerCase\(\)/.test(del) && /const pageKey = searchParams\.get\("page"\) \?\? ""/.test(del))
    check("and refuses a key that is neither the shape nor a page this site has", /if \(!isPageKey\(pageKey\)\) \{/.test(del) && /if \(!found\) return NextResponse\.json\(/.test(del))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Every route is limited per person, after they are known, above anything the editor does")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* [route, the function's name, bucket, allowance] */
    const limited: [string, string, string, keyof typeof LIMITS][] = [
      ["settings", "PUT", "site-settings-save", "siteSave"],
      ["sections", "PUT", "site-sections-save", "siteSave"],
      ["sections", "GET", "site-sections-read", "siteRead"],
      ["sections", "DELETE", "site-page-delete", "siteAction"],
      ["sections/sync-global", "PUT", "site-header-sync", "siteSave"],
      ["publish", "POST", "site-publish", "sitePublish"],
      ["backups", "GET", "site-backups-read", "siteRead"],
      ["backups", "POST", "site-backup", "siteAction"],
      ["cover", "POST", "site-cover", "siteCover"],
      ["preview", "GET", "site-preview-link", "siteAction"],
      ["sections/code", "POST", "site-section-write", "siteAi"],
      ["sections/code/fix", "POST", "site-section-fix", "siteAi"],
    ]
    for (const [route, method, bucket, allowance] of limited) {
      const src = read(`${ROUTES}/${route}/route.ts`)
      const fn = src.slice(src.indexOf(`export async function ${method}(`))
      const body = fn.slice(0, fn.indexOf("\nexport async function ") > 0 ? fn.indexOf("\nexport async function ") : undefined)
      const where = src.indexOf(`bucket: "${bucket}"`)
      const counted = where > 0 && new RegExp(`bucket: "${bucket}",?\\s*(\\n\\s*)?subjects: \\[\`user:\\$\\{[\\w.]+\\}\`\\],?\\s*(\\n\\s*)?windows: (RATE_)?LIMITS\\.${allowance}`).test(src)
      /* The helper may be a small function of its own (the preview route's three methods share one). */
      const called = /const limited = await (rateLimit\(|limit\()/.test(body) && /if \(limited\) return limited/.test(body)
      const afterAuth = body.indexOf("const limited") > Math.max(body.indexOf("await getCreatorInstall("), body.indexOf("await ownInstall("), body.indexOf("await owned("), body.indexOf(".eq(\"creator_id\""))
      check(`${route} ${method}: limited per person as "${bucket}" (${allowance}), once they are known`, counted && called && afterAuth)
    }
    const preview = read(`${ROUTES}/preview/route.ts`)
    check("the preview link's three methods all count against it", (preview.match(/const limited = await limit\(o\.userId\)/g) ?? []).length === 3)

    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    const delay = Number(editor.match(/const AUTOSAVE_DELAY_MS = ([\d_]+)/)?.[1].replace(/_/g, "") ?? 0)
    const perTabPerMinute = Math.ceil(60_000 / delay)
    const [minute, hour] = LIMITS.siteSave
    check(`a save allowance above autosave in two tabs (${perTabPerMinute} a minute each, every ${delay} ms)`,
      delay > 0 && minute.seconds === 60 && minute.limit >= 2 * perTabPerMinute && hour.seconds === 3600 && hour.limit >= 2 * perTabPerMinute * 60,
      `${minute.limit}/min, ${hour.limit}/h`)
    check("the AI section routes have the page assistant's budget",
      JSON.stringify(LIMITS.siteAi.map(({ limit, seconds }) => [limit, seconds])) === JSON.stringify(AGENT_LIMITS.map(({ limit, seconds }) => [limit, seconds])))
    check("and they are refused before a model is reached", (() => {
      const code = read(`${ROUTES}/sections/code/route.ts`)
      const fix = read(`${ROUTES}/sections/code/fix/route.ts`)
      return code.indexOf('bucket: "site-section-write"') < code.indexOf("writeSection(") && fix.indexOf('bucket: "site-section-fix"') < fix.indexOf("fixSection(")
    })())
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
