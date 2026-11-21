/**
 * Authoritative Catalogues for Buildings, Vehicles, Livery Variations, and Level Progression.
 * Covers Master Prompts 1–6 (City Architecture, Transport Infrastructure, Economy, Vehicles, Buildings & Unlocks).
 */

import { ZoneCategory } from './WorldConfig';

export type TransportModalCategory = 'ROAD' | 'RAIL' | 'AIR' | 'WATER';

export type BuildingCatalogueCategory =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'INDUSTRIAL'
  | 'ROAD_LOGISTICS'
  | 'RAILWAY'
  | 'AIRPORT'
  | 'HARBOUR'
  | 'INFRASTRUCTURE';

export type TrailerBodyStyle =
  | 'NONE'
  | 'BOX_VAN'
  | 'ENCLOSED_TRAILER'
  | 'CONTAINER_TRAILER'
  | 'REFRIGERATED_TRAILER'
  | 'FLATBED_TRAILER'
  | 'TANKER_TRAILER'
  | 'BULK_HOPPER_TRAILER';

export type RoofArchitectureStyle =
  | 'PITCHED_TILE'
  | 'FLAT_MEMBRANE_HVAC'
  | 'SAWTOOTH_INDUSTRIAL'
  | 'ARCHED_BARREL'
  | 'STEPPED_CROWN'
  | 'CLERESTORY_SHED'
  | 'MODERN_CANTILEVER';

export type FacadeMaterialStyle =
  | 'WARM_BRICK'
  | 'ARCHITECTURAL_CONCRETE'
  | 'CURTAIN_GLASS_BLUE'
  | 'CORRUGATED_STEEL'
  | 'LIMESTONE_PLASTER'
  | 'TERRACOTTA_CLAD'
  | 'MARITIME_TEAL_STEEL';

export interface BuildingCatalogueItem {
  id: string;
  name: string;
  category: BuildingCatalogueCategory;
  description: string;
  widthCells: number;
  depthCells: number;
  heightMeters: number;
  price: number;
  operatingCostPerMin: number;
  unlockLevel: number;
  allowedZones: ZoneCategory[];
  storageCapacityTons: number;
  vehicleSlotCapacity: number;
  vehicleSlotModal?: TransportModalCategory;
  producesCargo?: string;
  demandsCargo?: string;
  roofStyle: RoofArchitectureStyle;
  facadeStyle: FacadeMaterialStyle;
  primaryColorHex: number;
  secondaryColorHex: number;
  accentColorHex: number;
  hasLoadingBays: boolean;
}

export interface VehicleLiverySpec {
  id: string;
  name: string;
  cabColorHex: number;
  bodyColorHex: number;
  stripeColorHex: number;
}

export const FLEET_LIVERIES: VehicleLiverySpec[] = [
  {
    id: 'livery-atlantic-blue',
    name: 'Atlantic Logistics Blue',
    cabColorHex: 0x0284c7,
    bodyColorHex: 0xf1f5f9,
    stripeColorHex: 0x38bdf8,
  },
  {
    id: 'livery-amber-express',
    name: 'Continental Amber Freight',
    cabColorHex: 0xd97706,
    bodyColorHex: 0xf8fafc,
    stripeColorHex: 0xfbbf24,
  },
  {
    id: 'livery-emerald-line',
    name: 'Emerald Valley Transport',
    cabColorHex: 0x059669,
    bodyColorHex: 0xe2e8f0,
    stripeColorHex: 0x34d399,
  },
  {
    id: 'livery-crimson-cargo',
    name: 'Redline Heavy Haulage',
    cabColorHex: 0xdc2626,
    bodyColorHex: 0xe5e7eb,
    stripeColorHex: 0xf87171,
  },
  {
    id: 'livery-titanium-corp',
    name: 'Titanium Global Fleet',
    cabColorHex: 0x334155,
    bodyColorHex: 0xcbd5e1,
    stripeColorHex: 0x94a3b8,
  },
];

export interface VehicleCatalogueItem {
  id: string;
  name: string;
  modal: TransportModalCategory;
  subClass: string;
  description: string;
  price: number;
  unlockLevel: number;
  capacityTons: number;
  cruisingSpeedKmh: number; // Always 25 km/h for trucks per Master Prompts 3, 4 & 5
  operatingCostPerKm: number;
  maintenanceCostEvery5Days: number;
  isArticulated: boolean;
  trailerStyle: TrailerBodyStyle;
  wagonCount?: number;
  lengthMeters: number;
  widthMeters: number;
  heightMeters: number;
  wheelRadiusMeters: number;
  defaultLiveryId: string;
  compatibleCargo: string[];
}

export interface LevelProgressionSpec {
  level: number;
  xpRequired: number;
  title: string;
  cashBonus: number;
  unlockSummary: string[];
}

export const LEVEL_PROGRESSION_TABLE: LevelProgressionSpec[] = [
  {
    level: 1,
    xpRequired: 0,
    title: 'Regional Dispatch Contractor',
    cashBonus: 0,
    unlockSummary: [
      'Starter Level 1 Truck Depot (3 Vehicle Slots)',
      'Light Delivery Vans & Standard Box Trucks',
      '1x1 & 2x2 Roads, Road Bridges & Starter Rail Yard',
    ],
  },
  {
    level: 2,
    xpRequired: 250,
    title: 'Municipal Freight Coordinator',
    cashBonus: 12000,
    unlockSummary: [
      'Heavy Tractor + Enclosed & Container Trailers',
      'Freight Warehouses, Suburban Townhouses & Supermarkets',
      'North Rail Yard Expansion Tile I & Diesel Freight Locomotives',
    ],
  },
  {
    level: 3,
    xpRequired: 650,
    title: 'Intermodal Network Director',
    cashBonus: 22000,
    unlockSummary: [
      'Refrigerated Reefer & Flatbed Tractor-Trailers',
      '3x3 Six-Lane Urban Arterial Roads & Bridges',
      'Coastal Feeder Cargo Vessels & Cold-Storage Warehouses',
    ],
  },
  {
    level: 4,
    xpRequired: 1300,
    title: 'Continental Logistics Executive',
    cashBonus: 35000,
    unlockSummary: [
      'Tanker & Bulk Hopper Tractor-Trailers',
      'Heavy Dual-Cab Locomotives & Regional Cargo Turboprops',
      'Large Distribution Centres & Container Ship Operations',
    ],
  },
  {
    level: 5,
    xpRequired: 2200,
    title: 'Global Transport Magnate',
    cashBonus: 55000,
    unlockSummary: [
      'Northeast Cargo Airport Operations & Jet Freighters',
      'Panamax Container Ships, Maritime Tankers & High-Rise Towers',
      'Full 6-Track Rail Corridor & Advanced Intermodal Terminals',
    ],
  },
  {
    level: 6,
    xpRequired: 3500,
    title: 'Supreme Logistics Emperor',
    cashBonus: 85000,
    unlockSummary: [
      'Heavy Widebody Cargo Jets & Ultra-Large Maritime Bulk Carriers',
      'Maximum World Expansion & Sovereign Trade Hub Complexes',
    ],
  },
  {
    level: 100,
    xpRequired: 250000,
    title: 'Global Aviation & Air Cargo Sovereign',
    cashBonus: 500000,
    unlockSummary: [
      'Regional Air Cargo Hub (30×40 → 40×50 → 50×70 Cargo Airport Restoration & Purchase for $15,000,000)',
      '10×15 Air Cargo Terminal + 18×6 Truck Yard, 1–10 Parking Stands, 2 Hangars ($5M each) & Up to 2 Owned Aircraft',
    ],
  },
];

export const BUILDING_CATALOGUE: BuildingCatalogueItem[] = [
  // =========================================================================
  // A. RESIDENTIAL BUILDINGS
  // =========================================================================
  {
    id: 'bld-res-suburban-house',
    name: ' Maple Suburban Residence',
    category: 'RESIDENTIAL',
    description: 'Detached two-storey family house with pitched terracotta roof and landscaped garden.',
    widthCells: 2,
    depthCells: 2,
    heightMeters: 3.4,
    price: 4500,
    operatingCostPerMin: 15,
    unlockLevel: 1,
    allowedZones: [ZoneCategory.CITY, ZoneCategory.OPEN_LAND, ZoneCategory.FUTURE_EXPANSION],
    storageCapacityTons: 0,
    vehicleSlotCapacity: 0,
    roofStyle: 'PITCHED_TILE',
    facadeStyle: 'LIMESTONE_PLASTER',
    primaryColorHex: 0xe2dcd0,
    secondaryColorHex: 0x9a4432,
    accentColorHex: 0x475569,
    hasLoadingBays: false,
  },
  {
    id: 'bld-res-townhouse-row',
    name: 'Heritage Brick Townhouses',
    category: 'RESIDENTIAL',
    description: 'Row of three warm-brick urban townhouses with recessed balconies and front steps.',
    widthCells: 3,
    depthCells: 2,
    heightMeters: 4.8,
    price: 7800,
    operatingCostPerMin: 25,
    unlockLevel: 1,
    allowedZones: [ZoneCategory.CITY, ZoneCategory.COMMERCIAL_SUPPORT, ZoneCategory.FUTURE_EXPANSION],
    storageCapacityTons: 0,
    vehicleSlotCapacity: 0,
    roofStyle: 'PITCHED_TILE',
    facadeStyle: 'WARM_BRICK',
    primaryColorHex: 0xa85542,
    secondaryColorHex: 0x334155,
    accentColorHex: 0xf8fafc,
    hasLoadingBays: false,
  },
  {
    id: 'bld-res-midrise-apartments',
    name: 'Parkview Mid-Rise Apartments',
    category: 'RESIDENTIAL',
    description: 'Six-storey residential apartment block with wrap-around balconies and courtyard.',
    widthCells: 3,
    depthCells: 3,
    heightMeters: 7.6,
    price: 14500,
    operatingCostPerMin: 45,
    unlockLevel: 2,
    allowedZones: [ZoneCategory.CITY, ZoneCategory.COMMERCIAL_SUPPORT, ZoneCategory.FUTURE_EXPANSION],
    storageCapacityTons: 0,
    vehicleSlotCapacity: 0,
    roofStyle: 'FLAT_MEMBRANE_HVAC',
    facadeStyle: 'ARCHITECTURAL_CONCRETE',
    primaryColorHex: 0xd6d3d1,
    secondaryColorHex: 0x475569,
    accentColorHex: 0x38bdf8,
    hasLoadingBays: false,
  },
  {
    id: 'bld-res-skyline-tower',
    name: 'Sapphire Residential Tower',
    category: 'RESIDENTIAL',
    description: 'High-density luxury residential tower generating passenger and retail demand.',
    widthCells: 4,
    depthCells: 4,
    heightMeters: 13.5,
    price: 32000,
    operatingCostPerMin: 90,
    unlockLevel: 4,
    allowedZones: [ZoneCategory.CITY, ZoneCategory.FUTURE_EXPANSION],
    storageCapacityTons: 20,
    vehicleSlotCapacity: 0,
    demandsCargo: 'Consumer Goods',
    roofStyle: 'STEPPED_CROWN',
    facadeStyle: 'CURTAIN_GLASS_BLUE',
    primaryColorHex: 0xcbd5e1,
    secondaryColorHex: 0x0284c7,
    accentColorHex: 0xfbbf24,
    hasLoadingBays: false,
  },

  // =========================================================================
  // B. COMMERCIAL BUILDINGS
  // =========================================================================
  {
    id: 'bld-com-corner-market',
    name: 'Metro Corner Retail & Cafe',
    category: 'COMMERCIAL',
    description: 'Ground-floor glazed shopfronts with upper commercial offices and awning signage.',
    widthCells: 2,
    depthCells: 2,
    heightMeters: 4.2,
    price: 6500,
    operatingCostPerMin: 22,
    unlockLevel: 1,
    allowedZones: [ZoneCategory.CITY, ZoneCategory.COMMERCIAL_SUPPORT, ZoneCategory.OPEN_LAND],
    storageCapacityTons: 25,
    vehicleSlotCapacity: 0,
    demandsCargo: 'Food & Retail',
    roofStyle: 'FLAT_MEMBRANE_HVAC',
    facadeStyle: 'TERRACOTTA_CLAD',
    primaryColorHex: 0xc2785c,
    secondaryColorHex: 0x1e293b,
    accentColorHex: 0xfbbf24,
    hasLoadingBays: false,
  },
  {
    id: 'bld-com-supermarket',
    name: 'FreshMart Regional Supermarket',
    category: 'COMMERCIAL',
    description: 'Large retail store with customer parking apron and rear delivery dock for food trucks.',
    widthCells: 4,
    depthCells: 3,
    heightMeters: 4.6,
    price: 15000,
    operatingCostPerMin: 50,
    unlockLevel: 2,
    allowedZones: [ZoneCategory.CITY, ZoneCategory.COMMERCIAL_SUPPORT, ZoneCategory.OPEN_LAND],
    storageCapacityTons: 80,
    vehicleSlotCapacity: 0,
    demandsCargo: 'Refrigerated Food',
    roofStyle: 'FLAT_MEMBRANE_HVAC',
    facadeStyle: 'ARCHITECTURAL_CONCRETE',
    primaryColorHex: 0xe2e8f0,
    secondaryColorHex: 0x059669,
    accentColorHex: 0x34d399,
    hasLoadingBays: true,
  },
  {
    id: 'bld-com-office-plaza',
    name: 'Continental Commerce Plaza',
    category: 'COMMERCIAL',
    description: 'Modern glass-and-stone office complex with podium atrium and underground access.',
    widthCells: 4,
    depthCells: 4,
    heightMeters: 10.5,
    price: 26000,
    operatingCostPerMin: 80,
    unlockLevel: 3,
    allowedZones: [ZoneCategory.CITY, ZoneCategory.COMMERCIAL_SUPPORT],
    storageCapacityTons: 40,
    vehicleSlotCapacity: 0,
    demandsCargo: 'Office Supplies',
    roofStyle: 'STEPPED_CROWN',
    facadeStyle: 'CURTAIN_GLASS_BLUE',
    primaryColorHex: 0x94a3b8,
    secondaryColorHex: 0x0369a1,
    accentColorHex: 0x38bdf8,
    hasLoadingBays: false,
  },
  {
    id: 'bld-com-financial-tower',
    name: 'Delivery Headquarters',
    category: 'ROAD_LOGISTICS',
    description:
      'Dedicated 10×20 corporate Delivery Headquarters (CTH / GTE) featuring a stepped L-shaped 5-story glass & concrete structure, rooftop circular Helipad ("H"), solar panel arrays, rooftop garden terraces, entrance portico, and manicured boxwood plaza.',
    widthCells: 10,
    depthCells: 20,
    heightMeters: 16.5,
    price: 48000,
    operatingCostPerMin: 130,
    unlockLevel: 1,
    allowedZones: [
      ZoneCategory.CITY,
      ZoneCategory.LOGISTICS,
      ZoneCategory.COMMERCIAL_SUPPORT,
    ],
    storageCapacityTons: 120,
    vehicleSlotCapacity: 0,
    demandsCargo: 'Express Packages & Electronics',
    roofStyle: 'STEPPED_CROWN',
    facadeStyle: 'CURTAIN_GLASS_BLUE',
    primaryColorHex: 0xe2e8f0,
    secondaryColorHex: 0x0f172a,
    accentColorHex: 0x38bdf8,
    hasLoadingBays: true,
  },

  // =========================================================================
  // C. INDUSTRIAL & WAREHOUSE BUILDINGS
  // =========================================================================
  {
    id: 'bld-logistics-warehouse-1',
    name: 'Warehouse 1 (20-Level Logistics Hub)',
    category: 'ROAD_LOGISTICS',
    description:
      'Upgradeable 20-level regional cargo hub starting at 5×6 on a 25×30 reserved property with 2–10 loading doors and 2–10 operational forklifts.',
    widthCells: 5,
    depthCells: 6,
    heightMeters: 4.8,
    price: 16000,
    operatingCostPerMin: 45,
    unlockLevel: 1,
    allowedZones: [ZoneCategory.LOGISTICS, ZoneCategory.INDUSTRIAL, ZoneCategory.OPEN_LAND],
    storageCapacityTons: 17, // Level 1: 5t Food + 10t Industrial + 2t Packages = 17t
    vehicleSlotCapacity: 0,
    producesCargo: 'Food, Industrial & Normal Packages',
    roofStyle: 'CLERESTORY_SHED',
    facadeStyle: 'CORRUGATED_STEEL',
    primaryColorHex: 0x475569,
    secondaryColorHex: 0x1e293b,
    accentColorHex: 0xf59e0b,
    hasLoadingBays: true,
  },
  {
    id: 'bld-ind-small-warehouse',
    name: 'Standard Freight Warehouse',
    category: 'INDUSTRIAL',
    description: 'Corrugated steel cargo warehouse with 3 raised truck loading bays and staging yard.',
    widthCells: 4,
    depthCells: 3,
    heightMeters: 4.4,
    price: 11000,
    operatingCostPerMin: 35,
    unlockLevel: 1,
    allowedZones: [ZoneCategory.LOGISTICS, ZoneCategory.INDUSTRIAL, ZoneCategory.OPEN_LAND],
    storageCapacityTons: 120,
    vehicleSlotCapacity: 0,
    producesCargo: 'Packaged Freight',
    demandsCargo: 'Raw Materials',
    roofStyle: 'CLERESTORY_SHED',
    facadeStyle: 'CORRUGATED_STEEL',
    primaryColorHex: 0x64748b,
    secondaryColorHex: 0x334155,
    accentColorHex: 0xeab308,
    hasLoadingBays: true,
  },
  {
    id: 'bld-ind-manufacturing-plant',
    name: 'Precision Assembly Factory',
    category: 'INDUSTRIAL',
    description: 'Sawtooth-roofed industrial manufacturing plant with twin ventilation stacks.',
    widthCells: 5,
    depthCells: 4,
    heightMeters: 5.8,
    price: 22000,
    operatingCostPerMin: 75,
    unlockLevel: 2,
    allowedZones: [ZoneCategory.INDUSTRIAL, ZoneCategory.LOGISTICS, ZoneCategory.OPEN_LAND],
    storageCapacityTons: 200,
    vehicleSlotCapacity: 0,
    producesCargo: 'Machinery & Parts',
    demandsCargo: 'Steel Coils',
    roofStyle: 'SAWTOOTH_INDUSTRIAL',
    facadeStyle: 'WARM_BRICK',
    primaryColorHex: 0x8c4a3b,
    secondaryColorHex: 0x475569,
    accentColorHex: 0xf59e0b,
    hasLoadingBays: true,
  },
  {
    id: 'bld-ind-processing-refinery',
    name: 'Petrochemical & Fuel Processing Plant',
    category: 'INDUSTRIAL',
    description: 'Industrial processing facility with cylindrical storage silos and tanker bays.',
    widthCells: 5,
    depthCells: 5,
    heightMeters: 6.8,
    price: 34000,
    operatingCostPerMin: 110,
    unlockLevel: 3,
    allowedZones: [ZoneCategory.INDUSTRIAL, ZoneCategory.OPEN_LAND],
    storageCapacityTons: 320,
    vehicleSlotCapacity: 0,
    producesCargo: 'Refined Fuel',
    demandsCargo: 'Crude Oil',
    roofStyle: 'FLAT_MEMBRANE_HVAC',
    facadeStyle: 'CORRUGATED_STEEL',
    primaryColorHex: 0x94a3b8,
    secondaryColorHex: 0x1e293b,
    accentColorHex: 0xef4444,
    hasLoadingBays: true,
  },
  {
    id: 'bld-ind-mega-distribution',
    name: 'Mega Regional Distribution Hub',
    category: 'INDUSTRIAL',
    description: 'High-throughput cross-docking fulfillment center with 6 loading bays and rooftop solar.',
    widthCells: 6,
    depthCells: 4,
    heightMeters: 5.6,
    price: 42000,
    operatingCostPerMin: 125,
    unlockLevel: 4,
    allowedZones: [ZoneCategory.LOGISTICS, ZoneCategory.INDUSTRIAL],
    storageCapacityTons: 480,
    vehicleSlotCapacity: 0,
    producesCargo: 'Consumer Goods',
    demandsCargo: 'Intermodal Containers',
    roofStyle: 'FLAT_MEMBRANE_HVAC',
    facadeStyle: 'ARCHITECTURAL_CONCRETE',
    primaryColorHex: 0xcbd5e1,
    secondaryColorHex: 0x0284c7,
    accentColorHex: 0x38bdf8,
    hasLoadingBays: true,
  },

  // =========================================================================
  // D. ROAD LOGISTICS BUILDINGS
  // =========================================================================
  {
    id: 'bld-road-truck-depot-lv1',
    name: 'Westgate Truck Depot',
    category: 'ROAD_LOGISTICS',
    description: '20-level upgradeable industrial truck depot (4×3 at Level 1 with 3 truck slots up to 20×8 at Level 20 with 15 truck slots).',
    widthCells: 4,
    depthCells: 3,
    heightMeters: 4.3,
    price: 12000,
    operatingCostPerMin: 40,
    unlockLevel: 1,
    allowedZones: [ZoneCategory.LOGISTICS, ZoneCategory.INDUSTRIAL, ZoneCategory.CITY, ZoneCategory.OPEN_LAND],
    storageCapacityTons: 60,
    vehicleSlotCapacity: 3, // Strictly 3 slots at Level 1 -> 15 slots at Level 20!
    vehicleSlotModal: 'ROAD',
    roofStyle: 'CLERESTORY_SHED',
    facadeStyle: 'CORRUGATED_STEEL',
    primaryColorHex: 0xcbd5e1,
    secondaryColorHex: 0x1d4ed8,
    accentColorHex: 0xfbbf24,
    hasLoadingBays: true,
  },
  {
    id: 'bld-road-cold-storage',
    name: 'CryoChain Cold-Storage Warehouse',
    category: 'ROAD_LOGISTICS',
    description: 'Insulated temperature-controlled logistics hub for refrigerated reefer trailers.',
    widthCells: 4,
    depthCells: 4,
    heightMeters: 4.8,
    price: 21000,
    operatingCostPerMin: 70,
    unlockLevel: 3,
    allowedZones: [ZoneCategory.LOGISTICS, ZoneCategory.INDUSTRIAL, ZoneCategory.OPEN_LAND],
    storageCapacityTons: 240,
    vehicleSlotCapacity: 2,
    vehicleSlotModal: 'ROAD',
    producesCargo: 'Refrigerated Food',
    roofStyle: 'FLAT_MEMBRANE_HVAC',
    facadeStyle: 'ARCHITECTURAL_CONCRETE',
    primaryColorHex: 0xe0f2fe,
    secondaryColorHex: 0x0284c7,
    accentColorHex: 0x38bdf8,
    hasLoadingBays: true,
  },
  {
    id: 'bld-road-heavy-fleet-terminal',
    name: 'Heavy Haulage Fleet Terminal',
    category: 'ROAD_LOGISTICS',
    description: 'Large tractor-trailer dispatch complex with 6 heavy vehicle bays and fuel island.',
    widthCells: 5,
    depthCells: 4,
    heightMeters: 5.0,
    price: 29000,
    operatingCostPerMin: 95,
    unlockLevel: 3,
    allowedZones: [ZoneCategory.LOGISTICS, ZoneCategory.INDUSTRIAL],
    storageCapacityTons: 150,
    vehicleSlotCapacity: 6,
    vehicleSlotModal: 'ROAD',
    roofStyle: 'MODERN_CANTILEVER',
    facadeStyle: 'CORRUGATED_STEEL',
    primaryColorHex: 0x334155,
    secondaryColorHex: 0x0f172a,
    accentColorHex: 0xf59e0b,
    hasLoadingBays: true,
  },

  // =========================================================================
  // E. RAILWAY BUILDINGS (Strict Rail Yard Zone)
  // =========================================================================
  {
    id: 'bld-rail-locomotive-depot',
    name: 'Locomotive Maintenance & Traction Depot',
    category: 'RAILWAY',
    description: 'Brick-and-steel locomotive shed with overhead crane, inspection pits, and 2 train slots.',
    widthCells: 4,
    depthCells: 5,
    heightMeters: 4.8,
    price: 24000,
    operatingCostPerMin: 80,
    unlockLevel: 2,
    allowedZones: [ZoneCategory.RAIL_YARD],
    storageCapacityTons: 100,
    vehicleSlotCapacity: 2,
    vehicleSlotModal: 'RAIL',
    roofStyle: 'ARCHED_BARREL',
    facadeStyle: 'WARM_BRICK',
    primaryColorHex: 0x9a4432,
    secondaryColorHex: 0x334155,
    accentColorHex: 0xeab308,
    hasLoadingBays: true,
  },
  {
    id: 'bld-rail-cargo-transfer-shed',
    name: 'Intermodal Rail Freight Transfer Shed',
    category: 'RAILWAY',
    description: 'Trackside freight transshipment terminal with container gantry and covered platform.',
    widthCells: 3,
    depthCells: 6,
    heightMeters: 4.6,
    price: 28000,
    operatingCostPerMin: 85,
    unlockLevel: 2,
    allowedZones: [ZoneCategory.RAIL_YARD],
    storageCapacityTons: 350,
    vehicleSlotCapacity: 1,
    vehicleSlotModal: 'RAIL',
    producesCargo: 'Intermodal Containers',
    demandsCargo: 'Packaged Freight',
    roofStyle: 'CLERESTORY_SHED',
    facadeStyle: 'CORRUGATED_STEEL',
    primaryColorHex: 0x475569,
    secondaryColorHex: 0x1e293b,
    accentColorHex: 0x38bdf8,
    hasLoadingBays: true,
  },
  {
    id: 'bld-rail-control-tower',
    name: 'Rail Yard Signalling & Control Centre',
    category: 'RAILWAY',
    description: 'Elevated interlocking signal box coordinating multi-line rail dispatches.',
    widthCells: 2,
    depthCells: 3,
    heightMeters: 6.5,
    price: 16000,
    operatingCostPerMin: 45,
    unlockLevel: 3,
    allowedZones: [ZoneCategory.RAIL_YARD],
    storageCapacityTons: 40,
    vehicleSlotCapacity: 1,
    vehicleSlotModal: 'RAIL',
    roofStyle: 'MODERN_CANTILEVER',
    facadeStyle: 'ARCHITECTURAL_CONCRETE',
    primaryColorHex: 0xcbd5e1,
    secondaryColorHex: 0x334155,
    accentColorHex: 0xfbbf24,
    hasLoadingBays: false,
  },

  // =========================================================================
  // F. AIRPORT BUILDINGS (Strict Airport Reserved Zone)
  // =========================================================================
  {
    id: 'bld-air-regional-hangar',
    name: 'Regional Aircraft Maintenance Hangar',
    category: 'AIRPORT',
    description: 'Dedicated aircraft storage and maintenance hangar ($5,000,000 fixed price) storing 1 player-owned cargo aircraft.',
    widthCells: 5,
    depthCells: 4,
    heightMeters: 6.2,
    price: 5000000,
    operatingCostPerMin: 120,
    unlockLevel: 1,
    allowedZones: [ZoneCategory.AIRPORT_RESERVED],
    storageCapacityTons: 120,
    vehicleSlotCapacity: 1,
    vehicleSlotModal: 'AIR',
    roofStyle: 'ARCHED_BARREL',
    facadeStyle: 'CORRUGATED_STEEL',
    primaryColorHex: 0xe2e8f0,
    secondaryColorHex: 0x0284c7,
    accentColorHex: 0xef4444,
    hasLoadingBays: true,
  },
  {
    id: 'bld-air-cargo-terminal',
    name: 'Air Freight Logistics Terminal',
    category: 'AIRPORT',
    description: 'High-speed air cargo sorting complex with apron loader docks and customs clearance.',
    widthCells: 6,
    depthCells: 4,
    heightMeters: 5.8,
    price: 52000,
    operatingCostPerMin: 160,
    unlockLevel: 5,
    allowedZones: [ZoneCategory.AIRPORT_RESERVED],
    storageCapacityTons: 420,
    vehicleSlotCapacity: 2,
    vehicleSlotModal: 'AIR',
    producesCargo: 'Air Express Electronics',
    demandsCargo: 'Machinery & Parts',
    roofStyle: 'MODERN_CANTILEVER',
    facadeStyle: 'CURTAIN_GLASS_BLUE',
    primaryColorHex: 0xf1f5f9,
    secondaryColorHex: 0x0369a1,
    accentColorHex: 0x38bdf8,
    hasLoadingBays: true,
  },

  // =========================================================================
  // G. HARBOUR BUILDINGS (Strict Port Reserved Zone)
  // =========================================================================
  {
    id: 'bld-port-container-warehouse',
    name: 'Quayside Maritime Container Shed',
    category: 'HARBOUR',
    description: 'Heavy-duty port transit warehouse storing maritime containers and bulk cargo.',
    widthCells: 4,
    depthCells: 3,
    heightMeters: 4.8,
    price: 26000,
    operatingCostPerMin: 85,
    unlockLevel: 3,
    allowedZones: [ZoneCategory.PORT_RESERVED, ZoneCategory.INDUSTRIAL],
    storageCapacityTons: 380,
    vehicleSlotCapacity: 2,
    vehicleSlotModal: 'WATER',
    producesCargo: 'Intermodal Containers',
    demandsCargo: 'Refined Fuel',
    roofStyle: 'CLERESTORY_SHED',
    facadeStyle: 'MARITIME_TEAL_STEEL',
    primaryColorHex: 0x0369a1,
    secondaryColorHex: 0x1e293b,
    accentColorHex: 0xfbbf24,
    hasLoadingBays: true,
  },
  {
    id: 'bld-port-bulk-terminal',
    name: 'Deepwater Bulk & Tanker Terminal',
    category: 'HARBOUR',
    description: 'Coastal bulk silos and pipeline manifold adding 2 additional deepwater ship berths.',
    widthCells: 5,
    depthCells: 3,
    heightMeters: 6.0,
    price: 44000,
    operatingCostPerMin: 140,
    unlockLevel: 4,
    allowedZones: [ZoneCategory.PORT_RESERVED],
    storageCapacityTons: 550,
    vehicleSlotCapacity: 2,
    vehicleSlotModal: 'WATER',
    producesCargo: 'Crude Oil',
    roofStyle: 'FLAT_MEMBRANE_HVAC',
    facadeStyle: 'MARITIME_TEAL_STEEL',
    primaryColorHex: 0x0f766e,
    secondaryColorHex: 0x334155,
    accentColorHex: 0xf59e0b,
    hasLoadingBays: true,
  },

  // =========================================================================
  // H. SUPPORTING INFRASTRUCTURE
  // =========================================================================
  {
    id: 'bld-inf-service-station',
    name: 'Highway & Fleet Service Centre',
    category: 'INFRASTRUCTURE',
    description: 'Commercial truck refueling canopy, weighbridge, and roadside maintenance bay.',
    widthCells: 3,
    depthCells: 3,
    heightMeters: 3.8,
    price: 9500,
    operatingCostPerMin: 25,
    unlockLevel: 1,
    allowedZones: [ZoneCategory.LOGISTICS, ZoneCategory.INDUSTRIAL, ZoneCategory.CITY, ZoneCategory.OPEN_LAND],
    storageCapacityTons: 50,
    vehicleSlotCapacity: 0,
    roofStyle: 'MODERN_CANTILEVER',
    facadeStyle: 'ARCHITECTURAL_CONCRETE',
    primaryColorHex: 0xf8fafc,
    secondaryColorHex: 0x0284c7,
    accentColorHex: 0xfbbf24,
    hasLoadingBays: false,
  },
  {
    id: 'bld-inf-civic-park-plaza',
    name: 'Landscaped Urban Park & Transit Plaza',
    category: 'INFRASTRUCTURE',
    description: 'Green urban park with paved walkways, benches, ornamental trees, and fountain.',
    widthCells: 3,
    depthCells: 3,
    heightMeters: 1.5,
    price: 5000,
    operatingCostPerMin: 10,
    unlockLevel: 1,
    allowedZones: [ZoneCategory.CITY, ZoneCategory.COMMERCIAL_SUPPORT, ZoneCategory.OPEN_LAND],
    storageCapacityTons: 0,
    vehicleSlotCapacity: 0,
    roofStyle: 'FLAT_MEMBRANE_HVAC',
    facadeStyle: 'LIMESTONE_PLASTER',
    primaryColorHex: 0x4d7c4d,
    secondaryColorHex: 0xcbd5e1,
    accentColorHex: 0x38bdf8,
    hasLoadingBays: false,
  },
];

export const VEHICLE_CATALOGUE: VehicleCatalogueItem[] = [
  // =========================================================================
  // 1. ROAD TRANSPORT VEHICLES (All strictly cruising at ~25 km/h!)
  // =========================================================================
  {
    id: 'veh-road-sprinter-van',
    name: 'BlueLine Mini Cargo Truck',
    modal: 'ROAD',
    subClass: 'Mini Cargo Box Truck',
    description: 'Compact non-articulated commercial mini box truck with blue cab and enclosed rear cargo body.',
    price: 6500,
    unlockLevel: 1,
    capacityTons: 12,
    cruisingSpeedKmh: 25,
    operatingCostPerKm: 8,
    maintenanceCostEvery5Days: 450,
    isArticulated: false,
    trailerStyle: 'BOX_VAN',
    lengthMeters: 2.15,
    widthMeters: 0.92,
    heightMeters: 1.05,
    wheelRadiusMeters: 0.22,
    defaultLiveryId: 'livery-atlantic-blue',
    compatibleCargo: ['Food Items', 'Industrial Items', 'Normal Packages', 'Food & Retail', 'Office Supplies', 'Packaged Freight', 'Consumer Goods'],
  },
  {
    id: 'veh-road-rigid-box-truck',
    name: 'Titan 6x2 Rigid Box Truck',
    modal: 'ROAD',
    subClass: 'Medium Rigid Freight Truck',
    description: 'Three-axle rigid box truck with rear tail-lift and high-volume enclosed cargo body.',
    price: 11500,
    unlockLevel: 1,
    capacityTons: 18,
    cruisingSpeedKmh: 25,
    operatingCostPerKm: 12,
    maintenanceCostEvery5Days: 750,
    isArticulated: false,
    trailerStyle: 'BOX_VAN',
    lengthMeters: 3.1,
    widthMeters: 1.05,
    heightMeters: 1.25,
    wheelRadiusMeters: 0.25,
    defaultLiveryId: 'livery-amber-express',
    compatibleCargo: ['Packaged Freight', 'Consumer Goods', 'Food & Retail', 'Office Supplies'],
  },
  {
    id: 'veh-road-semi-enclosed',
    name: 'Apex 8x4 Tractor + Enclosed Dry-Van Trailer',
    modal: 'ROAD',
    subClass: 'Articulated Tractor-Trailer',
    description: 'Heavy highway tractor coupled to an articulated 53ft enclosed dry-van freight trailer.',
    price: 19500,
    unlockLevel: 2,
    capacityTons: 34,
    cruisingSpeedKmh: 25,
    operatingCostPerKm: 18,
    maintenanceCostEvery5Days: 1200,
    isArticulated: true,
    trailerStyle: 'ENCLOSED_TRAILER',
    lengthMeters: 4.6,
    widthMeters: 1.12,
    heightMeters: 1.4,
    wheelRadiusMeters: 0.27,
    defaultLiveryId: 'livery-atlantic-blue',
    compatibleCargo: ['Packaged Freight', 'Consumer Goods', 'Machinery & Parts', 'Electronics'],
  },
  {
    id: 'veh-road-semi-container',
    name: 'Globetrotter Tractor + Intermodal Container Chassis',
    modal: 'ROAD',
    subClass: 'Intermodal Container Haulage',
    description: 'Heavy-duty port & rail drayage tractor pulling a ribbed 40ft ISO shipping container.',
    price: 22000,
    unlockLevel: 2,
    capacityTons: 38,
    cruisingSpeedKmh: 25,
    operatingCostPerKm: 20,
    maintenanceCostEvery5Days: 1350,
    isArticulated: true,
    trailerStyle: 'CONTAINER_TRAILER',
    lengthMeters: 4.7,
    widthMeters: 1.12,
    heightMeters: 1.42,
    wheelRadiusMeters: 0.27,
    defaultLiveryId: 'livery-crimson-cargo',
    compatibleCargo: ['Intermodal Containers', 'Packaged Freight', 'Machinery & Parts'],
  },
  {
    id: 'veh-road-semi-reefer',
    name: 'CryoHaul Tractor + Refrigerated Reefer Trailer',
    modal: 'ROAD',
    subClass: 'Temperature-Controlled Logistics',
    description: 'Articulated tractor-trailer with nose-mounted refrigeration unit for cold-chain cargo.',
    price: 25500,
    unlockLevel: 3,
    capacityTons: 36,
    cruisingSpeedKmh: 25,
    operatingCostPerKm: 22,
    maintenanceCostEvery5Days: 1500,
    isArticulated: true,
    trailerStyle: 'REFRIGERATED_TRAILER',
    lengthMeters: 4.7,
    widthMeters: 1.12,
    heightMeters: 1.42,
    wheelRadiusMeters: 0.27,
    defaultLiveryId: 'livery-emerald-line',
    compatibleCargo: ['Refrigerated Food', 'Food & Retail', 'Pharmaceuticals'],
  },
  {
    id: 'veh-road-semi-flatbed',
    name: 'Ironclad Tractor + Heavy Flatbed Steel Trailer',
    modal: 'ROAD',
    subClass: 'Industrial Flatbed Haulage',
    description: 'Open flatbed semi-trailer carrying strapped steel coils, timber, and heavy machinery.',
    price: 24000,
    unlockLevel: 3,
    capacityTons: 42,
    cruisingSpeedKmh: 25,
    operatingCostPerKm: 21,
    maintenanceCostEvery5Days: 1450,
    isArticulated: true,
    trailerStyle: 'FLATBED_TRAILER',
    lengthMeters: 4.7,
    widthMeters: 1.14,
    heightMeters: 1.32,
    wheelRadiusMeters: 0.27,
    defaultLiveryId: 'livery-amber-express',
    compatibleCargo: ['Steel Coils', 'Machinery & Parts', 'Raw Materials'],
  },
  {
    id: 'veh-road-semi-tanker',
    name: 'PetroStar Tractor + Cylindrical Fuel Tanker',
    modal: 'ROAD',
    subClass: 'Hazardous Liquid Tanker',
    description: 'Polished stainless-steel cylindrical tanker trailer with catwalk and safety valving.',
    price: 28500,
    unlockLevel: 4,
    capacityTons: 45,
    cruisingSpeedKmh: 25,
    operatingCostPerKm: 25,
    maintenanceCostEvery5Days: 1700,
    isArticulated: true,
    trailerStyle: 'TANKER_TRAILER',
    lengthMeters: 4.75,
    widthMeters: 1.14,
    heightMeters: 1.38,
    wheelRadiusMeters: 0.27,
    defaultLiveryId: 'livery-titanium-corp',
    compatibleCargo: ['Refined Fuel', 'Crude Oil', 'Industrial Chemicals'],
  },

  // =========================================================================
  // 2. RAIL TRANSPORT VEHICLES
  // =========================================================================
  {
    id: 'veh-rail-diesel-freight',
    name: 'Vectron DE-4000 Freight Locomotive + 3 Container Wagons',
    modal: 'RAIL',
    subClass: 'Mainline Freight Train',
    description: 'Heavy diesel-electric locomotive hauling 3 articulated intermodal container well wagons.',
    price: 42000,
    unlockLevel: 2,
    capacityTons: 180,
    cruisingSpeedKmh: 45,
    operatingCostPerKm: 35,
    maintenanceCostEvery5Days: 2800,
    isArticulated: true,
    trailerStyle: 'CONTAINER_TRAILER',
    wagonCount: 3,
    lengthMeters: 12.0,
    widthMeters: 1.35,
    heightMeters: 1.65,
    wheelRadiusMeters: 0.28,
    defaultLiveryId: 'livery-amber-express',
    compatibleCargo: ['Intermodal Containers', 'Packaged Freight', 'Steel Coils', 'Raw Materials'],
  },
  {
    id: 'veh-rail-heavy-tanker-consist',
    name: 'Hercules Dual-Cab Locomotive + 4 Tank & Hopper Wagons',
    modal: 'RAIL',
    subClass: 'Heavy Industrial Unit Train',
    description: 'High-tractive-effort freight locomotive pulling cylindrical tank wagons and bulk hoppers.',
    price: 64000,
    unlockLevel: 4,
    capacityTons: 290,
    cruisingSpeedKmh: 48,
    operatingCostPerKm: 48,
    maintenanceCostEvery5Days: 3900,
    isArticulated: true,
    trailerStyle: 'TANKER_TRAILER',
    wagonCount: 4,
    lengthMeters: 15.0,
    widthMeters: 1.38,
    heightMeters: 1.7,
    wheelRadiusMeters: 0.28,
    defaultLiveryId: 'livery-crimson-cargo',
    compatibleCargo: ['Refined Fuel', 'Crude Oil', 'Raw Materials', 'Steel Coils'],
  },

  // =========================================================================
  // 3. AIR TRANSPORT VEHICLES (Part 2: 0 to 2 Max Owned Aircraft — Lv.10 $20M & Lv.15 $30M)
  // =========================================================================
  {
    id: 'veh-air-turboprop-freighter',
    name: 'AeroSwift ATR-72F Regional Cargo Turboprop',
    modal: 'AIR',
    subClass: 'Regional Cargo Aircraft (Slot #1 — Unlocks at Airport Level 10)',
    description: 'First player-owned cargo freighter ($20,000,000; requires Airport Level 10 and an available purchased Aircraft Hangar). Stored in hangar when idle.',
    price: 20000000,
    unlockLevel: 1,
    capacityTons: 65,
    cruisingSpeedKmh: 85,
    operatingCostPerKm: 55,
    maintenanceCostEvery5Days: 4200,
    isArticulated: false,
    trailerStyle: 'NONE',
    lengthMeters: 6.4,
    widthMeters: 6.8,
    heightMeters: 1.9,
    wheelRadiusMeters: 0.2,
    defaultLiveryId: 'livery-atlantic-blue',
    compatibleCargo: ['Air Express Electronics', 'Machinery & Parts', 'Consumer Goods'],
  },
  {
    id: 'veh-air-widebody-jet',
    name: 'Stratoliner 777F Heavy Cargo Jet',
    modal: 'AIR',
    subClass: 'Widebody Intercontinental Freighter (Slot #2 — Unlocks at Airport Level 15)',
    description: 'Second player-owned heavy cargo aircraft ($30,000,000; requires Airport Level 15, 1st owned aircraft, and 2nd purchased Aircraft Hangar). Stored in hangar when idle.',
    price: 30000000,
    unlockLevel: 1,
    capacityTons: 140,
    cruisingSpeedKmh: 110,
    operatingCostPerKm: 85,
    maintenanceCostEvery5Days: 6800,
    isArticulated: false,
    trailerStyle: 'NONE',
    lengthMeters: 8.2,
    widthMeters: 8.6,
    heightMeters: 2.4,
    wheelRadiusMeters: 0.24,
    defaultLiveryId: 'livery-titanium-corp',
    compatibleCargo: ['Air Express Electronics', 'Electronics', 'Machinery & Parts', 'Consumer Goods'],
  },

  // =========================================================================
  // 4. WATER / MARITIME TRANSPORT VEHICLES
  // =========================================================================
  {
    id: 'veh-water-coastal-feeder',
    name: 'MV Seafarer Coastal Container Feeder',
    modal: 'WATER',
    subClass: 'Coastal Cargo Vessel',
    description: 'Geared coastal freight vessel with bow bulb, deck container stacks, and aft superstructure.',
    price: 38000,
    unlockLevel: 3,
    capacityTons: 220,
    cruisingSpeedKmh: 32,
    operatingCostPerKm: 30,
    maintenanceCostEvery5Days: 2600,
    isArticulated: false,
    trailerStyle: 'CONTAINER_TRAILER',
    lengthMeters: 8.5,
    widthMeters: 2.3,
    heightMeters: 2.8,
    wheelRadiusMeters: 0.1,
    defaultLiveryId: 'livery-atlantic-blue',
    compatibleCargo: ['Intermodal Containers', 'Packaged Freight', 'Raw Materials'],
  },
  {
    id: 'veh-water-panamax-ship',
    name: 'MV Sovereign Star Panamax Container & Bulk Ship',
    modal: 'WATER',
    subClass: 'Deepwater Container & Bulk Vessel',
    description: 'High-capacity deepwater merchant ship with multi-tier colorful container bays and bridge tower.',
    price: 76000,
    unlockLevel: 4,
    capacityTons: 460,
    cruisingSpeedKmh: 36,
    operatingCostPerKm: 52,
    maintenanceCostEvery5Days: 4900,
    isArticulated: false,
    trailerStyle: 'CONTAINER_TRAILER',
    lengthMeters: 11.5,
    widthMeters: 2.9,
    heightMeters: 3.4,
    wheelRadiusMeters: 0.1,
    defaultLiveryId: 'livery-crimson-cargo',
    compatibleCargo: ['Intermodal Containers', 'Crude Oil', 'Refined Fuel', 'Steel Coils'],
  },
];

export function getBuildingSpecById(id: string): BuildingCatalogueItem | undefined {
  return BUILDING_CATALOGUE.find((b) => b.id === id);
}

export function getVehicleSpecById(id: string): VehicleCatalogueItem | undefined {
  return VEHICLE_CATALOGUE.find((v) => v.id === id);
}

export function getLiveryById(id: string): VehicleLiverySpec {
  return FLEET_LIVERIES.find((l) => l.id === id) ?? FLEET_LIVERIES[0];
}

export function getXpRequiredForLevel(level: number): number {
  const clamped = Math.max(1, Math.floor(level));
  const explicit = LEVEL_PROGRESSION_TABLE.find((s) => s.level === clamped);
  if (explicit) return explicit.xpRequired;
  if (clamped <= 6) {
    return LEVEL_PROGRESSION_TABLE[clamped - 1]?.xpRequired ?? 0;
  }
  if (clamped < 100) {
    // Smooth progression between Level 6 (3,500 XP) and Level 100 (250,000 XP)
    const t = (clamped - 6) / (100 - 6);
    return Math.round(3500 + t * (250000 - 3500));
  }
  // Above Level 100
  return 250000 + (clamped - 100) * 5000;
}

export function getLevelInfoForXp(xp: number): {
  level: number;
  title: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progressRatio: number;
} {
  // Check explicit tiers 1..6 first so early game progression is 100% preserved
  if (xp < 3500) {
    let currentSpec = LEVEL_PROGRESSION_TABLE[0];
    let nextSpec = LEVEL_PROGRESSION_TABLE[1];
    for (let i = 0; i < 6; i++) {
      if (xp >= LEVEL_PROGRESSION_TABLE[i].xpRequired) {
        currentSpec = LEVEL_PROGRESSION_TABLE[i];
        nextSpec = LEVEL_PROGRESSION_TABLE[i + 1];
      } else {
        break;
      }
    }
    const span = Math.max(1, nextSpec.xpRequired - currentSpec.xpRequired);
    const earnedInTier = Math.max(0, xp - currentSpec.xpRequired);
    return {
      level: currentSpec.level,
      title: currentSpec.title,
      currentLevelXp: currentSpec.xpRequired,
      nextLevelXp: nextSpec.xpRequired,
      progressRatio: Math.min(1, earnedInTier / span),
    };
  }

  // Levels 6..120+
  let lvl = 6;
  while (lvl < 200 && xp >= getXpRequiredForLevel(lvl + 1)) {
    lvl++;
  }
  const currentLevelXp = getXpRequiredForLevel(lvl);
  const nextLevelXp = getXpRequiredForLevel(lvl + 1);
  const span = Math.max(1, nextLevelXp - currentLevelXp);
  const progressRatio = Math.min(1, Math.max(0, (xp - currentLevelXp) / span));
  const title =
    lvl >= 100
      ? 'Global Aviation & Air Cargo Sovereign'
      : 'Supreme Logistics Emperor';

  return {
    level: lvl,
    title,
    currentLevelXp,
    nextLevelXp,
    progressRatio,
  };
}

/**
 * Authoritative 10x20 Delivery Headquarters (HQ) Spatial Layout, Y-Axis Layering & Architectural Specification.
 */
export const DELIVERY_HQ_FOOTPRINT_SPEC = {
  id: 'building-city-hq-tower',
  catalogueId: 'bld-com-financial-tower',
  name: 'Delivery Headquarters',
  gx: 70,
  gz: 34,
  widthCells: 10,
  depthCells: 20,
  totalCells: 200,
  widthMeters: 20,
  depthMeters: 40,
  maxLevel: 10,
  elevationLayers: {
    baseTerrainGrass: 0.0,
    landscapedLawnBeds: 0.02,
    pavedStonePlazaAndSidewalks: 0.03,
    buildingFoundationPlinth: 0.04,
  },
  architecture: {
    layoutStyle: 'L_SHAPED_STEPPED_CORPORATE_TOWER',
    mainBlockStories: 5,
    sideWingStories: 2,
    hasCircularHelipad: true,
    hasCircularHelipadH: true,
    hasAntennaSpire: true,
    hasSolarPanelArrays: true,
    hasGreenRooftopPlanters: true,
    hasRooftopGardenPlanters: true,
    hasEntrancePortico: true,
    hasConcreteEntrancePortico: true,
    brandingSignage: 'CTH / GTE',
    hasBoxwoodHedgeLawns: true,
    hasPlazaBenchesAndStreetlamps: true,
    zeroLooseCrates: true,
    usesInstancedMeshes: true,
    usesInstancedWindowFramesAndFoliage: true,
  },
} as const;


