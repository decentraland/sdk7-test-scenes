const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read root package.json to get workspaces
const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const workspaces = rootPkg.workspaces || [];

// Support both workspace globs and explicit folders
const getFolders = (pattern) => {
  if (!pattern.includes('*')) return [pattern];
  const base = pattern.replace('/*', '');
  return fs.readdirSync(base)
    .filter(f => fs.existsSync(path.join(base, f, 'package.json')))
    .map(f => path.join(base, f));
};

let allFolders = [];
workspaces.forEach(entry => {
  getFolders(entry).forEach(f => allFolders.push(f));
});

allFolders.forEach(ws => {
  const scenePkgPath = path.join(ws, 'package.json');
  const jsRuntimeVersion = process.env.DCL_JS_RUNTIME_VERSION || 'latest';
  console.log(`TEMP LOG TO BE REMOVED: scenePkgPath: ${scenePkgPath} jsRuntimeVersion: ${jsRuntimeVersion}`);
  if (fs.existsSync(scenePkgPath)) {
    const scenePkg = JSON.parse(fs.readFileSync(scenePkgPath, 'utf8'));
  console.log(`TEMP LOG TO BE REMOVED: scenePkg: ${JSON.stringify(scenePkg)}`);

    if (
      scenePkg.devDependencies &&
      scenePkg.devDependencies["@dcl/sdk"] == "experimental"
    ) {
      console.log(`Installing @dcl/sdk@experimental in ${ws}`);
      execSync(`npm i @dcl/sdk@experimental @dcl/js-runtime@${jsRuntimeVersion}`, {
        cwd: ws,
        stdio: 'inherit'
      });
    }
    else {
      const sdkPackage = process.env.DCL_SDK_PACKAGE || '@dcl/sdk@latest';
      console.log(`Installing ${sdkPackage} @dcl/js-runtime@${jsRuntimeVersion} in ${ws}`);
      execSync(`npm install --save-dev ${sdkPackage} @dcl/js-runtime@${jsRuntimeVersion}`, {
        cwd: ws,
        stdio: 'inherit'
      });
    }
  }
}
);
