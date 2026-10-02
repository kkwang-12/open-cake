'use strict';
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
let config, products = [], selectedSize = 0, selectedFlavor = 0, busy = false, revision = 0, orderFilter = 'all';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yuan = cents => `¥${(cents / 100).toFixed(2)}`;
const path = () => (location.hash.slice(1) || '/').split('/').filter(Boolean);
const isStaff = () => path()[0] === 'admin';
const activeStates = ['WAIT_CONFIRM', 'WAIT_DEPOSIT', 'RESERVED', 'MAKING', 'READY', 'DELIVERING'];
const icons = {
 cake: '<path d="M5 11h14v9H5zM4 15c2-3 4 3 6 0s4 3 6 0 4 0 4 0M8 11V7m4 4V6m4 5V7M8 4v1m4-3v1m4 1v1"/>',
 home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>', order: '<path d="M6 3h12v18H6zM9 8h6m-6 4h6m-6 4h4"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>', heart: '<path d="M12 21S2 15 2 8a5 5 0 0 1 10-1A5 5 0 0 1 22 8c0 7-10 13-10 13z"/>', box: '<path d="M3 8h18v13H3zM2 4h20v4H2zm10 0v17"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.cake}</svg>`;
const art = theme => `<div class="cake-art ${esc(theme)}" aria-hidden="true"><div class="cake-shadow"></div><div class="cake-plate"></div><div class="cake-body"></div><div class="cake-top"></div>${[1,2,3,4,5,6].map(n=>`<div class="cream-dot d${n}"></div>`).join('')}${[1,2,3].map(n=>`<div class="fruit f${n}"></div>`).join('')}</div>`;
const tomorrow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(new Date(config.serverTime).getTime() + 86400000));
const row = (label, value) => `<div class="data-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
const field = (label, name, value = '', options = {}) => `<div class="field ${options.full ? 'span2' : ''}"><label for="${name}">${esc(label)}</label>${options.textarea ? `<textarea id="${name}" name="${name}" maxlength="${options.max || 200}" ${options.required ? 'required' : ''}>${esc(value)}</textarea>` : `<input id="${name}" name="${name}" type="${options.type || 'text'}" value="${esc(value)}" ${options.required ? 'required' : ''} ${options.max ? `maxlength="${options.max}"` : ''} ${options.type === 'time' && name === 'time' ? `min="${esc(config.shop.openTime)}" max="${esc(config.shop.closeTime)}"` : ''} ${options.type === 'date' ? `min="${new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Hong_Kong'}).format(new Date(config.serverTime))}"` : ''}>`}</div>`;
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3500); }
async function request(url, method = 'GET', data, role = isStaff() ? 'staff' : 'customer') {
  const token = localStorage.getItem(`jjl_${role}`);
  const response = await fetch(`/api${url}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error); error.status = response.status; throw error; }
  return result;
}
async function ensureCustomer() {
  if (localStorage.getItem('jjl_customer')) { try { await request('/me', 'GET', undefined, 'customer'); return; } catch (e) { if (e.status !== 401) throw e; } }
  const session = await request('/session', 'POST', {}, 'customer'); localStorage.setItem('jjl_customer', session.token);
}
function shell(content) {
  const current = path()[0] || 'home'; const staff = isStaff();
  const links = staff ? [['/admin','order','订单管理'],['/admin/products','cake','商品管理'],['/admin/settings','clock','门店设置'],['/','user','返回客户页']] : [['/','home','挑选蛋糕'],['/orders','order','我的订单'],['/me','user','门店与我的']];
  app.innerHTML = `<div class="shell"><aside class="sidebar"><a class="brand" href="#/"><div class="brand-mark">${icon('cake')}</div><div class="brand-name">家家乐蛋糕店</div><div class="brand-en">JIAJIALE · BAKERY</div></a><nav class="navigation">${links.map(([url, image, title])=>`<a class="nav-link ${(staff ? (url === '/admin' ? path().length === 1 || path()[1] === 'order' : location.hash === '#'+url) : (url === '/' ? ['home','product','checkout'].includes(current) : url === '/orders' ? ['orders','order'].includes(current) : current === 'me')) ? 'active' : ''}" href="#${url}">${icon(image)}<span>${title}</span></a>`).join('')}</nav><div class="sidebar-footer">每一天，都值得一点甜<div class="hours">${esc(config.shop.openTime)} — ${esc(config.shop.closeTime)}</div>自取 · 免费配送 · 提前预订<div class="footer-brand">BAKED WITH LOVE</div></div></aside><main class="main"><header class="topbar"><span class="crumb">${staff ? '门店工作台 / 演示环境' : '家家乐 / 手作蛋糕与温柔心意'}</span><a class="mobile-brand" href="#/">家家乐蛋糕店</a><div class="page-controls"><span class="tag">${staff ? '店员管理' : '每日 '+esc(config.shop.openTime)+'–'+esc(config.shop.closeTime)}</span><button class="top-link" data-action="${staff ? 'staff-exit' : 'staff-login'}">${staff ? '退出店员' : '店员入口'}</button></div></header>${content}</main></div>`;
}
function home() {
  const available = products.filter(p=>p.onSale);
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow">A LITTLE SWEETNESS, EVERY DAY</div><h1>把心意做成蛋糕，<br>把今天过得甜一点。</h1><p>为生日、相聚，和每一个想要庆祝的日子。<br>在家家乐，预订属于你的那份甜。</p><a class="btn" href="#cakes" data-action="browse">挑选一份甜蜜 ${icon('arrow')}</a></div><div class="hero-art">${art('berry')}</div><div class="hero-caption">HANDCRAFTED WITH LOVE</div></section><div class="service-strip"><div class="service">${icon('cake')}店内款式 · 随心选配</div><div class="service">${icon('clock')}确认档期 · 安心预订</div><div class="service">${icon('box')}到店自取 · 免费配送</div></div><section id="cakes"><div class="section-heading"><div><h2>为你准备的甜</h2><p>选一个喜欢的款式，把祝福一起带走</p></div><span class="tag">${available.length} 款示例蛋糕</span></div>${available.length ? `<div class="product-grid">${available.map(p=>`<a class="product-card ${esc(p.theme)}" href="#/product/${esc(p.id)}"><div class="art-wrap"><span class="badge">${esc(p.badge)}</span>${art(p.theme)}</div><div class="product-content"><h3>${esc(p.name)}</h3><p>${esc(p.subtitle)}</p><div class="product-bottom"><div class="price">¥${Math.min(...p.sizes.map(s=>s.priceCents))/100}<small>起</small></div><span class="round-button">＋</span></div></div></a>`).join('')}</div>` : empty('暂时没有上架的蛋糕','店员正在准备商品，请稍后再来。')}</section><div class="bottom-note"><span>先提交预订，店员确认后再付 30% 定金</span><span>蛋糕插画、规格与价格均为演示资料</span></div>`;
}
function empty(title, description, action = '') { return `<div class="empty">${icon('cake')}<h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`; }
function productPage(p) {
  if (!p || !p.onSale) return empty('这款蛋糕暂时不在售','返回首页看看其他款式。','<a href="#/" class="btn">挑选蛋糕</a>');
  selectedSize = Math.min(selectedSize, p.sizes.length-1); selectedFlavor = Math.min(selectedFlavor, p.flavors.length-1);
  return `<a class="back" href="#/">← 返回挑选蛋糕</a><div class="detail-layout"><div class="detail-image">${art(p.theme)}</div><section class="detail-info"><div class="eyebrow">A CAKE FOR YOUR SPECIAL DAY</div><h1>${esc(p.name)}</h1><p>${esc(p.description)}</p><div class="field"><span class="field-label">选择尺寸</span><div class="choices">${p.sizes.map((s,i)=>`<button class="choice ${i===selectedSize?'selected':''}" data-action="size" data-index="${i}">${esc(s.name)}</button>`).join('')}</div></div><div class="field"><span class="field-label">选择口味</span><div class="choices">${p.flavors.map((f,i)=>`<button class="choice ${i===selectedFlavor?'selected':''}" data-action="flavor" data-index="${i}">${esc(f)}</button>`).join('')}</div></div><div class="amount-row"><span class="muted">蛋糕价格</span><strong class="price">${yuan(p.sizes[selectedSize].priceCents)}</strong></div><div class="info-note">先提交预订，店员确认档期与交付安排后，再支付 30% 定金。配送暂不收费。</div><a class="btn full" href="#/checkout/${esc(p.id)}?size=${selectedSize}&flavor=${selectedFlavor}">预订这款蛋糕</a></section></div>`;
}
function checkout(p) {
  if (!p?.onSale) return empty('商品已下架','请重新选择蛋糕。','<a class="btn" href="#/">返回首页</a>');
  const query = new URLSearchParams(location.hash.split('?')[1]);
  const sizeIndex = Number(query.get('size') || 0), flavorIndex = Number(query.get('flavor') || 0);
  const size = p.sizes[sizeIndex], flavor = p.flavors[flavorIndex];
  if (!size || !flavor) return empty('规格已变化','请返回商品页重新选择。',`<a class="btn" href="#/product/${esc(p.id)}">重新选择</a>`);
  const amount = size.priceCents, deposit = Math.round(amount * .3);
  return `<a class="back" href="#/product/${esc(p.id)}">← 返回蛋糕详情</a><div class="page-title"><h1>留下一份甜蜜预订</h1><p>提交后由店员确认，现在无需付款。</p></div><form id="checkout-form" data-product="${esc(p.id)}" data-size="${esc(size.name)}" data-flavor="${esc(flavor)}"><div class="checkout-layout"><section class="panel"><h3>联系与交付</h3><div class="form-grid">${field('联系人','contactName','',{required:true,max:30})}${field('手机号','phone','',{required:true,type:'tel',max:20})}<div class="field span2"><label for="fulfillment">交付方式</label><select name="fulfillment" id="fulfillment"><option value="pickup">到店自取</option><option value="delivery">免费配送（店员确认范围）</option></select></div><div class="field span2" id="address-field" hidden><label for="address">配送地址</label><textarea name="address" id="address" maxlength="200"></textarea></div>${field('期望交付日期','date',tomorrow(),{type:'date',required:true})}${field('期望交付时间','time','14:00',{type:'time',required:true})}${field('蛋糕祝福语（选填）','message','',{full:true,max:60})}${field('其他备注（选填）','note','',{full:true,textarea:true,max:200})}</div><p class="small muted">可选交付时间：${esc(config.shop.openTime)}–${esc(config.shop.closeTime)}；具体时间需店员确认。</p></section><aside class="panel"><h3>你的蛋糕</h3><div class="summary-item"><div class="summary-art">${art(p.theme)}</div><div><div class="summary-title">${esc(p.name)}</div><div class="summary-meta">${esc(size.name)} / ${esc(flavor)}</div></div></div><div class="amount-row"><span>蛋糕金额</span><span>${yuan(amount)}</span></div><div class="amount-row"><span>配送费</span><span>免费</span></div><div class="amount-row emphasis"><span>确认后付定金 · 30%</span><strong>${yuan(deposit)}</strong></div><div class="amount-row muted"><span>交付时付尾款</span><span>${yuan(amount-deposit)}</span></div><div class="info-note">${esc(config.shop.afterSalesPolicy)}</div><div class="form-error" role="alert"></div><button class="btn full" type="submit">提交预订</button></aside></div></form>`;
}
function orderCard(o, staff) {
  return `<article class="order-card"><div class="order-top"><span>${esc(o.number)}</span><span class="status ${o.status}">${esc(o.statusLabel)}${o.request ? ' · 售后待审核' : ''}</span></div><div class="order-body"><div class="summary-art">${art(o.product.theme)}</div><div><h3>${esc(o.product.name)}</h3><p>${esc(o.product.size)} / ${esc(o.product.flavor)}</p><p>${esc(o.date)} ${esc(o.time)} · ${o.fulfillment==='pickup'?'到店自取':'免费配送'}${staff ? ' · '+esc(o.contactName) : ''}</p></div></div><div class="order-bottom"><span class="small muted">总额 <strong class="price">${yuan(o.totalCents)}</strong> · 已付 ${yuan(o.paidCents)}</span><a class="btn outline small-btn" href="#/${staff?'admin/order':'order'}/${o.id}">${staff?'处理订单':'查看订单'}</a></div></article>`;
}
async function ordersPage(staff) {
  const orders = await request('/orders');
  let heading = `<div class="page-title"><h1>${staff?'门店订单工作台':'我的甜蜜预订'}</h1><p>${staff?'确认档期、安排制作，把每一份心意按时送达。':'每一份预订的进度，都在这里。'}</p></div>`;
  let visible = orders;
  if (staff) {
    const counts = [orders.filter(o=>o.status==='WAIT_CONFIRM').length,orders.filter(o=>o.status==='WAIT_DEPOSIT').length,orders.filter(o=>['RESERVED','MAKING','READY','DELIVERING'].includes(o.status)).length,orders.filter(o=>o.request).length];
    heading += `<div class="metrics">${['待确认','待付定金','制作与交付','售后待审核'].map((label,i)=>`<div class="metric"><span>${label}</span><strong>${counts[i]}</strong></div>`).join('')}</div><div class="staff-toolbar"><a class="btn outline" href="#/admin/products">管理商品</a><a class="btn outline" href="#/admin/settings">门店设置</a><button class="btn outline" data-action="notifications">消息提醒</button><button class="btn light" data-action="refresh">刷新订单</button></div><div class="filters">${[['all','全部'],['pending','待确认'],['active','制作与交付'],['requests','售后申请'],['closed','已结束']].map(([id,label])=>`<button class="choice ${orderFilter===id?'selected':''}" data-action="filter" data-filter="${id}">${label}</button>`).join('')}</div>`;
    visible = orders.filter(o=> orderFilter==='all' || (orderFilter==='pending'&&o.status==='WAIT_CONFIRM') || (orderFilter==='active'&&['WAIT_DEPOSIT','RESERVED','MAKING','READY','DELIVERING'].includes(o.status)) || (orderFilter==='requests'&&o.request) || (orderFilter==='closed'&&!activeStates.includes(o.status)));
  }
  return heading + (visible.length ? `<div class="order-list">${visible.map(o=>orderCard(o,staff)).join('')}</div>` : empty(staff?'暂无待处理订单':'还没有预订呢',staff?'客户提交预订后，订单会显示在这里。':'挑一份喜欢的蛋糕，为下一次庆祝做好准备。',staff?'':'<a href="#/" class="btn">去挑选蛋糕</a>'));
}
async function orderPage(id, staff) {
  const o = await request(`/orders/${id}`); const pending = !!o.request;
  let actions = '';
  const button = (label, action, extra='', cls='')=>`<button class="btn ${cls}" data-action="${action}" data-id="${o.id}" ${extra}>${label}</button>`;
  if (staff && !pending) {
    if (o.status==='WAIT_CONFIRM') actions += button('确认接单','confirm')+button('无法接单','reject','','outline');
    if (o.status==='RESERVED') actions += button('开始制作','progress','data-next="MAKING"');
    if (o.status==='MAKING') actions += button('制作完成','progress','data-next="READY"');
    if (o.status==='READY'&&o.fulfillment==='delivery') actions += button('开始配送','progress','data-next="DELIVERING"');
    if (['READY','DELIVERING'].includes(o.status)&&o.balanceDueCents>0) actions += button('登记线下尾款','offline','','light');
    if (['READY','DELIVERING'].includes(o.status)&&o.balanceDueCents===0) actions += button('确认交付完成','progress','data-next="COMPLETED"');
  }
  if (!staff && !pending) {
    if (o.status==='WAIT_DEPOSIT') actions += button(`付定金 ${yuan(o.depositCents)}`,'pay','data-stage="deposit"');
    if (['READY','DELIVERING'].includes(o.status)&&o.balanceDueCents>0) actions += button(`付尾款 ${yuan(o.balanceDueCents)}`,'pay','data-stage="balance"');
    if (activeStates.includes(o.status)) actions += button('申请取消或改期','request','','outline');
  }
  const refunds = o.refunds.map(r=>`<div class="info-note">退款 ${yuan(r.amountCents)} · ${{PENDING:'待执行',SUCCEEDED:'模拟退款成功',FAILED:'退款失败，可重试'}[r.status]}${staff&&r.status!=='SUCCEEDED'?`<div class="actions"><button class="btn light" data-action="refund" data-id="${r.id}" data-success="true">模拟退款成功</button><button class="btn outline" data-action="refund" data-id="${r.id}" data-success="false">模拟失败</button></div>`:''}</div>`).join('');
  return `<a class="back" href="#/${staff?'admin':'orders'}">← 返回订单列表</a><div class="detail-columns"><div><section class="panel order-status-panel"><h2>${esc(o.statusLabel)}</h2><p>${esc(o.number)}${pending?' · 有待审核申请，处理前暂缓订单操作':''}</p><div class="actions">${actions}</div></section><section class="panel"><h3>蛋糕与交付</h3>${row('蛋糕',o.product.name+' / '+o.product.size+' / '+o.product.flavor)}${row('祝福语',o.message||'无')}${row('交付方式',o.fulfillment==='pickup'?'到店自取':'免费配送')}${row('交付时间',o.date+' '+o.time)}${row('联系人',o.contactName+' · '+o.phone)}${row('地址',o.fulfillment==='delivery'?o.address:(config.shop.address||'门店地址待补充'))}${row('备注',o.note||'无')}</section>${pending?`<section class="panel"><h3>${o.request.type==='cancel'?'取消':'改期'}申请 · 待审核</h3>${row('原因',o.request.reason)}${o.request.type==='reschedule'?row('期望时间',o.request.date+' '+o.request.time):''}${staff?`<button class="btn" data-action="review" data-id="${o.id}" data-type="${o.request.type}" data-max="${o.depositPaidCents+(o.balanceMethod==='online'?o.balancePaidCents:0)-o.refundedCents}">审核申请</button>`:'<p class="small muted">店员审核后会更新结果，当前订单尚未取消或改期。</p>'}</section>`:''}</div><aside><section class="panel"><h3>收款明细</h3>${row('订单总额',yuan(o.totalCents))}${row('定金 30%',yuan(o.depositCents)+(o.depositPaidCents?' · 已付':' · 待付'))}${row('尾款',yuan(o.totalCents-o.depositCents)+(o.balancePaidCents?' · 已付':' · 待付'))}${row('收款方式',o.balanceMethod?({online:'小程序模拟支付',cash:'现金',store_qr:'门店收款码'}[o.balanceMethod]):'尚未收尾款')}${row('已退款',yuan(o.refundedCents))}${refunds}</section><section class="panel"><h3>订单记录</h3><div class="timeline">${o.history.slice().reverse().map(h=>`<div class="timeline-item">${esc(h.message)}<time>${esc(new Date(h.at).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false}))}</time></div>`).join('')}</div></section></aside></div>`;
}
function mePage() { return `<div class="page-title"><h1>每一天，都值得一点甜</h1><p>家家乐蛋糕店 · 把心意做成蛋糕</p></div><section class="panel"><h3>门店信息</h3>${row('营业时间',config.shop.openTime+'–'+config.shop.closeTime)}${row('门店地址',config.shop.address||'待补充')}${row('联系电话',config.shop.phone||'待补充')}${row('配送服务','暂不收费，配送范围由店员逐单确认')}<div class="actions"><a class="btn" href="#/orders">查看我的订单</a>${config.shop.phone?`<a class="btn outline" href="tel:${esc(config.shop.phone)}">联系门店</a>`:''}</div></section><section class="panel"><h3>预订与售后</h3><p class="small muted">${esc(config.shop.afterSalesPolicy)}</p><p class="small muted">提交预订后，店员确认时间和交付安排，再支付 30% 定金。尾款在交付时支付。</p></section>`; }
function productsPage() { return `<div class="page-title"><h1>商品管理</h1><p>规格价格变更仅影响新订单，已有订单保留原价格。</p></div><div class="product-grid">${products.map(p=>`<article class="product-card ${esc(p.theme)}"><div class="art-wrap"><span class="badge">${p.onSale?'在售':'已下架'}</span>${art(p.theme)}</div><div class="product-content"><h3>${esc(p.name)}</h3><p>${p.sizes.map(s=>esc(s.name)+' '+yuan(s.priceCents)).join(' / ')}</p><button class="btn outline full" data-action="edit-product" data-id="${esc(p.id)}">编辑商品与上下架</button></div></article>`).join('')}</div>`; }
function settingsPage() { const s=config.shop; return `<div class="page-title"><h1>门店设置</h1><p>未确定的地址和电话可以留空，客户端会显示“待补充”。</p></div><form id="settings-form" class="panel"><div class="form-grid">${field('开始营业','openTime',s.openTime,{type:'time',required:true})}${field('结束营业','closeTime',s.closeTime,{type:'time',required:true})}${field('门店地址','address',s.address,{full:true,max:200})}${field('联系电话','phone',s.phone,{full:true,max:30})}${field('售后规则','afterSalesPolicy',s.afterSalesPolicy,{full:true,textarea:true,max:500,required:true})}</div><div class="info-note">定金固定为 30%，配送费为 0；首版由店员逐单确认档期及配送范围。</div><div class="form-error" role="alert"></div><button class="btn" type="submit">保存门店设置</button></form>`; }
async function render() {
  const serial=++revision; const route=path(); const staff=isStaff();
  try {
    config=await request('/config','GET',undefined,'customer');
    await ensureCustomer();
    if (staff&&!localStorage.getItem('jjl_staff')) { shell(empty('请先登录店员工作台','管理入口仅向获授权的店员开放。','<button class="btn" data-action="staff-login">店员登录</button>')); return; }
    products=await request('/products');
    let content;
    if (staff) content=route[1]==='order'?await orderPage(route[2],true):route[1]==='products'?productsPage():route[1]==='settings'?settingsPage():await ordersPage(true);
    else if (route[0]==='product') content=productPage(products.find(p=>p.id===route[1]));
    else if (route[0]==='checkout') content=checkout(products.find(p=>p.id===route[1].split('?')[0]));
    else if (route[0]==='orders') content=await ordersPage(false);
    else if (route[0]==='order') content=await orderPage(route[1],false);
    else if (route[0]==='me') content=mePage();
    else content=home();
    if(serial===revision) shell(content);
  } catch(e) {
    if(e.status===401&&staff){localStorage.removeItem('jjl_staff'); return render();}
    if(config) shell(`<div class="error">${esc(e.message)}</div><button class="btn" data-action="refresh">重试</button>`);
    else app.innerHTML=`<div class="loading">${esc(e.message)}<p>请确认演示服务正在运行。</p><button class="btn" data-action="refresh">重试</button></div>`;
  }
}
function modal(title, content, formId, data = {}) { dialog.innerHTML=`<h2>${esc(title)}</h2><form id="${formId}" ${Object.entries(data).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${content}<div class="form-error" role="alert"></div><div class="actions"><button type="button" class="btn outline" data-action="close">返回</button><button type="submit" class="btn">确认</button></div></form>`; dialog.showModal(); }
document.addEventListener('change', event=>{ if(event.target.id==='fulfillment'){const delivery=event.target.value==='delivery';document.querySelector('#address-field').hidden=!delivery;document.querySelector('#address').required=delivery;} if(event.target.id==='request-type'){document.querySelector('#reschedule-fields').hidden=event.target.value!=='reschedule';} });
document.addEventListener('click',async event=>{
  const element=event.target.closest('[data-action]'); if(!element||busy)return; const a=element.dataset.action,id=element.dataset.id;
  if(a==='browse'){event.preventDefault();document.querySelector('#cakes').scrollIntoView({behavior:'smooth'});return;}
  if(a==='close'){dialog.close();return;}
  if(a==='size'||a==='flavor'){if(a==='size')selectedSize=Number(element.dataset.index);else selectedFlavor=Number(element.dataset.index);shell(productPage(products.find(p=>p.id===path()[1])));return;}
  if(a==='filter'){orderFilter=element.dataset.filter;return render();}
  if(a==='staff-login'){modal('店员工作台',`<p>默认演示口令为 246810；若管理员已修改，请使用新口令。这是演示登录，不代表正式微信身份授权。</p>${field('店员演示口令','pin','',{type:'password',required:true,max:32})}`,'staff-login-form');return;}
  if(a==='reject'){modal('无法接单',field('告诉客户原因','reason','',{textarea:true,required:true}),'reject-form',{id});return;}
  if(a==='request'){modal('申请取消或改期',`<div class="field"><label for="request-type">申请类型</label><select id="request-type" name="type"><option value="cancel">申请取消</option><option value="reschedule">申请改期</option></select></div>${field('申请原因','reason','',{textarea:true,required:true})}<div id="reschedule-fields" hidden>${field('新交付日期','date',tomorrow(),{type:'date'})}${field('新交付时间','time','14:00',{type:'time'})}</div><p>提交申请后，需店员审核；当前订单不会自动取消或改期。</p>`,'request-form',{id});return;}
  if(a==='review'){modal('审核售后申请',`<div class="field"><label for="approved">审核结果</label><select name="approved" id="approved"><option value="true">同意申请</option><option value="false">拒绝申请</option></select></div>${element.dataset.type==='cancel'?field('退款金额（元，可填0；线上可退 '+yuan(Number(element.dataset.max))+'）','refund','0',{type:'number'}):''}${field('审核说明（拒绝时必填）','response','',{textarea:true})}<p>线下尾款如需退款，请与客户沟通并线下处理。线上退款在演示版中需单独模拟执行。</p>`,'review-form',{id});return;}
  if(a==='offline'){modal('登记线下尾款',`<p>请确认已实际收到尾款，登记后不能重复收款。</p><div class="field"><label for="method">收款方式</label><select name="method" id="method"><option value="cash">现金</option><option value="store_qr">门店收款码</option></select></div>`,'offline-form',{id});return;}
  if(a==='edit-product'){const p=products.find(p=>p.id===id);modal('编辑蛋糕',`${field('商品名称','name',p.name,{required:true,max:40})}${field('副标题','subtitle',p.subtitle,{max:60})}${field('商品描述','description',p.description,{textarea:true,max:500})}${field('规格与价格，每行“规格:元”','sizes',p.sizes.map(s=>s.name+':'+s.priceCents/100).join('\n'),{textarea:true,required:true})}${field('口味，每行一种','flavors',p.flavors.join('\n'),{textarea:true,required:true})}<label><input name="onSale" type="checkbox" ${p.onSale?'checked':''}> 上架销售</label>`,'product-form',{id});return;}
  busy=true;element.disabled=true;
  try{
    if(a==='refresh')await render();
    if(a==='staff-exit'){await request('/logout','POST',{},'staff');localStorage.removeItem('jjl_staff');location.hash='/';}
    if(a==='confirm'){await request(`/orders/${id}/confirm`,'POST',{accepted:true});toast('已确认接单，等待客户付定金');await render();}
    if(a==='progress'){await request(`/orders/${id}/progress`,'POST',{status:element.dataset.next});toast('订单进度已更新');await render();}
    if(a==='pay'){const p=await request(`/orders/${id}/payments`,'POST',{stage:element.dataset.stage});modal('模拟付款',`<p>应付 ${yuan(p.amountCents)}。本次操作不调用微信支付，也不会产生扣款。</p><div class="field"><label for="result">模拟结果</label><select id="result" name="success"><option value="true">支付成功</option><option value="false">支付失败（可重试）</option></select></div>`,'pay-form',{id:p.id});}
    if(a==='refund'){await request(`/refunds/${id}/simulate`,'POST',{success:element.dataset.success==='true'});toast('模拟退款结果已记录');await render();}
    if(a==='notifications'){const notifications=await request('/notifications');await request('/notifications/read','POST',{});modal('演示消息提醒',`<p>此处展示提醒效果，不发送真实手机消息。</p>${notifications.length?notifications.slice(0,20).map(n=>`<div class="notification"><a href="#/admin/order/${n.orderId}" data-action="close">${esc(n.title)}</a><span class="small muted">${esc(new Date(n.at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Hong_Kong'}))}</span></div>`).join(''):'<p>还没有提醒。</p>'}`,'notice-form');}
  }catch(e){toast(e.message);}finally{busy=false;element.disabled=false;}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.id)return;event.preventDefault();if(busy)return;busy=true;
  const submit=form.querySelector('button[type=submit]');submit.disabled=true;const data=Object.fromEntries(new FormData(form));const errorBox=form.querySelector('.form-error');errorBox.textContent='';
  try{
    const id=form.dataset.id;
    if(form.id==='checkout-form'){const o=await request('/orders','POST',{...data,productId:form.dataset.product,size:form.dataset.size,flavor:form.dataset.flavor});toast('预订已提交，等待店员确认');location.hash='/order/'+o.id;}
    else if(form.id==='staff-login-form'){const s=await request('/staff/login','POST',data,'staff');localStorage.setItem('jjl_staff',s.token);dialog.close();if(isStaff())await render();else location.hash='/admin';}
    else if(form.id==='settings-form'){await request('/settings','PUT',data);toast('门店设置已保存');await render();}
    else{
      if(form.id==='reject-form')await request(`/orders/${id}/confirm`,'POST',{accepted:false,reason:data.reason});
      if(form.id==='request-form')await request(`/orders/${id}/requests`,'POST',data);
      if(form.id==='review-form')await request(`/orders/${id}/review`,'POST',{approved:data.approved==='true',response:data.response,refundCents:Math.round(Number(data.refund||0)*100)});
      if(form.id==='offline-form')await request(`/orders/${id}/offline-balance`,'POST',data);
      if(form.id==='pay-form')await request(`/payments/${id}/simulate`,'POST',{success:data.success==='true'});
      if(form.id==='product-form'){const sizes=data.sizes.split('\n').filter(x=>x.trim()).map(line=>{const values=line.split(/[:：]/);if(values.length!==2||!/^\d+(\.\d{1,2})?$/.test(values[1].trim()))throw new Error('规格格式应为“6寸:200”，价格最多两位小数');return{name:values[0].trim(),priceCents:Math.round(Number(values[1])*100)};});await request(`/products/${id}`,'PUT',{name:data.name,subtitle:data.subtitle,description:data.description,sizes,flavors:data.flavors.split('\n').filter(x=>x.trim()),onSale:data.onSale==='on'});}
      dialog.close();if(form.id!=='notice-form'){toast('操作已保存');await render();}
    }
  }catch(e){errorBox.textContent=e.message;}finally{busy=false;submit.disabled=false;}
});
window.addEventListener('hashchange',()=>{selectedSize=0;selectedFlavor=0;window.scrollTo(0,0);render();});
setInterval(()=>{const route=path();if(!busy&&!dialog.open&&document.visibilityState==='visible'&&(route[0]==='orders'||route[0]==='order'||(route[0]==='admin'&&(route.length===1||route[1]==='order'))))render();},12000);
render();
