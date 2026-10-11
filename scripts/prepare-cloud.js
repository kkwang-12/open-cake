'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'cloudfunctions');
for (const name of ['user', 'store', 'catalog','address']) {
  const directory = path.join(root, name, 'shared');
  fs.mkdirSync(directory, { recursive: true });
  const modules = name === 'user'
    ? ['runtime', 'native-context', 'cloud-identity-repository', 'authorization-model', 'idempotency-model', 'trade-model']
    : name === 'address'
      ? ['runtime','native-context','address-cloud-handler','address-service','address-model','api-contract','authorization-model','pagination-model','idempotency-model','trade-model']
    : name === 'catalog'
      ? ['runtime','native-context','catalog-cloud-handler','catalog-read-model','catalog-model','media-model','pagination-model','idempotency-model']
      : ['runtime', 'native-context'];
  for (const moduleName of modules)
    fs.copyFileSync(path.join(root, '_shared', moduleName + '.js'), path.join(directory, moduleName + '.js'));
}
console.log('Prepared self-contained user, store, read-only catalog and disabled-by-default address functions; no cloud resources were changed.');
