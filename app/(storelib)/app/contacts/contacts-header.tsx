"use client"

/**
 * ===========================================================================
 *  CONTACTS' PANE AND BAR
 * ===========================================================================
 * The list bar every Storelib list wears (Orders, Products, Coupons:
 * LIST_BAR): the title and the page's actions on one line. Forms is a page
 * under Contacts (/app/contacts/forms), so its bar carries a Back to the
 * People list instead of a second row of tabs; a screen inside Forms (the
 * website inbox, an older website form) carries a Back to Forms in the same
 * place. One bar per screen, one back arrow.
 *
 * ContactsPane is the pane every /app list scrolls in (Coupons, Orders,
 * Products: `orders-pane page-scroll`, #f8f9fa), so the page is the same grey
 * as its bar on a computer too. Without it the page sat on the shell's white
 * <main> (md:bg-white, app/(storelib)/app/layout.tsx) and the bar's own
 * #f8f9fa read as a grey band across the top (wave 6, the owner: "doesn't
 * match how it is across all the other pages in /app").
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { backThen } from "@/lib/navigation/go-back"
import { canReturnTo } from "@/lib/navigation/in-app-history"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { LIST_BAR, LIST_WIDTH, PaneBar, iconButton } from "../orders/order-parts"

export const ContactsPane = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function ContactsPane({ className, children, ...rest }, ref) {
  return (
    <div ref={ref} data-contacts-pane="" className={cn("orders-pane page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] app-page-enter", className)} {...rest}>
      {children}
    </div>
  )
})

/** The back arrow of a bar in Contacts: 36px on a computer, a 44px press on a phone. */
export const BACK_ARROW = cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea] max-md:-ml-2.5 max-md:h-11 max-md:w-11")

/** The bar's dark action on a phone: 44px high, as Coupons' New coupon (coupons-client NEW_BUTTON). */
export const PHONE_ACTION = "max-md:h-11 max-md:rounded-xl max-md:px-4 max-md:text-[15px]"

export function ContactsHeader({
  title,
  back,
  onBack,
  backLabel,
  actions,
}: {
  title: React.ReactNode
  /** Back to the People list (/app/contacts). */
  back?: boolean
  /** Back somewhere inside the page instead (Forms' own screens), with its label. */
  onBack?: () => void
  backLabel?: string
  actions?: React.ReactNode
}) {
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
        {onBack ? (
          <button type="button" onClick={onBack} className={BACK_ARROW} aria-label={backLabel ?? tt("Back to forms")} data-contacts-back="">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : back ? (
          <a href="/app/contacts" onClick={goBack} className={BACK_ARROW} aria-label={tt("Back to contacts")} data-contacts-back="">
            <ArrowLeft className="h-5 w-5" />
          </a>
        ) : null}
        <h1 className="truncate text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{title}</h1>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </PaneBar>
  )
}
