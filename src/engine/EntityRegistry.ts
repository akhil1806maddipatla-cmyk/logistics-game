/**
 * Authoritative World Entity Registry.
 * Every persistent world entity is identifiable independently of its Three.js mesh.
 */

import { GridCoord } from './GridSystem';

export type EntityCategory =
  | 'ROAD'
  | 'HIGHWAY'
  | 'ROUNDABOUT'
  | 'JUNCTION'
  | 'RAIL_TRACK'
  | 'RAIL_DEPOT'
  | 'RAIL_STATION'
  | 'RAIL_CROSSING'
  | 'ROAD_BRIDGE'
  | 'RAIL_BRIDGE'
  | 'PORT_HARBOUR'
  | 'STARTER_BUILDING'
  | 'WAREHOUSE_FACILITY'
  | 'AIRPORT_FACILITY'
  | 'VEHICLE'
  | 'LANDMARK';

export interface WorldEntityRecord {
  id: string;
  category: EntityCategory;
  type: string;
  position: GridCoord;
  footprint: GridCoord[];
  orientation: 0 | 90 | 180 | 270;
  elevation: number;
  ownership: 'PLAYER' | 'WORLD' | 'RESERVED';
  active: boolean;
  visualObjectId?: string;
  metadata: Record<string, unknown>;
}

export class EntityRegistry {
  private entities: Map<string, WorldEntityRecord> = new Map();
  private cellToEntities: Map<string, Set<string>> = new Map();

  private cellKey(gx: number, gz: number): string {
    return `${gx},${gz}`;
  }

  public register(entity: WorldEntityRecord): boolean {
    if (!entity.id || this.entities.has(entity.id)) {
      return false;
    }

    const cloned: WorldEntityRecord = {
      ...entity,
      position: { ...entity.position },
      footprint: entity.footprint.map((c) => ({ ...c })),
      metadata: { ...entity.metadata },
    };

    this.entities.set(cloned.id, cloned);

    for (const cell of cloned.footprint) {
      const key = this.cellKey(cell.gx, cell.gz);
      let set = this.cellToEntities.get(key);
      if (!set) {
        set = new Set();
        this.cellToEntities.set(key, set);
      }
      set.add(cloned.id);
    }

    return true;
  }

  public update(id: string, patch: Partial<WorldEntityRecord>): boolean {
    const existing = this.entities.get(id);
    if (!existing) return false;

    if (patch.footprint) {
      // Unindex old footprint
      for (const cell of existing.footprint) {
        const key = this.cellKey(cell.gx, cell.gz);
        const set = this.cellToEntities.get(key);
        if (set) {
          set.delete(id);
          if (set.size === 0) this.cellToEntities.delete(key);
        }
      }
      // Index new footprint
      for (const cell of patch.footprint) {
        const key = this.cellKey(cell.gx, cell.gz);
        let set = this.cellToEntities.get(key);
        if (!set) {
          set = new Set();
          this.cellToEntities.set(key, set);
        }
        set.add(id);
      }
    }

    this.entities.set(id, {
      ...existing,
      ...patch,
      id: existing.id,
    });
    return true;
  }

  public unregister(id: string): boolean {
    const existing = this.entities.get(id);
    if (!existing) return false;

    for (const cell of existing.footprint) {
      const key = this.cellKey(cell.gx, cell.gz);
      const set = this.cellToEntities.get(key);
      if (set) {
        set.delete(id);
        if (set.size === 0) {
          this.cellToEntities.delete(key);
        }
      }
    }

    this.entities.delete(id);
    return true;
  }

  public get(id: string): WorldEntityRecord | undefined {
    return this.entities.get(id);
  }

  public has(id: string): boolean {
    return this.entities.has(id);
  }

  public getAll(): WorldEntityRecord[] {
    return Array.from(this.entities.values());
  }

  public getByCategory(category: EntityCategory): WorldEntityRecord[] {
    const result: WorldEntityRecord[] = [];
    for (const ent of this.entities.values()) {
      if (ent.category === category) result.push(ent);
    }
    return result;
  }

  public getEntitiesAtCell(gx: number, gz: number): WorldEntityRecord[] {
    const set = this.cellToEntities.get(this.cellKey(gx, gz));
    if (!set) return [];
    const list: WorldEntityRecord[] = [];
    for (const id of set) {
      const ent = this.entities.get(id);
      if (ent) list.push(ent);
    }
    return list;
  }

  public clearVisualReference(id: string): boolean {
    const existing = this.entities.get(id);
    if (!existing) return false;
    existing.visualObjectId = undefined;
    return true;
  }

  public clear(): void {
    this.entities.clear();
    this.cellToEntities.clear();
  }

  public serialize(): WorldEntityRecord[] {
    return this.getAll().map((e) => ({
      ...e,
      visualObjectId: undefined, // Never serialize raw Three.js object references
    }));
  }

  public deserialize(records: WorldEntityRecord[]): void {
    this.clear();
    for (const rec of records) {
      this.register(rec);
    }
  }
}
