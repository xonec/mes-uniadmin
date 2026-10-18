<template>
  <view class="orders-page">
    <view class="orders-head">
      <view class="orders-head-main">
        <view class="orders-title">生产订单</view>
        <view class="orders-desc">按订单号维护包装指令单，草稿确认后进入生产。点击行打开右侧抽屉，甘特按计划起止时间展示。</view>
      </view>
      <view class="orders-view">
        <view class="orders-view-btn" :class="{ active: view === 'list' }" @click="view = 'list'">列表</view>
        <view class="orders-view-btn" :class="{ active: view === 'gantt' }" @click="view = 'gantt'">甘特</view>
      </view>
    </view>

    <view class="orders-card">
      <view class="orders-tabs">
        <view
          v-for="tab in tabs"
          :key="tab.value"
          class="orders-tab"
          :class="{ active: activeTab === tab.value, pending: tab.pending }"
          @click="selectTab(tab)"
        >
          <text>{{ tab.label }}</text>
          <text v-if="tab.pending" class="orders-tab-badge">待接口</text>
        </view>
      </view>

      <view class="orders-toolbar">
        <view class="orders-toolbar-left">
          <button type="primary" size="mini" @click="openCreate">新增订单</button>
          <button size="mini" @click="openPhotoImport">照片识别导入</button>
          <button size="mini" :disabled="!rows.length" @click="exportCsv">导出 CSV</button>
          <button size="mini" :disabled="loading" @click="reload">刷新</button>
        </view>
        <view class="orders-toolbar-right">
          <input v-model="keyword" class="orders-search" placeholder="搜索订单号 / 批号 / 产品编码 / 名称" @confirm="search" />
          <button size="mini" @click="search">查询</button>
          <button size="mini" :disabled="!keyword && page === 1" @click="resetSearch">重置</button>
        </view>
      </view>

      <view class="orders-filters">
        <view class="orders-filter">
          <text class="orders-filter-label">更新时间</text>
          <input v-model="updatedFrom" class="orders-filter-input" type="date" :disabled="!filtersReady" />
          <text class="orders-filter-sep">至</text>
          <input v-model="updatedTo" class="orders-filter-input" type="date" :disabled="!filtersReady" />
        </view>
        <text class="orders-filter-hint">{{ filtersReady ? '按最近更新时间筛选（毫秒时间戳）' : '更新时间范围待云函数部署后启用（接口已实现 updatedFrom/updatedTo）' }}</text>
      </view>

      <view v-if="filterNotice" class="orders-notice">{{ filterNotice }}</view>
      <view v-if="error" class="mes-error orders-error">{{ error }}</view>

      <view v-if="view === 'list'" class="orders-table-wrap">
        <view class="orders-table">
          <view class="orders-thead">
            <view class="orders-th">订单号</view>
            <view class="orders-th">批号</view>
            <view class="orders-th">产品编码</view>
            <view class="orders-th">产品名称</view>
            <view class="orders-th orders-th--num">计划产量</view>
            <view class="orders-th">客户 / 计划</view>
            <view class="orders-th">计划时间</view>
            <view class="orders-th">状态</view>
            <view class="orders-th">更新时间</view>
            <view class="orders-th">操作</view>
          </view>
          <view v-if="loading" class="orders-empty">加载中…</view>
          <view v-else-if="!rows.length" class="orders-empty">
            <text>暂无订单。</text>
            <text class="orders-empty-hint">点击「新增订单」或「照片识别导入」创建第一张订单。</text>
          </view>
          <view v-for="row in rows" :key="row._id || row.orderNo" class="orders-row" @click="openRow(row)">
            <view class="orders-td orders-td--code">{{ row.orderNo }}</view>
            <view class="orders-td orders-td--code">{{ row.batchNo || '—' }}</view>
            <view class="orders-td orders-td--code">{{ row.productCode || '—' }}</view>
            <view class="orders-td orders-td--name" :title="row.productName">{{ row.productName || '—' }}</view>
            <view class="orders-td orders-td--num">{{ row.plannedQty == null || row.plannedQty === '' ? '—' : row.plannedQty }}</view>
            <view class="orders-td orders-td--stack" :title="(row.customerName || '—') + ' / ' + (row.planName || '—')">
              <text class="orders-td-line">{{ row.customerName || '—' }}</text>
              <text class="orders-td-line orders-td-line--muted">{{ row.planName || '—' }}</text>
            </view>
            <view class="orders-td orders-td--plan-time">
              <template v-if="row.planStartAt || row.planEndAt">
                <text class="orders-plan-line">{{ shortPlanTime(row.planStartAt) || '未填开始' }}</text>
                <text class="orders-plan-line orders-plan-line--end">→ {{ shortPlanTime(row.planEndAt) || '未填结束' }}</text>
              </template>
              <text v-else class="orders-plan-empty">未排期</text>
            </view>
            <view class="orders-td"><OrderStatusTag :status="row.orderStatus" :enabled="row.enabled !== false" /></view>
            <view class="orders-td orders-td--time">{{ formatDate(row.updatedAt || row.savedAt) }}</view>
            <view class="orders-td orders-td--op" @click.stop>
              <button size="mini" @click="trace(row)">追溯</button>
              <button size="mini" @click="toggle(row)">{{ row.enabled === false ? '启用' : '停用' }}</button>
            </view>
          </view>
        </view>
        <view class="orders-pagination">
          <uni-pagination show-icon :total="total" :page-size="pageSize" :current="page" @change="changePage" />
        </view>
      </view>

      <OrderGantt v-else :rows="rows" :loading="loading" @open="openRow" />
    </view>

    <OrderDrawer :visible="drawerVisible" :title="drawerTitle" :subtitle="drawerSubtitle" @close="closeDrawer">
      <OrderFormPanel v-if="drawerVisible" :record-key="drawerKey" @saved="onSaved" @cancel="closeDrawer" />
    </OrderDrawer>
  </view>
</template>
<script>
import { callMes, requireMesAdmin, formatMesDate, confirmMes } from '@/utils/mes-api.js';
import OrderDrawer from '@/components/mes/orders/OrderDrawer.vue';
import OrderFormPanel from '@/components/mes/orders/OrderFormPanel.vue';
import OrderGantt from '@/components/mes/orders/OrderGantt.vue';
import OrderStatusTag from '@/components/mes/orders/OrderStatusTag.vue';

/**
 * 筛选开关：工程已在 mes-document-store 实现 orderStatus / updatedFrom / updatedTo（毫秒）筛选，
 * 待云函数上传部署后把这里改为 true 即启用；为 false 时草稿 / 已确认 tab 与更新时间范围只做 UI 占位，
 * 不发未支持的参数，也不做前端假过滤。
 */
const FILTERS_READY = true;

const CSV_COLUMNS = [
  ['订单号', 'orderNo'],
  ['批号', 'batchNo'],
  ['产品编码', 'productCode'],
  ['产品名称', 'productName'],
  ['计划产量', 'plannedQty'],
  ['客户', 'customerName'],
  ['计划', 'planName'],
  ['计划开始', 'planStartAt'],
  ['计划结束', 'planEndAt'],
  ['状态', 'orderStatus'],
  ['更新时间', 'updatedAt']
];

export default {
  components: { OrderDrawer, OrderFormPanel, OrderGantt, OrderStatusTag },
  data() {
    return {
      authorized: false,
      loading: false,
      error: '',
      rows: [],
      total: 0,
      page: 1,
      pageSize: 200,
      keyword: '',
      status: 'active',
      activeTab: 'all',
      view: 'list',
      updatedFrom: '',
      updatedTo: '',
      filtersReady: FILTERS_READY,
      drawerVisible: false,
      drawerKey: '',
      tabs: [
        { value: 'all', label: '全部' },
        { value: 'draft', label: '草稿', pending: !FILTERS_READY },
        { value: 'confirmed', label: '已确认', pending: !FILTERS_READY },
        { value: 'disabled', label: '已停用' }
      ]
    };
  },
  computed: {
    filterNotice() {
      if (this.filtersReady) return '';
      if (this.activeTab !== 'draft' && this.activeTab !== 'confirmed') return '';
      return '「' + (this.activeTab === 'draft' ? '草稿' : '已确认') + '」筛选参数待云函数部署后启用（orderStatus），当前展示全部启用订单，不做前端假过滤。';
    },
    drawerTitle() { return this.drawerKey ? '订单详情' : '新增订单'; },
    drawerSubtitle() { return this.drawerKey ? '订单号 ' + this.drawerKey : '填写订单号、批号并从产品载入材料清单'; }
  },
  async mounted() {
    try { await requireMesAdmin(); this.authorized = true; await this.reload(); }
    catch (error) { this.error = error.message; }
  },
  methods: {
    formatDate: formatMesDate,
    buildParams() {
      const params = { page: this.page, pageSize: this.pageSize, keyword: this.keyword, status: this.status };
      // 接口补齐后自动带上；现在 FILTERS_READY=false，不发未支持的参数。
      if (this.filtersReady) {
        if (this.activeTab === 'draft' || this.activeTab === 'confirmed') params.orderStatus = this.activeTab;
        // 契约：updatedFrom / updatedTo 为毫秒时间戳整数（含端点）。
        if (this.updatedFrom) params.updatedFrom = this.localDayStart(this.updatedFrom);
        if (this.updatedTo) params.updatedTo = this.localDayEnd(this.updatedTo);
      }
      return params;
    },
    async reload() {
      if (!this.authorized || this.loading) return;
      this.loading = true; this.error = '';
      try {
        const result = await callMes('production-orders', 'list', this.buildParams());
        this.rows = result.list || []; this.total = Number(result.total) || 0;
      } catch (error) { this.error = error.message; }
      finally { this.loading = false; }
    },
    selectTab(tab) {
      const next = tab.value === 'disabled' ? 'disabled' : 'active';
      const changed = this.activeTab !== tab.value || this.status !== next;
      this.activeTab = tab.value; this.status = next;
      if (!changed) return;
      this.page = 1; this.reload();
    },
    search() { this.page = 1; this.reload(); },
    /** 日期输入框（YYYY-MM-DD）转当天毫秒边界，匹配 updatedFrom/updatedTo 契约。 */
    localDayStart(value) { const date = new Date(value + 'T00:00:00'); return date.getTime(); },
    localDayEnd(value) { const date = new Date(value + 'T23:59:59.999'); return date.getTime(); },
    resetSearch() { this.keyword = ''; this.page = 1; this.reload(); },
    changePage(event) { this.page = event.current; this.reload(); },
    openCreate() { this.drawerKey = ''; this.drawerVisible = true; },
    openPhotoImport() {
      this.drawerKey = '';
      this.drawerVisible = true;
      uni.showToast({ title: '在抽屉顶部选择照片识别导入', icon: 'none' });
    },
    openRow(row) { this.drawerKey = row.orderNo; this.drawerVisible = true; },
    closeDrawer() { this.drawerVisible = false; this.drawerKey = ''; },
    onSaved() {
      this.closeDrawer();
      this.reload();
    },
    trace(row) { uni.navigateTo({ url: '/pages/mes/orders/trace' + (row ? '?orderNo=' + encodeURIComponent(row.orderNo) : '') }); },
    async toggle(row) {
      const enabled = row.enabled === false;
      if (!await confirmMes(enabled ? '启用订单' : '停用订单', (enabled ? '确认启用 ' : '确认停用 ') + row.orderNo + '？停用后可在「已停用」tab 恢复。')) return;
      this.loading = true; this.error = '';
      try { await callMes('production-orders', 'setEnabled', { orderNo: row.orderNo, enabled, expectedVersion: Number(row.version) || 1 }); }
      catch (error) { this.error = error.message; }
      finally { this.loading = false; }
      const message = this.error;
      await this.reload();
      if (message) this.error = message;
    },
    shortPlanTime(value) {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms <= 0) return '';
      const date = new Date(ms), pad = part => String(part).padStart(2, '0');
      return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    },
    fullPlanTime(value) {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms <= 0) return '';
      const date = new Date(ms), pad = part => String(part).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    },
    exportCsv() {
      if (!this.rows.length) return;
      const escape = value => '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
      const statusText = row => row.enabled === false ? '已停用' : row.orderStatus === 'confirmed' ? '已确认' : '草稿';
      const lines = [CSV_COLUMNS.map(([label]) => escape(label)).join(',')];
      this.rows.forEach(row => {
        lines.push(CSV_COLUMNS.map(([, key]) => {
          if (key === 'orderStatus') return escape(statusText(row));
          if (key === 'updatedAt') return escape(this.formatDate(row[key]));
          if (key === 'planStartAt' || key === 'planEndAt') return escape(this.fullPlanTime(row[key]));
          return escape(row[key]);
        }).join(','));
      });
      // #ifdef H5
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = '生产订单-' + stamp + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      // #endif
      uni.showToast({ title: '已导出 ' + this.rows.length + ' 条', icon: 'none' });
    }
  }
};
</script>
<style lang="scss" scoped>
@import '@/common/mes.scss';

.orders-page { padding: 1.5rem; background: #f5f7f6; min-height: 100vh; box-sizing: border-box; }
.orders-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.orders-title { font-size: 1.35rem; font-weight: 650; color: $uni-text-color; }
.orders-desc { margin-top: .35rem; font-size: .82rem; color: $uni-text-color-grey; line-height: 1.6; }
.orders-view { display: inline-flex; padding: .2rem; background: #e9edeb; border-radius: .4rem; }
.orders-view-btn { padding: .35rem 1rem; border-radius: .3rem; font-size: .8rem; color: $uni-text-color-grey; cursor: pointer; }
.orders-view-btn.active { background: $uni-bg-color; color: $uni-color-primary; font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, .08); }

.orders-card { background: $uni-bg-color; border: 1px solid $uni-border-color; border-radius: .6rem; padding: 0 1rem 1rem; box-sizing: border-box; }

.orders-tabs { display: flex; align-items: center; gap: .2rem; border-bottom: 1px solid $uni-border-color; margin-bottom: .9rem; overflow-x: auto; }
.orders-tab { display: inline-flex; align-items: center; gap: .3rem; padding: .75rem .9rem; font-size: .85rem; color: $uni-text-color-grey; border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; }
.orders-tab.active { color: $uni-color-primary; border-bottom-color: $uni-color-primary; font-weight: 600; }
.orders-tab-badge { font-size: .62rem; color: #9aa3ad; background: #f0f2f4; border-radius: .2rem; padding: 0 .25rem; }
.orders-tab.active .orders-tab-badge { color: $uni-color-primary; background: rgba(0, 133, 119, .1); }

.orders-toolbar { display: flex; align-items: center; justify-content: space-between; gap: .8rem; flex-wrap: wrap; }
.orders-toolbar-left { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.orders-toolbar-right { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.orders-toolbar button { margin: 0; }
.orders-search { box-sizing: border-box; width: 19rem; max-width: 60vw; height: 2.1rem; padding: .35rem .6rem; border: 1px solid $uni-border-color; border-radius: .3rem; font-size: .82rem; }

.orders-filters { display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; margin-top: .75rem; }
.orders-filter { display: inline-flex; align-items: center; gap: .4rem; }
.orders-filter-label { font-size: .78rem; color: $uni-text-color-grey; }
.orders-filter-input { box-sizing: border-box; height: 1.9rem; padding: 0 .45rem; border: 1px solid $uni-border-color; border-radius: .25rem; font-size: .78rem; color: $uni-text-color; background: $uni-bg-color; }
.orders-filter-input[disabled] { background: $uni-bg-color-grey; color: $uni-text-color-grey; }
.orders-filter-sep { font-size: .75rem; color: $uni-text-color-grey; }
.orders-filter-hint { font-size: .72rem; color: $uni-text-color-grey; }

.orders-notice { margin-top: .8rem; padding: .55rem .7rem; border-radius: .35rem; background: rgba(243, 167, 63, .1); border: 1px solid rgba(243, 167, 63, .3); color: #8a5a12; font-size: .78rem; line-height: 1.6; }
.orders-error { margin: .8rem 0 0; }

.orders-table-wrap { margin-top: .9rem; overflow: hidden; }
.orders-table { border: 1px solid $uni-border-color; border-radius: .45rem; overflow-x: auto; }
.orders-thead, .orders-row { display: grid; grid-template-columns: 82px 106px 96px minmax(130px, 1.6fr) 76px minmax(100px, 1fr) 132px 64px 148px 132px; align-items: center; min-width: 1066px; }
.orders-thead { position: sticky; top: 0; z-index: 2; background: #fafbfb; border-bottom: 1px solid $uni-border-color; }
.orders-th { padding: .6rem .5rem; font-size: .76rem; font-weight: 600; color: $uni-text-color-grey; white-space: nowrap; }
.orders-th--num { text-align: right; }
.orders-row { border-bottom: 1px solid rgba(0, 0, 0, .05); cursor: pointer; background: $uni-bg-color; }
.orders-row:last-child { border-bottom: 0; }
.orders-row:hover { background: rgba(0, 133, 119, .035); }
.orders-row:hover .orders-td--code { color: $uni-color-primary; }
.orders-td { padding: .55rem .5rem; font-size: .8rem; color: $uni-text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.orders-td--code { font-family: monospace; }
.orders-td--name { overflow: hidden; text-overflow: ellipsis; }
.orders-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.orders-td--stack { display: flex; flex-direction: column; justify-content: center; gap: .08rem; white-space: normal; padding-top: .4rem; padding-bottom: .4rem; }
.orders-td-line { display: block; font-size: .78rem; line-height: 1.28; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.orders-td-line--muted { color: $uni-text-color-grey; }
.orders-td--plan-time { display: flex; flex-direction: column; justify-content: center; gap: .08rem; white-space: normal; padding-top: .4rem; padding-bottom: .4rem; }
.orders-plan-line { font-size: .72rem; line-height: 1.32; font-variant-numeric: tabular-nums; color: $uni-text-color; white-space: nowrap; }
.orders-plan-line--end { color: $uni-text-color-grey; }
.orders-plan-empty { font-size: .74rem; color: $uni-text-color-grey; }
.orders-td--time { font-size: .75rem; color: $uni-text-color-grey; }
.orders-td--op { display: flex; align-items: center; gap: .3rem; }
.orders-td--op button { margin: 0; }
.orders-empty { padding: 2.4rem 1rem; text-align: center; color: $uni-text-color-grey; font-size: .85rem; min-width: 1080px; box-sizing: border-box; }
.orders-empty-hint { display: block; margin-top: .4rem; font-size: .76rem; }
.orders-pagination { display: flex; align-items: center; justify-content: flex-end; gap: .8rem; margin-top: .8rem; }

@media (max-width: 720px) {
  .orders-page { padding: 1rem; }
  .orders-card { padding: 0 .7rem .8rem; }
  .orders-search { width: 100%; }
}
</style>
