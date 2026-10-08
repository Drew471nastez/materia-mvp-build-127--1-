# Official reference documentation (retrieved/verified 2026-10-08)

These links help compare concepts against real vendor docs. They are **external references**, not copied source code and not proof that Storelib implements them.

## Shopify themes / capabilities
- Theme section architecture: https://shopify.dev/docs/storefronts/themes/architecture/sections
- Section groups (custom global header/footer): https://shopify.dev/docs/storefronts/themes/architecture/section-groups
- Block system: https://shopify.dev/docs/storefronts/themes/architecture/blocks/section-blocks
- Theme blocks / nesting: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/quick-start
- Settings and dynamic sources: https://shopify.dev/docs/storefronts/themes/architecture/settings
- Config: https://shopify.dev/docs/storefronts/themes/architecture/config
- Templates/sections/blocks best practices: https://shopify.dev/docs/storefronts/themes/best-practices/templates-sections-blocks
- Layout: https://shopify.dev/docs/storefronts/themes/architecture/layouts
- Theme architecture limitations: https://shopify.dev/docs/storefronts/themes/architecture/limits
- Theme requirements: https://shopify.dev/docs/storefronts/themes/store/requirements
- Cart Storefront API: https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage
- Checkout UI extensibility constraints: https://shopify.dev/docs/api/checkout-ui-extensions/latest/web-components

Important: Shopify supports configurable sections/groups/blocks, but its theme file limits and checkout extension security constraints are vendor-specific. Do not implement Liquid directly in Storelib just to mimic it.

## AI site building public UX and skills
- Lovable public website generator: https://lovable.dev/build/website-builder
- Lovable official prompting: https://lovable.dev/blog/2025-01-16-lovable-prompting-handbook
- Claude frontend-design public skill: https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md
- UI UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Impeccable: https://github.com/pbakaus/impeccable
- Vercel agent skills: https://github.com/vercel-labs/agent-skills

Integrate legal/public skill contents according to each original license. Their written prompts are not training datasets and this ZIP is not fine-tuned model weights or reverse-engineered private Lovable/Base44/Bolt logic. The user-facing builder requires its own real runtime orchestration plus actual Storelib code.

## Bolt user-facing capabilities (public docs, not proprietary architecture)
- https://support.bolt.new/building/quickstart — prompt-to-working webapp with auth/favorites and publish
- https://support.bolt.new/building/using-bolt/project-settings — project knowledge and version/backup workflows
- https://support.bolt.new/building/intro-bolt — product supports web pages and applications
