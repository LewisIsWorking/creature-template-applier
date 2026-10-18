/**
 * The creature templates, as data. Each one turns into PF2e rule elements on a single effect item,
 * plus ability items, so applying a template never edits the creature's own statistics and removing
 * it is deleting what it added. Mechanics are paraphrased from the source books (see licenses/).
 *
 * Level-dependent numbers are written as level brackets, which PF2e resolves against the creature's
 * level every time it prepares data, so they stay right when the level changes (Elite, Weak).
 */

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
  readonly canFly: boolean;
  /** The creature's highest skill modifier, for Shadow's Stealth. */
  readonly highestSkill: number;
  /** The Slowed condition's UUID in this system, for Zombie; null if the system has none. */
  readonly slowedUuid: string | null;
}

export type Bypass = 'cold-iron' | 'silver' | 'wood';

export interface TemplateChoices {
  readonly mindless?: boolean;
  /** Vampire only: the material that bypasses its physical resistance. */
  readonly bypass?: Bypass;
}

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
  readonly choices: readonly ('mindless' | 'bypass')[];
  readonly summary: string;
  build(facts: CreatureFacts, choices: TemplateChoices): TemplateResult;
}

export const LEVEL_FIELD = 'actor|system.details.level.value';

export const byLevel = (brackets: readonly Bracket[]) => ({ field: LEVEL_FIELD, brackets });

/** The four-step table Book of the Dead uses for many weaknesses: 3, 5, 10, 15. */
const STEP_3_5_10_15: readonly Bracket[] = [
  { end: 3, value: 3 },
  { start: 4, end: 8, value: 5 },
  { start: 9, end: 13, value: 10 },
  { start: 14, value: 15 },
];

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
const hp = (brackets: readonly Bracket[]): Rule => ({
  key: 'FlatModifier',
  selector: 'hp',
  label: 'Template',
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
          hp([
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
          hp([
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
          hp([
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
];

export function findTemplate(id: string): CreatureTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
