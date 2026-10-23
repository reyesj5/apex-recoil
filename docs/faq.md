# Frequently asked questions

## Mouse sensitivity

It's assumed that your Windows sensitivity is 6/11 (x1.0) and the "Enhance pointer precision" is off so every mouse count equals 1 pixel on the screen.

If you see a warning that "Active area is too small!" then it means that either browser's window is too small (resize it!) or in-game sensitivity is very low and recoil pattern will not fit the screen. In this case you should lower your mouse sensitivity for the app:

- most of mouse control software supports multiple CPI settings. Switch to a lower value e.g. from 2000 to 1000 CPI.

- use an [AutoHotkey](https://www.autohotkey.com/) script to switch between normal and half sensitivity ([SCRIPT URL]).

after you've reduced you mouse speed you can then multiply web app sensitivity by the same value (e.g. x0.5 mouse speed -> x2 sensitivity).

## How accurate are the patterns?

Patterns were checked by replaying them in-game with several scopes and game options (such as FOV and mouse sensitivity), using a hardware mouse simulator (an Arduino board). Newer patterns can also be measured from recordings with the recoil discovery tools ([capture guide](capture.md)). [REVIEW: describe how patterns are verified today.]



## Controller support

You can try to use Steam controller support `Settings > Controller > Desktop Configuration`.

These Steam controller values should come close to the in-game sensitivity:

| Apex Legends     | 1     | 2     | 3     | 4     | 5     | 6    | 7     | 8    |
|------------------|-------|-------|-------|-------|-------|------|-------|------|
| Steam controller | 0.123 | 0.198 | 0.388 | 0.594 | 0.939 | 1.12 | 1.222 | 1.24 |

Pick the response curve, [this post might help](https://www.reddit.com/r/apexlegends/comments/bpkzn4/advanced_look_controls_response_curve_guide/).

Steam does not disable mouse movement for non-steam games, your controls might be funky.

*Disclaimer*: these values were not tested with a physical controller. They were computed with an [Xbox controller emulator](https://github.com/dmadison/ArduinoXInput) and a linear response curve; emulating a gamepad's recoil movement is not trivial.

## How scoring works

Scores are counted separately for different settings (mag, weapon, enabled hints).

[Scoring formula](https://www.desmos.com/calculator/j7vjbzvuly) (x = distance to the "ideal" point normalized to the mouse sensitivity).

The reasoning for the shape and constants selection:
1. Small errors should not decrease the score a lot.
2. Increasing the error value should gradually decrease the score to almost 0 at a distance of 100px (approximate body size from 20m). In-game "score" a binary value that suddenly drops drops "hit" to "no-hit" but that would not be useful for training.

## No registration?

As you probably noticed there is no registration and email confirmation.
Settings and scores are stored locally in your browser. So they might be lost browser or system update.

## FPS

Normally you should see FPS values around 60: that's the default browser cap on animations. From time to time browser can also decide that 30 FPS is all you need - restarting usually helps.

## I have an issue/idea!

If something is broken or you have an improvement idea, please create an issue ([ISSUES URL]).