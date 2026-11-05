/**
 * ===========================================================================
 *  ONE REQUEST, ONE QUERY PER ROW — AND AN ARRIVAL THAT IS NOT A SWAP
 * ===========================================================================
 * Rendering a product page runs three pieces of code that each needed the
 * same handful of rows, and none of them knew about the others:
 *
 *   layout.tsx        products, (slug history), store_builder_configs
 *   generateMetadata  products, (slug history), creators, profiles,
 *                     store_builder_configs
 *   page.tsx          products, creators, profiles, store_builder_configs x3
 *
 * The product row three times, the creator twice, the creator's profile
 * twice, the shop's config twice. Nine round trips for four rows, on a page
 * somebody is waiting to look at.
 *
 * React's `cache()` is per request, so the first caller pays and the rest are
 * free. This suite is the guard on that arrangement: it is easy to add one
 * more `supabase.from("products")` to any of the three files and never notice
 * that the page now queries it a fourth time.
 *
 * And the arrival: the skeleton was replaced by the finished page with no
 * transition at all. It fades now, on the same rule every /app page uses.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const page = read("app/(storelib)/(marketing)/p/[slug]/page.tsx")
/* Changed on purpose: the layout's body is the shared product page frame (also behind /creator/product). */
const layout = read("components/platform/product-page-frame.tsx")
const loaders = read("lib/commerce/product-page-data.ts")
const css = read("app/globals.css")

/** generateMetadata's body, which is its own set of queries. */
const metaStart = page.indexOf("export async function generateMetadata")
const metaEnd = page.indexOf("export default async function ProductPage")
const metadata = page.slice(metaStart, metaEnd)

const countFrom = (src: string, table: string) =>
  (src.match(new RegExp(`\\.from\\("${table}"\\)`, "g")) || []).length

function main() {
  console.log("\nOne request, one query per row")

  /* ---------------------------------------------------------------------
     THE LOADERS EXIST AND ARE REQUEST-SCOPED
     --------------------------------------------------------------------- */
  console.log("\n  the loaders")

  check("they come from React's per-request cache", /^import \{ cache \} from "react"$/m.test(loaders))
  for (const name of [
    "loadProductBySlug",
    "loadCreator",
    "loadCreatorProfile",
    "loadStoreConfig",
    "loadProductPageConfig",
  ]) {
    check(`${name} is wrapped in cache()`, new RegExp(`export const ${name} = cache\\(`).test(loaders))
  }
  /*
    NOT unstable_cache. That one persists BETWEEN requests, which would mean a
    creator edits a product and the page keeps serving the old row until a
    revalidation they cannot see. `cache()` lives and dies with the request.
  */
  check("and not a cache that outlives the request", !/unstable_cache/.test(loaders))

  /* ---------------------------------------------------------------------
     NOBODY QUERIES THESE ROWS DIRECTLY ANY MORE
     --------------------------------------------------------------------- */
  console.log("\n  the three callers ask the loaders, not the database")

  check("the layout runs no queries of its own", countFrom(layout, "products") === 0 && countFrom(layout, "store_builder_configs") === 0)
  check("and does not reach for a supabase client at all", !/createClient/.test(layout))
  /* Changed on purpose (round 44): with the creator the address names, `owner`, as a slug is unique per creator. */
  check("it reads the product through the loader", /loadProductBySlug\(slug, owner\)/.test(layout))

  check("generateMetadata queries no products row itself", countFrom(metadata, "products") === 0)
  check("nor the slug history", countFrom(metadata, "product_slug_history") === 0)
  check("nor the creator", countFrom(metadata, "creators") === 0)
  check("nor the profile", countFrom(metadata, "profiles") === 0)
  check("and it no longer opens its own client", !/createClient\(\)/.test(metadata))
  /* The two things it needs that do not depend on each other start together. */
  check("its creator and config start together", /await Promise\.all\(\[\s*\n\s*loadCreator\(product\.creator_id\),\s*\n\s*loadStoreConfig\(product\.creator_id, "shop"\),/.test(metadata))

  const body = page.slice(metaEnd)
  /* Changed on purpose (currency round AM): read as `loaded`, then `product` is that row in the page's currency (lib/money/marketplace-server productPageQuote). */
  check("the page reads the product through the loader", /const \{ product: loaded, viaHistory \} = await loadProductBySlug\(slug, owner\)/.test(body) && /const product = pageQuote\.convert\(loaded\)/.test(body))
  check("the page looks the product up by slug nowhere itself", !/\.eq\("slug", slug\)/.test(body))
  /* The seller's other work was the page's last `products` query of its own.
     It is the same question for every visitor, so it moved into the shared
     cache with the variants and the reviews; the `.neq` that excludes the
     product you are looking at went with it. */
  check("the page has no products query left of its own", countFrom(body, "products") === 0)
  check(
    "and the seller's other work still excludes this product",
    /\.neq\("id", excludeProductId\)/.test(read("lib/commerce/product-page-cache.ts")),
  )
  check("and no slug history", countFrom(body, "product_slug_history") === 0)
  check("the creator, both configs and the override go through loaders too",
    /loadCreator\(product\.creator_id\)/.test(body) &&
    /loadStoreConfig\(product\.creator_id, "shop"\)/.test(body) &&
    /loadStoreConfig\(product\.creator_id, "product"\)/.test(body) &&
    /loadProductPageConfig\(product\.creator_id, product\.id\)/.test(body))
  check("so the page has no creators or store_builder_configs query of its own",
    countFrom(body, "creators") === 0 && countFrom(body, "store_builder_configs") === 0)

  /*
    THE RENAMED-PRODUCT REDIRECT still happens, and from ONE place. Three
    files resolving slug history separately is three chances to disagree
    about where an old link goes.
  */
  check("an old slug still redirects to the current one, permanently", /if \(loaded && viaHistory\) \{\s*\n\s*permanentRedirect\(`\/p\/\$\{loaded\.slug\}`\)/.test(body))
  check("and only the page decides that", (page.match(/[rR]edirect\(`\/p\//g) || []).length === 1)
  check("the loader reports it rather than redirecting itself", !/\bredirect\(/.test(loaders))

  /* ---------------------------------------------------------------------
     THE PROFILE STOPPED WAITING BEHIND THINGS IT DOES NOT NEED
     --------------------------------------------------------------------- */
  console.log("\n  the profile joins the batch instead of waiting behind it")

  /*
    It needs creator.user_id, so it cannot start until the creator row lands.
    It was awaited after the WHOLE batch — behind three config queries it has
    nothing to do with. Chained onto the creator's promise it starts the
    moment that one returns.
  */
  check("it is chained onto the creator's own promise", /loadCreator\(product\.creator_id\)\.then\(async \(row\) => \(\{/.test(body))
  check("and that chain is what the batch waits on", /await Promise\.all\(\[\s*\n\s*creatorWithProfile,/.test(body))
  check("nothing fetches a profile after the batch any more", !/const \{ data: profile \} = await supabase\.from\("profiles"\)/.test(body))

  /* ---------------------------------------------------------------------
     THE ARRIVAL
     --------------------------------------------------------------------- */
  console.log("\n  the arrival is a swap, not a fade")

  /*
    ═══════════════════════════════════════════════════════════════════════
     THIS USED TO REQUIRE THE FADE. IT NOW REQUIRES ITS ABSENCE.
    ═══════════════════════════════════════════════════════════════════════
    `.app-page-enter` animates an element from opacity 0 over 380ms. On a
    panel inside an /app page, on a background of its own colour, that reads
    as content settling in and it is what the rule was written for.

    On a product page it fills the window, so the first painted frame is the
    BODY behind it — white — and the page fades up out of that. Filmed on
    production over a real navigation (scripts/check-nav-flash.mjs): the first
    frame of the product page measured 97% white pixels and stayed above 82%
    for 120ms before anything was legible.

    That is the flash that was reported three times, and it was never the
    navigation: the router keeps the previous page on screen until this one is
    ready, and then this page fades itself in out of nothing. So the check is
    inverted rather than deleted, because the next person to reach for
    `app-page-enter` here will be solving the problem it causes.
  */
  check(
    "neither branch of the page fades itself in",
    !/className="app-page-enter/.test(page),
    "a full-window fade from opacity 0 paints the white body first; that is the flash",
  )
  check(
    "and the rule still exists for the /app pages it was written for",
    /\.app-page-enter \{\s*\n\s*animation: app-page-enter 380ms/.test(css),
  )
  /*
    THE ONE THING THAT WOULD BREAK THIS PAGE. A product page has two
    `position: fixed` bars. A transform, a filter or a will-change for either
    on an ancestor makes that ancestor their containing block and both bars
    stop being fixed to the window for the length of the animation. Opacity
    does not do that.
  */
  const ruleAt = css.indexOf(".app-page-enter {")
  const rule = css.slice(css.indexOf("@keyframes app-page-enter"), css.indexOf("}", ruleAt) + 1)
  check("and it animates opacity and nothing else", !/transform|filter|perspective|will-change/.test(rule), rule.replace(/\s+/g, " ").slice(0, 120))
  check("reduced motion turns it off", /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.app-page-enter \{\s*\n\s*animation: none;/.test(css))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
