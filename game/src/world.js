// The city of Vistamar as pure data: road grid, districts, building boxes,
// shops and named mission spots. No three.js here — city.js turns this into
// meshes, and the simulation (cars, people, missions) reads the same layout,
// so the world the player drives through is the world the rules use.
import { WORLD, ROAD_EVERY, ROAD_HALF, BEACH_Z, SEA_Z } from './config.js';
import { dist2d } from './random.js';

/** Road centre lines: vertical roads run north-south, horizontal east-west. */
export const ROADS_V = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400];
export const ROADS_H = [200, 600, 1000, 1400, 1800, 2200];

/** Named places the missions and shops use (all on sidewalks, clear of buildings). */
export const SPOTS = {
  spawn: { x: 1800, z: 1800, label: 'Vistamar' },
  maraOffice: { x: 1760, z: 760, label: "Mara's office" },
  garage: { x: 2960, z: 760, label: 'Rico’s garage' },
  docks: { x: 3360, z: 2360, label: 'The docks' },
  beachBar: { x: 560, z: 2360, label: 'The beach bar' },
  safehouse: { x: 1760, z: 1560, label: 'The safehouse' },
  bank: { x: 1560, z: 560, label: 'Vistamar Bank' },
  yacht: { x: 3400, z: 2500, label: 'The yacht' },
  tower: { x: 2040, z: 760, label: 'The Marlin Tower' },
  lookout1: { x: 560, z: 560, label: 'Lookout — west' },
  lookout2: { x: 960, z: 960, label: 'Lookout — north' },
  lookout3: { x: 560, z: 1360, label: 'Lookout — south' },
  arms: { x: 960, z: 560, label: 'Vistamar Arms' },
  spray: { x: 2560, z: 1160, label: 'Spray & Go' },
  clothes: { x: 1160, z: 1760, label: 'Threadline' },
};

/** Which district a block centre falls in. */
function districtAt(cx, cz) {
  if (cz >= BEACH_Z) return 'beach';
  if (cx >= 1400 && cx <= 2200 && cz >= 200 && cz <= 1200) return 'downtown';
  if (cx >= 2400 && cz >= 200 && cz <= 1400) return 'industrial';
  if (cx >= 1400 && cx <= 2200 && cz >= 1400 && cz <= 2200) return 'park';
  return 'residential';
}

/** Build the whole city layout from a seeded RNG. */
export function createCity(rng) {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const blocks = [];

  // One block between each pair of neighbouring roads.
  for (let i = 0; i < ROADS_V.length - 1; i += 1) {
    for (let j = 0; j < ROADS_H.length - 1; j += 1) {
      const x0 = ROADS_V[i] + ROAD_HALF + 14;
      const x1 = ROADS_V[i + 1] - ROAD_HALF - 14;
      const z0 = ROADS_H[j] + ROAD_HALF + 14;
      const z1 = ROADS_H[j + 1] - ROAD_HALF - 14;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const district = districtAt(cx, cz);
      blocks.push({ x0, x1, z0, z1, cx, cz, district });
      if (district === 'park') {
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: rng.range(x0 + 20, x1 - 20), z: rng.range(z0 + 20, z1 - 20), palm: false });
        }
        continue;
      }
      if (district === 'beach') continue;
      if (district === 'downtown') {
        // One or two towers per block, tall glass.
        const n = rng.chance(0.5) ? 2 : 1;
        for (let b = 0; b < n; b += 1) {
          const w = rng.range(90, 150);
          const d = rng.range(90, 150);
          const bx = n === 1 ? cx : cx + (b === 0 ? -70 : 70);
          const bz = n === 1 ? cz : cz + (b === 0 ? -40 : 40);
          buildings.push({
            x: bx, z: bz, w, d, h: rng.range(120, 260),
            district, hue: rng.pick([0x8fb6c9, 0x6f9ab0, 0xa8c4d4, 0x7d94a6]),
          });
        }
      } else if (district === 'industrial') {
        buildings.push({
          x: cx, z: cz, w: rng.range(180, 240), d: rng.range(120, 170), h: rng.range(26, 44),
          district, hue: rng.pick([0x8a7d6b, 0x7d7468, 0x6b7d6b]),
        });
      } else {
        // Residential: a 2x2 row of small houses with varied colours.
        for (const dx of [-70, 70]) {
          for (const dz of [-60, 60]) {
            if (rng.chance(0.2)) continue;
            buildings.push({
              x: cx + dx, z: cz + dz, w: rng.range(52, 84), d: rng.range(52, 84),
              h: rng.range(20, 38), district,
              hue: rng.pick([0xd9a05b, 0xc98a7a, 0x9ab8c9, 0xb5c98a, 0xd4c49a, 0xb08a9a]),
            });
          }
        }
      }
    }
  }

  // Beach palms along the sand.
  for (let x = 120; x < WORLD.width; x += 130) {
    trees.push({ x: x + rng.range(-30, 30), z: rng.range(BEACH_Z + 40, SEA_Z - 60), palm: true });
  }
  // Sidewalk trees along the north-south roads.
  for (const rx of ROADS_V) {
    for (let z = 300; z < BEACH_Z; z += 500) {
      if (rng.chance(0.6)) trees.push({ x: rx + 44, z, palm: false });
    }
  }
  // Street lamps along every road, alternating sides.
  for (const rx of ROADS_V) {
    for (let z = 200; z < BEACH_Z; z += 400) {
      lamps.push({ x: rx + 40, z });
      lamps.push({ x: rx - 40, z: z + 200 });
    }
  }
  for (const rz of ROADS_H) {
    for (let x = 200; x < WORLD.width; x += 400) {
      lamps.push({ x, z: rz + 40 });
    }
  }

  const city = {
    buildings,
    trees,
    lamps,
    blocks,
    /** The nearest road line to a point. */
    nearestRoad(x, z) {
      let bestV = ROADS_V[0];
      let bdV = Math.abs(x - ROADS_V[0]);
      for (const rx of ROADS_V) {
        const d = Math.abs(x - rx);
        if (d < bdV) { bdV = d; bestV = rx; }
      }
      let bestH = ROADS_H[0];
      let bdH = Math.abs(z - ROADS_H[0]);
      for (const rz of ROADS_H) {
        const d = Math.abs(z - rz);
        if (d < bdH) { bdH = d; bestH = rz; }
      }
      return bdV <= bdH
        ? { axis: 'v', at: bestV, dist: bdV }
        : { axis: 'h', at: bestH, dist: bdH };
    },
    /** A random point on a road at least minDist from `near`. */
    randomRoadPoint(rng2, near, minDist) {
      for (let tries = 0; tries < 40; tries += 1) {
        let x;
        let z;
        if (rng2.chance(0.5)) {
          x = rng2.pick(ROADS_V);
          z = rng2.range(220, BEACH_Z - 40);
        } else {
          x = rng2.range(220, WORLD.width - 220);
          z = rng2.pick(ROADS_H);
        }
        if (!near || dist2d(x, z, near.x, near.z) >= minDist) return { x, z };
      }
      return { x: 1800, z: 1000 };
    },
    /** The building AABB a circle at (x,z) with radius r overlaps, or null. */
    buildingAt(x, z, r) {
      for (const b of buildings) {
        if (x + r > b.x - b.w / 2 && x - r < b.x + b.w / 2
          && z + r > b.z - b.d / 2 && z - r < b.z + b.d / 2) return b;
      }
      return null;
    },
    /** Push a circle out of any building it overlaps. Returns true if moved. */
    resolveBuildings(p, r) {
      const b = this.buildingAt(p.x, p.z, r);
      if (!b) return false;
      const dxl = (p.x + r) - (b.x - b.w / 2);
      const dxr = (b.x + b.w / 2) - (p.x - r);
      const dzl = (p.z + r) - (b.z - b.d / 2);
      const dzr = (b.z + b.d / 2) - (p.z - r);
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) p.x = b.x - b.w / 2 - r;
      else if (m === dxr) p.x = b.x + b.w / 2 + r;
      else if (m === dzl) p.z = b.z - b.d / 2 - r;
      else p.z = b.z + b.d / 2 + r;
      return true;
    },
    /** Clamp a point inside the drivable city (beach included, sea excluded). */
    clampToWorld(p) {
      p.x = Math.max(24, Math.min(WORLD.width - 24, p.x));
      p.z = Math.max(24, Math.min(SEA_Z - 30, p.z));
      return p;
    },
    /** True when a point is on asphalt (used for the minimap and traffic). */
    isOnRoad(x, z) {
      if (z >= BEACH_Z) return false;
      const road = this.nearestRoad(x, z);
      return road.dist <= ROAD_HALF;
    },
  };
  return city;
}
