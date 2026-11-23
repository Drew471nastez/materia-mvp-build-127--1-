/**
 * ===========================================================================
 *  WAVE 10: THE ABOUT STORY FADES, AND ITS MARKDOWN IS READ
 * ===========================================================================
 * The owner, on a creator page in a dark scheme: "it should not only use
 * Read more, it should use a fade, adapted, smooth, clean, adapted to the
 * colour theme, very smooth, modern." The same screenshot printed a story's
 * "# Storelib — …" with its hash.
 *
 *   MARKDOWN  a plain story's headings, lists, quotes, bold, emphasis, code
 *             and links are read (lib/storefront/story-markdown) and drawn
 *             as React elements (components/store-builder/story-text): no
 *             raw '#', and nothing in a story ever becomes HTML; a link is
 *             only http(s) or mailto
 *   FADE      a mask on the text (any background, any theme, a picture), on
 *             an eased curve, two and a half lines tall; opening and closing
 *             take 240ms and nothing with reduced motion
 *   BUTTON    a soft pill in the scheme's own text colour, 44px on a phone
 *   PHONE     the story is not a `.group`, whose children lose every
 *             transition on a touch screen (app/globals.css), so it eases
 *             open there too
 *
 * Measured in a browser (scripts/render-story-fade.tsx, dark, light and a
 * gradient, 1280 and 390): no '#' on the page, the box grows over ~130ms
 * frame by frame instead of in one, and a short story has no fade and no
 * button.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseInline, parseStory, safeHref } from "../lib/storefront/story-markdown"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe owner's story\n")
{
  const blocks = parseStory("# Storelib — Complete Contacts, Forms, Emails & Community Integration\n\n\nYou are working directly inside the existing Storelib production codebase.")
  check("'# Storelib' is a heading, without its hash", blocks[0]?.t === "h" && JSON.stringify(blocks[0]).includes("Storelib — Complete") && !JSON.stringify(blocks).includes("# "), blocks)
  check("  any number of blank lines is one new paragraph", blocks.length === 2 && blocks[1].t === "p", blocks)
  check("## is a smaller heading", (parseStory("## What you'll find")[0] as { level?: number }).level === 4)
  check("a single line break stays a break", JSON.stringify(parseStory("one\ntwo")) === JSON.stringify([{ t: "p", c: [{ t: "text", v: "one" }, { t: "br" }, { t: "text", v: "two" }] }]))
  const list = parseStory("- presets\n- brushes\n\n1. first\n2. second")
  check("bullets and numbers are lists", list[0].t === "ul" && (list[0] as { items: unknown[] }).items.length === 2 && list[1].t === "ol", list)
  check("a quote and a rule", parseStory("> made by me")[0].t === "quote" && parseStory("---")[0].t === "hr")
  check("a hashtag is not a heading", parseStory("#nightphotography")[0].t === "p")
}

console.log("\nInline, and nothing becomes HTML\n")
{
  check("**bold**, *em*, `code`", JSON.stringify(parseInline("a **b** *c* `d`")) === JSON.stringify([{ t: "text", v: "a " }, { t: "strong", c: [{ t: "text", v: "b" }] }, { t: "text", v: " " }, { t: "em", c: [{ t: "text", v: "c" }] }, { t: "text", v: " " }, { t: "code", v: "d" }]))
  check("snake_case words keep their underscores", JSON.stringify(parseInline("my_shop_name")) === JSON.stringify([{ t: "text", v: "my_shop_name" }]))
  check("a web link is a link", JSON.stringify(parseInline("[course](https://example.com/c)")) === JSON.stringify([{ t: "link", href: "https://example.com/c", c: [{ t: "text", v: "course" }] }]))
  check("  a javascript: link is its words only", JSON.stringify(parseInline("[x](javascript:alert(1))")).includes('"t":"text"') && !JSON.stringify(parseInline("[x](javascript:alert(1))")).includes('"link"'))
  check("  only http(s) and mailto leave the page", safeHref("https://a.b") === "https://a.b" && safeHref("mailto:a@b.c") === "mailto:a@b.c" && safeHref("data:text/html,x") === null && safeHref("//evil.com") === null)
  check("a <script> in a story is text", JSON.stringify(parseStory("<script>alert(1)</script>")) === JSON.stringify([{ t: "p", c: [{ t: "text", v: "<script>alert(1)</script>" }] }]))
  const view = read("components/store-builder/story-text.tsx")
  check("the story is drawn as React elements, never innerHTML", !/dangerouslySetInnerHTML/.test(view) && /parseStory\(text\)\.map\(block\)/.test(view) && /rel="noopener noreferrer nofollow ugc"/.test(view))
  const renderer = read("components/store-builder/unified-section-renderer.tsx")
  check("the About block draws a plain story through StoryText; markup still goes through the allow list", /<StoryText text=\{settings\.aboutContent \|\| ""\} \/>/.test(renderer) && /cleanStoredHtml\(settings\.aboutContent \|\| ""\)/.test(renderer))
}

console.log("\nThe fade and the button\n")
{
  const css = read("app/globals.css")
  check("a mask on an eased curve, so any background shows through", /--sl-fade-mask: linear-gradient\(to bottom, #000 calc\(100% - var\(--sl-fade\)\), rgb\(0 0 0 \/ 0\.82\)[^;]*transparent\);/.test(css) && /mask-image: var\(--sl-fade-mask\)/.test(css))
  check("  open and close in 240ms, none with reduced motion", /transition: max-height 240ms cubic-bezier\(0\.32, 0\.72, 0, 1\), --sl-fade 240ms/.test(css) && /prefers-reduced-motion: reduce\) \{ \[data-clamp-fade\] \{ transition: none; \} \}/.test(css))
  const renderer = read("components/store-builder/unified-section-renderer.tsx")
  /* Changed on purpose (r58): six lines snapped to a real line's bottom (lib/ui/clamp-lines snapClamp), the fade two and a half lines or half the box (fadeFor). */
  check("two and a half lines fade over six", /\["--sl-fade-to" as string\]: `\$\{fadeFor\(collapsedHeight, lineHeight\)\}px`/.test(renderer) && /snapClamp\(lineBottoms\(el\), line \* 6, line\)/.test(renderer))
  check("no fade and no button for a short story", /data-clamp-fade=\{needsTruncation \? \(isExpanded \? "open" : "closed"\) : undefined\}/.test(renderer) && /\{needsTruncation && \(\s*<button/.test(renderer))
  check("the button: a pill in the scheme's own colour, 44px on a phone", /data-story-toggle=""/.test(renderer) && /min-h-11/.test(renderer) && /backgroundColor: "color-mix\(in srgb, currentColor 7%, transparent\)"/.test(renderer))
  check("the story is not a .group, so it eases open on a phone", /ref=\{storyRootRef\}[\s\S]{0,400}className="relative"\n/.test(renderer) && !/ref=\{storyRootRef\}\s*className="relative group"/.test(renderer))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
