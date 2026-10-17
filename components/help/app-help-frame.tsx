"use client"

/**
 * ===========================================================================
 *  THE HELP CENTER AS A PAGE IN THE DASHBOARD: ITS PANE, ITS BAR, ITS BACK
 * ===========================================================================
 * "I want Help to be accessible from this modal as well in /app, and it
 * redirects as a new page." The account menu's Help row opens /app/help: the
 * same articles as the public /help, drawn inside the app's header, rail and
 * pill rather than in a new tab.
 *
 * The page scrolls in its own pane, the way Orders and Support do (the
 * `orders-pane page-scroll` pair: the room for the phone's pill goes on it,
 * app/globals.css), on the app's grey from its first frame, so nothing white
 * shows while it lands. Its bar sticks to the top of that pane with a back
 * arrow in front of the title, as an order's page has, and picks up its
 * hairline once something scrolls under it (PaneBar).
 *
 * BACK RETURNS, IT DOES NOT PUSH. Opened from the account menu on Payouts,
 * the arrow goes back to Payouts; from an article it goes back to the list
 * or the search it was opened from. With nothing of ours behind (a bookmark,
 * a link from an email) it is a link to the level above: the topic, Help,
 * or the dashboard's home. iOS's edge swipe and Android's back button go
 * through the same history, so all three agree.
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { PaneBar, iconButton } from "@/app/app/orders/order-parts"
import { canReturnInApp } from "@/lib/navigation/in-app-history"
import { backThen } from "@/lib/navigation/go-back"
import { isPlainClick } from "@/lib/ui/app-navigation"
import { cn } from "@/lib/utils"

/** The column every in-app help page is laid out in, bar and body alike. */
export const APP_HELP_WIDTH = "max-w-[880px]"

export function HelpBack({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter()
  return (
    <Link
      href={fallback}
      prefetch={false}
      aria-label={label}
      title={label}
      data-help-back=""
      onClick={(e) => {
        if (!isPlainClick(e) || !canReturnInApp()) return
        e.preventDefault()
        /* A back that does nothing (an entry the browser replaced) lands on the level above instead (lib/navigation/go-back). */
        backThen(() => router.replace(fallback))
      }}
      className={cn(iconButton, "h-9 w-9 text-[#1a1a2e]")}
    >
      <ArrowLeft className="h-5 w-5" />
    </Link>
  )
}

export function AppHelpFrame({
  back,
  title,
  subtitle,
  children,
}: {
  back: { fallback: string; label: string }
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="orders-pane page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] app-page-enter" data-help-scroll="" data-app-help="">
      <PaneBar width={APP_HELP_WIDTH} className="grid min-h-[56px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 py-2 lg:min-h-[64px] lg:pt-4">
        <div className="-ml-1.5 flex h-9 w-9 items-center justify-center">
          <HelpBack {...back} />
        </div>
        <div className="min-w-0">
          {title}
          {subtitle ? <div className="truncate text-[13px] leading-5 text-[#6b7280]">{subtitle}</div> : null}
        </div>
      </PaneBar>
      <div className={cn("app-gutter mx-auto pb-10 pt-2 md:pb-14", APP_HELP_WIDTH)}>{children}</div>
    </div>
  )
}
