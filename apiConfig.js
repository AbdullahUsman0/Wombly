// apiConfig.js
// Centralized backend URL selection for web, emulator, and physical devices.

import { Platform } from 'react-native';

const OVERRIDE_URL = process.env.EXPO_PUBLIC_WOMBLY_API_URL || process.env.WOMBLY_API_URL;

let API_URL;

if (OVERRIDE_URL) {
  API_URL = OVERRIDE_URL;
} else if (Platform.OS === 'web') {
  API_URL = 'https://wombly-one.vercel.app';
} else if (Platform.OS === 'android') {
  API_URL = 'https://wombly-one.vercel.app';
} else {
  API_URL = 'https://wombly-one.vercel.app';
}

export const API_BASE_URL = API_URL;