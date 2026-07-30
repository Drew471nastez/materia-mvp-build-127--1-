"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLocale } from "@/components/locale-provider"

interface AppleSignInButtonProps {
  isLoading?: boolean
  disabled?: boolean
  onClick: () => void
}

export function AppleSignInButton({ isLoading, disabled, onClick }: AppleSignInButtonProps) {
  const { t } = useLocale()
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled || isLoading}
      className="h-12 w-full rounded-lg border-neutral-200 bg-white text-[15px] font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-80 transition-opacity"
    >
      {isLoading ? (
        <Loader2 className="mr-3 h-5 w-5 animate-spin text-neutral-500" />
      ) : (
        // Apple logo — standard SVG path, 24×24 viewBox, filled with currentColor
        <svg
          className="mr-3 h-5 w-5 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zm3.378-3.066c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.702z" />
        </svg>
      )}
      {isLoading ? t("auth.connecting") : t("auth.continue_with_apple")}
    </Button>
  )
}
