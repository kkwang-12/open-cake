'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'cloudfunctions');
for (const name of ['user', 'store', 'catalog','address','cart','checkout','order']) {
  const directory = path.join(root, name, 'shared');
  fs.mkdirSync(directory, { recursive: true });
  if(name==='order'){
    const copied=new Set();
    function copyDependency(moduleName){
      if(copied.has(moduleName))return;copied.add(moduleName);
      const source=fs.readFileSync(path.join(root,'_shared',moduleName+'.js'),'utf8');
      fs.writeFileSync(path.join(directory,moduleName+'.js'),source);
      for(const match of source.matchAll(/require\(['"]\.\/([a-z0-9-]+)['"]\)/g))copyDependency(match[1]);
    }
    copyDependency('order-cloud-handler');copyDependency('native-context');
    continue;
  }
  const modules = name === 'checkout'
    ? ['runtime','native-context','quote-cloud-handler','quote-sdk-service','quote-cloud-context','quote-model','order-facts',
      'cloud-document-transaction','cart-service','cart-model','catalog-model','checkout-selection','store-fulfillment',
      'store-cloud-handler','fulfillment-model','delivery-evaluation','address-model','address-location','media-model',
      'api-contract','authorization-model','idempotency-model','resource-model','trade-model','slot-release-policy','daily-quota']
    : name === 'user'
    ? ['runtime', 'native-context', 'cloud-identity-repository', 'authorization-model', 'idempotency-model', 'trade-model','slot-release-policy']
    : name === 'cart'
      ? ['runtime','native-context','cart-cloud-handler','cart-service','cart-model','catalog-model','daily-quota','api-contract','authorization-model','idempotency-model','trade-model','slot-release-policy']
    : name === 'address'
      ? ['runtime','native-context','address-cloud-handler','address-service','address-model','address-location','api-contract','authorization-model','pagination-model','idempotency-model','trade-model','slot-release-policy']
    : name === 'catalog'
      ? ['runtime','native-context','catalog-cloud-handler','catalog-read-model','catalog-model','daily-quota','media-model','pagination-model','idempotency-model']
      : ['runtime','native-context','store-cloud-handler','store-fulfillment','fulfillment-model','resource-model','slot-release-policy','authorization-model','trade-model','idempotency-model','api-contract'];
  for (const moduleName of modules)
    fs.copyFileSync(path.join(root, '_shared', moduleName + '.js'), path.join(directory, moduleName + '.js'));
}
console.log('Prepared self-contained functions including disabled-by-default address/cart; no cloud resources were changed.');
