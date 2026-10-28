// OnePage: the free file an email signup gives, read from the page itself
// Location: lib/onepage/signup-file.ts
//
// "Enable digital product" on an email signup block (components/onepage/
// tabs/links-tab.tsx) gives whoever joins a file to download. The block
// keeps `enable_digital_product` and `digital_product_file_url`; the live
// page shows Download once the address is given, and app/api/onepage/leads
// answers with the same file. That route used to take the file's address
// from the request, so it said whatever the request said. It reads the
// block on the published page now, through this.

type Block = { id?: unknown; type?: unknown; data?: unknown }

export type SignupFile = { found: boolean; url: string | null; title: string | null }

/** An address a visitor can open: https, or the app's own /media/ path to storage. */
export function openableFileUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const url = raw.trim()
  if (/^https:\/\/[^\s]+$/i.test(url) || /^\/media\/[^\s]+$/.test(url)) return url
  return null
}

/**
 * The block `blockId` among the page's blocks (a group's too). `found` is
 * whether the block is there at all; `url` is its file, or null when the
 * file is off, missing, or not an address that opens.
 */
export function signupFileFor(blocks: unknown, blockId: unknown): SignupFile {
  if (typeof blockId !== "string" || !blockId || !Array.isArray(blocks)) return { found: false, url: null, title: null }
  const walk = (list: readonly Block[]): Block | null => {
    for (const b of list) {
      if (!b || typeof b !== "object") continue
      if (b.id === blockId) return b
      const children = (b.data as { children?: unknown } | null)?.children
      if (b.type === "group" && Array.isArray(children)) {
        const inner = walk(children as Block[])
        if (inner) return inner
      }
    }
    return null
  }
  const block = walk(blocks as Block[])
  if (!block || block.type !== "email_capture") return { found: !!block, url: null, title: null }
  const data = (block.data || {}) as { enable_digital_product?: unknown; digital_product_file_url?: unknown; digital_product_title?: unknown }
  const url = data.enable_digital_product === true ? openableFileUrl(data.digital_product_file_url) : null
  return { found: true, url, title: url && typeof data.digital_product_title === "string" ? data.digital_product_title : null }
}
