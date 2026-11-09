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
import { formatNumber } from "@/lib/i18n/format"
import { LIST_BAR, LIST_WIDTH, PaneBar, iconButton } from "../orders/order-parts"

/*
  THE PEOPLE LIST AS IT WAS LAST SHOWN (wave 7). The list notes its query each
  time it changes; a person's back arrow goes back in history when the list is
  the page behind (the list as it was, its scroll kept by the router), and
  otherwise pushes the list at this query, so a profile opened from a link
  still returns to the view, search and page the creator was on. Memory, and
  this tab's session storage for a reload; never shared, never required.
*/
let peopleQuery: string | null = null
const PEOPLE_QUERY_KEY = "storelib:contacts:list"

export function notePeopleQuery(query: string) {
  peopleQuery = query
  try {
    window.sessionStorage.setItem(PEOPLE_QUERY_KEY, query)
  } catch {
    /* Private mode or blocked storage: memory is enough. */
  }
}

export function lastPeopleQuery(): string {
  if (peopleQuery !== null) return peopleQuery
  try {
    return window.sessionStorage.getItem(PEOPLE_QUERY_KEY) ?? ""
  } catch {
    return ""
  }
}

/** The People list as it was last shown. */
export function peopleHref(): string {
  const q = lastPeopleQuery().replace(/^\?/, "")
  return q ? `/app/contacts?${q}` : "/app/contacts"
}

/** Back to the People list: a history back when it is the page behind, else the list at its last query. */
export function backToPeople(router: { push: (href: string) => void }) {
  if (canReturnTo("/app/contacts")) backThen(() => router.push(peopleHref()))
  else router.push(peopleHref())
}

/**
 * The quiet views, as Orders' and Coupons' toolbar draws them: words, the
 * chosen one on a light grey ground, 36px and 15px on a phone, 32px and 13px
 * from md. Used for a form's tabs (Edit, Responses, Insights, Settings), so
 * the form page wears the same tabs as every list instead of a pill band.
 */
export function ContactsViews<T extends string>({ label, value, onChange, options, className }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("orders-strip -my-2 flex min-w-0 items-center gap-0.5 overflow-x-auto py-2", className)} data-contacts-tabs="">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            data-tab={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[15px] font-medium transition-colors duration-100 md:h-8 md:rounded-lg md:text-[13px] [-webkit-tap-highlight-color:transparent]",
              on ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
            )}
          >
            {o.label}
            {typeof o.count === "number" ? <span className="tabular-nums text-[#9ca3af]">{formatNumber(o.count)}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

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
    backToPeople(router)
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
