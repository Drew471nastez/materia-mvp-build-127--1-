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

import { themePresets } from "../lib/store-builder/defaults"
import { cardAccents, resolveStorefrontChrome } from "../lib/store-builder/storefront-chrome"
import { contrastRatio, parseColor } from "../lib/storelib-theme/contrast"

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
/**
 * Source with its comments taken out.
 *
 * A guard that forbids a line of code will match the comment explaining why
 * that line was removed — this file lost two checks to exactly that, in the
 * same sitting. Anything asking "is this code still here" reads through this.
 */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")

function main() {
  console.log("\nThe creator page is edited where it lives")

  // ── 1. It is its own screen, with the arrow as the way back ────────────
  {
    check("the workspace exists", existsSync(join(root, "app/creator-page/page.tsx")))
    /**
     * ITS OWN SCREEN. This moved into /app for a round and back out again on
     * the owner's instruction, and their reason holds: a creator page is a
     * full-width design, so editing one through the two thirds of a window an
     * /app sidebar leaves means judging a narrower page than the one being
     * published. Being a route OUTSIDE /app is the whole of how it gets the
     * screen; the layout beside it gates on the session and renders bare.
     */
    const layout = read("app/creator-page/layout.tsx")
    check("its layout renders no app chrome", !/<AppSidebar|DesktopSidebarContent/.test(layout))
    const workspace = strip(read("components/app/creator-page-workspace.tsx"))
    check("and the workspace does not rebuild one", !/AppSidebar|DesktopSidebarContent/.test(workspace))
    check("it fills the viewport rather than a content area", workspace.includes("h-svh") && !workspace.includes("h-full min-h-0 flex-col bg-"))
    check("and carries a back control, because there is no sidebar to leave by", workspace.includes("ArrowLeft"))
    const sidebar2 = read("components/app/sidebar.tsx")
    check(
      "the setup widget is not shown over the creator page",
      sidebar2.includes('!pathname.startsWith("/creator-page")') && sidebar2.includes('!pathname.startsWith("/app/creator-page")'),
    )
    check("the address it had under /app still answers", read("app/app/creator-page/page.tsx").includes('redirect("/creator-page")'))

    /**
     * THE CANVAS. Inset and bordered on a desktop so the page has edges of
     * its own; not on a phone, where a gutter and a hairline around a 390px
     * page is a border eating the content it frames.
     */
    check("inset on a desktop only", /flex-1 overflow-hidden p-0 md:p-2\.5/.test(workspace))
    check("and bordered on a desktop only", /md:rounded-xl md:border/.test(workspace))
    /** A dark bar over a white page is a hard edge with nothing in between. */
    check("the chrome is light", workspace.includes("bg-[#f1f1f3]") && !workspace.includes("#18181c") && !workspace.includes("#131316"))

    /**
     * THE TOOLS ARE THE BUILDER'S TOOLS. Two editors in one product that draw
     * the same control two ways feel like two products.
     */
    check("a phone gets the builder's own sheet", workspace.includes("MobileEditorSheet"))
    check("the desktop panel rises in like the builder's do", workspace.includes("wb-settings-in"))
    check("and it is inline at the side, not a centred dialog", /bottom-3 right-3 top-\[56px\]/.test(workspace))
    check("the colour control is the builder's swatch", workspace.includes('className="absolute -inset-1 cursor-pointer"'))
    check("beside the builder's hex field", /font-mono text-sm/.test(workspace))

    // The colour scheme, from the bar.
    const api = read("app/api/creator-profile/route.ts")
    check("the scheme can be changed without leaving", workspace.includes("applyScheme"))
    check("it writes through the route that already does auth", /applyScheme[\s\S]{0,600}\/api\/creator-profile/.test(workspace))
    check("and the frame reloads so it is the real thing", /applyScheme[\s\S]{0,900}reframe\(\)/.test(workspace))
    check("the loader is only for the first load", workspace.includes("firstLoad &&"))

    /** Five answers, not eight, three of which were the same answer twice. */
    const schemes = workspace.match(/const SCHEMES: ThemePreset\[\] = \[([^\]]+)\]/)?.[1] ?? ""
    check("five schemes are offered", schemes.split(",").filter((x) => x.trim()).length === 5, schemes)
    check("and they are five different shapes", /default[\s\S]*blacks[\s\S]*cream[\s\S]*pink[\s\S]*astrid/.test(schemes))
    /** A swatch is a tiny page: the page colour, a card on it, a pill in the primary. */
    check("the swatch is a tiny page, not three stripes", workspace.includes("t.sections.pageBackgroundColor") && workspace.includes("t.productCard.backgroundColor") && workspace.includes("t.colors.primary"))

    /** A control that shrinks under the cursor reads as a toy. */
    check("nothing in the toolbar scales on press", !workspace.includes("active:scale"))

    // ── A phone gets a sheet, and the bar is editable from here ──────────
    check("a phone gets a sheet, not a popover on a 36px button", /isPhone && portalReady && \(\s*<MobileEditorSheet open=\{schemeOpen\}/.test(workspace))
    check("the top bar can be edited from the workspace", workspace.includes("CtaEditor"))
    check("including its four colours", workspace.includes("buttonTextColor"))
    check("with the bar's own message presets", workspace.includes("MESSAGE_PRESETS") && workspace.includes('"Join our community"'))
    check("and its button presets", workspace.includes("BUTTON_PRESETS") && workspace.includes('"Get It"'))
    check("which the API accepts as stored words", api.includes('["style1", "style2", "style3"].includes(value.style)'))
    check(
      "and every colour is validated as a hex before it reaches a public page",
      api.includes("^#(?:[0-9a-f]{3}|[0-9a-f]{6})$"),
    )
    /** An unknown name would leave a page resolving a theme that does not exist. */
    check("an unknown preset cannot be stored", api.includes("raw in themePresets"))
    check("and it lands in globalSettings, where the page reads it", api.includes("globalSettings"))
  }

  // ── 2. The frame is the real page ──────────────────────────────────────
  {
    const workspace = read("components/app/creator-page-workspace.tsx")
    check("it frames the public creator page", /\/u\/\$\{encodeURIComponent\(handle\)\}\?embedded=1/.test(workspace))
    /**
     * TWO FRAMES, SO A CHANGE IS NEVER A WHITE FLASH. Reloading one frame in
     * place unmounts the document first and the canvas is white for a
     * network round trip. A change loads into the hidden frame and the two
     * swap when it has loaded, so the old page stays until the new one is
     * ready to replace it.
     */
    check("there are two frames", /\(\[0, 1\] as const\)\.map/.test(workspace))
    /**
     * THE FRONT FADES UP OVER THE BACK, and the back stays OPAQUE while it
     * does. Hiding the outgoing frame would show the white canvas through the
     * incoming one for the length of the fade, which on a dark scheme is the
     * flash the two frames exist to remove.
     */
    check("the front one fades up on top", workspace.includes('i === front ? "creator-frame-in z-[2]" : "z-[1] pointer-events-none"'))
    check("and the one underneath is never made transparent", !/opacity-0/.test(workspace))
    check("the fade is a real animation", read("app/globals.css").includes("@keyframes creator-frame-in"))
    check("a change loads into the hidden one", /const back = front === 0 \? 1 : 0/.test(workspace))
    check("and the swap happens on load, not on request", /if \(index !== front && srcs\[index\]\) setFront\(index\)/.test(workspace))
    check("the handle is encoded, so a handle cannot inject a parameter", workspace.includes("encodeURIComponent(handle)"))
    /**
     * Opening the real page is now inside the share card rather than being
     * the bar's only action — so this asks the card, which is where it went.
     */
    const shareCard = read("components/app/creator-page-share.tsx")
    check(
      "there is a way to open the real thing",
      /target="_blank"/.test(shareCard) && shareCard.includes("Open my page") &&
        /<CreatorPageShare/.test(workspace),
    )
    /**
     * NO DOOR INTO THE SECTION BUILDER. A "Sections and theme" button was here
     * and it was the old mistake wearing a new label: this screen exists so a
     * creator edits their page ON the page, and a button that leaves for a
     * different editor invites them straight back out of it.
     */
    check("and no button that leaves for a different editor", !workspace.includes("Sections and theme"))
    /** A frame that never says it is loading reads as a broken page. */
    check("the frame reports when it has arrived", workspace.includes("onLoad={() => onFrameLoad(i)}"))
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
      /\{!embedded && !framed && \(/.test(button),
    )
    /** It says what it does: inside the workspace it has no neighbour to explain it. */
    check("but the profile editor is not, and it is labelled", /aria-label="Edit profile"/.test(button) && button.includes('<span className="hidden sm:inline">Edit profile</span>'))

    const menu = read("components/storefront/owner-menu.tsx")
    check(
      "app links break out of the frame instead of loading the app inside it",
      /target: "_top"/.test(menu),
    )
  }

  // ── 5. One destination, and the old addresses still answer ─────────────
  {
    const entries: Array<[string, string]> = [
      ["components/app/sidebar.tsx", '"/creator-page"'],
      ["components/app/dashboard-client.tsx", '"/creator-page"'],
      ["components/storefront/owner-menu.tsx", '"/creator-page"'],
      ["components/app/settings-form-new.tsx", '"/creator-page"'],
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
    check("and it lands on the workspace too", read("app/app/creator-page/page.tsx").includes('redirect("/creator-page")'))

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
    /**
     * The typed address wins; the account's stands in only when there is
     * none — at render, never written. The API must never store the login
     * address as the contact address, so clearing it always falls back.
     */
    check(
      "the typed address wins and the account's only stands in",
      page.includes("sellerContactEmail={headerSettings.contactEmail || profile.email || undefined}"),
    )
    check("and the login address is never written as the contact address", !/contactEmail\s*=\s*(user|profile)\.email/.test(api))
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

  // ── 11. The schemes apply, and readable is a number ────────────────────
  {
    /**
     * "THE COLOUR SCHEMES DON'T APPLY AT ALL." They did not, and the reason
     * was not the presets. Two breaks on the way from a preset to a pixel:
     *
     *   THE CARDS. The live featured grid computed four card colours from
     *   the theme and then rendered StorefrontProductCard with the product
     *   and the creator and nothing else. ProductCard's root is `bg-card`,
     *   the design system's white, with no way in. On every dark scheme that
     *   was a white card with near-white text: invisible titles, invisible
     *   prices, which is the screenshot.
     *
     *   THE PAGE. The body colour was read from the STORED page colour only,
     *   never from the theme's own `sections.pageBackgroundColor`, so a dark
     *   scheme repainted every section and left the page itself on the light
     *   grey field between them.
     */
    const renderer = read("components/store-builder/unified-section-renderer.tsx")
    const card = read("components/explore/product-card.tsx")
    const storefrontCard = read("components/storefront/storefront-product-card.tsx")
    const page = read("app/(marketing)/u/[username]/page.tsx")

    check("the live grid passes the card colours it computes", /surface=\{\{\s*backgroundColor: cardBgColor/.test(renderer))
    check("StorefrontProductCard threads them through", storefrontCard.includes("surface={surface}"))
    check("and ProductCard paints its root with them", /style=\{\s*surface\?\.backgroundColor/.test(card))
    check("its title", /<h3[^>]*style=\{surface\?\.textColor/.test(card))
    check("and its price", /style=\{surface\?\.priceColor/.test(card))
    const chromeLib = read("lib/store-builder/storefront-chrome.ts")
    check("the page resolves its chrome from the scheme", page.includes("resolveStorefrontChrome(globalSettings?.themePreset"))
    check("the page background falls back to the theme's", chromeLib.includes("theme.sections.pageBackgroundColor"))
    check("but a white theme page still gets the grey field", /isInheritedWhite\(themePage\)/.test(chromeLib))
    check("and the page text falls back to the theme's header colour", chromeLib.includes("theme.sections.headerTextColor"))
    check("a stored black is not a choice, the same way a stored white is not", chromeLib.includes("export function isInheritedBlack"))

    /**
     * READABLE, MEASURED. Every pair the page actually paints, for each of
     * the five schemes offered, held to WCAG AA (4.5) for body text and 3.0
     * for the large Featured heading. This turns "applies well" from an
     * opinion into a number.
     */
    const AA = 4.5
    const LARGE = 3.0
    const r = (fg: string, bg: string) => contrastRatio(parseColor(fg)!, parseColor(bg)!)
    const PAGE_FIELD = "#f7f7f8"
    const white = (c: string) => /^#(fff|ffffff)$/i.test(c.trim())
    for (const key of ["default", "blacks", "cream", "pink", "astrid"] as const) {
      const t = themePresets[key]
      const pageBg = white(t.sections.pageBackgroundColor) ? PAGE_FIELD : t.sections.pageBackgroundColor
      const pairs: Array<[string, string, string, number]> = [
        ["card title on card", t.productCard.textColor, t.productCard.backgroundColor, AA],
        ["card price on card", t.productCard.priceColor, t.productCard.backgroundColor, AA],
        ["featured heading on its band", t.sections.featuredProductsTextColor, white(t.sections.featuredProductsBackgroundColor) ? pageBg : t.sections.featuredProductsBackgroundColor, LARGE],
        ["about text on its block", t.about.textColor, t.about.backgroundColor === "transparent" ? pageBg : t.about.backgroundColor, AA],
        ["page text on page", t.colors.foreground, pageBg, AA],
        ["bar text on bar", t.subscribeBar.textColor, t.subscribeBar.backgroundColor, AA],
        ["bar button label on button", t.subscribeBar.buttonTextColor, t.subscribeBar.buttonColor, AA],
      ]
      for (const [what, fg, bg, min] of pairs) {
        const ratio = r(fg, bg)
        check(`${t.name}: ${what} is readable`, ratio >= min, `${fg} on ${bg} = ${ratio.toFixed(2)}, needs ${min}`)
      }
    }

    /**
     * AND THE CHROME, resolved the way a real config resolves it.
     *
     * The pairs above are what the PRESETS state. These are what the page
     * actually computes from them once the creator's stored "#ffffff" and
     * "#000000" are in the mix, which is the case every account on the
     * platform is in. The derived colours — muted type, the footer band, the
     * badge on a card — are not in any preset table, so this is the only
     * place their readability can be asserted at all.
     *
     * scripts/check-creator-chrome.mjs renders the real components in a real
     * browser with the real stylesheet and measures the same numbers off the
     * pixels. This is the cheap copy that runs on every push.
     */
    for (const key of ["default", "blacks", "cream", "pink", "astrid"] as const) {
      const t = themePresets[key]
      const chrome = resolveStorefrontChrome(key, {
        pageBackground: undefined,
        text: "#000000",
        bar: { backgroundColor: "#ffffff", textColor: "#000000", buttonColor: "#2563eb", buttonTextColor: "#ffffff" },
      })
      const accents = cardAccents(t.productCard.backgroundColor, t.productCard.textColor)
      const pairs: Array<[string, string, string, number]> = [
        ["the creator's name", chrome.text, chrome.pageBackground, LARGE],
        ["the handle and the bio", chrome.muted, chrome.pageBackground, AA],
        ["a footer link", chrome.footerText, chrome.footerBackground, AA],
        ["the Powered by line", chrome.footerMuted, chrome.footerBackground, AA],
        ["the bar's own words", chrome.bar.textColor, chrome.bar.backgroundColor, AA],
        ["the bar's button label", chrome.bar.buttonTextColor, chrome.bar.buttonColor, AA],
        ["a card's category pill", accents.badgeTextColor!, accents.badgeBackgroundColor!, AA],
        ["a card's seller row", accents.mutedColor!, t.productCard.backgroundColor, AA],
      ]
      for (const [what, fg, bg, min] of pairs) {
        const ratio = r(fg, bg)
        check(`${t.name}: ${what} is readable`, ratio >= min, `${fg} on ${bg} = ${ratio.toFixed(2)}, needs ${min}`)
      }
      /**
       * AND IT IS NOT THE SAME COLOUR AS THE PAGE. Black on black passes
       * every code review and is invisible; the ratio above is what catches
       * it, and this is what says so in words when it does.
       */
      check(
        `${t.name}: the name is not the page colour`,
        chrome.text.toLowerCase() !== chrome.pageBackground.toLowerCase(),
        `${chrome.text} on ${chrome.pageBackground}`,
      )
    }
  }

  // ── 12. The rest of the round ──────────────────────────────────────────
  {
    const renderer = read("components/store-builder/unified-section-renderer.tsx")
    const button = read("components/storefront/edit-profile-button.tsx")
    const page = read("app/(marketing)/u/[username]/page.tsx")

    check("the share panel is inline, not centred", renderer.includes("wb-settings-in absolute bottom-[calc(16px+env(safe-area-inset-bottom,0px))] right-4"))
    check("and nothing is dimmed behind it", !/fixed inset-0 z-\[999999\] flex items-center justify-center/.test(renderer))
    check("Customize page is hidden inside any frame, parameter or not", /!embedded && !framed/.test(button) && button.includes("window.self !== window.top"))
    check("owner controls are icon-only on a phone", button.includes('<span className="hidden sm:inline">Edit profile</span>') && button.includes('<span className="hidden sm:inline">Customize page</span>'))
    check("the page fetches the account email for the contact default", page.includes('"id, display_name, username, avatar_url, email"'))
    check("and the contact link falls back to it", page.includes("headerSettings.contactEmail || profile.email || undefined"))
    check("and the About editor opens on the same value", page.includes("headerSettings.contactEmail || profile.email ||"))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * THE FAVICON IS THE CREATOR'S PICTURE, NOT A SQUASHED ONE.
     *
     * It was drawn with `drawImage(img, 0, 0, size, size)`, which scales a
     * source to fit a square exactly — so a portrait photo came out
     * compressed along one axis. The crop is measured in a browser by
     * scripts/check-favicon.mjs, which feeds it a 1:3 source and reads the
     * pixels back; with the old call the red top and blue bottom are still
     * in the icon, which is the squashing.
     */
    const favicon = code("components/store-builder/dynamic-favicon.tsx")
    check(
      "the favicon covers its square rather than stretching to it",
      /Math\.max\(size \/ sw, size \/ sh\)/.test(favicon) &&
        !/drawImage\(img, 0, 0, size, size\)/.test(favicon),
    )
    check(
      "and it is drawn large enough for a high-density tab",
      /const ICON_SIZE = (?:128|256|512)/.test(favicon),
    )
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * THE CREATOR PAGE IS A PERSON, NOT A SHOPFRONT — in the rail and in
     * search, which are two lists that had drifted apart before.
     */
    const rail = read("components/app/sidebar-desktop-nav.tsx")
    const sidebar = read("components/app/sidebar.tsx")
    check(
      "the rail's Creator Page icon is a person",
      /storeBuilder: \{ line: CreatorPageLinear, fill: CreatorPageBold \}/.test(rail) &&
        /linear\/user-rounded/.test(rail),
    )
    check(
      "and so is the one in search",
      /\{ label: "Creator Page", href: "\/creator-page", icon: UserRound, category: "Pages" \}/.test(sidebar),
    )
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * THE BAR OPENS THE ADDRESS RATHER THAN LEAVING FOR IT.
     *
     * And the card says there is nothing to publish, because a creator page
     * has no draft: an edit is live when it is saved. A publish button here
     * would be a button that does nothing.
     */
    const share = read("components/app/creator-page-share.tsx")
    const workspace = code("components/app/creator-page-workspace.tsx")
    check("the bar opens the share card", /onClick=\{\(\) => setShareOpen\(true\)\}/.test(workspace))
    check("and no longer leaves for the page as its only action", !/View live/.test(workspace))
    check("the card says the page needs no publishing", /There is nothing to publish/.test(share))
    check("it has no publish button", !/Publish changes/.test(share) && !/>Publish</.test(share))
    check("the address can be copied and opened", /navigator\.clipboard\.writeText\(absolute\)/.test(share))
    check(
      "a custom domain links to the one flow that adds one",
      /href="\/app\/settings\?tab=domains"/.test(share) && /\/api\/domains/.test(share),
    )
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * ===================================================================
     *  A PANEL THAT LEAVES THE WAY IT ARRIVED
     * ===================================================================
     * `open && <div className="wb-settings-in">` opens on a curve and then
     * DISAPPEARS ON ONE FRAME, because unmounting is instantaneous and there
     * is no such thing as an exit animation on an element that is no longer
     * in the tree. Every inline panel in the workspace was written that way.
     */
    const panel = read("components/app/inline-panel.tsx")
    const css = read("app/globals.css")
    const share = read("components/app/creator-page-share.tsx")
    const workspace = code("components/app/creator-page-workspace.tsx")

    check("there is a way out as well as a way in", css.includes("@keyframes wb-settings-out"))
    check("and the scrim goes with it", css.includes("@keyframes wb-scrim-in") && css.includes(".wb-scrim-out"))
    check("the panel stays mounted for the length of the exit", panel.includes("setTimeout(") && panel.includes("EXIT_MS"))
    check("and the timer matches the stylesheet", /const EXIT_MS = 160/.test(panel) && /wb-settings-out 160ms/.test(css))
    check("a panel reopened mid-exit comes back rather than vanishing", panel.includes("clearTimeout(timer.current)"))
    check("both moving parts are motion-safe", /prefers-reduced-motion[\s\S]*?wb-settings-out/.test(css))

    check("the share card uses it", share.includes("<InlinePanel"))
    check("and the bar editor uses it", workspace.includes("<InlinePanel"))
    /**
     * NO X. The card decides nothing and traps nothing: clicking off it,
     * Escape and a downward drag on the sheet all close it, so a close button
     * in the corner only made it look like a dialog waiting for an answer.
     */
    check("the share card has no close button", !/aria-label="Close"/.test(share) && !/<X /.test(share))
    check("Escape still closes it", panel.includes('e.key === "Escape"'))
    check("and a phone gets a real bottom sheet", share.includes("MobileEditorSheet"))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * ===================================================================
     *  THE BAR REPAINTS AS IT IS TYPED
     * ===================================================================
     * The editor holds the page in an iframe, so the only way a change
     * reached the canvas was a save followed by a fresh request: you typed a
     * sentence, pressed Save, and waited for a round trip to find out whether
     * it fitted.
     */
    const live = read("components/store-builder/live-subscribe-bar.tsx")
    const workspace = code("components/app/creator-page-workspace.tsx")
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const text = read("lib/store-builder/subscribe-text.ts")

    check("every change is posted to the canvas, not just the save", /onPreview\(next\)/.test(workspace))
    check("into both frames, because the hidden one may be mid-load", /for \(const frame of frames\.current\)/.test(workspace))
    check("and cancelling puts the page back", /post\(null\)/.test(workspace))
    check("a reloaded frame asks for the draft again", live.includes('kind: "ready"') && workspace.includes('data.kind !== "ready"'))

    /**
     * THE LISTENER IS NOT ON A PUBLIC PAGE. A message is an input from
     * outside, and what it carries is painted onto a storefront. Three gates:
     * only rendered for a framed owner, only this origin, only the window
     * that frames us.
     */
    check("the live bar is only mounted for a framed owner", /embedded && viewerIsOwner \? \(/.test(page))
    check("a visitor gets the plain bar", /<SubscribeBar settings=/.test(page))
    check("the listener refuses another origin", live.includes("event.origin !== window.location.origin"))
    check("and any window that is not the one framing us", live.includes("event.source !== window.parent"))
    check("an unframed page never listens at all", live.includes("window.parent === window"))
    check("and a colour off the wire is validated as a hex", /\/\^#\[0-9a-f\]\{6\}\$\/i\.test/.test(live))

    /**
     * THE CUSTOM LABEL WAS WRITTEN AND NEVER READ. "Or your own label" saved
     * a string to the config and the bar went on saying "Subscribe": a field
     * that persists and does nothing, which is worse than not offering it.
     */
    check("a custom button label is used", text.includes('settings.buttonTextPreset === "custom"'))
    check("but a leftover default is not", !/settings\.buttonText\?\.trim\(\) \|\| preset\.default/.test(text))
    check("the page carries the flag that tells them apart", page.includes("buttonTextPreset: savedSettings.buttonTextPreset"))
    check("and the preview applies the same rule", live.includes('buttonText.trim() ? "custom" : "subscribe"'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
