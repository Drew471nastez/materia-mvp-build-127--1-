# How the website builder works

A **site** is an install. It owns pages, a page owns an ordered list of
**sections**, and a section is a type, an id and its settings.

A **section type** is a `.storelib` file: `<template>`, `<style scoped>`,
`<script>`, `<schema>`. The template is tree-walked and escaped, never
evaluated. The CSS is rewritten to that one section's id. The schema names the
settings, and the sidebar is drawn from it. The theme ships thirty, in ten
categories.

**Rendering** happens once per surface. A published page compiles on the
server and sends finished HTML and CSS, so no visitor downloads the compiler.
The editor compiles on every keystroke. Both call the same pure function, so
they agree.

**Sections you write** are rows in `store_theme_custom_files`, saved from the
code editor. Saving compiles first: a file that does not compile is never
stored. They shadow the theme's files by path, and appear under "Created by
you".

**Everything is scoped** by install and by the signed-in account, on every
route and in every agent action.

Retired types still render. They are only off the Add Section list, so no page
that uses one goes blank.
