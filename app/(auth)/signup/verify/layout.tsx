import type React from "react"
import type { Metadata } from "next"

/* One person's step after signing up: never indexed, though /signup above it is. */
export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false, follow: true },
}

export default function SignupVerifyLayout({ children }: { children: React.ReactNode }) {
  return children
}
