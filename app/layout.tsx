import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Plus_Jakarta_Sans, Space_Grotesk, DM_Sans, Poppins, Montserrat } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { LocaleProvider } from "@/components/locale-provider"

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
})

const plusJakartaSans = Plus_Jakarta_Sans({ 
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
})

const spaceGrotesk = Space_Grotesk({ 
  subsets: ["latin"],
  variable: "--font-space-grotesk",
})

const dmSans = DM_Sans({ 
  subsets: ["latin"],
  variable: "--font-dm-sans",
})

const poppins = Poppins({ 
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
})

const montserrat = Montserrat({ 
  subsets: ["latin"],
  variable: "--font-montserrat",
})

export const metadata: Metadata = {
  title: "Materia - Sell your knowledge. All in one place.",
  description: "The all-in-one platform for creators to sell digital products, courses, and paid communities.",
  generator: "Materia",
  icons: {
    icon: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg",
    apple: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg",
  },
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
      <body className={`${inter.variable} ${plusJakartaSans.variable} ${spaceGrotesk.variable} ${dmSans.variable} ${poppins.variable} ${montserrat.variable} font-sans antialiased bg-background text-foreground overflow-x-hidden`}>
        <LocaleProvider>{children}</LocaleProvider>
        <Analytics />
      </body>
    </html>
  )
}
