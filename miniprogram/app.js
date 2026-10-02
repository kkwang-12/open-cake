const config = require('./config');
const cloudService = require('./services/cloud');
App({
  globalData: { config, cloudStatus: 'unconfigured', cloudError: null },
  onLaunch() {
    if (config.mode !== 'cloud') return;
    try {
      cloudService.initialize();
      this.globalData.cloudStatus = 'initialized';
    } catch (error) {
      this.globalData.cloudStatus = 'error';
      this.globalData.cloudError = { code: error.code, message: error.message, requestId: error.requestId };
    }
  }
});
