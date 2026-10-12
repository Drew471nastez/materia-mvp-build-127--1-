"use client"

import { askPushPermission, inNativeApp, nativePlatform, openPhoneSettings, phoneSettingsPath, readPushPermission, type PushPermission } from "@/lib/native-push"
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Check, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { accountErrorKind, accountErrorMessage, passwordProblem } from "@/lib/auth/account-errors"
import { readConsent, writeConsent, onConsentChange } from "@/lib/consent/client"
import { everything } from "@/lib/consent/consent"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { secondaryDepth } from "@/components/ui/depth-button"
import { WebPushError, disableWebPush, enableWebPush, readWebPush, type WebPushState } from "@/lib/push/web-client"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

/**
 * ===========================================================================
 *  SECURITY AND PRIVACY, EVERY CONTROL WIRED TO WHERE IT IS KEPT
 * ===========================================================================
 * Split out of components/app/settings-form-new.tsx, which draws the tabs.
 * What each control writes, and what reads it back:
 *
 *   Change password            supabase.auth.updateUser on this session;
 *                              a reauthentication code when the project asks
 *   Email me a reset link      /api/auth/reset-password
 *   Sign out                   this device only (scope "local")
 *   Sign out everywhere        every session (scope "global")
 *   Personalized recommendations  /api/account/preferences, profiles column
 *   Storelib newsletter        /api/account/preferences, storelib_newsletter
 *   Analytics on this device   the cookie consent record (lib/consent)
 *
 * tests/account-settings.test.ts holds each of those paths in place, and
 * scripts/check-account-settings.mjs measures the layout at 390 and 1280.
 */

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]"
const FIELD =
  "h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-[14px] text-[#1a1a2e] outline-none transition-colors " +
  "placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
const PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#8b5cf6] px-5 text-[14px] font-medium text-white " +
  "transition-colors hover:bg-[#7c3aed] disabled:cursor-not-allowed disabled:bg-[#c4b5fd]"
/*
 * THE PASSWORD CARD'S BUTTONS. "I don't like the purple Change password
 * button." The step is opened with the white secondary the Products page
 * and the editor use (a hairline and a soft foot), and the change itself is
 * saved with a near-black button, the website builder's primary: a password
 * is not a thing to celebrate in the accent colour. 44px on a phone, 40
 * from sm.
 */
const OPEN_STEP = cn(secondaryDepth, "h-11 rounded-xl px-4 text-[14px] sm:h-10 sm:rounded-lg sm:text-[13px]")
const INK =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(15,23,42,0.18)] transition-colors hover:bg-[#2a2a40] active:bg-[#111122] " +
  "disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:rounded-lg sm:text-[13px]"
const TEXT_ACTION =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-2 text-[14px] font-medium text-[#4b5563] underline-offset-4 " +
  "transition-colors hover:text-[#1a1a2e] hover:underline disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:text-[13px]"
const QUIET =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f3f4f6] px-4 text-[13px] font-medium text-[#374151] " +
  "transition-colors hover:bg-[#e5e7eb] disabled:cursor-not-allowed disabled:opacity-60"

function Note({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`mt-3 rounded-xl px-3 py-2.5 text-[13px] leading-[1.45] ${
        tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      {children}
    </p>
  )
}

/* ─────────────────────────────── Switch ─────────────────────────────── */

/**
 * A real switch: role="switch" with aria-checked, and a 44px square to press
 * around the app's slim track (components/ui/switch-style.ts), so a thumb
 * on a phone does not have to find the track itself. The knob moves by
 * transform only, and the button is not a `.group`: on a touch screen
 * app/globals.css takes every transform off anything inside a `.group`
 * (the cards' hover zoom).
 */
export function Switch({
  checked,
  onChange,
  label,
  busy,
  disabled,
  id,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  busy?: boolean
  disabled?: boolean
  id?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      data-settings-switch=""
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative -mr-[9px] inline-flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111113]/25 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span aria-hidden="true" className={switchTrack(checked)}>
        <span className={switchKnob(checked)} />
      </span>
    </button>
  )
}

/**
 * A switch whose value lives on a server. It changes the moment it is
 * pressed, saves behind that, and goes back with a message if the save
 * fails. Presses made while a save is in flight are not lost and not sent
 * twice: the last value asked for is saved once the first save returns.
 */
export function useSavedSwitch(initial: boolean, save: (value: boolean) => Promise<void>) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const saved = useRef(initial)
  const wanted = useRef(initial)
  const running = useRef(false)

  const flush = useCallback(async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      while (wanted.current !== saved.current) {
        const target = wanted.current
        try {
          await save(target)
          saved.current = target
          setError(null)
          setSavedAt(Date.now())
        } catch (e) {
          wanted.current = saved.current
          setValue(saved.current)
          setError(e instanceof Error && e.message ? e.message : tt("That did not save. Try again."))
          break
        }
      }
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [save])

  const change = useCallback(
    (next: boolean) => {
      setValue(next)
      wanted.current = next
      void flush()
    },
    [flush],
  )

  return { value, busy, error, savedAt, change }
}

export function Saved({ at }: { at: number }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!at) return
    setShown(true)
    const t = window.setTimeout(() => setShown(false), 1600)
    return () => window.clearTimeout(t)
  }, [at])
  return (
    <span
      aria-live="polite"
      className={`ml-2 inline-flex items-center gap-1 text-[12px] font-medium text-[#6b7280] transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
    >
      {shown && (
        <>
          <Check className="h-3 w-3" aria-hidden="true" />
          {tt("Saved")}
        </>
      )}
    </span>
  )
}

export function PrivacyRow({
  id,
  title,
  detail,
  control,
}: {
  id: string
  title: ReactNode
  detail: ReactNode
  control: ReactNode
}) {
  return (
    <div data-privacy-row={id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">{title}</p>
        <div className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">{detail}</div>
      </div>
      {control}
    </div>
  )
}

export async function savePreference(body: Record<string, boolean>) {
  let res: Response
  try {
    res = await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(tt("Could not reach Storelib. Check your connection and try again."))
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error((data && typeof data.error === "string" && data.error) || tt("That did not save. Try again."))
  }
}

/* ─────────────────────────────── Privacy ─────────────────────────────── */

export function PrivacyPanel({
  email,
  initialPersonalized,
  initialNewsletter,
}: {
  email: string
  initialPersonalized: boolean
  initialNewsletter: boolean
}) {
  const personalized = useSavedSwitch(
    initialPersonalized,
    useCallback((v: boolean) => savePreference({ personalizedRecommendations: v }), []),
  )
  const newsletter = useSavedSwitch(
    initialNewsletter,
    useCallback((v: boolean) => savePreference({ newsletter: v }), []),
  )

  /* Analytics is the consent record in this browser, read after mount (it
     is a cookie the server render does not have) and kept in step with the
     cookie banner, which writes the same record. */
  const [analytics, setAnalytics] = useState(false)
  const [analyticsSavedAt, setAnalyticsSavedAt] = useState(0)
  useEffect(() => {
    setAnalytics(Boolean(readConsent()?.analytics))
    return onConsentChange((c) => setAnalytics(Boolean(c?.analytics)))
  }, [])
  const changeAnalytics = (next: boolean) => {
    const now = Date.now()
    /* Nobody has chosen yet: everything else stays off, only this is decided. */
    const base = readConsent() ?? everything(false, now)
    writeConsent({ ...base, analytics: next, at: Math.floor(now / 1000) })
    setAnalytics(next)
    setAnalyticsSavedAt(now)
  }

  return (
    <div className="space-y-4 sm:space-y-6" data-account-panel="privacy">
      <section className={CARD} aria-labelledby="privacy-heading">
        <h3 id="privacy-heading" className="mb-4 text-[15px] font-semibold text-[#1a1a2e]">
          {tt("Privacy")}
        </h3>
        <div className="divide-y divide-[#f0f1f3]">
          <PrivacyRow
            id="personalized"
            title={
              <>
                {tt("Personalized recommendations")}
                <Saved at={personalized.savedAt} />
              </>
            }
            detail={
              <>
                {tt("Explore shows products like the ones you bought or saved first.")}
                {personalized.error && <span className="mt-1 block text-red-600">{personalized.error}</span>}
              </>
            }
            control={
              <Switch
                label={tt("Personalized recommendations")}
                checked={personalized.value}
                busy={personalized.busy}
                onChange={personalized.change}
              />
            }
          />
          <PrivacyRow
            id="newsletter"
            title={
              <>
                {tt("Storelib newsletter")}
                <Saved at={newsletter.savedAt} />
              </>
            }
            detail={
              <>
                {tt("Weekly assets and new templates, sent to")} <span className="break-all text-[#374151]">{email}</span>.
                {newsletter.error && <span className="mt-1 block text-red-600">{newsletter.error}</span>}
              </>
            }
            control={
              <Switch label={tt("Storelib newsletter")} checked={newsletter.value} busy={newsletter.busy} onChange={newsletter.change} />
            }
          />
          <PrivacyRow
            id="analytics"
            title={
              <>
                {tt("Analytics on this device")}
                <Saved at={analyticsSavedAt} />
              </>
            }
            detail={tt("Counts visits and page speed in this browser. Off stores nothing.")}
            control={<Switch label={tt("Analytics on this device")} checked={analytics} onChange={changeAnalytics} />}
          />
          <DeviceNotificationsRow />
        </div>
      </section>
    </div>
  )
}

/**
 * NOTIFICATIONS ON THIS BROWSER. The browser's own permission prompt, then a
 * push to this computer on every sale and when a payout is ready, the same
 * ones the phone app gets (lib/push/web-client, lib/push/sender). What the
 * switch shows is asked of the browser and the server each time, so a
 * permission changed in the browser's own settings is what you see here.
 * Not drawn in the native apps, which have their own.
 *
 * Each way it can fail says which it is: blocked in the browser's settings,
 * a browser that cannot, the browser's push service, or Storelib's server
 * (lib/push/web-client names them).
 */
export const NOTIFICATION_WORDS: Record<"blocked" | "unsupported" | "iphone" | "idle", string> = {
  get blocked() { return tt("Blocked in this browser's settings for storelib.com. Allow notifications there (the icon beside the address), then turn this on.") },
  get unsupported() { return tt("This browser cannot show notifications.") },
  get iphone() { return tt("Safari on iPhone does not show website notifications. The Storelib app for iPhone does.") },
  get idle() { return tt("A notification on this computer when you make a sale or a payout is ready.") },
}

/**
 * THIS DEVICE'S NOTIFICATIONS: the browser's own in a browser, the phone's
 * in the Storelib app. The app's web view is not a browser for this: an
 * Android web view has no web push, so the browser switch there could be
 * pressed and did nothing at all. In the app the switch is the phone's
 * permission (lib/native-push): on asks the phone, and since only the
 * phone's own settings can take a yes back (or undo a no), those open
 * from here.
 */
function DeviceNotificationsRow() {
  const [inApp, setInApp] = useState<boolean | null>(null)
  useEffect(() => {
    setInApp(inNativeApp())
  }, [])
  if (inApp === null) return null
  return inApp ? <PhoneNotificationsRow /> : <BrowserNotificationsRow />
}

function PhoneNotificationsRow() {
  const [permission, setPermission] = useState<PushPermission | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const platform = nativePlatform()

  useEffect(() => {
    let live = true
    const read = () => {
      if (document.visibilityState !== "visible") return
      void readPushPermission().then((p) => live && setPermission(p))
    }
    read()
    /* Back from the phone's settings with the answer changed. */
    document.addEventListener("visibilitychange", read)
    return () => {
      live = false
      document.removeEventListener("visibilitychange", read)
    }
  }, [])

  if (permission === null || permission === "unsupported") return null

  const change = async (next: boolean) => {
    if (busy) return
    if (!next || permission === "denied") {
      /* Only the phone's settings can turn it off, or back on after a no. */
      openPhoneSettings()
      return
    }
    setBusy(true)
    try {
      const answer = await askPushPermission()
      setPermission(answer)
      if (answer === "granted") setSavedAt(Date.now())
    } finally {
      setBusy(false)
    }
  }

  const detail =
    permission === "granted"
      ? tt("A notification on this phone when you make a sale or a payout is ready. Turn it off in your phone's settings.")
      : permission === "denied"
        ? tt("Off in your phone's settings. Turn this on to open {platform}.", { platform: phoneSettingsPath(platform) })
        : tt("A notification on this phone when you make a sale or a payout is ready.")

  return (
    <PrivacyRow
      id="phone-notifications"
      title={
        <>
          {tt("Notifications on this phone")}
          <Saved at={savedAt} />
        </>
      }
      detail={<span data-notifications-detail="">{detail}</span>}
      control={<Switch label={tt("Notifications on this phone")} checked={permission === "granted"} busy={busy} onChange={(v) => void change(v)} />}
    />
  )
}

function BrowserNotificationsRow() {
  const [state, setState] = useState<WebPushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const busyRef = useRef(false)

  useEffect(() => {
    let live = true
    const read = () => {
      /* Not while a change is under way: it would read the half made state. */
      if (busyRef.current) return
      void readWebPush().then((s) => live && !busyRef.current && setState(s))
    }
    read()
    /* Back from the browser's own settings with the permission changed. */
    document.addEventListener("visibilitychange", read)
    return () => {
      live = false
      document.removeEventListener("visibilitychange", read)
    }
  }, [])

  if (state === null || (state === "unsupported" && document.documentElement.classList.contains("capacitor"))) return null

  const change = async (next: boolean) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    const was = state
    setState(next ? "on" : "off")
    try {
      const now = next ? await enableWebPush() : await disableWebPush()
      setState(now)
      if (now === (next ? "on" : "off")) setSavedAt(Date.now())
    } catch (e) {
      setState(was)
      setError(e instanceof WebPushError ? e.message : tt("That did not change. Try again."))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const detail =
    state === "blocked" ? NOTIFICATION_WORDS.blocked
      : state === "iphone" ? NOTIFICATION_WORDS.iphone
        : state === "unsupported" ? NOTIFICATION_WORDS.unsupported
          : NOTIFICATION_WORDS.idle

  return (
    <PrivacyRow
      id="browser-notifications"
      title={
        <>
          {tt("Notifications on this browser")}
          <Saved at={savedAt} />
        </>
      }
      detail={
        <>
          <span data-notifications-detail="">{detail}</span>
          {error && <span role="alert" data-notifications-error="" className="mt-1 block text-red-600">{error}</span>}
        </>
      }
      control={
        <Switch
          label={tt("Notifications on this browser")}
          checked={state === "on"}
          busy={busy}
          disabled={state === "blocked" || state === "unsupported" || state === "iphone"}
          onChange={(v) => void change(v)}
        />
      }
    />
  )
}

/* ─────────────────────────────── Password ─────────────────────────────── */

/*
 * `hasPassword` false is an account that signs in with Google or Apple only
 * and has never had a password. Supabase sets one the same way it changes
 * one, so the card is the same card, asking to SET rather than change; the
 * buyer's account page (components/account/account-page.tsx) passes it.
 */
export function PasswordCard({ email, hasPassword = true, via }: { email: string; hasPassword?: boolean; via?: string }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [nonce, setNonce] = useState("")
  const [step, setStep] = useState<"form" | "reauth">("form")
  /* The fields are a step, not the card's resting state: "you should not
     show the inputs as default". Change password opens them. */
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const [resetBusy, setResetBusy] = useState(false)
  const [resetNote, setResetNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  const change = async () => {
    if (busy) return
    const problem = passwordProblem(password, confirm)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser(
        step === "reauth" ? { password, nonce: nonce.trim() } : { password },
      )
      if (updateError) {
        const kind = accountErrorKind(updateError)
        if (kind === "reauthentication_needed" && step === "form") {
          /* The project asks for a fresh proof before a password changes.
             Supabase emails a code to the account's address; the same call
             goes again with it. */
          const { error: reauthError } = await supabase.auth.reauthenticate()
          if (reauthError) {
            setError(accountErrorMessage(reauthError))
            return
          }
          setStep("reauth")
          setError(null)
          return
        }
        setError(accountErrorMessage(updateError))
        return
      }
      /* "Your password was changed", if the auth.users trigger has not said it already (app/api/auth/password-changed). */
      void fetch("/api/auth/password-changed", { method: "POST" }).catch(() => undefined)
      setDone(true)
      setPassword("")
      setConfirm("")
      setNonce("")
      setStep("form")
      setOpen(false)
    } catch (err) {
      setError(accountErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    setOpen(false)
    setPassword("")
    setConfirm("")
    setNonce("")
    setStep("form")
    setError(null)
  }

  const sendReset = async () => {
    if (resetBusy) return
    setResetBusy(true)
    setResetNote(null)
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" } })
      const data = await res.json().catch(() => null)
      if (res.ok) setResetNote({ tone: "ok", text: tt("We sent a reset link to {email}. It works for one hour.", { email }) })
      else setResetNote({ tone: "error", text: (data && data.error) || tt("We could not send the link. Try again in a moment.") })
    } catch {
      setResetNote({ tone: "error", text: tt("Could not reach Storelib. Check your connection and try again.") })
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <section className={CARD} aria-labelledby="password-heading" data-settings-card="password">
      <h3 id="password-heading" className="text-[15px] font-semibold text-[#1a1a2e]">
        {tt("Password")}
      </h3>
      <p className="mt-1 text-[13px] leading-[1.45] text-[#6b7280]">
        {hasPassword
          ? tt("Changing it signs you out on your other devices.")
          : tt("You sign in with {value}. Set a password to sign in with your email too.", { value: via || tt("another account") })}
      </p>

      {!open ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              setDone(false)
              setResetNote(null)
            }}
            className={OPEN_STEP}
            data-password-open=""
          >
            {hasPassword ? tt("Change password") : tt("Set a password")}
          </button>
          {hasPassword ? (
          <button type="button" onClick={sendReset} disabled={resetBusy} className={TEXT_ACTION} data-password-reset="">
            {resetBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {tt("Email me a reset link")}
          </button>
          ) : null}
        </div>
      ) : (
      <>
      {/*
        NOT A <form>. Settings draws every tab inside its own form (the one the
        save bar submits), and a form inside a form is invalid HTML whose
        submit still reaches the outer one: pressing Change password saved the
        whole Settings page. Enter in a field is handled here instead, and
        stopped, so it cannot submit the outer form either.
      */}
      <div
        role="group"
        aria-labelledby="password-heading"
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault()
            void change()
          }
        }}
      >
        {/* For password managers: which account this password belongs to. */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">{hasPassword ? tt("New password") : tt("Password")}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD}
            data-password-field="new"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">{hasPassword ? tt("Confirm new password") : tt("Confirm password")}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={FIELD}
            data-password-field="confirm"
          />
        </label>

        {step === "reauth" && (
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">{tt("Code from your email")}</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={nonce}
              onChange={(e) => setNonce(e.target.value.replace(/\s/g, ""))}
              className={`${FIELD} tracking-[0.2em]`}
            />
            <span className="mt-1.5 block text-[12px] text-[#6b7280]">{tt("Sent to {email}.", { email })}</span>
          </label>
        )}

        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center">
          <button type="button" onClick={() => void change()} disabled={busy || !password || !confirm || (step === "reauth" && !nonce)} className={INK} data-password-submit="">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {step === "reauth" ? tt("Confirm and change") : hasPassword ? tt("Change password") : tt("Set password")}
          </button>
          <button type="button" onClick={cancel} disabled={busy} className={OPEN_STEP} data-password-cancel="">
            {tt("Cancel")}
          </button>
        </div>
      </div>

      </>
      )}

      {error && <Note tone="error">{error}</Note>}
      {done && <Note tone="ok">{hasPassword ? tt("Password changed. Your other devices were signed out.") : tt("Password set. You can now sign in with your email and this password.")}</Note>}
      {resetNote && <Note tone={resetNote.tone}>{resetNote.text}</Note>}
    </section>
  )
}

/* ─────────────────────────────── Security ─────────────────────────────── */

export function SecurityPanel({
  email,
  createdAt,
  onSignOut,
  onSignOutEverywhere,
  signingOutEverywhere,
  onDeleteAccount,
}: {
  email: string
  createdAt: string | null | undefined
  onSignOut: () => void
  onSignOutEverywhere: () => void
  signingOutEverywhere: boolean
  onDeleteAccount: () => void
}) {
  return (
    <div className="space-y-4 sm:space-y-6" data-account-panel="security">
      <PasswordCard email={email} />

      <section className={CARD} aria-labelledby="sessions-heading" data-settings-card="sessions">
        <h3 id="sessions-heading" className="mb-4 text-[15px] font-semibold text-[#1a1a2e]">
          {tt("Signed in")}
        </h3>
        <div className="divide-y divide-[#f0f1f3]">
          <div className="flex items-center justify-between gap-4 pb-3" data-session-row="this">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("This device")}</p>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">{tt("Your other devices stay signed in.")}</p>
            </div>
            <button type="button" onClick={onSignOut} className={`${QUIET} shrink-0`}>
              {tt("Sign out")}
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 pt-3" data-session-row="all">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Every device")}</p>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">{tt("Phones, computers and the app, this one included.")}</p>
            </div>
            <button type="button" onClick={onSignOutEverywhere} disabled={signingOutEverywhere} className={`${QUIET} shrink-0`}>
              {signingOutEverywhere && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {tt("Sign out everywhere")}
            </button>
          </div>
        </div>
      </section>

      <section className={CARD} aria-labelledby="delete-heading" data-settings-card="delete">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 id="delete-heading" className="text-[15px] font-semibold text-[#1a1a2e]">
              {tt("Delete account")}
            </h3>
            <p className="mt-1 text-[13px] leading-[1.45] text-[#6b7280]">
              {tt("Removes your store, products, customers and sales history for good.")}
            </p>
            {createdAt && (
              <p className="mt-2 text-[12px] text-[#6b7280]">
                {tt("Account created {date}", { date: new Date(createdAt).toLocaleDateString(appLocale(), zoned({ month: "long", day: "numeric", year: "numeric" })) })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onDeleteAccount}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#1a1a2e] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#2d2d44]"
          >
            {tt("Delete account")}
          </button>
        </div>
      </section>
    </div>
  )
}

/* ─────────────────────────────── Email change ─────────────────────────────── */

/**
 * The inside of the "Change email" sheet. Step one sends a code to the new
 * address and one to the current address (app/api/auth/change-email); step
 * two takes both (app/api/auth/verify-email-change).
 */
export function EmailChangeFlow({
  currentEmail,
  onChanged,
}: {
  currentEmail: string
  onChanged: (newEmail: string) => void
}) {
  const [step, setStep] = useState<"input" | "verify" | "done">("input")
  const [newEmail, setNewEmail] = useState("")
  const [double, setDouble] = useState(true)
  const [code, setCode] = useState("")
  const [currentCode, setCurrentCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, data }
  }

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const clean = newEmail.trim().toLowerCase()
    if (!clean || clean === currentEmail.toLowerCase()) {
      setError(tt("Enter the new email you want to use."))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { ok, data } = await post("/api/auth/change-email", { newEmail: clean })
      if (!ok) {
        setError((data && data.error) || tt("We could not send the code. Try again in a moment."))
        return
      }
      setDouble(data?.double !== false)
      setCode("")
      setCurrentCode("")
      setStep("verify")
    } catch {
      setError(tt("Could not reach Storelib. Check your connection and try again."))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { ok, data } = await post("/api/auth/verify-email-change", { code: code.trim(), currentCode: currentCode.trim() })
      if (!ok) {
        setError((data && data.error) || tt("That did not work. Try again in a moment."))
        return
      }
      /* The new address is in the account now; a fresh token carries it too. */
      try {
        await createClient().auth.refreshSession()
      } catch {
        /* the next renewal picks it up */
      }
      setStep("done")
      onChanged(data?.newEmail || newEmail.trim().toLowerCase())
    } catch {
      setError(tt("Could not reach Storelib. Check your connection and try again."))
    } finally {
      setBusy(false)
    }
  }

  if (step === "done") {
    return (
      <div className="py-4" data-email-change="done">
        <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Email changed")}</p>
        <p className="mt-1 text-[13px] leading-[1.45] text-[#6b7280]">
          {tt("You now sign in with")} <span className="font-medium text-[#1a1a2e]">{newEmail.trim().toLowerCase()}</span>{tt(". We told your old address too.")}
        </p>
      </div>
    )
  }

  if (step === "input") {
    return (
      <form onSubmit={send} className="space-y-4" data-email-change="input" noValidate>
        <p className="text-[13px] leading-[1.45] text-[#6b7280]">
          {tt("We send a code to the new address and one to")} <span className="font-medium text-[#1a1a2e]">{currentEmail}</span>{tt(". Both are needed.")}
        </p>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">{tt("New email")}</span>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className={FIELD}
          />
        </label>
        {error && <Note tone="error">{error}</Note>}
        <button type="submit" disabled={busy || !newEmail.trim()} className={`${PRIMARY} w-full`}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {tt("Send codes")}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={verify} className="space-y-4" data-email-change="verify" noValidate>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">
          {tt("Code sent to")} <span className="break-all text-[#1a1a2e]">{newEmail.trim().toLowerCase()}</span>
        </span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className={`${FIELD} text-center text-[18px] font-semibold tracking-[0.3em]`}
        />
      </label>
      {double && (
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">
            {tt("Code sent to")} <span className="break-all text-[#1a1a2e]">{currentEmail}</span>
          </span>
          <input
            inputMode="numeric"
            maxLength={6}
            value={currentCode}
            onChange={(e) => setCurrentCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className={`${FIELD} text-center text-[18px] font-semibold tracking-[0.3em]`}
          />
        </label>
      )}
      {error && <Note tone="error">{error}</Note>}
      <button
        type="submit"
        disabled={busy || code.length !== 6 || (double && currentCode.length !== 6)}
        className={`${PRIMARY} w-full`}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {tt("Change email")}
      </button>
      <button
        type="button"
        onClick={() => {
          setStep("input")
          setError(null)
        }}
        className="h-11 w-full text-[13px] font-medium text-[#6b7280] hover:text-[#374151]"
      >
        {tt("Use a different email")}
      </button>
    </form>
  )
}
