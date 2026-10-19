<template>
  <view class="mes-page schedule-page">
    <view class="mes-header">
      <view><view class="mes-title">生产计划 · 每日排班</view><view class="mes-description">导入排班表，按工序查看早、中、晚班安排。</view></view>
      <view class="mes-actions"><button size="mini" :disabled="loading || saving || importing" @click="edit()">新增排班</button><button size="mini" :disabled="loading || importing || previewing" @click="reload">刷新</button></view>
    </view>
    <view v-if="error" class="mes-error">{{ error }}</view>
    <view v-if="authorized">
      <view class="ops-panel schedule-import-card">
        <view class="schedule-card-header"><view><view class="ops-panel-title">导入排班 Excel</view><text class="ops-table-note">选择文件后自动识别日期、班次和工序</text></view><button class="schedule-link" size="mini" :disabled="fileLoading || importing || previewing" @click="showAdvanced = !showAdvanced">{{ showAdvanced ? '收起高级设置' : '高级设置' }}</button></view>
        <view class="schedule-scope"><operation-fields v-model="batchSettings" :fields="batchFields" :disabled="fileLoading || importing || previewing" /><text class="ops-table-note">{{ batchSettings.replaceDay ? '完整日表：本车间未列出的人员记为休息，未上传的日期保持原记录。' : '补充排班：保留原有安排。' }}</text></view>
        <button class="schedule-upload" :disabled="fileLoading || importing || previewing" @click="chooseFile" @dragover.prevent @drop.prevent="dropFiles">
          <uni-icons type="upload" size="30" color="inherit" /><text class="schedule-upload-title">{{ fileLoading ? fileProgress : importFiles.length ? '重新选择排班文件' : '点击选择或拖入排班文件' }}</text><text class="ops-table-note">可一次选择多个文件 · Excel / CSV · 每个文件不超过 5MB</text>
        </button>
        <view v-if="importFiles.length" class="schedule-file-summary"><text>{{ fileName }}</text><button class="schedule-link" size="mini" :disabled="fileLoading || importing || previewing" @click="showFileList = !showFileList">{{ showFileList ? '收起文件' : '查看文件' }}</button></view>
        <view v-if="showFileList || hasFileErrors" class="import-file-list"><view v-for="file in importFiles" :key="file.id" class="import-file"><view class="ops-cell-stack"><text>{{ file.name }}</text><text :class="file.error ? 'ops-inline-error' : 'ops-table-note'">{{ file.error || (file.duplicateOf ? '重复文件，已跳过' : file.loaded ? '读取完成' : '读取中…') }}</text></view><button class="schedule-link" size="mini" :disabled="fileLoading || importing || previewing" @click="removeFile(file.id)">移除</button></view></view>
        <view v-if="importError" class="mes-error">{{ importError }}</view>
        <view v-if="showAdvanced" class="schedule-advanced">
          <view class="ops-panel-title">导入设置</view>
          <operation-fields v-model="batchSettings" :fields="importModeFields" :disabled="fileLoading || importing || previewing" />
          <text class="ops-hint">常用排班表自动识别列与 8 / 12 小时班制；只有非标准表格才需调整以下设置。</text>
          <template v-if="sheets.length">
            <view class="import-sheet-list"><view v-for="(sheet, index) in sheets" :key="sheet.id" class="import-sheet" :class="{ 'active-sheet': sheetIndex === index }"><switch type="checkbox" :checked="sheet.selected" :disabled="importing || previewing" @change="toggleSheet(sheet, $event.detail.value)" /><view class="ops-cell-stack"><text>{{ sheet.fileName }}</text><text class="ops-table-note">{{ sheet.name }} · {{ sheet.rows.length }} 行</text></view><button size="mini" :disabled="importing || previewing" @click="sheetIndex = index; changeSheet()">调整列</button></view></view>
            <operation-fields :modelValue="mapping" @update:modelValue="updateMapping" :fields="mappingFields" :disabled="importing || previewing" />
            <button class="schedule-link" size="mini" :disabled="importing || previewing" @click="showProcessSettings = !showProcessSettings">{{ showProcessSettings ? '收起工序对应关系' : '调整工序对应关系（可选）' }}</button>
            <template v-if="showProcessSettings"><text class="ops-hint">默认同名复用、新名称自动建档。只有需合并到其他工序时才选择；当前浏览器会记住本车间的对应关系。</text><operation-fields :modelValue="processMappings" @update:modelValue="updateProcessMappings" :fields="processMappingFields" :disabled="importing || previewing" /></template>
          </template>
        </view>
        <view v-if="versionConflicts.length" class="schedule-warning"><text>同一天有不同版本，请选择要采用的文件。</text><view v-for="day in versionConflicts" :key="day.date" class="import-version"><text>{{ day.date }}</text><uni-data-select :modelValue="day.chosen" :localdata="day.sources.map(file => ({ value: file.id, text: file.name }))" :clear="false" :disabled="importing || previewing" @update:modelValue="chooseDaySource(day.date, $event)" /></view></view>
        <view v-if="sheets.length && !fileLoading" class="schedule-import-footer"><text class="ops-table-note">{{ previewing ? '正在识别并读取原排班…' : previewReady ? '预览已就绪，核对下方排班后导入。' : '请选择车间，然后查看预览。' }}</text><view class="mes-actions"><button size="mini" :disabled="importing || previewing" @click="preview">{{ previewReady ? '重新识别' : '查看预览' }}</button><button type="primary" size="mini" :disabled="importing || previewing || importStage === '完成' || hasFileErrors || !previewReady || !eligibleCount || (batchSettings.replaceDay && eligibleCount !== previews.length)" @click="importRows">{{ importing ? '导入中…' : importStage === '完成' ? '已导入' : hasImportResults ? '继续导入' : '导入排班' }}</button></view></view>
        <view v-if="importing || hasImportResults" class="ops-import-progress"><text>{{ importStage }}</text><text>{{ importProgress.processed }} / {{ eligibleCount }} 条 · 成功 {{ importProgress.success }} · 失败 {{ importProgress.failure }}</text><progress :percent="eligibleCount ? Math.round(importProgress.processed / eligibleCount * 100) : 0" :show-info="true" /></view>
        <view v-if="importNotice" class="ops-success">{{ importNotice }}</view>
        <view class="plan-toolbar"><text class="ops-table-note">本周已导入 <text class="plan-strong">{{ importedDayCount }}</text> 天排班</text><view class="mes-actions"><button size="mini" :disabled="fileLoading || importing || previewing" @click="clearImportSelection">清空当前导入</button></view></view>
      </view>
      <view v-if="previews.length" class="ops-panel ops-section">
        <view class="schedule-card-header"><view><view class="ops-panel-title">待导入排班</view><text class="ops-table-note">{{ daySummaries.length }} 天 · {{ eligibleCount }} 条可导入<text v-if="newProcessCount"> · {{ newProcessCount }} 个新工序随排班建档</text></text></view><button class="schedule-link" size="mini" @click="showPreviewDetails = !showPreviewDetails">{{ showPreviewDetails ? '收起明细' : '人员明细与来源' }}</button></view>
        <view v-if="problemRows.length" class="schedule-warning schedule-card-header"><text>{{ problemRows.length }} 条记录需要处理，处理后即可导入完整日表。</text><button size="mini" @click="showProblems">查看问题</button></view>
        <view class="schedule-calendar"><button v-for="day in daySummaries" :key="day.date" class="schedule-day" :class="{ selected: previewDate === day.date }" @click="previewDate = day.date"><text class="schedule-day-week">{{ weekLabel(day.date) }}</text><text class="schedule-day-number">{{ day.date.slice(5) }}</text><text class="ops-table-note">{{ day.people }} 人</text></button></view>
        <view v-if="previewDaySummary" class="schedule-day-summary"><text>{{ previewDate }}</text><text class="ops-table-note">{{ batchSettings.replaceDay ? '新增 ' + previewDaySummary.added + ' · 修改 ' + previewDaySummary.changed + ' · 保留 ' + previewDaySummary.kept + ' · 移除 ' + previewDaySummary.removed : '补充排班' }} · 自动休息 {{ previewDaySummary.rest }} 人</text><button class="schedule-link" size="mini" @click="showPreviewDetails = true; showDifferences = !showDifferences">{{ showDifferences ? '收起差异' : '查看更新差异' }}</button></view>
        <schedule-roster-grid :groups="previewGrid" :disabled="importing || hasImportResults" @select="reviewRow($event.source)" />
        <view v-if="showPreviewDetails" class="schedule-details">
          <view v-if="showDifferences" class="mes-table"><uni-table border><uni-tr><uni-th>日期 / 人员</uni-th><uni-th>更新</uni-th><uni-th>原安排</uni-th><uni-th>新安排</uni-th></uni-tr><uni-tr v-for="item in pagedDifferences" :key="item.id"><uni-td>{{ item.date }}<view>{{ item.personName }}</view></uni-td><uni-td>{{ item.action }}<view>{{ item.processName }}</view></uni-td><uni-td>{{ item.before ? item.before.kind === 'rest' ? absenceLabel(item.before) : name('shifts', item.before.shiftId) + ' · ' + timeLabel(item.before) : '无原记录' }}</uni-td><uni-td>{{ item.after ? item.after.kind === 'rest' ? absenceLabel(item.after) : name('shifts', item.after.shiftId) + ' · ' + timeLabel(item.after) : '停用旧安排' }}</uni-td></uni-tr></uni-table><uni-pagination :total="differences.length" :page-size="20" :current="differencePage" @change="differencePage = $event.current" /></view>
          <view class="ops-import-counts"><text>预览 {{ previews.length }} 条</text><text>核对通过 {{ eligibleCount }} 条</text><text>需处理 {{ problemRows.length }} 条</text></view><view class="mes-toolbar"><view class="mes-actions"><button size="mini" :type="previewView === 'people' ? 'primary' : 'default'" @click="previewView = 'people'">按人汇总</button><button size="mini" :type="previewView === 'source' ? 'primary' : 'default'" @click="previewView = 'source'">原表明细</button></view><view class="mes-filter"><uni-data-select v-model="previewFilter" :clear="false" :localdata="previewStates" /></view><button size="mini" :disabled="importing || !problemRows.length" @click="exportProblems">导出问题清单</button><text class="ops-hint">显示 {{ previewCount }} 条，每页 20 条</text></view>
          <view v-if="previewView === 'people'" class="mes-table"><uni-table border emptyText="当前筛选没有记录"><uni-tr><uni-th>日期 / 人员</uni-th><uni-th>班次 / 参与工序</uni-th><uni-th>共用时间 / 工时</uni-th><uni-th>状态 / 规则</uni-th><uni-th>原表来源与修改</uni-th></uni-tr><uni-tr v-for="group in pagedPeople" :key="group.id"><uni-td><view class="ops-cell-stack"><text class="ops-row-title">{{ group.personName }}</text><text>{{ group.date }}</text></view></uni-td><uni-td><view class="ops-cell-stack"><text>{{ group.record ? group.record.kind === 'rest' ? absenceLabel(group.record) : name('shifts', group.record.shiftId) : '需修正' }}</text><text>{{ group.processNames.join('、') || '—' }}</text></view></uni-td><uni-td><view v-if="group.record" class="ops-cell-stack"><text>{{ group.record.kind === 'rest' ? '—' : timeLabel(group.record) }}</text><text class="ops-row-title">{{ group.hours }} 小时</text><text class="ops-table-note" v-if="group.processNames.length > 1">多工序共用，工时仅计一次</text></view></uni-td><uni-td><view class="ops-cell-stack"><text class="ops-status" :class="['ready','success'].includes(groupState(group)) ? 'success' : 'warning'">{{ ({ error: '需修正', pending: '待核对', ready: '可导入', success: '已导入', failure: '导入失败', excluded: '已跳过' })[groupState(group)] }}</text><text v-for="row in group.rows" :key="row.previewId" class="ops-table-note">{{ previewMessage(row) }}</text></view></uni-td><uni-td><button size="mini" @click="openPreviewGroup = openPreviewGroup === group.id ? '' : group.id">{{ openPreviewGroup === group.id ? '收起' : '展开 ' + group.rows.length + ' 条来源' }}</button><view v-if="openPreviewGroup === group.id" class="import-source-detail"><view v-for="row in group.rows" :key="row.previewId" class="ops-cell-stack"><text>{{ row.sourceFile }} {{ row.sourceSheet }} {{ row.line ? '第' + row.line + '行' : '' }}</text><text class="ops-table-note">{{ row.processName || absenceLabel(row.record) }} · {{ row.sourceNote || row.record && row.record.note || '无备注' }}</text><text class="ops-inline-error" v-if="row.error || row.batchError">{{ row.error || row.batchError }}</text><button v-if="row.record" size="mini" :disabled="importing || hasImportResults" @click="reviewRow(row)">核对 / 编辑</button></view></view></uni-td></uni-tr></uni-table></view>
          <view v-if="previewView === 'source'" class="mes-table"><uni-table border emptyText="当前筛选没有记录"><uni-tr><uni-th width="180">来源 / 原行号</uni-th><uni-th>人员 / 日期</uni-th><uni-th>班次 / 工序</uni-th><uni-th>时间 / 岗位</uni-th><uni-th>批号 / 原表备注</uni-th><uni-th>核对状态</uni-th><uni-th width="105">操作</uni-th></uni-tr><uni-tr v-for="row in pagedPreviews" :key="row.previewId"><uni-td><view class="ops-cell-stack"><text class="import-source">{{ row.sourceFile }}</text><text class="ops-table-note">{{ row.sourceSheet }} · 第 {{ row.line }} 行</text></view></uni-td><uni-td><view class="ops-cell-stack"><text class="ops-row-title">{{ row.record ? (row.record.personId ? name('personnel', row.record.personId) : row.record.personName) : row.personName || '—' }}</text><text>{{ row.record ? row.record.date : row.originalDate || '—' }}</text><text v-if="row.record && !row.record.personId && !row.requiresPersonSelection" class="ops-table-note">导入时自动建档</text></view></uni-td><uni-td><view class="ops-cell-stack"><text>{{ row.record ? name('shifts', row.record.shiftId) : row.shiftName || '—' }}</text><text class="ops-table-note">{{ row.record ? (row.record.kind === 'rest' ? absenceLabel(row.record) : name('processes', row.record.processId)) : row.processName || '—' }}</text></view></uni-td><uni-td><view v-if="row.record" class="ops-cell-stack"><text>{{ row.record.kind === 'rest' ? absenceLabel(row.record) + ' · 0小时' : timeLabel(row.record) }}</text><text class="ops-table-note">{{ row.record.post || '未指定岗位' }}</text></view></uni-td><uni-td><view class="ops-cell-stack"><text class="ops-batch">{{ row.record ? row.record.batchNos.join('、') || '待派工' : '—' }}</text><text class="ops-table-note">{{ row.sourceNote || row.record && row.record.note || '无备注' }}</text></view></uni-td><uni-td><view class="ops-cell-stack"><text class="ops-status" :class="previewState(row) === 'success' || previewState(row) === 'ready' ? 'success' : 'warning'">{{ previewStateName(row) }}</text><text class="ops-table-note">{{ previewMessage(row) }}</text></view></uni-td><uni-td><button v-if="row.record && !row.excluded" size="mini" :disabled="importing || previewing || hasImportResults" @click="reviewRow(row)">{{ previewState(row) === 'pending' ? '核对' : '编辑' }}</button><text v-if="!row.record" class="ops-table-note">修正原表后预览</text><button size="mini" :disabled="importing || previewing || hasImportResults" @click="togglePreview(row)">{{ row.excluded ? '恢复' : '跳过' }}</button></uni-td></uni-tr></uni-table></view><view class="mes-pagination"><uni-pagination :total="previewCount" :page-size="20" :current="previewPage" @change="previewPage = $event.current" /></view><view v-if="hasImportResults" class="ops-hint">已提交的内容保持不变，可沿用本次内容重试。需更改内容时，请修正原表并重新预览。</view>
        </view>
      </view>
      <operation-drawer :open="!!reviewingRow" title="核对单条排班" :busy="importing" @close="reviewingRow = null"><view v-if="reviewingRow" class="ops-panel ops-editor-panel"><view class="ops-review-context"><text>{{ reviewingRow.sourceFile }} / {{ reviewingRow.sourceSheet }} · 第 {{ reviewingRow.line }} 行 · {{ reviewForm.personName }}</text><text>{{ reviewForm.date }} · {{ reviewForm.kind === 'rest' ? absenceLabel(reviewForm) : name('processes', reviewForm.processId) }}</text><text class="ops-inline-error" v-if="reviewingRow.reviewReason">{{ reviewingRow.reviewReason }}</text><text class="ops-hint">修改后的共用时间会应用到该人员当天同班的所有工序。</text><text class="ops-table-note">{{ reviewingRow.sourceNote || reviewForm.note || '无原表备注' }}</text></view><operation-fields :modelValue="reviewForm" @update:modelValue="changeReviewForm" :fields="reviewFields" :disabled="importing" /><view v-if="reviewError" class="mes-error">{{ reviewError }}</view><view class="mes-footer"><button type="primary" size="mini" :disabled="importing" @click="saveReview">保存核对结果</button><button size="mini" :disabled="importing" @click="reviewingRow = null">取消</button></view></view></operation-drawer>

      <view class="ops-panel ops-section plan-card">
        <view class="schedule-card-header"><view><view class="ops-panel-title">排班日历</view><text class="ops-table-note">已导入日期高亮，未导入灰显；点击日期查看当日排班</text></view><view class="mes-actions"><button size="mini" :disabled="dailyLoading" @click="moveWeek(-1)">上一周</button><view class="schedule-picker"><uni-datetime-picker type="date" :modelValue="dailyDate" :clear-icon="false" :disabled="dailyLoading" @update:modelValue="jumpDate" /></view><button size="mini" :disabled="dailyLoading" @click="moveWeek(1)">下一周</button></view></view>
        <view class="plan-week">
          <button v-for="day in weekDays" :key="day.date" class="plan-day" :class="{ 'is-empty': !day.imported, 'is-selected': day.selected }" :disabled="dailyLoading" @click="loadSavedDay(day.date)">
            <text class="plan-day-week">{{ day.weekday }}</text>
            <text class="plan-day-num">{{ day.day }}</text>
            <text class="plan-day-state">{{ day.imported ? '✓ 已导入' : '—' }}</text>
          </button>
        </view>
        <view class="plan-week-foot"><text class="ops-table-note">本周已导入 {{ importedDayCount }} 天 · 点击日期切换下方表格</text><text v-if="dailyLoading" class="ops-table-note">正在读取当天排班…</text></view>
      </view>

      <view class="ops-panel ops-section plan-card">
        <view class="schedule-card-header"><view><view class="ops-panel-title">每日排班表 <text class="plan-date">（{{ dailyDate }} {{ weekLabel(dailyDate) }}）</text></view><text class="ops-table-note">工序 × 班次人员（与 Excel 一致）；点击人员配置岗位，点击批次查看追溯</text></view></view>
        <view v-if="dailyError" class="mes-error">{{ dailyError }}</view>
        <view v-else-if="dailyLoading" class="ops-empty">正在读取当天完整排班…</view>
        <view v-else-if="!savedGrid.length" class="plan-empty"><text>当天暂无排班。</text><text class="ops-table-note">请在上方导入排班 Excel，或切换到已导入的日期。</text></view>
        <schedule-roster-grid v-else :groups="savedGrid" batch-links :disabled="importing || saving" @select="edit($event.record)" @batch="openBatchTrace" />
        <view class="plan-summary"><text>共 {{ dailyProcessCount }} 道工序 · 批次合计 {{ dailyBatchCount }} 个</text><text class="ops-table-note">点击人员可配置岗位分工</text></view>
      </view>
        <operation-drawer :open="showEditor" :title="form._id ? '编辑排班' : '新增排班'" :busy="saving || importing" @close="showEditor = false"><view class="ops-panel ops-editor-panel"><view v-if="form.importSource" class="ops-review-context"><text>原表来源：{{ form.importSource.fileName || (form.importSource.sources || []).join('、') }}</text><text v-if="form.importSource.sheetName">{{ form.importSource.sheetName }} · 第 {{ form.importSource.line }} 行 · {{ form.importSource.column }}</text><text class="ops-table-note">解析规则：{{ form.importSource.ruleVersion }} · {{ form.importSource.appliedTimeRule || '完整日表自动补齐' }}</text><text v-if="form.importSource.fileHash" class="ops-table-note import-source">文件哈希：{{ form.importSource.fileHash }}</text><text v-if="form.importSource.rawNote" class="ops-table-note">原始备注：{{ form.importSource.rawNote }}</text></view><operation-fields v-model="form" :fields="fields" :disabled="saving || importing" /><view v-if="formError" class="mes-error">{{ formError }}</view><view v-if="notice" class="ops-success">{{ notice }}</view><view class="mes-footer"><button type="primary" size="mini" :disabled="saving || importing" @click="save">{{ saving ? '保存中…' : '保存排班' }}</button><button size="mini" :disabled="saving" @click="edit()">清空新建</button></view></view> </operation-drawer>

    </view>
  </view>
</template>
<script>
import OperationDrawer from '@/components/mes/operations/OperationDrawer.vue';
import OperationFields from '@/components/mes/operations/OperationFields.vue';
import ScheduleRosterGrid from '@/components/mes/operations/ScheduleRosterGrid.vue';
import { scheduleProcessNames, resolveScheduleProcesses, processNameKey, scheduleGrid } from '@/utils/schedule-processes.js';
import { requireMesAdmin, confirmMes } from '@/utils/mes-api.js';
import { callOperations, emptyCatalogs, options, catalogName, today, operationRequest, exportCsv } from '@/utils/operations-admin.js';
import { readScheduleFile, previewScheduleBatch, checkScheduleBatch, scheduleDateSources } from '@/utils/schedule-import.js';
import { completeScheduleRest, summarizeSchedulePeople, scheduleDifferences } from '@/utils/schedule-import-rules.js';
import { DAY_OPTIONS, shiftTimeLabel, applyShift } from '@/utils/shift-presets.js';
// 服务端单次导入上限 200 行；一次按上限提交，减少往返、让预取在更大批次内复用。
const IMPORT_CHUNK_SIZE = 200;
// 收尾接口每页最多 20 条旧排班快照，与导入分片分开。
const FINISH_PAGE_SIZE = 20;
function blank() { return { kind: 'work', note: '', date: today(), shiftId: '', processId: '', personId: '', post: '', batchText: '', startTime: '', endTime: '', startDayOffset: '', endDayOffset: '', enabled: true, changeReason: '' }; }
function blankMapping() { return { mode: 'rows', systemHours: 8, note: '', early: '', middle: '', late: '', startLine: 2, date: '', shiftId: '', processId: '', personId: '', post: '', batchNos: '', startTime: '', endTime: '' }; }
/** 排班导入自动建档的人还没有登录账号，提示管理员到「系统管理 → 账号与权限 → 用户账号 → 批量建号」建号（不在这里建号）。 */
function createdHint(people) {
  const list = people || [];
  if (!list.length) return '';
  const names = list.slice(0, 5).map(item => item.name).join('、');
  return ' 其中 ' + list.length + ' 人尚无登录账号（' + names + (list.length > 5 ? ' 等' : '') + '），请到「系统管理 → 账号与权限 → 用户账号 → 批量建号」建号。';
}
export default {
  components: { OperationFields, OperationDrawer, ScheduleRosterGrid },
  data() { return { showAdvanced: false, showProcessSettings: false, showFileList: false, showPreviewDetails: false, showFilters: false, processPlans: [], previewDate: '', dailyDate: today(), importedMap: {}, dailyRows: [], dailyLoading: false, dailyError: '', processMappings: {}, previewView: 'people', openPreviewGroup: '', dayFileChoice: {}, showDifferences: false, differencePage: 1, showEditor: false, importStage: '', previewPage: 1, previewFilter: '', reviewingRow: null, reviewForm: {}, reviewError: '', dayOptions: DAY_OPTIONS, authorized: false, catalogs: emptyCatalogs(), filters: { dateFrom: today(), dateTo: today(), keyword: '' }, rows: [], total: 0, page: 1, loading: false, saving: false, error: '', formError: '', notice: '', form: blank(), sheets: [], sheetIndex: 0, importFiles: [], batchSettings: { workshopId: '', replaceDay: true }, fileLoading: false, fileProgress: '', previewing: false, mapping: blankMapping(), previews: [], previewReady: false, importing: false, importError: '', importNotice: '', importResults: {}, importRequest: null, importSession: null, previousScope: [] }; },
  computed: {
    fileName() { return this.importFiles.length ? this.importFiles.length + ' 个文件 · ' + this.selectedSheetCount + ' 个工作表待导入' : ''; },
    selectedSheetCount() { return this.sheets.filter(sheet => sheet.selected).length; },
    processMappingFields() {
      return scheduleProcessNames(this.sheets).map(name => ({ key: name, label: name, type: 'select', placeholder: '自动识别 / 按原名称建档', options: options(this.catalogs.processes.filter(row => !row.importPending && row.workshopId === this.batchSettings.workshopId)) }));
    },
    versionConflicts() { return this.dateSources.filter(day => day.sources.length > 1 && !day.identical); },
    previewDaySummary() { return this.daySummaries.find(day => day.date === this.previewDate); },
    previewGrid() { return scheduleGrid(this.checkedPreviews.filter(row => !row.excluded && row.record && row.record.date === this.previewDate).map(row => ({ ...row, record: { ...row.record, processName: this.name('processes', row.record.processId) } })), this.catalogs.shifts); },
    savedGrid() { return scheduleGrid(this.dailyRows.map(row => ({ ...row, processName: row.processName || this.name('processes', row.processId) })), this.catalogs.shifts); },
    newProcessCount() { return new Set(this.processPlans.filter(plan => plan.state === 'new').map(plan => plan.processId)).size; },
    calendarDays() {
      const base = new Date(this.dailyDate + 'T12:00:00Z');
      const weekday = (base.getUTCDay() + 6) % 7;
      return Array.from({ length: 7 }, (_, index) => ({ date: new Date(base.getTime() + (index - weekday) * 86400000).toISOString().slice(0, 10) }));
    },
    weekDays() { return this.calendarDays.map(day => { const date = day.date; return { date, weekday: this.weekLabel(date), day: date.slice(5), imported: !!this.importedMap[date], selected: this.dailyDate === date }; }); },
    importedDayCount() { return this.calendarDays.filter(day => this.importedMap[day.date]).length; },
    dailyProcessCount() { return this.savedGrid.filter(group => !String(group.id).startsWith('absence:')).length; },
    dailyBatchCount() { return new Set(this.savedGrid.flatMap(group => group.batches)).size; },
    dateSources() { return scheduleDateSources(this.sheets, this.dayFileChoice); },
    filteredPeople() { return summarizeSchedulePeople(this.checkedPreviews).filter(group => !this.previewFilter || group.rows.some(row => this.matchesPreviewFilter(row))); },
    pagedPeople() { return this.filteredPeople.slice((this.previewPage - 1) * 20, this.previewPage * 20); },
    previewCount() { return this.previewView === 'people' ? this.filteredPeople.length : this.filteredPreviews.length; },
    differences() { return scheduleDifferences(this.checkedPreviews, this.previousScope); },
    pagedDifferences() { return this.differences.slice((this.differencePage - 1) * 20, this.differencePage * 20); },
    daySummaries() { return [...new Set(this.checkedPreviews.filter(row => row.record).map(row => row.record.date))].sort().map(date => { const rows = this.differences.filter(row => row.date === date); return { date, people: new Set(this.checkedPreviews.filter(row => row.record && row.record.date === date).map(row => row.record.personId || row.record.personName)).size, rest: this.checkedPreviews.filter(row => row.generated && row.record.date === date).length, added: rows.filter(row => row.action === '新增').length, changed: rows.filter(row => row.action === '修改').length, kept: rows.filter(row => row.action === '保留').length, removed: rows.filter(row => row.action === '移除').length }; }); },
    checkedPreviews() { return checkScheduleBatch(this.previews); },
    selectedPreviews() { return this.checkedPreviews.filter(row => !row.excluded); },
    selectedRows() { return this.selectedPreviews.filter(row => !row.error && !row.batchError && row.record && (!row.requiresPersonSelection || row.record.personId) && (!row.needsTimeReview || row.timeReviewed)); },
    hasFileErrors() { return this.importFiles.some(file => file.error); },
    batchFields() { return [{ key: 'workshopId', label: '车间', type: 'select', required: true, options: options(this.catalogs.workshops) }]; },
    importModeFields() { return [{ key: 'replaceDay', label: '按完整日表更新', type: 'switch', hint: '未列出人员自动补齐休息；关闭可补充排班。' }]; },
    filterFields() { return [{ key: 'dateFrom', label: '开始生产日', type: 'date', required: true }, { key: 'dateTo', label: '结束生产日', type: 'date', required: true }, { key: 'keyword', label: '查找人员、工序或批号', placeholder: '姓名 / 工序 / 完整批号' }]; },
    importProgress() { const rows = Object.values(this.importResults); return { processed: rows.length, success: rows.filter(row => row.ok === true).length, failure: rows.filter(row => row.ok === false).length }; },
    previewStates() { return [{ value: '', text: '全部预览' }, { value: 'problems', text: '只看需处理' }, { value: 'pending', text: '待核对' }, { value: 'ready', text: '可导入' }, { value: 'error', text: '原表错误 / 批量冲突' }, { value: 'excluded', text: '已跳过' }, { value: 'failure', text: '导入失败' }, { value: 'success', text: '已导入' }]; },
    hasImportResults() { return Object.keys(this.importResults).length > 0; },
    filteredPreviews() { return this.checkedPreviews.filter(row => this.matchesPreviewFilter(row)); },
    pagedPreviews() { return this.filteredPreviews.slice((this.previewPage - 1) * 20, this.previewPage * 20); },
    problemRows() { return this.checkedPreviews.filter(row => ['pending','error','failure'].includes(this.previewState(row))); },
    reviewFields() { const row = this.reviewingRow; if (!row) return []; const fields = []; if (this.reviewForm.kind === 'rest') fields.push({ key: 'absenceType', label: '非出勤状态', type: 'select', required: true, options: [{ value: 'rest', text: '休息' }, { value: 'leave', text: '请假' }] }); if (row.requiresPersonSelection) fields.push({ key: 'personId', label: '同名人员：选择唯一工号', type: 'select', required: true, options: this.importPersonOptions }); if (this.reviewForm.kind !== 'rest') fields.push({ key: 'shiftId', label: '班次', type: 'select', required: true, options: this.shiftOptions }); if (this.reviewForm.kind !== 'rest') { const process = this.catalogs.processes.find(item => item._id === this.reviewForm.processId); fields.push({ key: 'startDayOffset', label: '开始日期', type: 'select', options: DAY_OPTIONS, required: true }, { key: 'startTime', label: '开始时间', type: 'time', required: true }, { key: 'endDayOffset', label: '结束日期', type: 'select', options: DAY_OPTIONS, required: true }, { key: 'endTime', label: '结束时间', type: 'time', required: true }, { key: 'post', label: '岗位（可选）', type: process && process.posts && process.posts.length ? 'select' : 'text', options: process ? (process.posts || []).map(text => ({ value: text, text })) : [] }); } return fields; },
    importPersonOptions() { return options(this.catalogs.personnel.filter(row => row.workshopId === this.batchSettings.workshopId)); },
    shiftOptions() { return options(this.catalogs.shifts); },
    fields() {
      const process = this.catalogs.processes.find(row => row._id === this.form.processId);
      const persons = process && this.form.kind !== 'rest' ? this.catalogs.personnel.filter(row => row.workshopId === process.workshopId) : this.catalogs.personnel;
      const fields = [{ key: 'kind', label: '排班类型', type: 'select', required: true, options: [{ value: 'work', text: '工作' }, { value: 'rest', text: '休息' }] }, { key: 'date', label: '生产日期', type: 'date', required: true }, { key: 'shiftId', label: '班次', type: 'select', required: this.form.kind !== 'rest', disabled: this.form.kind === 'rest', options: options(this.catalogs.shifts, this.form.shiftId) }, { key: 'processId', label: '工序', type: 'select', required: this.form.kind !== 'rest', disabled: this.form.kind === 'rest', options: options(this.catalogs.processes.filter(row => !row.importPending), this.form.processId) }, { key: 'personId', label: '人员', type: 'select', required: true, options: options(persons, this.form.personId) }, { key: 'post', label: '岗位', type: process && process.posts && process.posts.length ? 'select' : 'text', options: process ? (process.posts || []).map(text => ({ value: text, text })) : [], required: this.form.kind !== 'rest' && !!(process && process.posts && process.posts.length) }, { key: 'batchText', label: '完整生产批号（可选）', type: 'textarea', wide: true, placeholder: '多个批号以逗号或换行分隔', hint: '完整批号和后缀原样保留，例如 APDD26X1006；不使用前缀推断产品。' }, { key: 'startTime', label: '实际排班开始', type: 'time', hint: '留空使用所选班次的开始时间' }, { key: 'endTime', label: '实际排班结束', type: 'time', hint: '留空使用所选班次的结束时间' }, { key: 'startDayOffset', label: '实际开始日期', type: 'select', options: DAY_OPTIONS, hint: '留空采用班次设置；排班日期为生产日' }, { key: 'endDayOffset', label: '实际结束日期', type: 'select', options: DAY_OPTIONS }, { key: 'note', label: '原表备注 / 排班说明', type: 'textarea', wide: true, maxlength: 8000 }, { key: 'enabled', label: '启用排班', type: 'switch' }];
      if (this.form.kind === 'rest') fields.push({ key: 'absenceType', label: '非出勤状态', type: 'select', options: [{ value: 'rest', text: '休息' }, { value: 'leave', text: '请假' }] });
      if (this.form._id) fields.push({ key: 'changeReason', label: '修改原因', type: 'textarea', required: true, wide: true });
      return fields;
    },
    sheetOptions() { return this.sheets.map((sheet, index) => ({ value: index, text: sheet.fileName + ' / ' + sheet.name })); },
    columnOptions() { const rows = (this.sheets[this.sheetIndex] || {}).rows || []; const width = rows.slice(0, 10).reduce((max, row) => Math.max(max, row.length), 0); return Array.from({ length: width }, (_, index) => ({ value: index, text: `${index + 1} 列 · ${String((rows[0] || [])[index] || '').slice(0, 50) || '无标题'}` })); },
    eligibleCount() { return this.selectedRows.length; },
    mappingFields() {
      const wide = this.mapping.mode === 'wide';
      const columns = wide ? [{ key: 'date', label: '排班日期列', required: true }, { key: 'processId', label: '工序名称列', required: true }, { key: 'early', label: '早班人员列', required: true }, { key: 'middle', label: '中班人员列', required: true }, { key: 'late', label: '晚班人员列', required: true }, { key: 'batchNos', label: '批次列' }, { key: 'note', label: '备注列' }] : [{ key: 'date', label: '日期列', required: true }, { key: 'shiftId', label: '班次列', required: true }, { key: 'processId', label: '工序列', required: true }, { key: 'personId', label: '人员列', required: true }, { key: 'post', label: '岗位列' }, { key: 'batchNos', label: '批号列' }, { key: 'note', label: '备注列' }, { key: 'startTime', label: '开始时间列' }, { key: 'endTime', label: '结束时间列' }];
      return [{ key: 'systemHours', label: '横列表默认班制', type: 'select', required: true, options: [{ value: 8, text: '8 小时：早 8–16，中 16–24，夜次日 0–8' }, { value: 12, text: '12 小时：早 8–20，中／夜 20–次日 8' }] }, { key: 'mode', label: '表格格式', type: 'select', required: true, options: [{ value: 'rows', text: '一人一行（班次列）' }, { value: 'wide', text: '早中晚班横列表（多人展开）' }] }, { key: 'startLine', label: '第一条数据所在行', type: 'number', required: true }, ...columns.map(field => ({ ...field, type: 'select', options: this.columnOptions }))];
    }
  },
  watch: {
    previewFilter() { this.previewPage = 1; },
    previewView() { this.previewPage = 1; },
    'form.shiftId'(id, oldId) { if (!id || id === oldId || this.form._id) return; const shift = this.catalogs.shifts.find(row => row._id === id); if (shift) this.form = applyShift(this.form, shift); },
    'batchSettings.workshopId'() { this.restoreProcessMappings(); },
    batchSettings: { deep: true, handler() { this.resetPreview(); this.rememberScope(); } }
  },
  async onLoad() { await this.reload(); },
  methods: {
    weekLabel(date) { return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date + 'T12:00:00Z').getUTCDay()]; },
    matchesPreviewFilter(row) { return !this.previewFilter || (this.previewFilter === 'problems' ? ['pending', 'error', 'failure'].includes(this.previewState(row)) : this.previewState(row) === this.previewFilter); },
    showProblems() { this.showPreviewDetails = true; this.previewFilter = 'problems'; },
    processMappingKey() { return 'mes-schedule-process-mappings:' + this.batchSettings.workshopId; },
    restoreProcessMappings() {
      try { const saved = uni.getStorageSync(this.processMappingKey()); this.processMappings = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; }
      catch (_) { this.processMappings = {}; }
    },
    rememberScope() {
      if (!this.batchSettings.workshopId) return;
      try { uni.setStorageSync('mes-schedule-import-scope', { workshopId: this.batchSettings.workshopId }); } catch (_) {}
    },
    restoreScope() {
      let saved = {};
      try { saved = uni.getStorageSync('mes-schedule-import-scope') || {}; } catch (_) {}
      const workshops = this.catalogs.workshops.filter(row => row.enabled !== false);
      const workshopId = workshops.some(row => row._id === this.batchSettings.workshopId) ? this.batchSettings.workshopId : workshops.some(row => row._id === saved.workshopId) ? saved.workshopId : workshops.length === 1 ? workshops[0]._id : '';
      if (this.batchSettings.workshopId !== workshopId) this.batchSettings = { ...this.batchSettings, workshopId };
      this.restoreProcessMappings();
    },
    dropFiles(event) {
      const transfer = event.dataTransfer || event.originalEvent && event.originalEvent.dataTransfer;
      if (transfer && transfer.files) this.loadFiles(Array.from(transfer.files));
    },
    moveDay(days) { this.loadSavedDay(new Date(Date.parse(this.dailyDate + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10)); },
    /** 翻周并刷新本周「已导入」标记。 */
    async moveWeek(days) { await this.loadSavedDay(new Date(Date.parse(this.dailyDate + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10)); await this.refreshWeekAvailability(); },
    jumpDate(value) { if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) this.loadSavedDay(value); },
    /** 日历高亮：按天只查总数（pageSize=1），避免拉整月排班明细。 */
    async refreshWeekAvailability() {
      const days = this.calendarDays.map(day => day.date);
      const entries = await Promise.all(days.map(async date => {
        try { const data = await callOperations('listSchedules', { dateFrom: date, dateTo: date, page: 1, pageSize: 1 }); return [date, Number(data.total) > 0]; }
        catch (_) { return [date, !!this.importedMap[date]]; }
      }));
      const map = { ...this.importedMap };
      entries.forEach(([date, imported]) => { map[date] = imported; });
      this.importedMap = map;
    },
    openBatchTrace(batch) { if (!batch) return; uni.navigateTo({ url: '/pages/mes/orders/trace?batchNo=' + encodeURIComponent(batch) }); },
    clearImportSelection() {
      if (this.fileLoading || this.importing || this.previewing) return;
      this.importFiles = []; this.sheets = []; this.sheetIndex = 0; this.dayFileChoice = {};
      this.changeSheet(); this.resetPreview(); this.importError = ''; this.importNotice = '';
      uni.showToast({ title: '已清空当前导入选择', icon: 'none' });
    },
    async loadSavedDay(date) {
      if (this.dailyLoading || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
      this.dailyDate = date; this.dailyLoading = true; this.dailyError = ''; this.dailyRows = [];
      try {
        const rows = []; let page = 1, total = 0;
        do {
          const data = await callOperations('listSchedules', { dateFrom: date, dateTo: date, page, pageSize: 50 });
          if (!Array.isArray(data.list)) throw new Error('排班返回不完整，请刷新重试');
          rows.push(...data.list); total = Number(data.total) || 0;
          if (rows.length < total && !data.list.length) throw new Error('排班在读取期间发生变化，请刷新重试');
          page++;
        } while (rows.length < total);
        this.dailyRows = [...new Map(rows.map(row => [row._id, row])).values()];
        this.importedMap = { ...this.importedMap, [date]: this.dailyRows.length > 0 };
      } catch (error) { this.dailyError = error.message || '排班读取失败，请刷新重试'; }
      finally { this.dailyLoading = false; }
    },
    async saveImportProcesses(rows) {
      const used = new Set(rows.filter(row => row.kind === 'work').map(row => row.processId));
      const pending = this.catalogs.processes.filter(row => row.importPending && used.has(row._id));
      for (const process of pending) {
        this.importStage = '正在保存新工序：' + process.name;
        let record;
        try { record = await callOperations('saveCatalog', { type: 'processes', expectedVersion: 0, record: { code: process.code, name: process.name, workshopId: process.workshopId, posts: [], enabled: true, changeReason: '排班导入自动建立工序' } }); }
        catch (error) {
          if (error.code !== 409) throw error;
          const latest = await callOperations('bootstrap');
          record = (latest.catalogs && latest.catalogs.processes || []).find(item => item._id === process._id);
          if (!record || record.enabled === false || record.workshopId !== process.workshopId || processNameKey(record.name) !== processNameKey(process.name)) throw error;
        }
        if (!record || record._id !== process._id) throw new Error('工序保存结果不完整，请按原内容重试');
        this.catalogs.processes = this.catalogs.processes.map(item => item._id === process._id ? record : item);
        this.processPlans = this.processPlans.map(plan => plan.processId === process._id ? { ...plan, state: 'matched' } : plan);
      }
    },
    absenceLabel(row) { return row && row.absenceType === 'leave' ? '请假' : '休息'; },
    groupState(group) { const states = group.rows.map(row => this.previewState(row)); return ['error','failure','pending','excluded','ready','success'].find(state => states.includes(state)) || 'ready'; },
    updateProcessMappings(value) { this.processMappings = value; try { uni.setStorageSync(this.processMappingKey(), value); } catch (_) {} this.resetPreview(); },
    chooseDaySource(date, value) { this.dayFileChoice = { ...this.dayFileChoice, [date]: value }; this.resetPreview(); },
    previewState(row) { if (row.excluded) return 'excluded'; if (row.error || row.batchError) return 'error'; const result = this.resultFor(row.previewId); if (result.ok === true) return 'success'; if (result.ok === false) return 'failure'; return row.requiresPersonSelection && !row.record.personId || row.needsTimeReview && !row.timeReviewed ? 'pending' : 'ready'; },
    previewStateName(row) { return ({ excluded: '已跳过', error: '需修正', pending: '待核对', ready: '可导入', failure: '导入失败', success: '已导入' })[this.previewState(row)]; },
    previewMessage(row) { return (row.excluded ? '本条不导入；可点击恢复' : '') || row.error || row.batchError || this.resultFor(row.previewId).message || (row.requiresPersonSelection && !row.record.personId ? '同名人员，请选择唯一工号' : row.needsTimeReview && !row.timeReviewed ? row.reviewReason || '原表含特殊时间，请核对' : row.timeReviewed && row.needsTimeReview ? '已人工核对' : row.timeRule || ''); },
    reviewRow(row) { if (this.importing || this.hasImportResults || !row || !row.record) return; this.reviewingRow = this.previews.find(item => item.previewId === row.previewId); this.reviewForm = JSON.parse(JSON.stringify(row.record)); this.reviewError = ''; },
    changeReviewForm(next) { if (next.shiftId !== this.reviewForm.shiftId && next.kind !== 'rest') { const shift = this.catalogs.shifts.find(row => row._id === next.shiftId); if (shift) next = applyShift(next, shift); } this.reviewForm = next; },
    saveReview() { const row = this.reviewingRow; if (!row || this.importing) return; this.reviewError = ''; const form = this.reviewForm; if (row.requiresPersonSelection && !form.personId) { this.reviewError = '请选择唯一工号对应的人员'; return; } if (form.kind !== 'rest' && !form.shiftId) { this.reviewError = '请选择班次'; return; } if (form.kind !== 'rest') { if (![form.startTime,form.endTime].every(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || ''))) { this.reviewError = '时间须为 HH:mm'; return; } const minutes = value => Number(value.slice(0,2)) * 60 + Number(value.slice(3)); const duration = Number(form.endDayOffset) * 1440 + minutes(form.endTime) - Number(form.startDayOffset) * 1440 - minutes(form.startTime); if (![form.startDayOffset,form.endDayOffset].every(value => [0,1].includes(Number(value))) || duration <= 0 || duration > 1440) { this.reviewError = '请核对当天／次日，时长须大于0且不超过24小时'; return; } } const previousPerson = row.record.personId; row.record = { ...form, importSource: { ...(form.importSource || {}), appliedTimeRule: '人工核对时间' } }; row.timePriority = 4; row.timeRule = '人工核对时间'; row.timeReviewed = true; if (previousPerson !== form.personId) this.refreshRestRows(); this.reviewingRow = null; },
    refreshRestRows() {
      const reviewed = new Map(this.previews.filter(row => row.generated && row.timePriority === 4).map(row => [row.previewId, row]));
      this.previews = completeScheduleRest(this.previews.filter(row => !row.generated), this.catalogs.personnel, this.batchSettings).map(row => reviewed.get(row.previewId) || row);
    },
    exportProblems() { exportCsv('排班导入问题清单.csv', [{ key: 'sourceFile', label: '来源文件' }, { key: 'sourceSheet', label: '工作表' }, { key: 'line', label: '原表行号' }, { key: 'personName', label: '人员' }, { key: 'date', label: '日期' }, { key: 'status', label: '状态' }, { key: 'message', label: '需处理内容' }], this.problemRows.map(row => ({ sourceFile: row.sourceFile, sourceSheet: row.sourceSheet, line: row.line, personName: row.record ? row.record.personName : row.personName || '', date: row.record ? row.record.date : row.originalDate || '', status: this.previewStateName(row), message: this.previewMessage(row) }))); },
    resetFilters() { if (this.loading || this.importing) return; this.filters = { dateFrom: today(), dateTo: today(), keyword: '' }; this.search(); },
    timeLabel: shiftTimeLabel,
    setPreviewShift(row, id) { const shift = this.catalogs.shifts.find(item => item._id === id); if (!shift) return; row.record = applyShift(row.record, shift); row.timeReviewed = false; row.needsTimeReview = true; },
    name(type, id) { return catalogName(this.catalogs, type, id); },
    resultFor(line) { return this.importResults[line] || {}; },
    edit(row) { this.showEditor = true; this.form = row ? { ...blank(), ...JSON.parse(JSON.stringify(row)), batchText: (row.batchNos || []).join('\n'), changeReason: '' } : blank(); this.formError = ''; this.notice = ''; },
    search() { this.page = 1; this.reload(); },
    changePage(event) { this.page = event.current; this.reload(); },
    /** 首次加载失败时也可手动重试，成功加载前不开放排班操作。 */
    async reload() {
      if (this.loading) return;
      this.loading = true;
      this.error = '';
      try {
        if (!this.authorized) await requireMesAdmin();
        const [base, data] = await Promise.all([
          callOperations('bootstrap'),
          callOperations('listSchedules', { ...this.filters, page: this.page, pageSize: 20 })
        ]);
        const processes = base.catalogs.processes || [];
        // 刷新列表时保留尚未保存的预览工序，实际导入仍通过服务端权限与版本校验。
        const pending = this.catalogs.processes.filter(item => item.importPending && !processes.some(row => row._id === item._id));
        this.catalogs = { ...emptyCatalogs(), ...base.catalogs, processes: [...processes, ...pending] };
        this.rows = data.list || [];
        this.total = data.total || 0;
        this.authorized = true;
        this.restoreScope();
        await this.loadSavedDay(this.dailyDate);
        await this.refreshWeekAvailability();
      } catch (error) {
        this.rows = [];
        this.total = 0;
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },
    async save() {
      if (this.saving || this.importing) return;
      this.formError = ''; this.notice = '';
      const required = this.fields.find(field => field.required && !String(this.form[field.key] == null ? '' : this.form[field.key]).trim());
      if (required) { this.formError = '请填写或选择' + required.label; return; }
      const record = { ...this.form, batchNos: [...new Set(this.form.batchText.split(/[，,;；\s]+/).filter(Boolean).map(value => value.toUpperCase()))] }; delete record.batchText; if (record.kind === 'rest') { record.shiftId = ''; record.processId = ''; record.post = ''; record.batchNos = []; record.startTime = '00:00'; record.endTime = '00:00'; }
      this.saving = true;
      try { const result = await callOperations('saveSchedule', { record, expectedVersion: Number(this.form.version) || 0 }); this.edit(result); this.notice = '排班已保存。'; await this.reload(); }
      catch (error) { this.formError = error.message + (error.code === 409 ? ' 请刷新后重新打开最新排班。' : ''); }
      finally { this.saving = false; }
    },
    /** 清除预览及请求标识，列配置与文件列表保留。 */
    resetPreview() {
      this.processPlans = []; this.showPreviewDetails = false; this.previewReady = false; this.previews = []; this.importResults = {}; this.importStage = ''; this.importNotice = ''; this.importError = ''; this.importSession = null; this.importRequest = null; this.previousScope = []; this.previewPage = 1; this.previewFilter = ''; this.reviewingRow = null; this.openPreviewGroup = ''; this.showDifferences = false; this.differencePage = 1;
    },
    /** 读取多个文件，每个文件失败独立显示；读取失败的文件移除后才可导入。 */
    chooseFile() {
      if (this.fileLoading || this.importing || this.previewing) return;
      // #ifdef H5
      uni.chooseFile({ count: Number.MAX_SAFE_INTEGER, type: 'all', extension: ['xlsx', 'xls', 'csv'], success: result => this.loadFiles(result.tempFiles || []), fail: result => { if (!/cancel/.test(result.errMsg || '')) this.importError = '文件选择失败，请重新选择。'; } });
      // #endif
      // #ifndef H5
      this.importError = '请在电脑浏览器后台导入本地 Excel 文件。';
      // #endif
    },
    async loadFiles(files) {
      if (this.fileLoading || this.importing || this.previewing) return;
      if (!files.length) return;
      this.fileLoading = true; this.resetPreview(); this.importFiles = []; this.sheets = []; this.sheetIndex = 0; this.dayFileChoice = {}; this.restoreProcessMappings();
      try {
        for (let index = 0; index < files.length; index++) {
          this.fileProgress = '正在读取 ' + (index + 1) + ' / ' + files.length + ' 个文件';
          await new Promise(resolve => setTimeout(resolve, 0));
          const file = files[index];
          this.importFiles.push({ id: 'file:' + index, name: file.name || '排班文件 ' + (index + 1), error: '', fileHash: '', duplicateOf: '', loaded: false });
          const entry = this.importFiles[this.importFiles.length - 1];
          try {
            const data = await readScheduleFile(file);
            entry.fileHash = data.fileHash;
            // Vue 会代理数组元素；用稳定 ID 排除当前文件，只与成功读取的文件比较。
            const duplicate = this.importFiles.find(item => item.id !== entry.id && item.loaded && data.fileHash && item.fileHash === data.fileHash && !item.error && !item.duplicateOf);
            if (duplicate) { entry.duplicateOf = duplicate.name; continue; }
            const first = data.sheets.findIndex(sheet => sheet.rows.slice(1).some(row => row.some(value => String(value == null ? '' : value).trim())));
            if (first < 0) throw new Error('文件只有表头或空行，没有可导入的数据');
            data.sheets.forEach((sheet, sheetIndex) => this.sheets.push({ ...sheet, id: entry.id + ':sheet:' + sheetIndex, fileId: entry.id, fileName: entry.name, fileHash: data.fileHash, selected: sheetIndex === first, config: this.defaultMapping(sheet) }));
            entry.loaded = true;
          } catch (error) { entry.error = error.message || '文件读取失败，请重新选择'; }
        }
        this.changeSheet();
      } finally { this.fileLoading = false; this.fileProgress = ''; }
      if (this.sheets.length && !this.hasFileErrors && this.batchSettings.workshopId) await this.preview();
    },
    /** 为每张表保存独立列配置，切换工作表时无需重复配置。 */
    defaultMapping(sheet) {
      if (sheet.wide) return { ...blankMapping(), ...sheet.mapping, startLine: 2 };
      const mapping = blankMapping(), headers = sheet.rows[0] || [];
      const aliases = { date: /^(日期|生产日期|排班日期)$/, shiftId: /^(班次|班别)$/, processId: /^(工序|工序名称)$/, personId: /^(人员|姓名|员工|工号)$/, post: /^(岗位|职位)$/, batchNos: /^(批号|生产批号)$/, note: /^(备注|说明)$/, startTime: /^(开始时间|上班时间)$/, endTime: /^(结束时间|下班时间)$/ };
      Object.keys(aliases).forEach(key => { const index = headers.findIndex(value => aliases[key].test(String(value).trim())); if (index >= 0) mapping[key] = index; });
      return mapping;
    },
    changeSheet() { this.mapping = (this.sheets[this.sheetIndex] || {}).config || blankMapping(); },
    updateMapping(value) { if (this.importing || this.previewing || this.fileLoading) return; const sheet = this.sheets[this.sheetIndex]; if (sheet) sheet.config = value; this.mapping = value; this.resetPreview(); },
    toggleSheet(sheet, selected) { if (this.importing || this.previewing || this.fileLoading) return; sheet.selected = selected; this.resetPreview(); },
    removeFile(fileId) {
      if (this.importing || this.previewing || this.fileLoading) return;
      const removed = this.importFiles.find(file => file.id === fileId);
      const ids = new Set(this.importFiles.filter(file => file.id === fileId || removed && !removed.duplicateOf && removed.fileHash && file.fileHash === removed.fileHash).map(file => file.id));
      this.importFiles = this.importFiles.filter(file => !ids.has(file.id)); this.sheets = this.sheets.filter(sheet => !ids.has(sheet.fileId)); this.sheetIndex = 0; this.changeSheet(); this.resetPreview();
    },
    togglePreview(row) {
      if (this.importing || this.previewing || this.hasImportResults) return;
      const source = this.previews.find(item => item.previewId === row.previewId);
      if (source) source.excluded = !source.excluded;
      this.reviewingRow = null; this.importError = ''; this.importRequest = null; this.importSession = null;
    },
    async preview() {
      if (this.previewing || this.importing || this.fileLoading) return;
      this.resetPreview();
      if (this.hasFileErrors) { this.importError = '有文件读取失败，请重新选择或移除失败文件后再预览'; return; }
      if (!this.batchSettings.workshopId) { this.importError = '请选择本批导入车间'; return; }
      if (!this.catalogs.workshops.some(row => row._id === this.batchSettings.workshopId && row.enabled !== false)) { this.importError = '所选车间已停用，请重新选择车间'; return; }
      this.previewing = true;
      try {
        const dates = this.dateSources;
        if (dates.some(day => !day.chosen)) throw new Error('同一天存在不同版本，请在日期清单选择要采用的文件');
        const dayFileChoice = Object.fromEntries(dates.map(day => [day.date, day.chosen]));
        let scopePersonnel = this.catalogs.personnel;
        if (this.batchSettings.replaceDay) {
          scopePersonnel = []; let cursor = '';
          do {
            const result = await callOperations('scheduleImportScope', { ...this.batchSettings, importRuleVersion: 3, scopeType: 'personnel', paged: true, cursor });
            if (result.importRuleVersion !== 3 || !Array.isArray(result.rows)) throw new Error('请先上传新版 production-operations 及公共模块，才能读取完整人员范围');
            scopePersonnel.push(...result.rows); cursor = result.nextCursor || '';
          } while (cursor);
          const outside = this.catalogs.personnel.filter(row => row.workshopId !== this.batchSettings.workshopId || row.enabled === false);
          this.catalogs = { ...this.catalogs, personnel: [...new Map([...outside, ...scopePersonnel].map(row => [row._id, row])).values()] };
        }
        const resolved = await resolveScheduleProcesses(this.sheets, { ...this.batchSettings, dayFileChoice }, this.catalogs, this.processMappings);
        this.catalogs = resolved.catalogs; this.processPlans = resolved.plans;
        const source = await previewScheduleBatch(this.sheets, { ...this.batchSettings, dayFileChoice, processMappings: resolved.mappings, processErrors: resolved.errors }, this.catalogs);
        this.previews = completeScheduleRest(source, scopePersonnel, this.batchSettings);
        if (this.batchSettings.replaceDay) {
          for (const date of [...new Set(this.previews.filter(row => row.record).map(row => row.record.date))]) {
            const scope = { date, rows: [] }; let cursor = '';
            do {
              const result = await callOperations('scheduleImportScope', { workshopId: this.batchSettings.workshopId, importRuleVersion: 3, date, paged: true, cursor });
              if (result.paginationVersion !== 1 || result.importRuleVersion !== 3) throw new Error('请先上传更新后的 production-operations 云函数及公共模块，再生成预览');
              scope.rows.push(...result.rows); cursor = result.nextCursor || '';
            } while (cursor);
            this.previousScope.push(scope);
          }
        }
        if (!this.daySummaries.some(day => day.date === this.previewDate)) this.previewDate = this.daySummaries[0] ? this.daySummaries[0].date : '';
        this.previewReady = true;
      } catch (error) { this.importError = error.message; this.previews = []; this.previousScope = []; }
      finally { this.previewing = false; }
    },
    /** 先逐批准备全部人员，再分批写入；所有行成功后才能处理完整日表收尾。 */
    async importRows() {
      if (this.importing || this.previewing || this.fileLoading || this.hasFileErrors || !this.previewReady || !this.eligibleCount || this.importStage === '完成') return;
      const selected = this.selectedRows;
      if (this.batchSettings.replaceDay && (selected.length !== this.previews.length || this.previews.some(row => row.excluded))) { this.importError = '完整日表须全部记录通过核对，不能跳过错误或人员后清理旧排班；请修正，或切换补充排班'; return; }
      const payload = { rows: selected.map(row => ({ ...row.record, changeReason: row.record.changeReason + '；来源：' + row.sourceFile + ' / ' + row.sourceSheet + ' 第' + row.line + '行' })), workshopId: this.batchSettings.workshopId, replaceDay: this.batchSettings.replaceDay };
      this.importRequest = operationRequest(this.importRequest, payload);
      this.importing = true; this.importError = '';
      try {
        if (!this.importSession || this.importSession.fingerprint !== this.importRequest.fingerprint) {
          if (!await confirmMes('导入排班', payload.replaceDay ? '将按车间和日期写入完整排班，本车间未列出的人员记为休息、0工时。全部成功后移除被替换的旧排班；用户修改保留冲突选择。请核对下方更新差异，是否导入？' : '将自动分批补充或更新排班，并为新人员建立待绑定档案。是否导入？')) return;
          this.importSession = { fingerprint: this.importRequest.fingerprint, preparedChunks: {}, completedChunks: {}, finishedPages: {}, created: 0, createdPeople: [], removed: 0, scopes: JSON.parse(JSON.stringify(this.previousScope.filter(scope => selected.some(row => row.record.date === scope.date)))) };
          this.importResults = {};
        }
        const session = this.importSession, snapshots = session.scopes.flatMap(scope => scope.rows);
        await this.saveImportProcesses(payload.rows);
        this.importStage = '准备人员与排班';
        for (let offset = 0; offset < payload.rows.length; offset += IMPORT_CHUNK_SIZE) {
          if (!session.preparedChunks[offset]) {
            const chunk = payload.rows.slice(offset, offset + IMPORT_CHUNK_SIZE);
            const previousRows = snapshots.filter(old => chunk.some(row => row.date === old.date && row.shiftId === old.shiftId && row.processId === old.processId && row.kind === old.kind && (row.personId ? row.personId === old.personId : row.personName === old.personName)));
            const data = await callOperations('prepareScheduleImport', { rows: chunk, workshopId: payload.workshopId, importRuleVersion: 3, replaceDay: payload.replaceDay, previousRows });
            if (!Array.isArray(data.rows) || data.rows.length !== chunk.length) throw new Error('人员准备结果不完整，已暂停导入，请按原内容重试');
            session.preparedChunks[offset] = data.rows; session.created += Number(data.created) || 0;
            for (const person of data.createdPeople || []) if (!session.createdPeople.some(row => row.personId === person.personId)) session.createdPeople.push(person);
          }
          this.importNotice = '已准备 ' + Math.min(offset + IMPORT_CHUNK_SIZE, payload.rows.length) + ' / ' + payload.rows.length + ' 人次；本次自动建档 ' + session.created + ' 人。' + createdHint(session.createdPeople);
        }
        const prepared = [];
        for (let offset = 0; offset < payload.rows.length; offset += IMPORT_CHUNK_SIZE) prepared.push(...session.preparedChunks[offset]);
        // 不同姓名／工号在服务端可能归属同一人员，写入前再次检查合并后的自然键和时间。
        const finalRows = checkScheduleBatch(selected.map((row, index) => ({ ...row, record: prepared[index] })));
        const conflicts = finalRows.filter(row => row.batchError);
        if (finalRows.some((row, index) => ['shiftId','startTime','endTime','startDayOffset','endDayOffset'].some(field => row.record[field] !== prepared[index][field]))) throw new Error('人员匹配后共用时间发生变化，请重新生成预览并核对');
        if (conflicts.length) throw new Error('人员匹配后发现重复或时间冲突：' + conflicts[0].batchError + ' 请重新核对后预览');
        this.importStage = '正在分批写入排班';
        for (let offset = 0; offset < prepared.length; offset += IMPORT_CHUNK_SIZE) {
          if (!session.completedChunks[offset]) {
            const chunk = prepared.slice(offset, offset + IMPORT_CHUNK_SIZE);
            const replacement = payload.replaceDay ? snapshots.filter(old => chunk.some(row => row.date === old.date && row.personId === old.personId)) : [];
            const data = await callOperations('importSchedules', { rows: chunk, requestId: this.importRequest.id + ':' + offset, sessionId: this.importRequest.id, replacePrevious: replacement });
            if (!Array.isArray(data.results)) throw new Error('导入结果不完整，已暂停后续处理，请按原内容重试');
            const results = { ...this.importResults }, seen = new Set();
            data.results.forEach(result => {
              const index = Number(result.row) - 1;
              if (!Number.isInteger(index) || index < 0 || index >= chunk.length || seen.has(index) || typeof result.ok !== 'boolean') throw new Error('导入结果行号或状态不正确，已暂停收尾');
              seen.add(index); results[selected[offset + index].previewId] = result;
            });
            this.importResults = results;
            if (seen.size !== chunk.length) throw new Error('导入结果缺少部分行，旧排班保持原状，请按原内容重试');
            if (data.results.every(result => result.ok === true)) session.completedChunks[offset] = true;
          }
          const progress = this.importProgress;
          this.importNotice = '已处理 ' + progress.processed + ' / ' + selected.length + ' 人次：' + progress.success + ' 成功，' + progress.failure + ' 失败。';
        }
        const allSucceeded = selected.every(row => this.resultFor(row.previewId).ok === true);
        if (payload.replaceDay && allSucceeded) {
          this.importStage = '全部写入成功，正在更新旧排班';
          const keepIds = new Set(prepared.map(row => row._id));
          for (const scope of session.scopes) {
            const previousRows = scope.rows.filter(row => !keepIds.has(row.id));
            for (let offset = 0; offset < previousRows.length; offset += FINISH_PAGE_SIZE) {
              const key = scope.date + ':' + offset;
              if (session.finishedPages[key]) continue;
              const data = await callOperations('finishScheduleImport', { workshopId: payload.workshopId, importRuleVersion: 3, date: scope.date, paged: true, sessionId: this.importRequest.id, previousRows: previousRows.slice(offset, offset + FINISH_PAGE_SIZE) });
              if (data.paginationVersion !== 1) throw new Error('云端未支持分批收尾，请更新云函数后重试');
              session.finishedPages[key] = true; session.removed += Number(data.removed) || 0;
              this.importNotice = '本批 ' + selected.length + ' 人次已全部写入；累计停用 ' + session.removed + ' 条旧排班。';
            }
          }
        }
        this.importStage = allSucceeded ? '完成' : '部分失败，可按原内容重试';
        if (!allSucceeded) this.importNotice += ' 有失败行，未执行旧排班移除；请按原内容重试。';
        else this.importNotice = selected.length + ' 人次导入完成；自动建档 ' + session.created + ' 人，停用旧排班 ' + session.removed + ' 条。' + createdHint(session.createdPeople);
        if (allSucceeded && selected.length) this.dailyDate = selected[0].record.date;
        await this.reload();
      } catch (error) { this.importStage = '导入中断，可按原内容重试'; this.importError = error.message + ' 已完成的分批操作会保留，重试会接续处理。'; }
      finally { this.importing = false; }
    }

  }
};
</script>
<style lang="scss" scoped>
@import './operations.scss';
.schedule-card-header, .schedule-file-summary, .schedule-import-footer, .schedule-day-summary { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .7rem 1rem; }
.schedule-card-header { margin-bottom: .9rem; }
.schedule-card-header .ops-panel-title { margin-bottom: .25rem; font-size: .95rem; }
.schedule-link { margin: 0; border: 0; color: $uni-color-primary; background: transparent; font-size: .78rem; line-height: 2; padding: .1rem .3rem; }
.schedule-link::after { border: 0; }
.schedule-scope { margin-bottom: .9rem; }
.schedule-scope :deep(.mes-fields) { max-width: 44rem; margin: 0 0 .35rem; gap: .8rem; }
.schedule-scope :deep(.mes-field) { flex: 1 1 14rem; }
.schedule-scope :deep(.mes-field-label) { font-size: .78rem; }
.schedule-upload { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: .55rem; width: 100%; min-height: 9rem; margin: 0; padding: 1.5rem; border: 1px dashed $uni-border-color; border-radius: .6rem; background: $uni-bg-color-grey; color: $uni-color-primary; line-height: 1.6; }
.schedule-upload::after { border: 0; }
.schedule-upload:hover, .schedule-upload:focus-visible { border-color: $uni-color-primary; background: rgba($uni-color-primary, .035); outline: 2px solid rgba($uni-color-primary, .2); outline-offset: 2px; }
.schedule-upload-title { font-size: .9rem; color: $uni-text-color; }
.schedule-upload .ops-table-note { font-size: .75rem; }
.schedule-file-summary { margin-top: .6rem; color: $uni-text-color-grey; font-size: .8rem; }
.import-file-list, .import-sheet-list { display: grid; gap: .45rem; margin: .8rem 0; }
.import-file, .import-sheet { display: flex; align-items: center; gap: .75rem; padding: .65rem .8rem; border: 1px solid $uni-border-color; border-radius: .4rem; font-size: .8rem; }
.import-file .ops-cell-stack, .import-sheet .ops-cell-stack { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.import-file button, .import-sheet button { flex-shrink: 0; margin: 0; }
.active-sheet { background: $uni-bg-color-grey; border-color: $uni-color-primary; }
.schedule-advanced { margin-top: 1rem; padding: 1rem; border: 1px solid $uni-border-color; border-radius: .5rem; }
.schedule-advanced :deep(.mes-field) { flex-basis: 16rem; }
.schedule-import-footer { margin-top: 1rem; padding-top: .9rem; border-top: 1px solid $uni-border-color; }
.schedule-warning { border: 1px solid rgba($uni-color-warning, .35); background: rgba($uni-color-warning, .06); color: darken($uni-color-warning, 25%); padding: .75rem 1rem; border-radius: .45rem; margin-top: .8rem; line-height: 1.7; font-size: .8rem; }
.import-version { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; margin-top: .5rem; }
.import-version :deep(.uni-stat__select) { flex: 1 1 18rem; }
.schedule-calendar { display: flex; gap: .55rem; overflow-x: auto; padding: .25rem 0 .65rem; margin-top: .75rem; }
.schedule-day { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .25rem; flex: 0 0 5.1rem; min-height: 5rem; margin: 0; padding: .5rem .3rem; border: 1px solid transparent; border-radius: .5rem; background: $uni-bg-color-grey; line-height: 1.4; }
.schedule-day::after { border: 0; }
.schedule-day.selected { color: $uni-color-primary; border-color: $uni-color-primary; background: rgba($uni-color-primary, .055); }
.schedule-day:hover, .schedule-day:focus-visible { border-color: $uni-color-primary; outline: 0; }
.schedule-day-week { color: $uni-text-color-grey; font-size: .7rem; }
.schedule-day-number { font-size: .95rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.schedule-day .ops-table-note { font-size: .68rem; }
.schedule-day-summary { margin: .7rem 0; font-size: .85rem; }
.schedule-date-toolbar { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
.schedule-date-toolbar button { margin: 0; }
.schedule-date-picker { flex: 0 1 13rem; min-width: 11rem; }
.schedule-details { border-top: 1px solid $uni-border-color; margin-top: 1rem; padding-top: .8rem; }
.import-source { overflow-wrap: anywhere; }
.import-source-detail { display: grid; gap: .8rem; margin-top: .7rem; min-width: 12rem; overflow-wrap: anywhere; }
.import-source-detail > view { border-top: 1px solid $uni-border-color; padding-top: .6rem; }
.plan-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .7rem; margin-top: .9rem; padding-top: .9rem; border-top: 1px solid $uni-border-color; }
.plan-toolbar button { margin: 0; }
.plan-strong { color: $uni-color-primary; font-weight: 650; }
.plan-card .schedule-card-header { margin-bottom: .8rem; align-items: flex-start; }
.plan-card .schedule-card-header .mes-actions { flex-wrap: nowrap; flex-shrink: 0; }
.plan-card .schedule-card-header > view:first-child { min-width: 0; }
.plan-week { display: flex; gap: .55rem; overflow-x: auto; padding: .2rem 0 .6rem; }
.plan-day { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .2rem; flex: 1 1 6rem; min-width: 5.4rem; min-height: 5.4rem; margin: 0; padding: .55rem .3rem; border: 1px solid $uni-border-color; border-radius: .5rem; background: $uni-bg-color; line-height: 1.4; }
.plan-day::after { border: 0; }
.plan-day.is-empty { background: $uni-bg-color-grey; border-color: transparent; color: $uni-text-color-grey; opacity: .72; }
.plan-day.is-selected { border-color: $uni-color-primary; border-width: 2px; background: rgba($uni-color-primary, .06); color: $uni-color-primary; opacity: 1; }
.plan-day:hover, .plan-day:focus-visible { border-color: $uni-color-primary; outline: 0; }
.plan-day-week { font-size: .7rem; color: $uni-text-color-grey; }
.plan-day.is-selected .plan-day-week { color: $uni-color-primary; }
.plan-day-num { font-size: 1.02rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.plan-day-state { font-size: .68rem; color: $uni-color-success; }
.plan-day.is-empty .plan-day-state { color: $uni-text-color-grey; }
.plan-week-foot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .6rem; font-size: .78rem; }
.plan-date { color: $uni-text-color-grey; font-weight: 500; font-size: .86rem; }
.plan-empty { display: flex; flex-direction: column; align-items: center; gap: .35rem; padding: 2.4rem 1rem; color: $uni-text-color-grey; font-size: .85rem; }
.plan-summary { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .6rem; margin-top: .8rem; padding: .6rem .8rem; border-radius: .35rem; background: $uni-bg-color-grey; font-size: .8rem; }
.schedule-picker { flex: 0 0 10rem; min-width: 9rem; }
@media (max-width: 600px) { .schedule-scope :deep(.mes-field) { flex-basis: 100%; } .schedule-import-footer > .mes-actions { width: 100%; justify-content: flex-end; } .schedule-upload { padding: 1rem; } .schedule-day { flex-basis: 4.6rem; } }
</style>
