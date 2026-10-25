/**
 * THE NETWORK, FOR THE JOURNEY: every fetch the code under test makes lands
 * here. The Supabase host is answered by the in-memory PostgREST and a small
 * GoTrue (users by access token), Mailgun's host is a mailbox that keeps
 * every message, and any other host is refused and written down, so a real
 * address reached by a test fails it. Node's http and https are refused too
 * (the Stripe SDK's own transport): every Stripe call the flow makes must be
 * one the fake world answers.
 */
import http from "node:http"
import https from "node:https"
import type { MemoryDb } from "./postgrest"

export const SUPABASE_HOST = "journey.supabase.co"
export const MAILGUN_HOST = "mailgun.test"

export interface SentMail {
  to: string[]
  from: string
  subject: string
  html: string
  text: string
  replyTo: string | null
  tags: string[]
  headers: Record<string, string>
  at: number
}

export interface AuthUser {
  id: string
  email: string
  email_confirmed_at: string | null
  user_metadata: Record<string, unknown>
  app_metadata: Record<string, unknown>
  token: string
}

export class Net {
  mails: SentMail[] = []
  refused: string[] = []
  users = new Map<string, AuthUser>()
  /** Responses a suite wants a host to give (a carrier, a partner); none by default. */
  routes: { match: (url: URL) => boolean; answer: (req: Request) => Promise<Response> | Response }[] = []
  private original = globalThis.fetch

  constructor(private db: MemoryDb) {}

  install() {
    const self = this
    globalThis.fetch = async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const req = input instanceof Request ? input : new Request(typeof input === "string" ? input : input.href, init)
      return self.answer(req)
    } as typeof globalThis.fetch
    const refuse = (mod: typeof http | typeof https, name: string) => {
      const block = (...args: any[]) => {
        const a = args[0]
        const host = typeof a === "string" ? new URL(a).host : a instanceof URL ? a.host : a?.hostname ?? a?.host ?? "?"
        self.refused.push(`${name}://${host}`)
        throw new Error(`network refused in the journey: ${name}://${host}`)
      }
      ;(mod as any).request = block
      ;(mod as any).get = block
    }
    refuse(http, "http")
    refuse(https, "https")
  }

  uninstall() {
    globalThis.fetch = this.original
  }

  async answer(req: Request): Promise<Response> {
    const url = new URL(req.url)
    for (const r of this.routes) if (r.match(url)) return r.answer(req)
    if (url.host === SUPABASE_HOST) {
      if (url.pathname.startsWith("/rest/v1")) return this.db.handle(req)
      if (url.pathname.startsWith("/auth/v1")) return this.auth(req, url)
      if (url.pathname.startsWith("/storage/v1")) return (await this.storage(req, url)) ?? new Response(JSON.stringify({ message: "ok" }), { status: 200, headers: { "content-type": "application/json" } })
      if (url.pathname.startsWith("/functions/v1")) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    }
    if (url.host === MAILGUN_HOST) return this.mailgun(req, url)
    this.refused.push(`${req.method} ${url.origin}${url.pathname}`)
    throw new TypeError(`fetch failed (the journey refuses ${url.host})`)
  }

  /**
   * Storage that keeps what is put in it, for the buckets in STORED_BUCKETS
   * (round 13: buyers' photos, lib/cart-uploads): an upload, a signed upload
   * URL and the PUT through it, a copy, a folder's list with each file's
   * size, a signed URL that answers Range reads, and removal. Every other
   * bucket answers "ok" as before.
   */
  objects = new Map<string, { bytes: Uint8Array; type: string }>()
  private async storage(req: Request, url: URL): Promise<Response | null> {
    const STORED_BUCKETS = ["cart-uploads"]
    const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } })
    const p = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ""))
    const of = (prefix: string) => {
      const rest = p.slice(prefix.length)
      const bucket = rest.split("/")[0]
      return STORED_BUCKETS.includes(bucket) ? { bucket, path: rest.slice(bucket.length + 1) } : null
    }
    if (p.startsWith("/object/upload/sign/")) {
      const at = of("/object/upload/sign/")
      if (!at) return null
      if (req.method === "POST") return json({ url: `/object/upload/sign/${at.bucket}/${at.path}?token=up.${Math.random().toString(36).slice(2)}` })
      if (req.method === "PUT") {
        if (!url.searchParams.get("token")) return json({ message: "no token" }, 400)
        const type = req.headers.get("content-type") ?? ""
        let bytes: Uint8Array
        let mime = "application/octet-stream"
        if (type.startsWith("multipart/form-data")) {
          const form = await req.formData()
          const file = [...form.values()].find((v) => typeof v !== "string") as Blob | undefined
          bytes = new Uint8Array(await (file ?? new Blob()).arrayBuffer())
          mime = file?.type || mime
        } else {
          bytes = new Uint8Array(await req.arrayBuffer())
          mime = type || mime
        }
        this.objects.set(`${at.bucket}/${at.path}`, { bytes, type: mime })
        return json({ Key: `${at.bucket}/${at.path}` })
      }
    }
    if (p.startsWith("/object/list/") && req.method === "POST") {
      const at = of("/object/list/")
      if (!at) return null
      const body = (await req.json().catch(() => ({}))) as { prefix?: string; search?: string }
      const prefix = (body.prefix ?? "").replace(/\/$/, "")
      const out = [...this.objects.entries()]
        .filter(([k]) => k.startsWith(`${at.bucket}/${prefix ? `${prefix}/` : ""}`))
        .map(([k, v]) => ({ name: k.slice(at.bucket.length + 1 + (prefix ? prefix.length + 1 : 0)), metadata: { size: v.bytes.length, mimetype: v.type } }))
        .filter((f) => !f.name.includes("/") && (!body.search || f.name.includes(body.search)))
      return json(out)
    }
    if (p.startsWith("/object/sign/")) {
      const at = of("/object/sign/")
      if (!at) return null
      if (req.method === "POST") return this.objects.has(`${at.bucket}/${at.path}`) ? json({ signedURL: `/object/sign/${at.bucket}/${at.path}?token=read` }) : json({ statusCode: "404", error: "not_found", message: "Object not found" }, 400)
      if (req.method === "GET") {
        const o = this.objects.get(`${at.bucket}/${at.path}`)
        if (!o) return json({ message: "Object not found" }, 404)
        const range = /bytes=(\d+)-(\d+)/.exec(req.headers.get("range") ?? "")
        if (!range) return new Response(o.bytes, { status: 200, headers: { "content-type": o.type } })
        const a = Number(range[1])
        const b = Math.min(o.bytes.length - 1, Number(range[2]))
        return new Response(o.bytes.slice(a, b + 1), { status: 206, headers: { "content-type": o.type, "content-range": `bytes ${a}-${b}/${o.bytes.length}` } })
      }
    }
    if (p === "/object/copy" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { bucketId?: string; sourceKey?: string; destinationKey?: string }
      if (!body.bucketId || !STORED_BUCKETS.includes(body.bucketId)) return null
      const from = this.objects.get(`${body.bucketId}/${body.sourceKey}`)
      if (!from) return json({ statusCode: "404", error: "not_found", message: "Object not found" }, 400)
      this.objects.set(`${body.bucketId}/${body.destinationKey}`, { bytes: from.bytes, type: from.type })
      return json({ Key: `${body.bucketId}/${body.destinationKey}` })
    }
    if ((req.method === "POST" || req.method === "PUT") && p.startsWith("/object/") && !/^\/object\/(list|sign|upload|copy|move|info|public|authenticated)\//.test(p)) {
      const at = of("/object/")
      if (!at) return null
      const type = req.headers.get("content-type") ?? ""
      let bytes: Uint8Array
      let mime = "application/octet-stream"
      if (type.startsWith("multipart/form-data")) {
        const form = await req.formData()
        const file = [...form.values()].find((v) => typeof v !== "string") as Blob | undefined
        bytes = new Uint8Array(await (file ?? new Blob()).arrayBuffer())
        mime = file?.type || mime
      } else {
        bytes = new Uint8Array(await req.arrayBuffer())
        mime = type || mime
      }
      if (req.method === "POST" && req.headers.get("x-upsert") !== "true" && this.objects.has(`${at.bucket}/${at.path}`)) return json({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }, 400)
      this.objects.set(`${at.bucket}/${at.path}`, { bytes, type: mime })
      return json({ Key: `${at.bucket}/${at.path}` })
    }
    if (req.method === "DELETE" && p.startsWith("/object/")) {
      const bucket = p.slice("/object/".length).split("/")[0]
      if (!STORED_BUCKETS.includes(bucket)) return null
      const body = (await req.json().catch(() => ({}))) as { prefixes?: string[] }
      for (const k of body.prefixes ?? []) this.objects.delete(`${bucket}/${k}`)
      return json([])
    }
    return null
  }

  private async auth(req: Request, url: URL): Promise<Response> {
    const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } })
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
    const userOf = (u: AuthUser) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.email_confirmed_at, user_metadata: u.user_metadata, app_metadata: u.app_metadata, created_at: new Date(0).toISOString() })
    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      const u = [...this.users.values()].find((x) => x.token === token)
      return u ? json(userOf(u)) : json({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }, 401)
    }
    const admin = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname)
    if (admin && req.method === "GET") {
      const u = this.users.get(admin[1])
      return u ? json(userOf(u)) : json({ msg: "User not found" }, 404)
    }
    if (url.pathname === "/auth/v1/admin/users" && req.method === "GET") return json({ users: [...this.users.values()].map(userOf), aud: "authenticated" })
    return json({ msg: `auth ${url.pathname} not in the journey` }, 404)
  }

  private async mailgun(req: Request, url: URL): Promise<Response> {
    /* A suppression lookup (bounces, complaints, unsubscribes) for an address on none of them is Mailgun's 404. */
    if (/\/(bounces|complaints|unsubscribes)\//.test(url.pathname)) return new Response(JSON.stringify({ message: "Address not found in bounces table" }), { status: 404, headers: { "content-type": "application/json" } })
    if (!/\/messages$/.test(url.pathname)) return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } })
    const form = await req.formData()
    const all = (k: string) => form.getAll(k).map(String)
    const headers: Record<string, string> = {}
    for (const [k, v] of form.entries()) if (k.startsWith("h:")) headers[k.slice(2).toLowerCase()] = String(v)
    this.mails.push({
      to: all("to").flatMap((t) => t.split(",")).map((t) => t.trim()),
      from: String(form.get("from") ?? ""),
      subject: String(form.get("subject") ?? ""),
      html: String(form.get("html") ?? ""),
      text: String(form.get("text") ?? ""),
      replyTo: headers["reply-to"] ?? null,
      tags: all("o:tag"),
      headers,
      at: Date.now(),
    })
    return new Response(JSON.stringify({ id: `<${Date.now()}.${this.mails.length}@mailgun.test>`, message: "Queued. Thank you." }), { status: 200, headers: { "content-type": "application/json" } })
  }

  /** Mail to one address, optionally whose subject matches. */
  to(email: string, subject?: RegExp): SentMail[] {
    return this.mails.filter((m) => m.to.some((t) => t.toLowerCase().includes(email.toLowerCase())) && (!subject || subject.test(m.subject)))
  }
}
