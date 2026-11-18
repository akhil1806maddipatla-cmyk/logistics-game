/**
 * Comprehensive Automated Validation & Integration Tests for Global Transport Empire
 * Covers Master Prompts 1, 2, 3, 4, and 5 using Node's built-in test runner.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultWorldConfig,
  RailCorridorSection,
  ROAD_SPECS,
  TerrainCategory,
  WaterClassification,
  ZoneCategory,
} from './WorldConfig';
import { ForestDensityLevel } from './TerrainWaterSystem';
import { WorldManager } from './WorldManager';
import {
  GTE_FORKLIFT_MODEL_360_SPEC,
  GTE_ROLLING_STOCK_SPEC,
  RAIL_ELEVATION_LAYERS,
  RAILWAY_YARD_RESERVED_FOOTPRINT,
} from './RailwaySystem';
import {
  decodeCoordKey64BigInt,
  decodeCoordKey64Hex,
  encodeCoordKey64BigInt,
  encodeCoordKey64Hex,
  formatHighPrecisionCoordKey,
  INFINITE_WORLD_MAX_COORD_UNITS,
  ORIGIN_REBASE_THRESHOLD_METERS,
  parseHighPrecisionCoordKey,
} from './WorldStreamingAndPrecisionSystem';
import {
  MAIN_BUILD_CATEGORIES,
  simplifyPlacementReason,
  formatFriendlyVehicleState,
  formatFriendlyZoneName,
} from '../components/TycoonVisuals';
import {
  AIR_CARGO_MATERIAL_SPECS,
  AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS,
  AIRCRAFT_HANGAR_PURCHASE_COST,
  AIRPORT_CARGO_CAPACITY_TONS_BY_LEVEL,
  AIRPORT_INTERMEDIATE_EXPANSION_LEVEL,
  AIRPORT_INTERMEDIATE_FOOTPRINT,
  AIRPORT_LEVEL_1_FOOTPRINT,
  AIRPORT_LEVEL_20_FOOTPRINT,
  AIRPORT_MAX_CARGO_CAPACITY_TONS,
  AIRPORT_MAX_LEVEL,
  AIRPORT_MAX_PARKING_AREAS,
  AIRPORT_MIN_CARGO_CAPACITY_TONS,
  AIRPORT_PARKING_AREA_BASE_PRICE,
  AIRPORT_PARKING_AREA_PRICE_INCREMENT_PER_LEVEL,
  AIRPORT_RESERVED_FOOTPRINT,
  AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT,
  AIRPORT_UPGRADE_COST_INCREMENT_PER_LEVEL,
  AIRPORT_UPGRADE_LEVEL_2_COST,
  ALL_APRON_STAND_IDS,
  computeAircraftNoseForwardYaw,
  FIRST_OWNED_AIRCRAFT_PRICE,
  FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL,
  FIVE_REAL_WORLD_DAYS_MS,
  getAircraftEfficiencyMultiplier,
  getAirportActiveBoundsForLevel,
  getAirportCargoCapacityForLevel,
  getAirportParkingAreaPriceForLevel,
  getAirportUnlockedStandsForLevel,
  getAirportUpgradeCostForLevel,
  getNextOwnedAircraftPurchaseRequirement,
  GUEST_AIRCRAFT_CATALOGUE,
  MAX_OWNED_AIRCRAFT,
  MAX_PLAYER_AIRCRAFT,
  SECOND_OWNED_AIRCRAFT_PRICE,
  SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL,
} from './AirportSystem';
import {
  clampCameraPanningBounds,
  COASTAL_PALETTE_STANDARDS,
  computeLodTierForDistance,
  getGraphicsQualitySpec,
  getWaterQualityConfig,
  GRAPHICS_QUALITY_PRESETS,
  parseGraphicsQualityPreset,
  PBR_SURFACE_STANDARDS,
  shouldShowDetailForTier,
  validatePbrSurfaceStandards,
} from './GraphicsQualitySystem';

test('Master Prompt 1: Authoritative Grid, Coordinates, Entities, Expansion & Save/Load', async (t) => {
  await t.test('Coordinate conversions, cell centers, bounds, and footprints behave consistently', () => {
    const world = new WorldManager();
    const { grid, config } = world;

    assert.equal(config.gridWidth, 6000);
    assert.equal(config.gridDepth, 5060);
    assert.equal(config.minGx, -2740);
    assert.equal(config.maxGx, 3259);
    assert.equal(config.minGz, -2330);
    assert.equal(config.maxGz, 2729);
    assert.equal(config.cellSize, 2.0);

    // Cell (0, 0) center and bounds
    const c0 = grid.gridToWorld(0, 0);
    assert.equal(c0.x, config.originX + 1.0);
    assert.equal(c0.z, config.originZ + 1.0);

    const back0 = grid.worldToGrid(c0.x, c0.z);
    assert.deepEqual(back0, { gx: 0, gz: 0 });

    const b0 = grid.getCellBounds(0, 0);
    assert.equal(b0.minX, config.originX);
    assert.equal(b0.maxX, config.originX + 2.0);
    assert.equal(b0.centerX, c0.x);

    // Boundary & invalid coordinate checks across [-2740..3259, -2330..2729]
    assert.equal(grid.isValidGridCoord(-2741, 0), false);
    assert.equal(grid.isValidGridCoord(0, -2331), false);
    assert.equal(grid.isValidGridCoord(-2740, -2330), true);
    assert.equal(grid.isValidGridCoord(3260, 50), false);
    assert.equal(grid.isValidGridCoord(50, 2730), false);
    assert.equal(grid.isValidGridCoord(3259, 2729), true);
    assert.equal(grid.isValidGridCoord(12.5, 10), false);

    // Multi-cell footprint with orientation swap
    const fp0 = grid.getFootprint(10, 20, 3, 2, 0);
    assert.equal(fp0.valid, true);
    assert.equal(fp0.cells.length, 6);
    const fp90 = grid.getFootprint(10, 20, 3, 2, 90);
    assert.equal(fp90.valid, true);
    assert.equal(fp90.bounds.maxX - fp90.bounds.minX, 2 * config.cellSize);
    assert.equal(fp90.bounds.maxZ - fp90.bounds.minZ, 3 * config.cellSize);
  });

  await t.test('World expansion preserves existing cell world coordinates, entities, and parcel IDs', () => {
    const world = new WorldManager();
    const beforeCenter = world.grid.gridToWorld(86, 55);
    const beforeEntitiesCount = world.entities.getAll().length;
    const starterParcel = world.parcels.getParcelAt(25, 50);
    assert.ok(starterParcel);

    const exp = world.expandWorld(20, 20);
    assert.equal(exp.success, true);
    assert.equal(world.config.gridWidth, 6020);
    assert.equal(world.config.gridDepth, 5080);

    const afterCenter = world.grid.gridToWorld(86, 55);
    assert.deepEqual(afterCenter, beforeCenter);
    assert.equal(world.entities.getAll().length, beforeEntitiesCount);

    const afterParcel = world.parcels.getParcelAt(25, 50);
    assert.equal(afterParcel?.id, starterParcel.id);
  });

  await t.test('World state serialization and reconstruction work and invalid saves produce diagnostics', () => {
    const world1 = new WorldManager();
    const roadBuild = world1.roads.buildRoad(
      { gx: 75, gz: 40 },
      { gx: 82, gz: 40 },
      '2x2',
      'STRAIGHT'
    );
    assert.equal(roadBuild.success, true);

    const savedJson = world1.serializeState();
    const world2 = new WorldManager();
    const loadRes = world2.deserializeState(savedJson);
    assert.equal(loadRes.success, true);

    const loadedRoad = world2.roads.getRoadAtCell(78, 40);
    assert.ok(loadedRoad);
    assert.equal(loadedRoad.widthConfig, '2x2');

    // Invalid save check
    const badLoad = world2.deserializeState('{"schemaVersion": 999}');
    assert.equal(badLoad.success, false);
    assert.ok(badLoad.error && badLoad.error.length > 0);
  });
});

test('Master Prompt 2: Natural Terrain, Continuous Rivers, Lakes, Ocean, Coastlines & Islands', async (t) => {
  const world = new WorldManager();
  const tw = world.terrainWater;

  await t.test('Deterministic geography produces identical terrain and elevation across instances', () => {
    const worldB = new WorldManager(createDefaultWorldConfig());
    for (let gz = 0; gz < 120; gz += 15) {
      for (let gx = 0; gx < 160; gx += 15) {
        assert.equal(
          tw.getElevationAtGrid(gx, gz),
          worldB.terrainWater.getElevationAtGrid(gx, gz)
        );
        assert.equal(
          tw.getWaterClassificationAt(gx, gz),
          worldB.terrainWater.getWaterClassificationAt(gx, gz)
        );
      }
    }
    assert.equal(tw.getElevationAtGrid(-2745, 10), null);
  });

  await t.test('Continuous river connects Emerald Lake to Southern Ocean with coherent widths', () => {
    const lakes = tw.getLakes();
    assert.ok(lakes.length >= 2);
    assert.equal(lakes[0].id, 'lake-emerald');
    assert.ok(lakes[0].cells.length > 40);
    assert.equal(
      tw.getWaterClassificationAt(lakes[0].centerGx, lakes[0].centerGz),
      WaterClassification.LAKE
    );

    const rivers = tw.getRivers();
    assert.ok(rivers.length >= 2);
    const river = rivers[0];
    assert.equal(river.sourceWaterBodyId, 'lake-emerald');
    assert.equal(river.destinationWaterBodyId, 'ocean-main');
    assert.ok(river.nodes.length >= 75);

    // Check continuity along Z
    for (let i = 1; i < river.nodes.length; i++) {
      const prev = river.nodes[i - 1];
      const curr = river.nodes[i];
      assert.equal(curr.gz - prev.gz, 1);
      assert.ok(Math.abs(curr.gx - prev.gx) < 1.5, 'River has smooth continuous bends');
      assert.ok(curr.widthCells >= 3.0 && curr.widthCells <= 5.5);
    }
  });

  await t.test('Natural coastline is non-rectangular and logical islands are surrounded by ocean water', () => {
    const zAt20 = tw.getNaturalCoastlineZ(20);
    const zAt50 = tw.getNaturalCoastlineZ(50);
    const zAt80 = tw.getNaturalCoastlineZ(80);
    assert.notEqual(zAt20, zAt50);
    assert.notEqual(zAt50, zAt80);

    const islands = tw.getIslands();
    assert.ok(islands.length >= 4);
    for (const isl of islands) {
      assert.ok(isl.landCells.length > 35);
      assert.ok(isl.shorelineCells.length > 10);
      assert.equal(
        tw.isLandAt(isl.centerGx, isl.centerGz),
        true,
        `Island ${isl.id} center must be classified as Land`
      );
      assert.equal(
        tw.getTerrainCategoryAt(isl.centerGx, isl.centerGz) !==
          TerrainCategory.SUBMERGED,
        true
      );
    }
  });
});

test('Master Prompt 3: Road Network, 1x1/2x2/3x3 Lane Rules, Curved Roads, Roundabout, Highway & Demolition', async (t) => {
  await t.test('1x1 (2 lanes), 2x2 (4 lanes), and 3x3 (6 lanes) road configurations match specifications', () => {
    assert.equal(ROAD_SPECS['1x1'].totalLanes, 2);
    assert.equal(ROAD_SPECS['1x1'].dashedSeparatorsPerCarriageway, 0);
    assert.equal(ROAD_SPECS['2x2'].totalLanes, 4);
    assert.equal(ROAD_SPECS['2x2'].dashedSeparatorsPerCarriageway, 1);
    assert.equal(ROAD_SPECS['3x3'].totalLanes, 6);
    assert.equal(ROAD_SPECS['3x3'].dashedSeparatorsPerCarriageway, 2);
  });

  await t.test('Extreme-right 10-lane highway, central roundabout, and merge connectivity work', () => {
    const world = new WorldManager();
    const hw = world.roads.getHighway();
    assert.equal(hw.startX, 123);
    assert.equal(hw.endX, 134);
    assert.equal(hw.mainLanesTotal, 8);
    assert.equal(hw.mainLanesPerDirection, 4);
    assert.equal(hw.serviceRoadLanesTotal, 2);
    assert.equal(hw.totalLanes, 10);

    const rb = world.roads.getRoundabout();
    assert.deepEqual(rb.center, { gx: 86, gz: 55 });
    assert.ok(rb.connectedApproachIds.length >= 4);

    // Roundabout and East Merge are logically connected to the Highway
    assert.equal(
      world.roads.areRoadsConnected('roundabout-central', 'highway-extreme-right'),
      true
    );

    // Disconnected access road on the west side of the river does not spawn traffic automatically
    const westAccess = world.roads.getSegment('road-rail-yard-access');
    assert.ok(westAccess);
    assert.equal(westAccess.isConnectedToHighway, false);
    assert.equal(westAccess.canSpawnTraffic, false);
  });

  await t.test('Straight & curved road construction, validation, demolition cleanup, and rebuildability', () => {
    const world = new WorldManager();

    // Build a straight 3x3 road in the City Zone
    const straightRes = world.roads.buildRoad(
      { gx: 74, gz: 46 },
      { gx: 82, gz: 46 },
      '3x3',
      'STRAIGHT'
    );
    assert.equal(straightRes.success, true);
    assert.ok(straightRes.segment);
    assert.equal(straightRes.segment.spec.totalLanes, 6);

    // Build a curved 2x2 road
    const curveRes = world.roads.buildRoad(
      { gx: 92, gz: 62 },
      { gx: 98, gz: 68 },
      '2x2',
      'CURVED',
      { gx: 98, gz: 62 }
    );
    assert.equal(curveRes.success, true);
    assert.ok(curveRes.segment);

    // Demolish the straight road and verify complete cleanup + rebuildability
    const roadId = straightRes.segment.id;
    const demRes = world.roads.demolishRoad(roadId);
    assert.equal(demRes.success, true);
    assert.equal(world.roads.getSegment(roadId), undefined);
    assert.equal(world.entities.has(roadId), false);
    assert.equal(world.roads.getRoadAtCell(78, 46), undefined);

    // Rebuild on the demolished location
    const rebuildRes = world.roads.buildRoad(
      { gx: 74, gz: 46 },
      { gx: 82, gz: 46 },
      '1x1',
      'STRAIGHT'
    );
    assert.equal(rebuildRes.success, true);
  });
});

test('Master Prompt 4: Railway Corridor, 30+ Block Separation, Starter Yard, 6-Line Expansion & Crossings', async (t) => {
  const world = new WorldManager();
  const rail = world.railways;

  await t.test('Railway corridor is 15 blocks wide (5 facilities + 10 tracks) and >= 30 blocks from Core City', () => {
    const dims = rail.getCorridorDimensions();
    assert.equal(dims.startX, 20);
    assert.equal(dims.endX, 34);
    assert.equal(dims.totalWidthBlocks, 15);
    assert.equal(dims.facilitiesWidthBlocks, 5);
    assert.equal(dims.trackOpsWidthBlocks, 10);
    assert.ok(
      dims.citySeparationBlocks >= 30,
      `Expected >= 30 blocks separation, got ${dims.citySeparationBlocks}`
    );

    assert.equal(
      rail.getSectionAt(22, 50),
      RailCorridorSection.FACILITIES_AND_MACHINERY
    );
    assert.equal(
      rail.getSectionAt(28, 50),
      RailCorridorSection.TRACK_OPERATIONS
    );
  });

  await t.test('Starter yard has 1 track and 1 small depot, and supports progressive expansion up to 6 lines', () => {
    assert.equal(rail.getAllTracks().length, 1);
    assert.equal(rail.getAllDepots().length, 1);
    assert.equal(rail.getAllStations().length, 1);

    // Expand lines 2 through 6
    for (let line = 2; line <= 6; line++) {
      const exp = rail.expandNextParallelTrackLine();
      assert.equal(exp.success, true);
      assert.equal(exp.track?.lineNumber, line);
    }
    assert.equal(rail.getAllTracks().length, 6);

    // 7th line must be rejected
    const seventh = rail.expandNextParallelTrackLine();
    assert.equal(seventh.success, false);
  });

  await t.test('Zoning enforces Rail Yard vs City restrictions and designated road-rail crossings', () => {
    // Ordinary city building rejected in Rail Yard Zone
    const cityInRail = world.districts.validateZoning(24, 50, 'CITY_BUILDING');
    assert.equal(cityInRail.allowed, false);

    // Railway track rejected in City Zone
    const trackInCity = world.districts.validateZoning(80, 50, 'RAIL_TRACK');
    assert.equal(trackInCity.allowed, false);

    // Unauthorized road crossing across Rail Yard (e.g. row Z=50) is rejected
    const unauthorizedRoad = world.roads.buildRoad(
      { gx: 18, gz: 50 },
      { gx: 36, gz: 50 },
      '1x1',
      'STRAIGHT'
    );
    assert.equal(unauthorizedRoad.success, false);

    // Authorized road crossing at designated row Z=35 succeeds and registers crossing gates
    const authorizedRoad = world.roads.buildRoad(
      { gx: 18, gz: 35 },
      { gx: 36, gz: 35 },
      '2x2',
      'STRAIGHT'
    );
    assert.equal(authorizedRoad.success, true);
    const crossing35 = rail
      .getAllCrossings()
      .find((c) => c.rowGz === 35);
    assert.ok(crossing35);
    assert.equal(crossing35.hasGates, true);
    assert.equal(crossing35.roadId, authorizedRoad.segment?.id);
  });
});

test('Master Prompt 5: Road & Rail Bridges over Actual Water, and Starter Coastal Port & Harbour', async (t) => {
  const world = new WorldManager();
  const bp = world.bridgesAndPort;

  await t.test('No unnecessary prebuilt bridges exist at start; bridges must cross actual water', () => {
    assert.equal(bp.getAllBridges().length, 0);

    // Reject bridge over dry land in City Zone
    const dryBridge = bp.buildBridge(
      'ROAD_BRIDGE',
      { gx: 74, gz: 48 },
      { gx: 82, gz: 48 },
      '2x2'
    );
    assert.equal(dryBridge.success, false);

    // Build valid 2x2 Road Bridge across the Serpentine River at Z=55 (connecting gx=57 to gx=71)
    const riverBridge = bp.buildBridge(
      'ROAD_BRIDGE',
      { gx: 57, gz: 55 },
      { gx: 71, gz: 55 },
      '2x2'
    );
    assert.equal(riverBridge.success, true);
    assert.ok(riverBridge.bridge);
    assert.equal(riverBridge.bridge.roadWidthConfig, '2x2');
    assert.equal(riverBridge.bridge.roadSpec?.totalLanes, 4);
    assert.ok(riverBridge.bridge.waterCellsCrossed.length >= 3);

    // Once the bridge connects across the river at Z=55, the western rail access road is now connected to the highway!
    const westAccess = world.roads.getSegment('road-rail-yard-access');
    assert.equal(westAccess?.isConnectedToHighway, true);
    assert.equal(westAccess?.canSpawnTraffic, true);

    // Demolishing the bridge restores disconnected state and preserves underlying river water
    const dem = bp.demolishBridge(riverBridge.bridge.id);
    assert.equal(dem.success, true);
    assert.equal(bp.getAllBridges().length, 0);
    assert.equal(
      world.terrainWater.getWaterClassificationAt(65, 55),
      WaterClassification.RIVER
    );
  });

  await t.test('Starter Port & Harbour sits beside natural sea water, shifted left of highway, with land adjustments', () => {
    const port = bp.getPortHarbour();
    assert.equal(port.usesNaturalWater, true);
    assert.equal(port.artificialWaterCreated, false);
    assert.equal(port.distanceFromHighwayBlocks, 25);
    assert.equal(port.berths.length, 2);

    // Verify water entry directly south of berths is natural OCEAN water
    for (const berth of port.berths) {
      const midGx = Math.floor((berth.minGx + berth.maxGx) * 0.5);
      assert.equal(
        world.terrainWater.getWaterClassificationAt(midGx, berth.waterEntryGz),
        WaterClassification.OCEAN
      );
    }

    // Verify lower-side supporting land and small triangular seaport headland are recognized as LAND
    assert.equal(world.terrainWater.isLandAt(78, 99), true);
    assert.equal(world.terrainWater.isLandAt(101, 95), true);
  });
});

test('Master Prompt 6 & Economy/Simulation Overhaul: Economy, XP, 3-Slot Truck Depot, 5-Day Maintenance, 25 km/h Kinematics & Catalogues', async (t) => {
  await t.test('Starter Level 1 Truck Depot strictly enforces 3 mini-truck slots (4×3 footprint) and upgrades across 20 levels up to 15 slots (20×8 footprint)', () => {
    const world = new WorldManager();
    const econ = world.economy;

    // Initial state has 3 identical starter Mini Cargo Trucks and 3 slots on the Level 1 Truck Depot (+1 on Service Station = 4 total road slots)
    const depot = econ
      .getAllPlacedBuildings()
      .find((b) => b.id === 'facility-starter-truck-depot');
    assert.ok(depot);
    assert.equal(depot.level, 1);
    assert.equal(depot.maxLevel, 20);
    assert.equal(depot.widthCells, 4);
    assert.equal(depot.depthCells, 3);
    assert.equal(depot.vehicleSlotCapacity, 3);

    const initialCap = econ.getModalCapacitySummary('ROAD');
    assert.equal(initialCap.usedSlots, 3);

    // Purchase road vehicles up to capacity
    while (
      econ.getModalCapacitySummary('ROAD').usedSlots <
      econ.getModalCapacitySummary('ROAD').totalSlots
    ) {
      const buy = econ.purchaseVehicle('veh-road-sprinter-van');
      assert.equal(buy.success, true);
    }

    // Next road truck must be rejected when all road slots are full
    const buyOverflow = econ.purchaseVehicle('veh-road-sprinter-van');
    assert.equal(buyOverflow.success, false);
    assert.ok(buyOverflow.reason?.includes('occupied'));

    // Award XP so player reaches Level 2, then upgrade Starter Truck Depot to Level 2 -> depot capacity increases from 3 to 4 slots
    econ.awardXp(300, 'Reach Level 2 for Depot Upgrade');
    assert.ok(econ.getLevel() >= 2);

    const upg = econ.upgradeFacility('facility-starter-truck-depot');
    assert.equal(upg.success, true);
    assert.equal(upg.building?.level, 2);
    assert.equal(upg.building?.vehicleSlotCapacity, 4);

    // Now purchasing another truck succeeds
    const buyAfterUpg = econ.purchaseVehicle('veh-road-sprinter-van');
    assert.equal(buyAfterUpg.success, true);
  });

  await t.test('5-real-day scheduled vehicle maintenance interval is tracked, serviceable, and persisted in save state', () => {
    const world = new WorldManager();
    const econ = world.economy;
    const starterTruck = econ.getOwnedVehicles()[0];
    assert.ok(starterTruck);

    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
    assert.equal(
      starterTruck.nextMaintenanceTimestampMs - starterTruck.lastMaintenanceTimestampMs,
      fiveDaysMs
    );

    const moneyBefore = econ.getMoney();
    const maintRes = econ.performVehicleMaintenance(starterTruck.id);
    assert.equal(maintRes.success, true);
    assert.equal(econ.getMoney(), moneyBefore - starterTruck.maintenanceCost);
    assert.equal(starterTruck.conditionPercent, 100);
    assert.equal(
      starterTruck.nextMaintenanceTimestampMs - starterTruck.lastMaintenanceTimestampMs,
      fiveDaysMs
    );

    // Verify persistence across serialize/deserialize
    const saved = world.serializeState();
    const world2 = new WorldManager();
    const loadRes = world2.deserializeState(saved);
    assert.equal(loadRes.success, true);
    const loadedTruck = world2.economy.getOwnedVehicles()[0];
    assert.equal(
      loadedTruck.nextMaintenanceTimestampMs,
      starterTruck.nextMaintenanceTimestampMs
    );
  });

  await t.test('Road trucks cruise at 25 km/h with wheel rotation, trailer articulation, and offscreen simulation continuity', () => {
    const world = new WorldManager();
    const econ = world.economy;

    // All road vehicles in catalogue & fleet specify 25 km/h
    const starterTruck = econ.getOwnedVehicles()[0];
    assert.equal(starterTruck.targetCruisingSpeedKmh, 25);

    // Dispatch starter truck on the first road contract
    const roadContract = econ
      .getContracts()
      .find((c) => c.modal === 'ROAD' && c.cargoTons <= starterTruck.capacityTons);
    assert.ok(roadContract);

    const disp = econ.dispatchContract(roadContract.id, starterTruck.id);
    assert.equal(disp.success, true);
    assert.equal(starterTruck.state, 'EN_ROUTE_TO_WAREHOUSE');
    assert.equal(starterTruck.carryingCargoTons, 0);

    const startWheelRad = starterTruck.wheelRotationRad;
    // Step simulation by 10 seconds
    for (let i = 0; i < 20; i++) {
      econ.stepSimulation(0.5);
    }
    assert.ok(
      starterTruck.wheelRotationRad > startWheelRad,
      'Truck wheels rotate proportionally to distance traveled'
    );
    assert.ok(
      Number.isFinite(starterTruck.trailerWorldX) &&
        Number.isFinite(starterTruck.trailerWorldZ) &&
        Number.isFinite(starterTruck.trailerYaw),
      'Tractor-trailer articulation coordinates remain valid'
    );

    // Step simulation until the truck loads at Warehouse 1, reaches the motorway northern boundary (offscreen simulation), and completes contract
    const moneyBeforeComplete = econ.getMoney();
    const xpBeforeComplete = econ.getXp();
    let sawOffscreen = false;
    for (let i = 0; i < 800; i++) {
      econ.stepSimulation(0.1);
      if (econ.getOwnedVehicle(starterTruck.id)?.state === 'OFFSCREEN_SIMULATION') {
        sawOffscreen = true;
      }
    }
    assert.equal(
      sawOffscreen,
      true,
      'Truck seamlessly transitions into OFFSCREEN_SIMULATION when leaving the visible motorway'
    );
    assert.ok(
      econ.getMoney() > moneyBeforeComplete,
      'Completing the contract credits cash reward'
    );
    assert.ok(
      econ.getXp() > xpBeforeComplete,
      'Completing the contract awards XP'
    );
  });

  await t.test('Building placement, 60% demolition refund, and regional land acquisition work cleanly', () => {
    const world = new WorldManager();
    const econ = world.economy;

    // Purchase the North Highland City Expansion parcel (unlockLevel 1)
    const parcelPurchase = econ.purchaseLandParcel('parcel-city-north-highland');
    assert.equal(parcelPurchase.success, true);
    assert.equal(
      world.parcels.getParcelAt(74, 24)?.owned,
      true
    );

    // Build a Maple Suburban Residence inside the newly purchased parcel at (74, 24)
    const moneyBeforeBuild = econ.getMoney();
    const buildRes = econ.constructBuilding('bld-res-suburban-house', 74, 24, 0);
    assert.equal(buildRes.success, true);
    assert.ok(buildRes.building);
    assert.equal(econ.getMoney(), moneyBeforeBuild - 4500);

    // Demolish the player-built structure and verify 60% salvage refund
    const moneyBeforeDemolish = econ.getMoney();
    const demRes = econ.demolishBuilding(buildRes.building.id);
    assert.equal(demRes.success, true);
    assert.equal(demRes.refund, Math.round(4500 * 0.6));
    assert.equal(econ.getMoney(), moneyBeforeDemolish + Math.round(4500 * 0.6));
  });
});

test('Master Prompt 7: Gameplay Controls, Construction Menu Categories & Human-Friendly Feedback', async (t) => {
  await t.test('Main construction menu defines 7 clear visual categories', () => {
    assert.equal(MAIN_BUILD_CATEGORIES.length, 7);
    const ids = MAIN_BUILD_CATEGORIES.map((c) => c.id);
    assert.deepEqual(ids, [
      'ROADS',
      'BUILDINGS',
      'LOGISTICS',
      'RAILWAY',
      'AIRPORT',
      'HARBOUR',
      'LAND',
    ]);
  });

  await t.test('simplifyPlacementReason converts technical validation errors into simple game feedback', () => {
    assert.equal(simplifyPlacementReason(undefined), 'Area unsuitable for construction');
    assert.equal(
      simplifyPlacementReason('Requires water cells for bridge span'),
      'Cannot build on water'
    );
    assert.equal(
      simplifyPlacementReason('Requires owned land parcel at cell (74, 24)'),
      'Land not owned — purchase this plot first'
    );
    assert.equal(
      simplifyPlacementReason('Cell is outside compatible zone category'),
      'Wrong zone for this building'
    );
    assert.equal(
      simplifyPlacementReason('Cell already occupied by existing structure'),
      'Not enough space — area already occupied'
    );
    assert.equal(
      simplifyPlacementReason('Insufficient funds ($12,000 needed)'),
      'Not enough money for construction'
    );
  });

  await t.test('formatFriendlyVehicleState and formatFriendlyZoneName return clear game labels', () => {
    assert.equal(formatFriendlyVehicleState('IDLE_AT_DEPOT', 0).label, 'Parked · Ready');
    assert.equal(formatFriendlyVehicleState('MAINTENANCE_DUE', 0).label, 'Maintenance Due');
    assert.equal(formatFriendlyVehicleState('EN_ROUTE_TO_WAREHOUSE', 0).label, 'To Warehouse 1');
    assert.equal(formatFriendlyVehicleState('LOADING_AT_DOOR', 0.5).label, 'Loading Cargo');
    assert.equal(formatFriendlyVehicleState('WAITING_FOR_STOCK', 0).label, 'Waiting for Stock');
    assert.equal(formatFriendlyVehicleState('EN_ROUTE_OUTBOUND', 0.05).label, 'Loading Cargo');
    assert.equal(formatFriendlyVehicleState('EN_ROUTE_OUTBOUND', 0.5).label, 'Travelling');
    assert.equal(formatFriendlyVehicleState('OFFSCREEN_SIMULATION', 0.5).label, 'Delivering (Interstate)');
    assert.equal(formatFriendlyZoneName(ZoneCategory.LOGISTICS), 'Logistics & Depot Hub');
    assert.equal(formatFriendlyZoneName(ZoneCategory.CITY), 'Urban City District');
  });
});

test('Warehouse 1: Complete 20-Level Storage, 2–10 Doors, 2–10 Forklifts, 15-Block Separation & Truck Loading System', async (t) => {
  await t.test('Warehouse 1 is located 15 grid blocks from the core edge with 25×30 reserved property, 5×6 Level 1 building, and 1 access road', () => {
    const world = new WorldManager();
    const econ = world.economy;
    const wh = econ.getWarehouse('facility-warehouse-1');
    assert.ok(wh, 'Warehouse 1 must exist');

    // Nearest edge of core (gz=52) to nearest edge of Warehouse 1 reserved property (minGz=67) is 15 blocks
    assert.equal(econ.getCoreToWarehouseSeparationBlocks('facility-warehouse-1'), 15);
    assert.equal(wh.reservedMaxGx - wh.reservedMinGx + 1, 25);
    assert.equal(wh.reservedMaxGz - wh.reservedMinGz + 1, 30);
    assert.equal(wh.level, 1);
    assert.equal(wh.constructedWidthCells, 5);
    assert.equal(wh.constructedDepthCells, 6);

    // Single approved access road connects the starter depot road (gz=55) to Warehouse 1 north gate (gz=66)
    const accessRoad = world.roads.getSegment('road-warehouse-1-access');
    assert.ok(accessRoad, 'Approved truck access road must exist');
    assert.equal(accessRoad.widthConfig, '1x1');
  });

  await t.test('20-Level capacity formula, separate category enforcement, and 2–10 door & forklift progression work across Levels 1–20', () => {
    const world = new WorldManager();
    const econ = world.economy;

    // Level 1 exact capacities & counts
    const wh1 = econ.getWarehouse('facility-warehouse-1')!;
    assert.equal(Number(wh1.capacities.FOOD.toFixed(1)), 5.0);
    assert.equal(Number(wh1.capacities.INDUSTRIAL.toFixed(1)), 10.0);
    assert.equal(Number(wh1.capacities.PACKAGES.toFixed(1)), 2.0);
    assert.equal(wh1.operationalDoorCount, 2);
    assert.equal(wh1.operationalForkliftCount, 2);
    assert.equal(wh1.doors.filter((d) => d.unlocked).length, 2);
    assert.equal(wh1.forklifts.filter((f) => f.unlocked).length, 2);

    // Separate category limit enforcement: adding 10t of FOOD at Level 1 caps at 5.0t and does not use INDUSTRIAL capacity
    econ.setWarehouseInventory('facility-warehouse-1', {
      FOOD: 3.0,
      INDUSTRIAL: 4.0,
      PACKAGES: 1.5,
    });
    const addFood = econ.addWarehouseCargo('facility-warehouse-1', 'FOOD', 10.0);
    assert.equal(Number(addFood.addedTons.toFixed(1)), 2.0);
    assert.equal(Number(addFood.overflowTons.toFixed(1)), 8.0);
    assert.equal(Number(econ.getWarehouse('facility-warehouse-1')!.stored.FOOD.toFixed(1)), 5.0);
    assert.equal(Number(econ.getWarehouse('facility-warehouse-1')!.stored.INDUSTRIAL.toFixed(1)), 4.0);

    // Upgrade to Level 10 and verify exact formula values and preservation of stored cargo
    econ.setWarehouseLevel('facility-warehouse-1', 10, false);
    const wh10 = econ.getWarehouse('facility-warehouse-1')!;
    assert.equal(wh10.level, 10);
    assert.equal(Number(wh10.capacities.FOOD.toFixed(1)), 26.3);
    assert.equal(Number(wh10.capacities.INDUSTRIAL.toFixed(1)), 36.1);
    assert.equal(Number(wh10.capacities.PACKAGES.toFixed(1)), 29.5);
    assert.equal(wh10.operationalDoorCount, 6);
    assert.equal(wh10.operationalForkliftCount, 6);
    // Existing stored cargo was preserved during upgrade
    assert.equal(Number(wh10.stored.FOOD.toFixed(1)), 5.0);
    assert.equal(Number(wh10.stored.INDUSTRIAL.toFixed(1)), 4.0);
    assert.equal(Number(wh10.stored.PACKAGES.toFixed(1)), 1.5);

    // Upgrade to Level 20 and verify full 25×30 footprint, 10 doors, 10 forklifts, and 50/65/60t capacities
    econ.setWarehouseLevel('facility-warehouse-1', 20, true);
    const wh20 = econ.getWarehouse('facility-warehouse-1')!;
    assert.equal(wh20.level, 20);
    assert.equal(wh20.constructedWidthCells, 25);
    assert.equal(wh20.constructedDepthCells, 30);
    assert.equal(Number(wh20.capacities.FOOD.toFixed(1)), 50.0);
    assert.equal(Number(wh20.capacities.INDUSTRIAL.toFixed(1)), 65.0);
    assert.equal(Number(wh20.capacities.PACKAGES.toFixed(1)), 60.0);
    assert.equal(wh20.operationalDoorCount, 10);
    assert.equal(wh20.operationalForkliftCount, 10);
    assert.equal(wh20.doors.filter((d) => d.unlocked).length, 10);
    assert.equal(wh20.forklifts.filter((f) => f.unlocked).length, 10);
  });

  await t.test('Forklifts remain parked when idle and only move when a truck arrives with a real loading task', () => {
    const world = new WorldManager();
    const econ = world.economy;
    const wh = econ.getWarehouse('facility-warehouse-1')!;

    const initialPositions = wh.forklifts.map((f) => ({
      id: f.id,
      x: f.worldX,
      z: f.worldZ,
      state: f.state,
    }));

    // Step simulation for 15 seconds with no dispatched trucks
    for (let i = 0; i < 30; i++) {
      econ.stepSimulation(0.5);
    }

    const afterIdleWh = econ.getWarehouse('facility-warehouse-1')!;
    for (let i = 0; i < afterIdleWh.forklifts.length; i++) {
      const f = afterIdleWh.forklifts[i];
      assert.equal(f.state, 'IDLE_PARKED');
      assert.equal(f.worldX, initialPositions[i].x);
      assert.equal(f.worldZ, initialPositions[i].z);
    }
  });

  await t.test('Complete truck loading sequence: Depot (0t) -> Warehouse 1 -> Forklift Loading -> Destination -> Completion', () => {
    const world = new WorldManager();
    const econ = world.economy;

    const truck = econ.getOwnedVehicles().find((v) => v.modal === 'ROAD' && v.capacityTons >= 4)!;
    const contract = econ.getContracts().find((c) => c.id === 'contract-road-retail-1')!;
    assert.ok(truck);
    assert.ok(contract);
    assert.equal(contract.cargoCategory, 'FOOD');
    assert.equal(contract.cargoTons, 4);

    const foodBefore = econ.getWarehouse('facility-warehouse-1')!.stored.FOOD;
    assert.equal(foodBefore, 5.0);

    // 1. Dispatch truck -> starts at depot with 0 cargo and drives to Warehouse 1
    const disp = econ.dispatchContract(contract.id, truck.id);
    assert.equal(disp.success, true);
    assert.equal(truck.state, 'EN_ROUTE_TO_WAREHOUSE');
    assert.equal(truck.carryingCargoTons, 0);
    assert.equal(truck.cargoLoadedVerified, false);

    // 2. Step until truck docks and begins loading at a door with an active forklift
    let sawLoadingAtDoor = false;
    let sawActiveForklift = false;
    for (let i = 0; i < 150; i++) {
      econ.stepSimulation(0.1);
      const v = econ.getOwnedVehicle(truck.id)!;
      const wh = econ.getWarehouse('facility-warehouse-1')!;
      if (v.state === 'LOADING_AT_DOOR') {
        sawLoadingAtDoor = true;
      }
      if (wh.forklifts.some((f) => f.state !== 'IDLE_PARKED')) {
        sawActiveForklift = true;
      }
      if (v.state === 'EN_ROUTE_OUTBOUND') {
        break;
      }
    }

    assert.equal(sawLoadingAtDoor, true, 'Truck must dock and enter LOADING_AT_DOOR at Warehouse 1');
    assert.equal(sawActiveForklift, true, 'Forklift must physically activate to load the docked truck');

    // 3. Once truck transitions to EN_ROUTE_OUTBOUND, verify inventory was deducted and truck holds 4.0t FOOD
    const loadedTruck = econ.getOwnedVehicle(truck.id)!;
    assert.equal(loadedTruck.state, 'EN_ROUTE_OUTBOUND');
    assert.equal(loadedTruck.carryingCargoTons, 4);
    assert.equal(loadedTruck.carryingCargoCategory, 'FOOD');
    assert.equal(loadedTruck.cargoLoadedVerified, true);

    const foodAfterLoad = econ.getWarehouse('facility-warehouse-1')!.stored.FOOD;
    assert.equal(Number(foodAfterLoad.toFixed(1)), 1.0);
  });

  await t.test('Stock shortage never invents cargo: truck waits for stock until Warehouse 1 is restocked', () => {
    const world = new WorldManager();
    const econ = world.economy;

    // Empty FOOD inventory at Warehouse 1
    econ.setWarehouseInventory('facility-warehouse-1', { FOOD: 0 });
    const truck = econ.getOwnedVehicles().find((v) => v.modal === 'ROAD' && v.capacityTons >= 4)!;
    const contract = econ.getContracts().find((c) => c.id === 'contract-road-retail-1')!;

    const disp = econ.dispatchContract(contract.id, truck.id);
    assert.equal(disp.success, true);

    // Advance simulation until truck reaches Warehouse 1
    for (let i = 0; i < 80; i++) {
      econ.stepSimulation(0.2);
    }

    const waitingTruck = econ.getOwnedVehicle(truck.id)!;
    assert.equal(waitingTruck.state, 'WAITING_FOR_STOCK');
    assert.equal(waitingTruck.carryingCargoTons, 0, 'Cargo must never be silently invented when stock is 0');
    assert.equal(econ.getWarehouse('facility-warehouse-1')!.operationalStatus, 'STOCK_SHORTAGE');

    // Now restock Warehouse 1 -> truck automatically docks, loads, and departs
    const restock = econ.restockWarehouseInventory('facility-warehouse-1', 'FOOD', true);
    assert.equal(restock.success, true);

    for (let i = 0; i < 150; i++) {
      econ.stepSimulation(0.1);
      if (econ.getOwnedVehicle(truck.id)!.state === 'EN_ROUTE_OUTBOUND') {
        break;
      }
    }

    assert.equal(econ.getOwnedVehicle(truck.id)!.state, 'EN_ROUTE_OUTBOUND');
    assert.equal(econ.getOwnedVehicle(truck.id)!.carryingCargoTons, 4);
  });
});

test('Airport Development Prompts 1 & 2: 50×70 Reserved Airfield (30×40 Lv.1 -> 40×50 Lv.10 -> 50×70 Lv.20), 30+ Block Separation, Abandoned Prop, Lv.100/$15M Unlock, 20-Level Expansion & Physical Layout', async (t) => {
  await t.test('Main Airport reserves 50×70 blocks (3,500 cells) with 30×40 Level 1 active footprint (1,200 cells), >= 30 blocks from Core City, 10×15 Cargo Terminal + 18×6 Truck Yard, and separate 10×10 Warehouse & 10×10 Transfer Yard', () => {
    const world = new WorldManager();
    const airport = world.economy.getAirport();

    // 50 x 70 maximum airport reservation (70 longitudinal E-W x 50 perpendicular N-S = 3,500 cells)
    assert.equal(airport.reservedBounds.depthCells, 50);
    assert.equal(airport.reservedBounds.widthCells, 70);
    assert.equal(airport.reservedBounds.totalCells, 3500);
    assert.equal(
      (airport.reservedBounds.maxGx - airport.reservedBounds.minGx + 1) *
        (airport.reservedBounds.maxGz - airport.reservedBounds.minGz + 1),
      3500
    );

    // Level 1 active footprint is 30 x 40 blocks (1,200 cells), intermediate is 40 x 50 (2,000 cells)
    assert.equal(airport.level1FootprintBounds.depthCells, 30);
    assert.equal(airport.level1FootprintBounds.widthCells, 40);
    assert.equal(airport.level1FootprintBounds.totalCells, 1200);
    assert.equal(airport.intermediateFootprintBounds.depthCells, 40);
    assert.equal(airport.intermediateFootprintBounds.widthCells, 50);
    assert.equal(airport.intermediateFootprintBounds.totalCells, 2000);

    // Minimum 30-block separation from Core City (endX=104 to startX=152 is 48 blocks)
    assert.ok(
      airport.citySeparationBlocks >= 30,
      `Expected >= 30 blocks from Core City, got ${airport.citySeparationBlocks}`
    );
    assert.equal(
      world.districts.getCityToAirportSeparationBlocks(),
      airport.citySeparationBlocks
    );

    // Cargo Terminal inside airport is 10 x 15 blocks (150 cells) with expanded 18 x 6 Truck-Handling Area (108 cells)
    const term = airport.cargoTerminalBounds;
    assert.equal(term.widthCells, 15);
    assert.equal(term.depthCells, 10);
    assert.equal(term.totalCells, 150);

    const truckYard = airport.cargoTerminalTruckAreaBounds;
    assert.equal(truckYard.widthCells, 18);
    assert.equal(truckYard.depthCells, 6);
    assert.equal(truckYard.totalCells, 108);
    assert.equal(airport.cargoTerminalTruckYard.loadingDockBays.length, 6);
    assert.equal(airport.cargoTerminalTruckYard.queueSlots.length, 4);

    // Separate 10 x 10 Airport Cargo Warehouse (100 cells) & 10 x 10 Transfer Yard (100 cells)
    const whZone = airport.separateWarehouseBounds;
    const tyZone = airport.separateTransferYardBounds;
    assert.equal(whZone.widthCells, 10);
    assert.equal(whZone.depthCells, 10);
    assert.equal(whZone.totalCells, 100);
    assert.equal(tyZone.widthCells, 10);
    assert.equal(tyZone.depthCells, 10);
    assert.equal(tyZone.totalCells, 100);

    // Distinct facility IDs in EntityRegistry
    assert.ok(world.entities.has(airport.id));
    assert.ok(world.entities.has('facility-airport-cargo-terminal'));
    assert.ok(world.entities.has('facility-airport-terminal-truck-yard'));
    assert.ok(world.entities.has('facility-airport-warehouse'));
    assert.ok(world.entities.has('facility-airport-transfer-yard'));
  });

  await t.test('Land reservation strictly blocks ordinary city buildings, warehouses, truck depots, railways, and unauthorized roads', () => {
    const world = new WorldManager();

    // Check zoning rejection inside main 50x70 airport (165, 25 and expanded 215, 55), 10x10 warehouse (155, 48), and 10x10 transfer yard (165, 48)
    for (const [gx, gz] of [
      [165, 25],
      [215, 55],
      [155, 48],
      [165, 48],
    ] as const) {
      assert.equal(world.districts.isAirportReservedCell(gx, gz), true);
      assert.equal(
        world.districts.validateZoning(gx, gz, 'CITY_BUILDING').allowed,
        false
      );
      assert.equal(
        world.districts.validateZoning(gx, gz, 'RAIL_DEPOT').allowed,
        false
      );
      assert.equal(
        world.districts.validateZoning(gx, gz, 'RAIL_TRACK').allowed,
        false
      );
      assert.equal(
        world.districts.validateZoning(gx, gz, 'ROAD').allowed,
        false
      );

      // Economy building placement validation also rejects ordinary buildings & logistics facilities inside reserved airport land
      const bldVal = world.economy.validateBuildingPlacement(
        'bld-res-suburban-house',
        gx,
        gz,
        0
      );
      assert.equal(bldVal.valid, false);

      const whVal = world.economy.validateBuildingPlacement(
        'bld-ind-small-warehouse',
        gx,
        gz,
        0
      );
      assert.equal(whVal.valid, false);
    }

    // Road placement cutting through the runway is rejected
    const badRoad = world.roads.buildRoad(
      { gx: 155, gz: 16 },
      { gx: 185, gz: 16 },
      '1x1',
      'STRAIGHT'
    );
    assert.equal(badRoad.success, false);
  });

  await t.test('Starts abandoned & unowned with a stationary non-operational cargo aircraft prop ($0 revenue, not in ownedVehicles)', () => {
    const world = new WorldManager();
    const airport = world.economy.getAirport();

    assert.equal(airport.owned, false);
    assert.equal(airport.level, 0);
    assert.equal(airport.status, 'ABANDONED_LOCKED');
    assert.equal(airport.activeStandCount, 0);

    // Abandoned prop aircraft exists as a static prop, not an owned/dispatchable vehicle
    assert.ok(airport.abandonedAircraftProp);
    assert.equal(airport.abandonedAircraftProp.isVisualPropOnly, true);
    assert.equal(airport.abandonedAircraftProp.isDispatchable, false);
    assert.equal(airport.abandonedAircraftProp.generatesRevenue, false);
    assert.equal(
      world.economy
        .getOwnedVehicles()
        .some(
          (v) =>
            v.id === airport.abandonedAircraftProp?.id || v.modal === 'AIR'
        ),
      false
    );
  });

  await t.test('Unlocking & purchasing enforces XP Level 100 and $15,000,000 price, then transitions to Operational Level 1', () => {
    const world = new WorldManager();
    const econ = world.economy;

    // 1. Attempt purchase at Level 1 -> rejected with official locked label
    const buyLv1 = econ.purchaseAirport();
    assert.equal(buyLv1.success, false);
    assert.ok(
      buyLv1.reason?.includes('Regional Air Cargo Hub — Unlocks at XP Level 100')
    );

    // 2. Set player to XP Level 100, but with insufficient funds (< $15,000,000) -> rejected
    econ.setPlayerLevel(100);
    assert.equal(econ.getLevel(), 100);
    assert.equal(econ.getAirport().status, 'ABANDONED_UNLOCKED');

    const buyNoFunds = econ.purchaseAirport();
    assert.equal(buyNoFunds.success, false);
    assert.ok(buyNoFunds.reason?.includes('$15,000,000'));

    // 3. Add $20,000,000 and purchase at XP Level 100 -> deducts $15,000,000 once and transitions to Level 1
    econ.addMoney(20_000_000, 'Airport Test Funding');
    const moneyBefore = econ.getMoney();
    const buySuccess = econ.purchaseAirport();
    assert.equal(buySuccess.success, true);
    assert.equal(econ.getMoney(), moneyBefore - 15_000_000);

    const activeAirport = econ.getAirport();
    assert.equal(activeAirport.owned, true);
    assert.equal(activeAirport.level, 1);
    assert.equal(activeAirport.status, 'OPERATIONAL');
    assert.equal(activeAirport.activeStandCount, 1);
    assert.equal(activeAirport.abandonedAircraftProp, null);
    assert.equal(
      world.parcels.getParcelAt(170, 35)?.owned,
      true,
      'Airport parcel is marked owned after purchase'
    );

    // 4. Duplicate purchase attempt is rejected
    const buyDuplicate = econ.purchaseAirport();
    assert.equal(buyDuplicate.success, false);
  });

  await t.test('20-Level airport expansion unlocks 1 to 10 aircraft parking stands, requires $25M+ upgrades, and expands from 30×40 (1,200) -> 40×50 (2,000) -> 50×70 (3,500) cells at Level 20', () => {
    const world = new WorldManager();
    const econ = world.economy;
    econ.setPlayerLevel(100);
    econ.addMoney(200_000_000, 'Full 20-Level Airport Upgrade Funding');
    assert.equal(econ.purchaseAirport().success, true);

    // Level 1 -> 1 stand unlocked & purchased by default, 5t cargo capacity, 30x40 (1,200 cells)
    assert.equal(econ.getAirport().unlockedStandCount, 1);
    assert.equal(econ.getAirport().purchasedStandCount, 1);
    assert.equal(econ.getAirport().activeStandCount, 1);
    assert.equal(econ.getAirport().cargoCapacityTons, 5);
    assert.equal(econ.getAirport().activeConstructedBounds.depthCells, 30);
    assert.equal(econ.getAirport().activeConstructedBounds.widthCells, 40);
    assert.equal(econ.getAirport().activeConstructedBounds.totalCells, 1200);

    // Upgrade to Level 5 -> 3 stands unlocked
    econ.setAirportLevel(5);
    assert.equal(econ.getAirport().unlockedStandCount, 3);

    // Upgrade to Level 10 -> 5 stands unlocked, intermediate 40x50 (2,000 cells) milestone
    econ.setAirportLevel(10);
    assert.equal(econ.getAirport().unlockedStandCount, 5);
    assert.equal(econ.getAirport().activeConstructedBounds.depthCells, 40);
    assert.equal(econ.getAirport().activeConstructedBounds.widthCells, 50);
    assert.equal(econ.getAirport().activeConstructedBounds.totalCells, 2000);

    // Upgrade to Level 15 -> 7 stands unlocked
    econ.setAirportLevel(15);
    assert.equal(econ.getAirport().unlockedStandCount, 7);

    // Upgrade to Level 19 and use upgradeAirport() to reach Level 20 -> 10 stands unlocked, 50t cargo capacity & 50x70 = 3,500 active cells
    econ.setAirportLevel(19);
    const upg20 = econ.upgradeAirport();
    assert.equal(upg20.success, true);
    const ap20 = econ.getAirport();
    assert.equal(ap20.level, 20);
    assert.equal(ap20.unlockedStandCount, 10);
    assert.equal(ap20.cargoCapacityTons, 50);
    assert.equal(ap20.parkingStands.filter((s) => s.unlocked).length, 10);
    assert.equal(ap20.activeConstructedBounds.depthCells, 50);
    assert.equal(ap20.activeConstructedBounds.widthCells, 70);
    assert.equal(ap20.activeConstructedBounds.totalCells, 3500);

    // Level 21 upgrade is rejected
    assert.equal(econ.upgradeAirport().success, false);
  });

  await t.test('Prompt 2 Physical Layout: Runway, non-looping parallel taxiway turnoffs, ATC tower clearance, right-side freight road & save/load persistence', () => {
    const world = new WorldManager();
    const ap = world.economy.getAirport();
    const {
      runwayBounds,
      infieldGrassBounds,
      parallelTaxiwayBounds,
      apronBounds,
      cargoTerminalBounds,
      atcTowerBounds,
    } = ap;

    // Ordered N->S airside-to-landside hierarchy: Runway (14..18) -> Grass Infield (19..21) -> Parallel Taxiway (22..23) -> Apron (24..31) -> Cargo Terminal (32..41)
    assert.ok(runwayBounds.maxGz < infieldGrassBounds.minGz);
    assert.ok(infieldGrassBounds.maxGz < parallelTaxiwayBounds.minGz);
    assert.ok(parallelTaxiwayBounds.maxGz < apronBounds.minGz);
    assert.ok(apronBounds.maxGz < cargoTerminalBounds.minGz);

    // Parallel taxiway has 4 perpendicular turnoffs and NEVER loops around runway ends
    assert.equal(ap.taxiwayTurnoffs.length, 4);
    for (const turnoff of ap.taxiwayTurnoffs) {
      assert.ok(
        turnoff.minGx > runwayBounds.minGx &&
          turnoff.maxGx < runwayBounds.maxGx,
        `Turnoff ${turnoff.id} must connect inside runway interior and not loop around thresholds`
      );
      assert.equal(turnoff.crossesThreshold, false);
    }

    // ATC tower has dedicated footprint (157..160, 33..36) clear of runway, taxiway, and Cargo Terminal (164..178, 32..41)
    assert.ok(atcTowerBounds.maxGx < cargoTerminalBounds.minGx);
    assert.ok(atcTowerBounds.minGz > parallelTaxiwayBounds.maxGz);

    // Right-side airport freight road exists at gx=192 and connects to the highway/city road network
    const rightRoad = world.roads.getSegment('road-airport-freight-right');
    const frontageRoad = world.roads.getSegment('road-airport-landside-frontage');
    const connectorRoad = world.roads.getSegment('road-airport-city-connector');
    assert.ok(rightRoad, 'Right-side airport freight road must exist');
    assert.ok(frontageRoad, 'Airport landside frontage road must exist');
    assert.ok(connectorRoad, 'Airport-to-city connector road must exist');
    assert.equal(rightRoad.isConnectedToHighway, true);
    assert.equal(frontageRoad.isConnectedToHighway, true);
    assert.equal(rightRoad.widthConfig, '2x2');
    assert.equal(frontageRoad.widthConfig, '2x2');
    assert.equal(connectorRoad.widthConfig, '2x2');

    // Save/Load persistence of owned Level 12 airport
    world.economy.setPlayerLevel(100);
    world.economy.setAirportLevel(12);
    const saved = world.serializeState();

    const world2 = new WorldManager();
    const loadRes = world2.deserializeState(saved);
    assert.equal(loadRes.success, true);
    assert.equal(world2.economy.getAirport().owned, true);
    assert.equal(world2.economy.getAirport().level, 12);
    assert.equal(world2.economy.getAirport().unlockedStandCount, 6);
  });
});

test('Airport Development Prompts 3, 4, 5 & 6: Separate 10×10 Warehouse & Transfer Yard, GSE & ATC NPC Supply Drops, 2-Aircraft Limit & $5M Hangars, and Authoritative Nose-Forward Flight System', async (t) => {
  await t.test('Prompt 3: Separate 10×10 Airport Cargo Warehouse (6×6 at Lv.1 -> 10×10 at Lv.20), 10×10 Transfer Yard, independent inventory & transaction-safe dolly transfers', () => {
    const world = new WorldManager();
    const econ = world.economy;

    // Activate airport at Level 1
    econ.setPlayerLevel(100);
    econ.setAirportLevel(1);

    const apWhLv1 = econ.getAirportWarehouse();
    const apYard = econ.getAirportTransferYard();
    const cityWh1 = econ.getWarehouse('facility-warehouse-1')!;

    // Distinct facility identities & separate inventories from City Warehouse 1
    assert.equal(apWhLv1.id, 'facility-airport-warehouse');
    assert.equal(apYard.id, 'facility-airport-transfer-yard');
    assert.notEqual(apWhLv1.id, cityWh1.id);
    assert.equal(apWhLv1.reservedBounds.widthCells, 10);
    assert.equal(apWhLv1.reservedBounds.depthCells, 10);
    assert.equal(apWhLv1.reservedBounds.totalCells, 100);
    assert.equal(apWhLv1.constructedBounds.widthCells, 6);
    assert.equal(apWhLv1.constructedBounds.depthCells, 6);

    assert.equal(apYard.bounds.widthCells, 10);
    assert.equal(apYard.bounds.depthCells, 10);
    assert.equal(apYard.bounds.totalCells, 100);

    // Upgrade airport to Level 20 -> Airport Cargo Warehouse reaches full 10x10 constructed footprint
    econ.setAirportLevel(20);
    const apWhLv20 = econ.getAirportWarehouse();
    assert.equal(apWhLv20.constructedBounds.widthCells, 10);
    assert.equal(apWhLv20.constructedBounds.depthCells, 10);
    assert.equal(apWhLv20.constructedBounds.totalCells, 100);
    assert.equal(apWhLv20.loadingDocks.filter((d) => d.unlocked).length, 4);

    // Modifying Airport Warehouse inventory does NOT alter City Warehouse 1 inventory
    const cityFoodBefore = cityWh1.stored.FOOD;
    const foodWhBefore = apWhLv20.stored.FOOD;
    const foodYardBefore = econ.getAirportTransferYard().stagedCargo.FOOD;

    // Request a 3.0t FOOD transfer from Airport Cargo Warehouse to Airport Transfer Yard
    const req = econ.requestAirportWarehouseToYardTransfer('FOOD', 3.0);
    assert.equal(req.success, true);
    assert.ok(req.task);
    assert.equal(
      econ.getWarehouse('facility-warehouse-1')!.stored.FOOD,
      cityFoodBefore
    );

    // Step simulation until forklift + cargo dolly complete transfer
    let sawActiveDollyOrForklift = false;
    let completedCountBefore = econ.getAirportTransferYard().completedTransferCount;
    for (let i = 0; i < 120; i++) {
      econ.stepSimulation(0.1);
      const gse = econ.getAirportGseVehicles();
      if (gse.some((u) => u.state !== 'PARKED')) {
        sawActiveDollyOrForklift = true;
      }
      if (
        econ.getAirportTransferYard().completedTransferCount >
        completedCountBefore
      ) {
        break;
      }
    }

    assert.equal(
      sawActiveDollyOrForklift,
      true,
      'Forklift and Cargo Dolly must physically activate during Warehouse-to-Yard transfer'
    );
    assert.equal(
      Number(econ.getAirportWarehouse().stored.FOOD.toFixed(1)),
      Number((foodWhBefore - 3.0).toFixed(1))
    );
    assert.equal(
      Number(econ.getAirportTransferYard().stagedCargo.FOOD.toFixed(1)),
      Number((foodYardBefore + 3.0).toFixed(1))
    );

    // Transaction-safe cancellation: start another transfer and cancel mid-flight -> zero cargo loss or duplication
    const totalPackageBefore =
      econ.getAirportWarehouse().stored.PACKAGES +
      econ.getAirportWarehouse().reserved.PACKAGES +
      econ.getAirportTransferYard().stagedCargo.PACKAGES;
    const reqCancel = econ.requestAirportWarehouseToYardTransfer(
      'PACKAGES',
      2.0
    );
    assert.equal(reqCancel.success, true);
    econ.stepSimulation(0.2);
    const cancelRes = econ.cancelAirportTransferTask(reqCancel.task!.id);
    assert.equal(cancelRes.success, true);
    const totalPackageAfter =
      econ.getAirportWarehouse().stored.PACKAGES +
      econ.getAirportWarehouse().reserved.PACKAGES +
      econ.getAirportTransferYard().stagedCargo.PACKAGES;
    assert.equal(
      Number(totalPackageAfter.toFixed(2)),
      Number(totalPackageBefore.toFixed(2)),
      'Cancelling an in-progress transfer must restore reserved cargo without loss or duplication'
    );
  });

  await t.test('Prompt 4: Waypoints, 6 GSE categories (idle when parked), and ATC External NPC Supply Aircraft delivering free supplies', () => {
    const world = new WorldManager();
    const econ = world.economy;
    econ.setPlayerLevel(100);
    econ.setAirportLevel(20);

    // Verify all required named waypoints exist
    const wps = econ.getAirportWaypoints();
    for (const requiredWp of [
      'RUNWAY_ENTRY',
      'RUNWAY_EXIT',
      'APRON_BAY_1',
      'APRON_BAY_2',
      'APRON_BAY_3',
      'APRON_BAY_4',
      'APRON_BAY_5',
      'WAREHOUSE_YARD',
      'HANGAR_1',
      'HANGAR_2',
    ] as const) {
      assert.ok(
        wps.some((w) => w.id === requiredWp),
        `Missing airport waypoint ${requiredWp}`
      );
    }

    // Verify all 6 GSE categories exist and stay PARKED when idle
    const gseUnits = econ.getAirportGseVehicles();
    for (const cat of [
      'CARGO_LOADER',
      'AIRCRAFT_TUG',
      'FLATBED_CARGO_CART',
      'CARGO_DOLLY',
      'FUEL_TANKER',
      'FORKLIFT',
    ] as const) {
      assert.ok(
        gseUnits.some((u) => u.category === cat),
        `Missing GSE category ${cat}`
      );
    }
    for (const u of gseUnits) {
      assert.equal(u.state, 'PARKED');
    }

    // Request ATC External NPC Supply Aircraft arrival -> free of charge ($0 cost) and does NOT count toward player 2-aircraft limit
    const moneyBefore = econ.getMoney();
    const playerAirBefore = econ
      .getOwnedVehicles()
      .filter((v) => v.modal === 'AIR').length;
    const invBefore = { ...econ.getAirportWarehouse().stored };

    const npcRes = econ.requestAtcNpcSupplyArrival();
    assert.equal(npcRes.success, true);
    assert.ok(npcRes.aircraft);
    assert.equal(npcRes.aircraft.isPlayerOwned, false);
    assert.equal(econ.getMoney(), moneyBefore, 'NPC arrival request is free');

    // Step through landing, taxi-in, GSE unloading at apron stand, and takeoff departure
    let sawUnloadingAtStand = false;
    let sawDeliveryCompleted = false;
    for (let i = 0; i < 400; i++) {
      econ.stepSimulation(0.2);
      const npcs = econ.getNpcSupplyAircraft();
      const f = npcs[0];
      if (f?.flightStage === 'UNLOADING' || f?.flightStage === 'GSE_DISPATCH') {
        sawUnloadingAtStand = true;
      }
      if (f?.supplyManifest?.delivered) {
        sawDeliveryCompleted = true;
      }
      if (npcs.length === 0 && sawDeliveryCompleted) break;
    }

    assert.equal(
      sawUnloadingAtStand,
      true,
      'External NPC aircraft must land, taxi to apron stand, and unload with GSE'
    );
    assert.equal(
      sawDeliveryCompleted,
      true,
      'External NPC aircraft must complete free supply drop into Airport storage'
    );

    const invAfter = econ.getAirportWarehouse().stored;
    assert.ok(invAfter.MATERIALS > invBefore.MATERIALS);
    assert.ok(invAfter.FUEL > invBefore.FUEL);
    assert.ok(invAfter.ELECTRONICS > invBefore.ELECTRONICS);
    assert.ok(invAfter.PARTS > invBefore.PARTS);
    assert.ok(
      econ.getMoney() > moneyBefore,
      'NPC supply drop also grants bonus logistics grant cash'
    );
    assert.equal(
      econ.getOwnedVehicles().filter((v) => v.modal === 'AIR').length,
      playerAirBefore,
      'External NPC aircraft never counts toward player-owned aircraft fleet'
    );
  });

  await t.test('Prompt 5 & Part 2: Strict 2-aircraft limit ($20M at Lv.10, $30M at Lv.15), two $5M Hangars on dedicated tiles, mandatory hangar storage (IN_HANGAR), constant physical size, condition (<20% -> 50% penalty, 0% -> grounded), hangar repair & 5-day maintenance', () => {
    const world = new WorldManager();
    const econ = world.economy;
    econ.setPlayerLevel(100);
    econ.setAirportLevel(20);
    econ.addMoney(120_000_000, 'Aircraft & Hangar Test Funding');

    // 1. Aircraft Hangars start unconstructed, cost exact $5,000,000 each, and must be manually constructed on dedicated tiles (HANGAR_1 or HANGAR_2)
    const hangarsInitial = econ.getAircraftHangars();
    assert.equal(hangarsInitial.length, 2);
    assert.equal(hangarsInitial[0].constructed, false);
    assert.equal(hangarsInitial[1].constructed, false);
    assert.equal(hangarsInitial[0].constructionCost, 5_000_000);
    assert.equal(hangarsInitial[1].constructionCost, 5_000_000);

    // Attempting to place an Aircraft Hangar on an ordinary city tile or runway tile is rejected
    const badHangarPlacement = econ.validateBuildingPlacement(
      'bld-air-regional-hangar',
      100,
      50,
      0
    );
    assert.equal(badHangarPlacement.valid, false);

    // Validating & constructing HANGAR_1 and HANGAR_2 on their dedicated airport hangar plots (gx=176, gz=47 and gx=185, gz=47) succeeds
    const goodHangarPlacement = econ.validateBuildingPlacement(
      'bld-air-regional-hangar',
      176,
      47,
      0
    );
    assert.equal(goodHangarPlacement.valid, true);

    const buildH1 = econ.constructAircraftHangar('HANGAR_1');
    const buildH2 = econ.constructAircraftHangar('HANGAR_2');
    assert.equal(buildH1.success, true);
    assert.equal(buildH2.success, true);
    assert.equal(
      econ.getAircraftHangars().find((h) => h.id === 'HANGAR_1')?.constructed,
      true
    );
    assert.equal(
      econ.getAircraftHangars().find((h) => h.id === 'HANGAR_2')?.constructed,
      true
    );

    // 2. Purchase 2 player-owned cargo aircraft ($20,000,000 for 1st, $30,000,000 for 2nd) -> succeeds; 3rd purchase -> strictly rejected with $0 deducted
    assert.equal(MAX_PLAYER_AIRCRAFT, 2);
    assert.equal(MAX_OWNED_AIRCRAFT, 2);
    const cashBeforeP1 = econ.getMoney();
    const p1 = econ.purchaseVehicle('veh-air-turboprop-freighter');
    assert.equal(p1.success, true);
    assert.equal(econ.getMoney(), cashBeforeP1 - 20_000_000);

    const cashBeforeP2 = econ.getMoney();
    const p2 = econ.purchaseVehicle('veh-air-widebody-jet');
    assert.equal(p2.success, true);
    assert.equal(econ.getMoney(), cashBeforeP2 - 30_000_000);
    assert.equal(econ.getPlayerCargoAircraft().length, 2);

    const cashBefore3rd = econ.getMoney();
    const p3 = econ.purchaseVehicle('veh-air-turboprop-freighter');
    assert.equal(p3.success, false);
    assert.ok(p3.reason?.includes('Maximum player cargo aircraft fleet limit'));
    assert.equal(
      econ.getMoney(),
      cashBefore3rd,
      'Failed 3rd aircraft purchase must not deduct money'
    );

    // 3. Physical aircraft dimensions remain constant across all 20 airport levels while capacity scales with level
    const ac1 = econ.getPlayerCargoAircraft()[0];
    assert.equal(ac1.flightStage, 'IN_HANGAR', 'Idle player-owned aircraft is stored in its hangar');
    assert.equal(ac1.assignedHangarId, 'HANGAR_1');
    assert.deepEqual(ac1.dimensions, AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS);
    const capAtLv20 = ac1.effectiveCapacityTons;
    econ.setAirportLevel(1);
    const ac1Lv1 = econ.getPlayerCargoAircraft()[0];
    assert.deepEqual(
      ac1Lv1.dimensions,
      AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS,
      'Physical dimensions must remain constant across all airport levels'
    );
    assert.ok(
      capAtLv20 > ac1Lv1.effectiveCapacityTons,
      'Higher airport levels increase aircraft cargo capacity without changing physical size'
    );
    econ.setAirportLevel(20);

    // Material value hierarchy: PHARMACEUTICALS > METALS_AND_ORES > PLANT_AND_FOOD
    assert.ok(
      AIR_CARGO_MATERIAL_SPECS.PHARMACEUTICALS.baseValuePerTon >
        AIR_CARGO_MATERIAL_SPECS.METALS_AND_ORES.baseValuePerTon
    );
    assert.ok(
      AIR_CARGO_MATERIAL_SPECS.METALS_AND_ORES.baseValuePerTon >
        AIR_CARGO_MATERIAL_SPECS.PLANT_AND_FOOD.baseValuePerTon
    );

    // 4. Condition efficiency rules: >= 20% has 1.0x efficiency; < 20% (> 0%) has 0.5x efficiency; 0% has 0x efficiency and is grounded
    assert.equal(getAircraftEfficiencyMultiplier(100), 1.0);
    assert.equal(getAircraftEfficiencyMultiplier(20), 1.0);
    assert.equal(getAircraftEfficiencyMultiplier(19), 0.5);
    assert.equal(getAircraftEfficiencyMultiplier(1), 0.5);
    assert.equal(getAircraftEfficiencyMultiplier(0), 0);

    econ.setPlayerAircraftCondition(ac1.id, 15);
    const acLow = econ.getPlayerCargoAircraft().find((a) => a.id === ac1.id)!;
    assert.equal(acLow.conditionPercent, 15);
    assert.equal(acLow.flightEfficiencyMultiplier, 0.5);
    assert.equal(acLow.isGrounded, false);

    // At 0% condition, aircraft is strictly grounded and cannot be dispatched on a flight
    econ.setPlayerAircraftCondition(ac1.id, 0);
    const acZero = econ.getPlayerCargoAircraft().find((a) => a.id === ac1.id)!;
    assert.equal(acZero.isGrounded, true);
    const blockedFlight = econ.dispatchPlayerAircraftFlight(
      ac1.id,
      'PHARMACEUTICALS',
      5
    );
    assert.equal(blockedFlight.success, false);
    assert.ok(blockedFlight.reason?.includes('0% condition'));

    // 5. Hangar repair restores condition to 100% and clears grounded state & 5-real-world-day maintenance timer
    assert.equal(
      FIVE_REAL_WORLD_DAYS_MS,
      5 * 24 * 60 * 60 * 1000,
      'Periodic maintenance interval must be 5 real-world days'
    );
    const repairRes = econ.repairPlayerAircraftInHangar(ac1.id);
    assert.equal(repairRes.success, true);

    const acRepaired = econ
      .getPlayerCargoAircraft()
      .find((a) => a.id === ac1.id)!;
    assert.equal(acRepaired.conditionPercent, 100);
    assert.equal(acRepaired.isGrounded, false);
    assert.equal(acRepaired.maintenanceOverdue, false);
    assert.equal(acRepaired.flightEfficiencyMultiplier, 1.0);
    assert.equal(acRepaired.flightStage, 'IN_HANGAR');
  });

  await t.test('Prompt 6 & Part 2: Single authoritative movement controller, nose-forward orientation alignment, wheel rotation & full hangar-to-runway-to-hangar flight cycle', () => {
    // Verify nose-forward yaw math aligns local +Z nose vector (sin(yaw), cos(yaw)) with velocity vector (dx, dz)
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.707, 0.707],
      [-0.8, 0.6],
    ] as const) {
      const yaw = computeAircraftNoseForwardYaw(dx, dz);
      const noseX = Math.sin(yaw);
      const noseZ = Math.cos(yaw);
      const len = Math.hypot(dx, dz);
      const dot = (noseX * dx + noseZ * dz) / len;
      assert.ok(
        dot > 0.9999,
        `Aircraft nose vector must align with travel direction (${dx}, ${dz}), got dot=${dot}`
      );
    }

    const world = new WorldManager();
    const econ = world.economy;
    econ.setPlayerLevel(100);
    econ.setAirportLevel(20);
    econ.addMoney(50_000_000, 'Flight Cycle Test');

    assert.equal(econ.constructAircraftHangar('HANGAR_1').success, true);
    const buy = econ.purchaseVehicle('veh-air-widebody-jet');
    assert.equal(buy.success, true);
    const acId = buy.vehicle!.id;

    // Stored in HANGAR_1 when idle: speed is 0 and wheels are in contact with ground
    const parkedAc = econ.getPlayerCargoAircraft().find((a) => a.id === acId)!;
    assert.equal(parkedAc.flightStage, 'IN_HANGAR');
    assert.equal(parkedAc.assignedHangarId, 'HANGAR_1');
    assert.equal(parkedAc.currentSpeedMps, 0);
    assert.equal(parkedAc.wheelGroundContact, true);

    // Dispatch cargo flight -> verify full cycle:
    // IN_HANGAR -> PUSHBACK -> TAXI_TO_RUNWAY -> TAKEOFF_ROLL -> LIFTOFF/INITIAL_CLIMB -> OFFSCREEN_FLIGHT -> APPROACH/DESCENT -> TOUCHDOWN/ROLLOUT -> TAXI_TO_STAND -> RETURNING_TO_HANGAR -> IN_HANGAR
    const disp = econ.dispatchPlayerAircraftFlight(
      acId,
      'PHARMACEUTICALS',
      8
    );
    assert.equal(disp.success, true);

    const seenStages = new Set<string>();
    let prevPos = { x: parkedAc.worldX, z: parkedAc.worldZ };
    let prevWheelRot = parkedAc.wheelRotationRad;
    let verifiedRollingWheels = false;
    let verifiedNoseForwardDot = false;

    for (let i = 0; i < 650; i++) {
      econ.stepSimulation(0.2);
      const cur = econ.getPlayerCargoAircraft().find((a) => a.id === acId)!;
      seenStages.add(cur.flightStage);

      const dx = cur.worldX - prevPos.x;
      const dz = cur.worldZ - prevPos.z;
      const horizStep = Math.hypot(dx, dz);

      if (
        (cur.flightStage === 'TAXI_TO_RUNWAY' ||
          cur.flightStage === 'TAKEOFF_ROLL' ||
          cur.flightStage === 'ROLLOUT' ||
          cur.flightStage === 'TAXI_TO_STAND' ||
          cur.flightStage === 'RETURNING_TO_HANGAR') &&
        horizStep > 0.05
      ) {
        // Nose direction from cur.headingYaw must match horizontal displacement direction (no sideways movement)
        const noseX = Math.sin(cur.headingYaw);
        const noseZ = Math.cos(cur.headingYaw);
        const dot = (noseX * dx + noseZ * dz) / horizStep;
        assert.ok(
          dot > 0.98,
          `Expected nose-forward motion in stage ${cur.flightStage}, got dot=${dot}`
        );
        verifiedNoseForwardDot = true;

        if (cur.wheelRotationRad > prevWheelRot) {
          verifiedRollingWheels = true;
        }
      }

      prevPos = { x: cur.worldX, z: cur.worldZ };
      prevWheelRot = cur.wheelRotationRad;
      if (
        seenStages.has('RETURNING_TO_HANGAR') &&
        cur.flightStage === 'IN_HANGAR'
      ) {
        break;
      }
    }

    assert.equal(
      verifiedNoseForwardDot,
      true,
      'Verified nose-forward alignment during ground movement'
    );
    assert.equal(
      verifiedRollingWheels,
      true,
      'Verified wheel rotation during ground roll'
    );
    for (const expectedStage of [
      'PUSHBACK',
      'TAXI_TO_RUNWAY',
      'TAKEOFF_ROLL',
      'ROTATION',
      'LIFTOFF',
      'OFFSCREEN_FLIGHT',
      'APPROACH',
      'TOUCHDOWN',
      'TAXI_EXIT',
      'TAXI_TO_STAND',
      'RETURNING_TO_HANGAR',
      'IN_HANGAR',
    ]) {
      assert.ok(
        seenStages.has(expectedStage),
        `Flight state machine must traverse ${expectedStage}`
      );
    }

    // Condition wear was applied exactly once for the completed flight, and aircraft returned into HANGAR_1
    const finalAc = econ.getPlayerCargoAircraft().find((a) => a.id === acId)!;
    assert.equal(finalAc.completedFlightsCount, 1);
    assert.equal(finalAc.flightStage, 'IN_HANGAR');
    assert.equal(finalAc.assignedHangarId, 'HANGAR_1');
    assert.ok(finalAc.conditionPercent < 100 && finalAc.conditionPercent >= 85);
    assert.equal(
      finalAc.currentSpeedMps,
      0,
      'Aircraft stops once returned to its hangar'
    );
  });
});

test('Graphics Development Prompt 1: PBR Surface Standards, Quality Presets (Low/Medium/High/Ultra) & Distance-Based LOD', async (t) => {
  await t.test('All 16 PBR surface standards have physically valid roughness, metalness, and non-shiny calm water', () => {
    const validation = validatePbrSurfaceStandards();
    assert.equal(
      validation.valid,
      true,
      `Expected valid PBR surface standards, got issues: ${validation.errors.join(', ')}`
    );
    assert.ok(validation.totalMaterials >= 16);

    // Calm water must not have mirror-like low roughness that causes white specular glare spots
    assert.ok(PBR_SURFACE_STANDARDS.CALM_RIVER_WATER.roughness >= 0.5);
    assert.ok(PBR_SURFACE_STANDARDS.CALM_RIVER_WATER.metalness <= 0.1);

    // Concrete & asphalt are non-metallic with realistic medium-high roughness
    assert.ok(PBR_SURFACE_STANDARDS.APRON_WARM_CONCRETE.metalness <= 0.05);
    assert.ok(PBR_SURFACE_STANDARDS.APRON_WARM_CONCRETE.roughness >= 0.75);
    assert.ok(PBR_SURFACE_STANDARDS.RUNWAY_ASPHALT_DARK.metalness <= 0.05);
    assert.ok(PBR_SURFACE_STANDARDS.RUNWAY_ASPHALT_DARK.roughness >= 0.8);

    // Brushed aluminium ULD containers are metallic
    assert.ok(PBR_SURFACE_STANDARDS.BRUSHED_ALUMINIUM_ULD.metalness >= 0.65);
  });

  await t.test('Graphics quality presets (LOW, MEDIUM, HIGH, ULTRA) scale pixelRatio, shadowMapSize, anisotropy, and LOD distances', () => {
    assert.equal(parseGraphicsQualityPreset('ultra'), 'ULTRA');
    assert.equal(parseGraphicsQualityPreset('low'), 'LOW');
    assert.equal(parseGraphicsQualityPreset('invalid'), 'HIGH');

    const low = getGraphicsQualitySpec('LOW');
    const med = getGraphicsQualitySpec('MEDIUM');
    const high = getGraphicsQualitySpec('HIGH');
    const ultra = getGraphicsQualitySpec('ULTRA');

    assert.equal(low.shadowMapSize, 512);
    assert.equal(med.shadowMapSize, 1024);
    assert.equal(high.shadowMapSize, 2048);
    assert.equal(ultra.shadowMapSize, 4096);

    assert.ok(ultra.maxPixelRatio >= high.maxPixelRatio);
    assert.ok(high.maxAnisotropy > low.maxAnisotropy);
    assert.equal(low.enableContactShadows, false);
    assert.equal(high.enableContactShadows, true);
    assert.equal(ultra.enableContactShadows, true);
  });

  await t.test('Distance-based LOD tiers transition cleanly between NEAR, MID, and FAR', () => {
    assert.equal(computeLodTierForDistance(120, 'HIGH'), 'NEAR');
    assert.equal(computeLodTierForDistance(400, 'HIGH'), 'MID');
    assert.equal(computeLodTierForDistance(900, 'HIGH'), 'FAR');

    // Fine detail props only show in NEAR (or MID in ULTRA), secondary trim shows in NEAR and MID
    assert.equal(shouldShowDetailForTier('FINE_ROOF_AND_PROPS', 'NEAR', 'HIGH'), true);
    assert.equal(shouldShowDetailForTier('FINE_ROOF_AND_PROPS', 'MID', 'HIGH'), false);
    assert.equal(shouldShowDetailForTier('SECONDARY_TRIM', 'MID', 'HIGH'), true);
    assert.equal(shouldShowDetailForTier('SECONDARY_TRIM', 'FAR', 'HIGH'), false);
    assert.equal(shouldShowDetailForTier('PRIMARY_STRUCTURE', 'FAR', 'HIGH'), true);
  });
});

test('Massive World Expansion: 520×400 Logical World (208,000 Cells / +121,600 Added Blocks Across North, South, East, West), Chunked Terrain, 9 Multi-Species Forests, Frontier Lakes & Rivers, Tree Clearing & Infrastructure Preservation', async (t) => {
  await t.test('World-size tests: 6,000×5,060 open world (30,360,000 cells; +10,052,000 in Expansion 1, +10,040,000 in Expansion 2, and +10,060,000 in Expansion 3 = +30,152,000 cumulative added blocks over 520×400) while preserving cell(0,0) origin', () => {
    const world = new WorldManager();
    const { config, grid } = world;

    const legacyArea = config.legacyGridWidth * config.legacyGridDepth;
    const previousArea = config.previousGridWidth * config.previousGridDepth;
    const coreArea = (config.coreGridWidth ?? 520) * (config.coreGridDepth ?? 400);
    const expansion1Area =
      (config.expansion1GridWidth ?? 3600) * (config.expansion1GridDepth ?? 2850);
    const expansion2Area =
      (config.expansion2GridWidth ?? 5000) * (config.expansion2GridDepth ?? 4060);
    const expandedArea = config.gridWidth * config.gridDepth;
    const addedBlocksExpansion1 = expansion1Area - coreArea;
    const addedBlocksExpansion2 = expansion2Area - expansion1Area;
    const addedBlocksExpansion3 = expandedArea - expansion2Area;
    const cumulativeAddedBlocks = expandedArea - coreArea;

    assert.equal(legacyArea, 24000);
    assert.equal(previousArea, 20300000);
    assert.equal(coreArea, 208000);
    assert.equal(expansion1Area, 10260000);
    assert.equal(expansion2Area, 20300000);
    assert.equal(expandedArea, 30360000);
    assert.equal(addedBlocksExpansion1, 10052000);
    assert.equal(addedBlocksExpansion2, 10040000);
    assert.equal(addedBlocksExpansion3, 10060000);
    assert.equal(cumulativeAddedBlocks, 30152000);
    assert.ok(addedBlocksExpansion1 >= 10000000, 'Expansion 1 must add at least 10,000,000 new grid blocks');
    assert.ok(addedBlocksExpansion2 >= 10000000, 'Expansion 2 must add at least 10,000,000 additional grid blocks');
    assert.ok(addedBlocksExpansion3 >= 10000000, 'Expansion 3 must add at least 10,000,000 additional grid blocks');
    assert.equal(config.worldWidth, 12000);
    assert.equal(config.worldDepth, 10120);
    assert.equal(config.originX, -160);
    assert.equal(config.originZ, -120);

    // Distant North, South, East, and West cells across the 30.36M-block world are valid and convertible
    assert.equal(grid.isValidGridCoord(-2700, -2300), true);
    assert.equal(grid.isValidGridCoord(3200, 2700), true);
    assert.equal(grid.isValidGridCoord(340, 200), true);
    assert.equal(grid.isValidGridCoord(120, 185), true);
    assert.equal(grid.isValidGridCoord(-2741, 0), false);
    assert.equal(grid.isValidGridCoord(3260, 200), false);
    assert.equal(grid.isValidGridCoord(200, 2730), false);

    const wp = grid.gridToWorld(-2450, -1980);
    const back = grid.worldToGrid(wp.x, wp.z);
    assert.deepEqual(back, { gx: -2450, gz: -1980 });
  });

  await t.test('Terrain & Chunking tests: 130 active core chunks (40×40 cells) + 19,050 total streaming chunks cover the 6,000×5,060 world with deterministic hills and valleys', () => {
    const worldA = new WorldManager();
    const worldB = new WorldManager();
    const chunks = worldA.terrainWater.getTerrainChunks();

    // 520 / 40 = 13 chunks X, 400 / 40 = 10 chunks Z -> 130 active core chunks
    assert.equal(chunks.length, 130);
    assert.equal(worldA.terrainWater.getTotalWorldChunkCount(), 19050);

    let totalChunkCells = 0;
    for (const ch of chunks) {
      totalChunkCells += ch.landCellCount + ch.waterCellCount;
      assert.ok(ch.maxElevation >= ch.minElevation);
    }
    assert.equal(totalChunkCells, 520 * 400);

    // On-demand outer chunk lookup works across all 4 cardinal frontiers
    const outerNorthChunk = worldA.terrainWater.getChunkAtGrid(-1500, -1200);
    assert.ok(outerNorthChunk);
    assert.equal(outerNorthChunk.maxGx - outerNorthChunk.minGx + 1, 40);

    // Deterministic terrain across North, West, East, and South expanded sectors (including far continental coordinates)
    for (const [gx, gz] of [
      [-50, -40],
      [180, -55],
      [405, 50],
      [220, 60],
      [256, 34],
      [310, 140],
      [110, 175],
      [-1600, -1100],
      [2100, 1500],
      [-1400, 1400],
      [1950, -1250],
    ] as const) {
      assert.equal(
        worldA.terrainWater.getElevationAtGrid(gx, gz),
        worldB.terrainWater.getElevationAtGrid(gx, gz)
      );
      assert.equal(
        worldA.terrainWater.getTerrainCategoryAt(gx, gz),
        worldB.terrainWater.getTerrainCategoryAt(gx, gz)
      );
    }
  });

  await t.test('Forest tests: 9 named organic Forest Regions exist across the core and cardinal expansion zones with zero overlap with water or infrastructure', () => {
    const world = new WorldManager();
    const tw = world.terrainWater;
    const regions = tw.getForestRegions();

    assert.equal(regions.length, 9);
    const regionIds = regions.map((r) => r.id);
    assert.deepEqual(regionIds, [
      'forest-whispering-pines',
      'forest-northridge-highlands',
      'forest-silverpine-woods',
      'forest-emerald-valley-groves',
      'forest-southshore-woodlands',
      'forest-boreal-expanse',
      'forest-western-timberlands',
      'forest-eastern-highwoods',
      'forest-southern-cape-woods',
    ]);

    for (const reg of regions) {
      assert.ok(reg.coreCellCount > 40, `Forest ${reg.id} must have dense woodland core cells`);
      assert.ok(reg.transitionCellCount > 15, `Forest ${reg.id} must have organic transition edge cells`);
    }

    // Verify zero forest cells exist on water, roads, rail yard, core city, highway, port, or 50x70 airport across the core world
    const cMinGz = world.config.coreMinGz ?? -80;
    const cMaxGz = world.config.coreMaxGz ?? 319;
    const cMinGx = world.config.coreMinGx ?? -80;
    const cMaxGx = world.config.coreMaxGx ?? 439;
    for (let gz = cMinGz; gz <= cMaxGz; gz += 4) {
      for (let gx = cMinGx; gx <= cMaxGx; gx += 4) {
        const density = tw.getForestDensityAt(gx, gz);
        if (density !== ForestDensityLevel.NONE) {
          assert.equal(tw.isWaterAt(gx, gz), false, `Forest cell (${gx},${gz}) must not be on water`);
          assert.equal(
            world.districts.isAirportReservedCell(gx, gz),
            false,
            `Forest cell (${gx},${gz}) must not overlap reserved airport land`
          );
          const z = world.districts.getZoneAt(gx, gz);
          assert.notEqual(z, ZoneCategory.RAIL_YARD);
          assert.notEqual(z, ZoneCategory.HIGHWAY_RESERVED);
          assert.notEqual(z, ZoneCategory.PORT_RESERVED);
        }
      }
    }
  });

  await t.test('Water tests: Strict 5-River Rule enforced across the entire 20.3M-block world with 5 lakes and 4 islands', () => {
    const world = new WorldManager();
    const tw = world.terrainWater;

    const silverpineLake = tw.getLakes().find((l) => l.id === 'lake-silverpine');
    const borealLake = tw.getLakes().find((l) => l.id === 'lake-boreal');
    const westwoodLake = tw.getLakes().find((l) => l.id === 'lake-westwood');
    const eastgateLake = tw.getLakes().find((l) => l.id === 'lake-eastgate');
    assert.ok(silverpineLake, 'Silverpine Highland Lake must exist');
    assert.ok(borealLake, 'Boreal Frontier Lake must exist in North expansion');
    assert.ok(westwoodLake, 'Westwood Timber Lake must exist in West expansion');
    assert.ok(eastgateLake, 'Eastgate Ridge Lake must exist in East expansion');

    const rivers = tw.getRivers();
    assert.equal(rivers.length, 5, 'Strict 5-River Rule: world must have 5 major rivers in total');
    assert.deepEqual(
      rivers.map((r) => r.id),
      [
        'river-serpentine',
        'river-silverpine',
        'river-boreal',
        'river-westwood',
        'river-eastgate',
      ]
    );

    // 4 islands exist and ordinary building validation rejects water cells
    assert.equal(tw.getIslands().length, 4);
    assert.equal(
      tw.isBuildableLandForOrdinaryStructure(silverpineLake.centerGx, silverpineLake.centerGz),
      false
    );
  });

  await t.test('City, Infrastructure-preservation, Tree Clearing on Purchase & Zero Automatic Roads tests', () => {
    const world = new WorldManager();

    // Expanded East Metro Suburban District exists and allows player buildings & roads
    const eastSuburban = world.districts.getDistrictAt(115, 50);
    assert.ok(eastSuburban);
    assert.equal(eastSuburban.id, 'district-metro-east-suburban');
    assert.equal(eastSuburban.category, ZoneCategory.CITY);

    // Open owned plot inside expanded East Metro Suburban District (gx=110, gz=38) is immediately buildable
    const ownedOpenPlotVal = world.economy.validateBuildingPlacement(
      'bld-res-suburban-house',
      110,
      38,
      0
    );
    assert.equal(ownedOpenPlotVal.valid, true);

    // Purchasing a wooded frontier parcel automatically clears forest trees inside that parcel
    const borealParcel = world.parcels.getParcelAt(95, -35);
    assert.ok(borealParcel);
    assert.equal(borealParcel.id, 'parcel-north-boreal-charter');
    let forestCellsBefore = 0;
    for (let gz = borealParcel.minGz; gz <= borealParcel.maxGz; gz++) {
      for (let gx = borealParcel.minGx; gx <= borealParcel.maxGx; gx++) {
        if (world.terrainWater.getForestDensityAt(gx, gz) !== ForestDensityLevel.NONE) {
          forestCellsBefore++;
        }
      }
    }
    assert.ok(forestCellsBefore > 20, 'Unowned North Boreal parcel should contain forest trees before purchase');

    world.economy.setPlayerLevel(10);
    world.economy.addMoney(200_000, 'Frontier Purchase Test');
    assert.equal(
      world.economy.purchaseLandParcel('parcel-north-boreal-charter').success,
      true
    );

    let forestCellsAfter = 0;
    for (let gz = borealParcel.minGz; gz <= borealParcel.maxGz; gz++) {
      for (let gx = borealParcel.minGx; gx <= borealParcel.maxGx; gx++) {
        if (world.terrainWater.getForestDensityAt(gx, gz) !== ForestDensityLevel.NONE) {
          forestCellsAfter++;
        }
      }
    }
    assert.equal(forestCellsAfter, 0, 'All forest trees inside purchased parcel must be cleared upon purchase');

    // Verify NO automatic roads were created in the newly expanded regions
    for (const seg of world.roads.getAllSegments()) {
      for (const cell of seg.coveredCells) {
        assert.ok(
          cell.gx >= 0 && cell.gx < 198 && cell.gz >= 0 && cell.gz < 110,
          `Unexpected automatic road ${seg.id} found in newly expanded land at (${cell.gx}, ${cell.gz})`
        );
      }
    }

    // Verify all existing separation rules and facilities remain 100% preserved
    assert.equal(world.districts.getCityToRailSeparationBlocks(), 35);
    assert.equal(world.districts.getCityToAirportSeparationBlocks(), 48);
    assert.equal(
      world.economy.getCoreToWarehouseSeparationBlocks('facility-warehouse-1'),
      15
    );
    assert.equal(world.economy.getAirport().reservedBounds.totalCells, 3500);
    assert.equal(world.economy.getAirportWarehouse().reservedBounds.totalCells, 100);
    assert.equal(world.economy.getAirportTransferYard().bounds.totalCells, 100);
  });

  await t.test('Save/load migration tests: legacy saves and cleared forest bounds in expanded regions persist and reload cleanly', () => {
    const world1 = new WorldManager();
    world1.economy.setPlayerLevel(10);
    world1.economy.addMoney(200_000, 'Expansion Parcel Test');
    const buyParcel = world1.economy.purchaseLandParcel('parcel-north-boreal-charter');
    assert.equal(buyParcel.success, true);

    const buildRoadInExpanded = world1.roads.buildRoad(
      { gx: 85, gz: -35 },
      { gx: 105, gz: -35 },
      '2x2',
      'STRAIGHT'
    );
    assert.equal(buildRoadInExpanded.success, true);

    const savedJson = world1.serializeState();

    // Simulate a legacy 360x240 save payload by overriding config.gridWidth=360, gridDepth=240
    const parsedPayload = JSON.parse(savedJson);
    parsedPayload.config.gridWidth = 360;
    parsedPayload.config.gridDepth = 240;

    const world2 = new WorldManager();
    const loadRes = world2.deserializeState(JSON.stringify(parsedPayload));
    assert.equal(loadRes.success, true);

    // Migrated world has full 6000x5060 dimensions AND preserves the player road and cleared trees in the expanded region
    assert.equal(world2.config.gridWidth, 6000);
    assert.equal(world2.config.gridDepth, 5060);
    assert.equal(world2.parcels.getParcelAt(95, -35)?.owned, true);
    assert.ok(world2.roads.getRoadAtCell(95, -35));
    assert.equal(world2.terrainWater.getForestDensityAt(95, -35), ForestDensityLevel.NONE);
  });
});

test('Truck Depot Development Prompts 1–5: 4×3 Level 1 to 20×8 Level 20 Expansion, 3 Starting Mini Trucks, 15 Max Capacity, Slot Lifecycle & Persistence', async (t) => {
  await t.test('Prompt 1: Level 1 active footprint is 4×3 (3 slots) inside a protected 20×8 reserved expansion area with unused yard props', () => {
    const world = new WorldManager();
    const td = world.economy.getTruckDepot();

    assert.equal(td.id, 'facility-starter-truck-depot');
    assert.equal(td.level, 1);
    assert.equal(td.maxLevel, 20);
    assert.equal(td.activeWidthCells, 4);
    assert.equal(td.activeDepthCells, 3);
    assert.equal(td.reservedWidthCells, 20);
    assert.equal(td.reservedDepthCells, 8);
    assert.equal(td.truckCapacity, 3);
    assert.ok(td.unusedReservedProps.length > 0, 'Unused reserved yard has restrained temporary props at Level 1');

    // Unrelated buildings and player roads are blocked inside the 20×8 reserved depot property (gx 38..57, gz 45..52)
    world.economy.addMoney(200_000, 'Reservation Test');
    const buildOnReserved = world.economy.validateBuildingPlacement(
      'bld-ind-small-warehouse',
      39,
      46,
      0
    );
    assert.equal(buildOnReserved.valid, false);
    assert.ok(
      buildOnReserved.reason?.includes('Truck Depot') ||
        buildOnReserved.reason?.includes('facility-starter-truck-depot')
    );

    const roadOnReserved = world.roads.validateRoadPlacement(
      { gx: 39, gz: 47 },
      { gx: 44, gz: 47 },
      '1x1',
      'STRAIGHT'
    );
    assert.equal(roadOnReserved.valid, false);
  });

  await t.test('Prompt 2: Player starts with 3 identical player-owned Mini Cargo Trucks parked in 3 distinct slots with zero overlap and full bay clearance', () => {
    const world = new WorldManager();
    const td = world.economy.getTruckDepot();
    const fleet = world.economy.getOwnedVehicles();

    assert.equal(fleet.length, 3, 'New game starts with exactly 3 owned mini trucks');
    const seenSlots = new Set<number>();

    for (let i = 0; i < fleet.length; i++) {
      const truck = fleet[i];
      assert.equal(truck.catalogueId, 'veh-road-sprinter-van');
      assert.equal(truck.liveryId, 'livery-atlantic-blue');
      const spec = world.economy
        .getVehicleCatalogue()
        .find((s) => s.id === truck.catalogueId)!;
      assert.equal(spec.isArticulated, false, 'Starting fleet must be mini box trucks, not container trailers');
      assert.equal(truck.state, 'IDLE_AT_DEPOT');
      assert.equal(truck.currentSpeedKmh, 0);
      assert.ok(truck.assignedDepotSlotNumber && truck.assignedDepotSlotNumber >= 1 && truck.assignedDepotSlotNumber <= 3);
      seenSlots.add(truck.assignedDepotSlotNumber!);

      assert.ok(spec.widthMeters < td.entranceClearanceWidthMeters);
      assert.ok(spec.heightMeters < td.entranceClearanceHeightMeters);
    }
    assert.equal(seenSlots.size, 3, 'All 3 starting mini trucks occupy distinct parking slots');

    // Verify idle stability: advancing simulation ticks does not move idle parked trucks
    const posBefore = fleet.map((v) => ({ x: v.worldX, z: v.worldZ }));
    for (let step = 0; step < 20; step++) {
      world.economy.stepSimulation(0.2);
    }
    for (let i = 0; i < fleet.length; i++) {
      assert.equal(fleet[i].worldX, posBefore[i].x);
      assert.equal(fleet[i].worldZ, posBefore[i].z);
      assert.equal(fleet[i].currentSpeedKmh, 0);
    }
  });

  await t.test('Prompt 3: 20-level upgrade progression expands active footprint (4×3 -> 12×6 -> 20×8) and truck capacity (3 -> 9 -> 15) while absorbing reserved yard cells', () => {
    const world = new WorldManager();
    world.economy.setPlayerLevel(50);
    world.economy.addMoney(10_000_000, '20-Level Depot Upgrade Test');

    let prevWidth = 4;
    let prevDepth = 3;
    let prevCap = 3;

    for (let targetLvl = 2; targetLvl <= 20; targetLvl++) {
      const res = world.economy.upgradeTruckDepot();
      assert.equal(res.success, true, `Upgrade to Level ${targetLvl} should succeed`);
      const td = world.economy.getTruckDepot();
      assert.equal(td.level, targetLvl);
      assert.ok(td.activeWidthCells >= prevWidth);
      assert.ok(td.activeDepthCells >= prevDepth);
      assert.ok(td.truckCapacity >= prevCap);

      if (targetLvl === 10) {
        assert.equal(td.activeWidthCells, 12);
        assert.equal(td.activeDepthCells, 6);
        assert.equal(td.truckCapacity, 9);
      }
      if (targetLvl === 20) {
        assert.equal(td.activeWidthCells, 20);
        assert.equal(td.activeDepthCells, 8);
        assert.equal(td.truckCapacity, 15);
        assert.equal(td.unusedReservedProps.length, 0, 'At Level 20 the entire 20×8 reserved footprint is active with 0 temporary yard props');
      }

      prevWidth = td.activeWidthCells;
      prevDepth = td.activeDepthCells;
      prevCap = td.truckCapacity;
    }

    // Cannot upgrade beyond Level 20
    const beyond20 = world.economy.upgradeTruckDepot();
    assert.equal(beyond20.success, false);

    // Existing 3 starter mini trucks were preserved without duplication or deletion
    assert.equal(world.economy.getOwnedVehicles().length, 3);

    // Player can now purchase additional trucks up to the 15-slot depot capacity
    for (let i = 4; i <= 15; i++) {
      const buy = world.economy.purchaseVehicle('veh-road-sprinter-van');
      assert.equal(buy.success, true);
    }
    assert.equal(
      world.economy
        .getOwnedVehicles()
        .filter((v) => v.homeFacilityId === 'facility-starter-truck-depot').length,
      15
    );
  });

  await t.test('Prompt 4 & 5: Dispatch & return-to-depot slot lifecycle and full save/load persistence', () => {
    const world = new WorldManager();
    const econ = world.economy;
    const truck1 = econ.getOwnedVehicles()[0];
    const contract = econ.getContracts().find((c) => c.modal === 'ROAD')!;

    // Before dispatch, Slot 1 is PARKED
    assert.equal(econ.getTruckDepot().slots[0].occupancyState, 'PARKED');

    // Dispatch Truck 1 -> Slot 1 transitions to DISPATCHED
    const disp = econ.dispatchContract(contract.id, truck1.id);
    assert.equal(disp.success, true);
    assert.equal(econ.getTruckDepot().slots[0].occupancyState, 'DISPATCHED');

    // Step simulation until Truck 1 loads at Warehouse 1, completes delivery, and returns to its depot slot
    for (let step = 0; step < 1500; step++) {
      econ.stepSimulation(0.1);
      if (truck1.state === 'IDLE_AT_DEPOT') break;
    }
    assert.equal(truck1.state, 'IDLE_AT_DEPOT');
    assert.equal(econ.getTruckDepot().slots[0].occupancyState, 'PARKED');

    // Upgrade depot to Level 10 (12×6, 9 slots), serialize, and deserialize
    econ.setTruckDepotLevel(10);
    const saved = world.serializeState();
    const world2 = new WorldManager();
    const loadRes = world2.deserializeState(saved);
    assert.equal(loadRes.success, true);

    const restoredDepot = world2.economy.getTruckDepot();
    assert.equal(restoredDepot.level, 10);
    assert.equal(restoredDepot.activeWidthCells, 12);
    assert.equal(restoredDepot.activeDepthCells, 6);
    assert.equal(restoredDepot.truckCapacity, 9);
    assert.equal(world2.economy.getOwnedVehicles().length, 3);
  });
});

test('Terrain, Coastline & Ocean Upgrade: Continuous Mainland Peninsula, Smooth Organic Beaches, Deep Ocean & Camera Clamping', async (t) => {
  await t.test('Continuous Mainland Peninsula eliminates artificial rectangular canal while preserving Harbour Port, Rivers & Islands', () => {
    const world = new WorldManager();
    const tw = world.terrainWater;

    // 1. Southshore Peninsula connects seamlessly to the central mainland across gz 114..132 (zero artificial straight canal gap)
    for (let gz = 114; gz <= 165; gz += 3) {
      assert.equal(
        tw.isWaterAt(165, gz),
        false,
        `Expected continuous mainland peninsula at (165, ${gz}) without artificial canal trench`
      );
      assert.ok(
        (tw.getElevationAtGrid(165, gz) ?? 0) >= 0.16,
        `Expected above-water mainland elevation at (165, ${gz})`
      );
    }

    // 2. Harbour Port & Coastal Quay remain 100% intact with deep-water dock frontage
    const port = world.bridgesAndPort.getPortHarbour();
    assert.equal(port.usesNaturalWater, true);
    assert.equal(tw.isWaterAt(90, 94), false, 'Harbour quay land cell remains dry');
    assert.equal(tw.isWaterAt(90, port.berths[0].waterEntryGz), true, 'Harbour dock basin frontage remains ocean water');

    // 3. Meandering Western River & Silverpine Valley River flare organically into natural estuaries
    const westMouth = tw.getRiverCenterAndWidthAtZ(90);
    const westUpstream = tw.getRiverCenterAndWidthAtZ(50);
    assert.ok(westMouth && westUpstream);
    assert.ok(
      westMouth.widthCells > westUpstream.widthCells,
      'Western River widens into a natural estuary before meeting the sea'
    );
  });

  await t.test('Signed coastal distance field and multi-tiered beach/seabed slope produce smooth shoreline transitions', () => {
    const world = new WorldManager();
    const tw = world.terrainWater;

    // Verify signed coastal distance field transitions monotonically across the open-sea coastline at gx=100
    const coastZ = Math.floor(tw.getNaturalCoastlineZ(100));
    const inlandDist = tw.getCoastalDistanceAt(100, coastZ - 5);
    const beachDist = tw.getCoastalDistanceAt(100, coastZ - 1);
    const shallowDist = tw.getCoastalDistanceAt(100, coastZ + 2);
    const deepDist = tw.getCoastalDistanceAt(100, coastZ + 8);

    assert.ok(inlandDist >= 3, 'Inland tile has positive coastal distance >= 3');
    assert.ok(beachDist >= 1 && beachDist <= 2, 'Shoreline beach tile has coastal distance 1..2');
    assert.ok(shallowDist < 0, 'Shallow coastal water has negative signed distance');
    assert.ok(deepDist < shallowDist, 'Deep ocean water has more negative signed distance than shallow water');

    // Verify gentle beach elevation slope (+0.16m..+0.95m) and seabed depth slope (-0.24m..-1.80m)
    const beachElev = tw.getElevationAtGrid(108, Math.floor(tw.getNaturalCoastlineZ(108)) - 1)!;
    const inlandElev = tw.getElevationAtGrid(108, Math.floor(tw.getNaturalCoastlineZ(108)) - 6)!;
    const shallowElev = tw.getElevationAtGrid(100, coastZ + 1)!;
    const deepElev = tw.getElevationAtGrid(100, coastZ + 10)!;

    assert.ok(beachElev >= 0.14 && beachElev < inlandElev, 'Sandy beach slopes gently upward toward inland grass');
    assert.ok(shallowElev < 0 && shallowElev > deepElev, 'Seabed slopes gently downward from shallow turquoise water into deep ocean');
  });

  await t.test('Coastal palette standards (#e6d5ac warm sand, #1a3b6e deep ocean) and GFX water wave scaling', () => {
    assert.equal(COASTAL_PALETTE_STANDARDS.WARM_SANDY_BEACH, 0xe6d5ac);
    assert.equal(COASTAL_PALETTE_STANDARDS.DEEP_OCEAN_BLUE, 0x1a3b6e);

    const lowW = getWaterQualityConfig('LOW');
    const medW = getWaterQualityConfig('MEDIUM');
    const highW = getWaterQualityConfig('HIGH');
    const ultraW = getWaterQualityConfig('ULTRA');

    assert.equal(lowW.animateWaves, false);
    assert.equal(medW.animateWaves, true);
    assert.ok(highW.normalScale > medW.normalScale);
    assert.ok(ultraW.foamIntensity >= highW.foamIntensity);
  });

  await t.test('Airport-City-style camera boundary clamping keeps camera above water and inside playable peninsula bounds', () => {
    const world = new WorldManager();
    const bounds = world.grid.getWorldBounds();

    const desiredTarget = { x: bounds.maxX + 500, y: -3.0, z: bounds.maxZ + 500 };
    const cameraTarget = { x: bounds.maxX + 500, y: -3.0, z: bounds.maxZ + 500 };
    const cameraPos = { x: 0, y: 0.5, z: 0 };

    clampCameraPanningBounds(desiredTarget, cameraTarget, cameraPos, bounds, 80, 0.016);

    assert.ok(desiredTarget.x <= bounds.maxX, 'Desired X is clamped inside world bounds');
    assert.ok(desiredTarget.z <= bounds.maxZ, 'Desired Z is clamped inside world bounds');
    assert.ok(desiredTarget.y >= 0.6, 'Desired Y target never drops below water level');
    assert.ok(cameraPos.y >= 4.5, 'Camera Y position never clips beneath the ocean or terrain');
  });
});

test('Airport Development & Expansion Prompt: 2x2 Freight Roadway, 5t..50t Cargo Capacity, $25M+ 20-Level Upgrades, 10 Purchasable Parking Areas ($500k+$150k/lvl), Strict Parking Availability Rule & Guest Aircraft Tab/Lifecycle', async (t) => {
  await t.test('1. Cargo Capacity Progression (5t at Level 1 -> 50t at Level 20) & Rejection of Over-Capacity Cargo Assignments', () => {
    assert.equal(AIRPORT_MIN_CARGO_CAPACITY_TONS, 5);
    assert.equal(AIRPORT_MAX_CARGO_CAPACITY_TONS, 50);
    assert.equal(AIRPORT_CARGO_CAPACITY_TONS_BY_LEVEL.length, 20);
    assert.equal(getAirportCargoCapacityForLevel(1), 5);
    assert.equal(getAirportCargoCapacityForLevel(20), 50);

    // Strictly monotonic non-decreasing progression from 5t to 50t
    let prevCap = 5;
    for (let lvl = 1; lvl <= 20; lvl++) {
      const cap = getAirportCargoCapacityForLevel(lvl);
      assert.ok(
        cap >= prevCap && cap >= 5 && cap <= 50,
        `Expected monotonic capacity at Level ${lvl}, got ${cap}`
      );
      prevCap = cap;
    }

    // Verify player aircraft effectiveCapacityTons follows the airport level table (24t at Lv.10 -> 50t at Lv.20)
    // and rejects requestedTons > effectiveCapacityTons
    const world = new WorldManager();
    const econ = world.economy;
    econ.setPlayerLevel(100);
    econ.addMoney(80_000_000, 'Capacity Test Funding');
    assert.equal(econ.purchaseAirport().success, true);

    // At Level 10, construct HANGAR_1 ($5M) and purchase 1st owned aircraft ($20M)
    econ.setAirportLevel(10);
    assert.equal(econ.constructAircraftHangar('HANGAR_1').success, true);
    const buyAc = econ.purchaseVehicle('veh-air-widebody-jet');
    assert.equal(buyAc.success, true);

    // Lower airport level to 1 to test 5t capacity enforcement
    econ.setAirportLevel(1);
    const acLv1 = econ.getPlayerCargoAircraft()[0];
    assert.equal(acLv1.effectiveCapacityTons, 5);

    // Requesting 8t at Level 1 (when capacity is 5t) must be rejected cleanly
    const overCapFlight = econ.dispatchPlayerAircraftFlight(
      acLv1.id,
      'PLANT_AND_FOOD',
      8
    );
    assert.equal(overCapFlight.success, false);
    assert.ok(overCapFlight.reason?.includes('exceeds aircraft capacity'));

    // Upgrading airport to Level 20 increases effectiveCapacityTons to 50t while keeping physical dimensions constant
    econ.setAirportLevel(20);
    const acLv20 = econ.getPlayerCargoAircraft()[0];
    assert.equal(acLv20.effectiveCapacityTons, 50);
    assert.deepEqual(acLv20.dimensions, AIRCRAFT_CONSTANT_PHYSICAL_DIMENSIONS);
  });

  await t.test('2. Twenty Upgrade Levels & Expensive Upgrade Cost Formula ($25,000,000 at Lv.2 + $2,500,000/level -> $70,000,000 at Lv.20)', () => {
    assert.equal(AIRPORT_MAX_LEVEL, 20);
    assert.equal(AIRPORT_UPGRADE_LEVEL_2_COST, 25_000_000);
    assert.equal(AIRPORT_UPGRADE_COST_INCREMENT_PER_LEVEL, 2_500_000);

    // Formula verification across key levels
    assert.equal(getAirportUpgradeCostForLevel(1), 25_000_000); // Level 1 -> 2
    assert.equal(getAirportUpgradeCostForLevel(2), 27_500_000); // Level 2 -> 3
    assert.equal(getAirportUpgradeCostForLevel(3), 30_000_000); // Level 3 -> 4
    assert.equal(getAirportUpgradeCostForLevel(4), 32_500_000); // Level 4 -> 5
    assert.equal(getAirportUpgradeCostForLevel(9), 45_000_000); // Level 9 -> 10
    assert.equal(getAirportUpgradeCostForLevel(14), 57_500_000); // Level 14 -> 15
    assert.equal(getAirportUpgradeCostForLevel(19), 70_000_000); // Level 19 -> 20
    assert.equal(getAirportUpgradeCostForLevel(20), 0); // Max level reached

    const world = new WorldManager();
    const econ = world.economy;
    econ.setPlayerLevel(100);
    econ.addMoney(16_000_000, 'Purchase Airport Only');
    assert.equal(econ.purchaseAirport().success, true);

    // Insufficient funds (< $25,000,000) cannot upgrade to Level 2 and deducts $0
    const cashBeforeFail = econ.getMoney();
    const failUpg = econ.upgradeAirport();
    assert.equal(failUpg.success, false);
    assert.ok(failUpg.reason?.includes('$25,000,000'));
    assert.equal(econ.getMoney(), cashBeforeFail);
    assert.equal(econ.getAirport().level, 1);

    // Add $1,000,000,000 and step through all upgrades from Level 1 to Level 20
    econ.addMoney(1_000_000_000, 'Full 20-Level Upgrade Budget');
    for (let targetLvl = 2; targetLvl <= 20; targetLvl++) {
      const expectedCost = 25_000_000 + 2_500_000 * (targetLvl - 2);
      const before = econ.getMoney();
      const res = econ.upgradeAirport();
      assert.equal(res.success, true, `Expected upgrade to Level ${targetLvl} to succeed`);
      assert.equal(econ.getMoney(), before - expectedCost);
      assert.equal(econ.getAirport().level, targetLvl);
    }

    // Cannot upgrade beyond Level 20
    const beyond20 = econ.upgradeAirport();
    assert.equal(beyond20.success, false);
  });

  await t.test('3. Ten Aircraft Parking Areas (APRON_BAY_1..APRON_BAY_10) & Level-Scaled Purchase Pricing ($500,000 + $150,000 * (level - 1))', () => {
    assert.equal(AIRPORT_MAX_PARKING_AREAS, 10);
    assert.equal(ALL_APRON_STAND_IDS.length, 10);
    assert.equal(AIRPORT_PARKING_AREA_BASE_PRICE, 500_000);
    assert.equal(AIRPORT_PARKING_AREA_PRICE_INCREMENT_PER_LEVEL, 150_000);

    // Pricing formula verification
    assert.equal(getAirportParkingAreaPriceForLevel(1), 500_000);
    assert.equal(getAirportParkingAreaPriceForLevel(2), 650_000);
    assert.equal(getAirportParkingAreaPriceForLevel(3), 800_000);
    assert.equal(getAirportParkingAreaPriceForLevel(5), 1_100_000);
    assert.equal(getAirportParkingAreaPriceForLevel(10), 1_850_000);
    assert.equal(getAirportParkingAreaPriceForLevel(20), 3_350_000);

    const world = new WorldManager();
    const econ = world.economy;
    econ.setPlayerLevel(100);
    econ.addMoney(100_000_000, 'Parking Stand Purchase Test');
    assert.equal(econ.purchaseAirport().success, true);

    // At Level 1: Stand 1 is unlocked and purchased by default; Stands 2..10 are locked
    const apLv1 = econ.getAirport();
    assert.equal(apLv1.parkingStands.length, 10);
    assert.equal(apLv1.parkingStands[0].unlocked, true);
    assert.equal(apLv1.parkingStands[0].purchased, true);
    assert.equal(apLv1.parkingStands[0].active, true);
    assert.equal(apLv1.parkingStands[1].unlocked, false);
    assert.equal(apLv1.parkingStands[1].purchased, false);

    // Attempting to purchase Stand 2 while still at Level 1 (locked until Level 2) is rejected with $0 deducted
    const cashBeforeLocked = econ.getMoney();
    const buyLockedStand = econ.purchaseAirportParkingStand(2);
    assert.equal(buyLockedStand.success, false);
    assert.equal(econ.getMoney(), cashBeforeLocked);

    // Upgrade to Level 2 -> Stand 2 unlocks and costs $650,000
    assert.equal(econ.upgradeAirport().success, true);
    assert.equal(econ.getAirport().level, 2);
    assert.equal(econ.getAirport().parkingStands[1].unlocked, true);
    assert.equal(econ.getAirport().parkingStands[1].purchased, false);
    assert.equal(econ.getAirport().parkingStands[1].purchasePrice, 650_000);

    const cashBeforeStand2 = econ.getMoney();
    const buyStand2 = econ.purchaseAirportParkingStand(2);
    assert.equal(buyStand2.success, true);
    assert.equal(buyStand2.price, 650_000);
    assert.equal(econ.getMoney(), cashBeforeStand2 - 650_000);
    assert.equal(econ.getAirport().purchasedStandCount, 2);
    assert.equal(econ.getAirport().activeStandCount, 2);

    // Duplicate purchase of Stand 2 is rejected with $0 deducted
    const cashBeforeDup = econ.getMoney();
    assert.equal(econ.purchaseAirportParkingStand(2).success, false);
    assert.equal(econ.getMoney(), cashBeforeDup);

    // Set Airport to Level 20 and purchase remaining Stands 3..10 ($3,350,000 each at Level 20)
    econ.setAirportLevel(20);
    for (let sNum = 3; sNum <= 10; sNum++) {
      const cBefore = econ.getMoney();
      const buyRes = econ.purchaseAirportParkingStand(sNum);
      assert.equal(buyRes.success, true, `Purchase of Stand #${sNum} should succeed at Level 20`);
      assert.equal(buyRes.price, 3_350_000);
      assert.equal(econ.getMoney(), cBefore - 3_350_000);
    }
    assert.equal(econ.getAirport().purchasedStandCount, 10);
    assert.equal(econ.getAirport().activeStandCount, 10);
  });

  await t.test('4. Strict Aircraft Parking Availability Rule & Guest Aircraft Arrival, Stand Reservation, Cancellation, Visit Lifecycle & Persistence', () => {
    const world = new WorldManager();
    const econ = world.economy;
    econ.setPlayerLevel(100);
    econ.addMoney(100_000_000, 'Guest Aircraft & Parking Rule Test');
    assert.equal(econ.purchaseAirport().success, true);

    // At Level 1, only Stand 1 (APRON_BAY_1) is unlocked & purchased (1 available stand)
    assert.equal(econ.getAirport().activeStandCount, 1);
    assert.equal(econ.getAirport().availableStandCount, 1);

    // Request 1st Guest Aircraft arrival -> succeeds and immediately reserves APRON_BAY_1
    const moneyBeforeGuest = econ.getMoney();
    const whBeforeGuest = econ.getAirportWarehouse().totalStoredTons;
    const req1 = econ.requestGuestAircraftArrival(GUEST_AIRCRAFT_CATALOGUE[0].id);
    assert.equal(req1.success, true);
    assert.equal(req1.assignedStand, 'APRON_BAY_1');
    assert.ok(req1.aircraft);
    assert.equal(req1.aircraft.isGuestAircraft, true);
    assert.equal(req1.aircraft.isPlayerOwned, false);
    assert.equal(req1.aircraft.npcOperationType, 'GUEST_VISIT');

    // APRON_BAY_1 is now RESERVED -> availableStandCount is 0
    assert.equal(econ.getAirport().reservedStandCount, 1);
    assert.equal(econ.getAirport().availableStandCount, 0);

    // Requesting a 2nd Guest Aircraft (or ATC Supply Aircraft) while all purchased stands are occupied/reserved MUST be blocked!
    const req2Blocked = econ.requestGuestAircraftArrival(GUEST_AIRCRAFT_CATALOGUE[1].id);
    assert.equal(req2Blocked.success, false);
    assert.ok(req2Blocked.reason?.includes('occupied or reserved'));

    const atcBlocked = econ.requestAtcNpcSupplyArrival();
    assert.equal(atcBlocked.success, false);

    // Upgrade to Level 2 and purchase Stand 2 (APRON_BAY_2) -> now a 2nd arrival can be accepted!
    assert.equal(econ.upgradeAirport().success, true);
    assert.equal(econ.purchaseAirportParkingStand(2).success, true);
    assert.equal(econ.getAirport().availableStandCount, 1);

    const req2Allowed = econ.requestGuestAircraftArrival(GUEST_AIRCRAFT_CATALOGUE[1].id);
    assert.equal(req2Allowed.success, true);
    assert.equal(req2Allowed.assignedStand, 'APRON_BAY_2');
    assert.equal(econ.getAirport().availableStandCount, 0);

    // Cancel the 2nd Guest Aircraft while on approach -> releases APRON_BAY_2 immediately
    const cancelRes = econ.cancelGuestAircraftArrival(req2Allowed.aircraft!.id);
    assert.equal(cancelRes.success, true);
    assert.equal(econ.getAirport().availableStandCount, 1);

    // Save/Load persistence while Guest Aircraft #1 is on approach and Stand #2 is purchased
    const savedState = world.serializeState();
    const world2 = new WorldManager();
    assert.equal(world2.deserializeState(savedState).success, true);
    assert.equal(world2.economy.getAirport().level, 2);
    assert.equal(world2.economy.getAirport().purchasedStandCount, 2);
    assert.equal(world2.economy.getGuestAircraft().length, 1);
    assert.equal(world2.economy.getGuestAircraft()[0].assignedStandId, 'APRON_BAY_1');

    // Step simulation on world1 through Guest Aircraft #1 landing, taxi to APRON_BAY_1, stationary visit, pushback, takeoff & departure
    const seenStages = new Set<string>();
    const moneyBeforeStep = econ.getMoney();
    for (let step = 0; step < 350; step++) {
      econ.stepSimulation(0.2);
      const guestList = econ.getGuestAircraft();
      const g = guestList[0];
      if (g) {
        seenStages.add(g.flightStage);
        if (g.flightStage === 'PARKED') {
          assert.equal(g.currentSpeedMps, 0, 'Parked guest aircraft must remain stationary at its stand');
        }
      } else if (seenStages.has('PARKED')) {
        break;
      }
    }

    assert.equal(seenStages.has('ROLLOUT'), true);
    assert.equal(seenStages.has('TAXI_TO_STAND'), true);
    assert.equal(seenStages.has('PARKED'), true);
    assert.equal(seenStages.has('PUSHBACK'), true);
    assert.equal(seenStages.has('TAXI_TO_RUNWAY'), true);
    assert.equal(seenStages.has('TAKEOFF_ROLL'), true);

    // Guest aircraft does NOT grant free cash or free cargo and releases APRON_BAY_1 after departure
    assert.equal(econ.getMoney(), moneyBeforeStep, 'Guest aircraft visit must not generate free money');
    assert.equal(econ.getAirportWarehouse().totalStoredTons, whBeforeGuest, 'Guest aircraft visit must not generate free cargo');
    assert.equal(econ.getGuestArrivalsHandled(), 1);
    assert.equal(econ.getAirport().availableStandCount, 2, 'Stand 1 is released after guest aircraft departs');
    assert.equal(
      econ.getOwnedVehicles().filter((v) => v.modal === 'AIR').length,
      0,
      'Guest aircraft never enters player-owned fleet'
    );
  });

  await t.test('5. Part 1 & Part 2 Complete Verification: 30×40 -> 40×50 -> 50×70 Footprint Milestones, 18×6 Terminal Truck Yard, 0/2 Owned Aircraft Start, Level 1–9 Rejection, $5M Hangars at Any Level, Lv.10 $20M & Lv.15 $30M Aircraft Unlocks & Mandatory Hangar Storage', () => {
    const world = new WorldManager();
    const econ = world.economy;
    econ.setPlayerLevel(100);
    econ.addMoney(200_000_000, 'Part 1 & Part 2 Comprehensive Test');
    assert.equal(econ.purchaseAirport().success, true);

    // A. Part 1: Footprint progression across Levels 1..20
    assert.equal(AIRPORT_RESERVED_FOOTPRINT.depthCells, 50);
    assert.equal(AIRPORT_RESERVED_FOOTPRINT.widthCells, 70);
    assert.equal(AIRPORT_RESERVED_FOOTPRINT.totalCells, 3500);
    assert.equal(AIRPORT_LEVEL_1_FOOTPRINT.depthCells, 30);
    assert.equal(AIRPORT_LEVEL_1_FOOTPRINT.widthCells, 40);
    assert.equal(AIRPORT_LEVEL_1_FOOTPRINT.totalCells, 1200);
    assert.equal(AIRPORT_INTERMEDIATE_EXPANSION_LEVEL, 10);
    assert.equal(AIRPORT_INTERMEDIATE_FOOTPRINT.depthCells, 40);
    assert.equal(AIRPORT_INTERMEDIATE_FOOTPRINT.widthCells, 50);
    assert.equal(AIRPORT_INTERMEDIATE_FOOTPRINT.totalCells, 2000);
    assert.equal(AIRPORT_LEVEL_20_FOOTPRINT.depthCells, 50);
    assert.equal(AIRPORT_LEVEL_20_FOOTPRINT.widthCells, 70);
    assert.equal(AIRPORT_LEVEL_20_FOOTPRINT.totalCells, 3500);

    let prevCells = 1200;
    for (let lvl = 1; lvl <= 20; lvl++) {
      const b = getAirportActiveBoundsForLevel(world.config, lvl);
      assert.ok(b.totalCells >= prevCells, `Expected monotonic active footprint at Level ${lvl}`);
      if (lvl === 1) {
        assert.equal(b.depthCells, 30);
        assert.equal(b.widthCells, 40);
        assert.equal(b.totalCells, 1200);
      } else if (lvl === 10) {
        assert.equal(b.depthCells, 40);
        assert.equal(b.widthCells, 50);
        assert.equal(b.totalCells, 2000);
      } else if (lvl === 20) {
        assert.equal(b.depthCells, 50);
        assert.equal(b.widthCells, 70);
        assert.equal(b.totalCells, 3500);
      }
      prevCells = b.totalCells;
    }

    // B. Part 1: Cargo-Terminal Truck-Handling Area (18x6 = 108 cells, 6 loading docks, 4 queue slots)
    assert.equal(AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT.widthCells, 18);
    assert.equal(AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT.depthCells, 6);
    assert.equal(AIRPORT_TERMINAL_TRUCK_YARD_FOOTPRINT.totalCells, 108);
    const apLv1 = econ.getAirport();
    assert.equal(apLv1.cargoTerminalTruckYard.loadingDockBays.length, 6);
    assert.equal(apLv1.cargoTerminalTruckYard.queueSlots.length, 4);
    assert.ok(apLv1.cargoTerminalTruckYard.turningRadiusMeters >= 12.0);
    assert.ok(apLv1.cargoTerminalTruckYard.reversingClearanceMeters >= 14.0);

    // C. Part 2: Zero owned aircraft at start (0/2)
    assert.equal(econ.getPlayerCargoAircraft().length, 0);
    assert.equal(econ.getModalCapacitySummary('AIR').usedSlots, 0);
    assert.equal(econ.getModalCapacitySummary('AIR').totalSlots, 2);

    // D. Part 2: Hangars 1 & 2 cost exact $5,000,000 each and can be purchased at Airport Level 1
    assert.equal(AIRCRAFT_HANGAR_PURCHASE_COST, 5_000_000);
    const cashBeforeH1 = econ.getMoney();
    const buyH1AtLv1 = econ.constructAircraftHangar('HANGAR_1');
    assert.equal(buyH1AtLv1.success, true);
    assert.equal(econ.getMoney(), cashBeforeH1 - 5_000_000);

    // E. Part 2: Levels 1–9 strictly reject player-owned aircraft purchases even when Hangar 1 is built and player has $200M
    for (const lvl of [1, 5, 9]) {
      econ.setAirportLevel(lvl);
      const cashBefore = econ.getMoney();
      const rejectEarly = econ.purchasePlayerCargoAircraft();
      assert.equal(rejectEarly.success, false, `Owned aircraft purchase must be rejected at Airport Level ${lvl}`);
      assert.ok(rejectEarly.reason?.includes('Airport Level 10'));
      assert.equal(econ.getMoney(), cashBefore, 'Rejected purchase must deduct $0');
      assert.equal(econ.getPlayerCargoAircraft().length, 0);
    }

    // F. Part 2: At Airport Level 10, 1st owned aircraft unlocks for exact $20,000,000 and is stored in HANGAR_1 (IN_HANGAR)
    econ.setAirportLevel(10);
    assert.equal(FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL, 10);
    assert.equal(FIRST_OWNED_AIRCRAFT_PRICE, 20_000_000);
    const cashBeforeSlot1 = econ.getMoney();
    const buySlot1 = econ.purchasePlayerCargoAircraft();
    assert.equal(buySlot1.success, true);
    assert.equal(econ.getMoney(), cashBeforeSlot1 - 20_000_000);
    assert.equal(econ.getPlayerCargoAircraft().length, 1);
    assert.equal(buySlot1.aircraft?.flightStage, 'IN_HANGAR');
    assert.equal(buySlot1.aircraft?.assignedHangarId, 'HANGAR_1');
    assert.equal(
      econ.getAircraftHangars().find((h) => h.id === 'HANGAR_1')?.occupiedByAircraftId,
      buySlot1.aircraft?.id
    );

    // G. Part 2: 2nd owned aircraft is rejected at Airport Levels 10–14
    for (const lvl of [10, 12, 14]) {
      econ.setAirportLevel(lvl);
      const cashBefore = econ.getMoney();
      const rejectSlot2Early = econ.purchasePlayerCargoAircraft();
      assert.equal(rejectSlot2Early.success, false, `2nd owned aircraft must be rejected at Airport Level ${lvl}`);
      assert.ok(rejectSlot2Early.reason?.includes('Airport Level 15'));
      assert.equal(econ.getMoney(), cashBefore);
    }

    // H. Part 2: At Airport Level 15, 2nd owned aircraft is rejected until HANGAR_2 ($5,000,000) is purchased
    econ.setAirportLevel(15);
    assert.equal(SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL, 15);
    assert.equal(SECOND_OWNED_AIRCRAFT_PRICE, 30_000_000);
    const cashBeforeNoH2 = econ.getMoney();
    const rejectNoHangar2 = econ.purchasePlayerCargoAircraft();
    assert.equal(rejectNoHangar2.success, false);
    assert.ok(rejectNoHangar2.reason?.includes('HANGAR_2') || rejectNoHangar2.reason?.includes('Hangar'));
    assert.equal(econ.getMoney(), cashBeforeNoH2);

    // Purchase HANGAR_2 for $5,000,000, then purchase 2nd owned aircraft for $30,000,000
    const cashBeforeH2 = econ.getMoney();
    assert.equal(econ.constructAircraftHangar('HANGAR_2').success, true);
    assert.equal(econ.getMoney(), cashBeforeH2 - 5_000_000);

    const cashBeforeSlot2 = econ.getMoney();
    const buySlot2 = econ.purchasePlayerCargoAircraft();
    assert.equal(buySlot2.success, true);
    assert.equal(econ.getMoney(), cashBeforeSlot2 - 30_000_000);
    assert.equal(econ.getPlayerCargoAircraft().length, 2);
    assert.equal(buySlot2.aircraft?.flightStage, 'IN_HANGAR');
    assert.equal(buySlot2.aircraft?.assignedHangarId, 'HANGAR_2');
    assert.equal(
      econ.getAircraftHangars().find((h) => h.id === 'HANGAR_2')?.occupiedByAircraftId,
      buySlot2.aircraft?.id
    );

    // I. Part 2: 3rd owned aircraft purchase is strictly rejected at Level 20
    econ.setAirportLevel(20);
    const cashBeforeSlot3 = econ.getMoney();
    const rejectSlot3 = econ.purchasePlayerCargoAircraft();
    assert.equal(rejectSlot3.success, false);
    assert.equal(econ.getMoney(), cashBeforeSlot3);
    assert.equal(econ.getPlayerCargoAircraft().length, 2);
  });

  await t.test('6. Enforces exact "To buy a plane you must own a Hanger first" prerequisite, 1-to-1 Hangar binding, Landside Truck Yard waypoints, and Save/Load anti-duplication', () => {
    const world = new WorldManager();
    const econ = world.economy;

    econ.setPlayerLevel(100);
    econ.addMoney(200_000_000);
    assert.equal(econ.purchaseAirport().success, true);

    // 1. At Level 10 without Hangar 1, buying Plane 1 must return exact message: "To buy a plane you must own a Hanger first"
    econ.setAirportLevel(10);
    const noHangarRes = econ.purchasePlayerCargoAircraft();
    assert.equal(noHangarRes.success, false);
    assert.equal(noHangarRes.reason, 'To buy a plane you must own a Hanger first');
    assert.equal(econ.getPlayerCargoAircraft().length, 0);

    // Even if Hangar 2 is purchased first, Plane 1 strictly requires HANGAR_1
    assert.equal(econ.constructAircraftHangar('HANGAR_2').success, true);
    const stillNoHangar1 = econ.purchasePlayerCargoAircraft();
    assert.equal(stillNoHangar1.success, false);
    assert.equal(stillNoHangar1.reason, 'To buy a plane you must own a Hanger first');

    // Construct Hangar 1 and buy Plane 1 -> binds strictly to HANGAR_1 with doorOpenRatio = 0.25
    assert.equal(econ.constructAircraftHangar('HANGAR_1').success, true);
    const buyPlane1 = econ.purchasePlayerCargoAircraft();
    assert.equal(buyPlane1.success, true);
    assert.equal(buyPlane1.aircraft?.assignedHangarId, 'HANGAR_1');
    const h1 = econ.getAircraftHangars().find((h) => h.id === 'HANGAR_1')!;
    assert.equal(h1.occupiedByAircraftId, buyPlane1.aircraft?.id);
    assert.equal(h1.doorOpenRatio, 0.25);

    // 2. Dedicated Landside Cargo Truck Yard waypoints & animated semi-trailer fleet
    for (const wpId of [
      'TRUCK_YARD_ENTRY',
      'TRUCK_QUEUE_BAY',
      'CARGO_LOADING_DOCK',
      'TRUCK_YARD_EXIT',
    ] as const) {
      const wp = econ.airportOps.getWaypoint(wpId);
      assert.ok(wp, `Missing truck yard waypoint ${wpId}`);
    }
    const yardTrucks = econ.getAirportYardTrucks();
    assert.equal(yardTrucks.length, 3);
    econ.stepSimulation(1.5);
    assert.equal(econ.getAirportYardTrucks().length, 3);

    // 3. Save/Load persistence & anti-duplication
    const saved = econ.serializeEconomyState();
    assert.equal(saved.airportOwned, true);
    assert.equal(saved.airportLevel, 10);
    assert.equal(saved.hangar1Purchased, true);
    assert.equal(saved.hangar2Purchased, true);
    assert.equal(saved.ownedAircraftCount, 1);
    assert.equal(saved.activeApronStandCount, 1);

    // Deserialize twice to verify zero duplication of aircraft or hangars
    econ.deserializeEconomyState(saved);
    econ.deserializeEconomyState(saved);
    assert.equal(econ.getPlayerCargoAircraft().length, 1);
    assert.equal(
      econ.getOwnedVehicles().filter((v) => v.modal === 'AIR').length,
      1
    );
  });

  await t.test('Starting World Cleanup (5 Core Facilities Only), 5x7 Delivery HQ & World-Scale Railway Network', () => {
    const world = new WorldManager();
    const econ = world.economy;

    // 1. Verify the 5 Core Starting Facilities manifest
    const coreHubs = econ.getCoreStartingFacilities();
    assert.equal(coreHubs.length, 5);
    assert.deepEqual(
      coreHubs.map((h) => h.key),
      ['PORT', 'DELIVERY_HEADQUARTERS', 'RAILWAY_YARD', 'AIRPORT', 'TRUCK_DEPOT']
    );

    // 2. Verify Delivery Headquarters has exact 5 x 7 grid-block dimensions (10m x 14m)
    const hq = econ.getPlacedBuilding('building-city-hq-tower');
    assert.ok(hq, 'Delivery Headquarters must exist at game start');
    assert.equal(hq.name, 'Delivery Headquarters');
    assert.equal(hq.widthCells, 5);
    assert.equal(hq.depthCells, 7);
    assert.equal(hq.gx, 78);
    assert.equal(hq.gz, 44);

    // 3. Verify all random residential, retail, supermarket, and factory clutter was removed from starting world
    const removedIds = [
      'facility-logistics-warehouse-a',
      'facility-logistics-warehouse-b',
      'facility-industrial-factory-1',
      'facility-service-station-1',
      'building-city-commerce-east',
      'building-city-south-block',
      'building-city-retail-ne',
      'building-city-apartments-nw',
      'building-city-townhouses-w',
      'building-city-apartments-se',
      'building-city-suburban-1',
      'building-city-suburban-2',
      'building-city-park-plaza',
      'building-metro-east-office-1',
      'building-metro-east-market-1',
      'building-metro-east-apartments-1',
      'building-metro-east-townhouses-1',
      'building-metro-east-villa-1',
      'building-metro-east-villa-2',
      'building-metro-south-commercial-1',
      'building-metro-south-apartments-1',
    ];
    for (const rid of removedIds) {
      assert.equal(
        econ.getPlacedBuilding(rid),
        undefined,
        `Unnecessary pre-placed building ${rid} should be removed from starting world`
      );
    }

    // 4. Verify World-Scale Railway Corridor construction across world chunks & persistence
    const longCorridorRes = world.railways.buildWorldScaleTrackCorridor(
      { gx: 26, gz: 38 },
      { gx: -40, gz: -30 }
    );
    assert.equal(
      longCorridorRes.success,
      true,
      `Expected world-scale railway corridor to succeed: ${longCorridorRes.reason}`
    );
    assert.ok(longCorridorRes.track);
    assert.ok(
      longCorridorRes.track.connectedTrackIds.includes('rail-track-line-1'),
      'World-scale corridor starting at (26, 38) should connect to starter Line 1'
    );

    // City zone remains protected from rail tracks
    const invalidCityCorridor = world.railways.buildWorldScaleTrackCorridor(
      { gx: 80, gz: 48 },
      { gx: 85, gz: 52 }
    );
    assert.equal(invalidCityCorridor.success, false);

    // Verify persistence of world-scale railway corridor across save/load
    const savedState = world.serializeState();
    const restoredWorld = new WorldManager();
    const loadRes = restoredWorld.deserializeState(savedState);
    assert.equal(loadRes.success, true);
    assert.equal(
      restoredWorld.railways.getWorldScaleTrackCorridors().length,
      1
    );
    assert.deepEqual(restoredWorld.railways.getWorldScaleTrackCorridors()[0], {
      start: { gx: 26, gz: 38 },
      end: { gx: -40, gz: -30 },
    });
  });

  await t.test('Highway-City Multi-Lane Roundabout Interchange: 3 circulating lanes, entry/exit tapers & yield signage', () => {
    const world = new WorldManager();
    const centralRb = world.roads.getRoundabout();
    const hwyRb = world.roads.getHighwayInterchangeRoundabout();
    const allRoundabouts = world.roads.getAllRoundabouts();

    assert.equal(allRoundabouts.length, 2);

    // 1. Verify Central City-Highway Roundabout at (86, 55)
    assert.equal(centralRb.id, 'roundabout-central');
    assert.deepEqual(centralRb.center, { gx: 86, gz: 55 });
    assert.equal(centralRb.circulatingLanes, 3);
    assert.equal(centralRb.circulatingWidthConfig, '3x3');
    assert.equal(centralRb.hasEntryExitTapers, true);
    assert.equal(centralRb.hasYieldSignage, true);
    assert.equal(centralRb.totalYieldSigns, 8);
    assert.equal(centralRb.approachTapers.length, 4);
    for (const taper of centralRb.approachTapers) {
      assert.equal(taper.hasPaintedGoreChevrons, true);
      assert.equal(taper.hasSharkToothYieldLine, true);
      assert.equal(taper.hasYieldSignage, true);
      assert.equal(taper.yieldSignCount, 2);
      assert.ok(taper.entryTaperLengthMeters >= 6.0);
      assert.ok(taper.exitTaperLengthMeters >= 6.0);
    }

    // 2. Verify Highway-City Interchange Multi-Lane Roundabout at (128, 55) after 15-block leftward freeway shift
    assert.equal(hwyRb.id, 'roundabout-highway-interchange');
    assert.deepEqual(hwyRb.center, { gx: 128, gz: 55 });
    assert.equal(hwyRb.circulatingLanes, 3);
    assert.equal(hwyRb.circulatingWidthConfig, '3x3');
    assert.equal(hwyRb.hasEntryExitTapers, true);
    assert.equal(hwyRb.hasYieldSignage, true);
    assert.equal(hwyRb.totalYieldSigns, 8);
    assert.equal(hwyRb.approachTapers.length, 4);
    assert.ok(hwyRb.outerRadiusMeters > centralRb.outerRadiusMeters);
    assert.ok(hwyRb.connectedApproachIds.includes('road-east-highway-merge'));
    assert.ok(hwyRb.connectedApproachIds.includes('highway-extreme-right'));
    assert.ok(hwyRb.connectedApproachIds.includes('road-airport-city-connector'));

    for (const taper of hwyRb.approachTapers) {
      assert.equal(taper.hasPaintedGoreChevrons, true);
      assert.equal(taper.hasSharkToothYieldLine, true);
      assert.equal(taper.hasYieldSignage, true);
      assert.equal(taper.yieldSignCount, 2);
      assert.ok(taper.entryTaperLengthMeters >= 7.5);
      assert.ok(taper.exitTaperLengthMeters >= 7.5);
    }

    // 3. Verify 6-lane (3x3) Highway-City Connector Arterial, 15-block leftward Freeway shift, rebuilt Roundabout-to-Airport corridor & Natural River Bridges
    const hw = world.config.highway;
    assert.equal(hw.previousStartX, 138);
    assert.equal(hw.previousEndX, 149);
    assert.equal(hw.startX, 123);
    assert.equal(hw.endX, 134);
    assert.equal(hw.shiftedLeftBlocks, 15);
    assert.equal(hw.previousStartX - hw.startX, 15);
    assert.equal(hw.previousEndX - hw.endX, 15);

    const mergeSeg = world.roads.getSegment('road-east-highway-merge');
    assert.ok(mergeSeg);
    assert.equal(mergeSeg.widthConfig, '3x3');
    assert.equal(mergeSeg.spec.totalLanes, 6);
    assert.deepEqual(mergeSeg.start, { gx: 90, gz: 55 });
    assert.deepEqual(mergeSeg.end, { gx: 122, gz: 55 });

    const airportConn = world.roads.getSegment('road-airport-city-connector');
    assert.ok(airportConn);
    assert.equal(airportConn.widthConfig, '2x2');
    assert.deepEqual(airportConn.start, { gx: 135, gz: 55 });
    assert.deepEqual(airportConn.end, { gx: 192, gz: 55 });

    assert.equal(
      world.roads.areRoadsConnected(
        'roundabout-central',
        'roundabout-highway-interchange'
      ),
      true
    );
    assert.equal(
      world.roads.areRoadsConnected(
        'roundabout-highway-interchange',
        'highway-extreme-right'
      ),
      true
    );
    assert.equal(
      world.roads.areRoadsConnected(
        'roundabout-highway-interchange',
        'road-airport-city-connector'
      ),
      true
    );

    // 4. Verify Natural River Bridges have structural arches/trusses, bank abutments, and river piers
    const bridgeRes = world.bridgesAndPort.buildBridge(
      'ROAD_BRIDGE',
      { gx: 57, gz: 55 },
      { gx: 71, gz: 55 },
      '2x2'
    );
    assert.equal(bridgeRes.success, true);
    assert.ok(bridgeRes.bridge);
    assert.equal(bridgeRes.bridge.bridgeStyle, 'ARCH_SPAN');
    assert.equal(bridgeRes.bridge.abutmentCount, 2);
    assert.ok(bridgeRes.bridge.pierCount >= 2);
    assert.ok(bridgeRes.bridge.spanLengthMeters >= 8);
  });

  await t.test('40x50 GTE Intermodal Railway Yard, Infinite Straight Tracks, GTE-L1 & Model 360 Forklift Job-Triggered Loading State Machine', () => {
    const world = new WorldManager();
    const rail = world.railways;
    const econ = world.economy;

    // 1. Verify Reserved 40x50 Railway Yard Footprint & Zero-Clutter / Elevation Layering Rules
    assert.equal(RAILWAY_YARD_RESERVED_FOOTPRINT.widthCells, 40);
    assert.equal(RAILWAY_YARD_RESERVED_FOOTPRINT.depthCells, 50);
    assert.equal(
      RAILWAY_YARD_RESERVED_FOOTPRINT.maxGx - RAILWAY_YARD_RESERVED_FOOTPRINT.minGx + 1,
      40
    );
    assert.equal(
      RAILWAY_YARD_RESERVED_FOOTPRINT.maxGz - RAILWAY_YARD_RESERVED_FOOTPRINT.minGz + 1,
      50
    );
    assert.equal(RAILWAY_YARD_RESERVED_FOOTPRINT.totalCells, 2000);
    assert.equal(
      RAILWAY_YARD_RESERVED_FOOTPRINT.hasLooseClutterOnTracksOrPathways,
      false
    );

    assert.equal(RAIL_ELEVATION_LAYERS.baseTerrainGrassOffset, 0.0);
    assert.equal(RAIL_ELEVATION_LAYERS.crushedBallastOffset, 0.02);
    assert.equal(RAIL_ELEVATION_LAYERS.railTiesAndConcretePadOffset, 0.03);
    assert.equal(RAIL_ELEVATION_LAYERS.asphaltRoadsAndLoadingBaysOffset, 0.04);
    assert.equal(RAIL_ELEVATION_LAYERS.steelRailsAndMarkingsOffset, 0.05);

    // 2. Verify Infinite Straight-Line Track Extension across mainland world boundaries
    const infiniteSpans = rail.getInfiniteStraightTrackSpans();
    assert.equal(infiniteSpans.length, 2);
    for (const span of infiniteSpans) {
      assert.equal(span.logicalMinGz, world.config.minGz);
      assert.equal(span.logicalMaxGz, world.config.maxGz);
      assert.ok(span.renderMinGz <= -200);
      assert.ok(span.renderMaxGz >= 70);
    }

    // 3. Verify Perimeter & Access Road Connectivity + Landside Truck Staging Bays
    const perimLoop = world.roads.getSegment('road-rail-yard-perimeter-loop');
    const accessRoad = world.roads.getSegment('road-rail-yard-access');
    assert.ok(perimLoop);
    assert.ok(accessRoad);
    assert.equal(
      world.roads.areRoadsConnected(
        'road-rail-yard-perimeter-loop',
        'road-rail-yard-access'
      ),
      true
    );

    // 4. Verify GTE Rolling Stock & GTE Model 360 Forklift Technical Reference Specs
    assert.equal(GTE_ROLLING_STOCK_SPEC.locomotiveModel, 'GTE-L1');
    assert.equal(GTE_ROLLING_STOCK_SPEC.hasGteLogo, true);
    assert.deepEqual(
      GTE_ROLLING_STOCK_SPEC.wagons.map((w) => w.modelId),
      ['Boxcar-T1', 'Tankcar-O1', 'Tankcar-W1', 'Flatbed-C1']
    );
    assert.equal(
      GTE_FORKLIFT_MODEL_360_SPEC.name,
      'GTE Logistics Forklift Model 360'
    );
    assert.equal(
      GTE_FORKLIFT_MODEL_360_SPEC.hasDiagonalHazardCounterweightStripes,
      true
    );
    assert.equal(GTE_FORKLIFT_MODEL_360_SPEC.hasGteLogisticsLogo, true);

    // 5. Verify Pre-Job Strictly Idle State (No phantom movement or auto-looping ambient trains)
    const hubBefore = econ.getRailwayFreightHubState();
    assert.equal(hubBefore.owned, true);
    assert.equal(hubBefore.trains.length, 1);
    assert.equal(hubBefore.forklifts.length, 3);
    assert.equal(hubBefore.stagingTrucks.length, 2);

    const trainBefore = hubBefore.trains[0];
    assert.equal(trainBefore.state, 'IDLE');
    assert.equal(trainBefore.currentSpeedKmh, 0);
    assert.equal(trainBefore.loadingProgressPercent, 0);
    assert.equal(trainBefore.signalAspect, 'RED');
    assert.deepEqual(trainBefore.wagonModels, [
      'Boxcar-T1',
      'Tankcar-O1',
      'Tankcar-W1',
      'Flatbed-C1',
    ]);
    for (const fk of hubBefore.forklifts) {
      assert.equal(fk.state, 'IDLE_AT_BAY');
      assert.equal(fk.carryingCargo, false);
    }

    // Step simulation 5 seconds without assigning a job -> train and forklifts MUST remain 100% stationary in IDLE
    const idleZ = trainBefore.worldZ;
    for (let i = 0; i < 10; i++) {
      econ.stepSimulation(0.5);
    }
    const hubStillIdle = econ.getRailwayFreightHubState();
    assert.equal(hubStillIdle.trains[0].state, 'IDLE');
    assert.equal(hubStillIdle.trains[0].currentSpeedKmh, 0);
    assert.equal(hubStillIdle.trains[0].worldZ, idleZ);
    for (const fk of hubStillIdle.forklifts) {
      assert.equal(fk.state, 'IDLE_AT_BAY');
    }

    // 6. Verify Player Job Trigger activates Forklift Loading -> Train Departure -> Reward Settlement -> Return to IDLE
    const firstJob = hubStillIdle.jobs[0];
    assert.ok(firstJob);
    const assignRes = econ.assignRailJobAndLoad(firstJob.id);
    assert.equal(assignRes.success, true);

    const hubLoading = econ.getRailwayFreightHubState();
    assert.equal(hubLoading.trains[0].state, 'LOADING');
    assert.equal(hubLoading.trains[0].assignedJobId, firstJob.id);
    assert.ok(
      hubLoading.forklifts.every((f) => f.state !== 'IDLE_AT_BAY'),
      'All 3 GTE Model 360 Forklifts activate when a rail job is assigned'
    );

    // Step 2.5 seconds (25 * 0.1s) -> still LOADING, progress > 20%, forklifts actively shuttling cargo
    for (let i = 0; i < 25; i++) {
      econ.stepSimulation(0.1);
    }
    const hubMidLoad = econ.getRailwayFreightHubState();
    assert.equal(hubMidLoad.trains[0].state, 'LOADING');
    assert.ok(hubMidLoad.trains[0].loadingProgressPercent > 20);
    assert.ok(hubMidLoad.trains[0].loadedWagonCount >= 1);

    // Step 4.5 more seconds (45 * 0.1s) until loading finishes (100%) and train departs along straight mainline track
    for (let i = 0; i < 45; i++) {
      econ.stepSimulation(0.1);
    }
    const hubDeparted = econ.getRailwayFreightHubState();
    assert.ok(
      hubDeparted.trains[0].state === 'DEPARTING' ||
        hubDeparted.trains[0].state === 'IN_TRANSIT'
    );
    assert.equal(hubDeparted.trains[0].loadingProgressPercent, 100);
    assert.equal(hubDeparted.trains[0].loadedWagonCount, 4);
    assert.equal(hubDeparted.trains[0].signalAspect, 'GREEN');
    assert.ok(hubDeparted.trains[0].currentSpeedKmh > 0);
    assert.ok(
      hubDeparted.forklifts.every((f) => f.state === 'IDLE_AT_BAY'),
      'Forklifts return cleanly to their designated equipment bays once loading completes'
    );

    // Verify save/load state persistence while train is in transit
    const savedMidTransit = world.serializeState();
    const restoredWorld = new WorldManager();
    assert.equal(restoredWorld.deserializeState(savedMidTransit).success, true);
    assert.equal(
      restoredWorld.economy.getRailwayFreightHubState().trains[0].assignedJobId,
      firstJob.id
    );

    // Step simulation (260 * 0.1s = 26s) until train completes mainline delivery and returns to stationary IDLE
    const cashBeforeReward = econ.getMoney();
    const xpBeforeReward = econ.getXp();
    for (let i = 0; i < 260; i++) {
      econ.stepSimulation(0.1);
    }
    const hubCompleted = econ.getRailwayFreightHubState();
    assert.equal(hubCompleted.trains[0].state, 'IDLE');
    assert.equal(hubCompleted.trains[0].currentSpeedKmh, 0);
    assert.equal(hubCompleted.trains[0].signalAspect, 'RED');
    assert.ok(econ.getMoney() >= cashBeforeReward + firstJob.cashReward);
    assert.ok(econ.getXp() >= xpBeforeReward + firstJob.xpReward);
  });

  await t.test('Infinite Procedural World (10M+ Units): Dynamic 64x64/128x128 Chunk Streaming, Origin Rebasing, Infinite Linear Infra, Object Pooling & 64-Bit Coordinate Save State', () => {
    const world = new WorldManager();
    const streaming = world.streaming;

    // 1. Dynamic Chunk-Based Streaming & Asynchronous Time-Budgeted Queue (64x64 and 128x128 tile chunks)
    assert.equal(streaming.getChunkTileSize(), 64);
    assert.ok(streaming.getActiveChunks().length > 0);
    assert.ok(INFINITE_WORLD_MAX_COORD_UNITS >= 10_000_000);
    assert.equal(
      streaming.isInfiniteCoordinateSupported(10_500_000, -10_500_000),
      true
    );

    // Move camera rapidly to a distant frontier coordinate (e.g., wx = 250,000, wz = -500,000)
    // and verify incremental async streaming loads only up to maxChunksPerStep per tick without frame spikes
    const step1 = streaming.stepDynamicChunkStreaming(
      250_000,
      -500_000,
      'HIGH',
      4,
      100
    );
    assert.equal(step1.loadedThisStep, 4);
    assert.ok(step1.queuedChunkCount > 0);
    assert.ok(
      step1.unloadedThisStep > 0,
      'Distant chunks outside unload radius are recycled into the object pool'
    );
    assert.ok(step1.pooledChunkCount > 0);

    // Flush remaining chunks at (250_000, -500_000)
    streaming.flushAllPendingChunks(250_000, -500_000, 'ULTRA');
    assert.equal(streaming.getPerformanceTelemetry().queuedPendingChunks, 0);
    assert.equal(streaming.getActiveChunks().length, 81); // 9x9 active grid around camera

    // Switch chunk size to 128x128 tiles and verify recycling & streaming
    streaming.setChunkTileSize(128);
    assert.equal(streaming.getChunkTileSize(), 128);
    streaming.flushAllPendingChunks(250_000, -500_000, 'HIGH');
    assert.equal(streaming.getActiveChunks().length, 81);
    assert.equal(streaming.getActiveChunks()[0].tileSize, 128);

    // Restore 64x64 chunk size
    streaming.setChunkTileSize(64);

    // 2. Floating-Point Precision & Origin Rebasing at 10,000,000+ Units across North, South, East, West
    const extremeCoords = [
      { wx: 10_500_000.25, wz: -10_500_000.75 }, // North-East 10.5M units
      { wx: -12_000_000.5, wz: 12_000_000.125 }, // South-West 12.0M units
    ];
    for (const pt of extremeCoords) {
      const reb = streaming.originRebaser.updateOriginForCamera(pt.wx, pt.wz);
      assert.equal(reb.rebased, true);
      const renderPos = streaming.originRebaser.worldToRenderPosition(
        pt.wx,
        pt.wz
      );
      // Local GPU float32 render coordinate is kept within ORIGIN_REBASE_THRESHOLD_METERS of (0,0)
      assert.ok(
        Math.abs(renderPos.localRenderX) <= ORIGIN_REBASE_THRESHOLD_METERS
      );
      assert.ok(
        Math.abs(renderPos.localRenderZ) <= ORIGIN_REBASE_THRESHOLD_METERS
      );
      // Sub-millimeter float32 precision error at 10,000,000+ units!
      assert.ok(
        renderPos.float32PrecisionErrorMeters < 0.0005,
        `Expected sub-millimeter float32 precision at ${pt.wx}, got ${renderPos.float32PrecisionErrorMeters}`
      );
      // Camera-relative 4x4 transformation matrix has near-zero translation for objects near camera
      const mat16 = streaming.originRebaser.computeCameraRelativeMatrix16(
        pt.wx + 12.5,
        1.25,
        pt.wz - 8.25,
        pt.wx,
        45.0,
        pt.wz,
        Math.PI * 0.25,
        1.0
      );
      assert.equal(mat16.length, 16);
      assert.ok(Math.abs(mat16[12] - 12.5) < 1e-5);
      assert.ok(Math.abs(mat16[14] - -8.25) < 1e-5);
    }

    // 3. Infinite Linear Infrastructure (Mainline Railway Tracks, Multi-Lane Highways, and Rivers at distant chunks)
    const distantNorthChunkZ = -50_000; // > 3,200,000 tiles North
    const railChunkInfra = streaming.computeInfiniteLinearInfrastructureForChunk(
      0, // contains gx = 26..27
      distantNorthChunkZ,
      64
    );
    assert.ok(
      railChunkInfra.some(
        (s) => s.kind === 'RAILWAY_MAINLINE' && s.instancedTieCount > 0
      ),
      'Straight-line railway mainline streams infinitely across distant northern chunks with instanced ties'
    );

    const hwyChunkInfra = streaming.computeInfiniteLinearInfrastructureForChunk(
      2, // chunkX=2 covers gx=128..191 (highway gx=123..134)
      distantNorthChunkZ,
      64
    );
    assert.ok(
      hwyChunkInfra.some(
        (s) => s.kind === 'MULTI_LANE_HIGHWAY' && s.laneOrTrackCount === 10
      ),
      '10-lane divided highway streams infinitely across distant northern chunks'
    );

    const riverChunkInfra =
      streaming.computeInfiniteLinearInfrastructureForChunk(
        1, // chunkX=1 covers gx=64..127 (river channel)
        distantNorthChunkZ,
        64
      );
    assert.ok(
      riverChunkInfra.some((s) => s.kind === 'RIVER_CHANNEL'),
      'River channel streams infinitely across distant northern chunks'
    );

    // 4. Performance Optimization, Instanced Rendering & Frustum Culling Telemetry
    streaming.flushAllPendingChunks(100, -10_000, 'HIGH');
    const perf = streaming.getPerformanceTelemetry();
    assert.equal(perf.activeLoadedChunks, 81);
    assert.ok(perf.frustumVisibleChunks > 0);
    assert.ok(perf.frustumCulledChunks > 0);
    assert.ok(perf.totalInstancedTrees > 0);
    assert.ok(perf.totalInstancedRailTies > 0);

    // 5. Massive Coordinate Save State Scaling (64-bit BigInt packed keys & high-precision coordinate round-trip)
    const farCoord = { gx: 10_250_000, gz: -10_750_000 };
    const packedBigInt = encodeCoordKey64BigInt(farCoord.gx, farCoord.gz);
    assert.deepEqual(decodeCoordKey64BigInt(packedBigInt), farCoord);

    const packedHex = encodeCoordKey64Hex(farCoord.gx, farCoord.gz);
    assert.deepEqual(decodeCoordKey64Hex(packedHex), farCoord);

    const precStr = formatHighPrecisionCoordKey(farCoord.gx, farCoord.gz);
    assert.deepEqual(parseHighPrecisionCoordKey(precStr), farCoord);

    // Register a distant frontier Railway Yard at (10_250_000, -10_750_000) and verify save/load persistence
    streaming.registerMassiveInfrastructureAnchor({
      id: 'anchor-frontier-rail-yard-north-10m',
      category: 'RAILWAY_YARD',
      name: 'Northern 10M Frontier Intermodal Yard',
      gx: farCoord.gx,
      gz: farCoord.gz,
      widthCells: 40,
      depthCells: 50,
      metadata: { trackLines: 6 },
    });

    const savedJson = world.serializeState();
    const restoredWorld = new WorldManager();
    const loadResult = restoredWorld.deserializeState(savedJson);
    assert.equal(loadResult.success, true);

    const restoredAnchor = restoredWorld.streaming.getMassiveAnchorAtCoord(
      farCoord.gx,
      farCoord.gz
    );
    assert.ok(restoredAnchor);
    assert.equal(restoredAnchor.id, 'anchor-frontier-rail-yard-north-10m');
    assert.equal(restoredAnchor.gx, farCoord.gx);
    assert.equal(restoredAnchor.gz, farCoord.gz);
    assert.equal(restoredAnchor.packedCoordKey64Hex, packedHex);
  });
});




