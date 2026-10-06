<template>
    <view class="material-editor">
        <view class="material-heading"><text>包装材料清单 · {{ rows.length }} 行</text><button size="mini" :disabled="disabled" @click="add">新增物料</button></view>
        <view v-if="!rows.length" class="material-empty">请识别照片或新增物料行，核对编号和计量单位后保存。</view>
        <view v-for="(row, index) in rows" :key="index" class="material-item">
            <view class="material-heading"><text>物料 {{ index + 1 }}</text><button size="mini" :disabled="disabled" @click="remove(index)">移除</button></view>
            <view class="material-fields">
                <view v-for="field in fields" :key="field.key" class="material-field" :class="{ wide: field.key === 'spec' || field.key === 'materialName' }">
                    <text>{{ field.label }}</text>
                    <textarea v-if="field.key === 'spec' || field.key === 'materialName'" :value="row[field.key] || ''" :disabled="disabled" :maxlength="field.max" auto-height :placeholder="field.placeholder" @input="patch(index, field.key, $event.detail.value)" />
                    <input v-else :value="row[field.key] || ''" :disabled="disabled" :maxlength="field.max" :placeholder="field.placeholder" @input="patch(index, field.key, $event.detail.value)" />
                </view>
            </view>
        </view>
    </view>
</template>
<script>
export default {
    props: { value: { type: Array, default: () => [] }, disabled: Boolean },
    data() {
        return { fields: [
            { key: 'materialCode', label: '物料编号 *', placeholder: '保留 -1 等原始后缀', max: 40 },
            { key: 'unit', label: '计量单位 *', placeholder: '千克 / 只 / 卷', max: 12 },
            { key: 'materialVersion', label: '版本号', placeholder: '按原文填写；未识别留空', max: 20 },
            { key: 'materialName', label: '物料名称', placeholder: '物料名称', max: 120 },
            { key: 'spec', label: '规格型号', placeholder: '按单据原文填写', max: 2000 },
            { key: 'sourcePages', label: '来源页（可选）', placeholder: '例如1,2；未知留空', max: 40 }
        ] }
    },
    computed: { rows() { return this.value || [] } },
    methods: {
        patch(index, key, value) { this.$emit('input', this.rows.map((row, i) => i === index ? { ...row, [key]: value } : row)) },
        add() {
            if (this.rows.length >= 200) return uni.showToast({ title: '最多 200 行物料', icon: 'none' })
            this.$emit('input', [...this.rows, { seq: this.rows.length + 1, materialCode: '', materialName: '', spec: '', materialVersion: null, unit: '' }])
        },
        remove(index) { this.$emit('input', this.rows.filter((row, i) => i !== index).map((row, i) => ({ ...row, seq: i + 1 }))) }
    }
}
</script>
<style lang="scss" scoped>
.material-heading { display: flex; align-items: center; justify-content: space-between; gap: .8rem; margin-bottom: .8rem; font-weight: 600; }
.material-heading button { margin: 0; font-weight: normal; }
.material-item { margin-top: .8rem; padding: 1rem; border: 1px solid $uni-border-color; border-radius: .4rem; }
.material-fields { display: flex; flex-wrap: wrap; gap: .8rem; }
.material-field { flex: 1 1 10rem; min-width: 0; }
.material-field.wide { flex-basis: 100%; }
.material-field text { display: block; color: $uni-text-color-grey; font-size: .8rem; margin-bottom: .3rem; }
.material-field input, .material-field textarea { width: 100%; box-sizing: border-box; padding: .6rem; min-height: 2.5rem; background: $uni-bg-color-grey; font-size: .85rem; border-radius: .3rem; }
.material-empty { color: $uni-text-color-grey; padding: 1rem 0; line-height: 1.6; }
</style>
