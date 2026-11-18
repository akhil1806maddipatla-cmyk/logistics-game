import { createDefaultWorldConfig } from './WorldConfig';

export const TRUCK_DEPOT_ID = 'facility-starter-truck-depot';
export const TRUCK_DEPOT_CATALOGUE_ID = 'bld-road-truck-depot-lv1';
export const TRUCK_DEPOT_MIN_LEVEL = 1;
export const TRUCK_DEPOT_MAX_LEVEL = 20;

export const TRUCK_DEPOT_LEVEL_1_FOOTPRINT = { widthCells: 4, depthCells: 3 } as const;
export const TRUCK_DEPOT_LEVEL_10_FOOTPRINT = { widthCells: 12, depthCells: 6 } as const;
export const TRUCK_DEPOT_MAX_RESERVED_FOOTPRINT = { widthCells: 20, depthCells: 8 } as const;

export const TRUCK_DEPOT_LEVEL_1_CAPACITY = 3;
export const TRUCK_DEPOT_LEVEL_10_CAPACITY = 9;
export const TRUCK_DEPOT_MAX_CAPACITY = 15;

export const STARTER_MINI_TRUCK_CATALOGUE_ID = 'veh-road-sprinter-van';
export const STARTER_MINI_TRUCK_LIVERY_ID = 'livery-atlantic-blue';
export const STARTER_MINI_TRUCK_COUNT = 3;

export type TruckDepotSlotOccupancyState =
  | 'EMPTY'
  | 'PARKED'
  | 'DISPATCHED'
  | 'RESERVED_FOR_RETURN';

export interface TruckDepotLevelSpec {
  level: number;
  activeWidthCells: number;
  activeDepthCells: number;
  truckCapacity: number;
  garageBayCount: number;
  buildingHeightMeters: number;
  entranceClearanceWidthMeters: number;
  entranceClearanceHeightMeters: number;
  supportsLargeTrucks: boolean;
  upgradeCostToNextLevel: number;
}

export interface TruckDepotParkingSlotRecord {
  slotId: string;
  depotId: string;
  slotNumber: number; // 1..15
  unlocked: boolean;
  unlocksAtLevel: number;
  bayRow: 'FRONT_BAY' | 'YARD_APRON_ROW';
  worldX: number;
  worldY: number;
  worldZ: number;
  headingYaw: number;
  assignedVehicleId: string | null;
  occupancyState: TruckDepotSlotOccupancyState;
}

export interface TruckDepotUnusedReservedPropPlacement {
  propId: string;
  kind: 'BRICK_PALLET' | 'CARDBOARD_STACK' | 'STORAGE_CONTAINER' | 'TIMBER_CRATE';
  gx: number;
  gz: number;
  worldX: number;
  worldZ: number;
  rotationY: number;
}

export interface TruckDepotFacilityState {
  id: string;
  depotId: string;
  name: string;
  level: number;
  maxLevel: number;
  // Full 20x8 reserved property bounds (inclusive grid cells)
  reservedMinGx: number;
  reservedMaxGx: number;
  reservedMinGz: number;
  reservedMaxGz: number;
  reservedWidthCells: number;
  reservedDepthCells: number;
  // Current active footprint bounds inside the reserved property
  constructedGx: number;
  constructedGz: number;
  activeMinGx: number;
  activeMaxGx: number;
  activeMinGz: number;
  activeMaxGz: number;
  activeWidthCells: number;
  activeDepthCells: number;
  // Capacities & physical clearances
  truckCapacity: number;
  maxTruckCapacity: number;
  garageBayCount: number;
  buildingHeightMeters: number;
  entranceClearanceWidthMeters: number;
  entranceClearanceHeightMeters: number;
  supportsLargeTrucks: boolean;
  // Upgrade economy
  upgradeCost: number;
  nextLevelUpgradeCost: number | null;
  nextLevelSpec: TruckDepotLevelSpec | null;
  // Authoritative 15 parking slots (slots 1..truckCapacity unlocked)
  slots: TruckDepotParkingSlotRecord[];
  // Inactive reserved yard props for cells outside the active footprint
  unusedReservedProps: TruckDepotUnusedReservedPropPlacement[];
}

/**
 * 20-Level Truck Depot progression table.
 * Strictly monotonic footprints and capacities:
 * - Level 1: 4 x 3 blocks, 3 trucks
 * - Level 10: 12 x 6 blocks, 9 trucks
 * - Level 20: 20 x 8 blocks, 15 trucks
 */
export const TRUCK_DEPOT_LEVEL_SPECS: readonly TruckDepotLevelSpec[] = [
  { level: 1,  activeWidthCells: 4,  activeDepthCells: 3, truckCapacity: 3,  garageBayCount: 3, buildingHeightMeters: 4.3, entranceClearanceWidthMeters: 2.0, entranceClearanceHeightMeters: 2.8, supportsLargeTrucks: false, upgradeCostToNextLevel: 5500 },
  { level: 2,  activeWidthCells: 5,  activeDepthCells: 3, truckCapacity: 4,  garageBayCount: 3, buildingHeightMeters: 4.4, entranceClearanceWidthMeters: 2.1, entranceClearanceHeightMeters: 2.9, supportsLargeTrucks: false, upgradeCostToNextLevel: 6800 },
  { level: 3,  activeWidthCells: 6,  activeDepthCells: 4, truckCapacity: 4,  garageBayCount: 4, buildingHeightMeters: 4.5, entranceClearanceWidthMeters: 2.2, entranceClearanceHeightMeters: 3.0, supportsLargeTrucks: false, upgradeCostToNextLevel: 8200 },
  { level: 4,  activeWidthCells: 7,  activeDepthCells: 4, truckCapacity: 5,  garageBayCount: 4, buildingHeightMeters: 4.6, entranceClearanceWidthMeters: 2.3, entranceClearanceHeightMeters: 3.1, supportsLargeTrucks: false, upgradeCostToNextLevel: 9800 },
  { level: 5,  activeWidthCells: 8,  activeDepthCells: 4, truckCapacity: 6,  garageBayCount: 4, buildingHeightMeters: 4.7, entranceClearanceWidthMeters: 2.4, entranceClearanceHeightMeters: 3.2, supportsLargeTrucks: true,  upgradeCostToNextLevel: 11500 },
  { level: 6,  activeWidthCells: 9,  activeDepthCells: 5, truckCapacity: 6,  garageBayCount: 5, buildingHeightMeters: 4.8, entranceClearanceWidthMeters: 2.5, entranceClearanceHeightMeters: 3.3, supportsLargeTrucks: true,  upgradeCostToNextLevel: 13500 },
  { level: 7,  activeWidthCells: 10, activeDepthCells: 5, truckCapacity: 7,  garageBayCount: 5, buildingHeightMeters: 4.9, entranceClearanceWidthMeters: 2.6, entranceClearanceHeightMeters: 3.4, supportsLargeTrucks: true,  upgradeCostToNextLevel: 15800 },
  { level: 8,  activeWidthCells: 10, activeDepthCells: 5, truckCapacity: 8,  garageBayCount: 5, buildingHeightMeters: 5.0, entranceClearanceWidthMeters: 2.7, entranceClearanceHeightMeters: 3.5, supportsLargeTrucks: true,  upgradeCostToNextLevel: 18500 },
  { level: 9,  activeWidthCells: 11, activeDepthCells: 6, truckCapacity: 8,  garageBayCount: 5, buildingHeightMeters: 5.1, entranceClearanceWidthMeters: 2.8, entranceClearanceHeightMeters: 3.6, supportsLargeTrucks: true,  upgradeCostToNextLevel: 21500 },
  { level: 10, activeWidthCells: 12, activeDepthCells: 6, truckCapacity: 9,  garageBayCount: 6, buildingHeightMeters: 5.2, entranceClearanceWidthMeters: 2.9, entranceClearanceHeightMeters: 3.7, supportsLargeTrucks: true,  upgradeCostToNextLevel: 25000 },
  { level: 11, activeWidthCells: 13, activeDepthCells: 6, truckCapacity: 9,  garageBayCount: 6, buildingHeightMeters: 5.3, entranceClearanceWidthMeters: 3.0, entranceClearanceHeightMeters: 3.8, supportsLargeTrucks: true,  upgradeCostToNextLevel: 29000 },
  { level: 12, activeWidthCells: 14, activeDepthCells: 6, truckCapacity: 10, garageBayCount: 6, buildingHeightMeters: 5.4, entranceClearanceWidthMeters: 3.0, entranceClearanceHeightMeters: 3.9, supportsLargeTrucks: true,  upgradeCostToNextLevel: 33500 },
  { level: 13, activeWidthCells: 15, activeDepthCells: 7, truckCapacity: 11, garageBayCount: 6, buildingHeightMeters: 5.5, entranceClearanceWidthMeters: 3.1, entranceClearanceHeightMeters: 4.0, supportsLargeTrucks: true,  upgradeCostToNextLevel: 38500 },
  { level: 14, activeWidthCells: 16, activeDepthCells: 7, truckCapacity: 11, garageBayCount: 7, buildingHeightMeters: 5.6, entranceClearanceWidthMeters: 3.1, entranceClearanceHeightMeters: 4.0, supportsLargeTrucks: true,  upgradeCostToNextLevel: 44000 },
  { level: 15, activeWidthCells: 16, activeDepthCells: 7, truckCapacity: 12, garageBayCount: 7, buildingHeightMeters: 5.7, entranceClearanceWidthMeters: 3.2, entranceClearanceHeightMeters: 4.1, supportsLargeTrucks: true,  upgradeCostToNextLevel: 50000 },
  { level: 16, activeWidthCells: 17, activeDepthCells: 7, truckCapacity: 13, garageBayCount: 7, buildingHeightMeters: 5.8, entranceClearanceWidthMeters: 3.2, entranceClearanceHeightMeters: 4.1, supportsLargeTrucks: true,  upgradeCostToNextLevel: 57000 },
  { level: 17, activeWidthCells: 18, activeDepthCells: 8, truckCapacity: 13, garageBayCount: 7, buildingHeightMeters: 5.9, entranceClearanceWidthMeters: 3.3, entranceClearanceHeightMeters: 4.2, supportsLargeTrucks: true,  upgradeCostToNextLevel: 65000 },
  { level: 18, activeWidthCells: 19, activeDepthCells: 8, truckCapacity: 14, garageBayCount: 8, buildingHeightMeters: 6.0, entranceClearanceWidthMeters: 3.3, entranceClearanceHeightMeters: 4.2, supportsLargeTrucks: true,  upgradeCostToNextLevel: 74000 },
  { level: 19, activeWidthCells: 19, activeDepthCells: 8, truckCapacity: 14, garageBayCount: 8, buildingHeightMeters: 6.1, entranceClearanceWidthMeters: 3.4, entranceClearanceHeightMeters: 4.3, supportsLargeTrucks: true,  upgradeCostToNextLevel: 85000 },
  { level: 20, activeWidthCells: 20, activeDepthCells: 8, truckCapacity: 15, garageBayCount: 8, buildingHeightMeters: 6.2, entranceClearanceWidthMeters: 3.5, entranceClearanceHeightMeters: 4.4, supportsLargeTrucks: true,  upgradeCostToNextLevel: 0 },
];

export function getTruckDepotLevelSpec(level: number): TruckDepotLevelSpec {
  const clamped = Math.max(TRUCK_DEPOT_MIN_LEVEL, Math.min(TRUCK_DEPOT_MAX_LEVEL, Math.round(level)));
  return TRUCK_DEPOT_LEVEL_SPECS[clamped - 1]!;
}

export function getSlotUnlockLevel(slotNumber: number): number {
  for (const spec of TRUCK_DEPOT_LEVEL_SPECS) {
    if (spec.truckCapacity >= slotNumber) {
      return spec.level;
    }
  }
  return TRUCK_DEPOT_MAX_LEVEL;
}

/**
 * Computes active footprint placement inside the 20x8 reserved property:
 * - At Level 1 (4x3), active footprint sits at (constructedGx = 46..49, constructedGz = 51..53)
 *   directly fronting the southern freight access road (gz = 54..55).
 * - As the depot upgrades from Level 1 to Level 20, it expands symmetrically in width
 *   across [reservedMinGx..reservedMaxGx] (38..57) and northward in depth across
 *   [reservedMinGz..reservedMaxGz] (46..53) until it reaches the full 20x8 property at Level 20.
 */
export function computeTruckDepotActiveBounds(
  level: number,
  reservedMinGx: number,
  reservedMaxGx: number,
  reservedMinGz: number,
  reservedMaxGz: number
): {
  constructedGx: number;
  constructedGz: number;
  activeMinGx: number;
  activeMaxGx: number;
  activeMinGz: number;
  activeMaxGz: number;
  activeWidthCells: number;
  activeDepthCells: number;
} {
  const spec = getTruckDepotLevelSpec(level);
  const w = spec.activeWidthCells;
  const d = spec.activeDepthCells;

  // Center around the Level 1 anchor (46..49 -> center ~47.5), clamped within [reservedMinGx, reservedMaxGx]
  const anchorCenterGx = reservedMinGx + 9.5; // 47.5 when reservedMinGx = 38
  let minGx = Math.round(anchorCenterGx - w / 2);
  if (minGx < reservedMinGx) minGx = reservedMinGx;
  if (minGx + w - 1 > reservedMaxGx) minGx = reservedMaxGx - w + 1;
  const maxGx = minGx + w - 1;

  // Front edge stays anchored at reservedMaxGz (53) so the depot entrance and forecourt
  // always connect cleanly to the southern access road (gz = 54..55).
  const maxGz = reservedMaxGz;
  const minGz = Math.max(reservedMinGz, maxGz - d + 1);

  return {
    constructedGx: minGx,
    constructedGz: minGz,
    activeMinGx: minGx,
    activeMaxGx: maxGx,
    activeMinGz: minGz,
    activeMaxGz: maxGz,
    activeWidthCells: w,
    activeDepthCells: d,
  };
}

/**
 * Generates deterministic, non-overlapping world coordinates for all 15 parking slots
 * inside the active depot footprint so that:
 * - At Level 1 (4x3 = 8m x 6m), Slots 1, 2, and 3 are positioned neatly side-by-side
 *   in the 3 front garage bays/forecourt aprons without overlapping walls or each other.
 * - As the depot upgrades through Level 10 (12x6, 9 slots) to Level 20 (20x8, 15 slots),
 *   slots 1..3 remain stable in the primary front bays while additional slots (4..15)
 *   populate the expanded garage bays and marked forecourt parking rows.
 */
export function computeTruckDepotParkingSlots(
  depotId: string,
  level: number,
  activeMinGx: number,
  activeMaxGx: number,
  activeMinGz: number,
  activeMaxGz: number,
  existingSlots?: TruckDepotParkingSlotRecord[]
): TruckDepotParkingSlotRecord[] {
  const cfg = createDefaultWorldConfig();
  const cs = cfg.cellSize;
  const originX = cfg.originX;
  const originZ = cfg.originZ;
  const spec = getTruckDepotLevelSpec(level);

  const minWorldX = originX + activeMinGx * cs;
  const maxWorldX = originX + (activeMaxGx + 1) * cs;
  const minWorldZ = originZ + activeMinGz * cs;
  const maxWorldZ = originZ + (activeMaxGz + 1) * cs;
  const activeWidthMeters = maxWorldX - minWorldX;
  const activeDepthMeters = maxWorldZ - minWorldZ;
  const centerWorldX = (minWorldX + maxWorldX) * 0.5;

  // Primary front bay Z sits cleanly on the concrete forecourt in front of the garage bay doors facing south (+Z)
  const frontRowZ = maxWorldZ - Math.min(1.85, Math.max(1.18, activeDepthMeters * 0.24));
  // Secondary yard apron row Z sits closer to the southern forecourt when depth >= 4 cells
  const yardRowZ = maxWorldZ - Math.min(0.95, activeDepthMeters * 0.12);

  const existingByNumber = new Map<number, TruckDepotParkingSlotRecord>();
  if (existingSlots) {
    for (const s of existingSlots) {
      existingByNumber.set(s.slotNumber, s);
    }
  }

  const slots: TruckDepotParkingSlotRecord[] = [];
  // Shift bay center slightly east (+0.72m at Level 1) so the 3 starter slots align directly
  // with the 3 garage bays to the right of the glazed left dispatch office wing
  const bayZoneCenterX = centerWorldX + Math.min(0.95, activeWidthMeters * 0.085);

  for (let slotNum = 1; slotNum <= TRUCK_DEPOT_MAX_CAPACITY; slotNum++) {
    const unlocked = slotNum <= spec.truckCapacity;
    const prev = existingByNumber.get(slotNum);

    let worldX = bayZoneCenterX;
    let worldZ = frontRowZ;
    let bayRow: 'FRONT_BAY' | 'YARD_APRON_ROW' = 'FRONT_BAY';

    if (slotNum <= 3) {
      // Primary 3 starter slots: neatly spaced in front of the 3 garage bays
      const offsetIndex = slotNum - 2; // -1, 0, +1
      const spacing = Math.min(2.05, (activeWidthMeters - 2.2) / 2.8);
      worldX = bayZoneCenterX + offsetIndex * spacing;
      worldZ = frontRowZ;
      bayRow = 'FRONT_BAY';
    } else if (slotNum <= 8) {
      // Slots 4..8: expand outward along the main garage bay line
      const sideIndex = slotNum - 3; // 1..5
      const dir = sideIndex % 2 === 1 ? 1 : -1;
      const rank = Math.ceil(sideIndex / 2); // 1, 1, 2, 2, 3
      const baseSpacing = 2.15;
      const rawX = bayZoneCenterX + dir * (1 + rank) * baseSpacing;
      worldX = Math.max(minWorldX + 1.2, Math.min(maxWorldX - 1.2, rawX));
      worldZ = frontRowZ;
      bayRow = 'FRONT_BAY';
    } else {
      // Slots 9..15: marked forecourt apron parking bays along the southern yard row
      const apronIdx = slotNum - 9; // 0..6 (7 slots across the forecourt)
      const totalApronSlots = 7;
      const usableSpan = Math.max(6, activeWidthMeters - 3.2);
      const step = usableSpan / (totalApronSlots - 1);
      worldX = minWorldX + 1.6 + apronIdx * step;
      worldZ = yardRowZ;
      bayRow = 'YARD_APRON_ROW';
    }

    const assignedVehicleId = unlocked ? (prev?.assignedVehicleId ?? null) : null;
    let occupancyState: TruckDepotSlotOccupancyState = 'EMPTY';
    if (assignedVehicleId) {
      occupancyState = prev && prev.occupancyState !== 'EMPTY' ? prev.occupancyState : 'PARKED';
    }

    slots.push({
      slotId: `${depotId}-slot-${slotNum}`,
      depotId,
      slotNumber: slotNum,
      unlocked,
      unlocksAtLevel: getSlotUnlockLevel(slotNum),
      bayRow,
      worldX: Number(worldX.toFixed(2)),
      worldY: 1.26,
      worldZ: Number(worldZ.toFixed(2)),
      headingYaw: 0, // Facing south (+Z) toward the depot exit and road network
      assignedVehicleId,
      occupancyState,
    });
  }

  return slots;
}

/**
 * Generates restrained industrial yard props on the unused cells of the 20x8 reserved property.
 * As the active depot footprint expands from 4x3 to 20x8, any prop falling inside the active
 * footprint is automatically removed so the reserved land converts cleanly into active depot space.
 */
export function computeUnusedReservedDepotProps(
  reservedMinGx: number,
  reservedMaxGx: number,
  reservedMinGz: number,
  reservedMaxGz: number,
  activeMinGx: number,
  activeMaxGx: number,
  activeMinGz: number,
  activeMaxGz: number
): TruckDepotUnusedReservedPropPlacement[] {
  const cfg = createDefaultWorldConfig();
  const cs = cfg.cellSize;
  const originX = cfg.originX;
  const originZ = cfg.originZ;
  const candidateProps: Array<{
    id: string;
    kind: TruckDepotUnusedReservedPropPlacement['kind'];
    gx: number;
    gz: number;
    rot: number;
  }> = [
    { id: 'depot-res-prop-1',  kind: 'STORAGE_CONTAINER', gx: reservedMinGx + 1,  gz: reservedMinGz + 1, rot: 0 },
    { id: 'depot-res-prop-2',  kind: 'BRICK_PALLET',      gx: reservedMinGx + 3,  gz: reservedMinGz + 2, rot: 0.25 },
    { id: 'depot-res-prop-3',  kind: 'CARDBOARD_STACK',   gx: reservedMinGx + 2,  gz: reservedMinGz + 5, rot: -0.15 },
    { id: 'depot-res-prop-4',  kind: 'TIMBER_CRATE',      gx: reservedMinGx + 5,  gz: reservedMinGz + 1, rot: 0.1 },
    { id: 'depot-res-prop-5',  kind: 'BRICK_PALLET',      gx: reservedMinGx + 6,  gz: reservedMinGz + 5, rot: 0.4 },
    { id: 'depot-res-prop-6',  kind: 'CARDBOARD_STACK',   gx: reservedMaxGx - 5,  gz: reservedMinGz + 2, rot: -0.2 },
    { id: 'depot-res-prop-7',  kind: 'STORAGE_CONTAINER', gx: reservedMaxGx - 2,  gz: reservedMinGz + 1, rot: 0 },
    { id: 'depot-res-prop-8',  kind: 'TIMBER_CRATE',      gx: reservedMaxGx - 3,  gz: reservedMinGz + 5, rot: 0.3 },
    { id: 'depot-res-prop-9',  kind: 'BRICK_PALLET',      gx: reservedMaxGx - 1,  gz: reservedMinGz + 4, rot: -0.35 },
    { id: 'depot-res-prop-10', kind: 'CARDBOARD_STACK',   gx: reservedMinGx + 10, gz: reservedMinGz + 1, rot: 0.15 },
  ];

  const activeProps: TruckDepotUnusedReservedPropPlacement[] = [];
  for (const cand of candidateProps) {
    const insideActive =
      cand.gx >= activeMinGx &&
      cand.gx <= activeMaxGx &&
      cand.gz >= activeMinGz &&
      cand.gz <= activeMaxGz;
    if (insideActive) continue;

    activeProps.push({
      propId: cand.id,
      kind: cand.kind,
      gx: cand.gx,
      gz: cand.gz,
      worldX: originX + (cand.gx + 0.5) * cs,
      worldZ: originZ + (cand.gz + 0.5) * cs,
      rotationY: cand.rot,
    });
  }

  return activeProps;
}

export function createInitialTruckDepotFacilityState(
  reservedMinGx = 38,
  reservedMinGz = 45,
  initialLevel = 1
): TruckDepotFacilityState {
  const reservedWidthCells = TRUCK_DEPOT_MAX_RESERVED_FOOTPRINT.widthCells; // 20
  const reservedDepthCells = TRUCK_DEPOT_MAX_RESERVED_FOOTPRINT.depthCells; // 8
  const reservedMaxGx = reservedMinGx + reservedWidthCells - 1; // 57
  const reservedMaxGz = reservedMinGz + reservedDepthCells - 1; // 52

  const spec = getTruckDepotLevelSpec(initialLevel);
  const nextSpec =
    spec.level < TRUCK_DEPOT_MAX_LEVEL ? getTruckDepotLevelSpec(spec.level + 1) : null;

  const bounds = computeTruckDepotActiveBounds(
    spec.level,
    reservedMinGx,
    reservedMaxGx,
    reservedMinGz,
    reservedMaxGz
  );

  const slots = computeTruckDepotParkingSlots(
    TRUCK_DEPOT_ID,
    spec.level,
    bounds.activeMinGx,
    bounds.activeMaxGx,
    bounds.activeMinGz,
    bounds.activeMaxGz
  );

  const unusedReservedProps = computeUnusedReservedDepotProps(
    reservedMinGx,
    reservedMaxGx,
    reservedMinGz,
    reservedMaxGz,
    bounds.activeMinGx,
    bounds.activeMaxGx,
    bounds.activeMinGz,
    bounds.activeMaxGz
  );

  return {
    id: TRUCK_DEPOT_ID,
    depotId: TRUCK_DEPOT_ID,
    name: 'Westgate Truck Depot',
    level: spec.level,
    maxLevel: TRUCK_DEPOT_MAX_LEVEL,
    reservedMinGx,
    reservedMaxGx,
    reservedMinGz,
    reservedMaxGz,
    reservedWidthCells,
    reservedDepthCells,
    constructedGx: bounds.constructedGx,
    constructedGz: bounds.constructedGz,
    activeMinGx: bounds.activeMinGx,
    activeMaxGx: bounds.activeMaxGx,
    activeMinGz: bounds.activeMinGz,
    activeMaxGz: bounds.activeMaxGz,
    activeWidthCells: bounds.activeWidthCells,
    activeDepthCells: bounds.activeDepthCells,
    truckCapacity: spec.truckCapacity,
    maxTruckCapacity: TRUCK_DEPOT_MAX_CAPACITY,
    garageBayCount: spec.garageBayCount,
    buildingHeightMeters: spec.buildingHeightMeters,
    entranceClearanceWidthMeters: spec.entranceClearanceWidthMeters,
    entranceClearanceHeightMeters: spec.entranceClearanceHeightMeters,
    supportsLargeTrucks: spec.supportsLargeTrucks,
    upgradeCost: spec.upgradeCostToNextLevel,
    nextLevelUpgradeCost: spec.level < TRUCK_DEPOT_MAX_LEVEL ? spec.upgradeCostToNextLevel : null,
    nextLevelSpec: nextSpec,
    slots,
    unusedReservedProps,
  };
}

export function applyTruckDepotLevelState(
  depot: TruckDepotFacilityState,
  targetLevel: number
): TruckDepotFacilityState {
  const spec = getTruckDepotLevelSpec(targetLevel);
  const nextSpec =
    spec.level < TRUCK_DEPOT_MAX_LEVEL ? getTruckDepotLevelSpec(spec.level + 1) : null;

  const bounds = computeTruckDepotActiveBounds(
    spec.level,
    depot.reservedMinGx,
    depot.reservedMaxGx,
    depot.reservedMinGz,
    depot.reservedMaxGz
  );

  const slots = computeTruckDepotParkingSlots(
    depot.depotId,
    spec.level,
    bounds.activeMinGx,
    bounds.activeMaxGx,
    bounds.activeMinGz,
    bounds.activeMaxGz,
    depot.slots
  );

  const unusedReservedProps = computeUnusedReservedDepotProps(
    depot.reservedMinGx,
    depot.reservedMaxGx,
    depot.reservedMinGz,
    depot.reservedMaxGz,
    bounds.activeMinGx,
    bounds.activeMaxGx,
    bounds.activeMinGz,
    bounds.activeMaxGz
  );

  return {
    ...depot,
    id: depot.id || TRUCK_DEPOT_ID,
    level: spec.level,
    constructedGx: bounds.constructedGx,
    constructedGz: bounds.constructedGz,
    activeMinGx: bounds.activeMinGx,
    activeMaxGx: bounds.activeMaxGx,
    activeMinGz: bounds.activeMinGz,
    activeMaxGz: bounds.activeMaxGz,
    activeWidthCells: bounds.activeWidthCells,
    activeDepthCells: bounds.activeDepthCells,
    truckCapacity: spec.truckCapacity,
    garageBayCount: spec.garageBayCount,
    buildingHeightMeters: spec.buildingHeightMeters,
    entranceClearanceWidthMeters: spec.entranceClearanceWidthMeters,
    entranceClearanceHeightMeters: spec.entranceClearanceHeightMeters,
    supportsLargeTrucks: spec.supportsLargeTrucks,
    upgradeCost: spec.upgradeCostToNextLevel,
    nextLevelUpgradeCost: spec.level < TRUCK_DEPOT_MAX_LEVEL ? spec.upgradeCostToNextLevel : null,
    nextLevelSpec: nextSpec,
    slots,
    unusedReservedProps,
  };
}

export function isCellInTruckDepotReservedArea(
  depot: TruckDepotFacilityState,
  gx: number,
  gz: number
): boolean {
  return (
    gx >= depot.reservedMinGx &&
    gx <= depot.reservedMaxGx &&
    gz >= depot.reservedMinGz &&
    gz <= depot.reservedMaxGz
  );
}

export function isCellInTruckDepotActiveFootprint(
  depot: TruckDepotFacilityState,
  gx: number,
  gz: number
): boolean {
  return (
    gx >= depot.activeMinGx &&
    gx <= depot.activeMaxGx &&
    gz >= depot.activeMinGz &&
    gz <= depot.activeMaxGz
  );
}
