import "server-only"

/**
 * ===========================================================================
 *  UNPACKING A LITTLE OF AN ARCHIVE, UNDER A HARD CEILING
 * ===========================================================================
 * A ZIP's table of contents says how large each file unpacks to, and every
 * check in zip.ts believed it. An archive can lie: claim a kilobyte and hold
 * an entry that unpacks to forty gigabytes. Nothing in the directory shows
 * that, so the only way to know is to unpack a little and watch.
 *
 * This is the one place that unpacks anything, and it is built so it can
 * never cost more than it is given:
 *
 *   - it is handed a slice of packed bytes already read (128 KB at most), so
 *     it never reads and never holds a whole entry;
 *   - it COUNTS output and throws every byte away, so memory stays flat
 *     whatever comes out;
 *   - it stops at `maxOut` and at `deadline`, whichever comes first, and
 *     says how far it got.
 *
 * A truncated stream is the normal ending here (a prefix of the packed data
 * is all it gets), so an error is not a failure: what was produced before it
 * is the answer.
 */
import { createInflateRaw } from "node:zlib"

import type { BoundedInflate } from "./zip"

/**
 * Feeds `compressed` to a raw DEFLATE stream and returns how many bytes came
 * out, stopping at `maxOut` bytes or at `deadline`. Never throws.
 */
export const nodeInflateRaw: BoundedInflate = (compressed, maxOut, deadline) =>
  new Promise((resolve) => {
    if (maxOut <= 0 || compressed.length === 0) {
      resolve({ out: 0, ended: false, cappedAt: maxOut <= 0 })
      return
    }
    let out = 0
    let done = false
    let ended = false
    let cappedAt = false
    const stream = createInflateRaw()
    const timer = setTimeout(() => finish(), Math.max(50, deadline - Date.now()))

    function finish() {
      if (done) return
      done = true
      clearTimeout(timer)
      stream.removeAllListeners()
      stream.destroy()
      resolve({ out, ended, cappedAt })
    }

    stream.on("data", (chunk: Buffer) => {
      out += chunk.length
      if (out >= maxOut) {
        out = maxOut
        cappedAt = true
        finish()
      }
    })
    stream.on("end", () => {
      ended = true
      finish()
    })
    /* A prefix of a stream always ends this way; what came out still counts. */
    stream.on("error", () => finish())
    stream.end(Buffer.from(compressed.buffer, compressed.byteOffset, compressed.byteLength))
  })
