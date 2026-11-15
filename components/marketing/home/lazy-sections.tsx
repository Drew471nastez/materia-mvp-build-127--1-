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

/* Landing round 8, the owner: "Keep the One store for everything you sell section, of course." Back, redesigned (business-carousel.tsx). A guess until the heights are measured again: about 1066px at 390, 1140 at 1440. */
export const LazyBusinessCarousel = lazySection(() => import("./business-carousel").then((m) => m.BusinessCarousel), {
  name: "business",
  minHeight: "var(--lz, max(calc(150vw + 480px - clamp(0px, (100vw - 767px) * 100000, 100000px)), min(46vw + 470px, 1320px)))",
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
  at 20 widths: the usual phones (360, 390, 430) and laptops, and both sides
  of every width where a layout changes (640, 768, 900, 1024, 1180, 1280, 1536).
  Between two measured widths the height is a straight line, and a wider
  rule is written only where the line changes; checkout's part that follows
  the screen's height (100svh + 150vh, its scroll track) is kept as that.
  So a section mounting off screen does not change the page's length. The
  page draws it once (app/(storelib)/(marketing)/page.tsx); without it the
  formulas apply.

  Written by scripts/measure-home-lazy-heights.mjs, never by hand: run it
  again when a section's height changes.
*/
export const LAZY_SECTION_HEIGHTS_CSS = '[data-lazy-section="everything"]{--lz:calc(1619px + 110vw)}[data-lazy-section="ideas"]{--lz:calc(561px - 10vw)}[data-lazy-section="creators"]{--lz:calc(825px - 50vw)}[data-lazy-section="how-it-works"]{--lz:calc(1774px + 113.333vw)}[data-lazy-section="checkout"]{--lz:calc(125svh + 949px - 23.333vw)}[data-lazy-section="audience"]{--lz:1176px}[data-lazy-section="analytics"]{--lz:calc(2646px - 230vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(1041px - 70vw)}[data-lazy-section="integrations"]{--lz:394px}[data-lazy-section="ai-tools"]{--lz:calc(1711px - 200vw)}[data-lazy-section="earnings"]{--lz:calc(989px + 63.333vw)}[data-lazy-section="app-anywhere"]{--lz:calc(532px + 76.667vw)}@media (min-width:391px){[data-lazy-section="everything"]{--lz:calc(702.5px + 345vw)}[data-lazy-section="ideas"]{--lz:calc(239.3px + 72.5vw)}[data-lazy-section="creators"]{--lz:calc(503.3px + 32.5vw)}[data-lazy-section="how-it-works"]{--lz:calc(1436px + 200vw)}[data-lazy-section="checkout"]{--lz:calc(125svh + 419.3px + 112.5vw)}[data-lazy-section="audience"]{--lz:calc(1332px - 40vw)}[data-lazy-section="analytics"]{--lz:calc(1934.3px - 47.5vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(495px + 70vw)}[data-lazy-section="integrations"]{--lz:calc(335.5px + 15vw)}[data-lazy-section="ai-tools"]{--lz:calc(1184.5px - 65vw)}[data-lazy-section="earnings"]{--lz:calc(963px + 70vw)}[data-lazy-section="app-anywhere"]{--lz:calc(509.3px + 82.5vw)}}@media (min-width:431px){[data-lazy-section="everything"]{--lz:calc(2103.7px + 19.139vw)}[data-lazy-section="ideas"]{--lz:calc(396.7px + 35.885vw)}[data-lazy-section="creators"]{--lz:643px}[data-lazy-section="how-it-works"]{--lz:calc(2417.4px - 28.23vw)}[data-lazy-section="checkout"]{--lz:calc(125svh + 524.4px + 88.038vw)}[data-lazy-section="audience"]{--lz:calc(1164.1px - 0.957vw)}[data-lazy-section="analytics"]{--lz:calc(1869.9px - 32.536vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(559.4px + 55.024vw)}[data-lazy-section="integrations"]{--lz:calc(465.8px - 15.311vw)}[data-lazy-section="ai-tools"]{--lz:calc(972.9px - 15.789vw)}[data-lazy-section="earnings"]{--lz:calc(1204.3px + 13.876vw)}[data-lazy-section="app-anywhere"]{--lz:calc(532.8px + 77.033vw)}}@media (min-width:640px){[data-lazy-section="everything"]{--lz:calc(2387.3px - 25.197vw)}[data-lazy-section="ideas"]{--lz:calc(288.4px + 52.756vw)}[data-lazy-section="creators"]{--lz:calc(602.7px + 6.299vw)}[data-lazy-section="how-it-works"]{--lz:calc(2216.8px + 3.15vw)}[data-lazy-section="checkout"]{--lz:calc(125svh + 437.9px + 101.575vw)}[data-lazy-section="audience"]{--lz:calc(1389.8px - 36.22vw)}[data-lazy-section="analytics"]{--lz:1710px}[data-lazy-section="sell-everywhere"]{--lz:calc(653px + 40.945vw)}[data-lazy-section="integrations"]{--lz:448px}[data-lazy-section="ai-tools"]{--lz:calc(872.6px + 8.661vw)}[data-lazy-section="earnings"]{--lz:calc(1545px - 39.37vw)}[data-lazy-section="app-anywhere"]{--lz:calc(599.6px + 67.717vw)}}@media (min-width:768px){[data-lazy-section="everything"]{--lz:calc(1276.7px - 23.664vw)}[data-lazy-section="ideas"]{--lz:calc(193.7px + 64.885vw)}[data-lazy-section="creators"]{--lz:calc(463.6px + 19.847vw)}[data-lazy-section="how-it-works"]{--lz:calc(1193.9px - 0.763vw)}[data-lazy-section="checkout"]{--lz:calc(125svh + 385.5px + 108.397vw)}[data-lazy-section="audience"]{--lz:calc(977.9px + 16.031vw)}[data-lazy-section="analytics"]{--lz:calc(1576.6px + 9.16vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(635.3px + 35.115vw)}[data-lazy-section="integrations"]{--lz:calc(367.6px + 9.16vw)}[data-lazy-section="ai-tools"]{--lz:calc(804.2px + 17.557vw)}[data-lazy-section="earnings"]{--lz:calc(1087.8px + 21.374vw)}[data-lazy-section="app-anywhere"]{--lz:calc(476.6px + 75.573vw)}}@media (min-width:900px){[data-lazy-section="everything"]{--lz:calc(603px + 51.22vw)}[data-lazy-section="ideas"]{--lz:calc(104.8px + 74.797vw)}[data-lazy-section="creators"]{--lz:calc(400.5px + 26.829vw)}[data-lazy-section="how-it-works"]{--lz:calc(906.9px + 28.455vw)}[data-lazy-section="checkout"]{--lz:calc(125svh + 120.8px + 56.911vw)}[data-lazy-section="audience"]{--lz:calc(925.4px + 21.951vw)}[data-lazy-section="analytics"]{--lz:calc(1505.3px + 17.073vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(395.9px + 61.789vw)}[data-lazy-section="integrations"]{--lz:calc(303.7px + 16.26vw)}[data-lazy-section="ai-tools"]{--lz:calc(662px + 33.333vw)}[data-lazy-section="earnings"]{--lz:calc(411.9px + 59.35vw)}[data-lazy-section="app-anywhere"]{--lz:calc(396px + 84.553vw)}}@media (min-width:1024px){[data-lazy-section="everything"]{--lz:calc(189.9px + 91.613vw)}[data-lazy-section="creators"]{--lz:calc(251.5px + 33.548vw)}[data-lazy-section="how-it-works"]{--lz:calc(662.9px + 52.258vw)}[data-lazy-section="checkout"]{--lz:calc(125svh + 101.8px + 58.71vw)}[data-lazy-section="audience"]{--lz:calc(604.7px + 10.968vw)}[data-lazy-section="analytics"]{--lz:calc(440.8px + 58.71vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(70.2px + 62.581vw)}[data-lazy-section="ai-tools"]{--lz:calc(493.2px + 20vw)}[data-lazy-section="earnings"]{--lz:calc(629.2px + 38.065vw)}[data-lazy-section="app-anywhere"]{--lz:calc(333.5px + 30.323vw)}}@media (min-width:1180px){[data-lazy-section="ideas"]{--lz:calc(82.1px + 76.768vw)}[data-lazy-section="creators"]{--lz:calc(63px + 49.495vw)}[data-lazy-section="how-it-works"]{--lz:calc(171.5px + 93.939vw)}[data-lazy-section="analytics"]{--lz:calc(870.8px + 22.222vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(498.1px + 26.263vw)}[data-lazy-section="earnings"]{--lz:calc(768.1px + 26.263vw)}[data-lazy-section="app-anywhere"]{--lz:calc(251px + 37.374vw)}}@media (min-width:1280px){[data-lazy-section="everything"]{--lz:calc(242px + 87.5vw)}[data-lazy-section="ideas"]{--lz:calc(161px + 70.625vw)}[data-lazy-section="creators"]{--lz:calc(153px + 42.5vw)}[data-lazy-section="how-it-works"]{--lz:calc(574px + 62.5vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(554px + 21.875vw)}[data-lazy-section="integrations"]{--lz:calc(290px + 17.5vw)}[data-lazy-section="earnings"]{--lz:calc(528px + 18.125vw)}[data-lazy-section="app-anywhere"]{--lz:calc(338px + 30.625vw)}}@media (min-width:1441px){[data-lazy-section="everything"]{--lz:calc(562.2px + 65.263vw)}[data-lazy-section="ideas"]{--lz:calc(420.1px + 52.632vw)}[data-lazy-section="creators"]{--lz:765px}[data-lazy-section="how-it-works"]{--lz:1474px}[data-lazy-section="checkout"]{--lz:calc(125svh + 205.3px + 51.579vw)}[data-lazy-section="audience"]{--lz:762px}[data-lazy-section="analytics"]{--lz:calc(1052.6px + 9.474vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(732.6px + 9.474vw)}[data-lazy-section="integrations"]{--lz:calc(466.2px + 5.263vw)}[data-lazy-section="ai-tools"]{--lz:calc(749.7px + 2.105vw)}[data-lazy-section="earnings"]{--lz:calc(-529.7px + 91.579vw)}[data-lazy-section="app-anywhere"]{--lz:calc(581.9px + 13.684vw)}}@media (min-width:1536px){[data-lazy-section="everything"]{--lz:calc(661px + 58.854vw)}[data-lazy-section="ideas"]{--lz:calc(349px + 57.292vw)}[data-lazy-section="checkout"]{--lz:calc(125svh + 213px + 51.042vw)}[data-lazy-section="analytics"]{--lz:1198px}[data-lazy-section="sell-everywhere"]{--lz:878px}[data-lazy-section="integrations"]{--lz:calc(383px + 10.677vw)}[data-lazy-section="ai-tools"]{--lz:782px}[data-lazy-section="earnings"]{--lz:876px}[data-lazy-section="app-anywhere"]{--lz:calc(512px + 18.229vw)}}@media (min-width:1921px){[data-lazy-section="everything"]{--lz:1791px}[data-lazy-section="ideas"]{--lz:calc(1275px + 9.063vw)}[data-lazy-section="checkout"]{--lz:calc(125svh + 1037px + 8.125vw)}[data-lazy-section="integrations"]{--lz:calc(537px + 2.656vw)}[data-lazy-section="app-anywhere"]{--lz:calc(736px + 6.563vw)}}@media (min-width:2561px){[data-lazy-section="ideas"]{--lz:1507px}[data-lazy-section="checkout"]{--lz:calc(125svh + 1245px)}[data-lazy-section="integrations"]{--lz:605px}[data-lazy-section="app-anywhere"]{--lz:904px}}'
