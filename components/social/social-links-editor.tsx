"use client"

/**
 * The one place a creator types their social links, wherever they are typing.
 *
 * THERE WERE FIVE COPIES of the platform list before this: the edit-profile
 * dialog, the store builder's header panel, the store builder's social-icons
 * panel, the storefront icon row, and the API route. Each had its own order,
 * its own labels, and its own idea of what you were allowed to type — one
 * accepted `@handle` for Instagram and TikTok only, by string-replacing the @;
 * another wanted a full URL and showed an amber warning if the hostname looked
 * wrong; the dialog just said "instagram.com/yourhandle" and hoped. Adding a
 * platform meant finding all five, and missing one meant a field that saved
 * nothing or an icon with nothing behind it.
 *
 * The list is now lib/social/platforms, the marks are
 * components/social/platform-icons, and this is the input.
 *
 * WHAT IT LOOKS LIKE: the mark itself is the label. A column of words —
 * "Instagram", "TikTok", "YouTube" — spends a third of the width restating
 * what an icon says instantly, and it does not match the row of icons the
 * creator gets on their page. Same marks in both places, so choosing one and
 * seeing it are the same act.
 *
 * WHAT YOU MAY TYPE: a handle or a URL, which is what the placeholder claims
 * and what resolveSocialInput on the server actually accepts. The handle is
 * turned into that platform's profile URL there rather than here, because the
 * server is the only side that can be trusted to have done it.
 */

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SOCIAL_ICONS } from "@/components/social/platform-icons"
import {
  LEGACY_SOCIAL_PLATFORM_KEYS,
  OFFERED_SOCIAL_PLATFORM_KEYS,
  SOCIAL_PLATFORM_LABELS,
  type SocialPlatformKey,
} from "@/lib/social/platforms"

export function SocialLinksEditor({
  value,
  onChange,
  compact = false,
  className,
}: {
  value: Partial<Record<SocialPlatformKey, string>>
  onChange: (key: SocialPlatformKey, next: string) => void
  /** Tighter rows, for the store builder's narrow side panel. */
  compact?: boolean
  className?: string
}) {
  /**
   * A legacy platform appears only when it already holds something.
   *
   * Spotify was offered and is not any more. Dropping the field outright would
   * strand everyone who had already saved one — the link would keep showing on
   * their page with nowhere to change or clear it. So nobody new is offered
   * it, and nobody existing is stuck with it.
   */
  const keys: SocialPlatformKey[] = [
    ...OFFERED_SOCIAL_PLATFORM_KEYS,
    ...LEGACY_SOCIAL_PLATFORM_KEYS.filter((key) => (value[key] || "").trim().length > 0),
  ]

  return (
    <div className={cn("space-y-2", className)}>
      {keys.map((key) => {
        const Icon = SOCIAL_ICONS[key]
        const current = value[key] || ""
        return (
          <div
            key={key}
            className={cn(
              "flex items-stretch overflow-hidden rounded-lg border border-input bg-background",
              "transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
              compact ? "h-9" : "h-11",
            )}
          >
            <span
              className={cn(
                "grid shrink-0 place-items-center border-r border-input text-foreground",
                compact ? "w-9" : "w-11",
              )}
              aria-hidden
            >
              <Icon size={compact ? 16 : 18} />
            </span>
            <input
              value={current}
              maxLength={300}
              onChange={(e) => onChange(key, e.target.value)}
              // The mark carries no text, so the field needs the name for
              // anyone not looking at it.
              aria-label={SOCIAL_PLATFORM_LABELS[key]}
              placeholder="Username or URL"
              className={cn(
                "min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-muted-foreground",
                compact ? "text-sm" : "text-sm",
              )}
            />
            {current && (
              <button
                type="button"
                onClick={() => onChange(key, "")}
                aria-label={`Remove ${SOCIAL_PLATFORM_LABELS[key]}`}
                className={cn(
                  "grid shrink-0 place-items-center text-muted-foreground transition-colors hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  compact ? "w-8" : "w-10",
                )}
              >
                <X className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
