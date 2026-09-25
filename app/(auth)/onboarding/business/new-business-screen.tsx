"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { StorelibMark } from "@/components/storelib-mark"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { createBusiness } from "@/lib/businesses/switch-client"
import { cn } from "@/lib/utils"

/**
 * The one screen before a second business's onboarding. Full screen at every
 * width, inside the safe area in the app, in the onboarding's own plain look:
 * the mark, what it is in one sentence, and the button that makes it.
 */
export function NewBusinessScreen({
  currentName,
  blocked,
}: {
  /** The business the person is in now, for the way back. */
  currentName: string | null
  /** Why a new business cannot be started from here, if it cannot. */
  blocked: "full" | "second" | null
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (creating) return
    setError(null)
    setCreating(true)
    try {
      await createBusiness()
    } catch (e) {
      setCreating(false)
      setError(e instanceof Error ? e.message : "The business could not be created. Try again.")
    }
  }

  const back = () => router.push("/app")
  const backLabel = currentName ? `Back to ${currentName}` : "Back to the dashboard"

  return (
    <main
      data-new-business=""
      className="relative flex min-h-[100dvh] w-full flex-col bg-white"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      <div className="flex h-14 shrink-0 items-center px-3 sm:h-16 sm:px-6">
        <button
          type="button"
          onClick={back}
          disabled={creating}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[14px] font-medium text-[#4b5563] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <span className="max-w-[220px] truncate">{backLabel}</span>
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-[440px] text-center">
          <span className="mx-auto block h-12 w-12">
            <StorelibMark className="h-12 w-12" />
          </span>

          {blocked ? (
            <>
              <h1 className="mt-6 text-[26px] font-bold leading-tight tracking-tight text-[#1a1a2e] sm:text-[30px]">
                {blocked === "full" ? "You have two businesses" : "Switch to your first business"}
              </h1>
              <p className="mx-auto mt-2.5 max-w-[380px] text-[15px] leading-[1.55] text-[#6b7280]">
                {blocked === "full"
                  ? "One login can run two. Switch between them from the account menu."
                  : "A new business is started from your first one. Open it from the account menu, then choose New business."}
              </p>
              <button type="button" onClick={back} className={cn(secondaryDepth, "mt-7 h-12 w-full rounded-xl text-[15px]")}>
                Back to the dashboard
              </button>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-[26px] font-bold leading-tight tracking-tight text-[#1a1a2e] sm:text-[30px]">
                Start another business
              </h1>
              <p className="mx-auto mt-2.5 max-w-[380px] text-[15px] leading-[1.55] text-[#6b7280]">
                It gets its own creator page, website, OnePage, products, orders, emails and payouts. You keep one login
                and switch between them from the account menu.
              </p>
              <button
                type="button"
                onClick={create}
                disabled={creating}
                data-create-business=""
                className={cn(primaryDepth, "mt-7 h-12 w-full gap-2 rounded-xl text-[15px] disabled:cursor-wait disabled:opacity-80")}
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {creating ? "Creating your business" : "Create business"}
              </button>
              {error && (
                <p role="alert" className="mt-3 text-[14px] text-[#b42318]">
                  {error}
                </p>
              )}
              <p className="mt-4 text-[13px] leading-[1.5] text-[#9ca3af]">
                Next you name it and set it up, the same way you set up your first.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
