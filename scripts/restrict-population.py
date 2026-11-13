"""Keep each closest-zoom vote pixel in a WorldPop cell with population > 0.

Input: the existing vote coordinates, riding IDs and a WorldPop GeoTIFF in
EPSG:4326. Reuses existing positions when possible, moves the rest to nearby
populated positions in the same riding, and preserves each vote's party.
Requires numpy, rasterio and shapely.
"""
import argparse
import gzip
import json
from pathlib import Path
import numpy as np
import rasterio
from rasterio.windows import Window
import shapely

parser = argparse.ArgumentParser()
parser.add_argument('raster', type=Path)
parser.add_argument('--verify-only', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent / 'dist'
features = json.loads((root / 'ridings.json').read_text())['features']
ids = np.frombuffer(gzip.decompress((root / 'riding-ids.gz').read_bytes()), dtype=np.uint8)
packed = gzip.decompress(b''.join((root / f'votes-{i:02}.gz').read_bytes() for i in range(8)))
points = np.frombuffer(packed, dtype='<f4').reshape(-1, 3).copy()
world = 256 * 2**14
half = world / 2
rng = np.random.default_rng(935612)

# Model the float32 operations in the closest-zoom vertex shader.
def pixel_xy(x, y):
    return (np.floor((x + np.float32(1)) * np.float32(half)).astype(np.int64),
            np.floor((np.float32(1) - y) * np.float32(half)).astype(np.int64))
def centres(x, y):
    return ((x + .5) / world * 360 - 180,
            np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (y + .5) / world)))))

with rasterio.open(args.raster) as raster:
    if str(raster.crs) != 'EPSG:4326':
        raise ValueError('Population raster must use EPSG:4326')
    height, width = raster.shape
    block_h, block_w = raster.block_shapes[0]
    transform = raster.transform
    def inhabited(lon, lat):
        col = np.floor((lon - transform.c) / transform.a).astype(np.int64)
        row = np.floor((lat - transform.f) / transform.e).astype(np.int64)
        valid = (row >= 0) & (row < height) & (col >= 0) & (col < width)
        values = np.zeros(len(lon), dtype=bool)
        indices = np.flatnonzero(valid)
        if not len(indices): return values
        num_blocks = (width + block_w - 1) // block_w
        block_ids = (row[indices] // block_h) * num_blocks + col[indices] // block_w
        order = np.argsort(block_ids, kind='stable')
        indices, block_ids = indices[order], block_ids[order]
        starts = np.r_[0, np.flatnonzero(np.diff(block_ids)) + 1, len(indices)]
        for a, b in zip(starts[:-1], starts[1:]):
            subset = indices[a:b]
            r0 = (row[subset[0]] // block_h) * block_h
            c0 = (col[subset[0]] // block_w) * block_w
            window = Window(c0, r0, min(block_w, width - c0), min(block_h, height - r0))
            data = raster.read(1, window=window, masked=True)
            val = np.ma.filled(data[row[subset] - r0, col[subset] - c0], 0)
            values[subset] = np.isfinite(val) & (val > 0)
        return values
    x, y = pixel_xy(points[:,0], points[:,1])
    lon, lat = centres(x,y)
    keep = inhabited(lon,lat)
    for r, feature in enumerate(features):
        idx = np.flatnonzero(ids == r)
        geometry = shapely.geometry.shape(feature['geometry'])
        shapely.prepare(geometry)
        keep[idx] &= shapely.contains_xy(geometry,lon[idx],lat[idx])
    keys = y * world + x
    if len(np.unique(keys)) != len(keys): raise ValueError('Original positions are not unique')
    occupied = set(keys[keep].tolist())
    print(f'{len(points)} votes: {np.count_nonzero(keep)} already eligible, {np.count_nonzero(~keep)} need relocation', flush=True)
    if args.verify_only:
        if not np.all(keep): raise ValueError('Some pixels are outside their riding or in unpopulated cells')
        raise SystemExit(0)
    for r, feature in enumerate(features):
        good = np.flatnonzero((ids == r) & keep)
        bad = np.flatnonzero((ids == r) & ~keep)
        if not len(bad): continue
        if not len(good): raise ValueError(f'No inhabited vote positions in {feature["properties"]["name"]}')
        geometry = shapely.geometry.shape(feature['geometry']);shapely.prepare(geometry)
        remaining = list(bad)
        for attempt in range(1,101):
            if not remaining: break
            batch = max(3000,len(remaining)*4)
            base = rng.choice(good,size=batch)
            radius = min(32, 4 + attempt)
            cx = x[base] + rng.integers(-radius,radius+1,size=batch)
            cy = y[base] + rng.integers(-radius,radius+1,size=batch)
            clon, clat = centres(cx,cy)
            valid = shapely.contains_xy(geometry,clon,clat) & inhabited(clon,clat)
            for xx,yy in zip(cx[valid],cy[valid]):
                key = int(yy)*world+int(xx)
                if key in occupied: continue
                idx = remaining.pop(); occupied.add(key)
                # Encode at the pixel centre so shader rounding yields this pixel.
                points[idx,0] = np.float32((xx+.5)/half-1)
                points[idx,1] = np.float32(1-(yy+.5)/half)
                if not remaining: break
        if remaining: raise ValueError(f'Cannot place {len(remaining)} votes in populated areas of {feature["properties"]["name"]}')
        print(f'{feature["properties"]["name"]}: relocated {len(bad)}',flush=True)
    xx,yy=pixel_xy(points[:,0],points[:,1]);longitudes,latitudes=centres(xx,yy)
    if len(np.unique(yy*world+xx)) != len(points) or not np.all(inhabited(longitudes,latitudes)):
        raise ValueError('Rebuilt pixels are not unique or not all populated')
    for r,feature in enumerate(features):
        idx=np.flatnonzero(ids==r);geometry=shapely.geometry.shape(feature['geometry']);shapely.prepare(geometry)
        if not np.all(shapely.contains_xy(geometry,longitudes[idx],latitudes[idx])):raise ValueError(f'Pixel outside {feature["properties"]["name"]}')

compressed=gzip.compress(points.astype('<f4',copy=False).tobytes(),mtime=0)
size=(len(compressed)+7)//8
for i in range(8):(root / f'votes-{i:02}.gz').write_bytes(compressed[i*size:(i+1)*size])
print('All closest-zoom pixel centres verified in populated WorldPop cells and their riding.',flush=True)
