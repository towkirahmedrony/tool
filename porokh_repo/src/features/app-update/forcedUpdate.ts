/**
 * One user-triggered "check for updates / hard reload" run.
 *
 * The three runtimes need three different recovery paths, and pretending they
 * are the same is what makes "forced update" buttons useless:
 *
 *  - Capacitor + OTA plugin: ask the provider for the newest bundle for this
 *    channel, verify it, then activate it through the exam-aware gate. Nothing
 *    is downloaded or activated here — the OTA controller already owns those
 *    invariants, this module only drives it.
 *  - Capacitor without OTA (APK built before the updater shipped): the frontend
 *    is inside the APK and no in-app mechanism can replace it. The honest answer
 *    is "a new APK is required", with a link when one is published.
 *  - Browser/PWA: the deployment is the source of truth, so purge runtime
 *    caches and reload from the network, then verify the build id changed.
 *
 * Exam data is never touched: the run refuses to reload while an exam is being
 * taken, and the cache purge only removes Cache Storage buckets.
 */
import type { BuildInfo } from './buildInfo';
import {
  compareBuilds,
  type ManifestFetchResult,
  type RemoteManifest,
} from './remoteManifest';
import { compareNumericVersions } from './version';
import type { OtaBlockReason, OtaPhase, OtaSnapshot, ActivationDecision } from './types';
import {
  purgeFrontendCaches,
  writePendingReload,
  type CachePurgeReport,
  type PendingReload,
} from './cacheRecovery';

export type ForcedUpdateStage =
  | 'checking'
  | 'downloading'
  | 'activating'
  | 'reloading';

export type ForcedUpdateOutcome =
  | {
      kind: 'up_to_date';
      build: BuildInfo;
      remote: RemoteManifest | null;
      /** The deployment is newer, but no app-usable bundle exists for it. */
      webAhead: boolean;
    }
  | { kind: 'ota_staged'; version: string; progress: number }
  | { kind: 'ota_activated'; version: string; previousVersion: string | null }
  | { kind: 'ota_restart_required'; version: string }
  | { kind: 'reloaded'; targetBuildId: string; targetVersion: string }
  | {
      kind: 'apk_required';
      build: BuildInfo;
      remote: RemoteManifest | null;
      apkUrl: string | null;
      reason: 'bundled_assets' | 'native_incompatible' | 'ota_unavailable';
    }
  | { kind: 'blocked'; reasons: OtaBlockReason[] }
  | { kind: 'rejected'; reasons: OtaBlockReason[] }
  | { kind: 'offline' }
  | { kind: 'server_error'; detail?: string };

export type OtaDriver = {
  initialize(): Promise<void>;
  checkForUpdate(manual?: boolean): Promise<void>;
  activate(): Promise<ActivationDecision>;
  getSnapshot(): OtaSnapshot;
};

export type ForcedUpdateDeps = {
  build: BuildInfo;
  /** True inside the Capacitor shell. */
  native: boolean;
  otaAvailable: boolean;
  ota: OtaDriver | null;
  checkManifest: () => Promise<ManifestFetchResult>;
  purgeCaches?: () => Promise<CachePurgeReport>;
  /** Defaults to a network reload of the current document. */
  performReload?: (pending: PendingReload) => void;
  isExamBusy: () => boolean;
  isOnline: () => boolean;
  now?: () => number;
  onStage?: (stage: ForcedUpdateStage) => void;
};

const NATIVE_FAILURES: OtaBlockReason[] = [
  'native_incompatible',
  'storage_schema_incompatible',
  'channel_mismatch',
  'metadata_invalid',
  'checksum_invalid',
];

const requiresNewApk = (reasons: OtaBlockReason[]): boolean =>
  reasons.includes('native_incompatible') ||
  reasons.includes('storage_schema_incompatible');

const phaseStage = (phase: OtaPhase): ForcedUpdateStage | null => {
  switch (phase) {
    case 'checking':
      return 'checking';
    case 'downloading':
    case 'available':
      return 'downloading';
    case 'activating':
      return 'activating';
    default:
      return null;
  }
};

const nativeTooOld = (build: BuildInfo, remote: RemoteManifest | null): boolean => {
  if (!remote?.minNativeVersion) return false;
  const order = compareNumericVersions(remote.minNativeVersion, build.version);
  return order === null ? false : order > 0;
};

const defaultReload = (pending: PendingReload): void => {
  if (typeof window !== 'undefined') {
    // The marker must exist before the document goes away.
    writePendingReload(pending);
    window.location.reload();
  }
};

/** Native + OTA: ask the provider, then activate whatever it staged. */
const runOtaPath = async (
  deps: ForcedUpdateDeps,
  ota: OtaDriver
): Promise<ForcedUpdateOutcome> => {
  deps.onStage?.('checking');
  await ota.initialize();
  await ota.checkForUpdate(true);

  const snapshot = ota.getSnapshot();
  const stage = phaseStage(snapshot.phase);
  if (stage) deps.onStage?.(stage);

  switch (snapshot.phase) {
    case 'up_to_date':
    case 'idle': {
      const manifest = await deps.checkManifest();
      const remote = manifest.ok ? manifest.manifest : null;
      const webAhead =
        Boolean(remote) &&
        compareBuilds(deps.build, remote as RemoteManifest).status ===
          'update_available';
      return { kind: 'up_to_date', build: deps.build, remote, webAhead };
    }

    case 'staged':
    case 'activation_blocked': {
      const reasons = snapshot.reasons.filter((reason) => reason !== 'exam_active');
      if (reasons.length > 0) {
        if (requiresNewApk(reasons)) {
          const manifest = await deps.checkManifest();
          return {
            kind: 'apk_required',
            build: deps.build,
            remote: manifest.ok ? manifest.manifest : null,
            apkUrl: manifest.ok ? manifest.manifest.apkUrl : null,
            reason: 'native_incompatible',
          };
        }
        return { kind: 'blocked', reasons: snapshot.reasons };
      }

      if (!snapshot.stagedVersion) {
        return { kind: 'blocked', reasons: snapshot.reasons };
      }

      deps.onStage?.('activating');
      const decision = await ota.activate();
      if (!decision.allowed) {
        if (requiresNewApk(decision.reasons)) {
          const manifest = await deps.checkManifest();
          return {
            kind: 'apk_required',
            build: deps.build,
            remote: manifest.ok ? manifest.manifest : null,
            apkUrl: manifest.ok ? manifest.manifest.apkUrl : null,
            reason: 'native_incompatible',
          };
        }
        return decision.reasons.length > 0
          ? { kind: 'blocked', reasons: decision.reasons }
          : { kind: 'ota_staged', version: snapshot.stagedVersion, progress: 100 };
      }

      // set() reloads the WebView; the next boot confirms the version, so the
      // activation is reported as "in progress" rather than "done".
      return {
        kind: 'ota_activated',
        version: snapshot.stagedVersion,
        previousVersion: snapshot.currentVersion,
      };
    }

    case 'activating':
      return {
        kind: 'ota_restart_required',
        version: snapshot.stagedVersion ?? snapshot.currentVersion ?? '',
      };

    case 'rejected': {
      const reasons = snapshot.reasons.filter((reason) => NATIVE_FAILURES.includes(reason));
      if (requiresNewApk(reasons)) {
        const manifest = await deps.checkManifest();
        return {
          kind: 'apk_required',
          build: deps.build,
          remote: manifest.ok ? manifest.manifest : null,
          apkUrl: manifest.ok ? manifest.manifest.apkUrl : null,
          reason: 'native_incompatible',
        };
      }
      return { kind: 'rejected', reasons: snapshot.reasons };
    }

    case 'check_failed':
    case 'download_failed': {
      // The provider is unreachable or refuses this device. If the deployment
      // is newer anyway, the only usable recovery is a new APK.
      const manifest = await deps.checkManifest();
      if (manifest.ok) {
        const comparison = compareBuilds(deps.build, manifest.manifest);
        if (comparison.status === 'update_available') {
          return {
            kind: 'apk_required',
            build: deps.build,
            remote: manifest.manifest,
            apkUrl: manifest.manifest.apkUrl,
            reason: nativeTooOld(deps.build, manifest.manifest)
              ? 'native_incompatible'
              : 'ota_unavailable',
          };
        }
      }
      return { kind: 'server_error', detail: snapshot.error ?? snapshot.phase };
    }

    default: {
      const manifest = await deps.checkManifest();
      return {
        kind: 'up_to_date',
        build: deps.build,
        remote: manifest.ok ? manifest.manifest : null,
        webAhead:
          manifest.ok &&
          compareBuilds(deps.build, manifest.manifest).status === 'update_available',
      };
    }
  }
};

/** Native without the OTA plugin: the frontend is sealed inside the APK. */
const runBundledPath = async (
  deps: ForcedUpdateDeps
): Promise<ForcedUpdateOutcome> => {
  deps.onStage?.('checking');
  const manifest = await deps.checkManifest();

  if (!manifest.ok) {
    return manifest.reason === 'offline'
      ? { kind: 'offline' }
      : { kind: 'server_error', detail: manifest.reason };
  }

  const comparison = compareBuilds(deps.build, manifest.manifest);
  if (comparison.status !== 'update_available') {
    return {
      kind: 'up_to_date',
      build: deps.build,
      remote: manifest.manifest,
      webAhead: false,
    };
  }

  return {
    kind: 'apk_required',
    build: deps.build,
    remote: manifest.manifest,
    apkUrl: manifest.manifest.apkUrl,
    reason: nativeTooOld(deps.build, manifest.manifest)
      ? 'native_incompatible'
      : 'bundled_assets',
  };
};

/** Browser/PWA: verify against the deployment, then reload from the network. */
const runWebPath = async (
  deps: ForcedUpdateDeps
): Promise<ForcedUpdateOutcome> => {
  deps.onStage?.('checking');
  const manifest = await deps.checkManifest();

  if (!manifest.ok) {
    return manifest.reason === 'offline'
      ? { kind: 'offline' }
      : { kind: 'server_error', detail: manifest.reason };
  }

  const comparison = compareBuilds(deps.build, manifest.manifest);
  if (comparison.status === 'unknown') {
    return { kind: 'server_error', detail: 'invalid_manifest' };
  }

  if (comparison.status !== 'update_available') {
    return {
      kind: 'up_to_date',
      build: deps.build,
      remote: manifest.manifest,
      webAhead: false,
    };
  }

  const purge = deps.purgeCaches ?? (() => purgeFrontendCaches());
  await purge();

  deps.onStage?.('reloading');
  const pending: PendingReload = {
    targetBuildId: manifest.manifest.buildId,
    targetVersion: manifest.manifest.version,
    fromBuildId: deps.build.buildId,
    at: (deps.now ?? Date.now)(),
  };

  if (deps.performReload) {
    deps.performReload(pending);
  } else {
    defaultReload(pending);
  }

  return {
    kind: 'reloaded',
    targetBuildId: pending.targetBuildId,
    targetVersion: pending.targetVersion,
  };
};

/**
 * Run one forced-update attempt. Never throws: every failure becomes a typed
 * outcome the UI can explain.
 */
export const runForcedUpdate = async (
  deps: ForcedUpdateDeps
): Promise<ForcedUpdateOutcome> => {
  try {
    if (!deps.isOnline()) return { kind: 'offline' };

    // An exam in progress is never interrupted, not even for an explicit tap.
    if (deps.isExamBusy()) return { kind: 'blocked', reasons: ['exam_active'] };

    if (!deps.native) return await runWebPath(deps);

    if (deps.otaAvailable && deps.ota) return await runOtaPath(deps, deps.ota);

    return await runBundledPath(deps);
  } catch (error) {
    return {
      kind: 'server_error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};
