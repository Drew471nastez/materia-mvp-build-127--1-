import { platformOrigin } from "@/lib/onepage/return-address"
export type NativeAction =
  | { type: "url"; url: string }
  | { type: "whatsapp"; phone: string; message?: string }
  | { type: "email"; email: string; subject?: string; message?: string }
  | { type: "phone"; phone: string }
  | { type: "product"; product_id: string; slug?: string }
  | { type: "form"; form_id: string }
  | { type: "appointment"; url: string }
export const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
export function internationalPhone(value: unknown): string | null {
  if (typeof value !== "string") return null
  const digits = value
    .trim()
    .replace(/^00/, "+")
    .replace(/[\s()+.-]/g, "")
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}
export function webUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\u0000-\u001f\\]/.test(value)
  )
    return null
  if (value.startsWith("/") && !value.startsWith("//")) return value
  try {
    const url = new URL(value)
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
export function formPath(id: string): string {
  return `/request/forms/${encodeURIComponent(id)}`
}
export function normaliseAction(raw: unknown): NativeAction | null {
  if (!raw || typeof raw !== "object") return null
  const a = raw as Record<string, unknown>
  const str = (key: string, max = 2048) =>
    typeof a[key] === "string" ? (a[key] as string).trim().slice(0, max) : ""
  let out: NativeAction
  switch (a.type) {
    case "url":
    case "appointment":
      out = { type: a.type, url: str("url") }
      break
    case "whatsapp":
      out = {
        type: "whatsapp",
        phone: str("phone", 40),
        message: str("message", 4000),
      }
      break
    case "phone":
      out = { type: "phone", phone: str("phone", 40) }
      break
    case "email":
      out = {
        type: "email",
        email: str("email", 254),
        subject: str("subject", 300).replace(/[\r\n]/g, " "),
        message: str("message", 4000),
      }
      break
    case "product":
      out = {
        type: "product",
        product_id: str("product_id", 36),
        slug: str("slug", 200),
      }
      break
    case "form":
      out = { type: "form", form_id: str("form_id", 36) }
      break
    default:
      return null
  }
  return actionHref(out) ? out : null
}
export function actionHref(
  action: NativeAction | null | undefined,
): string | null {
  if (!action || typeof action !== "object") return null
  switch (action.type) {
    case "url":
    case "appointment":
      return webUrl(action.url)
    case "whatsapp": {
      const phone = internationalPhone(action.phone)
      if (!phone) return null
      const q = new URLSearchParams()
      if (typeof action.message === "string" && action.message)
        q.set("text", action.message.slice(0, 4000))
      return `https://wa.me/${phone}${q.size ? "?" + q.toString() : ""}`
    }
    case "phone": {
      const phone = internationalPhone(action.phone)
      return phone ? `tel:+${phone}` : null
    }
    case "email": {
      if (
        !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(action.email || "") ||
        /[\r\n]/.test(action.email)
      )
        return null
      const q = new URLSearchParams()
      if (typeof action.subject === "string" && action.subject)
        q.set("subject", action.subject.slice(0, 300).replace(/[\r\n]/g, " "))
      if (typeof action.message === "string" && action.message)
        q.set("body", action.message.slice(0, 4000))
      return `mailto:${encodeURIComponent(action.email).replace(/%40/g, "@")}${q.size ? "?" + q.toString() : ""}`
    }
    case "product":
      return UUID.test(action.product_id || "")
        ? `${platformOrigin()}/checkout?productId=${encodeURIComponent(action.product_id)}`
        : null
    case "form":
      return UUID.test(action.form_id || "")
        ? `${platformOrigin()}${formPath(action.form_id)}`
        : null
    default:
      return null
  }
}
export function actionLabel(action: NativeAction | undefined) {
  return action?.type === "whatsapp"
    ? "Continue on WhatsApp"
    : action?.type === "appointment"
      ? "Book an appointment"
      : action?.type === "product"
        ? "View product"
        : action?.type === "form"
          ? "Open form"
          : "Continue"
}
