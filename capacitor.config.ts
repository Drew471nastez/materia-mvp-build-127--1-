import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.storelib.app',
  appName: 'Storelib',
  webDir: 'out',
  server: {
    url: 'https://storelib.com',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
