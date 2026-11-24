# ProgressBar

A progress bar shows a share or a running job: runs per weapon on the Progress page, analysis progress in the Studio.

- 6 px high, `hover` track, `volt` fill, 3 px rounded ends (`sd-progress`, `sd-progress__value`).
- In a weapon row (`sd-progress-row`): the weapon art (64 × 28) on the left; the name at 13 px 600 with the run count in `text-secondary` on the right; the bar; a footnote at 11 px `text-muted` with the best score in `text`: `Best 96 · median 74`.
- For a job, the bar goes with a toast or the status bar that says what is running (`Analyzing 3 sprays`) and a way to cancel.

Provide: the value and maximum (or the share), and the words around it. The bar is a `role="progressbar"` with `aria-valuenow`, or decorative when the same number is written next to it.

In the app: shadcn/ui Progress.
