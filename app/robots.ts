import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/app/", "/auth/", "/explore?sort=", "/explore?q="],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/admin/", "/api/", "/app/", "/auth/", "/explore?sort=", "/explore?q="],
      },
    ],
    sitemap: "https://storelib.com/sitemap.xml",
  }
}
