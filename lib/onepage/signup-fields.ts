// OnePage: the email signup's extra fields, read once for the page and the server (round AR)
// Location: lib/onepage/signup-fields.ts
//
// "Join my newsletter" (type email_capture) asks for an email, and, when the
// creator switches them on, a first name and a phone number. The phone is
// optional unless the creator makes it required; when given it has to be a
// real number (7 to 15 digits, an optional + in front, the way phones and
// SMS tools store one), and it is kept on the lead and on the subscriber.
//
// The joiner's file: an upload of the creator's own (the block's file, as
// before), or one of the creator's own digital products, picked in the
// editor; the server reads which from the published block and gives that
// product's files through a download link (app/api/onepage/leads).

export interface SignupFieldsData {
  ask_name?: boolean | null
  ask_phone?: boolean | null
  phone_required?: boolean | null
  enable_digital_product?: boolean | null
  digital_product_id?: string | null
  digital_product_file_url?: string | null
}

/** A phone number as kept: "+" and digits, or null when it is not one. Spaces, dashes, dots and brackets are dropped. */
export function signupPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const text = raw.trim()
  if (!text || text.length > 32) return null
  if (!/^\+?[\d\s().-]+$/.test(text)) return null
  const plus = text.startsWith("+")
  const digits = text.replace(/\D/g, "")
  if (digits.length < 7 || digits.length > 15) return null
  /* A number never starts with 00 once it has a +; "00" in front is the old way of writing "+". */
  if (!plus && digits.startsWith("00")) return digits.length - 2 >= 7 ? `+${digits.slice(2)}` : null
  return plus ? `+${digits}` : digits
}

export type PhoneCheck = { ok: true; phone: string | null } | { ok: false; error: "phone_required" | "phone_invalid" }

/**
 * THE PHONE A SIGNUP CARRIES, BY THE BLOCK'S OWN RULE. A block that does not
 * ask keeps none, whatever was sent. One that asks keeps a valid number,
 * refuses an invalid one, and refuses none only when it is required.
 */
export function checkSignupPhone(data: SignupFieldsData | null | undefined, raw: unknown): PhoneCheck {
  if (data?.ask_phone !== true) return { ok: true, phone: null }
  const typed = typeof raw === "string" ? raw.trim() : ""
  if (!typed) return data.phone_required === true ? { ok: false, error: "phone_required" } : { ok: true, phone: null }
  const phone = signupPhone(typed)
  return phone ? { ok: true, phone } : { ok: false, error: "phone_invalid" }
}

/** The form's fields, in the order they are drawn above the email: name, then phone. */
export function signupExtraFields(data: SignupFieldsData | null | undefined): ("name" | "phone")[] {
  const out: ("name" | "phone")[] = []
  if (data?.ask_name === true) out.push("name")
  if (data?.ask_phone === true) out.push("phone")
  return out
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The creator's product the block gives, when the file is on and one is picked. Its own upload otherwise. */
export function signupProductId(data: SignupFieldsData | null | undefined): string | null {
  if (data?.enable_digital_product !== true) return null
  const id = typeof data.digital_product_id === "string" ? data.digital_product_id.trim() : ""
  return UUID.test(id) ? id : null
}

/** Product kinds that are delivered as files: every kind Storelib sells but the ones that ship or bill monthly. */
export function givableProductType(type: string | null | undefined): boolean {
  return type !== "physical" && type !== "membership"
}
