/**
 * YOUR OWN PROFILE, AND THE PLACES YOU GO FROM IT.
 *
 * Only on your own profile, where somebody else would see Follow: Library,
 * Courses, Communities (the ones you are in, while communities are on),
 * Edit profile and Settings, as the Library's pills: white on a hairline,
 * a row that scrolls sideways on a narrow phone rather than wrapping into
 * a block. Plain links, so they work before any script has loaded. Nothing
 * here is about selling: a buyer's profile never offers a store.
 */
import Link from "next/link"
import { cn } from "@/lib/utils"

const PILL =
  "inline-flex h-10 shrink-0 select-none items-center whitespace-nowrap rounded-full border border-[#e4e7ec] bg-white px-4 text-[14px] font-medium text-[#1a1a2e] outline-none " +
  "transition-[background-color,border-color,scale] duration-150 hover:border-[#d7dadf] hover:bg-[#f7f7f8] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none motion-reduce:active:scale-100 [-webkit-tap-highlight-color:transparent]"

export function ownerPillLinks(communities: boolean): { key: string; label: string; href: string }[] {
  return [
    { key: "library", label: "Library", href: "/library" },
    { key: "courses", label: "Courses", href: "/library/courses" },
    ...(communities ? [{ key: "communities", label: "Communities", href: "/library/communities" }] : []),
    { key: "edit", label: "Edit profile", href: "/account/settings" },
    { key: "settings", label: "Settings", href: "/account/settings?section=account" },
  ]
}

export function ProfileOwnerPills({ communities, className }: { communities: boolean; className?: string }) {
  return (
    <nav aria-label="Your pages" className={cn("-mx-4 sm:mx-0", className)} data-profile-owner-pills="">
      <div className="overflow-x-auto overscroll-x-contain px-4 py-0.5 scrollbar-hide sm:px-0">
        <div className="mx-auto flex w-max items-center gap-2">
          {ownerPillLinks(communities).map((p) => (
            <Link key={p.key} href={p.href} prefetch={false} className={PILL} data-profile-owner-pill={p.key}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
