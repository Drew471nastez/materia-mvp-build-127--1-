"use client"

import { ChevronLeft, Sparkles, Bug, Zap, Wrench, Plus } from "lucide-react"
import Link from "next/link"

interface ChangelogEntry {
  version: string
  date: string
  type: "feature" | "improvement" | "fix" | "update"
  title: string
  description: string
}

const changelogData: ChangelogEntry[] = [
  {
    version: "1.2.0",
    date: "February 4, 2026",
    type: "feature",
    title: "Privacy Controls",
    description: "New Privacy controls tab in settings allowing you to manage AI features, personalization, and session recording preferences.",
  },
  {
    version: "1.1.5",
    date: "February 3, 2026",
    type: "improvement",
    title: "Enhanced Settings Page",
    description: "Improved settings page with better sticky save bar, toast notifications, and smoother tab navigation.",
  },
  {
    version: "1.1.4",
    date: "February 2, 2026",
    type: "feature",
    title: "Sign Out from All Devices",
    description: "Added ability to sign out from all devices at once for improved account security.",
  },
  {
    version: "1.1.3",
    date: "February 1, 2026",
    type: "improvement",
    title: "Store Builder UI Improvements",
    description: "Enhanced button clickability and z-index handling in the Store Builder editor.",
  },
  {
    version: "1.1.2",
    date: "January 30, 2026",
    type: "fix",
    title: "Avatar Fallback Logic",
    description: "Fixed avatar display to properly fall back through settings, store builder, OnePage, and Google authentication.",
  },
  {
    version: "1.1.1",
    date: "January 28, 2026",
    type: "feature",
    title: "Live Visitors Indicator",
    description: "Added real-time live visitors indicator on the dashboard with 3-second polling updates.",
  },
  {
    version: "1.1.0",
    date: "January 25, 2026",
    type: "feature",
    title: "Navigation Loading Bar",
    description: "Added smooth glowing loading bar that appears during page navigation across the app.",
  },
  {
    version: "1.0.9",
    date: "January 22, 2026",
    type: "improvement",
    title: "Email Subscriber Badges",
    description: "Added 'resubscribed' badge for subscribers who unsubscribed and subscribed again.",
  },
  {
    version: "1.0.8",
    date: "January 20, 2026",
    type: "fix",
    title: "Sidebar Avatar Sync",
    description: "Fixed sidebar avatar to properly sync with settings profile photo.",
  },
  {
    version: "1.0.7",
    date: "January 18, 2026",
    type: "feature",
    title: "Dynamic Favicon",
    description: "Product pages now display the seller's profile avatar as the browser favicon.",
  },
]

const getTypeIcon = (type: string) => {
  switch (type) {
    case "feature":
      return <Plus className="h-4 w-4" />
    case "improvement":
      return <Sparkles className="h-4 w-4" />
    case "fix":
      return <Bug className="h-4 w-4" />
    case "update":
      return <Zap className="h-4 w-4" />
    default:
      return <Wrench className="h-4 w-4" />
  }
}

const getTypeColor = (type: string) => {
  switch (type) {
    case "feature":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "improvement":
      return "bg-purple-50 text-purple-700 border-purple-200"
    case "fix":
      return "bg-amber-50 text-amber-700 border-amber-200"
    case "update":
      return "bg-blue-50 text-blue-700 border-blue-200"
    default:
      return "bg-gray-50 text-gray-700 border-gray-200"
  }
}

const getTypeLabel = (type: string) => {
  switch (type) {
    case "feature":
      return "New Feature"
    case "improvement":
      return "Improvement"
    case "fix":
      return "Bug Fix"
    case "update":
      return "Update"
    default:
      return "Change"
  }
}

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/app/settings"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#6b7280] hover:text-[#374151] transition-colors mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Settings
          </Link>
          <h1 className="text-[28px] sm:text-[32px] font-bold text-[#1a1a2e]">Changelog</h1>
          <p className="text-[14px] text-[#6b7280] mt-2">
            Stay up to date with the latest features, improvements, and fixes in Storelib.
          </p>
        </div>

        {/* Changelog entries */}
        <div className="space-y-6">
          {changelogData.map((entry, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5e7eb]"
            >
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="text-[12px] font-medium text-[#9ca3af] bg-[#f3f4f6] px-2.5 py-1 rounded-lg">
                  v{entry.version}
                </span>
                <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-lg border ${getTypeColor(entry.type)}`}>
                  {getTypeIcon(entry.type)}
                  {getTypeLabel(entry.type)}
                </span>
                <span className="text-[12px] text-[#9ca3af]">{entry.date}</span>
              </div>
              <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-2">{entry.title}</h3>
              <p className="text-[14px] text-[#6b7280] leading-relaxed">{entry.description}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-[13px] text-[#9ca3af]">
            Have feedback or feature requests?{" "}
            <a href="mailto:support@storelib.com" className="text-[#8b5cf6] hover:text-[#7c3aed]">
              Let us know
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
