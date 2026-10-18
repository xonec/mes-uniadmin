<template>
  <view class="mes-page"><view class="mes-header"><view><view class="mes-title">报表中心 · 生产报表</view><view class="mes-description">按实际报工和生产入库确认汇总。同一数量单位单独合计，避免把瓶、箱和条数相加。</view></view><button size="mini" :disabled="loading || !report || !report.rows.length" @click="exportReport">导出 CSV</button></view><view v-if="error" class="mes-error">{{ error }}<button size="mini" :disabled="loading" @click="reload">重新加载报表</button></view><view v-if="authorized"><view class="ops-panel"><operation-fields v-model="dateRange" :fields="dateFields" :disabled="loading" /><view class="mes-toolbar"><button size="mini" :disabled="loading" @click="useRange('today')">今天</button><button size="mini" :disabled="loading" @click="useRange('week')">近 7 天</button><button size="mini" :disabled="loading" @click="useRange('month')">本月至今</button><button type="primary" size="mini" :disabled="loading" @click="reload">{{ loading ? '汇总中…' : '查询报表' }}</button></view><view class="ops-hint">单次查询最多 31 天，包含开始与结束日期。导出仅包含本次实际查询范围。</view></view><view v-if="report"><view class="ops-summary"><view v-for="total in report.totals" :key="total.unit" class="ops-summary-cell"><strong>{{ total.goodQty || 0 }}</strong><text>合格 · {{ unitName(total.unit) }}</text><view class="ops-row-detail">不良 {{ total.defectQty || 0 }} · 生产入库确认 {{ total.inboundQty || 0 }}</view></view><view class="ops-summary-cell"><strong>{{ report.workHours || 0 }}</strong><text>累计报工工时 · 小时</text></view></view><view class="ops-hint">已查询 {{ loadedRange.dateFrom }} 至 {{ loadedRange.dateTo }} · {{ report.rows.length }} 行。</view><view class="mes-table"><uni-table :loading="loading" border stripe emptyText="该日期范围暂无实际报工或生产入库确认记录"><uni-tr><uni-th v-for="column in columns" :key="column.key" :width="column.width">{{ column.label }}</uni-th><uni-th width="90">工单</uni-th></uni-tr><uni-tr v-for="(row, index) in report.rows" :key="index"><uni-td v-for="column in columns" :key="column.key">{{ column.key === 'unit' ? unitName(row.unit) : row[column.key] == null ? '—' : row[column.key] }}</uni-td><uni-td><button size="mini" @click="openJob(row.jobId)">查看</button></uni-td></uni-tr></uni-table></view></view><view v-else-if="loading" class="ops-empty">正在读取实际生产记录…</view></view></view>
</template>
<script>
import OperationFields from '@/components/mes/operations/OperationFields.vue';
import { requireMesAdmin } from '@/utils/mes-api.js';
import { callOperations, unitName, today, exportCsv } from '@/utils/operations-admin.js';
const COLUMNS = [{ key: 'date', label: '日期', width: 105 }, { key: 'shiftName', label: '班次', width: 100 }, { key: 'processName', label: '工序', width: 130 }, { key: 'batchNo', label: '完整批号', width: 145 }, { key: 'productCode', label: '产品编码', width: 145 }, { key: 'productName', label: '产品名称', width: 230 }, { key: 'unit', label: '数量单位', width: 100 }, { key: 'goodQty', label: '合格量', width: 100 }, { key: 'defectQty', label: '不良量', width: 100 }, { key: 'workHours', label: '工时（小时）', width: 100 }, { key: 'inboundQty', label: '生产入库确认', width: 125 }];
export default {
  components: { OperationFields },
  data() { return { authorized: false, dateFrom: today(), dateTo: today(), loadedRange: null, report: null, loading: false, error: '', columns: COLUMNS, dateFields: [{ key: 'dateFrom', label: '开始日期', type: 'date', required: true }, { key: 'dateTo', label: '结束日期', type: 'date', required: true }] }; },
  computed: {
    dateRange: { get() { return { dateFrom: this.dateFrom, dateTo: this.dateTo }; }, set(value) { this.dateFrom = value.dateFrom; this.dateTo = value.dateTo; } }
  },
  async onLoad() { await this.reload(); },
  methods: {
    unitName,
    openJob(id) { uni.navigateTo({ url: '/pages/mes/operations/job-detail?id=' + encodeURIComponent(id) }); },
    /** 快速填写常用查询范围，仍由用户点击查询加载报表。 */
    useRange(kind) {
      if (this.loading) return;
      const end = today();
      if (kind === 'month') this.dateFrom = end.slice(0, 7) + '-01';
      else if (kind === 'week') this.dateFrom = new Date(Date.parse(end + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10);
      else this.dateFrom = end;
      this.dateTo = end;
    },
    /** 校验日期及含首尾的 31 天上限，读取成功后锁定导出范围。 */
    async reload() {
      if (this.loading) return;
      const range = { dateFrom: this.dateFrom, dateTo: this.dateTo };
      this.error = '';
      const timestamps = [range.dateFrom, range.dateTo].map(value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
        const timestamp = Date.parse(value + 'T00:00:00Z');
        return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : NaN;
      });
      if (timestamps.some(value => !Number.isFinite(value))) { this.error = '请选择有效的开始日期和结束日期。'; return; }
      if (timestamps[1] < timestamps[0]) { this.error = '结束日期不能早于开始日期。'; return; }
      if ((timestamps[1] - timestamps[0]) / 86400000 + 1 > 31) { this.error = '单次查询最多 31 天，请缩小日期范围。'; return; }
      this.loading = true; this.report = null; this.loadedRange = null;
      try {
        if (!this.authorized) { await requireMesAdmin(); this.authorized = true; }
        const data = await callOperations('report', range);
        this.report = { ...data, rows: data.rows || [], totals: data.totals || [] }; this.loadedRange = range;
      } catch (error) { this.error = error.message; }
      finally { this.loading = false; }
    },
    exportReport() { if (!this.report || !this.loadedRange || this.loading) return; exportCsv(`班次报表_${this.loadedRange.dateFrom}_${this.loadedRange.dateTo}.csv`, COLUMNS, this.report.rows.map(row => ({ ...row, unit: unitName(row.unit) }))); }
  }
};
</script>
<style lang="scss" scoped>@import './operations.scss';</style>
