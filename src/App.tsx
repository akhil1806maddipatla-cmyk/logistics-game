/**
 * Global Transport Empire — Main Game Shell & Tycoon Gameplay Interface (Master Prompts 1–7)
 *
 * Implements the Master Prompt 7 Complete Gameplay Controls, Construction Menu & Interaction Overhaul:
 * - Clean, uncluttered normal gameplay HUD (>= 88% unobstructed 3D world).
 * - Prominent primary BUILD button with 2-level visual category & card navigation.
 * - Intuitive draw-to-build road construction with visual 2-lane / 4-lane / 6-lane selectors.
 * - 3D semi-transparent building placement previews with simple human-readable feedback.
 * - Safe 2-step demolition with target highlight and 60% refund confirmation.
 * - Game-like Land Purchase mode with automatic parcel highlighting and charter cards.
 * - Streamlined Vehicle Management (Trucks, Trains, Aircraft, Ships) and 2-step Contract Dispatch.
 * - Contextual Facility Management cards with expandable details.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BuildingVisualPreview,
  CategoryPreviewIllustration,
  formatFriendlyVehicleState,
  formatFriendlyZoneName,
  MAIN_BUILD_CATEGORIES,
  MainBuildCategoryId,
  ModalTabLabel,
  RoadVisualPreview,
  simplifyPlacementReason,
  VehicleVisualPreview,
} from './components/TycoonVisuals';
import { audioSynth } from './engine/AudioSynth';
import {
  BUILDING_CATALOGUE,
  BuildingCatalogueItem,
  getBuildingSpecById,
  getVehicleSpecById,
  TransportModalCategory,
  VEHICLE_CATALOGUE,
  VehicleCatalogueItem,
} from './engine/Catalogues';
import {
  OwnedVehicleRecord,
  PlacedBuildingRecord,
  TransportContractRecord,
} from './engine/EconomyAndSimulationSystem';
import { GridCoord } from './engine/GridSystem';
import { LandParcel } from './engine/ParcelSystem';
import {
  AIR_CARGO_MATERIAL_SPECS,
  AIRCRAFT_HANGAR_PURCHASE_COST,
  AIRPORT_LOCKED_UI_TITLE,
  AIRPORT_MAX_CARGO_CAPACITY_TONS,
  AIRPORT_MAX_LEVEL,
  AIRPORT_MAX_PARKING_AREAS,
  AIRPORT_PURCHASE_PRICE,
  AIRPORT_UNLOCK_LEVEL,
  AircraftHangarRecord,
  AirportCargoWarehouseState,
  AirportInfrastructureRecord,
  AirportTransferYardState,
  CargoAircraftRecord,
  FIRST_OWNED_AIRCRAFT_PRICE,
  FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL,
  getAirportCargoCapacityForLevel,
  getAirportParkingAreaPriceForLevel,
  getAirportUnlockedStandsForLevel,
  getUnlockedAirCargoMaterialsForLevel,
  GUEST_AIRCRAFT_CATALOGUE,
  HangarSlotId,
  MAX_PLAYER_AIRCRAFT,
  SECOND_OWNED_AIRCRAFT_PRICE,
  SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL,
} from './engine/AirportSystem';
import { ROAD_SPECS, RoadWidthConfig, ZoneCategory } from './engine/WorldConfig';
import {
  getWarehouseCapacitiesForLevel,
  getWarehouseConstructedFootprintForLevel,
  getWarehouseDoorCountForLevel,
  getWarehouseForkliftCountForLevel,
  WarehouseFacilityState,
} from './engine/WarehouseSystem';
import {
  getTruckDepotLevelSpec,
  TRUCK_DEPOT_ID,
  TRUCK_DEPOT_MAX_LEVEL,
  TruckDepotFacilityState,
} from './engine/TruckDepotSystem';
import {
  GRAPHICS_QUALITY_PRESETS,
  GraphicsQualityPreset,
  parseGraphicsQualityPreset,
} from './engine/GraphicsQualitySystem';
import {
  GTE_FORKLIFT_MODEL_360_SPEC,
  GTE_ROLLING_STOCK_SPEC,
  RAILWAY_YARD_LOCKED_UI_TITLE,
  RAILWAY_YARD_RESERVED_FOOTPRINT,
  RailwayFreightHubState,
} from './engine/RailwaySystem';
import { CellInspectionReport, WorldManager } from './engine/WorldManager';
import { DebugOverlaySettings, WorldRenderer } from './engine/WorldRenderer';

type GameScreenState = 'title' | 'playing' | 'paused';

type BuildingOrientation = 0 | 90 | 180 | 270;

type ActiveToolMode =
  | 'INSPECT'
  | 'ROAD_STRAIGHT'
  | 'ROAD_CURVED'
  | 'ROAD_BRIDGE'
  | 'RAIL_BRIDGE'
  | 'BUILD_STRUCTURE'
  | 'LAND_SELECT'
  | 'DEMOLISH';

type ActiveGamePanel = 'NONE' | 'BUILD' | 'CONTRACTS' | 'VEHICLES' | 'LAND';

interface PendingDemolitionTarget {
  kind: 'BUILDING' | 'ROAD' | 'BRIDGE';
  id: string;
  name: string;
  refundAmount: number;
  coord: GridCoord;
}

export interface WorldHudSnapshot {
  gridWidth: number;
  gridDepth: number;
  worldWidth: number;
  worldDepth: number;
  roadCount: number;
  highwayConnectedRoads: number;
  trackLinesCount: number;
  maxTrackLines: number;
  ownedRailTiles: number;
  totalRailTiles: number;
  bridgesCount: number;
  portBerthsCount: number;
  money: number;
  netIncome: number;
  level: number;
  levelTitle: string;
  xp: number;
  nextLevelXp: number;
  xpProgressPercent: number;
  roadSlotsUsed: number;
  roadSlotsMax: number;
  ownedVehicles: OwnedVehicleRecord[];
  contracts: TransportContractRecord[];
  placedBuildingsCount: number;
  parcels: LandParcel[];
  truckDepot?: TruckDepotFacilityState | null;
  warehouse1?: WarehouseFacilityState | null;
  airport?: AirportInfrastructureRecord | null;
  airportWarehouse?: AirportCargoWarehouseState | null;
  airportTransferYard?: AirportTransferYardState | null;
  aircraftHangars?: AircraftHangarRecord[];
  playerCargoAircraft?: CargoAircraftRecord[];
  npcSupplyAircraft?: CargoAircraftRecord[];
  guestAircraft?: CargoAircraftRecord[];
  guestArrivalsHandled?: number;
  railHub?: RailwayFreightHubState | null;
}

const SAVE_STORAGE_KEY = 'gte_authoritative_world_save_v1';

function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<WorldManager | null>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);

  const [gameState, setGameState] = useState<GameScreenState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return 'playing';
      }
    }
    return 'title';
  });

  // Main UI Navigation & Progressive Disclosure State
  const [activePanel, setActivePanel] = useState<ActiveGamePanel>('NONE');
  const [hudScale, setHudScale] = useState<'compact' | 'normal' | 'large'>(
    'normal'
  );
  const [buildCategory, setBuildCategory] =
    useState<MainBuildCategoryId | null>(null);
  const [buildSearchQuery, setBuildSearchQuery] = useState<string>('');
  const [expandedCardInfoId, setExpandedCardInfoId] = useState<string | null>(
    null
  );

  // Active Tool & Construction State
  const [activeTool, setActiveTool] = useState<ActiveToolMode>('INSPECT');
  const [selectedRoadWidth, setSelectedRoadWidth] =
    useState<RoadWidthConfig>('2x2');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    'bld-ind-small-warehouse'
  );
  const [buildingOrientation, setBuildingOrientation] =
    useState<BuildingOrientation>(0);
  const [showPlacementInfo, setShowPlacementInfo] = useState<boolean>(false);

  // Hover & Selection State
  const [startAnchor, setStartAnchor] = useState<GridCoord | null>(null);
  const [hoveredCoord, setHoveredCoord] = useState<GridCoord | null>(null);
  const [hoverPlacementStatus, setHoverPlacementStatus] = useState<{
    valid: boolean;
    message: string;
    cost: number;
  }>({ valid: true, message: 'Ready to place', cost: 0 });

  const [selectedCellReport, setSelectedCellReport] =
    useState<CellInspectionReport | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null
  );
  const [expandedInspectorDetails, setExpandedInspectorDetails] =
    useState<boolean>(false);
  const [pendingDemolish, setPendingDemolish] =
    useState<PendingDemolitionTarget | null>(null);

  // Vehicle & Contract Panel Sub-States
  const [vehicleTabModal, setVehicleTabModal] =
    useState<TransportModalCategory>('ROAD');
  const [vehicleSubView, setVehicleSubView] = useState<'FLEET' | 'SHOP'>(
    'FLEET'
  );
  const [dispatchingContractId, setDispatchingContractId] = useState<
    string | null
  >(null);
  const [selectedContractVehicleId, setSelectedContractVehicleId] = useState<
    string | null
  >(null);
  const [airportInspectorTab, setAirportInspectorTab] = useState<
    'OVERVIEW' | 'UPGRADE' | 'PARKING_AREAS' | 'GUEST_AIRCRAFT'
  >('OVERVIEW');
  const [selectedGuestAircraftModelId, setSelectedGuestAircraftModelId] =
    useState<string>(GUEST_AIRCRAFT_CATALOGUE[0].id);
  const [airportModal, setAirportModal] = useState<{
    title: string;
    message: string;
    tone: 'warning' | 'confirm';
    confirmLabel?: string;
    onConfirm?: () => void;
  } | null>(null);
  const [, setProjectedLockBadges] = useState<
    Array<{
      id: 'AIRPORT_MAIN' | 'HANGAR_1' | 'HANGAR_2' | 'AIRPORT_EXPANSION';
      label: string;
      subLabel: string;
      cost: number;
      screenX: number;
      screenY: number;
      visible: boolean;
    }>
  >([]);

  // Notifications & Settings
  const [statusMessage, setStatusMessage] = useState<string>(
    'Welcome! Click BUILD to construct roads and buildings, or click any object in the world.'
  );
  const [statusTone, setStatusTone] = useState<'info' | 'success' | 'error'>(
    'info'
  );
  const [showTopDetails, setShowTopDetails] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQualityPreset>(
    () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        return parseGraphicsQualityPreset(params.get('graphics'));
      }
      return 'HIGH';
    }
  );
  const [debugSettings, setDebugSettings] = useState<DebugOverlaySettings>({
    showGrid: false,
    showZones: false,
    showParcels: false,
  });

  const [hudStats, setHudStats] = useState<WorldHudSnapshot>({
    gridWidth: 160,
    gridDepth: 120,
    worldWidth: 320,
    worldDepth: 240,
    roadCount: 6,
    highwayConnectedRoads: 5,
    trackLinesCount: 1,
    maxTrackLines: 6,
    ownedRailTiles: 1,
    totalRailTiles: 4,
    bridgesCount: 0,
    portBerthsCount: 2,
    money: 125000,
    netIncome: 125000,
    level: 1,
    levelTitle: 'Regional Dispatch Contractor',
    xp: 0,
    nextLevelXp: 250,
    xpProgressPercent: 0,
    roadSlotsUsed: 3,
    roadSlotsMax: 3,
    ownedVehicles: [],
    contracts: [],
    placedBuildingsCount: 18,
    parcels: [],
  });

  // Mutable refs for Three.js loop callbacks
  const toolRef = useRef<ActiveToolMode>(activeTool);
  toolRef.current = activeTool;
  const roadWidthRef = useRef<RoadWidthConfig>(selectedRoadWidth);
  roadWidthRef.current = selectedRoadWidth;
  const selectedBuildingRef = useRef<string>(selectedBuildingId);
  selectedBuildingRef.current = selectedBuildingId;
  const buildingOrientationRef =
    useRef<BuildingOrientation>(buildingOrientation);
  buildingOrientationRef.current = buildingOrientation;
  const startAnchorRef = useRef<GridCoord | null>(startAnchor);
  startAnchorRef.current = startAnchor;
  const gameStateRef = useRef<GameScreenState>(gameState);
  gameStateRef.current = gameState;

  const syncHudStats = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    const allRoads = w.roads.getAllSegments();
    const connectedRoads = allRoads.filter(
      (r) => r.isConnectedToHighway
    ).length;
    const railParcels = w.parcels.getRailYardParcels();
    const ownedRail = railParcels.filter((p) => p.owned).length;
    const levelInfo = w.economy.getLevelProgressInfo();
    const roadCap = w.economy.getModalCapacitySummary('ROAD');

    const lvlMsg = w.economy.consumeLevelUpNotification();
    if (lvlMsg) {
      setStatusMessage(lvlMsg);
      setStatusTone('success');
    }

    setHudStats({
      gridWidth: w.config.gridWidth,
      gridDepth: w.config.gridDepth,
      worldWidth: w.config.worldWidth,
      worldDepth: w.config.worldDepth,
      roadCount: allRoads.length,
      highwayConnectedRoads: connectedRoads,
      trackLinesCount: w.railways.getAllTracks().length,
      maxTrackLines: w.config.railCorridor.maxParallelTracks,
      ownedRailTiles: ownedRail,
      totalRailTiles: railParcels.length,
      bridgesCount: w.bridgesAndPort.getAllBridges().length,
      portBerthsCount: w.bridgesAndPort.getPortHarbour().berths.length,
      money: w.economy.getMoney(),
      netIncome: w.economy.getNetPerformance(),
      level: levelInfo.level,
      levelTitle: levelInfo.title,
      xp: w.economy.getXp(),
      nextLevelXp: levelInfo.nextLevelXp,
      xpProgressPercent: Math.round(levelInfo.progressRatio * 100),
      roadSlotsUsed: roadCap.usedSlots,
      roadSlotsMax: roadCap.totalSlots,
      ownedVehicles: [...w.economy.getOwnedVehicles()],
      contracts: [...w.economy.getContracts()],
      placedBuildingsCount: w.economy.getAllPlacedBuildings().length,
      parcels: [...w.parcels.getAllParcels()],
      truckDepot: w.economy.getTruckDepot(),
      warehouse1: w.economy.getWarehouse('facility-warehouse-1') ?? null,
      airport: w.economy.getAirport(),
      airportWarehouse: w.economy.getAirportWarehouse(),
      airportTransferYard: w.economy.getAirportTransferYard(),
      aircraftHangars: [...w.economy.getAircraftHangars()],
      playerCargoAircraft: [...w.economy.getPlayerCargoAircraft()],
      npcSupplyAircraft: [...w.economy.getNpcSupplyAircraft()],
      guestAircraft: [...w.economy.getGuestAircraft()],
      guestArrivalsHandled: w.economy.getGuestArrivalsHandled(),
      railHub: w.economy.getRailwayFreightHubState(),
    });

    if (rendererRef.current) {
      setProjectedLockBadges(
        rendererRef.current.getProjectedAirportLockBadges()
      );
    }

    setSelectedCellReport((prev) =>
      prev ? w.inspectCell(prev.gx, prev.gz) : null
    );
  }, []);

  // Mirror game state to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = gameState;
    if (rendererRef.current) {
      rendererRef.current.setTitleTourActive(gameState === 'title');
    }
  }, [gameState]);

  // Automatically highlight land parcels when in LAND panel or LAND_SELECT mode, and keep world clean otherwise
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    const shouldShowParcels =
      activePanel === 'LAND' ||
      activeTool === 'LAND_SELECT' ||
      (activePanel === 'BUILD' && buildCategory === 'LAND') ||
      debugSettings.showParcels;

    r.setDebugSettings({
      ...debugSettings,
      showParcels: shouldShowParcels,
    });
  }, [activePanel, activeTool, buildCategory, debugSettings]);

  // Periodic UI refresh while playing so contract progress & vehicle states update smoothly
  useEffect(() => {
    if (gameState !== 'playing') return;
    const timer = window.setInterval(() => {
      syncHudStats();
    }, 300);
    return () => window.clearInterval(timer);
  }, [gameState, syncHudStats]);

  const startGame = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.dataset.state = 'playing';
    setGameState('playing');
    if (rendererRef.current) {
      rendererRef.current.setTitleTourActive(false);
    }
    audioSynth.playPlaceInfrastructure('EXPAND');
  }, []);

  const cancelActiveConstruction = useCallback(() => {
    setActiveTool('INSPECT');
    toolRef.current = 'INSPECT';
    setStartAnchor(null);
    startAnchorRef.current = null;
    setPendingDemolish(null);
    rendererRef.current?.updateConstructionPreview({
      active: false,
      valid: true,
      cells: [],
    });
    setStatusMessage('Returned to normal gameplay view.');
    setStatusTone('info');
  }, []);

  // Update live construction preview & human-friendly feedback when hovering
  const updatePreviewForHover = useCallback((coord: GridCoord | null) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;

    setHoveredCoord(coord);

    if (!coord || gameStateRef.current !== 'playing') {
      r.updateConstructionPreview({ active: false, valid: true, cells: [] });
      return;
    }

    const mode = toolRef.current;
    const widthCfg = roadWidthRef.current;
    const anchor = startAnchorRef.current;

    if (mode === 'INSPECT' || mode === 'LAND_SELECT') {
      r.updateConstructionPreview({
        active: true,
        valid: true,
        cells: [coord],
      });
      return;
    }

    if (mode === 'BUILD_STRUCTURE') {
      const catId = selectedBuildingRef.current;
      const orient = buildingOrientationRef.current;
      const val = w.economy.validateBuildingPlacement(
        catId,
        coord.gx,
        coord.gz,
        orient
      );
      const spec = getBuildingSpecById(catId);
      setHoverPlacementStatus({
        valid: val.valid,
        message: val.valid
          ? 'Suitable plot — click to place building'
          : simplifyPlacementReason(val.reason),
        cost: spec?.price ?? 0,
      });
      r.updateConstructionPreview({
        active: true,
        valid: val.valid,
        cells: val.cells.length > 0 ? val.cells : [coord],
        buildingCatalogueId: catId,
        orientation: orient,
      });
      return;
    }

    if (mode === 'DEMOLISH') {
      const bldg = w.economy.getPlacedBuildingAtCell(coord.gx, coord.gz);
      const bridge = w.bridgesAndPort.getBridgeAtCell(coord.gx, coord.gz);
      const road = w.roads.getRoadAtCell(coord.gx, coord.gz);
      const canDemolish =
        Boolean(bldg && !bldg.isPreplaced) || Boolean(bridge) || Boolean(road);

      const cells = bldg
        ? w.grid.getFootprint(
            bldg.gx,
            bldg.gz,
            bldg.widthCells,
            bldg.depthCells,
            bldg.orientation
          ).cells
        : bridge
          ? bridge.pathCells
          : road
            ? road.coveredCells
            : [coord];

      r.updateConstructionPreview({
        active: true,
        valid: canDemolish,
        cells,
      });
      return;
    }

    // Road / Bridge tools before start anchor is clicked
    if (!anchor) {
      const footprint = w.roads.computeStraightCells(coord, coord, widthCfg);
      const cellValid = !w.terrainWater.isWaterAt(coord.gx, coord.gz);
      const unitCost = w.economy.calculateRoadCost(footprint.length, widthCfg);
      setHoverPlacementStatus({
        valid: cellValid,
        message: cellValid
          ? 'Click to set starting point'
          : 'Starting point must be on dry land',
        cost: unitCost,
      });
      r.updateConstructionPreview({
        active: true,
        valid: cellValid,
        cells: footprint,
      });
      return;
    }

    if (mode === 'ROAD_STRAIGHT') {
      const val = w.roads.validateRoadPlacement(
        anchor,
        coord,
        widthCfg,
        'STRAIGHT'
      );
      const cost = w.economy.calculateRoadCost(
        val.coveredCells.length,
        widthCfg
      );
      setHoverPlacementStatus({
        valid: val.valid,
        message: val.valid
          ? 'Valid road connection — click to complete'
          : simplifyPlacementReason(val.reason),
        cost,
      });
      r.updateConstructionPreview({
        active: true,
        valid: val.valid,
        cells: val.coveredCells.length > 0 ? val.coveredCells : [coord],
      });
    } else if (mode === 'ROAD_CURVED') {
      const ctrl = { gx: coord.gx, gz: anchor.gz };
      const val = w.roads.validateRoadPlacement(
        anchor,
        coord,
        widthCfg,
        'CURVED',
        ctrl
      );
      const cost = w.economy.calculateRoadCost(
        val.coveredCells.length,
        widthCfg
      );
      setHoverPlacementStatus({
        valid: val.valid,
        message: val.valid
          ? 'Valid curved road — click to complete'
          : simplifyPlacementReason(val.reason),
        cost,
      });
      r.updateConstructionPreview({
        active: true,
        valid: val.valid,
        cells: val.coveredCells.length > 0 ? val.coveredCells : [coord],
      });
    } else if (mode === 'ROAD_BRIDGE') {
      const val = w.bridgesAndPort.validateBridgePlacement(
        'ROAD_BRIDGE',
        anchor,
        coord,
        widthCfg
      );
      const cost = w.economy.calculateBridgeCost(
        val.pathCells.length,
        'ROAD_BRIDGE',
        widthCfg
      );
      setHoverPlacementStatus({
        valid: val.valid,
        message: val.valid
          ? 'Valid bridge span across water — click to build'
          : simplifyPlacementReason(val.reason),
        cost,
      });
      r.updateConstructionPreview({
        active: true,
        valid: val.valid,
        cells: val.pathCells.length > 0 ? val.pathCells : [anchor, coord],
        elevated: true,
      });
    } else if (mode === 'RAIL_BRIDGE') {
      const val = w.bridgesAndPort.validateBridgePlacement(
        'RAIL_BRIDGE',
        anchor,
        coord,
        '1x1'
      );
      const cost = w.economy.calculateBridgeCost(
        val.pathCells.length,
        'RAIL_BRIDGE',
        '1x1'
      );
      setHoverPlacementStatus({
        valid: val.valid,
        message: val.valid
          ? 'Valid rail bridge span — click to build'
          : simplifyPlacementReason(val.reason),
        cost,
      });
      r.updateConstructionPreview({
        active: true,
        valid: val.valid,
        cells: val.pathCells.length > 0 ? val.pathCells : [anchor, coord],
        elevated: true,
      });
    }
  }, []);

  // Commit placement at a specific coordinate (works for both canvas click and on-screen Confirm button)
  const commitWorldActionAtCoord = useCallback(
    (coord: GridCoord) => {
      const w = worldRef.current;
      const r = rendererRef.current;
      if (!w || !r) return;

      const report = w.inspectCell(coord.gx, coord.gz);
      const mode = toolRef.current;
      const widthCfg = roadWidthRef.current;
      const anchor = startAnchorRef.current;

      if (mode === 'INSPECT' || mode === 'LAND_SELECT') {
        // Check if player clicked directly on an unpurchased Hangar 1, Hangar 2, or Airport Terminal footprint in 3D
        const ap = w.economy.getAirport();
        const hangars = w.economy.getAircraftHangars();
        const h1 = hangars.find((h) => h.id === 'HANGAR_1');
        const h2 = hangars.find((h) => h.id === 'HANGAR_2');
        if (
          h1 &&
          !h1.constructed &&
          coord.gx >= h1.bounds.minGx &&
          coord.gx <= h1.bounds.maxGx &&
          coord.gz >= h1.bounds.minGz &&
          coord.gz <= h1.bounds.maxGz
        ) {
          handleWorldLockBadgeClickRef.current('HANGAR_1');
        } else if (
          h2 &&
          !h2.constructed &&
          coord.gx >= h2.bounds.minGx &&
          coord.gx <= h2.bounds.maxGx &&
          coord.gz >= h2.bounds.minGz &&
          coord.gz <= h2.bounds.maxGz
        ) {
          handleWorldLockBadgeClickRef.current('HANGAR_2');
        } else if (
          !ap.owned &&
          coord.gx >= ap.cargoTerminalBounds.minGx &&
          coord.gx <= ap.cargoTerminalBounds.maxGx &&
          coord.gz >= ap.cargoTerminalBounds.minGz &&
          coord.gz <= ap.cargoTerminalBounds.maxGz
        ) {
          handleWorldLockBadgeClickRef.current('AIRPORT_MAIN');
        } else if (
          report.zoneCategory === 'RAIL_YARD' &&
          !w.economy.getRailwayFreightHubState().owned
        ) {
          setAirportModal({
            title: RAILWAY_YARD_LOCKED_UI_TITLE,
            message: `Purchase the 40×50 GTE Intermodal Railway Freight Terminal (${formatMoney(RAILWAY_YARD_RESERVED_FOOTPRINT.purchasePrice)}) to unlock GTE-L1 Locomotive & Model 360 Forklift job dispatch.`,
            tone: 'confirm',
            confirmLabel: `Purchase (${formatMoney(RAILWAY_YARD_RESERVED_FOOTPRINT.purchasePrice)})`,
            onConfirm: () => {
              const purchaseRes = w.economy.purchaseRailwayYard();
              if (purchaseRes.success) {
                r.rebuildRailwayVisuals();
                r.rebuildVehiclesVisuals();
                audioSynth.playPlaceInfrastructure('RAIL');
                setAirportModal(null);
                syncHudStats();
                setStatusMessage(
                  `Purchased 40×50 GTE Intermodal Railway Freight Terminal for ${formatMoney(RAILWAY_YARD_RESERVED_FOOTPRINT.purchasePrice)}!`
                );
                setStatusTone('success');
              } else {
                audioSynth.playReject();
                setStatusMessage(
                  purchaseRes.reason || 'Cannot purchase Railway Yard.'
                );
                setStatusTone('error');
              }
            },
          });
        }

        setSelectedVehicleId(null);
        setSelectedCellReport(report);
        setExpandedInspectorDetails(false);
        if (report.building) {
          setStatusMessage(`Selected ${report.building.name}.`);
        } else if (report.parcelName) {
          setStatusMessage(
            `Inspected ${report.parcelName} (${report.parcelOwned ? 'Owned Land' : `Available for ${formatMoney(report.parcelPrice)}`}).`
          );
        }
        setStatusTone('info');
        return;
      }

      if (mode === 'BUILD_STRUCTURE') {
        const catId = selectedBuildingRef.current;
        const orient = buildingOrientationRef.current;
        const res = w.economy.constructBuilding(
          catId,
          coord.gx,
          coord.gz,
          orient
        );
        if (res.success && res.building) {
          const spec = getBuildingSpecById(catId);
          r.rebuildAllWorldVisuals();
          r.addCameraShake(0.24);
          audioSynth.playPlaceInfrastructure('EXPAND');
          syncHudStats();
          setSelectedCellReport(w.inspectCell(coord.gx, coord.gz));
          setStatusMessage(
            `Built ${res.building.name} for ${formatMoney(spec?.price || 0)} (+65 XP)!`
          );
          setStatusTone('success');
          // Return smoothly to normal gameplay mode after building placement
          setActiveTool('INSPECT');
          toolRef.current = 'INSPECT';
          r.updateConstructionPreview({
            active: false,
            valid: true,
            cells: [],
          });
        } else {
          audioSynth.playReject();
          setStatusMessage(simplifyPlacementReason(res.reason));
          setStatusTone('error');
        }
        return;
      }

      if (mode === 'DEMOLISH') {
        const bldg = w.economy.getPlacedBuildingAtCell(coord.gx, coord.gz);
        if (bldg) {
          if (bldg.isPreplaced) {
            audioSynth.playReject();
            setStatusMessage(
              `${bldg.name} is a core regional facility and cannot be demolished.`
            );
            setStatusTone('error');
            return;
          }
          const spec = getBuildingSpecById(bldg.catalogueId);
          const refund = Math.round((spec?.price ?? 8000) * 0.6);
          setPendingDemolish({
            kind: 'BUILDING',
            id: bldg.id,
            name: bldg.name,
            refundAmount: refund,
            coord,
          });
          setStatusMessage(
            `Confirm demolition of ${bldg.name} (+${formatMoney(refund)} refund).`
          );
          setStatusTone('info');
          return;
        }

        const bridge = w.bridgesAndPort.getBridgeAtCell(coord.gx, coord.gz);
        if (bridge) {
          setPendingDemolish({
            kind: 'BRIDGE',
            id: bridge.id,
            name:
              bridge.category === 'ROAD_BRIDGE'
                ? 'Road Bridge'
                : 'Railway Bridge',
            refundAmount: 1800,
            coord,
          });
          setStatusMessage(
            'Confirm bridge demolition (+$1,800 salvage refund).'
          );
          setStatusTone('info');
          return;
        }

        const road = w.roads.getRoadAtCell(coord.gx, coord.gz);
        if (road) {
          setPendingDemolish({
            kind: 'ROAD',
            id: road.id,
            name: `${road.spec.totalLanes}-Lane Road Segment`,
            refundAmount: 600,
            coord,
          });
          setStatusMessage('Confirm road demolition (+$600 salvage refund).');
          setStatusTone('info');
          return;
        }

        audioSynth.playReject();
        setStatusMessage(
          'Click a player-built road, bridge, or building to demolish it.'
        );
        setStatusTone('error');
        return;
      }

      // Road & Bridge Draw-to-Build Flow: Click 1 sets start point, Click 2 completes road
      if (!anchor) {
        if (w.terrainWater.isWaterAt(coord.gx, coord.gz)) {
          audioSynth.playReject();
          setStatusMessage('Starting point must be on dry land.');
          setStatusTone('error');
          return;
        }
        setStartAnchor(coord);
        startAnchorRef.current = coord;
        setStatusMessage(
          'Starting point set! Move cursor to preview the road and click destination to complete.'
        );
        setStatusTone('info');
        updatePreviewForHover(coord);
        return;
      }

      if (mode === 'ROAD_STRAIGHT' || mode === 'ROAD_CURVED') {
        const shape = mode === 'ROAD_CURVED' ? 'CURVED' : 'STRAIGHT';
        const ctrl =
          shape === 'CURVED' ? { gx: coord.gx, gz: anchor.gz } : undefined;
        const val = w.roads.validateRoadPlacement(
          anchor,
          coord,
          widthCfg,
          shape,
          ctrl
        );
        if (!val.valid) {
          audioSynth.playReject();
          setStatusMessage(simplifyPlacementReason(val.reason));
          setStatusTone('error');
          return;
        }

        const roadCost = w.economy.calculateRoadCost(
          val.coveredCells.length,
          widthCfg
        );
        const charge = w.economy.chargeInfrastructureCost(
          'ROAD_CONSTRUCTION',
          roadCost,
          `Constructed ${widthCfg} ${shape.toLowerCase()} road`
        );
        if (!charge.success) {
          audioSynth.playReject();
          setStatusMessage('Not enough money to build this road segment.');
          setStatusTone('error');
          return;
        }

        const res = w.roads.buildRoad(anchor, coord, widthCfg, shape, ctrl);
        if (res.success && res.segment) {
          w.economy.awardXp(35, `Built road ${res.segment.id}`);
          r.rebuildRoadVisuals();
          r.rebuildRailwayVisuals();
          r.addCameraShake(0.22);
          audioSynth.playPlaceInfrastructure('ROAD');
          syncHudStats();
          setStartAnchor(null);
          startAnchorRef.current = null;
          setStatusMessage(
            `Built ${res.segment.spec.totalLanes}-lane road for ${formatMoney(roadCost)} (+35 XP)!`
          );
          setStatusTone('success');
          r.updateConstructionPreview({ active: false, valid: true, cells: [] });
        } else {
          audioSynth.playReject();
          setStatusMessage(simplifyPlacementReason(res.reason));
          setStatusTone('error');
        }
        return;
      }

      if (mode === 'ROAD_BRIDGE' || mode === 'RAIL_BRIDGE') {
        const cat = mode === 'ROAD_BRIDGE' ? 'ROAD_BRIDGE' : 'RAIL_BRIDGE';
        const val = w.bridgesAndPort.validateBridgePlacement(
          cat,
          anchor,
          coord,
          widthCfg
        );
        if (!val.valid) {
          audioSynth.playReject();
          setStatusMessage(simplifyPlacementReason(val.reason));
          setStatusTone('error');
          return;
        }
        const bridgeCost = w.economy.calculateBridgeCost(
          val.pathCells.length,
          cat,
          widthCfg
        );
        const charge = w.economy.chargeInfrastructureCost(
          'BRIDGE_CONSTRUCTION',
          bridgeCost,
          `Constructed ${cat}`
        );
        if (!charge.success) {
          audioSynth.playReject();
          setStatusMessage('Not enough money to build this bridge.');
          setStatusTone('error');
          return;
        }

        const res = w.bridgesAndPort.buildBridge(
          cat,
          anchor,
          coord,
          widthCfg
        );
        if (res.success && res.bridge) {
          w.economy.awardXp(85, `Built bridge ${res.bridge.id}`);
          r.rebuildBridgesVisuals();
          r.rebuildRoadVisuals();
          r.addCameraShake(0.32);
          audioSynth.playPlaceInfrastructure('BRIDGE');
          syncHudStats();
          setStartAnchor(null);
          startAnchorRef.current = null;
          setStatusMessage(
            `Constructed ${cat === 'ROAD_BRIDGE' ? 'Road Bridge' : 'Railway Bridge'} for ${formatMoney(bridgeCost)} (+85 XP)!`
          );
          setStatusTone('success');
          r.updateConstructionPreview({ active: false, valid: true, cells: [] });
        } else {
          audioSynth.playReject();
          setStatusMessage(simplifyPlacementReason(res.reason));
          setStatusTone('error');
        }
      }
    },
    [syncHudStats, updatePreviewForHover]
  );

  // Handle cell click in the 3D world
  const handleWorldCellClick = useCallback(
    (coord: GridCoord, button: number) => {
      if (gameStateRef.current !== 'playing') return;

      // Right-click cancels active anchor or exits placement mode
      if (button === 2) {
        if (startAnchorRef.current) {
          setStartAnchor(null);
          startAnchorRef.current = null;
          setStatusMessage('Starting point cleared.');
          setStatusTone('info');
          updatePreviewForHover(coord);
        } else if (toolRef.current !== 'INSPECT') {
          cancelActiveConstruction();
        }
        return;
      }

      commitWorldActionAtCoord(coord);
    },
    [cancelActiveConstruction, commitWorldActionAtCoord, updatePreviewForHover]
  );

  // Execute confirmed demolition (Master Prompt 7 Part 3.6)
  const handleExecuteConfirmedDemolish = () => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r || !pendingDemolish) return;

    if (pendingDemolish.kind === 'BUILDING') {
      const res = w.economy.demolishBuilding(pendingDemolish.id);
      if (res.success) {
        r.rebuildAllWorldVisuals();
        r.addCameraShake(0.28);
        audioSynth.playDemolish();
        syncHudStats();
        setSelectedCellReport(null);
        setStatusMessage(
          `Demolished ${pendingDemolish.name} (+${formatMoney(res.refund || 0)} refund).`
        );
        setStatusTone('success');
      } else {
        audioSynth.playReject();
        setStatusMessage(res.reason || 'Cannot demolish this building.');
        setStatusTone('error');
      }
    } else if (pendingDemolish.kind === 'BRIDGE') {
      const res = w.bridgesAndPort.demolishBridge(pendingDemolish.id);
      if (res.success) {
        const refund = w.economy.processDemolitionRefund(
          3000,
          `Demolished ${pendingDemolish.name}`,
          pendingDemolish.id
        );
        r.rebuildBridgesVisuals();
        r.rebuildRoadVisuals();
        r.addCameraShake(0.3);
        audioSynth.playDemolish();
        syncHudStats();
        setSelectedCellReport(null);
        setStatusMessage(
          `Demolished ${pendingDemolish.name} (+${formatMoney(refund)} refund).`
        );
        setStatusTone('success');
      }
    } else if (pendingDemolish.kind === 'ROAD') {
      const res = w.roads.demolishRoad(pendingDemolish.id);
      if (res.success) {
        const refund = w.economy.processDemolitionRefund(
          1000,
          `Demolished ${pendingDemolish.name}`,
          pendingDemolish.id
        );
        r.rebuildRoadVisuals();
        r.rebuildRailwayVisuals();
        r.addCameraShake(0.25);
        audioSynth.playDemolish();
        syncHudStats();
        setSelectedCellReport(null);
        setStatusMessage(
          `Demolished ${pendingDemolish.name} (+${formatMoney(refund)} refund).`
        );
        setStatusTone('success');
      } else {
        audioSynth.playReject();
        setStatusMessage(
          res.reason || 'Core highway & roundabout roads are protected.'
        );
        setStatusTone('error');
      }
    }

    setPendingDemolish(null);
  };

  // Initialize WorldManager & WorldRenderer once on mount
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const world = new WorldManager();
    worldRef.current = world;

    const params = new URLSearchParams(window.location.search);
    const initialAutostart = params.get('autostart') === '1';
    const previewAirportLvl = Number(params.get('airportLevel') || '0');
    if (params.get('unlockAirport') === '1') {
      world.economy.setPlayerLevel(100);
      world.economy.addMoney(20_000_000, 'Dev Unlock Funding');
    }
    if (previewAirportLvl >= 1 && previewAirportLvl <= 20) {
      world.economy.setPlayerLevel(100);
      world.economy.addMoney(150_000_000, 'Airport Preview Funding');
      world.economy.setAirportLevel(previewAirportLvl);
      if (params.get('airportHangars') === '1') {
        world.economy.constructAircraftHangar('HANGAR_1');
        world.economy.constructAircraftHangar('HANGAR_2');
      }
      if (params.get('inspectAirport') === '1') {
        setSelectedCellReport(world.inspectCell(170, 35));
      }
    }

    const previewDepotLvl = Number(params.get('depotLevel') || '0');
    if (previewDepotLvl >= 1 && previewDepotLvl <= 20) {
      world.economy.setPlayerLevel(Math.max(20, previewDepotLvl));
      world.economy.addMoney(5_000_000, 'Truck Depot Preview Funding');
      world.economy.setTruckDepotLevel(previewDepotLvl);
    }

    const renderer = new WorldRenderer(container, world, {
      onCellHover: (coord) => {
        updatePreviewForHover(coord);
      },
      onCellClick: (coord, button) => {
        handleWorldCellClick(coord, button);
      },
      onLockBadgeClick: (badgeId) => {
        handleWorldLockBadgeClickRef.current(badgeId);
      },
      onLockBadgesProjectionUpdate: (badges) => {
        setProjectedLockBadges(badges);
      },
    });
    rendererRef.current = renderer;

    renderer.setTitleTourActive(!initialAutostart);
    const viewParam = (params.get('view') || '').toUpperCase();
    if (
      viewParam === 'AIRPORT' ||
      viewParam === 'WORLD_EXPANSION' ||
      viewParam === 'OVERVIEW' ||
      viewParam === 'CITY_ROUNDABOUT' ||
      viewParam === 'TRUCK_DEPOT' ||
      viewParam === 'WAREHOUSE_1' ||
      viewParam === 'PORT_HARBOUR' ||
      viewParam === 'RAIL_YARD'
    ) {
      renderer.focusOnRegion(viewParam);
    }

    (window as unknown as Record<string, unknown>).__gte = {
      world,
      renderer,
      syncHudStats,
    };

    syncHudStats();

    return () => {
      renderer.dispose();
      rendererRef.current = null;
      worldRef.current = null;
    };
  }, [handleWorldCellClick, syncHudStats, updatePreviewForHover]);

  // Global keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (gameState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startGame();
        }
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (startAnchorRef.current || toolRef.current !== 'INSPECT') {
          cancelActiveConstruction();
          return;
        }
        if (activePanel !== 'NONE') {
          setActivePanel('NONE');
          return;
        }
        setGameState((prev) => (prev === 'playing' ? 'paused' : 'playing'));
        return;
      }

      if (e.code === 'KeyP') {
        e.preventDefault();
        setGameState((prev) => (prev === 'playing' ? 'paused' : 'playing'));
        return;
      }

      if (e.code === 'KeyR' && gameState === 'playing') {
        setBuildingOrientation((prev: BuildingOrientation) => {
          const next = ((prev + 90) % 360) as BuildingOrientation;
          buildingOrientationRef.current = next;
          if (hoveredCoord) updatePreviewForHover(hoveredCoord);
          return next;
        });
      } else if (e.code === 'KeyM') {
        const nextMuted = audioSynth.toggleMute();
        setIsMuted(nextMuted);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activePanel,
    cancelActiveConstruction,
    gameState,
    hoveredCoord,
    startGame,
    updatePreviewForHover,
  ]);

  // Helper to start Road or Bridge construction from the BUILD -> Roads menu
  const startRoadConstructionTool = (
    mode: 'ROAD_STRAIGHT' | 'ROAD_CURVED' | 'ROAD_BRIDGE' | 'RAIL_BRIDGE',
    widthCfg: RoadWidthConfig
  ) => {
    setSelectedRoadWidth(widthCfg);
    roadWidthRef.current = widthCfg;
    setActiveTool(mode);
    toolRef.current = mode;
    setStartAnchor(null);
    startAnchorRef.current = null;
    setActivePanel('NONE'); // Hide menu so 3D world is clear during construction
    const lanes = ROAD_SPECS[widthCfg].totalLanes;
    setStatusMessage(
      mode === 'ROAD_BRIDGE'
        ? `${lanes}-Lane Road Bridge: Click riverbank start point, then click opposite bank.`
        : mode === 'RAIL_BRIDGE'
          ? 'Railway Bridge: Click riverbank start point, then click opposite bank.'
          : `${lanes}-Lane ${mode === 'ROAD_CURVED' ? 'Curved' : 'Standard'} Road: Click start point on land, then move & click to complete.`
    );
    setStatusTone('info');
  };

  // Helper to start Building Placement from the BUILD menu
  const startBuildingPlacement = (entry: BuildingCatalogueItem) => {
    setSelectedBuildingId(entry.id);
    selectedBuildingRef.current = entry.id;
    setActiveTool('BUILD_STRUCTURE');
    toolRef.current = 'BUILD_STRUCTURE';
    setStartAnchor(null);
    startAnchorRef.current = null;
    setShowPlacementInfo(false);
    setActivePanel('NONE'); // Hide menu during placement so world is unobstructed
    setStatusMessage(
      `Placing ${entry.name} (${formatMoney(entry.price)}): Move over an owned plot and click to place.`
    );
    setStatusTone('info');
  };

  // Quick actions for Railway expansion, River Bridge, Upgrades, Vehicles, Contracts, Land
  const handleExpandRailLine = () => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;

    const lineCost = 6500;
    if (w.economy.getMoney() < lineCost) {
      audioSynth.playReject();
      setStatusMessage('Not enough money ($6,500 required for new rail track).');
      setStatusTone('error');
      return;
    }

    const res = w.railways.expandNextParallelTrackLine();
    if (res.success && res.track) {
      w.economy.chargeInfrastructureCost(
        'RAIL_CONSTRUCTION',
        lineCost,
        `Constructed Parallel Railway Line ${res.track.lineNumber}`,
        res.track.id
      );
      w.economy.awardXp(90, `Expanded Rail Line ${res.track.lineNumber}`);
      r.rebuildRailwayVisuals();
      r.focusOnRegion('RAIL_YARD');
      r.addCameraShake(0.24);
      audioSynth.playPlaceInfrastructure('RAIL');
      syncHudStats();
      setActivePanel('NONE');
      setStatusMessage(
        `Built parallel Railway Line ${res.track.lineNumber} (-$6,500 · +90 XP)!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Maximum parallel tracks reached.');
      setStatusTone('error');
    }
  };

  const handleBuildRiverCrossingBridge = () => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;

    const bridgeCost = 4200;
    if (w.economy.getMoney() < bridgeCost) {
      audioSynth.playReject();
      setStatusMessage('Not enough money ($4,200 required for River Bridge).');
      setStatusTone('error');
      return;
    }

    const res = w.bridgesAndPort.buildBridge(
      'ROAD_BRIDGE',
      { gx: 57, gz: 55 },
      { gx: 71, gz: 55 },
      selectedRoadWidth
    );
    if (res.success && res.bridge) {
      w.economy.chargeInfrastructureCost(
        'BRIDGE_CONSTRUCTION',
        bridgeCost,
        `Constructed Serpentine River Bridge (${selectedRoadWidth})`,
        res.bridge.id
      );
      w.economy.awardXp(110, 'Constructed Serpentine River Bridge');
      r.rebuildBridgesVisuals();
      r.rebuildRoadVisuals();
      r.focusOnRegion('RIVER_LAKE');
      r.addCameraShake(0.32);
      audioSynth.playPlaceInfrastructure('BRIDGE');
      syncHudStats();
      setActivePanel('NONE');
      setStatusMessage(
        `Built ${res.bridge.roadSpec?.totalLanes}-lane River Crossing Bridge connecting West Logistics to the City (-$4,200 · +110 XP)!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(
        res.reason || 'River Crossing Bridge is already built.'
      );
      setStatusTone('error');
    }
  };

  const handleUpgradeSelectedBuilding = (building: PlacedBuildingRecord) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const res = w.economy.upgradeFacility(building.id);
    if (res.success && res.building) {
      r.rebuildAllWorldVisuals();
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      const wh = w.economy.getWarehouse(res.building.id);
      if (res.building.id === TRUCK_DEPOT_ID && res.truckDepot) {
        const td = res.truckDepot;
        setStatusMessage(
          `Upgraded ${td.name} to Level ${td.level}/${td.maxLevel} (Active Footprint ${td.activeWidthCells}×${td.activeDepthCells} · Capacity ${td.truckCapacity} Mini Trucks · ${td.garageBayCount} Service Bays)!`
        );
      } else if (wh) {
        setStatusMessage(
          `Upgraded ${wh.name} to Level ${wh.level}/20 (${wh.operationalDoorCount} Doors · ${wh.operationalForkliftCount} Forklifts · Food ${wh.capacities.FOOD.toFixed(1)}t · Ind ${wh.capacities.INDUSTRIAL.toFixed(1)}t · Pkg ${wh.capacities.PACKAGES.toFixed(1)}t)!`
        );
      } else {
        setStatusMessage(
          `Upgraded ${res.building.name} to Level ${res.building.level} (${res.building.vehicleSlotCapacity > 0 ? `${res.building.vehicleSlotCapacity} Vehicle Slots` : `${res.building.storageCapacityTons}t Storage`})!`
        );
      }
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Cannot upgrade facility yet.');
      setStatusTone('error');
    }
  };

  const handleRestockWarehouse = (warehouseId: string) => {
    const w = worldRef.current;
    if (!w) return;
    const res = w.economy.restockWarehouseInventory(warehouseId, undefined, true);
    if (res.success) {
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setStatusMessage(
        res.costPaid > 0
          ? `Restocked Warehouse 1 cargo to full capacity (-${formatMoney(res.costPaid)}).`
          : 'Warehouse 1 cargo shelves are already at full capacity.'
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Cannot restock warehouse.');
      setStatusTone('error');
    }
  };

  const handlePurchaseVehicle = (catalogueId: string) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const isAirCatalogue =
      catalogueId === 'veh-air-turboprop-freighter' ||
      catalogueId === 'veh-air-widebody-jet';
    if (isAirCatalogue) {
      const ownedCount = w.economy.getPlayerCargoAircraft().length;
      handlePurchaseOwnedAircraft(ownedCount === 0 ? 1 : 2);
      return;
    }
    const res = w.economy.purchaseVehicle(catalogueId);
    if (res.success && res.vehicle) {
      r.rebuildVehiclesVisuals();
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setSelectedVehicleId(res.vehicle.id);
      setVehicleSubView('FLEET');
      setStatusMessage(`Purchased ${res.vehicle.name} — ready for dispatch!`);
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Vehicle purchase failed.');
      setStatusTone('error');
    }
  };

  const handleMaintainVehicle = (vehicleId: string) => {
    const w = worldRef.current;
    if (!w) return;
    const res = w.economy.performVehicleMaintenance(vehicleId);
    if (res.success && res.vehicle) {
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setStatusMessage(
        `Serviced ${res.vehicle.name} (-${formatMoney(res.vehicle.maintenanceCost)} · Condition 100%).`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Maintenance failed.');
      setStatusTone('error');
    }
  };

  const handleDispatchSelectedVehicleOnContract = (
    contract: TransportContractRecord,
    vehicleId?: string
  ) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;

    const chosenVehicle =
      (vehicleId ? w.economy.getOwnedVehicle(vehicleId) : undefined) ||
      w.economy
        .getOwnedVehicles()
        .find(
          (v) =>
            v.modal === contract.modal &&
            v.state === 'IDLE_AT_DEPOT' &&
            !v.maintenanceOverdue &&
            v.capacityTons >= contract.cargoTons
        );

    if (!chosenVehicle) {
      audioSynth.playReject();
      setStatusMessage(
        `No ready ${ModalTabLabel(contract.modal).toLowerCase()} with ${contract.cargoTons}t capacity available.`
      );
      setStatusTone('error');
      return;
    }

    const res = w.economy.dispatchContract(contract.id, chosenVehicle.id);
    if (res.success) {
      r.rebuildVehiclesVisuals();
      audioSynth.playPlaceInfrastructure('ROAD');
      syncHudStats();
      setDispatchingContractId(null);
      setSelectedContractVehicleId(null);
      setStatusMessage(
        `Dispatched ${chosenVehicle.name} on "${contract.title}"!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Dispatch failed.');
      setStatusTone('error');
    }
  };

  const handleAssignRailJobAndLoad = (jobOrContractId: string) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;

    if (!w.economy.getRailwayFreightHubState().owned) {
      setAirportModal({
        title: RAILWAY_YARD_LOCKED_UI_TITLE,
        message: `Purchase the 40×50 GTE Intermodal Railway Freight Terminal (${formatMoney(RAILWAY_YARD_RESERVED_FOOTPRINT.purchasePrice)}) to unlock GTE-L1 Locomotive & Model 360 Forklift job dispatch.`,
        tone: 'confirm',
        confirmLabel: `Purchase (${formatMoney(RAILWAY_YARD_RESERVED_FOOTPRINT.purchasePrice)})`,
        onConfirm: () => {
          const purchaseRes = w.economy.purchaseRailwayYard();
          if (purchaseRes.success) {
            r.rebuildRailwayVisuals();
            r.rebuildVehiclesVisuals();
            audioSynth.playPlaceInfrastructure('RAIL');
            setAirportModal(null);
            syncHudStats();
            setStatusMessage(
              `Purchased 40×50 GTE Intermodal Railway Freight Terminal for ${formatMoney(RAILWAY_YARD_RESERVED_FOOTPRINT.purchasePrice)}!`
            );
            setStatusTone('success');
          } else {
            audioSynth.playReject();
            setStatusMessage(
              purchaseRes.reason || 'Cannot purchase Railway Yard.'
            );
            setStatusTone('error');
          }
        },
      });
      return;
    }

    const res = w.economy.assignRailJobAndLoad(jobOrContractId);
    if (res.success && res.train) {
      const assignedJob = w.economy
        .getRailwayFreightHubState()
        .jobs.find((j) => j.id === res.train?.assignedJobId);
      r.rebuildVehiclesVisuals();
      audioSynth.playPlaceInfrastructure('RAIL');
      syncHudStats();
      try {
        localStorage.setItem(SAVE_STORAGE_KEY, w.serializeState());
      } catch {
        // Ignore storage quota errors
      }
      setStatusMessage(
        `Assigned "${assignedJob?.title || res.train.name}" — 3 GTE Model 360 Forklifts loading 4 wagons (${assignedJob?.cargoTons || 120}t)!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(
        res.reason || 'Unable to assign rail freight job right now.'
      );
      setStatusTone('error');
    }
  };

  const handlePurchaseAirport = () => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const res = w.economy.purchaseAirport();
    if (res.success && res.airport) {
      r.buildAirportVisuals();
      r.rebuildDebugOverlays();
      r.focusOnRegion('AIRPORT');
      r.addCameraShake(0.32);
      audioSynth.playPlaceInfrastructure('EXPAND');
      setAirportModal(null);
      syncHudStats();
      try {
        localStorage.setItem(SAVE_STORAGE_KEY, w.serializeState());
      } catch {
        // Ignore storage quota errors
      }
      setSelectedCellReport(w.inspectCell(170, 35));
      setStatusMessage(
        `Purchased & restored Regional Air Cargo Hub (Level 1/20 · 1 Aircraft Stand · 10×15 Cargo Terminal) for ${formatMoney(AIRPORT_PURCHASE_PRICE)}!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      const errMsg = res.reason || 'Cannot purchase Cargo Airport yet.';
      setStatusMessage(errMsg);
      setStatusTone('error');
      setAirportModal({
        title: 'Airport - Locked',
        message: errMsg,
        tone: 'warning',
      });
    }
  };

  const handleUpgradeAirport = () => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const res = w.economy.upgradeAirport();
    if (res.success && res.airport) {
      r.buildAirportVisuals();
      r.addCameraShake(0.26);
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setSelectedCellReport(w.inspectCell(170, 35));
      setStatusMessage(
        `Upgraded Regional Air Cargo Hub to Level ${res.airport.level}/${res.airport.maxLevel} (Cargo Capacity: ${res.airport.cargoCapacityTons}t · ${res.airport.unlockedStandCount}/${AIRPORT_MAX_PARKING_AREAS} Stands Unlocked · ${res.airport.activeConstructedBounds.totalCells}/1,200 Active Cells)!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Cannot upgrade Cargo Airport yet.');
      setStatusTone('error');
    }
  };

  const handlePurchaseAirportParkingStand = (
    standIdOrNumber: string | number
  ) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const res = w.economy.purchaseAirportParkingStand(standIdOrNumber);
    if (res.success && res.standId) {
      r.buildAirportVisuals();
      r.addCameraShake(0.22);
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setSelectedCellReport(w.inspectCell(170, 35));
      setStatusMessage(
        `Purchased Aircraft Parking Area #${res.standNumber} (${res.standId}) for ${formatMoney(res.price)} (${res.airport.purchasedStandCount}/${AIRPORT_MAX_PARKING_AREAS} Stands Owned)!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Could not purchase parking area.');
      setStatusTone('error');
    }
  };

  const handleRequestGuestAircraftArrival = (modelId?: string) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const res = w.economy.requestGuestAircraftArrival(
      modelId || selectedGuestAircraftModelId
    );
    if (res.success && res.aircraft) {
      r.rebuildVehiclesVisuals();
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setSelectedCellReport(w.inspectCell(170, 35));
      setStatusMessage(
        `Cleared Guest Aircraft ${res.aircraft.callsign} (${res.aircraft.name}) for Runway 09/27 approach → reserved ${res.assignedStand}!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(
        res.reason || 'Cannot clear guest aircraft arrival — no empty stand.'
      );
      setStatusTone('error');
    }
  };

  const handleCancelGuestAircraftArrival = (aircraftId: string) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const res = w.economy.cancelGuestAircraftArrival(aircraftId);
    if (res.success) {
      r.rebuildVehiclesVisuals();
      syncHudStats();
      setSelectedCellReport(w.inspectCell(170, 35));
      setStatusMessage(
        'Cancelled guest aircraft approach and released reserved parking stand.'
      );
      setStatusTone('info');
    } else {
      audioSynth.playReject();
      setStatusMessage(
        res.reason || 'Cannot cancel guest aircraft after touchdown.'
      );
      setStatusTone('error');
    }
  };

  const handleAirportDollyTransfer = () => {
    const w = worldRef.current;
    if (!w) return;
    const res = w.economy.requestAirportWarehouseToYardTransfer(
      'PLANT_AND_FOOD',
      4,
      'WAREHOUSE_TO_YARD'
    );
    if (res.success) {
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setStatusMessage(
        'Dispatched Cargo Dolly & Forklift to transfer 4.0t Plant & Food from 10×10 Airport Warehouse to 10×10 Transfer Yard!'
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Transfer failed.');
      setStatusTone('error');
    }
  };

  const handleAtcAcceptSupplyFlight = () => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const res = w.economy.requestAtcNpcSupplyArrival();
    if (res.success && res.aircraft) {
      r.rebuildVehiclesVisuals();
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setStatusMessage(
        `ATC Tower cleared ${res.aircraft.callsign} for Runway 09/27 approach -> ${res.aircraft.assignedStandId} (Free Supply Drop: Materials, Fuel, Electronics & Parts)!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'ATC could not clear arrival.');
      setStatusTone('error');
    }
  };

  const handleConstructAirportHangar = (slotId: HangarSlotId) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    if (w.economy.getMoney() < AIRCRAFT_HANGAR_PURCHASE_COST) {
      audioSynth.playReject();
      setStatusMessage('Insufficient funds to purchase Aircraft Hangar ($5,000,000).');
      setStatusTone('error');
      setAirportModal({
        title: 'Hangar Purchase Failed',
        message: 'Insufficient funds',
        tone: 'warning',
      });
      return;
    }
    const res = w.economy.constructAircraftHangar(slotId);
    if (res.success && res.hangar) {
      r.buildAirportVisuals();
      r.addCameraShake(0.24);
      audioSynth.playPlaceInfrastructure('EXPAND');
      setAirportModal(null);
      syncHudStats();
      try {
        localStorage.setItem(SAVE_STORAGE_KEY, w.serializeState());
      } catch {
        // Ignore storage quota errors
      }
      setStatusMessage(
        `Purchased & Constructed ${res.hangar.name} ($5,000,000) on dedicated Airport Hangar Tile (${slotId})!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Could not construct Aircraft Hangar.');
      setStatusTone('error');
      setAirportModal({
        title: 'Hangar Prerequisite',
        message: res.reason || 'Could not construct Aircraft Hangar.',
        tone: 'warning',
      });
    }
  };

  const handlePurchaseOwnedAircraft = (slotNumber: 1 | 2) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;

    const ap = w.economy.getAirport();
    const hangars = w.economy.getAircraftHangars();
    const h1 = hangars.find((h) => h.id === 'HANGAR_1');
    const h2 = hangars.find((h) => h.id === 'HANGAR_2');
    const ownedCount = w.economy.getPlayerCargoAircraft().length;

    if (ownedCount >= MAX_PLAYER_AIRCRAFT) {
      audioSynth.playReject();
      setAirportModal({
        title: 'Fleet Limit Reached',
        message: `Maximum player cargo aircraft fleet limit reached (${MAX_PLAYER_AIRCRAFT}/${MAX_PLAYER_AIRCRAFT} aircraft owned).`,
        tone: 'warning',
      });
      return;
    }

    // Check Hangar Prerequisite & Level Unlock for exact modal warning strings
    if (slotNumber === 1) {
      if (!h1?.constructed) {
        audioSynth.playReject();
        const msg = 'To buy a plane you must own a Hanger first';
        setStatusMessage(msg);
        setStatusTone('error');
        setAirportModal({
          title: 'Hangar Required',
          message: msg,
          tone: 'warning',
        });
        return;
      }
      if (ap.level < FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL) {
        audioSynth.playReject();
        const msg = 'Unlocks at Airport Level 10';
        setStatusMessage(msg);
        setStatusTone('error');
        setAirportModal({
          title: 'Airport Level Required',
          message: msg,
          tone: 'warning',
        });
        return;
      }
      if (w.economy.getMoney() < FIRST_OWNED_AIRCRAFT_PRICE) {
        audioSynth.playReject();
        const msg = 'Insufficient funds';
        setStatusMessage(msg);
        setStatusTone('error');
        setAirportModal({
          title: 'Purchase Failed',
          message: msg,
          tone: 'warning',
        });
        return;
      }
    } else {
      if (ap.level < SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL) {
        audioSynth.playReject();
        const msg = 'Unlocks at Airport Level 15';
        setStatusMessage(msg);
        setStatusTone('error');
        setAirportModal({
          title: 'Airport Level Required',
          message: msg,
          tone: 'warning',
        });
        return;
      }
      if (!h2?.constructed) {
        audioSynth.playReject();
        const msg = 'To buy a second plane you must own Hangar 2 first';
        setStatusMessage(msg);
        setStatusTone('error');
        setAirportModal({
          title: 'Hangar 2 Required',
          message: msg,
          tone: 'warning',
        });
        return;
      }
      if (w.economy.getMoney() < SECOND_OWNED_AIRCRAFT_PRICE) {
        audioSynth.playReject();
        const msg = 'Insufficient funds';
        setStatusMessage(msg);
        setStatusTone('error');
        setAirportModal({
          title: 'Purchase Failed',
          message: msg,
          tone: 'warning',
        });
        return;
      }
    }

    const catId =
      slotNumber === 1
        ? 'veh-air-turboprop-freighter'
        : 'veh-air-widebody-jet';
    const res = w.economy.purchasePlayerCargoAircraft(catId);
    if (res.success && res.aircraft) {
      r.buildAirportVisuals();
      r.rebuildVehiclesVisuals();
      r.addCameraShake(0.22);
      audioSynth.playPlaceInfrastructure('EXPAND');
      setAirportModal(null);
      syncHudStats();
      setStatusMessage(
        `Purchased Owned Cargo Aircraft #${slotNumber} (${res.aircraft.name}) — stored inside ${res.aircraft.assignedHangarId ?? 'HANGAR_1'}!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      const errMsg =
        res.reason || 'Could not purchase player-owned cargo aircraft.';
      setStatusMessage(errMsg);
      setStatusTone('error');
      setAirportModal({
        title: 'Aircraft Purchase Prerequisite',
        message: errMsg,
        tone: 'warning',
      });
    }
  };

  const handleWorldLockBadgeClick = (
    badgeId: 'AIRPORT_MAIN' | 'HANGAR_1' | 'HANGAR_2' | 'AIRPORT_EXPANSION'
  ) => {
    const w = worldRef.current;
    if (!w) return;
    if (badgeId === 'HANGAR_1' || badgeId === 'HANGAR_2') {
      const hangarNum = badgeId === 'HANGAR_1' ? 1 : 2;
      setAirportModal({
        title: `Hangar ${hangarNum} - Locked`,
        message: `Dedicated airside maintenance and storage hangar required for Player-Owned Cargo Aircraft #${hangarNum}. Exact Purchase Price: $5,000,000.`,
        tone: 'confirm',
        confirmLabel: 'Purchase ($5,000,000)',
        onConfirm: () => handleConstructAirportHangar(badgeId),
      });
    } else if (badgeId === 'AIRPORT_MAIN') {
      setAirportModal({
        title: 'Airport - Locked',
        message: `Unlock and activate the International Cargo & Passenger Airport Complex (50×70 Grid Compound, Cargo Terminal, Logistics Yard & Airfield). Exact Purchase Price: ${formatMoney(AIRPORT_PURCHASE_PRICE)}.`,
        tone: 'confirm',
        confirmLabel: `Purchase (${formatMoney(AIRPORT_PURCHASE_PRICE)})`,
        onConfirm: () => {
          setAirportModal(null);
          handlePurchaseAirport();
        },
      });
    } else if (badgeId === 'AIRPORT_EXPANSION') {
      const ap = w.economy.getAirport();
      setAirportModal({
        title: `Expand Airport to Level ${ap.level + 1}`,
        message: `Upgrade Regional Cargo Airport to Level ${ap.level + 1}/${ap.maxLevel} for ${formatMoney(ap.upgradeCost)}? Expands active footprint and increases flight cargo capacity.`,
        tone: 'confirm',
        confirmLabel: `Upgrade (${formatMoney(ap.upgradeCost)})`,
        onConfirm: () => {
          setAirportModal(null);
          handleUpgradeAirport();
        },
      });
    }
  };

  const handleWorldLockBadgeClickRef = useRef(handleWorldLockBadgeClick);
  handleWorldLockBadgeClickRef.current = handleWorldLockBadgeClick;

  const handleDispatchPlayerAircraft = (aircraftId: string) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const res = w.economy.dispatchPlayerAircraftFlight(aircraftId);
    if (res.success && res.aircraft) {
      r.rebuildVehiclesVisuals();
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setStatusMessage(
        `Dispatched ${res.aircraft.name} carrying ${res.aircraft.carryingCargoTons.toFixed(1)}t ${res.aircraft.carryingCargoKey} (Est. Payout: ${formatMoney(res.expectedPayout || 0)})!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Could not dispatch cargo flight.');
      setStatusTone('error');
    }
  };

  const handleRepairPlayerAircraftInHangar = (aircraftId: string) => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const res = w.economy.repairPlayerAircraftInHangar(aircraftId);
    if (res.success && res.aircraft) {
      r.buildAirportVisuals();
      r.rebuildVehiclesVisuals();
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setStatusMessage(
        `Repaired ${res.aircraft.name} to 100% condition inside ${res.hangar?.name ?? 'Aircraft Hangar'} & renewed 5-day maintenance!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Hangar repair failed.');
      setStatusTone('error');
    }
  };

  const handlePurchaseParcel = (parcelId: string) => {
    if (parcelId === 'parcel-airport-reserve') {
      handlePurchaseAirport();
      return;
    }
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const parcel = w.parcels.getAllParcels().find((p) => p.id === parcelId);
    const res = w.economy.purchaseLandParcel(parcelId);
    if (res.success && parcel) {
      if (parcel.zoneCategory === ZoneCategory.RAIL_YARD) {
        w.railways.unlockNextRailYardTile(false);
        r.rebuildRailwayVisuals();
      }
      r.buildNaturalFoliageAndRocks();
      r.rebuildDebugOverlays();
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setStatusMessage(
        `Purchased ${parcel.name} for ${formatMoney(parcel.price)} (+80 XP)!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Land purchase failed.');
      setStatusTone('error');
    }
  };

  const handleExpandWorldDimensions = () => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;

    const res = w.expandWorld(20, 20);
    if (res.success) {
      r.rebuildAllWorldVisuals();
      audioSynth.playPlaceInfrastructure('EXPAND');
      syncHudStats();
      setStatusMessage(
        `Expanded world boundaries to ${res.newGridWidth * 2}m × ${res.newGridDepth * 2}m!`
      );
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.reason || 'Maximum world expansion reached.');
      setStatusTone('error');
    }
  };

  const handleSaveWorld = () => {
    const w = worldRef.current;
    if (!w) return;
    const serialized = w.serializeState();
    localStorage.setItem(SAVE_STORAGE_KEY, serialized);
    audioSynth.playPlaceInfrastructure('EXPAND');
    setStatusMessage('Game saved successfully.');
    setStatusTone('success');
  };

  const handleLoadWorld = () => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) {
      audioSynth.playReject();
      setStatusMessage('No saved game found.');
      setStatusTone('error');
      return;
    }
    const res = w.deserializeState(raw);
    if (res.success) {
      r.rebuildAllWorldVisuals();
      syncHudStats();
      audioSynth.playPlaceInfrastructure('EXPAND');
      setStatusMessage('Saved empire loaded successfully.');
      setStatusTone('success');
    } else {
      audioSynth.playReject();
      setStatusMessage(res.error || 'Failed to load saved game.');
      setStatusTone('error');
    }
  };

  const handleResetWorld = () => {
    const w = worldRef.current;
    const r = rendererRef.current;
    if (!w || !r) return;
    const fresh = new WorldManager();
    const json = fresh.serializeState();
    w.deserializeState(json);
    r.rebuildAllWorldVisuals();
    setStartAnchor(null);
    startAnchorRef.current = null;
    setSelectedCellReport(null);
    setSelectedVehicleId(null);
    setPendingDemolish(null);
    syncHudStats();
    setStatusMessage('Reset empire to starting state.');
    setStatusTone('info');
  };

  // Filter buildings for the active Level 2 Build Category
  const categoryBuildings: BuildingCatalogueItem[] = React.useMemo(() => {
    if (!buildCategory) return [];
    let list: BuildingCatalogueItem[] = [];
    if (buildCategory === 'BUILDINGS') {
      list = BUILDING_CATALOGUE.filter(
        (b) =>
          b.category === 'RESIDENTIAL' ||
          b.category === 'COMMERCIAL' ||
          b.id === 'bld-inf-civic-park-plaza'
      );
    } else if (buildCategory === 'LOGISTICS') {
      list = BUILDING_CATALOGUE.filter(
        (b) =>
          b.category === 'ROAD_LOGISTICS' ||
          b.category === 'INDUSTRIAL' ||
          b.id === 'bld-inf-service-station'
      );
    } else if (buildCategory === 'RAILWAY') {
      list = BUILDING_CATALOGUE.filter((b) => b.category === 'RAILWAY');
    } else if (buildCategory === 'AIRPORT') {
      list = BUILDING_CATALOGUE.filter((b) => b.category === 'AIRPORT');
    } else if (buildCategory === 'HARBOUR') {
      list = BUILDING_CATALOGUE.filter((b) => b.category === 'HARBOUR');
    }
    if (buildSearchQuery.trim()) {
      const q = buildSearchQuery.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [buildCategory, buildSearchQuery]);

  const activePlacementBuildingSpec = getBuildingSpecById(selectedBuildingId);
  const selectedVehicleObj = hudStats.ownedVehicles.find(
    (v) => v.id === selectedVehicleId
  );
  const isPlacingOrDemolishing =
    activeTool !== 'INSPECT' && activeTool !== 'LAND_SELECT';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* Isolated 100vw x 100vh Three.js WebGL Mount Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full z-0"
      />

      {/* =====================================================================
          TITLE SCREEN OVERLAY ('title')
          ===================================================================== */}
      {gameState === 'title' && (
        <div
          className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-14 pointer-events-none"
          style={{
            background:
              'linear-gradient(110deg, rgba(9, 13, 22, 0.88) 0%, rgba(9, 13, 22, 0.52) 48%, rgba(9, 13, 22, 0.12) 100%)',
          }}
        >
          <div className="max-w-xl pointer-events-auto mt-4">
            <svg
              viewBox="0 0 600 150"
              className="w-full max-w-[560px] h-auto drop-shadow-md"
              role="img"
              aria-label="Global Transport Empire"
            >
              <g transform="translate(8, 12)">
                <polygon
                  points="48,6 88,28 88,74 48,96 8,74 8,28"
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth="3"
                />
                <polygon
                  points="48,16 78,33 78,69 48,86 18,69 18,33"
                  fill="#1e293b"
                  stroke="#fbbf24"
                  strokeWidth="1.5"
                />
                <path
                  d="M24 62 L48 48 L72 62"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <path
                  d="M28 42 L48 30 L68 42"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="48"
                  cy="51"
                  r="7"
                  fill="#0f172a"
                  stroke="#f8fafc"
                  strokeWidth="3"
                />
              </g>

              <text
                x="112"
                y="52"
                fill="#f8fafc"
                fontFamily="Outfit, sans-serif"
                fontWeight="700"
                fontSize="38"
                letterSpacing="1.5"
              >
                GLOBAL TRANSPORT
              </text>
              <text
                x="112"
                y="94"
                fill="#fbbf24"
                fontFamily="Outfit, sans-serif"
                fontWeight="700"
                fontSize="40"
                letterSpacing="3"
              >
                EMPIRE
              </text>
              <line
                x1="112"
                y1="108"
                x2="545"
                y2="108"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeOpacity="0.65"
              />
              <text
                x="112"
                y="128"
                fill="#cbd5e1"
                fontFamily="Plus Jakarta Sans, sans-serif"
                fontWeight="500"
                fontSize="12"
                letterSpacing="0.5"
              >
                BUILD ROADS, CITIES, LOGISTICS HUBS, RAILWAYS, AIRPORTS &amp; HARBOURS
              </text>
            </svg>

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <button
                type="button"
                data-start="true"
                onClick={startGame}
                className="px-7 py-3.5 text-base font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 rounded-lg shadow-lg transition-transform duration-150 cursor-pointer whitespace-nowrap shrink-0"
              >
                Play Transport Empire
              </button>

              <button
                type="button"
                onClick={() => {
                  startGame();
                  setTimeout(
                    () => rendererRef.current?.focusOnRegion('AIRPORT'),
                    60
                  );
                }}
                className="px-5 py-3.5 text-sm font-medium text-slate-100 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Explore Cargo Airport
              </button>
            </div>
          </div>

          <div className="text-xs font-medium text-slate-300 tracking-wide">
            Drag or WASD to Pan · Scroll to Zoom · Click BUILD to Construct · Click Objects to Manage
          </div>
        </div>
      )}

      {/* =====================================================================
          PLAYING INTERFACE ('playing') — Clean Tycoon Game HUD
          ===================================================================== */}
      {gameState === 'playing' && (
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 md:p-4">
          {/* -----------------------------------------------------------------
              TOP BAR: HD Tycoon Empire Header — Treasury, Cashflow, Level/XP, Fleet & Hub Telemetry
              ----------------------------------------------------------------- */}
          <div className="flex items-start justify-between gap-3">
            <div
              className="flex flex-col gap-2 max-w-3xl origin-top-left transition-transform duration-200"
              style={{
                transform:
                  hudScale === 'compact'
                    ? 'scale(0.92)'
                    : hudScale === 'large'
                      ? 'scale(1.06)'
                      : 'scale(1)',
              }}
            >
              <div
                data-testid="hd-top-game-bar"
                className="pointer-events-auto rounded-2xl px-4 py-3 border border-cyan-500/35 shadow-2xl"
                style={{
                  backgroundColor: 'rgba(9, 15, 28, 0.95)',
                  boxShadow:
                    '0 16px 38px -10px rgba(2, 6, 23, 0.85), inset 0 1px 0 0 rgba(56, 189, 248, 0.22)',
                }}
              >
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {/* 1. Empire Treasury & Live Net Cashflow */}
                  <div className="flex items-center gap-2.5 pr-4 border-r border-slate-800/90">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-emerald-300 font-extrabold text-base shadow-inner">
                      $
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                          Available Funds
                        </span>
                        <span
                          data-testid="hud-net-cashflow"
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-bold ${
                            hudStats.netIncome >= 0
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {hudStats.netIncome >= 0 ? '+' : ''}
                          {formatMoney(hudStats.netIncome)}/cycle
                        </span>
                      </div>
                      <div
                        data-testid="hud-money-balance"
                        className="text-lg font-extrabold text-emerald-400 font-mono-tabular leading-tight tracking-tight"
                      >
                        {formatMoney(hudStats.money)}
                      </div>
                    </div>
                  </div>

                  {/* 2. Executive Level & XP Progression Bar */}
                  <div className="min-w-[175px] pr-4 border-r border-slate-800/90">
                    <div className="flex items-center justify-between text-xs font-bold gap-2">
                      <span className="text-amber-300 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                        Level {hudStats.level} · {hudStats.levelTitle}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-cyan-300">
                        {hudStats.xp}/{hudStats.nextLevelXp} XP
                      </span>
                    </div>
                    <div className="mt-1.5 w-full h-2.5 rounded-full bg-slate-900 overflow-hidden border border-slate-700/90 p-0.5">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all duration-300"
                        style={{ width: `${hudStats.xpProgressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* 3. Active Operations & World Capacity Telemetry Pill */}
                  <div className="flex items-center gap-2">
                    <div className="px-2.5 py-1 rounded-xl bg-slate-900/95 border border-slate-700/80 text-[11px] flex items-center gap-2">
                      <span className="text-cyan-300 font-bold font-mono-tabular">
                        {hudStats.ownedVehicles.length} Fleet
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-amber-300 font-bold font-mono-tabular">
                        {
                          hudStats.contracts.filter(
                            (c) => c.status === 'ACTIVE'
                          ).length
                        }
                        /{hudStats.contracts.length} Contracts
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowTopDetails((prev) => !prev)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        showTopDetails
                          ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm'
                          : 'text-cyan-200 hover:text-white bg-slate-900/90 hover:bg-slate-800 border-cyan-500/40'
                      }`}
                    >
                      {showTopDetails ? 'Hide Stats' : 'Empire Stats'}
                    </button>
                  </div>
                </div>

                {/* Expandable Secondary Stats & World Capacity Metrics */}
                {showTopDetails && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-800/90 text-xs text-slate-200 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-tabular">
                      <span className="text-cyan-300 font-semibold">
                        World Grid: {hudStats.gridWidth.toLocaleString()}×
                        {hudStats.gridDepth.toLocaleString()} (
                        {(
                          (hudStats.gridWidth * hudStats.gridDepth) /
                          1_000_000
                        ).toFixed(2)}
                        M Blocks)
                      </span>
                      <span>·</span>
                      <span>
                        Truck Depot Slots: {hudStats.roadSlotsUsed}/
                        {hudStats.roadSlotsMax}
                      </span>
                      <span>·</span>
                      <span>Roads: {hudStats.roadCount}</span>
                      <span>·</span>
                      <span>
                        Rail Tracks: {hudStats.trackLinesCount}/
                        {hudStats.maxTrackLines}
                      </span>
                      <span>·</span>
                      <span>Bridges: {hudStats.bridgesCount}</span>
                    </div>
                  </div>
                )}

                {/* Camera Quick-Jump Strip — 5 Core Facilities & World Landmarks */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/90 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-cyan-400/90 mr-1 font-bold uppercase tracking-wider text-[10px]">
                    Core Hubs:
                  </span>
                  {(
                    [
                      ['OVERVIEW', 'World Overview'],
                      ['CITY_ROUNDABOUT', 'Delivery HQ'],
                      ['TRUCK_DEPOT', 'Truck Depot'],
                      ['WAREHOUSE_1', 'Warehouse 1'],
                      ['RAIL_YARD', 'Rail Yard'],
                      ['PORT_HARBOUR', 'Port Harbour'],
                      ['AIRPORT', 'Airport'],
                      ['HIGHWAY', 'Motorway'],
                      ['WORLD_EXPANSION', 'Frontier'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        if (key === 'TRUCK_DEPOT') {
                          rendererRef.current?.focusOnWorldPosition(-8, -6, 36);
                          if (worldRef.current) {
                            setSelectedVehicleId(null);
                            setSelectedCellReport(
                              worldRef.current.inspectCell(46, 50)
                            );
                          }
                          return;
                        }
                        rendererRef.current?.focusOnRegion(key);
                        if (key === 'CITY_ROUNDABOUT' && worldRef.current) {
                          setSelectedVehicleId(null);
                          setSelectedCellReport(
                            worldRef.current.inspectCell(78, 44)
                          );
                        } else if (key === 'WAREHOUSE_1' && worldRef.current) {
                          setSelectedVehicleId(null);
                          setSelectedCellReport(
                            worldRef.current.inspectCell(47, 74)
                          );
                        } else if (key === 'RAIL_YARD' && worldRef.current) {
                          setSelectedVehicleId(null);
                          setSelectedCellReport(
                            worldRef.current.inspectCell(22, 50)
                          );
                        } else if (key === 'PORT_HARBOUR' && worldRef.current) {
                          setSelectedVehicleId(null);
                          setSelectedCellReport(
                            worldRef.current.inspectCell(84, 90)
                          );
                        } else if (key === 'AIRPORT' && worldRef.current) {
                          setSelectedVehicleId(null);
                          setSelectedCellReport(
                            worldRef.current.inspectCell(170, 35)
                          );
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 text-[11px] ${
                        key === 'CITY_ROUNDABOUT' ||
                        key === 'TRUCK_DEPOT' ||
                        key === 'WAREHOUSE_1' ||
                        key === 'RAIL_YARD' ||
                        key === 'PORT_HARBOUR' ||
                        key === 'AIRPORT'
                          ? 'bg-cyan-500/20 border border-cyan-400/50 hover:bg-cyan-500/35 text-cyan-100 font-semibold'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Live Executive Dispatch Ticker & Notification Line */}
                <div className="mt-2 pt-1.5 border-t border-slate-800/80 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        statusTone === 'error'
                          ? 'bg-rose-400'
                          : statusTone === 'success'
                            ? 'bg-emerald-400'
                            : 'bg-cyan-400'
                      }`}
                    />
                    <span
                      className={`truncate ${
                        statusTone === 'error'
                          ? 'text-rose-300 font-semibold'
                          : statusTone === 'success'
                            ? 'text-emerald-300 font-semibold'
                            : 'text-slate-200'
                      }`}
                    >
                      {statusMessage}
                    </span>
                  </div>
                  <span
                    data-testid="hud-world-scale-badge"
                    className="text-[10px] font-mono-tabular text-slate-400 shrink-0 hidden sm:inline"
                  >
                    {(
                      (hudStats.gridWidth * hudStats.gridDepth) /
                      1_000_000
                    ).toFixed(2)}
                    M Grid Blocks
                  </span>
                </div>
              </div>

              {/* ---------------------------------------------------------------
                  CONTEXTUAL SELECTION CARD (Building, Vehicle, Parcel, or Demolish Confirmation)
                  --------------------------------------------------------------- */}
              {pendingDemolish && (
                <div
                  className="pointer-events-auto rounded-xl p-3.5 border border-rose-500/80 shadow-2xl max-w-sm"
                  style={{ backgroundColor: 'rgba(15, 23, 42, 0.96)' }}
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-400">
                    Confirm Demolition
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    Remove {pendingDemolish.name}?
                  </div>
                  <div className="mt-0.5 text-xs text-emerald-300">
                    Salvage refund: +{formatMoney(pendingDemolish.refundAmount)}{' '}
                    (60%)
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExecuteConfirmedDemolish}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold cursor-pointer"
                    >
                      Confirm Demolish
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDemolish(null)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!pendingDemolish &&
                (selectedVehicleObj ||
                  selectedCellReport?.zoneCategory === 'AIRPORT_RESERVED' ||
                  selectedCellReport?.zoneCategory === 'RAIL_YARD' ||
                  selectedCellReport?.building ||
                  (selectedCellReport &&
                    selectedCellReport.parcelId &&
                    !selectedCellReport.parcelOwned)) && (
                  <div
                    className="pointer-events-auto rounded-xl p-3.5 border border-slate-700 shadow-2xl max-w-md"
                    style={{ backgroundColor: 'rgba(15, 23, 42, 0.95)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold tracking-wider uppercase text-sky-400">
                        {selectedVehicleObj
                          ? `${ModalTabLabel(selectedVehicleObj.modal)} Details`
                          : selectedCellReport?.zoneCategory ===
                              'AIRPORT_RESERVED'
                            ? hudStats.airport?.owned
                              ? `Regional Air Cargo Hub (Level ${hudStats.airport.level}/${AIRPORT_MAX_LEVEL})`
                              : AIRPORT_LOCKED_UI_TITLE
                            : selectedCellReport?.zoneCategory === 'RAIL_YARD'
                              ? 'GTE Intermodal Railway Freight Hub (40×50)'
                              : selectedCellReport?.building
                                ? `${selectedCellReport.building.name} (Level ${selectedCellReport.building.level})`
                                : 'Available Land Parcel'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVehicleId(null);
                          setSelectedCellReport(null);
                        }}
                        className="text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        ✕ Close
                      </button>
                    </div>

                    {/* Selected Vehicle Management Card */}
                    {selectedVehicleObj && (
                      <div className="mt-1.5 text-xs text-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-white">
                            {selectedVehicleObj.name}
                          </span>
                          <span
                            className={`font-semibold ${
                              formatFriendlyVehicleState(
                                selectedVehicleObj.state,
                                selectedVehicleObj.routeProgressRatio
                              ).colorClass
                            }`}
                          >
                            {
                              formatFriendlyVehicleState(
                                selectedVehicleObj.state,
                                selectedVehicleObj.routeProgressRatio
                              ).label
                            }
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
                          <span>
                            Loaded:{' '}
                            <strong className="text-white">
                              {(selectedVehicleObj.carryingCargoTons ?? 0).toFixed(1)}t
                            </strong>{' '}
                            / {selectedVehicleObj.capacityTons}t
                            {selectedVehicleObj.carryingCargoCategory
                              ? ` (${selectedVehicleObj.carryingCargoCategory})`
                              : ''}
                          </span>
                          <span>·</span>
                          <span>
                            Condition: {selectedVehicleObj.conditionPercent}%
                          </span>
                        </div>
                        {selectedVehicleObj.statusMessage && (
                          <div className="text-[11px] text-amber-300 bg-slate-900/90 px-2 py-1 rounded border border-slate-800">
                            {selectedVehicleObj.statusMessage}
                          </div>
                        )}
                        <div className="pt-1 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              rendererRef.current?.focusOnWorldPosition(
                                selectedVehicleObj.worldX,
                                selectedVehicleObj.worldZ,
                                38
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/60 text-sky-200 hover:bg-sky-500/30 font-medium cursor-pointer"
                          >
                            Focus Camera
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleMaintainVehicle(selectedVehicleObj.id)
                            }
                            className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold cursor-pointer"
                          >
                            Service Vehicle (
                            {formatMoney(selectedVehicleObj.maintenanceCost)})
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Selected Cargo Airport Management Card (Airport Prompts 1–6 + Expansion Prompt) */}
                    {!selectedVehicleObj &&
                      selectedCellReport?.zoneCategory === 'AIRPORT_RESERVED' &&
                      hudStats.airport && (
                        <div
                          data-testid="airport-inspector"
                          className="mt-2 text-xs text-slate-200 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800">
                            <div>
                              <div className="font-bold text-white text-xs">
                                {hudStats.airport.owned
                                  ? `Operational Cargo Airport · Level ${hudStats.airport.level} / ${hudStats.airport.maxLevel}`
                                  : AIRPORT_LOCKED_UI_TITLE}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Reserved: 50×70 blocks (3,500 cells) · Active:{' '}
                                {hudStats.airport.activeConstructedBounds.depthCells}×
                                {hudStats.airport.activeConstructedBounds.widthCells} (
                                {hudStats.airport.activeConstructedBounds.totalCells.toLocaleString()}{' '}
                                cells)
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                                hudStats.airport.owned
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : hudStats.level >= AIRPORT_UNLOCK_LEVEL
                                    ? 'bg-amber-400/25 text-amber-200 border border-amber-400/50'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {hudStats.airport.owned
                                ? 'OPERATIONAL'
                                : hudStats.level >= AIRPORT_UNLOCK_LEVEL
                                  ? 'UNLOCKED'
                                  : 'LOCKED'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                              <div className="text-slate-400">
                                Flight Cargo Capacity
                              </div>
                              <div
                                data-testid="airport-cargo-capacity-value"
                                className="text-amber-300 font-bold text-xs"
                              >
                                {hudStats.airport.owned
                                  ? `${hudStats.airport.cargoCapacityTons}t / ${AIRPORT_MAX_CARGO_CAPACITY_TONS}t Max`
                                  : `5t → ${AIRPORT_MAX_CARGO_CAPACITY_TONS}t (Lv.${AIRPORT_UNLOCK_LEVEL})`}
                              </div>
                            </div>
                            <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                              <div className="text-slate-400">
                                Parking Areas (Max {AIRPORT_MAX_PARKING_AREAS})
                              </div>
                              <div
                                data-testid="airport-stands-summary"
                                className="text-sky-300 font-bold text-xs"
                              >
                                {hudStats.airport.owned
                                  ? `${hudStats.airport.activeStandCount}/${AIRPORT_MAX_PARKING_AREAS} Active · ${hudStats.airport.availableStandCount} Free`
                                  : `0 / ${AIRPORT_MAX_PARKING_AREAS} (Abandoned Prop)`}
                              </div>
                            </div>
                            <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                              <div className="text-slate-400">
                                Cargo Terminal &amp; Yard
                              </div>
                              <div className="text-white font-bold text-xs">
                                10×15 Bldg · 18×6 Truck Yard
                              </div>
                            </div>
                            <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                              <div className="text-slate-400">
                                Separate Facilities
                              </div>
                              <div className="text-emerald-300 font-bold text-xs">
                                10×10 Whse · 10×10 Yard
                              </div>
                            </div>
                          </div>

                          {!hudStats.airport.owned ? (
                            <>
                              <div className="text-[11px] text-slate-300 bg-slate-900/75 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                Abandoned regional cargo airfield with derelict
                                hangar and non-operational prop aircraft.
                                Requires{' '}
                                <strong className="text-amber-300">
                                  XP Level {AIRPORT_UNLOCK_LEVEL}
                                </strong>{' '}
                                and{' '}
                                <strong className="text-emerald-300">
                                  {formatMoney(AIRPORT_PURCHASE_PRICE)}
                                </strong>{' '}
                                to purchase and restore.
                              </div>
                              <div className="pt-1 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  data-testid="purchase-airport-btn"
                                  disabled={
                                    hudStats.level < AIRPORT_UNLOCK_LEVEL
                                  }
                                  onClick={handlePurchaseAirport}
                                  className={`px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer ${
                                    hudStats.level < AIRPORT_UNLOCK_LEVEL
                                      ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                                      : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                                  }`}
                                >
                                  {hudStats.level < AIRPORT_UNLOCK_LEVEL
                                    ? `Unlocks at XP Level ${AIRPORT_UNLOCK_LEVEL}`
                                    : `Purchase & Restore (${formatMoney(AIRPORT_PURCHASE_PRICE)})`}
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* 4-Tab Airport Navigation Bar: OVERVIEW | UPGRADE | PARKING AREAS | GUEST AIRCRAFT */}
                              <div
                                data-testid="airport-inspector-tabs"
                                className="grid grid-cols-4 gap-1 bg-slate-950/90 p-1 rounded-lg border border-slate-800"
                              >
                                {(
                                  [
                                    ['OVERVIEW', 'OVERVIEW', 'airport-tab-overview'],
                                    ['UPGRADE', 'UPGRADE', 'airport-tab-upgrade'],
                                    ['PARKING_AREAS', 'PARKING AREAS', 'airport-tab-parking'],
                                    ['GUEST_AIRCRAFT', 'GUEST AIRCRAFT', 'airport-tab-guest-aircraft'],
                                  ] as const
                                ).map(([tabKey, tabLabel, testId]) => (
                                  <button
                                    key={tabKey}
                                    type="button"
                                    data-testid={testId}
                                    onClick={() => setAirportInspectorTab(tabKey)}
                                    className={`px-1.5 py-1 rounded text-[10px] font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap truncate ${
                                      airportInspectorTab === tabKey
                                        ? 'bg-sky-500 text-slate-950 shadow'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                  >
                                    {tabLabel}
                                  </button>
                                ))}
                              </div>

                              {/* TAB 1: OVERVIEW */}
                              {airportInspectorTab === 'OVERVIEW' && (
                                <div
                                  data-testid="airport-overview-panel"
                                  className="space-y-2 pt-0.5"
                                >
                                  <div className="text-[11px] text-slate-300 bg-slate-900/75 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                    Runway 09/27, parallel taxiway (4 turnoffs),
                                    ATC Tower, 10×15 CARGO Terminal + 18×6
                                    Truck-Handling Yard (6 Docks / 4 Queue
                                    Slots) &amp; 4-lane right-side freight road
                                    active (
                                    {
                                      hudStats.airport.activeConstructedBounds
                                        .totalCells
                                    }
                                    /3,500 cells · Milestones: Lv.1 30×40 →
                                    Lv.10 40×50 → Lv.20 50×70).
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {hudStats.airport.level <
                                      hudStats.airport.maxLevel && (
                                      <button
                                        type="button"
                                        data-testid="upgrade-airport-btn"
                                        onClick={handleUpgradeAirport}
                                        className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold cursor-pointer text-[11px]"
                                      >
                                        Upgrade Lv.
                                        {hudStats.airport.level + 1} (
                                        {formatMoney(
                                          hudStats.airport.upgradeCost
                                        )}
                                        )
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      data-testid="atc-supply-arrival-btn"
                                      onClick={handleAtcAcceptSupplyFlight}
                                      className="px-2.5 py-1.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold cursor-pointer text-[11px]"
                                    >
                                      ATC Supply Flight
                                    </button>
                                    <button
                                      type="button"
                                      data-testid="airport-dolly-transfer-btn"
                                      onClick={handleAirportDollyTransfer}
                                      className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 font-semibold cursor-pointer text-[11px]"
                                    >
                                      Dolly Whse→Yard (4t)
                                    </button>
                                  </div>

                                  {/* 1. Separate 10x10 Warehouse & 10x10 Transfer Yard Status (Prompt 3) */}
                                  {hudStats.airportWarehouse &&
                                    hudStats.airportTransferYard && (
                                      <div className="bg-slate-900/85 px-2.5 py-1.5 rounded-lg border border-slate-800 space-y-1">
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="font-semibold text-amber-300">
                                            10×10 Cargo Whse (
                                            {
                                              hudStats.airportWarehouse
                                                .constructedBounds.widthCells
                                            }
                                            ×
                                            {
                                              hudStats.airportWarehouse
                                                .constructedBounds.depthCells
                                            }
                                            ) &amp; 10×10 Transfer Yard
                                          </span>
                                          <span className="text-slate-400">
                                            Transfers:{' '}
                                            {
                                              hudStats.airportTransferYard
                                                .completedTransferCount
                                            }
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-slate-300 flex flex-wrap gap-x-3 gap-y-0.5">
                                          <span>
                                            Whse Stored:{' '}
                                            <strong className="text-white">
                                              {hudStats.airportWarehouse.totalStoredTons.toFixed(
                                                1
                                              )}
                                              t
                                            </strong>
                                          </span>
                                          <span>
                                            Yard Staged:{' '}
                                            <strong className="text-emerald-300">
                                              {hudStats.airportTransferYard.totalStagedTons.toFixed(
                                                1
                                              )}
                                              t
                                            </strong>
                                          </span>
                                          <span>
                                            Unlocked Tiers:{' '}
                                            <strong className="text-sky-300">
                                              {getUnlockedAirCargoMaterialsForLevel(
                                                hudStats.airport.level
                                              )
                                                .map((m) => m.name)
                                                .join(' · ')}
                                            </strong>
                                          </span>
                                        </div>
                                      </div>
                                    )}

                                  {/* 2. Two Separate Purchasable Aircraft Hangars ($5,000,000 Fixed Price Each — Part 2 Section 6) */}
                                  {hudStats.aircraftHangars && (
                                    <div className="bg-slate-900/85 px-2.5 py-1.5 rounded-lg border border-slate-800 space-y-1">
                                      <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="font-semibold text-white">
                                          Aircraft Hangars (
                                          {
                                            hudStats.aircraftHangars.filter(
                                              (h) => h.constructed
                                            ).length
                                          }
                                          /2 Built ·{' '}
                                          {formatMoney(
                                            AIRCRAFT_HANGAR_PURCHASE_COST
                                          )}{' '}
                                          each)
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                          1 Owned Aircraft / Hangar
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {hudStats.aircraftHangars.map((h) =>
                                          !h.constructed ? (
                                            <button
                                              key={h.id}
                                              type="button"
                                              data-testid={`construct-${h.id.toLowerCase()}-btn`}
                                              onClick={() =>
                                                handleConstructAirportHangar(
                                                  h.id
                                                )
                                              }
                                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/40 text-[10px] font-semibold cursor-pointer"
                                            >
                                              Buy {h.id} (
                                              {formatMoney(h.constructionCost)})
                                            </button>
                                          ) : (
                                            <span
                                              key={h.id}
                                              data-testid={`hangar-status-${h.id.toLowerCase()}`}
                                              className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold"
                                            >
                                              {h.id}:{' '}
                                              {h.occupiedByAircraftId
                                                ? `Stored (${h.occupiedByAircraftId})`
                                                : 'Ready (Free)'}
                                            </span>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* 3. Player Cargo Aircraft Fleet (0/2 Max — Lv.10 $20M & Lv.15 $30M — Part 2 Sections 2–5) */}
                                  <div className="bg-slate-900/85 px-2.5 py-1.5 rounded-lg border border-slate-800 space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span
                                        data-testid="owned-aircraft-fleet-count"
                                        className="font-semibold text-sky-300"
                                      >
                                        Player Cargo Aircraft Fleet (
                                        {hudStats.playerCargoAircraft?.length ??
                                          0}
                                        /{MAX_PLAYER_AIRCRAFT} Max)
                                      </span>
                                      {(hudStats.playerCargoAircraft?.length ??
                                        0) < MAX_PLAYER_AIRCRAFT && (
                                        <button
                                          type="button"
                                          data-testid="buy-aircraft-btn"
                                          onClick={() =>
                                            handlePurchaseOwnedAircraft(
                                              (hudStats.playerCargoAircraft
                                                ?.length ?? 0) === 0
                                                ? 1
                                                : 2
                                            )
                                          }
                                          className="px-2 py-0.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[10px] cursor-pointer shadow"
                                        >
                                          Buy Aircraft
                                        </button>
                                      )}
                                    </div>

                                    {/* Owned Aircraft Slot #1 & #2 Purchase Controls */}
                                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                      {/* Slot 1: Airport Level 10, $20,000,000 */}
                                      {(hudStats.playerCargoAircraft?.length ??
                                        0) < 1 ? (
                                        <button
                                          type="button"
                                          data-testid="purchase-owned-aircraft-1-btn"
                                          onClick={() =>
                                            handlePurchaseOwnedAircraft(1)
                                          }
                                          className={`px-2 py-1 rounded border text-left font-semibold cursor-pointer ${
                                            hudStats.airport.level >=
                                            FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL
                                              ? 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border-sky-400/50'
                                              : 'bg-slate-950/70 text-slate-400 border-slate-800'
                                          }`}
                                        >
                                          <div className="font-bold text-white">
                                            1st Aircraft (
                                            {formatMoney(
                                              FIRST_OWNED_AIRCRAFT_PRICE
                                            )}
                                            )
                                          </div>
                                          <div>
                                            {hudStats.airport.level >=
                                            FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL
                                              ? 'Unlocked (Req. Hangar 1)'
                                              : `Unlocks at Airport Lv.${FIRST_OWNED_AIRCRAFT_UNLOCK_LEVEL}`}
                                          </div>
                                        </button>
                                      ) : (
                                        <div className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                                          Slot #1 Owned (Lv.10 · $20M)
                                        </div>
                                      )}

                                      {/* Slot 2: Airport Level 15, $30,000,000 */}
                                      {(hudStats.playerCargoAircraft?.length ??
                                        0) < 2 ? (
                                        <button
                                          type="button"
                                          data-testid="purchase-owned-aircraft-2-btn"
                                          onClick={() =>
                                            handlePurchaseOwnedAircraft(2)
                                          }
                                          className={`px-2 py-1 rounded border text-left font-semibold cursor-pointer ${
                                            hudStats.airport.level >=
                                              SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL &&
                                            (hudStats.playerCargoAircraft
                                              ?.length ?? 0) >= 1
                                              ? 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border-sky-400/50'
                                              : 'bg-slate-950/70 text-slate-400 border-slate-800'
                                          }`}
                                        >
                                          <div className="font-bold text-white">
                                            2nd Aircraft (
                                            {formatMoney(
                                              SECOND_OWNED_AIRCRAFT_PRICE
                                            )}
                                            )
                                          </div>
                                          <div>
                                            {hudStats.airport.level >=
                                            SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL
                                              ? 'Unlocked (Req. Hangar 2)'
                                              : `Unlocks at Airport Lv.${SECOND_OWNED_AIRCRAFT_UNLOCK_LEVEL}`}
                                          </div>
                                        </button>
                                      ) : (
                                        <div className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                                          Slot #2 Owned (Lv.15 · $30M)
                                        </div>
                                      )}
                                    </div>

                                    {(hudStats.playerCargoAircraft?.length ??
                                      0) === 0 ? (
                                      <div className="text-[10px] text-slate-400">
                                        0/{MAX_PLAYER_AIRCRAFT} player-owned
                                        aircraft at start. Guest aircraft are
                                        available from Level 1; purchase Hangars
                                        ($5M each) and unlock your 1st owned
                                        aircraft at Airport Lv.10 ($20M) and 2nd
                                        at Airport Lv.15 ($30M).
                                      </div>
                                    ) : (
                                      hudStats.playerCargoAircraft!.map(
                                        (ac) => (
                                          <div
                                            key={ac.id}
                                            data-testid={`owned-aircraft-row-${ac.id}`}
                                            className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 px-2 py-1 rounded border border-slate-800 text-[10px]"
                                          >
                                            <div>
                                              <span className="font-bold text-white">
                                                {ac.name}
                                              </span>{' '}
                                              · {ac.effectiveCapacityTons}t ·
                                              Hangar:{' '}
                                              <strong className="text-sky-300">
                                                {ac.assignedHangarId ??
                                                  'HANGAR_1'}
                                              </strong>{' '}
                                              ·{' '}
                                              <span
                                                className={
                                                  ac.isGrounded
                                                    ? 'text-rose-400 font-bold'
                                                    : ac.conditionPercent < 20
                                                      ? 'text-amber-300 font-bold'
                                                      : 'text-emerald-300'
                                                }
                                              >
                                                Cond: {ac.conditionPercent}%
                                              </span>{' '}
                                              · Stage: {ac.flightStage}
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                data-testid={`dispatch-owned-aircraft-${ac.id}-btn`}
                                                disabled={
                                                  ac.isGrounded ||
                                                  (ac.flightStage !==
                                                    'PARKED' &&
                                                    ac.flightStage !==
                                                      'IN_HANGAR')
                                                }
                                                onClick={() =>
                                                  handleDispatchPlayerAircraft(
                                                    ac.id
                                                  )
                                                }
                                                className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                                                  ac.isGrounded
                                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                                    : 'bg-sky-400 hover:bg-sky-300 text-slate-950'
                                                }`}
                                              >
                                                Fly
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleRepairPlayerAircraftInHangar(
                                                    ac.id
                                                  )
                                                }
                                                className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold cursor-pointer"
                                              >
                                                Hangar Repair
                                              </button>
                                            </div>
                                          </div>
                                        )
                                      )
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* TAB 2: UPGRADE (20 Levels, 30x40 -> 40x50 -> 50x70 Expansion, $25M+ Progression, 5t -> 50t Cargo Capacity) */}
                              {airportInspectorTab === 'UPGRADE' && (
                                <div
                                  data-testid="airport-upgrade-panel"
                                  className="bg-slate-900/85 p-2.5 rounded-lg border border-slate-800 space-y-2 text-[11px]"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-amber-300">
                                      20-Level Airport Expansion Plan
                                    </span>
                                    <span className="text-slate-400 font-mono">
                                      Level {hudStats.airport.level} /{' '}
                                      {hudStats.airport.maxLevel}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                    <div className="bg-slate-950/75 p-2 rounded border border-slate-800">
                                      <div className="text-slate-400 uppercase font-semibold">
                                        Current Level {hudStats.airport.level}
                                      </div>
                                      <div className="mt-0.5 text-white font-bold">
                                        Capacity:{' '}
                                        {hudStats.airport.cargoCapacityTons}t /
                                        flight
                                      </div>
                                      <div className="text-sky-300">
                                        Unlocked Stands:{' '}
                                        {hudStats.airport.unlockedStandCount} /{' '}
                                        {AIRPORT_MAX_PARKING_AREAS}
                                      </div>
                                      <div className="text-slate-300">
                                        Active Footprint:{' '}
                                        {
                                          hudStats.airport
                                            .activeConstructedBounds.depthCells
                                        }
                                        ×
                                        {
                                          hudStats.airport
                                            .activeConstructedBounds.widthCells
                                        }{' '}
                                        (
                                        {
                                          hudStats.airport
                                            .activeConstructedBounds.totalCells
                                        }
                                        /3,500)
                                      </div>
                                    </div>

                                    <div className="bg-slate-950/75 p-2 rounded border border-slate-800">
                                      {hudStats.airport.level <
                                      hudStats.airport.maxLevel ? (
                                        <>
                                          <div className="text-amber-300 uppercase font-semibold">
                                            Next Level{' '}
                                            {hudStats.airport.level + 1}
                                          </div>
                                          <div className="mt-0.5 text-emerald-300 font-bold">
                                            Capacity:{' '}
                                            {getAirportCargoCapacityForLevel(
                                              hudStats.airport.level + 1
                                            )}
                                            t / flight
                                          </div>
                                          <div className="text-sky-300">
                                            Unlocked Stands:{' '}
                                            {getAirportUnlockedStandsForLevel(
                                              hudStats.airport.level + 1
                                            )}{' '}
                                            / {AIRPORT_MAX_PARKING_AREAS}
                                          </div>
                                          <div className="text-amber-200 font-mono">
                                            Cost:{' '}
                                            {formatMoney(
                                              hudStats.airport.upgradeCost
                                            )}
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="text-emerald-400 uppercase font-semibold">
                                            Max Level Reached
                                          </div>
                                          <div className="mt-0.5 text-white font-bold">
                                            50t Max Cargo Capacity
                                          </div>
                                          <div className="text-sky-300">
                                            All 10 Stands Unlocked
                                          </div>
                                          <div className="text-emerald-300">
                                            Full 50×70 (3,500 cells)
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  <div className="text-[10px] text-slate-300 bg-slate-950/70 px-2 py-1.5 rounded border border-slate-800">
                                    <div>
                                      <strong className="text-white">
                                        Footprint Milestones:
                                      </strong>{' '}
                                      Lv.1: 30×40 (1,200) → Lv.10: 40×50 (2,000)
                                      → Lv.20: 50×70 (3,500)
                                    </div>
                                    <div>
                                      <strong className="text-sky-300">
                                        Aircraft Unlocks:
                                      </strong>{' '}
                                      Lv.10: 1st Owned Aircraft ($20M) · Lv.15:
                                      2nd Owned Aircraft ($30M)
                                    </div>
                                  </div>

                                  {hudStats.airport.level <
                                  hudStats.airport.maxLevel ? (
                                    <button
                                      type="button"
                                      data-testid="upgrade-airport-btn"
                                      onClick={handleUpgradeAirport}
                                      className="w-full py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold cursor-pointer text-xs"
                                    >
                                      Upgrade to Level{' '}
                                      {hudStats.airport.level + 1} (
                                      {formatMoney(hudStats.airport.upgradeCost)}
                                      )
                                    </button>
                                  ) : (
                                    <div className="text-center py-1.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                                      Maximum Airport Level 20 Achieved (50×70 ·
                                      3,500 Cells)
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* TAB 3: PARKING AREAS (10 Stands, $500k + $150k/level Purchase Pricing) */}
                              {airportInspectorTab === 'PARKING_AREAS' && (
                                <div
                                  data-testid="airport-parking-panel"
                                  className="bg-slate-900/85 p-2.5 rounded-lg border border-slate-800 space-y-2 text-[11px]"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <span className="font-bold text-sky-300">
                                        Aircraft Parking Areas (
                                        {hudStats.airport.purchasedStandCount}/
                                        {AIRPORT_MAX_PARKING_AREAS} Owned)
                                      </span>
                                      <div className="text-[10px] text-slate-400">
                                        Current Stand Price (Lv.
                                        {hudStats.airport.level}):{' '}
                                        <strong className="text-amber-300">
                                          {formatMoney(
                                            getAirportParkingAreaPriceForLevel(
                                              hudStats.airport.level
                                            )
                                          )}
                                        </strong>
                                      </div>
                                    </div>
                                    <div className="text-right text-[10px] font-mono">
                                      <span className="text-emerald-300">
                                        {hudStats.airport.availableStandCount}{' '}
                                        Free
                                      </span>{' '}
                                      ·{' '}
                                      <span className="text-amber-300">
                                        {hudStats.airport.occupiedStandCount +
                                          hudStats.airport.reservedStandCount}{' '}
                                        Busy
                                      </span>
                                    </div>
                                  </div>

                                  <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                                    {hudStats.airport.parkingStands.map(
                                      (stand) => (
                                        <div
                                          key={stand.id}
                                          data-testid={`parking-stand-row-${stand.standNumber}`}
                                          className="flex items-center justify-between gap-2 bg-slate-950/75 px-2 py-1.5 rounded border border-slate-800 text-[10px]"
                                        >
                                          <div>
                                            <span className="font-bold text-white">
                                              Stand #{stand.standNumber}
                                            </span>{' '}
                                            <span className="text-slate-400 font-mono">
                                              ({stand.standCode})
                                            </span>
                                            {stand.occupiedByAircraftId && (
                                              <span className="ml-1.5 text-amber-300">
                                                · Occupied (
                                                {stand.occupiedByAircraftId})
                                              </span>
                                            )}
                                            {!stand.occupiedByAircraftId &&
                                              stand.reservedByAircraftId && (
                                                <span className="ml-1.5 text-sky-300">
                                                  · Reserved (
                                                  {stand.reservedByAircraftId})
                                                </span>
                                              )}
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {stand.purchased ? (
                                              <span
                                                className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                                                  stand.availabilityStatus ===
                                                  'AVAILABLE'
                                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                                    : stand.availabilityStatus ===
                                                        'OCCUPIED'
                                                      ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                                                      : 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                                                }`}
                                              >
                                                {stand.availabilityStatus}
                                              </span>
                                            ) : stand.unlocked ? (
                                              <button
                                                type="button"
                                                data-testid={`purchase-stand-${stand.standNumber}-btn`}
                                                onClick={() =>
                                                  handlePurchaseAirportParkingStand(
                                                    stand.standNumber
                                                  )
                                                }
                                                className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold cursor-pointer"
                                              >
                                                Buy (
                                                {formatMoney(
                                                  stand.purchasePrice
                                                )}
                                                )
                                              </button>
                                            ) : (
                                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                                                Unlocks Lv.{stand.unlockLevel}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* TAB 4: GUEST AIRCRAFT (Sections 8, 9 & 10 — Dedicated Guest Aircraft Arrivals & Parking Rule) */}
                              {airportInspectorTab === 'GUEST_AIRCRAFT' && (
                                <div
                                  data-testid="airport-guest-aircraft-panel"
                                  className="bg-slate-900/85 p-2.5 rounded-lg border border-slate-800 space-y-2 text-[11px]"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <span className="font-bold text-sky-300">
                                        Guest Aircraft Operations (Visiting NPC)
                                      </span>
                                      <div className="text-[10px] text-slate-400">
                                        Available from Level 1 · Separate from
                                        2-aircraft owned fleet &amp; hangars
                                      </div>
                                    </div>
                                    <div className="text-right text-[10px] font-mono">
                                      <span className="text-emerald-300 font-bold">
                                        {hudStats.airport.availableStandCount}/
                                        {hudStats.airport.activeStandCount}{' '}
                                        Stands Free
                                      </span>
                                      <div className="text-slate-400">
                                        Visits:{' '}
                                        {hudStats.guestArrivalsHandled ?? 0}
                                      </div>
                                    </div>
                                  </div>

                                  {hudStats.airport.availableStandCount ===
                                    0 && (
                                    <div
                                      data-testid="guest-parking-full-warning"
                                      className="px-2.5 py-1.5 rounded bg-rose-500/20 border border-rose-500/50 text-rose-200 text-[10px] font-medium"
                                    >
                                      All available (unlocked &amp; purchased)
                                      parking stands are occupied or reserved.
                                      Aircraft cannot land until a stand is free
                                      or additional stands are purchased.
                                    </div>
                                  )}

                                  <div className="flex items-center gap-1.5">
                                    <select
                                      data-testid="guest-aircraft-model-select"
                                      value={selectedGuestAircraftModelId}
                                      onChange={(e) =>
                                        setSelectedGuestAircraftModelId(
                                          e.target.value
                                        )
                                      }
                                      className="flex-1 min-w-0 truncate bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-white"
                                    >
                                      {GUEST_AIRCRAFT_CATALOGUE.map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {item.name} ({item.originHub})
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      data-testid="request-guest-aircraft-btn"
                                      onClick={() =>
                                        handleRequestGuestAircraftArrival(
                                          selectedGuestAircraftModelId
                                        )
                                      }
                                      className={`px-2.5 py-1 rounded font-bold text-[10px] cursor-pointer shrink-0 ${
                                        hudStats.airport.availableStandCount > 0
                                          ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                                          : 'bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/40'
                                      }`}
                                    >
                                      Request Guest Arrival
                                    </button>
                                  </div>

                                  <div className="space-y-1 max-h-36 overflow-y-auto">
                                    {(hudStats.guestAircraft?.length ?? 0) ===
                                    0 ? (
                                      <div className="text-[10px] text-slate-400 bg-slate-950/60 px-2 py-1.5 rounded border border-slate-800">
                                        No visiting guest aircraft currently on
                                        approach or parked. Select a freighter
                                        above and click &ldquo;Request Guest
                                        Arrival&rdquo;.
                                      </div>
                                    ) : (
                                      hudStats.guestAircraft!.map((gAc) => (
                                        <div
                                          key={gAc.id}
                                          data-testid={`guest-aircraft-row-${gAc.id}`}
                                          className="flex items-center justify-between gap-2 bg-slate-950/80 px-2 py-1.5 rounded border border-slate-800 text-[10px]"
                                        >
                                          <div>
                                            <span className="font-bold text-white">
                                              {gAc.callsign}
                                            </span>{' '}
                                            · {gAc.name}
                                            <div className="text-slate-400">
                                              Stand:{' '}
                                              <strong className="text-sky-300">
                                                {gAc.assignedStandId}
                                              </strong>{' '}
                                              · Stage:{' '}
                                              <strong className="text-amber-300">
                                                {gAc.flightStage}
                                              </strong>
                                            </div>
                                          </div>
                                          {gAc.flightStage === 'APPROACH' && (
                                            <button
                                              type="button"
                                              data-testid={`cancel-guest-aircraft-${gAc.id}-btn`}
                                              onClick={() =>
                                                handleCancelGuestAircraftArrival(
                                                  gAc.id
                                                )
                                              }
                                              className="px-2 py-0.5 rounded bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 border border-rose-500/40 font-semibold cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                    {/* Selected Building / Facility Management Card (including Section 9 Warehouse 1 Inspector) */}
                    {!selectedVehicleObj &&
                      selectedCellReport?.zoneCategory !== 'AIRPORT_RESERVED' &&
                      selectedCellReport?.building &&
                      (() => {
                        const bld = selectedCellReport.building;
                        const wh =
                          worldRef.current?.economy.getWarehouse(bld.id) ??
                          (bld.id === 'facility-warehouse-1'
                            ? hudStats.warehouse1
                            : null);

                        if (wh) {
                          const nextLvl = wh.level < wh.maxLevel ? wh.level + 1 : null;
                          const nextCap = nextLvl
                            ? getWarehouseCapacitiesForLevel(nextLvl)
                            : null;
                          const nextDoors = nextLvl
                            ? getWarehouseDoorCountForLevel(nextLvl)
                            : null;
                          const nextForklifts = nextLvl
                            ? getWarehouseForkliftCountForLevel(nextLvl)
                            : null;
                          const nextFp = nextLvl
                            ? getWarehouseConstructedFootprintForLevel(nextLvl)
                            : null;
                          const activeForkliftsCount = wh.forklifts.filter(
                            (f) => f.state !== 'IDLE_PARKED'
                          ).length;

                          return (
                            <div
                              data-testid="warehouse-1-inspector"
                              className="mt-2 text-xs text-slate-200 space-y-2"
                            >
                              {/* Level & Operational Status Banner */}
                              <div className="flex items-center justify-between gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                <div>
                                  <div className="font-bold text-white text-xs">
                                    Level {wh.level} / {wh.maxLevel} ·{' '}
                                    {wh.constructedWidthCells}×
                                    {wh.constructedDepthCells} Constructed
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    Reserved Property: 25×30 cells · 15 blocks
                                    from Core
                                  </div>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    wh.operationalStatus === 'STOCK_SHORTAGE'
                                      ? 'bg-rose-500/25 text-rose-300 border border-rose-500/50'
                                      : wh.operationalStatus ===
                                          'ACTIVE_LOADING'
                                        ? 'bg-amber-400/25 text-amber-200 border border-amber-400/50'
                                        : wh.operationalStatus === 'QUEUED'
                                          ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  }`}
                                >
                                  {wh.operationalStatus.replace('_', ' ')}
                                </span>
                              </div>

                              {/* Multi-Category Cargo Inventory Bars */}
                              <div className="space-y-1.5 bg-slate-900/75 p-2.5 rounded-lg border border-slate-800/90">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                  Warehouse Cargo Storage (Tons)
                                </div>

                                {(
                                  [
                                    [
                                      'FOOD',
                                      'Food Items',
                                      wh.stored.FOOD,
                                      wh.capacities.FOOD,
                                      'bg-emerald-400',
                                    ],
                                    [
                                      'INDUSTRIAL',
                                      'Industrial Items',
                                      wh.stored.INDUSTRIAL,
                                      wh.capacities.INDUSTRIAL,
                                      'bg-amber-400',
                                    ],
                                    [
                                      'PACKAGES',
                                      'Normal Packages',
                                      wh.stored.PACKAGES,
                                      wh.capacities.PACKAGES,
                                      'bg-sky-400',
                                    ],
                                  ] as const
                                ).map(([catKey, label, storedVal, capVal, barColor]) => {
                                  const pct = Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      capVal > 0 ? (storedVal / capVal) * 100 : 0
                                    )
                                  );
                                  return (
                                    <div key={catKey} className="space-y-0.5">
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-300 font-medium">
                                          {label}
                                        </span>
                                        <span className="font-mono text-white font-semibold">
                                          {storedVal.toFixed(1)}t /{' '}
                                          {capVal.toFixed(1)}t
                                        </span>
                                      </div>
                                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full ${barColor} transition-all duration-300`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Doors, Forklifts, Trucks Loading & Waiting */}
                              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                  <div className="text-slate-400">
                                    Operational Doors
                                  </div>
                                  <div className="text-white font-bold text-xs">
                                    {wh.operationalDoorCount} / 10 Doors
                                  </div>
                                </div>
                                <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                  <div className="text-slate-400">
                                    Operational Forklifts
                                  </div>
                                  <div className="text-white font-bold text-xs">
                                    {wh.operationalForkliftCount} / 10 (
                                    {activeForkliftsCount} Active)
                                  </div>
                                </div>
                                <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                  <div className="text-slate-400">
                                    Trucks Loading
                                  </div>
                                  <div className="text-amber-300 font-bold text-xs">
                                    {wh.activeLoadingTasks.length} Loading Now
                                  </div>
                                </div>
                                <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                  <div className="text-slate-400">
                                    Trucks Waiting
                                  </div>
                                  <div className="text-sky-300 font-bold text-xs">
                                    {wh.waitingTruckIds.length} in Queue
                                  </div>
                                </div>
                              </div>

                              {/* Operational Status Message & Active Loading Tasks */}
                              <div className="text-[11px] text-slate-300 bg-slate-900/70 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                                <div>{wh.statusMessage}</div>
                                {wh.activeLoadingTasks.length > 0 && (
                                  <div className="mt-1 pt-1 border-t border-slate-800 space-y-0.5 text-amber-200">
                                    {wh.activeLoadingTasks.map((task) => (
                                      <div key={task.id}>
                                        • Door #{task.doorNumber} (Forklift #
                                        {(task.forkliftId || '1').split('-').pop()}):{' '}
                                        {task.category}{' '}
                                        {task.loadedTons.toFixed(1)}t /{' '}
                                        {task.totalTonsRequired.toFixed(1)}t
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Next Upgrade Improvements Preview */}
                              {nextLvl &&
                                nextCap &&
                                nextDoors &&
                                nextForklifts &&
                                nextFp && (
                                  <div className="bg-sky-950/35 border border-sky-500/30 rounded-lg px-2.5 py-1.5 text-[11px] text-sky-200">
                                    <div className="font-bold text-sky-300">
                                      Next Upgrade (Level {nextLvl}):
                                    </div>
                                    <div>
                                      Food {nextCap.FOOD.toFixed(1)}t · Ind{' '}
                                      {nextCap.INDUSTRIAL.toFixed(1)}t · Pkg{' '}
                                      {nextCap.PACKAGES.toFixed(1)}t
                                    </div>
                                    <div>
                                      {nextDoors} Loading Doors ·{' '}
                                      {nextForklifts} Forklifts ·{' '}
                                      {nextFp.widthCells}×{nextFp.depthCells}{' '}
                                      Footprint
                                    </div>
                                  </div>
                                )}

                              {/* Action Buttons */}
                              <div className="pt-1 flex flex-wrap items-center gap-2">
                                {wh.level < wh.maxLevel && (
                                  <button
                                    type="button"
                                    data-testid="upgrade-warehouse-1-btn"
                                    onClick={() =>
                                      handleUpgradeSelectedBuilding(bld)
                                    }
                                    className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold cursor-pointer"
                                  >
                                    Upgrade to Lv.{wh.level + 1} (
                                    {formatMoney(wh.upgradeCost)})
                                  </button>
                                )}
                                <button
                                  type="button"
                                  data-testid="restock-warehouse-1-btn"
                                  onClick={() => handleRestockWarehouse(wh.id)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold cursor-pointer"
                                >
                                  Restock Cargo
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // Special 20-Level Truck Depot Inspector Panel (Prompts 1–5)
                        if (
                          bld.id === TRUCK_DEPOT_ID &&
                          hudStats.truckDepot
                        ) {
                          const td = hudStats.truckDepot;
                          const nextDepotLvl =
                            td.level < TRUCK_DEPOT_MAX_LEVEL
                              ? td.level + 1
                              : null;
                          const nextDepotSpec = nextDepotLvl
                            ? getTruckDepotLevelSpec(nextDepotLvl)
                            : null;
                          const assignedTrucks = hudStats.ownedVehicles.filter(
                            (v) =>
                              v.modal === 'ROAD' &&
                              v.homeFacilityId === TRUCK_DEPOT_ID
                          );
                          const occupiedSlots = assignedTrucks.length;
                          const availableSlots = Math.max(
                            0,
                            td.truckCapacity - occupiedSlots
                          );

                          return (
                            <div
                              data-testid="truck-depot-inspector-panel"
                              className="mt-2 text-xs text-slate-200 space-y-2"
                            >
                              {/* Level, Active Footprint & Reserved Expansion Summary */}
                              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                <div>
                                  <span className="text-sky-400 font-bold">
                                    Level {td.level} / {td.maxLevel}
                                  </span>
                                  <span className="mx-1.5 text-slate-600">·</span>
                                  <span className="text-slate-300">
                                    Active:{' '}
                                    <strong className="text-white">
                                      {td.activeWidthCells}×{td.activeDepthCells}
                                    </strong>{' '}
                                    blocks
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  Reserved Max: {td.reservedWidthCells}×
                                  {td.reservedDepthCells} blocks
                                </span>
                              </div>

                              {/* Truck Capacity, Occupied & Available Slots, and Entrance Clearance */}
                              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                  <div className="text-slate-400">
                                    Truck Capacity
                                  </div>
                                  <div className="text-white font-bold text-xs">
                                    {td.truckCapacity} / 15 Mini Trucks
                                  </div>
                                </div>
                                <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                  <div className="text-slate-400">
                                    Parking Slots
                                  </div>
                                  <div className="text-emerald-400 font-bold text-xs">
                                    {occupiedSlots} Occupied · {availableSlots} Free
                                  </div>
                                </div>
                                <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                  <div className="text-slate-400">
                                    Service Bays
                                  </div>
                                  <div className="text-sky-300 font-bold text-xs">
                                    {td.garageBayCount} Maintenance Bays
                                  </div>
                                </div>
                                <div className="bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                  <div className="text-slate-400">
                                    Bay Clearance
                                  </div>
                                  <div className="text-amber-300 font-bold text-xs">
                                    {td.entranceClearanceWidthMeters.toFixed(1)}m ×{' '}
                                    {td.entranceClearanceHeightMeters.toFixed(1)}m
                                  </div>
                                </div>
                              </div>

                              {/* Assigned Depot Mini Trucks List */}
                              <div className="bg-slate-900/85 p-2 rounded-lg border border-slate-800 space-y-1 max-h-32 overflow-y-auto">
                                <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                                  <span>
                                    Assigned Mini Trucks ({assignedTrucks.length}/
                                    {td.truckCapacity})
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    5-Day Service Cycle
                                  </span>
                                </div>
                                {assignedTrucks.map((truck) => {
                                  const friendly = formatFriendlyVehicleState(
                                    truck.state,
                                    truck.routeProgressRatio
                                  );
                                  return (
                                    <div
                                      key={truck.id}
                                      className="flex items-center justify-between gap-2 text-[11px] py-1 border-t border-slate-800/80"
                                    >
                                      <div className="truncate">
                                        <span className="font-semibold text-white">
                                          Slot #{truck.assignedDepotSlotNumber ?? '?'}:{' '}
                                          {truck.name}
                                        </span>
                                        <span
                                          className={`ml-1.5 font-medium ${friendly.colorClass}`}
                                        >
                                          ({friendly.label})
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            rendererRef.current?.focusOnWorldPosition(
                                              truck.worldX,
                                              truck.worldZ,
                                              22
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 text-[10px] font-semibold cursor-pointer"
                                        >
                                          View
                                        </button>
                                        {truck.conditionPercent < 100 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleMaintainVehicle(truck.id)
                                            }
                                            className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-bold cursor-pointer"
                                          >
                                            Service
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Next Upgrade Preview */}
                              {nextDepotLvl && nextDepotSpec && (
                                <div className="bg-sky-950/35 border border-sky-500/30 rounded-lg px-2.5 py-1.5 text-[11px] text-sky-200">
                                  <div className="font-bold text-sky-300">
                                    Next Upgrade (Level {nextDepotLvl} / 20):
                                  </div>
                                  <div>
                                    Active Footprint:{' '}
                                    <strong>
                                      {nextDepotSpec.activeWidthCells}×
                                      {nextDepotSpec.activeDepthCells} blocks
                                    </strong>{' '}
                                    · Capacity:{' '}
                                    <strong>
                                      {nextDepotSpec.truckCapacity} Mini Trucks
                                    </strong>{' '}
                                    · {nextDepotSpec.garageBayCount} Bays
                                  </div>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="pt-1 flex flex-wrap items-center gap-2">
                                {td.level < td.maxLevel && (
                                  <button
                                    type="button"
                                    data-testid="upgrade-truck-depot-btn"
                                    onClick={() =>
                                      handleUpgradeSelectedBuilding(bld)
                                    }
                                    className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold cursor-pointer"
                                  >
                                    Upgrade to Lv.{td.level + 1} (
                                    {formatMoney(td.upgradeCost)})
                                  </button>
                                )}
                                <button
                                  type="button"
                                  data-testid="buy-depot-truck-btn"
                                  disabled={availableSlots <= 0}
                                  onClick={() =>
                                    handlePurchaseVehicle(
                                      'veh-road-sprinter-van'
                                    )
                                  }
                                  className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                                    availableSlots > 0
                                      ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  }`}
                                >
                                  {availableSlots > 0
                                    ? '+ Buy Mini Truck ($14,000)'
                                    : 'Slots Full — Upgrade Depot'}
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="mt-1.5 text-xs text-slate-200 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
                              {bld.vehicleSlotCapacity > 0 && (
                                <span className="text-sky-300 font-medium">
                                  Vehicle Slots:{' '}
                                  {bld.vehicleSlotModal === 'ROAD'
                                    ? `${hudStats.roadSlotsUsed} / ${bld.vehicleSlotCapacity} Occupied`
                                    : `${bld.vehicleSlotCapacity} Available`}
                                </span>
                              )}
                              {bld.storageCapacityTons > 0 && (
                                <span>
                                  Cargo Storage: {bld.storedCargoTons}t /{' '}
                                  {bld.storageCapacityTons}t
                                </span>
                              )}
                            </div>

                            {expandedInspectorDetails && (
                              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 space-y-0.5">
                                <div>Category: {bld.category}</div>
                                <div>
                                  Plot Size: {bld.widthCells}×{bld.depthCells}{' '}
                                  tiles
                                </div>
                                <div>
                                  Facility Level: {bld.level} of {bld.maxLevel}
                                </div>
                              </div>
                            )}

                            <div className="pt-1 flex flex-wrap items-center gap-2">
                              {bld.level < bld.maxLevel && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpgradeSelectedBuilding(bld)
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold cursor-pointer"
                                >
                                  Upgrade ({formatMoney(bld.upgradeCost)})
                                </button>
                              )}

                              {bld.vehicleSlotCapacity > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (bld.vehicleSlotModal) {
                                      setVehicleTabModal(bld.vehicleSlotModal);
                                    }
                                    setVehicleSubView('SHOP');
                                    setActivePanel('VEHICLES');
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold cursor-pointer"
                                >
                                  Buy Vehicle
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedInspectorDetails((prev) => !prev)
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                              >
                                {expandedInspectorDetails
                                  ? 'Hide Details'
                                  : 'Expand Details'}
                              </button>

                              {!bld.isPreplaced && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPendingDemolish({
                                      kind: 'BUILDING',
                                      id: bld.id,
                                      name: bld.name,
                                      refundAmount: Math.round(
                                        (getBuildingSpecById(bld.catalogueId)
                                          ?.price ?? 8000) * 0.6
                                      ),
                                      coord: {
                                        gx: selectedCellReport.gx,
                                        gz: selectedCellReport.gz,
                                      },
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/60 text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                                >
                                  Demolish
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                    {/* Selected Unowned Land Parcel Card (Master Prompt 7 Part 5) */}
                    {!selectedVehicleObj &&
                      selectedCellReport?.zoneCategory !== 'AIRPORT_RESERVED' &&
                      !selectedCellReport?.building &&
                      selectedCellReport?.parcelId &&
                      !selectedCellReport.parcelOwned && (
                        <div className="mt-1.5 text-xs text-slate-200 space-y-1.5">
                          <div className="font-semibold text-sm text-white">
                            {selectedCellReport.parcelName}
                          </div>
                          <div className="text-slate-300">
                            Zoning:{' '}
                            {formatFriendlyZoneName(
                              selectedCellReport.zoneCategory
                            )}
                          </div>
                          <div className="text-slate-300">
                            Required Level:{' '}
                            {selectedCellReport.parcelUnlockLevel || 1} ·
                            Suitability: Ready for development
                          </div>
                          <div className="pt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handlePurchaseParcel(
                                  selectedCellReport.parcelId!
                                )
                              }
                              className="px-4 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold cursor-pointer"
                            >
                              Purchase Land (
                              {formatMoney(selectedCellReport.parcelPrice || 0)}
                              )
                            </button>
                          </div>
                        </div>
                      )}

                    {/* GTE Intermodal Railway Freight Hub Dispatch & Loading Card */}
                    {!selectedVehicleObj &&
                      selectedCellReport?.zoneCategory === 'RAIL_YARD' &&
                      hudStats.railHub && (
                        <div
                          data-testid="railway-hub-inspector"
                          className="mt-2.5 pt-2.5 border-t border-slate-800 text-xs text-slate-200 space-y-2"
                        >
                          {(() => {
                            const hub = hudStats.railHub;
                            const train = hub.trains[0];
                            const activeJob = hub.jobs.find(
                              (j) => j.id === train?.assignedJobId
                            );
                            const activeForklifts = hub.forklifts.filter(
                              (f) => f.state !== 'IDLE_AT_BAY'
                            ).length;
                            return (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 px-2.5 py-2 rounded-lg border border-slate-800">
                                  <div>
                                    <div className="font-bold text-amber-300">
                                      {GTE_ROLLING_STOCK_SPEC.locomotiveModel}{' '}
                                      Heavy Freight Consist
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                      Footprint:{' '}
                                      {RAILWAY_YARD_RESERVED_FOOTPRINT.widthCells}
                                      ×
                                      {RAILWAY_YARD_RESERVED_FOOTPRINT.depthCells}{' '}
                                      tiles · 4 Wagons (Boxcar-T1, Tankcar-O1,
                                      Tankcar-W1, Flatbed-C1)
                                    </div>
                                  </div>
                                  <span
                                    data-testid="rail-train-state-badge"
                                    className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase tracking-wider ${
                                      train?.state === 'IDLE'
                                        ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                        : train?.state === 'LOADING'
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50'
                                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                                    }`}
                                  >
                                    {train?.state ?? 'IDLE'}
                                  </span>
                                </div>

                                {/* GTE Model 360 Forklift & Track Signal Telemetry */}
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                  <div className="bg-slate-900/75 px-2.5 py-1.5 rounded border border-slate-800/90">
                                    <div className="text-slate-400">
                                      {GTE_FORKLIFT_MODEL_360_SPEC.name}
                                    </div>
                                    <div
                                      data-testid="rail-forklift-status"
                                      className="font-semibold text-white"
                                    >
                                      {activeForklifts > 0
                                        ? `${activeForklifts}/${hub.forklifts.length} Loading Wagons`
                                        : `${hub.forklifts.length} Parked at Bay (Idle)`}
                                    </div>
                                  </div>
                                  <div className="bg-slate-900/75 px-2.5 py-1.5 rounded border border-slate-800/90">
                                    <div className="text-slate-400">
                                      Mainline Signal & Speed
                                    </div>
                                    <div className="font-semibold text-white">
                                      <span
                                        className={
                                          train?.signalAspect === 'GREEN'
                                            ? 'text-emerald-400'
                                            : 'text-rose-400'
                                        }
                                      >
                                        ● {train?.signalAspect ?? 'RED'}
                                      </span>{' '}
                                      · {(train?.currentSpeedKmh ?? 0).toFixed(0)}{' '}
                                      km/h
                                    </div>
                                  </div>
                                </div>

                                {/* Active Loading Progress Bar or Transit Status */}
                                {train && train.state !== 'IDLE' && (
                                  <div className="bg-slate-900/95 p-2.5 rounded-lg border border-amber-500/40 space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="font-semibold text-amber-200 truncate">
                                        {activeJob?.title ||
                                          'Active Rail Freight Dispatch'}
                                      </span>
                                      <span
                                        data-testid="rail-loading-progress-text"
                                        className="font-mono-tabular font-bold text-amber-300"
                                      >
                                        {Math.round(
                                          train.loadingProgressPercent
                                        )}
                                        % ({train.loadedWagonCount}/
                                        {train.wagonModels.length} wagons)
                                      </span>
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-150"
                                        style={{
                                          width: `${Math.min(100, Math.max(0, train.loadingProgressPercent))}%`,
                                        }}
                                      />
                                    </div>
                                    <div className="text-[11px] text-slate-300">
                                      {train.state === 'LOADING'
                                        ? 'GTE Model 360 Forklifts transferring palletized cargo from staging dock to train wagons...'
                                        : `Dispatched along infinite straight mainline track · Reward: ${formatMoney(activeJob?.cashReward ?? 14500)} (+${activeJob?.xpReward ?? 290} XP)`}
                                    </div>
                                  </div>
                                )}

                                {/* Available Rail Freight Jobs & Assign Job & Load Trigger */}
                                <div className="space-y-1.5">
                                  <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                                    Rail Freight Manifests (Assign Job to Start
                                    Forklift Loading)
                                  </div>
                                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
                                    {hub.jobs.map((job, idx) => {
                                      const canAssign =
                                        train?.state === 'IDLE';
                                      return (
                                        <div
                                          key={job.id}
                                          className="flex items-center justify-between gap-2 bg-slate-900/90 px-2.5 py-2 rounded-lg border border-slate-800"
                                        >
                                          <div className="min-w-0">
                                            <div className="font-semibold text-white truncate">
                                              {job.title}
                                            </div>
                                            <div className="text-[11px] text-slate-400">
                                              {job.cargoTons}t {job.cargoType} ·{' '}
                                              <span className="text-emerald-300 font-semibold">
                                                +{formatMoney(job.cashReward)}
                                              </span>{' '}
                                              · +{job.xpReward} XP
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            data-testid={
                                              idx === 0
                                                ? 'assign-rail-job-btn'
                                                : `assign-rail-job-btn-${idx}`
                                            }
                                            disabled={!canAssign}
                                            onClick={() =>
                                              handleAssignRailJobAndLoad(job.id)
                                            }
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-colors ${
                                              canAssign
                                                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer'
                                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                            }`}
                                          >
                                            {canAssign
                                              ? 'Assign Job & Load'
                                              : train?.assignedJobId === job.id
                                                ? 'Active'
                                                : 'Train Busy'}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                  </div>
                )}
            </div>

            {/* Top-Right Compact Graphics Quality, Audio & Settings Buttons */}
            <div className="pointer-events-auto flex items-center gap-2">
              <div
                data-testid="graphics-quality-bar"
                className="hidden sm:flex items-center gap-1 px-2 h-10 rounded-xl border bg-slate-900/90 border-slate-700 shadow-lg"
                title="Real-Time PBR Graphics & Shadow Quality Preset"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  GFX
                </span>
                {(['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    tabIndex={-1}
                    data-testid={`gfx-preset-${preset.toLowerCase()}`}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setGraphicsQuality(preset);
                      const spec =
                        rendererRef.current?.setGraphicsQuality(preset) ??
                        GRAPHICS_QUALITY_PRESETS[preset];
                      setStatusMessage(
                        `Graphics Quality set to ${spec.label} (${spec.shadowMapSize}px Shadows · ${spec.maxAnisotropy}x Anisotropy).`
                      );
                      setStatusTone('info');
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      graphicsQuality === preset
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {GRAPHICS_QUALITY_PRESETS[preset].label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                tabIndex={-1}
                aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                title="Mute / Unmute Audio [M]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setIsMuted(audioSynth.toggleMute());
                }}
                className="w-10 h-10 flex items-center justify-center rounded-xl border bg-slate-900/90 border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer shadow-lg"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  {isMuted ? (
                    <>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </>
                  ) : (
                    <>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </>
                  )}
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-scale-toggle-btn"
                title="Cycle HUD Interface Scale (92% / 100% / 106%)"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setHudScale((prev) =>
                    prev === 'normal'
                      ? 'large'
                      : prev === 'large'
                        ? 'compact'
                        : 'normal'
                  );
                }}
                className="px-3 h-10 flex items-center gap-1 rounded-xl border bg-slate-950/95 border-cyan-500/40 text-cyan-200 hover:bg-slate-900 transition-colors cursor-pointer shadow-lg text-xs font-bold font-mono-tabular"
              >
                <span>
                  HUD{' '}
                  {hudScale === 'compact'
                    ? '92%'
                    : hudScale === 'large'
                      ? '106%'
                      : '100%'}
                </span>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Game Settings and Save"
                title="Settings, Save & Overlays [Esc]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setGameState('paused');
                }}
                className="px-3.5 h-10 flex items-center gap-1.5 rounded-xl border bg-slate-950/95 border-cyan-500/40 text-slate-100 hover:bg-slate-900 transition-colors cursor-pointer shadow-lg text-xs font-semibold"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>Menu</span>
              </button>
            </div>
          </div>

          {/* -----------------------------------------------------------------
              BOTTOM AREA: Popover Panels, Active Placement Bar, & Main Dock
              ----------------------------------------------------------------- */}
          <div className="self-center flex flex-col items-center max-w-[96vw] w-auto pointer-events-auto">
            {/* ===============================================================
                1. ACTIVE PLACEMENT / CONSTRUCTION CONTROL BAR (Master Prompt 7 Parts 3, 4 & 10)
                Hides large menus so the player sees the 3D world clearly while placing!
                =============================================================== */}
            {isPlacingOrDemolishing && (
              <div
                className="mb-2.5 rounded-2xl border border-slate-700 px-4 py-3 shadow-2xl flex flex-wrap items-center justify-center gap-3 max-w-[94vw]"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.95)' }}
              >
                {/* BUILDING PLACEMENT CONTROLS */}
                {activeTool === 'BUILD_STRUCTURE' &&
                  activePlacementBuildingSpec && (
                    <>
                      <div className="flex flex-col">
                        <div className="text-sm font-bold text-white">
                          Placing: {activePlacementBuildingSpec.name}{' '}
                          <span className="text-amber-400 font-mono-tabular">
                            ({formatMoney(activePlacementBuildingSpec.price)})
                          </span>
                        </div>
                        <div
                          className={`text-xs font-medium ${
                            hoverPlacementStatus.valid
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {hoverPlacementStatus.message}
                        </div>
                        {showPlacementInfo && (
                          <div className="mt-1 text-[11px] text-slate-300 max-w-md">
                            {activePlacementBuildingSpec.description} · Plot:{' '}
                            {activePlacementBuildingSpec.widthCells}×
                            {activePlacementBuildingSpec.depthCells} tiles
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setBuildingOrientation(
                              (prev: BuildingOrientation) => {
                                const next = ((prev + 90) %
                                  360) as BuildingOrientation;
                                buildingOrientationRef.current = next;
                                if (hoveredCoord)
                                  updatePreviewForHover(hoveredCoord);
                                return next;
                              }
                            )
                          }
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-sky-300 cursor-pointer"
                        >
                          ↻ Rotate ({buildingOrientation}°)
                        </button>

                        {hoveredCoord && hoverPlacementStatus.valid && (
                          <button
                            type="button"
                            onClick={() =>
                              commitWorldActionAtCoord(hoveredCoord)
                            }
                            className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold cursor-pointer"
                          >
                            ✓ Place Here
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setShowPlacementInfo((prev) => !prev)
                          }
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                        >
                          ⓘ Info
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            cancelActiveConstruction();
                            setActivePanel('BUILD');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-rose-300 cursor-pointer"
                        >
                          ✕ Cancel
                        </button>
                      </div>
                    </>
                  )}

                {/* ROAD & BRIDGE PLACEMENT CONTROLS */}
                {(activeTool === 'ROAD_STRAIGHT' ||
                  activeTool === 'ROAD_CURVED' ||
                  activeTool === 'ROAD_BRIDGE' ||
                  activeTool === 'RAIL_BRIDGE') && (
                  <>
                    <div className="flex flex-col">
                      <div className="text-sm font-bold text-white">
                        {activeTool === 'RAIL_BRIDGE'
                          ? 'Building Railway Bridge'
                          : activeTool === 'ROAD_BRIDGE'
                            ? `Building ${ROAD_SPECS[selectedRoadWidth].totalLanes}-Lane Road Bridge`
                            : `Drawing ${ROAD_SPECS[selectedRoadWidth].totalLanes}-Lane ${activeTool === 'ROAD_CURVED' ? 'Curved' : 'Standard'} Road`}{' '}
                        {hoverPlacementStatus.cost > 0 && (
                          <span className="text-amber-400 font-mono-tabular">
                            ({formatMoney(hoverPlacementStatus.cost)})
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-xs font-medium ${
                          hoverPlacementStatus.valid
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {hoverPlacementStatus.message}
                      </div>
                    </div>

                    {/* Visual Road Width Selector */}
                    {activeTool !== 'RAIL_BRIDGE' && (
                      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        {(
                          [
                            ['1x1', '2-Lane'],
                            ['2x2', '4-Lane'],
                            ['3x3', '6-Lane'],
                          ] as const
                        ).map(([cfg, label]) => (
                          <button
                            key={cfg}
                            type="button"
                            onClick={() => {
                              setSelectedRoadWidth(cfg);
                              roadWidthRef.current = cfg;
                              if (hoveredCoord)
                                updatePreviewForHover(hoveredCoord);
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                              selectedRoadWidth === cfg
                                ? 'bg-amber-400 text-slate-950'
                                : 'text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Shape Switcher (Straight / Curved / Bridge) */}
                    {activeTool !== 'RAIL_BRIDGE' && (
                      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        {(
                          [
                            ['ROAD_STRAIGHT', 'Straight'],
                            ['ROAD_CURVED', 'Curved'],
                            ['ROAD_BRIDGE', 'Bridge'],
                          ] as const
                        ).map(([m, label]) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setActiveTool(m);
                              toolRef.current = m;
                              if (hoveredCoord)
                                updatePreviewForHover(hoveredCoord);
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                              activeTool === m
                                ? 'bg-sky-400 text-slate-950'
                                : 'text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {startAnchor && (
                        <button
                          type="button"
                          onClick={() => {
                            setStartAnchor(null);
                            startAnchorRef.current = null;
                            setStatusMessage('Reset starting point.');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                        >
                          Reset Start
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={cancelActiveConstruction}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-rose-300 cursor-pointer"
                      >
                        ✕ Done / Cancel
                      </button>
                    </div>
                  </>
                )}

                {/* DEMOLISH MODE BAR */}
                {activeTool === 'DEMOLISH' && (
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-sm font-bold text-rose-400">
                        Demolition Mode Active
                      </div>
                      <div className="text-xs text-slate-300">
                        Click any player road, bridge, or building to preview
                        its 60% refund and confirm removal.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={cancelActiveConstruction}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer"
                    >
                      ✕ Exit Demolish
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ===============================================================
                2. TWO-LEVEL VISUAL CONSTRUCTION MENU ('BUILD')
                =============================================================== */}
            {!isPlacingOrDemolishing && activePanel === 'BUILD' && (
              <div
                className="mb-2.5 rounded-2xl border border-slate-700/95 p-4 shadow-2xl w-[92vw] max-w-4xl"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.96)' }}
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    {buildCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          setBuildCategory(null);
                          setBuildSearchQuery('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-300 cursor-pointer"
                      >
                        ← Categories
                      </button>
                    )}
                    <h2 className="text-base font-bold text-white">
                      {buildCategory
                        ? MAIN_BUILD_CATEGORIES.find(
                            (c) => c.id === buildCategory
                          )?.title
                        : 'Construction & Infrastructure Catalogue'}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    {(buildCategory === 'BUILDINGS' ||
                      buildCategory === 'LOGISTICS') && (
                      <input
                        type="search"
                        value={buildSearchQuery}
                        onChange={(e) => setBuildSearchQuery(e.target.value)}
                        placeholder="Search buildings..."
                        aria-label="Search buildings"
                        className="px-3 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setActivePanel('NONE')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                    >
                      ✕ Close
                    </button>
                  </div>
                </div>

                {/* LEVEL 1: 7 MAIN VISUAL CATEGORIES */}
                {!buildCategory && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {MAIN_BUILD_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          if (cat.id === 'LAND') {
                            setActivePanel('LAND');
                            setActiveTool('LAND_SELECT');
                            toolRef.current = 'LAND_SELECT';
                          } else {
                            setBuildCategory(cat.id);
                          }
                        }}
                        className="flex flex-col justify-between p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-400/70 text-left transition-all cursor-pointer group"
                      >
                        <CategoryPreviewIllustration categoryId={cat.id} />
                        <div className="mt-2.5">
                          <div className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                            {cat.title}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">
                            {cat.subtitle}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* LEVEL 2 (ROADS): SIMPLE VISUAL ROAD CARDS */}
                {buildCategory === 'ROADS' && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[52vh] overflow-y-auto pr-1">
                    {(
                      [
                        {
                          title: 'Two-Lane Local Road',
                          cfg: '1x1' as RoadWidthConfig,
                          kind: 'STRAIGHT' as const,
                          priceLabel: '$120 / segment',
                          desc: 'Standard two-way town street for local deliveries.',
                        },
                        {
                          title: 'Four-Lane Avenue',
                          cfg: '2x2' as RoadWidthConfig,
                          kind: 'STRAIGHT' as const,
                          priceLabel: '$240 / segment',
                          desc: 'Divided four-lane urban avenue for steady freight traffic.',
                        },
                        {
                          title: 'Six-Lane Boulevard',
                          cfg: '3x3' as RoadWidthConfig,
                          kind: 'STRAIGHT' as const,
                          priceLabel: '$380 / segment',
                          desc: 'High-capacity six-lane arterial highway connector.',
                        },
                        {
                          title: 'Curved Road',
                          cfg: selectedRoadWidth,
                          kind: 'CURVED' as const,
                          priceLabel: 'Auto-curve',
                          desc: 'Smooth sweeping curve connecting two directions.',
                        },
                        {
                          title: 'Road Bridge',
                          cfg: selectedRoadWidth,
                          kind: 'ROAD_BRIDGE' as const,
                          priceLabel: 'From $1,800',
                          desc: 'Elevated road bridge spanning across rivers or sea water.',
                        },
                      ] as const
                    ).map((rCard) => (
                      <div
                        key={rCard.title}
                        className="flex flex-col justify-between p-3 rounded-xl bg-slate-900 border border-slate-800"
                      >
                        <div>
                          <RoadVisualPreview
                            widthConfig={rCard.cfg}
                            kind={rCard.kind}
                          />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-white">
                              {rCard.title}
                            </span>
                            <span className="text-xs font-semibold text-emerald-400 font-mono-tabular">
                              {rCard.priceLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {rCard.desc}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            startRoadConstructionTool(
                              rCard.kind === 'ROAD_BRIDGE'
                                ? 'ROAD_BRIDGE'
                                : rCard.kind === 'CURVED'
                                  ? 'ROAD_CURVED'
                                  : 'ROAD_STRAIGHT',
                              rCard.cfg
                            )
                          }
                          className="mt-3 w-full py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
                        >
                          Build {rCard.title}
                        </button>
                      </div>
                    ))}

                    {/* Quick 1-Click Serpentine River Bridge Card */}
                    <div className="flex flex-col justify-between p-3 rounded-xl bg-slate-900 border border-sky-500/40">
                      <div>
                        <RoadVisualPreview
                          widthConfig={selectedRoadWidth}
                          kind="ROAD_BRIDGE"
                        />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-sky-300">
                            West-to-City River Bridge
                          </span>
                          <span className="text-xs font-semibold text-emerald-400 font-mono-tabular">
                            $4,200
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          Instant bridge connecting the Western Logistics &amp;
                          Rail Hub directly across the Serpentine River to the
                          City Center.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleBuildRiverCrossingBridge}
                        className="mt-3 w-full py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold cursor-pointer"
                      >
                        Build River Crossing ($4,200)
                      </button>
                    </div>
                  </div>
                )}

                {/* LEVEL 2 (BUILDINGS, LOGISTICS, RAILWAY, AIRPORT, HARBOUR): VISUAL CARDS */}
                {buildCategory && buildCategory !== 'ROADS' && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[52vh] overflow-y-auto pr-1">
                    {/* Extra Railway Infrastructure Cards when in RAILWAY category */}
                    {buildCategory === 'RAILWAY' && (
                      <>
                        <div className="flex flex-col justify-between p-3 rounded-xl bg-slate-900 border border-amber-500/40">
                          <div>
                            <CategoryPreviewIllustration categoryId="RAILWAY" />
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-sm font-bold text-white">
                                Parallel Railway Line
                              </span>
                              <span className="text-xs font-semibold text-emerald-400 font-mono-tabular">
                                $6,500
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">
                              Add track line {hudStats.trackLinesCount + 1} of{' '}
                              {hudStats.maxTrackLines} inside the dedicated
                              railway corridor.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleExpandRailLine}
                            className="mt-3 w-full py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
                          >
                            Build Track Line ({hudStats.trackLinesCount}/
                            {hudStats.maxTrackLines})
                          </button>
                        </div>

                        <div className="flex flex-col justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                          <div>
                            <RoadVisualPreview
                              widthConfig="1x1"
                              kind="RAIL_BRIDGE"
                            />
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-sm font-bold text-white">
                                Railway Truss Bridge
                              </span>
                              <span className="text-xs font-semibold text-emerald-400 font-mono-tabular">
                                From $2,400
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">
                              Heavy steel railway bridge for crossing rivers and
                              water channels.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              startRoadConstructionTool('RAIL_BRIDGE', '1x1')
                            }
                            className="mt-3 w-full py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
                          >
                            Build Rail Bridge
                          </button>
                        </div>
                      </>
                    )}

                    {/* Master Regional Air Cargo Hub Card when in AIRPORT category */}
                    {buildCategory === 'AIRPORT' && hudStats.airport && (
                      <div className="flex flex-col justify-between p-3 rounded-xl bg-slate-900 border border-sky-500/50">
                        <div>
                          <CategoryPreviewIllustration categoryId="AIRPORT" />
                          <div className="mt-2 flex items-start justify-between gap-2">
                            <span className="text-sm font-bold text-white leading-snug">
                              {hudStats.airport.owned
                                ? `Regional Air Cargo Hub (Lv.${hudStats.airport.level}/20)`
                                : AIRPORT_LOCKED_UI_TITLE}
                            </span>
                            <span className="text-xs font-bold text-emerald-400 font-mono-tabular shrink-0">
                              {hudStats.airport.owned
                                ? hudStats.airport.level < 20
                                  ? formatMoney(hudStats.airport.upgradeCost)
                                  : 'MAX'
                                : formatMoney(AIRPORT_PURCHASE_PRICE)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-300">
                            {hudStats.airport.owned
                              ? `Operational 30×40 cargo airfield with Runway 09/27, parallel taxiway, ATC Tower, 10×15 CARGO Terminal, and ${hudStats.airport.activeStandCount}/5 aircraft stands.`
                              : '30×40 reserved cargo airfield (48 blocks from Core City) with 10×15 Cargo Terminal, 10×10 Warehouse & 10×10 Transfer Yard reserves.'}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-sky-300">
                            <span>
                              {hudStats.airport.owned
                                ? `${hudStats.airport.activeStandCount}/5 Stands Active`
                                : '1–5 Aircraft Stands'}
                            </span>
                            <span>
                              {hudStats.airport.owned
                                ? `Level ${hudStats.airport.level}/20`
                                : `Requires XP Level ${AIRPORT_UNLOCK_LEVEL}`}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          {!hudStats.airport.owned ? (
                            <button
                              type="button"
                              disabled={hudStats.level < AIRPORT_UNLOCK_LEVEL}
                              onClick={handlePurchaseAirport}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                                hudStats.level < AIRPORT_UNLOCK_LEVEL
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                              }`}
                            >
                              {hudStats.level < AIRPORT_UNLOCK_LEVEL
                                ? `Locked (XP Level ${AIRPORT_UNLOCK_LEVEL})`
                                : `Purchase (${formatMoney(AIRPORT_PURCHASE_PRICE)})`}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={hudStats.airport.level >= 20}
                              onClick={handleUpgradeAirport}
                              className="flex-1 py-2 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer"
                            >
                              {hudStats.airport.level >= 20
                                ? 'Max Level (20/20)'
                                : `Upgrade Lv.${hudStats.airport.level + 1} (${formatMoney(hudStats.airport.upgradeCost)})`}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setActivePanel('NONE');
                              rendererRef.current?.focusOnRegion('AIRPORT');
                              if (worldRef.current) {
                                setSelectedCellReport(
                                  worldRef.current.inspectCell(170, 35)
                                );
                              }
                            }}
                            className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Building Cards */}
                    {categoryBuildings.map((b) => {
                      const locked = hudStats.level < b.unlockLevel;
                      const cantAfford = hudStats.money < b.price;
                      const isExpanded = expandedCardInfoId === b.id;

                      return (
                        <div
                          key={b.id}
                          className={`flex flex-col justify-between p-3 rounded-xl border transition-colors ${
                            locked
                              ? 'bg-slate-900/50 border-slate-800/80 opacity-75'
                              : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          <div>
                            <BuildingVisualPreview item={b} />
                            <div className="mt-2 flex items-start justify-between gap-2">
                              <span className="text-sm font-bold text-white leading-snug">
                                {b.name}
                              </span>
                              <span className="text-xs font-bold text-emerald-400 font-mono-tabular shrink-0">
                                {formatMoney(b.price)}
                              </span>
                            </div>

                            <p className="mt-1 text-xs text-slate-300 line-clamp-2">
                              {b.description}
                            </p>

                            {/* Key Benefit Line (Unboxed clean text) */}
                            <div className="mt-1.5 flex items-center justify-between text-[11px] text-sky-300">
                              <span>
                                {b.vehicleSlotCapacity > 0
                                  ? `${b.vehicleSlotCapacity} Vehicle Slots`
                                  : b.storageCapacityTons > 0
                                    ? `${b.storageCapacityTons}t Cargo Storage`
                                    : 'Urban Development'}
                              </span>
                              <span>
                                {locked
                                  ? `Unlocks at Level ${b.unlockLevel}`
                                  : 'Available'}
                              </span>
                            </div>

                            {/* Optional Expanded Statistics */}
                            {isExpanded && (
                              <div className="mt-2 p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-0.5">
                                <div>
                                  Plot Footprint: {b.widthCells}×{b.depthCells}{' '}
                                  tiles
                                </div>
                                <div>
                                  Operating Cost: $
                                  {b.operatingCostPerMin}/min
                                </div>
                                {b.producesCargo && (
                                  <div>Produces: {b.producesCargo}</div>
                                )}
                                {b.demandsCargo && (
                                  <div>Demands: {b.demandsCargo}</div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => startBuildingPlacement(b)}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                locked
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  : cantAfford
                                    ? 'bg-amber-400/80 text-slate-950'
                                    : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                              }`}
                            >
                              {locked
                                ? `Locked (Level ${b.unlockLevel})`
                                : 'Build'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCardInfoId(
                                  isExpanded ? null : b.id
                                )
                              }
                              className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
                              title="Show Building Details"
                            >
                              ⓘ
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ===============================================================
                3. CONTRACTS & STREAMLINED VEHICLE DISPATCH PANEL ('CONTRACTS')
                =============================================================== */}
            {!isPlacingOrDemolishing && activePanel === 'CONTRACTS' && (
              <div
                className="mb-2.5 rounded-2xl border border-slate-700/95 p-4 shadow-2xl w-[92vw] max-w-4xl"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.96)' }}
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-white">
                      Active Contracts &amp; Cargo Dispatch
                    </h2>
                    <p className="text-xs text-slate-400">
                      Select a contract, pick an available vehicle, and press
                      DISPATCH.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActivePanel('NONE')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                  >
                    ✕ Close
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[52vh] overflow-y-auto pr-1">
                  {hudStats.contracts.map((c) => {
                    const locked = hudStats.level < c.requiredLevel;
                    const isSelectingVehicle = dispatchingContractId === c.id;
                    const compatibleIdleVehicles = hudStats.ownedVehicles.filter(
                      (v) =>
                        v.modal === c.modal &&
                        v.state === 'IDLE_AT_DEPOT' &&
                        !v.maintenanceOverdue &&
                        v.capacityTons >= c.cargoTons
                    );

                    return (
                      <div
                        key={c.id}
                        className="flex flex-col justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-bold text-white">
                              {c.title}
                            </span>
                            <span className="text-xs font-semibold text-sky-300 shrink-0">
                              {ModalTabLabel(c.modal)}
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-slate-300">
                            {c.originName} → {c.destinationName}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            Cargo: {c.cargoType} ({c.cargoTons} tons)
                          </div>

                          <div className="mt-2 flex items-center justify-between text-xs font-mono-tabular">
                            <span className="text-emerald-400 font-bold text-sm">
                              +{formatMoney(c.cashReward)}
                            </span>
                            <span className="text-amber-300 font-semibold">
                              +{c.xpReward} XP
                            </span>
                          </div>
                        </div>

                        {c.status === 'ACTIVE' ? (
                          <div className="mt-3">
                            <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-sky-400 transition-all duration-300"
                                style={{
                                  width: `${Math.round(c.progressRatio * 100)}%`,
                                }}
                              />
                            </div>
                            <div className="mt-1 text-xs text-sky-300 font-medium text-right">
                              Delivering ({Math.round(c.progressRatio * 100)}%)
                            </div>
                          </div>
                        ) : locked ? (
                          <div className="mt-3 py-2 text-center rounded-lg bg-slate-800 text-xs font-semibold text-slate-500">
                            Requires Level {c.requiredLevel}
                          </div>
                        ) : isSelectingVehicle ? (
                          <div className="mt-3 pt-2 border-t border-slate-800 space-y-2">
                            <div className="text-[11px] font-semibold text-slate-300">
                              Select available {ModalTabLabel(c.modal).toLowerCase()}:
                            </div>
                            {compatibleIdleVehicles.length === 0 ? (
                              <div className="text-xs text-amber-300">
                                No parked {ModalTabLabel(c.modal).toLowerCase()}{' '}
                                with {c.cargoTons}t capacity.
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVehicleTabModal(c.modal);
                                    setVehicleSubView('SHOP');
                                    setActivePanel('VEHICLES');
                                  }}
                                  className="ml-1 underline text-sky-300 cursor-pointer"
                                >
                                  Buy one in Vehicles
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {compatibleIdleVehicles.map((v) => (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() =>
                                      setSelectedContractVehicleId(v.id)
                                    }
                                    className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center justify-between cursor-pointer ${
                                      (selectedContractVehicleId ||
                                        compatibleIdleVehicles[0].id) === v.id
                                        ? 'bg-sky-500/25 border border-sky-400 text-white'
                                        : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
                                    }`}
                                  >
                                    <span className="truncate">{v.name}</span>
                                    <span className="text-[11px] text-emerald-300 shrink-0">
                                      {v.capacityTons}t · Ready
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-1.5">
                              {compatibleIdleVehicles.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDispatchSelectedVehicleOnContract(
                                      c,
                                      selectedContractVehicleId ||
                                        compatibleIdleVehicles[0].id
                                    )
                                  }
                                  className="flex-1 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold cursor-pointer"
                                >
                                  DISPATCH
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setDispatchingContractId(null)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (compatibleIdleVehicles.length === 1) {
                                  handleDispatchSelectedVehicleOnContract(
                                    c,
                                    compatibleIdleVehicles[0].id
                                  );
                                } else {
                                  setDispatchingContractId(c.id);
                                  setSelectedContractVehicleId(
                                    compatibleIdleVehicles[0]?.id || null
                                  );
                                }
                              }}
                              className="w-full py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
                            >
                              {compatibleIdleVehicles.length > 0
                                ? 'DISPATCH VEHICLE'
                                : 'Select Vehicle'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ===============================================================
                4. VEHICLES & FLEET PANEL ('VEHICLES' — Trucks, Trains, Aircraft, Ships)
                =============================================================== */}
            {!isPlacingOrDemolishing && activePanel === 'VEHICLES' && (
              <div
                className="mb-2.5 rounded-2xl border border-slate-700/95 p-4 shadow-2xl w-[92vw] max-w-4xl"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.96)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white mr-2">
                      Vehicles &amp; Fleet
                    </h2>
                    {/* Category Tabs: Trucks, Trains, Aircraft, Ships */}
                    {(['ROAD', 'RAIL', 'AIR', 'WATER'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setVehicleTabModal(m)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          vehicleTabModal === m
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {ModalTabLabel(m)}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setVehicleSubView('FLEET')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                          vehicleSubView === 'FLEET'
                            ? 'bg-sky-400 text-slate-950'
                            : 'text-slate-300'
                        }`}
                      >
                        My Fleet ({hudStats.ownedVehicles.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setVehicleSubView('SHOP')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                          vehicleSubView === 'SHOP'
                            ? 'bg-emerald-400 text-slate-950'
                            : 'text-slate-300'
                        }`}
                      >
                        Buy Vehicles
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActivePanel('NONE')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                    >
                      ✕ Close
                    </button>
                  </div>
                </div>

                {/* MY FLEET VIEW */}
                {vehicleSubView === 'FLEET' && (
                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                      <span>
                        Truck Depot Capacity: {hudStats.roadSlotsUsed} /{' '}
                        {hudStats.roadSlotsMax} Slots Occupied
                      </span>
                      <button
                        type="button"
                        onClick={() => setVehicleSubView('SHOP')}
                        className="text-emerald-400 font-semibold hover:underline cursor-pointer"
                      >
                        + Purchase New {ModalTabLabel(vehicleTabModal)}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[46vh] overflow-y-auto pr-1">
                      {hudStats.ownedVehicles
                        .filter((v) => v.modal === vehicleTabModal)
                        .map((ov) => {
                          const catItem = getVehicleSpecById(ov.catalogueId);
                          const friendly = formatFriendlyVehicleState(
                            ov.state,
                            ov.routeProgressRatio
                          );
                          return (
                            <div
                              key={ov.id}
                              className="flex flex-col justify-between p-3 rounded-xl bg-slate-900 border border-slate-800"
                            >
                              <div>
                                {catItem && (
                                  <VehicleVisualPreview
                                    item={catItem}
                                    liveryId={ov.liveryId}
                                  />
                                )}
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-white truncate">
                                    {ov.name}
                                  </span>
                                  <span
                                    className={`text-xs font-semibold ${friendly.colorClass}`}
                                  >
                                    {friendly.label}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-slate-400">
                                  Capacity: {ov.capacityTons} tons · Condition:{' '}
                                  {ov.conditionPercent}%
                                </div>
                              </div>

                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVehicleId(ov.id);
                                    setActivePanel('NONE');
                                    rendererRef.current?.focusOnWorldPosition(
                                      ov.worldX,
                                      ov.worldZ,
                                      38
                                    );
                                  }}
                                  className="flex-1 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/60 text-sky-200 hover:bg-sky-500/30 text-xs font-semibold cursor-pointer"
                                >
                                  Focus in World
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMaintainVehicle(ov.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
                                >
                                  Service ({formatMoney(ov.maintenanceCost)})
                                </button>
                              </div>
                            </div>
                          );
                        })}

                      {hudStats.ownedVehicles.filter(
                        (v) => v.modal === vehicleTabModal
                      ).length === 0 && (
                        <div className="col-span-full py-6 text-center text-sm text-slate-400">
                          You do not own any {ModalTabLabel(vehicleTabModal).toLowerCase()} yet.{' '}
                          <button
                            type="button"
                            onClick={() => setVehicleSubView('SHOP')}
                            className="text-amber-400 font-semibold underline cursor-pointer"
                          >
                            Browse the {ModalTabLabel(vehicleTabModal)} Shop
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* VEHICLE SHOP VIEW */}
                {vehicleSubView === 'SHOP' && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                    {VEHICLE_CATALOGUE.filter(
                      (v) => v.modal === vehicleTabModal
                    ).map((v: VehicleCatalogueItem) => {
                      const locked = hudStats.level < v.unlockLevel;
                      return (
                        <div
                          key={v.id}
                          className="flex flex-col justify-between p-3 rounded-xl bg-slate-900 border border-slate-800"
                        >
                          <div>
                            <VehicleVisualPreview item={v} />
                            <div className="mt-2 flex items-start justify-between gap-2">
                              <span className="text-sm font-bold text-white leading-snug">
                                {v.name}
                              </span>
                              <span className="text-xs font-bold text-emerald-400 font-mono-tabular shrink-0">
                                {formatMoney(v.price)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                              {v.description}
                            </p>
                            <div className="mt-1.5 text-[11px] text-sky-300">
                              Capacity: {v.capacityTons} tons · Speed:{' '}
                              {v.cruisingSpeedKmh} km/h
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => handlePurchaseVehicle(v.id)}
                            className={`mt-3 w-full py-2 rounded-lg text-xs font-bold cursor-pointer ${
                              locked
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                            }`}
                          >
                            {locked
                              ? `Unlocks at Level ${v.unlockLevel}`
                              : `Purchase (${formatMoney(v.price)})`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ===============================================================
                5. LAND PURCHASE & EMPIRE EXPANSION PANEL ('LAND')
                =============================================================== */}
            {!isPlacingOrDemolishing && activePanel === 'LAND' && (
              <div
                className="mb-2.5 rounded-2xl border border-slate-700/95 p-4 shadow-2xl w-[92vw] max-w-4xl"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.96)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-white">
                      Land Purchase &amp; Territory Expansion
                    </h2>
                    <p className="text-xs text-slate-400">
                      Green plots in the world are owned; amber plots are
                      available to purchase.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExpandWorldDimensions}
                      className="px-3 py-1.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold cursor-pointer"
                    >
                      + Expand World Horizon
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActivePanel('NONE');
                        setActiveTool('INSPECT');
                        toolRef.current = 'INSPECT';
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                    >
                      ✕ Close
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[48vh] overflow-y-auto pr-1">
                  {hudStats.parcels
                    .filter(
                      (p) => !p.owned && !p.id.startsWith('parcel-sector-')
                    )
                    .map((p) => {
                      const locked = hudStats.level < p.unlockLevel;
                      const areaSqMeters = p.widthCells * p.depthCells * 4;
                      return (
                        <div
                          key={p.id}
                          className="flex flex-col justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-bold text-white">
                                {p.name}
                              </span>
                              <span className="text-xs font-bold text-emerald-400 font-mono-tabular shrink-0">
                                {formatMoney(p.price)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-sky-300">
                              {formatFriendlyZoneName(p.zoneCategory)}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              Approx. Area: {areaSqMeters.toLocaleString()} m² ·
                              Suitability: High
                            </div>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => handlePurchaseParcel(p.id)}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                                locked
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                              }`}
                            >
                              {locked
                                ? `Requires Level ${p.unlockLevel}`
                                : `PURCHASE (${formatMoney(p.price)})`}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const wp = worldRef.current?.grid.gridToWorld(
                                  Math.round((p.minGx + p.maxGx) * 0.5),
                                  Math.round((p.minGz + p.maxGz) * 0.5)
                                );
                                if (wp) {
                                  rendererRef.current?.focusOnWorldPosition(
                                    wp.x,
                                    wp.z,
                                    70
                                  );
                                }
                              }}
                              className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
                              title="View Plot on Map"
                            >
                              View
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ===============================================================
                MAIN BOTTOM TRANSPORT CONTROL DOCK — HD Tycoon Game Interface
                Covers Roads, Trucks, Railway, Airport, Port, Construction, Land & Management
                =============================================================== */}
            <nav
              aria-label="Main Game Controls"
              data-testid="hd-bottom-transport-dock"
              className="rounded-2xl border border-cyan-500/35 px-4 py-2.5 shadow-2xl flex flex-wrap items-center justify-center gap-2 origin-bottom transition-transform duration-200"
              style={{
                backgroundColor: 'rgba(9, 15, 28, 0.96)',
                boxShadow:
                  '0 18px 42px -8px rgba(2, 6, 23, 0.9), inset 0 1px 0 0 rgba(56, 189, 248, 0.24)',
                transform:
                  hudScale === 'compact'
                    ? 'scale(0.92)'
                    : hudScale === 'large'
                      ? 'scale(1.06)'
                      : 'scale(1)',
              }}
            >
              {/* Primary Action: Prominent BUILD / Construction Button */}
              <button
                type="button"
                onClick={() => {
                  cancelActiveConstruction();
                  setBuildCategory(null);
                  setActivePanel((prev) =>
                    prev === 'BUILD' ? 'NONE' : 'BUILD'
                  );
                }}
                className={`px-5 py-2.5 rounded-xl text-sm font-extrabold flex items-center gap-2 shadow-md transition-all cursor-pointer ${
                  activePanel === 'BUILD'
                    ? 'bg-amber-300 text-slate-950 ring-2 ring-amber-200'
                    : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                <span>BUILD</span>
              </button>

              <div className="h-6 w-px bg-slate-800 mx-0.5" />

              {/* Modal Transport Category Quick-Controls: Roads, Trucks, Railway, Airport, Port */}
              <button
                type="button"
                data-testid="dock-roads-btn"
                onClick={() => {
                  cancelActiveConstruction();
                  setBuildCategory('ROADS');
                  setActivePanel('BUILD');
                }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                  activePanel === 'BUILD' && buildCategory === 'ROADS'
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-bold'
                    : 'bg-slate-900/95 hover:bg-slate-800 text-cyan-200 border-slate-700/80'
                }`}
              >
                <span>Roads</span>
              </button>

              <button
                type="button"
                data-testid="dock-trucks-btn"
                onClick={() => {
                  cancelActiveConstruction();
                  rendererRef.current?.focusOnWorldPosition(-8, -6, 36);
                  if (worldRef.current) {
                    setSelectedVehicleId(null);
                    setSelectedCellReport(
                      worldRef.current.inspectCell(46, 50)
                    );
                  }
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-slate-900/95 hover:bg-slate-800 text-cyan-200 border border-slate-700/80 transition-colors cursor-pointer"
              >
                <span>Trucks ({hudStats.roadSlotsUsed}/{hudStats.roadSlotsMax})</span>
              </button>

              <button
                type="button"
                data-testid="dock-railway-btn"
                onClick={() => {
                  cancelActiveConstruction();
                  setBuildCategory('RAILWAY');
                  setActivePanel('BUILD');
                  rendererRef.current?.focusOnRegion('RAIL_YARD');
                }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                  activePanel === 'BUILD' && buildCategory === 'RAILWAY'
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-bold'
                    : 'bg-slate-900/95 hover:bg-slate-800 text-cyan-200 border-slate-700/80'
                }`}
              >
                <span>Railway</span>
              </button>

              <button
                type="button"
                data-testid="dock-airport-btn"
                onClick={() => {
                  cancelActiveConstruction();
                  rendererRef.current?.focusOnRegion('AIRPORT');
                  if (worldRef.current) {
                    setSelectedVehicleId(null);
                    setSelectedCellReport(
                      worldRef.current.inspectCell(170, 35)
                    );
                  }
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-slate-900/95 hover:bg-slate-800 text-cyan-200 border border-slate-700/80 transition-colors cursor-pointer"
              >
                <span>Airport</span>
              </button>

              <button
                type="button"
                data-testid="dock-port-btn"
                onClick={() => {
                  cancelActiveConstruction();
                  rendererRef.current?.focusOnRegion('PORT_HARBOUR');
                  if (worldRef.current) {
                    setSelectedVehicleId(null);
                    setSelectedCellReport(
                      worldRef.current.inspectCell(84, 90)
                    );
                  }
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-slate-900/95 hover:bg-slate-800 text-cyan-200 border border-slate-700/80 transition-colors cursor-pointer"
              >
                <span>Port</span>
              </button>

              <div className="h-6 w-px bg-slate-800 mx-0.5" />

              {/* Management & Territory Actions: Contracts, Vehicles, Land */}
              <button
                type="button"
                onClick={() => {
                  cancelActiveConstruction();
                  setActivePanel((prev) =>
                    prev === 'CONTRACTS' ? 'NONE' : 'CONTRACTS'
                  );
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activePanel === 'CONTRACTS'
                    ? 'bg-sky-400 text-slate-950 font-bold'
                    : 'bg-slate-800/95 hover:bg-slate-700 text-slate-100 border border-slate-700/80'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                </svg>
                <span>Contracts ({hudStats.contracts.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  cancelActiveConstruction();
                  setActivePanel((prev) =>
                    prev === 'VEHICLES' ? 'NONE' : 'VEHICLES'
                  );
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activePanel === 'VEHICLES'
                    ? 'bg-sky-400 text-slate-950 font-bold'
                    : 'bg-slate-800/95 hover:bg-slate-700 text-slate-100 border border-slate-700/80'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="1" y="3" width="15" height="13" rx="1" />
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
                <span>Vehicles ({hudStats.ownedVehicles.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  cancelActiveConstruction();
                  setActivePanel((prev) => {
                    const next = prev === 'LAND' ? 'NONE' : 'LAND';
                    if (next === 'LAND') {
                      setActiveTool('LAND_SELECT');
                      toolRef.current = 'LAND_SELECT';
                    }
                    return next;
                  });
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activePanel === 'LAND'
                    ? 'bg-emerald-400 text-slate-950 font-bold'
                    : 'bg-slate-800/95 hover:bg-slate-700 text-slate-100 border border-slate-700/80'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                </svg>
                <span>Land</span>
              </button>

              <div className="h-6 w-px bg-slate-800 mx-0.5" />

              {/* Destructive Action: Demolish Tool */}
              <button
                type="button"
                onClick={() => {
                  setActivePanel('NONE');
                  setPendingDemolish(null);
                  if (activeTool === 'DEMOLISH') {
                    cancelActiveConstruction();
                  } else {
                    setActiveTool('DEMOLISH');
                    toolRef.current = 'DEMOLISH';
                    setStatusMessage(
                      'Demolish Mode: Click a road, bridge, or building to preview its refund and confirm removal.'
                    );
                    setStatusTone('info');
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTool === 'DEMOLISH'
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 text-rose-300 border border-rose-900/50'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Demolish</span>
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* =====================================================================
          GAME MENU, OVERLAYS & SAVE/LOAD MODAL ('paused')
          ===================================================================== */}
      {gameState === 'paused' && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(9, 13, 22, 0.82)' }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-slate-100 font-display">
              Game Menu &amp; Empire Settings
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Save or load your transport empire, or toggle map view overlays.
            </p>

            {/* Summary Tiles */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-[11px] font-medium text-slate-400">
                  TREASURY
                </div>
                <div className="mt-1 text-lg font-bold text-emerald-400 font-mono-tabular">
                  {formatMoney(hudStats.money)}
                </div>
                <div className="text-[11px] text-amber-300">
                  Level {hudStats.level} ({hudStats.xp} XP)
                </div>
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-[11px] font-medium text-slate-400">
                  ACTIVE FLEET
                </div>
                <div className="mt-1 text-lg font-bold text-sky-400 font-mono-tabular">
                  {hudStats.ownedVehicles.length} Vehicles
                </div>
                <div className="text-[11px] text-slate-400">
                  {hudStats.roadSlotsUsed}/{hudStats.roadSlotsMax} Truck Slots
                </div>
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-[11px] font-medium text-slate-400">
                  INFRASTRUCTURE
                </div>
                <div className="mt-1 text-lg font-bold text-slate-100 font-mono-tabular">
                  {hudStats.placedBuildingsCount} Buildings
                </div>
                <div className="text-[11px] text-slate-400">
                  {hudStats.roadCount} Roads · {hudStats.bridgesCount} Bridges
                </div>
              </div>
            </div>

            {/* Graphics Quality Presets (Low / Medium / High / Ultra) */}
            <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-200">
                  Graphics Quality Preset
                </span>
                <span className="text-[11px] text-amber-300 font-mono-tabular">
                  {GRAPHICS_QUALITY_PRESETS[graphicsQuality].shadowMapSize}px
                  Shadows ·{' '}
                  {GRAPHICS_QUALITY_PRESETS[graphicsQuality].maxAnisotropy}x
                  Anisotropy
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const).map((preset) => {
                  const spec = GRAPHICS_QUALITY_PRESETS[preset];
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setGraphicsQuality(preset);
                        rendererRef.current?.setGraphicsQuality(preset);
                      }}
                      className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        graphicsQuality === preset
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {spec.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Map Overlays (Hidden during normal gameplay) */}
            <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Optional Map View Overlays
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDebugSettings((prev) => ({
                      ...prev,
                      showZones: !prev.showZones,
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    debugSettings.showZones
                      ? 'bg-amber-400 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {debugSettings.showZones ? '✓ Zoning Shown' : 'Show Zoning'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDebugSettings((prev) => ({
                      ...prev,
                      showParcels: !prev.showParcels,
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    debugSettings.showParcels
                      ? 'bg-emerald-400 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {debugSettings.showParcels
                    ? '✓ Land Plots Shown'
                    : 'Show Land Plots'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDebugSettings((prev) => ({
                      ...prev,
                      showGrid: !prev.showGrid,
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    debugSettings.showGrid
                      ? 'bg-sky-400 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {debugSettings.showGrid
                    ? '✓ Alignment Grid Shown'
                    : 'Show Alignment Grid'}
                </button>
              </div>
            </div>

            {/* Save / Load / Reset */}
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleSaveWorld}
                className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer"
              >
                Save Game
              </button>

              <button
                type="button"
                onClick={handleLoadWorld}
                className="px-4 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                Load Saved Game
              </button>

              <button
                type="button"
                onClick={handleResetWorld}
                className="px-4 py-2 text-xs font-medium text-rose-300 bg-slate-800 hover:bg-slate-700 border border-rose-800/60 rounded-lg transition-colors cursor-pointer"
              >
                Reset World
              </button>
            </div>

            {/* Footer CTAs */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setGameState('title')}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Title Screen
              </button>

              <button
                type="button"
                onClick={() => setGameState('playing')}
                className="px-6 py-2.5 text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer"
              >
                Resume Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dark Glassmorphic Modal Popup (Click-to-Inspect Facility Unlock & Aircraft/Hangar Prerequisites) */}
      {airportModal && (
        <div
          data-testid="airport-glass-modal-backdrop"
          onClick={(e) => {
            e.stopPropagation();
            setAirportModal(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 pointer-events-auto"
        >
          <div
            data-testid="airport-glass-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
            className={`w-full max-w-md rounded-2xl p-6 text-slate-100 shadow-[0_0_35px_rgba(37,99,235,0.45)] border ${
              airportModal.tone === 'warning'
                ? 'border-amber-400/70 shadow-[0_0_32px_rgba(251,191,36,0.35)]'
                : 'border-sky-400/70 shadow-[0_0_32px_rgba(56,189,248,0.4)]'
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  style={{
                    backgroundColor:
                      airportModal.tone === 'warning' ? '#d97706' : '#2563eb',
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center border border-white/80 shrink-0"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4 text-white fill-current"
                    aria-hidden="true"
                  >
                    <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V7Zm3 9.73V18h-2v-1.27a2 2 0 1 1 2 0Z" />
                  </svg>
                </div>
                <h3
                  data-testid="airport-modal-title"
                  className="text-base font-bold text-white tracking-wide"
                >
                  {airportModal.title}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setAirportModal(null)}
                className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p
              data-testid="airport-modal-message"
              className="text-sm text-slate-200 leading-relaxed bg-slate-950/60 px-4 py-3 rounded-xl border border-slate-800"
            >
              {airportModal.message}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              {airportModal.onConfirm && (
                <button
                  type="button"
                  data-testid="airport-modal-confirm-btn"
                  onClick={airportModal.onConfirm}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer shadow"
                >
                  {airportModal.confirmLabel || 'Purchase'}
                </button>
              )}
              <button
                type="button"
                data-testid="airport-modal-close-btn"
                onClick={() => setAirportModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 font-semibold text-xs cursor-pointer"
              >
                {airportModal.onConfirm ? 'Cancel' : 'OK / Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
