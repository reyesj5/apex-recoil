# Studio capture check

The Studio's live capture shares the game window with `getDisplayMedia`, listens to its sound with the Web Audio API and records sprays with `MediaRecorder`. Headless browsers can't do any of that, so the end-to-end scenarios (`e2e/studio.spec.ts`) cover everything around it (imported clips, analyses, sessions) and the capture sequence itself is a tested reducer (`client/studio/model/capture.ts`). This check covers the rest by hand. Run it after a change to the Live tab (`client/studio/panels/live-tab.tsx`, `use-live-capture.ts`) or to the media helpers (`client/studio/media.ts`), and before a release.

You need Windows with Apex Legends, Chrome or Edge, and the app running (`pnpm dev`, or `pnpm build && pnpm start`). Write down the browser and its version, the date, and anything that differs from what is expected.

## 1. Connecting

1. Open `/editor`, Capture, Live. The Live recording card shows **Not connected** and **Trigger idle**.
2. Click **Connect game window**. In the browser's dialog, choose the Apex Legends window and tick **Share system audio** (or "Also share tab audio").
   - Expected: the badge turns to **Connected**, the preview shows the game, and the trigger badge says **Listening for gunfire**.
3. Change the Color correction (Setup) between HDR fix (natural), HDR fix (vibrant) and None.
   - Expected: the preview's colors change at once.
4. Cancel the dialog instead (Disconnect, then Connect again and close the dialog).
   - Expected: a notice says screen sharing didn't start, and nothing else changes.

## 2. The gunfire sensor

1. In the Firing Range, stand 20 m from the target wall with the optic of the Setup card.
2. Fire a few single shots.
   - Expected: the Gunfire sensor bar jumps past the Trigger level line and turns amber.
3. Move the Trigger level slider.
   - Expected: the line moves with it, and a level below the line no longer starts a recording. The value is kept after a reload (`editor:trigger-threshold`).
4. Pick a microphone or line-in under Audio input, then System audio again.
   - Expected: the sensor follows the chosen input. With System audio and a share without sound, a notice asks to reconnect or pick a microphone.
5. Change the Windows output device while connected.
   - Expected: a notice says the audio devices changed; **Reconnect** brings the sensor back.

## 3. Recording a spray

1. Fire a full magazine at the wall, and let it reload.
   - Expected: the trigger badge says **Recording the spray** and the preview shows **● Recording** from the first shot.
2. Stop firing.
   - Expected: after 0.7 s of silence the preview asks you to aim back at the wall and counts the Reload and re-aim time down (4.5 s by default).
3. Aim back at the decals and hold still.
   - Expected: when the count reaches 0, a sample appears under Samples: **Spray #1**, its duration, the clip and the wall screenshot. The wall shows the decals in focus, with the color correction applied.
4. Record another spray, and this time press **Space** (or **Snap wall**) as soon as you aim at the decals.
   - Expected: the wall is captured at once.
5. Fire a burst weapon (the Hemlok or the Nemesis) with pauses shorter than the re-aim time between bursts.
   - Expected: one recording for the whole magazine; a burst during the count carries on recording.
6. With **Record a spray by hand**, start a recording without firing, wait 3 s, and click **Finish the spray**.
   - Expected: a sample appears. One shorter than 0.8 s is dropped (the console says so).
7. Hold the trigger for more than 20 s (or record by hand without stopping).
   - Expected: the recording stops by itself after 20 s and keeps the sample.

## 4. Working with the samples

1. **Show on the canvas** (the eye, or a click on the wall).
   - Expected: the wall appears on the canvas with the weapon's pattern over it.
2. **Capture the wall again**.
   - Expected: three beeps and a 3 s count, then a higher beep; the sample's wall is replaced and shown on the canvas.
3. **Play the sound**, and play the clip in the card.
   - Expected: you hear the gunfire, the trigger badge says it is muted while a sample plays, and no new recording starts. It listens again 1.5 s after the playback stops.
4. **Record this spray again**, then record a spray.
   - Expected: the card is marked **Next recording replaces it**, and the new spray replaces it under the same name.
5. **Save the wall image**, **Enlarge** and **Discard**.
   - Expected: a JPEG named `<weapon>_spray_<n>_wall.jpg` downloads; the clip opens large, muted; the sample goes and the others are renumbered.
6. Switch to the Screenshots tab and to the Sessions section while connected, and come back.
   - Expected: the capture stays connected, and a spray fired meanwhile is recorded.

## 5. Analyzing

1. With three sprays recorded, click **Analyze the sprays**. Keep the weapon, the fire mode, **Keep the files in the captures** and **Blend into the spec**, and click **Analyze**.
   - Expected: the progress shows its stage and percentage, then **Analysis complete** with the shots found, the measured fire rate and the convergence. The canvas shows the first spray's frame with the median pattern over its decals; [ and ] go through the sprays.
2. **Compare** (or O).
   - Expected: the saved spec (dashed) and the candidate with a line for each shot that strays, and the figures in the corner.
3. **Save spec** (Ctrl S).
   - Expected: the checkpoint with the figures; **Save spec** saves, and a toast names the new version.
4. In Sessions, find the session just saved and **Load** it.
   - Expected: its sprays come back into the Live tab with their walls.
5. **Disconnect**.
   - Expected: the badges return to **Not connected** and **Trigger idle**, and the browser's sharing indicator goes away.
