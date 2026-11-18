// Fonts for every text the field draws: the Text shape, glyph particles and
// word obstacles all pick from this one list. The first six are the device's
// own; the rest come from Google Fonts, fetched the first time they're needed.

type FontDef = { label: string; w: string; family: string; gf?: string };

export const FONT_LIST = {
  bold: { label: 'Heavy', w: '800', family: 'system-ui, sans-serif' },
  sans: { label: 'Sans', w: '500', family: 'system-ui, sans-serif' },
  serif: { label: 'Serif', w: '700', family: 'Georgia, "Times New Roman", serif' },
  mono: { label: 'Mono', w: '700', family: 'ui-monospace, Menlo, Consolas, monospace' },
  round: { label: 'Rounded', w: '800', family: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif' },
  script: { label: 'Script', w: '700', family: '"Brush Script MT", "Segoe Script", cursive' },
  bebas: { label: 'Bebas Neue', w: '400', family: '"Bebas Neue", sans-serif', gf: 'Bebas+Neue' },
  anton: { label: 'Anton', w: '400', family: 'Anton, sans-serif', gf: 'Anton' },
  archivo: { label: 'Archivo Black', w: '400', family: '"Archivo Black", sans-serif', gf: 'Archivo+Black' },
  bungee: { label: 'Bungee', w: '400', family: 'Bungee, sans-serif', gf: 'Bungee' },
  righteous: { label: 'Righteous', w: '400', family: 'Righteous, sans-serif', gf: 'Righteous' },
  fredoka: { label: 'Fredoka', w: '700', family: 'Fredoka, sans-serif', gf: 'Fredoka:wght@700' },
  orbitron: { label: 'Orbitron', w: '900', family: 'Orbitron, sans-serif', gf: 'Orbitron:wght@900' },
  monoton: { label: 'Monoton', w: '400', family: 'Monoton, sans-serif', gf: 'Monoton' },
  playfair: { label: 'Playfair', w: '900', family: '"Playfair Display", serif', gf: 'Playfair+Display:wght@900' },
  abril: { label: 'Abril Fatface', w: '400', family: '"Abril Fatface", serif', gf: 'Abril+Fatface' },
  cinzel: { label: 'Cinzel', w: '700', family: 'Cinzel, serif', gf: 'Cinzel:wght@700' },
  fraktur: { label: 'Fraktur', w: '400', family: '"UnifrakturMaguntia", serif', gf: 'UnifrakturMaguntia' },
  pacifico: { label: 'Pacifico', w: '400', family: 'Pacifico, cursive', gf: 'Pacifico' },
  lobster: { label: 'Lobster', w: '400', family: 'Lobster, cursive', gf: 'Lobster' },
  caveat: { label: 'Caveat', w: '700', family: 'Caveat, cursive', gf: 'Caveat:wght@700' },
  marker: { label: 'Marker', w: '400', family: '"Permanent Marker", cursive', gf: 'Permanent+Marker' },
  creepster: { label: 'Creepster', w: '400', family: 'Creepster, cursive', gf: 'Creepster' },
  space: { label: 'Space Mono', w: '700', family: '"Space Mono", monospace', gf: 'Space+Mono:wght@700' },
  vt323: { label: 'Terminal', w: '400', family: 'VT323, monospace', gf: 'VT323' },
  pixel: { label: 'Pixel', w: '400', family: '"Press Start 2P", monospace', gf: 'Press+Start+2P' },
} satisfies Record<string, FontDef>;

export type FontId = keyof typeof FONT_LIST;
const LIST = FONT_LIST as Record<string, FontDef>;
export const fontDef = (id: string): FontDef => LIST[id] ?? FONT_LIST.bold;
export const FONT_OPTS: [string, string][] = Object.entries(LIST).map(([id, f]) => [id, f.label]);
/** The canvas font string, at this size. */
export const fontCss = (id: string, px: number) => {
  const f = fontDef(id);
  return `${f.w} ${px}px ${f.family}`;
};
/** For a list or a label shown in the font itself. */
export const fontStyle = (id: string) => {
  const f = fontDef(id);
  return `font-family: ${f.family}; font-weight: ${f.w}`;
};

// One stylesheet for all the web fonts: it only declares them, so a font's
// file is fetched when something is drawn in it (a menu preview, the field).
let cssAdded = false;
export function addFontCss() {
  if (cssAdded) return;
  cssAdded = true;
  const fams = Object.values(LIST).flatMap((f) => (f.gf ? [`family=${f.gf}`] : []));
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap`;
  document.head.append(link);
}

const ready = new Set<string>();
const loading = new Set<string>();
/**
 * True when the font can be drawn now. A web font not loaded yet is fetched,
 * and `then` runs once it's in (draw again then; until then the fallback shows).
 */
export function fontReady(id: string, then: () => void): boolean {
  const f = fontDef(id);
  if (!f.gf || ready.has(id)) return true;
  if (loading.has(id)) return false;
  loading.add(id);
  addFontCss();
  const css = fontCss(id, 40);
  const tryLoad = (left: number) => {
    document.fonts
      .load(css)
      .then((got) => {
        // The stylesheet may not be in yet: nothing matched, so try again shortly.
        if (!got.length && left > 0) return void setTimeout(() => tryLoad(left - 1), 300);
        ready.add(id);
        loading.delete(id);
        if (got.length) then();
      })
      .catch(() => {
        ready.add(id);
        loading.delete(id);
      });
  };
  tryLoad(20);
  return false;
}
