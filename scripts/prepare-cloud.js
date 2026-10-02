'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'cloudfunctions');
for (const name of ['user', 'store']) {
  const directory = path.join(root, name, 'shared');
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(path.join(root, '_shared', 'runtime.js'), path.join(directory, 'runtime.js'));
}
console.log('Prepared self-contained user/store shared runtime; no cloud resources were changed.');
