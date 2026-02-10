import type { ManagedScan, ScanKind, ScanRequest } from "./scanner.js";
import { startManagedScan } from "./scanner.js";
import { log } from "./logging.js";
import { config } from "../config/index.js";

/** Maximum number of scans running at the same time (all users combined). */
const MAX_CONCURRENT_GLOBAL = config.maxConcurrentScans;

/** Maximum number of scans a single user can have running simultaneously. */
const MAX_CONCURRENT_PER_USER = config.maxConcurrentPerUser;

type RunningScan = {
  user: string;
  kind: ScanKind;
  managed: ManagedScan;
};

type QueuedScan = {
  user: string;
  request: ScanRequest;
  resolve: (managed: ManagedScan) => void;
  reject: (err: Error) => void;
};

export type StartResult =
  | { ok: true; managed: ManagedScan }
  | { ok: false; reason: string };

class ScanManager {
  private scans = new Map<string, RunningScan>();
  private queue: QueuedScan[] = [];

  /**
   * Start a scan immediately if concurrency limits allow, otherwise queue it.
   * Returns a `StartResult` so the caller can inform the user.
   */
  start(user: string, request: ScanRequest): StartResult {
    // Check per-user limit.
    const userCount = this.countForUser(user);
    if (userCount >= MAX_CONCURRENT_PER_USER) {
      return {
        ok: false,
        reason: `You already have ${userCount} scan(s) running (limit: ${MAX_CONCURRENT_PER_USER}). Use /cancel or wait for them to finish.`
      };
    }

    // Check global limit.
    if (this.scans.size >= MAX_CONCURRENT_GLOBAL) {
      return {
        ok: false,
        reason: `Global scan limit reached (${MAX_CONCURRENT_GLOBAL} concurrent). Please wait for a slot to free up.`
      };
    }

    return { ok: true, managed: this.launch(user, request) };
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
        this.drain();
        return { cancelled: true, id };
      }
    }

    // Also remove from queue if present.
    const idx = this.queue.findIndex((q) => q.user === user);
    if (idx !== -1) {
      const removed = this.queue.splice(idx, 1)[0];
      removed.reject(new Error("Scan cancelled while queued"));
      return { cancelled: true, id: "(queued)" };
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

  /** Number of running scans for a given user. */
  countForUser(user: string): number {
    let count = 0;
    for (const entry of this.scans.values()) {
      if (entry.user === user) count++;
    }
    return count;
  }

  /** Number of globally running scans. */
  get runningCount(): number {
    return this.scans.size;
  }

  /** Number of scans waiting in the queue. */
  get queuedCount(): number {
    return this.queue.length;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private launch(user: string, request: ScanRequest): ManagedScan {
    const managed = startManagedScan(request);
    this.scans.set(managed.id, { user, kind: request.kind, managed });

    managed.result.finally(() => {
      this.scans.delete(managed.id);
      this.drain();
    });

    log.info("scan started", {
      id: managed.id,
      user,
      kind: request.kind,
      running: this.scans.size,
      queued: this.queue.length
    });

    return managed;
  }

  /** Try to start queued scans when a slot frees up. */
  private drain() {
    while (this.queue.length > 0 && this.scans.size < MAX_CONCURRENT_GLOBAL) {
      const next = this.queue[0];
      if (this.countForUser(next.user) >= MAX_CONCURRENT_PER_USER) {
        // This user is still at their limit; skip to the next queued entry.
        // (Move them to the back so other users' scans can start.)
        this.queue.push(this.queue.shift()!);
        // Guard against infinite loop if every queued scan is for the same capped user.
        if (this.queue.every((q) => this.countForUser(q.user) >= MAX_CONCURRENT_PER_USER)) {
          break;
        }
        continue;
      }

      this.queue.shift();
      try {
        const managed = this.launch(next.user, next.request);
        next.resolve(managed);
      } catch (err) {
        next.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}

export const scanManager = new ScanManager();
