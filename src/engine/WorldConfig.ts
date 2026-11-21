/**
 * Centralized authoritative configuration for Global Transport Empire.
 * Covers Master Prompts 1 through 5.
 */

export enum TerrainCategory {
  GRASS = 0,
  SOIL = 1,
  GRAVEL = 2,
  ROCK = 3,
  INDUSTRIAL_GROUND = 4,
  URBAN_GROUND = 5,
  COASTAL_SAND = 6,
  RIVERBANK = 7,
  SUBMERGED = 8,
}

export enum WaterClassification {
  NONE = 0,
  RIVER = 1,
  LAKE = 2,
  OCEAN = 3,
  COASTLINE_TRANSITION = 4,
}

export enum ZoneCategory {
  OPEN_LAND = 0,
  CITY = 1,
  LOGISTICS = 2,
  INDUSTRIAL = 3,
  COMMERCIAL_SUPPORT = 4,
  RAIL_YARD = 5,
  HIGHWAY_RESERVED = 6,
  AIRPORT_RESERVED = 7,
  PORT_RESERVED = 8,
  FUTURE_EXPANSION = 9,
  PROTECTED_WATER = 10,
}

export enum RailCorridorSection {
  NONE = 0,
  FACILITIES_AND_MACHINERY = 1, // 5 grid blocks wide
  TRACK_OPERATIONS = 2,         // 10 grid blocks wide
}

export type RoadWidthConfig = '1x1' | '2x2' | '3x3';

export interface RoadSpec {
  config: RoadWidthConfig;
  gridWidth: number;
  worldWidth: number;
  lanesPerDirection: number;
  totalLanes: number;
  dashedSeparatorsPerCarriageway: number;
}

export const ROAD_SPECS: Record<RoadWidthConfig, RoadSpec> = {
  '1x1': {
    config: '1x1',
    gridWidth: 1,
    worldWidth: 2.0,
    lanesPerDirection: 1,
    totalLanes: 2,
    dashedSeparatorsPerCarriageway: 0,
  },
  '2x2': {
    config: '2x2',
    gridWidth: 2,
    worldWidth: 4.0,
    lanesPerDirection: 2,
    totalLanes: 4,
    dashedSeparatorsPerCarriageway: 1,
  },
  '3x3': {
    config: '3x3',
    gridWidth: 3,
    worldWidth: 6.0,
    lanesPerDirection: 3,
    totalLanes: 6,
    dashedSeparatorsPerCarriageway: 2,
  },
};

export interface WorldConfigData {
  version: number;
  seed: number;
  gridWidth: number;
  gridDepth: number;
  minGx: number;
  minGz: number;
  maxGx: number;
  maxGz: number;
  expansionNorthBlocks: number;
  expansionSouthBlocks: number;
  expansionEastBlocks: number;
  expansionWestBlocks: number;
  previousGridWidth: number;
  previousGridDepth: number;
  /** First 10M+ expansion milestone dimensions (3600 x 2850 = 10,260,000 blocks) */
  expansion1GridWidth?: number;
  expansion1GridDepth?: number;
  /** Second 10M+ expansion milestone dimensions (5000 x 4060 = 20,300,000 blocks) */
  expansion2GridWidth?: number;
  expansion2GridDepth?: number;
  /** High-resolution core continent bounds [-80..439, -80..319] (520 x 400 = 208,000 blocks) */
  coreMinGx?: number;
  coreMaxGx?: number;
  coreMinGz?: number;
  coreMaxGz?: number;
  coreGridWidth?: number;
  coreGridDepth?: number;
  cellSize: number;
  worldWidth: number;
  worldDepth: number;
  /** Fixed world coordinates of cell (0,0) minimum corner so expansion never shifts existing cells */
  originX: number;
  originZ: number;
  defaultElevation: number;
  minElevation: number;
  maxElevation: number;
  waterElevation: number;
  maxGridWidth: number;
  maxGridDepth: number;
  /** Chunk size in grid cells for chunked terrain & LOD management (40x40 cells = 80m x 80m) */
  chunkSizeCells: number;
  /** Previous baseline dimensions before the Extreme World Expansion (for audit & migration) */
  legacyGridWidth: number;
  legacyGridDepth: number;
  // Geography & Corridor Constants
  railCorridor: {
    startX: number; // 20
    endX: number;   // 34 (inclusive -> 15 blocks wide: 20..34)
    widthBlocks: number; // 15
    facilitiesStartX: number; // 20
    facilitiesEndX: number;   // 24 (inclusive -> 5 blocks: 20..24)
    facilitiesWidthBlocks: number; // 5
    trackOpsStartX: number;   // 25
    trackOpsEndX: number;     // 34 (inclusive -> 10 blocks: 25..34)
    trackOpsWidthBlocks: number; // 10
    minZ: number;
    maxZ: number;
    maxParallelTracks: number; // 6
    designatedCrossingRows: number[];
  };
  coreCity: {
    startX: number; // 70 (separation from railCorridor.endX=34 is 35 blocks >= 30 blocks)
    endX: number;   // 104
    startZ: number; // 35
    endZ: number;   // 75
    roundaboutCenterX: number; // 86
    roundaboutCenterZ: number; // 55
    roundaboutRadiusCells: number; // 4
  };
  highway: {
    startX: number; // 123 (shifted 15 blocks left from 138 away from the Airport)
    endX: number;   // 134 (shifted 15 blocks left from 149 -> 12 blocks total envelope for 10 lanes + shoulders)
    previousStartX?: number; // 138
    previousEndX?: number;   // 149
    shiftedLeftBlocks?: number; // 15
    visibleStartZ: number; // 18
    visibleEndZ: number;   // 88
    mainLanesTotal: number; // 8
    mainLanesPerDirection: number; // 4
    serviceRoadLanesTotal: number; // 2
    totalLanes: number; // 10
    mergeRowZ: number; // 55
  };
  port: {
    startX: number; // 82 (shifted left away from highway)
    endX: number;   // 98
    startZ: number; // 88
    endZ: number;   // 98
    lowerLandStartX: number; // 74
    lowerLandEndX: number;   // 82
    lowerLandStartZ: number; // 92
    lowerLandEndZ: number;   // 101
    triangularHeadlandStartX: number; // 99
    triangularHeadlandEndX: number;   // 106
    triangularHeadlandStartZ: number; // 92
    triangularHeadlandEndZ: number;   // 99
  };
  airport: {
    startX: number; // 152 (48 blocks from coreCity.endX = 104, >= 30 blocks required; 18 blocks east of highway.endX = 134)
    endX: number;   // 221 (70 blocks longitudinal at Level 20 -> 50 x 70 = 3,500 grid blocks)
    startZ: number; // 12
    endZ: number;   // 61  (50 blocks perpendicular at Level 20 -> 50 x 70 = 3,500 grid blocks)
    level1EndX?: number; // 191 (40 blocks longitudinal at Level 1 -> 30 x 40 = 1,200 grid blocks)
    level1EndZ?: number; // 41  (30 blocks perpendicular at Level 1 -> 30 x 40 = 1,200 grid blocks)
    intermediateEndX?: number; // 201 (50 blocks longitudinal at Level 10 -> 40 x 50 = 2,000 grid blocks)
    intermediateEndZ?: number; // 51  (40 blocks perpendicular at Level 10 -> 40 x 50 = 2,000 grid blocks)
  };
  airportWarehouse: {
    startX: number; // 152 (Separate 10 x 10 Airport Cargo Warehouse reservation)
    endX: number;   // 161
    startZ: number; // 48
    endZ: number;   // 57
  };
  airportTransferYard: {
    startX: number; // 164 (Separate 10 x 10 Airport Transfer Yard reservation)
    endX: number;   // 173
    startZ: number; // 48
    endZ: number;   // 57
  };
}

export function createDefaultWorldConfig(
  gridWidth = 6000,
  gridDepth = 5060,
  cellSize = 2.0,
  minGx = -2740,
  minGz = -2330
): WorldConfigData {
  return {
    version: 1,
    seed: 20261110,
    gridWidth,
    gridDepth,
    minGx,
    minGz,
    maxGx: minGx + gridWidth - 1,
    maxGz: minGz + gridDepth - 1,
    expansionNorthBlocks: Math.max(0, -minGz),
    expansionSouthBlocks: Math.max(0, minGz + gridDepth - 240),
    expansionWestBlocks: Math.max(0, -minGx),
    expansionEastBlocks: Math.max(0, minGx + gridWidth - 360),
    previousGridWidth: 5000,
    previousGridDepth: 4060,
    expansion1GridWidth: 3600,
    expansion1GridDepth: 2850,
    expansion2GridWidth: 5000,
    expansion2GridDepth: 4060,
    coreMinGx: -80,
    coreMaxGx: 439,
    coreMinGz: -80,
    coreMaxGz: 319,
    coreGridWidth: 520,
    coreGridDepth: 400,
    cellSize,
    worldWidth: gridWidth * cellSize,
    worldDepth: gridDepth * cellSize,
    originX: -160,
    originZ: -120,
    defaultElevation: 1.2,
    minElevation: -3.5,
    maxElevation: 12.0,
    waterElevation: 0.0,
    maxGridWidth: 8000,
    maxGridDepth: 6800,
    chunkSizeCells: 40,
    legacyGridWidth: 200,
    legacyGridDepth: 120,
    railCorridor: {
      startX: 20,
      endX: 34,
      widthBlocks: 15,
      facilitiesStartX: 20,
      facilitiesEndX: 24,
      facilitiesWidthBlocks: 5,
      trackOpsStartX: 25,
      trackOpsEndX: 34,
      trackOpsWidthBlocks: 10,
      minZ: 12,
      maxZ: 92,
      maxParallelTracks: 6,
      designatedCrossingRows: [35, 55],
    },
    coreCity: {
      startX: 70,
      endX: 104,
      startZ: 34,
      endZ: 75,
      roundaboutCenterX: 86,
      roundaboutCenterZ: 55,
      roundaboutRadiusCells: 4,
    },
    highway: {
      startX: 123,
      endX: 134,
      previousStartX: 138,
      previousEndX: 149,
      shiftedLeftBlocks: 15,
      visibleStartZ: 18,
      visibleEndZ: 88,
      mainLanesTotal: 8,
      mainLanesPerDirection: 4,
      serviceRoadLanesTotal: 2,
      totalLanes: 10,
      mergeRowZ: 55,
    },
    port: {
      startX: 82,
      endX: 98,
      startZ: 88,
      endZ: 98,
      lowerLandStartX: 74,
      lowerLandEndX: 82,
      lowerLandStartZ: 92,
      lowerLandEndZ: 101,
      triangularHeadlandStartX: 99,
      triangularHeadlandEndX: 106,
      triangularHeadlandStartZ: 92,
      triangularHeadlandEndZ: 99,
    },
    airport: {
      startX: 152,
      endX: 221,
      startZ: 12,
      endZ: 61,
      level1EndX: 191,
      level1EndZ: 41,
      intermediateEndX: 201,
      intermediateEndZ: 51,
    },
    airportWarehouse: {
      startX: 152,
      endX: 161,
      startZ: 48,
      endZ: 57,
    },
    airportTransferYard: {
      startX: 164,
      endX: 173,
      startZ: 48,
      endZ: 57,
    },
  };
}

export const WORLD_CONFIG: WorldConfigData = createDefaultWorldConfig();
