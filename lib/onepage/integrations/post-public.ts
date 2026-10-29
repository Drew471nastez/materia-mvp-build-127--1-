import "server-only"

/**
 * A POST to an address the creator typed, on its own so that what only
 * needs this (lib/analytics/destinations/queue-server) does not bring in
 * the rest of lib/onepage/integrations/deliver-server and everything it
 * loads. Reached from every route that records an order, that graph
 * pushed `next build` past Vercel's 8 GB.
 */

import https from "node:https"
import type net from "node:net"
import { publicLookup, publicUrlProblem } from "@/lib/api/public-fetch"

export type Answer = { status: number; body: unknown }

/**
 * A POST to an address the creator typed: public hosts only, checked when
 * the socket connects, no redirect followed (an Apps Script's 302 is its
 * answer), at most 64 KB read back.
 */
export function postPublic(url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<Answer> {
  const problem = publicUrlProblem(url)
  if (problem || !url.startsWith("https://")) return Promise.resolve({ status: 0, body: `refused: ${problem ?? "not https"}` })
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: "POST", lookup: publicLookup as unknown as net.LookupFunction, headers: { ...headers, "content-length": String(Buffer.byteLength(body)) } },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (c: Buffer) => {
          size += c.length
          if (size <= 64 * 1024) chunks.push(c)
        })
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8").slice(0, 2000) }))
        res.on("error", () => resolve({ status: 0, body: null }))
      },
    )
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timed out")))
    req.on("error", () => resolve({ status: 0, body: null }))
    req.end(body)
  })
}
