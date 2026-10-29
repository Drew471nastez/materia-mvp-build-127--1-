/**
 * ===========================================================================
 *  PUBLISHED MEANS PUBLISHED, AND A PREVIEW IS A DELIBERATE EXCEPTION
 * ===========================================================================
 * A published site was serving DRAFTS wherever it had nothing published to
 * serve. A page added since the last publish had only `draft_sections`, and
 * all three public routes fell back to it, so the page was live before
 * anybody published it. Publish is the whole point of having a draft, and
 * the one rule was not being kept.
 *
 * Closing that removes the only way a creator had to show work in progress,
 * so there is now a deliberate one: a long random token on the install. The
 * tests below are as much about what the token does NOT grant as what it
 * does.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { mayPreview, newPreviewToken, pageSections, previewTokenFrom, themeSettings } from "@/lib/website-builder/preview-link"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const qs = (s: string) => new URLSearchParams(s)

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("A visitor sees what was published, and nothing else")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const both = { sections: ["live"], draft_sections: ["draft"] }
    const draftOnly = { sections: null, draft_sections: ["draft"] }
    check("a published page shows the published sections", pageSections(both, false)?.[0] === "live")
    /**
     * The bug, in one line. A page added since the last publish has only a
     * draft, and this used to fall through to it.
     */
    check("a page that has never been published shows nothing at all", pageSections(draftOnly, false) === null)
    check("and a page with neither is still nothing, not a crash", pageSections({ sections: null, draft_sections: null }, false) === null)
    check("theme settings follow the same rule", themeSettings({ settings: { a: 1 }, draft_settings: { a: 2 } }, false)?.a === 1 && themeSettings({ settings: null, draft_settings: { a: 2 } }, false) === null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("With the link, the drafts")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const both = { sections: ["live"], draft_sections: ["draft"] }
    check("a preview shows the draft over the published one", pageSections(both, true)?.[0] === "draft")
    check("and the published one when there is no draft", pageSections({ sections: ["live"], draft_sections: null }, true)?.[0] === "live")
    check("theme settings again", themeSettings({ settings: { a: 1 }, draft_settings: { a: 2 } }, true)?.a === 2)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What the token is, and what it is not")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const a = newPreviewToken()
    const b = newPreviewToken()
    check("it is long and unguessable", a.length >= 40 && /^[A-Za-z0-9_-]+$/.test(a))
    check("and a different one every time", a !== b)

    check("the right token opens the right theme", mayPreview(a, a))
    check("another theme's token opens nothing", !mayPreview(a, b))
    /**
     * The two that matter most. An install with no preview link cannot be
     * previewed, whatever is in the URL — including by somebody who sends an
     * empty value hoping null matches null.
     */
    check("an install with no link cannot be previewed", !mayPreview(null, a) && !mayPreview(undefined, a) && !mayPreview("", a))
    check("and no token in the URL never matches", !mayPreview(a, null) && !mayPreview(a, ""))
    check("a prefix of the token is not the token", !mayPreview(a, a.slice(0, -1)) && !mayPreview(a, a + "x"))

    check("a token-shaped string is read from the query", previewTokenFrom(qs(`preview=${a}`)) === a)
    check("and anything that could not be one is refused before a lookup", (() => {
      const junk = ["preview=", "preview=short", "preview=" + "x".repeat(200), "preview=has spaces", "preview=../../etc", "preview=<script>"]
      return junk.every((q) => previewTokenFrom(qs(q)) === null)
    })())
    check("no preview parameter is no preview", previewTokenFrom(qs("")) === null && previewTokenFrom(qs("other=1")) === null)

    // Constant time: the comparison must not return early on the first
    // wrong character, because the token is a secret that travels in a URL.
    const src = read("lib/website-builder/preview-link.ts")
    check("the comparison does not leak where it stopped matching", /diff \|= installToken\.charCodeAt\(i\) \^ requested\.charCodeAt\(i\)/.test(src))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The routes, and the one that offers the link")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * TWO ADDRESSES, TWO THINGS. `<name>.storelib.com` is the website and
     * lives at /w; `storelib.com/<name>` is the creator's page and the apex
     * route is a thin door onto the storefront. The website's rules — no
     * draft fallback, the preview token, noindex on a preview — belong to /w
     * and the product page; the apex route must carry none of that data path.
     */
    const seller = read("app/(marketing)/[sellername]/page.tsx")
    // Both /w routes hand their work to this one file, so the website's
    // rules live here rather than in either route.
    const w = read("app/(site)/w/[username]/render-site.tsx")
    // The product page is drawn by one renderer for both of its addresses.
    const product = read("components/website-builder/theme/render-product.tsx")
    check("the apex path is the creator page, not the website", /from "\.\.\/u\/\[username\]\/page"/.test(seller) && !/pageSections|draft_sections|ThemePage/.test(seller))
    const api = read("app/api/website-builder/themes/[installId]/preview/route.ts")
    const sql = read("supabase/sql/RUN_THEME_PREVIEW_LINK.sql")

    for (const [name, src] of [["the website", w], ["the product page", product]] as const) {
      check(`${name} no longer falls back to a draft`, !/\?\?\s*pageData\?\.draft_sections/.test(src) && !/draft_sections as SectionInstance\[\] \| null\)/.test(src))
      check(`${name} goes through the one rule`, /pageSections</.test(src))
    }
    // The website moved to its own address: `<name>.storelib.com` is /w, and
    // the apex path is the creator page. The token belongs where the website is.
    check("only the website takes a preview token", /previewTokenFrom\(/.test(w) && !/previewTokenFrom\(/.test(seller) && !/previewTokenFrom\(/.test(product))
    check("a preview is told not to be indexed", /robots: \{ index: false, follow: false \}/.test(w))

    check("the link can be asked about, made and taken away", /export async function GET/.test(api) && /export async function POST/.test(api) && /export async function DELETE/.test(api))
    check("and there is no rotate, because off then on is the same thing", !/export async function PUT/.test(api))
    check("and only by whoever owns the theme", /\.eq\("creator_id", site\.creatorId\)/.test(api) && /websiteInstallCaller\(installId\)/.test(api) /* Changed on purpose (round 42 team): the store's, the owner's or the one a member with Website works in */)
    check("revoking sets it to null, so every link already sent stops working", /update\(\{ preview_token: null \}\)/.test(api))
    check("before the migration is run it says which file to run", /RUN_THEME_PREVIEW_LINK\.sql/.test(api))
    check("the migration is idempotent and additive", /add column if not exists preview_token/.test(sql) && /create unique index if not exists/.test(sql))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The panel asks for the link rather than assuming it")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * The old Preview button linked to the live address with
   * `builder_preview=1` on it. Nothing in the codebase ever read that
   * parameter. It showed the draft because the public pages showed the
   * draft to everybody, which is the leak this change closed, so Preview
   * had to become real at the same moment.
   */
  {
    const panel = read("components/website-builder/publish-panel.tsx")
    const editor = read("app/website-builder/editor/[installId]/page.tsx")

    check("the dead parameter is gone from the button", !/href=\{`\$\{websiteUrl\}[^`]*builder_preview/.test(panel) && !/builder_preview=1&show_preview_bar=1/.test(panel) && !/builder_preview/.test(editor))
    check("Preview goes through the token endpoint", /themes\/\$\{installId\}\/preview`, \{\s*\n\s*method: "POST"/.test(panel))
    check("the panel knows which theme it is publishing", /installId=\{installId\}/.test(editor) && /installId: string/.test(panel))

    /**
     * Two separate things, both easy to get wrong and both invisible until
     * somebody hits them. Opening the panel must not create a secret, and
     * the tab must be opened by the press rather than by what comes back.
     */
    check("opening the panel reads, and only the press creates", /const r = await fetch\(`\/api\/website-builder\/themes\/\$\{installId\}\/preview`\)/.test(panel) && /if \(!active \|\| asked\.current \|\| !installId\) return/.test(panel))
    check("a closed sheet asks nothing", /active=\{open\}/.test(panel))
    check("the tab is opened by the press, not after the await", (() => {
      /* Opened at the press with its holding page (lib/website-builder/opening-tab.ts), never a bare about:blank. */
      const i = panel.indexOf('const tab = openOpeningTab(')
      const j = panel.indexOf("await fetch(`/api/website-builder/themes/${installId}/preview`, {")
      return i > 0 && j > i
    })(), "a window opened on the far side of an await is blocked as a popup")

    check("the link is only explained once it exists", /\{previewUrl && \(/.test(panel))
    check("and it can be copied and turned off from there", /copy\(previewUrl, "preview"\)/.test(panel) && /void revokePreview\(\)/.test(panel) && /method: "DELETE"/.test(panel))
    check("a refusal is said, not swallowed", /previewNote && <p/.test(panel))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A URL, once given out, is not taken away")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * The other half of the question. Redirect management matters when
   * renaming something changes its address, so the first thing to establish
   * is whether anything here does that. Nothing does: a product's slug is
   * written when it is created and never rewritten, and a page's key is
   * derived from its title once, at creation.
   *
   * So there is no redirect table, because there is nothing yet to redirect.
   * This is the guard that says so: if somebody adds slug editing, it fails,
   * and redirects become part of that change rather than a thing discovered
   * later from a broken link.
   */
  {
    const form = read("components/app/product-edit-form.tsx")
    const writesSlug = /slug:\s/.test(form)
    check("editing a product does not rewrite its slug", !writesSlug, "if this fails, that change needs to leave a redirect behind")

    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("and a page's key is set once, when it is created", /const pageKey = toPageSlug\(newPageTitle\)/.test(editor) && !/page_key:\s*renamed/.test(editor))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
