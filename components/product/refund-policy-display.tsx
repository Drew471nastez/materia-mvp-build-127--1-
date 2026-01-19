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
  const renderPreviewModeModal = () => {
    if (!isModalOpen) return null

    return (
      <div
        className="absolute inset-0 z-50 flex items-center justify-center"
        style={{ pointerEvents: "auto" }}
      >
        {/* Overlay - only within the preview container */}
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => setIsModalOpen(false)}
        />
        {/* Modal content */}
        <div className="relative z-10 w-[calc(100%-2rem)] max-w-md mx-auto bg-white border-0 shadow-2xl p-4 sm:p-6 rounded-lg">
          <button
            onClick={() => setIsModalOpen(false)}
            className="absolute top-4 right-4 opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
          <div className="flex flex-col gap-2 text-left">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              Refund Policy
            </h2>
          </div>
          <div className="space-y-3 sm:space-y-4 pt-2">
            <div className="rounded-lg bg-purple-50 p-3 sm:p-4 border border-purple-100">
              <p className="text-sm font-medium text-purple-900">
                {policyLabel}
              </p>
            </div>

            {finePrint && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Details</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed break-words">
                  {finePrint}
                </p>
              </div>
            )}

            {updatedAt && (
              <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
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
      <div ref={containerRef} className={cn("flex justify-center w-full relative", className)}>
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

      {/* Normal mode: use Dialog portal */}
      {!isPreviewMode && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-md mx-auto bg-white border-0 shadow-2xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl font-semibold text-gray-900">
                Refund Policy
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <div className="rounded-lg bg-purple-50 p-3 sm:p-4 border border-purple-100">
                <p className="text-sm font-medium text-purple-900">
                  {policyLabel}
                </p>
              </div>

              {finePrint && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">Details</h4>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed break-words">
                    {finePrint}
                  </p>
                </div>
              )}

              {updatedAt && (
                <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
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
