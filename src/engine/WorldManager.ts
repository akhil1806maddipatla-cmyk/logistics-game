/**
 * Authoritative World Manager & Save/Persistence System (Master Prompts 1 through 5).
 * Coordinates all logical world sub-systems independently of the Three.js renderer.
 */

import { BridgeAndPortSystem, BridgeCategory } from './BridgeAndPortSystem';
import { DistrictSystem } from './DistrictSystem';
import {
  EconomyAndSimulationSystem,
  PlacedBuildingRecord,
  SerializedEconomyState,
} from './EconomyAndSimulationSystem';
import { EntityRegistry, WorldEntityRecord } from './EntityRegistry';
import { GridCoord, GridSystem } from './GridSystem';
import { ParcelSystem } from './ParcelSystem';
import { RailwaySystem } from './RailwaySystem';
import { RoadSystem } from './RoadSystem';
import { TerrainWaterSystem } from './TerrainWaterSystem';
import {
  createDefaultWorldConfig,
  RoadWidthConfig,
  TerrainCategory,
  WaterClassification,
  WorldConfigData,
  ZoneCategory,
} from './WorldConfig';
import {
  SerializedMassiveWorldState,
  WorldStreamingAndPrecisionSystem,
} from './WorldStreamingAndPrecisionSystem';

export interface CellInspectionReport {
  gx: number;
  gz: number;
  worldX: number;
  worldZ: number;
  valid: boolean;
  elevation: number;
  terrainCategory: string;
  waterClassification: string;
  isCoastlineOrBank: boolean;
  zoneCategory: string;
  districtName: string;
  parcelId: string;
  parcelName: string;
  parcelBuildability: string;
  parcelOwned: boolean;
  parcelPrice: number;
  parcelUnlockLevel: number;
  roadId?: string;
  roadWidthConfig?: RoadWidthConfig;
  roadConnectedToHighway?: boolean;
  bridgeId?: string;
  building?: PlacedBuildingRecord;
  entityIds: string[];
}

export interface SerializedWorldState {
  schemaVersion: number;
  savedAt: string;
  config: WorldConfigData;
  playerRoads: Array<{
    start: GridCoord;
    end: GridCoord;
    widthConfig: RoadWidthConfig;
    shape: 'STRAIGHT' | 'CURVED';
    controlPoint?: GridCoord;
  }>;
  parallelTrackCount: number;
  playerRailCorridors?: Array<{
    start: GridCoord;
    end: GridCoord;
  }>;
  unlockedParcelIds: string[];
  clearedForestBounds?: Array<{
    minGx: number;
    maxGx: number;
    minGz: number;
    maxGz: number;
  }>;
  bridges: Array<{
    category: BridgeCategory;
    startLand: GridCoord;
    endLand: GridCoord;
    roadWidthConfig?: RoadWidthConfig;
  }>;
  economy?: SerializedEconomyState;
  massiveWorld?: SerializedMassiveWorldState;
}

export class WorldManager {
  public config: WorldConfigData;
  public grid: GridSystem;
  public entities: EntityRegistry;
  public districts: DistrictSystem;
  public parcels: ParcelSystem;
  public terrainWater: TerrainWaterSystem;
  public roads: RoadSystem;
  public railways: RailwaySystem;
  public bridgesAndPort: BridgeAndPortSystem;
  public economy: EconomyAndSimulationSystem;
  public streaming: WorldStreamingAndPrecisionSystem;

  constructor(initialConfig?: WorldConfigData) {
    this.config = initialConfig
      ? { ...initialConfig }
      : createDefaultWorldConfig();
    this.grid = new GridSystem(this.config);
    this.entities = new EntityRegistry();
    this.districts = new DistrictSystem(this.config);
    this.terrainWater = new TerrainWaterSystem(this.config, this.grid);
    this.parcels = new ParcelSystem(this.config);

    this.parcels.initializeParcels(
      (gx, gz) =>
        this.terrainWater.getWaterClassificationAt(gx, gz) ??
        WaterClassification.NONE,
      (gx, gz) =>
        this.terrainWater.getTerrainCategoryAt(gx, gz) ?? TerrainCategory.GRASS,
      (gx, gz) => this.districts.getZoneAt(gx, gz)
    );

    this.roads = new RoadSystem(
      this.config,
      this.grid,
      this.terrainWater,
      this.districts,
      this.entities
    );

    this.railways = new RailwaySystem(
      this.config,
      this.grid,
      this.terrainWater,
      this.districts,
      this.parcels,
      this.entities
    );

    // Connect road construction to designated railway crossings
    this.roads.setRailCrossingHooks(
      (roadId, rowGz, widthConfig) =>
        this.railways.registerRoadAcrossCrossing(roadId, rowGz, widthConfig),
      (roadId) => this.railways.unregisterRoadFromCrossing(roadId)
    );

    this.bridgesAndPort = new BridgeAndPortSystem(
      this.config,
      this.grid,
      this.terrainWater,
      this.roads,
      this.railways,
      this.entities
    );

    this.economy = new EconomyAndSimulationSystem(
      this.config,
      this.grid,
      this.terrainWater,
      this.districts,
      this.parcels,
      this.roads,
      this.railways,
      this.entities
    );

    this.streaming = new WorldStreamingAndPrecisionSystem(
      this.config,
      this.grid,
      this.terrainWater,
      64
    );
    const startCenter = this.grid.gridToWorld(78, 55);
    this.streaming.flushAllPendingChunks(startCenter.x, startCenter.z);
  }

  /**
   * Expands the logical world dimensions without altering existing cell coordinates,
   * world origin, entity positions, or parcel IDs.
   */
  public expandWorld(
    addGridWidth: number,
    addGridDepth: number
  ): {
    success: boolean;
    reason?: string;
    newGridWidth: number;
    newGridDepth: number;
  } {
    if (addGridWidth < 0 || addGridDepth < 0 || (addGridWidth === 0 && addGridDepth === 0)) {
      return {
        success: false,
        reason: 'Expansion increments must be positive.',
        newGridWidth: this.config.gridWidth,
        newGridDepth: this.config.gridDepth,
      };
    }

    const nextW = Math.min(
      this.config.gridWidth + addGridWidth,
      this.config.maxGridWidth
    );
    const nextD = Math.min(
      this.config.gridDepth + addGridDepth,
      this.config.maxGridDepth
    );

    if (nextW === this.config.gridWidth && nextD === this.config.gridDepth) {
      return {
        success: false,
        reason: 'World has already reached maximum configured expansion limits.',
        newGridWidth: nextW,
        newGridDepth: nextD,
      };
    }

    const minGx = this.config.minGx ?? 0;
    const minGz = this.config.minGz ?? 0;
    const updatedConfig: WorldConfigData = {
      ...this.config,
      gridWidth: nextW,
      gridDepth: nextD,
      maxGx: minGx + nextW - 1,
      maxGz: minGz + nextD - 1,
      worldWidth: nextW * this.config.cellSize,
      worldDepth: nextD * this.config.cellSize,
    };

    this.config = updatedConfig;
    this.grid.updateConfig(updatedConfig);
    this.districts.handleWorldExpansion(updatedConfig);
    this.terrainWater.handleWorldExpansion(updatedConfig, this.grid);
    this.parcels.handleWorldExpansion(
      updatedConfig,
      (gx, gz) =>
        this.terrainWater.getWaterClassificationAt(gx, gz) ??
        WaterClassification.NONE,
      (gx, gz) =>
        this.terrainWater.getTerrainCategoryAt(gx, gz) ?? TerrainCategory.GRASS,
      (gx, gz) => this.districts.getZoneAt(gx, gz)
    );

    return {
      success: true,
      newGridWidth: nextW,
      newGridDepth: nextD,
    };
  }

  /**
   * Inspects all logical layers at cell (gx, gz) for UI and developer diagnostics.
   */
  public inspectCell(gx: number, gz: number): CellInspectionReport {
    const valid = this.grid.isValidGridCoord(gx, gz);
    const worldPos = this.grid.gridToWorld(gx, gz);
    if (!valid) {
      return {
        gx,
        gz,
        worldX: worldPos.x,
        worldZ: worldPos.z,
        valid: false,
        elevation: 0,
        terrainCategory: 'OUT_OF_BOUNDS',
        waterClassification: 'OUT_OF_BOUNDS',
        isCoastlineOrBank: false,
        zoneCategory: 'OUT_OF_BOUNDS',
        districtName: 'Outside Playable Map',
        parcelId: 'NONE',
        parcelName: 'Outside Playable Map',
        parcelBuildability: 'UNAVAILABLE',
        parcelOwned: false,
        parcelPrice: 0,
        parcelUnlockLevel: 1,
        entityIds: [],
      };
    }

    const elev = this.terrainWater.getElevationAtGrid(gx, gz) ?? 0;
    const tCat =
      this.terrainWater.getTerrainCategoryAt(gx, gz) ?? TerrainCategory.GRASS;
    const wClass =
      this.terrainWater.getWaterClassificationAt(gx, gz) ??
      WaterClassification.NONE;
    const zCat = this.districts.getZoneAt(gx, gz);
    const dist = this.districts.getDistrictAt(gx, gz);
    const parcel = this.parcels.getParcelAt(gx, gz);
    const road = this.roads.getRoadAtCell(gx, gz);
    const bridge = this.bridgesAndPort.getBridgeAtCell(gx, gz);
    const building = this.economy.getPlacedBuildingAtCell(gx, gz);
    const ents = this.entities.getEntitiesAtCell(gx, gz);

    return {
      gx,
      gz,
      worldX: Number(worldPos.x.toFixed(1)),
      worldZ: Number(worldPos.z.toFixed(1)),
      valid: true,
      elevation: Number(elev.toFixed(2)),
      terrainCategory: TerrainCategory[tCat],
      waterClassification: WaterClassification[wClass],
      isCoastlineOrBank: this.terrainWater.isCoastlineOrBankAt(gx, gz),
      zoneCategory: ZoneCategory[zCat],
      districtName: dist ? dist.name : 'Open Regional Land',
      parcelId: parcel ? parcel.id : 'NONE',
      parcelName: parcel ? parcel.name : 'Regional Sector',
      parcelBuildability: parcel ? parcel.buildability : 'UNKNOWN',
      parcelOwned: parcel ? parcel.owned : false,
      parcelPrice: parcel ? parcel.price : 0,
      parcelUnlockLevel: parcel ? parcel.unlockLevel : 1,
      roadId: road?.id,
      roadWidthConfig: road?.widthConfig,
      roadConnectedToHighway: road?.isConnectedToHighway,
      bridgeId: bridge?.id,
      building,
      entityIds: ents.map((e: WorldEntityRecord) => e.id),
    };
  }

  /**
   * Serializes the complete logical world state without raw Three.js mesh objects.
   */
  public serializeState(): string {
    const playerRoads = this.roads
      .getAllSegments()
      .filter((s) => !s.isPreplaced)
      .map((s) => ({
        start: { ...s.start },
        end: { ...s.end },
        widthConfig: s.widthConfig,
        shape: (s.shape === 'CURVED' ? 'CURVED' : 'STRAIGHT') as
          | 'STRAIGHT'
          | 'CURVED',
        controlPoint: s.controlPoint ? { ...s.controlPoint } : undefined,
      }));

    const bridges = this.bridgesAndPort.getAllBridges().map((b) => ({
      category: b.category,
      startLand: { ...b.startLand },
      endLand: { ...b.endLand },
      roadWidthConfig: b.roadWidthConfig,
    }));

    const unlockedParcelIds = this.parcels
      .getAllParcels()
      .filter((p) => p.owned)
      .map((p) => p.id);

    const yardTrackCount = this.railways
      .getAllTracks()
      .filter((t) => t.lineNumber >= 1 && t.lineNumber <= 6).length;

    const payload: SerializedWorldState = {
      schemaVersion: this.config.version,
      savedAt: new Date().toISOString(),
      config: { ...this.config },
      playerRoads,
      parallelTrackCount: yardTrackCount,
      playerRailCorridors: this.railways.getWorldScaleTrackCorridors(),
      unlockedParcelIds,
      clearedForestBounds: this.terrainWater.getClearedForestBounds(),
      bridges,
      economy: this.economy.serializeEconomyState(),
      massiveWorld: this.streaming.serializeState(),
    };

    return JSON.stringify(payload);
  }

  /**
   * Reconstructs the logical world from a serialized JSON state with diagnostic validation.
   */
  public deserializeState(jsonString: string): {
    success: boolean;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(jsonString) as Partial<SerializedWorldState>;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.schemaVersion !== 'number' ||
        !parsed.config ||
        typeof parsed.config.gridWidth !== 'number' ||
        typeof parsed.config.gridDepth !== 'number'
      ) {
        return {
          success: false,
          error:
            'Invalid save schema: missing schemaVersion or world configuration dimensions.',
        };
      }

      if (parsed.schemaVersion !== 1) {
        return {
          success: false,
          error: `Unsupported save schema version: ${parsed.schemaVersion}. Expected version 1.`,
        };
      }

      // Rebuild core systems with saved config (migrating legacy 200x120 or 360x240 configs to expanded 520x400 bounds)
      const defaultCfg = createDefaultWorldConfig();
      const migratedWidth = Math.max(parsed.config.gridWidth, defaultCfg.gridWidth);
      const migratedDepth = Math.max(parsed.config.gridDepth, defaultCfg.gridDepth);
      const migratedMinGx = Math.min(parsed.config.minGx ?? 0, defaultCfg.minGx);
      const migratedMinGz = Math.min(parsed.config.minGz ?? 0, defaultCfg.minGz);
      const cellSize = parsed.config.cellSize || defaultCfg.cellSize;
      this.config = {
        ...defaultCfg,
        ...parsed.config,
        gridWidth: migratedWidth,
        gridDepth: migratedDepth,
        minGx: migratedMinGx,
        minGz: migratedMinGz,
        maxGx: migratedMinGx + migratedWidth - 1,
        maxGz: migratedMinGz + migratedDepth - 1,
        coreMinGx: defaultCfg.coreMinGx,
        coreMaxGx: defaultCfg.coreMaxGx,
        coreMinGz: defaultCfg.coreMinGz,
        coreMaxGz: defaultCfg.coreMaxGz,
        coreGridWidth: defaultCfg.coreGridWidth,
        coreGridDepth: defaultCfg.coreGridDepth,
        expansion1GridWidth: defaultCfg.expansion1GridWidth,
        expansion1GridDepth: defaultCfg.expansion1GridDepth,
        highway: defaultCfg.highway,
        worldWidth: migratedWidth * cellSize,
        worldDepth: migratedDepth * cellSize,
        maxGridWidth: Math.max(parsed.config.maxGridWidth || 0, defaultCfg.maxGridWidth),
        maxGridDepth: Math.max(parsed.config.maxGridDepth || 0, defaultCfg.maxGridDepth),
        chunkSizeCells: parsed.config.chunkSizeCells || defaultCfg.chunkSizeCells,
      };
      this.grid.updateConfig(this.config);
      this.entities.clear();
      this.districts = new DistrictSystem(this.config);
      this.terrainWater = new TerrainWaterSystem(this.config, this.grid);
      this.parcels = new ParcelSystem(this.config);
      this.parcels.initializeParcels(
        (gx, gz) =>
          this.terrainWater.getWaterClassificationAt(gx, gz) ??
          WaterClassification.NONE,
        (gx, gz) =>
          this.terrainWater.getTerrainCategoryAt(gx, gz) ??
          TerrainCategory.GRASS,
        (gx, gz) => this.districts.getZoneAt(gx, gz)
      );

      if (Array.isArray(parsed.unlockedParcelIds)) {
        for (const pid of parsed.unlockedParcelIds) {
          this.parcels.acquireParcel(pid, 999);
        }
      }
      if (Array.isArray(parsed.clearedForestBounds)) {
        this.terrainWater.restoreClearedForestBounds(parsed.clearedForestBounds);
      }

      this.roads = new RoadSystem(
        this.config,
        this.grid,
        this.terrainWater,
        this.districts,
        this.entities
      );
      this.railways = new RailwaySystem(
        this.config,
        this.grid,
        this.terrainWater,
        this.districts,
        this.parcels,
        this.entities
      );
      this.roads.setRailCrossingHooks(
        (roadId, rowGz, widthConfig) =>
          this.railways.registerRoadAcrossCrossing(roadId, rowGz, widthConfig),
        (roadId) => this.railways.unregisterRoadFromCrossing(roadId)
      );

      this.bridgesAndPort = new BridgeAndPortSystem(
        this.config,
        this.grid,
        this.terrainWater,
        this.roads,
        this.railways,
        this.entities
      );

      this.economy = new EconomyAndSimulationSystem(
        this.config,
        this.grid,
        this.terrainWater,
        this.districts,
        this.parcels,
        this.roads,
        this.railways,
        this.entities
      );

      if (parsed.economy) {
        this.economy.deserializeEconomyState(parsed.economy);
      }

      // Reconstruct expanded parallel tracks
      const targetTracks = parsed.parallelTrackCount ?? 1;
      for (let i = 1; i < targetTracks; i++) {
        this.railways.expandNextParallelTrackLine();
      }
      if (parsed.economy?.railHub) {
        this.railways.deserializeHubState(parsed.economy.railHub);
      }

      // Reconstruct world-scale railway corridors
      if (Array.isArray(parsed.playerRailCorridors)) {
        for (const rc of parsed.playerRailCorridors) {
          if (rc.start && rc.end) {
            this.railways.buildWorldScaleTrackCorridor(rc.start, rc.end);
          }
        }
      }

      // Reconstruct player-built roads
      if (Array.isArray(parsed.playerRoads)) {
        for (const pr of parsed.playerRoads) {
          this.roads.buildRoad(
            pr.start,
            pr.end,
            pr.widthConfig,
            pr.shape,
            pr.controlPoint
          );
        }
      }

      // Reconstruct player-built bridges
      if (Array.isArray(parsed.bridges)) {
        for (const br of parsed.bridges) {
          this.bridgesAndPort.buildBridge(
            br.category,
            br.startLand,
            br.endLand,
            br.roadWidthConfig ?? '1x1'
          );
        }
      }

      this.streaming = new WorldStreamingAndPrecisionSystem(
        this.config,
        this.grid,
        this.terrainWater,
        64
      );
      if (parsed.massiveWorld) {
        this.streaming.deserializeState(parsed.massiveWorld);
      }
      const reb = this.streaming.originRebaser.getOriginOffset();
      this.streaming.flushAllPendingChunks(reb.x, reb.z);

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Failed to parse save state JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
