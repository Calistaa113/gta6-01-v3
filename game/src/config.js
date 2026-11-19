// Every tuning number, colour and city constant in one place. The world is
// a fixed-size coastal city (WORLD.width x WORLD.height) on the x/z plane,
// y up; the simulation runs in fixed 1/60 s steps whatever the display rate.
export const STEP = 1 / 60;

/** The city: a grid of roads every ROAD_EVERY apart, blocks holding buildings. */
export const WORLD = { width: 3600, height: 2600 };
export const ROAD_EVERY = 400;
export const ROAD_HALF = 34; // half-width of a road, kerb to kerb
export const LANE = 15; // lane offset from a road's centre line
export const BEACH_Z = 2280; // south of here is sand, then the sea
export const SEA_Z = 2600; // the sea plane starts here

/** Logical viewport the renderer scales to the window. */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 2.2,
  walkSpeed: 26,
  runSpeed: 44,
  health: 100,
  punchDamage: 34,
  punchRange: 7,
  punchArc: 1.1,
  shootCooldown: 0.22,
  bulletSpeed: 420,
  startAmmo: 24,
  maxAmmo: 120,
};

export const CAR = {
  length: 11,
  width: 5,
  // Per-type: top speed, acceleration, grip (turn rate), colour set.
  types: {
    sedan: { top: 95, accel: 65, turn: 2.4, colors: [0xc94f43, 0x4a7fb5, 0xc9a13b, 0x7d8a99] },
    taxi: { top: 88, accel: 60, turn: 2.5, colors: [0xe8b93a] },
    sports: { top: 125, accel: 95, turn: 3.2, colors: [0xd21f3c, 0x1fd2b5, 0xf2f2f2] },
    truck: { top: 70, accel: 42, turn: 1.8, colors: [0x8a7d6b, 0x5d7d5a] },
    police: { top: 110, accel: 82, turn: 2.9, colors: [0x1c2733] },
  },
};

export const TRAFFIC = { count: 30, minGap: 26, spawnMargin: 220 };
export const PEDS = { count: 42, walkSpeed: 7, fleeSpeed: 20 };

export const WANTED = {
  max: 5,
  // seconds of staying out of every cop's sight before one star drops
  decaySeconds: 26,
  // police cars on the map per wanted level (index = stars)
  policeCars: [0, 1, 2, 3, 4, 6],
  // how far a cop can see the player, in world units
  sight: 130,
};

export const ECONOMY = {
  startMoney: 120,
  sprayCost: 150,
  pistolCost: 300,
  ammoCost: 60,
  ammoAmount: 36,
  clothesCost: 80,
  bustFine: 200,
  hospitalCost: 120,
};

/** Colours as three.js hex numbers (and CSS strings where the HUD needs them). */
export const PALETTE = {
  sky: 0x8ec9e8,
  sea: 0x2f7fb5,
  sand: 0xd9c48f,
  grass: 0x6da34e,
  park: 0x5d9148,
  road: 0x3c3f46,
  roadLine: 0xd8c95a,
  kerb: 0x9a9a92,
  sidewalk: 0xb9b3a4,
  downtown: 0x7a6a72,
  buildingGlass: 0x5d7d8a,
  player: 0xf2c94c,
  cop: 0x2f6fd0,
  hud: 0x101318,
  text: 0xf2f0e6,
  muted: 0xb9b3a4,
  red: 0xd23b2e,
  green: 0x3fae5a,
  gold: 0xe8b93a,
  mission: 0xff9f1c,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best run is kept between visits (this browser only). */
export const SAVE_KEY = 'vistamar.save.v1';

export const GAME_NAME = 'Vistamar';
export const CITY_NAME = 'Vistamar';
export const PROTAGONIST = 'Dante Reyes';
export const FIXER = 'Mara Solis';
