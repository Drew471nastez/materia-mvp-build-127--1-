"use client"

/**
 * The home page's motion sections (wave 12), each loaded as it comes near the
 * screen (lazySection in ./lazy-section). The heights are what the sections
 * draw at a phone width or more, so the box the server sends holds their
 * place and nothing below jumps when one arrives.
 */

import { lazySection } from "./lazy-section"

export const LazyEverythingInOnePlace = lazySection(() => import("./everything-in-one-place").then((m) => m.EverythingInOnePlace), {
  name: "everything",
  minHeight: "clamp(640px, 90vh, 900px)",
})

export const LazyIdeasComeToLife = lazySection(() => import("./ideas-come-to-life").then((m) => m.IdeasComeToLife), {
  name: "ideas",
  minHeight: "clamp(760px, 110vh, 1100px)",
})

export const LazyBusinessCarousel = lazySection(() => import("./business-carousel").then((m) => m.BusinessCarousel), {
  name: "business",
  minHeight: "clamp(760px, 100vh, 1000px)",
})

export const LazyCreatorsCarousel = lazySection(() => import("./creators-carousel").then((m) => m.CreatorsCarousel), {
  name: "creators",
  minHeight: "clamp(820px, 100vh, 1100px)",
})

export const LazyHowItWorks = lazySection(() => import("./how-it-works").then((m) => m.HowItWorks), {
  name: "how-it-works",
  minHeight: "clamp(900px, 120vh, 1400px)",
})

export const LazyCheckoutScene = lazySection(() => import("./checkout-scene").then((m) => m.CheckoutScene), {
  name: "checkout",
  minHeight: "clamp(900px, 160vh, 1600px)",
})

export const LazyAudienceOwnership = lazySection(() => import("./audience-ownership").then((m) => m.AudienceOwnership), {
  name: "audience",
  minHeight: "clamp(760px, 100vh, 1000px)",
})

export const LazyAnalyticsShowcase = lazySection(() => import("./analytics-showcase").then((m) => m.AnalyticsShowcase), {
  name: "analytics",
  minHeight: "clamp(900px, 110vh, 1200px)",
})

export const LazySellEverywhereMap = lazySection(() => import("./sell-everywhere-map").then((m) => m.SellEverywhereMap), {
  name: "sell-everywhere",
  minHeight: "clamp(720px, 100vh, 1000px)",
})

export const LazyIntegrationsSection = lazySection(() => import("./integrations-section").then((m) => m.IntegrationsSection), {
  name: "integrations",
  minHeight: "clamp(620px, 80vh, 820px)",
})

export const LazyEarningsCalculator = lazySection(() => import("./earnings-calculator").then((m) => m.EarningsCalculator), {
  name: "earnings",
  minHeight: "clamp(720px, 90vh, 900px)",
})

export const LazyAppAnywhere = lazySection(() => import("./app-anywhere").then((m) => m.AppAnywhere), {
  name: "app-anywhere",
  minHeight: "clamp(640px, 90vh, 900px)",
})
