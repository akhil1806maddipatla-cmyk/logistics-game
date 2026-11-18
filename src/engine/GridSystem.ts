/**
 * Authoritative Grid and Coordinate System for Global Transport Empire.
 *
 * Coordinate Convention:
 * - Logical integer grid coordinates (gx, gz) identify discrete cells in [0..gridWidth-1, 0..gridDepth-1].
 * - Logical X maps to Three.js World X; Logical Z maps to Three.js World Z; World Y is elevation.
 * - `gridToWorld(gx, gz)` returns the exact center of cell (gx, gz) in world space.
 * - `originX` and `originZ` are anchored at the minimum corner of cell (0, 0), so expanding
 *   `gridWidth` or `gridDepth` never shifts existing cell centers or invalidates saved coordinates.
 */

import { WorldConfigData } from './WorldConfig';

export interface GridCoord {
  gx: number;
  gz: number;
}

export interface WorldCoord2D {
  x: number;
  z: number;
}

export interface CellBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
}

export interface FootprintResult {
  valid: boolean;
  cells: GridCoord[];
  bounds: CellBounds;
}

export class GridSystem {
  private config: WorldConfigData;

  constructor(config: WorldConfigData) {
    this.config = config;
  }

  public getConfig(): WorldConfigData {
    return this.config;
  }

  public updateConfig(config: WorldConfigData): void {
    this.config = config;
  }

  public getGridWidth(): number {
    return this.config.gridWidth;
  }

  public getGridDepth(): number {
    return this.config.gridDepth;
  }

  public getMinGx(): number {
    return this.config.minGx ?? 0;
  }

  public getMaxGx(): number {
    return (this.config.minGx ?? 0) + this.config.gridWidth - 1;
  }

  public getMinGz(): number {
    return this.config.minGz ?? 0;
  }

  public getMaxGz(): number {
    return (this.config.minGz ?? 0) + this.config.gridDepth - 1;
  }

  public getCellSize(): number {
    return this.config.cellSize;
  }

  /**
   * Validates integer grid coordinates within current playable map bounds [minGx..maxGx, minGz..maxGz].
   */
  public isValidGridCoord(gx: number, gz: number): boolean {
    if (!Number.isFinite(gx) || !Number.isFinite(gz)) return false;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    if (ix !== gx || iz !== gz) return false;
    return (
      ix >= this.getMinGx() &&
      ix <= this.getMaxGx() &&
      iz >= this.getMinGz() &&
      iz <= this.getMaxGz()
    );
  }

  /**
   * Validates whether world coordinates lie within the playable map boundaries.
   */
  public isValidWorldCoord(wx: number, wz: number): boolean {
    if (!Number.isFinite(wx) || !Number.isFinite(wz)) return false;
    const bounds = this.getWorldBounds();
    return (
      wx >= bounds.minX &&
      wx < bounds.maxX &&
      wz >= bounds.minZ &&
      wz < bounds.maxZ
    );
  }

  /**
   * Converts logical grid cell (gx, gz) to its authoritative Three.js world center (x, z).
   */
  public gridToWorld(gx: number, gz: number): WorldCoord2D {
    return {
      x: this.config.originX + (gx + 0.5) * this.config.cellSize,
      z: this.config.originZ + (gz + 0.5) * this.config.cellSize,
    };
  }

  /**
   * Alias for gridToWorld returning cell center.
   */
  public getCellCenter(gx: number, gz: number): WorldCoord2D {
    return this.gridToWorld(gx, gz);
  }

  /**
   * Converts Three.js world coordinates (wx, wz) to logical integer grid cell (gx, gz).
   */
  public worldToGrid(wx: number, wz: number): GridCoord {
    const gx = Math.floor((wx - this.config.originX) / this.config.cellSize);
    const gz = Math.floor((wz - this.config.originZ) / this.config.cellSize);
    return { gx, gz };
  }

  /**
   * Returns exact world-space boundaries and center of a logical cell.
   */
  public getCellBounds(gx: number, gz: number): CellBounds {
    const minX = this.config.originX + gx * this.config.cellSize;
    const maxX = minX + this.config.cellSize;
    const minZ = this.config.originZ + gz * this.config.cellSize;
    const maxZ = minZ + this.config.cellSize;
    return {
      minX,
      maxX,
      minZ,
      maxZ,
      centerX: (minX + maxX) * 0.5,
      centerZ: (minZ + maxZ) * 0.5,
    };
  }

  /**
   * Snaps arbitrary world position to the center of its containing grid cell.
   */
  public snapWorldToGrid(wx: number, wz: number): {
    gx: number;
    gz: number;
    x: number;
    z: number;
    valid: boolean;
  } {
    const { gx, gz } = this.worldToGrid(wx, wz);
    const valid = this.isValidGridCoord(gx, gz);
    const center = this.gridToWorld(gx, gz);
    return {
      gx,
      gz,
      x: center.x,
      z: center.z,
      valid,
    };
  }

  /**
   * Computes 1D compact array index for (gx, gz). Returns -1 if out of bounds.
   */
  public getCellIndex(gx: number, gz: number): number {
    if (!this.isValidGridCoord(gx, gz)) return -1;
    return (
      (gz - this.getMinGz()) * this.config.gridWidth +
      (gx - this.getMinGx())
    );
  }

  /**
   * Converts 1D array index back to logical grid coordinates.
   */
  public indexToGrid(index: number): GridCoord | null {
    const total = this.config.gridWidth * this.config.gridDepth;
    if (!Number.isInteger(index) || index < 0 || index >= total) return null;
    const lz = Math.floor(index / this.config.gridWidth);
    const lx = index % this.config.gridWidth;
    return { gx: this.getMinGx() + lx, gz: this.getMinGz() + lz };
  }

  /**
   * Computes multi-cell footprint starting at anchor (gx, gz) with given dimensions and orientation.
   * Orientation 0 or 180 uses (widthCells, depthCells); 90 or 270 swaps width and depth.
   */
  public getFootprint(
    anchorGx: number,
    anchorGz: number,
    widthCells: number,
    depthCells: number,
    orientationDeg: 0 | 90 | 180 | 270 = 0
  ): FootprintResult {
    const effectiveW =
      orientationDeg === 90 || orientationDeg === 270 ? depthCells : widthCells;
    const effectiveD =
      orientationDeg === 90 || orientationDeg === 270 ? widthCells : depthCells;

    const cells: GridCoord[] = [];
    let valid = effectiveW > 0 && effectiveD > 0;

    for (let dz = 0; dz < effectiveD; dz++) {
      for (let dx = 0; dx < effectiveW; dx++) {
        const cx = anchorGx + dx;
        const cz = anchorGz + dz;
        if (!this.isValidGridCoord(cx, cz)) {
          valid = false;
        }
        cells.push({ gx: cx, gz: cz });
      }
    }

    const minX = this.config.originX + anchorGx * this.config.cellSize;
    const maxX = minX + effectiveW * this.config.cellSize;
    const minZ = this.config.originZ + anchorGz * this.config.cellSize;
    const maxZ = minZ + effectiveD * this.config.cellSize;

    return {
      valid,
      cells,
      bounds: {
        minX,
        maxX,
        minZ,
        maxZ,
        centerX: (minX + maxX) * 0.5,
        centerZ: (minZ + maxZ) * 0.5,
      },
    };
  }

  /**
   * Returns world bounding box for the entire playable map [minGx..maxGx, minGz..maxGz].
   */
  public getWorldBounds(): CellBounds {
    const minX = this.config.originX + this.getMinGx() * this.config.cellSize;
    const maxX = minX + this.config.gridWidth * this.config.cellSize;
    const minZ = this.config.originZ + this.getMinGz() * this.config.cellSize;
    const maxZ = minZ + this.config.gridDepth * this.config.cellSize;
    return {
      minX,
      maxX,
      minZ,
      maxZ,
      centerX: (minX + maxX) * 0.5,
      centerZ: (minZ + maxZ) * 0.5,
    };
  }
}
