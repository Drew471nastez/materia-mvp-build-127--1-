# Real public source material — verified 8 October 2026

This pack's original architecture is informed by the following **actual** public resources. The vendor downloader, when run in a networked environment, retrieves authentic upstream files, preserving their original licenses/notice files rather than pasting unlicensed proprietary content.

## Public design skills (original repositories)

1. **UI/UX Pro Max (Next Level Builder)** — https://github.com/nextlevelbuilder/ui-ux-pro-max-skill — MIT; raw license: https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/LICENSE. Relevant searchable content: landing patterns, style selection, typography, colors, UX and animation. Important: the upstream README recommends its current CLI installation for platform-specific integrations, not simply copying an old SKILL.md into a runtime.
2. **Impeccable (Paul Bakaus)** — https://github.com/pbakaus/impeccable — Apache-2.0; raw license: https://raw.githubusercontent.com/pbakaus/impeccable/main/LICENSE. Design guidance and critique checks; read its NOTICE and license before redistributing a modified copy.
3. **Anthropic Frontend Design skill** — https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md — read online and check `LICENSE.txt` before redistribution; deliberately **not vendored** by this pack.
4. **Vercel Agent Skills** — https://github.com/vercel-labs/agent-skills — React performance and web interface guidelines, reference only. Repository README declares MIT, but at time of compilation its root LICENSE file situation was unclear; deliberately **not vendored**.

## Public product workflow descriptions (not source code)

5. **Lovable official AI website builder** — https://lovable.dev/build/website-builder — describes prompt-to-pages, navigation, editable content, hosting and refinement. This is a *public product description*, not evidence of how Lovable privately orchestrates models.
6. **Lovable Academy prompting best practices** — https://academy.lovable.app/academy/prompting — plan before building, use Knowledge, iterate, preserve existing context.
7. **Lovable official prompting guide** — https://lovable.dev/blog/2025-01-16-lovable-prompting-handbook — publicly describes knowledge/PRD and prompts.
8. **Shopify official theme design best practices** — https://shopify.dev/docs/storefronts/themes/best-practices/design — commerce layout/theme thinking, not Storelib schema and not code to copy.

## Legal / practical notes

These original written Storelib documents are **not copied from any vendor's proprietary prompts**. Use vendor materials according to their individual licenses. Vendor archives are not bundled in this ZIP because download access was unavailable in the creation environment; running `python3 tools/fetch_public_skills.py` performs a transparent download directly from each original GitHub owner. Inspect upstream sources prior to executing their scripts and pin audited revisions before production release. The fetching script's `main` references can move; for reproducibility, pin commit SHAs in your fork before deployment.

Never treat a design skill as an implementation of Storelib-specific theme syntax, asset manifests, sections or payments. Only your actual repo contract determines those.
