# Mars Station

A browser game for kids aged 7–12 (NASA Space Apps Challenge). You are the captain of a Mars outpost. For 15 sols you split limited power between life support, radiation shielding, the greenhouse and the antenna, and every choice has a cost. Radiation storms come from real NASA DONKI space weather records.

> Status: hackathon scaffold. `src/data/donki-periods.json` holds a small **real** DONKI sample (Apr–Jun 2024). Re-run `npm run fetch:donki -- 2020-01-01 2025-12-31` for the full pool before the demo.

## Run

```bash
npm install
npm run dev
```

## Check

```bash
npm test
npm run simulate
```

## Data sources

- NASA DONKI (Space Weather Database): solar energetic particles (SEP), flares (FLR), coronal mass ejections (CME).
- Curiosity RAD: background radiation dose on the Mars surface.
- More in `DATA.md` (to be written by the data owner).

