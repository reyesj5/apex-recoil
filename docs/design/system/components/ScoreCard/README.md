# ScoreCard

The score card answers "how did that run go": the last score in the session panel, and the result card that floats over the range after each run.

- Session card (`sd-score`): `card` fill, `outline-card` line, `radius-card-lg`, 16 px padding. `Last score` in `small` `text-secondary`, the score in `score-lg` (Chakra Petch 56 px) with `/ 100` after it in `text-muted`. Before the first run it shows `–` and the hint "Your first run today shows up here."
- Run result (`sd-result`): 280 px wide over the range's top right, `panel-glass` fill, a `divider` line, `radius-panel`, 18 px padding, `shadow-float`. From the top: the `section-label` `Run complete`; the score in `score-xl` (72 px) in `volt` with `/ 100`; the delta pill and its words (`↑ 9 above today's median`); the setup in `small` `text-muted` (`R-301 · Lv 2 magazine (28) · Follow path`); and two equal buttons, `Replay` (secondary) and `Next run` (primary).
- The result appears when the run ends, never during it, and announces itself (`role="status"`).

Provide: the score, today's median, the weapon, magazine and mode, and the Replay and Next run handlers.

In the app: our own `ScoreCard` on shadcn/ui Card.
