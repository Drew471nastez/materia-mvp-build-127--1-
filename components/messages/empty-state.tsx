import type { ReactNode } from "react"
import Link from "next/link"
import { MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The empty screen, sized by its caller.
 *
 * It used to be a flat `min-h-[60svh]` wherever it appeared, and inside the
 * inbox that was the bug: 60svh plus the heading, the segmented control, the
 * page's own bottom padding and the strip the mobile nav already reserves came
 * to more than one screen, so a page with nothing on it still scrolled — over
 * nothing, which is exactly the feeling being fixed. In the inbox it now takes
 * `flex-1` and fills whatever is actually left; standing alone under <main> it
 * still asks for a fixed slice, because there is no column above it to measure
 * against. The svh floors are what keep it centred rather than clinging to the
 * top in the layouts where a percentage height cannot resolve.
 *
 * It lives outside inbox.tsx and carries no "use client" so that the /messages
 * server component can render the signed-out case itself, without shipping —
 * or waiting for — the inbox bundle to tell a visitor to log in.
 */
export function MessagesEmptyState({
  title,
  body,
  cta,
  icon,
  className,
}: {
  title: string
  body: string
  cta: { href: string; label: string }
  /** Defaults to the speech bubble; the notifications side passes a bell. */
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col items-center justify-center px-6 py-10 text-center",
        className,
      )}
    >
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        {icon ?? <MessageCircle className="h-7 w-7" />}
      </span>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">{body}</p>
      <Link
        href={cta.href}
        className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.97]"
      >
        {cta.label}
      </Link>
    </div>
  )
}
