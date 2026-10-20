# PF2e/SF2e Creature Template Applier

A Foundry VTT v14 module for the Pathfinder Second Edition and Starfinder Second Edition systems. It
applies creature templates, such as Skeleton, Zombie, Ghost or Vampire, to an NPC in one click.

The PF2e system automates only the Elite and Weak adjustments. Every other template in the books
has to be applied by hand: traits, immunities, weaknesses, resistances, Hit Points and new
abilities, read off a table that depends on the creature's level. This module does that part.

## How it works

Open an NPC's sheet as the GM and press **Templates** in its title bar. Pick a template, and any
choice it offers (mindless, or the material that gets through a vampire's resistance), then
**Apply**.

A template becomes:

- **one effect** named after it, carrying the system's own rule elements: traits, immunities,
  weaknesses, resistances, senses, Speeds, languages, Hit Point and save changes;
- **one ability item** for each ability it grants.

The NPC's own statistics are never edited. Numbers that depend on level are level brackets that the
system resolves every time, so they stay right if the level changes, and a template stacks with
the built-in Elite and Weak adjustments and with other templates. To take a template off, open the
same dialog and tick **Remove**, which deletes everything that template added.

Some parts of a template need a judgement about the creature, such as which Strike becomes a jaws
attack. Those are listed on the template's effect under **Still to do by hand**.

## Templates

- **Undead**, the nine adjustments from *Pathfinder Book of the Dead* (pages 72 and 73): Undead,
  Ghost, Ghoul, Mummy, Shadow, Skeleton, Vampire, Wight and Zombie. The system's remastered names
  are used: void healing for negative healing, and vitality for positive.
- **Elemental**, the six adjustments from *Pathfinder Rage of Elements*: Air, Earth, Fire, Metal,
  Water and Wood.
- **Ancestry**, the seventeen adjustments from *Pathfinder NPC Core* (pages 151, 168 and 169) that
  turn a human NPC into another ancestry: Athamaru, Catfolk, Dwarf, Elf, Gnome, Goblin, Halfling,
  Hobgoblin, Kholo, Kobold, Leshy, Lizardfolk, Merfolk, Orc, Ratfolk, Tengu and Tripkee.

- **Mythic**, the four mythic monster templates from *Pathfinder War of Immortals* (pages 168 and
  169): Mythic Ambusher, Brute, Caster and Striker, each with the basic mythic abilities for its
  level. Mythic resilience goes to the creature's highest allowed saves first, as the book advises.

- **Adaptation**, the six creature adaptations from *Pathfinder Howl of the Wild* (pages 122 and
  123): Amphibious, Frostbound, Miniature, Sandbound, Twinned and Winged. Speeds the creature lacks
  are worked out from the Speeds it has when the template goes on.

## Install

Manifest URL:

```
https://github.com/LewisIsWorking/creature-template-applier/releases/latest/download/module.json
```

## Development

```
npm ci
npm run verify      # em-dash guard, typecheck, tests with coverage, build
```

`npm run check:live` applies every template to an NPC in a running world and reads back what the
system made of it (see `scripts/live-check.ts`). It creates an NPC, so use a throwaway world.

## Licence

The code is MIT (see `LICENSE`). The game mechanics are Paizo's, used under the Open Game License
(`licenses/OpenGameLicense.md`) and the ORC License (`licenses/ORCLicense.md`). This module is not
published, endorsed or specifically approved by Paizo.
