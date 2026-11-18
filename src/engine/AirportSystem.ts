/**
 * Authoritative Cargo Airport System (Airport Development Prompts 1 & 2).
 *
 * Implements:
 * - Official 30 x 40 grid-block (1,200 cells) Main Cargo Airport Reservation
 * - Minimum 30-grid-block separation from the Core City
 * - Exact 10 x 15 grid-block Cargo Terminal / Operations Building footprint
 * - Separate 10 x 10 grid-block Airport Cargo Warehouse (Level 20 footprint) reservation
 * - Separate 10 x 10 grid-block Airport Transfer Yard reservation
 * - Abandoned Regional Airfield starting state (with non-operational prop aircraft)
 * - XP Level 100 unlock requirement & $15,000,000 purchase transition
 * - 20-Level airport expansion architecture (Level 1 -> Level 20 = full 30 x 40 footprint)
 * - Physical layout: Runway, Parallel Taxiway (no threshold loops), Grass Infield,
 *   Continuous Concrete Apron, 1-to-5 Aircraft Parking Stands, ATC Tower,
 *   Airport Lighting, Lattice Radar Tower, Windsock, Perimeter Fence & Gates,
 *   and Right-Side Dedicated Freight Access Road connection.
 */

import { EntityRegistry } from './EntityRegistry';
import { GridCoord, GridSystem } from './GridSystem';
import { WorldConfigData } from './WorldConfig';

// ============================================================================
// OFFICIAL AIRPORT CONSTANTS & SPECIFICATIONS (Prompts 1 & 2)
// ============================================================================

export const AIRPORT_ID = 'airport-northeast-main';
export const AIRPORT_NAME = 'Skyline Regional Air Cargo Hub';
export const AIRPORT_LOCKED_UI_TITLE =
  'Regional Air Cargo Hub — Unlocks at XP Level 100';

export const AIRPORT_UNLOCK_LEVEL = 100;
export const AIRPORT_PURCHASE_PRICE = 15_000_000; // $15,000,000
export const AIRPORT_MIN_LEVEL = 1;
export const AIRPORT_MAX_LEVEL = 20;
export const AIRPORT_MIN_CITY_SEPARATION_BLOCKS = 30;

/**
 * Official 50 x 70 grid-block maximum airport reservation (3,500 cells total).
 * Longitudinal axis (East-West along runway): 70 cells (gx 152..221).
 * Perpendicular axis (North-South airside-to-landside): 50 cells (gz 12..61).
 */
export const AIRPORT_RESERVED_FOOTPRINT = {
  widthCells: 70, // Longitudinal (X)
  depthCells: 50, // Perpendicular (Z)
  shortSideCells: 50,
  longSideCells: 70,
  totalCells: 3500,
} as const;

/**
 * Official Level 1 Active Airport Footprint: 30 x 40 grid blocks (1,200 cells total).
 */
export const AIRPORT_LEVEL_1_FOOTPRINT = {
  widthCells: 40, // Longitudinal (X: gx 152..191)
  depthCells: 30, // Perpendicular (Z: gz 12..41)
  shortSideCells: 30,
  longSideCells: 40,
  totalCells: 1200,
} as const;

/**
 * Configurable Intermediate Expansion Milestone Level (Level 10 -> 40 x 50 = 2,000 cells).
 */
export const AIRPORT_INTERMEDIATE_EXPANSION_LEVEL = 10;

export const AIRPORT_INTERMEDIATE_FOOTPRINT = {
  milestoneLevel: AIRPORT_INTERMEDIATE_EXPANSION_LEVEL,
  widthCells: 50, // Longitudinal (X: gx 152..201)
  depthCells: 40, // Perpendicular (Z: gz 12..51)
  shortSideCells: 40,
  longSideCells: 50,
  totalCells: 2000,
} as const;

/**
 * Official Level 20 Maximum Active Airport Footprint: 50 x 70 grid blocks (3,500 cells total).
 */
export const AIRPORT_LEVEL_20_FOOTPRINT = {
  widthCells: 70, // Longitudinal (X: gx 152..221)
  depthCells: 50, // Perpendicular (Z: gz 12..61)
  shortSideCells: 50,
  longSideCells: 70,
  totalCells: 3500,
} as const;

/**
 * Official 10 x 15 grid-block Cargo Terminal / Operations Building inside the airport.
 * Longitudinal (X): 15 cells; Perpendicular (Z): 10 cells (150 cells total).
 */
export const AIRPORT_CARGO_TERMINAL_FOOTPRINT = {
  id: 'facility-airport-cargo-terminal',
  name: 'Airport Cargo Terminal & Operations Building',
  widthCells: 15, // Longitudinal along landside road frontage
  depthCells: 10, // Perpendicular depth between landside bays and apron
  shortSideCells: 10,
  longSideCells: 15,
  totalCells: 150,
} as const;

/**
 * Expanded Cargo-Terminal Landside Truck-Handling Area (18 x 6 grid blocks = 108 cells).
 * Directly connected to the 10 x 15 Cargo Terminal's landside loading frontage (gx 162..179, gz 38..43),
 * providing dedicated truck approach lanes, waiting queue slots, loading dock bays, turning/reversing clearance,
 * and exit circulation without obstructing through-road traffic.
 */
export const AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT = {
  id: 'facility-airport-terminal-truck-yard',
  name: 'Airport Cargo Terminal Truck-Handling Yard',
  widthCells: 18,
  depthCells: 6,
  shortSideCells: 6,
  longSideCells: 18,
  totalCells: 108,
} as const;

/**
 * Separate 10 x 10 grid-block Airport Cargo Warehouse reservation (Level 20 footprint).
 * Must remain a separate facility identity from the 10 x 15 Cargo Terminal.
 */
export const AIRPORT_WAREHOUSE_LEVEL_20_FOOTPRINT = {
  id: 'facility-airport-warehouse',
  name: 'Airport Cargo Warehouse (Reserved 10×10)',
  widthCells: 10,
  depthCells: 10,
  totalCells: 100,
} as const;

/**
 * Separate 10 x 10 grid-block Airport Transfer Yard reservation.
 * Must remain a separate facility identity from the 10 x 15 Cargo Terminal and Warehouse.
 */
export const AIRPORT_TRANSFER_YARD_FOOTPRINT = {
  id: 'facility-airport-transfer-yard',
  name: 'Airport Cargo Transfer Yard (Reserved 10×10)',
  widthCells: 10,
  depthCells: 10,
  totalCells: 100,
} as const;

/**
 * Progressive aircraft parking stand unlock count across Airport Levels 1..20.
 * Stand 1 is unlocked and included at Level 1; Stands 2..10 unlock progressively across Levels 2..20
 * and require individual purchase by the player once unlocked.
 */
export const AIRPORT_MAX_PARKING_AREAS = 10;

export const AIRPORT_STAND_UNLOCK_LEVELS: readonly number[] = [
  1, // Stand 1 (APRON_BAY_1) — Included with Airport Level 1
  2, // Stand 2 (APRON_BAY_2)
  4, // Stand 3 (APRON_BAY_3)
  6, // Stand 4 (APRON_BAY_4)
  8, // Stand 5 (APRON_BAY_5)
  11, // Stand 6 (APRON_BAY_6)
  13, // Stand 7 (APRON_BAY_7)
  16, // Stand 8 (APRON_BAY_8)
  18, // Stand 9 (APRON_BAY_9)
  20, // Stand 10 (APRON_BAY_10)
];

export const AIRPORT_STANDS_BY_LEVEL: readonly number[] = [
  1, // Level 1
  2, // Level 2
  2, // Level 3
  3, // Level 4
  3, // Level 5
  4, // Level 6
  4, // Level 7
  5, // Level 8
  5, // Level 9
  5, // Level 10
  6, // Level 11
  6, // Level 12
  7, // Level 13
  7, // Level 14
  7, // Level 15
  8, // Level 16
  8, // Level 17
  9, // Level 18
  9, // Level 19
  10, // Level 20
];

/**
 * Authoritative Airport Cargo-Handling Capacity Progression (Tons per Flight) across Levels 1..20.
 * Level 1 = 5 tons; Level 20 = 50 tons; monotonic progression across all 20 levels.
 */
export const AIRPORT_MIN_CARGO_CAPACITY_TONS = 5;
export const AIRPORT_MAX_CARGO_CAPACITY_TONS = 50;

export const AIRPORT_CARGO_CAPACITY_TONS_BY_LEVEL: readonly number[] = [
  5, // Level 1
  7, // Level 2
  9, // Level 3
  11, // Level 4
  14, // Level 5
  16, // Level 6
  18, // Level 7
  21, // Level 8
  23, // Level 9
  26, // Level 10
  28, // Level 11
  31, // Level 12
  33, // Level 13
  36, // Level 14
  38, // Level 15
  40, // Level 16
  43, // Level 17
  45, // Level 18
  48, // Level 19
  50, // Level 20
];

/**
 * Authoritative Airport Level Upgrade Cost Formula Parameters (Section 6.1):
 * upgradeCost(targetLevel) = 25,000,000 + 2,500,000 * (targetLevel - 2)
 */
export const AIRPORT_UPGRADE_BASE_COST = 25_000_000;
export const AIRPORT_UPGRADE_STEP_COST = 2_500_000;
export const AIRPORT_UPGRADE_LEVEL_2_COST = AIRPORT_UPGRADE_BASE_COST;
export const AIRPORT_UPGRADE_COST_INCREMENT_PER_LEVEL = AIRPORT_UPGRADE_STEP_COST;

/**
 * Authoritative Aircraft Parking Area Purchase Cost Formula Parameters (Section 7.2):
 * parkingAreaCost(currentAirportLevel) = 500,000 + 150,000 * (currentAirportLevel - 1)
 */
export const AIRPORT_PARKING_AREA_BASE_PRICE = 500_000;
export const AIRPORT_PARKING_AREA_LEVEL_STEP_PRICE = 150_000;
export const AIRPORT_PARKING_AREA_PRICE_INCREMENT_PER_LEVEL =
  AIRPORT_PARKING_AREA_LEVEL_STEP_PRICE;

export type AirportOperationalStatus =
  | 'ABANDONED_LOCKED'
  | 'ABANDONED_UNLOCKED'
  | 'OPERATIONAL';

export type AirportParkingStandAvailabilityStatus =
  | 'LOCKED'
  | 'UNLOCKED_UNPURCHASED'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'OCCUPIED';

export interface AirportSubZoneBounds {
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  widthCells: number;
  depthCells: number;
  totalCells: number;
}

export interface AirportTerminalTruckDockBaySpec {
  id: string;
  bayNumber: number;
  gx: number;
  gz: number;
  worldX: number;
  worldZ: number;
  headingYaw: number;
  occupiedByTruckId: string | null;
}

export interface AirportTerminalTruckQueueSlotSpec {
  id: string;
  slotNumber: number;
  gx: number;
  gz: number;
  worldX: number;
  worldZ: number;
  headingYaw: number;
}

export interface AirportTerminalTruckYardSpec {
  id: string;
  name: string;
  bounds: AirportSubZoneBounds;
  turningRadiusMeters: number;
  reversingClearanceMeters: number;
  approachLaneWaypoints: Array<{ gx: number; gz: number; worldX: number; worldZ: number }>;
  queueSlots: AirportTerminalTruckQueueSlotSpec[];
  loadingDockBays: AirportTerminalTruckDockBaySpec[];
  exitLaneWaypoints: Array<{ gx: number; gz: number; worldX: number; worldZ: number }>;
  connectedRoadIds: string[];
}

export interface AirportTaxiwayTurnoffSpec {
  id: string;
  name: string;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  holdShortGz: number;
  crossesThreshold: boolean; // Always false per Prompt 2 Section 4.1
}

export interface AirportParkingStandSpec {
  id: string;
  waypointId: string; // 'APRON_BAY_1' .. 'APRON_BAY_10'
  standCode: string; // 'APRON_BAY_1' .. 'APRON_BAY_10'
  standNumber: number; // 1..10
  unlockedAtAirportLevel: number;
  unlockLevel: number;
  unlocked: boolean;
  purchased: boolean;
  active: boolean; // operational && unlocked && purchased
  purchasePrice: number;
  occupiedByAircraftId: string | null;
  reservedByAircraftId: string | null;
  availabilityStatus: AirportParkingStandAvailabilityStatus;
  centerGx: number;
  centerGz: number;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  worldX: number;
  worldZ: number;
  headingYaw: number;
  wingspanClearanceMeters: number;
  lengthClearanceMeters: number;
  taxilaneConnectorGx: number;
}

export interface AirportLightingLayoutSpec {
  runwayEdgeLightCount: number;
  runwayThresholdLightCount: number;
  taxiwayEdgeLightCount: number;
  apronFloodlightMastPositions: Array<{
    id: string;
    gx: number;
    gz: number;
    worldX: number;
    worldZ: number;
  }>;
}

export interface AirportPerimeterGateSpec {
  id: string;
  name: string;
  side: 'RIGHT_EAST' | 'LANDSIDE_SOUTH';
  gx: number;
  gz: number;
  worldX: number;
  worldZ: number;
  connectedRoadId: string;
}

export interface AirportAbandonedPropSpec {
  id: string;
  name: string;
  gx: number;
  gz: number;
  worldX: number;
  worldZ: number;
  headingYaw: number;
  isVisualPropOnly: true;
  generatesRevenue: false;
  isDispatchable: false;
}

export interface AirportInfrastructureRecord {
  id: string;
  name: string;
  // Legacy / compatibility bounds fields
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  runwayStartGx: number;
  runwayEndGx: number;
  runwayGz: number;

  // Authoritative State
  owned: boolean;
  unlocked: boolean;
  status: AirportOperationalStatus;
  unlockLevel: number;
  purchasePrice: number;
  level: number; // 0 when abandoned/unowned, 1..20 when owned
  maxLevel: number;
  upgradeCost: number;
  uiPromptMessage: string;

  // Cargo-handling capacity progression (5t at Lv.1 -> 50t at Lv.20)
  cargoCapacityTons: number;
  nextLevelCargoCapacityTons: number;
  maxCargoCapacityTons: number;

  // Reserved 50 x 70 main plot & milestone footprints (30x40 -> 40x50 -> 50x70)
  reservedBounds: AirportSubZoneBounds;
  level1FootprintBounds: AirportSubZoneBounds;
  intermediateFootprintBounds: AirportSubZoneBounds;
  activeConstructedBounds: AirportSubZoneBounds;
  citySeparationBlocks: number;

  // Sub-zones inside the airport compound
  runwayBounds: AirportSubZoneBounds;
  infieldGrassBounds: AirportSubZoneBounds;
  parallelTaxiwayBounds: AirportSubZoneBounds;
  apronBounds: AirportSubZoneBounds;
  cargoTerminalBounds: AirportSubZoneBounds; // Exact 10 x 15 grid blocks
  cargoTerminalTruckAreaBounds: AirportSubZoneBounds; // Expanded 18 x 6 landside truck yard
  cargoTerminalTruckYard: AirportTerminalTruckYardSpec;
  atcTowerBounds: AirportSubZoneBounds;
  radarUtilityBounds: AirportSubZoneBounds;
  reservedHangar1Bounds: AirportSubZoneBounds;
  reservedHangar2Bounds: AirportSubZoneBounds;

  // Separate adjacent 10 x 10 reservations (Prompts 1 & 2)
  separateWarehouseBounds: AirportSubZoneBounds; // Exact 10 x 10 grid blocks
  separateTransferYardBounds: AirportSubZoneBounds; // Exact 10 x 10 grid blocks

  // Detailed operational sub-elements & 10 Aircraft Parking Areas
  taxiwayTurnoffs: AirportTaxiwayTurnoffSpec[];
  parkingStands: AirportParkingStandSpec[];
  unlockedStandCount: number;
  purchasedStandCount: number;
  activeStandCount: number;
  occupiedStandCount: number;
  reservedStandCount: number;
  availableStandCount: number;
  maxStandCount: number;
  parkingAreaPurchasePrice: number;
  lighting: AirportLightingLayoutSpec;
  perimeterFenceCount: number;
  perimeterGates: AirportPerimeterGateSpec[];
  rightSideFreightRoadCells: GridCoord[];
  abandonedAircraftProp: AirportAbandonedPropSpec | null;
}

export interface SerializedAirportState {
  owned: boolean;
  level: number;
  purchasedStandIds?: string[];
}

// ============================================================================
// HELPER FUNCTIONS FOR FOOTPRINTS, SEPARATION & LEVEL PROGRESSION
// ============================================================================

export function makeSubZoneBounds(
  minGx: number,
  maxGx: number,
  minGz: number,
  maxGz: number
): AirportSubZoneBounds {
  const widthCells = Math.max(0, maxGx - minGx + 1);
  const depthCells = Math.max(0, maxGz - minGz + 1);
  return {
    minGx,
    maxGx,
    minGz,
    maxGz,
    widthCells,
    depthCells,
    totalCells: widthCells * depthCells,
  };
}

export function getAirportStandCountForLevel(level: number): number {
  if (level <= 0) return 0;
  const idx = Math.max(
    0,
    Math.min(AIRPORT_STANDS_BY_LEVEL.length - 1, Math.floor(level) - 1)
  );
  return AIRPORT_STANDS_BY_LEVEL[idx];
}

export const getAirportUnlockedStandsForLevel = getAirportStandCountForLevel;

export function getAirportCargoCapacityForLevel(level: number): number {
  if (level <= 0) return 0;
  const idx = Math.max(
    0,
    Math.min(
      AIRPORT_CARGO_CAPACITY_TONS_BY_LEVEL.length - 1,
      Math.floor(level) - 1
    )
  );
  return AIRPORT_CARGO_CAPACITY_TONS_BY_LEVEL[idx];
}

/**
 * Computes the upgrade cost from `currentLevel` to `targetLevel = currentLevel + 1`:
 * upgradeCost(targetLevel) = 25,000,000 + 2,500,000 * (targetLevel - 2)
 */
export function getAirportUpgradeCostForLevel(currentLevel: number): number {
  if (currentLevel <= 0) return AIRPORT_PURCHASE_PRICE;
  if (currentLevel >= AIRPORT_MAX_LEVEL) return 0;
  const targetLevel = Math.max(
    2,
    Math.min(AIRPORT_MAX_LEVEL, Math.floor(currentLevel) + 1)
  );
  return (
    AIRPORT_UPGRADE_BASE_COST + AIRPORT_UPGRADE_STEP_COST * (targetLevel - 2)
  );
}

/**
 * Computes the purchase price for an unlocked aircraft parking area at `currentAirportLevel`:
 * parkingAreaCost(currentAirportLevel) = 500,000 + 150,000 * (currentAirportLevel - 1)
 */
export function getAirportParkingAreaPriceForLevel(
  currentAirportLevel: number
): number {
  const clamped = Math.max(
    1,
    Math.min(AIRPORT_MAX_LEVEL, Math.floor(currentAirportLevel || 1))
  );
  return (
    AIRPORT_PARKING_AREA_BASE_PRICE +
    AIRPORT_PARKING_AREA_LEVEL_STEP_PRICE * (clamped - 1)
  );
}

/**
 * Computes the active operational bounds within the 50 x 70 (3,500 cells) airport reservation
 * for a given airport level (1..20):
 * - Level 1 activates the official 30 x 40 footprint (40 longitudinal x 30 perpendicular = 1,200 cells: gx 152..191, gz 12..41).
 * - Intermediate Milestone (Level 10) activates the official 40 x 50 footprint (50 longitudinal x 40 perpendicular = 2,000 cells: gx 152..201, gz 12..51).
 * - Level 20 activates the full 50 x 70 footprint (70 longitudinal x 50 perpendicular = 3,500 cells: gx 152..221, gz 12..61).
 * - Intermediate levels interpolate monotonically between these official milestones.
 */
export function getAirportActiveBoundsForLevel(
  reservedOrConfig: AirportSubZoneBounds | WorldConfigData,
  level: number
): AirportSubZoneBounds {
  const reserved: AirportSubZoneBounds =
    'airport' in reservedOrConfig
      ? makeSubZoneBounds(
          reservedOrConfig.airport.startX,
          reservedOrConfig.airport.endX,
          reservedOrConfig.airport.startZ,
          reservedOrConfig.airport.endZ
        )
      : reservedOrConfig;

  if (level <= 0) {
    // When unowned/abandoned, active operational footprint is 0 cells (though the 50x70 plot is reserved)
    return {
      minGx: reserved.minGx,
      maxGx: reserved.minGx - 1,
      minGz: reserved.minGz,
      maxGz: reserved.minGz - 1,
      widthCells: 0,
      depthCells: 0,
      totalCells: 0,
    };
  }

  const clamped = Math.max(
    AIRPORT_MIN_LEVEL,
    Math.min(AIRPORT_MAX_LEVEL, Math.floor(level))
  );
  if (clamped >= AIRPORT_MAX_LEVEL) {
    return { ...reserved };
  }

  const lv1W = AIRPORT_LEVEL_1_FOOTPRINT.widthCells; // 40
  const lv1D = AIRPORT_LEVEL_1_FOOTPRINT.depthCells; // 30
  const midLevel = AIRPORT_INTERMEDIATE_EXPANSION_LEVEL; // 10
  const midW = AIRPORT_INTERMEDIATE_FOOTPRINT.widthCells; // 50
  const midD = AIRPORT_INTERMEDIATE_FOOTPRINT.depthCells; // 40
  const maxW = reserved.widthCells; // 70
  const maxD = reserved.depthCells; // 50

  let activeW: number;
  let activeD: number;
  if (clamped <= 1) {
    activeW = lv1W;
    activeD = lv1D;
  } else if (clamped <= midLevel) {
    const t = (clamped - 1) / (midLevel - 1);
    activeW = Math.round(lv1W + t * (midW - lv1W));
    activeD = Math.round(lv1D + t * (midD - lv1D));
  } else {
    const t = (clamped - midLevel) / (AIRPORT_MAX_LEVEL - midLevel);
    activeW = Math.round(midW + t * (maxW - midW));
    activeD = Math.round(midD + t * (maxD - midD));
  }

  const minGx = reserved.minGx;
  const minGz = reserved.minGz;
  const maxGx = Math.min(reserved.maxGx, minGx + activeW - 1);
  const maxGz = Math.min(reserved.maxGz, minGz + activeD - 1);

  return makeSubZoneBounds(minGx, maxGx, minGz, maxGz);
}

/**
 * Computes edge-to-edge separation in grid blocks between two axis-aligned rectangular regions.
 */
export function computeRectSeparationBlocks(
  a: { minGx: number; maxGx: number; minGz: number; maxGz: number },
  b: { minGx: number; maxGx: number; minGz: number; maxGz: number }
): number {
  const dx =
    a.maxGx < b.minGx
      ? b.minGx - a.maxGx
      : b.maxGx < a.minGx
        ? a.minGx - b.maxGx
        : 0;
  const dz =
    a.maxGz < b.minGz
      ? b.minGz - a.maxGz
      : b.maxGz < a.minGz
        ? a.minGz - b.maxGz
        : 0;
  return Math.max(dx, dz);
}

export interface AirportStandRuntimeOverlay {
  purchasedStandIds?: ReadonlySet<string> | readonly string[];
  occupiedStandByWaypoint?: ReadonlyMap<string, string>;
  reservedStandByWaypoint?: ReadonlyMap<string, string>;
}

/**
 * Builds the complete authoritative AirportInfrastructureRecord for the current state.
 */
export function buildAirportInfrastructureRecord(
  config: WorldConfigData,
  grid: GridSystem,
  playerLevel: number,
  owned: boolean,
  airportLevel: number,
  standRuntime?: AirportStandRuntimeOverlay
): AirportInfrastructureRecord {
  const ap = config.airport;
  const reservedBounds = makeSubZoneBounds(
    ap.startX,
    ap.endX,
    ap.startZ,
    ap.endZ
  );

  // Core Level 1 (30x40 = 1,200 cells) & Intermediate Level 10 (40x50 = 2,000 cells) bounds
  const coreEndX =
    ap.level1EndX ?? ap.startX + AIRPORT_LEVEL_1_FOOTPRINT.widthCells - 1; // 191
  const coreEndZ =
    ap.level1EndZ ?? ap.startZ + AIRPORT_LEVEL_1_FOOTPRINT.depthCells - 1; // 41
  const level1FootprintBounds = makeSubZoneBounds(
    ap.startX,
    coreEndX,
    ap.startZ,
    coreEndZ
  );

  const midEndX =
    ap.intermediateEndX ??
    ap.startX + AIRPORT_INTERMEDIATE_FOOTPRINT.widthCells - 1; // 201
  const midEndZ =
    ap.intermediateEndZ ??
    ap.startZ + AIRPORT_INTERMEDIATE_FOOTPRINT.depthCells - 1; // 51
  const intermediateFootprintBounds = makeSubZoneBounds(
    ap.startX,
    midEndX,
    ap.startZ,
    midEndZ
  );

  const coreCityRect = {
    minGx: config.coreCity.startX,
    maxGx: config.coreCity.endX,
    minGz: config.coreCity.startZ,
    maxGz: config.coreCity.endZ,
  };
  const citySeparationBlocks = computeRectSeparationBlocks(
    reservedBounds,
    coreCityRect
  );

  const unlocked = playerLevel >= AIRPORT_UNLOCK_LEVEL;
  const effectiveLevel = owned
    ? Math.max(
        AIRPORT_MIN_LEVEL,
        Math.min(AIRPORT_MAX_LEVEL, Math.floor(airportLevel || 1))
      )
    : 0;

  const status: AirportOperationalStatus = owned
    ? 'OPERATIONAL'
    : unlocked
      ? 'ABANDONED_UNLOCKED'
      : 'ABANDONED_LOCKED';

  const cargoCapacityTons = owned
    ? getAirportCargoCapacityForLevel(effectiveLevel)
    : 0;
  const nextLevelCargoCapacityTons = owned
    ? getAirportCargoCapacityForLevel(
        Math.min(AIRPORT_MAX_LEVEL, effectiveLevel + 1)
      )
    : AIRPORT_MIN_CARGO_CAPACITY_TONS;
  const parkingAreaPurchasePrice = owned
    ? getAirportParkingAreaPriceForLevel(effectiveLevel)
    : AIRPORT_PARKING_AREA_BASE_PRICE;

  const activeConstructedBounds = getAirportActiveBoundsForLevel(
    reservedBounds,
    effectiveLevel
  );

  // -------------------------------------------------------------------------
  // Internal Sub-Zones Re-Distributed Across the 50 x 70 Master Compound (gx 152..221, gz 12..61)
  // Separating Airside Aircraft Operations (North & East) from Landside Truck Logistics (South & West)
  // -------------------------------------------------------------------------
  // 1. Airside Runway Zone (North airside corridor, 64 x 5 cells = 128m x 10m: gx 154..217, gz 14..18)
  const airsideEndX = ap.endX - 4; // 217
  const runwayBounds = makeSubZoneBounds(
    ap.startX + 2,
    airsideEndX,
    ap.startZ + 2,
    ap.startZ + 6
  );

  // 2. Grass Infield Separation Strip between Runway and Parallel Taxiway
  //    64 x 3 cells (gx 154..217, gz 19..21)
  const infieldGrassBounds = makeSubZoneBounds(
    ap.startX + 2,
    airsideEndX,
    ap.startZ + 7,
    ap.startZ + 9
  );

  // 3. Parallel Taxiway System (South of Infield, North of Apron)
  //    62 x 2 cells (gx 155..216, gz 22..23)
  //    Connects cleanly inward of runway thresholds without looping!
  const parallelTaxiwayBounds = makeSubZoneBounds(
    ap.startX + 3,
    airsideEndX - 1,
    ap.startZ + 10,
    ap.startZ + 11
  );

  // 4. Continuous Concrete Aircraft Apron & Parking Stands Zone
  //    64 x 8 cells (gx 154..217, gz 24..31)
  const apronBounds = makeSubZoneBounds(
    ap.startX + 2,
    airsideEndX,
    ap.startZ + 12,
    ap.startZ + 19
  );

  // 5. Exact 10 x 15 Grid-Block Cargo Terminal / Operations Building
  //    15 cells wide (X: gx 164..178) x 10 cells deep (Z: gz 32..41) = 150 cells
  const termStartGx = ap.startX + 12; // 164
  const termEndGx =
    termStartGx + AIRPORT_CARGO_TERMINAL_FOOTPRINT.widthCells - 1; // 178
  const termStartGz = coreEndZ - AIRPORT_CARGO_TERMINAL_FOOTPRINT.depthCells + 1; // 32
  const termEndGz = coreEndZ; // 41
  const cargoTerminalBounds = makeSubZoneBounds(
    termStartGx,
    termEndGx,
    termStartGz,
    termEndGz
  );

  // 5B. Dedicated Bottom-Right Truck Cargo-Loading & Dispatch Facility (18 x 6 cells = 108 cells: gx 198..215, gz 47..52)
  //     Located in the bottom-right landside logistics quadrant, completely separated from the Main Terminal frontage & Airside Apron!
  const brTruckMinGx = 198;
  const brTruckMaxGx = 215;
  const brTruckMinGz = 47;
  const brTruckMaxGz = 52;
  const cargoTerminalTruckAreaBounds = makeSubZoneBounds(
    brTruckMinGx,
    brTruckMaxGx,
    brTruckMinGz,
    brTruckMaxGz
  );

  const approachLaneWaypoints = [
    { gx: 180, gz: 43 }, // Internal Airport Access Road from Terminal Frontage
    { gx: 194, gz: 44 }, // Dedicated Truck Cargo Facility West Approach Entry
    { gx: 204, gz: 46 }, // Dedicated Truck Approach & Waiting Lane Center
  ].map((pt) => {
    const wp = grid.gridToWorld(pt.gx, pt.gz);
    return { ...pt, worldX: wp.x, worldZ: wp.z };
  });

  const queueSlots: AirportTerminalTruckQueueSlotSpec[] = [0, 1, 2, 3].map(
    (idx) => {
      const qGx = 199 + idx * 4; // gx 199, 203, 207, 211
      const qGz = 46; // Dedicated truck waiting/staging bays Q1..Q4
      const wp = grid.gridToWorld(qGx, qGz);
      return {
        id: `terminal-truck-queue-${idx + 1}`,
        slotNumber: idx + 1,
        gx: qGx,
        gz: qGz,
        worldX: wp.x,
        worldZ: wp.z,
        headingYaw: Math.PI * 0.5,
      };
    }
  );

  const loadingDockBays: AirportTerminalTruckDockBaySpec[] = [
    0, 1, 2, 3, 4, 5,
  ].map((idx) => {
    const dGx = 199 + idx * 3; // gx 199, 202, 205, 208, 211, 214
    const dGz = 52; // Backed into the 6 separated Bottom-Right Cargo Dispatch loading dock bays (facing North -Z)
    const wp = grid.gridToWorld(dGx, dGz);
    return {
      id: `terminal-truck-dock-${idx + 1}`,
      bayNumber: idx + 1,
      gx: dGx,
      gz: dGz,
      worldX: wp.x,
      worldZ: wp.z,
      headingYaw: Math.PI, // Cab facing North (-Z) into the manoeuvring apron for clean pull-out
      occupiedByTruckId: null,
    };
  });

  const exitLaneWaypoints = [
    { gx: 208, gz: 45 }, // Dedicated Truck Departure Lane
    { gx: 218, gz: 45 }, // Bottom-Right Facility East Departure Gate
    { gx: 221, gz: 47 }, // East Perimeter Freight Road Connection
  ].map((pt) => {
    const wp = grid.gridToWorld(pt.gx, pt.gz);
    return { ...pt, worldX: wp.x, worldZ: wp.z };
  });

  const cargoTerminalTruckYard: AirportTerminalTruckYardSpec = {
    id: AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT.id,
    name: AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT.name,
    bounds: cargoTerminalTruckAreaBounds,
    turningRadiusMeters: 12.0,
    reversingClearanceMeters: 14.0,
    approachLaneWaypoints,
    queueSlots,
    loadingDockBays,
    exitLaneWaypoints,
    connectedRoadIds: [
      'road-airport-landside-frontage',
      'road-airport-freight-right',
    ],
  };

  // 6. Dedicated Air Traffic Control (ATC) Tower Zone (4 x 4 cells west of Terminal with 5-block buffer)
  //    gx 155..158, gz 33..36 — completely clear of Runway, Taxiway, Stands & Terminal!
  const atcTowerBounds = makeSubZoneBounds(
    ap.startX + 3,
    ap.startX + 6,
    coreEndZ - 8,
    coreEndZ - 5
  );

  // 7. East Airside Radar & Meteorological Utility Pad (4 x 4 cells between Terminal and Hangar Sector)
  //    gx 185..188, gz 33..36
  const radarUtilityBounds = makeSubZoneBounds(
    185,
    188,
    coreEndZ - 8,
    coreEndZ - 5
  );

  // 7B. Two Reserved Player Aircraft Hangar Positions in the East Airside Hangar Sector (8 x 8 cells each)
  //     Facing North (-Z) onto dedicated concrete service aprons linked via smooth yellow-centerlined taxiways!
  const reservedHangar1Bounds = makeSubZoneBounds(196, 203, 33, 40);
  const reservedHangar2Bounds = makeSubZoneBounds(208, 215, 33, 40);

  // 8. Separate 10 x 10 Airport Cargo Warehouse Reservation (South-West Landside Sector: gx 152..161, gz 48..57)
  const whStartGx = config.airportWarehouse.startX;
  const whEndGx = config.airportWarehouse.endX;
  const whStartGz = config.airportWarehouse.startZ;
  const whEndGz = config.airportWarehouse.endZ;
  const separateWarehouseBounds = makeSubZoneBounds(
    whStartGx,
    whEndGx,
    whStartGz,
    whEndGz
  );

  // 9. Separate 10 x 10 Airport Transfer Yard Reservation (South-Central Landside Sector: gx 164..173, gz 48..57)
  const tyStartGx = config.airportTransferYard.startX;
  const tyEndGx = config.airportTransferYard.endX;
  const tyStartGz = config.airportTransferYard.startZ;
  const tyEndGz = config.airportTransferYard.endZ;
  const separateTransferYardBounds = makeSubZoneBounds(
    tyStartGx,
    tyEndGx,
    tyStartGz,
    tyEndGz
  );

  // -------------------------------------------------------------------------
  // 4 Clean Taxiway-to-Runway Turnoffs (NO threshold loops!)
  // -------------------------------------------------------------------------
  const taxiwayTurnoffs: AirportTaxiwayTurnoffSpec[] = [
    {
      id: 'taxi-turnoff-west-entry',
      name: 'Taxiway Alpha (West Runway Entry/Exit)',
      minGx: 158,
      maxGx: 159,
      minGz: infieldGrassBounds.minGz,
      maxGz: infieldGrassBounds.maxGz,
      holdShortGz: infieldGrassBounds.minGz + 1,
      crossesThreshold: false,
    },
    {
      id: 'taxi-turnoff-west-rapid',
      name: 'Taxiway Bravo (West-Mid Rapid Exit)',
      minGx: 174,
      maxGx: 175,
      minGz: infieldGrassBounds.minGz,
      maxGz: infieldGrassBounds.maxGz,
      holdShortGz: infieldGrassBounds.minGz + 1,
      crossesThreshold: false,
    },
    {
      id: 'taxi-turnoff-east-rapid',
      name: 'Taxiway Charlie (East-Mid Rapid Exit)',
      minGx: 194,
      maxGx: 195,
      minGz: infieldGrassBounds.minGz,
      maxGz: infieldGrassBounds.maxGz,
      holdShortGz: infieldGrassBounds.minGz + 1,
      crossesThreshold: false,
    },
    {
      id: 'taxi-turnoff-east-entry',
      name: 'Taxiway Delta (East Runway Entry/Exit)',
      minGx: 210,
      maxGx: 211,
      minGz: infieldGrassBounds.minGz,
      maxGz: infieldGrassBounds.maxGz,
      holdShortGz: infieldGrassBounds.minGz + 1,
      crossesThreshold: false,
    },
  ];

  // -------------------------------------------------------------------------
  // 10 Defined Aircraft Parking Stands on the Concrete Apron (gz 25..30)
  // -------------------------------------------------------------------------
  const unlockedStandCount = owned
    ? getAirportStandCountForLevel(effectiveLevel)
    : 0;
  const purchasedSet = new Set<string>(
    standRuntime?.purchasedStandIds
      ? Array.from(standRuntime.purchasedStandIds)
      : ['APRON_BAY_1']
  );
  // Stand 1 (APRON_BAY_1) is always included with the initial operational airport
  purchasedSet.add('APRON_BAY_1');

  // 10 generously spaced cargo stands across the expanded 64-cell (128m) airside apron (gx 154..217, gz 24..31)
  const standCoordinates: ReadonlyArray<{ gx: number; gz: number }> = [
    { gx: 157, gz: apronBounds.minGz + 2 }, // Stand 1 (APRON_BAY_1): gx 157, gz 26
    { gx: 162, gz: apronBounds.minGz + 5 }, // Stand 2 (APRON_BAY_2): gx 162, gz 29
    { gx: 167, gz: apronBounds.minGz + 2 }, // Stand 3 (APRON_BAY_3): gx 167, gz 26
    { gx: 172, gz: apronBounds.minGz + 5 }, // Stand 4 (APRON_BAY_4): gx 172, gz 29
    { gx: 177, gz: apronBounds.minGz + 2 }, // Stand 5 (APRON_BAY_5): gx 177, gz 26
    { gx: 182, gz: apronBounds.minGz + 5 }, // Stand 6 (APRON_BAY_6): gx 182, gz 29
    { gx: 187, gz: apronBounds.minGz + 2 }, // Stand 7 (APRON_BAY_7): gx 187, gz 26
    { gx: 192, gz: apronBounds.minGz + 5 }, // Stand 8 (APRON_BAY_8): gx 192, gz 29
    { gx: 197, gz: apronBounds.minGz + 2 }, // Stand 9 (APRON_BAY_9): gx 197, gz 26
    { gx: 202, gz: apronBounds.minGz + 5 }, // Stand 10 (APRON_BAY_10): gx 202, gz 29
  ];

  const parkingStands: AirportParkingStandSpec[] = standCoordinates.map(
    (coord, idx) => {
      const standNum = idx + 1;
      const waypointId = `APRON_BAY_${standNum}`;
      const unlockLvl = AIRPORT_STAND_UNLOCK_LEVELS[idx] ?? 20;
      const isStandUnlocked = owned && standNum <= unlockedStandCount;
      const isStandPurchased =
        standNum === 1 ? owned : owned && purchasedSet.has(waypointId);
      const isStandActive = owned && isStandUnlocked && isStandPurchased;
      const occupiedBy =
        standRuntime?.occupiedStandByWaypoint?.get(waypointId) ?? null;
      const reservedBy =
        standRuntime?.reservedStandByWaypoint?.get(waypointId) ?? null;

      let availabilityStatus: AirportParkingStandAvailabilityStatus = 'LOCKED';
      if (isStandActive) {
        if (occupiedBy) {
          availabilityStatus = 'OCCUPIED';
        } else if (reservedBy) {
          availabilityStatus = 'RESERVED';
        } else {
          availabilityStatus = 'AVAILABLE';
        }
      } else if (isStandUnlocked) {
        availabilityStatus = 'UNLOCKED_UNPURCHASED';
      }

      const wp = grid.gridToWorld(coord.gx, coord.gz);
      return {
        id: `airport-stand-${standNum}`,
        waypointId,
        standCode: waypointId,
        standNumber: standNum,
        unlockedAtAirportLevel: unlockLvl,
        unlockLevel: unlockLvl,
        unlocked: isStandUnlocked,
        purchased: isStandPurchased,
        active: isStandActive,
        purchasePrice:
          standNum === 1 ? 0 : getAirportParkingAreaPriceForLevel(effectiveLevel),
        occupiedByAircraftId: occupiedBy,
        reservedByAircraftId: reservedBy,
        availabilityStatus,
        centerGx: coord.gx,
        centerGz: coord.gz,
        minGx: Math.max(apronBounds.minGx, coord.gx - 1),
        maxGx: Math.min(apronBounds.maxGx, coord.gx + 1),
        minGz: Math.max(apronBounds.minGz, coord.gz - 1),
        maxGz: Math.min(apronBounds.maxGz, coord.gz + 1),
        worldX: wp.x,
        worldZ: wp.z,
        headingYaw: Math.PI * 0.22, // Angled cargo stand parking matching reference image
        wingspanClearanceMeters: 11.2,
        lengthClearanceMeters: 11.5,
        taxilaneConnectorGx: coord.gx,
      };
    }
  );

  const purchasedStandCount = owned
    ? parkingStands.filter((s) => s.purchased).length
    : 0;
  const activeStandCount = owned
    ? parkingStands.filter((s) => s.active).length
    : 0;
  const occupiedStandCount = owned
    ? parkingStands.filter((s) => s.occupiedByAircraftId !== null).length
    : 0;
  const reservedStandCount = owned
    ? parkingStands.filter(
        (s) => s.occupiedByAircraftId === null && s.reservedByAircraftId !== null
      ).length
    : 0;
  const availableStandCount = owned
    ? parkingStands.filter((s) => s.availabilityStatus === 'AVAILABLE').length
    : 0;

  const uiPromptMessage = owned
    ? `${AIRPORT_NAME} — Level ${effectiveLevel}/${AIRPORT_MAX_LEVEL} Operational (${cargoCapacityTons}t Cargo Cap · ${activeStandCount}/${AIRPORT_MAX_PARKING_AREAS} Stands Active · ${activeConstructedBounds.depthCells}×${activeConstructedBounds.widthCells} Footprint)`
    : unlocked
      ? `${AIRPORT_NAME} — Unlocked! Available to Purchase & Restore for $${AIRPORT_PURCHASE_PRICE.toLocaleString()}`
      : AIRPORT_LOCKED_UI_TITLE;

  // -------------------------------------------------------------------------
  // Airport Lighting & Floodlight Masts (outside wing clearance)
  // -------------------------------------------------------------------------
  const mastGxList = [
    ap.startX + 8,
    ap.startX + 15,
    ap.startX + 22,
    ap.startX + 29,
    ap.startX + 36,
  ];
  const apronFloodlightMastPositions = mastGxList.map((mGx, idx) => {
    const wp = grid.gridToWorld(mGx, apronBounds.maxGz);
    return {
      id: `airport-floodlight-mast-${idx + 1}`,
      gx: mGx,
      gz: apronBounds.maxGz,
      worldX: wp.x,
      worldZ: wp.z + 0.7,
    };
  });

  const lighting: AirportLightingLayoutSpec = {
    runwayEdgeLightCount: 36,
    runwayThresholdLightCount: 16,
    taxiwayEdgeLightCount: 34,
    apronFloodlightMastPositions,
  };

  // -------------------------------------------------------------------------
  // Perimeter Gates & Dedicated Right-Side Freight Road Cells
  // -------------------------------------------------------------------------
  const rightGatePos = grid.gridToWorld(coreEndX, coreEndZ - 4);
  const southGatePos = grid.gridToWorld(
    Math.floor((termStartGx + termEndGx) * 0.5),
    coreEndZ
  );
  const perimeterGates: AirportPerimeterGateSpec[] = [
    {
      id: 'airport-gate-right-freight',
      name: 'East Freight Security Gate (Right-Side Road Connection)',
      side: 'RIGHT_EAST',
      gx: coreEndX,
      gz: coreEndZ - 4,
      worldX: rightGatePos.x + 1.0,
      worldZ: rightGatePos.z,
      connectedRoadId: 'road-airport-freight-right',
    },
    {
      id: 'airport-gate-landside-docks',
      name: 'Landside Cargo Terminal Truck Gate',
      side: 'LANDSIDE_SOUTH',
      gx: Math.floor((termStartGx + termEndGx) * 0.5),
      gz: coreEndZ,
      worldX: southGatePos.x,
      worldZ: southGatePos.z + 1.0,
      connectedRoadId: 'road-airport-landside-frontage',
    },
  ];

  const rightSideFreightRoadCells: GridCoord[] = [];
  for (let gz = coreEndZ - 5; gz <= 55; gz++) {
    rightSideFreightRoadCells.push({ gx: coreEndX + 1, gz });
  }

  // -------------------------------------------------------------------------
  // Abandoned Aircraft Environmental Prop (ONLY when !owned)
  // -------------------------------------------------------------------------
  const propWp = grid.gridToWorld(
    standCoordinates[1].gx,
    standCoordinates[1].gz
  );
  const abandonedAircraftProp: AirportAbandonedPropSpec | null = owned
    ? null
    : {
        id: 'prop-abandoned-cargo-aircraft',
        name: 'Decommissioned Twinswift Cargo Airframe (Abandoned Prop)',
        gx: standCoordinates[1].gx,
        gz: standCoordinates[1].gz,
        worldX: propWp.x,
        worldZ: propWp.z,
        headingYaw: 0.42,
        isVisualPropOnly: true,
        generatesRevenue: false,
        isDispatchable: false,
      };

  const perimeterFenceCount =
    (reservedBounds.widthCells + reservedBounds.depthCells) * 2 - 4;

  return {
    id: AIRPORT_ID,
    name: AIRPORT_NAME,
    minGx: ap.startX,
    maxGx: ap.endX,
    minGz: ap.startZ,
    maxGz: ap.endZ,
    runwayStartGx: runwayBounds.minGx,
    runwayEndGx: runwayBounds.maxGx,
    runwayGz: Math.floor((runwayBounds.minGz + runwayBounds.maxGz) * 0.5),

    owned,
    unlocked,
    status,
    unlockLevel: AIRPORT_UNLOCK_LEVEL,
    purchasePrice: AIRPORT_PURCHASE_PRICE,
    level: effectiveLevel,
    maxLevel: AIRPORT_MAX_LEVEL,
    upgradeCost: getAirportUpgradeCostForLevel(effectiveLevel),
    uiPromptMessage,

    cargoCapacityTons,
    nextLevelCargoCapacityTons,
    maxCargoCapacityTons: AIRPORT_MAX_CARGO_CAPACITY_TONS,

    reservedBounds,
    level1FootprintBounds,
    intermediateFootprintBounds,
    activeConstructedBounds,
    citySeparationBlocks,

    runwayBounds,
    infieldGrassBounds,
    parallelTaxiwayBounds,
    apronBounds,
    cargoTerminalBounds,
    cargoTerminalTruckAreaBounds,
    cargoTerminalTruckYard,
    atcTowerBounds,
    radarUtilityBounds,
    reservedHangar1Bounds,
    reservedHangar2Bounds,
    separateWarehouseBounds,
    separateTransferYardBounds,

    taxiwayTurnoffs,
    parkingStands,
    unlockedStandCount,
    purchasedStandCount,
    activeStandCount,
    occupiedStandCount,
    reservedStandCount,
    availableStandCount,
    maxStandCount: AIRPORT_MAX_PARKING_AREAS,
    parkingAreaPurchasePrice,
    lighting,
    perimeterFenceCount,
    perimeterGates,
    rightSideFreightRoadCells,
    abandonedAircraftProp,
  };
}

/**
 * Synchronizes authoritative EntityRegistry records for the 50 x 70 Cargo Airport,
 * its 10 x 15 Cargo Terminal, its Expanded Cargo-Terminal Truck Yard, its ATC Tower,
 * its separate 10 x 10 Warehouse reservation, and its separate 10 x 10 Transfer Yard reservation.
 */
export function syncAirportEntities(
  airport: AirportInfrastructureRecord,
  entities: EntityRegistry,
  grid: GridSystem
): void {
  const idsToRefresh = [
    airport.id,
    AIRPORT_CARGO_TERMINAL_FOOTPRINT.id,
    AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT.id,
    'airport-atc-tower',
    AIRPORT_WAREHOUSE_LEVEL_20_FOOTPRINT.id,
    AIRPORT_TRANSFER_YARD_FOOTPRINT.id,
  ];
  for (const id of idsToRefresh) {
    if (entities.has(id)) {
      entities.unregister(id);
    }
  }

  // 1. Main 50 x 70 (3,500 cells) Airport Reservation Entity
  const mainFp = grid.getFootprint(
    airport.reservedBounds.minGx,
    airport.reservedBounds.minGz,
    airport.reservedBounds.widthCells,
    airport.reservedBounds.depthCells,
    0
  );
  entities.register({
    id: airport.id,
    category: 'AIRPORT_FACILITY',
    type: airport.owned ? 'CARGO_AIRPORT_OPERATIONAL' : 'CARGO_AIRPORT_ABANDONED',
    position: {
      gx: airport.reservedBounds.minGx,
      gz: airport.reservedBounds.minGz,
    },
    footprint: mainFp.cells,
    orientation: 0,
    elevation: 1.4,
    ownership: airport.owned ? 'PLAYER' : 'RESERVED',
    active: true,
    metadata: {
      name: airport.name,
      owned: airport.owned,
      unlocked: airport.unlocked,
      status: airport.status,
      unlockLevel: airport.unlockLevel,
      purchasePrice: airport.purchasePrice,
      level: airport.level,
      maxLevel: airport.maxLevel,
      reservedWidthCells: airport.reservedBounds.widthCells,
      reservedDepthCells: airport.reservedBounds.depthCells,
      reservedTotalCells: airport.reservedBounds.totalCells,
      activeStandCount: airport.activeStandCount,
      maxStandCount: airport.maxStandCount,
      uiPromptMessage: airport.uiPromptMessage,
    },
  });

  // 2. 10 x 15 Cargo Terminal / Operations Building Entity
  const termFp = grid.getFootprint(
    airport.cargoTerminalBounds.minGx,
    airport.cargoTerminalBounds.minGz,
    airport.cargoTerminalBounds.widthCells,
    airport.cargoTerminalBounds.depthCells,
    0
  );
  entities.register({
    id: AIRPORT_CARGO_TERMINAL_FOOTPRINT.id,
    category: 'AIRPORT_FACILITY',
    type: 'AIRPORT_CARGO_TERMINAL_10X15',
    position: {
      gx: airport.cargoTerminalBounds.minGx,
      gz: airport.cargoTerminalBounds.minGz,
    },
    footprint: termFp.cells,
    orientation: 0,
    elevation: 1.4,
    ownership: airport.owned ? 'PLAYER' : 'RESERVED',
    active: airport.owned,
    metadata: {
      name: AIRPORT_CARGO_TERMINAL_FOOTPRINT.name,
      parentAirportId: airport.id,
      widthCells: airport.cargoTerminalBounds.widthCells,
      depthCells: airport.cargoTerminalBounds.depthCells,
      totalCells: airport.cargoTerminalBounds.totalCells,
      owned: airport.owned,
    },
  });

  // 2B. Expanded Cargo-Terminal Landside Truck-Handling Area Entity (18 x 6 cells)
  const truckYardFp = grid.getFootprint(
    airport.cargoTerminalTruckAreaBounds.minGx,
    airport.cargoTerminalTruckAreaBounds.minGz,
    airport.cargoTerminalTruckAreaBounds.widthCells,
    airport.cargoTerminalTruckAreaBounds.depthCells,
    0
  );
  entities.register({
    id: AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT.id,
    category: 'AIRPORT_FACILITY',
    type: 'AIRPORT_TERMINAL_TRUCK_YARD_18X6',
    position: {
      gx: airport.cargoTerminalTruckAreaBounds.minGx,
      gz: airport.cargoTerminalTruckAreaBounds.minGz,
    },
    footprint: truckYardFp.cells,
    orientation: 0,
    elevation: 1.4,
    ownership: airport.owned ? 'PLAYER' : 'RESERVED',
    active: airport.owned,
    metadata: {
      name: AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT.name,
      parentAirportId: airport.id,
      widthCells: airport.cargoTerminalTruckAreaBounds.widthCells,
      depthCells: airport.cargoTerminalTruckAreaBounds.depthCells,
      totalCells: airport.cargoTerminalTruckAreaBounds.totalCells,
      dockBayCount: airport.cargoTerminalTruckYard.loadingDockBays.length,
      queueSlotCount: airport.cargoTerminalTruckYard.queueSlots.length,
    },
  });

  // 3. Dedicated ATC Tower Entity
  const atcFp = grid.getFootprint(
    airport.atcTowerBounds.minGx,
    airport.atcTowerBounds.minGz,
    airport.atcTowerBounds.widthCells,
    airport.atcTowerBounds.depthCells,
    0
  );
  entities.register({
    id: 'airport-atc-tower',
    category: 'AIRPORT_FACILITY',
    type: 'AIRPORT_ATC_TOWER',
    position: {
      gx: airport.atcTowerBounds.minGx,
      gz: airport.atcTowerBounds.minGz,
    },
    footprint: atcFp.cells,
    orientation: 0,
    elevation: 1.4,
    ownership: airport.owned ? 'PLAYER' : 'RESERVED',
    active: airport.owned,
    metadata: {
      name: 'Airport Air Traffic Control (ATC) Tower',
      parentAirportId: airport.id,
      widthCells: airport.atcTowerBounds.widthCells,
      depthCells: airport.atcTowerBounds.depthCells,
    },
  });

  // 4. Separate 10 x 10 Airport Cargo Warehouse Reservation Entity
  const whFp = grid.getFootprint(
    airport.separateWarehouseBounds.minGx,
    airport.separateWarehouseBounds.minGz,
    airport.separateWarehouseBounds.widthCells,
    airport.separateWarehouseBounds.depthCells,
    0
  );
  entities.register({
    id: AIRPORT_WAREHOUSE_LEVEL_20_FOOTPRINT.id,
    category: 'AIRPORT_FACILITY',
    type: 'AIRPORT_CARGO_WAREHOUSE_10X10_RESERVED',
    position: {
      gx: airport.separateWarehouseBounds.minGx,
      gz: airport.separateWarehouseBounds.minGz,
    },
    footprint: whFp.cells,
    orientation: 0,
    elevation: 1.4,
    ownership: airport.owned ? 'PLAYER' : 'RESERVED',
    active: airport.owned,
    metadata: {
      name: AIRPORT_WAREHOUSE_LEVEL_20_FOOTPRINT.name,
      parentAirportId: airport.id,
      widthCells: airport.separateWarehouseBounds.widthCells,
      depthCells: airport.separateWarehouseBounds.depthCells,
      totalCells: airport.separateWarehouseBounds.totalCells,
      separateFromCargoTerminal: true,
    },
  });

  // 5. Separate 10 x 10 Airport Transfer Yard Reservation Entity
  const tyFp = grid.getFootprint(
    airport.separateTransferYardBounds.minGx,
    airport.separateTransferYardBounds.minGz,
    airport.separateTransferYardBounds.widthCells,
    airport.separateTransferYardBounds.depthCells,
    0
  );
  entities.register({
    id: AIRPORT_TRANSFER_YARD_FOOTPRINT.id,
    category: 'AIRPORT_FACILITY',
    type: 'AIRPORT_TRANSFER_YARD_10X10_RESERVED',
    position: {
      gx: airport.separateTransferYardBounds.minGx,
      gz: airport.separateTransferYardBounds.minGz,
    },
    footprint: tyFp.cells,
    orientation: 0,
    elevation: 1.4,
    ownership: airport.owned ? 'PLAYER' : 'RESERVED',
    active: airport.owned,
    metadata: {
      name: AIRPORT_TRANSFER_YARD_FOOTPRINT.name,
      parentAirportId: airport.id,
      widthCells: airport.separateTransferYardBounds.widthCells,
      depthCells: airport.separateTransferYardBounds.depthCells,
      totalCells: airport.separateTransferYardBounds.totalCells,
      separateFromCargoTerminal: true,
    },
  });
}

/**
 * Checks whether a given grid cell (gx, gz) falls inside the reserved 30 x 40 Airport plot,
 * the separate 10 x 10 Airport Cargo Warehouse plot, or the separate 10 x 10 Airport Transfer Yard plot.
 */
export function isCellInAirportReservation(
  config: WorldConfigData,
  gx: number,
  gz: number
): boolean {
  const ap = config.airport;
  if (gx >= ap.startX && gx <= ap.endX && gz >= ap.startZ && gz <= ap.endZ) {
    return true;
  }
  const aw = config.airportWarehouse;
  if (gx >= aw.startX && gx <= aw.endX && gz >= aw.startZ && gz <= aw.endZ) {
    return true;
  }
  const at = config.airportTransferYard;
  if (gx >= at.startX && gx <= at.endX && gz >= at.startZ && gz <= at.endZ) {
    return true;
  }
  // Dedicated Airport Aircraft Hangar Tiles (HANGAR_1: gx 173..180, gz 44..51; HANGAR_2: gx 182..189, gz 44..51)
  if (gx >= 172 && gx <= 190 && gz >= 44 && gz <= 52) {
    return true;
  }
  return false;
}

export * from './AirportLogisticsAndFlightSystem';

