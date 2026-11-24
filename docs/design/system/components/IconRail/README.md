# IconRail

The icon rail switches between the Studio's sections: Capture, Library, Sessions and Import.

- 64 px wide on `inset` with an `outline` rule on its right, items stacked 6 px apart from 12 px down.
- Items (`sd-rail__item`): 48 × 52 px, `radius-card`; a 20 px icon over a `micro` label (10 px), both `text-muted`. The current section fills with `hover`, turns `text` and carries `aria-current="page"`. Hover does the same without the marker.
- Every item has its short label under the icon and its full name as the accessible name (`Screenshot library`, `Saved sessions`, `Import discovery JSON`).

Provide: the sections (icon, short label, full name) and the current one.

In the app: shadcn/ui Sidebar in its collapsed icon mode.
