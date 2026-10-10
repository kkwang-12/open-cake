const config = require('../config');
const { createError } = require('./errors');
const allowedActions = { user: ['me'], store: ['health'], catalog: ['categories.list','products.list','product.get'] };
const hasDomain = domain => Object.prototype.hasOwnProperty.call(allowedActions, domain);
function createClient(settings, platform, logger = console) {
  let initializedEnv = '';
  function environment() {
    if (!['development', 'test', 'production'].includes(settings.stage) || !['shell', 'cloud'].includes(settings.mode)) {
      throw createError('INVALID_CONFIGURATION');
    }
    if (settings.mode !== 'cloud') throw createError('CLOUD_NOT_CONFIGURED');
    const env = settings.cloudEnvironments && settings.cloudEnvironments[settings.stage];
    if (typeof env !== 'string' || !env.trim() || env !== env.trim()) throw createError('CLOUD_NOT_CONFIGURED');
    const configured = Object.values(settings.cloudEnvironments).filter(Boolean);
    if (new Set(configured).size !== configured.length) throw createError('INVALID_CONFIGURATION');
    return env;
  }
  function initialize() {
    const env = environment();
    const api = platform();
    if (!api || !api.cloud || typeof api.cloud.init !== 'function') throw createError('CLOUD_UNAVAILABLE');
    if (initializedEnv !== env) {
      api.cloud.init({ env, traceUser: false });
      initializedEnv = env;
    }
    return env;
  }
  async function call(domain, action, payload = {}) {
    const requestId = 'client-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    try {
      if (!hasDomain(domain) || !allowedActions[domain].includes(action)) throw createError('INVALID_REQUEST', requestId);
      if (domain==='catalog' && (!settings.catalog || settings.catalog.enabled!==true)) throw createError('CLOUD_NOT_CONFIGURED',requestId);
      const env = initialize();
      let response;
      try {
        response = await platform().cloud.callFunction({ name: domain, data: { action, payload, requestId }, config: { env } });
      } catch (_) { throw createError('CLOUD_CALL_FAILED', requestId); }
      const result = response && response.result;
      if (!result || typeof result.ok !== 'boolean' || typeof result.requestId !== 'string') throw createError('INVALID_RESPONSE', requestId);
      if (!result.ok) throw createError(result.error && result.error.code, result.requestId);
      return { data: result.data, requestId: result.requestId };
    } catch (error) {
      const safe = createError(error.code, error.requestId || requestId);
      logger.warn({ domain: hasDomain(domain) ? domain : 'unknown', code: safe.code, requestId: safe.requestId, stage: ['development', 'test', 'production'].includes(settings.stage) ? settings.stage : 'unknown' });
      throw safe;
    }
  }
  return { initialize, call };
}
const client = createClient(config, () => typeof wx === 'undefined' ? null : wx);
module.exports = { ...client, createClient };
