<template>
  <view class="mes-page mes-form" :class="{ 'mes-form--embedded': embedded }">
    <view v-if="!embedded" class="mes-header"><view><view class="mes-title">{{ recordKey ? '编辑' : '新增' }}{{ isProduct ? '产品物料 / BOM' : '生产订单' }}</view><view class="mes-description">{{ isProduct ? '产品编码是唯一标识。照片识别后核对名称、规格及每一行包装材料。' : '订单保存自己的物料快照，编辑订单不会自动覆盖产品物料档案。' }}</view></view></view>
    <view v-if="loading" class="mes-muted">加载中…</view>
    <view v-if="error" class="mes-error">{{ error }}</view>
    <button v-if="conflicted" size="mini" :disabled="busy" @click="reloadLatest">重新加载最新记录</button>
    <view v-if="authorized && ready">
      <MesPhotoImport ref="photoImport" :purpose="isProduct ? 'bom' : 'order'" :expected-product-code="isProduct ? recordKey : ''" :disabled="saving || loading" :accept-result="recognized" @busy="recognizing = $event" @confirmation-change="pendingProductCodeConfirmation = $event" />
      <view class="mes-error" v-if="uncertain.length">需要核对：{{ uncertainText }}。请逐项修正后保存。</view>
      <view class="mes-fields">
        <view v-for="field in fields" :key="field.key" class="mes-field">
          <text class="mes-field-label">{{ field.label }}</text>
          <input v-model="form[field.key]" :type="field.numeric ? 'digit' : 'text'" :maxlength="field.max || 120" :disabled="busy || (recordKey && field.key === identityField)" :placeholder="field.placeholder || field.label" />
        </view>
      </view>
      <view v-if="!isProduct" class="mes-toolbar" style="margin-bottom: 1rem"><button size="mini" :disabled="busy" @click="fillFromProduct">载入产品基本信息</button><text class="mes-muted">载入名称和固定包装规格；请按客户选择材料方案。</text></view>
      <PackagingSelection v-if="!isProduct" :value="form" :call="callMes" :disabled="busy" @input="form = $event" />
      <MaterialListEditor :value="form.materials" :disabled="busy" @input="form.materials = $event" />
      <PalletEditor v-if="!isProduct" :value="form.pallet || {}" :disabled="busy" @input="form.pallet = $event" />
      <view v-if="!isProduct" class="mes-field"><text class="mes-field-label">订单状态</text><uni-data-select v-model="form.orderStatus" :clear="false" :localdata="[{ value: 'draft', text: '草稿' }, { value: 'confirmed', text: '已确认（上托可后补）' }]" /></view>
      <view v-if="!isProduct && showPlanFields" class="mes-fields mes-plan-fields">
        <view class="mes-field">
          <text class="mes-field-label">计划开始时间</text>
          <view class="mes-plan-row">
            <uni-datetime-picker class="mes-plan-picker" type="datetime" hide-second :clear-icon="false" :modelValue="planStartText" :disabled="busy" placeholder="可留空，选择日期与时间" @update:modelValue="planStartText = $event" />
            <button size="mini" :disabled="busy || !planStartText" @click="clearPlan('start')">清空</button>
          </view>
        </view>
        <view class="mes-field">
          <text class="mes-field-label">计划结束时间</text>
          <view class="mes-plan-row">
            <uni-datetime-picker class="mes-plan-picker" type="datetime" hide-second :clear-icon="false" :modelValue="planEndText" :disabled="busy" placeholder="可留空，选择日期与时间" @update:modelValue="planEndText = $event" />
            <button size="mini" :disabled="busy || !planEndText" @click="clearPlan('end')">清空</button>
          </view>
        </view>
        <text class="mes-description">计划时间可留空；填写后用于甘特排期，结束须晚于开始。清空后按契约传 null。</text>
      </view>
      <view class="mes-field" style="margin-top: 1rem"><text class="mes-field-label">{{ version > 0 ? '修改原因 *' : '录入说明（可选）' }}</text><textarea v-model="form.changeReason" :disabled="busy" maxlength="1000" auto-height placeholder="说明本次材料、上托要求或其他内容的调整依据" /></view>
      <view v-if="form.sourceDocumentId" class="mes-description">已关联原始单据和识别记录，保存前归档原图。同哈希原图直接复用。</view>
      <view v-if="!isProduct" class="mes-toolbar" style="margin-top: 1rem">
        <button v-if="validProductCode && !productArchiveKnown" type="primary" size="mini" :disabled="busy || pendingProductCodeConfirmation" @click="createProductBom">核对并建立产品 BOM</button>
        <text v-if="bomMessage" class="mes-description">{{ bomMessage }}</text>
        <text v-else-if="productArchiveKnown" class="mes-description">产品已建档，后续导入可跳过 AI。订单保存仍保留本次材料清单。</text>
        <text v-else class="mes-muted">订单保存与产品建档分别进行；建立 BOM 前请核对产品和全部材料。</text>
      </view>
      <view v-if="isProduct && form.enabled === false" class="mes-description">这份产品档案已停用；保存修改仍保留停用状态，请在列表核对后启用。</view>
      <view class="mes-footer"><button type="primary" :disabled="busy || pendingProductCodeConfirmation" @click="save">{{ saving ? '保存中…' : embedded ? '保存' : '核对完成，保存' }}</button><button v-if="!isProduct && recordKey" :disabled="busy" @click="trace">查看追溯</button><button v-if="!isProduct && recordKey && !embedded" :disabled="busy" @click="createPlan">从已保存订单建立方案</button><button v-if="embedded" :disabled="busy" @click="cancel">取消</button><button v-else :disabled="busy" @click="back">返回列表</button></view>
    </view>
    <!-- #ifndef H5 -->
    <fix-window v-if="!embedded" />
    <!-- #endif -->
  </view>
</template>
<script>
import { callMes, requireMesAdmin, confirmMes } from '@/utils/mes-api.js';
import MesPhotoImport from './MesPhotoImport.vue';
import MaterialListEditor from './MaterialListEditor.vue';
import PackagingSelection from './PackagingSelection.vue';
import PalletEditor from './PalletEditor.vue';
const blank = () => ({ productCode: '', productName: '', packSpec: '', materials: [], orderNo: '', batchNo: '', plannedQty: '', sampleCount: '', enabled: true, customerId: '', customerName: '', planVersionId: '', pallet: {}, orderStatus: 'draft', changeReason: '' });
export default {
  components: { MesPhotoImport, MaterialListEditor, PackagingSelection, PalletEditor },
  props: { kind: { type: String, default: 'products' }, recordKey: { type: String, default: '' }, embedded: { type: Boolean, default: false }, showPlanFields: { type: Boolean, default: false } },
  emits: ['saved', 'cancel'],
  data() { return { authorized: false, ready: false, form: blank(), version: 0, observedKey: '', observedEnabled: true, knownProductCode: '', bomMessage: '', loading: false, saving: false, recognizing: false, pendingProductCodeConfirmation: false, conflicted: false, error: '', uncertain: [], planStartText: '', planEndText: '' }; },
  computed: {
    busy() { return this.loading || this.saving || this.recognizing; },
    isProduct() { return this.kind === 'products'; },
    fn() { return this.isProduct ? 'product-materials' : 'production-orders'; },
    identityField() { return this.isProduct ? 'productCode' : 'orderNo'; },
    validProductCode() { return /^\d{10}$/.test(String(this.form.productCode || '').trim()); },
    productArchiveKnown() { return this.validProductCode && this.knownProductCode === String(this.form.productCode).trim(); },
    uncertainText() { return this.uncertain.map(key => { const field = this.fields.find(item => item.key === key); return field ? field.label.replace(/\s*\*$/, '') : '包装材料明细'; }).join('、'); },
    fields() {
      const product = [{ key: 'productCode', label: '产品编码 *', placeholder: '10 位数字', max: 10 }, { key: 'productName', label: '产品名称 *' }, { key: 'packSpec', label: '包装规格 *', placeholder: '完整保留净重和包装层级', max: 500 }];
      return this.isProduct ? product : [{ key: 'orderNo', label: '订单号 *', max: 12 }, { key: 'batchNo', label: '批号 *', placeholder: '完整批号，B 单保留末尾 B', max: 12 }, ...product, { key: 'plannedQty', label: '计划产量（件）*', numeric: true }, { key: 'sampleCount', label: '取样说明', max: 2000 }];
    }
  },
  watch: {
    'form.productCode'(code, previous) {
      if (String(code || '').trim() === String(previous || '').trim()) return;
      if (this.knownProductCode !== String(code || '').trim()) this.knownProductCode = '';
      this.bomMessage = '';
    }
  },
  async mounted() {
    this.loading = true;
    try {
      await requireMesAdmin(); this.authorized = true;
      if (this.recordKey) {
        const record = await callMes(this.fn, 'get', { [this.identityField]: this.recordKey });
        if (!record) throw new Error('记录不存在，请返回列表刷新');
        this.form = { ...blank(), ...record };
        this.rememberObservation(this.observationFor(this.recordKey, record));
        this.syncPlanText();
      }
      this.ready = true;
    } catch (error) { this.error = error.message; }
    finally { this.loading = false; }
  },
  methods: {
    callMes,
    trace() { uni.navigateTo({ url: '/pages/mes/orders/trace?orderNo=' + encodeURIComponent(this.recordKey) }); },
    createPlan() { uni.navigateTo({ url: '/pages/mes/packaging/manage?orderNo=' + encodeURIComponent(this.recordKey) }); },
    observationFor(key, record) {
      const version = record && Number(record.version);
      return { key, version: record ? Number.isInteger(version) && version > 0 ? version : 1 : 0, enabled: !record || record.enabled !== false };
    },
    rememberObservation(observation) {
      this.observedKey = observation ? observation.key : '';
      this.version = observation ? observation.version : 0;
      this.observedEnabled = observation ? observation.enabled : true;
    },
    async observeIdentity(form) {
      const key = String(form[this.identityField] || '').trim();
      if (!(this.isProduct ? /^\d{10}$/ : /^\d{4,12}$/).test(key)) return null;
      const existing = await callMes(this.fn, 'get', { [this.identityField]: key });
      return this.observationFor(key, existing);
    },
    async recognized(result) {
      if (this.loading || this.saving) return false;
      if (this.recordKey && result.needsProductCodeConfirmation) { this.error = result.message || '产品编码尚未确认，请先核对编码后继续。'; return true; }
      if (this.recordKey && String(result[this.identityField] || '').trim() !== this.recordKey) {
        this.error = '照片中的' + (this.isProduct ? '产品编码' : '订单号') + '与当前记录不一致，请在新增页面导入。'; return false;
      }
      this.loading = true; this.error = '';
      try {
        const nextForm = { ...blank(), ...result, customerId: this.form.customerId || '', customerName: this.form.customerName || '', enabled: this.isProduct && result.archiveMatched ? result.enabled !== false : this.form.enabled };
        const key = String(nextForm[this.identityField] || '').trim();
        const snapshotVersion = Number(result.version);
        let observation;
        if (this.isProduct && result.archiveMatched && /^\d{10}$/.test(key) && Number.isInteger(snapshotVersion) && snapshotVersion > 0) {
          observation = this.observationFor(key, result);
        } else if (this.recordKey) {
          observation = { key: this.observedKey, version: this.version, enabled: this.observedEnabled };
        } else {
          observation = await this.observeIdentity(nextForm);
        }
        if (observation) nextForm.enabled = observation.enabled;
        this.form = nextForm;
        this.rememberObservation(observation);
        if (!this.isProduct && result.archiveMatched && /^\d{10}$/.test(String(nextForm.productCode || '').trim())) this.knownProductCode = String(nextForm.productCode).trim();
        this.uncertain = result.uncertain || []; this.conflicted = false;
        return true;
      } catch (error) { this.error = error.message; return false; }
      finally { this.loading = false; }
    },
    async fillFromProduct() {
      if (this.busy) return;
      this.saving = true;
      try {
        const record = await callMes('product-materials', 'get', { productCode: this.form.productCode });
        if (record) this.knownProductCode = String(record.productCode || this.form.productCode).trim();
        if (!record || record.enabled === false) throw new Error('没有找到启用的产品物料档案，请先录入产品');
        const nextForm = { ...this.form, productName: record.productName, packSpec: record.packSpec };
        if (!this.recordKey && String(nextForm[this.identityField] || '').trim() !== this.observedKey) {
          const observation = await this.observeIdentity(nextForm);
          this.rememberObservation(observation);
          if (observation) nextForm.enabled = observation.enabled;
        }
        this.form = nextForm; this.error = '';
      } catch (error) { this.error = error.message; }
      finally { this.saving = false; }
    },
    async createProductBom() {
      if (this.isProduct || this.busy || this.pendingProductCodeConfirmation || this.productArchiveKnown) return;
      this.error = ''; this.bomMessage = '';
      const record = {
        productCode: String(this.form.productCode || '').trim(),
        productName: String(this.form.productName || '').trim(),
        packSpec: String(this.form.packSpec || '').trim(),
        materials: (this.form.materials || []).map(row => ({ ...row })),
        source: this.form.source || 'manual', sourceDocumentId: this.form.sourceDocumentId || '', recognitionRunId: this.form.recognitionRunId || ''
      };
      if (!/^\d{10}$/.test(record.productCode) || !record.productName || !record.packSpec || !record.materials.length || record.materials.some(row => !String(row.materialCode || '').trim() || !String(row.unit || '').trim())) {
        this.error = '建立 BOM 前请核对 10 位产品编码、产品名称、包装规格，以及每行材料的编号和计量单位'; return;
      }
      this.saving = true;
      try {
        const existing = await callMes('product-materials', 'get', { productCode: record.productCode });
        if (existing) { this.productBomExists(record.productCode); return; }
        if (!await confirmMes('核对并建立产品 BOM', '请确认已核对产品 ' + record.productCode + '（' + record.productName + '）、包装规格“' + record.packSpec + '”和全部 ' + record.materials.length + ' 行材料。确认后单独建立产品档案？')) return;
        try {
          if (record.sourceDocumentId) await this.$refs.photoImport.archiveSource(this.form);
          await callMes('product-materials', 'upsert', { record, expectedVersion: 0 });
        } catch (error) {
          if (error.code === 409) {
            const current = await callMes('product-materials', 'get', { productCode: record.productCode });
            if (current) { this.productBomExists(record.productCode); return; }
          }
          throw error;
        }
        this.knownProductCode = record.productCode;
        this.bomMessage = '产品 BOM 已建立，后续导入可跳过 AI。订单保存仍保留本次材料清单。';
        uni.showToast({ title: '产品 BOM 已建立', icon: 'none' });
      } catch (error) { this.error = error.message; }
      finally { this.saving = false; }
    },
    productBomExists(productCode) {
      this.knownProductCode = productCode;
      this.bomMessage = '产品已建档，已跳过。后续导入可跳过 AI，当前订单材料保持原样。';
      uni.showToast({ title: '产品已建档，已跳过', icon: 'none' });
    },
    async reloadLatest() {
      if (this.busy) return;
      this.saving = true; this.error = '';
      try {
        if (!await confirmMes('重新加载最新记录', '将用云端最新内容替换当前尚未保存的修改。加载后请重新核对再保存。')) return;
        const key = this.recordKey || String(this.form[this.identityField]).trim();
        const record = await callMes(this.fn, 'get', { [this.identityField]: key });
        if (!record) throw new Error('记录不存在，请返回列表刷新');
        this.form = { ...blank(), ...record }; this.rememberObservation(this.observationFor(key, record)); this.uncertain = []; this.conflicted = false; this.syncPlanText();
      } catch (error) { this.error = error.message; }
      finally { this.saving = false; }
    },
    /** 计划时间：picker 文本（YYYY-MM-DD HH:mm）↔ 毫秒时间戳；清空传 null，两个都填时结束须晚于开始。 */
    msToPlanText(value) {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms <= 0) return '';
      const date = new Date(ms), pad = part => String(part).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    },
    planTextToMs(text, label) {
      if (!text) return null;
      const normalized = String(text).trim().replace(' ', 'T');
      const withSeconds = normalized.length === 16 ? normalized + ':00' : normalized;
      const ms = new Date(withSeconds).getTime();
      if (!Number.isFinite(ms)) throw new Error(label + '格式不正确');
      if (ms < Date.UTC(2020, 0, 1) || ms > Date.UTC(2035, 11, 31, 23, 59, 59)) throw new Error(label + '须在 2020-01-01 至 2035-12-31 之间');
      return ms;
    },
    applyPlanTimes() {
      try {
        const start = this.planTextToMs(this.planStartText, '计划开始时间');
        const end = this.planTextToMs(this.planEndText, '计划结束时间');
        if (start !== null && end !== null && end <= start) throw new Error('计划结束时间须晚于计划开始时间');
        this.form.planStartAt = start; this.form.planEndAt = end;
        return true;
      } catch (error) { this.error = error.message; return false; }
    },
    syncPlanText() { this.planStartText = this.msToPlanText(this.form.planStartAt); this.planEndText = this.msToPlanText(this.form.planEndAt); },
    clearPlan(which) { if (which === 'start') this.planStartText = ''; else this.planEndText = ''; },
    async save() {
      if (this.busy || this.pendingProductCodeConfirmation) return;
      this.error = '';
      if (this.showPlanFields && !this.applyPlanTimes()) return;
      if (!/^\d{10}$/.test(String(this.form.productCode).trim()) || !String(this.form.productName).trim() || !String(this.form.packSpec).trim()) { this.error = '请填写 10 位产品编码、产品名称和包装规格'; return; }
      if (!this.form.materials.length) { this.error = '包装材料清单至少需要一行'; return; }
      this.saving = true;
      try {
        const key = String(this.form[this.identityField]).trim();
        if (key !== this.observedKey) {
          const observation = await this.observeIdentity(this.form);
          if (!observation) throw new Error(this.isProduct ? '请填写 10 位产品编码' : '请填写 4～12 位订单号');
          this.rememberObservation(observation);
        }
        const expectedVersion = this.version;
        if (!this.recordKey && expectedVersion > 0 && !await confirmMes('更新已有记录', '此' + (this.isProduct ? '产品编码' : '订单号') + '已有记录。确认使用当前核对的内容更新' + (!this.observedEnabled && this.form.enabled !== false ? '并重新启用' : '') + '？')) return;
        if (expectedVersion > 0 && !String(this.form.changeReason || '').trim()) throw new Error('请填写修改原因');
        if (this.form.sourceDocumentId) await this.$refs.photoImport.archiveSource(this.form);
        const result = await callMes(this.fn, 'upsert', { record: { ...this.form, uncertain: [] }, expectedVersion });
        this.version = result.version;
        uni.showToast({ title: result.unchanged ? '内容相同，无需更新' : '已保存', icon: 'none' });
        this.finish(result);
      } catch (error) { this.error = error.message; this.conflicted = error.code === 409; }
      finally { this.saving = false; }
    },
    /** 独立页保存后回列表；抽屉内保存只通知父级刷新，不整页跳转。 */
    finish(result) {
      if (this.embedded) { this.$emit('saved', { key: String(this.form[this.identityField] || '').trim(), version: this.version, unchanged: !!(result && result.unchanged), created: !this.recordKey }); return; }
      this.back();
    },
    cancel() { this.$emit('cancel'); },
    back() { if (this.embedded) { this.$emit('cancel'); return; } uni.redirectTo({ url: '/pages/mes/' + this.kind + '/list' }); }
  }
};
</script>
<style lang="scss" scoped>
@import '@/common/mes.scss';
/* 抽屉内嵌：去掉整页留白和最大宽度，由抽屉控制滚动与宽度。 */
.mes-form--embedded { padding: .2rem 1.3rem 1.3rem; max-width: none; }
.mes-form--embedded .mes-header { display: none; }
/* 订单计划时间：datetime-local + 清空按钮。 */
.mes-plan-fields { margin-top: 1rem; }
.mes-plan-row { display: flex; align-items: center; gap: .5rem; }
.mes-plan-row input { flex: 1; min-width: 0; }
.mes-plan-row button { flex-shrink: 0; margin: 0; }
</style>
