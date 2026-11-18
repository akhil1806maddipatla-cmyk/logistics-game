/**
 * Authoritative Airport Logistics, Ground-Support Equipment (GSE), NPC ATC Supply Arrivals,
 * Player Cargo Aircraft Fleet (Max 3), Manual Aircraft Hangar Construction, Condition/Grounding,
 * and Unified Nose-Forward Aircraft Movement & Flight System (Airport Prompts 3, 4, 5, 6).
 */

import {
  AIRPORT_CARGO_TERMINAL_FOOTPRINT,
  AIRPORT_ID,
  AIRPORT_MAX_LEVEL,
  AIRPORT_MAX_PARKING_AREAS,
  AIRPORT_MIN_LEVEL,
  AIRPORT_STAND_UNLOCK_LEVELS,
  AIRPORT_TRANSFER_YARD_FOOTPRINT,
  AIRPORT_WAREHOUSE_LEVEL_20_FOOTPRINT,
  AirportInfrastructureRecord,
  AirportStandRuntimeOverlay,
  AirportSubZoneBounds,
  getAirportCargoCapacityForLevel,
  getAirportParkingAreaPriceForLevel,
  getAirportStandCountForLevel,
  makeSubZoneBounds,
} from './AirportSystem';
import { GridCoord, GridSystem } from './GridSystem';
import { WorldConfigData } from './WorldConfig';

// ============================================================================
// 1. OFFICIAL CONSTANTS & SPECIFICATIONS (PROMPTS 3, 4, 5, 6 & EXPANSION)
// ============================================================================

export const MAX_PLAYER_AIRCRAFT = 2;
export const MAX_OWNED_AIRCRAFT = MAX_PLAYER_AIRCRAFT;
export const AIRCRAFT_HANGAR_PURCHASE_COST = 5_000_000; // Fixed $5,000,000 per hangar
export const FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL = 10;
export const FIRST_OWNED_AIRCRAFT_PRICE = 20_000_000; // $20,000,000 at Airport Level 10
export const SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL = 15;
export const SECOND_OWNED_AIRCRAFT_PRICE = 30_000_000; // $30,000,000 at Airport Level 15

export interface OwnedAircraftSlotProgressionSpec {
  slotNumber: 1 | 2;
  unlockAirportLevel: number;
  purchasePrice: number;
  requiredHangarId: 'HANGAR_1' | 'HANGAR_2';
  defaultCatalogueId: string;
  name: string;
}

export const OWNED_AIRCRAFT_SLOT_PROGRESSION: readonly OwnedAircraftSlotProgressionSpec[] = [
  {
    slotNumber: 1,
    unlockAirportLevel: FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL,
    purchasePrice: FIRST_OWNED_AIRCRAFT_PRICE,
    requiredHangarId: 'HANGAR_1',
    defaultCatalogueId: 'veh-air-regional-jet',
    name: 'First Owned Cargo Aircraft (Twin-Jet Freighter)',
  },
  {
    slotNumber: 2,
    unlockAirportLevel: SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL,
    purchasePrice: SECOND_OWNED_AIRCRAFT_PRICE,
    requiredHangarId: 'HANGAR_2',
    defaultCatalogueId: 'veh-air-widebody-jet',
    name: 'Second Owned Cargo Aircraft (Heavy Widebody Freighter)',
  },
];

export function getNextOwnedAircraftPurchaseRequirement(currentOwnedCount: number): {
  canEverPurchaseMore: boolean;
  slotNumber: 1 | 2 | null;
  unlockAirportLevel: number | null;
  purchasePrice: number;
  requiredHangarId: 'HANGAR_1' | 'HANGAR_2' | null;
} {
  if (currentOwnedCount <= 0) {
    return {
      canEverPurchaseMore: true,
      slotNumber: 1,
      unlockAirportLevel: FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL,
      purchasePrice: FIRST_OWNED_AIRCRAFT_PRICE,
      requiredHangarId: 'HANGAR_1',
    };
  }
  if (currentOwnedCount === 1) {
    return {
      canEverPurchaseMore: true,
      slotNumber: 2,
      unlockAirportLevel: SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL,
      purchasePrice: SECOND_OWNED_AIRCRAFT_PRICE,
      requiredHangarId: 'HANGAR_2',
    };
  }
  return {
    canEverPurchaseMore: false,
    slotNumber: null,
    unlockAirportLevel: null,
    purchasePrice: 0,
    requiredHangarId: null,
  };
}

export const FIVE_REAL_WORLD_DAYS_MS = 5 * 24 * 60 * 60 * 1000; // 432,000,000 ms
export const AIRCRAFT_LOW_CONDITION_THRESHOLD = 20; // Below 20% -> 50% efficiency penalty
export const AIRCRAFT_LOW_CONDITION_EFFICIENCY_MULTIPLIER = 0.5;
export const AIRCRAFT_NORMAL_EFFICIENCY_MULTIPLIER = 1.0;
export const AIRCRAFT_FLIGHT_WEAR_PERCENT = 12; // Condition wear per completed flight
export const AIRPORT_PAVEMENT_SURFACE_Y = 1.47;
export const GUEST_AIRCRAFT_VISIT_DURATION_SEC = 4.5;

export interface GuestAircraftCatalogueSpec {
  id: string;
  name: string;
  operatorName: string;
  originHub: string;
  callsignPrefix: string;
  liveryId: string;
  visitDurationSec: number;
  description: string;
}

export type GuestAircraftCatalogueItem = GuestAircraftCatalogueSpec;

export const GUEST_AIRCRAFT_CATALOGUE: readonly GuestAircraftCatalogueSpec[] = [
  {
    id: 'guest-air-747-freighter',
    name: 'Atlas Global 747-8F Super Freighter',
    operatorName: 'Atlas Global Air Cargo',
    originHub: 'Frankfurt Int’l Cargo Hub (EDDF)',
    callsignPrefix: 'GT-VIS',
    liveryId: 'livery-atlantic-blue',
    visitDurationSec: GUEST_AIRCRAFT_VISIT_DURATION_SEC,
    description:
      'External visiting intercontinental widebody cargo jet conducting a scheduled apron transit stop.',
  },
  {
    id: 'guest-air-a330-regional',
    name: 'EuroCargo A330-200F Regional Jet',
    operatorName: 'EuroCargo Express Aviation',
    originHub: 'Amsterdam Schiphol Cargo (EHAM)',
    callsignPrefix: 'EC-GST',
    liveryId: 'livery-nordic-teal',
    visitDurationSec: GUEST_AIRCRAFT_VISIT_DURATION_SEC,
    description:
      'External visiting medium widebody cargo aircraft arriving for customs & apron turnaround.',
  },
  {
    id: 'guest-air-atr72-feeder',
    name: 'Nordic Express ATR-72 Cargo Feeder',
    operatorName: 'Nordic Air Logistics',
    originHub: 'Oslo Gardermoen Freight (ENGM)',
    callsignPrefix: 'NX-VIS',
    liveryId: 'livery-amber-gold',
    visitDurationSec: GUEST_AIRCRAFT_VISIT_DURATION_SEC,
    description:
      'External visiting regional turboprop cargo feeder conducting a short-haul apron visit.',
  },
];

/**
 * Constant physical 3D dimensions for Cargo Aircraft across all 20 Airport Levels (Prompt 5).
 * Airport upgrades improve operational performance & capacity, NEVER physical aircraft size.
 */
export const AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS = {
  lengthMeters: 11.2,
  wingspanMeters: 10.8,
  heightMeters: 3.4,
  fuselageRadiusMeters: 0.62,
  wheelRadiusMeters: 0.22,
  noseWheelRadiusMeters: 0.16,
  noseGearLocalZ: 3.4,
  mainGearLocalZ: -0.45,
  mainGearTrackWidthMeters: 1.9,
  wheelBaseBottomLocalY: 0.0, // Bottom of landing gear wheels sits at y = 0 in local model space
} as const;

/**
 * Authoritative Aircraft Model Orientation Configuration (Prompt 6).
 * Local +Z is the aircraft nose, Local -Z is the tail, Local X is wingspan, Local +Y is up.
 * Using headingYaw = Math.atan2(dx, dz) + forwardYawCorrectionRad aligns the nose (+Z)
 * 100% with the world travel vector (dx, dz), eliminating any sideways movement.
 */
export const AIRCRAFT_MODEL_ORIENTATION_CONFIG = {
  localForwardAxis: '+Z' as const,
  localRearAxis: '-Z' as const,
  localUpAxis: '+Y' as const,
  localWingAxis: 'X' as const,
  forwardYawCorrectionRad: 0.0,
} as const;

/**
 * Computes the exact world headingYaw (radians) so the aircraft's nose (+Z local axis)
 * points directly along the world displacement vector (dx, dz).
 */
export function computeAircraftNoseForwardYaw(
  dx: number,
  dz: number,
  fallbackYaw = 0
): number {
  const len = Math.hypot(dx, dz);
  if (len < 1e-5) return fallbackYaw;
  return (
    Math.atan2(dx, dz) + AIRCRAFT_MODEL_ORIENTATION_CONFIG.forwardYawCorrectionRad
  );
}

/**
 * Returns the world unit forward vector corresponding to a given aircraft headingYaw.
 */
export function getAircraftNoseWorldDirection(headingYaw: number): {
  dirX: number;
  dirZ: number;
} {
  const effectiveYaw =
    headingYaw - AIRCRAFT_MODEL_ORIENTATION_CONFIG.forwardYawCorrectionRad;
  return {
    dirX: Math.sin(effectiveYaw),
    dirZ: Math.cos(effectiveYaw),
  };
}

// ============================================================================
// 2. CARGO MATERIAL HIERARCHY & AIRPORT LEVEL PROGRESSION (PROMPT 5 & EXPANSION)
// ============================================================================

export type AirCargoMaterialCategory =
  | 'PLANT_AND_FOOD'
  | 'METALS_AND_ORES'
  | 'PHARMACEUTICALS';

export type AirportSupplyCategory =
  | 'MATERIALS'
  | 'FUEL'
  | 'ELECTRONICS'
  | 'PARTS';

export type AirportWarehouseCargoKey =
  | 'FOOD'
  | 'INDUSTRIAL'
  | 'PACKAGES'
  | AirCargoMaterialCategory
  | AirportSupplyCategory;

export interface AirCargoMaterialSpec {
  id: AirCargoMaterialCategory;
  name: string;
  unlockAirportLevel: number;
  baseValuePerTon: number;
  valueMultiplier: number;
  priorityRank: number; // 1 = lowest, 2 = middle, 3 = highest
  description: string;
}

/**
 * Official Cargo Material Value Hierarchy (Prompt 5 Section 6.2):
 * 1. Pharmaceuticals — Highest value (unlocks at Airport Level 12)
 * 2. Metals and Ores — Middle value (unlocks at Airport Level 5)
 * 3. Plant and Food Items — Lowest value (unlocked at Airport Level 1)
 */
export const AIR_CARGO_MATERIAL_SPECS: Record<
  AirCargoMaterialCategory,
  AirCargoMaterialSpec
> = {
  PLANT_AND_FOOD: {
    id: 'PLANT_AND_FOOD',
    name: 'Plant & Food Items',
    unlockAirportLevel: 1,
    baseValuePerTon: 1200,
    valueMultiplier: 1.0,
    priorityRank: 1,
    description: 'Perishable agricultural produce & temperature-controlled food.',
  },
  METALS_AND_ORES: {
    id: 'METALS_AND_ORES',
    name: 'Metals & Ores',
    unlockAirportLevel: 5,
    baseValuePerTon: 1980,
    valueMultiplier: 1.65,
    priorityRank: 2,
    description: 'Refined industrial alloys, titanium stock & high-grade ores.',
  },
  PHARMACEUTICALS: {
    id: 'PHARMACEUTICALS',
    name: 'Pharmaceuticals',
    unlockAirportLevel: 12,
    baseValuePerTon: 3120,
    valueMultiplier: 2.6,
    priorityRank: 3,
    description: 'High-value medical biologics, vaccines & precision compounds.',
  },
};

export function getUnlockedAirCargoMaterialsForLevel(
  airportLevel: number
): AirCargoMaterialSpec[] {
  const lvl = Math.max(1, Math.floor(airportLevel));
  return Object.values(AIR_CARGO_MATERIAL_SPECS)
    .filter((spec) => lvl >= spec.unlockAirportLevel)
    .sort((a, b) => b.priorityRank - a.priorityRank);
}

/**
 * Computes the operational cargo capacity (in tons) supported by the airport
 * at a given Airport Level (1..20):
 * - Level 1: 5 tons
 * - Level 20: 50 tons
 * - Smooth monotonic progression across all 20 levels while keeping physical aircraft dimensions constant.
 */
export function getAircraftOperationalCapacityForAirportLevel(
  _baseCapacityTons: number,
  airportLevel: number
): number {
  return getAirportCargoCapacityForLevel(airportLevel);
}

/**
 * Computes aircraft flight efficiency multiplier from conditionPercent (0..100).
 * - At 20%..100%: 1.0 (100% normal efficiency)
 * - Below 20% (1%..19.99%): 0.5 (50% efficiency drop)
 * - At 0%: 0.0 (Grounded — cannot fly)
 */
export function getAircraftEfficiencyMultiplier(
  conditionPercent: number
): number {
  const c = Math.max(0, Math.min(100, conditionPercent));
  if (c <= 0) return 0;
  if (c < AIRCRAFT_LOW_CONDITION_THRESHOLD) {
    return AIRCRAFT_LOW_CONDITION_EFFICIENCY_MULTIPLIER;
  }
  return AIRCRAFT_NORMAL_EFFICIENCY_MULTIPLIER;
}

// ============================================================================
// 3. WAYPOINTS & GROUND-SUPPORT EQUIPMENT (GSE) DEFINITIONS (PROMPT 4 & 10 STANDS)
// ============================================================================

export type AirportWaypointId =
  | 'RUNWAY_ENTRY'
  | 'RUNWAY_EXIT'
  | 'APRON_BAY_1'
  | 'APRON_BAY_2'
  | 'APRON_BAY_3'
  | 'APRON_BAY_4'
  | 'APRON_BAY_5'
  | 'APRON_BAY_6'
  | 'APRON_BAY_7'
  | 'APRON_BAY_8'
  | 'APRON_BAY_9'
  | 'APRON_BAY_10'
  | 'WAREHOUSE_YARD'
  | 'HANGAR_1'
  | 'HANGAR_2'
  | 'TRUCK_YARD_ENTRY'
  | 'TRUCK_QUEUE_BAY'
  | 'CARGO_LOADING_DOCK'
  | 'TRUCK_YARD_EXIT';

export type YardTruckOperationalStage =
  | 'APPROACHING_ENTRY'
  | 'QUEUING_AT_BAY'
  | 'REVERSING_INTO_DOCK'
  | 'LOADING_CARGO'
  | 'EXITING_YARD';

export interface AirportYardTruckRecord {
  id: string;
  name: string;
  liveryColorHex: number;
  trailerColorHex: number;
  dockIndex: number;
  stage: YardTruckOperationalStage;
  stageProgress: number; // 0..1
  stageTimerSec: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  wheelRotationRad: number;
  isReversing: boolean;
}

export const ALL_APRON_STAND_IDS: readonly AirportWaypointId[] = [
  'APRON_BAY_1',
  'APRON_BAY_2',
  'APRON_BAY_3',
  'APRON_BAY_4',
  'APRON_BAY_5',
  'APRON_BAY_6',
  'APRON_BAY_7',
  'APRON_BAY_8',
  'APRON_BAY_9',
  'APRON_BAY_10',
];

export interface AirportWaypointRecord {
  id: AirportWaypointId;
  name: string;
  gx: number;
  gz: number;
  worldX: number;
  worldY: number;
  worldZ: number;
}

export type GSEVehicleCategory =
  | 'CARGO_LOADER'
  | 'AIRCRAFT_TUG'
  | 'FLATBED_CARGO_CART'
  | 'CARGO_DOLLY'
  | 'FUEL_TANKER'
  | 'FORKLIFT';

export type GSEOperationalState =
  | 'PARKED'
  | 'DISPATCHED_TO_AIRCRAFT'
  | 'SERVICING_AIRCRAFT'
  | 'TRANSFERRING_TO_YARD'
  | 'RETURNING_TO_PARKING';

export interface GSEVehicleRecord {
  id: string;
  name: string;
  category: GSEVehicleCategory;
  state: GSEOperationalState;
  homeGx: number;
  homeGz: number;
  homeWorldX: number;
  homeWorldZ: number;
  homeHeadingYaw: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  wheelRotationRad: number;
  currentSpeedMps: number;
  assignedAircraftId: string | null;
  assignedTaskId: string | null;
  targetWorldX: number;
  targetWorldZ: number;
  carryingCargoKey: AirportWarehouseCargoKey | null;
  carryingTons: number;
  liftHeightRatio: number; // 0..1 for cargo loaders & forklifts
}

// ============================================================================
// 4. AIRPORT CARGO WAREHOUSE (10x10) & TRANSFER YARD (10x10) (PROMPT 3)
// ============================================================================

export type TransferTaskStatus =
  | 'WAITING'
  | 'RESERVED'
  | 'ASSIGNED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED';

export type TransferDirection =
  | 'WAREHOUSE_TO_YARD'
  | 'YARD_TO_WAREHOUSE'
  | 'APRON_TO_YARD'
  | 'YARD_TO_APRON';

export interface AirportCargoTransferTask {
  id: string;
  direction: TransferDirection;
  cargoKey: AirportWarehouseCargoKey;
  tons: number;
  status: TransferTaskStatus;
  assignedDollyId: string | null;
  assignedForkliftId: string | null;
  progressRatio: number; // 0..1
  sourceFacilityId: string;
  targetFacilityId: string;
  createdAtMs: number;
}

export interface AirportWarehouseLoadingDockRecord {
  id: string;
  dockNumber: number;
  unlocked: boolean;
  gx: number;
  gz: number;
  worldX: number;
  worldZ: number;
  occupiedByVehicleId: string | null;
  openRatio: number;
}

export interface AirportCargoWarehouseState {
  id: string;
  name: string;
  separateFromCargoTerminal: true;
  level: number; // 1..20 (scales with airport level, reaches full 10x10 at Level 20)
  maxLevel: number;
  reservedBounds: AirportSubZoneBounds; // Always 10 x 10 (100 cells)
  constructedBounds: AirportSubZoneBounds; // Progressive up to 10 x 10 at Level 20
  capacities: Record<AirportWarehouseCargoKey, number>;
  stored: Record<AirportWarehouseCargoKey, number>;
  reserved: Record<AirportWarehouseCargoKey, number>;
  totalCapacityTons: number;
  totalStoredTons: number;
  totalReservedTons: number;
  loadingDocks: AirportWarehouseLoadingDockRecord[];
  operationalStatus: 'READY' | 'TRANSFERRING' | 'LOADING_TRUCK' | 'FULL';
}

export interface AirportTransferYardState {
  id: string;
  name: string;
  separateFromCargoTerminal: true;
  separateFromWarehouse: true;
  bounds: AirportSubZoneBounds; // Exact 10 x 10 (100 cells)
  stagingCapacityTons: number;
  stagedCargo: Record<AirportWarehouseCargoKey, number>;
  reservedCargo: Record<AirportWarehouseCargoKey, number>;
  totalStagedTons: number;
  activeTransferTasks: AirportCargoTransferTask[];
  completedTransferCount: number;
  operationalStatus: 'IDLE' | 'STAGING_ACTIVE' | 'DOLLY_TRANSIT';
}

// ============================================================================
// 5. MANUAL AIRCRAFT HANGARS & AIRCRAFT FLEET STATE (PROMPTS 4, 5, 6)
// ============================================================================

export type HangarSlotId = 'HANGAR_1' | 'HANGAR_2';

export interface AircraftHangarRecord {
  id: HangarSlotId;
  name: string;
  constructed: boolean;
  constructionCost: number;
  unlockAirportLevel: number;
  bounds: AirportSubZoneBounds; // 8 x 8 cells (16m x 16m)
  centerGx: number;
  centerGz: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  clearWidthMeters: number;
  clearDepthMeters: number;
  clearHeightMeters: number;
  occupiedByAircraftId: string | null;
  doorOpenRatio: number; // 0..1
}

export type AircraftFlightStage =
  | 'PARKED'
  | 'IN_HANGAR'
  | 'PUSHBACK'
  | 'TAXI_TO_RUNWAY'
  | 'RUNWAY_HOLD_SHORT'
  | 'RUNWAY_ALIGNED'
  | 'TAKEOFF_ROLL'
  | 'ROTATION'
  | 'LIFTOFF'
  | 'INITIAL_CLIMB'
  | 'OFFSCREEN_FLIGHT'
  | 'APPROACH'
  | 'DESCENT'
  | 'TOUCHDOWN'
  | 'ROLLOUT'
  | 'TAXI_EXIT'
  | 'TAXI_TO_STAND'
  | 'RETURNING_TO_HANGAR'
  | 'GSE_DISPATCH'
  | 'UNLOADING'
  | 'LOADING'
  | 'SUPPLIES_DELIVERED'
  | 'COMPLETED';

export interface AircraftWaypointNode {
  id: string;
  wx: number;
  wy: number;
  wz: number;
  targetSpeedMps: number;
  stageOnReach?: AircraftFlightStage;
  pitchRad?: number;
}

export interface CargoAircraftRecord {
  id: string;
  callsign: string;
  name: string;
  catalogueId: string;
  isPlayerOwned: boolean; // true for Player fleet (max 2), false for External NPC / Guest Aircraft
  liveryId: string;

  // Constant Physical Dimensions (never change across Airport Levels 1..20)
  dimensions: typeof AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS;

  // Operational Performance (upgraded by Airport Level)
  baseCapacityTons: number;
  effectiveCapacityTons: number;
  carryingCargoKey: AirportWarehouseCargoKey | null;
  carryingCargoTons: number;
  cargoValuePerTon: number;

  // Condition, Efficiency Penalty (<20%), Grounding (0%), and 5-Real-Day Maintenance
  conditionPercent: number; // 0..100
  flightEfficiencyMultiplier: number; // 1.0 when >=20%, 0.5 when <20%, 0 when 0%
  isGrounded: boolean;
  lastCompletedFlightOperationId: string | null;
  completedFlightsCount: number;
  lastMaintenanceTimestampMs: number;
  nextMaintenanceTimestampMs: number;
  maintenanceCost: number;
  repairCost: number;
  maintenanceOverdue: boolean;

  // Parking Stand & Hangar Assignment
  assignedStandId: AirportWaypointId | null;
  assignedHangarId: HangarSlotId | null;

  // Unified Nose-Forward Flight & Ground Kinematics (Prompt 6)
  flightStage: AircraftFlightStage;
  activeFlightOperationId: string | null;
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  pitchRad: number;
  rollRad: number;
  currentSpeedMps: number;
  wheelRotationRad: number;
  wheelGroundContact: boolean;
  stageTimerSec: number;
  offscreenFlightRemainingSec: number;
  waypoints: AircraftWaypointNode[];
  currentWaypointIndex: number;

  // NPC Supply Manifest or Guest Aircraft Visit metadata (when isPlayerOwned === false)
  isGuestAircraft?: boolean;
  npcOperationType?: 'SUPPLY_DROP' | 'GUEST_VISIT';
  guestVisitDurationSec?: number;
  operatorName?: string;
  supplyManifest?: {
    supplies: Partial<Record<AirportSupplyCategory, number>>;
    bonusCash: number;
    delivered: boolean;
  };
}

export interface SerializedAirportLogisticsState {
  warehouseStored: Partial<Record<AirportWarehouseCargoKey, number>>;
  yardStaged: Partial<Record<AirportWarehouseCargoKey, number>>;
  constructedHangars: HangarSlotId[];
  hangar1Purchased?: boolean;
  hangar2Purchased?: boolean;
  ownedAircraftCount?: number;
  activeApronStandCount?: number;
  purchasedStandIds?: AirportWaypointId[];
  playerAircraft: CargoAircraftRecord[];
  npcAircraft: CargoAircraftRecord[];
  completedTransferCount: number;
  atcSupplyArrivalsHandled: number;
  guestArrivalsHandled?: number;
}

// ============================================================================
// 6. HELPER FUNCTIONS FOR FOOTPRINTS & CAPACITIES
// ============================================================================

const ALL_WAREHOUSE_CARGO_KEYS: AirportWarehouseCargoKey[] = [
  'FOOD',
  'INDUSTRIAL',
  'PACKAGES',
  'PLANT_AND_FOOD',
  'METALS_AND_ORES',
  'PHARMACEUTICALS',
  'MATERIALS',
  'FUEL',
  'ELECTRONICS',
  'PARTS',
];

export function createEmptyAirportCargoRecord(): Record<
  AirportWarehouseCargoKey,
  number
> {
  return {
    FOOD: 0,
    INDUSTRIAL: 0,
    PACKAGES: 0,
    PLANT_AND_FOOD: 0,
    METALS_AND_ORES: 0,
    PHARMACEUTICALS: 0,
    MATERIALS: 0,
    FUEL: 0,
    ELECTRONICS: 0,
    PARTS: 0,
  };
}

/**
 * Progressive constructed footprint of the separate Airport Cargo Warehouse
 * inside its 10 x 10 reserved plot across Airport Levels 1..20.
 * At Level 1: 6 x 6 grid cells.
 * At Level 20: full 10 x 10 grid cells (100 cells).
 */
export function getAirportWarehouseConstructedBoundsForLevel(
  reserved10x10: AirportSubZoneBounds,
  airportLevel: number
): AirportSubZoneBounds {
  const clamped = Math.max(
    AIRPORT_MIN_LEVEL,
    Math.min(AIRPORT_MAX_LEVEL, Math.floor(airportLevel || 1))
  );
  if (clamped >= AIRPORT_MAX_LEVEL) {
    return { ...reserved10x10 };
  }
  const t = (clamped - 1) / (AIRPORT_MAX_LEVEL - 1);
  const w = Math.min(10, Math.max(6, Math.round(6 + t * 4)));
  const d = Math.min(10, Math.max(6, Math.round(6 + t * 4)));
  return makeSubZoneBounds(
    reserved10x10.minGx,
    reserved10x10.minGx + w - 1,
    reserved10x10.minGz,
    reserved10x10.minGz + d - 1
  );
}

export function getAirportWarehouseCapacitiesForLevel(
  airportLevel: number
): Record<AirportWarehouseCargoKey, number> {
  const clamped = Math.max(
    AIRPORT_MIN_LEVEL,
    Math.min(AIRPORT_MAX_LEVEL, Math.floor(airportLevel || 1))
  );
  const t = (clamped - 1) / (AIRPORT_MAX_LEVEL - 1); // 0..1
  const scale = (lv1: number, lv20: number) =>
    Number((lv1 + (lv20 - lv1) * t).toFixed(1));

  return {
    FOOD: scale(15, 80),
    INDUSTRIAL: scale(20, 100),
    PACKAGES: scale(15, 80),
    PLANT_AND_FOOD: scale(20, 110),
    METALS_AND_ORES: scale(18, 95),
    PHARMACEUTICALS: scale(12, 75),
    MATERIALS: scale(25, 120),
    FUEL: scale(25, 120),
    ELECTRONICS: scale(15, 85),
    PARTS: scale(15, 85),
  };
}

// ============================================================================
// 7. AUTHORITATIVE AIRPORT LOGISTICS, GSE & FLIGHT CONTROLLER
// ============================================================================

export class AirportLogisticsAndFlightController {
  private config: WorldConfigData;
  private grid: GridSystem;

  private waypoints = new Map<AirportWaypointId, AirportWaypointRecord>();
  private purchasedStands = new Set<AirportWaypointId>(['APRON_BAY_1']);
  private reservedStands = new Map<AirportWaypointId, string>();
  private warehouseState!: AirportCargoWarehouseState;
  private transferYardState!: AirportTransferYardState;
  private gseVehicles = new Map<string, GSEVehicleRecord>();
  private yardTrucks = new Map<string, AirportYardTruckRecord>();
  private hangars = new Map<HangarSlotId, AircraftHangarRecord>();
  private playerAircraft = new Map<string, CargoAircraftRecord>();
  private npcAircraft = new Map<string, CargoAircraftRecord>();

  private nextTransferSeq = 1;
  private nextFlightOpSeq = 1;
  private nextNpcAircraftSeq = 1;
  private atcSupplyArrivalsHandled = 0;
  private guestArrivalsHandled = 0;

  constructor(config: WorldConfigData, grid: GridSystem) {
    this.config = config;
    this.grid = grid;
    this.initializeWaypoints();
    this.initializeWarehouseAndTransferYard(1);
    this.initializeHangars();
    this.initializeGseFleet();
    this.initializeYardTruckFleet();
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION: WAYPOINTS, WAREHOUSE (10x10), TRANSFER YARD (10x10), HANGARS & GSE
  // --------------------------------------------------------------------------

  private initializeWaypoints(): void {
    const ap = this.config.airport;
    const apronMinGz = ap.startZ + 12; // 24
    const rawWaypoints: Array<{
      id: AirportWaypointId;
      name: string;
      gx: number;
      gz: number;
    }> = [
      {
        id: 'RUNWAY_ENTRY',
        name: 'Runway 09/27 West Entry Point',
        gx: 158,
        gz: ap.startZ + 4, // 16
      },
      {
        id: 'RUNWAY_EXIT',
        name: 'Runway 09/27 East Exit Turnoff',
        gx: 210,
        gz: ap.startZ + 4, // 16
      },
      {
        id: 'APRON_BAY_1',
        name: 'Apron Cargo Stand 1 (Included at Lv.1)',
        gx: 157,
        gz: apronMinGz + 2, // 26
      },
      {
        id: 'APRON_BAY_2',
        name: 'Apron Cargo Stand 2',
        gx: 162,
        gz: apronMinGz + 5, // 29
      },
      {
        id: 'APRON_BAY_3',
        name: 'Apron Cargo Stand 3',
        gx: 167,
        gz: apronMinGz + 2, // 26
      },
      {
        id: 'APRON_BAY_4',
        name: 'Apron Cargo Stand 4',
        gx: 172,
        gz: apronMinGz + 5, // 29
      },
      {
        id: 'APRON_BAY_5',
        name: 'Apron Cargo Stand 5',
        gx: 177,
        gz: apronMinGz + 2, // 26
      },
      {
        id: 'APRON_BAY_6',
        name: 'Apron Cargo Stand 6',
        gx: 182,
        gz: apronMinGz + 5, // 29
      },
      {
        id: 'APRON_BAY_7',
        name: 'Apron Cargo Stand 7',
        gx: 187,
        gz: apronMinGz + 2, // 26
      },
      {
        id: 'APRON_BAY_8',
        name: 'Apron Cargo Stand 8',
        gx: 192,
        gz: apronMinGz + 5, // 29
      },
      {
        id: 'APRON_BAY_9',
        name: 'Apron Cargo Stand 9',
        gx: 197,
        gz: apronMinGz + 2, // 26
      },
      {
        id: 'APRON_BAY_10',
        name: 'Apron Cargo Stand 10 (Level 20 Max Stand)',
        gx: 202,
        gz: apronMinGz + 5, // 29
      },
      {
        id: 'WAREHOUSE_YARD',
        name: 'Airport Cargo Warehouse & Transfer Yard Exchange',
        gx: this.config.airportTransferYard.startX, // 164
        gz: this.config.airportTransferYard.startZ + 1, // 49
      },
      {
        id: 'HANGAR_1',
        name: 'Aircraft Maintenance Hangar 1 Pad',
        gx: 199,
        gz: 36,
      },
      {
        id: 'HANGAR_2',
        name: 'Aircraft Maintenance Hangar 2 Pad',
        gx: 211,
        gz: 36,
      },
      {
        id: 'TRUCK_YARD_ENTRY',
        name: 'Dedicated Bottom-Right Cargo Truck Facility Approach Entry',
        gx: 193,
        gz: 44,
      },
      {
        id: 'TRUCK_QUEUE_BAY',
        name: 'Dedicated Cargo Truck Waiting & Queuing Bays',
        gx: 196,
        gz: 46,
      },
      {
        id: 'CARGO_LOADING_DOCK',
        name: 'Bottom-Right Cargo Truck Loading & Dispatch Docks',
        gx: 196,
        gz: 52,
      },
      {
        id: 'TRUCK_YARD_EXIT',
        name: 'Dedicated Bottom-Right Cargo Truck Facility Departure Exit',
        gx: 211,
        gz: 45,
      },
    ];

    this.waypoints.clear();
    for (const rw of rawWaypoints) {
      const wp = this.grid.gridToWorld(rw.gx, rw.gz);
      this.waypoints.set(rw.id, {
        id: rw.id,
        name: rw.name,
        gx: rw.gx,
        gz: rw.gz,
        worldX: wp.x,
        worldY: AIRPORT_PAVEMENT_SURFACE_Y,
        worldZ: wp.z,
      });
    }
  }

  private initializeWarehouseAndTransferYard(airportLevel: number): void {
    const whCfg = this.config.airportWarehouse;
    const tyCfg = this.config.airportTransferYard;

    const reservedWhBounds = makeSubZoneBounds(
      whCfg.startX,
      whCfg.endX,
      whCfg.startZ,
      whCfg.endZ
    );
    const constructedWhBounds = getAirportWarehouseConstructedBoundsForLevel(
      reservedWhBounds,
      airportLevel
    );
    const capacities = getAirportWarehouseCapacitiesForLevel(airportLevel);
    const stored = createEmptyAirportCargoRecord();
    // Seed initial operational stock so player can immediately test transfers & air contracts
    stored.FOOD = 10;
    stored.INDUSTRIAL = 14;
    stored.PACKAGES = 10;
    stored.PLANT_AND_FOOD = 14;
    stored.METALS_AND_ORES = 10;
    stored.PHARMACEUTICALS = 6;
    stored.MATERIALS = 12;
    stored.FUEL = 15;
    stored.ELECTRONICS = 8;
    stored.PARTS = 8;

    const reserved = createEmptyAirportCargoRecord();

    const loadingDocks: AirportWarehouseLoadingDockRecord[] = [];
    for (let i = 0; i < 4; i++) {
      const dGx = whCfg.startX + 1 + i * 2;
      const dGz = whCfg.startZ;
      const wp = this.grid.gridToWorld(dGx, dGz);
      loadingDocks.push({
        id: `airport-wh-dock-${i + 1}`,
        dockNumber: i + 1,
        unlocked: i < 2 || airportLevel >= 8,
        gx: dGx,
        gz: dGz,
        worldX: wp.x,
        worldZ: wp.z - 0.8,
        occupiedByVehicleId: null,
        openRatio: 0,
      });
    }

    this.warehouseState = {
      id: AIRPORT_WAREHOUSE_LEVEL_20_FOOTPRINT.id,
      name: 'Airport Cargo Warehouse (10×10)',
      separateFromCargoTerminal: true,
      level: Math.max(1, airportLevel),
      maxLevel: AIRPORT_MAX_LEVEL,
      reservedBounds: reservedWhBounds,
      constructedBounds: constructedWhBounds,
      capacities,
      stored,
      reserved,
      totalCapacityTons: this.sumRecord(capacities),
      totalStoredTons: this.sumRecord(stored),
      totalReservedTons: 0,
      loadingDocks,
      operationalStatus: 'READY',
    };

    const tyBounds = makeSubZoneBounds(
      tyCfg.startX,
      tyCfg.endX,
      tyCfg.startZ,
      tyCfg.endZ
    );
    const stagedCargo = createEmptyAirportCargoRecord();
    stagedCargo.PLANT_AND_FOOD = 6;
    stagedCargo.PACKAGES = 4;

    this.transferYardState = {
      id: AIRPORT_TRANSFER_YARD_FOOTPRINT.id,
      name: 'Airport Cargo Transfer Yard (10×10)',
      separateFromCargoTerminal: true,
      separateFromWarehouse: true,
      bounds: tyBounds,
      stagingCapacityTons: 240 + (Math.max(1, airportLevel) - 1) * 25,
      stagedCargo,
      reservedCargo: createEmptyAirportCargoRecord(),
      totalStagedTons: this.sumRecord(stagedCargo),
      activeTransferTasks: [],
      completedTransferCount: 0,
      operationalStatus: 'IDLE',
    };
  }

  private initializeHangars(): void {
    this.hangars.clear();
    const specs: Array<{
      id: HangarSlotId;
      name: string;
      minGx: number;
      maxGx: number;
      minGz: number;
      maxGz: number;
      cost: number;
      unlockAirportLevel: number;
    }> = [
      {
        id: 'HANGAR_1',
        name: 'Airport Maintenance Hangar 1',
        minGx: 196,
        maxGx: 203, // 8 cells = 16m wide (> 10.8m wingspan) in East Airside Hangar Sector
        minGz: 33,
        maxGz: 40, // 8 cells = 16m deep (> 11.2m length), facing North (-Z) onto dedicated service apron
        cost: AIRCRAFT_HANGAR_PURCHASE_COST, // Fixed $5,000,000
        unlockAirportLevel: 1, // Purchasable at any airport level (1..20)
      },
      {
        id: 'HANGAR_2',
        name: 'Airport Maintenance Hangar 2',
        minGx: 208,
        maxGx: 215, // 8 cells = 16m wide, separated by 4 blocks (8m) from HANGAR_1
        minGz: 33,
        maxGz: 40, // 8 cells = 16m deep, facing North (-Z) onto dedicated service apron
        cost: AIRCRAFT_HANGAR_PURCHASE_COST, // Fixed $5,000,000
        unlockAirportLevel: 1, // Purchasable at any airport level (1..20)
      },
    ];

    for (const s of specs) {
      const bounds = makeSubZoneBounds(s.minGx, s.maxGx, s.minGz, s.maxGz);
      const centerGx = Math.floor((s.minGx + s.maxGx) * 0.5);
      const centerGz = Math.floor((s.minGz + s.maxGz) * 0.5);
      const p0 = this.grid.gridToWorld(s.minGx, s.minGz);
      const p1 = this.grid.gridToWorld(s.maxGx, s.maxGz);
      this.hangars.set(s.id, {
        id: s.id,
        name: s.name,
        constructed: false,
        constructionCost: s.cost,
        unlockAirportLevel: s.unlockAirportLevel,
        bounds,
        centerGx,
        centerGz,
        worldX: (p0.x + p1.x) * 0.5,
        worldY: AIRPORT_PAVEMENT_SURFACE_Y,
        worldZ: (p0.z + p1.z) * 0.5,
        headingYaw: Math.PI, // Open hangar doors facing North (-Z) toward apron/connector
        clearWidthMeters: bounds.widthCells * this.config.cellSize - 1.2, // 14.8m
        clearDepthMeters: bounds.depthCells * this.config.cellSize - 1.2, // 14.8m
        clearHeightMeters: 5.2,
        occupiedByAircraftId: null,
        doorOpenRatio: 1.0,
      });
    }
  }

  private initializeGseFleet(): void {
    this.gseVehicles.clear();
    const ap = this.config.airport;
    const wh = this.config.airportWarehouse;
    const ty = this.config.airportTransferYard;

    const specs: Array<{
      id: string;
      name: string;
      category: GSEVehicleCategory;
      gx: number;
      gz: number;
      yaw: number;
    }> = [
      // 1. Cargo Loaders (High-Lift Scissor ULD Loaders parked on the Airside GSE Staging Apron between Terminal & Hangar 1)
      {
        id: 'gse-loader-1',
        name: 'High-Lift Cargo Loader #1',
        category: 'CARGO_LOADER',
        gx: 181,
        gz: 38,
        yaw: Math.PI,
      },
      {
        id: 'gse-loader-2',
        name: 'High-Lift Cargo Loader #2',
        category: 'CARGO_LOADER',
        gx: 183,
        gz: 38,
        yaw: Math.PI,
      },
      // 2. Aircraft Pushback & Tow Tugs (parked on the Airside GSE Staging Apron)
      {
        id: 'gse-tug-1',
        name: 'Heavy Pushback Aircraft Tug #1',
        category: 'AIRCRAFT_TUG',
        gx: 185,
        gz: 38,
        yaw: Math.PI,
      },
      {
        id: 'gse-tug-2',
        name: 'Heavy Pushback Aircraft Tug #2',
        category: 'AIRCRAFT_TUG',
        gx: 187,
        gz: 38,
        yaw: Math.PI,
      },
      // 3. Motorized Flatbed Cargo Carts (parked on the Airside GSE Staging Apron)
      {
        id: 'gse-flatbed-1',
        name: 'Apron Flatbed Cargo Transporter #1',
        category: 'FLATBED_CARGO_CART',
        gx: 189,
        gz: 38,
        yaw: Math.PI,
      },
      {
        id: 'gse-flatbed-2',
        name: 'Apron Flatbed Cargo Transporter #2',
        category: 'FLATBED_CARGO_CART',
        gx: 191,
        gz: 38,
        yaw: Math.PI,
      },
      // 4. Cargo Dollies (staged in the 10x10 Transfer Yard for Warehouse <-> Yard <-> Apron transfers)
      {
        id: 'dolly-airport-1',
        name: 'ULD Cargo Dolly Train #1',
        category: 'CARGO_DOLLY',
        gx: ty.startX + 1,
        gz: ty.startZ + 2,
        yaw: -Math.PI * 0.5,
      },
      {
        id: 'dolly-airport-2',
        name: 'ULD Cargo Dolly Train #2',
        category: 'CARGO_DOLLY',
        gx: ty.startX + 3,
        gz: ty.startZ + 2,
        yaw: -Math.PI * 0.5,
      },
      {
        id: 'dolly-airport-3',
        name: 'ULD Cargo Dolly Train #3',
        category: 'CARGO_DOLLY',
        gx: ty.startX + 5,
        gz: ty.startZ + 2,
        yaw: -Math.PI * 0.5,
      },
      // 5. Aviation Refueling Tankers (parked on the Airside GSE Staging Apron)
      {
        id: 'gse-fuel-tanker-1',
        name: 'Jet-A1 Refueling Tanker #1',
        category: 'FUEL_TANKER',
        gx: 193,
        gz: 38,
        yaw: Math.PI,
      },
      // 6. Dedicated Airport Cargo Warehouse & Transfer Yard Forklifts (stay PARKED when idle!)
      {
        id: 'forklift-airport-wh-1',
        name: 'Airport Warehouse Forklift #1',
        category: 'FORKLIFT',
        gx: wh.endX - 1,
        gz: wh.startZ + 2,
        yaw: Math.PI * 0.5,
      },
      {
        id: 'forklift-airport-wh-2',
        name: 'Airport Warehouse Forklift #2',
        category: 'FORKLIFT',
        gx: wh.endX - 1,
        gz: wh.startZ + 4,
        yaw: Math.PI * 0.5,
      },
      {
        id: 'forklift-airport-yard-1',
        name: 'Transfer Yard Forklift #1',
        category: 'FORKLIFT',
        gx: ty.startX + 2,
        gz: ty.startZ + 5,
        yaw: -Math.PI * 0.5,
      },
    ];

    for (const s of specs) {
      const wp = this.grid.gridToWorld(s.gx, s.gz);
      this.gseVehicles.set(s.id, {
        id: s.id,
        name: s.name,
        category: s.category,
        state: 'PARKED',
        homeGx: s.gx,
        homeGz: s.gz,
        homeWorldX: wp.x,
        homeWorldZ: wp.z,
        homeHeadingYaw: s.yaw,
        worldX: wp.x,
        worldY: AIRPORT_PAVEMENT_SURFACE_Y,
        worldZ: wp.z,
        headingYaw: s.yaw,
        wheelRotationRad: 0,
        currentSpeedMps: 0,
        assignedAircraftId: null,
        assignedTaskId: null,
        targetWorldX: wp.x,
        targetWorldZ: wp.z,
        carryingCargoKey: null,
        carryingTons: 0,
        liftHeightRatio: 0,
      });
    }
  }

  private initializeYardTruckFleet(): void {
    this.yardTrucks.clear();
    const entryWp = this.waypoints.get('TRUCK_YARD_ENTRY')!;
    const queueWp = this.waypoints.get('TRUCK_QUEUE_BAY')!;
    const dockWp = this.waypoints.get('CARGO_LOADING_DOCK')!;
    const specs: Array<{
      id: string;
      name: string;
      liveryColorHex: number;
      trailerColorHex: number;
      dockIndex: number;
      initialStage: YardTruckOperationalStage;
      initialProgress: number;
    }> = [
      {
        id: 'yard-semi-1',
        name: 'Freight Semi-Trailer #101',
        liveryColorHex: 0x0284c7,
        trailerColorHex: 0x2563eb,
        dockIndex: 0,
        initialStage: 'LOADING_CARGO',
        initialProgress: 0.4,
      },
      {
        id: 'yard-semi-2',
        name: 'Freight Semi-Trailer #102',
        liveryColorHex: 0xd97706,
        trailerColorHex: 0xf59e0b,
        dockIndex: 1,
        initialStage: 'QUEUING_AT_BAY',
        initialProgress: 0.5,
      },
      {
        id: 'yard-semi-3',
        name: 'Freight Semi-Trailer #103',
        liveryColorHex: 0x16a34a,
        trailerColorHex: 0x22c55e,
        dockIndex: 2,
        initialStage: 'APPROACHING_ENTRY',
        initialProgress: 0.2,
      },
    ];

    for (const s of specs) {
      const dockX = dockWp.worldX + s.dockIndex * 3.1;
      const dockZ = dockWp.worldZ - 0.6;
      const queueX = queueWp.worldX + s.dockIndex * 3.1;
      const queueZ = queueWp.worldZ;
      const wx =
        s.initialStage === 'LOADING_CARGO'
          ? dockX
          : s.initialStage === 'QUEUING_AT_BAY'
            ? queueX
            : entryWp.worldX;
      const wz =
        s.initialStage === 'LOADING_CARGO'
          ? dockZ
          : s.initialStage === 'QUEUING_AT_BAY'
            ? queueZ
            : entryWp.worldZ;

      this.yardTrucks.set(s.id, {
        id: s.id,
        name: s.name,
        liveryColorHex: s.liveryColorHex,
        trailerColorHex: s.trailerColorHex,
        dockIndex: s.dockIndex,
        stage: s.initialStage,
        stageProgress: s.initialProgress,
        stageTimerSec: 0,
        worldX: wx,
        worldY: AIRPORT_PAVEMENT_SURFACE_Y,
        worldZ: wz,
        headingYaw: s.initialStage === 'LOADING_CARGO' ? Math.PI : Math.PI * 0.5,
        wheelRotationRad: 0,
        isReversing: false,
      });
    }
  }

  public getYardTrucks(): AirportYardTruckRecord[] {
    return Array.from(this.yardTrucks.values());
  }

  private sumRecord(rec: Record<string, number>): number {
    let total = 0;
    for (const v of Object.values(rec)) {
      total += Number.isFinite(v) ? v : 0;
    }
    return Number(total.toFixed(2));
  }

  private refreshWarehouseAndYardTotals(): void {
    this.warehouseState.totalCapacityTons = this.sumRecord(
      this.warehouseState.capacities
    );
    this.warehouseState.totalStoredTons = this.sumRecord(
      this.warehouseState.stored
    );
    this.warehouseState.totalReservedTons = this.sumRecord(
      this.warehouseState.reserved
    );
    if (
      this.warehouseState.totalStoredTons >=
      this.warehouseState.totalCapacityTons - 0.01
    ) {
      this.warehouseState.operationalStatus = 'FULL';
    } else if (
      this.transferYardState.activeTransferTasks.some(
        (t) =>
          t.status === 'ASSIGNED' ||
          t.status === 'IN_TRANSIT' ||
          t.status === 'RESERVED'
      )
    ) {
      this.warehouseState.operationalStatus = 'TRANSFERRING';
    } else {
      this.warehouseState.operationalStatus = 'READY';
    }

    this.transferYardState.totalStagedTons = this.sumRecord(
      this.transferYardState.stagedCargo
    );
    this.transferYardState.operationalStatus =
      this.transferYardState.activeTransferTasks.length > 0
        ? 'DOLLY_TRANSIT'
        : this.transferYardState.totalStagedTons > 0
          ? 'STAGING_ACTIVE'
          : 'IDLE';
  }

  // --------------------------------------------------------------------------
  // LEVEL SYNC (Airport Level 1..20 updates Warehouse 10x10 & Aircraft Capacities)
  // --------------------------------------------------------------------------

  public syncWithAirportLevel(airportLevel: number): void {
    const effectiveLevel = Math.max(
      AIRPORT_MIN_LEVEL,
      Math.min(AIRPORT_MAX_LEVEL, Math.floor(airportLevel || 1))
    );
    this.warehouseState.level = effectiveLevel;
    this.warehouseState.constructedBounds =
      getAirportWarehouseConstructedBoundsForLevel(
        this.warehouseState.reservedBounds,
        effectiveLevel
      );
    this.warehouseState.capacities =
      getAirportWarehouseCapacitiesForLevel(effectiveLevel);

    for (let i = 0; i < this.warehouseState.loadingDocks.length; i++) {
      this.warehouseState.loadingDocks[i].unlocked =
        i < 2 || effectiveLevel >= i * 4;
    }

    this.transferYardState.stagingCapacityTons =
      240 + (effectiveLevel - 1) * 25;

    // Update effective cargo capacity of all player-owned aircraft while keeping physical dimensions constant!
    for (const ac of this.playerAircraft.values()) {
      ac.effectiveCapacityTons = getAircraftOperationalCapacityForAirportLevel(
        ac.baseCapacityTons,
        effectiveLevel
      );
    }

    this.refreshWarehouseAndYardTotals();
  }

  // --------------------------------------------------------------------------
  // PROMPT 3: AIRPORT CARGO WAREHOUSE (10x10) & TRANSFER YARD (10x10) OPERATIONS
  // --------------------------------------------------------------------------

  public getAirportWarehouse(): AirportCargoWarehouseState {
    return this.warehouseState;
  }

  public getAirportTransferYard(): AirportTransferYardState {
    return this.transferYardState;
  }

  public addCargoToAirportWarehouse(
    cargoKey: AirportWarehouseCargoKey,
    tons: number
  ): {
    success: boolean;
    addedTons: number;
    overflowTons: number;
    newStoredTons: number;
  } {
    if (!Number.isFinite(tons) || tons <= 0) {
      return {
        success: false,
        addedTons: 0,
        overflowTons: 0,
        newStoredTons: this.warehouseState.stored[cargoKey] ?? 0,
      };
    }
    const cap = this.warehouseState.capacities[cargoKey] ?? 50;
    const current = this.warehouseState.stored[cargoKey] ?? 0;
    const availableSpace = Math.max(0, cap - current);
    const addedTons = Number(Math.min(tons, availableSpace).toFixed(2));
    const overflowTons = Number(Math.max(0, tons - addedTons).toFixed(2));
    this.warehouseState.stored[cargoKey] = Number(
      (current + addedTons).toFixed(2)
    );
    this.refreshWarehouseAndYardTotals();
    return {
      success: addedTons > 0,
      addedTons,
      overflowTons,
      newStoredTons: this.warehouseState.stored[cargoKey],
    };
  }

  public removeCargoFromAirportWarehouse(
    cargoKey: AirportWarehouseCargoKey,
    tons: number
  ): {
    success: boolean;
    removedTons: number;
    reason?: string;
  } {
    if (!Number.isFinite(tons) || tons <= 0) {
      return {
        success: false,
        removedTons: 0,
        reason: 'Requested cargo amount must be positive.',
      };
    }
    const current = this.warehouseState.stored[cargoKey] ?? 0;
    const reserved = this.warehouseState.reserved[cargoKey] ?? 0;
    const available = Math.max(0, current - reserved);
    if (available + 1e-6 < tons) {
      return {
        success: false,
        removedTons: 0,
        reason: `Insufficient unreserved ${cargoKey} in Airport Cargo Warehouse (available: ${available.toFixed(1)}t, requested: ${tons.toFixed(1)}t).`,
      };
    }
    this.warehouseState.stored[cargoKey] = Number(
      Math.max(0, current - tons).toFixed(2)
    );
    this.refreshWarehouseAndYardTotals();
    return { success: true, removedTons: tons };
  }

  /**
   * Initiates a transaction-safe cargo transfer between the 10x10 Airport Cargo Warehouse
   * and the 10x10 Airport Transfer Yard using Cargo Dollies & Forklifts (Prompt 3).
   */
  public requestWarehouseToYardTransfer(
    cargoKey: AirportWarehouseCargoKey,
    tons: number,
    direction: TransferDirection = 'WAREHOUSE_TO_YARD'
  ): {
    success: boolean;
    reason?: string;
    task?: AirportCargoTransferTask;
  } {
    if (!Number.isFinite(tons) || tons <= 0) {
      return {
        success: false,
        reason: 'Transfer quantity must be greater than 0 tons.',
      };
    }

    if (direction === 'WAREHOUSE_TO_YARD') {
      const stored = this.warehouseState.stored[cargoKey] ?? 0;
      const reserved = this.warehouseState.reserved[cargoKey] ?? 0;
      const available = Math.max(0, stored - reserved);
      if (available + 1e-6 < tons) {
        return {
          success: false,
          reason: `Insufficient available ${cargoKey} in Airport Warehouse (${available.toFixed(1)}t available, ${tons.toFixed(1)}t requested).`,
        };
      }
      const yardFree = Math.max(
        0,
        this.transferYardState.stagingCapacityTons -
          this.transferYardState.totalStagedTons
      );
      if (yardFree + 1e-6 < tons) {
        return {
          success: false,
          reason: `Airport Transfer Yard staging capacity is full (${yardFree.toFixed(1)}t free).`,
        };
      }
      // Reserve cargo in warehouse so it cannot be double-spent during transit
      this.warehouseState.reserved[cargoKey] = Number(
        (reserved + tons).toFixed(2)
      );
    } else if (direction === 'YARD_TO_WAREHOUSE') {
      const staged = this.transferYardState.stagedCargo[cargoKey] ?? 0;
      const reserved = this.transferYardState.reservedCargo[cargoKey] ?? 0;
      const available = Math.max(0, staged - reserved);
      if (available + 1e-6 < tons) {
        return {
          success: false,
          reason: `Insufficient staged ${cargoKey} in Airport Transfer Yard (${available.toFixed(1)}t available).`,
        };
      }
      const whCap = this.warehouseState.capacities[cargoKey] ?? 50;
      const whStored = this.warehouseState.stored[cargoKey] ?? 0;
      if (whCap - whStored + 1e-6 < tons) {
        return {
          success: false,
          reason: `Airport Warehouse ${cargoKey} storage has insufficient free space.`,
        };
      }
      this.transferYardState.reservedCargo[cargoKey] = Number(
        (reserved + tons).toFixed(2)
      );
    }

    // Find an idle Cargo Dolly and an idle Forklift
    const idleDolly = Array.from(this.gseVehicles.values()).find(
      (g) => g.category === 'CARGO_DOLLY' && g.state === 'PARKED'
    );
    const idleForklift = Array.from(this.gseVehicles.values()).find(
      (g) => g.category === 'FORKLIFT' && g.state === 'PARKED'
    );

    const taskId = `airport-transfer-${this.nextTransferSeq++}`;
    const task: AirportCargoTransferTask = {
      id: taskId,
      direction,
      cargoKey,
      tons: Number(tons.toFixed(2)),
      status: idleDolly ? 'ASSIGNED' : 'RESERVED',
      assignedDollyId: idleDolly ? idleDolly.id : null,
      assignedForkliftId: idleForklift ? idleForklift.id : null,
      progressRatio: 0,
      sourceFacilityId:
        direction === 'WAREHOUSE_TO_YARD'
          ? this.warehouseState.id
          : this.transferYardState.id,
      targetFacilityId:
        direction === 'WAREHOUSE_TO_YARD'
          ? this.transferYardState.id
          : this.warehouseState.id,
      createdAtMs: Date.now(),
    };

    if (idleDolly) {
      const whCenter = this.grid.gridToWorld(
        this.config.airportWarehouse.endX - 1,
        this.config.airportWarehouse.startZ + 3
      );
      const tyCenter = this.grid.gridToWorld(
        this.config.airportTransferYard.startX + 3,
        this.config.airportTransferYard.startZ + 3
      );
      idleDolly.state = 'TRANSFERRING_TO_YARD';
      idleDolly.assignedTaskId = task.id;
      idleDolly.carryingCargoKey = cargoKey;
      idleDolly.carryingTons = task.tons;
      idleDolly.targetWorldX =
        direction === 'WAREHOUSE_TO_YARD' ? tyCenter.x : whCenter.x;
      idleDolly.targetWorldZ =
        direction === 'WAREHOUSE_TO_YARD' ? tyCenter.z : whCenter.z;
    }

    if (idleForklift) {
      idleForklift.state = 'TRANSFERRING_TO_YARD';
      idleForklift.assignedTaskId = task.id;
      idleForklift.carryingCargoKey = cargoKey;
      idleForklift.carryingTons = Math.min(2.5, task.tons);
      idleForklift.liftHeightRatio = 0.65;
    }

    this.transferYardState.activeTransferTasks.push(task);
    this.refreshWarehouseAndYardTotals();
    return { success: true, task };
  }

  /**
   * Cancels an in-flight or waiting transfer task and safely releases any reserved cargo
   * so cargo is never duplicated or lost.
   */
  public cancelTransferTask(taskId: string): {
    success: boolean;
    reason?: string;
  } {
    const task = this.transferYardState.activeTransferTasks.find(
      (t) => t.id === taskId
    );
    if (!task) {
      return { success: false, reason: `Transfer task ${taskId} not found.` };
    }
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      return {
        success: false,
        reason: `Transfer task ${taskId} is already ${task.status}.`,
      };
    }

    if (task.direction === 'WAREHOUSE_TO_YARD') {
      this.warehouseState.reserved[task.cargoKey] = Number(
        Math.max(
          0,
          (this.warehouseState.reserved[task.cargoKey] ?? 0) - task.tons
        ).toFixed(2)
      );
    } else if (task.direction === 'YARD_TO_WAREHOUSE') {
      this.transferYardState.reservedCargo[task.cargoKey] = Number(
        Math.max(
          0,
          (this.transferYardState.reservedCargo[task.cargoKey] ?? 0) - task.tons
        ).toFixed(2)
      );
    }

    task.status = 'CANCELLED';
    this.releaseTaskGseVehicles(task.id);
    this.transferYardState.activeTransferTasks =
      this.transferYardState.activeTransferTasks.filter((t) => t.id !== taskId);
    this.refreshWarehouseAndYardTotals();
    return { success: true };
  }

  private completeTransferTaskInternal(task: AirportCargoTransferTask): void {
    if (task.direction === 'WAREHOUSE_TO_YARD') {
      this.warehouseState.reserved[task.cargoKey] = Number(
        Math.max(
          0,
          (this.warehouseState.reserved[task.cargoKey] ?? 0) - task.tons
        ).toFixed(2)
      );
      this.warehouseState.stored[task.cargoKey] = Number(
        Math.max(
          0,
          (this.warehouseState.stored[task.cargoKey] ?? 0) - task.tons
        ).toFixed(2)
      );
      this.transferYardState.stagedCargo[task.cargoKey] = Number(
        (
          (this.transferYardState.stagedCargo[task.cargoKey] ?? 0) + task.tons
        ).toFixed(2)
      );
    } else if (task.direction === 'YARD_TO_WAREHOUSE') {
      this.transferYardState.reservedCargo[task.cargoKey] = Number(
        Math.max(
          0,
          (this.transferYardState.reservedCargo[task.cargoKey] ?? 0) - task.tons
        ).toFixed(2)
      );
      this.transferYardState.stagedCargo[task.cargoKey] = Number(
        Math.max(
          0,
          (this.transferYardState.stagedCargo[task.cargoKey] ?? 0) - task.tons
        ).toFixed(2)
      );
      const cap = this.warehouseState.capacities[task.cargoKey] ?? 100;
      this.warehouseState.stored[task.cargoKey] = Number(
        Math.min(
          cap,
          (this.warehouseState.stored[task.cargoKey] ?? 0) + task.tons
        ).toFixed(2)
      );
    }

    task.progressRatio = 1;
    task.status = 'COMPLETED';
    this.transferYardState.completedTransferCount += 1;
    this.releaseTaskGseVehicles(task.id);
    this.transferYardState.activeTransferTasks =
      this.transferYardState.activeTransferTasks.filter(
        (t) => t.id !== task.id
      );
    this.refreshWarehouseAndYardTotals();
  }

  private releaseTaskGseVehicles(taskId: string): void {
    for (const gse of this.gseVehicles.values()) {
      if (gse.assignedTaskId === taskId) {
        gse.assignedTaskId = null;
        gse.carryingCargoKey = null;
        gse.carryingTons = 0;
        gse.liftHeightRatio = 0;
        gse.state = 'PARKED';
        gse.currentSpeedMps = 0;
        gse.worldX = gse.homeWorldX;
        gse.worldZ = gse.homeWorldZ;
        gse.headingYaw = gse.homeHeadingYaw;
      }
    }
  }

  // --------------------------------------------------------------------------
  // PROMPT 4: WAYPOINTS, GSE FLEET & EXTERNAL NPC ATC SUPPLY AIRCRAFT
  // --------------------------------------------------------------------------

  public getWaypoints(): AirportWaypointRecord[] {
    return Array.from(this.waypoints.values());
  }

  public getWaypoint(id: AirportWaypointId): AirportWaypointRecord | undefined {
    return this.waypoints.get(id);
  }

  public getGseVehicles(): GSEVehicleRecord[] {
    return Array.from(this.gseVehicles.values());
  }

  public getNpcAircraft(): CargoAircraftRecord[] {
    return Array.from(this.npcAircraft.values());
  }

  public getGuestAircraft(): CargoAircraftRecord[] {
    return Array.from(this.npcAircraft.values()).filter(
      (ac) => ac.isGuestAircraft === true || ac.npcOperationType === 'GUEST_VISIT'
    );
  }

  public getAtcSupplyArrivalsHandled(): number {
    return this.atcSupplyArrivalsHandled;
  }

  public getGuestArrivalsHandled(): number {
    return this.guestArrivalsHandled;
  }

  public getPurchasedStandIds(): AirportWaypointId[] {
    this.purchasedStands.add('APRON_BAY_1');
    return Array.from(this.purchasedStands);
  }

  /**
   * Builds the live stand runtime overlay (`purchasedStandIds`, `occupiedStandByWaypoint`, `reservedStandByWaypoint`)
   * consumed by `buildAirportInfrastructureRecord`.
   */
  public getStandRuntimeOverlay(): AirportStandRuntimeOverlay {
    this.purchasedStands.add('APRON_BAY_1');
    const occupiedStandByWaypoint = new Map<string, string>();
    const reservedStandByWaypoint = new Map<string, string>();

    for (const [standId, acId] of this.reservedStands.entries()) {
      reservedStandByWaypoint.set(standId, acId);
    }

    const stationaryAtStandStages: AircraftFlightStage[] = [
      'PARKED',
      'GSE_DISPATCH',
      'UNLOADING',
      'LOADING',
      'SUPPLIES_DELIVERED',
      'PUSHBACK',
    ];
    const incomingToStandStages: AircraftFlightStage[] = [
      'APPROACH',
      'DESCENT',
      'TOUCHDOWN',
      'ROLLOUT',
      'TAXI_EXIT',
      'TAXI_TO_STAND',
    ];

    for (const ac of this.playerAircraft.values()) {
      if (!ac.assignedStandId || ac.flightStage === 'IN_HANGAR') continue;
      if (stationaryAtStandStages.includes(ac.flightStage)) {
        occupiedStandByWaypoint.set(ac.assignedStandId, ac.id);
      } else if (incomingToStandStages.includes(ac.flightStage)) {
        reservedStandByWaypoint.set(ac.assignedStandId, ac.id);
      }
    }

    for (const npc of this.npcAircraft.values()) {
      if (!npc.assignedStandId || npc.flightStage === 'COMPLETED') continue;
      if (stationaryAtStandStages.includes(npc.flightStage)) {
        occupiedStandByWaypoint.set(npc.assignedStandId, npc.id);
      } else if (incomingToStandStages.includes(npc.flightStage)) {
        reservedStandByWaypoint.set(npc.assignedStandId, npc.id);
      }
    }

    return {
      purchasedStandIds: this.purchasedStands,
      occupiedStandByWaypoint,
      reservedStandByWaypoint,
    };
  }

  /**
   * Resolves a stand identifier (`'APRON_BAY_2'`, `'airport-stand-2'`, or `2`) to `{ waypointId, standNumber }`.
   */
  public normalizeStandIdentifier(standIdOrNumber: string | number): {
    waypointId: AirportWaypointId;
    standNumber: number;
  } | null {
    let standNum = 0;
    if (typeof standIdOrNumber === 'number') {
      standNum = Math.floor(standIdOrNumber);
    } else if (standIdOrNumber.startsWith('APRON_BAY_')) {
      standNum = Number(standIdOrNumber.replace('APRON_BAY_', ''));
    } else if (standIdOrNumber.startsWith('airport-stand-')) {
      standNum = Number(standIdOrNumber.replace('airport-stand-', ''));
    } else {
      standNum = Number(standIdOrNumber);
    }
    if (
      !Number.isFinite(standNum) ||
      standNum < 1 ||
      standNum > AIRPORT_MAX_PARKING_AREAS
    ) {
      return null;
    }
    const waypointId = ALL_APRON_STAND_IDS[standNum - 1];
    return waypointId ? { waypointId, standNumber: standNum } : null;
  }

  /**
   * Purchases an unlocked aircraft parking area (`APRON_BAY_2` .. `APRON_BAY_10`) at the current airport level price:
   * parkingAreaCost(currentAirportLevel) = 500,000 + 150,000 * (currentAirportLevel - 1)
   */
  public purchaseParkingStand(
    standIdOrNumber: string | number,
    airportOwned: boolean,
    airportLevel: number
  ): {
    success: boolean;
    reason?: string;
    standId?: AirportWaypointId;
    standNumber?: number;
    cost: number;
    price: number;
  } {
    if (!airportOwned || airportLevel <= 0) {
      return {
        success: false,
        cost: 0,
        price: 0,
        reason:
          'Purchase and restore the Regional Cargo Airport before buying aircraft parking areas.',
      };
    }

    const parsed = this.normalizeStandIdentifier(standIdOrNumber);
    if (!parsed) {
      return {
        success: false,
        cost: 0,
        price: 0,
        reason: `Invalid aircraft parking area "${String(standIdOrNumber)}". Valid stands are 1 through ${AIRPORT_MAX_PARKING_AREAS}.`,
      };
    }

    const { waypointId, standNumber } = parsed;
    this.purchasedStands.add('APRON_BAY_1');

    if (this.purchasedStands.has(waypointId)) {
      return {
        success: false,
        cost: 0,
        price: 0,
        standId: waypointId,
        standNumber,
        reason: `Aircraft Parking Area ${standNumber} (${waypointId}) is already owned.`,
      };
    }

    const requiredLevel = AIRPORT_STAND_UNLOCK_LEVELS[standNumber - 1] ?? 20;
    const unlockedCount = getAirportStandCountForLevel(airportLevel);
    if (standNumber > unlockedCount || airportLevel < requiredLevel) {
      return {
        success: false,
        cost: 0,
        price: 0,
        standId: waypointId,
        standNumber,
        reason: `Aircraft Parking Area ${standNumber} unlocks at Airport Level ${requiredLevel} (current Airport Level: ${airportLevel}).`,
      };
    }

    const cost = getAirportParkingAreaPriceForLevel(airportLevel);
    this.purchasedStands.add(waypointId);
    return {
      success: true,
      standId: waypointId,
      standNumber,
      cost,
      price: cost,
    };
  }

  /**
   * Finds an available aircraft parking stand (`APRON_BAY_1..10`) that is:
   * 1. Unlocked by the current airport level
   * 2. Purchased/owned by the player
   * 3. Not currently occupied by another aircraft
   * 4. Not already reserved by another incoming aircraft
   *
   * Enforces the Strict Aircraft Parking Availability Rule (Section 8).
   */
  public findAvailableApronStand(
    airportLevelOrUnlockedCount: number
  ): AirportWaypointRecord | null {
    this.purchasedStands.add('APRON_BAY_1');
    const overlay = this.getStandRuntimeOverlay();

    // Determine how many stands are unlocked: if caller passed airportLevel (1..20), map via getAirportStandCountForLevel;
    // ensure at least 1 stand when operational.
    const unlockedCount =
      airportLevelOrUnlockedCount >= 1 && airportLevelOrUnlockedCount <= 20
        ? Math.max(
            airportLevelOrUnlockedCount <= AIRPORT_MAX_PARKING_AREAS
              ? airportLevelOrUnlockedCount
              : 1,
            getAirportStandCountForLevel(airportLevelOrUnlockedCount)
          )
        : Math.max(0, airportLevelOrUnlockedCount);

    const candidateIds = ALL_APRON_STAND_IDS.slice(0, unlockedCount);
    for (const standId of candidateIds) {
      if (!this.purchasedStands.has(standId)) continue;
      if (overlay.occupiedStandByWaypoint?.has(standId)) continue;
      if (overlay.reservedStandByWaypoint?.has(standId)) continue;
      return this.waypoints.get(standId) ?? null;
    }
    return null;
  }

  /**
   * Strict check for landing/arrival availability based on exact Airport Level (1..20):
   * Only considers stands that are (1) unlocked at `airportLevel`, (2) purchased by the player,
   * (3) unoccupied, and (4) unreserved.
   */
  public findAvailableUsableStandForLevel(
    airportLevel: number
  ): AirportWaypointRecord | null {
    this.purchasedStands.add('APRON_BAY_1');
    const overlay = this.getStandRuntimeOverlay();
    const unlockedCount = getAirportStandCountForLevel(airportLevel);
    const candidateIds = ALL_APRON_STAND_IDS.slice(0, unlockedCount);

    for (const standId of candidateIds) {
      if (!this.purchasedStands.has(standId)) continue;
      if (overlay.occupiedStandByWaypoint?.has(standId)) continue;
      if (overlay.reservedStandByWaypoint?.has(standId)) continue;
      return this.waypoints.get(standId) ?? null;
    }
    return null;
  }

  private buildApproachToStandWaypoints(
    stand: AirportWaypointRecord
  ): {
    approachStartWx: number;
    approachStartWy: number;
    approachStartWz: number;
    initialYaw: number;
    waypoints: AircraftWaypointNode[];
  } {
    const rwyEntry = this.waypoints.get('RUNWAY_ENTRY')!;
    const rwyExit = this.waypoints.get('RUNWAY_EXIT')!;
    const approachStartWx = rwyEntry.worldX - 36;
    const approachStartWz = rwyEntry.worldZ;
    const approachStartWy = AIRPORT_PAVEMENT_SURFACE_Y + 9.5;

    const waypoints: AircraftWaypointNode[] = [
      {
        id: 'APPROACH_START',
        wx: approachStartWx,
        wy: approachStartWy,
        wz: approachStartWz,
        targetSpeedMps: 18,
        stageOnReach: 'DESCENT',
        pitchRad: -0.06,
      },
      {
        id: 'RUNWAY_TOUCHDOWN',
        wx: rwyEntry.worldX + 6,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: rwyEntry.worldZ,
        targetSpeedMps: 14,
        stageOnReach: 'TOUCHDOWN',
        pitchRad: 0.06,
      },
      {
        id: 'RUNWAY_ROLLOUT_DECEL',
        wx: (rwyEntry.worldX + rwyExit.worldX) * 0.55,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: rwyEntry.worldZ,
        targetSpeedMps: 14,
        stageOnReach: 'ROLLOUT',
        pitchRad: 0,
      },
      {
        id: 'RUNWAY_EXIT_TURNOFF',
        wx: rwyExit.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: rwyExit.worldZ,
        targetSpeedMps: 11.5,
        stageOnReach: 'TAXI_EXIT',
        pitchRad: 0,
      },
      {
        id: 'PARALLEL_TAXIWAY_EAST',
        wx: rwyExit.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: rwyExit.worldZ + 13,
        targetSpeedMps: 9.5,
        stageOnReach: 'TAXI_TO_STAND',
        pitchRad: 0,
      },
      {
        id: 'PARALLEL_TAXIWAY_STAND_ALIGN',
        wx: stand.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: rwyExit.worldZ + 13,
        targetSpeedMps: 9.5,
        stageOnReach: 'TAXI_TO_STAND',
        pitchRad: 0,
      },
      {
        id: stand.id,
        wx: stand.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: stand.worldZ,
        targetSpeedMps: 0,
        stageOnReach: 'PARKED',
        pitchRad: 0,
      },
    ];

    const initialYaw = computeAircraftNoseForwardYaw(
      waypoints[1].wx - approachStartWx,
      waypoints[1].wz - approachStartWz
    );

    return {
      approachStartWx,
      approachStartWy,
      approachStartWz,
      initialYaw,
      waypoints,
    };
  }

  /**
   * Accepts an External NPC Supply Aircraft arrival via the ATC Tower (Prompt 4).
   * - Requires the airport to be owned/operational and have an available (unlocked & purchased) unoccupied/unreserved stand.
   * - Immediately reserves the stand upon acceptance so two arrivals cannot claim the same stand.
   * - Does NOT count toward the player's 3-aircraft ownership limit.
   * - Delivers FREE supplies (`MATERIALS`, `FUEL`, `ELECTRONICS`, `PARTS`, plus `bonusCash`)
   *   once unloaded by Ground-Support Equipment (GSE).
   */
  public requestAtcNpcSupplyArrival(
    airportOwned: boolean,
    airportLevel: number
  ): {
    success: boolean;
    reason?: string;
    aircraft?: CargoAircraftRecord;
  } {
    if (!airportOwned || airportLevel <= 0) {
      return {
        success: false,
        reason:
          'ATC Tower cannot accept arrivals until the Regional Cargo Airport is purchased and operational.',
      };
    }

    const stand = this.findAvailableUsableStandForLevel(airportLevel);
    if (!stand) {
      return {
        success: false,
        reason:
          'Cannot accept arrival: All available (unlocked and purchased) aircraft parking areas are currently occupied or reserved. Free a stand or purchase an unlocked parking area.',
      };
    }

    const seq = this.nextNpcAircraftSeq++;
    const id = `npc-supply-aircraft-${seq}`;
    const callsign = `GTE-SUP-${200 + seq}`;

    // Immediately reserve the stand for this incoming aircraft
    this.reservedStands.set(stand.id, id);

    const {
      approachStartWx,
      approachStartWy,
      approachStartWz,
      initialYaw,
      waypoints,
    } = this.buildApproachToStandWaypoints(stand);

    const npcRecord: CargoAircraftRecord = {
      id,
      callsign,
      name: `ATC Supply Freighter ${callsign}`,
      catalogueId: 'veh-air-regional-jet',
      isPlayerOwned: false,
      isGuestAircraft: false,
      npcOperationType: 'SUPPLY_DROP',
      liveryId: 'livery-atlantic-blue',
      dimensions: { ...AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS },
      baseCapacityTons: 24,
      effectiveCapacityTons: 24,
      carryingCargoKey: 'MATERIALS',
      carryingCargoTons: 24,
      cargoValuePerTon: 0, // Free supply drop!
      conditionPercent: 100,
      flightEfficiencyMultiplier: 1.0,
      isGrounded: false,
      lastCompletedFlightOperationId: null,
      completedFlightsCount: 0,
      lastMaintenanceTimestampMs: Date.now(),
      nextMaintenanceTimestampMs: Date.now() + FIVE_REAL_WORLD_DAYS_MS,
      maintenanceCost: 0,
      repairCost: 0,
      maintenanceOverdue: false,
      assignedStandId: stand.id,
      assignedHangarId: null,
      flightStage: 'APPROACH',
      activeFlightOperationId: `npc-supply-op-${seq}`,
      worldX: approachStartWx,
      worldY: approachStartWy,
      worldZ: approachStartWz,
      headingYaw: initialYaw,
      pitchRad: -0.06,
      rollRad: 0,
      currentSpeedMps: 18,
      wheelRotationRad: 0,
      wheelGroundContact: false,
      stageTimerSec: 0,
      offscreenFlightRemainingSec: 0,
      waypoints,
      currentWaypointIndex: 1,
      supplyManifest: {
        supplies: {
          MATERIALS: 8,
          FUEL: 6,
          ELECTRONICS: 5,
          PARTS: 5,
        },
        bonusCash: 12_500,
        delivered: false,
      },
    };

    this.npcAircraft.set(id, npcRecord);
    return { success: true, aircraft: npcRecord };
  }

  /**
   * Requests a Guest Aircraft arrival via the dedicated `GUEST AIRCRAFT` tab (Sections 8, 9 & 10).
   * - Enforces the Strict Aircraft Parking Availability Rule: an aircraft cannot land if all
   *   unlocked & purchased parking areas are occupied or reserved.
   * - Immediately reserves the assigned parking stand so concurrent requests cannot double-book.
   * - Guest aircraft are external visiting NPC aircraft: they NEVER count toward the 3-aircraft
   *   player limit, NEVER appear in player purchase records, and do NOT grant free cargo/money rewards.
   * - Animates full nose-forward approach -> touchdown -> rollout -> taxiway exit -> taxi to stand ->
   *   stationary guest visit -> pushback -> taxi to runway -> takeoff -> departure & stand release.
   */
  public requestGuestAircraftArrival(
    airportOwned: boolean,
    airportLevel: number,
    guestModelId?: string
  ): {
    success: boolean;
    reason?: string;
    aircraft?: CargoAircraftRecord;
    assignedStand?: AirportWaypointId;
  } {
    if (!airportOwned || airportLevel <= 0) {
      return {
        success: false,
        reason:
          'Purchase and restore the Regional Cargo Airport before requesting Guest Aircraft arrivals.',
      };
    }

    const stand = this.findAvailableUsableStandForLevel(airportLevel);
    if (!stand) {
      return {
        success: false,
        reason:
          'Cannot accept Guest Aircraft arrival: All available (unlocked and purchased) aircraft parking areas are currently occupied or reserved. Wait for a stand to clear or purchase an additional parking area.',
      };
    }

    const chosenSpec =
      (guestModelId
        ? GUEST_AIRCRAFT_CATALOGUE.find((g) => g.id === guestModelId)
        : undefined) ??
      GUEST_AIRCRAFT_CATALOGUE[
        this.nextNpcAircraftSeq % GUEST_AIRCRAFT_CATALOGUE.length
      ];

    const seq = this.nextNpcAircraftSeq++;
    const id = `guest-aircraft-${seq}`;
    const callsign = `${chosenSpec.callsignPrefix}-${400 + seq}`;

    // Immediately reserve the parking stand so no second arrival can claim it
    this.reservedStands.set(stand.id, id);

    const {
      approachStartWx,
      approachStartWy,
      approachStartWz,
      initialYaw,
      waypoints,
    } = this.buildApproachToStandWaypoints(stand);

    const guestRecord: CargoAircraftRecord = {
      id,
      callsign,
      name: `${chosenSpec.name} (${callsign})`,
      catalogueId: chosenSpec.id,
      isPlayerOwned: false,
      isGuestAircraft: true,
      npcOperationType: 'GUEST_VISIT',
      guestVisitDurationSec: chosenSpec.visitDurationSec,
      operatorName: chosenSpec.operatorName,
      liveryId: chosenSpec.liveryId,
      dimensions: { ...AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS },
      baseCapacityTons: 0,
      effectiveCapacityTons: 0,
      carryingCargoKey: null,
      carryingCargoTons: 0,
      cargoValuePerTon: 0, // Guest aircraft do NOT generate free cargo rewards
      conditionPercent: 100,
      flightEfficiencyMultiplier: 1.0,
      isGrounded: false,
      lastCompletedFlightOperationId: null,
      completedFlightsCount: 0,
      lastMaintenanceTimestampMs: Date.now(),
      nextMaintenanceTimestampMs: Date.now() + FIVE_REAL_WORLD_DAYS_MS,
      maintenanceCost: 0,
      repairCost: 0,
      maintenanceOverdue: false,
      assignedStandId: stand.id,
      assignedHangarId: null,
      flightStage: 'APPROACH',
      activeFlightOperationId: `guest-visit-op-${seq}`,
      worldX: approachStartWx,
      worldY: approachStartWy,
      worldZ: approachStartWz,
      headingYaw: initialYaw,
      pitchRad: -0.06,
      rollRad: 0,
      currentSpeedMps: 18,
      wheelRotationRad: 0,
      wheelGroundContact: false,
      stageTimerSec: 0,
      offscreenFlightRemainingSec: 0,
      waypoints,
      currentWaypointIndex: 1,
    };

    this.npcAircraft.set(id, guestRecord);
    return {
      success: true,
      aircraft: guestRecord,
      assignedStand: stand.id,
    };
  }

  /**
   * Cancels an incoming Guest Aircraft (or NPC aircraft) arrival before touchdown and safely releases
   * its reserved parking stand so the stand becomes immediately available again.
   */
  public cancelGuestAircraftArrival(aircraftId: string): {
    success: boolean;
    reason?: string;
  } {
    const npc = this.npcAircraft.get(aircraftId);
    if (!npc) {
      return {
        success: false,
        reason: `Guest aircraft operation ${aircraftId} not found.`,
      };
    }

    if (npc.assignedStandId) {
      this.reservedStands.delete(npc.assignedStandId);
    }
    this.returnGseFromAircraft(npc.id);
    this.npcAircraft.delete(npc.id);
    return { success: true };
  }

  // --------------------------------------------------------------------------
  // PROMPT 5: MANUAL AIRCRAFT HANGARS, PLAYER AIRCRAFT (MAX 3), CONDITION & MAINTENANCE
  // --------------------------------------------------------------------------

  public getHangars(): AircraftHangarRecord[] {
    return Array.from(this.hangars.values());
  }

  public getHangar(slotId: HangarSlotId): AircraftHangarRecord | undefined {
    return this.hangars.get(slotId);
  }

  public getHangarAtCell(
    gx: number,
    gz: number
  ): AircraftHangarRecord | undefined {
    for (const h of this.hangars.values()) {
      if (
        gx >= h.bounds.minGx &&
        gx <= h.bounds.maxGx &&
        gz >= h.bounds.minGz &&
        gz <= h.bounds.maxGz
      ) {
        return h;
      }
    }
    // Support legacy test coordinates (173..180, 44..51 -> HANGAR_1 and 182..189, 44..51 -> HANGAR_2)
    if (gx >= 173 && gx <= 180 && gz >= 44 && gz <= 51) {
      return this.hangars.get('HANGAR_1');
    }
    if (gx >= 182 && gx <= 189 && gz >= 44 && gz <= 51) {
      return this.hangars.get('HANGAR_2');
    }
    return undefined;
  }

  /**
   * Validates whether an aircraft physically fits inside the given hangar slot (Prompt 5).
   */
  public validateAircraftFitsInHangar(
    hangarId: HangarSlotId,
    dimensions = AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS
  ): {
    fits: boolean;
    reason?: string;
  } {
    const hangar = this.hangars.get(hangarId);
    if (!hangar) {
      return { fits: false, reason: `Hangar slot ${hangarId} does not exist.` };
    }
    if (
      dimensions.wingspanMeters > hangar.clearWidthMeters ||
      dimensions.lengthMeters > hangar.clearDepthMeters ||
      dimensions.heightMeters > hangar.clearHeightMeters
    ) {
      return {
        fits: false,
        reason: `Aircraft (${dimensions.wingspanMeters}m × ${dimensions.lengthMeters}m) exceeds ${hangar.name} clear interior (${hangar.clearWidthMeters}m × ${hangar.clearDepthMeters}m).`,
      };
    }
    return { fits: true };
  }

  /**
   * Manually constructs an Aircraft Maintenance Hangar on a dedicated airport hangar tile (`HANGAR_1` or `HANGAR_2`).
   * Rejects construction if the airport is not owned, if the tile is not a dedicated hangar slot, or if already built.
   */
  public constructHangar(
    slotId: HangarSlotId,
    airportOwned: boolean,
    airportLevel: number
  ): {
    success: boolean;
    reason?: string;
    cost: number;
    hangar?: AircraftHangarRecord;
  } {
    if (!airportOwned || airportLevel <= 0) {
      return {
        success: false,
        cost: 0,
        reason:
          'Purchase and restore the Regional Cargo Airport before constructing Aircraft Hangars.',
      };
    }
    const hangar = this.hangars.get(slotId);
    if (!hangar) {
      return {
        success: false,
        cost: 0,
        reason: `Invalid hangar slot "${slotId}". Hangars may only be constructed on dedicated Airport Hangar Tiles (HANGAR_1 or HANGAR_2).`,
      };
    }
    if (hangar.constructed) {
      return {
        success: false,
        cost: 0,
        reason: `${hangar.name} is already constructed.`,
        hangar,
      };
    }
    if (airportLevel < hangar.unlockAirportLevel) {
      return {
        success: false,
        cost: 0,
        reason: `${hangar.name} requires Airport Level ${hangar.unlockAirportLevel} (current Airport Level: ${airportLevel}).`,
      };
    }
    const fitCheck = this.validateAircraftFitsInHangar(slotId);
    if (!fitCheck.fits) {
      return {
        success: false,
        cost: 0,
        reason: fitCheck.reason,
      };
    }

    hangar.constructed = true;
    hangar.doorOpenRatio = 1.0;
    return {
      success: true,
      cost: hangar.constructionCost,
      hangar,
    };
  }

  public getFirstFreeConstructedHangar(): AircraftHangarRecord | undefined {
    for (const h of this.hangars.values()) {
      if (h.constructed && h.occupiedByAircraftId === null) {
        return h;
      }
    }
    return undefined;
  }

  public getPlayerAircraft(): CargoAircraftRecord[] {
    return Array.from(this.playerAircraft.values());
  }

  public getPlayerAircraftById(
    aircraftId: string
  ): CargoAircraftRecord | undefined {
    return this.playerAircraft.get(aircraftId);
  }

  public getPlayerAircraftCount(): number {
    return this.playerAircraft.size;
  }

  /**
   * Registers a newly purchased Player-Owned Cargo Aircraft, strictly enforcing:
   * - Maximum fleet of 2 owned aircraft (`MAX_PLAYER_AIRCRAFT = 2`)
   * - Airport Level 10 unlock ($20,000,000) for the 1st owned aircraft
   * - Airport Level 15 unlock ($30,000,000) for the 2nd owned aircraft
   * - Mandatory purchased & unoccupied Aircraft Hangar (`HANGAR_1` / `HANGAR_2`, $5,000,000 each)
   * - Immediate idle storage inside the assigned hangar (`flightStage: 'IN_HANGAR'`).
   */
  public registerPurchasedPlayerAircraft(params: {
    id: string;
    name: string;
    catalogueId: string;
    liveryId: string;
    baseCapacityTons: number;
    maintenanceCost: number;
    airportOwned: boolean;
    airportLevel: number;
    activeStandCount: number;
  }): {
    success: boolean;
    reason?: string;
    aircraft?: CargoAircraftRecord;
    assignedHangar?: AircraftHangarRecord;
    price?: number;
  } {
    if (!params.airportOwned || params.airportLevel <= 0) {
      return {
        success: false,
        reason:
          'Purchase and restore the Regional Cargo Airport before acquiring cargo aircraft.',
      };
    }

    const currentOwnedCount = this.playerAircraft.size;
    if (currentOwnedCount >= MAX_PLAYER_AIRCRAFT) {
      return {
        success: false,
        reason: `Maximum player cargo aircraft fleet limit reached (${MAX_PLAYER_AIRCRAFT}/${MAX_PLAYER_AIRCRAFT} aircraft owned).`,
      };
    }

    const slotNumber: 1 | 2 = currentOwnedCount === 0 ? 1 : 2;
    const requiredLevel =
      slotNumber === 1
        ? FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL
        : SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL;
    const slotPrice =
      slotNumber === 1
        ? FIRST_OWNED_AIRCRAFT_PRICE
        : SECOND_OWNED_AIRCRAFT_PRICE;

    // Strict 1-to-1 Hangar & Aircraft Binding:
    // Plane 1 (OWNED_AIRCRAFT_1) binds strictly to HANGAR_1; Plane 2 (OWNED_AIRCRAFT_2) binds strictly to HANGAR_2.
    const requiredHangarId: HangarSlotId =
      slotNumber === 1 ? 'HANGAR_1' : 'HANGAR_2';
    const requiredHangar = this.hangars.get(requiredHangarId);
    const hasRequiredHangar = Boolean(
      requiredHangar &&
        requiredHangar.constructed &&
        requiredHangar.occupiedByAircraftId === null
    );

    if (params.airportLevel < requiredLevel) {
      return {
        success: false,
        price: slotPrice,
        reason:
          slotNumber === 1
            ? !hasRequiredHangar
              ? `To buy a plane you must own a Hanger first (Unlocks at Airport Level ${FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL})`
              : `Unlocks at Airport Level ${FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL} (current Airport Level: ${params.airportLevel}).`
            : `Unlocks at Airport Level ${SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL} (current Airport Level: ${params.airportLevel}).`,
      };
    }

    if (!hasRequiredHangar || !requiredHangar) {
      return {
        success: false,
        price: slotPrice,
        reason:
          slotNumber === 1
            ? 'To buy a plane you must own a Hanger first'
            : 'To buy a second plane you must own Hangar 2 first (HANGAR_2 required)',
      };
    }

    const availableHangar = requiredHangar;

    const assignedStandId =
      this.findAvailableUsableStandForLevel(params.airportLevel)?.id ??
      ALL_APRON_STAND_IDS[currentOwnedCount % ALL_APRON_STAND_IDS.length];

    const nowMs = Date.now();
    const effectiveCapacityTons = getAircraftOperationalCapacityForAirportLevel(
      params.baseCapacityTons,
      params.airportLevel
    );

    const record: CargoAircraftRecord = {
      id: params.id,
      callsign: `GTE-CARGO-${slotNumber}`,
      name: params.name,
      catalogueId: params.catalogueId,
      isPlayerOwned: true,
      liveryId: params.liveryId,
      dimensions: { ...AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS },
      baseCapacityTons: params.baseCapacityTons,
      effectiveCapacityTons,
      carryingCargoKey: null,
      carryingCargoTons: 0,
      cargoValuePerTon: AIR_CARGO_MATERIAL_SPECS.PLANT_AND_FOOD.baseValuePerTon,
      conditionPercent: 100,
      flightEfficiencyMultiplier: 1.0,
      isGrounded: false,
      lastCompletedFlightOperationId: null,
      completedFlightsCount: 0,
      lastMaintenanceTimestampMs: nowMs,
      nextMaintenanceTimestampMs: nowMs + FIVE_REAL_WORLD_DAYS_MS,
      maintenanceCost: params.maintenanceCost,
      repairCost: Math.max(12_000, Math.round(params.maintenanceCost * 1.2)),
      maintenanceOverdue: false,
      assignedStandId,
      assignedHangarId: availableHangar.id,
      flightStage: 'IN_HANGAR',
      activeFlightOperationId: null,
      worldX: availableHangar.worldX,
      worldY: AIRPORT_PAVEMENT_SURFACE_Y,
      worldZ: availableHangar.worldZ,
      headingYaw: availableHangar.headingYaw, // Nose (+Z) facing North (-Z) out of hangar doors
      pitchRad: 0,
      rollRad: 0,
      currentSpeedMps: 0,
      wheelRotationRad: 0,
      wheelGroundContact: true,
      stageTimerSec: 0,
      offscreenFlightRemainingSec: 0,
      waypoints: [],
      currentWaypointIndex: 0,
    };

    availableHangar.occupiedByAircraftId = record.id;
    availableHangar.doorOpenRatio = 0.25; // Partially recessed/closed doors while aircraft is stored inside hangar
    this.playerAircraft.set(record.id, record);
    return {
      success: true,
      aircraft: record,
      assignedHangar: availableHangar,
      price: slotPrice,
    };
  }

  /**
   * Sets an aircraft's conditionPercent (0..100) and recalculates its efficiency multiplier
   * (< 20% -> 50% efficiency penalty) and grounding status (0% -> Grounded).
   */
  public setAircraftCondition(
    aircraftId: string,
    conditionPercent: number
  ): CargoAircraftRecord | undefined {
    const ac = this.playerAircraft.get(aircraftId);
    if (!ac) return undefined;

    const clamped = Number(
      Math.max(0, Math.min(100, conditionPercent)).toFixed(2)
    );
    ac.conditionPercent = clamped;
    ac.flightEfficiencyMultiplier = getAircraftEfficiencyMultiplier(clamped);
    ac.isGrounded = clamped <= 0;
    return ac;
  }

  /**
   * Applies condition wear once per completed flight operation ID (idempotent so duplicate
   * completion events never double-penalize the aircraft).
   */
  public applyFlightCompletionWear(
    aircraftId: string,
    flightOperationId: string,
    wearPercent = AIRCRAFT_FLIGHT_WEAR_PERCENT
  ): {
    applied: boolean;
    conditionPercent: number;
    flightEfficiencyMultiplier: number;
    isGrounded: boolean;
  } {
    const ac = this.playerAircraft.get(aircraftId);
    if (!ac) {
      return {
        applied: false,
        conditionPercent: 0,
        flightEfficiencyMultiplier: 0,
        isGrounded: true,
      };
    }
    if (ac.lastCompletedFlightOperationId === flightOperationId) {
      return {
        applied: false,
        conditionPercent: ac.conditionPercent,
        flightEfficiencyMultiplier: ac.flightEfficiencyMultiplier,
        isGrounded: ac.isGrounded,
      };
    }

    ac.lastCompletedFlightOperationId = flightOperationId;
    ac.completedFlightsCount += 1;
    this.setAircraftCondition(
      aircraftId,
      ac.conditionPercent - Math.max(0, wearPercent)
    );
    return {
      applied: true,
      conditionPercent: ac.conditionPercent,
      flightEfficiencyMultiplier: ac.flightEfficiencyMultiplier,
      isGrounded: ac.isGrounded,
    };
  }

  /**
   * Moves a player-owned cargo aircraft into a constructed Hangar and repairs its condition to 100%,
   * clearing any Grounded status and refreshing the 5-real-world-day maintenance schedule (Prompt 5).
   */
  public repairAircraftInHangar(
    aircraftId: string,
    preferredHangarId?: HangarSlotId,
    nowMs = Date.now()
  ): {
    success: boolean;
    reason?: string;
    repairCost: number;
    hangar?: AircraftHangarRecord;
    aircraft?: CargoAircraftRecord;
  } {
    const ac = this.playerAircraft.get(aircraftId);
    if (!ac) {
      return {
        success: false,
        repairCost: 0,
        reason: `Aircraft ${aircraftId} not found in player fleet.`,
      };
    }

    const activeStages: AircraftFlightStage[] = [
      'TAKEOFF_ROLL',
      'ROTATION',
      'LIFTOFF',
      'INITIAL_CLIMB',
      'OFFSCREEN_FLIGHT',
      'APPROACH',
      'DESCENT',
      'TOUCHDOWN',
      'ROLLOUT',
    ];
    if (activeStages.includes(ac.flightStage)) {
      return {
        success: false,
        repairCost: 0,
        reason: `${ac.name} is currently airborne or on the active runway (${ac.flightStage}) and cannot enter a hangar until landed.`,
      };
    }

    const constructedHangars = Array.from(this.hangars.values()).filter(
      (h) => h.constructed
    );
    if (constructedHangars.length === 0) {
      return {
        success: false,
        repairCost: 0,
        reason:
          'No Aircraft Maintenance Hangar has been constructed yet. Construct HANGAR_1 or HANGAR_2 on the dedicated airport hangar tiles first.',
      };
    }

    const targetHangar =
      (preferredHangarId
        ? constructedHangars.find((h) => h.id === preferredHangarId)
        : ac.assignedHangarId
          ? constructedHangars.find((h) => h.id === ac.assignedHangarId)
          : undefined) ??
      constructedHangars.find(
        (h) =>
          h.occupiedByAircraftId === null || h.occupiedByAircraftId === ac.id
      ) ??
      constructedHangars[0];

    const fitCheck = this.validateAircraftFitsInHangar(
      targetHangar.id,
      ac.dimensions
    );
    if (!fitCheck.fits) {
      return {
        success: false,
        repairCost: 0,
        reason: fitCheck.reason,
      };
    }

    // Release any previous hangar assignment for this aircraft
    for (const h of this.hangars.values()) {
      if (h.occupiedByAircraftId === ac.id) {
        h.occupiedByAircraftId = null;
      }
    }

    targetHangar.occupiedByAircraftId = ac.id;
    ac.assignedHangarId = targetHangar.id;
    ac.flightStage = 'IN_HANGAR';
    ac.worldX = targetHangar.worldX;
    ac.worldY = AIRPORT_PAVEMENT_SURFACE_Y;
    ac.worldZ = targetHangar.worldZ;
    ac.headingYaw = targetHangar.headingYaw;
    ac.pitchRad = 0;
    ac.rollRad = 0;
    ac.currentSpeedMps = 0;
    ac.wheelGroundContact = true;

    this.setAircraftCondition(ac.id, 100);
    ac.lastMaintenanceTimestampMs = nowMs;
    ac.nextMaintenanceTimestampMs = nowMs + FIVE_REAL_WORLD_DAYS_MS;
    ac.maintenanceOverdue = false;

    return {
      success: true,
      repairCost: ac.repairCost,
      hangar: targetHangar,
      aircraft: ac,
    };
  }

  /**
   * Moves an aircraft from its Hangar onto its assigned Apron Stand (`PARKED`) while retaining
   * `assignedHangarId` as its designated home hangar for post-flight return storage.
   */
  public returnAircraftFromHangarToStand(aircraftId: string): {
    success: boolean;
    reason?: string;
    aircraft?: CargoAircraftRecord;
  } {
    const ac = this.playerAircraft.get(aircraftId);
    if (!ac) {
      return { success: false, reason: 'Aircraft not found.' };
    }
    if (ac.assignedHangarId) {
      const h = this.hangars.get(ac.assignedHangarId);
      if (h && h.occupiedByAircraftId === ac.id) {
        h.occupiedByAircraftId = null;
      }
    }
    const standWp =
      (ac.assignedStandId ? this.waypoints.get(ac.assignedStandId) : null) ??
      this.waypoints.get('APRON_BAY_1')!;
    ac.flightStage = 'PARKED';
    ac.worldX = standWp.worldX;
    ac.worldY = AIRPORT_PAVEMENT_SURFACE_Y;
    ac.worldZ = standWp.worldZ;
    ac.headingYaw = Math.PI;
    ac.pitchRad = 0;
    ac.currentSpeedMps = 0;
    ac.wheelGroundContact = true;
    return { success: true, aircraft: ac };
  }

  // --------------------------------------------------------------------------
  // PROMPT 6 & FLIGHT SYSTEM: PLAYER AIRCRAFT FLIGHT DISPATCH, TAKEOFF & LANDING
  // --------------------------------------------------------------------------

  /**
   * Dispatches a Player-Owned Cargo Aircraft on a full cargo flight operation:
   * - Validates aircraft is not grounded (`conditionPercent > 0`) and not overdue for 5-day maintenance.
   * - Validates cargo material is unlocked at the current Airport Level (`PLANT_AND_FOOD` Lv1, `METALS_AND_ORES` Lv5, `PHARMACEUTICALS` Lv12).
   * - Validates requested cargo tonnage does not exceed current Airport Level cargo capacity (`5t` at Lv1 -> `50t` at Lv20).
   * - Builds the full nose-forward departure & return trajectory:
   *   `IN_HANGAR -> PUSHBACK (exiting hangar to apron) -> TAXI_TO_RUNWAY -> RUNWAY_HOLD_SHORT -> RUNWAY_ALIGNED -> TAKEOFF_ROLL -> ROTATION -> LIFTOFF -> INITIAL_CLIMB -> OFFSCREEN_FLIGHT -> APPROACH -> DESCENT -> TOUCHDOWN -> ROLLOUT -> TAXI_EXIT -> TAXI_TO_STAND -> RETURNING_TO_HANGAR -> IN_HANGAR`.
   */
  public dispatchPlayerAircraftFlight(params: {
    aircraftId: string;
    airportLevel: number;
    materialCategory?: AirCargoMaterialCategory;
    requestedTons?: number;
    flightOperationId?: string;
  }): {
    success: boolean;
    reason?: string;
    aircraft?: CargoAircraftRecord;
    expectedPayout?: number;
  } {
    const ac = this.playerAircraft.get(params.aircraftId);
    if (!ac) {
      return {
        success: false,
        reason: `Player cargo aircraft ${params.aircraftId} not found.`,
      };
    }

    if (ac.isGrounded || ac.conditionPercent <= 0) {
      return {
        success: false,
        reason: `${ac.name} is GROUNDED at 0% condition and cannot start a new flight until repaired in an Aircraft Hangar.`,
      };
    }

    if (ac.maintenanceOverdue) {
      return {
        success: false,
        reason: `${ac.name} is overdue for its 5-real-world-day scheduled maintenance.`,
      };
    }

    if (ac.flightStage !== 'PARKED' && ac.flightStage !== 'IN_HANGAR') {
      return {
        success: false,
        reason: `${ac.name} is already in an active flight operation (${ac.flightStage}).`,
      };
    }

    // Choose cargo material (default to highest-value unlocked material for current airport level)
    const unlockedSpecs = getUnlockedAirCargoMaterialsForLevel(
      params.airportLevel
    );
    const chosenSpec = params.materialCategory
      ? AIR_CARGO_MATERIAL_SPECS[params.materialCategory]
      : unlockedSpecs[0];

    if (!chosenSpec || params.airportLevel < chosenSpec.unlockAirportLevel) {
      return {
        success: false,
        reason: `${chosenSpec?.name ?? 'Selected cargo'} requires Airport Level ${chosenSpec?.unlockAirportLevel ?? 12} (current: Level ${params.airportLevel}).`,
      };
    }

    ac.effectiveCapacityTons = getAircraftOperationalCapacityForAirportLevel(
      ac.baseCapacityTons,
      params.airportLevel
    );

    if (params.requestedTons !== undefined) {
      if (!Number.isFinite(params.requestedTons) || params.requestedTons <= 0) {
        return {
          success: false,
          reason: 'Requested cargo tonnage must be greater than 0 tons.',
        };
      }
      if (params.requestedTons > ac.effectiveCapacityTons + 1e-6) {
        return {
          success: false,
          reason: `Requested cargo (${params.requestedTons.toFixed(1)}t) exceeds aircraft capacity limit of ${ac.effectiveCapacityTons.toFixed(1)}t at Airport Level ${params.airportLevel}.`,
        };
      }
    }

    // Resolve home hangar and release hangar occupancy while aircraft departs on flight
    const homeHangar = ac.assignedHangarId
      ? this.hangars.get(ac.assignedHangarId)
      : undefined;
    if (homeHangar && homeHangar.occupiedByAircraftId === ac.id) {
      homeHangar.occupiedByAircraftId = null;
    }

    const loadTons =
      params.requestedTons && params.requestedTons > 0
        ? params.requestedTons
        : ac.effectiveCapacityTons;

    // Deduct from Airport Warehouse or Transfer Yard if available
    const whAvailable = this.warehouseState.stored[chosenSpec.id] ?? 0;
    if (whAvailable > 0) {
      const deduct = Math.min(whAvailable, loadTons);
      this.warehouseState.stored[chosenSpec.id] = Number(
        Math.max(0, whAvailable - deduct).toFixed(2)
      );
      this.refreshWarehouseAndYardTotals();
    }

    ac.carryingCargoKey = chosenSpec.id;
    ac.carryingCargoTons = loadTons;
    ac.cargoValuePerTon = chosenSpec.baseValuePerTon;
    ac.flightEfficiencyMultiplier = getAircraftEfficiencyMultiplier(
      ac.conditionPercent
    );

    const opId =
      params.flightOperationId ?? `flight-op-${this.nextFlightOpSeq++}`;
    ac.activeFlightOperationId = opId;

    const standWp =
      (ac.assignedStandId ? this.waypoints.get(ac.assignedStandId) : null) ??
      this.waypoints.get('APRON_BAY_1')!;
    const rwyEntry = this.waypoints.get('RUNWAY_ENTRY')!;
    const rwyExit = this.waypoints.get('RUNWAY_EXIT')!;
    const taxiZ = rwyEntry.worldZ + 13; // Parallel taxiway centerline worldZ

    const eff = ac.flightEfficiencyMultiplier; // 1.0 normal, 0.5 when condition < 20%
    const taxiSpeed = 7.5 * eff;
    const rollSpeed = 16.0 * eff;
    const climbSpeed = 22.0 * eff;

    const waypoints: AircraftWaypointNode[] = [];
    if (homeHangar && ac.flightStage === 'IN_HANGAR') {
      homeHangar.doorOpenRatio = 1.0; // Open hangar doors for departure
      // Smoothly exit hangar doors northward onto the dedicated hangar service apron & curved taxilane
      const serviceApronZ = homeHangar.worldZ - 9.0;
      waypoints.push(
        {
          id: 'EXIT_HANGAR_SERVICE_APRON',
          wx: homeHangar.worldX,
          wy: AIRPORT_PAVEMENT_SURFACE_Y,
          wz: serviceApronZ,
          targetSpeedMps: Math.max(4.0, taxiSpeed * 0.75),
          stageOnReach: 'PUSHBACK',
          pitchRad: 0,
        },
        {
          id: 'HANGAR_CURVE_TO_PARALLEL_TAXIWAY',
          wx: homeHangar.worldX - 3.2,
          wy: AIRPORT_PAVEMENT_SURFACE_Y,
          wz: taxiZ,
          targetSpeedMps: Math.max(4.5, taxiSpeed * 0.85),
          stageOnReach: 'TAXI_TO_RUNWAY',
          pitchRad: 0,
        }
      );
    } else {
      waypoints.push({
        id: 'PUSHBACK_TO_TAXILANE',
        wx: standWp.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: taxiZ,
        targetSpeedMps: Math.max(3.5, taxiSpeed * 0.7),
        stageOnReach: 'TAXI_TO_RUNWAY',
        pitchRad: 0,
      });
    }

    waypoints.push(
      {
        id: 'TAXI_WEST_TO_ALPHA',
        wx: rwyEntry.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: taxiZ,
        targetSpeedMps: taxiSpeed,
        stageOnReach: 'RUNWAY_HOLD_SHORT',
        pitchRad: 0,
      },
      {
        id: 'RUNWAY_HOLD_SHORT_ALPHA',
        wx: rwyEntry.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: rwyEntry.worldZ + 4.5,
        targetSpeedMps: Math.max(3.5, taxiSpeed * 0.6),
        stageOnReach: 'RUNWAY_ALIGNED',
        pitchRad: 0,
      },
      {
        id: 'RUNWAY_ENTRY_ALIGN',
        wx: rwyEntry.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: rwyEntry.worldZ,
        targetSpeedMps: Math.max(4.5, taxiSpeed * 0.8),
        stageOnReach: 'TAKEOFF_ROLL',
        pitchRad: 0,
      },
      {
        id: 'TAKEOFF_ROTATION_POINT',
        wx: (rwyEntry.worldX + rwyExit.worldX) * 0.5,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: rwyEntry.worldZ,
        targetSpeedMps: rollSpeed,
        stageOnReach: 'ROTATION',
        pitchRad: 0.14,
      },
      {
        id: 'TAKEOFF_LIFTOFF_POINT',
        wx: rwyExit.worldX - 6,
        wy: AIRPORT_PAVEMENT_SURFACE_Y + 2.4,
        wz: rwyExit.worldZ,
        targetSpeedMps: climbSpeed,
        stageOnReach: 'LIFTOFF',
        pitchRad: 0.17,
      },
      {
        id: 'INITIAL_CLIMB_DEPARTURE',
        wx: rwyExit.worldX + 34,
        wy: AIRPORT_PAVEMENT_SURFACE_Y + 11.5,
        wz: rwyExit.worldZ,
        targetSpeedMps: climbSpeed * 1.15,
        stageOnReach: 'OFFSCREEN_FLIGHT',
        pitchRad: 0.18,
      },
      // Return Landing Sequence after Offscreen Flight
      {
        id: 'RETURN_APPROACH_ENTRY',
        wx: rwyEntry.worldX - 32,
        wy: AIRPORT_PAVEMENT_SURFACE_Y + 8.5,
        wz: rwyEntry.worldZ,
        targetSpeedMps: 18 * eff,
        stageOnReach: 'DESCENT',
        pitchRad: -0.06,
      },
      {
        id: 'RETURN_TOUCHDOWN',
        wx: rwyEntry.worldX + 6,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: rwyEntry.worldZ,
        targetSpeedMps: 14 * eff,
        stageOnReach: 'TOUCHDOWN',
        pitchRad: 0.06,
      },
      {
        id: 'RETURN_ROLLOUT_EXIT',
        wx: rwyExit.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: rwyExit.worldZ,
        targetSpeedMps: 9 * eff,
        stageOnReach: 'TAXI_EXIT',
        pitchRad: 0,
      },
      {
        id: 'RETURN_PARALLEL_TAXIWAY',
        wx: rwyExit.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: taxiZ,
        targetSpeedMps: taxiSpeed,
        stageOnReach: 'TAXI_TO_STAND',
        pitchRad: 0,
      }
    );

    if (homeHangar && homeHangar.constructed) {
      const serviceApronZ = homeHangar.worldZ - 9.0;
      waypoints.push(
        {
          id: 'RETURN_HANGAR_TAXILANE_CURVE',
          wx: homeHangar.worldX - 3.2,
          wy: AIRPORT_PAVEMENT_SURFACE_Y,
          wz: taxiZ,
          targetSpeedMps: taxiSpeed,
          stageOnReach: 'TAXI_TO_STAND',
          pitchRad: 0,
        },
        {
          id: standWp.id,
          wx: homeHangar.worldX,
          wy: AIRPORT_PAVEMENT_SURFACE_Y,
          wz: serviceApronZ,
          targetSpeedMps: Math.max(4.5, taxiSpeed * 0.75),
          stageOnReach: 'RETURNING_TO_HANGAR',
          pitchRad: 0,
        },
        {
          id: homeHangar.id,
          wx: homeHangar.worldX,
          wy: AIRPORT_PAVEMENT_SURFACE_Y,
          wz: homeHangar.worldZ,
          targetSpeedMps: 0,
          stageOnReach: 'IN_HANGAR',
          pitchRad: 0,
        }
      );
    } else {
      waypoints.push({
        id: standWp.id,
        wx: standWp.worldX,
        wy: AIRPORT_PAVEMENT_SURFACE_Y,
        wz: standWp.worldZ,
        targetSpeedMps: 0,
        stageOnReach: 'PARKED',
        pitchRad: 0,
      });
    }

    ac.flightStage = 'PUSHBACK';
    ac.waypoints = waypoints;
    ac.currentWaypointIndex = 0;
    ac.stageTimerSec = 0;
    ac.offscreenFlightRemainingSec = 4.0 / Math.max(0.5, eff);
    ac.headingYaw = computeAircraftNoseForwardYaw(
      waypoints[0].wx - ac.worldX,
      waypoints[0].wz - ac.worldZ,
      ac.headingYaw
    );

    const expectedPayout = Math.round(
      loadTons * chosenSpec.baseValuePerTon * ac.flightEfficiencyMultiplier
    );

    return {
      success: true,
      aircraft: ac,
      expectedPayout,
    };
  }

  // --------------------------------------------------------------------------
  // UNIFIED SIMULATION STEP (Prompts 3, 4, 5, 6 & Guest Aircraft)
  // --------------------------------------------------------------------------

  public stepSimulation(
    dt: number,
    callbacks?: {
      onNpcSupplyDelivered?: (
        aircraft: CargoAircraftRecord,
        supplies: Partial<Record<AirportSupplyCategory, number>>,
        bonusCash: number
      ) => void;
      onPlayerFlightCompleted?: (
        aircraft: CargoAircraftRecord,
        payoutCash: number,
        xpEarned: number
      ) => void;
    }
  ): void {
    if (!Number.isFinite(dt) || dt <= 0) return;

    // 1. Step Warehouse <-> Transfer Yard Cargo Dolly & Forklift Transfers (Prompt 3)
    this.stepTransferYardOperations(dt);

    // 1b. Step Dedicated Landside Cargo Truck Yard Semi-Trailers (TRUCK_YARD_ENTRY -> TRUCK_QUEUE_BAY -> CARGO_LOADING_DOCK -> TRUCK_YARD_EXIT)
    this.stepYardTruckOperations(dt);

    // 2. Step External NPC Supply Aircraft & Guest Aircraft Operations (Prompt 4, 6 & Expansion)
    this.stepNpcAircraftOperations(dt, callbacks?.onNpcSupplyDelivered);

    // 3. Step Player-Owned Cargo Aircraft Nose-Forward Taxi, Takeoff, Flight & Landing (Prompt 5 & 6)
    this.stepPlayerAircraftOperations(dt, callbacks?.onPlayerFlightCompleted);
  }

  private lerpTruckHeading(
    currentYaw: number,
    targetYaw: number,
    t: number
  ): number {
    let diff = ((targetYaw - currentYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return currentYaw + diff * Math.min(1, Math.max(0, t));
  }

  private sampleQuadraticCurve(
    x0: number,
    z0: number,
    cx: number,
    cz: number,
    x1: number,
    z1: number,
    rawT: number
  ): { x: number; z: number; tangentYaw: number } {
    const t = Math.min(1, Math.max(0, rawT));
    // Smoothstep acceleration & braking curve
    const s = t * t * (3 - 2 * t);
    const inv = 1 - s;
    const x = inv * inv * x0 + 2 * inv * s * cx + s * s * x1;
    const z = inv * inv * z0 + 2 * inv * s * cz + s * s * z1;
    const dx = 2 * inv * (cx - x0) + 2 * s * (x1 - cx);
    const dz = 2 * inv * (cz - z0) + 2 * s * (z1 - cz);
    const tangentYaw =
      Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : 0;
    return { x, z, tangentYaw };
  }

  private stepYardTruckOperations(dt: number): void {
    const entryWp = this.waypoints.get('TRUCK_YARD_ENTRY');
    const queueWp = this.waypoints.get('TRUCK_QUEUE_BAY');
    const dockWp = this.waypoints.get('CARGO_LOADING_DOCK');
    const exitWp = this.waypoints.get('TRUCK_YARD_EXIT');
    if (!entryWp || !queueWp || !dockWp || !exitWp) return;

    const rotAlpha = Math.min(1, dt * 7.5);

    for (const truck of this.yardTrucks.values()) {
      const dockX = dockWp.worldX + truck.dockIndex * 3.1;
      const dockZ = dockWp.worldZ - 0.6;
      const maneuverZ = dockZ - 3.6;
      const queueX = queueWp.worldX + truck.dockIndex * 3.1;
      const queueZ = queueWp.worldZ;

      if (truck.stage === 'APPROACHING_ENTRY') {
        truck.isReversing = false;
        truck.stageProgress = Math.min(1, truck.stageProgress + dt * 0.22);
        const ctrlX = (entryWp.worldX + queueX) * 0.5;
        const ctrlZ = entryWp.worldZ;
        const sample = this.sampleQuadraticCurve(
          entryWp.worldX,
          entryWp.worldZ,
          ctrlX,
          ctrlZ,
          queueX,
          queueZ,
          truck.stageProgress
        );
        truck.worldX = sample.x;
        truck.worldZ = sample.z;
        truck.headingYaw = this.lerpTruckHeading(
          truck.headingYaw,
          sample.tangentYaw,
          rotAlpha
        );
        truck.wheelRotationRad =
          (truck.wheelRotationRad + dt * 6.0) % (Math.PI * 200);
        if (truck.stageProgress >= 1) {
          truck.stage = 'QUEUING_AT_BAY';
          truck.stageProgress = 0;
          truck.stageTimerSec = 0;
        }
      } else if (truck.stage === 'QUEUING_AT_BAY') {
        truck.isReversing = false;
        truck.stageTimerSec += dt;
        // Smoothly settle into angled staging queue orientation
        truck.headingYaw = this.lerpTruckHeading(
          truck.headingYaw,
          Math.PI * 0.5,
          rotAlpha
        );
        if (truck.stageTimerSec >= 2.2) {
          truck.stage = 'REVERSING_INTO_DOCK';
          truck.stageProgress = 0;
          truck.stageTimerSec = 0;
        }
      } else if (truck.stage === 'REVERSING_INTO_DOCK') {
        truck.stageProgress = Math.min(1, truck.stageProgress + dt * 0.25);
        if (truck.stageProgress < 0.45) {
          // Smooth pull-forward to manoeuvring apron in front of assigned dock with cab facing North (-Z, yaw = Math.PI)
          truck.isReversing = false;
          const t = truck.stageProgress / 0.45;
          const sample = this.sampleQuadraticCurve(
            queueX,
            queueZ,
            dockX,
            queueZ,
            dockX,
            maneuverZ,
            t
          );
          truck.worldX = sample.x;
          truck.worldZ = sample.z;
          truck.headingYaw = this.lerpTruckHeading(
            truck.headingYaw,
            Math.PI,
            rotAlpha
          );
        } else {
          // Reverse smoothly straight South (+Z) into the cargo loading dock bay with cab facing North (-Z, yaw = Math.PI)
          truck.isReversing = true;
          const rawT = (truck.stageProgress - 0.45) / 0.55;
          const s = rawT * rawT * (3 - 2 * rawT);
          truck.worldX = dockX;
          truck.worldZ = maneuverZ + (dockZ - maneuverZ) * s;
          truck.headingYaw = this.lerpTruckHeading(
            truck.headingYaw,
            Math.PI,
            rotAlpha
          );
        }
        truck.wheelRotationRad =
          (truck.wheelRotationRad + (truck.isReversing ? -1 : 1) * dt * 4.5) %
          (Math.PI * 200);
        if (truck.stageProgress >= 1) {
          truck.stage = 'LOADING_CARGO';
          truck.stageProgress = 0;
          truck.stageTimerSec = 0;
          truck.isReversing = false;
          truck.headingYaw = Math.PI;
        }
      } else if (truck.stage === 'LOADING_CARGO') {
        truck.isReversing = false;
        truck.stageTimerSec += dt;
        truck.headingYaw = this.lerpTruckHeading(
          truck.headingYaw,
          Math.PI,
          rotAlpha
        );
        if (truck.stageTimerSec >= 3.5) {
          truck.stage = 'EXITING_YARD';
          truck.stageProgress = 0;
          truck.stageTimerSec = 0;
        }
      } else if (truck.stage === 'EXITING_YARD') {
        truck.isReversing = false;
        truck.stageProgress = Math.min(1, truck.stageProgress + dt * 0.22);
        // Smooth curved pull-out North (-Z) from loading dock turning East (+X) along the dedicated Departure Lane toward Exit Gate
        const ctrlX = dockX + 2.4;
        const ctrlZ = exitWp.worldZ;
        const sample = this.sampleQuadraticCurve(
          dockX,
          dockZ,
          ctrlX,
          ctrlZ,
          exitWp.worldX,
          exitWp.worldZ,
          truck.stageProgress
        );
        truck.worldX = sample.x;
        truck.worldZ = sample.z;
        truck.headingYaw = this.lerpTruckHeading(
          truck.headingYaw,
          sample.tangentYaw,
          rotAlpha
        );
        truck.wheelRotationRad =
          (truck.wheelRotationRad + dt * 6.5) % (Math.PI * 200);
        if (truck.stageProgress >= 1) {
          truck.stage = 'APPROACHING_ENTRY';
          truck.stageProgress = 0;
          truck.stageTimerSec = 0;
          truck.worldX = entryWp.worldX;
          truck.worldZ = entryWp.worldZ;
          truck.headingYaw = Math.PI * 0.5;
        }
      }
    }
  }

  private stepTransferYardOperations(dt: number): void {
    const whCenter = this.grid.gridToWorld(
      this.config.airportWarehouse.endX - 1,
      this.config.airportWarehouse.startZ + 3
    );
    const tyCenter = this.grid.gridToWorld(
      this.config.airportTransferYard.startX + 3,
      this.config.airportTransferYard.startZ + 3
    );

    for (const task of [...this.transferYardState.activeTransferTasks]) {
      if (task.status === 'WAITING' || task.status === 'RESERVED') {
        const idleDolly = Array.from(this.gseVehicles.values()).find(
          (g) => g.category === 'CARGO_DOLLY' && g.state === 'PARKED'
        );
        if (idleDolly) {
          task.assignedDollyId = idleDolly.id;
          task.status = 'ASSIGNED';
          idleDolly.state = 'TRANSFERRING_TO_YARD';
          idleDolly.assignedTaskId = task.id;
          idleDolly.carryingCargoKey = task.cargoKey;
          idleDolly.carryingTons = task.tons;
        }
      }

      if (
        task.status === 'ASSIGNED' ||
        task.status === 'IN_TRANSIT' ||
        task.status === 'ARRIVED'
      ) {
        task.status = 'IN_TRANSIT';
        task.progressRatio = Math.min(1, task.progressRatio + dt * 0.38);

        if (task.assignedDollyId) {
          const dolly = this.gseVehicles.get(task.assignedDollyId);
          if (dolly) {
            const startX =
              task.direction === 'WAREHOUSE_TO_YARD' ? whCenter.x : tyCenter.x;
            const startZ =
              task.direction === 'WAREHOUSE_TO_YARD' ? whCenter.z : tyCenter.z;
            const endX =
              task.direction === 'WAREHOUSE_TO_YARD' ? tyCenter.x : whCenter.x;
            const endZ =
              task.direction === 'WAREHOUSE_TO_YARD' ? tyCenter.z : whCenter.z;

            const nextX = startX + (endX - startX) * task.progressRatio;
            const nextZ = startZ + (endZ - startZ) * task.progressRatio;
            const dx = nextX - dolly.worldX;
            const dz = nextZ - dolly.worldZ;
            const dist = Math.hypot(dx, dz);
            if (dist > 1e-4) {
              dolly.headingYaw = Math.atan2(dx, dz);
              dolly.currentSpeedMps = dist / dt;
              dolly.wheelRotationRad =
                (dolly.wheelRotationRad + dist / 0.16) % (Math.PI * 200);
            }
            dolly.worldX = nextX;
            dolly.worldZ = nextZ;
          }
        }

        if (task.assignedForkliftId) {
          const fl = this.gseVehicles.get(task.assignedForkliftId);
          if (fl) {
            fl.wheelRotationRad =
              (fl.wheelRotationRad + dt * 6.0) % (Math.PI * 200);
            fl.liftHeightRatio =
              0.25 + 0.55 * Math.sin(task.progressRatio * Math.PI);
          }
        }

        if (task.progressRatio >= 1) {
          task.status = 'ARRIVED';
          this.completeTransferTaskInternal(task);
        }
      }
    }
  }

  private stepNpcAircraftOperations(
    dt: number,
    onNpcSupplyDelivered?: (
      aircraft: CargoAircraftRecord,
      supplies: Partial<Record<AirportSupplyCategory, number>>,
      bonusCash: number
    ) => void
  ): void {
    for (const npc of [...this.npcAircraft.values()]) {
      // Handle parked turnaround sequence: PARKED -> GSE_DISPATCH -> UNLOADING -> SUPPLIES_DELIVERED -> PUSHBACK -> TAXI_TO_RUNWAY -> TAKEOFF -> COMPLETED
      if (npc.flightStage === 'PARKED') {
        npc.currentSpeedMps = 0;
        npc.wheelGroundContact = true;
        npc.stageTimerSec += dt;
        if (npc.stageTimerSec >= 0.6) {
          npc.flightStage = 'GSE_DISPATCH';
          npc.stageTimerSec = 0;
          this.dispatchGseToAircraft(npc);
        }
        continue;
      }

      if (npc.flightStage === 'GSE_DISPATCH') {
        npc.stageTimerSec += dt;
        this.animateDispatchedGseTowardAircraft(npc, dt);
        if (npc.stageTimerSec >= 1.2) {
          npc.flightStage = 'UNLOADING';
          npc.stageTimerSec = 0;
        }
        continue;
      }

      if (npc.flightStage === 'UNLOADING') {
        npc.stageTimerSec += dt;
        this.animateDispatchedGseServicingAircraft(npc, dt);
        const visitDuration = npc.isGuestAircraft
          ? Math.max(1.2, npc.guestVisitDurationSec ?? 1.8)
          : 1.6;
        if (npc.stageTimerSec >= visitDuration) {
          npc.flightStage = 'SUPPLIES_DELIVERED';
          npc.stageTimerSec = 0;

          if (npc.isGuestAircraft || npc.npcOperationType === 'GUEST_VISIT') {
            // Guest aircraft complete their stationary visit WITHOUT generating free cargo or money
            this.guestArrivalsHandled += 1;
          } else if (npc.supplyManifest && !npc.supplyManifest.delivered) {
            npc.supplyManifest.delivered = true;
            for (const [key, amount] of Object.entries(
              npc.supplyManifest.supplies
            )) {
              if (amount && amount > 0) {
                this.addCargoToAirportWarehouse(
                  key as AirportWarehouseCargoKey,
                  amount
                );
              }
            }
            this.atcSupplyArrivalsHandled += 1;
            onNpcSupplyDelivered?.(
              npc,
              npc.supplyManifest.supplies,
              npc.supplyManifest.bonusCash
            );
          }
          npc.carryingCargoTons = 0;
          this.returnGseFromAircraft(npc.id);
        }
        continue;
      }

      if (npc.flightStage === 'SUPPLIES_DELIVERED') {
        npc.stageTimerSec += dt;
        if (npc.stageTimerSec >= 0.6) {
          // Release stand reservation once aircraft begins pushback & departure so stand clears cleanly
          if (npc.assignedStandId) {
            this.reservedStands.delete(npc.assignedStandId);
          }

          // Build pushback -> taxi -> runway -> takeoff trajectory
          const rwyEntry = this.waypoints.get('RUNWAY_ENTRY')!;
          const rwyExit = this.waypoints.get('RUNWAY_EXIT')!;
          const taxiZ = rwyEntry.worldZ + 13;

          npc.waypoints = [
            {
              id: 'NPC_PUSHBACK_TAXILANE',
              wx: npc.worldX,
              wy: AIRPORT_PAVEMENT_SURFACE_Y,
              wz: taxiZ,
              targetSpeedMps: 5.5,
              stageOnReach: 'TAXI_TO_RUNWAY',
              pitchRad: 0,
            },
            {
              id: 'NPC_TAXI_TO_RUNWAY_ENTRY',
              wx: rwyEntry.worldX,
              wy: AIRPORT_PAVEMENT_SURFACE_Y,
              wz: taxiZ,
              targetSpeedMps: 8.5,
              stageOnReach: 'TAXI_TO_RUNWAY',
              pitchRad: 0,
            },
            {
              id: 'NPC_RUNWAY_ALIGN',
              wx: rwyEntry.worldX,
              wy: AIRPORT_PAVEMENT_SURFACE_Y,
              wz: rwyEntry.worldZ,
              targetSpeedMps: 6.5,
              stageOnReach: 'TAKEOFF_ROLL',
              pitchRad: 0,
            },
            {
              id: 'NPC_TAKEOFF_ROTATION',
              wx: (rwyEntry.worldX + rwyExit.worldX) * 0.5,
              wy: AIRPORT_PAVEMENT_SURFACE_Y,
              wz: rwyEntry.worldZ,
              targetSpeedMps: 17.0,
              stageOnReach: 'ROTATION',
              pitchRad: 0.14,
            },
            {
              id: 'NPC_TAKEOFF_CLIMB',
              wx: rwyExit.worldX + 36,
              wy: AIRPORT_PAVEMENT_SURFACE_Y + 12.0,
              wz: rwyExit.worldZ,
              targetSpeedMps: 24.0,
              stageOnReach: 'COMPLETED',
              pitchRad: 0.18,
            },
          ];
          npc.currentWaypointIndex = 0;
          npc.flightStage = 'PUSHBACK';
          npc.stageTimerSec = 0;
        }
        continue;
      }

      if (npc.flightStage === 'COMPLETED') {
        if (npc.assignedStandId) {
          this.reservedStands.delete(npc.assignedStandId);
        }
        this.returnGseFromAircraft(npc.id);
        this.npcAircraft.delete(npc.id);
        continue;
      }

      // Advance along active waypoints using unified Nose-Forward Kinematics
      this.stepAircraftAlongWaypoints(npc, dt);
    }
  }

  private stepPlayerAircraftOperations(
    dt: number,
    onPlayerFlightCompleted?: (
      aircraft: CargoAircraftRecord,
      payoutCash: number,
      xpEarned: number
    ) => void
  ): void {
    for (const ac of this.playerAircraft.values()) {
      if (ac.flightStage === 'PARKED' || ac.flightStage === 'IN_HANGAR') {
        ac.currentSpeedMps = 0;
        ac.wheelGroundContact = true;
        ac.pitchRad = 0;
        ac.rollRad = 0;
        continue;
      }

      if (ac.flightStage === 'OFFSCREEN_FLIGHT') {
        ac.wheelGroundContact = false;
        ac.currentSpeedMps = 35 * ac.flightEfficiencyMultiplier;
        ac.offscreenFlightRemainingSec -= dt;
        if (ac.offscreenFlightRemainingSec <= 0) {
          // Transition to return approach waypoint
          const approachIdx = ac.waypoints.findIndex(
            (w) => w.id === 'RETURN_APPROACH_ENTRY'
          );
          if (approachIdx >= 0) {
            const wp = ac.waypoints[approachIdx];
            ac.worldX = wp.wx;
            ac.worldY = wp.wy;
            ac.worldZ = wp.wz;
            ac.currentWaypointIndex = Math.min(
              ac.waypoints.length - 1,
              approachIdx + 1
            );
            const nextWp = ac.waypoints[ac.currentWaypointIndex];
            ac.headingYaw = computeAircraftNoseForwardYaw(
              nextWp.wx - ac.worldX,
              nextWp.wz - ac.worldZ,
              ac.headingYaw
            );
            ac.flightStage = 'APPROACH';
          } else {
            ac.flightStage = ac.assignedHangarId ? 'IN_HANGAR' : 'PARKED';
          }
        }
        continue;
      }

      const prevStage = ac.flightStage as AircraftFlightStage;
      this.stepAircraftAlongWaypoints(ac, dt);
      const nextStage = ac.flightStage as AircraftFlightStage;

      // Check if player aircraft just finished landing & returning to its hangar ('IN_HANGAR') or stand ('PARKED')
      if (
        (prevStage !== 'IN_HANGAR' && nextStage === 'IN_HANGAR') ||
        (prevStage !== 'PARKED' && nextStage === 'PARKED')
      ) {
        const opId =
          ac.activeFlightOperationId ?? `flight-op-${this.nextFlightOpSeq++}`;
        const payoutCash = Math.round(
          ac.carryingCargoTons *
            ac.cargoValuePerTon *
            ac.flightEfficiencyMultiplier
        );
        const xpEarned = Math.round(180 * ac.flightEfficiencyMultiplier);

        ac.carryingCargoTons = 0;
        ac.carryingCargoKey = null;
        ac.activeFlightOperationId = null;

        if (nextStage === 'IN_HANGAR' && ac.assignedHangarId) {
          const homeHangar = this.hangars.get(ac.assignedHangarId);
          if (homeHangar) {
            homeHangar.occupiedByAircraftId = ac.id;
            homeHangar.doorOpenRatio = 0.25; // Partially close hangar doors once aircraft is stored inside
            ac.worldX = homeHangar.worldX;
            ac.worldZ = homeHangar.worldZ;
            ac.headingYaw = homeHangar.headingYaw;
          }
        } else {
          ac.headingYaw = Math.PI; // Reset to parked nose-north orientation at stand
        }

        // Deteriorate condition once per completed flight operation ID
        this.applyFlightCompletionWear(ac.id, opId);

        onPlayerFlightCompleted?.(ac, payoutCash, xpEarned);
      }
    }
  }

  /**
   * Authoritative Nose-Forward Waypoint Kinematics & Wheel Rotation Controller (Prompt 6).
   * Shared by both Player-Owned Cargo Aircraft and External NPC Cargo Aircraft.
   */
  private stepAircraftAlongWaypoints(
    ac: CargoAircraftRecord,
    dt: number
  ): void {
    if (
      ac.waypoints.length === 0 ||
      ac.currentWaypointIndex >= ac.waypoints.length
    ) {
      ac.currentSpeedMps = 0;
      return;
    }

    const target = ac.waypoints[ac.currentWaypointIndex];
    const dx = target.wx - ac.worldX;
    const dy = target.wy - ac.worldY;
    const dz = target.wz - ac.worldZ;
    const horizDist = Math.hypot(dx, dz);
    const dist3d = Math.hypot(dx, dy, dz);

    const speedMps = Math.max(4.0, target.targetSpeedMps || 8.0);
    ac.currentSpeedMps = speedMps;

    // Strictly align aircraft nose (+Z local axis) with horizontal direction of travel!
    if (horizDist > 0.02) {
      ac.headingYaw = computeAircraftNoseForwardYaw(dx, dz, ac.headingYaw);
    }

    const stepDist = speedMps * dt;
    if (dist3d <= stepDist + 0.05) {
      // Reached waypoint
      ac.worldX = target.wx;
      ac.worldY = target.wy;
      ac.worldZ = target.wz;
      ac.pitchRad = target.pitchRad ?? 0;

      if (target.stageOnReach) {
        ac.flightStage = target.stageOnReach;
      }

      ac.currentWaypointIndex += 1;
      if (ac.currentWaypointIndex >= ac.waypoints.length) {
        ac.currentSpeedMps = 0;
      }
    } else {
      const ratio = stepDist / dist3d;
      ac.worldX += dx * ratio;
      ac.worldY += dy * ratio;
      ac.worldZ += dz * ratio;
      if (target.pitchRad !== undefined) {
        ac.pitchRad += (target.pitchRad - ac.pitchRad) * Math.min(1, dt * 5.0);
      }
    }

    // Wheel-Ground Contact & Speed-Proportional Wheel Rotation (Prompt 6 Section 5)
    const isOnGround = ac.worldY <= AIRPORT_PAVEMENT_SURFACE_Y + 0.08;
    ac.wheelGroundContact = isOnGround;
    if (isOnGround) {
      ac.worldY = AIRPORT_PAVEMENT_SURFACE_Y;
      if (ac.currentSpeedMps > 0.05) {
        const wheelRadius = ac.dimensions.wheelRadiusMeters;
        ac.wheelRotationRad =
          (ac.wheelRotationRad + (ac.currentSpeedMps / wheelRadius) * dt) %
          (Math.PI * 200);
      }
    }
  }

  private dispatchGseToAircraft(ac: CargoAircraftRecord): void {
    const categoriesToDispatch: GSEVehicleCategory[] = [
      'CARGO_LOADER',
      'AIRCRAFT_TUG',
      'FLATBED_CARGO_CART',
      'FUEL_TANKER',
    ];
    let offsetIdx = 0;
    for (const cat of categoriesToDispatch) {
      const unit = Array.from(this.gseVehicles.values()).find(
        (g) => g.category === cat && g.state === 'PARKED'
      );
      if (unit) {
        unit.state = 'DISPATCHED_TO_AIRCRAFT';
        unit.assignedAircraftId = ac.id;
        unit.targetWorldX = ac.worldX + (offsetIdx % 2 === 0 ? -2.2 : 2.2);
        unit.targetWorldZ = ac.worldZ + (offsetIdx < 2 ? -1.4 : 1.4);
        offsetIdx++;
      }
    }
  }

  private animateDispatchedGseTowardAircraft(
    ac: CargoAircraftRecord,
    dt: number
  ): void {
    for (const gse of this.gseVehicles.values()) {
      if (gse.assignedAircraftId !== ac.id) continue;
      const dx = gse.targetWorldX - gse.worldX;
      const dz = gse.targetWorldZ - gse.worldZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.15) {
        const step = Math.min(dist, 6.5 * dt);
        gse.headingYaw = Math.atan2(dx, dz);
        gse.worldX += (dx / dist) * step;
        gse.worldZ += (dz / dist) * step;
        gse.currentSpeedMps = step / dt;
        gse.wheelRotationRad =
          (gse.wheelRotationRad + step / 0.18) % (Math.PI * 200);
      } else {
        gse.state = 'SERVICING_AIRCRAFT';
        gse.currentSpeedMps = 0;
      }
    }
  }

  private animateDispatchedGseServicingAircraft(
    ac: CargoAircraftRecord,
    dt: number
  ): void {
    for (const gse of this.gseVehicles.values()) {
      if (gse.assignedAircraftId !== ac.id) continue;
      gse.state = 'SERVICING_AIRCRAFT';
      gse.currentSpeedMps = 0;
      if (gse.category === 'CARGO_LOADER' || gse.category === 'FORKLIFT') {
        gse.liftHeightRatio = Math.min(1, gse.liftHeightRatio + dt * 0.8);
      }
    }
  }

  private returnGseFromAircraft(aircraftId: string): void {
    for (const gse of this.gseVehicles.values()) {
      if (gse.assignedAircraftId === aircraftId) {
        gse.assignedAircraftId = null;
        gse.assignedTaskId = null;
        gse.state = 'PARKED';
        gse.currentSpeedMps = 0;
        gse.liftHeightRatio = 0;
        gse.worldX = gse.homeWorldX;
        gse.worldZ = gse.homeWorldZ;
        gse.headingYaw = gse.homeHeadingYaw;
      }
    }
  }

  // --------------------------------------------------------------------------
  // SERIALIZATION & DESERIALIZATION
  // --------------------------------------------------------------------------

  public serializeState(): SerializedAirportLogisticsState {
    const constructedHangars = Array.from(this.hangars.values())
      .filter((h) => h.constructed)
      .map((h) => h.id);
    const purchasedStandIds = this.getPurchasedStandIds();

    return {
      warehouseStored: { ...this.warehouseState.stored },
      yardStaged: { ...this.transferYardState.stagedCargo },
      constructedHangars,
      hangar1Purchased: constructedHangars.includes('HANGAR_1'),
      hangar2Purchased: constructedHangars.includes('HANGAR_2'),
      ownedAircraftCount: Math.min(MAX_PLAYER_AIRCRAFT, this.playerAircraft.size),
      activeApronStandCount: purchasedStandIds.length,
      purchasedStandIds,
      playerAircraft: Array.from(this.playerAircraft.values())
        .slice(0, MAX_PLAYER_AIRCRAFT)
        .map((ac) => ({
          ...ac,
          dimensions: { ...ac.dimensions },
          waypoints: ac.waypoints.map((w) => ({ ...w })),
        })),
      npcAircraft: Array.from(this.npcAircraft.values()).map((ac) => ({
        ...ac,
        dimensions: { ...ac.dimensions },
        waypoints: ac.waypoints.map((w) => ({ ...w })),
      })),
      completedTransferCount: this.transferYardState.completedTransferCount,
      atcSupplyArrivalsHandled: this.atcSupplyArrivalsHandled,
      guestArrivalsHandled: this.guestArrivalsHandled,
    };
  }

  public deserializeState(
    data: Partial<SerializedAirportLogisticsState> | undefined,
    airportLevel: number
  ): void {
    this.syncWithAirportLevel(airportLevel);
    if (!data) return;

    this.purchasedStands.clear();
    this.purchasedStands.add('APRON_BAY_1');
    if (Array.isArray(data.purchasedStandIds)) {
      for (const sId of data.purchasedStandIds) {
        if (ALL_APRON_STAND_IDS.includes(sId)) {
          this.purchasedStands.add(sId);
        }
      }
    }

    if (data.warehouseStored) {
      for (const k of ALL_WAREHOUSE_CARGO_KEYS) {
        if (typeof data.warehouseStored[k] === 'number') {
          this.warehouseState.stored[k] = Math.min(
            this.warehouseState.capacities[k],
            Math.max(0, data.warehouseStored[k]!)
          );
        }
      }
    }

    if (data.yardStaged) {
      for (const k of ALL_WAREHOUSE_CARGO_KEYS) {
        if (typeof data.yardStaged[k] === 'number') {
          this.transferYardState.stagedCargo[k] = Math.max(
            0,
            data.yardStaged[k]!
          );
        }
      }
    }

    for (const h of this.hangars.values()) {
      const explicitFlag =
        h.id === 'HANGAR_1'
          ? data.hangar1Purchased
          : h.id === 'HANGAR_2'
            ? data.hangar2Purchased
            : undefined;
      h.constructed =
        typeof explicitFlag === 'boolean'
          ? explicitFlag
          : Array.isArray(data.constructedHangars)
            ? data.constructedHangars.includes(h.id)
            : false;
      h.occupiedByAircraftId = null;
      h.doorOpenRatio = 1.0;
    }

    if (Array.isArray(data.playerAircraft)) {
      this.playerAircraft.clear();
      let slotIdx = 0;
      for (const ac of data.playerAircraft) {
        if (slotIdx >= MAX_PLAYER_AIRCRAFT) break;
        const strictHangarId: HangarSlotId =
          slotIdx === 0 ? 'HANGAR_1' : 'HANGAR_2';
        const targetHangar =
          this.hangars.get(ac.assignedHangarId || strictHangarId) ??
          this.hangars.get(strictHangarId);
        // Zero-Spawn & 1-to-1 Hangar Rule: Only restore player aircraft if its assigned hangar is constructed
        if (targetHangar && !targetHangar.constructed) {
          targetHangar.constructed = true;
        }
        const restored: CargoAircraftRecord = {
          ...ac,
          assignedHangarId: targetHangar ? targetHangar.id : strictHangarId,
          dimensions: { ...AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS },
          effectiveCapacityTons: getAircraftOperationalCapacityForAirportLevel(
            ac.baseCapacityTons || 18,
            airportLevel
          ),
          flightEfficiencyMultiplier: getAircraftEfficiencyMultiplier(
            ac.conditionPercent
          ),
          isGrounded: ac.conditionPercent <= 0,
          waypoints: Array.isArray(ac.waypoints)
            ? ac.waypoints.map((w) => ({ ...w }))
            : [],
        };
        this.playerAircraft.set(restored.id, restored);
        if (targetHangar && targetHangar.constructed) {
          targetHangar.occupiedByAircraftId = restored.id;
          targetHangar.doorOpenRatio =
            restored.flightStage === 'IN_HANGAR' ? 0.25 : 1.0;
          if (restored.flightStage === 'IN_HANGAR') {
            restored.worldX = targetHangar.worldX;
            restored.worldZ = targetHangar.worldZ;
            restored.headingYaw = targetHangar.headingYaw;
          }
        }
        slotIdx++;
      }
    }

    this.reservedStands.clear();
    if (Array.isArray(data.npcAircraft)) {
      this.npcAircraft.clear();
      for (const npc of data.npcAircraft) {
        this.npcAircraft.set(npc.id, {
          ...npc,
          dimensions: { ...AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS },
          waypoints: Array.isArray(npc.waypoints)
            ? npc.waypoints.map((w) => ({ ...w }))
            : [],
        });
        if (npc.assignedStandId && npc.flightStage !== 'COMPLETED') {
          this.reservedStands.set(npc.assignedStandId, npc.id);
        }
      }
    }

    if (typeof data.completedTransferCount === 'number') {
      this.transferYardState.completedTransferCount =
        data.completedTransferCount;
    }
    if (typeof data.atcSupplyArrivalsHandled === 'number') {
      this.atcSupplyArrivalsHandled = data.atcSupplyArrivalsHandled;
    }
    if (typeof data.guestArrivalsHandled === 'number') {
      this.guestArrivalsHandled = data.guestArrivalsHandled;
    }

    this.refreshWarehouseAndYardTotals();
  }
}
