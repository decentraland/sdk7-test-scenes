const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Every folder under scenes/ with a package.json is a standalone scene
const allFolders = fs.readdirSync('scenes')
  .filter(f => fs.existsSync(path.join('scenes', f, 'package.json')))
  .map(f => path.join('scenes', f));

allFolders.forEach(ws => {
  const scenePkgPath = path.join(ws, 'package.json');
  const jsRuntimeVersion = process.env.DCL_JS_RUNTIME_VERSION || 'latest';

  if (fs.existsSync(scenePkgPath)) {
    const scenePkg = JSON.parse(fs.readFileSync(scenePkgPath, 'utf8'));

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
      const sdkVersion = scenePkg.devDependencies && scenePkg.devDependencies["@dcl/sdk"];
      const hasSdkDefined = sdkVersion && sdkVersion.includes("experimental");
      const isPinned = sdkVersion && !sdkVersion.startsWith('^') && !sdkVersion.startsWith('~') && sdkVersion !== 'latest' && !sdkVersion.includes("experimental");

      let sdkPackage = process.env.DCL_SDK_PACKAGE || '@dcl/sdk@latest';

      if(hasSdkDefined)
        sdkPackage = sdkVersion
      else if(isPinned) {
        sdkPackage = `@dcl/sdk@${sdkVersion}`
        console.log(`Respecting pinned version ${sdkVersion} in ${ws}`);
      }

      console.log(`Installing ${sdkPackage} @dcl/js-runtime@${jsRuntimeVersion} in ${ws}`);
      execSync(`npm install --save-dev ${sdkPackage} @dcl/js-runtime@${jsRuntimeVersion}`, {
        cwd: ws,
        stdio: 'inherit'
      });
    }
  }
}
);
