# ConsentBanner

The consent banner asks once whether Google Analytics may run, with Reject and Accept given equal weight.

- Desktop card (`sd-consent`): `raised` with an `outline-strong` line, `radius-panel` corners, 14 px padding, at most 360 px wide, in a bottom corner. The text is 12 px `text-soft` at 1.5 line height, with the `Privacy policy` link in `volt`, underlined.
- Two buttons of equal size side by side: `Reject` (`panel` fill, `outline-strong` line, `text`) and `Accept` (primary). Neither is styled as the default; neither is hidden behind a link.
- Phone sheet (`sd-consent--sheet`): full width with 12 px margins, `radius-sheet` corners, `shadow-sheet`, 13 px text and 44 px buttons.
- The text: "We use Google Analytics cookies to see how the trainer is used. Nothing is tracked unless you accept."
- Shown only where analytics runs (the public trainer pages), never in the Studio. A `Cookie settings` link in the legal footer reopens it.

Provide: the privacy policy link and the two handlers. Nothing loads from Google before Accept.

In the app: our own `ConsentBanner` on shadcn/ui Card, driving the Google tag's Consent Mode.
