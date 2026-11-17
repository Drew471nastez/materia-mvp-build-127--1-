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
 *   THE LIST CROSSFADES: the old one fades out fast (120ms) as soon as a
 *     pill is pressed, the new one fades in rising 6px (220ms), opacity and
 *     transform only (globals.css .blog-list-out / .blog-list-swap).
 *
 * Blog round 15, the owner: the current pill was cut on its right edge,
 * overlapped by the next one. The fill that slid from pill to pill was a
 * separate shape placed from a measurement; whenever that measurement was
 * stale the dark shape and the pill it belonged to disagreed. Now every
 * pill draws its own fill, so a pill is always whole: the old one fades to
 * white while the new one fades to ink (200ms), and a press sinks the pill
 * a little. The row wraps from 640px, so nothing there can clip; on a phone
 * it scrolls sideways with room on every side for the pills' shadows.
 *   With reduced motion nothing moves or fades: the pills and the list
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

  /* The current pill in view inside the row, on a phone where the row scrolls sideways. Never moves the page. */
  useEffect(() => {
    const ul = row.current
    const pill = ul?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!ul || !pill || ul.scrollWidth <= ul.clientWidth) return
    /* The row is the pill's offsetParent (it is positioned). */
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
      {/*
        STUCK, THE ROW AND THE SITE HEADER ARE ONE BAR (blog round 15, the
        owner: the header's soft shadow lay over the pills). While the row
        is stuck the header drops its shadow and the row carries the same
        one (--bar-depth) at its own foot, so the depth sits under both and
        nothing fades over a pill. Written here, only while stuck, so every
        other page keeps the header exactly as it is.
      */}
      {stuck ? <style>{`#platform-header-root{box-shadow:none!important}`}</style> : null}
      <nav
        aria-label="Blog categories"
        data-blog-categories=""
        data-stuck={stuck ? "true" : undefined}
        className="sticky top-[var(--blog-top,65px)] z-30 bg-white transition-shadow duration-200 ease-out motion-reduce:transition-none data-[stuck=true]:[box-shadow:var(--bar-depth)]"
      >
        <div className="mx-auto w-full max-w-[var(--home-max)] min-[640px]:px-[var(--home-edge)]">
          {/*
            A phone: one line that scrolls sideways, padded on every side so
            no pill, shadow or focus ring meets the scroller's edge. From
            640px the pills wrap instead, so nothing scrolls or clips.
          */}
          <ul
            ref={row}
            className="relative flex gap-2 overflow-x-auto scroll-px-[var(--home-edge)] px-[var(--home-edge)] py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[640px]:flex-wrap min-[640px]:overflow-visible min-[640px]:px-0"
            data-blog-pills=""
          >
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
 * One pill, in the integrations directory's style (components/app/settings/
 * integrations-directory.tsx), a size up for a public page: 36px drawn, in a
 * 44px tall link so a thumb finds it. Blog round 15: each pill draws its own fill. At rest a
 * white key with a hairline and a soft drop; current, Storelib's ink with a
 * deeper drop; pressed, it sinks 3% and its drop flattens. Colour, border,
 * shadow and the press ease together over 200ms.
 */
function Pill({ href, on, onClick, children }: { href: string; on: boolean; onClick: (e: MouseEvent<HTMLAnchorElement>) => void; children: ReactNode }) {
  return (
    <Link href={href} scroll={false} onClick={onClick} aria-current={on ? "page" : undefined} className="group relative flex h-11 items-center outline-none [-webkit-tap-highlight-color:transparent]" data-blog-pill="">
      <span
        className={`relative inline-flex h-9 items-center whitespace-nowrap rounded-full border px-4 text-[14px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-active:scale-[0.97] group-focus-visible:ring-[3px] group-focus-visible:ring-[#1a1a2e]/20 motion-reduce:transition-none motion-reduce:group-active:scale-100 ${
          on
            ? "border-[#1a1a2e] bg-[#1a1a2e] text-white shadow-[0_1px_2px_rgba(26,26,46,0.18),0_4px_12px_-4px_rgba(26,26,46,0.4)] group-active:shadow-[0_1px_2px_rgba(26,26,46,0.2)]"
            : "border-[#e5e7eb] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(16,24,40,0.05)] group-hover:border-[#d1d5db] group-hover:text-[#1a1a2e] group-hover:shadow-[0_1px_2px_rgba(16,24,40,0.06),0_4px_10px_-6px_rgba(16,24,40,0.18)] group-active:bg-[#f8f9fa] group-active:shadow-none"
        }`}
      >
        {children}
      </span>
    </Link>
  )
}
