/**
 * ===========================================================================
 *  THE CREATOR PAGE IS EDITED WHERE IT LIVES
 * ===========================================================================
 * "Store Builder", "Website" and "OnePage" in one menu asked somebody to work
 * out which of three things builds the page their own name points at. The
 * rename fixed the word. This is about the thing behind it.
 *
 * The old editor threw away the app shell and DREW AN APPROXIMATION of the
 * page on a canvas. An approximation is a second implementation of something
 * that already renders itself, and the drift is invisible until a creator
 * publishes something that does not look like what they arranged.
 *
 * So /app/creator-page holds the real /u/<handle>, signed in, inside the app
 * shell. What is checked here:
 *
 *   1. It is a route under /app, which is the whole of how it keeps the
 *      sidebar. A workspace that rebuilt one would be the old mistake again.
 *   2. The frame is the real page, not a copy.
 *   3. FRAMING IS NARROW. The proxy relaxes X-Frame-Options for ?embedded=1
 *      and nothing else, so the page stays unframeable at its own address.
 *   4. Embedded mode does not offer doors that lead back into itself.
 *   5. Every entry point goes to the same place, and the old addresses still
 *      answer.
 *
 * Run with:  npm run test:push
 */

import { existsSync, readFileSync } from "node:fs"
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

const read = (p: string) => readFileSync(join(root, p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")

function main() {
  console.log("\nThe creator page is edited where it lives")

  // ── 1. It is under /app, so it keeps the sidebar ───────────────────────
  {
    check("the workspace exists", existsSync(join(root, "app/app/creator-page/page.tsx")))
    /**
     * BEING UNDER /app IS THE FEATURE. app/app/layout.tsx renders AppSidebar
     * and the header; any route beneath it inherits both. A workspace that
     * rendered its own sidebar would be a second one to keep in step.
     */
    const layout = read("app/app/layout.tsx")
    check("the /app layout is what supplies the sidebar", layout.includes("<AppSidebar"))
    const workspace = strip(read("components/app/creator-page-workspace.tsx"))
    check(
      "and the workspace does not rebuild one",
      !/AppSidebar|DesktopSidebarContent/.test(workspace),
    )
  }

  // ── 2. The frame is the real page ──────────────────────────────────────
  {
    const workspace = read("components/app/creator-page-workspace.tsx")
    check("it frames the public creator page", /\/u\/\$\{encodeURIComponent\(handle\)\}\?embedded=1/.test(workspace))
    check("the handle is encoded, so a handle cannot inject a parameter", workspace.includes("encodeURIComponent(handle)"))
    check("there is a way to open the real thing", /target="_blank"/.test(workspace) && workspace.includes("View live"))
    check("and a way back to the section editor", workspace.includes('href="/creator-page"'))
    /** A frame that never says it is loading reads as a broken page. */
    check("the frame reports when it is loading", workspace.includes("onLoad={() => setLoading(false)}"))
  }

  // ── 3. Framing is narrow ───────────────────────────────────────────────
  {
    const proxy = strip(read("proxy.ts"))
    check("the proxy allows the creator page to be framed", /url\.pathname\.startsWith\("\/u\/"\)/.test(proxy))
    /**
     * THE PART THAT MATTERS. vercel.json sends X-Frame-Options: DENY on every
     * path and frame-ancestors overrides it, so this exception has to be the
     * narrowest possible one: our own origin, and only with ?embedded=1.
     * Widening it would let any site frame every creator page on Storelib.
     */
    check(
      "only with ?embedded=1",
      /url\.searchParams\.get\("embedded"\) === "1"/.test(proxy),
    )
    check(
      "and only by us",
      proxy.includes(`frame-ancestors 'self'`) && !/frame-ancestors \*|frame-ancestors '\*'/.test(proxy),
    )
  }

  // ── 4. Embedded mode offers no door into itself ────────────────────────
  {
    const page = read("app/(marketing)/u/[username]/page.tsx")
    check("the page is told when it is embedded", /const embedded = embeddedParam === "1"/.test(page))
    check("and passes it to the owner controls", /embedded=\{embedded\}/.test(page))

    const button = read("components/storefront/edit-profile-button.tsx")
    check(
      "Customize page is hidden inside the workspace, where it would nest",
      /\{!embedded && \(/.test(button),
    )
    check("but the pencil is not, because that is what edits the profile", /aria-label="Edit profile details"/.test(button))

    const menu = read("components/storefront/owner-menu.tsx")
    check(
      "app links break out of the frame instead of loading the app inside it",
      /target: "_top"/.test(menu),
    )
  }

  // ── 5. One destination, and the old addresses still answer ─────────────
  {
    const entries: Array<[string, string]> = [
      ["components/app/sidebar.tsx", "/app/creator-page"],
      ["components/app/dashboard-client.tsx", "/app/creator-page"],
      ["components/storefront/owner-menu.tsx", "/app/creator-page"],
      ["components/app/settings-form-new.tsx", "/app/creator-page"],
    ]
    for (const [file, href] of entries) {
      check(`${file} points at the workspace`, read(file).includes(href))
    }

    /**
     * A rename that breaks the old address is a removal. /store-builder is in
     * bookmarks and in links people have sent each other; /creator-page is the
     * section editor and is linked from the workspace itself.
     */
    check("the old /store-builder address still answers", existsSync(join(root, "app/store-builder/page.tsx")))
    check("and it lands on the workspace", read("app/store-builder/page.tsx").includes('redirect("/app/creator-page")'))
    check("the section editor is still a real route", existsSync(join(root, "app/creator-page/page.tsx")))

    const sidebar = read("components/app/sidebar.tsx")
    check("the sidebar no longer says Store Builder", !/label: "Store Builder"/.test(sidebar))
    check(
      "and the three publishing surfaces are in order",
      sidebar.indexOf('t("nav.creatorPage")') < sidebar.indexOf('t("nav.websiteBuilder")') &&
        sidebar.indexOf('t("nav.websiteBuilder")') < sidebar.indexOf('t("nav.onepage")'),
    )
  }

  // ── 6. Quick access lists all three surfaces ───────────────────────────
  {
    /**
     * <name>.storelib.com is the WEBSITE; storelib.com/<name> is the creator
     * PAGE. lib/url-helpers is explicit about the difference. Quick access
     * listed the page and the OnePage and stopped, so the address a creator is
     * most often asked for by somebody else was the one missing.
     */
    const dash = read("components/app/dashboard-client.tsx")
    const settings = read("components/app/settings-form-new.tsx")

    for (const [name, code] of [["the dashboard", dash], ["settings", settings]] as const) {
      check(`${name} builds the website address from the helper`, code.includes("getWebsiteUrl("))
      check(`${name} lists Website in quick access`, />Website<\/(div|p)>/.test(code))
      /**
       * PUBLISHED, NOT INSTALLED. Every account is seeded with theme installs
       * the first time it opens the website builder, so listing on existence
       * would hand people a link to a page nobody has made.
       */
      check(`${name} only shows it once something is published`, /websitePublished/.test(code))
    }

    for (const server of ["app/app/page.tsx", "app/app/settings/_server.ts"]) {
      const code = read(server)
      check(`${server} asks for a published install`, code.includes("store_theme_installs"))
      check(
        `${server} tests published_at rather than existence`,
        /\.not\("published_at", "is", null\)/.test(code),
      )
    }

    /** All three surfaces, and the page is not listed twice under two names. */
    check("the creator page is no longer called Store in quick access", !/>Store<\/(p|div)>/.test(dash + settings))
  }

  // ── 7. Editing in place: the CTA bar and a way to be contacted ─────────
  {
    const cta = read("components/storefront/edit-cta-button.tsx")
    const page = read("app/(marketing)/u/[username]/page.tsx")
    const api = read("app/api/creator-profile/route.ts")

    check("the CTA bar has an editor", existsSync(join(root, "components/storefront/edit-cta-button.tsx")))
    check("it writes through the route that already does auth and ownership", cta.includes('"/api/creator-profile"'))
    check("only the owner sees the pencil", /viewerIsOwner && \(/.test(page) && page.includes("<EditCtaButton"))
    /**
     * The bar generates its own sentence from a preset when nothing is
     * stored, so seeding the dialog from the raw value would open two empty
     * boxes on a bar that plainly says something.
     */
    check(
      "it is seeded with what the bar actually shows",
      page.includes("getDisplayText(subscribeBarSettings") && page.includes("getButtonText(subscribeBarSettings"),
    )
    check("the API accepts the two strings", api.includes("const subscribeBar = (()"))
    /**
     * The bar reads its label from a preset unless told otherwise, so writing
     * buttonText alone saves a string nothing ever reads.
     */
    check('and marks the label custom, or nothing reads it', api.includes('out.buttonTextPreset = "custom"'))

    // ── The contact link ───────────────────────────────────────────────
    const about = read("components/storefront/edit-about-button.tsx")
    const renderer = read("components/store-builder/unified-section-renderer.tsx")

    check("About can hold a contact address", about.includes('id="ea-contact"'))
    check("and the block renders it as a mailto", renderer.includes("href={`mailto:${contactEmail}`}"))
    check("only when one is set", /\{contactEmail && \(/.test(renderer))
    check("it is validated as an address before being stored", /\^\[\^\\s@\]\+@/.test(api))
    check("and clearing it removes the link", api.includes("next.contactEmail = contactEmail || undefined"))

    /**
     * THE PART THAT IS A DECISION, NOT A DETAIL. The obvious implementation of
     * "let people contact me" prints the address somebody signs in with.
     * Nobody agreed to publish that, and it is the address that resets their
     * password. It has to be a field they typed.
     */
    check(
      "the login address is never published as the contact address",
      !/user\.email/.test(renderer) && !/profile\.email/.test(renderer),
    )
    check(
      "the contact address comes from stored settings a creator typed",
      page.includes("sellerContactEmail={headerSettings.contactEmail}"),
    )
  }

  // ── 8. A new account is publishable from its first minute ─────────────
  {
    const finalize = read("app/api/onboarding/finalize/route.ts")
    const helper = read("lib/onepage/ensure-onepage.ts")
    const route = read("app/api/onepage/route.ts")

    check("onboarding publishes the creator page", finalize.includes("ensureStorePublished"))
    /**
     * THE GAP. The OnePage row was created lazily on the first visit to
     * /app/onepage, so a creator who never opened that screen had no OnePage
     * at all: no row, no slug, no address. The dashboard offered to "set up"
     * a link that could have existed on day one.
     */
    check("and creates the OnePage", finalize.includes("ensureOnePage("))
    check("published, not as a draft", helper.includes('status: "published"') && helper.includes("published_at:"))
    check("from the name and picture already gathered", helper.includes("profile?.display_name") && helper.includes("profile?.avatar_url"))

    /**
     * ONE DEFINITION. "The defaults" here are a theme, six blocks and a
     * published snapshot; a second copy is a second thing to keep in step, so
     * the screen and onboarding call the same function.
     */
    check("the OnePage screen uses the same function", route.includes("ensureOnePage("))
    check("and no longer carries its own copy of the defaults", !route.includes("const newOnepage = {"))

    /**
     * Onboarding and a first visit can race, so creating twice must not be an
     * error. The duplicate-key path was already there and is kept.
     */
    check("creating is idempotent", helper.includes("if (existing) return existing"))
    check("and survives losing a race", helper.includes('result.error.code === "23505"'))
    check("it never runs in a browser", helper.startsWith('import "server-only"'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
