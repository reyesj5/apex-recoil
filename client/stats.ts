// The current trainer's score history: the engine's functions (client/engine/stats.ts) over the
// stored value (game::stats). Goes with client/game.ts in Phase 2.8 of docs/ui-migration-plan.md.
import { StringAttribute } from './storage';
import { today } from './utils';
import { addResult, parseStats, statsForSetup as findStats, type TrialSetup, type TrialStats } from './engine/stats';

export { distanceScore, percentile, type TrialSetup } from './engine/stats';

export let stats: TrialStats[] = [];
export const aStats = new StringAttribute('stats', 'game:', '[]');

export function loadStats() {
  stats = parseStats(aStats.get(), today());
}

export function statsForSetup(c: TrialSetup): TrialStats | undefined {
  return findStats(stats, c);
}

export function addStat(v: number, setup: TrialSetup): TrialStats {
  const s = addResult(stats, v, setup, today());
  aStats.set(JSON.stringify(stats));
  return s;
}
