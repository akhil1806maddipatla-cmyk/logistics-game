/**
 * Authoritative Three.js World Renderer & Camera Controller (Master Prompts 1 through 5).
 *
 * Strictly separates logical world data (WorldManager) from visual representation.
 * Implements:
 * - Software-WebGL guard (`isSoftwareGl`) and `afterDraw(tick)` pacing for headless/CPU verification.
 * - Studio PBR lighting (`RoomEnvironment` + warm sun DirectionalLight + cool HemisphereLight + FogExp2).
 * - Calm, deep blue water without shiny white spots or z-fighting.
 * - Uniform dark charcoal asphalt across all inland roads, central roundabout, bridges, and the 10-lane highway.
 * - Accurate white road markings (center divider, outer edges, dashed lane separators) and complete demolition cleanup.
 * - Dedicated 15-block Railway Yard, starter track, 8-part composite depot, freight platform, fencing, and crossing gates.
 * - Width-matched Road Bridges (1x1, 2x2, 3x3), Railway Bridges, and Starter Coastal Port & Harbour.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BridgeRecord } from './BridgeAndPortSystem';
import {
  FacadeMaterialStyle,
  getBuildingSpecById,
  getLiveryById,
  getVehicleSpecById,
  TrailerBodyStyle,
} from './Catalogues';
import {
  clampCameraPanningBounds,
  COASTAL_PALETTE_STANDARDS,
  computeLodTierForDistance,
  getGraphicsQualitySpec,
  getWaterQualityConfig,
  GraphicsQualityPreset,
  GraphicsQualitySpec,
  LodDistanceTier,
  parseGraphicsQualityPreset,
  PBR_SURFACE_STANDARDS,
} from './GraphicsQualitySystem';
import { GridCoord } from './GridSystem';
import {
  RAIL_ELEVATION_LAYERS,
  RAILWAY_YARD_RESERVED_FOOTPRINT,
  RailwayCrossingRecord,
  RailwayTrackRecord,
} from './RailwaySystem';
import { RoadSegmentRecord } from './RoadSystem';
import {
  ROAD_SPECS,
  RoadWidthConfig,
  TerrainCategory,
  WaterClassification,
  ZoneCategory,
} from './WorldConfig';
import { ForestDensityLevel } from './TerrainWaterSystem';
import { WorldManager } from './WorldManager';

export interface DebugOverlaySettings {
  showGrid: boolean;
  showZones: boolean;
  showParcels: boolean;
}

export interface ConstructionPreviewSpec {
  active: boolean;
  valid: boolean;
  cells: GridCoord[];
  elevated?: boolean;
  buildingCatalogueId?: string;
  orientation?: 0 | 90 | 180 | 270;
}

interface DynamicVehicleVisualRig {
  root: THREE.Group;
  tractorGroup: THREE.Group;
  trailerGroup?: THREE.Group;
  wheels: THREE.Object3D[];
  brakeLightMesh?: THREE.Mesh;
  contactShadowMesh?: THREE.Mesh;
  fineDetailGroup?: THREE.Group;
}

interface ForkliftVisualRig {
  root: THREE.Group;
  forkCarriageGroup: THREE.Group;
  cargoGroup: THREE.Group;
  cargoCrateMesh: THREE.Mesh;
  wheels: THREE.Object3D[];
}

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _tempVec3 = new THREE.Vector3();
const _tempVec3B = new THREE.Vector3();
const _forwardVec = new THREE.Vector3();
const _rightVec = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();
const _tempColor = new THREE.Color();
const _rayPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);

export class WorldRenderer {
  public readonly isSoftwareGl: boolean;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;

  private container: HTMLElement;
  private world: WorldManager;

  // Graphics Quality Preset & Lights
  private graphicsQuality: GraphicsQualityPreset = 'HIGH';
  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;
  private contactShadowMeshes: THREE.Object3D[] = [];
  private fineDetailMeshes: THREE.Object3D[] = [];
  private understoryBushMeshes: THREE.Object3D[] = [];
  private waterNormalTex!: THREE.CanvasTexture;
  private oceanHorizonMat!: THREE.MeshStandardMaterial;
  private waterWaveTime = 0;
  private terrainChunkVisuals: Array<{
    id: string;
    centerWx: number;
    centerWz: number;
    mesh: THREE.Mesh;
    lodTier: LodDistanceTier;
  }> = [];

  // Scene hierarchy groups
  private terrainGroup = new THREE.Group();
  private waterGroup = new THREE.Group();
  private propsGroup = new THREE.Group();
  private roadsGroup = new THREE.Group();
  private railwayGroup = new THREE.Group();
  private bridgesGroup = new THREE.Group();
  private portGroup = new THREE.Group();
  private airportGroup = new THREE.Group();
  private buildingsGroup = new THREE.Group();
  private vehiclesGroup = new THREE.Group();
  private debugGroup = new THREE.Group();
  private previewGroup = new THREE.Group();

  // Map from road/bridge/vehicle/forklift ID to its visual Group
  private roadMeshMap: Map<string, THREE.Group> = new Map();
  private bridgeMeshMap: Map<string, THREE.Group> = new Map();
  private vehicleRigsMap: Map<string, DynamicVehicleVisualRig> = new Map();
  private forkliftRigsMap: Map<string, ForkliftVisualRig> = new Map();
  private gseRigsMap: Map<string, THREE.Group> = new Map();
  private yardTruckRigsMap: Map<string, THREE.Group> = new Map();
  private warehouseDoorShuttersMap: Map<string, THREE.Mesh> = new Map();
  private atcBeaconMesh: THREE.Mesh | null = null;
  private obstructionBeaconMeshes: THREE.Mesh[] = [];
  private airfieldLightMaterials: Array<{
    mat: THREE.MeshBasicMaterial;
    baseHex: number;
    dimHex: number;
  }> = [];
  private apronFloodPoolMeshes: THREE.Mesh[] = [];
  private yardDockPalletMeshes: THREE.Mesh[] = [];
  private atcRadarMesh: THREE.Object3D | null = null;
  private radomeMesh: THREE.Object3D | null = null;
  private windsockPivot: THREE.Object3D | null = null;
  private airportAnimTime = 0;
  private lockBadgeTexture: THREE.CanvasTexture | null = null;
  private lockBadgeSprites: Array<{
    id: 'AIRPORT_MAIN' | 'HANGAR_1' | 'HANGAR_2' | 'AIRPORT_EXPANSION';
    sprite: THREE.Object3D;
    baseWorldX: number;
    baseWorldY: number;
    baseWorldZ: number;
    phaseOffset: number;
    label: string;
    subLabel: string;
    cost: number;
  }> = [];

  // Shared reusable PBR materials & procedural facade textures
  private facadeTextures!: Record<FacadeMaterialStyle, THREE.CanvasTexture>;
  private materials!: {
    asphalt: THREE.MeshStandardMaterial;
    runwayAsphalt: THREE.MeshStandardMaterial;
    apronConcreteSlab: THREE.MeshStandardMaterial;
    whiteLine: THREE.MeshStandardMaterial;
    yellowLine: THREE.MeshStandardMaterial;
    concrete: THREE.MeshStandardMaterial;
    curbstone: THREE.MeshStandardMaterial;
    ballast: THREE.MeshStandardMaterial;
    steelRail: THREE.MeshStandardMaterial;
    timberSleeper: THREE.MeshStandardMaterial;
    water: THREE.MeshStandardMaterial;
    depotBrick: THREE.MeshStandardMaterial;
    depotRoof: THREE.MeshStandardMaterial;
    industrialWall: THREE.MeshStandardMaterial;
    cityGlass: THREE.MeshStandardMaterial;
    cityTowerBody: THREE.MeshStandardMaterial;
    accentSteel: THREE.MeshStandardMaterial;
    brushedAluminiumUld: THREE.MeshStandardMaterial;
    safetyYellow: THREE.MeshStandardMaterial;
    cargoYellowCorrugated: THREE.MeshStandardMaterial;
    cargoGreenOperations: THREE.MeshStandardMaterial;
    cargoSignageFascia: THREE.MeshStandardMaterial;
    runwayNum09: THREE.MeshBasicMaterial;
    runwayNum27: THREE.MeshBasicMaterial;
    aircraftFuselageCargo: THREE.MeshStandardMaterial;
    aircraftTailFinEmblem: THREE.MeshStandardMaterial;
    aircraftLiveryBlue: THREE.MeshStandardMaterial;
    contactShadow: THREE.MeshBasicMaterial;
    gateRed: THREE.MeshStandardMaterial;
    craneTeal: THREE.MeshStandardMaterial;
    tyreRubber: THREE.MeshStandardMaterial;
    wheelHubSteel: THREE.MeshStandardMaterial;
    headlightEmissive: THREE.MeshStandardMaterial;
    brakeLightEmissive: THREE.MeshStandardMaterial;
    previewValid: THREE.MeshBasicMaterial;
    previewInvalid: THREE.MeshBasicMaterial;
  };

  // Isometric Damped Camera Rig
  private cameraTarget = new THREE.Vector3(12, 1.2, -10);
  private desiredTarget = new THREE.Vector3(12, 1.2, -10);
  private sphericalRadius = 128;
  private desiredRadius = 128;
  private azimuthAngle = Math.PI * 0.22;
  private desiredAzimuth = Math.PI * 0.22;
  private polarAngle = Math.PI * 0.31;
  private desiredPolar = Math.PI * 0.31;

  private isTitleTourActive = true;
  private tourTime = 0;
  private cameraShakeTrauma = 0;

  // Input state
  private keysHeld: Set<string> = new Set();
  private isDraggingPan = false;
  private isDraggingRotate = false;
  private dragStartClient = { x: 0, y: 0 };
  private pointerDownClient = { x: 0, y: 0 };
  private pointerMovedDist = 0;
  private mouseNdc = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private lastHoverRaycastTime = 0;

  private debugSettings: DebugOverlaySettings = {
    showGrid: false,
    showZones: false,
    showParcels: false,
  };

  // Lifecycle & Loop
  private frameId = 0;
  private isDisposed = false;
  private lastFrameTime = performance.now();
  private resizeObserver: ResizeObserver | null = null;

  // Callbacks to UI
  private onCellHover?: (coord: GridCoord | null) => void;
  private onCellClick?: (coord: GridCoord, button: number) => void;
  private onLockBadgeClick?: (
    badgeId: 'AIRPORT_MAIN' | 'HANGAR_1' | 'HANGAR_2' | 'AIRPORT_EXPANSION'
  ) => void;
  private onLockBadgesProjectionUpdate?: (
    badges: Array<{
      id: 'AIRPORT_MAIN' | 'HANGAR_1' | 'HANGAR_2' | 'AIRPORT_EXPANSION';
      label: string;
      subLabel: string;
      cost: number;
      screenX: number;
      screenY: number;
      visible: boolean;
    }>
  ) => void;

  constructor(
    container: HTMLElement,
    world: WorldManager,
    callbacks?: {
      onCellHover?: (coord: GridCoord | null) => void;
      onCellClick?: (coord: GridCoord, button: number) => void;
      onLockBadgeClick?: (
        badgeId: 'AIRPORT_MAIN' | 'HANGAR_1' | 'HANGAR_2' | 'AIRPORT_EXPANSION'
      ) => void;
      onLockBadgesProjectionUpdate?: (
        badges: Array<{
          id: 'AIRPORT_MAIN' | 'HANGAR_1' | 'HANGAR_2' | 'AIRPORT_EXPANSION';
          label: string;
          subLabel: string;
          cost: number;
          screenX: number;
          screenY: number;
          visible: boolean;
        }>
      ) => void;
      initialGraphicsQuality?: GraphicsQualityPreset;
    }
  ) {
    this.container = container;
    this.world = world;
    this.onCellHover = callbacks?.onCellHover;
    this.onCellClick = callbacks?.onCellClick;
    this.onLockBadgeClick = callbacks?.onLockBadgeClick;
    this.onLockBadgesProjectionUpdate = callbacks?.onLockBadgesProjectionUpdate;

    if (callbacks?.initialGraphicsQuality) {
      this.graphicsQuality = callbacks.initialGraphicsQuality;
    } else if (typeof window !== 'undefined') {
      const qParam = new URLSearchParams(window.location.search).get('graphics');
      if (qParam) {
        this.graphicsQuality = parseGraphicsQualityPreset(qParam);
      }
    }

    // 1. Detect software WebGL (SwiftShader / llvmpipe / Basic Render)
    this.isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const qSpec = getGraphicsQualitySpec(this.graphicsQuality);

    // 2. Initialize WebGLRenderer with ACESFilmicToneMapping and SRGBColorSpace
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = qSpec.toneMappingExposure;
    this.renderer.setPixelRatio(
      this.isSoftwareGl
        ? 1
        : Math.min(window.devicePixelRatio || 1, qSpec.maxPixelRatio)
    );
    this.renderer.shadowMap.enabled = qSpec.shadowMapEnabled;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const width = Math.max(container.clientWidth || window.innerWidth, 320);
    const height = Math.max(container.clientHeight || window.innerHeight, 240);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.dataset.testid = 'world-webgl-canvas';
    container.appendChild(this.renderer.domElement);

    // 3. Scene, Atmosphere & Studio Environment Map (Horizon-blended coastal haze)
    this.scene = new THREE.Scene();
    const horizonColor = new THREE.Color(0xc4ddf2);
    this.scene.background = horizonColor;
    this.scene.fog = new THREE.FogExp2(0xc4ddf2, 0.00056);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    this.scene.environmentIntensity = qSpec.envMapIntensity;
    pmremGenerator.dispose();

    // 4. Camera initialization (extended far plane for infinite ocean horizon & 720m x 480m world)
    this.camera = new THREE.PerspectiveCamera(38, width / height, 1.5, 4200);
    this.updateCameraTransformImmediate();

    // 5. Studio 3-Point Lighting Rig
    this.setupLighting(qSpec);

    // 6. Initialize Shared Materials
    this.initSharedMaterials(qSpec);

    // 7. Attach Scene Groups
    this.scene.add(
      this.terrainGroup,
      this.waterGroup,
      this.propsGroup,
      this.roadsGroup,
      this.railwayGroup,
      this.bridgesGroup,
      this.portGroup,
      this.airportGroup,
      this.buildingsGroup,
      this.vehiclesGroup,
      this.debugGroup,
      this.previewGroup
    );

    // 8. Build Complete Initial World Visuals from Authoritative WorldManager
    this.rebuildAllWorldVisuals();

    // Pre-warm shaders on hardware GPUs
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 9. Bind Events & Start Frame Loop
    this.bindEvents();
    this.lastFrameTime = performance.now();
    this.tick();
  }

  public getGraphicsQuality(): GraphicsQualityPreset {
    return this.graphicsQuality;
  }

  public getGraphicsQualitySpec(): GraphicsQualitySpec {
    return getGraphicsQualitySpec(this.graphicsQuality);
  }

  public setGraphicsQuality(preset: GraphicsQualityPreset): GraphicsQualitySpec {
    this.graphicsQuality = preset;
    const spec = getGraphicsQualitySpec(preset);

    this.renderer.toneMappingExposure = spec.toneMappingExposure;
    this.renderer.setPixelRatio(
      this.isSoftwareGl
        ? 1
        : Math.min(window.devicePixelRatio || 1, spec.maxPixelRatio)
    );
    this.scene.environmentIntensity = spec.envMapIntensity;

    if (this.sunLight) {
      this.renderer.shadowMap.enabled = spec.shadowMapEnabled;
      this.sunLight.castShadow = spec.shadowMapEnabled;
      const targetMapSize = this.isSoftwareGl
        ? Math.min(spec.shadowMapSize, 1024)
        : spec.shadowMapSize;
      if (
        this.sunLight.shadow.mapSize.width !== targetMapSize ||
        this.sunLight.shadow.mapSize.height !== targetMapSize
      ) {
        this.sunLight.shadow.mapSize.set(targetMapSize, targetMapSize);
        this.sunLight.shadow.map?.dispose();
        this.sunLight.shadow.map = null;
      }
      this.sunLight.shadow.bias = spec.shadowBias;
      this.sunLight.shadow.normalBias = spec.shadowNormalBias;
      this.sunLight.shadow.radius = spec.shadowRadius;
    }

    for (const csMesh of this.contactShadowMeshes) {
      csMesh.visible = spec.enableContactShadows;
    }
    for (const fdMesh of this.fineDetailMeshes) {
      fdMesh.visible = spec.enableRoofDetails;
    }
    for (const ubMesh of this.understoryBushMeshes) {
      ubMesh.visible = preset !== 'LOW';
    }
    const wCfg = getWaterQualityConfig(preset);
    if (this.materials?.water) {
      this.materials.water.bumpScale = wCfg.normalScale;
    }
    if (this.oceanHorizonMat) {
      this.oceanHorizonMat.bumpScale = wCfg.normalScale * 0.85;
    }
    return spec;
  }

  public getRenderStats(): {
    preset: GraphicsQualityPreset;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    totalChunks: number;
    nearChunks: number;
    midChunks: number;
    farChunks: number;
  } {
    let nearChunks = 0;
    let midChunks = 0;
    let farChunks = 0;
    for (const ch of this.terrainChunkVisuals) {
      if (ch.lodTier === 'NEAR') nearChunks++;
      else if (ch.lodTier === 'MID') midChunks++;
      else farChunks++;
    }
    return {
      preset: this.graphicsQuality,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      totalChunks: this.terrainChunkVisuals.length,
      nearChunks,
      midChunks,
      farChunks,
    };
  }

  private setupLighting(qSpec: GraphicsQualitySpec): void {
    // Cool sky / warm ground hemisphere fill
    this.hemiLight = new THREE.HemisphereLight(0xd2e6ff, 0x3b4d34, 0.56);
    this.hemiLight.position.set(0, 140, 0);
    this.scene.add(this.hemiLight);

    // Warm directional sun key light with shadow frustum covering the entire playable world & airport
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.35);
    this.sunLight.position.set(155, 185, 115);
    this.sunLight.target.position.set(35, 0, -15);
    this.scene.add(this.sunLight.target);
    this.sunLight.castShadow = qSpec.shadowMapEnabled;
    const mapSize = this.isSoftwareGl
      ? Math.min(qSpec.shadowMapSize, 1024)
      : qSpec.shadowMapSize;
    this.sunLight.shadow.mapSize.width = mapSize;
    this.sunLight.shadow.mapSize.height = mapSize;
    const d = 230;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 480;
    this.sunLight.shadow.bias = qSpec.shadowBias;
    this.sunLight.shadow.normalBias = qSpec.shadowNormalBias;
    this.sunLight.shadow.radius = qSpec.shadowRadius;
    this.scene.add(this.sunLight);

    // Subtle cool rim/backlight to carve structures and aircraft out of terrain
    this.rimLight = new THREE.DirectionalLight(0x9bc4ff, 0.34);
    this.rimLight.position.set(-130, 95, -115);
    this.scene.add(this.rimLight);
  }

  private initSharedMaterials(qSpec: GraphicsQualitySpec): void {
    const hwAniso = Math.min(
      this.renderer.capabilities.getMaxAnisotropy(),
      qSpec.maxAnisotropy
    );

    // 1. Procedural micro-grain bump texture for asphalt & concrete (NoColorSpace for non-color data)
    const grainCanvas = document.createElement('canvas');
    grainCanvas.width = 128;
    grainCanvas.height = 128;
    const gCtx = grainCanvas.getContext('2d');
    if (gCtx) {
      gCtx.fillStyle = '#808080';
      gCtx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 1400; i++) {
        const v = 104 + ((i * 29) % 48);
        gCtx.fillStyle = `rgb(${v},${v},${v})`;
        gCtx.fillRect((i * 19) % 128, (i * 37) % 128, 2, 2);
      }
    }
    const grainTex = new THREE.CanvasTexture(grainCanvas);
    grainTex.colorSpace = THREE.NoColorSpace;
    grainTex.wrapS = THREE.RepeatWrapping;
    grainTex.wrapT = THREE.RepeatWrapping;
    grainTex.repeat.set(12, 12);
    grainTex.anisotropy = hwAniso;

    // 2. Warm Sun-Baked Sand/Taupe-Grey Industrial Concrete Apron Texture (ZERO square construction grid!)
    const apronCanvas = document.createElement('canvas');
    apronCanvas.width = 256;
    apronCanvas.height = 256;
    const aCtx = apronCanvas.getContext('2d');
    if (aCtx) {
      // Warm sun-baked sand/taupe-grey concrete base matching the coastal airport reference
      aCtx.fillStyle = '#c4bdb0';
      aCtx.fillRect(0, 0, 256, 256);
      // Organic concrete surface variation & subtle warm stone aggregate speckle
      for (let i = 0; i < 2400; i++) {
        const x = (i * 73) % 256;
        const y = (i * 151) % 256;
        aCtx.fillStyle =
          i % 3 === 0
            ? 'rgba(236, 231, 222, 0.14)'
            : i % 2 === 0
              ? 'rgba(142, 134, 122, 0.13)'
              : 'rgba(98, 92, 82, 0.08)';
        aCtx.fillRect(x, y, 2, 2);
      }
      // Subtle weathered tire/oil smudge patches on the apron
      for (let p = 0; p < 10; p++) {
        const px = ((p * 67) % 200) + 28;
        const py = ((p * 113) % 200) + 28;
        const grad = aCtx.createRadialGradient(px, py, 3, px, py, 24);
        grad.addColorStop(0, 'rgba(72, 68, 60, 0.065)');
        grad.addColorStop(1, 'rgba(72, 68, 60, 0)');
        aCtx.fillStyle = grad;
        aCtx.beginPath();
        aCtx.arc(px, py, 24, 0, Math.PI * 2);
        aCtx.fill();
      }
      // Faint hairline expansion seams (no dark square construction grid!)
      aCtx.strokeStyle = 'rgba(88, 82, 72, 0.075)';
      aCtx.lineWidth = 0.7;
      for (let p = 0; p <= 256; p += 128) {
        aCtx.beginPath();
        aCtx.moveTo(p, 0);
        aCtx.lineTo(p, 256);
        aCtx.stroke();
        aCtx.beginPath();
        aCtx.moveTo(0, p);
        aCtx.lineTo(256, p);
        aCtx.stroke();
      }
    }
    const apronSlabTex = new THREE.CanvasTexture(apronCanvas);
    apronSlabTex.colorSpace = THREE.SRGBColorSpace;
    apronSlabTex.wrapS = THREE.RepeatWrapping;
    apronSlabTex.wrapT = THREE.RepeatWrapping;
    apronSlabTex.repeat.set(7, 4);
    apronSlabTex.anisotropy = hwAniso;

    // 3. Industrial Yellow Corrugated Cladding Texture (for Cargo Terminal & Warehouse)
    const yellowCorrCanvas = document.createElement('canvas');
    yellowCorrCanvas.width = 256;
    yellowCorrCanvas.height = 128;
    const ycCtx = yellowCorrCanvas.getContext('2d');
    if (ycCtx) {
      ycCtx.fillStyle = '#e59e12';
      ycCtx.fillRect(0, 0, 256, 128);
      for (let x = 0; x < 256; x += 8) {
        ycCtx.fillStyle = 'rgba(255, 228, 130, 0.34)';
        ycCtx.fillRect(x, 0, 3, 128);
        ycCtx.fillStyle = 'rgba(120, 74, 6, 0.32)';
        ycCtx.fillRect(x + 4, 0, 2, 128);
      }
      // Subtle horizontal structural panel seam
      ycCtx.fillStyle = 'rgba(95, 58, 4, 0.42)';
      ycCtx.fillRect(0, 62, 256, 2.5);
    }
    const yellowCorrTex = new THREE.CanvasTexture(yellowCorrCanvas);
    yellowCorrTex.colorSpace = THREE.SRGBColorSpace;
    yellowCorrTex.wrapS = THREE.RepeatWrapping;
    yellowCorrTex.wrapT = THREE.RepeatWrapping;
    yellowCorrTex.repeat.set(4, 1);
    yellowCorrTex.anisotropy = hwAniso;

    // 4. Bold "CARGO" Fascia Signage Texture matching the Airport Cargo Terminal reference image
    const cargoSignCanvas = document.createElement('canvas');
    cargoSignCanvas.width = 512;
    cargoSignCanvas.height = 128;
    const csCtx = cargoSignCanvas.getContext('2d');
    if (csCtx) {
      csCtx.fillStyle = '#1e293b';
      csCtx.fillRect(0, 0, 512, 128);
      csCtx.strokeStyle = '#64748b';
      csCtx.lineWidth = 5;
      csCtx.strokeRect(4, 4, 504, 120);
      csCtx.fillStyle = '#f8fafc';
      csCtx.font = '900 84px "Arial Black", Impact, sans-serif';
      csCtx.textAlign = 'center';
      csCtx.textBaseline = 'middle';
      csCtx.fillText('CARGO', 256, 66);
    }
    const cargoSignTex = new THREE.CanvasTexture(cargoSignCanvas);
    cargoSignTex.colorSpace = THREE.SRGBColorSpace;
    cargoSignTex.anisotropy = hwAniso;

    // 5. Runway Threshold Designation Numerals ("09" & "27") matching Panel 2 ("2. Runway View")
    const createRunwayNumberTexture = (numStr: string): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const g = c.getContext('2d');
      if (g) {
        g.clearRect(0, 0, 256, 256);
        g.fillStyle = '#f8fafc';
        g.font = '900 148px "Arial Black", Impact, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(numStr, 128, 134);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = hwAniso;
      return t;
    };

    // 6. Aircraft Fuselage "CARGO" Livery & Blue Tail Fin Emblem Textures (matching "Aircraft – 360° Views")
    const acFuseCanvas = document.createElement('canvas');
    acFuseCanvas.width = 512;
    acFuseCanvas.height = 256;
    const afCtx = acFuseCanvas.getContext('2d');
    if (afCtx) {
      afCtx.fillStyle = '#f8fafc';
      afCtx.fillRect(0, 0, 512, 256);
      // Blue belly accent band along lower fuselage
      afCtx.fillStyle = '#1559b8';
      afCtx.fillRect(0, 198, 512, 58);
      afCtx.fillStyle = '#38bdf8';
      afCtx.fillRect(0, 192, 512, 6);
      // Bold "CARGO" fuselage title & window/panel line
      afCtx.fillStyle = '#1559b8';
      afCtx.font = '900 44px "Arial Black", sans-serif';
      afCtx.textAlign = 'center';
      afCtx.fillText('CARGO', 160, 122);
      afCtx.fillText('CARGO', 380, 122);
      // Technical upper deck window dots & main deck cargo door outline
      afCtx.fillStyle = '#334155';
      for (let wx = 40; wx < 480; wx += 18) {
        afCtx.fillRect(wx, 136, 7, 9);
      }
      afCtx.strokeStyle = '#64748b';
      afCtx.lineWidth = 3;
      afCtx.strokeRect(86, 78, 58, 86);
    }
    const acFuseTex = new THREE.CanvasTexture(acFuseCanvas);
    acFuseTex.colorSpace = THREE.SRGBColorSpace;
    acFuseTex.anisotropy = hwAniso;

    const acTailCanvas = document.createElement('canvas');
    acTailCanvas.width = 256;
    acTailCanvas.height = 256;
    const atCtx = acTailCanvas.getContext('2d');
    if (atCtx) {
      atCtx.fillStyle = '#1559b8';
      atCtx.fillRect(0, 0, 256, 256);
      // Stylized white dynamic eagle/wing emblem matching the blue tail fin in reference sheet
      atCtx.fillStyle = '#ffffff';
      atCtx.beginPath();
      atCtx.moveTo(64, 175);
      atCtx.quadraticCurveTo(118, 128, 196, 62);
      atCtx.quadraticCurveTo(156, 148, 135, 190);
      atCtx.closePath();
      atCtx.fill();

      atCtx.beginPath();
      atCtx.moveTo(78, 195);
      atCtx.quadraticCurveTo(132, 165, 204, 118);
      atCtx.quadraticCurveTo(162, 188, 112, 206);
      atCtx.closePath();
      atCtx.fill();
    }
    const acTailTex = new THREE.CanvasTexture(acTailCanvas);
    acTailTex.colorSpace = THREE.SRGBColorSpace;
    acTailTex.anisotropy = hwAniso;

    // 7. Soft Radial Ground Contact Shadow Texture (grounds aircraft, trucks, GSE & buildings)
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 60);
      grad.addColorStop(0, 'rgba(12, 16, 24, 0.52)');
      grad.addColorStop(0.55, 'rgba(12, 16, 24, 0.26)');
      grad.addColorStop(1, 'rgba(12, 16, 24, 0.0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 128);
    }
    const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);
    contactShadowTex.colorSpace = THREE.SRGBColorSpace;

    // Uniform dark charcoal asphalt used across ALL inland roads, roundabout, bridges, and highway
    const asphalt = new THREE.MeshStandardMaterial({
      color: 0x262b34,
      roughness: PBR_SURFACE_STANDARDS.ROAD_ASPHALT_WEATHERED.roughness,
      metalness: PBR_SURFACE_STANDARDS.ROAD_ASPHALT_WEATHERED.metalness,
      bumpMap: grainTex,
      bumpScale: 0.025,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const runwayAsphalt = new THREE.MeshStandardMaterial({
      color: 0x1e2229,
      roughness: 0.74,
      metalness: PBR_SURFACE_STANDARDS.RUNWAY_ASPHALT_DARK.metalness,
      bumpMap: grainTex,
      bumpScale: 0.035,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const apronConcreteSlab = new THREE.MeshStandardMaterial({
      map: apronSlabTex,
      color: 0xd6cfc2,
      roughness: 0.88,
      metalness: 0.04,
      bumpMap: grainTex,
      bumpScale: 0.015,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const whiteLine = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    const yellowLine = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.35,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    const concrete = new THREE.MeshStandardMaterial({
      color: 0x9ca6b5,
      roughness: 0.78,
      metalness: 0.06,
      bumpMap: grainTex,
      bumpScale: 0.015,
    });

    const curbstone = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.72,
      metalness: 0.08,
    });

    const ballast = new THREE.MeshStandardMaterial({
      color: 0x57534e,
      roughness: 0.92,
      metalness: 0.05,
      bumpMap: grainTex,
      bumpScale: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const steelRail = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.26,
      metalness: 0.84,
    });

    const timberSleeper = new THREE.MeshStandardMaterial({
      color: 0x452c1e,
      roughness: 0.88,
      metalness: 0.04,
    });

    // Procedural tileable water wave ripple bump texture (scales with GFX quality preset)
    const waterWaveCanvas = document.createElement('canvas');
    waterWaveCanvas.width = 128;
    waterWaveCanvas.height = 128;
    const wwCtx = waterWaveCanvas.getContext('2d');
    if (wwCtx) {
      const imgData = wwCtx.createImageData(128, 128);
      const data = imgData.data;
      for (let py = 0; py < 128; py++) {
        for (let px = 0; px < 128; px++) {
          const u = (px / 128) * Math.PI * 2;
          const v = (py / 128) * Math.PI * 2;
          const w1 = Math.sin(u * 3 + v * 2) * 0.45;
          const w2 = Math.cos(u * 5 - v * 4 + 1.3) * 0.35;
          const w3 = Math.sin((u + v) * 7) * 0.2;
          const val = Math.round(128 + (w1 + w2 + w3) * 115);
          const idx = (py * 128 + px) * 4;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          data[idx + 3] = 255;
        }
      }
      wwCtx.putImageData(imgData, 0, 0);
    }
    this.waterNormalTex = new THREE.CanvasTexture(waterWaveCanvas);
    this.waterNormalTex.colorSpace = THREE.NoColorSpace;
    this.waterNormalTex.wrapS = THREE.RepeatWrapping;
    this.waterNormalTex.wrapT = THREE.RepeatWrapping;
    this.waterNormalTex.repeat.set(38, 38);
    this.waterNormalTex.anisotropy = hwAniso;

    const waterQ = getWaterQualityConfig(this.graphicsQuality);

    // Coastal & inland water material with shallow-turquoise-to-deep-ocean vertex colors & subtle wave ripples
    const water = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: PBR_SURFACE_STANDARDS.CALM_RIVER_WATER.roughness,
      metalness: PBR_SURFACE_STANDARDS.CALM_RIVER_WATER.metalness,
      vertexColors: true,
      bumpMap: this.waterNormalTex,
      bumpScale: waterQ.normalScale,
      envMapIntensity: 0.38,
    });

    this.oceanHorizonMat = new THREE.MeshStandardMaterial({
      color: COASTAL_PALETTE_STANDARDS.DEEP_OCEAN_BLUE,
      roughness: PBR_SURFACE_STANDARDS.CALM_RIVER_WATER.roughness,
      metalness: PBR_SURFACE_STANDARDS.CALM_RIVER_WATER.metalness,
      bumpMap: this.waterNormalTex,
      bumpScale: waterQ.normalScale * 0.85,
      envMapIntensity: 0.36,
    });

    const depotBrick = new THREE.MeshStandardMaterial({
      color: 0x9a4432,
      roughness: 0.76,
      metalness: 0.08,
    });

    const depotRoof = new THREE.MeshStandardMaterial({
      color: 0x3b495e,
      roughness: 0.48,
      metalness: 0.35,
    });

    const industrialWall = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.62,
      metalness: 0.24,
    });

    const cityGlass = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: PBR_SURFACE_STANDARDS.SKYLIGHT_BLUE_GLAZING.roughness,
      metalness: PBR_SURFACE_STANDARDS.SKYLIGHT_BLUE_GLAZING.metalness,
    });

    const cityTowerBody = new THREE.MeshStandardMaterial({
      color: 0xe6e4dd,
      roughness: 0.56,
      metalness: 0.14,
    });

    const accentSteel = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.36,
      metalness: 0.68,
    });

    const brushedAluminiumUld = new THREE.MeshStandardMaterial({
      color: PBR_SURFACE_STANDARDS.BRUSHED_ALUMINIUM_ULD.baseColorHex,
      roughness: PBR_SURFACE_STANDARDS.BRUSHED_ALUMINIUM_ULD.roughness,
      metalness: PBR_SURFACE_STANDARDS.BRUSHED_ALUMINIUM_ULD.metalness,
    });

    const safetyYellow = new THREE.MeshStandardMaterial({
      color: 0xf5b014,
      roughness: 0.38,
      metalness: 0.18,
    });

    const cargoYellowCorrugated = new THREE.MeshStandardMaterial({
      map: yellowCorrTex,
      color: 0xffffff,
      roughness: PBR_SURFACE_STANDARDS.CARGO_YELLOW_CORRUGATED.roughness,
      metalness: PBR_SURFACE_STANDARDS.CARGO_YELLOW_CORRUGATED.metalness,
    });

    const cargoGreenOperations = new THREE.MeshStandardMaterial({
      color: PBR_SURFACE_STANDARDS.CARGO_GREEN_OPERATIONS.baseColorHex,
      roughness: PBR_SURFACE_STANDARDS.CARGO_GREEN_OPERATIONS.roughness,
      metalness: PBR_SURFACE_STANDARDS.CARGO_GREEN_OPERATIONS.metalness,
    });

    const cargoSignageFascia = new THREE.MeshStandardMaterial({
      map: cargoSignTex,
      color: 0xffffff,
      roughness: 0.38,
      metalness: 0.18,
    });

    const runwayNum09 = new THREE.MeshBasicMaterial({
      map: createRunwayNumberTexture('09'),
      transparent: true,
      alphaTest: 0.15,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    const runwayNum27 = new THREE.MeshBasicMaterial({
      map: createRunwayNumberTexture('27'),
      transparent: true,
      alphaTest: 0.15,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    const aircraftFuselageCargo = new THREE.MeshStandardMaterial({
      map: acFuseTex,
      color: 0xffffff,
      roughness: PBR_SURFACE_STANDARDS.AIRCRAFT_GLOSS_WHITE.roughness,
      metalness: PBR_SURFACE_STANDARDS.AIRCRAFT_GLOSS_WHITE.metalness,
    });

    const aircraftTailFinEmblem = new THREE.MeshStandardMaterial({
      map: acTailTex,
      color: 0xffffff,
      roughness: PBR_SURFACE_STANDARDS.AIRCRAFT_LIVERY_BLUE.roughness,
      metalness: PBR_SURFACE_STANDARDS.AIRCRAFT_LIVERY_BLUE.metalness,
    });

    const aircraftLiveryBlue = new THREE.MeshStandardMaterial({
      color: PBR_SURFACE_STANDARDS.AIRCRAFT_LIVERY_BLUE.baseColorHex,
      roughness: PBR_SURFACE_STANDARDS.AIRCRAFT_LIVERY_BLUE.roughness,
      metalness: PBR_SURFACE_STANDARDS.AIRCRAFT_LIVERY_BLUE.metalness,
    });

    const contactShadow = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const gateRed = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.4,
      metalness: 0.15,
    });

    const craneTeal = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.38,
      metalness: 0.45,
    });

    const previewValid = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    const previewInvalid = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    const tyreRubber = new THREE.MeshStandardMaterial({
      color: PBR_SURFACE_STANDARDS.TYRE_MATTE_RUBBER.baseColorHex,
      roughness: PBR_SURFACE_STANDARDS.TYRE_MATTE_RUBBER.roughness,
      metalness: PBR_SURFACE_STANDARDS.TYRE_MATTE_RUBBER.metalness,
    });

    const wheelHubSteel = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.3,
      metalness: 0.8,
    });

    const headlightEmissive = new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      emissive: 0xfef08a,
      emissiveIntensity: 0.75,
      roughness: 0.2,
    });

    const brakeLightEmissive = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.85,
      roughness: 0.25,
    });

    this.materials = {
      asphalt,
      runwayAsphalt,
      apronConcreteSlab,
      whiteLine,
      yellowLine,
      concrete,
      curbstone,
      ballast,
      steelRail,
      timberSleeper,
      water,
      depotBrick,
      depotRoof,
      industrialWall,
      cityGlass,
      cityTowerBody,
      accentSteel,
      brushedAluminiumUld,
      safetyYellow,
      cargoYellowCorrugated,
      cargoGreenOperations,
      cargoSignageFascia,
      runwayNum09,
      runwayNum27,
      aircraftFuselageCargo,
      aircraftTailFinEmblem,
      aircraftLiveryBlue,
      contactShadow,
      gateRed,
      craneTeal,
      tyreRubber,
      wheelHubSteel,
      headlightEmissive,
      brakeLightEmissive,
      previewValid,
      previewInvalid,
    };

    // Generate Procedural High-Contrast Architectural Facade Textures (Master Prompt 5 Part 5)
    const createFacadeTexture = (
      baseHex: string,
      mullionHex: string,
      windowHex: string,
      litWindowHex: string,
      cols: number,
      rows: number,
      hasBrickCourses: boolean
    ): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const g = c.getContext('2d');
      if (g) {
        g.fillStyle = baseHex;
        g.fillRect(0, 0, 128, 128);

        if (hasBrickCourses) {
          g.strokeStyle = 'rgba(0,0,0,0.14)';
          g.lineWidth = 1;
          for (let y = 0; y < 128; y += 6) {
            g.beginPath();
            g.moveTo(0, y);
            g.lineTo(128, y);
            g.stroke();
          }
        }

        const cellW = 128 / cols;
        const cellH = 128 / rows;
        for (let r = 0; r < rows; r++) {
          for (let col = 0; col < cols; col++) {
            const wx = col * cellW + cellW * 0.18;
            const wy = r * cellH + cellH * 0.2;
            const ww = cellW * 0.64;
            const wh = cellH * 0.6;
            g.fillStyle = mullionHex;
            g.fillRect(wx - 1.5, wy - 1.5, ww + 3, wh + 3);
            g.fillStyle = (r * 3 + col * 5) % 4 === 0 ? litWindowHex : windowHex;
            g.fillRect(wx, wy, ww, wh);
          }
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = hwAniso;
      return tex;
    };

    this.facadeTextures = {
      WARM_BRICK: createFacadeTexture('#9a4a38', '#e2e8f0', '#1e293b', '#7dd3fc', 4, 4, true),
      ARCHITECTURAL_CONCRETE: createFacadeTexture('#cbd5e1', '#475569', '#1e293b', '#93c5fd', 4, 4, false),
      CURTAIN_GLASS_BLUE: createFacadeTexture('#1e3a5f', '#94a3b8', '#0284c7', '#bae6fd', 6, 6, false),
      CORRUGATED_STEEL: createFacadeTexture('#64748b', '#334155', '#0f172a', '#fde047', 3, 2, true),
      LIMESTONE_PLASTER: createFacadeTexture('#e2dcd0', '#64748b', '#334155', '#fef08a', 3, 3, false),
      TERRACOTTA_CLAD: createFacadeTexture('#b86b52', '#f1f5f9', '#1e293b', '#fde68a', 4, 3, false),
      MARITIME_TEAL_STEEL: createFacadeTexture('#0369a1', '#cbd5e1', '#0f172a', '#7dd3fc', 3, 2, true),
    };
  }

  private clearGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children.pop()!;
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
        }
      });
    }
  }

  /**
   * Rebuilds all visual layers from the authoritative WorldManager state.
   */
  public rebuildAllWorldVisuals(): void {
    this.contactShadowMeshes = [];
    this.fineDetailMeshes = [];
    this.understoryBushMeshes = [];
    this.buildTerrainAndWaterVisuals();
    this.buildNaturalFoliageAndRocks();
    this.rebuildRoadVisuals();
    this.rebuildRailwayVisuals();
    this.rebuildBridgesVisuals();
    this.buildPortHarbourVisuals();
    this.buildAirportVisuals();
    this.buildStarterContextBuildings();
    this.rebuildVehiclesVisuals();
    this.rebuildDebugOverlays();
  }

  /**
  /**
   * Builds seamless chunked terrain meshes (40x40 cells per chunk with shared boundary normals),
   * corner-interpolated + Laplacian-smoothed organic coastlines with a multi-tiered beach gradient
   * (lush inland grass -> dry coastal grass/soil -> warm sandy beach #e6d5ac -> shallow turquoise water -> deep ocean #1a3b6e),
   * contour-aligned quad diagonals (zero sawtooth edges), and an infinite-horizon ocean plane (zero green void).
   */
  public buildTerrainAndWaterVisuals(): void {
    this.clearGroup(this.terrainGroup);
    this.clearGroup(this.waterGroup);
    this.terrainChunkVisuals = [];

    const minGx = this.world.config.coreMinGx ?? -80;
    const maxGx = this.world.config.coreMaxGx ?? 439;
    const minGz = this.world.config.coreMinGz ?? -80;
    const maxGz = this.world.config.coreMaxGz ?? 319;
    const w = maxGx - minGx + 1;
    const d = maxGz - minGz + 1;
    const cs = this.world.config.cellSize;
    const ox = this.world.config.originX;
    const oz = this.world.config.originZ;
    const minWorldX = ox + minGx * cs;
    const minWorldZ = oz + minGz * cs;
    const tw = this.world.terrainWater;

    const mapCenterX = minWorldX + w * cs * 0.5;
    const mapCenterZ = minWorldZ + d * cs * 0.5;

    // 1. Infinite Ocean Horizon & Deep Seabed Floor (24,000m x 24,000m — covers full 20.3M-block world horizon)
    const seabedGeo = new THREE.PlaneGeometry(24000, 24000, 1, 1);
    seabedGeo.rotateX(-Math.PI / 2);
    const seabedMat = new THREE.MeshStandardMaterial({
      color: COASTAL_PALETTE_STANDARDS.DEEP_OCEAN_BLUE,
      roughness: 0.96,
      metalness: 0.0,
    });
    const seabedMesh = new THREE.Mesh(seabedGeo, seabedMat);
    seabedMesh.position.set(mapCenterX, -1.86, mapCenterZ);
    this.terrainGroup.add(seabedMesh);

    const infiniteOceanGeo = new THREE.PlaneGeometry(24000, 24000, 1, 1);
    infiniteOceanGeo.rotateX(-Math.PI / 2);
    const infiniteOceanMesh = new THREE.Mesh(
      infiniteOceanGeo,
      this.oceanHorizonMat
    );
    infiniteOceanMesh.position.set(mapCenterX, 0.055, mapCenterZ);
    infiniteOceanMesh.receiveShadow = true;
    this.waterGroup.add(infiniteOceanMesh);

    // 2. Compute Corner-Averaged & Laplacian-Smoothed Global Vertex Positions, Colors & Shared Normals
    const vertCount = (w + 1) * (d + 1);
    const rawElevations = new Float32Array(vertCount);
    const smoothElevations = new Float32Array(vertCount);
    const vertCoastalDist = new Float32Array(vertCount);
    const vertLockedPlateau = new Uint8Array(vertCount);
    const vertDominantCat = new Uint8Array(vertCount);
    const vertForestDens = new Uint8Array(vertCount);

    const rc = this.world.config.railCorridor;
    const cc = this.world.config.coreCity;
    const hw = this.world.config.highway;
    const pt = this.world.config.port;
    const ap = this.world.config.airport;

    const isCellHardPlateau = (cx: number, cz: number): boolean => {
      if (cx < minGx || cx > maxGx || cz < minGz || cz > maxGz) return false;
      if (
        cx >= pt.startX &&
        cx <= pt.endX &&
        cz >= pt.startZ &&
        cz <= pt.endZ
      ) {
        return true;
      }
      if (
        cx >= rc.startX &&
        cx <= rc.endX &&
        cz >= rc.minZ &&
        cz <= rc.maxZ
      ) {
        return true;
      }
      if (
        cx >= cc.startX &&
        cx <= cc.endX &&
        cz >= cc.startZ &&
        cz <= cc.endZ
      ) {
        return true;
      }
      if (cx >= 105 && cx <= 134 && cz >= 35 && cz <= 76) return true;
      if (cx >= 122 && cx <= 194 && cz >= 51 && cz <= 59) return true;
      if (
        (cx >= 37 && cx <= 60 && cz >= 32 && cz <= 80) ||
        (cx >= 35 && cx <= 59 && cz >= 67 && cz <= 95)
      ) {
        return true;
      }
      if (
        cx >= hw.startX &&
        cx <= hw.endX &&
        cz >= hw.visibleStartZ &&
        cz <= hw.visibleEndZ
      ) {
        return true;
      }
      if (
        cx >= ap.startX - 2 &&
        cx <= ap.endX + 3 &&
        cz >= ap.startZ - 1 &&
        cz <= ap.endZ + 2
      ) {
        return true;
      }
      return false;
    };

    // Pass 2A: 4-Cell Corner Interpolation + Outer World Perimeter Beach/Ocean Taper
    for (let lz = 0; lz <= d; lz++) {
      const vz = minGz + lz;
      for (let lx = 0; lx <= w; lx++) {
        const vx = minGx + lx;
        const vIdx = lz * (w + 1) + lx;
        const c0x = Math.max(minGx, Math.min(maxGx, vx - 1));
        const c1x = Math.max(minGx, Math.min(maxGx, vx));
        const c0z = Math.max(minGz, Math.min(maxGz, vz - 1));
        const c1z = Math.max(minGz, Math.min(maxGz, vz));

        const cornerCoords: [number, number][] = [
          [c0x, c0z],
          [c1x, c0z],
          [c0x, c1z],
          [c1x, c1z],
        ];

        let locked = false;
        let lockedElev = 1.2;
        let lockedCat = TerrainCategory.GRASS;
        let sumElev = 0;
        let sumDist = 0;
        let hasRiverbank = false;

        for (const [cx, cz] of cornerCoords) {
          const el = tw.getElevationAtGrid(cx, cz) ?? 1.2;
          const cd = tw.getCoastalDistanceAt(cx, cz);
          const cat = tw.getTerrainCategoryAt(cx, cz) ?? TerrainCategory.GRASS;
          if (cat === TerrainCategory.RIVERBANK) hasRiverbank = true;
          sumElev += el;
          sumDist += cd;
          if (isCellHardPlateau(cx, cz)) {
            locked = true;
            lockedElev = el;
            lockedCat = cat;
          }
        }

        const sampleCat =
          tw.getTerrainCategoryAt(c1x, c1z) ?? TerrainCategory.GRASS;
        vertDominantCat[vIdx] = locked
          ? lockedCat
          : hasRiverbank
            ? TerrainCategory.RIVERBANK
            : sampleCat;
        vertForestDens[vIdx] = tw.getForestDensityAt(c1x, c1z);

        // Smoothly grade the outer 6-cell world perimeter into a natural coastal beach & seabed
        // so the playable peninsula is completely surrounded by ocean with zero floating map edges
        const edgeDist = Math.min(lx, w - lx, lz, d - lz);
        if (!locked && edgeDist < 6) {
          const edgeT = edgeDist / 6.0;
          const smoothEdge = edgeT * edgeT * (3 - 2 * edgeT);
          const avgEl = sumElev * 0.25;
          const targetOceanEl = -1.35 + edgeT * 1.55;
          rawElevations[vIdx] =
            targetOceanEl * (1 - smoothEdge) + avgEl * smoothEdge;
          vertCoastalDist[vIdx] = Math.min(sumDist * 0.25, edgeDist - 2.2);
          vertLockedPlateau[vIdx] = 0;
        } else if (locked) {
          rawElevations[vIdx] = lockedElev;
          vertCoastalDist[vIdx] = sumDist * 0.25;
          vertLockedPlateau[vIdx] = 1;
        } else {
          rawElevations[vIdx] = sumElev * 0.25;
          vertCoastalDist[vIdx] = sumDist * 0.25;
          vertLockedPlateau[vIdx] = 0;
        }
      }
    }

    smoothElevations.set(rawElevations);

    // Pass 2B: 3-Iteration Coastal & Riverbank Laplacian Vertex Smoothing (eliminates sawtooth staircase teeth)
    const scratchElev = new Float32Array(vertCount);
    for (let iter = 0; iter < 3; iter++) {
      scratchElev.set(smoothElevations);
      for (let lz = 1; lz < d; lz++) {
        for (let lx = 1; lx < w; lx++) {
          const vIdx = lz * (w + 1) + lx;
          if (vertLockedPlateau[vIdx] === 1) continue;
          const cDist = vertCoastalDist[vIdx];
          const edgeDist = Math.min(lx, w - lx, lz, d - lz);
          if (Math.abs(cDist) > 6.0 && edgeDist >= 7) continue;

          const nSum =
            (scratchElev[vIdx - 1] +
              scratchElev[vIdx + 1] +
              scratchElev[vIdx - (w + 1)] +
              scratchElev[vIdx + (w + 1)]) *
              0.15 +
            (scratchElev[vIdx - (w + 1) - 1] +
              scratchElev[vIdx - (w + 1) + 1] +
              scratchElev[vIdx + (w + 1) - 1] +
              scratchElev[vIdx + (w + 1) + 1]) *
              0.1;

          smoothElevations[vIdx] = scratchElev[vIdx] * 0.42 + nSum * 0.58;
        }
      }
    }

    // Pass 2C: Populate Global Vertex Positions & Multi-Tiered Coastal Color Gradient
    const globalPositions = new Float32Array(vertCount * 3);
    const globalColors = new Float32Array(vertCount * 3);
    const globalIndices = new Uint32Array(w * d * 6);

    const cDeepOcean = new THREE.Color(
      COASTAL_PALETTE_STANDARDS.DEEP_OCEAN_BLUE
    );
    const cShallowTurq = new THREE.Color(
      COASTAL_PALETTE_STANDARDS.SHALLOW_TURQUOISE_WATER
    );
    const cWetSand = new THREE.Color(COASTAL_PALETTE_STANDARDS.WET_TIDAL_SAND);
    const cWarmSand = new THREE.Color(
      COASTAL_PALETTE_STANDARDS.WARM_SANDY_BEACH
    );
    const cDryCoastGrass = new THREE.Color(
      COASTAL_PALETTE_STANDARDS.COASTAL_DRY_GRASS_SOIL
    );
    const cLushGrass = new THREE.Color(
      COASTAL_PALETTE_STANDARDS.INLAND_LUSH_GRASS
    );
    const cRiverbankGrass = new THREE.Color(0x5e7648);

    for (let lz = 0; lz <= d; lz++) {
      const gz = minGz + lz;
      for (let lx = 0; lx <= w; lx++) {
        const gx = minGx + lx;
        const vIdx = lz * (w + 1) + lx;
        const elev = smoothElevations[vIdx];
        const cDist = vertCoastalDist[vIdx];
        const cat = vertDominantCat[vIdx] as TerrainCategory;
        const forestDens = vertForestDens[vIdx] as ForestDensityLevel;
        const locked = vertLockedPlateau[vIdx] === 1;

        globalPositions[vIdx * 3] = minWorldX + lx * cs;
        globalPositions[vIdx * 3 + 1] = elev;
        globalPositions[vIdx * 3 + 2] = minWorldZ + lz * cs;

        if (locked) {
          switch (cat) {
            case TerrainCategory.INDUSTRIAL_GROUND:
              _tempColor.setHex(0x5c635b);
              break;
            case TerrainCategory.URBAN_GROUND:
              _tempColor.setHex(0x516953);
              break;
            case TerrainCategory.GRAVEL:
              _tempColor.setHex(0x6b6e6b);
              break;
            default:
              _tempColor.setHex(0x46753f);
              break;
          }
        } else if (elev < -0.55) {
          _tempColor.copy(cDeepOcean);
        } else if (elev < 0.08) {
          // Smooth seabed transition from deep ocean blue (#1a3b6e) -> shallow turquoise -> wet tidal sand at waterline
          const t = Math.max(0, Math.min(1, (elev + 0.55) / 0.63));
          if (t < 0.55) {
            _tempColor.lerpColors(cDeepOcean, cShallowTurq, t / 0.55);
          } else {
            _tempColor.lerpColors(cShallowTurq, cWetSand, (t - 0.55) / 0.45);
          }
        } else if (elev <= 0.62 && cDist <= 3.8 && cat !== TerrainCategory.ROCK) {
          // Gently sloped warm sandy beach (#e6d5ac) or natural riverbank
          const t = Math.max(0, Math.min(1, (elev - 0.08) / 0.54));
          if (cat === TerrainCategory.RIVERBANK && cDist <= 2.2) {
            _tempColor.lerpColors(cWetSand, cRiverbankGrass, t * 0.85);
          } else {
            _tempColor.lerpColors(cWetSand, cWarmSand, Math.min(1, t * 1.25));
          }
        } else if (elev <= 1.12 && cDist <= 5.8 && cat !== TerrainCategory.ROCK) {
          // Multi-tiered transition: warm sandy beach (#e6d5ac) -> dry coastal grass/soil (#7c8554) -> lush inland grass (#46753f)
          const t = Math.max(0, Math.min(1, (elev - 0.62) / 0.5));
          if (t < 0.48) {
            _tempColor.lerpColors(cWarmSand, cDryCoastGrass, t / 0.48);
          } else {
            _tempColor.lerpColors(
              cDryCoastGrass,
              cLushGrass,
              (t - 0.48) / 0.52
            );
          }
        } else {
          // Inland terrain palette with richer forest-floor shading under dense woods
          switch (cat) {
            case TerrainCategory.GRASS:
              if (forestDens === ForestDensityLevel.DENSE_FOREST) {
                _tempColor.setHex(
                  Math.abs(gx + gz) % 3 === 0 ? 0x2f592b : 0x356130
                );
              } else if (forestDens === ForestDensityLevel.MEDIUM_WOODLAND) {
                _tempColor.setHex(0x3a6734);
              } else {
                _tempColor.setHex(
                  Math.abs(gx + gz) % 5 === 0 ? 0x3e6b38 : 0x46753f
                );
              }
              break;
            case TerrainCategory.SOIL:
              _tempColor.setHex(
                forestDens !== ForestDensityLevel.NONE ? 0x4b5739 : 0x5c6344
              );
              break;
            case TerrainCategory.GRAVEL:
              _tempColor.setHex(0x6b6e6b);
              break;
            case TerrainCategory.ROCK:
              _tempColor.setHex(0x5c6470);
              break;
            case TerrainCategory.INDUSTRIAL_GROUND:
              _tempColor.setHex(0x5c635b);
              break;
            case TerrainCategory.URBAN_GROUND:
              _tempColor.setHex(0x516953);
              break;
            case TerrainCategory.COASTAL_SAND:
              _tempColor.copy(cWarmSand);
              break;
            case TerrainCategory.RIVERBANK:
              _tempColor.copy(cRiverbankGrass);
              break;
            case TerrainCategory.SUBMERGED:
              _tempColor.copy(cDeepOcean);
              break;
          }
        }

        globalColors[vIdx * 3] = _tempColor.r;
        globalColors[vIdx * 3 + 1] = _tempColor.g;
        globalColors[vIdx * 3 + 2] = _tempColor.b;
      }
    }

    // Pass 2D: Contour-Aligned Quad Diagonal Triangulation (splits quads parallel to shoreline iso-contours)
    let gPtr = 0;
    for (let lz = 0; lz < d; lz++) {
      for (let lx = 0; lx < w; lx++) {
        const a = lz * (w + 1) + lx;
        const b = a + 1;
        const c = (lz + 1) * (w + 1) + lx;
        const dVert = c + 1;

        const diffAD = Math.abs(smoothElevations[a] - smoothElevations[dVert]);
        const diffBC = Math.abs(smoothElevations[b] - smoothElevations[c]);

        if (diffAD < diffBC) {
          globalIndices[gPtr++] = a;
          globalIndices[gPtr++] = c;
          globalIndices[gPtr++] = dVert;

          globalIndices[gPtr++] = a;
          globalIndices[gPtr++] = dVert;
          globalIndices[gPtr++] = b;
        } else {
          globalIndices[gPtr++] = a;
          globalIndices[gPtr++] = c;
          globalIndices[gPtr++] = b;

          globalIndices[gPtr++] = b;
          globalIndices[gPtr++] = c;
          globalIndices[gPtr++] = dVert;
        }
      }
    }

    const tempFullGeo = new THREE.BufferGeometry();
    tempFullGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(globalPositions, 3)
    );
    tempFullGeo.setIndex(new THREE.BufferAttribute(globalIndices, 1));
    tempFullGeo.computeVertexNormals();
    const globalNormals = (
      tempFullGeo.getAttribute('normal') as THREE.BufferAttribute
    ).array as Float32Array;

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.02,
    });

    // 2E. Build Individual Seamless Terrain Chunks (40x40 cells per chunk -> 130 chunks for 520x400)
    for (const chunkMeta of tw.getTerrainChunks()) {
      const cw = chunkMeta.maxGx - chunkMeta.minGx + 1;
      const cd = chunkMeta.maxGz - chunkMeta.minGz + 1;
      const cVertCount = (cw + 1) * (cd + 1);
      const cPos = new Float32Array(cVertCount * 3);
      const cCol = new Float32Array(cVertCount * 3);
      const cNorm = new Float32Array(cVertCount * 3);
      const cIndices = new Uint16Array(cw * cd * 6);

      for (let lz = 0; lz <= cd; lz++) {
        const gz = chunkMeta.minGz + lz;
        for (let lx = 0; lx <= cw; lx++) {
          const gx = chunkMeta.minGx + lx;
          const gIdx = (gz - minGz) * (w + 1) + (gx - minGx);
          const lIdx = lz * (cw + 1) + lx;

          cPos[lIdx * 3] = globalPositions[gIdx * 3];
          cPos[lIdx * 3 + 1] = globalPositions[gIdx * 3 + 1];
          cPos[lIdx * 3 + 2] = globalPositions[gIdx * 3 + 2];

          cCol[lIdx * 3] = globalColors[gIdx * 3];
          cCol[lIdx * 3 + 1] = globalColors[gIdx * 3 + 1];
          cCol[lIdx * 3 + 2] = globalColors[gIdx * 3 + 2];

          cNorm[lIdx * 3] = globalNormals[gIdx * 3];
          cNorm[lIdx * 3 + 1] = globalNormals[gIdx * 3 + 1];
          cNorm[lIdx * 3 + 2] = globalNormals[gIdx * 3 + 2];
        }
      }

      let iPtr = 0;
      for (let lz = 0; lz < cd; lz++) {
        const gz = chunkMeta.minGz + lz;
        for (let lx = 0; lx < cw; lx++) {
          const gx = chunkMeta.minGx + lx;
          const gA = (gz - minGz) * (w + 1) + (gx - minGx);
          const gB = gA + 1;
          const gC = (gz - minGz + 1) * (w + 1) + (gx - minGx);
          const gD = gC + 1;

          const a = lz * (cw + 1) + lx;
          const b = a + 1;
          const c = (lz + 1) * (cw + 1) + lx;
          const dVert = c + 1;

          const diffAD = Math.abs(
            smoothElevations[gA] - smoothElevations[gD]
          );
          const diffBC = Math.abs(
            smoothElevations[gB] - smoothElevations[gC]
          );

          if (diffAD < diffBC) {
            cIndices[iPtr++] = a;
            cIndices[iPtr++] = c;
            cIndices[iPtr++] = dVert;

            cIndices[iPtr++] = a;
            cIndices[iPtr++] = dVert;
            cIndices[iPtr++] = b;
          } else {
            cIndices[iPtr++] = a;
            cIndices[iPtr++] = c;
            cIndices[iPtr++] = b;

            cIndices[iPtr++] = b;
            cIndices[iPtr++] = c;
            cIndices[iPtr++] = dVert;
          }
        }
      }

      const chunkGeo = new THREE.BufferGeometry();
      chunkGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
      chunkGeo.setAttribute('color', new THREE.BufferAttribute(cCol, 3));
      chunkGeo.setAttribute('normal', new THREE.BufferAttribute(cNorm, 3));
      chunkGeo.setIndex(new THREE.BufferAttribute(cIndices, 1));
      chunkGeo.computeBoundingSphere();

      const chunkMesh = new THREE.Mesh(chunkGeo, terrainMat);
      chunkMesh.name = chunkMeta.id;
      chunkMesh.receiveShadow = true;
      this.terrainGroup.add(chunkMesh);

      this.terrainChunkVisuals.push({
        id: chunkMeta.id,
        centerWx: chunkMeta.centerWx,
        centerWz: chunkMeta.centerWz,
        mesh: chunkMesh,
        lodTier: 'NEAR',
      });
    }

    tempFullGeo.dispose();

    // 3. Sub-Beach Continuous Water Surface Mesh at y=0.08 with Shallow Turquoise -> Deep Ocean Blue & Shoreline Foam Gradient
    const waterVertCount = (w + 1) * (d + 1);
    const wPositions = new Float32Array(waterVertCount * 3);
    const wColors = new Float32Array(waterVertCount * 3);
    const wUvs = new Float32Array(waterVertCount * 2);
    const wIndices: number[] = [];

    const cFoam = new THREE.Color(COASTAL_PALETTE_STANDARDS.SHORELINE_FOAM);
    const cMidWater = new THREE.Color(
      COASTAL_PALETTE_STANDARDS.MID_COASTAL_WATER
    );
    const foamStrength = getWaterQualityConfig(
      this.graphicsQuality
    ).foamIntensity;

    for (let lz = 0; lz <= d; lz++) {
      for (let lx = 0; lx <= w; lx++) {
        const vIdx = lz * (w + 1) + lx;
        const terrainY = smoothElevations[vIdx];
        const depth = Math.max(0, 0.08 - terrainY);

        wPositions[vIdx * 3] = minWorldX + lx * cs;
        wPositions[vIdx * 3 + 1] = 0.08;
        wPositions[vIdx * 3 + 2] = minWorldZ + lz * cs;

        wUvs[vIdx * 2] = lx / w;
        wUvs[vIdx * 2 + 1] = lz / d;

        if (depth < 0.14) {
          // Gentle shoreline foam / shallow water edge blending where depth approaches zero
          const t = depth / 0.14;
          _tempColor.lerpColors(cFoam, cShallowTurq, 1 - (1 - t) * foamStrength);
        } else if (depth < 0.58) {
          // Shallow turquoise coastal water -> mid coastal blue
          const t = (depth - 0.14) / 0.44;
          _tempColor.lerpColors(cShallowTurq, cMidWater, t);
        } else if (depth < 1.25) {
          // Mid coastal blue -> deep ocean blue (#1a3b6e)
          const t = (depth - 0.58) / 0.67;
          _tempColor.lerpColors(cMidWater, cDeepOcean, t);
        } else {
          _tempColor.copy(cDeepOcean);
        }

        wColors[vIdx * 3] = _tempColor.r;
        wColors[vIdx * 3 + 1] = _tempColor.g;
        wColors[vIdx * 3 + 2] = _tempColor.b;
      }
    }

    // Emit water triangles for all water cells AND coastal beach overlap cells (minElev < 0.36)
    // so the water plane intersects the smoothed sandy beach slope cleanly with zero sawtooth gaps!
    for (let lz = 0; lz < d; lz++) {
      const gz = minGz + lz;
      for (let lx = 0; lx < w; lx++) {
        const gx = minGx + lx;
        const a = lz * (w + 1) + lx;
        const b = a + 1;
        const c = (lz + 1) * (w + 1) + lx;
        const dVert = c + 1;

        const minCornerElev = Math.min(
          smoothElevations[a],
          smoothElevations[b],
          smoothElevations[c],
          smoothElevations[dVert]
        );
        if (!tw.isWaterAt(gx, gz) && minCornerElev > 0.36) continue;

        wIndices.push(a, c, b, b, c, dVert);
      }
    }

    const waterGeo = new THREE.BufferGeometry();
    waterGeo.setAttribute('position', new THREE.BufferAttribute(wPositions, 3));
    waterGeo.setAttribute('color', new THREE.BufferAttribute(wColors, 3));
    waterGeo.setAttribute('uv', new THREE.BufferAttribute(wUvs, 2));
    waterGeo.setIndex(wIndices);
    waterGeo.computeVertexNormals();

    const waterMesh = new THREE.Mesh(waterGeo, this.materials.water);
    waterMesh.receiveShadow = true;
    this.waterGroup.add(waterMesh);
  }

  /**
   * Builds InstancedMesh multi-species forests (Conifer Pines, Deciduous Broad-Leaf Oaks, Tall Woodland Cypress),
   * understory shrubs/bushes, and highland boulders across the 520x400 four-direction expanded world while
   * strictly respecting roads, railways, buildings, and reserved transport zones.
   */
  public buildNaturalFoliageAndRocks(): void {
    this.clearGroup(this.propsGroup);
    this.understoryBushMeshes = [];

    const minGx = this.world.config.coreMinGx ?? -80;
    const maxGx = this.world.config.coreMaxGx ?? 439;
    const minGz = this.world.config.coreMinGz ?? -80;
    const maxGz = this.world.config.coreMaxGz ?? 319;
    const tw = this.world.terrainWater;
    const dist = this.world.districts;

    const coniferLocations: Array<{
      x: number;
      y: number;
      z: number;
      scale: number;
      tint: number;
    }> = [];
    const deciduousLocations: Array<{
      x: number;
      y: number;
      z: number;
      scale: number;
      tint: number;
    }> = [];
    const cypressLocations: Array<{
      x: number;
      y: number;
      z: number;
      scale: number;
      tint: number;
    }> = [];
    const bushLocations: Array<{
      x: number;
      y: number;
      z: number;
      scale: number;
      tint: number;
    }> = [];
    const rockLocations: Array<{
      x: number;
      y: number;
      z: number;
      scale: number;
    }> = [];

    for (let gz = minGz + 3; gz <= maxGz - 3; gz += 2) {
      for (let gx = minGx + 3; gx <= maxGx - 3; gx += 2) {
        if (tw.isWaterAt(gx, gz)) continue;
        const zone = dist.getZoneAt(gx, gz);
        if (
          zone === ZoneCategory.RAIL_YARD ||
          zone === ZoneCategory.CITY ||
          zone === ZoneCategory.HIGHWAY_RESERVED ||
          zone === ZoneCategory.PORT_RESERVED ||
          zone === ZoneCategory.AIRPORT_RESERVED ||
          zone === ZoneCategory.LOGISTICS ||
          zone === ZoneCategory.INDUSTRIAL
        ) {
          continue;
        }

        // Strict infrastructure & building collision check: never place trees on roads or buildings
        if (
          this.world.roads.getRoadAtCell(gx, gz) ||
          this.world.economy.getPlacedBuildingAtCell(gx, gz)
        ) {
          continue;
        }

        // Keep all 5 curved river surface ribbons completely clear of tree trunks & canopies
        const r1 = tw.getRiverCenterAndWidthAtZ(gz);
        if (r1 && Math.abs(gx - r1.centerX) <= r1.widthCells * 0.68 + 1.8) {
          continue;
        }
        const r2 = tw.getSilverpineRiverCenterAndWidthAtZ(gz);
        if (r2 && Math.abs(gx - r2.centerX) <= r2.widthCells * 0.68 + 1.8) {
          continue;
        }
        const r3 = tw.getBorealRiverCenterAndWidthAtZ(gz);
        if (r3 && Math.abs(gx - r3.centerX) <= r3.widthCells * 0.68 + 1.8) {
          continue;
        }
        const r4 = tw.getWestwoodRiverCenterAndWidthAtZ(gz);
        if (r4 && Math.abs(gx - r4.centerX) <= r4.widthCells * 0.68 + 1.8) {
          continue;
        }
        const r5 = tw.getEastgateRiverCenterAndWidthAtZ(gz);
        if (r5 && Math.abs(gx - r5.centerX) <= r5.widthCells * 0.68 + 1.8) {
          continue;
        }

        const cat = tw.getTerrainCategoryAt(gx, gz);
        const elev = tw.getElevationAtGrid(gx, gz) ?? 1.2;
        const forestDensity = tw.getForestDensityAt(gx, gz);
        const forestRegion = tw.getForestRegionAt(gx, gz);
        const hash =
          Math.abs(Math.sin(gx * 12.9898 + gz * 78.233) * 43758.5453) % 1;
        const hash2 =
          Math.abs(Math.cos(gx * 41.13 + gz * 19.87) * 29381.31) % 1;

        if (cat === TerrainCategory.ROCK && hash > 0.48) {
          const wp = this.world.grid.gridToWorld(gx, gz);
          rockLocations.push({
            x: wp.x + (hash - 0.5) * 0.9,
            y: elev,
            z: wp.z + (hash2 - 0.5) * 0.9,
            scale: 0.8 + (hash % 0.45),
          });
          continue;
        }

        if (
          cat !== TerrainCategory.GRASS &&
          cat !== TerrainCategory.SOIL
        ) {
          continue;
        }

        // Naturally thin out trees near sandy beaches and outer map edges (zero trees in sand or shallow coastal slopes)
        const coastalDist = tw.getCoastalDistanceAt(gx, gz);
        const edgeDist = Math.min(
          gx - minGx,
          maxGx - gx,
          gz - minGz,
          maxGz - gz
        );
        if (elev < 0.88 || coastalDist < 3.4 || edgeDist < 6) {
          continue;
        }
        const coastalThinning =
          coastalDist < 6.8 ? (coastalDist - 3.4) / 3.4 : 1.0;

        const wp = this.world.grid.gridToWorld(gx, gz);
        const baseSpawn =
          (forestDensity === ForestDensityLevel.DENSE_FOREST && hash > 0.12) ||
          (forestDensity === ForestDensityLevel.MEDIUM_WOODLAND &&
            hash > 0.32) ||
          (forestDensity === ForestDensityLevel.SCATTERED && hash > 0.58) ||
          (forestDensity === ForestDensityLevel.NONE && hash > 0.86);
        const shouldSpawnTree = baseSpawn && hash2 <= coastalThinning;

        if (shouldSpawnTree) {
          const tx = wp.x + (hash - 0.5) * 1.4;
          const tz = wp.z + (hash2 - 0.5) * 1.4;
          const sc =
            (0.78 +
              hash2 * 0.48 +
              (forestDensity === ForestDensityLevel.DENSE_FOREST ? 0.12 : 0)) *
            (0.7 + 0.3 * coastalThinning);

          const mix = forestRegion?.speciesMix ?? 'MIXED_WOODLAND';
          if (
            (mix === 'PINE_CONIFER' && hash2 < 0.72) ||
            (mix === 'HIGHLAND_ALPINE' && hash2 < 0.65) ||
            (mix === 'MIXED_WOODLAND' && hash2 < 0.42)
          ) {
            coniferLocations.push({
              x: tx,
              y: elev,
              z: tz,
              scale: sc,
              tint:
                hash > 0.65
                  ? 0x2f5f32
                  : hash > 0.35
                    ? 0x3b6e39
                    : 0x457941,
            });
          } else if (hash2 > 0.82) {
            cypressLocations.push({
              x: tx,
              y: elev,
              z: tz,
              scale: sc * 1.05,
              tint: hash > 0.5 ? 0x366934 : 0x437a3d,
            });
          } else {
            deciduousLocations.push({
              x: tx,
              y: elev,
              z: tz,
              scale: sc,
              tint:
                hash > 0.68
                  ? 0x387435
                  : hash > 0.34
                    ? 0x468340
                    : 0x528f48,
            });
          }

          // Understory shrubs/bushes in forest interiors & woodland edges
          if (
            forestDensity >= ForestDensityLevel.MEDIUM_WOODLAND &&
            hash2 > 0.45
          ) {
            bushLocations.push({
              x: wp.x + (hash2 - 0.5) * 1.7,
              y: elev,
              z: wp.z - (hash - 0.5) * 1.7,
              scale: 0.65 + (hash % 0.45),
              tint: hash > 0.5 ? 0x3f7838 : 0x4d8843,
            });
          }
        } else if (
          forestDensity >= ForestDensityLevel.SCATTERED &&
          hash2 > 0.68
        ) {
          bushLocations.push({
            x: wp.x + (hash - 0.5) * 1.3,
            y: elev,
            z: wp.z + (hash2 - 0.5) * 1.3,
            scale: 0.55 + (hash2 % 0.4),
            tint: 0x47813f,
          });
        }
      }
    }

    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.15, 6);
    trunkGeo.translate(0, 0.57, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
    });
    const crownMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.82,
    });

    // 1. Conifer Pine Trees (Trunk + Lower Cone + Upper Cone)
    if (coniferLocations.length > 0) {
      const lowerCrownGeo = new THREE.ConeGeometry(0.95, 2.1, 7);
      lowerCrownGeo.translate(0, 1.8, 0);
      const upperCrownGeo = new THREE.ConeGeometry(0.7, 1.6, 7);
      upperCrownGeo.translate(0, 2.8, 0);

      const count = coniferLocations.length;
      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      const lowerInst = new THREE.InstancedMesh(lowerCrownGeo, crownMat, count);
      const upperInst = new THREE.InstancedMesh(upperCrownGeo, crownMat, count);

      for (let i = 0; i < count; i++) {
        const t = coniferLocations[i];
        _dummyObj.position.set(t.x, t.y, t.z);
        _dummyObj.rotation.set(0, i * 1.1, 0);
        _dummyObj.scale.setScalar(t.scale);
        _dummyObj.updateMatrix();

        trunkInst.setMatrixAt(i, _dummyObj.matrix);
        lowerInst.setMatrixAt(i, _dummyObj.matrix);
        upperInst.setMatrixAt(i, _dummyObj.matrix);

        _tempColor.setHex(t.tint);
        lowerInst.setColorAt(i, _tempColor);
        _tempColor.offsetHSL(0.02, 0, 0.04);
        upperInst.setColorAt(i, _tempColor);
      }

      trunkInst.instanceMatrix.needsUpdate = true;
      lowerInst.instanceMatrix.needsUpdate = true;
      upperInst.instanceMatrix.needsUpdate = true;
      if (lowerInst.instanceColor) lowerInst.instanceColor.needsUpdate = true;
      if (upperInst.instanceColor) upperInst.instanceColor.needsUpdate = true;

      trunkInst.computeBoundingSphere();
      lowerInst.computeBoundingSphere();
      upperInst.computeBoundingSphere();

      this.propsGroup.add(trunkInst, lowerInst, upperInst);
    }

    // 2. Deciduous Broad-Leaf Trees (Trunk + Rounded Organic Crown Cluster)
    if (deciduousLocations.length > 0) {
      const mainCanopyGeo = new THREE.IcosahedronGeometry(1.12, 1);
      mainCanopyGeo.scale(1.08, 0.88, 1.08);
      mainCanopyGeo.translate(0, 2.05, 0);

      const topLobeGeo = new THREE.IcosahedronGeometry(0.78, 1);
      topLobeGeo.translate(0.18, 2.75, -0.12);

      const dCount = deciduousLocations.length;
      const dTrunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, dCount);
      const dMainInst = new THREE.InstancedMesh(mainCanopyGeo, crownMat, dCount);
      const dTopInst = new THREE.InstancedMesh(topLobeGeo, crownMat, dCount);

      for (let i = 0; i < dCount; i++) {
        const t = deciduousLocations[i];
        _dummyObj.position.set(t.x, t.y, t.z);
        _dummyObj.rotation.set(0, i * 1.65, 0);
        _dummyObj.scale.setScalar(t.scale);
        _dummyObj.updateMatrix();

        dTrunkInst.setMatrixAt(i, _dummyObj.matrix);
        dMainInst.setMatrixAt(i, _dummyObj.matrix);
        dTopInst.setMatrixAt(i, _dummyObj.matrix);

        _tempColor.setHex(t.tint);
        dMainInst.setColorAt(i, _tempColor);
        _tempColor.offsetHSL(0.015, 0.04, 0.05);
        dTopInst.setColorAt(i, _tempColor);
      }

      dTrunkInst.instanceMatrix.needsUpdate = true;
      dMainInst.instanceMatrix.needsUpdate = true;
      dTopInst.instanceMatrix.needsUpdate = true;
      if (dMainInst.instanceColor) dMainInst.instanceColor.needsUpdate = true;
      if (dTopInst.instanceColor) dTopInst.instanceColor.needsUpdate = true;

      dTrunkInst.computeBoundingSphere();
      dMainInst.computeBoundingSphere();
      dTopInst.computeBoundingSphere();

      this.propsGroup.add(dTrunkInst, dMainInst, dTopInst);
    }

    // 3. Tall Woodland Cypress / Poplar Trees (Slender Vertical Silhouette)
    if (cypressLocations.length > 0) {
      const cyCrownGeo = new THREE.ConeGeometry(0.68, 3.1, 7);
      cyCrownGeo.translate(0, 2.35, 0);

      const cCount = cypressLocations.length;
      const cTrunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, cCount);
      const cCrownInst = new THREE.InstancedMesh(cyCrownGeo, crownMat, cCount);

      for (let i = 0; i < cCount; i++) {
        const t = cypressLocations[i];
        _dummyObj.position.set(t.x, t.y, t.z);
        _dummyObj.rotation.set(0, i * 0.95, 0);
        _dummyObj.scale.setScalar(t.scale);
        _dummyObj.updateMatrix();

        cTrunkInst.setMatrixAt(i, _dummyObj.matrix);
        cCrownInst.setMatrixAt(i, _dummyObj.matrix);

        _tempColor.setHex(t.tint);
        cCrownInst.setColorAt(i, _tempColor);
      }

      cTrunkInst.instanceMatrix.needsUpdate = true;
      cCrownInst.instanceMatrix.needsUpdate = true;
      if (cCrownInst.instanceColor) cCrownInst.instanceColor.needsUpdate = true;

      cTrunkInst.computeBoundingSphere();
      cCrownInst.computeBoundingSphere();
      this.propsGroup.add(cTrunkInst, cCrownInst);
    }

    // 4. Understory Forest Bushes & Shrubs (visible in MEDIUM/HIGH/ULTRA)
    if (bushLocations.length > 0) {
      const bushGeo = new THREE.IcosahedronGeometry(0.58, 1);
      bushGeo.scale(1.25, 0.72, 1.15);
      bushGeo.translate(0, 0.36, 0);

      const bCount = bushLocations.length;
      const bushInst = new THREE.InstancedMesh(bushGeo, crownMat, bCount);
      for (let i = 0; i < bCount; i++) {
        const b = bushLocations[i];
        _dummyObj.position.set(b.x, b.y, b.z);
        _dummyObj.rotation.set(0, i * 1.3, 0);
        _dummyObj.scale.setScalar(b.scale);
        _dummyObj.updateMatrix();
        bushInst.setMatrixAt(i, _dummyObj.matrix);
        _tempColor.setHex(b.tint);
        bushInst.setColorAt(i, _tempColor);
      }
      bushInst.instanceMatrix.needsUpdate = true;
      if (bushInst.instanceColor) bushInst.instanceColor.needsUpdate = true;
      bushInst.computeBoundingSphere();
      bushInst.visible = this.graphicsQuality !== 'LOW';
      this.understoryBushMeshes.push(bushInst);
      this.propsGroup.add(bushInst);
    }

    if (rockLocations.length > 0) {
      const rockGeo = new THREE.DodecahedronGeometry(0.9, 0);
      rockGeo.scale(1.2, 0.7, 1.0);
      rockGeo.translate(0, 0.4, 0);
      const rockMat = new THREE.MeshStandardMaterial({
        color: 0x78716c,
        roughness: 0.88,
      });
      const rockInst = new THREE.InstancedMesh(
        rockGeo,
        rockMat,
        rockLocations.length
      );
      for (let i = 0; i < rockLocations.length; i++) {
        const r = rockLocations[i];
        _dummyObj.position.set(r.x, r.y, r.z);
        _dummyObj.rotation.set(0, i * 0.7, 0);
        _dummyObj.scale.setScalar(r.scale);
        _dummyObj.updateMatrix();
        rockInst.setMatrixAt(i, _dummyObj.matrix);
      }
      rockInst.instanceMatrix.needsUpdate = true;
      rockInst.computeBoundingSphere();
      this.propsGroup.add(rockInst);
    }
  }

  /**
   * Rebuilds all road segments, junctions, the Central Roundabout, and the Extreme-Right 10-Lane Highway.
   */
  public rebuildRoadVisuals(): void {
    this.clearGroup(this.roadsGroup);
    this.roadMeshMap.clear();

    for (const seg of this.world.roads.getAllSegments()) {
      const segGroup = this.createRoadSegmentVisualGroup(seg);
      this.roadMeshMap.set(seg.id, segGroup);
      this.roadsGroup.add(segGroup);
    }

    // Add shared junction surfaces with stop lines and crosswalk markings where multiple roads meet
    for (const junc of this.world.roads.getAllJunctions()) {
      if (junc.isRoundabout || junc.approachingRoadIds.length < 2) continue;
      const wp = this.world.grid.gridToWorld(junc.center.gx, junc.center.gz);
      const juncTerrainElev = Math.max(
        1.2,
        this.world.terrainWater.getElevationAtGrid(junc.center.gx, junc.center.gz) ?? 1.2
      );
      let maxW = 2.0;
      for (const wCfg of Object.values(junc.approachWidths)) {
        maxW = Math.max(maxW, ROAD_SPECS[wCfg].worldWidth);
      }
      const juncGroup = new THREE.Group();
      juncGroup.position.set(wp.x, juncTerrainElev, wp.z);

      const curbPadGeo = new THREE.BoxGeometry(maxW + 0.68, 0.036, maxW + 0.68);
      const curbPadMesh = new THREE.Mesh(curbPadGeo, this.materials.curbstone);
      curbPadMesh.position.y = 0.018;
      juncGroup.add(curbPadMesh);

      const padGeo = new THREE.BoxGeometry(maxW + 0.4, 0.044, maxW + 0.4);
      const padMesh = new THREE.Mesh(padGeo, this.materials.asphalt);
      padMesh.position.y = 0.022;
      juncGroup.add(padMesh);

      // Stop lines and zebra crosswalk bars on each approach edge
      const halfSpan = maxW * 0.5 + 0.12;
      const stripeCount = Math.max(3, Math.floor(maxW / 0.55));
      const stripeSpacing = (maxW - 0.3) / stripeCount;
      for (const dir of [0, 1, 2, 3]) {
        const angle = dir * Math.PI * 0.5;
        const edgeGroup = new THREE.Group();
        edgeGroup.rotation.y = angle;
        for (let s = 0; s < stripeCount; s++) {
          const sx = -maxW * 0.5 + 0.15 + (s + 0.5) * stripeSpacing;
          const zebra = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.01, 0.42),
            this.materials.whiteLine
          );
          zebra.position.set(sx, 0.048, halfSpan);
          edgeGroup.add(zebra);
        }
        juncGroup.add(edgeGroup);
      }

      this.roadsGroup.add(juncGroup);
    }
  }

  private createRoadSegmentVisualGroup(seg: RoadSegmentRecord): THREE.Group {
    const group = new THREE.Group();
    group.name = seg.id;

    if (seg.shape === 'HIGHWAY_MAIN') {
      this.buildHighwayVisuals(group);
      return group;
    }

    if (seg.shape === 'ROUNDABOUT_RING') {
      this.buildRoundaboutVisuals(group, seg);
      return group;
    }

    if (seg.shape === 'CURVED' && seg.controlPoint) {
      this.buildCurvedRoadVisuals(group, seg);
      return group;
    }

    // Straight Road or Highway Merge
    this.buildStraightRoadVisuals(group, seg);
    return group;
  }

  private buildStraightRoadVisuals(
    group: THREE.Group,
    seg: RoadSegmentRecord
  ): void {
    const pStart = { ...this.world.grid.gridToWorld(seg.start.gx, seg.start.gz) };
    const pEnd = { ...this.world.grid.gridToWorld(seg.end.gx, seg.end.gz) };
    const cs = this.world.config.cellSize;

    // Trim visual endpoints of pre-placed roundabout approach roads right at the
    // multi-lane roundabout ring boundary so straight lane markings never bleed into the ring!
    const rbCentral = this.world.roads.getRoundabout();
    const rbHwy = this.world.roads.getHighwayInterchangeRoundabout();
    const hw = this.world.roads.getHighway();
    const cCentral = this.world.grid.gridToWorld(
      rbCentral.center.gx,
      rbCentral.center.gz
    );
    const cHwy = this.world.grid.gridToWorld(
      (hw.startX + hw.endX) * 0.5,
      rbHwy.center.gz
    );
    const trimCentral = rbCentral.outerRadiusMeters + 0.15; // 10.75m
    const trimHwy = rbHwy.outerRadiusMeters + 0.15; // 13.55m

    if (seg.id === 'road-east-highway-merge') {
      pStart.x = cCentral.x + trimCentral + cs * 0.5;
      pEnd.x = cHwy.x - trimHwy - cs * 0.5;
    } else if (seg.id === 'road-airport-city-connector') {
      pStart.x = cHwy.x + trimHwy + cs * 0.5;
    } else if (seg.id === 'road-city-west-approach') {
      pEnd.x = cCentral.x - trimCentral - cs * 0.5;
    } else if (seg.id === 'road-city-north-approach') {
      pEnd.z = cCentral.z - trimCentral - cs * 0.5;
    } else if (seg.id === 'road-city-south-approach') {
      pStart.z = cCentral.z + trimCentral + cs * 0.5;
    }

    const dx = pEnd.x - pStart.x;
    const dz = pEnd.z - pStart.z;
    const length = Math.max(2.0, Math.hypot(dx, dz) + cs);
    const angle = Math.atan2(dx, dz);
    const midX = (pStart.x + pEnd.x) * 0.5;
    const midZ = (pStart.z + pEnd.z) * 0.5;
    const roadWidth = seg.spec.worldWidth;

    // Sample maximum underlying terrain elevation so perimeter roads around the Airport (elev 1.40)
    // and inland roads (elev 1.20) always sit cleanly at terrainElev + 0.04 without Z-fighting!
    let maxTerrainElev = Math.max(
      1.2,
      this.world.terrainWater.getElevationAtGrid(seg.start.gx, seg.start.gz) ?? 1.2,
      this.world.terrainWater.getElevationAtGrid(seg.end.gx, seg.end.gz) ?? 1.2
    );
    for (const c of seg.coveredCells) {
      const cellElev = this.world.terrainWater.getElevationAtGrid(c.gx, c.gz) ?? 1.2;
      if (cellElev > maxTerrainElev) maxTerrainElev = cellElev;
    }
    const yBase = maxTerrainElev;

    const roadContainer = new THREE.Group();
    roadContainer.position.set(midX, yBase, midZ);
    roadContainer.rotation.y = angle;

    // 1. Uniform dark charcoal asphalt bed (top surface strictly at Y = +0.04) + curbstones (top at Y = +0.034)
    const curbGeo = new THREE.BoxGeometry(roadWidth + 0.32, 0.034, length);
    const curbMesh = new THREE.Mesh(curbGeo, this.materials.curbstone);
    curbMesh.position.y = 0.017;
    roadContainer.add(curbMesh);

    const bedGeo = new THREE.BoxGeometry(roadWidth, 0.04, length);
    const bedMesh = new THREE.Mesh(bedGeo, this.materials.asphalt);
    bedMesh.position.y = 0.02;
    roadContainer.add(bedMesh);

    // 2. White Road Markings (Top surface at Y = +0.05 above terrain)
    const markY = 0.046;
    const lineThickness = 0.09;

    // Center divider line
    const centerGeo = new THREE.BoxGeometry(lineThickness, 0.01, length - 0.2);
    const centerLine = new THREE.Mesh(centerGeo, this.materials.whiteLine);
    centerLine.position.set(0, markY, 0);
    roadContainer.add(centerLine);

    // White outer edge lines
    const edgeOffset = roadWidth * 0.5 - 0.14;
    for (const side of [-1, 1]) {
      const edgeGeo = new THREE.BoxGeometry(lineThickness, 0.01, length - 0.2);
      const edgeMesh = new THREE.Mesh(edgeGeo, this.materials.whiteLine);
      edgeMesh.position.set(side * edgeOffset, markY, 0);
      roadContainer.add(edgeMesh);
    }

    // Internal dashed lane separators per carriageway (0 for 1x1, 1 for 2x2, 2 for 3x3)
    const dashesPerSide = seg.spec.dashedSeparatorsPerCarriageway;
    if (dashesPerSide > 0) {
      const halfRoad = roadWidth * 0.5;
      const laneW = halfRoad / seg.spec.lanesPerDirection;
      const dashLen = 1.1;
      const gapLen = 1.1;
      const stride = dashLen + gapLen;
      const dashCount = Math.max(1, Math.floor((length - 1.0) / stride));

      for (const side of [-1, 1]) {
        for (let dIdx = 1; dIdx <= dashesPerSide; dIdx++) {
          const xOff = side * dIdx * laneW;
          for (let k = 0; k < dashCount; k++) {
            const zPos = -length * 0.5 + 1.0 + k * stride + dashLen * 0.5;
            const dashGeo = new THREE.BoxGeometry(0.07, 0.01, dashLen);
            const dashMesh = new THREE.Mesh(dashGeo, this.materials.whiteLine);
            dashMesh.position.set(xOff, markY, zPos);
            roadContainer.add(dashMesh);
          }
        }
      }
    }

    // Multi-lane Highway-City Connector median divider & entry/exit flares if HIGHWAY_MERGE
    if (seg.shape === 'HIGHWAY_MERGE') {
      const medianLen = Math.max(4.0, length - 14.0);
      const artMedian = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.14, medianLen),
        this.materials.curbstone
      );
      artMedian.position.set(0, 0.08, 0);
      roadContainer.add(artMedian);

      const artMedianStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.02, medianLen - 0.6),
        this.materials.safetyYellow
      );
      artMedianStripe.position.set(0, 0.155, 0);
      roadContainer.add(artMedianStripe);

      for (const endSign of [-1, 1]) {
        const noseCap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.22, 0.15, 12),
          this.materials.safetyYellow
        );
        noseCap.position.set(0, 0.085, endSign * (medianLen * 0.5 + 0.1));
        roadContainer.add(noseCap);
      }

      // Roadside wayfinding gantries on the rebuilt Roundabout-to-Airport Access Corridor
      if (seg.id === 'road-airport-city-connector') {
        for (const zSignOff of [-length * 0.28, length * 0.28]) {
          const signPost = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8),
            this.materials.accentSteel
          );
          signPost.position.set(roadWidth * 0.5 + 0.85, 1.1, zSignOff);
          roadContainer.add(signPost);

          const signBoard = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 0.58, 0.1),
            new THREE.MeshStandardMaterial({
              color: 0x065f46,
              roughness: 0.4,
              metalness: 0.15,
            })
          );
          signBoard.position.set(roadWidth * 0.5 + 0.85, 2.05, zSignOff);
          roadContainer.add(signBoard);
        }
      }
    }

    group.add(roadContainer);
  }

  /**
   * Builds smooth curved road geometry and continuous curved lane markings without inner-edge spikes.
   */
  private buildCurvedRoadVisuals(
    group: THREE.Group,
    seg: RoadSegmentRecord
  ): void {
    const p0 = this.world.grid.gridToWorld(seg.start.gx, seg.start.gz);
    const p1 = this.world.grid.gridToWorld(
      seg.controlPoint!.gx,
      seg.controlPoint!.gz
    );
    const p2 = this.world.grid.gridToWorld(seg.end.gx, seg.end.gz);

    let curveElev = Math.max(
      1.2,
      this.world.terrainWater.getElevationAtGrid(seg.start.gx, seg.start.gz) ?? 1.2,
      this.world.terrainWater.getElevationAtGrid(seg.end.gx, seg.end.gz) ?? 1.2
    );
    for (const c of seg.coveredCells) {
      const ce = this.world.terrainWater.getElevationAtGrid(c.gx, c.gz) ?? 1.2;
      if (ce > curveElev) curveElev = ce;
    }
    const curveY = curveElev + 0.03;

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(p0.x, curveY, p0.z),
      new THREE.Vector3(p1.x, curveY, p1.z),
      new THREE.Vector3(p2.x, curveY, p2.z)
    );

    const roadWidth = seg.spec.worldWidth;
    const segments = 36;

    // Helper to build a flat ribbon strip along the curve at a lateral offset
    const buildRibbon = (
      halfWidth: number,
      lateralOffset: number,
      yOffset: number,
      material: THREE.Material
    ) => {
      const positions = new Float32Array((segments + 1) * 2 * 3);
      const indices: number[] = [];

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pt = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        const normalX = -tangent.z;
        const normalZ = tangent.x;

        const leftX = pt.x + normalX * (lateralOffset - halfWidth);
        const leftZ = pt.z + normalZ * (lateralOffset - halfWidth);
        const rightX = pt.x + normalX * (lateralOffset + halfWidth);
        const rightZ = pt.z + normalZ * (lateralOffset + halfWidth);

        const base = i * 6;
        positions[base] = leftX;
        positions[base + 1] = pt.y + yOffset;
        positions[base + 2] = leftZ;

        positions[base + 3] = rightX;
        positions[base + 4] = pt.y + yOffset;
        positions[base + 5] = rightZ;

        if (i < segments) {
          const row = i * 2;
          indices.push(row, row + 1, row + 2, row + 1, row + 3, row + 2);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, material);
    };

    // Curb + Asphalt Ribbon
    group.add(buildRibbon(roadWidth * 0.5 + 0.16, 0, -0.01, this.materials.curbstone));
    group.add(buildRibbon(roadWidth * 0.5, 0, 0.01, this.materials.asphalt));

    // Center divider & Outer edge ribbons
    group.add(buildRibbon(0.05, 0, 0.025, this.materials.whiteLine));
    const edgeOff = roadWidth * 0.5 - 0.14;
    group.add(buildRibbon(0.05, -edgeOff, 0.025, this.materials.whiteLine));
    group.add(buildRibbon(0.05, edgeOff, 0.025, this.materials.whiteLine));

    // Internal lane separator ribbons for 2x2 and 3x3 curves
    const dashes = seg.spec.dashedSeparatorsPerCarriageway;
    if (dashes > 0) {
      const laneW = (roadWidth * 0.5) / seg.spec.lanesPerDirection;
      for (const side of [-1, 1]) {
        for (let dIdx = 1; dIdx <= dashes; dIdx++) {
          group.add(
            buildRibbon(
              0.035,
              side * dIdx * laneW,
              0.025,
              this.materials.whiteLine
            )
          );
        }
      }
    }
  }

  /**
   * Builds a 3D Roadside Yield (Give Way) Sign Post with galvanized steel pole,
   * concrete base footing, and an inverted equilateral red-bordered white triangle sign plate
   * facing oncoming entry traffic (+Z in approach local coordinates).
   */
  private createYieldSignPostMesh(): THREE.Group {
    const signGroup = new THREE.Group();
    signGroup.name = 'yield-sign-post';

    const footing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.12, 10),
      this.materials.concrete
    );
    footing.position.y = 0.06;
    signGroup.add(footing);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.046, 1.55, 10),
      this.materials.accentSteel
    );
    pole.position.y = 0.82;
    pole.castShadow = true;
    signGroup.add(pole);

    // Inverted Equilateral Triangle Sign Plate (Red border + White interior, apex pointing DOWN)
    const yieldRedMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.32,
      metalness: 0.08,
    });
    const backPlateMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.5,
      metalness: 0.4,
    });

    const triPlateHolder = new THREE.Group();
    triPlateHolder.position.set(0, 1.48, 0.05);

    const backTri = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.028, 3),
      backPlateMat
    );
    backTri.rotation.x = Math.PI * 0.5;
    backTri.rotation.y = Math.PI; // Apex pointing strictly downward (-Y)
    triPlateHolder.add(backTri);

    const outerRedTri = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.032, 3),
      yieldRedMat
    );
    outerRedTri.rotation.x = Math.PI * 0.5;
    outerRedTri.rotation.y = Math.PI;
    outerRedTri.position.z = 0.008;
    triPlateHolder.add(outerRedTri);

    const innerWhiteTri = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.036, 3),
      this.materials.whiteLine
    );
    innerWhiteTri.rotation.x = Math.PI * 0.5;
    innerWhiteTri.rotation.y = Math.PI;
    innerWhiteTri.position.z = 0.014;
    triPlateHolder.add(innerWhiteTri);

    signGroup.add(triPlateHolder);
    return signGroup;
  }

  /**
   * Builds a 3D Multi-Lane Roundabout Interchange for both the Highway-City Interchange
   * (`roundabout-highway-interchange` at gx=143.5, gz=55) and the Central City Roundabout
   * (`roundabout-central` at gx=86, gz=55), complete with:
   * - 3 concentric circulating lanes with 2 dashed white lane-separator rings and directional lane arrows,
   * - Realistic flared entry/exit slip-lane tapers on all 4 cardinal legs,
   * - Raised concrete teardrop/triangular channelizing splitter islands with painted gore chevrons & Keep-Right signs,
   * - Crisp shark-tooth white yield line triangles across all entry lanes, and
   * - Roadside 3D Red-and-White Inverted-Triangle Yield (Give Way) Signs on both sides of every entry throat.
   */
  private buildRoundaboutVisuals(
    group: THREE.Group,
    seg?: RoadSegmentRecord
  ): void {
    const isHighwayInterchange =
      seg?.id === 'roundabout-highway-interchange';
    const rb = isHighwayInterchange
      ? this.world.roads.getHighwayInterchangeRoundabout()
      : this.world.roads.getRoundabout();
    const hw = this.world.roads.getHighway();
    const centerWorld = isHighwayInterchange
      ? this.world.grid.gridToWorld((hw.startX + hw.endX) * 0.5, rb.center.gz)
      : this.world.grid.gridToWorld(rb.center.gx, rb.center.gz);

    const innerR = rb.innerRadiusMeters; // 5.6m for highway interchange, 4.0m for central
    const outerR = rb.outerRadiusMeters; // 13.4m for highway interchange, 10.6m for central
    const ringWidth = outerR - innerR; // 7.8m (3x 2.6m lanes) or 6.6m (3x 2.2m lanes)
    const laneWidth = ringWidth / 3;
    const rSep1 = innerR + laneWidth;
    const rSep2 = innerR + laneWidth * 2;
    const yBase = isHighwayInterchange ? 1.255 : 1.25;

    // 1. High-Smoothness 72-Segment Outer & Inner Curbstones + Semi-Mountable Truck Apron
    const outerCurbGeo = new THREE.RingGeometry(
      innerR - 0.36,
      outerR + 0.42,
      72
    );
    outerCurbGeo.rotateX(-Math.PI / 2);
    const outerCurb = new THREE.Mesh(outerCurbGeo, this.materials.curbstone);
    outerCurb.position.set(centerWorld.x, yBase - 0.008, centerWorld.z);
    group.add(outerCurb);

    // Textured brick/stone truck apron bordering the central island
    const apronMat = new THREE.MeshStandardMaterial({
      color: 0x7c2d12,
      roughness: 0.78,
      metalness: 0.08,
    });
    const truckApronGeo = new THREE.RingGeometry(
      innerR - 0.05,
      innerR + 0.55,
      72
    );
    truckApronGeo.rotateX(-Math.PI / 2);
    const truckApron = new THREE.Mesh(truckApronGeo, apronMat);
    truckApron.position.set(centerWorld.x, yBase + 0.018, centerWorld.z);
    group.add(truckApron);

    // 2. Smooth 3-Lane Circulating Asphalt Carriageway
    const ringGeo = new THREE.RingGeometry(innerR + 0.45, outerR, 72);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMesh = new THREE.Mesh(ringGeo, this.materials.asphalt);
    ringMesh.position.set(centerWorld.x, yBase + 0.012, centerWorld.z);
    group.add(ringMesh);

    // 3. Solid Inner & Outer White Edge Rings + 2 Concentric Dashed Multi-Lane Separator Rings (3 Lanes)
    for (const rEdge of [innerR + 0.56, outerR - 0.18]) {
      const edgeRingGeo = new THREE.RingGeometry(
        rEdge - 0.06,
        rEdge + 0.06,
        72
      );
      edgeRingGeo.rotateX(-Math.PI / 2);
      const edgeRing = new THREE.Mesh(edgeRingGeo, this.materials.whiteLine);
      edgeRing.position.set(centerWorld.x, yBase + 0.026, centerWorld.z);
      group.add(edgeRing);
    }

    const segCount = isHighwayInterchange ? 48 : 36;
    for (const rSep of [rSep1, rSep2]) {
      for (let i = 0; i < segCount; i += 2) {
        const startAngle = (i / segCount) * Math.PI * 2;
        const arcLen = (0.95 / segCount) * Math.PI * 2;
        const dashRingGeo = new THREE.RingGeometry(
          rSep - 0.05,
          rSep + 0.05,
          8,
          1,
          startAngle,
          arcLen
        );
        dashRingGeo.rotateX(-Math.PI / 2);
        const dashMesh = new THREE.Mesh(dashRingGeo, this.materials.whiteLine);
        dashMesh.position.set(centerWorld.x, yBase + 0.027, centerWorld.z);
        group.add(dashMesh);
      }
    }

    // 4. Circulating Lane Directional Arrows (8 angular stations around the 3 lanes)
    const laneRadii = [
      innerR + laneWidth * 0.52,
      innerR + laneWidth * 1.5,
      innerR + laneWidth * 2.48,
    ];
    for (let aIdx = 0; aIdx < 8; aIdx++) {
      const theta = aIdx * (Math.PI * 0.25) + Math.PI * 0.125;
      for (const rLane of laneRadii) {
        const arrowGroup = new THREE.Group();
        const ax = centerWorld.x + Math.sin(theta) * rLane;
        const az = centerWorld.z + Math.cos(theta) * rLane;
        arrowGroup.position.set(ax, yBase + 0.028, az);
        // Tangent counter-clockwise direction
        arrowGroup.rotation.y = theta + Math.PI * 0.5;

        const shaft = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 0.008, 0.72),
          this.materials.whiteLine
        );
        shaft.position.z = -0.15;
        arrowGroup.add(shaft);

        const head = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 0.42, 3),
          this.materials.whiteLine
        );
        head.rotation.x = Math.PI * 0.5;
        head.position.z = 0.32;
        arrowGroup.add(head);

        group.add(arrowGroup);
      }
    }

    // 5. Realistic Flared Entry & Exit Tapers, Raised Channelizing Splitter Islands,
    //    Shark-Tooth Yield Lines, and 3D Roadside Yield Signage on All 4 Cardinal Approaches
    const keepRightBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.35,
      metalness: 0.1,
    });
    const chevronBoardBlackMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.6,
    });

    for (let dirIdx = 0; dirIdx < 4; dirIdx++) {
      const angle = dirIdx * Math.PI * 0.5;
      const appGroup = new THREE.Group();
      appGroup.position.set(centerWorld.x, yBase, centerWorld.z);
      appGroup.rotation.y = angle;

      // Determine approach width & taper length based on whether this leg is the 10-lane highway
      // (dirIdx 0=South, 2=North on highway interchange), the 6-lane 3x3 highway-city arterial
      // (dirIdx 3=West on highway interchange, dirIdx 1=East on central roundabout), or a 4-lane 2x2 road
      const isNorthSouthHighwayLeg =
        isHighwayInterchange && (dirIdx === 0 || dirIdx === 2);
      const isSixLaneArterialLeg =
        (isHighwayInterchange && dirIdx === 3) ||
        (!isHighwayInterchange && dirIdx === 1);

      const throatHalfW = isNorthSouthHighwayLeg
        ? 12.0
        : isSixLaneArterialLeg
          ? 3.0
          : 2.0;
      const flareRingHalfW = isNorthSouthHighwayLeg
        ? 12.9
        : isSixLaneArterialLeg
          ? 5.6
          : 4.2;
      const taperLen = isHighwayInterchange ? 6.6 : 5.2;
      const zRingJoin = Math.sqrt(
        Math.max(
          (innerR + 1.2) ** 2,
          outerR * outerR - flareRingHalfW * flareRingHalfW
        )
      ) - 0.35;
      const zFar = outerR + taperLen;

      // 5a. Custom Trapezoidal Flared Curbstone & Asphalt Entry/Exit Taper Apron
      // Note: Shape(x, -z) rotated by rotateX(-Math.PI * 0.5) maps (x, y, 0) -> (x, 0, -y) = (x, 0, z)
      // with its front-face normal pointing strictly UPWARD (+Y)!
      const curbShape = new THREE.Shape();
      curbShape.moveTo(-flareRingHalfW - 0.34, -zRingJoin);
      curbShape.lineTo(flareRingHalfW + 0.34, -zRingJoin);
      curbShape.lineTo(throatHalfW + 0.34, -zFar);
      curbShape.lineTo(-throatHalfW - 0.34, -zFar);
      curbShape.closePath();
      const curbTaperGeo = new THREE.ShapeGeometry(curbShape);
      curbTaperGeo.rotateX(-Math.PI * 0.5);
      const curbTaperMesh = new THREE.Mesh(
        curbTaperGeo,
        this.materials.curbstone
      );
      curbTaperMesh.position.y = -0.005;
      appGroup.add(curbTaperMesh);

      const asphaltShape = new THREE.Shape();
      asphaltShape.moveTo(-flareRingHalfW, -(zRingJoin - 0.15));
      asphaltShape.lineTo(flareRingHalfW, -(zRingJoin - 0.15));
      asphaltShape.lineTo(throatHalfW, -zFar);
      asphaltShape.lineTo(-throatHalfW, -zFar);
      asphaltShape.closePath();
      const asphaltTaperGeo = new THREE.ShapeGeometry(asphaltShape);
      asphaltTaperGeo.rotateX(-Math.PI * 0.5);
      const asphaltTaperMesh = new THREE.Mesh(
        asphaltTaperGeo,
        this.materials.asphalt
      );
      asphaltTaperMesh.position.y = 0.011;
      appGroup.add(asphaltTaperMesh);

      // Flared white outer edge lines along both entry (+X) and exit (-X) tapers
      const zRingOuterEdge = Math.sqrt(
        Math.max(
          (innerR + 1.5) ** 2,
          outerR * outerR - (flareRingHalfW - 0.18) ** 2
        )
      );
      for (const side of [-1, 1]) {
        const x0 = side * (flareRingHalfW - 0.18);
        const z0 = zRingOuterEdge;
        const x1 = side * (throatHalfW - 0.15);
        const z1 = zFar - 0.1;
        const segDx = x1 - x0;
        const segDz = z1 - z0;
        const segLen = Math.hypot(segDx, segDz);
        const edgeFlare = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 0.01, segLen),
          this.materials.whiteLine
        );
        edgeFlare.position.set(
          (x0 + x1) * 0.5,
          0.026,
          (z0 + z1) * 0.5
        );
        edgeFlare.rotation.y = Math.atan2(segDx, segDz);
        appGroup.add(edgeFlare);
      }

      // Flared dashed entry and exit lane separator lines guiding traffic into/out of the roundabout lanes
      const lanesPerSide = isNorthSouthHighwayLeg
        ? 4
        : isSixLaneArterialLeg
          ? 3
          : 2;
      const islandW = isNorthSouthHighwayLeg
        ? 1.5
        : isSixLaneArterialLeg
          ? 1.1
          : 0.85;
      for (const side of [-1, 1]) {
        for (let lIdx = 1; lIdx < lanesPerSide; lIdx++) {
          const frac = lIdx / lanesPerSide;
          const xRing =
            side *
            (islandW * 0.5 +
              0.2 +
              frac * (flareRingHalfW - islandW * 0.5 - 0.35));
          const xThroat =
            side *
            (islandW * 0.22 +
              0.15 +
              frac * (throatHalfW - islandW * 0.22 - 0.25));
          const zStart = Math.sqrt(
            Math.max((outerR - 1.5) ** 2, outerR * outerR - xRing * xRing)
          );
          const spanZ = Math.max(1.8, zFar - 0.3 - zStart);
          for (let dStep = 0; dStep < 3; dStep++) {
            const t = (dStep + 0.35) / 3.1;
            const lx = xRing + (xThroat - xRing) * t;
            const lz = zStart + 0.25 + t * spanZ;
            const laneDash = new THREE.Mesh(
              new THREE.BoxGeometry(0.08, 0.01, 0.88),
              this.materials.whiteLine
            );
            laneDash.position.set(lx, 0.027, lz);
            laneDash.rotation.y = Math.atan2(xThroat - xRing, spanZ);
            appGroup.add(laneDash);
          }
        }
      }

      // 5b. Raised Concrete Teardrop / Triangular Channelizing Splitter Island
      const islandLen = taperLen - 0.5;
      const islandShape = new THREE.Shape();
      islandShape.moveTo(-islandW * 0.5, -(outerR + 0.22));
      islandShape.lineTo(islandW * 0.5, -(outerR + 0.22));
      islandShape.lineTo(islandW * 0.22, -(outerR + islandLen));
      islandShape.lineTo(-islandW * 0.22, -(outerR + islandLen));
      islandShape.closePath();

      const splitterExtGeo = new THREE.ExtrudeGeometry(islandShape, {
        depth: 0.14,
        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.035,
        bevelSegments: 2,
      });
      splitterExtGeo.rotateX(-Math.PI * 0.5);
      const splitterMesh = new THREE.Mesh(
        splitterExtGeo,
        this.materials.curbstone
      );
      splitterMesh.position.y = 0.015;
      appGroup.add(splitterMesh);

      // Painted white gore boundary & diagonal chevrons on top of the splitter island
      for (let gIdx = 0; gIdx < 3; gIdx++) {
        const gz = outerR + 1.05 + gIdx * 1.15;
        for (const cSide of [-1, 1]) {
          const chevStripe = new THREE.Mesh(
            new THREE.BoxGeometry(islandW * 0.34, 0.012, 0.09),
            this.materials.whiteLine
          );
          chevStripe.position.set(cSide * (islandW * 0.18), 0.182, gz);
          chevStripe.rotation.y = cSide * 0.55;
          appGroup.add(chevStripe);
        }
      }

      // Yellow hazard nose bollard & Circular Blue/White "Keep Right" Regulatory Sign on Splitter Island Nose
      const splitterCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.34, 0.2, 16),
        this.materials.safetyYellow
      );
      splitterCap.position.set(0, 0.1, outerR + 0.18);
      appGroup.add(splitterCap);

      const keepRightPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8),
        this.materials.accentSteel
      );
      keepRightPole.position.set(0, 0.62, outerR + 0.34);
      appGroup.add(keepRightPole);

      const keepRightDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.03, 18),
        keepRightBlueMat
      );
      keepRightDisc.rotation.x = Math.PI * 0.5;
      keepRightDisc.position.set(0, 1.12, outerR + 0.37);
      appGroup.add(keepRightDisc);

      const keepRightArrow = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.06, 0.036),
        this.materials.whiteLine
      );
      keepRightArrow.position.set(0, 1.12, outerR + 0.375);
      keepRightArrow.rotation.z = -Math.PI * 0.22;
      appGroup.add(keepRightArrow);

      // 5c. Shark-Tooth White Yield Line Triangles Across All Entry Lanes (+X side of splitter island)
      const entrySpanStart = islandW * 0.5 + 0.32;
      const entrySpanEnd = flareRingHalfW - 0.35;
      const toothCount = isNorthSouthHighwayLeg
        ? 10
        : isSixLaneArterialLeg
          ? 6
          : 5;
      const toothSpacing =
        (entrySpanEnd - entrySpanStart) / Math.max(1, toothCount - 1);

      for (let tIdx = 0; tIdx < toothCount; tIdx++) {
        const tx = entrySpanStart + tIdx * toothSpacing;
        // Follow exact outerR curvature so every yield triangle sits cleanly along the outer ring edge
        const tz = Math.sqrt(
          Math.max((innerR + 1.5) ** 2, outerR * outerR - tx * tx)
        );
        const sharkTooth = new THREE.Mesh(
          new THREE.ConeGeometry(0.2, 0.42, 3),
          this.materials.whiteLine
        );
        // Point apex (+Z) toward approaching vehicles in the entry lane
        sharkTooth.rotation.x = Math.PI * 0.5;
        sharkTooth.position.set(tx, 0.028, tz + 0.12);
        appGroup.add(sharkTooth);
      }

      // 5d. Proper 3D Roadside Yield (Give Way) Sign Posts on Both Sides of the Entry Throat
      //     (1 on Right Entry Taper Curb Shoulder + 1 on Left Splitter Island for multi-lane visibility)
      const signT = 0.22;
      const rightCurbX =
        flareRingHalfW * (1 - signT) + throatHalfW * signT + 0.38;
      const rightCurbZ =
        zRingOuterEdge * (1 - signT) + zFar * signT;
      const rightYieldSign = this.createYieldSignPostMesh();
      rightYieldSign.position.set(rightCurbX, 0, rightCurbZ);
      rightYieldSign.rotation.y = -0.16; // Angled slightly toward approaching drivers
      appGroup.add(rightYieldSign);

      const splitterYieldSign = this.createYieldSignPostMesh();
      splitterYieldSign.position.set(
        islandW * 0.28,
        0.16,
        outerR + 1.15
      );
      splitterYieldSign.rotation.y = 0.12;
      appGroup.add(splitterYieldSign);

      // 5e. Central Island Roundabout Directional Chevron Sign Board facing this entry approach
      const chevronBoardGroup = new THREE.Group();
      chevronBoardGroup.position.set(
        Math.min(1.8, innerR * 0.36),
        0.28,
        innerR - 0.18
      );
      chevronBoardGroup.rotation.y = -0.22;

      for (const pOff of [-0.55, 0.55]) {
        const cPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8),
          this.materials.accentSteel
        );
        cPost.position.set(pOff, 0.42, 0);
        chevronBoardGroup.add(cPost);
      }

      const cBoard = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.44, 0.05),
        chevronBoardBlackMat
      );
      cBoard.position.set(0, 0.78, 0.03);
      chevronBoardGroup.add(cBoard);

      for (const cxOff of [-0.45, 0, 0.45]) {
        const yChev = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.24, 3),
          this.materials.safetyYellow
        );
        yChev.rotation.z = -Math.PI * 0.5; // Pointing right (counter-clockwise circulation)
        yChev.position.set(cxOff, 0.78, 0.06);
        chevronBoardGroup.add(yChev);
      }

      appGroup.add(chevronBoardGroup);
      group.add(appGroup);
    }

    // 5b. Inter-Approach Outer Perimeter Safety Barriers & Reflector Bollards along the 4 Diagonal Quadrants
    for (let q = 0; q < 4; q++) {
      const diagAngle = (q + 0.5) * Math.PI * 0.5;
      const barrierR = outerR + 0.58;
      const bx = centerWorld.x + Math.cos(diagAngle) * barrierR;
      const bz = centerWorld.z + Math.sin(diagAngle) * barrierR;

      const barrierGroup = new THREE.Group();
      barrierGroup.position.set(bx, yBase, bz);
      barrierGroup.rotation.y = -diagAngle + Math.PI * 0.5;

      const railBeam = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.22, 0.14),
        this.materials.accentSteel
      );
      railBeam.position.set(0, 0.44, 0);
      barrierGroup.add(railBeam);

      for (const postOff of [-1.1, 0, 1.1]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.07, 0.58, 8),
          this.materials.accentSteel
        );
        post.position.set(postOff, 0.29, 0);
        barrierGroup.add(post);

        const refl = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.1, 0.16),
          this.materials.safetyYellow
        );
        refl.position.set(postOff, 0.46, 0);
        barrierGroup.add(refl);
      }
      group.add(barrierGroup);
    }

    // 6. Landscaped Central Island with Tiered Greenery, High-Mast Luminaires, Monument Plinth & Architectural Spire
    const curbRimGeo = new THREE.CylinderGeometry(
      innerR + 0.04,
      innerR + 0.1,
      0.3,
      64
    );
    const curbRim = new THREE.Mesh(curbRimGeo, this.materials.concrete);
    curbRim.position.set(centerWorld.x, yBase + 0.13, centerWorld.z);
    group.add(curbRim);

    const islandGeo = new THREE.CylinderGeometry(
      innerR - 0.22,
      innerR - 0.08,
      0.38,
      64
    );
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0x3f6a3e,
      roughness: 0.85,
    });
    const islandMesh = new THREE.Mesh(islandGeo, islandMat);
    islandMesh.position.set(centerWorld.x, yBase + 0.18, centerWorld.z);
    group.add(islandMesh);

    // Ornamental shrubbery ring around central monument
    const hedgeRing = new THREE.Mesh(
      new THREE.TorusGeometry(innerR * 0.62, 0.32, 12, 40),
      new THREE.MeshStandardMaterial({ color: 0x2d5432, roughness: 0.88 })
    );
    hedgeRing.rotation.x = Math.PI * 0.5;
    hedgeRing.position.set(centerWorld.x, yBase + 0.42, centerWorld.z);
    group.add(hedgeRing);

    // 4 High-Mast Roundabout Luminaires around the Central Island Perimeter
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfde68a,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    });
    for (let lIdx = 0; lIdx < 4; lIdx++) {
      const lAngle = (lIdx + 0.5) * Math.PI * 0.5;
      const lampR = innerR * 0.76;
      const lx = centerWorld.x + Math.cos(lAngle) * lampR;
      const lz = centerWorld.z + Math.sin(lAngle) * lampR;

      const poleGroup = new THREE.Group();
      poleGroup.position.set(lx, yBase + 0.35, lz);
      poleGroup.rotation.y = -lAngle;

      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.09, 3.6, 8),
        this.materials.accentSteel
      );
      mast.position.y = 1.8;
      poleGroup.add(mast);

      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.06, 0.06),
        this.materials.accentSteel
      );
      arm.position.set(0.38, 3.55, 0);
      poleGroup.add(arm);

      const luminaire = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.08, 0.18),
        lampMat
      );
      luminaire.position.set(0.72, 3.5, 0);
      poleGroup.add(luminaire);

      group.add(poleGroup);
    }

    const plinthScale = isHighwayInterchange ? 1.35 : 1.0;
    const plinthGeo = new THREE.CylinderGeometry(
      1.25 * plinthScale,
      1.55 * plinthScale,
      0.68,
      28
    );
    const plinthMesh = new THREE.Mesh(plinthGeo, this.materials.concrete);
    plinthMesh.position.set(centerWorld.x, yBase + 0.64, centerWorld.z);
    group.add(plinthMesh);

    const spireGeo = new THREE.ConeGeometry(
      0.78 * plinthScale,
      3.5 * plinthScale,
      16
    );
    const spireMesh = new THREE.Mesh(spireGeo, this.materials.cityGlass);
    spireMesh.position.set(
      centerWorld.x,
      yBase + 0.95 + 1.75 * plinthScale,
      centerWorld.z
    );
    group.add(spireMesh);
  }

  /**
   * Builds the Extreme-Right 10-Lane Highway (8 main lanes + 2 service-road lanes)
   * integrated cleanly with the Multi-Lane Highway-City Interchange Roundabout at mergeRowZ (gz=55).
   */
  private buildHighwayVisuals(group: THREE.Group): void {
    const hw = this.world.roads.getHighway();
    const pStart = this.world.grid.gridToWorld(
      (hw.startX + hw.endX) * 0.5,
      hw.visibleStartZ
    );
    const pEnd = this.world.grid.gridToWorld(
      (hw.startX + hw.endX) * 0.5,
      hw.visibleEndZ
    );
    const cs = this.world.config.cellSize;

    const totalWorldW = (hw.endX - hw.startX + 1) * cs; // 12 * 2 = 24.0 world units
    const length = Math.abs(pEnd.z - pStart.z) + cs;
    const midX = pStart.x;
    const midZ = (pStart.z + pEnd.z) * 0.5;
    const yBase = 1.24;

    const hwContainer = new THREE.Group();
    hwContainer.position.set(midX, yBase, midZ);

    // Compute local Z of the Highway-City Interchange Roundabout center (gz=55)
    // and leave a clean opening so the multi-lane roundabout ring, entry/exit tapers,
    // and splitter islands sit cleanly in the center of the interchange!
    const mergeLocalZ =
      this.world.grid.gridToWorld(hw.startX, this.world.config.highway.mergeRowZ)
        .z - midZ;
    const deckHalfGap = 12.6;
    const northDeckLen = Math.max(
      2.0,
      length * 0.5 + mergeLocalZ - deckHalfGap
    );
    const southDeckLen = Math.max(
      2.0,
      length * 0.5 - mergeLocalZ - deckHalfGap
    );
    const northDeckMidZ = -length * 0.5 + northDeckLen * 0.5;
    const southDeckMidZ = length * 0.5 - southDeckLen * 0.5;

    // 1. Concrete Foundation, Graded Outer Shoulders & Uniform Dark Charcoal Asphalt Deck on North & South Highway Legs
    for (const dLeg of [
      { len: northDeckLen, z: northDeckMidZ },
      { len: southDeckLen, z: southDeckMidZ },
    ]) {
      const baseGeo = new THREE.BoxGeometry(totalWorldW + 1.4, 0.06, dLeg.len);
      const baseMesh = new THREE.Mesh(baseGeo, this.materials.curbstone);
      baseMesh.position.z = dLeg.z;
      hwContainer.add(baseMesh);

      const asphaltGeo = new THREE.BoxGeometry(totalWorldW, 0.08, dLeg.len);
      const asphaltMesh = new THREE.Mesh(asphaltGeo, this.materials.asphalt);
      asphaltMesh.position.set(0, 0.02, dLeg.z);
      hwContainer.add(asphaltMesh);
    }

    const interchangeHalfGap = 18.0;
    const northLegLen = Math.max(
      2.0,
      length * 0.5 + mergeLocalZ - interchangeHalfGap
    );
    const southLegLen = Math.max(
      2.0,
      length * 0.5 - mergeLocalZ - interchangeHalfGap
    );
    const northLegMidZ = -length * 0.5 + northLegLen * 0.5;
    const southLegMidZ = length * 0.5 - southLegLen * 0.5;

    // 2. Central Concrete Jersey Barrier Median & Dual-Arm High-Mast Freeway Luminaires on North and South Highway Legs
    const hwLampMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfde68a,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    });
    for (const leg of [
      { len: northLegLen, z: northLegMidZ, startZ: -length * 0.5 },
      {
        len: southLegLen,
        z: southLegMidZ,
        startZ: mergeLocalZ + interchangeHalfGap,
      },
    ]) {
      const medianGeo = new THREE.BoxGeometry(0.48, 0.42, leg.len);
      const medianMesh = new THREE.Mesh(medianGeo, this.materials.concrete);
      medianMesh.position.set(0, 0.24, leg.z);
      hwContainer.add(medianMesh);

      const medianCap = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.05, Math.max(1.0, leg.len - 0.4)),
        this.materials.safetyYellow
      );
      medianCap.position.set(0, 0.46, leg.z);
      hwContainer.add(medianCap);

      // Dual-arm high-mast LED freeway streetlights spaced along the Jersey barrier
      const lightSpacing = 14.0;
      const lightCount = Math.max(1, Math.floor((leg.len - 4.0) / lightSpacing));
      for (let li = 0; li < lightCount; li++) {
        const lz = leg.startZ + 4.5 + li * lightSpacing;
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.1, 4.4, 8),
          this.materials.accentSteel
        );
        mast.position.set(0, 2.4, lz);
        hwContainer.add(mast);

        const crossArm = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 0.07, 0.07),
          this.materials.accentSteel
        );
        crossArm.position.set(0, 4.55, lz);
        hwContainer.add(crossArm);

        for (const armSide of [-1, 1]) {
          const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.08, 0.2),
            hwLampMat
          );
          head.position.set(armSide * 1.15, 4.5, lz);
          hwContainer.add(head);
        }
      }
    }

    // 3. Separators between the 8 Main Lanes and the 2 Outer Service-Road Lanes, W-Beam Guardrails & Lane Markings
    const mainHalfW = 8.4; // 4 lanes * 2.1m each per direction
    const serviceSeparatorX = mainHalfW;
    const laneW = mainHalfW / 4;
    const dashLen = 1.6;
    const stride = 3.4;

    for (const side of [-1, 1]) {
      for (const leg of [
        { len: northLegLen, z: northLegMidZ, startZ: -length * 0.5 },
        {
          len: southLegLen,
          z: southLegMidZ,
          startZ: mergeLocalZ + interchangeHalfGap,
        },
      ]) {
        const sepGeo = new THREE.BoxGeometry(0.24, 0.16, leg.len);
        const sepMesh = new THREE.Mesh(sepGeo, this.materials.curbstone);
        sepMesh.position.set(side * serviceSeparatorX, 0.1, leg.z);
        hwContainer.add(sepMesh);

        // Continuous Steel W-Beam Outer Freeway Guardrail & Reflector Posts
        const guardrailX = side * (totalWorldW * 0.5 + 0.36);
        const wBeam = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.22, Math.max(1.0, leg.len - 0.5)),
          this.materials.accentSteel
        );
        wBeam.position.set(guardrailX, 0.36, leg.z);
        hwContainer.add(wBeam);

        const postStep = 4.5;
        const postCount = Math.floor((leg.len - 1.0) / postStep);
        for (let pi = 0; pi <= postCount; pi++) {
          const pz = leg.startZ + 0.8 + pi * postStep;
          const gPost = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.46, 0.1),
            this.materials.accentSteel
          );
          gPost.position.set(guardrailX, 0.23, pz);
          hwContainer.add(gPost);

          const reflTab = new THREE.Mesh(
            new THREE.BoxGeometry(0.13, 0.08, 0.12),
            side < 0 ? this.materials.safetyYellow : this.materials.whiteLine
          );
          reflTab.position.set(guardrailX, 0.42, pz);
          hwContainer.add(reflTab);
        }

        const outerEdgeGeo = new THREE.BoxGeometry(
          0.1,
          0.01,
          Math.max(1.0, leg.len - 0.3)
        );
        const outerEdge = new THREE.Mesh(
          outerEdgeGeo,
          this.materials.whiteLine
        );
        outerEdge.position.set(
          side * (totalWorldW * 0.5 - 0.2),
          0.068,
          leg.z
        );
        hwContainer.add(outerEdge);

        const dashCount = Math.floor((leg.len - 1.5) / stride);
        for (let l = 1; l <= 3; l++) {
          const xOff = side * l * laneW;
          for (let k = 0; k < dashCount; k++) {
            const zPos = leg.startZ + 1.2 + k * stride;
            const dGeo = new THREE.BoxGeometry(0.08, 0.01, dashLen);
            const dMesh = new THREE.Mesh(dGeo, this.materials.whiteLine);
            dMesh.position.set(xOff, 0.068, zPos);
            hwContainer.add(dMesh);
          }
        }

        // Painted Directional Pavement Arrows on Main Lanes approaching the Interchange
        const arrowZ =
          leg.startZ < mergeLocalZ
            ? leg.startZ + leg.len - 5.5
            : leg.startZ + 5.5;
        const pointsSouth = side < 0;
        for (let laneIdx = 0; laneIdx < 4; laneIdx++) {
          const laneCenterX = side * ((laneIdx + 0.5) * laneW);
          const stem = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.012, 1.3),
            this.materials.whiteLine
          );
          stem.position.set(laneCenterX, 0.07, arrowZ);
          hwContainer.add(stem);

          const head = new THREE.Mesh(
            new THREE.ConeGeometry(0.38, 0.75, 3),
            this.materials.whiteLine
          );
          head.rotation.x = pointsSouth ? Math.PI * 0.5 : -Math.PI * 0.5;
          head.position.set(
            laneCenterX,
            0.072,
            arrowZ + (pointsSouth ? 0.85 : -0.85)
          );
          hwContainer.add(head);
        }
      }
    }

    // 4. Overhead Highway Destination Gantry Portals (North Portal, Northbound/Southbound Roundabout Interchange Advance Portals, and South Portal)
    const gantryPositions = [
      {
        z: -(length * 0.5 - 4.0),
        leftLabel: 'DELIVERY HQ | RAIL YARD',
        rightLabel: 'NORTH INTERSTATE M1',
      },
      {
        z: mergeLocalZ - 19.5,
        leftLabel: 'ROUNDABOUT INTERCHANGE — YIELD',
        rightLabel: 'CITY HQ | CARGO AIRPORT',
      },
      {
        z: mergeLocalZ + 19.5,
        leftLabel: 'ROUNDABOUT INTERCHANGE — YIELD',
        rightLabel: 'PORT HARBOUR | CITY HQ',
      },
      {
        z: length * 0.5 - 4.0,
        leftLabel: 'PORT HARBOUR | AIRPORT',
        rightLabel: 'SOUTH INTERSTATE M1',
      },
    ];

    for (const gSpec of gantryPositions) {
      const gantryGroup = new THREE.Group();
      gantryGroup.position.set(0, 0, gSpec.z);

      for (const pSide of [-1, 1]) {
        const pillarGeo = new THREE.CylinderGeometry(0.24, 0.28, 5.2, 10);
        const pillar = new THREE.Mesh(pillarGeo, this.materials.accentSteel);
        pillar.position.set(pSide * (totalWorldW * 0.5 + 0.5), 2.6, 0);
        gantryGroup.add(pillar);
      }

      const beamGeo = new THREE.BoxGeometry(totalWorldW + 1.6, 0.36, 0.36);
      const beam = new THREE.Mesh(beamGeo, this.materials.accentSteel);
      beam.position.set(0, 5.0, 0);
      gantryGroup.add(beam);

      const signBoardMat = new THREE.MeshStandardMaterial({
        color: 0x065f46,
        roughness: 0.38,
        metalness: 0.15,
      });
      for (const [sIdx, xSign] of [-5.2, 5.2].entries()) {
        const signBoard = new THREE.Mesh(
          new THREE.BoxGeometry(8.6, 1.45, 0.16),
          signBoardMat
        );
        signBoard.position.set(xSign, 5.0, 0);
        gantryGroup.add(signBoard);

        const borderStrip = new THREE.Mesh(
          new THREE.BoxGeometry(8.4, 0.08, 0.18),
          this.materials.whiteLine
        );
        borderStrip.position.set(xSign, 4.38, 0);
        gantryGroup.add(borderStrip);

        const labelBar = new THREE.Mesh(
          new THREE.BoxGeometry(sIdx === 0 ? 6.4 : 5.8, 0.26, 0.19),
          this.materials.whiteLine
        );
        labelBar.position.set(xSign, 5.12, 0);
        gantryGroup.add(labelBar);
      }

      hwContainer.add(gantryGroup);
    }

    group.add(hwContainer);
  }

  /**
   * Rebuilds the dedicated 15-block Railway Yard, tracks (up to 6 lines),
   * 8-part composite starter depot, station platform, perimeter fencing, and designated crossings with gates.
   */
  /**
   * Rebuilds the dedicated 40 × 50 tile Railway Freight Terminal Compound (`gx = -5..34, gz = 30..79`),
   * strict Y-axis elevation layers (`+0.00, +0.02, +0.03, +0.04, +0.05`), infinite straight-line mainline tracks,
   * precision switchyard turnouts, Central Rail Freight Terminal & Dispatch Control Tower,
   * covered intermodal staging platforms, forklift equipment bays, landside truck loading docks,
   * perimeter fencing, and designated road-railway crossings with gates.
   */
  public rebuildRailwayVisuals(): void {
    this.clearGroup(this.railwayGroup);

    const cs = this.world.config.cellSize;
    const baseTerrainY = 1.2 + RAIL_ELEVATION_LAYERS.baseTerrainGrassOffset;
    const ballastY = 1.2 + RAIL_ELEVATION_LAYERS.crushedBallastOffset;
    const yardPadY = 1.2 + RAIL_ELEVATION_LAYERS.railTiesAndConcretePadOffset;
    const asphaltBayY = 1.2 + RAIL_ELEVATION_LAYERS.asphaltRoadsAndLoadingBaysOffset;
    const railTopY = 1.2 + RAIL_ELEVATION_LAYERS.steelRailsAndMarkingsOffset;

    // 1. Dedicated 40 × 50 Tile Railway Yard Concrete Compound Pad (gx = -5..34, gz = 30..79)
    //    Strict Zero-Clutter Rule: clean engineered concrete apron & organized staging bays
    const fp = RAILWAY_YARD_RESERVED_FOOTPRINT;
    const yardP0 = this.world.grid.gridToWorld(fp.minGx, fp.minGz);
    const yardP1 = this.world.grid.gridToWorld(fp.maxGx, fp.maxGz);
    const yardW = fp.widthCells * cs;
    const yardD = fp.depthCells * cs;
    const yardCx = (yardP0.x + yardP1.x) * 0.5;
    const yardCz = (yardP0.z + yardP1.z) * 0.5;

    // Outer compacted gravel sub-base across the 40x50 compound (+0.02)
    const yardSubBase = new THREE.Mesh(
      new THREE.BoxGeometry(yardW, 0.02, yardD),
      this.materials.curbstone
    );
    yardSubBase.position.set(yardCx, ballastY - 0.005, yardCz);
    yardSubBase.receiveShadow = true;
    this.railwayGroup.add(yardSubBase);

    // Main Reinforced Concrete Terminal & Intermodal Pad (+0.03)
    const westPadP0 = this.world.grid.gridToWorld(fp.minGx + 1, fp.minGz + 2);
    const westPadP1 = this.world.grid.gridToWorld(25, fp.maxGz - 2);
    const westPadW = Math.abs(westPadP1.x - westPadP0.x) + cs;
    const westPadD = Math.abs(westPadP1.z - westPadP0.z) + cs;
    const westPadMesh = new THREE.Mesh(
      new THREE.BoxGeometry(westPadW, 0.025, westPadD),
      this.materials.concrete
    );
    westPadMesh.position.set(
      (westPadP0.x + westPadP1.x) * 0.5,
      yardPadY,
      (westPadP0.z + westPadP1.z) * 0.5
    );
    westPadMesh.receiveShadow = true;
    this.railwayGroup.add(westPadMesh);

    // 2. Clean Asphalt Landside Truck Staging Apron & Loading Bays (+0.04)
    const truckApronP0 = this.world.grid.gridToWorld(15, 38);
    const truckApronP1 = this.world.grid.gridToWorld(20, 66);
    const truckApronW = Math.abs(truckApronP1.x - truckApronP0.x) + cs;
    const truckApronD = Math.abs(truckApronP1.z - truckApronP0.z) + cs;
    const truckApronMesh = new THREE.Mesh(
      new THREE.BoxGeometry(truckApronW, 0.02, truckApronD),
      this.materials.asphalt
    );
    truckApronMesh.position.set(
      (truckApronP0.x + truckApronP1.x) * 0.5,
      asphaltBayY,
      (truckApronP0.z + truckApronP1.z) * 0.5
    );
    truckApronMesh.receiveShadow = true;
    this.railwayGroup.add(truckApronMesh);

    // Yellow painted truck dock bay lines & Forklift Model 360 Equipment Bay markings (+0.05)
    for (const bayGz of [48, 52, 56]) {
      const bp = this.world.grid.gridToWorld(18.2, bayGz);
      const bayOutline = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.01, 1.8),
        this.materials.yellowLine
      );
      bayOutline.position.set(bp.x, railTopY, bp.z);
      this.railwayGroup.add(bayOutline);
    }

    for (const flGz of [47, 51, 55]) {
      const fpBay = this.world.grid.gridToWorld(24.4, flGz);
      const flPad = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.012, 1.5),
        this.materials.yellowLine
      );
      flPad.position.set(fpBay.x, railTopY, fpBay.z);
      this.railwayGroup.add(flPad);
    }

    // 3. Render Infinite Straight-Line Mainline Track Spans & Terminal Sidings
    for (const span of this.world.railways.getInfiniteStraightTrackSpans()) {
      const isMainline = span.lineNumber === 1;
      this.buildElevatedStraightTrackSpan(
        span.gx,
        span.renderMinGz,
        span.gx,
        span.renderMaxGz,
        !isMainline,
        !isMainline,
        isMainline
      );
    }

    // Render any additional player-built world-scale rail corridors
    for (const track of this.world.railways.getAllTracks()) {
      if (track.lineNumber >= 1 && track.lineNumber <= 6) {
        continue; // Already covered by getInfiniteStraightTrackSpans()
      }
      this.buildSingleTrackVisuals(track);
    }

    // Precision Switchyard Turnouts connecting Mainline Track 1 (gx=26) <-> Loading Siding Track 2 (gx=27)
    this.buildSwitchyardTurnoutVisuals(26, 42, 27, 39);
    this.buildSwitchyardTurnoutVisuals(26, 65, 27, 68);

    // 4. Central Rail Freight Terminal & GTE Dispatch Control Tower (gx = 20..24, gz = 44..60)
    for (const depot of this.world.railways.getAllDepots()) {
      const pMin = this.world.grid.gridToWorld(depot.minGx, depot.minGz);
      const pMax = this.world.grid.gridToWorld(depot.maxGx, depot.maxGz);
      const cx = (pMin.x + pMax.x) * 0.5;
      const cz = (pMin.z + pMax.z) * 0.5;
      const w = (depot.maxGx - depot.minGx + 1) * cs - 0.3;
      const d = (depot.maxGz - depot.minGz + 1) * cs + 6.0;

      const depotGroup = new THREE.Group();
      depotGroup.position.set(cx, yardPadY, cz);

      // Part 1: Raised Concrete Loading Dock Foundation Plinth with Yellow Safety Edge
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.8, 0.32, d + 0.8),
        this.materials.concrete
      );
      plinth.position.y = 0.16;
      plinth.receiveShadow = true;
      depotGroup.add(plinth);

      const safetyEdge = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.34, d + 0.82),
        this.materials.safetyYellow
      );
      safetyEdge.position.set(w * 0.5 + 0.36, 0.17, 0);
      depotGroup.add(safetyEdge);

      // Part 2: Sleek Modern Corrugated Industrial Terminal Hull
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(w, 3.8, d),
        this.materials.cityTowerBody
      );
      hull.position.y = 2.22;
      hull.castShadow = true;
      hull.receiveShadow = true;
      depotGroup.add(hull);

      // Horizontal GTE Crimson & Amber architectural fascia bands
      const redBand = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.08, 0.36, d + 0.08),
        this.materials.gateRed
      );
      redBand.position.y = 3.72;
      depotGroup.add(redBand);

      const yellowBand = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.1, 0.14, d + 0.1),
        this.materials.safetyYellow
      );
      yellowBand.position.y = 3.46;
      depotGroup.add(yellowBand);

      // Part 3: Pitched Standing-Seam Industrial Steel Roof + Skylights
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, 0.28, d + 0.5),
        this.materials.depotRoof
      );
      roof.position.y = 4.24;
      depotGroup.add(roof);

      for (const zOff of [-d * 0.3, 0, d * 0.3]) {
        const skylight = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.48, 0.38, 2.2),
          this.materials.cityGlass
        );
        skylight.position.set(0, 4.52, zOff);
        depotGroup.add(skylight);
      }

      // Part 4: Trackside & Landside Roll-Up Freight Bay Doors + Protective Yellow Bollards
      for (const zDoor of [-d * 0.32, 0, d * 0.32]) {
        for (const xSide of [-1, 1]) {
          const shutter = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 2.4, 2.2),
            this.materials.accentSteel
          );
          shutter.position.set(xSide * (w * 0.5 + 0.02), 1.52, zDoor);
          depotGroup.add(shutter);

          for (const bOff of [-1.3, 1.3]) {
            const bollard = new THREE.Mesh(
              new THREE.CylinderGeometry(0.08, 0.08, 0.65, 8),
              this.materials.safetyYellow
            );
            bollard.position.set(
              xSide * (w * 0.5 + 0.32),
              0.62,
              zDoor + bOff
            );
            depotGroup.add(bollard);
          }
        }
      }

      // Part 5: Elevated GTE Rail Dispatch Control Tower overlooking the Switchyard
      const towerW = w * 0.62;
      const towerD = 3.4;
      const towerShaft = new THREE.Mesh(
        new THREE.BoxGeometry(towerW, 3.2, towerD),
        this.materials.cityTowerBody
      );
      towerShaft.position.set(0.4, 5.8, -d * 0.34);
      towerShaft.castShadow = true;
      depotGroup.add(towerShaft);

      const controlCabGlass = new THREE.Mesh(
        new THREE.BoxGeometry(towerW + 0.24, 1.15, towerD + 0.24),
        this.materials.cityGlass
      );
      controlCabGlass.position.set(0.4, 7.85, -d * 0.34);
      depotGroup.add(controlCabGlass);

      const towerRoof = new THREE.Mesh(
        new THREE.BoxGeometry(towerW + 0.6, 0.24, towerD + 0.6),
        this.materials.depotRoof
      );
      towerRoof.position.set(0.4, 8.55, -d * 0.34);
      depotGroup.add(towerRoof);

      // Part 6: Overhead Intermodal Gantry Crane Spanning Siding & Loading Apron
      const gantrySpan = 6.4;
      const gantryHeight = 4.8;
      for (const zLeg of [-4.2, 4.2]) {
        for (const xLeg of [w * 0.5 + 0.6, w * 0.5 + gantrySpan]) {
          const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, gantryHeight, 0.24),
            this.materials.safetyYellow
          );
          leg.position.set(xLeg, gantryHeight * 0.5 + 0.2, zLeg);
          depotGroup.add(leg);
        }
        const crossBeam = new THREE.Mesh(
          new THREE.BoxGeometry(gantrySpan + 0.4, 0.34, 0.34),
          this.materials.safetyYellow
        );
        crossBeam.position.set(
          w * 0.5 + 0.6 + gantrySpan * 0.5,
          gantryHeight + 0.25,
          zLeg
        );
        depotGroup.add(crossBeam);
      }

      this.railwayGroup.add(depotGroup);
    }

    // 5. Organized Western Intermodal Container & Pallet Staging Platforms (gx = 1..12, gz = 40..64)
    //    Strict Zero-Clutter Rule: All cargo is neatly stacked inside designated raised platforms!
    const stagingPlatforms = [
      { gx: 4, gz: 44, w: 6, d: 8 },
      { gx: 4, gz: 56, w: 6, d: 8 },
    ];
    const containerPalette = [0x2563eb, 0x16a34a, 0xdc2626, 0x0d9488, 0xf59e0b];
    stagingPlatforms.forEach((plat, pIdx) => {
      const pMin = this.world.grid.gridToWorld(plat.gx, plat.gz);
      const pMax = this.world.grid.gridToWorld(
        plat.gx + plat.w - 1,
        plat.gz + plat.d - 1
      );
      const px = (pMin.x + pMax.x) * 0.5;
      const pz = (pMin.z + pMax.z) * 0.5;
      const pw = plat.w * cs;
      const pd = plat.d * cs;

      const platGroup = new THREE.Group();
      platGroup.position.set(px, yardPadY, pz);

      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(pw, 0.24, pd),
        this.materials.concrete
      );
      deck.position.y = 0.12;
      deck.receiveShadow = true;
      platGroup.add(deck);

      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(pw + 0.4, 0.16, pd + 0.4),
        this.materials.depotRoof
      );
      canopy.position.y = 3.1;
      platGroup.add(canopy);

      for (const cxOff of [-pw * 0.42, pw * 0.42]) {
        for (const czOff of [-pd * 0.42, 0, pd * 0.42]) {
          const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 2.9, 8),
            this.materials.accentSteel
          );
          col.position.set(cxOff, 1.6, czOff);
          platGroup.add(col);
        }
      }

      // Neatly aligned intermodal containers inside the covered staging platform
      for (let row = -1; row <= 1; row++) {
        const cMat = new THREE.MeshStandardMaterial({
          color: containerPalette[(pIdx * 3 + row + 1) % containerPalette.length],
          roughness: 0.42,
          metalness: 0.28,
        });
        const cont = new THREE.Mesh(
          new THREE.BoxGeometry(1.3, 1.1, 3.6),
          cMat
        );
        cont.position.set(row * 2.2, 0.24 + 0.55, 0);
        cont.castShadow = true;
        platGroup.add(cont);
      }

      this.railwayGroup.add(platGroup);
    });

    // 6. Render Starter Station Platform (gx 25, gz 58..65)
    for (const st of this.world.railways.getAllStations()) {
      const pMin = this.world.grid.gridToWorld(st.minGx, st.minGz);
      const pMax = this.world.grid.gridToWorld(st.maxGx, st.maxGz);
      const cx = (pMin.x + pMax.x) * 0.5;
      const cz = (pMin.z + pMax.z) * 0.5;
      const length = Math.abs(pMax.z - pMin.z) + cs;

      const stGroup = new THREE.Group();
      stGroup.position.set(cx, yardPadY, cz);

      // Platform deck
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.45, length),
        this.materials.concrete
      );
      deck.position.y = 0.225;
      stGroup.add(deck);

      // Tactile safety yellow edge facing Track 1 (+X side)
      const safetyStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.47, length - 0.1),
        this.materials.safetyYellow
      );
      safetyStrip.position.set(0.76, 0.23, 0);
      stGroup.add(safetyStrip);

      // Canopy roof & pillars
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.14, length - 1.2),
        this.materials.depotRoof
      );
      canopy.position.set(-0.05, 2.35, 0);
      stGroup.add(canopy);

      for (let zP = -length * 0.35; zP <= length * 0.35; zP += length * 0.35) {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 1.9, 8),
          this.materials.accentSteel
        );
        pillar.position.set(-0.2, 1.38, zP);
        stGroup.add(pillar);
      }

      this.railwayGroup.add(stGroup);
    }

    // 7. Perimeter Railway Fencing along Rail Yard Zone with gaps at designated crossings
    this.buildRailwayPerimeterFencing();

    // 8. Designated Road-Railway Crossings & Crossing Gates
    for (const crossing of this.world.railways.getAllCrossings()) {
      this.buildRailwayCrossingVisuals(crossing);
    }

    void baseTerrainY;
  }

  private buildElevatedStraightTrackSpan(
    gx0: number,
    gz0: number,
    gx1: number,
    gz1: number,
    hasBufferStopNorth: boolean,
    hasBufferStopSouth: boolean,
    isMainline: boolean
  ): void {
    const cs = this.world.config.cellSize;
    const ballastY = 1.2 + RAIL_ELEVATION_LAYERS.crushedBallastOffset;
    const tiesY = 1.2 + RAIL_ELEVATION_LAYERS.railTiesAndConcretePadOffset;
    const railsY = 1.2 + RAIL_ELEVATION_LAYERS.steelRailsAndMarkingsOffset;

    const p0 = this.world.grid.gridToWorld(gx0, gz0);
    const p1 = this.world.grid.gridToWorld(gx1, gz1);
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const length = Math.hypot(dx, dz) + cs;
    const midX = (p0.x + p1.x) * 0.5;
    const midZ = (p0.z + p1.z) * 0.5;
    const angle = Math.atan2(dx, dz);

    const tGroup = new THREE.Group();
    tGroup.position.set(midX, 0, midZ);
    tGroup.rotation.y = angle;

    // Layer +0.02: Crushed Stone Ballast Bed
    const ballastGeo = new THREE.BoxGeometry(1.76, 0.04, length);
    const ballastMesh = new THREE.Mesh(ballastGeo, this.materials.ballast);
    ballastMesh.position.y = ballastY;
    ballastMesh.receiveShadow = true;
    tGroup.add(ballastMesh);

    // Layer +0.03: Concrete/Wooden Railroad Ties (Instanced up to 1,200 ties per span for high performance)
    const sleeperSpacing = isMainline ? 0.85 : 0.65;
    const sleeperCount = Math.min(
      1400,
      Math.max(2, Math.floor(length / sleeperSpacing))
    );
    const actualSpacing = length / sleeperCount;
    const sleeperGeo = new THREE.BoxGeometry(1.44, 0.04, 0.22);
    const sleeperInst = new THREE.InstancedMesh(
      sleeperGeo,
      this.materials.timberSleeper,
      sleeperCount
    );
    for (let i = 0; i < sleeperCount; i++) {
      const zPos = -length * 0.5 + actualSpacing * 0.5 + i * actualSpacing;
      _dummyObj.position.set(0, tiesY + 0.01, zPos);
      _dummyObj.rotation.set(0, 0, 0);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      sleeperInst.setMatrixAt(i, _dummyObj.matrix);
    }
    sleeperInst.instanceMatrix.needsUpdate = true;
    sleeperInst.computeBoundingSphere();
    tGroup.add(sleeperInst);

    // Layer +0.05: Gleaming Twin Steel Rails + Yellow Maintenance Walkway Strip
    const railGaugeHalf = 0.42;
    for (const side of [-1, 1]) {
      const railGeo = new THREE.BoxGeometry(0.085, 0.09, length);
      const railMesh = new THREE.Mesh(railGeo, this.materials.steelRail);
      railMesh.position.set(side * railGaugeHalf, railsY + 0.035, 0);
      tGroup.add(railMesh);
    }

    // Yellow pedestrian maintenance walkway alongside the track inside the yard
    const walkwayLen = Math.min(length, 96);
    const walkway = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.015, walkwayLen),
      this.materials.safetyYellow
    );
    walkway.position.set(-1.02, railsY, 0);
    tGroup.add(walkway);

    // Buffer stops on terminal sidings
    if (hasBufferStopNorth) {
      const bumperN = new THREE.Mesh(
        new THREE.BoxGeometry(1.26, 0.48, 0.28),
        this.materials.gateRed
      );
      bumperN.position.set(0, railsY + 0.22, -length * 0.5 + 0.2);
      tGroup.add(bumperN);
    }
    if (hasBufferStopSouth) {
      const bumperS = new THREE.Mesh(
        new THREE.BoxGeometry(1.26, 0.48, 0.28),
        this.materials.gateRed
      );
      bumperS.position.set(0, railsY + 0.22, length * 0.5 - 0.2);
      tGroup.add(bumperS);
    }

    this.railwayGroup.add(tGroup);
  }

  private buildSwitchyardTurnoutVisuals(
    gx0: number,
    gz0: number,
    gx1: number,
    gz1: number
  ): void {
    const p0 = this.world.grid.gridToWorld(gx0, gz0);
    const p1 = this.world.grid.gridToWorld(gx1, gz1);
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const len = Math.hypot(dx, dz);
    const midX = (p0.x + p1.x) * 0.5;
    const midZ = (p0.z + p1.z) * 0.5;
    const yaw = Math.atan2(dx, dz);

    const ballastY = 1.2 + RAIL_ELEVATION_LAYERS.crushedBallastOffset;
    const railsY = 1.2 + RAIL_ELEVATION_LAYERS.steelRailsAndMarkingsOffset;

    const grp = new THREE.Group();
    grp.position.set(midX, 0, midZ);
    grp.rotation.y = yaw;

    const bMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.04, len),
      this.materials.ballast
    );
    bMesh.position.y = ballastY;
    grp.add(bMesh);

    for (const side of [-1, 1]) {
      const rMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.085, len),
        this.materials.steelRail
      );
      rMesh.position.set(side * 0.42, railsY + 0.035, 0);
      grp.add(rMesh);
    }

    this.railwayGroup.add(grp);
  }

  private buildSingleTrackVisuals(track: RailwayTrackRecord): void {
    const startGx = track.startCoord?.gx ?? track.gx;
    const startGz = track.startCoord?.gz ?? track.startGz;
    const endGx = track.endCoord?.gx ?? track.gx;
    const endGz = track.endCoord?.gz ?? track.endGz;

    if (startGx === endGx || startGz === endGz) {
      this.buildElevatedStraightTrackSpan(
        startGx,
        startGz,
        endGx,
        endGz,
        true,
        true,
        false
      );
    } else {
      this.buildElevatedStraightTrackSpan(
        startGx,
        startGz,
        startGx,
        endGz,
        false,
        false,
        false
      );
      this.buildElevatedStraightTrackSpan(
        startGx,
        endGz,
        endGx,
        endGz,
        false,
        false,
        false
      );
    }
  }

  private buildRailwayPerimeterFencing(): void {
    const rc = this.world.config.railCorridor;
    const postPositions: Array<{ x: number; z: number }> = [];

    for (let gz = 36; gz <= 74; gz += 2) {
      if (rc.designatedCrossingRows.some((r) => Math.abs(r - gz) <= 1)) {
        continue; // Keep designated crossings unobstructed!
      }
      const westEdge = this.world.grid.gridToWorld(rc.startX - 0.45, gz);
      const eastEdge = this.world.grid.gridToWorld(rc.endX + 0.45, gz);
      postPositions.push({ x: westEdge.x, z: westEdge.z });
      postPositions.push({ x: eastEdge.x, z: eastEdge.z });
    }

    if (postPositions.length === 0) return;

    const postGeo = new THREE.BoxGeometry(0.14, 0.85, 0.85);
    postGeo.translate(0, 0.425, 0);
    const fenceInst = new THREE.InstancedMesh(
      postGeo,
      this.materials.accentSteel,
      postPositions.length
    );
    for (let i = 0; i < postPositions.length; i++) {
      const p = postPositions[i];
      _dummyObj.position.set(p.x, 1.2, p.z);
      _dummyObj.rotation.set(0, 0, 0);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      fenceInst.setMatrixAt(i, _dummyObj.matrix);
    }
    fenceInst.instanceMatrix.needsUpdate = true;
    fenceInst.computeBoundingSphere();
    this.railwayGroup.add(fenceInst);
  }

  private buildRailwayCrossingVisuals(crossing: RailwayCrossingRecord): void {
    const pWest = this.world.grid.gridToWorld(crossing.minGx, crossing.rowGz);
    const pEast = this.world.grid.gridToWorld(crossing.maxGx, crossing.rowGz);
    const midX = (pWest.x + pEast.x) * 0.5;
    const zWorld = pWest.z;
    const spanW = Math.abs(pEast.x - pWest.x) + this.world.config.cellSize;
    const roadW = ROAD_SPECS[crossing.roadWidthConfig].worldWidth;

    const cGroup = new THREE.Group();
    cGroup.position.set(midX, 1.24, zWorld);

    // Grade crossing concrete pad across the track operations corridor
    const padGeo = new THREE.BoxGeometry(spanW, 0.07, roadW + 0.4);
    const padMesh = new THREE.Mesh(padGeo, this.materials.concrete);
    padMesh.position.y = 0.02;
    cGroup.add(padMesh);

    // Physical Crossing Gates on West and East road approaches (outside track clearance)
    for (const side of [-1, 1]) {
      const gateX = side * (spanW * 0.5 + 0.5);
      const gateZ = side * (roadW * 0.5 + 0.45);

      const postGroup = new THREE.Group();
      postGroup.position.set(gateX, 0, gateZ);

      // Signal mast
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.12, 2.2, 8),
        this.materials.accentSteel
      );
      mast.position.y = 1.1;
      postGroup.add(mast);

      // Warning crossbuck sign
      const crossA = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.12, 0.06),
        this.materials.whiteLine
      );
      crossA.position.y = 1.85;
      crossA.rotation.z = Math.PI * 0.25;
      const crossB = crossA.clone();
      crossB.rotation.z = -Math.PI * 0.25;
      postGroup.add(crossA, crossB);

      // Red-and-white barrier arm
      const armLen = roadW * 0.85;
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.12, armLen),
        this.materials.gateRed
      );
      // Raised/angled slightly when OPEN so it's unmistakably visible as a railway gate
      arm.position.set(0, 1.05, -side * (armLen * 0.42));
      arm.rotation.x = side * 0.35;
      postGroup.add(arm);

      cGroup.add(postGroup);
    }

    this.railwayGroup.add(cGroup);
  }

  /**
   * Rebuilds all player-constructed Road Bridges and Railway Bridges.
   */
  public rebuildBridgesVisuals(): void {
    this.clearGroup(this.bridgesGroup);
    this.bridgeMeshMap.clear();

    for (const br of this.world.bridgesAndPort.getAllBridges()) {
      const bGroup = this.createBridgeVisualGroup(br);
      this.bridgeMeshMap.set(br.id, bGroup);
      this.bridgesGroup.add(bGroup);
    }
  }

  private createBridgeVisualGroup(br: BridgeRecord): THREE.Group {
    const group = new THREE.Group();
    group.name = br.id;

    const pStart = this.world.grid.gridToWorld(
      br.startLand.gx,
      br.startLand.gz
    );
    const pEnd = this.world.grid.gridToWorld(br.endLand.gx, br.endLand.gz);
    const cs = this.world.config.cellSize;

    const dx = pEnd.x - pStart.x;
    const dz = pEnd.z - pStart.z;
    const totalLen = Math.hypot(dx, dz) + cs;
    const angle = Math.atan2(dx, dz);
    const midX = (pStart.x + pEnd.x) * 0.5;
    const midZ = (pStart.z + pEnd.z) * 0.5;

    const deckW =
      br.category === 'ROAD_BRIDGE' && br.roadSpec
        ? br.roadSpec.worldWidth
        : 2.2;
    const deckY = br.deckElevation; // 2.1

    const bContainer = new THREE.Group();
    bContainer.position.set(midX, 0, midZ);
    bContainer.rotation.y = angle;

    // 1. Concrete Structural Deck, Steel Under-Deck Box Girder & Side Parapets
    const structGeo = new THREE.BoxGeometry(deckW + 0.64, 0.34, totalLen);
    const structMesh = new THREE.Mesh(structGeo, this.materials.concrete);
    structMesh.position.y = deckY - 0.15;
    structMesh.castShadow = true;
    structMesh.receiveShadow = true;
    bContainer.add(structMesh);

    const boxGirder = new THREE.Mesh(
      new THREE.BoxGeometry(deckW * 0.72, 0.38, totalLen - 0.8),
      this.materials.accentSteel
    );
    boxGirder.position.y = deckY - 0.48;
    boxGirder.castShadow = true;
    bContainer.add(boxGirder);

    for (const side of [-1, 1]) {
      const curbBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.22, totalLen),
        this.materials.concrete
      );
      curbBase.position.set(side * (deckW * 0.5 + 0.2), deckY + 0.12, 0);
      bContainer.add(curbBase);

      const railWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.52, totalLen),
        this.materials.accentSteel
      );
      railWall.position.set(side * (deckW * 0.5 + 0.22), deckY + 0.42, 0);
      bContainer.add(railWall);
    }

    // 2. Overhead Structural Arch or Steel Truss Superstructure for Natural River Crossings
    const bStyle =
      br.bridgeStyle ??
      (br.category === 'RAIL_BRIDGE' ? 'STEEL_TRUSS' : 'ARCH_SPAN');
    if (bStyle === 'ARCH_SPAN' || bStyle === 'CABLE_STAYED') {
      const archSegments = 10;
      const archLen = Math.max(4.0, totalLen - 2.6);
      const archRise = Math.min(3.4, Math.max(1.6, archLen * 0.18));
      for (const side of [-1, 1]) {
        const xOff = side * (deckW * 0.5 + 0.22);
        for (let s = 0; s < archSegments; s++) {
          const t0 = s / archSegments;
          const t1 = (s + 1) / archSegments;
          const z0 = (t0 - 0.5) * archLen;
          const z1 = (t1 - 0.5) * archLen;
          const y0 = deckY + 0.45 + Math.sin(t0 * Math.PI) * archRise;
          const y1 = deckY + 0.45 + Math.sin(t1 * Math.PI) * archRise;
          const segLen = Math.hypot(z1 - z0, y1 - y0);
          const archChord = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.22, segLen + 0.08),
            this.materials.accentSteel
          );
          archChord.position.set(xOff, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
          archChord.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
          bContainer.add(archChord);

          if (s > 0) {
            const hangerH = y0 - (deckY + 0.35);
            if (hangerH > 0.25) {
              const hanger = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, hangerH, 6),
                this.materials.steelRail
              );
              hanger.position.set(xOff, deckY + 0.35 + hangerH * 0.5, z0);
              bContainer.add(hanger);
            }
          }
        }
      }
    } else if (bStyle === 'STEEL_TRUSS') {
      const trussH = 2.1;
      const trussLen = Math.max(4.0, totalLen - 2.0);
      for (const side of [-1, 1]) {
        const xOff = side * (deckW * 0.5 + 0.22);
        const topChord = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.18, trussLen),
          this.materials.accentSteel
        );
        topChord.position.set(xOff, deckY + trussH, 0);
        bContainer.add(topChord);
      }
    }

    // 3. Reinforced Concrete Riverbank Abutments & Tapered Hydrodynamic River Piers
    for (const endDir of [-1, 1]) {
      const abutment = new THREE.Mesh(
        new THREE.BoxGeometry(deckW + 1.15, deckY + 1.2, 1.85),
        this.materials.concrete
      );
      abutment.position.set(
        0,
        (deckY - 0.9) * 0.5,
        endDir * (totalLen * 0.5 - 0.55)
      );
      abutment.castShadow = true;
      bContainer.add(abutment);

      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(deckW + 0.3, 0.22, 2.4),
        this.materials.asphalt
      );
      ramp.position.set(0, 1.65, endDir * (totalLen * 0.5 + 0.8));
      ramp.rotation.x = endDir * 0.34;
      bContainer.add(ramp);
    }

    const pierSpacing = 6.0;
    const pierCount =
      br.pierCount ?? Math.max(2, Math.floor((totalLen - 3.0) / pierSpacing));
    for (let i = 0; i < pierCount; i++) {
      const zPos =
        -totalLen * 0.5 +
        2.2 +
        (pierCount > 1
          ? (i / (pierCount - 1)) * (totalLen - 4.4)
          : (totalLen - 4.4) * 0.5);

      const cutwaterFooting = new THREE.Mesh(
        new THREE.BoxGeometry(deckW * 0.88, 0.85, 1.25),
        this.materials.concrete
      );
      cutwaterFooting.position.set(0, 0.05, zPos);
      bContainer.add(cutwaterFooting);

      for (const side of [-1, 1]) {
        const pier = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.44, deckY + 1.8, 10),
          this.materials.concrete
        );
        pier.position.set(side * (deckW * 0.34), (deckY - 1.8) * 0.5, zPos);
        bContainer.add(pier);
      }
    }

    // 4. Traffic Surface: Road Asphalt + Lane Markings OR Railway Track + Sleepers
    if (br.category === 'ROAD_BRIDGE' && br.roadSpec) {
      const asphaltDeck = new THREE.Mesh(
        new THREE.BoxGeometry(deckW, 0.08, totalLen),
        this.materials.asphalt
      );
      asphaltDeck.position.y = deckY + 0.04;
      bContainer.add(asphaltDeck);

      const markY = deckY + 0.09;
      // Center divider
      const centerLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.01, totalLen - 0.2),
        this.materials.whiteLine
      );
      centerLine.position.set(0, markY, 0);
      bContainer.add(centerLine);

      // Outer edge lines
      const edgeOff = deckW * 0.5 - 0.14;
      for (const side of [-1, 1]) {
        const edgeLine = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.01, totalLen - 0.2),
          this.materials.whiteLine
        );
        edgeLine.position.set(side * edgeOff, markY, 0);
        bContainer.add(edgeLine);
      }

      // Dashed lane separators matching 1x1 (0), 2x2 (1), 3x3 (2)
      const dashes = br.roadSpec.dashedSeparatorsPerCarriageway;
      if (dashes > 0) {
        const laneW = (deckW * 0.5) / br.roadSpec.lanesPerDirection;
        const dashLen = 1.1;
        const stride = 2.2;
        const dCount = Math.max(1, Math.floor((totalLen - 1.0) / stride));
        for (const side of [-1, 1]) {
          for (let dIdx = 1; dIdx <= dashes; dIdx++) {
            const xOff = side * dIdx * laneW;
            for (let k = 0; k < dCount; k++) {
              const zPos = -totalLen * 0.5 + 1.0 + k * stride;
              const dMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.07, 0.01, dashLen),
                this.materials.whiteLine
              );
              dMesh.position.set(xOff, markY, zPos);
              bContainer.add(dMesh);
            }
          }
        }
      }
    } else {
      // Railway Bridge Track Surface
      const ballastDeck = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.08, totalLen),
        this.materials.ballast
      );
      ballastDeck.position.y = deckY + 0.04;
      bContainer.add(ballastDeck);

      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.1, totalLen),
          this.materials.steelRail
        );
        rail.position.set(side * 0.42, deckY + 0.13, 0);
        bContainer.add(rail);
      }
    }

    group.add(bContainer);
    return group;
  }

  /**
   * Builds the modest Starter Coastal Port & Harbour at (gx 82..98, gz 88..98)
   * directly facing the natural Southern Sea.
   */
  /**
   * Builds the Coastal Port & Harbour at (gx 82..98, gz 88..98)
   * directly facing the Southern Sea with twin STS container gantry cranes,
   * organized ISO container stacks, rubber quay fenders, mooring bollards, and Harbour Master tower.
   */
  public buildPortHarbourVisuals(): void {
    this.clearGroup(this.portGroup);

    const port = this.world.bridgesAndPort.getPortHarbour();
    const cs = this.world.config.cellSize;
    const pMin = this.world.grid.gridToWorld(port.minGx, port.minGz);
    const pMax = this.world.grid.gridToWorld(port.maxGx, port.maxGz);

    const cx = (pMin.x + pMax.x) * 0.5;
    const cz = (pMin.z + pMax.z) * 0.5;
    const w = (port.maxGx - port.minGx + 1) * cs;
    const d = (port.maxGz - port.minGz + 1) * cs;

    const hGroup = new THREE.Group();
    hGroup.position.set(cx, 0.75, cz);

    // 1. Concrete Quay Deck, Heavy Sea-Facing Retaining Wall & Yellow Safety Coping
    const quayDeck = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.95, d),
      this.materials.concrete
    );
    quayDeck.position.y = -0.15;
    quayDeck.receiveShadow = true;
    hGroup.add(quayDeck);

    const quayEdgeSafety = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.4, 0.04, 0.28),
      this.materials.safetyYellow
    );
    quayEdgeSafety.position.set(0, 0.34, d * 0.5 - 0.25);
    hGroup.add(quayEdgeSafety);

    // Crane rail tracks along the quayside apron
    for (const rZ of [d * 0.22, d * 0.42]) {
      const craneRail = new THREE.Mesh(
        new THREE.BoxGeometry(w - 1.2, 0.05, 0.1),
        this.materials.steelRail
      );
      craneRail.position.set(0, 0.35, rZ);
      hGroup.add(craneRail);
    }

    // 2. Two Deep-Water Vessel Berths extending into the Southern Sea (+Z side) with fenders & bollards
    for (const berth of port.berths) {
      const bMin = this.world.grid.gridToWorld(berth.minGx, berth.quayGz);
      const bMax = this.world.grid.gridToWorld(berth.maxGx, berth.quayGz);
      const bx = (bMin.x + bMax.x) * 0.5 - cx;
      const bw = Math.abs(bMax.x - bMin.x) + cs;

      const pierJetty = new THREE.Mesh(
        new THREE.BoxGeometry(bw, 0.6, 4.4),
        this.materials.curbstone
      );
      pierJetty.position.set(bx, 0.1, d * 0.5 + 1.9);
      hGroup.add(pierJetty);

      // Black rubber marine fenders along seaward berth face
      for (let fx = -bw * 0.4; fx <= bw * 0.4; fx += bw * 0.2) {
        const fender = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.52, 0.26),
          this.materials.tyreRubber
        );
        fender.position.set(bx + fx, 0.08, d * 0.5 + 4.18);
        hGroup.add(fender);
      }

      // Mooring bollards
      for (const bSide of [-bw * 0.36, -bw * 0.12, bw * 0.12, bw * 0.36]) {
        const bollard = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.2, 0.45, 8),
          this.materials.safetyYellow
        );
        bollard.position.set(bx + bSide, 0.5, d * 0.5 + 3.6);
        hGroup.add(bollard);
      }
    }

    // 3. Twin Ship-to-Shore (STS) Container Gantry Cranes serving Berth 1 & Berth 2
    for (const craneX of [-w * 0.26, w * 0.04]) {
      const craneGroup = new THREE.Group();
      craneGroup.position.set(craneX, 0.32, d * 0.32);

      // 4 Portal Legs + Cross-Tie Beams
      for (const lx of [-1.35, 1.35]) {
        for (const lz of [-1.0, 1.0]) {
          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.2, 5.4, 8),
            this.materials.craneTeal
          );
          leg.position.set(lx, 2.7, lz);
          leg.castShadow = true;
          craneGroup.add(leg);
        }
        const sillBeam = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.35, 2.4),
          this.materials.craneTeal
        );
        sillBeam.position.set(lx, 0.22, 0);
        craneGroup.add(sillBeam);
      }

      // Upper Machinery House & Operator Cabin
      const machineryHouse = new THREE.Mesh(
        new THREE.BoxGeometry(3.1, 1.05, 2.6),
        this.materials.craneTeal
      );
      machineryHouse.position.set(0, 5.4, 0);
      machineryHouse.castShadow = true;
      craneGroup.add(machineryHouse);

      const operatorCab = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.72, 0.95),
        this.materials.cityGlass
      );
      operatorCab.position.set(0.6, 4.65, 1.45);
      craneGroup.add(operatorCab);

      // Seaward Outreach Boom + Spreader Trolley
      const boom = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.48, 10.2),
        this.materials.safetyYellow
      );
      boom.position.set(0, 5.85, 2.8);
      boom.castShadow = true;
      craneGroup.add(boom);

      // Upper A-Frame Apex & Stay Rods
      const apex = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 2.2, 0.35),
        this.materials.craneTeal
      );
      apex.position.set(0, 6.9, -0.2);
      craneGroup.add(apex);

      const spreader = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.24, 2.4),
        this.materials.safetyYellow
      );
      spreader.position.set(0, 3.3, 4.2);
      craneGroup.add(spreader);

      hGroup.add(craneGroup);
    }

    // 4. Organized Quayside ISO Shipping Container Stacking Yard
    const contColors = [0xdc2626, 0x0284c7, 0x0d9488, 0xd97706, 0x2563eb];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const tiers = (row + col) % 2 === 0 ? 2 : 1;
        for (let t = 0; t < tiers; t++) {
          const cMat = new THREE.MeshStandardMaterial({
            color: contColors[(row * 3 + col + t) % contColors.length],
            roughness: 0.45,
            metalness: 0.25,
          });
          const isoBox = new THREE.Mesh(
            new THREE.BoxGeometry(1.15, 0.92, 2.45),
            cMat
          );
          isoBox.position.set(
            -w * 0.34 + col * 1.45,
            0.32 + 0.46 + t * 0.94,
            -d * 0.22 + row * 2.85
          );
          isoBox.castShadow = true;
          hGroup.add(isoBox);
        }
      }
    }

    // 5. Harbour Master Control Building, Customs Shed & Maritime Radar Tower
    const shed = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 2.6, 4.4),
      this.materials.industrialWall
    );
    shed.position.set(w * 0.24, 1.6, -d * 0.2);
    shed.castShadow = true;
    hGroup.add(shed);

    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.35, 5.2, 12),
      this.materials.cityTowerBody
    );
    tower.position.set(w * 0.36, 2.9, -d * 0.2);
    tower.castShadow = true;
    hGroup.add(tower);

    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.2, 1.05, 12),
      this.materials.cityGlass
    );
    lantern.position.set(w * 0.36, 5.8, -d * 0.2);
    hGroup.add(lantern);

    const radarDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 10),
      this.materials.whiteLine
    );
    radarDome.position.set(w * 0.36, 6.65, -d * 0.2);
    hGroup.add(radarDome);

    this.portGroup.add(hGroup);
  }

  /**
   * Builds the dedicated 30 x 40 International & Cargo Airport Compound.
   *
   * Enforces strict vertical (`Y`-axis) offsets above `yBase = 1.40` to eliminate Z-fighting:
   * - Base Terrain Grass:                   top at `yBase + 0.00` (1.400)
   * - Airport Concrete Apron / Foundation:  top at `yBase + 0.03` (1.430)
   * - Perimeter Roads:                      top at `yBase + 0.04` (1.440)
   * - Dark Asphalt Runway & Taxiways:       top at `yBase + 0.05` (1.450)
   * - Runway & Taxiway Painted Markings:    top at `yBase + 0.06` (1.460)
   *
   * Architectural & Landmark Features (always rendered in place so the compound is unmistakable):
   * - Main Terminal Building: Multi-level modern terminal with sleek curved/cantilevered silver-metallic
   *   gull-wing roof (`#e2e8f0` / `#475569`), floor-to-ceiling tinted blue-glass curtain walls, warm interior
   *   lighting, illuminated entrance canopy, and bold 3D illuminated rooftop `"INTL AIRPORT"` signage.
   * - 4 Boarding Gates / Piers (`G1`–`G4`): Enclosed glass-walled passenger concourses extending from the
   *   right side of the terminal with flat metallic roofs, `G1`–`G4` gate signs, and articulated jet bridges.
   * - Upgraded Control Tower (ATC): Tall fluted tower with flared white collar, 360-degree angled glass
   *   observation deck, rooftop radar array, and red blinking aviation beacon.
   * - High-Contrast Runway (`#18181b`) & Continuous Apron: Piano-key thresholds, `09`/`27` numerals,
   *   touchdown zone bars, rubber tire skid marks (`opacity: 0.35`), curved yellow gate lead-in lines,
   *   red/white safety clearance boxes, blue taxiway edge lights, white/amber runway lights, and 4-light PAPI boxes.
   * - 2 Curved-Roof Corrugated Steel Hangars (`#cbd5e1` with blue/orange stripes) with open doors & regional plane inside.
   * - Airport Fuel Farm: 3 horizontal white cylindrical fuel tanks inside a concrete containment bund with yellow bollards.
   * - Rotating White Geodesic Radar Dome (`Radome`) on a lattice tower & animated orange-and-white striped windsock.
   * - 3 Commercial Airliners (`1.65x` scale, white fuselage with Blue, Red, and Yellow tail fins) docked at gates
   *   with catering trucks, fuel tankers, and baggage trains clustered around their wings.
   */
  public buildAirportVisuals(): void {
    this.clearGroup(this.airportGroup);
    this.atcBeaconMesh = null;
    this.obstructionBeaconMeshes = [];
    this.airfieldLightMaterials = [];
    this.apronFloodPoolMeshes = [];
    this.yardDockPalletMeshes = [];
    this.atcRadarMesh = null;
    this.radomeMesh = null;
    this.windsockPivot = null;

    const ap = this.world.economy.getAirport();
    const cs = this.world.config.cellSize;
    // Strict base terrain elevation for the Airport plateau
    const yBase = 1.40;

    const pMin = this.world.grid.gridToWorld(ap.minGx, ap.minGz);
    const pMax = this.world.grid.gridToWorld(ap.maxGx, ap.maxGz);
    const minWx = pMin.x - cs * 0.5;
    const maxWx = pMax.x + cs * 0.5;
    const minWz = pMin.z - cs * 0.5;
    const maxWz = pMax.z + cs * 0.5;
    const cx = (minWx + maxWx) * 0.5;
    const cz = (minWz + maxWz) * 0.5;
    const totalW = maxWx - minWx; // 40 * 2.0 = 80m
    const totalD = maxWz - minWz; // 30 * 2.0 = 60m

    const root = new THREE.Group();
    root.name = ap.id;
    this.airportGroup.add(root);

    // Helper to convert grid bounds to world box center & dimensions
    const boundsToWorld = (b: {
      minGx: number;
      maxGx: number;
      minGz: number;
      maxGz: number;
    }) => {
      const b0 = this.world.grid.gridToWorld(b.minGx, b.minGz);
      const b1 = this.world.grid.gridToWorld(b.maxGx, b.maxGz);
      return {
        cx: (b0.x + b1.x) * 0.5,
        cz: (b0.z + b1.z) * 0.5,
        w: (b.maxGx - b.minGx + 1) * cs,
        d: (b.maxGz - b.minGz + 1) * cs,
        minX: b0.x - cs * 0.5,
        maxX: b1.x + cs * 0.5,
        minZ: b0.z - cs * 0.5,
        maxZ: b1.z + cs * 0.5,
      };
    };

    const rwyW = boundsToWorld(ap.runwayBounds);
    const infW = boundsToWorld(ap.infieldGrassBounds);
    const taxiW = boundsToWorld(ap.parallelTaxiwayBounds);
    const apronW = boundsToWorld(ap.apronBounds);
    const termW = boundsToWorld(ap.cargoTerminalBounds);
    const truckYardW = boundsToWorld(ap.cargoTerminalTruckAreaBounds);
    const atcW = boundsToWorld(ap.atcTowerBounds);
    const radarW = boundsToWorld(ap.radarUtilityBounds);
    const whW = boundsToWorld(ap.separateWarehouseBounds);
    const tyW = boundsToWorld(ap.separateTransferYardBounds);

    // =======================================================================
    // LAYER 1: BASE TERRAIN GRASS — Top surface strictly at `yBase + 0.00` (1.400)
    // =======================================================================
    const turfMat = new THREE.MeshStandardMaterial({
      color: 0x4d7c3f,
      roughness: 0.9,
    });
    const turfBase = new THREE.Mesh(
      new THREE.BoxGeometry(totalW - 0.6, 0.004, totalD - 0.6),
      turfMat
    );
    turfBase.position.set(cx, yBase - 0.002, cz);
    turfBase.receiveShadow = true;
    root.add(turfBase);

    // Manicured green grass infield strip between Runway and Parallel Taxiway (top strictly at yBase + 0.00)
    const infieldTurf = new THREE.Mesh(
      new THREE.BoxGeometry(infW.w - 0.4, 0.004, infW.d - 0.2),
      new THREE.MeshStandardMaterial({ color: 0x528242, roughness: 0.88 })
    );
    infieldTurf.position.set(infW.cx, yBase - 0.002, infW.cz);
    infieldTurf.receiveShadow = true;
    root.add(infieldTurf);

    // =======================================================================
    // LAYER 2: CONCRETE APRONS & HANGAR/FACILITY FOUNDATIONS — Top strictly at `yBase + 0.03` (1.430)
    // Strictly scoped to the Airside Zone (North & East) and separate Warehouse/Transfer Yard pads
    // so Airside Concrete NEVER bleeds over the Landside Truck Yard or Perimeter Roads!
    // =======================================================================
    const contApronMinX = apronW.minX - 0.8;
    const contApronMaxX = apronW.maxX + 0.8;
    const contApronMinZ = taxiW.maxZ - 0.2;
    const contApronMaxZ = termW.maxZ + 0.2; // Ends cleanly at the Cargo Terminal & East Hangar line (gz=41)
    const contApronW = contApronMaxX - contApronMinX;
    const contApronD = contApronMaxZ - contApronMinZ;
    const contApronCx = (contApronMinX + contApronMaxX) * 0.5;
    const contApronCz = (contApronMinZ + contApronMaxZ) * 0.5;

    const apronSlab = new THREE.Mesh(
      new THREE.BoxGeometry(contApronW, 0.024, contApronD),
      this.materials.apronConcreteSlab
    );
    // Top surface sits strictly at yBase + 0.03 (1.430)
    apronSlab.position.set(contApronCx, yBase + 0.018, contApronCz);
    apronSlab.receiveShadow = true;
    root.add(apronSlab);

    // Separate 10x10 Airport Cargo Warehouse & 10x10 Transfer Yard Concrete Foundations (Top strictly at yBase + 0.03)
    const whPad = new THREE.Mesh(
      new THREE.BoxGeometry(whW.w + 0.8, 0.024, whW.d + 0.8),
      this.materials.apronConcreteSlab
    );
    whPad.position.set(whW.cx, yBase + 0.018, whW.cz);
    whPad.receiveShadow = true;
    root.add(whPad);

    const tyPad = new THREE.Mesh(
      new THREE.BoxGeometry(tyW.w + 0.8, 0.024, tyW.d + 0.8),
      this.materials.apronConcreteSlab
    );
    tyPad.position.set(tyW.cx, yBase + 0.018, tyW.cz);
    tyPad.receiveShadow = true;
    root.add(tyPad);

    // Dedicated Concrete Dolly Transfer Corridor linking Warehouse and Transfer Yard (Top strictly at yBase + 0.03)
    const dollyBridgeW = Math.max(2.0, tyW.minX - whW.maxX + 1.2);
    const dollyBridge = new THREE.Mesh(
      new THREE.BoxGeometry(dollyBridgeW, 0.024, 6.4),
      this.materials.apronConcreteSlab
    );
    dollyBridge.position.set((whW.maxX + tyW.minX) * 0.5, yBase + 0.018, whW.cz);
    dollyBridge.receiveShadow = true;
    root.add(dollyBridge);

    // =======================================================================
    // LAYER 3: ASPHALT ROADS & EXPANDED LANDSIDE TRUCK YARD — Top strictly at `yBase + 0.04` (1.440)
    // Rebuilds the 18x6 Cargo-Terminal Truck Yard with parallel approach/exit lanes,
    // 4 orderly queuing staging bays, 14m reversing clearance, and 6 marked loading docks!
    // =======================================================================
    this.buildCargoTerminalTruckYardVisuals(root, truckYardW, termW, yBase);

    // Perimeter Chain-Link Security Fence & Controlled Freight Gates
    this.buildAirportPerimeterFenceAndGates(
      root,
      minWx,
      maxWx,
      minWz,
      maxWz,
      yBase,
      true,
      ap.perimeterGates
    );

    // =======================================================================
    // LAYER 4: DARK ASPHALT RUNWAY (`#18181b`) & TAXIWAYS — Top strictly at `yBase + 0.05` (1.450)
    // =======================================================================
    const rwyShoulderMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.84,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const rwyShoulder = new THREE.Mesh(
      new THREE.BoxGeometry(rwyW.w + 1.0, 0.016, rwyW.d + 0.8),
      rwyShoulderMat
    );
    // Top at yBase + 0.044
    rwyShoulder.position.set(rwyW.cx, yBase + 0.036, rwyW.cz);
    root.add(rwyShoulder);

    const rwySurface = new THREE.Mesh(
      new THREE.BoxGeometry(rwyW.w, 0.02, rwyW.d),
      this.materials.runwayAsphalt
    );
    // Top surface sits strictly at yBase + 0.05 (1.450)
    rwySurface.position.set(rwyW.cx, yBase + 0.04, rwyW.cz);
    rwySurface.receiveShadow = true;
    root.add(rwySurface);

    const taxiAsphaltMat = new THREE.MeshStandardMaterial({
      color: 0x1f242d,
      roughness: 0.8,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const taxiMesh = new THREE.Mesh(
      new THREE.BoxGeometry(taxiW.w, 0.02, taxiW.d),
      taxiAsphaltMat
    );
    // Top surface sits strictly at yBase + 0.05 (1.450)
    taxiMesh.position.set(taxiW.cx, yBase + 0.04, taxiW.cz);
    taxiMesh.receiveShadow = true;
    root.add(taxiMesh);

    // 4 Taxiway-to-Runway High-Speed Turnoffs (Top strictly at yBase + 0.05)
    for (const turnoff of ap.taxiwayTurnoffs) {
      const tw = boundsToWorld(turnoff);
      const connRoad = new THREE.Mesh(
        new THREE.BoxGeometry(tw.w + 0.8, 0.02, tw.d + 0.8),
        taxiAsphaltMat
      );
      connRoad.position.set(tw.cx, yBase + 0.04, tw.cz);
      connRoad.receiveShadow = true;
      root.add(connRoad);
    }

    // =======================================================================
    // LAYER 5: RUNWAY & TAXIWAY PAINTED MARKINGS — Top strictly at `yBase + 0.06` (1.460)
    // =======================================================================
    const markTopY = yBase + 0.06;
    const markBoxCenterY = yBase + 0.058; // height 0.004 -> top strictly at yBase + 0.060

    // 5A. Dark Rubber Tire Skid Marks (opacity: 0.35) concentrated in touchdown zones at both ends
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x090b0e,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    for (const endDir of [-1, 1]) {
      const tdZoneCenterX = rwyW.cx + endDir * (rwyW.w * 0.5 - 16.5);
      for (const zOff of [-1.45, -0.85, -0.35, 0, 0.35, 0.85, 1.45]) {
        const skidLen = 15.5 + (Math.abs(zOff) < 0.5 ? 5.0 : 0);
        const skidMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(skidLen, 0.34),
          skidMat
        );
        skidMesh.rotation.x = -Math.PI * 0.5;
        skidMesh.position.set(tdZoneCenterX, markTopY - 0.001, rwyW.cz + zOff);
        root.add(skidMesh);
      }
    }

    // 5B. Crisp Bright White (#ffffff) Runway Side Edge Lines
    for (const zSide of [-1, 1]) {
      const edgeLine = new THREE.Mesh(
        new THREE.BoxGeometry(rwyW.w - 0.8, 0.004, 0.22),
        this.materials.whiteLine
      );
      edgeLine.position.set(
        rwyW.cx,
        markBoxCenterY,
        rwyW.cz + zSide * (rwyW.d * 0.5 - 0.35)
      );
      root.add(edgeLine);
    }

    // 5C. White Piano-Key Threshold Stripes, Bold "09" / "27" Numerals, & Wide Touchdown Zone Blocks
    for (const endDir of [-1, 1]) {
      const threshX = rwyW.cx + endDir * (rwyW.w * 0.5 - 2.3);
      for (let k = -4.5; k <= 4.5; k += 1.0) {
        const pianoKey = new THREE.Mesh(
          new THREE.BoxGeometry(2.8, 0.004, 0.44),
          this.materials.whiteLine
        );
        pianoKey.position.set(threshX, markBoxCenterY, rwyW.cz + k * 0.86);
        root.add(pianoKey);
      }

      // Bold Runway Designation Numerals ("09" at West threshold, "27" at East threshold)
      const numPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 3.2),
        endDir < 0 ? this.materials.runwayNum09 : this.materials.runwayNum27
      );
      numPlane.rotation.x = -Math.PI * 0.5;
      numPlane.rotation.z = endDir < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
      numPlane.position.set(
        rwyW.cx + endDir * (rwyW.w * 0.5 - 5.8),
        markTopY,
        rwyW.cz
      );
      root.add(numPlane);

      // Wide Touchdown Zone Double-Blocks
      for (const tdOffset of [9.8, 15.2, 24.4]) {
        const tdX = rwyW.cx + endDir * (rwyW.w * 0.5 - tdOffset);
        for (const zSide of [-1, 1]) {
          for (const pairOff of [-0.38, 0.38]) {
            const tdBar = new THREE.Mesh(
              new THREE.BoxGeometry(2.1, 0.004, 0.34),
              this.materials.whiteLine
            );
            tdBar.position.set(
              tdX,
              markBoxCenterY,
              rwyW.cz + zSide * 1.65 + pairOff
            );
            root.add(tdBar);
          }
        }
      }

      // Wide Solid Aiming-Point Blocks
      const aimX = rwyW.cx + endDir * (rwyW.w * 0.5 - 19.8);
      for (const zSide of [-1, 1]) {
        const aimBlock = new THREE.Mesh(
          new THREE.BoxGeometry(4.0, 0.004, 1.1),
          this.materials.whiteLine
        );
        aimBlock.position.set(aimX, markBoxCenterY, rwyW.cz + zSide * 1.85);
        root.add(aimBlock);
      }
    }

    // 5D. Thick Dashed White Runway Centerline
    const rwyDashSpan = rwyW.w - 14.5;
    const rwyDashCount = Math.floor(rwyDashSpan / 3.4);
    for (let i = 0; i < rwyDashCount; i++) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 0.004, 0.3),
        this.materials.whiteLine
      );
      dash.position.set(
        rwyW.cx - rwyDashSpan * 0.5 + 1.2 + i * 3.4,
        markBoxCenterY,
        rwyW.cz
      );
      root.add(dash);
    }

    // 5E. Bright Yellow (#facc15) Parallel Taxiway Centerline, Side Edge Lines & Turnoff Hold-Short Bars
    const taxiCenterLine = new THREE.Mesh(
      new THREE.BoxGeometry(taxiW.w - 0.8, 0.004, 0.18),
      this.materials.yellowLine
    );
    taxiCenterLine.position.set(taxiW.cx, markBoxCenterY, taxiW.cz);
    root.add(taxiCenterLine);

    for (const zSide of [-1, 1]) {
      const taxiEdge = new THREE.Mesh(
        new THREE.BoxGeometry(taxiW.w - 0.6, 0.004, 0.11),
        this.materials.yellowLine
      );
      taxiEdge.position.set(
        taxiW.cx,
        markBoxCenterY,
        taxiW.cz + zSide * (taxiW.d * 0.5 - 0.22)
      );
      root.add(taxiEdge);
    }

    for (const turnoff of ap.taxiwayTurnoffs) {
      const tw = boundsToWorld(turnoff);
      const connLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.004, tw.d + 1.4),
        this.materials.yellowLine
      );
      connLine.position.set(tw.cx, markBoxCenterY, tw.cz);
      root.add(connLine);

      for (const hOff of [-0.18, 0.18]) {
        const holdBar = new THREE.Mesh(
          new THREE.BoxGeometry(tw.w + 0.4, 0.004, 0.14),
          this.materials.yellowLine
        );
        holdBar.position.set(tw.cx, markBoxCenterY, tw.minZ + 0.75 + hOff);
        root.add(holdBar);
      }
    }

    // 5F. Crisp Yellow Taxiway Lead-In Lines & T-Stop Bars into the 4 Boarding Gate Bays (G1–G4) & Apron Stands
    //     (Strictly at Y = yBase + 0.06, zero noisy red/white overlapping boxes)
    const gatePierXOffsets = [3.6, 6.6, 9.6, 12.6]; // Relative to termW.cx

    // Lead-in curves & T-stop bars for the 4 Passenger Boarding Gates (G1–G4)
    for (let gIdx = 0; gIdx < 4; gIdx++) {
      const gateX = termW.cx + gatePierXOffsets[gIdx];
      const gateStopZ = termW.minZ - 2.2;
      const curveStartX = gateX - 2.4;
      const curveStartZ = taxiW.cz;

      const leadCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(curveStartX, markTopY, curveStartZ),
        new THREE.Vector3(gateX, markTopY, (curveStartZ + gateStopZ) * 0.46),
        new THREE.Vector3(gateX, markTopY, gateStopZ)
      );
      const curvePts = leadCurve.getPoints(16);
      for (let s = 0; s < curvePts.length - 1; s++) {
        const p0 = curvePts[s];
        const p1 = curvePts[s + 1];
        const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.06;
        const segMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.004, segLen),
          this.materials.yellowLine
        );
        segMesh.position.set(
          (p0.x + p1.x) * 0.5,
          markBoxCenterY,
          (p0.z + p1.z) * 0.5
        );
        segMesh.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
        root.add(segMesh);
      }

      const stopTBar = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.004, 0.16),
        this.materials.yellowLine
      );
      stopTBar.position.set(gateX, markBoxCenterY, gateStopZ);
      root.add(stopTBar);
    }

    // Crisp Yellow Aircraft Stand Lead-In Lines & T-Stop Bars (no cluttered red/white perimeter boxes)
    for (let sIdx = 0; sIdx < ap.parkingStands.length; sIdx++) {
      const stand = ap.parkingStands[sIdx];
      const sw = boundsToWorld(stand);

      const standConn = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.004, sw.cz - taxiW.cz),
        this.materials.yellowLine
      );
      standConn.position.set(
        stand.worldX,
        markBoxCenterY,
        (taxiW.cz + sw.cz) * 0.5
      );
      root.add(standConn);

      const stopBar = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.004, 0.16),
        this.materials.yellowLine
      );
      stopBar.position.set(sw.cx, markBoxCenterY, sw.cz + sw.d * 0.22);
      root.add(stopBar);
    }

    // =======================================================================
    // 6. UPGRADED CENTRAL TERMINAL & THE 4 BOARDING GATES / PIERS (`G1`–`G4`)
    // =======================================================================
    this.buildCargoTerminal10x15Visuals(root, termW, yBase);

    // =======================================================================
    // 7. SEPARATE 10x10 WAREHOUSE & 10x10 TRANSFER YARD
    // =======================================================================
    this.buildAirportWarehouseAndTransferYardVisuals(root, whW, tyW, yBase);

    // =======================================================================
    // 8. 2 CURVED-ROOF CORRUGATED STEEL HANGARS (East Airside Hangar Sector,
    //    Linked via Smooth Yellow-Centerlined Taxiway Curves to Parallel Taxiway)
    //    & 3-TANK AVIATION FUEL FARM IN CONTAINMENT BUND
    // =======================================================================
    this.lockBadgeSprites = [];
    this.buildAirportHangarsVisuals(root, taxiW, yBase, ap.owned);
    this.buildAirportFuelFarmVisuals(root, minWx, maxWx, maxWz, yBase);

    // =======================================================================
    // 8B. SECONDARY AIRPORT INFRASTRUCTURE (ARFF Fire/Rescue Station,
    //     Lined Staff Parking Lot & Continuous Perimeter Service Road)
    // =======================================================================
    this.buildAirportSecondaryInfrastructureVisuals(
      root,
      minWx,
      maxWx,
      minWz,
      maxWz,
      rwyW,
      termW,
      yBase
    );

    // =======================================================================
    // 9. UPGRADED AIR TRAFFIC CONTROL (ATC) TOWER (Flared Collar, 360° Glass Cab, Blinking Beacon)
    // =======================================================================
    this.buildAtcTowerVisuals(root, atcW, yBase);

    // =======================================================================
    // 10. AIRFIELD LIGHTING (Blue Taxiway Lights, White/Amber Runway Lights, 4-Light PAPI Boxes)
    // =======================================================================
    this.buildAirportLightingVisuals(root, rwyW, taxiW, ap.lighting, yBase);

    // =======================================================================
    // 11. ROTATING WHITE GEODESIC RADAR DOME (RADOME) & ANIMATED STRIPED WINDSOCK
    // =======================================================================
    this.buildRadarAndWindsockVisuals(root, radarW, infW, yBase);

    // =======================================================================
    // 12. WORLD-SPACE BLUE LOCK BADGE SPRITES (Main Airport & Expansion Zone)
    //     Note: ZERO static placeholder owned aircraft on the apron! Player-owned
    //     aircraft spawn strictly via `syncVehiclesVisuals` only after purchase.
    // =======================================================================
    if (!ap.owned) {
      this.addAirportLockBadgeSprite(
        root,
        'AIRPORT_MAIN',
        termW.cx,
        yBase + 3.2,
        termW.cz,
        0,
        'Airport - Locked',
        'International Cargo & Passenger Hub',
        15_000_000,
        termW.w + 4.0,
        6.5,
        termW.d + 4.0
      );
    }

    // 13. Landscaped Boulevard Trees & Streetlamps along the Landside Frontage Road
    this.buildAirportLandsideGreeneryAndStreetlights(
      root,
      minWx,
      maxWx,
      maxWz,
      yBase
    );
  }

  private buildAirportLandsideGreeneryAndStreetlights(
    root: THREE.Group,
    minWx: number,
    maxWx: number,
    maxWz: number,
    yBase: number
  ): void {
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x3b7a38,
      roughness: 0.8,
    });
    const hedgeMat = new THREE.MeshStandardMaterial({
      color: 0x45853f,
      roughness: 0.85,
    });
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });

    // 1. Zebra Crosswalks, White Stop Bars & Directional Lane Arrows along the 2x2 Landside Boulevard (gz=42..43)
    //    sits at road marking height `yBase + 0.05` (1.450) above the `yBase + 0.04` (1.440) perimeter road!
    const boulevardCenterZ = maxWz + 2.0; // gz=42.5 center of the 2x2 landside frontage road
    const rightRoadCenterX = maxWx + 2.0; // gx=192.5 center of the 2x2 right-side freight road
    const roadMarkY = yBase + 0.05;

    for (const crossX of [minWx + 19.0, minWx + 38.0, minWx + 58.0]) {
      for (let zStripe = -1.5; zStripe <= 1.5; zStripe += 0.5) {
        const zebraBar = new THREE.Mesh(
          new THREE.BoxGeometry(1.75, 0.004, 0.24),
          this.materials.whiteLine
        );
        zebraBar.position.set(crossX, roadMarkY, boulevardCenterZ + zStripe);
        root.add(zebraBar);
      }
      for (const stopDir of [-1.45, 1.45]) {
        const stopLine = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.004, 3.6),
          this.materials.whiteLine
        );
        stopLine.position.set(crossX + stopDir, roadMarkY, boulevardCenterZ);
        root.add(stopLine);
      }
    }

    // Dedicated Freight Security Gate Truck Approach Pad at Right-Side Entrance (top strictly at yBase + 0.04)
    const gateLoopPad = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.02, 8.6),
      this.materials.asphalt
    );
    gateLoopPad.position.set(maxWx + 0.8, yBase + 0.03, maxWz - 6.0);
    gateLoopPad.receiveShadow = true;
    root.add(gateLoopPad);

    for (const zArrow of [-8.2, -3.8]) {
      const arrowShaft = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.004, 0.18),
        this.materials.whiteLine
      );
      arrowShaft.position.set(maxWx + 1.1, roadMarkY, maxWz + zArrow);
      root.add(arrowShaft);
    }

    // Streetlamps along the Right-Side Freight Road (+X corridor)
    for (let wz = maxWz - 12.0; wz <= maxWz + 24.0; wz += 9.0) {
      const rLamp = new THREE.Group();
      rLamp.position.set(rightRoadCenterX + 2.35, yBase, wz);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 3.5, 6),
        this.materials.accentSteel
      );
      pole.position.y = 1.75;
      rLamp.add(pole);
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.06, 0.06),
        this.materials.accentSteel
      );
      arm.position.set(-0.35, 3.45, 0);
      rLamp.add(arm);
      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.08, 0.22),
        lampGlowMat
      );
      bulb.position.set(-0.72, 3.4, 0);
      rLamp.add(bulb);
      root.add(rLamp);
    }

    // 2. Boulevard trees & streetlights along the southern frontage sidewalk (+Z border)
    for (let wx = minWx + 4.0; wx <= maxWx - 4.0; wx += 7.5) {
      if (Math.abs(wx - (minWx + 44.0)) < 4.5) continue;

      const treeGroup = new THREE.Group();
      treeGroup.position.set(wx, yBase + 0.03, maxWz - 0.95);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.17, 1.0, 6),
        trunkMat
      );
      trunk.position.y = 0.5;
      treeGroup.add(trunk);

      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.82, 1),
        canopyMat
      );
      crown.scale.set(1.05, 0.88, 1.05);
      crown.position.y = 1.65;
      treeGroup.add(crown);

      const hedge = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.32, 0.55),
        hedgeMat
      );
      hedge.position.set(0, 0.16, 0);
      treeGroup.add(hedge);

      root.add(treeGroup);

      if (Math.round(wx) % 2 === 0) {
        const lampGroup = new THREE.Group();
        lampGroup.position.set(wx + 3.2, yBase + 0.03, maxWz - 0.65);

        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.07, 3.4, 6),
          this.materials.accentSteel
        );
        pole.position.y = 1.7;
        lampGroup.add(pole);

        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.06, 0.85),
          this.materials.accentSteel
        );
        arm.position.set(0, 3.35, 0.35);
        lampGroup.add(arm);

        const bulb = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.08, 0.32),
          lampGlowMat
        );
        bulb.position.set(0, 3.3, 0.72);
        lampGroup.add(bulb);

        root.add(lampGroup);
      }
    }
  }

  private buildAirportPerimeterFenceAndGates(
    root: THREE.Group,
    minWx: number,
    maxWx: number,
    minWz: number,
    maxWz: number,
    yBase: number,
    operational: boolean,
    gates: Array<{ worldX: number; worldZ: number; side: string }>
  ): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: operational ? 0x334155 : 0x57534e,
      metalness: 0.45,
      roughness: 0.6,
    });
    const meshMat = new THREE.MeshStandardMaterial({
      color: operational ? 0x64748b : 0x78716c,
      transparent: true,
      opacity: 0.42,
      roughness: 0.5,
    });

    const isNearGate = (wx: number, wz: number) =>
      gates.some((g) => Math.hypot(wx - g.worldX, wz - g.worldZ) < 3.6);

    const step = 3.2;
    for (const wz of [minWz + 0.2, maxWz - 0.2]) {
      for (let wx = minWx + 0.4; wx <= maxWx - 0.4; wx += step) {
        if (isNearGate(wx, wz)) continue;
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 1.35, 0.12),
          postMat
        );
        post.position.set(wx, yBase + 0.675, wz);
        root.add(post);

        if (wx + step <= maxWx && !isNearGate(wx + step * 0.5, wz)) {
          // Grounded concrete perimeter curb base beneath each fence span
          const curbBase = new THREE.Mesh(
            new THREE.BoxGeometry(step + 0.12, 0.12, 0.28),
            this.materials.curbstone
          );
          curbBase.position.set(wx + step * 0.5, yBase + 0.06, wz);
          curbBase.receiveShadow = true;
          root.add(curbBase);

          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(step, 1.15, 0.04),
            meshMat
          );
          panel.position.set(wx + step * 0.5, yBase + 0.62, wz);
          root.add(panel);
        }
      }
    }

    for (const wx of [minWx + 0.2, maxWx - 0.2]) {
      for (let wz = minWz + 0.4; wz <= maxWz - 0.4; wz += step) {
        if (isNearGate(wx, wz)) continue;
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 1.35, 0.12),
          postMat
        );
        post.position.set(wx, yBase + 0.675, wz);
        root.add(post);

        if (wz + step <= maxWz && !isNearGate(wx, wz + step * 0.5)) {
          // Grounded concrete perimeter curb base beneath each fence span
          const curbBase = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.12, step + 0.12),
            this.materials.curbstone
          );
          curbBase.position.set(wx, yBase + 0.06, wz + step * 0.5);
          curbBase.receiveShadow = true;
          root.add(curbBase);

          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 1.15, step),
            meshMat
          );
          panel.position.set(wx, yBase + 0.62, wz + step * 0.5);
          root.add(panel);
        }
      }
    }

    for (const gate of gates) {
      const gateGrp = new THREE.Group();
      gateGrp.position.set(gate.worldX, yBase + 0.03, gate.worldZ);

      const isRightSide = gate.side === 'RIGHT_EAST';
      const boothX = isRightSide ? -1.1 : -2.8;
      const boothZ = isRightSide ? -2.6 : -1.0;

      const gateBooth = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 2.0, 1.6),
        this.materials.concrete
      );
      gateBooth.position.set(boothX, 1.0, boothZ);
      gateBooth.castShadow = true;
      gateGrp.add(gateBooth);

      const boothGlass = new THREE.Mesh(
        new THREE.BoxGeometry(1.66, 0.68, 1.66),
        this.materials.cityGlass
      );
      boothGlass.position.set(boothX, 1.32, boothZ);
      gateGrp.add(boothGlass);

      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(
          isRightSide ? 2.6 : 5.2,
          0.18,
          isRightSide ? 5.2 : 2.6
        ),
        this.materials.depotRoof
      );
      canopy.position.set(
        isRightSide ? -0.4 : 0,
        2.85,
        isRightSide ? 0 : -0.4
      );
      gateGrp.add(canopy);

      const boomPedestal = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.95, 0.32),
        this.materials.safetyYellow
      );
      boomPedestal.position.set(
        isRightSide ? -0.2 : -1.8,
        0.475,
        isRightSide ? -1.8 : -0.2
      );
      gateGrp.add(boomPedestal);

      const boomArm = new THREE.Mesh(
        new THREE.BoxGeometry(
          isRightSide ? 0.1 : 2.8,
          0.1,
          isRightSide ? 2.8 : 0.1
        ),
        this.materials.gateRed
      );
      boomArm.position.set(
        isRightSide ? -0.2 : -0.4,
        0.88,
        isRightSide ? -0.4 : -0.2
      );
      gateGrp.add(boomArm);

      root.add(gateGrp);
    }
  }

  /**
   * Creates high-contrast illuminated rooftop signage texture reading "INTL AIRPORT"
   * with a glowing cyan/blue aviation wing emblem.
   */
  private createAirportRooftopSignTexture(text: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Deep slate-navy architectural backing
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1024, 256);

      // Glowing cyan border frame
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 10;
      ctx.strokeRect(12, 12, 1000, 232);

      // Stylized glowing blue/cyan aviation emblem on the left
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(60, 165);
      ctx.quadraticCurveTo(115, 95, 195, 60);
      ctx.quadraticCurveTo(150, 135, 130, 185);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(85, 190);
      ctx.quadraticCurveTo(135, 155, 205, 115);
      ctx.quadraticCurveTo(160, 185, 115, 205);
      ctx.closePath();
      ctx.fill();

      // High-contrast illuminated 3D white lettering
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 16;
      ctx.font = '900 108px "Arial Black", "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 565, 132);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * Creates high-contrast boarding gate number badge texture (`G1`, `G2`, `G3`, `G4`).
   */
  private createGateNumberTexture(gateLabel: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, 244, 116);
      ctx.fillStyle = '#facc15';
      ctx.font = '900 76px "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gateLabel, 128, 68);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * Builds:
   * 1. A simple, clean 2-lane Airport Access Road directly in front of the Main Terminal (`gz: 42..44`)
   *    with zero parking spaces, zero truck bays, zero cargo boxes, crisp white lane markings, raised curbs,
   *    and smooth junctions to the internal road network.
   * 2. The new dedicated Bottom-Right Corner Truck Cargo-Loading & Dispatch Facility (`gx: 194..218, gz: 43..59`)
   *    with:
   *    - Compact Cargo-Handling Warehouse / Loading Frontage (`6` recessed roll-up dock doors `01`–`06`,
   *      cantilevered weather canopy, rubber dock bumpers, yellow bollards, and `CARGO DISPATCH` signage)
   *    - Spacious asphalt/concrete truck manoeuvring & reversing apron (`14m+` clearance)
   *    - 6 marked yellow truck loading dock reversing bays (`D1`–`D6`)
   *    - 4 marked truck waiting/queuing positions (`Q1`–`Q4`)
   *    - Dedicated one-way truck approach lane (`TRUCK_YARD_ENTRY`) and departure lane (`TRUCK_YARD_EXIT`)
   */
  private buildCargoTerminalTruckYardVisuals(
    root: THREE.Group,
    truckYardW: {
      cx: number;
      cz: number;
      w: number;
      d: number;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    },
    termW: {
      cx: number;
      cz: number;
      w: number;
      d: number;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    },
    yBase: number
  ): void {
    const yardGroup = new THREE.Group();
    yardGroup.name = 'airport-cargo-terminal-truck-yard';
    root.add(yardGroup);

    const roadY = yBase + 0.04;
    const markY = yBase + 0.06;
    const curbH = 0.14;
    const curbW = 0.32;
    const curbY = roadY + curbH * 0.5;

    // =========================================================================
    // PART 1: SIMPLE, CLEAN 2-LANE AIRPORT ACCESS ROAD IN FRONT OF MAIN TERMINAL
    //         (No parking spaces, no truck loading bays, no cargo boxes, no clutter!)
    // =========================================================================
    const westGateWp = this.world.grid.gridToWorld(152, 43);
    const eastConnWp = this.world.grid.gridToWorld(220, 44);
    const termRoadZ = termW.maxZ + 3.4;
    const termRoadW = 5.4;
    const mainAccessMinX = westGateWp.x - 1.2;
    const mainAccessMaxX = eastConnWp.x + 1.0;
    const mainAccessSpanX = mainAccessMaxX - mainAccessMinX;
    const mainAccessCx = (mainAccessMinX + mainAccessMaxX) * 0.5;

    // Clean continuous dark-charcoal asphalt roadway running West Perimeter Gate -> Main Terminal Frontage -> Bottom-Right Cargo Facility
    const terminalAccessRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(mainAccessSpanX, termRoadW),
      this.materials.asphalt
    );
    terminalAccessRoad.rotation.x = -Math.PI * 0.5;
    terminalAccessRoad.position.set(mainAccessCx, roadY, termRoadZ);
    terminalAccessRoad.receiveShadow = true;
    yardGroup.add(terminalAccessRoad);

    // Clean pedestrian walkway apron between Main Terminal South facade and the North edge of the Access Road
    const termWalkwayDepth = Math.max(1.2, termRoadZ - termRoadW * 0.5 - termW.maxZ);
    const termWalkway = new THREE.Mesh(
      new THREE.BoxGeometry(termW.w + 6.0, 0.03, termWalkwayDepth),
      this.materials.concrete
    );
    termWalkway.position.set(
      termW.cx,
      yBase + 0.025,
      termW.maxZ + termWalkwayDepth * 0.5
    );
    termWalkway.receiveShadow = true;
    yardGroup.add(termWalkway);

    // Crisp Continuous White Side Edge Lines along the Terminal Frontage Access Road
    for (const zSide of [-1, 1]) {
      const edgeLine = new THREE.Mesh(
        new THREE.BoxGeometry(mainAccessSpanX - 1.6, 0.004, 0.12),
        this.materials.whiteLine
      );
      edgeLine.position.set(
        mainAccessCx,
        markY,
        termRoadZ + zSide * (termRoadW * 0.5 - 0.36)
      );
      yardGroup.add(edgeLine);
    }

    // Crisp Dashed White Centerline along the Terminal Frontage Access Road
    for (let lx = mainAccessMinX + 2.4; lx <= mainAccessMaxX - 2.4; lx += 2.8) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 0.004, 0.14),
        this.materials.whiteLine
      );
      dash.position.set(lx, markY, termRoadZ);
      yardGroup.add(dash);
    }

    // Raised Concrete Curb along the North side of the Access Road (separating road from Terminal & ATC plaza)
    const northAccessCurb = new THREE.Mesh(
      new THREE.BoxGeometry(mainAccessSpanX - 2.0, curbH, curbW),
      this.materials.curbstone
    );
    northAccessCurb.position.set(
      mainAccessCx,
      curbY,
      termRoadZ - termRoadW * 0.5 - curbW * 0.5
    );
    yardGroup.add(northAccessCurb);

    // Raised Concrete Curbs along the South side of the Terminal Frontage Access Road (with clean junction opening at gx=192)
    const internalRoadWp = this.world.grid.gridToWorld(192, 44);
    const westSouthCurbSpan = internalRoadWp.x - 3.2 - mainAccessMinX;
    if (westSouthCurbSpan > 2.0) {
      const westSouthCurb = new THREE.Mesh(
        new THREE.BoxGeometry(westSouthCurbSpan, curbH, curbW),
        this.materials.curbstone
      );
      westSouthCurb.position.set(
        mainAccessMinX + westSouthCurbSpan * 0.5,
        curbY,
        termRoadZ + termRoadW * 0.5 + curbW * 0.5
      );
      yardGroup.add(westSouthCurb);
    }

    // =========================================================================
    // PART 2: NEW BOTTOM-RIGHT TRUCK CARGO-LOADING & DISPATCH FACILITY
    //         (`gx: 194..211, gz: 43..59` — cleanly separated from Fuel Farm!)
    // =========================================================================
    const dockWp0 = this.world.grid.gridToWorld(196, 52);
    const queueWp0 = this.world.grid.gridToWorld(196, 46);
    const dockSpacingX = 3.1;
    const dockCount = 6;
    const firstDockX = dockWp0.x;
    const lastDockX = firstDockX + (dockCount - 1) * dockSpacingX;
    const facilityCenterX = (firstDockX + lastDockX) * 0.5;

    // 2A. Spacious Asphalt Truck Manoeuvring, Waiting & Reversing Apron (`gz: 43..53`)
    const apronMinX = firstDockX - 3.2;
    const apronMaxX = lastDockX + 3.4;
    const apronSpanW = apronMaxX - apronMinX;
    const apronCx = (apronMinX + apronMaxX) * 0.5;
    const apronMinZ = termRoadZ - termRoadW * 0.5;
    const dockWallFaceZ = dockWp0.z + 1.55;
    const apronMaxZ = dockWallFaceZ + 0.25;
    const apronSpanD = apronMaxZ - apronMinZ;
    const apronCz = (apronMinZ + apronMaxZ) * 0.5;

    const brManoeuvringAsphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(apronSpanW, apronSpanD),
      this.materials.asphalt
    );
    brManoeuvringAsphalt.rotation.x = -Math.PI * 0.5;
    brManoeuvringAsphalt.position.set(apronCx, roadY, apronCz);
    brManoeuvringAsphalt.receiveShadow = true;
    yardGroup.add(brManoeuvringAsphalt);

    // Raised Concrete Curbs framing the West & East sides of the Bottom-Right Truck Manoeuvring Apron
    for (const xEdge of [apronMinX + 0.16, apronMaxX - 0.16]) {
      const sideApronCurb = new THREE.Mesh(
        new THREE.BoxGeometry(curbW, curbH, apronSpanD - termRoadW - 1.2),
        this.materials.curbstone
      );
      sideApronCurb.position.set(
        xEdge,
        curbY,
        apronMinZ + termRoadW + (apronSpanD - termRoadW) * 0.5
      );
      yardGroup.add(sideApronCurb);
    }

    // Raised Traffic Divider Island separating the North Approach/Departure Road from the Reversing Apron
    const islandZ = queueWp0.z - 1.45;
    const dividerIsland = new THREE.Mesh(
      new THREE.BoxGeometry(apronSpanW * 0.52, curbH, 0.38),
      this.materials.curbstone
    );
    dividerIsland.position.set(apronCx, curbY, islandZ);
    yardGroup.add(dividerIsland);

    // 2B. 4 Clearly Marked Truck Waiting / Queuing Positions (`Q1`–`Q4`) along the Staging Lane
    for (let qIdx = 0; qIdx < 4; qIdx++) {
      const qWx = queueWp0.x + qIdx * dockSpacingX;
      const qWz = queueWp0.z;
      const stallW = 3.2;
      const stallD = 1.75;

      for (const zSide of [-1, 1]) {
        const qLine = new THREE.Mesh(
          new THREE.BoxGeometry(stallW, 0.004, 0.12),
          this.materials.yellowLine
        );
        qLine.position.set(qWx, markY, qWz + zSide * (stallD * 0.5));
        yardGroup.add(qLine);
      }
      const frontStop = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.004, stallD),
        this.materials.safetyYellow
      );
      frontStop.position.set(qWx + stallW * 0.5, markY, qWz);
      yardGroup.add(frontStop);
    }

    // 2C. 6 Separated Truck Loading Dock Bays (`D1`–`D6`) with Yellow Reversing Guide Stripes, Bumpers & Bollards
    const dockReverseLen = 4.6;
    for (let dIdx = 0; dIdx < dockCount; dIdx++) {
      const dockWx = firstDockX + dIdx * dockSpacingX;
      const dockGuideCz = dockWallFaceZ - dockReverseLen * 0.5;

      // Left & Right Yellow Reversing Guide Stripes for each Loading Bay
      for (const side of [-1, 1]) {
        const guideLine = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.004, dockReverseLen),
          this.materials.yellowLine
        );
        guideLine.position.set(dockWx + side * 1.15, markY, dockGuideCz);
        yardGroup.add(guideLine);
      }

      // Rear Yellow Dock Stop Bar
      const stopBar = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 0.004, 0.18),
        this.materials.safetyYellow
      );
      stopBar.position.set(dockWx, markY, dockWallFaceZ - 0.36);
      yardGroup.add(stopBar);

      // Heavy-duty black rubber Loading Dock Bumpers mounted against the Cargo Facility dock face
      for (const bSide of [-0.72, 0.72]) {
        const dockBumper = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.48, 0.24),
          this.materials.tyreRubber
        );
        dockBumper.position.set(dockWx + bSide, yBase + 0.32, dockWallFaceZ - 0.12);
        yardGroup.add(dockBumper);
      }

      // Yellow Steel Safety Bollards flanking each loading bay
      for (const side of [-1, 1]) {
        const bollard = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.09, 0.72, 8),
          this.materials.safetyYellow
        );
        bollard.position.set(
          dockWx + side * 1.28,
          yBase + 0.4,
          dockWallFaceZ - 0.24
        );
        yardGroup.add(bollard);
      }

      // Tucked Loading-Bay Cargo Pallet strictly inside each recessed dock bay (hidden unless truck is actively docked)
      const dockPallet = new THREE.Mesh(
        new THREE.BoxGeometry(1.12, 0.7, 0.92),
        this.materials.brushedAluminiumUld
      );
      dockPallet.position.set(dockWx, yBase + 0.42, dockWallFaceZ + 0.65);
      dockPallet.visible = false;
      dockPallet.castShadow = true;
      dockPallet.userData = { baseZ: dockWallFaceZ + 0.65, dockIndex: dIdx };
      this.yardDockPalletMeshes.push(dockPallet);
      yardGroup.add(dockPallet);
    }

    // 2D. Directional White Circulation Arrows on the Approach & Departure Lanes
    for (let ax = apronMinX + 3.5; ax <= apronMaxX - 3.5; ax += 7.5) {
      const arrowShaft = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.005, 0.18),
        this.materials.whiteLine
      );
      arrowShaft.position.set(ax, markY, termRoadZ + 1.1);
      yardGroup.add(arrowShaft);

      const arrowHead = new THREE.Mesh(
        new THREE.ConeGeometry(0.34, 0.68, 3),
        this.materials.whiteLine
      );
      arrowHead.rotation.z = -Math.PI * 0.5;
      arrowHead.rotation.y = Math.PI * 0.5;
      arrowHead.position.set(ax + 0.85, markY, termRoadZ + 1.1);
      yardGroup.add(arrowHead);
    }

    // 2E. Compact Cargo-Handling Warehouse / Truck Loading Frontage Building (`gx: 195..210, gz: 53..58`)
    const bldgW = (dockCount - 1) * dockSpacingX + 4.8; // 20.3m wide
    const bldgD = 5.8;
    const bldgH = 3.85;
    const bldgCz = dockWallFaceZ + bldgD * 0.5;

    const facilityGroup = new THREE.Group();
    facilityGroup.name = 'airport-bottom-right-truck-loading-facility';
    facilityGroup.position.set(facilityCenterX, yBase + 0.03, bldgCz);

    const precastMat = new THREE.MeshStandardMaterial({
      color: 0xcfd6df,
      roughness: 0.44,
      metalness: 0.22,
    });
    const slateTrimMat = new THREE.MeshStandardMaterial({
      color: 0x263040,
      roughness: 0.38,
      metalness: 0.55,
    });
    const roofMembraneMat = new THREE.MeshStandardMaterial({
      color: 0x9aa4b2,
      roughness: 0.68,
      metalness: 0.18,
    });
    const officeGlassMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.14,
      metalness: 0.85,
    });
    const canopyGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      roughness: 0.3,
    });

    // Concrete foundation plinth
    const bldgPlinth = new THREE.Mesh(
      new THREE.BoxGeometry(bldgW + 1.2, 0.2, bldgD + 1.0),
      this.materials.concrete
    );
    bldgPlinth.position.set(0, 0.1, 0);
    bldgPlinth.receiveShadow = true;
    facilityGroup.add(bldgPlinth);

    // Main Cargo-Handling Warehouse Hall
    const mainHall = new THREE.Mesh(
      new THREE.BoxGeometry(bldgW, bldgH, bldgD),
      precastMat
    );
    mainHall.position.set(0, 0.2 + bldgH * 0.5, 0);
    mainHall.castShadow = true;
    mainHall.receiveShadow = true;
    facilityGroup.add(mainHall);

    // Dark-slate upper cornice band (`#263040`)
    const upperCornice = new THREE.Mesh(
      new THREE.BoxGeometry(bldgW + 0.18, 0.48, bldgD + 0.18),
      slateTrimMat
    );
    upperCornice.position.set(0, 0.2 + bldgH - 0.18, 0);
    facilityGroup.add(upperCornice);

    // Flat insulated roof deck + skylight bands + modular HVAC units
    const roofDeck = new THREE.Mesh(
      new THREE.BoxGeometry(bldgW - 0.4, 0.14, bldgD - 0.4),
      roofMembraneMat
    );
    roofDeck.position.set(0, 0.2 + bldgH + 0.08, 0);
    facilityGroup.add(roofDeck);

    for (const skZ of [-1.1, 1.1]) {
      const skylight = new THREE.Mesh(
        new THREE.BoxGeometry(bldgW * 0.76, 0.16, 0.95),
        officeGlassMat
      );
      skylight.position.set(0, 0.2 + bldgH + 0.16, skZ);
      facilityGroup.add(skylight);
    }

    // Cantilevered Dark-Steel Weather Canopy projecting North (-Z) over the 6 Loading Bays
    const canopyD = 2.4;
    const canopyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(bldgW - 0.6, 0.28, canopyD),
      slateTrimMat
    );
    canopyMesh.position.set(0, 2.86, -(bldgD * 0.5 + canopyD * 0.46));
    canopyMesh.castShadow = true;
    facilityGroup.add(canopyMesh);

    const canopyLightStrip = new THREE.Mesh(
      new THREE.BoxGeometry(bldgW - 1.8, 0.06, 0.32),
      canopyGlowMat
    );
    canopyLightStrip.position.set(0, 2.7, -(bldgD * 0.5 + canopyD * 0.5));
    facilityGroup.add(canopyLightStrip);

    // 6 Recessed Roll-Up Truck Loading Doors (`01`–`06`) with Dark Weather-Seal Dock Shelters & Number Signs
    for (let dIdx = 0; dIdx < dockCount; dIdx++) {
      const localDx = firstDockX + dIdx * dockSpacingX - facilityCenterX;
      const northFaceZ = -bldgD * 0.5;

      const dockShelter = new THREE.Mesh(
        new THREE.BoxGeometry(1.96, 2.42, 0.3),
        slateTrimMat
      );
      dockShelter.position.set(localDx, 1.32, northFaceZ - 0.05);
      facilityGroup.add(dockShelter);

      const shutterDoor = new THREE.Mesh(
        new THREE.BoxGeometry(1.58, 2.15, 0.22),
        precastMat
      );
      shutterDoor.position.set(localDx, 1.24, northFaceZ - 0.1);
      facilityGroup.add(shutterDoor);

      // Overhead Dock Bay Number Plate (`01`–`06`)
      const bayNumTex = this.createGateNumberTexture(`0${dIdx + 1}`);
      const bayNumPlate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.76, 0.36),
        new THREE.MeshBasicMaterial({ map: bayNumTex })
      );
      bayNumPlate.position.set(localDx, 3.22, northFaceZ - 0.11);
      bayNumPlate.rotation.y = Math.PI;
      facilityGroup.add(bayNumPlate);
    }

    // Glazed Dispatch Office Wing on the West Corner of the Cargo Loading Facility
    const dispatchWing = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, bldgH + 0.75, bldgD - 0.6),
      slateTrimMat
    );
    dispatchWing.position.set(-bldgW * 0.5 - 1.2, 0.2 + (bldgH + 0.75) * 0.5, 0);
    dispatchWing.castShadow = true;
    facilityGroup.add(dispatchWing);

    const dispatchGlass = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 2.1, bldgD - 0.4),
      officeGlassMat
    );
    dispatchGlass.position.set(-bldgW * 0.5 - 1.2, 2.35, 0);
    facilityGroup.add(dispatchGlass);

    yardGroup.add(facilityGroup);
  }

  /**
   * Builds the Upgraded 10 x 15 Central Airport Cargo Terminal & the 4 Boarding Gates / Piers (`G1`–`G4`)
   * with:
   * - Unified, welded cantilevered metallic roof assembly (`roughness: 0.18, metalness: 0.82`)
  /**
   * Builds the Reconstructed 10 x 15 Central Airport Cargo & Passenger Terminal (`facility-airport-cargo-terminal`)
   * matching the Middle-Left & Bottom-Left panels of the reference composite:
   * - Multi-wing modern architectural concrete & brushed silver-grey Alucobond facade (`#d8dde4`)
   * - Deep navy-slate reflective curtain glazing (`#1c3554`, `roughness: 0.14, metalness: 0.86`) with
   *   visible horizontal floor slabs and dark charcoal-slate mullions (`#263040`)
   * - Projecting central vertical glass atrium tower
   * - Stepped flat matte-slate roofs (`#7c8594`) with raised light-grey parapets (`#d8dde4`),
   *   rooftop HVAC chiller banks, galvanized ductwork, and recessed skylights
   * - Airside (-Z) enclosed silver-and-glass concourse with 4 articulated boarding jetbridges (`G1`–`G4`)
   * - Landside (+Z) continuous cantilevered dark-steel freight canopy over 6 recessed loading bays (`01`–`06`)
   */
  private buildCargoTerminal10x15Visuals(
    root: THREE.Group,
    termW: {
      cx: number;
      cz: number;
      w: number;
      d: number;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    },
    yBase: number
  ): void {
    const tGroup = new THREE.Group();
    tGroup.name = 'facility-airport-cargo-terminal';
    tGroup.position.set(termW.cx, yBase + 0.03, termW.cz);

    const d = termW.d - 1.2; // ~18.8m

    // Architectural Materials matching Middle-Left & Bottom-Left Reference Panels
    const alucobondSilverMat = new THREE.MeshStandardMaterial({
      color: 0xd8dde4,
      roughness: 0.34,
      metalness: 0.38,
    });
    const precastLightGreyMat = new THREE.MeshStandardMaterial({
      color: 0xcfd5dd,
      roughness: 0.52,
      metalness: 0.18,
    });
    const darkSlateFrameMat = new THREE.MeshStandardMaterial({
      color: 0x263040,
      roughness: 0.38,
      metalness: 0.58,
    });
    const flatRoofMembraneMat = new THREE.MeshStandardMaterial({
      color: 0x7c8594,
      roughness: 0.72,
      metalness: 0.15,
    });
    const navyCurtainGlassMat = new THREE.MeshStandardMaterial({
      color: 0x1c3554,
      roughness: 0.14,
      metalness: 0.86,
    });
    const skylightGlassMat = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      roughness: 0.18,
      metalness: 0.75,
    });
    const warmInteriorSlabMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfde68a,
      emissiveIntensity: 0.28,
      roughness: 0.45,
    });
    const hvacMetalMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.42,
      metalness: 0.52,
    });

    // =====================================================================
    // PART A: MULTI-WING MAIN TERMINAL BUILDING (West/Central section of `termW`)
    // =====================================================================
    const mainTermX = -5.4;
    const mainTermW = 16.0;
    const mainTermD = d * 0.76; // ~14.3m
    const wingH = 5.4;
    const atriumH = 6.7;

    // 1. Grounded Architectural Concrete Podium Plinth
    const termPlinth = new THREE.Mesh(
      new THREE.BoxGeometry(mainTermW + 1.4, 0.24, mainTermD + 1.4),
      darkSlateFrameMat
    );
    termPlinth.position.set(mainTermX, 0.12, 0);
    termPlinth.receiveShadow = true;
    tGroup.add(termPlinth);

    // 2. Main 2-Story Brushed-Silver & Navy-Glass Terminal Wings (West & East of Central Atrium)
    const wingBody = new THREE.Mesh(
      new THREE.BoxGeometry(mainTermW, wingH, mainTermD),
      alucobondSilverMat
    );
    wingBody.position.set(mainTermX, 0.24 + wingH * 0.5, 0);
    wingBody.castShadow = true;
    wingBody.receiveShadow = true;
    tGroup.add(wingBody);

    // Recessed Deep Navy-Slate Curtain Wall Glazing Panels on Airside (-Z), Landside (+Z), and Side Faces
    const glazingBandH = wingH - 1.35;
    const glazingBand = new THREE.Mesh(
      new THREE.BoxGeometry(mainTermW - 1.2, glazingBandH, mainTermD + 0.08),
      navyCurtainGlassMat
    );
    glazingBand.position.set(mainTermX, 0.24 + wingH * 0.5 - 0.1, 0);
    tGroup.add(glazingBand);

    const sideGlazingBand = new THREE.Mesh(
      new THREE.BoxGeometry(mainTermW + 0.08, glazingBandH, mainTermD - 1.8),
      navyCurtainGlassMat
    );
    sideGlazingBand.position.set(mainTermX, 0.24 + wingH * 0.5 - 0.1, 0);
    tGroup.add(sideGlazingBand);

    // Horizontal Brushed-Silver Floor Spandrel Bands & Warm Interior Floor Slabs
    for (const bandY of [2.05, 3.85]) {
      const spandrel = new THREE.Mesh(
        new THREE.BoxGeometry(mainTermW + 0.18, 0.34, mainTermD + 0.18),
        alucobondSilverMat
      );
      spandrel.position.set(mainTermX, bandY, 0);
      spandrel.castShadow = true;
      tGroup.add(spandrel);

      const glowStrip = new THREE.Mesh(
        new THREE.BoxGeometry(mainTermW - 0.8, 0.1, mainTermD + 0.12),
        warmInteriorSlabMat
      );
      glowStrip.position.set(mainTermX, bandY - 0.22, 0);
      tGroup.add(glowStrip);
    }

    // Vertical Structural Pilasters & Dark Charcoal Mullions along Airside (-Z) and Landside (+Z)
    const numCols = 10;
    for (let i = 0; i <= numCols; i++) {
      const colX = mainTermX - mainTermW * 0.5 + (i / numCols) * mainTermW;
      const isMajorPier = i === 0 || i === 3 || i === 7 || i === numCols;
      for (const zSide of [-1, 1]) {
        const pilaster = new THREE.Mesh(
          new THREE.BoxGeometry(
            isMajorPier ? 0.52 : 0.16,
            wingH,
            isMajorPier ? 0.36 : 0.22
          ),
          isMajorPier ? alucobondSilverMat : darkSlateFrameMat
        );
        pilaster.position.set(
          colX,
          0.24 + wingH * 0.5,
          zSide * (mainTermD * 0.5 + 0.06)
        );
        tGroup.add(pilaster);
      }
    }

    // 3. Projecting Central Vertical Glass Atrium Tower (Matches Middle-Left Reference Panel)
    const atriumW = 5.6;
    const atriumD = mainTermD + 1.5;
    const atriumCore = new THREE.Mesh(
      new THREE.BoxGeometry(atriumW, atriumH, atriumD),
      alucobondSilverMat
    );
    atriumCore.position.set(mainTermX, 0.24 + atriumH * 0.5, 0);
    atriumCore.castShadow = true;
    atriumCore.receiveShadow = true;
    tGroup.add(atriumCore);

    // Full-Height Vertical Navy Curtain Glass on Central Atrium Tower
    const atriumGlass = new THREE.Mesh(
      new THREE.BoxGeometry(atriumW - 1.1, atriumH - 0.75, atriumD + 0.1),
      navyCurtainGlassMat
    );
    atriumGlass.position.set(mainTermX, 0.24 + (atriumH - 0.3) * 0.5, 0);
    tGroup.add(atriumGlass);

    // Vertical Mullion Grid on Central Atrium Glass
    for (const mx of [-1.4, -0.45, 0.45, 1.4]) {
      for (const zSide of [-1, 1]) {
        const aMullion = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, atriumH - 0.75, 0.18),
          darkSlateFrameMat
        );
        aMullion.position.set(
          mainTermX + mx,
          0.24 + (atriumH - 0.3) * 0.5,
          zSide * (atriumD * 0.5 + 0.04)
        );
        tGroup.add(aMullion);
      }
    }

    // Flat Overhanging Slate Roof & Raised Parapet on Central Atrium
    const atriumRoof = new THREE.Mesh(
      new THREE.BoxGeometry(atriumW + 0.6, 0.28, atriumD + 0.6),
      darkSlateFrameMat
    );
    atriumRoof.position.set(mainTermX, 0.24 + atriumH + 0.14, 0);
    atriumRoof.castShadow = true;
    tGroup.add(atriumRoof);

    const atriumTopDeck = new THREE.Mesh(
      new THREE.BoxGeometry(atriumW + 0.1, 0.14, atriumD + 0.1),
      flatRoofMembraneMat
    );
    atriumTopDeck.position.set(mainTermX, 0.24 + atriumH + 0.32, 0);
    tGroup.add(atriumTopDeck);

    // 4. Stepped Flat Matte-Slate Roofs (`#7c8594`) with Raised Light-Grey Parapets (`#d8dde4`),
    //    Rooftop HVAC Chiller Banks, Galvanized Ductwork & Skylights (NO cartoon vault or billboard!)
    const roofY = 0.24 + wingH;
    const flatRoofSlab = new THREE.Mesh(
      new THREE.BoxGeometry(mainTermW - 0.3, 0.18, mainTermD - 0.3),
      flatRoofMembraneMat
    );
    flatRoofSlab.position.set(mainTermX, roofY + 0.09, 0);
    flatRoofSlab.receiveShadow = true;
    tGroup.add(flatRoofSlab);

    // Raised Perimeter Architectural Parapet Walls (`#d8dde4`) with Dark-Slate Coping Trim
    const parapetH = 0.48;
    const parapetT = 0.32;
    for (const zSide of [-1, 1]) {
      const zParapet = new THREE.Mesh(
        new THREE.BoxGeometry(mainTermW + 0.24, parapetH, parapetT),
        alucobondSilverMat
      );
      zParapet.position.set(
        mainTermX,
        roofY + parapetH * 0.5,
        zSide * (mainTermD * 0.5 - parapetT * 0.5 + 0.08)
      );
      zParapet.castShadow = true;
      tGroup.add(zParapet);

      const zCoping = new THREE.Mesh(
        new THREE.BoxGeometry(mainTermW + 0.3, 0.08, parapetT + 0.06),
        darkSlateFrameMat
      );
      zCoping.position.set(
        mainTermX,
        roofY + parapetH + 0.04,
        zSide * (mainTermD * 0.5 - parapetT * 0.5 + 0.08)
      );
      tGroup.add(zCoping);
    }
    for (const xSide of [-1, 1]) {
      const xParapet = new THREE.Mesh(
        new THREE.BoxGeometry(parapetT, parapetH, mainTermD + 0.24),
        alucobondSilverMat
      );
      xParapet.position.set(
        mainTermX + xSide * (mainTermW * 0.5 - parapetT * 0.5 + 0.08),
        roofY + parapetH * 0.5,
        0
      );
      xParapet.castShadow = true;
      tGroup.add(xParapet);
    }

    // Rooftop HVAC Chiller Banks, Cooling Fans, Ductwork & Recessed Glass Skylights on West & East Wings
    for (const wingSide of [-1, 1]) {
      const wingCenterX = mainTermX + wingSide * 5.2;

      // Recessed Multi-Pane Glass Skylight Strip
      const skylightFrame = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 0.22, 2.2),
        darkSlateFrameMat
      );
      skylightFrame.position.set(wingCenterX, roofY + 0.22, -2.4);
      tGroup.add(skylightFrame);

      const skylightPane = new THREE.Mesh(
        new THREE.BoxGeometry(3.3, 0.26, 1.9),
        skylightGlassMat
      );
      skylightPane.position.set(wingCenterX, roofY + 0.24, -2.4);
      tGroup.add(skylightPane);

      // Industrial HVAC Chiller Bank & Ventilation Ducts
      for (const hOffX of [-1.4, 0.8]) {
        const chillerUnit = new THREE.Mesh(
          new THREE.BoxGeometry(1.55, 0.68, 1.25),
          hvacMetalMat
        );
        chillerUnit.position.set(wingCenterX + hOffX, roofY + 0.48, 2.2);
        chillerUnit.castShadow = true;
        tGroup.add(chillerUnit);

        // Dark fan grille on top of HVAC unit
        const fanGrille = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12),
          darkSlateFrameMat
        );
        fanGrille.position.set(wingCenterX + hOffX, roofY + 0.84, 2.2);
        tGroup.add(fanGrille);
      }

      // Galvanized Rooftop Ventilation Duct linking HVAC units to Atrium mechanical shaft
      const roofDuct = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 0.28, 0.36),
        hvacMetalMat
      );
      roofDuct.position.set(wingCenterX - wingSide * 0.8, roofY + 0.32, 0.6);
      tGroup.add(roofDuct);
    }

    // Subtle Integrated Fascia Emblem on the Central Atrium Header (replaces oversized neon billboard)
    const signTex = this.createAirportRooftopSignTexture('CARGO TERMINAL');
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    for (const faceDir of [1, -1]) {
      const signPlaque = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 0.68),
        signMat
      );
      signPlaque.position.set(
        mainTermX,
        0.24 + atriumH - 0.42,
        faceDir * (atriumD * 0.5 + 0.07)
      );
      if (faceDir < 0) signPlaque.rotation.y = Math.PI;
      tGroup.add(signPlaque);
    }

    // =====================================================================
    // PART B: AIRSIDE BOARDING CONCOURSE & 4 ARTICULATED SILVER JETBRIDGES (`G1`–`G4`)
    // =====================================================================
    const gatePierXOffsets = [3.6, 6.6, 9.6, 12.6];
    const pierW = 1.95;
    const pierH = 4.15;
    const pierD = d * 0.72; // ~13.5m

    // East Wing Concourse Hall linking Main Terminal to the 4 Boarding Gate Piers
    const spineW = 11.6;
    const spineH = 4.55;
    const spineD = 5.4;
    const spineX = 8.2;
    const spineZ = pierD * 0.25;

    const spineBody = new THREE.Mesh(
      new THREE.BoxGeometry(spineW, spineH, spineD),
      alucobondSilverMat
    );
    spineBody.position.set(spineX, 0.22 + spineH * 0.5, spineZ);
    spineBody.castShadow = true;
    spineBody.receiveShadow = true;
    tGroup.add(spineBody);

    const spineGlass = new THREE.Mesh(
      new THREE.BoxGeometry(spineW - 0.6, spineH - 1.1, spineD + 0.08),
      navyCurtainGlassMat
    );
    spineGlass.position.set(spineX, 0.22 + spineH * 0.5, spineZ);
    tGroup.add(spineGlass);

    const spineRoof = new THREE.Mesh(
      new THREE.BoxGeometry(spineW + 0.35, 0.26, spineD + 0.35),
      flatRoofMembraneMat
    );
    spineRoof.position.set(spineX, 0.22 + spineH + 0.13, spineZ);
    tGroup.add(spineRoof);

    // Build the 4 Silver-and-Glass Boarding Gate Concourse Piers (`G1`, `G2`, `G3`, `G4`)
    for (let k = 0; k < 4; k++) {
      const px = gatePierXOffsets[k];
      const gateName = `G${k + 1}`;
      const pierGroup = new THREE.Group();
      pierGroup.position.set(px, 0, -0.4);

      const pPlinth = new THREE.Mesh(
        new THREE.BoxGeometry(pierW + 0.24, 0.2, pierD + 0.24),
        darkSlateFrameMat
      );
      pPlinth.position.y = 0.1;
      pierGroup.add(pPlinth);

      const pBody = new THREE.Mesh(
        new THREE.BoxGeometry(pierW, pierH, pierD),
        alucobondSilverMat
      );
      pBody.position.y = 0.2 + pierH * 0.5;
      pBody.castShadow = true;
      pBody.receiveShadow = true;
      pierGroup.add(pBody);

      const pGlass = new THREE.Mesh(
        new THREE.BoxGeometry(pierW + 0.06, pierH - 1.25, pierD - 0.8),
        navyCurtainGlassMat
      );
      pGlass.position.y = 0.2 + pierH * 0.5 + 0.1;
      pierGroup.add(pGlass);

      const pSpandrel = new THREE.Mesh(
        new THREE.BoxGeometry(pierW + 0.12, 0.28, pierD + 0.12),
        alucobondSilverMat
      );
      pSpandrel.position.y = 2.15;
      pierGroup.add(pSpandrel);

      for (let mz = -pierD * 0.42; mz <= pierD * 0.42; mz += 2.2) {
        const mull = new THREE.Mesh(
          new THREE.BoxGeometry(pierW + 0.12, pierH - 0.4, 0.12),
          darkSlateFrameMat
        );
        mull.position.set(0, 0.2 + pierH * 0.5, mz);
        pierGroup.add(mull);
      }

      const pRoofDeck = new THREE.Mesh(
        new THREE.BoxGeometry(pierW + 0.22, 0.2, pierD + 0.22),
        flatRoofMembraneMat
      );
      pRoofDeck.position.y = 0.2 + pierH + 0.1;
      pierGroup.add(pRoofDeck);

      const gateTex = this.createGateNumberTexture(gateName);
      const gateSignMat = new THREE.MeshBasicMaterial({ map: gateTex });
      const gBoard = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.56, 0.14),
        darkSlateFrameMat
      );
      gBoard.position.set(0, 0.2 + pierH + 0.48, -(pierD * 0.5 - 0.35));
      pierGroup.add(gBoard);

      const gFace = new THREE.Mesh(
        new THREE.PlaneGeometry(1.06, 0.48),
        gateSignMat
      );
      gFace.position.set(0, 0.2 + pierH + 0.48, -(pierD * 0.5 - 0.26));
      gFace.rotation.y = Math.PI;
      pierGroup.add(gFace);

      // Articulated Silver-and-Glass Boarding Jetbridge (`Jetway`) at Airside Tip (-Z)
      const jetBridgeGroup = new THREE.Group();
      jetBridgeGroup.position.set(0, 0, -pierD * 0.5);

      const rotunda = new THREE.Mesh(
        new THREE.CylinderGeometry(0.76, 0.76, 1.38, 14),
        alucobondSilverMat
      );
      rotunda.position.set(0, 2.45, -0.35);
      jetBridgeGroup.add(rotunda);

      const tunnelLen = 2.95;
      const tunnel = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, 1.16, tunnelLen),
        alucobondSilverMat
      );
      tunnel.position.set(-0.35, 2.35, -1.68);
      tunnel.rotation.y = 0.22;
      tunnel.castShadow = true;
      jetBridgeGroup.add(tunnel);

      const tunnelWindow = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.48, tunnelLen * 0.82),
        navyCurtainGlassMat
      );
      tunnelWindow.position.set(-0.35, 2.42, -1.68);
      tunnelWindow.rotation.y = 0.22;
      jetBridgeGroup.add(tunnelWindow);

      const supportBogie = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 2.3, 8),
        darkSlateFrameMat
      );
      supportBogie.position.set(-0.62, 1.15, -2.75);
      jetBridgeGroup.add(supportBogie);

      const dockingHood = new THREE.Mesh(
        new THREE.BoxGeometry(1.08, 1.24, 0.42),
        darkSlateFrameMat
      );
      dockingHood.position.set(-0.65, 2.32, -2.95);
      dockingHood.rotation.y = 0.22;
      jetBridgeGroup.add(dockingHood);

      const hoodSafetyTrim = new THREE.Mesh(
        new THREE.BoxGeometry(1.12, 0.14, 0.44),
        this.materials.safetyYellow
      );
      hoodSafetyTrim.position.set(-0.65, 1.76, -2.95);
      hoodSafetyTrim.rotation.y = 0.22;
      jetBridgeGroup.add(hoodSafetyTrim);

      pierGroup.add(jetBridgeGroup);
      tGroup.add(pierGroup);
    }

    // =====================================================================
    // PART C: LANDSIDE FREIGHT LOADING DOCK CANOPY & 6 RECESSED DOCK BAYS (+Z Face)
    //         Matches Bottom-Left Reference Panel (Pre-cast concrete freight facade + dark cantilevered canopy)
    // =====================================================================
    const dockPositionsX = [-11.0, -6.6, -2.2, 2.2, 6.6, 11.0];
    const landsideFaceZ = mainTermD * 0.5;

    // Continuous Cantilevered Dark-Charcoal Steel Weather Canopy (`#263040`) projecting over all 6 loading bays
    const dockCanopyW = 25.4;
    const dockCanopyD = 2.65;
    const dockCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(dockCanopyW, 0.32, dockCanopyD),
      darkSlateFrameMat
    );
    dockCanopy.position.set(0, 2.88, landsideFaceZ + dockCanopyD * 0.45);
    dockCanopy.castShadow = true;
    tGroup.add(dockCanopy);

    // Silver fascia trim strip along outer edge of cantilevered loading canopy
    const canopyTrim = new THREE.Mesh(
      new THREE.BoxGeometry(dockCanopyW + 0.08, 0.12, 0.14),
      precastLightGreyMat
    );
    canopyTrim.position.set(0, 2.94, landsideFaceZ + dockCanopyD * 0.94);
    tGroup.add(canopyTrim);

    // Warm downlighting strip under the freight loading dock canopy
    const canopyLight = new THREE.Mesh(
      new THREE.BoxGeometry(dockCanopyW - 1.2, 0.06, 0.36),
      warmInteriorSlabMat
    );
    canopyLight.position.set(0, 2.7, landsideFaceZ + dockCanopyD * 0.5);
    tGroup.add(canopyLight);

    // 6 Recessed Industrial Roll-Up Freight Loading Dock Bays (`01`–`06`) with Dock Shelters & Yellow Bumpers
    for (let dIdx = 0; dIdx < dockPositionsX.length; dIdx++) {
      const dx = dockPositionsX[dIdx];

      // Dark weather-seal dock shelter frame around each loading door
      const dockShelter = new THREE.Mesh(
        new THREE.BoxGeometry(1.92, 2.42, 0.32),
        darkSlateFrameMat
      );
      dockShelter.position.set(dx, 1.32, landsideFaceZ + 0.06);
      tGroup.add(dockShelter);

      // Recessed light-grey sectional roll-up door shutter
      const rollUpDoor = new THREE.Mesh(
        new THREE.BoxGeometry(1.56, 2.16, 0.24),
        precastLightGreyMat
      );
      rollUpDoor.position.set(dx, 1.24, landsideFaceZ + 0.12);
      tGroup.add(rollUpDoor);

      // Yellow safety guide stripes flanking each dock door
      for (const sSide of [-0.88, 0.88]) {
        const safetyStripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 1.2, 0.36),
          this.materials.safetyYellow
        );
        safetyStripe.position.set(dx + sSide, 0.68, landsideFaceZ + 0.08);
        tGroup.add(safetyStripe);
      }
    }

    root.add(tGroup);
  }

  /**
   * Builds the separate 10 x 10 Airport Cargo Warehouse (`facility-airport-warehouse`)
   * and the adjacent separate 10 x 10 Airport Transfer Yard (`facility-airport-transfer-yard`)
   * matching the Bottom-Left reference panel:
   * - Pre-cast light-grey concrete & steel logistics building (`#cfd5dd`) with vertical structural pilasters (`#8b95a5`),
   *   dark-slate upper cornice band (`#334155`), cantilevered dark steel loading-dock canopy, rooftop skylights & HVAC units,
   *   and an attached 2-story glazed dispatch office block.
   * - Adjacent Transfer Yard with organized multi-color ISO intermodal shipping container stacks (red, blue, orange, slate)
   *   and palletized ULD air-cargo racks inside painted yellow staging bays.
   */
  private buildAirportWarehouseAndTransferYardVisuals(
    root: THREE.Group,
    whW: {
      cx: number;
      cz: number;
      w: number;
      d: number;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    },
    tyW: {
      cx: number;
      cz: number;
      w: number;
      d: number;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    },
    yBase: number
  ): void {
    const whState = this.world.economy.getAirportWarehouse();
    const cs = this.world.config.cellSize;
    const conB = whState.constructedBounds;
    const p0 = this.world.grid.gridToWorld(conB.minGx, conB.minGz);
    const p1 = this.world.grid.gridToWorld(conB.maxGx, conB.maxGz);
    const conCx = (p0.x + p1.x) * 0.5;
    const conCz = (p0.z + p1.z) * 0.5;
    const conW = Math.max(8, conB.widthCells * cs - 1.2);
    const conD = Math.max(8, conB.depthCells * cs - 1.8);
    const bldH = 4.8;

    const whGroup = new THREE.Group();
    whGroup.name = 'facility-airport-warehouse';
    whGroup.position.set(conCx, yBase + 0.03, conCz);

    // Concrete Foundation Pad for 10x10 Cargo Warehouse (Strict Y = yBase + 0.03)
    const whPad = new THREE.Mesh(
      new THREE.PlaneGeometry(whW.w + 1.2, whW.d + 1.2),
      this.materials.concrete
    );
    whPad.rotation.x = -Math.PI * 0.5;
    whPad.position.set(0, 0.002, 0);
    whPad.receiveShadow = true;
    whGroup.add(whPad);

    const precastWallMat = new THREE.MeshStandardMaterial({
      color: 0xcfd5dd,
      roughness: 0.54,
      metalness: 0.18,
    });
    const pilasterMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.58,
      metalness: 0.22,
    });
    const darkSlateCorniceMat = new THREE.MeshStandardMaterial({
      color: 0x263040,
      roughness: 0.38,
      metalness: 0.56,
    });
    const whRoofMat = new THREE.MeshStandardMaterial({
      color: 0x7c8594,
      roughness: 0.68,
      metalness: 0.2,
    });
    const navyGlassMat = new THREE.MeshStandardMaterial({
      color: 0x1c3554,
      roughness: 0.15,
      metalness: 0.85,
    });
    const skylightMat = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      roughness: 0.2,
      metalness: 0.72,
    });

    // 1. Main Pre-Cast Concrete Industrial Freight Hall
    const mainHall = new THREE.Mesh(
      new THREE.BoxGeometry(conW, bldH, conD),
      precastWallMat
    );
    mainHall.position.y = bldH * 0.5;
    mainHall.castShadow = true;
    mainHall.receiveShadow = true;
    whGroup.add(mainHall);

    // Vertical Pre-Cast Structural Pilasters along all 4 walls
    for (let px = -conW * 0.45; px <= conW * 0.45; px += conW * 0.225) {
      for (const zSide of [-1, 1]) {
        const pilaster = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, bldH + 0.2, 0.26),
          pilasterMat
        );
        pilaster.position.set(px, (bldH + 0.2) * 0.5, zSide * (conD * 0.5 + 0.04));
        whGroup.add(pilaster);
      }
    }

    // Dark-Slate Upper Architectural Cornice Band & Raised Parapet Coping (replaces bright yellow band)
    const corniceFascia = new THREE.Mesh(
      new THREE.BoxGeometry(conW + 0.22, 0.72, conD + 0.22),
      darkSlateCorniceMat
    );
    corniceFascia.position.y = bldH - 0.32;
    whGroup.add(corniceFascia);

    const upperParapet = new THREE.Mesh(
      new THREE.BoxGeometry(conW + 0.3, 0.36, conD + 0.3),
      precastWallMat
    );
    upperParapet.position.y = bldH + 0.18;
    whGroup.add(upperParapet);

    // Flat Industrial Membrane Roof + 2 Recessed Skylight Strips & Rooftop HVAC Units
    const roofSlab = new THREE.Mesh(
      new THREE.BoxGeometry(conW - 0.2, 0.18, conD - 0.2),
      whRoofMat
    );
    roofSlab.position.y = bldH + 0.09;
    roofSlab.receiveShadow = true;
    whGroup.add(roofSlab);

    for (const zOff of [-conD * 0.22, conD * 0.22]) {
      const sky = new THREE.Mesh(
        new THREE.BoxGeometry(conW * 0.72, 0.24, 1.15),
        skylightMat
      );
      sky.position.set(0, bldH + 0.2, zOff);
      whGroup.add(sky);
    }

    for (const hx of [-conW * 0.28, conW * 0.28]) {
      const hvacBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.58, 1.1),
        pilasterMat
      );
      hvacBox.position.set(hx, bldH + 0.42, 0);
      hvacBox.castShadow = true;
      whGroup.add(hvacBox);
    }

    // Clerestory Navy Ribbon Windows along Side Walls
    for (const xSide of [-1, 1]) {
      const sideGlass = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.68, conD * 0.74),
        navyGlassMat
      );
      sideGlass.position.set(xSide * (conW * 0.5 + 0.02), bldH - 1.25, 0);
      whGroup.add(sideGlass);
    }

    // Attached 2-Story Glazed Logistics Dispatch Office Wing on the West Corner (matches Bottom-Left reference panel)
    const officeW = 3.6;
    const officeD = 4.2;
    const officeH = bldH + 0.85;
    const officeX = -conW * 0.5 + officeW * 0.5 - 0.25;
    const officeZ = -conD * 0.5 + officeD * 0.5 - 0.25;

    const officeBlock = new THREE.Mesh(
      new THREE.BoxGeometry(officeW, officeH, officeD),
      precastWallMat
    );
    officeBlock.position.set(officeX, officeH * 0.5, officeZ);
    officeBlock.castShadow = true;
    whGroup.add(officeBlock);

    const officeCurtain = new THREE.Mesh(
      new THREE.BoxGeometry(officeW + 0.1, officeH - 1.2, officeD + 0.1),
      navyGlassMat
    );
    officeCurtain.position.set(officeX, officeH * 0.5 + 0.1, officeZ);
    whGroup.add(officeCurtain);

    const officeSpandrel = new THREE.Mesh(
      new THREE.BoxGeometry(officeW + 0.16, 0.32, officeD + 0.16),
      precastWallMat
    );
    officeSpandrel.position.set(officeX, officeH * 0.5, officeZ);
    whGroup.add(officeSpandrel);

    const officeRoof = new THREE.Mesh(
      new THREE.BoxGeometry(officeW + 0.3, 0.24, officeD + 0.3),
      darkSlateCorniceMat
    );
    officeRoof.position.set(officeX, officeH + 0.12, officeZ);
    whGroup.add(officeRoof);

    // Cantilevered Dark-Steel Loading Dock Canopy & Recessed Roll-Up Freight Bays along North/South faces
    const dockCount = Math.max(3, whState.loadingDocks.filter((d) => d.unlocked).length);
    const whCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(conW * 0.82, 0.26, 2.1),
      darkSlateCorniceMat
    );
    whCanopy.position.set(0.6, 2.75, -conD * 0.5 - 0.95);
    whCanopy.castShadow = true;
    whGroup.add(whCanopy);

    for (let i = 0; i < dockCount; i++) {
      const dx = -conW * 0.22 + i * ((conW * 0.62) / Math.max(1, dockCount - 1));
      const dockShelter = new THREE.Mesh(
        new THREE.BoxGeometry(1.62, 2.38, 0.28),
        darkSlateCorniceMat
      );
      dockShelter.position.set(dx, 1.2, -conD * 0.5 - 0.04);
      whGroup.add(dockShelter);

      const dockShutter = new THREE.Mesh(
        new THREE.BoxGeometry(1.34, 2.12, 0.22),
        pilasterMat
      );
      dockShutter.position.set(dx, 1.12, -conD * 0.5 - 0.08);
      whGroup.add(dockShutter);
    }

    const eastTransferDoor = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 2.4, 2.2),
      darkSlateCorniceMat
    );
    eastTransferDoor.position.set(conW * 0.5, 1.2, 0);
    whGroup.add(eastTransferDoor);

    root.add(whGroup);

    // 2. Separate 10 x 10 Airport Cargo Transfer Yard (`facility-airport-transfer-yard`)
    //    Organized multi-color ISO shipping container stacks (rust-red, maritime blue, orange, slate)
    //    and palletized ULD cargo racks strictly inside painted yellow staging bays (matches Top & Bottom-Left panels!)
    const tyGroup = new THREE.Group();
    tyGroup.name = 'facility-airport-transfer-yard';
    tyGroup.position.set(tyW.cx, yBase + 0.03, tyW.cz);

    const tyPad = new THREE.Mesh(
      new THREE.PlaneGeometry(tyW.w + 1.2, tyW.d + 1.2),
      this.materials.concrete
    );
    tyPad.rotation.x = -Math.PI * 0.5;
    tyPad.position.set(0, 0.002, 0);
    tyPad.receiveShadow = true;
    tyGroup.add(tyPad);

    const dollyLane = new THREE.Mesh(
      new THREE.BoxGeometry(tyW.w - 1.4, 0.004, 0.16),
      this.materials.yellowLine
    );
    dollyLane.position.set(0, 0.03, -tyW.d * 0.22);
    tyGroup.add(dollyLane);

    const isoRedMat = new THREE.MeshStandardMaterial({
      map: this.facadeTextures.CORRUGATED_STEEL,
      color: 0xb91c1c,
      roughness: 0.52,
      metalness: 0.28,
    });
    const isoBlueMat = new THREE.MeshStandardMaterial({
      map: this.facadeTextures.CORRUGATED_STEEL,
      color: 0x1d4ed8,
      roughness: 0.52,
      metalness: 0.28,
    });
    const isoOrangeMat = new THREE.MeshStandardMaterial({
      map: this.facadeTextures.CORRUGATED_STEEL,
      color: 0xd97706,
      roughness: 0.52,
      metalness: 0.25,
    });
    const isoSlateMat = new THREE.MeshStandardMaterial({
      map: this.facadeTextures.CORRUGATED_STEEL,
      color: 0x334155,
      roughness: 0.55,
      metalness: 0.3,
    });
    const isoMaterials = [isoRedMat, isoBlueMat, isoOrangeMat, isoSlateMat];

    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        const bx = -tyW.w * 0.32 + c * 3.8;
        const bz = -1.2 + r * 3.2;

        // Yellow safety boundary around each structured ISO container / ULD storage bay
        const safetyFrame = new THREE.Mesh(
          new THREE.BoxGeometry(2.45, 0.004, 1.85),
          this.materials.yellowLine
        );
        safetyFrame.position.set(bx, 0.03, bz);
        tyGroup.add(safetyFrame);

        const contMat1 = isoMaterials[(r * 3 + c) % isoMaterials.length];
        const containerBottom = new THREE.Mesh(
          new THREE.BoxGeometry(2.25, 1.05, 1.22),
          contMat1
        );
        containerBottom.position.set(bx, 0.55, bz);
        containerBottom.castShadow = true;
        containerBottom.receiveShadow = true;
        tyGroup.add(containerBottom);

        // Second-tier stacked ISO intermodal container on active storage bays
        if (r === 1 || c < 3) {
          const contMat2 = isoMaterials[(r * 2 + c + 1) % isoMaterials.length];
          const containerTop = new THREE.Mesh(
            new THREE.BoxGeometry(2.25, 1.05, 1.22),
            contMat2
          );
          containerTop.position.set(bx, 1.61, bz);
          containerTop.castShadow = true;
          containerTop.receiveShadow = true;
          tyGroup.add(containerTop);
        }
      }
    }

    root.add(tyGroup);
  }

  /**
   * Builds a crisp blue/white aviation hangar header emblem sign texture (`HANGAR 1` / `HANGAR 2`)
   * matching the Middle-Right reference panel.
   */
  private createHangarHeaderSignTexture(hangarTitle: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#dbe2ea';
      ctx.fillRect(0, 0, 512, 160);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, 504, 152);

      // Aviation Blue Badge Box in center-left
      ctx.fillStyle = '#1e40af';
      ctx.fillRect(28, 26, 108, 108);
      // White stylized wing icon inside badge
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(46, 98);
      ctx.quadraticCurveTo(82, 56, 120, 44);
      ctx.quadraticCurveTo(96, 86, 84, 112);
      ctx.closePath();
      ctx.fill();

      // Bold Navy Hangar Title
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 58px "Arial Black", "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(hangarTitle, 158, 70);

      ctx.fillStyle = '#1e40af';
      ctx.font = '700 22px "Inter", Arial, sans-serif';
      ctx.fillText('MAINTENANCE & FLEET OPS', 160, 116);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * Builds 2 Wide-Span Modern Arch-Truss Aircraft Maintenance Hangars (`HANGAR_1` & `HANGAR_2`)
   * in the East Airside Hangar Sector (`gx: 196..203` & `gx: 208..215, gz: 33..40`)
   * matching the Middle-Right panel of the reference composite:
   * - Monumental light-grey steel portal frame (`#cfd6df` outer columns + `#475569` inner truss frame)
   *   and tall horizontal lintel fascia with centered blue/white aviation hangar emblem (`HANGAR 1` / `HANGAR 2`)
   * - Deep recessed dark industrial interior bay (`#1e2631` interior walls, concrete floor with yellow centerline
   *   & stop bar, overhead steel roof trusses, and warm high-bay ceiling lights) framed by multi-leaf sliding doors
   * - Low-slung segmented arch roof (`#b8c1cc`) with 4 recessed longitudinal translucent daylight skylight bands
   *   and transverse structural arch ribs
   * - Buttressed side walls with industrial windows, service doors, and attached 2-story flat-roofed technical annex
   */
  private buildAirportHangarsVisuals(
    root: THREE.Group,
    taxiW: {
      cx: number;
      cz: number;
      w: number;
      d: number;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    },
    yBase: number,
    _airportOwned = true
  ): void {
    const cs = this.world.config.cellSize;
    const hangars = this.world.economy.getAircraftHangars();

    const portalCladdingMat = new THREE.MeshStandardMaterial({
      color: 0xcfd6df,
      roughness: 0.44,
      metalness: 0.35,
    });
    const archRoofMat = new THREE.MeshStandardMaterial({
      color: 0xbac3cf,
      roughness: 0.36,
      metalness: 0.48,
    });
    const darkSteelTrussMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.42,
      metalness: 0.58,
    });
    const interiorCavityWallMat = new THREE.MeshStandardMaterial({
      color: 0x1b232e,
      roughness: 0.78,
      metalness: 0.22,
    });
    const skylightStripMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.16,
      roughness: 0.18,
      metalness: 0.72,
    });
    const navyWindowMat = new THREE.MeshStandardMaterial({
      color: 0x1c3554,
      roughness: 0.15,
      metalness: 0.85,
    });
    const highBayLightMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });

    for (let hIdx = 0; hIdx < hangars.length; hIdx++) {
      const h = hangars[hIdx];
      const hGroup = new THREE.Group();
      hGroup.name = `airport-${h.id.toLowerCase()}`;
      hGroup.position.set(h.worldX, yBase + 0.03, h.worldZ);

      const hw = h.bounds.widthCells * cs - 0.6; // ~15.4m wide-span arch portal
      const hd = h.bounds.depthCells * cs - 0.6; // ~15.4m deep
      const wallH = 4.65;
      const archRiseH = 1.65;

      // 1. Structural Concrete Foundation Plinth & Dedicated Airside Service Apron (Strict Y = yBase + 0.03)
      const foundationPad = new THREE.Mesh(
        new THREE.BoxGeometry(hw + 2.8, 0.12, hd + 1.8),
        this.materials.concrete
      );
      foundationPad.position.set(0, 0.06, 0);
      foundationPad.receiveShadow = true;
      hGroup.add(foundationPad);

      const serviceApronD = 10.5;
      const serviceApron = new THREE.Mesh(
        new THREE.PlaneGeometry(hw + 3.2, serviceApronD),
        this.materials.apronConcreteSlab
      );
      serviceApron.rotation.x = -Math.PI * 0.5;
      serviceApron.position.set(0, 0.003, -hd * 0.5 - serviceApronD * 0.5);
      serviceApron.receiveShadow = true;
      hGroup.add(serviceApron);

      // 2. Direct Taxiway Linkage: Asphalt Taxilane Spur & Smooth Curved Fillet to Parallel Taxiway
      const distToParallelTaxi = Math.max(8.0, h.worldZ - taxiW.cz);
      const spurLen = distToParallelTaxi - hd * 0.5;
      const spurCenterLocalZ = -hd * 0.5 - spurLen * 0.5;

      const taxilaneAsphalt = new THREE.Mesh(
        new THREE.PlaneGeometry(5.8, spurLen),
        this.materials.runwayAsphalt
      );
      taxilaneAsphalt.rotation.x = -Math.PI * 0.5;
      taxilaneAsphalt.position.set(0, 0.02, spurCenterLocalZ);
      taxilaneAsphalt.receiveShadow = true;
      hGroup.add(taxilaneAsphalt);

      for (const xFillet of [-1, 1]) {
        const filletMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(3.2, 3.2),
          this.materials.runwayAsphalt
        );
        filletMesh.rotation.x = -Math.PI * 0.5;
        filletMesh.rotation.z = Math.PI * 0.25;
        filletMesh.position.set(
          xFillet * 2.8,
          0.02,
          -distToParallelTaxi + taxiW.d * 0.5 + 0.6
        );
        hGroup.add(filletMesh);
      }

      // Yellow Center Lead-In Line from Parallel Taxiway through Service Apron into Hangar Bay
      const totalLeadLen = distToParallelTaxi + hd * 0.72;
      const leadInLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.004, totalLeadLen),
        this.materials.yellowLine
      );
      leadInLine.position.set(0, 0.13, -distToParallelTaxi + totalLeadLen * 0.5);
      hGroup.add(leadInLine);

      // Nosewheel Stop Bar inside the Hangar Bay Floor
      const stopBar = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.005, 0.2),
        this.materials.safetyYellow
      );
      stopBar.position.set(0, 0.13, hd * 0.18);
      hGroup.add(stopBar);

      // Smooth Curved Yellow Turn-In Arcs joining Parallel Taxiway Centerline
      const curveSegments = 8;
      const curveRadius = 4.2;
      for (const turnDir of [-1, 1]) {
        for (let s = 0; s < curveSegments; s++) {
          const a0 = (s / curveSegments) * (Math.PI * 0.5);
          const a1 = ((s + 1) / curveSegments) * (Math.PI * 0.5);
          const am = (a0 + a1) * 0.5;
          const cx = turnDir * curveRadius * (1 - Math.cos(am));
          const cz = -distToParallelTaxi + curveRadius * Math.sin(am);
          const segLen = curveRadius * (a1 - a0);
          const arcSeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.004, segLen + 0.06),
            this.materials.yellowLine
          );
          arcSeg.position.set(cx, 0.03, cz);
          arcSeg.rotation.y = -turnDir * am;
          hGroup.add(arcSeg);
        }
      }

      // If Hangar is NOT yet purchased (`!h.constructed`), register direct 3D raycast hitbox
      if (!h.constructed) {
        this.addAirportLockBadgeSprite(
          root,
          h.id,
          h.worldX,
          yBase + 3.2,
          h.worldZ,
          hIdx * 1.4,
          `Hangar ${hIdx + 1} - Locked`,
          `Required for Owned Plane #${hIdx + 1}`,
          h.constructionCost,
          hw + 2.8,
          wallH + 2.4,
          hd + 2.8
        );
      }

      // 3. Buttressed Architectural Side Walls (`#cfd6df`) with Structural Pilasters & Industrial Windows
      for (const xSide of [-1, 1]) {
        const outerWall = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, wallH, hd),
          portalCladdingMat
        );
        outerWall.position.set(xSide * (hw * 0.5 - 0.225), wallH * 0.5, 0);
        outerWall.castShadow = true;
        outerWall.receiveShadow = true;
        hGroup.add(outerWall);

        // Dark recessed interior liner wall facing the hangar bay
        const innerWall = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, wallH - 0.2, hd - 0.6),
          interiorCavityWallMat
        );
        innerWall.position.set(xSide * (hw * 0.5 - 0.52), (wallH - 0.2) * 0.5, 0);
        hGroup.add(innerWall);

        // Structural Exterior Buttress Columns & Recessed Industrial Glazing Bays along Side Walls
        for (let bz = -hd * 0.42; bz <= hd * 0.42; bz += hd * 0.28) {
          const buttress = new THREE.Mesh(
            new THREE.BoxGeometry(0.32, wallH + 0.1, 0.52),
            portalCladdingMat
          );
          buttress.position.set(xSide * (hw * 0.5 + 0.08), wallH * 0.5, bz);
          buttress.castShadow = true;
          hGroup.add(buttress);
        }

        const sideRibbonWindow = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.78, hd * 0.72),
          navyWindowMat
        );
        sideRibbonWindow.position.set(xSide * (hw * 0.5 + 0.02), wallH - 1.15, 0);
        hGroup.add(sideRibbonWindow);
      }

      // 4. Deep Shadowed Rear Wall (+Z) & Overhead Interior Steel Roof Trusses + High-Bay Lighting
      const rearWall = new THREE.Mesh(
        new THREE.BoxGeometry(hw - 0.4, wallH + archRiseH * 0.65, 0.48),
        portalCladdingMat
      );
      rearWall.position.set(0, (wallH + archRiseH * 0.65) * 0.5, hd * 0.5 - 0.24);
      rearWall.castShadow = true;
      rearWall.receiveShadow = true;
      hGroup.add(rearWall);

      const rearInnerWall = new THREE.Mesh(
        new THREE.BoxGeometry(hw - 1.1, wallH + archRiseH * 0.5, 0.18),
        interiorCavityWallMat
      );
      rearInnerWall.position.set(0, (wallH + archRiseH * 0.5) * 0.5, hd * 0.5 - 0.56);
      hGroup.add(rearInnerWall);

      // Interior Overhead Steel Roof Trusses & Warm High-Bay Light Strips visible inside the open bay
      for (const tz of [-hd * 0.28, 0, hd * 0.28]) {
        const interiorChord = new THREE.Mesh(
          new THREE.BoxGeometry(hw - 1.2, 0.24, 0.24),
          darkSteelTrussMat
        );
        interiorChord.position.set(0, wallH - 0.15, tz);
        hGroup.add(interiorChord);

        for (const lx of [-hw * 0.24, 0, hw * 0.24]) {
          const bayLamp = new THREE.Mesh(
            new THREE.BoxGeometry(1.15, 0.08, 0.28),
            highBayLightMat
          );
          bayLamp.position.set(lx, wallH - 0.3, tz);
          hGroup.add(bayLamp);
        }
      }

      // 5. Monumental Airside Portal Frame (-Z) with Tall Lintel Fascia & Centered Hangar Sign
      const portalZ = -hd * 0.5 + 0.28;
      const columnW = 1.45;

      // Left & Right Monumental Portal Columns
      for (const xSide of [-1, 1]) {
        const portalCol = new THREE.Mesh(
          new THREE.BoxGeometry(columnW, wallH + 0.55, 0.72),
          portalCladdingMat
        );
        portalCol.position.set(
          xSide * (hw * 0.5 - columnW * 0.5 + 0.12),
          (wallH + 0.55) * 0.5,
          portalZ
        );
        portalCol.castShadow = true;
        hGroup.add(portalCol);

        // Dark structural inner door-track jamb
        const innerJamb = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, wallH - 0.2, 0.76),
          darkSteelTrussMat
        );
        innerJamb.position.set(
          xSide * (hw * 0.5 - columnW + 0.05),
          (wallH - 0.2) * 0.5,
          portalZ
        );
        hGroup.add(innerJamb);
      }

      // Tall Architectural Lintel Header Beam & Arched Tympanum Spandrel above the Hangar Door
      const lintelH = 1.35;
      const lintelBeam = new THREE.Mesh(
        new THREE.BoxGeometry(hw + 0.3, lintelH, 0.74),
        portalCladdingMat
      );
      lintelBeam.position.set(0, wallH + 0.12, portalZ);
      lintelBeam.castShadow = true;
      hGroup.add(lintelBeam);

      // Dark-steel lower door track header bar
      const doorTrackBeam = new THREE.Mesh(
        new THREE.BoxGeometry(hw - columnW * 1.6, 0.28, 0.8),
        darkSteelTrussMat
      );
      doorTrackBeam.position.set(0, wallH - 0.52, portalZ);
      hGroup.add(doorTrackBeam);

      // Centered Blue/White Hangar Emblem Sign (`HANGAR 1` / `HANGAR 2`) on the Portal Lintel
      const hSignTex = this.createHangarHeaderSignTexture(`HANGAR ${hIdx + 1}`);
      const hSignMat = new THREE.MeshBasicMaterial({ map: hSignTex });
      const hSignPlaque = new THREE.Mesh(
        new THREE.PlaneGeometry(3.8, 1.05),
        hSignMat
      );
      hSignPlaque.position.set(0, wallH + 0.18, portalZ - 0.39);
      hSignPlaque.rotation.y = Math.PI;
      hGroup.add(hSignPlaque);

      // Multi-Leaf Segmented Sliding Hangar Doors (recessed to reveal the cavernous interior bay!)
      const doorOpenRatio = !h.constructed
        ? 0.55
        : h.occupiedByAircraftId
          ? Math.max(0.65, h.doorOpenRatio)
          : 0.85;
      const leafWidth = THREE.MathUtils.lerp(hw * 0.38, 1.45, doorOpenRatio);
      const doorH = wallH - 0.68;

      for (const xSide of [-1, 1]) {
        const doorLeaf = new THREE.Mesh(
          new THREE.BoxGeometry(leafWidth, doorH, 0.26),
          darkSteelTrussMat
        );
        doorLeaf.position.set(
          xSide * (hw * 0.5 - columnW - leafWidth * 0.5 + 0.1),
          doorH * 0.5 + 0.06,
          portalZ + 0.18
        );
        doorLeaf.castShadow = true;
        hGroup.add(doorLeaf);

        // Horizontal glazing band across sliding hangar door leaves
        const doorGlass = new THREE.Mesh(
          new THREE.BoxGeometry(leafWidth - 0.24, 0.52, 0.3),
          navyWindowMat
        );
        doorGlass.position.set(
          xSide * (hw * 0.5 - columnW - leafWidth * 0.5 + 0.1),
          doorH * 0.58,
          portalZ + 0.18
        );
        hGroup.add(doorGlass);
      }

      // 6. Low-Slung Segmented Arch Roof (`#bac3cf`) with 4 Recessed Longitudinal Skylight Bands
      //    & Transverse Structural Arch Ribs (Matches Middle-Right Reference Panel!)
      const barrelRoof = new THREE.Mesh(
        this.createBarrelArchGeometry(hw * 1.03, archRiseH, hd + 0.65, 32),
        archRoofMat
      );
      barrelRoof.position.set(0, wallH, 0);
      barrelRoof.castShadow = true;
      barrelRoof.receiveShadow = true;
      hGroup.add(barrelRoof);

      // 4 Longitudinal Translucent Daylight Skylight Strips contoured along the Arch Roof
      for (const skyXRatio of [-0.32, -0.11, 0.11, 0.32]) {
        const sx = skyXRatio * hw;
        const normX = sx / (hw * 0.5);
        const sy = wallH + Math.sqrt(Math.max(0, 1 - normX * normX)) * archRiseH;
        const tiltZ = -Math.atan2(
          normX * archRiseH,
          Math.max(0.2, Math.sqrt(Math.max(0, 1 - normX * normX)) * (hw * 0.5))
        );

        const skylightBand = new THREE.Mesh(
          new THREE.BoxGeometry(0.95, 0.08, hd * 0.82),
          skylightStripMat
        );
        skylightBand.position.set(sx, sy + 0.03, 0);
        skylightBand.rotation.z = tiltZ;
        hGroup.add(skylightBand);
      }

      // Transverse Structural Arch Ribs across the Roof
      for (const zTruss of [-hd * 0.48, -hd * 0.24, 0, hd * 0.24, hd * 0.48]) {
        const archTruss = new THREE.Mesh(
          this.createBarrelArchGeometry(hw * 1.045, archRiseH + 0.07, 0.28, 32),
          darkSteelTrussMat
        );
        archTruss.position.set(0, wallH, zTruss);
        hGroup.add(archTruss);
      }

      // Red Blinking Aviation Obstruction Beacon on Hangar Roof Ridge
      const hBeaconMat = new THREE.MeshBasicMaterial({ color: 0xff1e1e });
      const hBeacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 10),
        hBeaconMat
      );
      hBeacon.position.set(0, wallH + archRiseH + 0.18, 0);
      this.obstructionBeaconMeshes.push(hBeacon);
      hGroup.add(hBeacon);

      // 7. Attached 2-Story Flat-Roofed Technical & Avionics Annex (Matches Middle-Right Reference Panel)
      const annexSide = hIdx === 0 ? -1 : 1;
      const annexW = 2.6;
      const annexH = 3.5;
      const annexD = hd * 0.72;
      const annexX = annexSide * (hw * 0.5 + annexW * 0.5 - 0.08);

      const officeBody = new THREE.Mesh(
        new THREE.BoxGeometry(annexW, annexH, annexD),
        portalCladdingMat
      );
      officeBody.position.set(annexX, annexH * 0.5, 0.6);
      officeBody.castShadow = true;
      officeBody.receiveShadow = true;
      hGroup.add(officeBody);

      for (const winY of [1.25, 2.55]) {
        const officeWindows = new THREE.Mesh(
          new THREE.BoxGeometry(annexW + 0.08, 0.62, annexD * 0.82),
          navyWindowMat
        );
        officeWindows.position.set(annexX, winY, 0.6);
        hGroup.add(officeWindows);
      }

      const officeRoof = new THREE.Mesh(
        new THREE.BoxGeometry(annexW + 0.22, 0.22, annexD + 0.22),
        darkSteelTrussMat
      );
      officeRoof.position.set(annexX, annexH + 0.11, 0.6);
      hGroup.add(officeRoof);

      root.add(hGroup);
    }
  }

  /**
   * Builds a horizontal barrel-vault arch BufferGeometry whose width spans `[-spanX/2, +spanX/2]`
   * along X, arch height rises `[0, +archHeightY]` along +Y, and length extends `[-lengthZ/2, +lengthZ/2]`
   * along Z with outward-facing normals.
   */
  private createBarrelArchGeometry(
    spanX: number,
    archHeightY: number,
    lengthZ: number,
    radialSegments = 24
  ): THREE.BufferGeometry {
    const geom = new THREE.CylinderGeometry(
      1,
      1,
      lengthZ,
      radialSegments,
      1,
      false,
      0,
      Math.PI
    );
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i); // sin(theta) in [0, 1]
      const vy = pos.getY(i); // length along [-lengthZ/2, +lengthZ/2]
      const vz = pos.getZ(i); // cos(theta) in [-1, 1]
      pos.setXYZ(i, vz * (spanX * 0.5), vx * archHeightY, vy);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    return geom;
  }

  /**
   * Builds the Airport Fuel Farm in the East Apron corner of the compound:
   * 3 horizontal white cylindrical aviation fuel tanks (`JET A-1`) inside a concrete
   * containment bund with yellow safety bollards and red/white warning stripes.
   */
  private buildAirportFuelFarmVisuals(
    root: THREE.Group,
    minWx: number,
    maxWx: number,
    maxWz: number,
    yBase: number
  ): void {
    const fuelGroup = new THREE.Group();
    fuelGroup.name = 'airport-fuel-farm';
    // Placed in the East Apron corner inside the perimeter fence so all 3 tanks are clearly visible
    const farmW = 11.6;
    const farmD = 7.4;
    fuelGroup.position.set(maxWx - farmW * 0.5 - 4.8, yBase + 0.03, maxWz - farmD * 0.5 - 10.5);

    const bundWallMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.75,
      metalness: 0.1,
    });
    const tankWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.26,
      metalness: 0.28,
    });
    const hazardRedMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.4,
    });

    // 1. Concrete Containment Bund Floor & Perimeter Bund Walls
    const bundFloor = new THREE.Mesh(
      new THREE.BoxGeometry(farmW, 0.12, farmD),
      bundWallMat
    );
    bundFloor.position.y = 0.06;
    bundFloor.receiveShadow = true;
    fuelGroup.add(bundFloor);

    const wallThick = 0.28;
    const wallH = 0.68;
    for (const zSide of [-1, 1]) {
      const zWall = new THREE.Mesh(
        new THREE.BoxGeometry(farmW, wallH, wallThick),
        bundWallMat
      );
      zWall.position.set(0, wallH * 0.5, zSide * (farmD * 0.5 - wallThick * 0.5));
      fuelGroup.add(zWall);

      // Red/White Warning Stripe along Bund Top
      const warnStripe = new THREE.Mesh(
        new THREE.BoxGeometry(farmW - 0.2, 0.12, wallThick + 0.04),
        hazardRedMat
      );
      warnStripe.position.set(0, wallH - 0.08, zSide * (farmD * 0.5 - wallThick * 0.5));
      fuelGroup.add(warnStripe);
    }
    for (const xSide of [-1, 1]) {
      const xWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThick, wallH, farmD),
        bundWallMat
      );
      xWall.position.set(xSide * (farmW * 0.5 - wallThick * 0.5), wallH * 0.5, 0);
      fuelGroup.add(xWall);
    }

    // 2. 3 Horizontal White Cylindrical Aviation Fuel Tanks (`JET A-1`) on Steel Cradles
    for (const tankX of [-3.4, 0, 3.4]) {
      const tRadius = 1.05;
      const tLen = 5.2;

      // Concrete/Steel Support Saddles
      for (const zSaddle of [-1.6, 1.6]) {
        const saddle = new THREE.Mesh(
          new THREE.BoxGeometry(1.75, 0.65, 0.36),
          this.materials.accentSteel
        );
        saddle.position.set(tankX, 0.42, zSaddle);
        fuelGroup.add(saddle);
      }

      // Horizontal White Cylindrical Tank Body
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(tRadius, tRadius, tLen, 18),
        tankWhiteMat
      );
      cyl.rotation.x = Math.PI * 0.5;
      cyl.position.set(tankX, 1.48, 0);
      cyl.castShadow = true;
      fuelGroup.add(cyl);

      // Hemispherical End Caps
      for (const zCap of [-1, 1]) {
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(tRadius, 16, 12),
          tankWhiteMat
        );
        cap.scale.set(1, 1, 0.45);
        cap.position.set(tankX, 1.48, zCap * (tLen * 0.5));
        fuelGroup.add(cap);
      }

      // Red & Blue Aviation Fuel Identification Band around each tank
      const redBand = new THREE.Mesh(
        new THREE.CylinderGeometry(tRadius + 0.02, tRadius + 0.02, 0.45, 18),
        hazardRedMat
      );
      redBand.rotation.x = Math.PI * 0.5;
      redBand.position.set(tankX, 1.48, 0);
      fuelGroup.add(redBand);
    }

    // 3. Stainless-Steel Fuel Manifold Piping & Pump Shelter inside the Bund
    const manifoldPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 8.2, 12),
      this.materials.accentSteel
    );
    manifoldPipe.rotation.z = Math.PI * 0.5;
    manifoldPipe.position.set(0, 0.55, farmD * 0.5 - 0.85);
    fuelGroup.add(manifoldPipe);

    // 4. Yellow Safety Bollards framing the Fuel Farm Bund Perimeter
    for (let bx = -farmW * 0.5 - 0.35; bx <= farmW * 0.5 + 0.35; bx += 1.9) {
      for (const bz of [-farmD * 0.5 - 0.35, farmD * 0.5 + 0.35]) {
        const bollard = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.1, 0.78, 8),
          this.materials.safetyYellow
        );
        bollard.position.set(bx, 0.39, bz);
        fuelGroup.add(bollard);
      }
    }

    root.add(fuelGroup);
  }

  /**
   * Builds Secondary Airport Infrastructure across the 50 x 70 compound so no area feels bare
   * AND keeps the main runway corridor 100% clear of any rogue buildings:
   * - Bottom-Right Quadrant Development (`gx: 192..221, gz: 42..61`):
   *   * Aviation Ground Support Equipment (GSE) & Maintenance Staging Yard with concrete pad (`Y = yBase + 0.03`),
   *     connecting asphalt service roads (`Y = yBase + 0.04`), painted equipment bays (`Y = yBase + 0.06`),
   *     maintenance tool sheds, parked tow bars/tugs, and relocated ARFF Emergency Fire & Rescue Station.
   * - Staff & Visitor Parking Lot near the West Terminal Entrance
   */
  private buildAirportSecondaryInfrastructureVisuals(
    root: THREE.Group,
    minWx: number,
    maxWx: number,
    minWz: number,
    maxWz: number,
    rwyW: { cx: number; cz: number; w: number; d: number; minZ: number; maxZ: number },
    termW: { cx: number; cz: number; minX: number; maxX: number; minZ: number; maxZ: number },
    yBase: number
  ): void {
    const secGroup = new THREE.Group();
    secGroup.name = 'airport-secondary-infrastructure';

    // =========================================================================
    // 1. BOTTOM-RIGHT QUADRANT FOUNDATION (`gx: 193..220, gz: 41..60`) &
    //    AIRSIDE GSE STAGING BAYS (`gx: 181..193, gz: 38`)
    //    (Separates Area A Airside GSE from Area B Landside Bottom-Right Truck Cargo Ops!)
    // =========================================================================
    const gseP0 = this.world.grid.gridToWorld(193, 41);
    const gseP1 = this.world.grid.gridToWorld(220, 60);
    const brMinX = gseP0.x - 1.0;
    const brMaxX = gseP1.x + 1.0;
    const brMinZ = gseP0.z - 1.0;
    const brMaxZ = gseP1.z + 1.0;
    const brW = brMaxX - brMinX;
    const brD = brMaxZ - brMinZ;
    const brCx = (brMinX + brMaxX) * 0.5;
    const brCz = (brMinZ + brMaxZ) * 0.5;

    // 1A. Warm Concrete Foundation Slab under the Bottom-Right Truck Cargo Facility at strict Y = yBase + 0.018
    const brConcretePad = new THREE.Mesh(
      new THREE.BoxGeometry(brW, 0.024, brD),
      this.materials.apronConcreteSlab
    );
    brConcretePad.position.set(brCx, yBase + 0.018, brCz);
    brConcretePad.receiveShadow = true;
    secGroup.add(brConcretePad);

    // Connecting Logistics Concrete Apron between Cargo Warehouse/Transfer Yard (`gx: 180..192, gz: 41..60`)
    const midLogP0 = this.world.grid.gridToWorld(180, 41);
    const midLogP1 = this.world.grid.gridToWorld(192, 60);
    const midLogW = midLogP1.x - midLogP0.x + 2.0;
    const midLogD = midLogP1.z - midLogP0.z + 2.0;
    const midLogPad = new THREE.Mesh(
      new THREE.BoxGeometry(midLogW, 0.024, midLogD),
      this.materials.apronConcreteSlab
    );
    midLogPad.position.set(
      (midLogP0.x + midLogP1.x) * 0.5,
      yBase + 0.018,
      (midLogP0.z + midLogP1.z) * 0.5
    );
    midLogPad.receiveShadow = true;
    secGroup.add(midLogPad);

    // 1B. Airside GSE Equipment Staging Stalls (7 yellow bays on the Airside Apron at gx: 181..193, gz: 38)
    for (let bIdx = 0; bIdx < 7; bIdx++) {
      const bayWp = this.world.grid.gridToWorld(181 + bIdx * 2, 38);
      for (const side of [-1, 1]) {
        const stallLine = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.004, 3.6),
          this.materials.yellowLine
        );
        stallLine.position.set(bayWp.x + side * 1.12, yBase + 0.06, bayWp.z);
        secGroup.add(stallLine);
      }
      const backStop = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.004, 0.14),
        this.materials.safetyYellow
      );
      backStop.position.set(bayWp.x, yBase + 0.06, bayWp.z + 1.75);
      secGroup.add(backStop);
    }

    // 1C. Grounded Concrete Curb Border enclosing the Bottom-Right Truck Cargo Facility
    const brSouthCurb = new THREE.Mesh(
      new THREE.BoxGeometry(brW, 0.14, 0.32),
      this.materials.curbstone
    );
    brSouthCurb.position.set(brCx, yBase + 0.04 + 0.05, brMaxZ - 0.16);
    secGroup.add(brSouthCurb);

    const brEastCurb = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.14, brD),
      this.materials.curbstone
    );
    brEastCurb.position.set(brMaxX - 0.16, yBase + 0.04 + 0.05, brCz);
    secGroup.add(brEastCurb);

    // =========================================================================
    // 2. CLEAN CONCRETE FOUNDATION PLAZA AT CONTROL TOWER BASE & TERMINAL WALKWAY
    //    Scoped cleanly to the ATC & Terminal podium zone so the western perimeter
    //    retains lush natural green grass and coastal tree belts matching Top Panel!
    // =========================================================================
    const atcPlazaMinX = minWx + 5.5;
    const atcPlazaMaxX = midLogP0.x + 1.0;
    const atcPlazaMinZ = termW.minZ - 0.6;
    const atcPlazaMaxZ = termW.maxZ + 6.5;
    const atcPlazaW = atcPlazaMaxX - atcPlazaMinX;
    const atcPlazaD = atcPlazaMaxZ - atcPlazaMinZ;
    const atcPlazaCx = (atcPlazaMinX + atcPlazaMaxX) * 0.5;
    const atcPlazaCz = (atcPlazaMinZ + atcPlazaMaxZ) * 0.5;

    const atcFoundationSlab = new THREE.Mesh(
      new THREE.BoxGeometry(atcPlazaW, 0.024, atcPlazaD),
      this.materials.apronConcreteSlab
    );
    atcFoundationSlab.position.set(atcPlazaCx, yBase + 0.018, atcPlazaCz);
    atcFoundationSlab.receiveShadow = true;
    secGroup.add(atcFoundationSlab);

    for (const zEdge of [-1, 1]) {
      const walkwayCurb = new THREE.Mesh(
        new THREE.BoxGeometry(atcPlazaW - 0.8, 0.1, 0.28),
        this.materials.curbstone
      );
      walkwayCurb.position.set(
        atcPlazaCx,
        yBase + 0.03 + 0.05,
        atcPlazaCz + zEdge * (atcPlazaD * 0.5 - 0.2)
      );
      secGroup.add(walkwayCurb);
    }

    // =========================================================================
    // 3. LANDSCAPED COASTAL PINE & DECIDUOUS TREE BELTS AROUND PERIMETER VERGES
    //    Matches the lush green tree framing in Top & Bottom-Right Reference Panels!
    // =========================================================================
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
    });
    const pineCanopyMat = new THREE.MeshStandardMaterial({
      color: 0x35682d,
      roughness: 0.84,
    });
    const leafyCanopyMat = new THREE.MeshStandardMaterial({
      color: 0x457d38,
      roughness: 0.82,
    });

    const addCoastalTree = (tx: number, tz: number, scale = 1.0, isPine = true) => {
      const tGrp = new THREE.Group();
      tGrp.position.set(tx, yBase + 0.01, tz);
      tGrp.scale.setScalar(scale);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 0.95, 6),
        trunkMat
      );
      trunk.position.y = 0.475;
      tGrp.add(trunk);

      if (isPine) {
        const lowerCone = new THREE.Mesh(
          new THREE.ConeGeometry(0.92, 1.55, 7),
          pineCanopyMat
        );
        lowerCone.position.y = 1.35;
        lowerCone.castShadow = true;
        tGrp.add(lowerCone);

        const upperCone = new THREE.Mesh(
          new THREE.ConeGeometry(0.68, 1.25, 7),
          pineCanopyMat
        );
        upperCone.position.y = 2.05;
        upperCone.castShadow = true;
        tGrp.add(upperCone);
      } else {
        const crown = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.88, 1),
          leafyCanopyMat
        );
        crown.scale.set(1.08, 0.92, 1.08);
        crown.position.y = 1.55;
        crown.castShadow = true;
        tGrp.add(crown);
      }
      secGroup.add(tGrp);
    };

    // West Perimeter Green Buffer Tree Belt (along minWx + 2.4, safely clear of runway approach & concrete pads)
    for (let tz = rwyW.maxZ + 6.0; tz <= maxWz - 3.5; tz += 4.6) {
      addCoastalTree(
        minWx + 2.4 + ((Math.round(tz) % 2) * 1.1),
        tz,
        0.92 + ((Math.round(tz) % 3) * 0.1),
        Math.round(tz) % 2 === 0
      );
    }

    root.add(secGroup);
  }

  private getOrCreateLockBadgeTexture(): THREE.CanvasTexture {
    if (this.lockBadgeTexture) return this.lockBadgeTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 256);
      // Outer drop shadow & vibrant blue circle (#2563eb)
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.65)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(128, 128, 96, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Crisp white inner ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(128, 128, 84, 0, Math.PI * 2);
      ctx.stroke();

      // Crisp white padlock shackle
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(128, 108, 26, Math.PI, 0, false);
      ctx.lineTo(154, 126);
      ctx.moveTo(102, 108);
      ctx.lineTo(102, 126);
      ctx.stroke();

      // Crisp white padlock body
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(90, 122, 76, 60, 10);
      ctx.fill();

      // Blue keyhole cutout inside padlock body
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(128, 146, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(124, 148, 8, 18);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.lockBadgeTexture = tex;
    return tex;
  }

  private addAirportLockBadgeSprite(
    root: THREE.Group,
    id: 'AIRPORT_MAIN' | 'HANGAR_1' | 'HANGAR_2' | 'AIRPORT_EXPANSION',
    worldX: number,
    worldY: number,
    worldZ: number,
    phaseOffset: number,
    label: string,
    subLabel: string,
    cost: number,
    hitBoxW = 16.0,
    hitBoxH = 6.5,
    hitBoxD = 16.0
  ): void {
    // Invisible 3D bounding-volume mesh covering the unpurchased facility so clicking directly on
    // the 3D building opens the clean Click-to-Inspect Purchase Modal with ZERO floating lock badges!
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const hitMesh = new THREE.Mesh(
      new THREE.BoxGeometry(hitBoxW, hitBoxH, hitBoxD),
      hitMat
    );
    hitMesh.name = `airport-hitbox-${id.toLowerCase()}`;
    hitMesh.position.set(worldX, worldY, worldZ);
    root.add(hitMesh);
    this.lockBadgeSprites.push({
      id,
      sprite: hitMesh,
      baseWorldX: worldX,
      baseWorldY: worldY,
      baseWorldZ: worldZ,
      phaseOffset,
      label,
      subLabel,
      cost,
    });
  }

  public getProjectedAirportLockBadges(): Array<{
    id: 'AIRPORT_MAIN' | 'HANGAR_1' | 'HANGAR_2' | 'AIRPORT_EXPANSION';
    label: string;
    subLabel: string;
    cost: number;
    screenX: number;
    screenY: number;
    visible: boolean;
  }> {
    // Floating 3D world-space lock badges are disabled to keep the 3D world view 100% clean and immersive.
    return [];
  }

  /**
   * Builds the Reconstructed Air Traffic Control (ATC) Tower (`airport-atc-tower`)
   * matching the Middle-Left & Top panels of the reference composite:
   * - 2-story light-grey architectural concrete operations base building (`#d8dde4`) with dark navy
   *   ribbon windows (`#1c3554`), flat slate roof (`#7c8594`), raised parapet, and rooftop HVAC unit
   * - Sleek octagonal fluted concrete shaft (`#e2e6ec`) with 8 vertical recessed shadow grooves (`#475569`)
   * - Lower sub-cab technical equipment ring (`#cbd2dc`) with dark horizontal window band and
   *   8 angled steel support struts bracing the upper cab
   * - Flared 360-degree dark-navy tinted glass control cab (`#172a45`) with angled mullions,
   *   catwalk gallery ring, overhanging dark-slate roof deck, rotating surface-movement radar scanner,
   *   whip antennas, and blinking red aviation beacon
   */
  private buildAtcTowerVisuals(
    root: THREE.Group,
    atcW: { cx: number; cz: number; w: number; d: number },
    yBase: number
  ): void {
    const atcGroup = new THREE.Group();
    atcGroup.name = 'airport-atc-tower';
    atcGroup.position.set(atcW.cx, yBase + 0.03, atcW.cz);

    const concreteTowerMat = new THREE.MeshStandardMaterial({
      color: 0xe2e6ec,
      roughness: 0.46,
      metalness: 0.14,
    });
    const baseCladdingMat = new THREE.MeshStandardMaterial({
      color: 0xd8dde4,
      roughness: 0.42,
      metalness: 0.24,
    });
    const subCabCollarMat = new THREE.MeshStandardMaterial({
      color: 0xcbd2dc,
      roughness: 0.36,
      metalness: 0.32,
    });
    const cabNavyGlassMat = new THREE.MeshStandardMaterial({
      color: 0x172a45,
      roughness: 0.12,
      metalness: 0.88,
    });
    const darkSlateSteelMat = new THREE.MeshStandardMaterial({
      color: 0x263040,
      roughness: 0.38,
      metalness: 0.62,
    });
    const flatRoofMat = new THREE.MeshStandardMaterial({
      color: 0x7c8594,
      roughness: 0.68,
      metalness: 0.18,
    });

    // 1. 2-Story Architectural Concrete Technical & Radar Operations Base Building
    const baseW = atcW.w - 0.4;
    const baseD = atcW.d - 0.4;
    const podiumH = 3.4;

    const podiumPlinth = new THREE.Mesh(
      new THREE.BoxGeometry(baseW + 0.4, 0.2, baseD + 0.4),
      darkSlateSteelMat
    );
    podiumPlinth.position.y = 0.1;
    atcGroup.add(podiumPlinth);

    const podium = new THREE.Mesh(
      new THREE.BoxGeometry(baseW, podiumH, baseD),
      baseCladdingMat
    );
    podium.position.y = 0.2 + podiumH * 0.5;
    podium.castShadow = true;
    podium.receiveShadow = true;
    atcGroup.add(podium);

    // 2 Horizontal Dark-Navy Ribbon Window Bands on Base Building
    for (const winY of [1.25, 2.55]) {
      const podiumGlass = new THREE.Mesh(
        new THREE.BoxGeometry(baseW + 0.08, 0.62, baseD * 0.82),
        cabNavyGlassMat
      );
      podiumGlass.position.y = winY;
      atcGroup.add(podiumGlass);

      const podiumGlassZ = new THREE.Mesh(
        new THREE.BoxGeometry(baseW * 0.82, 0.62, baseD + 0.08),
        cabNavyGlassMat
      );
      podiumGlassZ.position.y = winY;
      atcGroup.add(podiumGlassZ);
    }

    // Flat Matte-Slate Roof & Rooftop HVAC Unit on Base Building
    const podiumRoof = new THREE.Mesh(
      new THREE.BoxGeometry(baseW + 0.2, 0.2, baseD + 0.2),
      flatRoofMat
    );
    podiumRoof.position.y = 0.2 + podiumH + 0.1;
    atcGroup.add(podiumRoof);

    const podiumHvac = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.52, 0.95),
      subCabCollarMat
    );
    podiumHvac.position.set(-baseW * 0.26, 0.2 + podiumH + 0.46, baseD * 0.22);
    atcGroup.add(podiumHvac);

    // 2. Tall Octagonal Fluted Concrete Tower Shaft with 8 Vertical Recessed Shadow Grooves
    const shaftH = 11.6;
    const shaftY = 0.2 + podiumH + shaftH * 0.5;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(1.28, 1.58, shaftH, 8),
      concreteTowerMat
    );
    shaft.position.y = shaftY;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    atcGroup.add(shaft);

    for (let r = 0; r < 8; r++) {
      const angle = (r * Math.PI) / 4;
      const groove = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, shaftH - 0.4, 0.28),
        darkSlateSteelMat
      );
      groove.position.set(
        Math.sin(angle) * 1.38,
        shaftY,
        Math.cos(angle) * 1.38
      );
      groove.rotation.y = angle;
      atcGroup.add(groove);
    }

    // 3. Lower Sub-Cab Technical Equipment Ring (`#cbd2dc`) with Dark Window Band & Diagonal Support Struts
    const collarY = 15.55;
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.38, 1.32, 1.45, 8),
      subCabCollarMat
    );
    collar.position.y = collarY;
    collar.castShadow = true;
    atcGroup.add(collar);

    const subCabWindowRing = new THREE.Mesh(
      new THREE.CylinderGeometry(2.18, 1.98, 0.48, 8),
      cabNavyGlassMat
    );
    subCabWindowRing.position.y = collarY + 0.12;
    atcGroup.add(subCabWindowRing);

    // 8 Angled Steel Support Struts Bracing the Catwalk & Upper Observation Cab
    for (let s = 0; s < 8; s++) {
      const sAngle = (s * Math.PI) / 4;
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 1.45, 0.18),
        darkSlateSteelMat
      );
      brace.position.set(
        Math.sin(sAngle) * 1.85,
        collarY - 0.1,
        Math.cos(sAngle) * 1.85
      );
      brace.rotation.y = sAngle;
      brace.rotation.x = -0.46;
      atcGroup.add(brace);
    }

    const catwalkRing = new THREE.Mesh(
      new THREE.CylinderGeometry(2.65, 2.55, 0.24, 16),
      darkSlateSteelMat
    );
    catwalkRing.position.y = 16.35;
    atcGroup.add(catwalkRing);

    // 4. Flared 360-Degree Dark-Navy Tinted Glass Control Cab (`#172a45`) with Angled Mullions
    const cabGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(2.85, 2.32, 2.25, 12),
      cabNavyGlassMat
    );
    cabGlass.position.y = 17.55;
    atcGroup.add(cabGlass);

    for (let m = 0; m < 12; m++) {
      const mAngle = (m * Math.PI) / 6;
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 2.35, 0.12),
        darkSlateSteelMat
      );
      strut.position.set(
        Math.sin(mAngle) * 2.58,
        17.55,
        Math.cos(mAngle) * 2.58
      );
      strut.rotation.y = mAngle;
      strut.rotation.x = -0.22;
      atcGroup.add(strut);
    }

    // 5. Overhanging Roof Deck, Rotating Surface-Movement Radar Scanner, Whip Antennas & Red Beacon
    const roofDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(3.05, 2.85, 0.36, 12),
      darkSlateSteelMat
    );
    roofDeck.position.y = 18.82;
    roofDeck.castShadow = true;
    atcGroup.add(roofDeck);

    const roofCap = new THREE.Mesh(
      new THREE.CylinderGeometry(2.75, 2.75, 0.16, 12),
      concreteTowerMat
    );
    roofCap.position.y = 19.06;
    atcGroup.add(roofCap);

    const radarPedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 0.85, 10),
      concreteTowerMat
    );
    radarPedestal.position.y = 19.45;
    atcGroup.add(radarPedestal);

    const radarDish = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.34, 0.26),
      concreteTowerMat
    );
    radarDish.position.y = 19.98;
    this.atcRadarMesh = radarDish;
    atcGroup.add(radarDish);

    // Communications Whip Antennas around Roof Perimeter
    for (const [ax, az] of [
      [-1.4, -1.2],
      [1.4, -1.2],
      [-1.3, 1.3],
    ]) {
      const whip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.05, 1.65, 6),
        darkSlateSteelMat
      );
      whip.position.set(ax, 19.8, az);
      atcGroup.add(whip);
    }

    // Red Blinking Aviation Beacon Mast & Glowing Sphere
    const beaconMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.45, 8),
      darkSlateSteelMat
    );
    beaconMast.position.set(0.95, 19.7, 0.95);
    atcGroup.add(beaconMast);

    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1e1e });
    const beaconSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      beaconMat
    );
    beaconSphere.position.set(0.95, 20.48, 0.95);
    this.atcBeaconMesh = beaconSphere;
    this.obstructionBeaconMeshes.push(beaconSphere);
    atcGroup.add(beaconSphere);

    root.add(atcGroup);
  }

  /**
   * Builds Airfield Lighting:
   * - Glowing white/amber runway edge lights
   * - Runway threshold green lights (pulsing in Medium/High/Ultra)
   * - Glowing blue taxiway edge lights (pulsing in Medium/High/Ultra)
   * - 4-light PAPI (Precision Approach Path Indicator) wing-bar boxes beside both runway thresholds
   * - Tall Apron Floodlight Masts with warm apron ground light pools
   */
  private buildAirportLightingVisuals(
    root: THREE.Group,
    rwyW: { cx: number; cz: number; w: number; d: number },
    taxiW: { cx: number; cz: number; w: number; d: number },
    lighting: {
      apronFloodlightMastPositions: Array<{
        worldX: number;
        worldZ: number;
      }>;
    },
    yBase: number
  ): void {
    const rwyWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const rwyAmberMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const threshGreenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const taxiBlueMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const papiRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const floodLampMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });

    this.airfieldLightMaterials.push(
      { mat: threshGreenMat, baseHex: 0x22c55e, dimHex: 0x15803d },
      { mat: taxiBlueMat, baseHex: 0x38bdf8, dimHex: 0x0284c7 }
    );

    // 1. Runway Edge Lights (White along central section, Amber along caution zone near thresholds)
    const rwyStep = (rwyW.w - 2.0) / 19;
    for (let i = 0; i < 20; i++) {
      const lx = rwyW.cx - (rwyW.w * 0.5 - 1.0) + i * rwyStep;
      const isAmberZone = i <= 3 || i >= 16;
      for (const zSide of [-1, 1]) {
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 8, 8),
          isAmberZone ? rwyAmberMat : rwyWhiteMat
        );
        lamp.position.set(
          lx,
          yBase + 0.14,
          rwyW.cz + zSide * (rwyW.d * 0.5 + 0.28)
        );
        root.add(lamp);
      }
    }

    // 2. Runway Threshold Green Lights & 4-Light PAPI (Precision Approach Path Indicator) Boxes
    for (const endSide of [-1, 1]) {
      const tx = rwyW.cx + endSide * (rwyW.w * 0.5 - 0.35);
      for (let k = -4; k <= 4; k++) {
        const tLamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 8, 8),
          threshGreenMat
        );
        tLamp.position.set(tx, yBase + 0.14, rwyW.cz + k * 1.0);
        root.add(tLamp);
      }

      // 4-Light PAPI Box Array beside Runway Threshold (2 White + 2 Red approach slope indicator units)
      const papiBaseX = rwyW.cx + endSide * (rwyW.w * 0.5 - 10.2);
      const papiBaseZ = rwyW.cz - (rwyW.d * 0.5 + 1.45);
      for (let pIdx = 0; pIdx < 4; pIdx++) {
        const pz = papiBaseZ - pIdx * 0.72;
        const housing = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.24, 0.36),
          this.materials.safetyYellow
        );
        housing.position.set(papiBaseX, yBase + 0.16, pz);
        root.add(housing);

        const lens = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 8),
          pIdx < 2 ? rwyWhiteMat : papiRedMat
        );
        lens.position.set(
          papiBaseX + endSide * 0.22,
          yBase + 0.18,
          pz
        );
        root.add(lens);
      }
    }

    // 3. Glowing Blue Parallel Taxiway Edge Lights
    const taxiStep = (taxiW.w - 2.0) / 18;
    for (let i = 0; i < 19; i++) {
      const tx = taxiW.cx - (taxiW.w * 0.5 - 1.0) + i * taxiStep;
      for (const zSide of [-1, 1]) {
        const bLamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 8),
          taxiBlueMat
        );
        bLamp.position.set(
          tx,
          yBase + 0.12,
          taxiW.cz + zSide * (taxiW.d * 0.5 + 0.22)
        );
        root.add(bLamp);
      }
    }

    // 4. Tall Apron Floodlight Masts
    for (const mastPos of lighting.apronFloodlightMastPositions) {
      const mastGroup = new THREE.Group();
      mastGroup.position.set(mastPos.worldX, yBase + 0.03, mastPos.worldZ);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.16, 8.8, 8),
        this.materials.accentSteel
      );
      pole.position.y = 4.4;
      mastGroup.add(pole);

      const crossbar = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.2, 0.25),
        this.materials.accentSteel
      );
      crossbar.position.y = 8.8;
      mastGroup.add(crossbar);

      for (const lOff of [-0.75, 0, 0.75]) {
        const lampHead = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.28, 0.32),
          floodLampMat
        );
        lampHead.position.set(lOff, 8.95, -0.12);
        mastGroup.add(lampHead);
      }

      // Warm Apron Floodlight Ground Pool (toggled cleanly by GFX quality preset)
      const poolMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: this.graphicsQuality === 'LOW' ? 0 : 0.12,
        depthWrite: false,
      });
      const poolDisk = new THREE.Mesh(
        new THREE.CircleGeometry(4.8, 18),
        poolMat
      );
      poolDisk.rotation.x = -Math.PI * 0.5;
      poolDisk.position.set(0, 0.004, -3.2);
      poolDisk.visible = this.graphicsQuality !== 'LOW';
      this.apronFloodPoolMeshes.push(poolDisk);
      mastGroup.add(poolDisk);

      root.add(mastGroup);
    }
  }

  /**
   * Builds the Rotating White Geodesic Radar Dome (`Radome`) on a red-and-white lattice tower
   * next to the control tower, plus an animated bright orange-and-white striped windsock near the runway.
   */
  private buildRadarAndWindsockVisuals(
    root: THREE.Group,
    radarW: { cx: number; cz: number; w: number; d: number },
    infW: { minX: number; cz: number },
    yBase: number
  ): void {
    // 1. Red-and-White Lattice Tower topped with a Rotating White Geodesic Radar Dome (`Radome`)
    const rGroup = new THREE.Group();
    rGroup.position.set(radarW.cx, yBase + 0.03, radarW.cz);

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.16, 5.2),
      this.materials.concrete
    );
    pad.position.y = 0.08;
    rGroup.add(pad);

    const tiers = 5;
    const tierH = 1.65;
    for (let t = 0; t < tiers; t++) {
      const bandMat =
        t % 2 === 0 ? this.materials.gateRed : this.materials.whiteLine;
      const radiusBottom = 1.35 - t * 0.14;
      const radiusTop = 1.35 - (t + 1) * 0.14;
      const latticeTier = new THREE.Mesh(
        new THREE.CylinderGeometry(radiusTop, radiusBottom, tierH, 4, 1, true),
        bandMat
      );
      latticeTier.position.y = 0.16 + (t + 0.5) * tierH;
      latticeTier.rotation.y = Math.PI * 0.25;
      rGroup.add(latticeTier);
    }

    const platformDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.45, 0.24, 12),
      this.materials.accentSteel
    );
    platformDeck.position.y = 0.24 + tiers * tierH;
    rGroup.add(platformDeck);

    // Geodesic Radar Dome (`Radome`) Group (smoothly rotated in tick())
    const radomeGroup = new THREE.Group();
    radomeGroup.position.y = 0.36 + tiers * tierH + 1.35;

    const radomeSphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.55, 2),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.28,
        metalness: 0.12,
        flatShading: true,
      })
    );
    radomeSphere.castShadow = true;
    radomeGroup.add(radomeSphere);

    const radomeWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.56, 1)),
      new THREE.LineBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.55,
      })
    );
    radomeGroup.add(radomeWire);

    // Red Blinking Obstruction Beacon on top of the Radar Tower Dome
    const rBeaconMat = new THREE.MeshBasicMaterial({ color: 0xff1e1e });
    const rBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      rBeaconMat
    );
    rBeacon.position.set(0, 1.68, 0);
    this.obstructionBeaconMeshes.push(rBeacon);
    radomeGroup.add(rBeacon);

    this.radomeMesh = radomeGroup;
    rGroup.add(radomeGroup);
    root.add(rGroup);

    // 2. Animated Bright Orange-and-White Striped Windsock near the Runway
    const wsGroup = new THREE.Group();
    wsGroup.position.set(infW.minX + 3.6, yBase + 0.002, infW.cz);

    // White segmented circle marker around windsock pole base
    const circleRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.35, 16),
      this.materials.whiteLine
    );
    circleRing.rotation.x = -Math.PI * 0.5;
    circleRing.position.y = 0.02;
    wsGroup.add(circleRing);

    const wsPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 3.8, 8),
      this.materials.whiteLine
    );
    wsPole.position.y = 1.9;
    wsGroup.add(wsPole);

    const pivotGroup = new THREE.Group();
    pivotGroup.position.set(0, 3.65, 0);

    const orangeSockMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    const whiteSockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });

    // 5 Alternating Orange & White Frustum Rings forming the Striped Windsock
    const segLen = 0.36;
    for (let s = 0; s < 5; s++) {
      const r0 = 0.36 - s * 0.045;
      const r1 = 0.36 - (s + 1) * 0.045;
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(r1, r0, segLen, 10, 1, true),
        s % 2 === 0 ? orangeSockMat : whiteSockMat
      );
      band.rotation.z = -Math.PI * 0.47;
      band.position.set(0.25 + (s + 0.5) * segLen, -s * 0.02, 0);
      pivotGroup.add(band);
    }

    this.windsockPivot = pivotGroup;
    wsGroup.add(pivotGroup);
    root.add(wsGroup);
  }

  private buildStandGroundStagingProps(
    root: THREE.Group,
    cx: number,
    yBase: number,
    zEdge: number
  ): void {
    const padGroup = new THREE.Group();
    padGroup.position.set(cx, yBase, zEdge);

    // 1. Grid-Aligned Concrete Logistics Staging Pad (at Y = yBase + 0.03)
    const padW = 4.2;
    const padD = 1.65;
    const stagingPad = new THREE.Mesh(
      new THREE.BoxGeometry(padW, 0.04, padD),
      this.materials.concrete
    );
    stagingPad.position.y = 0.02;
    stagingPad.receiveShadow = true;
    padGroup.add(stagingPad);

    // 2. Industrial Yellow Safety Lines & Designated ULD Transfer Zone Outline (at Y = yBase + 0.06 -> local y = 0.03)
    for (const zSide of [-1, 1]) {
      const hLine = new THREE.Mesh(
        new THREE.BoxGeometry(padW + 0.12, 0.004, 0.1),
        this.materials.yellowLine
      );
      hLine.position.set(0, 0.03, zSide * (padD * 0.5));
      padGroup.add(hLine);
    }
    for (const xSide of [-1, 1]) {
      const vLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.004, padD + 0.12),
        this.materials.yellowLine
      );
      vLine.position.set(xSide * (padW * 0.5), 0.03, 0);
      padGroup.add(vLine);
    }

    const uldBlueMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.45,
      metalness: 0.25,
    });

    // 3. Structured ULD Roller Racks & Containers inside the Staging Pad
    for (const i of [-1, 0, 1]) {
      const dolly = new THREE.Group();
      dolly.position.set(i * 1.25, 0.04, 0);

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.1, 0.92),
        this.materials.accentSteel
      );
      frame.position.y = 0.08;
      dolly.add(frame);

      const uld = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 0.62, 0.84),
        i === 0 ? uldBlueMat : this.materials.brushedAluminiumUld
      );
      uld.position.y = 0.44;
      uld.castShadow = true;
      dolly.add(uld);

      padGroup.add(dolly);
    }

    root.add(padGroup);
  }

  /**
   * Builds a Commercial Airliner visual (`scaleFactor = 1.62` by default so wingspans and fuselages
   * match the runway width and align with the 4 upgraded boarding gates), with customizable tail/winglet
   * livery color (`tailColorHex` — Blue, Red, or Yellow) and optional clustered Ground Service Vehicles
   * (Catering Truck, Fuel Tanker, and Baggage Train) around the wings.
   */
  private buildParkedCargoAircraftVisual(
    root: THREE.Group,
    wx: number,
    wy: number,
    wz: number,
    yaw: number,
    weatheredAbandoned: boolean,
    tailColorHex = 0x0284c7,
    scaleFactor = 1.62,
    withServiceVehicles = false
  ): void {
    const containerGroup = new THREE.Group();
    containerGroup.position.set(wx, wy, wz);
    containerGroup.rotation.y = yaw;

    const plane = new THREE.Group();
    plane.scale.setScalar(scaleFactor);
    containerGroup.add(plane);

    const bodyMat = weatheredAbandoned
      ? new THREE.MeshStandardMaterial({
          color: 0x9ca3af,
          roughness: 0.88,
          metalness: 0.1,
        })
      : this.materials.aircraftFuselageCargo;
    const whiteWingMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.2,
    });
    const liveryAccentMat = new THREE.MeshStandardMaterial({
      color: tailColorHex,
      roughness: 0.28,
      metalness: 0.25,
    });

    // Soft Ground Contact Shadow beneath parked aircraft
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(7.6, 8.2),
      this.materials.contactShadow
    );
    shadowPlane.rotation.x = -Math.PI * 0.5;
    shadowPlane.position.set(0, 0.012, 0.2);
    shadowPlane.visible = getGraphicsQualitySpec(this.graphicsQuality).enableContactShadows;
    this.contactShadowMeshes.push(shadowPlane);
    plane.add(shadowPlane);

    // Cylindrical Commercial Fuselage
    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.56, 6.4, 16),
      bodyMat
    );
    fuselage.rotation.x = Math.PI * 0.5;
    fuselage.position.y = 0.86;
    fuselage.castShadow = true;
    plane.add(fuselage);

    // Sculpted Nose Cone (+Z) & Tail Cone (-Z)
    const noseCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.56, 1.25, 16),
      whiteWingMat
    );
    noseCone.rotation.x = Math.PI * 0.5;
    noseCone.position.set(0, 0.86, 3.8);
    plane.add(noseCone);

    const tailCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.56, 1.15, 14),
      liveryAccentMat
    );
    tailCone.rotation.x = -Math.PI * 0.5;
    tailCone.position.set(0, 0.9, -3.75);
    plane.add(tailCone);

    // Cockpit Windshield
    const cockpitGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.28, 0.65),
      this.materials.cityGlass
    );
    cockpitGlass.position.set(0, 1.12, 3.15);
    plane.add(cockpitGlass);

    // Lower Belly Fairing matching Livery Accent Color
    const belly = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.25, 5.8),
      liveryAccentMat
    );
    belly.position.set(0, 0.52, 0);
    plane.add(belly);

    // Swept Main Wings + Upturned Wingtip Winglets
    const wings = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 0.14, 1.32),
      whiteWingMat
    );
    wings.position.set(0, 0.88, 0.25);
    wings.castShadow = true;
    plane.add(wings);

    for (const side of [-1, 1]) {
      const winglet = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.64, 0.55),
        liveryAccentMat
      );
      winglet.position.set(side * 3.4, 1.16, 0.15);
      winglet.rotation.z = -side * 0.22;
      plane.add(winglet);
    }

    // Twin Underwing Turbofan Engine Nacelles
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.26, 0.75),
        whiteWingMat
      );
      pylon.position.set(side * 1.75, 0.78, 0.45);
      plane.add(pylon);

      const engine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.25, 1.18, 14),
        whiteWingMat
      );
      engine.rotation.x = Math.PI * 0.5;
      engine.position.set(side * 1.75, 0.62, 0.48);
      plane.add(engine);

      const intakeRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.285, 0.285, 0.14, 14),
        this.materials.wheelHubSteel
      );
      intakeRing.rotation.x = Math.PI * 0.5;
      intakeRing.position.set(side * 1.75, 0.62, 1.02);
      plane.add(intakeRing);

      const fanFace = new THREE.Mesh(
        new THREE.CylinderGeometry(0.23, 0.23, 0.06, 12),
        this.materials.tyreRubber
      );
      fanFace.rotation.x = Math.PI * 0.5;
      fanFace.position.set(side * 1.75, 0.62, 1.06);
      plane.add(fanFace);
    }

    // Distinct Colored Vertical Tail Fin (Blue, Red, or Yellow) with White Emblem Stripe
    const tailFin = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.78, 1.38),
      liveryAccentMat
    );
    tailFin.position.set(0, 1.7, -2.65);
    tailFin.castShadow = true;
    plane.add(tailFin);

    const tailEmblemStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.42, 0.92),
      whiteWingMat
    );
    tailEmblemStripe.position.set(0, 1.78, -2.68);
    tailEmblemStripe.rotation.x = -0.35;
    plane.add(tailEmblemStripe);

    const hStab = new THREE.Mesh(
      new THREE.BoxGeometry(2.45, 0.1, 0.75),
      whiteWingMat
    );
    hStab.position.set(0, 1.05, -2.75);
    plane.add(hStab);

    // Nose & Main Landing Gear Struts + Wheels
    const noseStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8),
      this.materials.wheelHubSteel
    );
    noseStrut.position.set(0, 0.36, 2.35);
    plane.add(noseStrut);

    const noseWheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.18, 10),
      this.materials.tyreRubber
    );
    noseWheel.rotation.z = Math.PI * 0.5;
    noseWheel.position.set(0, 0.16, 2.35);
    plane.add(noseWheel);

    for (const side of [-0.85, 0.85]) {
      const mainStrut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8),
        this.materials.wheelHubSteel
      );
      mainStrut.position.set(side, 0.42, -0.45);
      plane.add(mainStrut);

      const mainWheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.24, 12),
        this.materials.tyreRubber
      );
      mainWheel.rotation.z = Math.PI * 0.5;
      mainWheel.position.set(side, 0.22, -0.45);
      plane.add(mainWheel);
    }

    // Clustered Apron Service Vehicles around the Wings (Catering Truck, Fuel Tanker, Baggage Train)
    if (withServiceVehicles) {
      // 1. High-Lift Catering Truck positioned near starboard forward cabin door (-X, +Z)
      const cateringGrp = new THREE.Group();
      cateringGrp.position.set(-2.2, 0, 2.6);
      cateringGrp.rotation.y = Math.PI * 0.42;

      const catCab = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.68, 0.65),
        whiteWingMat
      );
      catCab.position.set(0, 0.44, 0.85);
      cateringGrp.add(catCab);

      const catLiftBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 0.82, 1.45),
        whiteWingMat
      );
      catLiftBox.position.set(0, 1.05, -0.2);
      catLiftBox.castShadow = true;
      cateringGrp.add(catLiftBox);

      const catStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.16, 1.46),
        liveryAccentMat
      );
      catStripe.position.set(0, 1.05, -0.2);
      cateringGrp.add(catStripe);
      containerGroup.add(cateringGrp);

      // 2. Jet-A1 Fuel Tanker Truck positioned near port wing (+X, +0.4Z)
      const tankerGrp = this.createGseVisualGroup(
        `apron-service-tanker-${wx.toFixed(0)}`,
        'FUEL_TANKER'
      );
      tankerGrp.position.set(3.15, 0, 0.6);
      tankerGrp.rotation.y = -Math.PI * 0.15;
      containerGroup.add(tankerGrp);

      // 3. Baggage Tractor & 2-Cart Baggage Train positioned near rear cargo hold (-X, -2.2Z)
      const tugGrp = this.createGseVisualGroup(
        `apron-service-tug-${wx.toFixed(0)}`,
        'AIRCRAFT_TUG'
      );
      tugGrp.position.set(-2.65, 0, -1.6);
      tugGrp.rotation.y = 0.12;
      containerGroup.add(tugGrp);

      const dollyGrp = this.createGseVisualGroup(
        `apron-service-dolly-${wx.toFixed(0)}`,
        'CARGO_DOLLY'
      );
      dollyGrp.position.set(-2.85, 0, -3.55);
      dollyGrp.rotation.y = 0.08;
      containerGroup.add(dollyGrp);
    }

    root.add(containerGroup);
  }

  /**
   * Builds detailed multi-part procedural architecture with high-contrast PBR facade textures
   * for all placed buildings across Residential, Commercial, Industrial, Logistics, Rail, Airport & Harbour.
   */
  public buildStarterContextBuildings(): void {
    this.clearGroup(this.buildingsGroup);
    this.warehouseDoorShuttersMap.clear();

    const allBuildings = this.world.economy.getAllPlacedBuildings();
    const cs = this.world.config.cellSize;

    for (const bld of allBuildings) {
      // Skip bespoke Airport facilities rendered directly inside buildAirportVisuals()
      if (
        bld.id === 'facility-airport-cargo-terminal' ||
        bld.id === 'facility-airport-warehouse' ||
        bld.id === 'facility-airport-transfer-yard' ||
        bld.id === 'facility-airport-hangar_1' ||
        bld.id === 'facility-airport-hangar_2'
      ) {
        continue;
      }

      // Check if this building is an upgradeable 20-level Warehouse facility (Warehouse 1)
      const whState = this.world.economy.getWarehouse(bld.id);
      if (whState) {
        this.buildWarehouseFacilityVisuals(whState);
        continue;
      }

      // Check if this building is the 20-level Westgate Truck Depot (4×3 at Level 1 -> 20×8 at Level 20)
      if (bld.id === 'facility-starter-truck-depot') {
        this.buildTruckDepotFacilityVisuals(this.world.economy.getTruckDepot());
        continue;
      }

      const spec = getBuildingSpecById(bld.catalogueId);
      const fp = this.world.grid.getFootprint(
        bld.gx,
        bld.gz,
        bld.widthCells,
        bld.depthCells,
        0
      );

      const cx = fp.bounds.centerX;
      const cz = fp.bounds.centerZ;
      const w = bld.widthCells * cs - 0.45;
      const d = bld.depthCells * cs - 0.45;
      const h = spec ? spec.heightMeters + (bld.level - 1) * 1.1 : 4.2;
      const elev =
        this.world.terrainWater.getElevationAtGrid(bld.gx, bld.gz) ?? 1.2;

      const bGroup = new THREE.Group();
      bGroup.name = bld.id;
      bGroup.position.set(cx, elev, cz);

      // 1. Landscaped Pavement Verge & Concrete Foundation Plinth (eliminates floating/clipping)
      const vergePad = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.75, 0.05, d + 0.75),
        this.materials.curbstone
      );
      vergePad.position.y = 0.025;
      bGroup.add(vergePad);

      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.25, 0.18, d + 0.25),
        this.materials.concrete
      );
      plinth.position.y = 0.09;
      bGroup.add(plinth);

      // Special case: Urban Park & Transit Plaza
      if (bld.catalogueId === 'bld-inf-civic-park-plaza') {
        const lawn = new THREE.Mesh(
          new THREE.BoxGeometry(w - 0.2, 0.12, d - 0.2),
          new THREE.MeshStandardMaterial({ color: 0x4d7c4d, roughness: 0.85 })
        );
        lawn.position.y = 0.16;
        bGroup.add(lawn);

        const fountainBasin = new THREE.Mesh(
          new THREE.CylinderGeometry(1.3, 1.4, 0.35, 16),
          this.materials.concrete
        );
        fountainBasin.position.y = 0.32;
        bGroup.add(fountainBasin);

        const fountainWater = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1, 1.1, 0.38, 16),
          this.materials.cityGlass
        );
        fountainWater.position.y = 0.34;
        bGroup.add(fountainWater);
        this.buildingsGroup.add(bGroup);
        continue;
      }

      // 2. Select Textured Facade Material
      const facadeStyle: FacadeMaterialStyle =
        spec?.facadeStyle ?? 'ARCHITECTURAL_CONCRETE';
      const facadeTex = this.facadeTextures[facadeStyle];
      const bodyMat = new THREE.MeshStandardMaterial({
        map: facadeTex,
        color: spec ? spec.primaryColorHex : 0xe2e8f0,
        roughness: facadeStyle === 'CURTAIN_GLASS_BLUE' ? 0.24 : 0.68,
        metalness: facadeStyle === 'CURTAIN_GLASS_BLUE' ? 0.62 : 0.15,
      });

      const accentMat = new THREE.MeshStandardMaterial({
        color: spec ? spec.accentColorHex : 0xfbbf24,
        roughness: 0.4,
        metalness: 0.3,
      });

      const roofStyle = spec?.roofStyle ?? 'FLAT_MEMBRANE_HVAC';

      if (bld.id === 'building-city-hq-tower') {
        // =====================================================================
        // BESPOKE 5 x 7 GRID-BLOCK DELIVERY HEADQUARTERS (10m x 14m footprint)
        // Architectural corporate & logistics command center with glazed atrium,
        // cantilevered entrance canopy, executive dispatch bays, and illuminated crown
        // =====================================================================
        const podiumH = 3.2;
        const podium = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.94, podiumH, d * 0.92),
          this.materials.cityTowerBody
        );
        podium.position.y = 0.18 + podiumH * 0.5;
        podium.castShadow = true;
        podium.receiveShadow = true;
        bGroup.add(podium);

        // Double-height glazed entrance atrium on the South (+Z, roundabout-facing) facade
        const atriumGlass = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.68, podiumH * 0.86, 0.24),
          this.materials.cityGlass
        );
        atriumGlass.position.set(0, 0.18 + podiumH * 0.46, d * 0.46);
        bGroup.add(atriumGlass);

        // Cantilevered architectural entrance canopy + support columns
        const entranceCanopy = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.74, 0.22, 1.8),
          accentMat
        );
        entranceCanopy.position.set(0, 2.45, d * 0.46 + 0.75);
        entranceCanopy.castShadow = true;
        bGroup.add(entranceCanopy);

        for (const colX of [-w * 0.28, w * 0.28]) {
          const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.13, 2.25, 10),
            this.materials.accentSteel
          );
          pillar.position.set(colX, 1.3, d * 0.46 + 1.35);
          bGroup.add(pillar);
        }

        // Main Curtain-Wall Tower Shaft with vertical architectural fins
        const shaftH = h * 0.56;
        const shaftW = w * 0.78;
        const shaftD = d * 0.74;
        const shaft = new THREE.Mesh(
          new THREE.BoxGeometry(shaftW, shaftH, shaftD),
          bodyMat
        );
        shaft.position.y = 0.18 + podiumH + shaftH * 0.5;
        shaft.castShadow = true;
        shaft.receiveShadow = true;
        bGroup.add(shaft);

        // Vertical aluminum curtain-wall mullions
        for (let mIdx = -2; mIdx <= 2; mIdx++) {
          const mullion = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, shaftH + podiumH * 0.6, shaftD + 0.12),
            this.materials.cityTowerBody
          );
          mullion.position.set(
            mIdx * (shaftW * 0.21),
            0.18 + podiumH * 0.7 + shaftH * 0.5,
            0
          );
          bGroup.add(mullion);
        }

        // Upper Executive Command Deck & Stepped Crown
        const crownH = h * 0.18;
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(shaftW * 0.82, crownH, shaftD * 0.82),
          this.materials.cityGlass
        );
        crown.position.y = 0.18 + podiumH + shaftH + crownH * 0.5;
        crown.castShadow = true;
        bGroup.add(crown);

        const crownParapet = new THREE.Mesh(
          new THREE.BoxGeometry(shaftW * 0.86, 0.32, shaftD * 0.86),
          accentMat
        );
        crownParapet.position.y = 0.18 + podiumH + shaftH + crownH + 0.16;
        bGroup.add(crownParapet);

        // Rooftop Helipad Pad & Communications Mast
        const helipad = new THREE.Mesh(
          new THREE.CylinderGeometry(1.65, 1.75, 0.14, 24),
          this.materials.asphalt
        );
        helipad.position.set(0, 0.18 + podiumH + shaftH + crownH + 0.38, 0.4);
        bGroup.add(helipad);

        const spire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.16, 2.8, 10),
          this.materials.accentSteel
        );
        spire.position.set(0, 0.18 + podiumH + shaftH + crownH + 1.7, -1.4);
        bGroup.add(spire);

        // North (-Z) Express Courier & Logistics Dispatch Loading Bays
        const rearCanopy = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.72, 0.18, 1.2),
          this.materials.accentSteel
        );
        rearCanopy.position.set(0, 2.15, -d * 0.46 - 0.45);
        bGroup.add(rearCanopy);

        for (const bayX of [-w * 0.22, 0, w * 0.22]) {
          const shutter = new THREE.Mesh(
            new THREE.BoxGeometry(1.35, 1.65, 0.12),
            this.materials.wheelHubSteel
          );
          shutter.position.set(bayX, 1.02, -d * 0.46 - 0.04);
          bGroup.add(shutter);
        }
      } else if (roofStyle === 'STEPPED_CROWN') {
        // Multi-tier High-Rise Tower with Podium, Curtainwall Shaft, Stepped Crown & Spire
        const podiumH = Math.min(3.0, h * 0.25);
        const podium = new THREE.Mesh(
          new THREE.BoxGeometry(w, podiumH, d),
          this.materials.cityTowerBody
        );
        podium.position.y = 0.18 + podiumH * 0.5;
        podium.castShadow = true;
        bGroup.add(podium);

        const shaftH = h * 0.58;
        const shaft = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.82, shaftH, d * 0.82),
          bodyMat
        );
        shaft.position.y = 0.18 + podiumH + shaftH * 0.5;
        shaft.castShadow = true;
        bGroup.add(shaft);

        const crownH = h * 0.17;
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.58, crownH, d * 0.58),
          accentMat
        );
        crown.position.y = 0.18 + podiumH + shaftH + crownH * 0.5;
        bGroup.add(crown);

        const spire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.15, 2.6, 8),
          this.materials.accentSteel
        );
        spire.position.y = 0.18 + h + 1.3;
        bGroup.add(spire);
      } else {
        // Main Building Facade Volume
        const mainBody = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          bodyMat
        );
        mainBody.position.y = 0.18 + h * 0.5;
        mainBody.castShadow = true;
        bGroup.add(mainBody);

        // Architectural Roof Geometry by Category
        if (roofStyle === 'PITCHED_TILE') {
          const pitchedRoof = new THREE.Mesh(
            new THREE.ConeGeometry(Math.max(w, d) * 0.68, 1.6, 4),
            new THREE.MeshStandardMaterial({
              color: spec?.secondaryColorHex ?? 0x9a4432,
              roughness: 0.75,
            })
          );
          pitchedRoof.rotation.y = Math.PI * 0.25;
          pitchedRoof.position.y = 0.18 + h + 0.8;
          bGroup.add(pitchedRoof);
        } else if (roofStyle === 'SAWTOOTH_INDUSTRIAL') {
          const bayCount = 3;
          const bayW = w / bayCount;
          for (let i = 0; i < bayCount; i++) {
            const saw = new THREE.Mesh(
              new THREE.BoxGeometry(bayW * 0.88, 0.75, d * 0.92),
              this.materials.depotRoof
            );
            saw.position.set(
              -w * 0.5 + bayW * (i + 0.5),
              0.18 + h + 0.35,
              0
            );
            saw.rotation.z = 0.18;
            bGroup.add(saw);
          }
          // Twin industrial ventilation stacks
          for (const sx of [-w * 0.28, w * 0.28]) {
            const stack = new THREE.Mesh(
              new THREE.CylinderGeometry(0.26, 0.32, 2.2, 10),
              this.materials.accentSteel
            );
            stack.position.set(sx, 0.18 + h + 1.1, -d * 0.25);
            bGroup.add(stack);
          }
        } else if (roofStyle === 'ARCHED_BARREL') {
          const arch = new THREE.Mesh(
            new THREE.CylinderGeometry(
              w * 0.5,
              w * 0.5,
              d,
              14,
              1,
              false,
              0,
              Math.PI
            ),
            this.materials.depotRoof
          );
          arch.rotation.z = Math.PI * 0.5;
          arch.rotation.y = Math.PI * 0.5;
          arch.scale.set(1, 0.45, 1);
          arch.position.y = 0.18 + h;
          bGroup.add(arch);
        } else {
          // Flat / Clerestory / Cantilever Roof with Parapet & HVAC Units
          const roofSlab = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.24, 0.26, d + 0.24),
            this.materials.depotRoof
          );
          roofSlab.position.y = 0.18 + h + 0.13;
          bGroup.add(roofSlab);

          const hvac = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.32, 0.55, d * 0.28),
            this.materials.concrete
          );
          hvac.position.set(-w * 0.18, 0.18 + h + 0.52, 0);
          bGroup.add(hvac);
        }

        // Loading Docks & Canopies for Industrial / Logistics / Depot / Port / Airport Structures
        if (spec?.hasLoadingBays) {
          const canopy = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.72, 0.18, 1.15),
            accentMat
          );
          canopy.position.set(0, 2.1, d * 0.5 + 0.48);
          bGroup.add(canopy);

          const bayCount = Math.max(2, Math.min(4, Math.floor(w / 2.2)));
          const spacing = (w * 0.65) / bayCount;
          for (let bIdx = 0; bIdx < bayCount; bIdx++) {
            const bx = -w * 0.32 + (bIdx + 0.5) * spacing;
            const shutter = new THREE.Mesh(
              new THREE.BoxGeometry(spacing * 0.7, 1.65, 0.12),
              this.materials.accentSteel
            );
            shutter.position.set(bx, 1.0, d * 0.5 + 0.04);
            bGroup.add(shutter);
          }
        }
      }

      this.buildingsGroup.add(bGroup);
    }
  }

  /**
   * Builds the complete 3D visual representation of Warehouse 1 (or any 20-level Warehouse):
   * - Full 25 x 30 grey undeveloped reserved property (`gx: 35..59, gz: 67..96`).
   * - Northern truck access & dock maneuvering apron (`gz: 67..71`).
   * - Scattered cardboard boxes & wooden pallets across undeveloped grey cells (strictly outside truck lanes).
   * - Constructed warehouse building scaling progressively from 5 x 6 (Level 1) to 25 x 30 (Level 20).
   * - 2 to 10 physical loading doors with animated roll-up shutters along the north dock facade.
   */
  private buildWarehouseFacilityVisuals(
    wh: NonNullable<ReturnType<typeof this.world.economy.getWarehouse>>
  ): void {
    const cs = this.world.config.cellSize;
    const elev = 1.2;

    const root = new THREE.Group();
    root.name = wh.id;

    // 1. Full 25 x 30 Reserved Expansion Property (Grey Undeveloped Industrial Surface)
    const resFp = this.world.grid.getFootprint(
      wh.reservedMinGx,
      wh.reservedMinGz,
      wh.reservedWidthCells,
      wh.reservedDepthCells,
      0
    );
    const resCx = resFp.bounds.centerX;
    const resCz = resFp.bounds.centerZ;
    const resW = wh.reservedWidthCells * cs;
    const resD = wh.reservedDepthCells * cs;

    const greyReserveMat = new THREE.MeshStandardMaterial({
      color: 0x717882,
      roughness: 0.9,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const reserveSlab = new THREE.Mesh(
      new THREE.BoxGeometry(resW - 0.2, 0.06, resD - 0.2),
      greyReserveMat
    );
    reserveSlab.position.set(resCx, elev + 0.02, resCz);
    reserveSlab.receiveShadow = true;
    root.add(reserveSlab);

    // Subtle perimeter industrial boundary curb around the 25 x 30 reserved property
    for (const sideZ of [-1, 1]) {
      const curbZ = new THREE.Mesh(
        new THREE.BoxGeometry(resW, 0.14, 0.24),
        this.materials.curbstone
      );
      curbZ.position.set(resCx, elev + 0.08, resCz + sideZ * (resD * 0.5 - 0.12));
      root.add(curbZ);
    }
    for (const sideX of [-1, 1]) {
      const curbX = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.14, resD),
        this.materials.curbstone
      );
      curbX.position.set(resCx + sideX * (resW * 0.5 - 0.12), elev + 0.08, resCz);
      root.add(curbX);
    }

    // 2. Northern Truck Access & Maneuvering Apron connecting to road at (48, 67)
    const conFp = this.world.grid.getFootprint(
      wh.constructedGx,
      wh.constructedGz,
      wh.constructedWidthCells,
      wh.constructedDepthCells,
      0
    );
    const conCx = conFp.bounds.centerX;
    const conCz = conFp.bounds.centerZ;
    const conW = wh.constructedWidthCells * cs - 0.35;
    const conD = wh.constructedDepthCells * cs - 0.35;

    const apronMinGz = wh.reservedMinGz;
    const apronMaxGz = Math.max(wh.reservedMinGz + 1, wh.constructedGz - 1);
    const apronFp = this.world.grid.getFootprint(
      wh.constructedGx,
      apronMinGz,
      wh.constructedWidthCells,
      apronMaxGz - apronMinGz + 1,
      0
    );
    const apronW = Math.max(conW + 2.0, 12.0);
    const apronD = Math.max(2.2, (apronMaxGz - apronMinGz + 1) * cs);
    const apronMesh = new THREE.Mesh(
      new THREE.BoxGeometry(apronW, 0.07, apronD),
      this.materials.asphalt
    );
    apronMesh.position.set(
      apronFp.bounds.centerX,
      elev + 0.03,
      apronFp.bounds.centerZ
    );
    root.add(apronMesh);

    // 3. Scattered Cardboard Boxes & Wooden Pallets across Undeveloped Grey Areas
    // (Strictly outside the constructed building AND outside the northern truck apron / lanes)
    const palletMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.88,
      metalness: 0.04,
    });
    const cardboardMatA = new THREE.MeshStandardMaterial({
      color: 0xc59b6d,
      roughness: 0.82,
      metalness: 0.02,
    });
    const cardboardMatB = new THREE.MeshStandardMaterial({
      color: 0xad8253,
      roughness: 0.85,
      metalness: 0.02,
    });

    const minConGx = wh.constructedGx;
    const maxConGx = wh.constructedGx + wh.constructedWidthCells - 1;
    const minConGz = wh.constructedGz;
    const maxConGz = wh.constructedGz + wh.constructedDepthCells - 1;

    for (let gz = wh.reservedMinGz + 6; gz <= wh.reservedMaxGz - 1; gz += 3) {
      for (let gx = wh.reservedMinGx + 1; gx <= wh.reservedMaxGx - 1; gx += 3) {
        // Skip if inside or immediately adjacent to constructed warehouse footprint
        if (
          gx >= minConGx - 1 &&
          gx <= maxConGx + 1 &&
          gz >= minConGz - 1 &&
          gz <= maxConGz + 1
        ) {
          continue;
        }
        // Deterministic placement on undeveloped grey property
        const hash =
          Math.abs(Math.sin(gx * 19.13 + gz * 47.71) * 9182.31) % 1;
        if (hash < 0.42) continue;

        const wp = this.world.grid.gridToWorld(gx, gz);
        const propGroup = new THREE.Group();
        propGroup.position.set(
          wp.x + (hash - 0.5) * 0.7,
          elev + 0.05,
          wp.z + (((hash * 13) % 1) - 0.5) * 0.7
        );
        propGroup.rotation.y = (hash * Math.PI * 2) % Math.PI;

        // Wooden Pallet Base
        const pallet = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, 0.12, 0.95),
          palletMat
        );
        pallet.position.y = 0.06;
        propGroup.add(pallet);

        // 1 to 3 Cardboard Boxes stacked on or beside the pallet
        const box1 = new THREE.Mesh(
          new THREE.BoxGeometry(0.52, 0.44, 0.48),
          cardboardMatA
        );
        box1.position.set(-0.22, 0.34, -0.1);
        propGroup.add(box1);

        if (hash > 0.58) {
          const box2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.48, 0.38, 0.44),
            cardboardMatB
          );
          box2.position.set(0.24, 0.31, 0.12);
          propGroup.add(box2);
        }
        if (hash > 0.76) {
          const box3 = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.34, 0.4),
            cardboardMatA
          );
          box3.position.set(-0.18, 0.73, -0.08);
          propGroup.add(box3);
        }

        root.add(propGroup);
      }
    }

    // 4. Constructed Warehouse Building (5 x 6 at Level 1 -> 25 x 30 at Level 20)
    const bldH = 4.6 + (wh.level - 1) * 0.14;
    const bldGroup = new THREE.Group();
    bldGroup.position.set(conCx, elev, conCz);

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(conW + 0.3, 0.18, conD + 0.3),
      this.materials.concrete
    );
    plinth.position.y = 0.09;
    bldGroup.add(plinth);

    const wallMat = new THREE.MeshStandardMaterial({
      map: this.facadeTextures.CORRUGATED_STEEL,
      color: 0xcbd5e1,
      roughness: 0.6,
      metalness: 0.25,
    });
    const trimAmberMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.38,
      metalness: 0.28,
    });

    const mainHall = new THREE.Mesh(
      new THREE.BoxGeometry(conW, bldH, conD),
      wallMat
    );
    mainHall.position.y = 0.18 + bldH * 0.5;
    mainHall.castShadow = true;
    mainHall.receiveShadow = true;
    bldGroup.add(mainHall);

    // Clerestory Roof Slab & Skylight Strips
    const roofSlab = new THREE.Mesh(
      new THREE.BoxGeometry(conW + 0.28, 0.26, conD + 0.28),
      this.materials.depotRoof
    );
    roofSlab.position.y = 0.18 + bldH + 0.13;
    bldGroup.add(roofSlab);

    const skylightCount = Math.max(2, Math.min(6, Math.floor(conD / 4.2)));
    for (let s = 0; s < skylightCount; s++) {
      const sz =
        -conD * 0.38 +
        (skylightCount > 1
          ? (s / (skylightCount - 1)) * (conD * 0.76)
          : 0);
      const skylight = new THREE.Mesh(
        new THREE.BoxGeometry(conW * 0.76, 0.28, 0.85),
        this.materials.cityGlass
      );
      skylight.position.set(0, 0.18 + bldH + 0.32, sz);
      bldGroup.add(skylight);
    }

    // North Loading Dock Canopy (-Z Facade facing the truck apron)
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(conW * 0.96, 0.22, 1.35),
      trimAmberMat
    );
    canopy.position.set(0, 2.55, -conD * 0.5 - 0.55);
    bldGroup.add(canopy);

    root.add(bldGroup);

    // 5. Physical Loading Doors (2 at Level 1 up to 10 at Level 20) along the North Dock Facade
    const doorNorthWallZ = conCz - conD * 0.5;
    const doorWidth = Math.min(
      1.55,
      Math.max(0.78, (conW * 0.88) / Math.max(2, wh.doors.length) - 0.22)
    );
    const doorHeight = 2.05;

    for (const door of wh.doors) {
      const dGroup = new THREE.Group();
      dGroup.position.set(door.worldPos.wx, elev, doorNorthWallZ);

      // Dark interior bay recess behind the roll-up shutter
      const recess = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth * 0.92, doorHeight, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
      );
      recess.position.set(0, 0.18 + doorHeight * 0.5, -0.02);
      dGroup.add(recess);

      // Steel Door Frame (Left, Right, Top Header)
      for (const side of [-1, 1]) {
        const jamb = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, doorHeight + 0.1, 0.24),
          this.materials.accentSteel
        );
        jamb.position.set(
          side * (doorWidth * 0.5),
          0.18 + doorHeight * 0.5,
          -0.06
        );
        dGroup.add(jamb);

        // Safety Yellow Dock Bollards
        const bollard = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.09, 0.65, 8),
          this.materials.safetyYellow
        );
        bollard.position.set(side * (doorWidth * 0.55), 0.35, -0.35);
        dGroup.add(bollard);
      }

      // Animated Roll-Up Shutter Door Mesh
      const shutterMesh = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth * 0.88, doorHeight * 0.96, 0.12),
        this.materials.cityTowerBody
      );
      const openRatio = door.openRatio ?? 0;
      const closedScaleY = Math.max(0.08, 1 - openRatio * 0.88);
      shutterMesh.scale.y = closedScaleY;
      shutterMesh.position.set(
        0,
        0.18 + doorHeight * (1 - closedScaleY * 0.5),
        -0.08
      );
      dGroup.add(shutterMesh);
      this.warehouseDoorShuttersMap.set(door.id, shutterMesh);

      // Painted Truck Docking Lane Stripes on the Apron in front of each door
      for (const side of [-1, 1]) {
        const laneLine = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.015, 2.8),
          this.materials.whiteLine
        );
        laneLine.position.set(side * (doorWidth * 0.52), 0.075, -1.6);
        dGroup.add(laneLine);
      }

      root.add(dGroup);
    }

    this.buildingsGroup.add(root);
  }

  /**
   * Procedural canvas texture for the royal-blue "TRUCK DEPOT" roof sign with white truck icon.
   */
  private createTruckDepotSignTexture(): THREE.CanvasTexture {
    if (typeof document === 'undefined') {
      return new THREE.CanvasTexture(
        { width: 2, height: 2 } as unknown as HTMLCanvasElement
      );
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Royal-blue sign board background
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#1e40af');
      grad.addColorStop(1, '#1d4ed8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 256);

      // Clean white outer frame
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 10;
      ctx.strokeRect(14, 14, 996, 228);

      // White Mini Truck Icon on Left
      ctx.fillStyle = '#ffffff';
      // Cargo box
      ctx.fillRect(62, 68, 118, 86);
      // Forward cab
      ctx.beginPath();
      ctx.moveTo(186, 86);
      ctx.lineTo(234, 86);
      ctx.lineTo(248, 118);
      ctx.lineTo(248, 154);
      ctx.lineTo(186, 154);
      ctx.closePath();
      ctx.fill();
      // Cab window cutout
      ctx.fillStyle = '#1e40af';
      ctx.beginPath();
      ctx.moveTo(194, 96);
      ctx.lineTo(226, 96);
      ctx.lineTo(236, 118);
      ctx.lineTo(194, 118);
      ctx.closePath();
      ctx.fill();
      // Wheels
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(106, 166, 20, 0, Math.PI * 2);
      ctx.arc(212, 166, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e40af';
      ctx.beginPath();
      ctx.arc(106, 166, 9, 0, Math.PI * 2);
      ctx.arc(212, 166, 9, 0, Math.PI * 2);
      ctx.fill();

      // Bold white "TRUCK DEPOT" lettering with clean right-side border margin
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 88px Inter, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('TRUCK DEPOT', 262, 134);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Procedural canvas texture for the freestanding blue truck-icon pylon sign at the depot entrance.
   */
  private createTruckDepotPylonTexture(): THREE.CanvasTexture {
    if (typeof document === 'undefined') {
      return new THREE.CanvasTexture(
        { width: 2, height: 2 } as unknown as HTMLCanvasElement
      );
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 12;
      ctx.strokeRect(14, 14, 228, 228);

      // White truck silhouette
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(42, 78, 108, 76);
      ctx.beginPath();
      ctx.moveTo(156, 96);
      ctx.lineTo(198, 96);
      ctx.lineTo(212, 124);
      ctx.lineTo(212, 154);
      ctx.lineTo(156, 154);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(164, 104, 30, 20);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(82, 168, 18, 0, Math.PI * 2);
      ctx.arc(182, 168, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Builds the complete 3D visual representation of the 20-level Westgate Truck Depot
   * matching the reference boards:
   * - Full 20 × 8 reserved expansion yard (`gx 38..57, gz 45..52`, 40m × 16m) in muted industrial grey.
   * - Restrained temporary construction/yard props on unused reserved cells (`td.unusedReservedProps`)
   *   that are progressively removed as the depot upgrades from Level 1 (4×3) to Level 20 (20×8).
   * - Active depot building with light-grey corrugated steel facade, dark slate plinth, royal-blue
   *   upper fascia band, glazed left dispatch office wing, recessed roll-up garage bays with tall
   *   vehicle clearance and yellow safety bollards, prominent "TRUCK DEPOT" roof sign with truck icon,
   *   blue-and-grey standing-seam roof with skylights & HVAC units, and marked concrete parking slots.
   */
  private buildTruckDepotFacilityVisuals(
    td: ReturnType<typeof this.world.economy.getTruckDepot>
  ): void {
    const cs = this.world.config.cellSize;
    const elev =
      this.world.terrainWater.getElevationAtGrid(
        td.activeMinGx,
        td.activeMinGz
      ) ?? 1.2;

    const root = new THREE.Group();
    root.name = td.id;

    // 1. Full 20 × 8 Reserved Expansion Property (Muted Grey Industrial Yard Slab)
    const resFp = this.world.grid.getFootprint(
      td.reservedMinGx,
      td.reservedMinGz,
      td.reservedWidthCells,
      td.reservedDepthCells,
      0
    );
    const resCx = resFp.bounds.centerX;
    const resCz = resFp.bounds.centerZ;
    const resW = td.reservedWidthCells * cs;
    const resD = td.reservedDepthCells * cs;

    const reservedYardMat = new THREE.MeshStandardMaterial({
      color: 0x7a838e,
      roughness: 0.88,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const reserveSlab = new THREE.Mesh(
      new THREE.BoxGeometry(resW - 0.12, 0.05, resD - 0.12),
      reservedYardMat
    );
    reserveSlab.position.set(resCx, elev + 0.025, resCz);
    reserveSlab.receiveShadow = true;
    root.add(reserveSlab);

    // Subtle expansion grid markings & perimeter security curbing around the 20 × 8 property
    const fencePostMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.55,
      metalness: 0.45,
    });
    const curbMat = this.materials.curbstone;

    // North, West, and East property perimeter curbs + industrial security fence rails
    const northCurb = new THREE.Mesh(
      new THREE.BoxGeometry(resW, 0.16, 0.22),
      curbMat
    );
    northCurb.position.set(resCx, elev + 0.08, resCz - resD * 0.5 + 0.11);
    root.add(northCurb);

    for (const sideX of [-1, 1]) {
      const sideCurb = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.16, resD),
        curbMat
      );
      sideCurb.position.set(
        resCx + sideX * (resW * 0.5 - 0.11),
        elev + 0.08,
        resCz
      );
      root.add(sideCurb);

      // Perimeter security fence posts along West & East edges
      for (let zOff = -resD * 0.5 + 1.0; zOff <= resD * 0.5 - 1.0; zOff += 2.5) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 1.05, 0.08),
          fencePostMat
        );
        post.position.set(
          resCx + sideX * (resW * 0.5 - 0.12),
          elev + 0.55,
          resCz + zOff
        );
        root.add(post);
      }
      const sideRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.06, resD - 0.4),
        fencePostMat
      );
      sideRail.position.set(
        resCx + sideX * (resW * 0.5 - 0.12),
        elev + 0.92,
        resCz
      );
      root.add(sideRail);
    }

    // 2. Unused Reserved Area Temporary Yard Props (Progressively removed as depot expands!)
    const palletWoodMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.86,
    });
    const brickStackMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.8,
    });
    const cardboardStackMat = new THREE.MeshStandardMaterial({
      color: 0xc59b6d,
      roughness: 0.82,
    });
    const blueContainerMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.5,
      metalness: 0.28,
    });
    const orangeContainerMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.52,
      metalness: 0.25,
    });

    for (const prop of td.unusedReservedProps) {
      const pGroup = new THREE.Group();
      pGroup.position.set(prop.worldX, elev + 0.05, prop.worldZ);
      pGroup.rotation.y = prop.rotationY;

      if (prop.kind === 'STORAGE_CONTAINER') {
        const cont = new THREE.Mesh(
          new THREE.BoxGeometry(1.55, 1.05, 0.88),
          (prop.gx + prop.gz) % 2 === 0 ? blueContainerMat : orangeContainerMat
        );
        cont.position.y = 0.525;
        cont.castShadow = true;
        cont.receiveShadow = true;
        pGroup.add(cont);
      } else if (prop.kind === 'BRICK_PALLET') {
        const pallet = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 0.1, 0.88),
          palletWoodMat
        );
        pallet.position.y = 0.05;
        pGroup.add(pallet);
        const bricks = new THREE.Mesh(
          new THREE.BoxGeometry(0.88, 0.46, 0.72),
          brickStackMat
        );
        bricks.position.y = 0.33;
        bricks.castShadow = true;
        pGroup.add(bricks);
      } else if (prop.kind === 'TIMBER_CRATE') {
        const crateA = new THREE.Mesh(
          new THREE.BoxGeometry(0.95, 0.52, 0.76),
          palletWoodMat
        );
        crateA.position.set(-0.12, 0.26, 0);
        crateA.castShadow = true;
        pGroup.add(crateA);
        const crateB = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.38, 0.58),
          cardboardStackMat
        );
        crateB.position.set(0.18, 0.71, 0.05);
        crateB.castShadow = true;
        pGroup.add(crateB);
      } else {
        // CARDBOARD_STACK
        const pallet = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 0.1, 0.88),
          palletWoodMat
        );
        pallet.position.y = 0.05;
        pGroup.add(pallet);
        const boxA = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.4, 0.42),
          cardboardStackMat
        );
        boxA.position.set(-0.2, 0.3, -0.08);
        boxA.castShadow = true;
        pGroup.add(boxA);
        const boxB = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.36, 0.4),
          cardboardStackMat
        );
        boxB.position.set(0.22, 0.28, 0.1);
        boxB.castShadow = true;
        pGroup.add(boxB);
      }

      root.add(pGroup);
    }

    // 3. Active Constructed Depot Footprint (4×3 at Level 1 -> 12×6 at Level 10 -> 20×8 at Level 20)
    const actFp = this.world.grid.getFootprint(
      td.activeMinGx,
      td.activeMinGz,
      td.activeWidthCells,
      td.activeDepthCells,
      0
    );
    const actCx = actFp.bounds.centerX;
    const actCz = actFp.bounds.centerZ;
    const actW = td.activeWidthCells * cs;
    const actD = td.activeDepthCells * cs;

    // Clean concrete apron covering the active depot footprint + driveway apron linking to road gz=55
    const activeApronMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.78,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const activeApron = new THREE.Mesh(
      new THREE.BoxGeometry(actW - 0.08, 0.08, actD - 0.08),
      activeApronMat
    );
    activeApron.position.set(actCx, elev + 0.04, actCz);
    activeApron.receiveShadow = true;
    root.add(activeApron);

    // Southern entrance driveway connecting active depot gate (gz=52) smoothly to starter road (gz=55)
    const drivewayW = Math.min(actW * 0.85, 16.0);
    const driveway = new THREE.Mesh(
      new THREE.BoxGeometry(drivewayW, 0.06, 4.4),
      this.materials.asphalt
    );
    driveway.position.set(actCx, elev + 0.03, actCz + actD * 0.5 + 2.0);
    driveway.receiveShadow = true;
    root.add(driveway);

    // 4. Painted Yellow Parking Slot Lines & Wheel Stoppers for All Unlocked Slots (3..15)
    const yellowLineMat = this.materials.safetyYellow;
    const slotW = 1.32;
    const slotL = 2.45;

    for (const slot of td.slots) {
      if (!slot.unlocked) continue;
      const sGroup = new THREE.Group();
      sGroup.position.set(slot.worldX, elev + 0.085, slot.worldZ);
      sGroup.rotation.y = slot.headingYaw;

      // Left & right yellow bay stripes
      for (const side of [-1, 1]) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, 0.012, slotL),
          yellowLineMat
        );
        stripe.position.set(side * (slotW * 0.5), 0, 0);
        sGroup.add(stripe);
      }
      // Rear wheel stopper bar
      const backBar = new THREE.Mesh(
        new THREE.BoxGeometry(slotW + 0.07, 0.06, 0.1),
        yellowLineMat
      );
      backBar.position.set(0, 0.025, -slotL * 0.5 + 0.08);
      sGroup.add(backBar);

      root.add(sGroup);
    }

    // 5. Main Industrial Truck Depot Building (occupying northern portion of the active footprint)
    // Leaves southern forecourt open so the 3..15 Mini Cargo Trucks are clearly visible in front of the bays
    const bldW = Math.max(7.4, actW - 0.45);
    const bldD =
      td.activeDepthCells <= 3
        ? 2.65
        : Math.min(8.2, Math.max(3.6, actD * 0.48));
    const bldH = td.buildingHeightMeters;
    const bldCx = actCx;
    const bldNorthZ = actCz - actD * 0.5 + 0.2;
    const bldCz = bldNorthZ + bldD * 0.5;
    const frontWallZ = bldCz + bldD * 0.5;

    const bldGroup = new THREE.Group();
    bldGroup.position.set(bldCx, elev, bldCz);

    // Dark slate base plinth
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.72,
      metalness: 0.18,
    });
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(bldW + 0.18, 0.28, bldD + 0.18),
      plinthMat
    );
    plinth.position.y = 0.14;
    bldGroup.add(plinth);

    // Light-grey corrugated steel industrial walls
    const steelWallMat = new THREE.MeshStandardMaterial({
      map: this.facadeTextures.CORRUGATED_STEEL,
      color: 0xd8dee6,
      roughness: 0.52,
      metalness: 0.28,
    });
    const royalBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.36,
      metalness: 0.28,
    });
    const darkFrameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.42,
    });

    const mainHall = new THREE.Mesh(
      new THREE.BoxGeometry(bldW, bldH, bldD),
      steelWallMat
    );
    mainHall.position.y = 0.28 + bldH * 0.5;
    mainHall.castShadow = true;
    mainHall.receiveShadow = true;
    bldGroup.add(mainHall);

    // Royal-blue upper fascia band wrapping all 4 sides of the depot building
    const fasciaH = Math.min(0.95, bldH * 0.21);
    const fasciaBand = new THREE.Mesh(
      new THREE.BoxGeometry(bldW + 0.12, fasciaH, bldD + 0.12),
      royalBlueMat
    );
    fasciaBand.position.y = 0.28 + bldH - fasciaH * 0.52;
    bldGroup.add(fasciaBand);

    // Standing-seam blue-and-grey industrial roof with perimeter parapet, skylight strips & HVAC units
    const parapet = new THREE.Mesh(
      new THREE.BoxGeometry(bldW + 0.24, 0.22, bldD + 0.24),
      this.materials.concrete
    );
    parapet.position.y = 0.28 + bldH + 0.11;
    bldGroup.add(parapet);

    const blueRoofDeck = new THREE.Mesh(
      new THREE.BoxGeometry(bldW - 0.35, 0.08, bldD - 0.35),
      royalBlueMat
    );
    blueRoofDeck.position.y = 0.28 + bldH + 0.23;
    bldGroup.add(blueRoofDeck);

    // Rectangular roof skylight strips (as seen in reference Top & Isometric views)
    const skylightRows = td.activeDepthCells >= 5 ? 2 : 1;
    const skylightCols = Math.max(2, Math.min(6, Math.floor(bldW / 3.2)));
    for (let r = 0; r < skylightRows; r++) {
      const rz =
        skylightRows === 1 ? 0.15 : -bldD * 0.22 + r * (bldD * 0.44);
      for (let c = 0; c < skylightCols; c++) {
        const cxOff =
          -bldW * 0.36 +
          (skylightCols > 1 ? (c / (skylightCols - 1)) * (bldW * 0.72) : 0);
        const sky = new THREE.Mesh(
          new THREE.BoxGeometry(Math.min(2.1, (bldW * 0.55) / skylightCols), 0.12, 0.55),
          this.materials.cityGlass
        );
        sky.position.set(cxOff, 0.28 + bldH + 0.28, rz);
        bldGroup.add(sky);
      }
    }

    // Rooftop HVAC units & ventilation ductwork
    const hvacCount = Math.max(2, Math.min(5, Math.floor(bldW / 5.5)));
    for (let i = 0; i < hvacCount; i++) {
      const hx = -bldW * 0.35 + i * ((bldW * 0.7) / Math.max(1, hvacCount - 1));
      const hvac = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.48, 0.85),
        this.materials.concrete
      );
      hvac.position.set(hx, 0.28 + bldH + 0.48, -bldD * 0.26);
      hvac.castShadow = true;
      bldGroup.add(hvac);
    }

    // 6. Glazed Left Dispatch & Administration Office Wing (matching Reference Front/Isometric views)
    const officeW = Math.min(4.2, Math.max(1.85, bldW * 0.22));
    const officeH = Math.min(3.4, bldH * 0.76);
    const officeD = Math.min(2.2, bldD * 0.65);
    const officeX = -bldW * 0.5 + officeW * 0.52;
    const officeZ = bldD * 0.5 + 0.22;

    const officeBox = new THREE.Mesh(
      new THREE.BoxGeometry(officeW, officeH, 0.48),
      steelWallMat
    );
    officeBox.position.set(officeX, 0.28 + officeH * 0.5, officeZ - 0.12);
    officeBox.castShadow = true;
    bldGroup.add(officeBox);

    const officeGlass = new THREE.Mesh(
      new THREE.BoxGeometry(officeW * 0.88, officeH * 0.72, 0.54),
      this.materials.cityGlass
    );
    officeGlass.position.set(officeX, 0.28 + officeH * 0.48, officeZ - 0.1);
    bldGroup.add(officeGlass);

    // Royal-blue office canopy overhang
    const officeCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(officeW + 0.22, 0.22, 0.85),
      royalBlueMat
    );
    officeCanopy.position.set(officeX, 0.28 + officeH * 0.86, officeZ + 0.12);
    bldGroup.add(officeCanopy);

    // 7. Prominent "TRUCK DEPOT" Roof Signboard with White Mini-Truck Icon above Garage Bays
    const signTex = this.createTruckDepotSignTexture();
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.32,
      metalness: 0.12,
    });
    const signW = Math.min(9.6, Math.max(4.4, bldW * 0.54));
    const signH = Math.min(1.45, Math.max(0.92, bldH * 0.26));
    const signBack = new THREE.Mesh(
      new THREE.BoxGeometry(signW + 0.16, signH + 0.14, 0.24),
      royalBlueMat
    );
    signBack.position.set(
      officeW * 0.25,
      0.28 + bldH - signH * 0.35,
      bldD * 0.5 + 0.14
    );
    bldGroup.add(signBack);

    const signFace = new THREE.Mesh(
      new THREE.PlaneGeometry(signW, signH),
      signMat
    );
    signFace.position.set(
      officeW * 0.25,
      0.28 + bldH - signH * 0.35,
      bldD * 0.5 + 0.27
    );
    bldGroup.add(signFace);

    // 8. Rear & Side Industrial Windows and Service Doors (360-degree fidelity)
    const rearDoor = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(2.6, bldW * 0.28), Math.min(2.6, bldH * 0.62), 0.12),
      darkFrameMat
    );
    rearDoor.position.set(0, 0.28 + Math.min(1.3, bldH * 0.31), -bldD * 0.5 - 0.04);
    bldGroup.add(rearDoor);

    for (const sideX of [-1, 1]) {
      const sideWindow = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.68, Math.max(1.4, bldD * 0.52)),
        this.materials.cityGlass
      );
      sideWindow.position.set(
        sideX * (bldW * 0.5 + 0.03),
        0.28 + bldH * 0.56,
        0
      );
      bldGroup.add(sideWindow);
    }

    root.add(bldGroup);

    // 9. Recessed Vehicle Service & Maintenance Bays with Tall Entrance Clearance & Yellow Safety Bollards
    //    (3 bays at Level 1 up to 8 bays at Level 20 — generously sized for the Mini Cargo Truck)
    const bayCount = td.garageBayCount;
    const bayZoneStartX = bldCx - bldW * 0.5 + officeW + 0.25;
    const bayZoneEndX = bldCx + bldW * 0.5 - 0.25;
    const bayZoneSpan = Math.max(3.8, bayZoneEndX - bayZoneStartX);
    const baySpacing = bayZoneSpan / bayCount;
    const bayW = Math.min(2.25, Math.max(1.22, baySpacing * 0.78));
    const bayH = Math.min(td.entranceClearanceHeightMeters, bldH - fasciaH - 0.22);

    const interiorRecessMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.88,
    });
    const shutterMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.48,
      metalness: 0.38,
    });

    for (let b = 0; b < bayCount; b++) {
      const bx = bayZoneStartX + (b + 0.5) * baySpacing;
      const bayGroup = new THREE.Group();
      bayGroup.position.set(bx, elev, frontWallZ);

      // Deep dark garage bay recess
      const recess = new THREE.Mesh(
        new THREE.BoxGeometry(bayW * 0.94, bayH, 0.28),
        interiorRecessMat
      );
      recess.position.set(0, 0.28 + bayH * 0.5, -0.04);
      bayGroup.add(recess);

      // Raised sectional roll-up door header (open to allow full mini-truck vertical & horizontal clearance)
      const shutterHeaderH = bayH * 0.28;
      const shutterMesh = new THREE.Mesh(
        new THREE.BoxGeometry(bayW * 0.9, shutterHeaderH, 0.14),
        shutterMat
      );
      shutterMesh.position.set(
        0,
        0.28 + bayH - shutterHeaderH * 0.5,
        0.04
      );
      bayGroup.add(shutterMesh);

      // Steel portal jambs & yellow safety bollards on both sides of the garage door
      for (const side of [-1, 1]) {
        const jamb = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, bayH + 0.08, 0.22),
          darkFrameMat
        );
        jamb.position.set(side * (bayW * 0.5), 0.28 + bayH * 0.5, 0.05);
        bayGroup.add(jamb);

        const bollard = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.085, 0.62, 8),
          yellowLineMat
        );
        bollard.position.set(side * (bayW * 0.54), 0.31, 0.32);
        bayGroup.add(bollard);
      }

      root.add(bayGroup);
    }

    // 10. Right-Side Blue Service Canopy (for expanded depots Level 5+) & Freestanding Truck-Icon Pylon Sign
    if (td.activeWidthCells >= 8) {
      const canopyW = Math.min(5.2, actW * 0.2);
      const canopyD = Math.min(3.4, actD * 0.32);
      const canopyX = actCx + actW * 0.5 - canopyW * 0.58;
      const canopyZ = actCz + actD * 0.16;

      const canopyRoof = new THREE.Mesh(
        new THREE.BoxGeometry(canopyW, 0.24, canopyD),
        royalBlueMat
      );
      canopyRoof.position.set(canopyX, elev + 3.1, canopyZ);
      canopyRoof.castShadow = true;
      root.add(canopyRoof);

      for (const px of [-canopyW * 0.38, canopyW * 0.38]) {
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 3.0, 8),
          darkFrameMat
        );
        col.position.set(canopyX + px, elev + 1.5, canopyZ);
        root.add(col);
      }
    }

    // Freestanding Blue Pylon Sign with White Truck Icon at Right Front Entrance Corner
    const pylonX = actCx + actW * 0.5 - 0.55;
    const pylonZ = actCz + actD * 0.5 - 0.45;
    const pylonPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 2.85, 10),
      this.materials.accentSteel
    );
    pylonPost.position.set(pylonX, elev + 1.42, pylonZ);
    root.add(pylonPost);

    const pylonTex = this.createTruckDepotPylonTexture();
    const pylonBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.95, 0.18),
      new THREE.MeshStandardMaterial({
        map: pylonTex,
        roughness: 0.35,
        metalness: 0.15,
      })
    );
    pylonBoard.position.set(pylonX, elev + 2.95, pylonZ);
    root.add(pylonBoard);

    this.buildingsGroup.add(root);
  }

  /**
   * Builds and updates all owned dispatched vehicles, Warehouse 1 forklifts (2..10),
   * and ambient motorway/roundabout/rail/ship/air vehicles.
   */
  public rebuildVehiclesVisuals(): void {
    this.clearGroup(this.vehiclesGroup);
    this.vehicleRigsMap.clear();
    this.forkliftRigsMap.clear();

    // 1. Owned Fleet Vehicles
    for (const ov of this.world.economy.getOwnedVehicles()) {
      const rig = this.createVehicleVisualRig(
        ov.id,
        ov.catalogueId,
        ov.liveryId,
        true
      );
      this.vehicleRigsMap.set(ov.id, rig);
      this.vehiclesGroup.add(rig.root);
    }

    // 2. Ambient Motorway, Roundabout, Rail, Ship & Air Vehicles
    for (const av of this.world.economy.getAmbientVehicles()) {
      const rig = this.createVehicleVisualRig(
        av.id,
        av.catalogueId,
        av.liveryId,
        false
      );
      this.vehicleRigsMap.set(av.id, rig);
      this.vehiclesGroup.add(rig.root);
    }

    // 3. Warehouse Operational Forklifts (2 at Level 1 up to 10 at Level 20)
    for (const wh of this.world.economy.getAllWarehouses()) {
      for (const fl of wh.forklifts) {
        const flRig = this.createForkliftVisualRig(fl.id);
        this.forkliftRigsMap.set(fl.id, flRig);
        this.vehiclesGroup.add(flRig.root);
      }
    }

    // 4. Railway Freight Hub Rolling Stock (GTE-L1 Train Consists), GTE Model 360 Forklifts & Landside Staging Trucks
    const railHub = this.world.railways.getFreightHubState();
    for (const train of railHub.trains) {
      const rig = this.createVehicleVisualRig(
        train.id,
        'veh-rail-diesel-freight',
        'livery-amber-express',
        true
      );
      this.vehicleRigsMap.set(train.id, rig);
      this.vehiclesGroup.add(rig.root);
    }
    for (const rfl of railHub.forklifts) {
      const flRig = this.createForkliftVisualRig(rfl.id);
      this.forkliftRigsMap.set(rfl.id, flRig);
      this.vehiclesGroup.add(flRig.root);
    }

    this.gseRigsMap.clear();
    this.updateVehiclesAnimation();
  }

  /**
   * Creates the GTE Logistics Forklift Model 360 3D rig matching `/public/assets/aistudio/image_075d6c2f.png`:
   * - Vibrant Golden-Yellow sculpted body (`0xf59e0b`) with side "GTE / GTE LOGISTICS" branding
   * - Rounded rear counterweight with yellow-and-black diagonal hazard chevron stripes
   * - Matte black (`0x27272a`) overhead ROPS operator cabin with top protective grille bars, seat, steering wheel & 3 control levers
   * - 4 heavy-duty industrial tyres
   * - Twin vertical golden-yellow/black mast rails with central hydraulic cylinder & lift chains
   * - Animated yellow fork carriage + L-shaped steel forks + loaded wooden pallet & cargo crate
   */
  private createForkliftVisualRig(id: string): ForkliftVisualRig {
    const root = new THREE.Group();
    root.name = id;

    const wheels: THREE.Object3D[] = [];
    const gteYellowMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.34,
      metalness: 0.25,
    });
    const rOpsBlackMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.55,
      metalness: 0.35,
    });

    // Procedural GTE Logistics side branding & rear hazard chevron textures
    let sideLogoMat: THREE.Material = gteYellowMat;
    let hazardCounterweightMat: THREE.Material = gteYellowMat;
    if (typeof document !== 'undefined') {
      const logoCanvas = document.createElement('canvas');
      logoCanvas.width = 256;
      logoCanvas.height = 128;
      const lctx = logoCanvas.getContext('2d');
      if (lctx) {
        lctx.fillStyle = '#f59e0b';
        lctx.fillRect(0, 0, 256, 128);
        lctx.font = '900 54px Inter, Arial, sans-serif';
        lctx.fillStyle = '#18181b';
        lctx.fillText('G', 42, 68);
        lctx.fillStyle = '#dc2626';
        lctx.fillText('TE', 86, 68);
        lctx.font = '700 20px Inter, Arial, sans-serif';
        lctx.fillStyle = '#18181b';
        lctx.fillText('GTE LOGISTICS', 42, 98);
        const tex = new THREE.CanvasTexture(logoCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        sideLogoMat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.35,
          metalness: 0.2,
        });
      }

      const hazCanvas = document.createElement('canvas');
      hazCanvas.width = 256;
      hazCanvas.height = 128;
      const hctx = hazCanvas.getContext('2d');
      if (hctx) {
        hctx.fillStyle = '#f59e0b';
        hctx.fillRect(0, 0, 256, 128);
        hctx.fillStyle = '#18181b';
        for (let x = -128; x < 384; x += 36) {
          hctx.beginPath();
          hctx.moveTo(x, 24);
          hctx.lineTo(x + 18, 24);
          hctx.lineTo(x - 22, 104);
          hctx.lineTo(x - 40, 104);
          hctx.closePath();
          hctx.fill();
        }
        const htex = new THREE.CanvasTexture(hazCanvas);
        htex.colorSpace = THREE.SRGBColorSpace;
        hazardCounterweightMat = new THREE.MeshStandardMaterial({
          map: htex,
          roughness: 0.4,
          metalness: 0.22,
        });
      }
    }

    // 1. Sculpted Golden-Yellow Chassis & Side Branding Panels
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.36, 0.88),
      gteYellowMat
    );
    chassis.position.set(0, 0.28, -0.04);
    chassis.castShadow = true;
    root.add(chassis);

    for (const side of [-1, 1]) {
      const sideDecal = new THREE.Mesh(
        new THREE.PlaneGeometry(0.56, 0.26),
        sideLogoMat
      );
      sideDecal.position.set(side * 0.345, 0.29, -0.02);
      sideDecal.rotation.y = side === 1 ? Math.PI * 0.5 : -Math.PI * 0.5;
      root.add(sideDecal);
    }

    // Rear Counterweight with Yellow-and-Black Diagonal Hazard Stripes
    const counterweight = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.44, 0.32),
      hazardCounterweightMat
    );
    counterweight.position.set(0, 0.33, -0.46);
    counterweight.castShadow = true;
    root.add(counterweight);

    // 2. Operator Cabin: Contoured Seat, Steering Column, 3 Hydraulic Levers & Matte-Black ROPS Cage
    const floorDeck = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.06, 0.54),
      rOpsBlackMat
    );
    floorDeck.position.set(0, 0.46, -0.04);
    root.add(floorDeck);

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.24, 0.28),
      rOpsBlackMat
    );
    seat.position.set(0, 0.58, -0.14);
    root.add(seat);

    const seatBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.28, 0.07),
      rOpsBlackMat
    );
    seatBack.position.set(0, 0.72, -0.25);
    root.add(seatBack);

    const consoleBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.28, 0.16),
      rOpsBlackMat
    );
    consoleBox.position.set(0, 0.58, 0.2);
    consoleBox.rotation.x = -0.22;
    root.add(consoleBox);

    // 3 Hydraulic Control Levers next to steering column
    for (const lx of [0.14, 0.18, 0.22]) {
      const lever = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6),
        rOpsBlackMat
      );
      lever.position.set(lx, 0.74, 0.18);
      lever.rotation.x = -0.25;
      root.add(lever);
    }

    // Matte-black ROPS overhead roll-cage posts & slotted roof guard
    for (const px of [-0.28, 0.28]) {
      for (const pz of [-0.34, 0.24]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.62, 0.045),
          rOpsBlackMat
        );
        post.position.set(px, 0.76, pz);
        root.add(post);
      }
    }
    const roofGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.045, 0.64),
      rOpsBlackMat
    );
    roofGuard.position.set(0, 1.06, -0.05);
    root.add(roofGuard);

    // 3. Four Heavy-Duty Industrial Tyres with Dark Hubs
    for (const zOff of [0.24, -0.36]) {
      const axle = new THREE.Group();
      axle.position.set(0, 0.15, zOff);
      for (const side of [-0.33, 0.33]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 0.13, 12),
          this.materials.tyreRubber
        );
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.x = side;
        axle.add(wheel);
      }
      root.add(axle);
      wheels.push(axle);
    }

    // 4. Twin Vertical Golden-Yellow Mast Rails + Central Black Hydraulic Cylinder on Front (+Z)
    for (const mx of [-0.21, 0.21]) {
      const mastRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.32, 0.07),
        gteYellowMat
      );
      mastRail.position.set(mx, 0.74, 0.42);
      root.add(mastRail);
    }
    const liftCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.24, 8),
      rOpsBlackMat
    );
    liftCylinder.position.set(0, 0.72, 0.41);
    root.add(liftCylinder);

    // 5. Animated Lifting Fork Carriage + Yellow Load Backrest + Twin L-Shaped Forks + Cargo Pallet
    const forkCarriageGroup = new THREE.Group();
    forkCarriageGroup.position.set(0, 0.18, 0.46);

    const backrest = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.32, 0.045),
      gteYellowMat
    );
    backrest.position.set(0, 0.16, 0);
    forkCarriageGroup.add(backrest);

    for (const fx of [-0.16, 0.16]) {
      const forkVertical = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.28, 0.04),
        gteYellowMat
      );
      forkVertical.position.set(fx, 0.14, 0.02);
      forkCarriageGroup.add(forkVertical);

      const forkBlade = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.035, 0.58),
        gteYellowMat
      );
      forkBlade.position.set(fx, 0.02, 0.29);
      forkCarriageGroup.add(forkBlade);
    }

    // Cargo Pallet & Crate on the Forks (visible when forklift is carrying cargo)
    const cargoGroup = new THREE.Group();
    cargoGroup.position.set(0, 0.06, 0.28);
    const palletMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.06, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.88 })
    );
    cargoGroup.add(palletMesh);

    const cargoCrateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.42, 0.46),
      new THREE.MeshStandardMaterial({ color: 0xc59b6d, roughness: 0.78 })
    );
    cargoCrateMesh.position.y = 0.24;
    cargoGroup.add(cargoCrateMesh);
    cargoGroup.visible = false;

    forkCarriageGroup.add(cargoGroup);
    root.add(forkCarriageGroup);

    return {
      root,
      forkCarriageGroup,
      cargoGroup,
      cargoCrateMesh,
      wheels,
    };
  }

  private createVehicleVisualRig(
    id: string,
    catalogueId: string,
    liveryId: string,
    isPlayerOwned: boolean
  ): DynamicVehicleVisualRig {
    const spec = getVehicleSpecById(catalogueId);
    const livery = getLiveryById(liveryId);

    const root = new THREE.Group();
    root.name = id;

    const tractorGroup = new THREE.Group();
    root.add(tractorGroup);

    const wheels: THREE.Object3D[] = [];
    let trailerGroup: THREE.Group | undefined;
    let brakeLightMesh: THREE.Mesh | undefined;
    let contactShadowMesh: THREE.Mesh | undefined;
    const fineDetailGroup = new THREE.Group();
    tractorGroup.add(fineDetailGroup);

    const cabMat = new THREE.MeshStandardMaterial({
      color: livery.cabColorHex,
      roughness: 0.3,
      metalness: 0.38,
    });
    const bodyMat = new THREE.MeshStandardMaterial({
      color: livery.bodyColorHex,
      roughness: 0.4,
      metalness: 0.22,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: livery.stripeColorHex,
      roughness: 0.35,
      metalness: 0.25,
    });

    const modal = spec?.modal ?? 'ROAD';

    // Helper to create a detailed rotating wheel + metallic hub
    const addWheelPair = (
      parent: THREE.Group,
      zOffset: number,
      halfTrackWidth: number,
      radius = 0.26
    ) => {
      const axleGroup = new THREE.Group();
      axleGroup.position.set(0, radius, zOffset);
      for (const side of [-1, 1]) {
        const tyre = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, 0.2, 12),
          this.materials.tyreRubber
        );
        tyre.rotation.z = Math.PI * 0.5;
        tyre.position.x = side * halfTrackWidth;
        axleGroup.add(tyre);

        const hub = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, radius * 1.1, radius * 0.35),
          this.materials.wheelHubSteel
        );
        hub.position.x = side * halfTrackWidth;
        axleGroup.add(hub);
      }
      parent.add(axleGroup);
      wheels.push(axleGroup);
    };

    if (modal === 'ROAD') {
      const isArticulated = spec?.isArticulated ?? false;
      const trailerStyle: TrailerBodyStyle = spec?.trailerStyle ?? 'BOX_VAN';
      const isMiniCargoTruck = catalogueId === 'veh-road-sprinter-van';

      if (isMiniCargoTruck) {
        // =====================================================================
        // 360-DEGREE MINI CARGO BOX TRUCK (BlueLine Mini Cargo Truck)
        // Exact compact proportions (2.15m length × 0.92m width × 1.08m height)
        // matching the reference Front, Side, Rear, 3/4, and Top views.
        // =====================================================================
        contactShadowMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1.18, 2.35),
          this.materials.contactShadow
        );
        contactShadowMesh.rotation.x = -Math.PI * 0.5;
        contactShadowMesh.position.set(0, 0.02, -0.05);
        contactShadowMesh.visible = getGraphicsQualitySpec(
          this.graphicsQuality
        ).enableContactShadows;
        this.contactShadowMeshes.push(contactShadowMesh);
        tractorGroup.add(contactShadowMesh);

        const miniBlueCabMat = new THREE.MeshStandardMaterial({
          color: isPlayerOwned ? 0x0284c7 : livery.cabColorHex,
          roughness: 0.28,
          metalness: 0.36,
        });
        const miniCargoBoxMat = new THREE.MeshStandardMaterial({
          color: isPlayerOwned ? 0x2563eb : livery.bodyColorHex,
          roughness: 0.36,
          metalness: 0.22,
        });
        const silverTrimMat = this.materials.wheelHubSteel;
        const darkTrimMat = this.materials.tyreRubber;
        const amberIndicatorMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 0.35,
          roughness: 0.3,
        });

        // 1. Ladder Chassis Frame & Undercarriage Rails
        const chassisFrame = new THREE.Mesh(
          new THREE.BoxGeometry(0.72, 0.16, 2.02),
          this.materials.accentSteel
        );
        chassisFrame.position.set(0, 0.25, -0.04);
        tractorGroup.add(chassisFrame);

        // Side underrun protection bars & fuel tank between axles
        for (const side of [-1, 1]) {
          const sideGuard = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.1, 0.68),
            darkTrimMat
          );
          sideGuard.position.set(side * 0.42, 0.26, -0.08);
          fineDetailGroup.add(sideGuard);
        }

        // 2. Forward-Control Royal-Blue Cab (Front +Z: z = +0.34 to +1.02)
        const cabW = 0.88;
        const cabH = 0.72;
        const cabL = 0.66;
        const cabLower = new THREE.Mesh(
          new THREE.BoxGeometry(cabW, cabH * 0.56, cabL),
          miniBlueCabMat
        );
        cabLower.position.set(0, 0.31 + cabH * 0.28, 0.66);
        cabLower.castShadow = true;
        tractorGroup.add(cabLower);

        const cabUpper = new THREE.Mesh(
          new THREE.BoxGeometry(cabW * 0.96, cabH * 0.46, cabL * 0.88),
          miniBlueCabMat
        );
        cabUpper.position.set(0, 0.31 + cabH * 0.76, 0.62);
        cabUpper.castShadow = true;
        tractorGroup.add(cabUpper);

        // Aerodynamic cab roof deflector cap
        const roofCap = new THREE.Mesh(
          new THREE.BoxGeometry(cabW * 0.9, 0.1, 0.38),
          miniBlueCabMat
        );
        roofCap.position.set(0, 1.04, 0.52);
        roofCap.rotation.x = 0.18;
        fineDetailGroup.add(roofCap);

        // Dark-tinted sloped front windscreen + black wiper bar
        const windscreen = new THREE.Mesh(
          new THREE.BoxGeometry(cabW * 0.86, 0.28, 0.06),
          this.materials.cityGlass
        );
        windscreen.position.set(0, 0.82, 0.95);
        windscreen.rotation.x = -0.14;
        tractorGroup.add(windscreen);

        // Left & Right Cab Side Door Windows + Door Handles
        for (const side of [-1, 1]) {
          const doorWin = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.25, 0.42),
            this.materials.cityGlass
          );
          doorWin.position.set(side * (cabW * 0.48 + 0.01), 0.8, 0.64);
          tractorGroup.add(doorWin);

          // Outward black wing mirror arm + vertical rectangular mirror housing
          const mirrorArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.03, 0.03),
            darkTrimMat
          );
          mirrorArm.position.set(side * (cabW * 0.5 + 0.04), 0.84, 0.88);
          fineDetailGroup.add(mirrorArm);

          const mirrorHousing = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.18, 0.08),
            darkTrimMat
          );
          mirrorHousing.position.set(side * (cabW * 0.5 + 0.09), 0.82, 0.89);
          fineDetailGroup.add(mirrorHousing);
        }

        // Front Bumper with recessed fog lamps & registration plate
        const frontBumper = new THREE.Mesh(
          new THREE.BoxGeometry(cabW + 0.04, 0.18, 0.12),
          darkTrimMat
        );
        frontBumper.position.set(0, 0.26, 0.98);
        tractorGroup.add(frontBumper);

        const frontPlate = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.06, 0.02),
          this.materials.whiteLine
        );
        frontPlate.position.set(0, 0.25, 1.045);
        fineDetailGroup.add(frontPlate);

        // Front Radiator Grille + Horizontal Silver Louvers + Central Emblem Badge
        const grille = new THREE.Mesh(
          new THREE.BoxGeometry(cabW * 0.66, 0.22, 0.05),
          darkTrimMat
        );
        grille.position.set(0, 0.48, 0.985);
        tractorGroup.add(grille);

        for (const barY of [0.44, 0.52]) {
          const grilleBar = new THREE.Mesh(
            new THREE.BoxGeometry(cabW * 0.6, 0.025, 0.06),
            silverTrimMat
          );
          grilleBar.position.set(0, barY, 0.99);
          fineDetailGroup.add(grilleBar);
        }

        const badge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10),
          silverTrimMat
        );
        badge.rotation.x = Math.PI * 0.5;
        badge.position.set(0, 0.49, 1.01);
        fineDetailGroup.add(badge);

        // Front Headlights + Corner Amber Turn Indicators
        for (const side of [-1, 1]) {
          const hl = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.1, 0.05),
            this.materials.headlightEmissive
          );
          hl.position.set(side * 0.34, 0.46, 0.99);
          tractorGroup.add(hl);

          const indicator = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.09, 0.05),
            amberIndicatorMat
          );
          indicator.position.set(side * 0.42, 0.46, 0.985);
          tractorGroup.add(indicator);
        }

        // 3. Four Rotating Wheels (Front Steering Axle + Rear Drive Axle)
        addWheelPair(tractorGroup, 0.58, 0.41, 0.2);
        addWheelPair(tractorGroup, -0.62, 0.41, 0.2);

        // 4. Enclosed Rectangular Box Cargo Body (Rear: z = -1.07 to +0.29)
        const boxW = 0.94;
        const boxH = 0.82;
        const boxL = 1.36;
        const boxCenterY = 0.32 + boxH * 0.5;
        const boxCenterZ = -0.39;

        const cargoBox = new THREE.Mesh(
          new THREE.BoxGeometry(boxW, boxH, boxL),
          miniCargoBoxMat
        );
        cargoBox.position.set(0, boxCenterY, boxCenterZ);
        cargoBox.castShadow = true;
        cargoBox.receiveShadow = true;
        tractorGroup.add(cargoBox);

        // Silver/aluminum top & corner edge framing rails on cargo box
        const roofTrim = new THREE.Mesh(
          new THREE.BoxGeometry(boxW + 0.02, 0.04, boxL + 0.02),
          silverTrimMat
        );
        roofTrim.position.set(0, 0.32 + boxH + 0.01, boxCenterZ);
        fineDetailGroup.add(roofTrim);

        // Subtle side cargo panel ribbing
        for (const zRib of [-0.82, -0.39, 0.04]) {
          const rib = new THREE.Mesh(
            new THREE.BoxGeometry(boxW + 0.015, boxH * 0.92, 0.025),
            silverTrimMat
          );
          rib.position.set(0, boxCenterY, zRib);
          fineDetailGroup.add(rib);
        }

        // 5. Rear Double Cargo Doors with Vertical Locking Bars, Hinges & Tail Lights (z = -1.07)
        const rearZ = boxCenterZ - boxL * 0.5 - 0.01;
        const centerSeam = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, boxH * 0.94, 0.02),
          darkTrimMat
        );
        centerSeam.position.set(0, boxCenterY, rearZ);
        tractorGroup.add(centerSeam);

        // Twin vertical chrome door locking rods
        for (const lockX of [-0.14, 0.14]) {
          const lockRod = new THREE.Mesh(
            new THREE.BoxGeometry(0.025, boxH * 0.9, 0.03),
            silverTrimMat
          );
          lockRod.position.set(lockX, boxCenterY, rearZ - 0.01);
          fineDetailGroup.add(lockRod);
        }

        // Rear underrun bumper & brake/tail-light bar
        const rearBumper = new THREE.Mesh(
          new THREE.BoxGeometry(boxW * 0.96, 0.12, 0.08),
          darkTrimMat
        );
        rearBumper.position.set(0, 0.26, rearZ - 0.02);
        tractorGroup.add(rearBumper);

        brakeLightMesh = new THREE.Mesh(
          new THREE.BoxGeometry(boxW * 0.84, 0.09, 0.05),
          this.materials.brakeLightEmissive
        );
        brakeLightMesh.position.set(0, 0.28, rearZ - 0.04);
        tractorGroup.add(brakeLightMesh);
      } else {
        // =====================================================================
        // STANDARD / HEAVY ROAD TRUCK OR ARTICULATED SEMI-TRUCK
        // =====================================================================
        contactShadowMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1.75, isArticulated ? 2.9 : 3.9),
          this.materials.contactShadow
        );
        contactShadowMesh.rotation.x = -Math.PI * 0.5;
        contactShadowMesh.position.set(0, 0.02, isArticulated ? -0.15 : -0.55);
        contactShadowMesh.visible = getGraphicsQualitySpec(
          this.graphicsQuality
        ).enableContactShadows;
        this.contactShadowMeshes.push(contactShadowMesh);
        tractorGroup.add(contactShadowMesh);

        // Tractor / Cab Unit (Cab body, front bumper, grille, windscreen, side mirrors, chassis, headlights)
        const cabW = 1.05;
        const cabH = 1.12;
        const cabL = 1.35;

        const chassis = new THREE.Mesh(
          new THREE.BoxGeometry(cabW * 0.88, 0.22, isArticulated ? 2.3 : 3.0),
          this.materials.accentSteel
        );
        chassis.position.set(0, 0.32, isArticulated ? -0.2 : -0.6);
        tractorGroup.add(chassis);

        const frontBumper = new THREE.Mesh(
          new THREE.BoxGeometry(cabW + 0.04, 0.24, 0.16),
          this.materials.tyreRubber
        );
        frontBumper.position.set(0, 0.32, 1.02);
        tractorGroup.add(frontBumper);

        const cabMesh = new THREE.Mesh(
          new THREE.BoxGeometry(cabW, cabH, cabL),
          cabMat
        );
        cabMesh.position.set(0, 0.4 + cabH * 0.5, 0.35);
        cabMesh.castShadow = true;
        tractorGroup.add(cabMesh);

        // Aerodynamic roof wind deflector & side mirrors (fine detail group)
        const roofFairing = new THREE.Mesh(
          new THREE.BoxGeometry(cabW * 0.92, 0.22, 0.65),
          cabMat
        );
        roofFairing.position.set(0, 0.4 + cabH + 0.08, 0.18);
        roofFairing.rotation.x = 0.22;
        fineDetailGroup.add(roofFairing);

        for (const mSide of [-1, 1]) {
          const mirror = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.26, 0.12),
            this.materials.tyreRubber
          );
          mirror.position.set(mSide * (cabW * 0.5 + 0.06), 1.12, 0.88);
          fineDetailGroup.add(mirror);
        }

        // Tinted Windscreen & Front Grille
        const windscreen = new THREE.Mesh(
          new THREE.BoxGeometry(cabW * 0.88, 0.42, 0.08),
          this.materials.cityGlass
        );
        windscreen.position.set(0, 1.1, 1.02);
        tractorGroup.add(windscreen);

        const grille = new THREE.Mesh(
          new THREE.BoxGeometry(cabW * 0.72, 0.42, 0.08),
          this.materials.accentSteel
        );
        grille.position.set(0, 0.62, 1.03);
        tractorGroup.add(grille);

        // Twin Headlights
        for (const side of [-0.36, 0.36]) {
          const hl = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.12, 0.06),
            this.materials.headlightEmissive
          );
          hl.position.set(side, 0.52, 1.04);
          tractorGroup.add(hl);
        }

        // Rotating Front & Rear Drive Axles on Tractor
        addWheelPair(tractorGroup, 0.55, 0.52, 0.25);
        addWheelPair(tractorGroup, -0.85, 0.52, 0.25);

        if (!isArticulated) {
          // Rigid Box Truck / Delivery Van Cargo Box on same chassis
          const boxGeo = new THREE.BoxGeometry(1.12, 1.25, 2.05);
          const boxMesh = new THREE.Mesh(boxGeo, bodyMat);
          boxMesh.position.set(0, 1.05, -1.05);
          boxMesh.castShadow = true;
          tractorGroup.add(boxMesh);

          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(1.15, 0.18, 2.06),
            stripeMat
          );
          stripe.position.set(0, 1.05, -1.05);
          tractorGroup.add(stripe);

          brakeLightMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.95, 0.14, 0.06),
            this.materials.brakeLightEmissive
          );
          brakeLightMesh.position.set(0, 0.42, -2.09);
          tractorGroup.add(brakeLightMesh);
        } else {
          // Articulated Semi-Trailer (follows tractor path independently!)
          trailerGroup = new THREE.Group();
          root.add(trailerGroup);

        const trLen = 3.2;
        const trW = 1.14;
        const trH = 1.32;

        const trShadow = new THREE.Mesh(
          new THREE.PlaneGeometry(1.75, trLen + 0.5),
          this.materials.contactShadow
        );
        trShadow.rotation.x = -Math.PI * 0.5;
        trShadow.position.set(0, 0.02, 0);
        trShadow.visible = getGraphicsQualitySpec(this.graphicsQuality).enableContactShadows;
        this.contactShadowMeshes.push(trShadow);
        trailerGroup.add(trShadow);

        if (trailerStyle === 'TANKER_TRAILER') {
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(0.56, 0.56, trLen, 14),
            this.materials.wheelHubSteel
          );
          tank.rotation.x = Math.PI * 0.5;
          tank.position.set(0, 1.02, 0);
          tank.castShadow = true;
          trailerGroup.add(tank);

          const tankStripe = new THREE.Mesh(
            new THREE.BoxGeometry(1.15, 0.16, trLen * 0.9),
            stripeMat
          );
          tankStripe.position.set(0, 1.02, 0);
          trailerGroup.add(tankStripe);
        } else if (trailerStyle === 'FLATBED_TRAILER') {
          const deck = new THREE.Mesh(
            new THREE.BoxGeometry(trW, 0.16, trLen),
            this.materials.accentSteel
          );
          deck.position.set(0, 0.55, 0);
          trailerGroup.add(deck);

          // Strapped Steel Coils / Heavy Machinery Cargo on Flatbed
          for (const zCoil of [-0.75, 0.65]) {
            const coil = new THREE.Mesh(
              new THREE.CylinderGeometry(0.45, 0.45, 0.85, 12),
              this.materials.wheelHubSteel
            );
            coil.rotation.z = Math.PI * 0.5;
            coil.position.set(0, 1.05, zCoil);
            trailerGroup.add(coil);
          }
        } else {
          // Enclosed, Container, or Refrigerated Trailer Body
          const trBodyMat =
            trailerStyle === 'CONTAINER_TRAILER' ? cabMat : bodyMat;
          const trBox = new THREE.Mesh(
            new THREE.BoxGeometry(trW, trH, trLen),
            trBodyMat
          );
          trBox.position.set(0, 0.48 + trH * 0.5, 0);
          trBox.castShadow = true;
          trailerGroup.add(trBox);

          const trStripe = new THREE.Mesh(
            new THREE.BoxGeometry(trW + 0.03, 0.2, trLen * 0.96),
            stripeMat
          );
          trStripe.position.set(0, 1.12, 0);
          trailerGroup.add(trStripe);

          // Nose-mounted Refrigeration Unit for Reefer Trailers
          if (trailerStyle === 'REFRIGERATED_TRAILER') {
            const reeferUnit = new THREE.Mesh(
              new THREE.BoxGeometry(0.75, 0.55, 0.28),
              this.materials.accentSteel
            );
            reeferUnit.position.set(0, 1.35, trLen * 0.5 + 0.14);
            trailerGroup.add(reeferUnit);
          }
        }

        // Tandem Trailer Axles & Rear Brake Lights
        addWheelPair(trailerGroup, -0.85, 0.54, 0.25);
        addWheelPair(trailerGroup, -1.35, 0.54, 0.25);

        brakeLightMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.96, 0.14, 0.06),
          this.materials.brakeLightEmissive
        );
        brakeLightMesh.position.set(0, 0.52, -trLen * 0.5 - 0.03);
        trailerGroup.add(brakeLightMesh);
        }
      }
    } else if (modal === 'RAIL') {
      // =======================================================================
      // GTE-L1 HEAVY DIESEL-ELECTRIC LOCOMOTIVE + 4 VARIED FREIGHT WAGONS
      // Matching `/public/assets/aistudio/image_797e30ca.png`:
      // 1. GTE-L1 Locomotive (Red 0xe13b31 with Yellow 0xfbbf24 & Royal Blue 0x1d4ed8 stripes + "GTE" side logo)
      // 2. Boxcar-T1 (Teal 0x14b8a6 ribbed boxcar with sliding center door)
      // 3. Tankcar-O1 (Orange 0xf97316 cylindrical tank car with ladder & top valve dome)
      // 4. Tankcar-W1 (White 0xf8fafc cylindrical tank car with red-orange horizontal stripe)
      // 5. Flatbed-C1 (Amber 0xf59e0b flatbed carrying colorful stacked intermodal containers)
      // =======================================================================
      const gteRedMat = new THREE.MeshStandardMaterial({
        color: 0xe13b31,
        roughness: 0.34,
        metalness: 0.28,
      });
      const gteYellowStripeMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.32,
        metalness: 0.22,
      });
      const gteBlueStripeMat = new THREE.MeshStandardMaterial({
        color: 0x1d4ed8,
        roughness: 0.36,
        metalness: 0.26,
      });
      const darkBogieMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.6,
        metalness: 0.42,
      });

      // Procedural "GTE" side logo texture for GTE-L1 Locomotive
      let gteLocoSideMat: THREE.Material = gteRedMat;
      if (typeof document !== 'undefined') {
        const lCanvas = document.createElement('canvas');
        lCanvas.width = 512;
        lCanvas.height = 128;
        const ctx = lCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#e13b31';
          ctx.fillRect(0, 0, 512, 128);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(0, 58, 512, 16);
          ctx.fillStyle = '#e13b31';
          ctx.fillRect(0, 74, 512, 12);
          ctx.fillStyle = '#1d4ed8';
          ctx.fillRect(0, 86, 512, 22);
          ctx.font = '900 52px Inter, Arial, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText('GTE', 195, 64);
          const lTex = new THREE.CanvasTexture(lCanvas);
          lTex.colorSpace = THREE.SRGBColorSpace;
          gteLocoSideMat = new THREE.MeshStandardMaterial({
            map: lTex,
            roughness: 0.34,
            metalness: 0.25,
          });
        }
      }

      // 1. GTE-L1 Locomotive Heavy Steel Underframe Deck, Pilot Plows & Yellow Handrails
      const locoChassis = new THREE.Mesh(
        new THREE.BoxGeometry(1.42, 0.26, 4.8),
        darkBogieMat
      );
      locoChassis.position.set(0, 0.42, 0);
      tractorGroup.add(locoChassis);

      for (const zPlow of [-2.42, 2.42]) {
        const plow = new THREE.Mesh(
          new THREE.BoxGeometry(1.36, 0.28, 0.16),
          darkBogieMat
        );
        plow.position.set(0, 0.31, zPlow);
        tractorGroup.add(plow);
      }

      // Long Rear Engine Hood + Side GTE Logo Panels + Yellow/Red/Blue Livery Stripes
      const engineHood = new THREE.Mesh(
        new THREE.BoxGeometry(1.24, 1.34, 3.25),
        gteRedMat
      );
      engineHood.position.set(0, 1.22, -0.45);
      engineHood.castShadow = true;
      tractorGroup.add(engineHood);

      for (const side of [-1, 1]) {
        const sidePanel = new THREE.Mesh(
          new THREE.PlaneGeometry(3.18, 1.26),
          gteLocoSideMat
        );
        sidePanel.position.set(side * 0.625, 1.22, -0.45);
        sidePanel.rotation.y = side === 1 ? Math.PI * 0.5 : -Math.PI * 0.5;
        tractorGroup.add(sidePanel);

        // Full-length yellow safety handrails along side walkways
        const handrailTop = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.035, 4.4),
          gteYellowStripeMat
        );
        handrailTop.position.set(side * 0.68, 0.92, 0);
        tractorGroup.add(handrailTop);
      }

      // Elevated Operator Cab + Short Front Nose with V-Chevron Stripe
      const locoCab = new THREE.Mesh(
        new THREE.BoxGeometry(1.36, 1.5, 1.15),
        gteRedMat
      );
      locoCab.position.set(0, 1.3, 1.18);
      locoCab.castShadow = true;
      tractorGroup.add(locoCab);

      const shortNose = new THREE.Mesh(
        new THREE.BoxGeometry(1.28, 0.96, 0.66),
        gteRedMat
      );
      shortNose.position.set(0, 1.02, 1.98);
      shortNose.castShadow = true;
      tractorGroup.add(shortNose);

      // Horizontal Yellow & Blue Stripes wrapping around Cab & Nose
      const noseYellowBand = new THREE.Mesh(
        new THREE.BoxGeometry(1.38, 0.14, 1.86),
        gteYellowStripeMat
      );
      noseYellowBand.position.set(0, 0.88, 1.42);
      tractorGroup.add(noseYellowBand);

      const noseBlueBand = new THREE.Mesh(
        new THREE.BoxGeometry(1.38, 0.16, 1.86),
        gteBlueStripeMat
      );
      noseBlueBand.position.set(0, 0.68, 1.42);
      tractorGroup.add(noseBlueBand);

      // Cab Windscreens & Side Windows
      const locoWindscreen = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.4, 0.08),
        this.materials.cityGlass
      );
      locoWindscreen.position.set(0, 1.68, 1.74);
      tractorGroup.add(locoWindscreen);

      // 3 Rooftop Circular Radiator Cooling Fans + Dynamic Brake Blister
      for (const zFan of [-1.45, -0.65, 0.15]) {
        const fanRim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.36, 0.12, 14),
          darkBogieMat
        );
        fanRim.position.set(0, 1.94, zFan);
        tractorGroup.add(fanRim);
      }

      // Twin High-Intensity Locomotive Headlights
      for (const lx of [-0.26, 0.26]) {
        const hl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.085, 0.085, 0.08, 10),
          this.materials.headlightEmissive
        );
        hl.rotation.x = Math.PI * 0.5;
        hl.position.set(lx, 1.36, 2.31);
        tractorGroup.add(hl);
      }

      // Dual 3-Axle Heavy Railway Bogies (6 rotating wheelsets)
      for (const zAxle of [1.7, 1.2, 0.7, -0.7, -1.2, -1.7]) {
        addWheelPair(tractorGroup, zAxle, 0.48, 0.23);
      }

      // =======================================================================
      // 4 COUPLED FREIGHT WAGONS: Boxcar-T1, Tankcar-O1, Tankcar-W1, Flatbed-C1
      // =======================================================================
      const wagonSpecs: Array<{
        code: 'Boxcar-T1' | 'Tankcar-O1' | 'Tankcar-W1' | 'Flatbed-C1';
        zCenter: number;
      }> = [
        { code: 'Boxcar-T1', zCenter: -5.0 },
        { code: 'Tankcar-O1', zCenter: -9.8 },
        { code: 'Tankcar-W1', zCenter: -14.6 },
        { code: 'Flatbed-C1', zCenter: -19.4 },
      ];

      for (const wSpec of wagonSpecs) {
        const zWagon = wSpec.zCenter;

        // Heavy Steel Knuckle Coupler Bar
        const coupler = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.14, 0.85),
          darkBogieMat
        );
        coupler.position.set(0, 0.42, zWagon + 2.4);
        tractorGroup.add(coupler);

        // Wagon Underframe Sill & Dual 2-Axle Bogies
        const underframe = new THREE.Mesh(
          new THREE.BoxGeometry(1.32, 0.18, 4.15),
          darkBogieMat
        );
        underframe.position.set(0, 0.42, zWagon);
        tractorGroup.add(underframe);

        addWheelPair(tractorGroup, zWagon + 1.45, 0.46, 0.22);
        addWheelPair(tractorGroup, zWagon + 0.98, 0.46, 0.22);
        addWheelPair(tractorGroup, zWagon - 0.98, 0.46, 0.22);
        addWheelPair(tractorGroup, zWagon - 1.45, 0.46, 0.22);

        if (wSpec.code === 'Boxcar-T1') {
          // 1. Boxcar-T1: Teal (0x14b8a6) ribbed boxcar with sliding center door
          const tealBoxMat = new THREE.MeshStandardMaterial({
            color: 0x14b8a6,
            roughness: 0.38,
            metalness: 0.24,
          });
          const tealDoorMat = new THREE.MeshStandardMaterial({
            color: 0x0d9488,
            roughness: 0.34,
            metalness: 0.3,
          });
          const boxBody = new THREE.Mesh(
            new THREE.BoxGeometry(1.32, 1.36, 3.92),
            tealBoxMat
          );
          boxBody.position.set(0, 1.18, zWagon);
          boxBody.castShadow = true;
          tractorGroup.add(boxBody);

          // Sliding center cargo door on both sides
          const slidingDoor = new THREE.Mesh(
            new THREE.BoxGeometry(1.38, 1.24, 1.12),
            tealDoorMat
          );
          slidingDoor.position.set(0, 1.18, zWagon);
          tractorGroup.add(slidingDoor);

          // Exterior vertical structural ribs
          for (const zRib of [-1.6, -1.15, -0.75, 0.75, 1.15, 1.6]) {
            const rib = new THREE.Mesh(
              new THREE.BoxGeometry(1.35, 1.32, 0.05),
              tealDoorMat
            );
            rib.position.set(0, 1.18, zWagon + zRib);
            tractorGroup.add(rib);
          }
        } else if (wSpec.code === 'Tankcar-O1' || wSpec.code === 'Tankcar-W1') {
          // 2 & 3. Tankcar-O1 (Orange 0xf97316) & Tankcar-W1 (White 0xf8fafc with Red-Orange stripe)
          const isWhiteTank = wSpec.code === 'Tankcar-W1';
          const tankMat = new THREE.MeshStandardMaterial({
            color: isWhiteTank ? 0xf8fafc : 0xf97316,
            roughness: 0.28,
            metalness: 0.26,
          });
          const tankCyl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.64, 0.64, 3.6, 18),
            tankMat
          );
          tankCyl.rotation.x = Math.PI * 0.5;
          tankCyl.position.set(0, 1.16, zWagon);
          tankCyl.castShadow = true;
          tractorGroup.add(tankCyl);

          // Hemispherical end caps
          for (const endDir of [-1, 1]) {
            const cap = new THREE.Mesh(
              new THREE.SphereGeometry(0.635, 16, 12),
              tankMat
            );
            cap.scale.set(1, 1, 0.42);
            cap.position.set(0, 1.16, zWagon + endDir * 1.8);
            tractorGroup.add(cap);
          }

          if (isWhiteTank) {
            // Red-orange horizontal stripe along Tankcar-W1
            const redStripe = new THREE.Mesh(
              new THREE.BoxGeometry(1.3, 0.18, 3.62),
              new THREE.MeshStandardMaterial({
                color: 0xef4444,
                roughness: 0.34,
                metalness: 0.2,
              })
            );
            redStripe.position.set(0, 1.12, zWagon);
            tractorGroup.add(redStripe);
          }

          // Top manway valve dome & central vertical access ladder
          const dome = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.26, 0.22, 12),
            darkBogieMat
          );
          dome.position.set(0, 1.86, zWagon);
          tractorGroup.add(dome);

          const ladder = new THREE.Mesh(
            new THREE.BoxGeometry(1.36, 1.15, 0.18),
            darkBogieMat
          );
          ladder.position.set(0, 1.16, zWagon);
          tractorGroup.add(ladder);
        } else if (wSpec.code === 'Flatbed-C1') {
          // 4. Flatbed-C1: Golden-Amber (0xf59e0b) flatbed carrying stacked colorful containers
          const flatbedDeck = new THREE.Mesh(
            new THREE.BoxGeometry(1.38, 0.22, 4.08),
            gteYellowStripeMat
          );
          flatbedDeck.position.set(0, 0.54, zWagon);
          tractorGroup.add(flatbedDeck);

          // 3x2 Stacked Intermodal Containers (Blue, Green, Red, Teal, Yellow) matching reference sheet
          const stackColors = [
            [0xf59e0b, 0x2563eb], // Front stack: Amber bottom, Royal Blue top
            [0x0d9488, 0x16a34a], // Middle stack: Teal bottom, Green top
            [0xfbbf24, 0xdc2626], // Rear stack: Yellow bottom, Red top
          ];
          for (let colIdx = 0; colIdx < 3; colIdx++) {
            const zSub = zWagon + (1 - colIdx) * 1.26;
            for (let tier = 0; tier < 2; tier++) {
              const cMat = new THREE.MeshStandardMaterial({
                color: stackColors[colIdx][tier],
                roughness: 0.38,
                metalness: 0.24,
              });
              const cBox = new THREE.Mesh(
                new THREE.BoxGeometry(1.24, 0.62, 1.22),
                cMat
              );
              cBox.position.set(0, 0.96 + tier * 0.63, zSub);
              cBox.castShadow = true;
              tractorGroup.add(cBox);
            }
          }
        }
      }
    } else if (modal === 'WATER') {
      // =======================================================================
      // MARITIME CARGO VESSELS (Container Ship, Bulk Carrier & Harbour Tug)
      // =======================================================================
      const isTug = catalogueId === 'veh-water-harbour-tug';
      const isBulk = catalogueId === 'veh-water-bulk-carrier';
      const hullLen = isTug ? 5.6 : 9.4;
      const hullW = isTug ? 2.1 : 2.55;

      // Lower Waterline Anti-Fouling Red Hull + Main Freeboard Hull
      const lowerHull = new THREE.Mesh(
        new THREE.BoxGeometry(hullW * 0.94, 0.45, hullLen * 0.96),
        this.materials.gateRed
      );
      lowerHull.position.set(0, 0.24, 0);
      tractorGroup.add(lowerHull);

      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(hullW, 0.95, hullLen * 0.86),
        cabMat
      );
      hull.position.set(0, 0.72, -0.2);
      hull.castShadow = true;
      tractorGroup.add(hull);

      // Sculpted Tapered Bow Forecastle (+Z)
      const bow = new THREE.Mesh(
        new THREE.ConeGeometry(hullW * 0.68, 2.4, 4),
        cabMat
      );
      bow.rotation.x = Math.PI * 0.5;
      bow.rotation.z = Math.PI * 0.25;
      bow.scale.set(1, 1, 0.65);
      bow.position.set(0, 0.78, hullLen * 0.43 + 0.55);
      bow.castShadow = true;
      tractorGroup.add(bow);

      // Main Weather Deck
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(hullW * 0.92, 0.14, hullLen * 0.84),
        this.materials.accentSteel
      );
      deck.position.set(0, 1.22, -0.2);
      tractorGroup.add(deck);

      // Aft Bridge Superstructure, Navigation Wings, Funnel & Radar Mast
      const bridgeZ = -hullLen * 0.32;
      const bridgeTower = new THREE.Mesh(
        new THREE.BoxGeometry(hullW * 0.82, isTug ? 1.85 : 2.35, 1.85),
        this.materials.cityTowerBody
      );
      bridgeTower.position.set(0, 1.25 + (isTug ? 0.92 : 1.17), bridgeZ);
      bridgeTower.castShadow = true;
      tractorGroup.add(bridgeTower);

      const bridgeWindows = new THREE.Mesh(
        new THREE.BoxGeometry(hullW * 0.92, 0.36, 0.95),
        this.materials.cityGlass
      );
      bridgeWindows.position.set(0, isTug ? 2.65 : 3.22, bridgeZ + 0.35);
      tractorGroup.add(bridgeWindows);

      const funnel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.36, 1.25, 10),
        stripeMat
      );
      funnel.position.set(0, isTug ? 3.1 : 3.75, bridgeZ - 0.35);
      tractorGroup.add(funnel);

      if (isBulk) {
        // Dry Bulk Carrier: 3 Red Coaming Cargo Hatch Covers + Deck Cranes
        for (let hIdx = -1; hIdx <= 1; hIdx++) {
          const hatch = new THREE.Mesh(
            new THREE.BoxGeometry(hullW * 0.72, 0.42, 1.65),
            this.materials.gateRed
          );
          hatch.position.set(0, 1.44, 0.65 + hIdx * 1.95);
          tractorGroup.add(hatch);
        }
      } else if (!isTug) {
        // Container Ship: Multi-tier ISO Container Bays on Deck
        for (let cStack = -1; cStack <= 1; cStack++) {
          for (let tier = 0; tier < 2; tier++) {
            const cont = new THREE.Mesh(
              new THREE.BoxGeometry(hullW * 0.78, 0.74, 1.82),
              (cStack + tier) % 2 === 0 ? this.materials.safetyYellow : stripeMat
            );
            cont.position.set(
              0,
              1.62 + tier * 0.76,
              0.65 + cStack * 1.98
            );
            cont.castShadow = true;
            tractorGroup.add(cont);
          }
        }
      }

      // V-Shaped White Foam Bow Wake & Stern Prop Wash
      const wake = new THREE.Mesh(
        new THREE.PlaneGeometry(hullW + 0.9, hullLen + 2.4),
        this.materials.whiteLine
      );
      wake.rotation.x = -Math.PI * 0.5;
      wake.position.set(0, 0.02, -0.9);
      tractorGroup.add(wake);
    } else if (modal === 'AIR') {
      // Regional / Heavy Commercial & Cargo Aircraft scaled by 1.62x to match the Runway & 4 Boarding Gates
      tractorGroup.scale.setScalar(1.62);
      const whiteWingMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.24,
        metalness: 0.18,
      });

      // Soft ground contact shadow beneath aircraft (hidden automatically when climbing/airborne)
      contactShadowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(7.6, 8.2),
        this.materials.contactShadow
      );
      contactShadowMesh.rotation.x = -Math.PI * 0.5;
      contactShadowMesh.position.set(0, 0.02, 0.2);
      contactShadowMesh.visible = getGraphicsQualitySpec(this.graphicsQuality).enableContactShadows;
      this.contactShadowMeshes.push(contactShadowMesh);
      tractorGroup.add(contactShadowMesh);

      const fuselage = new THREE.Mesh(
        new THREE.CylinderGeometry(0.58, 0.56, 6.4, 16),
        this.materials.aircraftFuselageCargo
      );
      fuselage.rotation.x = Math.PI * 0.5;
      fuselage.position.set(0, 0.86, 0);
      fuselage.castShadow = true;
      tractorGroup.add(fuselage);

      // Sculpted Nose Cone at +Z (Forward direction of travel!) & Tail Cone at -Z
      const noseCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.56, 1.25, 16),
        whiteWingMat
      );
      noseCone.rotation.x = Math.PI * 0.5;
      noseCone.position.set(0, 0.86, 3.8);
      tractorGroup.add(noseCone);

      const tailCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.56, 1.15, 14),
        this.materials.aircraftLiveryBlue
      );
      tailCone.rotation.x = -Math.PI * 0.5;
      tailCone.position.set(0, 0.9, -3.75);
      tractorGroup.add(tailCone);

      // Cockpit Windshield at +Z Nose
      const cockpitGlass = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 0.28, 0.65),
        this.materials.cityGlass
      );
      cockpitGlass.position.set(0, 1.12, 3.15);
      tractorGroup.add(cockpitGlass);

      // Blue Lower Belly & Swept Wings + Upturned Wingtip Winglets
      const belly = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.24, 5.8),
        this.materials.aircraftLiveryBlue
      );
      belly.position.set(0, 0.54, 0);
      tractorGroup.add(belly);

      const wings = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 0.14, 1.32),
        whiteWingMat
      );
      wings.position.set(0, 0.9, 0.25);
      wings.castShadow = true;
      tractorGroup.add(wings);

      for (const side of [-1, 1]) {
        const winglet = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.62, 0.55),
          this.materials.aircraftLiveryBlue
        );
        winglet.position.set(side * 3.4, 1.18, 0.15);
        winglet.rotation.z = -side * 0.22;
        tractorGroup.add(winglet);
      }

      // Twin Underwing Turbofan Engines (Pylon + Cowling + Silver Intake Lip + Dark Fan Face)
      for (const side of [-1, 1]) {
        const pylon = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.26, 0.75),
          whiteWingMat
        );
        pylon.position.set(side * 1.75, 0.78, 0.45);
        fineDetailGroup.add(pylon);

        const eng = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.25, 1.18, 14),
          whiteWingMat
        );
        eng.rotation.x = Math.PI * 0.5;
        eng.position.set(side * 1.75, 0.64, 0.48);
        tractorGroup.add(eng);

        const intakeRing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.285, 0.285, 0.14, 14),
          this.materials.wheelHubSteel
        );
        intakeRing.rotation.x = Math.PI * 0.5;
        intakeRing.position.set(side * 1.75, 0.64, 1.02);
        fineDetailGroup.add(intakeRing);

        const fanFace = new THREE.Mesh(
          new THREE.CylinderGeometry(0.23, 0.23, 0.06, 12),
          this.materials.tyreRubber
        );
        fanFace.rotation.x = Math.PI * 0.5;
        fanFace.position.set(side * 1.75, 0.64, 1.06);
        fineDetailGroup.add(fanFace);
      }

      // Vertical Tail Fin with White Bird Emblem & Horizontal Stabilizer at -Z (Rear)
      const tailFin = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 1.72, 1.32),
        this.materials.aircraftTailFinEmblem
      );
      tailFin.position.set(0, 1.68, -2.65);
      tractorGroup.add(tailFin);

      const hStab = new THREE.Mesh(
        new THREE.BoxGeometry(2.45, 0.1, 0.75),
        whiteWingMat
      );
      hStab.position.set(0, 1.04, -2.75);
      tractorGroup.add(hStab);

      // Nose & Main Landing Gear Wheels touching y = 0 in local space and rotating with wheelRotationRad!
      addWheelPair(tractorGroup, 2.35, 0.16, 0.16);
      addWheelPair(tractorGroup, -0.45, 0.85, 0.22);
    }

    // Keep vehicle roofline clean and realistic (no floating arcade spheres above cabs)

    return {
      root,
      tractorGroup,
      trailerGroup,
      wheels,
      brakeLightMesh,
      contactShadowMesh,
      fineDetailGroup,
    };
  }

  /**
   * Synchronizes 3D vehicle positions, headings, wheel rotation angles, articulated trailer
   * transforms, Warehouse 1 roll-up loading doors, 2-10 forklifts, and distance-based LOD on every animation frame.
   */
  public updateVehiclesAnimation(): void {
    const qSpec = getGraphicsQualitySpec(this.graphicsQuality);
    const camPos = this.camera.position;

    // 1. Owned Fleet Vehicles
    for (const ov of this.world.economy.getOwnedVehicles()) {
      const rig = this.vehicleRigsMap.get(ov.id);
      if (!rig) continue;

      if (ov.state === 'OFFSCREEN_SIMULATION') {
        rig.root.visible = false;
        continue;
      }
      rig.root.visible = true;

      rig.tractorGroup.position.set(ov.worldX, ov.worldY, ov.worldZ);
      rig.tractorGroup.rotation.y = ov.headingYaw;

      if (rig.fineDetailGroup) {
        const dist = Math.hypot(ov.worldX - camPos.x, ov.worldZ - camPos.z);
        const tier = computeLodTierForDistance(dist, this.graphicsQuality);
        rig.fineDetailGroup.visible = qSpec.enableFineVehicleDetails && tier === 'NEAR';
      }

      if (rig.trailerGroup) {
        rig.trailerGroup.position.set(
          ov.trailerWorldX,
          ov.worldY,
          ov.trailerWorldZ
        );
        rig.trailerGroup.rotation.y = ov.trailerYaw;
      }

      for (const wObj of rig.wheels) {
        wObj.rotation.x = ov.wheelRotationRad;
      }
    }

    // 2. Ambient Motorway, Roundabout, Rail, Ship & Air Vehicles
    for (const av of this.world.economy.getAmbientVehicles()) {
      const rig = this.vehicleRigsMap.get(av.id);
      if (!rig) continue;

      rig.tractorGroup.position.set(av.worldX, av.worldY, av.worldZ);
      rig.tractorGroup.rotation.y = av.headingYaw;

      if (rig.fineDetailGroup) {
        const dist = Math.hypot(av.worldX - camPos.x, av.worldZ - camPos.z);
        const tier = computeLodTierForDistance(dist, this.graphicsQuality);
        rig.fineDetailGroup.visible = qSpec.enableFineVehicleDetails && tier === 'NEAR';
      }

      if (rig.trailerGroup) {
        rig.trailerGroup.position.set(
          av.trailerWorldX,
          av.worldY,
          av.trailerWorldZ
        );
        rig.trailerGroup.rotation.y = av.trailerYaw;
      }

      for (const wObj of rig.wheels) {
        wObj.rotation.x = av.wheelRotationRad;
      }
    }

    // 3. Warehouse 1 Loading Doors & Demand-Driven Forklifts (2..10)
    const doorHeight = 2.05;
    for (const wh of this.world.economy.getAllWarehouses()) {
      for (const door of wh.doors) {
        const shutter = this.warehouseDoorShuttersMap.get(door.id);
        if (shutter) {
          const openRatio = door.openRatio ?? 0;
          const closedScaleY = Math.max(0.08, 1 - openRatio * 0.88);
          shutter.scale.y = closedScaleY;
          shutter.position.y = 0.18 + doorHeight * (1 - closedScaleY * 0.5);
        }
      }

      for (const fl of wh.forklifts) {
        let flRig = this.forkliftRigsMap.get(fl.id);
        if (!flRig) {
          flRig = this.createForkliftVisualRig(fl.id);
          this.forkliftRigsMap.set(fl.id, flRig);
          this.vehiclesGroup.add(flRig.root);
        }
        flRig.root.visible = true;
        flRig.root.position.set(
          fl.worldPos.wx,
          fl.worldPos.wy,
          fl.worldPos.wz
        );
        flRig.root.rotation.y = fl.headingYaw;
        flRig.forkCarriageGroup.position.y = 0.16 + fl.forkHeightRatio * 0.82;

        const isCarrying = fl.carryingTons > 0 && fl.carryingCategory !== null;
        flRig.cargoGroup.visible = isCarrying;
        if (isCarrying) {
          const mat = flRig.cargoCrateMesh.material as THREE.MeshStandardMaterial;
          if (fl.carryingCategory === 'FOOD') {
            mat.color.setHex(0x4ade80);
          } else if (fl.carryingCategory === 'INDUSTRIAL') {
            mat.color.setHex(0x38bdf8);
          } else {
            mat.color.setHex(0xc59b6d);
          }
        }

        for (const wObj of flRig.wheels) {
          wObj.rotation.x = fl.wheelRotationRad;
        }
      }
    }

    // 4. Airport Player Cargo Aircraft Pitch & Dynamic Rig Creation + External NPC Supply Aircraft + 6 GSE Categories
    //    Strict Zero-Spawn & Anti-Duplication Rule: Only purchased player aircraft in `getPlayerCargoAircraft()` are rendered.
    const airportOwned = this.world.economy.getAirport().owned;
    const activePlayerAircraftIds = new Set<string>();
    for (const ac of this.world.economy.getPlayerCargoAircraft()) {
      activePlayerAircraftIds.add(ac.id);
      let rig = this.vehicleRigsMap.get(ac.id);
      if (!rig) {
        rig = this.createVehicleVisualRig(
          ac.id,
          ac.catalogueId,
          ac.liveryId,
          true
        );
        this.vehicleRigsMap.set(ac.id, rig);
        this.vehiclesGroup.add(rig.root);
      }
      rig.root.visible = airportOwned && ac.flightStage !== 'OFFSCREEN_FLIGHT';
      rig.tractorGroup.position.set(ac.worldX, ac.worldY, ac.worldZ);
      rig.tractorGroup.rotation.set(-ac.pitchRad, ac.headingYaw, ac.rollRad);
      if (rig.contactShadowMesh) {
        rig.contactShadowMesh.visible =
          qSpec.enableContactShadows && ac.worldY <= 1.85;
      }
      for (const wObj of rig.wheels) {
        wObj.rotation.x = ac.wheelRotationRad;
      }
    }

    const activeNpcIds = new Set<string>();
    const allExternalNpcAircraft = [
      ...this.world.economy.getNpcSupplyAircraft(),
      ...this.world.economy.getGuestAircraft(),
    ];
    for (const npc of allExternalNpcAircraft) {
      activeNpcIds.add(npc.id);
      let rig = this.vehicleRigsMap.get(npc.id);
      if (!rig) {
        rig = this.createVehicleVisualRig(
          npc.id,
          npc.catalogueId,
          npc.liveryId,
          false
        );
        this.vehicleRigsMap.set(npc.id, rig);
        this.vehiclesGroup.add(rig.root);
      }
      rig.root.visible =
        airportOwned &&
        npc.flightStage !== 'OFFSCREEN_FLIGHT' &&
        npc.flightStage !== 'COMPLETED';
      rig.tractorGroup.position.set(npc.worldX, npc.worldY, npc.worldZ);
      rig.tractorGroup.rotation.set(-npc.pitchRad, npc.headingYaw, npc.rollRad);
      if (rig.contactShadowMesh) {
        rig.contactShadowMesh.visible =
          qSpec.enableContactShadows && npc.worldY <= 1.85;
      }
      for (const wObj of rig.wheels) {
        wObj.rotation.x = npc.wheelRotationRad;
      }
    }

    // Hide any completed NPC, Guest, or unowned aircraft rigs
    const ownedVehicleIds = new Set(
      this.world.economy.getOwnedVehicles().map((v) => v.id)
    );
    for (const [id, rig] of this.vehicleRigsMap.entries()) {
      if (
        (id.startsWith('npc-supply-aircraft-') ||
          id.startsWith('guest-aircraft-')) &&
        !activeNpcIds.has(id)
      ) {
        rig.root.visible = false;
      } else if (
        id.startsWith('veh-owned-') &&
        !ownedVehicleIds.has(id) &&
        !activePlayerAircraftIds.has(id)
      ) {
        rig.root.visible = false;
      }
    }

    // 5. Airport Ground-Support Equipment (GSE) Fleet (Prompt 4)
    for (const gse of this.world.economy.getAirportGseVehicles()) {
      let gseGroup = this.gseRigsMap.get(gse.id);
      if (!gseGroup) {
        gseGroup = this.createGseVisualGroup(gse.id, gse.category);
        this.gseRigsMap.set(gse.id, gseGroup);
        this.vehiclesGroup.add(gseGroup);
      }
      gseGroup.visible = true;
      gseGroup.position.set(gse.worldX, gse.worldY, gse.worldZ);
      gseGroup.rotation.y = gse.headingYaw;
    }

    // 6. Dedicated Landside Cargo Truck Yard Semi-Trailers (TRUCK_YARD_ENTRY -> TRUCK_QUEUE_BAY -> CARGO_LOADING_DOCK -> TRUCK_YARD_EXIT)
    const activeLoadingDocks = new Set<number>();
    for (const yt of this.world.economy.getAirportYardTrucks()) {
      let ytGroup = this.yardTruckRigsMap.get(yt.id);
      if (!ytGroup) {
        ytGroup = this.createYardSemiTruckVisualGroup(
          yt.id,
          yt.liveryColorHex,
          yt.trailerColorHex
        );
        this.yardTruckRigsMap.set(yt.id, ytGroup);
        this.vehiclesGroup.add(ytGroup);
      }
      ytGroup.visible = true;
      ytGroup.position.set(yt.worldX, yt.worldY, yt.worldZ);
      ytGroup.rotation.y = yt.headingYaw;
      if (yt.stage === 'LOADING_CARGO') {
        activeLoadingDocks.add(yt.dockIndex);
      }
    }

    // 7. Sync Loading-Bay Cargo Pallets at the Cargo Loading Docks with Docked Trucks
    for (const pallet of this.yardDockPalletMeshes) {
      const baseZ = (pallet.userData?.baseZ as number) ?? pallet.position.z;
      const dIdx = (pallet.userData?.dockIndex as number) ?? 0;
      if ( activeLoadingDocks.has(dIdx)) {
        pallet.visible = true;
        const slideOffset = Math.sin(this.airportAnimTime * 3.2) * 0.24 + 0.24;
        pallet.position.z = baseZ - slideOffset;
      } else {
        pallet.visible = false;
        pallet.position.z = baseZ;
      }
    }

    // 8. Railway Freight Hub Rolling Stock (GTE-L1 Locomotive + 4 Wagons), GTE Model 360 Forklifts & Staging Trucks
    const railHub = this.world.railways.getFreightHubState();
    for (const train of railHub.trains) {
      let rig = this.vehicleRigsMap.get(train.id);
      if (!rig) {
        rig = this.createVehicleVisualRig(
          train.id,
          'veh-rail-diesel-freight',
          'livery-amber-express',
          true
        );
        this.vehicleRigsMap.set(train.id, rig);
        this.vehiclesGroup.add(rig.root);
      }
      rig.root.visible = true;
      rig.tractorGroup.position.set(train.worldX, train.worldY, train.worldZ);
      rig.tractorGroup.rotation.y = train.headingYaw;
      for (const wObj of rig.wheels) {
        wObj.rotation.x = train.wheelRotationRad;
      }
    }

    for (const rfl of railHub.forklifts) {
      let flRig = this.forkliftRigsMap.get(rfl.id);
      if (!flRig) {
        flRig = this.createForkliftVisualRig(rfl.id);
        this.forkliftRigsMap.set(rfl.id, flRig);
        this.vehiclesGroup.add(flRig.root);
      }
      flRig.root.visible = true;
      flRig.root.position.set(rfl.worldX, rfl.worldY, rfl.worldZ);
      flRig.root.rotation.y = rfl.headingYaw;
      flRig.forkCarriageGroup.position.y = 0.16 + rfl.forkHeightRatio * 0.82;
      flRig.cargoGroup.visible = rfl.carryingCargo;
      if (rfl.carryingCargo) {
        const mat = flRig.cargoCrateMesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(rfl.carryingColorHex || 0xf59e0b);
      }
      for (const wObj of flRig.wheels) {
        wObj.rotation.x = rfl.wheelRotationRad;
      }
    }

    for (const stTruck of railHub.stagingTrucks) {
      let stGroup = this.yardTruckRigsMap.get(stTruck.id);
      if (!stGroup) {
        stGroup = this.createYardSemiTruckVisualGroup(
          stTruck.id,
          0x1d4ed8,
          0xe2e8f0
        );
        this.yardTruckRigsMap.set(stTruck.id, stGroup);
        this.vehiclesGroup.add(stGroup);
      }
      stGroup.visible = true;
      stGroup.position.set(stTruck.worldX, stTruck.worldY, stTruck.worldZ);
      stGroup.rotation.y = stTruck.headingYaw;
    }
  }

  private createYardSemiTruckVisualGroup(
    id: string,
    cabColorHex: number,
    trailerColorHex: number
  ): THREE.Group {
    const grp = new THREE.Group();
    grp.name = `airport-yard-truck-${id}`;

    const trailerBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 1.22, 2.55),
      new THREE.MeshStandardMaterial({
        color: trailerColorHex,
        roughness: 0.38,
        metalness: 0.25,
      })
    );
    trailerBox.position.set(0, 0.82, -0.55);
    trailerBox.castShadow = true;
    grp.add(trailerBox);

    const cabBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.05, 1.02),
      new THREE.MeshStandardMaterial({
        color: cabColorHex,
        roughness: 0.32,
        metalness: 0.35,
      })
    );
    cabBox.position.set(0, 0.72, 1.32);
    cabBox.castShadow = true;
    grp.add(cabBox);

    for (const zAxle of [-1.35, -0.15, 1.35]) {
      for (const xWheel of [-0.5, 0.5]) {
        const wMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.2, 0.16, 10),
          this.materials.tyreRubber
        );
        wMesh.rotation.z = Math.PI * 0.5;
        wMesh.position.set(xWheel, 0.2, zAxle);
        grp.add(wMesh);
      }
    }

    return grp;
  }

  /**
   * Builds detailed multi-part 3D Ground Support Equipment (GSE) rigs matching the
   * "Ground Support Equipment (GSE)" reference sheet:
   * - AIRCRAFT_TUG: Low-profile white/yellow pushback tractor with glazed cab, heavy bumpers & 4 wheels
   * - CARGO_LOADER: High-lift yellow scissor cargo loader with X-frame lift, elevated roller deck & ULD container
   * - FLATBED_CARGO_CART: Wheeled steel flatbed cart with side safety rails, tow bar & palletized boxes
   * - CARGO_DOLLY: Wheeled ULD dolly trailer with turntable frame, tow bar & brushed-aluminium ULD container
   * - FUEL_TANKER: Aviation refueler truck with white cab, windscreen, cylindrical white/yellow tank & 6 wheels
   * - FORKLIFT: Safety-yellow forklift with dark ROPS roll-cage, counterweight, mast rails & forks
   */
  private createGseVisualGroup(id: string, category: string): THREE.Group {
    const g = new THREE.Group();
    g.name = id;

    // Soft ground contact shadow beneath GSE unit
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 2.4),
      this.materials.contactShadow
    );
    shadow.rotation.x = -Math.PI * 0.5;
    shadow.position.set(0, 0.015, 0);
    shadow.visible = getGraphicsQualitySpec(this.graphicsQuality).enableContactShadows;
    this.contactShadowMeshes.push(shadow);
    g.add(shadow);

    const addGseWheels = (zOffsets: number[], halfW = 0.42, r = 0.16) => {
      for (const zOff of zOffsets) {
        for (const side of [-1, 1]) {
          const w = new THREE.Mesh(
            new THREE.CylinderGeometry(r, r, 0.14, 10),
            this.materials.tyreRubber
          );
          w.rotation.z = Math.PI * 0.5;
          w.position.set(side * halfW, r, zOff);
          g.add(w);
        }
      }
    };

    if (category === 'AIRCRAFT_TUG') {
      // Heavy low-profile white & yellow pushback tug
      addGseWheels([0.48, -0.48], 0.44, 0.18);
      const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.34, 1.55),
        this.materials.cityTowerBody
      );
      chassis.position.set(0, 0.28, 0);
      g.add(chassis);

      const yellowStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.12, 1.56),
        this.materials.safetyYellow
      );
      yellowStripe.position.set(0, 0.26, 0);
      g.add(yellowStripe);

      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 0.42, 0.68),
        this.materials.cityGlass
      );
      cab.position.set(0, 0.62, 0.22);
      g.add(cab);

      const cabRoof = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.06, 0.72),
        this.materials.cityTowerBody
      );
      cabRoof.position.set(0, 0.85, 0.22);
      g.add(cabRoof);

      const towBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.08, 0.65),
        this.materials.safetyYellow
      );
      towBar.position.set(0, 0.18, 1.05);
      g.add(towBar);
    } else if (category === 'CARGO_LOADER') {
      // High-lift scissor cargo loader with X-frame & raised ULD container
      addGseWheels([0.56, -0.56], 0.46, 0.16);
      const baseFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, 0.22, 1.75),
        this.materials.safetyYellow
      );
      baseFrame.position.set(0, 0.22, 0);
      g.add(baseFrame);

      const opCab = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.52, 0.48),
        this.materials.cityTowerBody
      );
      opCab.position.set(-0.28, 0.58, 0.62);
      g.add(opCab);

      // Scissor X-struts
      for (const side of [-0.36, 0.36]) {
        for (const tilt of [-0.45, 0.45]) {
          const strut = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.75, 0.08),
            this.materials.accentSteel
          );
          strut.position.set(side, 0.56, -0.08);
          strut.rotation.x = tilt;
          g.add(strut);
        }
      }

      // Elevated roller deck + ULD container
      const upperDeck = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.12, 1.45),
        this.materials.safetyYellow
      );
      upperDeck.position.set(0, 0.92, -0.08);
      g.add(upperDeck);

      const uld = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.62, 0.92),
        this.materials.brushedAluminiumUld
      );
      uld.position.set(0, 1.28, -0.12);
      g.add(uld);
    } else if (category === 'FUEL_TANKER') {
      // Aviation Jet-A1 Fuel Tanker Truck
      addGseWheels([0.78, -0.35, -0.82], 0.48, 0.2);
      const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, 0.2, 2.45),
        this.materials.accentSteel
      );
      chassis.position.set(0, 0.26, 0);
      g.add(chassis);

      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.78, 0.72),
        this.materials.cityTowerBody
      );
      cab.position.set(0, 0.68, 0.82);
      g.add(cab);

      const windscreen = new THREE.Mesh(
        new THREE.BoxGeometry(0.88, 0.32, 0.06),
        this.materials.cityGlass
      );
      windscreen.position.set(0, 0.82, 1.19);
      g.add(windscreen);

      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.46, 1.65, 14),
        this.materials.cityTowerBody
      );
      tank.rotation.x = Math.PI * 0.5;
      tank.position.set(0, 0.76, -0.32);
      g.add(tank);

      const tankBand = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.18, 1.58),
        this.materials.safetyYellow
      );
      tankBand.position.set(0, 0.76, -0.32);
      g.add(tankBand);
    } else if (category === 'FORKLIFT') {
      // Airport Ramp Forklift
      addGseWheels([0.28, -0.32], 0.34, 0.14);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.38, 0.92),
        this.materials.safetyYellow
      );
      body.position.set(0, 0.28, -0.05);
      g.add(body);

      const cage = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.48, 0.54),
        this.materials.tyreRubber
      );
      cage.position.set(0, 0.68, -0.08);
      g.add(cage);

      for (const mx of [-0.18, 0.18]) {
        const mast = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 1.05, 0.06),
          this.materials.accentSteel
        );
        mast.position.set(mx, 0.62, 0.44);
        g.add(mast);
      }
    } else if (category === 'FLATBED_CARGO_CART') {
      // Wheeled Flatbed Cargo Cart with safety rails & cargo crates
      addGseWheels([0.48, -0.48], 0.42, 0.14);
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.12, 1.6),
        this.materials.accentSteel
      );
      deck.position.set(0, 0.24, 0);
      g.add(deck);

      for (const zRail of [-0.76, 0.76]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.88, 0.36, 0.06),
          this.materials.safetyYellow
        );
        rail.position.set(0, 0.46, zRail);
        g.add(rail);
      }

      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 0.48, 0.95),
        new THREE.MeshStandardMaterial({ color: 0xc59b6d, roughness: 0.8 })
      );
      crate.position.set(0, 0.54, 0);
      g.add(crate);
    } else {
      // CARGO_DOLLY: Coupled ULD Dolly Train with Silver & Blue Containers
      addGseWheels([0.62, -0.62], 0.42, 0.14);
      const dollyFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.12, 2.15),
        this.materials.accentSteel
      );
      dollyFrame.position.set(0, 0.22, 0);
      g.add(dollyFrame);

      const uldFront = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.62, 0.88),
        this.materials.brushedAluminiumUld
      );
      uldFront.position.set(0, 0.58, 0.52);
      g.add(uldFront);

      const uldRear = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.62, 0.88),
        this.materials.craneTeal
      );
      uldRear.position.set(0, 0.58, -0.52);
      g.add(uldRear);

      const towBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.06, 0.48),
        this.materials.safetyYellow
      );
      towBar.position.set(0, 0.18, 1.28);
      g.add(towBar);
    }

    return g;
  }

  /**
   * Updates subtle debug overlays (Grid, Zones, Parcels) when toggled by the developer/player.
   * Hidden by default during normal gameplay.
   */
  public setDebugSettings(settings: Partial<DebugOverlaySettings>): void {
    this.debugSettings = { ...this.debugSettings, ...settings };
    this.rebuildDebugOverlays();
  }

  public getDebugSettings(): DebugOverlaySettings {
    return { ...this.debugSettings };
  }

  public rebuildDebugOverlays(): void {
    this.clearGroup(this.debugGroup);

    const minGx = this.world.config.coreMinGx ?? -80;
    const maxGx = this.world.config.coreMaxGx ?? 439;
    const minGz = this.world.config.coreMinGz ?? -80;
    const maxGz = this.world.config.coreMaxGz ?? 319;
    const w = maxGx - minGx + 1;
    const d = maxGz - minGz + 1;
    const cs = this.world.config.cellSize;
    const minWorldX = this.world.config.originX + minGx * cs;
    const minWorldZ = this.world.config.originZ + minGz * cs;

    if (this.debugSettings.showGrid) {
      const points: THREE.Vector3[] = [];
      const yGrid = 1.28;
      for (let lx = 0; lx <= w; lx += 2) {
        const x = minWorldX + lx * cs;
        points.push(
          new THREE.Vector3(x, yGrid, minWorldZ),
          new THREE.Vector3(x, yGrid, minWorldZ + d * cs)
        );
      }
      for (let lz = 0; lz <= d; lz += 2) {
        const z = minWorldZ + lz * cs;
        points.push(
          new THREE.Vector3(minWorldX, yGrid, z),
          new THREE.Vector3(minWorldX + w * cs, yGrid, z)
        );
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.16,
      });
      this.debugGroup.add(new THREE.LineSegments(lineGeo, lineMat));
    }

    if (this.debugSettings.showZones) {
      for (const dist of this.world.districts.getDistricts()) {
        const pMin = this.world.grid.gridToWorld(dist.minGx, dist.minGz);
        const pMax = this.world.grid.gridToWorld(dist.maxGx, dist.maxGz);
        const bw = Math.abs(pMax.x - pMin.x) + cs;
        const bd = Math.abs(pMax.z - pMin.z) + cs;

        let hex = 0x3b82f6;
        if (dist.category === ZoneCategory.RAIL_YARD) hex = 0xf59e0b;
        else if (dist.category === ZoneCategory.CITY) hex = 0x10b981;
        else if (dist.category === ZoneCategory.PORT_RESERVED) hex = 0x06b6d4;
        else if (dist.category === ZoneCategory.AIRPORT_RESERVED) hex = 0xa855f7;
        else if (dist.category === ZoneCategory.HIGHWAY_RESERVED) hex = 0xef4444;

        const planeGeo = new THREE.PlaneGeometry(bw, bd);
        planeGeo.rotateX(-Math.PI / 2);
        const planeMat = new THREE.MeshBasicMaterial({
          color: hex,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(planeGeo, planeMat);
        mesh.position.set(
          (pMin.x + pMax.x) * 0.5,
          1.32,
          (pMin.z + pMax.z) * 0.5
        );
        this.debugGroup.add(mesh);
      }
    }

    if (this.debugSettings.showParcels) {
      for (const p of this.world.parcels.getAllParcels()) {
        if (p.id.startsWith('parcel-sector-')) continue;
        const pMin = this.world.grid.gridToWorld(p.minGx, p.minGz);
        const pMax = this.world.grid.gridToWorld(p.maxGx, p.maxGz);
        const bw = Math.abs(pMax.x - pMin.x) + cs;
        const bd = Math.abs(pMax.z - pMin.z) + cs;
        const cx = (pMin.x + pMax.x) * 0.5;
        const cz = (pMin.z + pMax.z) * 0.5;

        const fillMat = new THREE.MeshBasicMaterial({
          color: p.owned ? 0x10b981 : 0xf59e0b,
          transparent: true,
          opacity: p.owned ? 0.12 : 0.2,
          depthWrite: false,
        });
        const fillMesh = new THREE.Mesh(
          new THREE.BoxGeometry(bw - 0.35, 0.08, bd - 0.35),
          fillMat
        );
        fillMesh.position.set(cx, 1.32, cz);
        this.debugGroup.add(fillMesh);

        const boxGeo = new THREE.BoxGeometry(bw - 0.2, 0.22, bd - 0.2);
        const edges = new THREE.EdgesGeometry(boxGeo);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: p.owned ? 0x34d399 : 0xfbbf24,
          })
        );
        line.position.set(cx, 1.42, cz);
        this.debugGroup.add(line);
      }
    }
  }

  /**
   * Renders real-time snapped construction preview on the authoritative grid,
   * including a 3D semi-transparent ghost model of the selected building when placing structures.
   */
  public updateConstructionPreview(spec: ConstructionPreviewSpec): void {
    this.clearGroup(this.previewGroup);
    if (!spec.active || spec.cells.length === 0) return;

    const cs = this.world.config.cellSize;
    const mat = spec.valid
      ? this.materials.previewValid
      : this.materials.previewInvalid;
    const yHeight = spec.elevated ? 2.15 : 1.32;

    const cellGeo = new THREE.BoxGeometry(cs * 0.92, 0.14, cs * 0.92);
    const inst = new THREE.InstancedMesh(cellGeo, mat, spec.cells.length);

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < spec.cells.length; i++) {
      const c = spec.cells[i];
      const wp = this.world.grid.gridToWorld(c.gx, c.gz);
      if (wp.x < minX) minX = wp.x;
      if (wp.x > maxX) maxX = wp.x;
      if (wp.z < minZ) minZ = wp.z;
      if (wp.z > maxZ) maxZ = wp.z;

      _dummyObj.position.set(wp.x, yHeight, wp.z);
      _dummyObj.rotation.set(0, 0, 0);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      inst.setMatrixAt(i, _dummyObj.matrix);
    }

    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    this.previewGroup.add(inst);

    // Render 3D semi-transparent ghost of the actual selected building model
    if (spec.buildingCatalogueId) {
      const bSpec = getBuildingSpecById(spec.buildingCatalogueId);
      if (bSpec) {
        const ghostGroup = new THREE.Group();
        const centerX = (minX + maxX) * 0.5;
        const centerZ = (minZ + maxZ) * 0.5;
        const baseElev =
          this.world.terrainWater.getElevationAtWorld(centerX, centerZ) ?? 1.25;
        const orient = spec.orientation ?? 0;

        const ghostBodyMat = new THREE.MeshStandardMaterial({
          color: spec.valid ? bSpec.primaryColorHex : 0xf43f5e,
          emissive: spec.valid ? 0x10b981 : 0xe11d48,
          emissiveIntensity: 0.28,
          roughness: 0.4,
          transparent: true,
          opacity: 0.68,
          depthWrite: false,
        });
        const ghostRoofMat = new THREE.MeshStandardMaterial({
          color: spec.valid ? bSpec.secondaryColorHex : 0xbe123c,
          emissive: spec.valid ? 0x059669 : 0x9f1239,
          emissiveIntensity: 0.22,
          roughness: 0.5,
          transparent: true,
          opacity: 0.76,
          depthWrite: false,
        });

        const bw = bSpec.widthCells * cs - 0.5;
        const bd = bSpec.depthCells * cs - 0.5;
        const bh = bSpec.heightMeters;

        const bodyMesh = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, bd),
          ghostBodyMat
        );
        bodyMesh.position.y = bh * 0.5 + 0.14;
        ghostGroup.add(bodyMesh);

        // Roof silhouette matching the building's roofStyle
        if (bSpec.roofStyle === 'PITCHED_TILE') {
          const roofCone = new THREE.Mesh(
            new THREE.ConeGeometry(Math.max(bw, bd) * 0.65, 1.35, 4),
            ghostRoofMat
          );
          roofCone.rotation.y = Math.PI * 0.25;
          roofCone.position.y = bh + 0.14 + 0.67;
          ghostGroup.add(roofCone);
        } else if (bSpec.roofStyle === 'ARCHED_BARREL') {
          const arch = new THREE.Mesh(
            new THREE.CylinderGeometry(
              bw * 0.48,
              bw * 0.48,
              bd * 0.96,
              14,
              1,
              false,
              0,
              Math.PI
            ),
            ghostRoofMat
          );
          arch.rotation.z = Math.PI * 0.5;
          arch.rotation.y = Math.PI * 0.5;
          arch.scale.set(1, 0.48, 1);
          arch.position.y = bh + 0.14;
          ghostGroup.add(arch);
        } else if (bSpec.roofStyle === 'STEPPED_CROWN') {
          const crown = new THREE.Mesh(
            new THREE.BoxGeometry(bw * 0.72, 1.3, bd * 0.72),
            ghostRoofMat
          );
          crown.position.y = bh + 0.14 + 0.65;
          ghostGroup.add(crown);
        } else {
          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(bw + 0.16, 0.28, bd + 0.16),
            ghostRoofMat
          );
          cap.position.y = bh + 0.14 + 0.14;
          ghostGroup.add(cap);
        }

        // Front access awning / orientation indicator on +Z face
        const frontCanopy = new THREE.Mesh(
          new THREE.BoxGeometry(Math.min(bw * 0.6, 3.2), 0.22, 0.7),
          ghostRoofMat
        );
        frontCanopy.position.set(0, 1.35, bd * 0.5 + 0.3);
        ghostGroup.add(frontCanopy);

        ghostGroup.position.set(centerX, baseElev, centerZ);
        ghostGroup.rotation.y = (-orient * Math.PI) / 180;
        this.previewGroup.add(ghostGroup);
      }
    }
  }

  /**
   * Camera Control & Focus Presets
   */
  public setTitleTourActive(active: boolean): void {
    this.isTitleTourActive = active;
    if (!active) {
      this.focusOnRegion('OVERVIEW');
    }
  }

  public addCameraShake(trauma: number): void {
    this.cameraShakeTrauma = Math.min(1.0, this.cameraShakeTrauma + trauma);
  }

  public focusOnWorldPosition(wx: number, wz: number, radius = 58): void {
    this.isTitleTourActive = false;
    this.desiredTarget.set(wx, 1.2, wz);
    this.desiredRadius = radius;
    this.clampCameraTargetToBounds();
  }

  public focusOnRegion(
    region:
      | 'OVERVIEW'
      | 'CITY_ROUNDABOUT'
      | 'TRUCK_DEPOT'
      | 'WAREHOUSE_1'
      | 'HIGHWAY'
      | 'RAIL_YARD'
      | 'PORT_HARBOUR'
      | 'AIRPORT'
      | 'RIVER_LAKE'
      | 'WORLD_EXPANSION'
  ): void {
    this.isTitleTourActive = false;
    switch (region) {
      case 'OVERVIEW': {
        const p = this.world.grid.gridToWorld(78, 58);
        this.desiredTarget.set(p.x, 1.2, p.z);
        this.desiredRadius = 135;
        this.desiredAzimuth = Math.PI * 0.18;
        this.desiredPolar = Math.PI * 0.31;
        break;
      }
      case 'CITY_ROUNDABOUT': {
        const p = this.world.grid.gridToWorld(86, 55);
        this.desiredTarget.set(p.x, 1.2, p.z);
        this.desiredRadius = 68;
        this.desiredAzimuth = Math.PI * 0.22;
        this.desiredPolar = Math.PI * 0.29;
        break;
      }
      case 'TRUCK_DEPOT': {
        const td = this.world.economy.getTruckDepot();
        const p = this.world.grid.gridToWorld(
          (td.activeMinGx + td.activeMaxGx) * 0.5,
          (td.activeMinGz + td.activeMaxGz) * 0.5 + 0.5
        );
        this.desiredTarget.set(p.x, 1.4, p.z);
        this.desiredRadius = td.level >= 10 ? 34 : 22;
        this.desiredAzimuth = -Math.PI * 0.18;
        this.desiredPolar = Math.PI * 0.27;
        break;
      }
      case 'WAREHOUSE_1': {
        const p = this.world.grid.gridToWorld(47, 74);
        this.desiredTarget.set(p.x, 1.2, p.z);
        this.desiredRadius = 46;
        this.desiredAzimuth = -Math.PI * 0.82;
        this.desiredPolar = Math.PI * 0.27;
        break;
      }
      case 'HIGHWAY': {
        const p = this.world.grid.gridToWorld(142, 55);
        this.desiredTarget.set(p.x, 1.2, p.z);
        this.desiredRadius = 74;
        this.desiredAzimuth = -Math.PI * 0.18;
        this.desiredPolar = Math.PI * 0.3;
        break;
      }
      case 'RAIL_YARD': {
        const p = this.world.grid.gridToWorld(27, 55);
        this.desiredTarget.set(p.x, 1.2, p.z);
        this.desiredRadius = 66;
        this.desiredAzimuth = Math.PI * 0.25;
        this.desiredPolar = Math.PI * 0.29;
        break;
      }
      case 'PORT_HARBOUR': {
        const p = this.world.grid.gridToWorld(90, 96);
        this.desiredTarget.set(p.x, 0.8, p.z);
        this.desiredRadius = 68;
        this.desiredAzimuth = Math.PI * 0.15;
        this.desiredPolar = Math.PI * 0.29;
        break;
      }
      case 'AIRPORT': {
        const ap = this.world.economy.getAirport();
        const p = this.world.grid.gridToWorld(
          Math.floor((ap.minGx + ap.maxGx) * 0.5) - 10,
          Math.floor((ap.minGz + ap.maxGz) * 0.5)
        );
        this.desiredTarget.set(p.x, 1.4, p.z);
        this.desiredRadius = 96;
        this.desiredAzimuth = -Math.PI * 0.12;
        this.desiredPolar = Math.PI * 0.27;
        break;
      }
      case 'RIVER_LAKE': {
        const p = this.world.grid.gridToWorld(64, 42);
        this.desiredTarget.set(p.x, 1.0, p.z);
        this.desiredRadius = 85;
        this.desiredAzimuth = Math.PI * 0.2;
        this.desiredPolar = Math.PI * 0.3;
        break;
      }
      case 'WORLD_EXPANSION': {
        const p = this.world.grid.gridToWorld(236, 68);
        this.desiredTarget.set(p.x, 1.6, p.z);
        this.desiredRadius = 155;
        this.desiredAzimuth = -Math.PI * 0.18;
        this.desiredPolar = Math.PI * 0.31;
        break;
      }
    }
  }

  private clampCameraTargetToBounds(dt = 0.016): void {
    this.desiredRadius = THREE.MathUtils.clamp(this.desiredRadius, 16, 620);
    this.desiredPolar = THREE.MathUtils.clamp(
      this.desiredPolar,
      Math.PI * 0.14,
      Math.PI * 0.42
    );
    const bounds = this.world.grid.getWorldBounds();
    clampCameraPanningBounds(
      this.desiredTarget,
      this.cameraTarget,
      this.camera.position,
      bounds,
      this.desiredRadius,
      dt
    );
  }

  private updateCameraTransformImmediate(): void {
    this.cameraTarget.copy(this.desiredTarget);
    this.sphericalRadius = this.desiredRadius;
    this.azimuthAngle = this.desiredAzimuth;
    this.polarAngle = this.desiredPolar;

    const sinP = Math.sin(this.polarAngle);
    const cosP = Math.cos(this.polarAngle);
    const sinA = Math.sin(this.azimuthAngle);
    const cosA = Math.cos(this.azimuthAngle);

    this.camera.position.set(
      this.cameraTarget.x + this.sphericalRadius * sinP * sinA,
      this.cameraTarget.y + this.sphericalRadius * cosP,
      this.cameraTarget.z + this.sphericalRadius * sinP * cosA
    );
    this.camera.lookAt(this.cameraTarget);
  }

  /**
   * Converts viewport client coordinates to logical grid coordinates via ground-plane raycast.
   */
  public screenToGridCoord(clientX: number, clientY: number): GridCoord | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    this.mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(_rayPlane, _tempVec3);
    if (!hit) return null;

    const snapped = this.world.grid.snapWorldToGrid(hit.x, hit.z);
    if (!snapped.valid) return null;
    return { gx: snapped.gx, gz: snapped.gz };
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      this.pointerDownClient = { x: e.clientX, y: e.clientY };
      this.dragStartClient = { x: e.clientX, y: e.clientY };
      this.pointerMovedDist = 0;

      if (e.button === 2 || e.button === 1 || e.shiftKey) {
        this.isDraggingPan = true;
      } else if (e.altKey) {
        this.isDraggingRotate = true;
      } else if (e.button === 0) {
        this.isDraggingPan = true;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - this.dragStartClient.x;
      const dy = e.clientY - this.dragStartClient.y;
      this.pointerMovedDist += Math.hypot(dx, dy);
      this.dragStartClient = { x: e.clientX, y: e.clientY };

      if (this.isDraggingRotate) {
        this.desiredAzimuth -= dx * 0.006;
        this.desiredPolar = THREE.MathUtils.clamp(
          this.desiredPolar - dy * 0.005,
          Math.PI * 0.14,
          Math.PI * 0.42
        );
        return;
      }

      if (this.isDraggingPan && this.pointerMovedDist > 5) {
        const panScale = this.sphericalRadius * 0.0014;
        _forwardVec
          .set(-Math.sin(this.azimuthAngle), 0, -Math.cos(this.azimuthAngle))
          .normalize();
        _rightVec.set(_forwardVec.z, 0, -_forwardVec.x).normalize();

        this.desiredTarget.addScaledVector(_rightVec, dx * panScale);
        this.desiredTarget.addScaledVector(_forwardVec, dy * panScale);
        this.clampCameraTargetToBounds();
      }

      // Throttled hover raycast (<= 25Hz)
      const now = performance.now();
      if (now - this.lastHoverRaycastTime >= 40) {
        this.lastHoverRaycastTime = now;
        const coord = this.screenToGridCoord(e.clientX, e.clientY);
        this.onCellHover?.(coord);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasClick = this.pointerMovedDist <= 6;
      this.isDraggingPan = false;
      this.isDraggingRotate = false;

      if (wasClick && !this.isTitleTourActive) {
        // First check if user clicked a 3D World-Space Blue Lock Badge Sprite
        if (this.lockBadgeSprites.length > 0 && e.button === 0) {
          const rect = this.renderer.domElement.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            this.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouseNdc, this.camera);
            const sprites = this.lockBadgeSprites.map((s) => s.sprite);
            const hits = this.raycaster.intersectObjects(sprites, false);
            if (hits.length > 0) {
              const hitObj = hits[0].object;
              const match = this.lockBadgeSprites.find(
                (s) => s.sprite === hitObj
              );
              if (match && this.onLockBadgeClick) {
                this.onLockBadgeClick(match.id);
                return;
              }
            }
          }
        }

        const coord = this.screenToGridCoord(e.clientX, e.clientY);
        if (coord) {
          this.onCellClick?.(coord, e.button);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.desiredRadius = THREE.MathUtils.clamp(
        this.desiredRadius + e.deltaY * 0.08,
        28,
        620
      );
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      this.keysHeld.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keysHeld.delete(e.code);
    };

    const onBlur = () => {
      this.keysHeld.clear();
      this.isDraggingPan = false;
      this.isDraggingRotate = false;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.handleResize);
  }

  public handleResize = (): void => {
    if (this.isDisposed) return;
    const width = Math.max(
      this.container.clientWidth || window.innerWidth,
      320
    );
    const height = Math.max(
      this.container.clientHeight || window.innerHeight,
      240
    );
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  /**
   * Software-WebGL fence sync pacing helper so headless browser screenshots never stall.
   */
  private afterDraw(cb: () => void): void {
    if (this.isDisposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick = (): void => {
    if (this.isDisposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastFrameTime) * 0.001;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.lastFrameTime = now;

    // Step authoritative transport, motorway traffic, and contract simulation
    this.world.economy.stepSimulation(dt);
    this.updateVehiclesAnimation();

    // 1. Live World Camera Tour during Title Screen
    if (this.isTitleTourActive) {
      this.tourTime += dt * 0.28;
      this.desiredTarget.set(
        Math.sin(this.tourTime) * 38,
        1.2,
        Math.cos(this.tourTime * 0.8) * 26
      );
      this.desiredAzimuth = Math.PI * 0.2 + Math.sin(this.tourTime * 0.5) * 0.25;
      this.desiredRadius = 126;
      this.desiredPolar = Math.PI * 0.3;
    } else {
      // 2. WASD / Arrow Keyboard Navigation & Q/E Rotation
      const panSpeed = this.sphericalRadius * 0.72 * dt;
      _forwardVec
        .set(-Math.sin(this.azimuthAngle), 0, -Math.cos(this.azimuthAngle))
        .normalize();
      _rightVec.set(_forwardVec.z, 0, -_forwardVec.x).normalize();

      if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) {
        this.desiredTarget.addScaledVector(_forwardVec, panSpeed);
      }
      if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) {
        this.desiredTarget.addScaledVector(_forwardVec, -panSpeed);
      }
      if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) {
        this.desiredTarget.addScaledVector(_rightVec, panSpeed);
      }
      if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) {
        this.desiredTarget.addScaledVector(_rightVec, -panSpeed);
      }
      if (this.keysHeld.has('KeyQ')) {
        this.desiredAzimuth -= 1.2 * dt;
      }
      if (this.keysHeld.has('KeyE')) {
        this.desiredAzimuth += 1.2 * dt;
      }
      this.clampCameraTargetToBounds(dt);
    }

    // Animate water normal ripples according to active GFX quality preset (Low/Medium/High/Ultra)
    const waterQ = getWaterQualityConfig(this.graphicsQuality);
    if (waterQ.animateWaves && this.waterNormalTex) {
      this.waterWaveTime += dt * waterQ.waveSpeed;
      this.waterNormalTex.offset.set(
        (this.waterWaveTime * 0.18) % 1,
        (Math.sin(this.waterWaveTime * 0.65) * 0.08 + this.waterWaveTime * 0.11) % 1
      );
    }

    // Animate Airport Landmarks (Rotating Geodesic Radome, ATC Radar Dish, Synchronized Red Obstruction Beacons, Pulsing Airfield Lights & Windsock)
    this.airportAnimTime += dt;
    if (this.radomeMesh) {
      this.radomeMesh.rotation.y = this.airportAnimTime * 0.85;
    }
    if (this.atcRadarMesh) {
      this.atcRadarMesh.rotation.y = this.airportAnimTime * 1.65;
    }
    const beaconPulse = Math.sin(this.airportAnimTime * 5.2) > 0;
    for (const beacon of this.obstructionBeaconMeshes) {
      const bMat = beacon.material as THREE.MeshBasicMaterial;
      bMat.color.setHex(beaconPulse ? 0xff1e1e : 0x450a0a);
      beacon.scale.setScalar(beaconPulse ? 1.22 : 0.88);
    }
    if (this.graphicsQuality !== 'LOW') {
      const lightPulse = Math.sin(this.airportAnimTime * 3.4) > -0.25;
      for (const item of this.airfieldLightMaterials) {
        item.mat.color.setHex(lightPulse ? item.baseHex : item.dimHex);
      }
    }
    for (const pool of this.apronFloodPoolMeshes) {
      pool.visible = this.graphicsQuality !== 'LOW';
    }
    if (this.windsockPivot) {
      this.windsockPivot.rotation.y =
        Math.sin(this.airportAnimTime * 1.8) * 0.24 +
        Math.cos(this.airportAnimTime * 3.1) * 0.08;
      this.windsockPivot.rotation.z =
        Math.sin(this.airportAnimTime * 2.6) * 0.06;
    }

    // 3. Exponential Damping & Proportional Viewport Boundary Clamping
    const alpha = this.isSoftwareGl ? 1.0 : 1 - Math.exp(-10 * dt);
    this.cameraTarget.lerp(this.desiredTarget, alpha);
    this.sphericalRadius = THREE.MathUtils.lerp(
      this.sphericalRadius,
      this.desiredRadius,
      alpha
    );
    this.azimuthAngle = THREE.MathUtils.lerp(
      this.azimuthAngle,
      this.desiredAzimuth,
      alpha
    );
    this.polarAngle = THREE.MathUtils.lerp(
      this.polarAngle,
      this.desiredPolar,
      alpha
    );
    if (!this.isTitleTourActive) {
      clampCameraPanningBounds(
        this.desiredTarget,
        this.cameraTarget,
        this.camera.position,
        this.world.grid.getWorldBounds(),
        this.sphericalRadius,
        dt
      );
    }

    const sinP = Math.sin(this.polarAngle);
    const cosP = Math.cos(this.polarAngle);
    const sinA = Math.sin(this.azimuthAngle);
    const cosA = Math.cos(this.azimuthAngle);

    // Subtle decaying trauma shake on construction/demolition
    let shakeX = 0;
    let shakeZ = 0;
    if (this.cameraShakeTrauma > 0.001) {
      const shake = this.cameraShakeTrauma * this.cameraShakeTrauma * 0.45;
      shakeX = (Math.random() - 0.5) * shake;
      shakeZ = (Math.random() - 0.5) * shake;
      this.cameraShakeTrauma = Math.max(0, this.cameraShakeTrauma - dt * 2.8);
    }

    _tempVec3B.set(
      this.cameraTarget.x + shakeX,
      this.cameraTarget.y,
      this.cameraTarget.z + shakeZ
    );

    this.camera.position.set(
      _tempVec3B.x + this.sphericalRadius * sinP * sinA,
      _tempVec3B.y + this.sphericalRadius * cosP,
      _tempVec3B.z + this.sphericalRadius * sinP * cosA
    );
    this.camera.lookAt(_tempVec3B);

    if (this.onLockBadgesProjectionUpdate && this.lockBadgeSprites.length > 0) {
      this.onLockBadgesProjectionUpdate(this.getProjectedAirportLockBadges());
    }

    // Update per-chunk distance LOD tier & dynamic streaming relative to camera target/position
    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;
    const fwdX = this.cameraTarget.x - camX;
    const fwdZ = this.cameraTarget.z - camZ;
    this.world.streaming.stepDynamicChunkStreaming(
      this.cameraTarget.x,
      this.cameraTarget.z,
      this.graphicsQuality,
      3,
      3.5,
      fwdX,
      fwdZ
    );
    for (const ch of this.terrainChunkVisuals) {
      const dist = Math.hypot(ch.centerWx - camX, ch.centerWz - camZ);
      ch.lodTier = computeLodTierForDistance(dist, this.graphicsQuality);
      ch.mesh.visible = ch.lodTier !== 'CULLED';
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.handleResize);

    this.clearGroup(this.terrainGroup);
    this.clearGroup(this.waterGroup);
    this.clearGroup(this.propsGroup);
    this.clearGroup(this.roadsGroup);
    this.clearGroup(this.railwayGroup);
    this.clearGroup(this.bridgesGroup);
    this.clearGroup(this.portGroup);
    this.clearGroup(this.airportGroup);
    this.clearGroup(this.buildingsGroup);
    this.clearGroup(this.vehiclesGroup);
    this.clearGroup(this.debugGroup);
    this.clearGroup(this.previewGroup);

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
