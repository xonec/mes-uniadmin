<template>
  <view v-if="visible" class="drawer-root">
    <view class="drawer-mask" @click="requestClose"></view>
    <view class="drawer-panel" :style="{ width: panelWidth }">
      <view class="drawer-head">
        <view class="drawer-heading">
          <text class="drawer-title">{{ title }}</text>
          <text v-if="subtitle" class="drawer-subtitle">{{ subtitle }}</text>
        </view>
        <button size="mini" class="drawer-close" :disabled="busy" @click="requestClose">关闭</button>
      </view>
      <scroll-view scroll-y class="drawer-body">
        <slot />
      </scroll-view>
    </view>
  </view>
</template>
<script>
/** 右侧抽屉：遮罩 + 滑入面板，供订单编辑表单复用；ESC / 点遮罩 / 关闭按钮均可关闭。 */
export default {
  name: 'OrderDrawer',
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    width: { type: String, default: 'min(52rem, 96vw)' },
    busy: { type: Boolean, default: false }
  },
  emits: ['close'],
  computed: {
    panelWidth() { return this.width; }
  },
  watch: {
    visible(value) { this.toggleBodyLock(value); }
  },
  mounted() {
    // #ifdef H5
    this.onKeydown = event => { if (event.key === 'Escape' && this.visible) this.requestClose(); };
    window.addEventListener('keydown', this.onKeydown);
    this.toggleBodyLock(this.visible);
    // #endif
  },
  beforeUnmount() {
    // #ifdef H5
    window.removeEventListener('keydown', this.onKeydown);
    this.toggleBodyLock(false);
    // #endif
  },
  methods: {
    requestClose() { if (!this.busy) this.$emit('close'); },
    toggleBodyLock(locked) {
      // #ifdef H5
      if (typeof document === 'undefined') return;
      document.body.style.overflow = locked ? 'hidden' : '';
      // #endif
    }
  }
};
</script>
<style lang="scss" scoped>
@import '@/common/mes.scss';
.drawer-root { position: fixed; inset: 0; z-index: 2000; }
.drawer-mask { position: absolute; inset: 0; background: rgba(17, 24, 28, .38); backdrop-filter: blur(1px); }
.drawer-panel {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  background: $uni-bg-color;
  box-shadow: -.35rem 0 1.4rem rgba(17, 24, 28, .14);
  animation: drawer-slide-in .18s ease-out;
}
.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: .8rem;
  padding: 1.1rem 1.3rem;
  border-bottom: 1px solid $uni-border-color;
  background: $uni-bg-color;
}
.drawer-heading { display: flex; flex-direction: column; gap: .2rem; min-width: 0; }
.drawer-title { font-size: 1.05rem; font-weight: 650; color: $uni-text-color; }
.drawer-subtitle { font-size: .78rem; color: $uni-text-color-grey; word-break: break-all; }
.drawer-close { margin: 0; flex-shrink: 0; }
.drawer-body { flex: 1; min-height: 0; padding: 0; }
@keyframes drawer-slide-in { from { transform: translateX(1.4rem); opacity: .4; } to { transform: translateX(0); opacity: 1; } }
@media (max-width: 600px) {
  .drawer-panel { width: 100vw !important; }
}
</style>
