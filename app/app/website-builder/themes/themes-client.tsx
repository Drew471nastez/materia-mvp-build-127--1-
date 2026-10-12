"use client"

/**
 * ===========================================================================
 *  BROWSE THEMES
 * ===========================================================================
 * The page offered ten themes, which were the same sections dressed in ten
 * palettes: a search box, nine industry filters and a grid to choose between
 * things that did not really differ. Storelib offers one theme for now
 * (BROWSABLE_THEMES in lib/website-builder/theme-registry.ts), so the page
 * shows that one properly instead: on a desktop and on a phone, what is on
 * its home page, its palette and type, and one button.
 *
 * Nothing on the page moves under the pointer. The cards used to rise 2px on
 * hover, which read as a bump rather than as depth; now only colour changes.
 *
 * Everything is drawn from the theme's definition (theme-cover.tsx), so the
 * page paints in one frame. Add posts to the same route the website page
 * uses, and a full library opens the same dialog it does.
 */

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Check, ChevronLeft, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { cn } from "@/lib/utils"
import { BROWSABLE_THEMES, THEME_INSTALL_LIMIT, type ThemeDefinition } from "@/lib/website-builder/theme-registry"
import { type Cover, seedCover, watchCover } from "@/lib/website-builder/cover-refresh"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { ThemeCover, ThemePhoneCover, coverSpecFromDefinition } from "@/components/website-builder/theme-cover"
import { LIBRARY_FULL_CODE } from "@/lib/website-builder/library-limit"
import { LibraryFullDialog, type LibraryAction } from "../library-full-dialog"
import { tt } from "@/lib/i18n/text"

export function ThemeMarketplaceClient({
  installedThemeIds,
  slotsUsed,
  library,
}: {
  installedThemeIds: string[]
  slotsUsed: number
  /** The websites taking the room, for the full-library dialog. */
  library: { id: string; name: string; live: boolean }[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [adding, setAdding] = React.useState<string | null>(null)
  const [full, setFull] = React.useState<LibraryAction | null>(null)
  // Added in this visit: the button flips to "In your library" without a reload.
  const [added, setAdded] = React.useState<Set<string>>(() => new Set(installedThemeIds))
  const used = slotsUsed + (added.size - new Set(installedThemeIds).size)
  const slotsLeft = Math.max(0, THEME_INSTALL_LIMIT - used)

  /* Held by a ref: two taps in one frame both read the state from before the first. */
  const inFlight = React.useRef(false)
  const add = async (def: ThemeDefinition) => {
    if (added.has(def.id) || inFlight.current) return
    if (slotsLeft === 0) {
      setFull("add")
      return
    }
    inFlight.current = true
    setAdding(def.id)
    try {
      const res = await fetch("/api/website-builder/themes/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme_id: def.id }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        /* Full by the server's count (another tab, say): the same sheet the button opens, not a toast. */
        if (d.code === LIBRARY_FULL_CODE) {
          setFull("add")
          router.refresh()
          return
        }
        toast({ title: d.error ?? tt("Could not add theme"), variant: "destructive" })
        return
      }
      /* Its first picture, for the Website page this tab goes back to: kept now, or looked for while its photograph is taken. */
      const made = (await res.json().catch(() => ({}))) as { install?: { id?: string }; cover?: Cover | null; cover_pending?: boolean }
      const id = made.install?.id
      if (id && made.cover?.url) seedCover(id, made.cover)
      else if (id && made.cover_pending) void watchCover(id)
      setAdded((prev) => new Set(prev).add(def.id))
      toast({ title: tt("{name} added", { name: def.name }) })
      router.refresh()
    } catch {
      toast({ title: tt("Could not add theme"), variant: "destructive" })
    } finally {
      inFlight.current = false
      setAdding(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa]">
      <div className="app-page-enter mx-auto max-w-[1200px] app-gutter py-6">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/app/website-builder"
              onClick={() => startNavigationLoading()}
              aria-label={tt("Back to Website")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors duration-150 hover:bg-[#f8f9fa] hover:text-[#1a1a2e]"
            >
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </Link>
            <h1 className="truncate text-[24px] font-bold tracking-tight text-[#1a1a2e] sm:text-[28px]">{tt("Themes")}</h1>
          </div>
          <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[12px] font-semibold tabular-nums text-[#4b5563] ring-1 ring-inset ring-[#e5e7eb]">
            {/* A library from before the limit can hold more than it allows, and "7 of 5" reads as broken. */}
            {used > THEME_INSTALL_LIMIT ? tt("{used} in library", { used }) : tt("{used} of {themeInstallLimit} in library", { used, themeInstallLimit: THEME_INSTALL_LIMIT })}
          </span>
        </div>

        <div className="mt-6 space-y-6 pb-8">
          {BROWSABLE_THEMES.map((t) => (
            <ThemeShowcase
              key={t.id}
              def={t}
              inLibrary={added.has(t.id)}
              busy={adding === t.id}
              onAdd={() => void add(t)}
            />
          ))}
        </div>
      </div>

      <LibraryFullDialog action={full} entries={library} onClose={() => setFull(null)} />
    </div>
  )
}

/** One theme, whole: previews on the left, what it is and the button on the right. */
function ThemeShowcase({ def, inLibrary, busy, onAdd }: { def: ThemeDefinition; inLibrary: boolean; busy: boolean; onAdd: () => void }) {
  const [device, setDevice] = React.useState<"desktop" | "phone">("desktop")
  const spec = React.useMemo(() => coverSpecFromDefinition(def), [def])
  const sections = React.useMemo(
    () => def.homeSections.filter((s) => s !== "header" && s !== "footer").map((s) => SECTION_SCHEMAS[s]?.name ?? s.replace(/_/g, " ")),
    [def],
  )

  return (
    <article
      data-theme-showcase=""
      className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ── Preview ───────────────────────────────────────────── */}
        <div className="relative border-b border-[#eceef1] bg-[#f3f4f6] app-card-x py-4 sm:py-6 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex justify-end">
            <div role="group" aria-label={tt("Preview on")} className="flex rounded-lg bg-white p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-[#e5e7eb]">
              {(["desktop", "phone"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  aria-pressed={device === d}
                  className={cn(
                    "h-7 rounded-md px-3 text-[12.5px] font-medium capitalize transition-colors duration-150",
                    device === d ? "bg-[#1a1a2e] text-white" : "text-[#6b7280] hover:text-[#1a1a2e]",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          {/* Both are drawn and one is hidden, so switching never waits on a paint. */}
          <div className={cn(device === "desktop" ? "block" : "hidden")}>
            <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_18px_40px_-20px_rgba(15,23,42,0.28)] ring-1 ring-black/[0.06]">
              <div className="aspect-[16/10] w-full">
                <ThemeCover spec={spec} className="h-full w-full" title={tt("{name} on a desktop", { name: def.name })} />
              </div>
            </div>
          </div>
          <div className={cn(device === "phone" ? "block" : "hidden")}>
            <div className="mx-auto w-[220px] overflow-hidden rounded-[30px] border-[4px] border-white bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_22px_44px_-18px_rgba(15,23,42,0.35)] ring-1 ring-black/[0.08]">
              <div className="aspect-[390/780]">
                <ThemePhoneCover spec={spec} className="h-full w-full" />
              </div>
            </div>
          </div>
        </div>

        {/* ── What it is ────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col app-card-x py-5 sm:py-6">
          <p className="text-[12px] font-medium text-[#6b7280]">{tt("Version {version}", { version: def.version })}</p>
          <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-[#1a1a2e]">{def.name}</h2>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#4b5563]">{def.description}</p>

          <div className="mt-5">
            {inLibrary ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-[13.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
                  <Check className="h-4 w-4" />
                  {tt("In your library")}
                </span>
                <Link
                  href="/app/website-builder"
                  onClick={() => startNavigationLoading()}
                  className="inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-[13.5px] font-medium text-[#4b5563] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
                >
                  {tt("Open library")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <Button onClick={onAdd} disabled={busy} className="h-10 w-full rounded-lg bg-[#1a1a2e] text-[14px] font-semibold text-white hover:bg-[#2d2d44] sm:w-auto sm:px-5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {tt("Add to library")}
              </Button>
            )}
          </div>

          <dl className="mt-6 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3] text-[13px]">
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-[#6b7280]">{tt("Colours")}</dt>
              <dd className="flex gap-1">
                {[def.palette.primary, def.palette.accent, def.palette.heroBg, def.palette.bg, def.palette.surface].map((c, i) => (
                  <span key={`${c}-${i}`} className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10" style={{ background: c }} title={c} />
                ))}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-[#6b7280]">{tt("Headings")}</dt>
              <dd className="font-medium text-[#1a1a2e]">{def.fonts.heading}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-[#6b7280]">{tt("Body")}</dt>
              <dd className="font-medium text-[#1a1a2e]">{def.fonts.body}</dd>
            </div>
          </dl>

          <div className="mt-5">
            <p className="text-[12.5px] font-medium text-[#6b7280]">{tt("On the home page")}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {sections.map((s, i) => (
                <li key={`${s}-${i}`} className="rounded-md bg-[#f3f4f6] px-2 py-1 text-[12px] font-medium text-[#4b5563]">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </article>
  )
}
