// OnePage: Paid access (round AR)
// Location: lib/onepage/paid-access.ts
//
// A block (an app block with provider "paid") that shows a teaser and
// keeps the rest behind one of the creator's products: a few lines of text
// and a link (a private video, a folder, a download page). Visitors buy the
// product through Storelib checkout, as any product on the page is bought;
// whoever owns it (signed in, or the browser that bought it as a guest) is
// shown what the block holds.
//
// THE LOCKED PART NEVER LEAVES THE SERVER UNTIL ACCESS IS CHECKED. The live
// page's blocks have it taken out before they are drawn (`withoutLocked`,
// lib/onepage/data-blocks-server.ts), so it is not in the HTML or the page's
// data; app/api/onepage/access answers it, only to an owner.

type Block = { type?: unknown; data?: unknown; [k: string]: unknown }

export const LOCKED_FIELDS = ["locked_text", "locked_url", "locked_label"] as const

export function isPaidBlock(block: Block | null | undefined): boolean {
  return !!block && block.type === "app" && (block.data as { provider?: unknown } | null)?.provider === "paid"
}

/**
 * The blocks with every paid access block's locked part taken out, groups included. A copy: the input is not changed.
 *
 * AND AN EMAIL SIGNUP'S FILE. A signup that gives a file for an address kept
 * the file's own address in the block, so it was in every visitor's page
 * source and opened without any email. The route reads the file from the
 * published page and answers it to the signup (app/api/onepage/leads,
 * lib/onepage/signup-file); the page is only told that there is one.
 */
export function withoutLocked<T>(blocks: T): T {
  if (!Array.isArray(blocks)) return blocks
  return blocks.map((raw) => {
    const b = raw as Block | null
    if (!b || typeof b !== "object") return raw
    const data = (b.data ?? null) as Record<string, unknown> | null
    if (b.type === "group" && Array.isArray(data?.children)) return { ...b, data: { ...data, children: withoutLocked(data!.children) } }
    if (b.type === "email_capture" && data && "digital_product_file_url" in data) {
      const { digital_product_file_url: file, ...rest } = data
      return { ...b, data: { ...rest, digital_product_has_file: typeof file === "string" && !!file.trim() } }
    }
    /* A members only Discord block: owners are added by Storelib (lib/community-roles), so its invite address stays off the page. */
    if (b.type === "app" && data?.provider === "discord" && typeof data.members_product_id === "string" && data.members_product_id && "url" in data) {
      const { url: _invite, ...rest } = data
      void _invite
      return { ...b, data: rest }
    }
    if (!isPaidBlock(b) || !data) return raw
    const clean: Record<string, unknown> = { ...data }
    for (const k of LOCKED_FIELDS) delete clean[k]
    /* The sealed copy (lib/onepage/locked-seal) stays on the server too; its flags were written beside it when it was sealed. */
    delete clean.locked_sealed
    clean.locked_has_text = typeof data.locked_text === "string" ? !!data.locked_text.trim() : data.locked_has_text === true
    clean.locked_has_link = typeof data.locked_url === "string" ? !!data.locked_url.trim() : data.locked_has_link === true
    return { ...b, data: clean }
  }) as unknown as T
}

/** What an owner is shown: the text, and the link only when it is an http(s) address. */
export function lockedContent(data: { locked_text?: unknown; locked_url?: unknown; locked_label?: unknown } | null | undefined): { text: string; url: string | null; label: string | null } {
  const text = typeof data?.locked_text === "string" ? data.locked_text.slice(0, 4000) : ""
  const raw = typeof data?.locked_url === "string" ? data.locked_url.trim() : ""
  let url: string | null = null
  if (/^https?:\/\/\S+$/i.test(raw)) {
    try {
      const u = new URL(raw)
      url = u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
    } catch {
      url = null
    }
  }
  const label = typeof data?.locked_label === "string" && data.locked_label.trim() ? data.locked_label.trim().slice(0, 40) : null
  return { text, url, label }
}
