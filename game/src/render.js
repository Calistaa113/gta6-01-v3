// The three.js renderer, the sun-soaked lighting, and the third-person
// camera rig. The camera follows the player (or the car) from behind, with a
// mouse-drag orbit offset; the title screen slowly orbits downtown instead.
import { PALETTE, VIEW } from './config.js';

const THREE = window.THREE;

/** Create the renderer, scene, lights and fog. Returns { renderer, scene, camera }. */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 500, 2100);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7d5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.15);
  sun.position.set(900, 1400, 400);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 5000);
  camera.position.set(1800, 300, 1600);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera };
}

/** The camera rig's state: orbit offsets from mouse drag, smoothed position. */
export function createCameraRig() {
  return {
    yawOffset: 0,
    pitchOffset: 0,
    px: 1800, py: 320, pz: 1500,
    tx: 1800, ty: 0, tz: 1300,
  };
}

/**
 * Move the camera toward its desired spot for this frame. `focus` is the
 * point to look at ({x, z, y}), `heading` the direction the player faces,
 * `mode` is 'follow' | 'orbit' | 'fixed', and `orbit` carries the mouse-drag
 * yaw/pitch offsets. `dt` is the real frame time (smoothing only).
 */
export function updateCamera(camera, rig, focus, heading, mode, orbit, dt, time) {
  let dx;
  let dy;
  let dz;
  let lookX = focus.x;
  let lookY = focus.y || 0;
  let lookZ = focus.z;
  if (mode === 'orbit') {
    const a = time * 0.05;
    dx = Math.cos(a) * 420;
    dz = Math.sin(a) * 420;
    dy = 210;
    lookX = 1800;
    lookY = 40;
    lookZ = 800;
  } else {
    const dist = mode === 'car' ? 36 : 27;
    const height = mode === 'car' ? 15 : 12;
    const yaw = heading + Math.PI + (orbit.yawOffset || 0);
    const pitch = Math.max(-0.1, Math.min(0.55, (orbit.pitchOffset || 0)));
    const effDist = dist * Math.cos(pitch);
    dx = Math.cos(yaw) * effDist;
    dz = Math.sin(yaw) * effDist;
    dy = height + dist * Math.sin(pitch);
    lookX = focus.x + Math.cos(heading) * 14;
    lookY = 6;
    lookZ = focus.z + Math.sin(heading) * 14;
  }
  const k = mode === 'orbit' ? 1 : Math.min(1, dt * 6);
  rig.px += (focus.x + dx - rig.px) * k;
  rig.py += (dy - rig.py) * k;
  rig.pz += (focus.z + dz - rig.pz) * k;
  rig.tx += (lookX - rig.tx) * k;
  rig.ty += (lookY - rig.ty) * k;
  rig.tz += (lookZ - rig.tz) * k;
  camera.position.set(rig.px, rig.py, rig.pz);
  camera.lookAt(rig.tx, rig.ty, rig.tz);
}

/** Keep a camera honest for a screenshot: snap it to the desired spot at once. */
export function snapCamera(camera, rig, focus, heading, mode, orbit) {
  updateCamera(camera, rig, focus, heading, mode, orbit, 10, 0);
  updateCamera(camera, rig, focus, heading, mode, orbit, 10, 0);
}
