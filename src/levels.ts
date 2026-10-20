/** Level-bracketed values, kept apart from templates.ts so the template groups can share them without an import cycle. */
import type { Bracket } from './templates.ts';

export const LEVEL_FIELD = 'actor|system.details.level.value';

export const byLevel = (brackets: readonly Bracket[]) => ({ field: LEVEL_FIELD, brackets });

/** The four-step table Book of the Dead uses for many weaknesses: 3, 5, 10, 15. */
export const STEP_3_5_10_15: readonly Bracket[] = [
  { end: 3, value: 3 },
  { start: 4, end: 8, value: 5 },
  { start: 9, end: 13, value: 10 },
  { start: 14, value: 15 },
];
