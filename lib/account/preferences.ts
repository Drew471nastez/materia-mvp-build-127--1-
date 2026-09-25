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

/**
 * THE DATABASE MAY NOT HAVE THE PIECE YET. The column and the table these
 * switches write to come from SQL the owner runs by hand
 * (supabase/sql/run-now 01 and 12). Until then every save answered "That did
 * not save", which is what the owner kept seeing. These are the answers
 * PostgREST and Postgres give for a column or a table that is not there: the
 * callers then keep the choice on the account itself (auth user metadata)
 * and read it back from there, so the switch works either way.
 */
export function missingSchema(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code ?? "")
  if (code === "PGRST204" || code === "PGRST205" || code === "42703" || code === "42P01") return true
  return /could not find the .* (column|table)|does not exist|schema cache/i.test(String(error.message ?? ""))
}

export const SETTINGS_CONSENT_TEXT = "Turned on in Settings: weekly assets and new templates from Storelib, by email."

/**
 * On the list and not unsubscribed. Unknown (no address, a read that failed)
 * is off. With no list table yet, `fallback` (the choice kept on the account)
 * is the answer.
 */
export async function readNewsletter(admin: Admin, email: string | null | undefined, fallback = false): Promise<boolean> {
  const address = (email ?? "").trim().toLowerCase()
  if (!address) return false
  try {
    const { data, error } = await admin.from("storelib_newsletter").select("unsubscribed_at").eq("email", address).maybeSingle()
    if (missingSchema(error)) return fallback
    return Boolean(data) && !data.unsubscribed_at
  } catch {
    return false
  }
}

/**
 * Join or leave. True when the list now says what was asked. With no list
 * table yet, `fallback` keeps the choice on the account instead, and its
 * answer is the answer.
 */
export async function writeNewsletter(
  admin: Admin,
  email: string,
  on: boolean,
  fallback?: (on: boolean) => Promise<boolean>,
): Promise<boolean> {
  const address = email.trim().toLowerCase()
  if (!address) return false
  try {
    if (!on) {
      const { error } = await admin
        .from("storelib_newsletter")
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq("email", address)
      if (missingSchema(error) && fallback) return fallback(on)
      return !error
    }
    const { data: existing, error: readError } = await admin.from("storelib_newsletter").select("email").eq("email", address).maybeSingle()
    if (missingSchema(readError) && fallback) return fallback(on)
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
