<template>
  <view class="mes-fields">
    <view v-for="field in fields" :key="field.key" class="mes-field" :class="{ wide: field.wide }">
      <text class="mes-field-label">{{ field.label }}{{ field.required ? ' *' : '' }}</text>
      <uni-data-select v-if="field.type === 'select'" :modelValue="modelValue[field.key]" :localdata="field.options || []" :clear="!field.required" :disabled="disabled || field.disabled" :placeholder="field.placeholder || '请选择'" @update:modelValue="set(field.key, $event)" />
      <view v-else-if="field.type === 'multi'" class="ops-multi"><view v-if="(field.options || []).length > 8" class="ops-multi-search"><input v-model="searchTerms[field.key]" :disabled="disabled || field.disabled" placeholder="输入名称或编码查找" /><text class="ops-hint">已选择 {{ (modelValue[field.key] || []).length }} 项</text></view><view class="ops-choices">
        <button v-for="item in matchingOptions(field)" :key="item.value" size="mini" :disabled="disabled || field.disabled" :class="{ chosen: (modelValue[field.key] || []).includes(item.value) }" @click="toggle(field.key, item.value)">{{ (modelValue[field.key] || []).includes(item.value) ? '✓ ' : '' }}{{ item.text }}</button>
        <text v-if="!(field.options || []).length" class="mes-muted">暂无可选资料，请先在基础资料中建立。</text><text v-else-if="!matchingOptions(field).length" class="mes-muted">没有匹配项，请更换关键词。</text>
      </view></view>
      <switch v-else-if="field.type === 'switch'" :checked="modelValue[field.key] !== false" :disabled="disabled || field.disabled" @change="set(field.key, $event.detail.value)" />
      <picker v-else-if="field.type === 'month' || field.type === 'year'" mode="date" :fields="field.type" :value="calendarValue(field)" :disabled="disabled || field.disabled" @change="set(field.key, $event.detail.value.slice(0, field.type === 'year' ? 4 : 7))"><view class="ops-time-picker" :class="{ 'is-disabled': disabled || field.disabled }"><text>{{ modelValue[field.key] || (field.type === 'year' ? '选择年份' : '选择月份') }}</text><text>⌄</text></view></picker>
      <uni-datetime-picker v-else-if="field.type === 'date'" type="date" :modelValue="modelValue[field.key] || ''" :disabled="disabled || field.disabled" :clear-icon="!field.required" return-type="string" @update:modelValue="set(field.key, $event)" />
      <view v-else-if="field.type === 'time'"><picker mode="time" :value="modelValue[field.key] || '08:00'" :disabled="disabled || field.disabled" @change="set(field.key, $event.detail.value)"><view class="ops-time-picker" :class="{ 'is-disabled': disabled || field.disabled }"><text>{{ modelValue[field.key] || '选择时间' }}</text><text>⌄</text></view></picker><button v-if="field.type === 'time' && !field.required && modelValue[field.key]" class="ops-clear-time" size="mini" :disabled="disabled || field.disabled" @click="set(field.key, '')">清除时间，采用班次默认值</button></view>
      <textarea v-else-if="field.type === 'textarea'" :value="modelValue[field.key] || ''" :disabled="disabled || field.disabled" :maxlength="field.maxlength || 4000" :placeholder="field.placeholder || ''" @input="set(field.key, $event.detail.value)" />
      <input v-else :type="field.type === 'number' ? 'digit' : 'text'" :value="modelValue[field.key] == null ? '' : modelValue[field.key]" :disabled="disabled || field.disabled" :maxlength="field.maxlength || 500" :placeholder="field.placeholder || ''" @input="set(field.key, $event.detail.value)" />
      <text v-if="field.hint" class="ops-hint">{{ field.hint }}</text>
    </view>
  </view>
</template>
<script>
export default {
  props: { modelValue: { type: Object, required: true }, fields: { type: Array, default: () => [] }, disabled: { type: Boolean, default: false } },
  emits: ['update:modelValue'],
  data() { return { searchTerms: {} }; },
  methods: {
    calendarValue(field) { const value = this.modelValue[field.key]; const year = new Date().getFullYear(); return field.type === 'year' ? (value || year) + '-01-01' : (value || year + '-01') + '-01'; },
    matchingOptions(field) { const key = (this.searchTerms[field.key] || '').trim().toLowerCase(); return (field.options || []).filter(item => !key || String(item.text).toLowerCase().includes(key)); },
    set(key, value) { this.$emit('update:modelValue', { ...this.modelValue, [key]: value }); },
    toggle(key, value) { const selected = [...(this.modelValue[key] || [])]; const index = selected.indexOf(value); if (index >= 0) selected.splice(index, 1); else selected.push(value); this.set(key, selected); }
  }
};
</script>
<style lang="scss" scoped>
@import '@/common/mes.scss';
.mes-field.wide { flex-basis: 100%; }
.ops-hint { display: block; margin-top: .35rem; color: $uni-text-color-grey; font-size: .75rem; line-height: 1.55; }
.ops-multi-search { margin-bottom: .6rem; }
.ops-clear-time { margin: .35rem 0 0; color: $uni-text-color-grey; font-size: .72rem; }
.ops-time-picker { display: flex; justify-content: space-between; padding: .65rem .8rem; border: 1px solid $uni-border-color; border-radius: .3rem; font-size: .9rem; cursor: pointer; }
.ops-time-picker.is-disabled { background: $uni-bg-color-grey; color: $uni-text-color-grey; cursor: default; }
.ops-choices { display: flex; flex-wrap: wrap; gap: .4rem; }
.ops-choices button { margin: 0; font-size: .8rem; background: $uni-bg-color; border: 1px solid $uni-border-color; }
.ops-choices button.chosen { color: $uni-color-primary; border-color: $uni-color-primary; background: $uni-bg-color-grey; }
</style>
