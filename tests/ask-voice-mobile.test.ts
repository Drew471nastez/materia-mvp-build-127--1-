/**
 * ===========================================================================
 *  SPEAKING TO ASK STORELIB ON A PHONE
 * ===========================================================================
 * "Voice recording does not work on mobile devices." What stood between a
 * phone and a transcript, and what holds each fix in place:
 *
 *   SESSION    the sounds set iOS's audio session to "ambient", which has no
 *              microphone: a recording on iOS 17 and later was refused or
 *              silent. It goes back to "auto" inside the tap, before
 *              getUserMedia, and to ambient once the tracks are stopped.
 *   FORMAT     iOS records audio/mp4, not webm. The recorder picks the first
 *              type the browser can make from one list, the clip goes up
 *              named for its format, and the route reads a part by its type
 *              or its name, so an mp4, m4a, aac or ogg clip is never refused
 *              or sent on as webm.
 *   RECORDER   a browser that refuses an option it claims to support gets a
 *              plainer recorder rather than "this browser cannot record".
 *   SAID       an empty recording, a microphone taken by a call, a refusal,
 *              no microphone: each has its own plain sentence, never a
 *              silent return to the idle microphone.
 *   TAP        tap to start, tap to stop: a click, no press and hold.
 *   APPS       the microphone is declared for iOS and Android, and nothing
 *              in the Android app replaces the WebChromeClient that grants
 *              the page's request.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  RECORDING_TYPES,
  extensionForName,
  extensionForType,
  pickRecordingType,
  readRecording,
  recordingFileName,
} from "../lib/website-builder/voice-format"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const section = (name: string) => console.log(`\n${name}`)


const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")
const voice = read("components/website-builder/ask-voice.ts")
const sounds = read("lib/website-builder/ask-sounds.ts")
const route = read("app/api/website-builder/transcribe/route.ts")
const chat = read("components/website-builder/theme-chat.tsx")
const plist = read("ios/App/App/Info.plist")
const manifest = read("android/app/src/main/AndroidManifest.xml")
const activity = read("android/app/src/main/java/com/storelib/app/MainActivity.java")
const chrome = read("android/app/src/main/java/com/storelib/app/StorelibChromeClient.java")

// ---------------------------------------------------------------------------
section("Which format each browser records in")
// ---------------------------------------------------------------------------
{
  check(
    "one list, best first: Opus in WebM, then mp4 and AAC for iOS, then Ogg",
    RECORDING_TYPES.join(",") === "audio/webm;codecs=opus,audio/webm,audio/mp4,audio/aac,audio/ogg;codecs=opus,audio/ogg",
  )
  const browsers: Record<string, string[]> = {
    chrome: ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"],
    "ios before 18.4": ["audio/mp4"],
    "ios 18.4": ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"],
    firefox: ["audio/ogg;codecs=opus", "audio/ogg"],
    "aac only": ["audio/aac"],
  }
  const picked = Object.fromEntries(Object.entries(browsers).map(([name, can]) => [name, pickRecordingType((t) => can.includes(t))]))
  check("Chrome and Android record Opus in WebM", picked.chrome === "audio/webm;codecs=opus", JSON.stringify(picked))
  check("iOS before 18.4 records mp4", picked["ios before 18.4"] === "audio/mp4", JSON.stringify(picked))
  check("a newer iOS takes WebM when it offers it", picked["ios 18.4"] === "audio/webm;codecs=opus", JSON.stringify(picked))
  check("Firefox records Ogg", picked.firefox === "audio/ogg;codecs=opus", JSON.stringify(picked))
  check("a browser with only AAC records AAC", picked["aac only"] === "audio/aac", JSON.stringify(picked))
  check("one with no isTypeSupported lets the browser choose", pickRecordingType(undefined) === undefined)
  check("and one whose isTypeSupported throws is asked about the next type", pickRecordingType((t) => { if (t.includes("webm")) throw new Error("no"); return t === "audio/mp4" }) === "audio/mp4")
}

// ---------------------------------------------------------------------------
section("The clip goes up named for what it is")
// ---------------------------------------------------------------------------
{
  const names: Record<string, string> = {
    "audio/webm;codecs=opus": "speech.webm",
    "audio/mp4": "speech.mp4",
    "audio/mp4;codecs=mp4a.40.2": "speech.mp4",
    "video/mp4": "speech.mp4",
    "audio/aac": "speech.m4a",
    "audio/x-m4a": "speech.m4a",
    "audio/ogg;codecs=opus": "speech.ogg",
    "audio/wav": "speech.wav",
    "audio/mpeg": "speech.mp3",
    "": "speech.webm",
  }
  const wrong = Object.entries(names).filter(([type, name]) => recordingFileName(type) !== name).map(([type]) => `${type} -> ${recordingFileName(type)}`)
  check("webm, mp4 (also when iOS calls it video/mp4), m4a for AAC, ogg, wav, mp3", wrong.length === 0, wrong.join("; "))
  check("aac goes up as m4a, which the transcriber reads, rather than as an extension it refuses", extensionForType("audio/aac") === "m4a" && extensionForName("speech.aac") === "m4a")
  check("the recorder names it so", /form\.append\("audio", blob, recordingFileName\(blob\.type\)\)/.test(voice) && !/form\.append\("audio", blob, "speech"\)/.test(voice))
  check("from the type the recorder really made, falling back to the one asked for", /new Blob\(chunks\.current, \{ type: rec\.mimeType \|\| type \|\| "audio\/webm" \}\)/.test(voice))
}

// ---------------------------------------------------------------------------
section("The route reads a part by its type, then by its name")
// ---------------------------------------------------------------------------
{
  const cases: [string, string | null, { fileName: string; type: string } | null][] = [
    ["audio/webm;codecs=opus", "speech.webm", { fileName: "speech.webm", type: "audio/webm;codecs=opus" }],
    ["audio/mp4", "speech.mp4", { fileName: "speech.mp4", type: "audio/mp4" }],
    ["video/mp4", "speech.mp4", { fileName: "speech.mp4", type: "video/mp4" }],
    ["audio/aac", "speech.m4a", { fileName: "speech.m4a", type: "audio/aac" }],
    ["audio/ogg", "speech.ogg", { fileName: "speech.ogg", type: "audio/ogg" }],
    ["", "speech.mp4", { fileName: "speech.mp4", type: "audio/mp4" }],
    ["application/octet-stream", "speech.m4a", { fileName: "speech.m4a", type: "audio/mp4" }],
    ["application/octet-stream", "speech.ogg", { fileName: "speech.ogg", type: "audio/ogg" }],
    ["image/png", "speech.webm", null],
    ["application/pdf", "notes.pdf", null],
    ["", "notes.txt", null],
  ]
  const wrong = cases.filter(([type, name, want]) => JSON.stringify(readRecording(type, name)) !== JSON.stringify(want)).map(([type, name]) => `${type || "(none)"} ${name} -> ${JSON.stringify(readRecording(type, name))}`)
  check("mp4, m4a, aac and ogg are accepted and passed on with the right name; a part with no type is known by its name; anything else is refused", wrong.length === 0, wrong.join("; "))
  check("the route uses it, with the part's own file name", /const recording = readRecording\(audio\.type, audio instanceof File \? audio\.name : null\)/.test(route) && /new File\(\[audio\], recording\.fileName, \{ type: recording\.type \}\)/.test(route))
  check("and no longer guesses webm for a part with no type", !/audio\.type \|\| "audio\/webm"/.test(route) && !/function fileNameFor/.test(route))
  check("the size cap is unchanged, 4MB, well over a minute at 64 kbps", /MAX_AUDIO_BYTES = 4 \* 1024 \* 1024/.test(route) && /const RECORDING_BITS = 64_000/.test(voice) && 64_000 / 8 * 60 < 4 * 1024 * 1024)
}

// ---------------------------------------------------------------------------
section("Recording on iOS: the audio session, and the tap")
// ---------------------------------------------------------------------------
{
  const startRecording = voice.slice(voice.indexOf("const startRecording = React.useCallback"), voice.indexOf("const fellBack = React.useRef"))
  const beforeAsk = startRecording.slice(0, startRecording.indexOf("navigator.mediaDevices.getUserMedia"))
  check("the session goes back to auto before the microphone is asked for", /openMicrophoneSession\(\)/.test(beforeAsk))
  check("and nothing is awaited between the tap and getUserMedia, so iOS still counts the gesture", !/\bawait\b/.test(beforeAsk.replace(/const media = await\s*$/, "")))
  check("the start does not wait either: start() goes straight to startRecording", /if \(engine === "record"\) \{\s*\n\s*await startRecording\(\)/.test(voice) && !/await[^\n]*\n[^\n]*if \(engine === "record"\)/.test(voice))
  check("ambient again once the tracks are stopped", /track\.stop\(\)\s*\n\s*\}\)\s*\n\s*stream\.current = null\s*\n\s*closeMicrophoneSession\(\)/.test(voice))
  check("and when a cancel lands while the prompt is open", /media\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)\s*\n\s*closeMicrophoneSession\(\)/.test(voice))
  check("the sounds module never sets ambient while the microphone is open", /if \(!microphoneOpen\) setSessionType\("ambient"\)/.test(sounds) && /export function openMicrophoneSession\(\): void \{\s*\n\s*microphoneOpen = true\s*\n\s*setSessionType\("auto"\)/.test(sounds))
  check("tap to start, tap to stop: a click, no press and hold to lose on a phone", /onClick=\{\(\) => \(voice\.state === "idle" \? startVoice\(\) : voice\.stop\(\)\)\}/.test(chat) && !/onPointerDown=\{[^}]*startVoice/.test(chat) && !/onTouchStart=\{[^}]*startVoice/.test(chat))
}

// ---------------------------------------------------------------------------
section("The recorder")
// ---------------------------------------------------------------------------
{
  check("asks for the negotiated type", /const type = recordingType\(\)\s*\n\s*const rec = makeRecorder\(media, type\)/.test(voice) && /return pickRecordingType\(MR\.isTypeSupported\?\.bind\(MR\)\)/.test(voice))
  check(
    "and when an option is refused, tries without the bit rate, then without the type",
    /type \? \{ mimeType: type, audioBitsPerSecond: RECORDING_BITS \} : \{ audioBitsPerSecond: RECORDING_BITS \},\s*\n\s*type \? \{ mimeType: type \} : undefined,\s*\n\s*undefined,/.test(voice),
  )
  check("the microphone taken away mid recording (a call, Siri) stops and keeps what was said", /track\.onended = \(\) => \{/.test(voice) && /interrupted = true\s*\n\s*stopClock\(\)\s*\n\s*setState\("transcribing"\)\s*\n\s*rec\.stop\(\)/.test(voice))
  check("a recorder error stops it rather than leaving the microphone on", /rec\.onerror = \(\) => \{\s*\n\s*interrupted = true\s*\n\s*if \(rec\.state !== "inactive"\) rec\.stop\(\)/.test(voice))
  check("an empty recording is said, not dropped in silence", /if \(chunks\.current\.length === 0\) \{\s*\n\s*setState\("idle"\)\s*\n\s*setError\(voiceErrorMessage\(interrupted \? "interrupted" : "empty"\)\)/.test(voice))
  check("the tracks are stopped every time it ends", /rec\.onstop = async \(\) => \{\s*\n\s*releaseMic\(\)/.test(voice) && /\} catch \(thrown\) \{\s*\n\s*releaseMic\(\)/.test(voice))
}

// ---------------------------------------------------------------------------
section("Every failure in plain words")
// ---------------------------------------------------------------------------
{
  const said: Record<string, RegExp> = {
    "permission in a browser": /"Microphone access is off for Storelib\. Allow it in your browser or phone settings, then try again\."/,
    "permission on iOS": /"Storelib is not allowed to use the microphone\. Turn on Microphone for Storelib in Settings, then try again\."/,
    "permission on Android": /"Storelib is not allowed to use the microphone\. Allow Microphone in Storelib's app permissions, then try again\."/,
    "no microphone": /case "NotFoundError":[\s\S]{0,60}return "No microphone was found\."/,
    "in use": /case "NotReadableError":\s*\n\s*return "Another app is using the microphone\."/,
    "cannot record": /case "NotSupportedError":\s*\n\s*case "TypeError":\s*\n\s*return "This browser cannot record\. Type it, or try another browser\."/,
    empty: /case "empty":\s*\n\s*return "Nothing was recorded\. Try again, and speak after the tick\."/,
    interrupted: /case "interrupted":\s*\n\s*return "A call or another app took the microphone\. Try again\."/,
  }
  const missing = Object.entries(said).filter(([, re]) => !re.test(voice)).map(([k]) => k)
  check("refused, none, in use, cannot record, empty, interrupted: each has its sentence", missing.length === 0, missing.join(", "))
  check("a refusal is known by every name browsers give it", /code === "NotAllowedError" \|\| code === "SecurityError" \|\| code === "PermissionDeniedError"/.test(voice))
  const messages = [...voice.matchAll(/return "([^"]+)"/g)].map((m) => m[1])
  const banned = /\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i
  check("no em dashes and none of the banned words in what it says", messages.length > 8 && messages.every((m) => !m.includes("—") && !banned.test(m)), messages.filter((m) => m.includes("—") || banned.test(m)).join(" | "))
}

// ---------------------------------------------------------------------------
section("The apps")
// ---------------------------------------------------------------------------
{
  check("iOS declares the microphone, naming Storelib AI", /<key>NSMicrophoneUsageDescription<\/key>\s*\n\s*<string>[^<]*Storelib AI[^<]*<\/string>/.test(plist))
  check("Android declares RECORD_AUDIO and MODIFY_AUDIO_SETTINGS", /android\.permission\.RECORD_AUDIO/.test(manifest) && /android\.permission\.MODIFY_AUDIO_SETTINGS/.test(manifest))
  check(
    "and keeps Capacitor's BridgeWebChromeClient, whose onPermissionRequest turns the page's request into the runtime prompt",
    /* Round 16: the activity sets StorelibChromeClient (Stripe's windows in the app), which extends it and leaves permissions to it. */
    !/onPermissionRequest/.test(activity) && /extends BridgeActivity/.test(activity) && (!/setWebChromeClient/.test(activity) || (/setWebChromeClient\(new StorelibChromeClient\(/.test(activity) && /extends BridgeWebChromeClient/.test(chrome) && !/onPermissionRequest/.test(chrome))),
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
