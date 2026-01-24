"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, Check } from "lucide-react"

const timeFrameOptions = [
  { value: "today", label: "Today" },
  { value: "48h", label: "Last 48 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "Last 365 days" },
  { value: "last_year", label: "Last year" },
]

interface TimeFrameSelectorProps {
  currentTimeFrame: string
}

export function TimeFrameSelector({ currentTimeFrame }: TimeFrameSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentOption = timeFrameOptions.find((opt) => opt.value === currentTimeFrame) || timeFrameOptions[2]

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (value: string) => {
    setIsOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.set("timeframe", value)
    router.push(`/app?${params.toString()}`)
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm"
      >
        {currentOption.label}
        <ChevronDown
          className={`h-4 w-4 text-[#9ca3af] transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="w-[180px] rounded-xl border border-[#e5e7eb]/70 bg-white p-1 shadow-lg shadow-black/5">
            {timeFrameOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  option.value === currentTimeFrame
                    ? "bg-[#f5f3ff] text-[#8b5cf6]"
                    : "text-[#374151] hover:bg-[#f9fafb]"
                }`}
              >
                <span>{option.label}</span>
                {option.value === currentTimeFrame && (
                  <Check className="h-4 w-4 text-[#8b5cf6]" strokeWidth={2} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
