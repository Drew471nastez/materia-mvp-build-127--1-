/**
 * ===========================================================================
 *  THE PROFILE'S COLUMN
 * ===========================================================================
 * The width every page of /account is read at (960px, the one /@handle
 * draws at) with the account's side padding (lib/account/account-tabs.ts),
 * in one place. It used to be the layout's own wrapper around everything;
 * the profile's cover runs edge to edge now, like a creator page's, so the
 * cover is drawn outside it and the column starts under the person
 * (components/account/account-hub.tsx). A page without the person on it
 * (Settings, the library) is in the column from the top, with the room
 * under the site header it always had (`top`).
 *
 * No hooks and no "use client": the server layout and the client hub both
 * draw it.
 */
import type { ReactNode } from "react"
import { ACCOUNT_GUTTER_LEFT, ACCOUNT_GUTTER_RIGHT } from "@/lib/account/account-tabs"
import { cn } from "@/lib/utils"

/**
 * How wide the column is for an address. The library is a list of things
 * bought: a little wider than the 960px profile column. A course's lesson
 * page is a video beside its lesson list, and at 960px both were cramped on
 * a large screen ("too narrow"), so it takes the room a player needs.
 */
export function accountWidth(pathname: string | null | undefined): string {
  const path = pathname ?? ""
  if (/^\/account\/library\/courses\/[^/]+/.test(path)) return "max-w-[1280px]"
  if (path.startsWith("/account/library")) return "max-w-[1040px]"
  return "max-w-[960px]"
}

export function AccountColumn({ top = true, className, children, width = "max-w-[960px]" }: { top?: boolean; className?: string; children: ReactNode; width?: string }) {
  return (
    <div
      className={cn("mx-auto w-full pb-10", width, top && "pt-4 sm:pt-6", className)}
      style={{ paddingLeft: ACCOUNT_GUTTER_LEFT, paddingRight: ACCOUNT_GUTTER_RIGHT }}
      data-account-column=""
    >
      {children}
    </div>
  )
}
