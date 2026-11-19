// The wanted level: stars that rise when the player makes trouble and fall
// when the player stays out of sight, plus the busted / wasted endings.
import { WANTED } from './config.js';
import { dist2d } from './random.js';

/** Raise the wanted level (capped) and restart the decay clock. */
export function addWanted(state, n) {
  if (n <= 0) return;
  const before = state.wanted;
  state.wanted = Math.min(WANTED.max, state.wanted + n);
  state.hiddenTimer = 0;
  if (state.wanted > before) {
    state.toast(state.wanted >= 3 ? 'The whole PD is after you!' : 'Wanted level up!');
    state.sound('wanted');
  }
}

/** Set the wanted level outright (mission starts). */
export function setWanted(state, n) {
  state.wanted = Math.min(WANTED.max, n);
  state.hiddenTimer = 0;
}

/** Step the wanted level: decay when unseen, bust when a cop catches the player. */
export function updateWanted(state, dt) {
  const p = state.player;
  if (state.wanted > 0) {
    let seen = false;
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      if (dist2d(car.x, car.z, p.x, p.z) < WANTED.sight) { seen = true; break; }
    }
    if (seen) state.hiddenTimer = 0;
    else {
      state.hiddenTimer += dt;
      if (state.hiddenTimer > WANTED.decaySeconds) {
        state.wanted -= 1;
        state.hiddenTimer = 0;
        if (state.wanted === 0) state.toast('You lost the heat.');
      }
    }
    // Busted: a police car sits on the player on foot.
    if (!p.car) {
      for (const car of state.cars) {
        if (car.driver !== 'police') continue;
        if (dist2d(car.x, car.z, p.x, p.z) < 9 && Math.abs(car.speed) < 12) {
          p.bustTimer += dt;
          if (p.bustTimer > 2.2) {
            state.endGame('busted');
            return;
          }
          break;
        }
      }
      if (p.bustTimer > 0) p.bustTimer = Math.max(0, p.bustTimer - dt * 0.5);
    }
  }
  // Wasted: no health left.
  if (p.health <= 0) state.endGame('wasted');
}
