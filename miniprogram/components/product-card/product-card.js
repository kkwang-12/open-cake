Component({
  properties: { product: Object },
  data: { imageFailed: false },
  observers: { 'product.image': function () { this.setData({ imageFailed: false }); } },
  methods: {
    select() { this.triggerEvent('select', { id: this.data.product.id }); },
    imageError() { this.setData({ imageFailed: true }); }
  }
});
