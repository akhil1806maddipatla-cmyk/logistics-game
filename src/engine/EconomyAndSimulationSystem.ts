/**
 * Authoritative Economy, XP/Level Progression, Building & Facility Management,
 * Vehicle Ownership, 5-Real-Day Maintenance, Contract Dispatch, and
 * Unified Transport & Motorway Traffic Simulation System (Master Prompts 2, 3, 4, 5 & 6).
 */

import {
  AIR_CARGO_MATERIAL_SPECS,
  AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS,
  AIRCRAFT_HANGAR_PURCHASE_COST,
  AIRCRAFT_LOW_CONDITION_EFFICIENCY_MULTIPLIER,
  AIRCRAFT_LOW_CONDITION_THRESHOLD,
  AIRCRAFT_MODEL_ORIENTATION_CONFIG,
  AIRPORT_CARGO_CAPACITY_TONS_BY_LEVEL,
  AIRPORT_CARGO_TERMINAL_FOOTPRINT,
  AIRPORT_ID,
  AIRPORT_INTERMEDIATE_EXPANSION_LEVEL,
  AIRPORT_INTERMEDIATE_FOOTPRINT,
  AIRPORT_LEVEL_1_FOOTPRINT,
  AIRPORT_LEVEL_20_FOOTPRINT,
  AIRPORT_LOCKED_UI_TITLE,
  AIRPORT_MAX_CARGO_CAPACITY_TONS,
  AIRPORT_MAX_LEVEL,
  AIRPORT_MAX_PARKING_AREAS,
  AIRPORT_MIN_CARGO_CAPACITY_TONS,
  AIRPORT_MIN_LEVEL,
  AIRPORT_NAME,
  AIRPORT_PARKING_AREA_BASE_PRICE,
  AIRPORT_PARKING_AREA_PRICE_INCREMENT_PER_LEVEL,
  AIRPORT_PAVEMENT_SURFACE_Y,
  AIRPORT_PURCHASE_PRICE,
  AIRPORT_RESERVED_FOOTPRINT,
  AIRPORT_STAND_UNLOCK_LEVELS,
  AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT,
  AIRPORT_TRANSFER_YARD_FOOTPRINT,
  AIRPORT_UNLOCK_LEVEL,
  AIRPORT_UPGRADE_COST_INCREMENT_PER_LEVEL,
  AIRPORT_UPGRADE_LEVEL_2_COST,
  AIRPORT_WAREHOUSE_LEVEL_20_FOOTPRINT,
  AirCargoMaterialCategory,
  AircraftFlightStage,
  AircraftHangarRecord,
  AirportCargoTransferTask,
  AirportCargoWarehouseState,
  AirportInfrastructureRecord,
  AirportLogisticsAndFlightController,
  AirportParkingStandSpec,
  AirportSupplyCategory,
  AirportTransferYardState,
  AirportWarehouseCargoKey,
  AirportWaypointId,
  AirportWaypointRecord,
  ALL_APRON_STAND_IDS,
  buildAirportInfrastructureRecord,
  CargoAircraftRecord,
  computeAircraftNoseForwardYaw,
  FIRST_OWNED_AIRCRAFT_PRICE,
  FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL,
  getAircraftEfficiencyMultiplier,
  getAircraftNoseWorldDirection,
  getAircraftOperationalCapacityForAirportLevel,
  getAirportActiveBoundsForLevel,
  getAirportCargoCapacityForLevel,
  getAirportParkingAreaPriceForLevel,
  getAirportUnlockedStandsForLevel,
  getAirportUpgradeCostForLevel,
  getNextOwnedAircraftPurchaseRequirement,
  getUnlockedAirCargoMaterialsForLevel,
  GSEVehicleCategory,
  GSEVehicleRecord,
  GUEST_AIRCRAFT_CATALOGUE,
  GUEST_AIRCRAFT_VISIT_DURATION_SEC,
  GuestAircraftCatalogueItem,
  HangarSlotId,
  isCellInAirportReservation,
  MAX_OWNED_AIRCRAFT,
  MAX_PLAYER_AIRCRAFT,
  OWNED_AIRCRAFT_SLOT_PROGRESSION,
  SECOND_OWNED_AIRCRAFT_PRICE,
  SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL,
  SerializedAirportLogisticsState,
  SerializedAirportState,
  syncAirportEntities,
  TransferDirection,
} from './AirportSystem';
import {
  BUILDING_CATALOGUE,
  BuildingCatalogueItem,
  FLEET_LIVERIES,
  getBuildingSpecById,
  getLevelInfoForXp,
  getVehicleSpecById,
  getXpRequiredForLevel,
  LEVEL_PROGRESSION_TABLE,
  TransportModalCategory,
  VEHICLE_CATALOGUE,
  VehicleCatalogueItem,
} from './Catalogues';
import { DistrictSystem } from './DistrictSystem';
import { EntityRegistry } from './EntityRegistry';
import { GridCoord, GridSystem } from './GridSystem';
import { ParcelSystem } from './ParcelSystem';
import {
  RailwayFreightHubState,
  RailwaySystem,
  SerializedRailwayHubState,
} from './RailwaySystem';
import { RoadSystem } from './RoadSystem';
import { TerrainWaterSystem } from './TerrainWaterSystem';
import {
  applyTruckDepotLevelState,
  createInitialTruckDepotFacilityState,
  getTruckDepotLevelSpec,
  isCellInTruckDepotReservedArea,
  STARTER_MINI_TRUCK_CATALOGUE_ID,
  STARTER_MINI_TRUCK_COUNT,
  STARTER_MINI_TRUCK_LIVERY_ID,
  TRUCK_DEPOT_CATALOGUE_ID,
  TRUCK_DEPOT_ID,
  TRUCK_DEPOT_LEVEL_1_CAPACITY,
  TRUCK_DEPOT_LEVEL_1_FOOTPRINT,
  TRUCK_DEPOT_LEVEL_10_CAPACITY,
  TRUCK_DEPOT_LEVEL_10_FOOTPRINT,
  TRUCK_DEPOT_LEVEL_SPECS,
  TRUCK_DEPOT_MAX_CAPACITY,
  TRUCK_DEPOT_MAX_LEVEL,
  TRUCK_DEPOT_MAX_RESERVED_FOOTPRINT,
  TRUCK_DEPOT_MIN_LEVEL,
  TruckDepotFacilityState,
  TruckDepotLevelSpec,
  TruckDepotParkingSlotRecord,
} from './TruckDepotSystem';
import {
  calculateWarehouseCategoryCapacity,
  computeWarehousePhysicalLayout,
  getWarehouseCapacitiesForLevel,
  getWarehouseConstructedFootprintForLevel,
  getWarehouseDoorCountForLevel,
  getWarehouseForkliftCountForLevel,
  getWarehouseUpgradeCostForLevel,
  inferCargoCategoryFromString,
  SerializedWarehouseState,
  syncWarehouseForkliftEntities,
  WAREHOUSE_FINAL_FOOTPRINT,
  WAREHOUSE_MAX_LEVEL,
  WAREHOUSE_MIN_LEVEL,
  WAREHOUSE_RESERVED_DEPTH_CELLS,
  WAREHOUSE_RESERVED_WIDTH_CELLS,
  WarehouseCargoCategory,
  WarehouseFacilityState,
  WarehouseForkliftRecord,
  WarehouseLoadingDoorRecord,
  WarehouseLoadingTaskRecord,
} from './WarehouseSystem';
import { RoadWidthConfig, WorldConfigData, ZoneCategory } from './WorldConfig';

export {
  AIRCRAFT_HANGAR_PURCHASE_COST,
  AIRPORT_CARGO_CAPACITY_TONS_BY_LEVEL,
  AIRPORT_INTERMEDIATE_EXPANSION_LEVEL,
  AIRPORT_INTERMEDIATE_FOOTPRINT,
  AIRPORT_LEVEL_1_FOOTPRINT,
  AIRPORT_LEVEL_20_FOOTPRINT,
  AIRPORT_MAX_CARGO_CAPACITY_TONS,
  AIRPORT_MAX_PARKING_AREAS,
  AIRPORT_MIN_CARGO_CAPACITY_TONS,
  AIRPORT_PARKING_AREA_BASE_PRICE,
  AIRPORT_PARKING_AREA_PRICE_INCREMENT_PER_LEVEL,
  AIRPORT_RESERVED_FOOTPRINT,
  AIRPORT_STAND_UNLOCK_LEVELS,
  AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT,
  AIRPORT_UPGRADE_COST_INCREMENT_PER_LEVEL,
  AIRPORT_UPGRADE_LEVEL_2_COST,
  ALL_APRON_STAND_IDS,
  FIRST_OWNED_AIRCRAFT_PRICE,
  FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL,
  getAirportActiveBoundsForLevel,
  getAirportCargoCapacityForLevel,
  getAirportParkingAreaPriceForLevel,
  getAirportUnlockedStandsForLevel,
  getAirportUpgradeCostForLevel,
  getNextOwnedAircraftPurchaseRequirement,
  GUEST_AIRCRAFT_CATALOGUE,
  GUEST_AIRCRAFT_VISIT_DURATION_SEC,
  MAX_OWNED_AIRCRAFT,
  MAX_PLAYER_AIRCRAFT,
  OWNED_AIRCRAFT_SLOT_PROGRESSION,
  SECOND_OWNED_AIRCRAFT_PRICE,
  SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL,
  STARTER_MINI_TRUCK_CATALOGUE_ID,
  STARTER_MINI_TRUCK_COUNT,
  STARTER_MINI_TRUCK_LIVERY_ID,
  TRUCK_DEPOT_ID,
  TRUCK_DEPOT_LEVEL_1_CAPACITY,
  TRUCK_DEPOT_LEVEL_1_FOOTPRINT,
  TRUCK_DEPOT_LEVEL_10_CAPACITY,
  TRUCK_DEPOT_LEVEL_10_FOOTPRINT,
  TRUCK_DEPOT_LEVEL_SPECS,
  TRUCK_DEPOT_MAX_CAPACITY,
  TRUCK_DEPOT_MAX_LEVEL,
  TRUCK_DEPOT_MAX_RESERVED_FOOTPRINT,
  TRUCK_DEPOT_MIN_LEVEL,
};
export type {
  AirportParkingStandSpec,
  GuestAircraftCatalogueItem,
  TruckDepotFacilityState,
  TruckDepotLevelSpec,
  TruckDepotParkingSlotRecord,
};

export const FIVE_REAL_DAYS_MS = 5 * 24 * 60 * 60 * 1000; // 432,000,000 ms
export const TARGET_TRUCK_CRUISING_SPEED_KMH = 25.0; // Strictly ~25 km/h across all road types

export type TransactionCategory =
  | 'INITIAL_CAPITAL'
  | 'BUILDING_CONSTRUCTION'
  | 'ROAD_CONSTRUCTION'
  | 'RAIL_CONSTRUCTION'
  | 'BRIDGE_CONSTRUCTION'
  | 'DEMOLITION_REFUND'
  | 'VEHICLE_PURCHASE'
  | 'FACILITY_UPGRADE'
  | 'LAND_PURCHASE'
  | 'CONTRACT_REWARD'
  | 'OPERATING_EXPENSE'
  | 'VEHICLE_MAINTENANCE'
  | 'LEVEL_BONUS'
  | 'WAREHOUSE_RESTOCK';

export interface TransactionRecord {
  id: string;
  timestampMs: number;
  category: TransactionCategory;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  balanceAfter: number;
  description: string;
  relatedEntityId?: string;
  relatedContractId?: string;
}

export interface PlacedBuildingRecord {
  id: string;
  catalogueId: string;
  name: string;
  category: BuildingCatalogueItem['category'];
  gx: number;
  gz: number;
  widthCells: number;
  depthCells: number;
  orientation: 0 | 90 | 180 | 270;
  level: number;
  maxLevel: number;
  storageCapacityTons: number;
  storedCargoTons: number;
  vehicleSlotCapacity: number;
  vehicleSlotModal?: TransportModalCategory;
  isPreplaced: boolean;
  upgradeCost: number;
  // Optional reserved property bounds for expandable facilities (Warehouse 1: 25x30, Truck Depot: 20x8)
  reservedMinGx?: number;
  reservedMaxGx?: number;
  reservedMinGz?: number;
  reservedMaxGz?: number;
}

export type VehicleOperationalState =
  | 'IDLE_AT_DEPOT'
  | 'EN_ROUTE_TO_WAREHOUSE'
  | 'WAITING_FOR_DOOR'
  | 'DOCKING_AT_DOOR'
  | 'LOADING_AT_DOOR'
  | 'WAITING_FOR_STOCK'
  | 'EN_ROUTE_OUTBOUND'
  | 'OFFSCREEN_SIMULATION'
  | 'EN_ROUTE_RETURN'
  | 'MAINTENANCE_DUE';

export type VehicleDeliveryPhase =
  | 'IDLE'
  | 'TO_WAREHOUSE'
  | 'WAITING_FOR_DOOR'
  | 'WAITING_FOR_STOCK'
  | 'WAITING_FOR_FORKLIFT'
  | 'LOADING_AT_WAREHOUSE'
  | 'TO_DESTINATION'
  | 'UNLOADING_AT_DESTINATION';

export interface WorldWaypoint {
  wx: number;
  wy: number;
  wz: number;
  speedLimitKmh: number;
  isRoundabout?: boolean;
  isRamp?: boolean;
  isMotorway?: boolean;
  laneIndex?: number;
}

export interface OwnedVehicleRecord {
  id: string;
  catalogueId: string;
  name: string;
  modal: TransportModalCategory;
  liveryId: string;
  homeFacilityId: string;
  assignedDepotSlotId?: string;
  assignedDepotSlotNumber?: number;
  purchasePrice: number;
  capacityTons: number;
  targetCruisingSpeedKmh: number;
  currentSpeedKmh: number;
  state: VehicleOperationalState;
  deliveryPhase?: VehicleDeliveryPhase;
  targetWarehouseId?: string;
  assignedDoorId?: string;
  assignedLoadingTaskId?: string;
  loadingTaskId?: string;
  requiredCargoCategory?: WarehouseCargoCategory;
  requiredCargoTons?: number;
  cargoLoadedVerified?: boolean;
  statusMessage?: string;
  conditionPercent: number; // 0..100
  lastMaintenanceTimestampMs: number;
  nextMaintenanceTimestampMs: number;
  maintenanceCost: number;
  maintenanceOverdue: boolean;
  assignedContractId?: string;
  carryingCargoType?: string;
  carryingCargoCategory?: WarehouseCargoCategory;
  carryingCargoTons: number;
  // Kinematic & Articulation State
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  trailerWorldX: number;
  trailerWorldZ: number;
  trailerYaw: number;
  wheelRotationRad: number;
  totalDistanceMeters: number;
  routeProgressRatio: number; // 0..1
  offscreenRemainingSec: number;
  isBraking: boolean;
  turnSignal: 'NONE' | 'LEFT' | 'RIGHT';
  waypoints: WorldWaypoint[];
  currentWaypointIdx: number;
  pathDistanceTraveled: number;
  totalPathLength: number;
}

export interface AmbientTrafficVehicle {
  id: string;
  modal: TransportModalCategory;
  catalogueId: string;
  liveryId: string;
  laneIndex: number; // 0..3 Northbound, 4..7 Southbound, 8..9 Service roads, or Roundabout/Rail/Sea/Air
  direction: 1 | -1;
  targetSpeedKmh: number;
  currentSpeedKmh: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  trailerWorldX: number;
  trailerWorldZ: number;
  trailerYaw: number;
  wheelRotationRad: number;
  isBraking: boolean;
  turnSignal: 'NONE' | 'LEFT' | 'RIGHT';
  laneChangeTimer: number;
  targetLaneX: number;
  routeMode: 'MOTORWAY_MAIN' | 'ROUNDABOUT_RAMP_LOOP' | 'RAIL_LINE' | 'SEA_CHANNEL' | 'AIR_RUNWAY';
  loopProgress: number;
}

export interface TransportContractRecord {
  id: string;
  title: string;
  modal: TransportModalCategory;
  originFacilityId: string;
  originName: string;
  destinationFacilityId: string;
  destinationName: string;
  cargoType: string;
  cargoCategory?: WarehouseCargoCategory;
  cargoTons: number;
  requiredLevel: number;
  distanceKm: number;
  cashReward: number;
  xpReward: number;
  operatingExpenseEstimate: number;
  status: 'AVAILABLE' | 'ACTIVE' | 'COMPLETED';
  assignedVehicleId?: string;
  progressRatio: number; // 0..1
  completedCount: number;
  stockShortage?: boolean;
}

export type { AirportInfrastructureRecord } from './AirportSystem';

export interface SerializedEconomyState {
  money: number;
  totalEarnings: number;
  totalSpending: number;
  xp: number;
  level: number;
  transactions: TransactionRecord[];
  placedBuildings: PlacedBuildingRecord[];
  ownedVehicles: OwnedVehicleRecord[];
  contracts: TransportContractRecord[];
  completedContractIds: string[];
  truckDepot?: TruckDepotFacilityState;
  warehouses?: SerializedWarehouseState[];
  airport?: SerializedAirportState;
  airportOwned?: boolean;
  airportLevel?: number;
  hangar1Purchased?: boolean;
  hangar2Purchased?: boolean;
  ownedAircraftCount?: number;
  activeApronStandCount?: number;
  airportLogistics?: SerializedAirportLogisticsState;
  railHub?: SerializedRailwayHubState;
}

export class EconomyAndSimulationSystem {
  private config: WorldConfigData;
  private grid: GridSystem;
  private terrainWater: TerrainWaterSystem;
  private districts: DistrictSystem;
  private parcels: ParcelSystem;
  private roads: RoadSystem;
  private railways: RailwaySystem;
  private entities: EntityRegistry;

  // Economy & Progression State
  private money = 125000;
  private totalEarnings = 125000;
  private totalSpending = 0;
  private xp = 0;
  private level = 1;
  private transactions: TransactionRecord[] = [];
  private nextTxSeq = 1;

  // World Facilities, Truck Depot, Warehouses, Owned Vehicles, Ambient Traffic & Contracts
  private placedBuildings: Map<string, PlacedBuildingRecord> = new Map();
  private truckDepot!: TruckDepotFacilityState;
  private warehouses: Map<string, WarehouseFacilityState> = new Map();
  private ownedVehicles: Map<string, OwnedVehicleRecord> = new Map();
  private ambientVehicles: AmbientTrafficVehicle[] = [];
  private contracts: Map<string, TransportContractRecord> = new Map();
  private completedContractKeys: Set<string> = new Set();
  private airportOwned = false;
  private airportLevel = 0;
  private airport!: AirportInfrastructureRecord;
  public airportOps!: AirportLogisticsAndFlightController;

  private nextBuildingSeq = 1;
  private nextVehicleSeq = 1;
  private nextLoadingTaskSeq = 1;
  private levelUpNotification: string | null = null;

  constructor(
    config: WorldConfigData,
    grid: GridSystem,
    terrainWater: TerrainWaterSystem,
    districts: DistrictSystem,
    parcels: ParcelSystem,
    roads: RoadSystem,
    railways: RailwaySystem,
    entities: EntityRegistry
  ) {
    this.config = config;
    this.grid = grid;
    this.terrainWater = terrainWater;
    this.districts = districts;
    this.parcels = parcels;
    this.roads = roads;
    this.railways = railways;
    this.entities = entities;

    this.railways.setJobRewardCallback((job, train) => {
      this.recordTransactionInternal(
        'CONTRACT_REWARD',
        'INCOME',
        job.cashReward,
        `Completed Rail Freight Job: ${job.title} (${train.name})`,
        train.id,
        job.id
      );
      this.awardXp(job.xpReward, `Completed Rail Freight Job: ${job.title}`);
      if (train.assignedContractId) {
        const linkedContract = this.contracts.get(train.assignedContractId);
        if (linkedContract) {
          linkedContract.completedCount++;
          linkedContract.status = 'AVAILABLE';
          linkedContract.progressRatio = 0;
          linkedContract.assignedVehicleId = undefined;
        }
      }
    });

    this.initializeStarterEconomyAndWorldContent();
  }

  /**
   * Initializes starter economy, planned city neighborhoods, starter Level 1 Truck Depot (3 slots),
   * dedicated Airport infrastructure, starter owned trucks, ambient motorway/rail/sea/air traffic,
   * and initial transport contracts.
   */
  public initializeStarterEconomyAndWorldContent(): void {
    this.money = 0;
    this.totalEarnings = 0;
    this.totalSpending = 0;
    this.xp = 0;
    this.level = 1;
    this.transactions = [];
    this.placedBuildings.clear();
    this.warehouses.clear();
    this.ownedVehicles.clear();
    this.ambientVehicles = [];
    this.contracts.clear();
    this.completedContractKeys.clear();
    this.nextLoadingTaskSeq = 1;

    this.recordTransactionInternal(
      'INITIAL_CAPITAL',
      'INCOME',
      125000,
      'Initial Regional Transport Charter Capital'
    );

    // 1. Dedicated 30x40 Regional Cargo Airport Reservation (gx 152..191, gz 12..41)
    //    Starts locked & unowned as an Abandoned Regional Cargo Airfield until XP Level 100 ($15,000,000).
    this.airportOwned = false;
    this.airportLevel = 0;
    this.airportOps = new AirportLogisticsAndFlightController(
      this.config,
      this.grid
    );
    this.refreshAirportState();

    // 2. Register Planned Starter City, Industrial, Logistics, Rail & Port Buildings
    // Note: Starter Core Westgate Logistics buildings end at gz = 52 so that Warehouse 1's
    // 25x30 reserved property (gz 67..96) is positioned 67 - 52 = 15 grid blocks from the core edge.
    // The 20x8 Truck Depot reserved property occupies (gx 38..57, gz 45..52).
    const preplacedSpecs: Array<{
      id: string;
      catalogueId: string;
      name: string;
      gx: number;
      gz: number;
      orientation?: 0 | 90 | 180 | 270;
    }> = [
      // Core Facility #2: Delivery Headquarters (5 x 7 grid blocks = 10m x 14m at gx 78..82, gz 44..50)
      {
        id: 'building-city-hq-tower',
        catalogueId: 'bld-com-financial-tower',
        name: 'Delivery Headquarters',
        gx: 78,
        gz: 44,
      },
      // Core Facility #1 (Port Terminal Warehouse inside Port Reserved Zone gx 82..98, gz 88..98)
      {
        id: 'facility-port-warehouse-1',
        catalogueId: 'bld-port-container-warehouse',
        name: 'Southbay Quayside Container Terminal',
        gx: 84,
        gz: 90,
      },
    ];

    for (const item of preplacedSpecs) {
      const catSpec = getBuildingSpecById(item.catalogueId);
      if (!catSpec) continue;
      const rec: PlacedBuildingRecord = {
        id: item.id,
        catalogueId: catSpec.id,
        name: item.name,
        category: catSpec.category,
        gx: item.gx,
        gz: item.gz,
        widthCells: catSpec.widthCells,
        depthCells: catSpec.depthCells,
        orientation: item.orientation ?? 0,
        level: 1,
        maxLevel: 3,
        storageCapacityTons: catSpec.storageCapacityTons,
        storedCargoTons: Math.round(catSpec.storageCapacityTons * 0.4),
        vehicleSlotCapacity: catSpec.vehicleSlotCapacity,
        vehicleSlotModal: catSpec.vehicleSlotModal,
        isPreplaced: true,
        upgradeCost: Math.round(catSpec.price * 0.75),
      };
      this.placedBuildings.set(rec.id, rec);

      if (!this.entities.has(rec.id)) {
        const fp = this.grid.getFootprint(
          rec.gx,
          rec.gz,
          rec.widthCells,
          rec.depthCells,
          rec.orientation
        );
        this.entities.register({
          id: rec.id,
          category: 'STARTER_BUILDING',
          type: rec.catalogueId,
          position: { gx: rec.gx, gz: rec.gz },
          footprint: fp.cells,
          orientation: rec.orientation,
          elevation:
            this.terrainWater.getElevationAtGrid(rec.gx, rec.gz) ?? 1.2,
          ownership: 'PLAYER',
          active: true,
          metadata: {
            name: rec.name,
            catalogueId: rec.catalogueId,
            widthCells: rec.widthCells,
            depthCells: rec.depthCells,
            category: rec.category,
          },
        });
      }
    }

    // 2A. Initialize 20-Level Truck Depot (Level 1 active footprint 4x3 at gx=46, gz=50 inside 20x8 reserved property gx 38..57, gz 45..52)
    this.initializeTruckDepot();

    // 2B. Initialize Warehouse 1 (20-Level Upgradeable Logistics Facility, 15 Grid Blocks from Core)
    this.initializeWarehouse1();

    // 3. Register 3 Identical Starter Owned Mini Cargo Trucks parked in Slots 1, 2 & 3 of the Level 1 Truck Depot
    const nowMs = Date.now();
    this.nextVehicleSeq = 1;
    for (let slotNum = 1; slotNum <= STARTER_MINI_TRUCK_COUNT; slotNum++) {
      this.registerStarterOwnedVehicle(
        `veh-owned-${slotNum}`,
        STARTER_MINI_TRUCK_CATALOGUE_ID,
        `Mini Cargo Truck #${100 + slotNum}`,
        STARTER_MINI_TRUCK_LIVERY_ID,
        TRUCK_DEPOT_ID,
        slotNum,
        nowMs
      );
    }

    // 4. Initialize Active & Available Transport Contracts
    this.initializeContracts();

    // 5. Initialize Live Ambient Motorway, Roundabout, Rail, Maritime & Aviation Traffic
    this.initializeAmbientTraffic();
  }

  /**
   * Initializes the 20-Level Truck Depot with its 20x8 reserved expansion footprint (gx 38..57, gz 45..52)
   * and Level 1 active 4x3 footprint (gx 46..49, gz 50..52) supporting 3 starting mini trucks.
   */
  private initializeTruckDepot(): void {
    this.truckDepot = createInitialTruckDepotFacilityState(38, 45, 1);
    this.syncTruckDepotPlacedBuildingAndEntity();
  }

  private syncTruckDepotPlacedBuildingAndEntity(): void {
    const td = this.truckDepot;
    const bldRec: PlacedBuildingRecord = {
      id: td.depotId,
      catalogueId: TRUCK_DEPOT_CATALOGUE_ID,
      name: td.name,
      category: 'ROAD_LOGISTICS',
      gx: td.constructedGx,
      gz: td.constructedGz,
      widthCells: td.activeWidthCells,
      depthCells: td.activeDepthCells,
      reservedMinGx: td.reservedMinGx,
      reservedMaxGx: td.reservedMaxGx,
      reservedMinGz: td.reservedMinGz,
      reservedMaxGz: td.reservedMaxGz,
      orientation: 0,
      level: td.level,
      maxLevel: td.maxLevel,
      storageCapacityTons: 60 + (td.level - 1) * 15,
      storedCargoTons: 0,
      vehicleSlotCapacity: td.truckCapacity,
      vehicleSlotModal: 'ROAD',
      isPreplaced: true,
      upgradeCost: td.nextLevelUpgradeCost ?? 0,
    };
    this.placedBuildings.set(td.depotId, bldRec);

    if (this.entities.has(td.depotId)) {
      this.entities.unregister(td.depotId);
    }
    const reservedFp = this.grid.getFootprint(
      td.reservedMinGx,
      td.reservedMinGz,
      td.reservedWidthCells,
      td.reservedDepthCells,
      0
    );
    this.entities.register({
      id: td.depotId,
      category: 'STARTER_BUILDING',
      type: TRUCK_DEPOT_CATALOGUE_ID,
      position: { gx: td.constructedGx, gz: td.constructedGz },
      footprint: reservedFp.cells,
      orientation: 0,
      elevation: 1.2,
      ownership: 'PLAYER',
      active: true,
      metadata: {
        name: td.name,
        catalogueId: TRUCK_DEPOT_CATALOGUE_ID,
        level: td.level,
        maxLevel: td.maxLevel,
        widthCells: td.activeWidthCells,
        depthCells: td.activeDepthCells,
        reservedWidthCells: td.reservedWidthCells,
        reservedDepthCells: td.reservedDepthCells,
        reservedMinGx: td.reservedMinGx,
        reservedMaxGx: td.reservedMaxGx,
        reservedMinGz: td.reservedMinGz,
        reservedMaxGz: td.reservedMaxGz,
        category: 'ROAD_LOGISTICS',
      },
    });
  }

  /**
   * Initializes Warehouse 1 at its strategic location (reserved 25x30 footprint: gx 35..59, gz 67..96),
   * exactly 15 grid blocks south of the core logistics edge (gz = 52 -> minGz = 67).
   */
  private initializeWarehouse1(): void {
    const whId = 'facility-warehouse-1';
    const reservedMinGx = 35;
    const reservedMaxGx = 59; // 25 cells wide
    const reservedMinGz = 67;
    const reservedMaxGz = 96; // 30 cells deep
    const initialLevel = 1;

    const capacities = getWarehouseCapacitiesForLevel(initialLevel);
    const layout = computeWarehousePhysicalLayout(
      whId,
      initialLevel,
      reservedMinGx,
      reservedMinGz,
      this.grid
    );

    const whState: WarehouseFacilityState = {
      id: whId,
      name: 'Warehouse 1',
      level: initialLevel,
      maxLevel: WAREHOUSE_MAX_LEVEL,
      upgradeCost: 6500,
      reservedMinGx,
      reservedMaxGx,
      reservedMinGz,
      reservedMaxGz,
      reservedWidthCells: WAREHOUSE_FINAL_FOOTPRINT.widthCells,
      reservedDepthCells: WAREHOUSE_FINAL_FOOTPRINT.depthCells,
      constructedGx: layout.constructedGx,
      constructedGz: layout.constructedGz,
      constructedWidthCells: layout.constructedWidth,
      constructedDepthCells: layout.constructedDepth,
      accessRoadEntryGx: 48,
      accessRoadEntryGz: 67,
      capacities: { ...capacities },
      stored: {
        FOOD: capacities.FOOD,
        INDUSTRIAL: capacities.INDUSTRIAL,
        PACKAGES: capacities.PACKAGES,
      },
      operationalDoorCount: getWarehouseDoorCountForLevel(initialLevel),
      operationalForkliftCount: getWarehouseForkliftCountForLevel(initialLevel),
      doors: layout.doors,
      forklifts: layout.forklifts,
      activeTasks: [],
      activeLoadingTasks: [],
      waitingQueueVehicleIds: [],
      waitingTruckIds: [],
      operationalStatus: 'OPERATIONAL',
      statusMessage: '2 loading doors & 2 forklifts ready for dispatch.',
    };

    this.warehouses.set(whId, whState);

    const totalCap = Number(
      (capacities.FOOD + capacities.INDUSTRIAL + capacities.PACKAGES).toFixed(1)
    );
    const bldRec: PlacedBuildingRecord = {
      id: whId,
      catalogueId: 'bld-logistics-warehouse-1',
      name: 'Warehouse 1',
      category: 'ROAD_LOGISTICS',
      gx: layout.constructedGx,
      gz: layout.constructedGz,
      widthCells: layout.constructedWidth,
      depthCells: layout.constructedDepth,
      reservedMinGx,
      reservedMaxGx,
      reservedMinGz,
      reservedMaxGz,
      orientation: 0,
      level: initialLevel,
      maxLevel: WAREHOUSE_MAX_LEVEL,
      storageCapacityTons: totalCap,
      storedCargoTons: totalCap,
      vehicleSlotCapacity: 0,
      isPreplaced: true,
      upgradeCost: 6500,
    };
    this.placedBuildings.set(whId, bldRec);

    // Register the entire 25x30 reserved property in EntityRegistry so:
    // 1. Clicking anywhere on Warehouse 1's property selects Warehouse 1
    // 2. Unrelated construction cannot encroach on the reserved 25x30 expansion footprint
    if (this.entities.has(whId)) {
      this.entities.unregister(whId);
    }
    const reservedFp = this.grid.getFootprint(
      reservedMinGx,
      reservedMinGz,
      WAREHOUSE_FINAL_FOOTPRINT.widthCells,
      WAREHOUSE_FINAL_FOOTPRINT.depthCells,
      0
    );
    this.entities.register({
      id: whId,
      category: 'WAREHOUSE_FACILITY',
      type: 'bld-logistics-warehouse-1',
      position: { gx: layout.constructedGx, gz: layout.constructedGz },
      footprint: reservedFp.cells,
      orientation: 0,
      elevation: 1.2,
      ownership: 'PLAYER',
      active: true,
      metadata: {
        name: whState.name,
        catalogueId: 'bld-logistics-warehouse-1',
        level: whState.level,
        maxLevel: whState.maxLevel,
        widthCells: layout.constructedWidth,
        depthCells: layout.constructedDepth,
        reservedWidthCells: WAREHOUSE_FINAL_FOOTPRINT.widthCells,
        reservedDepthCells: WAREHOUSE_FINAL_FOOTPRINT.depthCells,
        reservedMinGx,
        reservedMaxGx,
        reservedMinGz,
        reservedMaxGz,
        category: 'LOGISTICS',
      },
    });

    syncWarehouseForkliftEntities(whState, this.entities, this.grid);
  }

  private registerStarterOwnedVehicle(
    id: string,
    catalogueId: string,
    customName: string,
    liveryId: string,
    facilityId: string,
    slotNumber: number,
    nowMs: number
  ): void {
    const spec = getVehicleSpecById(catalogueId);
    if (!spec) return;

    const slot = this.truckDepot?.slots.find(
      (s) => s.slotNumber === slotNumber && s.unlocked
    );
    const depot = this.placedBuildings.get(facilityId);
    const fallbackWp = this.grid.gridToWorld(
      depot ? depot.gx + 1 : 48,
      depot ? depot.gz + 2 : 52
    );

    const worldX = slot ? slot.worldX : fallbackWp.x;
    const worldZ = slot ? slot.worldZ : fallbackWp.z;
    const headingYaw = slot ? slot.headingYaw : 0;

    if (slot) {
      slot.assignedVehicleId = id;
      slot.occupancyState = 'PARKED';
    }

    const record: OwnedVehicleRecord = {
      id,
      catalogueId: spec.id,
      name: customName,
      modal: spec.modal,
      liveryId,
      homeFacilityId: facilityId,
      assignedDepotSlotId: slot?.slotId,
      assignedDepotSlotNumber: slot?.slotNumber,
      purchasePrice: spec.price,
      capacityTons: spec.capacityTons,
      targetCruisingSpeedKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      currentSpeedKmh: 0,
      state: 'IDLE_AT_DEPOT',
      conditionPercent: 100,
      lastMaintenanceTimestampMs: nowMs,
      nextMaintenanceTimestampMs: nowMs + FIVE_REAL_DAYS_MS,
      maintenanceCost: spec.maintenanceCostEvery5Days,
      maintenanceOverdue: false,
      carryingCargoTons: 0,
      worldX,
      worldY: 1.26,
      worldZ,
      headingYaw,
      trailerWorldX: worldX,
      trailerWorldZ: worldZ - 1.5,
      trailerYaw: headingYaw,
      wheelRotationRad: 0,
      totalDistanceMeters: 0,
      routeProgressRatio: 0,
      offscreenRemainingSec: 0,
      isBraking: false,
      turnSignal: 'NONE',
      waypoints: [],
      currentWaypointIdx: 0,
      pathDistanceTraveled: 0,
      totalPathLength: 1,
    };
    this.ownedVehicles.set(id, record);
  }

  private initializeContracts(): void {
    const initialContracts: TransportContractRecord[] = [
      {
        id: 'contract-road-retail-1',
        title: 'Delivery HQ Provisioning & Catering Supply',
        modal: 'ROAD',
        originFacilityId: 'facility-warehouse-1',
        originName: 'Warehouse 1',
        destinationFacilityId: 'building-city-hq-tower',
        destinationName: 'Delivery Headquarters',
        cargoType: 'Food Items',
        cargoCategory: 'FOOD',
        cargoTons: 4,
        requiredLevel: 1,
        distanceKm: 2.4,
        cashReward: 4800,
        xpReward: 130,
        operatingExpenseEstimate: 280,
        status: 'AVAILABLE',
        progressRatio: 0,
        completedCount: 0,
      },
      {
        id: 'contract-road-interstate-2',
        title: 'Motorway Interstate Freight Export',
        modal: 'ROAD',
        originFacilityId: 'facility-warehouse-1',
        originName: 'Warehouse 1',
        destinationFacilityId: 'highway-extreme-right',
        destinationName: 'Eastern 10-Lane Interstate Corridor',
        cargoType: 'Industrial Items',
        cargoCategory: 'INDUSTRIAL',
        cargoTons: 8,
        requiredLevel: 1,
        distanceKm: 4.8,
        cashReward: 7600,
        xpReward: 180,
        operatingExpenseEstimate: 440,
        status: 'AVAILABLE',
        progressRatio: 0,
        completedCount: 0,
      },
      {
        id: 'contract-road-port-drayage-3',
        title: 'Southbay Port Quayside Express Drayage',
        modal: 'ROAD',
        originFacilityId: 'facility-warehouse-1',
        originName: 'Warehouse 1',
        destinationFacilityId: 'facility-port-warehouse-1',
        destinationName: 'Southbay Quayside Container Terminal',
        cargoType: 'Normal Packages',
        cargoCategory: 'PACKAGES',
        cargoTons: 2,
        requiredLevel: 1,
        distanceKm: 3.6,
        cashReward: 6400,
        xpReward: 160,
        operatingExpenseEstimate: 360,
        status: 'AVAILABLE',
        progressRatio: 0,
        completedCount: 0,
      },
      {
        id: 'contract-rail-intermodal-4',
        title: 'North-South Corridor Rail Hauler',
        modal: 'RAIL',
        originFacilityId: 'rail-depot-starter',
        originName: 'Starter Locomotive Depot',
        destinationFacilityId: 'rail-station-starter',
        destinationName: 'Westgate Freight & Rail Platform',
        cargoType: 'Intermodal Containers',
        cargoTons: 120,
        requiredLevel: 2,
        distanceKm: 8.5,
        cashReward: 14500,
        xpReward: 290,
        operatingExpenseEstimate: 950,
        status: 'AVAILABLE',
        progressRatio: 0,
        completedCount: 0,
      },
      {
        id: 'contract-water-coastal-5',
        title: 'Southern Sea Maritime Container Charter',
        modal: 'WATER',
        originFacilityId: 'facility-port-warehouse-1',
        originName: 'Southbay Coastal Harbour Berth 1',
        destinationFacilityId: 'ocean-main',
        destinationName: 'Southern Sapphire Sea Trade Lane',
        cargoType: 'Intermodal Containers',
        cargoTons: 180,
        requiredLevel: 3,
        distanceKm: 14.0,
        cashReward: 22000,
        xpReward: 420,
        operatingExpenseEstimate: 1400,
        status: 'AVAILABLE',
        progressRatio: 0,
        completedCount: 0,
      },
      {
        id: 'contract-air-express-6',
        title: 'Skyline Air Express Avionics Priority',
        modal: 'AIR',
        originFacilityId: AIRPORT_CARGO_TERMINAL_FOOTPRINT.id,
        originName: AIRPORT_CARGO_TERMINAL_FOOTPRINT.name,
        destinationFacilityId: 'building-city-hq-tower',
        destinationName: 'Delivery Headquarters',
        cargoType: 'Air Express Electronics',
        cargoTons: 45,
        requiredLevel: AIRPORT_UNLOCK_LEVEL,
        distanceKm: 25.0,
        cashReward: 34000,
        xpReward: 600,
        operatingExpenseEstimate: 2200,
        status: 'AVAILABLE',
        progressRatio: 0,
        completedCount: 0,
      },
    ];

    for (const c of initialContracts) {
      this.contracts.set(c.id, c);
    }
  }

  /**
   * Initializes live ambient motorway vehicles across all 8 main lanes + 2 service lanes,
   * roundabout-to-highway ramp vehicles, a starter freight train on Line 1, a coastal container ship,
   * and an airport turboprop so the world feels genuinely alive.
   */
  private initializeAmbientTraffic(): void {
    this.ambientVehicles = [];

    const hw = this.config.highway;
    const hwCenterWorld = this.grid.gridToWorld(
      (hw.startX + hw.endX) * 0.5,
      (hw.visibleStartZ + hw.visibleEndZ) * 0.5
    );
    const minWz = this.grid.gridToWorld(hw.startX, hw.visibleStartZ).z;
    const maxWz = this.grid.gridToWorld(hw.startX, hw.visibleEndZ).z;
    const laneW = 2.1;

    const truckTypes = [
      'veh-road-semi-enclosed',
      'veh-road-semi-container',
      'veh-road-semi-reefer',
      'veh-road-semi-flatbed',
      'veh-road-semi-tanker',
      'veh-road-rigid-box-truck',
      'veh-road-sprinter-van',
    ];

    // 1. 12 Motorway Vehicles distributed across the 4 Northbound & 4 Southbound Main Lanes + Service Lanes
    for (let i = 0; i < 12; i++) {
      const isSouthbound = i % 2 === 0;
      const laneInDir = (i % 4) + 1; // 1..4
      const side = isSouthbound ? -1 : 1;
      const laneX = hwCenterWorld.x + side * (laneInDir - 0.5) * laneW;
      const frac = ((i * 0.19 + 0.07) % 0.88) + 0.06;
      const wz = minWz + frac * (maxWz - minWz);
      const yaw = isSouthbound ? 0 : Math.PI;
      const catId = truckTypes[i % truckTypes.length];
      const liv = FLEET_LIVERIES[i % FLEET_LIVERIES.length].id;

      this.ambientVehicles.push({
        id: `ambient-hwy-${i + 1}`,
        modal: 'ROAD',
        catalogueId: catId,
        liveryId: liv,
        laneIndex: isSouthbound ? laneInDir - 1 : 3 + laneInDir,
        direction: isSouthbound ? 1 : -1,
        targetSpeedKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
        currentSpeedKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
        worldX: laneX,
        worldY: 1.31,
        worldZ: wz,
        headingYaw: yaw,
        trailerWorldX: laneX,
        trailerWorldZ: wz - (isSouthbound ? 2.4 : -2.4),
        trailerYaw: yaw,
        wheelRotationRad: i * 1.3,
        isBraking: false,
        turnSignal: 'NONE',
        laneChangeTimer: 4 + (i % 5) * 2.5,
        targetLaneX: laneX,
        routeMode: 'MOTORWAY_MAIN',
        loopProgress: frac,
      });
    }

    // 2. 4 Roundabout-to-Motorway Interchange Loop Trucks demonstrating smooth roundabout + ramp navigation
    for (let k = 0; k < 4; k++) {
      const catId = truckTypes[(k + 2) % truckTypes.length];
      const liv = FLEET_LIVERIES[(k + 1) % FLEET_LIVERIES.length].id;
      this.ambientVehicles.push({
        id: `ambient-roundabout-loop-${k + 1}`,
        modal: 'ROAD',
        catalogueId: catId,
        liveryId: liv,
        laneIndex: 0,
        direction: 1,
        targetSpeedKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
        currentSpeedKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
        worldX: 0,
        worldY: 1.31,
        worldZ: 0,
        headingYaw: 0,
        trailerWorldX: 0,
        trailerWorldZ: 0,
        trailerYaw: 0,
        wheelRotationRad: 0,
        isBraking: false,
        turnSignal: 'NONE',
        laneChangeTimer: 0,
        targetLaneX: 0,
        routeMode: 'ROUNDABOUT_RAMP_LOOP',
        loopProgress: (k * 0.25) % 1.0,
      });
    }

    // 3. Railway Freight Yard Rolling Stock & Forklifts:
    // Strictly IDLE by default! Locomotives, freight cars, and GTE Model 360 forklifts
    // remain 100% stationary at their siding/equipment bays until the player triggers [Assign Job & Load].

    // 4. Coastal Container Ship navigating the Southern Sapphire Sea past Southbay Harbour Berths
    const seaPos = this.grid.gridToWorld(90, 103);
    this.ambientVehicles.push({
      id: 'ambient-ship-vessel-1',
      modal: 'WATER',
      catalogueId: 'veh-water-coastal-feeder',
      liveryId: 'livery-atlantic-blue',
      laneIndex: 0,
      direction: 1,
      targetSpeedKmh: 28,
      currentSpeedKmh: 28,
      worldX: seaPos.x,
      worldY: 0.15,
      worldZ: seaPos.z,
      headingYaw: Math.PI * 0.5,
      trailerWorldX: seaPos.x,
      trailerWorldZ: seaPos.z,
      trailerYaw: Math.PI * 0.5,
      wheelRotationRad: 0,
      isBraking: false,
      turnSignal: 'NONE',
      laneChangeTimer: 0,
      targetLaneX: seaPos.x,
      routeMode: 'SEA_CHANNEL',
      loopProgress: 0.2,
    });

    // 5. Regional Cargo Turboprop on the Airport Runway ONLY when the Airport is owned & operational!
    if (this.airportOwned) {
      this.ensureOperationalAirportAmbientTraffic();
    }
  }

  private ensureOperationalAirportAmbientTraffic(): void {
    // Prompt 6 Section 2: All aircraft movement is controlled exclusively by the single
    // authoritative AirportLogisticsAndFlightController (no ambient runway ping-pong loop).
    this.ambientVehicles = this.ambientVehicles.filter(
      (v) => v.modal !== 'AIR'
    );
  }

  // ===========================================================================
  // CENTRALIZED ECONOMY & XP METHODS
  // ===========================================================================

  private recordTransactionInternal(
    category: TransactionCategory,
    type: 'INCOME' | 'EXPENSE',
    amount: number,
    description: string,
    relatedEntityId?: string,
    relatedContractId?: string
  ): TransactionRecord {
    const cleanAmount = Math.max(0, Math.round(amount));
    if (type === 'INCOME') {
      this.money += cleanAmount;
      this.totalEarnings += cleanAmount;
    } else {
      this.money = Math.max(0, this.money - cleanAmount);
      this.totalSpending += cleanAmount;
    }

    const tx: TransactionRecord = {
      id: `tx-${this.nextTxSeq++}`,
      timestampMs: Date.now(),
      category,
      type,
      amount: cleanAmount,
      balanceAfter: this.money,
      description,
      relatedEntityId,
      relatedContractId,
    };
    this.transactions.unshift(tx);
    if (this.transactions.length > 80) {
      this.transactions.pop();
    }
    return tx;
  }

  public getMoney(): number {
    return this.money;
  }

  public getTotalEarnings(): number {
    return this.totalEarnings;
  }

  public getTotalSpending(): number {
    return this.totalSpending;
  }

  public getNetPerformance(): number {
    return this.totalEarnings - this.totalSpending;
  }

  public getTransactions(): TransactionRecord[] {
    return [...this.transactions];
  }

  public getXp(): number {
    return this.xp;
  }

  public getLevel(): number {
    return this.level;
  }

  public getLevelProgressInfo() {
    return getLevelInfoForXp(this.xp);
  }

  public consumeLevelUpNotification(): string | null {
    const msg = this.levelUpNotification;
    this.levelUpNotification = null;
    return msg;
  }

  /**
   * Awards XP for genuine gameplay achievements and triggers level-up rewards when crossing thresholds.
   */
  public awardXp(amount: number, reason: string): {
    leveledUp: boolean;
    newLevel: number;
    cashBonusAwarded: number;
  } {
    if (amount <= 0) {
      return { leveledUp: false, newLevel: this.level, cashBonusAwarded: 0 };
    }

    this.xp += Math.round(amount);
    const info = getLevelInfoForXp(this.xp);
    let leveledUp = false;
    let totalBonus = 0;

    while (this.level < info.level) {
      this.level++;
      leveledUp = true;
      const spec = LEVEL_PROGRESSION_TABLE.find((s) => s.level === this.level);
      if (spec && spec.cashBonus > 0) {
        totalBonus += spec.cashBonus;
        this.recordTransactionInternal(
          'LEVEL_BONUS',
          'INCOME',
          spec.cashBonus,
          `Level ${this.level} (${spec.title}) Milestone Bonus`
        );
      }
      if (spec) {
        this.levelUpNotification = `Level ${this.level} Unlocked: ${spec.title}! (+$${(spec.cashBonus || 0).toLocaleString()} Bonus · ${spec.unlockSummary[0]})`;
      }
    }

    if (leveledUp) {
      this.refreshAirportState();
    }

    return {
      leveledUp,
      newLevel: this.level,
      cashBonusAwarded: totalBonus,
    };
  }

  /**
   * Sets the player's XP level directly and synchronizes XP and airport unlock state.
   */
  public setPlayerLevel(targetLevel: number): void {
    const clamped = Math.max(1, Math.floor(targetLevel));
    this.level = clamped;
    this.xp = Math.max(this.xp, getXpRequiredForLevel(clamped));
    this.refreshAirportState();
  }

  /**
   * Adds funds to the player's balance via the centralized transaction ledger.
   */
  public addMoney(
    amount: number,
    description = 'Capital Reserve Allocation'
  ): number {
    if (amount > 0) {
      this.recordTransactionInternal(
        'INITIAL_CAPITAL',
        'INCOME',
        amount,
        description
      );
    }
    return this.money;
  }

  // ===========================================================================
  // INFRASTRUCTURE COST & DEMOLITION REFUND CALCULATORS
  // ===========================================================================

  public calculateRoadCost(
    cellCount: number,
    widthConfig: RoadWidthConfig
  ): number {
    const perCell =
      widthConfig === '1x1' ? 120 : widthConfig === '2x2' ? 240 : 380;
    return Math.max(perCell * 2, cellCount * perCell);
  }

  public calculateBridgeCost(
    cellCount: number,
    category: 'ROAD_BRIDGE' | 'RAIL_BRIDGE',
    widthConfig: RoadWidthConfig = '1x1'
  ): number {
    if (category === 'RAIL_BRIDGE') {
      return Math.max(2400, cellCount * 450);
    }
    const perCell =
      widthConfig === '1x1' ? 350 : widthConfig === '2x2' ? 550 : 800;
    return Math.max(1800, cellCount * perCell);
  }

  public chargeInfrastructureCost(
    category:
      | 'ROAD_CONSTRUCTION'
      | 'RAIL_CONSTRUCTION'
      | 'BRIDGE_CONSTRUCTION',
    cost: number,
    description: string,
    entityId?: string
  ): { success: boolean; reason?: string } {
    if (this.money < cost) {
      return {
        success: false,
        reason: `Insufficient funds: requires $${cost.toLocaleString()} (available: $${this.money.toLocaleString()}).`,
      };
    }
    this.recordTransactionInternal(
      category,
      'EXPENSE',
      cost,
      description,
      entityId
    );
    return { success: true };
  }

  public processDemolitionRefund(
    originalCostEstimate: number,
    description: string,
    entityId?: string
  ): number {
    const refund = Math.round(originalCostEstimate * 0.6); // 60% partial refund
    if (refund > 0) {
      this.recordTransactionInternal(
        'DEMOLITION_REFUND',
        'INCOME',
        refund,
        `${description} (60% Salvage Refund)`,
        entityId
      );
    }
    return refund;
  }

  // ===========================================================================
  // BUILDING PLACEMENT, INSPECTION & UPGRADES (Master Prompts 4 & 6)
  // ===========================================================================

  public validateBuildingPlacement(
    catalogueId: string,
    gx: number,
    gz: number,
    orientation: 0 | 90 | 180 | 270 = 0
  ): {
    valid: boolean;
    reason?: string;
    cells: GridCoord[];
    spec?: BuildingCatalogueItem;
  } {
    const spec = getBuildingSpecById(catalogueId);
    if (!spec) {
      return {
        valid: false,
        reason: `Unknown building catalogue ID: ${catalogueId}`,
        cells: [],
      };
    }

    if (this.level < spec.unlockLevel) {
      return {
        valid: false,
        reason: `${spec.name} requires Player Level ${spec.unlockLevel} (current: Level ${this.level}).`,
        cells: [],
        spec,
      };
    }

    // Special validation for Manual Aircraft Maintenance Hangars on Dedicated Airport Hangar Tiles (Prompt 5)
    if (catalogueId === 'bld-air-regional-hangar') {
      const hangarSlot = this.airportOps.getHangarAtCell(gx, gz);
      if (!hangarSlot) {
        return {
          valid: false,
          reason:
            'Aircraft Maintenance Hangars may only be constructed on dedicated Airport Hangar Tiles (Hangar 1 at 176,47 or Hangar 2 at 185,47).',
          cells: [],
          spec,
        };
      }
      const hFp = this.grid.getFootprint(
        hangarSlot.bounds.minGx,
        hangarSlot.bounds.minGz,
        hangarSlot.bounds.widthCells,
        hangarSlot.bounds.depthCells,
        0
      );
      if (!this.airportOwned) {
        return {
          valid: false,
          reason:
            'Purchase and restore the Regional Cargo Airport before constructing Aircraft Hangars.',
          cells: hFp.cells,
          spec,
        };
      }
      if (hangarSlot.constructed) {
        return {
          valid: false,
          reason: `${hangarSlot.name} is already constructed.`,
          cells: hFp.cells,
          spec,
        };
      }
      if (this.airport.level < hangarSlot.unlockAirportLevel) {
        return {
          valid: false,
          reason: `${hangarSlot.name} requires Airport Level ${hangarSlot.unlockAirportLevel} (current: Level ${this.airport.level}).`,
          cells: hFp.cells,
          spec,
        };
      }
      if (this.money < hangarSlot.constructionCost) {
        return {
          valid: false,
          reason: `Insufficient funds for ${hangarSlot.name}: costs $${hangarSlot.constructionCost.toLocaleString()}.`,
          cells: hFp.cells,
          spec,
        };
      }
      return { valid: true, cells: hFp.cells, spec };
    }

    if (this.money < spec.price) {
      return {
        valid: false,
        reason: `Insufficient funds for ${spec.name}: costs $${spec.price.toLocaleString()}.`,
        cells: [],
        spec,
      };
    }

    const fp = this.grid.getFootprint(
      gx,
      gz,
      spec.widthCells,
      spec.depthCells,
      orientation
    );
    if (!fp.valid) {
      return {
        valid: false,
        reason: 'Building footprint extends outside playable map boundaries.',
        cells: fp.cells,
        spec,
      };
    }

    for (const c of fp.cells) {
      if (this.terrainWater.isWaterAt(c.gx, c.gz)) {
        return {
          valid: false,
          reason: 'Buildings cannot be constructed over water bodies.',
          cells: fp.cells,
          spec,
        };
      }

      const parcel = this.parcels.getParcelAt(c.gx, c.gz);
      if (!parcel || !parcel.owned) {
        return {
          valid: false,
          reason: `Land parcel (${parcel?.name || 'Unowned Sector'}) must be purchased before placing buildings.`,
          cells: fp.cells,
          spec,
        };
      }

      const zone = this.districts.getZoneAt(c.gx, c.gz);
      if (!spec.allowedZones.includes(zone)) {
        return {
          valid: false,
          reason: `${spec.name} (${spec.category}) is not permitted in ${ZoneCategory[zone]} zoning.`,
          cells: fp.cells,
          spec,
        };
      }

      if (this.roads.getRoadAtCell(c.gx, c.gz)) {
        return {
          valid: false,
          reason: 'Building footprint overlaps an existing road segment.',
          cells: fp.cells,
          spec,
        };
      }

      if (isCellInAirportReservation(this.config, c.gx, c.gz)) {
        return {
          valid: false,
          reason:
            'Reserved 30×40 Regional Cargo Airport zone (and its 10×10 Warehouse & 10×10 Transfer Yard reservations) cannot be used for ordinary buildings, unrelated warehouses, or depots.',
          cells: fp.cells,
          spec,
        };
      }

      if (
        this.truckDepot &&
        isCellInTruckDepotReservedArea(this.truckDepot, c.gx, c.gz)
      ) {
        return {
          valid: false,
          reason:
            'Reserved 20×8 Truck Depot expansion land cannot be used for unrelated buildings.',
          cells: fp.cells,
          spec,
        };
      }

      const existingEnts = this.entities.getEntitiesAtCell(c.gx, c.gz);
      if (existingEnts.length > 0) {
        return {
          valid: false,
          reason: `Footprint overlaps existing structure (${existingEnts[0].id}).`,
          cells: fp.cells,
          spec,
        };
      }
    }

    return { valid: true, cells: fp.cells, spec };
  }

  public constructBuilding(
    catalogueId: string,
    gx: number,
    gz: number,
    orientation: 0 | 90 | 180 | 270 = 0
  ): {
    success: boolean;
    reason?: string;
    building?: PlacedBuildingRecord;
  } {
    if (catalogueId === 'bld-air-regional-hangar') {
      const hangarSlot = this.airportOps.getHangarAtCell(gx, gz);
      if (!hangarSlot) {
        return {
          success: false,
          reason:
            'Aircraft Maintenance Hangars may only be constructed on dedicated Airport Hangar Tiles (Hangar 1 at 176,47 or Hangar 2 at 185,47).',
        };
      }
      const res = this.constructAircraftHangar(hangarSlot.id);
      return {
        success: res.success,
        reason: res.reason,
        building: res.building,
      };
    }

    const val = this.validateBuildingPlacement(catalogueId, gx, gz, orientation);
    if (!val.valid || !val.spec) {
      return { success: false, reason: val.reason };
    }

    const spec = val.spec;
    const id = `bld-player-${this.nextBuildingSeq++}`;

    this.recordTransactionInternal(
      'BUILDING_CONSTRUCTION',
      'EXPENSE',
      spec.price,
      `Constructed ${spec.name} at (${gx}, ${gz})`,
      id
    );

    const rec: PlacedBuildingRecord = {
      id,
      catalogueId: spec.id,
      name: spec.name,
      category: spec.category,
      gx,
      gz,
      widthCells:
        orientation === 90 || orientation === 270
          ? spec.depthCells
          : spec.widthCells,
      depthCells:
        orientation === 90 || orientation === 270
          ? spec.widthCells
          : spec.depthCells,
      orientation,
      level: 1,
      maxLevel: 3,
      storageCapacityTons: spec.storageCapacityTons,
      storedCargoTons: 0,
      vehicleSlotCapacity: spec.vehicleSlotCapacity,
      vehicleSlotModal: spec.vehicleSlotModal,
      isPreplaced: false,
      upgradeCost: Math.round(spec.price * 0.75),
    };

    this.placedBuildings.set(id, rec);
    this.entities.register({
      id,
      category: 'STARTER_BUILDING',
      type: spec.id,
      position: { gx, gz },
      footprint: val.cells,
      orientation,
      elevation: this.terrainWater.getElevationAtGrid(gx, gz) ?? 1.2,
      ownership: 'PLAYER',
      active: true,
      metadata: {
        name: rec.name,
        catalogueId: spec.id,
        widthCells: rec.widthCells,
        depthCells: rec.depthCells,
        category: rec.category,
      },
    });

    this.awardXp(65, `Constructed ${spec.name}`);
    return { success: true, building: rec };
  }

  public demolishBuilding(buildingId: string): {
    success: boolean;
    reason?: string;
    refund?: number;
  } {
    const bld = this.placedBuildings.get(buildingId);
    if (!bld) {
      return { success: false, reason: 'Building not found.' };
    }
    if (bld.isPreplaced) {
      return {
        success: false,
        reason: 'Core regional landmark and starter facilities are protected.',
      };
    }

    // Check if any owned vehicles are stored in this facility
    for (const v of this.ownedVehicles.values()) {
      if (v.homeFacilityId === buildingId) {
        return {
          success: false,
          reason: `Cannot demolish ${bld.name} while vehicle ${v.name} is assigned to it.`,
        };
      }
    }

    const spec = getBuildingSpecById(bld.catalogueId);
    const refund = this.processDemolitionRefund(
      spec?.price ?? 8000,
      `Demolished ${bld.name}`,
      buildingId
    );
    this.placedBuildings.delete(buildingId);
    this.entities.unregister(buildingId);
    return { success: true, refund };
  }

  /**
   * Upgrades an existing building/depot or delegates to the 20-level Truck Depot / Warehouse / Airport upgrade systems.
   */
  public upgradeFacility(buildingId: string): {
    success: boolean;
    reason?: string;
    building?: PlacedBuildingRecord;
    warehouse?: WarehouseFacilityState;
    truckDepot?: TruckDepotFacilityState;
  } {
    if (buildingId === TRUCK_DEPOT_ID) {
      return this.upgradeTruckDepot({ ignorePlayerLevel: true });
    }
    if (this.warehouses.has(buildingId)) {
      return this.upgradeWarehouse(buildingId, { ignorePlayerLevel: true });
    }
    if (
      buildingId === AIRPORT_ID ||
      buildingId === AIRPORT_CARGO_TERMINAL_FOOTPRINT.id
    ) {
      const up = this.upgradeAirport({ ignorePlayerLevel: true });
      return {
        success: up.success,
        reason: up.reason,
        building: this.placedBuildings.get(AIRPORT_CARGO_TERMINAL_FOOTPRINT.id),
      };
    }

    const bld = this.placedBuildings.get(buildingId);
    if (!bld) {
      return { success: false, reason: 'Facility not found.' };
    }
    if (bld.level >= bld.maxLevel) {
      return {
        success: false,
        reason: `${bld.name} has already reached maximum Level ${bld.maxLevel}.`,
      };
    }
    const reqLevel = bld.level + 1;
    if (this.level < reqLevel) {
      return {
        success: false,
        reason: `Upgrading ${bld.name} to Level ${reqLevel} requires Player Level ${reqLevel}.`,
      };
    }
    if (this.money < bld.upgradeCost) {
      return {
        success: false,
        reason: `Insufficient funds: upgrade requires $${bld.upgradeCost.toLocaleString()}.`,
      };
    }

    this.recordTransactionInternal(
      'FACILITY_UPGRADE',
      'EXPENSE',
      bld.upgradeCost,
      `Upgraded ${bld.name} to Level ${reqLevel}`,
      bld.id
    );

    bld.level = reqLevel;
    if (bld.vehicleSlotCapacity > 0) {
      bld.vehicleSlotCapacity += 3;
    }
    if (bld.storageCapacityTons > 0) {
      bld.storageCapacityTons = Math.round(bld.storageCapacityTons * 1.5);
    }
    bld.upgradeCost = Math.round(bld.upgradeCost * 1.45);

    this.awardXp(90, `Upgraded ${bld.name} to Level ${bld.level}`);
    return { success: true, building: bld };
  }

  // ===========================================================================
  // TRUCK DEPOT: 20-LEVEL EXPANSION (4x3 -> 12x6 -> 20x8, 3 -> 15 TRUCK SLOTS)
  // ===========================================================================

  public getTruckDepot(): TruckDepotFacilityState {
    return this.truckDepot;
  }

  private applyTruckDepotLevelInternal(newLevel: number): TruckDepotFacilityState {
    this.truckDepot = applyTruckDepotLevelState(this.truckDepot, newLevel);
    this.syncTruckDepotPlacedBuildingAndEntity();

    // Update parked truck coordinates to align cleanly with their assigned slots in the expanded depot
    for (const v of this.ownedVehicles.values()) {
      if (v.homeFacilityId !== TRUCK_DEPOT_ID) continue;
      let slot = v.assignedDepotSlotNumber
        ? this.truckDepot.slots.find((s) => s.slotNumber === v.assignedDepotSlotNumber)
        : this.truckDepot.slots.find((s) => s.assignedVehicleId === v.id);

      if (!slot || !slot.unlocked) {
        slot = this.truckDepot.slots.find(
          (s) => s.unlocked && (!s.assignedVehicleId || s.assignedVehicleId === v.id)
        );
      }

      if (slot) {
        slot.assignedVehicleId = v.id;
        v.assignedDepotSlotId = slot.slotId;
        v.assignedDepotSlotNumber = slot.slotNumber;
        if (v.state === 'IDLE_AT_DEPOT' || v.state === 'MAINTENANCE_DUE') {
          slot.occupancyState = 'PARKED';
          v.worldX = slot.worldX;
          v.worldZ = slot.worldZ;
          v.headingYaw = slot.headingYaw;
          v.trailerWorldX = slot.worldX;
          v.trailerWorldZ = slot.worldZ - 1.5;
          v.trailerYaw = slot.headingYaw;
        } else {
          slot.occupancyState = 'DISPATCHED';
        }
      }
    }

    return this.truckDepot;
  }

  public upgradeTruckDepot(options?: {
    ignorePlayerLevel?: boolean;
    free?: boolean;
  }): {
    success: boolean;
    reason?: string;
    building?: PlacedBuildingRecord;
    truckDepot?: TruckDepotFacilityState;
  } {
    const td = this.truckDepot;
    const bld = this.placedBuildings.get(TRUCK_DEPOT_ID);
    if (!td || !bld) {
      return { success: false, reason: 'Truck Depot facility not found.' };
    }
    if (td.level >= TRUCK_DEPOT_MAX_LEVEL) {
      return {
        success: false,
        reason: `${td.name} has already reached maximum Level ${TRUCK_DEPOT_MAX_LEVEL} (20×8 footprint, 15 truck slots).`,
        building: bld,
        truckDepot: td,
      };
    }

    const nextLevel = td.level + 1;
    if (!options?.ignorePlayerLevel && this.level < nextLevel) {
      return {
        success: false,
        reason: `Upgrading ${td.name} to Level ${nextLevel} requires Player Level ${nextLevel}.`,
        building: bld,
        truckDepot: td,
      };
    }

    const cost = options?.free ? 0 : (td.nextLevelUpgradeCost ?? bld.upgradeCost);
    if (!options?.free && this.money < cost) {
      return {
        success: false,
        reason: `Insufficient funds: upgrading ${td.name} to Level ${nextLevel} requires $${cost.toLocaleString()}.`,
        building: bld,
        truckDepot: td,
      };
    }

    if (cost > 0) {
      this.recordTransactionInternal(
        'FACILITY_UPGRADE',
        'EXPENSE',
        cost,
        `Upgraded ${td.name} to Level ${nextLevel}/${TRUCK_DEPOT_MAX_LEVEL}`,
        td.depotId
      );
    }

    const updated = this.applyTruckDepotLevelInternal(nextLevel);
    this.awardXp(90, `Upgraded ${updated.name} to Level ${updated.level}`);

    return {
      success: true,
      building: this.placedBuildings.get(TRUCK_DEPOT_ID),
      truckDepot: updated,
    };
  }

  public setTruckDepotLevel(targetLevel: number): TruckDepotFacilityState {
    return this.applyTruckDepotLevelInternal(targetLevel);
  }

  // ===========================================================================
  // WAREHOUSE 1: 20-LEVEL STORAGE, DOORS, FORKLIFTS & INVENTORY OPERATIONS
  // ===========================================================================

  public getWarehouse(
    warehouseId = 'facility-warehouse-1'
  ): WarehouseFacilityState | undefined {
    return this.warehouses.get(warehouseId);
  }

  public getAllWarehouses(): WarehouseFacilityState[] {
    return Array.from(this.warehouses.values());
  }

  /**
   * Measures the distance in grid blocks from the nearest edge of the existing starter core area
   * (Westgate Logistics / Depot core ending at gz = 52) to the nearest edge of Warehouse 1's
   * reserved 25 x 30 property (minGz = 67 -> 67 - 52 = 15 grid blocks).
   */
  public getCoreToWarehouseSeparationBlocks(
    warehouseId = 'facility-warehouse-1'
  ): number {
    const wh = this.warehouses.get(warehouseId);
    if (!wh) return 0;

    const coreIds = [
      'facility-starter-truck-depot',
      'facility-logistics-warehouse-a',
      'facility-logistics-warehouse-b',
      'facility-industrial-factory-1',
      'facility-service-station-1',
    ];
    let maxCoreGz = 52;
    for (const cid of coreIds) {
      const b = this.placedBuildings.get(cid);
      if (b) {
        const bottomEdge = b.gz + b.depthCells - 1;
        if (bottomEdge > maxCoreGz) maxCoreGz = bottomEdge;
      }
    }
    return Math.max(0, wh.reservedMinGz - maxCoreGz);
  }

  /**
   * Internal helper to synchronize a warehouse's level (1..20), category capacities,
   * constructed footprint (5x6 -> 25x30), operational doors (2..10), and operational forklifts (2..10).
   * Preserves existing stored cargo during upgrades.
   */
  private applyWarehouseLevelInternal(
    wh: WarehouseFacilityState,
    newLevel: number,
    refillNewCapacityOnUpgrade = false
  ): void {
    const clampedLevel = Math.max(
      WAREHOUSE_MIN_LEVEL,
      Math.min(WAREHOUSE_MAX_LEVEL, Math.floor(newLevel))
    );
    const oldCapacities = { ...wh.capacities };
    const newCapacities = getWarehouseCapacitiesForLevel(clampedLevel);

    wh.level = clampedLevel;
    wh.capacities = { ...newCapacities };

    // Preserve existing stored cargo; never delete existing inventory on upgrade.
    // If refillNewCapacityOnUpgrade is enabled, add the newly unlocked delta capacity.
    for (const cat of ['FOOD', 'INDUSTRIAL', 'PACKAGES'] as WarehouseCargoCategory[]) {
      if (refillNewCapacityOnUpgrade && newCapacities[cat] > oldCapacities[cat]) {
        const delta = newCapacities[cat] - oldCapacities[cat];
        wh.stored[cat] = Math.min(newCapacities[cat], wh.stored[cat] + delta);
      } else {
        wh.stored[cat] = Math.min(newCapacities[cat], Math.max(0, wh.stored[cat]));
      }
    }

    const layout = computeWarehousePhysicalLayout(
      wh.id,
      clampedLevel,
      wh.reservedMinGx,
      wh.reservedMinGz,
      this.grid,
      wh.doors,
      wh.forklifts
    );

    wh.constructedGx = layout.constructedGx;
    wh.constructedGz = layout.constructedGz;
    wh.constructedWidthCells = layout.constructedWidth;
    wh.constructedDepthCells = layout.constructedDepth;
    wh.operationalDoorCount = getWarehouseDoorCountForLevel(clampedLevel);
    wh.operationalForkliftCount = getWarehouseForkliftCountForLevel(clampedLevel);
    wh.doors = layout.doors;
    wh.forklifts = layout.forklifts;

    wh.upgradeCost = Math.round(6500 * Math.pow(1.16, clampedLevel - 1));
    const bld = this.placedBuildings.get(wh.id);
    if (bld) {
      bld.level = clampedLevel;
      bld.maxLevel = WAREHOUSE_MAX_LEVEL;
      bld.gx = layout.constructedGx;
      bld.gz = layout.constructedGz;
      bld.widthCells = layout.constructedWidth;
      bld.depthCells = layout.constructedDepth;
      bld.storageCapacityTons = Number(
        (
          wh.capacities.FOOD +
          wh.capacities.INDUSTRIAL +
          wh.capacities.PACKAGES
        ).toFixed(1)
      );
      bld.storedCargoTons = Number(
        (wh.stored.FOOD + wh.stored.INDUSTRIAL + wh.stored.PACKAGES).toFixed(1)
      );
      bld.upgradeCost = wh.upgradeCost;
    }

    const ent = this.entities.get(wh.id);
    if (ent) {
      ent.position = { gx: layout.constructedGx, gz: layout.constructedGz };
      ent.metadata = {
        ...ent.metadata,
        level: clampedLevel,
        widthCells: layout.constructedWidth,
        depthCells: layout.constructedDepth,
      };
    }

    syncWarehouseForkliftEntities(wh, this.entities, this.grid);
    this.updateWarehouseOperationalSummary(wh);
  }

  /**
   * Upgrades a warehouse by 1 level (up to Level 20), recalculating Food, Industrial,
   * and Normal Package capacities, expanding the constructed footprint toward 25x30,
   * and unlocking additional loading doors and forklifts (2 -> 10).
   */
  public upgradeWarehouse(
    warehouseId = 'facility-warehouse-1',
    options?: { ignorePlayerLevel?: boolean; free?: boolean }
  ): {
    success: boolean;
    reason?: string;
    building?: PlacedBuildingRecord;
    warehouse?: WarehouseFacilityState;
  } {
    const wh = this.warehouses.get(warehouseId);
    const bld = this.placedBuildings.get(warehouseId);
    if (!wh || !bld) {
      return { success: false, reason: 'Warehouse facility not found.' };
    }
    if (wh.level >= WAREHOUSE_MAX_LEVEL) {
      return {
        success: false,
        reason: `${wh.name} has already reached maximum Level ${WAREHOUSE_MAX_LEVEL}.`,
      };
    }

    const nextLevel = wh.level + 1;
    if (!options?.ignorePlayerLevel && this.level < nextLevel) {
      return {
        success: false,
        reason: `Upgrading ${wh.name} to Level ${nextLevel} requires Player Level ${nextLevel}.`,
      };
    }

    const cost = options?.free ? 0 : bld.upgradeCost;
    if (!options?.free && this.money < cost) {
      return {
        success: false,
        reason: `Insufficient funds: upgrading ${wh.name} to Level ${nextLevel} requires $${cost.toLocaleString()}.`,
      };
    }

    if (cost > 0) {
      this.recordTransactionInternal(
        'FACILITY_UPGRADE',
        'EXPENSE',
        cost,
        `Upgraded ${wh.name} to Level ${nextLevel}`,
        wh.id
      );
    }

    this.applyWarehouseLevelInternal(wh, nextLevel, false);
    this.awardXp(85, `Upgraded ${wh.name} to Level ${wh.level}`);

    return {
      success: true,
      building: bld,
      warehouse: wh,
    };
  }

  /**
   * Directly sets the level (1..20) of a warehouse while preserving existing stored cargo
   * (clamped only if new level capacity is smaller than stored cargo).
   */
  public setWarehouseLevel(
    warehouseId: string,
    targetLevel: number,
    refillNewCapacityOnUpgrade = false
  ): WarehouseFacilityState | undefined {
    const wh = this.warehouses.get(warehouseId);
    if (!wh) return undefined;
    this.applyWarehouseLevelInternal(wh, targetLevel, refillNewCapacityOnUpgrade);
    return wh;
  }

  /**
   * Adds cargo to a specific category (FOOD, INDUSTRIAL, PACKAGES) in the warehouse,
   * strictly enforcing that category's current level capacity limit.
   */
  public addWarehouseCargo(
    warehouseId: string,
    category: WarehouseCargoCategory,
    tons: number
  ): {
    success: boolean;
    addedTons: number;
    overflowTons: number;
    storedTons: number;
    capacityTons: number;
    reason?: string;
  } {
    const wh = this.warehouses.get(warehouseId);
    if (!wh) {
      return {
        success: false,
        addedTons: 0,
        overflowTons: Math.max(0, tons),
        storedTons: 0,
        capacityTons: 0,
        reason: 'Warehouse not found.',
      };
    }
    if (tons <= 0) {
      return {
        success: false,
        addedTons: 0,
        overflowTons: 0,
        storedTons: wh.stored[category],
        capacityTons: wh.capacities[category],
        reason: 'Cargo amount must be positive.',
      };
    }

    const cap = wh.capacities[category];
    const current = wh.stored[category];
    const availableSpace = Math.max(0, cap - current);
    if (availableSpace <= 1e-6) {
      return {
        success: false,
        addedTons: 0,
        overflowTons: tons,
        storedTons: current,
        capacityTons: cap,
        reason: `${category} storage is already at capacity (${cap.toFixed(1)}t).`,
      };
    }

    const added = Math.min(tons, availableSpace);
    const overflow = Math.max(0, tons - added);
    wh.stored[category] = current + added;
    this.syncWarehousePlacedBuildingTotals(wh);
    this.updateWarehouseOperationalSummary(wh);

    return {
      success: added + 1e-6 >= tons,
      addedTons: added,
      overflowTons: overflow,
      storedTons: wh.stored[category],
      capacityTons: cap,
      reason:
        added + 1e-6 < tons
          ? `Clamped to ${category} capacity (${cap.toFixed(1)}t).`
          : undefined,
    };
  }

  /**
   * Consumes cargo from a specific category in the warehouse.
   * Never silently invents cargo if stock is insufficient!
   */
  public consumeWarehouseCargo(
    warehouseId: string,
    category: WarehouseCargoCategory,
    tons: number
  ): {
    success: boolean;
    consumedTons: number;
    remainingTons: number;
    reason?: string;
  } {
    const wh = this.warehouses.get(warehouseId);
    if (!wh) {
      return {
        success: false,
        consumedTons: 0,
        remainingTons: 0,
        reason: 'Warehouse not found.',
      };
    }
    if (tons <= 0) {
      return {
        success: true,
        consumedTons: 0,
        remainingTons: wh.stored[category],
      };
    }

    const current = wh.stored[category];
    if (current + 1e-6 < tons) {
      return {
        success: false,
        consumedTons: 0,
        remainingTons: current,
        reason: `Insufficient ${category} stock in ${wh.name} (required ${tons.toFixed(1)}t, available ${current.toFixed(1)}t).`,
      };
    }

    wh.stored[category] = Math.max(0, current - tons);
    this.syncWarehousePlacedBuildingTotals(wh);
    this.updateWarehouseOperationalSummary(wh);

    return {
      success: true,
      consumedTons: tons,
      remainingTons: wh.stored[category],
    };
  }

  /**
   * Sets the exact stored quantity for one or more cargo categories (clamped between 0 and current category capacity).
   */
  public setWarehouseInventory(
    warehouseId: string,
    categoryOrRecord: WarehouseCargoCategory | Partial<Record<WarehouseCargoCategory, number>>,
    tons?: number
  ): WarehouseFacilityState | undefined {
    const wh = this.warehouses.get(warehouseId);
    if (!wh) return undefined;
    if (typeof categoryOrRecord === 'string') {
      wh.stored[categoryOrRecord] = Math.max(
        0,
        Math.min(wh.capacities[categoryOrRecord], tons ?? 0)
      );
    } else {
      for (const cat of ['FOOD', 'INDUSTRIAL', 'PACKAGES'] as WarehouseCargoCategory[]) {
        if (typeof categoryOrRecord[cat] === 'number') {
          wh.stored[cat] = Math.max(
            0,
            Math.min(wh.capacities[cat], categoryOrRecord[cat]!)
          );
        }
      }
    }
    this.syncWarehousePlacedBuildingTotals(wh);
    this.updateWarehouseOperationalSummary(wh);
    return wh;
  }

  /**
   * Restocks one or all cargo categories in Warehouse 1 up to current level capacity.
   */
  public restockWarehouseInventory(
    warehouseId = 'facility-warehouse-1',
    category?: WarehouseCargoCategory,
    free = true
  ): {
    success: boolean;
    costPaid: number;
    reason?: string;
    warehouse?: WarehouseFacilityState;
  } {
    const wh = this.warehouses.get(warehouseId);
    if (!wh) {
      return { success: false, costPaid: 0, reason: 'Warehouse not found.' };
    }
    const categories: WarehouseCargoCategory[] = category
      ? [category]
      : ['FOOD', 'INDUSTRIAL', 'PACKAGES'];

    let totalAdded = 0;
    for (const cat of categories) {
      const diff = Math.max(0, wh.capacities[cat] - wh.stored[cat]);
      totalAdded += diff;
      wh.stored[cat] = wh.capacities[cat];
    }

    let costPaid = 0;
    if (!free && totalAdded > 0) {
      costPaid = Math.min(this.money, Math.round(totalAdded * 90));
      if (costPaid > 0) {
        this.recordTransactionInternal(
          'OPERATING_EXPENSE',
          'EXPENSE',
          costPaid,
          `Restocked ${wh.name} Cargo Inventory (+${totalAdded.toFixed(1)}t)`,
          wh.id
        );
      }
    }

    this.syncWarehousePlacedBuildingTotals(wh);
    this.updateWarehouseOperationalSummary(wh);
    return { success: true, costPaid, warehouse: wh };
  }

  private syncWarehousePlacedBuildingTotals(wh: WarehouseFacilityState): void {
    const bld = this.placedBuildings.get(wh.id);
    if (bld) {
      bld.storageCapacityTons = Number(
        (
          wh.capacities.FOOD +
          wh.capacities.INDUSTRIAL +
          wh.capacities.PACKAGES
        ).toFixed(1)
      );
      bld.storedCargoTons = Number(
        (wh.stored.FOOD + wh.stored.INDUSTRIAL + wh.stored.PACKAGES).toFixed(1)
      );
    }
  }

  private resolveContractCargoCategory(
    contract: TransportContractRecord
  ): WarehouseCargoCategory {
    if (contract.cargoCategory) return contract.cargoCategory;
    const lower = contract.cargoType.toLowerCase();
    if (lower.includes('food') || lower.includes('retail')) return 'FOOD';
    if (lower.includes('industrial') || lower.includes('machinery') || lower.includes('freight')) {
      return 'INDUSTRIAL';
    }
    return 'PACKAGES';
  }

  public getAllPlacedBuildings(): PlacedBuildingRecord[] {
    return Array.from(this.placedBuildings.values());
  }

  public getPlacedBuildingAtCell(
    gx: number,
    gz: number
  ): PlacedBuildingRecord | undefined {
    const ents = this.entities.getEntitiesAtCell(gx, gz);
    for (const e of ents) {
      const b = this.placedBuildings.get(e.id);
      if (b) return b;
    }
    return undefined;
  }

  // ===========================================================================
  // LAND ACQUISITION & EXPANSION ECONOMY (Master Prompt 6)
  // ===========================================================================

  public purchaseLandParcel(parcelId: string): {
    success: boolean;
    reason?: string;
  } {
    if (
      parcelId === 'parcel-airport-reserve' ||
      parcelId === 'parcel-airport-warehouse-reserve' ||
      parcelId === 'parcel-airport-transfer-yard-reserve'
    ) {
      const res = this.purchaseAirport();
      return { success: res.success, reason: res.reason };
    }

    const parcel = this.parcels.getAllParcels().find((p) => p.id === parcelId);
    if (!parcel) {
      return { success: false, reason: `Land parcel ${parcelId} not found.` };
    }
    if (parcel.owned) {
      return { success: false, reason: `${parcel.name} is already owned.` };
    }
    if (this.level < parcel.unlockLevel) {
      return {
        success: false,
        reason: `${parcel.name} requires Player Level ${parcel.unlockLevel} (current: Level ${this.level}).`,
      };
    }
    if (this.money < parcel.price) {
      return {
        success: false,
        reason: `Insufficient funds to purchase ${parcel.name} ($${parcel.price.toLocaleString()}).`,
      };
    }

    const res = this.parcels.acquireParcel(parcelId, this.level);
    if (!res.success) {
      return { success: false, reason: res.reason };
    }

    // Clear forest trees on newly purchased land parcel so it is ready for player development
    this.terrainWater.clearTreesInBounds(
      parcel.minGx,
      parcel.maxGx,
      parcel.minGz,
      parcel.maxGz
    );

    if (parcel.price > 0) {
      this.recordTransactionInternal(
        'LAND_PURCHASE',
        'EXPENSE',
        parcel.price,
        `Acquired Land Parcel: ${parcel.name}`,
        parcel.id
      );
    }
    this.awardXp(80, `Purchased ${parcel.name}`);
    return { success: true };
  }

  // ===========================================================================
  // CARGO AIRPORT: ABANDONED STARTING STATE, LEVEL 100 UNLOCK, $15M PURCHASE & 20-LEVEL EXPANSION
  // ===========================================================================

  public refreshAirportState(): AirportInfrastructureRecord {
    if (this.airportOps) {
      this.airportOps.syncWithAirportLevel(
        this.airportOwned ? Math.max(1, this.airportLevel) : 1
      );
      for (const ac of this.airportOps.getPlayerAircraft()) {
        const ov = this.ownedVehicles.get(ac.id);
        if (ov) {
          ov.capacityTons = ac.effectiveCapacityTons;
        }
      }
    }

    this.airport = buildAirportInfrastructureRecord(
      this.config,
      this.grid,
      this.level,
      this.airportOwned,
      this.airportLevel,
      this.airportOps?.getStandRuntimeOverlay()
    );

    // Sync the 10 x 15 Cargo Terminal, separate 10 x 10 Airport Cargo Warehouse,
    // and separate 10 x 10 Airport Transfer Yard building records when the airport is operational
    const termId = AIRPORT_CARGO_TERMINAL_FOOTPRINT.id;
    const whId = AIRPORT_WAREHOUSE_LEVEL_20_FOOTPRINT.id;
    const tyId = AIRPORT_TRANSFER_YARD_FOOTPRINT.id;

    if (this.airportOwned) {
      const tb = this.airport.cargoTerminalBounds;
      const termRec: PlacedBuildingRecord = {
        id: termId,
        catalogueId: 'bld-air-cargo-terminal',
        name: AIRPORT_CARGO_TERMINAL_FOOTPRINT.name,
        category: 'AIRPORT',
        gx: tb.minGx,
        gz: tb.minGz,
        widthCells: tb.widthCells, // 15 cells
        depthCells: tb.depthCells, // 10 cells (10 x 15 grid blocks)
        orientation: 0,
        level: this.airport.level,
        maxLevel: AIRPORT_MAX_LEVEL,
        storageCapacityTons: 420 + (this.airport.level - 1) * 60,
        storedCargoTons: 180,
        vehicleSlotCapacity: MAX_PLAYER_AIRCRAFT, // Strict 3-aircraft player limit (Prompt 5)
        vehicleSlotModal: 'AIR',
        isPreplaced: true,
        upgradeCost: this.airport.upgradeCost,
        reservedMinGx: this.airport.reservedBounds.minGx,
        reservedMaxGx: this.airport.reservedBounds.maxGx,
        reservedMinGz: this.airport.reservedBounds.minGz,
        reservedMaxGz: this.airport.reservedBounds.maxGz,
      };
      this.placedBuildings.set(termId, termRec);

      if (this.airportOps) {
        const awState = this.airportOps.getAirportWarehouse();
        const awRec: PlacedBuildingRecord = {
          id: whId,
          catalogueId: 'bld-logistics-warehouse-1',
          name: awState.name,
          category: 'AIRPORT',
          gx: awState.constructedBounds.minGx,
          gz: awState.constructedBounds.minGz,
          widthCells: awState.constructedBounds.widthCells,
          depthCells: awState.constructedBounds.depthCells,
          orientation: 0,
          level: awState.level,
          maxLevel: AIRPORT_MAX_LEVEL,
          storageCapacityTons: awState.totalCapacityTons,
          storedCargoTons: awState.totalStoredTons,
          vehicleSlotCapacity: 0,
          isPreplaced: true,
          upgradeCost: this.airport.upgradeCost,
          reservedMinGx: awState.reservedBounds.minGx,
          reservedMaxGx: awState.reservedBounds.maxGx,
          reservedMinGz: awState.reservedBounds.minGz,
          reservedMaxGz: awState.reservedBounds.maxGz,
        };
        this.placedBuildings.set(whId, awRec);

        const tyState = this.airportOps.getAirportTransferYard();
        const tyRec: PlacedBuildingRecord = {
          id: tyId,
          catalogueId: 'bld-air-cargo-terminal',
          name: tyState.name,
          category: 'AIRPORT',
          gx: tyState.bounds.minGx,
          gz: tyState.bounds.minGz,
          widthCells: tyState.bounds.widthCells, // 10 cells
          depthCells: tyState.bounds.depthCells, // 10 cells
          orientation: 0,
          level: this.airport.level,
          maxLevel: AIRPORT_MAX_LEVEL,
          storageCapacityTons: tyState.stagingCapacityTons,
          storedCargoTons: tyState.totalStagedTons,
          vehicleSlotCapacity: 0,
          isPreplaced: true,
          upgradeCost: this.airport.upgradeCost,
          reservedMinGx: tyState.bounds.minGx,
          reservedMaxGx: tyState.bounds.maxGx,
          reservedMinGz: tyState.bounds.minGz,
          reservedMaxGz: tyState.bounds.maxGz,
        };
        this.placedBuildings.set(tyId, tyRec);
      }
    } else {
      this.placedBuildings.delete(termId);
      this.placedBuildings.delete(whId);
      this.placedBuildings.delete(tyId);
      // Ensure no ambient or active aircraft exist on the abandoned runway while unowned
      this.ambientVehicles = this.ambientVehicles.filter(
        (v) => v.modal !== 'AIR'
      );
    }

    syncAirportEntities(this.airport, this.entities, this.grid);
    return this.airport;
  }

  /**
   * Purchases and restores the 30 x 40 Regional Cargo Airport at XP Level 100 for $15,000,000.
   * Transitions the site from the Abandoned Airfield state to Operational Level 1 Cargo Airport.
   */
  public purchaseAirport(): {
    success: boolean;
    reason?: string;
    airport: AirportInfrastructureRecord;
  } {
    this.refreshAirportState();

    if (this.airportOwned) {
      return {
        success: false,
        reason: `${AIRPORT_NAME} is already purchased and operational.`,
        airport: this.airport,
      };
    }

    if (this.level < AIRPORT_UNLOCK_LEVEL) {
      return {
        success: false,
        reason: `${AIRPORT_LOCKED_UI_TITLE} (Current Player Level: ${this.level}/${AIRPORT_UNLOCK_LEVEL}).`,
        airport: this.airport,
      };
    }

    if (this.money < AIRPORT_PURCHASE_PRICE) {
      return {
        success: false,
        reason: `Insufficient funds to purchase ${AIRPORT_NAME}: requires $${AIRPORT_PURCHASE_PRICE.toLocaleString()} (available: $${this.money.toLocaleString()}).`,
        airport: this.airport,
      };
    }

    // Deduct $15,000,000 once through the centralized transaction ledger
    this.recordTransactionInternal(
      'LAND_PURCHASE',
      'EXPENSE',
      AIRPORT_PURCHASE_PRICE,
      `Purchased & Restored ${AIRPORT_NAME} (Level 1 Operational Cargo Airport)`,
      AIRPORT_ID
    );

    // Mark the 30x40 airport parcel and its separate 10x10 warehouse & transfer yard parcels owned
    this.parcels.acquireParcel('parcel-airport-reserve', this.level);
    this.parcels.acquireParcel('parcel-airport-warehouse-reserve', this.level);
    this.parcels.acquireParcel(
      'parcel-airport-transfer-yard-reserve',
      this.level
    );

    this.airportOwned = true;
    this.airportLevel = AIRPORT_MIN_LEVEL;
    this.refreshAirportState();
    this.ensureOperationalAirportAmbientTraffic();

    return {
      success: true,
      airport: this.airport,
    };
  }

  /**
   * Upgrades the operational Cargo Airport by 1 level (Level 1 -> Level 20),
   * expanding the active operational footprint toward the full 30 x 40 reservation
   * and unlocking 1 to 5 aircraft parking stands.
   */
  public upgradeAirport(options?: {
    ignorePlayerLevel?: boolean;
    free?: boolean;
  }): {
    success: boolean;
    reason?: string;
    airport: AirportInfrastructureRecord;
  } {
    this.refreshAirportState();

    if (!this.airportOwned) {
      return {
        success: false,
        reason: `Cannot upgrade ${AIRPORT_NAME} before purchasing it at XP Level ${AIRPORT_UNLOCK_LEVEL} ($${AIRPORT_PURCHASE_PRICE.toLocaleString()}).`,
        airport: this.airport,
      };
    }

    if (this.airportLevel >= AIRPORT_MAX_LEVEL) {
      return {
        success: false,
        reason: `${AIRPORT_NAME} has already reached maximum Level ${AIRPORT_MAX_LEVEL} (full 50×70 footprint, 50t cargo capacity & 10 aircraft stands unlocked).`,
        airport: this.airport,
      };
    }

    const nextLevel = this.airportLevel + 1;
    const cost = options?.free ? 0 : this.airport.upgradeCost;

    if (!options?.free && this.money < cost) {
      return {
        success: false,
        reason: `Insufficient funds to upgrade ${AIRPORT_NAME} to Level ${nextLevel}: requires $${cost.toLocaleString()}.`,
        airport: this.airport,
      };
    }

    if (cost > 0) {
      this.recordTransactionInternal(
        'FACILITY_UPGRADE',
        'EXPENSE',
        cost,
        `Upgraded ${AIRPORT_NAME} to Level ${nextLevel}/${AIRPORT_MAX_LEVEL}`,
        AIRPORT_ID
      );
    }

    this.airportLevel = nextLevel;
    this.refreshAirportState();
    return {
      success: true,
      airport: this.airport,
    };
  }

  /**
   * Purchases an unlocked Aircraft Parking Area (Stands 2..10; Stand 1 is included by default).
   * Pricing follows Section 7: $500,000 + $150,000 * (currentAirportLevel - 1).
   */
  public purchaseAirportParkingStand(
    standIdOrNumber: string | number
  ): {
    success: boolean;
    reason?: string;
    standId?: AirportWaypointId;
    standNumber?: number;
    price: number;
    airport: AirportInfrastructureRecord;
  } {
    this.refreshAirportState();
    const currentLevel = this.airportOwned ? Math.max(1, this.airportLevel) : 1;
    const price = getAirportParkingAreaPriceForLevel(currentLevel);

    if (!this.airportOwned) {
      return {
        success: false,
        reason: `Purchase and restore ${AIRPORT_NAME} before purchasing additional aircraft parking areas.`,
        price,
        airport: this.airport,
      };
    }

    if (this.money < price) {
      return {
        success: false,
        reason: `Insufficient funds to purchase aircraft parking stand: requires $${price.toLocaleString()} (available: $${this.money.toLocaleString()}).`,
        price,
        airport: this.airport,
      };
    }

    const res = this.airportOps.purchaseParkingStand(
      standIdOrNumber,
      this.airportOwned,
      this.airport.level
    );
    if (!res.success || !res.standId) {
      return {
        success: false,
        reason: res.reason,
        price: res.price,
        airport: this.airport,
      };
    }

    this.recordTransactionInternal(
      'FACILITY_UPGRADE',
      'EXPENSE',
      res.price,
      `Purchased Airport Parking Stand #${res.standNumber} (${res.standId}) at Airport Level ${this.airport.level}`,
      res.standId
    );
    this.awardXp(
      85,
      `Purchased Airport Parking Stand #${res.standNumber} (${res.standId})`
    );
    this.refreshAirportState();

    return {
      success: true,
      standId: res.standId,
      standNumber: res.standNumber,
      price: res.price,
      airport: this.airport,
    };
  }

  /**
   * Directly sets the airport level (1..20) when owned, or resets to 0 (abandoned) if targetLevel <= 0.
   */
  public setAirportLevel(targetLevel: number): AirportInfrastructureRecord {
    if (targetLevel <= 0) {
      this.airportOwned = false;
      this.airportLevel = 0;
    } else {
      this.airportOwned = true;
      this.airportLevel = Math.max(
        AIRPORT_MIN_LEVEL,
        Math.min(AIRPORT_MAX_LEVEL, Math.floor(targetLevel))
      );
      this.parcels.acquireParcel('parcel-airport-reserve', 999);
      this.parcels.acquireParcel('parcel-airport-warehouse-reserve', 999);
      this.parcels.acquireParcel('parcel-airport-transfer-yard-reserve', 999);
      this.ensureOperationalAirportAmbientTraffic();
    }
    return this.refreshAirportState();
  }

  // ===========================================================================
  // VEHICLE OWNERSHIP, CAPACITY & 5-DAY MAINTENANCE (Master Prompts 4, 5 & 6)
  // ===========================================================================

  public getModalCapacitySummary(modal: TransportModalCategory): {
    usedSlots: number;
    totalSlots: number;
  } {
    let usedSlots = 0;
    for (const v of this.ownedVehicles.values()) {
      if (v.modal === modal) usedSlots++;
    }

    // Part 2 Section 2: Player may own at most 2 cargo aircraft across the entire game!
    if (modal === 'AIR') {
      return {
        usedSlots: Math.max(usedSlots, this.airportOps?.getPlayerAircraftCount() ?? 0),
        totalSlots: this.airportOwned ? MAX_PLAYER_AIRCRAFT : 0,
      };
    }

    let totalSlots = 0;
    for (const b of this.placedBuildings.values()) {
      if (b.vehicleSlotModal === modal) {
        totalSlots += b.vehicleSlotCapacity;
      }
    }
    // Also count starter rail depot & port berths if not already in placedBuildings
    if (modal === 'RAIL') {
      totalSlots += this.railways.getAllDepots().length * 2;
    } else if (modal === 'WATER') {
      totalSlots += 2; // 2 starter coastal port berths
    }

    return { usedSlots, totalSlots };
  }

  public purchaseVehicle(
    catalogueId: string,
    liveryId?: string
  ): {
    success: boolean;
    reason?: string;
    vehicle?: OwnedVehicleRecord;
  } {
    const spec = getVehicleSpecById(catalogueId);
    if (!spec) {
      return {
        success: false,
        reason: `Vehicle catalogue item ${catalogueId} not found.`,
      };
    }

    if (spec.modal !== 'AIR' && this.level < spec.unlockLevel) {
      return {
        success: false,
        reason: `${spec.name} requires Player Level ${spec.unlockLevel}.`,
      };
    }

    let effectivePrice = spec.price;

    if (spec.modal === 'AIR') {
      if (!this.airportOwned) {
        return {
          success: false,
          reason:
            'Purchase and restore the Regional Cargo Airport before acquiring cargo aircraft.',
        };
      }
      const currentOwnedAir = Math.max(
        Array.from(this.ownedVehicles.values()).filter((v) => v.modal === 'AIR')
          .length,
        this.airportOps.getPlayerAircraftCount()
      );
      if (currentOwnedAir >= MAX_PLAYER_AIRCRAFT) {
        return {
          success: false,
          reason: `Maximum player cargo aircraft fleet limit reached (${MAX_PLAYER_AIRCRAFT}/${MAX_PLAYER_AIRCRAFT} aircraft owned).`,
        };
      }

      const nextSlotReq = getNextOwnedAircraftPurchaseRequirement(currentOwnedAir);
      if (
        !nextSlotReq ||
        !nextSlotReq.canEverPurchaseMore ||
        !nextSlotReq.slotNumber ||
        nextSlotReq.unlockAirportLevel === null
      ) {
        return {
          success: false,
          reason: `Maximum player cargo aircraft fleet limit reached (${MAX_PLAYER_AIRCRAFT}/${MAX_PLAYER_AIRCRAFT} aircraft owned).`,
        };
      }

      effectivePrice = nextSlotReq.purchasePrice;
      const currentAirportLevel = this.airport.level || 1;
      const reqHangarId: HangarSlotId =
        nextSlotReq.requiredHangarId ??
        (nextSlotReq.slotNumber === 1 ? 'HANGAR_1' : 'HANGAR_2');
      const requiredHangar = this.airportOps.getHangar(reqHangarId);
      const hasRequiredHangar = Boolean(
        requiredHangar &&
          requiredHangar.constructed &&
          requiredHangar.occupiedByAircraftId === null
      );

      if (currentAirportLevel < nextSlotReq.unlockAirportLevel) {
        if (nextSlotReq.slotNumber === 1) {
          return {
            success: false,
            reason: !hasRequiredHangar
              ? `To buy a plane you must own a Hanger first (Unlocks at Airport Level ${FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL})`
              : `Unlocks at Airport Level ${FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL} ($${FIRST_OWNED_AIRCRAFT_PRICE.toLocaleString()}). Current Airport Level: ${currentAirportLevel}.`,
          };
        }
        return {
          success: false,
          reason: `Unlocks at Airport Level ${SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL} ($${SECOND_OWNED_AIRCRAFT_PRICE.toLocaleString()}). Current Airport Level: ${currentAirportLevel}.`,
        };
      }

      if (!hasRequiredHangar) {
        return {
          success: false,
          reason:
            nextSlotReq.slotNumber === 1
              ? 'To buy a plane you must own a Hanger first'
              : `To buy a second plane you must own Hangar 2 first (${nextSlotReq.requiredHangarId} required)`,
        };
      }

      if (this.money < effectivePrice) {
        return {
          success: false,
          reason: `Insufficient funds for Owned Aircraft Slot #${nextSlotReq.slotNumber} (${spec.name}): requires $${effectivePrice.toLocaleString()} (available: $${this.money.toLocaleString()}).`,
        };
      }
    } else if (this.money < effectivePrice) {
      return {
        success: false,
        reason: `Insufficient funds for ${spec.name}: costs $${effectivePrice.toLocaleString()}.`,
      };
    }

    const cap = this.getModalCapacitySummary(spec.modal);
    if (cap.usedSlots >= cap.totalSlots) {
      return {
        success: false,
        reason: `No available ${spec.modal} storage slots (${cap.usedSlots}/${cap.totalSlots} occupied). Upgrade your depot or build another facility first!`,
      };
    }

    // Find home facility & depot slot
    let homeFacilityId = TRUCK_DEPOT_ID;
    let spawnCoord = { gx: 48, gz: 52 };
    let assignedDepotSlot: TruckDepotParkingSlotRecord | undefined;

    if (spec.modal === 'ROAD') {
      assignedDepotSlot = this.truckDepot?.slots.find(
        (s) => s.unlocked && !s.assignedVehicleId
      );
      if (assignedDepotSlot) {
        homeFacilityId = TRUCK_DEPOT_ID;
      } else {
        for (const b of this.placedBuildings.values()) {
          if (b.id !== TRUCK_DEPOT_ID && b.vehicleSlotModal === 'ROAD') {
            homeFacilityId = b.id;
            spawnCoord = { gx: b.gx + 1, gz: b.gz + 2 };
            break;
          }
        }
      }
    } else if (spec.modal === 'RAIL') {
      homeFacilityId = 'rail-depot-starter';
      spawnCoord = { gx: 26, gz: 50 };
    } else if (spec.modal === 'WATER') {
      homeFacilityId = 'port-harbour-starter';
      spawnCoord = { gx: 86, gz: 99 };
    } else if (spec.modal === 'AIR') {
      homeFacilityId = AIRPORT_CARGO_TERMINAL_FOOTPRINT.id;
      const stand =
        this.airport.parkingStands[cap.usedSlots] ??
        this.airport.parkingStands[0];
      spawnCoord = {
        gx: stand ? stand.centerGx : this.airport.minGx + 10,
        gz: stand ? stand.centerGz : this.airport.minGz + 15,
      };
    }

    const id = `veh-owned-${STARTER_MINI_TRUCK_COUNT + this.nextVehicleSeq++}`;
    const vehicleName = `${spec.name.split(' ')[0]} #${100 + STARTER_MINI_TRUCK_COUNT + this.nextVehicleSeq - 1}`;

    let registeredAir: CargoAircraftRecord | undefined;
    if (spec.modal === 'AIR') {
      const regRes = this.airportOps.registerPurchasedPlayerAircraft({
        id,
        name: vehicleName,
        catalogueId: spec.id,
        liveryId: liveryId || spec.defaultLiveryId,
        baseCapacityTons: spec.capacityTons,
        maintenanceCost: spec.maintenanceCostEvery5Days,
        airportOwned: this.airportOwned,
        airportLevel: this.airport.level || 1,
        activeStandCount: Math.max(1, this.airport.activeStandCount),
      });
      if (!regRes.success || !regRes.aircraft) {
        return {
          success: false,
          reason: regRes.reason || 'Failed to register player cargo aircraft.',
        };
      }
      registeredAir = regRes.aircraft;
      effectivePrice = regRes.price ?? effectivePrice;
    }

    this.recordTransactionInternal(
      'VEHICLE_PURCHASE',
      'EXPENSE',
      effectivePrice,
      `Purchased ${spec.name}`,
      id
    );

    const wp = this.grid.gridToWorld(spawnCoord.gx, spawnCoord.gz);
    const nowMs = Date.now();

    if (assignedDepotSlot) {
      assignedDepotSlot.assignedVehicleId = id;
      assignedDepotSlot.occupancyState = 'PARKED';
    }

    const spawnWorldX = registeredAir
      ? registeredAir.worldX
      : assignedDepotSlot
        ? assignedDepotSlot.worldX
        : wp.x;
    const spawnWorldZ = registeredAir
      ? registeredAir.worldZ
      : assignedDepotSlot
        ? assignedDepotSlot.worldZ
        : wp.z;
    const spawnYaw = registeredAir
      ? registeredAir.headingYaw
      : assignedDepotSlot
        ? assignedDepotSlot.headingYaw
        : Math.PI * 0.5;

    const record: OwnedVehicleRecord = {
      id,
      catalogueId: spec.id,
      name: vehicleName,
      modal: spec.modal,
      liveryId: liveryId || spec.defaultLiveryId,
      homeFacilityId,
      assignedDepotSlotId: assignedDepotSlot?.slotId,
      assignedDepotSlotNumber: assignedDepotSlot?.slotNumber,
      purchasePrice: effectivePrice,
      capacityTons: registeredAir
        ? registeredAir.effectiveCapacityTons
        : spec.capacityTons,
      targetCruisingSpeedKmh:
        spec.modal === 'ROAD'
          ? TARGET_TRUCK_CRUISING_SPEED_KMH
          : spec.cruisingSpeedKmh,
      currentSpeedKmh: 0,
      state: 'IDLE_AT_DEPOT',
      statusMessage: registeredAir
        ? `Stored in ${registeredAir.assignedHangarId ?? 'HANGAR_1'} (${registeredAir.flightStage})`
        : undefined,
      conditionPercent: 100,
      lastMaintenanceTimestampMs: nowMs,
      nextMaintenanceTimestampMs: nowMs + FIVE_REAL_DAYS_MS,
      maintenanceCost: spec.maintenanceCostEvery5Days,
      maintenanceOverdue: false,
      carryingCargoTons: 0,
      worldX: spawnWorldX,
      worldY:
        spec.modal === 'WATER'
          ? 0.15
          : spec.modal === 'AIR'
            ? AIRPORT_PAVEMENT_SURFACE_Y
            : 1.26,
      worldZ: spawnWorldZ,
      headingYaw: spawnYaw,
      trailerWorldX: spawnWorldX,
      trailerWorldZ: spawnWorldZ - 1.8,
      trailerYaw: spawnYaw,
      wheelRotationRad: 0,
      totalDistanceMeters: 0,
      routeProgressRatio: 0,
      offscreenRemainingSec: 0,
      isBraking: false,
      turnSignal: 'NONE',
      waypoints: [],
      currentWaypointIdx: 0,
      pathDistanceTraveled: 0,
      totalPathLength: 1,
    };

    this.ownedVehicles.set(id, record);
    this.awardXp(55, `Purchased ${spec.name}`);
    return { success: true, vehicle: record };
  }

  /**
   * Purchases a player-owned cargo aircraft for Slot #1 (Airport Level 10, $20,000,000, requires Hangar 1)
   * or Slot #2 (Airport Level 15, $30,000,000, requires Hangar 2).
   */
  public purchasePlayerCargoAircraft(
    catalogueId?: string,
    liveryId?: string
  ): {
    success: boolean;
    reason?: string;
    vehicle?: OwnedVehicleRecord;
    aircraft?: CargoAircraftRecord;
  } {
    const currentOwnedAir = Math.max(
      Array.from(this.ownedVehicles.values()).filter((v) => v.modal === 'AIR')
        .length,
      this.airportOps.getPlayerAircraftCount()
    );
    const defaultCatId =
      currentOwnedAir === 0
        ? 'veh-air-turboprop-freighter'
        : 'veh-air-widebody-jet';
    const res = this.purchaseVehicle(catalogueId || defaultCatId, liveryId);
    const ac = res.vehicle
      ? this.airportOps.getPlayerAircraftById(res.vehicle.id)
      : undefined;
    return {
      ...res,
      aircraft: ac,
    };
  }

  public purchaseAircraftHangar(slotId: HangarSlotId) {
    return this.constructAircraftHangar(slotId);
  }

  /**
   * Evaluates 5-real-day scheduled maintenance for all owned vehicles without duplicate charges.
   */
  public evaluateScheduledMaintenance(nowMs = Date.now()): {
    dueVehicles: OwnedVehicleRecord[];
  } {
    const due: OwnedVehicleRecord[] = [];
    for (const v of this.ownedVehicles.values()) {
      const elapsed = nowMs - v.lastMaintenanceTimestampMs;
      const ratio = Math.min(1, Math.max(0, elapsed / FIVE_REAL_DAYS_MS));
      v.conditionPercent = Math.max(
        15,
        Math.round(100 - ratio * 65)
      );
      if (nowMs >= v.nextMaintenanceTimestampMs) {
        v.maintenanceOverdue = true;
        if (v.state === 'IDLE_AT_DEPOT') {
          v.state = 'MAINTENANCE_DUE';
        }
        due.push(v);
      }
    }
    return { dueVehicles: due };
  }

  /**
   * Pays and completes the 5-real-day maintenance service for a vehicle through the central economy.
   */
  public performVehicleMaintenance(
    vehicleId: string,
    nowMs = Date.now()
  ): {
    success: boolean;
    reason?: string;
    vehicle?: OwnedVehicleRecord;
  } {
    const v = this.ownedVehicles.get(vehicleId);
    if (!v) {
      return { success: false, reason: 'Vehicle not found.' };
    }
    if (this.money < v.maintenanceCost) {
      return {
        success: false,
        reason: `Insufficient funds for ${v.name} maintenance: requires $${v.maintenanceCost.toLocaleString()}.`,
      };
    }

    this.recordTransactionInternal(
      'VEHICLE_MAINTENANCE',
      'EXPENSE',
      v.maintenanceCost,
      `Scheduled 5-Day Maintenance Service for ${v.name}`,
      v.id
    );

    v.lastMaintenanceTimestampMs = nowMs;
    v.nextMaintenanceTimestampMs = nowMs + FIVE_REAL_DAYS_MS;
    v.maintenanceOverdue = false;
    v.conditionPercent = 100;
    if (v.state === 'MAINTENANCE_DUE') {
      v.state = 'IDLE_AT_DEPOT';
    }

    if (v.modal === 'AIR') {
      const ac = this.airportOps.getPlayerAircraftById(v.id);
      if (ac) {
        this.airportOps.setAircraftCondition(v.id, 100);
        ac.lastMaintenanceTimestampMs = nowMs;
        ac.nextMaintenanceTimestampMs = nowMs + FIVE_REAL_DAYS_MS;
        ac.maintenanceOverdue = false;
      }
    }

    return { success: true, vehicle: v };
  }

  // ===========================================================================
  // AIRPORT LOGISTICS, GSE, ATC NPC ARRIVALS, HANGARS & FLIGHT METHODS (Prompts 3–6)
  // ===========================================================================

  public getAirportWarehouse(): AirportCargoWarehouseState {
    return this.airportOps.getAirportWarehouse();
  }

  public getAirportTransferYard(): AirportTransferYardState {
    return this.airportOps.getAirportTransferYard();
  }

  public addCargoToAirportWarehouse(
    cargoKey: AirportWarehouseCargoKey,
    tons: number
  ) {
    const res = this.airportOps.addCargoToAirportWarehouse(cargoKey, tons);
    this.syncAirportFacilityBuildingsTotals();
    return res;
  }

  public removeCargoFromAirportWarehouse(
    cargoKey: AirportWarehouseCargoKey,
    tons: number
  ) {
    const res = this.airportOps.removeCargoFromAirportWarehouse(cargoKey, tons);
    this.syncAirportFacilityBuildingsTotals();
    return res;
  }

  public requestAirportWarehouseToYardTransfer(
    cargoKey: AirportWarehouseCargoKey,
    tons: number,
    direction: TransferDirection = 'WAREHOUSE_TO_YARD'
  ): {
    success: boolean;
    reason?: string;
    task?: AirportCargoTransferTask;
  } {
    if (!this.airportOwned) {
      return {
        success: false,
        reason:
          'Purchase and restore the Regional Cargo Airport before operating the Airport Cargo Warehouse and Transfer Yard.',
      };
    }
    const res = this.airportOps.requestWarehouseToYardTransfer(
      cargoKey,
      tons,
      direction
    );
    this.syncAirportFacilityBuildingsTotals();
    return res;
  }

  public cancelAirportTransferTask(taskId: string) {
    const res = this.airportOps.cancelTransferTask(taskId);
    this.syncAirportFacilityBuildingsTotals();
    return res;
  }

  public getAirportWaypoints(): AirportWaypointRecord[] {
    return this.airportOps.getWaypoints();
  }

  public getAirportGseVehicles(): GSEVehicleRecord[] {
    return this.airportOps.getGseVehicles();
  }

  public getNpcSupplyAircraft(): CargoAircraftRecord[] {
    return this.airportOps.getNpcAircraft();
  }

  public requestAtcNpcSupplyArrival(): {
    success: boolean;
    reason?: string;
    aircraft?: CargoAircraftRecord;
  } {
    const res = this.airportOps.requestAtcNpcSupplyArrival(
      this.airportOwned,
      this.airport.level || 1
    );
    this.refreshAirportState();
    return res;
  }

  public getGuestAircraft(): CargoAircraftRecord[] {
    return this.airportOps.getGuestAircraft();
  }

  public getGuestArrivalsHandled(): number {
    return this.airportOps.getGuestArrivalsHandled();
  }

  public requestGuestAircraftArrival(guestModelId?: string): {
    success: boolean;
    reason?: string;
    aircraft?: CargoAircraftRecord;
    assignedStand?: AirportWaypointId;
  } {
    const res = this.airportOps.requestGuestAircraftArrival(
      this.airportOwned,
      this.airport.level || 1,
      guestModelId
    );
    this.refreshAirportState();
    return res;
  }

  public cancelGuestAircraftArrival(aircraftId: string): {
    success: boolean;
    reason?: string;
  } {
    const res = this.airportOps.cancelGuestAircraftArrival(aircraftId);
    this.refreshAirportState();
    return res;
  }

  public getAircraftHangars(): AircraftHangarRecord[] {
    return this.airportOps.getHangars();
  }

  public constructAircraftHangar(slotId: HangarSlotId): {
    success: boolean;
    reason?: string;
    hangar?: AircraftHangarRecord;
    building?: PlacedBuildingRecord;
  } {
    const check = this.airportOps.getHangar(slotId);
    if (!check) {
      return {
        success: false,
        reason: `Invalid hangar slot ${slotId}.`,
      };
    }
    if (!this.airportOwned) {
      return {
        success: false,
        reason:
          'Purchase and restore the Regional Cargo Airport before constructing Aircraft Hangars.',
      };
    }
    if (check.constructed) {
      return {
        success: false,
        reason: `${check.name} is already constructed.`,
      };
    }
    if (this.airport.level < check.unlockAirportLevel) {
      return {
        success: false,
        reason: `${check.name} requires Airport Level ${check.unlockAirportLevel} (current: Level ${this.airport.level}).`,
      };
    }
    if (this.money < check.constructionCost) {
      return {
        success: false,
        reason: `Insufficient funds to construct ${check.name}: requires $${check.constructionCost.toLocaleString()}.`,
      };
    }

    const res = this.airportOps.constructHangar(
      slotId,
      this.airportOwned,
      this.airport.level
    );
    if (!res.success || !res.hangar) {
      return { success: false, reason: res.reason };
    }

    this.recordTransactionInternal(
      'BUILDING_CONSTRUCTION',
      'EXPENSE',
      res.cost,
      `Constructed ${res.hangar.name} on Airport Hangar Tile (${slotId})`,
      res.hangar.id
    );

    const bldRec: PlacedBuildingRecord = {
      id: `facility-airport-${slotId.toLowerCase()}`,
      catalogueId: 'bld-air-regional-hangar',
      name: res.hangar.name,
      category: 'AIRPORT',
      gx: res.hangar.bounds.minGx,
      gz: res.hangar.bounds.minGz,
      widthCells: res.hangar.bounds.widthCells,
      depthCells: res.hangar.bounds.depthCells,
      orientation: 0,
      level: 1,
      maxLevel: 1,
      storageCapacityTons: 120,
      storedCargoTons: 0,
      vehicleSlotCapacity: 0,
      isPreplaced: true,
      upgradeCost: 0,
    };
    this.placedBuildings.set(bldRec.id, bldRec);

    const fp = this.grid.getFootprint(
      res.hangar.bounds.minGx,
      res.hangar.bounds.minGz,
      res.hangar.bounds.widthCells,
      res.hangar.bounds.depthCells,
      0
    );
    if (this.entities.has(bldRec.id)) {
      this.entities.unregister(bldRec.id);
    }
    this.entities.register({
      id: bldRec.id,
      category: 'AIRPORT_FACILITY',
      type: 'AIRPORT_MAINTENANCE_HANGAR',
      position: { gx: res.hangar.bounds.minGx, gz: res.hangar.bounds.minGz },
      footprint: fp.cells,
      orientation: 0,
      elevation: 1.4,
      ownership: 'PLAYER',
      active: true,
      metadata: {
        name: res.hangar.name,
        slotId,
        widthCells: res.hangar.bounds.widthCells,
        depthCells: res.hangar.bounds.depthCells,
      },
    });

    this.awardXp(150, `Constructed ${res.hangar.name}`);
    return {
      success: true,
      hangar: res.hangar,
      building: bldRec,
    };
  }

  public getPlayerCargoAircraft(): CargoAircraftRecord[] {
    return this.airportOps.getPlayerAircraft();
  }

  public getAirportYardTrucks() {
    return this.airportOps.getYardTrucks();
  }

  public setPlayerAircraftCondition(
    aircraftId: string,
    conditionPercent: number
  ): CargoAircraftRecord | undefined {
    const ac = this.airportOps.setAircraftCondition(
      aircraftId,
      conditionPercent
    );
    const ov = this.ownedVehicles.get(aircraftId);
    if (ac && ov) {
      ov.conditionPercent = ac.conditionPercent;
      if (ac.isGrounded) {
        ov.state = 'MAINTENANCE_DUE';
        ov.statusMessage = 'GROUNDED (0% Condition) — Repair in Aircraft Hangar';
      }
    }
    return ac;
  }

  public repairPlayerAircraftInHangar(
    aircraftId: string,
    preferredHangarId?: HangarSlotId,
    nowMs = Date.now()
  ): {
    success: boolean;
    reason?: string;
    aircraft?: CargoAircraftRecord;
    hangar?: AircraftHangarRecord;
  } {
    const ac = this.airportOps.getPlayerAircraftById(aircraftId);
    if (!ac) {
      return { success: false, reason: 'Player cargo aircraft not found.' };
    }
    if (this.money < ac.repairCost) {
      return {
        success: false,
        reason: `Insufficient funds for hangar repair of ${ac.name}: requires $${ac.repairCost.toLocaleString()}.`,
      };
    }

    const res = this.airportOps.repairAircraftInHangar(
      aircraftId,
      preferredHangarId,
      nowMs
    );
    if (!res.success || !res.aircraft) {
      return { success: false, reason: res.reason };
    }

    this.recordTransactionInternal(
      'VEHICLE_MAINTENANCE',
      'EXPENSE',
      res.repairCost,
      `Hangar Airframe Repair & 5-Day Maintenance Overhaul: ${res.aircraft.name}`,
      res.aircraft.id
    );

    const ov = this.ownedVehicles.get(aircraftId);
    if (ov) {
      ov.conditionPercent = 100;
      ov.lastMaintenanceTimestampMs = nowMs;
      ov.nextMaintenanceTimestampMs = nowMs + FIVE_REAL_DAYS_MS;
      ov.maintenanceOverdue = false;
      ov.state = 'IDLE_AT_DEPOT';
      ov.worldX = res.aircraft.worldX;
      ov.worldY = res.aircraft.worldY;
      ov.worldZ = res.aircraft.worldZ;
      ov.headingYaw = res.aircraft.headingYaw;
      ov.statusMessage = `Repaired in ${res.hangar?.name ?? 'Hangar'} (100% Condition)`;
    }

    return {
      success: true,
      aircraft: res.aircraft,
      hangar: res.hangar,
    };
  }

  public returnPlayerAircraftFromHangar(aircraftId: string) {
    const res = this.airportOps.returnAircraftFromHangarToStand(aircraftId);
    if (res.success && res.aircraft) {
      const ov = this.ownedVehicles.get(aircraftId);
      if (ov) {
        ov.worldX = res.aircraft.worldX;
        ov.worldY = res.aircraft.worldY;
        ov.worldZ = res.aircraft.worldZ;
        ov.headingYaw = res.aircraft.headingYaw;
        ov.state = 'IDLE_AT_DEPOT';
      }
    }
    return res;
  }

  public dispatchPlayerAircraftFlight(
    aircraftId: string,
    materialCategory?: AirCargoMaterialCategory,
    requestedTons?: number,
    flightOperationId?: string
  ) {
    if (!this.airportOwned) {
      return {
        success: false,
        reason: 'Airport is not yet purchased and operational.',
      };
    }
    const res = this.airportOps.dispatchPlayerAircraftFlight({
      aircraftId,
      airportLevel: this.airport.level || 1,
      materialCategory,
      requestedTons,
      flightOperationId,
    });
    if (res.success && res.aircraft) {
      const ov = this.ownedVehicles.get(aircraftId);
      if (ov) {
        ov.state = 'EN_ROUTE_OUTBOUND';
        ov.carryingCargoTons = res.aircraft.carryingCargoTons;
        ov.carryingCargoType = res.aircraft.carryingCargoKey ?? 'Air Cargo';
      }
      this.syncAirportFacilityBuildingsTotals();
    }
    return res;
  }

  private syncAirportFacilityBuildingsTotals(): void {
    const whRec = this.placedBuildings.get(
      AIRPORT_WAREHOUSE_LEVEL_20_FOOTPRINT.id
    );
    if (whRec) {
      const aw = this.airportOps.getAirportWarehouse();
      whRec.storageCapacityTons = aw.totalCapacityTons;
      whRec.storedCargoTons = aw.totalStoredTons;
    }
    const tyRec = this.placedBuildings.get(AIRPORT_TRANSFER_YARD_FOOTPRINT.id);
    if (tyRec) {
      const ty = this.airportOps.getAirportTransferYard();
      tyRec.storageCapacityTons = ty.stagingCapacityTons;
      tyRec.storedCargoTons = ty.totalStagedTons;
    }
  }

  // ===========================================================================
  // CONTRACT DISPATCH & WAREHOUSE 1 LOADING SEQUENCE (Depot -> Warehouse 1 -> Loading -> Destination)
  // ===========================================================================

  public dispatchContract(
    contractId: string,
    vehicleId: string
  ): {
    success: boolean;
    reason?: string;
  } {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      return { success: false, reason: 'Contract not found.' };
    }
    if (contract.status === 'ACTIVE') {
      return {
        success: false,
        reason: 'Contract is already actively in progress.',
      };
    }
    if (this.level < contract.requiredLevel) {
      return {
        success: false,
        reason: `Contract requires Player Level ${contract.requiredLevel}.`,
      };
    }

    const vehicle = this.ownedVehicles.get(vehicleId);
    if (!vehicle) {
      return { success: false, reason: 'Selected vehicle not found.' };
    }
    if (vehicle.modal !== contract.modal) {
      return {
        success: false,
        reason: `Contract requires a ${contract.modal} vehicle (${vehicle.name} is ${vehicle.modal}).`,
      };
    }
    if (vehicle.state !== 'IDLE_AT_DEPOT') {
      return {
        success: false,
        reason: `${vehicle.name} is currently ${vehicle.state}.`,
      };
    }
    if (vehicle.maintenanceOverdue) {
      return {
        success: false,
        reason: `${vehicle.name} requires scheduled 5-day maintenance before dispatch.`,
      };
    }
    if (vehicle.capacityTons < contract.cargoTons) {
      return {
        success: false,
        reason: `${vehicle.name} capacity (${vehicle.capacityTons}t) is below contract load (${contract.cargoTons}t).`,
      };
    }

    if (contract.modal === 'ROAD' && this.roads.getAllSegments().length === 0) {
      return {
        success: false,
        reason:
          'No valid road/highway connection available from Truck Depot to destination.',
      };
    }

    // Deduct operating expense upfront through the central economy
    if (this.money >= contract.operatingExpenseEstimate) {
      this.recordTransactionInternal(
        'OPERATING_EXPENSE',
        'EXPENSE',
        contract.operatingExpenseEstimate,
        `Fuel & Dispatch Operating Cost: ${contract.title}`,
        vehicle.id,
        contract.id
      );
    }

    vehicle.assignedContractId = contract.id;
    vehicle.state = 'EN_ROUTE_OUTBOUND';
    vehicle.routeProgressRatio = 0;

    contract.status = 'ACTIVE';
    contract.assignedVehicleId = vehicle.id;
    contract.progressRatio = 0;

    // For ROAD contracts, enforce the realistic sequence:
    // Depot (0 cargo) -> Warehouse 1 -> Loading Door -> Forklift Cargo Transfer -> Destination -> Completion
    if (contract.modal === 'ROAD') {
      const slot = this.truckDepot?.slots.find(
        (s) =>
          s.assignedVehicleId === vehicle.id ||
          s.slotNumber === vehicle.assignedDepotSlotNumber
      );
      if (slot) {
        slot.occupancyState = 'DISPATCHED';
      }

      const whId = this.warehouses.has(contract.originFacilityId)
        ? contract.originFacilityId
        : 'facility-warehouse-1';
      const wh = this.warehouses.get(whId);
      const cargoCategory = this.resolveContractCargoCategory(contract);

      // Critically: No cargo is created at the truck depot!
      vehicle.carryingCargoTons = 0;
      vehicle.carryingCargoType = contract.cargoType;
      vehicle.carryingCargoCategory = cargoCategory;
      vehicle.cargoLoadedVerified = false;
      vehicle.targetWarehouseId = whId;
      vehicle.deliveryPhase = 'TO_WAREHOUSE';
      vehicle.state = 'EN_ROUTE_TO_WAREHOUSE';
      vehicle.statusMessage = `Driving from Depot to ${wh?.name ?? 'Warehouse 1'} for cargo loading.`;

      if (wh) {
        const taskId = `task-wh-load-${this.nextLoadingTaskSeq++}`;
        const freeDoor = wh.doors.find(
          (d) => d.occupiedByVehicleId === null && d.reservedByVehicleId === null
        );

        const task: WarehouseLoadingTaskRecord = {
          id: taskId,
          warehouseId: wh.id,
          vehicleId: vehicle.id,
          contractId: contract.id,
          cargoCategory,
          category: cargoCategory,
          requiredTons: contract.cargoTons,
          totalTonsRequired: contract.cargoTons,
          loadedTons: 0,
          doorId: freeDoor ? freeDoor.id : null,
          doorNumber: freeDoor ? freeDoor.doorNumber : 0,
          forkliftId: null,
          status: freeDoor ? 'TRUCK_EN_ROUTE' : 'QUEUED_FOR_DOOR',
        };
        wh.activeTasks.push(task);
        vehicle.loadingTaskId = task.id;

        if (freeDoor) {
          freeDoor.reservedByVehicleId = vehicle.id;
          vehicle.assignedDoorId = freeDoor.id;
          const waypoints = this.buildWaypointsDepotToWarehouseDoor(
            vehicle,
            freeDoor
          );
          this.assignWaypointsToVehicle(vehicle, waypoints);
        } else {
          vehicle.assignedDoorId = undefined;
          if (!wh.waitingQueueVehicleIds.includes(vehicle.id)) {
            wh.waitingQueueVehicleIds.push(vehicle.id);
          }
          const queueIndex = Math.max(
            0,
            wh.waitingQueueVehicleIds.indexOf(vehicle.id)
          );
          const waypoints = this.buildWaypointsDepotToWarehouseQueue(
            vehicle,
            wh,
            queueIndex
          );
          this.assignWaypointsToVehicle(vehicle, waypoints);
        }

        this.updateWarehouseOperationalSummary(wh);
        return { success: true };
      }
    }

    // Non-ROAD contracts (RAIL / WATER / AIR)
    if (contract.modal === 'RAIL') {
      this.railways.assignJobAndLoad(contract.id);
    }
    const waypoints = this.buildWaypointsForModal(contract.modal);
    this.assignWaypointsToVehicle(vehicle, waypoints);
    vehicle.carryingCargoType = contract.cargoType;
    vehicle.carryingCargoTons = contract.cargoTons;
    vehicle.cargoLoadedVerified = true;
    vehicle.deliveryPhase = 'TO_DESTINATION';

    return { success: true };
  }

  /**
   * Triggers the Railway Freight Hub job-based forklift & train loading sequence (`[Assign Job & Load]`).
   */
  public assignRailJobAndLoad(
    jobOrContractId: string,
    trainId?: string
  ): {
    success: boolean;
    reason?: string;
    train?: RailwayFreightHubState['trains'][number];
    job?: RailwayFreightHubState['jobs'][number];
  } {
    const res = this.railways.assignJobAndLoad(jobOrContractId, trainId);
    if (!res.success) {
      return { success: false, reason: res.reason };
    }
    const opExpense = res.job ? Math.round(res.job.cashReward * 0.1) : 0;
    if (res.job && opExpense > 0 && this.money >= opExpense) {
      this.recordTransactionInternal(
        'OPERATING_EXPENSE',
        'EXPENSE',
        opExpense,
        `Rail Dispatch & Terminal Loading Cost: ${res.job.title}`,
        res.train?.id,
        res.job.id
      );
    }
    const matchingContract = this.contracts.get(jobOrContractId);
    if (matchingContract && matchingContract.status === 'AVAILABLE') {
      matchingContract.status = 'ACTIVE';
      matchingContract.progressRatio = 0.05;
    }
    return { success: true, train: res.train, job: res.job };
  }

  /**
   * Purchases/Unlocks the Railway Freight Hub if locked.
   */
  public purchaseRailwayYard(): {
    success: boolean;
    reason?: string;
  } {
    const res = this.railways.purchaseRailwayYard(this.money);
    if (!res.success) {
      return { success: false, reason: res.reason };
    }
    if (res.cost > 0) {
      this.recordTransactionInternal(
        'FACILITY_UPGRADE',
        'EXPENSE',
        res.cost,
        'Acquired GTE Central Railway Freight Yard & Switchyard'
      );
      this.awardXp(350, 'Unlocked GTE Central Railway Freight Yard');
    }
    return { success: true };
  }

  public getRailwayFreightHubState(): RailwayFreightHubState {
    return this.railways.getFreightHubState();
  }

  private assignWaypointsToVehicle(
    vehicle: OwnedVehicleRecord,
    waypoints: WorldWaypoint[]
  ): void {
    vehicle.waypoints = waypoints;
    vehicle.currentWaypointIdx = 0;
    vehicle.pathDistanceTraveled = 0;
    vehicle.totalPathLength = this.calculateWaypointsLength(waypoints);
    if (waypoints.length > 0) {
      vehicle.worldX = waypoints[0].wx;
      vehicle.worldY = waypoints[0].wy;
      vehicle.worldZ = waypoints[0].wz;
      vehicle.trailerWorldX = waypoints[0].wx - 2.2;
      vehicle.trailerWorldZ = waypoints[0].wz;
    }
  }

  /**
   * Builds a route from the vehicle's Truck Depot parking slot along the approved Warehouse 1 access road
   * (`gx = 48, gz = 55..69`) into the assigned loading door's approach and stop positions.
   */
  private buildWaypointsDepotToWarehouseDoor(
    vehicle: OwnedVehicleRecord,
    door: WarehouseLoadingDoorRecord
  ): WorldWaypoint[] {
    const pRoadEntry = this.grid.gridToWorld(48, 55);
    const pGate = this.grid.gridToWorld(48, 68);

    return [
      {
        wx: vehicle.worldX,
        wy: 1.31,
        wz: vehicle.worldZ,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
      {
        wx: pRoadEntry.x,
        wy: 1.31,
        wz: pRoadEntry.z,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
      {
        wx: pGate.x,
        wy: 1.31,
        wz: pGate.z,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
      {
        wx: door.approachWorldPos.wx,
        wy: 1.31,
        wz: door.approachWorldPos.wz,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
      {
        wx: door.stopWorldPos.wx,
        wy: 1.31,
        wz: door.stopWorldPos.wz,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
    ];
  }

  /**
   * Builds a route from the Truck Depot parking slot to the Warehouse 1 northern yard queue when all loading doors are busy.
   */
  private buildWaypointsDepotToWarehouseQueue(
    vehicle: OwnedVehicleRecord,
    wh: WarehouseFacilityState,
    queueIndex: number
  ): WorldWaypoint[] {
    const pRoadEntry = this.grid.gridToWorld(48, 55);
    const pGate = this.grid.gridToWorld(48, 67);
    const waitGx = Math.max(
      wh.reservedMinGx + 2,
      Math.min(wh.reservedMaxGx - 2, 44 - (queueIndex % 4) * 2)
    );
    const waitGz = wh.reservedMinGz + 2;
    const pWait = this.grid.gridToWorld(waitGx, waitGz);

    return [
      {
        wx: vehicle.worldX,
        wy: 1.31,
        wz: vehicle.worldZ,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
      {
        wx: pRoadEntry.x,
        wy: 1.31,
        wz: pRoadEntry.z,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
      {
        wx: pGate.x,
        wy: 1.31,
        wz: pGate.z,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
      {
        wx: pWait.x,
        wy: 1.31,
        wz: pWait.z,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
    ];
  }

  /**
   * Builds the loaded outbound delivery route from a Warehouse 1 loading door
   * north along the approved access road (`gx = 48, gz = 68 -> 55`) and out across the bridge,
   * Central Roundabout, and destination corridor.
   */
  private buildWaypointsWarehouseDoorToDestination(
    startWx: number,
    startWz: number
  ): WorldWaypoint[] {
    const pGate = this.grid.gridToWorld(48, 68);
    const pArterial = this.grid.gridToWorld(48, 55);
    const destWaypoints = this.buildWaypointsForModal('ROAD');

    return [
      {
        wx: startWx,
        wy: 1.31,
        wz: startWz,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
      {
        wx: pGate.x,
        wy: 1.31,
        wz: pGate.z,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
      {
        wx: pArterial.x,
        wy: 1.31,
        wz: pArterial.z,
        speedLimitKmh: TARGET_TRUCK_CRUISING_SPEED_KMH,
      },
      ...destWaypoints,
    ];
  }

  /**
   * Builds a realistic continuous route across the local road network -> Central Roundabout ->
   * East Highway Ramp -> 10-Lane Motorway (or Rail / Sea / Air corridor).
   */
  private buildWaypointsForModal(modal: TransportModalCategory): WorldWaypoint[] {
    if (modal === 'ROAD') {
      // Smooth continuous route from Logistics/City -> Central Roundabout (86, 55) ->
      // Multi-Lane Highway-City Arterial -> Highway-City Interchange Roundabout (128.5, 55) -> Motorway Northbound -> Offscreen
      const hwCenterGx =
        (this.config.highway.startX + this.config.highway.endX) * 0.5;
      const pts: Array<{
        gx: number;
        gz: number;
        wy?: number;
        isRoundabout?: boolean;
        isRamp?: boolean;
        isMotorway?: boolean;
      }> = [
        { gx: 50, gz: 55 },
        { gx: 64, gz: 55, wy: 2.1 }, // Across river bridge corridor
        { gx: 76, gz: 55 },
        { gx: 81.5, gz: 56.2, isRoundabout: true },
        { gx: 86, gz: 59.2, isRoundabout: true },
        { gx: 90.5, gz: 56.2, isRoundabout: true },
        { gx: 108, gz: 56.0, isRamp: true },
        { gx: hwCenterGx - 8.5, gz: 56.4, isRamp: true },
        { gx: hwCenterGx - 4.3, gz: 58.6, isRoundabout: true },
        { gx: hwCenterGx, gz: 60.2, isRoundabout: true },
        { gx: hwCenterGx + 4.3, gz: 58.2, isRoundabout: true },
        { gx: hwCenterGx + 4.7, gz: 53.5, isRoundabout: true },
        { gx: hwCenterGx + 3.0, gz: 49.0, isMotorway: true },
        { gx: hwCenterGx + 2.0, gz: 36, isMotorway: true },
        { gx: hwCenterGx + 2.0, gz: 19, isMotorway: true },
      ];
      return pts.map((p) => {
        const w = this.grid.gridToWorld(p.gx, p.gz);
        return {
          wx: w.x,
          wy: p.wy ?? 1.31,
          wz: w.z,
          speedLimitKmh: p.isRoundabout
            ? TARGET_TRUCK_CRUISING_SPEED_KMH * 0.78
            : TARGET_TRUCK_CRUISING_SPEED_KMH,
          isRoundabout: p.isRoundabout,
          isRamp: p.isRamp,
          isMotorway: p.isMotorway,
        };
      });
    }

    if (modal === 'RAIL') {
      const pStart = this.grid.gridToWorld(26, 40);
      const pEnd = this.grid.gridToWorld(26, 70);
      return [
        { wx: pStart.x, wy: 1.38, wz: pStart.z, speedLimitKmh: 42 },
        { wx: pEnd.x, wy: 1.38, wz: pEnd.z, speedLimitKmh: 42 },
      ];
    }

    if (modal === 'WATER') {
      const p0 = this.grid.gridToWorld(86, 99);
      const p1 = this.grid.gridToWorld(86, 108);
      const p2 = this.grid.gridToWorld(135, 108);
      return [
        { wx: p0.x, wy: 0.15, wz: p0.z, speedLimitKmh: 30 },
        { wx: p1.x, wy: 0.15, wz: p1.z, speedLimitKmh: 30 },
        { wx: p2.x, wy: 0.15, wz: p2.z, speedLimitKmh: 30 },
      ];
    }

    // AIR
    const a0 = this.grid.gridToWorld(112, 20);
    const a1 = this.grid.gridToWorld(132, 20);
    const a2 = this.grid.gridToWorld(148, 20);
    return [
      { wx: a0.x, wy: 1.48, wz: a0.z, speedLimitKmh: 75 },
      { wx: a1.x, wy: 1.8, wz: a1.z, speedLimitKmh: 75 },
      { wx: a2.x, wy: 8.5, wz: a2.z, speedLimitKmh: 75 },
    ];
  }

  private calculateWaypointsLength(wps: WorldWaypoint[]): number {
    let total = 0;
    for (let i = 1; i < wps.length; i++) {
      total += Math.hypot(
        wps[i].wx - wps[i - 1].wx,
        wps[i].wz - wps[i - 1].wz
      );
    }
    return Math.max(1, total);
  }

  // ===========================================================================
  // REAL-TIME DELTA-TIME SIMULATION STEP (WAREHOUSE 1, FORKLIFTS, TRUCKS, AMBIENT)
  // ===========================================================================

  /**
   * Advances all owned dispatched vehicles, Warehouse 1 doors & demand-driven forklifts,
   * and ambient motorway/rail/sea/air vehicles.
   */
  public stepSimulation(dtSeconds: number): void {
    const dt = Math.min(Math.max(dtSeconds, 0.001), 0.1);

    // 1. Update Owned Dispatched Vehicles
    for (const v of this.ownedVehicles.values()) {
      this.stepOwnedVehicle(v, dt);
    }

    // 2. Update Warehouse 1 Doors, Queue Coordination & Demand-Driven Forklifts
    for (const wh of this.warehouses.values()) {
      this.stepWarehouseOperations(wh, dt);
    }

    // 3. Update Airport Cargo Warehouse, Transfer Yard, GSE, NPC Supply Arrivals & Player Cargo Aircraft (Prompts 3–6)
    if (this.airportOwned && this.airportOps) {
      this.airportOps.stepSimulation(dt, {
        onNpcSupplyDelivered: (npc, _supplies, bonusCash) => {
          if (bonusCash > 0) {
            this.recordTransactionInternal(
              'CONTRACT_REWARD',
              'INCOME',
              bonusCash,
              `ATC Supply Arrival Grant & Free Supply Drop (${npc.callsign})`,
              npc.id
            );
          }
          this.awardXp(120, `Unloaded ATC Supply Aircraft ${npc.callsign}`);
          this.syncAirportFacilityBuildingsTotals();
        },
        onPlayerFlightCompleted: (ac, payoutCash, xpEarned) => {
          if (payoutCash > 0) {
            this.recordTransactionInternal(
              'CONTRACT_REWARD',
              'INCOME',
              payoutCash,
              `Air Cargo Flight Completed: ${ac.name} (${Math.round(ac.flightEfficiencyMultiplier * 100)}% Eff.)`,
              ac.id
            );
          }
          if (xpEarned > 0) {
            this.awardXp(xpEarned, `Completed Air Cargo Flight (${ac.name})`);
          }
          this.syncAirportFacilityBuildingsTotals();
        },
      });

      // Keep OwnedVehicleRecord synchronized with authoritative CargoAircraftRecord state
      for (const ac of this.airportOps.getPlayerAircraft()) {
        const ov = this.ownedVehicles.get(ac.id);
        if (ov) {
          ov.worldX = ac.worldX;
          ov.worldY = ac.worldY;
          ov.worldZ = ac.worldZ;
          ov.headingYaw = ac.headingYaw;
          ov.wheelRotationRad = ac.wheelRotationRad;
          ov.conditionPercent = ac.conditionPercent;
          ov.capacityTons = ac.effectiveCapacityTons;
          ov.carryingCargoTons = ac.carryingCargoTons;
          ov.currentSpeedKmh = Number((ac.currentSpeedMps * 3.6).toFixed(1));
          if (ac.isGrounded) {
            ov.state = 'MAINTENANCE_DUE';
            ov.statusMessage =
              'GROUNDED (0% Condition) — Repair in Aircraft Hangar';
          } else if (
            ac.flightStage === 'PARKED' ||
            ac.flightStage === 'IN_HANGAR'
          ) {
            if (ov.state !== 'MAINTENANCE_DUE' && !ov.assignedContractId) {
              ov.state = 'IDLE_AT_DEPOT';
            }
          } else if (ac.flightStage === 'OFFSCREEN_FLIGHT') {
            ov.state = 'OFFSCREEN_SIMULATION';
          } else {
            ov.state = 'EN_ROUTE_OUTBOUND';
          }
        }
      }
    }

    // 4. Update Railway Freight Yard Job-Triggered Forklifts & GTE-L1 Rolling Stock State Machine
    this.railways.stepSimulation(dt);

    // Synchronize active RAIL contract progress with the GTE-L1 train state
    const activeTrain = this.railways.getFreightHubState().trains[0];
    if (activeTrain && activeTrain.assignedContractId) {
      const c = this.contracts.get(activeTrain.assignedContractId);
      if (c && c.status === 'ACTIVE') {
        if (activeTrain.state === 'LOADING') {
          c.progressRatio = (activeTrain.loadingProgressPercent / 100) * 0.35;
        } else if (activeTrain.state === 'DEPARTING') {
          c.progressRatio = 0.55;
        } else if (activeTrain.state === 'IN_TRANSIT') {
          c.progressRatio = 0.8;
        } else if (activeTrain.state === 'RETURNING') {
          c.progressRatio = 0.95;
        }
      }
    }

    // 5. Update Ambient Motorway, Roundabout & Ship Traffic
    for (const av of this.ambientVehicles) {
      this.stepAmbientVehicle(av, dt);
    }
  }

  private stepOwnedVehicle(v: OwnedVehicleRecord, dt: number): void {
    // Player-owned AIR vehicles are stepped by the authoritative AirportLogisticsAndFlightController
    // unless they are dispatched on a legacy generic contract without an airportOps record
    if (
      v.modal === 'AIR' &&
      this.airportOps?.getPlayerAircraftById(v.id) &&
      !v.assignedContractId
    ) {
      return;
    }

    if (v.state === 'IDLE_AT_DEPOT' || v.state === 'MAINTENANCE_DUE') {
      v.currentSpeedKmh = 0;
      v.isBraking = false;
      v.turnSignal = 'NONE';
      return;
    }

    const spec = getVehicleSpecById(v.catalogueId);
    const wheelRadius = spec?.wheelRadiusMeters ?? 0.26;

    // Handle Offscreen Simulation Continuity (Master Prompts 2, 4 & 5)
    if (v.state === 'OFFSCREEN_SIMULATION') {
      v.offscreenRemainingSec -= dt;
      v.currentSpeedKmh = v.targetCruisingSpeedKmh;
      const contract = v.assignedContractId
        ? this.contracts.get(v.assignedContractId)
        : undefined;
      if (contract) {
        contract.progressRatio = Math.min(
          0.95,
          0.5 + (1 - Math.max(0, v.offscreenRemainingSec) / 3.0) * 0.45
        );
      }
      v.routeProgressRatio = contract?.progressRatio ?? 0.75;

      if (v.offscreenRemainingSec <= 0) {
        // Complete contract delivery and restore vehicle to visible return/depot
        this.completeContractForVehicle(v);
      }
      return;
    }

    // If the vehicle is waiting or actively being loaded at Warehouse 1, hold position cleanly
    if (
      v.modal === 'ROAD' &&
      (v.deliveryPhase === 'WAITING_FOR_DOOR' ||
        v.deliveryPhase === 'WAITING_FOR_STOCK' ||
        v.deliveryPhase === 'WAITING_FOR_FORKLIFT' ||
        v.deliveryPhase === 'LOADING_AT_WAREHOUSE')
    ) {
      v.currentSpeedKmh = 0;
      v.isBraking = true;
      v.turnSignal = 'NONE';
      return;
    }

    // Look ahead on path for roundabout/ramp yield deceleration & anti-overlap spacing
    const previewSample = this.sampleAlongWaypoints(
      v.waypoints,
      v.pathDistanceTraveled + 3.2
    );
    let desiredSpeedKmh = previewSample.isTurning
      ? v.targetCruisingSpeedKmh * 0.82
      : v.targetCruisingSpeedKmh;

    // Headway spacing check against other active road vehicles in the same phase
    if (v.modal === 'ROAD') {
      for (const other of this.ownedVehicles.values()) {
        if (
          other.id === v.id ||
          other.modal !== 'ROAD' ||
          other.deliveryPhase !== v.deliveryPhase
        ) {
          continue;
        }
        const gapAhead = other.pathDistanceTraveled - v.pathDistanceTraveled;
        if (gapAhead > 0.1 && gapAhead < 5.2) {
          desiredSpeedKmh = Math.min(
            desiredSpeedKmh,
            Math.max(8, other.currentSpeedKmh * (gapAhead / 5.2))
          );
        }
      }
    }

    // Smooth acceleration or deceleration toward desiredSpeedKmh
    if (v.currentSpeedKmh < desiredSpeedKmh) {
      v.currentSpeedKmh = Math.min(
        desiredSpeedKmh,
        v.currentSpeedKmh + 22.0 * dt
      );
    } else if (v.currentSpeedKmh > desiredSpeedKmh) {
      v.currentSpeedKmh = Math.max(
        desiredSpeedKmh,
        v.currentSpeedKmh - 18.0 * dt
      );
    }

    // Convert km/h to world units/sec (scaled for responsive tycoon gameplay & 25 km/h telemetry)
    const worldUnitsPerSec = (v.currentSpeedKmh / 25.0) * 8.6;
    const stepDist = worldUnitsPerSec * dt;

    v.pathDistanceTraveled += stepDist;
    v.totalDistanceMeters += stepDist;
    v.wheelRotationRad =
      (v.wheelRotationRad + stepDist / wheelRadius) % (Math.PI * 200);

    const progress = Math.min(
      1,
      v.pathDistanceTraveled / Math.max(1, v.totalPathLength)
    );

    if (v.modal === 'ROAD' && v.deliveryPhase === 'TO_WAREHOUSE') {
      v.routeProgressRatio = progress * 0.15;
    } else if (v.modal === 'ROAD' && v.deliveryPhase === 'TO_DESTINATION') {
      v.routeProgressRatio = 0.25 + progress * 0.25;
    } else {
      v.routeProgressRatio = progress * 0.5;
    }

    if (v.assignedContractId) {
      const c = this.contracts.get(v.assignedContractId);
      if (c) c.progressRatio = v.routeProgressRatio;
    }

    // Sample position along waypoints
    const sampled = this.sampleAlongWaypoints(
      v.waypoints,
      v.pathDistanceTraveled
    );
    v.worldX = sampled.wx;
    v.worldY = sampled.wy;
    v.worldZ = sampled.wz;
    v.headingYaw = sampled.yaw;
    v.isBraking = sampled.isTurning || v.currentSpeedKmh < desiredSpeedKmh - 1.5;
    v.turnSignal = sampled.turnSignal;

    // Progressive Tractor-Trailer Articulation: Trailer follows tractor's path at hitch offset
    const hitchDist = Math.max(0, v.pathDistanceTraveled - 2.35);
    const trailerSample = this.sampleAlongWaypoints(v.waypoints, hitchDist);
    v.trailerWorldX = trailerSample.wx;
    v.trailerWorldZ = trailerSample.wz;
    v.trailerYaw = trailerSample.yaw;


    // Check arrival at end of current path
    if (progress >= 1.0) {
      if (v.modal === 'ROAD' && v.deliveryPhase === 'TO_WAREHOUSE') {
        const wh = v.targetWarehouseId
          ? this.warehouses.get(v.targetWarehouseId)
          : undefined;
        const door =
          wh && v.assignedDoorId
            ? wh.doors.find((d) => d.id === v.assignedDoorId)
            : undefined;

        if (wh && door) {
          // Truck has arrived at its assigned Warehouse 1 loading door!
          door.reservedByVehicleId = null;
          door.occupiedByVehicleId = v.id;
          door.isOpen = true;
          v.worldX = door.stopWorldPos.wx;
          v.worldZ = door.stopWorldPos.wz;
          v.headingYaw = 0;
          v.currentSpeedKmh = 0;

          const task = wh.activeTasks.find((t) => t.vehicleId === v.id);
          if (task) {
            task.doorNumber = door.doorNumber;
            if (wh.stored[task.cargoCategory] + 1e-6 < task.requiredTons) {
              task.status = 'WAITING_FOR_STOCK';
              v.deliveryPhase = 'WAITING_FOR_STOCK';
              v.state = 'WAITING_FOR_STOCK';
              v.statusMessage = `Waiting at Door #${door.doorNumber}: insufficient ${task.cargoCategory} stock (${wh.stored[task.cargoCategory].toFixed(1)}t / ${task.requiredTons.toFixed(1)}t).`;
            } else {
              task.status = 'WAITING_FOR_FORKLIFT';
              v.deliveryPhase = 'WAITING_FOR_FORKLIFT';
              v.state = 'DOCKING_AT_DOOR';
              v.statusMessage = `Docked at Door #${door.doorNumber} — awaiting forklift.`;
            }
          } else {
            v.deliveryPhase = 'WAITING_FOR_FORKLIFT';
            v.state = 'DOCKING_AT_DOOR';
          }
          this.updateWarehouseOperationalSummary(wh);
        } else {
          // Arrived at Warehouse 1 waiting yard queue
          v.currentSpeedKmh = 0;
          v.deliveryPhase = 'WAITING_FOR_DOOR';
          v.state = 'WAITING_FOR_DOOR';
          v.statusMessage = 'Waiting in Warehouse 1 yard queue for an available loading door.';
          if (wh) this.updateWarehouseOperationalSummary(wh);
        }
        return;
      }

      // Transition smoothly to Offscreen Simulation at the end of the visible destination route
      v.state = 'OFFSCREEN_SIMULATION';
      v.offscreenRemainingSec = 3.0;
    }
  }

  /**
   * Coordinates Warehouse 1 loading doors, waiting truck queues, stock validation,
   * and demand-driven forklift movements (2 to 10 doors & forklifts).
   */
  private stepWarehouseOperations(
    wh: WarehouseFacilityState,
    dt: number
  ): void {
    // 1. Prevent door deadlocks: if a truck docked at a door is stuck in WAITING_FOR_STOCK
    // and there is a queued truck waiting for a door whose required stock IS available,
    // yield the door so the loadable truck can dock and load.
    const freeDoorsCheck = wh.doors.filter(
      (d) => d.occupiedByVehicleId === null && d.reservedByVehicleId === null
    );
    if (freeDoorsCheck.length === 0 && wh.waitingQueueVehicleIds.length > 0) {
      const loadableQueuedVehId = wh.waitingQueueVehicleIds.find((qVid) => {
        const qTask = wh.activeTasks.find((t) => t.vehicleId === qVid);
        return (
          qTask &&
          wh.stored[qTask.cargoCategory] + 1e-6 >= qTask.requiredTons
        );
      });

      if (loadableQueuedVehId) {
        const blockedDoor = wh.doors.find((d) => {
          if (!d.occupiedByVehicleId) return false;
          const occTask = wh.activeTasks.find(
            (t) => t.vehicleId === d.occupiedByVehicleId
          );
          return occTask && occTask.status === 'WAITING_FOR_STOCK';
        });

        if (blockedDoor && blockedDoor.occupiedByVehicleId) {
          const yieldedVehId = blockedDoor.occupiedByVehicleId;
          const yieldedVeh = this.ownedVehicles.get(yieldedVehId);
          const yieldedTask = wh.activeTasks.find(
            (t) => t.vehicleId === yieldedVehId
          );
          blockedDoor.occupiedByVehicleId = null;
          blockedDoor.isOpen = false;
          if (yieldedTask) {
            yieldedTask.doorId = null;
            yieldedTask.doorNumber = 0;
          }
          if (yieldedVeh) {
            yieldedVeh.assignedDoorId = undefined;
            yieldedVeh.state = 'WAITING_FOR_STOCK';
            if (!wh.waitingQueueVehicleIds.includes(yieldedVehId)) {
              wh.waitingQueueVehicleIds.push(yieldedVehId);
            }
          }
        }
      }
    }

    // 2. Assign free loading doors to waiting trucks (prioritizing trucks whose stock is available)
    if (wh.waitingQueueVehicleIds.length > 0) {
      for (const door of wh.doors) {
        if (door.occupiedByVehicleId !== null || door.reservedByVehicleId !== null) {
          continue;
        }
        // Find first waiting vehicle with available stock, or fallback to first in queue
        let chosenIdx = wh.waitingQueueVehicleIds.findIndex((vid) => {
          const t = wh.activeTasks.find((task) => task.vehicleId === vid);
          return t && wh.stored[t.cargoCategory] + 1e-6 >= t.requiredTons;
        });
        if (chosenIdx === -1) {
          chosenIdx = 0;
        }
        const nextVehId = wh.waitingQueueVehicleIds[chosenIdx];
        if (!nextVehId) break;

        const nextVeh = this.ownedVehicles.get(nextVehId);
        const nextTask = wh.activeTasks.find((t) => t.vehicleId === nextVehId);
        wh.waitingQueueVehicleIds.splice(chosenIdx, 1);

        if (nextVeh && nextTask) {
          door.occupiedByVehicleId = nextVeh.id;
          door.reservedByVehicleId = null;
          door.isOpen = true;
          nextVeh.assignedDoorId = door.id;
          nextVeh.worldX = door.stopWorldPos.wx;
          nextVeh.worldZ = door.stopWorldPos.wz;
          nextVeh.headingYaw = 0;
          nextVeh.currentSpeedKmh = 0;
          nextTask.doorId = door.id;
          nextTask.doorNumber = door.doorNumber;

          if (wh.stored[nextTask.cargoCategory] + 1e-6 < nextTask.requiredTons) {
            nextTask.status = 'WAITING_FOR_STOCK';
            nextVeh.deliveryPhase = 'WAITING_FOR_STOCK';
            nextVeh.state = 'WAITING_FOR_STOCK';
          } else {
            nextTask.status = 'WAITING_FOR_FORKLIFT';
            nextVeh.deliveryPhase = 'WAITING_FOR_FORKLIFT';
            nextVeh.state = 'DOCKING_AT_DOOR';
          }
        }
      }
    }

    // 3. Re-evaluate any docked tasks in WAITING_FOR_STOCK (in case stock was added/restocked)
    for (const task of wh.activeTasks) {
      if (task.status === 'WAITING_FOR_STOCK' && task.doorId) {
        if (wh.stored[task.cargoCategory] + 1e-6 >= task.requiredTons) {
          task.status = 'WAITING_FOR_FORKLIFT';
          const veh = this.ownedVehicles.get(task.vehicleId);
          if (veh) {
            veh.deliveryPhase = 'WAITING_FOR_FORKLIFT';
            veh.state = 'DOCKING_AT_DOOR';
          }
        }
      }
    }

    // 4. Assign idle operational forklifts to tasks in WAITING_FOR_FORKLIFT
    for (const task of wh.activeTasks) {
      if (task.status !== 'WAITING_FOR_FORKLIFT' || !task.doorId) continue;

      // Double-check stock before dispatching forklift
      if (wh.stored[task.cargoCategory] + 1e-6 < task.requiredTons) {
        task.status = 'WAITING_FOR_STOCK';
        const veh = this.ownedVehicles.get(task.vehicleId);
        if (veh) {
          veh.deliveryPhase = 'WAITING_FOR_STOCK';
          veh.state = 'WAITING_FOR_STOCK';
        }
        continue;
      }

      const idleForklift = wh.forklifts.find(
        (fl) => fl.state === 'IDLE_PARKED' && fl.assignedTaskId === null
      );
      if (!idleForklift) continue;

      const door = wh.doors.find((d) => d.id === task.doorId);
      if (!door) continue;

      // Reserve cargo from Warehouse 1 inventory when the forklift picks it up
      const consumed = this.consumeWarehouseCargo(
        wh.id,
        task.cargoCategory,
        task.requiredTons
      );
      if (!consumed.success) {
        task.status = 'WAITING_FOR_STOCK';
        const veh = this.ownedVehicles.get(task.vehicleId);
        if (veh) {
          veh.deliveryPhase = 'WAITING_FOR_STOCK';
          veh.state = 'WAITING_FOR_STOCK';
        }
        continue;
      }

      task.status = 'LOADING';
      task.forkliftId = idleForklift.id;
      task.doorNumber = door.doorNumber;

      const veh = this.ownedVehicles.get(task.vehicleId);
      if (veh) {
        veh.deliveryPhase = 'LOADING_AT_WAREHOUSE';
        veh.state = 'LOADING_AT_DOOR';
        veh.statusMessage = `Loading ${task.requiredTons.toFixed(1)}t ${task.cargoCategory} at Door #${door.doorNumber} via Forklift #${idleForklift.forkliftNumber}.`;
      }

      idleForklift.state = 'PICKING_CARGO';
      idleForklift.assignedTaskId = task.id;
      idleForklift.targetDoorId = door.id;
      idleForklift.targetVehicleId = task.vehicleId;
      idleForklift.carryingCategory = task.cargoCategory;
      idleForklift.carryingTons = task.requiredTons;
      idleForklift.phaseProgress = 0;
    }

    // 5. Animate loading door roll-up shutters smoothly
    for (const door of wh.doors) {
      door.isOpen = door.occupiedByVehicleId !== null;
      const targetRatio = door.isOpen ? 1 : 0;
      if (Math.abs(door.openRatio - targetRatio) > 0.005) {
        door.openRatio +=
          Math.sign(targetRatio - door.openRatio) *
          Math.min(Math.abs(targetRatio - door.openRatio), dt * 2.8);
      } else {
        door.openRatio = targetRatio;
      }
    }

    // 6. Step all operational forklifts (Strictly demand-driven: IDLE_PARKED forklifts never move!)
    for (const fl of wh.forklifts) {
      if (fl.state === 'IDLE_PARKED') {
        fl.worldPos.wx = fl.homeWorldPos.wx;
        fl.worldPos.wy = fl.homeWorldPos.wy;
        fl.worldPos.wz = fl.homeWorldPos.wz;
        fl.worldX = fl.worldPos.wx;
        fl.worldY = fl.worldPos.wy;
        fl.worldZ = fl.worldPos.wz;
        fl.headingYaw = 0;
        fl.forkHeightRatio = 0;
        fl.carryingCategory = null;
        fl.carryingTons = 0;
        continue;
      }

      const task = fl.assignedTaskId
        ? wh.activeTasks.find((t) => t.id === fl.assignedTaskId)
        : undefined;
      const door = fl.targetDoorId
        ? wh.doors.find((d) => d.id === fl.targetDoorId)
        : undefined;

      // Internal storage rack pickup point (slightly behind the forklift's home bay)
      const rackPos = {
        wx: fl.homeWorldPos.wx,
        wy: fl.homeWorldPos.wy,
        wz: fl.homeWorldPos.wz + 1.8,
      };
      const doorThresholdPos = door
        ? {
            wx: door.thresholdWorldPos.wx,
            wy: door.thresholdWorldPos.wy,
            wz: door.thresholdWorldPos.wz,
          }
        : fl.homeWorldPos;

      if (fl.state === 'PICKING_CARGO') {
        fl.phaseProgress = Math.min(1, fl.phaseProgress + dt / 0.65);
        const t = fl.phaseProgress;
        fl.worldPos.wx =
          fl.homeWorldPos.wx + (rackPos.wx - fl.homeWorldPos.wx) * t;
        fl.worldPos.wz =
          fl.homeWorldPos.wz + (rackPos.wz - fl.homeWorldPos.wz) * t;
        fl.headingYaw = Math.PI;
        fl.forkHeightRatio = Math.sin(t * Math.PI * 0.5) * 0.65;
        fl.wheelRotationRad = (fl.wheelRotationRad + dt * 9.0) % (Math.PI * 200);

        if (fl.phaseProgress >= 1) {
          fl.state = 'MOVING_TO_DOOR';
          fl.phaseProgress = 0;
        }
      } else if (fl.state === 'MOVING_TO_DOOR') {
        fl.phaseProgress = Math.min(1, fl.phaseProgress + dt / 0.7);
        const t = fl.phaseProgress;
        const prevWx = fl.worldPos.wx;
        const prevWz = fl.worldPos.wz;
        fl.worldPos.wx =
          rackPos.wx + (doorThresholdPos.wx - rackPos.wx) * t;
        fl.worldPos.wz =
          rackPos.wz + (doorThresholdPos.wz - rackPos.wz) * t;
        const dx = fl.worldPos.wx - prevWx;
        const dz = fl.worldPos.wz - prevWz;
        if (Math.hypot(dx, dz) > 0.0001) {
          fl.headingYaw = Math.atan2(dx, dz);
        }
        fl.forkHeightRatio = 0.45;
        fl.wheelRotationRad = (fl.wheelRotationRad + dt * 11.0) % (Math.PI * 200);

        if (fl.phaseProgress >= 1) {
          fl.state = 'LOADING_TRUCK';
          fl.phaseProgress = 0;
        }
      } else if (fl.state === 'LOADING_TRUCK') {
        fl.phaseProgress = Math.min(1, fl.phaseProgress + dt / 0.75);
        const t = fl.phaseProgress;
        fl.worldPos.wx = doorThresholdPos.wx;
        fl.worldPos.wz = doorThresholdPos.wz - Math.sin(t * Math.PI) * 0.55;
        fl.headingYaw = Math.PI;
        fl.forkHeightRatio = 0.45 + Math.sin(t * Math.PI) * 0.55;
        fl.wheelRotationRad = (fl.wheelRotationRad + dt * 5.0) % (Math.PI * 200);

        if (task) {
          task.loadedTons = Number((task.requiredTons * t).toFixed(2));
          const veh = this.ownedVehicles.get(task.vehicleId);
          if (veh) {
            veh.carryingCargoTons = task.loadedTons;
            veh.routeProgressRatio = 0.15 + t * 0.1;
            if (veh.assignedContractId) {
              const c = this.contracts.get(veh.assignedContractId);
              if (c) c.progressRatio = veh.routeProgressRatio;
            }
          }
        }

        if (fl.phaseProgress >= 1) {
          // Cargo transfer into the truck is complete & verified!
          if (task) {
            task.loadedTons = task.requiredTons;
            task.status = 'COMPLETED';
            const veh = this.ownedVehicles.get(task.vehicleId);
            if (veh) {
              veh.carryingCargoTons = task.requiredTons;
              veh.cargoLoadedVerified = true;
              veh.deliveryPhase = 'TO_DESTINATION';
              veh.state = 'EN_ROUTE_OUTBOUND';
              veh.statusMessage = `Loaded ${task.requiredTons.toFixed(1)}t ${task.cargoCategory} — en route to destination.`;
              veh.assignedDoorId = undefined;
              veh.loadingTaskId = undefined;

              const outboundWps =
                this.buildWaypointsWarehouseDoorToDestination(
                  veh.worldX,
                  veh.worldZ
                );
              this.assignWaypointsToVehicle(veh, outboundWps);
            }
          }

          if (door) {
            door.occupiedByVehicleId = null;
            door.reservedByVehicleId = null;
            door.isOpen = false;
          }

          // Remove completed task from activeTasks
          if (task) {
            wh.activeTasks = wh.activeTasks.filter((t) => t.id !== task.id);
          }

          fl.carryingCategory = null;
          fl.carryingTons = 0;
          fl.assignedTaskId = null;
          fl.targetVehicleId = null;
          fl.state = 'RETURNING_TO_PARKING';
          fl.phaseProgress = 0;
        }
      } else if (fl.state === 'RETURNING_TO_PARKING') {
        fl.phaseProgress = Math.min(1, fl.phaseProgress + dt / 0.65);
        const t = fl.phaseProgress;
        const startWx = doorThresholdPos.wx;
        const startWz = doorThresholdPos.wz;
        const prevWx = fl.worldPos.wx;
        const prevWz = fl.worldPos.wz;
        fl.worldPos.wx =
          startWx + (fl.homeWorldPos.wx - startWx) * t;
        fl.worldPos.wz =
          startWz + (fl.homeWorldPos.wz - startWz) * t;
        const dx = fl.worldPos.wx - prevWx;
        const dz = fl.worldPos.wz - prevWz;
        if (Math.hypot(dx, dz) > 0.0001) {
          fl.headingYaw = Math.atan2(dx, dz);
        }
        fl.forkHeightRatio = Math.max(0, 0.3 * (1 - t));
        fl.wheelRotationRad = (fl.wheelRotationRad + dt * 9.5) % (Math.PI * 200);

        if (fl.phaseProgress >= 1) {
          fl.worldPos.wx = fl.homeWorldPos.wx;
          fl.worldPos.wz = fl.homeWorldPos.wz;
          fl.headingYaw = 0;
          fl.forkHeightRatio = 0;
          fl.targetDoorId = null;
          fl.state = 'IDLE_PARKED';
          fl.phaseProgress = 0;
        }
      }

      fl.worldX = fl.worldPos.wx;
      fl.worldY = fl.worldPos.wy;
      fl.worldZ = fl.worldPos.wz;
    }

    syncWarehouseForkliftEntities(wh, this.entities, this.grid);
    this.updateWarehouseOperationalSummary(wh);
  }

  private updateWarehouseOperationalSummary(wh: WarehouseFacilityState): void {
    wh.activeLoadingTasks = wh.activeTasks.filter((t) => t.status === 'LOADING');
    wh.waitingTruckIds = [...wh.waitingQueueVehicleIds];
    const loadingCount = wh.activeLoadingTasks.length;
    const stockWaitCount = wh.activeTasks.filter(
      (t) => t.status === 'WAITING_FOR_STOCK'
    ).length;
    const queueCount = wh.waitingQueueVehicleIds.length;
    const busyForklifts = wh.forklifts.filter(
      (f) => f.state !== 'IDLE_PARKED'
    ).length;

    if (stockWaitCount > 0) {
      wh.operationalStatus = 'STOCK_SHORTAGE';
      const shortageTask = wh.activeTasks.find(
        (t) => t.status === 'WAITING_FOR_STOCK'
      );
      wh.statusMessage = shortageTask
        ? `Stock shortage: awaiting ${shortageTask.requiredTons.toFixed(1)}t ${shortageTask.cargoCategory} cargo for truck loading.`
        : 'Waiting for cargo stock replenishment.';
    } else if (loadingCount > 0) {
      wh.operationalStatus = 'ACTIVE_LOADING';
      wh.statusMessage = `Loading ${loadingCount} truck(s) with ${busyForklifts}/${wh.operationalForkliftCount} active forklift(s).`;
    } else if (queueCount > 0) {
      wh.operationalStatus = 'QUEUED';
      wh.statusMessage = `${queueCount} truck(s) queued for next available loading door.`;
    } else {
      wh.operationalStatus = 'OPERATIONAL';
      wh.statusMessage = `${wh.operationalDoorCount} loading doors & ${wh.operationalForkliftCount} forklifts ready.`;
    }
  }

  private sampleAlongWaypoints(
    wps: WorldWaypoint[],
    dist: number
  ): {
    wx: number;
    wy: number;
    wz: number;
    yaw: number;
    isTurning: boolean;
    turnSignal: 'NONE' | 'LEFT' | 'RIGHT';
  } {
    if (wps.length === 0) {
      return {
        wx: 0,
        wy: 1.3,
        wz: 0,
        yaw: 0,
        isTurning: false,
        turnSignal: 'NONE',
      };
    }
    if (wps.length === 1 || dist <= 0) {
      const dx = (wps[1]?.wx ?? wps[0].wx + 1) - wps[0].wx;
      const dz = (wps[1]?.wz ?? wps[0].wz) - wps[0].wz;
      return {
        wx: wps[0].wx,
        wy: wps[0].wy,
        wz: wps[0].wz,
        yaw: Math.atan2(dx, dz),
        isTurning: false,
        turnSignal: 'NONE',
      };
    }

    let accum = 0;
    for (let i = 1; i < wps.length; i++) {
      const a = wps[i - 1];
      const b = wps[i];
      const segLen = Math.hypot(b.wx - a.wx, b.wz - a.wz);
      if (accum + segLen >= dist || i === wps.length - 1) {
        const t = segLen > 0.001 ? Math.min(1, (dist - accum) / segLen) : 1;
        const wx = a.wx + (b.wx - a.wx) * t;
        const wy = a.wy + (b.wy - a.wy) * t;
        const wz = a.wz + (b.wz - a.wz) * t;
        let yaw = Math.atan2(b.wx - a.wx, b.wz - a.wz);

        // Smooth heading interpolation across waypoint corners for realistic turning kinematics
        const distFromStart = t * segLen;
        const distToEnd = (1 - t) * segLen;
        const cornerBlendRadius = 2.4;
        if (distFromStart < cornerBlendRadius && i >= 2) {
          const prev = wps[i - 2];
          const prevYaw = Math.atan2(a.wx - prev.wx, a.wz - prev.wz);
          let diff = yaw - prevYaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const blend = 0.5 + 0.5 * (distFromStart / cornerBlendRadius);
          yaw = prevYaw + diff * blend;
        } else if (distToEnd < cornerBlendRadius && i + 1 < wps.length) {
          const next = wps[i + 1];
          const nextYaw = Math.atan2(next.wx - b.wx, next.wz - b.wz);
          let diff = nextYaw - yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const blend = 0.5 * (1 - distToEnd / cornerBlendRadius);
          yaw = yaw + diff * blend;
        }

        const isTurning = Boolean(b.isRoundabout || b.isRamp);
        const turnSignal = b.isRoundabout
          ? 'RIGHT'
          : b.isRamp
            ? 'LEFT'
            : 'NONE';
        return { wx, wy, wz, yaw, isTurning, turnSignal };
      }
      accum += segLen;
    }

    const last = wps[wps.length - 1];
    return {
      wx: last.wx,
      wy: last.wy,
      wz: last.wz,
      yaw: 0,
      isTurning: false,
      turnSignal: 'NONE',
    };
  }

  /**
   * Returns the authoritative manifest of the 5 Core Starting Facilities in the world.
   */
  public getCoreStartingFacilities(): Array<{
    key: 'PORT' | 'DELIVERY_HEADQUARTERS' | 'RAILWAY_YARD' | 'AIRPORT' | 'TRUCK_DEPOT';
    id: string;
    name: string;
    gx: number;
    gz: number;
    widthCells: number;
    depthCells: number;
  }> {
    const hq = this.placedBuildings.get('building-city-hq-tower');
    const portWh = this.placedBuildings.get('facility-port-warehouse-1');
    const depot = this.placedBuildings.get(TRUCK_DEPOT_ID);
    return [
      {
        key: 'PORT',
        id: portWh?.id ?? 'port-harbour-starter',
        name: 'Port & Quayside Container Terminal',
        gx: portWh?.gx ?? 84,
        gz: portWh?.gz ?? 90,
        widthCells: portWh?.widthCells ?? 12,
        depthCells: portWh?.depthCells ?? 6,
      },
      {
        key: 'DELIVERY_HEADQUARTERS',
        id: hq?.id ?? 'building-city-hq-tower',
        name: hq?.name ?? 'Delivery Headquarters',
        gx: hq?.gx ?? 78,
        gz: hq?.gz ?? 44,
        widthCells: hq?.widthCells ?? 5,
        depthCells: hq?.depthCells ?? 7,
      },
      {
        key: 'RAILWAY_YARD',
        id: 'rail-depot-starter',
        name: 'Railway Yard & Locomotive Depot',
        gx: 21,
        gz: 48,
        widthCells: 4,
        depthCells: 6,
      },
      {
        key: 'AIRPORT',
        id: AIRPORT_CARGO_TERMINAL_FOOTPRINT.id,
        name: 'Cargo Airport Complex',
        gx: this.airport.cargoTerminalBounds.minGx,
        gz: this.airport.cargoTerminalBounds.minGz,
        widthCells: AIRPORT_CARGO_TERMINAL_FOOTPRINT.widthCells,
        depthCells: AIRPORT_CARGO_TERMINAL_FOOTPRINT.depthCells,
      },
      {
        key: 'TRUCK_DEPOT',
        id: depot?.id ?? TRUCK_DEPOT_ID,
        name: depot?.name ?? 'Westgate Truck Depot',
        gx: depot?.gx ?? 46,
        gz: depot?.gz ?? 50,
        widthCells: depot?.widthCells ?? 4,
        depthCells: depot?.depthCells ?? 3,
      },
    ];
  }

  public getPlacedBuilding(id: string): PlacedBuildingRecord | undefined {
    return this.placedBuildings.get(id);
  }

  private completeContractForVehicle(v: OwnedVehicleRecord): void {
    // Safety verification: Road vehicles must have loaded their cargo from Warehouse 1 before completing delivery
    const cId = v.assignedContractId;
    if (cId) {
      const contract = this.contracts.get(cId);
      if (
        contract &&
        contract.status === 'ACTIVE' &&
        (v.modal !== 'ROAD' ||
          (v.cargoLoadedVerified && v.carryingCargoTons >= contract.cargoTons - 1e-3))
      ) {
        const completionKey = `${contract.id}-${contract.completedCount + 1}`;
        if (!this.completedContractKeys.has(completionKey)) {
          this.completedContractKeys.add(completionKey);
          contract.completedCount++;
          contract.status = 'AVAILABLE'; // Ready for next dispatch cycle
          contract.progressRatio = 0;
          contract.assignedVehicleId = undefined;

          this.recordTransactionInternal(
            'CONTRACT_REWARD',
            'INCOME',
            contract.cashReward,
            `Completed Contract: ${contract.title}`,
            v.id,
            contract.id
          );
          this.awardXp(contract.xpReward, `Completed ${contract.title}`);
        }
      }
    }

    // Restore vehicle to its home facility & designated parking slot
    v.assignedContractId = undefined;
    v.carryingCargoType = undefined;
    v.carryingCargoCategory = undefined;
    v.carryingCargoTons = 0;
    v.cargoLoadedVerified = false;
    v.deliveryPhase = undefined;
    v.targetWarehouseId = undefined;
    v.assignedDoorId = undefined;
    v.loadingTaskId = undefined;
    v.state = v.maintenanceOverdue ? 'MAINTENANCE_DUE' : 'IDLE_AT_DEPOT';
    v.currentSpeedKmh = 0;
    v.routeProgressRatio = 0;

    const depotSlot =
      v.modal === 'ROAD' && this.truckDepot
        ? this.truckDepot.slots.find(
            (s) =>
              s.assignedVehicleId === v.id ||
              s.slotNumber === v.assignedDepotSlotNumber
          )
        : undefined;

    if (depotSlot) {
      depotSlot.assignedVehicleId = v.id;
      depotSlot.occupancyState = 'PARKED';
      v.assignedDepotSlotId = depotSlot.slotId;
      v.assignedDepotSlotNumber = depotSlot.slotNumber;
      v.worldX = depotSlot.worldX;
      v.worldY = 1.26;
      v.worldZ = depotSlot.worldZ;
      v.headingYaw = depotSlot.headingYaw;
      v.trailerWorldX = depotSlot.worldX;
      v.trailerWorldZ = depotSlot.worldZ - 1.5;
      v.trailerYaw = depotSlot.headingYaw;
      v.statusMessage = `Returned to ${this.truckDepot.name} (Slot #${depotSlot.slotNumber}).`;
    } else {
      const depot = this.placedBuildings.get(v.homeFacilityId);
      const wp = this.grid.gridToWorld(
        depot ? depot.gx + 1 : 48,
        depot ? depot.gz + 3 : 55
      );
      v.worldX = wp.x;
      v.worldZ = wp.z;
      v.trailerWorldX = wp.x - 2.2;
      v.trailerWorldZ = wp.z;
    }
  }

  private stepAmbientVehicle(av: AmbientTrafficVehicle, dt: number): void {
    const hw = this.config.highway;
    const minWz = this.grid.gridToWorld(hw.startX, hw.visibleStartZ).z;
    const maxWz = this.grid.gridToWorld(hw.startX, hw.visibleEndZ).z;
    const hwCenterWorld = this.grid.gridToWorld(
      (hw.startX + hw.endX) * 0.5,
      55
    );

    if (av.routeMode === 'MOTORWAY_MAIN') {
      // Strictly ~25 km/h target speed on the motorway
      const speedWorld = (av.targetSpeedKmh / 25.0) * 6.94;
      const dz = speedWorld * dt * av.direction;
      av.worldZ += dz;
      av.wheelRotationRad = (av.wheelRotationRad + Math.abs(dz) / 0.27) % (Math.PI * 200);

      // Smooth progressive lane changes within the 4 lanes of the same direction
      const side = av.direction === 1 ? -1 : 1;
      av.laneChangeTimer -= dt;
      if (av.laneChangeTimer <= 0) {
        av.laneChangeTimer = 7.5 + Math.random() * 6.0;
        const newLaneInDir = 1 + Math.floor(Math.random() * 4);
        av.targetLaneX = hwCenterWorld.x + side * (newLaneInDir - 0.5) * 2.1;
      }

      // Smoothly deflect motorway traffic into the 3 concentric circulating lanes
      // of the Highway-City Interchange Roundabout at (143.5, 55) so vehicles never clip the central island!
      const relZ = av.worldZ - hwCenterWorld.z;
      const roundaboutInfluenceZ = 15.8;
      let effectiveTargetX = av.targetLaneX;
      if (Math.abs(relZ) < roundaboutInfluenceZ) {
        const normZ = relZ / roundaboutInfluenceZ; // -1 .. +1
        const arcFactor = Math.cos(normZ * Math.PI * 0.5); // 0 at taper throat -> 1 at roundabout equator
        const baseLaneOffset = Math.max(
          1.05,
          Math.abs(av.targetLaneX - hwCenterWorld.x)
        );
        // Map into the 3 circulating lanes (radii 7.1m .. 12.1m)
        const circulatingRadius = Math.max(
          7.1 + ((av.laneIndex % 3) * 2.2),
          baseLaneOffset
        );
        const desiredOffset =
          baseLaneOffset * (1 - arcFactor) + circulatingRadius * arcFactor;
        effectiveTargetX = hwCenterWorld.x + side * desiredOffset;
      }

      const lateralDiff = effectiveTargetX - av.worldX;
      if (Math.abs(lateralDiff) > 0.03) {
        const maxLatRate = Math.abs(relZ) < roundaboutInfluenceZ ? 6.5 : 1.4;
        const latStep =
          Math.sign(lateralDiff) * Math.min(Math.abs(lateralDiff), maxLatRate * dt);
        av.worldX += latStep;
        av.turnSignal = lateralDiff > 0 ? 'RIGHT' : 'LEFT';
        av.headingYaw =
          (av.direction === 1 ? 0 : Math.PI) +
          Math.atan2(latStep, Math.abs(dz) + 0.001) * 0.65;
      } else {
        av.turnSignal = 'NONE';
        av.headingYaw = av.direction === 1 ? 0 : Math.PI;
      }

      // Progressive trailer articulation following the tractor
      const hitchOffset = 2.4;
      const targetTx = av.worldX - Math.sin(av.headingYaw) * hitchOffset;
      const targetTz = av.worldZ - Math.cos(av.headingYaw) * hitchOffset;
      av.trailerWorldX += (targetTx - av.trailerWorldX) * Math.min(1, dt * 8.5);
      av.trailerWorldZ += (targetTz - av.trailerWorldZ) * Math.min(1, dt * 8.5);
      av.trailerYaw += (av.headingYaw - av.trailerYaw) * Math.min(1, dt * 6.0);

      // Wrap smoothly at visible motorway portals (simulating continuous offscreen corridor)
      if (av.direction === 1 && av.worldZ > maxWz - 2) {
        av.worldZ = minWz + 2;
        av.trailerWorldZ = av.worldZ - hitchOffset;
      } else if (av.direction === -1 && av.worldZ < minWz + 2) {
        av.worldZ = maxWz - 2;
        av.trailerWorldZ = av.worldZ + hitchOffset;
      }
      return;
    }

    if (av.routeMode === 'ROUNDABOUT_RAMP_LOOP') {
      // Smooth continuous figure-8 / dumbbell interchange loop across:
      // Highway-City Interchange Roundabout (143.5, 55) <-> Multi-Lane Arterial <-> Central City Roundabout (86, 55)
      av.loopProgress = (av.loopProgress + dt * 0.036) % 1.0;
      const rbCenter = this.grid.gridToWorld(
        this.config.coreCity.roundaboutCenterX,
        this.config.coreCity.roundaboutCenterZ
      );
      const rCentralMid = 7.3; // Middle lane of the 3-lane Central Roundabout (inner 4.0 .. outer 10.6)
      const rHwyMid = 9.5; // Middle lane of the 3-lane Highway-City Interchange Roundabout (inner 5.6 .. outer 13.4)
      const p = av.loopProgress;

      let nextX = rbCenter.x;
      let nextZ = rbCenter.z;

      if (p < 0.25) {
        // Westbound along Multi-Lane Highway-City Arterial from Highway Roundabout exit taper to Central Roundabout entry taper
        const t = p / 0.25;
        nextX =
          (hwCenterWorld.x - rHwyMid) * (1 - t) +
          (rbCenter.x + rCentralMid) * t;
        nextZ = rbCenter.z - 1.65;
      } else if (p < 0.5) {
        // Circulating counter-clockwise around the 3-lane Central City Roundabout (86, 55)
        const t = (p - 0.25) / 0.25;
        const angle = -Math.PI * 0.08 - t * Math.PI * 1.84;
        nextX = rbCenter.x + Math.cos(angle) * rCentralMid;
        nextZ = rbCenter.z + Math.sin(angle) * rCentralMid;
      } else if (p < 0.75) {
        // Eastbound along Multi-Lane Highway-City Arterial from Central Roundabout exit taper to Highway Roundabout entry taper
        const t = (p - 0.5) / 0.25;
        nextX =
          (rbCenter.x + rCentralMid) * (1 - t) +
          (hwCenterWorld.x - rHwyMid) * t;
        nextZ = rbCenter.z + 1.65;
      } else {
        // Circulating counter-clockwise around the 3-lane Highway-City Interchange Roundabout (143.5, 55)
        const t = (p - 0.75) / 0.25;
        const angle = Math.PI * 0.92 - t * Math.PI * 1.84;
        nextX = hwCenterWorld.x + Math.cos(angle) * rHwyMid;
        nextZ = hwCenterWorld.z + Math.sin(angle) * rHwyMid;
      }

      const dx = nextX - av.worldX;
      const dz = nextZ - av.worldZ;
      const stepDist = Math.hypot(dx, dz);
      if (stepDist > 0.001 && stepDist < 15) {
        av.headingYaw = Math.atan2(dx, dz);
        av.wheelRotationRad = (av.wheelRotationRad + stepDist / 0.27) % (Math.PI * 200);
      }
      av.worldX = nextX;
      av.worldZ = nextZ;

      const hitch = 2.2;
      const tx = av.worldX - Math.sin(av.headingYaw) * hitch;
      const tz = av.worldZ - Math.cos(av.headingYaw) * hitch;
      if (Math.hypot(tx - av.trailerWorldX, tz - av.trailerWorldZ) > 12) {
        av.trailerWorldX = tx;
        av.trailerWorldZ = tz;
        av.trailerYaw = av.headingYaw;
      } else {
        av.trailerWorldX += (tx - av.trailerWorldX) * Math.min(1, dt * 7.5);
        av.trailerWorldZ += (tz - av.trailerWorldZ) * Math.min(1, dt * 7.5);
        av.trailerYaw = Math.atan2(
          av.worldX - av.trailerWorldX,
          av.worldZ - av.trailerWorldZ
        );
      }
      return;
    }

    if (av.routeMode === 'RAIL_LINE') {
      const pMin = this.grid.gridToWorld(26, 40);
      const pMax = this.grid.gridToWorld(26, 70);
      av.worldZ += av.direction * 6.5 * dt;
      av.wheelRotationRad += 6.5 * dt * 3.2;
      if (av.worldZ > pMax.z) {
        av.worldZ = pMax.z;
        av.direction = -1;
      } else if (av.worldZ < pMin.z) {
        av.worldZ = pMin.z;
        av.direction = 1;
      }
      av.headingYaw = av.direction === 1 ? 0 : Math.PI;
      return;
    }

    if (av.routeMode === 'SEA_CHANNEL') {
      const pMin = this.grid.gridToWorld(56, 103);
      const pMax = this.grid.gridToWorld(108, 103);
      av.worldX += av.direction * 4.2 * dt;
      if (av.worldX > pMax.x) {
        av.worldX = pMax.x;
        av.direction = -1;
      } else if (av.worldX < pMin.x) {
        av.worldX = pMin.x;
        av.direction = 1;
      }
      av.headingYaw = av.direction === 1 ? Math.PI * 0.5 : -Math.PI * 0.5;
      return;
    }

    if (av.routeMode === 'AIR_RUNWAY') {
      const pMin = this.grid.gridToWorld(
        this.airport.runwayStartGx + 2,
        this.airport.runwayGz
      );
      const pMax = this.grid.gridToWorld(
        this.airport.runwayEndGx - 2,
        this.airport.runwayGz
      );
      av.worldX += av.direction * 8.5 * dt;
      av.wheelRotationRad += 18 * dt;
      if (av.worldX > pMax.x) {
        av.worldX = pMax.x;
        av.direction = -1;
      } else if (av.worldX < pMin.x) {
        av.worldX = pMin.x;
        av.direction = 1;
      }
      av.headingYaw = av.direction === 1 ? Math.PI * 0.5 : -Math.PI * 0.5;
    }
  }

  // ===========================================================================
  // GETTERS & SAVE/LOAD SERIALIZATION
  // ===========================================================================

  public getOwnedVehicles(): OwnedVehicleRecord[] {
    return Array.from(this.ownedVehicles.values());
  }

  public getOwnedVehicle(id: string): OwnedVehicleRecord | undefined {
    return this.ownedVehicles.get(id);
  }

  public getAmbientVehicles(): AmbientTrafficVehicle[] {
    return this.ambientVehicles;
  }

  public getContracts(): TransportContractRecord[] {
    return Array.from(this.contracts.values());
  }

  public getAirport(): AirportInfrastructureRecord {
    if (this.airportOps) {
      this.airport = buildAirportInfrastructureRecord(
        this.config,
        this.grid,
        this.level,
        this.airportOwned,
        this.airportLevel,
        this.airportOps.getStandRuntimeOverlay()
      );
    }
    return this.airport;
  }

  public getBuildingCatalogue(): BuildingCatalogueItem[] {
    return BUILDING_CATALOGUE;
  }

  public getVehicleCatalogue(): VehicleCatalogueItem[] {
    return VEHICLE_CATALOGUE;
  }

  public serializeEconomyState(): SerializedEconomyState {
    return {
      money: this.money,
      totalEarnings: this.totalEarnings,
      totalSpending: this.totalSpending,
      xp: this.xp,
      level: this.level,
      transactions: [...this.transactions],
      placedBuildings: Array.from(this.placedBuildings.values()).map((b) => ({
        ...b,
      })),
      warehouses: Array.from(this.warehouses.values()).map((wh) => ({
        ...wh,
        capacities: { ...wh.capacities },
        stored: { ...wh.stored },
        doors: wh.doors.map((d) => ({
          ...d,
          worldPos: { ...d.worldPos },
          approachWorldPos: { ...d.approachWorldPos },
          stopWorldPos: { ...d.stopWorldPos },
          thresholdWorldPos: { ...d.thresholdWorldPos },
        })),
        forklifts: wh.forklifts.map((f) => ({
          ...f,
          homeWorldPos: { ...f.homeWorldPos },
          worldPos: { ...f.worldPos },
        })),
        activeTasks: wh.activeTasks.map((t) => ({ ...t })),
        waitingQueueVehicleIds: [...wh.waitingQueueVehicleIds],
      })),
      ownedVehicles: Array.from(this.ownedVehicles.values()).map((v) => ({
        ...v,
        waypoints: v.waypoints.map((w) => ({ ...w })),
      })),
      contracts: Array.from(this.contracts.values()).map((c) => ({ ...c })),
      completedContractIds: Array.from(this.completedContractKeys.values()),
      truckDepot: this.truckDepot
        ? {
            ...this.truckDepot,
            slots: this.truckDepot.slots.map((s) => ({ ...s })),
            unusedReservedProps: this.truckDepot.unusedReservedProps.map((p) => ({
              ...p,
            })),
          }
        : undefined,
      airport: {
        owned: this.airportOwned,
        level: this.airportLevel,
      },
      airportOwned: this.airportOwned,
      airportLevel: this.airportLevel,
      hangar1Purchased: Boolean(this.airportOps.getHangar('HANGAR_1')?.constructed),
      hangar2Purchased: Boolean(this.airportOps.getHangar('HANGAR_2')?.constructed),
      ownedAircraftCount: this.airportOps.getPlayerAircraftCount(),
      activeApronStandCount: this.airportOps.getPurchasedStandIds().length,
      airportLogistics: this.airportOps.serializeState(),
      railHub: this.railways.serializeHubState(),
    };
  }

  public deserializeEconomyState(data?: Partial<SerializedEconomyState>): void {
    if (!data) return;
    if (typeof data.money === 'number') this.money = data.money;
    if (typeof data.totalEarnings === 'number')
      this.totalEarnings = data.totalEarnings;
    if (typeof data.totalSpending === 'number')
      this.totalSpending = data.totalSpending;
    if (typeof data.xp === 'number') this.xp = data.xp;
    if (typeof data.level === 'number') this.level = data.level;
    if (Array.isArray(data.transactions)) {
      this.transactions = data.transactions.map((t) => ({ ...t }));
    }

    if (Array.isArray(data.placedBuildings) && data.placedBuildings.length > 0) {
      const approvedPreplacedIds = new Set<string>([
        'building-city-hq-tower',
        'facility-port-warehouse-1',
        'facility-warehouse-1',
        TRUCK_DEPOT_ID,
        AIRPORT_CARGO_TERMINAL_FOOTPRINT.id,
        'facility-airport-warehouse',
        'facility-airport-transfer-yard',
        'facility-airport-hangar_1',
        'facility-airport-hangar_2',
      ]);
      this.placedBuildings.clear();
      for (const b of data.placedBuildings) {
        if (b.isPreplaced && !approvedPreplacedIds.has(b.id)) {
          continue;
        }
        const migratedBuilding: PlacedBuildingRecord =
          b.id === 'building-city-hq-tower'
            ? {
                ...b,
                name: 'Delivery Headquarters',
                widthCells: 5,
                depthCells: 7,
                gx: 78,
                gz: 44,
              }
            : { ...b };
        this.placedBuildings.set(migratedBuilding.id, migratedBuilding);
        if (!this.entities.has(migratedBuilding.id)) {
          const isWh =
            migratedBuilding.reservedMinGx !== undefined &&
            migratedBuilding.reservedMinGz !== undefined;
          const fp = isWh
            ? this.grid.getFootprint(
                migratedBuilding.reservedMinGx!,
                migratedBuilding.reservedMinGz!,
                (migratedBuilding.reservedMaxGx! - migratedBuilding.reservedMinGx!) + 1,
                (migratedBuilding.reservedMaxGz! - migratedBuilding.reservedMinGz!) + 1,
                0
              )
            : this.grid.getFootprint(
                migratedBuilding.gx,
                migratedBuilding.gz,
                migratedBuilding.widthCells,
                migratedBuilding.depthCells,
                migratedBuilding.orientation
              );
          this.entities.register({
            id: migratedBuilding.id,
            category:
              migratedBuilding.id === 'facility-warehouse-1'
                ? 'WAREHOUSE_FACILITY'
                : 'STARTER_BUILDING',
            type: migratedBuilding.catalogueId,
            position: { gx: migratedBuilding.gx, gz: migratedBuilding.gz },
            footprint: fp.cells,
            orientation: migratedBuilding.orientation,
            elevation:
              this.terrainWater.getElevationAtGrid(
                migratedBuilding.gx,
                migratedBuilding.gz
              ) ?? 1.2,
            ownership: 'PLAYER',
            active: true,
            metadata: {
              name: migratedBuilding.name,
              catalogueId: migratedBuilding.catalogueId,
              widthCells: migratedBuilding.widthCells,
              depthCells: migratedBuilding.depthCells,
              category: migratedBuilding.category,
            },
          });
        }
      }
    }

    if (Array.isArray(data.warehouses) && data.warehouses.length > 0) {
      this.warehouses.clear();
      for (const wh of data.warehouses) {
        const restored: WarehouseFacilityState = {
          ...wh,
          capacities: { ...wh.capacities },
          stored: { ...wh.stored },
          doors: Array.isArray(wh.doors) ? wh.doors.map((d) => ({ ...d })) : [],
          forklifts: Array.isArray(wh.forklifts)
            ? wh.forklifts.map((f) => ({ ...f }))
            : [],
          activeTasks: Array.isArray(wh.activeTasks)
            ? wh.activeTasks.map((t) => ({ ...t }))
            : [],
          waitingQueueVehicleIds: Array.isArray(wh.waitingQueueVehicleIds)
            ? [...wh.waitingQueueVehicleIds]
            : [],
        };
        this.warehouses.set(restored.id, restored);
        // Recompute layout & capacities from saved level while preserving saved stored inventory
        this.applyWarehouseLevelInternal(restored, restored.level, false);
        restored.stored = {
          FOOD: Math.min(restored.capacities.FOOD, Math.max(0, wh.stored?.FOOD ?? 0)),
          INDUSTRIAL: Math.min(
            restored.capacities.INDUSTRIAL,
            Math.max(0, wh.stored?.INDUSTRIAL ?? 0)
          ),
          PACKAGES: Math.min(
            restored.capacities.PACKAGES,
            Math.max(0, wh.stored?.PACKAGES ?? 0)
          ),
        };
        this.syncWarehousePlacedBuildingTotals(restored);
      }
    } else if (this.warehouses.size === 0) {
      this.initializeWarehouse1();
    }

    if (Array.isArray(data.ownedVehicles) && data.ownedVehicles.length > 0) {
      this.ownedVehicles.clear();
      let airCount = 0;
      for (const v of data.ownedVehicles) {
        if (v.modal === 'AIR') {
          if (airCount >= MAX_PLAYER_AIRCRAFT) continue;
          airCount++;
        }
        this.ownedVehicles.set(v.id, {
          ...v,
          waypoints: Array.isArray(v.waypoints) ? v.waypoints : [],
        });
      }
    }

    // Restore 20-Level Truck Depot state & synchronize slot assignments with owned vehicles
    if (data.truckDepot && typeof data.truckDepot.level === 'number') {
      this.truckDepot = createInitialTruckDepotFacilityState(
        data.truckDepot.reservedMinGx ?? 38,
        data.truckDepot.reservedMinGz ?? 45,
        data.truckDepot.level
      );
      if (Array.isArray(data.truckDepot.slots)) {
        for (const savedSlot of data.truckDepot.slots) {
          const targetSlot = this.truckDepot.slots.find(
            (s) => s.slotNumber === savedSlot.slotNumber
          );
          if (targetSlot && targetSlot.unlocked) {
            targetSlot.assignedVehicleId = savedSlot.assignedVehicleId;
            targetSlot.occupancyState = savedSlot.occupancyState;
          }
        }
      }
      this.applyTruckDepotLevelInternal(data.truckDepot.level);
    } else {
      const savedDepotBld = this.placedBuildings.get(TRUCK_DEPOT_ID);
      const restoredLevel = savedDepotBld?.level ?? 1;
      this.truckDepot = createInitialTruckDepotFacilityState(38, 45, restoredLevel);
      this.applyTruckDepotLevelInternal(restoredLevel);
    }

    if (Array.isArray(data.contracts) && data.contracts.length > 0) {
      this.contracts.clear();
      for (const c of data.contracts) {
        this.contracts.set(c.id, { ...c });
      }
    }

    if (Array.isArray(data.completedContractIds)) {
      this.completedContractKeys = new Set(data.completedContractIds);
    }

    // Restore Airport state (owned / abandoned & level 0..20)
    const explicitOwned =
      typeof data.airportOwned === 'boolean'
        ? data.airportOwned
        : data.airport && typeof data.airport.owned === 'boolean'
          ? data.airport.owned
          : undefined;
    const explicitLevel =
      typeof data.airportLevel === 'number'
        ? data.airportLevel
        : data.airport && typeof data.airport.level === 'number'
          ? data.airport.level
          : undefined;

    if (typeof explicitOwned === 'boolean') {
      this.airportOwned = explicitOwned;
      this.airportLevel = explicitOwned
        ? Math.max(
            AIRPORT_MIN_LEVEL,
            Math.min(AIRPORT_MAX_LEVEL, explicitLevel || 1)
          )
        : 0;
      if (this.airportOwned) {
        this.parcels.acquireParcel('parcel-airport-reserve', 999);
        this.parcels.acquireParcel('parcel-airport-warehouse-reserve', 999);
        this.parcels.acquireParcel('parcel-airport-transfer-yard-reserve', 999);
      }
    } else {
      const apParcel = this.parcels.getParcelAt(
        this.config.airport.startX,
        this.config.airport.startZ
      );
      this.airportOwned = Boolean(apParcel?.owned);
      this.airportLevel = this.airportOwned ? 1 : 0;
    }

    const mergedLogistics: Partial<SerializedAirportLogisticsState> | undefined =
      data.airportLogistics
        ? {
            ...data.airportLogistics,
            hangar1Purchased:
              typeof data.hangar1Purchased === 'boolean'
                ? data.hangar1Purchased
                : data.airportLogistics.hangar1Purchased,
            hangar2Purchased:
              typeof data.hangar2Purchased === 'boolean'
                ? data.hangar2Purchased
                : data.airportLogistics.hangar2Purchased,
            ownedAircraftCount:
              typeof data.ownedAircraftCount === 'number'
                ? data.ownedAircraftCount
                : data.airportLogistics.ownedAircraftCount,
            activeApronStandCount:
              typeof data.activeApronStandCount === 'number'
                ? data.activeApronStandCount
                : data.airportLogistics.activeApronStandCount,
          }
        : typeof data.hangar1Purchased === 'boolean' ||
            typeof data.hangar2Purchased === 'boolean'
          ? {
              constructedHangars: [
                ...(data.hangar1Purchased ? (['HANGAR_1'] as HangarSlotId[]) : []),
                ...(data.hangar2Purchased ? (['HANGAR_2'] as HangarSlotId[]) : []),
              ],
              hangar1Purchased: data.hangar1Purchased,
              hangar2Purchased: data.hangar2Purchased,
            }
          : undefined;

    this.airportOps.deserializeState(
      mergedLogistics,
      this.airportLevel || 1
    );
    this.refreshAirportState();
    // Sync constructed hangars into placedBuildings & entities
    for (const h of this.airportOps.getHangars()) {
      const bldId = `facility-airport-${h.id.toLowerCase()}`;
      if (h.constructed) {
        this.placedBuildings.set(bldId, {
          id: bldId,
          catalogueId: 'bld-air-regional-hangar',
          name: h.name,
          category: 'AIRPORT',
          gx: h.bounds.minGx,
          gz: h.bounds.minGz,
          widthCells: h.bounds.widthCells,
          depthCells: h.bounds.depthCells,
          orientation: 0,
          level: 1,
          maxLevel: 1,
          storageCapacityTons: 120,
          storedCargoTons: 0,
          vehicleSlotCapacity: 0,
          isPreplaced: true,
          upgradeCost: 0,
        });
      } else {
        this.placedBuildings.delete(bldId);
      }
    }
    this.syncAirportFacilityBuildingsTotals();
    if (this.airportOwned) {
      this.ensureOperationalAirportAmbientTraffic();
    }
    if (data.railHub) {
      this.railways.deserializeHubState(data.railHub);
    }
  }
}

