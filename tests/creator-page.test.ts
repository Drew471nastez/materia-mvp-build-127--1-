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

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { themePresets } from "../lib/store-builder/defaults"
import { cardAccents, resolveStorefrontChrome } from "../lib/store-builder/storefront-chrome"
import { isDarkScheme } from "../lib/store-builder/scheme-tone"
import { productPageTone } from "../lib/store-builder/product-page-tone"
import { canvasRefusesHref, embeddedHref } from "../lib/store-builder/editor-channel"
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

  // ── 1. Its own screen, and the toolbar is nearly empty ─────────────────
  {
    check("the workspace exists", existsSync(join(root, "app/creator-page/page.tsx")))
    /**
     * ITS OWN SCREEN. This has moved four times on the owner's instruction
     * and it is their product. Being a route OUTSIDE /app is the whole of how
     * it gets the screen: the layout beside it gates on the session and
     * renders the children bare.
     */
    const layout = read("app/creator-page/layout.tsx")
    check("its layout renders no app chrome", !/<AppSidebar|DesktopSidebarContent/.test(layout))
    const workspace = strip(read("components/app/creator-page-workspace.tsx"))
    check("and the workspace does not rebuild one", !/AppSidebar|DesktopSidebarContent/.test(workspace))
    check("it fills the viewport rather than a content area", workspace.includes("h-svh") && !workspace.includes("h-full min-h-0"))
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
    /*
      NOT INSET ANY MORE, on the owner's "the editor must match the live page
      exactly": a canvas 20px narrower than the window crossed the page's
      breakpoints at different widths and drew the banner a different shape.
      Edge to edge, the frame is the window's width and the page inside it is
      the page a visitor gets.
    */
    check("the canvas is the window's full width, as the live page is", /flex-1 overflow-hidden p-0">/.test(workspace) && !/md:p-2\.5/.test(workspace))
    check("and has no border of its own to take width from it", !/md:rounded-xl md:border/.test(workspace))
    /** A dark bar over a white page is a hard edge with nothing in between. */
    check("the chrome is light", workspace.includes("bg-[#f1f1f3]") && !workspace.includes("#18181c") && !workspace.includes("#131316"))

    /**
     * ===================================================================
     *  THE TOOLBAR HAS NOTHING IN IT BUT THE ADDRESS
     * ===================================================================
     * It grew an Edit-the-bar panel, a colour-scheme menu and a reload
     * button, and all three were in the wrong place. The first two are
     * controls for things ON the page, two inches below them and off to one
     * side, and they only existed inside the editor — so a creator looking at
     * their own live page had no way to either. The third was the editor
     * asking a creator to notice a save on its behalf.
     *
     * They are on the page now: the bar's editor opens from the bar, the
     * schemes are in the profile dialog, and the frame says when it has saved.
     */
    check("no bar editor in the toolbar", !workspace.includes("CtaEditor") && !workspace.includes("MESSAGE_PRESETS"))
    check("no colour-scheme menu in the toolbar", !workspace.includes("applyScheme") && !workspace.includes("SCHEMES"))
    check("no reload button in the toolbar", !workspace.includes("RotateCw"))
    /*
      Still only the FIRST load — a reframe after a save swaps two iframes and
      must not put a loading screen over the page. It is no longer gated on
      `firstLoad` directly: it lingers past it, so the loader can fade out
      across the page instead of being deleted in one frame. What matters is
      that `firstLoad` is the only thing it derives from.
    */
    check("the loader is only for the first load", /useLinger\(firstLoad,/.test(workspace))
    check("and nothing else turns it back on", !/loaderVisible = [^\n]*(front|reframe|version)/.test(workspace))
    /** A control that shrinks under the cursor reads as a toy. */
    check("nothing in the toolbar scales on press", !workspace.includes("active:scale"))

    /**
     * AND THE PAGE TELLS IT WHEN TO RELOAD, which is what replaced the button.
     */
    check("the page says when it has saved", workspace.includes('data.kind === "saved"'))
    check("and only this origin is listened to", workspace.includes("event.origin !== window.location.origin"))
    const channel = read("lib/store-builder/editor-channel.ts")
    check("a page that is not framed says nothing", channel.includes("window.parent === window"))

    const api = read("app/api/creator-profile/route.ts")
    check("which the API accepts as stored words", api.includes('["style1", "style2", "style3", "style4", "style5", "style6"].includes(value.style)'))
    check(
      "and every colour is validated as a hex before it reaches a public page",
      api.includes("^#(?:[0-9a-f]{3}|[0-9a-f]{6})$"),
    )
    /** An unknown name would leave a page resolving a theme that does not exist. */
    check("an unknown preset cannot be stored", api.includes("raw in themePresets"))
    check("and it lands in globalSettings, where the page reads it", api.includes("globalSettings"))
  }

  // ── 1b. Every control is on the page, beside what it changes ───────────
  {
    const bar = read("components/storefront/edit-cta-button.tsx")
    const live = read("components/store-builder/live-subscribe-bar.tsx")
    const profile = read("components/storefront/edit-profile-button.tsx")
    const picker = read("components/storefront/scheme-picker.tsx")
    const about = read("components/storefront/edit-about-button.tsx")

    /** The bar's whole settings, from the pencil on the bar. */
    check("the bar editor opens from the bar", live.includes("<EditCtaButton"))
    check("and it edits the colours, not just the words", bar.includes("buttonTextColor") && bar.includes("<ColorField"))
    check("with six message presets, not three", (bar.match(/value: "style\d"/g) ?? []).length >= 10)
    check("and the bar renders all six", read("lib/store-builder/subscribe-text.ts").includes('case "style6"'))

    /**
     * THE COLOUR PICKER IS THE WEBSITE BUILDER'S. Not one that looks like it:
     * ColorChip IS the control its design panels use, so the two cannot drift.
     */
    const field = read("components/storefront/color-field.tsx")
    check("the colour control is the builder's own", field.includes('from "@/components/website-builder/editor/color-chip"'))
    check(
      "and nothing opens the operating system's colour dialog",
      !code("components/storefront/edit-cta-button.tsx").includes('type="color"') &&
        !code("components/storefront/color-field.tsx").includes('type="color"'),
    )

    /**
     * ONE SHELL. Radix owns the open and the close on a desktop, which is the
     * whole of "no glitch"; on a phone every editor is the builder's bottom
     * sheet, with its detents, its drag physics and its keyboard inset. All
     * three editors go through it, so there is one idea of an editor.
     */
    const sheet = read("components/storefront/editor-sheet.tsx")
    check("the editors open on Dialog on a desktop", sheet.includes("<Dialog"))
    /**
     * A DRAWER, NOT A CENTRED DIALOG. These edit the page BEHIND them, and
     * the whole reason the workspace frames the real page is so a creator
     * sees a change land. Dimming the one thing they are looking at, and
     * covering its middle, works against that.
     */
    check("pinned to the right edge, not centred", sheet.includes("left-auto right-0 top-0 translate-x-0"))
    /* Transparent, and it stops taking clicks the moment it starts to leave
       (`data-[state=closed]`), so a press on the pencil during the drawer's
       exit reopens it instead of landing on a layer that is on its way out. */
    check("with no dimming overlay", sheet.includes('overlayClassName="bg-transparent data-[state=closed]:!pointer-events-none"'))
    check("and depth instead", sheet.includes("shadow-[-24px_0_60px_-24px_rgba(15,23,42,0.35)]"))
    /** Radix keeps the node mounted for the exit, so closing is animated. */
    check("it slides both ways", sheet.includes("data-[state=closed]:slide-out-to-right") && sheet.includes("data-[state=open]:slide-in-from-right"))
    /** The base content class zooms from the centre and would fight the slide. */
    check("and the dialog's own zoom is off, not merged over", sheet.includes("disableDefaultAnimations"))
    /*
      On a phone it is the app's own bottom sheet now, the one every other
      /app phone sheet is (components/ui/bottom-sheet), not the website
      builder's: open and close on the compositor, a drag that leaves at the
      finger's speed, pictures decoded before the slide.
    */
    check("and on the app's bottom sheet on a phone", sheet.includes("<BottomSheet") && sheet.includes("useIsPhone()") && !sheet.includes("<MobileEditorSheet"))
    for (const [name, file] of [["the bar", "edit-cta-button"], ["the profile", "edit-profile-button"], ["About", "edit-about-button"]] as const) {
      const src = read(`components/storefront/${file}.tsx`)
      check(`${name} editor uses that shell`, src.includes("<EditorSheet") && !src.includes("<Dialog "))
    }
    /**
     * NO PEEK. The sheet's default is the builder's BASE sheet, which stays
     * 72px above the bottom edge when closed because the builder's tab row
     * lives there. Left at the default, a closed editor is a permanent strip
     * across the bottom of the page — which is what "your page is live is
     * always at the bottom" was.
     */
    /* Comment-stripped: the shell's own note quotes the prop it is checked for. */
    const sheetCode = code("components/storefront/editor-sheet.tsx")
    /* BottomSheet has no peek at all: closed is out of the document. */
    /* The share card is on BottomSheet too now, which has no peek at all: closed is out of the document. */
    check("closed sheets are off screen, not peeking", !sheetCode.includes("peekHeight") && code("components/app/creator-page-share.tsx").includes("<BottomSheet") && !code("components/app/creator-page-share.tsx").includes("<MobileEditorSheet"))
    check("and the sheet decides nothing about the breakpoint useIsPhone already decided", sheetCode.includes("hideFrom={null}"))

    /** Six sentences as pills were six things competing for the eye. */
    check("the presets are a select, not a row of pills", bar.includes("<EditorSelect") && !bar.includes("SchemeSwatchRow"))
    /**
     * THE PICKER OPENS IN THE FLOW. A portal inside a modal dialog cannot be
     * clicked (Radix puts pointer-events: none on everything outside) and
     * dismisses the dialog on the first press, which was "the colour picker
     * is not working".
     */
    check("the colour picker is the builder's panel", field.includes("<ColorPickerPanel") && read("components/website-builder/editor/color-chip.tsx").includes("export function ColorPickerPanel"))
    check("opened in the flow rather than a portal", !field.includes("createPortal") && field.includes('aria-expanded={open}'))
    check("and the builder's chip composes the same panel", read("components/website-builder/editor/color-chip.tsx").includes("<ColorPickerPanel value={value} onChange={onChange} existing={existing}"))
    check("one colour per row, so the label is not truncated", bar.includes('<EditorField label="Colours">') && !/grid grid-cols-2 gap-3[\s\S]{0,200}<ColorField/.test(bar))

    /** The scheme, in the dialog that owns how the page presents itself. */
    /* Through a memoised wrapper, React.memo(SchemePicker), so a keystroke in the name does not redraw eight schemes. */
    check("the colour scheme is in Edit profile", profile.includes("<SchemePicker") || (profile.includes("<MemoSchemePicker") && profile.includes("React.memo(SchemePicker)")))
    check("and it saves with the rest of it", profile.includes("themePreset: scheme"))
    /* Eight since sage, harbor and clay joined; the list moved to lib/store-builder/scheme-preview
       because the server prepares each one's paint for the instant preview.
       Nine since graphite joined: a second dark scheme, which could be offered
       once "dark" was decided by a scheme's colours rather than by its name. */
    const offered = read("lib/store-builder/scheme-preview.ts")
    check("nine schemes are offered", (offered.match(/"(default|blacks|cream|sage|harbor|clay|pink|astrid|graphite)"/g) ?? []).length === 9 && picker.includes("OFFERED_SCHEMES.map"))
    /* The spread is a transform now (translateX), so a choice moves nothing in layout. */
    check("drawn as overlapping discs, not stripes or a tiny page", picker.includes("rounded-full") && picker.includes("translateX(${i * step}px)"))
    /** A picker whose only change is which border is dark reads as a radio button. */
    /* The lift was the bump; what settles now is the discs and the shadow. */
    check("and selecting one settles rather than snapping", picker.includes("transition-transform duration-200") && picker.includes("box-shadow] duration-200"))

    /**
     * Every one of them tells the workspace, so nothing needs a reload button.
     *
     * They say it through `useSaveThenRefresh` now rather than inline, because
     * it has to happen AFTER the sheet has finished leaving — on the same line
     * as the close, the page redrew underneath a sheet that was still
     * animating down. So each editor is checked for its half, and the sheet
     * for the other.
     */
    const editorSheet = read("components/storefront/editor-sheet.tsx")
    check("the sheet tells the workspace once it has gone", editorSheet.includes("notifyEditorSaved()"))
    for (const [name, src] of [["the bar", bar], ["the profile", profile], ["About", about]] as const) {
      check(`${name} editor reports a save to the sheet`, src.includes("markSaved()"))
    }
  }

  // ── 2. The frame is the real page ──────────────────────────────────────
  {
    const workspace = read("components/app/creator-page-workspace.tsx")
    /**
     * The address here moved from /u/<handle> to /<handle>; this check moved
     * with it rather than being deleted. Framing the old one still worked in
     * the sense that the redirect resolved, and did not work in the sense
     * that mattered: it landed somewhere the proxy would not let us frame.
     */
    check(
      "it frames the public creator page",
      /getStoreInternalPath\(encodeURIComponent\(handle\)\)\}\?embedded=1/.test(workspace),
    )
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

    /**
     * AND NARROW IS A THING YOU RUN, NOT A THING YOU GREP FOR.
     *
     * The checks above ask whether lines of code are still present. They all
     * passed on the day the editor showed a broken rectangle, because the
     * rule they were reading was intact and simply did not cover the address
     * the creator page had moved to: `/u/<handle>` became a 308 to
     * `/<handle>`, one segment, matching nothing in the list.
     *
     * So this lifts the real predicate out of proxy.ts and runs it. The
     * reserved list comes out of the same file, so a route added there is
     * covered here without anybody remembering to come back.
     */
    const proxySource = read("proxy.ts")
    const reserved = (() => {
      const open = proxySource.indexOf("FRAME_RESERVED_FIRST_SEGMENT = new Set([")
      const close = proxySource.indexOf("])", open)
      if (open === -1 || close === -1) return [] as string[]
      return Array.from(proxySource.slice(open, close).matchAll(/"([^"]+)"/g)).map((m) => m[1])
    })()
    check("the reserved route list was found", reserved.length > 10, `found ${reserved.length}`)

    /**
     * AND THE LIST HAS TO STAY COMPLETE.
     *
     * A handle is one segment. So is every top level route on the site, so
     * the only thing separating /checkout from a creator called "checkout"
     * is whether somebody remembered to add it to that list. Nineteen of
     * them were missing when this was written.
     *
     * This walks app/ instead of trusting a list to be maintained by hand:
     * add a route tomorrow and this fails until the proxy knows about it.
     * Route groups — the (marketing) kind — are not in the URL, so they are
     * unwrapped; dynamic segments are the creator page itself.
     */
    const topLevelRoutes = (() => {
      const found = new Set<string>()
      const walk = (dir: string, url: string[]) => {
        for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
          if (!entry.isDirectory()) continue
          const next = entry.name.startsWith("(") || entry.name.startsWith("@") ? url : [...url, entry.name]
          if (next.length === 1 && next[0].startsWith("[")) continue
          if (next.length === 1) found.add(next[0])
          if (next.length <= 1) walk(`${dir}/${entry.name}`, next)
        }
      }
      walk("app", [])
      return [...found]
    })()
    check("app/ was walked", topLevelRoutes.length > 20, `found ${topLevelRoutes.length}`)
    const unlisted = topLevelRoutes.filter((r) => !reserved.includes(r))
    check(
      "every top level route is reserved, so none can be read as a handle",
      unlisted.length === 0,
      `missing from FRAME_RESERVED_FIRST_SEGMENT in proxy.ts: ${unlisted.join(", ")}`,
    )

    const framable = (() => {
      const open = proxySource.indexOf("const productPath = (() => {")
      const close = proxySource.indexOf("const framed =", open)
      if (open === -1 || close === -1) return null
      const body = proxySource.slice(open, close).replace(/: boolean|: string/g, "")
      return new Function(
        "url",
        "FRAME_RESERVED_FIRST_SEGMENT",
        `${body}\nreturn framableWhenEmbedded`,
      ) as (url: URL, set: Set<string>) => boolean
    })()
    check("the framing rule was found and is runnable", framable !== null)

    if (framable) {
      const set = new Set(reserved)
      const asks = (path: string) => framable(new URL(`https://storelib.com${path}`), set)

      /** What the workspace actually loads. This is the case that was broken. */
      check("a creator page at /{handle} may be framed", asks("/andrewrullz"))
      check("a product inside it may be framed", asks("/andrewrullz/men-s-white-t-shirt"))
      check("the old /u/{handle} still may be, so the redirect keeps working", asks("/u/andrewrullz"))
      check("and /p/{slug}", asks("/p/men-s-white-t-shirt"))
      check("and the code editor", asks("/website-builder/code/abc"))

      /**
       * THE BREAK TEST. One segment is also the shape of every top level
       * route on the site. If the reserved guard stopped working, /login
       * would become framable, and a login form in a frame is the setup for
       * clickjacking a password. Each of these is checked by name.
       */
      /*
        ONE RESERVED ROUTE IS FRAMED ON PURPOSE: /onepage-preview, the OnePage
        editor's preview (components/onepage/live-preview). It reads nothing
        and shows only the page its parent on this origin posts to it, so it
        is framed on the same terms as the code editor, and named here so
        every other reserved route is still held to the rule.
      */
      check("and the OnePage editor's preview frame", asks("/onepage-preview"))
      const escaped = reserved.filter((r) => r !== "onepage-preview" && asks(`/${r}`))
      check("no reserved route is framable on its own", escaped.length === 0, `framable: ${escaped.join(", ")}`)
      /**
       * `p` and `u` are in the reserved list so that /p and /u alone are not
       * mistaken for handles, but /p/<slug> and /u/<handle> are the two
       * addresses we mean to frame. Everything else stays shut.
       */
      const framablePrefixes = new Set(["p", "u"])
      const escapedTwo = reserved.filter((r) => !framablePrefixes.has(r) && asks(`/${r}/anything`))
      check("nor with something after it", escapedTwo.length === 0, `framable: ${escapedTwo.join(", ")}`)
      check("nor in a different case", !asks("/Login") && !asks("/APP"))

      /** Depth is still bounded: nothing three deep is a page we frame. */
      check("nothing three segments deep is framable", !asks("/a/b/c"))
      check("and not the site root", !asks("/"))
    }

    /**
     * THE OTHER HALF. The rule can be right and the editor still broken if
     * the frame asks for the old address: the 308 lands on the canonical one
     * and costs a round trip before the page starts. url-helpers is the one
     * place that knows where a creator page lives.
     */
    const framedSrc = strip(read("components/app/creator-page-workspace.tsx"))
    check(
      "the workspace frames the canonical address through url-helpers",
      /getStoreInternalPath\(encodeURIComponent\(handle\)\)\}\?embedded=1/.test(framedSrc),
    )
    check("and no longer hardcodes the address it redirects from", !/`\/u\/\$\{/.test(framedSrc))
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
    /*
      DASHBOARD-CLIENT IS NOT ON THIS LIST ANY MORE, and that is a removal
      rather than a regression. Its only link here was a "Customize page"
      button inside the Quick access popover, taken out on the owner's
      instruction: that panel answers "what are my addresses?", and every row
      in it is something to copy and hand to somebody else. The workspace is
      still reached from the three below, which is what this check is for.
    */
    const entries: Array<[string, string]> = [
      ["components/app/sidebar.tsx", '"/creator-page"'],
      ["components/storefront/owner-menu.tsx", '"/creator-page"'],
      /* Settings' Stores tab, which linked here, is gone: the sidebar is the way in. */
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
      /* The dashboard's share sheet copies, encodes and shares the address, so it
         uses the share helper, which is absolute in the app as in a browser. */
      check(`${name} builds the website address from the helper`, code.includes("getWebsiteUrl(") || code.includes("getWebsiteShareUrl("))
      check(`${name} lists Website in quick access`, />Website<\/(div|p)>/.test(code) || /label: "Website"/.test(code))
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
      /* Home asks for one published RIGHT NOW, by the status the builder sets on
         publish and takes away on unpublish (lib/home/progress WEBSITE_LIVE_STATUS),
         which is also there on a database without published_at. Either is a test
         of being published, never of merely existing. */
      check(
        `${server} tests being published rather than existence`,
        /\.not\("published_at", "is", null\)/.test(code) || /\.eq\("status", WEBSITE_LIVE_STATUS\)/.test(code),
      )
    }

    /** All three surfaces, and the page is not listed twice under two names. */
    check("the creator page is no longer called Store in quick access", !/>Store<\/(p|div)>/.test(dash + settings))

    /*
      AND THE PANEL IS ADDRESSES ONLY. Two buttons sat above the rows, "View
      page" and "Customize page"; they were removed on the owner's
      instruction. Opening the page is what a row already does, and the editor
      is in the nav, so the pair only made the three addresses harder to read.
    */
    check("no action buttons above the addresses", !/>\s*View page\s*</.test(dash) && !/>\s*Customize page\s*</.test(dash))
  }

  // ── 7. Editing in place: the CTA bar and a way to be contacted ─────────
  {
    const cta = read("components/storefront/edit-cta-button.tsx")
    const page = read("app/(marketing)/u/[username]/page.tsx")
    const api = read("app/api/creator-profile/route.ts")

    check("the CTA bar has an editor", existsSync(join(root, "components/storefront/edit-cta-button.tsx")))
    check("it writes through the route that already does auth and ownership", cta.includes('"/api/creator-profile"'))
    /**
     * THE PENCIL IS INSIDE THE BAR, not a sibling of it on the page. It has to
     * be: it edits the bar's colours now, the draft it produces is state, and
     * two siblings in a Server Component cannot share state.
     */
    check("only the owner sees the pencil", /viewerIsOwner \? \(/.test(page) && page.includes("<LiveSubscribeBar"))
    check("and a visitor gets the plain bar", /\) : \(\s*<SubscribeBar settings=/.test(page))
    /**
     * The bar generates its own sentence from a preset when nothing is
     * stored, so seeding the dialog from the raw value would open two empty
     * boxes on a bar that plainly says something.
     */
    check(
      "it is seeded with what the bar actually shows",
      page.includes("subscribeBarSettings.customCtaText || subscribeBarSettings.text") &&
        page.includes('storedBar.buttonTextPreset === "custom"'),
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
    /**
     * The block still surfaces it as a mail link — the link is just produced
     * by ContactReveal, after the button is pressed, rather than printed into
     * the block. Both halves are checked so neither can quietly go away.
     */
    check(
      "and the block offers it, revealed by a button",
      renderer.includes("<ContactReveal email={contactEmail} />") &&
        read("components/storefront/contact-reveal.tsx").includes("href={`mailto:${email}`}"),
    )
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
     *
     * The ORDER is the rule, not where it is written. It used to be this
     * expression inline at the About call site; it is one constant now,
     * because the header line shows the same address and two copies of a
     * fallback are two things to keep in step.
     */
    /*
      The ORDER is still the rule and it still lives in one expression. The
      name changed: what that expression produces is now what the page shows
      TO A BUYER, and `publicContactEmail` is that value after the purchase
      gate. See tests/contact-gate.test.ts for the gate itself.
    */
    check(
      "the typed address wins and the account's only stands in",
      page.includes("const resolvedContactEmail = headerSettings.contactEmail || profile.email || undefined"),
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
    /**
     * This named the route's own copy of the reserved list. There were three
     * copies and they had drifted; there is one now, in
     * lib/routes/reserved-segments, checked against the filesystem by
     * tests/reserved-segments. The question is unchanged — a platform path
     * must never be read as a creator and a product.
     */
    check(
      "and a reserved first segment is not read as a creator",
      nestedCode.includes("isReservedRootSegment") && nestedCode.includes("notFound()"),
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

    /**
     * The page does not call these AT ALL now: resolving what the bar says is
     * the bar's own job, and the editor beside it is a client component that
     * asks the same lib. So the check is the stronger one — the page must not
     * import a resolver from anywhere, lib included, because importing one is
     * how it ends up calling one.
     */
    check(
      "the server component resolves none of this itself",
      !/import \{[^}]*get(DisplayText|ButtonText)[^}]*\}/.test(page),
    )
    check(
      "and nothing reaches for one out of the client module",
      !/import \{[^}]*get(DisplayText|ButtonText)[^}]*\} from "@\/components\//.test(page),
    )
    check(
      "the bar's own editor asks the lib, not the bar",
      read("components/store-builder/live-subscribe-bar.tsx").includes('from "@/lib/store-builder/editor-channel"'),
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
     * A CIRCLE. It was a rounded square for two rounds, on the argument that
     * the app-icon shape agrees with the Storelib mark above it; the owner has
     * asked for a circle and it is their page. The known cost stands: the crop
     * behind it is square, so a circle throws the corners away, which is the
     * same cost every social network pays.
     *
     * It is still set INLINE, and that is the part worth holding: ui/avatar
     * bakes `rounded-full` into its root and the ring beside it is an inline
     * style too, so a class here would be a coin toss between two equally
     * specific rules.
     *
     * THE RING FOLLOWS THE SCHEME. A stored "#e5e7eb" is the platform default
     * rather than a decision, so a dark page had a light grey hoop around the
     * one round thing on it.
     */
    const renderer = read("components/store-builder/unified-section-renderer.tsx")
    check("the avatar is a circle", /borderRadius: "9999px"/.test(renderer))
    check(
      "set inline, where it outranks ui/avatar's own rule",
      /style=\{\{[\s\S]{0,400}borderRadius: "9999px"/.test(renderer),
    )
    check(
      "and its ring comes from the scheme when nobody chose one",
      renderer.includes("surface?.avatarBorderColor") && read("lib/store-builder/storefront-chrome.ts").includes("avatarBorder"),
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
     * the eight schemes offered, held to WCAG AA (4.5) for body text and 3.0
     * for the large Featured heading. This turns "applies well" from an
     * opinion into a number.
     */
    const AA = 4.5
    const LARGE = 3.0
    const r = (fg: string, bg: string) => contrastRatio(parseColor(fg)!, parseColor(bg)!)
    const PAGE_FIELD = "#f7f7f8"
    const white = (c: string) => /^#(fff|ffffff)$/i.test(c.trim())
    for (const key of ["default", "blacks", "cream", "sage", "harbor", "clay", "pink", "astrid", "graphite"] as const) {
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
    for (const key of ["default", "blacks", "cream", "pink", "astrid", "graphite"] as const) {
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

  /*
   * DARK IS A COLOUR, NOT A NAME. The product page, its skeletons and the
   * builder's loading states asked `themePreset === "astrid"`, so no other
   * dark scheme could be offered: the creator page went dark by its colours
   * and the product page it opened stayed light. Every scheme keeps the
   * answer it had (astrid dark, the light ones light); fusion, whose page is
   * #0f0f1a, is dark now too, where its product page drew black stars and
   * black type on it.
   */
  {
    const expectDark: Record<string, boolean> = {
      default: false, air: false, bubble: false, pink: false, cream: false, sage: false, harbor: false, clay: false, blacks: false,
      astrid: true, fusion: true, graphite: true,
    }
    for (const key of Object.keys(themePresets)) {
      check(`${key} is ${expectDark[key] ? "dark" : "light"} by its own page colour`, key in expectDark && isDarkScheme(key) === expectDark[key], `${key}: ${isDarkScheme(key)}`)
    }
    check("a page stored on a retired dark scheme stays dark; an unknown name is light", isDarkScheme("midnight") && !isDarkScheme("nonsense") && !isDarkScheme(undefined))
    /* The product page as it was on every light scheme: its stored colour, as stored. */
    for (const key of Object.keys(themePresets)) {
      if (expectDark[key]) continue
      for (const stored of ["#ffffff", "#FAF4E8", undefined]) {
        const tone = productPageTone({ globalSettings: { themePreset: key }, globalColors: { backgroundColor: stored } })
        check(`${key}: the product page paints what it did (${stored ?? "nothing stored"})`, !tone.isDarkTheme && tone.pageBackgroundColor === stored && tone.ratingStarColor === "#000000", tone.pageBackgroundColor)
      }
    }
    const astridOnWhite = productPageTone({ globalSettings: { themePreset: "astrid" }, globalColors: { backgroundColor: "#ffffff" } })
    const astridChosen = productPageTone({ globalSettings: { themePreset: "astrid" }, globalColors: { backgroundColor: "#111113" } })
    check("astrid's product page is dark, on its own #111113 even where the builder's white was left stored",
      astridOnWhite.isDarkTheme && astridOnWhite.pageBackgroundColor?.toLowerCase() === "#111113" && astridChosen.pageBackgroundColor === "#111113"
        && astridOnWhite.ratingStarColor === "#fafafa" && astridOnWhite.categoryBadgeStyle?.backgroundColor === "#2a2a2a", astridOnWhite.pageBackgroundColor)
    const decided = [
      "app/(marketing)/p/[slug]/page.tsx",
      "app/(marketing)/p/[slug]/layout.tsx",
      "app/(marketing)/u/[username]/layout.tsx",
      "components/store-builder/public-page-skeleton.tsx",
      "components/store-builder/preview-canvas.tsx",
      "components/store-builder/unified-section-renderer.tsx",
      "components/store-builder/sections-sidebar.tsx",
      "components/product/refund-policy-display.tsx",
    ]
    for (const f of decided) {
      check(`${f} asks the scheme's colours, not its name, whether it is dark`, !/["']astrid["']/.test(read(f)) && !/DARK_PRESETS/.test(read(f)))
    }
    check("the product page's dark is the scheme's, from the one function the chrome probe measures",
      /productPageTone\(productPageConfig\)/.test(read("app/(marketing)/p/[slug]/page.tsx"))
        && /const isDarkTheme = isDarkScheme\(themePreset\)/.test(read("lib/store-builder/product-page-tone.ts")))
    check("and on a dark scheme its own colour is the scheme's unless one was chosen, not the builder's inherited white",
      /const pageBackgroundColor = tonePageBackground/.test(read("app/(marketing)/p/[slug]/page.tsx"))
        && /isDarkTheme\s*\?\s*resolveStorefrontChrome\(themePreset, \{ pageBackground: stored \}\)\.pageBackground\s*:\s*stored/.test(read("lib/store-builder/product-page-tone.ts")))
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
    /*
      The select this pinned was generateMetadata's own profile query, which
      is gone: metadata now shares the page's deduped loader. The address the
      contact default falls back to comes from that loader's row, which asks
      for every column, so it still arrives on the server.
    */
    check(
      "the page fetches the account email for the contact default",
      page.includes("await loadProfileByUsername(username)") &&
        /\.from\("profiles"\)\s*\.select\("\*"\)/.test(read("lib/commerce/creator-page-data.ts")),
    )
    /*
      THE CLIENT HEADER NEVER SEES THE ACCOUNT ROWS. It was handed the whole
      profiles and creators rows, so the account email, the Stripe ids and the
      plan were in the HTML of every creator page. Found by reading the RSC
      payload of a live page.
    */
    check(
      "the header is handed the fields it draws, not the account rows",
      !/creator=\{creator\}/.test(page) && !/profile=\{profile\}/.test(page) &&
        (page.match(/creator=\{headerCreator\}/g) ?? []).length === 2,
    )
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
     * THE CREATOR PAGE IS A PROFILE CARD — in the rail and in search, which
     * are two lists that had drifted apart before.
     *
     * Not a shopfront, which named the one thing it is not. And not a plain
     * silhouette either: that is what the account menu's avatar is, and a
     * lighter version of the People row below it, so the rail ended up with
     * two people in it and one of them was a page.
     */
    const rail = read("components/app/sidebar-desktop-nav.tsx")
    const sidebar = read("components/app/sidebar.tsx")
    check(
      "the rail's Creator Page icon is a profile card",
      /storeBuilder: \{ line: CreatorPageLinear, fill: CreatorPageBold \}/.test(rail) &&
        /linear\/user-id/.test(rail),
    )
    /* The search draws no icon per row any more (components/app/app-search.tsx),
       so there is no second icon to drift from the rail's: it names the page
       the same and sends it to the same address. */
    check(
      "and search names it the same, at the same address, with no icon of its own",
      /\{ label: "Creator Page", href: "\/creator-page", group: "Pages"/.test(read("lib/search/app-pages.ts")) &&
        !/icon/i.test(read("lib/search/app-pages.ts")) &&
        !/ContactRound/.test(sidebar),
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
    /**
     * The bar editor does not: it is on the page now, inside the frame, and
     * there it is a Dialog like every other editor on that page. InlinePanel
     * is for a card that belongs to the WORKSPACE, and the share card is the
     * only one of those left.
     */
    check("and the workspace has no panel of its own left", !workspace.includes("<InlinePanel"))
    /**
     * NO X. The card decides nothing and traps nothing: clicking off it,
     * Escape and a downward drag on the sheet all close it, so a close button
     * in the corner only made it look like a dialog waiting for an answer.
     */
    check("the share card has no close button", !/aria-label="Close"/.test(share) && !/<X /.test(share))
    check("Escape still closes it", panel.includes('e.key === "Escape"'))
    /* The app's own sheet since the builder's lagged on close (scripts/check-creator-editor measures it). */
    check("and a phone gets a real bottom sheet", share.includes("<BottomSheet") && !share.includes("<MobileEditorSheet"))
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

    const bar = read("components/storefront/edit-cta-button.tsx")
    check("every change is handed to the bar, not just the save", /onPreview\?\.\(next\)/.test(bar))
    check("and cancelling puts the bar back", /onPreview\?\.\(null\)/.test(bar))
    check("the bar is what holds the draft", live.includes("setDraft(next ? toDraft(next) : null)"))
    /**
     * IT IS ALL IN ONE DOCUMENT NOW. The editor used to live in the workspace
     * and shout the draft across the frame boundary on every keystroke; it is
     * beside the bar it edits, so a keystroke is a setState. What still
     * crosses the boundary is one message after a save.
     */
    check("and a save is the only thing that crosses the frame", read("lib/store-builder/editor-channel.ts").includes('kind: "saved"'))

    /**
     * THE LISTENER IS NOT ON A PUBLIC PAGE. A message is an input from
     * outside, and what it carries is painted onto a storefront. Three gates:
     * only rendered for a framed owner, only this origin, only the window
     * that frames us.
     */
    check("the live bar is only mounted for the owner", /viewerIsOwner \? \(/.test(page) && page.includes("<LiveSubscribeBar"))
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

  /* ------------------------------------------------------------------ */
  {
    /**
     * A BUYER CAN REACH THE SELLER, ON EVERY CREATOR PAGE.
     *
     * The address was rendered only inside the About block, and About is a
     * section a creator may never have added — so on most pages there was no
     * way to write to the person selling. It is on the header's meta line
     * now, the one that is always under the bio.
     *
     * That the link is really there, points at the right address and is not
     * a dead `mailto:` when a creator has none, is measured in a browser by
     * scripts/check-contact-line.mjs.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const page = code("app/(marketing)/u/[username]/page.tsx")
    /**
     * IN THE ABOUT BLOCK, AND NOWHERE ELSE.
     *
     * It sat on the header's line under the bio for a day. That line is the
     * follower count, the sales badge and the creator's social links — who
     * they are and where else they are — and a way to email them read oddly
     * among them. About is where dealing with this person belongs, and it is
     * a LOCKED default section, so every creator page has one.
     */
    check(
      "the contact is in About and on no other line",
      (renderer.match(/<ContactReveal/g) ?? []).length === 1 &&
        renderer.includes("<ContactReveal email={contactEmail} />"),
    )
    check(
      "and the header carries no contact of its own",
      !/contactEmail\?: string\n\}/.test(renderer.slice(renderer.indexOf("UnifiedShopHeaderProps"))),
    )
    const reveal = code("components/storefront/contact-reveal.tsx")
    check(
      "the address is not rendered until the button is pressed",
      /if \(!shown\) \{/.test(reveal) && /setShown\(true\)/.test(reveal),
    )
    /**
     * ONE EXPRESSION, NOT THREE. The address was worked out inline at each
     * place that showed it, which is how the header's line and the About
     * block would have come to disagree the first time either was edited.
     */
    check(
      "and it is resolved once for the whole page",
      /const resolvedContactEmail = headerSettings\.contactEmail \|\| profile\.email \|\| undefined/.test(page) &&
        (page.match(/headerSettings\.contactEmail \|\| profile\.email/g) ?? []).length === 1,
    )
    /**
     * About is a locked default section — hideable, not deletable — so this
     * is what makes "in About" the same as "on every creator page".
     */
    const defaults = code("lib/store-builder/defaults.ts")
    check(
      "About is a locked default section, so every creator page has one",
      /type: "about",[\s\S]{0,200}locked: true/.test(defaults),
    )
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * =====================================================================
     *  A WRAPPER THAT FORWARDS BY NAME CAN DROP ONE
     * =====================================================================
     * SectionRenderer lists every prop it takes and passes them on one by
     * one. `sellerContactEmail` was never in that list, so the creator page
     * handed it an address, the wrapper dropped it, and the About block
     * showed no Contact — for as long as the feature had existed.
     *
     * Nothing failed. The page's call had a prop the wrapper's type does not
     * declare, which IS a type error, and next.config.mjs sets
     * `ignoreBuildErrors`. Same shape as the chart's missing
     * `lastTouchXRef`: a green build over code that cannot work.
     *
     * So this compares the two halves. Every name the wrapper accepts has to
     * come out the other side, and adding one to either half alone is caught
     * here rather than by somebody noticing a blank space on a page.
     */
    const wrapper = read("components/store-builder/section-renderer.tsx")
    const body = wrapper.slice(wrapper.indexOf("export function SectionRenderer"), wrapper.indexOf("// ====== SHOP HEADER RENDERER"))
    const destructured = body.slice(0, body.indexOf("}: {"))
    const forwarded = body.slice(body.indexOf("<UnifiedSectionRenderer"))

    const taken = [...destructured.matchAll(/^\s{2}([a-zA-Z][\w]*)(?:\s*=[^,]*)?,$/gm)].map((m) => m[1])
    const given = new Set([...forwarded.matchAll(/^\s*([a-zA-Z][\w]*)=\{/gm)].map((m) => m[1]))
    const dropped = taken.filter((n) => !given.has(n))

    check("the wrapper's props were found", taken.length > 10, `found ${taken.length}`)
    check(
      "every prop SectionRenderer takes is passed on",
      dropped.length === 0,
      dropped.length ? `dropped on the floor: ${dropped.join(", ")}` : undefined,
    )
    check(
      "and the contact address is one of them",
      taken.includes("sellerContactEmail") && given.has("sellerContactEmail"),
    )
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * =====================================================================
     *  THE PRODUCT PAGE'S TOP BAR, AND ITS BUYING CARD
     * =====================================================================
     * THE BAR carries a newsletter form again. It was taken out on the
     * argument that the first thing a visitor meets on a page they came to
     * look at a thing should not be a request for their address; the owner
     * asked for it back and it is their shop. The argument is answered by
     * ORDER rather than by absence — who is selling and the way back come
     * first, reading left to right, and the field is at the far end.
     *
     * ONE BAR, TWO PAGES. Its colours and its button label are the creator
     * page's own bar's, resolved by resolveStorefrontChrome from the shop
     * config, so editing one changes both and the scheme paints both.
     *
     * THE CARD carried `sticky top-6` and has never stuck, because the grid
     * used `items-start` — which shrinks a grid item to its content, so the
     * column was exactly the card's height and a sticky element with nowhere
     * to travel behaves like one with no sticky at all. The geometry is
     * measured in scripts/check-buy-card.mjs; the rule is held here, because
     * the class is invisible in a screenshot and looks right in the source.
     */
    const bar = code("components/store-builder/product-creator-bar.tsx")
    const live = bar.slice(bar.indexOf("export function LiveProductCreatorBar"))
    check("the live bar asks for an email address", /<Input/.test(live) && /type="email"/.test(live))
    check("and offers a follow button", /<Button/.test(live))
    /** The two facts a product page's top edge is for come first in the row. */
    check(
      "with the way back and the seller ahead of it",
      live.indexOf("<BackControl") < live.indexOf("<Input") && live.indexOf("<SmartLink") < live.indexOf("<Input"),
    )
    /** One bar, two pages: the product page resolves it from the shop's. */
    const productPage = code("app/(marketing)/p/[slug]/page.tsx")
    check("the product page resolves the bar from the creator's", productPage.includes("resolveStorefrontChrome("))
    check("colours and all", productPage.includes("buttonColor: shopChrome.bar.buttonColor"))
    check("and the label the creator typed", productPage.includes("creatorBarLabel") && /buttonLabel\?\.trim\(\)/.test(bar))
    check(
      "it carries a way back",
      /<BackControl onBack=\{goBack\} href=\{fallbackHref\(creatorHref\)\}/.test(live) && /goBackOr\(/.test(bar) && /window\.history\.back\(\)/.test(code("lib/navigation/go-back.ts")),
    )
    /*
      The fallback is a router.push now, not an assignment to location. Same
      destination, and the claim here is unchanged; what changed is that it no
      longer throws the document away and loads the whole shell again, which
      was the white flash on the way back.

      AND WHAT DECIDES BETWEEN THEM IS NO LONGER `document.referrer`, which is
      the fault this line used to pin in place. A referrer describes how the
      DOCUMENT was fetched, and pressing a product card does not fetch one, so
      the commonest visit of all — creator page, tap a product, tap back — read
      as "arrived from nowhere" and took the fallback every time. Timed against
      production that path is 2.0 to 3.5 seconds of the same page, which is why
      the arrow was being pressed twice. The referrer is still consulted, inside
      canReturnInApp, for a hard load that really did come from a page of ours.

      THE DECISION NOW LIVES IN lib/navigation/back-plan (tests/back-plan.test.ts
      runs it case by case): the browser's own navigation.canGoBack first, the
      app's count after it, and a back that never shows itself goes to the
      creator's page, so there is no spinner that lasts for ever.
    */
    check(
      "which falls back to the creator's page when there is no history of ours",
      /goBackOr\(target, \(href\) => \{\s*startBackTransition\(\(\) => router\.push\(href\)\)/.test(bar) && /const target = fallbackHref\(creatorHref\)/.test(bar),
    )
    /*
      AND THE TAP HAS TO ARRIVE THE FIRST TIME, which is the other half of
      "I have to press it twice" and a completely separate fault.

      Driven against production with touch emulated: scroll down the product
      page, scroll back up so the bar returns, tap the arrow — and the page
      reports `pointerdown -> button[Back]`, `pointerup -> button[Back]`,
      `click -> null`. A touch that lands while the page is still flinging is
      spent stopping it and the browser withholds the click, so an onClick
      handler never runs. Pointer events are delivered either way.
    */
    {
      const tapHook = code("lib/gestures/use-tap.ts")
      check(
        "the arrow acts on the pointer coming up, not on a click",
        /const tap = useTap\(onBack\)/.test(bar) && !/onClick=\{onBack\}/.test(bar),
        "a click after a fling is a click the browser does not send",
      )
      check(
        "the gesture is captured, so a bar sliding into place is still hit",
        /setPointerCapture\(e\.pointerId\)/.test(tapHook),
        "a click goes to the common ancestor of down and up; a control that moved between them gets none",
      )
      check(
        "a drag off the control is not a tap",
        /g\.moved = true/.test(tapHook) && /TAP_SLOP_PX/.test(tapHook),
      )
      check(
        "and the keyboard still works without firing twice",
        /if \(e\.detail > 0\) return/.test(tapHook),
        "Enter on a focused button is a click with detail 0; the touch's synthesised click is detail 1",
      )
    }
    check(
      "and it asks the app, not the document, whether there is one",
      !/document\.referrer/.test(bar) &&
        /noteClientNavigation/.test(code("components/platform/app-history-tracker.tsx")),
      "document.referrer cannot see a client navigation, which is how every product card is opened",
    )
    /*
      Two links, one on each bar. It was briefly one, while the phone bar
      carried the product instead of the creator; both bars lead to the
      creator's page again.
    */
    check(
      "both bars lead to the creator's page",
      (live.match(/<SmartLink\s+href=\{creatorHref\}/g) ?? []).length === 2,
    )
    /**
     * THE CREATOR'S PAGE, NOT THEIR WEBSITE.
     *
     * This went through `getStoreUrl`, which returns the SUBDOMAIN —
     * <handle>.storelib.com — and that is the site a creator builds in the
     * website builder, not the page this bar is about. The two have been
     * separate since websites moved to the subdomain; the bar kept calling
     * the helper it always had. So pressing the name of the person selling
     * you something landed on a different product entirely, one that may be
     * unpublished or empty.
     *
     * Measured in scripts/check-creator-bar.mjs, which reads the href the
     * bar actually renders: /u/andrewrullz.
     */
    check(
      "and it is the creator's page, not the subdomain website",
      /return creatorPageHref\(creatorUsername\)/.test(bar) && /return handle \? getStoreInternalPath\(handle\) : "#"/.test(code("lib/navigation/back-plan.ts")) && !/getStoreUrl\(/.test(bar),
    )
    /**
     * The bar shipped throwing: `goBack` read `creatorHref` in a dependency
     * array before the const was declared. TypeScript says exactly that and
     * `ignoreBuildErrors` swallowed it — reintroducing the bug still gives a
     * green `pnpm build`, and only the probe catches it. The order is held
     * here so the probe is not the only thing standing between that bug and
     * a broken product page.
     */
    check(
      "and the way back is declared after the address it uses",
      live.indexOf("const creatorHref = useMemo") < live.indexOf("const goBack = useCallback"),
    )

    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    check(
      "the buying card's column can stretch, so the card has room to stick",
      /"grid gap-8", !isMobile && "lg:grid-cols-5 lg:gap-12"/.test(renderer) &&
        !/lg:items-start/.test(renderer),
    )
    /**
     * AND IT IS THE PAGE'S HEADING THERE. The card's title was an h2 under a
     * duplicate h1 three hundred pixels to the left, so a wide screen printed
     * the product's name twice. The left one is hidden from `lg` up — which
     * is exactly where this card renders — so the name is read once, beside
     * its price.
     */
    check(
      "and the card is headed by the product, not by a number",
      /<h1[\s\S]{0,420}\{productTitle\}/.test(renderer),
    )
    /*
      It stands down on a PHONE too now: the title moved inside the buying
      card there, so the heading above the card would have been the product's
      name printed twice, which is the same fault this check was written for
      at desktop width.
    */
    check(
      "with the left heading standing down where this one appears",
      /"mt-6", isMobile && "hidden", !isMobile && "sm:mt-8 lg:hidden"/.test(renderer),
    )
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * ===================================================================
     *  A PRODUCT PAGE OPENS INSIDE THE CANVAS
     * ===================================================================
     * Clicking a product on the framed creator page ended in "storelib.com
     * refused to connect": X-Frame-Options doing its job on a page nobody had
     * told otherwise. A framed page whose own links are dead ends is a
     * preview, which is the thing this arrangement exists not to be.
     *
     * Two halves. The proxy relaxes framing for a product page carrying
     * ?embedded=1 and for nothing else, and the canvas puts the flag on the
     * link. What the second half REFUSES is the part worth measuring, so it
     * is a pure function and this runs it.
     */
    const HERE = "https://storelib.com/u/andrewrullz?embedded=1"
    const cases: Array<[string, string | null | undefined, boolean]> = [
      ["a product under a handle", "https://storelib.com/andrewrullz/a-tee", true],
      ["a product at the old address", "/p/a-tee", true],
      ["a relative link", "a-tee", true],
      ["one that already carries the flag", "/p/a-tee?embedded=1", false],
      ["another origin", "https://example.com/p/a-tee", false],
      ["a mail link", "mailto:hello@example.com", false],
      ["a phone link", "tel:+40700000000", false],
      ["an anchor", "#reviews", false],
      ["a blob", "blob:https://storelib.com/abc", false],
      ["nothing at all", "", false],
      ["a missing href", null, false],
    ]
    for (const [what, href, rewritten] of cases) {
      const out = embeddedHref(href, HERE)
      check(
        `${what} is ${rewritten ? "carried into the canvas" : "left alone"}`,
        rewritten ? out !== null && out.includes("embedded=1") : out === null,
        String(out),
      )
    }
    /** The query it already had has to survive, or a filtered link loses it. */
    check(
      "and an existing query survives",
      (embeddedHref("/p/a-tee?src=platform", HERE) ?? "").includes("src=platform"),
    )

    const nav = code("components/storefront/embedded-navigation.tsx")
    check("a modified click is left to the browser", nav.includes("event.metaKey"))
    check("and so is a link that means to leave the canvas", nav.includes('target !== "_self"'))
    check("the listener only exists inside a frame", nav.includes("isInEditorFrame()"))

    const proxy = read("proxy.ts")
    check("the proxy lets a product page be framed", proxy.includes('url.pathname.startsWith("/p/")'))
    check("but only with the flag, as before", proxy.includes('url.searchParams.get("embedded") === "1"'))
    check("and never treats an app route as a product", proxy.includes("FRAME_RESERVED_FIRST_SEGMENT"))
    check("the framed product page offers a way back", existsSync(join(root, "components/storefront/embedded-back-bar.tsx")))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * ===================================================================
     *  NO SEAM WHERE TWO NEARLY-EQUAL COLOURS MEET
     * ===================================================================
     * Astrid painted the page #0a0a0a and the Featured band #0f0f0f. Five
     * values out of 255: too small to read as a decision, big enough to draw
     * a LINE across the page under the tab strip, which reads as a rendering
     * fault. Pink had the same fault at the light end.
     *
     * The rule is not "they must match" — cream's band matches its page and
     * that is fine, and a scheme is allowed a real band. It is that a
     * difference must be a CHOICE: either none, or one somebody can see.
     */
    const SAME = 0
    const VISIBLE = 12 // out of 255, per channel
    for (const key of ["default", "blacks", "cream", "pink", "astrid"] as const) {
      const t = themePresets[key]
      const page = parseColor(t.sections.pageBackgroundColor)!
      const band = parseColor(t.sections.featuredProductsBackgroundColor)!
      const delta = Math.max(Math.abs(page.r - band.r), Math.abs(page.g - band.g), Math.abs(page.b - band.b))
      check(
        `${t.name}: the Featured band is either the page or plainly not`,
        delta === SAME || delta >= VISIBLE,
        `${t.sections.pageBackgroundColor} vs ${t.sections.featuredProductsBackgroundColor}, ${delta}/255 apart`,
      )
    }
    /** And the dark scheme is a dark grey rather than the panel switching off. */
    const astrid = parseColor(themePresets.astrid.sections.pageBackgroundColor)!
    check(
      "Astrid is dark grey, not pitch black",
      Math.max(astrid.r, astrid.g, astrid.b) >= 14,
      themePresets.astrid.sections.pageBackgroundColor,
    )
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * YOUR STORY IS WRITTEN, NOT TYPED INTO A BOX. It was a six-row textarea,
     * so the one block on a creator page that is actually prose was the one
     * place in the product with no headings, no emphasis and no lists.
     */
    const about = read("components/storefront/edit-about-button.tsx")
    const api = read("app/api/creator-profile/route.ts")
    const renderer = read("components/store-builder/unified-section-renderer.tsx")
    const css = read("app/globals.css")

    check("the story is a rich text field", about.includes("<RichTextField"))
    check("and it is the website builder's own", about.includes('from "@/components/website-builder/rich-text-field"'))
    check("not a textarea any more", !about.includes("<Textarea"))
    /**
     * IT IS HTML NOW, so it is sanitised where the authority is. A creator
     * page is served from storelib.com: script in a creator's own story runs
     * on this origin, in the session of whoever opens their page.
     */
    check("what is saved is sanitised", api.includes("sanitizeRichText(raw)"))
    check("through the allow list the rest of the product uses", api.includes('from "@/lib/website-builder/sanitize"'))
    check("the renderer prints markup as markup", renderer.includes("dangerouslySetInnerHTML={{ __html: settings.aboutContent"))
    /** A story with no tags in it keeps its line breaks, which is all it has. */
    check("and a plain story still keeps its line breaks", renderer.includes('<p className="whitespace-pre-wrap">{settings.aboutContent}</p>'))
    /** Preflight flattens h2 and ul to nothing, so markup needs typography. */
    check("written text is given typography", css.includes(".storelib-prose ul { list-style: disc"))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * ===================================================================
     *  THE PENCIL IS IN THE BAR, NOT OVER IT
     * ===================================================================
     * It was positioned against a `relative` div wrapping the bar, and that
     * cannot work for the bar this product ships: sticky renders
     * `position: fixed` plus a 76px spacer, so the wrapper contributes no
     * height of its own and an absolutely positioned child lands on the
     * SPACER — floating in the empty strip underneath, which is exactly what
     * it looked like. A slot in the row instead.
     */
    const live = code("components/store-builder/live-subscribe-bar.tsx")
    const bar = code("components/store-builder/subscribe-bar.tsx")
    check("the bar takes the owner's control as a slot", bar.includes("ownerAction?: React.ReactNode"))
    check("and renders it in the row, beside the sentence", (bar.match(/\{ownerAction\}/g) ?? []).length === 2)
    check("nothing positions it over a wrapper any more", !/absolute inset-y-0 left-2/.test(live))
    check("because the bar can be fixed", bar.includes('"fixed left-0 right-0 w-full'))
    /** A 28px chip beside a sentence on a 390px screen competes with it. */
    const pencil = read("components/storefront/edit-cta-button.tsx")
    check("and it is smaller and plainer on a phone", pencil.includes("h-6 w-6") && pencil.includes("sm:h-7 sm:w-7"))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * ===================================================================
     *  THE CANVAS BROWSES, IT DOES NOT BUY
     * ===================================================================
     * The workspace frames the real product page, so the buy button on it is
     * the real buy button: pressing it started a real checkout for the
     * creator's own product, in a frame that cannot show the checkout page.
     * What a creator saw was the canvas going white with "refused to
     * connect".
     *
     * Refused twice, because a button is not a link.
     */
    const HERE = "https://storelib.com/u/andrewrullz?embedded=1"
    for (const href of ["/checkout?productId=1", "/purchase/success", "/library/my-downloads", "/app/settings", "/downloads"]) {
      check(`${href} is not followed inside the canvas`, canvasRefusesHref(href, HERE), href)
    }
    for (const href of ["/p/a-tee", "/u/someone", "/andrewrullz/a-tee", "https://example.com/checkout"]) {
      check(`${href} still is`, !canvasRefusesHref(href, HERE), href)
    }

    const buy = code("components/checkout/buy-button.tsx")
    const sticky = code("components/store-builder/sticky-add-to-cart.tsx")
    const hook = read("components/storefront/use-editor-frame.ts")
    check("the buy button stands down in a frame", buy.includes("if (inEditorFrame || loading) return") && buy.includes("disabled={disabled || inEditorFrame}"))
    check("and so does the sticky one", sticky.includes("if (inEditorFrame) return"))
    check("both ask the same question", buy.includes("useEditorFrame()") && sticky.includes("useEditorFrame()"))
    /**
     * STATE, NOT A BARE READ. The server renders this false and the first
     * client render has to agree, or every product page throws a hydration
     * mismatch.
     */
    check("and it is state, so the first client render matches the server", hook.includes("useState(false)") && hook.includes("useEffect("))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * ===================================================================
     *  ONE PRODUCT CARD IN THIS PRODUCT
     * ===================================================================
     * "More from the seller" drew its own: a thumbnail, a truncated title and
     * a price, with its own hover and its own colour plumbing. So the cards
     * on a product page were a different size, a different type scale and a
     * different shape from the ones on the creator page two clicks away, and
     * the rating, the category pill and the struck-through original price
     * simply did not exist on them.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const section = renderer.slice(renderer.indexOf("function UnifiedMoreFromSellerSection"))
    check("More from the seller renders the shared card", section.includes("<StorefrontProductCard"))
    check("and draws none of its own", !/aspect-video bg-muted relative overflow-hidden/.test(section))
    check("with the colours the theme gives it", section.includes("cardAccents(cardBgColor, cardTextColor)"))
    /*
      IT SAT IN A 1150px COLUMN while the page's own content is 1200, and the
      reviews were in a third one at 1180 on a different padding scale. There
      is one constant now, so this checks that all three use it rather than
      that all three repeat the same string — which is what let them drift in
      the first place.
    */
    const container = renderer.match(/const PRODUCT_SECTION_CONTAINER = "([^"]+)"/)
    check("there is one container for a product page's sections", Boolean(container), "no PRODUCT_SECTION_CONTAINER")
    check(
      "and it is the 1200px column",
      container?.[1] === "mx-auto w-full max-w-[1200px] px-3 sm:px-4 lg:px-6",
      container?.[1],
    )
    check("More from the seller uses it", section.includes("PRODUCT_SECTION_CONTAINER"))
    check(
      "and so do the reviews",
      renderer.slice(renderer.indexOf("function UnifiedReviewsSection")).includes("PRODUCT_SECTION_CONTAINER"),
    )
    /*
      AND THE WRAPPER MUST NOT ADD PADDING ON TOP OF THEIR OWN COLUMN.

      Giving the reviews the shared container was half the fix and changed
      nothing on screen: the section wrapper was still applying
      spacing.paddingLeft to it, so the card sat one step further in than
      More from the seller, which is exempt. Measured on the deployed page at
      390px, More from started at 12px and the reviews at 16px.

      scripts/check-product-columns reads those edges off a real product page.
    */
    check(
      "and the wrapper adds no horizontal padding to a section that owns its column",
      /const ownsItsColumn = isMoreFromSeller \|\| isProductRail \|\| isReviews/.test(renderer) &&
        /paddingLeft: ownsItsColumn \? undefined : spacing\.paddingLeft/.test(renderer) &&
        /paddingRight: ownsItsColumn \? undefined : spacing\.paddingRight/.test(renderer),
      "horizontal spacing is the page's column, not a per-section setting",
    )
    check(
      "which is the product page's own column",
      /className="mx-auto w-full max-w-\[1200px\] px-3 sm:px-4 lg:px-6/.test(code("app/(marketing)/p/[slug]/page.tsx")),
    )
    check(
      "and the page does not change width halfway down",
      !/max-w-\[1100px\] px-3 sm:px-4 lg:px-6/.test(code("app/(marketing)/p/[slug]/page.tsx")),
      "the lower block was 1100 while the upper one was 1200",
    )
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * NO CATEGORY PILL ABOVE THE BIO. A grey badge naming the creator's niche
     * sat between the handle and the bio. The niche still exists, because it
     * is what /explore browses by, but it is a filing detail and it does not
     * belong on the line a visitor reads to find out who somebody is.
     *
     * These read comment-stripped source. The guard that checked the contact
     * line was passed by a comment quoting the code it was meant to forbid,
     * four separate times, which is why `code()` exists at the top of this
     * file and why it is used here.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const sidebar = code("components/store-builder/sections-sidebar.tsx")
    const types = code("lib/store-builder/types.ts")
    const defaults = code("lib/store-builder/defaults.ts")

    check("the profile no longer renders niche pills", !/settings\.showCategory|settings\.showNicheTags/.test(renderer))
    check("and no switch is left controlling nothing", !/label="Show Category"/.test(sidebar))
    check("the dead settings keys are gone from the type", !/showNicheTags|showCategory\?:/.test(types))
    check("and from the defaults", !/showNicheTags/.test(defaults))
    /**
     * The niche is kept. Removing the field would take creators out of
     * Explore, which is a far worse outcome than the pill ever was.
     */
    check("the niche is still editable", /storeNicheTags/.test(sidebar))
    check("and Explore still reads it", read("app/(marketing)/explore/page.tsx").includes("niche_tags"))
    /** Saying it is shown on the profile would now be untrue. */
    check(
      "the picker no longer claims the niche is shown on the page",
      !/niche shown on your profile/.test(sidebar),
    )
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * THE EDITOR IS ITS OWN SCREEN ON A PHONE TOO. The platform header was
     * drawn above the workspace's own bar, a second black band eating a
     * quarter of a phone's height on a page that is supposed to fill it.
     */
    const header = code("components/marketing/conditional-header.tsx")
    check("the platform header stands down on the editor", header.includes('p === "/creator-page" || p.startsWith("/creator-page/")'))
    check("before any host rule can put it back", /if \(isOwnScreen\(pathname\)\) \{\s*setShowPlatformHeader\(false\)\s*return/.test(header))
    check("and on the first paint too", header.includes("!isOwnScreen(pathname) &&"))

    /** A click in the canvas that fetches a whole page has to look like one. */
    const nav = code("components/storefront/embedded-navigation.tsx")
    check("leaving the page in the canvas dims it and starts a bar", nav.includes("setLeaving(true)") && nav.includes("creator-nav-bar"))
    check("which a bfcache return clears", nav.includes('"pageshow"'))
    check("the bar is honest about not knowing how far along it is", read("app/globals.css").includes("@keyframes creator-nav-bar"))

    /** The product page's strip reads as a bar, not the top of the page. */
    const pbar = read("components/store-builder/product-creator-bar.tsx")
    /* It has its own depth no longer: --bar-depth in globals.css is one
       value shared with the creator page's bar, and it went down to get
       there. tests/product-bars.test.ts checks the number itself. */
    check("the product page's bar casts a little shadow", /boxShadow: isDarkBackground \? "var\(--bar-depth-dark\)" : "var\(--bar-depth\)"/.test(pbar))
    check("and it is the same one the creator page's bar casts", /--bar-depth:/.test(read("app/globals.css")))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * ===================================================================
     *  ON A PHONE: THE BAR IS SEEN, THE SHEET OPENS HALFWAY, THE KEYBOARD
     *  DOES NOT THROW THE PAGE
     * ===================================================================
     */
    const workspace = code("components/app/creator-page-workspace.tsx")
    const sheet = code("components/storefront/editor-sheet.tsx")
    const mobileSheet = code("components/website-builder/mobile-editor-sheet.tsx")
    const picker = code("components/storefront/scheme-picker.tsx")

    /**
     * In the iOS shell the webview runs edge to edge, so a bar at top:0 is
     * painted BEHIND the status bar — 44 points of it, nearly all of it —
     * which is "the top bar is not showing". Read the inset, never branch on
     * a user agent.
     */
    /**
     * The padding beside the inset is not part of the question — it was 8px
     * and is 5px, because the bar was asked to lose a little height, and
     * scripts/check-workspace-bar is what measures that. What must not change
     * is that the inset is READ: a bar that adds a fixed number instead sits
     * behind the status bar on any phone whose notch is a different size.
     */
    check(
      "the toolbar sits under the status bar, not behind it",
      /paddingTop: "calc\(env\(safe-area-inset-top, 0px\) \+ \d+px\)"/.test(workspace),
    )
    check("and nothing sniffs a user agent to do it", !/navigator\.userAgent|isNativeApp\(\)/.test(workspace))

    /** A form that opens to the whole screen is a page, not a sheet. */
    /**
     * ONE STOP. Two made the height something to manage: a drag meant to
     * scroll the form resized the sheet instead, and it could be left at
     * either. One stop is a fixed sheet with a scroller in it.
     */
    /*
      78%, up from 60%. One stop is still the point; the number is the part
      that was wrong. At 60% a form with four fields in it was a three-field
      window with a scrollbar, and what is visible above the sheet either way
      is a strip of the page saying which page this is.
    */
    /*
      ONE STOP, sized to the form. A fixed 78% put the sheet's top edge across
      the cover on the page behind, and whatever was drawn there (the logo on
      the owner's banner) sat on the edge like a tab stuck to the sheet. It
      is as tall as its form now, up to nearly the whole screen, and the drag
      is only ever "close".
    */
    check("editors open to one stop and stay there", sheet.includes("fill") && sheet.includes("maxHeight={PHONE_EDITOR_MAX_HEIGHT}") && !sheet.includes("detents=") && !sheet.includes("openFull"))
    check("and the body is the sheet's own scroller", sheet.includes("data-sheet-scroll"))

    /*
      AND THE KEYBOARD DOES NOT COVER SAVE. The sheet stands on the keyboard
      (--kb-inset, published from visualViewport by ViewportVars, with a
      floor for a web view that reports nothing) and is never taller than
      the room it leaves, so the footer with Cancel and Save is always on it.
    */
    check("Cancel and Save ride on the keyboard", sheet.includes("aboveKeyboard"))
    check(
      "and the sheet reads the published keyboard, not a model of it",
      code("components/ui/bottom-sheet.tsx").includes("bottomAboveKeyboard()") &&
        code("components/ui/bottom-sheet.tsx").includes("calc(var(--vv-h, 100dvh) - 24px)"),
    )

    /*
      NO DIM, SO NOTHING TO MATCH. The phone editors do not darken the page
      any more, for the reason the desktop drawer never did: they edit the
      page behind them, and a dark fade over the cover a creator is changing
      was the thing reported. So the workspace's bar has no dim to follow.
    */
    check("the phone editor leaves the page behind undimmed", sheet.includes('scrim="clear"'))
    {
      /*
        AND ONLY THE EDITORS. A confirmation, a menu or an invoice is a
        question about nothing behind it, so every other phone sheet keeps
        the dim; "clear" is opt-in and the editor is the one that opts in.
      */
      const bottom = code("components/ui/bottom-sheet.tsx")
      check("every other sheet keeps its dim by default", /scrim = "dim",/.test(bottom) && /scrim === "clear" \? "bg-transparent" : "bg-black\/40"/.test(bottom))
    }

    /*
      A SAVE IN FLIGHT CANNOT BE CLOSED OUT FROM UNDER. Cancel was disabled
      while busy, but a tap above the sheet, a pull down or Escape still
      closed it; the save then finished after the sheet had gone, onClosed
      had already run with nothing to refresh, and the page kept the old
      values until a later Cancel refreshed it. scripts/check-cover-crop
      holds a save open and tries all three.
    */
    check("a close is refused while a save is in flight", /const close = React\.useCallback\(\(\) => \{\s*if \(busyRef\.current\) return\s*onClose\(\)/.test(sheet) && /onClose=\{close\}/.test(sheet) && /if \(!next\) close\(\)/.test(sheet))
    check("and the phone sheet springs back rather than leaving and returning", /dismissible=\{!busy\}/.test(sheet))
    {
      const bottom = code("components/ui/bottom-sheet.tsx")
      /* Springs back to where it rests: the top, or the lowered place a scheme preview put it (`lowered`). */
      check("the sheet's own refusal: not dismissible means a pull springs back", /if \(!dismissibleRef\.current\) \{\s*springBack\(/.test(bottom) && /glide\(from, rest, motion\.ms/.test(bottom) && /const rest = restRef\.current/.test(bottom) && /dismissible = true,/.test(bottom))
      check("an Escape a menu inside the sheet already used does not close the sheet too", /e\.defaultPrevented/.test(bottom) && /e\.isComposing/.test(bottom))
    }
    check("and tells the workspace nothing about it", !sheet.includes("notifyEditorSheet"))
    check("so the workspace has no dim of its own to keep in step", !workspace.includes('data.kind === "sheet"') && !/bg-black\/30 transition-opacity/.test(workspace))
    /**
     * The bar's hairline stays an inset shadow. It became one so a dim could
     * reach it (`absolute inset-0` stops at the padding box, a border is
     * outside it); the dim has gone, and a border back here would only add a
     * pixel to the bar's height.
     */
    check("the bar's hairline is an inset shadow, not a border", /shadow-\[inset_0_-1px_0_#e5e7eb\]/.test(workspace))
    check("so no border is left for the dim to miss", !/border-b border-\[#e5e7eb\] bg-white px-3 pb-2/.test(workspace))

    /*
      LEAVING LOOKS LIKE LEAVING THE OTHER EDITOR: the same glass, the same
      squares, and a ceiling on the navigation so it cannot hang.
    */
    check("going back puts up the builder's own leaving screen", workspace.includes('className="wb-leaving"'))
    check("with a ceiling on the navigation", workspace.includes("navigateWithCeiling("))
    check("and it can always come back down", /window\.addEventListener\("pageshow", onPageShow\)/.test(workspace))

    /*
      THE SAVE BUTTON KEEPS ITS WORD, AND THE WORD DOES NOT MOVE.

      Its whole label was swapped for a spinner first, so pressing Save removed
      the word entirely. Putting the spinner BESIDE the word fixed that and left
      the label sliding 12px sideways as the request went out, because the row
      is centred and the spinner joined it. It is absolutely positioned now and
      takes part in no layout, so the word is in the same place throughout.

      And it does not fade: `disabled` carries opacity-50 from the variants, so
      a save in flight looked like a button that had gone dead.
    */
    check("the word is still there under the spinner", /\{saveLabel\}/.test(sheet))
    /* No spinner now: "Save" eases into "Saving" in the same grid cell, so the cell keeps its width and nothing moves. */
    check("the busy state moves nothing", !/<Loader2/.test(sheet) && /col-start-1 row-start-1[\s\S]{0,400}\{saveLabel\}[\s\S]{0,600}col-start-1 row-start-1[\s\S]{0,300}Saving/.test(sheet))
    /* Not `disabled` at all now: that carried opacity-50 from the variants.
       See the note in tests/sheet-controls. */
    check(
      "and a save in flight is not disabled",
      (() => {
        /* The Save button only; Cancel is disabled={busy} and should be. */
        const save = sheet.slice(sheet.indexOf("aria-busy={busy"), sheet.indexOf("{saveLabel}"))
        return /disabled=\{saveDisabled\}/.test(save) && !/\sdisabled=\{busy/.test(save)
      })(),
    )
    for (const f of ["edit-cta-button", "edit-profile-button", "edit-about-button"]) {
      check(`${f} passes a word, not a spinner`, /saveLabel="Save"/.test(code(`components/storefront/${f}.tsx`)))
    }

    /**
     * THE KEYBOARD, FROM INSIDE A FRAME. An iframe's own visualViewport on
     * iOS does not shrink for the keyboard, so the sheet measured it as zero
     * and iOS scrolled the outer page instead — the sheet's top off the
     * screen, a strip of workspace under it. Same origin, so the parent's
     * viewport is readable, and that is where the keyboard is measured.
     */
    check("the sheet measures the keyboard from the window that has one", mobileSheet.includes("function keyboardWindow()") && mobileSheet.includes("const kb = keyboardWindow()"))
    check("guarded for a cross-origin parent", /window\.top[\s\S]{0,120}location\.origin === window\.location\.origin/.test(mobileSheet))
    check("and listens to that window's viewport too", mobileSheet.includes('kbvv.addEventListener("resize", update)'))
    /* Its own fixed box, which is its own window's; the keyboard is the parent's. */
    check("the sheet's own height still comes from its own window", mobileSheet.includes("setViewport(Math.round(fixedBoxHeight() || window.innerHeight"))
    /** And the outer document is told, twice, that it does not scroll. */
    check("the workspace locks its document", workspace.includes('root.style.overflow = "hidden"') && workspace.includes('body.style.overflow = "hidden"'))
    check("and puts a keyboard scroll back where it was", workspace.includes("window.scrollTo(0, 0)") && workspace.includes('vv?.addEventListener("resize", onViewport)'))

    /**
     * NO BUMP ON SELECT. The row is flex-wrap, so a button that changes
     * width on selection pushes its neighbours, possibly onto the next line.
     * Nothing about a button's box may depend on whether it is selected.
     */
    /* `min-w-0` (a grid cell that lets its name truncate) is not the zero-width tick this looks for. */
    check("selecting a scheme changes no button's size", !/(?<![-\w])w-0\b|w-3\.5 scale-100/.test(picker) && picker.includes('active ? "opacity-100" : "opacity-0"'))
    check("nor its position", !/translate-y/.test(picker))
    check("only colour, shadow, and the discs in their fixed box", picker.includes("transition-[background-color,border-color,box-shadow]") && picker.includes("style={{ width: 54 }}"))
  }

  /* ------------------------------------------------------------------ */
  {
    const mobileSheet = code("components/website-builder/mobile-editor-sheet.tsx")
    const css = read("app/globals.css")
    const workspace = code("components/app/creator-page-workspace.tsx")
    const cta = code("components/storefront/edit-cta-button.tsx")

    /**
     * THE PAGE BEHIND A SHEET DOES NOT SCROLL. The scrim caught a tap and
     * nothing else: a drag on it, or one inside the sheet that ran out of
     * scroller, went through to the document.
     */
    check("an open sheet locks the document", mobileSheet.includes('root.style.overflow = "hidden"') && mobileSheet.includes('body.style.overflow = "hidden"'))
    check("and puts the scroll position back", mobileSheet.includes("window.scrollTo(0, y)"))
    /** A peeking sheet is chrome, not something opened over a page. */
    check("but only a sheet with no peek", /if \(!open \|\| peekHeight > 0/.test(mobileSheet))

    /**
     * THE BLACK SHIELD. `html.capacitor::before` is a fixed pure-black layer
     * over the safe area at z-9999 — right for every page whose header is
     * black, and a band under the clock on one whose bar is white.
     */
    // Changed on purpose: the second half was `html.capacitor:has(.cp-editor)`.
    // A :has() whose subject is <html> restyled the whole document whenever
    // text anywhere was replaced, so the editor's root says it is there with
    // `.with-cp-editor`, from its first paint (components/platform/html-class.tsx).
    check("the shield stands down on the editor", css.includes("html.capacitor.cp-fullscreen::before") && css.includes("html.capacitor.with-cp-editor::before") && !css.replace(/\/\*[\s\S]*?\*\//g, "").includes("html.capacitor:has(.cp-editor)"))
    check("two rules, so neither class depends on the other", !/cp-fullscreen::before,\s*html\.capacitor\.with-cp-editor/.test(css))
    check("and the canvas behind it goes white with it", css.includes("html.capacitor.cp-fullscreen {\n  background-color: #ffffff;") && css.includes("html.capacitor.with-cp-editor {\n  background-color: #ffffff;"))
    check("the workspace carries both halves", workspace.includes('className="cp-editor relative') && workspace.includes('root.classList.add("cp-fullscreen")') && /className="cp-editor relative[^"]*">\s*<HtmlClass name="with-cp-editor" \/>/.test(workspace))

    /**
     * SAVING THE WORDS MUST NOT FREEZE THE COLOURS. The fields are seeded
     * with what the bar IS, which for an untouched colour is what the scheme
     * decided; writing all four back turned the scheme's answer into a stored
     * choice and the scheme could never paint the bar again.
     */
    check("the bar editor sends only what was touched", cta.includes("touched.has(key)") && cta.includes("subscribeBar: patch"))
    check("and sends nothing at all when nothing was", cta.includes("if (Object.keys(patch).length === 0)"))
    check("a reopened editor forgets what was touched", cta.includes("setTouched(new Set())"))

    /**
     * EVERY TOP BAR GETS OUT OF THE WAY. This existed in one place, written
     * inline, so the product page's creator bar was pinned forever.
     */
    const hook = read("lib/store-builder/use-reveal-on-scroll-up.ts")
    check("there is one reveal-on-scroll-up", hook.includes("export function useRevealOnScrollUp"))
    check("the subscribe bar uses it", code("components/store-builder/subscribe-bar.tsx").includes("useRevealOnScrollUp("))
    check("and so does the product page's bar", code("components/store-builder/discover-sticky-wrapper.tsx").includes("useRevealOnScrollUp()"))
    check("neither keeps a copy of the logic", !/const DELTA = 6/.test(code("components/store-builder/subscribe-bar.tsx")))
    /** One read per frame, a threshold, and state set only when it changes. */
    check("it reads once per frame", hook.includes("requestAnimationFrame(evaluate)"))
    check("ignores jitter", hook.includes("const DELTA = 6"))
    check("and is always visible near the top", hook.includes("const TOP_ZONE = 50"))

    /** 290px of dashed box for a control whose content is one line of text. */
    check("the add-another picker is compact", code("components/storefront/edit-about-button.tsx").includes('aspectRatio="compact"'))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * THE PRODUCT PAGE'S BAR ON A PHONE, AND THE MENU IS GONE.
     *
     * This bar has been three things. It carried an email form on a second
     * row; the form was squeezed onto one row to stop the bar being two
     * deep; and the owner then asked for it gone at this width entirely, so
     * a visitor meets the shop rather than a request for their address. The
     * pins for the one-row form went with it rather than being loosened:
     * there is no form here to measure.
     *
     * What is left is a picture, a name, one line of bio and the way back.
     * scripts/check-product-bar.mjs lays it out at 390px and at 1280px and
     * measures all of it; this guards the pieces that measurement needs.
     */
    const bar = code("components/store-builder/product-creator-bar.tsx")
    const product = code("app/(marketing)/p/[slug]/page.tsx")

    check("the phone bar is a single row", /data-product-bar="phone" className="flex w-full items-center gap-2\.5 px-3 py-2 sm:hidden"/.test(bar))
    check("and the form is not a second line under it", !/className="mt-2 flex w-full items-center gap-2"/.test(bar))
    /**
     * AND IT IS THE PRODUCT'S. The creator's name is the one fact a visitor
     * arriving from that creator already has, and the email field asked for
     * an address before they had decided anything. What a sticky bar can
     * carry that nothing else does is WHICH PRODUCT THIS IS, once the title
     * has scrolled away.
     */
    /*
      Scoped to the LIVE phone bar. The builder's preview of this bar is in
      the same file and still draws the old shape, so asking the whole file
      answers a different question.
    */
    const phoneBar = bar.slice(bar.indexOf('data-product-bar="phone"'), bar.indexOf("ProductBarMenu title="))
    check("the live phone bar exists to be checked", phoneBar.length > 200)
    check("no email field on it", !/<Input/.test(phoneBar) && !/placeholder="Email"/.test(phoneBar))
    /**
     * THE BAR IS THE CREATOR'S. It carried the product's thumbnail and title
     * for a round; the argument against is that the page under the bar is
     * already the product, in a picture the size of the screen, and a
     * visitor who scrolled past the title scrolled past it on purpose. What
     * is nowhere else is whose shop this is.
     */
    check("the creator is on it", /<Avatar className="h-8 w-8 shrink-0 bg-white\/10">/.test(phoneBar) && /\{creatorName\}/.test(phoneBar))
    check("and not the product's thumbnail", !/object-cover/.test(phoneBar))
    check("the name is what yields", /truncate text-sm font-semibold leading-tight/.test(phoneBar))

    /**
     * SHARE AND REPORT, IN AN INLINE MENU. It was a bottom sheet on a phone,
     * which is a lot of movement for a decision that takes none and puts the
     * answer at the opposite end of the screen from the finger that asked.
     */
    check("the menu is inline, not a sheet", /role="menu"/.test(bar) && !/MobileEditorSheet|ResponsiveActionMenu/.test(bar))
    /**
     * AND PORTALLED, WHICH IS NOT A DETAIL. It was `absolute` inside the bar,
     * and the bar's root carries `overflow-hidden` — so the menu hung below
     * the bar and every pixel of it was clipped away. It opened, it was in
     * the DOM, it had a width and a position, and there was nothing on the
     * screen. scripts/check-bar-menu.mjs hit-tests it now rather than
     * measuring its rectangle, because a clipped element still has one.
     */
    check("the menu is portalled out of the clipping bar", /createPortal\(/.test(bar) && /fixed z-\[2147483000\]/.test(bar))
    check("and positioned from the trigger it hangs off", /triggerRef\.current/.test(bar) && /getBoundingClientRect\(\)/.test(bar))
    check("and it grows from that corner", /\.product-bar-menu \{/.test(read("app/globals.css")))
    check("share goes through the phone's own sheet where there is one", /nav\?\.share/.test(bar))
    check("a press outside closes it", /document\.addEventListener\("pointerdown", onDown/.test(bar))

    /**
     * A PRESS YOU CAN SEE. `active:` alone is a timing problem rather than a
     * styling one: a quick tap holds it for well under a tenth of a second,
     * so the state is correct and nobody ever sees it. The press is HELD.
     */
    check("the press is held, not left to :active", /PRESS_HOLD_MS/.test(bar) && /function usePressFeedback/.test(bar))
    check("and it starts at contact, not at the click", /onPointerDown/.test(bar))
    check("with a mark that comes up under the finger", /bar-control-disc/.test(bar))
    /**
     * A KEYFRAME, NOT A TRANSITION. The first version faded a disc in and out
     * and it read as a HOVER: something drifting in under the finger rather
     * than a thing being pressed. A press has an attack, and it overshoots
     * slightly before it settles.
     */
    check("the press has an attack", /@keyframes bar-control-press/.test(read("app/globals.css")))
    check("and overshoots before it settles", /transform: scale\(1\.08\)/.test(read("app/globals.css")))
    /**
     * `hover: hover` ALONE WAS NOT ENOUGH, which is what this pin used to
     * require. Plenty of touch devices answer that query true — Android
     * browsers, an iPad with a pointer, Safari in desktop mode — and on those
     * a tap applies `:hover` and KEEPS it until something else is tapped. So
     * pressing the three dots left a grey disc under the icon afterwards,
     * which reads as a control that has jammed.
     *
     * `pointer: fine` is the other half: a real mouse, the only thing that
     * can hover on and off again. The intent this pin was written to protect
     * is unchanged; the guard it named was too weak to deliver it.
     */
    check(
      "no hover state on a device without a real pointer",
      /@media \(hover: hover\) and \(pointer: fine\) \{\s*\n\s*\.bar-control:hover/.test(read("app/globals.css")),
    )

    /*
      ---------------------------------------------------------------------
       NO BIO ON THIS BAR, ON EITHER SURFACE
      ---------------------------------------------------------------------
      A parallel change put the creator's line under their name, cut to six
      words with an ellipsis. Six words of a sentence is not a shorter
      sentence, it is the start of one — a peek at something the bar has no
      room to finish. Their page carries the bio in full and the name above
      is the way to it, so the helper that did the cutting is gone too
      rather than left sitting there unused.
    */
    check("no bio under the name", !/phoneBio/.test(bar))
    check("and nothing still cuts one to length", !/shortBio/.test(bar) && !existsSync(join(root, "lib/store-builder/short-bio.ts")))
    check("the page stops resolving one for it", !/bio=\{creatorBio\}/.test(product))
    check("and so does the builder's preview", !/bio=\{\(draftConfig/.test(read("components/store-builder/preview-canvas.tsx")))
    /** The builder's preview showed the form after the live bar stopped having one. */
    check("the builder's preview shows the same row", /phonePreviewRow/.test(bar) && !/compactMobileLayout/.test(bar))

    /**
     * The floating creator menu was a second copy of the app's own
     * navigation, laid over the product photo on every product page its
     * owner looked at. The app is one tap away through the bar.
     */
    check("no creator menu on the product page", !/CreatorQuickNav/.test(product))
    check("and the component is gone rather than orphaned", !existsSync(join(root, "components/creator-quick-nav.tsx")))
    check("with no rule left hiding something that does not exist", !/html\.capacitor \.creator-quick-nav/.test(read("app/globals.css")))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * FOUR THINGS THAT WERE TAKING UP ROOM OR PRINTING A NUMBER.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const product = code("app/(marketing)/p/[slug]/page.tsx")
    const subscribe = code("components/store-builder/subscribe-bar.tsx")
    const sheet = code("components/website-builder/mobile-editor-sheet.tsx")

    /**
     * "8 people have purchased this" sat under What's included, which is
     * where a buyer looks to decide. Nobody is persuaded by eight.
     */
    check("no purchase count on a product page", !/purchased this/.test(renderer) && !/purchased this/.test(product))
    check("and no switch left controlling it", !/showSalesAnnouncement/.test(code("components/store-builder/sections-sidebar.tsx")))

    /** The struck price and its badge belong beside the price, not under it. */
    check(
      "the compare-at price shares the price's row",
      /className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"/.test(renderer) &&
        !/className="mt-1 flex items-center gap-2"/.test(renderer),
    )

    /**
     * The buy bar is `fixed`, so it floats over the bottom of the SCREEN.
     * Reserving for it on the mid-page wrapper left a 96px hole between the
     * FAQ and More from the seller, and the actual end of the page was still
     * underneath it.
     */
    check("the buy bar's reserve is not in the middle of the page", !/pb-24 lg:pb-12/.test(product))
    /*
      AND IT IS NOT AT THE END EITHER, BECAUSE THE BAR IS NOT THERE.

      The reserve moved to the bottom of the page, which was right about where
      the bar sits and wrong about whether it is showing. The bar hides itself
      before the footer:

          const nearFooter = currentBottom > footerTop - 100
          const shouldShow = pastDescriptionStart && !nearFooter

      so 80px of empty page colour sat under the footer with nothing over it.
      Reported with a screenshot of exactly that.
    */
    check("and there is no reserve at the end either", !/h-20 lg:h-0/.test(product))
    check(
      "because the bar takes itself away before the footer",
      /const nearFooter = currentBottom > footerTop - 100/.test(code("components/store-builder/sticky-add-to-cart.tsx")) &&
        /shouldShow = pastDescriptionStart && !nearFooter/.test(code("components/store-builder/sticky-add-to-cart.tsx")),
      "if the bar stops hiding near the footer, the reserve has to come back",
    )

    /**
     * The sticky subscribe bar is `fixed` plus a spacer standing in for its
     * height. The spacer was a hard-coded 76px guess at a bar whose height
     * depends on the style, the avatar row and the length of the headline —
     * and the difference showed as a strip of page above the cover photo.
     */
    check("the bar's spacer is measured, not guessed", /setBarHeight\(el\.offsetHeight/.test(subscribe))
    check("from the laid-out box, not the transformed one", /offsetHeight/.test(subscribe) && !/spacer[\s\S]{0,40}getBoundingClientRect/.test(subscribe))
    /*
      The old constant (76px, 52px) was the spacer's height before the first
      measurement, and it was 9px short of the real bar in Inter, so the page
      moved when the measurement landed. Before measuring, the bar now sits
      in the flow itself and there is no spacer to guess; after, it is fixed
      over a spacer of exactly its height. scripts/check-subscribe-states.mjs
      hydrates it from server HTML and measures the page not moving.
    */
    /*
      THE BAR IS IN THE SERVER'S HTML. It returned null until hydration, so
      it arrived with the JavaScript and pushed the whole page down by its
      height on every visit. And its three states move nothing: one button
      width for all three, no half-faded disabled button, and the success
      said by a dark pill over the page rather than a green line that made
      the bar taller. scripts/check-subscribe-states.mjs measures all of it.
    */
    check("the subscribe bar is not held back until hydration", !/if \(!settings\.visible \|\| !isHydrated\) return null/.test(subscribe) && /if \(!settings\.visible\) return null/.test(subscribe))
    check("its button stacks both labels in one cell", /data-subscribe-phase=\{phase\}/.test(subscribe) && (subscribe.match(/col-start-1 row-start-1/g) ?? []).length >= 2)
    check("and says it worked with the pill, not a green line", /showPillToast\(`Subscribed to/.test(subscribe) && !/text-green-600/.test(subscribe.slice(0, subscribe.indexOf("/** Editor preview version"))))
    check(
      "and before the first measurement the bar is in the flow, with no guessed spacer",
      /!measured && "!relative"/.test(subscribe) && /\{measured && <div aria-hidden className="subscribe-bar-spacer"/.test(subscribe) && !/h-\[76px\] sm:h-\[52px\]/.test(subscribe),
    )

    /**
     * The sheet grows by the keyboard and shrinks back. Only `transform` was
     * in the transition, so the shrink happened in one frame while the
     * keyboard was still sliding away.
     */
    /**
     * It is still a move, over KEYBOARD_MS, but no longer a transition on
     * `height` and `padding-bottom`, which laid the sheet out on every frame
     * of the keyboard. The new height is laid out once and the move is a
     * transform animated away on the compositor. Pinned both ways: the move
     * exists, and the layout transition is gone.
     */
    check(
      "the keyboard resize is a move, not a snap",
      /resizeMove\.current = sheet\.animate\(/.test(sheet) &&
        /translateY\(\$\{y \+ height - prev\}px\)/.test(sheet) &&
        /const ms = motionMs\(KEYBOARD_MS\)/.test(sheet) &&
        !/height \$\{KEYBOARD_MS\}ms/.test(sheet) &&
        !/padding-bottom \$\{KEYBOARD_MS\}ms/.test(sheet),
    )
    check("and the drag itself still has no transition at all", /const motion = dragging/.test(sheet) && /\? "none"/.test(sheet))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * ARRIVING AND LEAVING.
     */
    const workspace = code("components/app/creator-page-workspace.tsx")
    const ceiling = code("lib/website-builder/navigate-ceiling.ts")
    const builder = code("app/website-builder/editor/[installId]/page.tsx")
    const link = code("components/smart-link.tsx")

    /**
     * The loader was removed from the tree the instant the frame reported
     * loaded, while the page under it was still part-way through a 320ms
     * fade-in. One frame with neither on screen is the cut.
     */
    check("the loader lingers past the load", /useLinger\(firstLoad, 320\)/.test(workspace))
    check("and leaves by fading, over the page", /wb-canvas-loader/.test(workspace) && /data-leaving=\{!firstLoad\}/.test(workspace))

    /**
     * /app is warm, so the push beat the paint and the going-back screen was
     * never on the glass — which is why it read as missing when the code for
     * it was already there.
     */
    check("going back holds the screen before it pushes", /\}, LEAVING_SEEN_MS\)/.test(workspace))
    check("and warms the way out so the wait is the only wait", /router\.prefetch\("\/app"\)/.test(workspace))
    /** One number for one question: both editors leave. */
    check("the hold is shared, not copied", /export const LEAVING_SEEN_MS/.test(ceiling))
    check("and the builder uses that one", /LEAVING_SEEN_MS, navigateWithCeiling/.test(builder) && !/const LEAVING_SEEN_MS =/.test(builder))

    /**
     * A bare anchor is a FULL DOCUMENT LOAD: nothing prefetched, and the
     * route's loading.tsx never reached, because a loading boundary only
     * exists inside a client navigation. The product page is force-dynamic,
     * so what a visitor got after pressing a card was a white page for as
     * long as the server took.
     */
    /*
      This used to pin `<Link href={resolvedHref!}>`, which was the shape when
      "internal" meant `href.startsWith("/")`. That test was the reason the fix
      above never reached the thing it was written for: product cards link with
      the FULL address, because getProductUrl returns the string that is also
      copied and shared, so they failed it and kept reloading the document.
      The decision is about ORIGIN now, and which hosts it accepts is exercised
      by running the real function in tests/link-navigation.test.ts.
    */
    check("an internal link on the web is a link Next knows about", /<Link\s+href=\{internalPath\}/.test(link))
    check("and it is the origin that decides, not a leading slash",
      /const internalPath = toSameOriginPath\(resolvedHref\)/.test(link))
    check("and the routes that must reload still do", /useClientNav === false \|\|/.test(link) && /startsWith\("\/library"\)/.test(link))
    /*
      AND THE PRODUCT PAGE HAS NO SKELETON, WHICH IS THE OPPOSITE OF WHAT THIS
      LINE USED TO ASSERT.

      A loading boundary is not a delay you can tune: the router swaps the
      page for it the instant a navigation starts. Filmed on production, a
      press of a product card gave a fifth of a second of blank — the route
      had swapped, the skeleton was still transparent under its own deferral —
      and then a second of grey furniture before the product arrived.

      Without it the router keeps the grid until the product is ready, and
      the card that was pressed answers the press itself.
      tests/marketing-weight holds the decision, what it costs on a cold
      direct visit, and what would let it come back.
    */
    check(
      "and the product page has no boundary to swap that grid out for",
      !existsSync(join(root, "app/(marketing)/p/[slug]/loading.tsx")),
      "a boundary throws away the page somebody is reading the moment they press something on it",
    )
    /*
      This asked for a 3px bar across the pressed card, drawn for as long as
      the navigation was in flight. It is gone on the owner's instruction: an
      indicator on a card marks the thing you are LEAVING. What answers now is
      the dip, which lands with the touch and does not outlive it.
    */
    check(
      "so the card answers the press itself",
      /active:brightness-95/.test(code("components/explore/product-card.tsx")),
      "with nothing swapping in, the pressed card is the only thing left to say the press landed",
    )
    check(
      "and it answers by dipping, not by running a bar",
      !/NavPending/.test(code("components/explore/product-card.tsx")),
      "a bar on the pressed card keeps animating on a card that is about to be replaced",
    )
    check("and so does the creator page", existsSync(join(root, "app/(marketing)/u/[username]/loading.tsx")))

    /**
     * Home is the creator's arrangement; the Products tab is newest first.
     * `.filter()` kept the query's order, so the arrangement was saved and
     * then ignored and the two tabs were the same list twice.
     */
    check("the featured section orders by the creator's picks", /pickFeatured\(products, settings\.productIds\)/.test(code("components/store-builder/unified-section-renderer.tsx")))
    check("through a helper that can be run rather than read", existsSync(join(root, "lib/store-builder/featured-order.ts")))
  }

  /* ------------------------------------------------------------------ */
  {
    /**
     * A PIXEL AND HALF A WEIGHT STEP, ON THE THREE LINES UNDER THE NAME.
     *
     * The handle, the bio and the meta row were 12/14px at 400 — the size
     * the rest of the app uses for text that sits BESIDE something. On a
     * profile they are the middle of the page, under a name set large, and
     * at that size they read as a caption of the name rather than as the
     * page. One pixel up and 450.
     *
     * scripts/check-profile-type.mjs is what proves 450 is a real weight
     * rather than a round to 400: Inter comes through next/font as the
     * variable face, and the same string at 400, 450 and 500 has to get
     * wider each time.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const at = (n: number) => (renderer.match(new RegExp(`text-\\[${n}px\\]`, "g")) ?? []).length

    check("the three lines are a pixel bigger on a phone", at(13) >= 3)
    check("and on a desktop", at(15) >= 3)
    check("none of them is left at the old size", !/isMobile \? "text-xs" : "text-sm"/.test(renderer))
    check("all three carry the half step", (renderer.match(/font-\[450\]/g) ?? []).length >= 3)
    /**
     * A weight list on next/font would give static faces, and 450 would
     * round to 400 with nothing to show for it.
     */
    check("Inter is still loaded as the variable face", !/Inter\(\{[^}]*weight:/.test(code("app/layout.tsx")))

    /**
     * AND HALF A STEP ON THE TAB ROW, for the same reason: at 400 next to a
     * name set large it reads as a caption of the page rather than as the
     * way around it. Both weights move, so the selected tab stays clearly
     * ahead of the others.
     */
    const tabs = code("components/storefront/storefront-tabs.tsx")
    check("the selected tab is half a step above medium", /font-\[530\] text-foreground/.test(tabs))
    check("and the rest half a step above regular", /font-\[450\] text-muted-foreground/.test(tabs))
    check("neither is left at a whole step", !/selected \? "font-medium text-foreground" : "text-muted-foreground/.test(tabs))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
