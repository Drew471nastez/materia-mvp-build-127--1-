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
    check("the workspace exists", existsSync(join(root, "app/creator-page/page.tsx")))
    /**
     * FULL SCREEN, which reverses where this started. Under /app it inherited
     * the sidebar and the header, and a full-width design then had about two
     * thirds of a narrow window to render in. The sidebar was not worth that.
     */
    const workspace = strip(read("components/app/creator-page-workspace.tsx"))
    check("it does not rebuild any app chrome", !/AppSidebar|DesktopSidebarContent/.test(workspace))
    check("it takes the whole screen", workspace.includes("h-svh"))
    /**
     * With no sidebar there is no way out, so the bar carries one — and it
     * fades before navigating rather than cutting between two unrelated
     * layouts mid-paint, the way the website builder leaves its own editor.
     */
    check("and carries a way back", workspace.includes("ArrowLeft") && workspace.includes('router.push("/app")'))
    check("which fades rather than cutting", /setLeaving\(true\)/.test(workspace))

    /**
     * LEAVING AND ARRIVING ARE THE BUILDER'S OWN SCREENS, not a second pair.
     * BuilderLoader on the `.wb-leaving` glass is what the website builder
     * shows when it closes; reimplementing either is how two editors in one
     * product end up feeling like two products.
     */
    check("leaving uses the builder's glass", workspace.includes('className="wb-leaving"'))
    check("and the builder's loader", workspace.includes("BuilderLoader"))
    check("arriving has a loading screen at all", existsSync(join(root, "app/creator-page/loading.tsx")))
    check(
      "on the same ground the editor uses, not white then dark",
      read("app/creator-page/loading.tsx").includes("#131316") && workspace.includes("bg-[#131316]"),
    )

    /**
     * THE CANVAS. A page rendered edge to edge inside another page has no
     * edges of its own, so nothing says where the thing being edited stops
     * and the tool starts.
     */
    check("the page sits on a canvas with its own edges", /rounded-xl border border-white/.test(workspace))
    check("inset on every side, so the gap is deliberate", /flex-1 overflow-hidden p-2/.test(workspace))
    check("and the bar is dark", workspace.includes("bg-[#18181c]"))

    // The colour scheme, from the bar.
    const api = read("app/api/creator-profile/route.ts")
    check("the scheme can be changed without leaving", workspace.includes("applyScheme"))
    check("each row is painted in its own scheme", workspace.includes("theme.colors.background"))
    check("it writes through the route that already does auth", /applyScheme[\s\S]{0,600}\/api\/creator-profile/.test(workspace))
    check("and the frame reloads so it is the real thing", /applyScheme[\s\S]{0,900}setNonce/.test(workspace))
    /** An unknown name would leave a page resolving a theme that does not exist. */
    check("an unknown preset cannot be stored", api.includes("raw in themePresets"))
    check("and it lands in globalSettings, where the page reads it", api.includes("globalSettings"))
    /** The setup widget floated over the page; it stays out of both addresses. */
    const sidebar2 = read("components/app/sidebar.tsx")
    check(
      "the setup widget is not shown over the creator page",
      sidebar2.includes('!pathname.startsWith("/creator-page")') &&
        sidebar2.includes('!pathname.startsWith("/app/creator-page")'),
    )
  }

  // ── 2. The frame is the real page ──────────────────────────────────────
  {
    const workspace = read("components/app/creator-page-workspace.tsx")
    check("it frames the public creator page", /\/u\/\$\{encodeURIComponent\(handle\)\}\?embedded=1/.test(workspace))
    check("the handle is encoded, so a handle cannot inject a parameter", workspace.includes("encodeURIComponent(handle)"))
    check("there is a way to open the real thing", /target="_blank"/.test(workspace) && workspace.includes("View live"))
    /**
     * NO DOOR INTO THE SECTION BUILDER. A "Sections and theme" button was here
     * and it was the old mistake wearing a new label: this screen exists so a
     * creator edits their page ON the page, and a button that leaves for a
     * different editor invites them straight back out of it.
     */
    check("and no button that leaves for a different editor", !workspace.includes("Sections and theme"))
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
    /** It says what it does: inside the workspace it has no neighbour to explain it. */
    check("but the profile editor is not, and it is labelled", /aria-label="Edit profile"/.test(button) && button.includes(">\n          Edit profile"))

    const menu = read("components/storefront/owner-menu.tsx")
    check(
      "app links break out of the frame instead of loading the app inside it",
      /target: "_top"/.test(menu),
    )
  }

  // ── 5. One destination, and the old addresses still answer ─────────────
  {
    const entries: Array<[string, string]> = [
      ["components/app/sidebar.tsx", "/creator-page"],
      ["components/app/dashboard-client.tsx", "/creator-page"],
      ["components/storefront/owner-menu.tsx", "/creator-page"],
      ["components/app/settings-form-new.tsx", "/creator-page"],
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
    check("and it lands on the workspace", read("app/store-builder/page.tsx").includes('redirect("/creator-page")'))
    check("the section editor is still a real route", existsSync(join(root, "app/creator-page/sections/page.tsx")))
    check("and the address the workspace used to have still answers", existsSync(join(root, "app/app/creator-page/page.tsx")))

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

  // ── 9. Product URLs ────────────────────────────────────────────────────
  {
    const helpers = read("lib/url-helpers.ts")
    const nested = "app/(marketing)/[sellername]/[productSlug]/page.tsx"

    check("a product has an address under its creator", existsSync(join(root, nested)))
    check("the old address is still a real route", existsSync(join(root, "app/(marketing)/p/[slug]/page.tsx")))

    /**
     * THE COLLISION THAT DECIDED THE SHAPE. storelib.com/<slug> is already the
     * creator page — app/(marketing)/[sellername]/page.tsx exists to make it
     * so. One slot cannot mean both a handle and a product slug: a creator
     * called `ebook` and a product slugged `ebook` are both legitimate, and
     * whichever lost would stop resolving with no error and no redirect.
     */
    check(
      "the root slot still belongs to the creator page",
      existsSync(join(root, "app/(marketing)/[sellername]/page.tsx")),
    )

    check(
      "what we hand out is storelib.com/<handle>/<slug>",
      /\$\{mainDomain\}\/\$\{handle\}\/\$\{productSlug\}/.test(helpers),
    )
    check("and no longer a subdomain with a /p/", !/\$\{handle\}\.\$\{mainDomain\}\/p\//.test(helpers))
    /**
     * A product with no handle to nest under has nowhere to go but the old
     * address, and that has to keep working rather than producing
     * storelib.com//slug.
     */
    check("a product with no handle falls back to the old address", /if \(!handle\) return/.test(helpers))

    const nestedCode = read(nested)
    check("the nested route reuses the product page rather than copying it", nestedCode.includes("from \"../../p/[slug]/page\""))
    check(
      "and a reserved first segment is not read as a creator",
      nestedCode.includes("RESERVED_FIRST_SEGMENT") && nestedCode.includes("notFound()"),
    )
  }

  // ── 10. A server component may not call a client module's exports ──────
  {
    /**
     * THE CRASH THIS EXISTS FOR.
     *
     * The creator page needed getDisplayText/getButtonText to seed the CTA
     * dialog with what the bar actually shows. They lived in
     * subscribe-bar.tsx, which is "use client" — and an export of a client
     * module is NOT a function when a Server Component imports it. The
     * bundler replaces it with a client reference, and calling one on the
     * server throws.
     *
     * Nothing objected. It type-checked, because the types are real. It
     * built, because the error only exists at request time. The whole creator
     * page went down, and because the workspace frames that page, what a
     * creator saw was "Something went wrong on this page" filling the editor.
     *
     * So the rule is checked rather than remembered.
     */
    const page = read("app/(marketing)/u/[username]/page.tsx")
    const bar = read("components/store-builder/subscribe-bar.tsx")
    const lib = read("lib/store-builder/subscribe-text.ts")

    check("the resolvers live outside the client module", lib.includes("export function getDisplayText"))
    check("and that module is not a client module", !lib.startsWith('"use client"'))
    check("the bar is still a client module", bar.startsWith('"use client"'))
    check("and re-exports them, so nothing else had to change", bar.includes("export { buttonStylePresets, getButtonText, getDisplayText }"))

    check(
      "the server component imports them from the lib",
      page.includes('from "@/lib/store-builder/subscribe-text"'),
    )
    check(
      "and calls nothing it imported from the client module",
      !/import \{[^}]*get(DisplayText|ButtonText)[^}]*\} from "@\/components\//.test(page),
    )

    /**
     * The general form: this page is a Server Component, so any VALUE it
     * imports from a "use client" file and then CALLS is the same bug again.
     * Components are fine — those are rendered, not called.
     */
    const clientImports = [...page.matchAll(/import \{([^}]+)\} from "(@\/components\/[^"]+)"/g)]
    const offenders: string[] = []
    for (const [, names, from] of clientImports) {
      let target: string
      try {
        target = read(from.replace("@/", "") + ".tsx")
      } catch {
        continue
      }
      if (!target.startsWith('"use client"')) continue
      for (const raw of names.split(",")) {
        const name = raw.trim().split(" as ").pop()!.trim()
        /** A lowercase name that is called with parentheses is a function. */
        if (!name || /^[A-Z]/.test(name)) continue
        if (new RegExp(`\\b${name}\\s*\\(`).test(page)) offenders.push(`${name} from ${from}`)
      }
    }
    check(
      "no function imported from a client module is called on the server",
      offenders.length === 0,
      offenders.join(", "),
    )
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * THE PROFILE PICTURE IS A ROUNDED SQUARE.
     *
     * A circle is the social-network shape, and it made a creator's shop read
     * as a profile. It was also throwing away corners the creator had
     * positioned on purpose, because the crop behind it is square.
     *
     * The radius is measured in a browser by scripts/check-avatar-shape.mjs,
     * at both sizes a creator can pick. What is held here is what that
     * measurement depends on: the radius is derived from the size rather than
     * written down, and it is an INLINE style — components/ui/avatar bakes
     * `rounded-full` into its root, so a class would lose. Taking the inline
     * rule out makes the probe report a radius of 3.35e7px, which is that
     * `rounded-full` and nothing else.
     */
    const renderer = read("components/store-builder/unified-section-renderer.tsx")
    check(
      "the avatar radius scales with the avatar",
      /borderRadius: `\$\{Math\.round\(avatarSize \* 0\.24\)\}px`/.test(renderer),
    )
    check(
      "it is set inline, where it outranks ui/avatar's rounded-full",
      /style=\{\{[\s\S]{0,400}borderRadius: `\$\{Math\.round\(avatarSize/.test(renderer),
    )
    check(
      "and the depth is two soft layers rather than one wide blur",
      /boxShadow: "0 1px 2px rgba\(15, 23, 42, 0\.06\), 0 10px 28px -8px rgba\(15, 23, 42, 0\.20\)"/.test(renderer) &&
        !/className="shadow-lg shrink-0 bg-gray-200"/.test(renderer),
    )
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
