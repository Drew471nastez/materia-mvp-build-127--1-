/**
 * ===========================================================================
 *  ONE LOG LINE PER THING THAT HAPPENED, AS JSON
 * ===========================================================================
 * Every step of the engine logs through here, so an event can be followed
 * through its jobs and deliveries by its correlation id in the Vercel log.
 *
 * What never reaches the log: an address in full (masked to "ja***@x.com"),
 * any field whose name says it is a secret (token, key, secret, password,
 * authorization, signature, iban, account number, routing), and anything
 * longer than a short value. Values are strings, numbers and booleans only;
 * an object is dropped rather than printed, because a payload is where a
 * secret would hide.
 */
import { maskEmail } from "@/lib/privacy/mask-email"

export type LogLevel = "debug" | "info" | "warn" | "error"

const SECRET_NAME = /token|secret|password|passwd|authorization|signature|api[_-]?key|^key$|iban|account[_-]?number|routing|card|cvc|bank/i
const EMAIL_LIKE = /[^\s@<>"',;]+@[^\s@<>"',;]+/g

function clean(name: string, value: unknown): string | number | boolean | null | undefined {
  if (value === null || value === undefined) return value as null | undefined
  if (SECRET_NAME.test(name)) return "[redacted]"
  if (typeof value === "number" || typeof value === "boolean") return value
  if (typeof value !== "string") return undefined
  const masked = /email|recipient|to$/i.test(name) ? maskEmail(value) : value.replace(EMAIL_LIKE, (m) => maskEmail(m))
  return masked.length > 300 ? `${masked.slice(0, 300)}...` : masked
}

export function notifyLog(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  const line: Record<string, unknown> = { at: new Date().toISOString(), level, area: "notify", msg: msg.replace(EMAIL_LIKE, (m) => maskEmail(m)) }
  for (const [name, value] of Object.entries(fields)) {
    const v = clean(name, value)
    if (v !== undefined) line[name] = v
  }
  let text: string
  try {
    text = JSON.stringify(line)
  } catch {
    text = JSON.stringify({ level, area: "notify", msg: "unloggable line" })
  }
  if (level === "error") {
    console.error(text)
    /* Counted and told once, like every other error (lib/observability/report). The line is already masked. */
    void import("@/lib/observability/report").then(({ reportError }) => reportError({ source: "notify", where: `notify: ${String(line.msg).slice(0, 120)}`, error: new Error(String(line.error ?? line.reason ?? line.msg)) })).catch(() => undefined)
  } else if (level === "warn") console.warn(text)
  else if (level === "debug") {
    if (process.env.NOTIFY_DEBUG === "1") console.log(text)
  } else console.log(text)
}

/** Short and without an address, for last_error and failure_reason columns. */
export function reasonText(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "Something went wrong"
  return raw.replace(EMAIL_LIKE, "(address)").replace(/\s+/g, " ").trim().slice(0, 300) || "Something went wrong"
}
