"use client"

/**
 * ===========================================================================
 *  THE REFUND LINE UNDER THE BUY BUTTON
 * ===========================================================================
 * "No refunds allowed", or the length of the guarantee, in small type under
 * the buy button, and the creator's fine print one press away.
 *
 * It opened a hand-positioned box: centred in the middle of the screen with
 * a dimmed page behind it on a phone, and on a computer a card that worked
 * out its own position on every scroll, with a violet pill inside repeating
 * the line that had just been pressed. Three pieces of hand-made geometry
 * for two sentences of text.
 *
 * Now it is Storelib's two shapes for "a little more about this":
 *
 *   A COMPUTER   a small white popover anchored to the line, which Radix
 *                places and keeps on screen, opening on opacity and a 4px
 *                rise, closing on a press outside or Escape.
 *   A PHONE      the shared bottom sheet (components/ui/bottom-sheet), the
 *                one every sheet in the product uses: it follows the finger
 *                and is pulled down to close.
 *
 * Which one is decided by the screen, never by `isMobile`: that prop is the
 * store builder's phone frame, which sits inside a desktop window where a
 * bottom sheet would open across the whole editor.
 *
 * The props are the ones the product page and the builder already pass, so
 * neither caller changes. `textColor` still colours the line to match the
 * buy card; a dark scheme gets a dark popover.
 */

import { tint } from "@/lib/appearance/site-paint"
import { useSitePaint } from "@/lib/appearance/site-paint-context"
import { useEffect, useState } from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { ChevronDown } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"

interface RefundPolicyDisplayProps {
  enabled: boolean
  policyType: string | null
  finePrint: string | null
  updatedAt: string | null
  className?: string
  textColor?: string
  isPreviewMode?: boolean
  /** The scheme's name. Not read for "dark": `isDarkTheme` answers that, from the scheme's colours. */
  themePreset?: string
  isDarkTheme?: boolean
  /** Background colour of the page, for the same question. */
  backgroundColor?: string
  /** Kept for the callers that pass it; the popover has one look per mode. */
  themeColors?: {
    tooltipBackground?: string
    tooltipTextColor?: string
    tooltipBorderColor?: string
    accentColor?: string
    accentTextColor?: string
  }
  /** The builder's phone frame. Does not decide sheet or popover; see above. */
  isMobile?: boolean
}

const POLICY_LABELS: Record<string, string> = {
  no_refunds: "No refunds allowed",
  "7_day": "7-day money back guarantee",
  "14_day": "14-day money back guarantee",
  "30_day": "30-day money back guarantee",
  "6_month": "6-month money back guarantee",
}

const NO_REFUNDS_LINE = "Because this is a digital product, it can't be refunded once it's yours."


function formatDate(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
}

function isDarkColor(color?: string): boolean {
  const hex = color?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (!hex) return false
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b < 128
}

/** The phone question, asked of the screen. False on the server. */
function usePhone() {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 639px)")
    if (!mq) return
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener?.("change", sync)
    return () => mq.removeEventListener?.("change", sync)
  }, [])
  return phone
}

export function RefundPolicyDisplay({
  enabled,
  policyType,
  finePrint,
  updatedAt,
  className,
  textColor,
  isDarkTheme = false,
  backgroundColor,
}: RefundPolicyDisplayProps) {
  const [open, setOpen] = useState(false)
  const phone = usePhone()
  /* Round 31: on Storelib's own product page these follow the person's look (lib/appearance/site-paint). */
  const paint = useSitePaint()

  if (!enabled || !policyType) return null

  const label = POLICY_LABELS[policyType] || policyType
  const hasFinePrint = !!finePrint && finePrint.trim().length > 0
  const isNoRefunds = policyType === "no_refunds"
  const body = hasFinePrint ? finePrint!.trim() : isNoRefunds ? NO_REFUNDS_LINE : null
  const updated = updatedAt ? formatDate(updatedAt) : ""
  /* `isDarkTheme` is the scheme's own answer, from its page colour
     (lib/store-builder/scheme-tone), which every caller passes; no list of
     names here, so a new dark scheme is dark on this line too. */
  const dark = isDarkTheme || isDarkColor(backgroundColor)

  const lineStyle = textColor ? { color: tint(paint(textColor, "ink"), "a6") } : undefined

  /* A guarantee with nothing more to say is a line, not a control. */
  if (!body) {
    return (
      <div className={cn("flex w-full justify-center", className)}>
        <p className={cn("text-center text-[12.5px] leading-5", !textColor && "text-muted-foreground")} style={lineStyle}>
          {label}
        </p>
      </div>
    )
  }

  const trigger = (
    <button
      type="button"
      data-refund-trigger
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={phone ? () => setOpen(true) : undefined}
      className={cn(
        "group inline-flex items-center gap-1 rounded-md px-1 text-center text-[12.5px] leading-5 outline-none",
        "underline decoration-current/35 decoration-dotted underline-offset-[3px] transition-[color,text-decoration-color] duration-150",
        "hover:decoration-current/70 focus-visible:ring-2 focus-visible:ring-current/25 [-webkit-tap-highlight-color:transparent]",
        !textColor && "text-muted-foreground hover:text-foreground",
      )}
      style={lineStyle}
    >
      <span>{label}</span>
      <ChevronDown
        aria-hidden
        className={cn("h-3 w-3 shrink-0 opacity-70 transition-transform duration-200 ease-out", open && "rotate-180")}
      />
    </button>
  )

  const details = (
    <>
      <p className="whitespace-pre-wrap break-words">{body}</p>
      {updated && <p data-refund-updated className="mt-3 text-[12px] opacity-70">Updated {updated}</p>}
    </>
  )

  if (phone) {
    return (
      <div className={cn("flex w-full justify-center", className)}>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={label} label="Refund policy">
          <div data-refund-sheet className="px-5 pb-5 pt-1 text-[15px] leading-6 text-[#4b5563]">
            {details}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 h-12 w-full rounded-xl bg-[#111113] text-[15px] font-medium text-white transition-transform duration-150 active:scale-[0.98]"
            >
              Got it
            </button>
          </div>
        </BottomSheet>
      </div>
    )
  }

  return (
    <div className={cn("flex w-full justify-center", className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            data-refund-popover
            side="bottom"
            align="center"
            sideOffset={8}
            collisionPadding={12}
            className={cn(
              "refund-popover z-[2147483640] w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border p-4 text-left text-[13px] leading-5 outline-none",
              dark
                ? "border-white/10 bg-[#18181b] text-[#d4d4d8] shadow-[0_1px_2px_rgba(0,0,0,0.3),0_16px_40px_-12px_rgba(0,0,0,0.6)]"
                : "border-[#e5e7eb]/80 bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-12px_rgba(15,23,42,0.28)]",
            )}
          >
            <p className={cn("mb-1.5 text-[13px] font-semibold", dark ? "text-white" : "text-[#1a1a2e]")}>{label}</p>
            <div className="max-h-[min(260px,50vh)] overflow-y-auto overscroll-contain">{details}</div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  )
}
