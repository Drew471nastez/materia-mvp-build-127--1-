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
  // Theme preset name for automatic color adaptation
  themePreset?: string
  // Whether the current theme is a dark theme
  isDarkTheme?: boolean
  // Theme preset colors for the tooltip (can override defaults)
  themeColors?: {
    tooltipBackground?: string
    tooltipTextColor?: string
    tooltipBorderColor?: string
    accentColor?: string
    accentTextColor?: string
  }
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

// Helper to determine if a color is dark
function isColorDark(color: string): boolean {
  if (!color) return true
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    // Using relative luminance formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance < 0.5
  }
  // For rgb/rgba colors
  if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g)
    if (match && match.length >= 3) {
      const r = parseInt(match[0])
      const g = parseInt(match[1])
      const b = parseInt(match[2])
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      return luminance < 0.5
    }
  }
  return true
}

export function RefundPolicyDisplay({
  enabled,
  policyType,
  finePrint,
  updatedAt,
  className,
  textColor,
  isPreviewMode = false,
  themePreset,
  isDarkTheme = false,
  themeColors,
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

  // Determine tooltip colors based on theme preset
  // For dark themes: use light tooltip
  // For light themes: use dark tooltip
  const getThemeBasedColors = () => {
    // Check if explicit theme colors provided
    if (themeColors?.tooltipBackground) {
      return {
        bg: themeColors.tooltipBackground,
        text: themeColors.tooltipTextColor || "#ffffff",
        border: themeColors.tooltipBorderColor || "rgba(55, 65, 81, 0.5)",
        accent: themeColors.accentColor || "rgba(124, 58, 237, 0.2)",
        accentText: themeColors.accentTextColor || "#c4b5fd"
      }
    }

    // Automatically determine based on isDarkTheme prop or theme preset
    const isThemeDark = isDarkTheme || themePreset === "astrid" || themePreset === "midnight"

    if (isThemeDark) {
      // Dark theme: use a light tooltip for contrast
      return {
        bg: "#ffffff",
        text: "#1a1a1a",
        border: "rgba(229, 231, 235, 1)",
        accent: "rgba(124, 58, 237, 0.1)",
        accentText: "#7c3aed"
      }
    }

    // Light themes: use dark tooltip for contrast
    // Special handling for cream theme
    if (themePreset === "cream") {
      return {
        bg: "#2d2a24",
        text: "#faf4e8",
        border: "rgba(139, 109, 52, 0.3)",
        accent: "rgba(139, 109, 52, 0.2)",
        accentText: "#d4b062"
      }
    }

    // Default dark tooltip for light themes
    return {
      bg: "#1a1a1a",
      text: "#ffffff",
      border: "rgba(55, 65, 81, 0.5)",
      accent: "rgba(124, 58, 237, 0.2)",
      accentText: "#c4b5fd"
    }
  }

  const tooltipColors = getThemeBasedColors()
  const tooltipBg = tooltipColors.bg
  const tooltipText = tooltipColors.text
  const tooltipBorder = tooltipColors.border
  const accentBg = tooltipColors.accent
  const accentText = tooltipColors.accentText

  // Check if tooltip background is dark or light
  const isDarkTooltip = isColorDark(tooltipBg)
  const contentTextColor = isDarkTooltip ? "rgba(209, 213, 219, 1)" : "rgba(75, 85, 99, 1)"
  const mutedTextColor = isDarkTooltip ? "rgba(107, 114, 128, 1)" : "rgba(156, 163, 175, 1)"
  const closeButtonHoverBg = isDarkTooltip ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
  const closeButtonColor = isDarkTooltip ? "rgba(156, 163, 175, 1)" : "rgba(107, 114, 128, 1)"
  const borderDivider = isDarkTooltip ? "rgba(55, 65, 81, 0.5)" : "rgba(229, 231, 235, 1)"

  // Tooltip content
  const renderTooltipContent = () => {
    // Default content for "No refunds" without fine print
    const defaultNoRefundText = "Due to the nature of digital products, this item cannot be refunded."

    const showFinePrint = hasFinePrint || isNoRefunds

    return (
      <div
        ref={tooltipRef}
        className={cn(
          "absolute z-50 w-[280px] sm:w-[320px] rounded-xl shadow-2xl",
          "transform transition-all duration-200 ease-out origin-top",
          isTooltipOpen
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "opacity-0 -translate-y-1 scale-95 pointer-events-none",
          // Position: centered below the trigger
          "left-1/2 -translate-x-1/2 top-full mt-2"
        )}
        style={{
          pointerEvents: isTooltipOpen ? "auto" : "none",
          backgroundColor: tooltipBg,
          color: tooltipText,
          border: `1px solid ${tooltipBorder}`,
        }}
      >
        {/* Arrow pointer */}
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45"
          style={{
            backgroundColor: tooltipBg,
            borderLeft: `1px solid ${tooltipBorder}`,
            borderTop: `1px solid ${tooltipBorder}`,
          }}
        />

        {/* Header */}
        <div
          className="relative px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${borderDivider}` }}
        >
          <h4 className="text-sm font-semibold" style={{ color: tooltipText }}>Refund Policy</h4>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsTooltipOpen(false)
            }}
            className="p-1 rounded-full transition-colors"
            style={{ backgroundColor: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = closeButtonHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" style={{ color: closeButtonColor }} />
          </button>
        </div>

        {/* Content with scroll if needed */}
        <div
          className="px-4 py-3 max-h-[200px] overflow-y-auto overscroll-contain"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: `${mutedTextColor} transparent`,
          }}
        >
          {/* Policy badge */}
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg mb-3"
            style={{ backgroundColor: accentBg }}
          >
            <span className="text-xs font-medium" style={{ color: accentText }}>{policyLabel}</span>
          </div>

          {/* Fine print or default text */}
          {showFinePrint && (
            <div className="space-y-2">
              <p
                className="text-xs leading-relaxed whitespace-pre-wrap break-words"
                style={{ color: contentTextColor }}
              >
                {hasFinePrint ? finePrint : defaultNoRefundText}
              </p>
            </div>
          )}

          {/* Updated date */}
          {updatedAt && (
            <p
              className="text-[10px] mt-3 pt-2"
              style={{
                color: mutedTextColor,
                borderTop: `1px solid ${borderDivider}`,
              }}
            >
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
