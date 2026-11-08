"use client"

/**
 * ===========================================================================
 *  CONTACTS' BAR
 * ===========================================================================
 * The list bar every Storelib list wears (Orders, Products: LIST_BAR): the
 * title and the page's actions on one line. Forms is a page under Contacts
 * (/app/contacts/forms), so its bar carries a Back to the People list
 * instead of a second row of tabs.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { backThen } from "@/lib/navigation/go-back"
import { canReturnTo } from "@/lib/navigation/in-app-history"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { LIST_BAR, LIST_WIDTH, PaneBar, iconButton } from "../orders/order-parts"

export function ContactsHeader({ title, back, actions }: { title: string; back?: boolean; actions?: React.ReactNode }) {
  const router = useRouter()
  const goBack = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    if (canReturnTo("/app/contacts")) backThen(() => router.push("/app/contacts"))
    else router.push("/app/contacts")
  }
  return (
    <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
      <div className="flex min-w-0 items-center gap-1.5">
        {back ? (
          <a href="/app/contacts" onClick={goBack} className={cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0")} aria-label={tt("Back to contacts")} data-contacts-back="">
            <ArrowLeft className="h-[18px] w-[18px]" />
          </a>
        ) : null}
        <h1 className="truncate text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{title}</h1>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </PaneBar>
  )
}
