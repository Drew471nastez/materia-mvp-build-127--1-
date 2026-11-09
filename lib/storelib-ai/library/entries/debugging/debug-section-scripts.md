---
id: debug-section-scripts
title: Section scripts that break
category: debugging
summary: Common failures in section scripts: querying the whole document, duplicate ids, running before markup, listeners that leak, and the sandbox.
intents: [debug, repair, fix]
tags: [debugging, bug, javascript, script, sandbox, queryselector, events]
phases: [repair, review]
priority: 4
related: [debug-common-markup, multi-instance]
version: 1
---
- **Query inside the section's root**, never `document.querySelector`: a section can appear twice, and the second instance would control the first.
- **No fixed ids**; build them from the section id.
- **Assume the markup can change** in the editor: re-query on updates, do not cache nodes forever.
- **Clean up**: observers and listeners on window should be disconnected when the section is removed (keep references).
- **Do not block rendering**: content must be visible and usable without the script; the script enhances.
- **Sandbox**: section scripts run in a sandbox against a copy of the section; declare the capabilities the schema needs (for example `embed`); remote script imports are not allowed.
- **Errors**: one exception stops the rest of the script; guard optional elements (`root.querySelector('.x')?.addEventListener(...)`).
