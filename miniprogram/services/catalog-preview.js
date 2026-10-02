const config = require('../config');
const fixtures = require('../fixtures/catalog-preview');
function products(category = 'all') {
  if (config.stage !== 'development' || config.mode !== 'shell') return [];
  return fixtures.filter(item => category === 'all' || item.category === category).map(item => ({ ...item }));
}
module.exports = { products };
