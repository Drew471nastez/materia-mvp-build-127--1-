/**
 * HOW OFTEN A PHOTO INPUT IS HELD WHILE THE CAMERA IS OFF.
 *
 * On iOS a photo input offers the library and Take Photo. The library works
 * with the camera off, so the sheet that says the camera is off
 * (components/platform/access-sheet.tsx) comes before the picker only now and
 * then, not on every photo someone adds. An input that only takes a photo is
 * held every time, without this rule.
 */

export const HOLD_AGAIN_AFTER_MS = 3 * 24 * 3600 * 1000

export function shouldHoldPicker(lastHeld: number | null, now: number): boolean {
  if (lastHeld === null) return true
  return now - lastHeld >= HOLD_AGAIN_AFTER_MS
}

/** Whether an input asks for photos or video. One with no accept is a file upload (a product's files), where the camera is beside the point. */
export function takesMedia(accept: string): boolean {
  const types = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
  return types.some((t) => t.startsWith("image/") || t.startsWith("video/") || /^\.(jpe?g|png|heic|heif|gif|webp|mov|mp4|m4v)$/.test(t))
}

/* ── The gentle ask, for notifications and for the camera and photos ───── */

/**
 * WHEN THE APP ASKS FOR A PERMISSION, AND HOW.
 *
 * Notifications (every sale and order on the phone) and the camera and
 * photos (adding pictures to a product) are asked for by the app itself, at a
 * moment they matter, never at random:
 *
 *   signed out                nothing: never on a first launch before sign in
 *   already asked this launch nothing: one ask per session, whatever the kind
 *   allowed, or no plugin     nothing
 *   not asked yet ("prompt")  "explain": a short Storelib sheet first, and
 *                             only its Allow shows the phone's own prompt. A
 *                             Not now is asked again after ASK_EVERY_MS.
 *   refused ("denied")        "settings": the sheet opens the phone's
 *                             Settings, the only place a no is undone. iOS
 *                             shows its own prompt once per install, so
 *                             after that this is the only way; Android says
 *                             "denied" only once its prompt is spent too.
 *                             Every ASK_EVERY_MS at most.
 *   asked ASK_AT_MOST_TIMES   nothing more on this install
 *
 * Pure, so tests/native-permissions-ask.test.ts holds it.
 */
export type AskKind = "notifications" | "media"
export type AskStep = "explain" | "settings" | null

export const ASK_EVERY_MS = 7 * 24 * 3600 * 1000
export const ASK_AT_MOST_TIMES = 8

export interface PermissionAskRecord {
  /** When the sheet for this kind was last shown. */
  at: number
  /** How many times in all, on this install. */
  count: number
}

export interface PermissionAskContext {
  signedIn: boolean
  /** A sheet for any kind was already shown on this launch. */
  askedThisSession: boolean
  /** What the phone says now (lib/native-push, lib/native-permissions words). */
  permission: "granted" | "limited" | "prompt" | "denied" | "unsupported"
  record: PermissionAskRecord | null
}

export function permissionAskStep(ctx: PermissionAskContext, now: number): AskStep {
  if (!ctx.signedIn || ctx.askedThisSession) return null
  if (ctx.permission !== "prompt" && ctx.permission !== "denied") return null
  const r = ctx.record
  if (r && r.count >= ASK_AT_MOST_TIMES) return null
  if (r && now - r.at < ASK_EVERY_MS) return null
  return ctx.permission === "prompt" ? "explain" : "settings"
}

/**
 * The camera and the library as one ask. Not asked yet when either is;
 * refused only when the camera is, since choosing from the library goes
 * through the system picker and works without access, and a refused library
 * alone is not worth sending anybody to Settings for.
 */
export function mediaAskPermission(camera: PermissionAskContext["permission"], photos: PermissionAskContext["permission"]): PermissionAskContext["permission"] {
  if (camera === "unsupported") return "unsupported"
  if (camera === "denied") return "denied"
  if (camera === "prompt" || photos === "prompt") return "prompt"
  return "granted"
}

/** The pages where adding a photo is the next thing: making or editing a product. */
export function isMediaMoment(pathname: string): boolean {
  return /^\/app\/products\/(?:new|[^/]+\/edit|[^/]+)\/?$/.test(pathname) && !/^\/app\/products\/collections\/?$/.test(pathname)
}

/** The pages where a sale is what the person is here for: a seller's /app. */
export function isNotificationsMoment(pathname: string): boolean {
  return /^\/app(?:\/|$)/.test(pathname) && !/^\/app\/(?:auth|login|signup|onboarding)(?:[/?#]|$)/.test(pathname)
}
