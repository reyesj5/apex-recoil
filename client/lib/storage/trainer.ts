import { createPersistedStore, field, flag, number, oneOf, text } from './index';

// The trainer's settings and score history, under the keys the current trainer writes (client/game.ts
// and client/stats.ts, namespace 'game:', so every key starts with 'game::'). Fallbacks are the
// current defaults.
export const trainerFields = {
  weapon: field('game::weapon', text, 'r99'),
  /** The magazine's index in the weapon's list, 0 for the base magazine */
  mag: field('game::mag', number, 0),
  /** 'default' until a weapon's fire mode is chosen; the trainer then stores the weapon's mode */
  fireMode: field('game::fire-mode', oneOf(['default', 'auto', 'burst', 'single']), 'default'),
  /** Attachments by name, such as 'revved_up' */
  mods: field('game::mods', text, ''),
  corruptedStock: field('game::corrupted-stock', flag, false),
  sens: field('game::sens', number, 5),
  scaleX: field('game::scale-x', number, 1),
  scaleY: field('game::scale-y', number, 1),
  invertY: field('game::invert-y', flag, false),
  /** Firing speed in percent */
  speed: field('game::speed', number, 100),
  stationaryTarget: field('game::stationary-target', flag, true),
  movingTarget: field('game::moving-target', flag, false),
  targetSpeed: field('game::target-speed', number, 100),
  /** Show the pattern to follow */
  hint: field('game::hint', flag, true),
  traceMode: field('game::trace-mode', number, 1),
  volume: field('game::volume', number, 20),
  mute: field('game::mute', flag, false),
  showInstructions: field('game::show-instructions', flag, true),
  showDetailedStats: field('game::show-detailed-stats', flag, false),
  showSensitivityWarn: field('game::show-sensitivity-warn', flag, false),
  /**
   * Score history as JSON, versioned (v: 3). The stats module reads it and upgrades older versions,
   * so it stays a string here.
   */
  stats: field('game::stats', text, '[]'),
};

export const useTrainerSettings = createPersistedStore(trainerFields);
