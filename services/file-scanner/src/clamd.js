import net from "node:net"
import { createHash } from "node:crypto"

/**
 * ===========================================================================
 *  TALKING TO CLAMD
 * ===========================================================================
 * clamd's own protocol over TCP or a unix socket, with no client library:
 *
 *   zPING\0      -> "PONG"
 *   zVERSION\0   -> "ClamAV 1.4.6/28129/Sun Sep 20 06:26:26 2026"
 *   zINSTREAM\0  then chunks, each a 4 byte big endian length and that many
 *                bytes, then a zero length -> "stream: OK" or
 *                "stream: Eicar-Test-Signature FOUND" or "... ERROR"
 *
 * INSTREAM is why nothing is written to disk here: the bytes of an upload go
 * from the HTTP request to clamd as they arrive, hashed on the way, and are
 * never kept. clamd itself spools the stream to its own temporary directory
 * inside its container and removes it when the scan ends.
 *
 * clamd closes the connection early, with "INSTREAM size limit exceeded",
 * when a stream passes its StreamMaxLength. That reply is read even when the
 * write that crossed the limit failed with EPIPE, so the caller hears "too
 * large" rather than "clamd went away".
 */

export class ScanError extends Error {
  /**
   * @param {"clamd_unavailable"|"too_large"|"timeout"|"engine_error"|"aborted"|"client_error"} code
   */
  constructor(code, message) {
    super(message)
    this.name = "ScanError"
    this.code = code
  }
}

/** The largest piece of a chunk sent in one INSTREAM frame. */
const FRAME_BYTES = 64 * 1024

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

/**
 * "ClamAV 1.4.6/28129/Sun Sep 20 06:26:26 2026" as the engine version, the
 * signature database version and when that database was built. clamd writes
 * the date in its own clock, which is UTC in the official image.
 */
export function parseVersion(reply) {
  const text = String(reply ?? "").replace(/\0+$/, "").trim()
  const m = /^ClamAV\s+([^\s/]+)(?:\/(\d+)\/(.+))?$/.exec(text)
  if (!m) return null
  let updatedAt = null
  const d = m[3] ? /^\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/.exec(m[3].trim()) : null
  if (d && d[1] in MONTHS) {
    updatedAt = new Date(Date.UTC(Number(d[6]), MONTHS[d[1]], Number(d[2]), Number(d[3]), Number(d[4]), Number(d[5]))).toISOString()
  }
  return { version: m[1], signatures: m[2] ? Number(m[2]) : null, updatedAt }
}

/** clamd's answer to one INSTREAM, as a verdict. */
export function parseScanReply(reply) {
  const text = String(reply ?? "").replace(/\0+$/, "").trim()
  /* With IDSESSION a reply is prefixed "<id>: "; accept it for completeness. */
  const body = text.replace(/^\d+:\s*/, "")
  if (/^stream:\s*OK$/.test(body)) return { status: "clean" }
  const found = /^stream:\s*(.+?)\s+FOUND$/.exec(body)
  if (found) return { status: "infected", threat: found[1].slice(0, 200) }
  if (/size limit exceeded/i.test(body)) return { status: "error", code: "too_large", message: "The file is larger than the scanner accepts" }
  if (/ERROR$/.test(body)) return { status: "error", code: "engine_error", message: body.replace(/\s*ERROR$/, "").slice(0, 200) || "clamd error" }
  return { status: "error", code: "engine_error", message: body ? "Unexpected reply from clamd" : "clamd closed the connection without a reply" }
}

function connect(opts, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    const socket = opts.socket
      ? net.createConnection({ path: opts.socket })
      : net.createConnection({ host: opts.host, port: opts.port })
    const done = (err) => {
      clearTimeout(timer)
      socket.off("connect", onConnect)
      socket.off("error", onError)
      signal?.removeEventListener("abort", onAbort)
      if (err) {
        socket.destroy()
        reject(err)
      } else resolve(socket)
    }
    const onConnect = () => done()
    const onError = (e) => done(new ScanError("clamd_unavailable", `Cannot reach clamd: ${e.code || e.message}`))
    const onAbort = () => done(signal.reason instanceof ScanError ? signal.reason : new ScanError("aborted", "Aborted"))
    const timer = setTimeout(() => done(new ScanError("clamd_unavailable", "Timed out connecting to clamd")), timeoutMs)
    socket.once("connect", onConnect)
    socket.once("error", onError)
    if (signal?.aborted) return onAbort()
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * Everything clamd sends on one socket until its NUL terminator or the end of
 * the connection. Resolves with the text; rejects only when the connection
 * failed before any reply arrived.
 */
function collectReply(socket) {
  const chunks = []
  let settled = false
  const state = { replied: false }
  const promise = new Promise((resolve, reject) => {
    const finish = () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString("utf8"))
    }
    socket.on("data", (d) => {
      chunks.push(d)
      if (d.includes(0)) {
        state.replied = true
        finish()
      }
    })
    socket.on("end", finish)
    socket.on("close", finish)
    socket.on("error", (e) => {
      if (settled) return
      if (chunks.length > 0) return finish()
      settled = true
      reject(new ScanError("clamd_unavailable", `clamd connection failed: ${e.code || e.message}`))
    })
  })
  promise.catch(() => {})
  return { promise, state }
}

function abortReason(signal) {
  return signal.reason instanceof ScanError ? signal.reason : new ScanError("aborted", "Aborted")
}

/**
 * `promise`, or the signal's reason if it aborts first. A fresh listener for
 * each wait, removed once the wait is over. Promise.race against one long
 * lived "aborted" promise would look simpler, but every race leaves a
 * reaction on it that keeps the value it settled with alive, and here that
 * value is a chunk of the upload: a 300 MB file would stay in memory until
 * the scan ended.
 */
function untilAborted(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal))
    signal.addEventListener("abort", onAbort, { once: true })
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort)
        resolve(v)
      },
      (e) => {
        signal.removeEventListener("abort", onAbort)
        reject(e)
      },
    )
  })
}

/** Until clamd has taken what was written, has hung up, or the signal aborts. */
function writable(socket, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off("drain", done)
      socket.off("close", done)
      socket.off("end", done)
      signal?.removeEventListener("abort", onAbort)
    }
    const done = () => {
      cleanup()
      resolve()
    }
    const onAbort = () => {
      cleanup()
      reject(abortReason(signal))
    }
    if (signal?.aborted) return onAbort()
    socket.once("drain", done)
    socket.once("close", done)
    socket.once("end", done)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

/** One short command (PING, VERSION) and its reply. */
export async function command(opts, name, { timeoutMs = opts.commandTimeoutMs ?? 5000, signal } = {}) {
  const socket = await connect(opts, timeoutMs, signal)
  const timer = setTimeout(() => socket.destroy(), timeoutMs)
  try {
    const reply = collectReply(socket)
    socket.write(`z${name}\0`)
    const text = (await reply.promise).replace(/\0+$/, "").trim()
    if (!text) throw new ScanError("clamd_unavailable", `clamd gave no reply to ${name}`)
    return text
  } finally {
    clearTimeout(timer)
    socket.destroy()
  }
}

export async function ping(opts, options) {
  return (await command(opts, "PING", options)) === "PONG"
}

export async function version(opts, options) {
  return parseVersion(await command(opts, "VERSION", options))
}

/**
 * Streams `source` (any async iterable of Buffers or Uint8Arrays, such as an
 * HTTP request) to clamd with INSTREAM.
 *
 * Counts and hashes every byte on the way. Throws a ScanError "too_large"
 * as soon as the count passes `maxBytes`, without reading the rest. `signal`
 * aborts everything, including a wait on a slow client.
 *
 * Returns { status: "clean" | "infected" | "error", threat?, code?, message?, bytes, sha256 }.
 */
export async function instream(opts, source, { maxBytes, signal } = {}) {
  const socket = await connect(opts, opts.commandTimeoutMs ?? 5000, signal)
  const hash = createHash("sha256")
  let bytes = 0
  const reply = collectReply(socket)
  const iterator = source[Symbol.asyncIterator]()

  try {
    socket.write("zINSTREAM\0")
    for (;;) {
      if (reply.state.replied) break
      const next = await untilAborted(iterator.next(), signal)
      if (next.done) break
      const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value)
      if (chunk.length === 0) continue
      bytes += chunk.length
      if (maxBytes !== undefined && bytes > maxBytes) {
        throw new ScanError("too_large", `The file is larger than ${maxBytes} bytes`)
      }
      hash.update(chunk)
      for (let off = 0; off < chunk.length; off += FRAME_BYTES) {
        const part = chunk.subarray(off, off + FRAME_BYTES)
        const header = Buffer.allocUnsafe(4)
        header.writeUInt32BE(part.length, 0)
        socket.write(header)
        if (!socket.write(part)) {
          /* Wait for clamd to take it, or for it to answer early and hang up. */
          await writable(socket, signal)
          if (reply.state.replied || socket.destroyed) break
        }
      }
    }
    if (!reply.state.replied && !socket.destroyed) socket.write(Buffer.alloc(4))
    const text = await untilAborted(reply.promise, signal)
    const verdict = parseScanReply(text)
    return { ...verdict, bytes, sha256: hash.digest("hex") }
  } finally {
    iterator.return?.().catch?.(() => {})
    socket.destroy()
  }
}
