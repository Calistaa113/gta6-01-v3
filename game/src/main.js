// Vistamar: the boot, the fixed-step game loop, the state machine (title /
// play / pause / busted / wasted), shops, saving, and the ?shot= scenes.
// The simulation runs in fixed 1/60 s steps; rendering follows the display.
import { STEP, WORLD, ECONOMY, SAVE_KEY, GAME_NAME, CAR } from './config.js';
import { createRng } from './random.js';
import { createCity, SPOTS } from './world.js';
import { buildCityMeshes } from './city.js';
import { createRenderer, createCameraRig, updateCamera, snapCamera } from './render.js';
import { createCar, spawnTraffic, nearestCar, updateCars, maintainPolice } from './vehicles.js';
import { createPlayer, spawnPedestrians, updatePeds, updatePlayerOnFoot, playerAttack, syncPersonMesh } from './people.js';
import { MISSIONS, startMission, updateMissions, missionTarget, missionProgress } from './missions.js';
import { addWanted, setWanted, updateWanted } from './wanted.js';
import { createHud, updateHud, drawMinimap } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';

const THREE = window.THREE;
const SHIRT_COLORS = [0xf2c94c, 0x4a7fb5, 0xc94f43, 0x3fae5a, 0x8a5a9a, 0xd9d9d9];

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Build the whole world: renderer, city, player, traffic, pedestrians, HUD. */
export function createWorld(seed) {
  const canvas = document.getElementById('game');
  const { renderer, scene, camera } = createRenderer(canvas);
  const rig = createCameraRig();
  const hud = createHud();
  const audio = createAudio();
  const orbit = { yawOffset: 0, pitchOffset: 0 };
  const input = createInput(canvas, orbit);
  const rng = createRng(seed);
  const city = createCity(rng);
  buildCityMeshes(scene, city);

  // The mission beacon: a glowing column and a floating diamond at the target.
  const beacon = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  column.position.y = 45;
  beacon.add(column);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(4),
    new THREE.MeshBasicMaterial({ color: 0xff9f1c }),
  );
  diamond.position.y = 95;
  beacon.add(diamond);
  scene.add(beacon);

  const state = {
    time: 0, rng, city, scene, camera, rig, hud, audio, input,
    player: null, cars: [], peds: [],
    wanted: 0, hiddenTimer: 0, mission: null, missionsDone: 0,
    screen: 'title', shopOpen: null, bannerUntil: 0, toastUntil: 0,
    endReason: null, cameraMode: 'orbit', shot: null,
    addWanted(n) { addWanted(state, n); },
    setWanted(n) { setWanted(state, n); },
    missionTarget() { return missionTarget(state); },
    missionProgress(kind) { missionProgress(state, kind); },
    sound(name) { audio.play(name); },
    banner(title, sub) {
      hud.banner.innerHTML = `${title}<small>${sub || ''}</small>`;
      state.bannerUntil = state.time + 3.5;
    },
    toast(text) {
      hud.toast.textContent = text;
      state.toastUntil = state.time + 3;
    },
    save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          money: Math.floor(state.player.money),
          missionsDone: state.missionsDone,
          weapon: state.player.weapon,
          ammo: state.player.ammo,
          ownsPistol: state.player.ownsPistol,
          shirtColor: state.player.shirtColor,
        }));
      } catch { /* saving is best-effort */ }
    },
    endGame(reason) {
      if (state.screen === 'end') return;
      state.endReason = reason;
      const p = state.player;
      if (reason === 'busted') {
        p.money = Math.max(0, p.money - ECONOMY.bustFine);
        hud.endTitle.textContent = 'BUSTED';
        hud.endText.textContent = `The Vistamar PD caught you. Fine: $${ECONOMY.bustFine}. Mara is not impressed.`;
      } else {
        p.money = Math.max(0, p.money - ECONOMY.hospitalCost);
        hud.endTitle.textContent = 'WASTED';
        hud.endText.textContent = `You woke up in Vistamar General. Hospital bill: $${ECONOMY.hospitalCost}.`;
      }
      state.save();
      state.screen = 'end';
      hud.end.style.display = 'flex';
    },
  };

  /** (Re)build the dynamic actors: player, traffic, pedestrians, parked cars. */
  function buildDynamic() {
    for (const car of state.cars) scene.remove(car.mesh);
    for (const ped of state.peds) scene.remove(ped.mesh);
    state.cars = [];
    state.peds = [];
    state.wanted = 0;
    state.hiddenTimer = 0;
    state.mission = null;
    state.missionsDone = 0;
    state.time = 0;
    state.bannerUntil = 0;
    state.toastUntil = 0;
    if (state.player) scene.remove(state.player.mesh);
    const p = createPlayer(scene, rng, SPOTS.spawn.x, SPOTS.spawn.z, SHIRT_COLORS[0]);
    p.ownsPistol = false;
    state.player = p;
    state.cars = spawnTraffic(scene, city, rng, 30);
    state.peds = spawnPedestrians(scene, city, rng, 42);
    // A few parked cars to steal without raising the heat.
    const parked = [
      { x: 640, z: 960 }, { x: 1040, z: 1440 }, { x: 2240, z: 640 },
      { x: 2640, z: 1840 }, { x: 1440, z: 2240 },
    ];
    for (const spot of parked) {
      const type = rng.pick(['sedan', 'sedan', 'sports', 'taxi']);
      const car = createCar(scene, rng, type, spot.x, spot.z, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'none');
      state.cars.push(car);
    }
  }

  buildDynamic();

  /** One fixed simulation step. */
  function step(inputState, dt) {
    state.time += dt;
    const p = state.player;
    p.punchCooldown = Math.max(0, p.punchCooldown - dt);
    p.shootCooldown = Math.max(0, p.shootCooldown - dt);
    if (state.time - p.lastAttack > 8 && p.health < 100) p.health = Math.min(100, p.health + 4 * dt);
    if (!p.car) updatePlayerOnFoot(p, inputState, city, dt);
    updateCars(state, inputState, dt);
    // The driver rides in the car: glue the player to it and hide the
    // on-foot mesh, so the camera, HUD and minimap follow the car.
    if (p.car) {
      p.x = p.car.x;
      p.z = p.car.z;
      p.angle = p.car.angle;
      p.mesh.visible = false;
    } else {
      p.mesh.visible = true;
    }
    updatePeds(state, dt);
    updateMissions(state);
    updateWanted(state, dt);
    maintainPolice(state);
  }

  /** Enter/exit a car, or open a shop. Called on E (and by the autopilot). */
  function interact() {
    const p = state.player;
    if (state.shopOpen) { closeShop(); return; }
    if (!p.car) {
      for (const [kind, spot] of Object.entries({ arms: SPOTS.arms, spray: SPOTS.spray, clothes: SPOTS.clothes })) {
        if (Math.hypot(p.x - spot.x, p.z - spot.z) < 22) { openShop(kind); return; }
      }
    }
    if (p.car) {
      const car = p.car;
      car.driver = 'none';
      p.car = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 9;
      p.z = car.z + Math.sin(car.angle + Math.PI / 2) * 9;
      p.angle = car.angle;
      city.clampToWorld(p);
      syncPersonMesh(p);
      audio.play('car');
      return;
    }
    const car = nearestCar(state.cars, p.x, p.z, 13, false);
    if (car) {
      if (car.driver === 'traffic') addWanted(state, 1);
      car.driver = 'player';
      p.car = car;
      p.x = car.x;
      p.z = car.z;
      p.angle = car.angle;
      audio.play('car');
    }
  }

  const SHOPS = {
    arms: {
      name: 'Vistamar Arms', desc: 'Guns and ammo. No questions, cash only.',
      items: [
        { label: 'Pistol — $300', cost: ECONOMY.pistolCost, can: () => !state.player.ownsPistol, run: () => { state.player.ownsPistol = true; state.player.weapon = 'pistol'; state.player.ammo += 24; } },
        { label: 'Ammo +36 — $60', cost: ECONOMY.ammoCost, can: () => state.player.ownsPistol, run: () => { state.player.ammo = Math.min(120, state.player.ammo + 36); } },
      ],
    },
    spray: {
      name: 'Spray & Go', desc: 'New paint, no questions. Lose the heat.',
      items: [
        { label: 'Lose wanted + repaint — $150', cost: ECONOMY.sprayCost, can: () => state.wanted > 0, run: () => { setWanted(state, 0); repaintCar(); } },
        { label: 'Repaint only — $50', cost: 50, can: () => !!state.player.car, run: () => repaintCar() },
      ],
    },
    clothes: {
      name: 'Threadline', desc: 'Fresh shirts for a fresh start.',
      items: [
        { label: 'New shirt colour — $80', cost: ECONOMY.clothesCost, can: () => true, run: () => {
          const i = SHIRT_COLORS.indexOf(state.player.shirtColor);
          const next = SHIRT_COLORS[(i + 1) % SHIRT_COLORS.length];
          state.player.shirtColor = next;
          state.player.parts.torsoMat.color.set(next);
        } },
      ],
    },
  };

  function repaintCar() {
    const car = state.player.car;
    if (!car || !car.bodyMat) return;
    const colors = CAR.types[car.type].colors;
    car.bodyMat.color.set(colors[Math.floor(state.rng.next() * colors.length)]);
  }

  function openShop(kind) {
    const shop = SHOPS[kind];
    state.shopOpen = kind;
    hud.shopName.textContent = shop.name;
    hud.shopDesc.textContent = shop.desc;
    hud.shopItems.innerHTML = '';
    for (const item of shop.items) {
      const b = document.createElement('button');
      b.textContent = item.label;
      const ok = item.can() && state.player.money >= item.cost;
      b.disabled = !ok;
      b.addEventListener('click', () => {
        if (state.player.money < item.cost) return;
        state.player.money -= item.cost;
        item.run();
        audio.play('cash');
        state.save();
        closeShop();
      });
      hud.shopItems.appendChild(b);
    }
    const close = document.createElement('button');
    close.textContent = 'Leave';
    close.addEventListener('click', closeShop);
    hud.shopItems.appendChild(close);
    hud.shop.style.display = 'block';
  }

  function closeShop() {
    state.shopOpen = null;
    hud.shop.style.display = 'none';
  }

  /** Reset the world to a fresh run (keeps the static city). */
  function reset() {
    buildDynamic();
    state.screen = 'play';
    state.cameraMode = 'follow';
    hud.title.style.display = 'none';
    hud.pause.style.display = 'none';
    hud.end.style.display = 'none';
    closeShop();
  }

  /** Start (or continue) the game from the title screen. */
  function startGame() {
    const save = loadSave();
    reset();
    if (save) {
      const p = state.player;
      p.money = save.money;
      p.weapon = save.weapon || 'fists';
      p.ammo = save.ammo || 0;
      p.ownsPistol = !!save.ownsPistol;
      p.shirtColor = save.shirtColor || SHIRT_COLORS[0];
      p.parts.torsoMat.color.set(p.shirtColor);
      state.missionsDone = save.missionsDone || 0;
      if (state.missionsDone > 0 && state.missionsDone < MISSIONS.length) {
        startMission(state, state.missionsDone);
      } else if (state.missionsDone >= MISSIONS.length) {
        state.mission = null;
      } else {
        startMission(state, 0);
      }
    } else {
      startMission(state, 0);
    }
    state.banner(`${GAME_NAME}`, 'Mara has work for you. Follow the orange beacon.');
  }

  const world = {
    state, step, interact, reset, startGame,
    /** Render one frame: camera, HUD, minimap, the 3D scene. */
    render(dt, time) {
      const p = state.player;
      const mode = state.screen === 'title' ? 'orbit' : (p.car ? 'car' : 'follow');
      const focus = { x: p.x, z: p.z, y: 0 };
      updateCamera(camera, rig, focus, p.angle, state.cameraMode === 'orbit' ? 'orbit' : mode, orbit, dt, time);
      const target = missionTarget(state);
      if (target && state.screen === 'play') {
        beacon.visible = true;
        beacon.position.set(target.x, 0, target.z);
        diamond.rotation.y = time * 1.5;
        column.material.opacity = 0.22 + Math.sin(time * 3) * 0.08;
      } else beacon.visible = false;
      updateHud(hud, state);
      drawMinimap(hud, state);
      renderer.render(scene, camera);
    },
  };
  return world;
}

/** Boot the game. */
function boot() {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') || 1);
  const shot = params.get('shot');
  const world = createWorld(seed);
  const state = world.state;
  const hud = state.hud;
  const input = state.input;
  window.__vistamar = world;

  const save = loadSave();
  if (save && save.missionsDone > 0) {
    hud.titleSave.textContent = `Save found: $${save.money}, ${save.missionsDone} of ${MISSIONS.length} jobs done — press Enter to continue.`;
  }

  if (shot) {
    const staged = stageShot(shot, world);
    state.screen = staged.screen;
    state.cameraMode = staged.camera;
    hud.title.style.display = staged.screen === 'title' ? 'flex' : 'none';
    if (staged.screen === 'title') hud.titleGo.textContent = 'VISTAMAR — SUN · SEA · SIRENS';
    snapCamera(state.camera, state.rig, { x: state.player.x, z: state.player.z, y: 0 }, state.player.angle, staged.camera, { yawOffset: 0, pitchOffset: 0 });
    world.render(0.016, 0);
    document.title = 'SHOT-READY';
  }

  let last = performance.now();
  let acc = 0;
  const idle = { up: false, down: false, left: false, right: false, run: false, interact: false };

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    // Edge-triggered keys.
    if (input.pressed('pause')) {
      if (state.shopOpen) {
        state.shopOpen = null;
        hud.shop.style.display = 'none';
      } else if (state.screen === 'play') {
        state.screen = 'pause';
        hud.pause.style.display = 'flex';
      } else if (state.screen === 'pause') {
        state.screen = 'play';
        hud.pause.style.display = 'none';
      }
    }
    if (input.pressed('confirm')) {
      if (state.screen === 'title') world.startGame();
      else if (state.screen === 'end') world.startGame();
    }
    if (input.pressed('restart')) {
      try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      world.reset();
      state.screen = 'title';
      hud.title.style.display = 'flex';
      hud.pause.style.display = 'none';
      hud.end.style.display = 'none';
      hud.titleGo.textContent = 'PRESS ENTER TO PLAY';
    }
    if (input.pressed('weapon1')) state.player.weapon = 'fists';
    if (input.pressed('weapon2') && state.player.ownsPistol) state.player.weapon = 'pistol';
    if (input.pressed('interact') && state.screen === 'play') world.interact();
    if (input.takeClick() && state.screen === 'play' && !state.shopOpen) {
      const hit = playerAttack(state);
      if (hit) state.sound(state.player.weapon === 'pistol' ? 'shot' : 'punch');
    }

    // Fixed-step simulation.
    if (state.screen === 'play' && !state.shopOpen) {
      acc += dt;
      let n = 0;
      const stepInput = input.read();
      while (acc >= STEP && n < 5) {
        world.step(stepInput, STEP);
        acc -= STEP;
        n += 1;
      }
      if (n === 5) acc = 0;
    } else if (state.screen === 'title') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) {
        world.step(idle, STEP);
        acc -= STEP;
        n += 1;
      }
      if (n === 5) acc = 0;
    }
    input.clearEdges();

    world.render(dt, state.time);
  }
  requestAnimationFrame(frame);
}

boot();
