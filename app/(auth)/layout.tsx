import type React from "react"
import { DynamicFavicon } from "@/components/store-builder/dynamic-favicon"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {/* Apply rounded favicon (8px border radius) */}
      <DynamicFavicon />
      {children}
    </>
  )
}
