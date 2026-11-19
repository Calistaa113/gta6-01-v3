// The HUD: health, money, weapon, wanted stars, clock, mission tracker,
// the top-down minimap, and the banner/toast messages. All DOM except the
// minimap, which is a 2D canvas drawn from the same world the 3D view shows.
import { WORLD, BEACH_Z, SEA_Z, ECONOMY } from './config.js';
import { missionTarget, missionLabel } from './missions.js';
import { SPOTS } from './world.js';

/** Grab the HUD's DOM elements. */
export function createHud() {
  const el = (id) => document.getElementById(id);
  return {
    healthFill: el('healthfill'),
    money: el('money'),
    weapon: el('weapon'),
    stars: el('stars'),
    clock: el('clock'),
    missionTitle: el('missiontitle'),
    missionObj: el('missionobj'),
    missionDist: el('missiondist'),
    minimap: el('minimap'),
    banner: el('banner'),
    crosshair: el('crosshair'),
    toast: el('toast'),
    title: el('title'),
    pause: el('pause'),
    end: el('end'),
    endTitle: el('endtitle'),
    endText: el('endtext'),
    titleSave: el('titlesave'),
    titleGo: el('titlego'),
    shop: el('shop'),
    shopName: el('shopname'),
    shopDesc: el('shopdesc'),
    shopItems: el('shopitems'),
  };
}

/** Refresh the HUD's text and bars from the state. */
export function updateHud(hud, state) {
  const p = state.player;
  hud.healthFill.style.width = `${Math.max(0, p.health)}%`;
  hud.healthFill.style.background = p.health > 50
    ? 'linear-gradient(90deg, #3fae5a, #7ed491)'
    : p.health > 25 ? 'linear-gradient(90deg, #e8b93a, #f2d06b)' : 'linear-gradient(90deg, #d23b2e, #f26b5e)';
  hud.money.textContent = `$${Math.floor(p.money)}`;
  hud.weapon.textContent = p.weapon === 'pistol' ? `Pistol — ${p.ammo} rounds` : 'Fists';
  let stars = '';
  for (let i = 0; i < 5; i += 1) {
    stars += i < state.wanted ? '★' : '<span class="off">★</span>';
  }
  hud.stars.innerHTML = stars;
  const hours = 9 + Math.floor(state.time / 120);
  const mins = Math.floor((state.time % 120) / 2);
  hud.clock.textContent = `${String(((hours - 1) % 12) + 1).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  const target = missionTarget(state);
  if (state.mission) {
    hud.missionTitle.textContent = state.mission.def.title;
    hud.missionObj.textContent = missionLabel(state);
    if (target && target.label !== 'Lose the wanted level') {
      const d = Math.hypot(target.x - p.x, target.z - p.z);
      hud.missionDist.textContent = `${target.label} — ${Math.round(d)}m`;
    } else hud.missionDist.textContent = '';
  } else {
    hud.missionTitle.textContent = 'VISTAMAR';
    hud.missionObj.textContent = 'All jobs done — free roam. Press R to start over.';
    hud.missionDist.textContent = '';
  }
  hud.crosshair.style.display = (!p.car && p.weapon === 'pistol') ? 'block' : 'none';
  hud.banner.style.display = state.time < state.bannerUntil ? 'block' : 'none';
  hud.toast.style.display = state.time < state.toastUntil ? 'block' : 'none';
}

/** Draw the minimap: roads, buildings, sea, shops, target, cars and the player. */
export function drawMinimap(hud, state) {
  const cv = hud.minimap;
  const g = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const sx = W / WORLD.width;
  const sz = H / WORLD.height;
  const X = (x) => x * sx;
  const Z = (z) => z * sz;
  g.fillStyle = '#1d2b1d';
  g.fillRect(0, 0, W, H);
  // Sea and beach.
  g.fillStyle = '#2f7fb5';
  g.fillRect(0, Z(SEA_Z), W, H - Z(SEA_Z));
  g.fillStyle = '#d9c48f';
  g.fillRect(0, Z(BEACH_Z), W, Z(SEA_Z) - Z(BEACH_Z));
  // Roads.
  g.strokeStyle = '#3c3f46';
  g.lineWidth = Math.max(2, 68 * sx);
  for (const rx of [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400]) {
    g.beginPath();
    g.moveTo(X(rx), 0);
    g.lineTo(X(rx), Z(BEACH_Z));
    g.stroke();
  }
  for (const rz of [200, 600, 1000, 1400, 1800, 2200]) {
    g.beginPath();
    g.moveTo(0, Z(rz));
    g.lineTo(W, Z(rz));
    g.stroke();
  }
  // Buildings.
  g.fillStyle = '#8d8d8d';
  for (const b of state.city.buildings) {
    g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sx, b.d * sz);
  }
  // Shops.
  const shopColors = { arms: '#ff5a4a', spray: '#4aff8a', clothes: '#c98aff' };
  for (const [key, spot] of Object.entries({ arms: SPOTS.arms, spray: SPOTS.spray, clothes: SPOTS.clothes })) {
    g.fillStyle = shopColors[key];
    g.beginPath();
    g.arc(X(spot.x), Z(spot.z), 3.5, 0, Math.PI * 2);
    g.fill();
  }
  // Mission target.
  const target = missionTarget(state);
  if (target) {
    const pulse = 4 + Math.sin(state.time * 5) * 1.5;
    g.strokeStyle = '#ff9f1c';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(X(target.x), Z(target.z), pulse + 3, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ff9f1c';
    g.beginPath();
    g.arc(X(target.x), Z(target.z), 3, 0, Math.PI * 2);
    g.fill();
  }
  // Cars: white dots, police blue.
  for (const car of state.cars) {
    g.fillStyle = car.driver === 'police' ? '#2f6fd0' : '#e8e8e8';
    g.fillRect(X(car.x) - 1.5, Z(car.z) - 1.5, 3, 3);
  }
  // The player: a gold arrow pointing where Dante faces.
  const p = state.player;
  g.fillStyle = '#f2c94c';
  g.save();
  g.translate(X(p.x), Z(p.z));
  g.rotate(Math.atan2(Math.sin(p.angle), Math.cos(p.angle)));
  g.beginPath();
  g.moveTo(7, 0);
  g.lineTo(-4, -4.5);
  g.lineTo(-4, 4.5);
  g.closePath();
  g.fill();
  g.restore();
}
