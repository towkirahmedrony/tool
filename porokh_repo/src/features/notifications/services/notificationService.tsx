import { messaging } from '@/shared/lib/firebase';
import { getToken, onMessage, MessagePayload, Unsubscribe } from 'firebase/messaging';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';
import { StorageUtils } from '@/shared/utils/storage';
import { STORAGE_KEYS } from '@/shared/constants/storageKeys';
import { DBNotificationItem } from '../types/notificationTypes';

const VAPID_KEY =
  import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  'BCXBVur7e0RozLaLRM9rX79GJeRQcRluggPQ4xqklnbvqDVFFuJrTI-XGKe4yF_qMYCvXyB-MIxlu26Dk9S-ryk';

export const getOrCreateDeviceId = (): string => {
  let deviceId = StorageUtils.get<string>(STORAGE_KEYS.DEVICE_ID);

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    StorageUtils.set(STORAGE_KEYS.DEVICE_ID, deviceId);
  }

  return deviceId;
};

const getDeviceName = (): string => {
  const userAgent = navigator.userAgent;

  if (/Android/i.test(userAgent)) return 'Android Phone';
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/Mobile/i.test(userAgent)) return 'Mobile Device';

  return 'Web Client';
};

export const saveDeviceTokenToAPI = async (
  deviceId: string,
  token: string | null
): Promise<void> => {
  if (!token) return;

  try {
    const userAgent = navigator.userAgent;

    const response = await apiClient.post('/notifications/device-token', {
      device_id: deviceId,
      device_name: getDeviceName(),
      os_or_browser: userAgent,
      fcm_token: token,
    });

    console.log('[NotificationService] Device token synced:', response.data);
  } catch (error) {
    console.error('[NotificationService] Error syncing token with API:', error);
  }
};

export const requestNotificationPermission = async (): Promise<string | null> => {
  if (!messaging) {
    console.warn('[NotificationService] Firebase messaging is not supported or initialized.');
    return null;
  }

  if (!('serviceWorker' in navigator)) {
    console.warn('[NotificationService] Service Worker is not supported in this browser.');
    return null;
  }

  if (!('Notification' in window)) {
    console.warn('[NotificationService] Notification API is not supported in this browser.');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      console.warn('[NotificationService] Notification permission denied by user.');
      return null;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.warn('[NotificationService] No FCM token returned.');
      return null;
    }

    const deviceId = getOrCreateDeviceId();
    await saveDeviceTokenToAPI(deviceId, token);

    return token;
  } catch (error) {
    console.error('[NotificationService] Error getting FCM token:', error);
    return null;
  }
};

export const listenForForegroundMessages = (): Unsubscribe | undefined => {
  if (!messaging) return undefined;

  return onMessage(messaging, (payload: MessagePayload) => {
    const title = payload.notification?.title || 'New Update';
    const body = payload.notification?.body || '';

    toast.custom((t) => (
      <div
        className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full shadow-lg rounded-2xl pointer-events-auto flex border p-4`}
        style={{
          backgroundColor: 'var(--dyn-card)',
          borderColor: 'color-mix(in srgb, var(--dyn-text) 10%, transparent)',
        }}
      >
        <div className="flex-1 w-0">
          <div className="flex items-start">
            <div className="ml-3 flex-1 font-['Hind_Siliguri']">
              <p className="text-sm font-bold" style={{ color: 'var(--dyn-text)' }}>
                {title}
              </p>
              <p
                className="mt-1 text-sm"
                style={{
                  color: 'color-mix(in srgb, var(--dyn-text) 70%, transparent)',
                }}
              >
                {body}
              </p>
            </div>
          </div>
        </div>
      </div>
    ));
  });
};

// === API Functions (Typed & Hardened) ===

type NotificationApiResponse = DBNotificationItem[] | { data: DBNotificationItem[] };

export const fetchNotifications = async (): Promise<DBNotificationItem[]> => {
  try {
    const response = await apiClient.get<NotificationApiResponse>('/notifications');
    const responseData = response.data;

    if (Array.isArray(responseData)) {
      return responseData;
    }

    return responseData?.data ?? [];
  } catch (error) {
    console.error('[NotificationService] Error fetching notifications:', error);
    throw error;
  }
};

export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  try {
    await apiClient.post(`/notifications/${notificationId}/read`);
  } catch (error) {
    console.error('[NotificationService] Error marking notification as read:', error);
    throw error;
  }
};
