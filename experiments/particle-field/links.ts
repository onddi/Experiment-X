// Connections: link any input (a moment or a dial) to any action or amount.
//
// Inputs come in two shapes, whatever produces them:
// - Moments: something happened (a kick, a blink, a fist, a jump).
// - Dials: something is this strong right now (bass, mouth openness, how far
//   apart your hands are), 0..1.
// Every input gives a level 0..1 each frame; moments also say when they fire.
// A dial "fires" when it rises past its mark, so a smile can be a moment too.
//
// A connection is stored in a scene as text: `src[+when]>act[@amount]`,
// joined with ';'. e.g. `kick+fist>explode;smile>hue@0.7`.

export type SourceKind = 'moment' | 'dial' | 'held';
export type SourceDef = { id: string; label: string; group: string; kind: SourceKind; needs: 'audio' | 'face' | 'hands' | 'pose' | 'pointer'; hi?: number; hold?: number };

export const SOURCES: SourceDef[] = [
  { id: 'kick', label: 'Kick', group: 'Music', kind: 'moment', needs: 'audio' },
  { id: 'snare', label: 'Snare', group: 'Music', kind: 'moment', needs: 'audio' },
  { id: 'hat', label: 'Hi-hat', group: 'Music', kind: 'moment', needs: 'audio' },
  { id: 'bar', label: 'New bar', group: 'Music', kind: 'moment', needs: 'audio' },
  { id: 'drop', label: 'Drop', group: 'Music', kind: 'moment', needs: 'audio' },
  { id: 'bass', label: 'Bass', group: 'Music', kind: 'dial', needs: 'audio', hi: 0.7 },
  { id: 'mid', label: 'Mids', group: 'Music', kind: 'dial', needs: 'audio', hi: 0.7 },
  { id: 'high', label: 'Highs', group: 'Music', kind: 'dial', needs: 'audio', hi: 0.7 },
  { id: 'loud', label: 'Loudness', group: 'Music', kind: 'dial', needs: 'audio', hi: 0.7 },
  { id: 'pitch', label: 'Pitch (singing)', group: 'Music', kind: 'dial', needs: 'audio', hi: 0.7 },
  { id: 'build', label: 'Build-up', group: 'Music', kind: 'dial', needs: 'audio', hi: 0.6 },
  { id: 'mouth', label: 'Open mouth', group: 'Face', kind: 'dial', needs: 'face', hi: 0.6 },
  { id: 'smile', label: 'Smile', group: 'Face', kind: 'dial', needs: 'face', hi: 0.7 },
  { id: 'brows', label: 'Raise eyebrows', group: 'Face', kind: 'dial', needs: 'face', hi: 0.6 },
  { id: 'blink', label: 'Blink', group: 'Face', kind: 'dial', needs: 'face', hi: 0.55 },
  { id: 'wink', label: 'Wink', group: 'Face', kind: 'dial', needs: 'face', hi: 0.5 },
  { id: 'pucker', label: 'Pucker', group: 'Face', kind: 'dial', needs: 'face', hi: 0.6 },
  { id: 'tilt', label: 'Head tilt', group: 'Face', kind: 'dial', needs: 'face', hi: 0.5 },
  { id: 'faceX', label: 'Face left ↔ right', group: 'Face', kind: 'dial', needs: 'face', hi: 0.8 },
  { id: 'faceY', label: 'Face low ↔ high', group: 'Face', kind: 'dial', needs: 'face', hi: 0.8 },
  { id: 'fist', label: 'Fist ✊', group: 'Hands', kind: 'held', needs: 'hands', hold: 150 },
  { id: 'palm', label: 'Open palm ✋', group: 'Hands', kind: 'held', needs: 'hands', hold: 150 },
  { id: 'victory', label: 'Peace sign ✌️', group: 'Hands', kind: 'held', needs: 'hands', hold: 150 },
  { id: 'thumbUp', label: 'Thumbs up 👍', group: 'Hands', kind: 'held', needs: 'hands', hold: 150 },
  { id: 'thumbDown', label: 'Thumbs down 👎', group: 'Hands', kind: 'held', needs: 'hands', hold: 150 },
  { id: 'point', label: 'Point up ☝️', group: 'Hands', kind: 'held', needs: 'hands', hold: 150 },
  { id: 'love', label: 'Rock on 🤟', group: 'Hands', kind: 'held', needs: 'hands', hold: 150 },
  { id: 'handsApart', label: 'Hands apart', group: 'Hands', kind: 'dial', needs: 'hands', hi: 0.7 },
  { id: 'handsAngle', label: 'Hands tilted', group: 'Hands', kind: 'dial', needs: 'hands', hi: 0.7 },
  { id: 'handHeight', label: 'Hand height', group: 'Hands', kind: 'dial', needs: 'hands', hi: 0.75 },
  { id: 'handX', label: 'Hand left ↔ right', group: 'Hands', kind: 'dial', needs: 'hands', hi: 0.8 },
  { id: 'jump', label: 'Jump', group: 'Body', kind: 'moment', needs: 'pose' },
  { id: 'armsUp', label: 'Arms up', group: 'Body', kind: 'dial', needs: 'pose', hi: 0.6 },
  { id: 'armsWide', label: 'Arms wide', group: 'Body', kind: 'dial', needs: 'pose', hi: 0.7 },
  { id: 'lean', label: 'Lean left ↔ right', group: 'Body', kind: 'dial', needs: 'pose', hi: 0.8 },
  { id: 'press', label: 'Tap / click', group: 'Pointer', kind: 'moment', needs: 'pointer' },
  { id: 'pointerX', label: 'Pointer left ↔ right', group: 'Pointer', kind: 'dial', needs: 'pointer', hi: 0.8 },
  { id: 'pointerY', label: 'Pointer low ↔ high', group: 'Pointer', kind: 'dial', needs: 'pointer', hi: 0.8 },
];

// What a connection does. Moments fire once; "while" acts as long as the
// input is high; amounts follow the input's level.
export type ActKind = 'moment' | 'while' | 'amount';
export type ActionDef = { id: string; label: string; kind: ActKind };
export const ACTIONS: ActionDef[] = [
  { id: 'explode', label: 'Explode', kind: 'moment' },
  { id: 'ripple', label: 'Ripple', kind: 'moment' },
  { id: 'shockwave', label: 'Shockwave', kind: 'moment' },
  { id: 'implode', label: 'Implode', kind: 'moment' },
  { id: 'scatter', label: 'Scatter', kind: 'moment' },
  { id: 'colours', label: 'New colours', kind: 'moment' },
  { id: 'warm', label: 'Warm colours', kind: 'moment' },
  { id: 'flash', label: 'Flash', kind: 'moment' },
  { id: 'scene', label: 'Next scene (same family)', kind: 'moment' },
  { id: 'mine', label: 'Next of my scenes', kind: 'moment' },
  { id: 'look', label: 'Next face look', kind: 'moment' },
  { id: 'save', label: 'Save the scene to My scenes', kind: 'moment' },
  { id: 'clear', label: 'Clear the drawing', kind: 'moment' },
  { id: 'gather', label: 'Gather', kind: 'while' },
  { id: 'freeze', label: 'Freeze', kind: 'while' },
  { id: 'size', label: 'Particle size', kind: 'amount' },
  { id: 'flow', label: 'Flow', kind: 'amount' },
  { id: 'speed', label: 'Speed', kind: 'amount' },
  { id: 'hue', label: 'Colour shift', kind: 'amount' },
  { id: 'roll', label: 'Roll the view', kind: 'amount' },
  { id: 'zoom', label: 'Zoom', kind: 'amount' },
  { id: 'emit', label: 'Stream from the mouth', kind: 'amount' },
  { id: 'energy', label: 'Macro: Energy', kind: 'amount' },
  { id: 'order', label: 'Macro: Order', kind: 'amount' },
  { id: 'dream', label: 'Macro: Dream', kind: 'amount' },
  { id: 'heat', label: 'Macro: Heat', kind: 'amount' },
  { id: 'density', label: 'Macro: Density', kind: 'amount' },
  { id: 'xfade', label: 'Crossfader (A → B)', kind: 'amount' },
];

export type Link = { src: string; when: string; act: string; amt: number };

export const sourceDef = (id: string) => SOURCES.find((s) => s.id === id);
export const actionDef = (id: string) => ACTIONS.find((a) => a.id === id);

export function parseLinks(text: string): Link[] {
  const out: Link[] = [];
  for (const part of text.split(';')) {
    const m = /^([A-Za-z]+)(?:\+([A-Za-z]+))?>([A-Za-z]+)(?:@(-?[\d.]+))?$/.exec(part.trim());
    if (!m) continue;
    const [, src, when = '', act, amt] = m;
    if (!sourceDef(src) || !actionDef(act) || (when && !sourceDef(when))) continue;
    out.push({ src, when, act, amt: amt === undefined ? 0.6 : Math.max(-1, Math.min(1, Number(amt) || 0)) });
  }
  return out;
}

export function formatLinks(list: Link[]): string {
  return list
    .map((l) => `${l.src}${l.when ? `+${l.when}` : ''}>${l.act}${actionDef(l.act)?.kind === 'amount' ? `@${+l.amt.toFixed(2)}` : ''}`)
    .join(';');
}

// What a source needs running (camera tracking, sound).
export function linkNeeds(list: Link[]) {
  const need = { audio: false, face: false, hands: false, pose: false, pointer: false };
  for (const l of list) for (const id of [l.src, l.when]) if (id) need[sourceDef(id)!.needs] = true;
  return need;
}

// `signed`: a level with a direction (-1..1), used to roll the view (head tilt).
export type Signal = { level: number; fire?: boolean; x?: number; y?: number; signed?: number };
export type Amounts = { size: number; flow: number; speed: number; hue: number; roll: number; zoom: number; emit: number };
// Macro offsets (-0.5..0.5) on top of the Macros card's sliders.
export type MacroPush = { energy: number; order: number; dream: number; heat: number; density: number; xfade: number };
export type LinkOut = {
  fired: { act: string; src: string; x?: number; y?: number }[];
  gather: boolean;
  freeze: boolean;
  amounts: Amounts;
  macros: MacroPush;
};

// How far an amount goes at full level and full strength.
const SPAN: Amounts = { size: 1.5, flow: 3, speed: 2, hue: 180, roll: 45, zoom: 0.8, emit: 1 };

// Runs the connections each frame: fires moments, holds "while" actions,
// and eases each amount towards the input's level.
export class LinkRunner {
  list: Link[] = [];
  private text = '';
  private state: { on: boolean; since: number; at: number; v: number }[] = [];
  private heldSince: Record<string, number> = {};
  levels: Record<string, number> = {};
  out: LinkOut = { fired: [], gather: false, freeze: false, amounts: { size: 1, flow: 1, speed: 1, hue: 0, roll: 0, zoom: 1, emit: 0 }, macros: { energy: 0, order: 0, dream: 0, heat: 0, density: 0, xfade: 0 } };

  sync(text: string) {
    if (text === this.text) return;
    this.text = text;
    this.list = parseLinks(text);
    this.state = this.list.map(() => ({ on: false, since: 0, at: 0, v: 0 }));
  }

  // Whether an input counts as "on": above its mark (held signs: held long enough).
  private isOn(id: string, s: Signal, now: number, was: boolean) {
    const def = sourceDef(id)!;
    if (def.kind === 'moment') return !!s.fire;
    const hi = def.hi ?? 0.5;
    const on = was ? s.level > hi * 0.6 : s.level > hi;
    if (def.kind !== 'held') return on;
    if (!on) {
      delete this.heldSince[id];
      return false;
    }
    this.heldSince[id] ??= now;
    return now - this.heldSince[id] >= (def.hold ?? 0);
  }

  step(signal: (id: string) => Signal, now: number) {
    const out: LinkOut = { fired: [], gather: false, freeze: false, amounts: { size: 0, flow: 0, speed: 0, hue: 0, roll: 0, zoom: 0, emit: 0 }, macros: { energy: 0, order: 0, dream: 0, heat: 0, density: 0, xfade: 0 } };
    const cache: Record<string, Signal> = {};
    const sig = (id: string) => (cache[id] ??= signal(id));
    this.levels = {};
    this.list.forEach((l, k) => {
      const st = this.state[k];
      const s = sig(l.src);
      this.levels[l.src] = s.level;
      const gate = !l.when || sig(l.when).level > (sourceDef(l.when)!.hi ?? 0.5) * 0.6;
      const kind = actionDef(l.act)!.kind;
      if (kind === 'amount') {
        // Moments as amounts: their level is a short envelope (e.g. the kick's pulse).
        const lv = l.act === 'roll' && s.signed !== undefined ? s.signed : s.level;
        st.v += ((gate ? lv : 0) - st.v) * 0.3;
        if (l.act in out.macros) out.macros[l.act as keyof MacroPush] += st.v * l.amt * 0.5;
        else out.amounts[l.act as keyof Amounts] += st.v * l.amt;
        return;
      }
      const was = st.on;
      const on = this.isOn(l.src, s, now, was);
      st.on = on;
      if (kind === 'while') {
        if (on && gate) out[l.act as 'gather' | 'freeze'] = true;
        return;
      }
      // Moments: once per rise, with a short rest so a flickery input can't machine-gun.
      const rest = sourceDef(l.src)!.kind === 'moment' ? 120 : 500;
      if (on && !was && gate && now - st.at > rest) {
        st.at = now;
        out.fired.push({ act: l.act, src: l.src, x: s.x, y: s.y });
      }
    });
    const a = out.amounts;
    out.amounts = {
      size: Math.max(0.15, 1 + a.size * SPAN.size),
      flow: Math.max(0, 1 + a.flow * SPAN.flow),
      speed: Math.max(0.1, 1 + a.speed * SPAN.speed),
      hue: a.hue * SPAN.hue,
      roll: a.roll * SPAN.roll,
      zoom: Math.max(0.5, 1 + a.zoom * SPAN.zoom),
      emit: Math.max(0, a.emit),
    };
    this.out = out;
    return out;
  }
}

// Ready-made connections to start from.
export const LINK_EXAMPLES: [string, string][] = [
  ['Kick → bigger', 'kick>size@0.6'],
  ['Bass → flow', 'bass>flow@0.7'],
  ['Pitch → colour', 'pitch>hue@0.8'],
  ['Smile → colour', 'smile>hue@0.7'],
  ['Hands apart → zoom', 'handsApart>zoom@0.7'],
  ['Kick + fist → explode', 'kick+fist>explode'],
  ['Palm → gather', 'palm>gather'],
  ['Jump → shockwave', 'jump>shockwave'],
  ['Loudness → Energy', 'loud>energy@0.8'],
  ['Smile → Heat', 'smile>heat@0.8'],
];

// --- old per-input menus -------------------------------------------------------------
// Expressions, hand signs and the jump used to have their own settings
// (exMouth…, gFist…, poseJump). They are connections now; this turns old
// scenes and saved settings into connections. Old defaults included.
const OLD_EX: [string, string, string][] = [
  ['exMouth', 'mouth', 'explode'], ['exBlink', 'blink', 'colours'], ['exSmile', 'smile', 'warm'], ['exBrows', 'brows', 'ripple'],
  ['exPucker', 'pucker', 'gather'], ['exWink', 'wink', 'look'], ['exTilt', 'tilt', 'roll'],
];
const OLD_G: [string, string, string][] = [
  ['gFist', 'fist', 'explode'], ['gPalm', 'palm', 'freeze'], ['gPoint', 'point', 'off'], ['gThumbUp', 'thumbUp', 'save'],
  ['gThumbDown', 'thumbDown', 'off'], ['gVictory', 'victory', 'preset'], ['gLove', 'love', 'shockwave'],
];
// How strong an old "amount" was, as a connection strength.
const OLD_AMT: Record<string, number> = { flow: 0.8, size: 0.6, speed: 0.8, hue: 1, roll: 1, emit: 1 };
export const LEGACY_KEYS = ['camTriggers', 'poseJump', ...OLD_EX.map(([k]) => k), ...OLD_G.map(([k]) => k)];

export function legacyToLinks(p: Record<string, unknown>): Link[] {
  const out: Link[] = [];
  const add = (src: string, act: string) => {
    if (act === 'off') return;
    if (act === 'preset') act = 'scene';
    if (!actionDef(act)) return;
    out.push({ src, when: '', act, amt: OLD_AMT[act] ?? 0.6 });
  };
  if (p.camTriggers === true) for (const [k, src, def] of OLD_EX) add(src, String(p[k] ?? def));
  if (p.gestOn === true) for (const [k, src, def] of OLD_G) add(src, String(p[k] ?? def));
  if (p.poseOn === true) add('jump', String(p.poseJump ?? 'explode'));
  return out;
}

// Join two connection lists, without repeating a connection.
export function mergeLinks(a: string, b: string) {
  const seen = new Set<string>();
  const list = [...parseLinks(a), ...parseLinks(b)].filter((l) => {
    const k = formatLinks([l]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return formatLinks(list);
}

// Old settings (a scene, saved settings, one of your scenes) → current ones.
export function migrateLegacy<T extends Record<string, unknown>>(p: T): T {
  if (!LEGACY_KEYS.some((k) => k in p)) return p;
  const q: Record<string, unknown> = { ...p };
  const conv = formatLinks(legacyToLinks(p));
  for (const k of LEGACY_KEYS) delete q[k];
  if (conv) q.links = mergeLinks(String(p.links ?? ''), conv);
  return q as T;
}
