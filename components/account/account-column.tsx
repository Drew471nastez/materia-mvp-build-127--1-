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

export function AccountColumn({ top = true, className, children }: { top?: boolean; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[960px] pb-10", top && "pt-4 sm:pt-6", className)}
      style={{ paddingLeft: ACCOUNT_GUTTER_LEFT, paddingRight: ACCOUNT_GUTTER_RIGHT }}
      data-account-column=""
    >
      {children}
    </div>
  )
}
