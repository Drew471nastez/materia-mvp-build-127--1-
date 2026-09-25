"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Check, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { accountErrorKind, accountErrorMessage, passwordProblem } from "@/lib/auth/account-errors"
import { readConsent, writeConsent, onConsentChange } from "@/lib/consent/client"
import { everything } from "@/lib/consent/consent"

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

const CARD = "bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]"
const FIELD =
  "h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-[14px] text-[#1a1a2e] outline-none transition-colors " +
  "placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
const PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#8b5cf6] px-5 text-[14px] font-medium text-white " +
  "transition-colors hover:bg-[#7c3aed] disabled:cursor-not-allowed disabled:bg-[#c4b5fd]"
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
 * around a 44 by 24 track, so a thumb on a phone does not have to find the
 * track itself. The knob moves by transform only.
 */
export function Switch({
  checked,
  onChange,
  label,
  busy,
  id,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  busy?: boolean
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
      onClick={() => onChange(!checked)}
      className="group relative -mr-1.5 inline-flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40"
    >
      <span
        aria-hidden="true"
        className={`relative block h-6 w-11 rounded-full transition-colors duration-150 ${checked ? "bg-[#8b5cf6]" : "bg-[#d1d5db]"}`}
      >
        <span
          className="absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.2)] transition-transform duration-150 motion-reduce:transition-none"
          style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
        />
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
function useSavedSwitch(initial: boolean, save: (value: boolean) => Promise<void>) {
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
          setError(e instanceof Error && e.message ? e.message : "That did not save. Try again.")
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

function Saved({ at }: { at: number }) {
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
          Saved
        </>
      )}
    </span>
  )
}

function PrivacyRow({
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

async function savePreference(body: Record<string, boolean>) {
  let res: Response
  try {
    res = await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error("Could not reach Storelib. Check your connection and try again.")
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error((data && typeof data.error === "string" && data.error) || "That did not save. Try again.")
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
          Privacy
        </h3>
        <div className="divide-y divide-[#f0f1f3]">
          <PrivacyRow
            id="personalized"
            title={
              <>
                Personalized recommendations
                <Saved at={personalized.savedAt} />
              </>
            }
            detail={
              <>
                Explore shows products like the ones you bought or saved first.
                {personalized.error && <span className="mt-1 block text-red-600">{personalized.error}</span>}
              </>
            }
            control={
              <Switch
                label="Personalized recommendations"
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
                Storelib newsletter
                <Saved at={newsletter.savedAt} />
              </>
            }
            detail={
              <>
                Weekly assets and new templates, sent to <span className="break-all text-[#374151]">{email}</span>.
                {newsletter.error && <span className="mt-1 block text-red-600">{newsletter.error}</span>}
              </>
            }
            control={
              <Switch label="Storelib newsletter" checked={newsletter.value} busy={newsletter.busy} onChange={newsletter.change} />
            }
          />
          <PrivacyRow
            id="analytics"
            title={
              <>
                Analytics on this device
                <Saved at={analyticsSavedAt} />
              </>
            }
            detail="Counts visits and page speed in this browser. Off stores nothing."
            control={<Switch label="Analytics on this device" checked={analytics} onChange={changeAnalytics} />}
          />
        </div>
      </section>
    </div>
  )
}

/* ─────────────────────────────── Password ─────────────────────────────── */

function PasswordCard({ email }: { email: string }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [nonce, setNonce] = useState("")
  const [step, setStep] = useState<"form" | "reauth">("form")
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
      setDone(true)
      setPassword("")
      setConfirm("")
      setNonce("")
      setStep("form")
    } catch (err) {
      setError(accountErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const sendReset = async () => {
    if (resetBusy) return
    setResetBusy(true)
    setResetNote(null)
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" } })
      const data = await res.json().catch(() => null)
      if (res.ok) setResetNote({ tone: "ok", text: `We sent a reset link to ${email}. It works for one hour.` })
      else setResetNote({ tone: "error", text: (data && data.error) || "We could not send the link. Try again in a moment." })
    } catch {
      setResetNote({ tone: "error", text: "Could not reach Storelib. Check your connection and try again." })
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <section className={CARD} aria-labelledby="password-heading" data-settings-card="password">
      <h3 id="password-heading" className="text-[15px] font-semibold text-[#1a1a2e]">
        Password
      </h3>
      <p className="mt-1 text-[13px] leading-[1.45] text-[#6b7280]">
        Changing it signs you out on your other devices.
      </p>

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
          <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD}
            data-password-field="new"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">Confirm new password</span>
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
            <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">Code from your email</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={nonce}
              onChange={(e) => setNonce(e.target.value.replace(/\s/g, ""))}
              className={`${FIELD} tracking-[0.2em]`}
            />
            <span className="mt-1.5 block text-[12px] text-[#6b7280]">Sent to {email}.</span>
          </label>
        )}

        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center">
          <button type="button" onClick={() => void change()} disabled={busy || !password || !confirm || (step === "reauth" && !nonce)} className={PRIMARY} data-password-submit="">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {step === "reauth" ? "Confirm and change" : "Change password"}
          </button>
          <button type="button" onClick={sendReset} disabled={resetBusy} className={QUIET} data-password-reset="">
            {resetBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Email me a reset link
          </button>
        </div>
      </div>

      {error && <Note tone="error">{error}</Note>}
      {done && <Note tone="ok">Password changed. Your other devices were signed out.</Note>}
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
          Signed in
        </h3>
        <div className="divide-y divide-[#f0f1f3]">
          <div className="flex items-center justify-between gap-4 pb-3" data-session-row="this">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[#1a1a2e]">This device</p>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">Your other devices stay signed in.</p>
            </div>
            <button type="button" onClick={onSignOut} className={`${QUIET} shrink-0`}>
              Sign out
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 pt-3" data-session-row="all">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[#1a1a2e]">Every device</p>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">Phones, computers and the app, this one included.</p>
            </div>
            <button type="button" onClick={onSignOutEverywhere} disabled={signingOutEverywhere} className={`${QUIET} shrink-0`}>
              {signingOutEverywhere && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Sign out everywhere
            </button>
          </div>
        </div>
      </section>

      <section className={CARD} aria-labelledby="delete-heading" data-settings-card="delete">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 id="delete-heading" className="text-[15px] font-semibold text-[#1a1a2e]">
              Delete account
            </h3>
            <p className="mt-1 text-[13px] leading-[1.45] text-[#6b7280]">
              Removes your store, products, customers and sales history for good.
            </p>
            {createdAt && (
              <p className="mt-2 text-[12px] text-[#6b7280]">
                Account created {new Date(createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onDeleteAccount}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#1a1a2e] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#2d2d44]"
          >
            Delete account
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
      setError("Enter the new email you want to use.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { ok, data } = await post("/api/auth/change-email", { newEmail: clean })
      if (!ok) {
        setError((data && data.error) || "We could not send the code. Try again in a moment.")
        return
      }
      setDouble(data?.double !== false)
      setCode("")
      setCurrentCode("")
      setStep("verify")
    } catch {
      setError("Could not reach Storelib. Check your connection and try again.")
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
        setError((data && data.error) || "That did not work. Try again in a moment.")
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
      setError("Could not reach Storelib. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  if (step === "done") {
    return (
      <div className="py-4" data-email-change="done">
        <p className="text-[15px] font-semibold text-[#1a1a2e]">Email changed</p>
        <p className="mt-1 text-[13px] leading-[1.45] text-[#6b7280]">
          You now sign in with <span className="font-medium text-[#1a1a2e]">{newEmail.trim().toLowerCase()}</span>. We told your old address too.
        </p>
      </div>
    )
  }

  if (step === "input") {
    return (
      <form onSubmit={send} className="space-y-4" data-email-change="input" noValidate>
        <p className="text-[13px] leading-[1.45] text-[#6b7280]">
          We send a code to the new address and one to <span className="font-medium text-[#1a1a2e]">{currentEmail}</span>. Both are needed.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">New email</span>
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
          Send codes
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={verify} className="space-y-4" data-email-change="verify" noValidate>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-[#374151]">
          Code sent to <span className="break-all text-[#1a1a2e]">{newEmail.trim().toLowerCase()}</span>
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
            Code sent to <span className="break-all text-[#1a1a2e]">{currentEmail}</span>
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
        Change email
      </button>
      <button
        type="button"
        onClick={() => {
          setStep("input")
          setError(null)
        }}
        className="h-11 w-full text-[13px] font-medium text-[#6b7280] hover:text-[#374151]"
      >
        Use a different email
      </button>
    </form>
  )
}
