import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { DEFAULT_PLAYER_GLB_URL } from './catalog';
import { CarBodyStyle, CarSpec, CarVisualConfig, PaintFinish, RimStyle } from './types';

/**
 * Offset de rotação horizontal (yaw) do modelo .GLB externo.
 * Ajuste para `Math.PI` caso um modelo venha virado de costas (-Z em vez de +Z).
 */
export const MODEL_YAW_OFFSET = 0;

/** Comprimento alvo (~4.3m) para normalização automática do modelo .GLB */
export const TARGET_CAR_LENGTH_M = 4.3;

/** Decoder Draco oficial para descompressão de malhas .GLB 2K */
export const DRACO_DECODER_URL = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export interface ProceduralCarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group; // pitches, rolls, and lowers with suspension
  wheelPivots: THREE.Group[]; // [FL, FR, RL, RR]
  wheelMeshes: THREE.Group[]; // spin around local X
  headlightMat: THREE.MeshStandardMaterial;
  brakeLightMat: THREE.MeshStandardMaterial;
  headlightBeamGroup: THREE.Group;
  headlightSpot: THREE.SpotLight | null;
  setLights: (headlightsOn: boolean, isBraking: boolean, isNight: boolean) => void;
  dispose: () => void;
}

let sharedShadowTex: THREE.CanvasTexture | null = null;
let sharedBeamTex: THREE.CanvasTexture | null = null;
let sharedGltfLoader: GLTFLoader | null = null;
let sharedDracoLoader: DRACOLoader | null = null;

// Cache em memória de modelos .GLB normalizados + deduplicação de downloads concorrentes
const glbModelCache = new Map<string, THREE.Group>();
const glbInFlight = new Map<string, Promise<THREE.Group | null>>();
let activeGlbDownloads = 0;
const glbLoadingListeners = new Set<(loading: boolean) => void>();

export function isGlbLoading(): boolean {
  return activeGlbDownloads > 0;
}

export function subscribeGlbLoading(listener: (loading: boolean) => void): () => void {
  glbLoadingListeners.add(listener);
  listener(activeGlbDownloads > 0);
  return () => {
    glbLoadingListeners.delete(listener);
  };
}

function notifyGlbLoading(): void {
  const loading = activeGlbDownloads > 0;
  glbLoadingListeners.forEach((fn) => fn(loading));
}

function getGltfLoader(): GLTFLoader {
  if (!sharedGltfLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(DRACO_DECODER_URL);
    sharedGltfLoader = new GLTFLoader();
    sharedGltfLoader.setDRACOLoader(sharedDracoLoader);
  }
  return sharedGltfLoader;
}

function cloneCachedGlbGroup(template: THREE.Group): THREE.Group {
  try {
    return cloneSkeleton(template) as THREE.Group;
  } catch {
    return template.clone(true);
  }
}

function getMaterialNames(mat: THREE.Material | THREE.Material[] | undefined): string {
  if (!mat) return '';
  if (Array.isArray(mat)) return mat.map((m) => m?.name ?? '').join(' ');
  return mat.name ?? '';
}

/**
 * Identifica se um mesh do .GLB faz parte da lataria principal que deve receber pintura PBR
 * (ignorando vidros transparentes, borrachas de pneus, plásticos escuros, rodas e interior).
 */
function isPrimaryBodyPaintMesh(mesh: THREE.Mesh): boolean {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const matNames = getMaterialNames(mesh.material);
  const idStr = `${mesh.name} ${mesh.parent?.name ?? ''} ${matNames}`.toLowerCase();

  // 1. Ignorar vidros e materiais translúcidos
  for (const m of mats) {
    if (!m) continue;
    if (m.transparent || m.opacity < 0.95) return false;
  }
  if (/vidro|glass|window|windshield|parabrisa|lente|lens/i.test(idStr)) {
    return false;
  }

  // 2. Materiais explicitamente nomeados como pintura original de fábrica (Carro_Pintura / Car_Paint / bodypaint)
  if (/carro_pintura|car_paint|bodypaint/i.test(idStr)) {
    return true;
  }

  // 3. Ignorar pneus, rodas, freios, plásticos escuros, interior, faróis, lanternas e emblemas cromados
  if (
    /pneu|tire|tyre|wheel|roda|(?:\b|_)rim|freio|brake|breaks|caliper|plastico|plastic|borracha|rubber|interno|interior|seat|banco|painel|metal_preto|black_metal|black_col|farol|headlight|lanterna|taillight|tail_light|red_emis|cromado|chrome|espelho|mirror|grade|grille|placa|plate|exhaust|escape|Badge|logo/i.test(
      idStr,
    )
  ) {
    return false;
  }

  // 4. Outros materiais de carroceria
  if (/pintura|paint|body|carroceria|lataria|carpaint|exterior_paint|hull|shell/i.test(idStr)) {
    return true;
  }

  return false;
}

/**
 * Normaliza escala (~4.3m..4.65m), orientação (MODEL_YAW_OFFSET), centraliza X/Z, apoia base das rodas em Y = 0
 * e separa automaticamente as 4 rodas (FL, FR, RL, RR) com seus pivôs exatos para giro e esterçamento.
 */
function normalizeAndExtractGlbTemplate(
  rawScene: THREE.Group,
  targetLengthM = TARGET_CAR_LENGTH_M,
): THREE.Group {
  rawScene.rotation.y += MODEL_YAW_OFFSET;
  rawScene.updateMatrixWorld(true);

  const initialBox = new THREE.Box3().setFromObject(rawScene);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const maxSpan = Math.max(initialSize.z, initialSize.x, 0.001);
  const scale = targetLengthM / maxSpan;

  rawScene.scale.multiplyScalar(scale);
  rawScene.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(rawScene);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

  // Centraliza X e Z em 0 e apoia a base dos pneus exatamente em Y = 0
  rawScene.position.x -= scaledCenter.x;
  rawScene.position.y -= scaledBox.min.y;
  rawScene.position.z -= scaledCenter.z;

  const templateRoot = new THREE.Group();
  const bodyContainer = new THREE.Group();
  bodyContainer.name = '__glb_body__';
  bodyContainer.add(rawScene);
  templateRoot.add(bodyContainer);
  templateRoot.updateMatrixWorld(true);

  // Coleta meshes candidatos a rodas/pneus/aros/discos e pinças de freio
  const wheelCandidates: Array<{ mesh: THREE.Mesh; isSpin: boolean; isPrimaryTireOrRim: boolean }> = [];
  rawScene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const idStr = `${mesh.name} ${mesh.parent?.name ?? ''} ${getMaterialNames(mesh.material)}`.toLowerCase();
    if (/steering|volante/i.test(idStr)) return;

    const isSpin =
      /wheel|roda|tire|tyre|pneu|(?:\b|_)rim|freio_disco|brake_disc|\bdisk_|rotor|metal_preto_1/i.test(
        idStr,
      );
    const isCaliper = !isSpin && /caliper|pinca|carro_freio$/i.test(idStr);

    if (isSpin || isCaliper) {
      const isPrimaryTireOrRim = /wheel|roda|tire|tyre|pneu|(?:\b|_)rim/i.test(idStr);
      wheelCandidates.push({ mesh, isSpin, isPrimaryTireOrRim });
    }
  });

  if (wheelCandidates.length === 0) {
    return templateRoot;
  }

  // 4 quadrantes: 0 = FL (+X, +Z), 1 = FR (-X, +Z), 2 = RL (+X, -Z), 3 = RR (-X, -Z)
  const cornerBounds = [
    new THREE.Box3(),
    new THREE.Box3(),
    new THREE.Box3(),
    new THREE.Box3(),
  ];
  const fallbackBounds = [
    new THREE.Box3(),
    new THREE.Box3(),
    new THREE.Box3(),
    new THREE.Box3(),
  ];
  const cornerSpinMeshes: [THREE.Mesh[], THREE.Mesh[], THREE.Mesh[], THREE.Mesh[]] = [[], [], [], []];
  const cornerCaliperMeshes: [THREE.Mesh[], THREE.Mesh[], THREE.Mesh[], THREE.Mesh[]] = [[], [], [], []];
  const vtx = new THREE.Vector3();

  for (const { mesh, isSpin, isPrimaryTireOrRim } of wheelCandidates) {
    const worldGeo = mesh.geometry.clone();
    worldGeo.applyMatrix4(mesh.matrixWorld);

    const posAttr = worldGeo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr || posAttr.count < 3) continue;

    const indexAttr = worldGeo.getIndex();
    const indexArray = indexAttr ? indexAttr.array : null;
    const triVertexCount = indexArray ? indexArray.length : posAttr.count;

    const quadIndices: [number[], number[], number[], number[]] = [[], [], [], []];

    for (let t = 0; t + 2 < triVertexCount; t += 3) {
      const i0 = indexArray ? indexArray[t] : t;
      const i1 = indexArray ? indexArray[t + 1] : t + 1;
      const i2 = indexArray ? indexArray[t + 2] : t + 2;

      const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
      const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;
      const q = cx >= 0 ? (cz >= 0 ? 0 : 2) : cz >= 0 ? 1 : 3;

      quadIndices[q].push(i0, i1, i2);

      if (isSpin) {
        const targetBox = isPrimaryTireOrRim ? cornerBounds[q] : fallbackBounds[q];
        vtx.set(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
        targetBox.expandByPoint(vtx);
        vtx.set(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
        targetBox.expandByPoint(vtx);
        vtx.set(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
        targetBox.expandByPoint(vtx);
      }
    }

    for (let q = 0; q < 4; q++) {
      if (quadIndices[q].length === 0) continue;
      const subGeo = new THREE.BufferGeometry();
      for (const [attrName, attr] of Object.entries(worldGeo.attributes)) {
        subGeo.setAttribute(attrName, attr);
      }
      subGeo.setIndex(quadIndices[q]);

      const subMesh = new THREE.Mesh(subGeo, mesh.material);
      subMesh.name = `${mesh.name}_wheel_q${q}`;
      subMesh.castShadow = false;
      subMesh.receiveShadow = true;

      if (isSpin) {
        cornerSpinMeshes[q].push(subMesh);
      } else {
        cornerCaliperMeshes[q].push(subMesh);
      }
    }

    // Remove o mesh original de roda da carroceria fixa para evitar duplicação
    mesh.visible = false;
    mesh.parent?.remove(mesh);
  }

  for (let q = 0; q < 4; q++) {
    const activeBox = !cornerBounds[q].isEmpty() ? cornerBounds[q] : fallbackBounds[q];
    if (activeBox.isEmpty() || cornerSpinMeshes[q].length === 0) continue;

    const axleCenter = activeBox.getCenter(new THREE.Vector3());
    const cornerGroup = new THREE.Group();
    cornerGroup.name = `__glb_wheel_${q}__`;
    cornerGroup.position.copy(axleCenter);

    const spinGroup = new THREE.Group();
    spinGroup.name = '__glb_spin__';
    spinGroup.position.set(-axleCenter.x, -axleCenter.y, -axleCenter.z);
    for (const sm of cornerSpinMeshes[q]) {
      spinGroup.add(sm);
    }
    cornerGroup.add(spinGroup);

    const caliperGroup = new THREE.Group();
    caliperGroup.name = '__glb_caliper__';
    caliperGroup.position.set(-axleCenter.x, -axleCenter.y, -axleCenter.z);
    for (const cm of cornerCaliperMeshes[q]) {
      caliperGroup.add(cm);
    }
    cornerGroup.add(caliperGroup);

    templateRoot.add(cornerGroup);
  }

  return templateRoot;
}

/**
 * Carregador de modelos externos `.GLB` (2K) com `GLTFLoader` + `DRACOLoader` e cache em memória.
 * Baixa o arquivo apenas uma vez e reutiliza instantaneamente entre Lobby, Garagem, Loja, Oficina e Pista.
 * Se a URL falhar, retorna `null` mantendo o carro procedural como fallback automático.
 */
export async function loadExternalGlbModel(
  url: string = DEFAULT_PLAYER_GLB_URL,
  targetLengthM: number = TARGET_CAR_LENGTH_M,
): Promise<THREE.Group | null> {
  if (!url) return null;
  const cacheKey = `${url}::${targetLengthM.toFixed(2)}`;

  const cached = glbModelCache.get(cacheKey);
  if (cached) {
    return cloneCachedGlbGroup(cached);
  }

  const existingPromise = glbInFlight.get(cacheKey);
  if (existingPromise) {
    const template = await existingPromise;
    return template ? cloneCachedGlbGroup(template) : null;
  }

  activeGlbDownloads += 1;
  notifyGlbLoading();

  const downloadPromise = (async (): Promise<THREE.Group | null> => {
    try {
      const loader = getGltfLoader();
      let gltf;
      const fileMatch = url.match(/\/([^/?#]+\.glb)(?:[?#]|$)/i);
      if (fileMatch) {
        try {
          gltf = await loader.loadAsync(`/models/${fileMatch[1]}`);
        } catch {
          gltf = await loader.loadAsync(url);
        }
      } else {
        gltf = await loader.loadAsync(url);
      }
      const preparedTemplate = normalizeAndExtractGlbTemplate(gltf.scene, targetLengthM);
      glbModelCache.set(cacheKey, preparedTemplate);
      return preparedTemplate;
    } catch {
      return null;
    } finally {
      glbInFlight.delete(cacheKey);
      activeGlbDownloads = Math.max(0, activeGlbDownloads - 1);
      notifyGlbLoading();
    }
  })();

  glbInFlight.set(cacheKey, downloadPromise);
  const template = await downloadPromise;
  return template ? cloneCachedGlbGroup(template) : null;
}

function getContactShadowTexture(): THREE.CanvasTexture {
  if (sharedShadowTex) return sharedShadowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 128, 12, 64, 128, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.68)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.42)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  sharedShadowTex = new THREE.CanvasTexture(canvas);
  return sharedShadowTex;
}

function getHeadlightBeamTexture(): THREE.CanvasTexture {
  if (sharedBeamTex) return sharedBeamTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0.0, 'rgba(255, 250, 224, 0.58)');
  grad.addColorStop(0.35, 'rgba(254, 243, 199, 0.24)');
  grad.addColorStop(1.0, 'rgba(254, 243, 199, 0.0)');
  ctx.fillStyle = grad;

  // Soft trapezoid cone
  ctx.beginPath();
  ctx.moveTo(46, 256);
  ctx.lineTo(82, 256);
  ctx.lineTo(126, 0);
  ctx.lineTo(2, 0);
  ctx.closePath();
  ctx.fill();

  sharedBeamTex = new THREE.CanvasTexture(canvas);
  sharedBeamTex.colorSpace = THREE.SRGBColorSpace;
  return sharedBeamTex;
}

function createAutomotivePaintMaterial(
  colorHex: string,
  finish: PaintFinish,
): THREE.MeshPhysicalMaterial {
  if (finish === 'matte') {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colorHex),
      metalness: 0.14,
      roughness: 0.68,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      envMapIntensity: 0.78,
    });
  }
  if (finish === 'chrome') {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colorHex).lerp(new THREE.Color('#ffffff'), 0.22),
      metalness: 0.98,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.85,
    });
  }
  // Default: Automotive Metallic Clearcoat PBR
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colorHex),
    metalness: 0.62,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.35,
  });
}

function getBodyDimensions(style: CarBodyStyle) {
  switch (style) {
    case 'hatch':
      return {
        length: 4.18,
        width: 1.72,
        lowerH: 0.52,
        cabinLen: 2.05,
        cabinH: 0.56,
        cabinZOffset: -0.22,
        noseSlope: 0.14,
        hasTallWing: false,
        hasRoofSpoiler: true,
        wheelZFront: 1.32,
        wheelZRear: -1.30,
        trackHalfX: 0.87,
      };
    case 'coupe':
      return {
        length: 4.44,
        width: 1.76,
        lowerH: 0.48,
        cabinLen: 1.78,
        cabinH: 0.48,
        cabinZOffset: -0.20,
        noseSlope: 0.18,
        hasTallWing: true,
        hasRoofSpoiler: false,
        wheelZFront: 1.34,
        wheelZRear: -1.26,
        trackHalfX: 0.89,
      };
    case 'midship':
      return {
        length: 4.46,
        width: 1.84,
        lowerH: 0.42,
        cabinLen: 1.62,
        cabinH: 0.43,
        cabinZOffset: 0.10,
        noseSlope: 0.22,
        hasTallWing: true,
        hasRoofSpoiler: false,
        wheelZFront: 1.32,
        wheelZRear: -1.28,
        trackHalfX: 0.93,
      };
    case 'sedan_gtr':
      return {
        length: 4.60,
        width: 1.82,
        lowerH: 0.54,
        cabinLen: 1.98,
        cabinH: 0.50,
        cabinZOffset: -0.15,
        noseSlope: 0.15,
        hasTallWing: true,
        hasRoofSpoiler: false,
        wheelZFront: 1.38,
        wheelZRear: -1.32,
        trackHalfX: 0.92,
      };
    case 'rotary_coupe':
      return {
        length: 4.28,
        width: 1.80,
        lowerH: 0.43,
        cabinLen: 1.68,
        cabinH: 0.44,
        cabinZOffset: -0.24,
        noseSlope: 0.21,
        hasTallWing: true,
        hasRoofSpoiler: false,
        wheelZFront: 1.26,
        wheelZRear: -1.22,
        trackHalfX: 0.91,
      };
    case 'rally_sedan':
      return {
        length: 4.38,
        width: 1.80,
        lowerH: 0.56,
        cabinLen: 2.02,
        cabinH: 0.54,
        cabinZOffset: -0.10,
        noseSlope: 0.14,
        hasTallWing: true,
        hasRoofSpoiler: false,
        wheelZFront: 1.32,
        wheelZRear: -1.28,
        trackHalfX: 0.91,
      };
    case 'gt_coupe':
      return {
        length: 4.52,
        width: 1.86,
        lowerH: 0.47,
        cabinLen: 1.72,
        cabinH: 0.45,
        cabinZOffset: -0.30,
        noseSlope: 0.20,
        hasTallWing: true,
        hasRoofSpoiler: false,
        wheelZFront: 1.32,
        wheelZRear: -1.26,
        trackHalfX: 0.94,
      };
  }
}

function buildRimDesign(
  spinGroup: THREE.Group,
  rimStyle: RimStyle,
  wheelRadius: number,
  wheelWidth: number,
  rimMat: THREE.Material,
  chromeMat: THREE.Material,
  trimMat: THREE.Material,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): void {
  const outerRimR = wheelRadius * 0.69;

  if (rimStyle === 'mesh_gt') {
    const backingGeo = trackGeo(new THREE.CylinderGeometry(outerRimR * 0.94, outerRimR * 0.94, wheelWidth + 0.012, 18));
    backingGeo.rotateZ(Math.PI / 2);
    spinGroup.add(new THREE.Mesh(backingGeo, trimMat));

    const lipGeo = trackGeo(new THREE.TorusGeometry(outerRimR * 0.96, 0.028, 8, 20));
    lipGeo.rotateY(Math.PI / 2);
    for (const sx of [-wheelWidth * 0.505, wheelWidth * 0.505]) {
      const lip = new THREE.Mesh(lipGeo, chromeMat);
      lip.position.x = sx;
      spinGroup.add(lip);
    }
    const hubGeo = trackGeo(new THREE.CylinderGeometry(outerRimR * 0.34, outerRimR * 0.34, wheelWidth + 0.038, 12));
    hubGeo.rotateZ(Math.PI / 2);
    spinGroup.add(new THREE.Mesh(hubGeo, chromeMat));

    const fineSpokeGeo = trackGeo(new THREE.BoxGeometry(wheelWidth + 0.028, outerRimR * 1.88, 0.034));
    for (let s = 0; s < 6; s++) {
      const spoke = new THREE.Mesh(fineSpokeGeo, rimMat);
      spoke.rotation.x = (s * Math.PI) / 6;
      spinGroup.add(spoke);
    }
    return;
  }

  if (rimStyle === 'deep_dish') {
    const dishFaceGeo = trackGeo(new THREE.CylinderGeometry(outerRimR * 0.95, outerRimR * 0.95, wheelWidth + 0.014, 20));
    dishFaceGeo.rotateZ(Math.PI / 2);
    spinGroup.add(new THREE.Mesh(dishFaceGeo, trimMat));

    const lipGeo = trackGeo(new THREE.TorusGeometry(outerRimR * 0.94, 0.034, 8, 22));
    lipGeo.rotateY(Math.PI / 2);
    for (const sx of [-wheelWidth * 0.51, wheelWidth * 0.51]) {
      const lip = new THREE.Mesh(lipGeo, chromeMat);
      lip.position.x = sx;
      spinGroup.add(lip);
    }

    const spokeGeo = trackGeo(new THREE.BoxGeometry(wheelWidth + 0.028, outerRimR * 1.72, 0.056));
    for (let s = 0; s < 5; s++) {
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      spoke.rotation.x = (s * Math.PI * 2) / 5;
      spinGroup.add(spoke);
    }

    const centerCapGeo = trackGeo(new THREE.CylinderGeometry(outerRimR * 0.28, outerRimR * 0.28, wheelWidth + 0.04, 12));
    centerCapGeo.rotateZ(Math.PI / 2);
    spinGroup.add(new THREE.Mesh(centerCapGeo, chromeMat));
    return;
  }

  if (rimStyle === 'aero_turbo') {
    const discGeo = trackGeo(new THREE.CylinderGeometry(outerRimR, outerRimR, wheelWidth + 0.024, 20));
    discGeo.rotateZ(Math.PI / 2);
    spinGroup.add(new THREE.Mesh(discGeo, trimMat));

    const ringGeo = trackGeo(new THREE.TorusGeometry(outerRimR * 0.86, 0.024, 8, 20));
    ringGeo.rotateY(Math.PI / 2);
    for (const sx of [-wheelWidth * 0.51, wheelWidth * 0.51]) {
      const ring = new THREE.Mesh(ringGeo, rimMat);
      ring.position.x = sx;
      spinGroup.add(ring);
    }

    const vaneGeo = trackGeo(new THREE.BoxGeometry(wheelWidth + 0.035, outerRimR * 0.72, 0.032));
    for (let s = 0; s < 4; s++) {
      const vane = new THREE.Mesh(vaneGeo, chromeMat);
      vane.rotation.x = (s * Math.PI) / 4;
      spinGroup.add(vane);
    }
    return;
  }

  // Default: stock_5spoke
  const rimGeo = trackGeo(new THREE.CylinderGeometry(outerRimR * 0.96, outerRimR * 0.96, wheelWidth + 0.015, 16));
  rimGeo.rotateZ(Math.PI / 2);
  spinGroup.add(new THREE.Mesh(rimGeo, rimMat));

  const spokeGeo = trackGeo(new THREE.BoxGeometry(wheelWidth + 0.028, wheelRadius * 1.18, 0.055));
  for (let s = 0; s < 3; s++) {
    const spoke = new THREE.Mesh(spokeGeo, chromeMat);
    spoke.rotation.x = (s * Math.PI) / 3;
    spinGroup.add(spoke);
  }
}

/**
 * Gera um modelo 3D automotivo PBR (MeshPhysicalMaterial Clearcoat com suporte a Metálico, Fosco e Cromado),
 * 4 estilos de rodas, Aerofólio GT opcional, suspensão rebaixável, feixes de farol noturno e carregamento `.GLB` 2K
 * com fallback procedural automático.
 * Orientação: +Z = frente do veículo, +Y = cima, pivot no solo (Y = 0).
 */
export function buildProceduralCar(
  car: CarSpec,
  visualOrColor?: CarVisualConfig | string,
  castShadow = true,
  enableSpotLight = false,
): ProceduralCarRig {
  const visual: CarVisualConfig =
    typeof visualOrColor === 'string' || visualOrColor === undefined
      ? {
          paintHex: visualOrColor,
          paintFinish: 'metallic',
          rimStyle: 'stock_5spoke',
          gtWing: false,
          rideHeightDropM: 0,
          glbUrl: car.glbUrl,
        }
      : visualOrColor;

  const dim = getBodyDimensions(car.bodyStyle);
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  // Apply suspension visual lowering cleanly (chassisStage 0..3 -> 0..-0.09m)
  bodyGroup.position.y = -Math.max(0, Math.min(0.11, visual.rideHeightDropM));
  root.add(bodyGroup);

  // 1. Soft contact shadow grounded right at Y = 0.025
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(dim.width * 1.38, dim.length * 1.18));
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.68,
    }),
  );
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.025;
  root.add(shadowPlane);

  // PBR Materials with automotive clearcoat & distinct finish modes
  const paintMat = trackMat(
    createAutomotivePaintMaterial(visual.paintHex ?? car.colorHex, visual.paintFinish),
  );

  const trimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(car.accentHex),
      metalness: 0.24,
      roughness: 0.72,
    }),
  );

  const carbonMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#181c24'),
      metalness: 0.35,
      roughness: 0.28,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
    }),
  );

  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#111827'),
      metalness: 0.18,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.4,
    }),
  );

  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e2e8f0'),
      metalness: 0.94,
      roughness: 0.12,
      envMapIntensity: 1.5,
    }),
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fffbeb'),
      emissive: new THREE.Color('#fef3c7'),
      emissiveIntensity: 0.9,
      roughness: 0.1,
      metalness: 0.1,
    }),
  );

  const brakeLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#7f1d1d'),
      emissive: new THREE.Color('#ef4444'),
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.15,
    }),
  );

  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#15181d'),
      roughness: 0.88,
      metalness: 0.04,
    }),
  );

  const rimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        visual.rimStyle === 'deep_dish'
          ? '#eab308'
          : visual.rimStyle === 'mesh_gt'
            ? '#f8fafc'
            : visual.rimStyle === 'aero_turbo'
              ? '#334155'
              : car.rimHex,
      ),
      metalness: 0.88,
      roughness: 0.18,
      envMapIntensity: 1.35,
    }),
  );

  const caliperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#dc2626'),
      roughness: 0.35,
      metalness: 0.45,
    }),
  );

  const proceduralBodyContainer = new THREE.Group();
  bodyGroup.add(proceduralBodyContainer);

  // 2. Primary Silhouette — Sculpted Extruded Side Profile for Lower Chassis
  const halfL = dim.length * 0.5;
  const wheelClearanceY = 0.22;
  const sideShape = new THREE.Shape();
  sideShape.moveTo(-halfL, wheelClearanceY + 0.06);
  sideShape.lineTo(halfL - 0.18, wheelClearanceY + 0.02);
  sideShape.lineTo(halfL, wheelClearanceY + 0.18);
  sideShape.lineTo(halfL - 0.06, wheelClearanceY + dim.lowerH - dim.noseSlope);
  sideShape.lineTo(halfL * 0.42, wheelClearanceY + dim.lowerH);
  sideShape.lineTo(-halfL + 0.10, wheelClearanceY + dim.lowerH + 0.04);
  sideShape.lineTo(-halfL, wheelClearanceY + dim.lowerH - 0.04);
  sideShape.closePath();

  const lowerGeo = trackGeo(
    new THREE.ExtrudeGeometry(sideShape, {
      depth: dim.width - 0.12,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 2,
    }),
  );
  lowerGeo.translate(0, 0, -(dim.width - 0.12) * 0.5);
  lowerGeo.rotateY(-Math.PI / 2);
  lowerGeo.computeVertexNormals();

  const lowerBody = new THREE.Mesh(lowerGeo, paintMat);
  lowerBody.castShadow = castShadow;
  lowerBody.receiveShadow = true;
  proceduralBodyContainer.add(lowerBody);

  // 3. Secondary Read — Sculpted Tapered Greenhouse / Cabin
  const cabinShape = new THREE.Shape();
  const cHalf = dim.cabinLen * 0.5;
  const baseCabinY = wheelClearanceY + dim.lowerH - 0.02;
  cabinShape.moveTo(-cHalf, baseCabinY);
  cabinShape.lineTo(cHalf, baseCabinY);
  cabinShape.lineTo(cHalf * 0.48, baseCabinY + dim.cabinH);
  cabinShape.lineTo(-cHalf * (car.bodyStyle === 'hatch' ? 0.85 : 0.62), baseCabinY + dim.cabinH);
  cabinShape.closePath();

  const cabinWidth = dim.width * 0.78;
  const cabinGeo = trackGeo(
    new THREE.ExtrudeGeometry(cabinShape, {
      depth: cabinWidth,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 2,
    }),
  );
  cabinGeo.translate(0, 0, -cabinWidth * 0.5);
  cabinGeo.rotateY(-Math.PI / 2);
  cabinGeo.computeVertexNormals();

  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  cabinMesh.position.z = dim.cabinZOffset;
  cabinMesh.castShadow = false;
  proceduralBodyContainer.add(cabinMesh);

  // Roof cap painted in body color
  const roofCapLen = dim.cabinLen * (car.bodyStyle === 'hatch' ? 0.64 : 0.52);
  const roofCapGeo = trackGeo(new THREE.BoxGeometry(cabinWidth * 0.94, 0.06, roofCapLen));
  const roofCap = new THREE.Mesh(roofCapGeo, paintMat);
  roofCap.position.set(
    0,
    baseCabinY + dim.cabinH + 0.02,
    dim.cabinZOffset - (car.bodyStyle === 'hatch' ? 0.14 : 0.06),
  );
  roofCap.castShadow = castShadow;
  proceduralBodyContainer.add(roofCap);

  // 4. Front Splitter, Grille & Side Skirts
  const splitterGeo = trackGeo(new THREE.BoxGeometry(dim.width * 0.98, 0.08, 0.34));
  const splitter = new THREE.Mesh(splitterGeo, trimMat);
  splitter.position.set(0, wheelClearanceY + 0.03, halfL - 0.10);
  proceduralBodyContainer.add(splitter);

  const grilleGeo = trackGeo(new THREE.BoxGeometry(dim.width * 0.54, 0.16, 0.08));
  const grille = new THREE.Mesh(grilleGeo, trimMat);
  grille.position.set(0, wheelClearanceY + 0.22, halfL + 0.01);
  proceduralBodyContainer.add(grille);

  const skirtGeo = trackGeo(new THREE.BoxGeometry(dim.width + 0.05, 0.09, dim.length * 0.54));
  const skirt = new THREE.Mesh(skirtGeo, trimMat);
  skirt.position.set(0, wheelClearanceY + 0.04, 0);
  proceduralBodyContainer.add(skirt);

  // 5. Rear Diffuser, Dark Tail Fascia, License Plate & Chrome Exhaust Tips
  const diffuserGeo = trackGeo(new THREE.BoxGeometry(dim.width * 0.92, 0.16, 0.24));
  const diffuser = new THREE.Mesh(diffuserGeo, trimMat);
  diffuser.position.set(0, wheelClearanceY + 0.09, -halfL - 0.01);
  proceduralBodyContainer.add(diffuser);

  const rearFasciaGeo = trackGeo(new THREE.BoxGeometry(dim.width * 0.88, 0.16, 0.05));
  const rearFascia = new THREE.Mesh(rearFasciaGeo, trimMat);
  rearFascia.position.set(0, wheelClearanceY + dim.lowerH - 0.13, -halfL - 0.055);
  proceduralBodyContainer.add(rearFascia);

  const plateGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.13, 0.04));
  const plateMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35, metalness: 0.1 }),
  );
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.set(0, wheelClearanceY + 0.25, -halfL - 0.065);
  proceduralBodyContainer.add(plate);

  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 12));
  exhaustGeo.rotateX(Math.PI / 2);
  const exhaustOffsets = car.bodyStyle === 'hatch' ? [0.52] : [-0.48, 0.48];
  for (const ex of exhaustOffsets) {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.position.set(ex, wheelClearanceY + 0.09, -halfL - 0.11);
    proceduralBodyContainer.add(pipe);
  }

  // 6. Headlights & Dynamic Brake Lights
  const hlY = wheelClearanceY + dim.lowerH - dim.noseSlope - 0.07;
  const hlGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.13, 0.09));
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(side * (dim.width * 0.34), hlY, halfL + 0.045);
    proceduralBodyContainer.add(hl);
  }

  if (car.bodyStyle === 'sedan_gtr') {
    const ringGeo = trackGeo(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 14));
    ringGeo.rotateX(Math.PI / 2);
    for (const sx of [-0.62, -0.39, 0.39, 0.62]) {
      const tl = new THREE.Mesh(ringGeo, brakeLightMat);
      tl.position.set(sx, wheelClearanceY + dim.lowerH - 0.13, -halfL - 0.075);
      proceduralBodyContainer.add(tl);
    }
  } else {
    const tlGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.12, 0.06));
    for (const side of [-1, 1]) {
      const tl = new THREE.Mesh(tlGeo, brakeLightMat);
      tl.position.set(side * (dim.width * 0.31), wheelClearanceY + dim.lowerH - 0.13, -halfL - 0.075);
      proceduralBodyContainer.add(tl);
    }
  }

  // 7. Side Mirrors
  const mirrorGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.09, 0.12));
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(mirrorGeo, paintMat);
    mirror.position.set(side * (dim.width * 0.50), baseCabinY + 0.12, dim.cabinZOffset + cHalf * 0.55);
    proceduralBodyContainer.add(mirror);
  }

  // 8. Rear Wing / Aerofólio GT Customizado / Rally Scoop
  if (car.bodyStyle === 'rally_sedan') {
    const scoopGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.08, 0.44));
    const scoop = new THREE.Mesh(scoopGeo, trimMat);
    scoop.position.set(0, wheelClearanceY + dim.lowerH + 0.03, halfL * 0.42);
    proceduralBodyContainer.add(scoop);
  }

  const customGtWingGroup = new THREE.Group();
  bodyGroup.add(customGtWingGroup);

  if (visual.gtWing) {
    // High-Downforce Swan-Neck Carbon GT Wing with large endplates (stays visible on both procedural & .GLB)
    const deckY = wheelClearanceY + dim.lowerH;
    const gtTopY = deckY + (car.bodyStyle === 'hatch' ? 0.52 : 0.44);
    const bladeGeo = trackGeo(new THREE.BoxGeometry(dim.width * 1.12, 0.045, 0.30));
    const blade = new THREE.Mesh(bladeGeo, carbonMat);
    blade.position.set(0, gtTopY, -halfL + 0.06);
    blade.rotation.x = 0.08;
    blade.castShadow = false;
    customGtWingGroup.add(blade);

    const endplateGeo = trackGeo(new THREE.BoxGeometry(0.035, 0.24, 0.42));
    for (const side of [-1, 1]) {
      const ep = new THREE.Mesh(endplateGeo, paintMat);
      ep.position.set(side * (dim.width * 0.56), gtTopY - 0.02, -halfL + 0.06);
      customGtWingGroup.add(ep);
    }

    const swanGeo = trackGeo(new THREE.BoxGeometry(0.05, gtTopY - deckY, 0.18));
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(swanGeo, carbonMat);
      strut.position.set(side * (dim.width * 0.26), (gtTopY + deckY) * 0.5, -halfL + 0.14);
      strut.rotation.x = -0.14;
      customGtWingGroup.add(strut);
    }
  } else if (dim.hasTallWing) {
    const wingLift =
      car.bodyStyle === 'rally_sedan'
        ? 0.36
        : car.bodyStyle === 'sedan_gtr' || car.bodyStyle === 'gt_coupe'
          ? 0.31
          : 0.22;
    const wingTopY = wheelClearanceY + dim.lowerH + wingLift;
    const wingBladeGeo = trackGeo(new THREE.BoxGeometry(dim.width * 0.94, 0.05, 0.24));
    const wingBlade = new THREE.Mesh(wingBladeGeo, paintMat);
    wingBlade.position.set(0, wingTopY, -halfL + 0.16);
    wingBlade.castShadow = false;
    proceduralBodyContainer.add(wingBlade);

    if (car.bodyStyle === 'rally_sedan') {
      const midBlade = new THREE.Mesh(wingBladeGeo, trimMat);
      midBlade.position.set(0, wingTopY - 0.13, -halfL + 0.14);
      proceduralBodyContainer.add(midBlade);
    }

    const strutGeo = trackGeo(new THREE.BoxGeometry(0.06, wingTopY - (wheelClearanceY + dim.lowerH), 0.16));
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(strutGeo, car.bodyStyle === 'gt_coupe' ? paintMat : trimMat);
      strut.position.set(side * (dim.width * 0.38), (wingTopY + wheelClearanceY + dim.lowerH) * 0.5, -halfL + 0.16);
      proceduralBodyContainer.add(strut);
    }
  } else if (dim.hasRoofSpoiler) {
    const roofWingGeo = trackGeo(new THREE.BoxGeometry(cabinWidth * 0.98, 0.07, 0.24));
    const roofWing = new THREE.Mesh(roofWingGeo, paintMat);
    roofWing.position.set(0, baseCabinY + dim.cabinH + 0.03, dim.cabinZOffset - cHalf + 0.04);
    roofWing.rotation.x = 0.14;
    proceduralBodyContainer.add(roofWing);
  }

  // 9. Nighttime Headlight Road Beams (Lightweight translucent light cones + GPU SpotLight)
  const headlightBeamGroup = new THREE.Group();
  const beamGeo = trackGeo(new THREE.PlaneGeometry(3.4, 24));
  const beamMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: getHeadlightBeamTexture(),
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(side * (dim.width * 0.32), 0.09, halfL + 12.1);
    headlightBeamGroup.add(beam);
  }
  headlightBeamGroup.visible = false;
  root.add(headlightBeamGroup);

  let headlightSpot: THREE.SpotLight | null = null;
  if (enableSpotLight) {
    headlightSpot = new THREE.SpotLight('#fff7dc', 0, 58, Math.PI / 4.2, 0.65, 1.4);
    headlightSpot.position.set(0, hlY + 0.25, halfL + 0.15);
    headlightSpot.target.position.set(0, 0.1, halfL + 22);
    headlightSpot.castShadow = false;
    bodyGroup.add(headlightSpot);
    bodyGroup.add(headlightSpot.target);
  }

  // 10. Four Articulated Wheels (with 4 selectable Rim Styles + Calipers)
  const wheelRadius = 0.32;
  const wheelWidth = 0.24;
  const tireGeo = trackGeo(new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 20));
  tireGeo.rotateZ(Math.PI / 2);
  const caliperGeo = trackGeo(new THREE.BoxGeometry(0.09, 0.15, 0.12));

  const wheelPivots: THREE.Group[] = [];
  const wheelMeshes: THREE.Group[] = [];
  const fallbackWheelParts: THREE.Object3D[] = [];
  const positions: Array<[number, number, number]> = [
    [dim.trackHalfX, wheelRadius, dim.wheelZFront],   // FL
    [-dim.trackHalfX, wheelRadius, dim.wheelZFront],  // FR
    [dim.trackHalfX, wheelRadius, dim.wheelZRear],    // RL
    [-dim.trackHalfX, wheelRadius, dim.wheelZRear],   // RR
  ];

  for (let i = 0; i < 4; i++) {
    const [wx, wy, wz] = positions[i];
    const pivot = new THREE.Group();
    pivot.position.set(wx, wy, wz);

    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(wx > 0 ? -0.04 : 0.04, 0.04, -0.10);
    pivot.add(caliper);
    fallbackWheelParts.push(caliper);

    const spinGroup = new THREE.Group();
    const fallbackSpinVisual = new THREE.Group();
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    tireMesh.castShadow = false;
    fallbackSpinVisual.add(tireMesh);

    buildRimDesign(fallbackSpinVisual, visual.rimStyle, wheelRadius, wheelWidth, rimMat, chromeMat, trimMat, trackGeo);

    spinGroup.add(fallbackSpinVisual);
    fallbackWheelParts.push(fallbackSpinVisual);

    pivot.add(spinGroup);
    root.add(pivot);
    wheelPivots.push(pivot);
    wheelMeshes.push(spinGroup);
  }

  // 11. Async 2K .GLB swap with automatic procedural fallback while downloading or on failure
  let cancelled = false;
  if (visual.glbUrl) {
    const targetLen = car.targetLengthM ?? TARGET_CAR_LENGTH_M;
    void loadExternalGlbModel(visual.glbUrl, targetLen).then((glbModel) => {
      if (cancelled || !glbModel) return;

      // Connect the 4 extracted .GLB wheels to steering pivots and speed rotation groups
      let connectedWheels = 0;
      for (let i = 0; i < 4; i++) {
        const cornerGroup = glbModel.getObjectByName(`__glb_wheel_${i}__`) as THREE.Group | undefined;
        if (!cornerGroup) continue;

        wheelPivots[i].position.copy(cornerGroup.position);
        const glbSpin = cornerGroup.getObjectByName('__glb_spin__');
        const glbCaliper = cornerGroup.getObjectByName('__glb_caliper__');

        if (glbSpin && glbSpin.children.length > 0) {
          // Apply custom rim color/finish if player selected an aftermarket rim style in Oficina
          if (visual.rimStyle !== 'stock_5spoke') {
            glbSpin.traverse((child) => {
              if (!(child as THREE.Mesh).isMesh) return;
              const m = child as THREE.Mesh;
              const matNames = getMaterialNames(m.material).toLowerCase();
              if (/roda|(?:\b|_)rim/i.test(matNames) && !/pneu|tire|tyre/i.test(matNames)) {
                m.material = rimMat;
              }
            });
          }
          wheelMeshes[i].add(glbSpin);
          connectedWheels += 1;
        }
        if (glbCaliper && glbCaliper.children.length > 0) {
          wheelPivots[i].add(glbCaliper);
        }
        cornerGroup.parent?.remove(cornerGroup);
      }

      if (connectedWheels > 0) {
        for (const fb of fallbackWheelParts) {
          fb.visible = false;
        }
      }

      // Traverse body meshes: apply dynamic PBR paint (clearcoat: 1.0, clearcoatRoughness: 0.08)
      // and enable castShadow ONLY on main body paint meshes for iOS & Android performance
      glbModel.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const isMainBody = isPrimaryBodyPaintMesh(mesh);

        if (isMainBody) {
          mesh.material = paintMat;
          mesh.castShadow = castShadow;
          mesh.receiveShadow = true;
        } else {
          mesh.castShadow = false;
          mesh.receiveShadow = true;

          // Link .GLB taillight and headlight reflectors to dynamic braking & night lighting
          const matName = getMaterialNames(mesh.material).toLowerCase();
          if (/carro_lanterna|taillight_emissive|brakelight|red_emis/i.test(matName)) {
            mesh.material = brakeLightMat;
          } else if (/carro_metal_farol$|^hl_mat$/i.test(matName)) {
            mesh.material = headlightMat;
          }
        }
      });

      // Elevate custom GT Wing to match the .GLB roof line when equipped
      if (visual.gtWing) {
        const glbBox = new THREE.Box3().setFromObject(glbModel);
        const roofLift = Math.max(0, glbBox.max.y - (wheelClearanceY + dim.lowerH) - 0.18);
        customGtWingGroup.position.set(0, roofLift, 0.14);
      }

      proceduralBodyContainer.visible = false;
      bodyGroup.add(glbModel);
    });
  }

  return {
    root,
    bodyGroup,
    wheelPivots,
    wheelMeshes,
    headlightMat,
    brakeLightMat,
    headlightBeamGroup,
    headlightSpot,
    setLights: (headlightsOn: boolean, isBraking: boolean, isNight: boolean) => {
      headlightBeamGroup.visible = headlightsOn;
      headlightMat.emissiveIntensity = headlightsOn ? (isNight ? 3.8 : 1.8) : 0.65;
      if (headlightSpot) {
        headlightSpot.intensity = headlightsOn && isNight ? 34 : 0;
      }
      brakeLightMat.emissiveIntensity = isBraking ? (isNight ? 4.4 : 2.8) : isNight ? 1.05 : 0.35;
    },
    dispose: () => {
      cancelled = true;
      disposables.forEach((d) => d.dispose());
    },
  };
}
