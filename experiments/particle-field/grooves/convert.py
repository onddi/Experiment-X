# Converts the Groove MIDI Dataset (Google, CC BY 4.0) into grooves/data.json.
#   https://magenta.tensorflow.org/datasets/groove
# Usage: pip install mido; python3 convert.py <unzipped groove folder> data.json
# Keeps every 4/4 beat (Rock and Latin capped, they'd crowd the rest), the first
# 16 bars (8 or 4 if short), and the one-bar fills (not Rock or Latin) to fills.json.
# Each hit is 5 characters: position in 1/96 beats (3 base-36 digits), the drum
# (k kick, s snare, r rim, h hat, o open hat, t u v toms high to low, y crash,
# i ride) and the velocity (one base-36 digit, 0-35).
import csv, json, sys, mido, collections, random, os
root = sys.argv[1]; out = sys.argv[2]
MAP = {36:'k',35:'k',38:'s',40:'s',37:'r',42:'h',22:'h',44:'h',46:'o',26:'o',48:'t',50:'t',45:'u',47:'u',43:'v',58:'v',49:'y',55:'y',57:'y',52:'y',51:'i',59:'i',53:'i'}
CAP = {'rock':16,'latin':12}
NAMES = {'hiphop':'Hip-hop','neworleans':'New Orleans','afrocuban':'Afro-Cuban','middleeastern':'Middle Eastern','afrobeat':'Afrobeat','highlife':'Highlife'}
rows = [r for r in csv.DictReader(open(root+'/info.csv')) if r['beat_type']=='beat' and r['time_signature']=='4-4']
rows.sort(key=lambda r: (r['style'], r['drummer'], int(r['id'].split('/')[-1])))
by = collections.defaultdict(list)
for r in rows: by[r['style'].split('/')[0]].append(r)
D = '0123456789abcdefghijklmnopqrstuvwxyz'
def hits(r):
    m = mido.MidiFile(root+'/'+r['midi_filename'])
    tpb = m.ticks_per_beat; t = 0; ev = []
    for msg in mido.merge_tracks(m.tracks):
        t += msg.time
        if msg.type == 'note_on' and msg.velocity > 0 and msg.note in MAP:
            ev.append((t / tpb, MAP[msg.note], msg.velocity))
    return ev
def enc(ev, L):
    s = ''
    for p, rw, v in sorted(e for e in ev if e[0] < L - 1/48):
        pos = int(round(p * 96))
        if pos >= L * 96: continue
        s += D[pos // 1296] + D[pos // 36 % 36] + D[pos % 36] + rw + D[min(35, round(v / 127 * 35))]
    return s
res = []
for st, lst in sorted(by.items()):
    random.Random(7).shuffle(lst)
    picked = 0
    for r in lst:
        if picked >= CAP.get(st, 99): break
        ev = hits(r)
        if not ev: continue
        dur = ev[-1][0]
        bars = 16 if dur >= 65 else 8 if dur >= 33 else 4 if dur >= 17 else 0
        if not bars: continue
        s = enc(ev, bars * 4)
        picked += 1
        res.append({'id': r['id'].replace('/', '-').replace('_session', ''), 'style': NAMES.get(st, st.capitalize()), 'n': picked, 'drummer': int(r['drummer'][7:]), 'bpm': int(r['bpm']), 'bars': bars, 'ev': s})
json.dump(res, open(out, 'w'), separators=(',', ':'))
# Fills: one bar each, by style (as the beats name it).
fills = collections.defaultdict(list)
for r in csv.DictReader(open(root+'/info.csv')):
    st = r['style'].split('/')[0]
    if r['beat_type'] != 'fill' or r['time_signature'] != '4-4' or st in ('rock', 'latin'): continue
    ev = hits(r)
    if not ev: continue
    s = enc(ev, 4)
    if len(s) >= 15: fills[NAMES.get(st, st.capitalize())].append(s)
json.dump(fills, open(os.path.join(os.path.dirname(out), 'fills.json'), 'w'), separators=(',', ':'))
print(sum(len(v) for v in fills.values()), 'fills')
print(len(res), 'grooves', sum(len(g['ev']) for g in res) // 5, 'hits')
print(collections.Counter(g['style'] for g in res))
