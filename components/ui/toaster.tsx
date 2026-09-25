"use client"

import { useEffect, useState } from "react"
import { CircleAlert, CircleCheck } from "lucide-react"
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
        /* A white mark on the dark box, drawn in the words' own colour: a
           circled check when something was done, a circled bar when it was
           not. Never a green dot, never a red box. */
        const Icon = variant === "destructive" ? CircleAlert : CircleCheck
        return (
          <Toast key={id} variant={variant} data-toast="" {...props}>
            <Icon aria-hidden data-toast-icon="" className="h-[18px] w-[18px] shrink-0 text-white md:h-5 md:w-5" strokeWidth={2} />
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
