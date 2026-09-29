import Link from "next/link"
import { memberProfilePublicPath } from "@/lib/profile/member-url"

/** Storefront visitors can open the public member profile at /@handle. */
export function MemberProfileCta({ username }: { username: string }) {
  const href = memberProfilePublicPath(username)
  return (
    <p className="mt-3 text-center text-[13px] text-[#6b7280]" data-storefront-member-profile="">
      <Link href={href} className="font-medium text-[#4b5563] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
        View profile
      </Link>
    </p>
  )
}
