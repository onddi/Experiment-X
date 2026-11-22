// The palette in play: the chosen one (or a custom one) with the Saturation,
// Brightness and Background dials applied, and the colour maths for it.
import { PALETTES, hexToRgb, rgbToHsl, type PaletteDef } from './settings.ts';
import { settings } from './state.ts';

// The current palette, including a custom one built from colour pickers,
// with the Saturation, Brightness and Background dials applied.
export function basePal(): PaletteDef {
  if (settings.palette !== 'custom') return PALETTES[settings.palette];
  return {
    label: 'Custom',
    bg: hexToRgb(settings.customBg),
    stops: settings.customColors.split(',').filter(Boolean).map((hex) => rgbToHsl(hexToRgb(hex))),
  };
}

export let palCache: { key: string; def: PaletteDef } | null = null;

export function pal(): PaletteDef {
  const S = settings;
  if (S.palSat === 1 && S.palLight === 0 && S.palBg === 'own') return basePal();
  const key = `${S.palette}|${S.palette === 'custom' ? S.customColors + S.customBg : ''}|${S.palSat}|${S.palLight}|${S.palBg}`;
  if (palCache?.key === key) return palCache.def;
  const b = basePal();
  const light = S.palBg === 'light';
  const stops = b.stops.map(([h, sat, l]): [number, number, number] => {
    let L = Math.max(4, Math.min(97, l + S.palLight * 35));
    // On a light background the colours run dark to mid, so they still show.
    if (light) L = Math.max(10, Math.min(62, 12 + (100 - L) * 0.55));
    return [h, Math.min(100, sat * S.palSat), L];
  });
  const mid = b.stops[Math.floor(b.stops.length / 2)] ?? [0, 0, 50];
  const rgbOf = (h: number, sat: number, l: number) => hslToRgb(h, sat, l).map(Math.round) as [number, number, number];
  const bg = S.palBg === 'black' ? [0, 0, 0] as const : S.palBg === 'tinted' ? rgbOf(mid[0], 45, 9) : light ? rgbOf(mid[0], 30, 93) : b.bg;
  const def: PaletteDef = { ...b, bg, stops };
  palCache = { key, def };
  return def;
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const k = (n2: number) => (n2 + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n2: number) => l - a * Math.max(-1, Math.min(k(n2) - 3, Math.min(9 - k(n2), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export type Rgb = [number, number, number];
