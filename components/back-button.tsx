"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

export function BackButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 text-[14px] text-[#6b7280] hover:text-[#1a1a2e] transition-colors mb-6 cursor-pointer"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  )
}
