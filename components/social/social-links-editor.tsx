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
import { socialFieldIsLink, socialFormat } from "@/lib/onepage/social-input"
import {
  LEGACY_SOCIAL_PLATFORM_KEYS,
  OFFERED_SOCIAL_PLATFORM_KEYS,
  SOCIAL_PLATFORM_LABELS,
  type SocialPlatformKey,
} from "@/lib/social/platforms"

/**
 * WHETHER A PLATFORM TAKES A NAME (r51). Every offered platform does except
 * Spotify, whose links are to an artist or a playlist rather than to a
 * person. lib/onepage/social-input knows each platform's format; the creator
 * page's fields use its answer so both editors agree on what a name is.
 */
function takesHandle(key: SocialPlatformKey): boolean {
  const kind = socialFormat(key).kind
  return kind === "handle" || kind === "path"
}

export function SocialLinksEditor({
  value,
  onChange,
  compact = false,
  handles = false,
  className,
}: {
  value: Partial<Record<SocialPlatformKey, string>>
  onChange: (key: SocialPlatformKey, next: string) => void
  /** Tighter rows, for the store builder's narrow side panel. */
  compact?: boolean
  /**
   * AN "@" IN FRONT, SO ONLY THE NAME IS TYPED (r51, Edit profile). `value`
   * then holds what is in the field: the name for a plain profile, or a
   * whole link, before which the "@" steps aside. A leading "@" typed or
   * pasted is dropped, since one is already there. Turning a name into the
   * profile's address is the caller's (resolveSocialInput), as before.
   */
  handles?: boolean
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
        const named = handles && takesHandle(key)
        /* The "@" is there for a name and for an empty field, and steps aside for a link. */
        const at = named && !socialFieldIsLink(key, current)
        return (
          <div
            key={key}
            data-social-field={key}
            className={cn(
              "flex items-stretch overflow-hidden border bg-white",
              handles
                ? "rounded-[10px] border-[#e3e5e8] transition-[border-color,box-shadow] duration-150 focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:rounded-lg"
                : "rounded-lg border-input bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
              compact ? "h-9" : handles ? "h-11 sm:h-10" : "h-11",
            )}
          >
            <span
              className={cn(
                "grid shrink-0 place-items-center border-r",
                handles ? "border-[#eceef1] text-[#1a1a2e]" : "border-input text-foreground",
                compact ? "w-9" : handles ? "w-11 sm:w-10" : "w-11",
              )}
              aria-hidden
            >
              <Icon size={compact ? 16 : 18} />
            </span>
            {named ? (
              /* Fixed, grey, and the width of itself only: the name starts right after it. */
              <span
                data-social-prefix=""
                aria-hidden
                className={cn("flex select-none items-center pl-3 text-[16px] text-[#9ca3af] sm:text-[14px]", !at && "hidden")}
              >
                @
              </span>
            ) : null}
            <input
              value={current}
              maxLength={300}
              onChange={(e) => onChange(key, named ? e.target.value.replace(/^\s*@+/, "") : e.target.value)}
              // The mark carries no text, so the field needs the name for
              // anyone not looking at it.
              aria-label={SOCIAL_PLATFORM_LABELS[key]}
              placeholder={handles ? (named ? "username" : "Paste a link") : "Username or URL"}
              autoCapitalize={handles ? "none" : undefined}
              autoCorrect={handles ? "off" : undefined}
              spellCheck={handles ? false : undefined}
              inputMode={handles ? (named ? "text" : "url") : undefined}
              className={cn(
                "min-w-0 flex-1 bg-transparent outline-none",
                handles
                  ? cn("pr-3 text-[16px] text-[#1a1a2e] placeholder:text-[#b6bac2] sm:text-[14px]", at ? "pl-[1px]" : "pl-3")
                  : "px-3 text-sm placeholder:text-muted-foreground",
              )}
            />
            {current && (
              <button
                type="button"
                onClick={() => onChange(key, "")}
                aria-label={`Remove ${SOCIAL_PLATFORM_LABELS[key]}`}
                className={cn(
                  "grid shrink-0 place-items-center transition-colors",
                  handles ? "text-[#9ca3af] hover:text-[#1a1a2e]" : "text-muted-foreground hover:text-foreground",
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
