<template>
  <view class="mes-page">
    <view class="mes-header"><view><view class="mes-title">工单执行</view><view class="mes-description">同一批号可经过多道工序和多个班次。每个工单采用创建时确认的订单版本，后续订单修改可追溯。</view></view><button size="mini" :disabled="loading || saving" @click="reload">刷新工单</button><button type="primary" size="mini" :disabled="!authorized || loading || saving" @click="showEditor = true">新建工单</button></view>
    <view v-if="error" class="mes-error">{{ error }}</view>
    <view v-if="authorized"><view class="mes-toolbar"><input v-model="keyword" class="mes-search" placeholder="完整批号 / 产品 / 工序" @confirm="search" /><view class="mes-filter"><uni-data-select v-model="state" :localdata="states" :clear="false" @change="search" /></view><button size="mini" :disabled="loading" @click="search">查询</button></view>
      <view class="ops-layout ops-layout-list ops-section">
        <view class="ops-panel"><view class="ops-panel-title">工单清单 · {{ total }} 单</view><view class="mes-table"><uni-table border :loading="loading" emptyText="暂无匹配工单"><uni-tr><uni-th>生产批号 / 产品</uni-th><uni-th>工序 / 车间</uni-th><uni-th>生产进度</uni-th><uni-th width="120">状态</uni-th><uni-th width="130">操作</uni-th></uni-tr><uni-tr v-for="row in rows" :key="row._id"><uni-td><view class="ops-cell-stack"><text class="ops-batch ops-row-title">{{ row.batchNo }}</text><text>{{ row.productName }}</text><text class="ops-table-note">{{ row.productCode }}</text></view></uni-td><uni-td><view class="ops-cell-stack"><text>{{ row.processName || name('processes', row.processId) }}</text><text class="ops-table-note">{{ row.workshopName || name('workshops', row.workshopId) }}</text></view></uni-td><uni-td><view class="ops-cell-stack"><text>合格 {{ row.goodQty || 0 }} / {{ row.targetQty }} {{ unitName(row.unit) }}</text><text class="ops-table-note">订单版本 V{{ row.orderVersion }}</text></view></uni-td><uni-td><text class="ops-status" :class="row.state === 'completed' ? 'success' : row.state === 'running' ? 'primary' : 'muted'">{{ stateName(row.state) }}</text></uni-td><uni-td><button size="mini" @click="detail(row)">执行详情</button></uni-td></uni-tr></uni-table></view><view class="mes-pagination"><uni-pagination show-icon :total="total" :page-size="20" :current="page" @change="changePage" /></view></view>
        <operation-drawer :open="showEditor" title="新建工序工单" :busy="saving" @close="showEditor = false"><view class="ops-panel ops-editor-panel"><view class="ops-hint">一个完整生产批号和一道工序只建立一个工单。人员和工序必须属于同一车间。</view><operation-fields v-model="form" :fields="fields" :disabled="saving" /><view v-if="formError" class="mes-error">{{ formError }}</view><view class="mes-footer"><button type="primary" size="mini" :disabled="saving" @click="create">{{ saving ? '建立中…' : '建立工单' }}</button></view></view> </operation-drawer>
      </view>
    </view>
  </view>
</template>
<script>
import OperationDrawer from '@/components/mes/operations/OperationDrawer.vue';
import OperationFields from '@/components/mes/operations/OperationFields.vue';
import { requireMesAdmin } from '@/utils/mes-api.js';
import { callOperations, emptyCatalogs, options, catalogName, jobStates, unitOptions, stateName, unitName, today } from '@/utils/operations-admin.js';
function blank() { return { batchNo: '', processId: '', personIds: [], targetQty: '', unit: '', plannedDate: today(), changeReason: '' }; }
export default {
  components: { OperationFields, OperationDrawer },
  data() { return { showEditor: false, authorized: false, catalogs: emptyCatalogs(), rows: [], total: 0, page: 1, keyword: '', state: '', states: jobStates, loading: false, saving: false, error: '', formError: '', form: blank() }; },
  computed: {
    fields() {
      const process = this.catalogs.processes.find(row => row._id === this.form.processId);
      const people = this.catalogs.personnel.filter(row => (!process || (row.workshopId === process.workshopId && (row.processIds || []).includes(process._id))));
      return [{ key: 'batchNo', label: '完整生产批号', required: true, maxlength: 12, placeholder: '例如 APDD26X1006' }, { key: 'processId', label: '工序', type: 'select', required: true, options: options(this.catalogs.processes, this.form.processId) }, { key: 'personIds', label: '执行人员', type: 'multi', required: true, wide: true, options: options(people, this.form.personIds), hint: '可选多名人员；需要实际登录操作的人员应先绑定账号。' }, { key: 'targetQty', label: '目标产量', type: 'number', required: true }, { key: 'unit', label: '报工单位', type: 'select', required: true, options: unitOptions, hint: '本工单报工、合格量和不良量统一按此单位记录。' }, { key: 'plannedDate', label: '计划日期', type: 'date', required: true }, { key: 'changeReason', label: '派工说明', type: 'textarea', wide: true }];
    }
  },
  async onLoad() { await this.reload(); },
  onShow() { if (this.authorized) this.reload(); },
  methods: {
    stateName, unitName,
    name(type, id) { return catalogName(this.catalogs, type, id); },
    detail(row) { uni.navigateTo({ url: '/pages/mes/operations/job-detail?id=' + encodeURIComponent(row._id) }); },
    search() { this.page = 1; this.reload(); },
    changePage(event) { this.page = event.current; this.reload(); },
    async reload() { if (this.loading) return; this.loading = true; this.error = ''; try { if (!this.authorized) { await requireMesAdmin(); const base = await callOperations('bootstrap'); this.catalogs = { ...emptyCatalogs(), ...base.catalogs }; this.authorized = true; } const data = await callOperations('listJobs', { page: this.page, pageSize: 20, keyword: this.keyword, state: this.state }); this.rows = data.list || []; this.total = data.total || 0; } catch (error) { this.rows = []; this.total = 0; this.error = error.message; } finally { this.loading = false; } },
    async create() {
      if (this.saving) return;
      this.formError = '';
      const missing = this.fields.find(field => field.required && (Array.isArray(this.form[field.key]) ? !this.form[field.key].length : !String(this.form[field.key] == null ? '' : this.form[field.key]).trim()));
      if (missing) { this.formError = '请填写或选择' + missing.label; return; }
      if (!Number.isFinite(Number(this.form.targetQty)) || Number(this.form.targetQty) <= 0) { this.formError = '目标产量须大于 0。'; return; }
      this.saving = true;
      try { const result = await callOperations('createJob', { record: { ...this.form, batchNo: this.form.batchNo.trim().toUpperCase(), targetQty: Number(this.form.targetQty) }, expectedVersion: 0 }); this.form = blank(); await this.reload(); this.detail(result); }
      catch (error) { this.formError = error.message; }
      finally { this.saving = false; }
    }
  }
};
</script>
<style lang="scss" scoped>@import './operations.scss';</style>
