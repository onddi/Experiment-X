# Converts the Groove MIDI Dataset (Google, CC BY 4.0) into grooves/data.json.
#   https://magenta.tensorflow.org/datasets/groove
# Usage: pip install mido; python3 convert.py <unzipped groove folder> data.json
# Keeps 4/4 beats (no fills), up to a few per style, the first 8 bars (4 if short).
# Each hit is 5 characters: position in 1/96 beats (3 base-36 digits), the drum
# (k kick, s snare, r rim, h hat, o open hat, t u v toms high to low, y crash,
# i ride) and the velocity (one base-36 digit, 0-35).
import csv, json, sys, mido, collections, random
root = sys.argv[1]; out = sys.argv[2]
MAP = {36:'k',35:'k',38:'s',40:'s',37:'r',42:'h',22:'h',44:'h',46:'o',26:'o',48:'t',50:'t',45:'u',47:'u',43:'v',58:'v',49:'y',55:'y',57:'y',52:'y',51:'i',59:'i',53:'i'}
CAP = {'rock':16,'funk':14,'latin':12,'jazz':12,'hiphop':12,'soul':10}
NAMES = {'hiphop':'Hip-hop','neworleans':'New Orleans','afrocuban':'Afro-Cuban','middleeastern':'Middle Eastern','afrobeat':'Afrobeat','highlife':'Highlife'}
rows = [r for r in csv.DictReader(open(root+'/info.csv')) if r['beat_type']=='beat' and r['time_signature']=='4-4']
rows.sort(key=lambda r: (r['style'], r['drummer'], int(r['id'].split('/')[-1])))
by = collections.defaultdict(list)
for r in rows: by[r['style'].split('/')[0]].append(r)
res = []
for st, lst in sorted(by.items()):
    random.Random(7).shuffle(lst)
    picked = 0
    for r in lst:
        if picked >= CAP.get(st, 99): break
        m = mido.MidiFile(root+'/'+r['midi_filename'])
        tpb = m.ticks_per_beat; t = 0; ev = []
        for msg in mido.merge_tracks(m.tracks):
            t += msg.time
            if msg.type == 'note_on' and msg.velocity > 0 and msg.note in MAP:
                ev.append((t / tpb, MAP[msg.note], msg.velocity))
        if not ev: continue
        dur = ev[-1][0]
        bars = 8 if dur >= 33 else 4 if dur >= 17 else 0
        if not bars: continue
        L = bars * 4
        # Start on the first kick or crash near the top (most takes start at beat 0).
        e = [(p, rw, v) for p, rw, v in ev if p < L - 1/48]
        s = ''
        for p, rw, v in sorted(e):
            pos = int(round(p * 96))
            if pos >= L * 96: continue
            d = '0123456789abcdefghijklmnopqrstuvwxyz'
            s += d[pos // 1296] + d[pos // 36 % 36] + d[pos % 36] + rw + d[min(35, round(v / 127 * 35))]
        picked += 1
        res.append({'id': r['id'].replace('/', '-').replace('_session', ''), 'style': NAMES.get(st, st.capitalize()), 'n': picked, 'drummer': int(r['drummer'][7:]), 'bpm': int(r['bpm']), 'bars': bars, 'ev': s})
json.dump(res, open(out, 'w'), separators=(',', ':'))
print(len(res), 'grooves', sum(len(g['ev']) for g in res) // 5, 'hits')
print(collections.Counter(g['style'] for g in res))
