import React, { useMemo } from 'react';
import { AlertTriangle, RefreshCw, Wrench, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/shared/lib/apiClient';
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';
import { STORAGE_KEYS } from '@/shared/constants/storageKeys';
import { useLanguage } from '@/shared/i18n/LanguageProvider';
import { pickLang } from '@/shared/i18n/localize';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.0";

interface GlobalNotice {
  is_active: boolean;
  title: string;
  message: string;
  action_link?: string;
}

interface SystemConfig {
  key: string;
  value?: any;
  ui_theme_settings?: any;
  maintenance_mode?: boolean;
  maintenance_message?: string;
  maintenance_message_en?: string | null;
  is_force_update_required?: boolean;
  min_app_version?: string;
}

interface SystemGuardProps {
  children: React.ReactNode;
}

export const SystemGuard: React.FC<SystemGuardProps> = ({ children }) => {
  const { language, t } = useLanguage();
  const [dismissedNoticeId, setDismissedNoticeId] = useLocalStorage<string | null>(STORAGE_KEYS.DISMISSED_NOTICE, null);

  const { data: configs, isLoading } = useQuery<SystemConfig[]>({
    queryKey: ['system-configs'],
    queryFn: async () => {
      const response = await apiClient.get('/app-builder/configs');
      return response.data?.data || [];
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const { maintenance, forceUpdate, globalNotice } = useMemo(() => {
    let maintenance = { active: false, message: '' };
    let forceUpdate = false;
    let globalNotice: GlobalNotice | null = null;

    if (configs) {
      const globalConfig = configs.find((c) => c.key === 'global_settings');
      if (globalConfig) {
        if (globalConfig.maintenance_mode) {
          maintenance = {
            active: true,
            message: pickLang(language, globalConfig.maintenance_message, globalConfig.maintenance_message_en),
          };
        }
        if (globalConfig.is_force_update_required) {
          const minVer = globalConfig.min_app_version || '0.0.0';
          if (minVer.localeCompare(APP_VERSION, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
            forceUpdate = true;
          }
        }
      }

      const noticeConfig = configs.find((c) => c.key === 'global_notice');
      if (noticeConfig?.value?.is_active) {
        globalNotice = noticeConfig.value;
      }
    }

    return { maintenance, forceUpdate, globalNotice };
  }, [configs, language]);

  const handleUpdate = async () => {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    window.location.reload();
  };

  const currentNoticeId = globalNotice ? `${globalNotice.title}-${globalNotice.message}` : null;
  const showNotice = globalNotice && currentNoticeId !== dismissedNoticeId;

  if (isLoading && !configs) return <>{children}</>;

  if (maintenance.active) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center fixed inset-0 z-[9999] bg-app text-text-primary">
        <Wrench className="w-16 h-16 text-text-secondary mb-6" />
        <h1 className="text-3xl font-bold mb-4">{t('system.maintenanceTitle')}</h1>
        <p className="text-lg text-text-secondary">{maintenance.message || t('system.maintenanceFallback')}</p>
      </div>
    );
  }

  if (forceUpdate) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center fixed inset-0 z-[9999] bg-app text-text-primary">
        <AlertTriangle className="w-16 h-16 text-text-secondary mb-6" />
        <h1 className="text-3xl font-bold mb-4">{t('system.forceUpdateTitle')}</h1>
        <button onClick={handleUpdate} className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium bg-primary text-primary-foreground transition-opacity hover:opacity-90">
          <RefreshCw className="w-5 h-5" /> {t('system.updateNow')}
        </button>
      </div>
    );
  }

  return (
    <>
      {showNotice && (
        <div className="px-4 py-2.5 flex items-center justify-between z-50 relative shadow-md bg-primary text-primary-foreground">
          <div className="flex-1 text-sm">
            <strong>{globalNotice.title}:</strong> {globalNotice.message}
            {globalNotice.action_link && <a href={globalNotice.action_link} className="underline ml-2 hover:opacity-80">{t('system.noticeDetails')}</a>}
          </div>
          <button onClick={() => currentNoticeId && setDismissedNoticeId(currentNoticeId)} className="p-1 hover:bg-black/10 rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {children}
    </>
  );
};

export default SystemGuard;
