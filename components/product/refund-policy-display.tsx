"use client"

import { useState } from "react"
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

interface RefundPolicyDisplayProps {
  enabled: boolean
  policyType: string | null
  finePrint: string | null
  updatedAt: string | null
  className?: string
  textColor?: string
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
}: RefundPolicyDisplayProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

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
          className="max-w-xs bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg border-0"
          sideOffset={5}
        >
          <p>Due to the nature of digital products, this item cannot be refunded.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  return (
    <>
      <div className={cn("flex justify-center w-full", className)}>
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

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900">
              Refund Policy
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-purple-50 p-4 border border-purple-100">
              <p className="text-sm font-medium text-purple-900">
                {policyLabel}
              </p>
            </div>

            {finePrint && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Details</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
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
    </>
  )
}
