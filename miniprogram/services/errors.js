const messages = {
  CLOUD_NOT_CONFIGURED: '服务暂未开通，请稍后再试',
  INVALID_CONFIGURATION: '服务配置异常，请联系维护人员',
  CLOUD_UNAVAILABLE: '当前微信版本暂不支持该服务',
  CLOUD_CALL_FAILED: '连接失败，请稍后重试',
  INVALID_RESPONSE: '服务返回异常，请稍后重试',
  INVALID_REQUEST: '请求无效，请重新操作',
  PRODUCT_UNAVAILABLE: '商品不存在或暂未开放',
  NOT_FOUND: '内容不存在',
  CONFIGURATION_REQUIRED: '商品资料尚未配置',
  CURSOR_INVALID: '分页已失效，请重新加载',
  CURSOR_EXPIRED: '分页已过期，请重新加载',
  AUTH_REQUIRED: '身份验证失败，请重新进入小程序',
  ENV_MISMATCH: '服务环境不匹配，请联系维护人员',
  APP_MISMATCH: '服务身份不匹配，请联系维护人员'
};
function createError(code, requestId = '') {
  const safeCode = Object.prototype.hasOwnProperty.call(messages, code) ? code : 'CLOUD_CALL_FAILED';
  const error = new Error(messages[safeCode]);
  error.code = safeCode;
  error.requestId = /^[a-zA-Z0-9-]{1,80}$/.test(requestId) ? requestId : '';
  return error;
}
module.exports = { createError };
