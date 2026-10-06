<template>
  <view class="menu-icon-picker">
    <view class="picker-title">选择菜单图标</view>
    <view class="picker-grid">
      <view v-for="icon in icons" :key="icon" class="picker-item" @click="$emit('select', 'uni-icons-' + icon)">
        <view :class="'uni-icons-' + icon" class="picker-icon"></view>
        <text>{{ icon }}</text>
      </view>
    </view>
  </view>
</template>
<script setup>
import icons from './menu-icons.js';
defineEmits(['select']);
</script>
<style lang="scss" scoped>
.menu-icon-picker { padding: 1rem; }
.picker-title { font-weight: 600; margin-bottom: 1rem; }
.picker-grid { display: flex; flex-wrap: wrap; }
.picker-item { width: 25%; min-height: 5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .5rem; cursor: pointer; }
.picker-item:hover { background: $uni-bg-color-grey; color: $uni-color-primary; }
.picker-icon { font-size: 1.7rem; }
.picker-item text { font-size: .75rem; color: $uni-text-color-grey; }
@media (min-width: 768px) { .picker-item { width: 20%; } }
</style>
