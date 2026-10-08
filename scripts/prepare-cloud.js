'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'cloudfunctions');
for (const name of ['user', 'store']) {
  const directory = path.join(root, name, 'shared');
  fs.mkdirSync(directory, { recursive: true });
  const modules = name === 'user'
    ? ['runtime', 'native-context', 'cloud-identity-repository', 'authorization-model', 'idempotency-model', 'trade-model']
    : ['runtime', 'native-context'];
  for (const moduleName of modules)
    fs.copyFileSync(path.join(root, '_shared', moduleName + '.js'), path.join(directory, moduleName + '.js'));
}
console.log('Prepared self-contained user identity dependencies and store runtime; no cloud resources were changed.');
