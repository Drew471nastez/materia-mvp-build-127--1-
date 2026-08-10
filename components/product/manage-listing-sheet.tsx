"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Archive, CheckCircle2, Clock, Loader2, Pencil, Trash2, Undo2 } from "lucide-react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { triggerHaptic } from "@/lib/native-bridge"
import { sellDraftHref, sellEditHref } from "@/lib/marketplace/sell-route"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE THINGS YOU CAN DO TO YOUR OWN LISTING
 * ===========================================================================
 *
 * There were none. Once something was live the only controls on it were Buy
 * and Make an offer — on the one page where neither means anything — so a typo
 * in a title was permanent, and taking something off the marketplace because
 * you had sold it at a car boot sale was impossible.
 *
 * ---------------------------------------------------------------------------
 * IT IS A LIST OF VERBS AND NOTHING ELSE
 * ---------------------------------------------------------------------------
 * It used to open with an eyebrow, the listing's title, and close with three
 * lines explaining what archiving means — and then GREW a red confirmation
 * panel in the middle of itself when you reached for delete.
 *
 * All of that was answering questions nobody had. You arrived here by pressing
 * ⋯ on a specific card: you are looking at the photograph of the thing you
 * mean, and being told its name again is the interface repeating what your own
 * thumb just said. The paragraph was read once and skipped forever after. And
 * the growing panel was the worst of the three, because expanding a sheet
 * anchored to the bottom of the screen re-lays-out and re-rasterises the whole
 * panel on every frame of the expansion — the "clicky" part, and the one thing
 * on this component that was genuinely slow rather than merely wordy.
 *
 * What is left is five verbs. Delete asks its question in the platform's own
 * alert, over the top, which costs no layout at all and is the shape people
 * already know means "this one is not reversible".
 *
 * ---------------------------------------------------------------------------
 * AND THE REFRESH WAITS FOR THE ANIMATION
 * ---------------------------------------------------------------------------
 * Every action ended with `router.refresh()` fired in the same breath as the
 * close. A refresh re-renders the profile — sixty cards — ON THE FRAMES the
 * sheet is using to slide away, so the exit stuttered every single time and the
 * cause was never the sheet. It is deferred by the length of that animation
 * now: the sheet leaves cleanly, and the new data lands on a screen that has
 * stopped moving.
 */
type Busy = null | "archive" | "reserve" | "sold" | "delete"

/** BottomSheet's own exit, plus a frame. Anything scheduled inside this window
 *  competes with the animation for the same frames. */
const AFTER_EXIT_MS = 330

export function ManageListingSheet({
  open,
  onClose,
  listingId,
  status,
  title,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  listingId: string
  status: string
  /** Not drawn — you are looking at the card. Kept for the confirmation's
   *  accessible name and for the aria label, where naming the subject is the
   *  whole job. */
  title: string
  /**
   * What to do once the row is gone.
   *
   * On the profile a refresh is right — the grid it was in is still the screen
   * you are looking at. On the listing's OWN page it is not: that page is a 404
   * the moment the row goes, so the caller sends you somewhere that still
   * exists.
   */
  onDeleted?: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<Busy>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  /**
   * THE SHEET IS ONE INSTANCE FOR A WHOLE GRID.
   *
   * The owner's profile renders a single ManageListingSheet and points it at
   * whichever card's ⋯ was pressed — so its state is shared between listings
   * that have never met. An armed delete confirmation on one card was still
   * expanded when the sheet reopened on another, one tap from destroying the
   * wrong listing.
   *
   * `confirming` is deliberately NOT reset here any more: closing the sheet is
   * how the confirmation gets opened. The parent keys this component on the
   * listing's id, so a change of subject still discards it.
   */
  useEffect(() => {
    if (open) {
      setError(null)
      setBusy(null)
    }
  }, [open])

  const archived = status === "archived"
  const reserved = status === "reserved"
  const isDraft = status === "draft"
  const sold = status === "sold"

  const call = useCallback(
    async (init: RequestInit) => {
      const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...init,
      })
      const data = await res.json().catch(() => null)
      return { ok: res.ok, data }
    },
    [listingId],
  )

  // A draft resumes through the drafts route, which is the one scoped to drafts
  // and the one that knows how to publish from there. A live listing goes
  // through the edit route. Same screen either way.
  const editHref = isDraft ? sellDraftHref(listingId) : sellEditHref(listingId)

  // Warmed while the sheet is up, so the wait below is the animation and not the
  // route. Without it the sheet finishes leaving and THEN the form starts
  // fetching, which is the pause this whole sequence exists to remove.
  useEffect(() => {
    if (open) router.prefetch(editHref)
  }, [open, router, editHref])

  /**
   * THE SHEET LEAVES FIRST. IT USED NOT TO LEAVE AT ALL.
   *
   * This was `triggerHaptic` and `router.push`, and nothing else — no
   * `onClose()`. So pressing Editează anunțul navigated with the sheet still
   * open, and three things went wrong at once:
   *
   *   The panel stayed on screen. `open` was still true, so the sheet sat there
   *   over the form it had just opened.
   *
   *   THE PAGE STAYED LOCKED. BottomSheet holds `lockScroll()` for as long as it
   *   is mounted (see components/ui/bottom-sheet.tsx). A sheet that never closes
   *   never unmounts, so the lock was never released — and the sell form is a
   *   scrolling column of fields. It came up unscrollable. That is the whole of
   *   "the inputs and images are not populated": they were loaded and they were
   *   there, below a fold nothing could reach.
   *
   *   And both panels are z-95. A sheet and the form share one stacking level,
   *   so which of them wins is decided by DOM order rather than by intent.
   *
   * So: close, let the 300ms exit run, then navigate. Sequential rather than
   * simultaneous, which is what every sheet-to-screen handover on a phone does —
   * and the same AFTER_EXIT_MS the status actions already use to keep a refresh
   * off the frames the animation needs.
   */
  const onEdit = useCallback(() => {
    void triggerHaptic("light")
    onClose()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => router.push(editHref), AFTER_EXIT_MS)
  }, [router, onClose, editHref])

  /** Every status move goes through here, so they cannot drift apart. */
  const act = useCallback(
    async (action: "archive" | "publish" | "reserve" | "unreserve" | "sold", key: Busy) => {
      setError(null)
      setBusy(key)
      const { ok, data } = await call({ method: "PATCH", body: JSON.stringify({ action }) })
      setBusy(null)
      if (!ok) {
        setError(data?.message ?? "Nu am putut actualiza anunțul.")
        return
      }
      void triggerHaptic("light")
      onClose()
      // AFTER the sheet has gone. Not a push: the page you are on is the page
      // that changed, and its own data is what is now stale.
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => router.refresh(), AFTER_EXIT_MS)
    },
    [call, onClose, router],
  )

  const onDelete = useCallback(async () => {
    setError(null)
    setBusy("delete")
    const { ok, data } = await call({ method: "DELETE" })
    setBusy(null)
    setConfirming(false)
    if (!ok) {
      setError(data?.message ?? "Nu am putut șterge anunțul.")
      return
    }
    void triggerHaptic("medium")
    if (onDeleted) {
      onDeleted()
      return
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => router.refresh(), AFTER_EXIT_MS)
  }, [call, router, onDeleted])

  return (
    <>
      <BottomSheet open={open} onClose={onClose} label={`Gestionează ${title || "anunțul"}`}>
        {/* NO BOX AROUND THE VERBS.

            They were wrapped in `rounded-2xl border border-neutral-200/80`, and
            a bordered, rounded, inset panel is the shape of a DIALOG. Drawn
            inside a sheet that is itself a rounded white panel over a scrim, it
            read as a second modal nested in the first — a card floating in a
            card, for no reason anybody could name, with two different corner
            radii a few pixels apart and a hairline tracing the outline of the
            thing it was already inside.

            A sheet's contents do not need to be framed by the sheet. What
            separates one verb from the next is the hairline BETWEEN them, which
            each Row already draws, and the rows now run the full width so a
            press lights the whole strip rather than a rectangle inset from the
            panel's own edge. One surface, five verbs on it. */}
        {/* `-mx-2` cancels the padding BottomSheet's scroller puts on its
            children, so a pressed row's tint runs to the panel's own edges
            instead of stopping two pixels short of them on both sides. */}
        <div className="-mx-2 pb-4 pt-1">
          <div>
            {/* Not for a sold listing: the server refuses to change one, because
                editing it would rewrite what somebody already bought. */}
            {!sold && (
              <Row icon={<Pencil className="h-[19px] w-[19px]" />} onClick={onEdit}>
                {isDraft ? "Continuă ciorna" : "Editează anunțul"}
              </Row>
            )}

            {/* A DRAFT gets neither of the middle two. It has never been on the
                feed, so there is nothing to reserve and nothing to take down —
                its only moves are finishing it and throwing it away. */}
            {!isDraft && !sold && (
              <Row
                icon={reserved ? <Undo2 className="h-[19px] w-[19px]" /> : <Clock className="h-[19px] w-[19px]" />}
                onClick={() => void act(reserved ? "unreserve" : "reserve", "reserve")}
                busy={busy === "reserve"}
              >
                {reserved ? "Anulează rezervarea" : "Marchează ca rezervat"}
              </Row>
            )}

            {!isDraft && !sold && (
              <Row
                icon={<CheckCircle2 className="h-[19px] w-[19px]" />}
                onClick={() => void act("sold", "sold")}
                busy={busy === "sold"}
              >
                Marchează ca vândut
              </Row>
            )}

            {/* Not for a sold listing either: `sold` is outside EDITABLE, so the
                server refuses it — and the delete refusal used to point straight
                at this row, which is a dead end recommending a dead end. */}
            {!isDraft && !sold && (
              <Row
                icon={archived ? <Undo2 className="h-[19px] w-[19px]" /> : <Archive className="h-[19px] w-[19px]" />}
                onClick={() => void act(archived ? "publish" : "archive", "archive")}
                busy={busy === "archive"}
              >
                {archived ? "Publică din nou" : "Arhivează anunțul"}
              </Row>
            )}

            <Row
              icon={<Trash2 className="h-[19px] w-[19px]" />}
              onClick={() => {
                void triggerHaptic("light")
                // The sheet leaves and the question arrives in front of the
                // screen. Two panels of different weights, one at a time —
                // rather than one panel growing a red box inside itself.
                onClose()
                setConfirming(true)
              }}
              danger
              last
            >
              {isDraft ? "Șterge ciorna" : "Șterge anunțul"}
            </Row>
          </div>

          {error && (
            <p role="alert" className="mx-5 mt-3 text-[13.5px] font-medium leading-relaxed text-amber-700">
              {error}
            </p>
          )}
        </div>
      </BottomSheet>

      {/* Outside the sheet, so it survives the sheet closing — and above it, so
          the two can overlap for the third of a second the sheet takes to go. */}
      <ConfirmDialog
        open={confirming}
        title={isDraft ? "Ștergi ciorna?" : "Ștergi anunțul?"}
        body="Anunțul și fotografiile lui dispar definitiv. Nu se poate anula."
        onDismiss={() => setConfirming(false)}
        actions={[
          {
            label: "Șterge",
            danger: true,
            primary: true,
            busy: busy === "delete",
            onClick: () => void onDelete(),
          },
          { label: "Renunță", onClick: () => setConfirming(false) },
        ]}
      />
    </>
  )
}

function Row({
  icon,
  children,
  onClick,
  danger,
  busy,
  last,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
  busy?: boolean
  last?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        // The highlight arrives instantly and fades out. A press that has to
        // animate IN is a press that feels late — this is the one place a
        // transition is deliberately one-directional.
        "relative flex min-h-[56px] w-full items-center gap-4 px-5 py-3 text-left",
        "transition-colors duration-200 ease-out active:duration-0 active:bg-neutral-100 disabled:opacity-60",
        danger ? "text-rose-600" : "text-neutral-900",
      )}
    >
      <span className={cn("shrink-0", danger ? "text-rose-500" : "text-neutral-400")}>
        {busy ? <Loader2 className="h-[19px] w-[19px] animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{children}</span>
      {/* Inset to where the label starts, not to the edge: a line that runs the
          full width cuts the icon column off from the text it belongs to. */}
      {!last && <span aria-hidden className="absolute bottom-0 left-[56px] right-0 h-px bg-neutral-100" />}
    </button>
  )
}
