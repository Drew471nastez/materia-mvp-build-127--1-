"use client"

import { useEffect, useRef, useState, type MouseEvent } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { fallbackHref, isPlainClick, planBack } from "@/lib/navigation/back-plan"
import { goBackOr, readBackEvidence } from "@/lib/navigation/go-back"

/**
 * Drop this into any page that links to product pages so the back breadcrumb
 * on the product page shows that page's name (e.g. "< John's Store").
 * Renders nothing visible.
 */
export function BackLabelSetter({ label }: { label: string }) {
  useEffect(() => {
    try { sessionStorage.setItem("backPageName", label) } catch { /* ignore */ }
  }, [label])
  return null
}

/**
 * Back breadcrumb rendered above product content.
 *
 * Visible in two cases:
 *  1. Capacitor native app (iOS/Android) — always shown on ALL product pages.
 *     Primary: CSS rule `html.capacitor [data-discover-breadcrumb]` activates
 *     synchronously before first paint (html.capacitor set via inline <script>).
 *     Backup: useEffect directly sets style.display="flex" in case the CSS
 *     rule fails to apply (e.g. specificity conflict or late class application).
 *  2. Web/desktop — only shown when showOnWeb=true (URL has ?layout=discover&recommended=1).
 *
 * The back label is read from sessionStorage key "backPageName" set by explore/
 * category/store pages before navigating to a product. Falls back to "Back".
 *
 * WHERE IT GOES. It called `router.back()` whatever was behind it, so a
 * product opened cold in the app (a notification, a shared link) had a back
 * that did nothing at all. It is a link to the creator's page now, and a
 * plain press goes back only when lib/navigation/back-plan says there is a
 * page of ours to go back to. A label read from sessionStorage describes the
 * page that set it, which may be in the past rather than behind this one, so
 * with nowhere to go back to it names the creator, which is where it goes.
 */
export function DiscoverBackBreadcrumb({
  showOnWeb = false,
  creatorHref,
  creatorName,
}: {
  showOnWeb?: boolean
  /** The creator's page, where the control goes when there is nothing behind. */
  creatorHref?: string
  creatorName?: string
}) {
  const router = useRouter()
  const ref = useRef<HTMLAnchorElement>(null)
  const [backLabel, setBackLabel] = useState("Back")
  const href = fallbackHref(creatorHref)

  useEffect(() => {
    // Read dynamic back label stored by the previous page, when that page is
    // really behind this one; otherwise the control goes to the creator.
    if (planBack(readBackEvidence(), href).kind === "navigate") {
      if (creatorName) setBackLabel(creatorName)
    } else {
      try {
        const stored = sessionStorage.getItem("backPageName")
        if (stored) setBackLabel(stored)
      } catch { /* ignore */ }
    }

    if (!ref.current) return
    // JS backup: force visibility with !important so this overrides any CSS rule.
    // Skip forcing visibility on desktop (≥768px) — the browser back button covers it.
    const isNative = document.documentElement.classList.contains("capacitor")
    const isDesktop = window.innerWidth >= 768
    if ((isNative || showOnWeb) && !isDesktop) {
      ref.current.style.setProperty("display", "flex", "important")
    }
  }, [showOnWeb, href, creatorName])

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return
    e.preventDefault()
    goBackOr(href, (to) => router.push(to))
  }

  return (
    <a
      ref={ref}
      href={href}
      onClick={onClick}
      data-discover-breadcrumb={showOnWeb ? "web" : "native"}
      className="w-fit items-center gap-1.5 mb-5 cursor-pointer text-[#9ca3af] hover:text-[#6b7280] transition-colors"
    >
      <ChevronLeft className="w-4 h-4" strokeWidth={2} />
      <span className="text-[14px]">{backLabel}</span>
    </a>
  )
}
