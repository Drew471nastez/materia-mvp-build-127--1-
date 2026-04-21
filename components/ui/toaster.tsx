"use client"

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

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={2800} swipeDirection="right">
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const Icon = variant === "destructive" ? AlertCircle : Check
        return (
          <Toast key={id} variant={variant} {...props}>
            <span
              className={
                variant === "destructive"
                  ? "shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-white/15"
                  : "shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20"
              }
            >
              <Icon
                className={
                  variant === "destructive"
                    ? "h-3 w-3 text-white"
                    : "h-3 w-3 text-emerald-400"
                }
                strokeWidth={3}
              />
            </span>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              {title && <ToastTitle className="truncate">{title}</ToastTitle>}
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
