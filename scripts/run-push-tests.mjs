/**
 * Runs every suite under tests/.
 *
 * tsc into a scratch directory, then node. There is no test runner in this
 * project and this does not add one: a runner is a dependency, a config file
 * and a watch mode, for a suite that is two files. If this grows past a
 * handful this should become vitest — that is the point at which the
 * dependency pays for itself, and not before.
 *
 * Both suites are compiled TOGETHER and run in separate processes. Together,
 * because they share modules and one tsc invocation is faster than two;
 * separately, because each suite calls process.exit(1) on failure and a shared
 * process would let the first failure hide the second suite entirely.
 *
 * `server-only` resolves to an empty module outside a bundler, so the modules
 * under test import cleanly here.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, unlinkSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, basename } from "node:path"

const SUITES = [
  "tests/wizard27.test.ts",
  "tests/community-profile-j1.test.ts",
  "tests/surfaces25.test.ts",
  "tests/variants25.test.ts",
  "tests/topbar25.test.ts",
  "tests/post25.test.ts",
  "tests/explore25.test.ts",
  "tests/proxy-auth-speed.test.ts",
  "tests/net-request.test.ts",
  "tests/live-speed-view.test.ts",
  "tests/translate-ai-speed.test.ts",
  "tests/open-translate.test.ts",
  "tests/commerce-attention.test.ts",
  "tests/cash-on-delivery.test.ts",
  "tests/order-currency.test.ts",
  "tests/ai-theme-settings.test.ts",
  "tests/translation-integrity.test.ts",
  "tests/translations-k3.test.ts",
  "tests/languages-checkout-w.test.ts",
  /* Round X3: light or dark in Website Settings (the shared choice), the quieter language chip, Copy under the creator's message, a product's translations one language at a time; scripts/check-ui-polish-x.mjs measures them. */
  "tests/ui-polish-x.test.ts",
  "tests/shop-money.test.ts",
  "tests/store-currency.test.ts",
  "tests/checkout-market-overhaul.test.ts",
  "tests/languages-panel.test.ts",
  "tests/auto-translate.test.ts",
  "tests/checkout-words.test.ts",
  "tests/checkout-text.test.ts",
  "tests/order-emails-language.test.ts",
  "tests/site-languages-seo.test.ts",
  "tests/playbook24.test.ts",
  "tests/shippingapps24.test.ts",
  "tests/admindocs23.test.ts",
  "tests/buyer24.test.ts",
  /* Round 27 (B27): the buyer's order pages: Cancel order cancels and refunds, live status, words, logo, Visit store, returns. */
  "tests/buyer27.test.ts",
  /* Round 27 (H27): order help live on both sides, on the shop's website, Ask Storelib gated, Storelib's cases */
  "tests/help27.test.ts",
  "tests/storelib-reviews.test.ts",
  "tests/reviews-manage.test.ts",
  "tests/review-widgets.test.ts",
  "tests/reviews-import-v.test.ts",
  "tests/reviews-product-page.test.ts",
  "tests/app-menu19.test.ts",
  "tests/builder-nav19.test.ts",
  "tests/canvas20.test.ts",
  "tests/canvas-scroll-motion.test.ts",
  "tests/builder25.test.ts",
  "tests/help23.test.ts",
  "tests/help-center.test.ts",
  "tests/select22.test.ts",
  "tests/files-picker19.test.ts",
  "tests/polish21.test.ts",
  "tests/files-w6.test.ts",
  "tests/perf-speed18.test.ts",
  "tests/perf-health18.test.ts",
  "tests/perf-collect.test.ts",
  "tests/profile-display-name.test.ts",
  "tests/new-tab-links.test.ts",
  "tests/publish-tap-away.test.ts",
  "tests/lean-images.test.ts",
  "tests/buy-buttons-checkout.test.ts",
  "tests/integrations-settings-sheet.test.ts",
  "tests/settings-sheet-desktop.test.ts",
  "tests/integrations-i4.test.ts",
  /* Round 30: the Integrations page's pill order, All mixed, the pill in the address, a return with no landing (scripts/check-integrations-round30.mjs measures them). */
  "tests/integrations-round30.test.ts",
  /* Round K4: the marketplace (pills with live counts, Filter, the list in the address) and the integration page's shell, its actions and the plug-in API for built-in apps. */
  "tests/integrations-k4.test.ts",
  /* Round 27: the /app page bar sticky only where it is worked from, the cards' hover and badges, an integration's page (no title, one line, the following Connect), /app/reviews and its tabs (scripts/check-integrations27.mjs measures them). */
  "tests/integrations27.test.ts",
  "tests/settings-r1.test.ts",
  "tests/settings20.test.ts",
  "tests/limit21.test.ts",
  "tests/storefront23.test.ts",
  "tests/followups23.test.ts",
  "tests/store-settings-reach.test.ts",
  "tests/ai-memory.test.ts",
  "tests/product-binding.test.ts",
  "tests/shopify-import.test.ts",
  "tests/editor-groups-saves.test.ts",
  "tests/site-resilience.test.ts",
  "tests/compat-engine.test.ts",
  "tests/compat-accounts.test.ts",
  "tests/compat-storefront-accuracy.test.ts",
  "tests/tab-title.test.ts",
  "tests/import22.test.ts",
  "tests/compat-section-preview.test.ts",
  "tests/section-categories.test.ts",
  "tests/canvas-loading.test.ts",
  "tests/compat-recently-viewed.test.ts",
  "tests/compat-header-cards.test.ts",
  "tests/shopify-overlay-import.test.ts",
  "tests/editor-save-errors.test.ts",
  "tests/builder-october-fixes.test.ts",
  "tests/editor-inspector.test.ts",
  "tests/admin-ops.test.ts",
  "tests/native-app-links-inapp.test.ts",
  "tests/merge-markers.test.ts",
  "tests/imports-resolve.test.ts",
  "tests/canvas-containment.test.ts",
  "tests/new-user-site.test.ts",
  "tests/agent-rules.test.ts",
  "tests/agent-mcp.test.ts",
  "tests/agent-brain.test.ts",
  "tests/agent-intent.test.ts",
  "tests/agent-site-pages.test.ts",
  "tests/coded-chrome.test.ts",
  "tests/product-source.test.ts",
  "tests/editor-stability.test.ts",
  "tests/community-mobile.test.ts",
  "tests/live-settings.test.ts",
  "tests/theme-freedom.test.ts",
  "tests/reference-diff.test.ts",
  "tests/ai-runs-admin.test.ts",
  "tests/site-media.test.ts",
  "tests/physical-separation.test.ts",
  "tests/section-integration.test.ts",
  "tests/section-framework-t.test.ts",
  "tests/shopify-parity-u.test.ts",
  "tests/site-seo.test.ts",
  "tests/page-seo.test.ts",
  "tests/section-flash.test.ts",
  "tests/site-focus.test.ts",
  "tests/button-colors.test.ts",
  "tests/canvas-parity.test.ts",
  "tests/cookie-banner.test.ts",
  "tests/ai-keeps-working.test.ts",
  "tests/site-address.test.ts",
  "tests/custom-domains.test.ts",
  "tests/creator-domain-seo.test.ts",
  /* Round 31: a domain connected to one community: what it serves, who may connect it, the canonical, the panels */
  "tests/community-domains-round31.test.ts",
  "tests/emails-page.test.ts",
  "tests/orders-view.test.ts",
  /* The Orders page a page at a time (lib/orders/paged.ts): the same orders, numbers, counts and figures as when it read every row. */
  "tests/orders-paging.test.ts",
  "tests/orders-detail.test.ts",
  "tests/analytics-reports.test.ts",
  "tests/analytics-collection.test.ts",
  "tests/analytics-rollup-sql.test.ts",
  "tests/analytics-report-sql.test.ts",
  "tests/analytics-review.test.ts",
  "tests/own-marker.test.ts",
  "tests/dispute-orders.test.ts",
  "tests/anon-visit.test.ts",
  "tests/analytics-completeness.test.ts",
  "tests/home-figures.test.ts",
  "tests/auth-session.test.ts",
  "tests/library-depth.test.ts",
  "tests/provider-scope.test.ts",
  "tests/for-you.test.ts",
  "tests/own-reviews.test.ts",
  "tests/review-columns.test.ts",
  "tests/reviews-system.test.ts",
  "tests/avatar-one-rule.test.ts",
  "tests/nav-drawer.test.ts",
  "tests/header-motion.test.ts",
  "tests/storefront-mobile-drawer.test.ts",
  "tests/editor-navigation.test.ts",
  "tests/library-and-pages.test.ts",
  "tests/creator-page-products.test.ts",
  "tests/deleted-product-gone.test.ts",
  "tests/onepage-preview-parity.test.ts",
  "tests/product-delete.test.ts",
  "tests/product-visibility.test.ts",
  "tests/course-player.test.ts",
  "tests/new-product-kinds.test.ts",
  "tests/native-scroll-guard.test.ts",
  "tests/app-mobile-nav.test.ts",
  "tests/buyer-tab-bar.test.ts",
  "tests/nav-tabs15.test.ts",
  "tests/nav-feel.test.ts",
  /* Round 29: the tab bar's glass, a community's header across its tabs, pictures arriving (scripts/check-mobile-round29.mjs measures them). */
  "tests/mobile-round29.test.ts",
  "tests/app-nav-round10.test.ts",
  "tests/buyer-chrome.test.ts",
  "tests/buyer-qa.test.ts",
  "tests/quick-search.test.ts",
  "tests/account-hub.test.ts",
  "tests/header-elements.test.ts",
  "tests/site-cart.test.ts",
  "tests/cart-checkout.test.ts",
  "tests/basket-checkout.test.ts",
  "tests/site-checkout.test.ts",
  "tests/site-checkout-physical.test.ts",
  "tests/owned-checkout.test.ts",
  "tests/membership-duplicates.test.ts",
  "tests/checkout-safety.test.ts",
  "tests/checkout-receipt.test.ts",
  "tests/return-to.test.ts",
  "tests/sell-intent.test.ts",
  "tests/no-image-transforms.test.ts",
  "tests/page-performance.test.ts",
  "tests/products-area.test.ts",
  "tests/dom-guard.test.ts",
  "tests/product-bundle-zip.test.ts",
  "tests/invoice-logo.test.ts",
  "tests/follow-route.test.ts",
  "tests/cover-unpack.test.ts",
  "tests/auth-refresh-race.test.ts",
  "tests/mailgun-signature.test.ts",
  "tests/account-refusals.test.ts",
  "tests/editor-parts.test.ts",
  "tests/category-suggest.test.ts",
  "tests/sql-aggregate.test.ts",
  "tests/spam-defence.test.ts",
  "tests/digital-platform.test.ts",
  "tests/sites.test.ts",
  "tests/agent-loop.test.ts",
  "tests/openai-provider.test.ts",
  "tests/theme-agent.test.ts",
  "tests/storelib-ai.test.ts",
  "tests/client-errors.test.ts",
  "tests/new-deploy.test.ts",
  "tests/production-errors.test.ts",
  "tests/react-binding.test.ts",
  "tests/oauth-errors.test.ts",
  "tests/session-durability.test.ts",
  "tests/session-stability.test.ts",
  "tests/account-settings.test.ts",
  "tests/client-error-gate.test.ts",
  "tests/gallery-and-back.test.ts",
  "tests/motion-properties.test.ts",
  "tests/creator-page.test.ts",
  "tests/config-colour-field.test.ts",
  "tests/contact-gate.test.ts",
  "tests/hook-order.test.ts",
  "tests/link-navigation.test.ts",
  "tests/rsc-boundary.test.ts",
  "tests/editor-resync.test.ts",
  "tests/bar-colors.test.ts",
  "tests/cover-focal.test.ts",
  "tests/catalog-order.test.ts",
  "tests/sheet-controls.test.ts",
  "tests/product-media.test.ts",
  "tests/creator-url.test.ts",
  "tests/marketing-weight.test.ts",
  "tests/product-cache-scope.test.ts",
  "tests/icon-weight.test.ts",
  "tests/reserved-segments.test.ts",
  "tests/import-shadowing.test.ts",
  "tests/jsx-comments.test.ts",
  "tests/admin-dashboard.test.ts",
  "tests/admin-queries.test.ts",
  "tests/admin-routes.test.ts",
  "tests/admin-logic.test.ts",
  "tests/cron-reachable.test.ts",
  "tests/theme-presets.test.ts",
  "tests/sheet-reserve.test.ts",
  "tests/featured-order.test.ts",
  "tests/product-bars.test.ts",
  "tests/product-page-load.test.ts",
  "tests/back-no-replay.test.ts",
  "tests/explore-entrance.test.ts",
  "tests/explore-browse.test.ts",
  "tests/explore-communities.test.ts",
  "tests/explore-speed.test.ts",
  "tests/explore-round11.test.ts",
  "tests/explore-polish.test.ts",
  "tests/community-cards.test.ts",
  "tests/route-loading-bar.test.ts",
  "tests/back-plan.test.ts",
  "tests/back-never-stalls.test.ts",
  "tests/edge-swipe-back.test.ts",
  "tests/avatar-grounds.test.ts",
  "tests/brand-logo.test.ts",
  "tests/quick-access-urls.test.ts",
  "tests/header-link-navigates.test.ts",
  "tests/header-buttons.test.ts",
  "tests/header-flex.test.ts",
  "tests/search-strip-entrance.test.ts",
  "tests/site-autosave-safety.test.ts",
  "tests/site-nav-destinations.test.ts",
  "tests/field-panel.test.ts",
  "tests/sheet-controls.test.ts",
  "tests/return-navigation.test.ts",
  "tests/keyboard-viewport.test.ts",
  "tests/keyboard-scroll-loop.test.ts",
  "tests/product-page-cache.test.ts",
  "tests/purchase-verify.test.ts",
  "tests/receipt-download.test.ts",
  "tests/receipt-actions.test.ts",
  "tests/contact-seller.test.ts",
  "tests/no-self-recursion.test.ts",
  "tests/email-inbox-image.test.ts",
  "tests/onepage-search-share.test.ts",
  "tests/onepage-share-image.test.ts",
  "tests/onepage-host.test.ts",
  "tests/onepage-old-links.test.ts",
  "tests/policy-pages.test.ts",
  "tests/footer-complete.test.ts",
  "tests/header-footer-t.test.ts",
  "tests/settings-cleanup.test.ts",
  "tests/section-responsive.test.ts",
  "tests/anthropic-provider.test.ts",
  "tests/ai-chatgpt-only.test.ts",
  "tests/own-ai.test.ts",
  "tests/storelib-payments.test.ts",
  "tests/admin-payments-fees.test.ts",
  "tests/payments-setup-errors.test.ts",
  "tests/stripe-payments-facts.test.ts",
  "tests/physical-commerce.test.ts",
  "tests/physical-shipping-r3.test.ts",
  "tests/storelib-fees.test.ts",
  "tests/fees-free-plan.test.ts",
  "tests/stripe-connect-production.test.ts",
  "tests/payouts-and-disputes.test.ts",
  "tests/payout-weekly.test.ts",
  "tests/onboarding-flow.test.ts",
  "tests/payouts-verification.test.ts",
  "tests/push-ask.test.ts",
  "tests/payments-status.test.ts",
  "tests/payments-readiness.test.ts",
  "tests/payments-reconcile.test.ts",
  "tests/theme-code-editor.test.ts",
  "tests/section-settings.test.ts",
  "tests/section-render.test.ts",
  "tests/theme-settings.test.ts",
  "tests/app-sidebar.test.ts",
  "tests/analytics-chart.test.ts",
  "tests/website-builder.test.ts",
  "tests/nav-links.test.ts",
  "tests/menus-main-menu.test.ts",
  "tests/store-menus.test.ts",
  "tests/theme-breadcrumbs.test.ts",
  "tests/date-control.test.ts",
  "tests/media-url.test.ts",
  "tests/navigation-and-collections.test.ts",
  "tests/collections-ui.test.ts",
  "tests/native-google-sign-in.test.ts",
  "tests/editor-feel.test.ts",
  "tests/code-backups.test.ts",
  "tests/own-database.test.ts",
  "tests/builder-click-edit.test.ts",
  "tests/policy-editing.test.ts",
  "tests/web-vitals.test.ts",
  /* Website settings › Performance: real-user speed for every published website, the lab test, run-now part 210 */
  "tests/web-performance-v.test.ts",
  /* Website settings › Performance, round W: the quick check when Google's test cannot run, the switches, a new period without a flash */
  "tests/performance-tab-w.test.ts",
  "tests/sitemaps.test.ts",
  "tests/storelib-theme.test.ts",
  "tests/theme-setting-types.test.ts",
  "tests/storefront-data.test.ts",
  "tests/theme-sections.test.ts",
  "tests/public-fetch.test.ts",
  "tests/storelib-package.test.ts",
  "tests/storelib-hardening.test.ts",
  "tests/agent-own-sections.test.ts",
  "tests/theme-file-drafts.test.ts",
  "tests/storelib-blocks.test.ts",
  "tests/storelib-parity.test.ts",
  "tests/preview-link.test.ts",
  "tests/published-site.test.ts",
  "tests/shop-products.test.ts",
  "tests/canvas-scroll.test.ts",
  "tests/link-address.test.ts",
  "tests/link-menu.test.ts",
  "tests/anchors-motion.test.ts",
  "tests/connection-mark.test.ts",
  /* Background reads and crons, cut on purpose (the owner: lower Vercel costs) */
  "tests/polling-costs.test.ts",
  "tests/editor-fixes.test.ts",
  "tests/builder-round-3.test.ts",
  "tests/contrast.test.ts",
  "tests/responsive-settings.test.ts",
  "tests/storelib-security.test.ts",
  "tests/storelib-performance.test.ts",
  "tests/design-tokens.test.ts",
  "tests/manual.test.ts",
  "tests/sanitize.test.ts",
  "tests/theme-sharing.test.ts",
  "tests/raw-html-surface.test.ts",
  "tests/admin-key-routes.test.ts",
  "tests/money-rows-server-only.test.ts",
  "tests/private-columns.test.ts",
  "tests/ledger-and-deletion.test.ts",
  /* Background jobs run once and stop (a Stripe or Airwallex event taken before it is handled, a job cut off every time ends), and run-now part 189 */
  "tests/jobs-and-isolation.test.ts",
  /* A job, a store's translation and an order line, each done once (a lost job lease writes nothing, the hourly translate claim, run-now part 190) */
  "tests/jobs-dupes.test.ts",
  "tests/backups.test.ts",
  "tests/schema-source.test.ts",
  "tests/ops-safety.test.ts",
  "tests/public-abuse.test.ts",
  "tests/section-signups.test.ts",
  "tests/developer-hub.test.ts",
  "tests/ai-section-placement.test.ts",
  "tests/email-automation.test.ts",
  "tests/automation-engine.test.ts",
  "tests/email-sending.test.ts",
  "tests/email-starters.test.ts",
  "tests/email-variables.test.ts",
  "tests/email-composer.test.ts",
  "tests/email-layouts.test.ts",
  "tests/email-automations-sql.test.ts",
  "tests/email-one-picture.test.ts",
  "tests/automations-audit.test.ts",
  "tests/automation-templates.test.ts",
  "tests/checkout-contacts.test.ts",
  "tests/checkout-welcome.test.ts",
  "tests/attribution.test.ts",
  "tests/section-sandbox.test.ts",
  "tests/agent-connection.test.ts",
  "tests/github-sync.test.ts",
  "tests/github-theme-sync.test.ts",
  "tests/github-publish-sync.test.ts",
  "tests/schema-edits-sidebar.test.ts",
  "tests/theme-config-files-v.test.ts",
  "tests/collection-binding-v.test.ts",
  "tests/date-range.test.ts",
  "tests/cookie-consent.test.ts",
  "tests/marketing-footer.test.ts",
  "tests/refund-sync.test.ts",
  "tests/refund-sync-sim.test.ts",
  "tests/image-picker.test.ts",
  "tests/site-pages.test.ts",
  "tests/admin-auth.test.ts",
  "tests/stuck-layer.test.ts",
  "tests/site-cache-and-buttons.test.ts",
  /* Marketing pages served from the CDN: their layout reads nothing about the request */
  "tests/marketing-cache.test.ts",
  "tests/keyboard-watch.test.ts",
  "tests/agent-attachments.test.ts",
  "tests/work-panel.test.ts",
  "tests/ask-section-edit.test.ts",
  "tests/ask-storelib.test.ts",
  "tests/ask-conversations.test.ts",
  "tests/ask-dock.test.ts",
  "tests/ask-pictures.test.ts",
  "tests/ask-answer-actions.test.ts",
  "tests/ask-images-u.test.ts",
  /* V round: one box routed by the server, the four Claude models at medium effort, AI Memory for Storelib AI and MCP (scripts/check-ask-dock.mjs ONLY=labels,models,unified measures the chip and the menu). */
  "tests/ask-unified-v.test.ts",
  "tests/ask-sounds.test.ts",
  "tests/ask-voice-mobile.test.ts",
  "tests/ai-reference.test.ts",
  "tests/native-feel.test.ts",
  "tests/theme-media.test.ts",
  "tests/settings-flow.test.ts",
  "tests/sheet-rest.test.ts",
  "tests/control-frames.test.ts",
  "tests/builder-sidebar.test.ts",
  "tests/media-field.test.ts",
  "tests/file-picker.test.ts",
  "tests/header-search.test.ts",
  "tests/creator-page-default.test.ts",
  "tests/explore-show-all.test.ts",
  "tests/onepage-stability.test.ts",
  "tests/onepage-save.test.ts",
  "tests/marketing-image-quality.test.ts",
  "tests/keyboard-safe-sheet.test.ts",
  "tests/analytics-chart-skeleton.test.ts",
  "tests/tab-strip.test.ts",
  "tests/scrim-blur.test.ts",
  "tests/app-shell-motion.test.ts",
  "tests/app-top-corners.test.ts",
  "tests/app-page-reads.test.ts",
  "tests/storage-upload-routes.test.ts",
  "tests/pricing-plans.test.ts",
  "tests/app-search.test.ts",
  "tests/notifications-panel.test.ts",
  "tests/notify-unsubscribe.test.ts",
  "tests/subscriber-unsubscribe.test.ts",
  "tests/notify-center.test.ts",
  "tests/notification-rules.test.ts",
  "tests/notification-snapshot.test.ts",
  "tests/notify-integration.test.ts",
  "tests/notify-engine.test.ts",
  "tests/notify-webhook.test.ts",
  "tests/rich-text.test.ts",
  "tests/upload-security.test.ts",
  "tests/owner-download.test.ts",
  "tests/direct-uploader.test.ts",
  "tests/settings-account-fixes.test.ts",
  "tests/settings-country.test.ts",
  "tests/payouts-phone.test.ts",
  "tests/checkout-phone.test.ts",
  "tests/translation-coverage.test.ts",
  "tests/vercel-costs.test.ts",
  "tests/vercel-runtime-costs.test.ts",
  "tests/avatar-one-source.test.ts",
  "tests/creator-identity.test.ts",
  "tests/onepage-avatar-kept.test.ts",
  "tests/profile-photo.test.ts",
  "tests/coupon-editor.test.ts",
  "tests/coupon-checkout.test.ts",
  "tests/cart-coupons.test.ts",
  "tests/product-page-t.test.ts",
  "tests/home-cards.test.ts",
  "tests/home-announcements.test.ts",
  "tests/home-progress.test.ts",
  "tests/creator-badges.test.ts",
  "tests/sql-run-four.test.ts",
  "tests/buy-extras.test.ts",
  "tests/business-accounts.test.ts",
  "tests/shown-email.test.ts",
  "tests/store-settings-t.test.ts",
  "tests/taxes-t.test.ts",
  "tests/markets.test.ts",
  "tests/visitors25.test.ts",
  "tests/compat-languages.test.ts",
  "tests/canvas-currency.test.ts",
  "tests/analytics-ad.test.ts",
  "tests/tax-settings-wiring.test.ts",
  "tests/customer-email-editor.test.ts",
  "tests/abandoned-cart-reminder.test.ts",
  "tests/reasons-t.test.ts",
  "tests/channels-t.test.ts",
  "tests/integrations-t.test.ts",
  "tests/round-u.test.ts",
  "tests/compat-resilience.test.ts",
  "tests/physical-setup-t.test.ts",
  "tests/physical-readiness.test.ts",
  "tests/emails-t.test.ts",
  "tests/files-t.test.ts",
  "tests/files-inventory-v.test.ts",
  "tests/activity-t.test.ts",
  "tests/support-t.test.ts",
  "tests/offers-t.test.ts",
  "tests/offers-v.test.ts",
  "tests/round-v.test.ts",
  "tests/round-w.test.ts",
  "tests/product-editor-physical.test.ts",
  "tests/product20.test.ts",
  "tests/product-variants-faq-h.test.ts",
  "tests/round-x.test.ts",
  "tests/round-y.test.ts",
  "tests/round-z.test.ts",
  "tests/round-aa.test.ts",
  "tests/team.test.ts",
  "tests/emails-layout.test.ts",
  "tests/business-switch-flow.test.ts",
  "tests/push-recipients.test.ts",
  "tests/onboarding-polish.test.ts",
  "tests/section-markup-guard.test.ts",
  "tests/list-price.test.ts",
  "tests/upload-limits.test.ts",
  "tests/onepage-editor-shell.test.ts",
  "tests/onepage-leave.test.ts",
  "tests/onepage-theme-apply.test.ts",
  "tests/onepage-open.test.ts",
  "tests/onepage-arrival.test.ts",
  "tests/own-section-html.test.ts",
  "tests/website-builder-api.test.ts",
  "tests/security-scan.test.ts",
  "tests/site-accounts.test.ts",
  "tests/site-contact.test.ts",
  "tests/site-customer-pages.test.ts",
  "tests/account-sections.test.ts",
  "tests/onepage-blocks.test.ts",
  "tests/onepage-editor-ui.test.ts",
  "tests/checkout-loads.test.ts",
  "tests/notify-templates.test.ts",
  "tests/sale-email.test.ts",
  "tests/wallet-domains.test.ts",
  "tests/file-scanner.test.ts",
  "tests/upload-inspector.test.ts",
  "tests/file-security-words.test.ts",
  "tests/library-downloads.test.ts",
  "tests/memberships.test.ts",
  "tests/memberships-folded.test.ts",
  "tests/site-chrome.test.ts",
  "tests/section-groups.test.ts",
  /* V5: the section menus, copy and paste, Edit code, the Apps category (scripts/check-section-menus.mjs measures them) */
  "tests/section-actions-v.test.ts",
  "tests/communities-foundation.test.ts",
  "tests/user-notifications.test.ts",
  "tests/push-bridge.test.ts",
  "tests/communities-notify.test.ts",
  "tests/communities-public.test.ts",
  "tests/communities-plans-af.test.ts",
  "tests/round-ag.test.ts",
  "tests/round-ah.test.ts",
  "tests/round-ai.test.ts",
  "tests/communities-access-restore.test.ts",
  "tests/communities-platform.test.ts",
  "tests/communities-security.test.ts",
  "tests/communities-member.test.ts",
  "tests/communities-classroom.test.ts",
  "tests/communities-learn.test.ts",
  "tests/learn18.test.ts",
  "tests/communities-creator.test.ts",
  "tests/communities-shell.test.ts",
  "tests/communities-growth.test.ts",
  "tests/communities-membership13.test.ts",
  "tests/communities-frame10.test.ts",
  "tests/communities-frame11.test.ts",
  "tests/communities-feed15.test.ts",
  "tests/account-pills16.test.ts",
  "tests/pills17.test.ts",
  "tests/nav18.test.ts",
  "tests/nav23.test.ts",
  /* V3: the builder's speed (scripts/check-editor-perf.mjs) and its Going back screen (scripts/check-editor-exit.mjs). */
  "tests/editor-perf-v.test.ts",
  /* V12: no :has() whose subject is the root, so an insertion restyles what it touches (scripts/check-editor-perf.mjs, "insert one node"). */
  "tests/editor-css-v.test.ts",
  "tests/communities-frame12.test.ts",
  /* Round 31: the community content sections in /app: the icon picker, rows that open, the form sheet, the member composer as the Feed writer (scripts/check-community-content-round31.mjs measures them). */
  "tests/communities-content31.test.ts",
  "tests/communities-about11.test.ts",
  "tests/communities-frame13.test.ts",
  "tests/communities-posts.test.ts",
  "tests/communities-safety.test.ts",
  "tests/communities-safety2.test.ts",
  "tests/communities-posts12.test.ts",
  "tests/communities-posts13.test.ts",
  "tests/communities-post15.test.ts",
  "tests/communities-post16.test.ts",
  "tests/communities-post17.test.ts",
  "tests/community-mobile-r8.test.ts",
  "tests/communities-feed-rank.test.ts",
  "tests/communities-admin13.test.ts",
  "tests/communities-events-admin.test.ts",
  /* Round 31: a community analytics for any period, its visits and Google Analytics (scripts/check-community-analytics-round31.mjs measures the screen). */
  "tests/community-analytics-r31.test.ts",
  /* Round 32: a community's analytics counted against a seeded fixture, and read without a bar or a blur (scripts/check-community-analytics-round32.mjs measures it beside /app Analytics). */
  "tests/community-analytics-r32.test.ts",
  /* Round 33: a community's visits counted by the page once it is on a screen (sources, devices, countries, the app), member churn, DAU to MAU, new and returning, an overview over the sections (scripts/check-community-analytics-round33.mjs measures it). */
  "tests/community-analytics-r33.test.ts",
  /* Round 32: questions before joining, a new member's first steps and welcome message, scheduled posts and drafts, inviting a list (SQL parts 186 to 188). */
  "tests/community-features-round32.test.ts",
  /* Round 26: the admin's Posts: one writer that posts, schedules in the creator's zone and keeps team drafts (part 194), the writer's slide, the community's own post popup (scripts/check-posts26.mjs films them). */
  "tests/posts26.test.ts",
  /* Round 33: who opens a program (Open, Reach a level, Buy now, Days after joining, Private) decided on the server for the shelf, the page, every lesson and the checkout; modules and lessons added at once (SQL part 200; scripts/check-learn-round33.mjs measures the screens). */
  "tests/community-learn-access-round33.test.ts",
  /* Round 33: the community Page editor, the links as icons, the cover's focus, the join button, the About page's row (scripts/check-page-editor-round33.mjs measures them). */
  "tests/community-page-round33.test.ts",
  /* Round 26 (W4): the About page and the info card: the button's words, the admins and icons in the card, the short description, Share, Powered by, Privacy and Terms (scripts/check-about26.mjs measures it). */
  "tests/about26.test.ts",
  "tests/communities-paid-events.test.ts",
  "tests/communities-notify-budget.test.ts",
  "tests/communities-video13.test.ts",
  "tests/communities-round33.test.ts",
  /* Round 26 (W2): the community admin's row of tabs (stuck in the middle of its row, nothing moves on a hover, fades only where there is more) and an Overview of four figures (scripts/check-community-admin-nav26.mjs measures them). */
  "tests/nav26.test.ts",
  "tests/communities-events-notify.test.ts",
  "tests/communities-events-member.test.ts",
  "tests/communities-profiles15.test.ts",
  "tests/member18.test.ts",
  "tests/profiles-follows.test.ts",
  "tests/profile-one-page.test.ts",
  "tests/profile-seo-round12.test.ts",
  "tests/profile-page-s.test.ts",
  "tests/account-center.test.ts",
  "tests/theme-blocks.test.ts",
  "tests/place-navigator.test.ts",
  "tests/header-round8.test.ts",
  "tests/native-app-links.test.ts",
  "tests/native-shell.test.ts",
  "tests/account-round11.test.ts",
  "tests/elastic-and-landings.test.ts",
  "tests/communities-shell15.test.ts",
  /* Round 31: the community admin shell keeps its sections, the settings list, the save bar, the gallery drag (scripts/check-community-admin-round31.mjs measures them). */
  "tests/communities-admin31.test.ts",
  /* Round 32: the community admin's Overview and Settings use the width, the gallery is the product editor's, members pick their own look (scripts/check-community-admin-round32.mjs measures them). */
  /* Round 32: moving between a community's sections (scripts/check-community-admin-round32.mjs, scripts/measure-community-admin-server.mjs measure it). */
  "tests/communities-admin32.test.ts",
  /* Round 33: the Page section after Overview, Settings without the page, the /app badge, one save bar, covers from the logo (scripts/check-community-admin-round33.mjs measures them). */
  "tests/communities-admin33.test.ts",
  "tests/communities-admin-nav32.test.ts",
  "tests/editor-r6.test.ts",
  "tests/favicon-sync.test.ts",
  "tests/page-seo-r6.test.ts",
  "tests/billing-cancel19.test.ts",
  "tests/physical-w7.test.ts",
  "tests/fulfil23.test.ts",
  "tests/tracking24.test.ts",
  "tests/editor-engine-w4b.test.ts",
  /* Round 20 (last: first in the list, tsc checked a few unrelated files in an order that typed a string as never). */
  "tests/orders20.test.ts",
  /* Round 21 */
  "tests/safety21.test.ts",
  /* Round 23 */
  "tests/store23.test.ts",
  "tests/emails23.test.ts",
  "tests/integrations23.test.ts",
  "tests/marketing24.test.ts",
  "tests/partners24.test.ts",
  "tests/physical-ships-x1.test.ts",
  /* Round 25 */
  "tests/i18n25.test.ts",
  "tests/publishing-cache.test.ts",
  /* Releases on Publish (SQL part 180) and an imported theme page held by the CDN for a stranger */
  "tests/site-releases.test.ts",
  /* An earlier publish live again (SQL part 188) */
  "tests/release-rollback.test.ts",
  /* Safety nets that measure: build memory, bundle budgets, the post-deploy smoke, the load test, the rollback runbook, each job from cron_runs */
  "tests/ops-safety-nets.test.ts",
  /* Indexes for the reads that searched a whole table (SQL part 187), the wishlist's one profile read, More from seller's columns */
  "tests/db-indexes.test.ts",
  /* Phones: the front page's globe loaded on approach, read ahead on the device's plan, polling paused in the background, native listeners taken off */
  "tests/mobile-perf.test.ts",
  /* Round V1: a published website held and cleared, its round trips counted, its links opened in place, its first picture first, one favicon, no about:blank tab (scripts/check-live-speed.ts measures them) */
  "tests/live-speed-v.test.ts",
  /* Round W1: an imported theme's live page stored by the CDN (no Vary: Cookie), its body's CSS gathered in the head in order, its flags lazy, plain HTML with no React, links fetched ahead (scripts/check-live-first-load.mjs measures it) */
  "tests/live-first-load-w.test.ts",
  /* Round 26 (W6): community SEO by state, the sitemap and canonicals, the member links inside a community and their presses (SQL part 221) */
  "tests/seo26.test.ts",
  /* The carrier picker's own carriers and live data: search, preselection, stars, defaults, the shop's carriers, connected accounts, no price without a provider, the logo's letters, part 233 (scripts/check-carrier-select.mjs photographs it). */
  "tests/carrier-select.test.ts",
  /* Round 27 (K27): the seller's orders: carriers with logos and tracking pages, the tracking number rule, unseen orders, the packing slip, the carrier picker */
  "tests/orders27.test.ts",
  /* Round 27 (M27): physical order emails link the live website, never the creator page (lib/physical/store-link), no unsubscribe on transactional mail, product thumbnails, the creator page language banner gone */
  "tests/emails27.test.ts",
  /* Round 27 (P27): scheduled posts carry their media and poll (SQL part 222), the composer's toolbar down with the keys, the New post pill, closed comments, the welcome post writer */
  "tests/posts27.test.ts",
  /* V round, the builder's AI: the theme brief cached per version, invented schema keys and unread settings refused, phone layouts checked without a browser, honest repair, follow ups scoped, one Undo step a run, calls and tokens on a budget */
  "tests/ai-quality-v.test.ts",
  /* Round V8: the website's words in each language, edited in the builder's sidebar in that language, a product's own Translations, one read per language (SQL part 211; scripts/check-translation-switch.mjs measures the sidebar) */
  "tests/translations-v.test.ts",
]

/**
 * SUITES THAT RUN ROUTE HANDLERS, compiled on their own with the project's
 * own `strict: true` (tsconfig.json). A route written against strict types
 * narrows a result by `if (!saved.ok)`, which only narrows with
 * strictNullChecks; under the list above's `strict: false` the same route is
 * a type error and the whole run stops before any suite. Same output
 * directory, run after the list above.
 */
const STRICT_SUITES = [
  /* ShippyPro: the adapter against recorded and documented answers, and the marketplace card in each state (components/physical/integrations-marketplace.tsx only type-checks strict) */
  "tests/shippypro.test.ts",
  /* Round 24: the whole commerce flow, through the real routes (tests/_journey) */
  "tests/e2e24.test.ts",
  /* A store priced in euros, bought, refunded and translated through the real routes (tests/_journey) */
  "tests/e2e-store-currency.test.ts",
  /* Cash on delivery in a lei store: the fee, a country refused, the order, the emails, Mark as paid, a parcel refused and restocked (tests/_journey) */
  "tests/e2e-cash-on-delivery.test.ts",
  /* More currencies: a lei store with euros for Germany and France, a visitor's card, cart, selector, card and cash checkout, order and emails all in the same euros; zloty shown and charged in lei (tests/_journey) */
  "tests/e2e-more-currencies.test.ts",
  /* The seller ships it themselves: part shipped with tracking, the number fixed, the rest from a second place, a fulfilment undone, a return restocked and refunded, a cancel after an undo, a pickup, refused cash (tests/_journey) */
  "tests/e2e-manual-fulfillment.test.ts",
  /* Quick setup through the real routes: explicit prices, whole or nothing, once */
  "tests/e2e-shipsetup.test.ts",
  /* Shipping quick setup, the summary, one fulfilment question, carrier rates gated (strict: it renders the settings component, which narrows on api() results) */
  "tests/shipsetup.test.ts",
  /* Several parcels in one Fulfill, Mark as fulfilled on many orders from the list, a tracking CSV previewed then imported (tests/_journey) */
  "tests/e2e-bulk-fulfillment.test.ts",
  /*
    The Claude provider's suite, here and not in the list above: its imports
    (the Anthropic SDK's types) change how the loose compile reads other
    files, and `value.match(...) ?? []` in a dozen of them became `never`,
    stopping the whole run before any suite. Compiled strict on its own it is
    clean.
  */
  "tests/claude-integration.test.ts",
  /*
    Round 33: making a community, its setup list, deleting one members pay for (scripts/check-create-round33.mjs
    measures the wizard and the pill). Here, not above: it runs lib/communities/server/creator.ts, whose results are
    narrowed by `if (!x.ok)`, which only narrows under strict.
  */
  "tests/community-lifecycle-round33.test.ts",
  /*
    Round 26 (W1): a community being deleted takes no place on the plan, Keep after a replacement, two tabs, the
    states and the cards (scripts/check-cards-round26.mjs measures the cards). Here for the same reason as the line
    above: it runs lib/communities/server/creator.ts.
  */
  "tests/cards26.test.ts",
  /*
    Round 26 (W5): the Page editor rebuilt, the short description and member links (SQL part 220), a join button that
    never states a price, every field saved and read back through creator.ts (strict, as above); scripts/
    check-page-editor26.mjs measures the editor.
  */
  "tests/editor26.test.ts",
  /*
    Round 27 (E27): the Page editor at every width (side or drawer by its own width, the panel dragged, the drawer's
    places), its outlines, the creator's own Privacy and Terms saved and read back through creator.ts (strict, as
    above), the About card's icons and Share; scripts/check-page-editor27.mjs measures the editor and its frame rates.
  */
  "tests/editor27.test.ts",
]

const out = mkdtempSync(join(tmpdir(), "storelib-push-"))
const tsconfigPath = "tsconfig.tests.generated.json"
let anyFailed = false
try {
  // A real tsconfig rather than a file list, because the modules under test
  // import each other through the `@/…` alias. Passing files on the command
  // line gives tsc no baseUrl and no paths, so the first cross-module alias
  // import fails to RESOLVE — TS2307, exit 2, before a single assertion runs.
  // Written into the PROJECT ROOT, not the temp dir. tsc resolves `node_modules`
  // and `typeRoots` relative to the config file, so a config living in /tmp
  // cannot see @types/node — "Cannot find type definition file for 'node'",
  // exit 2, before any assertion runs. Removed in the finally block below.
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: ".",
        target: "es2022",
        module: "esnext",
        moduleResolution: "bundler",
        /**
         * The section renderers are TSX, and tests/section-render.test.ts
         * imports them to render each section for real. `react-jsx` is what
         * Next.js compiles them with; without it tsc refuses the JSX and the
         * suite cannot see a section at all.
         */
        jsx: "react-jsx",
        skipLibCheck: true,
        strict: false,
        baseUrl: ".",
        paths: { "@/*": ["./*"] },
      },
      files: SUITES,
    }),
  )
  /**
   * `pnpm exec`, not `npx`. This project is pnpm — one lockfile, a
   * `packageManager` field, a pnpm-shaped node_modules — and npx is the one
   * command in it that was not. That is not only tidiness: npx will FETCH a
   * package from the registry when it cannot find the binary locally, so a
   * broken install turns into a silent download of some other tsc and a suite
   * that passes against the wrong compiler. `pnpm exec` fails instead.
   */
  execFileSync("pnpm", ["exec", "tsc", "-p", tsconfigPath], { stdio: "inherit" })
  if (STRICT_SUITES.length) {
    const generated = JSON.parse(readFileSync(tsconfigPath, "utf8"))
    writeFileSync(tsconfigPath, JSON.stringify({ ...generated, compilerOptions: { ...generated.compilerOptions, strict: true }, files: STRICT_SUITES }))
    execFileSync("pnpm", ["exec", "tsc", "-p", tsconfigPath], { stdio: "inherit" })
  }

  /**
   * NOTHING IS REWRITTEN. Resolution is a loader hook — see
   * scripts/push-test-loader.mjs.
   *
   * It used to be three regexes over the emitted text, which could not tell
   * code from data: one of them rewrote `import App from "./App"` INSIDE a
   * template literal in tests/sites.test.ts's project fixture, and the suite
   * then failed against code that was correct.
   */
  const walk = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })

  writeFileSync(join(out, "package.json"), '{"type":"module"}\n')

  // Real packages, for suites that use one.
  //
  // The `@/…` rewrite above only handles this project's own modules. A BARE
  // specifier — `sharp` in tests/reprocess.test.ts — is resolved by Node
  // walking up from the importing file looking for node_modules, and the
  // importing file is in a temp directory that has none. So it fails with
  // ERR_MODULE_NOT_FOUND on a package that is plainly installed.
  //
  // A symlink rather than a copy: node_modules is hundreds of megabytes and
  // this runs on every push. Failing softly, because a symlink can be refused
  // (Windows without developer mode, an exotic filesystem) and every suite that
  // does not import a package still runs perfectly without it.
  try {
    symlinkSync(join(process.cwd(), "node_modules"), join(out, "node_modules"), "junction")
  } catch {
    /* suites importing real packages will say so themselves */
  }

  const compiled = walk(out)
  for (const suite of [...SUITES, ...STRICT_SUITES]) {
    const wanted = basename(suite).replace(/\.ts$/, ".js")
    /* By its whole name: page-seo.test.js is also the end of onepage-seo.test.js. */
    const entry = compiled.find((f) => basename(f) === wanted)
    if (!entry) throw new Error(`compiled test not found for ${suite}`)
    console.log(`\n──────── ${suite} ────────`)
    try {
      execFileSync(
        process.execPath,
        ["--import", join(process.cwd(), "scripts/push-test-register.mjs"), entry],
        { stdio: "inherit", env: { ...process.env, PUSH_TEST_OUT: out } },
      )
    } catch {
      // The suite already printed which assertions failed. Recorded and
      // carried on, so a failure in the first suite does not hide the second.
      anyFailed = true
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true })
  if (existsSync(tsconfigPath)) unlinkSync(tsconfigPath)
}

if (anyFailed) {
  console.log("\nsome suites failed")
  process.exit(1)
}
console.log("\nall suites passed")
