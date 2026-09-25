/**
 * Storelib's own newsletter, for one signed in person.
 *
 * The list is `storelib_newsletter` (supabase/sql/RUN_STORELIB_NEWSLETTER.sql):
 * one row per address, `unsubscribed_at` set when somebody leaves. The footer
 * form adds people to it; the switch in Settings adds and removes the
 * account's own address. Leaving keeps the row with a date, so a later send
 * can tell "left" from "never joined".
 *
 * Takes the service role client as a parameter: the table is closed to
 * browsers, and the caller has already decided whose address this is.
 */

type Admin = {
  from: (table: string) => any
}

export const SETTINGS_CONSENT_TEXT = "Turned on in Settings: weekly assets and new templates from Storelib, by email."

/** On the list and not unsubscribed. Unknown (no address, a read that failed) is off. */
export async function readNewsletter(admin: Admin, email: string | null | undefined): Promise<boolean> {
  const address = (email ?? "").trim().toLowerCase()
  if (!address) return false
  try {
    const { data } = await admin.from("storelib_newsletter").select("unsubscribed_at").eq("email", address).maybeSingle()
    return Boolean(data) && !data.unsubscribed_at
  } catch {
    return false
  }
}

/** Join or leave. True when the list now says what was asked. */
export async function writeNewsletter(admin: Admin, email: string, on: boolean): Promise<boolean> {
  const address = email.trim().toLowerCase()
  if (!address) return false
  try {
    if (!on) {
      const { error } = await admin
        .from("storelib_newsletter")
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq("email", address)
      return !error
    }
    const { data: existing } = await admin.from("storelib_newsletter").select("email").eq("email", address).maybeSingle()
    if (existing) {
      const { error } = await admin.from("storelib_newsletter").update({ unsubscribed_at: null }).eq("email", address)
      return !error
    }
    const { error } = await admin
      .from("storelib_newsletter")
      .insert({ email: address, source: "settings", consent_text: SETTINGS_CONSENT_TEXT })
    return !error || error.code === "23505"
  } catch {
    return false
  }
}
