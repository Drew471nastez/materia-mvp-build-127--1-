"use client"

/**
 * The Sites list.
 *
 * Deliberately quiet chrome: the thing worth looking at is the site, so a card
 * is mostly its own preview. Compact controls, subtle borders, 10px corners —
 * the Linear/Vercel register the brief asks for, not the big rounded SaaS card.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Globe, MoreHorizontal, Plus, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SmartLink } from "@/components/smart-link"
import { cn } from "@/lib/utils"
import type { Site } from "@/lib/sites/types"

function relative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function StatusDot({ status }: { status: Site["status"] }) {
  const live = status === "published"
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-500" : "bg-muted-foreground/40")} />
      {live ? "Published" : status === "unpublished" ? "Unpublished" : "Draft"}
    </span>
  )
}

function SiteCard({ site }: { site: Site }) {
  const address = site.slug ? `${site.slug}.storelib.site` : "No address yet"
  return (
    <div className="group overflow-hidden rounded-[10px] border border-border bg-card transition-colors hover:border-foreground/20">
      {/*
        The preview dominates the card, per the brief. Until a site has been
        published there is no build to screenshot, so this is a plain surface
        rather than a fake — a placeholder that pretends to be a website is
        worse than one that admits it is empty.
      */}
      <SmartLink
        href={`/sites/${site.id}`}
        className="block aspect-[16/10] w-full bg-[linear-gradient(180deg,var(--muted)_0%,transparent_100%)]"
        aria-label={`Edit ${site.name}`}
      />

      <div className="flex items-start justify-between gap-3 border-t border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{site.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Globe className="h-3 w-3 shrink-0" />
            {address}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusDot status={site.status} />
            <span className="text-xs text-muted-foreground">· {relative(site.updatedAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button asChild size="sm" variant="outline" className="h-8">
            <SmartLink href={`/sites/${site.id}`}>Edit</SmartLink>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {site.status === "published" && site.slug && (
                <DropdownMenuItem asChild>
                  <a href={`https://${site.slug}.storelib.site`} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open site
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <SmartLink href={`/sites/${site.id}/settings`}>Settings</SmartLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

export function SitesDashboard({ sites, canCreate }: { sites: Site[]; canCreate: string | null }) {
  const router = useRouter()

  if (sites.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
        <span className="mb-4 grid h-11 w-11 place-items-center rounded-[10px] border border-border">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
        </span>
        <h2 className="text-lg font-semibold">Build your first website.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Describe what you want and Storelib AI writes it. Start from a template, or from nothing
          at all.
        </p>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => router.push("/app/sites/new")}>Create site</Button>
        </div>
        {canCreate && <p className="mt-4 text-xs text-muted-foreground">{canCreate}</p>}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sites.map((site) => (
        <SiteCard key={site.id} site={site} />
      ))}

      <button
        type="button"
        onClick={() => router.push("/app/sites/new")}
        className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-5 w-5" />
        New site
      </button>
    </div>
  )
}
