// apiConfig.js
// Centralized backend URL selection for web, emulator, and physical devices.

import { Platform } from 'react-native';

const OVERRIDE_URL = process.env.EXPO_PUBLIC_WOMBLY_API_URL || process.env.WOMBLY_API_URL;

let API_URL;

if (OVERRIDE_URL) {
  API_URL = OVERRIDE_URL;
} else if (Platform.OS === 'web') {
  API_URL = 'http://localhost:5000';
} else if (Platform.OS === 'android') {
  API_URL = 'http://10.0.2.2:5000';
} else {
  API_URL = 'http://localhost:5000';
}

export const API_BASE_URL = API_URL;