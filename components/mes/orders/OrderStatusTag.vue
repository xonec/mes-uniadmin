<template>
  <text class="order-tag" :class="'order-tag--' + tone">{{ label }}</text>
</template>
<script>
/** 订单状态彩色标签：草稿 / 已确认 / 已停用（停用优先于订单状态）。 */
export default {
  name: 'OrderStatusTag',
  props: {
    status: { type: String, default: 'draft' },
    enabled: { type: Boolean, default: true }
  },
  computed: {
    tone() {
      if (this.enabled === false) return 'disabled';
      return this.status === 'confirmed' ? 'confirmed' : 'draft';
    },
    label() {
      if (this.enabled === false) return '已停用';
      return this.status === 'confirmed' ? '已确认' : '草稿';
    }
  }
};
</script>
<style lang="scss" scoped>
.order-tag {
  display: inline-flex;
  align-items: center;
  padding: .1rem .5rem;
  border: 1px solid transparent;
  border-radius: .2rem;
  font-size: .72rem;
  line-height: 1.6;
  white-space: nowrap;
}
.order-tag--draft { color: #4a5f8a; background: #eef2fb; border-color: #d9e2f7; }
.order-tag--confirmed { color: #00695f; background: rgba(0, 133, 119, .1); border-color: rgba(0, 133, 119, .22); }
.order-tag--disabled { color: #8a8f98; background: #f1f2f4; border-color: #e3e5e8; }
</style>
