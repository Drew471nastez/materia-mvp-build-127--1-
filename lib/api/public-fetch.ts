/**
 * ===========================================================================
 *  FETCHING AN ADDRESS SOMEBODY TYPED
 * ===========================================================================
 * The theme export downloads every picture and video a creator's pages
 * point at, and a creator can point a setting at any address at all. A
 * plain `fetch(url)` on the server asks `http://169.254.169.254/…`,
 * `http://localhost:…` or any machine on the network the function runs in,
 * follows a redirect from a public address to a private one, and the answer
 * came back to the creator inside their download.
 *
 * This asks public addresses only:
 *
 *   - http or https, on the standard ports, with no credentials in the URL;
 *   - the address a name resolves to is checked AT THE MOMENT OF CONNECTING,
 *     through the socket's own lookup, so a name that answers public to a
 *     check and private to the request a moment later is still refused;
 *   - every redirect is checked the same way, and there are at most three;
 *   - the body stops at a size limit whether or not the server said how big
 *     it was, so a response with no length cannot fill the function's memory.
 *
 * It answers with an ordinary Response, so a caller reads it like fetch's.
 */
import "server-only"

import dns, { type LookupAddress, type LookupOptions } from "node:dns"
import http from "node:http"
import https from "node:https"
import net from "node:net"

/* ── which addresses are private ─────────────────────────────────────────── */

function privateV4(address: string): boolean {
  const [a, b, c] = address.split(".").map(Number)
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier NAT
    (a === 169 && b === 254) || // link local, and the cloud metadata address
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast and reserved
  )
}

/** Eight 16-bit groups, or null when it is not an IPv6 address. */
function hextets(address: string): number[] | null {
  let s = address.toLowerCase().split("%")[0]
  /* A dotted quad at the end, as in ::ffff:127.0.0.1, is two groups. */
  const quad = s.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (quad) {
    const [p, q, r, t] = quad.slice(1).map(Number)
    s = s.slice(0, quad.index) + `${((p << 8) | q).toString(16)}:${((r << 8) | t).toString(16)}`
  }
  const halves = s.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  const groups = [...head, ...Array(Math.max(0, fill)).fill("0"), ...tail]
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.map((g) => parseInt(g, 16))
}

function privateV6(address: string): boolean {
  const h = hextets(address)
  if (!h) return true
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  const zeros = (from: number, to: number) => h.slice(from, to).every((g) => g === 0)
  if (zeros(0, 8)) return true // ::
  if (zeros(0, 7) && h[7] === 1) return true // ::1
  if (zeros(0, 5) && h[5] === 0xffff) return privateV4(v4(h[6], h[7])) // IPv4 mapped
  if (zeros(0, 6)) return privateV4(v4(h[6], h[7])) // IPv4 compatible
  if (h[0] === 0x64 && h[1] === 0xff9b && zeros(2, 6)) return privateV4(v4(h[6], h[7])) // NAT64
  if (h[0] === 0x2002) return privateV4(v4(h[1], h[2])) // 6to4
  if ((h[0] & 0xfe00) === 0xfc00) return true // unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true // link local
  if ((h[0] & 0xff00) === 0xff00) return true // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true // documentation
  return false
}

/** An address a server must never be sent to by somebody else's URL. Anything that is not an address counts. */
export function isPrivateAddress(address: string): boolean {
  const kind = net.isIP(address)
  if (kind === 4) return privateV4(address)
  if (kind === 6) return privateV6(address)
  return true
}

/* ── which URLs may be asked ─────────────────────────────────────────────── */

const LOCAL_NAME = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home\.arpa)$/i

/** Why this URL may not be fetched, or null when its shape is fine. The address is checked again on connecting. */
export function publicUrlProblem(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "not a URL"
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "not http or https"
  if (url.username || url.password) return "has credentials in it"
  if (url.port && url.port !== "80" && url.port !== "443") return "not on a standard port"
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1")
  if (!host) return "has no host"
  if (net.isIP(host)) return isPrivateAddress(host) ? "a private address" : null
  if (LOCAL_NAME.test(host) || !host.includes(".")) return "a local name"
  return null
}

/**
 * The socket's own lookup, refusing a name that resolves to any private
 * address. Every address is checked, not only the first, because the socket
 * may try the others.
 */
export function publicLookup(hostname: string, options: LookupOptions, callback: (...args: unknown[]) => void): void {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error)
    const list = (addresses as unknown as LookupAddress[]).filter(Boolean)
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} does not resolve to a public address`), { code: "EPRIVATE" }))
    }
    if (options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

export interface PublicFetchOptions {
  /** The most bytes to read. More, declared or not, is an error. */
  maxBytes: number
  /** For the whole of one request, connecting included. */
  timeoutMs?: number
  maxRedirects?: number
  /**
   * Origins of this platform's own services, asked even when they are not
   * public: the storage the uploads live in is `localhost` in development.
   */
  trustOrigins?: readonly string[]
}

type Answer = { redirect: string } | { response: Response }

function once(url: URL, opts: PublicFetchOptions, trusted: boolean): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http
    const request = client.get(
      url,
      {
        ...(trusted ? {} : { lookup: publicLookup as unknown as net.LookupFunction }),
        headers: { "user-agent": "Storelib/1.0 (+https://storelib.com)", accept: "*/*" },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location
        if (status >= 300 && status < 400 && location) {
          res.resume()
          resolve({ redirect: String(location) })
          return
        }
        const declared = Number(res.headers["content-length"] ?? 0)
        if (declared > opts.maxBytes) {
          res.destroy()
          reject(new Error("larger than allowed"))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (chunk: Buffer) => {
          size += chunk.length
          if (size > opts.maxBytes) {
            res.destroy(new Error("larger than allowed"))
            return
          }
          chunks.push(chunk)
        })
        res.on("error", reject)
        res.on("end", () => {
          const headers = new Headers()
          for (const [name, value] of Object.entries(res.headers)) {
            if (typeof value === "string") headers.set(name, value)
            else if (Array.isArray(value)) headers.set(name, value.join(", "))
          }
          const empty = status === 204 || status === 304 || status < 200 || status > 599
          resolve({ response: new Response(empty ? null : Buffer.concat(chunks), { status: empty ? 204 : status, headers }) })
        })
      },
    )
    request.setTimeout(opts.timeoutMs ?? 20_000, () => request.destroy(new Error("timed out")))
    request.on("error", reject)
  })
}

/**
 * GET a URL somebody else supplied. Rejects, rather than answering, when the
 * URL or any redirect is not public, when it is too big, or when it takes too
 * long; a non-2xx answer is returned for the caller to read as with fetch.
 */
export async function fetchPublic(raw: string, opts: PublicFetchOptions): Promise<Response> {
  let current = raw
  for (let hop = 0; ; hop++) {
    let origin = ""
    try {
      origin = new URL(current).origin
    } catch {
      /* publicUrlProblem says why */
    }
    const trusted = !!origin && (opts.trustOrigins ?? []).includes(origin)
    const problem = trusted ? null : publicUrlProblem(current)
    if (problem) throw new Error(`Refused: ${problem}`)
    const answer = await once(new URL(current), opts, trusted)
    if ("response" in answer) return answer.response
    if (hop >= (opts.maxRedirects ?? 3)) throw new Error("Too many redirects")
    current = new URL(answer.redirect, current).toString()
  }
}

/**
 * WHERE ONE ADDRESS SENDS YOU, without going there. For a short link
 * (lib/communities/server/safety.ts): the same public-only checks as
 * fetchPublic, one request, a tiny body limit, and the Location header made
 * absolute. Null when the answer is not a redirect; rejects when the address
 * is not public or does not answer in time.
 */
export async function redirectTarget(raw: string, opts: { timeoutMs?: number } = {}): Promise<string | null> {
  const problem = publicUrlProblem(raw)
  if (problem) throw new Error(`Refused: ${problem}`)
  const answer = await once(new URL(raw), { maxBytes: 64 * 1024, timeoutMs: opts.timeoutMs ?? 3000 }, false)
  return "redirect" in answer ? new URL(answer.redirect, raw).toString() : null
}
