/**
 * Errors production logged, each pinned at its cause.
 *
 *   "Objects are not valid as a React child (found: object with keys
 *   {main, was, off})" on /@andrewrullz, /@lucadragoste and /member/[username]:
 *   the member profile drew the whole result of listPrice() as text. Fixed in
 *   that file; checked here for every file that calls listPrice, because the
 *   next card to call it is not going to be that one.
 *
 *   "[admin] payments overview: e.not is not a function": the overview put
 *   its filters on supabase-js's `from()` builder, which has none until
 *   `select()` is called. Driven here with a builder shaped like the real one.
 *
 * Run with:  npm run test:push
 */

import "./_usd"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { listPrice } from "@/lib/pricing/list-price"
import { countRows } from "@/lib/admin/payments/count-rows"

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

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return []
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.tsx$/.test(name) ? [full] : []
  })
}

/**
 * PostgREST's shape, as supabase-js has it: `from()` answers select, insert,
 * update, upsert and delete, and only what `select()` returns can be filtered
 * and awaited.
 */
function fakeDb(rows: Record<string, unknown>[], opts: { error?: boolean } = {}) {
  const seen: string[] = []
  const filter = (list: Record<string, unknown>[]) => {
    const builder = {
      eq: (col: string, v: unknown) => (seen.push(`eq ${col}`), filter(list.filter((r) => r[col] === v))),
      neq: (col: string, v: unknown) => (seen.push(`neq ${col}`), filter(list.filter((r) => r[col] !== v))),
      not: (col: string, op: string, v: unknown) => {
        seen.push(`not ${col}`)
        if (op !== "is" || v !== null) throw new Error("fake: only not is null")
        return filter(list.filter((r) => r[col] != null))
      },
      then: (resolve: (r: unknown) => unknown) =>
        resolve(opts.error ? { count: null, error: { message: "boom" } } : { count: list.length, error: null }),
    }
    return builder
  }
  const db = {
    from: (table: string) => {
      seen.push(`from ${table}`)
      return {
        select: (cols: string, o?: { count?: string; head?: boolean }) => {
          seen.push(`select ${cols} ${o?.count ?? ""}${o?.head ? " head" : ""}`)
          return filter(rows)
        },
        insert: () => {
          throw new Error("not here")
        },
      }
    },
  }
  return { db, seen }
}

async function main() {
  console.log("\nA price label is three fields, never a child")
  {
    const label = listPrice({ price_cents: 900, compare_at_cents: 1800 })
    check("listPrice answers an object with main, was and off", Object.keys(label).sort().join(",") === "main,off,was" && label.main === "$9.00")

    const offenders: string[] = []
    for (const file of [...sources(join(root, "app")), ...sources(join(root, "components"))]) {
      const text = readFileSync(file, "utf8")
      if (!text.includes("listPrice(")) continue
      if (/\{\s*listPrice\([^)]*\)\s*\}/.test(text)) offenders.push(`${relative(root, file)}: {listPrice(...)}`)
      for (const m of text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*listPrice\(/g)) {
        const name = m[1]
        /* `{price}` alone in JSX; `{price.main}` and `{price.was && ...}` are fine. */
        if (new RegExp(`[>\\s]\\{\\s*${name}\\s*\\}`).test(text)) offenders.push(`${relative(root, file)}: {${name}}`)
      }
    }
    check("no component draws a whole listPrice() result", offenders.length === 0, offenders.join(" | "))
    /* Round 12: a profile is somebody without a store and sells nothing, so it draws no price at all (components/profile/member-profile-page.tsx). */
    const member = readFileSync(join(root, "components/profile/member-profile-page.tsx"), "utf8")
    check("the member profile draws no price at all (it sells nothing)", !/listPrice|price\.main/.test(member))
  }

  console.log("\nThe payments overview counts with filters after select")
  {
    const creators = [
      { id: 1, stripe_account_id: "acct_1", charges_enabled: true, stripe_onboarding_status: "connected" },
      { id: 2, stripe_account_id: "acct_2", charges_enabled: false, stripe_onboarding_status: "pending" },
      { id: 3, stripe_account_id: null, charges_enabled: false, stripe_onboarding_status: null },
    ]
    const { db, seen } = fakeDb(creators)
    /* The control: the old order, filter on from() and select after, fails here as it did in production. */
    let old = ""
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (db.from("creators") as any).not("stripe_account_id", "is", null)
      await q.select("id", { count: "exact", head: true })
    } catch (e) {
      old = e instanceof Error ? e.message : String(e)
    }
    check("the old order throws on this builder, as it did in production", /not is not a function/.test(old), old)
    check("every creator", (await countRows(db, "creators")) === 3)
    check("with an account (the `.not` that threw)", (await countRows(db, "creators", (q) => q.not("stripe_account_id", "is", null))) === 2)
    check(
      "a chain of filters",
      (await countRows(db, "creators", (q) => q.neq("stripe_onboarding_status", "connected").not("stripe_account_id", "is", null))) === 1,
    )
    check("asked as a head count", seen.includes("select id exact head"))
    check("a database error is a count of 0, not a failed page", (await countRows(fakeDb(creators, { error: true }).db, "creators")) === 0)
    check("and so is a filter that throws", (await countRows(db, "creators", () => { throw new Error("bad filter") })) === 0)

    const overview = readFileSync(join(root, "lib/admin/payments/overview.ts"), "utf8")
    check("the overview counts through it", /countRows\(db, "creators", filter\)/.test(overview))
    check("and no longer filters the from() builder", !/let q = db\.from\("creators"\)\s*\n\s*if \(mutate\)/.test(overview))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
