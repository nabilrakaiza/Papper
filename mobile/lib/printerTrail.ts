/**
 * A breadcrumb trail for the print path, written through to disk as it happens.
 *
 * The failure we are chasing takes the whole process down, so anything held
 * only in memory — a JS error handler, an in-memory log — is gone with it: for
 * a native crash the JS handler never runs at all. What survives is what was
 * already on disk, which is why every breadcrumb is persisted immediately
 * rather than batched.
 *
 * This records *where* a print died, not why. A native stack trace still needs
 * a real crash reporter behind it; this is what works today, on a tablet at the
 * cafe, with nobody there to run adb.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'papper_printer_trail';

/** Enough for several prints; the file stays small enough to write on every step. */
const MAX_ENTRIES = 40;

export type TrailEntry = { at: string; step: string };

let trail: TrailEntry[] = [];
let previousTrail: TrailEntry[] = [];

// Resolves once the previous session has been read back, so a screen that
// mounts early does not ask about it before there is anything to say.
let started: Promise<void> | null = null;

// Serialised so two quick breadcrumbs cannot interleave into a torn write.
let pendingWrite: Promise<void> = Promise.resolve();

/**
 * Steps that mean a print reached an orderly end. The last entry of the
 * previous session being anything else is what "the app died mid-print" looks
 * like from the next cold start.
 */
const TERMINAL_STEPS = ['print:done', 'print:failed'];

export function breadcrumb(step: string): void {
  const entry: TrailEntry = { at: new Date().toISOString(), step };
  trail = [...trail, entry].slice(-MAX_ENTRIES);

  const snapshot = trail;
  // Never allowed to throw or reject: instrumentation must not be the thing
  // that breaks printing.
  pendingWrite = pendingWrite
    .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)))
    .then(
      () => undefined,
      () => undefined
    );
}

/**
 * Reads the previous session's trail and starts a fresh one. Call once, before
 * anything can write a breadcrumb, or the first write clobbers the evidence.
 */
export function startTrail(): Promise<void> {
  if (!started) {
    started = loadAndReset();
  }
  return started;
}

export function whenTrailReady(): Promise<void> {
  return started ?? Promise.resolve();
}

async function loadAndReset(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    previousTrail = raw ? (JSON.parse(raw) as TrailEntry[]) : [];
  } catch {
    previousTrail = [];
  }

  trail = [];

  const g = (globalThis as any).ErrorUtils;
  if (g?.getGlobalHandler && g?.setGlobalHandler) {
    const previousHandler = g.getGlobalHandler();
    g.setGlobalHandler((error: any, isFatal?: boolean) => {
      breadcrumb(
        `js:${isFatal ? 'fatal' : 'error'} ${error?.message ?? String(error)}`
      );
      previousHandler?.(error, isFatal);
    });
  }
}

/** The step the previous session stopped on, if it stopped mid-print. */
export function unfinishedPrint(): string | null {
  const last = previousTrail[previousTrail.length - 1];

  if (!last || TERMINAL_STEPS.some((s) => last.step.startsWith(s))) {
    return null;
  }

  return last.step;
}

/** The whole previous trail, oldest first — for showing or copying out. */
export function previousTrailText(): string {
  return previousTrail.map((e) => `${e.at} ${e.step}`).join('\n');
}
