"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"
import { createClient } from "@/lib/supabase/client"
import { switchBusiness, type SwitchedTo } from "@/lib/businesses/switch-client"
import { NewBusinessScreen } from "@/components/app/business-switch-screen"

/**
 * A SECOND BUSINESS (lib/businesses) is always a creator: it goes straight
 * into the creator onboarding, never the creator or buyer question, and the
 * onboarding shows the way back to the first business. Null for everyone
 * else, and for any failure, so the page behaves exactly as it did.
 */
async function firstBusinessIfSecond(): Promise<SwitchedTo | null> {
  try {
    const { data } = await createClient().auth.getSession()
    const token = data.session?.access_token
    const res = await fetch("/api/businesses", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" })
    if (!res.ok) return null
    const body = (await res.json()) as { businesses?: Array<SwitchedTo & { role: string; current: boolean }> }
    const list = body.businesses ?? []
    if (list.find((b) => b.current)?.role !== "member") return null
    const first = list.find((b) => b.role === "owner")
    /* Its photo too: the switch screen's bar draws the business it goes back to (components/app/shell-header-still). */
    return first ? { userId: first.userId, name: first.name, handle: first.handle ?? null, avatarUrl: first.avatarUrl ?? null, ready: first.ready !== false } : null
  } catch {
    return null
  }
}

/**
 * ===========================================================================
 *  A NEW BUSINESS, BEING SET UP
 * ===========================================================================
 * All that is left of /signup/success. It used to be the "I'm a creator" or
 * "I'm a buyer" question every new account had to answer; that question is
 * gone (a new account is a buyer, and Sell on Storelib or Become a seller at
 * /sell is how anybody becomes a seller), and page.tsx beside this sends
 * every other arrival on with a server redirect. What remains is New
 * business in the account menu (lib/businesses), which arrives with
 * `?business=new` on the screen the menu ended on and goes straight into
 * the creator onboarding with the way back to the first business.
 */
export function SuccessContent() {
  const searchParams = useSearchParams()
  const [showCreatorOnboarding, setShowCreatorOnboarding] = useState(false)
  const stripeSuccess = searchParams.get("stripe_success")
  const stripeTier = searchParams.get("tier") as "growth" | "pro" | null
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [firstBusiness, setFirstBusiness] = useState<SwitchedTo | null>(null)
  /* Arrived from New business in the account menu (lib/businesses/switch-client createBusiness); page.tsx sends everybody else on. */
  const newBusiness = true

  // Check if user already completed onboarding - database is the source of truth
  // Uses auth state listener + retry to handle post-OAuth session delays.
  // Skip entirely while native OAuth callback is in progress — native-oauth.ts
  // owns the full flow and will navigate when done.
  useEffect(() => {
    // Guard: if native-oauth.ts is handling a deep-link callback, don't
    // run any auth checks or redirects — the handler owns navigation.
    try {
      if (sessionStorage.getItem("nativeAuthInProgress") === "1") return
    } catch {}

    const supabase = createClient()
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let running = false

    // Safety timeout: if auth check stalls for any reason, show the page
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        setIsCheckingAuth(false)
        setShowCreatorOnboarding(true)
      }
    }, 8000)

    const checkOnboardingStatus = async (retryCount = 0) => {
      if (cancelled || running) return
      running = true

      try {
        const { data } = await supabase.auth.getUser()
        const user = data?.user

        if (!user) {
          running = false
          // Session might not be ready yet after OAuth redirect
          // Retry up to 5 times with 1s delay before giving up
          if (retryCount < 5) {
            retryTimer = setTimeout(() => checkOnboardingStatus(retryCount + 1), 1000)
            return
          }
          // After retries, try a hard reload first to force-refresh the session
          if (!cancelled) {
            const reloadAttempted = sessionStorage.getItem("storelib_success_reload")
            if (!reloadAttempted) {
              sessionStorage.setItem("storelib_success_reload", "1")
              window.location.reload()
              return
            }
            sessionStorage.removeItem("storelib_success_reload")
            window.location.href = "/login"
          }
          return
        }

        if (cancelled) return

        // Gate: redirect to verify page if email not yet verified
        const { data: verifyProfile } = await supabase
          .from("profiles")
          .select("email_verified")
          .eq("id", user.id)
          .maybeSingle()

        if (verifyProfile && !verifyProfile.email_verified) {
          window.location.replace(
            `/signup/verify?userId=${user.id}&email=${encodeURIComponent(user.email || "")}`
          )
          return
        }

        if (cancelled) return

        // Check database for creator record with onboarding completed
        const { data: creator } = await supabase
          .from("creators")
          .select("onboarding_completed")
          .eq("user_id", user.id)
          .maybeSingle()

        if (cancelled) return

        if (creator?.onboarding_completed === true) {
          window.location.replace("/app")
          return
        }

        const first = await firstBusinessIfSecond()
        if (cancelled) return
        if (first) setFirstBusiness(first)
        /* A new business goes straight into the onboarding, with its way back when there is a first one to go back to. */
        setIsCheckingAuth(false)
        setShowCreatorOnboarding(true)
        return
      } catch {
        // On any unexpected error, open the setup rather than spinning forever
        if (!cancelled) {
          setIsCheckingAuth(false)
          setShowCreatorOnboarding(true)
        }
      } finally {
        running = false
      }
    }

    // Listen for auth state changes (handles delayed session after OAuth).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      try {
        if (sessionStorage.getItem("nativeAuthInProgress") === "1") return
      } catch {}
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        checkOnboardingStatus()
      }
    })

    // Also try immediately
    checkOnboardingStatus()

    return () => {
      cancelled = true
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreatorOnboardingComplete = () => {
    // Onboarding modal has saved everything to database
    // The modal handles navigation via window.location.replace("/app")
    setShowCreatorOnboarding(false)
  }

  /*
    A NEW BUSINESS ARRIVES ON THE SCREEN IT LEFT. The account menu's last
    frame was "Opening your new business" on plain white (components/app/
    business-switch-screen), and this page's first HTML draws the same
    (SignupSuccessPage's fallback below), then keeps it while the session is
    found. When the setup opens, its first step fades in over the same white
    as the spinner and the line fade out under it: no frame of the welcome
    choice, which a new business never makes, and no second spinner.
  */
  const switchBack = firstBusiness
    ? { name: firstBusiness.name, onSwitch: () => switchBusiness(firstBusiness.userId, "/app", { arrival: { name: firstBusiness.name, photo: firstBusiness.avatarUrl }, business: firstBusiness }) }
    : null
  const settled = !isCheckingAuth
  if (newBusiness && (!settled || showCreatorOnboarding)) {
    return (
      <>
        <NewBusinessScreen leaving={settled && showCreatorOnboarding} />
        <CreatorOnboardingModal
          open={settled && showCreatorOnboarding}
          onClose={handleCreatorOnboardingComplete}
          resumeFromStripe={stripeSuccess === "1" && stripeTier ? { planId: stripeTier } : null}
          switchBack={switchBack}
        />
      </>
    )
  }

  return <NewBusinessScreen />
}
