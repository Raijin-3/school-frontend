"use client";

import type * as duckdb from "@duckdb/duckdb-wasm";

type DuckDbModule = typeof import("@duckdb/duckdb-wasm");

type DuckDbResources = {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
};

let initPromise: Promise<DuckDbResources> | null = null;
let cachedResources: DuckDbResources | null = null;
let duckdbModulePromise: Promise<DuckDbModule> | null = null;

async function loadDuckDbModule(): Promise<DuckDbModule> {
  if (!duckdbModulePromise) {
    duckdbModulePromise = import("@duckdb/duckdb-wasm");
  }
  return duckdbModulePromise;
}

export async function initializeDuckDb(): Promise<DuckDbResources> {
  if (cachedResources) {
    return cachedResources;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const duckdb = await loadDuckDbModule();
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);

    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript",
      }),
    );

    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);

    const conn = await db.connect();

    cachedResources = { db, conn };
    return cachedResources;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

export function getCachedDuckDb(): DuckDbResources | null {
  return cachedResources;
}

export async function terminateDuckDb(): Promise<void> {
  if (!cachedResources) {
    return;
  }

  try {
    await cachedResources.conn.close();
  } catch (error) {
    console.error("[DuckDB] Failed to close connection:", error);
  }

  try {
    await cachedResources.db.terminate();
  } catch (error) {
    console.error("[DuckDB] Failed to terminate instance:", error);
  }

  cachedResources = null;
}
