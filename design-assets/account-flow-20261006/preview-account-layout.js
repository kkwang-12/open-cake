'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'miniprogram');
let account;
vm.runInNewContext(fs.readFileSync(path.join(app, 'pages/account/account.js'), 'utf8'), {
  require() { return {}; }, Page(value) { account = value; }
});
const dataUrl = value => {
  const filename = path.join(app, value.replace(/^\//, ''));
  const mime = filename.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
  return 'data:' + mime + ';base64,' + fs.readFileSync(filename).toString('base64');
};
const rpx = css => css.replace(/(-?[\d.]+)rpx/g, (_, value) => Number(value) / 7.5 + 'vw');
let markup = fs.readFileSync(path.join(app, 'pages/account/account.wxml'), 'utf8');
markup = markup.replace(/<button wx:for="[\s\S]+?<\/button>/, block => account.data.menus.map(item =>
  block.replace(/{{item\.(\w+)}}/g, (_, key) => item[key])).join(''));
markup = markup.replace(/{{(\w+)}}/g, (_, key) => ({
  topInset: 44, navHeight: 44, capsuleWidth: 104, addressCount: 0, tabMotion: ''
}[key] ?? ''));
markup = markup.replace(/\s(?:wx:[\w-]+|bind\w+|hover-class|data-target)="[^"]*"/g, '');
markup = markup.replace(/<(\/?)view\b/g, '<$1div').replace(/<(\/?)text\b/g, '<$1span');
markup = markup.replace(/<image\b([^>]*?)\s*\/>/g, '<img$1>');
markup = markup.replace(/src="([^"]+)"/g, (_, src) => 'src="' + dataUrl(src) + '"');
markup = markup.replace(/(<div[^>]*aria-hidden="true")\s*\/>/g, '$1></div>');
const nav = ['home','shop','orders','account'].map((name, index) =>
  '<button class="tab-item ' + (index === 3 ? 'selected' : '') + '"><img class="tab-icon" src="' +
  dataUrl('/assets/icons/tab-bar/' + name + '-outline.svg') + '"><span class="tab-label">' +
  ['首页','选购','订单','我的'][index] + '</span></button>').join('');
const css = ['styles/tokens.wxss', 'styles/shell.wxss', 'pages/account/account.wxss', 'custom-tab-bar/index.wxss']
  .map(file => rpx(fs.readFileSync(path.join(app, file), 'utf8'))
    .replace(/(?<![-.\w])page\s*\{/g, 'body {')
    .replace(/(?<![-\w])(view|text|image)(?![-\w])/g, (_, tag) => ({view:'div',text:'span',image:'img'}[tag]))).join('\n');
const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
  css + '\nbody { margin:0; } button { border:0; } img { object-fit:contain; } .account-birthday-image { object-fit:cover; } ' +
  '.qa-status { position:absolute;z-index:1;top:20px;left:28px;font:600 12px sans-serif; }' +
  '</style><body><div class="qa-status">9:41</div>' + markup + '<div class="tab-bar">' + nav + '</div></body></html>';
fs.writeFileSync(path.join(__dirname, 'account-home-layout-preview.html'), html);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const dimensions = [];
  for (const [width,height] of [[375,845], [400,890], [320,700]]) {
    const page = await browser.newPage({ viewport: {width,height}, deviceScaleFactor: 1 });
    await page.setContent(html);
    await page.screenshot({path:path.join(__dirname, 'account-home-layout-' + width + '.png'), fullPage:true});
    dimensions.push({width,height, boxes: await page.evaluate(() =>
      Object.fromEntries(['profile','avatar','profile-copy','login','stats','birthday','menu'].map(name => {
        const box = document.querySelector('.account-' + name).getBoundingClientRect();
        return [name,{x:box.x,y:box.y,width:box.width,height:box.height}];
      })))});
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'account-home-layout-measurements.json'), JSON.stringify(dimensions,null,2) + '\n');
  process.stdout.write(JSON.stringify(dimensions) + '\n');
})().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode=1; });

