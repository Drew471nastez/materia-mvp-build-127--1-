/**
 * ===========================================================================
 *  THE TWO IMPROVEMENTS, AND THE RULES THEY MUST NOT BREAK
 * ===========================================================================
 * 1. A button you fill and never name the label of is caught at SAVE, with
 *    the line, like every other mistake in a section file.
 * 2. The preview has an address of its own, so the public routes read no
 *    query string and a published site can be held at the edge.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { readdirSync } from "node:fs"
import { isPreviewTokenShaped } from "@/lib/website-builder/preview-token"

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

const withCss = (css: string) =>
  `<template><section class="s"><a class="s__btn" href="#">Go</a></section></template>
<style>${css}</style>
<schema>{"type":"t","name":"T","settings":[]}</schema>`
const compiles = (css: string) => compileSection(withCss(css), { file: "sections/t.storelib", expectType: "t" }).ok === true
const errorsFor = (css: string) => {
  const r = compileSection(withCss(css), { file: "sections/t.storelib", expectType: "t" })
  return r.ok === false ? r.errors : []
}

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("A filled button with no label colour is refused, at the line")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const errs = errorsFor(".s__btn { background: #fff; padding: 8px }")
    check("it is refused", errs.length === 1)
    check("and it says which rule", errs[0]?.message.includes(".s__btn"), errs[0]?.message)
    check("and points at the line", typeof errs[0]?.line === "number", JSON.stringify(errs[0]))
    check("and names the variable to reach for", errs[0]?.message.includes("--s-btn-text"))

    check("naming the colour is enough", compiles(".s__btn { background: #fff; color: #111 }"))
    check("the scheme's own variables are fine", compiles(".s__btn { background: var(--s-btn); color: var(--s-btn-text) }"))
    check("background-color counts as a fill", !compiles(".my-button { background-color: #0a0 }"))
    check("and so does a shorthand with an image in it", !compiles(".btn { background: #fff url(x) }"))
  }

  section("And it keeps quiet about everything that is not that")
  {
    /**
     * A check that shouts about rules people write on purpose is a check
     * people learn to work around, so it is narrow: only a real fill, only
     * on something that says it is a button, never on a state or a part.
     */
    check("transparent is not a fill", compiles(".s__btn { background: transparent; border: 1px solid }"))
    check("nor is none, inherit or unset", compiles(".s__btn { background: none }") && compiles(".s__btn { background: inherit }"))
    check("a hover state changes one thing and inherits the rest", compiles(".s__btn:hover { background: #eee }"))
    check("so does focus", compiles(".s__btn:focus-visible { background: #eee }"))
    check("a part is not the button", compiles(".s__btn::before { background: #fff }"))
    check("and a card is none of its business", compiles(".card { background: #fff }"))
    check("nor is a rule that only sets a border", compiles(".s__btn { border-color: #fff }"))

    /** The 32 that ship are the real regression test. */
    const dir = "themes/default/sections"
    const broke = readdirSync(join(root, dir)).filter((f) => f.endsWith(".storelib")).filter((f) => {
      const t = f.replace(/\.storelib$/, "")
      return compileSection(read(`${dir}/${f}`), { file: `sections/${f}`, expectType: t }).ok === false
    })
    check(`every shipped section still compiles (${readdirSync(join(root, dir)).filter((f) => f.endsWith(".storelib")).length} files)`, broke.length === 0, broke.join(", "))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The preview has an address of its own")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const home = read("app/(site)/w/[username]/preview/[token]/page.tsx")
    const sub = read("app/(site)/w/[username]/preview/[token]/[page]/page.tsx")
    const api = read("app/api/website-builder/themes/[installId]/preview/route.ts")
    const panel = read("components/website-builder/publish-panel.tsx")

    check("the token is a path segment", /params: Promise<\{ username: string; token: string/.test(home))
    check("a segment that is not token-shaped is not a page", /if \(!tokenOf\(token\)\) return \{ title: "Not Found"/.test(home) && /const clean = tokenOf\(token\)\s*\n\s*if \(!clean\) notFound\(\)/.test(home))
    check("it is never indexed", /robots: \{ index: false, follow: false \}/.test(home) && /robots: \{ index: false, follow: false \}/.test(sub))
    check("it is never cached", /export const dynamic = "force-dynamic"/.test(home) && /export const dynamic = "force-dynamic"/.test(sub))
    check("sub-pages have one too", /pageKeyFromSegment\(page\)/.test(sub))
    check("the link that is handed out is the path form", /\$\{origin\.replace\(\/\\\/\$\/, ""\)\}\/preview\/\$\{token\}/.test(api) && /\$\{websiteUrl\.replace\(\/\\\/\$\/, ""\)\}\/preview\/\$\{previewToken\}/.test(panel))

    /**
     * Every link already shared is `?preview=`. The public page cannot read
     * the query any more — that is the whole point — so the proxy sends the
     * old shape on to the new one rather than letting it 404 into the
     * published site, which would have quietly shown the wrong thing.
     */
    const proxy = read("proxy.ts")
    check(
      "and an old query-form link is sent on to it",
      /const legacy = previewTokenFrom\(url\.searchParams\)/.test(proxy) &&
        /to\.pathname = `\/preview\/\$\{legacy\}\$\{rest\}`/.test(proxy) &&
        /NextResponse\.redirect\(to, 308\)/.test(proxy),
    )
    check(
      "recognising a token does not drag node:crypto into the proxy",
      !/^import .*node:crypto/m.test(read("lib/website-builder/preview-token.ts")) &&
        proxy.includes('from "@/lib/website-builder/preview-token"'),
    )
    check("and the shape is written down once", isPreviewTokenShaped("a".repeat(43)) && !isPreviewTokenShaped("short"))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("So a published site is actually held at the edge")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * THE PART THAT WAS MEASURED, AND THE PART THAT WAS WRONG.
     *
     * Asking for a cache in `next.config` headers or on the proxy's rewrite
     * did nothing: Next puts `private, no-cache, no-store` on a dynamically
     * rendered page itself and that wins over both. Checked against the live
     * site — `/`, `/blog` and `/explore` all came back `no-store` despite
     * having rules. So the only claim worth guarding is the one that decides
     * whether the page is dynamic at all.
     */
    const home = read("app/(site)/w/[username]/page.tsx")
    const sub = read("app/(site)/w/[username]/[page]/page.tsx")
    /**
     * Read from the last build if there is one. Without a build there is
     * nothing to check against, and saying so is better than a guard that
     * passes because the file was missing.
     */
    let manifest: { dynamicRoutes?: Record<string, unknown> } | null = null
    try { manifest = JSON.parse(read(".next/prerender-manifest.json")) } catch { manifest = null }

    check("the site routes are not force-dynamic any more", !/export const dynamic/.test(home) && !/export const dynamic/.test(sub))
    check("they are held for a minute", /export const revalidate = 60/.test(home) && /export const revalidate = 60/.test(sub))
    check("and they are registered as pages that can be cached", /generateStaticParams/.test(home) && /generateStaticParams/.test(sub))

    /**
     * The build says whether any of that worked. A route Next will cache is
     * in the prerender manifest; a route it renders fresh every time is not,
     * whatever the file says.
     */
    if (!manifest) {
      console.log("  skip  the build's own verdict — no .next/prerender-manifest.json, run a build to check it")
    } else {
      const routes = Object.keys(manifest.dynamicRoutes ?? {})
      check("the build agrees: the front page is cacheable", routes.includes("/w/[username]"), routes.join(", "))
      check("and so is every page under it", routes.includes("/w/[username]/[page]"))
      check("the preview is not, and must never be", !routes.includes("/w/[username]/preview/[token]"))
      /* Changed on purpose: the cart is the browser's (site-cart.tsx), the product is read without cookies, and a save purges the page (tests/live-speed-view). */
      check("a product page is cacheable too: nothing in it is the visitor's", routes.includes("/w/[username]/products/[slug]"))
      /**
       * Nor the shop index, for the same reason: it is a wall of prices and
       * sold-out states. The catalogue behind both is cached for a minute on
       * its own, and holding the page as well would add a second minute to a
       * corrected price.
       */
      /* Changed on purpose (round X1): a product saved purges every rendered page of the site (revalidatePublishedPages), so the minute no longer stacks; the shop and a collection with no filter are held, and the filtered twin is drawn per request (lib/website-builder/held-list.ts). */
      check("the shop index with no filter is held too, and its filtered twin is not", routes.includes("/w/[username]/products") && !routes.includes("/w/[username]/products/~list") && routes.includes("/w/[username]/collections/[handle]") && !routes.includes("/w/[username]/collections/[handle]/~list"))
    }

    /**
     * A published site could not be cached while it sat under the marketing
     * layout, which reads `cookies()` for a wishlist badge and `headers()`
     * for the host. One dynamic read in a layout makes every route beneath
     * it dynamic, which is why the config's rules had never landed on
     * anything.
     */
    check("nothing on the site's layout asks who is looking", !/next\/headers/.test(read("app/(site)/layout.tsx")))
    /* Changed on purpose (the owner: marketing pages served from the CDN).
       The marketing layout asks nothing about the request any more, so the
       pages under it that ask nothing either are static; the ones that need
       the visitor (/explore, a product, a creator page) read it themselves.
       lib/platform/header-props keeps the reads for the account and receipt
       layouts, which are per visitor anyway. */
    const marketingLayout = read("app/(storelib)/(marketing)/layout.tsx")
    check(
      "the marketing layout reads no request data, so the pages under it can be static",
      !/readWishlistCount\(\)|isPlatformDomain\(\)|next\/headers|cookies\(\)|headers\(\)/.test(marketingLayout) &&
        /next\/headers/.test(read("lib/platform/header-props.ts")),
    )

    /**
     * And a cache nobody purges is a creator staring at their old site. The
     * data tag was already purged on publish; the RENDERED page was not.
     */
    const pub = read("lib/website-builder/published-site.ts")
    check("publishing purges the rendered page, not just the data under it", /revalidatePath\(`\/w\/\$\{name\}`, "layout"\)/.test(pub) && /revalidateTag\(creatorSiteTag\(creatorId\)/.test(pub))
    check("and a name it cannot find does not fail the publish", /\} catch \{\s*\n\s*\/\/ A purge that cannot find the name/.test(pub))

    /**
     * The CREATOR page is the opposite: an Edit button, owner menus, a follow
     * state. Mixing the two up would serve one visitor's rendering to
     * another, so it stays where it is and stays private.
     */
    /**
     * The homepage is the one site path that collides with a `next.config`
     * rule (`/`, meant for the marketing site), so the proxy overrides it on
     * the rewrite. That header is now the one the edge obeys there, so it has
     * to be the same number the route revalidates on, or the front page and
     * the pages under it go stale on different clocks.
     */
    check(
      "the homepage's own header agrees with the route's revalidate",
      /rewritten\.headers\.set\("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300"\)/.test(read("proxy.ts")) &&
        /export const revalidate = 60/.test(home),
    )
    check("the creator page is still private", /rewritePath\.startsWith\("\/u\/"\)[\s\S]{0,200}"private, no-cache, must-revalidate"/.test(read("proxy.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
