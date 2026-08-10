/**
 * ===========================================================================
 *  VOICE CALLS: THE PARTS THAT FAIL SILENTLY
 * ===========================================================================
 *
 * A call has two ways of being wrong, and only one of them is obvious.
 *
 * The obvious one is that it does not connect, which everybody notices
 * immediately. The quiet one is a call that ends without ending: a microphone
 * left open, a phone that rings for ever because a signal went missing, a
 * screen that says "connecting" after both people have hung up. Nothing on
 * screen reports any of those and the only symptom is a battery, or a recording
 * indicator somebody notices an hour later.
 *
 * So the encodings are driven, and the lifetime invariants — every ring is
 * timed, the microphone opens only after somebody agreed to be heard, the
 * ending happens exactly once — are asserted against the source of the state
 * machine, which is the one place they can be checked without a second phone.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  formatCallDuration,
  iceServers,
  newCallId,
  RING_MS,
  CONNECT_MS,
} from "@/lib/calls/protocol"
import {
  callPreview,
  callSummary,
  decodeCallBody,
  encodeCallBody,
  isEncodedCall,
} from "@/lib/messages/call-message"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const host = read("components/calls/call-host.tsx")
const peer = read("lib/calls/peer.ts")

console.log("\nVoice calls\n")

// ── THE RECORD LEFT IN THE CHAT ─────────────────────────────────────────────

check(
  "a call round-trips through a message body",
  (() => {
    const body = encodeCallBody("ended", 127_400)
    const back = decodeCallBody(body)
    return back?.ending === "ended" && back.ms === 127_400
  })(),
)

check(
  "its sentinel is not the image one and not the voice one",
  (() => {
    // Three kinds of thing now hide inside a text body. Two sharing a sentinel
    // would be decoded by whichever decoder ran first, silently, and the
    // symptom would be a call rendering as a broken photograph.
    const call = read("lib/messages/call-message.ts")
    const voice = read("lib/messages/voice-message.ts")
    const image = read("lib/messages/image-fallback.ts")
    // The call sentinel is now declared as an exported constant, because the
    // ring route's rate limit has to name it rather than copy it.
    const of = (s: string) =>
      /const (?:CALL_)?SENTINEL = "([^"]+)"/.exec(s)?.[1]
    const [c, v, i] = [of(call), of(voice), of(image)]
    return !!c && !!v && !!i && c !== v && c !== i && v !== i
  })(),
)

check(
  "ordinary text is not mistaken for a call",
  !isEncodedCall("Salut, ai mai avut apel?") && decodeCallBody("Apel vocal") === null,
)

check(
  "a body naming an ending nobody defined is refused rather than half-read",
  decodeCallBody(encodeCallBody("ended", 1000).replace("ended", "exploded")) === null,
)

check(
  "a call that never connected carries no duration",
  (() => {
    // "Apel pierdut · 0:00" is worse than "Apel pierdut": it implies a call of
    // zero length happened rather than none at all.
    const back = decodeCallBody(encodeCallBody("missed", 0))
    return back?.ms === 0 && callPreview(back) === "Apel pierdut"
  })(),
)

check(
  "the same call reads differently from the two ends",
  (() => {
    // Telling the person who MADE the call that they missed it is nonsense, and
    // it is the default outcome of storing one string for both readers.
    const missed = { ending: "missed" as const, ms: 0 }
    const declined = { ending: "declined" as const, ms: 0 }
    return (
      callSummary(missed, true) !== callSummary(missed, false) &&
      callSummary(declined, true) !== callSummary(declined, false)
    )
  })(),
)

check(
  "durations read as a clock, and an hour does not become 87 minutes",
  formatCallDuration(7_000) === "0:07" &&
    formatCallDuration(127_000) === "2:07" &&
    formatCallDuration(3_723_000) === "1:02:03",
)

check(
  "call ids are unique across a burst",
  new Set(Array.from({ length: 200 }, () => newCallId())).size === 200,
)

// ── WHERE THE TWO ENDS LOOK FOR EACH OTHER ──────────────────────────────────

check(
  "STUN alone is a valid configuration",
  (() => {
    // No TURN configured must degrade to "works on most networks", never to a
    // crash or an empty list, which would be no call anywhere.
    const s = iceServers()
    return s.length === 1 && JSON.stringify(s[0].urls).includes("stun:")
  })(),
)

check(
  "a TURN server is used only when all three parts of it are present",
  (() => {
    // A URL with no credential is not a usable relay; adding it produces
    // connections that fail slowly rather than failing fast on STUN.
    const partial = iceServers({ url: "turn:relay.example.com:3478", username: "u" })
    const full = iceServers({
      url: "turn:relay.example.com:3478",
      username: "u",
      credential: "p",
    })
    return partial.length === 1 && full.length === 2 && full[1].username === "u"
  })(),
)

check(
  "several relay URLs can be given as one setting",
  (() => {
    // UDP and TCP forms of the same relay are two URLs, and an environment
    // variable is one string.
    const s = iceServers({
      url: "turn:relay.example.com:3478, turns:relay.example.com:5349",
      username: "u",
      credential: "p",
    })
    return Array.isArray(s[1].urls) && (s[1].urls as string[]).length === 2
  })(),
)

// ── THE MICROPHONE ──────────────────────────────────────────────────────────

check(
  "the microphone is opened only after somebody agreed to be heard",
  (() => {
    // THE ONE THAT MATTERS MOST. getUserMedia lives in createCallPeer, and
    // createCallPeer is called from exactly two places: the caller's handler for
    // "accept", and the callee's own answer(). Neither runs while a phone is
    // merely ringing — a live microphone in a room where nobody has picked up
    // is a recording nobody consented to.
    const opensMic = /getUserMedia/.test(peer)
    const builds = [...host.matchAll(/buildPeer\(\)/g)].length
    const onInvite = /case "invite"[\s\S]{0,1200}?buildPeer/.test(host)
    return opensMic && !/getUserMedia/.test(host) && builds >= 2 && !onInvite
  })(),
  "        components/calls/call-host.tsx — nothing may open the microphone on\n" +
    "        an incoming invite, only on an answer.",
)

check(
  "and it is released on every ending, from one place",
  (() => {
    // Scattering close() across six handlers means five of them are right. One
    // exit, guarded so it cannot run twice.
    const oneExit = /const finish = useCallback\(/.test(host)
    const guard = /if \(done\.current\) return\s*\n\s*done\.current = true/.test(host)
    const closes = /peer\.current\?\.close\(\)/.test(host)
    const stopsTracks = /getAudioTracks\(\)\) t\.stop\(\)/.test(peer)
    return oneExit && guard && closes && stopsTracks
  })(),
)

// ── NOTHING RINGS FOR EVER ──────────────────────────────────────────────────

check(
  "both ends of a ring are on a timer",
  (() => {
    // The characteristic failure of hand-rolled calling, and not a rare edge:
    // it is what happens every time the other end closes the app mid-ring, in
    // which case no signal is ever coming.
    const armed = [...host.matchAll(/ringTimer\.current = window\.setTimeout/g)].length
    return armed >= 2 && RING_MS > 10_000 && RING_MS < 120_000
  })(),
)

check(
  "and a call that is answered but never connects gives up too",
  (() => {
    // A different failure from ringing out: somebody ANSWERED, so a person is
    // holding a phone to their ear hearing nothing.
    return /CONNECT_MS/.test(peer) && CONNECT_MS > 5_000 && CONNECT_MS < RING_MS
  })(),
)

check(
  "a transient network change is not treated as a hang-up",
  (() => {
    // `disconnected` fires on a Wi-Fi to mobile handover and recovers within
    // seconds. Ending on it drops the call every time somebody leaves a shop.
    return /if \(s === "disconnected"\)[\s\S]{0,400}?onState\("connecting"\)/.test(peer)
  })(),
)

check(
  "a signal from a call this device is not in cannot disturb the one it is in",
  (() => {
    // Late signals arrive: a "bye" from a call that ended as the next one
    // starts would hang up the wrong call.
    return /if \(!callId\.current \|\| s\.callId !== callId\.current\) return/.test(host)
  })(),
)

check(
  "a second caller is told, rather than left ringing at nobody",
  (() => {
    // Silence for 35 seconds is indistinguishable from a phone in a pocket.
    return /if \(callId\.current \|\| phaseRef\.current !== "idle"\)[\s\S]{0,700}?"decline"/.test(host)
  })(),
)

// ── THE CALL THAT RANG AND SHOWED NOBODY ANYTHING ───────────────────────────
//
// The push rang the phone and no answer screen ever appeared, because the
// invite was never broadcast at all. Three separate ways a signal could go
// missing, all of them silent, and the push is an ordinary HTTP request that
// knows about none of them — so the symptom was a ringing notification for a
// call the other device had never been told about.

check(
  "a channel is subscribed exactly once",
  (() => {
    // THE ONE THAT CAUSED IT. supabase-js refuses a second `.subscribe()` on a
    // live channel, so the callback passed to it never ran — and that callback
    // was what sent the invite. Nothing threw and nothing logged.
    const opens = /const openTo = useCallback\([\s\S]*?\n  \}, \[\]\)/.exec(host)?.[0] ?? ""
    const startFn = /const start = useCallback\([\s\S]*?\n  \)\n/.exec(host)?.[0] ?? ""
    return (
      [...opens.matchAll(/\.subscribe\(/g)].length === 1 &&
      // `start` must not subscribe again to the channel openTo just opened.
      !/\.subscribe\(/.test(startFn)
    )
  })(),
  "        components/calls/call-host.tsx — a second subscribe on a live channel\n" +
    "        is refused, and its callback silently never runs.",
)

check(
  "a signal raised before the channel joined is held, not dropped",
  (() => {
    // The invite is raised in the same tick the channel is opened, so it is
    // ALWAYS early. Dropping early sends is the same missing call by a
    // different route.
    return (
      /queued\.current\.push\(signal\)/.test(host) &&
      /outboundReady\.current = true/.test(host) &&
      /for \(const s of pending\)/.test(host)
    )
  })(),
)

check(
  "the receiving channel is not rebuilt when the call changes state",
  (() => {
    // `phase` in the dependency array tore this channel down and rebuilt it on
    // every state change — including the one that answering an invite causes.
    // The caller's offer arrives milliseconds later, into that gap, and the
    // call connects only if the rejoin wins the race.
    const deps = /\}, \[me, [^\]]*\]\)/.exec(host)?.[0] ?? ""
    return deps.length > 0 && !/\bphase\b/.test(deps) && /phaseRef\.current/.test(host)
  })(),
  "        components/calls/call-host.tsx — the listening channel must not depend\n" +
    "        on call state, or signals land in the gap while it rejoins.",
)

check(
  "a device with no cached identity still subscribes",
  (() => {
    // The snapshot can be absent on a cold start in the native shell, and a
    // null id here means this device is never reachable — it simply cannot be
    // called, with nothing on screen to say so.
    return /readAuthSnapshot\(\)/.test(host) && /auth\.getUser\(\)/.test(host)
  })(),
)

check(
  "leaving the page tells the other end",
  /pagehide/.test(host) && /\{ t: "bye"/.test(host),
)

// ── RINGING A PHONE THAT IS NOT LOOKING ─────────────────────────────────────

check(
  "the socket is not the only way a phone can ring",
  (() => {
    // A call you can only receive while already looking at the screen is not a
    // call. The push is the half that reaches a pocket.
    const route = read("app/api/calls/ring/route.ts")
    return /sendPushToUser\(recipient/.test(route) && /\/api\/calls\/ring/.test(host)
  })(),
)

check(
  "and ringing somebody requires being in a conversation with them",
  (() => {
    // Without this the endpoint is "make any user's phone ring, by id".
    const route = read("app/api/calls/ring/route.ts")
    const convoAt = route.indexOf('.from("conversations")')
    // The CALL, not the import at the top of the file — which sits before the
    // query and would satisfy this ordering while proving nothing.
    const sendAt = route.indexOf("await sendPushToUser(")
    return convoAt > 0 && sendAt > convoAt
  })(),
)

check(
  "a missed call replaces the ringing notification instead of joining it",
  (() => {
    // Otherwise the lock screen keeps a notification that says a phone is
    // ringing when it has stopped.
    const route = read("app/api/calls/ring/route.ts")
    return /collapseId: `call-\$\{callId\}`/.test(route) && /stage === "missed"/.test(route)
  })(),
)

check(
  "the relay credential is not compiled into the public bundle",
  (() => {
    // A TURN credential in a NEXT_PUBLIC_ variable is served to everyone who
    // loads the site, signed in or not, and relay bandwidth is metered.
    const ice = read("app/api/calls/ice/route.ts")
    const proto = read("lib/calls/protocol.ts")
    return (
      /process\.env\.TURN_URL/.test(ice) &&
      !/NEXT_PUBLIC_TURN/.test(ice) &&
      !/NEXT_PUBLIC_TURN/.test(proto) &&
      !/NEXT_PUBLIC_TURN/.test(host) &&
      /Not signed in/.test(ice)
    )
  })(),
)

check(
  "only one end writes the line in the chat",
  (() => {
    // Both ends know the call ended, so both writing means every call leaves
    // two lines. The caller is the end that knows every ending.
    const record = read("app/api/calls/record/route.ts")
    return /wasCaller && convo/.test(host) && /ONLY THE CALLER WRITES IT/.test(record)
  })(),
)

// ── WHAT A CALL CAN DO TO SOMEBODY WHO DOES NOT WANT IT ─────────────────────

check(
  "a block stops a call, not only a message",
  (() => {
    // The more serious of the two omissions here. A message from somebody you
    // have blocked sits unread in a list; a call makes the phone in your pocket
    // ring. Blocking is most often used by exactly the people for whom being
    // reachable at all is the problem, so the one channel that demands
    // immediate attention cannot be the one it does not cover.
    const route = read("app/api/calls/ring/route.ts")
    const blockAt = route.indexOf('.from("user_blocks")')
    const sendAt = route.indexOf("await sendPushToUser(")
    return (
      blockAt > 0 &&
      sendAt > blockAt &&
      // Checked in the direction that matters: THEY blocked YOU.
      /\.eq\("blocker_id", recipient\)[\s\S]{0,80}?\.eq\("blocked_id", user\.id\)/.test(route)
    )
  })(),
  "        app/api/calls/ring — without this, blocking somebody stops their\n" +
    "        messages and leaves them able to ring you.",
)

check(
  "and the refusal does not disclose that a block exists",
  (() => {
    // "You have been blocked" is information the blocked party is not owed, so
    // it answers exactly as a conversation that does not exist would — the same
    // rule the text route follows.
    const route = read("app/api/calls/ring/route.ts")
    // Only the STRING that is sent back — `blockedBy` is the variable being
    // tested and naturally contains "blocked", which an unscoped search reads
    // as a disclosure.
    const after = route.slice(route.indexOf("if (blockedBy)"), route.indexOf("if (blockedBy)") + 200)
    const sent = /NextResponse\.json\(\{ error: "([^"]*)" \}/.exec(after)?.[1] ?? ""
    return sent === "Not found" && /404/.test(after) && !/blocat|blocked/i.test(sent)
  })(),
)

check(
  "there is a ceiling on how often one person can make another phone ring",
  (() => {
    // Every other write in messaging has one and this had none, which is the
    // worst place to leave it out: a loop here is not spam sitting in a list,
    // it is a phone ringing over and over on a lock screen.
    const route = read("app/api/calls/ring/route.ts")
    return (
      /count: "exact", head: true/.test(route) &&
      /status: 429/.test(route) &&
      // From the rows a call leaves behind, not from memory — serverless
      // instances do not share memory, so an in-process counter resets whenever
      // the platform scales.
      /CALL_SENTINEL/.test(route)
    )
  })(),
)

check(
  "and the limit names the encoding rather than copying it",
  (() => {
    // A rate limit that spelled the sentinel out as a literal would be a second
    // copy of the encoding, silently wrong the day the sentinel changes — and
    // wrong in the direction that stops counting calls at all.
    const enc = read("lib/messages/call-message.ts")
    const route = read("app/api/calls/ring/route.ts")
    return (
      /export const CALL_SENTINEL/.test(enc) &&
      /const SENTINEL = CALL_SENTINEL/.test(enc) &&
      /import \{ CALL_SENTINEL \} from "@\/lib\/messages\/call-message"/.test(route)
    )
  })(),
)

check(
  "leaving a conversation does not buzz either",
  (() => {
    // Same reasoning as the inbox rows: leaving a screen is navigation, not an
    // act. It also fires on the control pressed most often on this screen, on
    // the exact frame the pop animation starts.
    const thread = read("components/messages/thread.tsx")
    const back = /onClick=\{\(\) => closeThread\(\)\}/.test(thread)
    const buzzed = /void triggerHaptic\("light"\)\s*\n\s*closeThread\(\)/.test(thread)
    return back && !buzzed
  })(),
)

// ── AN INVITE THAT ARRIVES, RATHER THAN ONE THAT WAS SENT ───────────────────

check(
  "the invite is repeated until something answers it",
  (() => {
    // A broadcast reaches whoever is joined AT THAT MOMENT. The other device
    // may be a few hundred milliseconds from finishing its own join — just
    // opened, just back from the background, socket just reconnected — and a
    // single packet sent into that window is gone with nothing to report it.
    // The caller hears ringback for thirty-five seconds and the callee's phone
    // never rings.
    return (
      /retry\.current = window\.setInterval\(/.test(host) &&
      /phaseRef\.current !== "dialling"/.test(host) &&
      // Stopped by every path out of dialling, not only by success.
      /window\.clearInterval\(retry\.current\)/.test(host)
    )
  })(),
  "        components/calls/call-host.tsx — there is no delivery receipt to wait\n" +
    "        for, so the invite has to be repeated instead.",
)

check(
  "and a repeat does not make the ringing phone decline its own call",
  (() => {
    // The repeats land in the same handler as a second CALLER would, and the
    // busy branch answers with a decline. Without this the retry above turns a
    // ringing phone into one that hangs up on the person calling it — a fix
    // that breaks the thing it fixes.
    const invite = /if \(s\.t === "invite"\) \{[\s\S]{0,600}?if \(callId\.current \|\|/.exec(host)?.[0] ?? ""
    return /if \(s\.callId === callId\.current\) return/.test(invite)
  })(),
)

check(
  "a channel that has gone deaf rejoins",
  (() => {
    // `subscribe()` with no callback is a join that is never checked again. A
    // phone that loses signal in a lift, or is backgrounded long enough for the
    // socket to be torn down, comes back with a channel that reports nothing
    // and delivers nothing — and the only symptom is calls that never arrive on
    // a device that looks perfectly fine.
    return (
      /CHANNEL_ERROR|TIMED_OUT|CLOSED/.test(host) &&
      /setRejoinTick/.test(host) &&
      // A backgrounded socket usually dies without reporting anything at all,
      // so being looked at again is its own trigger.
      /visibilitychange/.test(host) &&
      /\}, \[me, rejoinTick,/.test(host)
    )
  })(),
)

check(
  "the conversation never uncovers onto its own skeleton",
  (() => {
    // The cover's three conditions could all be satisfied while `thread` was
    // still null: dataReady starts true when nothing came from the cache,
    // pixelsReady turns true immediately with no images to wait for, and
    // travelled expires on a timer regardless. So on a cold open the cover
    // lifted onto the placeholder, and the placeholder was then replaced by the
    // messages — two arrivals for one tap, the least informative one first.
    const thread = read("components/messages/thread.tsx")
    return /const covered = thread === null \|\| !dataReady/.test(thread)
  })(),
  "        components/messages/thread.tsx — the skeleton is the last resort\n" +
    "        BEHIND the cover, not a state anybody is shown.",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
