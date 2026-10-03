"use client"

/**
 * Where a community's videos are kept, for a settings screen: the
 * `providers` list GET /api/app/community/<id>/videos answers. Storelib
 * storage is always there; a video service shows "Not connected" with the
 * env keys it still needs (names only) until a platform admin adds them.
 */
import { Check } from "lucide-react"
import type { VideoProviderName } from "@/lib/video/types"

export interface ProviderLine {
  name: VideoProviderName
  connected: boolean
  active: boolean
  missing: string[]
}

const NAMES: Record<VideoProviderName, string> = {
  storage: "Storelib storage",
  mux: "Mux",
  cloudflare: "Cloudflare Stream",
  bunny: "Bunny Stream",
}

export function VideoProviders({ providers }: { providers: ProviderLine[] }) {
  return (
    <ul className="divide-y divide-[#eef0f3]" data-video-providers>
      {providers.map((p) => (
        <li key={p.name} className="flex min-h-12 items-center gap-3 py-2.5" data-provider={p.name} data-connected={p.connected ? "yes" : "no"}>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-[#1a1a2e]">{NAMES[p.name]}</span>
            {!p.connected && p.missing.length ? <span className="block truncate text-[12px] text-[#9ca3af]">Needs {p.missing.join(", ")}</span> : null}
          </span>
          {p.active ? (
            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#1a1a2e]">
              <Check className="h-3.5 w-3.5" />
              New uploads go here
            </span>
          ) : (
            <span className={`text-[13px] ${p.connected ? "text-[#4b5563]" : "text-[#9ca3af]"}`}>{p.connected ? "Connected" : "Not connected"}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
