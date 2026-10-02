const routes = require('../constants/routes');
function createShell(options) {
  return {
    data: { ...options },
    goShop() { routes.navigate('shop'); },
    onLoad(params = {}) { if (params.id) this.setData({ reference: String(params.id).slice(0, 80) }); }
  };
}
module.exports = { createShell };
