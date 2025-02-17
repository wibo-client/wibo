const { notarize } = require('electron-notarize');
const path = require('path');

exports.default = async function notarizeElectronApp(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    console.log("Skipping notarization - not on macOS platform");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing app: ${appPath}`);

  try {
    await notarize({
      appBundleId: 'com.wibo.wibo-client', // 替换为你的应用 Bundle ID
      appPath: appPath,
      appleId: 'rainerWJY@gmail.com', // 替换为你的 Apple ID
      appleIdPassword: 'xuou-khdk-gutm-fdsp', // 替换为你的 App-Specific Password
      tool: 'notarytool', // 使用 notarytool
      teamId: '24W3Q4XM85', // 替换为你的 Team ID
    });

    console.log('Successfully notarized the app.');
  } catch (error) {
    console.error('Failed to notarize the app:', error);
  }
};