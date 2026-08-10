"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Pause, Play } from "lucide-react"

import { formatVoiceDuration } from "@/lib/messages/voice-message"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  PLAYING A VOICE NOTE
 * ===========================================================================
 *
 * A play control, a waveform you can scrub, and the time. What matters here is
 * mostly what it does NOT do:
 *
 * ONE AT A TIME, ACROSS THE WHOLE THREAD. Two voice notes playing over each
 * other is unintelligible and there is no way to mean it. Every bubble
 * announces itself on a shared event when it starts, and every other bubble
 * pauses on hearing one. A module-level registry would do the same thing and
 * would leak across threads; an event is scoped to the document that is showing
 * them.
 *
 * IT DOES NOT ASK THE AUDIO ELEMENT HOW LONG IT IS. `duration` on a
 * MediaRecorder blob is `Infinity` in Chrome and Safari until the whole file has
 * been fetched and seeked — so a bubble that trusted it would show "∞", or
 * nothing, until the moment you pressed play. The recorder measured the length
 * and stored it; this draws that.
 *
 * IT DOES NOT DOWNLOAD ANYTHING TO DRAW THE WAVEFORM. The peaks travelled with
 * the message. A thread with thirty voice notes in it fetches thirty audio files
 * only if somebody plays thirty audio files.
 *
 * `preload="none"` for the same reason: opening a conversation must not pull
 * every recording in it over the network. The first press is what fetches, and
 * the spinner is what says so.
 */

/** One bubble starting tells all the others to stop. */
const STOP_OTHERS = "storelib:voice-play"

export function VoiceBubble({
  src,
  ms,
  peaks,
  mine,
}: {
  /** A signed, short-lived URL — see lib/messages/thread.ts. */
  src: string
  /** Length as the recorder measured it. */
  ms: number
  /** 0-9 per bar. May be empty on a note recorded without an analyser. */
  peaks: number[]
  /** Yours or theirs — this bubble is drawn on two different grounds. */
  mine: boolean
}) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [at, setAt] = useState(0)
  const id = useRef(Math.random().toString(36).slice(2))

  const total = ms > 0 ? ms : 0
  const progress = total > 0 ? Math.min(1, at / total) : 0

  // A waveform is what a voice note looks like. Without peaks it is still a
  // voice note, so a flat, even row stands in rather than the bubble collapsing
  // into a bare play button.
  const bars = peaks.length > 0 ? peaks : Array.from({ length: 24 }, () => 3)

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail === id.current) return
      audio.current?.pause()
    }
    window.addEventListener(STOP_OTHERS, onOther)
    return () => window.removeEventListener(STOP_OTHERS, onOther)
  }, [])

  useEffect(() => {
    const el = audio.current
    return () => {
      // Leaving the thread must not leave a voice playing into an empty screen.
      el?.pause()
    }
  }, [])

  const toggle = useCallback(() => {
    const el = audio.current
    if (!el) return
    if (!el.paused) {
      el.pause()
      return
    }
    window.dispatchEvent(new CustomEvent(STOP_OTHERS, { detail: id.current }))
    // Only a first press can be a load. Every one after it is instant, and a
    // spinner that flashed on each resume would read as a stall.
    if (el.readyState < 2) setLoading(true)
    void el.play().catch(() => setLoading(false))
  }, [])

  /** Scrubbing, by tapping or dragging anywhere on the waveform. */
  const seekTo = useCallback(
    (clientX: number, el: HTMLElement) => {
      const box = el.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - box.left) / (box.width || 1)))
      const a = audio.current
      // Optimistic: the bar moves under the finger, and the element catches up.
      // Waiting for `timeupdate` makes a scrub feel like it is on a delay.
      setAt(ratio * total)
      if (!a) return
      // `duration` is the honest thing to seek against when it IS finite; when
      // it is Infinity — see the note above — the stored length is all there is.
      const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : total / 1000
      try {
        a.currentTime = ratio * dur
      } catch {
        /* not seekable yet; the press still moved the bar, and play will start
           from the beginning, which is better than nothing happening */
      }
    },
    [total],
  )

  return (
    <div className={cn("flex min-w-[196px] max-w-[260px] items-center gap-2.5")}>
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => {
          setPlaying(true)
          setLoading(false)
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget
          const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : total
          setAt(dur > 0 ? (a.currentTime / (dur / 1000)) * total : 0)
        }}
        onEnded={() => {
          setPlaying(false)
          // Back to the start, so the next press replays rather than doing
          // nothing because the head is already at the end.
          setAt(0)
          const a = audio.current
          if (a) a.currentTime = 0
        }}
        onError={() => {
          setLoading(false)
          setPlaying(false)
        }}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pauză" : "Redă mesajul vocal"}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          "[-webkit-tap-highlight-color:transparent] touch-manipulation",
          "transition-colors duration-200 ease-out active:duration-0",
          mine
            ? "bg-white/20 text-white active:bg-white/30"
            : "bg-neutral-900/[0.06] text-neutral-900 active:bg-neutral-900/[0.12]",
        )}
      >
        {loading ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin" />
        ) : playing ? (
          <Pause className="h-[17px] w-[17px] fill-current" />
        ) : (
          // Nudged right by a pixel: a triangle centred on its bounding box
          // reads as sitting left of centre in a circle.
          <Play className="ml-[2px] h-[17px] w-[17px] fill-current" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* The waveform IS the scrubber. A separate thin track under it would be
            two controls for one job, and the bars are a far bigger target. */}
        <div
          role="slider"
          aria-label="Poziția în mesaj"
          aria-valuemin={0}
          aria-valuemax={Math.round(total / 1000)}
          aria-valuenow={Math.round(at / 1000)}
          tabIndex={0}
          className="flex h-7 cursor-pointer touch-none items-center gap-[2px]"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            seekTo(e.clientX, e.currentTarget)
          }}
          onPointerMove={(e) => {
            if (e.buttons === 0) return
            seekTo(e.clientX, e.currentTarget)
          }}
        >
          {bars.map((v, i) => {
            const played = bars.length > 0 && i / bars.length < progress
            return (
              <span
                key={i}
                className={cn(
                  "min-w-[2px] flex-1 rounded-full transition-colors duration-150",
                  mine
                    ? played
                      ? "bg-white"
                      : "bg-white/40"
                    : played
                      ? "bg-neutral-900"
                      : "bg-neutral-900/25",
                )}
                // A floor, so silence in the middle of a recording is still a
                // waveform rather than a gap in it.
                style={{ height: `${Math.max(4, (v / 9) * 26)}px` }}
              />
            )
          })}
        </div>

        <span
          className={cn(
            "text-[11.5px] font-medium tabular-nums",
            mine ? "text-white/70" : "text-neutral-400",
          )}
        >
          {/* Counts up while playing and shows the full length at rest, which is
              what every voice note anywhere does. */}
          {formatVoiceDuration(playing || at > 0 ? at : total)}
        </span>
      </div>
    </div>
  )
}
