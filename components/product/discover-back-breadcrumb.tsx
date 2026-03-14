"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

export function DiscoverBackBreadcrumb() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="flex items-center gap-1.5 mb-6 cursor-pointer text-[#b0b7c3] hover:text-[#6b7280] transition-colors"
    >
      <ChevronLeft className="w-[15px] h-[15px]" strokeWidth={2.5} />
      <span className="text-[14px] font-normal">Recommended</span>
    </button>
  )
}
