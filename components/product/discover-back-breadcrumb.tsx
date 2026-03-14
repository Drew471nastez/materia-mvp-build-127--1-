"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

export function DiscoverBackBreadcrumb() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="flex items-center gap-1 mb-5 cursor-pointer transition-colors"
      style={{ color: "#9ca3af" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#6b7280")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "#9ca3af")}
    >
      <ChevronLeft className="w-4 h-4" />
      <span className="text-sm">Recommended</span>
    </button>
  )
}
