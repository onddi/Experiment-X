// Plain Latin vocabulary. Picked at random for carousel items.
export const LATIN_WORDS = [
  'amor', 'aqua', 'arbor', 'astrum', 'aurora', 'aurum', 'bellum', 'caelum', 'calor', 'campus',
  'canis', 'carmen', 'causa', 'cervus', 'circulus', 'civitas', 'clamor', 'corvus', 'cursus', 'domus',
  'dolor', 'equus', 'fabula', 'fama', 'febris', 'ferrum', 'fides', 'flamma', 'flumen', 'folium',
  'fons', 'fortuna', 'frater', 'fulmen', 'gaudium', 'gloria', 'gradus', 'hortus', 'hiems', 'ignis',
  'imago', 'imber', 'insula', 'iter', 'lacrima', 'lapis', 'lectus', 'lex', 'liber', 'lumen',
  'luna', 'lupus', 'lux', 'magister', 'mare', 'mater', 'memoria', 'mens', 'miles', 'modus',
  'mons', 'mora', 'mundus', 'murus', 'musica', 'natura', 'navis', 'nebula', 'nemus', 'nix',
  'nomen', 'nox', 'nubes', 'numerus', 'oculus', 'odium', 'onus', 'opus', 'orbis', 'ordo',
  'otium', 'ovum', 'pax', 'pater', 'pectus', 'pes', 'pluvia', 'pondus', 'pontus', 'porta',
  'pulvis', 'quies', 'radix', 'ratio', 'regina', 'rex', 'ripa', 'rosa', 'rota', 'sal',
  'saxum', 'schola', 'semita', 'sidus', 'signum', 'silva', 'sol', 'somnus', 'sonus', 'spes',
  'stella', 'tempus', 'tenebrae', 'terra', 'tempestas', 'umbra', 'unda', 'urbs', 'ursus', 'valles',
  'velum', 'ventus', 'ver', 'veritas', 'via', 'vinum', 'virtus', 'vita', 'vox', 'vulpes',
];

export function randomWord(): string {
  return LATIN_WORDS[Math.floor(Math.random() * LATIN_WORDS.length)];
}
