import type React from "react"
import type { Metadata } from "next"
import { NativeAuthScrollLock } from "@/components/native-auth-scroll-lock"

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
        url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg",
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
    images: ["https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg"],
  },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <NativeAuthScrollLock />
      {children}
    </>
  )
}
