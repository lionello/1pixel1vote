# 1 Pixel 1 Vote

An interactive map of the 2026 British Columbia provincial election. It groups valid votes by riding and party, then places the resulting groups near populated areas. The map is a visualisation of riding totals: point locations and neighbourhood party patterns are illustrative, not voter addresses or local election results.

## How it works

At the closest zoom, one pixel represents one vote. At each wider integer zoom level, the target group size grows by a factor of four (1, 4, 16, and so on). Groups are built from the exact riding and party totals before any coordinates are selected. The final group for a party in a riding can be smaller than the target size.

The map samples candidate positions within the riding from population-guided coordinates. Those positions are illustrative and do not change the votes in a group. When separate groups land on the same screen pixel, that pixel is grey; hover to inspect the groups. Party colours are never blended. Population estimates guide placement but do not guarantee that every rendered pixel is on land.

## Run and test

The app is a static site with no build step. Serve `dist/` over HTTP, for example:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. The map and its basemap require network access for Leaflet and OpenStreetMap tiles. A current browser with WebGL, Web Workers and `DecompressionStream` support is required.

Run the grouping and collision tests with Node.js:

```sh
node --test test/aggregation.test.cjs
```

## Data

- [Elections BC final 2026 election results](https://results.elections.bc.ca/) — valid votes by riding and candidate.
- [Elections BC spatial data](https://www3.elections.bc.ca/resources/maps/gis-spatial-data/) — 2023 electoral district boundaries used in the election.
- [WorldPop 2025 Canada population estimates](https://hub.worldpop.org/geodata/summary?id=72815) — approximately 100 m constrained population grid used to guide locations.

The packaged result and boundary files are snapshots. Rejected ballots are not included. One compressed file contains the riding ID of each coordinate; the eight vote files are consecutive chunks of a single gzip stream. The app checks that the coordinate and riding counts match the published election total before displaying them.
