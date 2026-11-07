/**
 * ===========================================================================
 *  ROUND 50: THE CREATOR PAGE'S ABOUT / "YOUR STORY"
 * ===========================================================================
 * "Edit About / Your story / Story headline doesn't save or update."
 *
 * The save wrote both configs and took nothing down: the creator page reads
 * a shared copy of its config (cachedStoreConfig, 60s) and is held by the
 * CDN for everybody (round 49), and /api/creator-profile expired neither
 * unless the name or photo changed. So the sheet closed, the page refreshed
 * into the old story, and a reload a minute later showed the new one. What
 * this suite pins:
 *
 *   1. THE ROUTE, run for real over tests/_journey: headline, rich story,
 *      pictures and captions written to the draft AND the published config;
 *      the story cleaned; an emptied editor stored as no story; a long story
 *      kept whole (it was cut at 2000 characters of markup) and a too long
 *      one refused with a reason; the cleaned story handed back; the page's
 *      copies purged after the write and before the answer.
 *   2. THE OWNER SEES THE SAVE AT ONCE: the sheet draws the server's answer
 *      over the block until the page's props say the same
 *      (lib/storefront/story-draft), and Cancel puts back what was saved.
 *   3. THE FADE: no gradient to white over the story; the text is masked,
 *      so any scheme's background shows through; Read more in the scheme's
 *      text colour, aria-expanded, opened by a link reached with Tab.
 *   4. THE GALLERY: scroll snap, the dot from the scroll position while it
 *      moves, dots that navigate, arrow keys, a mouse drag, a fixed frame.
 *   5. THE CAPTION: an inline field that reads as text, Enter keeps, Escape
 *      undoes without closing the sheet, the server's 160 character cap.
 *
 * Measured in a browser by the round's probe (Playwright over the dev
 * server and a writable Supabase stub, scripts/supabase-stub-server.mjs
 * `writable`); see the round report.
 */
import "./_journey/env"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { Journey } from "./_journey/harness"
import { stripComments } from "./_source"
import { storyIsEmpty, storySignature } from "../lib/storefront/story"
import { indexAt, settleAfterDrag, StoryGallery } from "../components/store-builder/story-gallery"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))

type Cfg = { sections: { id: string; type: string; settings: Record<string, unknown> }[]; headerSettings?: Record<string, unknown> }

async function main() {
  section("1. The save, through the real route")
  {
    const j = await Journey.start()
    const seller = await j.signUp("story@example.com", { name: "Luca Story" })
    await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "lucastory" } })
    const cid = j.rows("creators")[0].id as string
    const cfg = (): Cfg => ({
      sections: [
        { id: "f", type: "featured-products", settings: { headline: "Featured" } },
        { id: "a", type: "about", settings: { headline: "Old headline", aboutContent: "<p>Old story</p>", mediaItems: [], showSalesStats: true } },
      ],
      headerSettings: { bio: "Bio" },
    })
    /* Onboarding made the shop's config row; this page has published an About block. */
    const row = j.rows("store_builder_configs").find((r) => r.creator_id === cid && r.page_type === "shop")
    if (row) Object.assign(row, { draft_config: cfg(), published_config: cfg() })
    else j.db.insert("store_builder_configs", { creator_id: cid, page_type: "shop", draft_config: cfg(), published_config: cfg() }, {})
    const mine = () => j.rows("store_builder_configs").find((r) => r.creator_id === cid && r.page_type === "shop")!
    const about = (k: "draft_config" | "published_config") => (mine()[k] as Cfg).sections.find((s) => s.type === "about")!.settings
    const save = (body: unknown) => j.call("PATCH /api/creator-profile", { as: seller, body })

    const long = `<p>${"A sentence about the shop, with <strong>some bold</strong> and a <a href=\"https://example.com\">link</a>. ".repeat(40)}</p><p>The last line.</p>`
    const r = await save({
      about: {
        headline: "  How it started  ",
        aboutContent: `${long}<img src=x onerror=alert(1)><script>alert(1)</script>`,
        mediaItems: [
          { id: "m1", type: "image", url: "https://cdn.example.com/a.jpg", caption: "  The first bench  " },
          { id: "m2", type: "image", url: "javascript:alert(1)" },
          { id: "m3", type: "video", url: "https://youtu.be/dQw4w9WgXcQ", caption: "x".repeat(300) },
        ],
      },
    })
    check("a save answers 200", r.status === 200, r.json)
    for (const k of ["draft_config", "published_config"] as const) {
      const a = about(k)
      check(`  ${k}: the headline, trimmed`, a.headline === "How it started", a.headline)
      check(`  ${k}: the story kept whole past 2000 characters of markup (it was cut mid-sentence)`, typeof a.aboutContent === "string" && (a.aboutContent as string).length > 2000 && (a.aboutContent as string).includes("The last line."), (a.aboutContent as string)?.length)
      check(`  ${k}: and cleaned (no script, no onerror)`, !/script|onerror/i.test(a.aboutContent as string))
      const media = a.mediaItems as { id: string; url: string; caption?: string }[]
      check(`  ${k}: pictures kept in order, a javascript: one dropped`, media.map((m) => m.id).join() === "m1,m3", media)
      check(`  ${k}: captions trimmed and capped at 160`, media[0].caption === "The first bench" && media[1].caption?.length === 160)
    }
    const echoed = (r.json as { about?: { headline?: string; aboutContent?: string } }).about
    check("the answer carries the story as stored, for the owner's page to draw at once", echoed?.headline === "How it started" && echoed?.aboutContent === about("published_config").aboutContent)
    check("the rest of the page is untouched", (mine().published_config as Cfg).sections[0].settings.headline === "Featured")

    const caption = await save({ about: { mediaItems: [{ id: "m1", type: "image", url: "https://cdn.example.com/a.jpg", caption: "New caption" }] } })
    check("a caption alone saves, and leaves the headline and story as they were", caption.status === 200 && (about("published_config").mediaItems as { caption: string }[])[0].caption === "New caption" && about("published_config").headline === "How it started")

    const removed = await save({ about: { mediaItems: [] } })
    check("removing every picture saves an empty list", removed.status === 200 && (about("published_config").mediaItems as unknown[]).length === 0)

    for (const empty of ["", "<p><br></p>", "<p>&nbsp;</p>", "<p>   </p>"]) {
      await save({ about: { headline: "", aboutContent: empty } })
      check(`saving an emptied editor (${JSON.stringify(empty)}) stores no story and no headline`, about("published_config").aboutContent === "" && about("draft_config").aboutContent === "" && about("published_config").headline === "")
    }

    await save({ about: { aboutContent: "<p>Kept</p>" } })
    const tooLong = await save({ about: { aboutContent: `<p>${"x".repeat(20001)}</p>` } })
    check("a story past the cap is refused with a reason, not cut", tooLong.status === 400 && /too long/i.test(String((tooLong.json as { error?: string }).error)), tooLong.json)
    check("  and what was there stays", about("published_config").aboutContent === "<p>Kept</p>")

    const stranger = await j.signUp("other@example.com", { name: "Other" })
    const theirs = await j.call("PATCH /api/creator-profile", { as: stranger, body: { about: { headline: "Not yours" } } })
    check("somebody else's save never reaches this page", about("published_config").headline !== "Not yours", theirs.status)

    const route = code("app/api/creator-profile/route.ts")
    const write = route.indexOf(".from(\"store_builder_configs\")\n    .update(")
    const purge = route.indexOf("await creatorPagesChanged({ creatorId: creator.id, userId: page.profileId })", write)
    const answer = route.lastIndexOf("return NextResponse.json({ ok: true, storefront: true")
    check("the route purges the page's copies (data and CDN) after the write and before it answers", write > 0 && purge > write && purge < answer, { write, purge, answer })
    check("  and on a page with no config when the creator row changed (the default page draws the bio)", /if \(Object\.keys\(creatorUpdate\)\.length > 0\) await creatorPagesChanged/.test(route))
  }

  section("2. The owner sees the save at once")
  {
    check("an empty editor is no story", storyIsEmpty("") && storyIsEmpty("<p><br></p>") && storyIsEmpty("<p>&nbsp; </p>") && storyIsEmpty(null))
    check("  but a word, or a picture alone, is", !storyIsEmpty("<p>a</p>") && !storyIsEmpty("<p><img src=\"https://x.example/a.jpg\"></p>"))
    check("the signature ignores an absent caption and the legacy video type", storySignature({ headline: "H", aboutContent: "<p>a</p>", mediaItems: [{ id: "1", type: "youtube", url: "u" }] }) === storySignature({ headline: "H ", aboutContent: "<p>a</p>", mediaItems: [{ id: "1", type: "video", url: "u", caption: "" }] }))
    const button = code("components/storefront/edit-about-button.tsx")
    check("the sheet draws its fields over the block while open", /if \(!open\) return\s+setStoryDraft\(\{ headline: title, aboutContent: text, mediaItems: items \}\)/.test(button))
    check("  a save draws the server's answer and keeps it until the page's props say the same", /const kept = \(data\.about \?\? \{\}\)/.test(button) && /setStoryDraft\(saved\)/.test(button) && /storySignature\(savedRef\.current\) === propsSignature/.test(button))
    check("  Cancel puts back the last save", /const cancel = \(\) => \{\s+setOpen\(false\)\s+setStoryDraft\(savedRef\.current\)/.test(button) && /onClose=\{cancel\}/.test(button))
    check("  and the page still refreshes after the sheet has gone (useSaveThenRefresh)", /markSaved\(\)/.test(button))
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    check("the About block reads the draft only where it carries the owner's controls", /const storyDraft = useStoryDraft\(!!ownerActions\)/.test(renderer))
  }

  section("3. The Read more fade follows the scheme")
  {
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const about = renderer.slice(renderer.indexOf("function UnifiedAboutSection"), renderer.indexOf("// ====== ", renderer.indexOf("function UnifiedAboutSection") + 10))
    check("no gradient to white over the story", !/transparent, white|from-white|to-white/.test(about))
    check("the text masks itself (data-clamp-fade)", /data-clamp-fade=\{needsTruncation \? \(isExpanded \? "open" : "closed"\) : undefined\}/.test(about))
    const css = read("app/globals.css")
    check("  a mask over the text, so a colour, a dark scheme or a picture behind it shows through", /\[data-clamp-fade\] \{[\s\S]*?mask-image: linear-gradient\(to bottom, #000 calc\(100% - var\(--sl-fade\)\), transparent\)/.test(css))
    check("  eased open with a registered property, and no motion when reduced", /@property --sl-fade/.test(css) && /prefers-reduced-motion: reduce\) \{ \[data-clamp-fade\] \{ transition: none; \} \}/.test(css))
    check("Read more in the scheme's text colour, with aria-expanded and aria-controls", /aria-expanded=\{isExpanded\}/.test(about) && /aria-controls=\{storyTextId\}/.test(about) && /color: textColor \|\| "inherit"/.test(about))
    check("the clamp is measured from the text's line height and watched as its box changes", /parseFloat\(getComputedStyle\(el\)\.lineHeight\)/.test(about) && /new ResizeObserver\(measure\)/.test(about))
    check("opening uses the measured height, not a 2000px cap that cut long stories", !/'2000px'/.test(about) && /fullHeight \?\? 4000/.test(about))
    check("a link reached with Tab under the fade opens the story", /onFocusCapture=/.test(about) && /setIsExpanded\(true\)/.test(about))
    check("the members' page fades its text the same way", /data-clamp-fade=\{aboutOpen \? "open" : "closed"\}/.test(code("components/memberships/member-page.tsx")) && !/from-white to-transparent/.test(code("components/memberships/member-page.tsx")))
  }

  section("4. The gallery")
  {
    check("the picture in view from the scroll position, rounded, inside the list", indexAt(0, 400, 3) === 0 && indexAt(210, 400, 3) === 1 && indexAt(190, 400, 3) === 0 && indexAt(5000, 400, 3) === 2 && indexAt(10, 0, 3) === 0)
    check("a mouse drag of a sixth of the frame moves one picture its way", settleAfterDrag(0, -80, 0, 400, 3) === 1 && settleAfterDrag(1, 80, 0, 400, 3) === 0)
    check("  a short slow drag springs back, a flick moves", settleAfterDrag(1, -30, 0.1, 400, 3) === 1 && settleAfterDrag(1, -30, -0.8, 400, 3) === 2)
    check("  never past either end", settleAfterDrag(2, -300, 0, 400, 3) === 2 && settleAfterDrag(0, 300, 0, 400, 3) === 0)
    const items = [
      { id: "a", type: "image", url: "https://cdn.example.com/a.jpg", caption: "One" },
      { id: "b", type: "image", url: "https://cdn.example.com/b.jpg" },
      { id: "c", type: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    ]
    const html = renderToString(createElement(StoryGallery, { items, textColor: "#fafafa" }))
    check("a native scroller that snaps one picture at a time", /data-story-track=""/.test(html) && /snap-x snap-mandatory/.test(html) && (html.match(/snap-center snap-always/g) || []).length === 3)
    check("  the frame is 16:9 before anything loads (no shift)", /aspect-video/.test(html))
    check("  focusable, and it says the arrow keys move it", /tabindex="0"/.test(html) && /Use the arrow keys to move/.test(html))
    check("  three dots, buttons, the first current, in the scheme's text colour", (html.match(/aria-label="Picture \d of 3"/g) || []).length === 3 && /aria-current="true"/.test(html) && /background-color:#fafafa/.test(html))
    check("  each dot has a 24px target", /grid h-6 w-6 place-items-center/.test(html))
    check("  the caption line is kept when a picture has none (no shift between pictures)", /min-h-\[1\.25rem\]/.test(html) && />One</.test(html))
    check("  pictures cover their frame without stretching", /object-cover/.test(html))
    const one = renderToString(createElement(StoryGallery, { items: items.slice(0, 1) }))
    check("one picture: no dots, no arrows, no scroller", !/aria-label="Picture 1 of 1"/.test(one) && !/snap-x/.test(one) && !/aria-roledescription="slide"/.test(one))
    const src = code("components/store-builder/story-gallery.tsx")
    check("the dot follows the strip while it moves (on scroll, once a frame)", /onScroll=\{many \? onScroll : undefined\}/.test(src) && /requestAnimationFrame/.test(src))
    check("arrow keys, Home and End", /e\.key === "ArrowRight"/.test(src) && /e\.key === "Home"/.test(src))
    check("a mouse drags it with snap paused while held", /e\.pointerType !== "mouse"/.test(src) && /setAttribute\("data-dragging", ""\)/.test(read("components/store-builder/story-gallery.tsx")) && /\[data-story-track\]\[data-dragging\] \{ scroll-snap-type: none;/.test(read("app/globals.css")))
    check("smooth moves respect reduced motion", /prefers-reduced-motion: reduce/.test(src))
  }

  section("5. The caption")
  {
    const editor = code("components/social/media-items-editor.tsx")
    check("an inline field that reads as text: no box until it is used", /border border-transparent bg-transparent/.test(editor) && /placeholder="Add a caption"/.test(editor) && !/Add caption \(optional\)/.test(editor))
    check("  grows with its words instead of scrolling sideways", /\[field-sizing:content\]/.test(editor) && /el\.style\.height = `\$\{el\.scrollHeight\}px`/.test(editor))
    check("  Enter keeps it, Escape undoes it without closing the sheet", /e\.key === "Enter" && !e\.nativeEvent\.isComposing/.test(editor) && /e\.stopPropagation\(\)\s+onChange\(before\.current\)/.test(editor))
    check("  the server's cap, 160, with a count near the end", /CAPTION_MAX = 160/.test(editor) && /left <= 40/.test(editor) && /caption\.trim\(\)\.slice\(0, 160\)/.test(code("app/api/creator-profile/route.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
