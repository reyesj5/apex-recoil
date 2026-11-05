import data from '@/patch.json';

/** The game patch patterns are checked against (client/patch.json) */
export const currentPatch = data.current;

/** Whether a spec has been checked against the current patch: the pages show nothing else */
export const isCheckedNow = (spec: { checked_patch?: string | null }) => spec.checked_patch === currentPatch;
