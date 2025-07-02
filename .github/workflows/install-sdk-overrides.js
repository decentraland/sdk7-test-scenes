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
  if (fs.existsSync(scenePkgPath)) {
    const scenePkg = JSON.parse(fs.readFileSync(scenePkgPath, 'utf8'));
    if (
      scenePkg.overrideDependencies &&
      scenePkg.overrideDependencies["sdk@experimental"]
    ) {
      console.log(`Installing @dcl/sdk@experimental in ${ws}`);
      execSync('npm install --save-dev @dcl/sdk@experimental', {
        cwd: ws,
        stdio: 'inherit'
      });
    }
  }
});
