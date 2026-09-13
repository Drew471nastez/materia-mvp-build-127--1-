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
import { readFileSync } from "node:fs"
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
    const settings = readFileSync(join(root, "components/website-builder/project-settings.tsx"), "utf8")
    const editor = readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8")
    const switcher = readFileSync(join(root, "components/website-builder/page-switcher.tsx"), "utf8")

    check("project settings has a Policies section", /id: "policies"/.test(settings) && /POLICY_PAGES\.map/.test(settings))
    check("it lists them from the one definition, not a second copy", /from "@\/lib\/website-builder\/policy-pages"/.test(settings))
    check("and editing opens the page in the builder", /onEditPage\?\.\(page\.key\)/.test(settings) && /onEditPage=\{\(pageKey\) =>/.test(editor))

    /**
     * The editor resolves an in-site link to a page it knows about, which is
     * what makes a footer link to /refund-policy arrive somewhere.
     */
    check(
      "a footer link to a policy resolves to that page in the editor",
      /const customMatch = customPages\.find\(p => p\.key === pageKeyGuess\)/.test(editor),
    )

    check("the pages group is shut until it is asked for", /const \[yoursOpen, setYoursOpen\] = useState\(false\)/.test(switcher))
    check(
      "and it scrolls inside itself past three",
      /PAGES_BEFORE_SCROLL = 3/.test(switcher) && /yours\.length > PAGES_BEFORE_SCROLL/.test(switcher),
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  section("A policy is written in, not typed as markup")
  // ════════════════════════════════════════════════════════════════════════
  {
    const editor = readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8")
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
    check("everything that leaves it is sanitised", /sanitizeRichText\(el\.innerHTML\)/.test(rich))
    check("a paste arrives as text, not as someone else's markup", /insertText/.test(rich) && /e\.preventDefault\(\)/.test(rich))
    check("and the value is only written in when it came from elsewhere", /if \(el\.innerHTML !== incoming\)/.test(rich))
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
    const editor = readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8")
    const picker = readFileSync(join(root, "components/website-builder/link-picker.tsx"), "utf8")
    const panels = readFileSync(join(root, "components/website-builder/editor/design-panels.tsx"), "utf8")
    const renderer = readFileSync(join(root, "components/website-builder/sections/SectionRenderer.tsx"), "utf8")

    /** A text control is not a door to the assistant. */
    check("the assistant button is gone from the text toolbar", !/StorelibMark|askAi/.test(rich))
    check("and nothing still tries to provide one", !/RichTextAssistant/.test(editor))
    check("the toolbar is the six text controls", ["Bold", "Italic", "Link", "Bulleted list", "Numbered list", "Text style"].every((l) => rich.includes(l)))

    /** It stops growing before it owns the panel. */
    check("the editor has a ceiling and scrolls past it", /maxHeight = 260/.test(rich) && /style=\{\{ minHeight, maxHeight \}\}/.test(rich))
    check("on the panel's own slim bar, not a second kind", /wb-slim-scroll overflow-y-auto/.test(rich))

    /** A link is chosen by its name. */
    check("the picker shows the name, with the address as the row's title", /title=\{t\.href\}/.test(picker))
    check("and no longer prints the slug beside every product", !/text-\[11px\] text-muted-foreground">\{t\.href\}/.test(picker))

    /** Editing a scheme lives with the schemes. */
    check("Edit is off the closed trigger", !/onEdit\(activeKey\)/.test(panels))
    check("and on every row of the open list", /onEdit\(key\)/.test(panels))
    check("a row is a pair, not a button inside a button", /flex h-11 min-w-0 flex-1 cursor-pointer/.test(panels))

    /** A footer link is a link. */
    check("sections say what type they are", /data-section-type=\{props\.section\.type\}/.test(renderer))
    check(
      "and a footer link navigates even with the inspector on",
      /data-section-type="footer"/.test(editor) && /handleEditorNavigate\(href, true\)/.test(editor),
    )
    check(
      "while everywhere else a tap still only selects",
      /if \(inspectorEnabled && !fromFooter\) return/.test(editor),
    )
    check("an external link in a footer still does not leave the editor", /href\.startsWith\("\/"\)/.test(editor))

    /** And every wait says so. */
    check("the progress bar covers every canvas wait", /<WbLoadProgressBar active=\{sectionsLoading \|\| canvasBusy\} \/>/.test(editor))
    check("and it is a hairline, not a chrome element", /h-\[1\.5px\]/.test(editor))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
