# Universal generation pipeline — Lovable-class outcome, Storelib-native execution

This is an **original proposed architecture** based on common public agent patterns and the user-facing workflow of website generators. NOT Lovable, Bolt or Base44 private implementation.

## Agent flow
1. **Normalize input**: main prompt; conversation/attached images; URL references when allowed; known project scope, site type, merchant settings, current page/editor selection; request classification; user constraints.
2. **Intent & scope**: create-new, add-page, edit-specific-section, rebuild-section, modify-component, site-wide style, rebuild-full-site, add-business-feature, repair, reference-recreation, webapp. Detect explicit preserve/remove constraints.
3. **Capabilities snapshot**: typed Storelib product/commerce/data/backend APIs, theme grammar, feature flags, available fonts/media and tenancy privileges. Surface unsupported features honestly.
4. **Creative director**: category research from local design corpus (licensed public design knowledge); choose art direction, page architecture, interaction patterns, content density, visual tokens, media needs; avoid generic repetition.
5. **SitePlan and ChangePlan**: intent-aware pages, templates, sections, app workflows, data dependencies, content strategy, assets, settings, acceptance checks; plan size proportional to request.
6. **Execution graph**: create/update foundations, layout, assets and data bindings before dependent pages. Parallelize independent pages only after shared tokens/data contracts stable.
7. **Generate**: new sections and components or transformed existing ones; create settings with code; connect dynamic values and actions; compile Storelib AST to validated theme/native runtime code.
8. **Verify structural pass**: syntax/parser/type/schema, manifest, links/routes, IDs, settings, assets, bindings, permissions, server handlers, backend state and commerce simulations.
9. **Verify visual pass**: render previews at mobile, tablet, desktop; inspect image/text/motion UX; compare screenshots/reference and page completeness; fix until checks pass or explicit blockers.
10. **Deliver**: atomic draft change set, rollback snapshot, page summary, preview and exact verification results; publish only when allowed and validated.

## Tool contracts
Each tool has typed inputs/outputs, permission checks, side-effect classification, idempotency tokens and retry policy. Essential tools: `read_project`, `read_theme_contract`, `read_capability_snapshot`, `list_pages_and_sections`, `get_merchandise_data`, `read_assets`, `inspect_attachments`, `write_change_plan`, `create_page`, `create_or_replace_section`, `create_component`, `generate_assets`, `validate_theme`, `preview_site`, `capture_screenshot`, `compare_reference`, `run_interaction_tests`, `stage_change`, `commit_change`, `rollback`.

Do not let generator outputs write unvalidated files directly to live storefront. Tool errors must be observable and repairable by AI; respond with machine-readable diagnoses and stable IDs; prevent accidental duplicate sections/pages on retry.

## Avoid brittle universal hardcoding
Use a rule selector: user intent, site kind, scope, actual platform feature flags, selected design principles and context. Architectural invariants stay; visuals, arrangement and interactions can be freely generated. Avoid always generating 7 pages, forcing 4 sections per page, using fixed header/hero/footer, or auto-adding carts to pages that do not sell physical goods.

## Budget / reliability
Keep a compact project snapshot and retrieve relevant docs per action instead of stuffing all external Markdown into the prompt. Bound loops to avoid uncontrolled cost. For long projects, persist job graph & partial compile results, show state and safe resume. Human confirmation for irreversible production effects (payouts, destructive data operations, publishing if not explicitly authorized). Fail gracefully when context/assets are unavailable.
