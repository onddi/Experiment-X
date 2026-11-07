// Image themes. Each theme is a set of groups; a grid cell shows one group and
// its carousel steps through that group's photos.

export interface ThemeImage {
  url: string;
  /** Mean luminance 0-255, measured when the photos were picked. */
  lum: number;
}

export interface ThemeGroup {
  /** Latin name, shown as the label. */
  name: string;
  images: ThemeImage[];
}

export interface Theme {
  title: string;
  groups: ThemeGroup[];
}

const files = import.meta.glob<string>('./images/four-elements/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Mean luminance per photo; used to even out exposure across the set.
const LUM: Record<string, number> = {
  'fire-1': 43, 'fire-2': 45, 'fire-3': 42, 'fire-4': 21, 'fire-5': 21, 'fire-6': 75, 'fire-7': 41, 'fire-8': 38,
  'water-1': 145, 'water-2': 81, 'water-3': 89, 'water-4': 162, 'water-5': 122, 'water-6': 140, 'water-7': 127, 'water-8': 82,
  'earth-1': 132, 'earth-2': 124, 'earth-3': 157, 'earth-4': 121, 'earth-5': 94, 'earth-6': 79, 'earth-7': 79, 'earth-8': 57,
  'air-1': 45, 'air-2': 117, 'air-3': 79, 'air-4': 39, 'air-5': 63, 'air-6': 142, 'air-7': 58, 'air-8': 109,
};

function group(name: string, prefix: string): ThemeGroup {
  const images: ThemeImage[] = [];
  for (let i = 1; i <= 8; i++) {
    const key = `${prefix}-${i}`;
    const url = files[`./images/four-elements/${key}.webp`];
    if (url) images.push({ url, lum: LUM[key] ?? 100 });
  }
  return { name, images };
}

export const THEMES: Record<string, Theme> = {
  'four-elements': {
    title: 'Four Elements',
    // Order matters: cells use (column + 2 × row) mod 4, so neighbours never
    // share an element, and fire/water and earth/air sit diagonally.
    groups: [group('Ignis', 'fire'), group('Aqua', 'water'), group('Terra', 'earth'), group('Aer', 'air')],
  },
};
