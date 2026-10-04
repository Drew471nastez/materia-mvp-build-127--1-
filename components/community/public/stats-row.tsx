/**
 * MEMBERS, ONLINE, ADMINS: the figures on a community's card, each a count
 * of real rows. Online is active members whose page sent a heartbeat in the
 * last five minutes; when that cannot be known (before part 85) it is left
 * out, never shown as a guess, and so are admins. The About page (round 10)
 * adds its own counted figures after them (`extra`: posts in the last 30
 * days, courses), each only when there is one, and leaves admins out
 * (`admins={false}`). No hooks.
 */
import { compactCount } from "@/lib/communities/format"
import type { CommunityStatsView } from "./types"

export interface StatCell {
  key: string
  label: string
  value: number
  /** Drawn only where Online is not known (the heartbeat is not there yet), in its place. */
  withoutHeartbeat?: boolean
}

const COLS = ["grid-cols-1", "grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4"]

export function StatsRow({ stats, className = "", admins = true, extra = [] }: { stats: CommunityStatsView; className?: string; admins?: boolean; extra?: StatCell[] }) {
  const cells: StatCell[] = [{ key: "members", label: stats.members === 1 ? "Member" : "Members", value: stats.members }]
  if (stats.online !== null) cells.push({ key: "online", label: "Online", value: stats.online })
  if (admins && stats.admins !== null && stats.admins > 0) cells.push({ key: "admins", label: stats.admins === 1 ? "Admin" : "Admins", value: stats.admins })
  for (const c of extra) if (c.value > 0 && cells.length < 4 && !(c.withoutHeartbeat && stats.online !== null)) cells.push(c)
  return (
    <dl className={`grid divide-x divide-[#eceef1] border-y border-[#eceef1] py-3 ${COLS[cells.length] ?? "grid-cols-4"} ${className}`} data-community-stats="">
      {cells.map((c) => (
        <div key={c.key} className="flex min-w-0 flex-col items-center px-2 text-center" data-stat={c.key}>
          <dd className="order-1 text-[18px] font-semibold tabular-nums leading-6 text-[#1a1a2e]">{compactCount(c.value)}</dd>
          <dt className="order-2 mt-0.5 text-[12.5px] leading-4 text-[#6b7280]">{c.label}</dt>
        </div>
      ))}
    </dl>
  )
}
