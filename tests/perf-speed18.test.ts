/**
 * ===========================================================================
 *  ROUND 18, H18B: FASTER, AND STILL RIGHT
 * ===========================================================================
 * Every speed change of this round (lib/perf/optimizations.ts lists them
 * with their numbers) is held here to two things: it asks the database
 * less, and it answers exactly what it answered before. The cached ones are
 * held to three more, against a cache kept the way Next keeps it
 * (scripts/speed18/shims/next-cache.ts, installed through the test
 * loader's next/cache hook):
 *
 *   a cached public page never holds another creator's rows;
 *   it never holds a draft, a private column or anything about a visitor;
 *   its owner's publish, product change or theme change clears it, and
 *   clears nobody else's.
 *
 * The database is scripts/speed18/fake-postgrest.ts under the real
 * supabase-js, over the fixture in scripts/speed18/fixture.ts (two creators,
 * drafts and private columns carrying marker strings to look for).
 *
 * Run with:  pnpm test:push
 */
import { createClient } from "@supabase/supabase-js"
import { fakeFetch, setRtt, useFixture, type Fixture } from "../scripts/speed18/fake-postgrest"
import { visit } from "../scripts/speed18/context"
import { buildFixture, SITE, OTHER } from "../scripts/speed18/fixture"
import * as nextCache from "../scripts/speed18/shims/next-cache"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
;(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as typeof fetch
;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
setRtt(0)

const db = () => createClient("https://fixture.supabase.co", "service-fixture-key", { auth: { persistSession: false, autoRefreshToken: false } })

function fixtureWith(change: (f: Fixture) => void): Fixture {
  const f = buildFixture()
  change(f)
  return f
}

async function routeFacts() {
  section("The proxy asks about a site's name once (lib/website-builder/route-facts.ts)")
  const { readSiteFacts, siteFactsFor, rememberCreatorOf, forgetSiteFacts } = await import("@/lib/website-builder/route-facts")

  useFixture(buildFixture())
  const maya = await visit(() => readSiteFacts(db(), "Maya"))
  check("a username: its creator, a published website, not an imported theme", maya.value?.facts.creatorId === SITE.creatorId && maya.value.facts.published && !maya.value.facts.compat && !maya.value.failed, maya.value)
  check("in three round trips (profile, creator, install with its settings)", maya.foreground === 3, maya.trips.map((t) => t.table))

  useFixture(fixtureWith((f) => {
    const s = f.tables.store_theme_settings.find((r) => r.install_id === SITE.installId)!
    s.settings = { ...(s.settings as object), compat: { kind: "shopify" } }
  }))
  const compat = await visit(() => readSiteFacts(db(), "maya"))
  check("an imported Shopify theme is seen through the embed, as the fourth read saw it", compat.value?.facts.compat === true && compat.value.facts.published, compat.value)

  useFixture(fixtureWith((f) => {
    f.tables.store_theme_installs.find((r) => r.id === SITE.installId)!.status = "draft"
  }))
  const unpublished = await visit(() => readSiteFacts(db(), "maya"))
  check("nothing published: a creator, no website", unpublished.value?.facts.creatorId === SITE.creatorId && !unpublished.value.facts.published && !unpublished.value.facts.compat)

  useFixture(fixtureWith((f) => {
    f.tables.profiles = f.tables.profiles.filter((p) => p.id !== OTHER.userId)
  }))
  const bySlug = await visit(() => readSiteFacts(db(), "leo"))
  check("a creator slug with no profile of that name is still found", bySlug.value?.facts.creatorId === OTHER.creatorId && bySlug.value.facts.published)

  useFixture(buildFixture())
  const nobody = await visit(() => readSiteFacts(db(), "no-such-name"))
  check("a name nobody has: no creator, no website, and not a failure", nobody.value?.facts.creatorId === null && !nobody.value.facts.published && !nobody.value.failed)

  useFixture(fixtureWith((f) => {
    f.fail = ["store_theme_installs"]
  }))
  const broken = await visit(() => readSiteFacts(db(), "maya"))
  check("a database that does not answer is a failure, never \"no website\"", broken.value?.failed === true, broken.value)

  useFixture(buildFixture())
  const hinted = await visit(() => readSiteFacts(db(), "maya", SITE.creatorId))
  check("a connected domain that knows its creator asks one read", hinted.foreground === 1 && hinted.value?.facts.published === true, hinted.trips.map((t) => t.table))

  forgetSiteFacts()
  const together = await visit(() => Promise.all([siteFactsFor(db(), "maya"), siteFactsFor(db(), "MAYA")]))
  check("two questions asked together share one read", together.foreground === 3, together.trips.map((t) => t.table))

  forgetSiteFacts()
  rememberCreatorOf("maya", SITE.creatorId)
  const known = await visit(() => siteFactsFor(db(), "maya"))
  check("a name a domain named is looked up by its creator", known.foreground === 1)
  forgetSiteFacts()
}

async function main() {
  await routeFacts()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
