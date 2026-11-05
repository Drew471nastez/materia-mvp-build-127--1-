/**
 * ===========================================================================
 *  ROUND 49: CREATOR PAGES, PRODUCT PAGES AND EXPLORE, ONE HTML FOR EVERYBODY
 * ===========================================================================
 * Round 48 let the CDN hold a stranger's storelib.com/<handle> and sent
 * everybody else to a personal address by a rewrite; on Vercel the CDN keys
 * its copy on the address the browser asked for, so signed in visitors and
 * buyers were served the stranger's copy (reverted, 244bdca). Round 49 makes
 * the page the same for everybody instead, and lets the CDN hold it for
 * everybody. What this suite pins:
 *
 *   1. NOTHING IN THE RENDER ASKS WHO IS LOOKING: no cookies(), no
 *      headers(), no session client, no currentUserForRequest in the pages
 *      or the loaders they read through.
 *   2. WHAT WAS SOMEBODY'S IS ASKED AFTER LOAD, AND THE SERVER'S HTML IS THE
 *      VISITOR'S: the owner's controls (OwnerOnly draws everybody's version
 *      on the server), the buyer's Contact, Download and the guest buyer's
 *      row, a member's link, For you; each from a private route that reads
 *      the real session.
 *   3. THE CDN RULES ARE THE SAME FOR EVERY REQUEST (cookies, Referer) and
 *      never apply to an RSC request, the editor's canvas or a scheme
 *      preview, or off storelib.com.
 *   4. A LANGUAGE IS AN ADDRESS: the proxy's 307 to ?lang= decides as the
 *      page used to.
 *   5. A SAVE TAKES THE COPY DOWN: data expired (not stale), the CDN tag the
 *      config names, the path; wired into every save that changes the page.
 *
 * The bytes themselves are measured on a production build by
 * scripts/check-creator-page-cache.mjs (stranger, signed in, owner, buyer: identical
 * HTML; each sees their own UI after hydration in Chromium).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { createRequire } from "node:module"
import { stripComments } from "./_source"
const require = createRequire(join(process.cwd(), "package.json"))

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
const code = (p: string) => stripComments(read(p))

async function main() {
  console.log("\n1. Nothing in the render asks who is looking")
  {
    const RENDER = [
      "app/(storelib)/(marketing)/[sellername]/page.tsx",
      "app/(storelib)/(marketing)/[sellername]/layout.tsx",
      "app/(storelib)/(marketing)/[sellername]/[productSlug]/page.tsx",
      "app/(storelib)/(marketing)/u/[username]/page.tsx",
      "app/(storelib)/(marketing)/u/[username]/layout.tsx",
      "app/(storelib)/(marketing)/p/[slug]/page.tsx",
      "app/(storelib)/(marketing)/layout.tsx",
      "app/(storelib)/(marketing)/explore/page.tsx",
      "app/(storelib)/(marketing)/explore/layout.tsx",
      "app/(storelib)/(marketing)/explore/[category]/page.tsx",
      "components/platform/product-page-frame.tsx",
      "lib/commerce/creator-page-data.ts",
      "lib/commerce/product-page-data.ts",
      "lib/markets/creator-page-language.ts",
      "lib/store-builder/get-published-config.ts",
      "lib/profile/storefront-gate.ts",
    ]
    for (const f of RENDER) {
      const src = code(f)
      const hits = [
        /\bcookies\s*\(/.test(src) && "cookies()",
        /\bheaders\s*\(\s*\)/.test(src) && "headers()",
        /from "next\/headers"/.test(src) && "next/headers",
        /from "@\/lib\/supabase\/server"/.test(src) && /\bcreateClient\s*\(/.test(src) && "the session's Supabase client",
        /currentUserForRequest|readCurrentUser|getUser\s*\(/.test(src) && "who is signed in",
        /requestMayHaveSession/.test(src) && "requestMayHaveSession",
        /teamStoreIdFor|hasBoughtFromCreator|heldGrants|guestAccessCookieFrom/.test(src) && "a per-viewer read",
      ].filter(Boolean)
      check(`${f}: no ${["cookies()", "headers()", "session"].join(", ")}`, hits.length === 0, hits)
    }
    check("the pages read through the anon key with no session (createPublicReadClient)", /createPublicReadClient\(\)/.test(code("app/(storelib)/(marketing)/u/[username]/page.tsx")) && /const stranger = \(\) => createPublicReadClient\(\)/.test(code("lib/commerce/creator-page-data.ts")) && /const stranger = \(\) => createPublicReadClient\(\)/.test(code("lib/commerce/product-page-data.ts")))
    check("  nothing published is answered from the shared copy for everybody (no session branch)", /if \(cached === null\) return null/.test(code("lib/commerce/creator-page-data.ts")) && (code("lib/commerce/product-page-data.ts").match(/if \(shared === null\) return null/g) ?? []).length === 2)
    check("the creator page's language is the address's alone", /const code = find\(asked\) \?\? langs\.defaultLanguage/.test(code("lib/markets/creator-page-language.ts")))
    check("the product page no longer re-asks the server after load (ViewerSync)", !/ViewerSync/.test(code("app/(storelib)/(marketing)/p/[slug]/page.tsx")))
    check("Explore hands everybody the plain interests", /interests=\{EMPTY_INTERESTS\}/.test(code("app/(storelib)/(marketing)/explore/page.tsx")))
  }

  console.log("\n2. What was somebody's is asked after load; the server's HTML is the visitor's")
  {
    const viewer = await import("@/components/storefront/creator-page-viewer")
    const { OwnerOnly, CreatorPageViewerProvider, useContactShown, useCreatorPageOwner } = viewer
    const Probe = () => createElement("i", null, `owner=${useCreatorPageOwner()} given=${useCreatorPageOwner(true)} contact=${useContactShown()}`)
    const html = renderToString(
      createElement(CreatorPageViewerProvider, { creatorId: "22222222-2222-4222-8222-222222222222", children: [
        createElement(OwnerOnly, { key: "a", fallback: createElement("b", null, "visitor bar"), children: createElement("b", null, "owner bar") }),
        createElement(Probe, { key: "b" }),
      ] }),
    )
    check("the server draws everybody's version (OwnerOnly's fallback), never the owner's", html.includes("visitor bar") && !html.includes("owner bar"), html)
    check("  no owner and no Contact on the server; a caller's own answer (the editor's canvas) still stands", html.includes("owner=false given=true contact=false"), html)
    const bare = renderToString(createElement(Probe))
    check("  outside a creator page the hooks answer what the caller decided (Contact shown, owner as given)", bare.includes("owner=false given=true contact=true"), bare)

    const page = code("app/(storelib)/(marketing)/u/[username]/page.tsx")
    check("the creator page is wrapped in the viewer provider (both branches)", (page.match(/<CreatorPageViewerProvider creatorId=\{creator\.id\}>/g) ?? []).length === 2)
    check("  Edit profile and the owner menu, the subscribe bar's pencil and the first product line are OwnerOnly", /<OwnerOnly>\s*<div className="flex items-center gap-2" style=\{OWNER_FADE_IN\}>/.test(page) && /<OwnerOnly\s+fallback=\{\s*<SubscribeBar/.test(page) && (page.match(/<OwnerOnly><FirstProductPrompt/g) ?? []).length === 2)
    check("  Edit about takes the owner's typed address from the private route, never from the page", (page.match(/<EditAboutButtonForOwner/g) ?? []).length === 2 && !/contactEmail=\{headerSettings/.test(page) && /contactEmail=\{contactEmail \?\? ""\}/.test(code("components/storefront/owner-controls-lazy.tsx")))
    check("  no viewerIsOwner or isOwner is decided on the server", !/viewerIsOwner|isOwner=/.test(page))
    check("  the Contact handle is public and the link is drawn for a buyer only", /const publicContactHandle = profile\.username \|\| username/.test(page) && /\{contactHandle && contactShown && \(/.test(code("components/store-builder/unified-section-renderer.tsx")))
    check("  Arrange and the card menus follow the page's answer", /const viewerIsOwner = useCreatorPageOwner\(ownerGiven\)/.test(code("components/store-builder/unified-section-renderer.tsx")) && /const isOwner = useCreatorPageOwner\(ownerGiven\)/.test(code("components/storefront/all-products-grid.tsx")))

    const route = code("app/api/creator-page/viewer/route.ts")
    check("/api/creator-page/viewer: private, the page's own owner test (or a team member), a buyer, the typed address to the owner only", /"Cache-Control": "private, no-store"/.test(route) && /row\.user_id === user\.id \|\| teamStore === row\.id/.test(route) && /teamStoreIdFor\(user\.id, "creator_pages"\)/.test(route) && /hasBoughtFromCreator\(supabase, user\.id, row\.id\)/.test(route) && /const contactEmail = owner \? await loadTypedContactEmail\(row\.id\) : null/.test(route))
    check("  a stranger's browser asks nothing (the session cookie hint)", /if \(!mayBeSignedIn\(\)\) return/.test(code("components/storefront/creator-page-viewer.tsx")))

    const { mayBeSignedIn, mayOwnAsGuest } = await import("@/lib/auth/session-hint")
    check("session hint: a Supabase session cookie, whole or chunked", mayBeSignedIn("a=1; sb-abcd-auth-token=xyz") && mayBeSignedIn("sb-abcd-auth-token.0=xyz") && !mayBeSignedIn("storelib_consent=1") && !mayBeSignedIn("sb-abcd-auth-token="))
    check("  guest hint: sl_owned_hint=1 only", mayOwnAsGuest("sl_owned_hint=1") && mayOwnAsGuest("x=2; sl_owned_hint=1; y=3") && !mayOwnAsGuest("sl_owned_hint=0") && !mayOwnAsGuest("sl_owned=abc"))

    const product = code("app/(storelib)/(marketing)/p/[slug]/page.tsx")
    check("the product page draws as for a stranger: not purchased, no files of anybody's, Join for everybody", /const hasPurchased = false/.test(product) && /const purchasedVariantIds: string\[\] = \[\]/.test(product) && /membershipForProductPage\(product\.id, null\)/.test(product) && !/isLoggedIn=\{!!user\}/.test(product))
    check("  the owned row is the browser's: library, or the guest buyer's own (OwnedActions)", (product.match(/<OwnedActions/g) ?? []).length === 2 && !/GuestOwnedActions/.test(product))
    const hook = code("components/checkout/use-purchase-status.tsx")
    check("  the purchase check asks for a session, a guest purchase or a stored receipt, and only then", /if \(mayBeSignedIn\(\) \|\| mayOwnAsGuest\(\)\) return true/.test(hook) && /if \(!worthAsking\(productId\)\) \{\s*setIsChecking\(false\)/.test(hook))
    check("  and keeps Loading until it answers, so a buyer never sees Buy first", /if \(!worthAsking\(productId\)\) setIsChecking\(false\)/.test(hook) && /useState\(!serverHasPurchased\)/.test(hook))
    check("  one question per product and view, however many parts ask", /const verifying = new Map/.test(hook))
    const verify = code("app/api/purchases/verify/route.ts")
    check("/api/purchases/verify answers a member's link only to them, privately, and still says nothing about a person", /askMembership && signedInUser \?/.test(verify) && /"Cache-Control": "private, no-store"/.test(verify) && !/buyer_email|maskAddress/.test(verify))
    const guest = code("app/api/purchases/guest-owned/route.ts")
    check("/api/purchases/guest-owned: the guest row from the signed cookie only, never when the account owns it, private", /heldGrants\(admin, guestAccessFromCookieHeader\(request\.headers\.get\("cookie"\)\), \{ productId \}\)/.test(guest) && /\.from\("entitlements"\)\.select\("id"\)\.eq\("buyer_id", user\.id\)/.test(guest) && /"Cache-Control": "private, no-store"/.test(guest))
    check("  asked only by a browser with the guest hint, after the check says owned", /if \(data\.hasPurchased && mayOwnAsGuest\(\)\) \{/.test(hook))
    const wrapper = code("components/checkout/purchase-status-wrapper.tsx")
    check("  the buy box hands it down and a member sees Loading, not Join, while it is asked", /<PurchaseViewerContext\.Provider value=\{\{ guest, signedIn \}\}>/.test(wrapper) && /\{isChecking \? \(/.test(wrapper) && /\{ membership: !!membership \}/.test(wrapper))

    const explore = code("components/explore/explore-page-client.tsx")
    check("Explore asks /api/explore/interests after load, signed in only, and moves to For you on enough", /fetch\("\/api\/explore\/interests"/.test(explore) && /if \(serverInterests\.enough \|\| !mayBeSignedIn\(\)\) return/.test(explore) && /if \(live && d\?\.interests\?\.enough\) setInterests\(d\.interests\)/.test(explore))
    const interests = code("app/api/explore/interests/route.ts")
    check("  the same rules (personal setting, 1.5s ceiling), private", /personalizationOn\(user\.id/.test(interests) && /INTERESTS_WAIT_MS = 1_500/.test(interests) && /"Cache-Control": "private, no-store"/.test(interests))
  }

  console.log("\n3. The CDN rules are the same for every request")
  {
    const SUPA = "https://abcdefghijkl.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA
    const { pathToFileURL } = await import("node:url")
    const config = await import(`${pathToFileURL(join(ROOT, "next.config.mjs")).href}?cdn49=${Date.now()}`)
    const rules = (await config.default.headers()) as { source: string; has?: object[]; missing?: object[]; headers: { key: string; value: string }[] }[]
    const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match") as { getPathMatch: (p: string, o?: object) => (path: string) => Record<string, string> | false }
    const { matchHas } = require("next/dist/shared/lib/router/utils/prepare-destination") as { matchHas: (req: object, query: object, has?: object[], missing?: object[]) => unknown }
    const answer = (path: string, o: { host?: string; cookies?: Record<string, string>; headers?: Record<string, string>; query?: Record<string, string> } = {}) => {
      const cookie = Object.entries(o.cookies ?? {}).map(([k, v]) => `${k}=${v}`).join("; ")
      const req = { headers: { host: o.host ?? "storelib.com", ...(cookie ? { cookie } : {}), ...(o.headers ?? {}) } }
      const out: Record<string, string> = {}
      for (const r of rules) {
        const params = getPathMatch(r.source)(path)
        if (!params) continue
        if (!matchHas(req, o.query ?? {}, r.has as object[], r.missing as object[])) continue
        for (const h of r.headers) out[h.key.toLowerCase()] = h.value.replace(/:(\w+)/g, (_, k: string) => params[k] ?? `:${k}`)
      }
      return out
    }
    /* Changed on purpose (r54): five minutes fresh and a day stale (tests/cdn-r54). */
    const EDGE = "public, s-maxage=300, stale-while-revalidate=86400"
    const session = "sb-abcdefghijkl-auth-token"
    const visitors: Record<string, Parameters<typeof answer>[1]> = {
      stranger: {},
      "signed in (session)": { cookies: { [session]: "x" } },
      "a chunked session": { cookies: { [`${session}.0`]: "x" } },
      "a guest buyer (sl_owned)": { cookies: { sl_owned: "x", sl_owned_hint: "1" } },
      "a chosen language (sl_lang)": { cookies: { sl_lang: "fr" } },
      "a team member (sl_team_store)": { cookies: { sl_team_store: "x" } },
      "from a page of ours (Referer)": { headers: { referer: "https://storelib.com/community/x" } },
    }
    for (const path of ["/andrewrullz", "/andrewrullz/tech-house-master-bundle-2026", "/explore", "/explore/music"]) {
      const all = Object.entries(visitors).map(([who, o]) => [who, JSON.stringify(answer(path, o))] as const)
      check(`${path}: one answer for every visitor`, new Set(all.map(([, a]) => a)).size === 1, all)
      check(`  held by Vercel's CDN (Vercel-CDN-Cache-Control), never a browser`, answer(path)["vercel-cdn-cache-control"] === EDGE && answer(path)["cache-control"] === undefined, answer(path))
    }
    check("tagged by the address's handle, which the purge names", answer("/andrewrullz")["vercel-cache-tag"] === "creator-page-andrewrullz" && answer("/andrewrullz/x")["vercel-cache-tag"] === "creator-page-andrewrullz" && answer("/explore")["vercel-cache-tag"] === "explore")
    check("  never an RSC request (a client side move, a prefetch)", answer("/andrewrullz", { headers: { rsc: "1" } })["vercel-cdn-cache-control"] === undefined && answer("/explore", { headers: { rsc: "1" } })["vercel-cdn-cache-control"] === undefined)
    check("  never the editor's canvas or a scheme being tried", answer("/andrewrullz", { query: { embedded: "1" } })["vercel-cdn-cache-control"] === undefined && answer("/andrewrullz", { query: { scheme: "dark" } })["vercel-cdn-cache-control"] === undefined)
    check("  a language is its own address and is held like any other", answer("/andrewrullz", { query: { lang: "fr" } })["vercel-cdn-cache-control"] === EDGE)
    check("  only on storelib.com", answer("/x", { host: "andrewrullz.storelib.com" })["vercel-cdn-cache-control"] === undefined && answer("/x", { host: "shop.example.com" })["vercel-cdn-cache-control"] === undefined && answer("/x", { host: "evil-localhost.example" })["vercel-cdn-cache-control"] === undefined && answer("/x", { host: "www.storelib.com" })["vercel-cdn-cache-control"] === EDGE)
    for (const path of ["/pricing", "/app", "/app/products", "/u/andrewrullz", "/p/x", "/robots.txt", "/andrewrullz/links", "/community/x", "/a/b/c", "/api/creator-page/viewer", "/checkout/x", "/library"]) {
      check(`  not one of these pages, no CDN rule: ${path}`, answer(path)["vercel-cdn-cache-control"] === undefined, answer(path))
    }
    check("no cookie-keyed rule is left (round 48's stranger and personal rules)", !rules.some((r) => JSON.stringify([r.has, r.missing]).includes('"cookie"') && /andrew|handle|explore/.test(r.source + JSON.stringify(r.headers))) && !/CREATOR_PAGE_PERSONAL_COOKIES|EXPLORE_SIGNED_IN_COOKIES/.test(read("next.config.mjs")))
    const shared = await import("@/lib/storefront/shared-view")
    const paths = ["/andrewrullz", "/andrewrullz/p", "/andrewrullz/links", "/pricing", "/app", "/a.png", "/a/b/c", "/u/x", "/p/x", "/community/x", "/sitemap.xml", "/appx", "/pricing2/x"]
    const disagree = paths.filter((p) => shared.isCreatorPagePath(p) !== (answer(p)["vercel-cdn-cache-control"] === EDGE))
    check("  the proxy and the config agree on which addresses are creator pages", disagree.length === 0, disagree)
    const proxy = code("proxy.ts")
    check("the proxy rewrites nobody to a personal address any more (round 48's ?_pv=1)", !/PERSONAL_VIEW_PARAM|isPersonalRequest|_pv/.test(proxy))
    const held = (path: string, o: { method?: string; rsc?: boolean; q?: string } = {}) => shared.isEdgeHeldRequest({ method: o.method ?? "GET", pathname: path, rsc: !!o.rsc, search: new URLSearchParams(o.q ?? "") })
    const heldPaths = ["/andrewrullz", "/andrewrullz/p", "/explore", "/explore/music", "/pricing", "/app", "/andrewrullz/links", "/u/x", "/p/x"]
    const heldDisagree = heldPaths.filter((p) => held(p) !== (answer(p)["vercel-cdn-cache-control"] === EDGE)) .concat(held("/andrewrullz", { rsc: true }) || held("/andrewrullz", { q: "embedded=1" }) || held("/andrewrullz", { q: "scheme=dark" }) || held("/andrewrullz", { method: "POST" }) ? ["rsc/embedded/scheme/POST"] : [])
    check("an answer the CDN keeps: the proxy's test is the config's, address for address", heldDisagree.length === 0, heldDisagree)
    check("  and for it the proxy renews no session and adds no cookie or per-visitor header (it returns before them)", /isEdgeHeldRequest\(\{ method: request\.method, pathname, rsc: request\.headers\.has\("rsc"\), search: request\.nextUrl\.searchParams \}\)\) \{\s*return supabaseResponse\s*\}/.test(proxy) && proxy.indexOf("isEdgeHeldRequest({") < proxy.indexOf("skipsSessionRefresh(pathname, cookieNames)") && proxy.indexOf("isEdgeHeldRequest({") < proxy.indexOf("retireDomainScopedCookies(redirect"))
  }

  console.log("\n4. A language is an address")
  {
    const { creatorPageLanguageStep } = await import("@/lib/markets/creator-page-language-step")
    const base = { method: "GET", dest: "document", accept: "text/html,*/*", userAgent: "Mozilla/5.0 (iPhone)", asked: false, chosen: null, visitorLanguage: false, defaultLanguage: "en", others: ["fr", "pt-BR"], acceptLanguage: "fr-FR,fr;q=0.9" }
    check("a chosen language the store publishes: sent there", creatorPageLanguageStep({ ...base, chosen: "fr" }) === "fr")
    check("  one it does not publish, or its own: nowhere", creatorPageLanguageStep({ ...base, chosen: "de" }) === null && creatorPageLanguageStep({ ...base, chosen: "en" }) === null)
    check("the browser's language, only in a store that shows visitors their own", creatorPageLanguageStep(base) === null && creatorPageLanguageStep({ ...base, visitorLanguage: true }) === "fr")
    check("  a near match (pt-PT reads pt-BR)", creatorPageLanguageStep({ ...base, visitorLanguage: true, acceptLanguage: "pt-PT" }) === "pt-BR")
    check("  a choice wins over the browser", creatorPageLanguageStep({ ...base, visitorLanguage: true, chosen: "en" }) === null)
    check("never a crawler, a script, a POST, an address that names a language, a store with one language", creatorPageLanguageStep({ ...base, chosen: "fr", userAgent: "Googlebot/2.1" }) === null && creatorPageLanguageStep({ ...base, chosen: "fr", dest: "script" }) === null && creatorPageLanguageStep({ ...base, chosen: "fr", method: "POST" }) === null && creatorPageLanguageStep({ ...base, chosen: "fr", asked: true }) === null && creatorPageLanguageStep({ ...base, chosen: "fr", others: [] }) === null)
    const proxy = code("proxy.ts")
    check("the proxy sends it with a 307 nobody stores, to ?lang=, for /<handle> only", /to\.searchParams\.set\("lang", language\.toLowerCase\(\)\)/.test(proxy) && /NextResponse\.redirect\(to, 307\)/.test(proxy) && /r\.headers\.set\("Vercel-CDN-Cache-Control", "no-store"\)/.test(proxy) && /isCreatorPagePath\(pathname\) && pathname\.replace\(\/\\\/\+\$\/, ""\)\.split\("\/"\)\.length === 2 && !request\.nextUrl\.searchParams\.has\("lang"\)/.test(proxy))
  }

  console.log("\n5. A save takes the copy down")
  {
    const purge = await import("@/lib/storefront/creator-page-purge")
    const seen: string[] = []
    await purge.creatorPagesChanged({ creatorId: "c1", userId: "u1", handle: "Andrew", tags: ["product:loop"] }, { expire: (t) => seen.push(`tag ${t}`), path: (p) => seen.push(`path ${p}`) })
    const want = ["tag product:loop", "tag creator:c1", "tag creator:u1", "tag shop-layout:andrew", "tag creator-page-Andrew", "path /Andrew", "tag creator-page-andrew", "path /andrew"]
    check("data expired first (the caller's tags, the creator, the person, the layout), then the CDN by tag and by path, as stored and lower case", JSON.stringify(seen) === JSON.stringify(want), seen)
    check("  expired, not marked stale (a render after the purge must read fresh rows)", /revalidateTag\(tag, \{ expire: 0 \}\)/.test(code("lib/storefront/creator-page-purge.ts")) && /revalidatePath\(path, "layout"\)/.test(code("lib/storefront/creator-page-purge.ts")))
    check("  the tag is the one next.config.mjs sends", purge.creatorPageCdnTag("x") === "creator-page-x" && /'creator-page-:handle'/.test(read("next.config.mjs")))
    const wired: [string, RegExp][] = [
      ["a product save (/api/revalidate), with the product's own rows", /await creatorPagesChanged\(\{ creatorId: owned\.creator_id, tags: \[productTag\(slug\), productTag\(owned\.id\)\] \}\)/],
      ["a creator page publish (/api/store-builder)", /await creatorPagesChanged\(\{ creatorId: creator\.id \}\)/],
      ["a cover", /await creatorPagesChanged\(\{ userId: user\.id \}\)/],
      ["a name, photo or bio (identityChanged)", /expireCreatorPages: \(userId\) => creatorPagesChanged\(\{ userId \}\)/],
      ["the store's currency", /await creatorPagesChanged\(\{ creatorId \}\)/],
      ["a course's outline", /await creatorPagesChanged\(\{ creatorId: owner\.creatorId, tags: \[productTag\(owner\.productId\)\] \}\)/],
      ["the internal invalidation (price, stock, publish from the database side)", /await creatorPagesChanged\(\{ creatorId: b\.creatorId, tags: \[\.\.\.b\.productIds, \.\.\.b\.slugs\]\.map\(productTag\) \}\)/],
      ["a review", /void creatorPagesChanged\(\{ creatorId: ids\.creatorId/],
      ["a product deleted, archived or taken down (purgeProductCaches)", /void creatorPagesChanged\(\{ creatorId, handle, tags:/],
      ["a product taken off the creator page (sales channels)", /await creatorPagesChanged\(\{ creatorId: c\.creatorId \}\)/],
    ]
    const files: Record<string, string> = {
      "a product save (/api/revalidate), with the product's own rows": "app/api/revalidate/route.ts",
      "a creator page publish (/api/store-builder)": "app/api/store-builder/route.ts",
      "a cover": "app/api/profile/cover/route.ts",
      "a name, photo or bio (identityChanged)": "lib/account/identity-caches.ts",
      "the store's currency": "app/api/store/currency/route.ts",
      "a course's outline": "app/api/courses/manage/route.ts",
      "the internal invalidation (price, stock, publish from the database side)": "app/api/internal/invalidate/route.ts",
      "a review": "lib/reviews/store.ts",
      "a product deleted, archived or taken down (purgeProductCaches)": "lib/products/forget-product.ts",
      "a product taken off the creator page (sales channels)": "app/api/store/channels/product/route.ts",
    }
    for (const [what, re] of wired) check(`  wired: ${what}`, re.test(code(files[what])))
    check("Explore's copy goes when a product is taken down", /revalidateTag\("explore", \{ expire: 0 \}\)/.test(code("lib/explore/catalogue-cache.ts")))
  }

  console.log("\n6. SEO is drawn on the server, unchanged")
  {
    const page = code("app/(storelib)/(marketing)/u/[username]/page.tsx")
    check("canonical, robots and the share card from generateMetadata, read as a stranger", /canonical: pageUrl/.test(page) && /creatorIndexable\(\{ publishedProducts, handle, spamState \}\)/.test(page))
    check("  JSON-LD (ProfilePage and BreadcrumbList) in the server HTML when indexable", /jsonLdScript\(profileJsonLd\)/.test(page) && /jsonLdScript\(breadcrumbJsonLd\)/.test(page))
    const product = code("app/(storelib)/(marketing)/p/[slug]/page.tsx")
    check("the product page's JSON-LD is still drawn on the server", /jsonLdScript\(productJsonLd\)/.test(product))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
