// Keyboard and mouse input. Keys are read as a held set; `justPressed` holds
// the edge-triggered keys since the last step (main.js clears it each step).
// Dragging the mouse orbits the camera; a click without a drag is an attack.
export function createInput(canvas, orbit) {
  const keys = new Set();
  const justPressed = new Set();
  let mouseDown = false;
  let lastX = 0;
  let lastY = 0;
  let moved = 0;
  let clicked = false;

  const CODE = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'run', ShiftRight: 'run',
    KeyE: 'interact', KeyF: 'action',
    Digit1: 'weapon1', Digit2: 'weapon2',
    Escape: 'pause', Enter: 'confirm', KeyR: 'restart', KeyP: 'pause',
  };

  window.addEventListener('keydown', (e) => {
    const name = CODE[e.code];
    if (!name) return;
    if (!keys.has(name)) justPressed.add(name);
    keys.add(name);
    if (['up', 'down', 'left', 'right'].includes(name)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const name = CODE[e.code];
    if (name) keys.delete(name);
  });
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (e) => {
    mouseDown = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    orbit.yawOffset = Math.max(-Math.PI, Math.min(Math.PI, (orbit.yawOffset || 0) - dx * 0.005));
    orbit.pitchOffset = Math.max(-0.1, Math.min(0.55, (orbit.pitchOffset || 0) + dy * 0.004));
  });
  window.addEventListener('mouseup', () => {
    if (mouseDown && moved < 6) clicked = true;
    mouseDown = false;
  });

  return {
    keys,
    justPressed,
    orbit,
    /** The held movement state for this step. */
    read() {
      return {
        up: keys.has('up'),
        down: keys.has('down'),
        left: keys.has('left'),
        right: keys.has('right'),
        run: keys.has('run'),
      };
    },
    /** True once for the key pressed since the last step. */
    pressed(name) {
      return justPressed.has(name);
    },
    /** True once for a mouse click (attack) since the last step. */
    takeClick() {
      const c = clicked;
      clicked = false;
      return c;
    },
    /** Clear the edge-triggered sets at the end of a step. */
    clearEdges() {
      justPressed.clear();
    },
  };
}
