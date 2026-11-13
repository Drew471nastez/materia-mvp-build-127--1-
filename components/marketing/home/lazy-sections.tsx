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
  /* Wave 13 perf: measured at 390 to 1920 wide with the one home padding (--home-pad). Below 768px four cards in one column (the first term, which the step drops above 768px); above, two rows of pictures (32vw, 320 to 440px), two paddings, and the heading and captions. */
  minHeight: "max(calc(clamp(1852px, 172vw + 1376px, 2167px) - clamp(0px, (100vw - 767px) * 100000, 100000px)), calc(2 * clamp(320px, 32vw, 440px) + 2 * clamp(48px, 5.6vw, 80px) + clamp(340px, 6.8vw + 280px, 380px)))",
  styles: () => import("./everything-in-one-place").then((m) => m.EVERYTHING_STYLES),
})

export const LazyIdeasComeToLife = lazySection(() => import("./ideas-come-to-life").then((m) => m.IdeasComeToLife), {
  name: "ideas",
  /* Wave 13 perf: measured 937px at 390, 735 at 768, 924 at 1024, 1222 at 1440, 1210 at 1920 (the picture is taller on a phone, below 768px). */
  minHeight: "max(calc(125.5vw + 448px - clamp(0px, (100vw - 767px) * 100000, 100000px)), min(78vw + 135px, 1214px))",
  styles: () => import("./ideas-come-to-life").then((m) => m.IDEAS_STYLES),
})

export const LazyBusinessCarousel = lazySection(() => import("./business-carousel").then((m) => m.BusinessCarousel), {
  name: "business",
  /* Wave 13 perf: measured 546px at 390, 587 at 768, 746 at 1024, 997 at 1440, 987 at 1920. */
  minHeight: "clamp(540px, 65vw + 88px, 992px)",
  styles: () => import("./business-carousel").then((m) => m.BUSINESS_STYLES),
})

export const LazyCreatorsCarousel = lazySection(() => import("./creators-carousel").then((m) => m.CreatorsCarousel), {
  name: "creators",
  /* Wave 13 perf: measured 812px at 390, 798 at 768, 784 at 1024, 959 at 1440 and 1920. */
  minHeight: "clamp(815px, 45vw + 311px, 959px)",
  styles: () => import("./creators-carousel").then((m) => m.CREATORS_STYLES),
})

export const LazyHowItWorks = lazySection(() => import("./how-it-works").then((m) => m.HowItWorks), {
  name: "how-it-works",
  /* Wave 13 perf: one column below 640px (2718px at 390), two to 1023px (1590), three from 1024 (1219 at 1024, 1385 at 1440, 1418 at 1920). */
  minHeight: "max(calc(3038px - 82vw - clamp(0px, (100vw - 639px) * 100000, 100000px)), calc(1590px - clamp(0px, (100vw - 1023px) * 100000, 100000px)), min(36vw + 850px, 1418px))",
  styles: () => import("./how-it-works").then((m) => m.HOW_IT_WORKS_STYLES),
})

export const LazyCheckoutScene = lazySection(() => import("./checkout-scene").then((m) => m.CheckoutScene), {
  name: "checkout",
  /* Wave 13 perf: the pinned scene and the tabs under it, one column below 900px (961px at 390, 1144 at 768), beside each other from 900 (679 at 1024, 862 at 1440). Wave 14: the pin is 150vh (was 170vh), so the scene is 100svh + 150vh. */
  minHeight: "calc(250vh + max(calc(48.4vw + 772px - clamp(0px, (100vw - 899px) * 100000, 100000px)), min(46vw + 240px, 860px)))",
  styles: () => import("./checkout-scene").then((m) => m.CHECKOUT_STYLES),
})

export const LazyAudienceOwnership = lazySection(() => import("./audience-ownership").then((m) => m.AudienceOwnership), {
  name: "audience",
  /* Wave 13 perf: the cards stack below 1024px (2474px at 390, 2261 at 768); beside each other from 1024 (1414 at 1024, 1524 at 1440, 1483 at 1920). */
  minHeight: "max(calc(2600px - 40vw - clamp(0px, (100vw - 1023px) * 100000, 100000px)), clamp(1415px, 68vw + 545px, 1500px))",
})

export const LazyAnalyticsShowcase = lazySection(() => import("./analytics-showcase").then((m) => m.AnalyticsShowcase), {
  name: "analytics",
  /* Wave 13 perf: measured 1481px at 390, 1644 at 768, 1101 at 1024, 1383 at 1440, 1424 at 1920. */
  minHeight: "max(calc(min(100vw + 1090px, 1660px) - clamp(0px, (100vw - 1023px) * 100000, 100000px)), min(70vw + 380px, 1424px))",
})

export const LazySellEverywhereMap = lazySection(() => import("./sell-everywhere-map").then((m) => m.SellEverywhereMap), {
  name: "sell-everywhere",
  /* Wave 13 perf: measured 1083px at 390, 1163 at 768, 952 at 1024, 1053 at 1440, 1062 at 1920. */
  minHeight: "max(calc(22vw + 1000px - clamp(0px, (100vw - 1023px) * 100000, 100000px)), min(26vw + 686px, 1062px))",
  styles: () => import("./sell-everywhere-map").then((m) => m.SELL_EVERYWHERE_STYLES),
})

export const LazyIntegrationsSection = lazySection(() => import("./integrations-section").then((m) => m.IntegrationsSection), {
  name: "integrations",
  /* Wave 13 perf: measured 538px at 390, 610 at 768, 642 at 1024, 710 at 1440, 715 at 1920. */
  minHeight: "clamp(536px, 16.5vw + 472px, 715px)",
})

export const LazyEarningsCalculator = lazySection(() => import("./earnings-calculator").then((m) => m.EarningsCalculator), {
  name: "earnings",
  /* Wave 13 perf: one column below 900px (1471px at 390, 1330 at 768), two from 900 (844 at 1024, 937 at 1440, 1024 at 1920). */
  minHeight: "max(calc(1600px - 35vw - clamp(0px, (100vw - 899px) * 100000, 100000px)), clamp(845px, 30vw + 520px, 1024px))",
  styles: () => import("./earnings-calculator").then((m) => m.EARNINGS_STYLES),
})

export const LazyAppAnywhere = lazySection(() => import("./app-anywhere").then((m) => m.AppAnywhere), {
  name: "app-anywhere",
  /* Wave 13 perf: one column below 1024px (877px at 390, 1072 at 768), two from 1024 (695 at 1024, 810 at 1440, 823 at 1920). */
  minHeight: "max(calc(58vw + 651px - clamp(0px, (100vw - 1023px) * 100000, 100000px)), min(30vw + 380px, 823px))",
})
