"use client"

import { Toaster } from "sonner"

/**
 * The toasts of the website builder's editor and code editor (sonner, which
 * app/website-builder/layout.tsx mounts; everything under /app uses
 * components/ui/toaster.tsx instead).
 *
 * On a phone (sonner's own 600px) a toast runs between 16px gutters and
 * stands clear of the home indicator, which sonner's bottom offset of 16px
 * did not; the title is one 14px line and any detail two 13px lines at most,
 * the same as the app's own toasts, with 12px above and below rather than
 * 16. Sonner swipes them away by itself.
 * Measured by scripts/check-toasts.mjs.
 */
export function EditorToaster() {
  return (
    <Toaster
      position="bottom-right"
      mobileOffset={{ left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
      toastOptions={{
        classNames: {
          /* Sonner's own 16px all round is unlayered CSS, so the phone's tighter padding has to be marked important. */
          toast: "max-[600px]:py-3!",
          content: "min-w-0",
          title: "truncate text-[14px]",
          description: "line-clamp-2 text-[13px]",
        },
      }}
    />
  )
}
