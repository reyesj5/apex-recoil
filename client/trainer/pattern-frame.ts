import { useMemo } from 'react';
import { useTrainerSettings } from '@/lib/storage/trainer';
import { weapons } from './catalog';
import { useSetupSettings, weaponSetup } from './loadout';
import { patternDrawing, sharedFrame, type Frame } from './range/pattern-preview';

/**
 * The frame the pattern views draw every weapon in, with the stored magazine, fire mode and
 * sensitivity: one scale for all of them, so the library, the selected pattern and the phone's
 * viewer compare weapons as they are
 */
export function usePatternFrame(): Frame {
  const settings = useSetupSettings();
  const sens = useTrainerSettings((s) => s.sens * s.ads);
  const invertY = useTrainerSettings((s) => s.invertY);
  return useMemo(
    () =>
      sharedFrame(
        weapons.map((w) => {
          const { weapon, capacity, mode } = weaponSetup(w, settings);
          return patternDrawing(weapon, capacity, mode, { sens, invertY }).frame;
        }),
      ),
    [settings, sens, invertY],
  );
}
