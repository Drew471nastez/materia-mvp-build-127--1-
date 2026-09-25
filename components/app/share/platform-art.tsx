import { Link2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BioPlatform } from "./share-data"

/**
 * ===========================================================================
 *  WHERE THE LINK GOES, DRAWN
 * ===========================================================================
 * Each how to in the share sheet opens on a small picture of that platform's
 * profile screen with the creator's own address sitting where the bio link
 * goes, ringed in Storelib's violet. The steps under it say how to get there;
 * the picture says what "there" looks like, which is the part people get
 * stuck on.
 *
 * Drawn here rather than shipped as screenshots: a screenshot is somebody
 * else's picture of somebody else's profile, goes stale the week the app
 * changes, and cannot show the creator's own address. These are bars and
 * circles in the rough layout of each app, so nobody mistakes them for the
 * real screen, and the one real thing on them is the address.
 */

type Layout = "instagram" | "tiktok" | "youtube" | "banner"

const ART: Record<BioPlatform, { layout: Layout; tint: string; link: string; banner?: string }> = {
  instagram: { layout: "instagram", tint: "#fbf0f4", link: "#00376b" },
  tiktok: { layout: "tiktok", tint: "#eef6f7", link: "#161823" },
  youtube: { layout: "youtube", tint: "#fbf0ef", link: "#065fd4", banner: "#f6dcda" },
  twitter: { layout: "banner", tint: "#f1f3f5", link: "#1d9bf0", banner: "#d8dde3" },
  facebook: { layout: "banner", tint: "#eef3fb", link: "#0866ff", banner: "#d6e2f5" },
  threads: { layout: "banner", tint: "#f3f3f4", link: "#0095f6", banner: "#e3e3e6" },
  linkedin: { layout: "banner", tint: "#edf3f9", link: "#0a66c2", banner: "#cfdded" },
  pinterest: { layout: "tiktok", tint: "#fbefef", link: "#111111" },
  twitch: { layout: "banner", tint: "#f3f0fa", link: "#9146ff", banner: "#e2daf6" },
  snapchat: { layout: "tiktok", tint: "#fbfae6", link: "#111111" },
}

function Bar({ w, className }: { w: string; className?: string }) {
  return <span className={cn("block h-2 rounded-full bg-[#e5e7eb]", className)} style={{ width: w }} />
}

function Name({ w = "92px" }: { w?: string }) {
  return <span className="block h-2.5 rounded-full bg-[#1a1a2e]/80" style={{ width: w }} />
}

/** The address, where the bio link goes, ringed so the eye lands on it. */
function LinkLine({ text, color, center = false, suffix }: { text: string; color: string; center?: boolean; suffix?: string }) {
  return (
    <span className={cn("mt-2 flex", center && "justify-center")}>
      <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-[#8b5cf6]/[0.07] px-1.5 py-[3px] ring-2 ring-[#8b5cf6]/60">
        <Link2 className="h-3 w-3 shrink-0" style={{ color }} strokeWidth={2.25} aria-hidden />
        <span className="truncate text-[11.5px] font-semibold leading-none" style={{ color }}>
          {text}
        </span>
        {suffix && <span className="shrink-0 text-[11px] leading-none text-[#6b7280]">{suffix}</span>}
      </span>
    </span>
  )
}

function Avatar({ size = 40, ring }: { size?: number; ring?: string }) {
  return (
    <span
      className="block shrink-0 rounded-full bg-[#d9dbe0]"
      style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2px #fff, 0 0 0 4px ${ring}` : undefined }}
    />
  )
}

export function PlatformArt({ platform, address, className }: { platform: BioPlatform; address: string; className?: string }) {
  const art = ART[platform]
  return (
    <div
      aria-hidden="true"
      className={cn("relative h-[150px] overflow-hidden rounded-2xl sm:h-[172px]", className)}
      style={{ backgroundColor: art.tint }}
    >
      <div className="absolute inset-x-[11%] -bottom-6 top-5 rounded-t-[18px] bg-white px-4 pt-4 shadow-[0_10px_28px_-12px_rgba(17,24,39,0.28)] ring-1 ring-black/[0.04]">
        {art.layout === "instagram" && (
          <>
            <span className="flex items-center gap-4">
              <Avatar size={42} ring="#e1306c" />
              <span className="flex flex-1 justify-between pr-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="flex flex-col items-center gap-1">
                    <span className="block h-2.5 w-5 rounded-full bg-[#1a1a2e]/75" />
                    <Bar w="30px" className="h-1.5" />
                  </span>
                ))}
              </span>
            </span>
            <span className="mt-3 block">
              <Name />
            </span>
            <Bar w="62%" className="mt-1.5" />
            <LinkLine text={address} color={art.link} />
            <span className="mt-3 flex gap-1.5">
              <span className="block h-6 flex-1 rounded-lg bg-[#efefef]" />
              <span className="block h-6 flex-1 rounded-lg bg-[#efefef]" />
            </span>
          </>
        )}

        {art.layout === "tiktok" && (
          <span className="flex flex-col items-center">
            <Avatar size={42} />
            <span className="mt-2">
              <Name w="70px" />
            </span>
            <span className="mt-2.5 flex gap-5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex flex-col items-center gap-1">
                  <span className="block h-2.5 w-5 rounded-full bg-[#1a1a2e]/75" />
                  <Bar w="28px" className="h-1.5" />
                </span>
              ))}
            </span>
            <span className="mt-2.5 block h-6 w-24 rounded-md bg-[#f1f1f2]" />
            <LinkLine text={address} color={art.link} center />
          </span>
        )}

        {art.layout === "youtube" && (
          <>
            <span className="block h-9 rounded-lg" style={{ backgroundColor: art.banner }} />
            <span className="mt-2.5 flex items-center gap-3">
              <Avatar size={38} />
              <span className="flex flex-col gap-1.5">
                <Name w="84px" />
                <Bar w="118px" className="h-1.5" />
              </span>
            </span>
            <Bar w="70%" className="mt-2.5" />
            <LinkLine text={address} color={art.link} suffix="and 2 more links" />
          </>
        )}

        {art.layout === "banner" && (
          <>
            <span className="-mx-4 -mt-4 block h-11 rounded-t-[18px]" style={{ backgroundColor: art.banner }} />
            <span className="-mt-5 block">
              <span className="inline-block rounded-full ring-4 ring-white">
                <Avatar size={40} />
              </span>
            </span>
            <span className="mt-1.5 block">
              <Name w="88px" />
            </span>
            <Bar w="56px" className="mt-1.5 h-1.5" />
            <Bar w="66%" className="mt-2" />
            <LinkLine text={address} color={art.link} />
          </>
        )}
      </div>
    </div>
  )
}
