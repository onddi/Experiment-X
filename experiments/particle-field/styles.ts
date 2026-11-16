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
}

export const STYLES: Style[] = [
  { id: 'ambient', name: 'Ambient', beat: '', vars: ['Deep space', 'Rain on glass', 'Northern lights', 'Wind chimes', 'Cathedral', 'Music box night', 'Harp garden'] },
  { id: 'world', name: 'World', beat: '', vars: ['Koto temple', 'Flute forest', 'Kalimba campfire', 'Gamelan', 'Steel band'] },
  { id: 'band', name: 'Band', beat: '', vars: ['Lounge', 'Blues bar', 'Gospel organ', 'Vibes café'] },
  { id: 'synth', name: 'Synth', beat: '', vars: ['Night drive', 'Synthwave', 'Chiptune', 'Arcade', 'Scanner'] },
  { id: 'lofi', name: 'Lo-fi', beat: 'lofi', vars: ['Lo-fi study', 'Vibes café', 'Fog machine'] },
  { id: 'house', name: 'House', beat: 'house', vars: ['House', 'Night drive'] },
  { id: 'techno', name: 'Techno', beat: 'techno', vars: ['Acid techno', 'Minimal', 'Rolling sub'] },
  { id: 'dub', name: 'Dub', beat: 'dub', vars: ['Dub techno', 'Dub echoes', 'Dub chords', 'Broken dub', 'Steppers', 'Reggae one drop'] },
  { id: 'dubstep', name: 'Dubstep', beat: 'dubstep', vars: ['Half-time dub', 'Rolling sub'] },
  { id: 'rap', name: 'Rap', beat: 'rap', vars: ['Boom bap', 'Lo-fi study'] },
  { id: 'trap', name: 'Trap', beat: 'trap', vars: ['Trap haze', 'Deep space'] },
  { id: 'drill', name: 'Drill', beat: 'drill', vars: ['Trap haze', 'Cathedral'] },
  { id: 'dnb', name: 'D&B', beat: 'dnb', vars: ['Drum and bass', 'Northern lights'] },
  { id: 'dancehall', name: 'Dancehall', beat: 'dancehall', vars: ['Dancehall', 'Steel band'] },
  { id: 'afro', name: 'Afro & Latin', beat: 'afro', vars: ['Bossa nova', 'Marimba party', 'Gamelan'] },
  { id: 'breaks', name: 'Funk', beat: 'breaks', vars: ['Fuzz garage', 'Arcade'] },
  { id: 'idm', name: 'IDM', beat: 'idm', vars: ['Scanner', 'Rain on glass'] },
];

export const styleById = (id: string) => STYLES.find((s) => s.id === id);
