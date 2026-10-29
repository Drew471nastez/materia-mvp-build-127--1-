"use client"

/**
 * ===========================================================================
 *  "CAMERA IS OFF FOR STORELIB" AND ITS FAMILY
 * ===========================================================================
 * One sheet for every permission the phone refused: the camera, the photo
 * library, the microphone, notifications. It says what is off and opens the
 * phone's Settings in one tap, the only place a "Don't Allow" can be undone.
 * Anything in the app raises it with showAccessSheet (lib/native-permissions).
 *
 * It also watches every file input in the app (MediaAccess below). On iOS a
 * photo input offers Take Photo next to the library; once the camera was
 * refused, Take Photo opens a black screen. So a tap on one, with the camera
 * off, says so first, and Choose from library carries on to the picker from
 * that same tap. An input that only takes a photo (`capture`) is held every
 * time on both phones; one that offers the library too only now and then,
 * since the library needs no permission and works as it is.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Bell, BellOff, Camera, CameraOff, ImageOff, MicOff } from "lucide-react"
import {
  ACCESS_SHEET_EVENT,
  inNativeApp,
  knownCameraPermission,
  mediaOffSheet,
  nativePlatform,
  openAppSettings,
  readMediaPermission,
  showAccessSheet,
  type AccessAsk,
  type AccessKind,
  type AccessRequest,
} from "@/lib/native-permissions"
import { shouldHoldPicker, takesMedia } from "@/lib/native-permissions-rule"

const ICONS: Record<AccessKind, typeof BellOff> = { camera: CameraOff, photos: ImageOff, microphone: MicOff, notifications: BellOff }
/* Before the phone was asked: the thing itself, not its "off" mark (components/platform/notifications-ask.tsx). */
const ASK_ICONS: Partial<Record<AccessKind, typeof BellOff>> = { camera: Camera, photos: Camera, notifications: Bell }

interface ViewProps {
  request: AccessRequest
  closing: boolean
  onPrimary: () => void
  onSecondary?: () => void
  onLater: () => void
  /** Data attributes for tests and for pageIsBusy elsewhere. */
  data?: Record<string, string>
  /** The main button's own data attribute. */
  primaryData?: Record<string, string>
  laterData?: Record<string, string>
  /** Asking before the phone's own prompt, rather than saying something is off. */
  asking?: boolean
}

/** The sheet as drawn. NotificationsAsk draws it too, so the two never drift apart. */
export function AccessSheetView({ request, closing, onPrimary, onSecondary, onLater, data, primaryData, laterData, asking }: ViewProps) {
  const Icon = (asking ? ASK_ICONS[request.kind] : undefined) ?? ICONS[request.kind]
  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="access-sheet-title" {...data}>
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-200"
        style={{ opacity: closing ? 0 : 1, animation: closing ? undefined : "sl-fade-in 200ms ease-out" }}
        onClick={onLater}
        aria-hidden
      />
      <div
        className="relative w-full max-w-[520px] rounded-t-[22px] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-6 shadow-[0_-8px_40px_rgba(0,0,0,0.18)] transition-transform duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] sm:mb-6 sm:rounded-[22px]"
        style={{ transform: closing ? "translateY(105%)" : "translateY(0)", animation: closing ? undefined : "sl-sheet-up 320ms cubic-bezier(0.32,0.72,0,1)" }}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f3ff] text-[#5b4bd5]">
          <Icon className="h-6 w-6" />
        </span>
        <h2 id="access-sheet-title" className="mt-4 text-[19px] font-semibold text-[#1a1a2e]">
          {request.title}
        </h2>
        <p className="mt-2 text-[14px] leading-5 text-[#6b7280]">{request.body}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onPrimary}
            data-access-primary=""
            {...primaryData}
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white outline-none transition-transform active:scale-[0.99]"
          >
            {request.primary?.label ?? "Open Settings"}
          </button>
          {request.secondary && onSecondary ? (
            <button
              type="button"
              onClick={onSecondary}
              data-access-secondary=""
              className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl border border-[#e5e7eb] text-[15px] font-semibold text-[#1a1a2e] outline-none transition-colors active:bg-[#f3f4f6]"
            >
              {request.secondary.label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onLater}
            data-access-later=""
            {...laterData}
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl text-[15px] font-medium text-[#4b5563] outline-none transition-colors active:bg-[#f3f4f6]"
          >
            Not now
          </button>
        </div>
      </div>
      <style>{`@keyframes sl-fade-in{from{opacity:0}to{opacity:1}}@keyframes sl-sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  )
}

/** When a photo input that also offers the library was last held, kept on this phone only. */
const HELD_KEY = "storelib_camera_off_held"

function readHeld(): number | null {
  try {
    const raw = window.localStorage.getItem(HELD_KEY)
    const at = raw ? Number(raw) : NaN
    return Number.isFinite(at) ? at : null
  } catch {
    return null
  }
}

function writeHeld(at: number): void {
  try {
    window.localStorage.setItem(HELD_KEY, String(at))
  } catch {
    /* The worst case is being told again on the next tap. */
  }
}

/**
 * Holds a tap on a photo input while the camera is off, and lets it through
 * from the sheet. The decision is made inside the tap from the last answer
 * read (knownCameraPermission), since a picker only opens from the tap
 * itself and nothing async can come first.
 */
function MediaAccess() {
  React.useEffect(() => {
    const platform = nativePlatform()
    if (!platform) return

    const refresh = () => void readMediaPermission("camera")
    refresh()
    /* Back from Settings, or from anywhere: the answer may have changed. */
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", onVisible)

    const passing = new WeakSet<HTMLInputElement>()

    const onClick = (event: MouseEvent) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement) || input.type !== "file") return
      if (passing.has(input)) {
        passing.delete(input)
        return
      }
      if (input.disabled || input.hasAttribute("data-access-skip")) return
      if (knownCameraPermission() !== "denied") return
      if (!takesMedia(input.accept)) return

      const cameraOnly = input.hasAttribute("capture")
      /* Android offers a camera only where the input asks for one; iOS offers Take Photo on every photo input. */
      if (!cameraOnly && platform !== "ios") return
      if (!cameraOnly && !shouldHoldPicker(readHeld(), Date.now())) return

      event.preventDefault()
      event.stopImmediatePropagation()
      if (!cameraOnly) writeHeld(Date.now())

      const carryOn = () => {
        const capture = input.getAttribute("capture")
        if (capture !== null) input.removeAttribute("capture")
        passing.add(input)
        input.click()
        if (capture !== null) window.setTimeout(() => input.setAttribute("capture", capture), 0)
      }
      showAccessSheet(mediaOffSheet("camera", { secondary: { label: "Choose from library", run: carryOn } }))
    }
    document.addEventListener("click", onClick, true)

    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      document.removeEventListener("click", onClick, true)
    }
  }, [])

  return null
}

function Host() {
  const [request, setRequest] = React.useState<AccessRequest | null>(null)
  const [closing, setClosing] = React.useState(false)
  const current = React.useRef<AccessRequest | null>(null)

  React.useEffect(() => {
    if (!inNativeApp()) return
    const onRequest = (event: Event) => {
      const ask = (event as CustomEvent<AccessAsk>).detail
      /* One at a time: a second ask while one is open is not taken, and its caller falls back. */
      if (!ask?.request || current.current) return
      ask.taken = true
      current.current = ask.request
      setClosing(false)
      setRequest(ask.request)
    }
    window.addEventListener(ACCESS_SHEET_EVENT, onRequest)
    return () => window.removeEventListener(ACCESS_SHEET_EVENT, onRequest)
  }, [])

  const close = React.useCallback(() => {
    const was = current.current
    if (!was) return
    current.current = null
    setClosing(true)
    window.setTimeout(() => {
      setRequest(null)
      setClosing(false)
      was.onClose?.()
    }, 220)
  }, [])

  if (!request || typeof document === "undefined") return null

  return createPortal(
    <AccessSheetView
      request={request}
      closing={closing}
      data={{ "data-access-sheet": request.kind }}
      onPrimary={() => {
        /* Inside the tap, so a picker or the system prompt it opens still counts as the person's own. */
        if (request.primary) request.primary.run()
        else openAppSettings()
        close()
      }}
      onSecondary={
        request.secondary
          ? () => {
              request.secondary?.run()
              close()
            }
          : undefined
      }
      onLater={close}
    />,
    document.body,
  )
}

/** Mounted once in the root layout, through app-only. Draws nothing in a browser. */
export function AccessSheet() {
  return (
    <>
      <Host />
      <MediaAccess />
    </>
  )
}
