/**
 * Round AW (track A): public pages, the CDN and caching.
 *
 * A read that got no answer never becomes an answer the CDN keeps for every
 * visitor (a product page's redirect or 404, a creator page with no
 * products), and the image optimizer fetches from Storelib's own storage
 * only, never any Supabase project.
 */
import { createRequire } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { readCode } from "./_source"
import { productAddressStep, resolveProductAddress, type ProductAddressReads } from "@/lib/commerce/product-address"
import { SiteReadError } from "@/lib/website-builder/site-read"
import { isTransientDbError } from "@/lib/website-builder/write-retry"
import { isOptimizableImage, optimizedImageUrl, ownStorageFile } from "@/lib/images/optimized-url"

const require = createRequire(join(process.cwd(), "package.json"))

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
  }
}

/** What a promise came to: its value, or what it threw. */
async function outcome<T>(p: Promise<T>): Promise<{ value?: T; threw?: unknown }> {
  try {
    return { value: await p }
  } catch (e) {
    return { threw: e }
  }
}

/* ───────────────────────────────────────────────────────────────────────── */
console.log("\nA product page whose owner could not be read is the shop's error screen, never a redirect or a 404 the CDN keeps")

/* andrewrullz sells "pack"; bob sells an older "pack" too (the oldest is what "wherever the slug is sold" finds). */
function reads(over: Partial<ProductAddressReads> = {}, asked: string[] = []): ProductAddressReads {
  const base: ProductAddressReads = {
    profile: async (h) => (h.toLowerCase() === "andrewrullz" ? { id: "u-andrew", username: "andrewrullz" } : h.toLowerCase() === "member" ? { id: "u-member", username: "member" } : null),
    creator: async (u) => (u === "u-andrew" ? { id: "c-andrew" } : null),
    product: async (slug, creatorId) => (creatorId === "c-andrew" && slug === "pack" ? { slug: "pack", viaHistory: false } : creatorId === "c-andrew" && slug === "old-pack" ? { slug: "pack", viaHistory: true } : null),
    renamed: async (h) => (h === "andrew-old" ? "andrewrullz" : null),
    elsewhere: async (slug) => (slug === "pack" ? "https://storelib.com/bob/pack" : null),
  }
  const merged = { ...base, ...over }
  const watch = <K extends keyof ProductAddressReads>(k: K) => ((...args: unknown[]) => {
    asked.push(k)
    return (merged[k] as (...a: unknown[]) => unknown)(...args)
  }) as ProductAddressReads[K]
  return { profile: watch("profile"), creator: watch("creator"), product: watch("product"), renamed: watch("renamed"), elsewhere: watch("elsewhere") }
}
const noAnswer = (what: string) => async (): Promise<never> => {
  throw new SiteReadError(what, "no answer in 4000ms")
}
/** The door's old wiring: the lenient lookups, where a failed read is null. */
const lenient = <A extends unknown[], R>(read: (...a: A) => Promise<R>) => (...a: A) => read(...a).catch(() => null)

{
  const page = await resolveProductAddress("andrewrullz", "pack", reads())
  check("answered: the creator's own product is the page", page.kind === "page" && page.owner === "c-andrew", page)

  /* Production, Nov 13: "creators_public: no answer in 4000ms". */
  const asked: string[] = []
  const slowCreator = await outcome(resolveProductAddress("andrewrullz", "pack", reads({ creator: noAnswer("creators_public") }, asked)))
  check("the creator row got no answer: thrown (SiteReadError, a 5xx Vercel never stores)", slowCreator.threw instanceof SiteReadError && slowCreator.value === undefined, slowCreator)
  check("  and nobody else's product was looked up for the address", !asked.includes("elsewhere") && !asked.includes("renamed"), asked)
  const before = await resolveProductAddress("andrewrullz", "pack", reads({ creator: lenient(noAnswer("creators_public")) }))
  check("  (the old wiring answered the same failure with a redirect to another seller's product, which the CDN kept)", before.kind === "redirect" && before.to === "https://storelib.com/bob/pack", before)
  const selfLoop = await resolveProductAddress("andrewrullz", "pack", reads({ creator: lenient(noAnswer("creators_public")), elsewhere: async () => "https://storelib.com/andrewrullz/pack" }))
  check("  (or with a redirect to its own address: a loop for every visitor)", selfLoop.kind === "redirect" && selfLoop.to === "https://storelib.com/andrewrullz/pack", selfLoop)

  const asked2: string[] = []
  const slowProfile = await outcome(resolveProductAddress("andrewrullz", "pack", reads({ profile: noAnswer("profiles_public") }, asked2)))
  check("the profile got no answer: thrown, and no rename or other seller is asked", slowProfile.threw instanceof SiteReadError && asked2.join(",") === "profile", asked2)
  const oldProfile = await resolveProductAddress("andrewrullz", "pack", reads({ profile: lenient(noAnswer("profiles_public")) }))
  check("  (the old wiring read it as a handle nobody has)", oldProfile.kind === "redirect", oldProfile)

  const slowHistory = await outcome(resolveProductAddress("nobody-here", "pack", reads({ renamed: noAnswer("username history") })))
  check("a handle nobody has whose rename history got no answer: thrown, never sent on to wherever the slug is sold", slowHistory.threw instanceof SiteReadError, slowHistory)

  const slowProduct = await outcome(resolveProductAddress("andrewrullz", "pack", reads({ product: noAnswer("product") })))
  check("the product read got no answer: thrown, never this creator's 404", slowProduct.threw instanceof SiteReadError, slowProduct)

  /* Every answer still decides as productAddressStep says (round 44). */
  check("answered: an old slug of theirs is a permanent move to the current one", JSON.stringify(await resolveProductAddress("andrewrullz", "old-pack", reads())) === JSON.stringify({ kind: "redirect", to: "/andrewrullz/pack", permanent: true }))
  check("answered: their handle and no such product is a 404, never somebody else's product", (await resolveProductAddress("andrewrullz", "nope", reads())).kind === "missing")
  check("answered: a renamed handle is a permanent move to the new one", JSON.stringify(await resolveProductAddress("andrew-old", "pack", reads())) === JSON.stringify({ kind: "redirect", to: "/andrewrullz/pack", permanent: true }))
  const nobody = await resolveProductAddress("nobody-here", "pack", reads())
  check("answered: a handle nobody has goes to where the slug is sold, not permanently", nobody.kind === "redirect" && !nobody.permanent && nobody.to === "https://storelib.com/bob/pack", nobody)
  const asked3: string[] = []
  const member = await resolveProductAddress("member", "pack", reads({}, asked3))
  check("answered: a profile with no store is not renamed; where the slug is sold", member.kind === "redirect" && !asked3.includes("renamed") && asked3.includes("elsewhere"), { member, asked3 })
  check("answered: nothing anywhere is a 404", (await resolveProductAddress("nobody-here", "nothing", reads())).kind === "missing")
  check("  the same decisions productAddressStep makes", productAddressStep({ slug: "pack", owner: { creatorId: "c-andrew", handle: "andrewrullz" }, found: { slug: "pack", viaHistory: false }, renamedTo: null, elsewhere: null }).kind === "page")
}

{
  const door = readCode("app/(storelib)/(marketing)/[sellername]/[productSlug]/page.tsx")
  check("the door reads the owner with the creator page's strict lookups", /profile: \(name\) => loadProfileByUsernameStrict\(name\)/.test(door) && /creator: \(userId\) => loadCreatorForUserStrict\(userId\)/.test(door) && /resolveProductAddress\(handle, slug, \{/.test(door))
  check("  and the lenient ones are gone from it", !/\bloadProfileByUsername\(/.test(door) && !/\bloadCreatorForUser\(/.test(door))
  const history = door.slice(door.indexOf("async function renamedHandle"), door.indexOf("async function canonicalElsewhere"))
  check("  the rename history throws when it got no answer, never 'not renamed'", /if \(error\) throw new SiteReadError\("username history"/.test(history) && !/catch\s*\{?\s*return null/.test(history))
  check("  and matches the old handle literally (`_` and `%` are not wildcards), as the creator page does", /\.ilike\("old_username", exactIlike\(handle\)\)/.test(history))
  const data = readCode("lib/commerce/creator-page-data.ts")
  check("the strict lookups throw when nothing is held for the name (round AV)", /if \(held !== undefined\) return held[^\n]*\s*throw error/.test(data) && /const held = whoLastGood\.get\(`creator:\$\{userId\}`\)\s*if \(held !== undefined\) return held[^\n]*\s*throw error/.test(data))
  const conf = readCode("next.config.mjs")
  check("why it matters: the CDN keeps every answer for /<handle>/<product>, a 307 and a 404 included", /edgeRule\(`\/:handle\(\$\{HANDLE_SEGMENT\}\)\/:product\(\(\?!links\$\)\[\^\/\.\]\+\)`, 'creator-page-:handle'\)/.test(conf) && /export const EDGE_PAGE = "public, s-maxage=300, stale-while-revalidate=86400"/.test(conf))
}

/* ───────────────────────────────────────────────────────────────────────── */
console.log("\nA creator page whose products read got no answer is the error screen, never an empty shop the CDN keeps")
{
  /* The shapes the catalogue read comes back with (supabase-js never throws): each with the answer's HTTP status, as the page now keeps it. */
  const noAnswerShapes: [string, { message: string; code: string; status: number }][] = [
    ["the 20 second deadline", { message: "DeadlineExceeded: skgtqglupjcnfhfscink.supabase.co/rest/v1/products took longer than 20s", code: "", status: 0 }],
    ["an aborted read", { message: "AbortError: This operation was aborted", code: "20", status: 0 }],
    ["the network", { message: "TypeError: fetch failed", code: "", status: 0 }],
    ["a statement timeout", { message: "canceling statement due to statement timeout", code: "57014", status: 500 }],
    ["PostgREST's pool", { message: "Could not connect to the database", code: "PGRST001", status: 503 }],
    ["a gateway's 502", { message: "<html><head><title>502 Bad Gateway</title></head></html>", code: "", status: 502 }],
    ["too many requests", { message: "Too Many Requests", code: "", status: 429 }],
  ]
  for (const [what, e] of noAnswerShapes) check(`no answer (${what}): the page throws`, isTransientDbError(e, e.status) === true, e)
  const answeredShapes: [string, { message: string; code: string; status: number }][] = [
    ["a column that is not there", { message: "column products.nope does not exist", code: "42703", status: 400 }],
    ["an embed PostgREST refuses", { message: "Could not find a relationship between 'products' and 'x' in the schema cache", code: "PGRST200", status: 400 }],
  ]
  for (const [what, e] of answeredShapes) check(`answered with an error (${what}): drawn as before, a retry would not change it`, isTransientDbError(e, e.status) === false, e)

  const page = readCode("app/(storelib)/(marketing)/u/[username]/page.tsx")
  check("the products read keeps its answer's status", /\{ data: catalogue, error: productsError, status: productsStatus \}/.test(page) && /productsError: productsError \? \{ message: productsError\.message, code: productsError\.code, status: productsStatus \} : null/.test(page))
  const unpacked = page.indexOf("const { catalogue: pricedCatalogue, productsError, creatorReviews, creatorReviewsError, place } = held")
  const thrown = page.search(/if \(productsError && isTransientDbError\(productsError, productsError\.status\)\) \{\s*throw new SiteReadError\("creator page products"/)
  const drawn = page.indexOf("const products = pricedCatalogue ?")
  check("  no answer and no last good copy: SiteReadError, before anything is drawn from the empty list", unpacked > 0 && thrown > unpacked && drawn > thrown, { unpacked, thrown, drawn })
  check("  a last good copy still answers first (round AU), and a failed read is still never held", /heldForCreatorPage\(\["creator-page-catalogue", "v1", creator\.id, profile\.id\], creator\.id, profile\.id, readCatalogue, \(r\) => !!r\.productsError \|\| !!r\.creatorReviewsError\)/.test(page))
  check("  the reviews alone failing still draws the page (no throw on them)", !/if \(creatorReviewsError[^)]*\)\s*\{?\s*throw/.test(page))
  check("  the error screen is the shop's own, with Try again", /<ErrorScreen error=\{error\} reset=\{reset\} home=\{home\} homeLabel="Back to the shop" \/>/.test(readCode("app/(storelib)/(marketing)/[sellername]/error.tsx")))
}

/* ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe image optimizer fetches from Storelib's own storage, never any Supabase project")
{
  const { hasRemoteMatch } = require("next/dist/shared/lib/match-remote-pattern") as { hasRemoteMatch: (domains: string[], patterns: object[], url: URL) => boolean }
  type Pattern = { protocol?: string; hostname: string; pathname?: string }
  const load = async (supabaseUrl: string | undefined) => {
    if (supabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl
    const mod = await import(`${pathToFileURL(join(process.cwd(), "next.config.mjs")).href}?aw=${Date.now()}-${Math.random()}`)
    return { patterns: (mod.default.images.remotePatterns ?? []) as Pattern[], own: mod.OWN_STORAGE_HOSTS as string[], production: mod.PRODUCTION_STORAGE_HOST as string }
  }
  const allowed = (patterns: Pattern[], url: string) => hasRemoteMatch([], patterns, new URL(url))
  const OWN = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/covers/c.jpg"
  const OTHER = "https://attacker-project.supabase.co/storage/v1/object/public/pics/a.png"

  const prod = await load("https://skgtqglupjcnfhfscink.supabase.co")
  check("no pattern names a wildcard Supabase host", !prod.patterns.some((p) => /\*/.test(p.hostname) && /supabase/.test(p.hostname)), prod.patterns)
  check("  every Supabase pattern is one of Storelib's own, storage files only", prod.patterns.filter((p) => /supabase\.co$/.test(p.hostname)).every((p) => prod.own.includes(p.hostname) && p.pathname === "/storage/v1/**" && p.protocol === "https"))
  check("Next's own matcher: Storelib's storage is fetched", allowed(prod.patterns, OWN))
  check("  another Supabase project is refused (it was fetched, transformed and billed)", !allowed(prod.patterns, OTHER))
  check("  Storelib's project outside its storage is refused", !allowed(prod.patterns, "https://skgtqglupjcnfhfscink.supabase.co/rest/v1/products?select=*"))
  check("  storelib.com/media and the stock hosts are as before", allowed(prod.patterns, "https://storelib.com/media/covers/a.jpg") && allowed(prod.patterns, "https://images.unsplash.com/photo-1") && allowed(prod.patterns, "https://i.ytimg.com/vi/x/hqdefault.jpg"))

  const preview = await load("https://previewproj.supabase.co")
  check("a preview deployment's own project is fetched, with the production one", allowed(preview.patterns, "https://previewproj.supabase.co/storage/v1/object/public/a/b.jpg") && allowed(preview.patterns, OWN), preview.own)
  check("  and still no other project", !allowed(preview.patterns, OTHER))
  const none = await load(undefined)
  check("no project configured: the production one alone", none.own.length === 1 && none.own[0] === none.production && allowed(none.patterns, OWN) && !allowed(none.patterns, OTHER))

  /* The other half: what a page sends to the optimizer at all (lib/images/optimized-url.ts). */
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  check("isOptimizableImage: Storelib's storage, yes", isOptimizableImage(OWN))
  check("  another project, no: drawn as it is", !isOptimizableImage(OTHER) && optimizedImageUrl(OTHER, 200) === OTHER)
  check("  a Storelib project's non-storage address, no", !ownStorageFile("skgtqglupjcnfhfscink.supabase.co", "/rest/v1/products"))
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://previewproj.supabase.co"
  check("  a preview's own project, yes", isOptimizableImage("https://previewproj.supabase.co/storage/v1/object/public/a/b.jpg"))
  check("  the two halves agree on every Supabase address", [OWN, OTHER, "https://previewproj.supabase.co/storage/v1/object/public/a/b.jpg", "https://skgtqglupjcnfhfscink.supabase.co/rest/v1/x"].every((u) => isOptimizableImage(u) === allowed(preview.patterns, u)))
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  check("  an optimised address for Storelib's storage still asks the optimizer", optimizedImageUrl(OWN, 200).startsWith("/_next/image?url="))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
