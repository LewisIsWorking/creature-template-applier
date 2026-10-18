/**
 * Turns a template into the item data that applies it: one effect carrying the rule elements, and one
 * item per added ability. Every item is flagged with the template id, so removing the template is
 * deleting the items that carry its flag. Pure, so the unit tests cover it without Foundry.
 */
import type { AbilitySpec, CreatureFacts, CreatureTemplate, TemplateChoices } from './templates.ts';

export const MODULE_ID = 'creature-template-applier';

export interface TemplateFlag {
  readonly template: string;
}

export type ItemSource = Record<string, unknown> & { name: string; type: string };

const ICON = 'icons/svg/skull.svg';

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function describe(template: CreatureTemplate, byHand: readonly string[]): string {
  const parts = [`<p>${escape(template.summary)}</p>`, `<p><em>Source: ${escape(template.source)}</em></p>`];
  if (byHand.length > 0) {
    parts.push('<p><strong>Still to do by hand:</strong></p>');
    parts.push(`<ul>${byHand.map((s) => `<li>${escape(s)}</li>`).join('')}</ul>`);
  }
  return parts.join('');
}

const flags = (template: CreatureTemplate) => ({ [MODULE_ID]: { template: template.id } satisfies TemplateFlag });

function abilityItem(template: CreatureTemplate, a: AbilitySpec): ItemSource {
  return {
    name: a.name,
    type: 'action',
    img: ICON,
    system: {
      slug: a.slug,
      description: { value: a.description },
      actionType: { value: a.actionType },
      actions: { value: a.actions ?? null },
      category: a.category,
      traits: { value: [...a.traits] },
      rules: a.rules ? a.rules.map((r) => ({ ...r })) : [],
    },
    flags: flags(template),
  };
}

export interface BuiltTemplate {
  readonly items: ItemSource[];
  readonly byHand: readonly string[];
}

export function buildTemplate(template: CreatureTemplate, facts: CreatureFacts, choices: TemplateChoices): BuiltTemplate {
  const result = template.build(facts, choices);
  const effect: ItemSource = {
    name: `Template: ${template.name}${choices.mindless ? ' (mindless)' : ''}`,
    type: 'effect',
    img: ICON,
    system: {
      slug: `template-${template.id}`,
      description: { value: describe(template, result.byHand) },
      rules: result.rules.map((r) => ({ ...r })),
      duration: { value: -1, unit: 'unlimited', expiry: null, sustained: false },
      tokenIcon: { show: false },
      level: { value: facts.level },
      traits: { value: [] },
    },
    flags: flags(template),
  };
  return { items: [effect, ...result.abilities.map((a) => abilityItem(template, a))], byHand: result.byHand };
}

/** The template ids already on a creature, read from its items' flags. */
export function appliedTemplates(items: Iterable<{ flags?: Record<string, unknown> }>): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    const flag = item.flags?.[MODULE_ID] as Partial<TemplateFlag> | undefined;
    if (typeof flag?.template === 'string') ids.add(flag.template);
  }
  return [...ids];
}
