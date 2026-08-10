"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import { readAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { createCallPeer, type CallPeer } from "@/lib/calls/peer"
import { playConnected, playRing, playRingback } from "@/lib/calls/ringtone"
import {
  callChannelFor,
  MIN_TALK_MS,
  newCallId,
  RING_MS,
  type CallEnding,
  type CallSignal,
} from "@/lib/calls/protocol"
import { CallScreen } from "@/components/calls/call-screen"

/**
 * ===========================================================================
 *  THE ONE THING THAT IS ALWAYS LISTENING
 * ===========================================================================
 *
 * Mounted once, above every screen, for exactly as long as somebody is signed
 * in. Two reasons it lives here and not in the conversation:
 *
 *   YOU HAVE TO BE REACHABLE WHEN YOU ARE NOT LOOKING. A call arrives while you
 *   are browsing listings, or reading a different conversation. If the listener
 *   lived in the thread, you could only be called by somebody you were already
 *   talking to, on the screen you were already on.
 *
 *   AND A CALL OUTLIVES A SCREEN. You start a call from a conversation and then
 *   go and look at the listing you are calling about — every real caller does
 *   this. If the call belonged to the thread, navigating would hang up.
 *
 * ---------------------------------------------------------------------------
 * THE STATE MACHINE, AND WHY EVERY EDGE ENDS SOMEWHERE
 * ---------------------------------------------------------------------------
 *
 *   idle → dialling  ─ they answer ──→ connecting → active → ended
 *            │                                        │
 *            ├─ declined / no answer / cancel ────────┤
 *            └─ ringing (incoming) ─ answer ──────────┘
 *
 * The rule that keeps it honest: EVERY path out of "dialling" and "ringing" is
 * timed. A phone that rings for ever because a signal went missing is the
 * characteristic failure of hand-rolled calling, and it is not a rare edge —
 * it is what happens whenever the other end closes the app mid-ring.
 */

type Phase = "idle" | "dialling" | "ringing" | "connecting" | "active" | "ended"

interface Party {
  id: string
  name: string
  avatar: string | null
}

export interface CallController {
  /** Ring somebody. Refused, quietly, if a call is already up. */
  start(peer: Party, conversationId: string): void
  /** True when this device is in any call at all — for disabling a call button. */
  busy: boolean
}

const Ctx = createContext<CallController | null>(null)

/** For the call button in a conversation header. Null when nothing is mounted. */
export function useCall(): CallController | null {
  return useContext(Ctx)
}

export function CallHost({ children }: { children?: React.ReactNode }) {
  const [me, setMe] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [party, setParty] = useState<Party | null>(null)
  const [muted, setMuted] = useState(false)
  const [startedAt, setStartedAt] = useState(0)
  const [ended, setEnded] = useState<CallEnding | null>(null)

  const callId = useRef<string | null>(null)
  const conversationId = useRef<string | null>(null)
  const role = useRef<"caller" | "callee">("caller")
  const peer = useRef<CallPeer | null>(null)
  const outbound = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)
  /** Whether `outbound` has finished joining. See openTo. */
  const outboundReady = useRef(false)
  /** Signals raised before the join finished. Flushed, never dropped. */
  const queued = useRef<CallSignal[]>([])
  const ringer = useRef<{ stop(): void } | null>(null)
  const ringTimer = useRef(0)
  const connectedAt = useRef(0)
  /** Set the moment a call ends, so late signals cannot resurrect it. */
  const done = useRef(false)
  /**
   * The phase, readable from inside the socket callback.
   *
   * The callback is created once and closes over whatever `phase` was then, so
   * reading the state variable there answers a question about the past. It is
   * only used for "am I already busy", and being wrong about that means either
   * two calls at once or a caller told to go away for no reason.
   */
  const phaseRef = useRef<Phase>("idle")
  phaseRef.current = phase

  useEffect(() => {
    // The snapshot is local and instant, which is why it is first. It can also
    // be absent — a cold start in the native shell writes it after the first
    // paint — and a null id here means this device never subscribes and can
    // never be called at all. So the session is the fallback, and the
    // subscription follows whichever answers.
    const snap = readAuthSnapshot()
    if (snap?.signedIn && snap.userId) {
      setMe(snap.userId)
      return
    }
    let alive = true
    void createClient()
      .auth.getUser()
      .then(({ data }: { data: { user: { id: string } | null } }) => {
        if (alive && data.user) setMe(data.user.id)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  // ── SENDING ───────────────────────────────────────────────────────────────
  //
  // A channel to the other person, opened when a call starts and closed when it
  // ends. Supabase requires a subscription before a broadcast, so this is a
  // subscribe-to-send: nothing is ever received on it.
  //
  // SUBSCRIBED EXACTLY ONCE, AND SENDS WAIT FOR IT.
  //
  // This is the bug that made a call ring and then show nobody anything.
  // `openTo` subscribed, and the caller then called `.subscribe(cb)` again on
  // the same channel to learn when it was ready — and a second subscribe on a
  // live channel is refused by supabase-js, so the callback never ran and the
  // invite was never broadcast. The push still rang the phone, because that is
  // an ordinary HTTP request and knows nothing about any of this: a ringing
  // notification for a call the other device had never been told about.
  //
  // So the readiness is tracked here, once, and anything sent before the join
  // completes is held and flushed after it. A signal cannot be dropped for
  // being early, which was the whole failure.
  const openTo = useCallback((peerId: string) => {
    const ch = createClient().channel(callChannelFor(peerId), {
      config: { broadcast: { self: false, ack: false } },
    })
    outbound.current = ch
    outboundReady.current = false
    queued.current = []
    ch.subscribe((state: string) => {
      if (state !== "SUBSCRIBED" || outbound.current !== ch) return
      outboundReady.current = true
      const pending = queued.current
      queued.current = []
      for (const s of pending) void ch.send({ type: "broadcast", event: "call", payload: s })
    })
    return ch
  }, [])

  const send = useCallback((signal: CallSignal) => {
    const ch = outbound.current
    if (!ch) return
    if (!outboundReady.current) {
      queued.current.push(signal)
      return
    }
    void ch.send({ type: "broadcast", event: "call", payload: signal })
  }, [])

  // ── ENDING ────────────────────────────────────────────────────────────────
  //
  // One exit, used by every path — hang up, decline, time out, fail, the other
  // side leaving. Everything that has to be torn down is torn down here exactly
  // once, which is the only way a microphone reliably gets released: scattering
  // `peer.close()` across six handlers means five of them are right.
  const finish = useCallback(
    (ending: CallEnding, opts?: { tell?: boolean; record?: boolean }) => {
      if (done.current) return
      done.current = true

      const ms = connectedAt.current ? Date.now() - connectedAt.current : 0
      window.clearTimeout(ringTimer.current)
      ringer.current?.stop()
      ringer.current = null

      if (opts?.tell !== false) {
        if (ending === "declined") send({ t: "decline", callId: callId.current ?? "" })
        else if (ending === "cancelled") send({ t: "cancel", callId: callId.current ?? "" })
        else send({ t: "bye", callId: callId.current ?? "", ms })
      }

      peer.current?.close()
      peer.current = null

      const convo = conversationId.current
      const wasCaller = role.current === "caller"
      const id = callId.current

      // The line in the chat, and the notification that replaces the ringing
      // one. Only the caller writes either — see app/api/calls/record.
      if (wasCaller && convo && opts?.record !== false) {
        if (ending === "missed" || ending === "cancelled") {
          void fetch("/api/calls/ring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ conversationId: convo, callId: id, stage: "missed" }),
          }).catch(() => {})
        }
        void fetch("/api/calls/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            conversationId: convo,
            ending,
            ms: ending === "ended" && ms >= MIN_TALK_MS ? ms : 0,
          }),
        }).catch(() => {})
      }

      setEnded(ending)
      setPhase("ended")

      // Held on screen for a moment so the ending is readable — a call that
      // vanishes the instant it ends leaves you unsure whether it connected.
      window.setTimeout(() => {
        const ch = outbound.current
        outbound.current = null
        if (ch) void createClient().removeChannel(ch)
        callId.current = null
        conversationId.current = null
        connectedAt.current = 0
        setPhase("idle")
        setParty(null)
        setEnded(null)
        setMuted(false)
        setStartedAt(0)
      }, ending === "ended" ? 900 : 1600)
    },
    [send],
  )

  // ── THE MEDIA HALF ────────────────────────────────────────────────────────
  const buildPeer = useCallback(async (): Promise<CallPeer | null> => {
    let servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }]
    try {
      const r = await fetch("/api/calls/ice", { credentials: "include" })
      if (r.ok) servers = (await r.json()).iceServers ?? servers
    } catch {
      // A STUN-only call is a working call on most networks, so a failure to
      // fetch the relay list degrades rather than aborts.
    }
    try {
      return await createCallPeer(servers, {
        onIce: (candidate) => send({ t: "ice", callId: callId.current ?? "", candidate }),
        onState: (s) => {
          if (done.current) return
          if (s === "connected") {
            if (!connectedAt.current) {
              connectedAt.current = Date.now()
              setStartedAt(connectedAt.current)
              ringer.current?.stop()
              ringer.current = null
              window.clearTimeout(ringTimer.current)
              playConnected()
            }
            setPhase("active")
          } else if (s === "connecting") {
            setPhase((p) => (p === "active" ? "active" : "connecting"))
          }
        },
        onFailed: (reason) => finish(reason),
      })
    } catch {
      // Refused the microphone, or there isn't one. Nothing to do but stop,
      // and say so rather than sitting in "connecting".
      finish("failed")
      return null
    }
  }, [finish, send])

  // ── RECEIVING ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!me) return
    const client = createClient()
    const channel = client
      .channel(callChannelFor(me), { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "call" }, async ({ payload }: { payload: unknown }) => {
        const s = payload as CallSignal
        if (!s || typeof s.t !== "string") return

        // AN INVITE IS THE ONLY SIGNAL THAT MAY ARRIVE FOR AN UNKNOWN CALL.
        // Everything else naming a call this device is not in is from a call
        // that has already ended, and acting on it would disturb the next one.
        if (s.t === "invite") {
          if (callId.current || phaseRef.current !== "idle") {
            // Already busy. Told rather than ignored, so the caller sees
            // "unavailable" instead of ringing at nobody for 35 seconds.
            const ch = client.channel(callChannelFor(s.from), {
              config: { broadcast: { self: false } },
            })
            ch.subscribe((state: string) => {
              if (state !== "SUBSCRIBED") return
              void ch
                .send({ type: "broadcast", event: "call", payload: { t: "decline", callId: s.callId } })
                .then(() => void client.removeChannel(ch))
            })
            return
          }
          done.current = false
          role.current = "callee"
          callId.current = s.callId
          conversationId.current = s.conversationId
          setParty({ id: s.from, name: s.fromName, avatar: s.fromAvatar })
          setPhase("ringing")
          openTo(s.from)
          ringer.current = playRing()
          window.clearTimeout(ringTimer.current)
          ringTimer.current = window.setTimeout(() => finish("missed", { tell: false }), RING_MS)
          return
        }

        if (!callId.current || s.callId !== callId.current) return

        switch (s.t) {
          case "accept": {
            // They picked up. Only NOW is the microphone opened — see peer.ts.
            if (role.current !== "caller") return
            ringer.current?.stop()
            ringer.current = null
            window.clearTimeout(ringTimer.current)
            setPhase("connecting")
            const p = await buildPeer()
            if (!p) return
            peer.current = p
            send({ t: "offer", callId: s.callId, sdp: await p.offer() })
            return
          }
          case "offer": {
            if (role.current !== "callee") return
            const p = peer.current
            if (!p) return
            send({ t: "answer", callId: s.callId, sdp: await p.answer(s.sdp) })
            return
          }
          case "answer": {
            await peer.current?.accept(s.sdp)
            return
          }
          case "ice": {
            await peer.current?.addIce(s.candidate)
            return
          }
          case "decline":
            finish("declined", { tell: false })
            return
          case "cancel":
            finish("missed", { tell: false, record: false })
            return
          case "taken":
            // Answered on another of this person's devices.
            finish("ended", { tell: false, record: false })
            return
          case "bye":
            finish(connectedAt.current ? "ended" : "missed", { tell: false })
            return
        }
      })
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
    // ONLY `me`.
    //
    // `phase` was in here, to keep the busy check from reading a stale value —
    // and it meant this channel was torn down and rebuilt on every state
    // change, including the `setPhase("ringing")` that answering an invite
    // causes. The caller's offer arrives milliseconds later, straight into that
    // gap, and the call connects only if the rejoin happens to win the race. A
    // ref answers the busy question without the subscription depending on it.
  }, [me, buildPeer, finish, openTo, send])

  // Leaving the page mid-call tells the other end rather than leaving them
  // listening to nothing until the ICE timeout.
  useEffect(() => {
    const bye = () => {
      if (callId.current && !done.current) send({ t: "bye", callId: callId.current, ms: 0 })
    }
    window.addEventListener("pagehide", bye)
    return () => window.removeEventListener("pagehide", bye)
  }, [send])

  // ── ACTIONS ───────────────────────────────────────────────────────────────
  const start = useCallback(
    (other: Party, convo: string) => {
      if (callId.current || phaseRef.current !== "idle") return
      done.current = false
      role.current = "caller"
      const id = newCallId()
      callId.current = id
      conversationId.current = convo
      setParty(other)
      setPhase("dialling")

      const snap = readAuthSnapshot()
      openTo(other.id)
      // Raised immediately and HELD until the channel has joined — see openTo.
      // A broadcast on a channel that has not finished joining is dropped
      // silently, which is a call that never rings with no error anywhere.
      send({
        t: "invite",
        callId: id,
        conversationId: convo,
        from: me ?? "",
        fromName: snap?.displayName || snap?.username || "Cineva",
        fromAvatar: snap?.avatarUrl ?? null,
      })

      // The socket only reaches an app that is open. This is the half that
      // reaches a phone in a pocket — see app/api/calls/ring.
      void fetch("/api/calls/ring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ conversationId: convo, callId: id, stage: "ring" }),
      }).catch(() => {})

      ringer.current = playRingback()
      window.clearTimeout(ringTimer.current)
      ringTimer.current = window.setTimeout(() => finish("missed"), RING_MS)
    },
    [finish, me, openTo, send],
  )

  const answer = useCallback(async () => {
    if (role.current !== "callee" || !callId.current) return
    ringer.current?.stop()
    ringer.current = null
    window.clearTimeout(ringTimer.current)
    setPhase("connecting")
    // The peer is built BEFORE accepting, so the offer that follows within
    // milliseconds has something to arrive at.
    const p = await buildPeer()
    if (!p) return
    peer.current = p
    send({ t: "accept", callId: callId.current })
  }, [buildPeer, send])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      peer.current?.setMuted(!m)
      return !m
    })
  }, [])

  const controller = useMemo<CallController>(
    () => ({ start, busy: phase !== "idle" }),
    [start, phase],
  )

  return (
    <Ctx.Provider value={controller}>
      {children}
      {phase !== "idle" && party && (
        <CallScreen
          phase={phase}
          ending={ended}
          party={party}
          muted={muted}
          startedAt={startedAt}
          onAnswer={() => void answer()}
          onDecline={() => finish("declined")}
          onHangUp={() => finish(connectedAt.current ? "ended" : "cancelled")}
          onToggleMute={toggleMute}
        />
      )}
    </Ctx.Provider>
  )
}
