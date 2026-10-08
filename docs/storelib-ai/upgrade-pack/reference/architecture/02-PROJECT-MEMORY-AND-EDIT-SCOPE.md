# Real project memory and edit scope semantics

**Not a chat-only history.** Persist a versioned project state: all routes/pages/templates, sections and components with stable UUIDs, AST/code files, settings values, sources and commerce bindings, design tokens, user preferences, image references/license metadata, project goals, constraints, prior changes, current AI jobs, errors and dependencies. Context retrieval is scoped to the current action.

## Scope intent table
| User wording | Mode | Expected action |
|---|---|---|
| 'Make the FAQ a bit more modern' | `section_modify` | Preserve logic/content/bindings; update style/settings reasonably |
| 'Completely redesign the FAQ section' | `section_replace` | New markup/layout/styles/controls; keep FAQ semantics and data; deprecate old section safely |
| 'Change all font sizes across site' | `global_design_change` | Update design tokens or applicable selectors, all pages without content loss |
| 'New header with mega menu' | `component_replace` | Replace header implementation, preserve nav data source and correct menus |
| 'Redo the whole website from scratch' | `site_rebuild` | New visual system, page tree/sections; preserve merchant product/catalog/order/admin data, required policies and explicitly protected content |
| 'Build another landing page' | `page_create` | New route/page, unchanged rest of site |
| 'Match attached screenshot exactly' | `reference_recreation` | Analyze screenshot, plan exact geometry, render comparative previews; acknowledge invisible interactions cannot be inferred |
| 'Remove all shopping functionality' | `site_mode_change` | Remove relevant storefront UI and disable interfaces where allowed; never delete merchant orders or product data unexpectedly |
| 'Update my logo everywhere' | `global_data_binding` | Update central binding, not copied text/image in each header/footer |

## Patch protocol
1. Read the active snapshot and last user constraints; resolve references: this/that/screenshot/selected section.
2. Build a `ChangeSet` with declared scope, entities, preserve list, dependencies and expected outcomes.
3. Preview diff and ask only when ambiguous destruction or money/production effects are involved.
4. Preserve stable identifiers where possible. If replacing a section, migrate safe settings/bindings and update page references; preserve undoability.
5. Apply atomically; test affected pages and cross-page dependencies. Snapshot before mutation; rollback on broken invariants.
6. Persist a human-readable change summary and updated project state for the next turn.

Remember design decisions, brand language, primary audience, preferred typography, product connection, asset references, feature toggles and previous edits. Avoid resurrecting sections the user removed. Never claim background memory unless durable storage is actually implemented.

## Intent disambiguation
Infer from verb/object: 'change' = local patch; 'replace/rebuild completely' = full implementation of named target; 'entire/all/whole' = site-wide; 'like image' = reference visual, with current screenshot attached; 'keep ...' = explicit preservation constraint. When user requests 'better' but scope is selected section, do not change every page.
