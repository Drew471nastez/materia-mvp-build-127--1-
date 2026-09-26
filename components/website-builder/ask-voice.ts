"use client"

/**
 * ===========================================================================
 *  SPEAKING TO ASK STORELIB
 * ===========================================================================
 * The microphone in the composer puts what was said into the box. It never
 * sends: the words are there to be read and changed first, the same as typed
 * ones.
 *
 * Two ways to hear:
 *
 *   "speech"   the browser's own recogniser (SpeechRecognition, or the
 *              webkit one in Chrome and Safari). Words appear while they are
 *              spoken. Nothing reaches our server.
 *   "record"   a short clip from MediaRecorder, turned into text by
 *              app/api/website-builder/transcribe, which uses the OpenAI key
 *              the website agent already has.
 *
 * ---------------------------------------------------------------------------
 *  A PHONE RECORDS; A COMPUTER LISTENS
 * ---------------------------------------------------------------------------
 * "Voice input stopped, try again or type" on a phone, every time. That is
 * this file's LAST message, the one it falls back on when a recogniser fails
 * for a reason it has no words for, and on a phone it was the usual outcome:
 * every browser on iOS is WebKit, and WebKit's `webkitSpeechRecognition`
 * exists there, answers `start()`, and then ends at once — sometimes with no
 * error at all, sometimes with one nothing can act on. The microphone looked
 * broken because the engine behind it was.
 *
 * So the engine is chosen by what the screen is, not only by what exists:
 *
 *   a touch screen        records, and the clip is transcribed. The same
 *                         path the apps have used all along, which works
 *                         wherever a microphone does.
 *   a computer            listens with the browser's recogniser: instant,
 *                         free, and nothing leaves the page.
 *
 * And whichever is chosen, a recogniser that fails BEFORE A WORD IS HEARD
 * hands over to the recorder and carries straight on, rather than stopping
 * with a message. A refusal is not handed over: the microphone is off, and
 * recording would only ask the same question again and get the same answer.
 *
 * When neither is possible the hook reports `supported: false` and the
 * composer draws no microphone at all, rather than one that cannot work.
 *
 * ---------------------------------------------------------------------------
 *  PERMISSION, IN THE APPS
 * ---------------------------------------------------------------------------
 * The microphone is asked for every time a recording starts and it is not
 * already allowed: `getUserMedia` is called on each press, never cached, and
 * the platform asks.
 *
 *   iOS       Capacitor's web view hands the page's request straight to iOS
 *             (it answers WebKit's media capture question with "grant"), so
 *             the one prompt is the system's, worded by
 *             NSMicrophoneUsageDescription in ios/App/App/Info.plist. iOS
 *             asks once per install; after a "Don't Allow" only Settings can
 *             turn it back on, so the refusal offers Settings.
 *   Android   Capacitor's BridgeWebChromeClient turns the page's request into
 *             the runtime RECORD_AUDIO request, which Android shows each time
 *             until somebody ticks "don't ask again". The manifest declares
 *             RECORD_AUDIO and MODIFY_AUDIO_SETTINGS
 *             (android/app/src/main/AndroidManifest.xml), and the app says so
 *             through `StorelibNative.microphoneDeclared()` (MainActivity).
 *             An older install without them never draws the microphone.
 *
 * A refusal says what to do in words, and where the platform lets a page get
 * there, the error comes with a button that opens this app's own page in
 * Settings (`openMicrophoneSettings`).
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

type AndroidBridge = { microphoneDeclared?: () => boolean; openAppSettings?: () => void }
function androidBridge(): AndroidBridge | undefined {
  if (typeof window === "undefined") return undefined
  return (window as unknown as { StorelibNative?: AndroidBridge }).StorelibNative
}

function platform(): "ios" | "android" | "web" {
  if (!inNativeShell()) return "web"
  const p = bridge()?.getPlatform?.()
  return p === "android" ? "android" : p === "ios" ? "ios" : "web"
}

/**
 * AN ANDROID INSTALL FROM BEFORE THE MICROPHONE WAS DECLARED CANNOT HEAR.
 * Without RECORD_AUDIO in its manifest its WebView refuses the microphone
 * before anybody is asked, and a button that can only ever say "access is
 * off" is a broken button. The web layer ships the moment Vercel deploys and
 * reaches those installs too, so it asks the app itself: a build that
 * declares the permission also answers `microphoneDeclared()` (MainActivity).
 * iOS has declared its microphone all along and records.
 */
function nativeWithoutMicrophone(): boolean {
  if (platform() !== "android") return false
  try {
    return androidBridge()?.microphoneDeclared?.() !== true
  } catch {
    return true
  }
}

/**
 * Whether this app can open its own page in Settings for the person, where
 * the microphone is turned back on after a refusal. A browser cannot: its
 * site settings are its own, and the message says where they are instead.
 */
export function canOpenMicrophoneSettings(): boolean {
  const p = platform()
  if (p === "ios") return true
  if (p === "android") return typeof androidBridge()?.openAppSettings === "function"
  return false
}

/**
 * Opens this app's page in the phone's Settings. On iOS `app-settings:` is
 * the system's own address for it: Capacitor hands any address that is not
 * the app's to iOS, which opens Settings at Storelib. On Android the app
 * opens its App info page (StorelibNative.openAppSettings, MainActivity).
 */
export function openMicrophoneSettings(): void {
  const p = platform()
  if (p === "android") {
    try {
      androidBridge()?.openAppSettings?.()
    } catch {
      /* An install without it: the message already says where to go. */
    }
    return
  }
  if (p === "ios") window.location.href = "app-settings:"
}

function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  )
}

/**
 * A finger's screen rather than a mouse's, asked of the pointer itself. Not
 * read from the user agent: that is a string anybody can write, it names
 * browsers rather than screens, and it would have to be kept up to date
 * forever. `(pointer: coarse)` is the browser's own answer about the thing
 * doing the pointing, and every phone and tablet says yes to it.
 */
function touchScreen(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.matchMedia("(pointer: coarse)").matches
  } catch {
    return false
  }
}

/** The failures that are a refusal: somebody, or a setting, said no to the microphone. */
export function isPermissionError(code: string): boolean {
  return code === "not-allowed" || code === "service-not-allowed" || code === "NotAllowedError" || code === "SecurityError" || code === "PermissionDeniedError"
}

/** A recogniser's or a recorder's failure, in words somebody can act on. */
export function voiceErrorMessage(code: string, where: "ios" | "android" | "web" = "web"): string {
  if (isPermissionError(code)) {
    if (where === "ios") return "Storelib is not allowed to use the microphone. Turn on Microphone for Storelib in Settings, then try again."
    if (where === "android") return "Storelib is not allowed to use the microphone. Allow Microphone in Storelib's app permissions, then try again."
  }
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
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
    case "language-not-supported":
    case "bad-grammar":
      return "Voice input cannot hear this language here. Type it instead."
    case "NotSupportedError":
      return "This browser cannot record. Type it, or try another browser."
    case "AbortError":
      return "The microphone stopped before anything was recorded. Try again."
    default:
      return "Voice input stopped before it heard anything. Try again, or type it."
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
  /** A clip can be recorded here and turned into text: the phone's engine, and the recogniser's safety net. */
  const [recordReady, setRecordReady] = React.useState(false)
  const [state, setState] = React.useState<VoiceState>("idle")
  const [seconds, setSeconds] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  /** The last error was a refusal, so the composer can offer the way to undo it. */
  const [refused, setRefused] = React.useState(false)
  const onTextRef = React.useRef(onText)
  onTextRef.current = onText

  const recognition = React.useRef<Recognition | null>(null)
  const recorder = React.useRef<MediaRecorder | null>(null)
  const stream = React.useRef<MediaStream | null>(null)
  const chunks = React.useRef<Blob[]>([])
  const cancelled = React.useRef(false)
  const timer = React.useRef<number | null>(null)
  const startedAt = React.useRef(0)

  /*
    WHICH ENGINE, once, after mount: none of this exists on the server.

    A computer takes its recogniser straight away, so its microphone is there
    the moment the composer is. Everywhere else the answer waits on one
    question to the route: a phone prefers recording even where a recogniser
    exists (A PHONE RECORDS, above), and a phone with nothing to record to
    falls back to the recogniser rather than losing its microphone.
  */
  React.useEffect(() => {
    let live = true
    if (nativeWithoutMicrophone()) return
    const hasRecogniser = !inNativeShell() && !!recogniser()
    if (hasRecogniser && !touchScreen()) setEngine("speech")
    if (!canRecord()) return
    void fetch("/api/website-builder/transcribe", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((body: { available?: boolean }) => {
        if (!live) return
        if (body.available) {
          setRecordReady(true)
          setEngine((chosen) => chosen ?? "record")
        } else if (hasRecogniser) setEngine((chosen) => chosen ?? "speech")
      })
      .catch(() => {
        if (live && hasRecogniser) setEngine((chosen) => chosen ?? "speech")
      })
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

  /**
   * THE RECORDER: a clip, then the route's text. The phone's engine, and
   * where a failed recogniser hands over to (`fallBackToRecording`), so this
   * is its own function rather than a branch of `start`.
   */
  const startRecording = React.useCallback(async () => {
    setState("starting")
    try {
      /* Asked on every press: the platform prompts whenever it is not already allowed. */
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
      const code = thrown instanceof DOMException || thrown instanceof Error ? thrown.name : ""
      setRefused(isPermissionError(code))
      setError(voiceErrorMessage(code, platform()))
    }
  }, [releaseMic, startClock])

  /**
   * THE RECOGNISER FAILED BEFORE A WORD: THE RECORDER TAKES OVER, AND THE
   * PRESS CARRIES ON. Not a message and a stop — the person asked to speak,
   * and there is a second way to hear them. The engine stays the recorder
   * for the rest of the page, so the next press goes straight there.
   *
   * `getUserMedia` is asked for outside the press that started this, which
   * browsers allow: it prompts if it must, and a refusal is reported like
   * any other. Once only per press, and never after a refusal, which
   * recording would only run into again.
   */
  const fellBack = React.useRef(false)
  const fallBackToRecording = React.useCallback(() => {
    if (!recordReady || fellBack.current || cancelled.current) return false
    fellBack.current = true
    /* The recogniser is done with; nothing should stop it instead of the recorder. */
    recognition.current = null
    setEngine("record")
    void startRecording()
    return true
  }, [recordReady, startRecording])

  const start = React.useCallback(async () => {
    if (!engine || state !== "idle") return
    setError(null)
    setRefused(false)
    cancelled.current = false
    fellBack.current = false

    if (engine === "record") {
      await startRecording()
      return
    }

    setState("starting")
    const Ctor = recogniser()
    if (!Ctor) {
      setState("idle")
      if (!fallBackToRecording()) setError(voiceErrorMessage("NotSupportedError"))
      return
    }
    const rec = new Ctor()
    rec.lang = document.documentElement.lang || navigator.language || "en-US"
    rec.continuous = true
    rec.interimResults = true
    let settled = ""
    /** A word arrived, so this session worked: nothing hands over after that. */
    let heard = false
    /** It said why it stopped, so `onend` leaves the message alone. */
    let failed = false
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
      const words = (settled + interim).replace(/\s+/g, " ").trim()
      if (words) heard = true
      if (!cancelled.current) onTextRef.current(words, !interim)
    }
    rec.onerror = (event) => {
      if (event.error === "aborted") return
      failed = true
      const refusal = isPermissionError(event.error)
      /* Nothing heard, and not the microphone being off: record it instead. */
      if (!refusal && !heard && fallBackToRecording()) return
      setRefused(refusal)
      setError(voiceErrorMessage(event.error, platform()))
    }
    rec.onend = () => {
      stopClock()
      recognition.current = null
      /* The recorder has the microphone now; its own state stands. */
      if (fellBack.current) return
      /*
        ENDED WITHOUT A WORD AND WITHOUT SAYING WHY. WebKit does this on a
        phone: `start()` is answered, nothing is heard, and it is over. The
        recorder takes the press.
      */
      if (!heard && !failed && fallBackToRecording()) return
      setState("idle")
      if (!heard && !failed) setError(voiceErrorMessage(""))
    }
    recognition.current = rec
    try {
      rec.start()
    } catch (thrown) {
      recognition.current = null
      const code = thrown instanceof DOMException || thrown instanceof Error ? thrown.name : ""
      /* Refused to start at all (WebKit throws when a session has not fully ended). */
      if (fallBackToRecording()) return
      setState("idle")
      setError(voiceErrorMessage(code, platform()))
    }
  }, [engine, state, fallBackToRecording, startRecording, startClock, stopClock])

  /* Nothing keeps the microphone once the composer is gone. */
  React.useEffect(() => () => cancel(), [cancel])

  return {
    supported: engine !== null,
    engine,
    state,
    seconds,
    error,
    /** The error is a refusal and this app can open its Settings page to undo it. */
    canOpenSettings: refused && canOpenMicrophoneSettings(),
    openSettings: openMicrophoneSettings,
    clearError: () => {
      setError(null)
      setRefused(false)
    },
    start,
    stop,
    cancel,
  }
}
