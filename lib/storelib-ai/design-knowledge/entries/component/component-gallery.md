---
id: component-gallery
title: Image galleries and lightboxes
category: component
summary: Gallery layouts for different ratios, lightbox behaviour, captions, lazy loading and image sizes.
intents: [build-component, build-section]
tags: [gallery, lightbox, images, photos, grid]
components: [gallery, lightbox]
capabilities: []
phases: [build, review]
priority: 4
related: [layout-masonry, industry-photography, gallery]
version: 1
---
**Layouts**: uniform grid (one ratio, cropping acceptable for products), masonry or justified (mixed ratios, no cropping), editorial sequence (varied sizes with captions).

**Images**: `width` and `height` attributes always (prevents layout shift); `loading="lazy"` except the first row; `srcset` and `sizes` that match the column width (`sizes="(min-width: 1000px) 33vw, 50vw"`); `alt` describing the content, or empty `alt=""` for purely decorative repeats.

**Lightbox**: opens as a modal dialog; arrows and swipe for next and previous; Escape closes; focus returns to the thumbnail; image fits the viewport (`object-fit: contain`, max 100svh); caption and counter visible; preload the next image only.

**Hover**: subtle (scale 1.02 to 1.04 inside an overflow clip, or a caption reveal). No heavy zoom or rotations.

**Storelib**: gallery images are block image_pickers the creator manages, not hard coded URLs.
