/**
 * Authoritative Land Parcel and Buildability System.
 * Supports grid-aligned land parcels, buildability status, ownership, and
 * level-based Railway Yard progressive expansion tiles.
 */

import { TerrainCategory, WaterClassification, WorldConfigData, ZoneCategory } from './WorldConfig';

export type ParcelBuildabilityStatus =
  | 'OWNED_BUILDABLE'
  | 'AVAILABLE_FOR_PURCHASE'
  | 'OCCUPIED_INFRASTRUCTURE'
  | 'RESERVED_INFRASTRUCTURE'
  | 'UNSUITABLE_TERRAIN'
  | 'OCCUPIED_WATER'
  | 'RESTRICTED_ZONING';

export interface LandParcel {
  id: string;
  name: string;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  widthCells: number;
  depthCells: number;
  terrainClassification: TerrainCategory;
  districtId: string;
  zoneCategory: ZoneCategory;
  buildability: ParcelBuildabilityStatus;
  owned: boolean;
  reserved: boolean;
  unlockLevel: number;
  price: number;
  restrictions: string[];
}

export class ParcelSystem {
  private config: WorldConfigData;
  private parcels: Map<string, LandParcel> = new Map();
  private getWaterAtFn: (gx: number, gz: number) => WaterClassification = () =>
    WaterClassification.NONE;
  private getTerrainAtFn: (gx: number, gz: number) => TerrainCategory = () =>
    TerrainCategory.GRASS;
  private getZoneAtFn: (gx: number, gz: number) => ZoneCategory = () =>
    ZoneCategory.OPEN_LAND;

  constructor(config: WorldConfigData) {
    this.config = config;
  }

  public initializeParcels(
    getWaterAt: (gx: number, gz: number) => WaterClassification,
    getTerrainAt: (gx: number, gz: number) => TerrainCategory,
    getZoneAt: (gx: number, gz: number) => ZoneCategory
  ): void {
    this.getWaterAtFn = getWaterAt;
    this.getTerrainAtFn = getTerrainAt;
    this.getZoneAtFn = getZoneAt;
    this.parcels.clear();

    const rc = this.config.railCorridor;
    const cc = this.config.coreCity;
    const pt = this.config.port;
    const ap = this.config.airport;

    // 1. Dedicated Railway Yard Tiles (Starter + Progressive Level-Based Expansion Tiles)
    const railTiles: Array<{
      id: string;
      name: string;
      minGz: number;
      maxGz: number;
      owned: boolean;
      unlockLevel: number;
      price: number;
    }> = [
      {
        id: 'parcel-rail-yard-starter',
        name: 'Starter Rail Yard Sector',
        minGz: 38,
        maxGz: 72,
        owned: true,
        unlockLevel: 1,
        price: 0,
      },
      {
        id: 'parcel-rail-yard-north-exp-1',
        name: 'North Rail Yard Expansion Tile I',
        minGz: 24,
        maxGz: 37,
        owned: false,
        unlockLevel: 2,
        price: 15000,
      },
      {
        id: 'parcel-rail-yard-north-exp-2',
        name: 'North Rail Yard Expansion Tile II',
        minGz: 12,
        maxGz: 23,
        owned: false,
        unlockLevel: 3,
        price: 25000,
      },
      {
        id: 'parcel-rail-yard-south-exp-1',
        name: 'South Rail Yard Expansion Tile I',
        minGz: 73,
        maxGz: 92,
        owned: false,
        unlockLevel: 4,
        price: 30000,
      },
    ];

    for (const rt of railTiles) {
      this.parcels.set(rt.id, {
        id: rt.id,
        name: rt.name,
        minGx: rc.startX,
        maxGx: rc.endX,
        minGz: rt.minGz,
        maxGz: rt.maxGz,
        widthCells: rc.endX - rc.startX + 1,
        depthCells: rt.maxGz - rt.minGz + 1,
        terrainClassification: TerrainCategory.GRAVEL,
        districtId: 'district-rail-yard',
        zoneCategory: ZoneCategory.RAIL_YARD,
        buildability: rt.owned ? 'OWNED_BUILDABLE' : 'AVAILABLE_FOR_PURCHASE',
        owned: rt.owned,
        reserved: true,
        unlockLevel: rt.unlockLevel,
        price: rt.price,
        restrictions: ['RAILWAY_INFRASTRUCTURE_ONLY', 'NO_CITY_BUILDINGS'],
      });
    }

    // 2. Core City Parcels
    this.parcels.set('parcel-city-central', {
      id: 'parcel-city-central',
      name: 'Central Metro Core Parcel',
      minGx: cc.startX,
      maxGx: cc.endX,
      minGz: cc.startZ,
      maxGz: cc.endZ,
      widthCells: cc.endX - cc.startX + 1,
      depthCells: cc.endZ - cc.startZ + 1,
      terrainClassification: TerrainCategory.URBAN_GROUND,
      districtId: 'district-core-city',
      zoneCategory: ZoneCategory.CITY,
      buildability: 'OWNED_BUILDABLE',
      owned: true,
      reserved: false,
      unlockLevel: 1,
      price: 0,
      restrictions: ['NO_RAIL_YARDS'],
    });

    // 3. Logistics & Industrial Parcels
    this.parcels.set('parcel-logistics-hub', {
      id: 'parcel-logistics-hub',
      name: 'Western Logistics & Depot Hub',
      minGx: 38,
      maxGx: 60,
      minGz: 32,
      maxGz: 53,
      widthCells: 23,
      depthCells: 22,
      terrainClassification: TerrainCategory.INDUSTRIAL_GROUND,
      districtId: 'district-logistics-west',
      zoneCategory: ZoneCategory.LOGISTICS,
      buildability: 'OWNED_BUILDABLE',
      owned: true,
      reserved: false,
      unlockLevel: 1,
      price: 0,
      restrictions: ['LOGISTICS_AND_ROADS'],
    });

    this.parcels.set('parcel-industrial-basin', {
      id: 'parcel-industrial-basin',
      name: 'Southern Industrial Basin',
      minGx: 44,
      maxGx: 60,
      minGz: 56,
      maxGz: 66,
      widthCells: 17,
      depthCells: 11,
      terrainClassification: TerrainCategory.INDUSTRIAL_GROUND,
      districtId: 'district-industrial-south',
      zoneCategory: ZoneCategory.INDUSTRIAL,
      buildability: 'AVAILABLE_FOR_PURCHASE',
      owned: false,
      reserved: false,
      unlockLevel: 2,
      price: 18000,
      restrictions: ['INDUSTRIAL_AND_ROADS'],
    });

    this.parcels.set('parcel-warehouse-1-reserve', {
      id: 'parcel-warehouse-1-reserve',
      name: 'Warehouse 1 Reserved Expansion Property (25x30)',
      minGx: 35,
      maxGx: 59,
      minGz: 67,
      maxGz: 96,
      widthCells: 25,
      depthCells: 30,
      terrainClassification: TerrainCategory.INDUSTRIAL_GROUND,
      districtId: 'district-warehouse-1',
      zoneCategory: ZoneCategory.LOGISTICS,
      buildability: 'OWNED_BUILDABLE',
      owned: true,
      reserved: true,
      unlockLevel: 1,
      price: 0,
      restrictions: ['WAREHOUSE_1_EXPANSION_RESERVE'],
    });

    // 4. Airport (50x70), Separate Airport Warehouse (10x10), Separate Transfer Yard (10x10) & Port Reserved Parcels
    this.parcels.set('parcel-airport-reserve', {
      id: 'parcel-airport-reserve',
      name: 'Regional Air Cargo Hub — Unlocks at XP Level 100',
      minGx: ap.startX,
      maxGx: ap.endX,
      minGz: ap.startZ,
      maxGz: ap.endZ,
      widthCells: ap.endX - ap.startX + 1,
      depthCells: ap.endZ - ap.startZ + 1,
      terrainClassification: TerrainCategory.GRASS,
      districtId: 'district-airport-reserve',
      zoneCategory: ZoneCategory.AIRPORT_RESERVED,
      buildability: 'RESERVED_INFRASTRUCTURE',
      owned: false,
      reserved: true,
      unlockLevel: 100,
      price: 15_000_000,
      restrictions: ['AIRPORT_ONLY', 'NO_ORDINARY_ROADS_OR_BUILDINGS'],
    });

    const aw = this.config.airportWarehouse;
    this.parcels.set('parcel-airport-warehouse-reserve', {
      id: 'parcel-airport-warehouse-reserve',
      name: 'Airport Cargo Warehouse (Reserved 10×10)',
      minGx: aw.startX,
      maxGx: aw.endX,
      minGz: aw.startZ,
      maxGz: aw.endZ,
      widthCells: aw.endX - aw.startX + 1,
      depthCells: aw.endZ - aw.startZ + 1,
      terrainClassification: TerrainCategory.INDUSTRIAL_GROUND,
      districtId: 'district-airport-warehouse-reserve',
      zoneCategory: ZoneCategory.AIRPORT_RESERVED,
      buildability: 'RESERVED_INFRASTRUCTURE',
      owned: false,
      reserved: true,
      unlockLevel: 100,
      price: 0,
      restrictions: ['AIRPORT_WAREHOUSE_ONLY'],
    });

    const at = this.config.airportTransferYard;
    this.parcels.set('parcel-airport-transfer-yard-reserve', {
      id: 'parcel-airport-transfer-yard-reserve',
      name: 'Airport Cargo Transfer Yard (Reserved 10×10)',
      minGx: at.startX,
      maxGx: at.endX,
      minGz: at.startZ,
      maxGz: at.endZ,
      widthCells: at.endX - at.startX + 1,
      depthCells: at.endZ - at.startZ + 1,
      terrainClassification: TerrainCategory.INDUSTRIAL_GROUND,
      districtId: 'district-airport-transfer-yard-reserve',
      zoneCategory: ZoneCategory.AIRPORT_RESERVED,
      buildability: 'RESERVED_INFRASTRUCTURE',
      owned: false,
      reserved: true,
      unlockLevel: 100,
      price: 0,
      restrictions: ['AIRPORT_TRANSFER_YARD_ONLY'],
    });

    this.parcels.set('parcel-port-harbour', {
      id: 'parcel-port-harbour',
      name: 'Southern Coastal Harbour Parcel',
      minGx: pt.startX,
      maxGx: pt.endX,
      minGz: pt.startZ,
      maxGz: pt.endZ,
      widthCells: pt.endX - pt.startX + 1,
      depthCells: pt.endZ - pt.startZ + 1,
      terrainClassification: TerrainCategory.COASTAL_SAND,
      districtId: 'district-port-harbour',
      zoneCategory: ZoneCategory.PORT_RESERVED,
      buildability: 'OWNED_BUILDABLE',
      owned: true,
      reserved: true,
      unlockLevel: 1,
      price: 0,
      restrictions: ['PORT_AND_HARBOUR_ACCESS'],
    });

    // 4b. Additional Named Purchasable Regional Development Parcels (Master Prompt 6 & 20M-Block Open World)
    const hwStartX = this.config.highway.startX;
    const eastArterialMaxGx = Math.max(118, hwStartX - 3);
    const extraDevelopmentParcels: LandParcel[] = [
      {
        id: 'parcel-city-north-highland',
        name: 'Northern Highland City Expansion Plot',
        minGx: 70,
        maxGx: 102,
        minGz: 14,
        maxGz: 30,
        widthCells: 33,
        depthCells: 17,
        terrainClassification: TerrainCategory.GRASS,
        districtId: 'district-future-expansion-north',
        zoneCategory: ZoneCategory.FUTURE_EXPANSION,
        buildability: 'AVAILABLE_FOR_PURCHASE',
        owned: false,
        reserved: false,
        unlockLevel: 1,
        price: 14000,
        restrictions: ['CITY_AND_COMMERCIAL_EXPANSION'],
      },
      {
        id: 'parcel-midtown-commercial-south',
        name: 'Midtown Waterfront Commercial Corridor',
        minGx: 72,
        maxGx: 102,
        minGz: 76,
        maxGz: 86,
        widthCells: 31,
        depthCells: 11,
        terrainClassification: TerrainCategory.URBAN_GROUND,
        districtId: 'district-commercial-support',
        zoneCategory: ZoneCategory.COMMERCIAL_SUPPORT,
        buildability: 'AVAILABLE_FOR_PURCHASE',
        owned: false,
        reserved: false,
        unlockLevel: 2,
        price: 16500,
        restrictions: ['COMMERCIAL_AND_RESIDENTIAL'],
      },
      {
        id: 'parcel-east-arterial-logistics',
        name: 'East Motorway Approach Logistics Park',
        minGx: 106,
        maxGx: eastArterialMaxGx,
        minGz: 42,
        maxGz: 72,
        widthCells: eastArterialMaxGx - 106 + 1,
        depthCells: 31,
        terrainClassification: TerrainCategory.GRASS,
        districtId: 'district-regional',
        zoneCategory: ZoneCategory.OPEN_LAND,
        buildability: 'AVAILABLE_FOR_PURCHASE',
        owned: false,
        reserved: false,
        unlockLevel: 3,
        price: 24000,
        restrictions: ['LOGISTICS_AND_INDUSTRIAL_PARK'],
      },
      {
        id: 'parcel-island-haven-dev',
        name: 'Haven Island Coastal Development Charter',
        minGx: 32,
        maxGx: 44,
        minGz: 106,
        maxGz: 113,
        widthCells: 13,
        depthCells: 8,
        terrainClassification: TerrainCategory.GRASS,
        districtId: 'district-regional',
        zoneCategory: ZoneCategory.OPEN_LAND,
        buildability: 'AVAILABLE_FOR_PURCHASE',
        owned: false,
        reserved: false,
        unlockLevel: 4,
        price: 28000,
        restrictions: ['ISLAND_MARITIME_DEVELOPMENT'],
      },
      {
        id: 'parcel-silverpine-valley-hub',
        name: 'Silverpine Valley Logistics & Commercial Charter',
        minGx: 204,
        maxGx: 240,
        minGz: 62,
        maxGz: 104,
        widthCells: 37,
        depthCells: 43,
        terrainClassification: TerrainCategory.GRASS,
        districtId: 'district-eastern-valley-countryside',
        zoneCategory: ZoneCategory.FUTURE_EXPANSION,
        buildability: 'AVAILABLE_FOR_PURCHASE',
        owned: false,
        reserved: false,
        unlockLevel: 3,
        price: 32000,
        restrictions: ['REGIONAL_EXPANSION_DEVELOPMENT'],
      },
      {
        id: 'parcel-southshore-coastal-park',
        name: 'Southshore Peninsula Expansion Plot',
        minGx: 72,
        maxGx: 132,
        minGz: 152,
        maxGz: 186,
        widthCells: 61,
        depthCells: 35,
        terrainClassification: TerrainCategory.GRASS,
        districtId: 'district-southshore-peninsula',
        zoneCategory: ZoneCategory.FUTURE_EXPANSION,
        buildability: 'AVAILABLE_FOR_PURCHASE',
        owned: false,
        reserved: false,
        unlockLevel: 4,
        price: 36000,
        restrictions: ['COASTAL_PENINSULA_DEVELOPMENT'],
      },
      // Four-Direction Cardinal Expansion Charter Parcels (North, West, East, South)
      {
        id: 'parcel-north-boreal-charter',
        name: 'Northern Boreal Timber Charter',
        minGx: 80,
        maxGx: 119,
        minGz: -50,
        maxGz: -15,
        widthCells: 40,
        depthCells: 36,
        terrainClassification: TerrainCategory.GRASS,
        districtId: 'district-north-boreal-frontier',
        zoneCategory: ZoneCategory.FUTURE_EXPANSION,
        buildability: 'AVAILABLE_FOR_PURCHASE',
        owned: false,
        reserved: false,
        unlockLevel: 3,
        price: 28000,
        restrictions: ['WOODED_FRONTIER_PARCEL'],
      },
      {
        id: 'parcel-west-timber-charter',
        name: 'Western Frontier Timber Valley Charter',
        minGx: -60,
        maxGx: -21,
        minGz: 65,
        maxGz: 104,
        widthCells: 40,
        depthCells: 40,
        terrainClassification: TerrainCategory.GRASS,
        districtId: 'district-west-timber-valley',
        zoneCategory: ZoneCategory.FUTURE_EXPANSION,
        buildability: 'AVAILABLE_FOR_PURCHASE',
        owned: false,
        reserved: false,
        unlockLevel: 3,
        price: 29000,
        restrictions: ['WOODED_FRONTIER_PARCEL'],
      },
      {
        id: 'parcel-east-highwood-charter',
        name: 'Eastern Highwood Ridge Charter',
        minGx: 365,
        maxGx: 404,
        minGz: 85,
        maxGz: 124,
        widthCells: 40,
        depthCells: 40,
        terrainClassification: TerrainCategory.GRASS,
        districtId: 'district-east-highwood-ridge',
        zoneCategory: ZoneCategory.FUTURE_EXPANSION,
        buildability: 'AVAILABLE_FOR_PURCHASE',
        owned: false,
        reserved: false,
        unlockLevel: 4,
        price: 32000,
        restrictions: ['WOODED_FRONTIER_PARCEL'],
      },
      {
        id: 'parcel-south-cape-charter',
        name: 'Southern Cape Headlands Charter',
        minGx: 310,
        maxGx: 359,
        minGz: 230,
        maxGz: 269,
        widthCells: 50,
        depthCells: 40,
        terrainClassification: TerrainCategory.GRASS,
        districtId: 'district-south-cape-headlands',
        zoneCategory: ZoneCategory.FUTURE_EXPANSION,
        buildability: 'AVAILABLE_FOR_PURCHASE',
        owned: false,
        reserved: false,
        unlockLevel: 4,
        price: 34000,
        restrictions: ['COASTAL_CAPE_DEVELOPMENT'],
      },
    ];

    for (const ep of extraDevelopmentParcels) {
      this.parcels.set(ep.id, ep);
    }

    // 5. Pre-generate 20x20 Regional Sector Parcels across the Core 520x400 region [-80..439, -80..319];
    // Outer continental parcels across [-2240..2759, -1830..2229] are synthesized on-demand in getParcelAt / acquireParcel.
    const sectorSize = 20;
    const coreMinGx = this.config.coreMinGx ?? -80;
    const coreMaxGx = this.config.coreMaxGx ?? 439;
    const coreMinGz = this.config.coreMinGz ?? -80;
    const coreMaxGz = this.config.coreMaxGz ?? 319;

    for (let gz = coreMinGz; gz <= coreMaxGz; gz += sectorSize) {
      for (let gx = coreMinGx; gx <= coreMaxGx; gx += sectorSize) {
        this.ensureSectorParcelForAnchor(gx, gz);
      }
    }
  }

  private ensureSectorParcelForAnchor(
    sectorGx: number,
    sectorGz: number
  ): LandParcel | undefined {
    const id = `parcel-sector-${sectorGx}-${sectorGz}`;
    const existing = this.parcels.get(id);
    if (existing) return existing;

    const minWorldGx = this.config.minGx ?? -2240;
    const maxWorldGx = minWorldGx + this.config.gridWidth - 1;
    const minWorldGz = this.config.minGz ?? -1830;
    const maxWorldGz = minWorldGz + this.config.gridDepth - 1;

    if (
      sectorGx < minWorldGx ||
      sectorGx > maxWorldGx ||
      sectorGz < minWorldGz ||
      sectorGz > maxWorldGz
    ) {
      return undefined;
    }

    const sectorSize = 20;
    const maxGx = Math.min(sectorGx + sectorSize - 1, maxWorldGx);
    const maxGz = Math.min(sectorGz + sectorSize - 1, maxWorldGz);
    const midGx = Math.floor((sectorGx + maxGx) * 0.5);
    const midGz = Math.floor((sectorGz + maxGz) * 0.5);

    if (this.getNamedParcelAt(midGx, midGz)) return undefined;

    const water = this.getWaterAtFn(midGx, midGz);
    const terrain = this.getTerrainAtFn(midGx, midGz);
    const zone = this.getZoneAtFn(midGx, midGz);

    let buildability: ParcelBuildabilityStatus = 'AVAILABLE_FOR_PURCHASE';
    const restrictions: string[] = [];
    if (water !== WaterClassification.NONE) {
      buildability = 'OCCUPIED_WATER';
      restrictions.push('WATER_BODY_NON_BUILDABLE');
    } else if (terrain === TerrainCategory.ROCK) {
      buildability = 'UNSUITABLE_TERRAIN';
      restrictions.push('STEEP_ROCK_TERRAIN');
    } else if (zone === ZoneCategory.HIGHWAY_RESERVED) {
      buildability = 'RESERVED_INFRASTRUCTURE';
      restrictions.push('HIGHWAY_CORRIDOR');
    }

    const parcel: LandParcel = {
      id,
      name: `Regional Parcel (${sectorGx}, ${sectorGz})`,
      minGx: sectorGx,
      maxGx,
      minGz: sectorGz,
      maxGz,
      widthCells: maxGx - sectorGx + 1,
      depthCells: maxGz - sectorGz + 1,
      terrainClassification: terrain,
      districtId: 'district-regional',
      zoneCategory: zone,
      buildability,
      owned:
        water === WaterClassification.NONE &&
        midGx >= 35 &&
        midGx <= 135 &&
        midGz >= 25 &&
        midGz <= 95,
      reserved:
        zone !== ZoneCategory.OPEN_LAND &&
        zone !== ZoneCategory.FUTURE_EXPANSION,
      unlockLevel: 1,
      price: 10000,
      restrictions,
    };

    this.parcels.set(id, parcel);
    return parcel;
  }

  private getNamedParcelAt(gx: number, gz: number): LandParcel | undefined {
    for (const p of this.parcels.values()) {
      if (p.id.startsWith('parcel-sector-')) continue;
      if (gx >= p.minGx && gx <= p.maxGx && gz >= p.minGz && gz <= p.maxGz) {
        return p;
      }
    }
    return undefined;
  }

  public getParcelAt(gx: number, gz: number): LandParcel | undefined {
    // Prefer specific named parcels first
    const named = this.getNamedParcelAt(gx, gz);
    if (named) return named;

    const sectorSize = 20;
    const sectorGx = Math.floor(gx / sectorSize) * sectorSize;
    const sectorGz = Math.floor(gz / sectorSize) * sectorSize;
    const sectorParcel = this.ensureSectorParcelForAnchor(sectorGx, sectorGz);
    if (sectorParcel) return sectorParcel;

    for (const p of this.parcels.values()) {
      if (gx >= p.minGx && gx <= p.maxGx && gz >= p.minGz && gz <= p.maxGz) {
        return p;
      }
    }
    return undefined;
  }

  public getAllParcels(): LandParcel[] {
    return Array.from(this.parcels.values());
  }

  public getRailYardParcels(): LandParcel[] {
    return this.getAllParcels().filter(
      (p) => p.zoneCategory === ZoneCategory.RAIL_YARD
    );
  }

  /**
   * Unlocks and acquires a Rail Yard or regional expansion parcel.
   */
  public acquireParcel(parcelId: string, playerLevel = 5): {
    success: boolean;
    reason?: string;
    parcel?: LandParcel;
  } {
    let parcel = this.parcels.get(parcelId);
    if (!parcel && parcelId.startsWith('parcel-sector-')) {
      const rest = parcelId.slice('parcel-sector-'.length);
      const match = /^(-?\d+)-(-?\d+)$/.exec(rest);
      if (match) {
        parcel = this.ensureSectorParcelForAnchor(
          Number(match[1]),
          Number(match[2])
        );
      }
    }
    if (!parcel) {
      return { success: false, reason: `Parcel ${parcelId} not found.` };
    }
    if (parcel.owned) {
      return { success: true, parcel };
    }
    if (playerLevel < parcel.unlockLevel) {
      return {
        success: false,
        reason: `Requires level ${parcel.unlockLevel} to unlock ${parcel.name}.`,
      };
    }
    if (parcel.buildability === 'OCCUPIED_WATER') {
      return {
        success: false,
        reason: 'Water parcels cannot be purchased for ordinary land construction.',
      };
    }

    parcel.owned = true;
    parcel.buildability = 'OWNED_BUILDABLE';
    return { success: true, parcel };
  }

  public handleWorldExpansion(
    newConfig: WorldConfigData,
    getWaterAt: (gx: number, gz: number) => WaterClassification,
    getTerrainAt: (gx: number, gz: number) => TerrainCategory,
    getZoneAt: (gx: number, gz: number) => ZoneCategory
  ): void {
    this.config = newConfig;
    this.getWaterAtFn = getWaterAt;
    this.getTerrainAtFn = getTerrainAt;
    this.getZoneAtFn = getZoneAt;
  }
}

