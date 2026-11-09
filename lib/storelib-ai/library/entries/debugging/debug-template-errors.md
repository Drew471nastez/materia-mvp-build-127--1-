---
id: debug-template-errors
title: Template and schema compile errors
category: debugging
summary: Reading Storelib section compile errors: undeclared settings, wrong filters, unsupported syntax, invalid JSON, and how to repair with minimal edits.
intents: [debug, repair, fix]
tags: [debugging, bug, compile, template, schema, liquid-like, undeclared]
phases: [repair, review]
priority: 4
related: [core-iteration, debug-section-scripts]
version: 1
---
- **Undeclared name**: `{{ settings.foo }}` without a schema setting id `foo`. Add the setting (with the right type) or fix the typo; block settings are declared under the block type.
- **Framework syntax**: `v-if`, `@click`, `:class`, JSX braces are refused. Use `{% if %}`, `{% for %}`, `{{ }}`.
- **Wrong type**: a picture must be an `image_picker` and printed with `| asset`; a link a `url` with `| url`; a menu a `link_list`.
- **Raw HTML**: `| raw` only on richtext settings.
- **Schema JSON**: trailing commas, comments and single quotes make it invalid; validate the JSON.
- **Unclosed tags**: every `{% if %}` needs `{% endif %}`, every `{% for %}` `{% endfor %}`.

**Repair** the exact line reported; do not rewrite the file. Re-run the compiler after each fix.
