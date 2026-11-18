/**
 * Authoritative Terrain, Water, Forest & Chunk System (Master Prompts 1, 2, 5 & Extreme World Expansion).
 * Stores logical elevation, terrain category, water classification, river paths,
 * lakes, ocean, natural coastlines, islands, organic forest regions, and terrain chunk metadata
 * independently of Three.js meshes.
 */

import { GridCoord, GridSystem } from './GridSystem';
import {
  TerrainCategory,
  WaterClassification,
  WorldConfigData,
  ZoneCategory,
} from './WorldConfig';

export enum ForestDensityLevel {
  NONE = 0,
  SCATTERED = 1,
  MEDIUM_WOODLAND = 2,
  DENSE_FOREST = 3,
}

export type ForestSpeciesMix =
  | 'PINE_CONIFER'
  | 'DECIDUOUS_BROADLEAF'
  | 'MIXED_WOODLAND'
  | 'HIGHLAND_ALPINE';

export interface ForestRegionRecord {
  id: string;
  name: string;
  speciesMix: ForestSpeciesMix;
  centerGx: number;
  centerGz: number;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  coreCellCount: number;
  transitionCellCount: number;
  totalCellCount: number;
}

export interface TerrainChunkMetadata {
  id: string;
  chunkX: number;
  chunkZ: number;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  centerWx: number;
  centerWz: number;
  minElevation: number;
  maxElevation: number;
  landCellCount: number;
  waterCellCount: number;
  forestCellCount: number;
}

export interface RiverPathNode {
  gx: number;
  gz: number;
  wx: number;
  wz: number;
  widthCells: number;
  widthWorld: number;
}

export interface RiverRecord {
  id: string;
  name: string;
  sourceWaterBodyId: string;
  destinationWaterBodyId: string;
  nodes: RiverPathNode[];
  cells: GridCoord[];
}

export interface LakeRecord {
  id: string;
  name: string;
  centerGx: number;
  centerGz: number;
  cells: GridCoord[];
  shorelineCells: GridCoord[];
  connectedRiverIds: string[];
}

export interface IslandRecord {
  id: string;
  name: string;
  centerGx: number;
  centerGz: number;
  landCells: GridCoord[];
  shorelineCells: GridCoord[];
  surroundingWaterId: string;
}

export interface OceanRecord {
  id: string;
  name: string;
  cellsCount: number;
  coastlineCells: GridCoord[];
  islandIds: string[];
}

interface ForestSeedDef {
  id: string;
  name: string;
  speciesMix: ForestSpeciesMix;
  centerGx: number;
  centerGz: number;
  radiusX: number;
  radiusZ: number;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
}

const FOREST_REGION_DEFS: ForestSeedDef[] = [
  {
    id: 'forest-whispering-pines',
    name: 'Whispering Pine Northern Woods',
    speciesMix: 'PINE_CONIFER',
    centerGx: 26,
    centerGz: 11,
    radiusX: 24,
    radiusZ: 11,
    minGx: 2,
    maxGx: 52,
    minGz: 1,
    maxGz: 26,
  },
  {
    id: 'forest-northridge-highlands',
    name: 'Northridge Highland Forest',
    speciesMix: 'HIGHLAND_ALPINE',
    centerGx: 124,
    centerGz: 14,
    radiusX: 21,
    radiusZ: 12,
    minGx: 105,
    maxGx: 146,
    minGz: 2,
    maxGz: 29,
  },
  {
    id: 'forest-silverpine-woods',
    name: 'Silverpine Eastern Timberlands',
    speciesMix: 'MIXED_WOODLAND',
    centerGx: 292,
    centerGz: 48,
    radiusX: 58,
    radiusZ: 42,
    minGx: 204,
    maxGx: 354,
    minGz: 6,
    maxGz: 96,
  },
  {
    id: 'forest-emerald-valley-groves',
    name: 'Emerald Valley & Riverbend Woods',
    speciesMix: 'DECIDUOUS_BROADLEAF',
    centerGx: 284,
    centerGz: 152,
    radiusX: 64,
    radiusZ: 44,
    minGx: 202,
    maxGx: 352,
    minGz: 102,
    maxGz: 202,
  },
  {
    id: 'forest-southshore-woodlands',
    name: 'Southshore Peninsula Woodlands',
    speciesMix: 'MIXED_WOODLAND',
    centerGx: 168,
    centerGz: 166,
    radiusX: 34,
    radiusZ: 28,
    minGx: 134,
    maxGx: 202,
    minGz: 132,
    maxGz: 202,
  },
  // Cardinal Four-Direction Expansion Forest Regions (+121,600 Grid Blocks)
  {
    id: 'forest-boreal-expanse',
    name: 'Northern Boreal Timber Expanse',
    speciesMix: 'PINE_CONIFER',
    centerGx: 175,
    centerGz: -42,
    radiusX: 235,
    radiusZ: 36,
    minGx: -72,
    maxGx: 425,
    minGz: -74,
    maxGz: -2,
  },
  {
    id: 'forest-western-timberlands',
    name: 'Western Frontier Timberlands',
    speciesMix: 'MIXED_WOODLAND',
    centerGx: -42,
    centerGz: 88,
    radiusX: 36,
    radiusZ: 112,
    minGx: -74,
    maxGx: -2,
    minGz: -24,
    maxGz: 204,
  },
  {
    id: 'forest-eastern-highwoods',
    name: 'Eastern Highwood Ridge Forest',
    speciesMix: 'HIGHLAND_ALPINE',
    centerGx: 398,
    centerGz: 108,
    radiusX: 38,
    radiusZ: 136,
    minGx: 356,
    maxGx: 432,
    minGz: -38,
    maxGz: 248,
  },
  {
    id: 'forest-southern-cape-woods',
    name: 'Southern Cape Headland Woods',
    speciesMix: 'DECIDUOUS_BROADLEAF',
    centerGx: 354,
    centerGz: 248,
    radiusX: 74,
    radiusZ: 32,
    minGx: 276,
    maxGx: 430,
    minGz: 214,
    maxGz: 278,
  },
];

export interface ClearedForestBoundsRecord {
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
}

export class TerrainWaterSystem {
  private config: WorldConfigData;
  private grid: GridSystem;
  private coreMinGx: number;
  private coreMaxGx: number;
  private coreMinGz: number;
  private coreMaxGz: number;
  private coreWidth: number;
  private coreDepth: number;
  private elevation: Float32Array;
  private coastalDist: Float32Array;
  private terrainCat: Uint8Array;
  private waterClass: Uint8Array;
  private coastlineFlags: Uint8Array;
  private forestDensity: Uint8Array;
  private forestRegionIdx: Uint8Array;
  private clearedForestBounds: ClearedForestBoundsRecord[] = [];

  private rivers: Map<string, RiverRecord> = new Map();
  private lakes: Map<string, LakeRecord> = new Map();
  private islands: Map<string, IslandRecord> = new Map();
  private forestRegions: Map<string, ForestRegionRecord> = new Map();
  private chunks: TerrainChunkMetadata[] = [];
  private ocean!: OceanRecord;

  constructor(config: WorldConfigData, grid: GridSystem) {
    this.config = config;
    this.grid = grid;
    this.coreMinGx = config.coreMinGx ?? -80;
    this.coreMaxGx = config.coreMaxGx ?? 439;
    this.coreMinGz = config.coreMinGz ?? -80;
    this.coreMaxGz = config.coreMaxGz ?? 319;
    this.coreWidth = this.coreMaxGx - this.coreMinGx + 1;
    this.coreDepth = this.coreMaxGz - this.coreMinGz + 1;
    const total = this.coreWidth * this.coreDepth;
    this.elevation = new Float32Array(total);
    this.coastalDist = new Float32Array(total);
    this.terrainCat = new Uint8Array(total);
    this.waterClass = new Uint8Array(total);
    this.coastlineFlags = new Uint8Array(total);
    this.forestDensity = new Uint8Array(total);
    this.forestRegionIdx = new Uint8Array(total);
    this.generateDeterministicGeography();
  }

  private getCoreCellIndex(gx: number, gz: number): number {
    if (
      gx < this.coreMinGx ||
      gx > this.coreMaxGx ||
      gz < this.coreMinGz ||
      gz > this.coreMaxGz
    ) {
      return -1;
    }
    return (gz - this.coreMinGz) * this.coreWidth + (gx - this.coreMinGx);
  }

  /**
   * Deterministic trigonometric hash for repeatable natural variation based on seed.
   */
  private pseudoNoise(x: number, z: number): number {
    const s = this.config.seed * 0.0001;
    const v1 = Math.sin(x * 0.07 + s) * Math.cos(z * 0.07 - s);
    const v2 = Math.sin((x + z) * 0.13 + s * 1.7) * 0.5;
    const v3 = Math.cos(x * 0.21 - z * 0.19) * 0.25;
    return (v1 + v2 + v3) / 1.75; // Normalized in [-1, 1]
  }

  /**
   * Multi-frequency organic forest noise used for irregular woodland edges and natural clearings.
   */
  private forestNoise(gx: number, gz: number): number {
    const s = (this.config.seed % 1000) * 0.017;
    const low = Math.sin(gx * 0.085 + s) * Math.cos(gz * 0.09 - s * 0.7);
    const mid = Math.sin((gx - gz) * 0.16 + 1.1) * 0.45;
    const high = Math.cos(gx * 0.31 + gz * 0.29) * 0.25;
    return (low + mid + high) / 1.7;
  }

  /**
   * Computes the continuous, organic southern coastline Z threshold for the unified mainland peninsula
   * across all four cardinal expansion directions:
   * - Western Frontier Peninsula (gx < 0) sweeps south to gz ~ 216 (and further south across continental bays)
   * - Central Harbor Bay (0 <= gx <= 128) stays at gz ~ 98..101 (preserving Warehouse 1 and Port Harbour)
   * - Eastern Mainland Peninsula (129 <= gx <= 268) extends down to gz ~ 210
   * - Southeastern Cape Headlands (gx > 268) sweep south into the South Expansion up to gz ~ 282..540
   */
  public getNaturalCoastlineZ(gx: number): number {
    const pt = this.config.port;

    // Western Frontier Cape transition (gx < 0 sweeps smoothly from coastZ ~ 98 at gx=0 down to ~214..420 in the West)
    if (gx < 0) {
      const westT = Math.min(1, Math.max(0, -gx / 24));
      const westSmooth =
        westT * westT * westT * (westT * (westT * 6 - 15) + 10);
      const coreEdgeZ =
        97.8 +
        2.4 * Math.sin(0 * 0.055 + 0.4) +
        1.25 * Math.cos(0 * 0.105 - 0.8);
      const outerContinentalWave =
        gx < -120
          ? 85.0 * Math.sin((gx + 120) * 0.0045) +
            32.0 * Math.cos((gx - 40) * 0.012)
          : 0;
      const westCapeZ =
        214.0 +
        outerContinentalWave +
        3.4 * Math.sin(gx * 0.048 - 0.5) +
        1.8 * Math.cos(gx * 0.092 + 0.3);
      return coreEdgeZ + (westCapeZ - coreEdgeZ) * westSmooth;
    }

    if (gx <= 128) {
      // Base curving coastline with gentle natural bays and headlands
      let coastZ =
        97.8 +
        2.4 * Math.sin(gx * 0.055 + 0.4) +
        1.25 * Math.cos(gx * 0.105 - 0.8);

      // 0. Ensure Warehouse 1 25x30 reserved property (gx 35..59, gz 67..96) has dry land + wide sandy beach buffer
      if (gx >= 32 && gx <= 61) {
        coastZ = Math.max(coastZ, 98.6 + 0.3 * Math.sin(gx * 0.15));
      }

      // 1. Lower-side land correction around the port (gx 74..82 extends down to gz 101)
      if (gx >= pt.lowerLandStartX && gx <= pt.lowerLandEndX) {
        const t =
          1 -
          Math.abs(
            (gx - (pt.lowerLandStartX + pt.lowerLandEndX) * 0.5) /
              ((pt.lowerLandEndX - pt.lowerLandStartX) * 0.5 + 1)
          );
        coastZ = Math.max(coastZ, 99.5 + t * 2.0);
      }

      // 2. Port Harbour Quay front (gx 82..98): clean direct water interface at gz = 98
      if (gx >= pt.startX && gx <= pt.endX) {
        coastZ = pt.endZ + 0.2; // Land up to gz=98, Ocean starts at gz=99
      }

      // 3. Small triangular seaport land headland beside the port (gx 99..106)
      if (
        gx >= pt.triangularHeadlandStartX &&
        gx <= pt.triangularHeadlandEndX
      ) {
        const span =
          pt.triangularHeadlandEndX - pt.triangularHeadlandStartX + 1;
        const progress = (gx - pt.triangularHeadlandStartX) / span; // 0 at port edge -> 1 at tip
        const triangleApexZ = pt.triangularHeadlandEndZ - progress * 4.5;
        coastZ = Math.max(coastZ, triangleApexZ);
      }

      return coastZ;
    }

    // Smooth quintic coastal curve from gx=128 (coastZ ~ 99) sweeping south around the Harbor Bay
    // to form the unified Southern & Eastern Mainland Peninsula extending down to gz ~ 210
    const transitionT = Math.min(1, Math.max(0, (gx - 128) / 36));
    const smoothStep =
      transitionT *
      transitionT *
      transitionT *
      (transitionT * (transitionT * 6 - 15) + 10);
    const baseWestZ =
      97.8 +
      2.4 * Math.sin(128 * 0.055 + 0.4) +
      1.25 * Math.cos(128 * 0.105 - 0.8);
    let eastCoastZ =
      210.2 +
      3.6 * Math.sin(gx * 0.042 + 0.6) +
      1.9 * Math.cos(gx * 0.088 - 0.5);

    // In the far Southeastern Cape (gx >= 268), extend headland south into the Southern Expansion (up to gz ~ 282+)
    if (gx > 268 && this.grid.getMaxGz() >= 280) {
      const capeT = Math.min(1, Math.max(0, (gx - 268) / 36));
      const capeSmooth =
        capeT * capeT * capeT * (capeT * (capeT * 6 - 15) + 10);
      const farEastContinentalWave =
        gx > 460
          ? 110.0 * Math.sin((gx - 460) * 0.0042) +
            38.0 * Math.cos((gx - 300) * 0.011)
          : 0;
      const southCapeZ =
        282.0 +
        farEastContinentalWave +
        4.2 * Math.sin(gx * 0.038 + 0.2) +
        2.1 * Math.cos(gx * 0.075 - 0.7);
      eastCoastZ = eastCoastZ + (southCapeZ - eastCoastZ) * capeSmooth;
    }

    return baseWestZ + (eastCoastZ - baseWestZ) * smoothStep;
  }

  /**
   * Deprecated separate southern block — now unified directly into getNaturalCoastlineZ(gx)
   * so no rectangular water canal cuts across the landmass.
   */
  private isSouthshorePeninsulaLand(_gx: number, _gz: number): boolean {
    return false;
  }

  /**
   * Evaluates whether (gx, gz) belongs to a natural island in the Southern Sapphire Sea.
   */
  private evaluateIslandMembership(
    gx: number,
    gz: number
  ):
    | 'island-haven'
    | 'island-crest'
    | 'island-sentinel'
    | 'island-horizon'
    | null {
    // Island 1: Haven Island (southwest bay around gx=38, gz=109)
    {
      const cx = 38;
      const cz = 109.5;
      const dx = (gx - cx) / 8.2;
      const dz = (gz - cz) / 4.6;
      const angle = Math.atan2(dz, dx);
      const rMod =
        1.0 +
        0.14 * Math.sin(angle * 3 + 0.7) +
        0.09 * Math.cos(angle * 5 - 0.4);
      if (dx * dx + dz * dz <= rMod * rMod) {
        return 'island-haven';
      }
    }

    // Island 2: Crest Island (southeast bay around gx=118, gz=109)
    {
      const cx = 118;
      const cz = 109.5;
      const dx = (gx - cx) / 8.8;
      const dz = (gz - cz) / 4.5;
      const angle = Math.atan2(dz, dx);
      const rMod =
        1.0 +
        0.15 * Math.cos(angle * 3 - 0.5) +
        0.1 * Math.sin(angle * 4 + 1.1);
      if (dx * dx + dz * dz <= rMod * rMod) {
        return 'island-crest';
      }
    }

    // Island 3: Sentinel Island (outer southeastern sea around gx=248, gz=226)
    if (this.config.gridWidth >= 280 && this.config.gridDepth >= 235) {
      const cx = 248;
      const cz = 226.5;
      const dx = (gx - cx) / 11.5;
      const dz = (gz - cz) / 5.4;
      const angle = Math.atan2(dz, dx);
      const rMod =
        1.0 +
        0.15 * Math.sin(angle * 3 + 0.4) +
        0.08 * Math.cos(angle * 5 - 0.6);
      if (dx * dx + dz * dz <= rMod * rMod) {
        return 'island-sentinel';
      }
    }

    // Island 4: Horizon Island (outer southwestern sea around gx=82, gz=226)
    if (this.config.gridDepth >= 235) {
      const cx = 82;
      const cz = 226.5;
      const dx = (gx - cx) / 10.2;
      const dz = (gz - cz) / 5.2;
      const angle = Math.atan2(dz, dx);
      const rMod =
        1.0 +
        0.14 * Math.cos(angle * 3 + 0.9) +
        0.09 * Math.sin(angle * 4 - 0.3);
      if (dx * dx + dz * dz <= rMod * rMod) {
        return 'island-horizon';
      }
    }

    return null;
  }

  /**
   * Evaluates whether (gx, gz) belongs to a natural lake across the core and four cardinal expansion regions.
   */
  private evaluateLakeMembership(
    gx: number,
    gz: number
  ):
    | 'lake-emerald'
    | 'lake-silverpine'
    | 'lake-boreal'
    | 'lake-westwood'
    | 'lake-eastgate'
    | null {
    // 1. Original Emerald Highland Lake (gx=63.5, gz=16.5)
    {
      const cx = 63.5;
      const cz = 16.5;
      const dx = (gx - cx) / 8.5;
      const dz = (gz - cz) / 6.2;
      const angle = Math.atan2(dz, dx);
      const rMod =
        1.0 +
        0.16 * Math.sin(angle * 3 + 0.3) +
        0.1 * Math.cos(angle * 4 - 0.9);
      if (dx * dx + dz * dz <= rMod * rMod) {
        return 'lake-emerald';
      }
    }

    // 2. Expanded Silverpine Highland Lake in the northeastern basin (gx=256, gz=34)
    if (this.grid.getMaxGx() >= 275) {
      const cx = 256.0;
      const cz = 34.0;
      const dx = (gx - cx) / 12.5;
      const dz = (gz - cz) / 8.2;
      const angle = Math.atan2(dz, dx);
      const rMod =
        1.0 +
        0.18 * Math.sin(angle * 3 - 0.4) +
        0.11 * Math.cos(angle * 5 + 0.7);
      if (dx * dx + dz * dz <= rMod * rMod) {
        return 'lake-silverpine';
      }
    }

    // 3. Northern Expansion: Boreal Crater Lake (gx=148, gz=-44)
    if (this.grid.getMinGz() <= -60) {
      const cx = 148.0;
      const cz = -44.0;
      const dx = (gx - cx) / 13.5;
      const dz = (gz - cz) / 8.5;
      const angle = Math.atan2(dz, dx);
      const rMod =
        1.0 +
        0.17 * Math.sin(angle * 3 + 0.5) +
        0.1 * Math.cos(angle * 4 - 0.6);
      if (dx * dx + dz * dz <= rMod * rMod) {
        return 'lake-boreal';
      }
    }

    // 4. Western Expansion: Westwood Frontier Lake (gx=-44, gz=32)
    if (this.grid.getMinGx() <= -60) {
      const cx = -44.0;
      const cz = 32.0;
      const dx = (gx - cx) / 11.5;
      const dz = (gz - cz) / 8.0;
      const angle = Math.atan2(dz, dx);
      const rMod =
        1.0 +
        0.16 * Math.cos(angle * 3 + 0.4) +
        0.11 * Math.sin(angle * 5 - 0.5);
      if (dx * dx + dz * dz <= rMod * rMod) {
        return 'lake-westwood';
      }
    }

    // 5. Eastern Expansion: Eastgate Alpine Lake (gx=398, gz=54)
    if (this.grid.getMaxGx() >= 420) {
      const cx = 398.0;
      const cz = 54.0;
      const dx = (gx - cx) / 12.0;
      const dz = (gz - cz) / 8.4;
      const angle = Math.atan2(dz, dx);
      const rMod =
        1.0 +
        0.15 * Math.sin(angle * 3 - 0.7) +
        0.1 * Math.cos(angle * 4 + 0.6);
      if (dx * dx + dz * dz <= rMod * rMod) {
        return 'lake-eastgate';
      }
    }

    return null;
  }

  /**
   * Computes the continuous river centerline X and width at a given Z coordinate for the primary Serpentine Valley River.
   * Flows continuously from Emerald Lake (gz=20) down to the Southern Ocean (gz=99),
   * staying strictly between the Logistics/Industrial region (gx<=60) and Core City (gx>=70).
   */
  public getRiverCenterAndWidthAtZ(gz: number): {
    centerX: number;
    widthCells: number;
  } | null {
    if (gz < 20 || gz > 99) return null;
    const t = (gz - 20) / (99 - 20);
    // Smooth S-bend centered around gx = 65.0 (keeping [62..68] clear of gx<=60 and gx>=70)
    const wave =
      1.65 * Math.sin(t * Math.PI * 2.5 - 0.3) +
      0.65 * Math.cos(t * Math.PI * 4.0);
    const centerX = 65.0 + wave;
    // Gradual width widening from 3.4 cells at lake outlet into a smooth coastal estuary (up to 5.35 cells) at sea mouth
    const estuaryFlare =
      gz > 84 ? Math.pow((gz - 84) / 15, 1.5) * 0.8 : 0;
    const widthCells = 3.4 + t * 1.15 + estuaryFlare;
    return { centerX, widthCells };
  }

  /**
   * Computes the continuous river centerline X and width at a given Z coordinate for the eastern Silverpine Valley River.
   * Flows continuously from Silverpine Highland Lake (gz=40) through the eastern valley to the Southern Sea (gz=213).
   */
  public getSilverpineRiverCenterAndWidthAtZ(gz: number): {
    centerX: number;
    widthCells: number;
  } | null {
    if (this.grid.getMaxGx() < 275) return null;
    const maxEndZ = Math.min(this.grid.getMaxGz(), 214);
    if (gz < 40 || gz > maxEndZ) return null;
    const t = (gz - 40) / Math.max(1, maxEndZ - 40);
    const wave =
      7.5 * Math.sin(t * Math.PI * 2.2 + 0.25) +
      2.8 * Math.cos(t * Math.PI * 4.5 - 0.4);
    const centerX = 256.0 + wave;
    const widthCells = 3.6 + t * 1.8;
    return { centerX, widthCells };
  }

  /**
   * Computes the continuous river centerline X and width at a given Z coordinate for the Northern Boreal River.
   * Flows from Boreal Crater Lake (gx=148, gz=-38) winding Southwest into Emerald Highland Lake (gx=64, gz=14).
   */
  public getBorealRiverCenterAndWidthAtZ(gz: number): {
    centerX: number;
    widthCells: number;
  } | null {
    if (this.grid.getMinGz() > -60) return null;
    if (gz < -38 || gz > 14) return null;
    const t = (gz - -38) / (14 - -38);
    const baseLineX = 148.0 + (64.0 - 148.0) * t;
    const wave =
      5.2 * Math.sin(t * Math.PI * 2.0) +
      1.8 * Math.cos(t * Math.PI * 4.0 - 0.3);
    const centerX = baseLineX + wave * Math.sin(t * Math.PI);
    const widthCells = 3.2 + t * 0.8;
    return { centerX, widthCells };
  }

  /**
   * Computes the continuous river centerline X and width at a given Z coordinate for the Western Westwood Frontier River.
   * Flows from Westwood Frontier Lake (gx=-44, gz=38) winding South through the Western Valley to the Southern Sea (gz=216).
   */
  public getWestwoodRiverCenterAndWidthAtZ(gz: number): {
    centerX: number;
    widthCells: number;
  } | null {
    if (this.grid.getMinGx() > -60) return null;
    const maxEndZ = Math.min(this.grid.getMaxGz(), 216);
    if (gz < 38 || gz > maxEndZ) return null;
    const t = (gz - 38) / Math.max(1, maxEndZ - 38);
    const wave =
      6.4 * Math.sin(t * Math.PI * 2.4 - 0.2) +
      2.2 * Math.cos(t * Math.PI * 4.2 + 0.5);
    const centerX = -44.0 + wave;
    const widthCells = 3.4 + t * 1.6;
    return { centerX, widthCells };
  }

  /**
   * Computes the continuous river centerline X and width at a given Z coordinate for the 5th and final major river:
   * the Eastern Eastgate Alpine River, flowing from Eastgate Alpine Lake (gx=398, gz=60) down to the Southern Sea (gz=283).
   * Together with Serpentine, Silverpine, Boreal, and Westwood, this satisfies the Strict 5-River Rule across the 20.3M-block world.
   */
  public getEastgateRiverCenterAndWidthAtZ(gz: number): {
    centerX: number;
    widthCells: number;
  } | null {
    if (this.grid.getMaxGx() < 420) return null;
    const maxEndZ = Math.min(this.grid.getMaxGz(), 283);
    if (gz < 60 || gz > maxEndZ) return null;
    const t = (gz - 60) / Math.max(1, maxEndZ - 60);
    const wave =
      8.2 * Math.sin(t * Math.PI * 2.3 + 0.35) +
      2.6 * Math.cos(t * Math.PI * 4.1 - 0.5);
    const centerX = 398.0 + wave;
    const widthCells = 3.5 + t * 1.9;
    return { centerX, widthCells };
  }

  /**
   * Checks whether (gx, gz) is inside or within a safety buffer of any reserved infrastructure corridor
   * so forests never spawn on roads, railways, cities, ports, warehouses, or airports.
   */
  private isReservedInfrastructureEnvelope(gx: number, gz: number): boolean {
    const rc = this.config.railCorridor;
    const cc = this.config.coreCity;
    const hw = this.config.highway;
    const pt = this.config.port;
    const ap = this.config.airport;
    const aw = this.config.airportWarehouse;
    const at = this.config.airportTransferYard;

    // Rail corridor + buffer
    if (
      gx >= rc.startX - 3 &&
      gx <= rc.endX + 3 &&
      gz >= rc.minZ - 2 &&
      gz <= rc.maxZ + 2
    ) {
      return true;
    }
    // Logistics West, Industrial Basin & Warehouse 1 (gx 34..62, gz 30..98)
    if (gx >= 33 && gx <= 62 && gz >= 30 && gz <= 98) {
      return true;
    }
    // Core City, Midtown Commercial & Expanded Metro blocks (gx 68..136, gz 32..88)
    if (gx >= cc.startX - 2 && gx <= 136 && gz >= 31 && gz <= 88) {
      return true;
    }
    // Port Harbour & coastal approach
    if (
      gx >= pt.lowerLandStartX - 2 &&
      gx <= pt.triangularHeadlandEndX + 2 &&
      gz >= pt.startZ - 3 &&
      gz <= pt.lowerLandEndZ + 1
    ) {
      return true;
    }
    // 10-Lane Highway corridor + Roundabout-to-Airport Access Road (gz 52..58)
    if (
      gx >= hw.startX - 4 &&
      gx <= hw.endX + 4 &&
      gz >= hw.visibleStartZ - 3 &&
      gz <= hw.visibleEndZ + 3
    ) {
      return true;
    }
    if (gx >= hw.startX - 4 && gx <= ap.endX + 4 && gz >= 51 && gz <= 59) {
      return true;
    }
    // 50x70 Regional Cargo Airport + 10x10 Warehouse + 10x10 Transfer Yard + Hangar/Road envelope
    if (
      gx >= ap.startX - 5 &&
      gx <= ap.endX + 4 &&
      gz >= ap.startZ - 2 &&
      gz <= Math.max(ap.endZ, aw.endZ, at.endZ) + 5
    ) {
      return true;
    }
    return false;
  }

  /**
   * Deterministically generates the core 520x400 logical geography, 5 major rivers, lakes, islands,
   * organic forest regions, and chunk metadata while supporting on-demand evaluation across all 20,300,000 grid blocks.
   */
  public generateDeterministicGeography(): void {
    this.coreMinGx = this.config.coreMinGx ?? -80;
    this.coreMaxGx = this.config.coreMaxGx ?? 439;
    this.coreMinGz = this.config.coreMinGz ?? -80;
    this.coreMaxGz = this.config.coreMaxGz ?? 319;
    this.coreWidth = this.coreMaxGx - this.coreMinGx + 1;
    this.coreDepth = this.coreMaxGz - this.coreMinGz + 1;

    const w = this.coreWidth;
    const d = this.coreDepth;
    const minGx = this.coreMinGx;
    const maxGx = this.coreMaxGx;
    const minGz = this.coreMinGz;
    const maxGz = this.coreMaxGz;
    const total = w * d;

    this.elevation = new Float32Array(total);
    this.coastalDist = new Float32Array(total);
    this.terrainCat = new Uint8Array(total);
    this.waterClass = new Uint8Array(total);
    this.coastlineFlags = new Uint8Array(total);
    this.forestDensity = new Uint8Array(total);
    this.forestRegionIdx = new Uint8Array(total);

    this.rivers.clear();
    this.lakes.clear();
    this.islands.clear();
    this.forestRegions.clear();
    this.chunks = [];

    const lakeEmeraldCells: GridCoord[] = [];
    const lakeSilverpineCells: GridCoord[] = [];
    const lakeBorealCells: GridCoord[] = [];
    const lakeWestwoodCells: GridCoord[] = [];
    const lakeEastgateCells: GridCoord[] = [];
    const islandHavenCells: GridCoord[] = [];
    const islandCrestCells: GridCoord[] = [];
    const islandSentinelCells: GridCoord[] = [];
    const islandHorizonCells: GridCoord[] = [];
    let oceanCellCount = 0;

    // Step 1: Classify primary Land, Ocean, Islands, and Lakes across core [minGx..maxGx, minGz..maxGz]
    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const idx = (gz - minGz) * w + (gx - minGx);
        const coastZ = this.getNaturalCoastlineZ(gx);
        const isMainlandNorthOrEast = gz <= coastZ;
        const isSouthPeninsula = this.isSouthshorePeninsulaLand(gx, gz);

        if (!isMainlandNorthOrEast && !isSouthPeninsula) {
          // Check if part of a natural island in the sea
          const islandId = this.evaluateIslandMembership(gx, gz);
          if (islandId === 'island-haven') {
            this.waterClass[idx] = WaterClassification.NONE;
            islandHavenCells.push({ gx, gz });
          } else if (islandId === 'island-crest') {
            this.waterClass[idx] = WaterClassification.NONE;
            islandCrestCells.push({ gx, gz });
          } else if (islandId === 'island-sentinel') {
            this.waterClass[idx] = WaterClassification.NONE;
            islandSentinelCells.push({ gx, gz });
          } else if (islandId === 'island-horizon') {
            this.waterClass[idx] = WaterClassification.NONE;
            islandHorizonCells.push({ gx, gz });
          } else {
            this.waterClass[idx] = WaterClassification.OCEAN;
            this.terrainCat[idx] = TerrainCategory.SUBMERGED;
            this.elevation[idx] = -1.8;
            oceanCellCount++;
          }
        } else {
          const lakeId = this.evaluateLakeMembership(gx, gz);
          if (lakeId === 'lake-emerald') {
            this.waterClass[idx] = WaterClassification.LAKE;
            this.terrainCat[idx] = TerrainCategory.SUBMERGED;
            this.elevation[idx] = -1.2;
            lakeEmeraldCells.push({ gx, gz });
          } else if (lakeId === 'lake-silverpine') {
            this.waterClass[idx] = WaterClassification.LAKE;
            this.terrainCat[idx] = TerrainCategory.SUBMERGED;
            this.elevation[idx] = -1.3;
            lakeSilverpineCells.push({ gx, gz });
          } else if (lakeId === 'lake-boreal') {
            this.waterClass[idx] = WaterClassification.LAKE;
            this.terrainCat[idx] = TerrainCategory.SUBMERGED;
            this.elevation[idx] = -1.35;
            lakeBorealCells.push({ gx, gz });
          } else if (lakeId === 'lake-westwood') {
            this.waterClass[idx] = WaterClassification.LAKE;
            this.terrainCat[idx] = TerrainCategory.SUBMERGED;
            this.elevation[idx] = -1.25;
            lakeWestwoodCells.push({ gx, gz });
          } else if (lakeId === 'lake-eastgate') {
            this.waterClass[idx] = WaterClassification.LAKE;
            this.terrainCat[idx] = TerrainCategory.SUBMERGED;
            this.elevation[idx] = -1.3;
            lakeEastgateCells.push({ gx, gz });
          } else {
            this.waterClass[idx] = WaterClassification.NONE;
          }
        }
      }
    }

    // Helper to carve a river along a Z range
    const carveRiverAlongZ = (
      startZ: number,
      endZ: number,
      evalFn: (gz: number) => { centerX: number; widthCells: number } | null,
      depthY: number
    ): { nodes: RiverPathNode[]; cells: GridCoord[] } => {
      const nodes: RiverPathNode[] = [];
      const cells: GridCoord[] = [];
      const cellSet = new Set<string>();
      const clampedStartZ = Math.max(minGz, startZ);
      const clampedEndZ = Math.min(maxGz, endZ);

      for (let gz = clampedStartZ; gz <= clampedEndZ; gz++) {
        const info = evalFn(gz);
        if (!info) continue;
        const worldPos = this.grid.gridToWorld(info.centerX, gz);
        nodes.push({
          gx: info.centerX,
          gz,
          wx: worldPos.x,
          wz: worldPos.z,
          widthCells: info.widthCells,
          widthWorld: info.widthCells * this.config.cellSize,
        });

        const halfW = info.widthCells * 0.5;
        const minRx = Math.max(minGx, Math.floor(info.centerX - halfW));
        const maxRx = Math.min(maxGx, Math.ceil(info.centerX + halfW));

        for (let gx = minRx; gx <= maxRx; gx++) {
          if (Math.abs(gx - info.centerX) <= halfW) {
            const idx = (gz - minGz) * w + (gx - minGx);
            if (this.waterClass[idx] === WaterClassification.NONE) {
              this.waterClass[idx] = WaterClassification.RIVER;
            }
            this.terrainCat[idx] = TerrainCategory.SUBMERGED;
            this.elevation[idx] = depthY;
            const key = `${gx},${gz}`;
            if (!cellSet.has(key)) {
              cellSet.add(key);
              cells.push({ gx, gz });
            }
          }
        }
      }
      return { nodes, cells };
    };

    // Step 2A: Carve continuous Serpentine Valley River from Emerald Lake (gz=20) to Southern Ocean (gz=99)
    const serpentineCarved = carveRiverAlongZ(
      20,
      99,
      (gz) => this.getRiverCenterAndWidthAtZ(gz),
      -1.1
    );

    // Step 2B: Carve continuous Silverpine Valley River in the expanded eastern continent (gz=40..214)
    const silverpineCarved =
      maxGx >= 275
        ? carveRiverAlongZ(
            40,
            214,
            (gz) => this.getSilverpineRiverCenterAndWidthAtZ(gz),
            -1.15
          )
        : { nodes: [], cells: [] };

    // Step 2C: Carve Northern Boreal River (gz=-38..14) from Boreal Crater Lake into Emerald Highland Lake
    const borealCarved =
      minGz <= -60
        ? carveRiverAlongZ(
            -38,
            14,
            (gz) => this.getBorealRiverCenterAndWidthAtZ(gz),
            -1.12
          )
        : { nodes: [], cells: [] };

    // Step 2D: Carve Western Westwood Frontier River (gz=38..216) from Westwood Lake to Southern Sea
    const westwoodCarved =
      minGx <= -60
        ? carveRiverAlongZ(
            38,
            216,
            (gz) => this.getWestwoodRiverCenterAndWidthAtZ(gz),
            -1.14
          )
        : { nodes: [], cells: [] };

    // Step 2E: Carve 5th & Final Major River: Eastern Eastgate Alpine River (gz=60..283) from Eastgate Lake to Southern Sea
    const eastgateCarved =
      maxGx >= 420
        ? carveRiverAlongZ(
            60,
            283,
            (gz) => this.getEastgateRiverCenterAndWidthAtZ(gz),
            -1.16
          )
        : { nodes: [], cells: [] };

    // Step 2F: Compute 2-Pass Chamfer Distance Transform for smooth multi-tiered beaches & seabed gradients
    const distToWater = new Float32Array(total);
    const distToLand = new Float32Array(total);
    const INF = 999;
    for (let i = 0; i < total; i++) {
      if (this.waterClass[i] !== WaterClassification.NONE) {
        distToWater[i] = 0;
        distToLand[i] = INF;
      } else {
        distToWater[i] = INF;
        distToLand[i] = 0;
      }
    }

    // Forward Chamfer pass (using local array indices lx: 0..w-1, lz: 0..d-1)
    for (let lz = 0; lz < d; lz++) {
      for (let lx = 0; lx < w; lx++) {
        const idx = lz * w + lx;
        if (lx > 0) {
          distToWater[idx] = Math.min(distToWater[idx], distToWater[idx - 1] + 1.0);
          distToLand[idx] = Math.min(distToLand[idx], distToLand[idx - 1] + 1.0);
        }
        if (lz > 0) {
          const up = (lz - 1) * w + lx;
          distToWater[idx] = Math.min(distToWater[idx], distToWater[up] + 1.0);
          distToLand[idx] = Math.min(distToLand[idx], distToLand[up] + 1.0);
          if (lx > 0) {
            distToWater[idx] = Math.min(distToWater[idx], distToWater[up - 1] + 1.4142);
            distToLand[idx] = Math.min(distToLand[idx], distToLand[up - 1] + 1.4142);
          }
          if (lx < w - 1) {
            distToWater[idx] = Math.min(distToWater[idx], distToWater[up + 1] + 1.4142);
            distToLand[idx] = Math.min(distToLand[idx], distToLand[up + 1] + 1.4142);
          }
        }
      }
    }

    // Backward Chamfer pass + populate signed coastalDist and smooth underwater seabed depth
    for (let lz = d - 1; lz >= 0; lz--) {
      for (let lx = w - 1; lx >= 0; lx--) {
        const idx = lz * w + lx;
        if (lx < w - 1) {
          distToWater[idx] = Math.min(distToWater[idx], distToWater[idx + 1] + 1.0);
          distToLand[idx] = Math.min(distToLand[idx], distToLand[idx + 1] + 1.0);
        }
        if (lz < d - 1) {
          const dn = (lz + 1) * w + lx;
          distToWater[idx] = Math.min(distToWater[idx], distToWater[dn] + 1.0);
          distToLand[idx] = Math.min(distToLand[idx], distToLand[dn] + 1.0);
          if (lx < w - 1) {
            distToWater[idx] = Math.min(distToWater[idx], distToWater[dn + 1] + 1.4142);
            distToLand[idx] = Math.min(distToLand[idx], distToLand[dn + 1] + 1.4142);
          }
          if (lx > 0) {
            distToWater[idx] = Math.min(distToWater[idx], distToWater[dn - 1] + 1.4142);
            distToLand[idx] = Math.min(distToLand[idx], distToLand[dn - 1] + 1.4142);
          }
        }

        const wc = this.waterClass[idx];
        if (wc === WaterClassification.NONE) {
          this.coastalDist[idx] = Math.min(12, distToWater[idx]);
        } else {
          const dW = Math.min(12, distToLand[idx]);
          this.coastalDist[idx] = -dW;
          // Smoothly sloped seabed/lakebed/riverbed from shoreline (-0.18m) to deep water (-1.80m)
          if (wc === WaterClassification.OCEAN) {
            const tDepth = Math.min(1, Math.max(0, (dW - 0.65) / 4.2));
            this.elevation[idx] = -0.18 - tDepth * 1.62;
          } else if (wc === WaterClassification.LAKE) {
            const tDepth = Math.min(1, Math.max(0, (dW - 0.55) / 3.0));
            this.elevation[idx] = -0.15 - tDepth * 1.1;
          } else {
            const tDepth = Math.min(1, Math.max(0, (dW - 0.45) / 2.0));
            this.elevation[idx] = -0.16 - tDepth * 0.72;
          }
        }
      }
    }

    // Step 3: Compute Elevations, Coastlines, Riverbanks, and Terrain Categories for Land
    const coastlineCells: GridCoord[] = [];
    const lakeEmeraldShoreCells: GridCoord[] = [];
    const lakeSilverpineShoreCells: GridCoord[] = [];
    const lakeBorealShoreCells: GridCoord[] = [];
    const lakeWestwoodShoreCells: GridCoord[] = [];
    const lakeEastgateShoreCells: GridCoord[] = [];
    const havenShoreCells: GridCoord[] = [];
    const crestShoreCells: GridCoord[] = [];
    const sentinelShoreCells: GridCoord[] = [];
    const horizonShoreCells: GridCoord[] = [];

    const rc = this.config.railCorridor;
    const cc = this.config.coreCity;
    const hw = this.config.highway;
    const pt = this.config.port;
    const ap = this.config.airport;

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const idx = (gz - minGz) * w + (gx - minGx);
        if (this.waterClass[idx] !== WaterClassification.NONE) {
          continue;
        }

        // Check immediate neighbors for water adjacency
        let touchesOcean = false;
        let touchesRiver = false;
        let touchesLake = false;

        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            const nx = gx + dx;
            const nz = gz + dz;
            if (nx < minGx || nx > maxGx || nz < minGz || nz > maxGz) continue;
            const nWater = this.waterClass[(nz - minGz) * w + (nx - minGx)];
            if (nWater === WaterClassification.OCEAN) touchesOcean = true;
            else if (nWater === WaterClassification.RIVER) touchesRiver = true;
            else if (nWater === WaterClassification.LAKE) touchesLake = true;
          }
        }

        const nVal = this.pseudoNoise(gx, gz);
        const dWater = this.coastalDist[idx];
        let elev = this.config.defaultElevation + nVal * 0.35;
        let cat = TerrainCategory.GRASS;

        // Islands
        const islandId = this.evaluateIslandMembership(gx, gz);
        if (islandId) {
          if (touchesOcean) {
            this.coastlineFlags[idx] = 1;
            cat = TerrainCategory.COASTAL_SAND;
            elev = 0.24 + Math.max(0, nVal) * 0.08;
            if (islandId === 'island-haven') havenShoreCells.push({ gx, gz });
            else if (islandId === 'island-crest')
              crestShoreCells.push({ gx, gz });
            else if (islandId === 'island-sentinel')
              sentinelShoreCells.push({ gx, gz });
            else horizonShoreCells.push({ gx, gz });
          } else if (dWater <= 2.2) {
            cat = TerrainCategory.COASTAL_SAND;
            elev = 0.48 + Math.max(0, nVal) * 0.22;
          } else {
            elev = 1.15 + Math.max(0, nVal) * 0.75;
            cat = elev > 1.75 ? TerrainCategory.ROCK : TerrainCategory.GRASS;
          }
          this.elevation[idx] = elev;
          this.terrainCat[idx] = cat;
          continue;
        }

        // Check if cell belongs to a flat authoritative transport/city/port plateau
        const isPortQuay =
          gx >= pt.startX &&
          gx <= pt.endX &&
          gz >= pt.startZ &&
          gz <= pt.endZ;
        const isRailPlateau =
          gx >= rc.startX &&
          gx <= rc.endX &&
          gz >= rc.minZ &&
          gz <= rc.maxZ;
        const isCityPlateau =
          gx >= cc.startX &&
          gx <= cc.endX &&
          gz >= cc.startZ &&
          gz <= cc.endZ;
        const isMetroEastPlateau =
          gx >= 105 && gx <= hw.startX - 2 && gz >= 35 && gz <= 76;
        const isLogisticsPlateau =
          (gx >= 37 && gx <= 60 && gz >= 32 && gz <= 80) ||
          (gx >= 35 && gx <= 59 && gz >= 67 && gz <= 95);
        const isHighwayPlateau =
          gx >= hw.startX &&
          gx <= hw.endX &&
          gz >= hw.visibleStartZ &&
          gz <= hw.visibleEndZ;
        const isAirportAccessCorridor =
          gx >= hw.endX + 1 && gx <= ap.startX && gz >= 51 && gz <= 59;
        const isAirportPlateau =
          gx >= ap.startX - 2 &&
          gx <= ap.endX + 3 &&
          gz >= ap.startZ - 1 &&
          gz <= ap.endZ + 2;
        const isHardPlateau =
          isPortQuay ||
          isRailPlateau ||
          isCityPlateau ||
          isMetroEastPlateau ||
          isLogisticsPlateau ||
          isHighwayPlateau ||
          isAirportAccessCorridor ||
          isAirportPlateau;

        // Mainland shoreline / riverbank transitions & multi-tiered sandy beaches
        if (isPortQuay) {
          if (touchesOcean) {
            this.coastlineFlags[idx] = 1;
            coastlineCells.push({ gx, gz });
          }
          elev = 0.75;
          cat = TerrainCategory.INDUSTRIAL_GROUND;
        } else if (touchesOcean) {
          this.coastlineFlags[idx] = 1;
          coastlineCells.push({ gx, gz });
          cat = TerrainCategory.COASTAL_SAND;
          elev = 0.22 + nVal * 0.04;
        } else if (touchesRiver || touchesLake) {
          this.coastlineFlags[idx] = 1;
          if (touchesLake) {
            if (gz < 0) lakeBorealShoreCells.push({ gx, gz });
            else if (gx < 0) lakeWestwoodShoreCells.push({ gx, gz });
            else if (gx >= 340) lakeEastgateShoreCells.push({ gx, gz });
            else if (gx < 160) lakeEmeraldShoreCells.push({ gx, gz });
            else lakeSilverpineShoreCells.push({ gx, gz });
          }
          cat = TerrainCategory.RIVERBANK;
          elev = 0.34 + nVal * 0.05;
        } else if (!isHardPlateau && dWater <= 2.6) {
          // Upper warm sandy beach tier sloping gently up from the shoreline
          cat = TerrainCategory.COASTAL_SAND;
          const beachT = Math.min(1, Math.max(0, (dWater - 1.0) / 1.6));
          elev = 0.28 + beachT * 0.36 + nVal * 0.05;
        } else {
          // Structured transport plateaus & natural hills across Core + North/South/East/West Expansions
          if (isRailPlateau) {
            elev = 1.2;
            cat =
              gx <= rc.facilitiesEndX
                ? TerrainCategory.INDUSTRIAL_GROUND
                : TerrainCategory.GRAVEL;
          } else if (isCityPlateau) {
            elev = 1.2;
            cat = TerrainCategory.URBAN_GROUND;
          } else if (isMetroEastPlateau) {
            elev = 1.2 + nVal * 0.08;
            cat = TerrainCategory.URBAN_GROUND;
          } else if (isLogisticsPlateau) {
            elev = 1.2;
            cat = TerrainCategory.INDUSTRIAL_GROUND;
          } else if (isHighwayPlateau) {
            elev = 1.2;
            cat = TerrainCategory.GRAVEL;
          } else if (isAirportAccessCorridor) {
            elev = 1.3;
            cat = TerrainCategory.GRASS;
          } else if (isAirportPlateau) {
            elev = 1.4;
            cat =
              gx >= ap.startX &&
              gx <= ap.endX &&
              gz >= ap.startZ &&
              gz <= ap.endZ
                ? TerrainCategory.GRASS
                : TerrainCategory.INDUSTRIAL_GROUND;
          } else if (gz < 0) {
            // Northern Boreal Expansion (gz: -80..-1): rolling pine hills, Boreal river valley, and alpine ridges
            const borealRiver = this.getBorealRiverCenterAndWidthAtZ(gz);
            const distBoreal = borealRiver
              ? Math.abs(gx - borealRiver.centerX)
              : 999;
            const valleyDepress =
              distBoreal < 20 ? (1 - distBoreal / 20) * 0.45 : 0;
            const northHillWave =
              Math.max(
                0,
                Math.sin(gx * 0.036 + 0.5) * Math.cos(gz * 0.042 - 0.3)
              ) * 2.75;
            const alpineBoost = gz < -45 ? ((-45 - gz) / 35) * 1.65 : 0;
            elev =
              1.35 +
              northHillWave +
              alpineBoost +
              nVal * 0.55 -
              valleyDepress;
            elev = Math.max(0.9, elev);
            if (elev > 4.1) cat = TerrainCategory.ROCK;
            else if (elev > 2.65) cat = TerrainCategory.SOIL;
            else cat = TerrainCategory.GRASS;
          } else if (gx < 0) {
            // Western Frontier Expansion (gx: -80..-1): Westwood river valley, rolling meadows & timber ridges
            const westRiver = this.getWestwoodRiverCenterAndWidthAtZ(gz);
            const distWest = westRiver
              ? Math.abs(gx - westRiver.centerX)
              : 999;
            const valleyDepress =
              distWest < 20 ? (1 - distWest / 20) * 0.42 : 0;
            const westRidgeWave =
              Math.max(
                0,
                Math.sin((gx - 12) * 0.042) * Math.cos(gz * 0.035 + 0.4)
              ) * 2.55;
            elev = 1.28 + westRidgeWave + nVal * 0.5 - valleyDepress;
            elev = Math.max(0.88, elev);
            if (elev > 3.95) cat = TerrainCategory.ROCK;
            else if (elev > 2.6) cat = TerrainCategory.SOIL;
            else cat = TerrainCategory.GRASS;
          } else if (
            gz < 20 &&
            (gx < 48 || (gx > 78 && gx < ap.startX - 4))
          ) {
            // Gentle northern highland hills (kept clear of the 50x70 airport plateau)
            const hillFactor = (20 - gz) / 20;
            elev = 1.4 + hillFactor * 2.8 + nVal * 0.6;
            cat = elev > 3.2 ? TerrainCategory.ROCK : TerrainCategory.SOIL;
          } else if (gx >= 200) {
            // Expanded Eastern Continent & Far East Highwoods (gx: 200..439): rolling hills, Silverpine & Eastgate river valleys
            const spRiverInfo = this.getSilverpineRiverCenterAndWidthAtZ(gz);
            const egRiverInfo = this.getEastgateRiverCenterAndWidthAtZ(gz);
            const distSp = spRiverInfo
              ? Math.abs(gx - spRiverInfo.centerX)
              : 999;
            const distEg = egRiverInfo
              ? Math.abs(gx - egRiverInfo.centerX)
              : 999;
            const distFromRiver = Math.min(distSp, distEg);
            const valleyDepress =
              distFromRiver < 24
                ? (1 - distFromRiver / 24) * 0.45
                : 0;

            const ridgeWave =
              Math.max(
                0,
                Math.sin((gx - 210) * 0.038) * Math.cos(gz * 0.032)
              ) * 3.2;
            const northHighlandBoost =
              gz < 32 ? ((32 - gz) / 32) * 2.4 : 0;

            elev =
              1.35 +
              ridgeWave +
              northHighlandBoost +
              nVal * 0.65 -
              valleyDepress;
            elev = Math.max(0.85, elev);

            if (elev > 4.2) {
              cat = TerrainCategory.ROCK;
            } else if (elev > 2.7) {
              cat = TerrainCategory.SOIL;
            } else {
              cat = TerrainCategory.GRASS;
            }
          } else if (gz >= 100) {
            // Unified Southern Mainland Peninsula rolling coastal hills & green meadows
            const hillWave =
              Math.max(0, Math.sin(gx * 0.045) * Math.sin((gz - 110) * 0.05)) *
              1.85;
            elev = 1.25 + hillWave + nVal * 0.4;
            cat = elev > 2.8 ? TerrainCategory.SOIL : TerrainCategory.GRASS;
          }

          // Smooth coastal transition zone (2.6 < dWater <= 5.5) so inland terrain slopes gracefully to the sandy beach
          if (!isHardPlateau && dWater <= 5.5) {
            const coastBlend = Math.min(1, Math.max(0, (dWater - 2.6) / 2.9));
            const smoothCoast =
              coastBlend * coastBlend * (3 - 2 * coastBlend);
            elev = 0.64 + (elev - 0.64) * smoothCoast;
            if (dWater <= 3.5 && cat === TerrainCategory.GRASS) {
              cat = TerrainCategory.SOIL; // Dry coastal grass/soil transition tier before beach sand
            }
          }
        }

        this.elevation[idx] = elev;
        this.terrainCat[idx] = cat;
      }
    }

    // Step 4: Generate Deterministic Organic Forest Regions & Density Levels
    for (let rIdx = 0; rIdx < FOREST_REGION_DEFS.length; rIdx++) {
      const def = FOREST_REGION_DEFS[rIdx];
      let coreCellCount = 0;
      let transitionCellCount = 0;

      const rMinGx = Math.max(minGx + 1, def.minGx);
      const rMaxGx = Math.min(maxGx - 1, def.maxGx);
      const rMinGz = Math.max(minGz + 1, def.minGz);
      const rMaxGz = Math.min(maxGz - 1, def.maxGz);

      for (let gz = rMinGz; gz <= rMaxGz; gz++) {
        for (let gx = rMinGx; gx <= rMaxGx; gx++) {
          const idx = (gz - minGz) * w + (gx - minGx);
          if (this.waterClass[idx] !== WaterClassification.NONE) continue;
          if (this.coastlineFlags[idx] === 1) continue;
          const cat = this.terrainCat[idx] as TerrainCategory;
          if (
            cat !== TerrainCategory.GRASS &&
            cat !== TerrainCategory.SOIL
          ) {
            continue;
          }
          if (this.isReservedInfrastructureEnvelope(gx, gz)) continue;

          // Keep immediate riverbank buffers clear for natural riparian meadows
          const spRiver = this.getSilverpineRiverCenterAndWidthAtZ(gz);
          if (spRiver && Math.abs(gx - spRiver.centerX) < spRiver.widthCells + 1.5) {
            continue;
          }
          const borRiver = this.getBorealRiverCenterAndWidthAtZ(gz);
          if (borRiver && Math.abs(gx - borRiver.centerX) < borRiver.widthCells + 1.5) {
            continue;
          }
          const westRiver = this.getWestwoodRiverCenterAndWidthAtZ(gz);
          if (westRiver && Math.abs(gx - westRiver.centerX) < westRiver.widthCells + 1.5) {
            continue;
          }
          const eastRiver = this.getEastgateRiverCenterAndWidthAtZ(gz);
          if (eastRiver && Math.abs(gx - eastRiver.centerX) < eastRiver.widthCells + 1.5) {
            continue;
          }

          const nx = (gx - def.centerGx) / def.radiusX;
          const nz = (gz - def.centerGz) / def.radiusZ;
          const radialDist = Math.hypot(nx, nz);
          const fNoise = this.forestNoise(gx, gz);
          const organicBoundary = 1.0 + fNoise * 0.34;

          if (radialDist > organicBoundary) continue;

          // Natural interior meadow clearings
          const clearingWave =
            Math.sin(gx * 0.22 - gz * 0.18) * Math.cos(gx * 0.15 + gz * 0.24);
          if (clearingWave > 0.76 && radialDist > 0.22) {
            continue;
          }

          const normalizedScore = 1 - radialDist / organicBoundary + fNoise * 0.2;
          let density = ForestDensityLevel.SCATTERED;
          if (normalizedScore > 0.44) {
            density = ForestDensityLevel.DENSE_FOREST;
            coreCellCount++;
          } else if (normalizedScore > 0.22) {
            density = ForestDensityLevel.MEDIUM_WOODLAND;
            coreCellCount++;
          } else {
            density = ForestDensityLevel.SCATTERED;
            transitionCellCount++;
          }

          this.forestDensity[idx] = density;
          this.forestRegionIdx[idx] = rIdx + 1;
        }
      }

      if (coreCellCount + transitionCellCount > 0) {
        this.forestRegions.set(def.id, {
          id: def.id,
          name: def.name,
          speciesMix: def.speciesMix,
          centerGx: def.centerGx,
          centerGz: def.centerGz,
          minGx: rMinGx,
          maxGx: rMaxGx,
          minGz: rMinGz,
          maxGz: rMaxGz,
          coreCellCount,
          transitionCellCount,
          totalCellCount: coreCellCount + transitionCellCount,
        });
      }
    }

    // Re-apply any player-cleared forest bounds (e.g. from purchased wooded parcels or constructions)
    for (const b of this.clearedForestBounds) {
      this.applyTreeClearingInternal(b.minGx, b.maxGx, b.minGz, b.maxGz);
    }

    // Step 5: Compute Core Terrain Chunk Metadata (40x40 cells per chunk -> 13x10 = 130 core chunks)
    const chunkSize = Math.max(16, this.config.chunkSizeCells || 40);
    const chunksX = Math.ceil(w / chunkSize);
    const chunksZ = Math.ceil(d / chunkSize);

    for (let cz = 0; cz < chunksZ; cz++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const cMinGx = minGx + cx * chunkSize;
        const cMaxGx = Math.min(maxGx, cMinGx + chunkSize - 1);
        const cMinGz = minGz + cz * chunkSize;
        const cMaxGz = Math.min(maxGz, cMinGz + chunkSize - 1);

        let minElevation = Infinity;
        let maxElevation = -Infinity;
        let landCellCount = 0;
        let waterCellCount = 0;
        let forestCellCount = 0;

        for (let gz = cMinGz; gz <= cMaxGz; gz++) {
          for (let gx = cMinGx; gx <= cMaxGx; gx++) {
            const idx = (gz - minGz) * w + (gx - minGx);
            const el = this.elevation[idx];
            if (el < minElevation) minElevation = el;
            if (el > maxElevation) maxElevation = el;
            if (this.waterClass[idx] === WaterClassification.NONE) {
              landCellCount++;
            } else {
              waterCellCount++;
            }
            if (this.forestDensity[idx] !== ForestDensityLevel.NONE) {
              forestCellCount++;
            }
          }
        }

        const centerWorld = this.grid.gridToWorld(
          (cMinGx + cMaxGx) * 0.5,
          (cMinGz + cMaxGz) * 0.5
        );

        this.chunks.push({
          id: `chunk-${cx}-${cz}`,
          chunkX: cx,
          chunkZ: cz,
          minGx: cMinGx,
          maxGx: cMaxGx,
          minGz: cMinGz,
          maxGz: cMaxGz,
          centerWx: centerWorld.x,
          centerWz: centerWorld.z,
          minElevation: Number.isFinite(minElevation) ? minElevation : 0,
          maxElevation: Number.isFinite(maxElevation) ? maxElevation : 1.2,
          landCellCount,
          waterCellCount,
          forestCellCount,
        });
      }
    }

    // Register authoritative geographical records (5 Major Lakes & Strictly 5 Major Rivers)
    this.lakes.set('lake-emerald', {
      id: 'lake-emerald',
      name: 'Emerald Highland Lake',
      centerGx: 63,
      centerGz: 16,
      cells: lakeEmeraldCells,
      shorelineCells: lakeEmeraldShoreCells,
      connectedRiverIds:
        borealCarved.nodes.length > 0
          ? ['river-serpentine', 'river-boreal']
          : ['river-serpentine'],
    });

    if (lakeSilverpineCells.length > 0) {
      this.lakes.set('lake-silverpine', {
        id: 'lake-silverpine',
        name: 'Silverpine Highland Lake',
        centerGx: 256,
        centerGz: 34,
        cells: lakeSilverpineCells,
        shorelineCells: lakeSilverpineShoreCells,
        connectedRiverIds: ['river-silverpine'],
      });
    }

    if (lakeBorealCells.length > 0) {
      this.lakes.set('lake-boreal', {
        id: 'lake-boreal',
        name: 'Boreal Crater Lake',
        centerGx: 148,
        centerGz: -44,
        cells: lakeBorealCells,
        shorelineCells: lakeBorealShoreCells,
        connectedRiverIds: ['river-boreal'],
      });
    }

    if (lakeWestwoodCells.length > 0) {
      this.lakes.set('lake-westwood', {
        id: 'lake-westwood',
        name: 'Westwood Frontier Lake',
        centerGx: -44,
        centerGz: 32,
        cells: lakeWestwoodCells,
        shorelineCells: lakeWestwoodShoreCells,
        connectedRiverIds: ['river-westwood'],
      });
    }

    if (lakeEastgateCells.length > 0) {
      this.lakes.set('lake-eastgate', {
        id: 'lake-eastgate',
        name: 'Eastgate Alpine Lake',
        centerGx: 398,
        centerGz: 54,
        cells: lakeEastgateCells,
        shorelineCells: lakeEastgateShoreCells,
        connectedRiverIds: ['river-eastgate'],
      });
    }

    this.rivers.set('river-serpentine', {
      id: 'river-serpentine',
      name: 'Serpentine Valley River',
      sourceWaterBodyId: 'lake-emerald',
      destinationWaterBodyId: 'ocean-main',
      nodes: serpentineCarved.nodes,
      cells: serpentineCarved.cells,
    });

    if (silverpineCarved.nodes.length > 0) {
      this.rivers.set('river-silverpine', {
        id: 'river-silverpine',
        name: 'Silverpine Valley River',
        sourceWaterBodyId: 'lake-silverpine',
        destinationWaterBodyId: 'ocean-main',
        nodes: silverpineCarved.nodes,
        cells: silverpineCarved.cells,
      });
    }

    if (borealCarved.nodes.length > 0) {
      this.rivers.set('river-boreal', {
        id: 'river-boreal',
        name: 'Boreal Highland River',
        sourceWaterBodyId: 'lake-boreal',
        destinationWaterBodyId: 'lake-emerald',
        nodes: borealCarved.nodes,
        cells: borealCarved.cells,
      });
    }

    if (westwoodCarved.nodes.length > 0) {
      this.rivers.set('river-westwood', {
        id: 'river-westwood',
        name: 'Westwood Frontier River',
        sourceWaterBodyId: 'lake-westwood',
        destinationWaterBodyId: 'ocean-main',
        nodes: westwoodCarved.nodes,
        cells: westwoodCarved.cells,
      });
    }

    if (eastgateCarved.nodes.length > 0) {
      this.rivers.set('river-eastgate', {
        id: 'river-eastgate',
        name: 'Eastgate Alpine River',
        sourceWaterBodyId: 'lake-eastgate',
        destinationWaterBodyId: 'ocean-main',
        nodes: eastgateCarved.nodes,
        cells: eastgateCarved.cells,
      });
    }

    this.islands.set('island-haven', {
      id: 'island-haven',
      name: 'Haven Island',
      centerGx: 38,
      centerGz: 109,
      landCells: islandHavenCells,
      shorelineCells: havenShoreCells,
      surroundingWaterId: 'ocean-main',
    });

    this.islands.set('island-crest', {
      id: 'island-crest',
      name: 'Crest Island',
      centerGx: 118,
      centerGz: 109,
      landCells: islandCrestCells,
      shorelineCells: crestShoreCells,
      surroundingWaterId: 'ocean-main',
    });

    if (islandSentinelCells.length > 0) {
      this.islands.set('island-sentinel', {
        id: 'island-sentinel',
        name: 'Sentinel Island',
        centerGx: 248,
        centerGz: 226,
        landCells: islandSentinelCells,
        shorelineCells: sentinelShoreCells,
        surroundingWaterId: 'ocean-main',
      });
    }

    if (islandHorizonCells.length > 0) {
      this.islands.set('island-horizon', {
        id: 'island-horizon',
        name: 'Horizon Island',
        centerGx: 82,
        centerGz: 226,
        landCells: islandHorizonCells,
        shorelineCells: horizonShoreCells,
        surroundingWaterId: 'ocean-main',
      });
    }

    this.ocean = {
      id: 'ocean-main',
      name: 'Southern Sapphire Sea',
      cellsCount: oceanCellCount,
      coastlineCells,
      islandIds: Array.from(this.islands.keys()),
    };
  }

  /**
   * Deterministically evaluates terrain, elevation, water, coastline, and forest density for any cell
   * in the outer 20,300,000-block open world outside the precomputed 520x400 core array.
   * Respects the Strict 5-River Rule (no extra rivers in the outer expanse).
   */
  private evaluateOuterWorldCell(
    gx: number,
    gz: number
  ): {
    elevation: number;
    coastalDist: number;
    terrainCat: TerrainCategory;
    waterClass: WaterClassification;
    isCoastline: boolean;
    forestDensity: ForestDensityLevel;
  } {
    const coastZ = this.getNaturalCoastlineZ(gx);
    const southStraitEndZ =
      415.0 +
      18.0 * Math.sin(gx * 0.008 + 0.5) +
      9.0 * Math.cos(gx * 0.019 - 0.3);
    const outerMarginDist = Math.min(
      gx - this.grid.getMinGx() - 48,
      this.grid.getMaxGx() - gx - 48,
      gz - this.grid.getMinGz() - 48,
      this.grid.getMaxGz() - gz - 48
    );

    // Determine signed distance to nearest shoreline (> 0 on land, < 0 in water):
    // - North/West/East of coastZ is the Northern & Central Continental Landmass
    // - Between coastZ and southStraitEndZ (~415) is the Sapphire Sea Channel
    // - South of southStraitEndZ (415..maxGz-48) is the Southern Continental Frontier Landmass
    const rawSignedCoast =
      gz <= coastZ
        ? coastZ - gz
        : gz >= southStraitEndZ
          ? gz - southStraitEndZ
          : -Math.min(gz - coastZ, southStraitEndZ - gz);
    const signedCoast = Math.min(rawSignedCoast, outerMarginDist);

    // Check outer islands in the Southern Sapphire Sea Channel or outer ocean rim
    if (signedCoast < 0) {
      const seaNoise =
        Math.sin(gx * 0.014 + 0.7) * Math.cos(gz * 0.015 - 0.4) +
        0.4 * Math.sin((gx + gz) * 0.029);
      if (gz < coastZ + 380 && seaNoise > 1.18) {
        const islandHeight = (seaNoise - 1.18) * 5.5;
        return {
          elevation: 0.35 + islandHeight,
          coastalDist: Math.min(8, islandHeight * 3),
          terrainCat:
            islandHeight < 0.35
              ? TerrainCategory.COASTAL_SAND
              : islandHeight > 1.65
                ? TerrainCategory.ROCK
                : TerrainCategory.GRASS,
          waterClass: WaterClassification.NONE,
          isCoastline: islandHeight < 0.22,
          forestDensity:
            islandHeight > 0.55 && islandHeight < 1.5
              ? ForestDensityLevel.MEDIUM_WOODLAND
              : ForestDensityLevel.NONE,
        };
      }

      const dW = Math.min(12, Math.abs(signedCoast));
      const tDepth = Math.min(1, Math.max(0, (dW - 0.65) / 4.2));
      return {
        elevation: -0.18 - tDepth * 1.62,
        coastalDist: -dW,
        terrainCat: TerrainCategory.SUBMERGED,
        waterClass: WaterClassification.OCEAN,
        isCoastline: false,
        forestDensity: ForestDensityLevel.NONE,
      };
    }

    // Mainland in outer continental frontier (North, East, West, or South Cape)
    const dWater = Math.min(12, signedCoast);
    const nVal = this.pseudoNoise(gx, gz);
    if (dWater <= 1.0) {
      return {
        elevation: 0.22 + nVal * 0.04,
        coastalDist: dWater,
        terrainCat: TerrainCategory.COASTAL_SAND,
        waterClass: WaterClassification.NONE,
        isCoastline: true,
        forestDensity: ForestDensityLevel.NONE,
      };
    }
    if (dWater <= 2.8) {
      const beachT = (dWater - 1.0) / 1.8;
      return {
        elevation: 0.28 + beachT * 0.42 + nVal * 0.05,
        coastalDist: dWater,
        terrainCat: TerrainCategory.COASTAL_SAND,
        waterClass: WaterClassification.NONE,
        isCoastline: false,
        forestDensity: ForestDensityLevel.NONE,
      };
    }

    // Continental elevation synthesis (broad buildable plains, rolling valleys, and scenic highland ridges)
    const macroPlains =
      Math.sin(gx * 0.0085 + 0.3) * Math.cos(gz * 0.0085 - 0.2);
    const ridgeField =
      Math.max(0, Math.sin(gx * 0.022 - 0.4) * Math.cos(gz * 0.021 + 0.5)) *
      2.65;
    let elev = 1.28 + macroPlains * 0.45 + ridgeField + nVal * 0.42;
    elev = Math.max(0.88, elev);

    let cat = TerrainCategory.GRASS;
    if (elev > 4.05) {
      cat = TerrainCategory.ROCK;
    } else if (elev > 2.65) {
      cat = TerrainCategory.SOIL;
    }

    // Check if cleared by player
    let isCleared = false;
    for (let i = 0; i < this.clearedForestBounds.length; i++) {
      const b = this.clearedForestBounds[i];
      if (
        gx >= b.minGx &&
        gx <= b.maxGx &&
        gz >= b.minGz &&
        gz <= b.maxGz
      ) {
        isCleared = true;
        break;
      }
    }

    let density = ForestDensityLevel.NONE;
    if (!isCleared && cat !== TerrainCategory.ROCK && dWater > 4.0) {
      const fScore =
        Math.sin(gx * 0.019 + 0.4) * Math.cos(gz * 0.018 - 0.3) +
        this.forestNoise(gx, gz) * 0.45;
      if (fScore > 0.48) {
        density = ForestDensityLevel.DENSE_FOREST;
      } else if (fScore > 0.22) {
        density = ForestDensityLevel.MEDIUM_WOODLAND;
      } else if (fScore > 0.04) {
        density = ForestDensityLevel.SCATTERED;
      }
    }

    return {
      elevation: elev,
      coastalDist: dWater,
      terrainCat: cat,
      waterClass: WaterClassification.NONE,
      isCoastline: false,
      forestDensity: density,
    };
  }

  private applyTreeClearingInternal(
    minGx: number,
    maxGx: number,
    minGz: number,
    maxGz: number
  ): number {
    let clearedCount = 0;
    const cMinX = Math.max(this.coreMinGx, minGx);
    const cMaxX = Math.min(this.coreMaxGx, maxGx);
    const cMinZ = Math.max(this.coreMinGz, minGz);
    const cMaxZ = Math.min(this.coreMaxGz, maxGz);

    for (let gz = cMinZ; gz <= cMaxZ; gz++) {
      for (let gx = cMinX; gx <= cMaxX; gx++) {
        const idx = this.getCoreCellIndex(gx, gz);
        if (idx < 0) continue;
        if (this.forestDensity[idx] !== ForestDensityLevel.NONE) {
          this.forestDensity[idx] = ForestDensityLevel.NONE;
          this.forestRegionIdx[idx] = 0;
          clearedCount++;
        }
      }
    }
    return clearedCount;
  }

  /**
   * Clears forest trees inside the specified grid bounds (used when an unowned wooded parcel
   * is purchased or when player infrastructure is constructed on forested land).
   */
  public clearTreesInBounds(
    minGx: number,
    maxGx: number,
    minGz: number,
    maxGz: number
  ): number {
    this.clearedForestBounds.push({ minGx, maxGx, minGz, maxGz });
    return this.applyTreeClearingInternal(minGx, maxGx, minGz, maxGz);
  }

  public getClearedForestBounds(): ClearedForestBoundsRecord[] {
    return this.clearedForestBounds.map((b) => ({ ...b }));
  }

  public restoreClearedForestBounds(bounds: ClearedForestBoundsRecord[]): void {
    this.clearedForestBounds = bounds.map((b) => ({ ...b }));
    for (const b of this.clearedForestBounds) {
      this.applyTreeClearingInternal(b.minGx, b.maxGx, b.minGz, b.maxGz);
    }
  }

  public getElevationAtGrid(gx: number, gz: number): number | null {
    if (!this.grid.isValidGridCoord(gx, gz)) return null;
    const coreIdx = this.getCoreCellIndex(gx, gz);
    if (coreIdx >= 0) return this.elevation[coreIdx];
    return this.evaluateOuterWorldCell(gx, gz).elevation;
  }

  public getElevationAtWorld(wx: number, wz: number): number | null {
    if (!this.grid.isValidWorldCoord(wx, wz)) return null;
    const { gx, gz } = this.grid.worldToGrid(wx, wz);
    return this.getElevationAtGrid(gx, gz);
  }

  public getTerrainCategoryAt(gx: number, gz: number): TerrainCategory | null {
    if (!this.grid.isValidGridCoord(gx, gz)) return null;
    const coreIdx = this.getCoreCellIndex(gx, gz);
    if (coreIdx >= 0) return this.terrainCat[coreIdx] as TerrainCategory;
    return this.evaluateOuterWorldCell(gx, gz).terrainCat;
  }

  public getWaterClassificationAt(
    gx: number,
    gz: number
  ): WaterClassification | null {
    if (!this.grid.isValidGridCoord(gx, gz)) return null;
    const coreIdx = this.getCoreCellIndex(gx, gz);
    if (coreIdx >= 0) return this.waterClass[coreIdx] as WaterClassification;
    return this.evaluateOuterWorldCell(gx, gz).waterClass;
  }

  public isWaterAt(gx: number, gz: number): boolean {
    const wc = this.getWaterClassificationAt(gx, gz);
    return wc !== null && wc !== WaterClassification.NONE;
  }

  public isLandAt(gx: number, gz: number): boolean {
    const wc = this.getWaterClassificationAt(gx, gz);
    return wc === WaterClassification.NONE;
  }

  public isCoastlineOrBankAt(gx: number, gz: number): boolean {
    if (!this.grid.isValidGridCoord(gx, gz)) return false;
    const coreIdx = this.getCoreCellIndex(gx, gz);
    if (coreIdx >= 0) return this.coastlineFlags[coreIdx] === 1;
    return this.evaluateOuterWorldCell(gx, gz).isCoastline;
  }

  public getForestDensityAt(gx: number, gz: number): ForestDensityLevel {
    if (!this.grid.isValidGridCoord(gx, gz)) return ForestDensityLevel.NONE;
    const coreIdx = this.getCoreCellIndex(gx, gz);
    if (coreIdx >= 0) return this.forestDensity[coreIdx] as ForestDensityLevel;
    return this.evaluateOuterWorldCell(gx, gz).forestDensity;
  }

  public getForestRegionAt(gx: number, gz: number): ForestRegionRecord | null {
    const coreIdx = this.getCoreCellIndex(gx, gz);
    if (coreIdx < 0) return null;
    const rIdx = this.forestRegionIdx[coreIdx];
    if (rIdx === 0) return null;
    const def = FOREST_REGION_DEFS[rIdx - 1];
    return def ? (this.forestRegions.get(def.id) ?? null) : null;
  }

  public getForestRegions(): ForestRegionRecord[] {
    return Array.from(this.forestRegions.values());
  }

  public getTerrainChunks(): TerrainChunkMetadata[] {
    return this.chunks;
  }

  /**
   * Returns total supported streaming chunks across the entire 20,300,000-block open world.
   */
  public getTotalWorldChunkCount(): number {
    const chunkSize = Math.max(16, this.config.chunkSizeCells || 40);
    const chunksX = Math.ceil(this.config.gridWidth / chunkSize);
    const chunksZ = Math.ceil(this.config.gridDepth / chunkSize);
    return chunksX * chunksZ;
  }

  public getChunkAtGrid(gx: number, gz: number): TerrainChunkMetadata | null {
    if (!this.grid.isValidGridCoord(gx, gz)) return null;
    const chunkSize = Math.max(16, this.config.chunkSizeCells || 40);
    if (
      gx >= this.coreMinGx &&
      gx <= this.coreMaxGx &&
      gz >= this.coreMinGz &&
      gz <= this.coreMaxGz
    ) {
      const cx = Math.floor((gx - this.coreMinGx) / chunkSize);
      const cz = Math.floor((gz - this.coreMinGz) / chunkSize);
      const chunksX = Math.ceil(this.coreWidth / chunkSize);
      return this.chunks[cz * chunksX + cx] ?? null;
    }

    // On-demand chunk metadata for outer continental streaming chunks
    const cx = Math.floor((gx - this.grid.getMinGx()) / chunkSize);
    const cz = Math.floor((gz - this.grid.getMinGz()) / chunkSize);
    const cMinGx = this.grid.getMinGx() + cx * chunkSize;
    const cMaxGx = Math.min(this.grid.getMaxGx(), cMinGx + chunkSize - 1);
    const cMinGz = this.grid.getMinGz() + cz * chunkSize;
    const cMaxGz = Math.min(this.grid.getMaxGz(), cMinGz + chunkSize - 1);
    const centerWorld = this.grid.gridToWorld(
      (cMinGx + cMaxGx) * 0.5,
      (cMinGz + cMaxGz) * 0.5
    );
    const sample = this.evaluateOuterWorldCell(gx, gz);
    const totalCells = (cMaxGx - cMinGx + 1) * (cMaxGz - cMinGz + 1);
    const isWater = sample.waterClass !== WaterClassification.NONE;
    return {
      id: `chunk-outer-${cx}-${cz}`,
      chunkX: cx,
      chunkZ: cz,
      minGx: cMinGx,
      maxGx: cMaxGx,
      minGz: cMinGz,
      maxGz: cMaxGz,
      centerWx: centerWorld.x,
      centerWz: centerWorld.z,
      minElevation: isWater ? -1.8 : 0.85,
      maxElevation: isWater ? -0.18 : 3.8,
      landCellCount: isWater ? 0 : totalCells,
      waterCellCount: isWater ? totalCells : 0,
      forestCellCount:
        sample.forestDensity !== ForestDensityLevel.NONE
          ? Math.floor(totalCells * 0.45)
          : 0,
    };
  }

  public isBuildableLandForOrdinaryStructure(
    gx: number,
    gz: number,
    zone?: ZoneCategory
  ): boolean {
    if (!this.grid.isValidGridCoord(gx, gz)) return false;
    if (this.isWaterAt(gx, gz)) return false;
    const cat = this.getTerrainCategoryAt(gx, gz);
    if (cat === TerrainCategory.ROCK || cat === TerrainCategory.SUBMERGED) {
      return false;
    }
    if (
      zone === ZoneCategory.AIRPORT_RESERVED ||
      zone === ZoneCategory.HIGHWAY_RESERVED ||
      zone === ZoneCategory.PROTECTED_WATER
    ) {
      return false;
    }
    return true;
  }

  public getRivers(): RiverRecord[] {
    return Array.from(this.rivers.values());
  }

  public getLakes(): LakeRecord[] {
    return Array.from(this.lakes.values());
  }

  public getIslands(): IslandRecord[] {
    return Array.from(this.islands.values());
  }

  public getOcean(): OceanRecord {
    return this.ocean;
  }

  public getCoastalDistanceAt(gx: number, gz: number): number {
    if (!this.grid.isValidGridCoord(gx, gz)) return 0;
    const coreIdx = this.getCoreCellIndex(gx, gz);
    if (coreIdx >= 0) return this.coastalDist[coreIdx];
    return this.evaluateOuterWorldCell(gx, gz).coastalDist;
  }

  public handleWorldExpansion(
    newConfig: WorldConfigData,
    newGrid: GridSystem
  ): void {
    this.config = newConfig;
    this.grid = newGrid;
  }
}

