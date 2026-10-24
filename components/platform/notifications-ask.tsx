"use client"

/**
 * ===========================================================================
 *  ASKING FOR NOTIFICATIONS ON EVERY INSTALL
 * ===========================================================================
 * The phone's own prompt is shown on the first launch after an install,
 * whether or not anybody is signed in, and whether or not this account had
 * the app before. Deleting the app resets what iOS and Android remember, so
 * every install is asked again.
 *
 * A yes registers the phone as soon as someone is signed in
 * (components/native-push-init.tsx). A "Don't Allow" can only be undone in
 * the phone's settings, so from time to time (lib/notifications/push-ask-rule)
 * a sheet says notifications are off and opens those settings in one tap.
 *
 * The same sheet comes at the moments a notification matters most (joining a
 * community, posting, commenting, a product on sale: lib/notifications/nudge),
 * in that moment's words, on the same budget, so the reminders never add up.
 * Drawn by components/platform/access-sheet.tsx, like every refused permission.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { AccessSheetView } from "@/components/platform/access-sheet"
import { askPushPermission, inNativeApp, nativePlatform, openPhoneSettings, readPushPermission } from "@/lib/native-push"
import { shouldAsk, type AskRecord } from "@/lib/notifications/push-ask-rule"
import { NUDGE_EVENT, NUDGE_WORDS, type NudgeMoment } from "@/lib/notifications/nudge"

/* The same route Settings reads and writes (components/account/push-switch-row.tsx), named here so the root layout does not pull the Settings screen into every page. */
const PUSH_ROUTE = "/api/me/push"

/** When the off reminder was last shown, kept on this phone only. */
const KEY = "storelib_push_ask"

function readRecord(): AskRecord | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AskRecord>
    if (typeof parsed?.at !== "number" || typeof parsed?.count !== "number") return null
    return { at: parsed.at, count: parsed.count }
  } catch {
    return null
  }
}

function writeRecord(record: AskRecord): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    /* The worst case is being reminded again next launch. */
  }
}

async function signedIn(): Promise<boolean> {
  try {
    const { createClient } = await import("@/lib/supabase/client")
    const { data } = await createClient().auth.getSession()
    return !!data.session
  } catch {
    return false
  }
}

/** Something else is already over the page: remind on the next launch instead of stacking on it. */
function pageIsBusy(): boolean {
  return !!document.querySelector('[role="dialog"], [data-payments-setup-panel], [data-id-camera]')
}

/** A yes from the phone while signed in turns the account's own switch on, so a push has somewhere to land. */
async function accountOn(): Promise<void> {
  if (!(await signedIn())) return
  await fetch(PUSH_ROUTE, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  }).catch(() => undefined)
}

/* A moment just finished (a post sent, a community joined): its own sheet or editor is still closing. Wait for it, a few times. */
const NUDGE_AFTER_MS = 900
const NUDGE_TRIES = 5

export function NotificationsAsk() {
  const [open, setOpen] = React.useState(false)
  const [closing, setClosing] = React.useState(false)
  const [moment, setMoment] = React.useState<NudgeMoment | null>(null)
  const showing = React.useRef(false)
  React.useEffect(() => {
    showing.current = open
  }, [open])
  /* Open Settings was tapped: the next return to the app reads the answer. */
  const wentToSettings = React.useRef(false)

  React.useEffect(() => {
    if (!inNativeApp()) return
    let gone = false

    const decide = async () => {
      if (gone) return
      const permission = await readPushPermission()
      if (permission === "prompt") {
        const answer = await askPushPermission()
        if (answer === "granted" && (await signedIn())) {
          /* The phone says yes, so the account says yes: a push has somewhere to land. */
          await fetch(PUSH_ROUTE, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
          }).catch(() => undefined)
        }
        return
      }
      if (permission !== "denied") return
      if (!shouldAsk(readRecord(), Date.now())) return
      if (!gone && !pageIsBusy()) setOpen(true)
    }

    /* After the splash and the first page have painted. */
    const start = window.setTimeout(() => void decide(), 1200)

    /* A moment that matters: once per moment per launch. */
    const nudged = new Set<NudgeMoment>()
    const timers = new Set<number>()
    const later = (run: () => void, ms: number) => {
      const t = window.setTimeout(() => {
        timers.delete(t)
        run()
      }, ms)
      timers.add(t)
    }
    const onNudge = (event: Event) => {
      const at = (event as CustomEvent<NudgeMoment>).detail
      if (!at || !(at in NUDGE_WORDS) || nudged.has(at)) return
      nudged.add(at)
      const attempt = async (tries: number) => {
        if (gone || showing.current) return
        const permission = await readPushPermission()
        if (permission === "prompt") {
          /* Never asked on this install (the launch ask was missed): the phone's own prompt, now. */
          if ((await askPushPermission()) === "granted") await accountOn()
          return
        }
        if (permission !== "denied" || !shouldAsk(readRecord(), Date.now())) return
        if (pageIsBusy()) {
          if (tries > 1) later(() => void attempt(tries - 1), NUDGE_AFTER_MS)
          return
        }
        if (gone || showing.current) return
        showing.current = true
        setMoment(at)
        setOpen(true)
      }
      later(() => void attempt(NUDGE_TRIES), NUDGE_AFTER_MS)
    }
    window.addEventListener(NUDGE_EVENT, onNudge)

    /* Back from the phone's Settings with notifications on: register and turn the account's switch on now, not at the next launch. */
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !wentToSettings.current) return
      wentToSettings.current = false
      void readPushPermission().then(async (permission) => {
        if (permission !== "granted") return
        const { registerDevice } = await import("@/lib/push/client")
        await registerDevice().catch(() => undefined)
        await accountOn()
      })
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      gone = true
      window.clearTimeout(start)
      for (const t of timers) window.clearTimeout(t)
      window.removeEventListener(NUDGE_EVENT, onNudge)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  const close = () => {
    writeRecord({ at: Date.now(), count: (readRecord()?.count ?? 0) + 1 })
    setClosing(true)
    window.setTimeout(() => {
      setOpen(false)
      setClosing(false)
      setMoment(null)
    }, 220)
  }

  const openSettings = () => {
    wentToSettings.current = openPhoneSettings()
    close()
  }

  if (!open || typeof document === "undefined") return null
  const android = nativePlatform() === "android"
  const device = android ? "phone" : "iPhone"
  const words = moment ? NUDGE_WORDS[moment] : null

  return createPortal(
    <AccessSheetView
      request={{
        kind: "notifications",
        title: words?.title ?? "Notifications are off",
        body: words
          ? `${words.body(device)} Turn on ${android ? "notifications" : "Allow Notifications"} for Storelib.`
          : `Sales, payouts, replies and new posts in your communities can't reach this ${device}. Turn on ${android ? "notifications" : "Allow Notifications"} for Storelib.`,
      }}
      closing={closing}
      onPrimary={openSettings}
      onLater={close}
      data={{ "data-push-ask": moment ?? "" }}
      primaryData={{ "data-push-ask-allow": "" }}
      laterData={{ "data-push-ask-later": "" }}
    />,
    document.body,
  )
}
