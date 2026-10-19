/**
 * Applies every template to a real NPC in a running PF2e or SF2e world and reads back what the system
 * made of it: traits, immunities, weaknesses, resistances, Hit Points, senses, Speeds and void healing.
 * Then removes each one and checks the NPC is back as it was. Rule elements that fail validation only
 * log a warning, so the console is watched too.
 *
 * Needs a Foundry v14 world at FOUNDRY_URL with this module installed and active. Creates an NPC:
 * never point it at a real game.
 */
import { chromium, type Page } from 'playwright';

const URL = process.env['FOUNDRY_URL'] ?? 'http://localhost:30077';
const PASSWORD = process.env['FOUNDRY_PASSWORD'] ?? '';
const GM = process.env['FOUNDRY_GM'] ?? 'Gamemaster';
const SLOW = { timeout: 600_000, polling: 1000 };

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const ruleWarnings: string[] = [];

async function join(): Promise<Page> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('core.noCanvas', 'true');
    } catch {
      /* ignore */
    }
  });
  ctx.setDefaultTimeout(600_000);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${text.slice(0, 300)}`);
    if (/rule ?element|RuleElement|PF2e System \|/i.test(text)) ruleWarnings.push(text.slice(0, 300));
  });
  page.on('pageerror', (e) => console.log(`[page error] ${String(e).slice(0, 300)}`));
  // A query string: the COO server sends a bare /join to its own portal; Foundry ignores the query.
  await page.goto(`${URL}/join?live-check`, { waitUntil: 'domcontentloaded', timeout: 600_000 });
  await page.waitForSelector('select[name=userId], input[name=username]', { timeout: 300_000 });
  const picker = page.locator('select[name=userId]');
  if (await picker.count()) await picker.selectOption({ label: GM });
  else await page.fill('input[name=username]', GM);
  if (PASSWORD) await page.fill('input[name=password]', PASSWORD);
  await page.click('button[name=join]', { noWaitAfter: true });
  await page.waitForFunction(() => (globalThis as any).game?.ready === true, null, SLOW);
  // A fresh world has the module installed but off: switch it on and reload once.
  const enabled = await page.evaluate(async () => {
    const g = globalThis as any;
    if (g.game.modules.get('creature-template-applier')?.active) return true;
    const config = g.game.settings.get('core', 'moduleConfiguration');
    await g.game.settings.set('core', 'moduleConfiguration', { ...config, 'creature-template-applier': true });
    return false;
  });
  if (!enabled) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (globalThis as any).game?.ready === true, null, SLOW);
  }
  return page;
}

interface Snapshot {
  traits: string[];
  immunities: string[];
  weaknesses: Record<string, number>;
  resistances: Record<string, { value: number; exceptions: string[] }>;
  hpMax: number;
  saves: number[];
  voidHealing: boolean;
  senses: string[];
  speeds: Record<string, number>;
  languages: string[];
  items: string[];
  slowed: boolean;
  size: string;
  /** Traits and languages the system does not know, which would mean a wrong slug. */
  unknown: string[];
}

const snapshot = (page: Page, id: string): Promise<Snapshot> =>
  page.evaluate((actorId) => {
    const g = globalThis as any;
    const a = g.game.actors.get(actorId);
    const attr = a.system.attributes;
    const speeds: Record<string, number> = {};
    for (const [k, v] of Object.entries(a.system.movement?.speeds ?? {}) as [string, any][]) if (v?.value) speeds[k] = v.value;
    return {
      traits: [...a.system.traits.value].sort(),
      immunities: attr.immunities.map((i: any) => i.type).sort(),
      weaknesses: Object.fromEntries(attr.weaknesses.map((w: any) => [w.type, w.value])),
      resistances: Object.fromEntries(attr.resistances.map((r: any) => [r.type, { value: r.value, exceptions: [...(r.exceptions ?? [])].map(String) }])),
      hpMax: attr.hp.max,
      saves: ['fortitude', 'reflex', 'will'].map((s) => a.saves[s].mod),
      voidHealing: !!a.hitPoints?.negativeHealing,
      senses: (a.perception?.senses ?? a.system.perception?.senses ?? []).map((s: any) => s.type),
      speeds,
      languages: [...(a.system.details.languages?.value ?? [])],
      items: a.items.map((i: any) => i.name).sort(),
      slowed: !!a.hasCondition?.('slowed'),
      size: a.size,
      unknown: [
        ...[...a.system.traits.value].filter((t: string) => !(t in g.CONFIG.PF2E.creatureTraits)),
        ...[...(a.system.details.languages?.value ?? [])].filter((l: string) => !(l in g.CONFIG.PF2E.languages)),
      ],
    };
  }, id);

const page = await join();
const system = await page.evaluate(() => (globalThis as any).game.system.id);
const active = await page.evaluate(() => !!(globalThis as any).game.modules.get('creature-template-applier')?.active);
check('system is pf2e or sf2e and the module is active', ['pf2e', 'sf2e'].includes(system) && active, system);

const actorId: string = await page.evaluate(async () => {
  const g = globalThis as any;
  const old = g.game.actors.getName('Template Dummy');
  if (old) await old.delete();
  const a = await g.Actor.create({ name: 'Template Dummy', type: 'npc' });
  await a.update({
    'system.details.level.value': 4,
    'system.attributes.hp.max': 60,
    'system.attributes.hp.value': 60,
    'system.movement.speeds.land.value': 25,
    'system.details.languages.value': ['common'],
    'system.traits.value': ['human', 'humanoid'],
  });
  return a.id;
});
const base = await snapshot(page, actorId);
check('the dummy is level 4 with 60 HP and a 25-foot Speed', base.hpMax === 60 && base.speeds['land'] === 25, JSON.stringify({ hp: base.hpMax, speeds: base.speeds }));

const button = await page.evaluate(async (id) => {
  const g = globalThis as any;
  const sheet = g.game.actors.get(id).sheet;
  await sheet.render(true);
  for (let i = 0; i < 50 && !sheet.element?.[0]; i++) await new Promise((r) => setTimeout(r, 100));
  const found = !!sheet.element?.[0]?.querySelector('.creature-templates');
  await sheet.close();
  return found;
}, actorId);
check('the NPC sheet has a Templates button', button);

const apply = (id: string, choices: Record<string, unknown> = {}) =>
  page.evaluate(
    async ([actor, t, c]) => {
      const g = globalThis as any;
      return g.game.modules.get('creature-template-applier').api.apply(g.game.actors.get(actor), t, c);
    },
    [actorId, id, choices] as const,
  );
const remove = (id: string) =>
  page.evaluate(
    async ([actor, t]) => {
      const g = globalThis as any;
      return g.game.modules.get('creature-template-applier').api.remove(g.game.actors.get(actor), t);
    },
    [actorId, id] as const,
  );

const has = (list: string[], ...want: string[]) => want.every((w) => list.includes(w));
const UNDEAD_IMMUNE = ['death-effects', 'disease', 'paralyzed', 'poison', 'unconscious'];

type Expect = (s: Snapshot) => [string, boolean, string?][];
const CASES: [string, Record<string, unknown>, Expect][] = [
  ['undead', { mindless: true }, (s) => [
    ['traits undead + mindless', has(s.traits, 'undead', 'mindless')],
    ['immune incl. mental', has(s.immunities, ...UNDEAD_IMMUNE, 'mental'), s.immunities.join()],
    ['void healing', s.voidHealing],
    ['no Necril when mindless', !s.languages.includes('necril')],
  ]],
  ['ghost', {}, (s) => [
    ['traits ghost, spirit, undead', has(s.traits, 'ghost', 'spirit', 'undead')],
    ['precision immunity', has(s.immunities, 'precision')],
    ['weak 5 to force, ghost touch, vitality', s.weaknesses['force'] === 5 && s.weaknesses['ghost-touch'] === 5 && s.weaknesses['vitality'] === 5, JSON.stringify(s.weaknesses)],
    ['fly Speed 25', s.speeds['fly'] === 25, JSON.stringify(s.speeds)],
    ['darkvision', s.senses.includes('darkvision'), s.senses.join()],
    ['Necril', s.languages.includes('necril'), s.languages.join()],
    ['Ghostly Passage added', s.items.includes('Ghostly Passage')],
  ]],
  ['ghoul', {}, (s) => [
    ['saves 1 lower', s.saves.every((v, i) => v === base.saves[i]! - 1), `${base.saves} -> ${s.saves}`],
    ['two abilities', has(s.items, 'Paralysis', 'Swift Leap')],
  ]],
  ['mummy', {}, (s) => [['weak 5 to fire', s.weaknesses['fire'] === 5, JSON.stringify(s.weaknesses)], ['Lesser Despair', s.items.includes('Lesser Despair')]]],
  ['shadow', {}, (s) => [['weak 5 to vitality', s.weaknesses['vitality'] === 5], ['fly Speed 25', s.speeds['fly'] === 25]]],
  ['skeleton', {}, (s) => [
    ['HP 60 -> 50', s.hpMax === 50, String(s.hpMax)],
    ['resist 3 cold, electricity, fire, piercing, slashing', ['cold', 'electricity', 'fire', 'piercing', 'slashing'].every((t) => s.resistances[t]?.value === 3), JSON.stringify(s.resistances)],
    ['not mindless by default', !s.traits.includes('mindless')],
  ]],
  ['vampire', { bypass: 'cold-iron' }, (s) => [
    ['HP 60 -> 50', s.hpMax === 50, String(s.hpMax)],
    ['resist physical 3 except cold iron', s.resistances['physical']?.value === 3 && s.resistances['physical'].exceptions.includes('cold-iron'), JSON.stringify(s.resistances)],
    ['sleep immunity', has(s.immunities, 'sleep')],
    ['Feed', s.items.includes('Feed')],
  ]],
  ['wight', {}, (s) => [['traits wight', has(s.traits, 'wight', 'undead')], ['Drain Life', s.items.includes('Drain Life')]]],
  ['air', {}, (s) => [['trait air', has(s.traits, 'air')], ['Sussuran', s.languages.includes('sussuran'), s.languages.join()], ['no fly Speed below 8th', !s.speeds['fly']]]],
  ['earth', {}, (s) => [['tremorsense', s.senses.includes('tremorsense'), s.senses.join()], ['burrow 20', s.speeds['burrow'] === 20, JSON.stringify(s.speeds)], ['Petran', s.languages.includes('petran')]]],
  ['fire', {}, (s) => [['fire immunity', has(s.immunities, 'fire')], ['Pyric', s.languages.includes('pyric')]]],
  ['metal', {}, (s) => [['HP 60 -> 50', s.hpMax === 50, String(s.hpMax)], ['resist electricity 5', s.resistances['electricity']?.value === 5, JSON.stringify(s.resistances)]]],
  ['water', {}, (s) => [
    ['traits water + amphibious', has(s.traits, 'water', 'amphibious')],
    ['HP 60 -> 50', s.hpMax === 50, String(s.hpMax)],
    ['resist fire 5', s.resistances['fire']?.value === 5, JSON.stringify(s.resistances)],
    ['swim 25', s.speeds['swim'] === 25, JSON.stringify(s.speeds)],
  ]],
  ['wood', { plant: true }, (s) => [
    ['traits wood + plant', has(s.traits, 'wood', 'plant')],
    ['HP 60 -> 80', s.hpMax === 80, String(s.hpMax)],
    ['weak 5 to fire and axes', s.weaknesses['fire'] === 5 && s.weaknesses['axe-vulnerability'] === 5, JSON.stringify(s.weaknesses)],
  ]],
  ['athamaru', {}, (s) => [['traits athamaru + amphibious, no human', has(s.traits, 'athamaru', 'amphibious') && !has(s.traits, 'human'), s.traits.join()], ['swim 25', s.speeds['swim'] === 25, JSON.stringify(s.speeds)]]],
  ['catfolk', {}, (s) => [['Amurrun', s.languages.includes('amurrun'), s.languages.join()], ['low-light vision', s.senses.includes('low-light-vision'), s.senses.join()]]],
  ['dwarf', {}, (s) => [['darkvision', s.senses.includes('darkvision'), s.senses.join()], ['Speed 25 -> 20', s.speeds['land'] === 20, JSON.stringify(s.speeds)], ['Dwarven', s.languages.includes('dwarven')]]],
  ['elf', {}, (s) => [['Elven', s.languages.includes('elven')], ['Speed stays 25', s.speeds['land'] === 25]]],
  ['gnome', {}, (s) => [['Small', s.size === 'sm', s.size], ['Fey + Gnomish', has(s.languages, 'fey', 'gnomish'), s.languages.join()]]],
  ['goblin', {}, (s) => [['Small', s.size === 'sm', s.size], ['trait goblin', has(s.traits, 'goblin', 'humanoid'), s.traits.join()]]],
  ['halfling', {}, (s) => [['Small', s.size === 'sm', s.size], ['Keen Eyes', s.items.includes('Keen Eyes'), s.items.join()]]],
  ['hobgoblin', {}, (s) => [['Medium', s.size === 'med', s.size], ['Goblin', s.languages.includes('goblin')]]],
  ['kholo', {}, (s) => [['Kholo', s.languages.includes('kholo'), s.languages.join()]]],
  ['kobold', {}, (s) => [['Sakvroth', s.languages.includes('sakvroth'), s.languages.join()], ['Small', s.size === 'sm', s.size]]],
  ['leshy', {}, (s) => [
    ['leshy + plant, no human or humanoid', has(s.traits, 'leshy', 'plant') && !has(s.traits, 'human') && !has(s.traits, 'humanoid'), s.traits.join()],
    ['Verdant Burst', s.items.includes('Verdant Burst'), s.items.join()],
  ]],
  ['lizardfolk', {}, (s) => [['Iruxi', s.languages.includes('iruxi'), s.languages.join()], ['swim 15', s.speeds['swim'] === 15, JSON.stringify(s.speeds)], ['Deep Breath', s.items.includes('Deep Breath')]]],
  ['merfolk', {}, (s) => [['Speed 5, swim 25', s.speeds['land'] === 5 && s.speeds['swim'] === 25, JSON.stringify(s.speeds)], ['Thalassic', s.languages.includes('thalassic')]]],
  ['orc', {}, (s) => [['Orcish', s.languages.includes('orcish'), s.languages.join()]]],
  ['ratfolk', {}, (s) => [['Ysoki', s.languages.includes('ysoki'), s.languages.join()]]],
  ['tengu', {}, (s) => [['Tengu', s.languages.includes('tengu'), s.languages.join()]]],
  ['tripkee', {}, (s) => [['Tripkee', s.languages.includes('tripkee'), s.languages.join()], ['Small', s.size === 'sm', s.size]]],
  ['zombie', {}, (s) => [
    ['HP 60 -> 80', s.hpMax === 80, String(s.hpMax)],
    ['weak 5 to vitality and slashing', s.weaknesses['vitality'] === 5 && s.weaknesses['slashing'] === 5, JSON.stringify(s.weaknesses)],
    ['slowed 1', s.slowed, s.items.join()],
    ['mental immunity', has(s.immunities, 'mental')],
  ]],
];

for (const [id, choices, expect] of CASES) {
  const warningsBefore = ruleWarnings.length;
  await apply(id, choices);
  const after = await snapshot(page, actorId);
  for (const [name, ok, detail] of expect(after)) check(`${id}: ${name}`, ok, detail ?? '');
  check(`${id}: every trait and language is one the system knows`, after.unknown.length === 0, after.unknown.join());
  check(`${id}: no rule element warnings`, ruleWarnings.length === warningsBefore, ruleWarnings.slice(warningsBefore).join(' | '));
  const removed = await remove(id);
  const back = await snapshot(page, actorId);
  check(`${id}: removing it restores the NPC`, removed > 0 && JSON.stringify(back) === JSON.stringify(base), removed > 0 ? '' : 'nothing removed');
}

// Two templates that both change Hit Points: each keeps its own modifier.
await apply('wood');
await apply('skeleton');
const twoHp = await snapshot(page, actorId);
check('Wood + Skeleton stack their Hit Points', twoHp.hpMax === 70, `60 + 20 - 10 -> ${twoHp.hpMax}`);
await remove('wood');
await remove('skeleton');

// Stacking: Elite on top of Skeleton. Both change Hit Points; Skeleton's cut must land on Elite's total.
await page.evaluate(async (id) => {
  const g = globalThis as any;
  await g.game.actors.get(id).applyAdjustment('elite');
}, actorId);
const elite = await snapshot(page, actorId);
await apply('skeleton');
const stacked = await snapshot(page, actorId);
check('Elite + Skeleton stack', elite.hpMax > 60 && stacked.hpMax === elite.hpMax - 10 && stacked.resistances['fire']?.value === 3, `elite ${elite.hpMax}, both ${stacked.hpMax}`);
await remove('skeleton');

await page.evaluate(async (id) => (globalThis as any).game.actors.get(id).delete(), actorId);
const passed = results.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
