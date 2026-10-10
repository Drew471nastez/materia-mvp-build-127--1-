"use client"

/**
 * ===========================================================================
 *  SAVE, IN AN OPENED POST (round 15)
 * ===========================================================================
 * The owner: "when I click save on a post, the save and unsave should feel
 * more smooth and clean". It was the word swapping from "Save" to "Saved":
 * the button is right aligned, so one more letter moved the bookmark left by
 * a few pixels on every press, and the icon filled in one frame.
 *
 * Now the button is the same width either way: both words sit in one grid
 * cell, the wider one sets the width, and they crossfade. The bookmark's two
 * faces (the outline and the filled one) sit on each other the same way and
 * crossfade, and a press that saves gives the icon a small settle (a little
 * larger, then back, on iOS's curve), a press that unsaves only the fade. A
 * light tap of the phone's haptic in the app. Nothing outside the button
 * moves. With reduced motion it simply changes.
 *
 * It reads the press through post-intent.ts (useIntent), so it answers on
 * the next frame and never flickers while the server is asked.
 */
import { useEffect, useRef } from "react"
import { Bookmark } from "lucide-react"
import type { FeedPostView } from "@/lib/communities/types"
import { hapticTap } from "@/lib/native-bridge"
import { useIntent } from "./post-intent"
import { BTN_GHOST } from "./ui"

const FADE = "transition-[opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"

export function SaveButton({ post, onPress, full = false }: { post: FeedPostView; onPress: () => void; full?: boolean }) {
  const intent = useIntent(`save:${post.id}`)
  const on = intent ? intent.on : post.bookmarked
  const iconRef = useRef<HTMLSpanElement>(null)
  /* Only a change this button was pressed for settles the icon: not the first draw, not the server's answer. */
  const pressed = useRef(false)
  useEffect(() => {
    if (!pressed.current) return
    pressed.current = false
    const el = iconRef.current
    if (!on || !el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ scale: "1" }, { scale: "1.16", offset: 0.4 }, { scale: "1" }], { duration: 320, easing: "cubic-bezier(0.32, 0.72, 0, 1)" })
  }, [on])
  return (
    <button
      type="button"
      onClick={() => {
        pressed.current = true
        hapticTap("light")
        onPress()
      }}
      aria-pressed={on}
      aria-label={on ? "Remove from Saved" : "Save"}
      className={`${BTN_GHOST} ${full ? "ml-auto pr-1" : "-mr-2 ml-auto"} group/save gap-2 touch-manipulation transition-colors duration-200 ${on ? "text-[#1a1a2e]" : ""}`}
      data-save=""
      data-saved={on ? "true" : "false"}
    >
      <span ref={iconRef} className="relative grid h-[18px] w-[18px] place-items-center" aria-hidden>
        <Bookmark className={`col-start-1 row-start-1 h-[18px] w-[18px] ${FADE} ${on ? "opacity-0" : "opacity-100"}`} strokeWidth={1.75} />
        <Bookmark className={`col-start-1 row-start-1 h-[18px] w-[18px] fill-current ${FADE} ${on ? "opacity-100" : "opacity-0"}`} strokeWidth={1.75} />
      </span>
      {/* Both words in one cell: the wider sets the width, so the button never changes size. */}
      <span className="grid" aria-hidden>
        <span className={`col-start-1 row-start-1 ${FADE} ${on ? "opacity-0" : "opacity-100"}`}>Save</span>
        <span className={`col-start-1 row-start-1 ${FADE} ${on ? "opacity-100" : "opacity-0"}`}>Saved</span>
      </span>
    </button>
  )
}
