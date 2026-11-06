"use client"
import { useState } from "react"
import { EmbedFrame } from "./embed-frame"
export function CompactInstagramPost({
  src,
  title = "Instagram post",
  radius = 16,
}: {
  src: string
  title?: string
  radius?: number
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className="mx-auto w-full space-y-2"
      data-compact-post=""
    >
      <EmbedFrame
        src={src}
        kind="instagram"
        title={title}
        height={380}
        resizes
        radius={radius}
        maxWidth={540}
        fillWidth
        maxHeight={expanded ? undefined : 380}
      />
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="min-h-9 w-full rounded-lg border border-current/15 px-3 py-2 text-xs font-medium"
      >
        {expanded ? "Show less" : "View full post"}
      </button>
    </div>
  )
}
