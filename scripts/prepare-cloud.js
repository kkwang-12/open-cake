'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'cloudfunctions');
for (const name of ['user', 'store', 'catalog','address','cart']) {
  const directory = path.join(root, name, 'shared');
  fs.mkdirSync(directory, { recursive: true });
  const modules = name === 'user'
    ? ['runtime', 'native-context', 'cloud-identity-repository', 'authorization-model', 'idempotency-model', 'trade-model']
    : name === 'cart'
      ? ['runtime','native-context','cart-cloud-handler','cart-service','cart-model','catalog-model','api-contract','authorization-model','idempotency-model','trade-model']
    : name === 'address'
      ? ['runtime','native-context','address-cloud-handler','address-service','address-model','api-contract','authorization-model','pagination-model','idempotency-model','trade-model']
    : name === 'catalog'
      ? ['runtime','native-context','catalog-cloud-handler','catalog-read-model','catalog-model','media-model','pagination-model','idempotency-model']
      : ['runtime','native-context','store-cloud-handler','store-fulfillment','fulfillment-model','resource-model','authorization-model','trade-model','idempotency-model','api-contract'];
  for (const moduleName of modules)
    fs.copyFileSync(path.join(root, '_shared', moduleName + '.js'), path.join(directory, moduleName + '.js'));
}
console.log('Prepared self-contained functions including disabled-by-default address/cart; no cloud resources were changed.');
