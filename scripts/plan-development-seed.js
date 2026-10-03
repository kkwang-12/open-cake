'use strict';
// Local JSON plan only: node scripts/plan-development-seed.js --input <config.json>
// --existing <minimal-records.json> --output <workspace-plan.json>
const fs = require('node:fs'), path = require('node:path');
const { buildDevelopmentSeedPlan } = require('../cloudfunctions/_shared/development-seed');
try {
  const args = process.argv.slice(2), options = {};
  if (args.length % 2) throw new Error('INVALID_ARGUMENTS');
  for (let index=0;index<args.length;index+=2) {
    const flag = args[index];
    if (!['--input','--existing','--output'].includes(flag) || options[flag] !== undefined || !args[index+1]) throw new Error('INVALID_ARGUMENTS');
    options[flag] = args[index+1];
  }
  if (!options['--input'] || !options['--output']) throw new Error('INVALID_ARGUMENTS');
  const root = path.resolve(__dirname,'..'), output = path.resolve(options['--output']);
  const relative = path.relative(root,output);
  const outputRoot = path.join(root,'artifacts','development-seed');
  const withinOutput = path.relative(outputRoot,output);
  if (!withinOutput || withinOutput === '..' || withinOutput.startsWith('..'+path.sep) || path.isAbsolute(withinOutput)) throw new Error('OUTPUT_OUTSIDE_WORKSPACE');
  const realParent = fs.realpathSync(path.dirname(output));
  const actualParent = path.relative(root,realParent);
  if (actualParent === '..' || actualParent.startsWith('..'+path.sep) || path.isAbsolute(actualParent)) throw new Error('OUTPUT_OUTSIDE_WORKSPACE');
  if (!relative || relative === '..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) throw new Error('OUTPUT_OUTSIDE_WORKSPACE');
  const config = JSON.parse(fs.readFileSync(path.resolve(options['--input']),'utf8'));
  const existing = options['--existing'] ? JSON.parse(fs.readFileSync(path.resolve(options['--existing']),'utf8')) : [];
  const plan = buildDevelopmentSeedPlan(config.settings,existing,config.now);
  // Exclusive create also protects any already saved output or existing source file.
  fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log(JSON.stringify({status:plan.status,operations:plan.operations.length,output:relative}));
} catch (error) {
  // Never print configuration / existing records / stack / upstream error messages.
  const codes = ['SEED_ENVIRONMENT_REJECTED','INVALID_SEED_INPUT','SEED_CONFLICT'];
  const code = error && codes.includes(error.code) ? error.code :
    error && error.code === 'EEXIST' ? 'OUTPUT_ALREADY_EXISTS' : 'SEED_PLAN_FAILED';
  console.error(JSON.stringify({code})); process.exitCode = 1;
}
