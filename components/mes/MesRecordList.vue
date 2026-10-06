<template>
  <view class="mes-page">
    <view class="mes-header">
      <view><view class="mes-title">{{ isProduct ? '产品物料 / BOM' : '生产订单' }}</view><view class="mes-description">{{ isProduct ? '每个产品编码对应一份包装材料清单，支持从照片录入。' : '查找和维护包装指令单，按订单号保存，关联产品编码。' }}</view></view>
      <view class="mes-actions" v-if="authorized">
        <button class="uni-button" type="primary" size="mini" @click="edit()">{{ isProduct ? '新增产品' : '新增订单' }}</button>
        <button class="uni-button" size="mini" @click="edit(null, true)">照片识别导入</button>
        <button v-if="!isProduct" class="uni-button" size="mini" @click="trace()">按批号追溯</button>
      </view>
    </view>
    <view v-if="error" class="mes-error">{{ error }}</view>
    <view v-if="authorized">
      <view class="mes-toolbar">
        <input class="mes-search" v-model="keyword" :placeholder="isProduct ? '搜索产品编码、名称或包装规格' : '搜索订单号、批号、产品编码或名称'" @confirm="search" />
        <view class="mes-filter"><uni-data-select v-model="status" :clear="false" :localdata="statuses" @change="search" /></view>
        <button class="uni-button" size="mini" :disabled="loading" @click="search">查询</button>
        <button class="uni-button" size="mini" :disabled="loading" @click="reload">刷新</button>
      </view>
      <view class="mes-table">
        <uni-table :loading="loading" border stripe emptyText="暂无记录，请新增或从照片导入">
          <uni-tr><uni-th v-for="column in columns" :key="column.key" :width="column.width">{{ column.label }}</uni-th><uni-th width="110">状态</uni-th><uni-th width="175">更新时间</uni-th><uni-th width="175">操作</uni-th></uni-tr>
          <uni-tr v-for="row in rows" :key="row._id">
            <uni-td v-for="column in columns" :key="column.key"><text :class="{ 'mes-code': /Code|No/.test(column.key) }">{{ row[column.key] == null ? '—' : row[column.key] }}</text></uni-td>
            <uni-td>{{ row.enabled === false ? '已停用' : '启用' }}</uni-td>
            <uni-td>{{ formatDate(row.updatedAt || row.savedAt) }}</uni-td>
            <uni-td><view class="mes-actions"><button class="uni-button" type="primary" size="mini" @click="edit(row)">编辑</button><button v-if="!isProduct" size="mini" @click="trace(row)">追溯</button><button class="uni-button" size="mini" :disabled="loading" @click="toggle(row)">{{ row.enabled === false ? '启用' : '停用' }}</button></view></uni-td>
          </uni-tr>
        </uni-table>
      </view>
      <view class="mes-pagination"><uni-pagination show-icon :total="total" :page-size="pageSize" :current="page" @change="changePage" /></view>
    </view>
    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->
  </view>
</template>
<script>
import { callMes, requireMesAdmin, formatMesDate, confirmMes } from '@/utils/mes-api.js';
export default {
  props: { kind: { type: String, default: 'products' } },
  data() { return { authorized: false, rows: [], total: 0, page: 1, pageSize: 20, keyword: '', status: 'active', loading: false, error: '', statuses: [{ value: 'active', text: '启用记录' }, { value: 'disabled', text: '已停用' }, { value: 'all', text: '全部记录' }] }; },
  computed: {
    isProduct() { return this.kind === 'products'; },
    fn() { return this.isProduct ? 'product-materials' : 'production-orders'; },
    columns() { return this.isProduct ? [{ key: 'productCode', label: '产品编码', width: 145 }, { key: 'productName', label: '产品名称', width: 240 }, { key: 'packSpec', label: '包装规格', width: 270 }, { key: 'materialCount', label: '物料行数', width: 100 }] : [{ key: 'orderNo', label: '订单号', width: 115 }, { key: 'batchNo', label: '批号', width: 145 }, { key: 'productCode', label: '产品编码', width: 145 }, { key: 'productName', label: '产品名称', width: 240 }, { key: 'plannedQty', label: '计划产量（件）', width: 135 }]; }
  },
  async mounted() {
    try { await requireMesAdmin(); this.authorized = true; await this.reload(); }
    catch (error) { this.error = error.message; }
  },
  methods: {
    formatDate: formatMesDate,
    trace(row) { uni.navigateTo({ url: '/pages/mes/orders/trace' + (row ? '?orderNo=' + encodeURIComponent(row.orderNo) : '') }); },
    search() { this.page = 1; this.reload(); },
    changePage(event) { this.page = event.current; this.reload(); },
    async reload() {
      if (!this.authorized || this.loading) return;
      this.loading = true; this.error = '';
      try {
        const result = await callMes(this.fn, this.isProduct ? 'adminList' : 'list', { page: this.page, pageSize: this.pageSize, keyword: this.keyword, status: this.status });
        this.rows = result.list; this.total = result.total;
        if (!this.rows.length && this.total && this.page > 1) { this.page = Math.ceil(this.total / this.pageSize); this.loading = false; return this.reload(); }
      } catch (error) { this.error = error.message; }
      finally { this.loading = false; }
    },
    edit(row, photo = false) {
      const key = row ? (this.isProduct ? row.productCode : row.orderNo) : '';
      uni.navigateTo({ url: '/pages/mes/' + this.kind + '/edit' + (key ? '?key=' + encodeURIComponent(key) : photo ? '?photo=1' : '') });
    },
    async toggle(row) {
      const enabled = row.enabled === false;
      const key = this.isProduct ? row.productCode : row.orderNo;
      if (!await confirmMes(enabled ? '启用记录' : '停用记录', (enabled ? '确认启用 ' : '确认停用 ') + key + '？停用后可在“已停用”列表恢复。')) return;
      this.loading = true; this.error = '';
      try { await callMes(this.fn, 'setEnabled', { [this.isProduct ? 'productCode' : 'orderNo']: key, enabled, expectedVersion: Number(row.version) || 1 }); }
      catch (error) { this.error = error.message; }
      finally { this.loading = false; }
      const message = this.error;
      await this.reload();
      if (message) this.error = message;
    }
  }
};
</script>
<style lang="scss" scoped>@import '@/common/mes.scss';</style>
