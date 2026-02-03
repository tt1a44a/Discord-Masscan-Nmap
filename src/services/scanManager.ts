import type { ManagedScan, ScanKind, ScanRequest } from "./scanner.js";
import { startManagedScan } from "./scanner.js";

type RunningScan = {
  user: string;
  kind: ScanKind;
  managed: ManagedScan;
};

class ScanManager {
  private scans = new Map<string, RunningScan>();

  start(user: string, request: ScanRequest): ManagedScan {
    const managed = startManagedScan(request);
    this.scans.set(managed.id, { user, kind: request.kind, managed });
    managed.result.finally(() => this.scans.delete(managed.id));
    return managed;
  }

  cancelByUser(user: string): { cancelled: boolean; id?: string } {
    for (const [id, entry] of this.scans.entries()) {
      if (entry.user === user) {
        try {
          entry.managed.kill();
        } catch {
          /* ignore */
        }
        this.scans.delete(id);
        return { cancelled: true, id };
      }
    }
    return { cancelled: false };
  }

  listForUser(user: string): string[] {
    const ids: string[] = [];
    for (const [id, entry] of this.scans.entries()) {
      if (entry.user === user) ids.push(id);
    }
    return ids;
  }
}

export const scanManager = new ScanManager();
