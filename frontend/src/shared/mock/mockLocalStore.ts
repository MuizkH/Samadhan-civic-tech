// TEMPORARY — backend pending (Phase 2)
// A tiny localStorage-backed "table" helper used by the mock repositories
// while the real backend is being built. Not a database — just enough
// persistence + change notification to keep the existing UI functional.

const STORAGE_PREFIX = "samadhan_mock_";

function readTable<T>(table: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + table);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeTable<T>(table: string, rows: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_PREFIX + table, JSON.stringify(rows));
}

export type MockChangeEvent<T> = {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new?: T;
  old?: T;
};

function emitChange<T>(table: string, event: MockChangeEvent<T>): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(`samadhan_mock_change_${table}`, { detail: event }));
}

export function subscribeToTable<T>(
  table: string,
  onChange: (event: MockChangeEvent<T>) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => onChange((e as CustomEvent).detail);
  window.addEventListener(`samadhan_mock_change_${table}`, handler);
  return () => window.removeEventListener(`samadhan_mock_change_${table}`, handler);
}

function genId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const mockTable = {
  genId,

  getAll<T>(table: string): T[] {
    return readTable<T>(table);
  },

  seedIfEmpty<T>(table: string, seed: T[]): void {
    const existing = readTable<T>(table);
    if (existing.length === 0 && seed.length > 0) {
      writeTable(table, seed);
    }
  },

  insert<T extends object>(table: string, row: T): T {
    const rows = readTable<T>(table);
    rows.push(row);
    writeTable(table, rows);
    emitChange(table, { table, eventType: "INSERT", new: row });
    return row;
  },

  update<T extends object>(table: string, idKey: keyof T, id: unknown, patch: Partial<T>): T | null {
    const rows = readTable<T>(table);
    const idx = rows.findIndex((r) => r[idKey] === id);
    if (idx === -1) return null;
    const updated = { ...rows[idx], ...patch };
    rows[idx] = updated;
    writeTable(table, rows);
    emitChange(table, { table, eventType: "UPDATE", new: updated });
    return updated;
  },

  remove<T extends object>(table: string, idKey: keyof T, id: unknown): T | null {
    const rows = readTable<T>(table);
    const idx = rows.findIndex((r) => r[idKey] === id);
    if (idx === -1) return null;
    const [removed] = rows.splice(idx, 1);
    writeTable(table, rows);
    emitChange(table, { table, eventType: "DELETE", old: removed });
    return removed;
  },
};
