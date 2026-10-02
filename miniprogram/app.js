const api = require('./utils/api');
App({ globalData: { config: null }, onLaunch() { this.ready = api.init().then(config => { this.globalData.config = config; return config; }); this.ready.catch(() => {}); } });
