/**
 * ===========================================================================
 *  WHAT A RECORDING IS, FROM THE PHONE TO THE TRANSCRIBER
 * ===========================================================================
 * Shared by the composer's recorder (components/website-builder/ask-voice.ts)
 * and the route that turns a clip into text
 * (app/api/website-builder/transcribe/route.ts), so both read a recording's
 * format the same way.
 *
 * Every browser records something different:
 *
 *   Chrome, Edge, Android's WebView    audio/webm;codecs=opus
 *   Firefox                            audio/ogg;codecs=opus, or webm
 *   Safari and WKWebView on iOS        audio/mp4 (AAC); before iOS 18.4 the
 *                                      only thing it records, and some
 *                                      versions call it video/mp4
 *
 * The recorder asks for the first of RECORDING_TYPES this browser says it can
 * make. The clip goes up with a file name whose extension says the same
 * thing, because the transcriber reads the format from the extension, and
 * because some browsers hand the server a part with an empty or generic
 * type: the name is then the only clue left.
 */

/** Best first. Opus in WebM is small and plain; mp4 is what iOS makes. */
export const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus", "audio/ogg"] as const

/** The first type this browser can record, or undefined to let it choose. */
export function pickRecordingType(isTypeSupported: ((type: string) => boolean) | undefined): string | undefined {
  if (typeof isTypeSupported !== "function") return undefined
  for (const type of RECORDING_TYPES) {
    try {
      if (isTypeSupported(type)) return type
    } catch {
      /* a browser that throws for a type it does not know: the next one */
    }
  }
  return undefined
}

/**
 * The extensions OpenAI's transcription reads (flac, m4a, mp3, mp4, mpeg,
 * mpga, ogg, wav, webm). AAC on its own is not one of them, so it goes up as
 * m4a, which is AAC: the decoder reads what is inside, the name only has to
 * be one it accepts.
 */
export type RecordingExtension = "webm" | "mp4" | "m4a" | "ogg" | "wav" | "mp3" | "flac"

const EXTENSIONS: readonly RecordingExtension[] = ["webm", "mp4", "m4a", "ogg", "wav", "mp3", "flac"]

/** The extension for a recorded type, or null when the type says nothing useful. */
export function extensionForType(type: string | null | undefined): RecordingExtension | null {
  const t = (type ?? "").toLowerCase()
  if (!t) return null
  if (t.includes("webm")) return "webm"
  if (t.includes("m4a") || t.includes("aac")) return "m4a"
  if (t.includes("mp4")) return "mp4"
  if (t.includes("ogg") || t.includes("opus")) return "ogg"
  if (t.includes("wav") || t.includes("wave")) return "wav"
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3"
  if (t.includes("flac")) return "flac"
  return null
}

/** The extension a file name ends in, when it is one of the transcriber's. */
export function extensionForName(name: string | null | undefined): RecordingExtension | null {
  const ext = (name ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (ext === "aac") return "m4a"
  if (ext === "oga" || ext === "opus") return "ogg"
  return EXTENSIONS.find((e) => e === ext) ?? null
}

/** What the recorder names its clip: speech.webm, speech.mp4, and so on. */
export function recordingFileName(type: string | null | undefined): string {
  return `speech.${extensionForType(type) ?? "webm"}`
}

const TYPE_FOR: Record<RecordingExtension, string> = {
  webm: "audio/webm",
  mp4: "audio/mp4",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
}

/**
 * How the server reads an uploaded part: by its type when that says what it
 * is, else by its file name, else not a recording at all. `null` means it is
 * something else (a picture, a document) and is refused.
 */
export function readRecording(type: string | null | undefined, name: string | null | undefined): { fileName: string; type: string } | null {
  const t = (type ?? "").toLowerCase()
  const generic = !t || t === "application/octet-stream"
  if (!generic && !t.startsWith("audio/") && !t.startsWith("video/")) return null
  const ext = extensionForType(t) ?? extensionForName(name)
  if (!ext) return generic ? null : { fileName: "speech.webm", type: t }
  return { fileName: `speech.${ext}`, type: generic ? TYPE_FOR[ext] : t }
}
