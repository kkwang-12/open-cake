Component({
  properties: { title: String, description: String, action: String, loading: Boolean },
  methods: { activate() { this.triggerEvent('action'); } }
});
