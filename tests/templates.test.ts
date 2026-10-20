import { describe, expect, it } from 'vitest';
import { appliedTemplates, buildTemplate, describe as describeTemplate, MODULE_ID } from '../src/build.ts';
import { readFacts } from '../src/facts.ts';
import { casterSpellDc, extremeSkill } from '../src/mythic.ts';
import { byLevel, dcForLevel, findTemplate, LEVEL_FIELD, TEMPLATES, verdantBurstDice, type CreatureFacts, type Rule } from '../src/templates.ts';

const facts = (over: Partial<CreatureFacts> = {}): CreatureFacts => ({
  level: 4,
  highestSpeed: 25,
  canFly: false,
  highestSkill: 12,
  slowedUuid: 'Compendium.pf2e.conditionitems.Item.slowed',
  hasLanguages: true,
  saves: { fortitude: 10, reflex: 12, will: 8 },
  skills: { stealth: 9, athletics: 15, acrobatics: 5, arcana: 6, religion: 11 },
  ...over,
});

const rulesOf = (id: string, f: CreatureFacts = facts(), choices = {}) => findTemplate(id)!.build(f, choices).rules;
const keyed = (rules: readonly Rule[], key: string) => rules.filter((r) => r.key === key);
const immune = (rules: readonly Rule[]) => keyed(rules, 'Immunity').map((r) => r['type']);
const addedTraits = (rules: readonly Rule[]) => keyed(rules, 'ActorTraits').flatMap((r) => r['add'] as string[]);
const hasNecril = (rules: readonly Rule[]) => rules.some((r) => r['path'] === 'system.details.languages.value' && r['value'] === 'necril');

/** Resolves a level-bracketed value the way PF2e does. */
function resolve(value: unknown, level: number): number {
  const v = value as { field: string; brackets: { start?: number; end?: number; value: number }[] };
  expect(v.field).toBe(LEVEL_FIELD);
  const hit = v.brackets.find((b) => (b.start ?? -Infinity) <= level && level <= (b.end ?? Infinity));
  if (!hit) throw new Error(`no bracket for level ${level}`);
  return hit.value;
}

describe('templates', () => {
  it('has every template, with unique ids', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'undead', 'ghost', 'ghoul', 'mummy', 'shadow', 'skeleton', 'vampire', 'wight', 'zombie',
      'air', 'earth', 'fire', 'metal', 'water', 'wood',
      'athamaru', 'catfolk', 'dwarf', 'elf', 'gnome', 'goblin', 'halfling', 'hobgoblin', 'kholo',
      'kobold', 'leshy', 'lizardfolk', 'merfolk', 'orc', 'ratfolk', 'tengu', 'tripkee',
      'mythic-ambusher', 'mythic-brute', 'mythic-caster', 'mythic-striker',
    ]);
    expect(findTemplate('nope')).toBeUndefined();
  });

  it('every bracket table covers every level from -1 to 25 with no gaps or overlaps', () => {
    for (const t of TEMPLATES) {
      for (const r of t.build(facts(), { mindless: true }).rules) {
        if (typeof r['value'] !== 'object' || r['value'] === null) continue;
        const { brackets } = r['value'] as { brackets: { start?: number; end?: number }[] };
        for (let level = -1; level <= 25; level++) {
          const hits = brackets.filter((b) => (b.start ?? -Infinity) <= level && level <= (b.end ?? Infinity));
          expect(hits, `${t.id} ${r.key} level ${level}`).toHaveLength(1);
        }
      }
    }
  });

  it('every undead template adds the undead trait, void healing and the undead immunities', () => {
    for (const t of TEMPLATES.filter((x) => x.group === 'Undead')) {
      const rules = t.build(facts(), {}).rules;
      expect(addedTraits(rules), t.id).toContain('undead');
      expect(rules.some((r) => r['path'] === 'system.attributes.hp.negativeHealing' && r['value'] === true), t.id).toBe(true);
      expect(immune(rules), t.id).toEqual(expect.arrayContaining(['death-effects', 'disease', 'paralyzed', 'poison']));
    }
  });

  it('plain Undead: mindless adds the trait and mental immunity, and drops Necril', () => {
    expect(addedTraits(rulesOf('undead'))).toEqual(['undead']);
    expect(hasNecril(rulesOf('undead'))).toBe(true);
    expect(immune(rulesOf('undead'))).not.toContain('mental');
    const mindless = rulesOf('undead', facts(), { mindless: true });
    expect(addedTraits(mindless)).toEqual(['undead', 'mindless']);
    expect(immune(mindless)).toContain('mental');
    expect(hasNecril(mindless)).toBe(false);
    expect(keyed(rulesOf('undead'), 'Sense')).toHaveLength(0);
  });

  it('Skeleton: HP down and five resistances by level, mindless optional', () => {
    const rules = rulesOf('skeleton');
    const hp = keyed(rules, 'FlatModifier').find((r) => r['selector'] === 'hp')!;
    expect([-1, 0, 1, 2, 5, 6, 10, 11, 20].map((l) => resolve(hp['value'], l))).toEqual([-2, -4, -4, -10, -10, -20, -20, -40, -40]);
    const res = keyed(rules, 'Resistance');
    expect(res.map((r) => r['type'])).toEqual(['cold', 'electricity', 'fire', 'piercing', 'slashing']);
    expect([-1, 1, 3, 8, 15].map((l) => resolve(res[0]!['value'], l))).toEqual([2, 2, 3, 5, 10]);
    expect(addedTraits(rulesOf('skeleton', facts(), { mindless: true }))).toContain('mindless');
    expect(hasNecril(rulesOf('skeleton', facts(), { mindless: true }))).toBe(false);
  });

  it('Zombie: mindless, HP up, weak to vitality and slashing, slowed through the condition', () => {
    const rules = rulesOf('zombie');
    expect(addedTraits(rules)).toEqual(['mindless', 'undead', 'zombie']);
    expect(immune(rules)).toContain('mental');
    const hp = keyed(rules, 'FlatModifier').find((r) => r['selector'] === 'hp')!;
    expect([1, 2, 6, 11, 16, 20].map((l) => resolve(hp['value'], l))).toEqual([10, 20, 50, 75, 100, 150]);
    const weak = keyed(rules, 'Weakness');
    expect(weak.map((r) => r['type'])).toEqual(['vitality', 'slashing']);
    expect([0, 3, 7, 12, 17, 22].map((l) => resolve(weak[0]!['value'], l))).toEqual([5, 5, 10, 15, 20, 25]);
    expect(keyed(rules, 'GrantItem')).toEqual([{ key: 'GrantItem', uuid: 'Compendium.pf2e.conditionitems.Item.slowed', inMemoryOnly: true }]);
    expect(findTemplate('zombie')!.build(facts(), {}).byHand).toEqual([]);
    const noSlowed = findTemplate('zombie')!.build(facts({ slowedUuid: null }), {});
    expect(keyed(noSlowed.rules, 'GrantItem')).toHaveLength(0);
    expect(noSlowed.byHand).toEqual(['Give it the slowed 1 condition.']);
  });

  it('Ghost and Shadow: weaknesses 3/5/10/15, precision immunity, and a fly Speed if they lack one', () => {
    for (const id of ['ghost', 'shadow']) {
      const rules = rulesOf(id);
      const weak = keyed(rules, 'Weakness');
      expect(weak.map((r) => r['type'])).toEqual(['force', 'ghost-touch', 'vitality']);
      expect([3, 4, 8, 9, 13, 14].map((l) => resolve(weak[0]!['value'], l))).toEqual([3, 5, 5, 10, 10, 15]);
      expect(immune(rules)).toContain('precision');
      expect(keyed(rules, 'BaseSpeed')).toEqual([{ key: 'BaseSpeed', selector: 'fly', value: 25 }]);
      const flier = findTemplate(id)!.build(facts({ canFly: true }), {});
      expect(keyed(flier.rules, 'BaseSpeed')).toHaveLength(0);
      expect(flier.byHand.some((s) => s.includes('other Speeds'))).toBe(false);
    }
    expect(addedTraits(rulesOf('ghost'))).toEqual(['ghost', 'spirit', 'undead']);
    expect(findTemplate('shadow')!.build(facts(), {}).byHand).toContain('Set its Stealth modifier to +12 (its highest skill modifier).');
  });

  it('Ghoul: saves 1 lower, no Necril', () => {
    const rules = rulesOf('ghoul');
    expect(keyed(rules, 'FlatModifier')).toEqual([{ key: 'FlatModifier', selector: 'saving-throw', label: 'Ghoul', value: -1 }]);
    expect(hasNecril(rules)).toBe(false);
  });

  it('Mummy: fire weakness and the despair aura', () => {
    const t = findTemplate('mummy')!.build(facts(), {});
    expect(keyed(t.rules, 'Weakness').map((r) => r['type'])).toEqual(['fire']);
    expect(t.abilities[0]!.rules![0]).toMatchObject({ key: 'Aura', radius: 30 });
  });

  it('Vampire: sleep immunity, physical resistance bypassed by the chosen material, default silver', () => {
    const rules = rulesOf('vampire', facts(), { bypass: 'cold-iron' });
    expect(immune(rules)).toContain('sleep');
    expect(immune(rules)).not.toContain('unconscious');
    expect(keyed(rules, 'Resistance')[0]).toMatchObject({ type: 'physical', exceptions: ['cold-iron'] });
    expect(keyed(rulesOf('vampire'), 'Resistance')[0]).toMatchObject({ exceptions: ['silver'] });
    const hp = keyed(rules, 'FlatModifier').find((r) => r['selector'] === 'hp')!;
    expect([-1, 0, 3, 7, 12].map((l) => resolve(hp['value'], l))).toEqual([-3, -5, -10, -20, -40]);
    expect(findTemplate('vampire')!.build(facts(), {}).abilities[0]!.description).toContain('2, 2, 3, 5, 10');
  });

  it('Wight: drain life DC and damage cut follow the level', () => {
    const t = findTemplate('wight')!.build(facts({ level: 7 }), {});
    expect(t.abilities[0]!.description).toContain('@Check[fortitude|dc:23]');
    expect(t.byHand[0]).toContain('by 3 (half its level)');
    expect(findTemplate('wight')!.build(facts({ level: -1 }), {}).byHand[0]).toContain('by 0 (half');
  });

  it('dcForLevel follows the table and clamps', () => {
    expect([dcForLevel(-5), dcForLevel(-1), dcForLevel(0), dcForLevel(4), dcForLevel(20), dcForLevel(25), dcForLevel(40)]).toEqual([13, 13, 14, 19, 40, 50, 50]);
  });

  it('byLevel tags the level field', () => {
    expect(byLevel([{ value: 1 }])).toEqual({ field: LEVEL_FIELD, brackets: [{ value: 1 }] });
  });
});

describe('elemental templates', () => {
  const langs = (rules: readonly Rule[]) => rules.filter((r) => r['path'] === 'system.details.languages.value').map((r) => r['value']);
  const speeds = (rules: readonly Rule[]) => keyed(rules, 'BaseSpeed').map((r) => [r['selector'], r['value']]);

  it('each adds its trait and its language only if the creature speaks one', () => {
    const want: Record<string, string> = { air: 'sussuran', earth: 'petran', fire: 'pyric', metal: 'talican', water: 'thalassic', wood: 'muan' };
    for (const [id, lang] of Object.entries(want)) {
      const t = findTemplate(id)!;
      expect(t.group).toBe('Elemental');
      expect(t.source).toMatch(/^Pathfinder Rage of Elements pg\. \d+$/);
      expect(addedTraits(rulesOf(id))[0], id).toBe(id);
      expect(langs(rulesOf(id)), id).toEqual([lang]);
      expect(langs(rulesOf(id, facts({ hasLanguages: false }))), id).toEqual([]);
      expect(t.build(facts(), {}).byHand.at(-1), id).toContain(`${id} spells of the same rank`);
    }
  });

  it('Air flies at 8th level; below that the GM decides', () => {
    expect(speeds(rulesOf('air', facts({ level: 8 })))).toEqual([['fly', 25]]);
    expect(speeds(rulesOf('air', facts({ level: 7 })))).toEqual([]);
    expect(findTemplate('air')!.build(facts({ level: 7 }), {}).byHand[0]).toContain('no ranged attacks');
    expect(findTemplate('air')!.build(facts({ level: 8 }), {}).byHand).toHaveLength(1);
  });

  it('Earth: tremorsense 60 imprecise, burrow 20 or 40', () => {
    expect(keyed(rulesOf('earth'), 'Sense')).toEqual([{ key: 'Sense', selector: 'tremorsense', acuity: 'imprecise', range: 60 }]);
    expect(speeds(rulesOf('earth', facts({ level: 7 })))).toEqual([['burrow', 20]]);
    expect(speeds(rulesOf('earth', facts({ level: 8 })))).toEqual([['burrow', 40]]);
  });

  it('Fire: fire immunity, Strikes by hand', () => {
    expect(immune(rulesOf('fire'))).toEqual(['fire']);
    expect(findTemplate('fire')!.build(facts(), {}).byHand[0]).toContain('fire damage');
  });

  it('Metal and Water: HP down 6/10/20/30 and a resistance 3/5/10/15', () => {
    for (const [id, type] of [['metal', 'electricity'], ['water', 'fire']] as const) {
      const rules = rulesOf(id);
      const hp = keyed(rules, 'FlatModifier').find((r) => r['selector'] === 'hp')!;
      expect([3, 4, 9, 14].map((l) => resolve(hp['value'], l)), id).toEqual([-6, -10, -20, -30]);
      const res = keyed(rules, 'Resistance');
      expect(res.map((r) => r['type'])).toEqual([type]);
      expect([3, 8, 13, 20].map((l) => resolve(res[0]!['value'], l)), id).toEqual([3, 5, 10, 15]);
    }
  });

  it('Water: amphibious by default or aquatic, swim 25 or 40', () => {
    expect(addedTraits(rulesOf('water'))).toEqual(['water', 'amphibious']);
    expect(addedTraits(rulesOf('water', facts(), { aquatic: true }))).toEqual(['water', 'aquatic']);
    expect(speeds(rulesOf('water', facts({ level: 7 })))).toEqual([['swim', 25]]);
    expect(speeds(rulesOf('water', facts({ level: 8 })))).toEqual([['swim', 40]]);
  });

  it('Wood: HP up 10/20/40/60, weak to fire and axes, plant optional', () => {
    const rules = rulesOf('wood');
    const hp = keyed(rules, 'FlatModifier').find((r) => r['selector'] === 'hp')!;
    expect([0, 5, 10, 15].map((l) => resolve(hp['value'], l))).toEqual([10, 20, 40, 60]);
    expect(keyed(rules, 'Weakness').map((r) => r['type'])).toEqual(['fire', 'axe-vulnerability']);
    expect(addedTraits(rules)).toEqual(['wood']);
    expect(addedTraits(rulesOf('wood', facts(), { plant: true }))).toEqual(['wood', 'plant']);
  });

  it('every HP modifier has its own slug, so two templates stack', () => {
    const slugs = TEMPLATES.flatMap((t) => keyed(t.build(facts(), {}).rules, 'FlatModifier')).filter((r) => r['selector'] === 'hp').map((r) => r['slug']);
    expect(slugs).toHaveLength(6);
    expect(new Set(slugs).size).toBe(6);
    expect(keyed(rulesOf('wood'), 'FlatModifier')[0]).toMatchObject({ slug: 'wood-template-hp', label: 'Wood template' });
  });
});

describe('ancestry templates', () => {
  const ANCESTRIES = TEMPLATES.filter((t) => t.group === 'Ancestry');
  const langs = (rules: readonly Rule[]) => rules.filter((r) => r['path'] === 'system.details.languages.value').map((r) => r['value']);
  const removed = (rules: readonly Rule[]) => keyed(rules, 'ActorTraits').flatMap((r) => r['remove'] as string[]);
  const senses = (rules: readonly Rule[]) => keyed(rules, 'Sense').map((r) => r['selector']);
  const small = (id: string) => keyed(rulesOf(id), 'CreatureSize').map((r) => r['value']);

  it('each swaps human for its own trait, from NPC Core', () => {
    expect(ANCESTRIES).toHaveLength(17);
    for (const t of ANCESTRIES) {
      expect(t.source, t.id).toMatch(/^Pathfinder NPC Core pg\. (151|168|169)$/);
      expect(addedTraits(rulesOf(t.id))[0], t.id).toBe(t.id);
      expect(removed(rulesOf(t.id)), t.id).toContain('human');
      expect(t.choices).toEqual([]);
    }
  });

  it('languages, including always for a creature with none', () => {
    expect(langs(rulesOf('gnome'))).toEqual(['fey', 'gnomish']);
    expect(langs(rulesOf('kobold', facts({ hasLanguages: false })))).toEqual(['sakvroth']);
    expect(langs(rulesOf('lizardfolk'))).toEqual(['iruxi']);
    expect(langs(rulesOf('ratfolk'))).toEqual(['ysoki']);
  });

  it('size, vision and Speeds', () => {
    expect(small('goblin')).toEqual(['sm']);
    expect(small('hobgoblin')).toEqual([]);
    expect(senses(rulesOf('dwarf'))).toEqual(['darkvision']);
    expect(senses(rulesOf('elf'))).toEqual(['low-light-vision']);
    expect(senses(rulesOf('halfling'))).toEqual([]);
    expect(senses(rulesOf('lizardfolk'))).toEqual([]);
    expect(keyed(rulesOf('dwarf'), 'ActiveEffectLike').find((r) => r['path'] === 'system.movement.speeds.land.base'))
      .toMatchObject({ mode: 'downgrade', value: 20 });
    const merfolk = rulesOf('merfolk');
    expect(keyed(merfolk, 'ActiveEffectLike').find((r) => r['path'] === 'system.movement.speeds.land.base')).toMatchObject({ mode: 'override', value: 5 });
    expect(keyed(merfolk, 'BaseSpeed')).toEqual([{ key: 'BaseSpeed', selector: 'swim', value: 25 }]);
    expect(addedTraits(merfolk)).toEqual(['merfolk', 'amphibious']);
  });

  it('Leshy: plant instead of humanoid, and Verdant Burst by level', () => {
    expect(addedTraits(rulesOf('leshy'))).toEqual(['leshy', 'plant']);
    expect(removed(rulesOf('leshy'))).toEqual(['human', 'humanoid']);
    expect([-1, 0, 1, 3, 4, 13, 20, 24].map(verdantBurstDice)).toEqual(['1d4', '1d4', '1d8', '2d8', '3d8', '7d8', '11d8', '11d8']);
    const [burst] = findTemplate('leshy')!.build(facts({ level: 6 }), {}).abilities;
    expect(burst).toMatchObject({ slug: 'verdant-burst', traits: ['healing', 'primal'] });
    expect(burst!.description).toContain('4d8 Hit Points');
  });

  it('abilities and the parts left to the GM', () => {
    expect(findTemplate('halfling')!.build(facts(), {}).abilities.map((a) => a.slug)).toEqual(['keen-eyes']);
    expect(findTemplate('lizardfolk')!.build(facts(), {}).abilities.map((a) => a.slug)).toEqual(['deep-breath']);
    expect(findTemplate('orc')!.build(facts(), {})).toMatchObject({ abilities: [], byHand: [] });
    expect(findTemplate('ratfolk')!.build(facts(), {}).byHand[0]).toBe(
      'Add a jaws Strike that deals damage equal to its lowest melee Strike, with the agile and finesse traits.',
    );
    expect(findTemplate('kholo')!.build(facts(), {}).byHand[0]).toBe('Add a jaws Strike that deals damage equal to its lowest melee Strike.');
  });
});

describe('mythic templates', () => {
  const abilities = (id: string, f: CreatureFacts = facts()) => findTemplate(id)!.build(f, {}).abilities;
  const slugs = (id: string, f?: CreatureFacts) => abilities(id, f).map((a) => a.slug);
  const resilient = (id: string, f?: CreatureFacts) =>
    (abilities(id, f).find((a) => a.slug === 'mythic-resilience')?.rules ?? []).map((r) => r['selector']);
  const resistance = (id: string, f?: CreatureFacts) => abilities(id, f).find((a) => a.slug === 'mythic-resistance')?.description;
  const skillRaise = (id: string, f: CreatureFacts = facts()) => keyed(rulesOf(id, f), 'FlatModifier')[0];

  it('GM Core tables: extreme skill and the caster spell DC, clamped to -1 to 24', () => {
    expect([-3, -1, 0, 4, 10, 24, 30].map(extremeSkill)).toEqual([8, 8, 9, 15, 25, 48, 48]);
    expect([-1, 4, 10, 11, 24].map(casterSpellDc)).toEqual([16, 21, 29, 34, 52]);
  });

  it('every one is mythic, from War of Immortals, and raises its skill to extreme', () => {
    for (const t of TEMPLATES.filter((x) => x.group === 'Mythic')) {
      expect(addedTraits(rulesOf(t.id)), t.id).toEqual(['mythic']);
      expect(t.source).toMatch(/^Pathfinder War of Immortals pg\. 16[89]$/);
    }
    expect(skillRaise('mythic-ambusher')).toMatchObject({ selector: 'stealth', value: 6, slug: 'mythic-ambusher-template-skill' });
    expect(skillRaise('mythic-striker')).toMatchObject({ selector: 'acrobatics', value: 10 });
    expect(skillRaise('mythic-caster')).toMatchObject({ selector: 'religion', value: 4 });
    // Already extreme: nothing to add.
    expect(skillRaise('mythic-brute', facts({ skills: { athletics: 15 } }))).toBeUndefined();
    expect(skillRaise('mythic-brute', facts({ skills: {} }))).toMatchObject({ selector: 'athletics', value: 15 });
  });

  it('resilience goes to the highest allowed saves at 1st, 7th and 13th', () => {
    expect(resilient('mythic-striker', facts({ level: 0 }))).toEqual([]);
    expect(resilient('mythic-striker')).toEqual(['reflex']);
    expect(resilient('mythic-striker', facts({ level: 7 }))).toEqual(['reflex', 'will']);
    expect(resistance('mythic-striker', facts({ level: 7 }))).toBeUndefined();
    expect(resistance('mythic-striker', facts({ level: 13 }))).toContain('resistance 6 ');
    expect(abilities('mythic-striker').find((a) => a.slug === 'mythic-resilience')!.rules).toEqual([
      { key: 'AdjustDegreeOfSuccess', selector: 'reflex', adjustment: { all: 'one-degree-better' } },
    ]);
    expect(abilities('mythic-striker', facts({ level: 7 })).find((a) => a.slug === 'mythic-resilience')!.name).toBe('Mythic Resilience (Reflex and Will)');
  });

  it('Ambusher: Reflex at any level, the others later, never resistance', () => {
    expect(resilient('mythic-ambusher', facts({ level: -1 }))).toEqual(['reflex']);
    expect(resilient('mythic-ambusher', facts({ level: 7 }))).toEqual(['reflex', 'fortitude']);
    expect(resilient('mythic-ambusher', facts({ level: 13 }))).toEqual(['reflex', 'fortitude', 'will']);
    expect(resistance('mythic-ambusher', facts({ level: 20 }))).toBeUndefined();
  });

  it('Brute: resistance equal to its level, then Fortitude and Reflex, never Will', () => {
    expect(resistance('mythic-brute')).toContain('resistance 4 ');
    expect(resistance('mythic-brute', facts({ level: 0 }))).toBeUndefined();
    expect(resilient('mythic-brute')).toEqual([]);
    expect(resilient('mythic-brute', facts({ level: 13 }))).toEqual(['reflex', 'fortitude']);
    expect(slugs('mythic-brute')).toContain('mythic-ferocity');
  });

  it('Caster: no Fortitude, no resistance, Recharge at any level, spell DC by hand', () => {
    expect(resilient('mythic-caster', facts({ level: 13 }))).toEqual(['reflex', 'will']);
    expect(resistance('mythic-caster', facts({ level: 13 }))).toBeUndefined();
    expect(slugs('mythic-caster', facts({ level: 1 }))).toEqual(['mythic-knowledge', 'mythic-weakness-extreme-frailty', 'mythic-resilience', 'mythic-power', 'recharge']);
    expect(findTemplate('mythic-caster')!.build(facts({ level: 11 }), {}).byHand[0]).toBe('Devastating Magic: set its spell DC to 34 and its spell attack modifier to +26.');
  });

  it('mythic power actions arrive by level', () => {
    expect(slugs('mythic-striker', facts({ level: 3 }))).not.toContain('mythic-power');
    const at4 = abilities('mythic-striker');
    expect(at4.map((a) => a.slug)).toEqual(['deadly-striker', 'mythic-mobility', 'unimpeded', 'mythic-weakness-infirmity', 'mythic-resilience', 'mythic-power', 'mythic-skill']);
    expect(at4.find((a) => a.slug === 'mythic-skill')!.rules![1]).toMatchObject({ selector: 'acrobatics', value: 4, predicate: ['mythic-skill'] });
    expect(slugs('mythic-striker', facts({ level: 10 }))).toContain('recharge');
    expect(slugs('mythic-striker', facts({ level: 17 }))).toContain('undying-myth');
    expect(slugs('mythic-striker', facts({ level: 19 }))).not.toContain('reroll');
    expect(slugs('mythic-striker', facts({ level: 20 }))).toContain('reroll');
    expect(slugs('mythic-striker', facts({ level: 22 }))).not.toContain('mythic-immunity');
    expect(abilities('mythic-brute', facts({ level: 23 })).find((a) => a.slug === 'mythic-immunity')!.description).toContain('immune to Strikes');
    expect(abilities('mythic-caster', facts({ level: 23 })).find((a) => a.slug === 'mythic-immunity')!.description).toContain('harmful spells');
    expect(findTemplate('mythic-brute')!.build(facts({ level: 3 }), {}).byHand).toEqual([]);
    expect(findTemplate('mythic-brute')!.build(facts({ level: 20 }), {}).byHand).toHaveLength(3);
  });
});

describe('build', () => {
  it('makes one effect with the rules and one action per ability, all flagged', () => {
    const built = buildTemplate(findTemplate('ghoul')!, facts(), {});
    expect(built.items.map((i) => [i.type, i.name])).toEqual([
      ['effect', 'Template: Ghoul'],
      ['action', 'Paralysis'],
      ['action', 'Swift Leap'],
    ]);
    for (const item of built.items) expect(item['flags']).toEqual({ [MODULE_ID]: { template: 'ghoul' } });
    const effect = built.items[0]!['system'] as { rules: Rule[]; duration: { unit: string }; level: { value: number } };
    expect(effect.rules).toEqual(findTemplate('ghoul')!.build(facts(), {}).rules);
    expect(effect.duration.unit).toBe('unlimited');
    expect(effect.level.value).toBe(4);
    const leap = built.items[2]!['system'] as { actions: { value: number | null }; actionType: { value: string }; rules: Rule[] };
    expect(leap).toMatchObject({ actions: { value: 1 }, actionType: { value: 'action' }, rules: [] });
    const paralysis = built.items[1]!['system'] as { actions: { value: number | null } };
    expect(paralysis.actions.value).toBeNull();
    expect(built.byHand).toHaveLength(1);
  });

  it('copies ability rules and marks a mindless effect', () => {
    const mummy = buildTemplate(findTemplate('mummy')!, facts(), {});
    expect((mummy.items[1]!['system'] as { rules: Rule[] }).rules[0]).toMatchObject({ key: 'Aura' });
    expect(buildTemplate(findTemplate('skeleton')!, facts(), { mindless: true }).items[0]!.name).toBe('Template: Skeleton (mindless)');
  });

  it('describes the source and the by-hand list, escaped', () => {
    const t = findTemplate('undead')!;
    expect(describeTemplate(t, [])).not.toContain('by hand');
    const html = describeTemplate(t, ['a <b> & c']);
    expect(html).toContain('Source: Pathfinder Book of the Dead pg. 72');
    expect(html).toContain('<li>a &lt;b&gt; &amp; c</li>');
  });

  it('reads applied templates from item flags', () => {
    expect(
      appliedTemplates([
        { flags: { [MODULE_ID]: { template: 'zombie' } } },
        { flags: { [MODULE_ID]: { template: 'zombie' } } },
        { flags: { other: {} } },
        {},
        { flags: { [MODULE_ID]: { template: 3 } } },
      ]),
    ).toEqual(['zombie']);
  });
});

describe('readFacts', () => {
  it('reads level, the highest Speed, flight and the highest skill', () => {
    const f = readFacts(
      {
        level: 6,
        system: { movement: { speeds: { land: { value: 25 }, swim: { value: 40 }, fly: null, burrow: { value: 0 }, climb: { value: 'x' } } } },
        skills: { stealth: { mod: 9 }, athletics: { mod: 14 }, broken: undefined, odd: { mod: Number.NaN } },
        saves: { fortitude: { mod: 12 }, reflex: {}, will: { mod: 7 } },
      },
      'uuid',
    );
    expect(f).toEqual({
      level: 6, highestSpeed: 40, canFly: false, highestSkill: 14, slowedUuid: 'uuid', hasLanguages: false,
      saves: { fortitude: 12, reflex: 0, will: 7 },
      skills: { stealth: 9, athletics: 14 },
    });
    expect(readFacts({ system: { details: { languages: { value: ['common'] } } } }, null).hasLanguages).toBe(true);
    expect(readFacts({ system: { details: { languages: { value: [] } } } }, null).hasLanguages).toBe(false);
    expect(readFacts({ system: { movement: { speeds: { fly: { value: 30 } } } } }, null).canFly).toBe(true);
  });

  it('defaults when the creature has nothing to read', () => {
    expect(readFacts({}, null)).toEqual({
      level: 0, highestSpeed: 0, canFly: false, highestSkill: 0, slowedUuid: null, hasLanguages: false,
      saves: { fortitude: 0, reflex: 0, will: 0 },
      skills: {},
    });
  });
});
