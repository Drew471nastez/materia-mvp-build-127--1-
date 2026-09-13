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

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
