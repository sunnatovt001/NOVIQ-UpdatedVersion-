# Onboarding visual verification

final result: blocked

Scope: onboarding background and illustration assets only. Auth, routing and persistence were not modified in this iteration.

Source: Library image(20261022-050715).png, 1584 x 993, Challenge reference, visually opened in the connected browser.
Implementation: existing local onboarding route, Goal state, browser viewport 1536 x 770. Browser screenshots were inspected in the tool output; no screenshot file was exported. Different states and viewport ratios prevent a pixel-for-pixel comparison.

Changes verified:
- Corrected two nonexistent image URLs to the supplied graduation-cap.png and glowing-orbit.png.
- Confirmed all ten onboarding images have loaded with nonzero natural widths.
- Softened the background opacity, made the question card more opaque, shifted the student to the right and lowered the orbit.

Findings:
- P1: Supplied PNG cutouts contain unrelated blue fragments and transparency residue. These are visible beside the cap, book and robot. Restoring missing asset URLs does not resolve source image quality. The image editor rejected Windows absolute paths, preventing asset restoration through the available editing route.
- P1: The available liquid-scene.png has different folds and campus positioning from the selected reference. Lower opacity improves readability but is not a faithful replacement.
- P2: A matched-viewport and matched-step full comparison and focused-region comparison remain outstanding.

Fidelity surfaces:
- Typography: existing app font retained; precise reference font comparison outstanding.
- Layout: illustration placement improved; desktop card rhythm requires matched-viewport review.
- Colors: background intensity reduced and white card contrast improved.
- Images: all sources load; visible cutout defects block acceptance.
- Copy: existing onboarding copy retained.

Validation: TypeScript passed. Production build result recorded separately in the task response. Browser confirmed image loading; primary flow and console verification were not repeated for this visual-only iteration.

Required next work: obtain clean transparent hero assets, obtain the exact background asset, then capture all three steps at reference dimensions and complete visual QA before claiming completion.
