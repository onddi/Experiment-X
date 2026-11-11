// Settings: every option's type and its default value. Pure data, no DOM.
import type { Genre, VoxMode } from './audio.ts';
export type PointerMode = 'repel' | 'attract' | 'vortex' | 'none';
export type LifeSize = 'none' | 'grow' | 'shrink' | 'swell';
export type LifeFade = 'edges' | 'out' | 'swell' | 'flash';
export type PlaceWell = 'off' | 'attract' | 'repel' | 'vortex' | 'emitter';
export type Emitter = 'none' | 'point' | 'line' | 'circle' | 'ring' | 'edges' | 'pointer';
export type EmitMode = 'steady' | 'burst' | 'beat';
// 'grid', 'sunflower' and 'ring' are older names (now a pattern, or a geometric circle);
// upgradeShape turns them into the new ones.
export type Shape = 'none' | 'text' | 'image' | 'camera' | 'pattern' | 'grid' | 'sunflower' | 'ring' | 'icon' | 'geo' | 'solid' | 'live' | 'sequence' | 'drawing';
export type CamMode = 'face' | 'features' | 'mixed' | 'hands' | 'pose' | 'body' | 'edges' | 'bright' | 'dark';
// What a hand gesture does (Gestures card).
export type MaskFx = 'none' | 'flames' | 'crown' | 'tears' | 'beard' | 'halo' | 'lasers';
// What an expression does: a moment (fires once as the expression starts),
// "while held", or an amount that follows how strong the expression is.
export type CamHands = 'off' | 'attract' | 'repel' | 'vortex' | 'draw' | 'spray';
export type FlowType = 'waves' | 'curl' | 'vortex' | 'wind' | 'cells' | 'rise' | 'tide' | 'spiral';
export type Edges = 'wrap' | 'enter' | 'bounce';
export type ClickMode = 'gather' | 'ripple' | 'implode' | 'emit' | 'shockwave' | 'none' | 'implodeHold';
export type Render = 'mixed' | 'dots' | 'circles' | 'glow' | 'bokeh' | 'rings' | 'sparkles' | 'arrows' | 'streaks' | 'comets' | 'ribbons' | 'glyphs' | 'links';
export type KickAction = 'pulse' | 'wave' | 'both' | 'pump' | 'tick' | 'spawn' | 'none';
export type SnareAction = 'swirl' | 'wave' | 'flash' | 'none';
export type HatAction = 'sparkle' | 'none';
export type SubAction = 'size' | 'flow' | 'speed' | 'none';
export type WaveAt = 'centre' | 'pointer' | 'random' | 'orbit' | 'mirror' | 'corners';
export type BeatAction = 'ripple' | 'shockwave' | 'implode' | 'twist' | 'star' | 'sweep' | 'mix' | 'random' | 'none';
export type ColorBy = 'face' | 'camera' | 'band' | 'depth' | 'age' | 'audio' | 'palette' | 'speed' | 'direction' | 'pointer' | 'horizontal' | 'vertical' | 'radial' | 'cycle';
export type Palette = keyof typeof PALETTES | 'custom';
export type GlyphSet = keyof typeof GLYPH_SETS | 'custom';
export type GlyphPick = 'random' | 'speed' | 'heading' | 'sequence';
export type GlyphChange = 'fixed' | 'flicker' | 'beat';
export type GlyphFont = 'mono' | 'serif' | 'sans' | 'bold';
export type GlyphRotate = 'none' | 'heading' | 'spin';

// Glyph sets. 'density' runs light → heavy so picking by speed reads as
// ASCII-art shading; 'arrows' is ordered by angle so picking by heading
// points each arrow where its particle is going.
export const GLYPH_SETS = {
  katakana: { label: 'Katakana & digits', chars: '01アイウエオカキクケコサシスセソタチツテトナニヌネノ' },
  binary: { label: 'Binary', chars: '01' },
  hex: { label: 'Hex', chars: '0123456789ABCDEF' },
  latin: { label: 'Letters', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  density: { label: 'ASCII shading', chars: '.·:-=+*#%@' },
  blocks: { label: 'Blocks', chars: '░▒▓█▀▄▌▐' },
  box: { label: 'Box lines', chars: '─│┌┐└┘├┤┬┴┼╱╲╳' },
  braille: { label: 'Braille', chars: '⠁⠃⠇⠏⠟⠿⡿⣿⠛⠶⠼⠹⠸⠴⠦⠖' },
  runes: { label: 'Runes', chars: 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ' },
  math: { label: 'Math', chars: '∑∫∂√π∞≈≠±×÷∆∇∈∀∃λΩ' },
  arrows: { label: 'Arrows', chars: '→↘↓↙←↖↑↗' },
  shapes: { label: 'Shapes', chars: '●○◆◇■□▲△★☆✦✧' },
  notes: { label: 'Music notes', chars: '♩♪♫♬♭♮♯' },
} as const;

export interface Settings {
  count: number;
  size: number;
  speed: number;
  friction: number;
  jitter: number;
  renew: number;
  flow: number;
  flowScale: number;
  flowSpeed: number;
  flowType: FlowType;
  flock: number;
  /** Crossfader position: 0 = scene A, 1 = scene B. */
  xfPos: number;
  /** New particles bud off existing ones instead of appearing anywhere. */
  budding: boolean;
  flockSep: number;
  flockAlign: number;
  flockCohesion: number;
  flockRange: number;
  space: number;
  spaceDist: number;
  shape: Shape;
  shapeText: string;
  shapeIcon: string;
  shapeGeo: string;
  shapeSolid: string;
  shapeLive: 'bars' | 'ring' | 'clock' | 'tempo';
  shapePattern: 'sunflower' | 'grid';
  shapeSeq: string;
  shapeSeqEvery: 'bar' | '2bars' | '4bars' | '8bars' | 'drop';
  shapeSeqSec: number;
  shapeSpin: number;
  imageMode: 'auto' | 'subject' | 'bright' | 'dark' | 'edges';
  camMode: CamMode;
  camMirror: boolean;
  camCentre: boolean;
  camRate: number;
  camMix: number;
  camSnap: number;
  camDepth: boolean;
  exSense: number;
  camPreview: boolean;
  camHands: CamHands;
  camHandReach: number;
  camHandForce: number;
  drawColour: 'flow' | 'finger';
  drawWidth: boolean;
  drawErase: boolean;
  gestOn: boolean;
  twoDist: 'off' | 'zoom' | 'size' | 'flow' | 'speed';
  twoAngle: 'off' | 'turn' | 'hue';
  maskFx: MaskFx;
  maskShare: number;
  gaze: 'off' | 'drift' | 'eyes';
  voice: boolean;
  poseOn: boolean;
  poseSweep: number;
  mirrorWorld: boolean;
  // Connections card: input → action links (see links.ts).
  links: string;
  // Macros: each moves a group of settings at once, relative to the scene. 0.5 = as the scene is.
  mEnergy: number;
  mOrder: number;
  mDream: number;
  mHeat: number;
  mDensity: number;
  // How Density adds and removes particles: all at once, or trickling in and out.
  densityMode: 'pop' | 'fade';
  // Play mode: settings you play on the field itself (edge faders, two fingers, wheel).
  playOn: boolean;
  playLeft: string;
  playRight: string;
  playTwo: string;
  playPinch: string;
  playWheel3: string;
  playWheel4: string;
  playWheel5: string;
  shapeSize: number;
  homeStrength: number;
  shapeCycle: number;
  entrance: 'drift' | 'formed' | 'centre' | 'sweep' | 'rain' | 'edges' | 'scatter';
  entranceTime: number;
  emitter: Emitter;
  emitMode: EmitMode;
  emitX: number;
  emitY: number;
  emitSize: number;
  emitAngle: number;
  emitRate: number;
  burstEvery: number;
  burstSize: number;
  emitOut: boolean;
  wind: number;
  windDir: number;
  wells: string;
  wellForce: number;
  wellRange: number;
  placeWell: PlaceWell;
  showWells: boolean;
  obstacles: 'none' | 'circles' | 'text' | 'body';
  obsCircles: string;
  obsRadius: number;
  obsText: string;
  obsSize: number;
  obsForce: number;
  obsPlace: boolean;
  obsShow: boolean;
  pointerMode: PointerMode;
  click: ClickMode;
  clickForce: number;
  radius: number;
  force: number;
  render: Render;
  linkDist: number;
  ribbonLen: number;
  morph: number;
  beatSnap: boolean;
  shuffleCards: boolean;
  depth: number;
  depthParallax: number;
  trail: number;
  glow: boolean;
  palette: Palette;
  colorBy: ColorBy;
  customColors: string;
  customBg: string;
  mixStyles: string;
  gravity: number;
  lifespan: number;
  sizeVar: number;
  lifeSize: LifeSize;
  lifeFade: LifeFade;
  launchSpeed: number;
  launchDir: number;
  launchSpread: number;
  edges: Edges;
  glyphSet: GlyphSet;
  glyphText: string;
  glyphPick: GlyphPick;
  glyphChange: GlyphChange;
  glyphRate: number;
  glyphFont: GlyphFont;
  glyphScale: number;
  glyphRotate: GlyphRotate;
  audioSpeed: number;
  audioFlow: number;
  audioPulse: number;
  audioBeat: BeatAction;
  audioWaveAt: WaveAt;
  audioWaveEvery: number;
  audioWaveSpeed: number;
  audioWaveReach: number;
  audioWaveForce: number;
  audioWaveWidth: number;
  audioWaveAccent: boolean;
  audioWaveFeel: 'soft' | 'punchy';
  audioWaveRings: boolean;
  audioGenre: Genre;
  audioVox: VoxMode;
  audioSync: number;
  audioKick: KickAction;
  audioSnare: SnareAction;
  audioHats: HatAction;
  audioHits: number;
  audioSub: SubAction;
  audioSubAmt: number;
  audioIntensity: number;
  audioFineTune: boolean;
  audioVibe: string;
  audioVibeLook: boolean;
  audioDrop: number;
  audioDropBuild: boolean;
  audioVj: number;
  audioVjFrom: 'mine' | 'presets' | 'shuffle';
  audioVjDrop: boolean;
  audioBands: number;
  audioHue: 'off' | 'beat' | 'bar' | 'drift' | 'drop';
  audioHueAmt: number;
  audioBright: number;
  audioCam: number;
  audioSpin: 'off' | 'sway' | 'turn' | 'step' | 'rock' | 'energy';
  audioCuts: 'off' | 'bar' | '2bars' | '4bars' | 'drop';
  audioDolly: boolean;
  audioPan: number;
  audioRoll: number;
  audioFlip: boolean;
  audioTunnel: number;
  audioTunnelTurn: 'none' | 'left' | 'right' | 'rock';
  audioKaleido: number;
  // Lens: effects on the finished frame (Look tab).
  lensMirror: 'off' | 'lr' | 'tb' | 'quad';
  lensTiles: number;
  lensZoom: number;
  lensSplit: number;
  lensGlitch: number;
  lensDots: number;
  lensMusic: number;
  lensTwirl: number;
  lensWave: number;
  lensRipple: number;
  lensFan: number;
  lensShatter: number;
  lensSlices: number;
  lensEcho: number;
  lensGlow: number;
  lensCrt: number;
  audioKaleidoDrop: boolean;
  audioEcho: number;
  audioPalEvery: number;
  audioMonoBuild: boolean;
  audioBgFlash: number;
  audioInvert: boolean;
  audioStutter: boolean;
  audioGravFlip: boolean;
  audioTrailEnergy: number;
  audioSway: number;
  audioWordsOn: boolean;
  audioWords: string;
  audioWordsEvery: 'bar' | '2bars' | '4bars' | 'drop';
  audioWordPulse: number;
  audioLetterHop: number;
  audioSnareFlash: number;
  audioSnareHop: number;
  audioHatTwinkle: number;
  audioHatShake: number;
  audioBassThrob: number;
  audioBassZoom: number;
  audioBassGlow: number;
  audioBuildScatter: number;
  audioEnergyShake: number;
  audioEnergyWords: number;
  audioNoteRipple: number;
  audioNoteHue: number;
  audioNoteHop: number;
  audioVoxGlow: number;
  audioVoxZoom: number;
  audioVoxSwell: number;
  // Rap flow reactions (syllables, pauses, flow speed, accents, pitch, rhymes).
  audioSylPush: number;
  audioSylFlash: number;
  audioSylHop: number;
  audioPauseDim: number;
  audioPauseFreeze: number;
  audioFlowSpeed: number;
  audioFlowHue: number;
  audioAccentBurst: number;
  audioAccentPunch: number;
  audioPitchLift: number;
  audioPitchTilt: number;
  audioRhymeRipple: number;
  audioRhymeHue: number;
}

// Each palette is a list of [hue, saturation, lightness] stops from the
// "calm" end to the "hot" end, plus a background. Stops run dark/cool to
// bright/warm so speed and pointer modes read as energy. Cyclic palettes
// start and end on the same colour, so direction can use them without a seam.
export interface PaletteDef {
  label: string;
  bg: readonly [number, number, number];
  stops: readonly (readonly [number, number, number])[];
  cyclic?: boolean;
}

export const PALETTES = {
  aurora: { label: 'Aurora', bg: [7, 7, 12], stops: [[200, 90, 65], [260, 85, 68], [320, 90, 66]] },
  ember: { label: 'Ember', bg: [12, 6, 4], stops: [[355, 85, 40], [10, 90, 52], [30, 95, 58], [48, 100, 70]] },
  ocean: { label: 'Ocean', bg: [3, 9, 14], stops: [[225, 80, 45], [200, 90, 55], [180, 80, 60], [165, 70, 78]] },
  sunset: { label: 'Sunset', bg: [14, 6, 14], stops: [[265, 60, 45], [320, 75, 55], [350, 85, 62], [25, 95, 62], [45, 100, 72]] },
  forest: { label: 'Forest', bg: [5, 10, 7], stops: [[160, 50, 30], [140, 55, 42], [100, 55, 52], [70, 70, 65]] },
  ice: { label: 'Ice', bg: [5, 8, 14], stops: [[220, 50, 45], [205, 70, 65], [195, 80, 82], [190, 60, 96]] },
  gold: { label: 'Gold', bg: [10, 8, 4], stops: [[30, 70, 30], [38, 80, 48], [45, 90, 62], [50, 100, 85]] },
  vapor: { label: 'Vaporwave', bg: [10, 5, 18], stops: [[280, 80, 55], [310, 90, 65], [190, 95, 62], [175, 90, 75]] },
  candy: { label: 'Candy', bg: [14, 10, 16], stops: [[330, 85, 72], [280, 70, 76], [200, 80, 74], [160, 65, 72]] },
  toxic: { label: 'Toxic', bg: [4, 8, 4], stops: [[150, 80, 30], [120, 90, 45], [90, 100, 55], [65, 100, 70]] },
  infra: { label: 'Infrared', bg: [3, 3, 8], stops: [[240, 70, 30], [280, 80, 45], [330, 90, 52], [15, 100, 55], [50, 100, 65], [60, 100, 92]] },
  neon: { label: 'Neon', bg: [6, 4, 10], stops: [[300, 100, 62], [240, 100, 66], [180, 100, 55], [300, 100, 62]], cyclic: true },
  mono: { label: 'Mono', bg: [8, 8, 8], stops: [[0, 0, 35], [0, 0, 65], [0, 0, 95]] },
  rainbow: { label: 'Rainbow', bg: [6, 6, 8], stops: [[0, 90, 62], [120, 90, 58], [240, 90, 66], [360, 90, 62]], cyclic: true },
  cosmic: { label: 'Cosmic', bg: [4, 3, 14], stops: [[250, 70, 35], [275, 75, 55], [320, 85, 68], [200, 90, 80]] },
  cyber: { label: 'Cyberpunk', bg: [10, 4, 16], stops: [[320, 100, 60], [285, 90, 62], [190, 100, 55], [55, 100, 60]] },
  tealorange: { label: 'Teal & orange', bg: [6, 10, 12], stops: [[185, 80, 45], [190, 60, 70], [30, 70, 75], [25, 95, 58]] },
  crimson: { label: 'Crimson', bg: [10, 3, 5], stops: [[345, 80, 30], [350, 85, 45], [0, 90, 58], [10, 100, 72]] },
  lavender: { label: 'Lavender', bg: [12, 10, 18], stops: [[260, 50, 60], [275, 55, 72], [300, 45, 82], [230, 50, 85]] },
  pastel: { label: 'Pastel', bg: [16, 16, 22], stops: [[350, 80, 82], [40, 85, 80], [150, 55, 78], [210, 75, 80], [270, 65, 82]], cyclic: false },
  desert: { label: 'Desert', bg: [16, 11, 8], stops: [[15, 45, 40], [25, 55, 55], [35, 60, 68], [45, 50, 82]] },
  paper: { label: 'Ink on paper', bg: [242, 238, 228], stops: [[220, 30, 12], [220, 25, 25], [215, 20, 38]] },
  blueprint: { label: 'Blueprint', bg: [18, 52, 110], stops: [[205, 60, 70], [200, 70, 85], [195, 40, 96]] },
  risograph: { label: 'Risograph', bg: [245, 240, 230], stops: [[335, 85, 55], [210, 80, 45], [45, 95, 52]] },
} satisfies Record<string, PaletteDef>;



export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

export const DEFAULTS: Settings = {
  count: 1200,
  size: 1.6,
  speed: 1,
  friction: 0.04,
  jitter: 0.05,
  renew: 0.3,
  flow: 0.3,
  flowType: 'waves',
  flock: 0,
  xfPos: 0,
  budding: false,
  flockSep: 1,
  flockAlign: 1,
  flockCohesion: 1,
  flockRange: 40,
  space: 0,
  spaceDist: 12,
  shape: 'none',
  shapeText: 'HELLO',
  shapeIcon: 'heart',
  shapeGeo: 'star5',
  shapeSolid: 'sphere',
  shapeLive: 'bars',
  shapePattern: 'sunflower',
  shapeSeq: 'heart, star, moon, HELLO',
  shapeSeqEvery: '4bars',
  shapeSeqSec: 4,
  shapeSpin: 0.3,
  imageMode: 'auto',
  camMode: 'face',
  camMirror: true,
  camCentre: true,
  camRate: 6,
  camMix: 0.6,
  camSnap: 0.7,
  camDepth: false,
  exSense: 1,
  camPreview: true,
  camHands: 'off',
  camHandReach: 140,
  camHandForce: 1,
  drawColour: 'flow',
  drawWidth: false,
  drawErase: true,
  gestOn: false,
  twoDist: 'zoom',
  twoAngle: 'turn',
  maskFx: 'none',
  maskShare: 0.3,
  gaze: 'off',
  voice: false,
  poseOn: false,
  poseSweep: 1,
  mirrorWorld: false,
  links: '',
  mEnergy: 0.5,
  mOrder: 0.5,
  mDream: 0.5,
  mHeat: 0.5,
  mDensity: 0.5,
  densityMode: 'fade',
  playOn: true,
  playLeft: 'mEnergy',
  playRight: 'mDream',
  playTwo: 'mHeat',
  playPinch: 'size',
  playWheel3: 'mOrder',
  playWheel4: 'mHeat',
  playWheel5: 'mDensity',
  shapeSize: 0.8,
  homeStrength: 1,
  shapeCycle: 0,
  entrance: 'drift',
  entranceTime: 2.5,
  emitter: 'none',
  emitMode: 'steady',
  emitX: 0.5,
  emitY: 0.5,
  emitSize: 120,
  emitAngle: 0,
  emitRate: 0.15,
  burstEvery: 2,
  burstSize: 0.25,
  emitOut: true,
  wind: 0,
  windDir: 0,
  wells: '',
  wellForce: 1,
  wellRange: 200,
  placeWell: 'off',
  showWells: true,
  obstacles: 'none',
  obsCircles: '0.3,0.42;0.52,0.62;0.72,0.38',
  obsRadius: 70,
  obsText: 'FLOW',
  obsSize: 0.6,
  obsForce: 1,
  obsPlace: true,
  obsShow: true,
  flowScale: 0.004,
  flowSpeed: 0.2,
  pointerMode: 'repel',
  click: 'gather',
  clickForce: 1,
  radius: 120,
  force: 0.6,
  render: 'dots',
  linkDist: 70,
  ribbonLen: 14,
  morph: 1,
  beatSnap: false,
  shuffleCards: false,
  depth: 0,
  depthParallax: 0.5,
  trail: 0.75,
  glow: false,
  palette: 'aurora',
  colorBy: 'palette',
  customColors: '#2b6cff,#9b5cff,#ff4fa3',
  customBg: '#07070c',
  mixStyles: 'circles,glow,sparkles,rings,glyphs,comets',
  gravity: 0,
  lifespan: 0,
  sizeVar: 0,
  lifeSize: 'none',
  lifeFade: 'edges',
  launchSpeed: 0,
  launchDir: 270,
  launchSpread: 360,
  edges: 'wrap',
  glyphSet: 'katakana',
  glyphText: 'HELLO WORLD',
  glyphPick: 'random',
  glyphChange: 'flicker',
  glyphRate: 0.01,
  glyphFont: 'mono',
  glyphScale: 1,
  glyphRotate: 'none',
  audioSpeed: 0.4,
  audioFlow: 0.5,
  audioPulse: 0.6,
  audioBeat: 'ripple',
  audioWaveAt: 'centre',
  audioWaveEvery: 1,
  audioWaveSpeed: 1,
  audioWaveReach: 1,
  audioWaveForce: 1,
  audioWaveWidth: 1,
  audioWaveAccent: true,
  audioWaveFeel: 'soft',
  audioWaveRings: false,
  audioGenre: 'general',
  audioVox: 'auto',
  audioSync: 0,
  audioKick: 'pulse',
  audioSnare: 'wave',
  audioHats: 'none',
  audioHits: 0.6,
  audioSub: 'size',
  audioSubAmt: 0.5,
  audioIntensity: 1,
  audioFineTune: false,
  audioVibe: '',
  audioVibeLook: true,
  audioDrop: 1,
  audioDropBuild: true,
  audioVj: 0,
  audioVjFrom: 'mine',
  audioVjDrop: true,
  audioBands: 0,
  audioHue: 'off',
  audioHueAmt: 30,
  audioBright: 0,
  audioCam: 0,
  audioSpin: 'off',
  audioCuts: 'off',
  audioDolly: false,
  audioPan: 0,
  audioRoll: 0,
  audioFlip: false,
  audioTunnel: 0,
  audioTunnelTurn: 'none',
  audioKaleido: 0,
  lensMirror: 'off',
  lensTiles: 0,
  lensZoom: 0,
  lensSplit: 0,
  lensGlitch: 0,
  lensDots: 0,
  lensMusic: 0.6,
  lensTwirl: 0,
  lensWave: 0,
  lensRipple: 0,
  lensFan: 0,
  lensShatter: 0,
  lensSlices: 0,
  lensEcho: 0,
  lensGlow: 0,
  lensCrt: 0,
  audioKaleidoDrop: false,
  audioEcho: 0,
  audioPalEvery: 0,
  audioMonoBuild: false,
  audioBgFlash: 0,
  audioInvert: false,
  audioStutter: false,
  audioGravFlip: false,
  audioTrailEnergy: 0,
  audioSway: 0,
  audioWordsOn: false,
  audioWords: '',
  audioWordsEvery: 'bar',
  audioWordPulse: 0,
  audioLetterHop: 0,
  audioSnareFlash: 0,
  audioSnareHop: 0,
  audioHatTwinkle: 0,
  audioHatShake: 0,
  audioBassThrob: 0,
  audioBassZoom: 0,
  audioBassGlow: 0,
  audioBuildScatter: 0,
  audioEnergyShake: 0,
  audioEnergyWords: 0,
  audioNoteRipple: 0,
  audioNoteHue: 0,
  audioNoteHop: 0,
  audioVoxGlow: 0,
  audioVoxZoom: 0,
  audioVoxSwell: 0,
  audioSylPush: 0,
  audioSylFlash: 0,
  audioSylHop: 0,
  audioPauseDim: 0,
  audioPauseFreeze: 0,
  audioFlowSpeed: 0,
  audioFlowHue: 0,
  audioAccentBurst: 0,
  audioAccentPunch: 0,
  audioPitchLift: 0,
  audioPitchTilt: 0,
  audioRhymeRipple: 0,
  audioRhymeHue: 0,
};

// Older shape names, as the new ones: the sunflower disc and the grid are
// patterns, the ring is the geometric circle.
export function upgradeShape<T extends Partial<Settings>>(p: T): T {
  const sh = p.shape as string | undefined;
  if (sh === 'sunflower' || sh === 'grid') return { ...p, shape: 'pattern', shapePattern: sh };
  if (sh === 'ring') return { ...p, shape: 'geo', shapeGeo: 'circle', shapeSpin: p.shapeSpin ?? 0 };
  return p;
}
