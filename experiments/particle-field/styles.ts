// Sound styles: one way to pick the whole sound. A genre, then one of its
// variations; a variation is a sound preset (instruments, scale, chords,
// effects), and a genre with a beat also sets the drums, bass and tempo.

export interface Style {
  id: string;
  name: string;
  /** The drum genre (drums.ts) it plays, or '' for drums that follow the field. */
  beat: string;
  /** Sound presets by name, each one variation. */
  vars: string[];
  /**
   * For a genre without a beat of its own: songs that borrow a written beat
   * from a drum genre that suits them (genre id, beat name). The song keeps its
   * own sound and tempo; songs not listed stay with drums that follow the field.
   */
  varBeats?: Record<string, [string, string]>;
  /** A family (FAMILIES) it's one of: the genre list shows the family once, its styles inside. */
  family?: string;
}

/** Families of styles: one entry in the genre list, each style in it a sub-genre. */
export const FAMILIES: Record<string, string> = { rap: 'Rap', techno: 'Techno', psy: 'Psytrance', dnb: 'D&B', dubstep: 'Dubstep', hard: 'Hard', synthwave: 'Synthwave', ambient: 'Ambient' };

export const STYLES: Style[] = [
  { id: 'ambient', name: 'Ambient', beat: '', vars: ['Deep space', 'Rain on glass', 'Northern lights', 'Wind chimes', 'Cathedral', 'Music box night', 'Harp garden'], family: 'ambient' },
  { id: 'darkambient', name: 'Dark ambient', beat: '', vars: ['Fog machine', 'Cathedral'], family: 'ambient' },
  { id: 'world', name: 'World', beat: '', vars: ['Koto temple', 'Flute forest', 'Kalimba campfire', 'Gamelan', 'Steel band'],
    varBeats: { 'Kalimba campfire': ['afro', 'Highlife'], Gamelan: ['afro', 'Gamelan clave'], 'Steel band': ['dancehall', 'Island'] } },
  { id: 'band', name: 'Band', beat: '', vars: ['Lounge', 'Blues bar', 'Gospel organ', 'Vibes café'],
    varBeats: { Lounge: ['jazz', 'Late night'], 'Blues bar': ['jazz', 'Shuffle'], 'Gospel organ': ['jazz', 'Ballad'], 'Vibes café': ['jazz', 'Swing'] } },
  { id: 'synth', name: 'Synth', beat: '', vars: ['Night drive', 'Synthwave', 'Chiptune', 'Arcade', 'Scanner'],
    varBeats: { 'Night drive': ['synthwave', 'Night drive'], Synthwave: ['synthwave', 'Outrun'], Chiptune: ['synthwave', 'Arcade run'], Arcade: ['breaks', 'Arcade electro'] } },
  { id: 'lofi', name: 'Lo-fi', beat: 'lofi', vars: ['Lo-fi study', 'Vibes café', 'Fog machine'] },
  { id: 'house', name: 'House', beat: 'house', vars: ['House', 'Night drive'] },
  { id: 'techno', name: 'Techno', beat: 'techno', vars: ['Acid techno', 'Minimal', 'Rolling sub'], family: 'techno' },
  { id: 'industrial', name: 'Industrial', beat: 'industrial', vars: ['Acid techno'], family: 'techno' },
  { id: 'hardtechno', name: 'Hard techno', beat: 'hardtechno', vars: ['Acid techno'], family: 'techno' },
  { id: 'hypnotic', name: 'Hypnotic', beat: 'hypnotic', vars: ['Minimal'], family: 'techno' },
  { id: 'ebm', name: 'EBM', beat: 'ebm', vars: ['Scanner'], family: 'techno' },
  { id: 'dub', name: 'Dub', beat: 'dub', vars: ['Dub techno', 'Dub echoes', 'Dub chords', 'Broken dub', 'Steppers', 'Reggae one drop'] },
  { id: 'dubstep', name: 'Dubstep', beat: 'dubstep', vars: ['Half-time dub', 'Rolling sub'], family: 'dubstep' },
  { id: 'deepdub', name: 'Deep dubstep', beat: 'deepdub', vars: ['Rolling sub'], family: 'dubstep' },
  { id: 'rap', name: 'Boom bap', beat: 'rap', vars: ['Boom bap', 'Lo-fi study'], family: 'rap' },
  { id: 'crunk', name: 'Crunk', beat: 'crunk', vars: ['Trap haze'], family: 'rap' },
  { id: 'screwed', name: 'Screwed', beat: 'screwed', vars: ['Fog machine'], family: 'rap' },
  { id: 'hyphy', name: 'Hyphy', beat: 'hyphy', vars: ['Jersey club'], family: 'rap' },
  { id: 'grime', name: 'Grime', beat: 'grime', vars: ['Chiptune'], family: 'rap' },
  { id: 'detroit', name: 'Detroit', beat: 'detroit', vars: ['Trap haze'], family: 'rap' },
  { id: 'cloud', name: 'Cloud rap', beat: 'cloud', vars: ['Deep space'], family: 'rap' },
  { id: 'beattape', name: 'Beat tape', beat: 'beattape', vars: ['Lo-fi study'], family: 'rap' },
  { id: 'lofirap', name: 'Lo-fi rap', beat: 'lofirap', vars: ['Lo-fi rap', 'Lo-fi study'], family: 'rap' },
  { id: 'memphis', name: 'Memphis', beat: 'memphis', vars: ['Phonk'], family: 'rap' },
  { id: 'trap', name: 'Trap', beat: 'trap', vars: ['Trap haze', 'Deep space'], family: 'rap' },
  { id: 'drill', name: 'Drill', beat: 'drill', vars: ['Trap haze', 'Cathedral'], family: 'rap' },
  { id: 'dnb', name: 'D&B', beat: 'dnb', vars: ['Drum and bass', 'Northern lights'], family: 'dnb' },
  { id: 'neuro', name: 'Neurofunk', beat: 'neuro', vars: ['Drum and bass'], family: 'dnb' },
  { id: 'darkstep', name: 'Darkstep', beat: 'darkstep', vars: ['Drum and bass'], family: 'dnb' },
  { id: 'halftime', name: 'Halftime', beat: 'halftime', vars: ['Half-time dub'], family: 'dnb' },
  { id: 'liquid', name: 'Liquid', beat: 'liquid', vars: ['Northern lights'], family: 'dnb' },
  { id: 'dancehall', name: 'Dancehall', beat: 'dancehall', vars: ['Dancehall', 'Steel band'] },
  { id: 'afro', name: 'Afro & Latin', beat: 'afro', vars: ['Bossa nova', 'Marimba party', 'Gamelan'] },
  { id: 'breaks', name: 'Funk', beat: 'breaks', vars: ['Fuzz garage', 'Arcade'] },
  { id: 'idm', name: 'IDM', beat: 'idm', vars: ['Scanner', 'Rain on glass'] },
  { id: 'trance', name: 'Trance', beat: 'trance', vars: ['Trance'] },
  { id: 'triphop', name: 'Trip-hop', beat: 'triphop', vars: ['Trip-hop'] },
  { id: 'phonk', name: 'Phonk', beat: 'phonk', vars: ['Phonk'], family: 'rap' },
  { id: 'jersey', name: 'Jersey club', beat: 'jersey', vars: ['Jersey club'] },
  { id: 'synthwave', name: 'Synthwave', beat: 'synthwave', vars: ['Synthwave'], family: 'synthwave' },
  { id: 'darksynth', name: 'Darksynth', beat: 'darksynth', vars: ['Synthwave'], family: 'synthwave' },
  { id: 'darkwave', name: 'Darkwave', beat: 'darkwave', vars: ['Night drive'], family: 'synthwave' },
  { id: 'witch', name: 'Witch house', beat: 'witch', vars: ['Fog machine'], family: 'synthwave' },
  { id: 'jazz', name: 'Jazz', beat: 'jazz', vars: ['Jazz club'] },
  { id: 'garage', name: 'UK garage', beat: 'garage', vars: ['UK garage'] },
  { id: 'disco', name: 'Disco', beat: 'disco', vars: ['Disco'] },
  { id: 'hyperpop', name: 'Hyperpop', beat: 'hyperpop', vars: ['Hyperpop'] },
  { id: 'baile', name: 'Baile funk', beat: 'baile', vars: ['Baile funk'] },
  { id: 'gqom', name: 'Gqom', beat: 'gqom', vars: ['Gqom'] },
  { id: 'psy', name: 'Psytrance', beat: 'psy', vars: ['Psytrance'], family: 'psy' },
  { id: 'darkpsy', name: 'Dark psy', beat: 'darkpsy', vars: ['Psytrance'], family: 'psy' },
  { id: 'hitech', name: 'Hi-tech', beat: 'hitech', vars: ['Psytrance'], family: 'psy' },
  { id: 'psydub', name: 'Psy-dub', beat: 'psydub', vars: ['Dub echoes'], family: 'psy' },
  { id: 'gabber', name: 'Gabber', beat: 'gabber', vars: ['Acid techno'], family: 'hard' },
  { id: 'breakcore', name: 'Breakcore', beat: 'breakcore', vars: ['Scanner'], family: 'hard' },
  { id: 'folktronica', name: 'Folktronica', beat: 'folktronica', vars: ['Folktronica', 'Flute forest', 'Kalimba campfire'] },
];

export const styleById = (id: string) => STYLES.find((s) => s.id === id);

/** The genre list: each style on its own, or a family's styles together (at its first one's place). */
export function styleGroups(): { id: string; name: string; styles: Style[] }[] {
  const out: { id: string; name: string; styles: Style[] }[] = [];
  for (const st of STYLES) {
    if (!st.family) out.push({ id: st.id, name: st.name, styles: [st] });
    else if (!out.some((g) => g.id === `fam:${st.family}`)) out.push({ id: `fam:${st.family}`, name: FAMILIES[st.family] ?? st.family, styles: STYLES.filter((x) => x.family === st.family) });
  }
  return out;
}
