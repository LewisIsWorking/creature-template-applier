/**
 * The six creature adaptations from Pathfinder Howl of the Wild (pgs. 122 and 123): Amphibious,
 * Frostbound, Miniature, Sandbound, Twinned and Winged. They change no level, Hit Points or defences;
 * each adds Speeds, a skill, a size, a resistance and weakness pair or a few abilities.
 */
import { byLevel, STEP_3_5_10_15, type AbilitySpec, type CreatureFacts, type CreatureTemplate, type Rule } from './templates.ts';

const source = (page: number): string => `Pathfinder Howl of the Wild pg. ${page}`;

/** Half a Speed, in whole 5-foot steps. */
export const halfSpeed = (feet: number): number => Math.floor(feet / 10) * 5;

/** Raises a skill to the creature's highest skill modifier, the way Shadow's Stealth works. */
function topSkill(id: string, name: string, skill: string, facts: CreatureFacts): Rule[] {
  const raise = facts.highestSkill - (facts.skills[skill] ?? 0);
  return raise > 0 ? [{ key: 'FlatModifier', selector: skill, slug: `${id}-template-skill`, label: `${name} adaptation`, value: raise }] : [];
}

const ability = (
  slug: string,
  name: string,
  kind: { actionType: 'action'; actions: 1 | 2 } | { actionType: 'passive' } | { actionType: 'reaction' },
  category: AbilitySpec['category'],
  description: string,
): AbilitySpec => ({ slug, name, ...kind, category, traits: [], description: `<p>${description}</p>` });

const ONE = { actionType: 'action', actions: 1 } as const;
const TWO = { actionType: 'action', actions: 2 } as const;
const PASSIVE = { actionType: 'passive' } as const;
const REACTION = { actionType: 'reaction' } as const;

/** Frostbound and Sandbound: resistance to one element and weakness to the other, 3, 5, 10 or 15. */
const climate = (resist: string, weak: string): Rule[] => [
  { key: 'Resistance', type: resist, value: byLevel(STEP_3_5_10_15) },
  { key: 'Weakness', type: weak, value: byLevel(STEP_3_5_10_15) },
];

const adaptation = (t: Omit<CreatureTemplate, 'group' | 'choices'>): CreatureTemplate => ({ ...t, group: 'Adaptation', choices: [] });

export const WILD: readonly CreatureTemplate[] = [
  adaptation({
    id: 'amphibious',
    name: 'Amphibious',
    source: source(122),
    summary: 'Amphibious trait, low-light vision, top Athletics, a swim or land Speed if it lacks one, and Drag Along.',
    build: (facts) => {
      const land = facts.speeds['land'] ?? 0;
      const swim = facts.speeds['swim'] ?? 0;
      return {
        rules: [
          { key: 'ActorTraits', add: ['amphibious'], remove: ['aquatic'] },
          { key: 'Sense', selector: 'low-light-vision' },
          ...(swim === 0 && land > 0 ? [{ key: 'BaseSpeed', selector: 'swim', value: Math.max(15, halfSpeed(land)) }] : []),
          ...(land === 0 && swim > 0
            ? [{ key: 'ActiveEffectLike', mode: 'upgrade', path: 'system.movement.speeds.land.base', value: Math.max(15, halfSpeed(swim)) }]
            : []),
          ...topSkill('amphibious', 'Amphibious', 'athletics', facts),
        ],
        abilities: [
          ability(
            'drag-along',
            'Drag Along',
            ONE,
            'offensive',
            '<strong>Requirements</strong> Its previous action was a successful melee Strike.</p><p><strong>Effect</strong> It Strides or Swims 10 feet away from the target, and the target moves the same direction and distance (forced movement).',
          ),
        ],
        byHand: [],
      };
    },
  }),
  adaptation({
    id: 'frostbound',
    name: 'Frostbound',
    source: source(122),
    summary: 'Cold resistance and fire weakness 3/5/10/15, at home in ice and snow, and Snow Spray.',
    build: () => ({
      rules: climate('cold', 'fire'),
      abilities: [
        ability('freezing-adaptation', 'Freezing Adaptation', PASSIVE, 'defensive', 'It treats environmental cold as one step less extreme: incredible cold becomes extreme, extreme becomes severe, and so on.'),
        ability('winter-senses', 'Winter Senses', PASSIVE, 'defensive', 'It ignores concealment caused by ice or snow.'),
        ability(
          'arctic-steps',
          'Arctic Steps',
          PASSIVE,
          'interaction',
          'It ignores uneven ground and difficult terrain caused by ice, and difficult terrain caused by snow. Greater difficult terrain from ice or snow is only difficult terrain for it.',
        ),
        ability(
          'snow-spray',
          'Snow Spray',
          ONE,
          'defensive',
          '<strong>Requirements</strong> It is standing on or next to loose snow.</p><p><strong>Effect</strong> It is concealed from all creatures not adjacent to it until it moves or the end of its next turn.',
        ),
      ],
      byHand: [],
    }),
  }),
  adaptation({
    id: 'miniature',
    name: 'Miniature',
    source: source(122),
    summary: 'Tiny, shorter reach, top Stealth and Scamper Underfoot.',
    build: (facts) => ({
      rules: [{ key: 'CreatureSize', value: 'tiny' }, ...topSkill('miniature', 'Miniature', 'stealth', facts)],
      abilities: [
        ability(
          'scamper-underfoot',
          'Scamper Underfoot',
          TWO,
          'interaction',
          'It Strides twice. It can move through the spaces of creatures larger than itself, and this movement does not trigger reactions.',
        ),
      ],
      byHand: ['Cut the reach of its shortest-reach melee Strikes to 0 feet, and of any long-reach ones (a tail or tentacle) to 5 feet.'],
    }),
  }),
  adaptation({
    id: 'sandbound',
    name: 'Sandbound',
    source: source(123),
    summary: 'Fire resistance and cold weakness 3/5/10/15, a burrow Speed, at home in sand, and Sand Burst.',
    build: (facts) => ({
      rules: [
        ...climate('fire', 'cold'),
        ...((facts.speeds['burrow'] ?? 0) === 0 && halfSpeed(facts.highestSpeed) > 0
          ? [{ key: 'BaseSpeed', selector: 'burrow', value: halfSpeed(facts.highestSpeed) }]
          : []),
      ],
      abilities: [
        ability('efficient-metabolism', 'Efficient Metabolism', PASSIVE, 'defensive', 'It can go 10 times as long as normal before starvation and thirst affect it.'),
        ability('scorching-adaptation', 'Scorching Adaptation', PASSIVE, 'defensive', 'It treats environmental heat as one step less extreme: incredible heat becomes extreme, extreme becomes severe, and so on.'),
        ability('desert-steps', 'Desert Steps', PASSIVE, 'interaction', 'It ignores uneven ground and difficult terrain caused by sand. Greater difficult terrain from sand is only difficult terrain for it.'),
        ability(
          'sand-burst',
          'Sand Burst',
          TWO,
          'offensive',
          '<strong>Requirements</strong> It is burrowed in loose sand or earth.</p><p><strong>Effect</strong> It Burrows twice, then makes a melee Strike. If it was undetected when it started moving, it stays undetected until after the attack.',
        ),
      ],
      byHand: [],
    }),
  }),
  adaptation({
    id: 'twinned',
    name: 'Twinned',
    source: source(123),
    summary: 'Two heads, each with its own turn; Gnaw Free and Reactive Strike.',
    build: () => ({
      rules: [],
      abilities: [
        ability(
          'independent-brains',
          'Independent Brains',
          PASSIVE,
          'defensive',
          'Each head rolls its own initiative and takes its own turn, and neither can Delay. At the start of its turn a head gets 2 actions and 1 reaction, and either brain can control the body. Damage equal to half its Hit Points, or an effect that severs a head, destroys one head, and the creature loses that head\'s turns, actions and reactions. Mental effects that target a single creature affect only one head.',
        ),
        ability('gnaw-free', 'Gnaw Free', REACTION, 'defensive', '<strong>Trigger</strong> Its other head attempts to Escape.</p><p><strong>Effect</strong> This head bites at the grappler or restraints, giving a +2 circumstance bonus to the Escape check.'),
        ability(
          'reactive-strike',
          'Reactive Strike',
          REACTION,
          'offensive',
          '<strong>Trigger</strong> A creature within its reach uses a manipulate or move action, makes a ranged attack, or leaves a square during a move action.</p><p><strong>Effect</strong> It makes a melee Strike against the triggering creature. On a critical hit against a manipulate action, it disrupts that action. This Strike does not count toward its multiple attack penalty, and the penalty does not apply to it.',
        ),
      ],
      byHand: ['Add a second combatant to the encounter for the other head, so each head has its own initiative.', 'Remove this Reactive Strike if it already has one.'],
    }),
  }),
  adaptation({
    id: 'winged',
    name: 'Winged',
    source: source(123),
    summary: 'A fly Speed equal to its highest Speed, top Acrobatics and Dropping Dodge.',
    build: (facts) => ({
      rules: [
        ...(!facts.canFly && facts.highestSpeed > 0 ? [{ key: 'BaseSpeed', selector: 'fly', value: facts.highestSpeed }] : []),
        ...topSkill('winged', 'Winged', 'acrobatics', facts),
      ],
      abilities: [
        ability(
          'dropping-dodge',
          'Dropping Dodge',
          REACTION,
          'defensive',
          '<strong>Requirements</strong> It is flying.</p><p><strong>Trigger</strong> An enemy targets it with a Strike.</p><p><strong>Effect</strong> It gains a +2 circumstance bonus to AC against that Strike. After the Strike, it drops 15 feet; if the ground stops it, it takes no falling damage.',
        ),
      ],
      byHand: [],
    }),
  }),
];
