# Particle field: working notes

## UI conventions

- **Sliders, not knobs.** Numeric settings are sliders (fill rows: the
  `.std-fill` / List-view look of `rackKnob`, or `levelBar` on the Sound page).
  Use a knob only where there's a specific reason, and say why. This applies to
  mockups and design proposals too.
- **Reuse, don't invent.** Build from the components that already exist (the
  Music tab bar `.mtabs`, the rack's ‹ › pickers and switches, fill rows, cards
  and folds). Check for an existing component or overlapping setting before
  adding a new one.
- **Minimal.** Fewer controls, short labels, plain words. Tips (`tips.ts`)
  carry the longer explanations.
- **Phone first.** Check every change at 390×844 as well as on desktop.
