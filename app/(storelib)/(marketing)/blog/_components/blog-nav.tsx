"use client"

/**
 * ===========================================================================
 *  THE BLOG'S TITLE AND CATEGORY PILLS, KEPT IN PLACE BETWEEN LISTS
 * ===========================================================================
 * Round 47, the owner: "moving between categories must be smooth". Drawn by
 * ../layout.tsx around every page of the blog, and on the lists only (/blog,
 * /blog/page/N, /blog/category/<slug> and its pages): on an article or an
 * author page it draws nothing and hands its children through untouched.
 *
 * Because it lives in the layout, a move from /blog to /blog/category/growth
 * changes the list below and nothing else. Each pill is a real <a href> (a
 * next/link, prefetched), so a crawler and a reader without script reach
 * every category at its own address.
 *
 *   THE PRESSED PILL is marked at once, before the next page has arrived.
 *   THE PLACE ON THE PAGE stays: when the row is stuck under the site header
 *     the new list starts right under it; when it is not, nothing scrolls.
 *
 * Round 49, the owner: switching "feels too direct and fast, cheap".
 *   THE DARK FILL SLIDES from the old pill to the new one (240ms, ease out),
 *     drawn as one indicator under the row's text: two round caps and a
 *     straight middle, each moved with transform alone (the middle scaled
 *     sideways, the caps never scaled, so the ends stay round mid way).
 *     Until the script has measured the row, and with no script, the
 *     current pill draws its own fill, so the first paint is the same.
 *   THE LIST CROSSFADES: the old one fades out fast (120ms) as soon as a
 *     pill is pressed, the new one fades in rising 6px (220ms), opacity and
 *     transform only (globals.css .blog-list-out / .blog-list-swap).
 *   With reduced motion nothing moves or fades: the fill and the list
 *     simply change.
 *
 * The row sits under the site header by the header's own measured height
 * (`--blog-top`, the way the developer hub does it), with the phone's 65px
 * until that has run. Categories with no live posts are left out; the one
 * being read is always there.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"

export interface BlogNavCategory {
  slug: string
  name: string
  /** The line under the title on its page. */
  description: string
  /** It has at least one live post; a pill is drawn only then (or while it is the page being read). */
  hasPosts: boolean
}

/** /blog, /blog/page/N, /blog/category/<slug>, /blog/category/<slug>/page/N. */
const LIST_PATH = /^\/blog(?:\/page\/\d+|\/category\/([^/]+)(?:\/page\/\d+)?)?\/?$/

/** Whether a path is one of the blog's lists, and which category (null for all of them). */
export function blogListOf(pathname: string): { list: boolean; slug: string | null } {
  const m = LIST_PATH.exec(pathname)
  return m ? { list: true, slug: m[1] ?? null } : { list: false, slug: null }
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

function headerHeight(): number {
  const header = document.getElementById("platform-header-root")
  return header ? Math.round(header.getBoundingClientRect().height) : 65
}

export function BlogNav({ categories, description, children }: { categories: BlogNavCategory[]; description: string; children: ReactNode }) {
  const pathname = usePathname() ?? ""
  const { list, slug } = blogListOf(pathname)
  const root = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLUListElement>(null)
  /* A pill was pressed while the row was stuck: keep it stuck once the new page is in. */
  const restore = useRef(false)
  /* The pill pressed, from the page it was pressed on: shown as current until that page has changed. */
  const [pressed, setPressed] = useState<{ from: string; slug: string | null } | null>(null)
  /* The page a pill was last pressed on: the list fades in only after a press, never on a first load. */
  const [swapFrom, setSwapFrom] = useState<string | null>(null)
  const [stuck, setStuck] = useState(false)
  /* Where the sliding fill sits (px inside the row), null until measured. */
  const [fill, setFill] = useState<{ x: number; y: number; w: number; h: number; animate: boolean } | null>(null)

  const active = pressed && pressed.from === pathname ? pressed.slug : slug
  /* The old list fades out from the press until the new page arrives. */
  const leaving = pressed !== null && pressed.from === pathname

  /* The site header's height, measured, for the row's `top`; and whether the row is stuck under it. */
  useEffect(() => {
    if (!list) return
    const el = root.current
    const mark = sentinel.current
    if (!el || !mark) return
    const header = document.getElementById("platform-header-root")
    let io: IntersectionObserver | undefined
    const watch = () => {
      const top = headerHeight()
      el.style.setProperty("--blog-top", `${top}px`)
      io?.disconnect()
      io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < top), { rootMargin: `-${top}px 0px 0px 0px` })
      io.observe(mark)
    }
    watch()
    const ro = typeof ResizeObserver !== "undefined" && header ? new ResizeObserver(watch) : undefined
    if (ro && header) ro.observe(header)
    return () => {
      io?.disconnect()
      ro?.disconnect()
    }
  }, [list])

  /* After a press: back to the row's stuck place, before the new list is painted. */
  useIsoLayoutEffect(() => {
    if (!restore.current) return
    restore.current = false
    /* Measured from the new page, not the old one: a category's line can be a line taller or shorter on a phone (round 49: it was left 28px under the header). */
    const mark = sentinel.current
    if (mark) window.scrollTo(0, Math.ceil(window.scrollY + mark.getBoundingClientRect().top - headerHeight()))
  }, [pathname])

  /* The sliding fill: measured from the current pill when it changes (moving there with the transition), and again, without one, whenever the row changes size (fonts, a resize). */
  useIsoLayoutEffect(() => {
    const ul = row.current
    if (!list || !ul) return
    const place = (animate: boolean) => {
      const pill = ul.querySelector<HTMLElement>('[data-blog-pill][aria-current="page"] > span')
      if (!pill) return setFill(null)
      const a = pill.getBoundingClientRect()
      const b = ul.getBoundingClientRect()
      const next = { x: a.left - b.left - ul.clientLeft + ul.scrollLeft, y: a.top - b.top - ul.clientTop + ul.scrollTop, w: a.width, h: a.height }
      setFill((was) => (was && was.x === next.x && was.y === next.y && was.w === next.w && was.h === next.h ? was : { ...next, animate: animate && was !== null }))
    }
    place(true)
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place(false)) : undefined
    ro?.observe(ul)
    ul.querySelectorAll("[data-blog-pill] > span").forEach((el) => ro?.observe(el))
    return () => ro?.disconnect()
  }, [list, active])

  /* The current pill in view inside the row, on a phone where the row scrolls sideways. Never moves the page. */
  useEffect(() => {
    const ul = row.current
    const pill = ul?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!ul || !pill || ul.scrollWidth <= ul.clientWidth) return
    /* The row is the pill's offsetParent (it is positioned, for the fill). */
    const left = pill.offsetLeft
    if (left < ul.scrollLeft || left + pill.offsetWidth > ul.scrollLeft + ul.clientWidth) ul.scrollTo({ left: Math.max(0, left - 16) })
  }, [active])

  if (!list) return <>{children}</>

  const current = slug ? categories.find((c) => c.slug === slug) : undefined
  const shown = categories.filter((c) => c.hasPosts || c.slug === slug)

  function press(e: MouseEvent<HTMLAnchorElement>, to: string | null) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    /* The page already being read: nothing changes, so nothing fades. */
    if (e.currentTarget.pathname === pathname) return
    setPressed({ from: pathname, slug: to })
    setSwapFrom(pathname)
    const mark = sentinel.current
    const top = headerHeight()
    const y = mark ? mark.getBoundingClientRect().top : 0
    /* Stuck (scrolled past its place): keep it stuck, with the new list starting under it. Not stuck: leave the page where it is. */
    restore.current = !!mark && y < top
  }

  return (
    <div ref={root} data-blog-lists="">
      {/* Re-keyed by category so its name and line fade in with the list (opacity only) after a press. */}
      <header key={slug ?? ""} className={`home-wrap pt-10 sm:pt-16 lg:pt-20 ${swapFrom !== null && swapFrom !== pathname ? "blog-title-swap" : ""}`} data-blog-list-header="">
        <h1 className="text-[clamp(44px,5vw,76px)] font-medium leading-[1.04] tracking-[-0.05em] text-[#1a1a2e]">{current ? current.name : "Blog"}</h1>
        <p className="mt-4 min-h-[4.8em] max-w-[62ch] text-[17px] leading-[1.6] text-[#6b6b76] sm:min-h-[3.2em] sm:text-[clamp(17px,1.35vw,19px)]">{current ? current.description : description}</p>
      </header>

      <div ref={sentinel} aria-hidden className="mt-6 h-px sm:mt-7" />
      <nav
        aria-label="Blog categories"
        data-blog-categories=""
        data-stuck={stuck ? "true" : undefined}
        className="sticky top-[var(--blog-top,65px)] z-30 border-b border-transparent bg-white transition-[border-color] duration-150 data-[stuck=true]:border-[#eceef1]"
      >
        <div className="mx-auto w-full max-w-[var(--home-max)] min-[640px]:px-[var(--home-edge)]">
          <ul ref={row} className="relative flex gap-2 overflow-x-auto px-[var(--home-edge)] py-1 min-[640px]:px-0 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden data-[blog-fill-ready]:[&_[aria-current=page]>span]:border-transparent data-[blog-fill-ready]:[&_[aria-current=page]>span]:bg-transparent" data-blog-fill-ready={fill ? "true" : undefined}>
            {fill ? <Fill {...fill} /> : null}
            <li className="shrink-0">
              <Pill href="/blog" on={active === null} onClick={(e) => press(e, null)}>
                All
              </Pill>
            </li>
            {shown.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Pill href={`/blog/category/${c.slug}`} on={active === c.slug} onClick={(e) => press(e, c.slug)}>
                  {c.name}
                </Pill>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div key={pathname} className={leaving ? "blog-list-out" : swapFrom !== null && swapFrom !== pathname ? "blog-list-swap" : undefined} data-blog-list-swap="">
        {children}
      </div>
    </div>
  )
}

/**
 * THE SLIDING FILL (round 49). Three pieces under the pills' text, each
 * moved by transform only: a round cap on each end (half the pill's height
 * wide, never scaled) and a straight 1px middle scaled to the width between
 * them. The middle overlaps each cap by a pixel so no seam shows. The
 * wrapper is an <li> (the row is a list) hidden from screen readers, and
 * out of flow: as a flex item it took a gap and pushed every
 * pill 8px right once measured (seen as layout shift).
 */
function Fill({ x, y, w, h, animate }: { x: number; y: number; w: number; h: number; animate: boolean }) {
  const r = h / 2
  const move = animate ? "transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" : ""
  const piece = `pointer-events-none absolute left-0 top-0 bg-[#1a1a2e] will-change-transform ${move}`
  return (
    <li aria-hidden className="pointer-events-none absolute left-0 top-0" data-blog-fill="">
      <span className={`${piece} rounded-l-full`} style={{ width: r, height: h, transform: `translate3d(${x}px, ${y}px, 0)` }} />
      <span className={`${piece} origin-left`} style={{ width: 1, height: h, transform: `translate3d(${x + r - 1}px, ${y}px, 0) scaleX(${Math.max(0, w - 2 * r + 2)})` }} />
      <span className={`${piece} rounded-r-full`} style={{ width: r, height: h, transform: `translate3d(${x + w - r}px, ${y}px, 0)` }} />
    </li>
  )
}

/**
 * One pill, in the integrations directory's style (components/app/settings/
 * integrations-directory.tsx), a size up for a public page: 36px drawn, in a
 * 44px tall link so a thumb finds it. Round 49: once the row has its
 * sliding fill (data-blog-fill-ready on the row), the current pill's own
 * fill and border step aside and the text changes colour with the fill's timing.
 */
function Pill({ href, on, onClick, children }: { href: string; on: boolean; onClick: (e: MouseEvent<HTMLAnchorElement>) => void; children: ReactNode }) {
  return (
    <Link href={href} scroll={false} onClick={onClick} aria-current={on ? "page" : undefined} className="group relative flex h-11 items-center outline-none [-webkit-tap-highlight-color:transparent]" data-blog-pill="">
      <span
        className={`relative inline-flex h-9 items-center whitespace-nowrap rounded-full border px-4 text-[14px] font-medium transition-[color,border-color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-visible:ring-[3px] group-focus-visible:ring-[#1a1a2e]/20 motion-reduce:transition-none ${
          on
            ? "border-[#1a1a2e] bg-[#1a1a2e] text-white"
            : "border-[#e4e4e9] bg-transparent text-[#3f3f46] group-hover:border-[#c9c9d1] group-hover:text-[#1a1a2e]"
        }`}
      >
        {children}
      </span>
    </Link>
  )
}
