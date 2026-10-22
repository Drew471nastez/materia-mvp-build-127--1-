"use client"

/**
 * ===========================================================================
 *  THE COMPOSER'S GIF BUTTON
 * ===========================================================================
 * A search over Giphy, through Storelib's own route (/api/community/<id>/gifs,
 * which holds the key): what is trending when the box is empty, results a
 * moment after typing stops. A popover by the button on a computer, about
 * 340 by 380 and never more than the room it has (round 12,
 * components/ui/popover-fit.ts), the shared sheet on a phone. A pick goes
 * into the post as a GIF with its still.
 *
 * Without GIPHY_API_KEY the route answers `connected: false`: the button is
 * drawn quieter and opening it says GIFs are not connected, nothing more.
 */
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { useCallback, useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { FIT_POPOVER, GIF_POPOVER, fitBox } from "@/components/ui/popover-fit"
import type { PostMedia } from "@/lib/communities/types"
import { api, apiBase } from "./api"

interface Gif {
  id: string
  url: string
  still: string
  w: number
  h: number
  title: string
}

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

/** The letters GIF, drawn like the toolbar's other icons. */
function GifMark() {
  return (
    <span aria-hidden className="text-[12px] font-bold leading-none tracking-[0.02em]">
      GIF
    </span>
  )
}

/**
 * WHAT GIPHY SENT LAST, per community and search, for this page's life: the
 * button's own "is it connected" question already brings what is trending,
 * so opening the picker shows those at once, and a search typed again shows
 * its GIFs at once while they are read again.
 */
type GifPage = { connected: boolean; gifs: Gif[]; next: number | null }
const seen = new Map<string, GifPage>()
const seenKey = (communityId: string, q: string) => `${communityId}:${q.toLowerCase()}`
/** The communities whose GIFs are not connected, as the route said this page. */
const offFor = new Set<string>()

export function GifButton({
  communityId,
  className,
  onPick,
  disabled = false,
  hideWhenOff = false,
}: {
  communityId: string
  className: string
  onPick: (gif: Extract<PostMedia, { type: "gif" }>) => void
  disabled?: boolean
  /** Round 38, the chat's box: no button at all until GIFs are known to be connected (a quiet one is clutter there). */
  hideWhenOff?: boolean
}) {
  const phone = usePhone()
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(() => (offFor.has(communityId) ? false : (seen.get(seenKey(communityId, ""))?.connected ?? null)))

  /*
    Asked once while the editor is open, so the button knows whether GIFs are connected before it is pressed (and the
    trending ones are here for the picker). Once per page for a community (round 11): every comment box on a post has
    a GIF button too, and the first answer serves them all.
  */
  useEffect(() => {
    if (seen.has(seenKey(communityId, "")) || offFor.has(communityId)) return
    let stop = false
    void api<GifPage>(`${apiBase(communityId)}/gifs`).then((r) => {
      if (stop || !r.ok) return
      setConnected(r.data.connected)
      if (r.data.connected) seen.set(seenKey(communityId, ""), { connected: true, gifs: r.data.gifs ?? [], next: r.data.next ?? null })
      else offFor.add(communityId)
    })
    return () => {
      stop = true
    }
  }, [communityId])

  const pick = (g: Gif) => {
    setOpen(false)
    onPick({ type: "gif", url: g.url, still: g.still, w: g.w, h: g.h, ...(g.title ? { title: g.title } : {}) })
  }

  const trigger = (
    <button
      type="button"
      aria-label={connected === false ? "GIFs (not connected)" : "Add a GIF"}
      title={connected === false ? "GIFs are not connected" : "Add a GIF"}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={disabled}
      data-composer-gif={connected === false ? "off" : "on"}
      onClick={() => setOpen((o) => !o)}
      className={`${className} ${connected === false ? "opacity-50" : ""}`}
    >
      <GifMark />
    </button>
  )

  if (hideWhenOff && connected !== true) return null

  const panel = <GifPanel communityId={communityId} active={open} connected={connected} onConnected={setConnected} onPick={pick} phone={phone} />

  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet
          isOpen={open}
          onClose={() => setOpen(false)}
          label="GIFs"
          /* Tied to the visible viewport so the sheet and keyboard resize together (no jump on search focus). */
          height="calc(var(--vv-h, 100dvh) * 0.72)"
          maxHeight="calc(var(--vv-h, 100dvh) * 0.72)"
          fill
          aboveKeyboard
          zIndex={140}
        >
          {panel}
        </BottomSheet>
      </>
    )
  }
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>{trigger}</PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          side="top"
          sideOffset={8}
          {...FIT_POPOVER}
          style={fitBox(GIF_POPOVER.w, GIF_POPOVER.h)}
          data-gif-popover=""
          className="z-[2147483640] flex flex-col overflow-hidden rounded-xl border border-[#e3e4e8] bg-white shadow-[0_16px_40px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150"
        >
          {panel}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * Two columns, each GIF to the shorter one, in order. A page that arrives
 * later only adds to the bottom of them: the GIFs already there never move
 * to the other column (a CSS multi-column grid rebalanced on every page).
 */
function columnsOf(gifs: Gif[]): [Gif[], Gif[]] {
  const cols: [Gif[], Gif[]] = [[], []]
  const tall = [0, 0]
  for (const g of gifs) {
    const c = tall[0] <= tall[1] ? 0 : 1
    cols[c].push(g)
    tall[c] += g.h / Math.max(1, g.w)
  }
  return cols
}

/** A thin grey spinner in the middle of where the GIFs go: for the first answer only, never over GIFs already shown. */
function Spinner() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center" role="status" aria-label="Loading GIFs" data-gif-loading="">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#d9dce1] border-t-[#8a8f98] motion-reduce:animate-none" aria-hidden />
    </div>
  )
}

/**
 * The search and the GIFs. While a new search is read the GIFs on screen
 * stay (a little lighter) until the new ones are here, so typing never
 * flashes an empty grid; the very first answer, when nothing was here yet,
 * gets a small spinner. Each GIF keeps its own shape from the first frame
 * (Giphy says how big it is), so the grid never moves as they load, and
 * the next page comes as the end of the list nears.
 */
function GifPanel({ communityId, active, connected, onConnected, onPick, phone }: { communityId: string; active: boolean; connected: boolean | null; onConnected: (c: boolean) => void; onPick: (g: Gif) => void; phone: boolean }) {
  const [q, setQ] = useState("")
  const term = q.trim()
  const [page, setPage] = useState<GifPage | null>(() => seen.get(seenKey(communityId, "")) ?? null)
  /* The search the GIFs on screen answer. */
  const [shownFor, setShownFor] = useState("")
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [more, setMore] = useState(false)
  const ask = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    async (words: string) => {
      const n = ++ask.current
      const have = seen.get(seenKey(communityId, words))
      if (have) {
        setPage(have)
        setShownFor(words)
      }
      setFailed(false)
      setLoading(!have)
      const r = await api<GifPage>(`${apiBase(communityId)}/gifs?q=${encodeURIComponent(words)}`)
      if (n !== ask.current) return
      setLoading(false)
      if (!r.ok) {
        if (!have) setFailed(true)
        return
      }
      onConnected(r.data.connected)
      const next: GifPage = { connected: r.data.connected, gifs: r.data.gifs ?? [], next: r.data.next ?? null }
      if (next.connected) seen.set(seenKey(communityId, words), next)
      setPage(next)
      setShownFor(words)
    },
    [communityId, onConnected],
  )

  useEffect(() => {
    if (!active || connected === false) return
    /* The trending ones are already here when the button asked: show them, read again only when typing. */
    if (!term && seen.get(seenKey(communityId, ""))) {
      ask.current++
      setPage(seen.get(seenKey(communityId, ""))!)
      setShownFor("")
      setLoading(false)
      return
    }
    /* Words already searched show their GIFs on this keystroke; they are read again once typing stops. */
    const have = seen.get(seenKey(communityId, term))
    if (have) {
      setPage(have)
      setShownFor(term)
    }
    const t = window.setTimeout(() => void load(term), term ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [active, term, load, connected, communityId])

  const loadMore = useCallback(async () => {
    if (!page?.next || more) return
    const words = shownFor
    const n = ask.current
    setMore(true)
    const r = await api<GifPage>(`${apiBase(communityId)}/gifs?q=${encodeURIComponent(words)}&offset=${page.next}`)
    setMore(false)
    if (n !== ask.current || !r.ok) return
    const have = new Set(page.gifs.map((g) => g.id))
    const next: GifPage = { connected: true, gifs: [...page.gifs, ...(r.data.gifs ?? []).filter((g) => !have.has(g.id))], next: r.data.next ?? null }
    seen.set(seenKey(communityId, words), next)
    setPage(next)
  }, [page, more, shownFor, communityId])

  /* The next page as the end of the list comes near. */
  useEffect(() => {
    const el = endRef.current
    if (!el || !page?.next || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && void loadMore(), { rootMargin: "240px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [page?.next, loadMore])

  if (connected === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 py-10 text-center" data-gif-off="">
        <p className="text-[14.5px] font-medium text-[#1a1a2e]">GIFs are not connected</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6b7280]">Storelib turns on GIF search once it is set up. Pictures and videos work as usual.</p>
      </div>
    )
  }

  const gifs = page?.gifs ?? null
  const stale = loading && shownFor !== term
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-2.5">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search GIPHY"
            aria-label="Search GIFs"
            autoFocus={!phone}
            autoComplete="off"
            enterKeyHint="search"
            className="h-10 w-full rounded-lg border border-transparent bg-[#f3f4f6] pl-9 pr-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#e3e5e8] focus:bg-white sm:text-[14px] [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        {!term && gifs?.length ? <p className="px-1 pt-2 text-[12px] font-medium text-[#8a8f98]">Trending</p> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-2.5" data-gif-results="" aria-busy={loading || undefined}>
        {failed ? (
          <div className="flex flex-col items-center px-4 py-10 text-center" data-gif-failed="">
            <p className="text-[13.5px] text-[#6b7280]">GIFs did not load.</p>
            <button type="button" onClick={() => void load(term)} className="mt-2 inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4]">
              Try again
            </button>
          </div>
        ) : gifs === null ? (
          <Spinner />
        ) : gifs.length === 0 && !stale ? (
          <p className="px-4 py-10 text-center text-[13.5px] text-[#6b7280]" data-gif-empty="">
            {shownFor ? `No GIFs for "${shownFor}". Try other words.` : "No GIFs to show right now."}
          </p>
        ) : (
          <div className={`flex items-start gap-1.5 transition-opacity duration-150 motion-reduce:transition-none ${stale ? "opacity-60" : ""}`} data-gif-grid="">
            {columnsOf(gifs).map((col, c) => (
              <div key={c} className="flex min-w-0 flex-1 flex-col gap-1.5">
                {col.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onPick(g)}
                aria-label={g.title || "GIF"}
                className="relative block w-full overflow-hidden rounded-lg bg-[#f1f2f4] outline-none transition-[opacity] active:opacity-80 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 [-webkit-tap-highlight-color:transparent]"
                style={{ aspectRatio: `${g.w} / ${g.h}` }}
                data-gif=""
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt="" width={g.w} height={g.h} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
              </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div ref={endRef} aria-hidden className="h-px" />
        {more ? (
          <div className="flex justify-center py-2" aria-hidden>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#d9dce1] border-t-[#8a8f98] motion-reduce:animate-none" />
          </div>
        ) : null}
        <p className="pt-2 text-center text-[11px] text-[#9ca3af]">Powered by GIPHY</p>
      </div>
    </div>
  )
}
