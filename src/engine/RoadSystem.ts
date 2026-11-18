/**
 * Authoritative Road Network, Highway, Central Roundabout, Junctions,
 * and Player Road Construction System (Master Prompt 3).
 */

import { DistrictSystem } from './DistrictSystem';
import { EntityRegistry } from './EntityRegistry';
import { GridCoord, GridSystem } from './GridSystem';
import { TerrainWaterSystem } from './TerrainWaterSystem';
import {
  ROAD_SPECS,
  RoadSpec,
  RoadWidthConfig,
  WorldConfigData,
  ZoneCategory,
} from './WorldConfig';

export type RoadShapeType = 'STRAIGHT' | 'CURVED' | 'ROUNDABOUT_RING' | 'HIGHWAY_MAIN' | 'HIGHWAY_MERGE';

export interface RoadSegmentRecord {
  id: string;
  shape: RoadShapeType;
  widthConfig: RoadWidthConfig;
  spec: RoadSpec;
  start: GridCoord;
  end: GridCoord;
  controlPoint?: GridCoord; // Used for smooth curved roads
  coveredCells: GridCoord[];
  connectedRoadIds: string[];
  junctionIds: string[];
  isHighway: boolean;
  isPreplaced: boolean;
  isConnectedToHighway: boolean;
  canSpawnTraffic: boolean;
  crossingId?: string;
}

export interface RoadJunctionRecord {
  id: string;
  center: GridCoord;
  approachingRoadIds: string[];
  approachWidths: Record<string, RoadWidthConfig>;
  isRoundabout: boolean;
}

export interface HighwayRecord {
  id: string;
  startX: number;
  endX: number;
  visibleStartZ: number;
  visibleEndZ: number;
  mainLanesTotal: number;          // 8
  mainLanesPerDirection: number;   // 4
  serviceRoadLanesTotal: number;   // 2
  totalLanes: number;              // 10
  mergeEntryCoord: GridCoord;
  mergeExitCoord: GridCoord;
  connectedRoadIds: string[];
}

export interface RoundaboutApproachTaperSpec {
  direction: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
  connectedRoadId: string;
  entryLanes: number;
  exitLanes: number;
  entryTaperLengthMeters: number;
  exitTaperLengthMeters: number;
  entryFlareAngleDeg: number;
  exitFlareAngleDeg: number;
  splitterIslandLengthMeters: number;
  splitterIslandWidthMeters: number;
  hasPaintedGoreChevrons: boolean;
  hasSharkToothYieldLine: boolean;
  hasYieldSignage: boolean;
  yieldSignCount: number;
}

export interface RoundaboutRecord {
  id: string;
  name: string;
  center: GridCoord;
  outerRadiusCells: number;
  innerIslandRadiusCells: number;
  outerRadiusMeters: number;
  innerRadiusMeters: number;
  circulatingLanes: number;
  circulatingWidthConfig: RoadWidthConfig;
  hasEntryExitTapers: boolean;
  hasYieldSignage: boolean;
  totalYieldSigns: number;
  approachTapers: RoundaboutApproachTaperSpec[];
  connectedApproachIds: string[];
}

export interface RoadValidationResult {
  valid: boolean;
  reason?: string;
  coveredCells: GridCoord[];
  spec: RoadSpec;
  requiresAuthorizedRailCrossing?: boolean;
  crossingRowGz?: number;
}

export class RoadSystem {
  private config: WorldConfigData;
  private grid: GridSystem;
  private terrainWater: TerrainWaterSystem;
  private districts: DistrictSystem;
  private entities: EntityRegistry;

  private segments: Map<string, RoadSegmentRecord> = new Map();
  private junctions: Map<string, RoadJunctionRecord> = new Map();
  private highway!: HighwayRecord;
  private roundabout!: RoundaboutRecord;
  private highwayInterchangeRoundabout!: RoundaboutRecord;
  private cellToRoadIds: Map<string, Set<string>> = new Map();
  private nextRoadSeq = 1;

  // Callback hook for designated railway crossing integration (Master Prompt 4)
  private onRailCrossingConstructed?: (
    roadId: string,
    crossingRowGz: number,
    widthConfig: RoadWidthConfig
  ) => string | undefined;

  private onRailCrossingRemoved?: (roadId: string) => void;

  constructor(
    config: WorldConfigData,
    grid: GridSystem,
    terrainWater: TerrainWaterSystem,
    districts: DistrictSystem,
    entities: EntityRegistry
  ) {
    this.config = config;
    this.grid = grid;
    this.terrainWater = terrainWater;
    this.districts = districts;
    this.entities = entities;
    this.initializeApprovedPreplacedNetwork();
  }

  public setRailCrossingHooks(
    onConstruct: (
      roadId: string,
      crossingRowGz: number,
      widthConfig: RoadWidthConfig
    ) => string | undefined,
    onRemove: (roadId: string) => void
  ): void {
    this.onRailCrossingConstructed = onConstruct;
    this.onRailCrossingRemoved = onRemove;
  }

  private cellKey(gx: number, gz: number): string {
    return `${gx},${gz}`;
  }

  /**
   * Initializes only the approved initial road infrastructure:
   * 1. Extreme-right 10-lane Highway (8 main + 2 service lanes) with limited visible segment.
   * 2. Multi-Lane Highway-City Interchange Roundabout at (143, 55) + Central City Roundabout at (86, 55),
   *    both with 3 circulating lanes, flared entry/exit tapers, splitter islands, and yield signage.
   * 3. Multi-Lane East Highway-City Arterial connecting the Central Roundabout to the Highway Interchange.
   * 4. Approved small 1x1 access road near the starter facilities toward the railway area.
   * Zero unwanted automatic roads on expanded land or around the port.
   */
  public initializeApprovedPreplacedNetwork(): void {
    this.segments.clear();
    this.junctions.clear();
    this.cellToRoadIds.clear();

    const hw = this.config.highway;
    const cc = this.config.coreCity;

    // 1. Extreme-Right Highway (8 main lanes + 2 service lanes = 10 total lanes)
    this.highway = {
      id: 'highway-extreme-right',
      startX: hw.startX,
      endX: hw.endX,
      visibleStartZ: hw.visibleStartZ,
      visibleEndZ: hw.visibleEndZ,
      mainLanesTotal: hw.mainLanesTotal,
      mainLanesPerDirection: hw.mainLanesPerDirection,
      serviceRoadLanesTotal: hw.serviceRoadLanesTotal,
      totalLanes: hw.totalLanes,
      mergeEntryCoord: { gx: hw.startX, gz: hw.mergeRowZ - 1 },
      mergeExitCoord: { gx: hw.startX, gz: hw.mergeRowZ + 1 },
      connectedRoadIds: [],
    };

    const hwCells: GridCoord[] = [];
    for (let gz = hw.visibleStartZ; gz <= hw.visibleEndZ; gz++) {
      for (let gx = hw.startX; gx <= hw.endX; gx++) {
        hwCells.push({ gx, gz });
      }
    }

    const highwaySegment: RoadSegmentRecord = {
      id: 'highway-extreme-right',
      shape: 'HIGHWAY_MAIN',
      widthConfig: '3x3',
      spec: ROAD_SPECS['3x3'],
      start: { gx: hw.startX, gz: hw.visibleStartZ },
      end: { gx: hw.startX, gz: hw.visibleEndZ },
      coveredCells: hwCells,
      connectedRoadIds: [],
      junctionIds: [],
      isHighway: true,
      isPreplaced: true,
      isConnectedToHighway: true,
      canSpawnTraffic: true,
    };
    this.registerRoadInternal(highwaySegment);

    // 2A. Central City-Highway Roundabout Interchange at (86, 55) — Upgraded to 3-Lane Multi-Lane Roundabout
    const rcx = cc.roundaboutCenterX;
    const rcz = cc.roundaboutCenterZ;
    const rOuter = cc.roundaboutRadiusCells; // 4 cells logical footprint
    this.roundabout = {
      id: 'roundabout-central',
      name: 'Central City-Highway Multi-Lane Roundabout',
      center: { gx: rcx, gz: rcz },
      outerRadiusCells: rOuter,
      innerIslandRadiusCells: 2,
      outerRadiusMeters: 10.6,
      innerRadiusMeters: 4.0,
      circulatingLanes: 3,
      circulatingWidthConfig: '3x3',
      hasEntryExitTapers: true,
      hasYieldSignage: true,
      totalYieldSigns: 8,
      approachTapers: [
        {
          direction: 'EAST',
          connectedRoadId: 'road-east-highway-merge',
          entryLanes: 3,
          exitLanes: 3,
          entryTaperLengthMeters: 7.2,
          exitTaperLengthMeters: 7.2,
          entryFlareAngleDeg: 18,
          exitFlareAngleDeg: 16,
          splitterIslandLengthMeters: 5.4,
          splitterIslandWidthMeters: 1.1,
          hasPaintedGoreChevrons: true,
          hasSharkToothYieldLine: true,
          hasYieldSignage: true,
          yieldSignCount: 2,
        },
        {
          direction: 'WEST',
          connectedRoadId: 'road-city-west-approach',
          entryLanes: 2,
          exitLanes: 2,
          entryTaperLengthMeters: 6.4,
          exitTaperLengthMeters: 6.4,
          entryFlareAngleDeg: 16,
          exitFlareAngleDeg: 15,
          splitterIslandLengthMeters: 4.8,
          splitterIslandWidthMeters: 0.95,
          hasPaintedGoreChevrons: true,
          hasSharkToothYieldLine: true,
          hasYieldSignage: true,
          yieldSignCount: 2,
        },
        {
          direction: 'NORTH',
          connectedRoadId: 'road-city-north-approach',
          entryLanes: 2,
          exitLanes: 2,
          entryTaperLengthMeters: 6.4,
          exitTaperLengthMeters: 6.4,
          entryFlareAngleDeg: 16,
          exitFlareAngleDeg: 15,
          splitterIslandLengthMeters: 4.8,
          splitterIslandWidthMeters: 0.95,
          hasPaintedGoreChevrons: true,
          hasSharkToothYieldLine: true,
          hasYieldSignage: true,
          yieldSignCount: 2,
        },
        {
          direction: 'SOUTH',
          connectedRoadId: 'road-city-south-approach',
          entryLanes: 2,
          exitLanes: 2,
          entryTaperLengthMeters: 6.4,
          exitTaperLengthMeters: 6.4,
          entryFlareAngleDeg: 16,
          exitFlareAngleDeg: 15,
          splitterIslandLengthMeters: 4.8,
          splitterIslandWidthMeters: 0.95,
          hasPaintedGoreChevrons: true,
          hasSharkToothYieldLine: true,
          hasYieldSignage: true,
          yieldSignCount: 2,
        },
      ],
      connectedApproachIds: [],
    };

    const roundaboutCells: GridCoord[] = [];
    for (let dz = -rOuter; dz <= rOuter; dz++) {
      for (let dx = -rOuter; dx <= rOuter; dx++) {
        const dist = Math.hypot(dx, dz);
        if (dist >= 1.5 && dist <= rOuter + 0.4) {
          roundaboutCells.push({ gx: rcx + dx, gz: rcz + dz });
        }
      }
    }

    const roundaboutSeg: RoadSegmentRecord = {
      id: 'roundabout-central',
      shape: 'ROUNDABOUT_RING',
      widthConfig: '3x3',
      spec: ROAD_SPECS['3x3'],
      start: { gx: rcx, gz: rcz },
      end: { gx: rcx, gz: rcz },
      coveredCells: roundaboutCells,
      connectedRoadIds: [],
      junctionIds: ['junction-roundabout-central'],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: true,
      canSpawnTraffic: true,
    };
    this.registerRoadInternal(roundaboutSeg);

    this.junctions.set('junction-roundabout-central', {
      id: 'junction-roundabout-central',
      center: { gx: rcx, gz: rcz },
      approachingRoadIds: ['roundabout-central'],
      approachWidths: { 'roundabout-central': '3x3' },
      isRoundabout: true,
    });

    // 2B. Highway-City Interchange Multi-Lane Roundabout at (143, 55) — Center of the Highway-City Connection
    const hwRcx = Math.floor((hw.startX + hw.endX) * 0.5); // gx = 143
    const hwRcz = hw.mergeRowZ; // gz = 55
    const hwROuter = 6; // 6 cells radius (gx 137..149, gz 49..61)
    this.highwayInterchangeRoundabout = {
      id: 'roundabout-highway-interchange',
      name: 'Highway-City Multi-Lane Interchange Roundabout',
      center: { gx: hwRcx, gz: hwRcz },
      outerRadiusCells: hwROuter,
      innerIslandRadiusCells: 3,
      outerRadiusMeters: 13.4,
      innerRadiusMeters: 5.6,
      circulatingLanes: 3,
      circulatingWidthConfig: '3x3',
      hasEntryExitTapers: true,
      hasYieldSignage: true,
      totalYieldSigns: 8,
      approachTapers: [
        {
          direction: 'WEST',
          connectedRoadId: 'road-east-highway-merge',
          entryLanes: 3,
          exitLanes: 3,
          entryTaperLengthMeters: 8.6,
          exitTaperLengthMeters: 8.6,
          entryFlareAngleDeg: 20,
          exitFlareAngleDeg: 18,
          splitterIslandLengthMeters: 6.4,
          splitterIslandWidthMeters: 1.25,
          hasPaintedGoreChevrons: true,
          hasSharkToothYieldLine: true,
          hasYieldSignage: true,
          yieldSignCount: 2,
        },
        {
          direction: 'NORTH',
          connectedRoadId: 'highway-extreme-right',
          entryLanes: 4,
          exitLanes: 4,
          entryTaperLengthMeters: 9.8,
          exitTaperLengthMeters: 9.8,
          entryFlareAngleDeg: 22,
          exitFlareAngleDeg: 20,
          splitterIslandLengthMeters: 7.2,
          splitterIslandWidthMeters: 1.4,
          hasPaintedGoreChevrons: true,
          hasSharkToothYieldLine: true,
          hasYieldSignage: true,
          yieldSignCount: 2,
        },
        {
          direction: 'SOUTH',
          connectedRoadId: 'highway-extreme-right',
          entryLanes: 4,
          exitLanes: 4,
          entryTaperLengthMeters: 9.8,
          exitTaperLengthMeters: 9.8,
          entryFlareAngleDeg: 22,
          exitFlareAngleDeg: 20,
          splitterIslandLengthMeters: 7.2,
          splitterIslandWidthMeters: 1.4,
          hasPaintedGoreChevrons: true,
          hasSharkToothYieldLine: true,
          hasYieldSignage: true,
          yieldSignCount: 2,
        },
        {
          direction: 'EAST',
          connectedRoadId: 'road-airport-city-connector',
          entryLanes: 2,
          exitLanes: 2,
          entryTaperLengthMeters: 7.6,
          exitTaperLengthMeters: 7.6,
          entryFlareAngleDeg: 18,
          exitFlareAngleDeg: 16,
          splitterIslandLengthMeters: 5.6,
          splitterIslandWidthMeters: 1.1,
          hasPaintedGoreChevrons: true,
          hasSharkToothYieldLine: true,
          hasYieldSignage: true,
          yieldSignCount: 2,
        },
      ],
      connectedApproachIds: [],
    };

    const hwRoundaboutCells: GridCoord[] = [];
    for (let dz = -hwROuter; dz <= hwROuter; dz++) {
      for (let dx = -hwROuter; dx <= hwROuter; dx++) {
        const dist = Math.hypot(dx, dz);
        if (dist >= 2.2 && dist <= hwROuter + 0.4) {
          hwRoundaboutCells.push({ gx: hwRcx + dx, gz: hwRcz + dz });
        }
      }
    }

    const hwRoundaboutSeg: RoadSegmentRecord = {
      id: 'roundabout-highway-interchange',
      shape: 'ROUNDABOUT_RING',
      widthConfig: '3x3',
      spec: ROAD_SPECS['3x3'],
      start: { gx: hwRcx, gz: hwRcz },
      end: { gx: hwRcx, gz: hwRcz },
      coveredCells: hwRoundaboutCells,
      connectedRoadIds: [],
      junctionIds: ['junction-roundabout-highway-interchange'],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: true,
      canSpawnTraffic: true,
    };
    this.registerRoadInternal(hwRoundaboutSeg);

    this.junctions.set('junction-roundabout-highway-interchange', {
      id: 'junction-roundabout-highway-interchange',
      center: { gx: hwRcx, gz: hwRcz },
      approachingRoadIds: ['roundabout-highway-interchange'],
      approachWidths: { 'roundabout-highway-interchange': '3x3' },
      isRoundabout: true,
    });

    // 3. Multi-Lane Highway-City Connector Arterial connecting Central Roundabout (gx=90..137, gz=55)
    //    to the Highway-City Interchange Roundabout (gx=137..149, gz=55)
    const eastArterialCells = this.computeStraightCells(
      { gx: rcx + rOuter, gz: rcz },
      { gx: hw.startX - 1, gz: rcz },
      '3x3'
    );
    const eastArterial: RoadSegmentRecord = {
      id: 'road-east-highway-merge',
      shape: 'HIGHWAY_MERGE',
      widthConfig: '3x3',
      spec: ROAD_SPECS['3x3'],
      start: { gx: rcx + rOuter, gz: rcz },
      end: { gx: hw.startX - 1, gz: rcz },
      coveredCells: eastArterialCells,
      connectedRoadIds: [
        'roundabout-central',
        'roundabout-highway-interchange',
        'highway-extreme-right',
      ],
      junctionIds: [
        'junction-roundabout-central',
        'junction-roundabout-highway-interchange',
      ],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: true,
      canSpawnTraffic: true,
    };
    this.registerRoadInternal(eastArterial);

    // 4. Short West, North, and South Roundabout Approaches in Core City
    const westApproachCells = this.computeStraightCells(
      { gx: 72, gz: rcz },
      { gx: rcx - rOuter, gz: rcz },
      '2x2'
    );
    this.registerRoadInternal({
      id: 'road-city-west-approach',
      shape: 'STRAIGHT',
      widthConfig: '2x2',
      spec: ROAD_SPECS['2x2'],
      start: { gx: 72, gz: rcz },
      end: { gx: rcx - rOuter, gz: rcz },
      coveredCells: westApproachCells,
      connectedRoadIds: ['roundabout-central'],
      junctionIds: ['junction-roundabout-central'],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: true,
      canSpawnTraffic: true,
    });

    const northApproachCells = this.computeStraightCells(
      { gx: rcx, gz: 41 },
      { gx: rcx, gz: rcz - rOuter },
      '2x2'
    );
    this.registerRoadInternal({
      id: 'road-city-north-approach',
      shape: 'STRAIGHT',
      widthConfig: '2x2',
      spec: ROAD_SPECS['2x2'],
      start: { gx: rcx, gz: 41 },
      end: { gx: rcx, gz: rcz - rOuter },
      coveredCells: northApproachCells,
      connectedRoadIds: ['roundabout-central'],
      junctionIds: ['junction-roundabout-central'],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: true,
      canSpawnTraffic: true,
    });

    const southApproachCells = this.computeStraightCells(
      { gx: rcx, gz: rcz + rOuter },
      { gx: rcx, gz: 87 },
      '2x2'
    );
    this.registerRoadInternal({
      id: 'road-city-south-approach',
      shape: 'STRAIGHT',
      widthConfig: '2x2',
      spec: ROAD_SPECS['2x2'],
      start: { gx: rcx, gz: rcz + rOuter },
      end: { gx: rcx, gz: 87 },
      coveredCells: southApproachCells,
      connectedRoadIds: ['roundabout-central'],
      junctionIds: ['junction-roundabout-central'],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: true,
      canSpawnTraffic: true,
    });

    // 5. Approved 1x1 access road & perimeter loop connecting the 40x50 Railway Yard compound to the logistics road network
    const railAccessCells = this.computeStraightCells(
      { gx: 35, gz: 55 },
      { gx: 56, gz: 55 },
      '1x1'
    );
    this.registerRoadInternal({
      id: 'road-rail-yard-access',
      shape: 'STRAIGHT',
      widthConfig: '1x1',
      spec: ROAD_SPECS['1x1'],
      start: { gx: 35, gz: 55 },
      end: { gx: 56, gz: 55 },
      coveredCells: railAccessCells,
      connectedRoadIds: ['road-rail-yard-perimeter-loop'],
      junctionIds: [],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: false, // Not connected to highway until a bridge crosses the river!
      canSpawnTraffic: false,
    });

    const railPerimeterCells = this.computeStraightCells(
      { gx: 35, gz: 38 },
      { gx: 35, gz: 66 },
      '1x1'
    );
    this.registerRoadInternal({
      id: 'road-rail-yard-perimeter-loop',
      shape: 'STRAIGHT',
      widthConfig: '1x1',
      spec: ROAD_SPECS['1x1'],
      start: { gx: 35, gz: 38 },
      end: { gx: 35, gz: 66 },
      coveredCells: railPerimeterCells,
      connectedRoadIds: ['road-rail-yard-access'],
      junctionIds: [],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: false,
      canSpawnTraffic: false,
    });

    // 6. Specific approved 1x1 access road connecting the starter depot road (48, 55) to Warehouse 1's northern loading yard gate (48, 66)
    const wh1AccessCells = this.computeStraightCells(
      { gx: 48, gz: 55 },
      { gx: 48, gz: 66 },
      '1x1'
    );
    this.registerRoadInternal({
      id: 'road-warehouse-1-access',
      shape: 'STRAIGHT',
      widthConfig: '1x1',
      spec: ROAD_SPECS['1x1'],
      start: { gx: 48, gz: 55 },
      end: { gx: 48, gz: 66 },
      coveredCells: wh1AccessCells,
      connectedRoadIds: ['road-rail-yard-access'],
      junctionIds: [],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: false,
      canSpawnTraffic: false,
    });

    // 7. Dedicated Airport Freight Road Connection on the Airport's Right Side (+X side, gx=192..193)
    //    and Landside Frontage (gz=42..43) linking to the Main City Road Network at gz=55..56!
    const ap = this.config.airport;
    const coreEndX = ap.level1EndX ?? 191;
    const coreEndZ = ap.level1EndZ ?? 41;
    const rightFreightX = coreEndX + 1; // gx = 192 (dedicated landside freight corridor east of the truck yard)
    const landsideRoadZ = 58; // gz = 58..59 (southern landside frontage boulevard outside Warehouse, Transfer Yard & Truck Yard)

    // 7a. Right-side freight arterial road serving the Landside Truck Yard & Southern Frontage (gx=192..193, gz=42..58)
    const airportRightRoadCells = this.computeStraightCells(
      { gx: rightFreightX, gz: coreEndZ + 1 },
      { gx: rightFreightX, gz: landsideRoadZ },
      '2x2'
    );
    this.registerRoadInternal({
      id: 'road-airport-freight-right',
      shape: 'STRAIGHT',
      widthConfig: '2x2',
      spec: ROAD_SPECS['2x2'],
      start: { gx: rightFreightX, gz: coreEndZ + 1 },
      end: { gx: rightFreightX, gz: landsideRoadZ },
      coveredCells: airportRightRoadCells,
      connectedRoadIds: [
        'road-airport-landside-frontage',
        'road-airport-city-connector',
      ],
      junctionIds: [],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: true,
      canSpawnTraffic: false,
    });

    // 7b. Landside terminal frontage boulevard serving the 18x6 Truck Yard,
    //     10x10 Airport Warehouse, and 10x10 Transfer Yard (gx=152..192, gz=58..59)
    const airportLandsideCells = this.computeStraightCells(
      { gx: ap.startX, gz: landsideRoadZ },
      { gx: rightFreightX, gz: landsideRoadZ },
      '2x2'
    );
    this.registerRoadInternal({
      id: 'road-airport-landside-frontage',
      shape: 'STRAIGHT',
      widthConfig: '2x2',
      spec: ROAD_SPECS['2x2'],
      start: { gx: ap.startX, gz: landsideRoadZ },
      end: { gx: rightFreightX, gz: landsideRoadZ },
      coveredCells: airportLandsideCells,
      connectedRoadIds: ['road-airport-freight-right'],
      junctionIds: [],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: true,
      canSpawnTraffic: false,
    });

    // 7c. Rebuilt Roundabout-to-Airport Access Corridor linking the repositioned Highway-City Interchange
    //     Roundabout eastern exit (gx=135, gz=55) directly to the Airport Freight Corridor (gx=192, gz=55)
    const airportCityConnectorCells = this.computeStraightCells(
      { gx: hw.endX + 1, gz: rcz },
      { gx: rightFreightX, gz: rcz },
      '2x2'
    );
    this.registerRoadInternal({
      id: 'road-airport-city-connector',
      shape: 'HIGHWAY_MERGE',
      widthConfig: '2x2',
      spec: ROAD_SPECS['2x2'],
      start: { gx: hw.endX + 1, gz: rcz },
      end: { gx: rightFreightX, gz: rcz },
      coveredCells: airportCityConnectorCells,
      connectedRoadIds: [
        'roundabout-highway-interchange',
        'road-east-highway-merge',
        'highway-extreme-right',
        'road-airport-freight-right',
      ],
      junctionIds: ['junction-roundabout-highway-interchange'],
      isHighway: false,
      isPreplaced: true,
      isConnectedToHighway: true,
      canSpawnTraffic: true,
    });

    this.recomputeConnectivityAndJunctions();
  }

  private registerRoadInternal(seg: RoadSegmentRecord): void {
    this.segments.set(seg.id, seg);
    for (const c of seg.coveredCells) {
      const key = this.cellKey(c.gx, c.gz);
      let set = this.cellToRoadIds.get(key);
      if (!set) {
        set = new Set();
        this.cellToRoadIds.set(key, set);
      }
      set.add(seg.id);
    }

    if (!this.entities.has(seg.id)) {
      this.entities.register({
        id: seg.id,
        category: seg.isHighway
          ? 'HIGHWAY'
          : seg.shape === 'ROUNDABOUT_RING'
            ? 'ROUNDABOUT'
            : 'ROAD',
        type: `${seg.shape}_${seg.widthConfig}`,
        position: { ...seg.start },
        footprint: seg.coveredCells.map((c) => ({ ...c })),
        orientation: 0,
        elevation: 1.2,
        ownership: seg.isPreplaced ? 'WORLD' : 'PLAYER',
        active: true,
        metadata: {
          widthConfig: seg.widthConfig,
          totalLanes: seg.spec.totalLanes,
          shape: seg.shape,
        },
      });
    }
  }

  /**
   * Computes logical grid cells covered by a straight road segment with given width configuration.
   */
  public computeStraightCells(
    start: GridCoord,
    end: GridCoord,
    widthConfig: RoadWidthConfig
  ): GridCoord[] {
    const spec = ROAD_SPECS[widthConfig];
    const w = spec.gridWidth;
    const halfLow = Math.floor((w - 1) / 2);
    const halfHigh = w - 1 - halfLow;

    const cells: GridCoord[] = [];
    const seen = new Set<string>();

    const dx = end.gx - start.gx;
    const dz = end.gz - start.gz;
    const steps = Math.max(Math.abs(dx), Math.abs(dz), 1);
    const isHorizontalDominant = Math.abs(dx) >= Math.abs(dz);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.round(start.gx + dx * t);
      const cz = Math.round(start.gz + dz * t);

      for (let offset = -halfLow; offset <= halfHigh; offset++) {
        const gx = isHorizontalDominant ? cx : cx + offset;
        const gz = isHorizontalDominant ? cz + offset : cz;
        const key = this.cellKey(gx, gz);
        if (!seen.has(key)) {
          seen.add(key);
          cells.push({ gx, gz });
        }
      }
    }
    return cells;
  }

  /**
   * Computes logical grid cells covered by a smooth quadratic Bezier curved road segment.
   */
  public computeCurvedCells(
    start: GridCoord,
    control: GridCoord,
    end: GridCoord,
    widthConfig: RoadWidthConfig
  ): GridCoord[] {
    const spec = ROAD_SPECS[widthConfig];
    const w = spec.gridWidth;
    const halfLow = Math.floor((w - 1) / 2);
    const halfHigh = w - 1 - halfLow;

    const cells: GridCoord[] = [];
    const seen = new Set<string>();

    const distApprox =
      Math.hypot(control.gx - start.gx, control.gz - start.gz) +
      Math.hypot(end.gx - control.gx, end.gz - control.gz);
    const steps = Math.max(Math.ceil(distApprox * 2), 8);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const oneMinusT = 1 - t;
      const fx =
        oneMinusT * oneMinusT * start.gx +
        2 * oneMinusT * t * control.gx +
        t * t * end.gx;
      const fz =
        oneMinusT * oneMinusT * start.gz +
        2 * oneMinusT * t * control.gz +
        t * t * end.gz;

      const cx = Math.round(fx);
      const cz = Math.round(fz);

      for (let ox = -halfLow; ox <= halfHigh; ox++) {
        for (let oz = -halfLow; oz <= halfHigh; oz++) {
          const gx = cx + ox;
          const gz = cz + oz;
          const key = this.cellKey(gx, gz);
          if (!seen.has(key)) {
            seen.add(key);
            cells.push({ gx, gz });
          }
        }
      }
    }
    return cells;
  }

  /**
   * Validates a proposed straight or curved road placement without mutating world state.
   */
  public validateRoadPlacement(
    start: GridCoord,
    end: GridCoord,
    widthConfig: RoadWidthConfig,
    shape: 'STRAIGHT' | 'CURVED' = 'STRAIGHT',
    controlPoint?: GridCoord
  ): RoadValidationResult {
    const spec = ROAD_SPECS[widthConfig];
    if (!spec) {
      return {
        valid: false,
        reason: 'Invalid road width configuration.',
        coveredCells: [],
        spec: ROAD_SPECS['1x1'],
      };
    }

    if (
      !this.grid.isValidGridCoord(start.gx, start.gz) ||
      !this.grid.isValidGridCoord(end.gx, end.gz)
    ) {
      return {
        valid: false,
        reason: 'Road endpoints are outside playable world boundaries.',
        coveredCells: [],
        spec,
      };
    }

    if (start.gx === end.gx && start.gz === end.gz) {
      return {
        valid: false,
        reason: 'Road start and end coordinates must be distinct.',
        coveredCells: [],
        spec,
      };
    }

    const effectiveControl =
      controlPoint ?? { gx: end.gx, gz: start.gz };

    const coveredCells =
      shape === 'CURVED'
        ? this.computeCurvedCells(start, effectiveControl, end, widthConfig)
        : this.computeStraightCells(start, end, widthConfig);

    // Check for exact duplicate road segment
    for (const seg of this.segments.values()) {
      if (
        seg.widthConfig === widthConfig &&
        seg.shape === shape &&
        ((seg.start.gx === start.gx &&
          seg.start.gz === start.gz &&
          seg.end.gx === end.gx &&
          seg.end.gz === end.gz) ||
          (seg.start.gx === end.gx &&
            seg.start.gz === end.gz &&
            seg.end.gx === start.gx &&
            seg.end.gz === start.gz))
      ) {
        return {
          valid: false,
          reason: 'Identical road segment already exists at this location.',
          coveredCells,
          spec,
        };
      }
    }

    let requiresAuthorizedRailCrossing = false;
    let crossingRowGz: number | undefined;

    for (const cell of coveredCells) {
      if (!this.grid.isValidGridCoord(cell.gx, cell.gz)) {
        return {
          valid: false,
          reason: 'Road footprint extends outside the playable world.',
          coveredCells,
          spec,
        };
      }

      if (this.terrainWater.isWaterAt(cell.gx, cell.gz)) {
        return {
          valid: false,
          reason:
            'Ordinary roads cannot be placed over water. Select Road Bridge mode in the Road Menu to cross water.',
          coveredCells,
          spec,
        };
      }

      const zoneCheck = this.districts.validateZoning(
        cell.gx,
        cell.gz,
        'ROAD'
      );
      if (!zoneCheck.allowed) {
        return {
          valid: false,
          reason: zoneCheck.reason,
          coveredCells,
          spec,
        };
      }

      if (zoneCheck.zone === ZoneCategory.RAIL_YARD) {
        requiresAuthorizedRailCrossing = true;
        crossingRowGz = cell.gz;
      }

      // Prevent player roads from encroaching onto the 20×8 reserved Truck Depot expansion footprint
      const cellEntities = this.entities.getEntitiesAtCell(cell.gx, cell.gz);
      if (
        cellEntities.some((e) => e.id === 'facility-starter-truck-depot') ||
        (cell.gx >= 38 && cell.gx <= 57 && cell.gz >= 45 && cell.gz <= 52)
      ) {
        return {
          valid: false,
          reason:
            'Cell is inside the reserved 20×8 expansion property of the Westgate Truck Depot. Connect roads along the southern gate frontage (gz = 53..55).',
          coveredCells,
          spec,
        };
      }
    }

    return {
      valid: true,
      coveredCells,
      spec,
      requiresAuthorizedRailCrossing,
      crossingRowGz,
    };
  }

  /**
   * Commits a validated road segment into the authoritative road network.
   */
  public buildRoad(
    start: GridCoord,
    end: GridCoord,
    widthConfig: RoadWidthConfig,
    shape: 'STRAIGHT' | 'CURVED' = 'STRAIGHT',
    controlPoint?: GridCoord
  ): {
    success: boolean;
    reason?: string;
    segment?: RoadSegmentRecord;
  } {
    const validation = this.validateRoadPlacement(
      start,
      end,
      widthConfig,
      shape,
      controlPoint
    );
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    const id = `road-player-${this.nextRoadSeq++}`;
    const effectiveControl =
      shape === 'CURVED'
        ? controlPoint ?? { gx: end.gx, gz: start.gz }
        : undefined;

    let crossingId: string | undefined;
    if (
      validation.requiresAuthorizedRailCrossing &&
      validation.crossingRowGz !== undefined &&
      this.onRailCrossingConstructed
    ) {
      crossingId = this.onRailCrossingConstructed(
        id,
        validation.crossingRowGz,
        widthConfig
      );
    }

    const segment: RoadSegmentRecord = {
      id,
      shape,
      widthConfig,
      spec: validation.spec,
      start: { ...start },
      end: { ...end },
      controlPoint: effectiveControl ? { ...effectiveControl } : undefined,
      coveredCells: validation.coveredCells,
      connectedRoadIds: [],
      junctionIds: [],
      isHighway: false,
      isPreplaced: false,
      isConnectedToHighway: false,
      canSpawnTraffic: false,
      crossingId,
    };

    this.registerRoadInternal(segment);
    this.recomputeConnectivityAndJunctions();

    return {
      success: true,
      segment: this.segments.get(id),
    };
  }

  /**
   * Demolishes a road segment completely (logical data, connectivity, junctions, entity record).
   * Protects the pre-placed Extreme-Right Highway and Central Roundabout from accidental removal.
   */
  public demolishRoad(roadId: string): {
    success: boolean;
    reason?: string;
    removedCells?: GridCoord[];
  } {
    const seg = this.segments.get(roadId);
    if (!seg) {
      return { success: false, reason: `Road ${roadId} does not exist.` };
    }
    if (seg.isHighway || seg.shape === 'ROUNDABOUT_RING') {
      return {
        success: false,
        reason:
          'Primary world Highway and Central Roundabout cannot be demolished.',
      };
    }

    const removedCells = seg.coveredCells.map((c) => ({ ...c }));

    // Unindex cells
    for (const c of seg.coveredCells) {
      const key = this.cellKey(c.gx, c.gz);
      const set = this.cellToRoadIds.get(key);
      if (set) {
        set.delete(roadId);
        if (set.size === 0) {
          this.cellToRoadIds.delete(key);
        }
      }
    }

    if (seg.crossingId && this.onRailCrossingRemoved) {
      this.onRailCrossingRemoved(roadId);
    }

    this.segments.delete(roadId);
    this.entities.unregister(roadId);
    this.recomputeConnectivityAndJunctions();

    return {
      success: true,
      removedCells,
    };
  }

  /**
   * Allows BridgeSystem to link a road bridge's connected road endpoints for highway connectivity.
   */
  private externalBridgeLinks: Array<{ roadIdA: string; roadIdB: string }> = [];

  public setExternalBridgeLinks(
    links: Array<{ roadIdA: string; roadIdB: string }>
  ): void {
    this.externalBridgeLinks = links;
    this.recomputeConnectivityAndJunctions();
  }

  /**
   * Recomputes explicit logical connectivity between road segments, junctions,
   * and BFS traversal from the main Highway to determine traffic eligibility.
   */
  public recomputeConnectivityAndJunctions(): void {
    for (const seg of this.segments.values()) {
      seg.connectedRoadIds = [];
      seg.junctionIds = [];
      seg.isConnectedToHighway = seg.isHighway;
      seg.canSpawnTraffic = seg.isHighway;
    }

    // Remove dynamic junctions (keep roundabout junctions)
    for (const [jid, junc] of this.junctions.entries()) {
      if (!junc.isRoundabout) {
        this.junctions.delete(jid);
      } else if (jid === 'junction-roundabout-highway-interchange') {
        junc.approachingRoadIds = ['roundabout-highway-interchange'];
        junc.approachWidths = { 'roundabout-highway-interchange': '3x3' };
      } else {
        junc.approachingRoadIds = ['roundabout-central'];
        junc.approachWidths = { 'roundabout-central': '3x3' };
      }
    }

    const allSegments = Array.from(this.segments.values());

    // Detect logical adjacency (shared or orthogonally touching cells)
    for (let i = 0; i < allSegments.length; i++) {
      const a = allSegments[i];
      for (let j = i + 1; j < allSegments.length; j++) {
        const b = allSegments[j];
        const touch = this.findSharedOrAdjacentCoord(a, b);
        if (touch) {
          if (!a.connectedRoadIds.includes(b.id)) a.connectedRoadIds.push(b.id);
          if (!b.connectedRoadIds.includes(a.id)) b.connectedRoadIds.push(a.id);

          if (a.id === 'roundabout-central' || b.id === 'roundabout-central') {
            const rJunc = this.junctions.get('junction-roundabout-central');
            const other = a.id === 'roundabout-central' ? b : a;
            if (rJunc) {
              if (!rJunc.approachingRoadIds.includes(other.id)) {
                rJunc.approachingRoadIds.push(other.id);
              }
              rJunc.approachWidths[other.id] = other.widthConfig;
            }
            if (!a.junctionIds.includes('junction-roundabout-central')) {
              a.junctionIds.push('junction-roundabout-central');
            }
            if (!b.junctionIds.includes('junction-roundabout-central')) {
              b.junctionIds.push('junction-roundabout-central');
            }
          } else if (
            a.id === 'roundabout-highway-interchange' ||
            b.id === 'roundabout-highway-interchange'
          ) {
            const hwRJunc = this.junctions.get(
              'junction-roundabout-highway-interchange'
            );
            const other = a.id === 'roundabout-highway-interchange' ? b : a;
            if (hwRJunc) {
              if (!hwRJunc.approachingRoadIds.includes(other.id)) {
                hwRJunc.approachingRoadIds.push(other.id);
              }
              hwRJunc.approachWidths[other.id] = other.widthConfig;
            }
            if (
              !a.junctionIds.includes('junction-roundabout-highway-interchange')
            ) {
              a.junctionIds.push('junction-roundabout-highway-interchange');
            }
            if (
              !b.junctionIds.includes('junction-roundabout-highway-interchange')
            ) {
              b.junctionIds.push('junction-roundabout-highway-interchange');
            }
          } else {
            const jId = `junction-${touch.gx}-${touch.gz}`;
            let junc = this.junctions.get(jId);
            if (!junc) {
              junc = {
                id: jId,
                center: { ...touch },
                approachingRoadIds: [],
                approachWidths: {},
                isRoundabout: false,
              };
              this.junctions.set(jId, junc);
            }
            if (!junc.approachingRoadIds.includes(a.id)) {
              junc.approachingRoadIds.push(a.id);
              junc.approachWidths[a.id] = a.widthConfig;
            }
            if (!junc.approachingRoadIds.includes(b.id)) {
              junc.approachingRoadIds.push(b.id);
              junc.approachWidths[b.id] = b.widthConfig;
            }
            if (!a.junctionIds.includes(jId)) a.junctionIds.push(jId);
            if (!b.junctionIds.includes(jId)) b.junctionIds.push(jId);
          }
        }
      }
    }

    // Apply external road-bridge links
    for (const link of this.externalBridgeLinks) {
      const a = this.segments.get(link.roadIdA);
      const b = this.segments.get(link.roadIdB);
      if (a && b) {
        if (!a.connectedRoadIds.includes(b.id)) a.connectedRoadIds.push(b.id);
        if (!b.connectedRoadIds.includes(a.id)) b.connectedRoadIds.push(a.id);
      }
    }

    // BFS from highway-extreme-right to set isConnectedToHighway & canSpawnTraffic
    const queue: string[] = [];
    const visited = new Set<string>();
    if (this.segments.has('highway-extreme-right')) {
      queue.push('highway-extreme-right');
      visited.add('highway-extreme-right');
    }

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const curr = this.segments.get(currId);
      if (!curr) continue;
      curr.isConnectedToHighway = true;
      curr.canSpawnTraffic = true;

      for (const nextId of curr.connectedRoadIds) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      }
    }

    // Sync roundabout and highway metadata
    const rJunc = this.junctions.get('junction-roundabout-central');
    if (rJunc && this.roundabout) {
      this.roundabout.connectedApproachIds = rJunc.approachingRoadIds.filter(
        (id) => id !== 'roundabout-central'
      );
    }
    const hwRJunc = this.junctions.get(
      'junction-roundabout-highway-interchange'
    );
    if (hwRJunc && this.highwayInterchangeRoundabout) {
      this.highwayInterchangeRoundabout.connectedApproachIds =
        hwRJunc.approachingRoadIds.filter(
          (id) => id !== 'roundabout-highway-interchange'
        );
    }
    const hwSeg = this.segments.get('highway-extreme-right');
    if (hwSeg && this.highway) {
      this.highway.connectedRoadIds = [...hwSeg.connectedRoadIds];
    }
  }

  private findSharedOrAdjacentCoord(
    a: RoadSegmentRecord,
    b: RoadSegmentRecord
  ): GridCoord | null {
    const bSet = new Set<string>();
    for (const c of b.coveredCells) {
      bSet.add(this.cellKey(c.gx, c.gz));
    }

    for (const ca of a.coveredCells) {
      if (bSet.has(this.cellKey(ca.gx, ca.gz))) {
        return ca;
      }
      // Check 4-connected neighbor cells
      const neighbors = [
        { gx: ca.gx + 1, gz: ca.gz },
        { gx: ca.gx - 1, gz: ca.gz },
        { gx: ca.gx, gz: ca.gz + 1 },
        { gx: ca.gx, gz: ca.gz - 1 },
      ];
      for (const nb of neighbors) {
        if (bSet.has(this.cellKey(nb.gx, nb.gz))) {
          return ca;
        }
      }
    }
    return null;
  }

  public areRoadsConnected(roadIdA: string, roadIdB: string): boolean {
    if (roadIdA === roadIdB) return this.segments.has(roadIdA);
    const visited = new Set<string>();
    const queue = [roadIdA];
    visited.add(roadIdA);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      if (currId === roadIdB) return true;
      const seg = this.segments.get(currId);
      if (!seg) continue;
      for (const nextId of seg.connectedRoadIds) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      }
    }
    return false;
  }

  public getRoadAtCell(gx: number, gz: number): RoadSegmentRecord | undefined {
    const set = this.cellToRoadIds.get(this.cellKey(gx, gz));
    if (!set || set.size === 0) return undefined;
    // Prefer player-built or non-roundabout road for selection/demolition
    for (const id of set) {
      const seg = this.segments.get(id);
      if (seg && !seg.isHighway && seg.shape !== 'ROUNDABOUT_RING') {
        return seg;
      }
    }
    const firstId = set.values().next().value;
    return firstId ? this.segments.get(firstId) : undefined;
  }

  public getAllSegments(): RoadSegmentRecord[] {
    return Array.from(this.segments.values());
  }

  public getSegment(id: string): RoadSegmentRecord | undefined {
    return this.segments.get(id);
  }

  public getAllJunctions(): RoadJunctionRecord[] {
    return Array.from(this.junctions.values());
  }

  public getHighway(): HighwayRecord {
    return this.highway;
  }

  public getRoundabout(): RoundaboutRecord {
    return this.roundabout;
  }

  public getHighwayInterchangeRoundabout(): RoundaboutRecord {
    return this.highwayInterchangeRoundabout;
  }

  public getAllRoundabouts(): RoundaboutRecord[] {
    return [this.roundabout, this.highwayInterchangeRoundabout];
  }
}
