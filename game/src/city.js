// Turns the city layout (world.js) into three.js meshes: ground, roads and
// kerbs, textured buildings, trees, lamps, beach, sea, clouds and the marina.
// All textures are procedural canvas textures — nothing loads over the
// network, and the game works offline from its own files.
import { WORLD, ROAD_HALF, BEACH_Z, SEA_Z } from './config.js';
import { ROADS_V as RV, ROADS_H as RH } from './world.js';

const THREE = window.THREE;

/** A canvas texture of a window grid; tinted per building by material colour. */
function windowTexture(cols, rows, winW, winH, gap, frame) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = frame;
  g.fillRect(0, 0, 256, 256);
  const cw = 256 / cols;
  const ch = 256 / rows;
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const lit = ((i * 7 + j * 13) % 5) === 0;
      g.fillStyle = lit ? '#ffe9a8' : '#2e4a5a';
      g.fillRect(i * cw + gap, j * ch + gap, cw - gap * 2, ch - gap * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function flatMaterial(hex) {
  return new THREE.MeshLambertMaterial({ color: hex });
}

/** Build every static mesh of the city into `scene`. Returns handles the game needs. */
export function buildCityMeshes(scene, city) {
  const group = new THREE.Group();
  scene.add(group);

  // Ground: grass everywhere, then sand on the beach and the sea beyond it.
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.width, WORLD.height),
    flatMaterial(0x6da34e),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(WORLD.width / 2, 0, WORLD.height / 2);
  group.add(grass);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.width, WORLD.height - BEACH_Z),
    flatMaterial(0xd9c48f),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(WORLD.width / 2, 0.02, (BEACH_Z + WORLD.height) / 2);
  group.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.width + 800, 1500),
    new THREE.MeshLambertMaterial({ color: 0x2f7fb5 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(WORLD.width / 2, -0.6, SEA_Z + 750);
  group.add(sea);

  // Park lawns, slightly darker than the base grass.
  for (const b of city.blocks) {
    if (b.district !== 'park') continue;
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0),
      flatMaterial(0x5d9148),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(b.cx, 0.012, b.cz);
    group.add(lawn);
  }
  // The park pond.
  const pond = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 130),
    flatMaterial(0x3a7fb5),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(1800, 0.02, 1600);
  group.add(pond);

  // Sidewalks (a kerb band around every road) then the asphalt itself.
  const sidewalkMat = flatMaterial(0xb9b3a4);
  const roadMat = flatMaterial(0x3c3f46);
  for (const rx of RV) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 28, WORLD.height), sidewalkMat);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(rx, 0.015, WORLD.height / 2);
    group.add(walk);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, WORLD.height), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(rx, 0.03, WORLD.height / 2);
    group.add(road);
  }
  for (const rz of RH) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, ROAD_HALF * 2 + 28), sidewalkMat);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(WORLD.width / 2, 0.015, rz);
    group.add(walk);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, ROAD_HALF * 2), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(WORLD.width / 2, 0.03, rz);
    group.add(road);
  }

  // Centre dashes, one instanced mesh for the whole city.
  const dashGeo = new THREE.BoxGeometry(2, 0.2, 20);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c95a });
  const dashPositions = [];
  for (const rx of RV) {
    for (let z = 240; z < BEACH_Z; z += 80) dashPositions.push({ x: rx, z, rot: 0 });
  }
  for (const rz of RH) {
    for (let x = 240; x < WORLD.width; x += 80) dashPositions.push({ x, z: rz, rot: Math.PI / 2 });
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashPositions.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  dashPositions.forEach((d, i) => {
    q.setFromAxisAngle(up, d.rot);
    m4.compose(new THREE.Vector3(d.x, 0.06, d.z), q, new THREE.Vector3(1, 1, 1));
    dashes.setMatrixAt(i, m4);
  });
  group.add(dashes);

  // Buildings: a window texture per district, tinted by each building's hue.
  const officeTex = windowTexture(6, 10, 5, 6, 4, '#c9d6dd');
  const houseTex = windowTexture(3, 3, 6, 8, 5, '#e8ddc9');
  const wareTex = windowTexture(4, 2, 8, 10, 6, '#b9b0a0');
  for (const b of city.buildings) {
    const tex = b.district === 'downtown' ? officeTex : b.district === 'industrial' ? wareTex : houseTex;
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(b.w / 42)), Math.max(1, Math.round(b.h / 42)));
    const side = new THREE.MeshLambertMaterial({ map: t, color: b.hue });
    const roof = new THREE.MeshLambertMaterial({ color: new THREE.Color(b.hue).multiplyScalar(0.55) });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, b.d),
      [side, side, roof, roof, side, side],
    );
    mesh.position.set(b.x, b.h / 2, b.z);
    group.add(mesh);
    // A rooftop box on downtown towers so the skyline reads at a glance.
    if (b.district === 'downtown' && b.h > 150) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(b.w * 0.4, 10, b.d * 0.4),
        flatMaterial(0x3a4a58),
      );
      cap.position.set(b.x, b.h + 5, b.z);
      group.add(cap);
    }
  }

  // Trees: instanced trunks and foliage (palms get a taller, squashed canopy).
  const trunkGeo = new THREE.CylinderGeometry(1, 1.6, 10, 6);
  const trunkMat = flatMaterial(0x6b4a2f);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, city.trees.length);
  const leafGeo = new THREE.ConeGeometry(7, 18, 7);
  const leafMat = flatMaterial(0x3f7d3a);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, city.trees.length);
  const one = new THREE.Vector3(1, 1, 1);
  city.trees.forEach((t, i) => {
    const s = t.palm ? 1.7 : 1;
    m4.compose(new THREE.Vector3(t.x, 5 * s, t.z), new THREE.Quaternion(), new THREE.Vector3(1, s, 1));
    trunks.setMatrixAt(i, m4);
    m4.compose(
      new THREE.Vector3(t.x, (10 * s) + (t.palm ? 6 : 8), t.z),
      new THREE.Quaternion(),
      t.palm ? new THREE.Vector3(1.5, 0.55, 1.5) : one,
    );
    leaves.setMatrixAt(i, m4);
  });
  group.add(trunks);
  group.add(leaves);

  // Street lamps: instanced poles and glowing heads.
  const poleGeo = new THREE.CylinderGeometry(0.5, 0.7, 15, 5);
  const poleMat = flatMaterial(0x2e343c);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, city.lamps.length);
  const headGeo = new THREE.BoxGeometry(4, 1.2, 1.6);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, city.lamps.length);
  city.lamps.forEach((l, i) => {
    m4.compose(new THREE.Vector3(l.x, 7.5, l.z), new THREE.Quaternion(), one);
    poles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(l.x, 15, l.z), new THREE.Quaternion(), one);
    heads.setMatrixAt(i, m4);
  });
  group.add(poles);
  group.add(heads);

  // The marina: wooden docks and a yacht at anchor.
  const dockMat = flatMaterial(0x8a6b45);
  for (const dx of [3260, 3340, 3420]) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 150), dockMat);
    dock.position.set(dx, 1, SEA_Z + 60);
    group.add(dock);
  }
  const yacht = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(44, 7, 14), flatMaterial(0xf2f2f2));
  hull.position.y = 2;
  yacht.add(hull);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 10), flatMaterial(0xdde8f0));
  cabin.position.y = 8;
  yacht.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 26, 6), flatMaterial(0x8a8a8a));
  mast.position.y = 18;
  yacht.add(mast);
  yacht.position.set(3400, 0, SEA_Z + 170);
  group.add(yacht);

  // A few clouds for the sun-soaked sky: unlit white and high up, so they
  // read as bright puffs instead of grey blimps.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const cloudSpots = [[600, 620, 700], [1500, 680, 300], [2600, 600, 900], [3200, 660, 500], [900, 640, 1800], [2300, 700, 2000]];
  for (const [cx, cy, cz] of cloudSpots) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(60, 10, 8), cloudMat);
    cloud.scale.set(2.2, 0.45, 1.2);
    cloud.position.set(cx, cy, cz);
    group.add(cloud);
  }

  return { group, sea };
}
