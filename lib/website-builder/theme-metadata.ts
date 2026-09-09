/**
 * ===========================================================================
 *  THE SEO GROUP, WHICH WAS HALF WIRED
 * ===========================================================================
 * `seo_title` and `seo_description` were read. `seo_og_image`,
 * `seo_twitter_card` and `seo_robots` were not — anywhere. So a creator who
 * uploaded a social share image got the default card, and one who set
 * "noindex" because their site was not ready yet was indexed anyway.
 *
 * `robots` in particular is the sort of setting somebody trusts. It shipped in
 * the panel, with a default of "index, follow" and four other options, and did
 * nothing at all.
 */

import type { Metadata } from "next"

import type { ThemeSettingsValues } from "./types"

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback
}

/**
 * The Open Graph, Twitter and robots half of a page's metadata, from the
 * theme. The title, description and favicon stay with the route, which knows
 * the creator's handle and what to fall back to.
 */
export function themeMetadata(
  theme: ThemeSettingsValues,
  base: { title: string; description: string; url?: string },
): Pick<Metadata, "openGraph" | "twitter" | "robots"> {
  const t = theme as Record<string, unknown>
  const image = str(t.seo_og_image)
  const card = str(t.seo_twitter_card, "summary_large_image")
  const robots = str(t.seo_robots, "index, follow")

  return {
    openGraph: {
      title: base.title,
      description: base.description,
      type: "website",
      ...(base.url ? { url: base.url } : {}),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      // The two values the panel offers, mapped to what Next expects.
      card: card === "summary" ? "summary" : "summary_large_image",
      title: base.title,
      description: base.description,
      ...(image ? { images: [image] } : {}),
    },
    /**
     * Parsed rather than passed through: Next takes booleans, and a string of
     * "noindex, nofollow" handed to it verbatim is ignored in silence — which
     * is the failure mode this setting already had.
     */
    robots: {
      index: !/noindex/i.test(robots),
      follow: !/nofollow/i.test(robots),
    },
  }
}
