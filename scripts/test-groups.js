'use strict';
// Curated local scopes, not automatic dependency analysis or release acceptance.
const files = names => names.split(/\s+/).filter(Boolean).map(name => 'tests/' + name + '.test.js');
const groups = {
  orders: {
    description: '订单、事务、资源、幂等；关联支付与商家履约',
    primary: files('order-command-model order-creation-model order-facts order-transaction-service order-document-session order-write-budget order-recovery-service order-cancellation order-read order-pickup order-delivery cloud-document-transaction transaction-probe transaction-probe-handler transaction-read-protection transaction-write-protection trade-model resource-model idempotency-model'),
    related: files('quote-model checkout-submission-contract confirmation-session authorization-model payment-intent payment-notification refund merchant-order merchant-resolution admin-acceptance')
  },
  payments: {
    description: '支付、退款、恢复、对账；关联订单取消与商家处理',
    primary: files('payment-configuration payment-intent payment-notification payment-recovery payment-session payment-maintenance payment-acceptance refund'),
    related: files('order-cancellation order-recovery-service order-transaction-service idempotency-model authorization-model merchant-resolution admin-acceptance')
  },
  admin: {
    description: '商家权限、目录、履约、售后；关联支付与订单',
    primary: files('admin-access merchant-order pickup-session merchant-catalog merchant-store merchant-resolution admin-acceptance'),
    related: files('authorization-model order-pickup order-delivery order-cancellation refund payment-notification catalog-read-model store-fulfillment')
  },
  catalog: {
    description: '商品、规格、库存与目录链路；关联购物袋与报价',
    primary: files('catalog-model catalog-read-model catalog-cloud catalog-draft-model catalog-domain-chain specification-model stock-review media-model pagination-model shop-catalog'),
    related: files('cart-model cart-service local-bag local-favorites product-detail quote-model merchant-catalog')
  },
  checkout: {
    description: '购物袋、地址、配送、时段、报价与确认；关联订单创建',
    primary: files('cart-model cart-service local-bag bag-review checkout-selection checkout-server-selection checkout-fulfillment-page checkout-submission-contract address-service local-addresses addresses-page fulfillment-model fulfillment-draft store-fulfillment delivery-evaluation delivery-status appointment-availability quote-model confirmation-session'),
    related: files('catalog-model specification-model authorization-model resource-model order-creation-model order-transaction-service')
  },
  client: {
    description: '页面、本机持久化、交互与导航；关联客户端业务链路',
    primary: files('account-ui bag-page bag-swipe bottom-sheet custom-tab-bar home-hero home-catalog local-favorites navigation product-detail product-success-motion'),
    related: files('catalog-domain-chain local-bag local-addresses addresses-page checkout-fulfillment-page confirmation-session payment-session pickup-session cloud')
  },
  cloud: {
    description: '云客户端、身份、契约与初始化；关联权限与事务适配',
    primary: files('cloud cloud-identity-repository user-persistence-handler api-contract authorization-model native-context development-seed initialization-rejection'),
    related: files('admin-access payment-acceptance cloud-document-transaction order-document-session order-write-budget')
  },
  legacy: {
    description: '旧版演示基线；HTTP 测试需要本机回环连接',
    primary: files('domain http repository wxml'), related: []
  },
  tooling: {
    description: '本地测试编排与原生批量工具传输',
    primary: files('native-batch-transport test-orchestration'), related: []
  }
};

function validateGroups(available) {
  const known = new Set(available), owners = new Map();
  for (const [name, group] of Object.entries(groups)) {
    for (const file of [...group.primary, ...group.related]) {
      if (!known.has(file)) throw new Error('Missing grouped test: ' + file);
    }
    for (const file of group.primary) {
      if (owners.has(file)) throw new Error('Multiple primary groups for: ' + file);
      owners.set(file, name);
    }
  }
  const unassigned = available.filter(file => !owners.has(file));
  if (unassigned.length) throw new Error('Assign new tests in scripts/test-groups.js: ' + unassigned.join(', '));
}

function selectTests(args, available) {
  const chosenGroups = [], explicit = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--group') {
      const value = args[++index];
      if (!value) throw new Error('--group requires comma-separated names.');
      for (const name of value.split(',')) {
        if (!Object.hasOwn(groups, name)) throw new Error('Unknown test group: ' + name);
        chosenGroups.push(name);
      }
    } else {
      const file = arg.replace(/\\/g, '/');
      if (!available.includes(file)) throw new Error('Specify existing tests/name.test.js files or --group names; globs and external paths are not accepted.');
      explicit.push(file);
    }
  }
  if (chosenGroups.length) validateGroups(available);
  const names = [...new Set(chosenGroups)];
  const selected = args.length ? [...new Set([...explicit, ...names.flatMap(name => [...groups[name].primary, ...groups[name].related])])].sort() : [...available].sort();
  if (!selected.length) throw new Error('No local tests selected.');
  // Completeness describes the actual set, including combined groups/explicit files.
  return {files: selected, groups: names, complete: selected.length === new Set(available).size};
}

module.exports = {groups, validateGroups, selectTests};
