/**
 * District and Zoning System for Global Transport Empire.
 * Enforces strict zoning rules between CITY, RAIL_YARD, LOGISTICS, INDUSTRIAL,
 * HIGHWAY_RESERVED, AIRPORT_RESERVED, PORT_RESERVED, and FUTURE_EXPANSION.
 */

import {
  RailCorridorSection,
  WorldConfigData,
  ZoneCategory,
} from './WorldConfig';

export interface DistrictDefinition {
  id: string;
  name: string;
  category: ZoneCategory;
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
  allowCityBuildings: boolean;
  allowPlayerRoads: boolean;
  allowRailwayTracks: boolean;
  allowRailwayFacilities: boolean;
  allowPortStructures: boolean;
  allowAirportStructures: boolean;
  economicModifier: number;
}

export interface ZoningCheckResult {
  allowed: boolean;
  reason?: string;
  zone: ZoneCategory;
  districtId?: string;
}

export class DistrictSystem {
  private config: WorldConfigData;
  private districts: Map<string, DistrictDefinition> = new Map();
  private coreMinGx = -80;
  private coreMaxGx = 439;
  private coreMinGz = -80;
  private coreMaxGz = 319;
  private coreWidth = 520;
  private coreDepth = 400;
  private zoneGrid: Uint8Array;
  private railSectionGrid: Uint8Array;
  private zoneOverrides: Map<string, ZoneCategory> = new Map();

  constructor(config: WorldConfigData) {
    this.config = config;
    this.coreMinGx = config.coreMinGx ?? -80;
    this.coreMaxGx = config.coreMaxGx ?? 439;
    this.coreMinGz = config.coreMinGz ?? -80;
    this.coreMaxGz = config.coreMaxGz ?? 319;
    this.coreWidth = this.coreMaxGx - this.coreMinGx + 1;
    this.coreDepth = this.coreMaxGz - this.coreMinGz + 1;
    const total = this.coreWidth * this.coreDepth;
    this.zoneGrid = new Uint8Array(total);
    this.railSectionGrid = new Uint8Array(total);
    this.initializeDefaultDistricts();
  }

  public initializeDefaultDistricts(): void {
    this.districts.clear();
    this.zoneOverrides.clear();
    const total = this.coreWidth * this.coreDepth;
    this.zoneGrid = new Uint8Array(total);
    this.railSectionGrid = new Uint8Array(total);

    const rc = this.config.railCorridor;
    const cc = this.config.coreCity;
    const hw = this.config.highway;
    const pt = this.config.port;
    const ap = this.config.airport;
    const minWorldGx = this.config.minGx ?? -2240;
    const maxWorldGx = minWorldGx + this.config.gridWidth - 1;
    const minWorldGz = this.config.minGz ?? -1830;
    const maxWorldGz = minWorldGz + this.config.gridDepth - 1;

    const defs: DistrictDefinition[] = [
      {
        id: 'district-rail-yard',
        name: 'Western Railway Corridor & Yard',
        category: ZoneCategory.RAIL_YARD,
        minGx: rc.startX,
        maxGx: rc.endX,
        minGz: rc.minZ,
        maxGz: rc.maxZ,
        allowCityBuildings: false,
        allowPlayerRoads: false, // Only designated crossings allowed
        allowRailwayTracks: true,
        allowRailwayFacilities: true,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.15,
      },
      {
        id: 'district-logistics-west',
        name: 'Central Freight & Logistics Park',
        category: ZoneCategory.LOGISTICS,
        minGx: 38,
        maxGx: 60,
        minGz: 32,
        maxGz: 53,
        allowCityBuildings: false,
        allowPlayerRoads: true,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.2,
      },
      {
        id: 'district-industrial-south',
        name: 'Heavy Industrial & Manufacturing Basin',
        category: ZoneCategory.INDUSTRIAL,
        minGx: 44,
        maxGx: 60,
        minGz: 56,
        maxGz: 66,
        allowCityBuildings: false,
        allowPlayerRoads: true,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.25,
      },
      {
        id: 'district-warehouse-1',
        name: 'Warehouse 1 Reserved Logistics Property (25x30)',
        category: ZoneCategory.LOGISTICS,
        minGx: 35,
        maxGx: 59,
        minGz: 67,
        maxGz: 96,
        allowCityBuildings: false,
        allowPlayerRoads: true,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.3,
      },
      {
        id: 'district-core-city',
        name: 'Metro Core & Roundabout District',
        category: ZoneCategory.CITY,
        minGx: cc.startX,
        maxGx: cc.endX,
        minGz: cc.startZ,
        maxGz: cc.endZ,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.0,
      },
      {
        id: 'district-commercial-support',
        name: 'Midtown Commercial Support Zone',
        category: ZoneCategory.COMMERCIAL_SUPPORT,
        minGx: 72,
        maxGx: 102,
        minGz: 76,
        maxGz: 86,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.1,
      },
      {
        id: 'district-airport-reserve',
        name: 'Regional Air Cargo Hub (50×70 Reservation)',
        category: ZoneCategory.AIRPORT_RESERVED,
        minGx: ap.startX,
        maxGx: ap.endX,
        minGz: ap.startZ,
        maxGz: ap.endZ,
        allowCityBuildings: false,
        allowPlayerRoads: false,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: true,
        economicModifier: 1.3,
      },
      {
        id: 'district-airport-warehouse-reserve',
        name: 'Airport Cargo Warehouse Reservation (10×10)',
        category: ZoneCategory.AIRPORT_RESERVED,
        minGx: this.config.airportWarehouse.startX,
        maxGx: this.config.airportWarehouse.endX,
        minGz: this.config.airportWarehouse.startZ,
        maxGz: this.config.airportWarehouse.endZ,
        allowCityBuildings: false,
        allowPlayerRoads: false,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: true,
        economicModifier: 1.3,
      },
      {
        id: 'district-airport-transfer-yard-reserve',
        name: 'Airport Cargo Transfer Yard Reservation (10×10)',
        category: ZoneCategory.AIRPORT_RESERVED,
        minGx: this.config.airportTransferYard.startX,
        maxGx: this.config.airportTransferYard.endX,
        minGz: this.config.airportTransferYard.startZ,
        maxGz: this.config.airportTransferYard.endZ,
        allowCityBuildings: false,
        allowPlayerRoads: false,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: true,
        economicModifier: 1.3,
      },
      {
        id: 'district-highway-corridor',
        name: 'Eastern 10-Lane Interstate Corridor',
        category: ZoneCategory.HIGHWAY_RESERVED,
        minGx: hw.startX,
        maxGx: hw.endX,
        minGz: hw.visibleStartZ,
        maxGz: hw.visibleEndZ,
        allowCityBuildings: false,
        allowPlayerRoads: true, // Merge connections at designated entry/exit
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.0,
      },
      {
        id: 'district-port-harbour',
        name: 'Southern Deepwater Seaport Zone',
        category: ZoneCategory.PORT_RESERVED,
        minGx: pt.startX,
        maxGx: pt.endX,
        minGz: pt.startZ,
        maxGz: pt.endZ,
        allowCityBuildings: false,
        allowPlayerRoads: true,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: true,
        allowAirportStructures: false,
        economicModifier: 1.35,
      },
      {
        id: 'district-future-expansion-north',
        name: 'Northern Highland Expansion Reserve',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: 68,
        maxGx: 104,
        minGz: 10,
        maxGz: 30,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.0,
      },
      {
        id: 'district-metro-east-suburban',
        name: 'East Metro Suburban & Commercial Quarter',
        category: ZoneCategory.CITY,
        minGx: 105,
        maxGx: Math.max(118, hw.startX - 2),
        minGz: 35,
        maxGz: 75,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.08,
      },
      {
        id: 'district-eastern-valley-countryside',
        name: 'Silverpine Valley & Eastern Development Basin',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: 200,
        maxGx: 244,
        minGz: 62,
        maxGz: 118,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.15,
      },
      {
        id: 'district-southshore-peninsula',
        name: 'Southshore Coastal Development Reserve',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: 55,
        maxGx: 165,
        minGz: 148,
        maxGz: 196,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: false,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.12,
      },
      // Four-Direction World Expansion Districts
      {
        id: 'district-north-boreal-frontier',
        name: 'Northern Boreal Timber Frontier',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: -80,
        maxGx: 439,
        minGz: -80,
        maxGz: -1,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: true,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.14,
      },
      {
        id: 'district-west-timber-valley',
        name: 'Western Frontier Valley & Timberlands',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: -80,
        maxGx: -1,
        minGz: 0,
        maxGz: 215,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: true,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.14,
      },
      {
        id: 'district-east-highwood-ridge',
        name: 'Eastern Highwood Ridge Reserve',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: 360,
        maxGx: 439,
        minGz: 0,
        maxGz: 279,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: true,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.15,
      },
      {
        id: 'district-south-cape-headlands',
        name: 'Southern Cape Headlands Reserve',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: 268,
        maxGx: 439,
        minGz: 210,
        maxGz: 282,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: true,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.16,
      },
      // 20M+ Continental Open-World Expansion Districts (North, South, East, West)
      {
        id: 'district-continental-north-expanse',
        name: 'Great Northern Continental Basin & Highland Expanse',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: minWorldGx,
        maxGx: maxWorldGx,
        minGz: minWorldGz,
        maxGz: -81,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: true,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.2,
      },
      {
        id: 'district-continental-west-frontier',
        name: 'Great Western Continental Plains & Timberlands',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: minWorldGx,
        maxGx: -81,
        minGz: -80,
        maxGz: maxWorldGz,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: true,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.2,
      },
      {
        id: 'district-continental-east-highlands',
        name: 'Great Eastern Continental Valley & Alpine Range',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: 440,
        maxGx: maxWorldGx,
        minGz: -80,
        maxGz: maxWorldGz,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: true,
        allowRailwayFacilities: false,
        allowPortStructures: false,
        allowAirportStructures: false,
        economicModifier: 1.22,
      },
      {
        id: 'district-continental-south-archipelago',
        name: 'Southern Continental Coast & Offshore Archipelago',
        category: ZoneCategory.FUTURE_EXPANSION,
        minGx: -80,
        maxGx: 439,
        minGz: 320,
        maxGz: maxWorldGz,
        allowCityBuildings: true,
        allowPlayerRoads: true,
        allowRailwayTracks: true,
        allowRailwayFacilities: false,
        allowPortStructures: true,
        allowAirportStructures: false,
        economicModifier: 1.18,
      },
    ];

    for (const d of defs) {
      this.registerDistrict(d);
    }

    // Populate rail section subdivisions (5-block facilities + 10-block track operations)
    for (let gz = rc.minZ; gz <= rc.maxZ; gz++) {
      for (let gx = rc.startX; gx <= rc.endX; gx++) {
        const idx = this.getCoreCellIndex(gx, gz);
        if (idx < 0) continue;
        if (gx >= rc.facilitiesStartX && gx <= rc.facilitiesEndX) {
          this.railSectionGrid[idx] = RailCorridorSection.FACILITIES_AND_MACHINERY;
        } else if (gx >= rc.trackOpsStartX && gx <= rc.trackOpsEndX) {
          this.railSectionGrid[idx] = RailCorridorSection.TRACK_OPERATIONS;
        }
      }
    }
  }

  private getCoreCellIndex(gx: number, gz: number): number {
    if (
      gx < this.coreMinGx ||
      gx > this.coreMaxGx ||
      gz < this.coreMinGz ||
      gz > this.coreMaxGz
    ) {
      return -1;
    }
    return (gz - this.coreMinGz) * this.coreWidth + (gx - this.coreMinGx);
  }

  private isValidWorldCell(gx: number, gz: number): boolean {
    const minGx = this.config.minGx ?? 0;
    const maxGx = minGx + this.config.gridWidth - 1;
    const minGz = this.config.minGz ?? 0;
    const maxGz = minGz + this.config.gridDepth - 1;
    return gx >= minGx && gx <= maxGx && gz >= minGz && gz <= maxGz;
  }

  public registerDistrict(def: DistrictDefinition): void {
    this.districts.set(def.id, { ...def });
    // Populate dense core array only for the intersection with the core region [-80..439, -80..319]
    const cMinGx = Math.max(this.coreMinGx, def.minGx);
    const cMaxGx = Math.min(this.coreMaxGx, def.maxGx);
    const cMinGz = Math.max(this.coreMinGz, def.minGz);
    const cMaxGz = Math.min(this.coreMaxGz, def.maxGz);
    for (let gz = cMinGz; gz <= cMaxGz; gz++) {
      for (let gx = cMinGx; gx <= cMaxGx; gx++) {
        const idx = this.getCoreCellIndex(gx, gz);
        if (idx >= 0) {
          this.zoneGrid[idx] = def.category;
        }
      }
    }
  }

  public getDistricts(): DistrictDefinition[] {
    return Array.from(this.districts.values());
  }

  public getDistrictAt(gx: number, gz: number): DistrictDefinition | undefined {
    for (const d of this.districts.values()) {
      if (
        gx >= d.minGx &&
        gx <= d.maxGx &&
        gz >= d.minGz &&
        gz <= d.maxGz
      ) {
        return d;
      }
    }
    return undefined;
  }

  public getZoneAt(gx: number, gz: number): ZoneCategory {
    if (!this.isValidWorldCell(gx, gz)) {
      return ZoneCategory.OPEN_LAND;
    }
    const coreIdx = this.getCoreCellIndex(gx, gz);
    if (coreIdx >= 0) {
      return this.zoneGrid[coreIdx] as ZoneCategory;
    }
    const override = this.zoneOverrides.get(`${gx},${gz}`);
    if (override !== undefined) {
      return override;
    }
    const dist = this.getDistrictAt(gx, gz);
    return dist ? dist.category : ZoneCategory.FUTURE_EXPANSION;
  }

  public setZoneAt(gx: number, gz: number, zone: ZoneCategory): void {
    if (!this.isValidWorldCell(gx, gz)) {
      return;
    }
    const coreIdx = this.getCoreCellIndex(gx, gz);
    if (coreIdx >= 0) {
      this.zoneGrid[coreIdx] = zone;
      return;
    }
    this.zoneOverrides.set(`${gx},${gz}`, zone);
  }

  public getRailCorridorSectionAt(gx: number, gz: number): RailCorridorSection {
    const idx = this.getCoreCellIndex(gx, gz);
    if (idx < 0) {
      return RailCorridorSection.NONE;
    }
    return this.railSectionGrid[idx] as RailCorridorSection;
  }

  /**
   * Returns exact grid-block separation between nearest edge of the Core City and the Railway Corridor.
   */
  public getCityToRailSeparationBlocks(): number {
    return this.config.coreCity.startX - (this.config.railCorridor.endX + 1);
  }

  /**
   * Returns exact grid-block separation between nearest edge of the Core City and the 30x40 Cargo Airport reservation.
   */
  public getCityToAirportSeparationBlocks(): number {
    return this.config.airport.startX - this.config.coreCity.endX;
  }

  /**
   * Returns true if the given grid cell is inside any Airport Reserved Zone (30x40 Airport, 10x10 Warehouse, or 10x10 Transfer Yard).
   */
  public isAirportReservedCell(gx: number, gz: number): boolean {
    return this.getZoneAt(gx, gz) === ZoneCategory.AIRPORT_RESERVED;
  }

  public isDesignatedRailCrossingRow(gz: number): boolean {
    return this.config.railCorridor.designatedCrossingRows.some(
      (row) => Math.abs(row - gz) <= 1
    );
  }

  /**
   * Validates whether a given construction action is permitted at cell (gx, gz).
   */
  public validateZoning(
    gx: number,
    gz: number,
    buildType:
      | 'CITY_BUILDING'
      | 'ROAD'
      | 'RAIL_TRACK'
      | 'RAIL_DEPOT'
      | 'RAIL_STATION'
      | 'PORT_STRUCTURE'
      | 'AIRPORT_STRUCTURE'
  ): ZoningCheckResult {
    const zone = this.getZoneAt(gx, gz);
    const district = this.getDistrictAt(gx, gz);

    if (buildType === 'CITY_BUILDING') {
      if (zone === ZoneCategory.RAIL_YARD) {
        return {
          allowed: false,
          reason: 'Ordinary city buildings are prohibited inside the Rail Yard Zone.',
          zone,
          districtId: district?.id,
        };
      }
      if (zone === ZoneCategory.AIRPORT_RESERVED) {
        return {
          allowed: false,
          reason: 'Ordinary buildings are prohibited in the Airport Reserved Zone.',
          zone,
          districtId: district?.id,
        };
      }
      if (zone === ZoneCategory.HIGHWAY_RESERVED) {
        return {
          allowed: false,
          reason: 'Buildings cannot be placed on the Highway Reserved Corridor.',
          zone,
          districtId: district?.id,
        };
      }
      if (zone === ZoneCategory.PORT_RESERVED) {
        return {
          allowed: false,
          reason: 'Ordinary city buildings are prohibited in the Port Reserved Zone.',
          zone,
          districtId: district?.id,
        };
      }
      return { allowed: true, zone, districtId: district?.id };
    }

    if (buildType === 'RAIL_TRACK') {
      if (zone === ZoneCategory.CITY) {
        return {
          allowed: false,
          reason: 'Railway tracks are prohibited inside the City Zone.',
          zone,
          districtId: district?.id,
        };
      }
      if (
        zone === ZoneCategory.AIRPORT_RESERVED ||
        zone === ZoneCategory.HIGHWAY_RESERVED ||
        zone === ZoneCategory.PORT_RESERVED
      ) {
        return {
          allowed: false,
          reason: `Railway tracks cannot be placed inside ${ZoneCategory[zone]}.`,
          zone,
          districtId: district?.id,
        };
      }
      if (zone === ZoneCategory.RAIL_YARD) {
        const section = this.getRailCorridorSectionAt(gx, gz);
        if (section !== RailCorridorSection.TRACK_OPERATIONS) {
          return {
            allowed: false,
            reason:
              'Inside the Rail Yard, railway tracks must stay within the 10-block Track Operations section (gx 25..34).',
            zone,
            districtId: district?.id,
          };
        }
      }
      return { allowed: true, zone, districtId: district?.id };
    }

    if (buildType === 'RAIL_DEPOT') {
      if (zone !== ZoneCategory.RAIL_YARD) {
        return {
          allowed: false,
          reason: 'Railway depots must be placed inside the Rail Yard Zone.',
          zone,
          districtId: district?.id,
        };
      }
      const section = this.getRailCorridorSectionAt(gx, gz);
      if (section !== RailCorridorSection.FACILITIES_AND_MACHINERY) {
        return {
          allowed: false,
          reason:
            'Railway depots must be placed in the 5-block Yard Facilities & Machinery section (gx 20..24).',
          zone,
          districtId: district?.id,
        };
      }
      return { allowed: true, zone, districtId: district?.id };
    }

    if (buildType === 'RAIL_STATION') {
      if (zone !== ZoneCategory.RAIL_YARD) {
        return {
          allowed: false,
          reason: 'Railway stations must be placed inside the Rail Yard Zone.',
          zone,
          districtId: district?.id,
        };
      }
      return { allowed: true, zone, districtId: district?.id };
    }

    if (buildType === 'ROAD') {
      if (zone === ZoneCategory.AIRPORT_RESERVED) {
        return {
          allowed: false,
          reason: 'Ordinary roads cannot be built inside the Airport Reserved Zone.',
          zone,
          districtId: district?.id,
        };
      }
      if (zone === ZoneCategory.RAIL_YARD) {
        if (!this.isDesignatedRailCrossingRow(gz)) {
          return {
            allowed: false,
            reason:
              'Road crossing not authorized outside designated railway crossing zones (rows Z=35, Z=55).',
            zone,
            districtId: district?.id,
          };
        }
      }
      return { allowed: true, zone, districtId: district?.id };
    }

    return { allowed: true, zone, districtId: district?.id };
  }

  public handleWorldExpansion(newConfig: WorldConfigData): void {
    this.config = newConfig;
    const minGx = newConfig.minGx ?? -2240;
    const minGz = newConfig.minGz ?? -1830;
    const maxGx = minGx + newConfig.gridWidth - 1;
    const maxGz = minGz + newConfig.gridDepth - 1;

    const north = this.districts.get('district-continental-north-frontier');
    if (north) {
      north.minGx = minGx;
      north.maxGx = maxGx;
      north.minGz = minGz;
    }
    const south = this.districts.get('district-continental-south-frontier');
    if (south) {
      south.minGx = minGx;
      south.maxGx = maxGx;
      south.maxGz = maxGz;
    }
    const west = this.districts.get('district-continental-west-frontier');
    if (west) {
      west.minGx = minGx;
    }
    const east = this.districts.get('district-continental-east-frontier');
    if (east) {
      east.maxGx = maxGx;
    }
  }
}

