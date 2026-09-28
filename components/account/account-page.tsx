"use client"

/**
 * ===========================================================================
 *  THE BUYER'S OWN ACCOUNT
 * ===========================================================================
 * /account, the page every avatar outside /app opens and the Profile tab of
 * the phone's bar. "Edit some basic things such as their email, password,
 * profile picture, access account settings, log out, wishlist overview,
 * things like this."
 *
 * One column of cards, in the order somebody comes here for them:
 *
 *   YOU             photo (changed in place, through the one photo route:
 *                   components/app/settings/profile-photo) and name
 *   YOUR LIBRARY    purchases, the newest saved products, the reviews you
 *                   have left: rows into /library, which owns them
 *   SIGN IN         email (a code to each address, the same flow as the
 *                   seller's settings) and password (change it, or set one
 *                   on an account that has only ever used Google or Apple)
 *   PREFERENCES     language, the newsletter, recommendations on Explore
 *   SELLING         Become a seller (/sell decides where that goes) or, for
 *                   somebody who sells, Dashboard
 *   LOG OUT         and, last and quiet, deleting the account
 *
 * The cards are /app Settings' cards (the same white, hairline and radius,
 * the same switch and password card), so an account reads the same on both
 * sides of Storelib. What was /library/settings is all here, and that
 * address now redirects to this one.
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useRef, useState, type ReactNode } from "react"
import { ChevronRight, Loader2 } from "lucide-react"

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
import { optimizedImageUrl, isOptimizableImage } from "@/lib/images/optimized-url"
import { cn } from "@/lib/utils"

export type WishlistPreview = {
  count: number
  items: { id: string; title: string; thumbnail: string | null; href: string }[]
}

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

/**
 * A row that goes somewhere: its name, a line under it, and a chevron. The
 * whole row is the link, 56px or taller; the chevron darkens under a mouse.
 */
function LinkRow({ href, title, detail, children, testId }: { href: string; title: string; detail?: ReactNode; children?: ReactNode; testId?: string }) {
  return (
    <Link
      href={href}
      data-account-row={testId}
      className="group/row flex min-h-[56px] items-center gap-3 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">{title}</p>
        {detail ? <div className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">{detail}</div> : null}
        {children}
      </div>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#9ca3af] transition-colors group-hover/row:text-[#1a1a2e]" />
    </Link>
  )
}

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

/* ── Your library ─────────────────────────────────────────────────────── */

function Thumb({ src, title }: { src: string | null; title: string }) {
  const url = src && isOptimizableImage(src) ? optimizedImageUrl(src, 112) : src
  return (
    <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb]/70 bg-[#f3f4f6]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : null}
    </span>
  )
}

function LibraryCard({ wishlist }: { wishlist: WishlistPreview }) {
  const more = wishlist.count - wishlist.items.length
  return (
    <section className={CARD} aria-labelledby="account-library" data-account-card="library">
      <h2 id="account-library" className={cn(CARD_TITLE, "mb-1")}>
        Your library
      </h2>
      <div className="divide-y divide-[#f0f1f3]">
        <LinkRow href="/library" title="Purchases" detail="Everything you have bought, with its downloads." testId="purchases" />
        <div data-account-row="wishlist">
          <Link
            href="/library/wishlist"
            className="group/row flex min-h-[56px] items-center gap-3 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">
                Wishlist
                {wishlist.count > 0 ? <span className="ml-1.5 font-normal text-[#6b7280]">{wishlist.count}</span> : null}
              </p>
              {wishlist.items.length === 0 ? (
                <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">Products you save with the heart show up here.</p>
              ) : null}
            </div>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#9ca3af] transition-colors group-hover/row:text-[#1a1a2e]" />
          </Link>
          {wishlist.items.length > 0 ? (
            /* The newest saves, each to its own page. Outside the row's link:
               a link inside a link is two answers to one tap. */
            <div className="-mt-1 flex items-center gap-2 pb-3" data-wishlist-preview="">
              {wishlist.items.map((item) => (
                <Link key={item.id} href={item.href} aria-label={item.title} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25">
                  <Thumb src={item.thumbnail} title={item.title} />
                </Link>
              ))}
              {more > 0 ? (
                <Link
                  href="/library/wishlist"
                  className="flex h-12 min-w-12 items-center justify-center rounded-lg bg-[#f3f4f6] px-2 text-[13px] font-medium text-[#4b5563]"
                  aria-label={`${more} more saved`}
                >
                  +{more}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        {/* The reviews live in the library, beside what they are about. */}
        <LinkRow href="/library" title="Your reviews" detail="The reviews you have left on what you bought." testId="reviews" />
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

/* ── Selling ─────────────────────────────────────────────────────────── */

function SellingCard({ isSeller }: { isSeller: boolean }) {
  return (
    <section className={CARD} aria-labelledby="account-selling" data-account-card="selling">
      <h2 id="account-selling" className="sr-only">
        Selling
      </h2>
      <div className="-my-3">
        {isSeller ? (
          <LinkRow href="/app" title="Dashboard" detail="Your store, products and sales." testId="dashboard" />
        ) : (
          /* /sell decides: seller onboarding for this account, which keeps
             everything bought and saved exactly as it is. */
          <LinkRow href="/sell" title="Become a seller" detail="Sell your own products on Storelib with this account." testId="sell" />
        )}
      </div>
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

export function AccountPage({
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
  wishlist,
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
  wishlist: WishlistPreview
}) {
  return (
    <div
      className="mx-auto w-full max-w-[640px] px-4 pb-10 pt-6 sm:px-6 sm:pt-10"
      style={{ paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))", paddingRight: "max(1rem, env(safe-area-inset-right, 0px))" }}
      data-account-page=""
    >
      <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Account</h1>
      <p className="mt-1 text-[14px] text-[#6b7280]">Your profile, how you sign in, and what you get from Storelib.</p>

      <div className="mt-6 space-y-4 sm:space-y-5">
        <ProfileCard userId={userId} name={name} avatarUrl={avatarUrl} />
        <LibraryCard wishlist={wishlist} />
        <EmailCard email={email} />
        <PasswordCard email={email} hasPassword={hasPassword} via={via} />
        <PreferencesCard email={email} newsletter={newsletter} personalized={personalized} />
        <SellingCard isSeller={isSeller} />
        <LeaveCard email={email} createdAt={createdAt} isSeller={isSeller} />
      </div>
    </div>
  )
}

