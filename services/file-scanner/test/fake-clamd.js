import net from "node:net"

/**
 * A tiny clamd for the tests: PING, VERSION and INSTREAM, framed exactly as
 * the real one reads them. It flags any stream containing the EICAR test
 * string, answers "size limit exceeded" past `streamMaxLength` and hangs up
 * (as clamd does), and can be told to stall or to answer with an error.
 * With `discard` it only counts what arrives (for the memory test).
 *
 * The EICAR string is assembled from pieces so this file is not itself
 * flagged by a virus scanner on a developer's machine.
 */
export const EICAR = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join("")

export function startFakeClamd({ streamMaxLength = 10 * 1024 * 1024, stall = false, delayMs = 0, errorReply = null, discard = false, version = "ClamAV 1.4.6/28129/Sun Sep 20 06:26:26 2026" } = {}) {
  const stats = { connections: 0, streams: [], maxFrame: 0 }
  const sockets = new Set()
  const server = net.createServer((socket) => {
    stats.connections++
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    socket.on("error", () => {})
    let buf = Buffer.alloc(0)
    let mode = "command"
    let received = []
    let total = 0
    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d])
      if (mode === "command") {
        const nul = buf.indexOf(0)
        if (nul === -1) return
        const cmd = buf.subarray(0, nul).toString()
        buf = buf.subarray(nul + 1)
        if (cmd === "zPING") return void socket.end("PONG\0")
        if (cmd === "zVERSION") return void socket.end(version + "\0")
        if (cmd !== "zINSTREAM") return void socket.end("UNKNOWN COMMAND\0")
        mode = "stream"
      }
      while (mode === "stream" && buf.length >= 4) {
        const len = buf.readUInt32BE(0)
        if (len === 0) {
          mode = "done"
          const data = Buffer.concat(received)
          stats.streams.push({ bytes: discard ? total : data.length })
          if (stall) return
          const answer = errorReply
            ? `${errorReply} ERROR\0`
            : data.includes(Buffer.from(EICAR))
              ? "stream: Eicar-Test-Signature FOUND\0"
              : "stream: OK\0"
          setTimeout(() => socket.end(answer), delayMs)
          return
        }
        if (buf.length < 4 + len) return
        stats.maxFrame = Math.max(stats.maxFrame, len)
        if (!discard) received.push(Buffer.from(buf.subarray(4, 4 + len)))
        total += len
        buf = buf.subarray(4 + len)
        if (total > streamMaxLength) {
          mode = "done"
          socket.end("INSTREAM size limit exceeded. ERROR\0")
          return
        }
      }
    })
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        stats,
        close: () =>
          new Promise((r) => {
            for (const s of sockets) s.destroy()
            server.close(() => r())
          }),
      })
    })
  })
}
