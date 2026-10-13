"use client"

/**
 * ===========================================================================
 *  THE LIVE ID CAMERA
 * ===========================================================================
 * A photo of an ID, taken the way Stripe's own verification takes one: a
 * full screen camera with the card's outline over it, words that say what to
 * fix (more light, less glare, hold still), and the photo taken by itself the
 * moment the card is sharp and steady, with a shutter sound and a tap of the
 * phone. Then a look at it, Use photo or Retake, and the back of the card the
 * same way (or "No back, it's a passport").
 *
 * IT RUNS INSIDE THE APP. The camera is the browser's own (getUserMedia),
 * which iOS's web view and Android's both give the app once the person says
 * yes, so nothing opens Safari or another app. Where the person said no, it
 * says how to turn the camera on and tries again; there is no "use a photo"
 * way round it (the owner, October 2026: the live camera, and that's all).
 *
 * WHAT LEAVES THE PHONE is the one JPEG of the card, cut to the frame with a
 * margin so all four corners are in it, at up to 1600px: sharp enough for
 * Stripe to read, well under 1 MB. It goes to Storelib's server and straight on to
 * Stripe (lib/payments/stripe/own-form uploadDocument); nothing is kept.
 * Whether the document is genuine is Stripe's check, on that photo.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Camera, RotateCcw, X } from "lucide-react"
import { HINT_WORDS, STEADY_FRAMES, frameQuality, hintFor, toGray, type FrameHint } from "@/lib/payments/id-frame-quality"
import { armAskSounds, playAskSound } from "@/lib/website-builder/ask-sounds"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

/** An ID card is 85.6 by 54 mm; a passport's photo page is close enough to frame the same way. */
const CARD_RATIO = 85.6 / 54
const ANALYSE_WIDTH = 320
const TICK_MS = 110

export type IdSide = "front" | "back"

/** The long side of an ID photo sent to Stripe. Readable, and small enough to send in a couple of seconds on a phone. */
export const ID_PHOTO_PX = 1600

interface IdCameraProps {
  open: boolean
  side: IdSide
  /** The layer to draw on: above the setup panel and its sheets. */
  zIndex: number
  onPhoto: (photo: Blob) => void
  onClose: () => void
  /** Kept for older callers: the camera no longer offers a photo from the library. */
  onPickFile?: () => void
  /** The back only: there is none (a passport). */
  onNoBack?: () => void
  /**
   * Hands the parent a start function it can call inside a tap. iOS only
   * opens the camera from a user gesture, and a state update is too late.
   */
  bindStart?: (start: () => void) => void
  /** The camera could not start. The page shows its own way to try again. */
  onDenied?: () => void
}

type Phase = "starting" | "live" | "review" | "denied" | "none"

export function IdCamera({ open, side, zIndex, onPhoto, onClose, onNoBack, bindStart, onDenied }: IdCameraProps) {
  const video = React.useRef<HTMLVideoElement>(null)
  const frame = React.useRef<HTMLDivElement>(null)
  const stream = React.useRef<MediaStream | null>(null)
  const starting = React.useRef(false)
  const generation = React.useRef(0)
  const [phase, setPhase] = React.useState<Phase>("starting")
  const [hint, setHint] = React.useState<FrameHint>("blur")
  const [steady, setSteady] = React.useState(0)
  const [shot, setShot] = React.useState<{ blob: Blob; url: string } | null>(null)
  const [flash, setFlash] = React.useState(false)

  const stop = React.useCallback(() => {
    generation.current += 1
    starting.current = false
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  const attach = React.useCallback(() => {
    const v = video.current
    const s = stream.current
    if (!v || !s || v.srcObject === s) return
    v.srcObject = s
    void v.play().catch(() => undefined)
  }, [])

  /*
   * THE CAMERA. Called from the effect when the sheet opens, and straight
   * from a tap (bindStart) so iOS still counts it as the person's gesture.
   * The back camera on a phone, at its best resolution.
   */
  const begin = React.useCallback(async () => {
    if (stream.current) {
      setPhase("live")
      attach()
      return
    }
    if (starting.current) return
    starting.current = true
    const gen = generation.current
    setPhase("starting")
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (gen === generation.current) setPhase("none")
        return
      }
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      if (gen !== generation.current) {
        s.getTracks().forEach((t) => t.stop())
        return
      }
      stream.current = s
      setPhase("live")
    } catch (e) {
      if (gen !== generation.current) return
      const name = (e as { name?: string })?.name
      setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "none")
    } finally {
      if (gen === generation.current) starting.current = false
    }
  }, [attach])

  React.useLayoutEffect(() => {
    bindStart?.(() => {
      void begin()
    })
  }, [bindStart, begin])

  /* Opened: ask for the camera. A tap may already have started it. */
  React.useEffect(() => {
    if (!open || phase !== "starting") return
    void begin()
  }, [open, phase, begin])

  /* The video node appears a paint after the stream. Attach it then. */
  React.useEffect(() => {
    if (open && phase === "live") attach()
  }, [open, phase, attach])

  /* No camera, or permission refused: hand it back so the page can ask for a tap. */
  React.useEffect(() => {
    if (!open || (phase !== "denied" && phase !== "none")) return
    onDenied?.()
  }, [open, phase, onDenied])

  /* Closed: the camera light goes off, and the next open starts fresh. */
  React.useEffect(() => {
    if (open) return
    stop()
    setPhase("starting")
    setSteady(0)
    setShot((s) => {
      if (s) URL.revokeObjectURL(s.url)
      return null
    })
  }, [open, stop])
  React.useEffect(() => stop, [stop])

  /* The side changed (front done, now the back): a fresh look. */
  React.useEffect(() => {
    setSteady(0)
    setShot((s) => {
      if (s) URL.revokeObjectURL(s.url)
      return null
    })
    if (open && stream.current) setPhase("live")
  }, [side, open])

  /** The card's part of the picture, with a margin so the corners are never cut, as a JPEG. */
  const capture = React.useCallback(async () => {
    const v = video.current
    const f = frame.current
    if (!v || !f || !v.videoWidth) return
    const vb = v.getBoundingClientRect()
    const fb = f.getBoundingClientRect()
    /* The video is drawn "cover": map the frame on screen back to the camera's pixels. */
    const scale = Math.max(vb.width / v.videoWidth, vb.height / v.videoHeight)
    const ox = (vb.width - v.videoWidth * scale) / 2
    const oy = (vb.height - v.videoHeight * scale) / 2
    const margin = 0.08
    let sx = (fb.left - vb.left - ox) / scale - (fb.width / scale) * margin
    let sy = (fb.top - vb.top - oy) / scale - (fb.height / scale) * margin
    let sw = (fb.width / scale) * (1 + margin * 2)
    let sh = (fb.height / scale) * (1 + margin * 2)
    sx = Math.max(0, sx)
    sy = Math.max(0, sy)
    sw = Math.min(v.videoWidth - sx, sw)
    sh = Math.min(v.videoHeight - sy, sh)
    /* 1600px of card is sharp for Stripe and a fraction of the bytes: the photo has to cross a phone connection. */
    const out = Math.min(1, ID_PHOTO_PX / sw)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(sw * out)
    canvas.height = Math.round(sh * out)
    canvas.getContext("2d")?.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85))
    if (!blob) return
    setFlash(true)
    window.setTimeout(() => setFlash(false), 180)
    playAskSound("record-stop")
    void triggerHaptic("medium")
    setShot({ blob, url: URL.createObjectURL(blob) })
    setPhase("review")
  }, [])

  /* Looking: a small grey copy of the frame, several times a second, until it is good enough to take. */
  React.useEffect(() => {
    if (!open || phase !== "live") return
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    let prev: Uint8Array | null = null
    let peak = 0
    let run = 0
    let taken = false
    const t = window.setInterval(() => {
      const v = video.current
      const f = frame.current
      if (!ctx || !v || !f || !v.videoWidth || taken) return
      const vb = v.getBoundingClientRect()
      const fb = f.getBoundingClientRect()
      const scale = Math.max(vb.width / v.videoWidth, vb.height / v.videoHeight)
      const ox = (vb.width - v.videoWidth * scale) / 2
      const oy = (vb.height - v.videoHeight * scale) / 2
      const sx = Math.max(0, (fb.left - vb.left - ox) / scale)
      const sy = Math.max(0, (fb.top - vb.top - oy) / scale)
      const sw = Math.min(v.videoWidth - sx, fb.width / scale)
      const sh = Math.min(v.videoHeight - sy, fb.height / scale)
      if (sw < 10 || sh < 10) return
      canvas.width = ANALYSE_WIDTH
      canvas.height = Math.round(ANALYSE_WIDTH / CARD_RATIO)
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      const gray = toGray(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
      const q = frameQuality(gray, canvas.width, canvas.height, prev)
      prev = gray
      peak = Math.max(peak * 0.995, q.sharpness)
      const h = hintFor(q, peak)
      setHint(h)
      run = h === "ready" ? run + 1 : 0
      setSteady(Math.min(run, STEADY_FRAMES))
      if (run >= STEADY_FRAMES) {
        taken = true
        void capture()
      }
    }, TICK_MS)
    return () => window.clearInterval(t)
  }, [open, phase, capture])

  if (!open || typeof document === "undefined") return null

  const title = side === "front" ? tt("Front of your ID") : tt("Back of your ID")
  const progress = steady / STEADY_FRAMES

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-id-camera={phase}
      style={{ zIndex }}
      className="fixed inset-0 flex flex-col bg-black text-white animate-in fade-in-0 duration-200"
    >
      {/* The camera, edge to edge, under everything. */}
      <video ref={video} playsInline muted autoPlay className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-300", phase === "live" ? "opacity-100" : "opacity-0")} />

      <div className="relative z-10 flex shrink-0 items-center justify-between px-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button type="button" aria-label={tt("Close")} onClick={onClose} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/30 text-white outline-none backdrop-blur-sm transition-colors active:bg-black/50">
          <X className="h-5 w-5" />
        </button>
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="w-11" />
      </div>

      {phase === "review" && shot ? (
        <div className="relative flex flex-1 flex-col items-center justify-center px-6 animate-in fade-in-0 zoom-in-[0.98] duration-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt={tt("{title}, as taken", { title })} className="max-h-[52vh] w-full max-w-[520px] rounded-2xl object-contain shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]" />
          <p className="mt-5 max-w-[340px] text-center text-[14px] leading-5 text-white/80">{tt("Check the words are sharp, all four corners are in, and there is no glare.")}</p>
        </div>
      ) : phase === "denied" || phase === "none" ? (
        <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
            <Camera className="h-6 w-6" />
          </span>
          <p className="mt-4 text-[17px] font-semibold">{phase === "denied" ? tt("Camera access is off") : tt("No camera here")}</p>
          <p className="mt-1.5 max-w-[320px] text-[14px] leading-5 text-white/70">
            {phase === "denied" ? tt("Allow the camera for Storelib in your phone's settings, then try again.") : tt("Open setup on your phone to take the photo with its camera.")}
          </p>
        </div>
      ) : (
        /* The frame: the card's shape, the rest dimmed, a ring that fills as it steadies. */
        <div className="relative flex flex-1 items-center justify-center px-5">
          <div ref={frame} className="relative w-full max-w-[560px]" style={{ aspectRatio: String(CARD_RATIO) }}>
            <div className="pointer-events-none absolute inset-0 rounded-[18px] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
            <div
              className={cn(
                "pointer-events-none absolute inset-0 rounded-[18px] border-[3px] transition-colors duration-200",
                hint === "ready" ? "border-[#4ade80]" : "border-white/85",
              )}
            />
            <div className="pointer-events-none absolute inset-x-6 bottom-3 h-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-[#4ade80] transition-[width] duration-100 ease-linear" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
          <p aria-live="polite" className="absolute inset-x-0 bottom-6 z-10 px-6 text-center text-[15px] font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
            {phase === "starting" ? tt("Starting the camera") : side === "front" ? (hint === "ready" ? HINT_WORDS.ready : tt("{hintWords}. Fit the front of your ID in the frame.", { hintWords: HINT_WORDS[hint] })) : hint === "ready" ? HINT_WORDS.ready : tt("{hintWords}. Now the back.", { hintWords: HINT_WORDS[hint] })}
          </p>
        </div>
      )}

      {/* What to do, at the thumb. */}
      <div className="relative z-10 shrink-0 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
        {phase === "review" && shot ? (
          <div className="mx-auto flex max-w-[520px] gap-3">
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(shot.url)
                setShot(null)
                setSteady(0)
                setPhase(stream.current ? "live" : "starting")
              }}
              className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/12 text-[15px] font-medium text-white outline-none backdrop-blur-sm transition-colors active:bg-white/20"
            >
              <RotateCcw className="h-4 w-4" />
              {tt("Retake")}
            </button>
            <button
              type="button"
              onClick={() => onPhoto(shot.blob)}
              className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-[#1a1a2e] outline-none transition-transform active:scale-[0.98]"
            >
              {tt("Use photo")}
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[520px] items-center justify-between">
            <span className="min-w-[88px]" />
            {phase === "live" ? (
              <button
                type="button"
                aria-label={tt("Take photo")}
                onClick={() => void capture()}
                className="flex h-[72px] w-[72px] cursor-pointer items-center justify-center rounded-full border-[4px] border-white/90 outline-none transition-transform active:scale-95"
              >
                <span className="h-[56px] w-[56px] rounded-full bg-white" />
              </button>
            ) : phase === "starting" ? (
              <span className="h-[72px] w-[72px]" />
            ) : (
              <button type="button" onClick={() => void begin()} className="flex h-12 cursor-pointer items-center justify-center rounded-xl bg-white px-6 text-[15px] font-semibold text-[#1a1a2e] outline-none">
                {tt("Try again")}
              </button>
            )}
            {side === "back" && onNoBack ? (
              <button type="button" onClick={onNoBack} className="flex h-11 min-w-[88px] cursor-pointer items-center justify-end rounded-full px-3 text-right text-[13.5px] font-medium leading-4 text-white/85 outline-none active:text-white">
                {tt("No back")}
              </button>
            ) : (
              <span className="min-w-[88px]" />
            )}
          </div>
        )}
      </div>

      {/* The shutter's flash. */}
      <div aria-hidden className={cn("pointer-events-none absolute inset-0 bg-white transition-opacity duration-150", flash ? "opacity-70" : "opacity-0")} />
    </div>,
    document.body,
  )
}

/** Unlocks the sound on the tap that opens the camera, so the shutter is heard. */
export function armCameraSounds() {
  try {
    armAskSounds()
  } catch {
    /* no sound is fine */
  }
}

/*
 * A phone photo is often 4 to 8 MB and larger than Stripe's 8,000 by 8,000
 * limit. Drawn again at most 1600px on its long side as a colour JPEG, it is
 * a sharp, readable ID well inside every rule Stripe sets. A PDF is passed
 * through untouched: it is only ever a proof of address, where Stripe takes
 * one (an identity document may not be a PDF, and is refused before here).
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  if (file.type === "application/pdf") return file
  if (file.size < 900_000 && (file.type === "image/jpeg" || file.type === "image/png")) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error("unreadable"))
      i.src = url
    })
    const scale = Math.min(1, ID_PHOTO_PX / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.85, 0.75, 0.65]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q))
      if (blob && blob.size < 1_500_000) return blob
    }
    throw new Error(tt("too large"))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * SEND AN ID PHOTO, AND SAY HOW IT IS GOING. fetch cannot report an upload's
 * progress, so this is XMLHttpRequest: the page shows "Sending 40%", never a
 * spinner with no end. It also gives up: a request that has not answered in
 * `timeoutMs` is stopped and said so, with the photo kept to try again,
 * rather than a step left spinning on a connection that dropped.
 */
export function sendIdPhoto<T>(url: string, form: FormData, onProgress: (pct: number) => void, timeoutMs = 60_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.timeout = timeoutMs
    xhr.responseType = "text"
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    }
    xhr.onload = () => {
      let body: (T & { error?: string }) | null = null
      try {
        body = JSON.parse(xhr.responseText || "{}")
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        onProgress(100)
        resolve(body)
      } else {
        reject(Object.assign(new Error(body?.error || tt("That photo did not go through. Take it again.")), { status: xhr.status }))
      }
    }
    xhr.onerror = () => reject(Object.assign(new Error(tt("No connection. Check your internet and take it again.")), { status: 0 }))
    xhr.ontimeout = () => reject(Object.assign(new Error(tt("That took too long. Take it again.")), { status: 0 }))
    xhr.send(form)
  })
}

