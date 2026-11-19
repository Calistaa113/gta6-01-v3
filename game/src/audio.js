// Tiny procedural sound: WebAudio blips for pickups, missions, wanted
// levels, shots and cash. No audio files, no network. Silent (a no-op) when
// the browser has no audio — headless screenshot runs included.
export function createAudio() {
  let ctx = null;
  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      return null;
    }
    return ctx;
  }
  function tone(freq, dur, type, gain, when) {
    const ac = ensure();
    if (!ac) return;
    try {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.08, ac.currentTime + (when || 0));
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (when || 0) + dur);
      o.connect(g);
      g.connect(ac.destination);
      o.start(ac.currentTime + (when || 0));
      o.stop(ac.currentTime + (when || 0) + dur + 0.02);
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }
  return {
    /** Play a named effect. */
    play(name) {
      if (name === 'pickup') { tone(660, 0.09, 'sine', 0.07); tone(880, 0.12, 'sine', 0.07, 0.08); }
      else if (name === 'mission') { tone(523, 0.12, 'triangle', 0.09); tone(659, 0.12, 'triangle', 0.09, 0.1); tone(784, 0.2, 'triangle', 0.09, 0.2); }
      else if (name === 'wanted') { tone(140, 0.3, 'sawtooth', 0.08); tone(110, 0.3, 'sawtooth', 0.08, 0.12); }
      else if (name === 'shot') { tone(180, 0.07, 'square', 0.09); }
      else if (name === 'punch') { tone(90, 0.1, 'sine', 0.12); }
      else if (name === 'cash') { tone(990, 0.08, 'sine', 0.07); tone(1320, 0.14, 'sine', 0.07, 0.07); }
      else if (name === 'car') { tone(220, 0.1, 'triangle', 0.06); tone(330, 0.12, 'triangle', 0.06, 0.08); }
    },
  };
}
