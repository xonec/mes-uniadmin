<template>
  <view class="pallet-editor">
    <view class="pallet-heading"><text>上托要求</text><text class="pallet-state">{{ value.status === 'confirmed' ? '已确认' : '待补充' }}</text></view>
    <view class="pallet-grid">
      <view v-for="field in fields" :key="field.key" class="pallet-field" :class="{ wide: field.wide }">
        <text>{{ field.label }}</text>
        <input :value="value[field.key] == null ? '' : value[field.key]" :type="field.numeric ? 'number' : 'text'" :disabled="disabled" :maxlength="field.max || 2000" :placeholder="field.placeholder || '未填写'" @input="patch(field.key, $event.detail.value)" />
      </view>
      <view class="pallet-field"><text>要求来源</text><picker :range="sourceOptions" range-key="text" :value="sourceIndex" :disabled="disabled" @change="patch('sourceType', sourceOptions[Number($event.detail.value)].value)"><view class="pallet-picker">{{ sourceOptions[sourceIndex].text }} ▾</view></picker></view>
      <view class="pallet-field"><text>配置状态</text><picker :range="statusOptions" range-key="text" :value="value.status === 'confirmed' ? 1 : 0" :disabled="disabled" @change="patch('status', statusOptions[Number($event.detail.value)].value)"><view class="pallet-picker">{{ value.status === 'confirmed' ? '已确认' : '待补充' }} ▾</view></picker></view>
    </view>
    <view class="pallet-note">缺失数据保持为空，待补充时不计算托数。确认上托要求须填写每托箱数、来源和依据说明。衬板尺寸不作为托盘尺寸。</view>
  </view>
</template>
<script>
import { patchPalletField } from '@/utils/shared/pallet.js'

export default {
  props: { value: { type: Object, default: () => ({}) }, disabled: Boolean },
  data() { return { fields: [{ key: 'casesPerLayer', label: '箱 / 层', numeric: true }, { key: 'layers', label: '层数', numeric: true }, { key: 'casesPerPallet', label: '箱 / 托', numeric: true }, { key: 'dimensions', label: '托盘尺寸', placeholder: '例如1200×1000mm，按实际标准填写', max: 120 }, { key: 'placement', label: '摆放说明', wide: true }, { key: 'sourceNote', label: '依据说明', placeholder: '客户要求或现场标准的名称、日期等', wide: true }], sourceOptions: [{ value: '', text: '请选择来源' }, { value: 'customer', text: '客户要求' }, { value: 'site', text: '现场标准' }, { value: 'document', text: '单据明确记载' }], statusOptions: [{ value: 'pending', text: '待补充' }, { value: 'confirmed', text: '已确认' }] }; },
  computed: { sourceIndex() { return Math.max(0, this.sourceOptions.findIndex(option => option.value === this.value.sourceType)); } },
  methods: { patch(key, value) { this.$emit('input', patchPalletField(this.value, key, value, false).value); } }
};
</script>
<style lang="scss" scoped>
.pallet-editor { margin: 1rem 0; padding: 1rem; border: 1px solid $uni-border-color; border-radius: .4rem; }
.pallet-heading { display: flex; justify-content: space-between; gap: 1rem; font-weight: 600; margin-bottom: 1rem; }
.pallet-state, .pallet-note { color: $uni-text-color-grey; font-size: .85rem; font-weight: normal; }
.pallet-note { margin-top: .8rem; line-height: 1.6; }
.pallet-grid { display: flex; flex-wrap: wrap; gap: .8rem; }
.pallet-field { flex: 1 1 12rem; min-width: 0; }.pallet-field.wide { flex-basis: 100%; }
.pallet-field text { display: block; margin-bottom: .4rem; color: $uni-text-color-grey; font-size: .85rem; }
.pallet-field input, .pallet-picker { width: 100%; box-sizing: border-box; min-height: 2.6rem; padding: .6rem; background: $uni-bg-color-grey; border-radius: .3rem; font-size: .9rem; }
</style>
