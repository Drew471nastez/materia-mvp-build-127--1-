"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { backThen } from "@/lib/navigation/go-back"

/**
 * The two ways on from a page that is not there: back to where the visitor
 * was, when that was a page of ours, and home. Nothing about the
 * marketplace: a 404 can be reached from the dashboard, Help or a receipt
 * link, and Explore is the wrong next step from most of them.
 */
export function NotFoundActions() {
  const back = () => {
    let ours = false
    try {
      ours = !!document.referrer && new URL(document.referrer).origin === window.location.origin
    } catch {
      ours = false
    }
    if (ours && window.history.length > 1) backThen(() => window.location.assign("/"))
    else window.location.assign("/")
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 sm:flex-row">
      <button
        type="button"
        onClick={back}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-5 text-[14px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(15,17,21,0.04)] transition-colors hover:bg-[#f6f7f9] sm:w-auto"
        data-not-found-back=""
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Go back
      </button>
      <Link
        href="/"
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#1a1a2e] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#2d2d4e] sm:w-auto"
        data-not-found-home=""
      >
        Storelib home
      </Link>
    </div>
  )
}
