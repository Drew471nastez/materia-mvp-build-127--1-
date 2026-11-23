/**
 * ===========================================================================
 *  EVERY INTEGRATION'S VIDEOS, CHECKED ON YOUTUBE (round 60)
 * ===========================================================================
 * By catalog id. Each one was found on YouTube and then checked with
 * YouTube's own oEmbed endpoint
 * (https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>):
 * the title and channel below are what it answered, word for word, and the
 * channel is the provider's own (channelUrl is oEmbed's author_url). An ID is
 * never guessed. oEmbed only answers for a video that may be embedded, so
 * each one plays in the page's youtube-nocookie frame; each one's
 * i.ytimg.com/vi/<id>/maxresdefault.jpg answered 200 on the day checked.
 *
 *   VERIFIED_VIDEOS  the demo: a short overview or how it works, played in
 *                    the gallery's large frame
 *   GALLERY_VIDEOS   up to three more from the same company, shown as tiles
 *                    by their own YouTube thumbnails, loaded from i.ytimg.com
 *                    when the page is shown (never copied into /public)
 *
 * Two are from a second channel the same company runs: Discord's "Discord
 * Apps 101" is on Discord Developers, and Google's GA4 with Tag Manager
 * video is on Google Analytics. None is about another store platform's
 * integration.
 *
 * Nothing official found (so the gallery draws Storelib's own scenes):
 * Telegram (no channel run by Telegram), and Storelib's own apps (Storelib
 * Reviews, Send analytics, Courier tracking, Your own system). Coming soon
 * integrations are not looked up.
 *
 * Titles are the providers' own words, quoted as YouTube gives them; they
 * are the frames' titles and the thumbnails' alt text.
 *
 * Pure data: no I/O.
 */

/** A YouTube video someone checked: the ID, its title, the channel it is on and when it was checked. */
export interface VerifiedVideo {
  youtubeId: string
  title: string
  /** The provider's own channel, by name, as YouTube shows it. */
  channel: string
  /** The channel's address, as oEmbed gave it (author_url). */
  channelUrl: string
  /** YYYY-MM-DD. */
  checked: string
}

const CHECKED = "2026-11-23"

export const VERIFIED_VIDEOS: Partial<Record<string, VerifiedVideo>> = {
  "calendly": { youtubeId: "hY678TbQR5U", title: "Calendly Overview: Way More Than a Scheduling Link", channel: "Calendly", channelUrl: "https://www.youtube.com/@Calendly", checked: CHECKED },
  "cal-com": { youtubeId: "QcDJ15bzzWs", title: "Welcome to Cal.com", channel: "Cal.com, Inc.", channelUrl: "https://www.youtube.com/@CalcomInc", checked: CHECKED },
  "discord": { youtubeId: "TJ13BA3-NR4", title: "How Discord Works in 148,000 Miliseconds or Less", channel: "Discord", channelUrl: "https://www.youtube.com/@discord", checked: CHECKED },
  "aftership": { youtubeId: "WR8EfmArB-8", title: "AfterShip - How does it work?", channel: "AfterShip", channelUrl: "https://www.youtube.com/@aftership", checked: CHECKED },
  "google-analytics": { youtubeId: "-1e5CS_v0vY", title: "1.2 How Google Analytics collects and processes data - Analytics Academy on Skillshop", channel: "Google Analytics", channelUrl: "https://www.youtube.com/@GoogleAnalytics", checked: CHECKED },
  "google-tag-manager": { youtubeId: "a5n0ZahID3Q", title: "Google Marketing Platform Essentials: Tag Manager overview", channel: "Google Marketing Platform", channelUrl: "https://www.youtube.com/@GoogleMarketingPlatform", checked: CHECKED },
  "google-ads": { youtubeId: "49bdV-OspYU", title: "Setting up Conversion Tracking Pt 1: Google Ads Tutorials", channel: "Google Ads", channelUrl: "https://www.youtube.com/@GoogleAds", checked: CHECKED },
  "meta-pixel": { youtubeId: "KCiBfay679Q", title: "How to Set Up a Facebook Pixel", channel: "Meta for Business", channelUrl: "https://www.youtube.com/@FacebookBusiness", checked: CHECKED },
  "tiktok-pixel": { youtubeId: "_4jAJ0sVvGs", title: "How to Set Up the TikTok Pixel Using Standard Mode", channel: "TikTok For Business", channelUrl: "https://www.youtube.com/@TikTokforBusiness", checked: CHECKED },
  "pinterest-tag": { youtubeId: "SJYJcs7oXsw", title: "Get started with the Pinterest tag", channel: "Pinterest Business", channelUrl: "https://www.youtube.com/@pinterestforbusiness", checked: CHECKED },
  "microsoft-clarity": { youtubeId: "cCfPxElfAz0", title: "What is Microsoft Clarity?", channel: "Microsoft Clarity", channelUrl: "https://www.youtube.com/@msftclarity", checked: CHECKED },
  "klaviyo": { youtubeId: "6Pxd9VKH2Gg", title: "What is Klaviyo: About Our Marketing Automation Platform", channel: "Klaviyo", channelUrl: "https://www.youtube.com/@Klaviyo", checked: CHECKED },
  "omnisend": { youtubeId: "7VO85XcgjrE", title: "Omnisend: The Top-Rated Email & SMS Marketing Platform for Ecommerce", channel: "Omnisend", channelUrl: "https://www.youtube.com/@Omnisend", checked: CHECKED },
  "brevo": { youtubeId: "md4cOcY4T2w", title: "Discover Brevo platform", channel: "Brevo", channelUrl: "https://www.youtube.com/@brevo_official", checked: CHECKED },
  "mailerlite": { youtubeId: "qYPA2aREKVo", title: "MailerLite demo: A quick tool overview for beginners", channel: "MailerLite", channelUrl: "https://www.youtube.com/@MailerLiteOfficial", checked: CHECKED },
  "kit": { youtubeId: "gb_LfXSR9bI", title: "Kit—The email-first operating system", channel: "Kit", channelUrl: "https://www.youtube.com/@Kit", checked: CHECKED },
  "printful": { youtubeId: "u04owj7jiM4", title: "What Is Printful and How Does Print-On-Demand Work In 2025?", channel: "Printful Custom Printing", channelUrl: "https://www.youtube.com/@PrintfulCustomPrinting", checked: CHECKED },
  "printify": { youtubeId: "DaYzuvZ36tk", title: "How to Create and Sell Custom T-Shirts (Printify - Print on Demand)", channel: "Printify", channelUrl: "https://www.youtube.com/@Printify", checked: CHECKED },
  "gelato": { youtubeId: "wqZomfdiMvc", title: "Getting started series: How Gelato's fulfillment process works", channel: "Gelato", channelUrl: "https://www.youtube.com/@GelatoCreate", checked: CHECKED },
  "cj-dropshipping": { youtubeId: "Fy4qC3GzQg4", title: "How Does CJ Work? The Step by Step CJdropshipping Tutorial", channel: "CJdropshipping", channelUrl: "https://www.youtube.com/@CJdropshipping-official", checked: CHECKED },
  "shipstation": { youtubeId: "V50bZh_o3uo", title: "Shipstation Overview", channel: "ShipStation", channelUrl: "https://www.youtube.com/@Shipstation", checked: CHECKED },
  "shippo": { youtubeId: "KJPPlTQrqOY", title: "What is Shippo and How Does it Work?", channel: "Shippo", channelUrl: "https://www.youtube.com/@shippoships", checked: CHECKED },
  "easypost": { youtubeId: "9tiUe1Fb0ao", title: "What Is EasyPost?", channel: "EasyPost", channelUrl: "https://www.youtube.com/@easypostco", checked: CHECKED },
  "mailchimp": { youtubeId: "lPxAiEvZefI", title: "Get Started with Mailchimp", channel: "Intuit Mailchimp", channelUrl: "https://www.youtube.com/@mailchimp", checked: CHECKED },
  "zapier": { youtubeId: "wXc_lUEbUSA", title: "What’s a Zap?", channel: "Zapier", channelUrl: "https://www.youtube.com/@Zapier", checked: CHECKED },
  "make": { youtubeId: "ADpijI_TqnE", title: "What is Make?", channel: "Make", channelUrl: "https://www.youtube.com/@itsmake", checked: CHECKED },
}

export const GALLERY_VIDEOS: Partial<Record<string, VerifiedVideo[]>> = {
  "calendly": [
    { youtubeId: "uWdLrmM0Fj8", title: "Introducing the New Calendly", channel: "Calendly", channelUrl: "https://www.youtube.com/@Calendly", checked: CHECKED },
    { youtubeId: "KpzMIUpUDQA", title: "How to Set Up Your Calendly Availability (2026 Tutorial)", channel: "Calendly", channelUrl: "https://www.youtube.com/@Calendly", checked: CHECKED },
  ],
  "cal-com": [
    { youtubeId: "fMHW6jYPIb8", title: "How To Embed Your Booking Page With Cal.com", channel: "Cal.com, Inc.", channelUrl: "https://www.youtube.com/@CalcomInc", checked: CHECKED },
    { youtubeId: "UsICIcyGIBA", title: "Setting up your availability - Cal.com", channel: "Cal.com, Inc.", channelUrl: "https://www.youtube.com/@CalcomInc", checked: CHECKED },
    { youtubeId: "piKlAiibAFo", title: "Cal.com: Automate your time with Workflows", channel: "Cal.com, Inc.", channelUrl: "https://www.youtube.com/@CalcomInc", checked: CHECKED },
  ],
  "discord": [
    { youtubeId: "7V5jdOjWVU4", title: "Discord - Group Chat That’s All Fun & Games", channel: "Discord", channelUrl: "https://www.youtube.com/@discord", checked: CHECKED },
    { youtubeId: "CFxo5w3SY2w", title: "Discord Apps 101: Bots, Activities, and Social SDK [Discord DevBytes]", channel: "Discord Developers", channelUrl: "https://www.youtube.com/@DiscordDevelopers", checked: CHECKED },
  ],
  "aftership": [
    { youtubeId: "uuoeS6z0klM", title: "AfterShip Tracking- #1 Shipment Tracking Solution for eCommerce Businesses", channel: "AfterShip", channelUrl: "https://www.youtube.com/@aftership", checked: CHECKED },
    { youtubeId: "fQy2eraBWEM", title: "AfterShip App - Ship Tracking App+Package Tracker+application de suivi des navires+荷物追跡+包裹查詢+查寄国际快递", channel: "AfterShip", channelUrl: "https://www.youtube.com/@aftership", checked: CHECKED },
  ],
  "google-analytics": [
    { youtubeId: "PBeUqHIRXNE", title: "2.1 Tour the Google Analytics user interface - learn where to find reports, settings, and more", channel: "Google Analytics", channelUrl: "https://www.youtube.com/@GoogleAnalytics", checked: CHECKED },
    { youtubeId: "uNKcis-wnro", title: "2.5 Navigate Overview and Detail reports in Google Analytics - Analytics Academy on Skillshop", channel: "Google Analytics", channelUrl: "https://www.youtube.com/@GoogleAnalytics", checked: CHECKED },
  ],
  "google-tag-manager": [
    { youtubeId: "vWJLbW6dNcQ", title: "Google Marketing Platform Essentials: Tag Manager demo", channel: "Google Marketing Platform", channelUrl: "https://www.youtube.com/@GoogleMarketingPlatform", checked: CHECKED },
    { youtubeId: "UuE37-MM1ws", title: "How to set up Google Analytics 4 (GA4) with Google Tag Manager (GTM)", channel: "Google Analytics", channelUrl: "https://www.youtube.com/@GoogleAnalytics", checked: CHECKED },
  ],
  "google-ads": [
    { youtubeId: "RHpP07zREM8", title: "Setting up Conversion Tracking Pt 2: Google Ads Tutorials", channel: "Google Ads", channelUrl: "https://www.youtube.com/@GoogleAds", checked: CHECKED },
    { youtubeId: "6oTZ81boJy0", title: "Google Ads Tutorials: Enhanced Conversions", channel: "Google Ads", channelUrl: "https://www.youtube.com/@GoogleAds", checked: CHECKED },
  ],
  "meta-pixel": [
    { youtubeId: "sGLWd28YUjk", title: "Get started with the Meta Conversions API to optimize your ad performance", channel: "Meta for Business", channelUrl: "https://www.youtube.com/@FacebookBusiness", checked: CHECKED },
    { youtubeId: "QVO6mHZ4M9c", title: "Increase your event match quality score by adding additional high-quality parameters", channel: "Meta for Business", channelUrl: "https://www.youtube.com/@FacebookBusiness", checked: CHECKED },
  ],
  "tiktok-pixel": [
    { youtubeId: "JXkgBNg_S6M", title: "How to Test Pixel Events", channel: "TikTok For Business", channelUrl: "https://www.youtube.com/@TikTokforBusiness", checked: CHECKED },
  ],
  "pinterest-tag": [
    { youtubeId: "yawGj_Cc_qg", title: "Get started with the Pinterest Conversions API", channel: "Pinterest Business", channelUrl: "https://www.youtube.com/@pinterestforbusiness", checked: CHECKED },
  ],
  "microsoft-clarity": [
    { youtubeId: "CFrLkiyBt50", title: "How to Use Heatmaps in Microsoft Clarity", channel: "Microsoft Clarity", channelUrl: "https://www.youtube.com/@msftclarity", checked: CHECKED },
    { youtubeId: "AlSkWk-iWpg", title: "An Overview of Session Recordings in Microsoft Clarity", channel: "Microsoft Clarity", channelUrl: "https://www.youtube.com/@msftclarity", checked: CHECKED },
    { youtubeId: "LUrv3WLZgg8", title: "An Overview of E-Commerce Features in Microsoft Clarity", channel: "Microsoft Clarity", channelUrl: "https://www.youtube.com/@msftclarity", checked: CHECKED },
  ],
  "klaviyo": [
    { youtubeId: "_ZC7I8GXDfU", title: "Klaviyo Platform Product Tour and Demo", channel: "Klaviyo", channelUrl: "https://www.youtube.com/@Klaviyo", checked: CHECKED },
    { youtubeId: "j_AMd2Hu7JU", title: "3 Email Campaign Strategies to Boost Engagement and Results | Klaviyo Academy", channel: "Klaviyo", channelUrl: "https://www.youtube.com/@Klaviyo", checked: CHECKED },
  ],
  "omnisend": [
    { youtubeId: "m9GJdaeEKL4", title: "Omnisend Email Marketing Demo for Ecommerce: Full Platform Walkthrough", channel: "Omnisend", channelUrl: "https://www.youtube.com/@Omnisend", checked: CHECKED },
    { youtubeId: "0rzMgMpPrHw", title: "Omnisend Quick-Start Guide Intro", channel: "Omnisend", channelUrl: "https://www.youtube.com/@Omnisend", checked: CHECKED },
  ],
  "brevo": [
    { youtubeId: "0m_QTzn4xs8", title: "Brevo — The most approachable CRM suite", channel: "Brevo", channelUrl: "https://www.youtube.com/@brevo_official", checked: CHECKED },
    { youtubeId: "iRLwKl96Mtw", title: "How to Set Up an Effective 3-Email Welcome Series Automation for your Ecommerce Store | Brevo", channel: "Brevo", channelUrl: "https://www.youtube.com/@brevo_official", checked: CHECKED },
  ],
  "mailerlite": [
    { youtubeId: "qYnGUeppKXM", title: "Complete MailerLite Guide for New Users", channel: "MailerLite", channelUrl: "https://www.youtube.com/@MailerLiteOfficial", checked: CHECKED },
    { youtubeId: "YCWw-5bK9pU", title: "How to Create Landing Pages That Convert - MailerLite tutorial", channel: "MailerLite", channelUrl: "https://www.youtube.com/@MailerLiteOfficial", checked: CHECKED },
  ],
  "kit": [
    { youtubeId: "gej6eRSDlXs", title: "Kit explained in 8 minutes | The email-first operating system for serious creators", channel: "Kit", channelUrl: "https://www.youtube.com/@Kit", checked: CHECKED },
    { youtubeId: "yDywH_Tm87o", title: "How to create a landing page in Kit for free (Step-by-step guide)", channel: "Kit", channelUrl: "https://www.youtube.com/@Kit", checked: CHECKED },
  ],
  "printful": [
    { youtubeId: "T4hpN0Ba9AU", title: "How to Use Printful Like a Pro (Full Tutorial for Beginners)", channel: "Printful Custom Printing", channelUrl: "https://www.youtube.com/@PrintfulCustomPrinting", checked: CHECKED },
    { youtubeId: "jgLibs72fcE", title: "How to Create and Sell Products with Printful (My Products Tutorial)", channel: "Printful Custom Printing", channelUrl: "https://www.youtube.com/@PrintfulCustomPrinting", checked: CHECKED },
    { youtubeId: "UhlLt0GKOMg", title: "How Does Printful Billing Work in 2025?", channel: "Printful Custom Printing", channelUrl: "https://www.youtube.com/@PrintfulCustomPrinting", checked: CHECKED },
  ],
  "printify": [
    { youtubeId: "IbLnUIgmlUY", title: "How to Use Printify to Make Money in 2025 | Full Guide for Print On Demand Business", channel: "Printify", channelUrl: "https://www.youtube.com/@Printify", checked: CHECKED },
    { youtubeId: "YG5xtr2O73w", title: "Printify Mugs: From Zero to Selling in 10 Minutes", channel: "Printify", channelUrl: "https://www.youtube.com/@Printify", checked: CHECKED },
  ],
  "gelato": [
    { youtubeId: "YJ2-FlWTePI", title: "Getting started series: What is print on demand?", channel: "Gelato", channelUrl: "https://www.youtube.com/@GelatoCreate", checked: CHECKED },
    { youtubeId: "LvTC1oZqVSo", title: "How to List 50+ Products in Minutes with Gelato's Bulk Create", channel: "Gelato", channelUrl: "https://www.youtube.com/@GelatoCreate", checked: CHECKED },
  ],
  "cj-dropshipping": [
    { youtubeId: "XvPc3L3qQOY", title: "CJ Warehouse Overview", channel: "CJdropshipping", channelUrl: "https://www.youtube.com/@CJdropshipping-official", checked: CHECKED },
    { youtubeId: "qyl1X-hw7rs", title: "How to Connect Your Store to CJ Dropshipping APP?", channel: "CJdropshipping", channelUrl: "https://www.youtube.com/@CJdropshipping-official", checked: CHECKED },
  ],
  "shipstation": [
    { youtubeId: "xl_L5-Q09EY", title: "What Is ShipStation?", channel: "ShipStation", channelUrl: "https://www.youtube.com/@Shipstation", checked: CHECKED },
    { youtubeId: "2XNcbbRhSks", title: "What Is ShipStation? Here's Why It's The #1 Choice of Online Sellers.", channel: "ShipStation", channelUrl: "https://www.youtube.com/@Shipstation", checked: CHECKED },
  ],
  "shippo": [
    { youtubeId: "kABe7CdCe8Y", title: "Get started with Shippo | Quick start", channel: "Shippo", channelUrl: "https://www.youtube.com/@shippoships", checked: CHECKED },
    { youtubeId: "C7-gkGnyXXU", title: "Create package templates within Shippo", channel: "Shippo", channelUrl: "https://www.youtube.com/@shippoships", checked: CHECKED },
  ],
  "easypost": [
    { youtubeId: "hufgkKWw9rM", title: "How to Create a Label with EasyPost", channel: "EasyPost", channelUrl: "https://www.youtube.com/@easypostco", checked: CHECKED },
    { youtubeId: "-ZrLlPLEnuI", title: "The Most Reliable Shipping API", channel: "EasyPost", channelUrl: "https://www.youtube.com/@easypostco", checked: CHECKED },
  ],
  "mailchimp": [
    { youtubeId: "Ps5MCEAOts4", title: "Welcome to Mailchimp's Official YouTube Channel!", channel: "Intuit Mailchimp", channelUrl: "https://www.youtube.com/@mailchimp", checked: CHECKED },
    { youtubeId: "63mHGmTrRXY", title: "How to Add & Import Contacts to a Mailchimp Audience From a File (2025)", channel: "Intuit Mailchimp", channelUrl: "https://www.youtube.com/@mailchimp", checked: CHECKED },
  ],
  "zapier": [
    { youtubeId: "JZI-5qHX9jI", title: "Let's Get Started With Zapier! | Learn Zapier in 14 Days", channel: "Zapier", channelUrl: "https://www.youtube.com/@Zapier", checked: CHECKED },
    { youtubeId: "DwGtVdllKRo", title: "New to Zapier? Build Your First Lead Automation (No Code!)", channel: "Zapier", channelUrl: "https://www.youtube.com/@Zapier", checked: CHECKED },
  ],
  "make": [
    { youtubeId: "NAw2kcoeysA", title: "Make—Building Your First Automated Workflow from Scratch", channel: "Make", channelUrl: "https://www.youtube.com/@itsmake", checked: CHECKED },
    { youtubeId: "XguXU3NjnpE", title: "Getting Started with AI Automation: Your easy start with Make AI Tools", channel: "Make", channelUrl: "https://www.youtube.com/@itsmake", checked: CHECKED },
  ],
}
