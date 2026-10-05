"use client"

/**
 * ===========================================================================
 *  THE GRID IN COMMUNITIES MODE
 * ===========================================================================
 * The products are all in the page already and are filtered where they sit.
 * Communities are not: there can be any number of them, so the server finds
 * them (lib/communities/server/explore.ts) a page at a time, by the pill,
 * the search word, the order and the price the page hands in here.
 *
 * The first page usually came with the page: /explore?type=communities draws
 * it on the server, and the query it was drawn for travels with it. Every
 * answer is kept per question (lib/explore/communities-cache), so a pill seen
 * before draws at once from memory, a press starts the request before the
 * tap lands, the pills beside the current one are warmed while the page is
 * idle, and an answer to a question that has since been replaced is kept
 * for later but never drawn, so tapping through the pills quickly never
 * lands on an older list. While a new question is on its way the previous
 * grid stays (a step quieter); a skeleton only when there was never a grid.
 * "Show more" asks for the next page by its cursor.
 *
 * A SUBCATEGORY from the More picker travels as `sub` beside its category.
 * Communities store a category and never a subcategory, so the server
 * narrows the category by the subcategory's words; when nothing in it has
 * them it answers with the whole category and `broadened`, and a quiet line
 * above the grid says so rather than leaving the visitor wondering why
 * "Notion Templates" shows a cooking club. The next pages of a broadened
 * list are asked for without the subcategory.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import type { CommunityCard } from "@/lib/communities/types"
import { communitiesQuery } from "@/lib/explore/communities-mode"
import { cachedCommunities, COMMUNITIES_PAGE, hasMoreThanFirstPage, keepMoreCommunities, loadCommunities, prefetchCommunities, seedCommunities, type CommunitiesPage } from "@/lib/explore/communities-cache"
import { prefetchBudget, whenIdle } from "@/lib/explore/prefetch-budget"
import { useProgressiveCount } from "@/lib/explore/use-progressive-count"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { ExploreCommunityGrid } from "./community-card"

export interface CommunitiesFirstPage {
  /** communitiesQuery() of the choices it was drawn for. */
  query: string
  items: CommunityCard[]
  next: string | null
  /** A subcategory nothing in its category mentions: these are the whole category. */
  broadened?: boolean
}

export function ExploreCommunitiesResults({
  initial,
  q,
  category,
  sub = null,
  subLabel = null,
  srt,
  price,
  categoryLabel,
  onClearFilters,
  filtersOn,
  ahead = [],
}: {
  initial: CommunitiesFirstPage | null
  q: string
  category: string
  /** The subcategory picked in More, inside `category`. */
  sub?: string | null
  subLabel?: string | null
  srt: string
  price: string
  /** The pill's name, for "No communities in Design yet". */
  categoryLabel: string | null
  onClearFilters: () => void
  filtersOn: boolean
  /** The questions likely to be asked next (the pills beside this one), most likely first: warmed on idle, within the device's budget. */
  ahead?: string[]
}) {
  const query = communitiesQuery({ q, category, sub, srt, price })
  /*
    A COMMUNITY ABOUT TO BE OPENED IS ASKED FOR WHOLE. Its route is dynamic,
    so the link's own prefetch stops at the community's loading screen; a
    pointer resting on a card (a mouse) or pressing it (a finger) asks for
    the whole page ("full", as the community's own places do in
    shell-frame.tsx), once per card, so the click usually finds it here and
    the community lands in one piece, with no spinner in its middle.
  */
  const router = useRouter()
  const warmed = React.useRef(new Set<string>())
  const warm = (e: React.PointerEvent<HTMLElement>) => {
    const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[data-explore-community]") : null
    const href = link?.getAttribute("href")
    if (!href || !href.startsWith("/") || warmed.current.has(href)) return
    if (e.type === "pointerover" && e.pointerType !== "mouse") return
    warmed.current.add(href)
    try {
      router.prefetch(href, { kind: "full" } as never)
    } catch {
      /* a prefetch that fails is a click that waits, nothing worse */
    }
  }
  /* The server's first page is kept as if it had been asked for, before the first render reads the cache. */
  if (initial) seedCommunities(initial.query, { items: initial.items, next: initial.next, broadened: initial.broadened === true })
  /*
    WHAT IS ON SCREEN AND WHICH QUESTION IT ANSWERS. While a new question is
    on its way the previous answer stays (dimmed a little, only if the wait
    is long enough to notice); a skeleton is drawn only when there has never
    been anything to show.
  */
  const [shown, setShown] = React.useState<(CommunitiesPage & { query: string }) | null>(() => {
    const hit = cachedCommunities(query)
    return hit ? { query, items: hit.items, next: hit.next, broadened: hit.broadened } : null
  })
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    let live = true
    const hit = cachedCommunities(query)
    if (hit) {
      setShown({ query, items: hit.items, next: hit.next, broadened: hit.broadened })
      setFailed(false)
      /* A list the visitor paged through with Show more is theirs: an older answer is not swapped for a first page under them (keepMoreCommunities). */
      if (!hit.stale || hasMoreThanFirstPage(hit)) return
    }
    loadCommunities(query).then(
      (page) => {
        if (!live) return
        setShown({ query, ...page })
        setFailed(false)
      },
      () => {
        if (!live || hit) return
        setShown({ query, items: [], next: null, broadened: false })
        setFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [query])

  /* The next likely questions, once this one is answered and the page is idle, one at a time. */
  const aheadKey = ahead.join("|")
  const settled = shown?.query === query
  React.useEffect(() => {
    if (!settled) return
    const budget = prefetchBudget()
    const queue = ahead.filter((a) => a !== query).slice(0, budget)
    if (!queue.length) return
    let stopped = false
    let cancel = () => {}
    const step = () => {
      const next = queue.shift()
      if (stopped || next === undefined) return
      cancel = whenIdle(() => {
        void prefetchCommunities(next).then(step)
      })
    }
    step()
    return () => {
      stopped = true
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, query, aheadKey])

  const items = shown ? shown.items : null
  const next = shown ? shown.next : null
  const broadened = shown?.broadened === true
  const pending = !!shown && shown.query !== query
  /* A new list draws its first two rows first, the rest straight after (lib/explore/use-progressive-count). */
  const count = useProgressiveCount(shown?.query ?? "", items?.length ?? 0)
  /*
    THE CARDS ARE NOT DRAWN AGAIN FOR A TAP THAT DOES NOT CHANGE THEM. The
    tap's own render (the pill turning pressed) reaches this component with a
    new `ahead` list and the same cards; drawing twenty four cards again there
    is what made the pill late on a slow phone.
  */
  const grid = React.useMemo(() => (items && items.length ? <ExploreCommunityGrid cards={count < items.length ? items.slice(0, count) : items} priorityCount={1} /> : null), [items, count])

  const more = async () => {
    if (!next || loading || pending) return
    setLoading(true)
    setFailed(false)
    try {
      /* A broadened list goes on as the whole category: the next page is asked for without the subcategory. */
      const pageQuery = broadened ? communitiesQuery({ q, category, srt, price }) : query
      const res = await fetch(`/api/explore/communities?${pageQuery}${pageQuery ? "&" : ""}limit=${COMMUNITIES_PAGE}&cursor=${encodeURIComponent(next)}`)
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { items: CommunityCard[]; next: string | null }
      /* The longer list is kept for the way back too (keepMoreCommunities). */
      if (shown && shown.query === query) {
        const seen = new Set(shown.items.map((c) => c.id))
        keepMoreCommunities(query, { items: [...shown.items, ...body.items.filter((c) => !seen.has(c.id))], next: body.next, broadened: shown.broadened })
      }
      setShown((was) => {
        if (!was || was.query !== query) return was
        const seen = new Set(was.items.map((c) => c.id))
        return { ...was, items: [...was.items, ...body.items.filter((c) => !seen.has(c.id))], next: body.next }
      })
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  if (items === null) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" data-communities-loading="" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (items.length === 0 && pending) {
    /* Nothing was found for the last question and the next is on its way: hold the room, say nothing about a list that is about to change. */
    return <div className="min-h-[60svh]" data-communities-results="" data-communities-pending="" aria-busy="true" />
  }

  if (items.length === 0) {
    const what = q
      ? `No communities found for "${q}"`
      : failed
        ? "Communities did not load."
        : filtersOn
          ? "No communities match your filters."
          : categoryLabel
            ? `No communities in ${categoryLabel} yet.`
            : "No communities yet."
    return (
      <div className="flex min-h-[60svh] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-12 text-center" data-communities-empty="">
        <p className="text-neutral-500">{what}</p>
        {!q && !failed && !filtersOn && !categoryLabel ? <p className="mt-1 text-[14px] text-neutral-400">When creators open one, it shows up here.</p> : null}
        {filtersOn ? (
          <button type="button" onClick={onClearFilters} className="mt-3 cursor-pointer text-sm font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900">
            Clear filters
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-communities-results=""
      data-communities-pending={pending ? "" : undefined}
      aria-busy={pending || undefined}
      onPointerOver={warm}
      onPointerDown={warm}
      /*
        The previous answer while the next is on its way: still there, still
        readable, a step quieter, and only after 160ms, so an answer from
        memory or a quick network never dims anything. Opacity alone, on the
        compositor.
      */
      className={cn("transition-opacity motion-reduce:transition-none", pending ? "opacity-60 delay-150 duration-200" : "opacity-100 duration-150")}
    >
      {broadened && subLabel && categoryLabel ? (
        <p className="-mt-1 mb-4 text-[14px] leading-5 text-neutral-500" data-communities-broadened="">
          No communities about {subLabel} yet, so here is everything in {categoryLabel}.
        </p>
      ) : null}
      {grid}
      {next ? (
        <div className="mt-8 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={more}
            disabled={loading || pending}
            data-show-more=""
            className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full bg-neutral-100 px-6 text-sm font-medium text-neutral-700 outline-none transition-colors hover:bg-neutral-200 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:cursor-default disabled:opacity-60"
          >
            {loading ? "Loading" : "Show more"}
          </button>
          {failed ? <p className="text-[13px] text-[#b42318]">That did not load. Try again.</p> : null}
        </div>
      ) : null}
    </div>
  )
}
