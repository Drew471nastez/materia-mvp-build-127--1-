"use client"

import { useCallback, useEffect, useState } from "react"

import { SmartLink } from "@/components/smart-link"
import { useLocale } from "@/components/locale-provider"
import { useToggleFollow } from "@/components/explore/follow-store"
import { getStoreUrl } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"

export type FollowedPerson = {
  id: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  joinedAt: string | null
  listings: number
  online: boolean
}

/** How long a row takes to collapse out after you unfollow. */
const LEAVE_MS = 380

/** "Member since March 2025" — month precision is all this is worth. */
function joinedLabel(iso: string | null, locale: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return d.toLocaleDateString(locale === "ro" ? "ro-RO" : "en-GB", { month: "long", year: "numeric" })
  } catch {
    return null
  }
}

/**
 * The Following tab: the PEOPLE you follow, not their listings.
 *
 * A plain divided list rather than cards — this is a directory you scan by name,
 * and card chrome would only get between you and the names.
 */
export function FollowingPeopleList({
  people,
  onUnfollow,
}: {
  people: FollowedPerson[]
  /** Called once the row has finished collapsing, so the parent can drop it
   *  from both its state and the cached list. */
  onUnfollow: (id: string) => void
}) {
  const { t, language } = useLocale()
  const toggle = useToggleFollow()
  // Unfollowing removes the row. It collapses out first rather than vanishing on
  // the frame you tap, so the list settles instead of snapping.
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set())

  const onToggle = useCallback(
    async (id: string) => {
      setLeaving((prev) => new Set(prev).add(id))
      // Write it through immediately — the animation is presentation, and the
      // unfollow must not be waiting on it to be saved.
      await toggle(id)
      window.setTimeout(() => onUnfollow(id), LEAVE_MS)
    },
    [toggle, onUnfollow],
  )

  return (
    <ul className="px-1">
      {people.map((p, i) => {
        const name = p.displayName || p.username || "Storelib"
        const isLeaving = leaving.has(p.id)
        const joined = joinedLabel(p.joinedAt, language)
        const meta = [
          p.listings > 0 ? `${p.listings} ${t("mfeed.listings_short")}` : null,
          joined ? `${t("mfeed.member_since")} ${joined}` : null,
        ]
          .filter(Boolean)
          .join(" · ")

        return (
          <li
            key={p.id}
            className={cn(
              "flex items-center gap-3 overflow-hidden px-3",
              // Hairline dividers, not a border on every row — no line under the
              // last one, nothing boxed in.
              i > 0 && !isLeaving && "border-t border-neutral-100",
            )}
            style={{
              // Collapsing max-height as well as fading means the rows below
              // close the gap rather than jumping up once it's gone.
              maxHeight: isLeaving ? 0 : 92,
              opacity: isLeaving ? 0 : 1,
              paddingTop: isLeaving ? 0 : 14,
              paddingBottom: isLeaving ? 0 : 14,
              transition: `max-height ${LEAVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms ease-out, padding ${LEAVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              // Staggered arrival, capped so a long list still settles quickly.
              // Dropped entirely while leaving: a filled animation keeps holding
              // the property it animated, which would pin opacity at 1 and stop
              // the row ever fading out.
              animation: isLeaving ? "none" : "people-row-in 460ms cubic-bezier(0.22, 1, 0.36, 1) both",
              animationDelay: isLeaving ? undefined : `${Math.min(i, 9) * 34}ms`,
            }}
          >
            <SmartLink
              href={p.username ? getStoreUrl(p.username) : "#"}
              className="relative shrink-0"
              aria-label={name}
            >
              <span className="block h-12 w-12 overflow-hidden rounded-full bg-neutral-100">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[17px] font-semibold text-neutral-400">
                    {name.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              {/* Presence dot. The white ring keeps it legible against any avatar
                  rather than disappearing into a light one. */}
              <span
                className={cn(
                  "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full ring-2 ring-white transition-colors duration-500",
                  p.online ? "bg-emerald-500" : "bg-neutral-300",
                )}
                aria-label={p.online ? t("mfeed.online") : t("mfeed.offline")}
              />
            </SmartLink>

            <SmartLink
              href={p.username ? getStoreUrl(p.username) : "#"}
              className="min-w-0 flex-1"
            >
              <p className="truncate text-[15px] font-semibold text-neutral-900">{name}</p>
              {p.username && <p className="truncate text-[13px] text-neutral-500">@{p.username}</p>}
              {meta && <p className="mt-0.5 truncate text-[12px] text-neutral-400">{meta}</p>}
            </SmartLink>

            <div className="group relative shrink-0">
              <button
                type="button"
                onClick={() => onToggle(p.id)}
                disabled={isLeaving}
                aria-label={t("mfeed.unfollow_action")}
                className={cn(
                  "no-tap-fade flex h-8 items-center gap-1 rounded-full bg-neutral-100 px-3.5 text-[12.5px] font-semibold text-neutral-600",
                  "transition-[background-color,color] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-neutral-200 active:scale-[0.94]",
                )}
              >
                {t("mfeed.unfollow_action")}
              </button>

              {/* Light-grey tooltip, above the button so a thumb doesn't cover it. */}
              <span
                role="tooltip"
                className="pointer-events-none absolute -top-1 right-0 -translate-y-full whitespace-nowrap rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[11.5px] font-medium text-neutral-600 opacity-0 shadow-sm transition-[opacity,transform] duration-300 ease-out group-hover:-translate-y-full group-hover:opacity-100"
                style={{ transform: "translateY(calc(-100% + 4px))" }}
              >
                {t("mfeed.unfollow_tip")}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Fires the presence beacon so the dots mean something. Throttled per session. */
export function usePresenceHeartbeat() {
  useEffect(() => {
    const ping = () => {
      void fetch("/api/presence", { method: "POST", credentials: "include" }).catch(() => {})
    }
    ping()
    // Two minutes keeps a five-minute "online" window honest without chattering.
    const id = setInterval(ping, 120_000)
    return () => clearInterval(id)
  }, [])
}
