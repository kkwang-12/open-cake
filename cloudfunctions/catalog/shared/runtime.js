'use strict';
const { createHash, randomUUID } = require('node:crypto');
const messages = {
  INVALID_CONFIGURATION: '服务配置异常', AUTH_REQUIRED: '身份验证失败',
  ENV_MISMATCH: '服务环境不匹配', APP_MISMATCH: '小程序身份不匹配',
  INVALID_REQUEST: '请求无效', INTERNAL_ERROR: '服务暂时不可用',
  CONFIGURATION_REQUIRED: '服务资料尚未配置', PRODUCT_UNAVAILABLE: '商品不存在或暂未开放',
  NOT_FOUND: '内容不存在', CURSOR_INVALID: '分页已失效，请重新加载', CURSOR_EXPIRED: '分页已过期，请重新加载'
};
function createHandler({ action, handle, getContext, settings, logger = console, mapError = () => 'INTERNAL_ERROR' }) {
  return async function main(event = {}, invocationContext) {
    const requestId = randomUUID();
    let code = '';
    try {
      if (!settings.appId || !settings.environment || !['development', 'test', 'production'].includes(settings.stage)) code = 'INVALID_CONFIGURATION';
      const context = getContext(invocationContext) || {};
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
      // Keep native identifiers out of the public argument object, even for handlers
      // that return that object. The second argument is an internal request snapshot.
      const data = await handle({ subjectHash, environment: settings.environment, stage: settings.stage },
        Object.freeze({ OPENID: context.OPENID, APPID: context.APPID, ENV: context.ENV }));
      logger.info({ code: 'OK', requestId, stage: settings.stage });
      return { ok: true, requestId, data };
    } catch (error) {
      let publicCode = 'INTERNAL_ERROR';
      try {
        const mapped = mapError(error);
        if (Object.prototype.hasOwnProperty.call(messages, mapped)) publicCode = mapped;
      } catch (_) { publicCode = 'INTERNAL_ERROR'; }
      logger.error({ code: publicCode, requestId, stage: settings.stage });
      return { ok: false, requestId, error: { code: publicCode, message: messages[publicCode] } };
    }
  };
}
module.exports = { createHandler };
