/**
 * The creature templates, as data. Each one turns into PF2e rule elements on a single effect item,
 * plus ability items, so applying a template never edits the creature's own statistics and removing
 * it is deleting what it added. Mechanics are paraphrased from the source books (see licenses/).
 *
 * Level-dependent numbers are written as level brackets, which PF2e resolves against the creature's
 * level every time it prepares data, so they stay right when the level changes (Elite, Weak).
 */

import { MYTHIC } from './mythic.ts';
import { byLevel, STEP_3_5_10_15 } from './levels.ts';
import { WILD } from './wild.ts';

/** A PF2e rule element, as stored on an item. */
export type Rule = Record<string, unknown> & { key: string };

export interface Bracket {
  readonly start?: number;
  readonly end?: number;
  readonly value: number;
}

export interface AbilitySpec {
  readonly slug: string;
  readonly name: string;
  readonly actionType: 'action' | 'passive' | 'reaction' | 'free';
  /** 1, 2 or 3 for an action; omitted for the other kinds. */
  readonly actions?: 1 | 2 | 3;
  readonly category: 'offensive' | 'defensive' | 'interaction';
  readonly traits: readonly string[];
  /** HTML. */
  readonly description: string;
  readonly rules?: readonly Rule[];
}

/** What a template needs to know about the creature it is applied to, read at apply time. */
export interface CreatureFacts {
  readonly level: number;
  /** The creature's highest Speed of any kind, in feet. */
  readonly highestSpeed: number;
  /** Each Speed it has, in feet, by type (land, swim, burrow...). */
  readonly speeds: Readonly<Record<string, number>>;
  readonly canFly: boolean;
  /** The creature's highest skill modifier, for Shadow's Stealth. */
  readonly highestSkill: number;
  /** The Slowed condition's UUID in this system, for Zombie; null if the system has none. */
  readonly slowedUuid: string | null;
  /** Whether it speaks any language: the elemental adjustments add one only if it does. */
  readonly hasLanguages: boolean;
  /** Save modifiers, for where mythic resilience goes. */
  readonly saves: Readonly<Record<'fortitude' | 'reflex' | 'will', number>>;
  /** Skill modifiers by slug, for the mythic templates' extreme skills. */
  readonly skills: Readonly<Record<string, number>>;
}

export type Bypass = 'cold-iron' | 'silver' | 'wood';

export interface TemplateChoices {
  readonly mindless?: boolean;
  /** Water only: aquatic instead of amphibious. */
  readonly aquatic?: boolean;
  /** Wood only: also a plant (a growing plant creature). */
  readonly plant?: boolean;
  /** Vampire only: the material that bypasses its physical resistance. */
  readonly bypass?: Bypass;
}

export type Choice = 'mindless' | 'bypass' | 'aquatic' | 'plant';

export interface TemplateResult {
  readonly rules: readonly Rule[];
  readonly abilities: readonly AbilitySpec[];
  /** Parts of the template the GM still applies by hand, in plain words. */
  readonly byHand: readonly string[];
}

export interface CreatureTemplate {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly source: string;
  /** Which choices the apply dialog offers for this template. */
  readonly choices: readonly Choice[];
  readonly summary: string;
  build(facts: CreatureFacts, choices: TemplateChoices): TemplateResult;
}

export { byLevel, LEVEL_FIELD, STEP_3_5_10_15 } from './levels.ts';

/** Moderate DCs by level, -1 to 25 (Core Rulebook, DCs by Level). */
const DC_BY_LEVEL = [13, 14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];

export function dcForLevel(level: number): number {
  const i = Math.min(Math.max(Math.trunc(level), -1), 25) + 1;
  return DC_BY_LEVEL[i] as number;
}

const BASE_IMMUNITIES = ['death-effects', 'disease', 'paralyzed', 'poison', 'unconscious'] as const;

const traits = (...add: string[]): Rule => ({ key: 'ActorTraits', add });
const immunities = (types: readonly string[]): Rule[] => types.map((type) => ({ key: 'Immunity', type }));
const weakness = (type: string, value: unknown): Rule => ({ key: 'Weakness', type, value });
const resistance = (type: string, value: unknown, exceptions?: string[]): Rule =>
  exceptions ? { key: 'Resistance', type, value, exceptions } : { key: 'Resistance', type, value };
const darkvision: Rule = { key: 'Sense', selector: 'darkvision' };
const necril: Rule = { key: 'ActiveEffectLike', mode: 'add', path: 'system.details.languages.value', value: 'necril' };
/** Void healing. The system derives it from the undead trait before rule elements add that trait. */
const voidHealing: Rule = {
  key: 'ActiveEffectLike',
  mode: 'override',
  path: 'system.attributes.hp.negativeHealing',
  value: true,
};
/** Each template's modifier gets its own slug: modifiers sharing a slug do not stack. */
const hp = (template: string, brackets: readonly Bracket[]): Rule => ({
  key: 'FlatModifier',
  selector: 'hp',
  slug: `${template}-template-hp`,
  label: `${template[0]!.toUpperCase()}${template.slice(1)} template`,
  value: byLevel(brackets),
});

/** The parts every undead adjustment except plain Undead shares. */
const undeadBasics = (): Rule[] => [darkvision, voidHealing];

/** A creature with no fly Speed gets one at its highest Speed (Ghost, Shadow). */
function flight(facts: CreatureFacts): { rules: Rule[]; byHand: string[] } {
  if (facts.canFly) return { rules: [], byHand: [] };
  return {
    rules: [{ key: 'BaseSpeed', selector: 'fly', value: facts.highestSpeed }],
    byHand: ['Remove its other Speeds: the template leaves it only the fly Speed.'],
  };
}

const ghostTouchWeaknesses = (): Rule[] =>
  ['force', 'ghost-touch', 'vitality'].map((type) => weakness(type, byLevel(STEP_3_5_10_15)));

const voidStrikes = 'Its physical Strikes deal void damage instead, and are magical.';

/** Rage of Elements's four-step table, used by Metal, Water and Wood. */
const elementSteps = (values: readonly [number, number, number, number]): Bracket[] => [
  { end: 3, value: values[0] },
  { start: 4, end: 8, value: values[1] },
  { start: 9, end: 13, value: values[2] },
  { start: 14, value: values[3] },
];

const language = (facts: CreatureFacts, slug: string): Rule[] =>
  facts.hasLanguages ? [{ key: 'ActiveEffectLike', mode: 'add', path: 'system.details.languages.value', value: slug }] : [];

/** Speeds that grow at 8th level are set when the template goes on, as BaseSpeed takes no brackets. */
const speed = (selector: string, value: number): Rule => ({ key: 'BaseSpeed', selector, value });

const spells = (element: string): string =>
  `If it casts spells, swap them for ${element} spells of the same rank.`;

interface ElementSpec {
  readonly id: string;
  readonly name: string;
  readonly page: number;
  readonly summary: string;
  readonly choices?: readonly Choice[];
  readonly build: (facts: CreatureFacts, choices: TemplateChoices) => TemplateResult;
}

const element = (e: ElementSpec): CreatureTemplate => ({
  id: e.id,
  name: e.name,
  group: 'Elemental',
  source: `Pathfinder Rage of Elements pg. ${e.page}`,
  choices: e.choices ?? [],
  summary: e.summary,
  build: e.build,
});

const ELEMENTAL: readonly CreatureTemplate[] = [
  element({
    id: 'air',
    name: 'Air',
    page: 67,
    summary: 'Air trait and Sussuran; flies at 8th level or higher.',
    build: (facts) => ({
      rules: [traits('air'), ...language(facts, 'sussuran'), ...(facts.level >= 8 ? [speed('fly', 25)] : [])],
      abilities: [],
      byHand: [
        ...(facts.level >= 8
          ? []
          : ['Below 8th level, give it a 25-foot fly Speed only if it has no ranged attacks, or you remove them.']),
        spells('air'),
      ],
    }),
  }),
  element({
    id: 'earth',
    name: 'Earth',
    page: 91,
    summary: 'Earth trait, Petran, tremorsense and a burrow Speed.',
    build: (facts) => ({
      rules: [
        traits('earth'),
        ...language(facts, 'petran'),
        { key: 'Sense', selector: 'tremorsense', acuity: 'imprecise', range: 60 },
        speed('burrow', facts.level >= 8 ? 40 : 20),
      ],
      abilities: [],
      byHand: [spells('earth')],
    }),
  }),
  element({
    id: 'fire',
    name: 'Fire',
    page: 115,
    summary: 'Fire trait, Pyric and fire immunity; its Strikes burn.',
    build: (facts) => ({
      rules: [traits('fire'), ...language(facts, 'pyric'), ...immunities(['fire'])],
      abilities: [],
      byHand: [
        'Make one damage die of each Strike fire damage. A Strike with only one die deals 1 extra fire damage instead.',
        spells('fire'),
      ],
    }),
  }),
  element({
    id: 'metal',
    name: 'Metal',
    page: 139,
    summary: 'Metal trait and Talican; fewer Hit Points; resists electricity.',
    build: (facts) => ({
      rules: [
        traits('metal'),
        ...language(facts, 'talican'),
        hp('metal', elementSteps([-6, -10, -20, -30])),
        resistance('electricity', byLevel(elementSteps([3, 5, 10, 15]))),
      ],
      abilities: [],
      byHand: [
        'If it has metal spikes or blades, you may give its physical Strikes versatile P or versatile S.',
        spells('metal'),
      ],
    }),
  }),
  element({
    id: 'water',
    name: 'Water',
    page: 169,
    choices: ['aquatic'],
    summary: 'Water trait, Thalassic and a swim Speed; amphibious or aquatic; fewer Hit Points; resists fire.',
    build: (facts, { aquatic = false }) => ({
      rules: [
        traits('water', aquatic ? 'aquatic' : 'amphibious'),
        ...language(facts, 'thalassic'),
        hp('water', elementSteps([-6, -10, -20, -30])),
        resistance('fire', byLevel(elementSteps([3, 5, 10, 15]))),
        speed('swim', facts.level >= 8 ? 40 : 25),
      ],
      abilities: [],
      byHand: [spells('water')],
    }),
  }),
  element({
    id: 'wood',
    name: 'Wood',
    page: 193,
    choices: ['plant'],
    summary: 'Wood trait and Muan; more Hit Points; weak to fire and axes.',
    build: (facts, { plant = false }) => ({
      rules: [
        traits('wood', ...(plant ? ['plant'] : [])),
        ...language(facts, 'muan'),
        hp('wood', elementSteps([10, 20, 40, 60])),
        weakness('fire', byLevel(elementSteps([3, 5, 10, 15]))),
        weakness('axe-vulnerability', byLevel(elementSteps([3, 5, 10, 15]))),
      ],
      abilities: [],
      byHand: [spells('wood')],
    }),
  }),
];

/** NPC Core's healing table for a leshy's Verdant Burst, by level. */
const VERDANT_BURST: readonly Bracket[] = [
  { end: 0, value: 0 },
  { start: 1, end: 1, value: 1 },
  { start: 2, end: 3, value: 2 },
  { start: 4, end: 5, value: 3 },
  { start: 6, end: 7, value: 4 },
  { start: 8, end: 9, value: 5 },
  { start: 10, end: 11, value: 6 },
  { start: 12, end: 13, value: 7 },
  { start: 14, end: 15, value: 8 },
  { start: 16, end: 17, value: 9 },
  { start: 18, end: 19, value: 10 },
  { start: 20, value: 11 },
];

export function verdantBurstDice(level: number): string {
  const d8s = VERDANT_BURST.find((b) => (b.start ?? -Infinity) <= level && level <= (b.end ?? Infinity))!.value;
  return d8s === 0 ? '1d4' : `${d8s}d8`;
}

const landSpeed = (mode: 'override' | 'downgrade', value: number): Rule => ({
  key: 'ActiveEffectLike',
  mode,
  path: 'system.movement.speeds.land.base',
  value,
});

const lowLight: Rule = { key: 'Sense', selector: 'low-light-vision' };

const extraStrike = (name: string, traits: string): string =>
  `Add a ${name} Strike that deals damage equal to its lowest melee Strike${traits}.`;

interface AncestrySpec {
  readonly id: string;
  readonly name: string;
  readonly page: number;
  readonly languages: readonly string[];
  readonly small?: boolean;
  /** Traits added besides the ancestry's own. */
  readonly alsoTraits?: readonly string[];
  /** Traits removed besides human. */
  readonly alsoRemove?: readonly string[];
  readonly sense?: Rule;
  readonly rules?: readonly Rule[];
  readonly abilities?: (facts: CreatureFacts) => readonly AbilitySpec[];
  readonly byHand?: readonly string[];
  readonly summary: string;
}

/**
 * NPC Core's ancestry adjustments turn a human NPC into another ancestry: the ancestry trait in place
 * of human, its languages, its vision, and for some a size, a Speed or a natural Strike.
 */
const ancestry = (a: AncestrySpec): CreatureTemplate => ({
  id: a.id,
  name: a.name,
  group: 'Ancestry',
  source: `Pathfinder NPC Core pg. ${a.page}`,
  choices: [],
  summary: a.summary,
  build: (facts) => ({
    rules: [
      { key: 'ActorTraits', add: [a.id, ...(a.alsoTraits ?? [])], remove: ['human', ...(a.alsoRemove ?? [])] },
      ...a.languages.map((value): Rule => ({ key: 'ActiveEffectLike', mode: 'add', path: 'system.details.languages.value', value })),
      ...(a.small ? [{ key: 'CreatureSize', value: 'sm' }] : []),
      ...(a.sense ? [a.sense] : []),
      ...(a.rules ?? []),
    ],
    abilities: a.abilities?.(facts) ?? [],
    byHand: a.byHand ?? [],
  }),
});

const ANCESTRY: readonly CreatureTemplate[] = [
  ancestry({ id: 'athamaru', name: 'Athamaru', page: 151, languages: ['thalassic'], alsoTraits: ['amphibious'], sense: lowLight, rules: [speed('swim', 25)], summary: 'Athamaru and amphibious traits, Thalassic, low-light vision and a 25-foot swim Speed.' }),
  ancestry({ id: 'catfolk', name: 'Catfolk', page: 168, languages: ['amurrun'], sense: lowLight, summary: 'Catfolk trait, Amurrun and low-light vision.' }),
  ancestry({
    id: 'dwarf',
    name: 'Dwarf',
    page: 168,
    languages: ['dwarven'],
    sense: darkvision,
    rules: [landSpeed('downgrade', 20)],
    byHand: ['Give it a clan dagger. You may also give it a clan dagger Strike that deals damage equal to its lowest melee Strike.'],
    summary: 'Dwarf trait, Dwarven, darkvision and a Speed of at most 20 feet.',
  }),
  ancestry({
    id: 'elf',
    name: 'Elf',
    page: 168,
    languages: ['elven'],
    sense: lowLight,
    byHand: ['You may raise its Speed to 30 feet if it is lower.'],
    summary: 'Elf trait, Elven and low-light vision.',
  }),
  ancestry({ id: 'gnome', name: 'Gnome', page: 168, languages: ['fey', 'gnomish'], small: true, sense: lowLight, summary: 'Small; gnome trait, Fey, Gnomish and low-light vision.' }),
  ancestry({ id: 'goblin', name: 'Goblin', page: 168, languages: ['goblin'], small: true, sense: darkvision, summary: 'Small; goblin trait, Goblin and darkvision.' }),
  ancestry({
    id: 'halfling',
    name: 'Halfling',
    page: 168,
    languages: ['halfling'],
    small: true,
    abilities: () => [
      {
        slug: 'keen-eyes',
        name: 'Keen Eyes',
        actionType: 'passive',
        category: 'interaction',
        traits: [],
        description:
          '<p>The halfling gets a +2 circumstance bonus to Seek hidden or undetected creatures within 30 feet. The flat check to target a concealed creature is DC 3, and a hidden one DC 9.</p>',
      },
    ],
    summary: 'Small; halfling trait, Halfling and Keen Eyes.',
  }),
  ancestry({ id: 'hobgoblin', name: 'Hobgoblin', page: 168, languages: ['goblin'], sense: darkvision, summary: 'Hobgoblin trait, Goblin and darkvision.' }),
  ancestry({
    id: 'kholo',
    name: 'Kholo',
    page: 169,
    languages: ['kholo'],
    sense: darkvision,
    byHand: [extraStrike('jaws', '')],
    summary: 'Kholo trait, Kholo, darkvision and a jaws Strike.',
  }),
  ancestry({ id: 'kobold', name: 'Kobold', page: 169, languages: ['sakvroth'], small: true, sense: darkvision, summary: 'Small; kobold trait, Sakvroth and darkvision.' }),
  ancestry({
    id: 'leshy',
    name: 'Leshy',
    page: 169,
    languages: ['fey'],
    small: true,
    alsoTraits: ['plant'],
    alsoRemove: ['humanoid'],
    sense: lowLight,
    abilities: (facts) => [
      {
        slug: 'verdant-burst',
        name: 'Verdant Burst',
        actionType: 'passive',
        category: 'defensive',
        traits: ['healing', 'primal'],
        description:
          `<p>When the leshy dies, primal energy bursts from its body. Each plant creature in a 30-foot emanation regains ${verdantBurstDice(facts.level)} Hit Points (by the leshy's level), and the area fills with plants and becomes difficult terrain. Where the plants cannot grow, they wither after 24 hours.</p>`,
      },
    ],
    summary: 'Small; leshy and plant traits in place of human and humanoid, Fey, low-light vision and Verdant Burst.',
  }),
  ancestry({
    id: 'lizardfolk',
    name: 'Lizardfolk',
    page: 169,
    languages: ['iruxi'],
    rules: [speed('swim', 15)],
    abilities: () => [
      {
        slug: 'deep-breath',
        name: 'Deep Breath',
        actionType: 'passive',
        category: 'interaction',
        traits: [],
        description: '<p>The iruxi can hold its breath for 15 minutes.</p>',
      },
    ],
    byHand: ['Turn any fist Strikes into claw Strikes that deal slashing damage instead of bludgeoning.'],
    summary: 'Lizardfolk trait, Iruxi, a 15-foot swim Speed and Deep Breath.',
  }),
  ancestry({
    id: 'merfolk',
    name: 'Merfolk',
    page: 151,
    languages: ['thalassic'],
    alsoTraits: ['amphibious'],
    sense: lowLight,
    rules: [landSpeed('override', 5), speed('swim', 25)],
    byHand: ['A supramarine chair (use the wheelchair rules) gives it a land Speed equal to its swim Speed.'],
    summary: 'Merfolk and amphibious traits, Thalassic, low-light vision, a 5-foot Speed and a 25-foot swim Speed.',
  }),
  ancestry({ id: 'orc', name: 'Orc', page: 169, languages: ['orcish'], sense: darkvision, summary: 'Orc trait, Orcish and darkvision.' }),
  ancestry({
    id: 'ratfolk',
    name: 'Ratfolk',
    page: 169,
    languages: ['ysoki'],
    small: true,
    sense: lowLight,
    byHand: [extraStrike('jaws', ', with the agile and finesse traits')],
    summary: 'Small; ratfolk trait, Ysoki, low-light vision and a jaws Strike.',
  }),
  ancestry({
    id: 'tengu',
    name: 'Tengu',
    page: 169,
    languages: ['tengu'],
    sense: lowLight,
    byHand: [extraStrike('beak', ', with the finesse trait')],
    summary: 'Tengu trait, Tengu, low-light vision and a beak Strike.',
  }),
  ancestry({ id: 'tripkee', name: 'Tripkee', page: 169, languages: ['tripkee'], small: true, sense: lowLight, summary: 'Small; tripkee trait, Tripkee and low-light vision.' }),
];

export const TEMPLATES: readonly CreatureTemplate[] = [
  {
    id: 'undead',
    name: 'Undead',
    group: 'Undead',
    source: 'Pathfinder Book of the Dead pg. 72',
    choices: ['mindless'],
    summary: 'Undead trait and the undead immunities, without a specific kind of undead.',
    build: (_facts, { mindless = false }) => ({
      rules: [
        traits('undead', ...(mindless ? ['mindless'] : [])),
        voidHealing,
        ...immunities([...BASE_IMMUNITIES, ...(mindless ? ['mental'] : [])]),
        ...(mindless ? [] : [necril]),
      ],
      abilities: [],
      byHand: [],
    }),
  },
  {
    id: 'ghost',
    name: 'Ghost',
    group: 'Undead',
    source: 'Pathfinder Book of the Dead pg. 72',
    choices: [],
    summary: 'Incorporeal-style spirit that flies through walls; weak to force, ghost touch and vitality.',
    build: (facts) => {
      const fly = flight(facts);
      return {
        rules: [
          traits('ghost', 'spirit', 'undead'),
          ...undeadBasics(),
          necril,
          ...immunities([...BASE_IMMUNITIES, 'precision']),
          ...ghostTouchWeaknesses(),
          ...fly.rules,
        ],
        abilities: [
          {
            slug: 'ghostly-passage',
            name: 'Ghostly Passage',
            actionType: 'action',
            actions: 1,
            category: 'interaction',
            traits: ['move'],
            description:
              '<p>The creature Flies, and can pass through walls, creatures and other material obstacles as if it were incorporeal. It must begin and end the movement outside any physical obstacle. Moving through solid matter is difficult terrain.</p>',
          },
        ],
        byHand: [voidStrikes, ...fly.byHand],
      };
    },
  },
  {
    id: 'ghoul',
    name: 'Ghoul',
    group: 'Undead',
    source: 'Pathfinder Book of the Dead pg. 72',
    choices: [],
    summary: 'Paralysing bite and a quick leap; saves 1 lower.',
    build: () => ({
      rules: [
        traits('ghoul', 'undead'),
        ...undeadBasics(),
        ...immunities(BASE_IMMUNITIES),
        { key: 'FlatModifier', selector: 'saving-throw', label: 'Ghoul', value: -1 },
      ],
      abilities: [
        {
          slug: 'paralysis',
          name: 'Paralysis',
          actionType: 'passive',
          category: 'offensive',
          traits: ['occult'],
          description:
            "<p>When the creature critically hits with its jaws, a living creature of the ghoul's level or lower that is not an elf is paralyzed until the end of its next turn.</p>",
        },
        {
          slug: 'swift-leap',
          name: 'Swift Leap',
          actionType: 'action',
          actions: 1,
          category: 'interaction',
          traits: ['move'],
          description: '<p>The creature jumps up to half its Speed. This movement does not trigger reactions.</p>',
        },
      ],
      byHand: [
        'Give its jaws (or fangs, or a similar unarmed attack) the Paralysis ability. If it has none, add a jaws Strike with the attack and damage of its strongest melee Strike.',
      ],
    }),
  },
  {
    id: 'mummy',
    name: 'Mummy',
    group: 'Undead',
    source: 'Pathfinder Book of the Dead pg. 72',
    choices: [],
    summary: 'Aura of despair that frightens the living; weak to fire.',
    build: () => ({
      rules: [
        traits('mummy', 'undead'),
        ...undeadBasics(),
        necril,
        ...immunities(BASE_IMMUNITIES),
        weakness('fire', byLevel(STEP_3_5_10_15)),
      ],
      abilities: [
        {
          slug: 'lesser-despair',
          name: 'Lesser Despair',
          actionType: 'passive',
          category: 'offensive',
          traits: ['aura', 'divine', 'emotion', 'fear', 'mental'],
          description:
            "<p>30 feet. Living creatures of the mummy's level or lower are frightened 1 while in the aura. They can't recover from this fear while they stay in it, and lose it as soon as they leave.</p>",
          rules: [{ key: 'Aura', slug: 'lesser-despair', radius: 30, traits: ['emotion', 'fear', 'mental'] }],
        },
      ],
      byHand: [],
    }),
  },
  {
    id: 'shadow',
    name: 'Shadow',
    group: 'Undead',
    source: 'Pathfinder Book of the Dead pg. 72',
    choices: [],
    summary: 'A flying shade that hides in shadows; weak to force, ghost touch and vitality.',
    build: (facts) => {
      const fly = flight(facts);
      return {
        rules: [
          traits('undead'),
          ...undeadBasics(),
          necril,
          ...immunities([...BASE_IMMUNITIES, 'precision']),
          ...ghostTouchWeaknesses(),
          ...fly.rules,
        ],
        abilities: [
          {
            slug: 'slink-in-shadows',
            name: 'Slink in Shadows',
            actionType: 'passive',
            category: 'interaction',
            traits: [],
            description: "<p>The creature can Hide, or end its Sneak, in a creature's or object's shadow.</p>",
          },
        ],
        byHand: [
          voidStrikes,
          `Set its Stealth modifier to +${facts.highestSkill} (its highest skill modifier).`,
          'Add darkness as a 1/day innate divine spell.',
          ...fly.byHand,
        ],
      };
    },
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    group: 'Undead',
    source: 'Pathfinder Book of the Dead pg. 73',
    choices: ['mindless'],
    summary: 'Fewer Hit Points; resists cold, electricity, fire, piercing and slashing.',
    build: (_facts, { mindless = false }) => {
      const resist: Bracket[] = [
        { end: -1, value: 2 },
        { start: 0, end: 1, value: 2 },
        { start: 2, end: 5, value: 3 },
        { start: 6, end: 10, value: 5 },
        { start: 11, value: 10 },
      ];
      return {
        rules: [
          traits('skeleton', 'undead', ...(mindless ? ['mindless'] : [])),
          ...undeadBasics(),
          ...(mindless ? [] : [necril]),
          ...immunities([...BASE_IMMUNITIES, ...(mindless ? ['mental'] : [])]),
          ...['cold', 'electricity', 'fire', 'piercing', 'slashing'].map((t) => resistance(t, byLevel(resist))),
          hp('skeleton', [
            { end: -1, value: -2 },
            { start: 0, end: 1, value: -4 },
            { start: 2, end: 5, value: -10 },
            { start: 6, end: 10, value: -20 },
            { start: 11, value: -40 },
          ]),
        ],
        abilities: [],
        byHand: [],
      };
    },
  },
  {
    id: 'vampire',
    name: 'Vampire',
    group: 'Undead',
    source: 'Pathfinder Book of the Dead pg. 73',
    choices: ['bypass'],
    summary: 'Feeds on blood; fewer Hit Points; resists physical damage except one material.',
    build: (_facts, { bypass = 'silver' }) => {
      const steps: Bracket[] = [
        { end: -1, value: 2 },
        { start: 0, end: 1, value: 2 },
        { start: 2, end: 5, value: 3 },
        { start: 6, end: 10, value: 5 },
        { start: 11, value: 10 },
      ];
      const feedHp = (level: number) => steps.find((b) => (b.start ?? -Infinity) <= level && level <= (b.end ?? Infinity))!.value;
      return {
        rules: [
          traits('undead', 'vampire'),
          ...undeadBasics(),
          necril,
          ...immunities(['death-effects', 'disease', 'paralyzed', 'poison', 'sleep']),
          resistance('physical', byLevel(steps), [bypass]),
          hp('vampire', [
            { end: -1, value: -3 },
            { start: 0, end: 1, value: -5 },
            { start: 2, end: 5, value: -10 },
            { start: 6, end: 10, value: -20 },
            { start: 11, value: -40 },
          ]),
        ],
        abilities: [
          {
            slug: 'feed',
            name: 'Feed',
            actionType: 'action',
            actions: 1,
            category: 'offensive',
            traits: ['divine'],
            description: `<p><strong>Requirements</strong> The creature's last action was a successful jaws or fangs Strike that dealt damage.</p><p><strong>Effect</strong> The creature drinks blood from the target, dealing the Strike's minimum damage and regaining Hit Points by level (${[-1, 0, 2, 6, 11].map((l) => feedHp(l)).join(', ')} at levels -1, 0 to 1, 2 to 5, 6 to 10 and 11 or higher).</p>`,
          },
        ],
        byHand: [
          "Add a fangs Strike dealing the damage of its weakest melee Strike, if it has no jaws or fangs Strike. It can Feed after that Strike.",
        ],
      };
    },
  },
  {
    id: 'wight',
    name: 'Wight',
    group: 'Undead',
    source: 'Pathfinder Book of the Dead pg. 73',
    choices: [],
    summary: 'Strikes drain life, giving it temporary Hit Points and draining the target.',
    build: (facts) => ({
      rules: [traits('undead', 'wight'), ...undeadBasics(), necril, ...immunities(BASE_IMMUNITIES)],
      abilities: [
        {
          slug: 'drain-life',
          name: 'Drain Life',
          actionType: 'passive',
          category: 'offensive',
          traits: ['divine'],
          description: `<p>When the creature damages a living creature with a Strike that has drain life, it gains temporary Hit Points equal to its level, and the target must succeed at a @Check[fortitude|dc:${dcForLevel(facts.level)}] save or become drained 1.</p>`,
        },
      ],
      byHand: [
        `Choose which Strikes have drain life, and lower each one's damage by ${Math.max(0, Math.floor(facts.level / 2))} (half its level).`,
      ],
    }),
  },
  {
    id: 'zombie',
    name: 'Zombie',
    group: 'Undead',
    source: 'Pathfinder Book of the Dead pg. 73',
    choices: [],
    summary: 'Mindless and slow, with extra Hit Points; weak to vitality and slashing.',
    build: (facts) => {
      const weak: Bracket[] = [
        { end: 1, value: 5 },
        { start: 2, end: 5, value: 5 },
        { start: 6, end: 10, value: 10 },
        { start: 11, end: 15, value: 15 },
        { start: 16, end: 19, value: 20 },
        { start: 20, value: 25 },
      ];
      const slowed: Rule[] = facts.slowedUuid ? [{ key: 'GrantItem', uuid: facts.slowedUuid, inMemoryOnly: true }] : [];
      return {
        rules: [
          traits('mindless', 'undead', 'zombie'),
          ...undeadBasics(),
          ...immunities([...BASE_IMMUNITIES, 'mental']),
          weakness('vitality', byLevel(weak)),
          weakness('slashing', byLevel(weak)),
          hp('zombie', [
            { end: 1, value: 10 },
            { start: 2, end: 5, value: 20 },
            { start: 6, end: 10, value: 50 },
            { start: 11, end: 15, value: 75 },
            { start: 16, end: 19, value: 100 },
            { start: 20, value: 150 },
          ]),
          ...slowed,
        ],
        abilities: [
          {
            slug: 'slow',
            name: 'Slow',
            actionType: 'passive',
            category: 'defensive',
            traits: [],
            description: "<p>The creature is permanently slowed 1 and can't use reactions.</p>",
          },
        ],
        byHand: facts.slowedUuid ? [] : ['Give it the slowed 1 condition.'],
      };
    },
  },
  ...ELEMENTAL,
  ...ANCESTRY,
  ...MYTHIC,
  ...WILD,
];

export function findTemplate(id: string): CreatureTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
