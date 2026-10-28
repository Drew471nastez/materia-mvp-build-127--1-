/**
 * A community's address as the people who run it share it: from its card in /app/community and from the bar over its
 * admin (community-list.tsx, community-shell.tsx), one way in both.
 *
 * storelib.com, always. Only a storelib.com address opens the Storelib app (lib/platform/app-links.ts), so a share from
 * a creator's own domain or a preview host would hand out a link that can never do that.
 */
export function publicCommunityUrl(slug: string): string {
  return `https://storelib.com/community/${slug}`
}

/** The system share sheet where there is one on a touch screen, otherwise the address copied. */
export async function shareCommunity(c: { name: string; tagline?: string | null; slug: string }): Promise<"shared" | "copied" | "failed"> {
  const url = publicCommunityUrl(c.slug)
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: c.name, text: c.tagline ?? undefined, url })
      return "shared"
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return "shared"
    }
  }
  return (await copyText(url)) ? "copied" : "failed"
}

/**
 * Text onto the clipboard, true once it is there. `navigator.clipboard?.writeText(x).then(...)` threw where there is no
 * clipboard at all (an older webview, a page that is not secure: the `?.` makes it undefined, and `.then` of that
 * throws), so nothing was copied and nothing was said.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    /* No clipboard at all throws here too, and takes the old way below. */
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* An older webview, or a page without clipboard permission: a hidden field and the old command. */
    try {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.setAttribute("readonly", "")
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
