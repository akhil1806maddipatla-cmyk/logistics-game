/**
 * Authoritative Railway Network, 40×50 Railway Freight Terminal Compound,
 * Infinite Straight-Line Track Extension, Job-Triggered GTE-L1 Train &
 * GTE Model 360 Forklift Choreography, and Designated Crossings.
 */

import { DistrictSystem } from './DistrictSystem';
import { EntityRegistry } from './EntityRegistry';
import { GridCoord, GridSystem } from './GridSystem';
import { ParcelSystem } from './ParcelSystem';
import { TerrainWaterSystem } from './TerrainWaterSystem';
import {
  RailCorridorSection,
  RoadWidthConfig,
  WorldConfigData,
  ZoneCategory,
} from './WorldConfig';

export type TrackOccupancyState = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE';

/**
 * Strict Y-Axis Elevation Layering Offsets (relative to base terrain Y = 1.20)
 * to eliminate all Z-fighting across the 40×50 Railway Yard and mainline tracks.
 */
export const RAIL_ELEVATION_LAYERS = {
  baseTerrainGrassOffset: 0.0,
  crushedBallastOffset: 0.02,
  railTiesAndConcretePadOffset: 0.03,
  asphaltRoadsAndLoadingBaysOffset: 0.04,
  steelRailsAndMarkingsOffset: 0.05,
} as const;

/**
 * Dedicated 40 × 50 Tile Reserved Footprint for the Main Railway Freight Terminal Compound
 * (`gx = -5..34` -> 40 tiles wide; `gz = 30..79` -> 50 tiles deep = 2,000 grid tiles).
 */
export const RAILWAY_YARD_RESERVED_FOOTPRINT = {
  id: 'rail-freight-terminal-compound-40x50',
  name: 'GTE Railway Freight Terminal & Switchyard Compound',
  minGx: -5,
  maxGx: 34,
  minGz: 30,
  maxGz: 79,
  widthCells: 40,
  depthCells: 50,
  totalCells: 2000,
  purchasePrice: 185000,
  hasLooseClutterOnTracksOrPathways: false,
} as const;

export const RAILWAY_YARD_LOCKED_UI_TITLE = 'Railway Yard - Locked';

/**
 * Technical Specifications for the GTE Logistics Rolling Stock & Model 360 Forklift
 * matching the supplied technical reference sheets.
 */
export type GteWagonModelId =
  | 'Boxcar-T1'
  | 'Tankcar-O1'
  | 'Tankcar-W1'
  | 'Flatbed-C1';

export interface GteRollingStockSpec {
  locomotiveModel: 'GTE-L1';
  locomotiveBodyHex: number;
  locomotiveStripeYellowHex: number;
  locomotiveStripeBlueHex: number;
  hasGteLogo: boolean;
  wagons: Array<{
    modelId: GteWagonModelId;
    name: string;
    bodyColorHex: number;
    accentColorHex: number;
    cargoDescription: string;
  }>;
}

export const GTE_ROLLING_STOCK_SPEC: GteRollingStockSpec = {
  locomotiveModel: 'GTE-L1',
  locomotiveBodyHex: 0xe13b31,
  locomotiveStripeYellowHex: 0xfbbf24,
  locomotiveStripeBlueHex: 0x1d4ed8,
  hasGteLogo: true,
  wagons: [
    {
      modelId: 'Boxcar-T1',
      name: 'Teal Ribbed Boxcar (Boxcar-T1)',
      bodyColorHex: 0x14b8a6,
      accentColorHex: 0x0f766e,
      cargoDescription: 'Palletized crates & packaged industrial goods',
    },
    {
      modelId: 'Tankcar-O1',
      name: 'Orange Pressurized Tank Car (Tankcar-O1)',
      bodyColorHex: 0xf97316,
      accentColorHex: 0xc2410c,
      cargoDescription: 'Refined industrial fuels & chemical feedstock',
    },
    {
      modelId: 'Tankcar-W1',
      name: 'White Cylindrical Tank Car (Tankcar-W1)',
      bodyColorHex: 0xf8fafc,
      accentColorHex: 0xef4444,
      cargoDescription: 'Cryogenic & food-grade liquid bulk',
    },
    {
      modelId: 'Flatbed-C1',
      name: 'Intermodal Container Flatbed (Flatbed-C1)',
      bodyColorHex: 0xf59e0b,
      accentColorHex: 0x2563eb,
      cargoDescription: 'Multi-color stacked ISO intermodal containers',
    },
  ],
};

export const GTE_FORKLIFT_MODEL_360_SPEC = {
  modelId: 'GTE-Forklift-360',
  name: 'GTE Logistics Forklift Model 360',
  bodyColorHex: 0xf59e0b,
  mastAndCageColorHex: 0x27272a,
  hasGteLogisticsLogo: true,
  hasDiagonalHazardCounterweightStripes: true,
} as const;

export type RailTrainOperationalState =
  | 'IDLE'
  | 'LOADING'
  | 'DEPARTING'
  | 'IN_TRANSIT'
  | 'RETURNING';

export type RailForkliftOperationalState =
  | 'IDLE_AT_BAY'
  | 'MOVING_TO_DOCK'
  | 'LIFTING_CARGO'
  | 'CARRYING_TO_TRAIN'
  | 'PLACING_ON_WAGON'
  | 'RETURNING_TO_BAY';

export interface RailYardForkliftRecord {
  id: string;
  bayNumber: number;
  modelId: 'GTE-Forklift-360';
  state: RailForkliftOperationalState;
  homeGx: number;
  homeGz: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  speed: number;
  forkHeightRatio: number; // 0..1
  carryingCargo: boolean;
  carryingColorHex: number;
  wheelRotationRad: number;
  targetWagonIndex: number; // 0..3
  cycleProgress: number; // 0..1
}

export interface RailYardStagingTruckRecord {
  id: string;
  dockNumber: number;
  name: string;
  gx: number;
  gz: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  status: 'DOCKED_OFFLOADING' | 'STAGED_READY';
}

export interface RailBulkCargoJobRecord {
  id: string;
  title: string;
  cargoType: 'CONTAINERS' | 'ORES' | 'TIMBER' | 'MACHINERY' | 'LIQUID_TANKS';
  cargoLabel: string;
  cargoTons: number;
  cashReward: number;
  xpReward: number;
  destinationName: string;
  status: 'AVAILABLE' | 'LOADING' | 'IN_TRANSIT';
  assignedTrainId?: string;
  completedCount: number;
}

export interface RailTrainConsistRecord {
  id: string;
  name: string;
  locomotiveModel: 'GTE-L1';
  wagonModels: GteWagonModelId[];
  trackId: string;
  sidingNumber: number;
  gx: number;
  homeGz: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  state: RailTrainOperationalState;
  engineState: 'POWERED_DOWN_IDLE' | 'ACTIVE_TRACTION';
  currentSpeedKmh: number;
  targetSpeedKmh: number;
  loadingProgressPercent: number; // 0..100
  loadedWagonCount: number; // 0..4
  assignedJobId?: string;
  assignedContractId?: string;
  signalAspect: 'RED' | 'GREEN';
  hornSounded: boolean;
  wheelRotationRad: number;
  transitTimerSec: number;
  transitDurationSec: number;
}

export interface RailwayFreightHubState {
  owned: boolean;
  level: number;
  maxLevel: number;
  purchasePrice: number;
  upgradeCost: number;
  reservedFootprint: typeof RAILWAY_YARD_RESERVED_FOOTPRINT;
  elevationLayers: typeof RAIL_ELEVATION_LAYERS;
  trains: RailTrainConsistRecord[];
  forklifts: RailYardForkliftRecord[];
  stagingTrucks: RailYardStagingTruckRecord[];
  jobs: RailBulkCargoJobRecord[];
  totalDispatchesCompleted: number;
}

export interface SerializedRailwayHubState {
  owned: boolean;
  level: number;
  totalDispatchesCompleted: number;
  trains: Array<{
    id: string;
    state: RailTrainOperationalState;
    worldZ: number;
    currentSpeedKmh: number;
    loadingProgressPercent: number;
    loadedWagonCount: number;
    assignedJobId?: string;
    assignedContractId?: string;
    signalAspect: 'RED' | 'GREEN';
    hornSounded: boolean;
    transitTimerSec: number;
  }>;
  jobs: Array<{
    id: string;
    status: 'AVAILABLE' | 'LOADING' | 'IN_TRANSIT';
    assignedTrainId?: string;
    completedCount: number;
  }>;
}

export interface RailwayTrackRecord {
  id: string;
  lineNumber: number; // 1..6 for yard lines, >= 100 for world-scale expansion corridors
  gx: number;         // Longitudinal track column inside gx 25..34 (or primary gx)
  startGz: number;
  endGz: number;
  startCoord?: GridCoord;
  endCoord?: GridCoord;
  coveredCells: GridCoord[];
  connectedTrackIds: string[];
  occupancy: TrackOccupancyState;
  isStarter: boolean;
}

export interface RailwayDepotRecord {
  id: string;
  name: string;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  connectedTrackId: string;
  isStarter: boolean;
}

export interface RailwayStationRecord {
  id: string;
  name: string;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  associatedTrackId: string;
  platformClearanceValid: boolean;
}

export interface RailwayCrossingRecord {
  id: string;
  rowGz: number;
  minGx: number;
  maxGx: number;
  authorized: boolean;
  roadId?: string;
  roadWidthConfig: RoadWidthConfig;
  crossedTrackIds: string[];
  hasGates: boolean;
  gateState: 'OPEN' | 'LOWERING' | 'CLOSED';
}

export class RailwaySystem {
  private config: WorldConfigData;
  private grid: GridSystem;
  private terrainWater: TerrainWaterSystem;
  private districts: DistrictSystem;
  private parcels: ParcelSystem;
  private entities: EntityRegistry;

  private tracks: Map<string, RailwayTrackRecord> = new Map();
  private depots: Map<string, RailwayDepotRecord> = new Map();
  private stations: Map<string, RailwayStationRecord> = new Map();
  private crossings: Map<string, RailwayCrossingRecord> = new Map();

  private hubState!: RailwayFreightHubState;
  private onJobRewardCallback?: (job: RailBulkCargoJobRecord, train: RailTrainConsistRecord) => void;

  /**
   * 6 planned parallel track columns inside the 10-block Track Operations area (gx 25..34):
   * Line 1: gx=26, Line 2: gx=27, Line 3: gx=29, Line 4: gx=30, Line 5: gx=32, Line 6: gx=33.
   */
  public static readonly TRACK_LINE_COLUMNS: readonly number[] = [
    26, 27, 29, 30, 32, 33,
  ];

  constructor(
    config: WorldConfigData,
    grid: GridSystem,
    terrainWater: TerrainWaterSystem,
    districts: DistrictSystem,
    parcels: ParcelSystem,
    entities: EntityRegistry
  ) {
    this.config = config;
    this.grid = grid;
    this.terrainWater = terrainWater;
    this.districts = districts;
    this.parcels = parcels;
    this.entities = entities;
    this.initializeStarterRailYard();
  }

  public setJobRewardCallback(
    cb: (job: RailBulkCargoJobRecord, train: RailTrainConsistRecord) => void
  ): void {
    this.onJobRewardCallback = cb;
  }

  /**
   * Initializes the Starter Rail Yard & 40×50 Freight Terminal Compound:
   * - Dedicated 40×50 reserved compound footprint (`gx = -5..34, gz = 30..79`).
   * - 1 prebuilt starter track (`Line 1` at `gx=26, gz=38..72`) with straight-line mainline extension across the world map.
   * - 1 Central Rail Freight Terminal & Dispatch Office (`rail-depot-starter`, `gx=21..24, gz=48..53`).
   * - 1 Freight Loading Platform aligned with Line 1 (`rail-station-starter`, `gx=25, gz=58..65`).
   * - Designated railway crossing foundations at rows Z=35 and Z=55.
   * - Strictly idle GTE-L1 Freight Consist (`rail-train-gte-1`) and 3 GTE Model 360 Forklifts (`rail-forklift-1..3`).
   */
  public initializeStarterRailYard(): void {
    this.tracks.clear();
    this.depots.clear();
    this.stations.clear();
    this.crossings.clear();

    const rc = this.config.railCorridor;

    // 1. Starter Track (Line 1 at gx=26, inside starter parcel gz=38..72)
    const starterTrackGx = RailwaySystem.TRACK_LINE_COLUMNS[0];
    const starterCells: GridCoord[] = [];
    for (let gz = 38; gz <= 72; gz++) {
      starterCells.push({ gx: starterTrackGx, gz });
    }

    const starterTrack: RailwayTrackRecord = {
      id: 'rail-track-line-1',
      lineNumber: 1,
      gx: starterTrackGx,
      startGz: 38,
      endGz: 72,
      coveredCells: starterCells,
      connectedTrackIds: [],
      occupancy: 'AVAILABLE',
      isStarter: true,
    };
    this.tracks.set(starterTrack.id, starterTrack);
    this.entities.register({
      id: starterTrack.id,
      category: 'RAIL_TRACK',
      type: 'TRACK_LINE_1',
      position: { gx: starterTrackGx, gz: 38 },
      footprint: starterCells,
      orientation: 0,
      elevation: 1.2,
      ownership: 'WORLD',
      active: true,
      metadata: { lineNumber: 1 },
    });

    // 2. Central Rail Freight Terminal & Dispatch Office in Facilities & Machinery section (gx 21..24, gz 48..53)
    const depotCells: GridCoord[] = [];
    for (let gz = 48; gz <= 53; gz++) {
      for (let gx = 21; gx <= 24; gx++) {
        depotCells.push({ gx, gz });
      }
    }
    const starterDepot: RailwayDepotRecord = {
      id: 'rail-depot-starter',
      name: 'Central Rail Freight Terminal & Dispatch Office',
      minGx: 21,
      maxGx: 24,
      minGz: 48,
      maxGz: 53,
      connectedTrackId: starterTrack.id,
      isStarter: true,
    };
    this.depots.set(starterDepot.id, starterDepot);
    this.entities.register({
      id: starterDepot.id,
      category: 'RAIL_DEPOT',
      type: 'STARTER_DEPOT',
      position: { gx: 21, gz: 48 },
      footprint: depotCells,
      orientation: 0,
      elevation: 1.2,
      ownership: 'WORLD',
      active: true,
      metadata: {
        connectedTrackId: starterTrack.id,
        compoundFootprint: '40x50',
      },
    });

    // 3. Starter Station Platform aligned beside Line 1 at gx=25, gz=58..65
    const stationCells: GridCoord[] = [];
    for (let gz = 58; gz <= 65; gz++) {
      stationCells.push({ gx: 25, gz });
    }
    const starterStation: RailwayStationRecord = {
      id: 'rail-station-starter',
      name: 'Westgate Freight & Rail Platform',
      minGx: 25,
      maxGx: 25,
      minGz: 58,
      maxGz: 65,
      associatedTrackId: starterTrack.id,
      platformClearanceValid: true,
    };
    this.stations.set(starterStation.id, starterStation);
    this.entities.register({
      id: starterStation.id,
      category: 'RAIL_STATION',
      type: 'FREIGHT_PLATFORM',
      position: { gx: 25, gz: 58 },
      footprint: stationCells,
      orientation: 0,
      elevation: 1.2,
      ownership: 'WORLD',
      active: true,
      metadata: { associatedTrackId: starterTrack.id },
    });

    // 4. Designated Road-Railway Crossings at rows Z=55 and Z=35
    for (const rowGz of rc.designatedCrossingRows) {
      const cid = `rail-crossing-z${rowGz}`;
      const crossedIds = Array.from(this.tracks.values())
        .filter((t) => rowGz >= t.startGz && rowGz <= t.endGz)
        .map((t) => t.id);

      const crossingCells: GridCoord[] = [];
      for (let gx = rc.trackOpsStartX; gx <= rc.trackOpsEndX; gx++) {
        crossingCells.push({ gx, gz: rowGz });
      }

      const record: RailwayCrossingRecord = {
        id: cid,
        rowGz,
        minGx: rc.trackOpsStartX,
        maxGx: rc.trackOpsEndX,
        authorized: true,
        roadId: rowGz === 55 ? 'road-rail-yard-access' : undefined,
        roadWidthConfig: '1x1',
        crossedTrackIds: crossedIds,
        hasGates: true,
        gateState: 'OPEN',
      };
      this.crossings.set(cid, record);
      this.entities.register({
        id: cid,
        category: 'RAIL_CROSSING',
        type: 'DESIGNATED_GRADE_CROSSING',
        position: { gx: rc.trackOpsStartX, gz: rowGz },
        footprint: crossingCells,
        orientation: 0,
        elevation: 1.2,
        ownership: 'WORLD',
        active: true,
        metadata: { rowGz, hasGates: true },
      });
    }

    // 5. Initialize the 40×50 Railway Freight Hub State (Strictly Idle Machinery + Job State Machine)
    this.initializeFreightHubState();
  }

  private initializeFreightHubState(): void {
    const trainHomeWorld = this.grid.gridToWorld(26, 52);

    const starterTrain: RailTrainConsistRecord = {
      id: 'rail-train-gte-1',
      name: 'GTE-L1 Freight Consist #101',
      locomotiveModel: 'GTE-L1',
      wagonModels: ['Boxcar-T1', 'Tankcar-O1', 'Tankcar-W1', 'Flatbed-C1'],
      trackId: 'rail-track-line-1',
      sidingNumber: 1,
      gx: 26,
      homeGz: 52,
      worldX: trainHomeWorld.x,
      worldY: 1.25,
      worldZ: trainHomeWorld.z,
      headingYaw: Math.PI, // Facing Northbound along the straight-line mainline track
      state: 'IDLE',
      engineState: 'POWERED_DOWN_IDLE',
      currentSpeedKmh: 0,
      targetSpeedKmh: 48,
      loadingProgressPercent: 0,
      loadedWagonCount: 0,
      assignedJobId: undefined,
      assignedContractId: undefined,
      signalAspect: 'RED',
      hornSounded: false,
      wheelRotationRad: 0,
      transitTimerSec: 0,
      transitDurationSec: 8.0,
    };

    // 3 GTE Model 360 Forklifts parked stationary in their designated equipment bays (gx=23.2, gz=57, 60, 63)
    const bayGzList = [57, 60, 63];
    const cargoColors = [0x2563eb, 0x22c55e, 0xdc2626];
    const forklifts: RailYardForkliftRecord[] = bayGzList.map((gz, idx) => {
      const wp = this.grid.gridToWorld(23.2, gz);
      return {
        id: `rail-forklift-${idx + 1}`,
        bayNumber: idx + 1,
        modelId: 'GTE-Forklift-360',
        state: 'IDLE_AT_BAY',
        homeGx: 23.2,
        homeGz: gz,
        worldX: wp.x,
        worldY: 1.23,
        worldZ: wp.z,
        headingYaw: Math.PI * 0.5, // Facing East toward the rail siding platform
        speed: 0,
        forkHeightRatio: 0,
        carryingCargo: false,
        carryingColorHex: cargoColors[idx % cargoColors.length],
        wheelRotationRad: 0,
        targetWagonIndex: idx,
        cycleProgress: 0,
      };
    });

    // 2 Systematic Landside Delivery Trucks parked at the Western Terminal Loading Docks (gx=18.2, gz=48, 52)
    const truckGzList = [48, 52];
    const stagingTrucks: RailYardStagingTruckRecord[] = truckGzList.map(
      (gz, idx) => {
        const wp = this.grid.gridToWorld(18.2, gz);
        return {
          id: `rail-yard-truck-${idx + 1}`,
          dockNumber: idx + 1,
          name: `GTE Intermodal Feeder #${201 + idx}`,
          gx: 18,
          gz,
          worldX: wp.x,
          worldY: 1.24,
          worldZ: wp.z,
          headingYaw: -Math.PI * 0.5, // Backed systematically into the eastern terminal dock
          status: 'STAGED_READY',
        };
      }
    );

    const jobs: RailBulkCargoJobRecord[] = [
      {
        id: 'contract-rail-intermodal-4',
        title: 'North-South Corridor Intermodal Containers',
        cargoType: 'CONTAINERS',
        cargoLabel: 'ISO Intermodal Containers (Flatbed-C1 & Boxcar-T1)',
        cargoTons: 120,
        cashReward: 14500,
        xpReward: 290,
        destinationName: 'Northern Frontier Intermodal Hub',
        status: 'AVAILABLE',
        completedCount: 0,
      },
      {
        id: 'job-rail-petrochem-tanks',
        title: 'Highland Refinery Tank Car Express',
        cargoType: 'LIQUID_TANKS',
        cargoLabel: 'Refined Fuels & Chemical Bulk (Tankcar-O1 & W1)',
        cargoTons: 160,
        cashReward: 19800,
        xpReward: 340,
        destinationName: 'Boreal Industrial Refinery Terminal',
        status: 'AVAILABLE',
        completedCount: 0,
      },
      {
        id: 'job-rail-iron-ore',
        title: 'Continental Steelworks Ore & Timber Charter',
        cargoType: 'ORES',
        cargoLabel: 'Palletized Ore Crates & Structural Timber',
        cargoTons: 140,
        cashReward: 16800,
        xpReward: 310,
        destinationName: 'Westwood Heavy Foundry & Mill',
        status: 'AVAILABLE',
        completedCount: 0,
      },
      {
        id: 'job-rail-heavy-machinery',
        title: 'Trans-Continental Machinery & Equipment Haul',
        cargoType: 'MACHINERY',
        cargoLabel: 'Heavy Industrial Machinery & Generators',
        cargoTons: 185,
        cashReward: 24500,
        xpReward: 410,
        destinationName: 'Eastgate Manufacturing Complex',
        status: 'AVAILABLE',
        completedCount: 0,
      },
    ];

    this.hubState = {
      owned: true,
      level: 1,
      maxLevel: 10,
      purchasePrice: RAILWAY_YARD_RESERVED_FOOTPRINT.purchasePrice,
      upgradeCost: 28000,
      reservedFootprint: RAILWAY_YARD_RESERVED_FOOTPRINT,
      elevationLayers: RAIL_ELEVATION_LAYERS,
      trains: [starterTrain],
      forklifts,
      stagingTrucks,
      jobs,
      totalDispatchesCompleted: 0,
    };
  }

  public getFreightHubState(): RailwayFreightHubState {
    return this.hubState;
  }

  public isWithinReserved40x50Compound(gx: number, gz: number): boolean {
    const fp = RAILWAY_YARD_RESERVED_FOOTPRINT;
    return (
      gx >= fp.minGx &&
      gx <= fp.maxGx &&
      gz >= fp.minGz &&
      gz <= fp.maxGz
    );
  }

  public setRailwayYardOwned(owned: boolean): void {
    this.hubState.owned = owned;
  }

  public purchaseRailwayYard(currentMoney: number): {
    success: boolean;
    reason?: string;
    cost: number;
  } {
    if (this.hubState.owned) {
      return {
        success: false,
        reason: 'Railway Freight Yard is already owned and operational.',
        cost: 0,
      };
    }
    const cost = this.hubState.purchasePrice;
    if (currentMoney < cost) {
      return {
        success: false,
        reason: 'Insufficient funds to purchase the Railway Freight Yard.',
        cost: 0,
      };
    }
    this.hubState.owned = true;
    return { success: true, cost };
  }

  /**
   * Returns the Infinite Straight-Line Track Extension spans running parallel across
   * the buildable world grid from the northern boundary to the southern mainland coast.
   */
  public getInfiniteStraightTrackSpans(): Array<{
    lineNumber: number;
    gx: number;
    logicalMinGz: number;
    logicalMaxGz: number;
    renderMinGz: number;
    renderMaxGz: number;
  }> {
    const activeLines = Array.from(this.tracks.values()).filter(
      (t) => t.lineNumber >= 1 && t.lineNumber <= 6
    );
    const cols =
      activeLines.length >= 2
        ? activeLines.map((t) => ({ lineNumber: t.lineNumber, gx: t.gx }))
        : [
            { lineNumber: 1, gx: 26 },
            { lineNumber: 2, gx: 27 },
          ];

    return cols.map((c) => ({
      lineNumber: c.lineNumber,
      gx: c.gx,
      logicalMinGz: this.config.minGz,
      logicalMaxGz: this.config.maxGz,
      // Continuous dry-land straight mainline across the core & frontier mainland
      renderMinGz: -220,
      renderMaxGz: 86,
    }));
  }

  /**
   * Player Job Assignment Trigger:
   * Assigns a bulk rail cargo delivery job/contract to an idle GTE-L1 train consist
   * and triggers the dynamic forklift loading choreography.
   */
  public assignJobAndLoad(
    jobOrContractId: string,
    trainId = 'rail-train-gte-1'
  ): {
    success: boolean;
    reason?: string;
    train?: RailTrainConsistRecord;
    job?: RailBulkCargoJobRecord;
  } {
    if (!this.hubState.owned) {
      return {
        success: false,
        reason: 'Railway Yard - Locked. Purchase the Railway Yard first.',
      };
    }

    const train =
      this.hubState.trains.find((t) => t.id === trainId) ??
      this.hubState.trains[0];
    if (!train) {
      return { success: false, reason: 'No train consist available in yard.' };
    }

    if (train.state !== 'IDLE') {
      return {
        success: false,
        reason: `${train.name} is currently ${train.state} (${Math.round(train.loadingProgressPercent)}%). Wait until it returns to IDLE.`,
      };
    }

    let job = this.hubState.jobs.find((j) => j.id === jobOrContractId);
    if (!job) {
      job = this.hubState.jobs[0];
    }

    job.status = 'LOADING';
    job.assignedTrainId = train.id;

    train.state = 'LOADING';
    train.engineState = 'POWERED_DOWN_IDLE';
    train.currentSpeedKmh = 0;
    train.loadingProgressPercent = 0;
    train.loadedWagonCount = 0;
    train.assignedJobId = job.id;
    train.assignedContractId = jobOrContractId;
    train.signalAspect = 'RED';
    train.hornSounded = false;

    // Activate all 3 GTE Model 360 Forklifts from their parked equipment bays
    this.hubState.forklifts.forEach((fl, idx) => {
      fl.state = 'MOVING_TO_DOCK';
      fl.speed = 3.2;
      fl.cycleProgress = idx * 0.22; // Staggered smooth choreography
      fl.carryingCargo = false;
      fl.forkHeightRatio = 0.05;
      fl.targetWagonIndex = idx % 4;
    });

    this.hubState.stagingTrucks.forEach((tr) => {
      tr.status = 'DOCKED_OFFLOADING';
    });

    this.setTrackOccupancy(train.trackId, 'OCCUPIED');

    return { success: true, train, job };
  }

  /**
   * Advances the Job-Triggered Forklift & Train Loading State Machine:
   * - IDLE: Train and all 3 GTE Model 360 Forklifts remain 100% stationary (`speed = 0`).
   * - LOADING: Forklifts shuttle between warehouse/truck docks and the 4 train wagons,
   *   raising/lowering forks and increasing `loadingProgressPercent` from 0% to 100%.
   * - DEPARTING -> IN_TRANSIT: Once loading hits 100%, forklifts return to their bays and power down,
   *   track signals turn GREEN, locomotive sounds its horn, and the train departs straight down the mainline.
   * - RETURNING -> IDLE: Train returns along the straight track, settles reward, and parks stationary in IDLE.
   */
  public stepSimulation(dt: number): void {
    const train = this.hubState.trains[0];
    if (!train) return;

    const homeWorld = this.grid.gridToWorld(train.gx, train.homeGz);

    if (train.state === 'IDLE') {
      // Strictly stationary in IDLE state
      train.currentSpeedKmh = 0;
      train.engineState = 'POWERED_DOWN_IDLE';
      train.worldX = homeWorld.x;
      train.worldZ = homeWorld.z;
      train.headingYaw = Math.PI;
      train.signalAspect = 'RED';

      for (const fl of this.hubState.forklifts) {
        const bayWp = this.grid.gridToWorld(fl.homeGx, fl.homeGz);
        fl.state = 'IDLE_AT_BAY';
        fl.speed = 0;
        fl.worldX = bayWp.x;
        fl.worldZ = bayWp.z;
        fl.headingYaw = Math.PI * 0.5;
        fl.forkHeightRatio = 0;
        fl.carryingCargo = false;
      }
      return;
    }

    if (train.state === 'LOADING') {
      // Advance loading progress (~16% per second -> ~6.25 seconds for full 4-wagon loading sequence)
      const prevPct = train.loadingProgressPercent;
      train.loadingProgressPercent = Math.min(
        100,
        prevPct + dt * 16.0
      );
      train.loadedWagonCount = Math.min(
        4,
        Math.floor((train.loadingProgressPercent / 100) * 4)
      );

      // Animate the 3 GTE Model 360 Forklifts between the Warehouse Platform (gx=22.0) and Siding 1 Wagons (gx=25.1)
      const dockX = this.grid.gridToWorld(22.0, 52).x;
      const sidingX = this.grid.gridToWorld(25.1, 52).x;

      this.hubState.forklifts.forEach((fl, idx) => {
        fl.cycleProgress = (fl.cycleProgress + dt * 0.45) % 1.0;
        const p = fl.cycleProgress;
        const wagonZ = homeWorld.z + (idx + 1) * 4.65; // Wagons trail behind the northbound locomotive (+Z)
        const bayWp = this.grid.gridToWorld(fl.homeGx, fl.homeGz);

        if (p < 0.22) {
          fl.state = 'MOVING_TO_DOCK';
          const t = p / 0.22;
          fl.worldX = bayWp.x + (dockX - bayWp.x) * t;
          fl.worldZ = bayWp.z + (wagonZ - bayWp.z) * t;
          fl.headingYaw = -Math.PI * 0.5;
          fl.carryingCargo = false;
          fl.forkHeightRatio = 0.1;
          fl.speed = 3.2;
        } else if (p < 0.36) {
          fl.state = 'LIFTING_CARGO';
          const t = (p - 0.22) / 0.14;
          fl.worldX = dockX;
          fl.worldZ = wagonZ;
          fl.headingYaw = -Math.PI * 0.5;
          fl.carryingCargo = true;
          fl.forkHeightRatio = 0.1 + t * 0.65;
          fl.speed = 0.4;
        } else if (p < 0.68) {
          fl.state = 'CARRYING_TO_TRAIN';
          const t = (p - 0.36) / 0.32;
          fl.worldX = dockX + (sidingX - dockX) * t;
          fl.worldZ = wagonZ;
          fl.headingYaw = Math.PI * 0.5;
          fl.carryingCargo = true;
          fl.forkHeightRatio = 0.75;
          fl.speed = 3.4;
        } else if (p < 0.82) {
          fl.state = 'PLACING_ON_WAGON';
          const t = (p - 0.68) / 0.14;
          fl.worldX = sidingX;
          fl.worldZ = wagonZ;
          fl.headingYaw = Math.PI * 0.5;
          fl.carryingCargo = t < 0.5;
          fl.forkHeightRatio = 0.75 - t * 0.6;
          fl.speed = 0.4;
        } else {
          fl.state = 'RETURNING_TO_BAY';
          const t = (p - 0.82) / 0.18;
          fl.worldX = sidingX + (bayWp.x - sidingX) * t;
          fl.worldZ = wagonZ + (bayWp.z - wagonZ) * t;
          fl.headingYaw = -Math.PI * 0.5;
          fl.carryingCargo = false;
          fl.forkHeightRatio = 0.12;
          fl.speed = 3.2;
        }
        fl.wheelRotationRad =
          (fl.wheelRotationRad + fl.speed * dt * 3.8) % (Math.PI * 100);
      });

      // Transition to DEPARTING when 100% loaded
      if (train.loadingProgressPercent >= 100) {
        train.loadingProgressPercent = 100;
        train.loadedWagonCount = 4;
        train.state = 'DEPARTING';
        train.engineState = 'ACTIVE_TRACTION';
        train.signalAspect = 'GREEN';
        train.hornSounded = true;
        train.transitTimerSec = 0;

        const job = this.hubState.jobs.find(
          (j) => j.id === train.assignedJobId
        );
        if (job) {
          job.status = 'IN_TRANSIT';
        }

        // Return all forklifts neatly to their equipment bays and power down
        for (const fl of this.hubState.forklifts) {
          const bayWp = this.grid.gridToWorld(fl.homeGx, fl.homeGz);
          fl.state = 'IDLE_AT_BAY';
          fl.speed = 0;
          fl.worldX = bayWp.x;
          fl.worldZ = bayWp.z;
          fl.headingYaw = Math.PI * 0.5;
          fl.forkHeightRatio = 0;
          fl.carryingCargo = false;
        }
        for (const tr of this.hubState.stagingTrucks) {
          tr.status = 'STAGED_READY';
        }
      }
      return;
    }

    if (train.state === 'DEPARTING' || train.state === 'IN_TRANSIT') {
      // Smoothly accelerate northward (-Z world direction) along the straight-line mainline track
      train.currentSpeedKmh = Math.min(
        train.targetSpeedKmh,
        train.currentSpeedKmh + dt * 18.0
      );
      const speedWorld = (train.currentSpeedKmh / 3.6) * 1.15;
      train.worldZ -= speedWorld * dt;
      train.headingYaw = Math.PI;
      train.wheelRotationRad =
        (train.wheelRotationRad + speedWorld * dt * 2.6) % (Math.PI * 200);
      train.transitTimerSec += dt;

      // Lower crossing gates at Z=35 when train is near
      const z35World = this.grid.gridToWorld(train.gx, 35).z;
      const crossing35 = this.crossings.get('rail-crossing-z35');
      if (crossing35) {
        crossing35.gateState =
          Math.abs(train.worldZ - z35World) < 28 ? 'CLOSED' : 'OPEN';
      }

      if (train.state === 'DEPARTING' && train.transitTimerSec >= 2.2) {
        train.state = 'IN_TRANSIT';
      }

      if (train.transitTimerSec >= train.transitDurationSec) {
        // Begin return journey along the straight-line track back into the siding
        train.state = 'RETURNING';
        train.transitTimerSec = 0;
        const returnStart = this.grid.gridToWorld(train.gx, 10);
        train.worldZ = returnStart.z;
        train.headingYaw = 0; // Southbound back into the yard siding
      }
      return;
    }

    if (train.state === 'RETURNING') {
      const distToHome = homeWorld.z - train.worldZ;
      if (distToHome > 0.4) {
        const approachSpeedKmh = Math.max(
          10,
          Math.min(train.targetSpeedKmh, distToHome * 1.6)
        );
        train.currentSpeedKmh = approachSpeedKmh;
        const speedWorld = (approachSpeedKmh / 3.6) * 1.15;
        train.worldZ = Math.min(homeWorld.z, train.worldZ + speedWorld * dt);
        train.headingYaw = 0;
        train.wheelRotationRad =
          (train.wheelRotationRad + speedWorld * dt * 2.6) % (Math.PI * 200);
      } else {
        // Arrived back at siding berth: settle job revenue & return to stationary IDLE state
        const completedJob = this.hubState.jobs.find(
          (j) => j.id === train.assignedJobId
        );
        if (completedJob) {
          completedJob.status = 'AVAILABLE';
          completedJob.assignedTrainId = undefined;
          completedJob.completedCount++;
          this.hubState.totalDispatchesCompleted++;
          if (this.onJobRewardCallback) {
            this.onJobRewardCallback(completedJob, train);
          }
        }

        const crossing35 = this.crossings.get('rail-crossing-z35');
        if (crossing35) crossing35.gateState = 'OPEN';

        train.state = 'IDLE';
        train.engineState = 'POWERED_DOWN_IDLE';
        train.currentSpeedKmh = 0;
        train.worldX = homeWorld.x;
        train.worldZ = homeWorld.z;
        train.headingYaw = Math.PI;
        train.loadingProgressPercent = 0;
        train.loadedWagonCount = 0;
        train.assignedJobId = undefined;
        train.assignedContractId = undefined;
        train.signalAspect = 'RED';
        train.hornSounded = false;
        train.transitTimerSec = 0;
        this.setTrackOccupancy(train.trackId, 'AVAILABLE');
      }
    }
  }

  public serializeHubState(): SerializedRailwayHubState {
    return {
      owned: this.hubState.owned,
      level: this.hubState.level,
      totalDispatchesCompleted: this.hubState.totalDispatchesCompleted,
      trains: this.hubState.trains.map((t) => ({
        id: t.id,
        state: t.state,
        worldZ: t.worldZ,
        currentSpeedKmh: t.currentSpeedKmh,
        loadingProgressPercent: t.loadingProgressPercent,
        loadedWagonCount: t.loadedWagonCount,
        assignedJobId: t.assignedJobId,
        assignedContractId: t.assignedContractId,
        signalAspect: t.signalAspect,
        hornSounded: t.hornSounded,
        transitTimerSec: t.transitTimerSec,
      })),
      jobs: this.hubState.jobs.map((j) => ({
        id: j.id,
        status: j.status,
        assignedTrainId: j.assignedTrainId,
        completedCount: j.completedCount,
      })),
    };
  }

  public deserializeHubState(data?: SerializedRailwayHubState): void {
    if (!data) return;
    this.hubState.owned = data.owned ?? true;
    this.hubState.level = data.level ?? 1;
    this.hubState.totalDispatchesCompleted =
      data.totalDispatchesCompleted ?? 0;

    if (Array.isArray(data.trains)) {
      for (const savedTrain of data.trains) {
        const target = this.hubState.trains.find(
          (t) => t.id === savedTrain.id
        );
        if (target) {
          target.state = savedTrain.state;
          target.worldZ = savedTrain.worldZ;
          target.currentSpeedKmh = savedTrain.currentSpeedKmh;
          target.loadingProgressPercent = savedTrain.loadingProgressPercent;
          target.loadedWagonCount = savedTrain.loadedWagonCount;
          target.assignedJobId = savedTrain.assignedJobId;
          target.assignedContractId = savedTrain.assignedContractId;
          target.signalAspect = savedTrain.signalAspect;
          target.hornSounded = savedTrain.hornSounded;
          target.transitTimerSec = savedTrain.transitTimerSec ?? 0;
        }
      }
    }

    if (Array.isArray(data.jobs)) {
      for (const savedJob of data.jobs) {
        const targetJob = this.hubState.jobs.find(
          (j) => j.id === savedJob.id
        );
        if (targetJob) {
          targetJob.status = savedJob.status;
          targetJob.assignedTrainId = savedJob.assignedTrainId;
          targetJob.completedCount = savedJob.completedCount ?? 0;
        }
      }
    }
  }

  /**
   * Validates whether a track segment can be placed at (gx, startGz..endGz).
   */
  public validateTrackPlacement(
    gx: number,
    startGz: number,
    endGz: number
  ): {
    valid: boolean;
    reason?: string;
    cells: GridCoord[];
  } {
    const minGz = Math.min(startGz, endGz);
    const maxGz = Math.max(startGz, endGz);
    const cells: GridCoord[] = [];

    if (minGz === maxGz) {
      return {
        valid: false,
        reason: 'Track start and end Z coordinates must span at least 2 cells.',
        cells,
      };
    }

    for (let gz = minGz; gz <= maxGz; gz++) {
      if (!this.grid.isValidGridCoord(gx, gz)) {
        return {
          valid: false,
          reason: 'Outside playable world boundaries.',
          cells,
        };
      }
      if (this.terrainWater.isWaterAt(gx, gz)) {
        return {
          valid: false,
          reason:
            'Ordinary railway track cannot be placed directly over water without a Railway Bridge.',
          cells,
        };
      }

      const zCheck = this.districts.validateZoning(gx, gz, 'RAIL_TRACK');
      if (!zCheck.allowed) {
        return {
          valid: false,
          reason: zCheck.reason,
          cells,
        };
      }
      cells.push({ gx, gz });
    }

    // Check duplicate or overlapping track at same gx
    for (const existing of this.tracks.values()) {
      if (existing.gx === gx) {
        const overlaps = !(maxGz < existing.startGz || minGz > existing.endGz);
        if (overlaps) {
          return {
            valid: false,
            reason: `Overlaps existing track ${existing.id} at column X=${gx}.`,
            cells,
          };
        }
      }
    }

    // Check station platform clearance
    for (const st of this.stations.values()) {
      for (const c of cells) {
        if (
          c.gx >= st.minGx &&
          c.gx <= st.maxGx &&
          c.gz >= st.minGz &&
          c.gz <= st.maxGz
        ) {
          return {
            valid: false,
            reason: 'Track placement intersects station platform footprint.',
            cells,
          };
        }
      }
    }

    return { valid: true, cells };
  }

  /**
   * Expands the Rail Yard by adding the next parallel railway line (up to 6 lines max)
   * or extending an existing line into newly unlocked Rail Yard expansion tiles.
   */
  public expandNextParallelTrackLine(): {
    success: boolean;
    reason?: string;
    track?: RailwayTrackRecord;
  } {
    const yardLines = Array.from(this.tracks.values()).filter(
      (t) => t.lineNumber >= 1 && t.lineNumber <= 6
    ).length;
    if (yardLines >= this.config.railCorridor.maxParallelTracks) {
      return {
        success: false,
        reason: `Maximum capacity of ${this.config.railCorridor.maxParallelTracks} parallel railway lines reached.`,
      };
    }

    const lineNumber = yardLines + 1;
    const gx = RailwaySystem.TRACK_LINE_COLUMNS[lineNumber - 1];

    // Determine unlocked Z span across owned Rail Yard parcels
    const ownedRailParcels = this.parcels
      .getRailYardParcels()
      .filter((p) => p.owned);
    let minGz = 38;
    let maxGz = 72;
    for (const p of ownedRailParcels) {
      minGz = Math.min(minGz, p.minGz);
      maxGz = Math.max(maxGz, p.maxGz);
    }

    const validation = this.validateTrackPlacement(gx, minGz, maxGz);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    const id = `rail-track-line-${lineNumber}`;
    const newTrack: RailwayTrackRecord = {
      id,
      lineNumber,
      gx,
      startGz: minGz,
      endGz: maxGz,
      coveredCells: validation.cells,
      connectedTrackIds: ['rail-track-line-1'],
      occupancy: 'AVAILABLE',
      isStarter: false,
    };

    const starter = this.tracks.get('rail-track-line-1');
    if (starter && !starter.connectedTrackIds.includes(id)) {
      starter.connectedTrackIds.push(id);
    }

    this.tracks.set(id, newTrack);
    this.entities.register({
      id,
      category: 'RAIL_TRACK',
      type: `TRACK_LINE_${lineNumber}`,
      position: { gx, gz: minGz },
      footprint: validation.cells,
      orientation: 0,
      elevation: 1.2,
      ownership: 'PLAYER',
      active: true,
      metadata: { lineNumber },
    });

    // Update crossings that span this new track
    for (const crossing of this.crossings.values()) {
      if (crossing.rowGz >= minGz && crossing.rowGz <= maxGz) {
        if (!crossing.crossedTrackIds.includes(id)) {
          crossing.crossedTrackIds.push(id);
        }
      }
    }

    return { success: true, track: newTrack };
  }

  /**
   * Unlocks a Rail Yard land expansion tile and extends existing tracks into it if requested.
   */
  public unlockNextRailYardTile(extendTracks = false): {
    success: boolean;
    reason?: string;
    unlockedParcelId?: string;
  } {
    const unowned = this.parcels
      .getRailYardParcels()
      .filter((p) => !p.owned)
      .sort((a, b) => a.unlockLevel - b.unlockLevel);

    if (unowned.length === 0) {
      return {
        success: false,
        reason: 'All Rail Yard expansion tiles are already unlocked.',
      };
    }

    const target = unowned[0];
    const res = this.parcels.acquireParcel(target.id, 10);
    if (!res.success) {
      return { success: false, reason: res.reason };
    }

    if (extendTracks) {
      const owned = this.parcels.getRailYardParcels().filter((p) => p.owned);
      let minGz = 38;
      let maxGz = 72;
      for (const p of owned) {
        minGz = Math.min(minGz, p.minGz);
        maxGz = Math.max(maxGz, p.maxGz);
      }

      for (const track of this.tracks.values()) {
        track.startGz = minGz;
        track.endGz = maxGz;
        const cells: GridCoord[] = [];
        for (let gz = minGz; gz <= maxGz; gz++) {
          cells.push({ gx: track.gx, gz });
        }
        track.coveredCells = cells;
        this.entities.update(track.id, { footprint: cells });
      }
    }

    return { success: true, unlockedParcelId: target.id };
  }

  /**
   * Integrates with RoadSystem when a road is constructed across a designated railway crossing.
   */
  public registerRoadAcrossCrossing(
    roadId: string,
    rowGz: number,
    widthConfig: RoadWidthConfig
  ): string | undefined {
    let matchedCrossing: RailwayCrossingRecord | undefined;
    for (const c of this.crossings.values()) {
      if (Math.abs(c.rowGz - rowGz) <= 1) {
        matchedCrossing = c;
        break;
      }
    }
    if (!matchedCrossing || !matchedCrossing.authorized) return undefined;

    matchedCrossing.roadId = roadId;
    matchedCrossing.roadWidthConfig = widthConfig;
    matchedCrossing.hasGates = true;
    matchedCrossing.crossedTrackIds = Array.from(this.tracks.values())
      .filter(
        (t) =>
          matchedCrossing!.rowGz >= t.startGz &&
          matchedCrossing!.rowGz <= t.endGz
      )
      .map((t) => t.id);

    return matchedCrossing.id;
  }

  public unregisterRoadFromCrossing(roadId: string): void {
    for (const crossing of this.crossings.values()) {
      if (crossing.roadId === roadId) {
        crossing.roadId = undefined;
        crossing.roadWidthConfig = '1x1';
      }
    }
  }

  public setTrackOccupancy(
    trackId: string,
    state: TrackOccupancyState
  ): boolean {
    const t = this.tracks.get(trackId);
    if (!t) return false;
    t.occupancy = state;
    return true;
  }

  public getCorridorDimensions(): {
    startX: number;
    endX: number;
    totalWidthBlocks: number;
    facilitiesWidthBlocks: number;
    trackOpsWidthBlocks: number;
    citySeparationBlocks: number;
  } {
    const rc = this.config.railCorridor;
    return {
      startX: rc.startX,
      endX: rc.endX,
      totalWidthBlocks: rc.endX - rc.startX + 1,
      facilitiesWidthBlocks: rc.facilitiesEndX - rc.facilitiesStartX + 1,
      trackOpsWidthBlocks: rc.trackOpsEndX - rc.trackOpsStartX + 1,
      citySeparationBlocks: this.districts.getCityToRailSeparationBlocks(),
    };
  }

  public getAllTracks(): RailwayTrackRecord[] {
    return Array.from(this.tracks.values());
  }

  public getAllDepots(): RailwayDepotRecord[] {
    return Array.from(this.depots.values());
  }

  public getAllStations(): RailwayStationRecord[] {
    return Array.from(this.stations.values());
  }

  public getAllCrossings(): RailwayCrossingRecord[] {
    return Array.from(this.crossings.values());
  }

  public getSectionAt(gx: number, gz: number): RailCorridorSection {
    return this.districts.getRailCorridorSectionAt(gx, gz);
  }

  public canPlaceCityBuildingInRailZone(gx: number, gz: number): boolean {
    return this.districts.validateZoning(gx, gz, 'CITY_BUILDING').allowed;
  }

  /**
   * Builds a world-scale railway corridor between any two valid grid coordinates
   * across world chunks (supporting straight N-S, straight E-W, or smooth L-corridor routing).
   */
  public buildWorldScaleTrackCorridor(
    start: GridCoord,
    end: GridCoord
  ): {
    success: boolean;
    reason?: string;
    track?: RailwayTrackRecord;
  } {
    if (start.gx === end.gx && start.gz === end.gz) {
      return {
        success: false,
        reason: 'Railway corridor start and end coordinates must be distinct.',
      };
    }

    const cells: GridCoord[] = [];
    const stepGx = end.gx >= start.gx ? 1 : -1;
    const stepGz = end.gz >= start.gz ? 1 : -1;

    // Traverse Z first, then X for orthogonal/L-corridor or straight lines
    for (let gz = start.gz; gz !== end.gz; gz += stepGz) {
      cells.push({ gx: start.gx, gz });
    }
    for (let gx = start.gx; gx !== end.gx + stepGx; gx += stepGx) {
      cells.push({ gx, gz: end.gz });
    }

    if (cells.length < 2) {
      return {
        success: false,
        reason: 'Railway corridor must span at least 2 grid cells.',
      };
    }

    for (const c of cells) {
      if (!this.grid.isValidGridCoord(c.gx, c.gz)) {
        return {
          success: false,
          reason: `Coordinate (${c.gx}, ${c.gz}) is outside playable world boundaries.`,
        };
      }
      if (this.terrainWater.isWaterAt(c.gx, c.gz)) {
        return {
          success: false,
          reason:
            'Ordinary railway track cannot be placed directly over water without a Railway Bridge.',
        };
      }
      const zCheck = this.districts.validateZoning(c.gx, c.gz, 'RAIL_TRACK');
      if (!zCheck.allowed) {
        return {
          success: false,
          reason: zCheck.reason,
        };
      }
    }

    // Check station platform clearance
    for (const st of this.stations.values()) {
      for (const c of cells) {
        if (
          c.gx >= st.minGx &&
          c.gx <= st.maxGx &&
          c.gz >= st.minGz &&
          c.gz <= st.maxGz
        ) {
          return {
            success: false,
            reason: 'Track placement intersects station platform footprint.',
          };
        }
      }
    }

    // Identify connected tracks (adjacent or sharing an endpoint)
    const connectedIds: string[] = [];
    for (const existing of this.tracks.values()) {
      for (const ec of existing.coveredCells) {
        const touches = cells.some(
          (nc) => Math.abs(nc.gx - ec.gx) + Math.abs(nc.gz - ec.gz) <= 1
        );
        if (touches) {
          connectedIds.push(existing.id);
          break;
        }
      }
    }

    const customIndex =
      Array.from(this.tracks.values()).filter((t) => t.lineNumber >= 100)
        .length + 1;
    const lineNumber = 100 + customIndex;
    const id = `rail-corridor-world-${customIndex}`;
    const minGz = Math.min(start.gz, end.gz);
    const maxGz = Math.max(start.gz, end.gz);

    const newTrack: RailwayTrackRecord = {
      id,
      lineNumber,
      gx: start.gx,
      startGz: minGz,
      endGz: maxGz,
      startCoord: { ...start },
      endCoord: { ...end },
      coveredCells: cells,
      connectedTrackIds: connectedIds,
      occupancy: 'AVAILABLE',
      isStarter: false,
    };

    for (const cid of connectedIds) {
      const existing = this.tracks.get(cid);
      if (existing && !existing.connectedTrackIds.includes(id)) {
        existing.connectedTrackIds.push(id);
      }
    }

    this.tracks.set(id, newTrack);
    this.entities.register({
      id,
      category: 'RAIL_TRACK',
      type: `WORLD_CORRIDOR_${customIndex}`,
      position: { ...start },
      footprint: cells,
      orientation: start.gx === end.gx ? 0 : 90,
      elevation: 1.2,
      ownership: 'PLAYER',
      active: true,
      metadata: { lineNumber, startCoord: start, endCoord: end },
    });

    return { success: true, track: newTrack };
  }

  public getWorldScaleTrackCorridors(): Array<{
    start: GridCoord;
    end: GridCoord;
  }> {
    return Array.from(this.tracks.values())
      .filter((t) => t.lineNumber >= 100 && t.startCoord && t.endCoord)
      .map((t) => ({
        start: { ...t.startCoord! },
        end: { ...t.endCoord! },
      }));
  }
}
