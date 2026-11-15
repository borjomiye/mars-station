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

Team plan: [PLAN.md](PLAN.md). Rules for contributors and AI assistants: [CLAUDE.md](CLAUDE.md).

## Status after the greybox merge

The engine in `src/engine/` now runs the mechanics from the greybox prototype (see `greybox/`):

- **Energy cells** for 5 systems (life support, shield, greenhouse, radio, lab), unlocked one per sol on sols 1-4.
- **Crew of five with one job per sol** (grow, fix, outside, lab, care, rest), specialists, tiredness, the medbay.
- **Dose badges** in real mSv; solar storms come only from real DONKI SEP records in `src/data/donki-periods.json`.
- **Events**: trouble with 2-3 priced choices, chances, quiet sols; trouble left alone grows.
- **Radio**: one message per sol, answer next morning, blackout on sols 11-12.
- **Stars, Captain's report, "Same Mars again"**, mission names as seeds, the discovery album.
- No dice: the same mission name and the same choices always give the same result.

All numbers are in `src/data/balance.json` (`base` = numbers shared by every mode, `modes` = Easy / Medium / Hard overrides; all modes play the same Mars for the same mission name). `npm run simulate -- 300` plays three bots (careful, sloppy, lazy) in each mode and fails if the balance guard rails break, including when a harder mode stops being harder.

Texts: every sentence of the engine and the helper is a key in `src/data/en.json` (`text`), used through `t(key, params)`. Still open: button labels and headings in `src/ui/*.tsx` are plain strings; album cards have titles only (no NASA photos or facts); the screens are plain React without the pixel art; `sites.json`, `facts.json` and `radlab-iss.json` are not used by the new engine.
