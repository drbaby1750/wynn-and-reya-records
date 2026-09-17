import { sqlite } from '../../db';

let queryCount = 0;
let isCounterActive = false;

// Intercept better-sqlite3 prepare & exec methods for accurate, reproducible query counting
const originalPrepare = sqlite.prepare.bind(sqlite);
const originalExec = sqlite.exec.bind(sqlite);

(sqlite as any).prepare = function (source: string) {
  if (isCounterActive && typeof source === 'string') {
    if (!source.includes('sqlite_master') && !source.toUpperCase().startsWith('PRAGMA')) {
      queryCount++;
    }
  }
  return originalPrepare(source);
};

(sqlite as any).exec = function (source: string) {
  if (isCounterActive && typeof source === 'string') {
    if (!source.includes('sqlite_master') && !source.toUpperCase().startsWith('PRAGMA')) {
      queryCount++;
    }
  }
  return originalExec(source);
};

/**
 * Start measuring database query execution count
 */
export function startQueryCounter(): void {
  queryCount = 0;
  isCounterActive = true;
}

/**
 * Stop query counter and return total query count executed during the measured window
 */
export function stopQueryCounter(): number {
  isCounterActive = false;
  return queryCount;
}

/**
 * Get current query count
 */
export function getQueryCount(): number {
  return queryCount;
}

/**
 * Reset current query counter
 */
export function resetQueryCount(): void {
  queryCount = 0;
}
