/**
 * ===========================================================================
 *  THE VIDEO SITES' OWN MARKS (round 12)
 * ===========================================================================
 * A pasted YouTube, Vimeo or Loom link is recognised as one: the link field
 * shows the site's mark as soon as the address is theirs, and the preview
 * card and the player's poster say where the video plays. Drawn by hand
 * from the sites' own shapes at a small size: YouTube's red rounded box with
 * the white play, Vimeo's blue square with its "v", Loom's burst. Their own
 * colours, flat, no gradient.
 */
import type { EmbedProvider } from "@/lib/communities/post-media"

export function ProviderMark({ provider, size = 16, className = "" }: { provider: EmbedProvider; size?: number; className?: string }) {
  if (provider === "youtube") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className} data-provider-mark="youtube">
        <rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#ff0033" />
        <path d="M10 9v6l5.2-3z" fill="#fff" />
      </svg>
    )
  }
  if (provider === "vimeo") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className} data-provider-mark="vimeo">
        <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#17d5ff" />
        <path d="M18.2 8.6c-.06 1.3-.97 3.08-2.73 5.34-1.82 2.36-3.36 3.55-4.62 3.55-.78 0-1.44-.72-1.98-2.16l-1.08-3.96c-.4-1.44-.83-2.16-1.29-2.16-.1 0-.45.21-1.05.63l-.63-.81 1.95-1.74c.88-.76 1.54-1.16 1.98-1.2 1.04-.1 1.68.61 1.92 2.13.26 1.64.44 2.66.54 3.06.3 1.36.63 2.04 1 2.04.28 0 .7-.45 1.26-1.34.56-.9.86-1.58.9-2.04.08-.78-.23-1.17-.9-1.17-.32 0-.65.07-.99.22.66-2.16 1.92-3.2 3.78-3.14 1.38.04 2.03.94 1.95 2.7z" fill="#fff" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className} data-provider-mark="loom">
      <path
        fill="#625df5"
        d="M22 10.9h-5.84l5.06-2.92-1.1-1.9-5.06 2.92 2.92-5.06-1.9-1.1-2.92 5.06V2h-2.2v5.84L8 2.78l-1.9 1.1 2.92 5.06-5.06-2.92-1.1 1.9 5.06 2.92H2v2.2h5.84l-5.06 2.92 1.1 1.9 5.06-2.92-2.92 5.06 1.9 1.1 2.92-5.06V22h2.2v-5.84l2.92 5.06 1.9-1.1-2.92-5.06 5.06 2.92 1.1-1.9-5.06-2.92H22zM12 14.98a2.98 2.98 0 1 1 0-5.96 2.98 2.98 0 0 1 0 5.96"
      />
    </svg>
  )
}
