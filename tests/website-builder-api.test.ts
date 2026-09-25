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

import { previewBase } from "@/lib/website-builder/preview-link"

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

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
