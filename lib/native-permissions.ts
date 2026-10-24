"use client"

/**
 * ===========================================================================
 *  CAMERA AND PHOTOS IN THE APP: ASKING, AND AFTER A NO
 * ===========================================================================
 * iOS and Android each ask the person once. The question itself is the
 * phone's: iOS shows it the first time a photo is taken (Info.plist,
 * NSCameraUsageDescription) and Android the first time the camera opens
 * (AndroidManifest CAMERA, Capacitor's BridgeWebChromeClient). After a "Don't
 * Allow" the phone never asks again, and the camera simply does not open. That
 * is the case this file is for: it knows the answer before the tap, so the
 * tap can say "Camera is off for Storelib" with one button to the phone's
 * Settings, instead of a black camera screen or nothing at all.
 *
 *   readMediaPermission(kind)   what the phone says now, without asking
 *   askMediaPermission(kind)    the phone's own prompt, where it can still ask
 *   knownCameraPermission()     the last answer read, for a tap that has to
 *                               decide before anything async can run
 *   openAppSettings()           Storelib's page in the phone's Settings
 *   showAccessSheet(request)    the sheet, drawn by components/platform/
 *                               access-sheet.tsx (mounted in the root layout)
 *
 * Choosing a photo from the library needs no permission on either phone: the
 * file input opens the system photo picker (PHPicker on iOS, the photo picker
 * on Android), which hands over only what the person picks. So nothing here
 * asks for full library access, and App Review would not like it if it did.
 *
 * "unsupported" is a browser, a server render, or an app build without the
 * Camera plugin (an Android build from before `npx cap sync`). Nothing is
 * shown there and the phone behaves as it always did.
 */

export type MediaKind = "camera" | "photos"
export type MediaPermission = "granted" | "limited" | "prompt" | "denied" | "unsupported"

type CapacitorLike = { isNativePlatform?: () => boolean; getPlatform?: () => string }

function capacitor(): CapacitorLike | undefined {
  if (typeof window === "undefined") return undefined
  return (window as unknown as { Capacitor?: CapacitorLike }).Capacitor
}

/** Whether this is the Storelib app, not a browser. */
export function inNativeApp(): boolean {
  const cap = capacitor()
  try {
    return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform() === true
  } catch {
    return false
  }
}

/** "ios", "android", or null off the app. */
export function nativePlatform(): "ios" | "android" | null {
  if (!inNativeApp()) return null
  const p = capacitor()?.getPlatform?.()
  return p === "ios" || p === "android" ? p : null
}

/** The plugin's words as ours. Android's "prompt-with-rationale" can still be asked. */
export function mediaPermissionFrom(state: unknown): MediaPermission {
  if (state === "granted") return "granted"
  if (state === "limited") return "limited"
  if (state === "denied") return "denied"
  if (state === "prompt" || state === "prompt-with-rationale") return "prompt"
  return "unsupported"
}

/** Whether the phone will hand over what was asked for: a limited library still opens. */
export function allowed(permission: MediaPermission): boolean {
  return permission === "granted" || permission === "limited"
}

async function plugin() {
  const { Camera } = await import("@capacitor/camera")
  return Camera
}

let lastCamera: MediaPermission = "unsupported"

/** The camera's last known answer. Read again at launch, on every return to the app, and after each ask. */
export function knownCameraPermission(): MediaPermission {
  return lastCamera
}

/** What the phone says now. Never shows a prompt. */
export async function readMediaPermission(kind: MediaKind): Promise<MediaPermission> {
  if (!inNativeApp()) return "unsupported"
  try {
    const state = mediaPermissionFrom((await (await plugin()).checkPermissions())[kind])
    if (kind === "camera") lastCamera = state
    return state
  } catch {
    return "unsupported"
  }
}

/**
 * Asks the phone, where it still can. After a no it answers "denied" at once
 * without showing anything, which is when the caller shows the sheet.
 */
export async function askMediaPermission(kind: MediaKind): Promise<MediaPermission> {
  if (!inNativeApp()) return "unsupported"
  try {
    const state = mediaPermissionFrom((await (await plugin()).requestPermissions({ permissions: [kind] }))[kind])
    if (kind === "camera") lastCamera = state
    return state
  } catch {
    return "unsupported"
  }
}

/**
 * Opens Storelib's page in the phone's own Settings, the only place a "Don't
 * Allow" can be undone. iOS: `app-settings:` is the system's address for it,
 * and Capacitor hands any address that is not the app's to iOS. Android: the
 * App info page, through StorelibNative.openAppSettings (MainActivity).
 */
export function openAppSettings(): boolean {
  const p = nativePlatform()
  if (p === "ios") {
    window.location.href = "app-settings:"
    return true
  }
  if (p === "android") {
    const bridge = (window as unknown as { StorelibNative?: { openAppSettings?: () => void } }).StorelibNative
    if (typeof bridge?.openAppSettings !== "function") return false
    try {
      bridge.openAppSettings()
      return true
    } catch {
      return false
    }
  }
  return false
}

/* ── the sheet ─────────────────────────────────────────────────────────── */

export type AccessKind = "camera" | "photos" | "microphone" | "notifications"

export interface AccessRequest {
  kind: AccessKind
  title: string
  body: string
  /** The main button. Defaults to Open Settings, which opens the phone's settings. */
  primary?: { label: string; run: () => void }
  /** A second way on, such as choosing from the library instead. Not now is always there. */
  secondary?: { label: string; run: () => void }
  /** Called once the sheet is gone, whichever button closed it. */
  onClose?: () => void
}

export const ACCESS_SHEET_EVENT = "storelib:access-sheet"

/** What travels with the event: the sheet marks it taken when it will show it. */
export interface AccessAsk {
  request: AccessRequest
  taken: boolean
}

/**
 * Shows the sheet. Returns false where nothing will draw it (a browser, a
 * published website, another sheet already open), so the caller can fall back.
 */
export function showAccessSheet(request: AccessRequest): boolean {
  if (typeof window === "undefined" || !inNativeApp()) return false
  const ask: AccessAsk = { request, taken: false }
  /* Dispatched synchronously: the sheet has answered by the time this returns. */
  window.dispatchEvent(new CustomEvent<AccessAsk>(ACCESS_SHEET_EVENT, { detail: ask }))
  return ask.taken
}

/** The phone's own words for where the switch is. */
export function settingsPath(kind: AccessKind, platform: "ios" | "android" | null): string {
  const name = kind === "camera" ? "Camera" : kind === "photos" ? "Photos" : kind === "microphone" ? "Microphone" : "Notifications"
  if (platform === "android") return kind === "notifications" ? "Settings, Apps, Storelib, Notifications" : `Settings, Apps, Storelib, Permissions, ${name}`
  return kind === "notifications" ? "Settings, Notifications, Storelib" : `Settings, Storelib, ${name}`
}

/** The sheet for a refused camera or library, in this phone's words. */
export function mediaOffSheet(kind: MediaKind, extra?: Pick<AccessRequest, "secondary" | "onClose">): AccessRequest {
  const where = settingsPath(kind, nativePlatform())
  return kind === "camera"
    ? { kind, title: "Camera is off for Storelib", body: `To take a photo here, turn it on in ${where}.`, ...extra }
    : { kind, title: "Photos are off for Storelib", body: `To add a photo from your library, turn it on in ${where}.`, ...extra }
}
