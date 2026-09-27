import type React from "react"
import type { Metadata } from "next"
import { HtmlClass } from "@/components/platform/html-class"
import { STORELIB_OG_IMAGE, storelibAssetUrl } from "@/lib/brand/logo"

export const metadata: Metadata = {
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://storelib.com",
    siteName: "Storelib",
    title: "Storelib - Sell Products & Grow Your Audience",
    description: "The all-in-one ecommerce platform to sell digital products, build your online store & grow your audience.",
    images: [
      {
        url: storelibAssetUrl(STORELIB_OG_IMAGE),
        width: 1200,
        height: 630,
        alt: "Storelib - Sell Products & Grow Your Audience",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Storelib - Sell Products & Grow Your Audience",
    description: "The all-in-one ecommerce platform to sell digital products, build your online store & grow your audience.",
    images: [storelibAssetUrl(STORELIB_OG_IMAGE)],
  },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="bg-white" data-page="auth"><HtmlClass name="with-page-auth" />{children}</div>
}
