/**
 * lib/native-camera.ts
 *
 * Safe camera/photo-picker wrapper for Capacitor iOS + Android.
 *
 * Why this exists:
 *   On iPad, using a raw <input type="file" accept="image/*"> inside a WKWebView
 *   causes a crash because iOS tries to present UIImagePickerController modally
 *   without a valid popover anchor. @capacitor/camera handles the popover anchor
 *   correctly on iPad (UIPopoverPresentationController) and presents the camera
 *   or photo-picker safely on both iPhone and iPad.
 *
 * Usage (all platforms):
 *   const result = await pickPhoto()      // always safe, never crashes
 *   if (result) {
 *     // result.dataUrl  — "data:image/jpeg;base64,..."
 *     // result.blob     — Blob  (ready for Supabase upload)
 *     // result.mimeType — e.g. "image/jpeg"
 *   }
 */

import { mediaOffSheet, showAccessSheet, type MediaKind } from "@/lib/native-permissions"

export interface PhotoResult {
  dataUrl: string
  blob: Blob
  mimeType: string
}

/**
 * Returns true when running inside the Capacitor native shell.
 * Safe to call during SSR (returns false).
 */
function isNative(): boolean {
  if (typeof window === "undefined") return false
  const cap = (window as any).Capacitor
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform() === true
}

/**
 * Convert a base64 string (without the data: prefix) to a Blob.
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

/**
 * Open the camera or photo library using @capacitor/camera on native,
 * or a standard file input on web.
 *
 * On iPad this correctly uses UIPopoverPresentationController so the
 * system never crashes regardless of how the picker is presented.
 *
 * @param source  "PHOTOS" (default) | "CAMERA" | "PROMPT"
 */
export async function pickPhoto(
  source: "PHOTOS" | "CAMERA" | "PROMPT" = "PHOTOS"
): Promise<PhotoResult | null> {
  if (isNative()) {
    return pickPhotoNative(source)
  }
  return pickPhotoWeb()
}

async function pickPhotoNative(
  source: "PHOTOS" | "CAMERA" | "PROMPT"
): Promise<PhotoResult | null> {
  try {
    const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera")

    const capSource =
      source === "CAMERA"
        ? CameraSource.Camera
        : source === "PROMPT"
        ? CameraSource.Prompt
        : CameraSource.Photos

    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: capSource,
      // presentationStyle: "popover" is set automatically by the plugin on iPad
      // saveToGallery: false — never save without explicit user intent
      saveToGallery: false,
      correctOrientation: true,
      width: 1920,
      height: 1920,
    })

    if (!photo.base64String) return null

    const mimeType = photo.format === "png" ? "image/png" : "image/jpeg"
    const dataUrl = `data:${mimeType};base64,${photo.base64String}`
    const blob = base64ToBlob(photo.base64String, mimeType)

    return { dataUrl, blob, mimeType }
  } catch (err: any) {
    // User cancelled — not an error
    if (
      err?.message?.includes("cancelled") ||
      err?.message?.includes("canceled") ||
      err?.message?.includes("User cancelled") ||
      err?.code === "USER_CANCELLED"
    ) {
      return null
    }

    // Refused, now or before: the phone will not ask again, so say what is off
    // and open Settings in one tap. The library needs no permission through the
    // system picker, so that way on is offered from the same sheet.
    const refused = deniedKind(err)
    if (refused) return refusedSheet(refused)

    // Camera not available (simulator, etc.)
    if (err?.message?.includes("No camera available")) {
      if (typeof window !== "undefined") {
        alert("No camera is available on this device.")
      }
      return null
    }

    console.error("[native-camera] unexpected error:", err)
    return null
  }
}

/** Which permission a rejection names: "User denied access to camera" or "... to photos". */
export function deniedKind(err: unknown): MediaKind | null {
  const message = String((err as { message?: unknown })?.message ?? "").toLowerCase()
  const code = String((err as { code?: unknown })?.code ?? "")
  if (!/denied|permission/.test(message) && code !== "PERMISSION_DENIED") return null
  return message.includes("photo") || message.includes("librar") ? "photos" : "camera"
}

function refusedSheet(kind: MediaKind): Promise<PhotoResult | null> {
  return new Promise((resolve) => {
    let settled = false
    const done = (result: Promise<PhotoResult | null> | null) => {
      if (settled) return
      settled = true
      if (result) void result.then(resolve)
      else resolve(null)
    }
    const shown = showAccessSheet(
      mediaOffSheet(kind, {
        // Runs inside the tap on the sheet, so the picker may open.
        secondary: { label: "Choose from library", run: () => done(pickPhotoWeb()) },
        onClose: () => done(null),
      }),
    )
    if (!shown) {
      alert(`${mediaOffSheet(kind).title}. ${mediaOffSheet(kind).body}`)
      done(null)
    }
  })
}

function pickPhotoWeb(): Promise<PhotoResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    // Opened from a tap the camera sheet already answered (components/platform/access-sheet.tsx).
    input.setAttribute("data-access-skip", "")
    // Do NOT set capture="environment" — that forces camera-only on mobile web
    // and skips the photo library, which is unexpected UX

    const cleanup = () => {
      try { document.body.removeChild(input) } catch { /* already removed */ }
    }

    input.onchange = async () => {
      const file = input.files?.[0]
      cleanup()
      if (!file) {
        resolve(null)
        return
      }

      try {
        const dataUrl = await new Promise<string>((res, rej) => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result as string)
          reader.onerror = rej
          reader.readAsDataURL(file)
        })
        resolve({ dataUrl, blob: file, mimeType: file.type })
      } catch {
        resolve(null)
      }
    }

    // Safari fires no "cancel" event — resolve null after focus returns
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!input.files?.length) {
            cleanup()
            resolve(null)
          }
        }, 500)
      },
      { once: true }
    )

    input.style.display = "none"
    document.body.appendChild(input)
    input.click()
  })
}
