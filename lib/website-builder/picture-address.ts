/**
 * ===========================================================================
 *  A PICTURE SETTING'S VALUE, AS AN ADDRESS THE EDITOR CAN SHOW
 * ===========================================================================
 * Reported with a screenshot of Theme settings › Logos & Favicon on an
 * imported theme: the favicon field said "This picture could not be loaded"
 * for a favicon the theme had all along. The value was the theme's own,
 * `shopify://shop_images/favicon.png`: a file of the store the theme came
 * from, named the way that store's editor names it. An <img> cannot load
 * that, so the field tried it, tried it again a second later, and gave up.
 *
 * The live site already reads such a value through the theme's asset map
 * (lib/website-builder/compat-site.ts shopImage): the picture of that name
 * the theme brought with it, stored in Storelib's media library at import
 * (shopify/config/assets.json). The editor's field and canvas read it the
 * same way now, so a picture the theme brought is shown, and one it did not
 * bring is said to be missing at once, without a request that cannot work.
 *
 * Two more addresses a browser refuses in the editor and loads once
 * written properly: `//cdn.example.com/x.png` (no scheme) and `http://`
 * (blocked as mixed content on an https page). Both are shown over https.
 * Nothing stored is changed: this is only what is drawn. Pure.
 */

const SHOP_IMAGE = /^shopify:\/\/shop_images\/([^?#]+)/i

/** The file name in `shopify://shop_images/<name>`, or null for any other value. */
export function shopImageName(value: string): string | null {
  const m = SHOP_IMAGE.exec(value.trim())
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

/** Whether an <img> in the editor can be given this address at all. */
export function isLoadableAddress(value: string): boolean {
  return /^(https:\/\/|\/(?![/\\])|data:image\/|blob:)/i.test(value.trim())
}

/**
 * The address to draw a picture setting's value from: the theme's own copy of
 * an old store's picture (`media`, the asset map), https for a scheme-less or
 * http address, anything else as it is. A store picture the theme did not
 * bring stays as it is, which the picture field reads as missing.
 */
export function pictureAddress(value: string, media?: Record<string, string> | null): string {
  const v = value.trim()
  if (!v) return v
  const name = shopImageName(v)
  if (name !== null) {
    const hit = media?.[name]
    return typeof hit === "string" && isLoadableAddress(hit) ? hit : v
  }
  if (/^\/\/[^/\s]/.test(v)) return `https:${v}`
  if (/^http:\/\//i.test(v)) return `https://${v.slice(7)}`
  return v
}
