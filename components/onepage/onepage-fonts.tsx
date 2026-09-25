import { onePageFontHrefs } from "@/lib/onepage/fonts"

/**
 * The stylesheets for a OnePage theme's body and title fonts (lib/onepage/fonts).
 * The editor's preview and the live page both render this, so the creator
 * sees the face a visitor will.
 */
export function OnePageFonts({ theme }: { theme: { font_family?: unknown; title_font?: unknown } | null | undefined }) {
  const hrefs = onePageFontHrefs(theme)
  if (hrefs.length === 0) return null
  return (
    <>
      {hrefs.map((href) => (
        <link key={href} rel="stylesheet" href={href} data-onepage-font="" />
      ))}
    </>
  )
}
