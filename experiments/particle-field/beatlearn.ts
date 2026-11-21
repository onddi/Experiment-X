// What makes each genre's drums sound like that genre: a line or two per genre,
// each pointing at the steps it is about. Rows: 0 kick, 1 snare or clap,
// 2 hats, 3 bass. Steps are sixteenths, 0 to 15; a step only lights up when the
// beat that is playing actually has a hit there.

export type FeelNote = [text: string, row: number, steps: number[]];

const FOUR = [0, 4, 8, 12];
const OFF = [2, 6, 10, 14];
const BACK = [4, 12];

export const GENRE_FEEL: Record<string, FeelNote[]> = {
  techno: [['Four to the floor: a kick on every beat, never moving.', 0, FOUR], ['The hat sits between the kicks, on the offbeat.', 2, OFF], ['The groove comes from small changes over many bars, not from the pattern.', -1, []]],
  house: [['A kick on every beat.', 0, FOUR], ['Clap on 2 and 4.', 1, BACK], ['Hats on the offbeat, between the kicks.', 2, OFF]],
  dub: [['One drop: nothing on 1, kick and snare land together on 3.', 1, [8]], ['The bass carries the tune; the drums leave room for it.', 3, []]],
  dubstep: [['Half-time: one snare on 3, so 140 BPM feels like 70.', 1, [8]], ['A kick on 1, then lots of space.', 0, [0]]],
  dancehall: [['The dembow: snares in a 3-3-2 shape just before and after the beats.', 1, [3, 6, 11, 14]], ['A steady kick under it.', 0, FOUR]],
  rap: [['The backbeat: a hard snare on 2 and 4.', 1, BACK], ['The kick plays around the beat, not on it, which gives the head nod.', 0, [6, 7, 9, 10, 13]], ['Lots of swing: every second sixteenth lands late.', -1, []]],
  trap: [['Half-time: one clap or snare on 3.', 1, [8]], ['Fast hats with rolls (the 3s and 4s) are the signature.', 2, []], ['The 808 bass is the kick: long, sliding, tuned.', 3, [0]]],
  drill: [['Half-time: the big snare is on 3.', 1, [8]], ['A second, late snare just after it: the drill stagger.', 1, [11]], ['Hats in groups of three instead of straight.', 2, [0, 3, 6]], ['The 808 slides between notes.', 3, []]],
  dnb: [['Two-step: kick on 1 and just before 3.', 0, [0, 10]], ['Snare on 2 and 4 at 170+ BPM.', 1, BACK]],
  idm: [['Rules broken on purpose: odd row lengths, glitches, rolls in odd places.', -1, []]],
  afro: [['The 3-3-2 (tresillo) shape that runs under most Afro and Latin grooves.', 0, [0, 3, 6]], ['Percussion and hand drums carry the groove more than the snare.', -1, []]],
  breaks: [['A syncopated kick, like a sampled funk break.', 0, [0, 10]], ['Snare on 2 and 4 with ghost notes around it.', 1, BACK]],
  lofi: [['A soft backbeat on 2 and 4.', 1, BACK], ['Heavy swing and dusty, quiet hits: it should feel behind the beat.', -1, []]],
  trance: [['A kick on every beat.', 0, FOUR], ['The bass answers between the kicks.', 3, OFF]],
  triphop: [['Slow and heavy: snare on 2 and 4 at a crawl.', 1, BACK], ['Everything sits slightly late.', -1, []]],
  phonk: [['A hard kick and 808 underneath.', 0, [0]], ['A cowbell or percussion line plays the hook on top.', -1, []]],
  jersey: [['The bouncing kick runs in quick bursts.', 0, [0, 3, 6, 10, 12]], ['Claps and samples chopped on top.', 1, []]],
  folktronica: [['Hands, wood and shakers do the drumming, not a drum machine.', -1, []], ['Small stutters and rolls in the shaker are the "tronica".', 2, []]],
  synthwave: [['A big 80s snare on 2 and 4.', 1, BACK], ['A simple, straight kick.', 0, [0, 8]]],
  jazz: [['Swing is everything: notes split long-short.', -1, []], ['The hat closes on 2 and 4.', 2, BACK], ['The kick stays quiet, under the bass.', 0, []]],
  garage: [['2-step: the kick skips beats 2 and 4.', 0, [0, 10]], ['Snare on 2 and 4 with shuffled hats.', 1, BACK]],
  disco: [['A kick on every beat.', 0, FOUR], ['Open hats on the offbeat.', 2, OFF], ['Snare or clap on 2 and 4.', 1, BACK]],
  hyperpop: [['Trap drums sped up and pushed to the edge.', -1, []], ['Glitches and rolls everywhere.', 2, []]],
  baile: [['The tamborzão: a 3-3-2 shape in the kick.', 0, [0, 3, 6]], ['Snares and claps chopped on top.', 1, []]],
  gqom: [['A broken kick that avoids the obvious beats.', 0, []], ['Toms and percussion in a 3-step shuffle.', -1, []]],
  psy: [['A short kick on every beat.', 0, FOUR], ['The bass fills the three steps after each kick: the rolling gallop.', 3, [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]]],
};
