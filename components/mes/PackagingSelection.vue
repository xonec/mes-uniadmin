<template>
  <view class="selection">
    <view class="selection-title">客户与包装方案</view>
    <view class="selection-error" v-if="error">{{ error }} <text @click="load">重新加载</text></view>
    <view class="selection-grid">
      <view class="selection-field"><text>客户 *</text><picker :range="customerOptions" range-key="text" :value="customerIndex" :disabled="disabled || loading" @change="chooseCustomer"><view class="selection-picker">{{ customerOptions[customerIndex].text }} ▾</view></picker></view>
      <view class="selection-field"><text>包装方案</text><picker :range="planOptions" range-key="text" :value="planIndex" :disabled="disabled || loading || !value.customerId" @change="choosePlan"><view class="selection-picker">{{ planOptions[planIndex].text }} ▾</view></picker></view>
    </view>
    <view v-if="value.planVersionId" class="selection-note">采用方案：{{ value.planName || '已关联' }} · V{{ value.planVersion || '—' }}。订单保存自己的材料和上托快照，可按本单要求核对修正。</view>
    <view v-else class="selection-note">可以按本单录入材料；客户及方案在后台维护。上托待补充也可正式确认订单。</view>
  </view>
</template>
<script>
export default {
  props: { value: { type: Object, default: () => ({}) }, call: { type: Function, required: true }, disabled: Boolean },
  data() { return { customers: [], plans: [], loading: false, error: '', requestNo: 0 }; },
  computed: {
    customerOptions() { const options = [{ value: '', text: '请选择客户' }, ...this.customers.map(row => ({ value: row._id, text: row.name }))]; if (this.value.customerId && !options.some(row => row.value === this.value.customerId)) options.push({ value: this.value.customerId, text: this.value.customerName || '原客户' }); return options; },
    customerIndex() { return Math.max(0, this.customerOptions.findIndex(row => row.value === this.value.customerId)); },
    planOptions() { const options = [{ value: '', text: '按本单录入 / 暂不关联方案' }, ...this.plans.map(row => ({ value: row.planVersionId, text: row.planName + ' · V' + row.version }))]; if (this.value.planVersionId && !options.some(row => row.value === this.value.planVersionId)) options.push({ value: this.value.planVersionId, text: (this.value.planName || '原方案') + ' · V' + (this.value.planVersion || '—') }); return options; },
    planIndex() { return Math.max(0, this.planOptions.findIndex(row => row.value === this.value.planVersionId)); }
  },
  watch: { 'value.productCode'(code, previous) { if (previous && code !== previous && this.value.planVersionId && this.plans.some(row => row.planVersionId === this.value.planVersionId && row.productCode !== code)) this.$emit('input', { ...this.value, planVersionId: '', planId: '', planName: '', planVersion: null, pallet: {} }); this.loadPlans(); }, 'value.customerId'() { this.loadPlans(); } },
  mounted() { this.load(); },
  methods: {
    async load() { this.loading = true; this.error = ''; try { this.customers = await this.call('production-orders', 'listCustomers'); await this.loadPlans(); } catch (error) { this.error = error.message; } finally { this.loading = false; } },
    async loadPlans() { const request = ++this.requestNo; if (!/^\d{10}$/.test(String(this.value.productCode || '')) || !this.value.customerId) { this.plans = []; return; } try { const rows = await this.call('production-orders', 'listPlans', { productCode: this.value.productCode, customerId: this.value.customerId }); if (request === this.requestNo) this.plans = rows; } catch (error) { if (request === this.requestNo) { this.plans = []; this.error = error.message; } } },
    chooseCustomer(event) { const option = this.customerOptions[Number(event.detail.value)]; if (option.value === this.value.customerId) return; this.$emit('input', { ...this.value, customerId: option.value, customerName: option.text, planVersionId: '', planId: '', planName: '', planVersion: null, pallet: {} }); },
    async choosePlan(event) { const option = this.planOptions[Number(event.detail.value)]; if (option.value === this.value.planVersionId) return; if (!option.value) { this.$emit('input', { ...this.value, planVersionId: '', planId: '', planName: '', planVersion: null }); return; } this.loading = true; this.error = ''; const customerId = this.value.customerId, productCode = this.value.productCode; try { const plan = await this.call('production-orders', 'getPlanVersion', { planVersionId: option.value }); if (this.value.customerId !== customerId || this.value.productCode !== productCode) return; this.$emit('input', { ...this.value, planVersionId: option.value, planId: plan.planId, planName: plan.planName, planVersion: plan.version, materials: (plan.materials || []).map(row => ({ ...row, sourcePages: [] })), pallet: { ...plan.pallet } }); } catch (error) { this.error = error.message; } finally { this.loading = false; } }
  }
};
</script>
<style lang="scss" scoped>
.selection { margin: 1rem 0; padding: 1rem; background: $uni-bg-color-grey; border-radius: .4rem; }
.selection-title { font-weight: 600; margin-bottom: .8rem; }.selection-grid { display: flex; flex-wrap: wrap; gap: 1rem; }.selection-field { flex: 1 1 16rem; min-width: 0; }
.selection-field text { display: block; color: $uni-text-color-grey; font-size: .85rem; margin-bottom: .4rem; }.selection-picker { background: $uni-bg-color; padding: .7rem; border-radius: .3rem; }
.selection-note { color: $uni-text-color-grey; line-height: 1.6; margin-top: .7rem; font-size: .85rem; }.selection-error { color: $uni-color-error; margin-bottom: .5rem; }.selection-error text { text-decoration: underline; }
</style>
