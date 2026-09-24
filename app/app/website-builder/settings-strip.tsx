"use client"

/**
 * ===========================================================================
 *  THE BAR ABOVE THE WEBSITE'S COVER: WHERE ITS SETTINGS ARE
 * ===========================================================================
 * This bar held the website's numbers: visits, orders, conversion and three
 * speed scores. The owner did not want numbers here; Analytics has them.
 * What belongs above the website is a way into the settings that run it,
 * so the same white bar, cut into cells by hairlines, is now a row of
 * doors: each cell opens that page of Website Settings in the editor.
 *
 * A cell says what it is and, where there is one, the fact that matters on
 * it (the address the site is at). Nothing is invented to fill a cell.
 *
 * On a phone the cells are wider than the screen. The bar keeps its corners
 * and the cells scroll sideways inside it, in one row, with no scrollbar.
 */
import { ChevronRight } from "lucide-react"
import type { SettingsSection } from "@/components/website-builder/website-settings/types"

const CARD = "overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
const CELL =
  "group/cell relative flex min-w-[132px] flex-[1_0_auto] items-center justify-between gap-3 whitespace-nowrap px-4 py-3 text-left transition-colors duration-150 hover:bg-[#fafbfc] focus-visible:bg-[#fafbfc] focus-visible:outline-none"

export interface SettingsDoor {
  section: SettingsSection
  label: string
  /** A fact about it, when there is one worth reading. */
  fact?: string
}

export function settingsDoors(siteDisplay: string): SettingsDoor[] {
  return [
    { section: "domains", label: "Domain", fact: siteDisplay || undefined },
    { section: "seo", label: "SEO & Social" },
    { section: "pages", label: "Pages & URLs" },
    { section: "policies", label: "Policies" },
    { section: "backups", label: "Backups" },
    { section: "connections", label: "Connections" },
  ]
}

export function SettingsStrip({ doors, onOpen }: { doors: SettingsDoor[]; onOpen: (section: SettingsSection) => void }) {
  return (
    <nav aria-label="Website settings" data-settings-strip="" className={CARD}>
      <div className="flex divide-x divide-[#eceef1] overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {doors.map((d) => (
          <button key={d.section} type="button" onClick={() => onOpen(d.section)} className={CELL} data-cell={d.section}>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-[#1a1a2e]">{d.label}</span>
              {d.fact ? <span className="mt-0.5 block max-w-[220px] truncate text-[12.5px] text-[#6b7280]">{d.fact}</span> : null}
            </span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-150 group-hover/cell:translate-x-0.5" strokeWidth={2} />
          </button>
        ))}
      </div>
    </nav>
  )
}
