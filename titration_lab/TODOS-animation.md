# Animation & Aesthetics TODOs
> These are polish items only — no functional impact on the simulation.

## Pipette Stage

- [ ] **Reagent beaker fill sequence**: Before the pipette-into-flask animation, show a small reagent beaker on the left. Animate the pipette dipping into the beaker and aspirating (liquid transfers from beaker to pipette bulb), then the pipette visually moves across to hover over the flask before draining. Currently the fill animation happens in-place with no beaker present.

- [ ] **Pipette movement tween**: Add a lateral translate animation so the pipette SVG slides from its "filling" position above the beaker to its "dispensing" position above the flask, instead of staying stationary throughout.

- [ ] **Meniscus curve on liquid surface**: The current liquid fill is a flat-topped rect. Add a small curved ellipse at the top of the liquid column to simulate the concave meniscus visible in real glassware.

## General Glassware

- [ ] **Glass highlight / shine**: Add a subtle vertical gradient or a thin lighter stripe on the left edge of all glass SVGs (pipette, burette, flask) to give a cylindrical glass effect.

- [ ] **Indicator colour transition**: When phenolphthalein is added, animate the flask liquid smoothly from the analyte colour to the indicator (acid) colour over ~0.5 s rather than snapping.
