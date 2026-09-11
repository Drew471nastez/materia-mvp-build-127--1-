# Creating a section

Copy this into `sections/testimonial.storelib`, save, and it is in Add Section
under "Content" with the preset shown.

```html
<template>
  <section class="testimonial" data-scheme="{{ settings.color_scheme }}"
    style="background: {{ scheme.bg }}; color: {{ scheme.paragraph }}; padding: {{ settings.padding }}px 24px;">
    <div class="testimonial__inner">
      {% if settings.heading != "" %}
        <h2 class="testimonial__heading" style="color: {{ scheme.heading }}">{{ settings.heading }}</h2>
      {% endif %}
      <div class="testimonial__grid" style="--cols: {{ settings.columns.desktop }}; --cols-m: {{ settings.columns.mobile }};">
        {% for block in blocks %}
          <figure class="testimonial__card" data-block-id="{{ block.id }}" style="border-color: {{ scheme.border }}">
            <blockquote>{{ block.settings.quote }}</blockquote>
            <figcaption>
              {% if block.settings.photo != "" %}<img src="{{ block.settings.photo }}" alt="">{% endif %}
              <span>{{ block.settings.name }}</span>
            </figcaption>
          </figure>
        {% else %}
          <p class="testimonial__empty">Add a testimonial</p>
        {% endfor %}
      </div>
    </div>
  </section>
</template>

<style scoped>
.testimonial__inner { max-width: 1100px; margin: 0 auto; }
.testimonial__heading { margin: 0 0 32px; font-size: 32px; line-height: 1.15; }
.testimonial__grid { display: grid; gap: 20px; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); }
.testimonial__card { margin: 0; padding: 24px; border: 1px solid; border-radius: {{ theme.radius.medium }}px; }
.testimonial__card blockquote { margin: 0 0 16px; font-size: 17px; line-height: 1.5; }
.testimonial__card figcaption { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.testimonial__card img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.testimonial__empty { opacity: .6; }
@container (max-width: 640px) { .testimonial__grid { grid-template-columns: repeat(var(--cols-m), minmax(0, 1fr)); } }
</style>

<schema>
{
  "type": "testimonial",
  "name": "Testimonials",
  "category": "Content",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "What customers say" },
    { "type": "range", "id": "columns", "label": "Columns", "default": 3, "min": 1, "max": 4, "step": 1, "responsive": true },
    { "type": "range", "id": "padding", "label": "Vertical padding", "default": 64, "min": 0, "max": 160, "step": 8, "unit": "px" },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" }
  ],
  "blocks": [
    { "type": "quote", "name": "Testimonial", "settings": [
      { "type": "textarea", "id": "quote", "label": "Quote", "default": "" },
      { "type": "text", "id": "name", "label": "Name", "default": "" },
      { "type": "image_picker", "id": "photo", "label": "Photo", "default": "" }
    ]}
  ],
  "max_blocks": 12,
  "presets": [
    { "name": "Testimonials", "blocks": [{ "type": "quote" }, { "type": "quote" }, { "type": "quote" }] }
  ]
}
</schema>
```

## What happens on save

1. The file is compiled (02, 12). If it fails, the editor shows each error
   with its line and the file is not stored.
2. The section library is rebuilt from `sections/*.storelib`. The section
   appears in Add Section with its presets; the sidebar for an instance is
   generated from the schema.
3. Open instances re-render. Their content is untouched; only how it is drawn
   changed.

## Checklist

- `type` equals the file name.
- Every setting has a stable `id` you are willing to keep forever.
- Every default is a valid value for its type.
- The template reads every setting (the compiler warns about ones it does
  not).
- `data-block-id` on each block's root.
- No `<script>` in the template, no `window` in the script, no `@import` in
  the style.
- One preset at least, or the section will not be offered.

## Renaming, duplicating, deleting

Rename `sections/a.storelib` to `sections/b.storelib` and the schema's `type`
must change with it; instances of `a` on any template keep their data and
render nothing until the type exists again. The editor warns with the list of
templates that use it before a rename or delete goes through.
