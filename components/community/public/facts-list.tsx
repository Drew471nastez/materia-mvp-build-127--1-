/**
 * THE ABOUT PAGE'S FACTS AS ONE QUIET LIST (round 13, ask 22). Label on the
 * left in grey, the value on the right in ink, a hairline between rows: how
 * a Storelib summary reads, rather than a row of big figures. "Run by" is
 * the creator's picture and name, a link to their page. No hooks, so the
 * server's sheet and the side card both draw it.
 */
import Link from "next/link"
import { MemberAvatar } from "@/components/community/member/member-avatar"
import { cn } from "@/lib/utils"
import type { AboutFact } from "./about-facts"

export function FactsList({ facts, className }: { facts: AboutFact[]; className?: string }) {
  if (!facts.length) return null
  return (
    <dl className={cn("divide-y divide-[#eef0f2]", className)} data-about-facts="">
      {facts.map((f) => (
        <div key={f.key} className="flex min-h-10 items-center justify-between gap-4 py-2" data-fact={f.key}>
          <dt className="shrink-0 text-[13.5px] text-[#6b7280]">{f.label}</dt>
          <dd className="flex min-w-0 items-center justify-end gap-2 text-right text-[13.5px] font-medium tabular-nums text-[#1a1a2e]">
            {f.key === "creator" ? (
              <>
                <MemberAvatar src={f.creator.avatarUrl} name={f.creator.name} alt="" size={22} className="shrink-0" />
                {f.creator.href ? (
                  /* 40px to a thumb, without taking that room in the row. */
                  <Link href={f.creator.href} className="-my-2.5 min-w-0 truncate py-2.5 underline-offset-2 hover:underline" data-person-link="">
                    {f.value}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate">{f.value}</span>
                )}
              </>
            ) : (
              <span className="min-w-0 truncate">{f.value}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
