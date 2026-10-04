Component({
  properties: { product: Object, typography: { type: String, value: '' } },
  data: { imageFailed: false },
  observers: { 'product.image': function () { this.setData({ imageFailed: false }); } },
  methods: {
    select() { this.triggerEvent('select', { id: this.data.product.id }); },
    imageError() { this.setData({ imageFailed: true }); }
  }
});
