'use strict';
// Target API schema preparation only. This module does not dispatch or authorize.
const { canonicalJSON } = require('./idempotency-model');
const contracts = {};
function define(domain, action, access, fields, output, mutation = false, sortId = null, status = 'PLANNED') {
  const input = Object.fromEntries(fields.split(' ').filter(Boolean).map(field => {
    const [name, type] = field.split(':');
    return [name.replace(/\?$/, ''), Object.freeze({ type, required: !name.endsWith('?') })];
  }));
  if (mutation) input.idempotencyKey = Object.freeze({ type: 'key', required: true });
  if (sortId) {
    input.pageSize = Object.freeze({ type: 'pageSize', required: false });
    input.cursor = Object.freeze({ type: 'cursor', required: false });
  }
  contracts[domain + '.' + action] = Object.freeze({
    domain, action, access, input: Object.freeze(input), output,
    mutation, idempotency: mutation ? 'REQUIRED_SCOPED_KEY' : 'NONE',
    sortId, status
  });
}
// me has no business-command key: its first-user provisioning is keyed by the
// trusted native tuple. `mutation` below denotes explicit keyed commands only.
define('user','me','PLATFORM','','IdentitySummary',false,null,'DEVELOPMENT_SIMULATOR_VERIFIED_DEVICE_PENDING');
define('store','health','PLATFORM','','Health',false,null,'DEVELOPMENT_SIMULATOR_VERIFIED_DEVICE_PENDING');
define('user','bootstrap','PLATFORM','','Profile',true);
define('user','profile.get','OWNER','','Profile');
define('user','profile.update','OWNER','expectedVersion:counter displayName:text avatarAssetId?:nullableId','Profile',true);
define('user','consent.accept','OWNER','expectedVersion:counter policyVersion:id','Profile',true);
define('user','favorites.list','OWNER','','FavoritePage',false,'CREATED_DESC');
define('user','favorite.set','OWNER','productId:id enabled:boolean','FavoriteState',true);
define('catalog','categories.list','PLATFORM','','CategoryList');
define('catalog','products.list','PLATFORM','storeId:id categoryCode?:category search?:search','ProductPage',false,'CATALOG');
define('catalog','product.get','PLATFORM','productId:id','ProductDetail');
define('cart','get','OWNER','storeId:id','Cart');
define('cart','add','OWNER','storeId:id expectedVersion:counter productId:id skuId:id selectedOptions:selection quantity:positive cakeMessage?:message','Cart',true);
define('cart','update','OWNER','cartId:id expectedVersion:counter lineId:id expectedLineVersion:counter skuId:id selectedOptions:selection quantity:positive cakeMessage?:message','Cart',true);
define('cart','remove','OWNER','cartId:id expectedVersion:counter lineId:id expectedLineVersion:counter','Cart',true);
define('address','list','OWNER','','AddressPage',false,'UPDATED_DESC');
define('address','get','OWNER','addressId:id','Address');
define('address','create','OWNER','address:address','Address',true);
define('address','update','OWNER','addressId:id expectedVersion:counter address:address','Address',true);
define('address','remove','OWNER','addressId:id expectedVersion:counter expectedUserVersion:counter','Removal',true);
define('address','setDefault','OWNER','addressId:id expectedVersion:counter expectedUserVersion:counter','Profile',true);
define('store','get','PLATFORM','storeId:id','Store');
define('store','slots.list','PLATFORM','storeId:id fulfillment:fulfillment serviceDate:date productIds:ids','SlotList');
define('checkout','quote.create','OWNER','cartId:id expectedCartVersion:counter lines:lines fulfillment:fulfillment contact:contact addressId?:nullableId slotId:id orderNote?:message','Quote',true);
define('checkout','quote.get','OWNER','quoteId:id','Quote');
define('order','create','OWNER','quoteId:id expectedQuoteVersion:counter','CommandResult',true);
define('order','list','OWNER','status?:orderStatus view?:orderView','OrderPage',false,'CREATED_DESC');
define('order','get','OWNER','orderId:id','Order');
define('order','cancelUnpaid','OWNER','orderId:id expectedVersion:counter reason:text','CommandResult',true);
define('order','cancellation.request','OWNER','orderId:id expectedVersion:counter reason:text','CommandResult',true);
define('order','delivery.confirm','OWNER','orderId:id expectedVersion:counter','CommandResult',true);
define('order','pickupCredential.get','OWNER','orderId:id','PickupCredential');
define('payment','create','OWNER','orderId:id expectedVersion:counter','PaymentSession',true);
define('payment','state.get','OWNER','orderId:id','PaymentState');
define('admin','orders.list','ORDER_OPERATE','storeId:id status?:orderStatus','MerchantOrderPage',false,'CREATED_DESC');
define('admin','order.get','ORDER_OPERATE','orderId:id','MerchantOrder');
define('admin','order.transition','CONDITIONAL_REFUND','orderId:id expectedVersion:counter command:storeCommand pickupCredential?:id reason?:text','CommandResult',true);
define('admin','cancellation.review','CONDITIONAL_REFUND','orderId:id expectedVersion:counter reviewId:id decision:decision refundCents?:counter reason:text','CommandResult',true);
define('admin','refund.approve','REFUND_APPROVE','orderId:id expectedVersion:counter refundCents:positive reason:text','CommandResult',true);
define('admin','exceptions.list','REFUND_APPROVE','storeId:id','MerchantExceptionPage',false,'CREATED_DESC');
define('admin','refund.retry','REFUND_APPROVE','refundId:id expectedVersion:counter reason:text','CommandResult',true);
define('admin','products.list','CATALOG_WRITE','storeId:id status?:productStatus','MerchantProductPage',false,'CATALOG');
define('admin','product.save','CATALOG_WRITE','storeId:id productId?:id expectedVersion?:counter draft:json','CommandResult',true);
define('admin','product.status.set','CATALOG_WRITE','productId:id expectedVersion:counter status:productStatus reason:text','CommandResult',true);
define('admin','inventory.setTotal','CATALOG_WRITE','resourceId:id expectedVersion:counter totalUnits:counter reason:text','CommandResult',true);
define('admin','store.update','CONFIG_WRITE','storeId:id expectedVersion:counter patch:storePatch reason:text','CommandResult',true);
define('admin','config.save','CONFIG_WRITE','storeId:id configId?:id expectedVersion?:counter draft:json','CommandResult',true);
define('admin','config.publish','CONFIG_WRITE','storeId:id configId:id expectedVersion:counter expectedStoreVersion:counter','CommandResult',true);
define('admin','slot.update','CONFIG_WRITE','slotId:id expectedVersion:counter status:resourceStatus capacityTotal:positive reason:text','CommandResult',true);
define('admin','roles.list','ROLE_MANAGE','storeId:id','RolePage',false,'CREATED_DESC');
define('admin','role.grant','ROLE_MANAGE','subjectId:id storeIds:ids capabilities:capabilities reason:text','CommandResult',true);
define('admin','role.revoke','ROLE_MANAGE','roleId:id expectedVersion:counter reason:text','CommandResult',true);
define('admin','audit.list','AUDIT_READ','storeId:id','AuditPage',false,'CREATED_DESC');
define('admin','product.get','CATALOG_WRITE','productId:id','ProductDraft');
define('admin','store.get','CONFIG_WRITE','storeId:id','StoreDraft');
define('admin','config.get','CONFIG_WRITE','storeId:id configId?:id','ConfigDraft');
define('admin','configs.list','CONFIG_WRITE','storeId:id','ConfigSummaryPage',false,'CREATED_DESC');
define('admin','inventory.list','CATALOG_WRITE','storeId:id','ResourcePage',false,'CREATED_DESC');
define('admin','slots.list','CONFIG_WRITE','storeId:id fulfillment:fulfillment serviceDate:date','SlotResourceList');
define('admin','refunds.list','REFUND_APPROVE','storeId:id status?:refundStatus','RefundPage',false,'CREATED_DESC');
define('admin','refund.get','REFUND_APPROVE','refundId:id','Refund');
const ACTION_CONTRACTS = Object.freeze(contracts);
class ApiContractError extends Error {
  constructor(code) { super(code); this.name = 'ApiContractError'; this.code = code; }
}
function fail() { throw new ApiContractError('INVALID_REQUEST'); }
function plain(value) { return value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function text(value, max = 256) { return typeof value === 'string' && value.length > 0 && value === value.trim() && value.length <= max && value.isWellFormed(); }
function tuple(value, fields) {
  return plain(value) && Object.keys(value).length === Object.keys(fields).length &&
    Object.entries(fields).every(([key,type]) => Object.prototype.hasOwnProperty.call(value,key) && valid(value[key],type));
}
function array(value, validator, nonempty = true) {
  return Array.isArray(value) && (!nonempty || value.length > 0) && Object.keys(value).length === value.length && value.every(validator);
}
function valid(value, type) {
  switch (type) {
    case 'id': return text(value);
    case 'nullableId': return value === null || text(value);
    case 'text': return text(value, 2048);
    case 'search': return typeof value === 'string' && value.isWellFormed() && Array.from(value.normalize('NFC').trim()).length <= 64;
    case 'storePatch':
      return plain(value) && Object.keys(value).length > 0 && Object.keys(value).every(key =>
        ['name','address','phone','timeZone','status','mapSelectionToken'].includes(key) &&
        (key === 'status' ? ['DRAFT','OPEN','CLOSED','ARCHIVED'].includes(value[key]) : valid(value[key],'text')));
    case 'key': return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
    case 'message': return value === null || typeof value === 'string' && value.isWellFormed();
    case 'boolean': return typeof value === 'boolean';
    case 'counter': return Number.isSafeInteger(value) && value >= 0;
    case 'positive': return Number.isSafeInteger(value) && value > 0;
    case 'pageSize': return Number.isSafeInteger(value) && value >= 1 && value <= 50;
    case 'cursor': return value === null || text(value,4096);
    case 'date': return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case 'fulfillment': return ['PICKUP','DELIVERY'].includes(value);
    case 'category': return ['CAKE','MINI_CAKE','BREAD'].includes(value);
    case 'productStatus': return ['DRAFT','ON_SALE','OFF_SALE','ARCHIVED'].includes(value);
    case 'resourceStatus': return ['OPEN','CLOSED'].includes(value);
    case 'orderStatus': return ['PENDING_PAYMENT','PAID','ACCEPTED','MAKING','READY','DELIVERING','COMPLETED','CANCELLED'].includes(value);
    case 'orderView': return ['ALL','ACTIVE','CURRENT','PAST','COMPLETED','CANCELLED'].includes(value);
    case 'refundStatus': return ['PENDING','FAILED','SUCCEEDED'].includes(value);
    case 'decision': return ['APPROVE','REJECT'].includes(value);
    case 'storeCommand': return ['ACCEPT','START_MAKING','MARK_READY','START_DELIVERY','COMPLETE_PICKUP','COMPLETE_DELIVERY','REJECT_ORDER'].includes(value);
    case 'ids': return array(value,item=>valid(item,'id')) && new Set(value).size === value.length;
    case 'capabilities': return array(value,item=>['ORDER_OPERATE','REFUND_APPROVE','CATALOG_WRITE','CONFIG_WRITE','ROLE_MANAGE','AUDIT_READ'].includes(item)) && new Set(value).size === value.length;
    case 'selection': return array(value,item=>tuple(item,{groupCode:'id',optionCode:'id'}),false);
    case 'lines': return array(value,item=>tuple(item,{lineId:'id',lineVersion:'counter'})) && new Set(value.map(item=>item.lineId)).size === value.length;
    case 'contact': return tuple(value,{name:'text',phone:'text'});
    case 'address':
      return plain(value) && Object.keys(value).every(key=>['receiverName','phone','province','city','district','regionCodes','detail','mapSelectionToken'].includes(key)) &&
        ['receiverName','phone','province','city','district','detail'].every(key=>valid(value[key],'text')) &&
        Object.prototype.hasOwnProperty.call(value,'regionCodes') && tuple(value.regionCodes,{province:'nullableId',city:'nullableId',district:'nullableId'}) &&
        (value.mapSelectionToken === undefined || valid(value.mapSelectionToken,'id'));
    case 'json': return plain(value); // Admin draft still requires full D02/D03/D05 domain validation.
    default: return false;
  }
}
function getActionContract(domain, action) {
  if (typeof domain !== 'string' || typeof action !== 'string') fail();
  const key = domain + '.' + action;
  if (!Object.prototype.hasOwnProperty.call(ACTION_CONTRACTS,key)) fail();
  const contract = ACTION_CONTRACTS[key];
  if (contract.domain !== domain || contract.action !== action) fail();
  return contract;
}
function parseApiRequest(domain, event) {
  try {
    if (!plain(event) || Object.keys(event).some(key=>!['action','payload','requestId'].includes(key))) fail();
    const canonical = canonicalJSON(event);
    if (Buffer.byteLength(canonical,'utf8') > 65536) fail(); // Local API ceiling, not an SDK limit claim.
    const input = JSON.parse(canonical);
    if (input.requestId !== undefined && !text(input.requestId)) fail();
    const contract = getActionContract(domain,input.action);
    const payload = input.payload === undefined ? {} : input.payload;
    if (!plain(payload) || Object.keys(payload).some(key=>!Object.prototype.hasOwnProperty.call(contract.input,key))) fail();
    for (const [key,definition] of Object.entries(contract.input)) {
      if (!Object.prototype.hasOwnProperty.call(payload,key)) { if (definition.required) fail(); }
      else if (!valid(payload[key],definition.type)) fail();
    }
    if (domain === 'checkout' && input.action === 'quote.create' &&
        (payload.fulfillment === 'DELIVERY' ? !text(payload.addressId) : payload.addressId != null)) fail();
    if (domain === 'admin' && input.action === 'cancellation.review' &&
        (payload.decision === 'APPROVE' ? payload.refundCents === undefined : payload.refundCents !== undefined)) fail();
    if (domain === 'admin' && ['product.save','config.save'].includes(input.action)) {
      const idField = input.action === 'product.save' ? 'productId' : 'configId';
      if ((payload[idField] === undefined) !== (payload.expectedVersion === undefined)) fail();
    }
    if (contract.input.search) payload.search = payload.search === undefined ? '' : payload.search.normalize('NFC').trim();
    // Deep copy, then freeze all retained JSON. This still does not authorize or dispatch.
    const freeze = value => {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
      return value;
    };
    return freeze({ contract, payload });
  } catch (_) { fail(); }
}
const PUBLIC_MESSAGES = Object.freeze({
  INVALID_REQUEST:'请求无效', AUTH_REQUIRED:'请重新验证身份', FORBIDDEN:'无权执行此操作',
  NOT_FOUND:'内容不存在或不可访问', VERSION_CONFLICT:'内容已更新，请刷新',
  CONFIGURATION_REQUIRED:'经营配置尚未完整', PRODUCT_UNAVAILABLE:'商品暂不可购买',
  INVALID_SELECTION:'请选择有效规格', INVALID_QUANTITY:'商品数量无效', INVALID_MESSAGE:'留言无效',
  CART_LIMIT_EXCEEDED:'购物袋行数已达上限', QUOTE_EXPIRED:'报价已过期，请重新确认',
  QUOTE_CHANGED:'购买信息已变化，请重新确认', RESOURCE_UNAVAILABLE:'库存或预约名额不足',
  APPOINTMENT_UNAVAILABLE:'预约时间段不可用', LOCATION_REQUIRED:'地址位置尚未核实',
  DELIVERY_OUT_OF_RANGE:'地址超出配送范围', PAYMENT_PENDING:'付款结果确认中',
  REFUND_IN_PROGRESS:'退款仍在处理中或待核实', IDEMPOTENCY_KEY_REUSED:'重复请求参数不一致',
  BUSY:'请求仍在处理中，请稍后查询', INVALID_TRANSITION:'当前状态无法执行此操作',
  CURSOR_INVALID:'列表已变化，请重新加载', CURSOR_EXPIRED:'列表已过期，请重新加载',
  INTERNAL_ERROR:'服务暂时不可用'
});
const aliases = Object.freeze({
  USER_DISABLED:'AUTH_REQUIRED', USER_NOT_PROVISIONED:'AUTH_REQUIRED',
  APP_MISMATCH:'AUTH_REQUIRED', ENV_MISMATCH:'AUTH_REQUIRED',
  RESOURCE_VERSION_CONFLICT:'QUOTE_CHANGED', RESOURCE_SCOPE_MISMATCH:'INTERNAL_ERROR',
  SKU_UNAVAILABLE:'PRODUCT_UNAVAILABLE', SKU_SELECTION_MISMATCH:'INVALID_SELECTION',
  MESSAGE_NOT_SUPPORTED:'INVALID_MESSAGE', LINE_NOT_FOUND:'NOT_FOUND',
  INVALID_SERVICE_DATE:'INVALID_REQUEST', APPOINTMENT_OUTSIDE_WINDOW:'APPOINTMENT_UNAVAILABLE',
  SLOT_FULL_OR_CLOSED:'APPOINTMENT_UNAVAILABLE', COORDINATE_SYSTEM_UNSUPPORTED:'LOCATION_REQUIRED',
  PAYMENT_UNRESOLVED:'PAYMENT_PENDING', REFUND_AMOUNT_INVALID:'INVALID_REQUEST',
  REFUND_EXCEEDS_PAID:'INVALID_REQUEST', INVALID_PAGE_REQUEST:'INVALID_REQUEST'
});
function publicError(error) {
  const original = error && typeof error.code === 'string' ? error.code : '';
  const code = Object.prototype.hasOwnProperty.call(PUBLIC_MESSAGES,original) ? original :
    Object.prototype.hasOwnProperty.call(aliases,original) ? aliases[original] : 'INTERNAL_ERROR';
  return Object.freeze({ code, message: PUBLIC_MESSAGES[code] });
}
module.exports = { ACTION_CONTRACTS, ApiContractError, getActionContract, parseApiRequest, publicError };
