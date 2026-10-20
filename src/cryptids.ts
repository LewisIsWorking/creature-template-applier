/**
 * The four cryptid templates from Pathfinder Dark Archive (Remastered) (pgs. 58 to 61): Experimental,
 * Mutant, Primeval and Rumored. Each raises the creature's level by 1, adds 1 to every check, DC and
 * damage roll, adds Hit Points by its starting level, then grants abilities. Numbers in the abilities
 * use the new level. Their DCs are marked immutable, because the +1 to every DC would otherwise land
 * on top of a DC that already counts it.
 */
import { dcForLevel } from './levels.ts';
import { highDc } from './mythic.ts';
import type { AbilitySpec, CreatureFacts, CreatureTemplate, Pick, Rule, TemplateChoices } from './templates.ts';
import { topSkill } from './wild.ts';

const source = (page: number): string => `Pathfinder Dark Archive (Remastered) pg. ${page}`;

/** Hit Points a cryptid gains, by the level it started at (the same table as Elite). */
export function cryptidHp(level: number): number {
  if (level <= 1) return 10;
  if (level <= 4) return 15;
  if (level <= 19) return 20;
  return 30;
}

const hardDc = (level: number): number => dcForLevel(level) + 2;

const check = (save: string, dc: number, basic = false): string => `@Check[${save}|dc:${dc}${basic ? '|basic' : ''}|immutable:true]`;

/** Level +1; +1 to every check, DC and damage roll; Hit Points by starting level. */
function adjustments(id: string, name: string, facts: CreatureFacts): Rule[] {
  const label = `${name} template`;
  return [
    { key: 'ActiveEffectLike', mode: 'add', path: 'system.details.level.value', value: 1 },
    { key: 'FlatModifier', selector: 'all', slug: `${id}-adjustment`, label, value: 1 },
    { key: 'FlatModifier', selector: 'damage', slug: `${id}-damage`, label, value: 1 },
    { key: 'FlatModifier', selector: 'hp', slug: `${id}-hp`, label, value: cryptidHp(facts.level) },
  ];
}

const LIMITED_USE = 'Add 1 more damage (2 in all) to its abilities it can use only a few times, such as a breath weapon.';

const rarity = (value: string): Rule => ({ key: 'ActiveEffectLike', mode: 'override', path: 'system.traits.rarity', value });

const RARER: Readonly<Record<string, string>> = { common: 'uncommon', uncommon: 'rare' };

const animalToBeast = (facts: CreatureFacts): Rule[] =>
  facts.traits.includes('animal') ? [{ key: 'ActorTraits', add: ['beast'], remove: ['animal'] }] : [];

/** An Intelligence modifier of -4 or lower becomes -3. */
const smarter: Rule = { key: 'ActiveEffectLike', mode: 'upgrade', path: 'system.abilities.int.mod', value: -3 };

const ability = (
  slug: string,
  name: string,
  kind: { actionType: 'action'; actions: 1 | 2 } | { actionType: 'passive' } | { actionType: 'free' },
  category: AbilitySpec['category'],
  traits: readonly string[],
  description: string,
  rules?: readonly Rule[],
): AbilitySpec => ({ slug, name, ...kind, category, traits, description: `<p>${description}</p>`, ...(rules ? { rules } : {}) });

const ONE = { actionType: 'action', actions: 1 } as const;
const TWO = { actionType: 'action', actions: 2 } as const;
const PASSIVE = { actionType: 'passive' } as const;
const FREE = { actionType: 'free' } as const;

/** The picks in effect: the GM's, or the template's defaults. */
const picked = (picks: readonly Pick[], choices: TemplateChoices): Set<string> =>
  new Set(choices.picks ?? picks.filter((p) => p.default).map((p) => p.id));

/** Power Surge's extra dice by level. */
export const powerSurgeDice = (level: number): number => (level >= 18 ? 4 : level >= 15 ? 3 : level >= 9 ? 2 : 1);

/** Explosive End: 1d6, and 1d6 more at 3rd level and every odd level after. */
export const explosiveEndDice = (level: number): number => Math.max(1, Math.floor((level + 1) / 2));

export const iridescenceResistance = (level: number): number => (level >= 17 ? 15 : level >= 9 ? 10 : 5);

const MUTANT_PICKS: readonly Pick[] = [
  { id: 'explosive-end', name: 'Explosive End', default: true },
  { id: 'shifting-iridescence', name: 'Shifting Iridescence', default: true },
  { id: 'marrowlance', name: 'Marrowlance', default: true },
];

const PRIMEVAL_PICKS: readonly Pick[] = [
  { id: 'stench', name: 'Stench', default: true },
  { id: 'broken-arsenal', name: 'Broken Arsenal', default: false },
  { id: 'grasp-for-life', name: 'Grasp for Life', default: false },
  { id: 'shockwave', name: 'Shockwave', default: true },
];

const RUMORED_PICKS: readonly Pick[] = [
  { id: 'hybrid-burrow', name: 'Hybrid Form (burrow)', default: false },
  { id: 'hybrid-climb', name: 'Hybrid Form (climb)', default: false },
  { id: 'hybrid-swim', name: 'Hybrid Form (swim)', default: false },
  { id: 'howl', name: 'Howl', default: false },
];

export const CRYPTIDS: readonly CreatureTemplate[] = [
  {
    id: 'experimental-cryptid',
    name: 'Experimental Cryptid',
    group: 'Cryptid',
    source: source(58),
    choices: ['energy'],
    summary: 'Level +1 and +1 to everything; experiment trait, darkvision, Augmented, Operational Flaw, Clobber, Energy Wave and Power Surge.',
    build: (facts, { energy = 'electricity' }) => {
      const level = facts.level + 1;
      const extra = level >= 15 ? ' two extra weapon damage dice' : level >= 5 ? ' one extra weapon damage die' : '';
      return {
        rules: [
          ...adjustments('experimental-cryptid', 'Experimental Cryptid', facts),
          { key: 'ActorTraits', add: ['experiment'] },
          ...(facts.senses.includes('darkvision') ? [] : [{ key: 'Sense', selector: 'darkvision' }]),
        ],
        abilities: [
          ability('augmented', 'Augmented', PASSIVE, 'defensive', [], 'It has a +2 circumstance bonus to saves against death effects, disease and poison.', [
            {
              key: 'FlatModifier',
              selector: 'saving-throw',
              type: 'circumstance',
              value: 2,
              predicate: [{ or: ['item:trait:death', 'item:trait:disease', 'item:trait:poison'] }],
            },
          ]),
          ability(
            'operational-flaw',
            'Operational Flaw',
            PASSIVE,
            'defensive',
            [],
            `A creature can find the flaw by Seeking with a successful ${check('perception', hardDc(level))} check. It has weakness ${level} to attacks from any creature that has found the flaw.`,
          ),
          ability(
            'clobber',
            'Clobber',
            TWO,
            'offensive',
            [],
            `It makes a Strike${extra ? `, dealing${extra}` : ''}. On a hit, the target is pushed 5 feet (10 feet on a critical hit) and knocked prone. If the push slams it into a solid object, it takes @Damage[1d10[bludgeoning]] more.`,
          ),
          ability(
            'energy-wave',
            'Energy Wave',
            TWO,
            'offensive',
            [energy],
            `It releases a 30-foot line of ${energy}, dealing @Damage[${level}d6[${energy}]] damage (basic Reflex save against its class DC). It can't use Energy Wave again for @Dice[1d4] rounds.`,
          ),
          ability(
            'power-surge',
            'Power Surge',
            ONE,
            'offensive',
            [energy],
            `It attempts a DC 5 flat check. On a success, its Strikes deal @Damage[${powerSurgeDice(level)}d6[${energy}]] extra damage until the end of its turn. On a failure, it takes that damage instead.`,
          ),
        ],
        byHand: [LIMITED_USE, 'If the experiments used alchemy or clockwork, add the alchemical or clockwork trait.', 'If the experiments were magical, add the matching tradition trait to Energy Wave.'],
      };
    },
  },
  {
    id: 'mutant-cryptid',
    name: 'Mutant Cryptid',
    group: 'Cryptid',
    source: source(59),
    choices: [],
    picks: MUTANT_PICKS,
    summary: 'Level +1 and +1 to everything; rare, Unusual Bane, and Explosive End, Shifting Iridescence and Marrowlance (all, or two).',
    build: (facts, choices) => {
      const level = facts.level + 1;
      const has = picked(MUTANT_PICKS, choices);
      return {
        rules: [...adjustments('mutant-cryptid', 'Mutant Cryptid', facts), rarity('rare')],
        abilities: [
          ability(
            'unusual-bane',
            'Unusual Bane',
            PASSIVE,
            'defensive',
            [],
            `The first time each round it comes within 15 feet of its bane or touches it, it takes ${level} mental damage and must attempt a ${check('will', hardDc(level))} save. On a failure it is stunned 1, or stunned 3 on a critical failure.`,
          ),
          ...(has.has('explosive-end')
            ? [
                ability(
                  'explosive-end',
                  'Explosive End',
                  PASSIVE,
                  'offensive',
                  [],
                  `When it dies, it explodes, dealing @Damage[${explosiveEndDice(level)}d6] damage of its chosen type to each creature in a 10-foot emanation (${check('reflex', dcForLevel(level), true)} save).`,
                ),
              ]
            : []),
          ...(has.has('shifting-iridescence')
            ? [
                ability(
                  'shifting-iridescence',
                  'Shifting Iridescence',
                  PASSIVE,
                  'defensive',
                  ['magical'],
                  `After it takes energy damage it has no resistance or immunity to, it gains resistance ${iridescenceResistance(level)} to that damage type, in place of any earlier resistance from this ability.`,
                ),
              ]
            : []),
          ...(has.has('marrowlance')
            ? [
                ability(
                  'marrowlance',
                  'Marrowlance',
                  PASSIVE,
                  'offensive',
                  [],
                  'It can hurl spears of its own bone: a ranged unarmed attack with a range of 60 feet and the versatile S trait.',
                ),
              ]
            : []),
        ],
        byHand: [
          LIMITED_USE,
          'Unusual Bane: choose the bane, and add it to the description.',
          ...(has.has('explosive-end') ? ['Explosive End: choose its damage type.'] : []),
          ...(has.has('marrowlance')
            ? ['Marrowlance: add the Strike, using its best ranged Strike\'s attack modifier and damage, or moderate attack and low damage for its level if it has none.']
            : []),
        ],
      };
    },
  },
  {
    id: 'primeval-cryptid',
    name: 'Primeval Cryptid',
    group: 'Cryptid',
    source: source(60),
    choices: [],
    picks: PRIMEVAL_PICKS,
    summary: 'Level +1 and +1 to everything; one size bigger, rarer, an animal becomes a beast, and two of Stench, Broken Arsenal, Grasp for Life and Shockwave.',
    build: (facts, choices) => {
      const level = facts.level + 1;
      const has = picked(PRIMEVAL_PICKS, choices);
      const rarer = RARER[facts.rarity];
      return {
        rules: [
          ...adjustments('primeval-cryptid', 'Primeval Cryptid', facts),
          ...(rarer ? [rarity(rarer)] : []),
          ...animalToBeast(facts),
          { key: 'CreatureSize', value: 1 },
          smarter,
        ],
        abilities: [
          ...(has.has('stench')
            ? [
                ability(
                  'stench',
                  'Stench',
                  PASSIVE,
                  'offensive',
                  ['aura', 'olfactory'],
                  `30 feet. A creature that enters the aura or starts its turn in it must succeed at a ${check('fortitude', dcForLevel(level))} save or be sickened 1 (and slowed 1 while sickened, on a critical failure). A creature that succeeds, or stops being sickened, is immune to stench auras for 1 minute.`,
                ),
              ]
            : []),
          ...(has.has('broken-arsenal')
            ? [
                ability(
                  'broken-arsenal',
                  'Broken Arsenal',
                  PASSIVE,
                  'defensive',
                  [],
                  `An adjacent creature that hits it with a melee attack or touches it takes @Damage[${Math.max(1, Math.floor(level / 2))}[piercing]] damage.`,
                ),
              ]
            : []),
          ...(has.has('grasp-for-life')
            ? [
                ability(
                  'grasp-for-life',
                  'Grasp for Life',
                  FREE,
                  'defensive',
                  ['healing'],
                  `<strong>Frequency</strong> once per week</p><p><strong>Trigger</strong> It would be reduced to 0 Hit Points.</p><p><strong>Effect</strong> Instead it has ${Math.max(4, 4 * level)} Hit Points.`,
                ),
              ]
            : []),
          ...(has.has('shockwave')
            ? [
                ability(
                  'shockwave',
                  'Shockwave',
                  TWO,
                  'offensive',
                  [],
                  `Each creature on the ground within 30 feet takes @Damage[${Math.max(2, level)}d6[bludgeoning]] damage (basic Reflex save against its class DC), and is knocked prone on a critical failure.`,
                ),
              ]
            : []),
        ],
        byHand: [LIMITED_USE, 'If it is now Huge or Gargantuan, add 5 feet to the reach of its Strikes.'],
      };
    },
  },
  {
    id: 'rumored-cryptid',
    name: 'Rumored Cryptid',
    group: 'Cryptid',
    source: source(61),
    choices: [],
    picks: RUMORED_PICKS,
    summary: 'Level +1 and +1 to everything; rare, top Stealth, Burning Eyes, hard to identify, Stalk and Vanishing Escape; Hybrid Form and Howl optional.',
    build: (facts, choices) => {
      const level = facts.level + 1;
      const has = picked(RUMORED_PICKS, choices);
      const land = facts.speeds['land'] ?? 0;
      const hybrid = ['burrow', 'climb', 'swim'].filter((s) => has.has(`hybrid-${s}`) && land > 0);
      return {
        rules: [
          ...adjustments('rumored-cryptid', 'Rumored Cryptid', facts),
          rarity('rare'),
          ...animalToBeast(facts),
          smarter,
          ...topSkill('rumored-cryptid', 'Rumored Cryptid', 'stealth', facts),
          { key: 'Sense', selector: facts.senses.includes('darkvision') ? 'greater-darkvision' : 'darkvision' },
          ...hybrid.map((selector): Rule => ({ key: 'BaseSpeed', selector, value: land })),
        ],
        abilities: [
          ability(
            'creature-obscura',
            'Creature Obscura',
            PASSIVE,
            'defensive',
            [],
            'It can also be identified with Society or a Lore about a nearby settlement, at an incredibly hard DC. Anyone who fails to identify it gets the benefit of Dubious Knowledge.',
          ),
          ability('shifting-form', 'Shifting Form', PASSIVE, 'defensive', [], 'Its appearance keeps changing. If every record of it is destroyed and every witness dies, it ceases to exist.'),
          ability(
            'obscura-vulnerability',
            'Obscura Vulnerability',
            PASSIVE,
            'defensive',
            [],
            'Each successful Recall Knowledge check to identify it makes it drained 1 (drained 2 on a critical success).',
          ),
          ability('stalk', 'Stalk', ONE, 'offensive', [], '<strong>Requirements</strong> It is undetected.</p><p><strong>Effect</strong> It Strides, then Strikes.'),
          ability('vanishing-escape', 'Vanishing Escape', ONE, 'defensive', [], 'It Strides, then Hides.'),
          ...(has.has('howl')
            ? [
                ability(
                  'howl',
                  'Howl',
                  TWO,
                  'offensive',
                  ['auditory', 'emotion', 'fear', 'mental'],
                  `Each creature in a 30-foot emanation must attempt a ${check('will', highDc(level))} save. On a failure it is frightened 1 (frightened 2 on a critical failure); on a success it is immune to Howl for 1 minute.`,
                ),
              ]
            : []),
        ],
        byHand: [LIMITED_USE],
      };
    },
  },
];
