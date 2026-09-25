/**
 * Whether a link is one of an email's own links, for the click redirect
 * (app/api/email/click). Compared after undoing the HTML escaping and
 * normalising the URL, so "https://x.com/a?b=1&amp;c=2" in the body matches
 * the https://x.com/a?b=1&c=2 the click carries.
 */
function norm(url: string): string {
  try {
    return new URL(url.replace(/&amp;/g, "&")).toString()
  } catch {
    return url
  }
}

export function appearsIn(body: string, target: string): boolean {
  const want = norm(target)
  for (const m of body.matchAll(/href\s*=\s*"([^"]+)"|href\s*=\s*'([^']+)'/gi)) {
    const href = m[1] ?? m[2] ?? ""
    if (norm(href) === want) return true
  }
  return false
}
