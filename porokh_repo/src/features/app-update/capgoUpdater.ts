import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater, type BundleInfo } from '@capgo/capacitor-updater';
import type {
  DownloadProgress,
  OtaUpdaterAdapter,
  ProviderBundle,
  ProviderCurrent,
  ProviderLatest,
} from './types';

const toProviderBundle = (bundle: BundleInfo): ProviderBundle => ({
  id: bundle.id,
  version: bundle.version,
  checksum: bundle.checksum ?? '',
  status:
    bundle.status === 'success' ||
    bundle.status === 'error' ||
    bundle.status === 'pending' ||
    bundle.status === 'downloading'
      ? bundle.status
      : 'error',
  downloadedAt: bundle.downloaded || undefined,
  // The plugin reports the APK-baked copy with the fixed id `builtin`.
  builtin: bundle.id === 'builtin',
});

/**
 * Thin Capgo boundary. Every call is guarded by the native-platform check in
 * the controller; this class contains no activation policy of its own.
 */
export class CapgoUpdaterAdapter implements OtaUpdaterAdapter {
  async isAvailable(): Promise<boolean> {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === 'android' &&
      Capacitor.isPluginAvailable('CapacitorUpdater')
    );
  }

  async getLatest(): Promise<ProviderLatest> {
    const latest = await CapacitorUpdater.getLatest();
    return {
      version: latest.version ?? '',
      url: latest.url ?? '',
      checksum: latest.checksum ?? '',
      sessionKey: latest.sessionKey,
      kind: latest.kind,
      error: latest.error,
      old: latest.old,
      major: latest.breaking ?? latest.major,
    };
  }

  async getBuiltinVersion(): Promise<string> {
    const result = await CapacitorUpdater.getBuiltinVersion();
    return result.version ?? '';
  }

  async getChannel(): Promise<string | null> {
    const result = await CapacitorUpdater.getChannel();
    return typeof result.channel === 'string' ? result.channel : null;
  }

  async current(): Promise<ProviderCurrent> {
    const result = await CapacitorUpdater.current();
    return {
      bundle: toProviderBundle(result.bundle),
      native: result.native,
    };
  }

  async list(): Promise<ProviderBundle[]> {
    const result = await CapacitorUpdater.list();
    return result.bundles.map(toProviderBundle);
  }

  async download(release: {
    url: string;
    version: string;
    checksum: string;
    sessionKey?: string;
  }): Promise<ProviderBundle> {
    const result = await CapacitorUpdater.download(release);
    return toProviderBundle(result);
  }

  async deleteBundle(id: string): Promise<void> {
    await CapacitorUpdater.delete({ id });
  }

  async notifyAppReady(): Promise<void> {
    await CapacitorUpdater.notifyAppReady();
  }

  async setBundle(id: string): Promise<void> {
    await CapacitorUpdater.set({ id });
  }

  async resetToLastSuccessful(): Promise<void> {
    await CapacitorUpdater.reset({ toLastSuccessful: true });
  }

  /** Drop back to the bundle that ships inside the APK. Reloads immediately. */
  async resetToBuiltin(): Promise<void> {
    await CapacitorUpdater.reset();
  }

  async reload(): Promise<void> {
    await CapacitorUpdater.reload();
  }

  subscribeProgress(
    listener: (progress: DownloadProgress) => void
  ): () => void {
    let active = true;
    let handle: { remove: () => Promise<void> } | null = null;

    void CapacitorUpdater.addListener('download', (event) => {
      if (!active) return;
      listener({ percent: event.percent, version: event.bundle.version });
    }).then((registered) => {
      if (!active) {
        void registered.remove();
        return;
      }
      handle = registered;
    });

    return () => {
      active = false;
      if (handle) void handle.remove();
    };
  }
}
