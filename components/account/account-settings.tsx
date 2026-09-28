"use client"

/**
 * ===========================================================================
 *  THE PROFILE'S SETTINGS
 * ===========================================================================
 * /account/settings, the Settings tab of the buyer's profile (components/
 * account/account-hub.tsx) and where its Edit profile goes. This was the
 * whole of /account once; the owner asked for a profile there instead, "not
 * directly changing the name or profile photo", so the changing lives here:
 *
 *   PROFILE         photo (changed in place, through the one photo route:
 *                   components/app/settings/profile-photo) and name
 *   SIGN IN         email (a code to each address, the same flow as the
 *                   seller's settings) and password (change it, or set one
 *                   on an account that has only ever used Google or Apple)
 *   PREFERENCES     language, the newsletter, recommendations on Explore
 *   LOG OUT         and, last and quiet, deleting the account
 *
 * What was here about the library and selling is the Overview's now
 * (components/account/account-overview.tsx). The cards are /app Settings'
 * cards (the same white, hairline and radius, the same switch and password
 * card), so an account reads the same on both sides of Storelib.
 * /library/settings redirects here.
 */

import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { ProfilePhoto } from "@/components/app/settings/profile-photo"
import {
  EmailChangeFlow,
  PasswordCard,
  PrivacyRow,
  Saved,
  Switch,
  savePreference,
  useSavedSwitch,
} from "@/components/app/settings/account-panels"
import { LanguageModal } from "@/components/platform/language-modal"
import { useLocale } from "@/components/locale-provider"
import { secondaryDepth } from "@/components/ui/depth-button"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { clearAuthSnapshot, readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { nativeLogOut } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/* ── The parts, /app Settings' own ─────────────────────────────────────── */

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]"
const CARD_TITLE = "text-[15px] font-semibold text-[#1a1a2e]"
const FIELD =
  "h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-[16px] sm:text-[14px] text-[#1a1a2e] outline-none transition-colors " +
  "placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
/* The saving button of a field: the website builder's near black, as the password card's. */
const INK =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(15,23,42,0.18)] transition-colors hover:bg-[#2a2a40] active:bg-[#111122] " +
  "disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:rounded-lg sm:text-[13px]"
const QUIET =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f3f4f6] px-4 text-[13px] font-medium text-[#374151] " +
  "transition-colors hover:bg-[#e5e7eb] disabled:cursor-not-allowed disabled:opacity-60"

/* ── You ─────────────────────────────────────────────────────────────── */

function ProfileCard({ userId, name: initialName, avatarUrl }: { userId: string; name: string; avatarUrl: string | null }) {
  const router = useRouter()
  const photo = useShellAvatar(avatarUrl)
  const [saved, setSaved] = useState(initialName)
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const changed = name.trim() !== saved.trim()

  const save = async () => {
    const next = name.trim()
    if (!next || busy || !changed) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.from("profiles").update({ display_name: next }).eq("id", userId)
      if (updateError) throw updateError
      /* The copies of the name elsewhere follow it (the same call Settings makes). */
      if (saved) {
        void fetch("/api/account/profile-changed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previousName: saved }),
        }).catch(() => null)
      }
      /* The header starts the next page from this record; it should start on the new name. */
      const snap = readAuthSnapshot()
      if (snap?.signedIn) writeAuthSnapshot({ ...snap, displayName: next })
      setSaved(next)
      setName(next)
      setSavedAt(Date.now())
      router.refresh()
    } catch {
      setError("Your name did not save. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={CARD} aria-labelledby="account-you" data-account-card="profile">
      {/* The photo control heads itself ("Profile photo"), so the card's own name is for screen readers. */}
      <h2 id="account-you" className="sr-only">
        Profile
      </h2>
      <ProfilePhoto userId={userId} src={photo} name={saved} onChanged={() => router.refresh()} />
      <div className="mt-5 border-t border-[#f0f1f3] pt-4">
        <label htmlFor="account-name" className="mb-1.5 flex items-center text-[13px] font-medium text-[#374151]">
          Name
          <Saved at={savedAt} />
        </label>
        <div
          className="flex gap-2"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault()
              void save()
            }
          }}
        >
          <input
            id="account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Your name"
            maxLength={80}
            className={FIELD}
            data-account-name=""
          />
          {changed ? (
            <button type="button" onClick={() => void save()} disabled={busy || !name.trim()} className={cn(INK, "shrink-0")} data-account-name-save="">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Save
            </button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-[12px] text-[#b42318]">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}

/* ── Sign in ─────────────────────────────────────────────────────────── */

function EmailCard({ email: initialEmail }: { email: string }) {
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [open, setOpen] = useState(false)
  return (
    <section className={CARD} aria-labelledby="account-email" data-account-card="email">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="account-email" className={CARD_TITLE}>
            Email
          </h2>
          <p className="mt-1 break-all text-[14px] text-[#374151]" data-account-email="">
            {email}
          </p>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">Receipts and sign in codes go here.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-change-email=""
          className={cn(secondaryDepth, "h-11 shrink-0 rounded-xl px-4 text-[14px] sm:h-10 sm:rounded-lg sm:text-[13px]")}
        >
          {open ? "Close" : "Change"}
        </button>
      </div>
      {open ? (
        <div className="mt-4 border-t border-[#f0f1f3] pt-4">
          <EmailChangeFlow
            currentEmail={email}
            onChanged={(next) => {
              setEmail(next)
              setOpen(false)
              router.refresh()
            }}
          />
        </div>
      ) : null}
    </section>
  )
}

/* ── Preferences ─────────────────────────────────────────────────────── */

function PreferencesCard({ email, newsletter: initialNewsletter, personalized: initialPersonalized }: { email: string; newsletter: boolean; personalized: boolean }) {
  const { language, languages } = useLocale()
  const [languageOpen, setLanguageOpen] = useState(false)
  const languageName = languages.find((l) => l.code === language)?.label ?? language
  const newsletter = useSavedSwitch(initialNewsletter, useCallback((v: boolean) => savePreference({ newsletter: v }), []))
  const personalized = useSavedSwitch(initialPersonalized, useCallback((v: boolean) => savePreference({ personalizedRecommendations: v }), []))

  return (
    <section className={CARD} aria-labelledby="account-preferences" data-account-card="preferences">
      <h2 id="account-preferences" className={cn(CARD_TITLE, "mb-4")}>
        Preferences
      </h2>
      <div className="divide-y divide-[#f0f1f3]">
        <PrivacyRow
          id="language"
          title="Language"
          detail={<span data-account-language="">{languageName}</span>}
          control={
            <button type="button" onClick={() => setLanguageOpen(true)} className={cn(QUIET, "shrink-0")} data-account-language-open="">
              Change
            </button>
          }
        />
        <PrivacyRow
          id="newsletter"
          title={
            <>
              Storelib newsletter
              <Saved at={newsletter.savedAt} />
            </>
          }
          detail={
            <>
              New templates and assets each week, sent to <span className="break-all text-[#374151]">{email}</span>.
              {newsletter.error && <span className="mt-1 block text-red-600">{newsletter.error}</span>}
            </>
          }
          control={<Switch label="Storelib newsletter" checked={newsletter.value} busy={newsletter.busy} onChange={newsletter.change} />}
        />
        <PrivacyRow
          id="personalized"
          title={
            <>
              Recommendations for you
              <Saved at={personalized.savedAt} />
            </>
          }
          detail={
            <>
              Explore shows products like the ones you bought or saved first.
              {personalized.error && <span className="mt-1 block text-red-600">{personalized.error}</span>}
            </>
          }
          control={<Switch label="Recommendations for you" checked={personalized.value} busy={personalized.busy} onChange={personalized.change} />}
        />
      </div>
      <LanguageModal open={languageOpen} onOpenChange={setLanguageOpen} />
    </section>
  )
}

/* ── Log out, and the way out for good ───────────────────────────────── */

function LeaveCard({ email, createdAt, isSeller }: { email: string; createdAt: string; isSeller: boolean }) {
  const router = useRouter()
  const [leaving, setLeaving] = useState<"here" | "everywhere" | null>(null)
  const [step, setStep] = useState<"idle" | "confirm" | "verify">("idle")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  const done = useCallback(() => {
    /* The header and the tab bar start the next page from this record. */
    clearAuthSnapshot()
    if (isNativePlatform()) nativeLogOut()
    else router.push("/")
  }, [router])

  const logOut = async (scope: "local" | "global") => {
    if (leaving) return
    setLeaving(scope === "local" ? "here" : "everywhere")
    try {
      await createClient().auth.signOut({ scope })
      done()
    } catch {
      setLeaving(null)
    }
  }

  const sendCode = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-code" }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStep("verify")
        setCode("")
        requestAnimationFrame(() => codeRef.current?.focus())
      } else setError(data.error || "The code did not send. Try again in a moment.")
    } catch {
      setError("Could not reach Storelib. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (code.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "That code is not right.")
        setBusy(false)
        return
      }
      await createClient().auth.signOut({ scope: "local" }).catch(() => undefined)
      done()
    } catch {
      setError("Could not reach Storelib. Check your connection and try again.")
      setBusy(false)
    }
  }

  return (
    <>
      <section className={CARD} aria-labelledby="account-leave" data-account-card="log-out">
        <h2 id="account-leave" className="sr-only">
          Log out
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => void logOut("local")}
            disabled={!!leaving}
            data-account-logout=""
            className={cn(secondaryDepth, "h-11 w-full rounded-xl px-4 text-[14px] sm:w-auto sm:h-10 sm:rounded-lg sm:text-[13px]")}
          >
            {leaving === "here" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Log out
          </button>
          <button
            type="button"
            onClick={() => void logOut("global")}
            disabled={!!leaving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-2 text-[13px] font-medium text-[#6b7280] underline-offset-4 transition-colors hover:text-[#1a1a2e] hover:underline disabled:opacity-60 sm:h-10"
          >
            {leaving === "everywhere" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Log out of every device
          </button>
        </div>
      </section>

      <section className={CARD} aria-labelledby="account-delete" data-account-card="delete">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="account-delete" className={CARD_TITLE}>
              Delete account
            </h2>
            <p className="mt-1 text-[13px] leading-[1.45] text-[#6b7280]">
              {isSeller
                ? "Removes your purchases and library, and your store, products, customers and sales history, for good."
                : "Removes your purchases, library and wishlist for good."}
            </p>
            <p className="mt-2 text-[12px] text-[#6b7280]">
              Account created {new Date(createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          {step === "idle" ? (
            <button type="button" onClick={() => { setStep("confirm"); setError(null) }} className={cn(QUIET, "shrink-0")} data-account-delete="">
              Delete account
            </button>
          ) : null}
        </div>

        {step === "confirm" ? (
          <div className="mt-4 space-y-3 border-t border-[#f0f1f3] pt-4">
            <p className="text-[13px] leading-[1.45] text-[#374151]">
              We will send a 6 digit code to <span className="font-medium text-[#1a1a2e]">{email}</span> to make sure it is you.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep("idle")} disabled={busy} className={cn(secondaryDepth, "h-11 flex-1 rounded-xl px-4 text-[14px] sm:h-10 sm:flex-none sm:rounded-lg sm:text-[13px]")}>
                Cancel
              </button>
              <button type="button" onClick={() => void sendCode()} disabled={busy} className={cn(INK, "flex-1 sm:flex-none")}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Send code
              </button>
            </div>
          </div>
        ) : null}

        {step === "verify" ? (
          <div className="mt-4 space-y-3 border-t border-[#f0f1f3] pt-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">Code from your email</span>
              <input
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${FIELD} tracking-[0.3em]`}
                data-account-delete-code=""
              />
              <span className="mt-1.5 block text-[12px] text-[#6b7280]">Sent to {email}.</span>
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setStep("confirm"); setCode(""); setError(null) }} disabled={busy} className={cn(secondaryDepth, "h-11 flex-1 rounded-xl px-4 text-[14px] sm:h-10 sm:flex-none sm:rounded-lg sm:text-[13px]")}>
                Back
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={busy || code.length !== 6}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#b42318] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#9a1d14] disabled:opacity-40 sm:h-10 sm:flex-none sm:rounded-lg sm:text-[13px]"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Delete for good
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[13px] leading-[1.45] text-red-700">
            {error}
          </p>
        ) : null}
      </section>
    </>
  )
}

/* ── The page ────────────────────────────────────────────────────────── */

export function AccountSettings({
  userId,
  email,
  name,
  avatarUrl,
  createdAt,
  hasPassword,
  via,
  isSeller,
  newsletter,
  personalized,
}: {
  userId: string
  email: string
  name: string
  avatarUrl: string | null
  createdAt: string
  hasPassword: boolean
  via: string
  isSeller: boolean
  newsletter: boolean
  personalized: boolean
}) {
  return (
    <div className="space-y-4 sm:space-y-5" data-account-page="" data-account-settings="">
      <ProfileCard userId={userId} name={name} avatarUrl={avatarUrl} />
      <EmailCard email={email} />
      <PasswordCard email={email} hasPassword={hasPassword} via={via} />
      <PreferencesCard email={email} newsletter={newsletter} personalized={personalized} />
      <LeaveCard email={email} createdAt={createdAt} isSeller={isSeller} />
    </div>
  )
}
