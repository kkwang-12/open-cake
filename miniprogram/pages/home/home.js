const routes = require('../../constants/routes');
const catalog = require('../../services/home-catalog');
const tabTransition = require('../../utils/tab-transition');
const heroSlides = [
  { id: 'strawberry', image: '/assets/home/hero-scene-strawberry.jpg', imageLabel: '桌面上的草莓奶油蛋糕', titleLines: ['把日常，', '过成甜蜜时刻。'], subtitle: '一份好蛋糕，让相聚值得庆祝。', buttonText: '去选购', target: { route: 'shop', category: 'cake' }, imageReady: false, imageFailed: false },
  { id: 'chocolate', image: '/assets/home/hero-scene-chocolate.jpg', imageLabel: '桌面上的巧克力蛋糕', titleLines: ['把心意，', '藏进浓郁滋味。'], subtitle: '一口浓郁，分享相聚的好时光。', buttonText: '去选购', target: { route: 'shop', category: 'cake' }, imageReady: false, imageFailed: false },
  { id: 'lemon', image: '/assets/home/hero-scene-lemon.jpg', imageLabel: '桌面上的柠檬蛋糕', titleLines: ['让相聚，', '多一点清新甜。'], subtitle: '一份清甜，留住轻盈的好心情。', buttonText: '去选购', target: { route: 'shop', category: 'cake' }, imageReady: false, imageFailed: false }
];
Page({
  data: { tabMotion: '', products: [], loading:false,error:'',source:'',recommendationConfigured:false, heroSlides, heroCurrent: 0, heroHeight:317.2, heroImageWidth:375 },
  onLoad(){this.updateHeroLayout();},
  onReady(){this.measureHeroLayout();},
  onResize(){this.updateHeroLayout();this.measureHeroLayout();},
  updateHeroLayout(recommendationHeight){
    let width=375,height=640,safeBottom=0;
    try{
      const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
      width=info.windowWidth||width;height=info.windowHeight||height;
      if(info.safeArea&&Number.isFinite(info.safeArea.bottom))safeBottom=Math.max(0,height-info.safeArea.bottom);
    }catch(_){}
    // Fallback matches the current two-card recommendation row; measure after render.
    const recommendations=Number.isFinite(recommendationHeight)&&recommendationHeight>0?recommendationHeight:
      14+28+10+75+(width-44)*.34;
    const heroHeight=Math.round(Math.max(276,height-65-safeBottom-8-recommendations)*.9*10)/10;
    // All three current source JPGs are 1122 x 1402. Enlarge equally on both axes
    // when needed to cover tall viewports; widthFix preserves their actual ratio.
    this.setData({heroHeight,heroImageWidth:Math.max(width,Math.ceil(heroHeight*1122/1402))});
  },
  measureHeroLayout(){
    if(typeof wx==='undefined'||typeof wx.nextTick!=='function'||typeof this.createSelectorQuery!=='function')return;
    const ticket=this._epoch,request=this._heroLayoutRequest=(this._heroLayoutRequest||0)+1;
    wx.nextTick(()=>{if(!this._visible||ticket!==this._epoch||request!==this._heroLayoutRequest)return;
      this.createSelectorQuery().select('.home-recommendations').boundingClientRect(rect=>{
        if(this._visible&&ticket===this._epoch&&request===this._heroLayoutRequest&&rect)this.updateHeroLayout(rect.height);
      }).exec();
    });
  },
  onShow() {
    tabTransition.show(this, 0);
    this._visible=true;
    if (!this._loaded) return this.load();
  },
  onHide(){tabTransition.hide(this);this._heroTouch=null;this._visible=false;this._epoch=(this._epoch||0)+1;this.setData({loading:false});},
  onPageScroll(event) { tabTransition.scroll(this, event); },
  onUnload(){this.onHide();},
  async load(){
    this._loaded=false;
    const ticket=this._epoch=(this._epoch||0)+1;
    this.setData({products:[],loading:true,error:'',source:'',recommendationConfigured:false});
    try{
      const result=await catalog.get();
      if(!this._visible||ticket!==this._epoch)return;
      this._loaded=true;
      this.setData({products:result.products,source:result.source,recommendationConfigured:result.recommendationConfigured,loading:false},()=>this.measureHeroLayout());
    }catch(error){
      if(!this._visible||ticket!==this._epoch)return;
      this.setData({loading:false,error:error.code==='CLOUD_NOT_CONFIGURED'?'商品服务暂未开通，欢迎稍后再来。':'商品加载失败，请重试。'},()=>this.measureHeroLayout());
    }
  },
  retry(){if(!this.data.loading)return this.load();},
  browse() { routes.navigate('shop'); },
  select(e) {
    const id=e.detail&&e.detail.id||e.currentTarget&&e.currentTarget.dataset.id;
    if(this.data.products.some(item=>item.id===id))routes.navigate('product', { id });
  },
  heroChange(event) {
    const current = event.detail && event.detail.current;
    if (!Number.isInteger(current) || !this.data.heroSlides[current]) return;
    this.setData({ heroCurrent: current });
    this._heroBlockUntil = Date.now() + 350;
  },
  heroTouchStart(event) {
    const touch = event.touches && event.touches[0];
    this._heroTouch = touch ? { x: touch.clientX, y: touch.clientY, moved: event.touches.length > 1 } : null;
  },
  heroTouchMove(event) {
    const start = this._heroTouch;
    const touch = event.touches && event.touches[0];
    if (!start || !touch) return;
    // Observe only: native swiper arbitrates horizontal gestures and page scrolling.
    if (event.touches.length > 1 || Math.abs(touch.clientX - start.x) > 8 || Math.abs(touch.clientY - start.y) > 8) start.moved = true;
  },
  heroTouchEnd(event) {
    const start = this._heroTouch;
    const touch = event.changedTouches && event.changedTouches[0];
    if (start && (start.moved || touch && (Math.abs(touch.clientX - start.x) > 8 || Math.abs(touch.clientY - start.y) > 8))) this._heroBlockUntil = Date.now() + 350;
    this._heroTouch = null;
  },
  heroTouchCancel() {
    this._heroTouch = null;
    this._heroBlockUntil = Date.now() + 350;
  },
  heroAction(event) {
    if (Date.now() < (this._heroBlockUntil || 0) || this._heroTouch && this._heroTouch.moved) return;
    const index = Number(event.currentTarget && event.currentTarget.dataset.index);
    const slide = this.data.heroSlides[index];
    if (!slide || index !== this.data.heroCurrent) return;
    if (slide.target.category) getApp().globalData.pendingShopCategory = slide.target.category;
    routes.navigate(slide.target.route, slide.target.params || {});
  },
  heroImageLoad(event) { this.updateHeroImage(event, false); },
  heroImageError(event) { this.updateHeroImage(event, true); },
  updateHeroImage(event, failed) {
    const index = Number(event.currentTarget && event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || !this.data.heroSlides[index]) return;
    const slides = this.data.heroSlides.map((slide, position) => position === index ? { ...slide, imageReady: !failed, imageFailed: failed } : slide);
    this.setData({ heroSlides: slides });
  }
});
