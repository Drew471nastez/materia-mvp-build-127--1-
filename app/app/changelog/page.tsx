"use client"

import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { tt } from "@/lib/i18n/text"

interface ChangelogEntry {
  date: string
  type: "feature" | "improvement" | "fix" | "update"
  category: string
  title: string
  description: string
}

const changelogData: ChangelogEntry[] = [
  {
    get date() { return tt("March 4") },
    type: "fix",
    get category() { return tt("Navigation") },
    get title() { return tt("Sign In Button Fix on Seller Pages") },
    get description() { return tt("Fixed Sign In and Log In buttons on seller store pages (subdomains) to correctly redirect to storelib.com instead of staying on the seller subdomain.") },
  },
  {
    get date() { return tt("March 4") },
    type: "improvement",
    get category() { return tt("Payouts") },
    get title() { return tt("Revenue Chart Default & Net Indicator") },
    get description() { return tt("Revenue chart now defaults to All Time view so lifetime revenue is always visible. Added Net earnings indicator to the chart legend alongside Revenue and Refunds.") },
  },
  {
    get date() { return tt("March 4") },
    type: "improvement",
    get category() { return tt("Analytics") },
    get title() { return tt("Refunds Visible in Revenue Chart") },
    get description() { return tt("Refund data now appears on the analytics chart when viewing the Revenue metric, matching the payouts chart behavior.") },
  },
  {
    get date() { return tt("March 4") },
    type: "fix",
    get category() { return tt("Payouts") },
    get title() { return tt("First Payout Banner Logic") },
    get description() { return tt("The first payout setup banner no longer shows after a successful payout has been completed.") },
  },
  {
    get date() { return tt("March 4") },
    type: "improvement",
    get category() { return tt("Settings") },
    get title() { return tt("Upgrade Page Improvements") },
    get description() { return tt("Renamed Professional plan to Pro, added smooth loading skeleton, and ensured equal height pricing tier cards on the upgrade page.") },
  },
  {
    get date() { return tt("March 4") },
    type: "improvement",
    get category() { return tt("Navigation") },
    get title() { return tt("Updated Loading Skeletons") },
    get description() { return tt("Improved loading skeleton structures for Explore, Analytics, and Upgrade pages to better match actual page layouts.") },
  },
  {
    get date() { return tt("February 4") },
    type: "feature",
    get category() { return tt("Settings") },
    get title() { return tt("Privacy Controls & Account Security") },
    get description() { return tt("New Privacy tab in settings allowing you to manage AI features, personalization, delete your account, and sign out from all devices at once.") },
  },
  {
    get date() { return tt("February 3") },
    type: "improvement",
    get category() { return tt("Settings") },
    get title() { return tt("Enhanced Settings Page Experience") },
    get description() { return tt("Improved settings page with smoother sticky save bar animations, toast notifications, and faster tab navigation with skeleton loading.") },
  },
  {
    get date() { return tt("February 2") },
    type: "feature",
    get category() { return tt("Analytics") },
    get title() { return tt("KPI Blur Animations") },
    get description() { return tt("Added smooth blur transition animations to all KPI cards across Dashboard, Analytics, and Sales pages for a more polished loading experience.") },
  },
  {
    get date() { return tt("February 1") },
    type: "improvement",
    get category() { return tt("Store Builder") },
    get title() { return tt("Store Builder UI Improvements") },
    get description() { return tt("Enhanced button clickability and z-index handling in the Store Builder editor for better editing experience.") },
  },
  {
    get date() { return tt("January 30") },
    type: "fix",
    get category() { return tt("Profile") },
    get title() { return tt("Avatar Fallback Logic") },
    get description() { return tt("Fixed avatar display to properly fall back through settings, store builder, OnePage, and Google authentication.") },
  },
  {
    get date() { return tt("January 28") },
    type: "feature",
    get category() { return tt("Dashboard") },
    get title() { return tt("Live Visitors Indicator") },
    get description() { return tt("Added real-time live visitors indicator on the dashboard with automatic polling updates showing current active users.") },
  },
  {
    get date() { return tt("January 25") },
    type: "feature",
    get category() { return tt("Navigation") },
    get title() { return tt("Navigation Loading Bar") },
    get description() { return tt("Added smooth glowing loading bar that appears during page navigation across the entire application.") },
  },
  {
    get date() { return tt("January 22") },
    type: "improvement",
    get category() { return tt("Emails") },
    get title() { return tt("Email Subscriber Badges") },
    get description() { return tt("Added 'resubscribed' badge for subscribers who unsubscribed and then subscribed again to your list.") },
  },
  {
    get date() { return tt("January 20") },
    type: "fix",
    get category() { return tt("Settings") },
    get title() { return tt("Sidebar Avatar Sync") },
    get description() { return tt("Fixed sidebar avatar to properly sync with settings profile photo across the entire application.") },
  },
  {
    get date() { return tt("January 18") },
    type: "feature",
    get category() { return tt("Products") },
    get title() { return tt("Dynamic Favicon") },
    get description() { return tt("Product pages now display the seller's profile avatar as the browser favicon for brand consistency.") },
  },
]

const categories = ["All", "Settings", "Analytics", "Dashboard", "Payouts", "Store Builder", "Profile", "Navigation", "Emails", "Products"]

const getTypeLabel = (type: string) => {
  switch (type) {
    case "feature":
      return tt("New")
    case "improvement":
      return tt("Improvement")
    case "fix":
      return tt("Fix")
    case "update":
      return tt("Update")
    default:
      return tt("Change")
  }
}

export default function ChangelogPage() {
  const [selectedCategory, setSelectedCategory] = useState("All")

  const filteredData = selectedCategory === "All"
    ? changelogData
    : changelogData.filter(entry => entry.category === selectedCategory)

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto app-gutter py-8 sm:py-12">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/app/settings"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#6b7280] hover:text-[#1a1a2e] transition-colors mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            {tt("Back to Settings")}
          </Link>
          <h1 className="text-[32px] sm:text-[40px] font-bold text-[#1a1a2e] tracking-tight">{tt("Changelog")}</h1>
          <p className="text-[15px] text-[#6b7280] mt-2">
            {tt("New updates and improvements to Storelib.")}
          </p>
        </div>

        <div className="flex gap-12">
          {/* Main content - Timeline */}
          <div className="flex-1">
            <div className="relative">
              {filteredData.map((entry, index) => (
                <div key={index} className="flex gap-6 mb-10 last:mb-0">
                  {/* Date column */}
                  <div className="w-28 flex-shrink-0 text-right pt-0.5">
                    <span className="text-[13px] font-medium text-[#6b7280] uppercase tracking-wide">
                      {entry.date}
                    </span>
                  </div>

                  {/* Timeline */}
                  <div className="relative flex flex-col items-center">
                    {/* Circle */}
                    <div className="w-4 h-4 rounded-full border-2 border-[#d1d5db] bg-white z-10" />
                    {/* Vertical line */}
                    {index < filteredData.length - 1 && (
                      <div className="w-px bg-[#e5e7eb] absolute top-4 bottom-0 left-1/2 -translate-x-1/2 h-[calc(100%+40px)]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-2">
                    <h3 className="text-[17px] font-semibold text-[#1a1a2e] mb-2 hover:underline cursor-pointer">
                      {entry.title}
                    </h3>
                    <p className="text-[14px] text-[#6b7280] leading-relaxed mb-3">
                      {entry.description}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full bg-[#dcfce7] text-[#166534]">
                        {getTypeLabel(entry.type)}
                      </span>
                      <span className="text-[12px] text-[#9ca3af]">
                        {entry.category}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filter sidebar */}
          <div className="hidden lg:block w-48 flex-shrink-0">
            <div className="sticky top-8">
              <h3 className="text-[14px] font-semibold text-[#1a1a2e] mb-3">{tt("Filter")}</h3>
              <div className="space-y-1">
                {categories.map((category) => (
                  <label
                    key={category}
                    className="flex items-center gap-2.5 cursor-pointer py-1.5 group"
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedCategory === category
                          ? "bg-[#22c55e] border-[#22c55e]"
                          : "border-[#d1d5db] group-hover:border-[#9ca3af]"
                      }`}
                      onClick={() => setSelectedCategory(category)}
                    >
                      {selectedCategory === category && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span
                      className={`text-[13px] transition-colors ${
                        selectedCategory === category ? "text-[#1a1a2e] font-medium" : "text-[#6b7280]"
                      }`}
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile filter */}
        <div className="lg:hidden mt-8 pt-6 border-t border-[#e5e7eb]">
          <h3 className="text-[14px] font-semibold text-[#1a1a2e] mb-3">{tt("Filter by category")}</h3>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 text-[13px] rounded-full border transition-colors ${
                  selectedCategory === category
                    ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                    : "text-[#6b7280] border-[#e5e7eb] hover:border-[#d1d5db]"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-[#e5e7eb]">
          <p className="text-[13px] text-[#9ca3af]">
            {tt("Have feedback or feature requests?")}{" "}
            <a href="mailto:support@storelib.com" className="text-[#1a1a2e] hover:underline">
              {tt("Let us know")}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
