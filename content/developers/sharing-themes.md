# Sharing themes

A theme travels as a file. You export a website from your library as one `.storelib-theme.zip`, send it however you send files, and the other creator imports it into their library as a new draft. A preview link shows your unpublished work to someone without handing them anything, and Duplicate copies a website inside your own account.

> **Note** There is no public theme store yet. Sharing is a file one creator hands another, and nothing on Storelib lists, sells or reviews themes.

## Export

In your dashboard, open **Websites**, then the website's **More** menu, then **Export theme**. The browser downloads the website as `<name>.storelib-theme.zip`, a zip any unzip tool opens. The format is in [Themes](/developers/themes#the-package-format).

| Part | What goes in the file |
| --- | --- |
| Theme settings | The draft: your latest changes, whether or not they are published. |
| Pages | Each page **as last published**. Changes to a page since then are not in the file, and on a website that has never been published that means the pages as the website was made. Publish before exporting to include them. |
| Section files | All 33 of the theme's section files, with your published version in place of any you changed, and every section file of your own that has been published. A file you have saved and not published goes out as its published version, or not at all. |
| Media | Every picture, video, sound and file a setting or a page points at, downloaded and named by the SHA-256 of its bytes. Each link to one becomes `asset://` and that hash. |
| Cover | The newest pictures of the website, desktop and phone, for the library card of whoever imports it. |

Your brand name, logo, favicon, social links, the announcement bar and the SEO text are theme settings, so they travel with the theme. Change them after importing a theme someone else made.

Media is carried within these limits. A link to a file of any other type is not downloaded, and travels as the link:

@[media-types]

A file that cannot be downloaded, or is over its limit, is left out of the package and **the setting that pointed at it arrives empty**, so the section shows what it shows when nothing has been chosen. It is never left pointing at your storage. The library does not say what was left out yet. A YouTube or Vimeo link is a link rather than a file, so it travels as it is.

## Import

In **Websites**, press **Import theme** and choose the file. It takes a `.storelib-theme.zip`, and a `.storelib-theme` or `.zip` file as well. The file goes straight to storage with a progress bar, then the import reads it from there.

Before anything is written, the whole package is checked, and **one failure refuses all of it** with the list of reasons:

1. The library has room for another website. It holds five: one live and four drafts.
2. The file is a zip, and 50 MB or less.
3. It holds 2000 files or fewer. By the sizes the zip declares, before anything is unpacked, each text file is 5000 KB or less, each asset 15 MB or less, and the whole 200 MB or less.
4. Every path is `theme.json`, `manifest.json`, or inside `config`, `layout`, `templates`, `sections`, `blocks`, `snippets`, `assets` or `locales`. The files sit at the root of the zip, not inside a folder.
5. `theme.json` has `"format": "storelib-theme"`, a name, and asks for no newer engine than this one.
6. Every file and asset is in `manifest.json`, and every SHA-256 and asset size matches.
7. Every `sections/<type>.storelib` compiles, and every `blocks/<type>.storelib` compiles as a theme block. The file name is the type.
8. A section file that is a header or a footer is not refused: it is **left out**, with every use of it on a page, and the import says so. The website keeps its own header and footer; change theirs in the `header` and `footer` entries of the templates instead. See [The header and footer](/developers/header-and-footer).
9. Every `templates/*.json` has `sections` and `order`, holds 60 sections or fewer with 50 blocks or fewer each, and every section on it is a type the package has or a type Storelib has.

Then the import writes a **new draft website** with the name in `theme.json`:

- Each asset is stored in your account and every `asset://` reference is replaced by its new address. A file's type is taken from its extension, never from what the package says it is. An asset of a type Storelib does not take is dropped, and the setting that pointed at it is emptied.
- The theme settings and every page are cleaned against the same HTML allow list the builder's own saves go through: script, event handlers and `javascript:` links are removed before anything is stored.
- Section files that differ from the theme's own are stored as your files. One identical to Storelib's copy is not, so the website keeps following Storelib's version.
- The package's cover goes on the library card, and a new picture of the website is taken after.

The new website is a draft. Open it, look at every page, and publish it when it is right.

Starting an import is limited to 5 a minute and 30 an hour for each account. Exports made before the package format existed, a zip with its own `manifest.json` and an `images` folder, are still read and converted on the way in.

> **Warning** A theme someone else made is their code on your site. The importer compiles every section, cleans the HTML in settings and pages, and a template cannot hold a script or an event handler. One thing it cannot judge is `| raw`, which prints a value as HTML. Before you publish a theme you did not build, open its section files in the code editor, search for `| raw`, and check each one is on a `richtext` setting.

## Editing a package by hand

A package is a folder with a manifest, so it can be edited outside Storelib: by you, or by an AI agent working on the files. Three things decide whether the import takes it back:

1. **Update the manifest.** The import recomputes the SHA-256 of every file and refuses a package where one does not match, or where a file is not listed. Run this in the unzipped folder after editing, with Node 18 or later:

```js
// update-manifest.mjs: run inside the unzipped theme folder, after editing it
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const walk = (dir) =>
  readdirSync(dir)
    .filter((name) => !name.startsWith("."))
    .flatMap((name) => {
      const path = dir === "." ? name : join(dir, name)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"))
manifest.files = {}
for (const path of walk(".")) {
  if (path === "manifest.json" || path.startsWith("assets/")) continue
  const bytes = readFileSync(path)
  manifest.files[path] = { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length }
}
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n")
console.log(`${Object.keys(manifest.files).length} files listed`)
```

2. **Zip the contents, not the folder.** `theme.json` has to be at the root of the zip. A file whose name starts with a dot, such as `.DS_Store`, is not a path inside a theme, so leave those out:

```bash
cd my-shop
node update-manifest.mjs
zip -r ../my-shop.storelib-theme.zip . -x ".*"
```

3. **Leave the assets as they are.** Each asset is named by the SHA-256 of its bytes and listed under `assets` in the manifest; the script above does not rewrite those. Add new pictures in the builder after importing.

Every section file still has to compile. The quickest check is to paste one into the code editor and save it, or run it through `storelib_compile` from a connected agent; see [Building with AI agents](/developers/ai).

## Preview links

A preview link shows your unpublished changes to someone who is not signed in to your account. On the live website, press **Publish** in the builder's top bar, then **Preview**. The first press makes the link, `<your address>/preview/<token>`, and opens it; the panel then shows it with a copy button and **Turn off**.

- It shows the **draft pages and draft theme settings**. Section files show their published version; a section file you saved and have not published is not in a preview yet.
- The site's pages are under it: `/preview/<token>/<page>`, the shop at `/preview/<token>/products` and each product at `/preview/<token>/products/<slug>`.
- Search engines are told not to index it.
- There is one link per website, a random 32-byte token checked against the database. **Turn off** removes it, and every copy of it stops working at once. Pressing Preview again makes a new one at a new address.
- It is for the website that is live. A website that is not live has Save in place of Publish, and no Preview; a link made for one anyway, by a connected agent's `storelib_run_preview`, opens your live website instead, or your page on storelib.com when nothing is live. To show work in progress, make the changes on the live website: they stay drafts until you publish.

A preview link grants reading that one website's drafts. It is not access to the account, its products or its other websites.

## Duplicate

**Websites › More › Duplicate** copies a website as it stands, into a new draft named with `(copy)` after it. The library needs a free place for it.

| Part | Copied |
| --- | --- |
| Theme settings | The draft and the live copy |
| Pages | Every page, draft and live |
| Section files | Every file of yours, draft and live |
| Media | The same links, to the same files in your storage |
| Cover | Yes, then a new picture of the copy |

## What does not travel

| | Export and import | Duplicate |
| --- | --- | --- |
| Unpublished changes to pages and section files | No | Yes |
| The preview link | No | No |
| Backups and each file's history | No | No |
| Connections: Claude Code, Codex, GitHub | No | No |
| The address and a connected domain | No | No |
| Products, orders, customers and subscribers | Never | Never |

A theme is the website's look and content. The account behind it stays where it is.
