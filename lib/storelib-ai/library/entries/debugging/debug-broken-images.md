---
id: debug-broken-images
title: Missing and broken images
category: debugging
summary: Empty image boxes, wrong crops and broken URLs in generated sections; guards, placeholders for editors and credit requirements.
intents: [debug, repair, fix]
tags: [debugging, bug, images, broken-image, placeholder, asset]
phases: [repair, review]
priority: 3
related: [responsive-images, storelib-honest-data]
version: 1
---
- **Empty setting renders a broken box**: wrap images in `{% if settings.image %}` and show an editor only placeholder in the else branch.
- **Wrong crop**: set `object-fit` and `object-position`; for faces, top or a focal point setting.
- **Remote URLs typed into markup**: images belong in image_picker settings (printed with `| asset`), so they are stored, resized and editable.
- **Huge files**: use the asset pipeline sizes and `srcset`; never ship 5MB originals.
- **Open licence photos**: keep the credit (the AI builder writes a photo credits page) and do not strip attribution requirements.
- **Alt missing**: every image has alt, from a setting when the creator should control it.
