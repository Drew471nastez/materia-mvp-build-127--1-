"use client"

/**
 * The home page's motion sections (wave 12), each loaded as it comes near the
 * screen (lazySection in ./lazy-section). The heights are what the sections
 * draw at a phone width or more, so the box the server sends holds their
 * place and nothing below jumps when one arrives. `styles` names the
 * stylesheets a section draws itself (<style href precedence>), put in
 * <head> while the browser is idle so that mounting it adds none.
 */

import { lazySection } from "./lazy-section"

export const LazyEverythingInOnePlace = lazySection(() => import("./everything-in-one-place").then((m) => m.EverythingInOnePlace), {
  name: "everything",
  /* Wave 13: four cards in one column below 768px (the first term), two by two above it (the second); the first term drops out above 768px. */
  minHeight: "max(calc(clamp(1900px, 279vw + 1010px, 2215px) - clamp(0px, (100vw - 767px) * 100000, 100000px)), clamp(1110px, 84vw + 305px, 1515px))",
  styles: () => import("./everything-in-one-place").then((m) => m.EVERYTHING_STYLES),
})

export const LazyIdeasComeToLife = lazySection(() => import("./ideas-come-to-life").then((m) => m.IdeasComeToLife), {
  name: "ideas",
  /* Wave 13: a light section whose picture is 16:10 of the width (390:640 on a phone): about 1100px on a phone, 1520px at 1440. */
  minHeight: "clamp(1040px, 640px + 61vw, 1560px)",
  styles: () => import("./ideas-come-to-life").then((m) => m.IDEAS_STYLES),
})

export const LazyBusinessCarousel = lazySection(() => import("./business-carousel").then((m) => m.BusinessCarousel), {
  name: "business",
  /* Wave 13: a 4:3 and a 9:16 card the same height across the width: about 700px on a phone, 1300px at 1440. */
  minHeight: "clamp(700px, 486px + 56.4vw, 1320px)",
  styles: () => import("./business-carousel").then((m) => m.BUSINESS_STYLES),
})

export const LazyCreatorsCarousel = lazySection(() => import("./creators-carousel").then((m) => m.CreatorsCarousel), {
  name: "creators",
  minHeight: "clamp(820px, 100vh, 1100px)",
  styles: () => import("./creators-carousel").then((m) => m.CREATORS_STYLES),
})

export const LazyHowItWorks = lazySection(() => import("./how-it-works").then((m) => m.HowItWorks), {
  name: "how-it-works",
  minHeight: "clamp(900px, 120vh, 1400px)",
  styles: () => import("./how-it-works").then((m) => m.HOW_IT_WORKS_STYLES),
})

export const LazyCheckoutScene = lazySection(() => import("./checkout-scene").then((m) => m.CheckoutScene), {
  name: "checkout",
  minHeight: "clamp(900px, 160vh, 1600px)",
  styles: () => import("./checkout-scene").then((m) => m.CHECKOUT_STYLES),
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
  styles: () => import("./sell-everywhere-map").then((m) => m.SELL_EVERYWHERE_STYLES),
})

export const LazyIntegrationsSection = lazySection(() => import("./integrations-section").then((m) => m.IntegrationsSection), {
  name: "integrations",
  minHeight: "clamp(620px, 80vh, 820px)",
})

export const LazyEarningsCalculator = lazySection(() => import("./earnings-calculator").then((m) => m.EarningsCalculator), {
  name: "earnings",
  minHeight: "clamp(720px, 90vh, 900px)",
  styles: () => import("./earnings-calculator").then((m) => m.EARNINGS_STYLES),
})

export const LazyAppAnywhere = lazySection(() => import("./app-anywhere").then((m) => m.AppAnywhere), {
  name: "app-anywhere",
  minHeight: "clamp(640px, 90vh, 900px)",
})
