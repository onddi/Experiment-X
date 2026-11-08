// Image themes. A theme is a fixed set of groups (here the four elements);
// each grid cell shows one group and steps through its images.
//
// A theme can come in several styles (photographs, anime, ...). Every style
// fills the same groups, so element order, colour matching and the main row
// keep working whichever style is picked. Add a style by dropping a folder in
// images/four-elements/<style>/ with <element>-<n>.webp files and a
// style.json ({ "title": "...", "lum": { "fire-1": 43, ... } }).

export interface ThemeImage {
  url: string;
  /** Mean luminance 0-255, used to even out exposure across a set. */
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

interface StyleManifest {
  title: string;
  lum?: Record<string, number>;
}

const files = import.meta.glob<string>('./images/four-elements/*/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const manifests = import.meta.glob<StyleManifest>('./images/four-elements/*/style.json', {
  eager: true,
  import: 'default',
});

// Order matters: cells use (column + 2 × row) mod 4, so neighbours never
// share an element, and water/earth and fire/air sit diagonally.
const ELEMENTS = [
  { key: 'water', name: 'Aqua' },
  { key: 'fire', name: 'Ignis' },
  { key: 'earth', name: 'Terra' },
  { key: 'air', name: 'Aer' },
];

export interface ThemeStyle {
  id: string;
  title: string;
  theme: Theme;
}

function loadStyles(): ThemeStyle[] {
  const styles: ThemeStyle[] = [];
  for (const [path, manifest] of Object.entries(manifests)) {
    const id = path.split('/').at(-2)!;
    const groups = ELEMENTS.map(({ key, name }) => {
      const images: ThemeImage[] = [];
      for (const [file, url] of Object.entries(files)) {
        const m = file.match(new RegExp(`/${id}/(${key}-\\d+)\\.webp$`));
        if (m) images.push({ url, lum: manifest.lum?.[m[1]] ?? 100 });
      }
      images.sort((a, b) => a.url.localeCompare(b.url, undefined, { numeric: true }));
      return { name, images };
    });
    // A style needs at least one image for every element.
    if (groups.every((g) => g.images.length)) {
      styles.push({ id, title: manifest.title, theme: { title: 'Four Elements', groups } });
    }
  }
  // Photographs first, the rest alphabetically.
  return styles.sort((a, b) => (a.id === 'photo' ? -1 : b.id === 'photo' ? 1 : a.title.localeCompare(b.title)));
}

export const STYLES = loadStyles();

export function themeFor(styleId: string): Theme {
  return (STYLES.find((s) => s.id === styleId) ?? STYLES[0]).theme;
}
