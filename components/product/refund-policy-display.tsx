"use client"

import { useState, useRef, useEffect, useCallback } from "react"
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
  // Background color of the page/container (for contrast detection)
  backgroundColor?: string
  // Theme preset colors for the tooltip (can override defaults)
  themeColors?: {
    tooltipBackground?: string
    tooltipTextColor?: string
    tooltipBorderColor?: string
    accentColor?: string
    accentTextColor?: string
  }
  // For mobile view detection
  isMobile?: boolean
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
    // Handle shorthand hex
    const fullHex = hex.length === 3
      ? hex.split('').map(c => c + c).join('')
      : hex
    const r = parseInt(fullHex.substring(0, 2), 16)
    const g = parseInt(fullHex.substring(2, 4), 16)
    const b = parseInt(fullHex.substring(4, 6), 16)
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
  // Named colors - add common ones
  const darkColors = ['black', 'darkblue', 'darkgreen', 'darkred', 'navy', 'maroon', 'purple']
  const lightColors = ['white', 'ivory', 'beige', 'cream', 'lightyellow', 'lightgray', 'lightgrey']
  if (darkColors.includes(color.toLowerCase())) return true
  if (lightColors.includes(color.toLowerCase())) return false
  return true
}

// Known dark theme presets
const DARK_THEME_PRESETS = ['astrid', 'midnight', 'dark', 'noir', 'obsidian']
const LIGHT_THEME_PRESETS = ['default', 'cream', 'minimal', 'clean', 'light']

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
  backgroundColor,
  themeColors,
  isMobile = false,
}: RefundPolicyDisplayProps) {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState<{
    top?: string
    bottom?: string
    left?: string
    right?: string
    transform?: string
    arrowPosition?: "top" | "bottom"
  }>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Calculate tooltip position to avoid overflow
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const padding = 12
    const tooltipWidth = Math.min(320, viewportWidth - padding * 2)
    const tooltipHeight = tooltipRect.height || 250

    const newPosition: typeof tooltipPosition = {}

    // Check if we're on mobile or small screen
    const isSmallScreen = isMobile || viewportWidth < 640

    if (isSmallScreen) {
      // On mobile, position centered on screen with fixed positioning
      newPosition.left = "50%"
      newPosition.top = "50%"
      newPosition.transform = "translate(-50%, -50%)"
      newPosition.arrowPosition = "top"
    } else {
      // Desktop positioning
      // Vertical: check if there's enough space below
      const spaceBelow = viewportHeight - triggerRect.bottom - padding
      const spaceAbove = triggerRect.top - padding

      if (spaceBelow >= tooltipHeight) {
        // Position below
        newPosition.top = "100%"
        newPosition.bottom = "auto"
        newPosition.arrowPosition = "top"
      } else if (spaceAbove >= tooltipHeight) {
        // Position above
        newPosition.top = "auto"
        newPosition.bottom = "100%"
        newPosition.arrowPosition = "bottom"
      } else {
        // Not enough space either way, use whichever has more space
        if (spaceBelow >= spaceAbove) {
          newPosition.top = "100%"
          newPosition.bottom = "auto"
          newPosition.arrowPosition = "top"
        } else {
          newPosition.top = "auto"
          newPosition.bottom = "100%"
          newPosition.arrowPosition = "bottom"
        }
      }

      // Horizontal: center by default, adjust if overflows
      const triggerCenterX = triggerRect.left + triggerRect.width / 2
      const tooltipHalfWidth = tooltipWidth / 2

      if (triggerCenterX - tooltipHalfWidth < padding) {
        // Would overflow left, align to left edge
        newPosition.left = `${-triggerRect.left + padding}px`
        newPosition.right = "auto"
        newPosition.transform = "none"
      } else if (triggerCenterX + tooltipHalfWidth > viewportWidth - padding) {
        // Would overflow right, align to right edge
        newPosition.left = "auto"
        newPosition.right = `${-(viewportWidth - triggerRect.right - padding)}px`
        newPosition.transform = "none"
      } else {
        // Center normally
        newPosition.left = "50%"
        newPosition.right = "auto"
        newPosition.transform = "translateX(-50%)"
      }
    }

    setTooltipPosition(newPosition)
  }, [isMobile])

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
      // Calculate position when opening
      requestAnimationFrame(calculatePosition)
      window.addEventListener("resize", calculatePosition)
      window.addEventListener("scroll", calculatePosition, true)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
      window.removeEventListener("resize", calculatePosition)
      window.removeEventListener("scroll", calculatePosition, true)
    }
  }, [isTooltipOpen, calculatePosition])


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

  // Determine if the current UI is dark based on multiple factors
  const determineIfDark = (): boolean => {
    // Explicit isDarkTheme prop takes priority
    if (isDarkTheme) return true

    // Check theme preset against known dark/light presets
    if (themePreset) {
      if (DARK_THEME_PRESETS.includes(themePreset.toLowerCase())) return true
      if (LIGHT_THEME_PRESETS.includes(themePreset.toLowerCase())) return false
    }

    // Check background color if provided
    if (backgroundColor) {
      return isColorDark(backgroundColor)
    }

    // Default to light theme
    return false
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

    // Automatically determine based on theme detection
    const isThemeDark = determineIfDark()

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

  // Check if we're on mobile
  const isSmallScreen = isMobile || (typeof window !== "undefined" && window.innerWidth < 640)

  // Tooltip content
  const renderTooltipContent = () => {
    // Default content for "No refunds" without fine print
    const defaultNoRefundText = "Due to the nature of digital products, this item cannot be refunded."

    const showFinePrint = hasFinePrint || isNoRefunds

    const arrowPosition = tooltipPosition.arrowPosition || "top"

    return (
      <>
        {/* Backdrop for mobile */}
        {isSmallScreen && isTooltipOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-[9998] animate-in fade-in-0 duration-150"
            onClick={() => setIsTooltipOpen(false)}
          />
        )}
        <div
          ref={tooltipRef}
          className={cn(
            "z-[9999] w-[280px] sm:w-[320px] rounded-xl shadow-2xl",
            "transition-all duration-200 ease-out",
            isTooltipOpen
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-95 pointer-events-none",
            isSmallScreen ? "fixed" : "absolute",
            arrowPosition === "top" ? "origin-top" : "origin-bottom"
          )}
          style={{
            pointerEvents: isTooltipOpen ? "auto" : "none",
            backgroundColor: tooltipBg,
            color: tooltipText,
            border: `1px solid ${tooltipBorder}`,
            ...(isSmallScreen ? {
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "70vh",
            } : {
              top: tooltipPosition.top,
              bottom: tooltipPosition.bottom,
              left: tooltipPosition.left,
              right: tooltipPosition.right,
              transform: tooltipPosition.transform,
              marginTop: arrowPosition === "top" ? "10px" : undefined,
              marginBottom: arrowPosition === "bottom" ? "10px" : undefined,
            }),
          }}
        >
          {/* Arrow pointer - only show on desktop */}
          {!isSmallScreen && (
            <div
              className={cn(
                "absolute left-1/2 -translate-x-1/2 w-4 h-4 rotate-45",
                arrowPosition === "top" ? "-top-2" : "-bottom-2"
              )}
              style={{
                backgroundColor: tooltipBg,
                borderLeft: arrowPosition === "top" ? `1px solid ${tooltipBorder}` : "none",
                borderTop: arrowPosition === "top" ? `1px solid ${tooltipBorder}` : "none",
                borderRight: arrowPosition === "bottom" ? `1px solid ${tooltipBorder}` : "none",
                borderBottom: arrowPosition === "bottom" ? `1px solid ${tooltipBorder}` : "none",
              }}
            />
          )}

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
      </>
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
        ref={triggerRef}
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
