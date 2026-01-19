"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { X, ChevronDown } from "lucide-react"

interface RefundPolicyDisplayProps {
  enabled: boolean
  policyType: string | null
  finePrint: string | null
  updatedAt: string | null
  className?: string
  textColor?: string
  isPreviewMode?: boolean
}

const POLICY_LABELS: Record<string, string> = {
  no_refunds: "No refunds allowed",
  "7_day": "7-day money back guarantee",
  "14_day": "14-day money back guarantee",
  "30_day": "30-day money back guarantee",
  "6_month": "6-month money back guarantee",
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function RefundPolicyDisplay({
  enabled,
  policyType,
  finePrint,
  updatedAt,
  className,
  textColor,
  isPreviewMode = false,
}: RefundPolicyDisplayProps) {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setIsTooltipOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsTooltipOpen(false)
      }
    }

    if (isTooltipOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("keydown", handleEscape)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isTooltipOpen])


  if (!enabled || !policyType) {
    return null
  }

  const policyLabel = POLICY_LABELS[policyType] || policyType
  const hasFinePrint = !!finePrint && finePrint.trim().length > 0
  const isNoRefunds = policyType === "no_refunds"

  // Handle click to toggle tooltip (only opens on click, not hover)
  const handleClick = () => {
    setIsTooltipOpen(!isTooltipOpen)
  }

  // Tooltip content
  const renderTooltipContent = () => {
    // Default content for "No refunds" without fine print
    const defaultNoRefundText = "Due to the nature of digital products, this item cannot be refunded."

    const showFinePrint = hasFinePrint || isNoRefunds

    return (
      <div
        ref={tooltipRef}
        className={cn(
          "absolute z-50 w-[280px] sm:w-[320px] bg-[#1a1a1a] text-white rounded-xl shadow-2xl",
          "transform transition-all duration-200 ease-out origin-top",
          "border border-gray-800/50",
          isTooltipOpen
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "opacity-0 -translate-y-1 scale-95 pointer-events-none",
          // Position: centered below the trigger
          "left-1/2 -translate-x-1/2 top-full mt-2"
        )}
        style={{ pointerEvents: isTooltipOpen ? "auto" : "none" }}
      >
        {/* Arrow pointer */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#1a1a1a] rotate-45 border-l border-t border-gray-800/50" />

        {/* Header */}
        <div className="relative px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Refund Policy</h4>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsTooltipOpen(false)
            }}
            className="p-1 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>

        {/* Content with scroll if needed */}
        <div
          className="px-4 py-3 max-h-[200px] overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#4b5563 transparent',
          }}
        >
          {/* Policy badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-500/20 rounded-lg mb-3">
            <span className="text-xs font-medium text-purple-300">{policyLabel}</span>
          </div>

          {/* Fine print or default text */}
          {showFinePrint && (
            <div className="space-y-2">
              <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                {hasFinePrint ? finePrint : defaultNoRefundText}
              </p>
            </div>
          )}

          {/* Updated date */}
          {updatedAt && (
            <p className="text-[10px] text-gray-500 mt-3 pt-2 border-t border-gray-700/50">
              Last updated: {formatDate(updatedAt)}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative flex justify-center w-full", className)}
      style={{ marginTop: '-0.3px' }}
    >
      {/* Trigger text */}
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "text-xs text-center transition-all duration-200 flex items-center gap-1 group",
          "hover:opacity-80 focus:outline-none focus-visible:underline",
          hasFinePrint || isNoRefunds ? "cursor-pointer underline underline-offset-2 decoration-[0.5px]" : "cursor-default",
          !textColor && "text-muted-foreground hover:text-foreground"
        )}
        style={textColor ? { color: `${textColor}99` } : undefined}
        aria-expanded={isTooltipOpen}
        aria-haspopup="true"
      >
        <span>{policyLabel}</span>
        {(hasFinePrint || isNoRefunds) && (
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform duration-200",
              isTooltipOpen && "rotate-180"
            )}
          />
        )}
      </button>

      {/* Tooltip */}
      {(hasFinePrint || isNoRefunds) && renderTooltipContent()}
    </div>
  )
}
