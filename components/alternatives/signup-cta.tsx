"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { signupHref } from "@/lib/alternatives/attribution"
import { trackAlternatives } from "@/lib/alternatives/track"

/**
 * A sign up button on a comparison page. The server renders the plain
 * address (lib/alternatives/attribution signupHref); after hydration the
 * visitor's own utm tags and ref are added, read from the address the page
 * was opened at. The label and the size never change, so nothing moves.
 */
export function SignupCta({
  slug,
  placement,
  children,
  variant = "primary",
  className = "",
}: {
  slug: string | null
  placement: string
  children: ReactNode
  variant?: "primary" | "secondary" | "inverse"
  className?: string
}) {
  const [href, setHref] = useState(() => signupHref(slug))
  useEffect(() => setHref(signupHref(slug, window.location.search)), [slug])
  const look =
    variant === "primary"
      ? "bg-[#1a1a2e] text-white hover:bg-[#2a2a42]"
      : variant === "inverse"
        ? "bg-white text-[#1a1a2e] hover:bg-[#f1f2f4]"
        : "bg-white text-[#1a1a2e] border border-[#d4d7dc] hover:bg-[#f9fafb]"
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={() => trackAlternatives("Comparison CTA", { page: slug ?? "hub", placement })}
      data-alternatives-cta={placement}
      className={`inline-flex h-11 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e] ${look} ${className}`}
    >
      {children}
    </Link>
  )
}
