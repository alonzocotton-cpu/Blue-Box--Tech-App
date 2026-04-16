import { Platform } from 'react-native';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

/**
 * Get the base URL for API calls.
 * On web, uses window.location.origin which correctly proxies /api/* to backend.
 * On native, uses EXPO_PUBLIC_BACKEND_URL.
 */
export function getApiBaseUrl(): string {
  if (Platform.OS === 'web') {
    try {
      // On web, the preview URL proxies /api/* correctly
      if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
      }
    } catch {}
  }
  return BACKEND_URL;
}

export const API_BASE_URL = getApiBaseUrl();
