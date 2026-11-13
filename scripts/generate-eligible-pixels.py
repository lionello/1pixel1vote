"""Mark population-guided positions whose pixel centres remain in their riding.

Requires numpy and shapely. Writes one bit per aggregated zoom and vote position.
The base positions themselves are already population-guided; this does not impose
an additional population-density threshold.
"""
import gzip
import json
from pathlib import Path
import numpy as np
import shapely

root = Path(__file__).resolve().parent.parent / 'dist'
features = json.loads((root / 'ridings.json').read_text())['features']
ids = np.frombuffer(gzip.decompress((root / 'riding-ids.gz').read_bytes()), dtype=np.uint8)
packed = gzip.decompress(b''.join((root / f'votes-{i:02}.gz').read_bytes() for i in range(8)))
points = np.frombuffer(packed, dtype='<f4').reshape(-1, 3)
flags = np.zeros(len(ids), dtype=np.uint8)
for r, feature in enumerate(features):
    idx = np.flatnonzero(ids == r)
    geo = shapely.geometry.shape(feature['geometry'])
    shapely.prepare(geo)
    x, y = points[idx, 0].astype(np.float64), points[idx, 1].astype(np.float64)
    for z in range(6, 14):
        world = 256 * 2 ** z
        px = np.floor((x + 1) * world / 2) + .5
        py = np.floor((1 - y) * world / 2) + .5
        lon = px / world * 360 - 180
        lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * py / world))))
        flags[idx] |= shapely.contains_xy(geo, lon, lat).astype(np.uint8) << (z - 6)
    print(feature['properties']['name'], flush=True)
(root / 'eligible-pixels.gz').write_bytes(gzip.compress(flags.tobytes(), mtime=0))
print(f'{len(flags)} positions checked at eight zooms')
