// Cars: their three.js meshes, the player's arcade driving, background
// traffic that follows the road grid, and police cars that chase the player.
// All movement is on the x/z plane; a car's `angle` faces (cos, sin) and its
// mesh is rotated by -angle to match three.js's Y rotation.
import { CAR, TRAFFIC, WANTED, WORLD, BEACH_Z, LANE } from './config.js';
import { ROADS_V, ROADS_H } from './world.js';
import { clampAngle, dist2d } from './random.js';

const THREE = window.THREE;

let nextCarId = 1;

/** Build a car's mesh (facing +x when angle is 0). Returns { group, lightBar }. */
export function createCarMesh(type, color) {
  const spec = CAR.types[type];
  const long = type === 'truck' ? 13 : CAR.length;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(long, 2.2, CAR.width), bodyMat);
  body.position.y = 1.6;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(long * 0.48, 1.8, CAR.width * 0.86),
    new THREE.MeshLambertMaterial({ color: 0x2e4a5a }),
  );
  cabin.position.set(type === 'truck' ? -2.5 : -0.6, 3.5, 0);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.9, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  for (const wx of [-long * 0.32, long * 0.32]) {
    for (const wz of [-CAR.width / 2 + 0.2, CAR.width / 2 - 0.2]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 1.1, wz);
      group.add(wheel);
    }
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const hz of [-1.7, 1.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 1), headMat);
    head.position.set(long / 2 + 0.1, 1.9, hz);
    group.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd23b2e });
  for (const tz of [-1.7, 1.7]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 1), tailMat);
    tail.position.set(-long / 2 - 0.1, 1.9, tz);
    group.add(tail);
  }
  let lightBar = null;
  if (type === 'police') {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 3.4), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    barBase.position.set(-0.6, 4.7, 0);
    group.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.6, 5.2, -0.85);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.set(-0.6, 5.2, 0.85);
    group.add(blue);
    lightBar = { red, blue };
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group, lightBar, bodyMat };
}

/** Create a car state object and attach its mesh to the scene. */
export function createCar(scene, rng, type, x, z, angle, driver, color) {
  const spec = CAR.types[type];
  const c = color !== undefined ? color : spec.colors[Math.floor(rng.next() * spec.colors.length)];
  const { group, lightBar, bodyMat } = createCarMesh(type, c);
  const car = {
    id: nextCarId, type, x, z, angle, speed: 0, color: c,
    driver, mesh: group, lightBar, bodyMat, road: null, brake: false,
  };
  nextCarId += 1;
  scene.add(group);
  syncCarMesh(car);
  return car;
}

/** Copy a car's simulation state onto its mesh. */
export function syncCarMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = -car.angle;
}

/** Spawn the background traffic on the road grid. */
export function spawnTraffic(scene, city, rng, count) {
  const cars = [];
  const types = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'truck'];
  for (let i = 0; i < count; i += 1) {
    const axis = rng.chance(0.5) ? 'v' : 'h';
    const at = axis === 'v' ? rng.pick(ROADS_V) : rng.pick(ROADS_H);
    const along = axis === 'v' ? rng.range(220, BEACH_Z - 40) : rng.range(220, WORLD.width - 220);
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = rng.chance(0.5) ? LANE : -LANE;
    const type = rng.pick(types);
    const x = axis === 'v' ? at + lane : along;
    const z = axis === 'v' ? along : at + lane;
    const angle = axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = createCar(scene, rng, type, x, z, angle, 'traffic');
    car.road = { axis, at, dir, lane };
    car.speed = rng.range(28, 52);
    car.cruise = car.speed;
    cars.push(car);
  }
  return cars;
}

/** The nearest car to a point, within maxDist (police optional). */
export function nearestCar(cars, x, z, maxDist, includePolice) {
  let best = null;
  let bd = maxDist;
  for (const car of cars) {
    if (car.driver === 'police' && !includePolice) continue;
    const d = dist2d(car.x, car.z, x, z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

/** Push two overlapping cars apart (circle collision, radius 6). A parked car
 * (driver 'none') is a fixed obstacle: it never moves, the other car does. */
function separateCars(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d >= 12 || d === 0) return;
  const push = 12 - d;
  const nx = dx / d;
  const nz = dz / d;
  const aParked = a.driver === 'none';
  const bParked = b.driver === 'none';
  if (aParked && bParked) return;
  if (aParked) {
    b.x += nx * push;
    b.z += nz * push;
    b.speed *= 0.85;
  } else if (bParked) {
    a.x -= nx * push;
    a.z -= nz * push;
    a.speed *= 0.85;
  } else {
    a.x -= (nx * push) / 2;
    a.z -= (nz * push) / 2;
    b.x += (nx * push) / 2;
    b.z += (nz * push) / 2;
    a.speed *= 0.85;
    b.speed *= 0.85;
  }
}

/** One traffic car's step: follow its road, turn at intersections, brake for cars ahead. */
function stepTrafficCar(car, state, dt) {
  const spec = CAR.types[car.type];
  // Brake if a car is close ahead.
  let target = car.cruise;
  const fx = Math.cos(car.angle);
  const fz = Math.sin(car.angle);
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 30 && d > 0.01 && (dx * fx + dz * fz) / d > 0.6) {
      target = Math.min(target, other.speed * 0.6);
    }
  }
  car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.z += Math.sin(car.angle) * car.speed * dt;

  // Turn at an intersection, or reverse at the end of the road.
  const road = car.road;
  const along = road.axis === 'v' ? car.z : car.x;
  const end = road.axis === 'v' ? BEACH_Z - 60 : WORLD.width - 220;
  if (along < 220 || along > end) {
    road.dir *= -1;
    car.angle += Math.PI;
    car.x = road.axis === 'v' ? road.at + road.lane : Math.max(220, Math.min(WORLD.width - 220, car.x));
    car.z = road.axis === 'v' ? Math.max(220, Math.min(BEACH_Z - 60, car.z)) : road.at + road.lane;
    return;
  }
  const cross = road.axis === 'v' ? ROADS_H : ROADS_V;
  for (const line of cross) {
    if (Math.abs(along - line) < 6 && state.rng.chance(0.12)) {
      const newAxis = road.axis === 'v' ? 'h' : 'v';
      const newDir = state.rng.chance(0.5) ? 1 : -1;
      const newLane = state.rng.chance(0.5) ? LANE : -LANE;
      car.road = { axis: newAxis, at: line, dir: newDir, lane: newLane };
      car.angle = newAxis === 'v' ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (newDir > 0 ? 0 : Math.PI);
      if (newAxis === 'v') car.x = line + newLane;
      else car.z = line + newLane;
      break;
    }
  }
}

/** The player's car: arcade throttle, steering and building collision. */
function stepPlayerCar(car, input, city, dt) {
  const spec = CAR.types[car.type];
  const throttle = input.up ? 1 : input.down ? -0.6 : 0;
  car.speed += throttle * spec.accel * dt;
  car.speed -= car.speed * 0.55 * dt;
  if (!input.up && !input.down) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = Math.max(-spec.top * 0.45, Math.min(spec.top, car.speed));
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  // A little grip even at a standstill, or a stopped car can never turn
  // toward its route and the driver is stuck at the intersection.
  const grip = Math.max(0.3, Math.min(1, Math.abs(car.speed) / (spec.top * 0.45)));
  car.angle += steer * spec.turn * grip * dt * Math.sign(car.speed || 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.z += Math.sin(car.angle) * car.speed * dt;
  if (city.resolveBuildings(car, 5.5)) car.speed *= 0.45;
  city.clampToWorld(car);
}

/** A police car: steer toward the player and ram. */
function stepPoliceCar(car, state, dt) {
  const spec = CAR.types.police;
  const p = state.player;
  const desired = Math.atan2(p.z - car.z, p.x - car.x);
  const diff = clampAngle(desired - car.angle);
  car.angle += Math.max(-1, Math.min(1, diff * 2.4)) * spec.turn * dt;
  const d = dist2d(car.x, car.z, p.x, p.z);
  const target = d < 26 ? spec.top * 0.55 : spec.top;
  car.speed += (target - car.speed) * Math.min(1, dt * 1.2);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.z += Math.sin(car.angle) * car.speed * dt;
  if (state.city.resolveBuildings(car, 5.5)) car.speed *= 0.5;
  state.city.clampToWorld(car);
  // Flash the light bar.
  if (car.lightBar) {
    const on = Math.floor(state.time * 6) % 2 === 0;
    car.lightBar.red.visible = on;
    car.lightBar.blue.visible = !on;
  }
  // Ram the player.
  if (d < 11) {
    if (p.car) {
      const push = 26 * dt;
      p.car.x += Math.cos(car.angle) * push;
      p.car.z += Math.sin(car.angle) * push;
      p.car.speed *= 0.96;
    } else {
      p.health -= 7 * dt;
    }
  }
}

/** Step every car: traffic, police, and the player's car. */
export function updateCars(state, input, dt) {
  for (const car of state.cars) {
    if (car.driver === 'traffic') stepTrafficCar(car, state, dt);
    else if (car.driver === 'police') stepPoliceCar(car, state, dt);
    else if (car.driver === 'player') stepPlayerCar(car, input, state.city, dt);
  }
  // Car-car separation.
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      separateCars(cars[i], cars[j]);
    }
  }
  for (const car of cars) syncCarMesh(car);
}

/** Keep the police count matched to the wanted level, spawning on roads away from the player. */
export function maintainPolice(state) {
  const want = WANTED.policeCars[state.wanted];
  const police = state.cars.filter((c) => c.driver === 'police');
  const p = state.player;
  while (police.length < want) {
    const spot = state.city.randomRoadPoint(state.rng, p, 420);
    const car = createCar(state.scene, state.rng, 'police', spot.x, spot.z, 0, 'police');
    state.cars.push(car);
    police.push(car);
  }
  // Despawn police that drifted far away when the heat is off.
  if (state.wanted === 0) {
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (car.driver === 'police' && dist2d(car.x, car.z, p.x, p.z) > 700) {
        state.scene.remove(car.mesh);
        state.cars.splice(i, 1);
      }
    }
  }
}
