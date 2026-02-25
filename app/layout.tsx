import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Plus_Jakarta_Sans, Space_Grotesk, DM_Sans, Poppins, Montserrat } from "next/font/google"
import "./globals.css"
import { LocaleProvider } from "@/components/locale-provider"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"

// Primary font — loaded eagerly with display swap for fast text rendering
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
})

// Secondary fonts — display swap prevents FOIT (flash of invisible text)
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
})

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
})

// Poppins — only load weights actually used
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
})

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Storelib - Sell Products & Grow Your Audience",
    template: "%s | Storelib",
  },
  description: "The all-in-one ecommerce platform to sell digital products, build your online store & grow your audience.",
  generator: "Storelib",
  keywords: ["sell digital products", "creator platform", "online courses", "digital downloads", "grow audience", "creator economy", "ecommerce platform", "online store"],
  authors: [{ name: "Storelib" }],
  creator: "Storelib",
  publisher: "Storelib",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
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
  icons: {
    icon: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg",
    apple: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg",
  },
  metadataBase: new URL("https://storelib.com"),
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }}>
      <body className={`${inter.variable} ${plusJakartaSans.variable} ${spaceGrotesk.variable} ${dmSans.variable} ${poppins.variable} ${montserrat.variable} font-sans antialiased bg-background text-foreground`}>
        <LocaleProvider>{children}</LocaleProvider>
        <BodyScrollRestorer />
        <CookieConsentBanner />
      </body>
    </html>
  )
}
