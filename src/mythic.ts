/**
 * The four mythic monster templates from Pathfinder War of Immortals (pgs. 168 and 169). Each sits on
 * top of the basic mythic abilities a mythic monster gains by level (pg. 168): mythic resilience or
 * resistance at 1st, 7th and 13th, then the mythic power actions. Like the system's own mythic
 * creatures, resilience is automated and mythic resistance is written on its ability.
 */
import type { AbilitySpec, CreatureFacts, CreatureTemplate, Rule } from './templates.ts';

export type Save = 'fortitude' | 'reflex' | 'will';

const SAVES: readonly Save[] = ['fortitude', 'reflex', 'will'];

const SAVE_NAMES: Record<Save, string> = { fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' };

/** GM Core's tables for levels -1 to 24. A spell attack modifier is always its DC minus 8. */
const EXTREME_SKILL = [8, 9, 10, 11, 13, 15, 16, 18, 20, 21, 23, 25, 26, 28, 30, 31, 33, 35, 36, 38, 40, 41, 43, 45, 46, 48];
const HIGH_SPELL_DC = [16, 16, 17, 18, 20, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 34, 36, 37, 38, 40, 41, 42, 44, 45, 46, 48];
const EXTREME_SPELL_DC = [19, 19, 20, 22, 23, 25, 26, 27, 29, 30, 32, 33, 34, 36, 37, 39, 40, 41, 43, 44, 46, 47, 48, 50, 51, 52];

const atLevel = (table: readonly number[], level: number): number => table[Math.min(Math.max(level, -1), 24) + 1]!;

export const extremeSkill = (level: number): number => atLevel(EXTREME_SKILL, level);

/** A mythic caster's spell DC: high, or extreme from 11th level. */
export const casterSpellDc = (level: number): number => atLevel(level >= 11 ? EXTREME_SPELL_DC : HIGH_SPELL_DC, level);

const TRADITION_SKILLS = ['arcana', 'nature', 'occultism', 'religion'] as const;

const titleCase = (slug: string): string => slug[0]!.toUpperCase() + slug.slice(1);

const passive = (slug: string, name: string, description: string, rules?: readonly Rule[]): AbilitySpec => ({
  slug,
  name,
  actionType: 'passive',
  category: 'defensive',
  traits: [],
  description: `<p>${description}</p>`,
  ...(rules ? { rules } : {}),
});

const power = (
  slug: string,
  name: string,
  kind: { actionType: 'action'; actions: 1 } | { actionType: 'free' } | { actionType: 'reaction' },
  traits: readonly string[],
  description: string,
  rules?: readonly Rule[],
): AbilitySpec => ({
  slug,
  name,
  ...kind,
  category: 'offensive',
  traits,
  description: `<p><strong>Cost</strong> ${description}</p>`,
  ...(rules ? { rules } : {}),
});

interface MythicSpec {
  readonly id: string;
  readonly name: string;
  readonly page: number;
  readonly summary: string;
  /** Saves it can never gain mythic resilience in. */
  readonly noResilience: readonly Save[];
  readonly noResistance: boolean;
  /** Mythic resilience it has at any level, taking its 1st-level pick. */
  readonly freeResilience?: Save;
  /** Mythic resistance equal to its level at any level, taking its 1st-level pick. */
  readonly freeResistance?: boolean;
  /** Recharge at any level, not from 10th. */
  readonly rechargeAnyLevel?: boolean;
  readonly immunity: 'Strikes' | 'spells';
  /** The skill it uses the extreme value for. */
  readonly skill: (facts: CreatureFacts) => string;
  readonly abilities: (facts: CreatureFacts) => readonly AbilitySpec[];
  readonly byHand?: (facts: CreatureFacts) => readonly string[];
}

/** Which saves get mythic resilience and how many times it gets mythic resistance (0, 1 or 2). */
export function resilienceAndResistance(spec: MythicSpec, facts: CreatureFacts): { saves: Save[]; resistance: number } {
  const saves: Save[] = spec.freeResilience ? [spec.freeResilience] : [];
  let resistance = spec.freeResistance ? 2 : 0;
  const picks = [1, 7, 13].filter((l) => facts.level >= l).length - (spec.freeResilience || spec.freeResistance ? 1 : 0);
  for (let i = 0; i < picks; i++) {
    // Resilience goes to its highest saves first.
    const next = SAVES.filter((s) => !saves.includes(s) && !spec.noResilience.includes(s)).sort((a, b) => facts.saves[b] - facts.saves[a])[0];
    if (next) saves.push(next);
    else if (!spec.noResistance) resistance++;
  }
  return { saves, resistance };
}

function basics(spec: MythicSpec, facts: CreatureFacts, skill: string): AbilitySpec[] {
  const out: AbilitySpec[] = [];
  const { saves, resistance } = resilienceAndResistance(spec, facts);
  if (saves.length > 0) {
    out.push(
      passive(
        'mythic-resilience',
        `Mythic Resilience (${saves.map((s) => SAVE_NAMES[s]).join(' and ')})`,
        'It treats its saving throws with these saves as one degree of success better than it rolled. This does not stack with other effects that change the degree of success, such as incapacitation (except for a natural 1 or 20).',
        saves.map((selector) => ({ key: 'AdjustDegreeOfSuccess', selector, adjustment: { all: 'one-degree-better' } })),
      ),
    );
  }
  const resistanceValue = resistance === 2 ? facts.level : Math.floor(facts.level / 2);
  if (resistance > 0 && resistanceValue > 0) {
    out.push(
      passive(
        'mythic-resistance',
        'Mythic Resistance',
        `It has resistance ${resistanceValue} to all damage from Strikes made by non-mythic creatures. Mythic weapons bypass this resistance, even in non-mythic hands.`,
      ),
    );
  }
  const actions: AbilitySpec[] = [];
  if (facts.level >= 4) {
    actions.push(
      // Mythic Skill rather than Remove a Condition, on the skill the template makes extreme.
      power(
        'mythic-skill',
        'Mythic Skill',
        { actionType: 'free' },
        [],
        `1 Mythic Point. <strong>Effect</strong> It attempts its next ${titleCase(skill)} check with a +4 bonus and mythic proficiency.`,
        [
          { key: 'RollOption', option: 'mythic-skill', toggleable: true },
          { key: 'FlatModifier', selector: skill, slug: 'mythic-skill-bonus', value: 4, predicate: ['mythic-skill'] },
        ],
      ),
    );
  }
  if (facts.level >= 10 || spec.rechargeAnyLevel) {
    actions.push(
      power(
        'recharge',
        'Recharge',
        { actionType: 'action', actions: 1 },
        ['concentrate'],
        '1 Mythic Point. <strong>Effect</strong> It gets one more use of a spell or ability it can normally use only a limited number of times, such as an expended spell slot or a once-per-day ability.',
      ),
    );
  }
  if (facts.level >= 17) {
    actions.push(
      power(
        'undying-myth',
        'Undying Myth',
        { actionType: 'free' },
        [],
        'all its Mythic Points. <strong>Trigger</strong> It would die and has at least 1 Mythic Point. <strong>Effect</strong> It stays standing and conscious, and recovers half its maximum Hit Points.',
      ),
    );
  }
  if (facts.level >= 20) {
    actions.push(
      power('reroll', 'Reroll', { actionType: 'free' }, ['fortune'], '1 Mythic Point. <strong>Trigger</strong> It fails a check. <strong>Effect</strong> It rerolls the check.'),
    );
  }
  if (actions.length > 0) {
    out.push(passive('mythic-power', 'Mythic Power', 'It has a pool of 3 Mythic Points to spend on its mythic power actions.'), ...actions);
  }
  if (facts.level >= 23) {
    out.push(
      passive(
        'mythic-immunity',
        'Mythic Immunity',
        spec.immunity === 'Strikes'
          ? 'It is immune to Strikes made with non-mythic weapons and to unarmed Strikes from non-mythic creatures.'
          : 'It is immune to harmful spells cast by non-mythic creatures.',
      ),
    );
  }
  return out;
}

const mythic = (spec: MythicSpec): CreatureTemplate => ({
  id: spec.id,
  name: spec.name,
  group: 'Mythic',
  source: `Pathfinder War of Immortals pg. ${spec.page}`,
  choices: [],
  summary: spec.summary,
  build: (facts) => {
    const skill = spec.skill(facts);
    const raise = extremeSkill(facts.level) - (facts.skills[skill] ?? 0);
    return {
      rules: [
        { key: 'ActorTraits', add: ['mythic'] },
        ...(raise > 0
          ? [{ key: 'FlatModifier', selector: skill, slug: `${spec.id}-template-skill`, label: `${spec.name} template`, value: raise }]
          : []),
      ],
      abilities: [...spec.abilities(facts), ...basics(spec, facts, skill)],
      byHand: [
        ...(spec.byHand?.(facts) ?? []),
        ...(facts.level >= 4 ? ['Mythic Skill was chosen over Remove a Condition; swap it if you prefer.'] : []),
        ...(facts.level >= 12 ? ['Mythic Skill: pick a second skill it applies to.'] : []),
        ...(facts.level >= 20 ? ['At 20th level it may take mythic defenses instead of Reroll.'] : []),
      ],
    };
  },
});

export const MYTHIC: readonly CreatureTemplate[] = [
  mythic({
    id: 'mythic-ambusher',
    name: 'Mythic Ambusher',
    page: 168,
    summary: 'Mythic; extreme Stealth, Reflex resilience at any level and Hazard Immunity; never mythic resistance.',
    noResilience: [],
    noResistance: true,
    freeResilience: 'reflex',
    immunity: 'spells',
    skill: () => 'stealth',
    abilities: () => [
      passive('ambush-excellence', 'Ambush Excellence', 'It uses the extreme skill value for its level as its Stealth modifier.'),
      passive(
        'hazard-immunity',
        'Hazard Immunity',
        'It never triggers the reactions of hazards in its own lair, and is immune to the harmful effects of damaging areas those hazards create.',
      ),
      passive('mythic-weakness-frailty', 'Mythic Weakness (Frailty)', 'It can never gain mythic immunity to Strikes or mythic resistance.'),
    ],
  }),
  mythic({
    id: 'mythic-brute',
    name: 'Mythic Brute',
    page: 169,
    summary: 'Mythic; extreme Athletics, mythic resistance equal to its level, Mythic Ferocity and Titanic Might; never Will resilience.',
    noResilience: ['will'],
    noResistance: false,
    freeResistance: true,
    immunity: 'Strikes',
    skill: () => 'athletics',
    abilities: () => [
      passive('brutish-athleticism', 'Brutish Athleticism', 'It uses the extreme skill value for its level as its Athletics modifier.'),
      power(
        'mythic-ferocity',
        'Mythic Ferocity',
        { actionType: 'reaction' },
        [],
        '1 Mythic Point. <strong>Trigger</strong> It is reduced to 0 Hit Points. <strong>Effect</strong> It avoids being knocked out and stays at half its maximum Hit Points, but its wounded value increases by 1. It cannot use this ability while wounded 3.',
      ),
      passive('titanic-might', 'Titanic Might', 'It ignores size limits on actions such as Grapple and Trip.'),
      passive('mythic-weakness-weak-willed', 'Mythic Weakness (Weak-Willed)', 'It can never gain mythic resilience to Will saves.'),
    ],
  }),
  mythic({
    id: 'mythic-caster',
    name: 'Mythic Caster',
    page: 169,
    summary: 'Mythic; high or extreme spell DC, extreme tradition skill and Recharge at any level; never Fortitude resilience or mythic resistance.',
    noResilience: ['fortitude'],
    noResistance: true,
    rechargeAnyLevel: true,
    immunity: 'spells',
    // The tradition's skill: the one of the four it is best at.
    skill: (facts) => [...TRADITION_SKILLS].sort((a, b) => (facts.skills[b] ?? 0) - (facts.skills[a] ?? 0))[0]!,
    abilities: () => [
      passive(
        'mythic-knowledge',
        'Mythic Knowledge',
        'It uses the extreme skill value for its level for its tradition skill: Arcana for arcane, Nature for primal, Occultism for occult, or Religion for divine.',
      ),
      passive('mythic-weakness-extreme-frailty', 'Mythic Weakness (Extreme Frailty)', 'It can never gain mythic resilience in Fortitude, mythic immunity to Strikes, or mythic resistance.'),
    ],
    byHand: (facts) => {
      const dc = casterSpellDc(facts.level);
      return [
        `Devastating Magic: set its spell DC to ${dc} and its spell attack modifier to +${dc - 8}.`,
        'Mythic Knowledge raised its best of Arcana, Nature, Occultism and Religion. If that is not its tradition skill, move the bonus.',
      ];
    },
  }),
  mythic({
    id: 'mythic-striker',
    name: 'Mythic Striker',
    page: 169,
    summary: 'Mythic; extreme Acrobatics, Deadly Striker and Unimpeded; never Fortitude resilience or Remove a Condition.',
    noResilience: ['fortitude'],
    noResistance: false,
    immunity: 'Strikes',
    skill: () => 'acrobatics',
    abilities: () => [
      passive(
        'deadly-striker',
        'Deadly Striker',
        'Whenever it uses an action to Stride, Burrow, Climb or Fly 10 feet or more, its next Strike deals an extra 1d6 precision damage.',
        [
          { key: 'RollOption', option: 'deadly-striker', toggleable: true },
          { key: 'DamageDice', selector: 'strike-damage', diceNumber: 1, dieSize: 'd6', category: 'precision', predicate: ['deadly-striker'] },
        ],
      ),
      passive('mythic-mobility', 'Mythic Mobility', 'It uses the extreme skill value for its level as its Acrobatics modifier.'),
      power(
        'unimpeded',
        'Unimpeded',
        { actionType: 'action', actions: 1 },
        [],
        '1 Mythic Point. <strong>Effect</strong> It ends one effect giving it a circumstance penalty to Speed. When it tries to Escape being immobilized, grabbed or restrained, it automatically succeeds.',
      ),
      passive('mythic-weakness-infirmity', 'Mythic Weakness (Infirmity)', 'It can never gain mythic resilience in Fortitude or the Remove a Condition action.'),
    ],
  }),
];
