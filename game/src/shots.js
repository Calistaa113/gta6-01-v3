// The screenshot scenes behind ?shot=title|drive|mission|hud. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by an autopilot that follows the road grid: it walks to a car,
// steals it, and drives the route to the mission marker (or flees the police
// along the roads), so the frame is what a short game really looks like and
// the same seed always gives the same frame.
import { STEP, WORLD, BEACH_Z } from './config.js';
import { ROADS_V, ROADS_H } from './world.js';
import { clampAngle, dist2d } from './random.js';
import { createCar } from './vehicles.js';
import { startMission } from './missions.js';

const TITLE_SECONDS = 5;
const DRIVE_SECONDS = 26;
const MISSION_SECONDS = 24;
const HUD_SECONDS = 10;

function nearestLine(lines, value) {
  let best = lines[0];
  let bd = Math.abs(value - lines[0]);
  for (const line of lines) {
    const d = Math.abs(value - line);
    if (d < bd) { bd = d; best = line; }
  }
  return best;
}

/**
 * A route through the road grid from `from` to `to`: snap onto the nearest
 * road, then an L-shaped run through the intersections to the one nearest
 * the target, then the target itself.
 */
function planRoute(city, from, to) {
  const road = city.nearestRoad(from.x, from.z);
  const snap = road.axis === 'v' ? { x: road.at, z: from.z } : { x: from.x, z: road.at };
  const ix0 = nearestLine(ROADS_V, from.x);
  const iz0 = nearestLine(ROADS_H, from.z);
  const ix1 = nearestLine(ROADS_V, to.x);
  const iz1 = nearestLine(ROADS_H, to.z);
  const raw = [snap, { x: ix0, z: iz0 }, { x: ix1, z: iz0 }, { x: ix1, z: iz1 }, { x: to.x, z: to.z }];
  const wps = [];
  for (const p of raw) {
    const last = wps[wps.length - 1];
    if (!last || dist2d(p.x, p.z, last.x, last.z) > 60) wps.push(p);
  }
  return wps;
}

/** The autopilot's state: its current route and how long it has been stuck. */
function createPilot() {
  return {
    route: null, routeTarget: null, wp: 0, stuckTimer: 0,
    lastX: 0, lastZ: 0, reverseTimer: 0, lastWp: -1, lastWpDist: Infinity, wpTimer: 0,
  };
}

/** Where the autopilot wants to go right now (a car to steal, or the mission target). */
function pilotTarget(world) {
  const s = world.state;
  const p = s.player;
  if (!p.car) {
    // On foot with a long way to go: steal a parked car first (one that
    // stays put — chasing moving traffic never catches it).
    let best = null;
    let bd = 150;
    for (const car of s.cars) {
      if (car.driver !== 'none') continue;
      const d = dist2d(car.x, car.z, p.x, p.z);
      if (d < bd) { bd = d; best = car; }
    }
    if (best) return { x: best.x, z: best.z, steal: true };
    // No parked car nearby: the nearest slow car, else the mission target.
    best = null;
    bd = 90;
    for (const car of s.cars) {
      if (car.driver === 'police' || Math.abs(car.speed) > 15) continue;
      const d = dist2d(car.x, car.z, p.x, p.z);
      if (d < bd) { bd = d; best = car; }
    }
    if (best) return { x: best.x, z: best.z, steal: true };
    const t = s.missionTarget();
    return t ? { x: t.x, z: t.z, steal: false } : null;
  }
  const t = s.missionTarget();
  return t ? { x: t.x, z: t.z, steal: false } : null;
}

/** The autopilot's input for one step. */
function autopilot(world, pilot, dt, flee) {
  const s = world.state;
  const p = s.player;
  const city = s.city;
  const ctrl = { up: false, down: false, left: false, right: false, run: false, interact: false };
  world.__lastCtrl = ctrl;

  let dest = null;
  if (flee) {
    dest = { x: 1800, z: 1300 };
    const road = city.nearestRoad(dest.x, dest.z);
    dest = road.axis === 'v' ? { x: road.at, z: dest.z } : { x: dest.x, z: road.at };
  } else {
    dest = pilotTarget(world);
  }
  if (!dest) return ctrl;

  const moved = !pilot.routeTarget
    || dist2d(dest.x, dest.z, pilot.routeTarget.x, pilot.routeTarget.z) > 60;
  if (moved || !pilot.route) {
    pilot.route = planRoute(city, p, dest);
    pilot.routeTarget = { x: dest.x, z: dest.z };
    pilot.wp = 0;
  }
  if (dist2d(p.x, p.z, pilot.lastX, pilot.lastZ) > 24) {
    pilot.stuckTimer = 0;
    pilot.lastX = p.x;
    pilot.lastZ = p.z;
  } else {
    pilot.stuckTimer += dt;
    if (pilot.stuckTimer > 3) {
      pilot.route = planRoute(city, p, dest);
      pilot.wp = 0;
      pilot.stuckTimer = 0;
      pilot.lastX = p.x;
      pilot.lastZ = p.z;
    }
  }

  let wp = pilot.route[Math.min(pilot.wp, pilot.route.length - 1)];
  let dx = wp.x - p.x;
  let dz = wp.z - p.z;
  let dist = Math.hypot(dx, dz);
  const reach = p.car ? 52 : 26;
  if (dist < reach) {
    if (pilot.wp < pilot.route.length - 1) {
      pilot.wp += 1;
      wp = pilot.route[Math.min(pilot.wp, pilot.route.length - 1)];
      dx = wp.x - p.x;
      dz = wp.z - p.z;
      dist = Math.hypot(dx, dz);
      pilot.lastWpDist = Infinity;
      pilot.wpTimer = 0;
    } else if (dest.steal && dist < 30) {
      ctrl.interact = true;
      return ctrl;
    } else if (!dest.steal && dist < 30) {
      return ctrl;
    }
  }
  if (dest.steal && !p.car && dist2d(dest.x, dest.z, p.x, p.z) < 14) {
    ctrl.interact = true;
    return ctrl;
  }

  const desired = Math.atan2(dz, dx);
  const diff = clampAngle(desired - p.angle);
  if (p.car) {
    let steerTarget = wp;
    if (dist < 130 && pilot.wp < pilot.route.length - 1) steerTarget = pilot.route[pilot.wp + 1];
    const steerDesired = Math.atan2(steerTarget.z - p.z, steerTarget.x - p.x);
    const steerDiff = clampAngle(steerDesired - p.angle);
    const steer = Math.max(-1, Math.min(1, steerDiff * 2));
    if (steer > 0.15) ctrl.left = true;
    if (steer < -0.15) ctrl.right = true;
    if (pilot.lastWp !== pilot.wp) {
      pilot.lastWp = pilot.wp;
      pilot.lastWpDist = dist;
      pilot.wpTimer = 0;
    }
    if (dist < pilot.lastWpDist - 30) {
      pilot.lastWpDist = dist;
      pilot.wpTimer = 0;
    } else pilot.wpTimer += dt;
    if (pilot.reverseTimer > 0) {
      pilot.reverseTimer -= dt;
      ctrl.down = true;
      // Steer opposite while reversing, so the nose swings toward the route
      // instead of away from it.
      ctrl.left = false;
      ctrl.right = false;
      if (steer > 0.15) ctrl.right = true;
      else if (steer < -0.15) ctrl.left = true;
    } else if (pilot.wpTimer > 1.5) {
      pilot.reverseTimer = 0.7;
      pilot.wpTimer = 0;
      pilot.lastWpDist = Infinity;
      pilot.route = planRoute(city, p, dest);
      pilot.wp = 0;
      ctrl.down = true;
    } else {
      ctrl.up = Math.abs(diff) < 2.0;
      ctrl.down = Math.abs(diff) > 2.4;
    }
  } else {
    if (diff > 0.15) ctrl.left = true;
    if (diff < -0.15) ctrl.right = true;
    ctrl.up = Math.abs(diff) < 1.2;
    ctrl.run = true;
  }
  return ctrl;
}

/** Put the player in a sports car on a road, heat at three stars, police closing in. */
function stageChase(world) {
  const s = world.state;
  const city = s.city;
  // Start on the long downtown road x=1800, heading south, so the flee to
  // (1800, 1300) is a straight run down one road and the car never cuts
  // across a block.
  const car = createCar(s.scene, s.rng, 'sports', 1800, 600, Math.PI / 2, 'player');
  car.road = { axis: 'v', at: 1800, dir: 1, lane: 0 };
  s.cars.push(car);
  s.player.car = car;
  s.player.x = car.x;
  s.player.z = car.z;
  s.player.angle = car.angle;
  s.setWanted(3);
  for (let i = 0; i < 2; i += 1) {
    const q = city.randomRoadPoint(s.rng, s.player, 700);
    const police = createCar(s.scene, s.rng, 'police', q.x, q.z, 0, 'police');
    s.cars.push(police);
  }
}

/**
 * Set the world to the named scene (title, drive, mission or hud) and return
 * the screen to show and the camera mode to use.
 */
export function stageShot(name, world) {
  const s = world.state;
  world.reset();
  const idle = { up: false, down: false, left: false, right: false, run: false, interact: false };
  if (name !== 'drive' && name !== 'mission' && name !== 'hud') {
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) world.step(idle, STEP);
    return { screen: 'title', camera: 'orbit' };
  }
  const pilot = createPilot();
  world.__pilot = pilot;
  if (name === 'hud') {
    startMission(s, 1);
    stageChase(world);
    for (let i = 0; i < HUD_SECONDS / STEP; i += 1) {
      const ctrl = autopilot(world, pilot, STEP, true);
      world.step(ctrl, STEP);
      if (ctrl.interact) world.interact();
    }
    return { screen: 'play', camera: 'car' };
  }
  if (name === 'mission') {
    startMission(s, 2);
    // The player starts in a sports car parked on the kerb by the spawn, so
    // the shot is a drive to the docks, not a walk.
    const car = createCar(s.scene, s.rng, 'sports', s.player.x + 44, s.player.z + 56, 0, 'none');
    s.cars.push(car);
    car.driver = 'player';
    s.player.car = car;
    s.player.x = car.x;
    s.player.z = car.z;
    s.player.angle = car.angle;
    for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
      const ctrl = autopilot(world, pilot, STEP, false);
      world.step(ctrl, STEP);
      if (ctrl.interact) world.interact();
      if (s.missionsDone >= 1) break;
    }
    s.setWanted(2);
    return { screen: 'play', camera: s.player.car ? 'car' : 'follow' };
  }
  // drive: the player starts in a sports car parked on the kerb by the
  // spawn, then the autopilot drives it to Mara's office.
  startMission(s, 0);
  const car = createCar(s.scene, s.rng, 'sports', s.player.x + 44, s.player.z + 56, 0, 'none');
  s.cars.push(car);
  car.driver = 'player';
  s.player.car = car;
  s.player.x = car.x;
  s.player.z = car.z;
  s.player.angle = car.angle;
  for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
    const ctrl = autopilot(world, pilot, STEP, false);
    world.step(ctrl, STEP);
    if (ctrl.interact) world.interact();
    if (s.missionsDone >= 1) break;
  }
  return { screen: 'play', camera: s.player.car ? 'car' : 'follow' };
}
