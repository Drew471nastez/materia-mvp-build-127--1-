"use client"

/**
 * The Community section's settings in the builder's sidebar: which of the
 * creator's own communities it shows (from /api/store-builder/communities,
 * each saying whether a visitor would see it), a heading above it, and which
 * parts it draws. The members and leaderboard parts also follow the
 * community's own settings (its member directory, its points and levels),
 * which the note under each says, so a switch that draws nothing is never
 * a mystery.
 */
import { ChevronDown } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CommunityBlockToggles } from "@/lib/communities/blocks"
import type { CommunitySettings } from "@/lib/store-builder/types"
import { useCreatorCommunities } from "./community-section"

const PARTS: { key: keyof CommunityBlockToggles; label: string; note?: string }[] = [
  { key: "showStats", label: "Members, posts and events counts" },
  { key: "showEvents", label: "Upcoming events", note: "Events every member can attend." },
  { key: "showPosts", label: "Latest posts", note: "Only from spaces every member can read. Never a chat or a restricted space." },
  { key: "showMembers", label: "Members", note: "Only while the community's member directory is on." },
  { key: "showLeaderboard", label: "Most active this month", note: "Only while the community has points and levels on." },
  { key: "showReviews", label: "Reviews", note: "Shown once the community has published reviews." },
  { key: "showJoin", label: "Join button" },
]

export function CommunitySettingsForm({ settings, onChange }: { settings: CommunitySettings; onChange: (settings: Partial<CommunitySettings>) => void }) {
  const { state, communities, error } = useCreatorCommunities(null)
  const chosen = communities.find((c) => c.id === settings.communityId)
  return (
    <div className="space-y-5" data-community-settings>
      <div className="space-y-2">
        <Label className="text-sm font-normal" htmlFor="community-section-pick">
          Community
        </Label>
        {state === "off" ? (
          <p className="text-xs text-muted-foreground">Communities are switched off on Storelib right now, so this section is hidden on your page.</p>
        ) : (
          <div className="relative">
            <select
              id="community-section-pick"
              className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              value={settings.communityId}
              disabled={state === "loading"}
              onChange={(e) => onChange({ communityId: e.target.value })}
            >
              <option value="">{state === "loading" ? "Loading…" : communities.length ? "Choose a community" : "No communities yet"}</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.shows ? c.name : `${c.name} (${c.why?.toLowerCase()})`}
                </option>
              ))}
              {settings.communityId && !chosen && state === "ready" ? <option value={settings.communityId}>Not one of yours</option> : null}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        )}
        {state === "error" ? <p className="text-xs text-destructive">{error}</p> : null}
        {chosen && !chosen.shows ? <p className="text-xs text-muted-foreground">Visitors see this section once {chosen.name} is published and public.</p> : null}
        {state === "ready" && communities.length === 0 ? (
          <a href="/app/community" className="inline-flex h-8 items-center text-xs font-medium text-foreground underline underline-offset-4">
            Create a community
          </a>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal" htmlFor="community-section-headline">
          Heading
        </Label>
        <Input id="community-section-headline" value={settings.headline} placeholder="None" onChange={(e) => onChange({ headline: e.target.value.slice(0, 80) })} className="h-9" />
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Show</legend>
        {PARTS.map((p) => (
          <label key={p.key} className="flex cursor-pointer items-start justify-between gap-4">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{p.label}</span>
              {p.note ? <span className="block text-xs text-muted-foreground">{p.note}</span> : null}
            </span>
            <input type="checkbox" className="theme-checkbox-purple mt-0.5" checked={Boolean(settings[p.key])} onChange={(e) => onChange({ [p.key]: e.target.checked } as Partial<CommunitySettings>)} />
          </label>
        ))}
      </fieldset>
    </div>
  )
}
