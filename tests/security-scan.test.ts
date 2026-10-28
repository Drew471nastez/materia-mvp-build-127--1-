/**
 * ===========================================================================
 *  THE SECURITY CHECK BEHIND THE PUBLISH PANEL
 * ===========================================================================
 * The panel said "No security issues found" with nothing behind it.
 * lib/website-builder/security-scan.ts now reads the draft that is about to
 * go live and says what a visitor's browser would warn about, block, or run
 * that nobody meant. These are the cases it has to find, the ordinary sites
 * it has to leave alone, and the shape the panel is wired against.
 *
 * Run with:  pnpm test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { scanSiteSecurity, SECURITY_ISSUE_LIMIT, SECURITY_MESSAGES, type SecurityIssue, type SiteDraft } from "@/lib/website-builder/security-scan"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

type Section = { id: string; type: string; settings: Record<string, unknown>; blocks?: { id: string; type: string; settings: Record<string, unknown> }[] }
const page = (page_key: string, ...sections: Section[]) => ({ page_key, sections })
const site = (pages: SiteDraft["pages"], settings: Record<string, unknown> = {}): SiteDraft => ({ settings, pages })
const only = (issues: SecurityIssue[]) => issues.map((i) => `${i.kind}@${i.page ?? "theme"}/${i.sectionId ?? "-"}`).join(" ")

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("An ordinary site has nothing to report")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const clean = site([
      page("home",
        { id: "hero", type: "hero", settings: { heading: "JavaScript: the good parts", image: "https://cdn.example.com/a.jpg", button_url: "/products", button2_url: "mailto:a@b.co" } },
        { id: "text", type: "rich_text", settings: { body: `<p><strong>bold</strong> <a href="https://x.com" target="_blank" rel="noopener noreferrer">link</a> <a href="#faq">faq</a></p><img src="https://x.com/b.png" alt="">` } },
        { id: "video", type: "video_embed", settings: { video_url: "http://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
        { id: "map", type: "map_embed", settings: { embed_code: `<iframe src="https://www.google.com/maps/embed?pb=1" style="border:0" loading="lazy"></iframe>` } },
        { id: "form", type: "custom_html", settings: { html_content: `<form action="https://formspree.io/f/x" method="post"><input name="email"></form><form><input></form>` } },
        { id: "inline", type: "hero", settings: { image: "data:image/png;base64,iVBORw0KGgo=", link_url: "http://example.com/old-page" } },
      ),
      page("about", { id: "a1", type: "rich_text", settings: { body: "<p>about us</p>" } }),
    ], { logo: "https://cdn.example.com/logo.png", announcement_bar_text: `<a href="/sale">Sale</a>`, _theme_pack: { sections: { x: { default: "http://example.com/a.jpg" } } } })
    const found = scanSiteSecurity(clean)
    check("no issues on a site with rich text, https media, a player link, a map, forms and a data picture", found.length === 0, only(found))
    check("and none on an empty or half-formed draft", scanSiteSecurity({ settings: null, pages: [{ page_key: "home", sections: null }, { page_key: "x", sections: [null, 7, "s"] as never }] }).length === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What it finds")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const cases: [string, Section, SecurityIssue["kind"]][] = [
      ["a javascript: button link", { id: "s", type: "hero", settings: { button_url: "javascript:alert(1)" } }, "script-link"],
      ["a javascript: link spelled with a reference", { id: "s", type: "hero", settings: { link_url: "jav&#x61;script:alert(1)" } }, "script-link"],
      ["a data: page as a link", { id: "s", type: "hero", settings: { button_url: "data:text/html;base64,PHNjcmlwdD4=" } }, "script-link"],
      ["a vbscript: link in rich text", { id: "s", type: "rich_text", settings: { body: `<p><a href="vbscript:msgbox(1)">x</a></p>` } }, "script-link"],
      ["a frame whose address is code", { id: "s", type: "custom_html", settings: { html_content: `<iframe src="javascript:alert(1)"></iframe>` } }, "script-link"],
      ["an http picture setting", { id: "s", type: "hero", settings: { image: "http://example.com/a.jpg" } }, "insecure-media"],
      ["an http picture in rich text", { id: "s", type: "rich_text", settings: { body: `<p><img src="http://example.com/a.jpg"></p>` } }, "insecure-media"],
      ["an http video file", { id: "s", type: "video", settings: { video_file: "http://example.com/v.mp4" } }, "insecure-media"],
      ["an http script source", { id: "s", type: "custom_html", settings: { html_content: `<script src="http://example.com/x.js"></script>` } }, "insecure-media"],
      ["a script in custom code", { id: "s", type: "custom_html", settings: { html_content: `<div>hi</div><script>track()</script>` } }, "custom-script"],
      ["an http frame", { id: "s", type: "map_embed", settings: { embed_code: `<iframe src="http://maps.example.com/embed"></iframe>` } }, "insecure-frame"],
      ["an inline handler", { id: "s", type: "custom_html", settings: { html_content: `<button onclick="buy()">Buy</button>` } }, "inline-handler"],
      ["a form that posts over http", { id: "s", type: "custom_html", settings: { html_content: `<form action="http://example.com/subscribe" method="post"></form>` } }, "insecure-form"],
    ]
    for (const [name, sec, kind] of cases) {
      const found = scanSiteSecurity(site([page("home", sec)]))
      check(`${name} is reported as ${kind}`, found.some((i) => i.kind === kind && i.page === "home" && i.sectionId === "s"), only(found))
    }
    const theme = scanSiteSecurity(site([], { announcement_bar_text: `<a href="javascript:void(0)">Sale</a>` }))
    check("a theme setting's issue belongs to no page and no section", theme.length === 1 && theme[0].page === null && theme[0].sectionId === null && theme[0].kind === "script-link", only(theme))
    const block = scanSiteSecurity(site([page("faq", { id: "q", type: "faq", settings: {}, blocks: [{ id: "b1", type: "question", settings: { answer: `<img src="http://x.com/a.png">` } }] })]))
    check("a block's issue is its section's", block.length === 1 && block[0].sectionId === "q" && block[0].page === "faq", only(block))
    const nested = scanSiteSecurity(site([page("home", { id: "h", type: "header", settings: { menu: [{ label: "Shop", url: "/shop" }, { label: "Bad", url: "javascript:alert(1)" }] } })]))
    check("a link inside a menu list is found", nested.length === 1 && nested[0].kind === "script-link", only(nested))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("One line per problem, at most twenty, in the order the site reads")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const twice = scanSiteSecurity(site([page("home", { id: "s", type: "gallery", settings: { image_1: "http://a.com/1.jpg", image_2: "http://a.com/2.jpg" } })]))
    check("two http pictures in one section are one issue", twice.length === 1, only(twice))
    const many = site([
      page("zeta", ...Array.from({ length: 15 }, (_, i) => ({ id: `z${i}`, type: "hero", settings: { image: "http://a.com/x.jpg" } }))),
      page("home", ...Array.from({ length: 15 }, (_, i) => ({ id: `h${i}`, type: "hero", settings: { button_url: "javascript:x()" } }))),
      page("about", { id: "a0", type: "hero", settings: { image: "http://a.com/x.jpg" } }),
    ], { logo: "http://a.com/logo.png" })
    const found = scanSiteSecurity(many)
    check(`the list stops at ${SECURITY_ISSUE_LIMIT}`, found.length === SECURITY_ISSUE_LIMIT && SECURITY_ISSUE_LIMIT === 20)
    check("theme settings first, then home, then the other pages by key, each top to bottom",
      found[0].page === null && found[1].sectionId === "h0" && found[15].sectionId === "h14" && found[16].page === "about" && found[17].sectionId === "z0",
      only(found))
    check("the same draft always gives the same list", JSON.stringify(scanSiteSecurity(many)) === JSON.stringify(found))
    check("a longer limit shows there is more, which is how the route says so", scanSiteSecurity(many, SECURITY_ISSUE_LIMIT + 1).length === SECURITY_ISSUE_LIMIT + 1)
    check("every issue has exactly the four fields the panel reads",
      found.every((i) => JSON.stringify(Object.keys(i).sort()) === JSON.stringify(["kind", "message", "page", "sectionId"])))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Written for the person publishing, not for a security engineer")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const messages = Object.values(SECURITY_MESSAGES)
    check("one short sentence or two, each", messages.every((m) => m.length <= 100 && /\.$/.test(m)), messages.filter((m) => m.length > 100).join(" | "))
    check("no jargon", messages.every((m) => !/xss|csp|mixed content|sanitiz|payload|inject|vulnerab|malicious|attack|protocol|scheme/i.test(m)))
    check("no em dashes and none of the words the house rules ban", messages.every((m) => !/—|unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(m)))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The route the panel calls")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const route = readFileSync(join(process.cwd(), "app/api/website-builder/themes/[installId]/security/route.ts"), "utf8")
    check("it only reads", /export async function GET/.test(route) && !/export async function (POST|PUT|PATCH|DELETE)/.test(route) && !/\.(update|insert|upsert|delete)\(/.test(route))
    check("for whoever is signed in, and only for their own install", /websiteInstallCaller\(installId\)/.test(route) && /\.eq\("creator_id", creatorId\)/.test(readFileSync(join(process.cwd(), "lib/team/areas.ts"), "utf8")) /* Changed on purpose (round 42 team): signed in and the install checked in lib/team/website */)
    check("counted per person like the routes beside it", /bucket: "site-security-scan"/.test(route) && /subjects: \[`user:\$\{user\.id\}`\]/.test(route) && /if \(limited\) return limited/.test(route))
    check("it checks the draft that Publish would put live",
      /draft_settings \?\? settingsRow\?\.settings/.test(route) && /p\.draft_sections \?\? p\.sections/.test(route))
    check("and a read that failed is an error, not a clean report", /if \(settingsErr \|\| pagesErr\) return NextResponse\.json\(/.test(route))
    check("it says when there are more than it lists", /truncated: found\.length > SECURITY_ISSUE_LIMIT/.test(route) && /SECURITY_ISSUE_LIMIT \+ 1/.test(route))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The panel says what the check says")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const panel = readFileSync(join(process.cwd(), "components/website-builder/publish-panel.tsx"), "utf8")
    const line = panel.slice(panel.indexOf("function SecurityLine("), panel.indexOf("function Body("))
    check("it asks the route each time the panel comes on screen, and a late answer cannot replace a newer one",
      /fetch\(`\/api\/website-builder\/themes\/\$\{installId\}\/security`, \{ cache: "no-store" \}\)/.test(panel) &&
        /if \(!active\) return\s*setIssuesOpen\(false\)/.test(panel) && /if \(run !== securityRun\.current\) return/.test(panel))
    check("\"No security issues found\" only for a check that came back with an empty list",
      (line.match(/No security issues found/g) ?? []).length === 1 && /check\.state === "clear" && \(/.test(line) &&
        /else if \(issues\.length === 0\) setSecurity\(\{ state: "clear" \}\)/.test(panel))
    check("a check that could not run says so, with a way to run it again",
      /if \(!issues\) setSecurity\(\{ state: "unknown" \}\)/.test(panel) && /catch \{\s*if \(run === securityRun\.current\) setSecurity\(\{ state: "unknown" \}\)/.test(panel) &&
        /Could not check for security issues/.test(line) && /onClick=\{onRetry\}/.test(line))
    check("one line tall in every state, so the phone sheet keeps its height as it opens",
      (line.match(/className=\{cn\(line, /g) ?? []).length === 4 && (line.match(/min-w-0 flex-1 truncate/g) ?? []).length === 4)
    check("what was found opens under the line on a press, with where each one is",
      /aria-expanded=\{open\}/.test(line) && /\{open && \(\s*<ul data-publish-security-issues=""/.test(line) && /issuePlace\(issue\.page\)/.test(line) && /\{issue\.message\}/.test(line))
    check("more than it lists is said as more", /check\.truncated \? "\+" : ""/.test(line) && /And more after these\./.test(line))
    check("its copy follows the house rules", !/—|unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(line.replace(/transition-transform/g, "")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
