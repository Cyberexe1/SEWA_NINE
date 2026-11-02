/**
 * NINE Protocol - SQLite Storage Engine
 *
 * Interface for the SQLite-based local persistence layer.
 * All data stays on the device. No cloud. No external servers.
 */

/**
 * SQLite storage configuration.
 */
export interface SQLiteConfig {
  /** Path to the database file */
  databasePath: string;

  /** Enable WAL mode (better concurrent reads) */
  walMode: boolean;

  /** Enable foreign keys */
  foreignKeys: boolean;
}

/**
 * Main storage engine interface.
 */
export interface ISQLiteEngine {
  /** Initialize database (create file, run migrations) */
  initialize(config: SQLiteConfig): Promise<void>;

  /** Close the database connection */
  close(): Promise<void>;

  /** Check if initialized */
  isInitialized(): boolean;

  /** Run a migration file */
  migrate(version: number, sql: string): Promise<void>;

  /** Get current schema version */
  getSchemaVersion(): number;

  /** Execute raw SQL (for migrations and advanced operations) */
  execute(sql: string, params?: unknown[]): void;

  /** Query with results */
  query<T>(sql: string, params?: unknown[]): T[];

  /** Query single row */
  queryOne<T>(sql: string, params?: unknown[]): T | undefined;
}
