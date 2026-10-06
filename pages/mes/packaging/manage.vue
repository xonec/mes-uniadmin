<template>
  <view class="mes-page">
    <view class="mes-header"><view><view class="mes-title">客户与包装方案</view><view class="mes-description">同一产品按客户维护多份方案。材料和上托要求按版本保存，已确认订单保留当次快照。</view></view><view class="mes-actions" v-if="authorized"><button size="mini" :type="tab === 'plans' ? 'primary' : 'default'" @click="tab = 'plans'">包装方案</button><button size="mini" :type="tab === 'customers' ? 'primary' : 'default'" @click="tab = 'customers'">客户</button></view></view>
    <view v-if="error" class="mes-error">{{ error }}</view>
    <view v-if="authorized && tab === 'customers'" class="workspace">
      <view class="panel">
        <view class="mes-toolbar"><view class="section-title">客户档案</view><button size="mini" :disabled="busy" @click="customerForm = blankCustomer()">新增客户</button></view>
        <uni-table :loading="loading" border emptyText="先建立客户，再维护包装方案"><uni-tr><uni-th>客户名称</uni-th><uni-th>客户编号</uni-th><uni-th>状态</uni-th><uni-th>操作</uni-th></uni-tr><uni-tr v-for="row in customers" :key="row._id"><uni-td>{{ row.name }}</uni-td><uni-td>{{ row.externalCode || '—' }}</uni-td><uni-td>{{ row.enabled === false ? '停用' : '启用' }}</uni-td><uni-td><button size="mini" :disabled="busy" @click="editCustomer(row)">编辑</button></uni-td></uni-tr></uni-table>
      </view>
      <view class="panel editor">
        <view class="section-title">{{ customerForm._id ? '编辑客户 · V' + customerForm.version : '新增客户' }}</view>
        <view class="mes-field"><text class="mes-field-label">客户名称 *</text><input v-model="customerForm.name" maxlength="120" :disabled="busy" /></view>
        <view class="mes-field"><text class="mes-field-label">客户编号（可选）</text><input v-model="customerForm.externalCode" maxlength="80" :disabled="busy" /></view>
        <view class="mes-field"><text class="mes-field-label">说明</text><textarea v-model="customerForm.note" maxlength="2000" auto-height :disabled="busy" /></view>
        <view class="mes-field"><text class="mes-field-label">状态</text><uni-data-select :value="customerForm.enabled === false ? 0 : 1" @change="customerForm.enabled = $event === 1" :clear="false" :localdata="enabledOptions" :disabled="busy" /></view>
        <view v-if="customerForm._id" class="mes-field"><text class="mes-field-label">修改原因 *</text><textarea v-model="customerForm.changeReason" maxlength="1000" auto-height :disabled="busy" /></view>
        <button type="primary" :disabled="busy" @click="saveCustomer">{{ saving ? '保存中…' : '保存客户' }}</button>
      </view>
    </view>
    <view v-if="authorized && tab === 'plans'">
      <view class="mes-toolbar"><input class="mes-search" v-model="filterCode" maxlength="10" placeholder="按10位产品编码筛选" @confirm="reloadPlans" /><button size="mini" :disabled="busy" @click="reloadPlans">查询</button><button size="mini" :disabled="busy" @click="newPlan">新增方案</button><text class="mes-muted">包含停用方案；订单只可新选启用方案。</text></view>
      <uni-table :loading="loading" border emptyText="暂无方案"><uni-tr><uni-th>产品 / 编码</uni-th><uni-th>客户</uni-th><uni-th>方案</uni-th><uni-th>版本 / 材料</uni-th><uni-th>上托</uni-th><uni-th>状态</uni-th><uni-th>操作</uni-th></uni-tr><uni-tr v-for="row in plans" :key="row._id"><uni-td>{{ row.productName }}<view class="mes-code">{{ row.productCode }}</view></uni-td><uni-td>{{ row.customerName }}</uni-td><uni-td>{{ row.planName }}</uni-td><uni-td>V{{ row.version }} · {{ row.materialCount }}行</uni-td><uni-td>{{ row.pallet && row.pallet.status === 'confirmed' ? row.pallet.casesPerPallet + '箱/托' : '待补充' }}</uni-td><uni-td>{{ row.enabled === false ? '停用' : '启用' }}</uni-td><uni-td><button size="mini" :disabled="busy" @click="editPlan(row)">编辑 / 历史</button></uni-td></uni-tr></uni-table>
      <view v-if="planForm" class="panel plan-editor">
        <view class="mes-header"><view><view class="section-title">{{ planForm._id ? planForm.planName + ' · V' + planForm.version : '新增包装方案' }}</view><view v-if="historical" class="mes-description">正在查看历史版本，内容只读。</view></view><button size="mini" :disabled="busy" @click="planForm = null">收起</button></view>
        <view v-if="versions.length" class="mes-toolbar"><text class="mes-muted">查看版本</text><button v-for="row in versions" :key="row.version" size="mini" :disabled="busy" :type="Number(planForm.version) === Number(row.version) ? 'primary' : 'default'" @click="viewVersion(row)">V{{ row.version }}</button></view>
        <view class="mes-fields">
          <view class="mes-field"><text class="mes-field-label">产品编码 *</text><input v-model="planForm.productCode" maxlength="10" :disabled="busy || !!planForm._id" /></view>
          <view class="mes-field"><text class="mes-field-label">产品名称</text><input :value="planForm.productName" disabled placeholder="载入产品档案" /></view>
          <view class="mes-field"><text class="mes-field-label">固定包装规格</text><input :value="planForm.packSpec" disabled /></view>
          <view class="mes-field"><text class="mes-field-label">客户 *</text><uni-data-select v-model="planForm.customerId" :clear="false" :localdata="customerOptions" :disabled="busy || !!planForm._id" /></view>
          <view class="mes-field"><text class="mes-field-label">方案名称 *</text><input v-model="planForm.planName" maxlength="120" :disabled="busy || historical" placeholder="例如 国内订单 / 客供包材" /></view>
          <view class="mes-field"><text class="mes-field-label">状态</text><uni-data-select :value="planForm.enabled === false ? 0 : 1" @change="planForm.enabled = $event === 1" :clear="false" :localdata="enabledOptions" :disabled="busy || historical" /></view>
        </view>
        <view v-if="!planForm._id" class="mes-toolbar"><button size="mini" :disabled="busy" @click="loadProduct">载入产品档案材料</button><text class="mes-muted">载入后按该客户要求核对并调整材料。</text></view>
        <MaterialListEditor :value="planForm.materials || []" :disabled="busy || historical" @input="planForm.materials = $event" />
        <PalletEditor :value="planForm.pallet || {}" :disabled="busy || historical" @input="planForm.pallet = $event" />
        <view class="mes-field"><text class="mes-field-label">可复用包装要求</text><textarea v-model="planForm.packingRequirements" maxlength="10000" auto-height :disabled="busy || historical" placeholder="填写装箱、贴标、封箱等固定要求。批号、日期和本批取样说明保留在订单中。" /></view>
        <view class="mes-description" v-if="planForm.sourceDocumentId">已保留来源单据，可在关联订单的追溯页面查看原图。</view>
        <view v-if="planForm.audit" class="mes-description">{{ planForm.audit.actorName || planForm.audit.actorId }} · {{ formatDate(planForm.audit.at) }} · {{ planForm.audit.reason }}</view>
        <view v-if="!historical" class="mes-field"><text class="mes-field-label">{{ planForm._id ? '修改原因 *' : '建立说明（可选）' }}</text><textarea v-model="planForm.changeReason" maxlength="1000" auto-height :disabled="busy" /></view>
        <view class="mes-footer"><button v-if="!historical" type="primary" :disabled="busy" @click="savePlan">{{ saving ? '保存中…' : '核对并保存方案' }}</button><button v-else :disabled="busy" @click="viewVersion(versions[0])">回到当前版本</button></view>
      </view>
    </view>
  </view>
</template>
<script>
import { callMes, requireMesAdmin, formatMesDate, confirmMes } from '@/utils/mes-api.js';
import MaterialListEditor from '@/components/mes/MaterialListEditor.vue';
import PalletEditor from '@/components/mes/PalletEditor.vue';
const blankCustomer = () => ({ name: '', externalCode: '', note: '', enabled: true, changeReason: '', version: 0 });
const blankPlan = () => ({ productCode: '', productName: '', packSpec: '', customerId: '', planName: '', materials: [], pallet: {}, packingRequirements: '', enabled: true, changeReason: '', version: 0 });
export default {
  components: { MaterialListEditor, PalletEditor },
  data() { return { authorized: false, tab: 'plans', customers: [], plans: [], filterCode: '', customerForm: blankCustomer(), planForm: null, versions: [], currentPlanVersion: 0, loading: false, saving: false, error: '', enabledOptions: [{ value: 1, text: '启用' }, { value: 0, text: '停用' }] }; },
  computed: { busy() { return this.loading || this.saving; }, historical() { return !!this.planForm && this.planForm._id && Number(this.planForm.version) !== this.currentPlanVersion; }, customerOptions() { return this.customers.map(row => ({ value: row._id, text: row.name + (row.enabled === false ? '（停用）' : '') })); } },
  async onLoad(query) {
    this.loading = true;
    try {
      await requireMesAdmin(); this.authorized = true;
      await this.refresh();
      if (query.orderNo) {
        const order = await callMes('production-orders', 'get', { orderNo: query.orderNo });
        if (!order) throw new Error('订单不存在');
        this.planForm = { ...blankPlan(), productCode: order.productCode, productName: order.productName, packSpec: order.packSpec, customerId: order.customerId || '', materials: order.materials || [], pallet: order.pallet || {}, sourceDocumentId: order.sourceDocumentId || '', recognitionRunId: order.recognitionRunId || '' };
      }
    } catch (error) { this.error = error.message; } finally { this.loading = false; }
  },
  methods: {
    blankCustomer, formatDate: formatMesDate,
    async refresh() { const results = await Promise.all([callMes('production-orders', 'listCustomers', { includeDisabled: true }), callMes('production-orders', 'listPlans', { productCode: this.filterCode.trim(), includeDisabled: true })]); this.customers = results[0]; this.plans = results[1]; },
    async reloadPlans() { if (this.busy) return; this.loading = true; this.error = ''; try { await this.refresh(); } catch (error) { this.error = error.message; } finally { this.loading = false; } },
    editCustomer(row) { this.customerForm = { ...row, changeReason: '' }; this.error = ''; },
    async saveCustomer() { if (this.busy) return; this.saving = true; this.error = ''; try { await callMes('production-orders', 'saveCustomer', { record: this.customerForm, expectedVersion: Number(this.customerForm.version) || 0 }); await this.refresh(); this.customerForm = blankCustomer(); uni.showToast({ title: '客户已保存', icon: 'none' }); } catch (error) { this.error = error.message; } finally { this.saving = false; } },
    newPlan() { this.planForm = blankPlan(); this.versions = []; this.currentPlanVersion = 0; this.error = ''; },
    async editPlan(row) { if (this.busy) return; this.loading = true; this.error = ''; try { this.currentPlanVersion = Number(row.version); this.versions = await callMes('production-orders', 'planVersions', { planId: row._id }); await this.loadVersion(row.planVersionId); } catch (error) { this.error = error.message; } finally { this.loading = false; } },
    async loadVersion(id) { const record = await callMes('production-orders', 'getPlanVersion', { planVersionId: id }); this.planForm = { ...record, _id: record.planId, changeReason: '' }; },
    async viewVersion(row) { if (this.busy || !row) return; this.loading = true; this.error = ''; try { await this.loadVersion(row.planVersionId || row._id); } catch (error) { this.error = error.message; } finally { this.loading = false; } },
    async loadProduct() {
      if (this.busy) return; this.saving = true; this.error = '';
      try { const product = await callMes('product-materials', 'get', { productCode: this.planForm.productCode }); if (!product || product.enabled === false) throw new Error('请先建立启用的产品档案'); if (this.planForm.materials.length && !await confirmMes('载入产品材料', '将替换当前方案尚未保存的材料，确认继续？')) return; this.planForm = { ...this.planForm, productName: product.productName, packSpec: product.packSpec, materials: (product.materials || []).map(row => ({ ...row, sourcePages: [] })), sourceDocumentId: '', recognitionRunId: '' }; } catch (error) { this.error = error.message; } finally { this.saving = false; }
    },
    async savePlan() {
      if (this.busy || this.historical) return; this.saving = true; this.error = '';
      try { const result = await callMes('production-orders', 'savePlan', { record: this.planForm, expectedVersion: Number(this.planForm.version) || 0 }); this.currentPlanVersion = result.version; await this.loadVersion(result.planVersionId); this.versions = await callMes('production-orders', 'planVersions', { planId: this.planForm._id }); await this.refresh(); uni.showToast({ title: result.unchanged ? '内容相同，无需更新' : '方案已保存', icon: 'none' }); } catch (error) { this.error = error.message; } finally { this.saving = false; }
    }
  }
};
</script>
<style lang="scss" scoped>
@import '@/common/mes.scss';
.workspace { display: flex; flex-wrap: wrap; gap: 1rem; }
.panel { padding: 1.25rem; border: 1px solid $uni-border-color; border-radius: .6rem; background: $uni-bg-color; min-width: 0; flex: 1 1 24rem; }
.editor { flex: 1 1 20rem; }
.section-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; }
.plan-editor { margin-top: 1.5rem; }
.mes-field { margin-bottom: 1rem; }
</style>
