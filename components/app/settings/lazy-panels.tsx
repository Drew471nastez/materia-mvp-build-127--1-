"use client"

/**
 * ===========================================================================
 *  SETTINGS' SECTIONS, LOADED AFTER THE SHEET HAS RISEN
 * ===========================================================================
 * Settings opens on General, and every other section's code (Team, Taxes,
 * Languages, Integrations, Emails, ...) came with it: about 850 KB of
 * gzipped JavaScript to download and parse before the sheet could answer a
 * press, against 568 KB for the whole of /app. Each section here is its own
 * chunk instead, fetched as soon as the sheet has risen (preloadSettingsPanels,
 * called with the data prefetch in settings-form-new.tsx), so a section
 * pressed a second later is already here.
 *
 * A section is never drawn half loaded. The form swaps a pressed section in
 * only once its code is here (whenSettingsPanel, beside the data it waits
 * for), and a loaded section renders synchronously from the cache, so the
 * swap, the scroll to its top and the fade are the same frame as before. A
 * section opened by its address on a reload is rendered on the server and
 * keeps that HTML until its code arrives (`use`, under the form's Suspense).
 */
import { use, type ComponentType } from "react"
import type { ShippingPart } from "@/components/physical/shipping-settings"
import type { ReasonKind } from "@/lib/store/reasons"

type AnyProps = Record<string, unknown>

const LOADERS = {
  notifications: () => import("@/components/app/settings/notification-preferences").then((m) => m.NotificationPreferencesPanel),
  ai_memory: () => import("@/components/app/settings/ai-memory-panel").then((m) => m.AiMemoryPanel),
  checkout: () => import("@/components/app/settings/checkout-panel").then((m) => m.CheckoutPanel),
  shipping: () => import("@/components/physical/shipping-settings").then((m) => m.ShippingSettings),
  taxes: () => import("@/components/app/settings/taxes-panel").then((m) => m.TaxesPanel),
  markets: () => import("@/components/app/settings/markets-panel").then((m) => m.MarketsPanel),
  channels: () => import("@/components/app/settings/channels-panel").then((m) => m.ChannelsPanel),
  emails: () => import("@/components/app/settings/customer-emails-panel").then((m) => m.CustomerEmailsPanel),
  activity: () => import("@/components/app/settings/activity-panel").then((m) => m.ActivityPanel),
  team: () => import("@/components/app/settings/team-panel").then((m) => m.TeamPanel),
  reasons: () => import("@/components/app/settings/reasons-panel").then((m) => m.ReasonsPanel),
  integrations: () => import("@/components/app/settings/integrations-directory").then((m) => m.IntegrationsDirectory),
} as const

export type SettingsPanelKey = keyof typeof LOADERS

const loaded = new Map<SettingsPanelKey, ComponentType<AnyProps>>()
const loading = new Map<SettingsPanelKey, Promise<ComponentType<AnyProps>>>()

/*
  A SECTION'S CODE IS WAITED FOR, BUT NOT FOR EVER. "I click on something and
  it doesn't load it": a chunk request that is taken and never answered (a
  phone on a stalled connection, a captive network) left the import pending,
  and the press waited on it (settings-form-new swaps a section in only once
  its code is here), so the pill lit and the section before stayed, with
  nothing to say why. scripts/check-settings-switch.mjs SWITCH_ONLY=hang
  measured it: still the section before after 15s. Turbopack's chunk loader
  has no deadline of its own.

  Past CODE_WAIT_MS the wait rejects with SettingsCodeTimeout, which the
  section's own boundary reads as "taking too long", with Try again. The
  import itself is not cancelled (nothing can cancel one): if it lands later
  the section is kept (`loaded`) and the next press draws it at once.
*/
export const CODE_WAIT_MS = 8_000

export class SettingsCodeTimeout extends Error {
  constructor(key: string) {
    super(`settings section ${key} code took longer than ${CODE_WAIT_MS / 1000}s`) // i18n-ignore: for the log
    this.name = "SettingsCodeTimeout"
  }
}

function within<T>(p: Promise<T>, key: SettingsPanelKey): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new SettingsCodeTimeout(key)), CODE_WAIT_MS)
    p.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

function importCode(key: SettingsPanelKey): Promise<ComponentType<AnyProps>> {
  const p = LOADERS[key]() as Promise<ComponentType<AnyProps>>
  /* Landing after its deadline still counts: the next press finds it here. */
  p.then((c) => loaded.set(key, c), () => undefined)
  return p
}

/** Once more after a moment: a phone that dropped the connection for a second gets the section rather than its failure. */
function fetchCode(key: SettingsPanelKey): Promise<ComponentType<AnyProps>> {
  return within(
    importCode(key).catch(() => new Promise<ComponentType<AnyProps>>((resolve, reject) => window.setTimeout(() => importCode(key).then(resolve, reject), 400))),
    key,
  )
}

/*
  A chunk that still fails (a deploy renamed it, and this tab is from before)
  rejects, and the section that draws it throws where it is drawn: caught by
  the section's own boundary (components/app/settings/section-boundary.tsx),
  never by the /app error boundary that reloaded the whole page for it.
*/
function load(key: SettingsPanelKey): Promise<ComponentType<AnyProps>> {
  let p = loading.get(key)
  if (!p) {
    p = fetchCode(key).then(
      (c) => {
        loaded.set(key, c)
        return c
      },
      (e) => {
        /*
          A chunk that failed is asked again next time, but not by the swap
          that follows straight after the failure: that one is handed this same
          failed answer, so the section's boundary says so at once instead of
          the press waiting through a second fetch of a file that is gone.
        */
        failed.add(key)
        window.setTimeout(() => {
          if (loading.get(key) === p) loading.delete(key)
        }, FAILED_KEPT_MS)
        throw e
      },
    )
    /* Nobody may be waiting on a preload: its failure is the section's to report, not an unhandled rejection. */
    p.catch(() => undefined)
    loading.set(key, p)
  }
  return p
}
const FAILED_KEPT_MS = 3000
const failed = new Set<SettingsPanelKey>()

/** A section's Try again (components/app/settings/section-boundary.tsx): every failed section is asked for afresh, at once. */
export function forgetFailedSettingsPanels(): void {
  for (const key of failed) if (!loaded.has(key)) loading.delete(key)
  failed.clear()
}

/** The settings tab ids whose section is one of these chunks. Returns are two sections (shipping's and the reasons). */
const TAB_PANELS: Record<string, SettingsPanelKey[]> = {
  notifications: ["notifications"],
  ai_memory: ["ai_memory"],
  checkout: ["checkout"],
  shipping: ["shipping"],
  locations: ["shipping"],
  taxes: ["taxes"],
  markets: ["markets"],
  channels: ["channels"],
  emails: ["emails"],
  activity: ["activity"],
  team: ["team"],
  returns: ["shipping", "reasons"],
  integrations: ["integrations"],
}

/** Resolves once the code of a tab's section is here (at once for a tab that has none of its own). Never rejects. */
export function whenSettingsPanel(tab: string): Promise<void> {
  const keys = (TAB_PANELS[tab] ?? []).filter((k) => !loaded.has(k))
  if (keys.length === 0) return Promise.resolve()
  return Promise.all(keys.map(load)).then(
    () => undefined,
    () => undefined,
  )
}

/** True when a tab's section can be drawn in this frame. */
export function settingsPanelReady(tab: string): boolean {
  return (TAB_PANELS[tab] ?? []).every((k) => loaded.has(k))
}

/** Every section's code, one after another so none of them competes with what the person is doing. */
/*
  AT IDLE, AND ALL OF THEM, THE FIRST TIME SETTINGS OPENS. The native apps keep
  one web view for days, across many deploys; a section whose code was never
  fetched before the next deploy can no longer be fetched once that deploy's
  skew window has passed. Every chunk is asked for while the browser has
  nothing else to do (at most a second's wait each), and once here it stays
  for the life of the tab (`loaded`), so a later deploy strands none of them.
*/
const idle = () =>
  new Promise<void>((resolve) => {
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 1000 })
    else window.setTimeout(resolve, 50)
  })

export function preloadSettingsPanels(): void {
  const keys = (Object.keys(LOADERS) as SettingsPanelKey[]).filter((k) => !loading.has(k) && !loaded.has(k))
  /* Each step ends by CODE_WAIT_MS at the latest (fetchCode): one stalled chunk never holds back the ones after it. */
  void keys.reduce<Promise<unknown>>((chain, k) => chain.then(idle).then(() => (loaded.has(k) ? null : load(k).catch(() => null))), Promise.resolve())
}

function lazyPanel<P extends object>(key: SettingsPanelKey): ComponentType<P> {
  function SettingsPanel(props: P) {
    const C = loaded.get(key) ?? use(load(key))
    return <C {...(props as AnyProps)} />
  }
  SettingsPanel.displayName = `SettingsPanel(${key})`
  return SettingsPanel
}

export const NotificationPreferencesPanel = lazyPanel<object>("notifications")
export const AiMemoryPanel = lazyPanel<object>("ai_memory")
export const CheckoutPanel = lazyPanel<object>("checkout")
export const ShippingSettings = lazyPanel<{ part?: ShippingPart }>("shipping")
export const TaxesPanel = lazyPanel<object>("taxes")
export const MarketsPanel = lazyPanel<object>("markets")
export const ChannelsPanel = lazyPanel<object>("channels")
export const CustomerEmailsPanel = lazyPanel<{ bare?: boolean }>("emails")
export const ActivityPanel = lazyPanel<object>("activity")
export const TeamPanel = lazyPanel<object>("team")
export const ReasonsPanel = lazyPanel<{ kinds: ReasonKind[] }>("reasons")
export const IntegrationsDirectory = lazyPanel<{ page?: boolean; only?: string | null }>("integrations")
