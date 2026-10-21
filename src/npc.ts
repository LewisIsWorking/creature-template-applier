/**
 * NPC adjustments: Corrupt, Guerrilla, Retired and Union Organizer from Pathfinder NPC Core, and
 * Secret Society Member from Dark Archive (Remastered); plus Broodpiercer, the parasite from Howl of
 * the Wild. Skill targets come from the creature-building Skills table (GM Core pg. 116). Where a
 * Lore it should gain is not on its sheet, the GM adds it by hand at the value given.
 */
import { adjustments, LIMITED_USE, picked, smarter } from './cryptids.ts';
import type { AbilitySpec, CreatureFacts, CreatureTemplate, Pick, Rule, Social } from './templates.ts';

/** Skill modifiers by level, -1 to 24 (GM Core pg. 116, Table 2-3: Skills). */
const HIGH_SKILL = [5, 6, 7, 8, 10, 12, 13, 15, 17, 18, 20, 22, 23, 25, 27, 28, 30, 32, 33, 35, 37, 38, 40, 42, 43, 45];
const MODERATE_SKILL = [4, 5, 6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 38, 40];

const atLevel = (table: readonly number[], level: number): number => table[Math.min(Math.max(Math.trunc(level), -1), 24) + 1] as number;

export const highSkill = (level: number): number => atLevel(HIGH_SKILL, level);
export const moderateSkill = (level: number): number => atLevel(MODERATE_SKILL, level);

interface Raised {
  readonly rules: Rule[];
  readonly byHand: string[];
}

/**
 * Raises a skill to `target`. `counted` is what the template already adds to every skill, so the
 * final modifier lands on the target. A skill missing from the sheet (a Lore) is left to the GM.
 */
function raise(id: string, name: string, skill: string, label: string, target: number, facts: CreatureFacts, counted = 0): Raised {
  const current = facts.skills[skill];
  if (current === undefined) return { rules: [], byHand: [`Add ${label} at +${target}.`] };
  const value = target - counted - current;
  return {
    rules: value > 0 ? [{ key: 'FlatModifier', selector: skill, slug: `${id}-${skill}`, label: `${name} template`, value }] : [],
    byHand: [],
  };
}

const merge = (...all: Raised[]): Raised => ({ rules: all.flatMap((r) => r.rules), byHand: all.flatMap((r) => r.byHand) });

const ability = (
  slug: string,
  name: string,
  kind: { actionType: 'action'; actions: 1 | 2 } | { actionType: 'passive' } | { actionType: 'reaction' } | { actionType: 'free' },
  category: AbilitySpec['category'],
  traits: readonly string[],
  description: string,
  rules?: readonly Rule[],
): AbilitySpec => ({ slug, name, ...kind, category, traits, description: `<p>${description}</p>`, ...(rules ? { rules } : {}) });

const ONE = { actionType: 'action', actions: 1 } as const;
const TWO = { actionType: 'action', actions: 2 } as const;
const PASSIVE = { actionType: 'passive' } as const;
const REACTION = { actionType: 'reaction' } as const;
const FREE = { actionType: 'free' } as const;

const npcCore = (page: number): string => `Pathfinder NPC Core pg. ${page}`;

/** The roll option Retired's Rusty hangs on: the GM unticks it when Still Got It! suppresses Rusty. */
const RUSTY = 'retired-rusty';

const SOCIETY_PICKS: readonly Pick[] = [
  { id: 'get-out-of-jail', name: 'Get out of Jail', default: false },
  { id: 'not-today', name: 'Not Today!', default: true },
  { id: 'prepared-diversion', name: 'Prepared Diversion', default: true },
  { id: 'prepared-trap', name: 'Prepared Trap', default: false },
  { id: 'skill-savvy', name: 'Skill Savvy', default: false },
  { id: 'tag-team', name: 'Tag Team', default: true },
];

/** Skill Savvy's feats, by the level the member must be to pick them. */
export function skillSavvyFeats(level: number): string {
  const feats = ['Charming Liar', 'Courtly Graces', 'Glean Contents', 'Hobnobber', 'Lengthy Diversion', 'Lie to Me', 'Quick Coercion', 'Streetwise'];
  if (level >= 2) feats.push('Discreet Inquiry', 'Glad-Hand', 'Lasting Coercion');
  if (level >= 7) feats.push('Shameless Request', 'Slippery Secrets');
  return feats.join(', ');
}

export const NPCS: readonly CreatureTemplate[] = [
  {
    id: 'corrupt',
    name: 'Corrupt',
    group: 'NPC',
    source: npcCore(122),
    choices: [],
    summary: 'For officials: high Deception and Underworld Lore, Will -1, and Official Bully with a skill of its office.',
    build: (facts) => {
      const high = highSkill(facts.level);
      const skills = merge(
        raise('corrupt', 'Corrupt', 'deception', 'Deception', high, facts),
        raise('corrupt', 'Corrupt', 'underworld-lore', 'Underworld Lore', high, facts),
      );
      return {
        rules: [...skills.rules, { key: 'FlatModifier', selector: 'will', slug: 'corrupt-will', label: 'Corrupt template', value: -1 }],
        abilities: [
          ability(
            'official-bully',
            'Official Bully',
            PASSIVE,
            'interaction',
            [],
            'It can use the skill of its office to Coerce or Demoralize instead of Intimidation.',
          ),
        ],
        byHand: [
          ...skills.byHand,
          'Official Bully: name the skill of its office, an Intelligence, Wisdom or Charisma skill such as Legal Lore for a judge.',
        ],
      };
    },
  },
  {
    id: 'guerrilla',
    name: 'Guerrilla',
    group: 'NPC',
    source: npcCore(95),
    choices: [],
    summary: 'High Stealth, Athletics -2, Strike damage -2, Sneak Attack 1d6 and Pounce.',
    build: (facts) => {
      const stealth = raise('guerrilla', 'Guerrilla', 'stealth', 'Stealth', highSkill(facts.level), facts);
      const label = 'Guerrilla template';
      return {
        rules: [
          ...stealth.rules,
          ...(facts.trained.includes('athletics') ? [{ key: 'FlatModifier', selector: 'athletics', slug: 'guerrilla-athletics', label, value: -2 }] : []),
          { key: 'FlatModifier', selector: 'strike-damage', slug: 'guerrilla-damage', label, value: -2 },
        ],
        abilities: [
          ability('sneak-attack', 'Sneak Attack', PASSIVE, 'offensive', [], 'It deals 1d6 extra precision damage to off-guard creatures.', [
            {
              key: 'DamageDice',
              selector: 'strike-damage',
              diceNumber: 1,
              dieSize: 'd6',
              category: 'precision',
              predicate: ['target:condition:off-guard'],
            },
          ]),
          ability(
            'pounce',
            'Pounce',
            ONE,
            'offensive',
            [],
            'It Strides and makes a Strike at the end of that movement. If it began this action hidden, it remains hidden until after this Strike.',
          ),
        ],
        byHand: stealth.byHand,
      };
    },
  },
  {
    id: 'retired',
    name: 'Retired',
    group: 'NPC',
    source: npcCore(81),
    choices: [],
    summary: 'Level -1; Rusty (-1 to everything, worse initiative) until Still Got It!; hides its past with Deception.',
    build: (facts) => {
      const level = facts.level - 1;
      return {
        rules: [{ key: 'ActiveEffectLike', mode: 'add', path: 'system.details.level.value', value: -1 }],
        abilities: [
          ability(
            'rusty',
            'Rusty',
            PASSIVE,
            'defensive',
            [],
            'It takes a -1 status penalty to all its rolls and DCs. It rolls initiative twice and takes the lower result (a misfortune effect).',
            [
              { key: 'RollOption', domain: 'all', option: RUSTY, toggleable: true, value: true, label: 'Rusty' },
              { key: 'FlatModifier', selector: 'all', type: 'status', slug: 'retired-rusty', label: 'Rusty', value: -1, predicate: [RUSTY] },
              { key: 'RollTwice', selector: 'initiative', keep: 'lower', predicate: [RUSTY] },
            ],
          ),
          ability(
            'still-got-it',
            'Still Got It!',
            FREE,
            'defensive',
            [],
            `<strong>Frequency</strong> once per encounter</p><p><strong>Requirements</strong> It is in a combat encounter and has made a critical hit, or it is the second round of its encounter.</p><p><strong>Effect</strong> It gains ${Math.max(level, 1)} temporary Hit Points until the end of the encounter, and Rusty is suppressed until then (untick Rusty).`,
          ),
        ],
        byHand: [
          `Add a Lore for its career in retirement (Cooking, Farming, Guild, Sailing Lore...) at +${highSkill(level)}.`,
          'Give it Deception if it has none. It has a +4 circumstance bonus to Deception to hide its identity, lost against anyone who sees it hit with a Strike or use Still Got It!.',
          'Remove its combat items, and the attacks and abilities that need them; they are usually in a hidden cache.',
        ],
      };
    },
  },
  {
    id: 'union-organizer',
    name: 'Union Organizer',
    group: 'NPC',
    source: npcCore(71),
    choices: [],
    summary: 'Diplomacy and Labor Lore at its best skill, and the Solidarity aura.',
    build: (facts) => {
      const skills = merge(
        raise('union-organizer', 'Union Organizer', 'diplomacy', 'Diplomacy', facts.highestSkill, facts),
        raise('union-organizer', 'Union Organizer', 'labor-lore', 'Labor Lore', facts.highestSkill, facts),
      );
      return {
        rules: skills.rules,
        abilities: [
          ability(
            'solidarity',
            'Solidarity',
            PASSIVE,
            'defensive',
            ['aura'],
            'Aura 10 feet. While it leads a demonstration, it and its allies in the aura have a +1 circumstance bonus to saves against fatigue and mental effects. The aura grows to 20 feet with at least 5 allies within 10 feet of it, and to 30 feet with at least 10 allies within 20 feet.',
          ),
        ],
        byHand: skills.byHand,
      };
    },
  },
  {
    id: 'secret-society-member',
    name: 'Secret Society Member',
    group: 'NPC',
    source: 'Pathfinder Dark Archive (Remastered) pg. 80',
    choices: ['social'],
    picks: SOCIETY_PICKS,
    summary: 'Level +1 and +1 to everything; high Deception and Society, Connected, Shibboleth, and two or three society abilities.',
    build: (facts, choices) => {
      const level = facts.level + 1;
      const social: Social = choices.social ?? 'diplomacy';
      const other: Social = social === 'diplomacy' ? 'intimidation' : 'diplomacy';
      const name = 'Secret Society Member';
      const up = (skill: string, label: string, target: number) => raise('secret-society-member', name, skill, label, target, facts, 1);
      const label = (s: Social) => (s === 'diplomacy' ? 'Diplomacy' : 'Intimidation');
      const skills = merge(
        up('deception', 'Deception', highSkill(level)),
        up('society', 'Society', highSkill(level)),
        up(social, label(social), highSkill(level)),
        up(other, label(other), moderateSkill(level)),
      );
      const has = picked(SOCIETY_PICKS, choices);
      return {
        rules: [...adjustments('secret-society-member', name, facts), ...skills.rules],
        abilities: [
          ability(
            'connected',
            'Connected',
            PASSIVE,
            'interaction',
            [],
            "When it meets a character from a settlement where its society has influence, it can attempt a Society check: an easy DC for that character's level if the character is from the group the society recruits from, otherwise a hard DC or higher. On a success it has a connection with that character, giving it a +2 circumstance bonus to Make an Impression, Coerce, Demoralize or Request; on a critical success the bonus is +4.",
          ),
          ability(
            'shibboleth',
            'Shibboleth',
            PASSIVE,
            'interaction',
            [],
            "It talks with other members in coded language. A creature gauging the conversation can attempt a secret Perception check against its Deception DC to notice a secret was passed, then a Society check against the same DC: a success gives the rough topic, a critical success the exact message.",
          ),
          ...(has.has('get-out-of-jail')
            ? [
                ability(
                  'get-out-of-jail',
                  'Get out of Jail',
                  PASSIVE,
                  'interaction',
                  [],
                  'When brought to justice, it attempts a Society check against a simple DC set by the crime and the evidence (typically 20). Critical success: exonerated, and its accusers face charges. Success: found not guilty. Failure: found guilty but freed on a technicality, bribe or escape; its reputation suffers. Critical failure: it cannot escape the sentence, and its society likely cuts ties.',
                ),
              ]
            : []),
          ...(has.has('not-today')
            ? [
                ability(
                  'not-today',
                  'Not Today!',
                  REACTION,
                  'defensive',
                  [],
                  `<strong>Frequency</strong> once per day</p><p><strong>Trigger</strong> It is reduced to 0 Hit Points.</p><p><strong>Effect</strong> It stays at 1 Hit Point, gains ${level} temporary Hit Points and Strides twice, or Burrows, Climbs, Flies or Swims twice if it has that Speed.`,
                ),
              ]
            : []),
          ...(has.has('prepared-diversion')
            ? [
                ability(
                  'prepared-diversion',
                  'Prepared Diversion',
                  FREE,
                  'offensive',
                  [],
                  "<strong>Frequency</strong> once per hour</p><p><strong>Effect</strong> It Creates a Diversion or Feints. The diversion lacks the auditory, linguistic and manipulate traits, and onlookers it has diverted before don't get their +4 circumstance bonus against it. The Feint needs no melee reach, and its benefit applies to melee and ranged attacks against the target.",
                ),
              ]
            : []),
          ...(has.has('prepared-trap')
            ? [
                ability(
                  'prepared-trap',
                  'Prepared Trap',
                  ONE,
                  'offensive',
                  [],
                  `<strong>Frequency</strong> once per hour</p><p><strong>Effect</strong> It activates a hidden snare in an unoccupied space within 60 feet: any common snare of level ${Math.max(level - 2, 1)} or lower. It attempts a Deception check against the Perception DC of each creature watching; those it fails against learn where the snare is.`,
                ),
              ]
            : []),
          ...(has.has('tag-team')
            ? [
                ability(
                  'tag-team',
                  'Tag Team',
                  PASSIVE,
                  'offensive',
                  [],
                  'An enemy within its reach and the reach of an ally from its society is off-guard to its melee attacks, as if flanked. Against an enemy within the reach of two or more such allies, its Strikes deal 1d6 extra precision damage.',
                ),
              ]
            : []),
        ],
        byHand: [
          LIMITED_USE,
          ...skills.byHand,
          ...(has.has('skill-savvy') ? [`Skill Savvy: give it two of these skill feats: ${skillSavvyFeats(level)}.`] : []),
        ],
      };
    },
  },
  {
    id: 'broodpiercer',
    name: 'Broodpiercer',
    group: 'Parasite',
    source: 'Pathfinder Howl of the Wild pg. 129',
    choices: [],
    summary: 'For an animal, beast, humanoid or dragon host: level +1 and +1 to everything; Cold Stasis, Fumbling Dodge, Erratic Barrage, Induce Frenzy.',
    build: (facts) => {
      const level = facts.level + 1;
      return {
        rules: [...adjustments('broodpiercer', 'Broodpiercer', facts), smarter],
        abilities: [
          ability(
            'cold-stasis',
            'Cold Stasis',
            PASSIVE,
            'defensive',
            [],
            "Any effect that deals cold damage makes it slowed 1 for @Dice[1d4] rounds, even if it is immune to cold. While slowed this way it can't use Fumbling Dodge or Erratic Barrage.",
          ),
          ability(
            'fumbling-dodge',
            'Fumbling Dodge',
            REACTION,
            'defensive',
            [],
            '<strong>Trigger</strong> It is targeted with an attack, or by an effect that calls for a Reflex save, and is aware of the attacker.</p><p><strong>Effect</strong> It gains a +3 circumstance bonus to AC against the attack or to the Reflex save, then is clumsy 2 for 1 round.',
          ),
          ability(
            'erratic-barrage',
            'Erratic Barrage',
            TWO,
            'offensive',
            [],
            "It makes two melee Strikes against the same creature; its multiple attack penalty doesn't increase until both are made. The target is off-guard to the second Strike, then is immune to Erratic Barrage for 1 day.",
          ),
          ability(
            'induce-frenzy',
            'Induce Frenzy',
            ONE,
            'offensive',
            ['emotion'],
            `It becomes frenzied for 1 minute: a +2 circumstance bonus to Will saves, ${level} temporary Hit Points and a +10-foot circumstance bonus to its Speeds. Afterwards it is fatigued for 1 minute and can't frenzy again for 1 minute.`,
          ),
        ],
        byHand: [LIMITED_USE],
      };
    },
  },
];
