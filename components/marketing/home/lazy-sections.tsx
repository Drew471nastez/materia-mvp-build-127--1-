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

/* Landing round 8, the owner: "Keep the One store for everything you sell section, of course." Back, redesigned (business-carousel.tsx). Measured in dev: 869px at 390, 965 at 1280, 1065 at 1440, 1137 at 1600, 1295 at 1920 (the stage is 400:640 below 768px, 2:1 from 768). Not yet in LAZY_SECTION_HEIGHTS_CSS. */
export const LazyBusinessCarousel = lazySection(() => import("./business-carousel").then((m) => m.BusinessCarousel), {
  name: "business",
  minHeight: "var(--lz, max(calc(160vw + 245px - clamp(0px, (100vw - 767px) * 100000, 100000px)), min(55vw + 270px, 1300px)))",
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

/*
  Landing round 14, the owner: "See what your work could earn" is not on a phone (below 768px); a computer keeps it.
  Its box is display: none there, so it holds no room before or after it mounts, and the page draws this rule beside
  LAZY_SECTION_HEIGHTS_CSS, from the server's first byte. Measured at a phone width the section is 0px tall.
*/
export const LAZY_SECTION_PHONE_HIDDEN_CSS = '@media (max-width:767px){[data-lazy-section="earnings"]{display:none}}'

/* Landing round 13, the owner: the showcase (build-showcase.tsx) leaves the hero for a place before pricing, so it is mounted as it comes near like the rest. Measured in dev: 483px at 390, 724 at 1440, 909 at 1920 (a 4:3 card a phone wide below 768px, the wide, OnePage, wide group from 768). Not yet in LAZY_SECTION_HEIGHTS_CSS. */
export const LazyBuildShowcase = lazySection(() => import("../build-showcase").then((m) => m.BuildShowcase), {
  name: "showcase",
  minHeight: "var(--lz, max(calc(254px + 58.6vw - clamp(0px, (100vw - 767px) * 100000, 100000px)), min(171px + 38.4vw, 947px)))",
  styles: () => import("../build-showcase").then((m) => m.SHOWCASE_STYLES),
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
export const LAZY_SECTION_HEIGHTS_CSS = '[data-lazy-section="everything"]{--lz:calc(1619px + 110vw)}[data-lazy-section="ideas"]{--lz:calc(155px + 76.667vw)}[data-lazy-section="business"]{--lz:calc(227px + 163.333vw)}[data-lazy-section="creators"]{--lz:calc(825px - 50vw)}[data-lazy-section="how-it-works"]{--lz:calc(528px + 306.667vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 9vh + 892px + 350vw)}[data-lazy-section="audience"]{--lz:683px}[data-lazy-section="analytics"]{--lz:calc(2139px - 100vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(713px + 60vw)}[data-lazy-section="integrations"]{--lz:394px}[data-lazy-section="ai-tools"]{--lz:calc(1067px - 86.667vw)}[data-lazy-section="earnings"]{--lz:0px}[data-lazy-section="showcase"]{--lz:calc(271px + 83.333vw)}[data-lazy-section="app-anywhere"]{--lz:calc(532px + 76.667vw)}@media (min-width:391px){[data-lazy-section="everything"]{--lz:calc(702.5px + 345vw)}[data-lazy-section="ideas"]{--lz:calc(181px + 70vw)}[data-lazy-section="business"]{--lz:calc(279px + 150vw)}[data-lazy-section="creators"]{--lz:calc(503.3px + 32.5vw)}[data-lazy-section="how-it-works"]{--lz:calc(632px + 280vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 9vh + 1038.3px + 312.5vw)}[data-lazy-section="audience"]{--lz:calc(624.5px + 15vw)}[data-lazy-section="analytics"]{--lz:calc(1934.3px - 47.5vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(674px + 70vw)}[data-lazy-section="integrations"]{--lz:calc(335.5px + 15vw)}[data-lazy-section="ai-tools"]{--lz:729px}[data-lazy-section="showcase"]{--lz:calc(215.8px + 97.5vw)}[data-lazy-section="app-anywhere"]{--lz:calc(509.3px + 82.5vw)}}@media (min-width:431px){[data-lazy-section="everything"]{--lz:calc(2103.7px + 19.139vw)}[data-lazy-section="ideas"]{--lz:calc(327.7px + 35.885vw)}[data-lazy-section="business"]{--lz:calc(407.6px + 120.096vw)}[data-lazy-section="creators"]{--lz:643px}[data-lazy-section="how-it-works"]{--lz:calc(834px + 233.014vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 9vh + 1363.6px + 236.842vw)}[data-lazy-section="audience"]{--lz:calc(639.6px + 11.483vw)}[data-lazy-section="analytics"]{--lz:calc(1869.9px - 32.536vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(847.4px + 29.665vw)}[data-lazy-section="integrations"]{--lz:calc(465.8px - 15.311vw)}[data-lazy-section="ai-tools"]{--lz:calc(805.1px - 17.703vw)}[data-lazy-section="showcase"]{--lz:calc(552.7px + 19.139vw)}[data-lazy-section="app-anywhere"]{--lz:calc(532.8px + 77.033vw)}}@media (min-width:640px){[data-lazy-section="everything"]{--lz:calc(2387.3px - 25.197vw)}[data-lazy-section="ideas"]{--lz:calc(220.4px + 52.756vw)}[data-lazy-section="business"]{--lz:calc(340.5px + 130.709vw)}[data-lazy-section="creators"]{--lz:calc(602.7px + 6.299vw)}[data-lazy-section="how-it-works"]{--lz:calc(381.3px + 113.386vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 9vh + 869.3px + 314.173vw)}[data-lazy-section="audience"]{--lz:calc(1037.8px - 35.433vw)}[data-lazy-section="analytics"]{--lz:1698px}[data-lazy-section="sell-everywhere"]{--lz:calc(667px + 40.945vw)}[data-lazy-section="integrations"]{--lz:448px}[data-lazy-section="ai-tools"]{--lz:calc(846.6px + 8.661vw)}[data-lazy-section="showcase"]{--lz:calc(644.8px + 4.724vw)}[data-lazy-section="app-anywhere"]{--lz:calc(599.6px + 67.717vw)}}@media (min-width:768px){[data-lazy-section="everything"]{--lz:calc(1236.7px - 23.664vw)}[data-lazy-section="ideas"]{--lz:calc(117.8px + 54.198vw)}[data-lazy-section="business"]{--lz:calc(147.7px + 64.885vw)}[data-lazy-section="creators"]{--lz:calc(463.6px + 19.847vw)}[data-lazy-section="how-it-works"]{--lz:calc(283.8px + 126.718vw)}[data-lazy-section="checkout"]{--lz:calc(100svh + 9vh + 825.6px + 319.847vw)}[data-lazy-section="audience"]{--lz:calc(627px + 16.794vw)}[data-lazy-section="analytics"]{--lz:calc(1564.6px + 9.16vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(701.3px + 35.115vw)}[data-lazy-section="integrations"]{--lz:calc(367.6px + 9.16vw)}[data-lazy-section="ai-tools"]{--lz:calc(772.3px + 18.321vw)}[data-lazy-section="earnings"]{--lz:calc(1087.8px + 21.374vw)}[data-lazy-section="showcase"]{--lz:calc(256.5px + 35.878vw)}[data-lazy-section="app-anywhere"]{--lz:calc(476.6px + 75.573vw)}}@media (min-width:900px){[data-lazy-section="everything"]{--lz:calc(270.3px + 83.74vw)}[data-lazy-section="ideas"]{--lz:calc(34.3px + 63.415vw)}[data-lazy-section="business"]{--lz:calc(66.1px + 73.984vw)}[data-lazy-section="creators"]{--lz:calc(400.5px + 26.829vw)}[data-lazy-section="how-it-works"]{--lz:calc(216.7px + 134.146vw)}[data-lazy-section="checkout"]{--lz:calc(221svh - 201.8px + 76.423vw)}[data-lazy-section="audience"]{--lz:calc(581.4px + 21.951vw)}[data-lazy-section="analytics"]{--lz:calc(1493.3px + 17.073vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(461.9px + 61.789vw)}[data-lazy-section="integrations"]{--lz:calc(303.7px + 16.26vw)}[data-lazy-section="ai-tools"]{--lz:calc(644.3px + 32.52vw)}[data-lazy-section="earnings"]{--lz:calc(411.9px + 59.35vw)}[data-lazy-section="showcase"]{--lz:calc(132.7px + 49.593vw)}[data-lazy-section="app-anywhere"]{--lz:calc(396px + 84.553vw)}}@media (min-width:1024px){[data-lazy-section="everything"]{--lz:calc(189.9px + 91.613vw)}[data-lazy-section="creators"]{--lz:calc(251.5px + 33.548vw)}[data-lazy-section="how-it-works"]{--lz:calc(7205.5px - 548.387vw)}[data-lazy-section="checkout"]{--lz:calc(221svh - 178.7px + 74.194vw)}[data-lazy-section="audience"]{--lz:calc(412.7px + 10.968vw)}[data-lazy-section="analytics"]{--lz:calc(846.2px + 16.774vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(570.2px + 16.774vw)}[data-lazy-section="ai-tools"]{--lz:calc(601.1px + 11.613vw)}[data-lazy-section="earnings"]{--lz:calc(629.2px + 38.065vw)}[data-lazy-section="showcase"]{--lz:calc(-0.8px + 62.581vw)}[data-lazy-section="app-anywhere"]{--lz:calc(333.5px + 30.323vw)}}@media (min-width:1180px){[data-lazy-section="ideas"]{--lz:calc(78.8px + 59.596vw)}[data-lazy-section="business"]{--lz:calc(79.8px + 72.727vw)}[data-lazy-section="creators"]{--lz:calc(63px + 49.495vw)}[data-lazy-section="how-it-works"]{--lz:calc(394.3px + 29.293vw)}[data-lazy-section="checkout"]{--lz:calc(221svh + 231.2px + 39.394vw)}[data-lazy-section="analytics"]{--lz:calc(7px + 87.879vw)}[data-lazy-section="earnings"]{--lz:calc(768.1px + 26.263vw)}[data-lazy-section="app-anywhere"]{--lz:calc(251px + 37.374vw)}}@media (min-width:1280px){[data-lazy-section="everything"]{--lz:calc(242px + 87.5vw)}[data-lazy-section="ideas"]{--lz:calc(114px + 56.875vw)}[data-lazy-section="business"]{--lz:calc(3px + 63.125vw)}[data-lazy-section="creators"]{--lz:calc(153px + 42.5vw)}[data-lazy-section="how-it-works"]{--lz:calc(169px + 46.875vw)}[data-lazy-section="analytics"]{--lz:calc(859px + 21.25vw)}[data-lazy-section="integrations"]{--lz:calc(290px + 17.5vw)}[data-lazy-section="ai-tools"]{--lz:calc(613px + 10.625vw)}[data-lazy-section="earnings"]{--lz:calc(528px + 18.125vw)}[data-lazy-section="showcase"]{--lz:calc(41px + 59.375vw)}[data-lazy-section="app-anywhere"]{--lz:calc(338px + 30.625vw)}}@media (min-width:1441px){[data-lazy-section="everything"]{--lz:calc(562.2px + 65.263vw)}[data-lazy-section="ideas"]{--lz:calc(341.8px + 41.053vw)}[data-lazy-section="business"]{--lz:calc(351.2px + 38.947vw)}[data-lazy-section="creators"]{--lz:765px}[data-lazy-section="how-it-works"]{--lz:calc(465.1px + 26.316vw)}[data-lazy-section="checkout"]{--lz:calc(221svh + 1024.4px - 15.789vw)}[data-lazy-section="audience"]{--lz:570px}[data-lazy-section="analytics"]{--lz:calc(1028.6px + 9.474vw)}[data-lazy-section="sell-everywhere"]{--lz:calc(734.2px + 5.263vw)}[data-lazy-section="integrations"]{--lz:calc(466.2px + 5.263vw)}[data-lazy-section="ai-tools"]{--lz:766px}[data-lazy-section="earnings"]{--lz:calc(728.4px + 4.211vw)}[data-lazy-section="showcase"]{--lz:calc(198.7px + 48.421vw)}[data-lazy-section="app-anywhere"]{--lz:calc(581.9px + 13.684vw)}}@media (min-width:1536px){[data-lazy-section="everything"]{--lz:calc(1445px + 7.813vw)}[data-lazy-section="ideas"]{--lz:calc(581px + 25.521vw)}[data-lazy-section="business"]{--lz:calc(761px + 12.24vw)}[data-lazy-section="how-it-works"]{--lz:calc(414px + 29.688vw)}[data-lazy-section="checkout"]{--lz:calc(221svh + 782px)}[data-lazy-section="analytics"]{--lz:1174px}[data-lazy-section="sell-everywhere"]{--lz:815px}[data-lazy-section="integrations"]{--lz:calc(383px + 10.677vw)}[data-lazy-section="earnings"]{--lz:793px}[data-lazy-section="showcase"]{--lz:calc(382px + 36.458vw)}[data-lazy-section="app-anywhere"]{--lz:calc(536px + 16.667vw)}}@media (min-width:1921px){[data-lazy-section="everything"]{--lz:1595px}[data-lazy-section="ideas"]{--lz:1071px}[data-lazy-section="business"]{--lz:996px}[data-lazy-section="how-it-works"]{--lz:calc(891px + 4.844vw)}[data-lazy-section="integrations"]{--lz:calc(537px + 2.656vw)}[data-lazy-section="showcase"]{--lz:calc(1190px - 5.625vw)}[data-lazy-section="app-anywhere"]{--lz:calc(730px + 6.563vw)}}@media (min-width:2561px){[data-lazy-section="how-it-works"]{--lz:1015px}[data-lazy-section="integrations"]{--lz:605px}[data-lazy-section="showcase"]{--lz:1046px}[data-lazy-section="app-anywhere"]{--lz:898px}}'
