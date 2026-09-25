"use client"

/**
 * ===========================================================================
 *  SPEAKING TO ASK STORELIB
 * ===========================================================================
 * The microphone in the composer puts what was said into the box. It never
 * sends: the words are there to be read and changed first, the same as typed
 * ones.
 *
 * Two ways to hear, chosen once per page:
 *
 *   "speech"   the browser's own recogniser (SpeechRecognition, or the
 *              webkit one in Chrome and Safari). Words appear while they are
 *              spoken. Nothing reaches our server.
 *   "record"   a short clip from MediaRecorder, turned into text by
 *              app/api/website-builder/transcribe, which uses the OpenAI key
 *              the website agent already has. Used where there is no
 *              recogniser (Firefox) and in the iOS and Android apps, where
 *              the WebView's recogniser is missing or cannot be trusted:
 *              on iOS it asks for a permission the app does not declare.
 *
 * When neither is possible the hook reports `supported: false` and the
 * composer draws no microphone at all, rather than one that cannot work.
 */

import * as React from "react"

export type VoiceState = "idle" | "starting" | "listening" | "transcribing"
type Engine = "speech" | "record"

/** Stops by itself after this long, so a forgotten microphone is not left on. */
export const VOICE_LIMIT_SECONDS = 60

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionCtor = new () => Recognition

function recogniser(): RecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

type Bridge = { isNativePlatform?: () => boolean; getPlatform?: () => string }
function bridge(): Bridge | undefined {
  if (typeof window === "undefined") return undefined
  return (window as unknown as { Capacitor?: Bridge }).Capacitor
}

/** Inside the iOS or Android app, from the Capacitor bridge itself. */
function inNativeShell(): boolean {
  return bridge()?.isNativePlatform?.() === true
}

/**
 * THE ANDROID APP CANNOT HEAR YET. Its manifest does not declare
 * RECORD_AUDIO, so its WebView refuses the microphone before anybody is
 * asked, and a button that can only ever say "access is off" is a broken
 * button. Drawn again once an app release declares the permission and this
 * line goes. iOS declares its microphone and records.
 */
function nativeWithoutMicrophone(): boolean {
  return inNativeShell() && bridge()?.getPlatform?.() === "android"
}

function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  )
}

/** A recogniser's or a recorder's failure, in words somebody can act on. */
export function voiceErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access is off for Storelib. Allow it in your browser or phone settings, then try again."
    case "audio-capture":
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone was found."
    case "NotReadableError":
      return "Another app is using the microphone."
    case "no-speech":
      return "Nothing was heard. Try again a little closer to the microphone."
    case "network":
      return "Voice input needs a connection. Check it and try again."
    default:
      return "Voice input stopped. Try again, or type it."
  }
}

/** The recorder formats the transcription route accepts, best first. */
function recordingType(): string | undefined {
  const MR = window.MediaRecorder as typeof MediaRecorder & { isTypeSupported?: (t: string) => boolean }
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MR.isTypeSupported?.(type)) return type
  }
  return undefined
}

export function useVoiceInput({
  onText,
}: {
  /**
   * What was said so far. `final` is false for the words a recogniser is
   * still unsure of, which it may yet change; the box shows them anyway.
   */
  onText: (text: string, final: boolean) => void
}) {
  const [engine, setEngine] = React.useState<Engine | null>(null)
  const [state, setState] = React.useState<VoiceState>("idle")
  const [seconds, setSeconds] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const onTextRef = React.useRef(onText)
  onTextRef.current = onText

  const recognition = React.useRef<Recognition | null>(null)
  const recorder = React.useRef<MediaRecorder | null>(null)
  const stream = React.useRef<MediaStream | null>(null)
  const chunks = React.useRef<Blob[]>([])
  const cancelled = React.useRef(false)
  const timer = React.useRef<number | null>(null)
  const startedAt = React.useRef(0)

  /* Which engine, once, after mount: none of this exists on the server. */
  React.useEffect(() => {
    let live = true
    if (nativeWithoutMicrophone()) return
    if (!inNativeShell() && recogniser()) {
      setEngine("speech")
      return
    }
    if (!canRecord()) return
    void fetch("/api/website-builder/transcribe", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((body: { available?: boolean }) => {
        if (live && body.available) setEngine("record")
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const stopClock = React.useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
  }, [])

  const releaseMic = React.useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }, [])

  const stop = React.useCallback(() => {
    stopClock()
    if (recognition.current) {
      recognition.current.stop()
      return
    }
    if (recorder.current && recorder.current.state !== "inactive") {
      setState("transcribing")
      recorder.current.stop()
    }
  }, [stopClock])

  /** Stops and throws away what was heard. */
  const cancel = React.useCallback(() => {
    cancelled.current = true
    stopClock()
    recognition.current?.abort()
    recognition.current = null
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop()
    recorder.current = null
    releaseMic()
    setState("idle")
  }, [releaseMic, stopClock])

  const startClock = React.useCallback(() => {
    stopClock()
    startedAt.current = performance.now()
    setSeconds(0)
    timer.current = window.setInterval(() => {
      const elapsed = Math.floor((performance.now() - startedAt.current) / 1000)
      setSeconds(elapsed)
      if (elapsed >= VOICE_LIMIT_SECONDS) stop()
    }, 250)
  }, [stop, stopClock])

  const start = React.useCallback(async () => {
    if (!engine || state !== "idle") return
    setError(null)
    cancelled.current = false
    setState("starting")

    if (engine === "speech") {
      const Ctor = recogniser()
      if (!Ctor) {
        setState("idle")
        return
      }
      const rec = new Ctor()
      rec.lang = document.documentElement.lang || navigator.language || "en-US"
      rec.continuous = true
      rec.interimResults = true
      let settled = ""
      rec.onstart = () => {
        setState("listening")
        startClock()
      }
      rec.onresult = (event) => {
        let interim = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) settled += result[0].transcript
          else interim += result[0].transcript
        }
        if (!cancelled.current) onTextRef.current((settled + interim).replace(/\s+/g, " ").trim(), !interim)
      }
      rec.onerror = (event) => {
        if (event.error === "aborted") return
        setError(voiceErrorMessage(event.error))
      }
      rec.onend = () => {
        stopClock()
        recognition.current = null
        setState("idle")
      }
      recognition.current = rec
      try {
        rec.start()
      } catch {
        recognition.current = null
        setState("idle")
        setError(voiceErrorMessage(""))
      }
      return
    }

    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (cancelled.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      const type = recordingType()
      const rec = new MediaRecorder(media, type ? { mimeType: type } : undefined)
      chunks.current = []
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data)
      }
      rec.onstop = async () => {
        releaseMic()
        recorder.current = null
        if (cancelled.current || chunks.current.length === 0) {
          setState("idle")
          return
        }
        const blob = new Blob(chunks.current, { type: rec.mimeType || type || "audio/webm" })
        chunks.current = []
        setState("transcribing")
        try {
          const form = new FormData()
          form.append("audio", blob, "speech")
          const response = await fetch("/api/website-builder/transcribe", { method: "POST", body: form })
          const body = (await response.json().catch(() => ({}))) as { text?: string; error?: string }
          if (!response.ok) setError(body.error ?? "That could not be turned into text. Try again.")
          else if (!body.text) setError(voiceErrorMessage("no-speech"))
          else if (!cancelled.current) onTextRef.current(body.text, true)
        } catch {
          setError(voiceErrorMessage("network"))
        } finally {
          setState("idle")
        }
      }
      recorder.current = rec
      rec.start()
      setState("listening")
      startClock()
    } catch (thrown) {
      releaseMic()
      setState("idle")
      setError(voiceErrorMessage(thrown instanceof DOMException ? thrown.name : ""))
    }
  }, [engine, state, releaseMic, startClock, stopClock])

  /* Nothing keeps the microphone once the composer is gone. */
  React.useEffect(() => () => cancel(), [cancel])

  return {
    supported: engine !== null,
    engine,
    state,
    seconds,
    error,
    clearError: () => setError(null),
    start,
    stop,
    cancel,
  }
}
