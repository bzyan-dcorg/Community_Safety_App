import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotificationsAsync() {
  let token;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return undefined;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  token = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });
  return token?.data;
}

export function usePushNotifications() {
  useEffect(() => {
    registerForPushNotificationsAsync().catch((err) => console.warn('Push registration failed', err));
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const incidentId = response.notification.request.content.data?.incidentId;
      if (incidentId) {
        router.push({ pathname: '/(tabs)/index', params: { incidentId: String(incidentId) } });
      } else {
        router.push('/(tabs)/notifications');
      }
    });
    return () => {
      responseListener.remove();
    };
  }, []);
}
