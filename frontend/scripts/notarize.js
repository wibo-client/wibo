const { notarize } = require('electron-notarize');
const { build } = require('../package.json');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // 如果没有设置这些环境变量，就跳过公证
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.log('Skipping notarization: Required environment variables are not set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  try {
    console.log('Notarizing app...');
    await notarize({
      appBundleId: build.appId,
      appPath: `${appOutDir}/${appName}.app`,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    });
    console.log('Notarization complete!');
  } catch (err) {
    console.error('Error during notarization:', err);
    // 如果是开发环境或没有设置正确的证书，我们允许构建继续
    if (process.env.NODE_ENV !== 'production') {
      console.log('Continuing build despite notarization error...');
      return;
    }
    throw err;
  }
};
