/**
 * Global Transport Empire — Game Icons, Miniature 3D/SVG Previews & Friendly Labels
 * Implements Master Prompt 7 visual previews for categories, roads, buildings, and vehicles.
 */

import React from 'react';
import {
  BuildingCatalogueItem,
  getLiveryById,
  TransportModalCategory,
  VehicleCatalogueItem,
} from '../engine/Catalogues';
import { VehicleOperationalState } from '../engine/EconomyAndSimulationSystem';
import { RoadWidthConfig, ZoneCategory } from '../engine/WorldConfig';

export type MainBuildCategoryId =
  | 'ROADS'
  | 'BUILDINGS'
  | 'LOGISTICS'
  | 'RAILWAY'
  | 'AIRPORT'
  | 'HARBOUR'
  | 'LAND';

export interface MainBuildCategoryMeta {
  id: MainBuildCategoryId;
  title: string;
  subtitle: string;
  accentHex: string;
}

export const MAIN_BUILD_CATEGORIES: MainBuildCategoryMeta[] = [
  {
    id: 'ROADS',
    title: 'Roads & Bridges',
    subtitle: '2-lane, 4-lane & 6-lane roads, curves & river bridges',
    accentHex: '#38bdf8',
  },
  {
    id: 'BUILDINGS',
    title: 'City Buildings',
    subtitle: 'Homes, apartments, retail shops, supermarkets & office towers',
    accentHex: '#fbbf24',
  },
  {
    id: 'LOGISTICS',
    title: 'Logistics & Industry',
    subtitle: 'Truck depots, freight warehouses, factories & service stations',
    accentHex: '#34d399',
  },
  {
    id: 'RAILWAY',
    title: 'Railway Network',
    subtitle: 'Parallel rail tracks, locomotive depots & freight transfer sheds',
    accentHex: '#f59e0b',
  },
  {
    id: 'AIRPORT',
    title: 'Cargo Airport',
    subtitle: 'Aircraft maintenance hangars & air freight terminals',
    accentHex: '#60a5fa',
  },
  {
    id: 'HARBOUR',
    title: 'Seaport & Harbour',
    subtitle: 'Quayside container warehouses & deepwater bulk terminals',
    accentHex: '#2dd4bf',
  },
  {
    id: 'LAND',
    title: 'Land Expansion',
    subtitle: 'Purchase new regional territories & rail corridor plots',
    accentHex: '#a3e635',
  },
];

function numHexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/**
 * Converts technical placement rejection strings into simple, game-friendly feedback (Master Prompt 7 Part 4.1).
 */
export function simplifyPlacementReason(rawReason?: string): string {
  if (!rawReason) return 'Area unsuitable for construction';
  const r = rawReason.toLowerCase();
  if (r.includes('water')) return 'Cannot build on water';
  if (r.includes('purchased') || r.includes('unowned') || r.includes('owned'))
    return 'Land not owned — purchase this plot first';
  if (r.includes('zoning') || r.includes('permitted') || r.includes('zone'))
    return 'Wrong zone for this building';
  if (r.includes('overlaps') || r.includes('occupied') || r.includes('road'))
    return 'Not enough space — area already occupied';
  if (r.includes('outside') || r.includes('boundaries'))
    return 'Not enough space inside map boundary';
  if (r.includes('insufficient funds') || r.includes('costs'))
    return 'Not enough money for construction';
  if (r.includes('level')) return rawReason;
  return rawReason;
}

/**
 * Friendly vehicle status label (Master Prompt 7 Part 6.3).
 */
export function formatFriendlyVehicleState(
  state: VehicleOperationalState,
  progressRatio = 0
): { label: string; colorClass: string } {
  switch (state) {
    case 'IDLE_AT_DEPOT':
      return { label: 'Parked · Ready', colorClass: 'text-emerald-400' };
    case 'EN_ROUTE_TO_WAREHOUSE':
      return { label: 'To Warehouse 1', colorClass: 'text-sky-400' };
    case 'WAITING_FOR_DOOR':
      return { label: 'Waiting for Door', colorClass: 'text-amber-400' };
    case 'DOCKING_AT_DOOR':
      return { label: 'Docking at Door', colorClass: 'text-sky-300' };
    case 'LOADING_AT_DOOR':
      return { label: 'Loading Cargo', colorClass: 'text-amber-300' };
    case 'WAITING_FOR_STOCK':
      return { label: 'Waiting for Stock', colorClass: 'text-rose-400' };
    case 'EN_ROUTE_OUTBOUND':
      return {
        label: progressRatio < 0.15 ? 'Loading Cargo' : 'Travelling',
        colorClass: 'text-sky-400',
      };
    case 'OFFSCREEN_SIMULATION':
      return {
        label: 'Delivering (Interstate)',
        colorClass: 'text-amber-300',
      };
    case 'EN_ROUTE_RETURN':
      return { label: 'Returning', colorClass: 'text-sky-300' };
    case 'MAINTENANCE_DUE':
      return { label: 'Maintenance Due', colorClass: 'text-rose-400' };
  }
}

/**
 * Friendly zone name for land purchase cards (Master Prompt 7 Part 5).
 */
export function formatFriendlyZoneName(zone: ZoneCategory | string): string {
  const key = typeof zone === 'number' ? ZoneCategory[zone] : String(zone);
  switch (key) {
    case 'CITY':
      return 'Urban City District';
    case 'COMMERCIAL_SUPPORT':
      return 'Commercial & Retail District';
    case 'LOGISTICS':
      return 'Logistics & Depot Hub';
    case 'INDUSTRIAL':
      return 'Industrial & Manufacturing Zone';
    case 'RAIL_YARD':
      return 'Dedicated Railway Corridor';
    case 'AIRPORT_RESERVED':
      return 'Aviation & Air Cargo Reserve';
    case 'PORT_RESERVED':
      return 'Coastal Seaport & Harbour Zone';
    case 'FUTURE_EXPANSION':
      return 'City & Commercial Expansion Land';
    default:
      return 'Multi-Purpose Development Land';
  }
}

/**
 * Miniature Visual Preview for the 7 Main Build Categories (Master Prompt 7 Part 2.1).
 */
export function CategoryPreviewIllustration({
  categoryId,
}: {
  categoryId: MainBuildCategoryId;
}) {
  switch (categoryId) {
    case 'ROADS':
      return (
        <svg viewBox="0 0 96 56" className="w-full h-14 rounded-lg bg-slate-900/90">
          <rect width="96" height="56" rx="6" fill="#0f172a" />
          <path d="M10 48 L38 8 L58 8 L86 48 Z" fill="#334155" />
          <line x1="48" y1="10" x2="48" y2="46" stroke="#f8fafc" strokeWidth="2" strokeDasharray="5 4" />
          <line x1="34" y1="28" x2="22" y2="46" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 3" />
          <line x1="62" y1="28" x2="74" y2="46" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 3" />
          <rect x="41" y="20" width="6" height="10" rx="1.5" fill="#38bdf8" />
          <rect x="51" y="30" width="6" height="11" rx="1.5" fill="#fbbf24" />
        </svg>
      );
    case 'BUILDINGS':
      return (
        <svg viewBox="0 0 96 56" className="w-full h-14 rounded-lg bg-slate-900/90">
          <rect width="96" height="56" rx="6" fill="#0f172a" />
          <rect x="18" y="24" width="18" height="24" rx="1.5" fill="#a85542" />
          <polygon points="16,24 27,15 38,24" fill="#7c2d12" />
          <rect x="40" y="10" width="22" height="38" rx="1.5" fill="#0284c7" />
          <rect x="44" y="14" width="5" height="5" fill="#bae6fd" />
          <rect x="53" y="14" width="5" height="5" fill="#bae6fd" />
          <rect x="44" y="23" width="5" height="5" fill="#bae6fd" />
          <rect x="53" y="23" width="5" height="5" fill="#bae6fd" />
          <rect x="65" y="19" width="16" height="29" rx="1.5" fill="#cbd5e1" />
        </svg>
      );
    case 'LOGISTICS':
      return (
        <svg viewBox="0 0 96 56" className="w-full h-14 rounded-lg bg-slate-900/90">
          <rect width="96" height="56" rx="6" fill="#0f172a" />
          <rect x="16" y="20" width="44" height="26" rx="2" fill="#475569" />
          <rect x="14" y="17" width="48" height="5" rx="1" fill="#f59e0b" />
          <rect x="21" y="32" width="9" height="14" fill="#1e293b" />
          <rect x="34" y="32" width="9" height="14" fill="#1e293b" />
          <rect x="47" y="32" width="9" height="14" fill="#1e293b" />
          <rect x="64" y="33" width="18" height="10" rx="1.5" fill="#38bdf8" />
          <circle cx="68" cy="44" r="2.5" fill="#94a3b8" />
          <circle cx="78" cy="44" r="2.5" fill="#94a3b8" />
        </svg>
      );
    case 'RAILWAY':
      return (
        <svg viewBox="0 0 96 56" className="w-full h-14 rounded-lg bg-slate-900/90">
          <rect width="96" height="56" rx="6" fill="#0f172a" />
          <line x1="10" y1="44" x2="86" y2="44" stroke="#94a3b8" strokeWidth="2.5" />
          <line x1="14" y1="47" x2="82" y2="47" stroke="#64748b" strokeWidth="2" strokeDasharray="4 4" />
          <rect x="18" y="24" width="28" height="18" rx="2" fill="#d97706" />
          <rect x="38" y="27" width="6" height="6" fill="#bae6fd" />
          <rect x="49" y="26" width="28" height="16" rx="1.5" fill="#0284c7" />
          <circle cx="24" cy="43" r="3" fill="#cbd5e1" />
          <circle cx="38" cy="43" r="3" fill="#cbd5e1" />
          <circle cx="56" cy="43" r="3" fill="#cbd5e1" />
          <circle cx="70" cy="43" r="3" fill="#cbd5e1" />
        </svg>
      );
    case 'AIRPORT':
      return (
        <svg viewBox="0 0 96 56" className="w-full h-14 rounded-lg bg-slate-900/90">
          <rect width="96" height="56" rx="6" fill="#0f172a" />
          <rect x="10" y="36" width="76" height="12" rx="2" fill="#334155" />
          <line x1="16" y1="42" x2="80" y2="42" stroke="#f8fafc" strokeWidth="1.5" strokeDasharray="5 4" />
          <path d="M28 24 L62 18 L68 22 L32 28 Z" fill="#f8fafc" />
          <polygon points="44,21 36,10 42,10 50,20" fill="#38bdf8" />
          <polygon points="28,24 23,16 28,16 32,23" fill="#0284c7" />
        </svg>
      );
    case 'HARBOUR':
      return (
        <svg viewBox="0 0 96 56" className="w-full h-14 rounded-lg bg-slate-900/90">
          <rect width="96" height="56" rx="6" fill="#0f172a" />
          <rect x="0" y="36" width="96" height="20" rx="2" fill="#0369a1" />
          <polygon points="18,38 78,38 72,46 24,46" fill="#dc2626" />
          <rect x="28" y="26" width="12" height="12" fill="#fbbf24" />
          <rect x="42" y="26" width="12" height="12" fill="#38bdf8" />
          <rect x="56" y="22" width="10" height="16" fill="#f8fafc" />
        </svg>
      );
    case 'LAND':
      return (
        <svg viewBox="0 0 96 56" className="w-full h-14 rounded-lg bg-slate-900/90">
          <rect width="96" height="56" rx="6" fill="#0f172a" />
          <polygon
            points="48,10 82,26 48,44 14,26"
            fill="#10b981"
            fillOpacity="0.28"
            stroke="#34d399"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
          <circle cx="48" cy="26" r="5" fill="#fbbf24" />
        </svg>
      );
  }
}

/**
 * Visual Road Type Preview showing lane count and markings clearly (Master Prompt 7 Part 3.1 & 3.4).
 */
export function RoadVisualPreview({
  widthConfig,
  kind,
}: {
  widthConfig: RoadWidthConfig;
  kind: 'STRAIGHT' | 'CURVED' | 'ROAD_BRIDGE' | 'RAIL_BRIDGE';
}) {
  const lanes = widthConfig === '1x1' ? 2 : widthConfig === '2x2' ? 4 : 6;
  return (
    <svg viewBox="0 0 110 56" className="w-full h-14 rounded-lg bg-slate-900">
      <rect width="110" height="56" rx="6" fill="#0f172a" />
      {kind === 'ROAD_BRIDGE' || kind === 'RAIL_BRIDGE' ? (
        <>
          <rect x="0" y="14" width="110" height="28" fill="#0284c7" fillOpacity="0.45" />
          <rect x="8" y="18" width="94" height="20" rx="2" fill="#334155" stroke="#94a3b8" strokeWidth="1.5" />
          {kind === 'RAIL_BRIDGE' ? (
            <line x1="12" y1="28" x2="98" y2="28" stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="5 3" />
          ) : (
            <line x1="12" y1="28" x2="98" y2="28" stroke="#f8fafc" strokeWidth="1.5" strokeDasharray="5 4" />
          )}
        </>
      ) : kind === 'CURVED' ? (
        <>
          <path
            d="M 18 52 Q 22 18 88 18"
            fill="none"
            stroke="#334155"
            strokeWidth={lanes === 2 ? 14 : lanes === 4 ? 20 : 26}
            strokeLinecap="round"
          />
          <path
            d="M 18 52 Q 22 18 88 18"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        </>
      ) : (
        <>
          <rect
            x="10"
            y={lanes === 2 ? 18 : lanes === 4 ? 13 : 8}
            width="90"
            height={lanes === 2 ? 20 : lanes === 4 ? 30 : 40}
            rx="2"
            fill="#334155"
            stroke="#64748b"
            strokeWidth="1"
          />
          {/* Center divider */}
          <line x1="14" y1="28" x2="96" y2="28" stroke="#fbbf24" strokeWidth="1.6" />
          {/* Additional lane lines for 4-lane and 6-lane roads */}
          {lanes >= 4 && (
            <>
              <line x1="14" y1="20" x2="96" y2="20" stroke="#f8fafc" strokeWidth="1.2" strokeDasharray="4 4" />
              <line x1="14" y1="36" x2="96" y2="36" stroke="#f8fafc" strokeWidth="1.2" strokeDasharray="4 4" />
            </>
          )}
          {lanes >= 6 && (
            <>
              <line x1="14" y1="14" x2="96" y2="14" stroke="#f8fafc" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="14" y1="42" x2="96" y2="42" stroke="#f8fafc" strokeWidth="1" strokeDasharray="3 3" />
            </>
          )}
        </>
      )}
    </svg>
  );
}

/**
 * Miniature Visual Building Preview Card Illustration (Master Prompt 7 Part 2.2).
 */
export function BuildingVisualPreview({
  item,
}: {
  item: BuildingCatalogueItem;
}) {
  const primary = numHexToCss(item.primaryColorHex);
  const secondary = numHexToCss(item.secondaryColorHex);
  const accent = numHexToCss(item.accentColorHex);
  const isTall = item.heightMeters >= 9;

  return (
    <svg viewBox="0 0 110 60" className="w-full h-14 rounded-lg bg-slate-900">
      <rect width="110" height="60" rx="6" fill="#0f172a" />
      {/* Ground pad */}
      <ellipse cx="55" cy="49" rx="36" ry="7" fill="#1e293b" />
      {/* Building body */}
      <rect
        x={isTall ? 38 : 28}
        y={isTall ? 10 : 20}
        width={isTall ? 34 : 54}
        height={isTall ? 38 : 28}
        rx="2"
        fill={primary}
        stroke={secondary}
        strokeWidth="1.5"
      />
      {/* Roof silhouette */}
      {item.roofStyle === 'PITCHED_TILE' ? (
        <polygon points="24,20 55,8 86,20" fill={secondary} />
      ) : item.roofStyle === 'ARCHED_BARREL' ? (
        <path d="M 28 20 Q 55 6 82 20 Z" fill={secondary} />
      ) : (
        <rect
          x={isTall ? 36 : 26}
          y={isTall ? 7 : 16}
          width={isTall ? 38 : 58}
          height="4"
          rx="1"
          fill={secondary}
        />
      )}
      {/* Windows or Loading Bays */}
      {item.hasLoadingBays ? (
        <>
          <rect x="35" y="34" width="10" height="14" rx="1" fill="#0f172a" />
          <rect x="50" y="34" width="10" height="14" rx="1" fill="#0f172a" />
          <rect x="65" y="34" width="10" height="14" rx="1" fill="#0f172a" />
          <rect x="33" y="31" width="44" height="3" fill={accent} />
        </>
      ) : (
        <>
          <rect x="44" y={isTall ? 16 : 26} width="7" height="6" rx="1" fill={accent} />
          <rect x="59" y={isTall ? 16 : 26} width="7" height="6" rx="1" fill={accent} />
          <rect x="44" y={isTall ? 26 : 35} width="7" height="6" rx="1" fill={accent} />
          <rect x="59" y={isTall ? 26 : 35} width="7" height="6" rx="1" fill={accent} />
        </>
      )}
    </svg>
  );
}

/**
 * Miniature Visual Vehicle Preview Card Illustration (Master Prompt 7 Part 6.1).
 */
export function VehicleVisualPreview({
  item,
  liveryId,
}: {
  item: VehicleCatalogueItem;
  liveryId?: string;
}) {
  const livery = getLiveryById(liveryId || item.defaultLiveryId);
  const cab = numHexToCss(livery.cabColorHex);
  const body = numHexToCss(livery.bodyColorHex);
  const stripe = numHexToCss(livery.stripeColorHex);

  return (
    <svg viewBox="0 0 110 52" className="w-full h-12 rounded-lg bg-slate-900">
      <rect width="110" height="52" rx="6" fill="#0f172a" />
      {item.modal === 'ROAD' && (
        <>
          <line x1="8" y1="42" x2="102" y2="42" stroke="#334155" strokeWidth="2" />
          {/* Trailer / Cargo box */}
          <rect x="18" y="16" width="52" height="20" rx="2" fill={body} stroke="#475569" strokeWidth="1" />
          <rect x="18" y="25" width="52" height="3.5" fill={stripe} />
          {/* Tractor cab */}
          <rect x="72" y="21" width="18" height="15" rx="2" fill={cab} />
          <rect x="82" y="23" width="6" height="6" rx="1" fill="#bae6fd" />
          {/* Wheels */}
          <circle cx="28" cy="38" r="4" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.5" />
          <circle cx="58" cy="38" r="4" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.5" />
          <circle cx="81" cy="38" r="4" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.5" />
        </>
      )}
      {item.modal === 'RAIL' && (
        <>
          <line x1="6" y1="42" x2="104" y2="42" stroke="#94a3b8" strokeWidth="2.5" />
          <rect x="14" y="20" width="38" height="16" rx="1.5" fill={stripe} />
          <rect x="56" y="16" width="38" height="20" rx="2" fill={cab} />
          <rect x="84" y="19" width="7" height="6" fill="#bae6fd" />
          <circle cx="24" cy="39" r="3.5" fill="#cbd5e1" />
          <circle cx="42" cy="39" r="3.5" fill="#cbd5e1" />
          <circle cx="66" cy="39" r="3.5" fill="#cbd5e1" />
          <circle cx="84" cy="39" r="3.5" fill="#cbd5e1" />
        </>
      )}
      {item.modal === 'AIR' && (
        <>
          <ellipse cx="55" cy="27" rx="34" ry="7" fill={body} />
          <polygon points="48,27 36,10 44,10 58,27" fill={cab} />
          <polygon points="48,27 38,44 46,44 58,27" fill={cab} />
          <polygon points="22,25 14,14 21,14 28,24" fill={stripe} />
        </>
      )}
      {item.modal === 'WATER' && (
        <>
          <rect x="0" y="34" width="110" height="18" fill="#0369a1" fillOpacity="0.55" />
          <polygon points="16,32 94,32 86,42 24,42" fill={cab} />
          <rect x="28" y="20" width="16" height="12" fill="#fbbf24" />
          <rect x="46" y="20" width="16" height="12" fill={stripe} />
          <rect x="66" y="16" width="14" height="16" fill={body} />
        </>
      )}
    </svg>
  );
}

export function ModalTabLabel(modal: TransportModalCategory): string {
  switch (modal) {
    case 'ROAD':
      return 'Trucks';
    case 'RAIL':
      return 'Trains';
    case 'AIR':
      return 'Aircraft';
    case 'WATER':
      return 'Ships';
  }
}
