"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { X } from "lucide-react"

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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close modal on escape key in preview mode
  useEffect(() => {
    if (!isPreviewMode || !isModalOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsModalOpen(false)
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isPreviewMode, isModalOpen])

  if (!enabled || !policyType) {
    return null
  }

  const policyLabel = POLICY_LABELS[policyType] || policyType
  const hasFinePrint = !!finePrint && finePrint.trim().length > 0
  const isClickable = hasFinePrint
  const isNoRefunds = policyType === "no_refunds"

  const handleClick = () => {
    if (isClickable) {
      setIsModalOpen(true)
    }
  }

  // For "No refunds allowed" without fine print - show tooltip
  const renderNoRefundsWithTooltip = () => (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "text-xs text-center cursor-default",
              !textColor && "text-muted-foreground"
            )}
            style={textColor ? { color: `${textColor}99` } : undefined}
          >
            {policyLabel}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-xs bg-black text-white text-xs px-3 py-2 rounded-lg shadow-lg border-0"
          sideOffset={5}
        >
          <p>Due to the nature of digital products, this item cannot be refunded.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  // Preview mode modal - renders inline within the preview canvas only
  // Responsive: mobile-first with compact spacing
  const renderPreviewModeModal = () => {
    if (!isModalOpen) return null

    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4"
        style={{ pointerEvents: "auto" }}
      >
        {/* Overlay - covers entire viewport */}
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsModalOpen(false)}
        />
        {/* Modal content - compact responsive popup */}
        <div className="relative z-10 w-full max-w-[300px] sm:max-w-[340px] mx-auto bg-white border-0 shadow-2xl rounded-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
          {/* Header with close button - compact */}
          <div className="flex items-center justify-between px-4 py-2.5 sm:px-4 sm:py-3 border-b border-gray-100">
            <h2 className="text-sm sm:text-base font-semibold text-gray-900">
              Refund Policy
            </h2>
            <button
              onClick={() => setIsModalOpen(false)}
              className="flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              aria-label="Close"
            >
              <X className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-600" />
            </button>
          </div>

          {/* Body content - compact padding and spacing */}
          <div className="px-4 py-2.5 sm:px-4 sm:py-3 space-y-2.5 max-h-[50vh] sm:max-h-[60vh] overflow-y-auto">
            <div className="rounded-lg bg-purple-50 px-3 py-2 sm:px-3 sm:py-2.5 border border-purple-100">
              <p className="text-xs sm:text-sm font-medium text-purple-900">
                {policyLabel}
              </p>
            </div>

            {finePrint && (
              <div className="space-y-1 sm:space-y-1.5">
                <h4 className="text-xs font-medium text-gray-700">Details</h4>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed break-words">
                  {finePrint}
                </p>
              </div>
            )}

            {updatedAt && (
              <p className="text-[10px] text-gray-400 pt-1.5 sm:pt-2 border-t border-gray-100">
                Last updated: {formatDate(updatedAt)}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div ref={containerRef} className={cn("flex justify-center w-full relative", className)} style={{ marginTop: '-0.3px' }}>
        {isClickable ? (
          <button
            onClick={handleClick}
            className={cn(
              "text-xs text-center transition-colors underline hover:opacity-80 focus:outline-none focus-visible:underline",
              !textColor && "text-muted-foreground hover:text-foreground"
            )}
            style={textColor ? { color: `${textColor}99` } : undefined}
          >
            {policyLabel}
          </button>
        ) : isNoRefunds ? (
          renderNoRefundsWithTooltip()
        ) : (
          <span
            className={cn(
              "text-xs text-center",
              !textColor && "text-muted-foreground"
            )}
            style={textColor ? { color: `${textColor}99` } : undefined}
          >
            {policyLabel}
          </span>
        )}
      </div>

      {/* Preview mode: render inline modal within preview canvas */}
      {isPreviewMode && renderPreviewModeModal()}

      {/* Normal mode: use Dialog portal - compact responsive for desktop and mobile */}
      {!isPreviewMode && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="w-[calc(100vw-24px)] max-w-[300px] sm:max-w-[340px] mx-auto bg-white border-0 shadow-2xl p-0 rounded-xl overflow-hidden">
            {/* Header with title - compact */}
            <DialogHeader className="px-4 py-2.5 sm:px-4 sm:py-3 pb-0">
              <DialogTitle className="text-sm sm:text-base font-semibold text-gray-900">
                Refund Policy
              </DialogTitle>
            </DialogHeader>
            {/* Body content - compact padding and spacing */}
            <div className="px-4 py-2.5 sm:px-4 sm:py-3 pt-1.5 space-y-2.5 max-h-[50vh] sm:max-h-[60vh] overflow-y-auto">
              <div className="rounded-lg bg-purple-50 px-3 py-2 sm:px-3 sm:py-2.5 border border-purple-100">
                <p className="text-xs sm:text-sm font-medium text-purple-900">
                  {policyLabel}
                </p>
              </div>

              {finePrint && (
                <div className="space-y-1 sm:space-y-1.5">
                  <h4 className="text-xs font-medium text-gray-700">Details</h4>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed break-words">
                    {finePrint}
                  </p>
                </div>
              )}

              {updatedAt && (
                <p className="text-[10px] text-gray-400 pt-1.5 sm:pt-2 border-t border-gray-100">
                  Last updated: {formatDate(updatedAt)}
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
