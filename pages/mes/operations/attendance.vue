<template>
  <view class="mes-page">
    <view class="mes-header"><view><view class="mes-title">考勤记录与统计</view><view class="mes-description">排班自动生成记录；支持多工序、实际上下班时间及历史更正。未来记录计入所选月份或年份。</view></view><view class="mes-actions"><button size="mini" :disabled="busy || !summary" @click="exportSummary">导出统计</button><button v-if="isAdmin" size="mini" :disabled="busy" @click="edit()">新增考勤</button></view></view>
    <view v-if="error" class="mes-error">{{ error }}<button size="mini" :disabled="busy" @click="search">重新加载考勤</button></view><view v-if="notice" class="ops-success">{{ notice }}</view><view v-if="conflictNotice" class="ops-success">{{ conflictNotice }}</view>
    <template v-if="authorized">
      <view v-if="conflictCount" class="ops-conflict-card ops-section">
        <view class="ops-conflict-head">
          <view>
            <view class="ops-panel-title">待处理冲突 · {{ conflictCount }} 条</view>
            <view class="ops-hint">排班变更与员工记录不一致，员工端「我的考勤」已改为只读，需由管理员在此确认采用哪一份；处理前统计暂按新排班计。</view>
          </view>
          <view class="mes-actions"><button size="mini" :disabled="busy" :class="{ selected: conflictOnly }" @click="toggleConflictOnly">{{ conflictOnly ? '显示全部记录' : '只看冲突' }}</button><button size="mini" :disabled="busy" @click="refreshConflicts">刷新冲突</button></view>
        </view>
        <view v-if="conflictError" class="mes-error">{{ conflictError }}</view>
        <view v-if="!conflictRows.length" class="ops-empty">{{ conflictOnly ? '当前页没有待处理冲突，可翻页或刷新。' : '当前页没有待处理冲突，可点「只看冲突」定位。' }}</view>
        <view v-for="row in conflictRows" :key="'conflict-' + row._id" class="ops-conflict-row">
          <view class="ops-conflict-meta"><text class="ops-row-title">{{ row.personName }}</text><text class="ops-table-note">{{ personnelCode(row.personId) }} · 生产日 {{ row.date }} · V{{ row.version }}</text><text class="ops-status warning">待处理</text></view>
          <view class="ops-conflict-compare">
            <view class="ops-conflict-side incoming"><view class="ops-conflict-side-title">新排班</view><view v-for="part in conflictParts(row.conflict.incoming)" :key="'in-' + part.label" class="ops-conflict-item"><text>{{ part.label }}</text><text>{{ part.value }}</text></view></view>
            <view class="ops-conflict-side retained"><view class="ops-conflict-side-title">本人记录</view><view v-for="part in conflictParts(row.conflict.retained)" :key="'re-' + part.label" class="ops-conflict-item"><text>{{ part.label }}</text><text>{{ part.value }}</text></view></view>
          </view>
          <view class="ops-conflict-actions"><button type="primary" size="mini" :disabled="busy || !!conflictBusyId" @click="askResolve(row, 'schedule')">采用新排班</button><button size="mini" :disabled="busy || !!conflictBusyId" @click="askResolve(row, 'retained')">保留本人记录</button><text v-if="conflictBusyId === row._id" class="ops-table-note">处理中…</text></view>
        </view>
      </view>
      <view class="ops-filter-panel"><operation-fields v-model="filters" :fields="filterFields" :disabled="busy" /></view>
      <view class="mes-actions ops-section"><button type="primary" size="mini" :disabled="busy" @click="search">{{ loading ? '读取中…' : '查询考勤' }}</button><button v-if="isAdmin" size="mini" :disabled="busy || filters.periodType !== 'month'" @click="sync">从已有排班补齐本月考勤</button></view>
      <view v-if="summary" class="ops-summary ops-section"><view class="ops-summary-cell"><strong>{{ summary.attendanceDays }}</strong><text>{{ summary.persons.length > 1 ? '累计出勤人天' : '出勤天数' }}</text></view><view class="ops-summary-cell"><strong>{{ summary.workHours }}</strong><text>总工时 · 小时</text></view><view class="ops-summary-cell"><strong>{{ participationCount }}</strong><text>工序参与次数</text></view></view>
      <view v-if="summary" class="ops-hint">{{ summary.from }} 至 {{ summary.to }} · 同一员工同日多个班次只计一天，工时相加；多工序各记一次参与。{{ summary.conflictCount ? '其中 ' + summary.conflictCount + ' 条冲突待管理员处理，暂按新排班统计。' : '' }}</view>
      <view v-if="summary && summary.persons.length" class="mes-table ops-section"><uni-table border :emptyText="error ? '读取失败，请重新加载' : '暂无统计'"><uni-tr><uni-th>员工</uni-th><uni-th>出勤天数</uni-th><uni-th>总工时</uni-th><uni-th>工序参与次数</uni-th></uni-tr><uni-tr v-for="person in summary.persons" :key="person.personId"><uni-td><view class="ops-cell-stack"><text>{{ person.personName }}</text><text class="ops-table-note">{{ personnelCode(person.personId) }}</text></view></uni-td><uni-td>{{ person.attendanceDays }}</uni-td><uni-td>{{ person.workHours }}</uni-td><uni-td>{{ countsLabel(person.processCounts) }}</uni-td></uni-tr></uni-table></view>
      <view class="ops-layout ops-layout-list ops-section">
        <view class="ops-panel"><view class="mes-toolbar"><input v-model="keyword" class="mes-search" placeholder="姓名 / 班次 / 工序（筛选明细）" @confirm="searchRows" /><button size="mini" :disabled="busy" @click="searchRows">筛选明细</button><button size="mini" :disabled="busy" :class="{ selected: conflictOnly }" @click="toggleConflictOnly">{{ conflictOnly ? '显示全部' : '只看冲突' + (conflictCount ? '（' + conflictCount + '）' : '') }}</button><button size="mini" :disabled="busy || !rows.length" @click="exportRows">导出当前页</button></view>
          <view class="ops-panel-title">考勤明细 · {{ total }} 条</view>
          <view class="mes-table"><uni-table border :loading="loading" :emptyText="error ? '读取失败，请重新加载' : '暂无考勤记录'"><uni-tr><uni-th width="160">员工 / 生产日</uni-th><uni-th>班次与工序</uni-th><uni-th width="180">实际时间 / 工时</uni-th><uni-th width="140">来源 / 状态</uni-th><uni-th width="140">操作</uni-th></uni-tr><uni-tr v-for="row in rows" :key="row._id"><uni-td><view class="ops-cell-stack"><text class="ops-row-title">{{ row.personName }}</text><text class="ops-table-note">{{ personnelCode(row.personId) }}</text><text>{{ row.date }}</text><text class="ops-table-note">V{{ row.version }}</text></view></uni-td><uni-td><view class="ops-cell-stack"><text>{{ row.kind === 'rest' ? absenceLabel(row) : row.shiftName }}</text><text class="ops-table-note">{{ (row.processNames || []).join('、') || '—' }}</text><view v-if="row.conflict" class="ops-table-note"><view>新排班：{{ label(row.conflict.incoming) }}</view><view>本人记录：{{ label(row.conflict.retained) }}</view><view>待管理员在上方冲突卡片处理。</view></view></view></uni-td><uni-td><view class="ops-cell-stack"><text>{{ row.kind === 'rest' ? '—' : timeLabel(row) }}</text><text class="ops-row-title">{{ row.workHours || 0 }} 小时</text></view></uni-td><uni-td><view class="ops-cell-stack"><text>{{ row.source === 'schedule' ? '排班生成' : '自行新增' }}</text><text class="ops-status" :class="row.conflict ? 'warning' : row.kind === 'rest' ? 'muted' : 'success'">{{ row.conflict ? '待处理冲突' : row.kind === 'rest' ? absenceLabel(row) : '出勤' }}</text><text v-if="row.scheduleRemoved" class="ops-table-note">排班已移除</text><text class="ops-table-note">{{ time(row.updatedAt) }}</text></view></uni-td><uni-td><view class="ops-cell-actions"><button v-if="isAdmin" size="mini" :disabled="busy || !!row.conflict" @click="edit(row)">编辑</button><button size="mini" :disabled="busy" @click="showHistory(row)">历史</button></view></uni-td></uni-tr></uni-table></view>
          <uni-pagination :total="total" :page-size="20" :current="page" @change="changePage" />
        </view>
        <operation-drawer v-if="isAdmin" :open="showEditor" :title="form._id ? '编辑考勤' : '新增考勤'" :busy="busy" @close="showEditor = false"><view class="ops-panel ops-editor-panel"><view class="ops-hint">实际工时由上下班时间自动计算，不扣休息、吃饭时间。工序可多选，工时只记一次。</view><operation-fields :modelValue="form" @update:modelValue="changeForm" :fields="editFields" :disabled="busy" /><view class="ops-hint">本条工时：{{ form.kind === 'rest' ? 0 : calculatedHours }} 小时</view><view v-if="formError" class="mes-error">{{ formError }}</view><view class="mes-footer"><button type="primary" size="mini" :disabled="busy" @click="save">{{ saving ? '保存中…' : '保存记录' }}</button><button size="mini" :disabled="busy" @click="edit()">清空新建</button></view></view> </operation-drawer>
      </view>
      <operation-drawer :open="showHistoryPanel" :title="historyName + ' · 考勤历史'" :busy="historyLoading" @close="showHistoryPanel = false"><view class="ops-panel ops-editor-panel"><view v-if="historyLoading" class="ops-empty">正在读取历史…</view><view v-if="historyError" class="mes-error">{{ historyError }}</view><view v-if="!historyLoading && !historyError && !versions.length" class="ops-empty">暂无历史版本</view><view class="ops-timeline"><view v-for="row in versions" :key="row.version" class="ops-timeline-item"><view class="ops-row-title">V{{ row.version }} · {{ row.kind === 'rest' ? absenceLabel(row) : '出勤' }} · {{ row.workHours == null ? row.confirmedHours : row.workHours }} 小时</view><view class="ops-row-detail">{{ label(row) }}<view>{{ time(row.audit && row.audit.at) }} · {{ row.audit && row.audit.actorName }} · {{ row.audit && row.audit.reason }}</view><view v-if="row.note">备注：{{ row.note }}</view></view><view v-if="historyChanges(row).length" class="ops-history-diff"><view v-for="change in historyChanges(row)" :key="change.label"><text class="ops-table-note">{{ change.label }}</text><view><text class="ops-diff-before">{{ change.before }}</text><text> → </text><text>{{ change.after }}</text></view></view></view><view v-else-if="row.version === 1" class="ops-table-note">首次记录</view><view v-if="row.scheduleSnapshot" class="ops-review-context"><text>当时排班：{{ label(row.scheduleSnapshot) }}</text></view><view v-if="row.conflict" class="ops-review-context"><text>新排班：{{ label(row.conflict.incoming) }}</text><text>保留的修改：{{ label(row.conflict.retained) }}</text></view></view></view></view></operation-drawer>
    </template>
  </view>
</template>
<script>
import OperationDrawer from '@/components/mes/operations/OperationDrawer.vue';
import OperationFields from '@/components/mes/operations/OperationFields.vue';
import { confirmMes, formatMesDate } from '@/utils/mes-api.js';
import { callOperations, today, exportCsv, options, emptyCatalogs, operationRequest } from '@/utils/operations-admin.js';
import { DAY_OPTIONS, shiftTimeLabel } from '@/utils/shift-presets.js';
function blank() { return { personId: '', date: today(), kind: 'work', shiftId: '', processIds: [], startTime: '', endTime: '', startDayOffset: 0, endDayOffset: 0, note: '', changeReason: '' }; }
export default {
  components: { OperationFields, OperationDrawer },
  data() { return { showEditor: false, showHistoryPanel: false, historyLoading: false, historyError: '', conflictOnly: false, conflictBusyId: '', conflictError: '', conflictNotice: '', pendingResolves: {}, authorized: false, isAdmin: false, loading: false, saving: false, syncing: false, error: '', notice: '', formError: '', rows: [], total: 0, page: 1, keyword: '', filters: { periodType: 'month', period: today().slice(0, 7), workshopId: '', personId: '' }, loadedFilters: null, summary: null, catalogs: emptyCatalogs(), versions: [], historyName: '', lastSelectedMonth: today().slice(5, 7), form: blank(), pendingSave: null }; },
  computed: {
    busy() { return this.loading || this.saving || this.syncing || this.historyLoading; },
    participationCount() { return this.summary ? this.summary.processes.reduce((sum, row) => sum + row.count, 0) : 0; },
    conflictCount() { return this.summary ? Number(this.summary.conflictCount) || 0 : 0; },
    conflictRows() { return this.rows.filter(row => row.conflict); },
    person() { return this.catalogs.personnel.find(row => row._id === this.form.personId); },
    filterFields() { return [{ key: 'periodType', label: '统计周期', type: 'select', required: true, options: [{ value: 'month', text: '按月' }, { value: 'year', text: '按年' }] }, { key: 'period', label: this.filters.periodType === 'year' ? '年份' : '月份', type: this.filters.periodType, required: true, maxlength: 7 }, { key: 'workshopId', label: '车间', type: 'select', options: options(this.catalogs.workshops) }, { key: 'personId', label: '人员', type: 'select', options: options(this.catalogs.personnel.filter(row => (!this.filters.workshopId || row.workshopId === this.filters.workshopId))) }]; },
    editFields() { const person = this.person; const fields = [{ key: 'personId', label: '人员', type: 'select', required: true, disabled: !!this.form._id, options: options(this.catalogs.personnel, this.form.personId) }, { key: 'date', label: '排班生产日', type: 'date', required: true, disabled: this.form.source === 'schedule', hint: '八小时夜班属于前一天的生产日；允许填写未来日期。' }, { key: 'kind', label: '记录类型', type: 'select', required: true, options: [{ value: 'work', text: '出勤' }, { value: 'rest', text: '休息（0小时）' }] }]; if (this.form.kind === 'rest') fields.push({ key: 'absenceType', label: '非出勤状态', type: 'select', options: [{ value: 'rest', text: '休息' }, { value: 'leave', text: '请假' }] }); if (this.form.kind === 'work') fields.push({ key: 'shiftId', label: '班次', type: 'select', required: true, options: options(this.catalogs.shifts, this.form.shiftId) }, { key: 'processIds', label: '参与工序', type: 'multi', required: true, wide: true, options: options(this.catalogs.processes.filter(row => person && row.workshopId === person.workshopId), this.form.processIds) }, { key: 'startDayOffset', label: '开始日期', type: 'select', required: true, options: DAY_OPTIONS }, { key: 'startTime', label: '实际上班时间', type: 'time', required: true }, { key: 'endDayOffset', label: '结束日期', type: 'select', required: true, options: DAY_OPTIONS }, { key: 'endTime', label: '实际下班时间', type: 'time', required: true }); fields.push({ key: 'note', label: '备注', type: 'textarea', wide: true }); if (this.form._id) fields.push({ key: 'changeReason', label: '管理员修改原因', type: 'textarea', required: true, wide: true }); return fields; },
    calculatedHours() { if (!this.form.startTime || !this.form.endTime) return '—'; const minutes = text => Number(text.slice(0, 2)) * 60 + Number(text.slice(3)); const value = (Number(this.form.endDayOffset) * 1440 + minutes(this.form.endTime) - Number(this.form.startDayOffset) * 1440 - minutes(this.form.startTime)) / 60; return Number.isFinite(value) && value > 0 && value <= 24 ? Math.round(value * 100) / 100 : '请核对时间'; }
  },
  watch: {
    'filters.periodType'(value) {
      const period = this.filters.period;
      if (value === 'year') {
        if (/^\d{4}-\d{2}$/.test(period)) this.lastSelectedMonth = period.slice(5, 7);
        this.filters.period = period.slice(0, 4);
      } else if (/^\d{4}$/.test(period)) this.filters.period = period + '-' + this.lastSelectedMonth;
    },
    'filters.workshopId'() { this.filters.personId = ''; }
  },
  async onLoad() { await this.search(); },
  methods: {
    personnelCode(id) { const person = this.catalogs.personnel.find(row => row._id === id); return person ? person.code : '历史人员'; },
    conflictParts(side) {
      if (!side) return [];
      const rest = side.kind === 'rest';
      const parts = [
        { label: '类型', value: rest ? this.absenceLabel(side) : '出勤' },
        { label: '班次', value: rest ? '—' : side.shiftName || '—' },
        { label: '工序', value: rest ? '—' : (side.processNames || [side.processName]).filter(Boolean).join('、') || '—' },
        { label: '时间', value: rest ? '—' : shiftTimeLabel(side) },
        { label: '工时', value: (side.workHours == null ? 0 : side.workHours) + ' 小时' }
      ];
      if (side.note) parts.push({ label: '备注', value: side.note });
      return parts;
    },
    async toggleConflictOnly() { if (this.busy) return; this.conflictOnly = !this.conflictOnly; this.conflictError = ''; this.conflictNotice = ''; await this.searchRows(); },
    async refreshConflicts() { if (this.busy) return; this.conflictOnly = true; this.conflictError = ''; this.conflictNotice = ''; await this.search(); },
    async askResolve(row, choice) {
      if (this.busy || this.conflictBusyId) return;
      const adopt = choice === 'schedule';
      const confirmed = await confirmMes(adopt ? '采用新排班' : '保留本人记录', (adopt ? '将整条考勤改为新排班内容，员工原修改进入历史。' : '保留员工本人修改，新排班不再覆盖，本次修改进入历史。') + '\n员工：' + row.personName + ' · 生产日：' + row.date + '。处理后不可撤销，可到「历史」核对。');
      if (!confirmed) return;
      await this.resolveConflict(row, choice);
    },
    async resolveConflict(row, choice) {
      if (this.busy || this.conflictBusyId) return;
      this.conflictError = ''; this.conflictNotice = '';
      const request = operationRequest(this.pendingResolves[row._id], { id: row._id, choice });
      this.pendingResolves[row._id] = request;
      this.conflictBusyId = row._id;
      try {
        await callOperations('resolveAttendanceConflict', { id: row._id, choice, expectedVersion: Number(row.version) || 0, requestId: request.id });
        delete this.pendingResolves[row._id];
        this.conflictNotice = '已' + (choice === 'schedule' ? '采用新排班' : '保留本人记录') + '：' + row.personName + ' · ' + row.date + '。';
        await this.search();
      } catch (error) {
        if (error && error.code === 403) this.conflictError = error.message + ' 管理员处理权限尚未在云端生效，需工程上传新版考勤权限后再试。';
        else if (error && error.code === 409) { this.conflictError = error.message; await this.search(); }
        else this.conflictError = (error && error.message) || '处理失败，请重试。';
      } finally { this.conflictBusyId = ''; }
    },
    historyChanges(row) { const old = this.versions.find(item => item.version === row.version - 1); if (!old) return []; const fields = [['kind','记录类型'],['absenceType','休息／请假'],['shiftName','班次'],['processNames','工序'],['startTime','上班时间'],['endTime','下班时间'],['startDayOffset','开始日期'],['endDayOffset','结束日期'],['workHours','工时'],['note','备注']]; const format = (key,value) => value == null || value === '' ? '未记录' : key === 'absenceType' ? value === 'leave' ? '请假' : '休息' : key === 'kind' ? value === 'rest' ? '休息' : '出勤' : key.endsWith('DayOffset') ? Number(value) ? '次日' : '当天' : Array.isArray(value) ? value.join('、') || '无' : String(value); return fields.filter(([key]) => JSON.stringify(old[key] == null ? null : old[key]) !== JSON.stringify(row[key] == null ? null : row[key])).map(([key,label]) => ({ label, before: format(key,old[key]), after: format(key,row[key]) })); },
    time: formatMesDate, timeLabel: shiftTimeLabel,
    countsLabel(value) { return Object.entries(value || {}).map(([name, count]) => name + ' ' + count + '次').join('、') || '—'; },
    absenceLabel(row) { return row && row.absenceType === 'leave' ? '请假' : '休息'; },
    label(row) { return !row ? '—' : row.kind === 'rest' ? this.absenceLabel(row) : (row.shiftName || '—') + ' / ' + (row.processNames || [row.processName]).filter(Boolean).join('、') + ' · ' + shiftTimeLabel(row); },
    changeForm(next) { if (next.personId !== this.form.personId) next.processIds = []; if (next.shiftId && next.shiftId !== this.form.shiftId) { const shift = this.catalogs.shifts.find(row => row._id === next.shiftId); if (shift) Object.assign(next, { startTime: shift.startTime, endTime: shift.endTime, startDayOffset: Number(shift.startDayOffset) || 0, endDayOffset: shift.endDayOffset == null ? (shift.endTime <= shift.startTime ? 1 : 0) : Number(shift.endDayOffset) }); } this.form = next; },
    edit(row) { this.showEditor = true; this.form = row ? { ...blank(), ...JSON.parse(JSON.stringify(row)), changeReason: '' } : blank(); this.formError = ''; this.pendingSave = null; },
    async search() { if (this.busy) return; this.page = 1; this.loading = true; this.error = ''; this.summary = null; this.rows = []; this.versions = []; const filters = { ...this.filters }; try { if (!this.authorized) { const base = await callOperations('bootstrap'); if (!base.profile.isAdmin && base.profile.scopeRole !== 'workshop_manager') throw new Error('此页面需要车间负责人或管理员身份'); this.isAdmin = base.profile.isAdmin; this.catalogs = { ...emptyCatalogs(), ...base.catalogs }; this.authorized = true; } const [summary, result] = await Promise.all([callOperations('attendanceSummary', filters), callOperations('listAttendance', { ...filters, keyword: this.keyword, conflictOnly: this.conflictOnly, page: 1, pageSize: 20 })]); this.summary = summary; this.rows = result.list; this.total = result.total; this.loadedFilters = filters; } catch (error) { this.error = error.message; this.total = 0; this.loadedFilters = null; } finally { this.loading = false; } },
    async searchRows() { if (this.busy || !this.loadedFilters) return; this.page = 1; await this.loadRows(); },
    async loadRows() { if (this.busy || !this.loadedFilters) return; this.loading = true; this.error = ''; try { const data = await callOperations('listAttendance', { ...this.loadedFilters, keyword: this.keyword, conflictOnly: this.conflictOnly, page: this.page, pageSize: 20 }); this.rows = data.list; this.total = data.total; } catch (error) { this.rows = []; this.total = 0; this.error = error.message; } finally { this.loading = false; } },
    changePage(event) { this.page = event.current; this.loadRows(); },
    async save() { if (this.busy) return; this.formError = ''; const required = this.editFields.find(field => field.required && (!String(this.form[field.key] == null ? '' : this.form[field.key]).trim() || Array.isArray(this.form[field.key]) && !this.form[field.key].length)); if (required) { this.formError = '请填写或选择' + required.label; return; } const record = { ...this.form }; this.pendingSave = operationRequest(this.pendingSave, record); this.saving = true; try { const result = await callOperations('saveAttendance', { record, expectedVersion: Number(record.version) || 0, requestId: this.pendingSave.id }); this.form = { ...result, changeReason: '' }; this.notice = '考勤记录已保存。'; } catch (error) { this.formError = error.message; } finally { this.saving = false; } if (!this.formError) await this.search(); },
    async showHistory(row) { if (this.busy || this.historyLoading) return; this.showHistoryPanel = true; this.historyLoading = true; this.historyError = ''; this.historyName = row.personName + ' ' + row.date; this.versions = []; try { const result = await callOperations('attendanceHistory', { id: row._id }); this.versions = (result.versions || []).slice().sort((a,b) => b.version - a.version); } catch (error) { this.historyError = error.message; } finally { this.historyLoading = false; } },
    async sync() { if (this.busy || this.filters.periodType !== 'month') return; this.syncing = true; this.error = ''; this.notice = ''; let cursor = '', count = 0, syncError = '';  try { do { const data = await callOperations('syncAttendance', { ...this.filters, cursor }); count += data.synced; cursor = data.nextCursor; this.notice = '已同步 ' + count + ' 个人员日期。'; } while (cursor); } catch (error) { syncError = error.message + ' 已完成部分不会重复创建，可再次同步。'; } finally { this.syncing = false; } await this.search(); if (syncError) this.error = syncError; },
    exportSummary() { if (!this.summary || this.busy) return; exportCsv('考勤统计_' + this.summary.from + '_' + this.summary.to + '.csv', [{ key: 'personName', label: '员工' }, { key: 'attendanceDays', label: '出勤天数' }, { key: 'workHours', label: '总工时' }, { key: 'counts', label: '工序参与次数' }], this.summary.persons.map(row => ({ ...row, counts: this.countsLabel(row.processCounts) }))); },
    exportRows() { if (this.busy) return; exportCsv('考勤明细_当前页.csv', [{ key: 'personName', label: '员工' }, { key: 'date', label: '生产日' }, { key: 'description', label: '班次工序与时间' }, { key: 'workHours', label: '工时' }, { key: 'source', label: '来源' }, { key: 'conflictStatus', label: '冲突' }, { key: 'version', label: '版本' }], this.rows.map(row => ({ ...row, description: this.label(row), source: row.source === 'schedule' ? '排班生成' : '自行新增', conflictStatus: row.conflict ? '待管理员处理' : '无' }))); }
  }
};
</script>
<style lang="scss" scoped>@import './operations.scss';</style>
