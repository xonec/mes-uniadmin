<template>
  <view class="mes-page">
    <view class="mes-header"><view><view class="mes-title">{{ job ? job.batchNo + ' · ' + job.processName : '工单执行详情' }}</view><view class="mes-description">记录开工参数、报工、生产入库确认与完工。操作保留实际账号、时间和采用版本。</view></view><view class="mes-actions"><button size="mini" @click="back">工单清单</button><button size="mini" :disabled="loading || saving" @click="reload">刷新详情</button></view></view>
    <view v-if="error" class="mes-error">{{ error }}</view><view v-if="loading && !job" class="ops-empty">正在读取工单…</view>
    <view v-if="job">
      <view class="ops-panel"><view class="ops-row-title">{{ job.productCode }} · {{ job.productName }}<text class="ops-state">{{ stateName(job.state) }}</text></view><view class="ops-row-detail">{{ job.workshopName }} · {{ (job.personNames || []).join('、') || '未指定人员' }}<view>采用订单 {{ job.orderNo }} · 版本 {{ job.orderVersion }} · 工单版本 {{ job.version }}</view></view><view class="ops-summary"><view class="ops-summary-cell"><strong>{{ job.targetQty }}</strong><text>目标 · {{ unitName(job.unit) }}</text></view><view class="ops-summary-cell"><strong>{{ job.goodQty || 0 }}</strong><text>合格 · {{ unitName(job.unit) }}</text></view><view class="ops-summary-cell"><strong>{{ job.defectQty || 0 }}</strong><text>不良 · {{ unitName(job.unit) }}</text></view><view class="ops-summary-cell"><strong>{{ job.inboundQty || 0 }}</strong><text>生产入库确认 · {{ unitName(job.unit) }}</text></view><view class="ops-summary-cell"><strong>{{ job.workHours || 0 }}</strong><text>累计工时 · 小时</text></view></view><view class="mes-actions"><button size="mini" @click="orderTrace">查看订单与照片追溯</button><button size="mini" @click="raiseException">登记生产异常</button><button size="mini" @click="showSnapshot = !showSnapshot">{{ showSnapshot ? '收起采用内容' : '查看采用包装内容' }}</button></view><view v-if="showSnapshot" class="ops-section"><view class="ops-note">{{ snapshotSummary }}</view><view v-if="snapshotMaterials.length" class="mes-table"><uni-table border><uni-tr><uni-th>物料编码</uni-th><uni-th>物料名称</uni-th><uni-th>规格</uni-th></uni-tr><uni-tr v-for="(row, index) in snapshotMaterials" :key="index"><uni-td>{{ row.materialCode || row.material_code || '—' }}</uni-td><uni-td>{{ row.materialName || row.material_name || '—' }}</uni-td><uni-td>{{ row.specModel || row.spec_model || '—' }}</uni-td></uni-tr></uni-table></view></view></view>
      <view class="ops-layout ops-section">
        <view class="ops-panel"><view class="ops-panel-title">执行记录 · {{ events.length }} 条</view><view v-if="!events.length" class="ops-empty">工单已建立，开工后各班次报工记录将在这里显示。</view><view class="ops-timeline"><view v-for="(event, index) in events" :key="event._id || index" class="ops-timeline-item"><view class="ops-row-title">{{ eventName(event.type) }} · {{ event.actorName || '实际操作账号' }}</view><view class="ops-row-detail">{{ formatDate(event.at || event.createdAt) }}<view v-if="event.date">{{ event.date }} · {{ name('shifts', event.shiftId) }}</view><view v-if="event.type === 'report'">合格 {{ event.goodQty }} / 不良 {{ event.defectQty }} {{ unitName(event.unit || job.unit) }} · {{ event.workHours }} 小时</view><view v-if="event.type === 'inbound'">生产入库确认 {{ event.qty }} {{ unitName(event.unit || job.unit) }}{{ event.documentNo ? ' · 单据 ' + event.documentNo : '' }}</view><view v-if="event.parameters">开工参数：{{ event.parameters }}</view><view v-if="event.note">{{ event.note }}</view></view></view></view></view>
        <view class="ops-panel"><view class="ops-panel-title">记录本次操作</view><view v-if="!commands.length" class="ops-empty">此工单已完工，执行记录已保留。</view><template v-else><view class="ops-tabs"><button v-for="item in commands" :key="item.value" size="mini" :class="{ selected: command === item.value }" :disabled="saving" @click="selectCommand(item.value)">{{ item.text }}</button></view><view class="ops-hint">{{ commandHint }}</view><operation-fields v-model="form" :fields="fields" :disabled="saving || loading" /><view v-if="formError" class="mes-error">{{ formError }}</view><view v-if="notice" class="ops-success">{{ notice }}</view><view class="mes-footer"><button type="primary" size="mini" :disabled="saving || loading || !command" @click="execute">{{ saving ? '记录中…' : commandLabel }}</button></view></template></view>
      </view>
    </view>
  </view>
</template>
<script>
import OperationFields from '@/components/mes/operations/OperationFields.vue';
import { requireMesAdmin, formatMesDate, confirmMes } from '@/utils/mes-api.js';
import { callOperations, emptyCatalogs, options, catalogName, stateName, unitName, operationRequest, today } from '@/utils/operations-admin.js';
const LABELS = { start: '开工', pause: '暂停', resume: '继续生产', report: '提交报工', inbound: '确认生产入库', complete: '确认完工' };
function blank() { return { equipmentId: '', mouldId: '', parameters: '', date: today(), shiftId: '', goodQty: '', defectQty: '', workHours: '', qty: '', documentNo: '', note: '' }; }
export default {
  components: { OperationFields },
  data() { return { id: '', authorized: false, catalogs: emptyCatalogs(), job: null, events: [], loading: false, saving: false, error: '', formError: '', notice: '', command: '', form: blank(), request: null, showSnapshot: false }; },
  computed: {
    commands() { if (!this.job) return []; const keys = this.job.state === 'planned' ? ['start'] : this.job.state === 'running' ? ['report', 'pause', 'inbound', 'complete'] : this.job.state === 'paused' ? ['resume', 'report', 'inbound', 'complete'] : this.job.state === 'completed' ? ['inbound'] : []; return keys.map(value => ({ value, text: LABELS[value] })); },
    commandLabel() { return LABELS[this.command] || '请选择操作'; },
    commandHint() { return ({ start: '选择实际使用的设备、模具并记录开工参数。', report: '按生产日期和班次记录本次新增合格量、不良量及工时，提交后保留原始记录。', inbound: '记录本次新增的生产入库确认数量，供生产追溯；不执行仓库库存过账。', pause: '说明暂停原因。', resume: '说明继续生产的情况。', complete: '核对累计报工数量后说明完工情况。完工后停止新增报工，仍可确认入库。' })[this.command] || ''; },
    fields() {
      const job = this.job;
      const resources = this.catalogs.resources.filter(row => row.workshopId === job.workshopId && (!row.processId || row.processId === job.processId));
      const fields = [];
      if (this.command === 'start') fields.push({ key: 'equipmentId', label: '开工设备（可选）', type: 'select', options: options(resources.filter(row => row.kind === 'equipment'), this.form.equipmentId) }, { key: 'mouldId', label: '使用模具（可选）', type: 'select', options: options(resources.filter(row => row.kind === 'mould'), this.form.mouldId) }, { key: 'parameters', label: '实际开工参数', type: 'textarea', wide: true, placeholder: '例如：封口温度、压力、设备状态与检查结果' });
      if (this.command === 'report') fields.push({ key: 'date', label: '排班生产日', type: 'date', required: true, hint: '八小时夜班 0–8 时归属前一天的排班生产日' }, { key: 'shiftId', label: '班次', type: 'select', required: true, options: options(this.catalogs.shifts) }, { key: 'goodQty', label: '本次合格量 · ' + unitName(job.unit), type: 'number', required: true }, { key: 'defectQty', label: '本次不良量 · ' + unitName(job.unit), type: 'number', required: true }, { key: 'workHours', label: '本次工时（小时）', type: 'number', required: true });
      if (this.command === 'inbound') fields.push({ key: 'qty', label: '本次生产入库确认 · ' + unitName(job.unit), type: 'number', required: true }, { key: 'documentNo', label: '入库单号（可选）' });
      fields.push({ key: 'note', label: ['pause', 'resume', 'complete'].includes(this.command) ? '操作原因 / 说明' : '操作说明（可选）', type: 'textarea', required: ['pause', 'resume', 'complete'].includes(this.command), wide: true });
      return fields;
    },
    snapshotMaterials() { const order = this.job.orderSnapshot || {}; return (order.packagingSnapshot || order).materials || []; },
    snapshotSummary() { const order = this.job.orderSnapshot || {}; const snapshot = order.packagingSnapshot || order; const pallet = snapshot.pallet || order.pallet || {}; return `包装规格：${snapshot.packSpec || order.packSpec || '—'}\n客户：${snapshot.customerName || order.customerName || '—'}\n上托：${pallet.status === 'confirmed' && pallet.casesPerPallet ? pallet.casesPerPallet + ' 箱/托' : '待确认'}\n包装要求：${pallet.requirements || '—'}`; }
  },
  async onLoad(query) { this.id = query.id || ''; if (!this.id) { this.error = '缺少工单编号，请返回工单清单。'; return; } try { await requireMesAdmin(); const data = await callOperations('bootstrap'); this.catalogs = { ...emptyCatalogs(), ...data.catalogs }; this.authorized = true; await this.reload(); } catch (error) { this.error = error.message; } },
  methods: {
    stateName, unitName, formatDate: formatMesDate,
    name(type, id) { return catalogName(this.catalogs, type, id); },
    eventName(type) { return ({ created: '建立工单', create: '建立工单', start: '开工', report: '班次报工', pause: '暂停', resume: '继续生产', inbound: '生产入库确认', complete: '完工' })[type] || type; },
    back() { uni.navigateTo({ url: '/pages/mes/operations/jobs' }); },
    orderTrace() { uni.navigateTo({ url: '/pages/mes/orders/trace?orderNo=' + encodeURIComponent(this.job.orderNo) }); },
    raiseException() { uni.navigateTo({ url: '/pages/mes/operations/exceptions?jobId=' + encodeURIComponent(this.id) }); },
    selectCommand(command) { if (this.saving) return; this.command = command; this.form = blank(); this.formError = ''; this.notice = ''; this.request = null; },
    async reload() { if (!this.authorized || this.loading || this.saving) return; this.loading = true; this.error = ''; try { const data = await callOperations('getJob', { id: this.id }); this.job = data.job; this.events = data.events || []; if (!this.commands.some(item => item.value === this.command)) this.selectCommand(this.commands.length ? this.commands[0].value : ''); } catch (error) { this.error = error.message; } finally { this.loading = false; } },
    async execute() {
      if (this.saving || this.loading || !this.command || !this.job) return;
      this.formError = ''; this.notice = '';
      const missing = this.fields.find(field => field.required && !String(this.form[field.key] == null ? '' : this.form[field.key]).trim());
      if (missing) { this.formError = '请填写或选择' + missing.label; return; }
      const payload = {};
      this.fields.forEach(field => { if (field.type === 'number') payload[field.key] = Number(this.form[field.key]); else payload[field.key] = this.form[field.key]; });
      if (this.fields.some(field => field.type === 'number' && (!Number.isFinite(payload[field.key]) || payload[field.key] < 0))) { this.formError = '数量和工时须为不小于 0 的数字。'; return; }
      if (this.command === 'complete' && !await confirmMes('确认完工', `批号 ${this.job.batchNo} 已报合格 ${this.job.goodQty || 0}、不良 ${this.job.defectQty || 0} ${unitName(this.job.unit)}，确认结束该工序？`)) return;
      const content = { id: this.id, command: this.command, payload }; const request = operationRequest(this.request, content); if (request !== this.request) request.expectedVersion = this.job.version; this.request = request; const action = { ...content, expectedVersion: request.expectedVersion };
      this.saving = true;
      try { const result = await callOperations('jobCommand', { ...action, requestId: this.request.id }); this.job = result; this.form = blank(); this.request = null; this.notice = '执行记录已保存。'; this.saving = false; await this.reload(); }
      catch (error) { this.formError = error.message + (error.code === 409 ? ' 工单已变化，请刷新后核对最新记录再操作。' : ' 保持内容不变可重试。'); }
      finally { this.saving = false; }
    }
  }
};
</script>
<style lang="scss" scoped>@import './operations.scss';</style>
