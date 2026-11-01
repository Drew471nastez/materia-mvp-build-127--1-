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
 *   THE PRESSED PILL turns dark at once, before the next page has arrived.
 *   THE PLACE ON THE PAGE stays: when the row is stuck under the site header
 *     the new list starts right under it; when it is not, nothing scrolls.
 *   THE LIST fades in (opacity only, 180ms; nothing on a first load and
 *     nothing with reduced motion).
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
  const restore = useRef<number | null>(null)
  /* The pill pressed, from the page it was pressed on: shown as current until that page has changed. */
  const [pressed, setPressed] = useState<{ from: string; slug: string | null } | null>(null)
  /* The page a pill was last pressed on: the list fades in only after a press, never on a first load. */
  const [swapFrom, setSwapFrom] = useState<string | null>(null)
  const [stuck, setStuck] = useState(false)

  const active = pressed && pressed.from === pathname ? pressed.slug : slug

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
    if (restore.current === null) return
    window.scrollTo(0, restore.current)
    restore.current = null
  }, [pathname])

  /* The current pill in view inside the row, on a phone where the row scrolls sideways. Never moves the page. */
  useEffect(() => {
    const ul = row.current
    const pill = ul?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!ul || !pill || ul.scrollWidth <= ul.clientWidth) return
    const left = pill.offsetLeft - ul.offsetLeft
    if (left < ul.scrollLeft || left + pill.offsetWidth > ul.scrollLeft + ul.clientWidth) ul.scrollTo({ left: Math.max(0, left - 16) })
  }, [active])

  if (!list) return <>{children}</>

  const current = slug ? categories.find((c) => c.slug === slug) : undefined
  const shown = categories.filter((c) => c.hasPosts || c.slug === slug)

  function press(e: MouseEvent<HTMLAnchorElement>, to: string | null) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    setPressed({ from: pathname, slug: to })
    setSwapFrom(pathname)
    const mark = sentinel.current
    const top = headerHeight()
    const y = mark ? mark.getBoundingClientRect().top : 0
    /* Stuck (scrolled past its place): keep it stuck, with the new list starting under it. Not stuck: leave the page where it is. */
    restore.current = mark && y < top ? Math.round(window.scrollY + y - top) : null
  }

  return (
    <div ref={root} data-blog-lists="">
      <header className="mx-auto w-full max-w-[1240px] px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8" data-blog-list-header="">
        <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-[#1a1a2e] sm:text-[48px]">{current ? current.name : "Blog"}</h1>
        <p className="mt-3 max-w-[64ch] text-[17px] leading-[1.6] text-[#4b5563] sm:min-h-[3.2em] sm:text-[18px]">{current ? current.description : description}</p>
      </header>

      <div ref={sentinel} aria-hidden className="mt-6 h-px sm:mt-7" />
      <nav
        aria-label="Blog categories"
        data-blog-categories=""
        data-stuck={stuck ? "true" : undefined}
        className="sticky top-[var(--blog-top,65px)] z-30 border-b border-transparent bg-white transition-[border-color] duration-150 data-[stuck=true]:border-[#eceef1]"
      >
        <div className="mx-auto w-full max-w-[1240px] sm:px-6 lg:px-8">
          <ul ref={row} className="flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden">
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

      <div key={pathname} className={swapFrom !== null && swapFrom !== pathname ? "blog-list-swap" : undefined}>
        {children}
      </div>
    </div>
  )
}

/**
 * One pill, in the integrations directory's style (components/app/settings/
 * integrations-directory.tsx), a size up for a public page: 36px drawn, in a
 * 44px tall link so a thumb finds it.
 */
function Pill({ href, on, onClick, children }: { href: string; on: boolean; onClick: (e: MouseEvent<HTMLAnchorElement>) => void; children: ReactNode }) {
  return (
    <Link href={href} scroll={false} onClick={onClick} aria-current={on ? "page" : undefined} className="group flex h-11 items-center outline-none [-webkit-tap-highlight-color:transparent]" data-blog-pill="">
      <span
        className={`inline-flex h-9 items-center whitespace-nowrap rounded-full border px-4 text-[14px] font-medium transition-colors duration-100 group-focus-visible:ring-[3px] group-focus-visible:ring-[#1a1a2e]/20 ${
          on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] group-hover:border-[#d1d5db] group-active:bg-[#f3f4f6]"
        }`}
      >
        {children}
      </span>
    </Link>
  )
}
