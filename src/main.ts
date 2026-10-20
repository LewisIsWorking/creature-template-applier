/**
 * The Foundry boundary: a Templates button on NPC sheets, the dialog it opens, and the API the live
 * check drives. Everything that decides what a template does is in templates.ts and build.ts.
 */
import { appliedTemplates, buildTemplate, MODULE_ID } from './build.ts';
import { readFacts } from './facts.ts';
import { findTemplate, TEMPLATES, type Bypass, type Energy, type TemplateChoices } from './templates.ts';

/* eslint-disable @typescript-eslint/no-explicit-any -- Foundry ships no types; this file is the boundary. */
declare const game: any;
declare const Hooks: any;
declare const ui: any;
declare const foundry: any;

const SYSTEMS = new Set(['pf2e', 'sf2e']);

/**
 * The Slowed condition's compendium UUID. The system's ConditionManager keys every condition both by
 * slug and by that UUID, so find the UUID key whose condition is the slug's.
 */
function slowedUuid(): string | null {
  const conditions: Map<string, unknown> | undefined = (game[game.system.id] ?? game.pf2e)?.ConditionManager?.conditions;
  const slowed = conditions?.get('slowed');
  if (!conditions || !slowed) return null;
  for (const [key, value] of conditions) if (value === slowed && key.startsWith('Compendium.')) return key;
  return null;
}

async function apply(actor: any, id: string, choices: TemplateChoices = {}): Promise<string[]> {
  const template = findTemplate(id);
  if (!template) throw new Error(`No template "${id}".`);
  if (appliedTemplates(actor.items).includes(id)) throw new Error(`${actor.name} already has the ${template.name} template.`);
  const built = buildTemplate(template, readFacts(actor, slowedUuid()), choices);
  await actor.createEmbeddedDocuments('Item', built.items);
  return [...built.byHand];
}

async function remove(actor: any, id: string): Promise<number> {
  const ids = actor.items.filter((i: any) => i.flags?.[MODULE_ID]?.template === id).map((i: any) => i.id);
  if (ids.length > 0) await actor.deleteEmbeddedDocuments('Item', ids);
  return ids.length;
}

const esc = (s: string): string => foundry.utils.escapeHTML(s);

function dialogContent(actor: any): string {
  const applied = appliedTemplates(actor.items);
  const groups = [...new Set(TEMPLATES.map((t) => t.group))];
  const options = groups
    .map((g) => {
      const opts = TEMPLATES.filter((t) => t.group === g && !applied.includes(t.id))
        .map((t) => `<option value="${t.id}" title="${esc(t.summary)}">${esc(t.name)}</option>`)
        .join('');
      return opts ? `<optgroup label="${esc(g)}">${opts}</optgroup>` : '';
    })
    .join('');
  const picks = TEMPLATES.filter((t) => t.picks && !applied.includes(t.id))
    .map((t) => {
      const boxes = t.picks!
        .map((p) => `<label><input type="checkbox" name="pick.${t.id}.${p.id}"${p.default ? ' checked' : ''}> ${esc(p.name)}</label>`)
        .join('<br>');
      return `<fieldset><legend>${esc(t.name)} only</legend>${boxes}</fieldset>`;
    })
    .join('');
  const removals = applied
    .map((id) => `<label><input type="checkbox" name="remove.${id}"> Remove ${esc(findTemplate(id)?.name ?? id)}</label>`)
    .join('<br>');
  return `
    <div class="form-group"><label>Add</label>
      <select name="template"><option value="">(none)</option>${options}</select></div>
    <div class="form-group"><label>Mindless</label><input type="checkbox" name="mindless">
      <p class="hint">Undead and Skeleton only.</p></div>
    <div class="form-group"><label>Aquatic</label><input type="checkbox" name="aquatic">
      <p class="hint">Water only: aquatic instead of amphibious.</p></div>
    <div class="form-group"><label>Plant</label><input type="checkbox" name="plant">
      <p class="hint">Wood only: a growing plant also gets the plant trait.</p></div>
    <div class="form-group"><label>Bypassed by</label>
      <select name="bypass"><option value="silver">silver</option><option value="cold-iron">cold iron</option><option value="wood">wood</option></select>
      <p class="hint">Vampire only: the material that gets through its resistance.</p></div>
    <div class="form-group"><label>Energy</label>
      <select name="energy"><option value="electricity">electricity</option><option value="fire">fire</option></select>
      <p class="hint">Experimental Cryptid only: the damage of its Energy Wave and Power Surge.</p></div>
    ${picks}
    ${removals ? `<fieldset><legend>Applied</legend>${removals}</fieldset>` : ''}`;
}

async function openDialog(actor: any): Promise<void> {
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Creature Templates: ${actor.name}` },
    content: dialogContent(actor),
    ok: {
      label: 'Apply',
      callback: (_event: unknown, button: any) => new foundry.applications.ux.FormDataExtended(button.form).object,
    },
    rejectClose: false,
  });
  if (!data) return;
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('remove.') && value === true) await remove(actor, key.slice('remove.'.length));
  }
  const id = String(data['template'] ?? '');
  if (!id) return;
  const template = findTemplate(id);
  if (!template) return;
  const choices: TemplateChoices = {
    ...(template.choices.includes('mindless') ? { mindless: data['mindless'] === true } : {}),
    ...(template.choices.includes('bypass') ? { bypass: String(data['bypass']) as Bypass } : {}),
    ...(template.choices.includes('aquatic') ? { aquatic: data['aquatic'] === true } : {}),
    ...(template.choices.includes('plant') ? { plant: data['plant'] === true } : {}),
    ...(template.choices.includes('energy') ? { energy: String(data['energy']) as Energy } : {}),
    ...(template.picks ? { picks: template.picks.filter((p) => data[`pick.${id}.${p.id}`] === true).map((p) => p.id) } : {}),
  };
  try {
    const byHand = await apply(actor, id, choices);
    const rest = byHand.length > 0 ? ` ${byHand.length} part(s) to do by hand are listed on its effect.` : '';
    ui.notifications.info(`${actor.name} is now a ${template.name}.${rest}`);
  } catch (err) {
    ui.notifications.error((err as Error).message);
  }
}

Hooks.once('init', () => {
  if (!SYSTEMS.has(game.system.id)) return;
  Hooks.on('getActorSheetHeaderButtons', (sheet: any, buttons: any[]) => {
    const actor = sheet.actor;
    if (actor?.type !== 'npc' || !game.user.isGM) return;
    buttons.unshift({ label: 'Templates', class: 'creature-templates', icon: 'fa-solid fa-skull', onclick: () => void openDialog(actor) });
  });
  Hooks.once('ready', () => {
    game.modules.get(MODULE_ID).api = { templates: TEMPLATES, apply, remove, applied: (actor: any) => appliedTemplates(actor.items), openDialog };
  });
});
