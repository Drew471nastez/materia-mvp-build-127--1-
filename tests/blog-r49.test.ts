/**
 * ===========================================================================
 *  ROUND 49: THE BLOG AFTER THE OWNER LOOKED AT THE REBUILT ARTICLE LIVE
 * ===========================================================================
 * ARTICLE   no empty column on the right: from 1200px the 260px rail and a
 *           760px reading column, the pair centred; the body 19px there so a
 *           line stays near 80 characters (measured 83, never past 88).
 * RAIL      the card under the contents is light, one line, a short subline
 *           and one button (about 117px tall, was 288px); the contents take
 *           the rail's height and scroll inside it, the card stays in view.
 * BOX       the box inside an article: a short title, one line, one button,
 *           no logo, no email field; every variant names more than digital
 *           products; no em dash, no banned words.
 * PILLS     the dark fill slides between pills (transform only, 240ms), the
 *           list crossfades (out 120ms, in 220ms rising 6px), nothing moves
 *           with reduced motion, the pills stay real links.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stripComments } from "./_source"
import type { Block } from "@/lib/blog/blocks"
import { BLOG_CTA, blogRailCta } from "@/lib/blog/article"
import { ArticleView } from "@/app/(storelib)/(marketing)/blog/_components/article-view"
import CtaBanner from "@/app/(storelib)/(marketing)/blog/[slug]/_cta-banner"

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
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))
const words = (s: string) => s.trim().split(/\s+/).length

const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|passive income)\b|—/i

const blocks: Block[] = [
  { id: "1", type: "p", html: "Intro" },
  { id: "2", type: "h2", html: "First" },
  { id: "3", type: "p", html: "a" },
  { id: "4", type: "h2", html: "Second" },
  { id: "5", type: "p", html: "b" },
  { id: "6", type: "p", html: "c" },
  { id: "7", type: "h2", html: "Third" },
]
const article = (physical: boolean) =>
  renderToStaticMarkup(
    createElement(ArticleView, {
      data: { slug: "x", url: "https://storelib.com/blog/x", title: "T", excerpt: "Dek", category: "Growth", published_at: "2026-04-02T00:00:00Z", updated_at: null, cover: "https://cdn.example.com/c.jpg", byline: "Anisia - Head of Marketing", blocks, cta: "digital", related: [], previous: null, next: null, physical },
    }),
  )

function main() {
  const view = code("app/(storelib)/(marketing)/blog/_components/article-view.tsx")
  const html = article(true)

  console.log("\nThe article's width")
  {
    check("from 1200px: the 260px rail and a 760px column, the pair centred, no third column", /const GRID = "min-\[1200px\]:grid min-\[1200px\]:grid-cols-\[260px_minmax\(0,760px\)\] min-\[1200px\]:justify-center min-\[1200px\]:gap-x-14"/.test(view) && !/minmax\(0,1fr\)\]/.test(view))
    check("  below 1200px one 720px column as before", /const COLUMN = "mx-auto w-full max-w-\[720px\] min-\[1200px\]:col-start-2 min-\[1200px\]:max-w-none"/.test(view))
    check("  the cover asks for 760px from 1200px", /sizes="\(min-width: 1200px\) 760px, \(min-width: 768px\) 720px, calc\(100vw - 32px\)"/.test(view))
    check("  the rail starts level with the header, not below the cover", /min-\[1200px\]:row-span-3 min-\[1200px\]:row-start-1/.test(view))
    const body = code("app/(storelib)/(marketing)/blog/_components/article-blocks.tsx")
    check("body 17px, 18px from 640px, 19px from 1200px (both arbitrary, so they sort in order)", /const BODY = `text-\[17px\] leading-\[1\.7\] text-\[#374151\] min-\[640px\]:text-\[18px\] min-\[1200px\]:text-\[19px\]/.test(body) && !/sm:text-\[18px\] min-\[1200px\]/.test(body))
  }

  console.log("\nThe rail's card")
  {
    const copy = blogRailCta()
    check("one short line and a 3 to 6 word subline", copy.title === "Sell anything from one place" && words(copy.body) >= 3 && words(copy.body) <= 6, copy)
    check("  a light surface, not the dark block, no logo", /rounded-xl border border-\[#eceef1\] bg-\[#f8f9fa\] px-4 py-3/.test(view) && !/rounded-2xl bg-\[#1a1a2e\] p-6/.test(view) && !/<StorelibLogo size=\{28\}/.test(view))
    check("  one button, Start free, to /signup tagged", /data-blog-cta-card="digital"[\s\S]*Sell anything from one place[\s\S]*href="\/signup\?intent=sell&amp;src=blog-digital&amp;ref=blog-digital"[^>]*>Start free/.test(html))
    check("  names no kind of product, so it reads the same with physical commerce on or off", article(false).includes(copy.body) && html.includes(copy.body) && !/physical/i.test(copy.body))
    check("the contents scroll inside the rail, the card stays under them", /min-h-0 shrink overflow-y-auto overscroll-contain/.test(view) && /data-blog-toc-scroll=""/.test(html) && /<div className="shrink-0">\s*<RailCta/.test(view) && /max-h-\[calc\(100vh-120px\)\] flex-col/.test(view))
    const toc = code("app/(storelib)/(marketing)/blog/_components/toc.tsx")
    check("  the heading being read is drawn heavier without a wider weight (no rewrap, no shift)", /aria-\[current=true\]:\[-webkit-text-stroke:0\.4px_currentColor\]/.test(toc) && !/aria-\[current=true\]:font-semibold/.test(toc))
  }

  console.log("\nThe box inside the article")
  {
    const box = renderToStaticMarkup(createElement(CtaBanner, { variant: "digital" }))
    check("a short title, one line, one button; no logo and no email field", /<h2 id="blog-cta-title"[^>]*>Start selling on Storelib<\/h2>/.test(box) && !/type="email"/.test(box) && !/<img|<svg/.test(box.replace(/<span aria-hidden="true">→<\/span>/, "")) && (box.match(/<button/g) ?? []).length === 1)
    check("  still a GET form to /signup tagged src and ref", /<form [^>]*action="\/signup" method="get"/.test(box) && /name="src" value="blog-digital"/.test(box) && /name="ref" value="blog-digital"/.test(box) && /name="intent" value="sell"/.test(box), box)
    for (const [k, c] of Object.entries(BLOG_CTA)) {
      check(`  ${k}: title at most 5 words, line at most 12`, words(c.title) <= 5 && words(c.body) <= 12, c)
      check(`  ${k}: names more than digital products`, /courses/i.test(c.body) && !/^sell your digital products/i.test(c.title))
    }
    check("  the digital box no longer says digital at all", !/digital/i.test(BLOG_CTA.digital.title + BLOG_CTA.digital.body))
    const all = [...Object.values(BLOG_CTA).flatMap((c) => [c.title, c.body]), blogRailCta().title, blogRailCta().body].join("\n")
    check("  no banned words, no em dash", !BANNED.test(all), all.match(BANNED))
  }

  console.log("\nSwitching categories")
  {
    const nav = code("app/(storelib)/(marketing)/blog/_components/blog-nav.tsx")
    /* Changed on purpose (blog round 15): the measured sliding fill disagreed with its pill and cut the current one on the right (the owner's screenshot). Each pill now draws its own fill, easing colour, border, shadow and a press together. */
    check("each pill draws its own fill: no measured shape under the row", !/function Fill\(/.test(nav) && !/data-blog-fill/.test(nav) && /border-\[#1a1a2e\] bg-\[#1a1a2e\] text-white/.test(nav))
    check("  200ms ease out on colour, border, shadow and the press, off with reduced motion", /transition-\[background-color,border-color,color,box-shadow,scale\] duration-200 ease-\[cubic-bezier\(0\.22,1,0\.36,1\)\]/.test(nav) && /group-active:scale-\[0\.97\]/.test(nav) && /motion-reduce:transition-none/.test(nav))
    check("  nothing animates width or position", !/transition-all|transition-\[width|transition-\[left|transition-\[transform,width/.test(nav))
    check("  the row never clips a pill: it wraps from 640px; on a phone it scrolls with padding on every side", /min-\[640px\]:flex-wrap min-\[640px\]:overflow-visible/.test(nav) && /overflow-x-auto scroll-px-\[var\(--home-edge\)\] px-\[var\(--home-edge\)\] py-1\.5/.test(nav) && !/-m[xlr]-/.test(nav))
    check("  stuck, the header drops its shadow and the row carries it (no fade over the pills)", /\{stuck \? <style>\{`#platform-header-root\{box-shadow:none!important\}`\}<\/style> : null\}/.test(nav) && /data-\[stuck=true\]:\[box-shadow:var\(--bar-depth\)\]/.test(nav))
    check("  pills are still real links, the list keyed by address", /<Link href=\{href\} scroll=\{false\}/.test(nav) && /<Pill href="\/blog"/.test(nav) && /<Pill href=\{`\/blog\/category\/\$\{c\.slug\}`\}/.test(nav) && /<div key=\{pathname\} className=\{leaving \? "blog-list-out"/.test(nav))
    check("  pressing the pill already shown fades nothing", /if \(e\.currentTarget\.pathname === pathname\) return/.test(nav))
    check("  the category line keeps 3 lines' height on a phone, 2 from 640px (no jump under the title)", /min-h-\[4\.8em\][^"]*sm:min-h-\[3\.2em\]/.test(nav))
    const css = read("app/globals.css")
    check("the old list fades out fast, the new one fades in rising 6px", /\.blog-list-out \{\s*opacity: 0;\s*transition: opacity 120ms/.test(css) && /\.blog-list-swap \{\s*animation: blog-list-swap 220ms cubic-bezier\(0\.22, 1, 0\.36, 1\) backwards;/.test(css) && /from \{ opacity: 0; transform: translate3d\(0, 6px, 0\); \}/.test(css))
    check("  reduced motion: no fade, no rise", /prefers-reduced-motion: reduce\) \{\s*\.blog-list-out \{ opacity: 1; transition: none; \}\s*\.blog-list-swap, \.blog-title-swap \{ animation: none; \}/.test(css))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main()
