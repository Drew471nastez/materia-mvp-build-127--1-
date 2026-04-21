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
                  ? "shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30"
                  : "shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"
              }
            >
              <Icon className="h-3 w-3 text-white" strokeWidth={3.5} />
            </span>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
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
