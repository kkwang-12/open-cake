const cloud = require('./cloud');
function health() { return cloud.call('store', 'health'); }
module.exports = { health };
