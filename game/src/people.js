// People: the player Dante Reyes and the pedestrians of Vistamar. Everyone
// is a small box humanoid with swinging legs; pedestrians follow the
// sidewalks, flee when the player makes trouble, and fall down when hit.
import { PLAYER, PEDS, WORLD, BEACH_Z, LANE } from './config.js';
import { ROADS_V, ROADS_H } from './world.js';
import { dist2d } from './random.js';

const THREE = window.THREE;

const SKIN = [0xd9a06b, 0xb07a4a, 0x8a5a32, 0xe8b88a];
const SHIRTS = [0x4a7fb5, 0xc94f43, 0x3fae5a, 0xe8b93a, 0x8a5a9a, 0xd9d9d9, 0x2e343c];
const PANTS = [0x2e343c, 0x3a4a5a, 0x5a4a3a, 0x6b6b6b];

/** Build a box humanoid facing +x. Returns { group, legL, legR, armL, armR, torsoMat }. */
export function createPersonMesh(rng, shirt, pants) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKIN) });
  const torsoMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 1.6), torsoMat);
  torso.position.y = 3.6;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), skin);
  head.position.y = 5.6;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.7), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  cap.position.y = 6.4;
  group.add(cap);

  function limb(w, h, d, mat, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    part.position.y = -h / 2;
    pivot.add(part);
    group.add(pivot);
    return pivot;
  }
  const legL = limb(0.9, 2.4, 0.9, pantsMat, 0, 2.4, -0.5);
  const legR = limb(0.9, 2.4, 0.9, pantsMat, 0, 2.4, 0.5);
  const armL = limb(0.7, 2.2, 0.7, torsoMat, 0, 4.7, -1.2);
  const armR = limb(0.7, 2.2, 0.7, torsoMat, 0, 4.7, 1.2);
  return { group, legL, legR, armL, armR, torsoMat };
}

/** Swing a humanoid's limbs to its walk phase. */
export function animateWalk(parts, phase, amount) {
  const s = Math.sin(phase) * 0.55 * amount;
  parts.legL.rotation.z = s;
  parts.legR.rotation.z = -s;
  parts.armL.rotation.z = -s * 0.8;
  parts.armR.rotation.z = s * 0.8;
}

/** Create the player at a spot. */
export function createPlayer(scene, rng, x, z, shirtColor) {
  const parts = createPersonMesh(rng, shirtColor, 0x2e343c);
  const player = {
    x, z, angle: -Math.PI / 2, speed: 0, health: PLAYER.health,
    money: 120, weapon: 'fists', ammo: PLAYER.startAmmo,
    shirtColor, car: null, mesh: parts.group, parts,
    walkPhase: 0, punchCooldown: 0, shootCooldown: 0,
    lastAttack: -100, bustTimer: 0,
  };
  scene.add(parts.group);
  syncPersonMesh(player);
  return player;
}

/** Copy a person's simulation state onto its mesh. */
export function syncPersonMesh(p) {
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = -p.angle;
}

/** Spawn pedestrians that walk the sidewalks. */
export function spawnPedestrians(scene, city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const axis = rng.chance(0.5) ? 'v' : 'h';
    const at = axis === 'v' ? rng.pick(ROADS_V) : rng.pick(ROADS_H);
    const along = axis === 'v' ? rng.range(220, BEACH_Z - 40) : rng.range(220, WORLD.width - 220);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = axis === 'v' ? at + side * 44 : along;
    const z = axis === 'v' ? along : at + side * 44;
    const parts = createPersonMesh(rng, rng.pick(SHIRTS), rng.pick(PANTS));
    const ped = {
      x, z, angle: rng.range(0, Math.PI * 2), speed: rng.range(5, 9),
      road: { axis, at, dir: rng.chance(0.5) ? 1 : -1, side },
      state: 'walk', downTimer: 0, health: 100, isLookout: false,
      mesh: parts.group, parts, walkPhase: rng.range(0, 6),
    };
    scene.add(parts.group);
    syncPersonMesh(ped);
    peds.push(ped);
  }
  return peds;
}

/** A pedestrian's step: walk its sidewalk, turn at intersections, flee trouble. */
function stepPed(ped, state, dt) {
  const p = state.player;
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) {
      // Get back up somewhere else in the city.
      const spot = state.city.randomRoadPoint(state.rng, p, 300);
      ped.x = spot.x;
      ped.z = spot.z;
      ped.health = 100;
      ped.state = 'walk';
      ped.mesh.rotation.x = 0;
      ped.mesh.position.y = 0;
    }
    return;
  }
  const dPlayer = dist2d(ped.x, ped.z, p.x, p.z);
  const trouble = (state.time - p.lastAttack < 2 && dPlayer < 60) || state.wanted >= 3;
  if (trouble && dPlayer < 70) ped.state = 'flee';
  else if (ped.state === 'flee' && dPlayer > 130) ped.state = 'walk';

  if (ped.state === 'flee') {
    const away = Math.atan2(ped.z - p.z, ped.x - p.x);
    ped.angle += (away - ped.angle) * Math.min(1, dt * 6);
    ped.x += Math.cos(ped.angle) * PEDS.fleeSpeed * dt;
    ped.z += Math.sin(ped.angle) * PEDS.fleeSpeed * dt;
    ped.walkPhase += dt * 14;
  } else {
    // Walk along the sidewalk; reverse at the ends, turn at intersections.
    const road = ped.road;
    const along = road.axis === 'v' ? ped.z : ped.x;
    const end = road.axis === 'v' ? BEACH_Z - 60 : WORLD.width - 220;
    if (along < 220 || along > end) road.dir *= -1;
    const cross = road.axis === 'v' ? ROADS_H : ROADS_V;
    for (const line of cross) {
      if (Math.abs(along - line) < 4 && state.rng.chance(0.08)) {
        const newAxis = road.axis === 'v' ? 'h' : 'v';
        ped.road = { axis: newAxis, at: line, dir: state.rng.chance(0.5) ? 1 : -1, side: road.side };
        break;
      }
    }
    const r = ped.road;
    ped.angle = r.axis === 'v' ? (r.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (r.dir > 0 ? 0 : Math.PI);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.z += Math.sin(ped.angle) * ped.speed * dt;
    if (r.axis === 'v') ped.x = r.at + r.side * 44;
    else ped.z = r.at + r.side * 44;
    ped.walkPhase += dt * 8;
  }
  state.city.clampToWorld(ped);
  state.city.resolveBuildings(ped, 2);
  animateWalk(ped.parts, ped.walkPhase, ped.state === 'flee' ? 1 : 0.6);
  syncPersonMesh(ped);
}

/** Step all pedestrians. */
export function updatePeds(state, dt) {
  for (const ped of state.peds) stepPed(ped, state, dt);
}

/** The player on foot: tank-style movement, building collision, walk cycle. */
export function updatePlayerOnFoot(player, input, city, dt) {
  const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  player.angle += turn * 2.8 * dt;
  const want = input.up ? 1 : input.down ? -0.55 : 0;
  const top = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const target = want * top;
  player.speed += (target - player.speed) * Math.min(1, dt * 8);
  player.x += Math.cos(player.angle) * player.speed * dt;
  player.z += Math.sin(player.angle) * player.speed * dt;
  if (city.resolveBuildings(player, PLAYER.radius)) player.speed *= 0.4;
  city.clampToWorld(player);
  player.walkPhase += dt * Math.abs(player.speed) * 0.55;
  animateWalk(player.parts, player.walkPhase, Math.min(1, Math.abs(player.speed) / PLAYER.walkSpeed));
  syncPersonMesh(player);
}

/**
 * The player's attack (click): a punch up close, or a pistol shot at range.
 * Returns the thing hit, or null.
 */
export function playerAttack(state) {
  const p = state.player;
  if (p.car || p.punchCooldown > 0) return null;
  p.lastAttack = state.time;
  if (p.weapon === 'pistol') {
    if (p.ammo <= 0 || p.shootCooldown > 0) return null;
    p.ammo -= 1;
    p.shootCooldown = PLAYER.shootCooldown;
    p.punchCooldown = 0.12;
    return shootAt(state, p.x, p.z, p.angle, 130, 34, 0.22);
  }
  p.punchCooldown = 0.38;
  return shootAt(state, p.x, p.z, p.angle, PLAYER.punchRange, PLAYER.punchDamage, PLAYER.punchArc);
}

/** Hitscan in a cone from (x,z) along `angle`: nearest ped or car, or null. */
export function shootAt(state, x, z, angle, range, damage, arc) {
  let best = null;
  let bd = range;
  const fx = Math.cos(angle);
  const fz = Math.sin(angle);
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - x;
    const dz = ped.z - z;
    const d = Math.hypot(dx, dz);
    if (d < bd && d > 0.01 && (dx * fx + dz * fz) / d > Math.cos(arc)) {
      bd = d;
      best = { kind: 'ped', target: ped, dist: d };
    }
  }
  for (const car of state.cars) {
    if (car.driver === 'player') continue;
    const dx = car.x - x;
    const dz = car.z - z;
    const d = Math.hypot(dx, dz);
    if (d < bd && d > 0.01 && (dx * fx + dz * fz) / d > Math.cos(arc)) {
      bd = d;
      best = { kind: 'car', target: car, dist: d };
    }
  }
  if (!best) return null;
  if (best.kind === 'ped') {
    const ped = best.target;
    ped.health -= damage;
    if (ped.health <= 0) {
      ped.state = 'down';
      ped.downTimer = 14;
      ped.mesh.rotation.x = Math.PI / 2;
      ped.mesh.position.y = 0.8;
      state.addWanted(1);
      if (ped.isLookout) state.missionProgress('lookout', ped);
    } else {
      state.addWanted(1);
    }
  } else {
    state.addWanted(1);
  }
  return best;
}
