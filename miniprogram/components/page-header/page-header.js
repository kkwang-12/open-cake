const { measure } = require('../../utils/safe-area');
const routes = require('../../constants/routes');
Component({
  properties: { title: { type: String, value: '家家乐蛋糕店' }, back: Boolean, bag: Boolean },
  data: { topInset: 24, navHeight: 44, capsuleWidth: 104 },
  lifetimes: { attached() { this.setData(measure()); } },
  methods: {
    goBack() {
      if (getCurrentPages().length > 1) wx.navigateBack();
      else routes.navigate('home');
    },
    openBag() { routes.navigate('bag'); }
  }
});
