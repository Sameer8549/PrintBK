const path = require('path');

/**
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'com.printbk.counter',
  productName: 'PrintBK Counter',
  directories: {
    output: path.resolve(__dirname, 'dist/installer'),
    buildResources: path.resolve(__dirname, 'public')
  },
  files: [
    'dist/**/*',
    'config/**/*',
    'public/**/*',
    'bin/**/*',
    'package.json',
    '!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}',
    '!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}',
    '!**/node_modules/*.d.ts',
    '!**/node_modules/.bin'
  ],
  extraResources: [
    {
      from: 'bin/SumatraPDF.exe',
      to: 'bin/SumatraPDF.exe'
    },
    {
      from: 'bin/LICENSE.SumatraPDF.txt',
      to: 'bin/LICENSE.SumatraPDF.txt'
    },
    {
      from: 'bin/LICENSE.LibreOffice.txt',
      to: 'bin/LICENSE.LibreOffice.txt'
    }
  ],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ],
    icon: 'public/icon.ico',
    artifactName: 'PrintBK-Counter-Setup-${version}.${ext}',
    legalTrademarks: 'PrintBK',
    verifyUpdateCodeSignature: false
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'public/icon.ico',
    uninstallerIcon: 'public/icon.ico',
    installerHeaderIcon: 'public/icon.ico',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'PrintBK Counter',
    uninstallDisplayName: 'PrintBK Counter',
    deleteAppDataOnUninstall: false,
    runAfterFinish: true
  },
  publish: null
};
