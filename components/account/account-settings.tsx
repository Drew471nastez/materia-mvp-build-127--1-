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
 *   THE TOP ROW    a round chevron back to the profile, and Settings in the
 *                  library's heading (24px, 28 from sm), so the two screens
 *                  are visibly the same product. Not sticky: the site
 *                  header above it already is, and two bars stuck to the
 *                  top of a phone is what the owner asked us to stop doing.
 *
 *   THE SECTIONS   the library's pills, to the letter (components/library/
 *                  library-tabs.tsx, which are Explore's chips): white on a
 *                  hairline, the chosen one pressed into a grey fill that
 *                  fades in and grows from 96% where it is over 150ms.
 *                  They scroll sideways on a narrow phone. Five sections,
 *                  because five is what there is:
 *
 *                    Profile        the photo, the name, the username, the bio
 *                    Account        email, password, logging out, deleting
 *                    Privacy        what the public profile shows
 *                    Notifications  push, kind by kind, the phone's permission
 *                                   (components/account/notification-settings.tsx)
 *                    Preferences    language, newsletter, recommendations,
 *                                   sounds (likes, comments and posts)
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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { BackControl } from "@/components/navigation/back-control"
import { prefetchHref, prefetchOnIdle } from "@/lib/nav/prefetch-policy"
import { canReturnInApp } from "@/lib/navigation/in-app-history"

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
import { SOUNDS_DETAIL, useSounds } from "@/components/community/member/heart"
import { useLocale } from "@/components/locale-provider"
import { secondaryDepth } from "@/components/ui/depth-button"
import { AccountAvatar, useAccountPhoto } from "@/components/account/account-photo"
import { NotificationSettings } from "@/components/account/notification-settings"
import { CoverField } from "@/components/account/cover-field"
import { SaveBar, SAVE_BAR_MS } from "@/components/account/save-bar"
import { primeSettingsFromProfile, SETTINGS_SHEET_OUT_MS } from "@/components/account/settings-subpage"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { isValidUsername } from "@/lib/reserved-words"
import { normalizeHandle } from "@/lib/profile/username-rules"
import { LocationFields } from "@/components/profile/location-fields"
import { cleanCity, cleanCountry, type ProfileLocation } from "@/lib/profile/location"
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
  { key: "privacy", label: "Privacy" },
  { key: "notifications", label: "Notifications" },
  { key: "preferences", label: "Preferences" },
] as const

type SectionKey = (typeof SECTIONS)[number]["key"]

/** The library's own numbers (components/library/library-tabs.tsx). */
const PILL_FADE_MS = 150
const PILL_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
const PILL =
  "relative inline-flex h-9 shrink-0 cursor-pointer touch-manipulation select-none items-center whitespace-nowrap rounded-full border bg-white px-3.5 text-[14px] font-medium outline-none " +
  "transition-[color,background-color,border-color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] " +
  "before:absolute before:-inset-2 before:rounded-full before:content-['']"

function SectionPills({ active, onPick }: { active: SectionKey; onPick: (key: SectionKey) => void }) {
  return (
    <nav aria-label="Settings" className="-mx-4 mt-4 sm:mx-0">
      <div data-account-sections="" className="overflow-x-auto overflow-y-hidden overscroll-x-contain overscroll-y-none px-4 py-0 scrollbar-hide touch-pan-x sm:px-0">
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
                    on ? "opacity-100" : "opacity-0",
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

/** The sections as a list on a computer: the one open is filled, the rest are words; it stays in view as the section scrolls. */
function SectionList({ active, onPick }: { active: SectionKey; onPick: (key: SectionKey) => void }) {
  return (
    <nav aria-label="Settings" className="sticky top-24 hidden lg:block" data-account-section-list="">
      <ul className="space-y-0.5">
        {SECTIONS.map((section) => {
          const on = section.key === active
          return (
            <li key={section.key}>
              <button
                type="button"
                onClick={() => onPick(section.key)}
                aria-current={on ? "page" : undefined}
                data-account-section={section.key}
                data-active={on ? "true" : "false"}
                className={cn(
                  "flex h-10 w-full cursor-pointer items-center rounded-[10px] px-3 text-left text-[14.5px] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15",
                  on ? "bg-[#eceef1] font-semibold text-[#1a1a2e]" : "font-medium text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]",
                )}
              >
                {section.label}
              </button>
            </li>
          )
        })}
      </ul>
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

/* ── The username: checked as it is typed, saved with the rest ──────────── */

type HandleCheck = { state: "same" | "checking" | "available" | "taken" | "invalid"; message?: string }

/**
 * THE HANDLE, LIVE. The rule a typed handle must pass is the server's own
 * (isValidUsername), so most mistakes are said at once without a request;
 * whether it is free is asked of /api/profile/username a moment after
 * typing stops, and only the latest answer counts.
 */
function useHandleCheck(saved: string, value: string): HandleCheck {
  const [check, setCheck] = useState<HandleCheck>({ state: "same" })
  useEffect(() => {
    const handle = normalizeHandle(value)
    if (handle === saved.toLowerCase()) {
      setCheck({ state: "same" })
      return
    }
    const rule = isValidUsername(handle)
    if (!rule.valid) {
      setCheck({ state: "invalid", message: rule.error })
      return
    }
    setCheck({ state: "checking" })
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/username?handle=${encodeURIComponent(handle)}`, { signal: ctrl.signal, cache: "no-store" })
        const data = (await res.json().catch(() => ({}))) as { available?: boolean; error?: string }
        if (!res.ok) throw new Error(data.error || "Could not check that name just now.")
        setCheck(data.available ? { state: "available" } : { state: "taken", message: data.error || "This username is taken" })
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return
        setCheck({ state: "invalid", message: e instanceof Error ? e.message : "Could not check that name just now." })
      }
    }, 350)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [saved, value])
  return check
}

function ProfileSection({
  userId,
  name: initialName,
  bio: initialBio,
  bioSupported,
  avatarUrl,
  username: initialUsername,
  usernameEditable,
  cover,
  location = { city: null, country: null, supported: false },
  onCloseAfterSave,
}: {
  userId: string
  name: string
  bio: string
  bioSupported: boolean
  /** profiles.location_city / location_country (run-now part 98); the fields are not drawn before it runs. */
  location?: ProfileLocation & { supported: boolean }
  avatarUrl: string | null
  /** profiles.cover_url and whether the column is there (components/account/cover-field.tsx). */
  cover: { url: string | null; supported: boolean }
  /** Their handle; made for them when they had none (lib/profile/ensure-username). */
  username: string
  /** False for somebody with a store or a OnePage: their handle is also those addresses and moves from /app Settings. */
  usernameEditable: boolean
  /** Settings opened as a sheet over the profile: slide away after a successful save. */
  onCloseAfterSave?: () => void
}) {
  const router = useRouter()
  const shown = useShellAvatar(avatarUrl)
  const photo = useAccountPhoto(userId, () => router.refresh())
  const hasPhoto = !!(photo.preview || shown)

  const [savedName, setSavedName] = useState(initialName)
  const [savedBio, setSavedBio] = useState(initialBio)
  const [savedHandle, setSavedHandle] = useState(initialUsername)
  const [name, setName] = useState(initialName)
  const [bio, setBio] = useState(initialBio)
  const [handle, setHandle] = useState(initialUsername)
  /* Where they are from: the city as typed, the country as its code ("" for none). */
  const [savedCity, setSavedCity] = useState(location.city ?? "")
  const [savedCountry, setSavedCountry] = useState(location.country ?? "")
  const [city, setCity] = useState(location.city ?? "")
  const [country, setCountry] = useState(location.country ?? "")
  const placeChanged = location.supported && ((cleanCity(city) ?? "") !== (cleanCity(savedCity) ?? "") || country !== savedCountry)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const handleCheck = useHandleCheck(savedHandle, handle)
  const handleChanged = usernameEditable && handleCheck.state !== "same"
  const handleBlocked = handleChanged && handleCheck.state !== "available"
  const changed = name.trim() !== savedName.trim() || (bioSupported && bio.trim() !== savedBio.trim()) || handleChanged || placeChanged

  /* Back to what is saved: the bar goes down with it. */
  const discard = () => {
    setName(savedName)
    setBio(savedBio)
    setHandle(savedHandle)
    setCity(savedCity)
    setCountry(savedCountry)
    setError(null)
  }

  const save = async () => {
    const nextName = name.trim()
    const nextBio = bio.trim()
    if (!nextName || busy || !changed || handleBlocked) return
    setBusy(true)
    setError(null)
    try {
      let usernameAfter = savedHandle
      /* The handle first: a name taken in the meantime stops the save before anything else moves. */
      if (handleChanged) {
        const res = await fetch("/api/profile/username", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: normalizeHandle(handle) }),
        })
        const data = (await res.json().catch(() => ({}))) as { username?: string; error?: string }
        if (!res.ok || !data.username) {
          setError(data.error || "That did not save. Try again in a moment.")
          setBusy(false)
          return
        }
        usernameAfter = data.username
        setSavedHandle(data.username)
        setHandle(data.username)
      }
      const supabase = createClient()
      const patch: Record<string, string | null> = { display_name: nextName }
      if (bioSupported) patch.bio = nextBio || null
      /* Only once the columns are there (part 98): an empty field is no location, never an empty string the database refuses. */
      const nextCity = cleanCity(city)
      const nextCountry = cleanCountry(country)
      if (placeChanged) {
        patch.location_city = nextCity
        patch.location_country = nextCountry
      }
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
      if (placeChanged) {
        setSavedCity(nextCity ?? "")
        setSavedCountry(nextCountry ?? "")
        setCity(nextCity ?? "")
        setCountry(nextCountry ?? "")
      }
      setSavedAt(Date.now())
      primeSettingsFromProfile({
        userId,
        name: nextName,
        username: usernameAfter,
        bio: nextBio,
        avatarUrl,
        coverUrl: cover.url,
      })
      if (onCloseAfterSave) {
        window.setTimeout(() => {
          setBusy(false)
          onCloseAfterSave()
          window.setTimeout(() => router.refresh(), SETTINGS_SHEET_OUT_MS + 60)
        }, SAVE_BAR_MS + 200)
      } else {
        router.refresh()
        setBusy(false)
      }
    } catch {
      setError("That did not save. Try again in a moment.")
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

      {cover.supported ? (
        <div className="mt-5 border-t border-[#f0f1f3] pt-4">
          <CoverField initial={cover.url} labelClass={LABEL} helpClass={HELP} />
        </div>
      ) : null}

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

        <div>
          <label htmlFor="account-username" className={cn(LABEL, "mb-1.5 block")}>
            Username
          </label>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-[#9ca3af] sm:text-[14px]">
              @
            </span>
            <input
              id="account-username"
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace(/\s+/g, "").toLowerCase().slice(0, 30))}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              readOnly={!usernameEditable}
              maxLength={30}
              aria-describedby="account-username-help"
              aria-invalid={handleCheck.state === "taken" || handleCheck.state === "invalid" ? true : undefined}
              className={cn(INPUT, "pl-7", !usernameEditable && "bg-[#f9fafb] text-[#6b7280]")}
              data-account-username-field=""
            />
          </div>
          <span id="account-username-help" className={HELP} data-account-username-status={handleCheck.state}>
            {!usernameEditable ? (
              <>
                It is also your store&apos;s address.{" "}
                <Link href="/app/settings" className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                  Change it in store settings
                </Link>
              </>
            ) : handleCheck.state === "checking" ? (
              "Checking..."
            ) : handleCheck.state === "available" ? (
              <span className="text-[#067647]">Available</span>
            ) : handleCheck.state === "taken" || handleCheck.state === "invalid" ? (
              <span className="text-[#b42318]">{handleCheck.message}</span>
            ) : savedHandle ? (
              <>
                Your profile is at{" "}
                <Link href={`/@${savedHandle}`} className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline" data-account-profile-link="">
                  storelib.com/@{savedHandle}
                </Link>
              </>
            ) : (
              "People find and mention you by it."
            )}
          </span>
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

        {/* Where you are from (round 12): only once the columns are there, else nothing to save it in. */}
        {location.supported ? <LocationFields city={city} country={country} onCity={setCity} onCountry={setCountry} /> : null}

      </div>

      {/* Save changes: a bar of its own at the foot of the screen while there is something to save (components/account/save-bar.tsx). */}
      <SaveBar
        shown={changed || busy}
        busy={busy}
        disabled={!name.trim() || handleBlocked}
        error={error}
        onSave={() => void save()}
        onDiscard={discard}
      />
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

/* ── Privacy: what the public profile shows ───────────────────────────── */

async function savePrivacy(body: Record<string, boolean>) {
  let res: Response
  try {
    res = await fetch("/api/profile/privacy", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  } catch {
    throw new Error("Could not reach Storelib. Check your connection and try again.")
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error((data && typeof data.error === "string" && data.error !== "not_set_up" && data.error) || "That did not save. Try again.")
  }
}

/**
 * THE TWO SWITCHES THE PROFILE READS (profiles.show_activity and
 * show_communities). Off, the Activity tab says the person keeps it
 * private and the Communities tab lists only the communities they run; the
 * person still sees everything on their own profile, with a line saying
 * only they can. Saved on the press, as the preference switches are.
 * Before the columns exist there is nowhere to keep a choice, so the card
 * says the profile shows both rather than drawing switches that cannot save.
 *
 * A CREATOR HAS NO ACTIVITY SWITCH. Somebody with a live store shows no
 * activity anywhere (lib/profile/activity-page.ts), so a switch for it would
 * do nothing. Show communities I am in stays: it is the "in N communities"
 * line on their card inside a community (lib/communities/server/people.ts),
 * which is the one place a creator's memberships still show.
 */
function PrivacySection({ username, privacy, creator }: { username: string; privacy: { showActivity: boolean; showCommunities: boolean; supported: boolean }; creator: boolean }) {
  const activity = useSavedSwitch(privacy.showActivity, useCallback((v: boolean) => savePrivacy({ showActivity: v }), []))
  const communities = useSavedSwitch(privacy.showCommunities, useCallback((v: boolean) => savePrivacy({ showCommunities: v }), []))
  return (
    <section className={CARD} aria-labelledby="account-privacy" data-account-card="privacy">
      <h2 id="account-privacy" className={CARD_TITLE}>
        Your profile
      </h2>
      <p className="mb-3 mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">
        {creator ? (
          "What people see on your card in a community."
        ) : username ? (
          <>
            What people see at{" "}
            <Link href={`/@${username}`} className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
              storelib.com/@{username}
            </Link>
            .
          </>
        ) : (
          "What people see on your profile."
        )}
      </p>
      {privacy.supported ? (
        <div className="divide-y divide-[#f0f1f3]">
          {creator ? null : (
            <PrivacyRow
              id="show-activity"
              title={
                <>
                  Show my activity
                  <Saved at={activity.savedAt} />
                </>
              }
              detail={
                <>
                  Communities you joined, posts in public spaces, courses you finished, your reviews.
                  {activity.error && <span className="mt-1 block text-red-600">{activity.error}</span>}
                </>
              }
              control={<Switch label="Show my activity" checked={activity.value} busy={activity.busy} onChange={activity.change} />}
            />
          )}
          <PrivacyRow
            id="show-communities"
            title={
              <>
                Show communities I am in
                <Saved at={communities.savedAt} />
              </>
            }
            detail={
              <>
                {creator ? "How many public communities you are in, on your card inside a community. The ones you run are always listed." : "Public communities only. The ones you run are always listed."}
                {communities.error && <span className="mt-1 block text-red-600">{communities.error}</span>}
              </>
            }
            control={<Switch label="Show communities I am in" checked={communities.value} busy={communities.busy} onChange={communities.change} />}
          />
        </div>
      ) : (
        <p className="text-[13px] leading-[1.45] text-[#6b7280]" data-account-privacy-pending="">
          {creator ? "Your card in a community shows how many public communities you are in." : "Your profile shows your public activity and the public communities you are in."} Private and unlisted communities are never shown.
        </p>
      )}
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
  const [sounds, setSounds] = useSounds()

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
        {/* Round 13: the community Sounds switch (kept in this browser, so it saves on the press with nothing to wait for). */}
        <PrivacyRow id="sounds" title="Sounds" detail={SOUNDS_DETAIL} control={<Switch label="Sounds" checked={sounds} onChange={setSounds} />} />
      </div>
      <LanguageModal open={languageOpen} onOpenChange={setLanguageOpen} />
    </section>
  )
}

/* ── The screen ────────────────────────────────────────────────────────── */

/** Where the back goes when nothing of ours is behind: the profile. */
const BACK_TO = "/account"

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
  username = "",
  usernameEditable = true,
  privacy = { showActivity: true, showCommunities: true, supported: false },
  creator = false,
  cover = { url: null, supported: false },
  location,
  initialSection = "profile",
  onBack,
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
  /** Their handle, made for them on the way here when they had none. */
  username?: string
  usernameEditable?: boolean
  privacy?: { showActivity: boolean; showCommunities: boolean; supported: boolean }
  /** A live store (lib/profile/account-creator.ts): no activity anywhere, so no switch for it. */
  creator?: boolean
  /** The profile's own cover (profiles.cover_url); not offered where the column is not there. */
  cover?: { url: string | null; supported: boolean }
  /** Where they are from (lib/profile/location.ts); `supported` false before run-now part 98. */
  location?: ProfileLocation & { supported: boolean }
  /** From ?section=, so the profile's Settings pill lands on Account. */
  initialSection?: SectionKey
  /** Set when Settings is a layer over the profile: the chevron closes it instead of leaving the address. */
  onBack?: () => void
}) {
  /* Edit profile lands on the profile's own fields, which is what it promised. */
  const [section, setSection] = useState<SectionKey>(initialSection)
  const router = useRouter()
  useEffect(() => {
    setSection(initialSection)
  }, [initialSection])

  /*
    THE WAY BACK IS WARM BEFORE IT IS PRESSED (round 11: "the destination
    already warm: prefetch it when settings opens"). Back from the profile
    is the router's kept copy and needs nothing; opened cold (a link, a
    reload) the back opens /account, so that page is read ahead once this
    one is idle, as the device and network allow (lib/nav/prefetch-policy),
    and read at once when a finger lands on the back with nothing of ours
    behind it. Nothing here waits on either: the press itself is the back
    control's own (components/navigation/back-control.tsx).
  */
  useEffect(() => prefetchOnIdle(router, [BACK_TO]), [router])

  return (
    /* One readable column on a computer (round 14): the fields, and the cover in the profile band's own shape, at a settings width rather than across the whole screen. */
    <div data-account-page="" data-account-settings="" className="mx-auto w-full max-w-[720px] [scrollbar-gutter:stable] lg:max-w-[940px]">
      <div
        className="flex items-center gap-2.5"
        data-account-settings-top=""
        onPointerDownCapture={() => {
          if (!canReturnInApp()) prefetchHref(router, BACK_TO, "press")
        }}
      >
        {/*
          A WAY BACK, NOT A WAY OUT. This was an X, which says "close this,
          you are done" about a screen you reached from your own profile and
          return to. A chevron says where it goes, which is the one thing an
          X never says: "make sure the thing there is not an X, it is a back
          icon basically". The address it goes to has not changed.
        */}
        {/*
          SMOOTH, AND THE FIRST TAP. It was a link, which pushed a second copy
          of the profile at the top of it, and on a phone a tap sometimes
          became no click at all. It goes back now, to the profile the router
          kept (where it was scrolled), it darkens on the frame the finger
          lands, and it acts on the first tap's lift
          (components/navigation/back-control.tsx). Opened cold, it opens the
          profile.
        */}
        <BackControl fallback={BACK_TO} label="Back to profile" onBack={onBack} className="h-9 w-9 rounded-[9px]" data-account-settings-close="" />
        <h1 className="min-w-0 truncate text-[24px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Settings</h1>
      </div>

      {/* A phone and a tablet: the pills in a row. A computer: the sections as a list beside the one open (round 15). */}
      <div className="lg:mt-7 lg:grid lg:grid-cols-[188px_minmax(0,1fr)] lg:items-start lg:gap-10">
      <div className="lg:hidden">
        <SectionPills active={section} onPick={setSection} />
      </div>
      <SectionList active={section} onPick={setSection} />
      <div className="min-w-0">

      {/*
        ONE SECTION DISSOLVES INTO THE NEXT. It used to fade the arriving
        section in from nothing while the one leaving was taken away in the
        same frame, so the eye saw the old screen vanish and a new one
        brighten into the gap: "not so direct, smooth clean". Now the one
        leaving fades out first and the next fades in behind it
        (SectionSwap), which is one dissolve rather than a cut and a fade.
      */}
      <SectionSwap section={section}>
        {section === "profile" ? (
          <ProfileSection
            userId={userId}
            name={name}
            bio={bio ?? ""}
            bioSupported={bioSupported !== false}
            avatarUrl={avatarUrl ?? null}
            username={username}
            usernameEditable={usernameEditable}
            cover={cover}
            location={location}
            onCloseAfterSave={onBack}
          />
        ) : null}
        {section === "account" ? (
          <>
            <EmailCard email={email} />
            <PasswordCard email={email} hasPassword={hasPassword} via={via} />
            <LeaveCard email={email} createdAt={createdAt} isSeller={isSeller} />
          </>
        ) : null}
        {section === "privacy" ? <PrivacySection username={username} privacy={privacy} creator={creator} /> : null}
        {section === "notifications" ? <NotificationSettings /> : null}
        {section === "preferences" ? <PreferencesSection email={email} newsletter={newsletter} personalized={personalized} /> : null}
      </SectionSwap>
      </div>
      </div>
    </div>
  )
}

/**
 * ===========================================================================
 *  THE SECTION LEAVING GOES BEFORE THE ONE ARRIVING COMES
 * ===========================================================================
 * The pills answer the press at once, as they always did; only what is
 * under them takes these few frames. What is on screen is held and faded
 * to nothing over OUT_MS, then the section picked is put in and brought up
 * over IN_MS. The whole move is under a quarter of a second, and because
 * the two never overlap the page's height is never fought over by two
 * sections of different lengths, which is what a true cross fade would
 * cost here and what made the first attempt at this jump.
 *
 * Under reduced motion, and where a browser cannot animate, the section
 * simply changes: no wait, no fade.
 */
const SWAP_OUT_MS = 100
const SWAP_IN_MS = 150

function SectionSwap({ section, children }: { section: SectionKey; children: React.ReactNode }) {
  /* What is drawn: behind the pills' own state, so it lags by exactly one fade. */
  const [drawn, setDrawn] = useState(section)
  const [held, setHeld] = useState<React.ReactNode>(children)
  const ref = useRef<HTMLDivElement | null>(null)
  const entered = useRef(false)

  useEffect(() => {
    if (section === drawn) {
      setHeld(children)
      return
    }
    const el = ref.current
    const still = !el || typeof el.animate !== "function" || (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    if (still) {
      setDrawn(section)
      setHeld(children)
      return
    }
    let done = false
    const land = () => {
      if (!done) {
        done = true
        setDrawn(section)
        setHeld(children)
      }
    }
    const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SWAP_OUT_MS, easing: "ease-in", fill: "both" })
    out.onfinish = land
    window.setTimeout(land, SWAP_OUT_MS + 160)
    return () => {
      out.cancel()
    }
  }, [section, children, drawn])

  /* Brought up from nothing on the frame the new section is first painted. */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof el.animate !== "function") return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.style.opacity = "1"
      return
    }
    if (!entered.current) {
      entered.current = true
      el.style.opacity = "1"
      return
    }
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SWAP_IN_MS, easing: "ease-out", fill: "both" })
  }, [drawn])

  return (
    <div ref={ref} data-account-panel={drawn} data-account-panel-swap="" className="mt-5 space-y-4 sm:space-y-5 lg:mt-0">
      {held}
    </div>
  )
}
