/**
 * ===========================================================================
 *  THE AUDIO HALF OF A CALL
 * ===========================================================================
 *
 * One RTCPeerConnection, one microphone, one <audio> playing what comes back.
 * Everything about WHO is being called lives in the signalling; this only knows
 * that somebody is.
 *
 * The shape is a factory rather than a hook because a call outlives any one
 * screen: it is started from a thread, it survives navigating away from that
 * thread, and it ends when somebody hangs up. A hook would tie it to whatever
 * happened to be mounted when it began.
 *
 * ---------------------------------------------------------------------------
 * THE THING THAT GOES WRONG IF NOBODY WRITES IT DOWN
 * ---------------------------------------------------------------------------
 * ICE candidates start arriving the moment the local description is set, which
 * is BEFORE the other end has sent its own description — and a candidate added
 * to a connection with no remote description throws. So inbound candidates are
 * queued until there is something to add them to, and flushed when there is.
 * Skipping the queue works locally, on one network, every time, and then drops
 * roughly the first half of the candidates from anyone further away.
 */

import { CONNECT_MS, type CallEnding } from "@/lib/calls/protocol"

export type PeerState = "new" | "connecting" | "connected" | "ended"

export interface CallPeer {
  /** Caller side: make the offer once the callee has accepted. */
  offer(): Promise<string>
  /** Callee side: take the offer, answer it. */
  answer(sdp: string): Promise<string>
  /** Caller side: the answer came back. */
  accept(sdp: string): Promise<void>
  addIce(candidate: RTCIceCandidateInit): Promise<void>
  /** Mute the microphone. The connection stays up; the track stops being sent. */
  setMuted(muted: boolean): void
  /** Everything: tracks, connection, timers, the audio element. Idempotent. */
  close(): void
  /** The stream being sent, for a level meter. Null until the mic is open. */
  readonly localStream: MediaStream | null
}

export interface CallPeerHandlers {
  onIce(candidate: RTCIceCandidateInit): void
  onState(state: PeerState): void
  /** Connection lost or never made. The call is over and this says why. */
  onFailed(reason: CallEnding): void
}

/**
 * Open the microphone and build the connection.
 *
 * The mic is opened HERE, at construction, and construction happens only after
 * a call is accepted by both ends — never while a phone is merely ringing. The
 * recording indicator appearing before somebody picks up would be a live
 * microphone in a room where nobody has agreed to be heard yet.
 */
export async function createCallPeer(
  iceServers: RTCIceServer[],
  handlers: CallPeerHandlers,
): Promise<CallPeer> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // A phone call, not a recording of a room: the far end is listening
      // through a small speaker, often outdoors.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  })

  const pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" })
  for (const track of stream.getAudioTracks()) pc.addTrack(track, stream)

  // Created rather than rendered: an <audio> in the React tree would unmount
  // with the screen that owns it, and a call survives navigation. Appended to
  // the document so mobile browsers treat it as a real element with a real
  // audio session — a detached element plays silently on iOS.
  const sink = document.createElement("audio")
  sink.autoplay = true
  sink.setAttribute("playsinline", "")
  sink.style.display = "none"
  document.body.appendChild(sink)

  /** See the note at the top — candidates outrun descriptions. */
  const pending: RTCIceCandidateInit[] = []
  let remoteSet = false
  let closed = false
  let connectTimer = 0

  const stopConnectTimer = () => {
    window.clearTimeout(connectTimer)
    connectTimer = 0
  }

  pc.ontrack = (e) => {
    sink.srcObject = e.streams[0] ?? new MediaStream([e.track])
    // Autoplay can be refused even here; a call the user started is about as
    // clear an intent as a browser gets, so the retry is enough and a failure
    // to play is not a failure of the call.
    void sink.play().catch(() => undefined)
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) handlers.onIce(e.candidate.toJSON())
  }

  pc.onconnectionstatechange = () => {
    if (closed) return
    const s = pc.connectionState
    if (s === "connected") {
      stopConnectTimer()
      handlers.onState("connected")
      return
    }
    if (s === "connecting") {
      handlers.onState("connecting")
      return
    }
    if (s === "failed") {
      // No path between the two networks. Almost always symmetric NAT with no
      // TURN configured — see the note in protocol.ts.
      stopConnectTimer()
      handlers.onFailed("failed")
      return
    }
    if (s === "disconnected") {
      // NOT an ending. `disconnected` is routinely transient — a handover from
      // Wi-Fi to mobile data produces it and recovers within seconds. Ending
      // the call here would drop it every time somebody walked out of a shop.
      handlers.onState("connecting")
    }
  }

  const peer: CallPeer = {
    get localStream() {
      return closed ? null : stream
    },

    async offer() {
      const desc = await pc.createOffer({ offerToReceiveAudio: true })
      await pc.setLocalDescription(desc)
      armConnectTimer()
      return desc.sdp ?? ""
    },

    async answer(sdp) {
      await pc.setRemoteDescription({ type: "offer", sdp })
      remoteSet = true
      await flush()
      const desc = await pc.createAnswer()
      await pc.setLocalDescription(desc)
      armConnectTimer()
      return desc.sdp ?? ""
    },

    async accept(sdp) {
      await pc.setRemoteDescription({ type: "answer", sdp })
      remoteSet = true
      await flush()
    },

    async addIce(candidate) {
      if (!remoteSet) {
        pending.push(candidate)
        return
      }
      try {
        await pc.addIceCandidate(candidate)
      } catch {
        // A candidate that will not apply is one path out of several; the
        // connection still has the others. Throwing here would end a call over
        // a route that was never going to be used.
      }
    },

    setMuted(muted) {
      for (const t of stream.getAudioTracks()) t.enabled = !muted
    },

    close() {
      if (closed) return
      closed = true
      stopConnectTimer()
      // The tracks first, or the browser keeps the microphone indicator lit
      // after the call has visibly ended.
      for (const t of stream.getAudioTracks()) t.stop()
      try {
        pc.close()
      } catch {
        /* already gone */
      }
      sink.srcObject = null
      sink.remove()
      handlers.onState("ended")
    },
  }

  function armConnectTimer() {
    if (connectTimer) return
    connectTimer = window.setTimeout(() => {
      if (closed || pc.connectionState === "connected") return
      handlers.onFailed("failed")
    }, CONNECT_MS)
  }

  async function flush() {
    while (pending.length) {
      const c = pending.shift()!
      try {
        await pc.addIceCandidate(c)
      } catch {
        /* see addIce */
      }
    }
  }

  handlers.onState("connecting")
  return peer
}
