/**
 * Authoritative Warehouse 1 (and Multi-Warehouse) 20-Level Storage,
 * Loading Door (2..10), Forklift Fleet (2..10), and Truck Loading Coordination System.
 *
 * Implements:
 * - Level 1 constructed footprint: 5 x 6 grid cells inside a 25 x 30 reserved expansion property.
 * - Level 20 constructed footprint: 25 x 30 grid cells.
 * - Situated ~15 grid blocks from the nearest edge of the existing core area (core edge gz=52 -> warehouse minGz=67).
 * - Progressive 20-level storage capacity formula:
 *     Capacity(L) = StartingCapacity + ((FinalCapacity - StartingCapacity) * (L - 1) / 19)
 *   with exact endpoints:
 *     Food:       5.0t (L1) -> 50.0t (L20)
 *     Industrial: 10.0t (L1) -> 65.0t (L20)
 *     Packages:   2.0t (L1) -> 60.0t (L20)
 * - Operational Loading Doors: 2 at Level 1 -> 10 at Level 20.
 * - Operational Forklifts:     2 at Level 1 -> 10 at Level 20.
 * - Demand-driven forklift task assignment & real cargo transfer (Depot -> Warehouse 1 -> Loading -> Destination).
 */

import { EntityRegistry } from './EntityRegistry';
import { GridCoord, GridSystem } from './GridSystem';

export type WarehouseCargoCategory = 'FOOD' | 'INDUSTRIAL' | 'PACKAGES';

export const WAREHOUSE_MIN_LEVEL = 1;
export const WAREHOUSE_MAX_LEVEL = 20;

export const WAREHOUSE_RESERVED_WIDTH_CELLS = 25;
export const WAREHOUSE_RESERVED_DEPTH_CELLS = 30;

export const WAREHOUSE_LEVEL_1_WIDTH_CELLS = 5;
export const WAREHOUSE_LEVEL_1_DEPTH_CELLS = 6;

export const WAREHOUSE_INITIAL_FOOTPRINT = {
  widthCells: WAREHOUSE_LEVEL_1_WIDTH_CELLS,
  depthCells: WAREHOUSE_LEVEL_1_DEPTH_CELLS,
} as const;

export const WAREHOUSE_FINAL_FOOTPRINT = {
  widthCells: WAREHOUSE_RESERVED_WIDTH_CELLS,
  depthCells: WAREHOUSE_RESERVED_DEPTH_CELLS,
} as const;

export const WAREHOUSE_LEVEL_1_CAPACITIES: Record<WarehouseCargoCategory, number> = {
  FOOD: 5.0,
  INDUSTRIAL: 10.0,
  PACKAGES: 2.0,
};

export const WAREHOUSE_LEVEL_20_CAPACITIES: Record<WarehouseCargoCategory, number> = {
  FOOD: 50.0,
  INDUSTRIAL: 65.0,
  PACKAGES: 60.0,
};

/**
 * Exact loading door & forklift progression schedule from Level 1 to Level 20.
 * Levels 1-2: 2 | 3-4: 3 | 5-6: 4 | 7-8: 5 | 9-10: 6 | 11-13: 7 | 14-16: 8 | 17-19: 9 | 20: 10
 */
export const WAREHOUSE_DOOR_AND_FORKLIFT_PROGRESSION: readonly number[] = [
  2,  // Level 1
  2,  // Level 2
  3,  // Level 3
  3,  // Level 4
  4,  // Level 5
  4,  // Level 6
  5,  // Level 7
  5,  // Level 8
  6,  // Level 9
  6,  // Level 10
  7,  // Level 11
  7,  // Level 12
  7,  // Level 13
  8,  // Level 14
  8,  // Level 15
  8,  // Level 16
  9,  // Level 17
  9,  // Level 18
  9,  // Level 19
  10, // Level 20
];

/**
 * Authoritative 20-level capacity formula:
 * Capacity(level) = StartingCapacity + ((FinalCapacity - StartingCapacity) * (level - 1) / 19)
 * Preserves full floating-point precision internally and exact Level 1 / Level 20 endpoints.
 */
export function calculateWarehouseCategoryCapacity(
  category: WarehouseCargoCategory,
  level: number
): number {
  const clamped = Math.max(
    WAREHOUSE_MIN_LEVEL,
    Math.min(WAREHOUSE_MAX_LEVEL, Math.floor(level))
  );
  const startCap = WAREHOUSE_LEVEL_1_CAPACITIES[category];
  const finalCap = WAREHOUSE_LEVEL_20_CAPACITIES[category];
  if (clamped === WAREHOUSE_MIN_LEVEL) return startCap;
  if (clamped === WAREHOUSE_MAX_LEVEL) return finalCap;
  return startCap + ((finalCap - startCap) * (clamped - 1)) / 19;
}

export function getWarehouseCapacitiesForLevel(level: number): {
  FOOD: number;
  INDUSTRIAL: number;
  PACKAGES: number;
  totalTons: number;
} {
  const FOOD = calculateWarehouseCategoryCapacity('FOOD', level);
  const INDUSTRIAL = calculateWarehouseCategoryCapacity('INDUSTRIAL', level);
  const PACKAGES = calculateWarehouseCategoryCapacity('PACKAGES', level);
  return {
    FOOD,
    INDUSTRIAL,
    PACKAGES,
    totalTons: FOOD + INDUSTRIAL + PACKAGES,
  };
}

export function getWarehouseDoorCountForLevel(level: number): number {
  const idx =
    Math.max(WAREHOUSE_MIN_LEVEL, Math.min(WAREHOUSE_MAX_LEVEL, Math.floor(level))) - 1;
  return WAREHOUSE_DOOR_AND_FORKLIFT_PROGRESSION[idx];
}

export function getWarehouseForkliftCountForLevel(level: number): number {
  const idx =
    Math.max(WAREHOUSE_MIN_LEVEL, Math.min(WAREHOUSE_MAX_LEVEL, Math.floor(level))) - 1;
  return WAREHOUSE_DOOR_AND_FORKLIFT_PROGRESSION[idx];
}

export function getWarehouseConstructedFootprintForLevel(level: number): {
  widthCells: number;
  depthCells: number;
} {
  const clamped = Math.max(
    WAREHOUSE_MIN_LEVEL,
    Math.min(WAREHOUSE_MAX_LEVEL, Math.floor(level))
  );
  if (clamped === 1) {
    return {
      widthCells: WAREHOUSE_LEVEL_1_WIDTH_CELLS,
      depthCells: WAREHOUSE_LEVEL_1_DEPTH_CELLS,
    };
  }
  if (clamped === 20) {
    return {
      widthCells: WAREHOUSE_RESERVED_WIDTH_CELLS,
      depthCells: WAREHOUSE_RESERVED_DEPTH_CELLS,
    };
  }
  const widthCells = Math.round(
    WAREHOUSE_LEVEL_1_WIDTH_CELLS +
      ((WAREHOUSE_RESERVED_WIDTH_CELLS - WAREHOUSE_LEVEL_1_WIDTH_CELLS) * (clamped - 1)) / 19
  );
  const depthCells = Math.round(
    WAREHOUSE_LEVEL_1_DEPTH_CELLS +
      ((WAREHOUSE_RESERVED_DEPTH_CELLS - WAREHOUSE_LEVEL_1_DEPTH_CELLS) * (clamped - 1)) / 19
  );
  return { widthCells, depthCells };
}

export function getWarehouseUpgradeCostForLevel(currentLevel: number): number {
  const clamped = Math.max(1, Math.min(20, Math.floor(currentLevel)));
  return Math.round(6500 * Math.pow(1.16, clamped - 1));
}

export function inferCargoCategoryFromString(cargoType: string): WarehouseCargoCategory {
  const lower = (cargoType || '').toLowerCase();
  if (
    lower.includes('food') ||
    lower.includes('retail') ||
    lower.includes('fresh') ||
    lower.includes('produce') ||
    lower.includes('refrigerated')
  ) {
    return 'FOOD';
  }
  if (
    lower.includes('industrial') ||
    lower.includes('machinery') ||
    lower.includes('steel') ||
    lower.includes('fuel') ||
    lower.includes('parts') ||
    lower.includes('components') ||
    lower.includes('container')
  ) {
    return 'INDUSTRIAL';
  }
  return 'PACKAGES';
}

export interface WarehouseLoadingDoorRecord {
  id: string;
  warehouseId: string;
  doorNumber: number; // 1..10
  unlocked: boolean;
  worldPos: { wx: number; wy: number; wz: number };
  approachWorldPos: { wx: number; wy: number; wz: number };
  stopWorldPos: { wx: number; wy: number; wz: number; yaw?: number };
  thresholdWorldPos: { wx: number; wy: number; wz: number };
  isOpen: boolean;
  openRatio: number; // 0 (closed) .. 1 (open)
  occupiedByVehicleId: string | null;
  reservedByVehicleId: string | null;
}

export type ForkliftOperationalState =
  | 'IDLE_PARKED'
  | 'PICKING_CARGO'
  | 'MOVING_TO_DOOR'
  | 'LOADING_TRUCK'
  | 'RETURNING_TO_PARKING';

export interface WarehouseForkliftRecord {
  id: string;
  warehouseId: string;
  forkliftNumber: number; // 1..10
  unlocked: boolean;
  homeWorldPos: { wx: number; wy: number; wz: number };
  worldPos: { wx: number; wy: number; wz: number };
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  wheelRotationRad: number;
  forkHeightRatio: number; // 0 (lowered) .. 1 (raised)
  state: ForkliftOperationalState;
  carryingCategory: WarehouseCargoCategory | null;
  carryingTons: number;
  assignedTaskId: string | null;
  targetDoorId: string | null;
  targetVehicleId: string | null;
  phaseProgress: number;
}

export type WarehouseLoadingTaskStatus =
  | 'QUEUED_FOR_DOOR'
  | 'TRUCK_EN_ROUTE'
  | 'WAITING_FOR_STOCK'
  | 'WAITING_FOR_FORKLIFT'
  | 'LOADING'
  | 'COMPLETED';

export interface WarehouseLoadingTaskRecord {
  id: string;
  warehouseId: string;
  vehicleId: string;
  contractId: string;
  cargoCategory: WarehouseCargoCategory;
  category: WarehouseCargoCategory;
  requiredTons: number;
  totalTonsRequired: number;
  loadedTons: number;
  doorId: string | null;
  doorNumber: number;
  forkliftId: string | null;
  status: WarehouseLoadingTaskStatus;
}

export type WarehouseOperationalStatus =
  | 'OPERATIONAL'
  | 'ACTIVE_LOADING'
  | 'QUEUED'
  | 'STOCK_SHORTAGE';

export interface WarehouseFacilityState {
  id: string;
  name: string;
  level: number; // 1..20
  maxLevel: number; // 20
  upgradeCost: number;
  // Full 25 x 30 reserved expansion property
  reservedMinGx: number;
  reservedMaxGx: number;
  reservedMinGz: number;
  reservedMaxGz: number;
  reservedWidthCells: number;
  reservedDepthCells: number;
  // Current constructed building footprint (5x6 at L1 -> 25x30 at L20)
  constructedGx: number;
  constructedGz: number;
  constructedWidthCells: number;
  constructedDepthCells: number;
  accessRoadEntryGx: number;
  accessRoadEntryGz: number;
  // Authoritative cargo capacities & current stored quantities (tons)
  capacities: Record<WarehouseCargoCategory, number>;
  stored: Record<WarehouseCargoCategory, number>;
  // Doors, Forklifts & Active Loading Coordination
  operationalDoorCount: number;
  operationalForkliftCount: number;
  doors: WarehouseLoadingDoorRecord[];
  forklifts: WarehouseForkliftRecord[];
  activeTasks: WarehouseLoadingTaskRecord[];
  activeLoadingTasks: WarehouseLoadingTaskRecord[];
  waitingQueueVehicleIds: string[];
  waitingTruckIds: string[];
  operationalStatus: WarehouseOperationalStatus;
  statusMessage: string;
}

export type SerializedWarehouseState = WarehouseFacilityState;

/**
 * Computes the layout of the Constructed Building, Loading Doors (2..10),
 * and Forklift Staging Positions (2..10) for a given Warehouse facility and level.
 */
export function computeWarehousePhysicalLayout(
  warehouseId: string,
  level: number,
  reservedMinGx: number,
  reservedMinGz: number,
  grid: GridSystem,
  existingDoors: WarehouseLoadingDoorRecord[] = [],
  existingForklifts: WarehouseForkliftRecord[] = []
): {
  constructedGx: number;
  constructedGz: number;
  constructedWidth: number;
  constructedDepth: number;
  constructedWidthCells: number;
  constructedDepthCells: number;
  doors: WarehouseLoadingDoorRecord[];
  forklifts: WarehouseForkliftRecord[];
} {
  const reservedMaxGx = reservedMinGx + WAREHOUSE_RESERVED_WIDTH_CELLS - 1;
  const reservedMaxGz = reservedMinGz + WAREHOUSE_RESERVED_DEPTH_CELLS - 1;

  const fp = getWarehouseConstructedFootprintForLevel(level);
  const doorCount = getWarehouseDoorCountForLevel(level);
  const forkliftCount = getWarehouseForkliftCountForLevel(level);

  // Center the constructed building horizontally around gx=47 (aligned with the access road at gx=48),
  // expanding outward to fill the full 25-cell width [35..59] at Level 20.
  const centerGx = Math.floor((reservedMinGx + reservedMaxGx) * 0.5);
  let constructedGx = Math.max(
    reservedMinGx,
    Math.min(
      reservedMaxGx - fp.widthCells + 1,
      centerGx - Math.floor(fp.widthCells * 0.5)
    )
  );
  if (level === WAREHOUSE_MAX_LEVEL) {
    constructedGx = reservedMinGx;
  }

  // At Level 1, leave a 5-cell-deep northern truck loading apron (gz 67..71) in front of the 5x6 building (gz 72..77).
  // At Level 20, the constructed complex spans the full 25x30 reserved property.
  const constructedGz =
    level === WAREHOUSE_MAX_LEVEL
      ? reservedMinGz
      : Math.min(
          reservedMaxGz - fp.depthCells + 1,
          Math.max(reservedMinGz, reservedMinGz + 5 - Math.floor((level - 1) / 4))
        );

  const bMinWorld = grid.gridToWorld(constructedGx, constructedGz);
  const bMaxWorld = grid.gridToWorld(
    constructedGx + fp.widthCells - 1,
    constructedGz + fp.depthCells - 1
  );
  const bCenterX = (bMinWorld.x + bMaxWorld.x) * 0.5;
  const constructedWorldW = fp.widthCells * 2.0;

  // Dock line Z is consistently located at the northern loading apron threshold (gz = 72 north edge)
  const dockThresholdWorld = grid.gridToWorld(centerGx, reservedMinGz + 5);
  const dockWallZ = dockThresholdWorld.z - 1.0;

  // Ensure doors are spaced cleanly across the constructed north dock facade
  const spanW = Math.max(constructedWorldW - 2.2, (doorCount - 1) * 3.2);

  const doors: WarehouseLoadingDoorRecord[] = [];
  for (let i = 0; i < doorCount; i++) {
    const doorNum = i + 1;
    const doorId = `door-${warehouseId}-${doorNum}`;
    const prev = existingDoors.find((d) => d.id === doorId);

    const frac = doorCount === 1 ? 0 : i / (doorCount - 1) - 0.5;
    const wx = bCenterX + frac * spanW;
    const wy = 1.25;

    doors.push({
      id: doorId,
      warehouseId,
      doorNumber: doorNum,
      unlocked: true,
      worldPos: { wx, wy, wz: dockWallZ },
      approachWorldPos: { wx, wy: 1.26, wz: dockWallZ - 6.8 },
      stopWorldPos: { wx, wy: 1.26, wz: dockWallZ - 2.6, yaw: 0 },
      thresholdWorldPos: { wx, wy: 1.26, wz: dockWallZ - 0.5 },
      isOpen: prev ? prev.isOpen : false,
      openRatio: prev ? prev.openRatio : 0,
      occupiedByVehicleId: prev ? prev.occupiedByVehicleId : null,
      reservedByVehicleId: prev ? prev.reservedByVehicleId : null,
    });
  }

  const forklifts: WarehouseForkliftRecord[] = [];
  for (let i = 0; i < forkliftCount; i++) {
    const fkNum = i + 1;
    const fkId = `forklift-${warehouseId}-${fkNum}`;
    const prev = existingForklifts.find((f) => f.id === fkId);
    const pairedDoor = doors[i % doors.length];
    const homeWx = pairedDoor ? pairedDoor.worldPos.wx : bCenterX;
    const homeWz = dockWallZ - 0.95;

    const currWx = prev && prev.state !== 'IDLE_PARKED' ? prev.worldPos.wx : homeWx;
    const currWz = prev && prev.state !== 'IDLE_PARKED' ? prev.worldPos.wz : homeWz;

    forklifts.push({
      id: fkId,
      warehouseId,
      forkliftNumber: fkNum,
      unlocked: true,
      homeWorldPos: { wx: homeWx, wy: 1.26, wz: homeWz },
      worldPos: { wx: currWx, wy: 1.26, wz: currWz },
      worldX: currWx,
      worldY: 1.26,
      worldZ: currWz,
      headingYaw: prev && prev.state !== 'IDLE_PARKED' ? prev.headingYaw : Math.PI,
      wheelRotationRad: prev ? prev.wheelRotationRad : 0,
      forkHeightRatio: prev ? prev.forkHeightRatio : 0,
      state: prev ? prev.state : 'IDLE_PARKED',
      carryingCategory: prev ? prev.carryingCategory : null,
      carryingTons: prev ? prev.carryingTons : 0,
      assignedTaskId: prev ? prev.assignedTaskId : null,
      targetDoorId: prev ? prev.targetDoorId : null,
      targetVehicleId: prev ? prev.targetVehicleId : null,
      phaseProgress: prev ? prev.phaseProgress : 0,
    });
  }

  return {
    constructedGx,
    constructedGz,
    constructedWidth: fp.widthCells,
    constructedDepth: fp.depthCells,
    constructedWidthCells: fp.widthCells,
    constructedDepthCells: fp.depthCells,
    doors,
    forklifts,
  };
}

/**
 * Registers or updates the operational forklift entities in the authoritative EntityRegistry
 * so every forklift has its own persistent entity ID.
 */
export function syncWarehouseForkliftEntities(
  warehouse: WarehouseFacilityState,
  entities: EntityRegistry,
  grid: GridSystem
): void {
  for (const fk of warehouse.forklifts) {
    fk.worldX = fk.worldPos.wx;
    fk.worldY = fk.worldPos.wy;
    fk.worldZ = fk.worldPos.wz;
    const gCoord: GridCoord = grid.worldToGrid(fk.worldPos.wx, fk.worldPos.wz);
    if (!entities.has(fk.id)) {
      entities.register({
        id: fk.id,
        category: 'VEHICLE',
        type: 'WAREHOUSE_FORKLIFT',
        position: gCoord,
        footprint: [gCoord],
        orientation: 0,
        elevation: 1.26,
        ownership: 'PLAYER',
        active: true,
        metadata: {
          warehouseId: warehouse.id,
          forkliftNumber: fk.forkliftNumber,
          state: fk.state,
        },
      });
    } else {
      entities.update(fk.id, {
        position: gCoord,
        footprint: [gCoord],
        elevation: 1.26,
        metadata: {
          warehouseId: warehouse.id,
          forkliftNumber: fk.forkliftNumber,
          state: fk.state,
          carryingCategory: fk.carryingCategory,
          carryingTons: fk.carryingTons,
        },
      });
    }
  }
}
