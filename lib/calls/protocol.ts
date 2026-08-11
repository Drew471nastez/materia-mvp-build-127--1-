/**
 * ===========================================================================
 *  WHAT TWO PHONES SAY TO EACH OTHER TO START TALKING
 * ===========================================================================
 *
 * A voice call is peer-to-peer audio (WebRTC) plus a way for the two ends to
 * find each other. WebRTC handles the audio; it cannot handle the finding, and
 * that is all this file is about.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT A CALLING SERVICE
 * ---------------------------------------------------------------------------
 * Twilio, Agora and LiveKit all do this well and all of them are an account, a
 * bill per minute, and a second place where a conversation between two users of
 * this marketplace exists. The audio here goes directly between the two phones
 * and touches no server, which is cheaper, more private, and one fewer vendor
 * that can be down. What it costs is written honestly below, under TURN.
 *
 * ---------------------------------------------------------------------------
 * THE CHANNEL SHAPE: ONE PER PERSON, NOT ONE PER CALL
 * ---------------------------------------------------------------------------
 * Every signed-in device subscribes to `calls:<their own id>` for as long as
 * the app is open, and sends to `calls:<the other id>`. That is the whole
 * topology.
 *
 * A per-CALL channel would be tidier to read and wrong in the one moment that
 * matters: a call begins when somebody who is not expecting it has to be told,
 * so the callee cannot already be subscribed to a channel named after a call
 * they have never heard of. Something permanent has to carry the first word,
 * and once something permanent exists there is no reason for a second thing.
 *
 * Every signal therefore carries its `callId`, and anything about a call this
 * device is not in is dropped. Two calls cannot be confused, and a signal that
 * arrives late from a call that has already ended cannot disturb the next one.
 */

/** How long a phone rings before it is a missed call. What a mobile network does. */
export const RING_MS = 35_000

/**
 * How long after answering to give up if the audio never connects.
 *
 * Distinct from RING_MS because it is a different failure: the other side
 * ANSWERED, so somebody is holding a phone to their ear hearing nothing. That
 * deserves to end quickly and say why, rather than sit in "Se conectează…"
 * until one of them gives up.
 */
export const CONNECT_MS = 20_000

/** Below this, nobody said anything — it is not worth a duration in the chat. */
export const MIN_TALK_MS = 1_000

export type CallRole = "caller" | "callee"

/** Why a call is over. Decides what the chat says about it afterwards. */
export type CallEnding =
  /** Somebody hung up a call that had connected. */
  | "ended"
  /** Rang out, or the app was never open to hear it. */
  | "missed"
  /** The callee actively refused. */
  | "declined"
  /** The caller gave up before it was answered. */
  | "cancelled"
  /** Signalling worked, audio never did. Almost always a NAT with no TURN. */
  | "failed"

export type CallSignal =
  /** Your phone is ringing. Carries who is calling, because the callee may have
   *  no idea who this is and the ringing screen has to say. */
  | {
      t: "invite"
      callId: string
      conversationId: string
      from: string
      fromName: string
      fromAvatar: string | null
    }
  /** The caller stopped waiting. Distinct from `bye`: nothing was ever up. */
  | { t: "cancel"; callId: string }
  | { t: "decline"; callId: string }
  /** Picked up. The caller answers this by starting the WebRTC negotiation —
   *  never before, or a phone that is still ringing has a live microphone. */
  | { t: "accept"; callId: string }
  | { t: "offer"; callId: string; sdp: string }
  | { t: "answer"; callId: string; sdp: string }
  | { t: "ice"; callId: string; candidate: RTCIceCandidateInit }
  /** Hung up. `ms` is the talk time as the hanging-up end measured it. */
  | { t: "bye"; callId: string; ms: number }
  /** Answered somewhere else. A person signed in on a phone and a laptop must
   *  not keep hearing one ring after they have picked up the other. */
  | { t: "taken"; callId: string }

/** Channel a device listens on for everything addressed to it. */
export function callChannelFor(userId: string): string {
  return `calls:${userId}`
}

/**
 * A call id.
 *
 * `crypto.randomUUID` where it exists — which is everywhere this app runs — and
 * a composed fallback rather than a throw, because failing to generate a name
 * is a silly reason to be unable to phone somebody.
 */
export function newCallId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * WHERE THE TWO ENDS LOOK FOR EACH OTHER.
 *
 * STUN alone tells a phone its own public address, which is enough whenever at
 * least one of the two networks will accept an inbound packet — most home and
 * office Wi-Fi.
 *
 * IT IS NOT ENOUGH ON EVERY NETWORK, and this is the honest limit of a
 * serverless call. Carrier mobile data and corporate networks are often
 * symmetric NAT, where neither end can be reached directly and the audio has to
 * be relayed by a third machine. That machine is a TURN server, it cannot be
 * free because it carries the audio, and there is no way around it that is not
 * itself a TURN server.
 *
 * So it is configuration rather than an assumption: set TURN_URL, TURN_USERNAME
 * and TURN_CREDENTIAL and calls connect on those networks too. Without them
 * everything here still works, on fewer networks, and a call that cannot find a
 * path fails as "failed" with a message that says so — rather than ringing
 * forever, which is what this looks like when nobody has thought about it.
 */
export function iceServers(turn?: {
  url?: string | null
  username?: string | null
  credential?: string | null
}): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ]
  if (turn?.url && turn.username && turn.credential) {
    servers.push({
      urls: turn.url.split(",").map((u) => u.trim()).filter(Boolean),
      username: turn.username,
      credential: turn.credential,
    })
  }
  return servers
}

/** "2:07" — what a call says about itself, live and afterwards. */
export function formatCallDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}
