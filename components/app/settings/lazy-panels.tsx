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

function load(key: SettingsPanelKey): Promise<ComponentType<AnyProps>> {
  let p = loading.get(key)
  if (!p) {
    p = (LOADERS[key]() as Promise<ComponentType<AnyProps>>).then(
      (c) => {
        loaded.set(key, c)
        return c
      },
      (e) => {
        /* A chunk that failed (a dropped connection) is asked again next time. */
        loading.delete(key)
        throw e
      },
    )
    loading.set(key, p)
  }
  return p
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
export function preloadSettingsPanels(): void {
  const keys = (Object.keys(LOADERS) as SettingsPanelKey[]).filter((k) => !loading.has(k))
  void keys.reduce<Promise<unknown>>((chain, k) => chain.then(() => load(k).catch(() => null)), Promise.resolve())
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
