"use client"

/**
 * ===========================================================================
 *  "GET NOTIFIED ABOUT <COMMUNITY>", ONCE, IN A BROWSER, AFTER JOINING
 * ===========================================================================
 * A quiet card the community frame shows to a member who joined recently,
 * offering this browser's notifications (lib/push/web-client.ts, the same
 * thing as "This browser" in Settings, Notifications). Turn on asks the
 * browser's own question from that tap, never before; Not now puts it away
 * for SNOOZE_DAYS. It is never drawn:
 *
 *   - in the Storelib app (the app has its own push, and asks in Settings)
 *   - where the browser has no Push API (Safari on an iPhone outside the
 *     Home Screen) or has already been answered (allowed or blocked)
 *   - for a member who joined more than RECENT_DAYS ago
 *   - after Not now, for SNOOZE_DAYS (this browser remembers it)
 *
 * It appears a moment after the page settles (APPEAR_MS), rising a few
 * pixels as it fades in, never on first paint, so the community does not
 * flash a card at someone who just arrived. With reduced motion it simply
 * appears. "inline" sits in the page's flow (above the feed); "floating"
 * sits over the page's foot, clear of the tab bar by `bottom` pixels.
 *
 * Mount: <WebPushPrompt communityName={community.name} joinedAt={member.joinedAt} />
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { BellRing, Check, X } from "lucide-react"
import { WebPushError, enableWebPush, webPushSupported } from "@/lib/push/web-client"
import { cn } from "@/lib/utils"

/** A member who joined within this many days is offered it. */
export const RECENT_DAYS = 7
/** Not now puts it away for this long, in this browser. */
export const SNOOZE_DAYS = 30
/** How long after the page settles it appears. */
export const APPEAR_MS = 1200
export const PROMPT_KEY = "storelib:web-push-prompt"

const DAY = 86_400_000

/** Whether the card may show, from what the browser and the membership say. Pure, for tests. */
export function promptAllowed(a: { supported: boolean; permission: NotificationPermission | "unsupported"; joinedAt: string | null | undefined; snoozedAt: number | null; now: number }): boolean {
  if (!a.supported || a.permission !== "default") return false
  const joined = a.joinedAt ? Date.parse(a.joinedAt) : NaN
  if (!Number.isFinite(joined) || a.now - joined > RECENT_DAYS * DAY || joined - a.now > DAY) return false
  if (a.snoozedAt !== null && a.now - a.snoozedAt < SNOOZE_DAYS * DAY) return false
  return true
}

function readSnooze(): number | null {
  try {
    const v = Number(window.localStorage.getItem(PROMPT_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

function writeSnooze(at: number): void {
  try {
    window.localStorage.setItem(PROMPT_KEY, String(at))
  } catch {
    /* A browser that keeps nothing simply offers it again next time. */
  }
}

type Phase = "hidden" | "shown" | "asking" | "on" | "blocked" | "error"

export function WebPushPrompt({
  communityName,
  joinedAt,
  placement = "inline",
  bottom = 88,
  className,
}: {
  communityName: string
  /** When the person joined (community_members.joined_at). */
  joinedAt: string | null | undefined
  placement?: "inline" | "floating"
  /** Floating only: how far above the bottom of the screen, clear of a tab bar. */
  bottom?: number
  className?: string
}) {
  const [phase, setPhase] = useState<Phase>("hidden")
  const [entered, setEntered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closing = useRef<number | null>(null)

  useEffect(() => {
    const supported = webPushSupported()
    const permission = supported ? Notification.permission : "unsupported"
    if (!promptAllowed({ supported, permission, joinedAt, snoozedAt: readSnooze(), now: Date.now() })) return
    const t = window.setTimeout(() => {
      setPhase("shown")
      /* Two frames: the card is laid out at its start, then moves, so the rise is drawn rather than skipped. */
      requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    }, APPEAR_MS)
    return () => window.clearTimeout(t)
  }, [joinedAt])

  useEffect(() => () => {
    if (closing.current) window.clearTimeout(closing.current)
  }, [])

  const close = useCallback((snooze: boolean) => {
    if (snooze) writeSnooze(Date.now())
    setEntered(false)
    closing.current = window.setTimeout(() => setPhase("hidden"), 220)
  }, [])

  const turnOn = useCallback(async () => {
    setPhase("asking")
    setError(null)
    try {
      const now = await enableWebPush()
      if (now === "on") {
        setPhase("on")
        closing.current = window.setTimeout(() => close(false), 1800)
      } else if (now === "blocked") {
        setPhase("blocked")
      } else {
        setPhase("shown")
      }
    } catch (e) {
      setError(e instanceof WebPushError ? e.message : "That did not work. Try again in a moment.")
      setPhase("error")
    }
  }, [close])

  if (phase === "hidden") return null
  const name = communityName.trim() || "this community"
  return (
    <div
      role="region"
      aria-label="Notifications for this community"
      data-web-push-prompt={phase}
      className={cn(
        "transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none",
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0 motion-reduce:translate-y-0",
        placement === "floating" ? "fixed inset-x-4 z-40 mx-auto max-w-[420px] sm:left-auto sm:right-6 sm:mx-0 sm:w-[380px]" : "w-full",
        className,
      )}
      style={placement === "floating" ? { bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))` } : undefined}
    >
      <div className="relative flex gap-3 rounded-2xl border border-[#e5e7eb]/70 bg-white p-3.5 pr-12 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_8px_24px_-12px_rgba(15,23,42,0.18)] sm:p-4 sm:pr-12">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#1a1a2e]">
          {phase === "on" ? <Check className="h-[18px] w-[18px] text-[#15803d]" strokeWidth={2} /> : <BellRing className="h-[18px] w-[18px]" strokeWidth={1.75} />}
        </span>
        <div className="min-w-0 flex-1">
          {phase === "on" ? (
            <p className="pt-2 text-[14px] font-medium leading-[1.35] text-[#1a1a2e]" role="status">
              Notifications are on in this browser.
            </p>
          ) : (
            <>
              <p className="text-[14px] font-medium leading-[1.35] text-[#1a1a2e]">Get notified about {name}</p>
              <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]" data-web-push-detail="">
                {phase === "blocked"
                  ? "Notifications are blocked for storelib.com. Allow them from the icon beside the address, then try again."
                  : "Replies, mentions and posts from the people who run it, in this browser. Change it any time in Settings."}
              </p>
              {error ? (
                <p role="alert" className="mt-1 text-[13px] leading-[1.45] text-red-600">
                  {error}
                </p>
              ) : null}
              {phase !== "blocked" ? (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void turnOn()}
                    disabled={phase === "asking"}
                    data-web-push-on=""
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(15,23,42,0.18)] transition-colors hover:bg-[#2a2a40] active:bg-[#111122] disabled:opacity-60 sm:h-9 sm:text-[13px]"
                  >
                    {phase === "asking" ? "Waiting for the browser" : "Turn on"}
                  </button>
                  <button
                    type="button"
                    onClick={() => close(true)}
                    data-web-push-later=""
                    className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-[14px] font-medium text-[#4b5563] transition-colors hover:bg-[#f3f4f6] sm:h-9 sm:text-[13px]"
                  >
                    Not now
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => close(phase !== "on")}
          aria-label="Close"
          data-web-push-close=""
          className="absolute right-1.5 top-1.5 inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#4b5563]"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
