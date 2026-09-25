"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Check } from "lucide-react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"

/** The shell's phone width (the nav pill's breakpoint), where toasts sit at the top. */
const PHONE = "(max-width: 767px)"

/**
 * Which way a toast is swiped away: up on a phone, where it hangs under the
 * header the way a notification banner does, and to the right on a computer,
 * where it sits at the right edge. See components/ui/toast.tsx for the box.
 */
function useSwipeDirection(): "up" | "right" {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE)
    if (!mq) return
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener?.("change", sync)
    return () => mq.removeEventListener?.("change", sync)
  }, [])
  return phone ? "up" : "right"
}

export function Toaster() {
  const { toasts } = useToast()
  const swipeDirection = useSwipeDirection()

  return (
    <ToastProvider duration={2800} swipeDirection={swipeDirection}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const Icon = variant === "destructive" ? AlertCircle : Check
        return (
          <Toast key={id} variant={variant} data-toast="" {...props}>
            <span
              className={
                variant === "destructive"
                  ? "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30 md:h-5 md:w-5"
                  : "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500 md:h-5 md:w-5"
              }
            >
              <Icon className="h-3 w-3 text-white" strokeWidth={3.5} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
