import { describe, expect, it } from 'vitest';
import { appliedTemplates, buildTemplate, describe as describeTemplate, MODULE_ID } from '../src/build.ts';
import { readFacts } from '../src/facts.ts';
import { byLevel, dcForLevel, findTemplate, LEVEL_FIELD, TEMPLATES, type CreatureFacts, type Rule } from '../src/templates.ts';

const facts = (over: Partial<CreatureFacts> = {}): CreatureFacts => ({
  level: 4,
  highestSpeed: 25,
  canFly: false,
  highestSkill: 12,
  slowedUuid: 'Compendium.pf2e.conditionitems.Item.slowed',
  hasLanguages: true,
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
  it('has the nine Book of the Dead undead adjustments, with unique ids', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'undead', 'ghost', 'ghoul', 'mummy', 'shadow', 'skeleton', 'vampire', 'wight', 'zombie',
      'air', 'earth', 'fire', 'metal', 'water', 'wood',
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
    expect(keyed(rules, 'Weakness').map((r) => r['type'])).toEqual(['fire', 'axes']);
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
      },
      'uuid',
    );
    expect(f).toEqual({ level: 6, highestSpeed: 40, canFly: false, highestSkill: 14, slowedUuid: 'uuid', hasLanguages: false });
    expect(readFacts({ system: { details: { languages: { value: ['common'] } } } }, null).hasLanguages).toBe(true);
    expect(readFacts({ system: { details: { languages: { value: [] } } } }, null).hasLanguages).toBe(false);
    expect(readFacts({ system: { movement: { speeds: { fly: { value: 30 } } } } }, null).canFly).toBe(true);
  });

  it('defaults when the creature has nothing to read', () => {
    expect(readFacts({}, null)).toEqual({ level: 0, highestSpeed: 0, canFly: false, highestSkill: 0, slowedUuid: null, hasLanguages: false });
  });
});
