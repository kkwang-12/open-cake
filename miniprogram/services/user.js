const cloud = require('./cloud');
function current() { return cloud.call('user', 'me'); }
module.exports = { current };
