/**
 * Reads what the templates need to know from a PF2e or SF2e creature. Takes a plain shape rather than
 * a Foundry document, so the unit tests can feed it objects.
 */
import type { CreatureFacts } from './templates.ts';

export interface CreatureLike {
  readonly level?: number;
  readonly system?: {
    readonly movement?: { readonly speeds?: Record<string, { readonly value?: unknown } | null | undefined> };
    readonly details?: { readonly languages?: { readonly value?: unknown } };
    readonly traits?: { readonly value?: unknown; readonly rarity?: unknown };
    readonly perception?: { readonly senses?: unknown };
  };
  readonly perception?: { readonly senses?: unknown };
  readonly skills?: Record<string, { readonly mod?: unknown } | undefined>;
  readonly saves?: Record<string, { readonly mod?: unknown } | undefined>;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Senses come as objects with a type (derived) or as plain slugs. */
const senseTypes = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x: unknown) => (typeof x === 'string' ? x : (x as { type?: unknown } | null)?.type)).filter((x): x is string => typeof x === 'string')
    : [];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function readFacts(creature: CreatureLike, slowedUuid: string | null): CreatureFacts {
  const speeds = Object.entries(creature.system?.movement?.speeds ?? {})
    .map(([type, s]) => ({ type, value: num(s?.value) }))
    .filter((s): s is { type: string; value: number } => s.value !== null && s.value > 0);
  const skillMods = Object.fromEntries(
    Object.entries(creature.skills ?? {})
      .map(([slug, s]) => [slug, num(s?.mod)] as const)
      .filter((e): e is readonly [string, number] => e[1] !== null),
  );
  const skills = Object.values(skillMods);
  const save = (s: string) => num(creature.saves?.[s]?.mod) ?? 0;
  return {
    level: num(creature.level) ?? 0,
    speeds: Object.fromEntries(speeds.map((s) => [s.type, s.value])),
    highestSpeed: speeds.reduce((max, s) => Math.max(max, s.value), 0),
    canFly: speeds.some((s) => s.type === 'fly'),
    highestSkill: skills.length > 0 ? Math.max(...skills) : 0,
    slowedUuid,
    hasLanguages: (() => {
      const langs = creature.system?.details?.languages?.value;
      return Array.isArray(langs) && langs.length > 0;
    })(),
    saves: { fortitude: save('fortitude'), reflex: save('reflex'), will: save('will') },
    skills: skillMods,
    traits: strings(creature.system?.traits?.value),
    rarity: strings([creature.system?.traits?.rarity])[0] ?? 'common',
    senses: senseTypes(creature.perception?.senses ?? creature.system?.perception?.senses),
  };
}
