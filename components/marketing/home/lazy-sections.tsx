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
  minHeight: "var(--lz, max(calc(clamp(1852px, 172vw + 1376px, 2167px) - clamp(0px, (100vw - 767px) * 100000, 100000px)), calc(2 * clamp(320px, 32vw, 440px) + 2 * clamp(48px, 5.6vw, 80px) + clamp(340px, 6.8vw + 280px, 380px))))",
  styles: () => import("./everything-in-one-place").then((m) => m.EVERYTHING_STYLES),
})

export const LazyIdeasComeToLife = lazySection(() => import("./ideas-come-to-life").then((m) => m.IdeasComeToLife), {
  name: "ideas",
  /* Wave 13 perf: measured 937px at 390, 735 at 768, 924 at 1024, 1222 at 1440, 1210 at 1920 (the picture is taller on a phone, below 768px). */
  minHeight: "var(--lz, max(calc(125.5vw + 448px - clamp(0px, (100vw - 767px) * 100000, 100000px)), min(78vw + 135px, 1214px)))",
  styles: () => import("./ideas-come-to-life").then((m) => m.IDEAS_STYLES),
})

export const LazyBusinessCarousel = lazySection(() => import("./business-carousel").then((m) => m.BusinessCarousel), {
  name: "business",
  /* Wave 13 perf: measured 546px at 390, 587 at 768, 746 at 1024, 997 at 1440, 987 at 1920. */
  minHeight: "var(--lz, clamp(540px, 65vw + 88px, 992px))",
  styles: () => import("./business-carousel").then((m) => m.BUSINESS_STYLES),
})

export const LazyCreatorsCarousel = lazySection(() => import("./creators-carousel").then((m) => m.CreatorsCarousel), {
  name: "creators",
  /* Wave 13 perf: measured 812px at 390, 798 at 768, 784 at 1024, 959 at 1440 and 1920. */
  minHeight: "var(--lz, clamp(815px, 45vw + 311px, 959px))",
  styles: () => import("./creators-carousel").then((m) => m.CREATORS_STYLES),
})

export const LazyHowItWorks = lazySection(() => import("./how-it-works").then((m) => m.HowItWorks), {
  name: "how-it-works",
  /* Wave 13 perf: one column below 640px (2718px at 390), two to 1023px (1590), three from 1024 (1219 at 1024, 1385 at 1440, 1418 at 1920). */
  minHeight: "var(--lz, max(calc(3038px - 82vw - clamp(0px, (100vw - 639px) * 100000, 100000px)), calc(1590px - clamp(0px, (100vw - 1023px) * 100000, 100000px)), min(36vw + 850px, 1418px)))",
  styles: () => import("./how-it-works").then((m) => m.HOW_IT_WORKS_STYLES),
})

export const LazyCheckoutScene = lazySection(() => import("./checkout-scene").then((m) => m.CheckoutScene), {
  name: "checkout",
  /* The pinned scene (100svh + 150vh) and the tabs under it, one column below 900px, beside each other from 900. A guess: LAZY_SECTION_HEIGHTS_CSS below has the measured heights. */
  minHeight: "var(--lz, calc(250vh + max(calc(48.4vw + 772px - clamp(0px, (100vw - 899px) * 100000, 100000px)), min(46vw + 240px, 860px))))",
  styles: () => import("./checkout-scene").then((m) => m.CHECKOUT_STYLES),
})

export const LazyAudienceOwnership = lazySection(() => import("./audience-ownership").then((m) => m.AudienceOwnership), {
  name: "audience",
  /* Wave 13 perf: the cards stack below 1024px (2474px at 390, 2261 at 768); beside each other from 1024 (1414 at 1024, 1524 at 1440, 1483 at 1920). */
  minHeight: "var(--lz, max(calc(2600px - 40vw - clamp(0px, (100vw - 1023px) * 100000, 100000px)), clamp(1415px, 68vw + 545px, 1500px)))",
})

export const LazyAnalyticsShowcase = lazySection(() => import("./analytics-showcase").then((m) => m.AnalyticsShowcase), {
  name: "analytics",
  /* Wave 13 perf: measured 1481px at 390, 1644 at 768, 1101 at 1024, 1383 at 1440, 1424 at 1920. */
  minHeight: "var(--lz, max(calc(min(100vw + 1090px, 1660px) - clamp(0px, (100vw - 1023px) * 100000, 100000px)), min(70vw + 380px, 1424px)))",
})

export const LazySellEverywhereMap = lazySection(() => import("./sell-everywhere-map").then((m) => m.SellEverywhereMap), {
  name: "sell-everywhere",
  /* Wave 13 perf: measured 1083px at 390, 1163 at 768, 952 at 1024, 1053 at 1440, 1062 at 1920. */
  minHeight: "var(--lz, max(calc(22vw + 1000px - clamp(0px, (100vw - 1023px) * 100000, 100000px)), min(26vw + 686px, 1062px)))",
  styles: () => import("./sell-everywhere-map").then((m) => m.SELL_EVERYWHERE_STYLES),
})

export const LazyIntegrationsSection = lazySection(() => import("./integrations-section").then((m) => m.IntegrationsSection), {
  name: "integrations",
  /* Wave 13 perf: measured 538px at 390, 610 at 768, 642 at 1024, 710 at 1440, 715 at 1920. */
  minHeight: "var(--lz, clamp(536px, 16.5vw + 472px, 715px))",
})

export const LazyAiToolsSection = lazySection(() => import("./ai-tools-section").then((m) => m.AiToolsSection), {
  name: "ai-tools",
  /* Landing round: measured 931px at 390 and 939 at 768 (the terminal under the words), 698 at 1024, 780 at 1440 and 782 at 1920 (beside them). */
  minHeight: "var(--lz, max(calc(923px + 2vw - clamp(0px, (100vw - 1023px) * 100000, 100000px)), min(19.7vw + 496px, 782px)))",
  styles: () => import("./ai-tools-section").then((m) => m.AI_TOOLS_STYLES),
})

export const LazyEarningsCalculator = lazySection(() => import("./earnings-calculator").then((m) => m.EarningsCalculator), {
  name: "earnings",
  /* Landing round (the photo): one column below 900px (1613px at 390 and 768), the photo a band over two columns to 1279 (1138 at 1024), three columns from 1280 (901 at 1440, 988 at 1920). */
  minHeight: "var(--lz, max(calc(1613px - clamp(0px, (100vw - 899px) * 100000, 100000px)), calc(831px + min(30vw, 320px) - clamp(0px, (100vw - 1279px) * 100000, 100000px)), min(640px + 18.1vw, 988px)))",
  styles: () => import("./earnings-calculator").then((m) => m.EARNINGS_STYLES),
})

export const LazyAppAnywhere = lazySection(() => import("./app-anywhere").then((m) => m.AppAnywhere), {
  name: "app-anywhere",
  /* Landing round (the shorter line): one column below 1024px (826px at 390, 1047 at 768), two from 1024 (644 at 1024, 779 at 1440, 792 at 1920). */
  minHeight: "var(--lz, max(calc(58vw + 600px - clamp(0px, (100vw - 1023px) * 100000, 100000px)), min(30vw + 348px, 792px)))",
})

/*
  EACH PLACEHOLDER AT THE SECTION'S MEASURED HEIGHT (landing round). The
  formulas above are each section's guess; this sets --lz per section and
  screen width from heights read off a production build in a real browser
  at 18 widths: the usual phones (360, 390, 430) and laptops, and both sides
  of every width where a layout changes (640, 768, 900, 1024, 1280, 1536).
  Between two measured widths the height is a straight line, and a wider
  rule is written only where the line changes; checkout's part that follows
  the screen's height (100svh + 150vh, its scroll track) is kept as that.
  So a section mounting off screen does not change the page's length. The
  page draws it once (app/(storelib)/(marketing)/page.tsx); without it the
  formulas apply.

  Written by scripts/measure-home-lazy-heights.mjs, never by hand: run it
  again when a section's height changes.
*/
export const LAZY_SECTION_HEIGHTS_CSS = '[data-lazy-section="everything"]{--lz:calc(1319px + 186.667vw)}[data-lazy-section="ideas"]{--lz:calc(180px + 136.667vw)}[data-lazy-section="business"]{--lz:calc(354px + 93.333vw)}[data-lazy-section="creators"]{--lz:calc(825px - 50vw)}[data-lazy-section="how-it-works"]{--lz:calc(3142px - 130vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 1081px - 50vw)}[data-lazy-section="audience"]{--lz:calc(3149px - 216.667vw)}[data-lazy-section="analytics"]{--lz:calc(3130px - 376.667vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(1157px - 70vw)}[data-lazy-section="integrations"]{--lz:394px}[data-lazy-section="ai-tools"]{--lz:calc(1711px - 200vw)}[data-lazy-section="earnings"]{--lz:calc(2302px - 176.667vw)}[data-lazy-section="app-anywhere"]{--lz:calc(553px + 70vw)}@media (min-width:391px){[data-lazy-section="everything"]{--lz:calc(925.8px + 287.5vw)}[data-lazy-section="creators"]{--lz:calc(503.3px + 32.5vw)}[data-lazy-section="how-it-works"]{--lz:calc(3044.5px - 105vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 574px + 80vw)}[data-lazy-section="audience"]{--lz:calc(2538px - 60vw)}[data-lazy-section="analytics"]{--lz:calc(1612.3px + 12.5vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(923px - 10vw)}[data-lazy-section="integrations"]{--lz:calc(335.5px + 15vw)}[data-lazy-section="ai-tools"]{--lz:calc(1184.5px - 65vw)}[data-lazy-section="earnings"]{--lz:calc(1340px + 70vw)}[data-lazy-section="app-anywhere"]{--lz:calc(514px + 80vw)}}@media (min-width:431px){[data-lazy-section="everything"]{--lz:calc(2151.7px + 2.392vw)}[data-lazy-section="ideas"]{--lz:calc(345.2px + 98.086vw)}[data-lazy-section="business"]{--lz:calc(443.3px + 72.249vw)}[data-lazy-section="creators"]{--lz:643px}[data-lazy-section="how-it-works"]{--lz:calc(2700px - 24.88vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 691.7px + 52.632vw)}[data-lazy-section="audience"]{--lz:calc(2419.9px - 32.536vw)}[data-lazy-section="analytics"]{--lz:calc(1760.6px - 22.01vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(742.2px + 32.057vw)}[data-lazy-section="integrations"]{--lz:calc(465.8px - 15.311vw)}[data-lazy-section="ai-tools"]{--lz:calc(972.9px - 15.789vw)}[data-lazy-section="earnings"]{--lz:calc(1614.3px + 6.22vw)}[data-lazy-section="app-anywhere"]{--lz:calc(532.9px + 75.598vw)}}@media (min-width:640px){[data-lazy-section="ideas"]{--lz:calc(237.3px + 114.961vw)}[data-lazy-section="business"]{--lz:calc(684.3px + 34.646vw)}[data-lazy-section="creators"]{--lz:calc(602.7px + 6.299vw)}[data-lazy-section="how-it-works"]{--lz:calc(1838.9px - 37.795vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 593.6px + 67.717vw)}[data-lazy-section="audience"]{--lz:calc(2931.6px - 92.126vw)}[data-lazy-section="analytics"]{--lz:1715px}[data-lazy-section="sell-everywhere"]{--lz:calc(742.3px + 33.071vw)}[data-lazy-section="integrations"]{--lz:442px}[data-lazy-section="ai-tools"]{--lz:calc(872.6px + 8.661vw)}[data-lazy-section="earnings"]{--lz:calc(1906px - 39.37vw)}[data-lazy-section="app-anywhere"]{--lz:calc(601.7px + 66.142vw)}}@media (min-width:768px){[data-lazy-section="everything"]{--lz:calc(1264.7px - 23.664vw)}[data-lazy-section="ideas"]{--lz:calc(86.4px + 63.359vw)}[data-lazy-section="business"]{--lz:calc(327.6px + 80.916vw)}[data-lazy-section="creators"]{--lz:calc(463.6px + 19.847vw)}[data-lazy-section="how-it-works"]{--lz:calc(1549.9px - 0.763vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 521.9px + 77.099vw)}[data-lazy-section="audience"]{--lz:calc(2297.9px - 28.244vw)}[data-lazy-section="analytics"]{--lz:calc(1581.6px + 9.16vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(588.1px + 45.038vw)}[data-lazy-section="integrations"]{--lz:calc(361.6px + 9.16vw)}[data-lazy-section="ai-tools"]{--lz:calc(804.2px + 17.557vw)}[data-lazy-section="earnings"]{--lz:calc(1396.1px + 28.244vw)}[data-lazy-section="app-anywhere"]{--lz:calc(472.5px + 74.809vw)}}@media (min-width:900px){[data-lazy-section="everything"]{--lz:calc(737.4px + 34.959vw)}[data-lazy-section="ideas"]{--lz:calc(-8.9px + 73.984vw)}[data-lazy-section="business"]{--lz:calc(933.3px - 16.26vw)}[data-lazy-section="creators"]{--lz:calc(400.5px + 26.829vw)}[data-lazy-section="how-it-works"]{--lz:calc(1484.5px + 6.504vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 260.4px + 37.398vw)}[data-lazy-section="audience"]{--lz:calc(1868.4px + 19.512vw)}[data-lazy-section="analytics"]{--lz:calc(1832.3px - 18.699vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(510.1px + 53.659vw)}[data-lazy-section="integrations"]{--lz:calc(297.7px + 16.26vw)}[data-lazy-section="ai-tools"]{--lz:calc(662px + 33.333vw)}[data-lazy-section="earnings"]{--lz:calc(1103.7px + 3.252vw)}[data-lazy-section="app-anywhere"]{--lz:calc(399.7px + 82.927vw)}}@media (min-width:1024px){[data-lazy-section="everything"]{--lz:calc(180.4px + 89.412vw)}[data-lazy-section="ideas"]{--lz:calc(-38.1px + 76.863vw)}[data-lazy-section="business"]{--lz:calc(477.9px + 28.235vw)}[data-lazy-section="creators"]{--lz:calc(189.4px + 39.608vw)}[data-lazy-section="how-it-works"]{--lz:calc(765.5px + 37.647vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 53.7px + 57.647vw)}[data-lazy-section="audience"]{--lz:calc(1159.6px + 10.98vw)}[data-lazy-section="analytics"]{--lz:calc(588.2px + 44.314vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(217.1px + 48.235vw)}[data-lazy-section="ai-tools"]{--lz:calc(493.2px + 20vw)}[data-lazy-section="earnings"]{--lz:calc(776.6px + 35.294vw)}[data-lazy-section="app-anywhere"]{--lz:calc(302.7px + 33.333vw)}}@media (min-width:1280px){[data-lazy-section="everything"]{--lz:calc(573px + 58.75vw)}[data-lazy-section="ideas"]{--lz:calc(225px + 56.25vw)}[data-lazy-section="business"]{--lz:calc(-121px + 75vw)}[data-lazy-section="creators"]{--lz:calc(153px + 42.5vw)}[data-lazy-section="how-it-works"]{--lz:calc(504px + 58.125vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 520px + 21.25vw)}[data-lazy-section="audience"]{--lz:calc(468px + 65vw)}[data-lazy-section="analytics"]{--lz:calc(883px + 21.25vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(554px + 21.875vw)}[data-lazy-section="earnings"]{--lz:calc(1081px - 12.5vw)}[data-lazy-section="app-anywhere"]{--lz:calc(338px + 30.625vw)}}@media (min-width:1441px){[data-lazy-section="everything"]{--lz:1419px}[data-lazy-section="ideas"]{--lz:calc(1141.1px - 7.368vw)}[data-lazy-section="business"]{--lz:959px}[data-lazy-section="creators"]{--lz:765px}[data-lazy-section="how-it-works"]{--lz:calc(1204.6px + 9.474vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 826px)}[data-lazy-section="audience"]{--lz:calc(1616.2px - 14.737vw)}[data-lazy-section="analytics"]{--lz:calc(1052.6px + 9.474vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(732.6px + 9.474vw)}[data-lazy-section="integrations"]{--lz:calc(456.2px + 5.263vw)}[data-lazy-section="ai-tools"]{--lz:calc(749.7px + 2.105vw)}[data-lazy-section="earnings"]{--lz:calc(-417.7px + 91.579vw)}[data-lazy-section="app-anywhere"]{--lz:calc(581.9px + 13.684vw)}}@media (min-width:1536px){[data-lazy-section="ideas"]{--lz:calc(1048px - 1.302vw)}[data-lazy-section="how-it-works"]{--lz:1350px}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 842px - 1.042vw)}[data-lazy-section="audience"]{--lz:1390px}[data-lazy-section="analytics"]{--lz:1198px}[data-lazy-section="sell-everywhere"]{--lz:878px}[data-lazy-section="integrations"]{--lz:537px}[data-lazy-section="ai-tools"]{--lz:782px}[data-lazy-section="earnings"]{--lz:988px}[data-lazy-section="app-anywhere"]{--lz:792px}}@media (min-width:1921px){[data-lazy-section="ideas"]{--lz:1023px}[data-lazy-section="checkout"]{--lz:calc(100svh + 150vh + 822px)}}'
