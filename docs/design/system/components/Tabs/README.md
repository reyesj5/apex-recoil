# Tabs

Tabs switch between the Studio's capture methods, each with its own panel below.

- Equal-width tabs on an `inset` track with a `divider` line, 3 px padding and `radius-card` corners. Tabs are 32 px (`size-tab`), 13 px at 600 in `text-secondary`, `radius-segment` corners.
- The selected tab fills with `divider` and its text turns `text`, like the neutral segmented control: the text change and `aria-selected` carry the state.
- Full words for each method: `Live`, `Screenshots`, `Manual`.

Use tabs when each choice shows a different panel of controls; to change a setting, use a segmented control.

Provide: a tab list label, the tabs and their panels. Arrow keys move between tabs.

In the app: shadcn/ui Tabs.
