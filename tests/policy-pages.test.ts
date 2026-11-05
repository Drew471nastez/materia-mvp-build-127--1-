/**
 * ===========================================================================
 *  THE POLICY PAGES EVERY SITE SHIPS WITH
 * ===========================================================================
 * A refund policy, a privacy policy and terms of service, created as real
 * pages, linked from the footer, editable like anything else.
 *
 * The interesting behaviour is all in what happens the SECOND time: a
 * backfill that runs on every load must add what is missing and then never
 * argue with the creator again. So `ensurePolicyPages` is driven against a
 * fake table that records its writes, twice, and the second run has to be
 * silent.
 *
 * Run with:  npm run test:push
 */

import {
  POLICY_PAGES,
  POLICY_PAGE_KEYS,
  policyFooterBlocks,
  policyPageSections,
  withPolicyLinks,
} from "@/lib/website-builder/policy-pages"
import { ensurePolicyPages, type PageRow, type PagesTable } from "@/lib/website-builder/ensure-policy-pages"
import { pageTitleFromKey, BUILT_IN_PAGE_KEYS } from "@/lib/website-builder/site-pages"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { SectionInstance } from "@/lib/website-builder/types"
import { withLiveLinks } from "@/lib/website-builder/live-links"
import { resolveEditorHref } from "@/lib/website-builder/editor-navigation"
import { pageGroupOf } from "@/lib/website-builder/page-groups"
import { applyUniversalChrome, chromeOf, withUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)

const footer = (blocks: SectionInstance["blocks"] = []): SectionInstance => ({
  id: "footer",
  type: "footer",
  name: "Footer",
  settings: { logo_text: "Acme" },
  blocks,
  hidden: false,
})
const header: SectionInstance = { id: "header", type: "header", name: "Header", settings: {}, blocks: [], hidden: false }

/** A table that records what it was asked to do. */
function fakeTable(rows: PageRow[]) {
  const upserts: { install_id: string; page_key: string }[][] = []
  const updates: { id: string; values: Record<string, unknown> }[] = []
  const db: PagesTable = {
    from() {
      return {
        select() {
          return { eq: async () => ({ data: rows, error: null }) }
        },
        async upsert(next) {
          upserts.push(next.map((r) => ({ install_id: r.install_id, page_key: r.page_key })))
          for (const r of next) {
            if (rows.some((existing) => existing.page_key === r.page_key)) continue
            rows.push({ id: `row-${r.page_key}`, page_key: r.page_key, sections: r.sections, draft_sections: null })
          }
          return { error: null }
        },
        update(values) {
          return {
            eq: async (_c: string, id: string) => {
              updates.push({ id, values })
              const row = rows.find((r) => r.id === id)
              if (row) {
                if (values.sections) row.sections = values.sections
                if ("draft_sections" in values) row.draft_sections = values.draft_sections
              }
              return { error: null }
            },
          }
        },
      }
    },
  }
  return { db, rows, upserts, updates }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Three pages, written to be edited")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("refund, privacy and terms", POLICY_PAGE_KEYS.join(",") === "refund-policy,privacy-policy,terms-of-service")
    check(
      "none of them collides with a page the theme already ships",
      POLICY_PAGE_KEYS.every((k) => !BUILT_IN_PAGE_KEYS.has(k)),
    )
    check(
      "each key is a legal address",
      POLICY_PAGE_KEYS.every((k) => /^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(k)),
    )

    /**
     * EVERY PAGE SAYS WHAT IT DOES NOT KNOW. An unedited policy has to read
     * as unfinished, because a confident wrong refund window is worse than
     * no page: somebody will rely on it.
     */
    for (const page of POLICY_PAGES) {
      const body = page.body("Acme")
      check(`${page.title} leaves the specifics as placeholders`, /\[[^\]]+\]/.test(body))
      check(`${page.title} names the shop it belongs to`, body.includes("Acme"))
      check(`${page.title} says when it was last updated`, /Last updated/.test(body))
    }
    check(
      "and none of them claims to be legal advice",
      POLICY_PAGES.every((p) => !/legal advice|we guarantee|legally binding/i.test(p.body("Acme"))),
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A page the editor can already open")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const built = policyPageSections(POLICY_PAGES[0], { brand: "Acme", header, footer: footer() })
    check("it is the site's header, its content, and the site's footer", built.map((s) => s.type).join(",") === "header,rich_text,footer")
    check("the header and footer are the site's own, not a factory copy", built[0].id === "header" && built[2].id === "footer")
    check("the body section is a real section type", !!SECTION_SCHEMAS[built[1].type])
    const fields = new Set((SECTION_SCHEMAS[built[1].type]?.fields ?? []).map((f: { id: string }) => f.id))
    check(
      "and every setting it uses is one that section declares",
      Object.keys(built[1].settings ?? {}).every((k) => fields.has(k)),
      Object.keys(built[1].settings ?? {}).filter((k) => !fields.has(k)).join(", "),
    )

    const bare = policyPageSections(POLICY_PAGES[0], { brand: "Acme" })
    check("a site with no header or footer yet still gets a page", bare.length === 1 && bare[0].type === "rich_text")

    check("the switcher calls it what the footer calls it", pageTitleFromKey("terms-of-service") === "Terms Of Service")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The footer links to them, once")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const blocks = policyFooterBlocks()
    check("a column and three links", blocks.length === 4 && blocks[0].type === "footer_column")
    check(
      "each pointing at its page",
      POLICY_PAGE_KEYS.every((k) => blocks.some((b) => (b.settings as { url?: string }).url === `/${k}`)),
    )

    const once = withPolicyLinks(footer())
    check("a footer with no links gets them", (once.blocks ?? []).length === 4)
    const twice = withPolicyLinks(once)
    check("and running it again changes nothing", (twice.blocks ?? []).length === 4)

    /**
     * A creator who renamed "Refund Policy" to "Returns" still has the link.
     * Matching on the address rather than the label is what stops a second
     * copy appearing beside the one they edited.
     */
    const renamed = footer([
      { id: "a", type: "footer_column", settings: { heading: "Help" } },
      { id: "b", type: "footer_link", settings: { label: "Returns", url: "/refund-policy" } },
      { id: "c", type: "footer_link", settings: { label: "Privacy", url: "/privacy-policy" } },
      { id: "d", type: "footer_link", settings: { label: "Terms", url: "/terms-of-service" } },
    ] as SectionInstance["blocks"])
    check("a renamed link is not duplicated", withPolicyLinks(renamed).blocks?.length === 4)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The backfill adds what is missing and then leaves it alone")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const home: PageRow = {
      id: "row-home",
      page_key: "home",
      sections: [header, footer()],
      draft_sections: null,
    }
    const { db, rows, upserts, updates } = fakeTable([home])

    const first = await ensurePolicyPages(db, "install-1", "Acme")
    check("it creates all three", first.created.length === 3, first.created.join(", "))
    check("and says so without an error", first.error === null)
    check("the rows are now in the table", POLICY_PAGE_KEYS.every((k) => rows.some((r) => r.page_key === k)))
    check("the home page's footer was linked", updates.length === 1 && !!updates[0].values.sections)

    const policyRow = rows.find((r) => r.page_key === "privacy-policy")!
    const built = policyRow.sections as SectionInstance[]
    check(
      "and the policy page's OWN footer links to its siblings",
      (built.find((s) => s.type === "footer")?.blocks ?? []).length === 4,
    )

    /** The second run is the one that matters. */
    const before = updates.length
    const second = await ensurePolicyPages(db, "install-1", "Acme")
    check("a second run creates nothing", second.created.length === 0)
    check("and writes nothing", updates.length === before && upserts.length === 1)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("And it refuses to make things worse")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /** A site mid-creation has no pages yet; writing into that races it. */
    const empty = fakeTable([])
    const none = await ensurePolicyPages(empty.db, "install-2", "Acme")
    check("a site with no pages at all is left alone", none.created.length === 0 && empty.upserts.length === 0)

    /** A page half-way through an edit keeps its draft. */
    const withDraft: PageRow = {
      id: "row-home",
      page_key: "home",
      sections: [footer()],
      draft_sections: [footer(), { ...header, id: "unsaved" }],
    }
    const drafted = fakeTable([withDraft])
    await ensurePolicyPages(drafted.db, "install-3", "Acme")
    const update = drafted.updates.find((u) => u.id === "row-home")
    check("an unsaved draft is not thrown away by the backfill", !!update && Array.isArray(update.values.draft_sections))
    check(
      "and the unsaved section is still in it",
      ((update?.values.draft_sections as SectionInstance[]) ?? []).some((s) => s.id === "unsaved"),
    )

    /** A creator who already wrote their own policy keeps it. */
    const theirs = fakeTable([
      { id: "row-home", page_key: "home", sections: [footer()], draft_sections: null },
      { id: "row-refund", page_key: "refund-policy", sections: [{ ...header, id: "mine" }], draft_sections: null },
    ])
    const kept = await ensurePolicyPages(theirs.db, "install-4", "Acme")
    check("a policy page they already made is not replaced", kept.created.length === 2 && !kept.created.includes("refund-policy"))
    check(
      "and its content is untouched",
      (theirs.rows.find((r) => r.page_key === "refund-policy")!.sections as SectionInstance[])[0].id === "mine",
    )

    /** A read that fails is reported, not thrown. */
    const broken: PagesTable = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: null, error: { message: "no" } }) }),
        upsert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    }
    const failedRead = await ensurePolicyPages(broken, "install-5", "Acme")
    check("a database that will not answer is reported rather than thrown", failedRead.error === "no" && failedRead.created.length === 0)
  }

  // ════════════════════════════════════════════════════════════════════════
  section("They are reachable, and they are edited where the editor is")
  // ════════════════════════════════════════════════════════════════════════
  {
    const settings =
      readFileSync(join(root, "components/website-builder/website-settings/types.ts"), "utf8") +
      readFileSync(join(root, "components/website-builder/website-settings/policies.tsx"), "utf8") +
      readFileSync(join(root, "components/website-builder/project-settings.tsx"), "utf8")
    const editor = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
    const switcher = readFileSync(join(root, "components/website-builder/page-switcher.tsx"), "utf8")

    check("project settings has a Policies section", /id: "policies"/.test(settings) && /POLICY_PAGES\.map/.test(settings))
    check("it lists them from the one definition, not a second copy", /from "@\/lib\/website-builder\/policy-pages"/.test(settings))
    check("and editing opens the page in the builder", /ctx\.onEditPage\(page\.key\)/.test(settings) && /onEditPage\?\.\(key\)/.test(settings) && /onEditPage=\{\(pageKey\) =>/.test(editor))

    /**
     * The editor resolves an in-site link to a page it knows about, which is
     * what makes a footer link to /refund-policy arrive somewhere.
     */
    check(
      "a footer link to a policy resolves to that page in the editor",
      /* The routing is a function now, so this asks it about a real policy
         address instead of matching the line that used to do the lookup. */
      (() => {
        const d = resolveEditorHref("/privacy", {
          currentPage: "home", inspectorEnabled: false, fromNav: true,
          shopPath: "/products", customPageKeys: ["privacy", "terms", "refunds"],
        })
        return d.kind === "page" && d.key === "privacy"
      })(),
    )

    /**
     * The policies used to fold away with the creator's pages behind one row,
     * and that group scrolled inside the panel that already scrolled:
     * "sub-levels with sub scroll bars, it's weird and bad". They are a group
     * of their own now, a heading in one list with one scroll
     * (lib/website-builder/page-groups.ts, tests/library-and-pages.test.ts).
     */
    check("the policies are a group of their own in the page switcher", pageGroupOf("refund-policy") === "policies" && POLICY_PAGES.every((p) => pageGroupOf(p.key) === "policies"))
    check(
      "and nothing in the switcher folds or scrolls inside itself",
      !/yoursOpen|PAGES_BEFORE_SCROLL/.test(switcher) && (switcher.match(/overflow-y-auto/g) ?? []).length === 1,
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  section("A policy is written in, not typed as markup")
  // ════════════════════════════════════════════════════════════════════════
  {
    const editor = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
    const rich = readFileSync(join(root, "components/website-builder/rich-text-field.tsx"), "utf8")
    const auto = readFileSync(join(root, "components/website-builder/auto-textarea.tsx"), "utf8")
    const css = readFileSync(join(root, "app/globals.css"), "utf8")

    check("a richtext field gets the editor", /if \(kind === "richtext"\)[\s\S]{0,200}<RichTextField/.test(editor))
    check("a plain one gets a box that grows", /if \(kind === "textarea"\)[\s\S]{0,200}<AutoTextarea/.test(editor))
    check("and neither is the old fixed-height textarea", !/min-h-\[80px\][\s\S]{0,80}resize-y/.test(editor))

    check("the toolbar is the six things these fields hold", ["Bold", "Italic", "Link", "Bulleted list", "Numbered list"].every((l) => rich.includes(l)))
    check("the toolbar is text controls only, with no door to the assistant in it", !/askAi/.test(rich))
    check(
      "a toolbar press keeps the selection, or there is nothing to format",
      /onMouseDown=\{\(e\) => \{\s*e\.preventDefault\(\)/.test(rich),
    )
    check("everything that leaves it is sanitised", /sanitizeRichText\(withoutValueChips\(el\.innerHTML\)\)/.test(rich))
    check("a paste arrives as text, not as someone else's markup", /insertText/.test(rich) && /e\.preventDefault\(\)/.test(rich))
    check("and the value is only written in when it came from elsewhere", /const shown = withValueChips\(incoming\)\s*\n\s*if \(el\.innerHTML !== shown\)/.test(rich))
    check("what it can produce is styled, so formatting is visible", /\.wb-richtext h2/.test(css) && /\.wb-richtext ul/.test(css))

    check("the box starts at one line", /rows=\{1\}/.test(auto))
    check("and is measured rather than counted", /el\.style\.height = "auto"/.test(auto) && /scrollHeight/.test(auto))
    check("with a ceiling, so it cannot push the panel away", /Math\.min\(wanted, ceiling\)/.test(auto))
    check("and it re-fits when the sidebar is resized", /ResizeObserver/.test(auto))
  }

  // ════════════════════════════════════════════════════════════════════════
  section("The controls stop getting in the way")
  // ════════════════════════════════════════════════════════════════════════
  {
    const rich = readFileSync(join(root, "components/website-builder/rich-text-field.tsx"), "utf8")
    const editor = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
    const picker = readFileSync(join(root, "components/website-builder/link-picker.tsx"), "utf8")
    const panels = readFileSync(join(root, "components/website-builder/editor/design-panels.tsx"), "utf8")
    const renderer = readFileSync(join(root, "components/website-builder/sections/SectionRenderer.tsx"), "utf8")

    /** A text control is not a door to the assistant. */
    check("the assistant button is gone from the text toolbar", !/StorelibMark|askAi/.test(rich))
    check("and nothing still tries to provide one", !/RichTextAssistant/.test(editor))
    check("the toolbar is the six text controls", ["Bold", "Italic", "Link", "Bulleted list", "Numbered list", "Text style"].every((l) => rich.includes(l)))

    /** It stops growing before it owns the panel. */
    check("the editor has a ceiling and scrolls past it", /maxHeight = 260/.test(rich) && /style=\{\{ minHeight, maxHeight \}\}/.test(rich))
    check("on the panel's own slim bar, not a second kind", /wb-slim-scroll (?:min-w-0 )?overflow-y-auto/.test(rich))

    /** A link is chosen by its name. */
    check("the picker shows the name, with the address as the row's title", /title=\{t\.href\}/.test(picker))
    check("and no longer prints the slug beside every product", !/text-\[11px\] text-muted-foreground">\{t\.href\}/.test(picker))

    /** Editing a scheme lives with the schemes. */
    check("Edit is off the closed trigger", !/onEdit\(activeKey\)/.test(panels))
    check("and on every row of the open list", /onEdit\(key\)/.test(panels))
    check("a row is a pair, not a button inside a button", /flex h-9 min-w-0 flex-1 cursor-pointer/.test(panels))

    /** A footer link is a link. */
    check("sections say what type they are", /data-section-type=\{props\.section\.type\}/.test(renderer))
    check(
      "and a link in the header or the footer navigates even with the inspector on",
      /closest\?\.\("\[data-chrome\]"\)/.test(editor) && /handleEditorNavigate\(href, true\)/.test(editor),
    )
    check(
      "while a link inside the page's own content still only selects",
      resolveEditorHref("/privacy-policy", {
        currentPage: "home", inspectorEnabled: true, fromNav: false,
        shopPath: "/products", customPageKeys: ["privacy-policy"],
      }).kind === "ignore",
    )
    check(
      "and opening a page leaves you at the top of it",
      /getElementById\("wb-preview-root"\)\?\.scrollTo\(\{ top: 0/.test(editor),
    )
    check("an external link in a footer still does not leave the editor", /href\.startsWith\("\/"\)/.test(editor))

    /** And every wait says so. */
    check("the progress bar covers every canvas wait", /<WbLoadProgressBar active=\{sectionsLoading \|\| canvasBusy\} \/>/.test(editor))
    check("and it is visible enough to read as progress", /h-\[2px\]/.test(editor) && /#8B56FA/.test(editor))
    /**
     * A width transition is laid out on the main thread every frame, and the
     * main thread during a page load is the one doing the loading: the bar
     * stalled exactly when somebody was watching it.
     */
    check(
      "the bar is composited, so it keeps moving while the page loads",
      /transform: `scaleX\(/.test(editor) && !/transition: "width/.test(editor),
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  section("One header and one footer, whatever the rows hold")
  // ════════════════════════════════════════════════════════════════════════
  {
    const editor = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
    const body = (id: string): SectionInstance => ({ id, type: "rich_text", name: id, settings: {}, blocks: [], hidden: false })
    const oldFooter: SectionInstance = { ...footer(), id: "stale-footer", settings: { logo_text: "Old" } }

    const home = [header, body("h1"), footer()]
    const stale = [{ ...header, id: "stale-header" }, body("p1"), oldFooter]

    const dressed = withUniversalChrome(stale, chromeOf(home))
    check("a stale page wears home's header", dressed[0].id === "header")
    check("and home's footer", dressed[dressed.length - 1].id === "footer")
    check("while keeping its own body", dressed.some((x) => x.id === "p1") && dressed.length === 3)

    /** A header dragged into the middle is a row nobody meant to write. */
    const scrambled = [body("a"), header, body("b"), footer()]
    const fixed = withUniversalChrome(scrambled, chromeOf(home))
    check("chrome is put back at the ends whatever order the row had", fixed[0].type === "header" && fixed[3].type === "footer")

    /** A site with no home chrome must not strip the chrome a page has. */
    const orphan = withUniversalChrome(stale, chromeOf([body("only")]))
    check("a page keeps its own when the site has none to give", orphan[0].id === "stale-header" && orphan[2].id === "stale-footer")

    const pages = applyUniversalChrome({ home, about: stale, "privacy-policy": [body("x")] })
    check("every page of a site ends up with the same footer", Object.values(pages).every((p) => p[p.length - 1].id === "footer"))
    check("including a page that had none at all", pages["privacy-policy"].length === 3)

    /** And both sides use it, which is the whole point of extracting it. */
    const published = readFileSync(join(root, "lib/website-builder/published-site.ts"), "utf8")
    const preview = readFileSync(join(root, "app/(site)/w/[username]/render-site.tsx"), "utf8")
    check("the published site applies it", /applyUniversalChrome\(pages\b/.test(published))
    check("the preview applies it", /withUniversalChrome\(/.test(preview))
    check(
      "and the editor uses the same function rather than a second copy",
      /const mergeWithHomeHeaderFooter = withUniversalChrome/.test(editor),
    )
    /**
     * AND HOME IS NOT EXEMPT FROM IT.
     *
     * This was `page !== "home" ? merge : loaded` in both loaders, so every
     * page had its header put first and its footer put last except the one
     * page the chrome is copied from. A header dragged into the middle of
     * home rendered in the middle on home and at the top everywhere else —
     * the header that "is not universal", seen from the only page a creator
     * spends any time on.
     */
    check(
      "and home is dressed by the same rule as every other page",
      !/page !== "home" \? mergeWithHomeHeaderFooter/.test(editor) &&
        !/currentPage !== "home" \? mergeWithHomeHeaderFooter/.test(editor) &&
        /mergeWithHomeHeaderFooter\(loadedRaw, currentPage !== "home" \? homeHF : chromeOf\(loadedRaw\)\)/.test(editor),
    )

    /**
     * =====================================================================
     *  EVERY LINK THE DEFAULT THEME SHIPS GOES SOMEWHERE
     * =====================================================================
     * The stock footer shipped nine links and only three of them were
     * addresses a Storelib site has: /new, /sale, /blog, /faq, /shipping
     * and /returns are pages nothing creates. The stock header shipped
     * /shop, and the shop lives at /products. So seven links on every site
     * ever made led nowhere — a 404 for a visitor, and in the builder the
     * "this page does not exist, create it?" prompt, which is what "I click
     * the footer and it does not get me there" was.
     *
     * A published site answers exactly these addresses:
     *   /                    home
     *   /products            the shop, and /products/<slug> a product
     *   /<page key>          any page the site stores
     *
     * and the page keys every site has are home, about, contact and the
     * three policy pages. A default cannot point anywhere else, because a
     * default is shipped to sites that have nothing else.
     */
    /**
     * =====================================================================
     *  THE SITES THAT ALREADY STORED THE DEAD LINKS
     * =====================================================================
     * Fixing the default theme fixes a site made from today on. Every site
     * that exists has the old footer written into every one of its page
     * rows, so it is repaired on load, beside the policy links, which are
     * there for the same reason.
     *
     * Driven here on the exact footer the default used to ship.
     */
    {
      const link = (id: string, label: string, url: string) => ({ id, type: "footer_link", settings: { label, url } })
      const column = (id: string, heading: string) => ({ id, type: "footer_column", settings: { heading } })
      const shipped: SectionInstance = {
        id: "footer", type: "footer", name: "Footer", settings: {},
        blocks: [
          column("c1", "Shop"),
          link("l1", "All Products", "/products"),
          link("l2", "New Arrivals", "/new"),
          link("l3", "Sale", "/sale"),
          column("c2", "Company"),
          link("l4", "About", "/about"),
          link("l5", "Blog", "/blog"),
          link("l6", "Contact", "/contact"),
          column("c3", "Support"),
          link("l7", "FAQ", "/faq"),
          link("l8", "Shipping", "/shipping"),
          link("l9", "Returns", "/returns"),
        ],
      } as SectionInstance
      const keys = new Set(["home", "about", "contact", ...POLICY_PAGE_KEYS])
      const fixed = withLiveLinks(shipped, keys)
      const urls = (fixed.blocks ?? []).map((b) => String((b.settings as Record<string, unknown>).url ?? ""))
      check("the six dead stock links are gone", !urls.some((u) => ["/new", "/sale", "/blog", "/faq", "/shipping", "/returns"].includes(u)))
      check("and the three real ones stay", ["/products", "/about", "/contact"].every((u) => urls.includes(u)))
      check(
        "the Support heading goes with the links that were under it",
        !(fixed.blocks ?? []).some((b) => String((b.settings as Record<string, unknown>).heading ?? "") === "Support"),
      )
      check("and Shop keeps its heading, because a link is left under it",
        (fixed.blocks ?? []).some((b) => String((b.settings as Record<string, unknown>).heading ?? "") === "Shop"))
      check("running it again changes nothing", JSON.stringify(withLiveLinks(fixed, keys)) === JSON.stringify(fixed))

      /* A creator's own page, and a creator's own words, are not ours to remove. */
      const withBlog = withLiveLinks(shipped, new Set([...keys, "blog"]))
      check("a site that has a Blog page keeps its Blog link",
        (withBlog.blocks ?? []).some((b) => String((b.settings as Record<string, unknown>).url ?? "") === "/blog"))
      const renamed = { ...shipped, blocks: (shipped.blocks ?? []).map((b) =>
        (b.settings as Record<string, unknown>).url === "/returns"
          ? { ...b, settings: { ...(b.settings as Record<string, unknown>), label: "Send it back" } } : b) } as SectionInstance
      check("a link the creator renamed is left for the creator",
        (withLiveLinks(renamed, keys).blocks ?? []).some((b) => String((b.settings as Record<string, unknown>).url ?? "") === "/returns"))

      /* The header's Shop is a rename, not a deletion. */
      const header = { id: "h", type: "header", name: "Header", settings: {}, blocks: [
        { id: "n1", type: "nav_link", settings: { label: "Shop", url: "/shop" } },
      ] } as SectionInstance
      const fixedHeader = withLiveLinks(header, keys)
      check("the header's Shop is repointed at the shop, keeping its label",
        String((fixedHeader.blocks![0].settings as Record<string, unknown>).url) === "/products" &&
        String((fixedHeader.blocks![0].settings as Record<string, unknown>).label) === "Shop")

      /* And it has to be able to reach a site, which is where it used to stop. */
      const ensure = readFileSync(join(root, "lib/website-builder/ensure-policy-pages.ts"), "utf8")
      check(
        "the repair is not skipped on a site that already has its policy pages",
        !/const missing = POLICY_PAGES[^\n]*\n\s*if \(missing\.length === 0\) return/.test(ensure) &&
          /if \(rows\.length\) \{/.test(ensure),
      )
      check("and it repairs the header as well as the footer",
        /if \(s\.type === "header"\) return withLiveLinks\(s, pageKeys\)/.test(ensure))
    }

    /**
     * =====================================================================
     *  A SHORT PAGE DOES NOT END IN A WHITE BAND
     * =====================================================================
     * The builder's canvas card is a fixed-height white box and the page is
     * drawn inside it, so a page shorter than the card left the card showing
     * through: measured at 338px of white under a 362px page in a 700px card
     * by scripts/check-short-page.mjs, which drives the real ThemePage in a
     * browser. On an empty page that was most of the canvas.
     *
     * The geometry is measured there. What is held here is the rule that
     * produced it, because a class quietly dropped from either half puts the
     * band straight back.
     */
    {
      const themePage = readFileSync(join(root, "components/website-builder/theme/ThemePage.tsx"), "utf8")
      check(
        "the page fills its container, as a flex item in the builder and the viewport when published",
        /function pageFill\(inEditor: boolean\): CSSProperties/.test(themePage) &&
          /flex: "1 1 auto"/.test(themePage) &&
          /minHeight: "100dvh"/.test(themePage),
      )
      check(
        "and the page root actually uses it",
        /\.\.\.pageFill\(storefront\?\.inEditor === true\)/.test(themePage),
      )
      /* dvh, not vh: a phone's toolbars move, and vh leaves a band the colour
         of the browser under the footer while they do. */
      check("the published height is viewport-relative in the unit that follows a phone's toolbars",
        !/minHeight: "100vh"/.test(themePage))
      check(
        "the empty placeholder is the thing that grows, so the footer is still last",
        /flex flex-1 min-h-\[50vh\]/.test(themePage) &&
          (editor.match(/className="flex-1 py-24 flex items-center justify-center text-center"/g) ?? []).length === 2,
      )
    }

    const SITE_ROUTES = new Set(["/", "/products", "/about", "/contact", ...POLICY_PAGES.map((p) => `/${p.key}`)])
    const dead: string[] = []
    for (const file of readdirSync(join(root, "themes/default/sections"))) {
      if (!file.endsWith(".json")) continue
      const raw = readFileSync(join(root, "themes/default/sections", file), "utf8")
      for (const m of raw.matchAll(/"url":\s*"(\/[^"]*)"/g)) {
        const url = m[1].replace(/\/$/, "") || "/"
        if (!SITE_ROUTES.has(url)) dead.push(`${file} → ${m[1]}`)
      }
    }
    check(
      "every internal link in the default theme is an address the site answers",
      dead.length === 0,
      dead.length ? dead.join(", ") : undefined,
    )

    const panels = readFileSync(join(root, "components/website-builder/editor/design-panels.tsx"), "utf8")
    check("Advanced colors is shut until it is asked for", /const \[customizeOpen, setCustomizeOpen\] = useState\(false\)/.test(panels))

    check(
      "and the header's own nav gets a navigate that works",
      /onEditorNavigate: role === "header" \|\| role === "footer" \? navigateFromChrome : onEditorNavigate/.test(editor),
    )

    /** The header is the top of the page, including on an empty one. */
    const themePage = readFileSync(join(root, "components/website-builder/theme/ThemePage.tsx"), "utf8")
    const headerAt = themePage.indexOf('headers.map((section, i) => render(section, "header"')
    const childrenAt = themePage.indexOf("{children}", headerAt - 2000)
    check(
      "the empty-page placeholder renders below the header, not above it",
      headerAt > 0 && childrenAt > headerAt,
      `header at ${headerAt}, children at ${childrenAt}`,
    )

    /** A link to a page that is not there says so. */
    check(
      "an unknown address is stated rather than swallowed",
      (() => {
        const d = resolveEditorHref("/wholesale", {
          currentPage: "home", inspectorEnabled: false, fromNav: true,
          shopPath: "/products", customPageKeys: [],
        })
        return d.kind === "missing" && d.path === "/wholesale"
      })() && /setMissingPath\(decision\.path\)/.test(editor),
    )
    check("and it offers to make the page", /Create this page/.test(editor) && /onCreateMissingPage/.test(editor))
    check("arriving somewhere clears it", /setMissingPath\(null\)/.test(editor))
    check(
      "and /shop no longer quietly becomes the home page",
      !/We don't have a dedicated shop page in the editor/.test(editor),
    )

    /**
     * THE BUMP ON NAVIGATION, as an ordering invariant.
     *
     * `setCurrentPage` used to run BEFORE the fetch, so for one render plus
     * however long the network took, the canvas drew the OLD page's sections
     * under the NEW page's template: `page.template` decides what a
     * theme-language section renders, the header's active link moves, and a
     * product page stops being one. Then the sections landed and everything
     * changed again. Two changes where the eye expects none, and the middle
     * one is a page that never existed.
     *
     * Asserted on ORDER, because that is what the fix is. This is weaker
     * than a measurement and it is what is available: the probe in
     * scripts/check-page-switch.mjs cannot complete a real switch without a
     * server, and says so rather than passing vacuously.
     */
    const pageChange = editor.slice(editor.indexOf("const handlePageChange"), editor.indexOf("const handleSelectProductPage"))
    check(
      "a page switch fetches before it says which page is shown",
      pageChange.indexOf("await Promise.all([") < pageChange.indexOf("setCurrentPage(page)"),
      `fetch at ${pageChange.indexOf("await Promise.all([")}, setCurrentPage at ${pageChange.indexOf("setCurrentPage(page)")}`,
    )
    check(
      "and the page and its sections are set together, in one commit",
      /setCurrentPage\(page\)[\s\S]{0,200}setSections\(merged\)/.test(pageChange),
    )
    const productChange = editor.slice(editor.indexOf("const handleSelectProductPage"), editor.indexOf("const handleSelectProductPage") + 6000)
    check(
      "a product page does the same",
      /setSelectedProductPage\(productTitle\)\s*\n\s*(?:setSelectedProductId\(productId\)\s*\n\s*)?setCurrentPage\("product"\)\s*\n\s*setSections\(merged\)/.test(productChange),
    )
    check(
      "and the scroll to the top runs after the commit rather than racing it",
      /useLayoutEffect\(\(\) => \{[\s\S]{0,220}wb-preview-root[\s\S]{0,120}\}, \[currentPage, selectedProductPage\]\)/.test(editor),
    )

    /**
     * AND THE CANVAS IS NOT REBUILT. `key={currentPage}` threw away the whole
     * canvas on every page change and replayed a 360ms rise-in of the page
     * from 6px down, which no amount of fixing the ORDER of state updates
     * could help: the remount happens whatever order they arrive in.
     * Measured with scripts/check-page-switch.mjs, which stamps the element
     * and counts new ones: 1 remount with the key, 0 without.
     */
    check(
      "the canvas is not keyed by the page, so a switch does not rebuild it",
      !/key=\{currentPage\} className="wb-canvas-in/.test(editor) && /className="wb-canvas-in/.test(editor),
    )
    check(
      "and the logo is a real link home, intercepted inside the editor",
      (() => {
        const header = readFileSync(join(root, "components/website-builder/sections/renderers/HeaderSection.tsx"), "utf8")
        /* `, true` says it is navigation, which is what lets the editor
           follow it while the inspector is on. */
        return /href="\/"[\s\S]{0,360}onEditorNavigate\("\/", true\)/.test(header)
      })(),
    )

    /** A refresh looks like a page switch. */
    /* Round 20 (tests/canvas20.test.ts): a page switch keeps the list it has instead of grey bars; the first load still shows them. */
    check("the sidebar shows its skeleton on a first load too", /\{loading \? \(/.test(editor))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
