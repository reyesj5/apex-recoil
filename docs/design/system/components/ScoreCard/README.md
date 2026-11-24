# ScoreCard

The score card answers "how did that run go": the last score in the session panel, and the result card that floats over the range after each run.

- Session card (`sd-score`): `card` fill, `outline-card` line, `radius-card-lg`, 16 px padding. `Last score` in `small` `text-secondary`, the score in `score-lg` (Chakra Petch 56 px) with `/ 100` after it in `text-muted`. Before the first run there is no score to show: the hint takes its place, in `body` `text-secondary` (`sd-score__empty`): "Your first run today shows up here." No dash and no `/ 100`: a dash at 56 px reads as a bar.
- Run result (`sd-result`): 280 px wide over the range's top right, `panel-glass` fill, a `divider` line, `radius-panel`, 18 px padding, `shadow-float`. From the top: the `section-label` `Run complete`; the score in `score-xl` (72 px) in `volt` with `/ 100`; the delta pill and its words (`↑ 9 above today's median`); the setup in `small` `text-muted` (`R-301 · Lv 2 magazine (28) · Follow path`); and two equal buttons, `Replay` (secondary) and `Next run` (primary).
- Below today's median (`sd-result--below`) the score turns `text` and the pill neutral (`sd-delta--down`: `hover` fill, `text-secondary`, a down arrow): `↓ 7 below today's median`. Volt marks good results only.
- With no median to compare with, a 13 px `text-secondary` line takes the pill's place: `Your first run today`, or `Right on today's median`. A run that isn't saved (released early, or slowed down) says so there instead: `Not saved: only a full magazine at full speed counts.`
- The result appears when the run ends, never during it, and announces itself (`role="status"`).

Provide: the score, today's median, the weapon, magazine and mode, and the Replay and Next run handlers.

In the app: our own `ScoreCard` on shadcn/ui Card.
