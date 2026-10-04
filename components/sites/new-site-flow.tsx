"use client"

/**
 * Create your site.
 *
 * Three doors, and the AI one is the front door — that is the product. The
 * other two exist because "describe your website" is a blank page for somebody
 * who does not yet know what they want, and a template is a better place to
 * start arguing with than nothing.
 *
 * WHAT IT DOES TODAY: all three create the same starter project. Only the AI
 * door also records the brief. That is honest scaffolding rather than a
 * pretend feature — the flow's shape is final, so nothing here changes when
 * generation and templates land behind it, and the screen never claims to have
 * generated something it did not.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, FileCode, LayoutTemplate, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SmartLink } from "@/components/smart-link"
import { cn } from "@/lib/utils"

type Door = "ai" | "template" | "blank" | null

const WEBSITE_TYPES = [
  "Landing page",
  "Business website",
  "Personal brand",
  "Portfolio",
  "Digital product",
  "Community",
  "SaaS",
  "Store",
]

const GOALS = ["Get leads", "Sell a product", "Book calls", "Build an audience", "Run a community", "Showcase work"]

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[8px] border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

export function NewSiteFlow() {
  const router = useRouter()
  const [door, setDoor] = React.useState<Door>(null)
  const [name, setName] = React.useState("")
  const [brief, setBrief] = React.useState("")
  const [type, setType] = React.useState<string | null>(null)
  const [goal, setGoal] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const create = async (payload: { name: string; prompt?: string; templateId?: string }) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not create the site.")
        return
      }
      /**
       * The brief rides into the editor, which sends it as the first message.
       *
       * Generation deliberately does NOT happen inside the create request: it
       * takes a minute, and a POST that hangs for a minute is a POST that
       * times out on someone's phone with a site half-made and no way back to
       * it. This way the site exists first, and the build is something you
       * watch happen.
       */
      const brief = payload.prompt?.trim()
      router.push(brief ? `/sites/${data.site.id}?brief=${encodeURIComponent(brief)}` : `/sites/${data.site.id}`)
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  const doors: Array<{ id: Exclude<Door, null>; icon: typeof Sparkles; title: string; detail: string }> = [
    { id: "ai", icon: Sparkles, title: "Start with AI", detail: "Describe it and Storelib writes the code." },
    { id: "template", icon: LayoutTemplate, title: "Choose a template", detail: "Start from a finished design." },
    { id: "blank", icon: FileCode, title: "Blank site", detail: "An empty React project." },
  ]

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6">
      <SmartLink
        href="/app/sites"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Sites
      </SmartLink>

      <h1 className="text-xl font-semibold tracking-tight">Create your site</h1>

      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        {doors.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDoor(d.id)}
            className={cn(
              "rounded-[10px] border p-3 text-left transition-colors",
              door === d.id ? "border-foreground" : "border-border hover:border-foreground/30",
            )}
          >
            <d.icon className="mb-2 h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">{d.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{d.detail}</p>
          </button>
        ))}
      </div>

      {door === "ai" && (
        <div className="mt-6 space-y-5 rounded-[10px] border border-border p-4">
          <div className="space-y-2">
            <Label htmlFor="ns-brief">What are you building?</Label>
            <Textarea
              id="ns-brief"
              rows={3}
              value={brief}
              maxLength={2000}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Build a minimal website for a personal trainer in Bucharest selling online coaching."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Website type</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEBSITE_TYPES.map((t) => (
                <Chip key={t} active={type === t} onClick={() => setType(type === t ? null : t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Main goal</Label>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.map((g) => (
                <Chip key={g} active={goal === g} onClick={() => setGoal(goal === g ? null : g)}>
                  {g}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ns-name">Site name</Label>
            <Input
              id="ns-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="My site"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/*
            It says what it will do. Generation is the next step of Phase 1 and
            this screen must not imply it has already happened — a creator who
            presses "Generate" and lands on a starter page has been lied to.
          */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Creates the project and opens the editor. Generation runs from the chat there.
            </p>
            <Button
              onClick={() => create({ name: name.trim() || "My site", prompt: composeBrief(brief, type, goal) })}
              disabled={busy || !brief.trim()}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create site
            </Button>
          </div>
        </div>
      )}

      {door === "template" && (
        <div className="mt-6 rounded-[10px] border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">Templates are not ready yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            They are real starter projects rather than presets, and they come after the editor. Start
            blank or with AI for now.
          </p>
        </div>
      )}

      {door === "blank" && (
        <div className="mt-6 space-y-4 rounded-[10px] border border-border p-4">
          <div className="space-y-2">
            <Label htmlFor="ns-blank-name">Site name</Label>
            <Input
              id="ns-blank-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="My site"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={() => create({ name: name.trim() || "My site" })} disabled={busy || !name.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create site
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The chips are shorthand for sentences the model reads better, so they are
 * folded into the brief rather than stored as separate fields — a "website
 * type" column would be a taxonomy to maintain for something the prompt
 * already expresses.
 */
function composeBrief(brief: string, type: string | null, goal: string | null): string {
  const parts = [brief.trim()]
  if (type) parts.push(`Website type: ${type}.`)
  if (goal) parts.push(`Main goal: ${goal}.`)
  return parts.filter(Boolean).join(" ")
}
