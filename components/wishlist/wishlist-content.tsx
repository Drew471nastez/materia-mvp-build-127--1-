"use client"

import { SoftImg } from "@/components/ui/soft-img"
import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Heart, Package } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { SmartLink } from "@/components/smart-link"
import { WishlistSkeleton } from "./wishlist-skeleton"
import { CARD, PRIMARY, SECONDARY, SMALL, VIOLET } from "@/components/library/library-ui"
import { cn } from "@/lib/utils"
import { getProductUrl } from "@/lib/url-helpers"
import { actionOf, entryOf, priceOf, type WishlistEntry } from "./wishlist-entry"

/**
 * ===========================================================================
 *  THE WISHLIST: WHAT THEY SAVED, AND THE ONE STEP TO EACH
 * ===========================================================================
 * "I don't like the product cards of the wishlist page. Fully fix it." They
 * were tall 4:3 photo cards with a tiny grey name, an X that only showed on
 * hover, a violet "View" and no way back from a mistaken remove.
 *
 * Now each saved product reads the way the rest of Storelib lists things:
 *
 *   ON A PHONE, rows in one card, as the library's products are
 *   (components/library/product-row.tsx): a 76px cover, the name on up to
 *   two lines, the seller's face and name, the price with "/month" for a
 *   membership and the saving when it is on sale, and one button under
 *   them. Two columns at 390 left a 170px card with a cover the size of a
 *   stamp and a name cut to one word, so it is rows.
 *   FROM 640PX, a grid of cards in Explore's shape
 *   (components/explore/product-card.tsx): the cover at 16:9, the same
 *   lines under it, the button at the foot, two, three then four across.
 *
 *   THE HEART is filled because it is saved, top right on every one, 44px
 *   to press. A press takes the product off at once (the rest close the
 *   gap on the compositor), and a bar at the foot says so with Undo for a few
 *   seconds, which puts it back where it was and saves it again.
 *
 *   THE BUTTON is what can happen next: Buy (or Get it free) straight to
 *   checkout, Join for a membership, View when a price or an option has to
 *   be chosen on the product's page first, and In your library for one
 *   that is theirs already.
 *
 * The library's tab hands the list in from the server (initialItems). The
 * public /wishlist and a guest have none, and ask /api/wishlist here.
 */

// Helper to save guest ID
function saveGuestId(guestId: string): void {
  if (typeof document !== "undefined") {
    const maxAge = 365 * 24 * 60 * 60
    document.cookie = `materia_guest_id=${guestId}; path=/; max-age=${maxAge}; samesite=lax`
  }
  try {
    localStorage.setItem("materia_guest_id", guestId)
  } catch {
    /* no storage: the cookie is enough */
  }
}

const MOVE_MS = 220
const OUT_MS = 160
const UNDO_MS = 5000
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
/** Our own "wishlist-updated" events, which this list does not need to read back. */
const SOURCE = "wishlist-page"

interface WishlistContentProps {
  isLibrary?: boolean
  showDiscoverMoreCta?: boolean
  /** The list as the server read it (the library's tab). Null or absent: asked for here. */
  initialItems?: WishlistEntry[] | null
}

function reducedMotion() {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

function announce(count: unknown) {
  window.dispatchEvent(new CustomEvent("wishlist-updated", { detail: { count: typeof count === "number" ? count : undefined, source: SOURCE } }))
}

export function WishlistContent({ isLibrary = false, showDiscoverMoreCta = false, initialItems = null }: WishlistContentProps) {
  const [items, setItems] = useState<WishlistEntry[] | null>(initialItems)
  const [removed, setRemoved] = useState<{ entry: WishlistEntry; index: number; failed?: boolean } | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  /* Where every card was just before one left, for the rest to glide from. */
  const before = useRef<{ rects: Map<string, DOMRect>; height: number } | null>(null)
  const arrived = useRef<string | null>(null)
  const undoTimer = useRef<number | null>(null)

  const fetchWishlist = useCallback(async () => {
    try {
      const res = await fetch("/api/wishlist", { credentials: "include", cache: "no-store" })
      const data = await res.json()
      if (res.ok && Array.isArray(data.items)) {
        setItems(data.items.map((row: Parameters<typeof entryOf>[0]) => entryOf(row)).filter(Boolean) as WishlistEntry[])
        if (data.guestId) saveGuestId(data.guestId)
      } else {
        setItems((now) => now ?? [])
      }
    } catch {
      setItems((now) => now ?? [])
    }
  }, [])

  useEffect(() => {
    if (initialItems === null) void fetchWishlist()
  }, [fetchWishlist, initialItems])

  /* Saved or removed somewhere else (a product page in another tab of the app, the header): read again. */
  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.source === SOURCE) return
      if (detail?.guestId) saveGuestId(detail.guestId)
      void fetchWishlist()
    }
    window.addEventListener("wishlist-updated", onUpdate)
    return () => window.removeEventListener("wishlist-updated", onUpdate)
  }, [fetchWishlist])

  useEffect(
    () => () => {
      if (undoTimer.current) window.clearTimeout(undoTimer.current)
    },
    [],
  )

  const shoot = () => {
    const list = listRef.current
    if (!list || reducedMotion()) return (before.current = null)
    const rects = new Map<string, DOMRect>()
    list.querySelectorAll<HTMLElement>(":scope > [data-wishlist-item]").forEach((el) => rects.set(el.dataset.wishlistItem as string, el.getBoundingClientRect()))
    before.current = { rects, height: list.getBoundingClientRect().height }
  }

  /* The rest glide to where they are now, on translate; the card's height follows; an item put back fades in. */
  useLayoutEffect(() => {
    const list = listRef.current
    const shot = before.current
    before.current = null
    if (!list || !shot) return
    list.querySelectorAll<HTMLElement>(":scope > [data-wishlist-item]").forEach((el) => {
      const id = el.dataset.wishlistItem as string
      const was = shot.rects.get(id)
      if (id === arrived.current) {
        el.animate([{ opacity: 0, translate: "0 6px" }, { opacity: 1, translate: "0 0" }], { duration: MOVE_MS, easing: EASE, delay: 60, fill: "backwards" })
        return
      }
      if (!was) return
      const now = el.getBoundingClientRect()
      const dx = was.left - now.left
      const dy = was.top - now.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: MOVE_MS, easing: EASE })
    })
    arrived.current = null
    const height = list.getBoundingClientRect().height
    if (Math.abs(height - shot.height) >= 0.5) list.animate([{ height: `${shot.height}px` }, { height: `${height}px` }], { duration: MOVE_MS, easing: EASE })
  }, [items])

  const remove = (entry: WishlistEntry) => {
    const list = items ?? []
    const index = list.findIndex((i) => i.productId === entry.productId)
    if (index < 0) return
    const el = listRef.current?.querySelector<HTMLElement>(`:scope > [data-wishlist-item="${CSS.escape(entry.productId)}"]`)
    const drop = () => {
      shoot()
      setItems((now) => (now ?? []).filter((i) => i.productId !== entry.productId))
    }
    if (el && !reducedMotion() && typeof el.animate === "function") {
      el.style.pointerEvents = "none"
      const a = el.animate([{ opacity: 1, scale: "1" }, { opacity: 0, scale: "0.97" }], { duration: OUT_MS, easing: "ease-in", fill: "forwards" })
      a.onfinish = drop
    } else drop()

    if (undoTimer.current) window.clearTimeout(undoTimer.current)
    setRemoved({ entry, index })
    undoTimer.current = window.setTimeout(() => setRemoved(null), UNDO_MS)

    void fetch(`/api/wishlist?productId=${encodeURIComponent(entry.productId)}`, { method: "DELETE", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json().catch(() => ({}))
        announce(data.count)
      })
      .catch(() => {
        /* Still saved on the server: it goes back, and the bar says so. */
        putBack(entry, index)
        if (undoTimer.current) window.clearTimeout(undoTimer.current)
        setRemoved({ entry, index, failed: true })
        undoTimer.current = window.setTimeout(() => setRemoved(null), UNDO_MS)
      })
  }

  const putBack = (entry: WishlistEntry, index: number) => {
    shoot()
    arrived.current = entry.productId
    setItems((now) => {
      const list = (now ?? []).filter((i) => i.productId !== entry.productId)
      list.splice(Math.min(index, list.length), 0, entry)
      return list
    })
  }

  const undo = () => {
    if (!removed) return
    const { entry, index } = removed
    if (undoTimer.current) window.clearTimeout(undoTimer.current)
    setRemoved(null)
    putBack(entry, index)
    void fetch("/api/wishlist", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: entry.productId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.guestId) saveGuestId(data.guestId)
        announce(data?.count)
      })
      .catch(() => {})
  }

  const bar = removed ? <UndoBar key={`${removed.entry.productId}-${removed.failed ? "f" : "r"}`} failed={!!removed.failed} title={removed.entry.title} onUndo={undo} /> : null

  if (items === null) {
    return (
      <div data-library-skeleton={isLibrary ? "" : undefined}>
        <WishlistSkeleton />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <>
        <div data-wishlist-empty="" className={`${CARD} px-5 py-10 text-center sm:py-14`}>
          <span aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fff1f3]">
            <Heart className="h-5 w-5 text-[#f43f5e]" strokeWidth={2} />
          </span>
          <p className="mt-4 text-[17px] font-semibold text-[#1a1a2e]">Nothing saved yet</p>
          <p className="mx-auto mt-1.5 max-w-[320px] text-[14px] leading-relaxed text-[#6b7280]">Tap the heart on any product and it waits here, with its price, until you want it.</p>
          <Link href="/explore" className={`${VIOLET} mt-5`}>
            Discover products
          </Link>
        </div>
        {bar}
      </>
    )
  }

  return (
    <div data-wishlist="">
      <p className="mb-3 px-0.5 text-[13px] text-[#6b7280]" aria-live="polite">
        {items.length} saved
      </p>

      <ul
        ref={listRef}
        data-wishlist-list=""
        className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden sm:grid sm:grid-cols-2 sm:gap-4 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none lg:grid-cols-3 xl:grid-cols-4`}
      >
        {items.map((entry, i) => (
          <WishlistCard key={entry.productId} entry={entry} priority={i < 4} onRemove={() => remove(entry)} />
        ))}
      </ul>

      {showDiscoverMoreCta ? (
        <div className="mt-6 flex justify-center">
          <Link href="/explore" className={SECONDARY}>
            Discover more
          </Link>
        </div>
      ) : null}
      {bar}
    </div>
  )
}

/* ─── One saved product ──────────────────────────────────────────────── */

function WishlistCard({ entry, priority, onRemove }: { entry: WishlistEntry; priority: boolean; onRemove: () => void }) {
  const price = priceOf(entry)
  const action = actionOf(entry)
  const handle = entry.creator.username
  /* The product, in this window: inside the phone app too, where a new window used to send it to Safari (components/smart-link.tsx). */
  const page = handle && entry.slug ? getProductUrl(handle, entry.slug) : entry.slug ? `/p/${entry.slug}` : null
  const pageProps = { useClientNav: true } as const
  /* The cover and the name both open the product; only the name is announced. */
  const productLink = (className: string, children: React.ReactNode, label = false) =>
    page ? (
      <SmartLink href={page} {...pageProps} className={className} tabIndex={label ? undefined : -1} aria-hidden={label ? undefined : true}>
        {children}
      </SmartLink>
    ) : (
      <span className={className}>{children}</span>
    )

  return (
    <li
      data-wishlist-item={entry.productId}
      className="group/card relative grid grid-cols-[76px_minmax(0,1fr)] gap-x-3.5 px-4 py-4 sm:flex sm:flex-col sm:gap-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-[#e4e7ec]/80 sm:bg-white sm:p-0 sm:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)] sm:transition-[box-shadow,border-color] sm:duration-200 sm:[@media(hover:hover)]:hover:border-[#d7dadf] sm:[@media(hover:hover)]:hover:shadow-[0_6px_20px_-6px_rgba(16,24,40,0.14)]"
    >
      {productLink(
        "relative row-span-2 block h-[76px] w-[76px] overflow-hidden rounded-xl bg-[#f1f3f5] ring-1 ring-inset ring-black/[0.04] transition-[filter] duration-100 active:brightness-95 sm:aspect-video sm:h-auto sm:w-full sm:rounded-none sm:ring-0",
        entry.thumbnailUrl ? (
          /* Round 25: the image route at the card's size, shown once decoded (components/ui/soft-img.tsx). 76px in a row on a phone, a 16:9 card up to about 300px wider up. */
          <SoftImg
            src={entry.thumbnailUrl}
            width={320}
            sizes="(min-width: 640px) 320px, 76px"
            eager={priority}
            className="absolute inset-0 h-full w-full object-cover transition-[scale] duration-500 ease-out sm:[@media(hover:hover)]:group-hover/card:scale-[1.03]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[#9ca3af]">
            <Package className="h-6 w-6" aria-hidden />
          </span>
        ),
      )}

      <div className="min-w-0 pr-9 pt-0.5 sm:px-4 sm:pt-3.5">
        {productLink(
          "line-clamp-2 text-[15px] font-semibold leading-snug text-[#1a1a2e] [overflow-wrap:anywhere] transition-opacity duration-100 active:opacity-70 sm:[@media(hover:hover)]:hover:underline sm:[@media(hover:hover)]:hover:decoration-[#1a1a2e]/30 sm:[@media(hover:hover)]:hover:underline-offset-2",
          entry.title,
          true,
        )}
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-[#6b7280]" data-wishlist-creator="">
          <AppAvatar src={entry.creator.avatarUrl} name={entry.creator.name} alt="" size={18} markWhileLoading className="shrink-0" />
          <span className="truncate">{entry.creator.name}</span>
        </p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1" data-wishlist-price="">
          <span className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">
            {price.main}
            {price.per ? <span className="text-[13px] font-medium text-[#6b7280]">{price.per}</span> : null}
          </span>
          {price.was ? <s className="text-[13px] tabular-nums text-[#9ca3af]">{price.was}</s> : null}
          {price.sale ? (
            <span data-wishlist-sale="" className="self-center rounded-full bg-[#ecfdf3] px-1.5 py-px text-[11.5px] font-semibold text-[#067647]">
              {price.sale}
            </span>
          ) : null}
        </p>
      </div>

      <div className="col-start-2 mt-3 flex sm:mt-auto sm:px-4 sm:pb-4 sm:pt-3.5">
        {action.kind === "page" ? (
          page ? (
            <SmartLink href={page} {...pageProps} data-wishlist-action="page" className={cn(SECONDARY, SMALL, "min-w-[112px] sm:w-full")}>
              {action.label}
            </SmartLink>
          ) : null
        ) : action.kind === "library" ? (
          <Link href={action.href!} data-wishlist-action="library" className={cn(SECONDARY, SMALL, "min-w-[112px] sm:w-full")}>
            {action.label}
          </Link>
        ) : (
          <Link href={action.href!} data-wishlist-action="checkout" className={cn(PRIMARY, SMALL, "min-w-[112px] sm:w-full")}>
            {action.label}
          </Link>
        )}
      </div>

      {/* Saved: the heart is filled. A press takes it off, with Undo in the bar. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${entry.title} from your wishlist`}
        data-wishlist-remove=""
        className="group/heart absolute right-1.5 top-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:right-2 sm:top-2"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,scale] duration-150 ease-out group-hover/heart:bg-[#fff1f3] group-active/heart:scale-90 sm:bg-white sm:shadow-[0_1px_3px_rgba(16,24,40,0.16)]">
          <Heart className="h-[18px] w-[18px] fill-[#f43f5e] text-[#f43f5e]" strokeWidth={2} aria-hidden />
        </span>
      </button>
    </li>
  )
}

/* ─── Removed, with Undo ─────────────────────────────────────────────── */

function UndoBar({ title, failed, onUndo }: { title: string; failed: boolean; onUndo: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(document.body), [])
  if (!host) return null
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 print:hidden"
      style={{ bottom: "max(calc(env(safe-area-inset-bottom, 0px) + 16px), calc(var(--buyer-tabs-h, 0px) + 12px))" }}
    >
      <div
        role="status"
        data-wishlist-undo=""
        className="pointer-events-auto flex h-12 w-full max-w-[420px] items-center gap-3 rounded-2xl bg-[#1a1a2e] pl-4 pr-1.5 text-white shadow-[0_8px_24px_-6px_rgba(16,24,40,0.35)] duration-200 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
      >
        <p className="min-w-0 flex-1 truncate text-[14px]">{failed ? `Couldn't remove ${title}. Try again.` : `Removed ${title}`}</p>
        {failed ? null : (
          <button
            type="button"
            onClick={onUndo}
            data-wishlist-undo-button=""
            className="inline-flex h-9 shrink-0 items-center rounded-xl px-3 text-[14px] font-semibold text-[#c4b5fd] transition-colors duration-100 active:bg-white/10 [-webkit-tap-highlight-color:transparent]"
          >
            Undo
          </button>
        )}
      </div>
    </div>,
    host,
  )
}
