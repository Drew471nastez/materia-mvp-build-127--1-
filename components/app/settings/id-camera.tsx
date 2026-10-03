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
 * yes, so nothing opens Safari or another app. Where there is no camera, or
 * the person says no, it says so and offers a photo from the library instead.
 *
 * WHAT LEAVES THE PHONE is the one JPEG of the card, cut to the frame with a
 * margin so all four corners are in it, at up to 2000px: sharp enough for
 * Stripe to read, under 4 MB. It goes to Storelib's server and straight on to
 * Stripe (lib/payments/stripe/own-form uploadDocument); nothing is kept.
 * Whether the document is genuine is Stripe's check, on that photo.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Camera, ImageUp, RotateCcw, X } from "lucide-react"
import { HINT_WORDS, STEADY_FRAMES, frameQuality, hintFor, toGray, type FrameHint } from "@/lib/payments/id-frame-quality"
import { armAskSounds, playAskSound } from "@/lib/website-builder/ask-sounds"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/** An ID card is 85.6 by 54 mm; a passport's photo page is close enough to frame the same way. */
const CARD_RATIO = 85.6 / 54
const ANALYSE_WIDTH = 320
const TICK_MS = 110

export type IdSide = "front" | "back"

interface IdCameraProps {
  open: boolean
  side: IdSide
  /** The layer to draw on: above the setup panel and its sheets. */
  zIndex: number
  onPhoto: (photo: Blob) => void
  onClose: () => void
  /** No camera, or the person would rather pick a photo they already have. */
  onPickFile: () => void
  /** The back only: there is none (a passport). */
  onNoBack?: () => void
}

type Phase = "starting" | "live" | "review" | "denied" | "none"

export function IdCamera({ open, side, zIndex, onPhoto, onClose, onPickFile, onNoBack }: IdCameraProps) {
  const video = React.useRef<HTMLVideoElement>(null)
  const frame = React.useRef<HTMLDivElement>(null)
  const stream = React.useRef<MediaStream | null>(null)
  const [phase, setPhase] = React.useState<Phase>("starting")
  const [hint, setHint] = React.useState<FrameHint>("blur")
  const [steady, setSteady] = React.useState(0)
  const [shot, setShot] = React.useState<{ blob: Blob; url: string } | null>(null)
  const [flash, setFlash] = React.useState(false)

  const stop = React.useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  /* The camera: the back one on a phone, at its best resolution. */
  React.useEffect(() => {
    if (!open || phase !== "starting") return
    let gone = false
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setPhase("none")
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (gone) return s.getTracks().forEach((t) => t.stop())
        stream.current = s
        const v = video.current
        if (v) {
          v.srcObject = s
          await v.play().catch(() => undefined)
        }
        setPhase("live")
      } catch (e) {
        const name = (e as { name?: string })?.name
        setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "none")
      }
    }
    void start()
    return () => {
      gone = true
    }
  }, [open, phase])

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
    const out = Math.min(1, 2000 / sw)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(sw * out)
    canvas.height = Math.round(sh * out)
    canvas.getContext("2d")?.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9))
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

  const title = side === "front" ? "Front of your ID" : "Back of your ID"
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
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/30 text-white outline-none backdrop-blur-sm transition-colors active:bg-black/50">
          <X className="h-5 w-5" />
        </button>
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="w-11" />
      </div>

      {phase === "review" && shot ? (
        <div className="relative flex flex-1 flex-col items-center justify-center px-6 animate-in fade-in-0 zoom-in-[0.98] duration-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt={`${title}, as taken`} className="max-h-[52vh] w-full max-w-[520px] rounded-2xl object-contain shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]" />
          <p className="mt-5 max-w-[340px] text-center text-[14px] leading-5 text-white/80">Check the words are sharp, all four corners are in, and there is no glare.</p>
        </div>
      ) : phase === "denied" || phase === "none" ? (
        <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
            <Camera className="h-6 w-6" />
          </span>
          <p className="mt-4 text-[17px] font-semibold">{phase === "denied" ? "Camera access is off" : "No camera here"}</p>
          <p className="mt-1.5 max-w-[320px] text-[14px] leading-5 text-white/70">
            {phase === "denied" ? "Allow the camera for Storelib in your settings, or choose a photo of your ID you already have." : "Choose a photo or scan of your ID instead."}
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
            {phase === "starting" ? "Starting the camera" : side === "front" ? (hint === "ready" ? HINT_WORDS.ready : `${HINT_WORDS[hint]}. Fit the front of your ID in the frame.`) : hint === "ready" ? HINT_WORDS.ready : `${HINT_WORDS[hint]}. Now the back.`}
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
              Retake
            </button>
            <button
              type="button"
              onClick={() => onPhoto(shot.blob)}
              className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-[#1a1a2e] outline-none transition-transform active:scale-[0.98]"
            >
              Use photo
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[520px] items-center justify-between">
            <button type="button" onClick={onPickFile} className="flex h-11 min-w-[88px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium text-white/85 outline-none active:text-white">
              <ImageUp className="h-4 w-4" />
              Upload
            </button>
            {phase === "live" ? (
              <button
                type="button"
                aria-label="Take photo"
                onClick={() => void capture()}
                className="flex h-[72px] w-[72px] cursor-pointer items-center justify-center rounded-full border-[4px] border-white/90 outline-none transition-transform active:scale-95"
              >
                <span className="h-[56px] w-[56px] rounded-full bg-white" />
              </button>
            ) : phase === "starting" ? (
              <span className="h-[72px] w-[72px]" />
            ) : (
              <button type="button" onClick={onPickFile} className="flex h-12 cursor-pointer items-center justify-center rounded-xl bg-white px-6 text-[15px] font-semibold text-[#1a1a2e] outline-none">
                Choose a photo
              </button>
            )}
            {side === "back" && onNoBack ? (
              <button type="button" onClick={onNoBack} className="flex h-11 min-w-[88px] cursor-pointer items-center justify-end rounded-full px-3 text-right text-[13.5px] font-medium leading-4 text-white/85 outline-none active:text-white">
                No back
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
