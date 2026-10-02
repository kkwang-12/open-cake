'use strict';
const { createHash, randomUUID } = require('node:crypto');
const messages = {
  INVALID_CONFIGURATION: '服务配置异常', AUTH_REQUIRED: '身份验证失败',
  ENV_MISMATCH: '服务环境不匹配', APP_MISMATCH: '小程序身份不匹配',
  INVALID_REQUEST: '请求无效', INTERNAL_ERROR: '服务暂时不可用'
};
function createHandler({ action, handle, getContext, settings, logger = console }) {
  return async function main(event = {}) {
    const requestId = randomUUID();
    let code = '';
    try {
      if (!settings.appId || !settings.environment || !['development', 'test', 'production'].includes(settings.stage)) code = 'INVALID_CONFIGURATION';
      const context = getContext() || {};
      if (!code && (!context.OPENID || !context.APPID)) code = 'AUTH_REQUIRED';
      if (!code && context.APPID !== settings.appId) code = 'APP_MISMATCH';
      if (!code && context.ENV !== settings.environment) code = 'ENV_MISMATCH';
      if (!code && (!event || event.action !== action || (event.payload !== undefined && (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload))))) code = 'INVALID_REQUEST';
      if (code) {
        logger.warn({ code, requestId, stage: settings.stage });
        return { ok: false, requestId, error: { code, message: messages[code] } };
      }
      // 只使用平台上下文，不读取 event.openid / role / payload 中的身份字段。
      const subjectHash = createHash('sha256').update(context.APPID + ':' + context.OPENID).digest('hex').slice(0, 16);
      const data = await handle({ subjectHash, environment: settings.environment, stage: settings.stage });
      logger.info({ code: 'OK', requestId, stage: settings.stage });
      return { ok: true, requestId, data };
    } catch (_) {
      logger.error({ code: 'INTERNAL_ERROR', requestId, stage: settings.stage });
      return { ok: false, requestId, error: { code: 'INTERNAL_ERROR', message: messages.INTERNAL_ERROR } };
    }
  };
}
module.exports = { createHandler };
