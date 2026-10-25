# First-use onboarding

The Introduction bridges an empty workspace to creating ordinary Items. It keeps the Cosmifold name, purpose statement, familiar examples, rounded example frame, **+ Create your first Item** CTA and Help entry point. Desktop uses the existing two-column composition; intermediate and phone layouts stack it.

## Static example

The Introduction uses a local `<picture>` and two static PNG crops of the exact approved production artwork: `C:/Main/Principal/Projects/cosmifold-intro-approved.png`. The scene was not redrawn, rendered again, reinterpreted, or rearranged. Both crops retain Japan Trip, Tokyo, Stay, Food and Places exactly as painted in the source, including the original relationship lines, textures, glow and starfield. No new geometry, bodies, satellite pictograms, arrows or taxonomy were added. These are example-image pixels only; they never enter the Universe model, attachments, Search, Tasks, Backup or Restore.

- `assets/introduction-example.png`: 1336 x 699, the source rectangle `(100, 163, 1336, 699)` in x/y/width/height form.
- `assets/introduction-example-compact.png`: 1236 x 690, the source rectangle `(160, 170, 1236, 690)`.

The compact crop removes more peripheral space while preserving all five bodies and names. The desktop crop is wider. Both rectangles are inside the source image's rounded border, leaving the existing HTML wrapper as the single visible frame. The wrapper follows each crop's aspect ratio instead of letterboxing it inside a fixed-height second card. Desktop columns, stacked tablet/phone treatment, heading, copy, caption, CTA and Help are preserved. `object-fit: contain` keeps all crop pixels visible; there is no video or hero-generation runtime.

To repeat the exact crop, run `scripts/prepare-introduction-hero.ps1`. It reads the approved 1536 x 1024 source and clones the two rectangles with Windows System.Drawing, without resampling or drawing. Approved source SHA256: `0C43783B5465759333F9E15BFF6112F27F5E593354A9568B7AB9FB25F0E8A029`. 

The former `FirstUsePreview`, fictional runtime scene, camera interpolation, label management and lifecycle listeners were removed from `first-use.js`. Shared production renderers, textures and the attachment video viewer remain unchanged. No video asset was present to remove.

## Existing onboarding state

`FirstUseOnboarding` in `first-use.js` controls visibility and the existing two temporary hints. `syncFirstUse()` checks that both live and archived entries are empty. Sample mode and unavailable/unreadable storage do not show Introduction; a legitimately empty restored Universe does, independently of completed hint preferences.

The first root uses the existing `child` phase and root ID. Its coach names that Item and follows its visible Contents +, compact mobile + or visible desktop sidebar +. The first child completes the existing `done` phase; starter creation with children goes directly to the existing branch hint. Dismissal and the existing 16-second timeout stop coach positioning and clear its temporary target class. Reload does not restart a dismissed child coach.

Hints yield to dialogs, menus, inline editing and an obscuring mobile sidebar. No authentication, migration, new creation system or persistence/recovery change is introduced.

## Validation

`tests/first-use.test.js` covers static asset declarations/dimensions, lack of media/renderer dependencies, ordinary visibility, control delegation and existing show-once phases. `--first-use-only` covers loaded static images at desktop, tablet, phone and short landscape sizes, unchanged layout/CTA, model/attachment/Backup isolation, Help focus, reduced-motion/page lifecycle, real creation, coach dismissal, reload and archived content. Animation-specific tests were retired with the removed feature.
