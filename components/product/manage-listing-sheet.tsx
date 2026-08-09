"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { Archive, Loader2, Pencil, Trash2, Undo2 } from "lucide-react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { triggerHaptic } from "@/lib/native-bridge"
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
 * Three actions, in the order of how often they are wanted and how hard they
 * are to undo:
 *
 *   Edit      the common one, and completely reversible
 *   Archive   off the feed, still yours, one tap to put back. This is what
 *             most people mean when they reach for delete
 *   Delete    gone, and it says so before it does it
 *
 * ---------------------------------------------------------------------------
 * DELETE ASKS, AND NAMES WHAT IT IS DELETING
 * ---------------------------------------------------------------------------
 * A single-tap bin on a sheet is how somebody loses a listing with eight
 * photographs to a thumb that landed a centimetre off, and there is nowhere for
 * a deleted one to go. The second tap is a different button in a different
 * place, so it cannot be the tail of the same gesture.
 *
 * And a listing somebody has BOUGHT cannot be deleted at all — it is a row in
 * their order history and a link in their receipt. The server refuses; this
 * says so and offers archiving, which does the thing that was actually wanted.
 */
export function ManageListingSheet({
  open,
  onClose,
  listingId,
  status,
  title,
}: {
  open: boolean
  onClose: () => void
  listingId: string
  status: string
  title: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | "archive" | "delete">(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const archived = status === "archived"

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

  const onEdit = useCallback(() => {
    void triggerHaptic("light")
    router.push(`/products/new?edit=${encodeURIComponent(listingId)}`)
  }, [router, listingId])

  const onArchive = useCallback(async () => {
    setError(null)
    setBusy("archive")
    const { ok, data } = await call({
      method: "PATCH",
      body: JSON.stringify({ action: archived ? "publish" : "archive" }),
    })
    setBusy(null)
    if (!ok) {
      setError(data?.message ?? "Nu am putut actualiza anunțul.")
      return
    }
    void triggerHaptic("light")
    onClose()
    // Not a push: the page you are on is the page that changed, and its own
    // data is what is now stale.
    router.refresh()
  }, [call, archived, onClose, router])

  const onDelete = useCallback(async () => {
    setError(null)
    setBusy("delete")
    const { ok, data } = await call({ method: "DELETE" })
    setBusy(null)
    if (!ok) {
      setError(data?.message ?? "Nu am putut șterge anunțul.")
      setConfirming(false)
      return
    }
    void triggerHaptic("medium")
    onClose()
    // The listing is gone, so this page is a 404 now. Somewhere that still
    // exists, and a refresh so the profile it lands on has lost the row too.
    router.replace("/profile")
    router.refresh()
  }, [call, onClose, router])

  return (
    <BottomSheet open={open} onClose={onClose} label="Gestionează anunțul">
      <div className="px-4 pb-8 pt-1">
        <p className="px-1 pb-3 text-[13px] font-medium text-neutral-400">Anunțul tău</p>
        <p className="mb-4 truncate px-1 text-[17px] font-semibold tracking-[-0.015em] text-neutral-900">
          {title || "Fără titlu"}
        </p>

        <div className="overflow-hidden rounded-2xl border border-neutral-200/80">
          <Row icon={<Pencil className="h-[19px] w-[19px]" />} onClick={onEdit}>
            Editează anunțul
          </Row>
          <Row
            icon={archived ? <Undo2 className="h-[19px] w-[19px]" /> : <Archive className="h-[19px] w-[19px]" />}
            onClick={() => void onArchive()}
            busy={busy === "archive"}
          >
            {archived ? "Publică din nou" : "Arhivează anunțul"}
          </Row>
          <Row
            icon={<Trash2 className="h-[19px] w-[19px]" />}
            onClick={() => {
              void triggerHaptic("light")
              setConfirming((c) => !c)
            }}
            danger
            last
          >
            Șterge anunțul
          </Row>
        </div>

        <p className="mt-2.5 px-1 text-[12.5px] font-medium leading-relaxed text-neutral-400">
          {archived
            ? "Un anunț arhivat nu apare în feed, dar rămâne al tău."
            : "Arhivarea îl scoate din feed fără să îl ștergi. Îl poți publica oricând la loc."}
        </p>

        {/* Expands in place, and names the thing. `grid-template-rows` is the
            one way to animate to a height nobody has measured — a pixel value
            would clip the question the moment a long title wraps. */}
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: confirming ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="mt-4 rounded-2xl bg-rose-50 p-3.5">
              <p className="text-[14px] font-semibold text-rose-900">Ștergi „{title || "Fără titlu"}”?</p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-rose-800/80">
                Anunțul și fotografiile lui dispar definitiv. Nu se poate anula.
              </p>
              <div className="mt-3 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-11 flex-1 rounded-lg bg-white text-[14.5px] font-semibold text-neutral-700"
                >
                  Renunță
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete()}
                  disabled={busy === "delete"}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 text-[14.5px] font-semibold text-white disabled:opacity-60"
                >
                  {busy === "delete" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Șterge
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-[13.5px] font-medium text-amber-900">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
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
        "relative flex min-h-[56px] w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors duration-150 active:bg-neutral-100 disabled:opacity-60",
        danger ? "text-rose-600" : "text-neutral-900",
      )}
    >
      <span className={cn("shrink-0", danger ? "text-rose-500" : "text-neutral-400")}>
        {busy ? <Loader2 className="h-[19px] w-[19px] animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{children}</span>
      {!last && <span aria-hidden className="absolute bottom-0 left-4 right-0 h-px bg-neutral-100" />}
    </button>
  )
}
