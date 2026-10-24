# Slider

Sliders set a level by feel where the exact number matters less: layer opacity and visual scale in the Studio.

- Full width, with the filled part and the thumb in `volt` (`sd-slider`, the browser's range input tinted with `accent-color`).
- Show the value next to the label in JetBrains Mono `text-secondary`, so it can be read and set by keyboard: arrows move by 1, Page Up and Page Down by 10.
- For values players type from the game, such as sensitivity, use an input with the number instead.

Provide: the label, the range, the step and the value. The label names the thumb, which carries the slider role (`aria-label` or `aria-labelledby` on the thumb).

In the app: shadcn/ui Slider (`primary` range and thumb ring, `muted` track).
