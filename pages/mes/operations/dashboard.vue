<template>
  <view class="mes-page">
    <view class="mes-header"><view><view class="mes-title">工作台</view><view class="mes-description">当日排班、工单与待处理事项集中查看。数量来自实际生产记录。</view></view><view class="mes-actions"><input v-model="date" class="mes-search" placeholder="YYYY-MM-DD" /><button size="mini" :disabled="loading" @click="reload">{{ loading ? '读取中…' : '刷新工作台' }}</button></view></view>
    <view v-if="error" class="mes-error">{{ error }}</view><view v-if="loading && !data" class="ops-empty">正在读取生产工作台…</view>
    <view v-if="authorized" class="ops-panel ops-section"><view class="ops-panel-title">常用操作</view><view class="ops-quick-grid"><button v-for="item in quickLinks" :key="item.key" @click="open(item.key)"><view class="ops-row-title">{{ item.name }}</view><view class="ops-table-note">{{ item.description }}</view></button></view></view>
    <view v-if="data"><view class="ops-summary"><view v-for="item in counters" :key="item.key" class="ops-summary-cell"><strong>{{ data.counts[item.key] }}</strong><text>{{ item.label }}</text></view></view><view class="ops-layout"><view class="ops-panel"><view class="ops-panel-title">当日工单</view><view class="ops-hint">{{ data.date }}，展示最近 5 单，可进入工单清单查看全部。</view><view v-if="!data.jobs.length" class="ops-empty">当日暂无工单。</view><view v-for="job in data.jobs" :key="job._id" class="ops-row"><view><view class="ops-row-title">{{ job.batchNo }}<text class="ops-state">{{ stateName(job.state) }}</text></view><view class="ops-row-detail">{{ job.productName }} · {{ job.processName }}<view>合格 {{ job.goodQty || 0 }} / 目标 {{ job.targetQty }} {{ unitName(job.unit) }}</view></view></view><button size="mini" @click="jobDetail(job)">查看执行</button></view><view class="mes-footer"><button size="mini" @click="open('jobs')">全部工单</button><button size="mini" @click="open('reports')">班次报表</button></view></view><view class="ops-panel"><view class="ops-panel-title">当日排班</view><view v-if="!data.schedules.length" class="ops-empty">当日暂无排班。请先完善基础资料再安排生产。</view><view v-for="row in data.schedules" :key="row._id" class="ops-row"><view><view class="ops-row-title">{{ row.personName || name('personnel', row.personId) }} · {{ row.shiftName || name('shifts', row.shiftId) }}</view><view class="ops-row-detail">{{ row.processName || name('processes', row.processId) }} · {{ row.post || '未指定岗位' }}<view>{{ row.startTime }} — {{ row.endTime }} · {{ (row.batchNos || []).join('、') || '批号待派工' }}</view></view></view></view><view class="mes-footer"><button size="mini" @click="open('schedules')">查看完整排班</button><button size="mini" @click="open('foundation?type=processes')">管理工序</button></view></view></view><view class="ops-panel ops-section"><view class="ops-panel-title">待处理生产异常</view><view v-if="!data.exceptions.length" class="ops-empty">暂无待处理异常。</view><view v-for="row in data.exceptions" :key="row._id" class="ops-row"><view><view class="ops-row-title">{{ row.category }} · {{ row.batchNo }}</view><view class="ops-row-detail">{{ row.description }}</view></view><button size="mini" @click="open('exceptions')">查看处置</button></view><view class="mes-footer"><button size="mini" @click="open('handovers')">待接班记录</button></view></view></view>
  </view>
</template>
<script>
import { requireMesAdmin } from '@/utils/mes-api.js';
import { callOperations, emptyCatalogs, catalogName, today, stateName, unitName } from '@/utils/operations-admin.js';
export default {
  data() { return { authorized: false, loading: false, error: '', date: today(), data: null, catalogs: emptyCatalogs(), quickLinks: [{ key: 'schedules', name: '导入每日排班', description: '选择表格，核对人员、班次与时间' }, { key: 'attendance', name: '查询考勤统计', description: '查看月度或年度工时与工序参与' }], counters: [{ key: 'jobs', label: '当日工单' }, { key: 'running', label: '生产中' }, { key: 'completed', label: '已完工' }, { key: 'openExceptions', label: '待处理异常' }, { key: 'pendingHandovers', label: '待接班' }] }; },
  async onLoad() { await this.reload(); },
  onShow() { if (this.authorized) this.reload(); },
  methods: {
    stateName, unitName,
    name(type, id) { return catalogName(this.catalogs, type, id); },
    open(key) { uni.navigateTo({ url: '/pages/mes/operations/' + key }); },
    jobDetail(job) { uni.navigateTo({ url: '/pages/mes/operations/job-detail?id=' + encodeURIComponent(job._id) }); },
    async reload() { if (this.loading) return; this.loading = true; this.error = ''; this.data = null; try { if (!this.authorized) { await requireMesAdmin(); const base = await callOperations('bootstrap'); this.catalogs = { ...emptyCatalogs(), ...base.catalogs }; this.authorized = true; } const result = await callOperations('dashboard', { date: this.date }); this.data = { ...result, counts: result.counts || {}, jobs: result.jobs || [], schedules: result.schedules || [], exceptions: result.exceptions || [] }; } catch (error) { this.error = error.message; } finally { this.loading = false; } }
  }
};
</script>
<style lang="scss" scoped>@import './operations.scss';</style>
