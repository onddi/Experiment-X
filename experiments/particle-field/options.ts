// Option lists for the pickers: [value, label] pairs, plus the helpers that read them.
import type { Settings } from './settings.ts';

// How the top layer mixes into the base (CSS mix-blend-mode on its frame).
export const TOP_BLENDS: [Settings['topBlend'], string][] = [
  ['normal', 'Normal'],
  ['screen', 'Screen (light adds)'],
  ['plus-lighter', 'Add (brighter)'],
  ['lighten', 'Lighten'],
  ['color-dodge', 'Dodge (hot glow)'],
  ['overlay', 'Overlay (more contrast)'],
  ['soft-light', 'Soft light'],
  ['hard-light', 'Hard light'],
  ['multiply', 'Multiply (only where both are)'],
  ['darken', 'Darken'],
  ['color-burn', 'Burn'],
  ['difference', 'Difference'],
  ['exclusion', 'Exclusion (softer difference)'],
  ['hue', 'Hue (tints the base)'],
  ['color', 'Colour (recolours the base)'],
  ['saturation', 'Saturation'],
  ['luminosity', 'Brightness only'],
];

export const OB_LOOKS: [string, string][] = [['faint', 'Faint'], ['solid', 'Solid'], ['outline', 'Outline'], ['glow', 'Glow'], ['neon', 'Neon'], ['glass', 'Glass'], ['shadow', 'Lifted (shadow)'], ['stripes', 'Stripes'], ['dots', 'Dots']];

export const OB_COLOURS: [string, string][] = [['white', 'White'], ['scene', 'Scene colour'], ['palette', 'Scene palette (gradient)'], ['dark', 'Dark (a cut-out)'], ['gold', 'Gold'], ['amber', 'Amber'], ['red', 'Red'], ['pink', 'Pink'], ['violet', 'Violet'], ['blue', 'Blue'], ['ice', 'Ice'], ['mint', 'Mint']];

export const OB_PIECE_KINDS: [string, string][] = [['text', 'A word'], ['icon', 'A shape'], ['wall', 'A wall'], ['ring', 'A ring'], ['circle', 'A circle']];

export const GRAIN_SOUNDS: [string, string][] = [['dust', 'Dust'], ['notes', 'Glitter notes'], ['rain', 'Rain'], ['bubbles', 'Bubbles'], ['vinyl', 'Vinyl crackle'], ['wood', 'Wood knocks'], ['sand', 'Sand'], ['crickets', 'Crickets'], ['sparks', 'Sparks'], ['glass', 'Glass'], ['keys', 'Typewriter keys']];

export const GRAIN_FROM: [string, string][] = [['any', 'Anywhere'], ['fast', 'Fast movers'], ['bounce', 'Bounces']];

export const TICK_SOUNDS: [string, string][] = [['off', 'Off'], ['soft', 'Soft'], ['click', 'Click'], ['metro', 'Metronome'], ['wood', 'Wood block'], ['rim', 'Rim'], ['snap', 'Finger snap'], ['clap', 'Clap'], ['shaker', 'Shaker'], ['shuffle', 'Brushed shaker'], ['tamb', 'Tambourine'], ['cowbell', 'Cowbell'], ['hat', 'Hi-hat'], ['blip', 'Blip (in key)'], ['glass', 'Glass (in key)']];

export const TICK_PATTERNS: [string, string][] = [['eighths', 'Eighths'], ['quarters', 'On the beat'], ['offbeat', 'Off the beat'], ['sixteenths', 'Sixteenths'], ['gallop', 'Gallop'], ['clave', 'Clave'], ['tresillo', 'Tresillo'], ['bossa', 'Bossa'], ['field', 'Where particles crowd']];

export const STEP_SOUNDS: [string, string][] = [['same', 'Main'], ['marimba', 'Marimba'], ['bell', 'Bell'], ['glass', 'Glass'], ['pluck', 'Pluck'], ['harp', 'Harp'], ['koto', 'Koto'], ['kalimba', 'Kalimba'], ['steel', 'Steel drum'], ['epiano', 'Electric piano'], ['vibes', 'Vibraphone'], ['musicbox', 'Music box'], ['flute', 'Flute'], ['synth', 'Synth'], ['guitar', 'Acoustic guitar'], ['nylon', 'Nylon guitar'], ['sitar', 'Sitar'], ['mandolin', 'Mandolin'], ['banjo', 'Banjo'], ['pizz', 'Pizzicato strings'], ['violin', 'Violin'], ['cello', 'Cello'], ['piano', 'Piano'], ['clav', 'Clavinet'], ['xylo', 'Xylophone'], ['chip', 'Chip (8-bit)'], ['acid', 'Acid pluck'], ['organ', 'Organ stab'], ['bubble', 'Bubbles'], ['celesta', 'Celesta'], ['crystal', 'Crystal'], ['wood', 'Wood block'], ['drop', 'Water drops'], ['bird', 'Birdsong'], ['frog', 'Frogs'], ['talkdrum', 'Talking drum'], ['bowl', 'Singing bowl']];

export const SCAN_DIRS: [string, string][] = [['across', 'Left to right'], ['down', 'Top to bottom'], ['bounce', 'Back and forth'], ['radar', 'Radar']];

export const STEP_RATES: [string, string][] = [['1', '1/16'], ['2', '1/8'], ['4', '1/4']];

export const CHIME_SOUNDS: [string, string][] = [['same', 'Like the strings'], ['wind', 'Wind chimes'], ['celesta', 'Celesta'], ['tubular', 'Tubular bells'], ['crystal', 'Crystal'], ['tri', 'Triangle'], ['gong', 'Gong'], ['drop', 'Water drops'], ['wood', 'Wood block'], ['bell', 'Bell'], ['glass', 'Glass'], ['vibes', 'Vibraphone'], ['musicbox', 'Music box'], ['kalimba', 'Kalimba'], ['marimba', 'Marimba'], ['steel', 'Steel drum']];

export const PAD_SOUNDS: [string, string][] = [['soft', 'Soft'], ['warm', 'Warm analog'], ['strings', 'Strings'], ['bowed', 'Bowed'], ['tape', 'Tape (wobbly)'], ['glass', 'Glass'], ['shimmer', 'Shimmer'], ['air', 'Air'], ['choir', 'Choir'], ['organ', 'Organ'], ['dark', 'Dark drone'], ['brass', 'Brass'], ['reed', 'Reed (accordion)'], ['hollow', 'Hollow (resonant)'], ['ooh', 'Ooh (low voices)'], ['cello', 'Cello section'], ['ice', 'Ice (high, sparkling)'], ['pwm', 'Wide synth'], ['velvet', 'Velvet (soft and dark)'], ['analog', 'Analog (bright, wide)'], ['vox', 'Aah (high voices)'], ['drone', 'Tanpura drone'], ['mist', 'Mist (soft, breathy)'], ['supersaw', 'Supersaw'], ['harmonium', 'Harmonium'], ['cosmic', 'Cosmic (resonant, high)'], ['gated', 'Gated (chopped in time)'], ['reverse', 'Reverse swell'], ['sweep', 'Resonant sweep'], ['bells', 'FM bells'], ['whisper', 'Whisper choir'], ['throat', 'Throat drone'], ['frozen', 'Frozen (glittering)'], ['ocean', 'Ocean waves'], ['wind', 'Wind'], ['rain', 'Rain'], ['whale', 'Whale song'], ['crickets', 'Crickets at night'], ['storm', 'Distant storm'], ['horror', 'Horror strings'], ['chant', 'Monk chant'], ['factory', 'Factory drone'], ['juno', 'Juno chorus'], ['epic', 'Cinematic strings'], ['vocoder', 'Vocoder'], ['shepard', 'Endless rise'], ['granular', 'Granular cloud']];

export const BASS_SOUNDS: [string, string][] = [
  ['synth', 'Synth (two saws)'], ['moog', 'Analog (fat)'], ['pulse', 'Pulse (hollow)'], ['sub', 'Sub (deep)'], ['808', '808 (long, slides)'],
  ['round', 'Round (warm)'], ['house', 'Organ (house)'], ['fm', 'FM (80s punch)'], ['slap', 'Slap (funk)'],
  ['upright', 'Upright (woody)'], ['fingered', 'Fingered (vintage)'], ['picked', 'Picked (electric)'],
  ['acid', 'Acid (squelchy)'], ['reese', 'Reese (DnB)'], ['wobble', 'Wobble (dubstep)'], ['fuzz', 'Fuzz (distorted)'],
  ['dist808', '808 (distorted)'], ['growl', 'Growl (neuro FM)'], ['rubber', 'Rubber (bouncy)'], ['deep', 'Deep (dark, filtered)'], ['fretless', 'Fretless (singing)'], ['brass', 'Brass (tuba)'], ['psy', 'Psy (tight, clicky)'], ['chip', 'Chip (8-bit)'],
  ['hoover', 'Hoover (rave)'], ['donk', 'Donk (hard house)'], ['neuro', 'Neuro reese (moving)'], ['square', 'Square (grime)'], ['juno', 'Juno (80s poly)'], ['ebm', 'EBM (tight saw)'], ['metal', 'Metallic (FM)'], ['siren', 'Dub siren'],
];

export const pct = (v: number) => `${Math.round(v * 100)}%`;

export const GFX_LENSES: [string, string][] = [['off', 'Off'], ['glass', 'Glass'], ['shock', 'Shockwave'], ['kaleido', 'Kaleido'], ['liquid', 'Liquid'], ['fisheye', 'Fisheye'], ['sort', 'Pixel sort'], ['twirl', 'Whirlpool'], ['pinch', 'Pinch'], ['bulge', 'Bulge'], ['tilt', 'Tilt-shift'], ['mirrorx', 'Mirror ←→'], ['mirrory', 'Mirror ↑↓'], ['quad', 'Mirror four ways']];

export const GFX_BLURS: [string, string][] = [['off', 'Off'], ['zoom', 'Zoom'], ['spin', 'Spin'], ['motion', 'Motion']];

export const GFX_SURFACES: [string, string][] = [['off', 'Off'], ['led', 'LED wall'], ['halftone', 'Halftone'], ['ascii', 'ASCII'], ['crt', 'CRT'], ['thermal', 'Thermal'], ['mosaic', 'Mosaic'], ['stitch', 'Cross-stitch'], ['lego', 'Toy bricks'], ['vhs', 'VHS'], ['oil', 'Oil paint'], ['neon', 'Neon outline']];

export const FLOW_TYPES: [string, string][] = [
  ['waves', 'Currents (streams)'], ['curl', 'Smoke (stays spread)'], ['vortex', 'Vortex (orbits the centre)'], ['wind', 'Wind (gusts one way)'],
  ['cells', 'Cells (spinning eddies)'], ['rise', 'Rise (like heat)'], ['tide', 'Tide (breathes in and out)'], ['spiral', 'Spiral arms (galaxy)'],
];

export const label = (options: [string, string][], v: unknown) => options.find(([k]) => k === v)?.[1] ?? '';

export const POINTER_MODES: [string, string][] = [['repel', 'Repel'], ['attract', 'Attract'], ['vortex', 'Vortex'], ['none', 'Off']];

export const CLICK_MODES: [string, string][] = [['implodeHold', 'Implode & burst (hold)'], ['thumb', 'Thumb in the stream (hold)'], ['gather', 'Gather (hold)'], ['emit', 'Fountain (hold)'], ['ripple', 'Ripple'], ['implode', 'Implode'], ['shockwave', 'Shockwave'], ['none', 'Nothing']];

export const RENDERS: [string, string][] = [
  ['dots', 'Pixels'], ['circles', 'Circles'], ['glow', 'Glow orbs'], ['bokeh', 'Bokeh'], ['rings', 'Rings'],
  ['sparkles', 'Sparkles'], ['arrows', 'Arrows'], ['streaks', 'Streaks'], ['comets', 'Comets'], ['ribbons', 'Ribbons'], ['glyphs', 'Glyphs'],
  ['links', 'Constellation'],
  ['squares', 'Confetti squares'], ['shards', 'Shards'], ['stars', 'Stars'], ['petals', 'Petals'], ['crosses', 'Crosses'],
  ['neon', 'Neon'], ['flare', 'Lens flare'], ['embers', 'Embers'],
  ['hair', 'Hair'], ['threads', 'Threads'], ['ink', 'Ink'], ['lightning', 'Lightning'],
  ['halftone', 'Halftone'], ['bigpixels', 'Big pixels'], ['bubbles', 'Bubbles'], ['marbles', 'Marbles'],
  ['liquid', 'Liquid'], ['cells', 'Cells'], ['contours', 'Contours'], ['smoke', 'Smoke'], ['glass', 'Glass drops'], ['sand', 'Sand'],
  ['lava', 'Lava'], ['terrain', 'Terrain'], ['caustics', 'Caustics'], ['aurora', 'Aurora'], ['marbling', 'Marbling'], ['rain', 'Rain on water'], ['slime', 'Slime mould'], ['rivals', 'Rival slimes'], ['mycelium', 'Mycelium'], ['ants', 'Ant trails'], ['termites', 'Termites'], ['colonise', 'Space colonisation'], ['lenia', 'Lenia'],
  ['turing', 'Coral (reaction-diffusion)'], ['ferro', 'Ferrofluid'], ['frost', 'Frost'], ['flames', 'Flames'], ['stained', 'Stained glass'],
  ['lowpoly', 'Low-poly'], ['fieldlines', 'Field lines'], ['sketch', 'Pencil sketch'], ['fireflies', 'Fireflies'], ['brush', 'Brush strokes'],
  ['sprite', 'Your sprite (image or sheet)'],
  ['mixed', 'Mixed'],
];

export const PAL_BGS: [string, string][] = [['own', 'Its own'], ['black', 'Black'], ['tinted', 'Tinted'], ['light', 'Light']];

export const SPEC_LAYOUTS: [string, string][] = [['centre', 'Centre out'], ['floor', 'Floor'], ['mirror', 'Mirrored'], ['line', 'Line']];

export const COLOR_BY: [string, string][] = [['palette', 'Random'], ['face', 'Face features (camera)'], ['camera', 'Picture colours (camera or image)'], ['image', 'Image colours (with an image)'], ['speed', 'Speed'], ['direction', 'Heading'], ['pointer', 'Pointer heat'], ['cycle', 'Colour waves'], ['horizontal', 'Left → right'], ['vertical', 'Bottom → top'], ['radial', 'Centre glow'], ['age', 'Age (with a lifespan)'], ['depth', 'Depth (with 3D depth)'], ['audio', 'Music energy'], ['band', 'Frequency group (with groups on)'], ['spectrum', 'Spectrum band (music spectrum)']];

export const BEAT_ACTIONS: [string, string][] = [['ripple', 'Ripple'], ['twist', 'Twist'], ['shockwave', 'Shockwave'], ['star', 'Star burst'], ['sweep', 'Sweep line'], ['implode', 'Implode'], ['mix', 'Mix (cycle)'], ['random', 'Mix (random)']];
