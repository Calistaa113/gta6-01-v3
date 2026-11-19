# Vistamar

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Calistaa113/gta6-01-v3/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Calistaa113/gta6-01-v3/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A 3D open-world crime game for the [gta6-01 bounty](https://make.fun/bounty/gta6-01).
You are Dante Reyes, back in Vistamar — a sun-soaked coastal city of downtown
towers, quiet suburbs, warehouses, a big park and a beach. Fixer Mara Solis
pays cash for eight missions; the Vistamar PD pays attention.

## The city

Five districts on a 3600×2600 map: downtown, residential, industrial, the park
and the beach, plus the sea and a marina. Traffic follows the roads,
pedestrians walk the sidewalks and flee from gunfire. Everything is real
Three.js WebGL (vendored, no network), lit by a bright sun, and the whole
world is deterministic from a seed.

## Play

Walk the streets, steal a car, run missions, lose the cops. Wanted level 0–5
with police pursuit, ramming and busts; shops (arms, spray, clothes); money;
HUD with health, money, weapon, wanted stars, clock and mission tracker;
minimap; pause and save to localStorage. `?seed=` sets the world,
`?shot=` jumps to a staged scene.

```sh
npm run serve   # serves the game on http://localhost:8080
```

## Shots

Four real gameplay screenshots live in `screenshots/` (1280×720): city
driving, title, a mission run to the docks, and a three-star chase with the
HUD and minimap.
