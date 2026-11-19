// The eight jobs Mara Solis has for Dante Reyes. Each mission is a list of
// stages — go somewhere, steal and deliver a car, pick up and drop off, lose
// the heat, take down lookouts — and pays on completion. The mission engine
// tracks the current stage, its target, and its completion.
import { SPOTS } from './world.js';
import { ECONOMY } from './config.js';
import { createPersonMesh, syncPersonMesh } from './people.js';
import { dist2d } from './random.js';
import { nearestCar } from './vehicles.js';

export const MISSIONS = [
  {
    title: 'First Day on the Job',
    briefing: 'Mara Solis runs Vistamar from a downtown office. Go see her.',
    reward: 200,
    stages: [{ kind: 'goto', spot: 'maraOffice', label: 'Go to Mara’s office' }],
  },
  {
    title: 'Need Wheels',
    briefing: 'Mara needs a fast car and she is not paying for one. Steal a sports car and bring it to Rico’s garage.',
    reward: 350,
    stages: [
      { kind: 'steal', label: 'Steal a car (press E near one)' },
      { kind: 'deliver', spot: 'garage', label: 'Deliver the car to Rico’s garage', needCar: true },
    ],
  },
  {
    title: 'The Package',
    briefing: 'A package is waiting at the docks. Pick it up and take it to the beach bar. No questions.',
    reward: 400,
    stages: [
      { kind: 'pickup', spot: 'docks', label: 'Pick up the package at the docks' },
      { kind: 'deliver', spot: 'beachBar', label: 'Deliver the package to the beach bar' },
    ],
  },
  {
    title: 'Heat',
    briefing: 'The Vistamar PD is all over you. Lose the heat — all of it — and stay free.',
    reward: 500,
    stages: [{ kind: 'escape', label: 'Lose the wanted level', startWanted: 3 }],
  },
  {
    title: 'Lookouts',
    briefing: 'Rival lookouts are watching Mara’s streets. Take down all three.',
    reward: 600,
    stages: [{ kind: 'takedown', count: 3, spots: ['lookout1', 'lookout2', 'lookout3'], label: 'Take down the lookouts (0/3)' }],
  },
  {
    title: 'The Vault',
    briefing: 'Hit Vistamar Bank, then run for the safehouse with the whole PD behind you.',
    reward: 800,
    stages: [
      { kind: 'goto', spot: 'bank', label: 'Reach Vistamar Bank' },
      { kind: 'escape', spot: 'safehouse', label: 'Escape to the safehouse', startWanted: 3 },
    ],
  },
  {
    title: 'Harbor Lights',
    briefing: 'A crate at the docks goes to the yacht at the marina. The harbour master asks no questions. Neither do you.',
    reward: 700,
    stages: [
      { kind: 'pickup', spot: 'docks', label: 'Pick up the crate at the docks' },
      { kind: 'deliver', spot: 'yacht', label: 'Deliver the crate to the yacht' },
    ],
  },
  {
    title: 'King of Vistamar',
    briefing: 'The Marlin Tower penthouse is where this ends. Get past the guards and take the top floor.',
    reward: 1500,
    stages: [
      { kind: 'goto', spot: 'tower', label: 'Reach the Marlin Tower' },
      { kind: 'takedown', count: 4, spots: ['tower', 'tower', 'tower', 'tower'], label: 'Take down the guards (0/4)' },
      { kind: 'goto', spot: 'tower', label: 'Take the penthouse' },
    ],
  },
];

/** Place lookout peds at the given spots (new peds, marked for the mission). */
function spawnLookouts(state, spots) {
  const made = [];
  for (const spotName of spots) {
    const spot = SPOTS[spotName];
    const parts = createPersonMesh(state.rng, 0x1c2733, 0x1c2733);
    const ped = {
      x: spot.x + state.rng.range(-14, 14), z: spot.z + state.rng.range(-14, 14),
      angle: state.rng.range(0, Math.PI * 2), speed: 7,
      road: { axis: 'v', at: 1800, dir: 1, side: 1 },
      state: 'walk', downTimer: 0, health: 100, isLookout: true,
      mesh: parts.group, parts, walkPhase: 0,
    };
    state.scene.add(parts.group);
    syncPersonMesh(ped);
    state.peds.push(ped);
    made.push(ped);
  }
  return made;
}

/** Start mission `index` (0-based) and set up its first stage. */
export function startMission(state, index) {
  const def = MISSIONS[index];
  state.mission = { index, def, stage: 0, done: 0, lookouts: [], lookoutsDown: 0 };
  enterStage(state);
}

/** Set up the current stage (spawn lookouts, set wanted). */
function enterStage(state) {
  const m = state.mission;
  const stage = m.def.stages[m.stage];
  if (!stage) return;
  if (stage.kind === 'takedown') {
    m.lookouts = spawnLookouts(state, stage.spots);
    m.lookoutsDown = 0;
  }
  if (stage.startWanted) state.setWanted(stage.startWanted);
}

/** The current mission's target for the HUD, minimap and beacon. */
export function missionTarget(state) {
  const m = state.mission;
  if (!m || m.index >= MISSIONS.length) return null;
  const stage = m.def.stages[m.stage];
  if (!stage) return null;
  const p = state.player;
  if (stage.kind === 'steal') {
    const car = nearestCar(state.cars, p.x, p.z, 1e9, false);
    return car ? { x: car.x, z: car.z, label: 'Steal a car' } : null;
  }
  if (stage.kind === 'escape' && stage.spot) {
    const spot = SPOTS[stage.spot];
    return { x: spot.x, z: spot.z, label: stage.label };
  }
  if (stage.kind === 'escape') return { x: p.x, z: p.z, label: stage.label };
  if (stage.kind === 'takedown') {
    const alive = m.lookouts.find((l) => l.state !== 'down');
    return alive ? { x: alive.x, z: alive.z, label: stage.label } : { x: p.x, z: p.z, label: stage.label };
  }
  const spot = SPOTS[stage.spot];
  return spot ? { x: spot.x, z: spot.z, label: stage.label } : null;
}

/** A lookout was taken down: count it toward the current takedown stage. */
export function missionProgress(state, kind) {
  const m = state.mission;
  if (!m || kind !== 'lookout') return;
  const stage = m.def.stages[m.stage];
  if (!stage || stage.kind !== 'takedown') return;
  m.lookoutsDown += 1;
}

/** Advance one stage, or complete the mission. Returns 'stage' | 'mission' | null. */
function advance(state) {
  const m = state.mission;
  m.stage += 1;
  if (m.stage >= m.def.stages.length) {
    state.player.money += m.def.reward;
    state.missionsDone += 1;
    state.banner(`${m.def.title} complete`, `+$${m.def.reward} — ${state.missionsDone} of ${MISSIONS.length} jobs done`);
    state.save();
    if (m.index + 1 < MISSIONS.length) {
      startMission(state, m.index + 1);
      state.toast(`New job: ${MISSIONS[m.index + 1].title}`);
    } else {
      state.mission = null;
      state.banner('KING OF VISTAMAR', 'All eight jobs done. The city is yours, Dante.');
    }
    return 'mission';
  }
  enterStage(state);
  return 'stage';
}

/** Check the current stage's completion every step. */
export function updateMissions(state) {
  const m = state.mission;
  if (!m) return;
  const stage = m.def.stages[m.stage];
  if (!stage) return;
  const p = state.player;
  if (stage.kind === 'goto' || stage.kind === 'pickup' || stage.kind === 'deliver') {
    const spot = SPOTS[stage.spot];
    if (dist2d(p.x, p.z, spot.x, spot.z) < 16) {
      if (stage.kind === 'deliver' && stage.needCar && !p.car) return;
      if (stage.kind === 'pickup') state.toast('Picked up. Deliver it.');
      advance(state);
    }
  } else if (stage.kind === 'steal') {
    if (p.car) advance(state);
  } else if (stage.kind === 'escape') {
    if (state.wanted === 0) {
      if (stage.spot) {
        const spot = SPOTS[stage.spot];
        if (dist2d(p.x, p.z, spot.x, spot.z) < 16) advance(state);
      } else advance(state);
    }
  } else if (stage.kind === 'takedown') {
    if (m.lookoutsDown >= stage.count) advance(state);
  }
}

/** The label the HUD shows for the current objective. */
export function missionLabel(state) {
  const m = state.mission;
  if (!m) return 'All jobs done — free roam. Press R to start over.';
  const stage = m.def.stages[m.stage];
  let label = stage.label;
  if (stage.kind === 'takedown') label = `${stage.label.split('(')[0].trim()} (${m.lookoutsDown}/${stage.count})`;
  return `${m.def.title} — ${label}`;
}
