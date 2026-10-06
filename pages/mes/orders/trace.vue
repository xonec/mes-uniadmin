<template>
  <view class="mes-page trace-page">
    <view class="mes-header"><view><view class="mes-title">批号追溯</view><view class="mes-description">查看原始单据、当时采用的材料与上托要求，以及每次修改的记录。</view></view><button size="mini" :disabled="loading" @click="back">返回订单</button></view>
    <view class="mes-toolbar" v-if="authorized">
      <view class="query-mode"><uni-data-select v-model="queryMode" :clear="false" :localdata="[{ value: 'batchNo', text: '按完整批号' }, { value: 'orderNo', text: '按订单号' }]" /></view>
      <input class="mes-search" v-model="query" :placeholder="queryMode === 'batchNo' ? '例如 AP3F26X1042' : '例如 565059'" @confirm="search" />
      <button type="primary" size="mini" :disabled="loading" @click="search">{{ loading ? '读取中…' : '查询追溯' }}</button>
    </view>
    <view v-if="error" class="mes-error">{{ error }}</view>
    <view v-if="!data && !loading && !error" class="trace-empty">输入完整批号或订单号，查找原始单据和版本记录。</view>
    <view v-if="data" class="trace-layout">
      <view class="trace-timeline">
        <view class="section-title">订单版本</view>
        <button v-for="item in data.versions" :key="item.version" class="version-button" :class="{ selected: Number(data.order.version || 1) === item.version }" :disabled="loading" @click="load(item.version)">
          <view class="version-heading">V{{ item.version }} <text>{{ item.version === data.currentVersion ? '当前版本' : '历史版本' }}</text></view>
          <view class="version-time">{{ formatDate(item.at) }}</view>
          <view>{{ item.audit.actorName || item.audit.actorId || '未记录操作人' }}</view>
          <view class="version-reason">{{ item.audit.reason || '早期数据未记录原因' }}</view>
        </button>
        <button v-if="data.hasMore" size="mini" :disabled="loading" @click="load(data.order.version, data.page + 1, true)">加载更早版本</button>
      </view>
      <view class="trace-main">
        <view class="trace-section">
          <view class="section-title">{{ data.order.batchNo }} <text class="version-tag">订单 V{{ data.order.version || 1 }}</text></view>
          <view class="facts"><view v-for="field in orderFields" :key="field.key"><text>{{ field.label }}</text><view>{{ display(data.order[field.key]) }}</view></view></view>
          <view class="status-line"><text>{{ data.order.orderStatus === 'confirmed' ? '订单已确认' : data.order.orderStatus === 'draft' ? '订单草稿' : '早期记录未标注状态' }}</text><text>{{ data.order.pallet && data.order.pallet.status === 'confirmed' ? '上托已确认' : '上托待补充' }}</text></view>
          <view class="mes-description">包装方案：{{ data.order.planName || '按本单录入 / 早期未关联方案' }} {{ data.order.planVersion ? '· V' + data.order.planVersion : '' }}</view>
          <view v-if="data.plan" class="mes-description">方案依据：{{ data.plan.audit && data.plan.audit.reason || '—' }} · {{ data.plan.audit && data.plan.audit.actorName || data.plan.updatedBy || '—' }}</view>
          <button v-if="data.plan && data.plan.sourceDocumentId && (!data.source || data.plan.sourceDocumentId !== data.source._id || data.plan.recognitionRunId !== data.order.recognitionRunId)" size="mini" :disabled="loading" @click="loadPlanSource">查看包装方案的原始来源</button>
        </view>
        <view class="trace-section">
          <view class="section-title">当时的材料清单</view>
          <view class="mes-table"><uni-table border emptyText="此版本没有保存材料清单"><uni-tr><uni-th>序号</uni-th><uni-th>物料编号</uni-th><uni-th>名称 / 规格</uni-th><uni-th>物料版本</uni-th><uni-th>单位</uni-th><uni-th>来源页</uni-th></uni-tr><uni-tr v-for="(row, index) in materials" :key="index"><uni-td>{{ row.seq || index + 1 }}</uni-td><uni-td class="mes-code">{{ row.materialCode }}</uni-td><uni-td><view>{{ row.materialName || '—' }}</view><view class="material-spec">{{ row.spec || '—' }}</view></uni-td><uni-td>{{ display(row.materialVersion) }}</uni-td><uni-td>{{ row.unit }}</uni-td><uni-td>{{ (row.sourcePages || []).join('、') || '未标注' }}</uni-td></uni-tr></uni-table></view>
        </view>
        <view class="trace-section"><view class="section-title">当时的上托要求</view><view class="facts"><view v-for="field in palletFields" :key="field.key"><text>{{ field.label }}</text><view>{{ display(pallet[field.key]) }}</view></view></view><view class="mes-description">来源：{{ sourceLabels[pallet.sourceType] || '待补充' }} · {{ pallet.sourceNote || '未填写依据' }}</view></view>
        <view v-for="sourceCard in sourceCards" :key="sourceCard.title + sourceCard.source._id" class="trace-section">
          <view class="section-title">{{ sourceCard.title }}</view><view class="mes-description">录入时间：{{ formatDate(sourceCard.source.createdAt) }} · 原图 {{ sourceCard.source.pages.length }} 页</view>
          <view class="source-photos"><view v-for="page in sourceCard.source.pages" :key="page.pageNo" class="source-photo"><image v-if="page.url" :src="page.url" mode="aspectFit" @click="preview(sourceCard.source, page.pageNo)" /><view v-else class="photo-missing">原图未归档</view><view>第{{ page.pageNo }}页</view><text class="image-hash" selectable>SHA-256：{{ page.sha256 }}</text></view></view>
          <view v-if="sourceCard.source.recognition" class="recognition-info">
            <view class="mes-description">识别来源：{{ recognitionLabels[sourceCard.source.recognition.source] || sourceCard.source.recognition.source }} · {{ sourceCard.source.recognition.provider || '—' }} · {{ sourceCard.source.recognition.model || '—' }} · {{ formatDate(sourceCard.source.recognition.createdAt) }}</view>
            <button size="mini" @click="expandedSource = expandedSource === sourceCard.title ? '' : sourceCard.title">{{ expandedSource === sourceCard.title ? '收起识别凭据' : '展开原始识别结果与Prompt' }}</button>
            <view v-if="expandedSource === sourceCard.title"><view class="evidence-title">原始转录</view><text class="evidence-text" selectable>{{ sourceCard.source.recognition.rawText || '本次识别未提供完整转录' }}</text><view class="evidence-title">模型 / OCR 原始结果</view><text class="evidence-text" selectable>{{ json(sourceCard.source.recognition.output.recognitionRaw || sourceCard.source.recognition.output.recognitionDocument || sourceCard.source.recognition.output) }}</text><view class="evidence-title">当次Prompt</view><text class="evidence-text" selectable>{{ json(sourceCard.source.recognition.prompt) }}</text></view>
          </view>
        </view>
        <view v-if="!data.source" class="trace-section mes-muted">此版本没有关联原始照片。早期记录保留已有数据，后续补录会留下新版本和修改原因。</view>
        <view class="trace-section"><view class="section-title">本版本与上一版本的差异</view><view v-if="!data.changes.length" class="mes-muted">首次录入或此版本没有可比较的上一版本。</view><view v-for="change in data.changes" :key="change.field" class="change-item"><view class="evidence-title">{{ fieldLabels[change.field] || change.field }}</view><view class="change-columns"><view><text class="change-label">修改前</text><text class="change-value" selectable>{{ json(change.before) }}</text></view><view><text class="change-label">修改后</text><text class="change-value" selectable>{{ json(change.after) }}</text></view></view></view></view>
        <view v-if="data.records.length" class="trace-section"><view class="section-title">关联生产记录</view><view v-for="record in data.records" :key="record._id" class="mes-description">{{ record.batchNo }} · 生产记录 V{{ record.version || 1 }}{{ record.historical ? '（历史）' : '' }} · {{ record.orderVersion ? '采用订单V' + record.orderVersion : '早期未关联订单版本' }} · {{ formatDate(record.updatedAt || record.savedAt) }} <button size="mini" :disabled="loading" @click="loadProduction(record)">查看当时数据</button></view><text v-if="productionDetail" class="evidence-text" selectable>{{ json(productionDetail) }}</text></view>
      </view>
    </view>
  </view>
</template>
<script>
import { callMes, requireMesAdmin, formatMesDate } from '@/utils/mes-api.js';
const FIELD_LABELS = { orderNo: '订单号', batchNo: '生产批号', productCode: '产品编码', productName: '产品名称', packSpec: '固定包装规格', rawPackSpec: '单据原始规格', plannedQty: '计划产量（件）', plannedQtyRaw: '计划产量原文', sampleCount: '取样说明', materials: '材料清单', customerId: '客户关联', customerName: '客户名称', planVersionId: '包装方案版本', planId: '包装方案', planName: '方案名称', planVersion: '方案版本号', pallet: '上托要求', orderStatus: '订单状态', sourceDocumentId: '原始单据关联', recognitionRunId: '识别记录关联', sourceType: '录入方式', enabled: '启用状态', uncertain: '待核对字段' };
export default {
  data() { return { authorized: false, loading: false, error: '', queryMode: 'batchNo', query: '', lookup: null, data: null, productionDetail: null, extraSource: null, expandedSource: '', fieldLabels: FIELD_LABELS, sourceLabels: { customer: '客户要求', site: '现场标准', document: '单据明确记载' }, recognitionLabels: { archive: 'OCR初筛并查询产品档案', model: '大模型识别', cache: '复用识别结果', ocrspace: 'OCR.space初筛', local: '本地文字识别' }, orderFields: ['orderNo', 'productCode', 'productName', 'customerName', 'packSpec', 'rawPackSpec', 'plannedQtyRaw', 'sampleCount'].map(key => ({ key, label: FIELD_LABELS[key] })), palletFields: [{ key: 'casesPerLayer', label: '箱 / 层' }, { key: 'layers', label: '层数' }, { key: 'casesPerPallet', label: '箱 / 托' }, { key: 'dimensions', label: '托盘尺寸' }, { key: 'placement', label: '摆放说明' }] }; },
  computed: { materials() { return this.data.order.packagingSnapshot && this.data.order.packagingSnapshot.materials || this.data.order.materials || []; }, pallet() { return this.data.order.packagingSnapshot && this.data.order.packagingSnapshot.pallet || this.data.order.pallet || {}; }, sourceCards() { return [...(this.data.source ? [{ title: '本订单原始单据', source: this.data.source }] : []), ...(this.extraSource ? [{ title: '包装方案原始来源', source: this.extraSource }] : [])]; } },
  async onLoad(options) { if (options.orderNo) { this.queryMode = 'orderNo'; this.query = options.orderNo; } else if (options.batchNo) this.query = options.batchNo; try { await requireMesAdmin(); this.authorized = true; if (this.query) await this.search(); } catch (error) { this.error = error.message; } },
  methods: {
    formatDate: formatMesDate,
    display(value) { return value === null || value === undefined || value === '' ? '待补充' : value; },
    json(value) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); },
    async search() { if (this.loading) return; this.lookup = { [this.queryMode]: String(this.query || '').trim() }; this.data = null; await this.load(); },
    async load(version, page = 1, append = false) { if (!this.authorized || this.loading || !this.lookup) return; this.loading = true; this.error = ''; this.extraSource = null; this.productionDetail = null; try { const result = await callMes('production-orders', 'trace', { ...this.lookup, ...(version ? { version } : {}), page }); if (append && this.data) result.versions = [...this.data.versions, ...result.versions]; this.data = result; } catch (error) { this.error = error.message; } finally { this.loading = false; } },
    async loadPlanSource() { this.loading = true; this.error = ''; try { this.extraSource = await callMes('production-orders', 'sourceDetail', { sourceDocumentId: this.data.plan.sourceDocumentId, recognitionRunId: this.data.plan.recognitionRunId }); } catch (error) { this.error = error.message; } finally { this.loading = false; } },
    async loadProduction(record) { this.loading = true; this.error = ''; try { this.productionDetail = await callMes('production-records', 'getVersion', { batchNo: record.batchNo, version: record.version }); } catch (error) { this.error = error.message; } finally { this.loading = false; } },
    preview(source, pageNo) { const pages = source.pages.filter(page => page.url); const selected = pages.find(page => page.pageNo === pageNo); if (selected) uni.previewImage({ urls: pages.map(page => page.url), current: selected.url }); },
    back() { uni.redirectTo({ url: '/pages/mes/orders/list' }); }
  }
};
</script>
<style lang="scss" scoped>
@import '@/common/mes.scss';
.trace-page { max-width: 92rem; }.query-mode { min-width: 10rem; }.trace-empty { padding: 4rem 1rem; color: $uni-text-color-grey; text-align: center; }
.trace-layout { display: flex; gap: 1.5rem; align-items: flex-start; margin-top: 1.5rem; }.trace-timeline { flex: 0 0 14rem; }.trace-main { flex: 1; min-width: 0; }.section-title { font-size: 1rem; font-weight: 650; margin-bottom: .9rem; }
.version-button { padding: .8rem; margin: .6rem 0; text-align: left; line-height: 1.5; font-size: .85rem; background: $uni-bg-color-grey; border-left: .2rem solid transparent; }.version-button.selected { border-left-color: $uni-color-primary; background: $uni-bg-color; }.version-heading { display: flex; justify-content: space-between; font-weight: 600; }.version-heading text, .version-time, .version-reason { color: $uni-text-color-grey; font-weight: normal; }.version-time { font-size: .75rem; margin: .3rem 0; }.version-tag { font-size: .8rem; font-weight: normal; color: $uni-text-color-grey; }
.trace-section { padding: 1.2rem; margin-bottom: 1rem; background: $uni-bg-color; border: 1px solid $uni-border-color; border-radius: .4rem; }.facts { display: flex; flex-wrap: wrap; gap: 1rem; }.facts > view { flex: 1 1 14rem; overflow-wrap: anywhere; }.facts text { display: block; font-size: .8rem; margin-bottom: .3rem; color: $uni-text-color-grey; }.status-line { display: flex; gap: 1rem; margin-top: 1rem; font-size: .85rem; color: $uni-color-primary; }.material-spec { color: $uni-text-color-grey; font-size: .8rem; line-height: 1.6; max-width: 40rem; overflow-wrap: anywhere; white-space: pre-wrap; }
.source-photos { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1rem; }.source-photo { width: 11rem; }.source-photo image, .photo-missing { width: 100%; height: 15rem; background: $uni-bg-color-grey; cursor: pointer; }.image-hash { display: block; font-size: .65rem; color: $uni-text-color-grey; overflow-wrap: anywhere; line-height: 1.5; margin-top: .4rem; }.recognition-info { margin-top: 1rem; }.recognition-info button { margin: .7rem 0; }.evidence-title { font-weight: 600; font-size: .85rem; margin: .8rem 0 .4rem; }.evidence-text, .change-value { display: block; white-space: pre-wrap; overflow-wrap: anywhere; padding: .8rem; background: $uni-bg-color-grey; max-height: 24rem; overflow-y: auto; font-size: .8rem; line-height: 1.7; }
.change-item { border-top: 1px solid $uni-border-color; margin-top: .8rem; }.change-columns { display: flex; gap: 1rem; }.change-columns > view { flex: 1; min-width: 0; }.change-label { display: block; color: $uni-text-color-grey; margin-bottom: .4rem; font-size: .8rem; }.change-value { max-height: 14rem; }
@media (max-width: 800px) { .trace-layout { flex-direction: column; }.trace-timeline { flex: auto; width: 100%; display: flex; flex-wrap: wrap; gap: .6rem; }.trace-timeline .section-title { flex-basis: 100%; }.version-button { flex: 1 1 10rem; }.trace-main { width: 100%; }.change-columns { flex-direction: column; } }
</style>
