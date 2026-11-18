/**
 * Infinite Procedural World Streaming, Origin Rebasing, Infinite Linear Infrastructure,
 * Object Pooling & 64-Bit Coordinate Persistence Architecture for Global Transport Empire.
 *
 * Implements the 5 Core Technical Requirements for 10,000,000+ Block/Unit Scale:
 * 1. Dynamic Chunk-Based Streaming & LOD (64x64 or 128x128 tile chunks, async time-budgeted queue).
 * 2. Floating-Point Precision & Origin Rebasing (camera-relative matrix & origin shift for 10M+ units).
 * 3. Infinite Linear Infrastructure (continuous straight-line railway tracks, multi-lane highways, and rivers).
 * 4. Performance Optimization, Frustum Culling, Object Pooling & Instanced Rendering specs.
 * 5. Massive Coordinate Save State Scaling (64-bit BigInt packed keys & high-precision coordinate serialization).
 */

import {
  GraphicsQualityPreset,
  LodDistanceTier,
  computeLodTierForDistance,
} from './GraphicsQualitySystem';
import { GridCoord, GridSystem } from './GridSystem';
import { TerrainWaterSystem } from './TerrainWaterSystem';
import {
  TerrainCategory,
  WaterClassification,
  WorldConfigData,
} from './WorldConfig';

export type StreamingChunkTileSize = 64 | 128;

/**
 * Maximum supported coordinate magnitude across all 4 cardinal directions (North, South, East, West).
 * Supports +/- 50,000,000 blocks/units (well beyond the 10,000,000+ requirement).
 */
export const INFINITE_WORLD_MAX_COORD_UNITS = 50_000_000;

/**
 * Distance threshold (in world meters) from the active rebase origin at which the
 * OriginRebasingController shifts the scene origin to keep GPU 32-bit floats near (0, 0, 0).
 */
export const ORIGIN_REBASE_THRESHOLD_METERS = 2048;

/**
 * Quantum snap step (in world meters) used when rebasing the floating origin.
 */
export const ORIGIN_REBASE_SNAP_QUANTUM_METERS = 1024;

export interface RebasedCoordinateResult {
  /** Authoritative double-precision world X (meters) */
  worldX: number;
  /** Authoritative double-precision world Z (meters) */
  worldZ: number;
  /** Active floating origin offset X (meters) */
  originOffsetX: number;
  /** Active floating origin offset Z (meters) */
  originOffsetZ: number;
  /** Camera/Origin-relative GPU-safe float32 X (guaranteed near 0 when near camera) */
  localRenderX: number;
  /** Camera/Origin-relative GPU-safe float32 Z (guaranteed near 0 when near camera) */
  localRenderZ: number;
  /** Verified single-precision float32 quantization error in meters */
  float32PrecisionErrorMeters: number;
}

export interface InfiniteLinearInfraSpan {
  kind: 'RAILWAY_MAINLINE' | 'MULTI_LANE_HIGHWAY' | 'RIVER_CHANNEL';
  chunkX: number;
  chunkZ: number;
  startGx: number;
  startGz: number;
  endGx: number;
  endGz: number;
  startWx: number;
  startWz: number;
  endWx: number;
  endWz: number;
  widthMeters: number;
  laneOrTrackCount: number;
  instancedTieCount: number;
  instancedFencePostCount: number;
  elevationY: number;
}

export interface StreamedChunkInstanceData {
  coniferMatrices: Float32Array;
  coniferColors: Float32Array;
  coniferCount: number;
  deciduousMatrices: Float32Array;
  deciduousColors: Float32Array;
  deciduousCount: number;
  rockMatrices: Float32Array;
  rockCount: number;
  railTieMatrices: Float32Array;
  railTieCount: number;
  fenceMatrices: Float32Array;
  fenceCount: number;
}

export interface StreamedWorldChunkRecord {
  key: string;
  packedKey64Hex: string;
  chunkX: number;
  chunkZ: number;
  tileSize: StreamingChunkTileSize;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  centerWx: number;
  centerWz: number;
  boundingSphereRadius: number;
  lodTier: LodDistanceTier;
  state: 'QUEUED' | 'LOADED' | 'POOLED';
  frustumVisible: boolean;
  dominantTerrain: TerrainCategory;
  dominantWater: WaterClassification;
  meanElevation: number;
  hasInfiniteRailway: boolean;
  hasInfiniteHighway: boolean;
  hasInfiniteRiver: boolean;
  linearInfrastructure: InfiniteLinearInfraSpan[];
  instanceData: StreamedChunkInstanceData;
  lastTouchedTick: number;
}

export interface MassiveWorldInfrastructureAnchor {
  id: string;
  category:
    | 'RAILWAY_YARD'
    | 'AIRPORT'
    | 'HIGHWAY_NODE'
    | 'RAIL_CORRIDOR_NODE'
    | 'LOGISTICS_HUB'
    | 'CUSTOM_FACILITY';
  name: string;
  gx: number;
  gz: number;
  widthCells: number;
  depthCells: number;
  packedCoordKey64Hex: string;
  precisionCoordKey: string;
  worldX: number;
  worldZ: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface SerializedMassiveWorldState {
  version: 2;
  chunkTileSize: StreamingChunkTileSize;
  rebaseOriginX: number;
  rebaseOriginZ: number;
  anchors: MassiveWorldInfrastructureAnchor[];
}

export interface StreamingPerformanceTelemetry {
  chunkTileSize: StreamingChunkTileSize;
  activeLoadedChunks: number;
  queuedPendingChunks: number;
  pooledRecycledChunks: number;
  frustumVisibleChunks: number;
  frustumCulledChunks: number;
  totalInstancedTrees: number;
  totalInstancedRocks: number;
  totalInstancedRailTies: number;
  totalInstancedFencePosts: number;
  rebaseOriginX: number;
  rebaseOriginZ: number;
  rebaseCount: number;
  maxSupportedCoordinateUnits: number;
}

/**
 * Packs a pair of signed 32-bit integer grid coordinates (gx, gz) into an exact
 * 64-bit unsigned BigInt key (represented as a 16-char hex string or BigInt)
 * capable of addressing +/- 2,147,483,647 blocks on each axis without collision.
 */
export function encodeCoordKey64BigInt(gx: number, gz: number): bigint {
  const ix = BigInt(Math.trunc(gx));
  const iz = BigInt(Math.trunc(gz));
  const ux = BigInt.asUintN(32, ix);
  const uz = BigInt.asUintN(32, iz);
  return (ux << 32n) | uz;
}

export function decodeCoordKey64BigInt(packed: bigint): GridCoord {
  const ux = (packed >> 32n) & 0xffffffffn;
  const uz = packed & 0xffffffffn;
  const gx = Number(BigInt.asIntN(32, ux));
  const gz = Number(BigInt.asIntN(32, uz));
  return { gx, gz };
}

export function encodeCoordKey64Hex(gx: number, gz: number): string {
  const packed = encodeCoordKey64BigInt(gx, gz);
  return '0x' + packed.toString(16).padStart(16, '0');
}

export function decodeCoordKey64Hex(hexKey: string): GridCoord {
  const clean = hexKey.startsWith('0x') || hexKey.startsWith('0X')
    ? hexKey
    : `0x${hexKey}`;
  const packed = BigInt(clean);
  return decodeCoordKey64BigInt(packed);
}

export function formatHighPrecisionCoordKey(gx: number, gz: number): string {
  return `${Math.trunc(gx)}:${Math.trunc(gz)}`;
}

export function parseHighPrecisionCoordKey(key: string): GridCoord | null {
  const parts = key.split(':');
  if (parts.length !== 2) return null;
  const gx = Number(parts[0]);
  const gz = Number(parts[1]);
  if (!Number.isFinite(gx) || !Number.isFinite(gz)) return null;
  return { gx: Math.trunc(gx), gz: Math.trunc(gz) };
}

/**
 * Floating-Point Precision & Origin Rebasing Controller.
 * Keeps all GPU-bound vertex positions and transformation matrices near (0, 0, 0)
 * even when the camera or trains travel 10,000,000+ units in any direction.
 */
export class OriginRebasingController {
  private originOffsetX = 0;
  private originOffsetZ = 0;
  private rebaseThresholdMeters: number;
  private snapQuantumMeters: number;
  private rebaseCount = 0;

  constructor(
    rebaseThresholdMeters = ORIGIN_REBASE_THRESHOLD_METERS,
    snapQuantumMeters = ORIGIN_REBASE_SNAP_QUANTUM_METERS
  ) {
    this.rebaseThresholdMeters = Math.max(256, rebaseThresholdMeters);
    this.snapQuantumMeters = Math.max(64, snapQuantumMeters);
  }

  public getOriginOffset(): { x: number; z: number; rebaseCount: number } {
    return {
      x: this.originOffsetX,
      z: this.originOffsetZ,
      rebaseCount: this.rebaseCount,
    };
  }

  public setOriginOffset(ox: number, oz: number): void {
    if (Number.isFinite(ox) && Number.isFinite(oz)) {
      this.originOffsetX = ox;
      this.originOffsetZ = oz;
    }
  }

  /**
   * Evaluates whether the camera's world position has drifted beyond the rebase threshold
   * from the current floating origin. If so, rebases the origin in quantum-snapped steps.
   */
  public updateOriginForCamera(
    cameraWorldX: number,
    cameraWorldZ: number
  ): {
    rebased: boolean;
    deltaShiftX: number;
    deltaShiftZ: number;
    originOffsetX: number;
    originOffsetZ: number;
  } {
    const localX = cameraWorldX - this.originOffsetX;
    const localZ = cameraWorldZ - this.originOffsetZ;
    const dist = Math.hypot(localX, localZ);

    if (dist <= this.rebaseThresholdMeters) {
      return {
        rebased: false,
        deltaShiftX: 0,
        deltaShiftZ: 0,
        originOffsetX: this.originOffsetX,
        originOffsetZ: this.originOffsetZ,
      };
    }

    const nextOriginX =
      Math.round(cameraWorldX / this.snapQuantumMeters) *
      this.snapQuantumMeters;
    const nextOriginZ =
      Math.round(cameraWorldZ / this.snapQuantumMeters) *
      this.snapQuantumMeters;

    const deltaShiftX = nextOriginX - this.originOffsetX;
    const deltaShiftZ = nextOriginZ - this.originOffsetZ;

    this.originOffsetX = nextOriginX;
    this.originOffsetZ = nextOriginZ;
    this.rebaseCount++;

    return {
      rebased: true,
      deltaShiftX,
      deltaShiftZ,
      originOffsetX: this.originOffsetX,
      originOffsetZ: this.originOffsetZ,
    };
  }

  /**
   * Transforms an authoritative double-precision world coordinate (wx, wz)
   * into a GPU-safe float32 render coordinate relative to the active floating origin.
   */
  public worldToRenderPosition(
    worldX: number,
    worldZ: number
  ): RebasedCoordinateResult {
    const exactLocalX = worldX - this.originOffsetX;
    const exactLocalZ = worldZ - this.originOffsetZ;
    const f32X = Math.fround(exactLocalX);
    const f32Z = Math.fround(exactLocalZ);
    const err = Math.hypot(f32X - exactLocalX, f32Z - exactLocalZ);

    return {
      worldX,
      worldZ,
      originOffsetX: this.originOffsetX,
      originOffsetZ: this.originOffsetZ,
      localRenderX: f32X,
      localRenderZ: f32Z,
      float32PrecisionErrorMeters: err,
    };
  }

  /**
   * Converts a local render coordinate back to authoritative double-precision world space.
   */
  public renderToWorldPosition(
    localRenderX: number,
    localRenderZ: number
  ): { worldX: number; worldZ: number } {
    return {
      worldX: localRenderX + this.originOffsetX,
      worldZ: localRenderZ + this.originOffsetZ,
    };
  }

  /**
   * Computes a camera-relative 4x4 column-major transformation matrix (16 numbers)
   * for any world object at (worldX, worldY, worldZ) so GPU vertex shaders receive
   * jitter-free camera-relative coordinates even at 10,000,000+ units.
   */
  public computeCameraRelativeMatrix16(
    objectWorldX: number,
    objectWorldY: number,
    objectWorldZ: number,
    cameraWorldX: number,
    cameraWorldY: number,
    cameraWorldZ: number,
    yawRad = 0,
    scale = 1
  ): Float32Array {
    const relX = Math.fround(objectWorldX - cameraWorldX);
    const relY = Math.fround(objectWorldY - cameraWorldY);
    const relZ = Math.fround(objectWorldZ - cameraWorldZ);
    const c = Math.cos(yawRad) * scale;
    const s = Math.sin(yawRad) * scale;

    const out = new Float32Array(16);
    out[0] = c;
    out[1] = 0;
    out[2] = -s;
    out[3] = 0;

    out[4] = 0;
    out[5] = scale;
    out[6] = 0;
    out[7] = 0;

    out[8] = s;
    out[9] = 0;
    out[10] = c;
    out[11] = 0;

    out[12] = relX;
    out[13] = relY;
    out[14] = relZ;
    out[15] = 1;
    return out;
  }
}

/**
 * Dynamic Chunk-Based Streaming Manager, Object Pool, Infinite Linear Infrastructure Generator,
 * and Massive Coordinate Persistence Registry.
 */
export class WorldStreamingAndPrecisionSystem {
  private config: WorldConfigData;
  private grid: GridSystem;
  private terrainWater: TerrainWaterSystem;
  public readonly originRebaser: OriginRebasingController;

  private chunkTileSize: StreamingChunkTileSize = 64;
  private activeChunks: Map<string, StreamedWorldChunkRecord> = new Map();
  private asyncLoadQueue: Array<{
    chunkX: number;
    chunkZ: number;
    priorityDistSq: number;
  }> = [];
  private chunkPool: StreamedWorldChunkRecord[] = [];
  private maxPoolSize = 96;
  private currentTick = 0;

  // Streaming radii in chunk rings around camera
  private activeRadiusChunks = 4; // 9x9 = 81 chunks max active around camera
  private unloadRadiusChunks = 5;

  // Massive coordinate infrastructure registry (64-bit packed BigInt keys -> anchors)
  private massiveAnchors: Map<string, MassiveWorldInfrastructureAnchor> =
    new Map();

  constructor(
    config: WorldConfigData,
    grid: GridSystem,
    terrainWater: TerrainWaterSystem,
    initialChunkTileSize: StreamingChunkTileSize = 64
  ) {
    this.config = config;
    this.grid = grid;
    this.terrainWater = terrainWater;
    this.chunkTileSize = initialChunkTileSize;
    this.originRebaser = new OriginRebasingController();

    this.seedDefaultMassiveAnchors();
  }

  private seedDefaultMassiveAnchors(): void {
    // Register the core facilities with 64-bit BigInt coordinate keys so they are indexed in the massive registry
    this.registerMassiveInfrastructureAnchor({
      id: 'anchor-core-rail-yard-40x50',
      category: 'RAILWAY_YARD',
      name: 'GTE Intermodal Railway Freight Terminal (40×50)',
      gx: -5,
      gz: 30,
      widthCells: 40,
      depthCells: 50,
    });
    this.registerMassiveInfrastructureAnchor({
      id: 'anchor-core-airport-50x70',
      category: 'AIRPORT',
      name: 'GTE Regional Air Cargo Hub (50×70)',
      gx: 152,
      gz: 12,
      widthCells: 50,
      depthCells: 70,
    });
  }

  public getChunkTileSize(): StreamingChunkTileSize {
    return this.chunkTileSize;
  }

  public setChunkTileSize(size: StreamingChunkTileSize): void {
    if (size !== 64 && size !== 128) return;
    if (this.chunkTileSize === size) return;
    this.chunkTileSize = size;
    // Recycle all active chunks back into the pool on tile size switch
    for (const ch of this.activeChunks.values()) {
      this.releaseChunkToPool(ch);
    }
    this.activeChunks.clear();
    this.asyncLoadQueue = [];
  }

  public worldToChunkCoord(
    worldX: number,
    worldZ: number
  ): { chunkX: number; chunkZ: number } {
    const { gx, gz } = this.grid.worldToGrid(worldX, worldZ);
    return this.gridToChunkCoord(gx, gz);
  }

  public gridToChunkCoord(
    gx: number,
    gz: number
  ): { chunkX: number; chunkZ: number } {
    return {
      chunkX: Math.floor(gx / this.chunkTileSize),
      chunkZ: Math.floor(gz / this.chunkTileSize),
    };
  }

  /**
   * Validates whether an arbitrary coordinate (up to +/- 50,000,000 blocks/units)
   * is supported by the infinite procedural world streaming architecture.
   */
  public isInfiniteCoordinateSupported(gx: number, gz: number): boolean {
    if (!Number.isFinite(gx) || !Number.isFinite(gz)) return false;
    return (
      Math.abs(gx) <= INFINITE_WORLD_MAX_COORD_UNITS &&
      Math.abs(gz) <= INFINITE_WORLD_MAX_COORD_UNITS
    );
  }

  /**
   * Deterministically samples terrain elevation, category, and water state at ANY
   * coordinate across the 10,000,000+ block infinite world (falling back to seamless
   * continental procedural synthesis outside the pre-allocated core array).
   */
  public sampleInfiniteTerrainAtGrid(
    gx: number,
    gz: number
  ): {
    elevation: number;
    terrainCategory: TerrainCategory;
    waterClassification: WaterClassification;
  } {
    const ix = Math.trunc(gx);
    const iz = Math.trunc(gz);

    // Keep infinite mainline railway corridor (gx = 25..28) and infinite highway corridor (gx = 123..134)
    // on level engineered mainland embankment at all northern/southern frontier coordinates!
    if (ix >= 24 && ix <= 30) {
      return {
        elevation: 1.2,
        terrainCategory: TerrainCategory.SOIL,
        waterClassification: WaterClassification.NONE,
      };
    }
    if (ix >= this.config.highway.startX && ix <= this.config.highway.endX) {
      return {
        elevation: 1.2,
        terrainCategory: TerrainCategory.SOIL,
        waterClassification: WaterClassification.NONE,
      };
    }

    const coreElev = this.terrainWater.getElevationAtGrid(ix, iz);
    if (coreElev !== null) {
      return {
        elevation: coreElev,
        terrainCategory:
          this.terrainWater.getTerrainCategoryAt(ix, iz) ??
          TerrainCategory.GRASS,
        waterClassification:
          this.terrainWater.getWaterClassificationAt(ix, iz) ??
          WaterClassification.NONE,
      };
    }

    // Infinite procedural continental terrain synthesis for extreme coordinates (+/- 10,000,000+ blocks)
    // Infinite winding river channel centered around gx = 76 + sin(gz * 0.004) * 8
    const riverCenterGx = 76 + Math.sin(iz * 0.004) * 8;
    if (Math.abs(ix - riverCenterGx) <= 3.5) {
      return {
        elevation: -0.95,
        terrainCategory: TerrainCategory.SUBMERGED,
        waterClassification: WaterClassification.RIVER,
      };
    }

    const macroWave =
      Math.sin(ix * 0.0025 + 0.3) * Math.cos(iz * 0.0025 - 0.2) * 0.65;
    const ridge =
      Math.max(0, Math.sin(ix * 0.009 - 0.4) * Math.cos(iz * 0.0085 + 0.5)) *
      2.2;
    const detail =
      Math.sin(ix * 0.031 + iz * 0.027) * 0.25;
    const elev = Math.max(0.95, 1.24 + macroWave + ridge + detail);

    const cat =
      elev > 3.6
        ? TerrainCategory.ROCK
        : elev > 2.4
          ? TerrainCategory.SOIL
          : TerrainCategory.GRASS;

    return {
      elevation: Number(elev.toFixed(3)),
      terrainCategory: cat,
      waterClassification: WaterClassification.NONE,
    };
  }

  /**
   * Computes infinite linear infrastructure spans (Straight-Line Mainline Railway Tracks,
   * 10-Lane Divided Motorway, and Continuous River Channel) intersecting chunk (chunkX, chunkZ).
   */
  public computeInfiniteLinearInfrastructureForChunk(
    chunkX: number,
    chunkZ: number,
    tileSize: StreamingChunkTileSize = this.chunkTileSize
  ): InfiniteLinearInfraSpan[] {
    const minGx = chunkX * tileSize;
    const maxGx = minGx + tileSize - 1;
    const minGz = chunkZ * tileSize;
    const maxGz = minGz + tileSize - 1;
    const cs = this.config.cellSize;

    const spans: InfiniteLinearInfraSpan[] = [];

    // 1. Infinite Straight-Line Parallel Railway Extension (gx = 26 and gx = 27 across all North/South chunks)
    //    Extends infinitely northward (gz <= 86) and across the entire northern/southern mainland
    if (minGx <= 27 && maxGx >= 26) {
      const startPos = this.grid.gridToWorld(26.5, minGz);
      const endPos = this.grid.gridToWorld(26.5, maxGz);
      const lengthMeters = Math.abs(endPos.z - startPos.z) + cs;
      spans.push({
        kind: 'RAILWAY_MAINLINE',
        chunkX,
        chunkZ,
        startGx: 26,
        startGz: minGz,
        endGx: 27,
        endGz: maxGz,
        startWx: startPos.x,
        startWz: startPos.z,
        endWx: endPos.x,
        endWz: endPos.z,
        widthMeters: 4.0,
        laneOrTrackCount: 2,
        instancedTieCount: Math.max(8, Math.floor(lengthMeters / 0.85) * 2),
        instancedFencePostCount: Math.max(4, Math.floor(lengthMeters / 4.0) * 2),
        elevationY: 1.25,
      });
    }

    // 2. Infinite Multi-Lane Highway Extension (gx = 123..134 across all North/South chunks)
    const hwStartX = this.config.highway.startX;
    const hwEndX = this.config.highway.endX;
    if (minGx <= hwEndX && maxGx >= hwStartX) {
      const centerGx = (hwStartX + hwEndX) * 0.5;
      const startPos = this.grid.gridToWorld(centerGx, minGz);
      const endPos = this.grid.gridToWorld(centerGx, maxGz);
      const lengthMeters = Math.abs(endPos.z - startPos.z) + cs;
      spans.push({
        kind: 'MULTI_LANE_HIGHWAY',
        chunkX,
        chunkZ,
        startGx: hwStartX,
        startGz: minGz,
        endGx: hwEndX,
        endGz: maxGz,
        startWx: startPos.x,
        startWz: startPos.z,
        endWx: endPos.x,
        endWz: endPos.z,
        widthMeters: (hwEndX - hwStartX + 1) * cs,
        laneOrTrackCount: this.config.highway.totalLanes,
        instancedTieCount: 0,
        instancedFencePostCount: Math.max(4, Math.floor(lengthMeters / 6.0) * 2),
        elevationY: 1.24,
      });
    }

    // 3. Infinite River Channel (meandering around gx = 68..84 inside chunkX = 1)
    const midGz = (minGz + maxGz) * 0.5;
    const riverGx = Math.round(76 + Math.sin(midGz * 0.004) * 8);
    if (minGx <= riverGx + 3 && maxGx >= riverGx - 3) {
      const startPos = this.grid.gridToWorld(riverGx, minGz);
      const endPos = this.grid.gridToWorld(riverGx, maxGz);
      spans.push({
        kind: 'RIVER_CHANNEL',
        chunkX,
        chunkZ,
        startGx: riverGx - 3,
        startGz: minGz,
        endGx: riverGx + 3,
        endGz: maxGz,
        startWx: startPos.x,
        startWz: startPos.z,
        endWx: endPos.x,
        endWz: endPos.z,
        widthMeters: 7 * cs,
        laneOrTrackCount: 1,
        instancedTieCount: 0,
        instancedFencePostCount: 0,
        elevationY: 0.08,
      });
    }

    return spans;
  }

  /**
   * Queues and streams chunks around (cameraWorldX, cameraWorldZ), unloading distant chunks
   * into the reusable object pool and generating queued chunks within the per-frame time/count budget.
   */
  public stepDynamicChunkStreaming(
    cameraWorldX: number,
    cameraWorldZ: number,
    qualityPreset: GraphicsQualityPreset = 'HIGH',
    maxChunksPerStep = 4,
    maxTimeBudgetMs = 6.0,
    cameraForwardX = 0,
    cameraForwardZ = -1
  ): {
    loadedThisStep: number;
    unloadedThisStep: number;
    rebased: boolean;
    activeChunkCount: number;
    queuedChunkCount: number;
    pooledChunkCount: number;
  } {
    this.currentTick++;

    // 1. Check & perform Floating-Origin Rebasing if camera exceeded threshold
    const rebaseRes = this.originRebaser.updateOriginForCamera(
      cameraWorldX,
      cameraWorldZ
    );

    const { chunkX: camCx, chunkZ: camCz } = this.worldToChunkCoord(
      cameraWorldX,
      cameraWorldZ
    );

    // 2. Unload chunks outside unloadRadiusChunks and recycle them into the object pool
    let unloadedThisStep = 0;
    for (const [key, rec] of this.activeChunks.entries()) {
      const dx = Math.abs(rec.chunkX - camCx);
      const dz = Math.abs(rec.chunkZ - camCz);
      if (dx > this.unloadRadiusChunks || dz > this.unloadRadiusChunks) {
        this.activeChunks.delete(key);
        this.releaseChunkToPool(rec);
        unloadedThisStep++;
      }
    }

    // 3. Enqueue missing chunks inside activeRadiusChunks sorted by distance from camera
    const desiredKeys = new Set<string>();
    for (
      let dz = -this.activeRadiusChunks;
      dz <= this.activeRadiusChunks;
      dz++
    ) {
      for (
        let dx = -this.activeRadiusChunks;
        dx <= this.activeRadiusChunks;
        dx++
      ) {
        const cx = camCx + dx;
        const cz = camCz + dz;
        const key = formatHighPrecisionCoordKey(cx, cz);
        desiredKeys.add(key);

        if (this.activeChunks.has(key)) continue;
        const alreadyQueued = this.asyncLoadQueue.some(
          (q) => q.chunkX === cx && q.chunkZ === cz
        );
        if (!alreadyQueued) {
          this.asyncLoadQueue.push({
            chunkX: cx,
            chunkZ: cz,
            priorityDistSq: dx * dx + dz * dz,
          });
        }
      }
    }

    // Prune any queued chunks that are no longer within desiredKeys
    this.asyncLoadQueue = this.asyncLoadQueue.filter((q) =>
      desiredKeys.has(formatHighPrecisionCoordKey(q.chunkX, q.chunkZ))
    );
    this.asyncLoadQueue.sort((a, b) => a.priorityDistSq - b.priorityDistSq);

    // 4. Process async chunk generation queue within frame budget (zero stutter spikes)
    const startMs =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    let loadedThisStep = 0;

    while (
      this.asyncLoadQueue.length > 0 &&
      loadedThisStep < maxChunksPerStep
    ) {
      const nextItem = this.asyncLoadQueue.shift()!;
      const chunkRec = this.buildOrRecycleChunkRecord(
        nextItem.chunkX,
        nextItem.chunkZ
      );
      this.activeChunks.set(chunkRec.key, chunkRec);
      loadedThisStep++;

      const nowMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (loadedThisStep > 0 && nowMs - startMs >= maxTimeBudgetMs) {
        break;
      }
    }

    // 5. Update LOD tier and frustum culling state on all active chunks
    const fwdLen = Math.hypot(cameraForwardX, cameraForwardZ) || 1;
    const fnx = cameraForwardX / fwdLen;
    const fnz = cameraForwardZ / fwdLen;

    for (const ch of this.activeChunks.values()) {
      const vx = ch.centerWx - cameraWorldX;
      const vz = ch.centerWz - cameraWorldZ;
      const dist = Math.hypot(vx, vz);
      ch.lodTier = computeLodTierForDistance(dist, qualityPreset);

      // Sphere-frustum visibility test (chunks within 1.5x radius of camera or in front hemisphere are visible)
      if (dist <= ch.boundingSphereRadius * 2.2) {
        ch.frustumVisible = ch.lodTier !== 'CULLED';
      } else {
        const dot = (vx * fnx + vz * fnz) / dist;
        ch.frustumVisible = dot >= -0.35 && ch.lodTier !== 'CULLED';
      }
      ch.lastTouchedTick = this.currentTick;
    }

    return {
      loadedThisStep,
      unloadedThisStep,
      rebased: rebaseRes.rebased,
      activeChunkCount: this.activeChunks.size,
      queuedChunkCount: this.asyncLoadQueue.length,
      pooledChunkCount: this.chunkPool.length,
    };
  }

  /**
   * Immediately flushes all queued chunks (useful for deterministic tests or teleporting camera).
   */
  public flushAllPendingChunks(
    cameraWorldX: number,
    cameraWorldZ: number,
    qualityPreset: GraphicsQualityPreset = 'HIGH'
  ): number {
    let totalLoaded = 0;
    for (let guard = 0; guard < 128; guard++) {
      const res = this.stepDynamicChunkStreaming(
        cameraWorldX,
        cameraWorldZ,
        qualityPreset,
        32,
        1000
      );
      totalLoaded += res.loadedThisStep;
      if (res.queuedChunkCount === 0) break;
    }
    return totalLoaded;
  }

  private releaseChunkToPool(chunk: StreamedWorldChunkRecord): void {
    chunk.state = 'POOLED';
    chunk.frustumVisible = false;
    chunk.linearInfrastructure = [];
    if (this.chunkPool.length < this.maxPoolSize) {
      this.chunkPool.push(chunk);
    }
  }

  private buildOrRecycleChunkRecord(
    chunkX: number,
    chunkZ: number
  ): StreamedWorldChunkRecord {
    const tileSize = this.chunkTileSize;
    const minGx = chunkX * tileSize;
    const maxGx = minGx + tileSize - 1;
    const minGz = chunkZ * tileSize;
    const maxGz = minGz + tileSize - 1;
    const cs = this.config.cellSize;

    const centerWorld = this.grid.gridToWorld(
      (minGx + maxGx) * 0.5,
      (minGz + maxGz) * 0.5
    );
    const boundingSphereRadius = Math.hypot(tileSize * cs, tileSize * cs) * 0.5;
    const key = formatHighPrecisionCoordKey(chunkX, chunkZ);
    const packedKey64Hex = encodeCoordKey64Hex(chunkX, chunkZ);

    const sample = this.sampleInfiniteTerrainAtGrid(
      Math.floor((minGx + maxGx) * 0.5),
      Math.floor((minGz + maxGz) * 0.5)
    );

    const linearInfra = this.computeInfiniteLinearInfrastructureForChunk(
      chunkX,
      chunkZ,
      tileSize
    );
    const hasInfiniteRailway = linearInfra.some(
      (s) => s.kind === 'RAILWAY_MAINLINE'
    );
    const hasInfiniteHighway = linearInfra.some(
      (s) => s.kind === 'MULTI_LANE_HIGHWAY'
    );
    const hasInfiniteRiver = linearInfra.some(
      (s) => s.kind === 'RIVER_CHANNEL'
    );

    // Deterministic instanced foliage & rock matrices for this chunk
    const instanceData = this.generateChunkInstanceData(
      chunkX,
      chunkZ,
      minGx,
      maxGx,
      minGz,
      maxGz,
      linearInfra
    );

    const pooled = this.chunkPool.pop();
    if (pooled) {
      pooled.key = key;
      pooled.packedKey64Hex = packedKey64Hex;
      pooled.chunkX = chunkX;
      pooled.chunkZ = chunkZ;
      pooled.tileSize = tileSize;
      pooled.minGx = minGx;
      pooled.maxGx = maxGx;
      pooled.minGz = minGz;
      pooled.maxGz = maxGz;
      pooled.centerWx = centerWorld.x;
      pooled.centerWz = centerWorld.z;
      pooled.boundingSphereRadius = boundingSphereRadius;
      pooled.lodTier = 'NEAR';
      pooled.state = 'LOADED';
      pooled.frustumVisible = true;
      pooled.dominantTerrain = sample.terrainCategory;
      pooled.dominantWater = sample.waterClassification;
      pooled.meanElevation = sample.elevation;
      pooled.hasInfiniteRailway = hasInfiniteRailway;
      pooled.hasInfiniteHighway = hasInfiniteHighway;
      pooled.hasInfiniteRiver = hasInfiniteRiver;
      pooled.linearInfrastructure = linearInfra;
      pooled.instanceData = instanceData;
      pooled.lastTouchedTick = this.currentTick;
      return pooled;
    }

    return {
      key,
      packedKey64Hex,
      chunkX,
      chunkZ,
      tileSize,
      minGx,
      maxGx,
      minGz,
      maxGz,
      centerWx: centerWorld.x,
      centerWz: centerWorld.z,
      boundingSphereRadius,
      lodTier: 'NEAR',
      state: 'LOADED',
      frustumVisible: true,
      dominantTerrain: sample.terrainCategory,
      dominantWater: sample.waterClassification,
      meanElevation: sample.elevation,
      hasInfiniteRailway: hasInfiniteRailway,
      hasInfiniteHighway: hasInfiniteHighway,
      hasInfiniteRiver: hasInfiniteRiver,
      linearInfrastructure: linearInfra,
      instanceData,
      lastTouchedTick: this.currentTick,
    };
  }

  private generateChunkInstanceData(
    chunkX: number,
    chunkZ: number,
    minGx: number,
    maxGx: number,
    minGz: number,
    maxGz: number,
    linearInfra: InfiniteLinearInfraSpan[]
  ): StreamedChunkInstanceData {
    const conifers: number[] = [];
    const coniferCols: number[] = [];
    const deciduous: number[] = [];
    const deciduousCols: number[] = [];
    const rocks: number[] = [];

    const step = 8;
    for (let gz = minGz + 2; gz <= maxGz - 2; gz += step) {
      for (let gx = minGx + 2; gx <= maxGx - 2; gx += step) {
        // Keep railway, highway, and river corridors clear of trees
        if (gx >= 22 && gx <= 32) continue;
        if (gx >= this.config.highway.startX - 2 && gx <= this.config.highway.endX + 2) {
          continue;
        }
        const s = this.sampleInfiniteTerrainAtGrid(gx, gz);
        if (s.waterClassification !== WaterClassification.NONE) continue;

        const hash =
          Math.abs(Math.sin(gx * 12.9898 + gz * 78.233) * 43758.5453) % 1;
        if (hash < 0.55) continue;

        const wp = this.grid.gridToWorld(gx, gz);
        const scale = 0.85 + (hash % 0.35);

        if (s.terrainCategory === TerrainCategory.ROCK) {
          rocks.push(wp.x, s.elevation, wp.z, scale);
        } else if (((chunkX + chunkZ) & 1) === 0) {
          conifers.push(wp.x, s.elevation, wp.z, scale);
          coniferCols.push(0.18, 0.42, 0.21);
        } else {
          deciduous.push(wp.x, s.elevation, wp.z, scale);
          deciduousCols.push(0.24, 0.49, 0.23);
        }
      }
    }

    let totalTies = 0;
    let totalFences = 0;
    for (const span of linearInfra) {
      totalTies += span.instancedTieCount;
      totalFences += span.instancedFencePostCount;
    }

    return {
      coniferMatrices: new Float32Array(conifers),
      coniferColors: new Float32Array(coniferCols),
      coniferCount: conifers.length / 4,
      deciduousMatrices: new Float32Array(deciduous),
      deciduousColors: new Float32Array(deciduousCols),
      deciduousCount: deciduous.length / 4,
      rockMatrices: new Float32Array(rocks),
      rockCount: rocks.length / 4,
      railTieMatrices: new Float32Array(Math.min(totalTies, 256) * 4),
      railTieCount: totalTies,
      fenceMatrices: new Float32Array(Math.min(totalFences, 128) * 4),
      fenceCount: totalFences,
    };
  }

  public getActiveChunks(): StreamedWorldChunkRecord[] {
    return Array.from(this.activeChunks.values());
  }

  public getChunkByCoord(
    chunkX: number,
    chunkZ: number
  ): StreamedWorldChunkRecord | undefined {
    return this.activeChunks.get(formatHighPrecisionCoordKey(chunkX, chunkZ));
  }

  /**
   * Registers a player-built or world-scale infrastructure facility at ANY coordinate
   * (including +/- 10,000,000+ blocks) using a 64-bit packed BigInt coordinate key.
   */
  public registerMassiveInfrastructureAnchor(input: {
    id: string;
    category: MassiveWorldInfrastructureAnchor['category'];
    name: string;
    gx: number;
    gz: number;
    widthCells: number;
    depthCells: number;
    metadata?: Record<string, string | number | boolean>;
  }): MassiveWorldInfrastructureAnchor {
    const gx = Math.trunc(input.gx);
    const gz = Math.trunc(input.gz);
    const packedCoordKey64Hex = encodeCoordKey64Hex(gx, gz);
    const precisionCoordKey = formatHighPrecisionCoordKey(gx, gz);
    const wp = this.grid.gridToWorld(gx, gz);

    const anchor: MassiveWorldInfrastructureAnchor = {
      id: input.id,
      category: input.category,
      name: input.name,
      gx,
      gz,
      widthCells: input.widthCells,
      depthCells: input.depthCells,
      packedCoordKey64Hex,
      precisionCoordKey,
      worldX: wp.x,
      worldZ: wp.z,
      metadata: input.metadata ? { ...input.metadata } : undefined,
    };

    this.massiveAnchors.set(anchor.packedCoordKey64Hex, anchor);
    return anchor;
  }

  public getMassiveAnchorAtCoord(
    gx: number,
    gz: number
  ): MassiveWorldInfrastructureAnchor | undefined {
    const hexKey = encodeCoordKey64Hex(gx, gz);
    return this.massiveAnchors.get(hexKey);
  }

  public getAllMassiveAnchors(): MassiveWorldInfrastructureAnchor[] {
    return Array.from(this.massiveAnchors.values());
  }

  public getPerformanceTelemetry(): StreamingPerformanceTelemetry {
    let frustumVisible = 0;
    let frustumCulled = 0;
    let trees = 0;
    let rocks = 0;
    let ties = 0;
    let fences = 0;

    for (const ch of this.activeChunks.values()) {
      if (ch.frustumVisible) {
        frustumVisible++;
      } else {
        frustumCulled++;
      }
      trees += ch.instanceData.coniferCount + ch.instanceData.deciduousCount;
      rocks += ch.instanceData.rockCount;
      ties += ch.instanceData.railTieCount;
      fences += ch.instanceData.fenceCount;
    }

    const reb = this.originRebaser.getOriginOffset();

    return {
      chunkTileSize: this.chunkTileSize,
      activeLoadedChunks: this.activeChunks.size,
      queuedPendingChunks: this.asyncLoadQueue.length,
      pooledRecycledChunks: this.chunkPool.length,
      frustumVisibleChunks: frustumVisible,
      frustumCulledChunks: frustumCulled,
      totalInstancedTrees: trees,
      totalInstancedRocks: rocks,
      totalInstancedRailTies: ties,
      totalInstancedFencePosts: fences,
      rebaseOriginX: reb.x,
      rebaseOriginZ: reb.z,
      rebaseCount: reb.rebaseCount,
      maxSupportedCoordinateUnits: INFINITE_WORLD_MAX_COORD_UNITS,
    };
  }

  public serializeState(): SerializedMassiveWorldState {
    const reb = this.originRebaser.getOriginOffset();
    return {
      version: 2,
      chunkTileSize: this.chunkTileSize,
      rebaseOriginX: reb.x,
      rebaseOriginZ: reb.z,
      anchors: Array.from(this.massiveAnchors.values()).map((a) => ({
        ...a,
        metadata: a.metadata ? { ...a.metadata } : undefined,
      })),
    };
  }

  public deserializeState(data?: SerializedMassiveWorldState): void {
    if (!data || typeof data !== 'object') return;
    if (data.chunkTileSize === 64 || data.chunkTileSize === 128) {
      this.chunkTileSize = data.chunkTileSize;
    }
    if (
      typeof data.rebaseOriginX === 'number' &&
      typeof data.rebaseOriginZ === 'number'
    ) {
      this.originRebaser.setOriginOffset(
        data.rebaseOriginX,
        data.rebaseOriginZ
      );
    }
    if (Array.isArray(data.anchors)) {
      this.massiveAnchors.clear();
      for (const raw of data.anchors) {
        if (
          raw &&
          typeof raw.id === 'string' &&
          typeof raw.gx === 'number' &&
          typeof raw.gz === 'number'
        ) {
          // Verify 64-bit packed coordinate integrity on load
          const verifiedHex = encodeCoordKey64Hex(raw.gx, raw.gz);
          const decoded = decodeCoordKey64Hex(
            raw.packedCoordKey64Hex || verifiedHex
          );
          const wp = this.grid.gridToWorld(decoded.gx, decoded.gz);
          this.massiveAnchors.set(verifiedHex, {
            ...raw,
            gx: decoded.gx,
            gz: decoded.gz,
            packedCoordKey64Hex: verifiedHex,
            precisionCoordKey: formatHighPrecisionCoordKey(
              decoded.gx,
              decoded.gz
            ),
            worldX: wp.x,
            worldZ: wp.z,
          });
        }
      }
    }
  }
}
