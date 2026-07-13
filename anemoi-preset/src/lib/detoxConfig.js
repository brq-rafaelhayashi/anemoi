function createDetoxConfig(hostConfig = {}) {
  const tangerinaMode = process.env.TANGERINA_MODE || 'package';
  const iosDevice =
    process.env.ANEMOI_IOS_DEVICE ||
    hostConfig.devices?.ios ||
    'iPhone 16';
  const androidAvd =
    process.env.ANEMOI_ANDROID_AVD ||
    hostConfig.devices?.android ||
    'Medium_Phone_API_36.1';
  const envFile = hostConfig.envFile || '.env.automation';
  const ios = hostConfig.detox?.ios || {};
  const android = hostConfig.detox?.android || {};

  return {
    testRunner: {
      args: {
        $0: 'jest',
        config: hostConfig.detox?.jestConfig || 'detox/jest.config.js',
      },
      jest: {
        setupTimeout: hostConfig.detox?.setupTimeout || 120000,
      },
    },
    apps: {
      'ios.automation': {
        type: 'ios.app',
        binaryPath:
          ios.binaryPath ||
          'ios/build/Build/Products/Debug-iphonesimulator/golbeta-staging.app',
        build:
          ios.build ||
          `ENVFILE=${envFile} TANGERINA_MODE=${tangerinaMode} ` +
            'xcodebuild -workspace ios/golbeta.xcworkspace ' +
            '-scheme "golbeta (staging)" -configuration Debug ' +
            `-sdk iphonesimulator -destination "platform=iOS Simulator,name=${iosDevice}" ` +
            '-derivedDataPath ios/build ONLY_ACTIVE_ARCH=YES',
      },
      'android.automation': {
        type: 'android.apk',
        binaryPath:
          android.binaryPath ||
          'android/app/build/outputs/apk/staging/debug/app-staging-debug.apk',
        build:
          android.build ||
          'cd android && ' +
            `ENVFILE=${envFile} TANGERINA_MODE=${tangerinaMode} ` +
            './gradlew assembleStagingDebug assembleStagingDebugAndroidTest ' +
            '-DtestBuildType=debug',
      },
    },
    devices: {
      'ios.simulator': {
        type: 'ios.simulator',
        device: {
          type: iosDevice,
        },
      },
      'android.emulator': {
        type: 'android.emulator',
        device: {
          avdName: androidAvd,
        },
      },
    },
    configurations: {
      'ds.ios.debug': {
        device: 'ios.simulator',
        app: 'ios.automation',
      },
      'ds.android.debug': {
        device: 'android.emulator',
        app: 'android.automation',
      },
    },
  };
}

module.exports = {
  createDetoxConfig,
};
