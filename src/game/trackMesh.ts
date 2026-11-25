import * as THREE from 'three';
import { TrackData } from './trackMath';
import { LicenseTestDef } from './types';

export interface TrackSceneObjects {
  group: THREE.Group;
  setNightIllumination: (intensity: number) => void;
  dispose: () => void;
}

function createAsphaltTexture(
  maxAnisotropy: number,
  envType: TrackData['environmentType'],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base tarmac
  ctx.fillStyle = envType === 'expressway' ? '#2a2f3a' : envType === 'touge' ? '#30343d' : '#333842';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle racing line darker rubber grooves
  const grooveGrad = ctx.createLinearGradient(0, 0, 512, 0);
  grooveGrad.addColorStop(0.0, 'rgba(20,24,30,0.0)');
  grooveGrad.addColorStop(0.24, 'rgba(18,20,25,0.28)');
  grooveGrad.addColorStop(0.36, 'rgba(18,20,25,0.08)');
  grooveGrad.addColorStop(0.64, 'rgba(18,20,25,0.08)');
  grooveGrad.addColorStop(0.76, 'rgba(18,20,25,0.28)');
  grooveGrad.addColorStop(1.0, 'rgba(20,24,30,0.0)');
  ctx.fillStyle = grooveGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Deterministic asphalt grain noise
  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 6500; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const v = 40 + Math.floor(rand() * 32);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Crisp edge lines
  ctx.fillStyle = envType === 'expressway' ? '#facc15' : '#eef2f6';
  ctx.fillRect(14, 0, 10, 512);
  ctx.fillRect(488, 0, 10, 512);

  if (envType === 'expressway') {
    // 3-lane highway dashed lines
    ctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
    for (const lx of [175, 333]) {
      ctx.fillRect(lx, 24, 7, 175);
      ctx.fillRect(lx, 280, 7, 175);
    }
  } else if (envType === 'touge') {
    // Japanese mountain pass double amber center line
    ctx.fillStyle = 'rgba(245, 158, 11, 0.78)';
    ctx.fillRect(247, 0, 6, 512);
    ctx.fillRect(259, 0, 6, 512);
  } else {
    // Subtle circuit center dashed line
    ctx.fillStyle = 'rgba(226, 232, 240, 0.32)';
    ctx.fillRect(253, 40, 6, 170);
    ctx.fillRect(253, 296, 6, 170);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCurbTexture(
  maxAnisotropy: number,
  envType: TrackData['environmentType'],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = envType === 'touge' ? '#eab308' : envType === 'expressway' ? '#2563eb' : '#dc2626';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = envType === 'touge' ? '#18181b' : '#f8fafc';
  ctx.fillRect(0, 128, 64, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 125, 64, 4);
  ctx.fillRect(0, 252, 64, 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createGrassTexture(
  maxAnisotropy: number,
  envType: TrackData['environmentType'],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (envType === 'expressway') {
    // Urban coastal concrete / bay ground
    ctx.fillStyle = '#232c3b';
    ctx.fillRect(0, 0, 256, 256);
    let seed = 3133;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 2200; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const v = 30 + Math.floor(rand() * 22);
      ctx.fillStyle = `rgb(${v},${v + 8},${v + 18})`;
      ctx.fillRect(x, y, 3, 3);
    }
  } else {
    ctx.fillStyle = envType === 'touge' ? '#355933' : '#4e7a3b';
    ctx.fillRect(0, 0, 256, 256);

    let seed = 9187;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 3200; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const g = (envType === 'touge' ? 78 : 104) + Math.floor(rand() * 34);
      const r = (envType === 'touge' ? 46 : 64) + Math.floor(rand() * 28);
      ctx.fillStyle = `rgb(${r},${g},48)`;
      ctx.fillRect(x, y, 3, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCheckeredTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const cols = 16;
  const rows = 4;
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#0f172a';
      ctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBannerTexture(label: string, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f1d38';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 1024, 14);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 114, 1024, 14);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 50px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 512, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCityTowerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, 128, 256);

  let seed = 7711;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let y = 10; y < 246; y += 14) {
    for (let x = 8; x < 120; x += 14) {
      if (rand() > 0.36) {
        const warm = rand() > 0.45;
        ctx.fillStyle = warm ? '#fde68a' : '#7dd3fc';
        ctx.fillRect(x, y, 8, 8);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildRibbonGeometry(
  track: TrackData,
  offsetLeft: (halfW: number) => number,
  offsetRight: (halfW: number) => number,
  yOffset: number,
  uvVScale: number,
  filterFn?: (sampleIdx: number) => boolean,
): THREE.BufferGeometry {
  const { samples, closed } = track;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const segCount = closed ? samples.length : samples.length - 1;
  let vCursor = 0;

  for (let i = 0; i < segCount; i++) {
    if (filterFn && !filterFn(i)) continue;
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    const hwA = a.width * 0.5;
    const hwB = b.width * 0.5;

    const lA = offsetLeft(hwA);
    const rA = offsetRight(hwA);
    const lB = offsetLeft(hwB);
    const rB = offsetRight(hwB);

    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const v0 = a.s * uvVScale;
    const v1 = (a.s + segLen) * uvVScale;

    const base = vCursor;
    positions.push(
      a.x + a.nx * lA, a.y + yOffset, a.z + a.nz * lA,
      a.x + a.nx * rA, a.y + yOffset, a.z + a.nz * rA,
      b.x + b.nx * lB, b.y + yOffset, b.z + b.nz * lB,
      b.x + b.nx * rB, b.y + yOffset, b.z + b.nz * rB,
    );
    uvs.push(0, v0, 1, v0, 0, v1, 1, v1);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    vCursor += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildGuardrailGeometry(track: TrackData, sideSign: -1 | 1): THREE.BufferGeometry {
  const { samples, closed } = track;
  const positions: number[] = [];
  const indices: number[] = [];
  const segCount = closed ? samples.length : samples.length - 1;
  let vCursor = 0;
  const margin = track.environmentType === 'expressway' ? 3.2 : 5.2;
  const topY = track.environmentType === 'expressway' ? 1.25 : 1.05;

  for (let i = 0; i < segCount; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    const offA = (a.width * 0.5 + margin) * sideSign;
    const offB = (b.width * 0.5 + margin) * sideSign;

    const ax = a.x + a.nx * offA;
    const az = a.z + a.nz * offA;
    const bx = b.x + b.nx * offB;
    const bz = b.z + b.nz * offB;

    const base = vCursor;
    positions.push(
      ax, a.y + 0.25, az,
      ax, a.y + topY, az,
      bx, b.y + 0.25, bz,
      bx, b.y + topY, bz,
    );
    if (sideSign > 0) {
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    } else {
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    vCursor += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildGantryArch(
  x: number,
  y: number,
  z: number,
  tx: number,
  tz: number,
  width: number,
  label: string,
  maxAnisotropy: number,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const gantry = new THREE.Group();
  gantry.position.set(x, y, z);
  gantry.rotation.y = Math.atan2(tx, tz);

  const pillarMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    metalness: 0.72,
    roughness: 0.3,
  });
  const bannerTex = createBannerTexture(label, maxAnisotropy);
  const bannerMat = new THREE.MeshStandardMaterial({
    map: bannerTex,
    emissive: new THREE.Color('#1e3a8a'),
    emissiveIntensity: 0.35,
    roughness: 0.42,
    metalness: 0.15,
  });
  const lightMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    emissive: '#ef4444',
    emissiveIntensity: 0.85,
    roughness: 0.3,
  });
  disposables.push(pillarMat, bannerTex, bannerMat, lightMat);

  const span = width + 4.2;
  const height = 7.4;

  const pillarGeo = new THREE.BoxGeometry(0.9, height, 0.9);
  const trussGeo = new THREE.BoxGeometry(span + 1.2, 1.55, 0.8);
  const lightBoxGeo = new THREE.BoxGeometry(4.6, 0.55, 0.35);
  disposables.push(pillarGeo, trussGeo, lightBoxGeo);

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(side * (span * 0.5), height * 0.5, 0);
    gantry.add(pillar);
  }

  const truss = new THREE.Mesh(trussGeo, bannerMat);
  truss.position.set(0, height - 0.5, 0);
  gantry.add(truss);

  const lightBox = new THREE.Mesh(lightBoxGeo, lightMat);
  lightBox.position.set(0, height - 1.55, -0.45);
  gantry.add(lightBox);

  return gantry;
}

function buildGrandstand(
  x: number,
  y: number,
  z: number,
  rotY: number,
  length: number,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const stand = new THREE.Group();
  stand.position.set(x, y, z);
  stand.rotation.y = rotY;

  const concreteMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.82,
    metalness: 0.08,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: '#f1f5f9',
    roughness: 0.36,
    metalness: 0.52,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: '#1d4ed8',
    roughness: 0.48,
    metalness: 0.2,
  });
  const crowdMat = new THREE.MeshStandardMaterial({
    color: '#475569',
    roughness: 0.9,
    metalness: 0.0,
  });
  disposables.push(concreteMat, roofMat, accentMat, crowdMat);

  const baseGeo = new THREE.BoxGeometry(length, 1.4, 9.5);
  disposables.push(baseGeo);
  const base = new THREE.Mesh(baseGeo, concreteMat);
  base.position.set(0, 0.7, 0);
  stand.add(base);

  const tierGeo = new THREE.BoxGeometry(length - 0.8, 0.95, 1.8);
  disposables.push(tierGeo);
  for (let t = 0; t < 4; t++) {
    const tier = new THREE.Mesh(tierGeo, t % 2 === 0 ? crowdMat : concreteMat);
    tier.position.set(0, 1.85 + t * 0.95, -2.8 + t * 1.85);
    stand.add(tier);
  }

  const fasciaGeo = new THREE.BoxGeometry(length, 0.75, 0.3);
  disposables.push(fasciaGeo);
  const fascia = new THREE.Mesh(fasciaGeo, accentMat);
  fascia.position.set(0, 1.65, -4.65);
  stand.add(fascia);

  const roofGeo = new THREE.BoxGeometry(length + 1.2, 0.35, 10.6);
  disposables.push(roofGeo);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 8.6, 0.2);
  roof.rotation.x = -0.14;
  stand.add(roof);

  const colGeo = new THREE.BoxGeometry(0.45, 7.6, 0.45);
  disposables.push(colGeo);
  for (const cx of [-length * 0.45, 0, length * 0.45]) {
    const col = new THREE.Mesh(colGeo, concreteMat);
    col.position.set(cx, 4.4, 4.2);
    stand.add(col);
  }

  return stand;
}

export function buildTrackEnvironment(
  track: TrackData,
  maxAnisotropy: number,
  licenseDef?: LicenseTestDef,
): TrackSceneObjects {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const nightEmissiveMaterials: Array<{ mat: THREE.MeshStandardMaterial; maxIntensity: number }> = [];

  const envType = track.environmentType;

  // 1. Vast Ground Plane (y = -0.35 so elevated track never Z-fights)
  const grassTex = createGrassTexture(maxAnisotropy, envType);
  const groundGeo = new THREE.PlaneGeometry(2400, 2400);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: grassTex,
    roughness: 0.94,
    metalness: 0.0,
  });
  disposables.push(grassTex, groundGeo, groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  ground.receiveShadow = true;
  group.add(ground);

  const dummy = new THREE.Object3D();
  const cx = (track.bounds.minX + track.bounds.maxX) * 0.5;
  const cz = (track.bounds.minZ + track.bounds.maxZ) * 0.5;

  // 2. Horizon Landmarks (Mountains for Grand Prix/Touge, Illuminated Skyline Towers for Via Expressa)
  if (envType === 'expressway') {
    const towerTex = createCityTowerTexture(maxAnisotropy);
    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    const towerMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      map: towerTex,
      emissive: new THREE.Color('#fef08a'),
      emissiveMap: towerTex,
      emissiveIntensity: 0.25,
      roughness: 0.55,
      metalness: 0.4,
    });
    disposables.push(towerTex, towerGeo, towerMat);
    nightEmissiveMaterials.push({ mat: towerMat, maxIntensity: 1.55 });

    const towerCount = 46;
    const towersInst = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
    for (let i = 0; i < towerCount; i++) {
      const angle = (i / towerCount) * Math.PI * 2;
      const radius = 520 + (i % 4) * 75;
      const h = 48 + ((i * 37) % 110);
      const w = 24 + ((i * 17) % 28);
      dummy.position.set(cx + Math.cos(angle) * radius, h * 0.5 - 2, cz + Math.sin(angle) * radius);
      dummy.scale.set(w, h, w * 0.85);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      towersInst.setMatrixAt(i, dummy.matrix);
    }
    towersInst.computeBoundingSphere();
    group.add(towersInst);
  } else {
    const hillGeo = new THREE.ConeGeometry(1, 1, 7);
    const hillMat = new THREE.MeshStandardMaterial({
      color: envType === 'touge' ? '#3d5949' : '#5f7d67',
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });
    disposables.push(hillGeo, hillMat);
    const hillCount = envType === 'touge' ? 42 : 34;
    const hillsInst = new THREE.InstancedMesh(hillGeo, hillMat, hillCount);
    const hillColor = new THREE.Color();
    for (let i = 0; i < hillCount; i++) {
      const angle = (i / hillCount) * Math.PI * 2;
      const radius = (envType === 'touge' ? 350 : 450) + (i % 3) * 85;
      const h = (envType === 'touge' ? 58 : 38) + ((i * 19) % 48);
      const w = 110 + ((i * 27) % 85);
      dummy.position.set(cx + Math.cos(angle) * radius, h * 0.45 - 6, cz + Math.sin(angle) * radius);
      dummy.scale.set(w, h, w * 0.9);
      dummy.rotation.set(0, angle * 1.7, 0);
      dummy.updateMatrix();
      hillsInst.setMatrixAt(i, dummy.matrix);
      hillColor.setHSL(0.32 + (i % 4) * 0.03, 0.18, (envType === 'touge' ? 0.30 : 0.38) + (i % 3) * 0.04);
      hillsInst.setColorAt(i, hillColor);
    }
    hillsInst.computeBoundingSphere();
    group.add(hillsInst);
  }

  // 3. Verge / Viaduct Shoulder Skirt right under the track
  const vergeGeo = buildRibbonGeometry(
    track,
    (hw) => -(hw + (envType === 'expressway' ? 4.2 : 7.5)),
    (hw) => hw + (envType === 'expressway' ? 4.2 : 7.5),
    -0.06,
    0.08,
  );
  const vergeMat = new THREE.MeshStandardMaterial({
    color: envType === 'expressway' ? '#475569' : envType === 'touge' ? '#436339' : '#5a8244',
    roughness: 0.9,
    metalness: envType === 'expressway' ? 0.15 : 0.0,
  });
  disposables.push(vergeGeo, vergeMat);
  const vergeMesh = new THREE.Mesh(vergeGeo, vergeMat);
  vergeMesh.receiveShadow = true;
  group.add(vergeMesh);

  // 4. Asphalt Road Surface (Y = 0.02 above verge)
  const asphaltTex = createAsphaltTexture(maxAnisotropy, envType);
  const roadGeo = buildRibbonGeometry(track, (hw) => -hw, (hw) => hw, 0.02, 0.085);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: asphaltTex,
    roughness: envType === 'expressway' ? 0.68 : 0.82,
    metalness: envType === 'expressway' ? 0.12 : 0.05,
  });
  disposables.push(asphaltTex, roadGeo, roadMat);
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // 5. Apex Curbs (Zebras)
  const curbTex = createCurbTexture(maxAnisotropy, envType);
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: curbTex,
    roughness: 0.72,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  disposables.push(curbTex, curbMat);

  const leftCurbGeo = buildRibbonGeometry(
    track,
    (hw) => -(hw + 1.15),
    (hw) => -(hw - 0.45),
    0.06,
    0.26,
    (idx) => track.samples[idx].hasLeftCurb,
  );
  const rightCurbGeo = buildRibbonGeometry(
    track,
    (hw) => hw - 0.45,
    (hw) => hw + 1.15,
    0.06,
    0.26,
    (idx) => track.samples[idx].hasRightCurb,
  );
  disposables.push(leftCurbGeo, rightCurbGeo);
  group.add(new THREE.Mesh(leftCurbGeo, curbMat));
  group.add(new THREE.Mesh(rightCurbGeo, curbMat));

  // 6. Armco Steel Guardrails / Concrete Highway Walls
  const railMat = new THREE.MeshStandardMaterial({
    color: envType === 'expressway' ? '#94a3b8' : '#cbd5e1',
    metalness: envType === 'expressway' ? 0.35 : 0.78,
    roughness: envType === 'expressway' ? 0.62 : 0.34,
    side: THREE.DoubleSide,
  });
  const leftRailGeo = buildGuardrailGeometry(track, -1);
  const rightRailGeo = buildGuardrailGeometry(track, 1);
  disposables.push(railMat, leftRailGeo, rightRailGeo);
  group.add(new THREE.Mesh(leftRailGeo, railMat));
  group.add(new THREE.Mesh(rightRailGeo, railMat));

  // 7. Trackside Street Lamps (Instanced along all circuits — especially dramatic on Night / Expressway!)
  const lampInterval = envType === 'expressway' ? 4 : envType === 'touge' ? 9 : 11;
  const lampSamples: Array<{ x: number; y: number; z: number; nx: number; nz: number; side: number; rotY: number }> = [];
  for (let i = 0; i < track.samples.length; i += lampInterval) {
    const sp = track.samples[i];
    const side = envType === 'expressway' ? (i % (lampInterval * 2) === 0 ? 1 : -1) : -1;
    const dist = sp.width * 0.5 + (envType === 'expressway' ? 3.5 : 5.8);
    lampSamples.push({
      x: sp.x + sp.nx * side * dist,
      y: sp.y,
      z: sp.z + sp.nz * side * dist,
      nx: sp.nx,
      nz: sp.nz,
      side,
      rotY: Math.atan2(sp.tx, sp.tz),
    });
  }

  if (lampSamples.length > 0) {
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 7.6, 6);
    const bulbGeo = new THREE.BoxGeometry(1.1, 0.24, 0.45);
    const poleMat = new THREE.MeshStandardMaterial({
      color: '#64748b',
      metalness: 0.75,
      roughness: 0.35,
    });
    const bulbMat = new THREE.MeshStandardMaterial({
      color: '#fef9c3',
      emissive: new THREE.Color(envType === 'expressway' ? '#fbbf24' : '#e0f2fe'),
      emissiveIntensity: 0.2,
      roughness: 0.2,
    });
    disposables.push(poleGeo, bulbGeo, poleMat, bulbMat);
    nightEmissiveMaterials.push({ mat: bulbMat, maxIntensity: 3.4 });

    const polesInst = new THREE.InstancedMesh(poleGeo, poleMat, lampSamples.length);
    const bulbsInst = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSamples.length);

    lampSamples.forEach((ls, idx) => {
      dummy.position.set(ls.x, ls.y + 3.8, ls.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, ls.rotY, 0);
      dummy.updateMatrix();
      polesInst.setMatrixAt(idx, dummy.matrix);

      // Hang lamp head slightly inward over road edge
      dummy.position.set(
        ls.x - ls.nx * ls.side * 1.1,
        ls.y + 7.55,
        ls.z - ls.nz * ls.side * 1.1,
      );
      dummy.rotation.set(0, ls.rotY, 0);
      dummy.updateMatrix();
      bulbsInst.setMatrixAt(idx, dummy.matrix);
    });
    polesInst.computeBoundingSphere();
    bulbsInst.computeBoundingSphere();
    group.add(polesInst, bulbsInst);
  }

  // 8. Start/Finish Line Checkered Strip & Overhead Gantry
  const startSample = track.samples[0];
  const checkTex = createCheckeredTexture(maxAnisotropy);
  const startLineGeo = new THREE.PlaneGeometry(startSample.width - 0.6, 3.2);
  const startLineMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: checkTex,
    roughness: 0.78,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  disposables.push(checkTex, startLineGeo, startLineMat);
  const startLine = new THREE.Mesh(startLineGeo, startLineMat);
  startLine.rotation.x = -Math.PI / 2;
  startLine.rotation.z = -Math.atan2(startSample.tx, startSample.tz);
  startLine.position.set(startSample.x, startSample.y + 0.05, startSample.z);
  group.add(startLine);

  const gantryIdx = Math.min(track.samples.length - 1, 6);
  const gS = track.samples[gantryIdx];
  group.add(
    buildGantryArch(
      gS.x,
      gS.y,
      gS.z,
      gS.tx,
      gS.tz,
      gS.width,
      licenseDef ? `LICENÇA ${licenseDef.code}` : track.name.toUpperCase(),
      maxAnisotropy,
      disposables,
    ),
  );

  // License Finish Gantry / Stop Zone Markings
  if (licenseDef) {
    const endTargetS =
      licenseDef.objectiveType === 'stop_zone' && licenseDef.stopZoneStartM
        ? licenseDef.stopZoneStartM
        : licenseDef.targetDistanceM;

    const findSampleNear = (dist: number) => {
      let best = track.samples[track.samples.length - 1];
      for (const sp of track.samples) {
        if (sp.s >= dist) {
          best = sp;
          break;
        }
      }
      return best;
    };

    if (licenseDef.objectiveType === 'stop_zone' && licenseDef.stopZoneStartM && licenseDef.stopZoneEndM) {
      const zoneLen = licenseDef.stopZoneEndM - licenseDef.stopZoneStartM;
      const midS = (licenseDef.stopZoneStartM + licenseDef.stopZoneEndM) * 0.5;
      const midSp = findSampleNear(midS);

      const zoneGeo = new THREE.PlaneGeometry(midSp.width - 1.2, zoneLen);
      const zoneMat = new THREE.MeshStandardMaterial({
        color: '#facc15',
        transparent: true,
        opacity: 0.34,
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      disposables.push(zoneGeo, zoneMat);
      const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
      zoneMesh.rotation.x = -Math.PI / 2;
      zoneMesh.position.set(midSp.x, midSp.y + 0.055, midSp.z);
      group.add(zoneMesh);

      const endSp = findSampleNear(licenseDef.stopZoneEndM);
      group.add(
        buildGantryArch(
          endSp.x,
          endSp.y,
          endSp.z,
          endSp.tx,
          endSp.tz,
          endSp.width,
          'ZONA DE PARADA · STOP',
          maxAnisotropy,
          disposables,
        ),
      );
    } else {
      const finSp = findSampleNear(endTargetS);
      group.add(
        buildGantryArch(
          finSp.x,
          finSp.y,
          finSp.z,
          finSp.tx,
          finSp.tz,
          finSp.width,
          'CHEGADA · FINISH',
          maxAnisotropy,
          disposables,
        ),
      );
    }
  }

  // 9. Multi-Tier Grandstands on Grand Prix Circuit
  if (envType === 'circuit') {
    const standSample = track.samples[Math.min(track.samples.length - 1, 10)];
    const standRot = Math.atan2(standSample.tx, standSample.tz) + Math.PI / 2;
    group.add(
      buildGrandstand(
        standSample.x + standSample.nx * (standSample.width * 0.5 + 14.5),
        standSample.y - 0.1,
        standSample.z + standSample.nz * (standSample.width * 0.5 + 14.5),
        standRot,
        46,
        disposables,
      ),
    );
    if (track.closed) {
      const stand2 = track.samples[Math.min(track.samples.length - 1, 32)];
      group.add(
        buildGrandstand(
          stand2.x - stand2.nx * (stand2.width * 0.5 + 15.5),
          stand2.y - 0.1,
          stand2.z - stand2.nz * (stand2.width * 0.5 + 15.5),
          Math.atan2(stand2.tx, stand2.tz) - Math.PI / 2,
          36,
          disposables,
        ),
      );
    }
  }

  // 10. Instanced Composite Low-Poly Trees (Grand Prix & Serra Touge)
  if (envType !== 'expressway') {
    const treeCoords: Array<{ x: number; y: number; z: number; scale: number; hue: number }> = [];
    let treeSeed = 1337;
    const tRand = () => {
      treeSeed = (treeSeed * 16807) % 2147483647;
      return (treeSeed - 1) / 2147483646;
    };

    const stride = envType === 'touge' ? 2 : track.closed ? 3 : 2;
    for (let i = 0; i < track.samples.length; i += stride) {
      const sp = track.samples[i];
      for (const side of [-1, 1]) {
        if (envType === 'circuit' && i < 18 && side > 0) continue;
        const dist = sp.width * 0.5 + (envType === 'touge' ? 9.5 : 11.5) + tRand() * 24;
        const tx = sp.x + sp.nx * side * dist;
        const tz = sp.z + sp.nz * side * dist;

        let tooClose = false;
        for (let k = 0; k < track.samples.length; k += 4) {
          const other = track.samples[k];
          if (Math.hypot(tx - other.x, tz - other.z) < other.width * 0.5 + 8.0) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          treeCoords.push({
            x: tx,
            y: Math.max(-0.35, sp.y - 0.35),
            z: tz,
            scale: 0.85 + tRand() * 0.65,
            hue: tRand(),
          });
        }
      }
    }

    if (treeCoords.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 2.6, 6);
      const crown1Geo = new THREE.ConeGeometry(2.3, 4.4, 7);
      const crown2Geo = new THREE.ConeGeometry(1.75, 3.6, 7);
      const trunkMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.92 });
      const foliageMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.86,
        flatShading: true,
      });
      disposables.push(trunkGeo, crown1Geo, crown2Geo, trunkMat, foliageMat);

      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCoords.length);
      const crowns1 = new THREE.InstancedMesh(crown1Geo, foliageMat, treeCoords.length);
      const crowns2 = new THREE.InstancedMesh(crown2Geo, foliageMat, treeCoords.length);

      const palette =
        envType === 'touge'
          ? [
              new THREE.Color('#1e4d32'),
              new THREE.Color('#275d38'),
              new THREE.Color('#1b4332'),
              new THREE.Color('#b64526'),
              new THREE.Color('#2d6a4f'),
            ]
          : [
              new THREE.Color('#275d38'),
              new THREE.Color('#3b6e32'),
              new THREE.Color('#c97a24'),
              new THREE.Color('#b64526'),
              new THREE.Color('#2f6642'),
            ];

      treeCoords.forEach((tc, idx) => {
        dummy.position.set(tc.x, tc.y + 1.3 * tc.scale, tc.z);
        dummy.scale.set(tc.scale, tc.scale, tc.scale);
        dummy.rotation.set(0, tc.hue * Math.PI * 2, 0);
        dummy.updateMatrix();
        trunks.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(tc.x, tc.y + 4.0 * tc.scale, tc.z);
        dummy.updateMatrix();
        crowns1.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(tc.x, tc.y + 6.2 * tc.scale, tc.z);
        dummy.updateMatrix();
        crowns2.setMatrixAt(idx, dummy.matrix);

        const col = palette[Math.floor(tc.hue * palette.length) % palette.length];
        crowns1.setColorAt(idx, col);
        crowns2.setColorAt(idx, col);
      });

      trunks.computeBoundingSphere();
      crowns1.computeBoundingSphere();
      crowns2.computeBoundingSphere();
      group.add(trunks, crowns1, crowns2);
    }
  }

  return {
    group,
    setNightIllumination: (factor: number) => {
      const clamped = Math.max(0, Math.min(1, factor));
      for (const entry of nightEmissiveMaterials) {
        entry.mat.emissiveIntensity = 0.15 + clamped * entry.maxIntensity;
      }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
