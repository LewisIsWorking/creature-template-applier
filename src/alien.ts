/**
 * The ten creature adjustments from Starfinder Alien Core (pgs. 204 to 207): Aerial, Environmental
 * Adaptation, Hardlight, Interstellar, Magical, Marine, Nanite, Robotic, Sapient and Warped. None
 * changes the level or Hit Points; each adds traits, defences, Speeds, senses or a few abilities.
 * The book advises against applying the same adjustment twice.
 */
import { byLevel, dcForLevel, STEP_3_5_10_15 } from './levels.ts';
import { picked } from './cryptids.ts';
import { halfSpeed, topSkill } from './wild.ts';
import type { AbilitySpec, CreatureFacts, CreatureTemplate, Pick, Rule } from './templates.ts';

const source = (page: number): string => `Starfinder Alien Core pg. ${page}`;

const ability = (
  slug: string,
  name: string,
  kind: { actionType: 'action'; actions: 2 } | { actionType: 'passive' } | { actionType: 'reaction' },
  category: AbilitySpec['category'],
  traits: readonly string[],
  description: string,
): AbilitySpec => ({ slug, name, ...kind, category, traits, description: `<p>${description}</p>` });

const TWO = { actionType: 'action', actions: 2 } as const;
const PASSIVE = { actionType: 'passive' } as const;
const REACTION = { actionType: 'reaction' } as const;

const immunities = (types: readonly string[]): Rule[] => types.map((type) => ({ key: 'Immunity', type }));
const darkvision: Rule = { key: 'Sense', selector: 'darkvision' };
const step = (key: 'Weakness' | 'Resistance', type: string): Rule => ({ key, type, value: byLevel(STEP_3_5_10_15) });

/** What Hardlight and Robotic share: a body that is not alive. */
const MACHINE_IMMUNE = [
  'bleed', 'death-effects', 'disease', 'doomed', 'drained', 'fatigued', 'healing', 'nonlethal-attacks',
  'paralyzed', 'poison', 'sickened', 'spirit', 'unconscious', 'vitality', 'void',
] as const;

const noRanged = (what: string): string =>
  `If it has no ranged attack, give it a ${what} with a 60-foot range increment: the damage of its highest-damage Strike, at an attack modifier 2 lower.`;

/** Aerial, and Interstellar which includes it: a fly Speed and top Acrobatics. */
function aerial(id: string, name: string, facts: CreatureFacts): Rule[] {
  return [
    ...(!facts.canFly && facts.highestSpeed > 0 ? [{ key: 'BaseSpeed', selector: 'fly', value: facts.highestSpeed }] : []),
    ...topSkill(id, name, 'acrobatics', facts),
  ];
}

export const ENVIRONMENT_PICKS: readonly Pick[] = [
  { id: 'temperature-adaptation', name: 'Temperature Adaptation', default: true },
  { id: 'terrain-adaptation', name: 'Terrain Adaptation', default: true },
  { id: 'burrow', name: 'Burrow Speed', default: false },
  { id: 'climb', name: 'Climb Speed', default: false },
];

const adjustment = (t: Omit<CreatureTemplate, 'group' | 'choices'> & { choices?: CreatureTemplate['choices'] }): CreatureTemplate => ({
  choices: [],
  ...t,
  group: 'Starfinder',
});

export const ALIEN: readonly CreatureTemplate[] = [
  adjustment({
    id: 'aerial',
    name: 'Aerial',
    source: source(204),
    summary: 'A fly Speed equal to its highest Speed, and top Acrobatics.',
    build: (facts) => ({
      rules: aerial('aerial', 'Aerial', facts),
      abilities: [],
      byHand: ['If it suits the creature, let it hover, or take away its other Speeds.'],
    }),
  }),
  adjustment({
    id: 'environmental-adaptation',
    name: 'Environmental Adaptation',
    source: source(205),
    picks: ENVIRONMENT_PICKS,
    summary: 'Environmental protections without limit, and a pick of temperature, terrain, burrow and climb adaptations.',
    build: (facts, choices) => {
      const chosen = picked(ENVIRONMENT_PICKS, choices);
      const half = halfSpeed(facts.highestSpeed);
      const speed = (type: string): Rule[] =>
        chosen.has(type) && (facts.speeds[type] ?? 0) === 0 && half > 0 ? [{ key: 'BaseSpeed', selector: type, value: half }] : [];
      return {
        rules: [...speed('burrow'), ...speed('climb')],
        abilities: [
          ability('environmental-protections', 'Environmental Protections', PASSIVE, 'defensive', [], 'It has basic environmental protections, with no limit on how often or how long they work.'),
          ...(chosen.has('temperature-adaptation')
            ? [ability('temperature-adaptation', 'Temperature Adaptation', PASSIVE, 'defensive', [], 'It treats environmental heat and cold as one step less extreme: incredible becomes extreme, extreme becomes severe, and so on.')]
            : []),
          ...(chosen.has('terrain-adaptation')
            ? [
                ability(
                  'terrain-adaptation',
                  'Terrain Adaptation',
                  PASSIVE,
                  'interaction',
                  [],
                  'It ignores uneven ground and difficult terrain caused by the most common terrain of its environment. Greater difficult terrain of that kind is only difficult terrain for it.',
                ),
              ]
            : []),
        ],
        byHand: ['If its environment calls for it, make it immune to that environment\'s effects, such as a toxic or corrosive atmosphere.'],
      };
    },
  }),
  adjustment({
    id: 'hardlight',
    name: 'Hardlight',
    source: source(205),
    summary: 'Construct and tech, a hardlight body\'s immunities, physical resistance and electricity and force weakness 3/5/10/15, darkvision and Tethered.',
    build: () => ({
      rules: [
        { key: 'ActorTraits', add: ['construct', 'tech'] },
        ...immunities(MACHINE_IMMUNE),
        step('Weakness', 'electricity'),
        step('Weakness', 'force'),
        step('Resistance', 'physical'),
        darkvision,
      ],
      abilities: [
        ability(
          'tethered',
          'Tethered',
          PASSIVE,
          'defensive',
          [],
          'It cannot move farther from its hardlight projector than the projector allows. Reduced to 0 Hit Points, it vanishes, and the projector rebuilds it in 1d4 hours. Only repairing or destroying the projector ends it for good.',
        ),
      ],
      byHand: ['Ghost-killer weapons get through its physical resistance.', noRanged('hardlight beam Strike dealing force damage')],
    }),
  }),
  adjustment({
    id: 'interstellar',
    name: 'Interstellar',
    source: source(206),
    summary: 'Cosmic, so it can fly through space: a fly Speed, top Acrobatics, and immunity to cold and radiation.',
    build: (facts) => ({
      rules: [{ key: 'ActorTraits', add: ['cosmic'] }, ...aerial('interstellar', 'Interstellar', facts), ...immunities(['cold', 'radiation'])],
      abilities: [],
      byHand: [],
    }),
  }),
  adjustment({
    id: 'magical',
    name: 'Magical',
    source: source(206),
    summary: 'Tied to a magical tradition: Magical Resilience, plus innate spells you choose.',
    build: () => ({
      rules: [],
      abilities: [
        ability(
          'magical-resilience',
          'Magical Resilience',
          REACTION,
          'defensive',
          [],
          '<strong>Trigger</strong> It attempts a saving throw against a spell or magical effect of its tradition, before rolling.</p><p><strong>Effect</strong> It gains a +1 circumstance bonus to that saving throw.',
        ),
      ],
      byHand: [
        'Choose its tradition (arcane, divine, occult or primal) and whether its spells use Intelligence, Wisdom or Charisma.',
        'Raise that attribute modifier by 1 or 2, no higher than its other highest attribute modifier.',
        'Give it about three innate spells of that tradition, of up to half its level, that are memorable or useful.',
      ],
    }),
  }),
  adjustment({
    id: 'marine',
    name: 'Marine',
    source: source(206),
    choices: ['aquatic'],
    summary: 'Amphibious (or aquatic), top Athletics, a swim or land Speed if it lacks one, low-light vision and scent.',
    build: (facts, choices) => {
      const aquatic = choices.aquatic === true;
      const land = facts.speeds['land'] ?? 0;
      const swim = facts.speeds['swim'] ?? 0;
      const swimSpeed = aquatic ? facts.highestSpeed : land > 0 ? Math.max(15, halfSpeed(land)) : 0;
      return {
        rules: [
          aquatic ? { key: 'ActorTraits', add: ['aquatic'], remove: ['amphibious'] } : { key: 'ActorTraits', add: ['amphibious'], remove: ['aquatic'] },
          ...(swim === 0 && swimSpeed > 0 ? [{ key: 'BaseSpeed', selector: 'swim', value: swimSpeed }] : []),
          ...(!aquatic && land === 0 && swim > 0
            ? [{ key: 'ActiveEffectLike', mode: 'upgrade', path: 'system.movement.speeds.land.base', value: Math.max(15, halfSpeed(swim)) }]
            : []),
          ...topSkill('marine', 'Marine', 'athletics', facts),
          { key: 'Sense', selector: 'low-light-vision' },
          { key: 'Sense', selector: 'scent', acuity: 'imprecise', range: 120 },
        ],
        abilities: [],
        byHand: aquatic ? ['Scent is optional for an aquatic creature: remove it if it does not fit.'] : [],
      };
    },
  }),
  adjustment({
    id: 'nanite',
    name: 'Nanite',
    source: source(206),
    summary: 'A body of nanites: its immunities, darkvision, All-Around Vision, Compression and Nanite Surge.',
    build: (facts) => ({
      rules: [...immunities(['acid', 'bleed', 'critical-hits', 'mental', 'precision', 'unconscious', 'visual']), darkvision],
      abilities: [
        ability('all-around-vision', 'All-Around Vision', PASSIVE, 'defensive', [], 'It sees in every direction at once, so it cannot be flanked.'),
        ability('compression', 'Compression', PASSIVE, 'interaction', [], 'It moves through a gap at least 2 feet wide without Squeezing, and can Squeeze through a gap at least 1 foot wide.'),
        ability(
          'nanite-surge',
          'Nanite Surge',
          TWO,
          'interaction',
          [],
          `<strong>Frequency</strong> once per day</p><p><strong>Effect</strong> It restores ${6 * Math.max(facts.level, 1)} Hit Points (6 per level) to one creature or item with the tech trait.`,
        ),
      ],
      byHand: ['Strikes from its own body (an integrated weapon, jaws or fist) can deal acid damage instead.'],
    }),
  }),
  adjustment({
    id: 'robotic',
    name: 'Robotic',
    source: source(206),
    summary: 'Construct, robot and tech, a machine\'s immunities, and electricity weakness 3/5/10/15.',
    build: () => ({
      rules: [{ key: 'ActorTraits', add: ['construct', 'robot', 'tech'] }, ...immunities([...MACHINE_IMMUNE, 'mental']), step('Weakness', 'electricity')],
      abilities: [],
      byHand: ['Add security robot abilities if you like.', noRanged('laser cannon Strike dealing fire damage')],
    }),
  }),
  adjustment({
    id: 'sapient',
    name: 'Sapient',
    source: source(207),
    summary: 'A mindless creature that can think: no longer mindless, with the skills and languages you give it.',
    build: (facts) => ({
      rules: facts.traits.includes('mindless') ? [{ key: 'ActorTraits', remove: ['mindless'] }] : [],
      abilities: [],
      byHand: [
        ...(facts.traits.includes('mindless') ? [] : ['This adjustment is meant for a mindless creature, and this one is not.']),
        'Raise its Intelligence modifier from -5 to a fitting value, up to its highest attribute modifier.',
        `Add up to three skills at +${facts.highestSkill}, its highest skill modifier.`,
        'Add up to three languages it understands, and speaks if it can. Give it telepathy if it has no way to speak.',
      ],
    }),
  }),
  adjustment({
    id: 'warped',
    name: 'Warped',
    source: source(207),
    summary: 'Mutant, Not Really There and an Unsettling aura.',
    build: (facts) => ({
      rules: [{ key: 'ActorTraits', add: ['mutant'] }],
      abilities: [
        ability(
          'not-really-there',
          'Not Really There',
          REACTION,
          'defensive',
          ['teleportation'],
          '<strong>Trigger</strong> A creature it is aware of targets it with an attack or an area effect.</p><p><strong>Effect</strong> It teleports 10 feet. If that takes it out of the attack\'s range or area, the attack misses; if not, it gains a +2 circumstance bonus to AC and Reflex saves against that attack.',
        ),
        ability(
          'unsettling',
          'Unsettling',
          PASSIVE,
          'offensive',
          ['aura', 'visual'],
          `20 feet. A creature that enters the aura must succeed at a @Check[will|dc:${dcForLevel(facts.level) + 2}] save or be frightened 1 (frightened 2 on a critical failure). It is then immune for 1 minute.`,
        ),
      ],
      byHand: ['If its spell DC or one of its ability DCs is higher, use that for Unsettling.'],
    }),
  }),
];
