"use client"

import { useEffect, useRef, useState } from "react"
import { Heart, UserCheck } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

/**
 * A single, GPU-smooth confirmation toast that slides in from the top when the
 * user saves (or un-saves) a listing anywhere in the mobile feed. Fires off the
 * `wishlist-toast` window event. Fades + slides in, holds ~3.5s, fades out.
 */
export function WishlistToast() {
  const { t } = useLocale()
  const [text, setText] = useState<string | null>(null)
  const [kind, setKind] = useState<"save" | "follow">("save")
  const [shown, setShown] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    // One toast for the whole feed. Two events feed it so a save and a follow
    // can never end up stacked on top of each other — the second simply
    // restarts the same pill with new text.
    const show = (label: string, which: "save" | "follow") => {
      setKind(which)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (clearTimer.current) clearTimeout(clearTimer.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      setText(label)
      setShown(false)
      // Two frames so the enter transition always plays from the hidden state.
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setShown(true))
      })
      hideTimer.current = setTimeout(() => setShown(false), 3500)
      clearTimer.current = setTimeout(() => setText(null), 4200)
    }

    const onSave = (e: Event) => {
      // Only confirm a SAVE — un-saving shows nothing.
      if (!(e as CustomEvent<{ saved?: boolean }>).detail?.saved) return
      show(t("mfeed.saved_toast"), "save")
    }
    const onFollow = (e: Event) => {
      const name = (e as CustomEvent<{ name?: string }>).detail?.name || ""
      show(t("mfeed.follow_toast").replace("{name}", name ? `@${name}` : ""), "follow")
    }

    window.addEventListener("wishlist-toast", onSave)
    window.addEventListener("follow-toast", onFollow)
    return () => {
      window.removeEventListener("wishlist-toast", onSave)
      window.removeEventListener("follow-toast", onFollow)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (clearTimer.current) clearTimeout(clearTimer.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [t])

  if (!text) return null

  return (
    <div
      className="md:hidden pointer-events-none fixed inset-x-0 z-[95] flex justify-center"
      // Bottom-centered, sitting just above the bottom nav — never over the search.
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 74px)" }}
    >
      <div
        className="flex items-center gap-2 rounded-full bg-neutral-900/[0.92] px-4 py-2.5 text-white shadow-xl backdrop-blur-md"
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? "translateY(0) scale(1)" : "translateY(14px) scale(0.96)",
          transition:
            "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)",
          willChange: "opacity, transform",
        }}
      >
        {kind === "follow" ? (
          <UserCheck className="h-4 w-4 text-[#a78bfa]" strokeWidth={2.5} />
        ) : (
          <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
        )}
        <span className="text-[13px] font-semibold">{text}</span>
      </div>
    </div>
  )
}
