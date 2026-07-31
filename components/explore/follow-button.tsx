"use client"

import { useCallback, useState } from "react"
import { Check, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useLocale } from "@/components/locale-provider"
import { useIsFollowing, useToggleFollow } from "@/components/explore/follow-store"
import { cn } from "@/lib/utils"

/**
 * Follow control for a seller.
 *
 * Deliberately NOT the red "+" badge welded to the avatar — that reads as a
 * straight lift of TikTok, and it doesn't say what it does. This is a labelled
 * pill in the brand purple that turns into a quiet "Following" once it's on, so
 * the loud state is the action and the settled state gets out of the way.
 *
 * The press is one composited transform plus a colour cross-fade, and the label
 * swaps under a short mask so it reads as the same control changing state rather
 * than two buttons swapping places.
 */
export function FollowButton({
  userId,
  onFollowed,
  className,
  variant = "solid",
}: {
  /** Profile (auth user) id of the seller. */
  userId: string | null | undefined
  /** Fired only when the toggle turns following ON, for the confirmation toast. */
  onFollowed?: () => void
  className?: string
  /** solid = over a photo · quiet = on a light surface */
  variant?: "solid" | "quiet"
}) {
  const { t } = useLocale()
  const router = useRouter()
  const following = useIsFollowing(userId)
  const toggle = useToggleFollow()
  const [busy, setBusy] = useState(false)

  const onClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!userId || busy) return
      setBusy(true)
      const result = await toggle(userId)
      setBusy(false)
      // null means the server refused — in practice, not signed in.
      if (result === null) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      if (result) onFollowed?.()
    },
    [userId, busy, toggle, onFollowed, router],
  )

  if (!userId) return null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={following}
      aria-label={following ? t("mfeed.following_action") : t("mfeed.follow_action")}
      className={cn(
        "no-tap-fade relative inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-[12.5px] font-semibold",
        // The visible pill is small, so the tap target is grown past it with a
        // transparent pseudo-element rather than by padding the pill out of shape.
        // Near enough counts as a hit — you shouldn't have to aim at this.
        "after:absolute after:-inset-x-3 after:-inset-y-2.5 after:content-['']",
        // Slow enough to watch, and every property here is composited or a paint
        // of a tiny element — nothing that can cost a frame in the feed.
        "transition-[background-color,color,box-shadow,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        "active:scale-[0.94]",
        following
          ? variant === "quiet"
            ? "bg-neutral-100 text-neutral-500"
            : "bg-white/15 text-white/85 backdrop-blur-sm"
          : cn(
              "bg-[#7c3aed] text-white",
              // A soft brand-coloured lift, so it sits above the photo rather than
              // being pasted onto it.
              "shadow-[0_2px_10px_-2px_rgba(124,58,237,0.75)]",
            ),
        className,
      )}
    >
      <span
        className="flex items-center gap-1"
        style={{
          // The label swaps in place under a brief lift — the control changes,
          // it isn't replaced.
          transition: "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {following ? (
          <Check className="h-[13px] w-[13px]" strokeWidth={3} />
        ) : (
          <Plus className="h-[13px] w-[13px]" strokeWidth={3} />
        )}
        {following ? t("mfeed.following_action") : t("mfeed.follow_action")}
      </span>
    </button>
  )
}
