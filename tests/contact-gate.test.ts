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
    check(
      "the page asks the question",
      /hasBoughtFromCreator\(supabase, data\.user\?\.id, creator\.id\)/.test(page),
    )
    check(
      "and asks it in the batch, not in series after it",
      /viewerPromise\.then\(\(\{ data \}\) => hasBoughtFromCreator/.test(page),
    )
    check("and only puts the address in the page when the answer is yes", /viewerBought \? resolvedContactEmail : undefined/.test(page))
    /**
     * NO EXCEPTION FOR THE OWNER. There was one, so a creator could tell
     * from the page what was set — and what it actually did was show the
     * owner a Contact link no visitor could see, which got reported as the
     * gate being broken. That is the failure mode of every owner-only
     * preview of a hidden thing. They see what a visitor sees; the address
     * is checked in the editor, beside the field they typed it into.
     */
    check("the owner is not an exception", !/viewerIsOwner\s*\n?\s*\? true/.test(page))
    /*
      `await hasBoughtFromCreator` was the shape when the question was asked
      on this line. It is asked in the page's batch now, pinned above, so
      what is left to hold here is that ONE answer feeds the address and
      nothing reintroduces a second path for the owner.
    */
    check("everyone goes through the same question",
      /const viewerBought = viewerBoughtFromCreator/.test(page) && !/viewerIsOwner \|\| viewerBought/.test(page))
    /**
     * THE ACCOUNT ADDRESS STILL STANDS IN when a creator has typed none.
     * That is the owner's explicit call — a page with nowhere to be reached
     * was the thing they did not want — and it is not this change's to
     * reverse. What changed is the audience: buyers rather than everyone.
     */
    check("the account address still stands in", /headerSettings\.contactEmail \|\| \(await loadAccountEmail\(profile\.id\)\)/.test(page))
    check("but it goes through the same gate", !/publicContactEmail = resolvedContactEmail(?! \?)/.test(page))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
