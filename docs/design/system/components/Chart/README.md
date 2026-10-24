# Chart

Charts show a player's trend: today's runs in the session panel, and the score per day on the Progress page.

- Today's trend (`sd-trend`): a card with `Today's runs` and the try count on top, a 72 px line of the scores in `volt` (2 px, round joins) ending in a 4 px dot at the last run, and today's median as a dashed `outline-strong` line. The foot names both ends: `First run`, `Median 78 (dashed)`.
- Score per day (`sd-chart-card`): a `panel` card with a 15 px heading and a legend; the best score per day in `volt` (2.5 px), the median in `text-secondary` (2 px), tries per day as `chart-bar` bars along the bottom. Gridlines every 10 points in `hover`, axis labels at 11 px `text-muted`.
- `chart-bar` stands only 1.4:1 off `panel`, so give the tries in a tooltip and in the table as well.
- Every chart has a text alternative that states the trend: "Best and median score per day over the last 30 days; best rises to 96, median 74."
- Before any runs, show an `sd-empty` well instead: "Your runs from today appear here as a trend."

Provide: the series (date, best, median, tries) and the text alternative.

In the app: shadcn/ui Chart (Recharts), loaded only when a chart is on screen; colors from `chart-1` (volt) and `chart-2` (text-secondary).
