/**
 * MEMBERS, ONLINE, ADMINS: the three figures on a community's card, each a
 * count of real rows. Online is active members whose page sent a heartbeat
 * in the last five minutes; when that cannot be known (before part 85) it
 * is left out, never shown as a guess, and so are admins. No hooks.
 */
import { compactCount } from "@/lib/communities/format"
import type { CommunityStatsView } from "./types"

export function StatsRow({ stats, className = "" }: { stats: CommunityStatsView; className?: string }) {
  const cells: { label: string; value: number; key: string }[] = [{ key: "members", label: stats.members === 1 ? "Member" : "Members", value: stats.members }]
  if (stats.online !== null) cells.push({ key: "online", label: "Online", value: stats.online })
  if (stats.admins !== null && stats.admins > 0) cells.push({ key: "admins", label: stats.admins === 1 ? "Admin" : "Admins", value: stats.admins })
  return (
    <dl className={`grid divide-x divide-[#eceef1] border-y border-[#eceef1] py-3 ${cells.length === 3 ? "grid-cols-3" : cells.length === 2 ? "grid-cols-2" : "grid-cols-1"} ${className}`} data-community-stats="">
      {cells.map((c) => (
        <div key={c.key} className="flex flex-col items-center px-2 text-center" data-stat={c.key}>
          <dd className="order-1 text-[18px] font-semibold tabular-nums leading-6 text-[#1a1a2e]">{compactCount(c.value)}</dd>
          <dt className="order-2 mt-0.5 text-[12.5px] text-[#6b7280]">{c.label}</dt>
        </div>
      ))}
    </dl>
  )
}
