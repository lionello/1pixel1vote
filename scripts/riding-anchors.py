"""Find an interior screen-pixel centre for every riding at each map zoom."""
import gzip
import json
import math
import struct
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'dist'
features = json.loads((root / 'ridings.json').read_text())['features']
ids = gzip.decompress((root / 'riding-ids.gz').read_bytes())
votes = gzip.decompress(b''.join((root / f'votes-{i:02}.gz').read_bytes() for i in range(8)))
samples = [[] for _ in features]
for (x, y, _), riding in zip(struct.iter_unpack('<fff', votes), ids):
    samples[riding].append((x, y))

def f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]

def projected(p, world):
    lon, lat = p[:2]
    return ((lon + 180) / 360 * world,
            (1 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi) / 2 * world)

def inside(ring, x, y):
    result = False
    xj, yj = ring[-1]
    for xi, yi in ring:
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            result = not result
        xj, yj = xi, yi
    return result

def contains(polygons, x, y):
    return any(inside(p[0], x, y) and not any(inside(r, x, y) for r in p[1:]) for p in polygons)

anchors = {}
for zoom in range(6, 15):
    world = 256 * 2 ** zoom
    used = set()
    entries = []
    for feature, positions in zip(features, samples):
        geo = feature['geometry']
        polygons = [geo['coordinates']] if geo['type'] == 'Polygon' else geo['coordinates']
        polygons = [[[projected(p, world) for p in ring] for ring in poly] for poly in polygons]
        chosen = None
        for x, y in positions:
            cell = (math.floor(math.floor(f32(x + 1) * 2097152) / 2 ** (14 - zoom)), math.floor(math.floor(f32(1 - y) * 2097152) / 2 ** (14 - zoom)))
            if cell not in used and contains(polygons, cell[0] + .5, cell[1] + .5):
                chosen = cell
                break
        if chosen is None:
            raise ValueError(f'No unique interior pixel for {feature["properties"]["name"]} at zoom {zoom}')
        used.add(chosen)
        entries.append(chosen)
    anchors[str(zoom)] = entries
    print(f'zoom {zoom}: {len(entries)} unique interior pixels', flush=True)
(root / 'riding-anchors.json').write_text(json.dumps(anchors, separators=(',', ':')) + '\n')
