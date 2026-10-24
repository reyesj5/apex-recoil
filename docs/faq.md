<!-- description: Answers about mouse sensitivity, pattern accuracy, controller support, scoring and where your data is stored. -->

# Frequently asked questions

## Mouse sensitivity

It's assumed that your Windows sensitivity is 6/11 (x1.0) and the "Enhance pointer precision" is off so every mouse count equals 1 pixel on the screen.

If the range says it is too small for the pattern, either the browser window is too small (make it larger) or your in-game sensitivity is so low that the recoil pattern doesn't fit the screen. In that case, lower your mouse sensitivity for the app:

- Most mouse software supports several CPI settings. Switch to a lower one, for example from 2000 to 1000 CPI.

- Use an [AutoHotkey](https://www.autohotkey.com/) script to switch between normal and half sensitivity ([SCRIPT URL]).

After you've reduced your mouse speed, multiply the app's sensitivity by the same factor (for example, half the mouse speed means twice the sensitivity).

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
2. Increasing the error value should gradually decrease the score to almost 0 at a distance of 100px (approximate body size from 20m). In the game a shot either hits or misses, which would not be useful for training.

## No registration?

There is no registration and no email confirmation.
Settings and scores are stored locally in your browser, so a browser or system update might lose them.

## I have an issue/idea!

If something is broken or you have an improvement idea, please create an issue ([ISSUES URL]).