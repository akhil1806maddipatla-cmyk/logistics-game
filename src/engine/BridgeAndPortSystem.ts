/**
 * Authoritative Bridge and Port/Harbour System (Master Prompt 5).
 *
 * Bridges:
 * - Only permitted across actual logical water bodies (RIVER, LAKE, OCEAN).
 * - Both endpoints must sit on valid land and connect to road/railway infrastructure.
 * - Road Bridges inherit exact width & lane layout (1x1 -> 2 lanes, 2x2 -> 4 lanes, 3x3 -> 6 lanes).
 * - Railway Bridges preserve track alignment, gauge, and clearance.
 * - Zero unnecessary prebuilt bridges: bridges appear when the player builds them.
 *
 * Port & Harbour:
 * - Modest starter harbour placed beside the existing natural Southern Sea (ocean-main).
 * - Shifted left away from the right-side freeway (gx 82..98, gz 88..98).
 * - Includes lower-side supporting land correction (gx 74..82, gz 92..101) and small triangular
 *   seaport headland (gx 99..106, gz 92..99).
 * - Zero unwanted automatic roads around the port.
 */

import { EntityRegistry } from './EntityRegistry';
import { GridCoord, GridSystem } from './GridSystem';
import { RailwaySystem } from './RailwaySystem';
import { RoadSystem } from './RoadSystem';
import { TerrainWaterSystem } from './TerrainWaterSystem';
import {
  ROAD_SPECS,
  RoadSpec,
  RoadWidthConfig,
  WaterClassification,
  WorldConfigData,
} from './WorldConfig';

export type BridgeCategory = 'ROAD_BRIDGE' | 'RAIL_BRIDGE';
export type BridgeStructuralStyle =
  | 'CONCRETE_GIRDER'
  | 'ARCH_SPAN'
  | 'STEEL_TRUSS'
  | 'CABLE_STAYED';

export interface BridgeRecord {
  id: string;
  category: BridgeCategory;
  bridgeStyle: BridgeStructuralStyle;
  startLand: GridCoord;
  endLand: GridCoord;
  pathCells: GridCoord[];
  waterCellsCrossed: GridCoord[];
  waterBodyClass: WaterClassification;
  roadWidthConfig?: RoadWidthConfig;
  roadSpec?: RoadSpec;
  connectedStartId?: string;
  connectedEndId?: string;
  deckElevation: number;
  clearanceHeight: number;
  spanLengthMeters: number;
  pierCount: number;
  abutmentCount: number;
}


export interface BridgeValidationResult {
  valid: boolean;
  reason?: string;
  pathCells: GridCoord[];
  waterCellsCrossed: GridCoord[];
  waterBodyClass: WaterClassification;
  connectedStartId?: string;
  connectedEndId?: string;
  roadSpec?: RoadSpec;
}

export interface PortBerth {
  id: string;
  name: string;
  minGx: number;
  maxGx: number;
  quayGz: number;
  waterEntryGz: number;
}

export interface PortHarbourRecord {
  id: string;
  name: string;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  adjacentWaterBodyId: string;
  usesNaturalWater: boolean;
  artificialWaterCreated: boolean;
  distanceFromHighwayBlocks: number;
  lowerLandArea: { minGx: number; maxGx: number; minGz: number; maxGz: number };
  triangularHeadlandArea: {
    minGx: number;
    maxGx: number;
    minGz: number;
    maxGz: number;
  };
  berths: PortBerth[];
  cargoApronArea: { minGx: number; maxGx: number; minGz: number; maxGz: number };
}

export class BridgeAndPortSystem {
  private config: WorldConfigData;
  private grid: GridSystem;
  private terrainWater: TerrainWaterSystem;
  private roads: RoadSystem;
  private railways: RailwaySystem;
  private entities: EntityRegistry;

  private bridges: Map<string, BridgeRecord> = new Map();
  private portHarbour!: PortHarbourRecord;
  private nextBridgeSeq = 1;

  constructor(
    config: WorldConfigData,
    grid: GridSystem,
    terrainWater: TerrainWaterSystem,
    roads: RoadSystem,
    railways: RailwaySystem,
    entities: EntityRegistry
  ) {
    this.config = config;
    this.grid = grid;
    this.terrainWater = terrainWater;
    this.roads = roads;
    this.railways = railways;
    this.entities = entities;
    this.initializeStarterHarbour();
  }

  /**
   * Initializes the modest starter coastal port & harbour beside the natural sea.
   * No prebuilt bridges and no automatic roads around the port.
   */
  public initializeStarterHarbour(): void {
    const pt = this.config.port;
    const hw = this.config.highway;

    const footprint: GridCoord[] = [];
    for (let gz = pt.startZ; gz <= pt.endZ; gz++) {
      for (let gx = pt.startX; gx <= pt.endX; gx++) {
        footprint.push({ gx, gz });
      }
    }

    this.portHarbour = {
      id: 'port-harbour-starter',
      name: 'Southbay Coastal Freight Harbour',
      minGx: pt.startX,
      maxGx: pt.endX,
      minGz: pt.startZ,
      maxGz: pt.endZ,
      adjacentWaterBodyId: 'ocean-main',
      usesNaturalWater: true,
      artificialWaterCreated: false,
      distanceFromHighwayBlocks: hw.startX - pt.endX,
      lowerLandArea: {
        minGx: pt.lowerLandStartX,
        maxGx: pt.lowerLandEndX,
        minGz: pt.lowerLandStartZ,
        maxGz: pt.lowerLandEndZ,
      },
      triangularHeadlandArea: {
        minGx: pt.triangularHeadlandStartX,
        maxGx: pt.triangularHeadlandEndX,
        minGz: pt.triangularHeadlandStartZ,
        maxGz: pt.triangularHeadlandEndZ,
      },
      berths: [
        {
          id: 'berth-west-1',
          name: 'Berth 1 (West Quay)',
          minGx: 84,
          maxGx: 89,
          quayGz: 98,
          waterEntryGz: 99,
        },
        {
          id: 'berth-east-2',
          name: 'Berth 2 (East Quay)',
          minGx: 91,
          maxGx: 96,
          quayGz: 98,
          waterEntryGz: 99,
        },
      ],
      cargoApronArea: {
        minGx: 84,
        maxGx: 96,
        minGz: 90,
        maxGz: 96,
      },
    };

    if (!this.entities.has(this.portHarbour.id)) {
      this.entities.register({
        id: this.portHarbour.id,
        category: 'PORT_HARBOUR',
        type: 'STARTER_COASTAL_HARBOUR',
        position: { gx: pt.startX, gz: pt.startZ },
        footprint,
        orientation: 0,
        elevation: 0.75,
        ownership: 'WORLD',
        active: true,
        metadata: {
          adjacentWaterBodyId: 'ocean-main',
          berthCount: 2,
        },
      });
    }
  }

  /**
   * Validates a proposed Road Bridge or Railway Bridge across actual water.
   */
  public validateBridgePlacement(
    category: BridgeCategory,
    startLand: GridCoord,
    endLand: GridCoord,
    roadWidthConfig: RoadWidthConfig = '1x1'
  ): BridgeValidationResult {
    const roadSpec =
      category === 'ROAD_BRIDGE' ? ROAD_SPECS[roadWidthConfig] : undefined;

    if (
      !this.grid.isValidGridCoord(startLand.gx, startLand.gz) ||
      !this.grid.isValidGridCoord(endLand.gx, endLand.gz)
    ) {
      return {
        valid: false,
        reason: 'Bridge endpoints are outside the playable world.',
        pathCells: [],
        waterCellsCrossed: [],
        waterBodyClass: WaterClassification.NONE,
        roadSpec,
      };
    }

    // Bridges must be aligned orthogonally (straight across water)
    if (startLand.gx !== endLand.gx && startLand.gz !== endLand.gz) {
      return {
        valid: false,
        reason: 'Bridge path must be aligned along the X or Z grid axis.',
        pathCells: [],
        waterCellsCrossed: [],
        waterBodyClass: WaterClassification.NONE,
        roadSpec,
      };
    }

    const spanDist =
      Math.abs(endLand.gx - startLand.gx) + Math.abs(endLand.gz - startLand.gz);
    if (spanDist < 2) {
      return {
        valid: false,
        reason: 'Bridge span is too short to cross a water body.',
        pathCells: [],
        waterCellsCrossed: [],
        waterBodyClass: WaterClassification.NONE,
        roadSpec,
      };
    }

    // Both endpoints MUST sit on valid land (not in water)
    if (
      this.terrainWater.isWaterAt(startLand.gx, startLand.gz) ||
      this.terrainWater.isWaterAt(endLand.gx, endLand.gz)
    ) {
      return {
        valid: false,
        reason:
          'Both bridge endpoints must sit on dry land outside the water body.',
        pathCells: [],
        waterCellsCrossed: [],
        waterBodyClass: WaterClassification.NONE,
        roadSpec,
      };
    }

    // Compute centerline path cells and full width footprint
    const centerline: GridCoord[] = [];
    const steps = spanDist;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const gx = Math.round(startLand.gx + (endLand.gx - startLand.gx) * t);
      const gz = Math.round(startLand.gz + (endLand.gz - startLand.gz) * t);
      centerline.push({ gx, gz });
    }

    const waterCellsCrossed: GridCoord[] = [];
    let detectedWaterClass: WaterClassification = WaterClassification.NONE;

    for (const c of centerline) {
      const wc = this.terrainWater.getWaterClassificationAt(c.gx, c.gz);
      if (wc !== null && wc !== WaterClassification.NONE) {
        waterCellsCrossed.push(c);
        if (detectedWaterClass === WaterClassification.NONE) {
          detectedWaterClass = wc;
        }
      }
    }

    // Rule: Bridges MUST cross actual logical water!
    if (waterCellsCrossed.length === 0) {
      return {
        valid: false,
        reason:
          'Bridges can only be built across actual water bodies (river, lake, or sea). Dry land cannot receive a bridge.',
        pathCells: centerline,
        waterCellsCrossed: [],
        waterBodyClass: WaterClassification.NONE,
        roadSpec,
      };
    }

    const fullPathCells =
      category === 'ROAD_BRIDGE'
        ? this.roads.computeStraightCells(startLand, endLand, roadWidthConfig)
        : centerline;

    // Check duplicate or overlapping bridge
    for (const b of this.bridges.values()) {
      for (const bc of b.pathCells) {
        for (const pc of fullPathCells) {
          if (bc.gx === pc.gx && bc.gz === pc.gz) {
            return {
              valid: false,
              reason: `Bridge path overlaps existing bridge ${b.id}.`,
              pathCells: fullPathCells,
              waterCellsCrossed,
              waterBodyClass: detectedWaterClass,
              roadSpec,
            };
          }
        }
      }
    }

    // Network endpoint connectivity validation
    let connectedStartId: string | undefined;
    let connectedEndId: string | undefined;

    if (category === 'ROAD_BRIDGE') {
      const startRoad = this.findAdjacentRoad(startLand);
      const endRoad = this.findAdjacentRoad(endLand);
      connectedStartId = startRoad?.id;
      connectedEndId = endRoad?.id;
    } else {
      const startTrack = this.findAdjacentTrack(startLand);
      const endTrack = this.findAdjacentTrack(endLand);
      connectedStartId = startTrack;
      connectedEndId = endTrack;
    }

    return {
      valid: true,
      pathCells: fullPathCells,
      waterCellsCrossed,
      waterBodyClass: detectedWaterClass,
      connectedStartId,
      connectedEndId,
      roadSpec,
    };
  }

  private findAdjacentRoad(coord: GridCoord) {
    const direct = this.roads.getRoadAtCell(coord.gx, coord.gz);
    if (direct) return direct;
    const offsets = [
      { dx: -1, dz: 0 },
      { dx: 1, dz: 0 },
      { dx: 0, dz: -1 },
      { dx: 0, dz: 1 },
    ];
    for (const o of offsets) {
      const r = this.roads.getRoadAtCell(coord.gx + o.dx, coord.gz + o.dz);
      if (r) return r;
    }
    return undefined;
  }

  private findAdjacentTrack(coord: GridCoord): string | undefined {
    for (const t of this.railways.getAllTracks()) {
      for (const c of t.coveredCells) {
        if (Math.abs(c.gx - coord.gx) <= 1 && Math.abs(c.gz - coord.gz) <= 1) {
          return t.id;
        }
      }
    }
    return undefined;
  }

  /**
   * Builds a Road Bridge or Railway Bridge across actual water and updates network connectivity.
   */
  public buildBridge(
    category: BridgeCategory,
    startLand: GridCoord,
    endLand: GridCoord,
    roadWidthConfig: RoadWidthConfig = '1x1'
  ): {
    success: boolean;
    reason?: string;
    bridge?: BridgeRecord;
  } {
    const validation = this.validateBridgePlacement(
      category,
      startLand,
      endLand,
      roadWidthConfig
    );
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    const id = `bridge-${category === 'ROAD_BRIDGE' ? 'road' : 'rail'}-${this.nextBridgeSeq++}`;

    // If a road bridge's land endpoints don't already have road approach cells, connect them
    let startRoadId = validation.connectedStartId;
    let endRoadId = validation.connectedEndId;

    if (category === 'ROAD_BRIDGE') {
      // Also connect to nearest inland roads on the same row/col if within 6 blocks
      if (!startRoadId) {
        startRoadId = this.findNearestRoadAlongAxis(startLand, 12);
      }
      if (!endRoadId) {
        endRoadId = this.findNearestRoadAlongAxis(endLand, 12);
      }
    }

    const spanBlocks =
      Math.abs(endLand.gx - startLand.gx) + Math.abs(endLand.gz - startLand.gz);
    const spanLengthMeters = spanBlocks * this.config.cellSize;
    const bridgeStyle: BridgeStructuralStyle =
      category === 'RAIL_BRIDGE'
        ? 'STEEL_TRUSS'
        : roadWidthConfig === '3x3'
          ? 'CABLE_STAYED'
          : roadWidthConfig === '2x2' || spanBlocks >= 7
            ? 'ARCH_SPAN'
            : 'CONCRETE_GIRDER';
    const pierCount = Math.max(
      1,
      Math.floor(validation.waterCellsCrossed.length / 2)
    );

    const record: BridgeRecord = {
      id,
      category,
      bridgeStyle,
      startLand: { ...startLand },
      endLand: { ...endLand },
      pathCells: validation.pathCells,
      waterCellsCrossed: validation.waterCellsCrossed,
      waterBodyClass: validation.waterBodyClass,
      roadWidthConfig: category === 'ROAD_BRIDGE' ? roadWidthConfig : undefined,
      roadSpec: validation.roadSpec,
      connectedStartId: startRoadId,
      connectedEndId: endRoadId,
      deckElevation: 2.1,
      clearanceHeight: 2.1,
      spanLengthMeters,
      pierCount,
      abutmentCount: 2,
    };

    this.bridges.set(id, record);
    this.entities.register({
      id,
      category: category,
      type:
        category === 'ROAD_BRIDGE'
          ? `ROAD_BRIDGE_${roadWidthConfig}`
          : 'RAIL_BRIDGE_STANDARD',
      position: { ...startLand },
      footprint: validation.pathCells,
      orientation: 0,
      elevation: record.deckElevation,
      ownership: 'PLAYER',
      active: true,
      metadata: {
        category,
        bridgeStyle,
        roadWidthConfig: record.roadWidthConfig,
        totalLanes: record.roadSpec?.totalLanes,
        waterCellsCount: record.waterCellsCrossed.length,
        spanLengthMeters,
        pierCount,
        abutmentCount: 2,
      },
    });

    this.syncRoadBridgeConnectivity();

    return { success: true, bridge: record };
  }


  private findNearestRoadAlongAxis(
    coord: GridCoord,
    maxSearchCells: number
  ): string | undefined {
    for (let step = 1; step <= maxSearchCells; step++) {
      const candidates = [
        { gx: coord.gx - step, gz: coord.gz },
        { gx: coord.gx + step, gz: coord.gz },
        { gx: coord.gx, gz: coord.gz - step },
        { gx: coord.gx, gz: coord.gz + step },
      ];
      for (const c of candidates) {
        const r = this.roads.getRoadAtCell(c.gx, c.gz);
        if (r) return r.id;
      }
    }
    return undefined;
  }

  /**
   * Demolishes a bridge, removing its logical record, entity, and network connection
   * while leaving the underlying water body completely intact.
   */
  public demolishBridge(bridgeId: string): {
    success: boolean;
    reason?: string;
  } {
    const existing = this.bridges.get(bridgeId);
    if (!existing) {
      return { success: false, reason: `Bridge ${bridgeId} not found.` };
    }

    this.bridges.delete(bridgeId);
    this.entities.unregister(bridgeId);
    this.syncRoadBridgeConnectivity();

    return { success: true };
  }

  private syncRoadBridgeConnectivity(): void {
    const links: Array<{ roadIdA: string; roadIdB: string }> = [];
    for (const b of this.bridges.values()) {
      if (
        b.category === 'ROAD_BRIDGE' &&
        b.connectedStartId &&
        b.connectedEndId
      ) {
        links.push({
          roadIdA: b.connectedStartId,
          roadIdB: b.connectedEndId,
        });
      }
    }
    this.roads.setExternalBridgeLinks(links);
  }

  public getBridgeAtCell(gx: number, gz: number): BridgeRecord | undefined {
    for (const b of this.bridges.values()) {
      for (const c of b.pathCells) {
        if (c.gx === gx && c.gz === gz) return b;
      }
    }
    return undefined;
  }

  public getAllBridges(): BridgeRecord[] {
    return Array.from(this.bridges.values());
  }

  public getPortHarbour(): PortHarbourRecord {
    return this.portHarbour;
  }
}
