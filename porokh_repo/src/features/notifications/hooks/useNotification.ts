import { useState, useEffect } from 'react';
import { requestNotificationPermission, saveDeviceTokenToAPI, getOrCreateDeviceId } from '../services/notificationService';
import { useAuth } from '../../auth/hooks/useAuth';
import { useLanguage } from '@/shared/i18n/LanguageProvider';

export const useNotification = () => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showDeniedModal, setShowDeniedModal] = useState(false);
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const toggleNotifications = async () => {
    if (!('Notification' in window)) {
      alert(t('notification.browserUnsupported'));
      return;
    }

    if (notificationsEnabled) {
      const confirmDisable = window.confirm(t('notification.disableConfirm'));
      if (confirmDisable) {
        setNotificationsEnabled(false);
        
        // API কল করে FCM টোকেন রিমুভ (null) করা
        const deviceId = getOrCreateDeviceId();
        if (user) {
          await saveDeviceTokenToAPI(deviceId, null);
          console.log("FCM token invalidated via API");
        }
      }
    } else {
      if ((Notification.permission as string) === 'denied') {
        setShowDeniedModal(true);
        return;
      }

      try {
        if (!user) {
          console.warn(t('notification.loginRequired'));
          return;
        }

        const token = await requestNotificationPermission();
        
        if (token) {
          setNotificationsEnabled(true);
        } else if ((Notification.permission as string) === 'denied') {
          setShowDeniedModal(true);
        }
      } catch (error) {
        console.error('Notification permission error:', error);
      }
    }
  };

  return { notificationsEnabled, toggleNotifications, showDeniedModal, setShowDeniedModal };
};
