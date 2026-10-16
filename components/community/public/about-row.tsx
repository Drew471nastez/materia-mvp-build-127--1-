/**
 * THE ROW UNDER THE NAME (round 33). The owner: "show key facts in a
 * horizontal row with light grey dividers like Skool (members, online,
 * price/free, admins etc.), overlapping member avatars with count". One line
 * of short phrases, each a figure or a word in ink and what it is in grey,
 * a hairline between them (about-facts.ts aboutRow says which). The faces of
 * the members here most recently overlap in front of the member count, as
 * the community card stacks them (member/wall.tsx).
 *
 * WRAPPING WITHOUT A STRAY DIVIDER. On a phone the row can take two lines;
 * the hairline is each item's left border, and the list sits 13px left of a
 * box that clips, so the first item on every line has its hairline (and its
 * 12px of padding) cut off at the edge and starts flush, wherever it wrapped.
 *
 * No hooks: the server's sheet draws it.
 */
import { MemberAvatar } from "@/components/community/member/member-avatar"
import { cn } from "@/lib/utils"
import type { AboutRowFact } from "./about-facts"

export interface AboutFace {
  id: string
  name: string
  avatarUrl: string | null
}

export function AboutRow({ facts, faces = [], className }: { facts: AboutRowFact[]; faces?: AboutFace[]; className?: string }) {
  if (!facts.length) return null
  const shown = faces.slice(0, 5)
  return (
    <div className={cn("overflow-hidden py-0.5", className)} data-about-row="">
      <ul className="-ml-[13px] flex flex-wrap items-center gap-y-2 text-[14px] leading-6 text-[#6b7280]">
        {facts.map((f) => (
          <li key={f.key} className="flex min-h-6 items-center gap-2 border-l border-[#e3e5e9] px-3" data-about-row-fact={f.key}>
            {f.key === "members" && shown.length ? (
              <span className="flex shrink-0 items-center" data-about-faces={shown.length}>
                {shown.map((p, i) => (
                  <span key={p.id} className={cn("relative block rounded-full shadow-[0_0_0_2px_#fff]", i > 0 && "-ml-1.5")} style={{ zIndex: shown.length - i }} title={p.name}>
                    <MemberAvatar src={p.avatarUrl} name={p.name} alt="" size={24} />
                  </span>
                ))}
              </span>
            ) : null}
            {f.key === "online" ? <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#22a06b]" /> : null}
            <span className="whitespace-nowrap">
              <span className="font-semibold tabular-nums text-[#1a1a2e]">{f.value}</span>
              {f.word ? ` ${f.word}` : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
