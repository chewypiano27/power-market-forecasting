import { PluginStateStore } from "./plugin-state-store";
import { ResourceStore } from "./resource-store";
import { SessionStore } from "./session-store";
import { SqliteDatabase } from "./sqlite/database";

export class AppPersistence {
  readonly database: SqliteDatabase;
  readonly resources: ResourceStore;
  readonly pluginState: PluginStateStore;
  readonly sessions: SessionStore;

  constructor(dbPath: string) {
    this.database = new SqliteDatabase(dbPath);
    this.resources = new ResourceStore(this.database.connection);
    this.pluginState = new PluginStateStore(this.database.connection);
    this.sessions = new SessionStore(this.database.connection);
  }

  close(): void {
    this.database.close();
  }
}
