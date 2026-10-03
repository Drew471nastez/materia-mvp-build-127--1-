/**
 * ===========================================================================
 *  SPOKEN WORDS FOR ASK STORELIB, AS TEXT
 * ===========================================================================
 * The composer's microphone prefers the browser's own speech recognition,
 * which never reaches this route. This is the fallback for where that does
 * not exist or cannot be trusted (Firefox, and the iOS and Android apps,
 * where WKWebView and Android's WebView have no working recogniser): the
 * browser records a short clip and it is turned into text here.
 *
 * NO NEW PROVIDER. It uses the OpenAI key the website agent already has
 * (ChatGPT is one of the models in the same composer). Without that key GET
 * says `available: false` and the composer hides the microphone rather than
 * showing one that cannot work.
 *
 * The text comes back to the composer and is put in the box. It is never
 * sent anywhere else and nothing is stored: not the audio, not the words.
 */

import { NextResponse } from "next/server"

import { rateLimit } from "@/lib/api/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { readRecording } from "@/lib/website-builder/voice-format"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/** About a minute of speech at the rates browsers record at is well under this. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024

const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe"

async function signedInCreator(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  return (creator as { id: string } | null)?.id ?? null
}

/** Whether a recorded clip can be turned into text on this deployment. */
export async function GET() {
  const creatorId = await signedInCreator()
  return NextResponse.json({ available: !!creatorId && !!process.env.OPENAI_API_KEY })
}

export async function POST(request: Request) {
  const creatorId = await signedInCreator()
  if (!creatorId) return NextResponse.json({ error: "Sign in to use voice input." }, { status: 401 })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: "Voice input is not set up here." }, { status: 503 })

  const limited = await rateLimit({
    bucket: "ask-transcribe",
    subjects: [`creator:${creatorId}`],
    windows: [
      { limit: 20, seconds: 600 },
      { limit: 200, seconds: 86_400 },
    ],
    message: "That is a lot of voice notes in a short time. Type this one, or try again in a few minutes.",
  })
  if (limited) return limited

  const form = await request.formData().catch(() => null)
  const audio = form?.get("audio")
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Nothing was recorded." }, { status: 400 })
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "That recording is too long. Keep it under a minute." }, { status: 413 })
  }
  /*
    Read by type, then by name: iOS records audio/mp4 (some versions say
    video/mp4), and a part that arrives with no type, or a generic one, is
    known by the extension the recorder gave it. OpenAI reads the format
    from the extension, so the clip goes on with the right one.
  */
  const recording = readRecording(audio.type, audio instanceof File ? audio.name : null)
  if (!recording) {
    return NextResponse.json({ error: "That is not a recording." }, { status: 400 })
  }

  const upstream = new FormData()
  upstream.append("file", new File([audio], recording.fileName, { type: recording.type }))
  upstream.append("model", MODEL)
  upstream.append("response_format", "json")

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
      signal: AbortSignal.timeout(45_000),
    })
    if (!response.ok) {
      console.error("[transcribe] upstream", response.status, (await response.text().catch(() => "")).slice(0, 300))
      return NextResponse.json({ error: "That could not be turned into text. Try again." }, { status: 502 })
    }
    const body = (await response.json().catch(() => ({}))) as { text?: string }
    return NextResponse.json({ text: (body.text ?? "").trim() })
  } catch {
    return NextResponse.json({ error: "That could not be turned into text. Try again." }, { status: 502 })
  }
}
