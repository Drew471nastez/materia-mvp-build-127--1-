import type { MetadataRoute } from "next"

// The feed lives on "/" (and, for the native app, on /explore). Its sort/search
// permutations are infinite crawl surface, so both prefixes are disallowed.
const DISALLOW = [
  "/admin/",
  "/api/",
  "/app/",
  "/auth/",
  "/?sort=",
  "/?q=",
  "/explore?sort=",
  "/explore?q=",
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: DISALLOW,
      },
    ],
    sitemap: "https://storelib.com/sitemap.xml",
  }
}
