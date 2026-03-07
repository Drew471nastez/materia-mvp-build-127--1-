import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.storelib.app',
  appName: 'Storelib',
  webDir: 'out',
  android: {
    allowMixedContent: false,
  },
};

export default config;
