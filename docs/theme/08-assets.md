# Assets

An asset is a binary file a theme uses: an image, a video, a font, a PDF. A
theme refers to one by its content, never by where it happens to be stored.

## The reference

```
asset://3f2a9c0e4b1d…  (SHA-256 of the bytes, hex)
```

That string is what a setting of type `image_picker`, `video_picker`,
`file_picker` or `image_gallery` holds. It is what a template file stores, what
a package carries, and what the AI reads. It is never a URL.

- Two identical files are one asset, wherever they came from.
- Moving storage buckets, changing CDNs or re-encoding nothing changes any
  template, because no template knows where the bytes are.
- A package from one account imports into another: the hashes match the files
  in its `assets/` folder, and the importer stores them under the new account.

## Metadata

Each asset has a record (`AssetRecord` in `types.ts`):

```json
{
  "id": "3f2a9c0e…",
  "filename": "hero-wide.jpg",
  "mime_type": "image/jpeg",
  "width": 2400,
  "height": 1200,
  "size": 412883,
  "hash": "3f2a9c0e…",
  "alt_text": "A workbench with tools",
  "created_at": "2026-09-01T10:00:00Z"
}
```

`url` exists on the record only inside an account, is filled in at render
time, and is never exported.

## In a template

Settings are resolved before the template runs, so an image setting is already
a URL:

```html
<img src="{{ settings.image }}" alt="{{ settings.image_alt }}">
```

A reference held somewhere else (a block's raw settings, a string a person
typed) goes through the `asset` filter:

```html
<video src="{{ block.settings.clip | asset }}"></video>
```

A reference the account does not have resolves to `""`, and a template should
treat an empty image as "no image", never as an error.

## In a package

`assets/<hash>.<ext>`, one file per asset, plus each asset's metadata in the
manifest. Limits: one asset up to 15 MB, the package up to 50 MB
(`LIMITS`). The importer recomputes every hash and refuses a package whose
file does not match its name; a mismatch is a corrupted or tampered package,
not a warning.
