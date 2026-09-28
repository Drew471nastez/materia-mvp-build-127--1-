"use client"

/**
 * ===========================================================================
 *  THE PROFILE'S SETTINGS
 * ===========================================================================
 * /account/settings, where Edit profile on the profile goes. The owner:
 * "when I click Edit profile it needs to take me to the settings, with our
 * pill shapes, so adapt it to our UI in the settings there", and he showed
 * a settings screen on a phone as the SHAPE: a top row with a way out and
 * the word Settings, a row of section tabs, then that section as plain
 * labelled fields.
 *
 * So the shape is that, and every part of it is Storelib's own:
 *
 *   THE TOP ROW    a round X back to the profile, and Settings in the
 *                  library's heading (24px, 28 from sm), so the two screens
 *                  are visibly the same product. Not sticky: the site
 *                  header above it already is, and two bars stuck to the
 *                  top of a phone is what the owner asked us to stop doing.
 *
 *   THE SECTIONS   the library's pills, to the letter (components/library/
 *                  library-tabs.tsx, which are Explore's chips): white on a
 *                  hairline, the chosen one pressed into a grey fill that
 *                  fades in and grows from 96% where it is over 150ms.
 *                  They scroll sideways on a narrow phone. Three sections,
 *                  because three is what there is:
 *
 *                    Profile      the photo, the name, the bio
 *                    Account      email, password, logging out, deleting
 *                    Preferences  language, newsletter, recommendations
 *
 *   THE FIELDS     a label over the input, the input as /app Settings and
 *                  the checkout draw one (a #e5e7eb hairline, an 11px tall
 *                  box, violet on focus), a line of help under it where
 *                  there is something worth saying, and a counter on the
 *                  one field with a length to watch.
 *
 * ONE PHOTO ON THE SCREEN. The profile header is not drawn on this route
 * (components/account/account-hub.tsx returns the page alone here), so the
 * only circle is this section's, and it is the control: a camera on its
 * edge, Change profile photo and Remove beside it.
 *
 * Every flow underneath is the one that was already here and is shared with
 * /app Settings (components/app/settings/account-panels.tsx): the email
 * change that asks for a code at each address, the password card that can
 * also set a first password on a Google or Apple account, the preference
 * switches that save on the press, logging out of one device or all of
 * them, and deleting the account behind a code.
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"

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
import { AccountAvatar, useAccountPhoto } from "@/components/account/account-photo"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { clearAuthSnapshot, readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { nativeLogOut } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/* ── The parts ─────────────────────────────────────────────────────────── */

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e7eb]/60"
const CARD_TITLE = "text-[15px] font-semibold text-[#1a1a2e]"
const LABEL = "text-[13px] font-medium leading-[1.4] text-[#374151]"
const HELP = "mt-1.5 block text-[12px] leading-[1.45] text-[#6b7280]"
/* The input /app Settings and the checkout draw: 16px on a phone, so iOS does not zoom the page on focus. */
const FIELD =
  "w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-[16px] sm:text-[14px] text-[#1a1a2e] outline-none transition-colors " +
  "placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
const INPUT = `h-11 ${FIELD}`
const AREA = `${FIELD} min-h-[96px] resize-none py-2.5 leading-[1.5]`
/* The saving button: the website builder's near black, as the password card's. */
const INK =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(15,23,42,0.18)] transition-colors hover:bg-[#2a2a40] active:bg-[#111122] " +
  "disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:rounded-lg sm:text-[13px]"
const QUIET =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f3f4f6] px-4 text-[13px] font-medium text-[#374151] " +
  "transition-colors hover:bg-[#e5e7eb] disabled:cursor-not-allowed disabled:opacity-60"

/** How long a name and a bio may be. The database keeps its own ceiling at 400 (supabase/sql/RUN_PROFILE_COVER_BIO.sql). */
const NAME_MAX = 80
const BIO_MAX = 240

/* ── The section pills: the library's, to the letter ───────────────────── */

const SECTIONS = [
  { key: "profile", label: "Profile" },
  { key: "account", label: "Account" },
  { key: "preferences", label: "Preferences" },
] as const

type SectionKey = (typeof SECTIONS)[number]["key"]

/** The library's own numbers (components/library/library-tabs.tsx). */
const PILL_FADE_MS = 150
const PILL_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
const PILL =
  "relative inline-flex h-9 shrink-0 cursor-pointer select-none items-center whitespace-nowrap rounded-full border bg-white px-3.5 text-[14px] font-medium outline-none " +
  "transition-[color,scale] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none motion-reduce:active:scale-100 [-webkit-tap-highlight-color:transparent]"

function SectionPills({ active, onPick }: { active: SectionKey; onPick: (key: SectionKey) => void }) {
  return (
    <nav aria-label="Settings" className="-mx-4 mt-4 sm:mx-0">
      <div data-account-sections="" className="overflow-x-auto overscroll-x-contain px-4 py-0.5 scrollbar-hide sm:px-0">
        <div className="flex w-max items-center gap-2">
          {SECTIONS.map((section) => {
            const on = section.key === active
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => onPick(section.key)}
                aria-current={on ? "page" : undefined}
                data-account-section={section.key}
                data-active={on ? "true" : "false"}
                style={{ transitionDuration: `${PILL_FADE_MS}ms`, transitionTimingFunction: PILL_EASE }}
                className={cn(PILL, on ? "border-[#d7dadf] text-[#1a1a2e]" : "border-[#e4e7ec] text-[#6b7280] hover:text-[#1a1a2e]")}
              >
                {/* This pill's own fill: it fades in where it is, never slides over from the last one. */}
                <span
                  aria-hidden="true"
                  data-account-section-fill=""
                  style={{ transitionDuration: `${PILL_FADE_MS}ms`, transitionTimingFunction: PILL_EASE }}
                  className={cn(
                    "pointer-events-none absolute -inset-px rounded-full border border-[#d7dadf] bg-[#e2e4e8]",
                    "shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]",
                    "transition-[opacity,scale] motion-reduce:transition-none",
                    on ? "scale-100 opacity-100" : "scale-[0.96] opacity-0",
                  )}
                />
                <span className="relative">{section.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

/** How much of a field's room is used. Quiet until it is all gone. */
function Counter({ used, max }: { used: number; max: number }) {
  return (
    <span data-account-counter="" className={cn("text-[12px] tabular-nums", used >= max ? "text-[#b42318]" : "text-[#9ca3af]")}>
      {used}/{max}
    </span>
  )
}

/* ── Profile: the photo, the name, the bio ─────────────────────────────── */

function ProfileSection({
  userId,
  name: initialName,
  bio: initialBio,
  bioSupported,
  avatarUrl,
}: {
  userId: string
  name: string
  bio: string
  bioSupported: boolean
  avatarUrl: string | null
}) {
  const router = useRouter()
  const shown = useShellAvatar(avatarUrl)
  const photo = useAccountPhoto(userId, () => router.refresh())
  const hasPhoto = !!(photo.preview || shown)

  const [savedName, setSavedName] = useState(initialName)
  const [savedBio, setSavedBio] = useState(initialBio)
  const [name, setName] = useState(initialName)
  const [bio, setBio] = useState(initialBio)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const changed = name.trim() !== savedName.trim() || (bioSupported && bio.trim() !== savedBio.trim())

  const save = async () => {
    const nextName = name.trim()
    const nextBio = bio.trim()
    if (!nextName || busy || !changed) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const patch: Record<string, string | null> = { display_name: nextName }
      if (bioSupported) patch.bio = nextBio || null
      const { error: updateError } = await supabase.from("profiles").update(patch).eq("id", userId)
      if (updateError) throw updateError
      /* The copies of the name elsewhere follow it (the same call /app Settings makes). */
      if (savedName && nextName !== savedName) {
        void fetch("/api/account/profile-changed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previousName: savedName }),
        }).catch(() => null)
      }
      /* The header starts the next page from this record; it should start on the new name. */
      const snap = readAuthSnapshot()
      if (snap?.signedIn) writeAuthSnapshot({ ...snap, displayName: nextName })
      setSavedName(nextName)
      setSavedBio(nextBio)
      setName(nextName)
      setBio(nextBio)
      setSavedAt(Date.now())
      router.refresh()
    } catch {
      setError("That did not save. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={CARD} aria-labelledby="account-profile" data-account-card="profile">
      <h2 id="account-profile" className={cn(CARD_TITLE, "flex items-center")}>
        Profile
        <Saved at={savedAt} />
      </h2>

      {/*
        THE ONE CIRCLE ON THIS SCREEN, AND IT IS THE CONTROL. Change photo
        rather than Change profile photo: at 360 the longer words push
        Remove onto a line of its own, and the section is already called
        Profile. The circle itself still says the whole sentence to a
        screen reader (components/account/account-photo.tsx).
      */}
      <div className="mt-3 flex items-center gap-3" data-account-photo-row="">
        <AccountAvatar src={shown} name={name} photo={photo} editable size={80} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={photo.pick}
              disabled={!!photo.busy}
              data-photo-change=""
              className={cn(secondaryDepth, "h-10 rounded-xl px-3.5 text-[14px]")}
            >
              {hasPhoto ? "Change photo" : "Add a photo"}
            </button>
            {hasPhoto ? (
              <button
                type="button"
                onClick={() => void photo.remove()}
                disabled={!!photo.busy}
                data-photo-remove=""
                className="inline-flex h-10 shrink-0 items-center rounded-xl px-2 text-[14px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e] disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>
          <span className={HELP}>JPG, PNG or WebP, up to 15MB.</span>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {photo.busy === "upload" ? "Uploading your photo" : photo.busy === "remove" ? "Removing your photo" : ""}
      </p>
      {photo.error ? (
        <p role="alert" className="mt-2 text-[12px] leading-[1.45] text-[#b42318]" data-account-photo-error="">
          {photo.error}
        </p>
      ) : null}
      {photo.input}

      <div
        className="mt-5 space-y-4 border-t border-[#f0f1f3] pt-4"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault()
            void save()
          }
        }}
      >
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="account-name" className={LABEL}>
              Name
            </label>
            {/* Only once the end of the field is in sight: a counter beside a name nobody is near filling is noise. */}
            {name.length > NAME_MAX - 20 ? <Counter used={name.length} max={NAME_MAX} /> : null}
          </div>
          <input
            id="account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Your name"
            maxLength={NAME_MAX}
            className={INPUT}
            data-account-name=""
          />
          <span className={HELP}>What sellers see on your reviews and your orders.</span>
        </div>

        {bioSupported ? (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <label htmlFor="account-bio" className={LABEL}>
                Bio
              </label>
              <Counter used={bio.length} max={BIO_MAX} />
            </div>
            <textarea
              id="account-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              placeholder="A line about what you make or what you are looking for."
              maxLength={BIO_MAX}
              rows={3}
              className={AREA}
              data-account-bio-field=""
            />
            <span className={HELP}>Shown under your name on your profile.</span>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={busy || !changed || !name.trim()} className={INK} data-account-save="">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save changes
          </button>
          {error ? (
            <p role="alert" className="text-[12px] leading-[1.45] text-[#b42318]">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/* ── Account: email, password, leaving ─────────────────────────────────── */

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
          <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">Receipts and sign in codes go here.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-change-email=""
          className={cn(secondaryDepth, "h-10 shrink-0 rounded-xl px-4 text-[14px] sm:rounded-lg sm:text-[13px]")}
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

/**
 * LEAVING, IN ONE PANEL. Logging out of this device, logging out of every
 * device and closing the account for good are the same subject, so they are
 * three rows of one card rather than three cards of one row each. Deleting
 * is last, behind a code sent to the account's address.
 */
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
    <section className={CARD} aria-labelledby="account-leave" data-account-card="leave">
      <h2 id="account-leave" className="sr-only">
        Logging out and closing the account
      </h2>
      <div className="divide-y divide-[#f0f1f3]">
        <PrivacyRow
          id="log-out"
          title="Log out"
          detail="On this device."
          control={
            <button
              type="button"
              onClick={() => void logOut("local")}
              disabled={!!leaving}
              data-account-logout=""
              className={cn(secondaryDepth, "h-10 shrink-0 rounded-xl px-4 text-[14px] sm:rounded-lg sm:text-[13px]")}
            >
              {leaving === "here" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Log out
            </button>
          }
        />
        <PrivacyRow
          id="log-out-everywhere"
          title="Log out everywhere"
          detail="Ends every session, on every phone and computer."
          control={
            <button
              type="button"
              onClick={() => void logOut("global")}
              disabled={!!leaving}
              data-account-logout-all=""
              className={cn(QUIET, "h-10 shrink-0")}
            >
              {leaving === "everywhere" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {/* Not a second button reading Log out: two of those a row apart is a question, not a choice. */}
              Log out all
            </button>
          }
        />
        <div className="py-3 last:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">Delete account</p>
              <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">
                {isSeller
                  ? "Removes your purchases and library, and your store, products, customers and sales history, for good."
                  : "Removes your purchases, library and wishlist for good."}
              </p>
              <p className="mt-1 text-[12px] leading-[1.45] text-[#9ca3af]">
                Account created {new Date(createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
            {step === "idle" ? (
              <button
                type="button"
                onClick={() => {
                  setStep("confirm")
                  setError(null)
                }}
                className={cn(QUIET, "h-10 shrink-0")}
                data-account-delete=""
              >
                Delete
              </button>
            ) : null}
          </div>

          {step === "confirm" ? (
            <div className="mt-4 space-y-3">
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
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="account-delete-code" className={cn(LABEL, "mb-1.5 block")}>
                  Code from your email
                </label>
                <input
                  id="account-delete-code"
                  ref={codeRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={`${INPUT} tracking-[0.3em]`}
                  data-account-delete-code=""
                />
                <span className={HELP}>Sent to {email}.</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("confirm")
                    setCode("")
                    setError(null)
                  }}
                  disabled={busy}
                  className={cn(secondaryDepth, "h-11 flex-1 rounded-xl px-4 text-[14px] sm:h-10 sm:flex-none sm:rounded-lg sm:text-[13px]")}
                >
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
        </div>
      </div>
    </section>
  )
}

/* ── Preferences ───────────────────────────────────────────────────────── */

function PreferencesSection({ email, newsletter: initialNewsletter, personalized: initialPersonalized }: { email: string; newsletter: boolean; personalized: boolean }) {
  const { language, languages } = useLocale()
  const [languageOpen, setLanguageOpen] = useState(false)
  const languageName = languages.find((l) => l.code === language)?.label ?? language
  const newsletter = useSavedSwitch(initialNewsletter, useCallback((v: boolean) => savePreference({ newsletter: v }), []))
  const personalized = useSavedSwitch(initialPersonalized, useCallback((v: boolean) => savePreference({ personalizedRecommendations: v }), []))

  return (
    <section className={CARD} aria-labelledby="account-preferences" data-account-card="preferences">
      <h2 id="account-preferences" className={cn(CARD_TITLE, "mb-3")}>
        Preferences
      </h2>
      <div className="divide-y divide-[#f0f1f3]">
        <PrivacyRow
          id="language"
          title="Language"
          detail={<span data-account-language="">{languageName}</span>}
          control={
            <button type="button" onClick={() => setLanguageOpen(true)} className={cn(QUIET, "h-10 shrink-0")} data-account-language-open="">
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

/* ── The screen ────────────────────────────────────────────────────────── */

export function AccountSettings({
  userId,
  email,
  name,
  bio,
  bioSupported,
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
  /** profiles.bio, "" when there is none. */
  bio?: string
  /** False where the profiles.bio column has not been added yet: the field is then not drawn at all. */
  bioSupported?: boolean
  avatarUrl?: string | null
  createdAt: string
  hasPassword: boolean
  via: string
  isSeller: boolean
  newsletter: boolean
  personalized: boolean
}) {
  /* Edit profile lands on the profile's own fields, which is what it promised. */
  const [section, setSection] = useState<SectionKey>("profile")

  return (
    <div data-account-page="" data-account-settings="">
      <div className="flex items-center gap-2.5" data-account-settings-top="">
        <Link
          href="/account"
          prefetch={true}
          aria-label="Close settings"
          data-account-settings-close=""
          className={cn(secondaryDepth, "h-10 w-10 rounded-full p-0")}
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 truncate text-[24px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Settings</h1>
      </div>

      <SectionPills active={section} onPick={setSection} />

      {/* The section that arrives fades in where it is: no slide, the switch /app Settings uses. */}
      <div
        key={section}
        data-account-panel={section}
        className="mt-5 space-y-4 duration-200 animate-in fade-in-0 motion-reduce:animate-none sm:space-y-5"
      >
        {section === "profile" ? (
          <ProfileSection userId={userId} name={name} bio={bio ?? ""} bioSupported={bioSupported !== false} avatarUrl={avatarUrl ?? null} />
        ) : null}
        {section === "account" ? (
          <>
            <EmailCard email={email} />
            <PasswordCard email={email} hasPassword={hasPassword} via={via} />
            <LeaveCard email={email} createdAt={createdAt} isSeller={isSeller} />
          </>
        ) : null}
        {section === "preferences" ? <PreferencesSection email={email} newsletter={newsletter} personalized={personalized} /> : null}
      </div>
    </div>
  )
}
