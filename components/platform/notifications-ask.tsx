"use client"

/**
 * ===========================================================================
 *  ASKING FOR NOTIFICATIONS, AND FOR THE CAMERA AND PHOTOS, NOW AND THEN
 * ===========================================================================
 * The app asks for what it needs at a moment it matters, with a short sheet
 * of its own before the phone's prompt (lib/native-permissions-rule.ts
 * permissionAskStep decides):
 *
 *   NOTIFICATIONS   on a seller's /app, and at the moments a notification
 *                   is the obvious next thing (joining, posting,
 *                   commenting, a product on sale: lib/notifications/nudge)
 *   CAMERA, PHOTOS  on a product's page, where adding pictures is next
 *
 *   never asked     the sheet says what it is for; its button shows the
 *                   phone's own prompt (iOS shows that once per install)
 *   refused         the sheet opens the phone's Settings, the only place a
 *                   "Don't Allow" is undone
 *
 * Never before sign in, so never on a first launch's welcome. At most one
 * sheet per launch, whatever the kind, and each kind at most every seven
 * days, a limited number of times per install. Not over a sheet already open.
 *
 * A yes to notifications registers the phone (components/native-push-init.tsx,
 * lib/push/client.ts) and turns the account's own switch on, so a push has
 * somewhere to land. Drawn by components/platform/access-sheet.tsx, like every
 * refused permission.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { AccessSheetView } from "@/components/platform/access-sheet"
import { askPushPermission, inNativeApp, nativePlatform, openPhoneSettings, readPushPermission } from "@/lib/native-push"
import { askMediaPermission, mediaOffSheet, readMediaPermission, type AccessRequest } from "@/lib/native-permissions"
import { isMediaMoment, isNotificationsMoment, mediaAskPermission, permissionAskStep, type AskKind, type AskStep, type PermissionAskRecord } from "@/lib/native-permissions-rule"
import { NUDGE_EVENT, NUDGE_WORDS, type NudgeMoment } from "@/lib/notifications/nudge"

/* The same route Settings reads and writes (components/account/push-switch-row.tsx), named here so the root layout does not pull the Settings screen into every page. */
const PUSH_ROUTE = "/api/me/push"

/** When each kind's sheet was last shown, kept on this phone only. Notifications keep the key they always had. */
const KEYS: Record<AskKind, string> = { notifications: "storelib_push_ask", media: "storelib_media_ask" }
/** One sheet per launch. The web view keeps sessionStorage across page loads and drops it when the app is closed. */
const SESSION_KEY = "storelib_permission_asked"

function readRecord(kind: AskKind): PermissionAskRecord | null {
  try {
    const raw = window.localStorage.getItem(KEYS[kind])
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PermissionAskRecord>
    if (typeof parsed?.at !== "number" || typeof parsed?.count !== "number") return null
    return { at: parsed.at, count: parsed.count }
  } catch {
    return null
  }
}

function writeRecord(kind: AskKind): void {
  try {
    window.localStorage.setItem(KEYS[kind], JSON.stringify({ at: Date.now(), count: (readRecord(kind)?.count ?? 0) + 1 }))
  } catch {
    /* The worst case is being asked again next launch. */
  }
}

let askedThisLaunch = false
/* Kinds already allowed (or with no plugin) on this launch: not read again on every page. */
const settled = new Set<AskKind>()
function askedThisSession(): boolean {
  if (askedThisLaunch) return true
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1"
  } catch {
    return false
  }
}
function markAsked(): void {
  askedThisLaunch = true
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1")
  } catch {
    /* The module flag still holds for this page. */
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

/** Something else is already over the page: ask another time instead of stacking on it. */
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

interface Sheet {
  kind: AskKind
  step: Exclude<AskStep, null>
  moment: NudgeMoment | null
}

/** The sheet's words, in this phone's own terms. Exported for tests/native-permissions-ask.test.ts. */
export function sheetWords(sheet: Sheet, platform: "ios" | "android" | null): AccessRequest {
  const android = platform === "android"
  const device = android ? "phone" : "iPhone"
  if (sheet.kind === "media") {
    if (sheet.step === "settings") return mediaOffSheet("camera")
    return {
      kind: "camera",
      title: "Add photos from your phone",
      body: `Allow the camera and your photos to take or pick pictures for your products. Your ${device} asks next.`,
      primary: { label: "Allow access", run: () => undefined },
    }
  }
  const words = sheet.moment ? NUDGE_WORDS[sheet.moment] : null
  if (sheet.step === "explain") {
    return {
      kind: "notifications",
      title: words?.title ?? "Know the moment you make a sale",
      body: `Storelib tells you on this ${device} when an order comes in, a payout is ready, or someone replies. Your ${device} asks next.`,
      primary: { label: "Turn on notifications", run: () => undefined },
    }
  }
  return {
    kind: "notifications",
    title: words?.title ?? "Notifications are off",
    body: words
      ? `${words.body(device)} Turn on ${android ? "notifications" : "Allow Notifications"} for Storelib.`
      : `Sales, payouts, replies and new posts in your communities can't reach this ${device}. Turn on ${android ? "notifications" : "Allow Notifications"} for Storelib.`,
  }
}

/* After the page has painted, and after a moment's own sheet or editor has closed. */
const SETTLE_MS = 1200
const NUDGE_AFTER_MS = 900
const TRIES = 5

export function NotificationsAsk() {
  const pathname = usePathname() ?? ""
  const [sheet, setSheet] = React.useState<Sheet | null>(null)
  const [closing, setClosing] = React.useState(false)
  const showing = React.useRef(false)
  /* Open Settings was tapped: the next return to the app reads the answer. */
  const wentToSettings = React.useRef<AskKind | null>(null)
  const timers = React.useRef(new Set<number>())

  const later = React.useCallback((run: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t)
      run()
    }, ms)
    timers.current.add(t)
  }, [])

  /** Reads the phone, asks the rule, and shows the sheet when it says so. */
  const consider = React.useCallback(
    async (kind: AskKind, moment: NudgeMoment | null, tries: number): Promise<void> => {
      if (showing.current || askedThisSession() || settled.has(kind)) return
      if (!(await signedIn())) return
      const permission =
        kind === "notifications" ? await readPushPermission() : mediaAskPermission(await readMediaPermission("camera"), await readMediaPermission("photos"))
      if (permission === "granted" || permission === "limited" || permission === "unsupported") settled.add(kind)
      const step = permissionAskStep({ signedIn: true, askedThisSession: askedThisSession(), permission, record: readRecord(kind) }, Date.now())
      if (!step) return
      if (pageIsBusy()) {
        if (tries > 1) later(() => void consider(kind, moment, tries - 1), NUDGE_AFTER_MS)
        return
      }
      if (showing.current || askedThisSession()) return
      showing.current = true
      markAsked()
      writeRecord(kind)
      setSheet({ kind, step, moment })
    },
    [later],
  )

  /* A page where it matters: a product's page for photos, a seller's /app for notifications. */
  React.useEffect(() => {
    if (!inNativeApp()) return
    const kind: AskKind | null = isMediaMoment(pathname) ? "media" : isNotificationsMoment(pathname) ? "notifications" : null
    if (!kind) return
    const t = window.setTimeout(() => void consider(kind, null, TRIES), SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [pathname, consider])

  React.useEffect(() => {
    if (!inNativeApp()) return
    const all = timers.current
    /* A moment that matters: once per moment per launch, on the same budget. */
    const nudged = new Set<NudgeMoment>()
    const onNudge = (event: Event) => {
      const at = (event as CustomEvent<NudgeMoment>).detail
      if (!at || !(at in NUDGE_WORDS) || nudged.has(at)) return
      nudged.add(at)
      later(() => void consider("notifications", at, TRIES), NUDGE_AFTER_MS)
    }
    window.addEventListener(NUDGE_EVENT, onNudge)

    /* Back from the phone's Settings: with notifications on, register and turn the account's switch on now, not at the next launch. */
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !wentToSettings.current) return
      const kind = wentToSettings.current
      wentToSettings.current = null
      if (kind !== "notifications") return
      void readPushPermission().then(async (permission) => {
        if (permission !== "granted") return
        const { registerDevice } = await import("@/lib/push/client")
        await registerDevice().catch(() => undefined)
        await accountOn()
      })
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      for (const t of all) window.clearTimeout(t)
      all.clear()
      window.removeEventListener(NUDGE_EVENT, onNudge)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [consider, later])

  const close = () => {
    setClosing(true)
    window.setTimeout(() => {
      showing.current = false
      setSheet(null)
      setClosing(false)
    }, 220)
  }

  /* Inside the tap, so the phone's prompt or Settings it opens counts as the person's own. */
  const primary = () => {
    const was = sheet
    close()
    if (!was) return
    if (was.step === "settings") {
      wentToSettings.current = openPhoneSettings() ? was.kind : null
      return
    }
    if (was.kind === "notifications") {
      void askPushPermission().then((answer) => (answer === "granted" ? accountOn() : undefined))
      return
    }
    void (async () => {
      if ((await askMediaPermission("camera")) === "unsupported") return
      if ((await readMediaPermission("photos")) === "prompt") await askMediaPermission("photos")
    })()
  }

  if (!sheet || typeof document === "undefined") return null
  const request = sheetWords(sheet, nativePlatform())

  return createPortal(
    <AccessSheetView
      request={request}
      closing={closing}
      asking={sheet.step === "explain"}
      onPrimary={primary}
      onLater={close}
      data={{ "data-push-ask": sheet.moment ?? "", "data-permission-ask": `${sheet.kind}:${sheet.step}` }}
      primaryData={{ "data-push-ask-allow": "" }}
      laterData={{ "data-push-ask-later": "" }}
    />,
    document.body,
  )
}
