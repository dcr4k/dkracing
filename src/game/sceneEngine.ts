import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RaceAudioEngine } from './audio';
import { computeAdaptiveCameraParams } from './cameraMath';
import { buildProceduralCar, ProceduralCarRig } from './carMesh';
import {
  CARS,
  DEFAULT_CAR_ID,
  DEFAULT_PLAYER_GLB_URL,
  DEFAULT_TUNING,
  getCarById,
  getLicenseById,
} from './catalog';
import { createInitialPhysicsState, stepVehiclePhysics } from './physics';
import { computeEffectiveSpecs } from './progression';
import { buildTrackEnvironment, TrackSceneObjects } from './trackMesh';
import {
  getLicenseTrack,
  getSampleAtS,
  getTrackById,
  projectPointToTrack,
  TrackData,
} from './trackMath';
import {
  CameraMode,
  CarVisualConfig,
  ControlInput,
  EffectiveCarSpecs,
  HudTelemetry,
  LicenseTestDef,
  MinimapDot,
  SessionConfig,
  SessionResult,
  TimeOfDay,
  TrackId,
  VehiclePhysicsState,
} from './types';

// Reusable scratch math objects (zero GC in render loop)
const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _smokeDummy = new THREE.Object3D();
const _skidDummy = new THREE.Object3D();
const _sparkDummy = new THREE.Object3D();
const _sunVec = new THREE.Vector3();
const _sparkLook = new THREE.Vector3();

const DEFAULT_VISUAL: CarVisualConfig = {
  paintFinish: 'metallic',
  rimStyle: 'stock_5spoke',
  gtWing: false,
  rideHeightDropM: 0,
  glbUrl: DEFAULT_PLAYER_GLB_URL,
};

interface AiRacer {
  carId: string;
  colorHex: string;
  rig: ProceduralCarRig;
  specs: EffectiveCarSpecs;
  physics: VehiclePhysicsState;
  trackHintIdx: number;
  lap: number;
  lastS: number;
  totalProgress: number;
  laneOffset: number;
  paceFactor: number;
  finished: boolean;
}

interface SmokeParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
}

interface SparkParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export interface TouchControlState {
  steerLeft: boolean;
  steerRight: boolean;
  steerAnalog: number | null; // -1 (right) to +1 (left), overrides digital buttons when active
  throttle: boolean;
  brake: boolean;
  handbrake: boolean;
}

export interface EngineCallbacks {
  onTelemetry: (data: HudTelemetry) => void;
  onSessionFinish: (result: SessionResult) => void;
  onPauseToggle: () => void;
  onCameraChange: (mode: CameraMode) => void;
  onMuteToggle: () => void;
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class RacingSceneEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  public audio: RaceAudioEngine;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sky: Sky;
  private starField: THREE.Points;
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private sunOffset = new THREE.Vector3(65, 95, 50);
  private envTexture: THREE.Texture;
  private activeTimeOfDay: TimeOfDay = 'day';

  private trackData: TrackData;
  private trackVisuals: TrackSceneObjects | null = null;
  private playerRig: ProceduralCarRig | null = null;
  private playerSpecs: EffectiveCarSpecs;
  private playerState: VehiclePhysicsState;
  private playerHintIdx = 0;

  private aiRacers: AiRacer[] = [];

  // Pooled tire smoke ring buffer (InstancedMesh, 64 particles)
  private smokePool: SmokeParticle[] = [];
  private smokeCursor = 0;
  private smokeMesh: THREE.InstancedMesh;
  private smokeEmitAccum = 0;

  // Pooled asphalt skidmarks ring buffer (InstancedMesh, 240 segments)
  private skidMesh: THREE.InstancedMesh;
  private skidCursor = 0;
  private skidCount = 240;
  private skidEmitAccum = 0;

  // Pooled collision sparks ring buffer (InstancedMesh, 48 streaks)
  private sparkPool: SparkParticle[] = [];
  private sparkCursor = 0;
  private sparkMesh: THREE.InstancedMesh;

  // Turbo BOV edge tracking
  private prevThrottle = 0;
  private turboBovCooldown = 0;

  // Mode & session state
  private engineMode: 'showcase' | 'playing' | 'paused' | 'result' = 'showcase';
  private sessionConfig: SessionConfig | null = null;
  private licenseDef: LicenseTestDef | null = null;
  private cameraMode: CameraMode = 'chase';
  private showcaseAngle = 0.65;
  private showcaseCarId = DEFAULT_CAR_ID;
  private showcaseVisual: CarVisualConfig = { ...DEFAULT_VISUAL };
  private showcaseAlign: 'center' | 'right' = 'center';
  private showcaseTrackId: TrackId = 'grand_prix';

  // Race timing state
  private countdownTimer = 0;
  private lastCountdownBeep = 4;
  private sessionElapsed = 0;
  private lapStartTime = 0;
  private currentLap = 1;
  private bestLapTime: number | null = null;
  private lastPlayerS = 0;
  private playerTotalProgress = 0;
  private crossedHalfway = false;
  private stopZoneHoldSec = 0;
  private licenseFailed = false;
  private licenseStatusText = '';

  // Camera smoothing, high-RPM vibration & trauma shake
  private camPos = new THREE.Vector3(0, 4, -8);
  private camLook = new THREE.Vector3(0, 1, 5);
  private trauma = 0;
  private hitstopTimer = 0;
  private vibrationPhase = 0;

  // Input state (held vs edge-triggered + mobile multi-touch / virtual wheel / gyro)
  private keysHeld = new Set<string>();
  private touchState: TouchControlState = {
    steerLeft: false,
    steerRight: false,
    steerAnalog: null,
    throttle: false,
    brake: false,
    handbrake: false,
  };
  private shiftUpPending = false;
  private shiftDownPending = false;
  private prevGamepadShiftUp = false;
  private prevGamepadShiftDown = false;
  private prevGamepadCam = false;

  // Loop & lifecycle
  private frameId = 0;
  private disposed = false;
  private lastTimeMs = 0;
  private telemetryAccum = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.audio = new RaceAudioEngine();
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Cap pixel ratio <= 1.5 for locked 60 FPS on high-DPI iOS & Android displays
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#cfe2f3');
    this.scene.fog = new THREE.Fog('#d8e7f4', 170, 720);

    this.camera = new THREE.PerspectiveCamera(58, w / h, 0.25, 1300);

    // PBR Environment Reflections for Clearcoat, Metallic & Chrome Paint
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.95;
    pmrem.dispose();

    // Physically-based Three.js Sky Shader Dome
    this.sky = new Sky();
    this.sky.scale.setScalar(1800);
    this.scene.add(this.sky);

    // Night Starfield Dome (toggled visible in Night preset)
    const starCount = 420;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.15 + Math.random() * 0.85);
      const r = 820;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: '#e2e8f0',
      size: 2.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      fog: false,
      depthWrite: false,
    });
    this.starField = new THREE.Points(starGeo, starMat);
    this.starField.visible = false;
    this.scene.add(this.starField);

    // Dynamic Outdoor Lighting Rig (adjusted by TimeOfDay)
    this.hemiLight = new THREE.HemisphereLight('#a9d1ff', '#5d6b47', 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#fff6e0', 1.75);
    this.sunLight.position.set(85, 130, 65);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 340;
    const d = 65;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 1. Pooled Tire Smoke InstancedMesh (64 particles)
    const smokeCount = 64;
    const smokeGeo = new THREE.IcosahedronGeometry(0.42, 0);
    const smokeMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      transparent: true,
      opacity: 0.44,
      roughness: 1.0,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, smokeCount);
    this.smokeMesh.frustumCulled = false;
    for (let i = 0; i < smokeCount; i++) {
      this.smokePool.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 0.5,
      });
      _smokeDummy.position.set(0, -50, 0);
      _smokeDummy.scale.set(0.001, 0.001, 0.001);
      _smokeDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, _smokeDummy.matrix);
    }
    this.scene.add(this.smokeMesh);

    // 2. Pooled Asphalt Skidmarks InstancedMesh (240 rubber decals)
    const skidGeo = new THREE.PlaneGeometry(0.32, 0.95);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: '#0b0e14',
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, this.skidCount);
    this.skidMesh.frustumCulled = false;
    this.resetSkidmarks();
    this.scene.add(this.skidMesh);

    // 3. Pooled Collision Sparks InstancedMesh (48 luminous streaks)
    const sparkCount = 48;
    const sparkGeo = new THREE.BoxGeometry(0.045, 0.045, 0.42);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, sparkCount);
    this.sparkMesh.frustumCulled = false;
    for (let i = 0; i < sparkCount; i++) {
      this.sparkPool.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.35,
      });
      _sparkDummy.position.set(0, -50, 0);
      _sparkDummy.scale.set(0.001, 0.001, 0.001);
      _sparkDummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _sparkDummy.matrix);
    }
    this.scene.add(this.sparkMesh);

    // Initialize default circuit + atmosphere + showcase car
    this.trackData = getTrackById('grand_prix');
    const defaultCar = getCarById(DEFAULT_CAR_ID);
    this.playerSpecs = computeEffectiveSpecs(defaultCar, DEFAULT_TUNING);
    this.playerState = createInitialPhysicsState(0, 0, 12, 0, this.playerSpecs);

    this.rebuildTrack(this.trackData);
    this.applyTimeOfDay('day');
    this.setShowcaseCar(DEFAULT_CAR_ID, this.showcaseVisual, 'center');

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.lastTimeMs = performance.now();
    this.updateCamera(0.016);
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  }

  public applyTimeOfDay(preset: TimeOfDay): void {
    this.activeTimeOfDay = preset;
    const uniforms = this.sky.material.uniforms;

    if (preset === 'sunset') {
      uniforms['turbidity'].value = 9.5;
      uniforms['rayleigh'].value = 2.9;
      uniforms['mieCoefficient'].value = 0.0075;
      uniforms['mieDirectionalG'].value = 0.86;
      const phi = THREE.MathUtils.degToRad(84.5); // low golden sun
      const theta = THREE.MathUtils.degToRad(142);
      _sunVec.setFromSphericalCoords(1, phi, theta);
      uniforms['sunPosition'].value.copy(_sunVec);

      this.sky.visible = true;
      this.starField.visible = false;
      this.scene.background = new THREE.Color('#2d1f30');
      this.scene.fog = new THREE.Fog('#c88266', 145, 620);
      this.hemiLight.color.set('#ffb48a');
      this.hemiLight.groundColor.set('#3b2d34');
      this.hemiLight.intensity = 0.72;
      this.sunLight.color.set('#ff9955');
      this.sunLight.intensity = 2.05;
      this.sunOffset.copy(_sunVec).multiplyScalar(115);
      this.sunOffset.y = Math.max(26, this.sunOffset.y);
      this.scene.environmentIntensity = 0.88;
      this.renderer.toneMappingExposure = 0.96;
      this.trackVisuals?.setNightIllumination(0.45);
    } else if (preset === 'night') {
      uniforms['turbidity'].value = 2.0;
      uniforms['rayleigh'].value = 0.35;
      uniforms['mieCoefficient'].value = 0.002;
      uniforms['mieDirectionalG'].value = 0.7;
      const phi = THREE.MathUtils.degToRad(95); // sun below horizon
      const theta = THREE.MathUtils.degToRad(160);
      _sunVec.setFromSphericalCoords(1, phi, theta);
      uniforms['sunPosition'].value.copy(_sunVec);

      this.sky.visible = false;
      this.starField.visible = true;
      this.scene.background = new THREE.Color('#060b18');
      this.scene.fog = new THREE.Fog('#081020', 85, 390);
      this.hemiLight.color.set('#38538a');
      this.hemiLight.groundColor.set('#0e1422');
      this.hemiLight.intensity = 0.45;
      this.sunLight.color.set('#8ab4ff'); // crisp moonlight
      this.sunLight.intensity = 0.55;
      this.sunOffset.set(-45, 78, -40);
      this.scene.environmentIntensity = 0.58;
      this.renderer.toneMappingExposure = 1.12;
      this.trackVisuals?.setNightIllumination(1.0);
    } else {
      // Dia Ensolarado
      uniforms['turbidity'].value = 3.2;
      uniforms['rayleigh'].value = 1.45;
      uniforms['mieCoefficient'].value = 0.004;
      uniforms['mieDirectionalG'].value = 0.78;
      const phi = THREE.MathUtils.degToRad(52);
      const theta = THREE.MathUtils.degToRad(128);
      _sunVec.setFromSphericalCoords(1, phi, theta);
      uniforms['sunPosition'].value.copy(_sunVec);

      this.sky.visible = true;
      this.starField.visible = false;
      this.scene.background = new THREE.Color('#b9d6f2');
      this.scene.fog = new THREE.Fog('#cfe1f2', 180, 760);
      this.hemiLight.color.set('#b4d7ff');
      this.hemiLight.groundColor.set('#5c694a');
      this.hemiLight.intensity = 0.85;
      this.sunLight.color.set('#fff6e5');
      this.sunLight.intensity = 1.85;
      this.sunOffset.copy(_sunVec).multiplyScalar(120);
      this.scene.environmentIntensity = 1.0;
      this.renderer.toneMappingExposure = 0.98;
      this.trackVisuals?.setNightIllumination(0);
    }

    this.sunLight.position.set(
      this.playerState.x + this.sunOffset.x,
      this.playerState.y + this.sunOffset.y,
      this.playerState.z + this.sunOffset.z,
    );
    this.sunLight.target.position.set(this.playerState.x, this.playerState.y, this.playerState.z);

    // Sync vehicle headlights & tail lights immediately
    if (this.playerRig) {
      this.syncCarRig(this.playerRig, this.playerState);
    }
    for (const ai of this.aiRacers) {
      this.syncCarRig(ai.rig, ai.physics);
    }
  }

  public setTimeOfDay(preset: TimeOfDay): void {
    this.applyTimeOfDay(preset);
    if (this.engineMode === 'showcase') {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private handleViewportResize = (): void => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.updateCamera(0.016);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h);
    this.renderer.render(this.scene, this.camera);
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('orientationchange', this.handleViewportResize);
    window.addEventListener('resize', this.handleViewportResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.resizeObserver = new ResizeObserver(this.handleViewportResize);
    this.resizeObserver.observe(this.container);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (this.engineMode === 'playing') {
      this.audio.startEngineLoop();
    }
    if (
      this.engineMode === 'playing' &&
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)
    ) {
      e.preventDefault();
    }

    if (!e.repeat) {
      if (code === 'KeyC' && this.engineMode === 'playing') {
        this.cycleCameraMode();
      } else if (
        (code === 'Escape' || code === 'KeyP') &&
        (this.engineMode === 'playing' || this.engineMode === 'paused')
      ) {
        this.callbacks.onPauseToggle();
      } else if (code === 'KeyM') {
        this.callbacks.onMuteToggle();
      } else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyE') {
        this.shiftUpPending = true;
      } else if (code === 'ControlLeft' || code === 'ControlRight' || code === 'KeyQ') {
        this.shiftDownPending = true;
      } else if (code === 'KeyR' && this.engineMode === 'playing' && this.sessionConfig) {
        this.startSession(this.sessionConfig);
      }
    }

    this.keysHeld.add(code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private handleWindowBlur = (): void => {
    this.keysHeld.clear();
    this.clearTouchInput();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.keysHeld.clear();
      this.clearTouchInput();
    }
  };

  public setTouchInput(partial: Partial<TouchControlState>): void {
    if (this.engineMode === 'playing') {
      this.audio.startEngineLoop();
    }
    this.touchState = { ...this.touchState, ...partial };
  }

  public triggerTouchShift(dir: 1 | -1): void {
    if (this.engineMode !== 'playing') return;
    this.audio.startEngineLoop();
    if (dir > 0) this.shiftUpPending = true;
    else this.shiftDownPending = true;
  }

  public clearTouchInput(): void {
    this.touchState = {
      steerLeft: false,
      steerRight: false,
      steerAnalog: null,
      throttle: false,
      brake: false,
      handbrake: false,
    };
  }

  public cycleCameraMode(): void {
    const order: CameraMode[] = ['chase', 'bumper', 'cinematic'];
    const idx = order.indexOf(this.cameraMode);
    this.cameraMode = order[(idx + 1) % order.length];
    this.audio.playUiClick(1.15);
    this.callbacks.onCameraChange(this.cameraMode);
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.callbacks.onCameraChange(mode);
  }

  private rebuildTrack(track: TrackData, licenseDef?: LicenseTestDef): void {
    if (this.trackVisuals) {
      this.scene.remove(this.trackVisuals.group);
      this.trackVisuals.dispose();
    }
    this.trackData = track;
    this.trackVisuals = buildTrackEnvironment(
      track,
      this.renderer.capabilities.getMaxAnisotropy(),
      licenseDef,
    );
    this.scene.add(this.trackVisuals.group);
    this.trackVisuals.setNightIllumination(
      this.activeTimeOfDay === 'night' ? 1.0 : this.activeTimeOfDay === 'sunset' ? 0.45 : 0,
    );
  }

  private clearAiRacers(): void {
    for (const ai of this.aiRacers) {
      this.scene.remove(ai.rig.root);
      ai.rig.dispose();
    }
    this.aiRacers = [];
  }

  private setPlayerCarMesh(carId: string, visual: CarVisualConfig): void {
    if (this.playerRig) {
      this.scene.remove(this.playerRig.root);
      this.playerRig.dispose();
    }
    const car = getCarById(carId);
    this.playerRig = buildProceduralCar(car, visual, !this.isSoftwareGl, !this.isSoftwareGl);
    this.scene.add(this.playerRig.root);
  }

  public setShowcaseCar(
    carId: string,
    visual?: CarVisualConfig,
    align?: 'center' | 'right',
    trackId?: TrackId,
    timeOfDay?: TimeOfDay,
  ): void {
    this.showcaseCarId = carId;
    if (visual) this.showcaseVisual = visual;
    if (align) this.showcaseAlign = align;
    if (trackId) this.showcaseTrackId = trackId;
    if (timeOfDay) this.activeTimeOfDay = timeOfDay;

    if (this.engineMode !== 'showcase') {
      this.enterShowcaseMode(
        carId,
        this.showcaseVisual,
        this.showcaseAlign,
        this.showcaseTrackId,
        this.activeTimeOfDay,
      );
      return;
    }

    const targetTrack = getTrackById(this.showcaseTrackId);
    if (this.trackData.id !== targetTrack.id) {
      this.rebuildTrack(targetTrack);
    }

    this.setPlayerCarMesh(carId, this.showcaseVisual);
    const sp = getSampleAtS(this.trackData, 14);
    this.playerState.x = sp.x;
    this.playerState.y = sp.y;
    this.playerState.z = sp.z;
    this.playerState.heading = Math.atan2(sp.tx, sp.tz);
    this.playerState.isBraking = false;
    this.applyTimeOfDay(this.activeTimeOfDay);
    this.syncCarRig(this.playerRig!, this.playerState);
    this.updateCamera(0.016);
    this.renderer.render(this.scene, this.camera);
  }

  public enterShowcaseMode(
    carId?: string,
    visual?: CarVisualConfig,
    align: 'center' | 'right' = 'center',
    trackId?: TrackId,
    timeOfDay?: TimeOfDay,
  ): void {
    this.engineMode = 'showcase';
    this.showcaseAlign = align;
    if (trackId) this.showcaseTrackId = trackId;
    if (timeOfDay) this.activeTimeOfDay = timeOfDay;

    this.audio.silenceLoop();
    this.clearAiRacers();
    this.resetSmokePool();
    this.resetSkidmarks();
    this.resetSparkPool();
    this.keysHeld.clear();

    const targetTrack = getTrackById(this.showcaseTrackId);
    if (this.trackData.id !== targetTrack.id) {
      this.rebuildTrack(targetTrack);
    }

    const activeId = carId ?? this.showcaseCarId;
    this.showcaseCarId = activeId;
    if (visual) this.showcaseVisual = visual;
    this.setPlayerCarMesh(activeId, this.showcaseVisual);

    const sp = getSampleAtS(this.trackData, 14);
    const spec = computeEffectiveSpecs(getCarById(activeId), DEFAULT_TUNING, this.showcaseVisual.gtWing);
    this.playerSpecs = spec;
    this.playerState = createInitialPhysicsState(sp.x, sp.y, sp.z, Math.atan2(sp.tx, sp.tz), spec);
    this.applyTimeOfDay(this.activeTimeOfDay);
    this.syncCarRig(this.playerRig!, this.playerState);

    this.camera.fov = 44 + computeAdaptiveCameraParams(this.camera.aspect).fovDelta * 0.45;
    this.camera.updateProjectionMatrix();
    this.updateCamera(0.016);
    this.renderer.render(this.scene, this.camera);
  }

  public setPaused(paused: boolean): void {
    if (paused && this.engineMode === 'playing') {
      this.engineMode = 'paused';
      this.keysHeld.clear();
      this.clearTouchInput();
      this.audio.silenceLoop();
    } else if (!paused && this.engineMode === 'paused') {
      this.engineMode = 'playing';
      this.lastTimeMs = performance.now();
    }
  }

  public startSession(config: SessionConfig): void {
    this.sessionConfig = config;
    this.keysHeld.clear();
    this.clearTouchInput();
    this.shiftUpPending = false;
    this.shiftDownPending = false;
    this.prevThrottle = 0;
    this.turboBovCooldown = 0;
    this.resetSmokePool();
    this.resetSkidmarks();
    this.resetSparkPool();
    this.clearAiRacers();

    // Load selected circuit or license course
    if (config.mode === 'license' && config.licenseId) {
      this.licenseDef = getLicenseById(config.licenseId);
      const licTrack = getLicenseTrack(config.licenseId);
      this.rebuildTrack(licTrack, this.licenseDef);
    } else {
      this.licenseDef = null;
      const circuit = getTrackById(config.trackId);
      if (this.trackData.id !== circuit.id) {
        this.rebuildTrack(circuit);
      }
    }

    const carSpec = getCarById(config.carId);
    this.playerSpecs = computeEffectiveSpecs(carSpec, config.tuning, config.visual.gtWing);
    this.setPlayerCarMesh(config.carId, config.visual);
    if (config.defaultCamera) {
      this.cameraMode = config.defaultCamera;
    }

    // Spawn cleanly on open straight facing forward
    const startS = config.mode === 'license' ? 8 : 6;
    const sp = getSampleAtS(this.trackData, startS);
    const startHeading = Math.atan2(sp.tx, sp.tz);
    const lateralSpawn = config.mode === 'race' ? 2.2 : 0;

    this.playerState = createInitialPhysicsState(
      sp.x + sp.nx * lateralSpawn,
      sp.y,
      sp.z + sp.nz * lateralSpawn,
      startHeading,
      this.playerSpecs,
    );
    this.playerHintIdx = 0;
    this.lastPlayerS = startS;
    this.playerTotalProgress = startS;
    this.currentLap = 1;
    this.bestLapTime = null;
    this.sessionElapsed = 0;
    this.lapStartTime = 0;
    this.crossedHalfway = false;
    this.stopZoneHoldSec = 0;
    this.licenseFailed = false;
    this.licenseStatusText = this.licenseDef ? this.licenseDef.subtitle : '';

    // Apply requested sky/lighting atmosphere (Day / Sunset / Night)
    this.applyTimeOfDay(config.timeOfDay);

    // Countdown (short crisp 2.1s in Race/License, instant 0.6s for Time Trial / Drift)
    this.countdownTimer = config.mode === 'time_trial' || config.mode === 'drift' ? 0.6 : 2.1;
    this.lastCountdownBeep = Math.ceil(this.countdownTimer) + 1;

    // Spawn 3 AI opponents in Race mode (uses cached 2K GLB model when only 1 car is registered)
    if (config.mode === 'race') {
      const aiPool = CARS.filter((c) => c.id !== config.carId);
      const fallbackCar = CARS[0];
      const opponentCars = [
        aiPool[0] ?? CARS[1] ?? fallbackCar,
        aiPool[1] ?? CARS[2] ?? fallbackCar,
        aiPool[2] ?? CARS[3] ?? fallbackCar,
      ];
      const aiColors = ['#e11d48', '#f59e0b', '#0f766e'];
      const aiRims = ['mesh_gt', 'deep_dish', 'aero_turbo'] as const;
      const gridOffsets = [
        { s: 18, lat: -2.2, pace: 0.94 },
        { s: 26, lat: 2.2, pace: 0.89 },
        { s: 34, lat: -2.2, pace: 0.84 },
      ];

      opponentCars.forEach((oCar, idx) => {
        const g = gridOffsets[idx];
        const oSp = getSampleAtS(this.trackData, g.s);
        const oSpecs = computeEffectiveSpecs(oCar, {
          engineStage: idx === 0 ? 1 : 0,
          weightStage: 0,
          tireStage: 1,
          chassisStage: 1,
        });
        const rig = buildProceduralCar(
          oCar,
          {
            paintHex: aiColors[idx],
            paintFinish: 'metallic',
            rimStyle: aiRims[idx],
            gtWing: idx === 0,
            rideHeightDropM: 0.03,
            glbUrl: oCar.glbUrl,
          },
          !this.isSoftwareGl,
          false,
        );
        this.scene.add(rig.root);
        const st = createInitialPhysicsState(
          oSp.x + oSp.nx * g.lat,
          oSp.y,
          oSp.z + oSp.nz * g.lat,
          Math.atan2(oSp.tx, oSp.tz),
          oSpecs,
        );
        this.syncCarRig(rig, st);
        this.aiRacers.push({
          carId: oCar.id,
          colorHex: aiColors[idx],
          rig,
          specs: oSpecs,
          physics: st,
          trackHintIdx: 4 + idx * 2,
          lap: 1,
          lastS: g.s,
          totalProgress: g.s,
          laneOffset: g.lat * 0.72,
          paceFactor: g.pace,
          finished: false,
        });
      });
    }

    this.syncCarRig(this.playerRig!, this.playerState);

    // Snap camera immediately behind car so no jarring swoop on start
    const fwdX = Math.sin(this.playerState.heading);
    const fwdZ = Math.cos(this.playerState.heading);
    this.camPos.set(
      this.playerState.x - fwdX * 6.8,
      this.playerState.y + 2.6,
      this.playerState.z - fwdZ * 6.8,
    );
    this.camLook.set(
      this.playerState.x + fwdX * 8,
      this.playerState.y + 1.1,
      this.playerState.z + fwdZ * 8,
    );
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();

    this.engineMode = 'playing';
    this.audio.startEngineLoop();
    this.lastTimeMs = performance.now();
    this.emitTelemetry(0, 0);
  }

  public getTrackData(): TrackData {
    return this.trackData;
  }

  private readPlayerInput(): ControlInput {
    let throttle =
      this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp') || this.touchState.throttle ? 1 : 0;
    let brake =
      this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') || this.touchState.brake ? 1 : 0;
    let steer = 0;

    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') || this.touchState.steerLeft) {
      steer += 1;
    }
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') || this.touchState.steerRight) {
      steer -= 1;
    }
    // Virtual wheel or Gyroscope analog input takes precedence when keyboard/buttons are idle
    if (steer === 0 && this.touchState.steerAnalog !== null) {
      steer = Math.max(-1, Math.min(1, this.touchState.steerAnalog));
    }

    let handbrake = this.keysHeld.has('Space') || this.touchState.handbrake;

    let shiftUpJustPressed = this.shiftUpPending;
    let shiftDownJustPressed = this.shiftDownPending;
    this.shiftUpPending = false;
    this.shiftDownPending = false;

    // Optional Gamepad API support
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      const pad = pads?.[0];
      if (pad) {
        const axisX = Math.abs(pad.axes[0] ?? 0) > 0.12 ? -(pad.axes[0] ?? 0) : 0;
        if (Math.abs(axisX) > Math.abs(steer)) steer = axisX;
        const r2 = pad.buttons[7]?.value ?? 0;
        const l2 = pad.buttons[6]?.value ?? 0;
        if (r2 > throttle) throttle = r2;
        if (l2 > brake) brake = l2;
        if (pad.buttons[0]?.pressed) handbrake = true;

        const rb = Boolean(pad.buttons[5]?.pressed);
        const lb = Boolean(pad.buttons[4]?.pressed);
        const camBtn = Boolean(pad.buttons[3]?.pressed);
        if (rb && !this.prevGamepadShiftUp) shiftUpJustPressed = true;
        if (lb && !this.prevGamepadShiftDown) shiftDownJustPressed = true;
        if (camBtn && !this.prevGamepadCam) this.cycleCameraMode();
        this.prevGamepadShiftUp = rb;
        this.prevGamepadShiftDown = lb;
        this.prevGamepadCam = camBtn;
      }
    }

    return {
      throttle,
      brake,
      steer,
      handbrake,
      shiftUpJustPressed,
      shiftDownJustPressed,
    };
  }

  private computeAiInput(ai: AiRacer): ControlInput {
    const proj = projectPointToTrack(this.trackData, ai.physics.x, ai.physics.z, ai.trackHintIdx);
    ai.trackHintIdx = proj.sampleIndex;

    const speedMs = Math.hypot(ai.physics.vx, ai.physics.vz);
    const lookAheadM = Math.max(11, Math.min(34, 9.5 + speedMs * 0.52));
    const targetSample = getSampleAtS(this.trackData, proj.s + lookAheadM);

    // Basic lateral avoidance if close to player
    let desiredLane = Math.max(-proj.halfWidth * 0.55, Math.min(proj.halfWidth * 0.55, ai.laneOffset));
    const dxP = this.playerState.x - ai.physics.x;
    const dzP = this.playerState.z - ai.physics.z;
    const distP = Math.hypot(dxP, dzP);
    if (distP < 11) {
      const relLat = dxP * proj.nx + dzP * proj.nz;
      const avoid = Math.min(2.8, proj.halfWidth * 0.52);
      desiredLane = relLat >= 0 ? -avoid : avoid;
    }

    const tx = targetSample.x + targetSample.nx * desiredLane;
    const tz = targetSample.z + targetSample.nz * desiredLane;
    const desiredAngle = Math.atan2(tx - ai.physics.x, tz - ai.physics.z);

    let angleDiff = desiredAngle - ai.physics.heading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const steer = Math.max(-1, Math.min(1, angleDiff * 2.25));

    // Predict upcoming corner curvature 24..54m ahead
    const far1 = getSampleAtS(this.trackData, proj.s + 24);
    const far2 = getSampleAtS(this.trackData, proj.s + 50);
    const maxCurv = Math.max(
      Math.abs(targetSample.curvature),
      Math.abs(far1.curvature),
      Math.abs(far2.curvature),
    );
    const cornerSpeedMs = maxCurv > 0.002 ? Math.sqrt((10.6 * ai.paceFactor) / maxCurv) : 64;
    const targetSpeedMs = Math.min(58 * ai.paceFactor, Math.max(15, cornerSpeedMs));

    let throttle = 0.88;
    let brake = 0;
    if (speedMs > targetSpeedMs + 3.2) {
      throttle = 0;
      brake = Math.min(1, (speedMs - targetSpeedMs) / 13);
    } else if (speedMs > targetSpeedMs) {
      throttle = 0.35;
    }

    return {
      throttle,
      brake,
      steer,
      handbrake: false,
      shiftUpJustPressed: false,
      shiftDownJustPressed: false,
    };
  }

  private resolveCarCollisions(): void {
    const minDist = 2.65;
    for (const ai of this.aiRacers) {
      const dx = this.playerState.x - ai.physics.x;
      const dz = this.playerState.z - ai.physics.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001 && d < minDist) {
        const nx = dx / d;
        const nz = dz / d;
        const overlap = (minDist - d) * 0.5;
        this.playerState.x += nx * overlap;
        this.playerState.z += nz * overlap;
        ai.physics.x -= nx * overlap;
        ai.physics.z -= nz * overlap;

        const rvx = this.playerState.vx - ai.physics.vx;
        const rvz = this.playerState.vz - ai.physics.vz;
        const approach = rvx * nx + rvz * nz;
        if (approach < 0) {
          const impulse = -approach * 0.65;
          this.playerState.vx += nx * impulse;
          this.playerState.vz += nz * impulse;
          ai.physics.vx -= nx * impulse * 0.7;
          ai.physics.vz -= nz * impulse * 0.7;
          const intensity = Math.min(1, Math.abs(approach) / 14);
          if (intensity > 0.14) {
            this.trauma = Math.min(1, this.trauma + intensity * 0.45);
            this.audio.playImpactThud(intensity);
            const midX = (this.playerState.x + ai.physics.x) * 0.5;
            const midZ = (this.playerState.z + ai.physics.z) * 0.5;
            this.emitSparks(midX, this.playerState.y + 0.6, midZ, nx, nz, intensity);
          }
        }
      }
    }
  }

  private syncCarRig(rig: ProceduralCarRig, st: VehiclePhysicsState): void {
    rig.root.position.set(st.x, st.y, st.z);
    rig.root.rotation.y = st.heading;

    // Suspension pitch & roll on body group only
    rig.bodyGroup.rotation.x = st.pitchRad;
    rig.bodyGroup.rotation.z = st.rollRad;

    // Front wheels steer around Y; all 4 wheels spin around X
    rig.wheelPivots[0].rotation.y = st.steerAngle;
    rig.wheelPivots[1].rotation.y = st.steerAngle;
    for (let i = 0; i < 4; i++) {
      rig.wheelMeshes[i].rotation.x = st.wheelSpinRad;
    }

    const isNight = this.activeTimeOfDay === 'night';
    const headlightsOn = isNight || this.activeTimeOfDay === 'sunset';
    rig.setLights(headlightsOn, st.isBraking, isNight);
  }

  private emitTireSmoke(st: VehiclePhysicsState, dt: number): void {
    if (st.tireScreech < 0.22 && st.rearSlip < 0.6) return;
    const strength = Math.max(st.tireScreech, (st.rearSlip - 0.45) * 0.9);
    this.smokeEmitAccum += dt * (9 + strength * 22);
    while (this.smokeEmitAccum >= 1) {
      this.smokeEmitAccum -= 1;
      const sinH = Math.sin(st.heading);
      const cosH = Math.cos(st.heading);
      for (const side of [-0.78, 0.78]) {
        const p = this.smokePool[this.smokeCursor];
        this.smokeCursor = (this.smokeCursor + 1) % this.smokePool.length;
        p.active = true;
        p.x = st.x - sinH * 1.32 + cosH * side;
        p.y = st.y + 0.24;
        p.z = st.z - cosH * 1.32 - sinH * side;
        p.vx = (Math.random() - 0.5) * 1.6 - st.vx * 0.05;
        p.vy = 0.75 + Math.random() * 0.85;
        p.vz = (Math.random() - 0.5) * 1.6 - st.vz * 0.05;
        p.life = 0;
        p.maxLife = 0.42 + Math.random() * 0.32;
        p.size = 0.34 + Math.min(0.45, strength * 0.38);
      }
    }
  }

  private emitSkidmarks(st: VehiclePhysicsState, input: ControlInput, dt: number): void {
    const hardBrake = input.brake > 0.65 && st.speedKmh > 32 && st.onTrack;
    const sliding = (st.tireScreech > 0.2 || st.rearSlip > 0.55 || input.handbrake) && st.speedKmh > 14;
    if (!sliding && !hardBrake) return;

    this.skidEmitAccum += dt * Math.min(34, 12 + st.speedKmh * 0.2);
    if (this.skidEmitAccum < 1) return;
    this.skidEmitAccum -= 1;

    const sinH = Math.sin(st.heading);
    const cosH = Math.cos(st.heading);
    const velAngle = st.speedKmh > 10 ? Math.atan2(st.vx, st.vz) : st.heading;
    const markLength = Math.max(0.75, Math.min(1.6, (st.speedKmh / 3.6) * 0.055));

    for (const side of [-0.78, 0.78]) {
      const idx = this.skidCursor;
      this.skidCursor = (this.skidCursor + 1) % this.skidCount;
      _skidDummy.position.set(
        st.x - sinH * 1.3 + cosH * side,
        st.y + 0.032,
        st.z - cosH * 1.3 - sinH * side,
      );
      _skidDummy.rotation.set(0, velAngle, 0);
      _skidDummy.scale.set(1, 1, markLength);
      _skidDummy.updateMatrix();
      this.skidMesh.setMatrixAt(idx, _skidDummy.matrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  private emitSparks(
    x: number,
    y: number,
    z: number,
    outNx: number,
    outNz: number,
    intensity: number,
  ): void {
    const burst = Math.min(12, Math.max(4, Math.round(4 + intensity * 10)));
    for (let b = 0; b < burst; b++) {
      const p = this.sparkPool[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.sparkPool.length;
      p.active = true;
      p.x = x + (Math.random() - 0.5) * 0.4;
      p.y = y + Math.random() * 0.3;
      p.z = z + (Math.random() - 0.5) * 0.4;
      const spread = 5 + Math.random() * 7;
      p.vx = outNx * spread + (Math.random() - 0.5) * 5 - this.playerState.vx * 0.25;
      p.vy = 2.0 + Math.random() * 4.5;
      p.vz = outNz * spread + (Math.random() - 0.5) * 5 - this.playerState.vz * 0.25;
      p.life = 0;
      p.maxLife = 0.22 + Math.random() * 0.26;
    }
  }

  private updateSmokePool(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.smokePool.length; i++) {
      const p = this.smokePool[i];
      if (!p.active) continue;
      dirty = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _smokeDummy.position.set(0, -50, 0);
        _smokeDummy.scale.set(0.001, 0.001, 0.001);
        _smokeDummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, _smokeDummy.matrix);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const frac = p.life / p.maxLife;
      const scale = p.size * (1 + frac * 2.2) * (1 - frac * 0.75);
      _smokeDummy.position.set(p.x, p.y, p.z);
      _smokeDummy.scale.set(scale, scale, scale);
      _smokeDummy.rotation.set(frac * 2, frac * 3, 0);
      _smokeDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, _smokeDummy.matrix);
    }
    if (dirty) {
      this.smokeMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateSparkPool(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.sparkPool.length; i++) {
      const p = this.sparkPool[i];
      if (!p.active) continue;
      dirty = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _sparkDummy.position.set(0, -50, 0);
        _sparkDummy.scale.set(0.001, 0.001, 0.001);
        _sparkDummy.updateMatrix();
        this.sparkMesh.setMatrixAt(i, _sparkDummy.matrix);
        continue;
      }
      p.vy -= 14.5 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(this.playerState.y + 0.08, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const frac = 1 - p.life / p.maxLife;
      _sparkDummy.position.set(p.x, p.y, p.z);
      _sparkLook.set(p.x + p.vx, p.y + p.vy, p.z + p.vz);
      _sparkDummy.lookAt(_sparkLook);
      _sparkDummy.scale.set(frac, frac, 0.6 + frac * 1.4);
      _sparkDummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _sparkDummy.matrix);
    }
    if (dirty) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private resetSmokePool(): void {
    for (let i = 0; i < this.smokePool.length; i++) {
      this.smokePool[i].active = false;
      _smokeDummy.position.set(0, -50, 0);
      _smokeDummy.scale.set(0.001, 0.001, 0.001);
      _smokeDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, _smokeDummy.matrix);
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  private resetSkidmarks(): void {
    this.skidCursor = 0;
    for (let i = 0; i < this.skidCount; i++) {
      _skidDummy.position.set(0, -50, 0);
      _skidDummy.scale.set(0.001, 0.001, 0.001);
      _skidDummy.updateMatrix();
      this.skidMesh.setMatrixAt(i, _skidDummy.matrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  private resetSparkPool(): void {
    for (let i = 0; i < this.sparkPool.length; i++) {
      this.sparkPool[i].active = false;
      _sparkDummy.position.set(0, -50, 0);
      _sparkDummy.scale.set(0.001, 0.001, 0.001);
      _sparkDummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _sparkDummy.matrix);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
  }

  private updateCamera(dt: number): void {
    const adapt = computeAdaptiveCameraParams(this.camera.aspect);

    if (this.engineMode === 'showcase') {
      this.showcaseAngle += dt * 0.22;
      const radius = adapt.showcaseRadius;
      const cx = this.playerState.x + Math.sin(this.showcaseAngle) * radius;
      const cz = this.playerState.z + Math.cos(this.showcaseAngle) * radius;
      const cy = this.playerState.y + 1.82 + Math.sin(this.showcaseAngle * 0.7) * 0.14;
      this.camera.fov = 44 + adapt.fovDelta * 0.45;
      this.camera.updateProjectionMatrix();
      this.camera.position.set(cx, cy, cz);
      const sideOffset = this.showcaseAlign === 'center' ? 0 : adapt.showcaseSideOffset;
      const vertOffset =
        this.showcaseAlign === 'center' && this.camera.aspect >= 1
          ? -0.28
          : adapt.showcaseVerticalTargetOffset;
      const rightX = Math.cos(this.showcaseAngle);
      const rightZ = -Math.sin(this.showcaseAngle);
      this.camera.lookAt(
        this.playerState.x - rightX * sideOffset,
        this.playerState.y + 0.65 + vertOffset,
        this.playerState.z - rightZ * sideOffset,
      );
      return;
    }

    const st = this.playerState;
    const sinH = Math.sin(st.heading);
    const cosH = Math.cos(st.heading);
    const speedNorm = Math.min(1, st.speedKmh / 245);
    const rpmNorm = Math.min(1, st.rpm / Math.max(1000, this.playerSpecs.redlineRpm));

    if (this.cameraMode === 'bumper') {
      // Hood Cam: mounts cleanly above the windshield cowl so hood edge & asphalt rush past
      _camTargetPos.set(st.x + sinH * 0.52, st.y + 1.24 - this.playerSpecs.rideHeightDropM * 0.4, st.z + cosH * 0.52);
      _camTargetLook.set(st.x + sinH * 30, st.y + 0.96, st.z + cosH * 30);
      this.camPos.copy(_camTargetPos);
      this.camLook.copy(_camTargetLook);
      const targetFov = 67 + adapt.fovDelta * 0.65 + speedNorm * 16;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
    } else if (this.cameraMode === 'cinematic') {
      const cDist = 12.0 + adapt.chaseDistBonus * 1.25;
      _camTargetPos.set(
        st.x - sinH * cDist + cosH * 2.1,
        st.y + 5.5 + adapt.chaseHeightBonus,
        st.z - cosH * cDist - sinH * 2.1,
      );
      _camTargetLook.set(st.x + sinH * 7.5, st.y + 1.0, st.z + cosH * 7.5);
      const damp = 1 - Math.exp(-4.5 * dt);
      this.camPos.lerp(_camTargetPos, damp);
      this.camLook.lerp(_camTargetLook, 1 - Math.exp(-7 * dt));
      const targetFov = 54 + adapt.fovDelta * 0.8 + speedNorm * 9;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
    } else {
      // Dynamic Chase Cam with speed-linked FOV expansion & lateral drift swing
      const swing = Math.max(-1.65, Math.min(1.65, st.localVx * 0.145));
      const dist = 6.2 + adapt.chaseDistBonus + speedNorm * 1.2;
      _camTargetPos.set(
        st.x - sinH * dist + cosH * swing,
        st.y + 2.32 + adapt.chaseHeightBonus + speedNorm * 0.22,
        st.z - cosH * dist - sinH * swing,
      );
      _camTargetLook.set(st.x + sinH * 9.5, st.y + 1.05, st.z + cosH * 9.5);
      const posDamp = 1 - Math.exp(-8.5 * dt);
      const lookDamp = 1 - Math.exp(-12 * dt);
      this.camPos.lerp(_camTargetPos, posDamp);
      this.camLook.lerp(_camTargetLook, lookDamp);
      const targetFov = 58 + adapt.fovDelta + speedNorm * 13;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6.5, dt);
    }

    // Subtle high-RPM engine & road vibration + decaying impact trauma shake
    let jitterX = 0;
    let jitterY = 0;
    let jitterZ = 0;

    if (rpmNorm > 0.72 && st.speedKmh > 55) {
      this.vibrationPhase += dt * (46 + rpmNorm * 32);
      const vibAmp = ((rpmNorm - 0.72) / 0.28) * Math.min(1, st.speedKmh / 180) * (this.cameraMode === 'bumper' ? 0.022 : 0.014);
      jitterX += Math.sin(this.vibrationPhase * 1.3) * vibAmp;
      jitterY += Math.cos(this.vibrationPhase * 2.1) * vibAmp;
    }

    if (this.trauma > 0.001) {
      this.trauma = Math.max(0, this.trauma - dt * 2.4);
      const shake = this.trauma * this.trauma * 0.42;
      jitterX += (Math.random() - 0.5) * shake;
      jitterY += (Math.random() - 0.5) * shake;
      jitterZ += (Math.random() - 0.5) * shake;
    }

    this.camera.position.set(
      this.camPos.x + jitterX,
      this.camPos.y + jitterY,
      this.camPos.z + jitterZ,
    );
    this.camera.lookAt(this.camLook);
    this.camera.updateProjectionMatrix();

    // Keep shadow frustum & starfield centered around player
    this.starField.position.set(st.x, 0, st.z);
    if (!this.isSoftwareGl) {
      this.sunLight.position.set(
        st.x + this.sunOffset.x,
        st.y + this.sunOffset.y,
        st.z + this.sunOffset.z,
      );
      this.sunLight.target.position.set(st.x, st.y, st.z);
    }
  }

  private evaluateProgressAndRules(projS: number, dt: number): void {
    const cfg = this.sessionConfig;
    if (!cfg) return;

    if (cfg.mode === 'license' && this.licenseDef) {
      const def = this.licenseDef;
      if (def.objectiveType === 'stop_zone' && def.stopZoneStartM && def.stopZoneEndM) {
        if (projS > def.stopZoneEndM + 1.5) {
          this.licenseFailed = true;
          this.finishSession({
            mode: 'license',
            success: false,
            title: `Licença ${def.code} — Falhou`,
            subtitle: def.title,
            totalTime: this.sessionElapsed,
            bestLapTime: null,
            medal: 'none',
            creditsEarned: 0,
            failReason: 'Você ultrapassou o limite final da zona de parada!',
            licenseId: def.id,
          });
          return;
        }
        if (projS >= def.stopZoneStartM && projS <= def.stopZoneEndM) {
          this.licenseStatusText = 'Dentro da Zona de Parada — Imobilize o carro!';
          if (this.playerState.speedKmh < 1.2) {
            this.stopZoneHoldSec += dt;
            if (this.stopZoneHoldSec >= 0.25) {
              this.finishSession({
                mode: 'license',
                success: true,
                title: `Licença ${def.code} — Concluída`,
                subtitle: def.title,
                totalTime: this.sessionElapsed,
                bestLapTime: this.sessionElapsed,
                creditsEarned: 0,
                licenseId: def.id,
              });
            }
          } else {
            this.stopZoneHoldSec = 0;
          }
        } else {
          const distLeft = Math.max(0, Math.round(def.stopZoneStartM - projS));
          this.licenseStatusText = `Zona de parada em ${distLeft} m`;
        }
      } else {
        if (
          !this.playerState.onTrack &&
          Math.abs(
            projectPointToTrack(this.trackData, this.playerState.x, this.playerState.z, this.playerHintIdx)
              .lateralOffset,
          ) > 10.5
        ) {
          this.licenseStatusText = 'Atenção: mantenha o carro na pista!';
        } else {
          const rem = Math.max(0, Math.round(def.targetDistanceM - projS));
          this.licenseStatusText = `Restam ${rem} m até o pórtico`;
        }
        if (projS >= def.targetDistanceM) {
          this.finishSession({
            mode: 'license',
            success: true,
            title: `Licença ${def.code} — Concluída`,
            subtitle: def.title,
            totalTime: this.sessionElapsed,
            bestLapTime: this.sessionElapsed,
            creditsEarned: 0,
            licenseId: def.id,
          });
        }
      }
      return;
    }

    // Closed Circuit Race / Time Trial / Drift Lap Tracking
    const len = this.trackData.totalLength;
    if (projS > len * 0.4 && projS < len * 0.65) {
      this.crossedHalfway = true;
    }

    if (this.crossedHalfway && this.lastPlayerS > len * 0.78 && projS < len * 0.22) {
      const lapTime = this.sessionElapsed - this.lapStartTime;
      if (this.bestLapTime === null || lapTime < this.bestLapTime) {
        this.bestLapTime = lapTime;
      }
      this.lapStartTime = this.sessionElapsed;
      this.crossedHalfway = false;
      this.audio.playCountdownBeep(true);

      if (cfg.mode === 'race' && this.currentLap >= cfg.totalLaps) {
        const position = this.computePlayerPosition();
        this.finishSession({
          mode: 'race',
          success: position <= 3,
          title:
            position === 1
              ? `Vitória em ${this.trackData.name}!`
              : `${position}º Lugar — Corrida Encerrada`,
          subtitle: this.trackData.name,
          totalTime: this.sessionElapsed,
          bestLapTime: this.bestLapTime,
          position,
          totalCars: this.aiRacers.length + 1,
          creditsEarned: 0,
        });
        return;
      }

      this.currentLap += 1;
    }

    this.lastPlayerS = projS;
    this.playerTotalProgress = (this.currentLap - 1) * len + projS;
  }

  private computePlayerPosition(): number {
    let pos = 1;
    for (const ai of this.aiRacers) {
      if (ai.totalProgress > this.playerTotalProgress) pos += 1;
    }
    return pos;
  }

  private finishSession(result: SessionResult): void {
    this.engineMode = 'result';
    this.keysHeld.clear();
    this.audio.silenceLoop();
    this.audio.playFanfare(result.success);
    this.callbacks.onSessionFinish(result);
  }

  private emitTelemetry(throttle: number, brake: number): void {
    const cfg = this.sessionConfig;
    const st = this.playerState;
    const dots: MinimapDot[] = this.aiRacers.map((ai) => ({
      x: ai.physics.x,
      z: ai.physics.z,
      isPlayer: false,
      color: ai.colorHex,
    }));
    dots.push({
      x: st.x,
      z: st.z,
      isPlayer: true,
      color: '#ffffff',
    });

    const proj = projectPointToTrack(this.trackData, st.x, st.z, this.playerHintIdx);
    const fwdDot = Math.sin(st.heading) * proj.tx + Math.cos(st.heading) * proj.tz;
    const wrongWay = st.speedKmh > 12 && fwdDot < -0.35 && st.gear >= 1;

    this.callbacks.onTelemetry({
      speedKmh: Math.round(st.speedKmh),
      rpm: Math.round(st.rpm),
      redlineRpm: this.playerSpecs.redlineRpm,
      gear: st.gear,
      throttle,
      brake,
      longG: Number(st.longG.toFixed(2)),
      latG: Number(st.latG.toFixed(2)),
      frontSlip: st.frontSlip,
      rearSlip: st.rearSlip,
      absActive: st.absActive,
      tcsActive: st.tcsActive,
      shiftLight: st.rpm >= this.playerSpecs.redlineRpm * 0.89,
      lap: this.currentLap,
      totalLaps: cfg?.totalLaps ?? 3,
      position: this.computePlayerPosition(),
      totalCars: this.aiRacers.length + 1,
      currentLapTime: Math.max(0, this.sessionElapsed - this.lapStartTime),
      bestLapTime: this.bestLapTime,
      totalTime: this.sessionElapsed,
      countdown: Math.ceil(this.countdownTimer),
      cameraMode: this.cameraMode,
      dots,
      licenseProgressM: proj.s,
      licenseTargetM: this.licenseDef?.targetDistanceM ?? 0,
      licenseStopStartM: this.licenseDef?.stopZoneStartM,
      licenseStopEndM: this.licenseDef?.stopZoneEndM,
      licenseStatusText: this.licenseStatusText,
      wrongWay,
    });
  }

  private tick = (): void => {
    if (this.disposed) return;

    const nowMs = performance.now();
    const rawDt = Math.max(0.001, (nowMs - this.lastTimeMs) / 1000);
    this.lastTimeMs = nowMs;
    const dt = Math.min(rawDt, 0.05);

    if (this.engineMode === 'playing' && this.sessionConfig) {
      const input = this.readPlayerInput();
      this.turboBovCooldown = Math.max(0, this.turboBovCooldown - dt);

      if (this.countdownTimer > 0) {
        this.countdownTimer = Math.max(0, this.countdownTimer - dt);
        const ceilVal = Math.ceil(this.countdownTimer);
        if (ceilVal < this.lastCountdownBeep) {
          this.lastCountdownBeep = ceilVal;
          this.audio.playCountdownBeep(ceilVal === 0);
        }
        const targetIdleRev =
          this.playerSpecs.idleRpm + input.throttle * (this.playerSpecs.redlineRpm * 0.68);
        this.playerState.rpm += (targetIdleRev - this.playerState.rpm) * (1 - Math.exp(-8 * dt));
        this.audio.updateEngine(
          this.playerState.rpm,
          this.playerSpecs.redlineRpm,
          input.throttle,
          0,
          true,
        );
      } else {
        if (this.hitstopTimer > 0) {
          this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
        } else {
          this.sessionElapsed += dt;
          const subSteps = dt > 0.022 ? 2 : 1;
          const subDt = dt / subSteps;

          for (let s = 0; s < subSteps; s++) {
            const pProj = projectPointToTrack(
              this.trackData,
              this.playerState.x,
              this.playerState.z,
              this.playerHintIdx,
            );
            this.playerHintIdx = pProj.sampleIndex;

            const stepOut = stepVehiclePhysics(
              this.playerState,
              input,
              this.playerSpecs,
              this.sessionConfig.assists,
              subDt,
              pProj,
            );

            // Turbo blow-off valve sound on upshifts when Turbo (Engine Stage >= 1) is fitted
            if (stepOut.shiftedUp && this.playerSpecs.hasTurbo && this.turboBovCooldown <= 0) {
              this.audio.playTurboBlowOff(0.85);
              this.turboBovCooldown = 0.35;
            }

            // Wall impact feedback + barrier sparks!
            if (stepOut.wallImpact > 0.06) {
              const side = stepOut.wallSideSign !== 0 ? stepOut.wallSideSign : 1;
              const cosH = Math.cos(this.playerState.heading);
              const sinH = Math.sin(this.playerState.heading);
              const contactX = this.playerState.x + cosH * side * 0.98;
              const contactZ = this.playerState.z - sinH * side * 0.98;
              this.emitSparks(
                contactX,
                this.playerState.y + 0.55,
                contactZ,
                -cosH * side,
                sinH * side,
                stepOut.wallImpact,
              );

              if (stepOut.wallImpact > 0.12) {
                this.trauma = Math.min(1, this.trauma + stepOut.wallImpact * 0.55);
                this.audio.playImpactThud(stepOut.wallImpact);
                if (stepOut.wallImpact > 0.55) {
                  this.hitstopTimer = 0.035;
                }
              }
            }

            // Step AI opponents
            for (const ai of this.aiRacers) {
              const aiInput = this.computeAiInput(ai);
              const aiProj = projectPointToTrack(
                this.trackData,
                ai.physics.x,
                ai.physics.z,
                ai.trackHintIdx,
              );
              ai.trackHintIdx = aiProj.sampleIndex;
              stepVehiclePhysics(
                ai.physics,
                aiInput,
                ai.specs,
                { tcs: true, abs: true, transmission: 'auto' },
                subDt,
                aiProj,
              );
              const len = this.trackData.totalLength;
              if (ai.lastS > len * 0.8 && aiProj.s < len * 0.2) {
                ai.lap += 1;
              }
              ai.lastS = aiProj.s;
              ai.totalProgress = (ai.lap - 1) * len + aiProj.s;
            }

            this.resolveCarCollisions();
          }

          // Lift-off turbo flutter when releasing throttle at high RPM
          const rpmNorm = this.playerState.rpm / Math.max(1000, this.playerSpecs.redlineRpm);
          if (
            this.playerSpecs.hasTurbo &&
            this.prevThrottle > 0.7 &&
            input.throttle < 0.12 &&
            rpmNorm > 0.62 &&
            this.turboBovCooldown <= 0
          ) {
            this.audio.playTurboBlowOff(0.75 * rpmNorm);
            this.turboBovCooldown = 0.48;
          }
          this.prevThrottle = input.throttle;

          if (this.playerRig) {
            this.syncCarRig(this.playerRig, this.playerState);
          }
          for (const ai of this.aiRacers) {
            this.syncCarRig(ai.rig, ai.physics);
          }

          this.emitTireSmoke(this.playerState, dt);
          this.emitSkidmarks(this.playerState, input, dt);
          this.updateSmokePool(dt);
          this.updateSparkPool(dt);
          this.audio.updateEngine(
            this.playerState.rpm,
            this.playerSpecs.redlineRpm,
            input.throttle,
            this.playerState.tireScreech,
            true,
          );

          const finalProj = projectPointToTrack(
            this.trackData,
            this.playerState.x,
            this.playerState.z,
            this.playerHintIdx,
          );
          this.evaluateProgressAndRules(finalProj.s, dt);
        }
      }

      this.telemetryAccum += dt;
      if (this.telemetryAccum >= 0.065) {
        this.telemetryAccum = 0;
        this.emitTelemetry(input.throttle, input.brake);
      }
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  };

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(this.tick, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('orientationchange', this.handleViewportResize);
    window.removeEventListener('resize', this.handleViewportResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.resizeObserver?.disconnect();

    this.audio.dispose();
    this.clearAiRacers();
    this.playerRig?.dispose();
    this.trackVisuals?.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.starField.geometry.dispose();
    (this.starField.material as THREE.Material).dispose();
    this.smokeMesh.geometry.dispose();
    (this.smokeMesh.material as THREE.Material).dispose();
    this.skidMesh.geometry.dispose();
    (this.skidMesh.material as THREE.Material).dispose();
    this.sparkMesh.geometry.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
    this.envTexture.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
