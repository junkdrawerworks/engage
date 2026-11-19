#!/usr/bin/env python3
"""Builds the stars' motions the temporal observatory loads:  python3 tools/build-motion.py HYG_CSV

Input (not kept in this repo): the HYG database v4.1, hygdata_v41.csv, from
https://github.com/astronexus/HYG-Database (CC BY-SA 4.0), the same file tools/build-data.py reads.

Output:
  data/motion.bin   int16 vx, vy, vz per star, in units of 0.05 km/s, in data/stars.bin's order: each star's
                    velocity through space relative to the Sun, in the same axes as its position (x toward the
                    March equinox, z toward the north celestial pole), from the catalogue's proper motion, parallax
                    and radial velocity.

The stars are chosen exactly as tools/build-data.py chooses them, and the script stops if any position it reads
differs from data/stars.bin's. Held still (written as zero):
  - stars with no measured distance, whose speed across the sky can't be turned into one through space;
  - the two stars build-data.py adds that HYG leaves out (TRAPPIST-1 and Teegarden's Star);
  - a star farther than 100 parsecs that the catalogue has moving faster than 400 km/s. That far out, a parallax a
    little too small makes a star seem to race across space; three such are held still and printed. The fastest
    nearby stars, whose distances are sure, move at about 300 km/s (Groombridge 1830, Kapteyn's Star).
A star the catalogue gives no radial velocity moves only across the sky, as the catalogue has it.
"""
import csv, math, struct, sys
from pathlib import Path

hyg_csv = Path(sys.argv[1])
root = Path(__file__).resolve().parent.parent
KM_S_PER_PC_YR = 977792.2  # one parsec a year in km/s
UNIT = 0.05  # km/s per step of the int16
FAR_PC, TOO_FAST = 100, 400

pos = open(root / 'data/stars.bin', 'rb').read()
count = len(pos) // 20
out, held = [], []
for r in csv.DictReader(open(hyg_csv)):
    dist, mag = float(r['dist']), float(r['mag'])
    unknown = dist >= 100000
    if r['id'] != '0' and not (mag <= 7.0 or (dist <= 25 and not unknown)):
        continue
    k = len(out)
    if r['id'] != '0' and not unknown:
        x, y, z = struct.unpack_from('<3f', pos, k * 20)
        if max(abs(x - float(r['x'])), abs(y - float(r['y'])), abs(z - float(r['z']))) > 1e-3 * max(1, dist):
            sys.exit(f'star {k} (HYG {r["id"]}) is not where data/stars.bin has it: rebuild both from the same file')
    v = [float(r[c]) * KM_S_PER_PC_YR for c in ('vx', 'vy', 'vz')]
    speed = math.sqrt(sum(c * c for c in v))
    if r['id'] == '0' or unknown:
        v = [0, 0, 0]
    elif dist > FAR_PC and speed > TOO_FAST:
        held.append(f'HIP {r["hip"]} ({speed:.0f} km/s at {dist:.0f} pc)')
        v = [0, 0, 0]
    out.append([max(-32767, min(32767, round(c / UNIT))) for c in v])
while len(out) < count:  # the stars build-data.py adds after HYG's
    out.append([0, 0, 0])
if len(out) != count:
    sys.exit(f'{len(out)} motions for {count} stars')
with open(root / 'data/motion.bin', 'wb') as f:
    for v in out:
        f.write(struct.pack('<3h', *v))
print(f'{count} stars; held still as catalogue errors: {", ".join(held)}')
