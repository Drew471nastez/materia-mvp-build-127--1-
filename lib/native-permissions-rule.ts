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
