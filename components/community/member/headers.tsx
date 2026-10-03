/**
 * The line at the top of a member page: a plain title, or a space's name
 * with its icon and description. Server safe.
 */
import { SpaceIcon } from "./space-icon"
import type { SpaceView } from "./view-types"

export function PageTitle({ title, detail, children }: { title: string; detail?: string | null; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3" data-page-title="">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[26px]">{title}</h1>
        {detail ? <p className="mt-1 text-[14px] text-[#6b7280]">{detail}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function SpaceHeader({ space }: { space: Pick<SpaceView, "name" | "description" | "icon" | "kind"> }) {
  return (
    <div className="mb-4 flex items-start gap-3" data-space-header="">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e8e9ec] bg-white text-[#4b5563]">
        <SpaceIcon icon={space.icon} kind={space.kind} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-[21px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[24px]">{space.name}</h1>
        {space.description ? <p className="mt-0.5 text-[14px] leading-relaxed text-[#6b7280]">{space.description}</p> : null}
      </div>
    </div>
  )
}
