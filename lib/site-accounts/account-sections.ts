import type { SectionInstance } from "@/lib/website-builder/types"
import type { UiWord } from "@/lib/markets/ui-words"

/**
 * ===========================================================================
 *  THE SIGN IN AND ACCOUNT SECTIONS' OWN WORDS, IN THE PAGE'S LANGUAGE
 * ===========================================================================
 * A website's /account and /account/login are generated (lib/website-builder/
 * account-pages) until the creator saves them, and a generated page's
 * sections leave every text at its default ("Sign in", "Send a new code").
 * Translate lists the texts of saved pages only, so /fr/account/login said
 * all of them in English. The same sentences are the shop's own words
 * (lib/markets/ui-words.ts acct_*), translated once for every page; a text
 * the section left at its default is drawn in that word's approved
 * translation. A text the creator typed is theirs and is translated with
 * their page, so it is never touched here; and with no translation, the
 * section's own default is drawn exactly as before.
 */
const FIELDS: Record<string, Record<string, UiWord>> = {
  main_login: {
    heading: "sign_in",
    text: "acct_email_lead",
    email_label: "email",
    continue_label: "acct_continue",
    note: "acct_new_here",
    track_label: "acct_track_link",
    code_heading: "acct_code_heading",
    code_text: "acct_code_sent_to",
    code_label: "acct_code",
    code_placeholder: "acct_code_placeholder",
    signin_label: "sign_in",
    resend_label: "acct_send_new_code",
    change_label: "acct_different_email",
  },
  main_account: {
    heading: "account",
    signout_label: "acct_sign_out",
    orders_heading: "acct_orders",
    order_label: "acct_order",
    total_label: "total",
    orders_empty: "acct_no_orders",
    shop_link: "acct_browse",
    profile_heading: "acct_profile",
    name_label: "your_name",
    name_empty: "acct_not_added",
    email_label: "email",
    edit_label: "acct_edit",
    save_label: "save",
    cancel_label: "acct_cancel",
    addresses_heading: "acct_addresses",
    wishlist_heading: "wishlist",
    wishlist_saved: "saved",
    wishlist_empty: "acct_wishlist_empty",
    wishlist_link: "acct_wishlist_view",
    delete_label: "acct_delete_account",
    delete_text: "acct_delete_text",
    delete_confirm: "acct_delete_mine",
    signed_out_text: "acct_signed_out",
    signin_label: "sign_in",
  },
}

/** The sections, with each text left at its default drawn in its translated word. Untouched when there are no words. */
export function withAccountWords(sections: SectionInstance[], words: Partial<Record<string, string>> | undefined): SectionInstance[] {
  if (!words || Object.keys(words).length === 0) return sections
  return sections.map((s) => {
    const fields = FIELDS[s.type]
    if (!fields) return s
    const settings = (s.settings ?? {}) as Record<string, unknown>
    let next: Record<string, unknown> | null = null
    for (const [id, word] of Object.entries(fields)) {
      if (settings[id] !== undefined) continue
      const v = words[word]
      if (typeof v !== "string" || !v.trim()) continue
      next = next ?? { ...settings }
      next[id] = v
    }
    return next ? { ...s, settings: next as SectionInstance["settings"] } : s
  })
}
