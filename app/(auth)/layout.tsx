import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://storelib.com",
    siteName: "Storelib",
    title: "Storelib - Sell products & Grow your audience",
    description: "The all-in-one platform for creators to sell digital products, courses, and grow their audience.",
    images: [
      {
        url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg",
        width: 1200,
        height: 630,
        alt: "Storelib - Sell products & Grow your audience",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Storelib - Sell products & Grow your audience",
    description: "The all-in-one platform for creators to sell digital products, courses, and grow their audience.",
    images: ["https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg"],
  },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
