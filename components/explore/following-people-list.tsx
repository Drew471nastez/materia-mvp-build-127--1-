"use client"

import { useCallback, useEffect, useState } from "react"
import { UserPlus } from "lucide-react"
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
export function FollowingPeopleList({ people }: { people: FollowedPerson[] }) {
  const { t, language } = useLocale()
  const toggle = useToggleFollow()
  // Unfollowing keeps the row in place, greyed and offering "Follow" back, rather
  // than yanking it out from under your finger. A mis-tap is one tap to undo, and
  // the list stops moving while you're reading it. It's gone on the next visit.
  const [dropped, setDropped] = useState<Set<string>>(() => new Set())

  const onToggle = useCallback(
    async (id: string) => {
      setDropped((prev) => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      })
      await toggle(id)
    },
    [toggle],
  )

  return (
    <ul className="px-1">
      {people.map((p, i) => {
        const name = p.displayName || p.username || "Storelib"
        const unfollowed = dropped.has(p.id)
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
              "flex items-center gap-3 px-3 py-3.5",
              // Hairline dividers, not a border on every row — no line under the
              // last one, nothing boxed in.
              i > 0 && "border-t border-neutral-100",
            )}
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
                aria-label={unfollowed ? t("mfeed.follow_action") : t("mfeed.unfollow_action")}
                className={cn(
                  "no-tap-fade flex h-8 items-center gap-1 rounded-full px-3.5 text-[12.5px] font-semibold",
                  "transition-[background-color,color] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.94]",
                  unfollowed
                    ? "bg-[#7c3aed] text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
                )}
              >
                {unfollowed && <UserPlus className="h-[13px] w-[13px]" strokeWidth={2.75} />}
                {unfollowed ? t("mfeed.follow_action") : t("mfeed.unfollow_action")}
              </button>

              {/* Light-grey tooltip, above the button so a thumb doesn't cover it. */}
              <span
                role="tooltip"
                className="pointer-events-none absolute -top-1 right-0 -translate-y-full whitespace-nowrap rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[11.5px] font-medium text-neutral-600 opacity-0 shadow-sm transition-[opacity,transform] duration-300 ease-out group-hover:-translate-y-full group-hover:opacity-100"
                style={{ transform: "translateY(calc(-100% + 4px))" }}
              >
                {unfollowed ? t("mfeed.follow_tip") : t("mfeed.unfollow_tip")}
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
