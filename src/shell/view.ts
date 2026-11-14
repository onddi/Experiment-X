/**
 * A "view" is what X-Frame shows: one or more experiments stacked as layers.
 * It lives in the URL hash so any combination can be bookmarked or shared:
 *
 *   #/particle-field                                   one experiment
 *   #/audio-timeline+particle-field                    a base and one layer on top
 *   #/audio-timeline+particle-field?1=full,screen,90&input=0
 *
 * Layer 0 is the base and always fills the stage. For every other layer, the
 * query holds `<index>=<placement>,<blend>,<opacity>[,<size>]`:
 *   placement  full (stacked over the base) | top | bottom | left | right (docked strip)
 *   blend      a CSS mix-blend-mode, e.g. normal, screen, lighten, multiply
 *   opacity    0–100
 *   size       docked strips only: % of the stage they take (default 30)
 * `input=<index>` picks which stacked layer gets the mouse (docked strips
 * always do). It defaults to the top-most stacked layer.
 *
 * `link=<from>><to>:<source>:<key0>|<key1>|…` (repeatable) is a Link: when
 * <from> reports an item change on <source>, X-Frame tells <to> to play the
 * scene with key<index> (an empty key: the default, the scene on number key
 * n % 10 for item n, or else the n-th scene the layer lists).
 */

export type Placement = 'full' | 'top' | 'bottom' | 'left' | 'right';

export const PLACEMENTS: [Placement, string][] = [
  ['full', 'Stacked'],
  ['bottom', 'Docked bottom'],
  ['top', 'Docked top'],
  ['left', 'Docked left'],
  ['right', 'Docked right'],
];

export const BLENDS = [
  'normal', 'screen', 'lighten', 'plus-lighter', 'multiply', 'darken', 'overlay',
  'soft-light', 'hard-light', 'difference', 'exclusion', 'color-dodge', 'luminosity',
] as const;

export interface Layer {
  slug: string;
  placement: Placement;
  blend: string;
  opacity: number;
  size: number;
}

export interface View {
  layers: Layer[];
  /** Index of the stacked layer that gets mouse input; -1 = top-most stacked. */
  input: number;
  links?: Link[];
}

/** Items → scenes: one layer's item changes ('item.change') pick another layer's scene ('scene.select'). */
export interface Link {
  from: string;
  to: string;
  /** Which of the publisher's item sources to follow, e.g. 'main' or '0'. */
  source: string;
  /** Scene key per item index; '' = the default for that item. */
  keys: string[];
}

/** The scene key an item plays when nobody picked one: item 1 → '1' … item 10 → '0'. */
export const defaultSceneKey = (index: number) => String((index + 1) % 10);

function parseLink(text: string): Link | null {
  const m = text.match(/^([^>]+)>([^:]+):([^:]*):(.*)$/);
  if (!m) return null;
  const keys = m[4] ? m[4].split('|').map((k) => { try { return decodeURIComponent(k); } catch { return ''; } }) : [];
  return { from: m[1], to: m[2], source: m[3], keys };
}

function linkText(l: Link): string {
  let keys = l.keys.map((k) => encodeURIComponent(k));
  while (keys.length && !keys[keys.length - 1]) keys = keys.slice(0, -1);
  return `${l.from}>${l.to}:${l.source}:${keys.join('|')}`;
}

export const newLayer = (slug: string, placement: Placement = 'full'): Layer => ({
  slug,
  placement,
  blend: placement === 'full' ? 'screen' : 'normal',
  opacity: 100,
  size: 30,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function parseHash(hash: string): View | null {
  const m = hash.match(/^#\/([^?#]+)(?:\?(.*))?$/);
  if (!m) return null;
  const slugs = m[1].split('+').map(decodeURIComponent).filter(Boolean);
  const q = new URLSearchParams(m[2] ?? '');
  const layers = slugs.map((slug, i) => {
    const layer = newLayer(slug);
    if (i === 0) return { ...layer, blend: 'normal' };
    const [placement, blend, opacity, size] = (q.get(String(i)) ?? '').split(',');
    if (PLACEMENTS.some(([p]) => p === placement)) layer.placement = placement as Placement;
    if (blend && (BLENDS as readonly string[]).includes(blend)) layer.blend = blend;
    else if (layer.placement !== 'full') layer.blend = 'normal';
    if (opacity && !isNaN(+opacity)) layer.opacity = clamp(+opacity, 0, 100);
    if (size && !isNaN(+size)) layer.size = clamp(+size, 10, 80);
    return layer;
  });
  const input = q.has('input') ? Number(q.get('input')) : -1;
  const links = q.getAll('link').map(parseLink).filter((l): l is Link => !!l);
  return { layers, input: Number.isInteger(input) ? input : -1, links };
}

export function toHash(view: View): string {
  const slugs = view.layers.map((l) => encodeURIComponent(l.slug)).join('+');
  const q = new URLSearchParams();
  view.layers.forEach((l, i) => {
    if (i === 0) return;
    const parts = [l.placement, l.blend, String(Math.round(l.opacity))];
    if (l.placement !== 'full') parts.push(String(Math.round(l.size)));
    q.set(String(i), parts.join(','));
  });
  if (view.input >= 0) q.set('input', String(view.input));
  for (const l of view.links ?? []) q.append('link', linkText(l));
  const query = q.toString().replace(/%2C/g, ',');
  return `#/${slugs}${query ? `?${query}` : ''}`;
}

/** Index of the stacked layer that should get mouse input. */
export function inputLayer(view: View): number {
  const stacked = view.layers.map((l, i) => (i === 0 || l.placement === 'full' ? i : -1)).filter((i) => i >= 0);
  return stacked.includes(view.input) ? view.input : stacked[stacked.length - 1];
}

export interface Rect { left: number; top: number; width: number; height: number }

/**
 * Where each layer goes, in % of the stage. Docked strips are carved off the
 * edges in layer order; the base and stacked layers share what's left.
 */
export function layout(view: View): Rect[] {
  let free: Rect = { left: 0, top: 0, width: 100, height: 100 };
  const rects: (Rect | null)[] = view.layers.map(() => null);
  view.layers.forEach((l, i) => {
    if (i === 0 || l.placement === 'full') return;
    const s = l.size / 100;
    const f = free;
    if (l.placement === 'top' || l.placement === 'bottom') {
      const h = f.height * s;
      rects[i] = { left: f.left, width: f.width, height: h, top: l.placement === 'top' ? f.top : f.top + f.height - h };
      free = { ...f, height: f.height - h, top: l.placement === 'top' ? f.top + h : f.top };
    } else {
      const w = f.width * s;
      rects[i] = { top: f.top, height: f.height, width: w, left: l.placement === 'left' ? f.left : f.left + f.width - w };
      free = { ...f, width: f.width - w, left: l.placement === 'left' ? f.left + w : f.left };
    }
  });
  return rects.map((r) => r ?? free);
}
