/**
 * Reads what the templates need to know from a PF2e or SF2e creature. Takes a plain shape rather than
 * a Foundry document, so the unit tests can feed it objects.
 */
import type { CreatureFacts } from './templates.ts';

export interface CreatureLike {
  readonly level?: number;
  readonly system?: {
    readonly movement?: { readonly speeds?: Record<string, { readonly value?: unknown } | null | undefined> };
  };
  readonly skills?: Record<string, { readonly mod?: unknown } | undefined>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function readFacts(creature: CreatureLike, slowedUuid: string | null): CreatureFacts {
  const speeds = Object.entries(creature.system?.movement?.speeds ?? {})
    .map(([type, s]) => ({ type, value: num(s?.value) }))
    .filter((s): s is { type: string; value: number } => s.value !== null && s.value > 0);
  const skills = Object.values(creature.skills ?? {})
    .map((s) => num(s?.mod))
    .filter((m): m is number => m !== null);
  return {
    level: num(creature.level) ?? 0,
    highestSpeed: speeds.reduce((max, s) => Math.max(max, s.value), 0),
    canFly: speeds.some((s) => s.type === 'fly'),
    highestSkill: skills.length > 0 ? Math.max(...skills) : 0,
    slowedUuid,
  };
}
