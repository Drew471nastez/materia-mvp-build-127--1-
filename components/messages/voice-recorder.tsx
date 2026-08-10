"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Mic, Trash2 } from "lucide-react"

import { triggerHaptic } from "@/lib/native-bridge"
import { formatVoiceDuration, MAX_PEAKS } from "@/lib/messages/voice-message"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  HOLD TO SPEAK, SLIDE AWAY TO THROW IT AWAY
 * ===========================================================================
 *
 * The gesture everybody already knows, and the reasons it is that gesture
 * rather than tap-to-start / tap-to-stop:
 *
 *   A voice note is the one message you cannot proof-read. Holding means the
 *   recording is bounded by the press — you cannot walk away leaving a
 *   microphone open in your pocket, which is the failure mode of a toggle and
 *   the reason it feels risky to use.
 *
 *   And it makes cancelling free. Your finger is already down, so sliding it
 *   left costs nothing and needs no second target; a toggle has to grow a
 *   separate discard button, which is another thing on a composer that is
 *   already full.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS SENT UNTIL THE FINGER LIFTS ON PURPOSE
 * ---------------------------------------------------------------------------
 * Three ways out, and only one of them sends:
 *
 *   lift, past the minimum length      → send
 *   slide left past the threshold      → discard, and say so
 *   lift under the minimum length      → discard silently; it was a mis-tap
 *
 * `pointercancel` counts as a slide-away. The system taking the gesture — a
 * notification, the app switcher, a second finger — must never be the thing
 * that sends a recording of a room.
 *
 * ---------------------------------------------------------------------------
 * THE METER IS THE ANALYSER, AND THE ANALYSER IS THE WAVEFORM
 * ---------------------------------------------------------------------------
 * One AnalyserNode drives both: the live bars while you speak, and the peaks
 * packed into the message so every reader can draw the same shape without
 * downloading and decoding the audio. Computing it twice, or computing it on
 * read, is the same picture paid for many times over.
 */

/** Below this, it was a mis-tap rather than a message. Matches the API's floor. */
const MIN_MS = 700
/** A thread is not a phone call. Matches the API's ceiling. */
const MAX_MS = 5 * 60_000
/** How far left the finger has to travel before the recording is being thrown away. */
const CANCEL_PX = 90

type Phase = "idle" | "recording" | "denied"

export function VoiceRecorder({
  disabled,
  onRecorded,
  className,
}: {
  disabled?: boolean
  /** A finished recording, worth sending. The caller uploads it. */
  onRecorded: (blob: Blob, ms: number, peaks: number[]) => void
  className?: string
}) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [ms, setMs] = useState(0)
  const [slide, setSlide] = useState(0)
  /** Live bars, newest last. Trimmed to what the strip can show. */
  const [live, setLive] = useState<number[]>([])

  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const raf = useRef(0)
  const startedAt = useRef(0)
  const peaks = useRef<number[]>([])
  const cancelled = useRef(false)
  const startX = useRef(0)
  /** Set while a start is in flight, so a second pointerdown cannot open two. */
  const arming = useRef(false)

  const cancelling = slide >= CANCEL_PX

  /** Everything the recorder holds open. Idempotent — every exit path calls it. */
  const teardown = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = 0
    // The tracks, or the browser keeps the recording indicator lit and the
    // microphone held for the rest of the session.
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    void audioCtx.current?.close().catch(() => undefined)
    audioCtx.current = null
    rec.current = null
  }, [])

  useEffect(() => () => teardown(), [teardown])

  const start = useCallback(
    async (clientX: number) => {
      if (disabled || arming.current || rec.current) return
      arming.current = true
      cancelled.current = false
      startX.current = clientX
      setSlide(0)
      setMs(0)
      setLive([])
      peaks.current = []
      chunks.current = []

      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: {
            // A voice note is speech in a room, not music. These are what stop
            // it sounding like a bad speakerphone, and every engine implements
            // them; asking for them costs nothing where they are absent.
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        stream.current = s

        // THE PERMISSION PROMPT TAKES AS LONG AS IT TAKES. By the time it is
        // answered the finger may well have lifted, and starting a recording
        // nobody is holding any more would leave the microphone open.
        if (cancelled.current) {
          s.getTracks().forEach((t) => t.stop())
          stream.current = null
          arming.current = false
          return
        }

        // Opus in WebM where it exists — a minute of speech in tens of
        // kilobytes. Safari records mp4/AAC and ignores this; passing an
        // unsupported type throws, so it is offered rather than demanded.
        const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
          typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t),
        )
        const r = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined)
        rec.current = r
        r.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.current.push(e.data)
        }
        r.start(250)
        startedAt.current = Date.now()
        setPhase("recording")
        void triggerHaptic("medium")

        // One analyser, two jobs — see the note at the top.
        try {
          const Ctx = window.AudioContext ?? (window as any).webkitAudioContext
          const ctx: AudioContext = new Ctx()
          audioCtx.current = ctx
          const src = ctx.createMediaStreamSource(s)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          src.connect(analyser)
          const buf = new Uint8Array(analyser.frequencyBinCount)
          /** When the next waveform bar is due. */
          let nextPeakAt = 0

          const tick = () => {
            if (!rec.current) return
            const elapsed = Date.now() - startedAt.current
            setMs(elapsed)
            if (elapsed >= MAX_MS) {
              // Stopped rather than truncated: the API refuses anything longer,
              // and silently dropping five minutes of somebody talking would be
              // the worst possible way to enforce that.
              stopRef.current?.(true)
              return
            }

            analyser.getByteTimeDomainData(buf)
            // Peak deviation from the centre line. RMS reads more evenly but
            // under-represents the consonants that make a waveform legible as
            // speech rather than as a blur.
            let peak = 0
            for (let i = 0; i < buf.length; i++) {
              const d = Math.abs(buf[i] - 128)
              if (d > peak) peak = d
            }
            // 0-9, with a gentle curve so quiet speech is still visible. A
            // linear map puts ordinary talking in the bottom two bars.
            const level = Math.min(9, Math.round(Math.pow(peak / 128, 0.65) * 9))
            setLive((l) => [...l.slice(-(MAX_PEAKS - 1)), level])

            // The stored waveform is sampled at a fixed rate across the whole
            // recording rather than per frame, so a long note and a short one
            // both come out with a comparable number of bars.
            if (elapsed >= nextPeakAt && peaks.current.length < MAX_PEAKS) {
              peaks.current.push(level)
              nextPeakAt = elapsed + 220
            }
            raf.current = requestAnimationFrame(tick)
          }
          raf.current = requestAnimationFrame(tick)
        } catch {
          // No analyser: the recording still works, the waveform is simply
          // absent, and both ends already treat peaks as optional.
          const tick = () => {
            if (!rec.current) return
            const elapsed = Date.now() - startedAt.current
            setMs(elapsed)
            if (elapsed >= MAX_MS) return void stopRef.current?.(true)
            raf.current = requestAnimationFrame(tick)
          }
          raf.current = requestAnimationFrame(tick)
        }
      } catch {
        // Refused, or no microphone. Said once, quietly, rather than as an
        // alert: it is a state of the control, not an error in the app.
        teardown()
        setPhase("denied")
        window.setTimeout(() => setPhase((p) => (p === "denied" ? "idle" : p)), 2600)
      } finally {
        arming.current = false
      }
    },
    [disabled, teardown],
  )

  /**
   * `send` is false for every discard path. Held in a ref because the analyser
   * loop above has to be able to reach it, and it is defined after that loop.
   */
  const stopRef = useRef<((send: boolean) => void) | null>(null)
  const stop = useCallback(
    (send: boolean) => {
      cancelled.current = true
      const r = rec.current
      const elapsed = Date.now() - startedAt.current
      if (!r) {
        // The permission prompt is still open, or nothing ever started.
        teardown()
        setPhase("idle")
        return
      }
      // Read BEFORE teardown: the stream's tracks are about to be stopped, and
      // `onstop` fires after the last chunk has been flushed.
      r.onstop = () => {
        const parts = chunks.current
        chunks.current = []
        teardown()
        setPhase("idle")
        setSlide(0)
        setLive([])
        if (!send || elapsed < MIN_MS || parts.length === 0) return
        const blob = new Blob(parts, { type: parts[0]?.type || "audio/webm" })
        if (blob.size === 0) return
        void triggerHaptic("light")
        onRecorded(blob, elapsed, peaks.current)
      }
      try {
        r.stop()
      } catch {
        teardown()
        setPhase("idle")
      }
    },
    [onRecorded, teardown],
  )
  stopRef.current = stop

  const recording = phase === "recording"

  return (
    <>
      {/* THE STRIP REPLACES THE COMPOSER WHILE YOU SPEAK.

          Rendered as a sibling that covers it rather than by hiding the
          composer: the text field keeps its height and its scroll position, so
          nothing below reflows when the recording starts or ends, and the
          thread does not jump under your thumb at the exact moment you are
          concentrating on speaking. */}
      {recording && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-20 flex items-center gap-3 rounded-2xl bg-white px-3",
            "transition-colors duration-200",
            cancelling && "bg-rose-50",
          )}
        >
          <span
            className={cn(
              "flex h-2.5 w-2.5 shrink-0 rounded-full",
              cancelling ? "bg-rose-500" : "voice-rec-dot bg-rose-500",
            )}
          />
          <span className="w-[44px] shrink-0 text-[13px] font-semibold tabular-nums text-neutral-700">
            {formatVoiceDuration(ms)}
          </span>

          {/* The live meter. Bars only, no numbers — it exists to say "this is
              hearing you", which a level in decibels does not. */}
          <span className="flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
            {live.map((v, i) => (
              <span
                key={i}
                className={cn(
                  "w-[3px] shrink-0 rounded-full",
                  cancelling ? "bg-rose-300" : "bg-neutral-400",
                )}
                style={{ height: `${Math.max(3, (v / 9) * 22)}px` }}
              />
            ))}
          </span>

          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-[13px] font-medium transition-colors",
              cancelling ? "text-rose-600" : "text-neutral-400",
            )}
          >
            <Trash2 className="h-4 w-4" />
            {cancelling ? "Eliberează" : "Glisează"}
          </span>
        </div>
      )}

      {phase === "denied" && (
        <div className="pointer-events-none absolute inset-x-0 -top-11 z-20 mx-auto w-fit rounded-full bg-neutral-900 px-3.5 py-2 text-[12.5px] font-medium text-white shadow-lg">
          Nu am acces la microfon
        </div>
      )}

      <button
        type="button"
        aria-label="Ține apăsat ca să înregistrezi"
        disabled={disabled}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          // Only the primary contact. A second finger landing mid-recording must
          // not start a second one.
          if (!e.isPrimary) return
          e.currentTarget.setPointerCapture?.(e.pointerId)
          void start(e.clientX)
        }}
        onPointerMove={(e) => {
          if (!recording) return
          setSlide(Math.max(0, startX.current - e.clientX))
        }}
        onPointerUp={() => {
          if (!recording && !arming.current) return
          stop(!cancelling)
        }}
        // The system took the gesture — a notification, the app switcher, a
        // second finger. Never a send: nobody decided to send this.
        onPointerCancel={() => stop(false)}
        className={cn(
          "relative z-30 flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          "[-webkit-tap-highlight-color:transparent] touch-manipulation select-none",
          "transition-colors duration-200 ease-out active:duration-0 disabled:opacity-40",
          recording
            ? cancelling
              ? "bg-rose-500 text-white"
              : "bg-[#7c3aed] text-white"
            : "text-neutral-500 active:bg-neutral-100",
          className,
        )}
        style={{ touchAction: "none" }}
      >
        <Mic className={cn("h-[21px] w-[21px]", recording && "scale-110")} />
      </button>
    </>
  )
}
