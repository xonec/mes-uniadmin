<template>
  <view v-if="open" class="ops-drawer-layer">
    <view class="ops-drawer-mask" @click="close" />
    <view ref="panel" class="ops-drawer" role="dialog" tabindex="-1" aria-modal="true" :aria-label="title">
      <view class="ops-drawer-header"><view><view class="ops-drawer-title">{{ title }}</view><view v-if="description" class="ops-drawer-description">{{ description }}</view></view><button size="mini" :disabled="busy" aria-label="关闭编辑窗口" @click="close">关闭</button></view>
      <scroll-view scroll-y class="ops-drawer-body"><slot /></scroll-view>
    </view>
  </view>
</template>
<script>
export default {
  props: { open: Boolean, title: { type: String, default: '' }, description: { type: String, default: '' }, busy: Boolean },
  emits: ['close'],
  watch: { open(value) { if (value) this.$nextTick(() => this.enter()); else this.leave(); } },
  mounted() {
    // #ifdef H5
    this._onKeydown = event => {
      if (!this.open || event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key !== 'Tab') return;
      const panel = this.panelElement(); if (!panel) return;
      const fields = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(node => node.getClientRects().length);
      if (!fields.length) { event.preventDefault(); panel.focus(); return; }
      const first = fields[0], last = fields[fields.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', this._onKeydown);
    // #endif
    if (this.open) this.$nextTick(() => this.enter());
  },
  beforeUnmount() {
    // #ifdef H5
    document.removeEventListener('keydown', this._onKeydown);
    // #endif
    this.leave();
  },
  methods: {
    close() { if (!this.busy) this.$emit('close'); },
    panelElement() { const panel = this.$refs.panel; return panel && (panel.$el || panel); },
    enter() {
      // #ifdef H5
      if (!this.open || this._locked) return;
      this._locked = true; this._previousFocus = document.activeElement; this._previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
      const panel = this.panelElement(); if (panel && panel.focus) panel.focus();
      // #endif
    },
    leave() {
      // #ifdef H5
      if (!this._locked) return;
      this._locked = false; document.body.style.overflow = this._previousOverflow || '';
      if (this._previousFocus && this._previousFocus.isConnected && this._previousFocus.focus) this._previousFocus.focus();
      // #endif
    }
  }
};
</script>
<style lang="scss" scoped>
.ops-drawer-layer { position: fixed; inset: 0; z-index: 1200; }
.ops-drawer-mask { position: absolute; inset: 0; background: $uni-bg-color-mask; }
.ops-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(44rem, 92vw); display: flex; flex-direction: column; background: $uni-bg-color; border-left: 1px solid $uni-border-color; box-shadow: -.4rem 0 1.6rem $uni-bg-color-mask; }
.ops-drawer-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1.4rem 1.5rem; border-bottom: 1px solid $uni-border-color; flex-shrink: 0; }
.ops-drawer-title { font-size: 1.15rem; font-weight: 650; color: $uni-text-color; }
.ops-drawer-description { font-size: .8rem; color: $uni-text-color-grey; margin-top: .4rem; line-height: 1.6; }
.ops-drawer-header button { margin: 0; flex-shrink: 0; }
.ops-drawer-body { flex: 1; height: 0; min-height: 0; }
@media (max-width: 600px) { .ops-drawer { width: 100%; } .ops-drawer-header { padding: 1rem; } }
</style>
