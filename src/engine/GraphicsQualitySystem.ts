/**
 * GLOBAL TRANSPORT EMPIRE — GRAPHICS DEVELOPMENT PROMPT 1
 * EXTREME GRAPHICAL QUALITY FOUNDATION
 *
 * Pure & browser-safe graphics quality configuration, PBR material standards,
 * LOD distance tier logic, and high-resolution procedural texture builders.
 */

export type GraphicsQualityPreset = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export type LodDistanceTier = 'NEAR' | 'MID' | 'FAR' | 'CULLED';

export interface GraphicsQualitySpec {
  id: GraphicsQualityPreset;
  label: string;
  description: string;
  maxPixelRatio: number;
  shadowMapEnabled: boolean;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  shadowRadius: number;
  shadowBias: number;
  shadowNormalBias: number;
  maxAnisotropy: 1 | 4 | 8 | 16;
  envMapIntensity: number;
  toneMappingExposure: number;
  enableContactShadows: boolean;
  enableRoofDetails: boolean;
  enableFineVehicleDetails: boolean;
  enableFoliageClusters: boolean;
  lodNearMaxDistance: number;
  lodMidMaxDistance: number;
  lodFarMaxDistance: number;
}

export const GRAPHICS_QUALITY_PRESETS: Record<GraphicsQualityPreset, GraphicsQualitySpec> = {
  LOW: {
    id: 'LOW',
    label: 'Low',
    description: 'Performance priority — 1.0x pixel ratio, 512px shadows, compact LOD range',
    maxPixelRatio: 1.0,
    shadowMapEnabled: true,
    shadowMapSize: 512,
    shadowRadius: 1.5,
    shadowBias: -0.0005,
    shadowNormalBias: 0.025,
    maxAnisotropy: 1,
    envMapIntensity: 0.42,
    toneMappingExposure: 0.92,
    enableContactShadows: false,
    enableRoofDetails: false,
    enableFineVehicleDetails: false,
    enableFoliageClusters: true,
    lodNearMaxDistance: 120,
    lodMidMaxDistance: 280,
    lodFarMaxDistance: 620,
  },
  MEDIUM: {
    id: 'MEDIUM',
    label: 'Medium',
    description: 'Balanced — 1.25x pixel ratio, 1024px shadows, contact shadows enabled',
    maxPixelRatio: 1.25,
    shadowMapEnabled: true,
    shadowMapSize: 1024,
    shadowRadius: 2.0,
    shadowBias: -0.0004,
    shadowNormalBias: 0.02,
    maxAnisotropy: 4,
    envMapIntensity: 0.48,
    toneMappingExposure: 0.94,
    enableContactShadows: true,
    enableRoofDetails: true,
    enableFineVehicleDetails: false,
    enableFoliageClusters: true,
    lodNearMaxDistance: 180,
    lodMidMaxDistance: 420,
    lodFarMaxDistance: 850,
  },
  HIGH: {
    id: 'HIGH',
    label: 'High',
    description: 'High visual fidelity — 1.75x pixel ratio, 2048px soft shadows, full roof & vehicle details',
    maxPixelRatio: 1.75,
    shadowMapEnabled: true,
    shadowMapSize: 2048,
    shadowRadius: 2.5,
    shadowBias: -0.00032,
    shadowNormalBias: 0.016,
    maxAnisotropy: 8,
    envMapIntensity: 0.52,
    toneMappingExposure: 0.95,
    enableContactShadows: true,
    enableRoofDetails: true,
    enableFineVehicleDetails: true,
    enableFoliageClusters: true,
    lodNearMaxDistance: 280,
    lodMidMaxDistance: 600,
    lodFarMaxDistance: 1200,
  },
  ULTRA: {
    id: 'ULTRA',
    label: 'Ultra',
    description: 'AAA isometric presentation — 2.0x Retina pixel ratio, 4096px shadows, 16x anisotropy, max LOD',
    maxPixelRatio: 2.0,
    shadowMapEnabled: true,
    shadowMapSize: 4096,
    shadowRadius: 3.0,
    shadowBias: -0.00025,
    shadowNormalBias: 0.014,
    maxAnisotropy: 16,
    envMapIntensity: 0.56,
    toneMappingExposure: 0.96,
    enableContactShadows: true,
    enableRoofDetails: true,
    enableFineVehicleDetails: true,
    enableFoliageClusters: true,
    lodNearMaxDistance: 420,
    lodMidMaxDistance: 880,
    lodFarMaxDistance: 1800,
  },
};

export interface PbrSurfaceStandard {
  id: string;
  category:
    | 'CONCRETE'
    | 'ASPHALT'
    | 'INDUSTRIAL_CLADDING'
    | 'ARCHITECTURAL_GLASS'
    | 'AIRCRAFT_COMPOSITE'
    | 'METAL_TRIM'
    | 'TYRE_RUBBER'
    | 'TERRAIN_GROUND'
    | 'WATER';
  baseColorHex: number;
  roughness: number;
  metalness: number;
  envMapIntensity: number;
  bumpScale?: number;
}

/**
 * Physically Based Material Standards calibrated to the supplied airport reference image.
 */
export const PBR_SURFACE_STANDARDS: Record<string, PbrSurfaceStandard> = {
  APRON_WARM_CONCRETE: {
    id: 'APRON_WARM_CONCRETE',
    category: 'CONCRETE',
    baseColorHex: 0xc2b9ab,
    roughness: 0.84,
    metalness: 0.03,
    envMapIntensity: 0.45,
    bumpScale: 0.04,
  },
  TAXIWAY_CONCRETE: {
    id: 'TAXIWAY_CONCRETE',
    category: 'CONCRETE',
    baseColorHex: 0xa49e93,
    roughness: 0.86,
    metalness: 0.03,
    envMapIntensity: 0.42,
    bumpScale: 0.035,
  },
  DOCK_YARD_CONCRETE: {
    id: 'DOCK_YARD_CONCRETE',
    category: 'CONCRETE',
    baseColorHex: 0xb5aba0,
    roughness: 0.82,
    metalness: 0.04,
    envMapIntensity: 0.45,
    bumpScale: 0.03,
  },
  ARCHITECTURAL_WHITE_CONCRETE: {
    id: 'ARCHITECTURAL_WHITE_CONCRETE',
    category: 'CONCRETE',
    baseColorHex: 0xe6e3dc,
    roughness: 0.72,
    metalness: 0.04,
    envMapIntensity: 0.55,
    bumpScale: 0.02,
  },
  RUNWAY_ASPHALT_DARK: {
    id: 'RUNWAY_ASPHALT_DARK',
    category: 'ASPHALT',
    baseColorHex: 0x3b4048,
    roughness: 0.87,
    metalness: 0.04,
    envMapIntensity: 0.4,
    bumpScale: 0.05,
  },
  ROAD_ASPHALT_WEATHERED: {
    id: 'ROAD_ASPHALT_WEATHERED',
    category: 'ASPHALT',
    baseColorHex: 0x454a52,
    roughness: 0.85,
    metalness: 0.04,
    envMapIntensity: 0.42,
    bumpScale: 0.04,
  },
  CARGO_YELLOW_CORRUGATED: {
    id: 'CARGO_YELLOW_CORRUGATED',
    category: 'INDUSTRIAL_CLADDING',
    baseColorHex: 0xf4b41a,
    roughness: 0.42,
    metalness: 0.24,
    envMapIntensity: 0.95,
    bumpScale: 0.045,
  },
  CARGO_GREEN_OPERATIONS: {
    id: 'CARGO_GREEN_OPERATIONS',
    category: 'INDUSTRIAL_CLADDING',
    baseColorHex: 0x2e8540,
    roughness: 0.44,
    metalness: 0.2,
    envMapIntensity: 0.88,
  },
  HANGAR_STEEL_ARCH: {
    id: 'HANGAR_STEEL_ARCH',
    category: 'INDUSTRIAL_CLADDING',
    baseColorHex: 0x7c8591,
    roughness: 0.46,
    metalness: 0.48,
    envMapIntensity: 1.05,
  },
  SKYLIGHT_BLUE_GLAZING: {
    id: 'SKYLIGHT_BLUE_GLAZING',
    category: 'ARCHITECTURAL_GLASS',
    baseColorHex: 0x4f89c6,
    roughness: 0.14,
    metalness: 0.72,
    envMapIntensity: 1.35,
  },
  TOWER_TINTED_GLASS: {
    id: 'TOWER_TINTED_GLASS',
    category: 'ARCHITECTURAL_GLASS',
    baseColorHex: 0x2d5a7b,
    roughness: 0.12,
    metalness: 0.78,
    envMapIntensity: 1.4,
  },
  AIRCRAFT_GLOSS_WHITE: {
    id: 'AIRCRAFT_GLOSS_WHITE',
    category: 'AIRCRAFT_COMPOSITE',
    baseColorHex: 0xf8fafc,
    roughness: 0.22,
    metalness: 0.16,
    envMapIntensity: 1.25,
  },
  AIRCRAFT_LIVERY_BLUE: {
    id: 'AIRCRAFT_LIVERY_BLUE',
    category: 'AIRCRAFT_COMPOSITE',
    baseColorHex: 0x1559b8,
    roughness: 0.26,
    metalness: 0.22,
    envMapIntensity: 1.2,
  },
  BRUSHED_ALUMINIUM_ULD: {
    id: 'BRUSHED_ALUMINIUM_ULD',
    category: 'METAL_TRIM',
    baseColorHex: 0xcbd5e1,
    roughness: 0.34,
    metalness: 0.68,
    envMapIntensity: 1.15,
  },
  TYRE_MATTE_RUBBER: {
    id: 'TYRE_MATTE_RUBBER',
    category: 'TYRE_RUBBER',
    baseColorHex: 0x1c1e22,
    roughness: 0.9,
    metalness: 0.04,
    envMapIntensity: 0.25,
  },
  CALM_RIVER_WATER: {
    id: 'CALM_RIVER_WATER',
    category: 'WATER',
    baseColorHex: 0x2b6cb0,
    roughness: 0.65,
    metalness: 0.06,
    envMapIntensity: 0.45,
  },
};

export function getGraphicsQualitySpec(preset: GraphicsQualityPreset): GraphicsQualitySpec {
  return GRAPHICS_QUALITY_PRESETS[preset] ?? GRAPHICS_QUALITY_PRESETS.HIGH;
}

export function parseGraphicsQualityPreset(raw: string | null | undefined): GraphicsQualityPreset {
  if (!raw) return 'HIGH';
  const upper = raw.trim().toUpperCase();
  if (upper === 'LOW' || upper === 'MEDIUM' || upper === 'HIGH' || upper === 'ULTRA') {
    return upper;
  }
  return 'HIGH';
}

export function computeLodTierForDistance(
  distanceMeters: number,
  preset: GraphicsQualityPreset
): LodDistanceTier {
  const spec = getGraphicsQualitySpec(preset);
  const d = Math.max(0, distanceMeters);
  if (d <= spec.lodNearMaxDistance) return 'NEAR';
  if (d <= spec.lodMidMaxDistance) return 'MID';
  if (d <= spec.lodFarMaxDistance) return 'FAR';
  return 'CULLED';
}

export function shouldShowDetailForTier(
  detailLevel: 'FINE_ROOF_AND_PROPS' | 'SECONDARY_TRIM' | 'PRIMARY_STRUCTURE',
  tier: LodDistanceTier,
  preset: GraphicsQualityPreset
): boolean {
  const spec = getGraphicsQualitySpec(preset);
  if (detailLevel === 'PRIMARY_STRUCTURE') {
    return true;
  }
  if (detailLevel === 'SECONDARY_TRIM') {
    return tier === 'NEAR' || tier === 'MID';
  }
  // FINE_ROOF_AND_PROPS
  if (!spec.enableRoofDetails) return false;
  return tier === 'NEAR' || (preset === 'ULTRA' && tier === 'MID');
}

export function validatePbrSurfaceStandards(): {
  valid: boolean;
  totalMaterials: number;
  errors: string[];
} {
  const errors: string[] = [];
  const entries = Object.values(PBR_SURFACE_STANDARDS);
  for (const mat of entries) {
    if (mat.roughness < 0.05 || mat.roughness > 1.0) {
      errors.push(`${mat.id}: roughness ${mat.roughness} outside realistic [0.05, 1.0] range`);
    }
    if (mat.metalness < 0 || mat.metalness > 1.0) {
      errors.push(`${mat.id}: metalness ${mat.metalness} outside [0, 1.0] range`);
    }
    if (mat.category === 'WATER' && mat.roughness < 0.5) {
      errors.push(`${mat.id}: water roughness ${mat.roughness} too low (causes harsh specular white spots)`);
    }
    if (mat.category === 'CONCRETE' && mat.roughness < 0.65) {
      errors.push(`${mat.id}: concrete roughness ${mat.roughness} too glossy`);
    }
  }
  return {
    valid: errors.length === 0,
    totalMaterials: entries.length,
    errors,
  };
}

/**
 * Multi-tiered coastal elevation and material color palette:
 * Lush inland grass -> dry coastal grass/soil -> warm sandy beach (#e6d5ac)
 * -> shallow turquoise coastal water -> deep ocean blue (#1a3b6e).
 */
export const COASTAL_PALETTE_STANDARDS = {
  INLAND_LUSH_GRASS: 0x46753f,
  COASTAL_DRY_GRASS_SOIL: 0x7c8554,
  WARM_SANDY_BEACH: 0xe6d5ac,
  WET_TIDAL_SAND: 0xcbb688,
  SHALLOW_TURQUOISE_WATER: 0x2da6a8,
  MID_COASTAL_WATER: 0x1d6fa5,
  DEEP_OCEAN_BLUE: 0x1a3b6e,
  SHORELINE_FOAM: 0xdcf2ff,
} as const;

export interface WaterQualityConfig {
  animateWaves: boolean;
  waveSpeed: number;
  normalScale: number;
  foamIntensity: number;
}

export function getWaterQualityConfig(preset: GraphicsQualityPreset): WaterQualityConfig {
  switch (preset) {
    case 'LOW':
      return {
        animateWaves: false,
        waveSpeed: 0,
        normalScale: 0.08,
        foamIntensity: 0.25,
      };
    case 'MEDIUM':
      return {
        animateWaves: true,
        waveSpeed: 0.35,
        normalScale: 0.16,
        foamIntensity: 0.45,
      };
    case 'HIGH':
      return {
        animateWaves: true,
        waveSpeed: 0.55,
        normalScale: 0.24,
        foamIntensity: 0.65,
      };
    case 'ULTRA':
      return {
        animateWaves: true,
        waveSpeed: 0.72,
        normalScale: 0.32,
        foamIntensity: 0.8,
      };
  }
}

/**
 * Airport-City-style camera panning bounds clamping with smooth edge-dampening.
 * Clamps desiredTarget and cameraTarget within the playable mainland + beachfront/harbor envelope,
 * applies gentle spring-back dampening inside the soft border zone, and adjusts cameraPosition
 * proportionally so the camera never scrolls into empty ocean or warps its viewing angle.
 */
export function clampCameraPanningBounds(
  desiredTarget: { x: number; y: number; z: number },
  cameraTarget: { x: number; y: number; z: number },
  cameraPosition: { x: number; y: number; z: number },
  worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  sphericalRadius: number,
  dt = 0.016
): {
  hardMinX: number;
  hardMaxX: number;
  hardMinZ: number;
  hardMaxZ: number;
  wasClamped: boolean;
} {
  const clampedRadius = Math.max(16, Math.min(620, sphericalRadius));
  const zoomInset = Math.min(82, Math.max(14, clampedRadius * 0.16));

  const hardMinX = worldBounds.minX + zoomInset;
  const hardMaxX = worldBounds.maxX - zoomInset;
  const hardMinZ = worldBounds.minZ + zoomInset;
  const hardMaxZ = worldBounds.maxZ - zoomInset * 0.85;

  const softMargin = 24;
  const softMinX = hardMinX + softMargin;
  const softMaxX = hardMaxX - softMargin;
  const softMinZ = hardMinZ + softMargin;
  const softMaxZ = hardMaxZ - softMargin;

  const dampFactor = 1 - Math.exp(-6.5 * Math.max(0.001, dt));
  let wasClamped = false;

  // Gentle soft-zone edge dampening before reaching the hard scroll limit
  if (desiredTarget.x < softMinX) {
    desiredTarget.x += (softMinX - desiredTarget.x) * dampFactor * 0.35;
  } else if (desiredTarget.x > softMaxX) {
    desiredTarget.x -= (desiredTarget.x - softMaxX) * dampFactor * 0.35;
  }
  if (desiredTarget.z < softMinZ) {
    desiredTarget.z += (softMinZ - desiredTarget.z) * dampFactor * 0.35;
  } else if (desiredTarget.z > softMaxZ) {
    desiredTarget.z -= (desiredTarget.z - softMaxZ) * dampFactor * 0.35;
  }

  // Strict hard boundary clamp on desiredTarget
  if (desiredTarget.x < hardMinX) {
    desiredTarget.x = hardMinX;
    wasClamped = true;
  } else if (desiredTarget.x > hardMaxX) {
    desiredTarget.x = hardMaxX;
    wasClamped = true;
  }
  if (desiredTarget.z < hardMinZ) {
    desiredTarget.z = hardMinZ;
    wasClamped = true;
  } else if (desiredTarget.z > hardMaxZ) {
    desiredTarget.z = hardMaxZ;
    wasClamped = true;
  }

  // Clamp current cameraTarget and shift cameraPosition proportionally by the exact delta
  const prevTargetX = cameraTarget.x;
  const prevTargetZ = cameraTarget.z;
  const clampedTargetX = Math.max(hardMinX, Math.min(hardMaxX, cameraTarget.x));
  const clampedTargetZ = Math.max(hardMinZ, Math.min(hardMaxZ, cameraTarget.z));

  const dx = clampedTargetX - prevTargetX;
  const dz = clampedTargetZ - prevTargetZ;
  if (Math.abs(dx) > 1e-5 || Math.abs(dz) > 1e-5) {
    cameraTarget.x = clampedTargetX;
    cameraTarget.z = clampedTargetZ;
    cameraPosition.x += dx;
    cameraPosition.z += dz;
    wasClamped = true;
  }

  // Strict vertical Y floor so camera & target never clip beneath the ocean or terrain plane
  if (desiredTarget.y < 0.6) {
    desiredTarget.y = 0.6;
    wasClamped = true;
  }
  if (cameraTarget.y < 0.6) {
    cameraTarget.y = 0.6;
    wasClamped = true;
  }
  if (cameraPosition.y < 4.5) {
    cameraPosition.y = 4.5;
    wasClamped = true;
  }

  return {
    hardMinX,
    hardMaxX,
    hardMinZ,
    hardMaxZ,
    wasClamped,
  };
}

