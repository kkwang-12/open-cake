'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const functionName = 'jjl-i03-rejection-20261008';
const functionRoot = path.join(root, 'artifacts', 'initialization-cloud-20261008', 'functions');
const target = path.join(functionRoot, functionName);
if (fs.existsSync(target)) throw new Error('VALIDATION_PACKAGE_EXISTS');
fs.mkdirSync(path.join(target, 'shared'), { recursive: true });
const files = [
  ['scripts/cloud-checks/initialization-rejection.js', 'index.js'],
  ['cloudfunctions/_shared/runtime.js', 'shared/runtime.js'],
  ['cloudfunctions/_shared/native-context.js', 'shared/native-context.js'],
  ['cloudfunctions/user/package.json', 'package.json'],
  ['cloudfunctions/user/package-lock.json', 'package-lock.json']
];
for (const [source, destination] of files) fs.copyFileSync(path.join(root, source), path.join(target, destination));
console.log(JSON.stringify({ functionName, functionRoot, target,
  runtimeHash: createHash('sha256').update(fs.readFileSync(path.join(target, 'shared/runtime.js'))).digest('hex') }));
