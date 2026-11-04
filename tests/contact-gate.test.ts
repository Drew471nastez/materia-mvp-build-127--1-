/**
 * ===========================================================================
 *  THE CONTACT ADDRESS IS FOR PEOPLE WHO BOUGHT SOMETHING
 * ===========================================================================
 * A creator's address was on their page for everyone, which makes their inbox
 * public the moment they open a shop. It is asked of the database now: has
 * this viewer bought anything from this creator.
 *
 * Two things are tested, and the second is the one that matters.
 *
 *   the question  hasBoughtFromCreator, driven with a fake client, including
 *                 every way it can be asked wrongly
 *   the answer    that the page gates on it, and never falls back to the
 *                 login email
 *
 * The query is inspected, not just its result: an authorization check that
 * returns the right answer while scoping by the wrong column is a check that
 * passes here and leaks in production.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { hasBoughtFromCreator } from "@/lib/commerce/has-bought-from-creator"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`) }
}

/** Records every filter so the SCOPE can be asserted, not just the result. */
function fakeClient(rows: unknown[] | null, error: unknown = null) {
  const calls: { table?: string; select?: string; eq: [string, unknown][]; limit?: number } = { eq: [] }
  const builder: Record<string, unknown> = {
    select(sel: string) { calls.select = sel; return builder },
    eq(col: string, val: unknown) { calls.eq.push([col, val]); return builder },
    limit(n: number) { calls.limit = n; return Promise.resolve({ data: rows, error }) },
  }
  return {
    calls,
    client: { from(table: string) { calls.table = table; return builder } } as never,
  }
}

async function main() {
  console.log("\nThe contact address is for people who bought something")

  /* ---- the question ---- */
  {
    const { client, calls } = fakeClient([{ id: "e1" }])
    check("a buyer of this creator's work is recognised", (await hasBoughtFromCreator(client, "buyer-1", "creator-1")) === true)
    check("asked of entitlements", calls.table === "entitlements")
    /**
     * SCOPED BY BOTH, and by the creator through the PRODUCT. `entitlements`
     * carries its own `creator_id`, but that is a copy of a fact that lives
     * on the product and can be missing on a row written before it existed.
     */
    const cols = calls.eq.map(([c]) => c).sort().join(",")
    check("scoped to this buyer and this creator", cols === "buyer_id,products.creator_id", cols)
    check("through the product, where the fact lives", (calls.select ?? "").includes("products!inner(creator_id)"), calls.select)
    check("and it stops at one row", calls.limit === 1, String(calls.limit))
  }

  {
    const { client } = fakeClient([])
    check("somebody who has bought nothing is not", (await hasBoughtFromCreator(client, "buyer-2", "creator-1")) === false)
  }

  /* ---- every way it can go wrong answers no ---- */
  {
    const { client } = fakeClient([{ id: "e1" }])
    check("a signed-out viewer is not", (await hasBoughtFromCreator(client, null, "creator-1")) === false)
    check("nor an undefined one", (await hasBoughtFromCreator(client, undefined, "creator-1")) === false)
    check("nor an empty id", (await hasBoughtFromCreator(client, "", "creator-1")) === false)
    check("no creator is not", (await hasBoughtFromCreator(client, "buyer-1", null)) === false)
  }
  {
    const { client } = fakeClient(null, { message: "permission denied" })
    check("a query that errors answers no", (await hasBoughtFromCreator(client, "buyer-1", "creator-1")) === false)
  }
  {
    const client = { from() { throw new Error("network") } } as never
    check("and a client that throws answers no", (await hasBoughtFromCreator(client, "buyer-1", "creator-1")) === false)
  }
  {
    const { client } = fakeClient(null)
    check("null rows are no, not a crash", (await hasBoughtFromCreator(client, "buyer-1", "creator-1")) === false)
  }

  /* ---- the answer, on the page ---- */
  {
    const page = readFileSync(join(process.cwd(), "app/(marketing)/u/[username]/page.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")

    /*
      The question is now asked from inside the page's main batch, chained off
      the session promise started at the top of the request, rather than
      awaited on its own line after the batch had already come back. Same
      question, same two arguments; it just stopped costing a round trip of
      its own on every visit by a signed-in person.
    */
    /*
      ROUND 49: THE PAGE IS ONE HTML FOR EVERYBODY (a CDN holds it), so it
      no longer asks. The same question is asked after load by
      /api/creator-page/viewer (`bought`, which draws the Contact link), and
      the address itself is still answered only by /api/creator-contact,
      which asks it again (lib/commerce/contact-email.ts). The page hands
      every visitor the handle, never an address.
    */
    const viewerRoute = readFileSync(join(process.cwd(), "app/api/creator-page/viewer/route.ts"), "utf8")
    const contactRoute = readFileSync(join(process.cwd(), "app/api/creator-contact/route.ts"), "utf8")
    const renderer = readFileSync(join(process.cwd(), "components/store-builder/unified-section-renderer.tsx"), "utf8")
    check("the page asks the question (after load, its own route)", /hasBoughtFromCreator\(supabase, user\.id, row\.id\)/.test(viewerRoute) && !/hasBoughtFromCreator/.test(page))
    check("and asks it beside the owner test, not in series after it", /const \[teamStore, bought\] = await Promise\.all\(/.test(viewerRoute))
    check("and only draws the link when the answer is yes; the address is never in the page", /\{contactHandle && contactShown && \(/.test(renderer) && !/resolvedContactEmail|loadAccountEmail|contactEmail:/.test(page))
    check("the owner is not an exception", !/viewerIsOwner\s*\n?\s*\? true/.test(page) && /bought, contactEmail \}/.test(viewerRoute) && !/owner \|\| bought/.test(viewerRoute))
    check("everyone goes through the same question", /viewerBought: \(viewerId, creatorId\) => hasBoughtFromCreator\(supabase, viewerId, creatorId\)/.test(contactRoute))
    check("the account address still stands in", /\(await look\.accountEmail\(profile\.id\)\)/.test(readFileSync(join(process.cwd(), "lib/commerce/contact-email.ts"), "utf8")))
    check("but it goes through the same gate", /if \(banned \|\| !bought\) return null/.test(readFileSync(join(process.cwd(), "lib/commerce/contact-email.ts"), "utf8")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
