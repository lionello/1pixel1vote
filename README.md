# 1pixel1vote

1pixel1vote explores election results through pixels. The first dataset covers the 2026 British Columbia provincial election; the project is intended to grow beyond that election and geography.

The map places pixels near populated areas to visualise election results. Locations and neighbourhood party patterns are illustrative, not voter addresses or local election results.

## How it works

At the closest zoom, one pixel represents one vote. At wider zoom levels, every coloured pixel represents the same number of votes for one party in one riding. The number changes with zoom and the pixel-density setting; it increases when needed to fit every riding. The votes left over from each party are packed into pixels that may contain votes for more than one party or fewer than the stated number. Choose whether to show these pixels in grey or colour them by the party with the largest share; ties stay grey. Hover to inspect exact counts. Party colours are never blended and a pixel never combines ridings. A separate first-past-the-post view fills each riding with its leading party’s colour.

Pixels are assigned only after counting each riding's party totals. Candidate positions are drawn from population-guided coordinates whose projected pixel centres fall inside their riding, plus a verified interior anchor for each riding. The anchor is not guaranteed to meet a population threshold. Positions are illustrative and do not identify voters or describe actual neighbourhood voting patterns.

## Run and test

The app is a static site with no build step. Serve `dist/` over HTTP, for example:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. The map and its basemap require network access for Leaflet and OpenStreetMap tiles. A current browser with WebGL, Web Workers and `DecompressionStream` support is required.

Run the aggregation and collision tests with Node.js:

```sh
node --test test/aggregation.test.cjs
```

## First dataset: British Columbia, 2026

- [Elections BC final 2026 election results](https://results.elections.bc.ca/) — valid votes by riding and candidate.
- [Elections BC spatial data](https://www3.elections.bc.ca/resources/maps/gis-spatial-data/) — 2023 electoral district boundaries used in the election.
- [WorldPop 2025 Canada population estimates](https://hub.worldpop.org/geodata/summary?id=72815) — approximately 100 m constrained population grid used to guide locations.

The packaged result and boundary files are snapshots. Rejected ballots are not included. One compressed file contains the riding ID of each coordinate; the eight vote files are consecutive chunks of a single gzip stream. The app checks that the coordinate and riding counts match the published election total before displaying them.

## Deployment

The GitHub Actions workflow tests the project and publishes `dist/` to GitHub Pages when Pages is enabled for the repository with **GitHub Actions** as its source. A repository administrator or maintainer must configure the custom domain in the GitHub Pages settings and point its DNS records to GitHub Pages.
