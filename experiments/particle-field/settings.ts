// Settings: every option's type and its default value. Pure data, no DOM.
import type { DrumKit } from './drums.ts';
import type { FontId } from './fonts.ts';
import type { FillPattern } from './patterns.ts';
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
// Spawning: when a particle makes new ones.
export type SpawnOn = 'none' | 'death' | 'hit' | 'trail' | 'beat';
// Collisions: what is solid, and what a particle does when it hits it.
export type HitWalls = 'none' | 'floor' | 'box' | 'bowl';
export type HitDo = 'bounce' | 'slide' | 'stick' | 'pile';
export type ClickMode = 'gather' | 'ripple' | 'implode' | 'emit' | 'shockwave' | 'none' | 'implodeHold' | 'thumb';
export type Render = 'mixed' | 'dots' | 'circles' | 'glow' | 'bokeh' | 'rings' | 'sparkles' | 'arrows' | 'streaks' | 'comets' | 'ribbons' | 'glyphs' | 'links' | 'squares' | 'shards' | 'stars' | 'petals' | 'crosses' | 'neon' | 'flare' | 'embers' | 'hair' | 'threads' | 'ink' | 'lightning' | 'halftone' | 'bigpixels' | 'bubbles' | 'marbles' | 'liquid' | 'cells' | 'contours' | 'smoke' | 'glass' | 'sand' | 'lava' | 'terrain' | 'caustics' | 'aurora' | 'marbling' | 'rain' | 'slime' | 'sprite';
export type KickAction = 'pulse' | 'wave' | 'both' | 'pump' | 'tick' | 'spawn' | 'none';
export type SnareAction = 'swirl' | 'wave' | 'flash' | 'none';
export type HatAction = 'sparkle' | 'none';
export type SubAction = 'size' | 'flow' | 'speed' | 'none';
export type WaveAt = 'centre' | 'pointer' | 'random' | 'orbit' | 'mirror' | 'corners';
export type BeatAction = 'ripple' | 'shockwave' | 'implode' | 'twist' | 'star' | 'sweep' | 'mix' | 'random' | 'none';
export type ColorBy = 'face' | 'camera' | 'image' | 'band' | 'depth' | 'age' | 'audio' | 'palette' | 'speed' | 'direction' | 'pointer' | 'horizontal' | 'vertical' | 'radial' | 'cycle' | 'spectrum';
export type Palette = keyof typeof PALETTES | 'custom';
export type GlyphSet = keyof typeof GLYPH_SETS | 'custom';
export type GlyphPick = 'random' | 'speed' | 'heading' | 'size' | 'sequence';
export type GlyphChange = 'fixed' | 'flicker' | 'beat';
export type GlyphFont = FontId;
export type GlyphRotate = 'none' | 'heading' | 'spin';

// Glyph sets. 'density' runs light → heavy so picking by speed reads as
// ASCII-art shading ('rings' too, and both suit picking by size); 'arrows' is ordered by angle so picking by heading
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
  greek: { label: 'Greek', chars: 'αβγδεζηθλμξπσφψω' },
  hiragana: { label: 'Hiragana', chars: 'あいうえおかきくけこさしすせそ' },
  hangul: { label: 'Hangul', chars: '가나다라마바사아자차카타파하' },
  tifinagh: { label: 'Ancient signs', chars: 'ⵀⵁⵂⵃⵄⵅⵉⵊⵋⵌⵍ' },
  zodiac: { label: 'Zodiac', chars: '♈♉♊♋♌♍♎♏♐♑♒♓' },
  planets: { label: 'Planets', chars: '☉☽☿♀♁♂♃♄♅♆' },
  cards: { label: 'Cards & dice', chars: '♠♥♦♣⚀⚁⚂⚃⚄⚅' },
  chess: { label: 'Chess', chars: '♔♕♖♗♘♙♚♛♜♝♞♟' },
  weather: { label: 'Weather', chars: '☀☁☂☃☄★☾❄⚡☔' },
  flowers: { label: 'Hearts & flowers', chars: '♡♥❣❦❧✿❀❁✾✽' },
  tech: { label: 'Circuit', chars: '⌁⌂⌘⏚⎔⌬⍟⏻⏦⎍' },
  rings: { label: 'Dots & rings', chars: '·∘○◎◉●' },
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
  shapeFont: FontId; // the Text, Live and Sequence shapes' words
  shapeIcon: string;
  shapeGeo: string;
  shapeSolid: string;
  shapeLive: 'bars' | 'ring' | 'clock' | 'tempo';
  specLayout: 'centre' | 'floor' | 'mirror' | 'line';
  specBands: number;
  specGap: number;
  specRise: number;
  specFall: number;
  specGain: number;
  specPeaks: boolean;
  shapePattern: 'sunflower' | 'grid' | FillPattern;
  patScale: number;
  patForm: number;
  patVary: number;
  patSeed: number;
  shapeSeq: string;
  shapeSeqEvery: 'bar' | '2bars' | '4bars' | '8bars' | 'drop';
  shapeSeqSec: number;
  drawOutline: boolean;
  shapeSpin: number;
  imageMode: 'auto' | 'subject' | 'bright' | 'dark' | 'edges';
  imageRate: number;
  modelClip: number;
  modelSpeed: number;
  modelBeat: boolean;
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
  // Animated settings (see animate.ts), as JSON text.
  anim: string;
  // Turns every colour round the colour wheel (degrees).
  hueShift: number;
  palSat: number;
  palLight: number;
  palBg: 'own' | 'black' | 'tinted' | 'light';
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
  // Touch gestures on the field (phones and tablets).
  tapTwice: 'drop' | 'burst' | 'shuffle' | 'freeze' | 'none';
  twistTwo: string;
  holdTwo: 'freeze' | 'none';
  swipeThree: 'vibe' | 'scene' | 'none';
  swipeOne: 'scenes' | 'none';
  /** Particle sound: the field plays notes (0 = off). */
  sndVol: number;
  sndScale: 'pentatonic' | 'major' | 'minor' | 'dorian' | 'blues' | 'japanese' | 'whole';
  sndKey: 'auto' | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
  sndTimbre: 'colour' | 'lounge' | 'world' | 'fairy' | 'temple' | 'woods' | 'rain' | 'retro' | 'breeze' | 'marimba' | 'bell' | 'pluck' | 'glass' | 'kalimba' | 'epiano' | 'vibes' | 'musicbox' | 'harp' | 'steel' | 'flute' | 'synth' | 'koto';
  sndProg: 'still' | 'calm' | 'pop' | 'drift' | 'mystic' | 'custom';
  sndProgText: string;
  sndChordMove: 'bars' | 'energy' | 'burst' | 'song';
  sndChordBars: number;
  sndLength: number;
  sndDyn: number;
  sndBend: number;
  sndSwing: number;
  sndArp: number;
  sndEcho: number;
  sndSweep: number;
  sndField: number;
  sndChorus: number;
  sndDepth: number;
  sndBass: number;
  sndBassSound: import('./sound.ts').BassSound;
  sndDrums: number;
  sndKit: DrumKit;
  /** A beat from the library: genre id ('' = the field plays the drums) and which of its beats. */
  sndGenre: string;
  // The sound style picked on the Sound page ('genre/preset'); '' when none.
  sndStyle: string;
  sndBeat: number;
  sndVary: number;
  sndFills: number;
  sndFollow: number;
  sndBeatChange: number;
  sndPadSound: import('./sound.ts').PadSound;
  sndPadPump: number;
  sndPadTone: number;
  sndPadWidth: number;
  sndPadBreath: number;
  sndPadGlide: number;
  sndPadHold: boolean;
  sndPadOct: 'low' | 'mid' | 'high';
  sndBassTone: number;
  sndBassMove: number;
  sndBassPattern: 'beat' | 'hold' | 'pump' | 'walk' | 'arp' | 'offbeat';
  sndBassWalk: number;
  sndBassOct: 'sub' | 'low' | 'mid';
  sndBassGlide: number;
  sndBassLen: number;
  sndBassGhost: number;
  sndAttack: number;
  sndBright: number;
  sndDrive: number;
  sndLofi: number;
  sndPing: boolean;
  sndMove: boolean; // the particle drums drive the Music reactions
  sndBassDrive: boolean; // the particle bass drives the bass reactions
  sndNoteDrive: boolean; // the particle melody lights the note and voice reactions
  sndPhaser: number;
  sndTrem: number;
  sndTremMode: 'volume' | 'pan';
  sndShimmer: number;
  sndGlue: number;
  sndLowEnd: number;
  sndKickPunch: number;
  sndSub: number;
  sndTape: number;
  sndGrid: string;
  sndTempo: number;
  sndStrings: number;
  sndStringCount: number;
  sndOctave: number;
  sndRange: number;
  sndSeq: number;
  sndAccents: number;
  sndAccScene: boolean;
  sndAccShape: boolean;
  sndAccBirth: boolean;
  sndAccBurst: boolean;
  sndAccVoice: import('./sound.ts').Voice;
  sndHits: number;
  sndGrainSound: import('./sound.ts').GrainSound;
  sndGrainRate: number;
  sndGrainLen: number;
  sndHitSound: import('./sound.ts').HitSound;
  sndSeqSound: import('./sound.ts').HitSound;
  sndSeqRate: '1' | '2' | '4';
  sndSeqNotes: number;
  sndSeqSens: number;
  sndSongForm: string; // Song mode's arrangement (sound.ts SONGS)
  // Sound quality, each 0 = off: Mix polish (ducking, EQ, warmth, glue, width,
  // limiter), Unison (pads and leads as detuned stacks), Wavetable motion,
  // Humanise (timing, accents, ghosts, inversions).
  sndPolishAmt: number;
  sndUnisonAmt: number;
  sndWaveAmt: number;
  sndHumanAmt: number;
  sndVerb: 'classic' | 'room' | 'hall' | 'plate'; // the reverb's kind (Reverb sets how much)
  sndSongVary: number; // Song mode: how much each section changes the beat and the picture (0 = only the mix)
  sndSeqStyle: 'chord' | 'strum' | 'up' | 'down' | 'bounce' | 'random';
  sndSeqVary: number;
  sndSeqTick: boolean;
  sndScanDir: 'across' | 'down' | 'bounce' | 'radar';
  sndScanSound: import('./sound.ts').HitSound;
  sndScanNotes: number;
  sndDrone: number;
  sndGrain: number;
  sndScan: number;
  sndScanSecs: number;
  sndTouch: number;
  sndMBusy: number;
  sndMBright: number;
  sndMSpace: number;
  sndMGroove: number;
  sndTouchSound: 'theremin' | 'lead' | 'pad' | 'organ' | 'marimba' | 'bell' | 'pluck' | 'glass' | 'kalimba' | 'epiano' | 'vibes' | 'musicbox' | 'harp' | 'steel' | 'flute' | 'synth' | 'koto';
  sndTouchMode: 'glide' | 'notes' | 'chord';
  sndTouchGlide: number;
  sndTouchVib: number;
  sndTouchAxis: 'up' | 'across';
  sndTouchOct: number;
  sndReverb: number;
  sndMusic: 'free' | 'room' | 'along';
  /** Draw the strings, the step column and the scanline faintly. */
  sndShow: boolean;
  tapThree: 'tempo' | 'drop' | 'shuffle' | 'none';
  thumbWall: boolean;
  playWheel3: string;
  playWheel4: string;
  playWheel5: string;
  /** Field knobs beyond A–E: setting keys, comma-separated. */
  knobsMore: string;
  /** Knobs picked in the overview: while set, they replace the knob set. */
  knobsPick: string;
  /** Knobs chosen for the scene playing (what it's about): comma-separated keys. */
  knobsScene: string;
  /** The knobs follow the scene (its own knobs) instead of your set. */
  knobsFollow: boolean;
  /** Number keys 1–8: hold to turn that field knob, or play My scenes. */
  numberKeys: 'knobs' | 'mine';
  adaptScreen: boolean;
  adaptCount: number; // how far the count follows the screen, 1 = as measured
  adaptSize: number; // how far size and reaches follow it // scenes made on another screen size are fitted to this one
  sceneW: number; // the screen (CSS px) a saved scene was made on, 0 = unknown
  sceneH: number;
  shapeSize: number;
  /** Where the shape sits: offset from the centre as a share of the screen. */
  shapeX: number;
  shapeY: number;
  /** The shape's angle on screen, in degrees. */
  shapeAngle: number;
  /** 3D shapes: tilt towards you and which way they face, in degrees. */
  shapeTilt: number;
  /** Drag on the field turns a solid shape (it keeps spinning when let go). */
  shapeDrag: boolean;
  /** Light and shade on solid shapes (0 = flat). */
  solidLight: number;
  shapeFacing: number;
  /** The whole picture (projection fit): offset, zoom, rotation and mirroring. Not part of scenes. */
  viewX: number;
  viewY: number;
  viewZoom: number;
  viewRot: number;
  viewFlipH: boolean;
  viewFlipV: boolean;
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
  obstacles: 'none' | 'circles' | 'text' | 'wall' | 'ring' | 'icon' | 'body';
  obsIcon: string;
  obsX: number;
  obsY: number;
  obsAngle: number;
  obsFont: FontId;
  obsStyle: 'faint' | 'solid' | 'outline' | 'glow' | 'neon' | 'glass' | 'shadow' | 'stripes' | 'dots';
  obsColour: 'white' | 'scene' | 'palette' | 'dark' | 'gold' | 'amber' | 'red' | 'pink' | 'violet' | 'blue' | 'ice' | 'mint';
  obsPulse: number; // 0 … 1, brightens with the music
  obsAlpha: number;
  ob2Kind: 'none' | 'text' | 'wall' | 'ring' | 'circle' | 'icon'; // obstacle 2
  ob2Icon: string;
  ob2Text: string;
  ob2Font: Settings['obsFont'];
  ob2Size: number;
  ob2Angle: number;
  ob2X: number;
  ob2Y: number;
  ob2Spin: number;
  ob2Drift: number;
  ob2Style: Settings['obsStyle'];
  ob2Colour: Settings['obsColour'];
  ob2Alpha: number;
  ob3Kind: 'none' | 'text' | 'wall' | 'ring' | 'circle' | 'icon'; // obstacle 3
  ob3Icon: string;
  ob3Text: string;
  ob3Font: Settings['obsFont'];
  ob3Size: number;
  ob3Angle: number;
  ob3X: number;
  ob3Y: number;
  ob3Spin: number;
  ob3Drift: number;
  ob3Style: Settings['obsStyle'];
  ob3Colour: Settings['obsColour'];
  ob3Alpha: number;
  ob4Kind: 'none' | 'text' | 'wall' | 'ring' | 'circle' | 'icon'; // obstacle 4
  ob4Icon: string;
  ob4Text: string;
  ob4Font: Settings['obsFont'];
  ob4Size: number;
  ob4Angle: number;
  ob4X: number;
  ob4Y: number;
  ob4Spin: number;
  ob4Drift: number;
  ob4Style: Settings['obsStyle'];
  ob4Colour: Settings['obsColour'];
  ob4Alpha: number;
  obsSpin: number; // degrees a second
  obsDrift: number; // 0 … 1
  obsInside: boolean; // keep particles inside the shapes
  topScene: string; // '' = no top layer
  topOpacity: number;
  topBlend: 'normal' | 'screen' | 'lighten' | 'plus-lighter' | 'difference' | 'overlay' | 'soft-light' | 'hard-light' | 'color-dodge' | 'color-burn' | 'multiply' | 'darken' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';
  topPointer: boolean;
  topSaved: string; // the top layer's own settings (JSON), kept with a saved scene
  botScene: string; // '' = no bottom layer
  botOpacity: number;
  botBlend: Settings['topBlend']; // how the field sits on it
  botPointer: boolean;
  botSaved: string;
  obsCircles: string;
  obsRadius: number;
  obsText: string;
  obsSize: number;
  obsForce: number;
  obsPlace: boolean;
  obsShow: boolean;
  spawnOn: SpawnOn;
  spawnCount: number;
  spawnSpeed: number;
  spawnLife: number;
  spawnSize: number;
  spawnTone: number;
  spawnShare: number;
  spawnChain: boolean;
  // Trails: from every moving particle, or only the lowest part of the shape (an exhaust).
  spawnFrom: 'moving' | 'bottom';
  hitWalls: HitWalls;
  hitDo: HitDo;
  hitBounce: number;
  hitFriction: number;
  hitFloor: number;
  hitObstacles: boolean;
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
  /** Far particles fade into the background. */
  depthFog: number;
  /** Far particles go soft and out of focus. */
  depthSoft: number;
  /** Tilting the phone moves the parallax and turns solids. */
  tiltLook: boolean;
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
  spriteCols: number;
  spriteRows: number;
  // Which row of a sheet plays: 0 = each particle plays its own row.
  spriteRow: number;
  spriteFps: number;
  spriteTint: boolean;
  spriteTurn: 'none' | 'heading' | 'spin';
  spriteScale: number;
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
  // FX (GPU looks over the finished frame).
  gfxBloom: number;
  gfxSpread: number;
  gfxSplit: number;
  gfxRays: number;
  gfxFlare: number;
  gfxTint: 'white' | 'warm' | 'cool' | 'pink' | 'green' | 'gold' | 'amber' | 'red' | 'rose' | 'violet' | 'blue' | 'ice' | 'teal' | 'mint' | 'lime';
  gfxBloomKick: boolean;
  gfxFeedback: 'off' | 'tunnel' | 'smear' | 'mirror' | 'melt' | 'spiral' | 'spread';
  gfxZoom: number;
  gfxSpin: number;
  gfxFlow: number;
  gfxLength: number;
  gfxLens: 'off' | 'glass' | 'shock' | 'kaleido' | 'liquid' | 'fisheye' | 'sort' | 'twirl' | 'pinch' | 'bulge' | 'tilt' | 'mirrorx' | 'mirrory' | 'quad';
  gfxLensSize: number;
  gfxBend: number;
  gfxShock: number;
  gfxSlices: number;
  gfxLensMix: number;
  gfxFollow: 'finger' | 'wander' | 'centre';
  gfxCount: number;
  gfxSurface: 'off' | 'led' | 'halftone' | 'ascii' | 'crt' | 'thermal' | 'mosaic' | 'stitch' | 'lego' | 'vhs' | 'oil' | 'neon';
  gfxCell: number;
  gfxSurfMix: number;
  gfxGrade: 'off' | 'sunset' | 'ocean' | 'acid' | 'mono' | 'scene';
  gfxGradeAmt: number;
  gfxGrain: number;
  gfxVignette: number;
  gfxPoster: number;
  gfxHueCycle: number;
  gfxInvertDrop: boolean;
  gfxDisplace: number;
  gfxHaze: number;
  gfxEcho: number;
  gfxEchoDelay: number;
  gfxEchoSpread: number;
  gfxGlitch: number;
  gfxGlitchOn: 'snare' | 'kick' | 'random' | 'always';
  gfxGlitchBlock: number;
  gfxLightBy: 'kick' | 'snare' | 'bass' | 'voice' | 'off';
  gfxFeedBy: 'kick' | 'snare' | 'bass' | 'voice' | 'off';
  /** How hard the music moves light and grade (0–1). */
  gfxLightAmt: number;
  /** How hard the music moves feedback and echoes (0–1). */
  gfxFeedAmt: number;
  /** How hard the music moves lenses and displace (0–1). */
  gfxLensAmt: number;
  /** How hard the music moves the surface (0–1). */
  gfxSurfAmt: number;
  gfxLensBy: 'kick' | 'snare' | 'bass' | 'voice' | 'off';
  gfxSurfBy: 'kick' | 'snare' | 'bass' | 'voice' | 'off';
  gfxKick: number;
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
  audioNoteGlide: number; // a rising melody lifts the field
  audioNoteFollow: number; // the view drifts to the note's side
  audioNoteTrails: number; // held notes leave longer trails
  audioHatJitter: number; // hats make the particles shiver
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
  audioCrash: number; // a burst from the centre on each crash
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
  /** The vibe it's listed under. */
  group?: PalGroup;
}
export const PAL_GROUPS = ['Warm', 'Cool', 'Neon', 'Earthy', 'Soft', 'Duotone', 'Film & print'] as const;
export type PalGroup = (typeof PAL_GROUPS)[number];

export const PALETTES = {
  aurora: { label: 'Aurora', group: 'Cool', bg: [7, 7, 12], stops: [[200, 90, 65], [260, 85, 68], [320, 90, 66]] },
  ember: { label: 'Ember', group: 'Warm', bg: [12, 6, 4], stops: [[355, 85, 40], [10, 90, 52], [30, 95, 58], [48, 100, 70]] },
  ocean: { label: 'Ocean', group: 'Cool', bg: [3, 9, 14], stops: [[225, 80, 45], [200, 90, 55], [180, 80, 60], [165, 70, 78]] },
  sunset: { label: 'Sunset', group: 'Warm', bg: [14, 6, 14], stops: [[265, 60, 45], [320, 75, 55], [350, 85, 62], [25, 95, 62], [45, 100, 72]] },
  forest: { label: 'Forest', group: 'Earthy', bg: [5, 10, 7], stops: [[160, 50, 30], [140, 55, 42], [100, 55, 52], [70, 70, 65]] },
  ice: { label: 'Ice', group: 'Cool', bg: [5, 8, 14], stops: [[220, 50, 45], [205, 70, 65], [195, 80, 82], [190, 60, 96]] },
  gold: { label: 'Gold', group: 'Warm', bg: [10, 8, 4], stops: [[30, 70, 30], [38, 80, 48], [45, 90, 62], [50, 100, 85]] },
  vapor: { label: 'Vaporwave', group: 'Neon', bg: [10, 5, 18], stops: [[280, 80, 55], [310, 90, 65], [190, 95, 62], [175, 90, 75]] },
  candy: { label: 'Candy', group: 'Soft', bg: [14, 10, 16], stops: [[330, 85, 72], [280, 70, 76], [200, 80, 74], [160, 65, 72]] },
  toxic: { label: 'Toxic', group: 'Neon', bg: [4, 8, 4], stops: [[150, 80, 30], [120, 90, 45], [90, 100, 55], [65, 100, 70]] },
  infra: { label: 'Infrared', group: 'Neon', bg: [3, 3, 8], stops: [[240, 70, 30], [280, 80, 45], [330, 90, 52], [15, 100, 55], [50, 100, 65], [60, 100, 92]] },
  neon: { label: 'Neon', group: 'Neon', bg: [6, 4, 10], stops: [[300, 100, 62], [240, 100, 66], [180, 100, 55], [300, 100, 62]], cyclic: true },
  mono: { label: 'Mono', group: 'Duotone', bg: [8, 8, 8], stops: [[0, 0, 35], [0, 0, 65], [0, 0, 95]] },
  rainbow: { label: 'Rainbow', group: 'Neon', bg: [6, 6, 8], stops: [[0, 90, 62], [120, 90, 58], [240, 90, 66], [360, 90, 62]], cyclic: true },
  cosmic: { label: 'Cosmic', group: 'Cool', bg: [4, 3, 14], stops: [[250, 70, 35], [275, 75, 55], [320, 85, 68], [200, 90, 80]] },
  cyber: { label: 'Cyberpunk', group: 'Neon', bg: [10, 4, 16], stops: [[320, 100, 60], [285, 90, 62], [190, 100, 55], [55, 100, 60]] },
  tealorange: { label: 'Teal & orange', group: 'Duotone', bg: [6, 10, 12], stops: [[185, 80, 45], [190, 60, 70], [30, 70, 75], [25, 95, 58]] },
  crimson: { label: 'Crimson', group: 'Warm', bg: [10, 3, 5], stops: [[345, 80, 30], [350, 85, 45], [0, 90, 58], [10, 100, 72]] },
  lavender: { label: 'Lavender', group: 'Soft', bg: [12, 10, 18], stops: [[260, 50, 60], [275, 55, 72], [300, 45, 82], [230, 50, 85]] },
  pastel: { label: 'Pastel', group: 'Soft', bg: [16, 16, 22], stops: [[350, 80, 82], [40, 85, 80], [150, 55, 78], [210, 75, 80], [270, 65, 82]], cyclic: false },
  desert: { label: 'Desert', group: 'Earthy', bg: [16, 11, 8], stops: [[15, 45, 40], [25, 55, 55], [35, 60, 68], [45, 50, 82]] },
  paper: { label: 'Ink on paper', group: 'Film & print', bg: [242, 238, 228], stops: [[220, 30, 12], [220, 25, 25], [215, 20, 38]] },
  blueprint: { label: 'Blueprint', group: 'Film & print', bg: [18, 52, 110], stops: [[205, 60, 70], [200, 70, 85], [195, 40, 96]] },
  risograph: { label: 'Risograph', group: 'Film & print', bg: [245, 240, 230], stops: [[335, 85, 55], [210, 80, 45], [45, 95, 52]] },
  // Warm
  peach: { label: 'Peach', group: 'Warm', bg: [16, 8, 8], stops: [[350, 60, 45], [10, 75, 62], [25, 90, 72], [38, 100, 84]] },
  lava: { label: 'Lava', group: 'Warm', bg: [8, 2, 2], stops: [[0, 0, 12], [0, 90, 35], [15, 100, 50], [40, 100, 62], [55, 100, 85]] },
  autumn: { label: 'Autumn', group: 'Warm', bg: [12, 7, 4], stops: [[0, 60, 32], [18, 75, 45], [32, 85, 52], [45, 80, 62]] },
  magma: { label: 'Magma', group: 'Warm', bg: [6, 3, 10], stops: [[270, 60, 22], [320, 70, 38], [355, 85, 52], [25, 100, 62], [50, 100, 80]] },
  // Cool
  deepsea: { label: 'Deep sea', group: 'Cool', bg: [1, 4, 10], stops: [[230, 85, 25], [215, 90, 40], [195, 95, 50], [175, 100, 60]] },
  glacier: { label: 'Glacier', group: 'Cool', bg: [8, 12, 18], stops: [[210, 25, 45], [200, 35, 65], [190, 45, 82], [185, 30, 95]] },
  twilight: { label: 'Twilight', group: 'Cool', bg: [6, 5, 16], stops: [[240, 55, 32], [255, 50, 48], [290, 40, 62], [330, 55, 72]] },
  mint: { label: 'Mint', group: 'Cool', bg: [4, 12, 11], stops: [[175, 55, 35], [165, 60, 52], [155, 65, 68], [140, 70, 84]] },
  // Neon
  laser: { label: 'Laser', group: 'Neon', bg: [2, 2, 6], stops: [[120, 100, 50], [180, 100, 50], [300, 100, 58], [120, 100, 50]], cyclic: true },
  acid: { label: 'Acid', group: 'Neon', bg: [6, 4, 8], stops: [[280, 100, 55], [320, 100, 60], [75, 100, 55], [60, 100, 65]] },
  synthwave: { label: 'Synthwave', group: 'Neon', bg: [12, 4, 24], stops: [[260, 85, 45], [300, 95, 58], [330, 100, 62], [40, 100, 62], [55, 100, 70]] },
  club: { label: 'Club', group: 'Neon', bg: [4, 2, 10], stops: [[230, 100, 58], [270, 100, 62], [330, 100, 60], [0, 100, 62]] },
  // Earthy
  moss: { label: 'Moss', group: 'Earthy', bg: [6, 8, 4], stops: [[90, 30, 22], [85, 35, 35], [75, 40, 48], [60, 45, 62]] },
  terracotta: { label: 'Terracotta', group: 'Earthy', bg: [14, 8, 6], stops: [[10, 45, 32], [15, 55, 45], [25, 55, 58], [35, 45, 74]] },
  olive: { label: 'Olive', group: 'Earthy', bg: [9, 9, 5], stops: [[65, 35, 25], [60, 40, 38], [50, 45, 52], [40, 50, 70]] },
  clay: { label: 'Clay', group: 'Earthy', bg: [12, 10, 9], stops: [[20, 18, 35], [25, 22, 50], [30, 25, 65], [35, 30, 80]] },
  jungle: { label: 'Jungle', group: 'Earthy', bg: [2, 8, 5], stops: [[160, 70, 20], [140, 65, 32], [110, 60, 42], [80, 75, 50], [50, 90, 58]] },
  // Soft
  sorbet: { label: 'Sorbet', group: 'Soft', bg: [16, 12, 14], stops: [[5, 75, 76], [30, 85, 76], [55, 80, 78], [100, 55, 76]] },
  blush: { label: 'Blush', group: 'Soft', bg: [18, 12, 14], stops: [[340, 40, 62], [350, 50, 72], [10, 60, 80], [25, 70, 88]] },
  seafoam: { label: 'Seafoam', group: 'Soft', bg: [10, 16, 16], stops: [[200, 45, 66], [180, 45, 72], [160, 45, 78], [140, 40, 86]] },
  dawn: { label: 'Dawn', group: 'Soft', bg: [14, 12, 20], stops: [[230, 40, 62], [280, 35, 72], [330, 50, 78], [30, 70, 82]] },
  // Duotone
  pinkblue: { label: 'Pink & blue', group: 'Duotone', bg: [6, 6, 14], stops: [[220, 90, 58], [250, 50, 70], [320, 60, 74], [330, 95, 64]] },
  purplegold: { label: 'Purple & gold', group: 'Duotone', bg: [8, 4, 12], stops: [[270, 70, 42], [275, 50, 60], [42, 60, 66], [45, 95, 58]] },
  redcyan: { label: 'Red & cyan', group: 'Duotone', bg: [6, 6, 8], stops: [[185, 100, 50], [185, 40, 75], [355, 40, 75], [355, 100, 58]] },
  limeviolet: { label: 'Lime & violet', group: 'Duotone', bg: [6, 4, 10], stops: [[265, 85, 55], [265, 40, 72], [80, 50, 72], [80, 100, 55]] },
  // Film & print
  sepia: { label: 'Sepia', group: 'Film & print', bg: [18, 12, 8], stops: [[30, 35, 30], [32, 40, 48], [36, 45, 66], [40, 55, 84]] },
  noir: { label: 'Noir', group: 'Film & print', bg: [5, 5, 5], stops: [[0, 0, 22], [0, 0, 50], [0, 0, 82], [355, 90, 52]] },
  kodachrome: { label: 'Kodachrome', group: 'Film & print', bg: [10, 9, 8], stops: [[205, 55, 38], [190, 40, 55], [45, 80, 58], [12, 80, 52], [48, 95, 76]] },
  polaroid: { label: 'Polaroid', group: 'Film & print', bg: [238, 233, 222], stops: [[200, 40, 32], [345, 45, 45], [30, 60, 45], [170, 35, 35]] },
  cyanotype: { label: 'Cyanotype', group: 'Film & print', bg: [14, 42, 92], stops: [[212, 40, 58], [208, 45, 76], [200, 35, 90], [195, 20, 98]] },
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
  shapeFont: 'bold',
  shapeIcon: 'heart',
  shapeGeo: 'star5',
  shapeSolid: 'sphere',
  shapeLive: 'bars',
  specLayout: 'centre',
  specBands: 40,
  specGap: 0.4,
  specRise: 0.5,
  specFall: 0.12,
  specGain: 1,
  specPeaks: false,
  shapePattern: 'sunflower',
  patScale: 1,
  patForm: 0.5,
  patVary: 0.5,
  patSeed: 0,
  shapeSeq: 'heart, star, moon, HELLO',
  shapeSeqEvery: '4bars',
  shapeSeqSec: 4,
  drawOutline: false,
  shapeSpin: 0.3,
  imageMode: 'auto',
  imageRate: 10,
  modelClip: 1,
  modelSpeed: 1,
  modelBeat: false,
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
  anim: '',
  hueShift: 0,
  palSat: 1,
  palLight: 0,
  palBg: 'own',
  mEnergy: 0.5,
  mOrder: 0.5,
  mDream: 0.5,
  mHeat: 0.5,
  mDensity: 0.5,
  densityMode: 'fade',
  playOn: false,
  playLeft: 'mEnergy',
  playRight: 'mDream',
  playTwo: 'speed',
  playPinch: 'size',
  tapTwice: 'drop',
  twistTwo: 'lensTwirl',
  holdTwo: 'freeze',
  swipeThree: 'vibe',
  swipeOne: 'none',
  sndVol: 0,
  sndScale: 'pentatonic',
  sndKey: 'auto',
  sndTimbre: 'colour',
  sndProg: 'drift',
  sndProgText: '1 5 6 4',
  sndChordMove: 'bars',
  sndChordBars: 2,
  sndLength: 1,
  sndDyn: 0,
  sndBend: 0,
  sndSwing: 0,
  sndArp: 0,
  sndEcho: 0,
  sndSweep: 0,
  sndField: 0.5,
  sndChorus: 0,
  sndDepth: 0.6,
  sndBass: 0,
  sndBassSound: 'synth',
  sndDrums: 0,
  sndKit: 'soft',
  sndGenre: '',
  sndStyle: '',
  sndBeat: 0,
  sndVary: 0.25,
  sndFills: 8,
  sndFollow: 0.4,
  sndBeatChange: 0,
  sndPadSound: 'soft',
  sndPadPump: 0,
  sndPadTone: 0,
  sndPadWidth: 0.5,
  sndPadBreath: 0.35,
  sndPadGlide: 0.5,
  sndPadHold: false,
  sndPadOct: 'mid',
  sndBassTone: 0,
  sndBassMove: 0.3,
  sndBassPattern: 'beat',
  sndBassWalk: 0.5,
  sndBassOct: 'low',
  sndBassGlide: 0,
  sndBassLen: 1,
  sndBassGhost: 0,
  sndAttack: 0,
  sndBright: 0,
  sndDrive: 0,
  sndLofi: 0,
  sndPing: false,
  sndMove: false,
  sndBassDrive: false,
  sndNoteDrive: false,
  sndPhaser: 0,
  sndTrem: 0,
  sndTremMode: 'volume',
  sndShimmer: 0,
  sndGlue: 0,
  sndLowEnd: 0,
  sndKickPunch: 0,
  sndSub: 0,
  sndTape: 0,
  sndGrid: '',
  sndTempo: 90,
  sndStrings: 0.7,
  sndStringCount: 6,
  sndOctave: 0,
  sndRange: 2,
  sndSeq: 0,
  sndAccents: 0.6,
  sndAccScene: true,
  sndAccShape: true,
  sndAccBirth: true,
  sndAccBurst: false,
  sndAccVoice: 'bell',
  sndHits: 0.5,
  sndGrainSound: 'dust',
  sndGrainRate: 0.5,
  sndGrainLen: 0.5,
  sndHitSound: 'same',
  sndSeqSound: 'same',
  sndSeqRate: '1',
  sndSeqNotes: 0,
  sndSeqSens: 0.5,
  sndSongForm: 'classic',
  sndSongVary: 0.5,
  sndPolishAmt: 0,
  sndUnisonAmt: 0,
  sndWaveAmt: 0,
  sndHumanAmt: 0,
  sndVerb: 'classic',
  sndSeqStyle: 'chord',
  sndSeqVary: 0,
  sndSeqTick: true,
  sndScanDir: 'across',
  sndScanSound: 'same',
  sndScanNotes: 4,
  sndDrone: 0.4,
  sndGrain: 0,
  sndScan: 0,
  sndScanSecs: 4,
  sndTouch: 0.6,
  sndMBusy: 0.5,
  sndMBright: 0.5,
  sndMSpace: 0.5,
  sndMGroove: 0.5,
  sndTouchSound: 'theremin',
  sndTouchMode: 'glide',
  sndTouchGlide: 0.15,
  sndTouchVib: 0.3,
  sndTouchAxis: 'up',
  sndTouchOct: 0,
  sndReverb: 0.45,
  sndMusic: 'room',
  sndShow: true,
  tapThree: 'tempo',
  thumbWall: true,
  playWheel3: 'mOrder',
  playWheel4: 'mHeat',
  playWheel5: 'mDensity',
  knobsMore: '',
  knobsPick: '',
  knobsScene: '',
  knobsFollow: true,
  numberKeys: 'knobs',
  adaptScreen: true,
  adaptCount: 1,
  adaptSize: 1,
  sceneW: 0,
  sceneH: 0,
  shapeSize: 0.8,
  shapeX: 0,
  shapeY: 0,
  shapeAngle: 0,
  shapeTilt: 0,
  shapeDrag: true,
  solidLight: 0.6,
  shapeFacing: 0,
  viewX: 0,
  viewY: 0,
  viewZoom: 1,
  viewRot: 0,
  viewFlipH: false,
  viewFlipV: false,
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
  obsIcon: 'heart',
  obsCircles: '0.3,0.42;0.52,0.62;0.72,0.38',
  obsRadius: 70,
  obsText: 'FLOW',
  obsSize: 0.6,
  obsX: 0.5,
  obsY: 0.5,
  obsAngle: 0,
  obsFont: 'bold',
  obsStyle: 'faint',
  obsColour: 'white',
  obsPulse: 0,
  obsAlpha: 0.5,
  ob2Kind: 'none',
  ob2Icon: 'star',
  ob2Text: 'Hello',
  ob2Font: 'bold',
  ob2Size: 0.4,
  ob2Angle: 0,
  ob2X: 0.5,
  ob2Y: 0.25,
  ob2Spin: 0,
  ob2Drift: 0,
  ob2Style: 'faint',
  ob2Colour: 'white',
  ob2Alpha: 0.5,
  ob3Kind: 'none',
  ob3Icon: 'moon',
  ob3Text: 'World',
  ob3Font: 'bold',
  ob3Size: 0.4,
  ob3Angle: 0,
  ob3X: 0.5,
  ob3Y: 0.75,
  ob3Spin: 0,
  ob3Drift: 0,
  ob3Style: 'faint',
  ob3Colour: 'white',
  ob3Alpha: 0.5,
  ob4Kind: 'none',
  ob4Icon: 'spark',
  ob4Text: 'Flow',
  ob4Font: 'bold',
  ob4Size: 0.4,
  ob4Angle: 0,
  ob4X: 0.25,
  ob4Y: 0.5,
  ob4Spin: 0,
  ob4Drift: 0,
  ob4Style: 'faint',
  ob4Colour: 'white',
  ob4Alpha: 0.5,
  obsSpin: 0,
  obsDrift: 0,
  obsInside: false,
  topScene: '',
  topOpacity: 1,
  topBlend: 'normal',
  topPointer: true,
  topSaved: '',
  botScene: '',
  botOpacity: 1,
  botBlend: 'normal',
  botPointer: true,
  botSaved: '',
  obsForce: 1,
  obsPlace: true,
  obsShow: true,
  spawnOn: 'none',
  spawnCount: 8,
  spawnSpeed: 2.5,
  spawnLife: 1.2,
  spawnSize: 0.6,
  spawnTone: 0.15,
  spawnShare: 0.4,
  spawnChain: false,
  spawnFrom: 'moving',
  hitWalls: 'none',
  hitDo: 'bounce',
  hitBounce: 0.55,
  hitFriction: 0.2,
  hitFloor: 0.92,
  hitObstacles: false,
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
  depthFog: 0,
  depthSoft: 0,
  tiltLook: false,
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
  spriteCols: 0,
  spriteRows: 0,
  spriteRow: 0,
  spriteFps: 10,
  spriteTint: true,
  spriteTurn: 'heading',
  spriteScale: 4,
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
  audioVibeLook: false,
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
  gfxBloom: 0,
  gfxSpread: 0.55,
  gfxSplit: 0,
  gfxRays: 0,
  gfxFlare: 0,
  gfxTint: 'white',
  gfxBloomKick: false,
  gfxFeedback: 'off',
  gfxZoom: 0.5,
  gfxSpin: 0.35,
  gfxFlow: 1,
  gfxLength: 0.94,
  gfxLens: 'off',
  gfxLensSize: 0.8,
  gfxBend: 0.6,
  gfxShock: 1,
  gfxSlices: 6,
  gfxLensMix: 1,
  gfxFollow: 'finger',
  gfxCount: 1,
  gfxSurface: 'off',
  gfxCell: 9,
  gfxSurfMix: 1,
  gfxGrade: 'off',
  gfxGradeAmt: 0.8,
  gfxGrain: 0,
  gfxVignette: 0,
  gfxPoster: 0,
  gfxHueCycle: 0,
  gfxInvertDrop: false,
  gfxDisplace: 0,
  gfxHaze: 0,
  gfxEcho: 0,
  gfxEchoDelay: 6,
  gfxEchoSpread: 0.3,
  gfxGlitch: 0,
  gfxGlitchOn: 'snare',
  gfxGlitchBlock: 0.5,
  gfxLightBy: 'kick',
  gfxFeedBy: 'kick',
  gfxLightAmt: 1,
  gfxFeedAmt: 1,
  gfxLensAmt: 1,
  gfxSurfAmt: 1,
  gfxLensBy: 'kick',
  gfxSurfBy: 'kick',
  gfxKick: 0.6,
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
  audioNoteGlide: 0,
  audioNoteFollow: 0,
  audioNoteTrails: 0,
  audioHatJitter: 0,
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
  audioCrash: 0.6,
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
