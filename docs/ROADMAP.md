# Creature Template Applier roadmap

v0.8.2. Verified for Foundry 14.370. The live check applies every template to an
NPC in the C99 (PF2e) and C98 (SF2e) test worlds on the VPS and reads back what
the system made of it: 345 checks per world, run alongside the Invisi-Rolls
checks in the same worlds.

## Standing watch

Whenever Foundry, the PF2e system, the SF2e system, or this module releases a new
version, re-run the live checks (`W=c99 DSN=1` then `W=c98 DSN=1` with the runner
in `~/.claude/scripts/foundry-c99-live/run-c99.sh`) and fix what breaks. Last
full run: 2026-11-18, all green on Foundry 14.370, PF2e 8.7.1, SF2e 1.7.1,
module v0.8.2. The daily `verify-foundry.yml` workflow keeps the compatibility
badge current.

## Known limits (not tracked: judgement calls belong to the GM)

- Parts of a template that need a judgement about the creature are listed on the
  template's effect under "Still to do by hand", never guessed.

## Tracker

Owner: Foundry Modules (Invisi-Rolls and Templates)

- [ ] foundryvtt.com package listing (waiting on Lewis: create the package page
  and add the FOUNDRY_RELEASE_TOKEN secret; until then the release workflow
  warns and skips the publish step).
- [ ] Tokenless dry-run for the foundryvtt publish step (local branch
  opencode/modules/foundry-dryrun ready: DRY_RUN=true validates the release
  body with no token; tick when its PR merges).
- [ ] Daily releases-page fetch times out instead of hanging the workflow
  (local branch opencode/modules/bump-timeout ready; tick when its PR merges).
