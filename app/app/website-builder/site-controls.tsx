"use client"

/**
 * ===========================================================================
 *  THE THREE CONTROLS BESIDE THE PAGE TITLE
 * ===========================================================================
 * The bar above the website's cover held six labelled doors into Website
 * Settings. It read as a second navigation and said little about what each
 * door did. What somebody wants from this row is three things, so it is
 * three compact controls on the right of the title, in the Polaris shape of
 * a page header's secondary actions:
 *
 *   View website   the live site, in a new tab
 *   Public         whether it is up; the menu takes it offline, or puts an
 *                  offline one back
 *   Settings       Website Settings in the editor, where every one of the
 *                  six doors still is
 *
 * Every control is 36px high with a hairline border and one icon, so the row
 * reads as one group rather than three styles. On a phone the row sits under
 * the title and can scroll sideways if a translation makes it long.
 */
import * as React from "react"
import { ChevronDown, EyeOff, Rocket, Settings2, SquareArrowOutUpRight } from "lucide-react"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"

export const CONTROL =
  "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg sm:h-9 border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-colors duration-150 hover:bg-[#f8f9fa] active:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:pointer-events-none disabled:opacity-50"

export interface SiteControlsProps {
  /** The live site's address, or "" when nothing is live. */
  siteUrl: string
  /** Is a website live right now. */
  isPublic: boolean
  /** The site that was taken offline, which the menu can put back. */
  offlineName: string | null
  busy: boolean
  onTakeOffline: () => void
  onPublishAgain: () => void
  /** Null when there is no website to have settings for. */
  onSettings: (() => void) | null
}

export function SiteControls({ siteUrl, isPublic, offlineName, busy, onTakeOffline, onPublishAgain, onSettings }: SiteControlsProps) {
  const items: ActionMenuItem[] = isPublic
    ? [{ label: "Take offline", icon: <EyeOff />, variant: "warning", onClick: onTakeOffline }]
    : offlineName
      ? [{ label: `Publish ${offlineName} again`, icon: <Rocket />, onClick: onPublishAgain }]
      : []

  const status = (
    <>
      <span className={cn("h-1.5 w-1.5 rounded-full", isPublic ? "bg-emerald-500" : "bg-[#9ca3af]")} aria-hidden />
      <span className={isPublic ? "text-[#1a1a2e]" : "text-[#4b5563]"}>{isPublic ? "Public" : "Unpublished"}</span>
    </>
  )

  return (
    <div
      data-site-controls=""
      className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
    >
      {isPublic && siteUrl ? (
        <a href={siteUrl} target="_blank" rel="noopener noreferrer" className={CONTROL} data-control="view">
          <SquareArrowOutUpRight className="h-[15px] w-[15px] text-[#6b7280]" strokeWidth={1.9} />
          View website
        </a>
      ) : (
        <button type="button" disabled className={CONTROL} data-control="view" title="Nothing is live">
          <SquareArrowOutUpRight className="h-[15px] w-[15px] text-[#6b7280]" strokeWidth={1.9} />
          View website
        </button>
      )}

      {items.length ? (
        <ResponsiveActionMenu
          title={isPublic ? "Your website is public" : "Your website is unpublished"}
          items={items}
          menuWidth="w-56"
          trigger={
            <button type="button" className={CONTROL} data-control="status" aria-label={isPublic ? "Public. Change" : "Unpublished. Change"} disabled={busy}>
              {status}
              <ChevronDown className="h-3.5 w-3.5 text-[#9ca3af]" strokeWidth={2} />
            </button>
          }
        />
      ) : (
        <span className={cn(CONTROL, "cursor-default hover:bg-white")} data-control="status">
          {status}
        </span>
      )}

      <button type="button" className={CONTROL} data-control="settings" onClick={onSettings ?? undefined} disabled={!onSettings}>
        <Settings2 className="h-[15px] w-[15px] text-[#6b7280]" strokeWidth={1.9} />
        Settings
      </button>
    </div>
  )
}
