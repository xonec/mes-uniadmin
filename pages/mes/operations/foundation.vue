<template>
  <view class="mes-page">
    <view class="mes-header"><view><view class="mes-title">{{ pageTitle }}</view><view class="mes-description">{{ typeHint }}</view></view><view class="mes-actions"><button size="mini" :disabled="busy || saving" @click="load">刷新资料</button></view></view>
    <view v-if="error" class="mes-error">{{ error }}</view>
    
    <view v-if="authorized">
      <view class="ops-filter-panel mes-toolbar"><view class="mes-filter"><uni-data-select v-model="status" :localdata="[{ value: 'active', text: '启用资料' }, { value: 'inactive', text: '已停用' }, { value: '', text: '全部状态' }]" :clear="false" /></view><view v-if="showWorkshopFilter" class="mes-filter"><uni-data-select v-model="workshopFilter" :localdata="workshopOptions" placeholder="全部车间" /></view><text class="ops-hint">筛选结果 {{ filteredRows.length }} 条</text></view>
      <view class="ops-layout ops-layout-list">
        <view class="ops-panel">
          <view class="mes-toolbar"><input v-model="keyword" class="mes-search" placeholder="查找编码或名称" /><button size="mini" :disabled="saving || busy" @click="edit()">新增{{ typeLabel }}</button></view>
          <view v-if="busy" class="ops-empty">正在读取基础资料…</view>
          <view v-else-if="error && !rows.length" class="ops-empty">基础资料读取失败，请点击“刷新资料”重试。</view><view v-else-if="!rows.length" class="ops-empty">没有匹配的{{ typeLabel }}。可调整筛选，或点击“新增{{ typeLabel }}”建立资料。</view>
          <view v-if="rows.length" class="mes-table"><uni-table border :loading="busy" emptyText="暂无匹配资料"><uni-tr><uni-th>名称 / 编码</uni-th><uni-th>{{ secondaryHeading }}</uni-th><uni-th width="100">状态</uni-th><uni-th width="90">版本</uni-th><uni-th width="100">操作</uni-th></uni-tr><uni-tr v-for="row in rows" :key="row._id"><uni-td><view class="ops-row-title">{{ row.name }}</view><text class="mes-code ops-hint">{{ row.code }}</text></uni-td><uni-td>{{ details(row) || '—' }}</uni-td><uni-td><text class="ops-status" :class="row.enabled === false ? 'muted' : 'success'">{{ row.enabled === false ? '停用' : '启用' }}</text></uni-td><uni-td>V{{ row.version }}</uni-td><uni-td><button size="mini" :disabled="saving || busy" @click="edit(row)">编辑</button></uni-td></uni-tr></uni-table></view>
          <view class="mes-pagination"><uni-pagination :total="filteredRows.length" :page-size="20" :current="page" @change="page = $event.current" /></view>
        </view>
        <operation-drawer :open="showEditor" :title="(form._id ? '编辑' : '新增') + typeLabel" :busy="busy || saving" @close="showEditor = false"><view class="ops-panel ops-editor-panel">
          <view class="ops-hint">{{ typeHint }}{{ form._id ? ' 编码保持不变，修改后保存新的资料版本。' : '' }}</view>
          <view v-if="showShiftPresets" class="ops-tabs"><button v-for="preset in shiftPresets" :key="preset.code" size="mini" :disabled="saving || busy" @click="usePreset(preset)">{{ preset.name }}</button></view>
          <operation-fields v-model="form" :fields="fields" :disabled="busy || saving" />
          <view v-if="formError" class="mes-error">{{ formError }}</view><view v-if="notice" class="ops-success">{{ notice }}</view>
          <view class="mes-footer"><button type="primary" size="mini" :disabled="busy || saving" @click="save">{{ saving ? '保存中…' : '保存资料' }}</button><button size="mini" :disabled="saving" @click="edit()">清空新建</button></view>
        </view></operation-drawer>
      </view>
    </view>
  </view>
</template>
<script>
import OperationDrawer from '@/components/mes/operations/OperationDrawer.vue';
import OperationFields from '@/components/mes/operations/OperationFields.vue';
import { requireMesAdmin, callMes } from '@/utils/mes-api.js';
import { callOperations, emptyCatalogs, options, catalogName } from '@/utils/operations-admin.js';
import { SHIFT_PRESETS, DAY_OPTIONS, shiftTimeLabel } from '@/utils/shift-presets.js';
const TYPES = [{ value: 'workshops', text: '车间' }, { value: 'processes', text: '工序' }, { value: 'shifts', text: '班次' }, { value: 'resources', text: '设备与模具' }];
const ROLE_OPTIONS = [{ value: 'operator', text: '操作员：自己的排班和工单' }, { value: 'workshop_manager', text: '车间负责人：所在车间' }];
function blank() { return { code: '', name: '', enabled: true, workshopId: '', processId: '', postsText: '', startTime: '', endTime: '', startDayOffset: 0, endDayOffset: 0, systemHours: '', shiftSlot: '', kind: '', parameters: '', changeReason: '' }; }
/** 资料类型配置：标题、说明、专属字段与校验集中在此，新增资料类型只需加一条配置。 */
const TYPE_CONFIG = {
  workshops: {
    title: '车间信息',
    hint: '车间是排班、人员和工单的数据范围。',
    codeLabel: '编码',
    extraFields: () => [],
    details: () => ''
  },
  processes: {
    title: '工序信息',
    hint: '设置工序允许的岗位，一行一个岗位。',
    codeLabel: '编码',
    extraFields: () => [{ key: 'postsText', label: '岗位清单', type: 'textarea', wide: true, placeholder: '每行一个岗位，例如：操作、复核、包装' }],
    normalize: (record, form) => { record.posts = [...new Set(form.postsText.split(/\r?\n/).map(row => row.trim()).filter(Boolean))]; },
    details: (row, vm) => vm.name('workshops', row.workshopId) + ' · ' + ((row.posts || []).join(' / ') || '未限制岗位')
  },
  shifts: {
    title: '班次设置',
    hint: '先选标准预设，再保存。排班日期为生产日，8 小时夜班为次日 00:00—08:00。',
    codeLabel: '编码',
    showPresets: true,
    extraFields: () => [
      { key: 'systemHours', label: '标准班制（自定义可留空）', type: 'select', options: [{ value: 8, text: '8 小时' }, { value: 12, text: '12 小时' }] },
      { key: 'shiftSlot', label: '班别（自定义可留空）', type: 'select', options: [{ value: 'early', text: '早班' }, { value: 'middle', text: '中班（8小时）' }, { value: 'night', text: '夜班 / 中夜班' }] },
      { key: 'startDayOffset', label: '开始日期', type: 'select', required: true, options: DAY_OPTIONS },
      { key: 'endDayOffset', label: '结束日期', type: 'select', required: true, options: DAY_OPTIONS },
      { key: 'startTime', label: '开始时间', type: 'time', required: true },
      { key: 'endTime', label: '结束时间', type: 'time', required: true }
    ],
    details: row => shiftTimeLabel(row)
  },
  resources: {
    hint: '按实际设备或模具登记，开工时选用并记录参数。',
    codeLabel: '编码',
    showResourceKindFilter: true,
    extraFields: (vm, form) => [
      { key: 'kind', label: '类型', type: 'select', required: true, disabled: true, options: [{ value: 'equipment', text: '设备' }, { value: 'mould', text: '模具' }] },
      { key: 'processId', label: '适用工序', type: 'select', required: true, options: options(vm.catalogs.processes.filter(row => row.workshopId === form.workshopId), form.processId) },
      { key: 'parameters', label: '参数与规格说明', type: 'textarea', wide: true }
    ],
    check(form, vm) { return form.processId && !vm.catalogs.processes.some(row => row._id === form.processId && row.workshopId === form.workshopId) ? '适用工序与车间不一致，请重新选择。' : ''; },
    details: (row, vm) => (row.kind === 'mould' ? '模具' : '设备') + ' · ' + vm.name('workshops', row.workshopId) + ' · ' + vm.name('processes', row.processId)
  }
};
/** 需要选择所属车间的资料类型。 */
const WORKSHOP_SCOPED = ['processes', 'resources'];

export default {
  components: { OperationFields, OperationDrawer },
  data() { return { showEditor: false, shiftPresets: SHIFT_PRESETS, type: 'workshops', resourceKind: 'equipment', routeReady: false, catalogs: emptyCatalogs(), authorized: false, busy: false, saving: false, error: '', formError: '', notice: '', keyword: '', page: 1, status: 'active', workshopFilter: '', form: blank() }; },
  computed: {
    typeLabel() { return this.type === 'resources' ? (this.resourceKind === 'mould' ? '模具' : '设备') : TYPES.find(row => row.value === this.type).text; },
    typeConfig() { return TYPE_CONFIG[this.type] || TYPE_CONFIG.workshops; },
    pageTitle() { return this.type === 'resources' ? this.typeLabel + '信息' : this.typeConfig.title; },
    typeHint() { return this.typeConfig.hint; },
    secondaryHeading() { return '资料说明'; },
    showWorkshopFilter() { return !['workshops', 'shifts'].includes(this.type); },
    showShiftPresets() { return !!this.typeConfig.showPresets && !this.form._id; },
    filteredRows() { const key = this.keyword.trim().toLowerCase(); const config = this.typeConfig; return this.catalogs[this.type].filter(row => (!config.showResourceKindFilter || row.kind === this.resourceKind) && (!key || (row.code + ' ' + row.name + ' ' + (row.enterpriseEmployeeNo || '')).toLowerCase().includes(key)) && (this.status === '' || (this.status === 'active' ? row.enabled !== false : row.enabled === false)) && (!this.workshopFilter || row.workshopId === this.workshopFilter)); },
    rows() { return this.filteredRows.slice((this.page - 1) * 20, this.page * 20); },
    workshopOptions() { return options(this.catalogs.workshops); },
    fields() {
      const form = this.form;
      const config = this.typeConfig;
      const fields = [{ key: 'code', label: config.codeLabel, required: true, disabled: !!form._id, maxlength: 80 }, { key: 'name', label: '名称', required: true, maxlength: 100 }];
      if (WORKSHOP_SCOPED.includes(this.type)) fields.push({ key: 'workshopId', label: '所属车间', type: 'select', required: true, options: options(this.catalogs.workshops, form.workshopId) });
      fields.push(...(config.extraFields ? config.extraFields(this, form) : []));
      fields.push({ key: 'enabled', label: '启用资料', type: 'switch' });
      if (form._id) fields.push({ key: 'changeReason', label: '修改原因', type: 'textarea', required: true, wide: true, placeholder: '说明本次资料、权限或启停变更原因' });
      return fields;
    }
  },
  watch: {
    keyword() { this.page = 1; }, status() { this.page = 1; }, workshopFilter() { this.page = 1; },
    '$route.fullPath'() {
      if (this.routeReady && this.$route && this.$route.path === '/pages/mes/operations/foundation') this.applyCategory(this.$route.query || {});
    }
  },
  async onLoad(query = {}) { this.applyCategory(query); this.routeReady = true; await this.load(); },
  methods: {
    applyCategory(query) {
      const type = TYPES.some(item => item.value === query.type) ? query.type : 'workshops';
      const kind = query.kind === 'mould' ? 'mould' : 'equipment';
      if (typeof query.keyword === 'string' && query.keyword) { this.keyword = query.keyword; this.page = 1; }
      if (type !== this.type || kind !== this.resourceKind) {
        this.type = type; this.resourceKind = kind; this.keyword = ''; this.workshopFilter = ''; this.page = 1;
        this.edit(null, false);
      }
      uni.setNavigationBarTitle({ title: this.pageTitle });
    },

    usePreset(preset) { this.form = { ...blank(), ...preset }; this.formError = ''; this.notice = '已填入标准班次，请核对后保存。'; },
    name(type, id) { return catalogName(this.catalogs, type, id); },
    details(row) {
      const config = TYPE_CONFIG[this.type];
      return config && config.details ? config.details(row, this) : this.name('workshops', row.workshopId);
    },
    edit(row, open = true) { this.showEditor = open; this.form = row ? { ...blank(), ...JSON.parse(JSON.stringify(row)), startDayOffset: Number(row.startDayOffset) || 0, endDayOffset: row.endDayOffset == null ? (row.endTime <= row.startTime ? 1 : 0) : row.endDayOffset, postsText: (row.posts || []).join('\n'), changeReason: '' } : { ...blank(), kind: this.type === 'resources' ? this.resourceKind : '' }; this.formError = ''; this.notice = ''; },
    /** 鉴权或资料读取失败后可重新加载，账号列表失败不伪装为空结果。 */
    async load() {
      if (this.busy || this.saving) return;
      this.busy = true; this.error = '';
      try {
        if (!this.authorized) await requireMesAdmin();
        const data = await callOperations('bootstrap');
        this.catalogs = { ...emptyCatalogs(), ...data.catalogs };
        this.authorized = true;
      } catch (error) {
        this.error = error.message;
      } finally {
        this.busy = false;
      }
    },
    async save() {
      if (this.busy || this.saving) return;
      this.formError = ''; this.notice = '';
      const form = this.form;
      const savedType = this.type;
      const savedKind = this.resourceKind;
      const missing = this.fields.find(field => field.required && !String(form[field.key] == null ? '' : form[field.key]).trim());
      if (missing) { this.formError = '请填写或选择' + missing.label; return; }
      const record = { ...form, code: String(form.code).trim(), name: String(form.name).trim() };
      delete record.postsText; delete record.teamId; delete record.teamName;
      const config = this.typeConfig;
      if (config.normalize) config.normalize(record, form, this);
      if (config.check) { const message = config.check(form, this); if (message) { this.formError = message; return; } }
      this.saving = true;
      try {
        const result = await callOperations('saveCatalog', { type: savedType, record, expectedVersion: Number(form.version) || 0 });
        const catalog = this.catalogs[savedType];
        const index = catalog.findIndex(row => row._id === result._id);
        if (index >= 0) catalog.splice(index, 1, result); else catalog.push(result);
        if (this.type === savedType && (savedType !== 'resources' || this.resourceKind === savedKind)) { this.edit(result); this.notice = '资料已保存。'; }
      }
      catch (error) { if (this.type === savedType && (savedType !== 'resources' || this.resourceKind === savedKind)) this.formError = error.message + (error.code === 409 ? ' 请刷新资料后重新打开最新记录。' : ''); else this.error = '资料保存失败：' + error.message; }
      finally { this.saving = false; }
    }
  }
};
</script>
<style lang="scss" scoped>
@import './operations.scss';
.claim-count { display: inline-block; margin-left: 8px; padding: 0 6px; border-radius: 10px; background: $uni-color-primary; color: #fff; font-size: 11px; line-height: 18px; }
</style>