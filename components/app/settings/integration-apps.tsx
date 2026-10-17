"use client"

/**
 * ===========================================================================
 *  BUILT-IN APPS INSIDE THEIR INTEGRATION PAGE: THE PLUG-IN API (round K4)
 * ===========================================================================
 * An integration's page (./integration-detail.tsx) is one shell for every
 * integration: the banner, the mark, the name, where it stands and the
 * actions, then its sections. A Storelib app that has more to manage than a
 * settings panel (Storelib Reviews: its reviews, requests, analytics) plugs
 * its own management into that shell here, instead of a page of its own.
 *
 * THE WHOLE API
 *
 *   INTEGRATION_APP_VIEWS[integrationId] = {
 *     tabs: [{ id: "overview", label: "Overview" }, ...],   // 1 to 7
 *     defaultTab?: "overview",                              // else tabs[0]
 *     Body: (props: IntegrationAppBodyProps) => ReactNode,  // a component
 *   }
 *
 * The key is the catalog id (lib/integrations/catalog.ts), e.g.
 * "storelib-reviews". With a view registered the shell draws the tabs under
 * its header and hands the body to `Body`; without one it draws its own
 * sections, as every third party integration has.
 *
 * What `Body` is given (IntegrationAppBodyProps):
 *
 *   tab        the open tab's id, kept in the address (?view=<id>), so a
 *              link opens it and Back returns to it
 *   setTab     open another tab (written in place, no new history entry)
 *   item       the catalog entry; status, installed: where it stands now
 *   sections   the shell's own sections, ready to place anywhere:
 *                setup     the integration's existing settings panel
 *                          (for Reviews, the ReviewsAppPanel as it is today)
 *                status    Status and diagnostics, or null
 *                overview  What it does, How it works
 *                data      Your data
 *                glance    At a glance (an aside)
 *                danger    Disconnect / Turn off, or null
 *   Layout     the shell's two column layout: <Layout main={...} aside={...} />
 *   onChanged  tell the shell the app was turned on or off from inside the
 *              body, so the header, the card's badge and the sidebar follow
 *
 * Rules for a view: keep to the body (the shell owns the header, the back
 * link and the actions); read and write through the app's own routes; never
 * require the assistant. The tab ids are the app's own, but "settings" is the
 * one the header's Settings button opens when there is one.
 *
 * Registered today: Storelib Reviews, its managed page (workstream K5,
 * components/reviews/manage/integration-view.tsx): Overview, Reviews,
 * Requests, Widgets, Analytics and Settings, its settings panel and the
 * shell's About and Your data under Settings.
 */
import * as React from "react"
import type { Integration, IntegrationStatus } from "@/lib/integrations/catalog"
import { reviewsIntegrationView } from "@/components/reviews/manage/integration-view"

export interface IntegrationAppTab {
  id: string
  /** Shown as it is: pass words already through tt(). */
  label: string
  /** A small number beside the label (waiting for approval...), or nothing. */
  count?: number | null
}

export interface IntegrationSections {
  setup: React.ReactNode
  status: React.ReactNode | null
  overview: React.ReactNode
  data: React.ReactNode
  glance: React.ReactNode
  danger: React.ReactNode | null
}

export interface IntegrationAppBodyProps {
  tab: string
  setTab: (id: string) => void
  item: Integration
  status: IntegrationStatus
  installed: boolean
  sections: IntegrationSections
  Layout: React.ComponentType<{ main: React.ReactNode; aside?: React.ReactNode }>
  onChanged: (on: boolean) => void
}

export interface IntegrationAppView {
  /** Read when the page draws, so labels can go through tt() in the current language. */
  tabs: () => IntegrationAppTab[]
  defaultTab?: string
  Body: React.ComponentType<IntegrationAppBodyProps>
}

/* Storelib Reviews' managed page (workstream K5): Overview, Reviews, Requests, Widgets, Analytics, Settings. */
const reviewsView: IntegrationAppView = reviewsIntegrationView

export const INTEGRATION_APP_VIEWS: Record<string, IntegrationAppView> = {
  "storelib-reviews": reviewsView,
}

/** Registered at run time instead (a module that loads later): the same shape, and the last one registered wins. */
export function registerIntegrationApp(integrationId: string, view: IntegrationAppView): void {
  INTEGRATION_APP_VIEWS[integrationId] = view
}

export function integrationAppView(integrationId: string | null | undefined): IntegrationAppView | null {
  return (integrationId && INTEGRATION_APP_VIEWS[integrationId]) || null
}

/** The tab an address names, if the view has it; else its default. */
export function tabFor(view: IntegrationAppView, wanted: string | null | undefined): string {
  const tabs = view.tabs()
  if (wanted && tabs.some((t) => t.id === wanted)) return wanted
  return view.defaultTab && tabs.some((t) => t.id === view.defaultTab) ? view.defaultTab : (tabs[0]?.id ?? "")
}
