/**
 * data/easter-eggs.js
 * Special reaction overrides that replace the default animation and/or observation
 * for a specific precipitate id.
 *
 * How it works:
 *   1. ReactionEngine runs the full sweep and collects all ReactionEvent objects normally.
 *   2. After the sweep, _applyEasterEggOverrides() walks every event.
 *   3. If event.pptAdded.id matches an entry's triggerPpt, the event's animId and
 *      observation string are replaced with the easter egg values.
 *   4. The rest of the event (ionChanges, equation, etc.) is unchanged.
 *
 * Adding a new easter egg:
 *   • Set triggerPpt to the existing ppt id from PRECIPITATION_TABLE.
 *   • Set customAnimId to a new id registered in AnimationManager.
 *   • Set observationOverride to the plain English observation (no formulas/names).
 *   • The engine does the rest.
 *
 * Field definitions:
 *   id                — unique identifier for this easter egg entry
 *   triggerPpt        — ppt id (from PRECIPITATION_TABLE) that activates this override
 *   customAnimId      — animation id registered in AnimationManager (replaces default animId)
 *   observationOverride — plain English observation string (no formulas, no cation/anion names)
 */

export const EASTER_EGGS = [
  {
    id: 'golden_rain',
    // Triggered when Pb²⁺ + I⁻ → PbI₂ precipitate forms
    triggerPpt: 'pbi2',
    customAnimId: 'anim_golden_rain',
    observationOverride:
      'A dense, golden-yellow crystalline precipitate formed slowly, '
      + 'appearing as bright golden flakes that settled through the solution.',
  },

  // ── Future easter eggs ─────────────────────────────────────────────────────
  // Add new entries here. No engine changes are needed.
  // Each entry needs: id, triggerPpt, customAnimId, observationOverride.
  //
  // Example template:
  // {
  //   id: 'my_easter_egg',
  //   triggerPpt: 'some_ppt_id',
  //   customAnimId: 'anim_my_custom_anim',
  //   observationOverride: 'A remarkable visual effect was observed ...',
  // },
];
