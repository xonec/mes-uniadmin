<template>
  <view class="mes-page ocr-page">
    <view class="mes-header">
      <view><view class="mes-title">OCR 与 AI 识别配置</view><view class="mes-description">连接供应商，选择模型，再安排识别顺序。后台与生产助手共用这份配置。</view></view>
      <view class="mes-actions"><button :disabled="busy" @click="load()">重新加载</button><button type="primary" :disabled="busy || !ready" @click="save">{{ saving ? '保存中…' : '保存配置' }}</button></view>
    </view>
    <view v-if="error" class="mes-error error-banner" role="alert">{{ error }}</view>
    <view v-if="loading" class="mes-muted">正在读取配置…</view>
    <view v-if="ready" class="ocr-layout">
      <view class="ocr-main">
        <view class="panel">
          <view class="panel-heading"><view class="heading-title"><text class="section-number">01</text><view class="panel-title">供应商连接</view></view><button size="mini" :disabled="busy || form.providers.length >= 8" @click="addProvider">添加供应商</button></view>
          <view class="mes-description panel-intro">在供应商内获取和选择模型。已保存的 API Key 仅显示星号，更换时重新输入。</view>
          <view v-if="editingStepId" class="edit-notice"><text>正在更换第 {{ editingStepIndex + 1 }} 项模型，可在任一供应商中选择后应用。</text><button size="mini" :disabled="busy" @click="editingStepId = ''">取消更换模型</button></view>
          <view v-for="provider in form.providers" :id="'supplier-' + provider.id" :key="provider.id" class="provider-card" :class="{ paused: !provider.enabled }">
            <view class="provider-heading">
              <view class="provider-identity"><text class="provider-name">{{ provider.name }}</text><text class="badge" :class="provider.type === 'ocrspace' ? 'badge-ocr' : 'badge-ai'">{{ provider.type === 'ocrspace' ? '免费初筛' : 'AI 模型' }}</text><text class="connection-status" :class="{ configured: provider.keySet && !provider.keyEditing }">{{ keyStatus(provider) }}</text></view>
              <view class="mes-actions provider-actions"><text class="control-label">{{ provider.enabled ? '启用' : '停用' }}</text><switch :checked="provider.enabled" :disabled="busy || provider.type === 'ocrspace'" @change="provider.enabled = !!$event.detail.value" /><button v-if="provider.type !== 'ocrspace'" size="mini" :disabled="busy" @click="removeProvider(provider.id)">移除</button></view>
            </view>
            <view class="mes-fields connection-fields">
              <view class="mes-field service-field"><text class="mes-field-label">服务类型</text><uni-data-select :model-value="provider.type" :localdata="provider.type === 'ocrspace' ? [{ value: 'ocrspace', text: 'OCR.space' }] : providerTypes" :clear="false" :disabled="busy || provider.type === 'ocrspace'" @change="changeType(provider, $event)" /></view>
              <view class="mes-field name-field"><text class="mes-field-label">显示名称</text><input v-model="provider.name" :disabled="busy" maxlength="60" /></view>
              <view class="mes-field key-field">
                <view class="field-heading"><text class="mes-field-label">API Key</text><text class="field-note">始终遮挡</text></view>
                <view class="key-control">
                  <input v-if="provider.keyEditing" :value="provider.apiKey" password :disabled="busy" maxlength="4096" placeholder="请输入此平台的 API Key" @input="changeKey(provider, $event)" />
                  <input v-else :value="provider.keySet ? '********' : ''" disabled placeholder="未配置" class="masked-key" />
                  <button v-if="!provider.keyEditing" size="mini" :disabled="busy" @click="beginKeyEdit(provider)">{{ provider.keySet ? '更换 Key' : '配置 Key' }}</button>
                  <button v-else-if="provider.keySet" size="mini" :disabled="busy" @click="cancelKeyEdit(provider)">取消更换</button>
                </view>
                <view v-if="provider.keyEditing && provider.apiKey" class="field-note key-note">新 Key 待保存；可先获取模型验证连接。</view>
              </view>
            </view>
            <view v-if="provider.type === 'custom'" class="mes-field endpoint"><text class="mes-field-label">Chat Completions 地址</text><input :value="provider.apiUrl" :disabled="busy" maxlength="1000" placeholder="https://服务地址/v1/chat/completions" @input="changeEndpoint(provider, $event)" /></view>
            <view v-else class="endpoint-text">{{ provider.apiUrl }}</view>
            <view v-if="provider.type !== 'ocrspace'" class="provider-models">
              <view class="model-catalog-heading"><view class="catalog-summary"><text class="subsection-title">模型选择</text><text class="field-note">{{ catalogLabel(provider) }}</text></view><button size="mini" :disabled="busy" @click="refreshModels(provider)">{{ refreshing === provider.id ? '获取中…' : '获取模型列表' }}</button></view>
              <view v-if="catalogMessages[provider.id]" class="catalog-message" :class="{ 'catalog-error': catalogSources[provider.id] !== 'api' }" role="status">{{ catalogMessages[provider.id] }}</view>
              <view class="mes-fields model-fields">
                <view class="mes-field"><text class="mes-field-label">图片识别模型</text><uni-data-select v-model="modelChoices[provider.id].model" :localdata="modelsFor(provider.id, true)" :clear="false" :disabled="busy" placeholder="选择支持图片的模型" /></view>
                <view class="mes-field"><text class="mes-field-label">文本识别模型</text><uni-data-select v-model="modelChoices[provider.id].textModel" :localdata="modelsFor(provider.id, false)" :clear="false" :disabled="busy" placeholder="选择文本模型" /></view>
              </view>
              <view v-if="modelChoices[provider.id].manual" class="mes-fields manual-models">
                <view class="mes-field"><text class="mes-field-label">图片模型 ID</text><input v-model="modelChoices[provider.id].model" :disabled="busy" maxlength="180" placeholder="填写供应商实际模型 ID" /></view>
                <view class="mes-field"><text class="mes-field-label">文本模型 ID</text><input v-model="modelChoices[provider.id].textModel" :disabled="busy" maxlength="180" placeholder="填写供应商实际模型 ID" /></view>
              </view>
              <view class="model-selection-footer"><view class="selection-caption"><text>{{ selectedCapability(provider) }}</text><button size="mini" class="text-button" :disabled="busy" @click="modelChoices[provider.id].manual = !modelChoices[provider.id].manual">{{ modelChoices[provider.id].manual ? '收起手动输入' : '手动填写模型 ID' }}</button></view><button size="mini" type="primary" :disabled="busy || !provider.enabled || !editingStepId && form.modelChain.length >= 6" @click="applyModelChoice(provider)">{{ editingStepId ? '应用到第 ' + (editingStepIndex + 1) + ' 项' : '加入识别顺序' }}</button></view>
            </view>
            <view v-else class="ocr-engines">
              <view class="model-catalog-heading"><text class="subsection-title">初筛引擎顺序</text><button size="mini" :disabled="busy || form.screenEngines.length >= 3" @click="addEngine">添加备用引擎</button></view>
              <view v-for="(engine, index) in form.screenEngines" :key="index" class="engine-row"><text class="number">{{ index + 1 }}</text><view class="select-wrap"><uni-data-select :model-value="engine" :localdata="engineOptions" :clear="false" :disabled="busy" @change="changeEngine(index, $event)" /></view><view class="mes-actions"><button size="mini" :disabled="busy || index === 0" @click="move('screenEngines', index, -1)">上移</button><button size="mini" :disabled="busy || index === form.screenEngines.length - 1" @click="move('screenEngines', index, 1)">下移</button><button size="mini" :disabled="busy || form.screenEngines.length === 1" @click="form.screenEngines.splice(index, 1)">移除</button></view></view>
              <view class="field-note">使用预处理图片；前一引擎未确认产品编码时，才尝试下一项。</view>
            </view>
          </view>
        </view>
        <view class="panel">
          <view class="panel-heading"><view class="heading-title"><text class="section-number">02</text><view class="panel-title">识别顺序</view></view><view class="mes-actions"><text class="field-note">{{ enabledSteps }} 项启用 · 单次最多 {{ form.maxModelCalls }} 次请求</text><button size="mini" :disabled="busy || !ready" @click="applyDeepseekFlashChain">配置 DeepSeek 双通</button><button size="mini" :disabled="busy || !ready || testing" @click="testConnections">{{ testing ? '测试中…' : '测试连接' }}</button></view></view>
          <view v-if="testResults.length" class="test-results">
            <view v-for="(item, index) in testResults" :key="index" class="test-row" :class="{ bad: !item.ok }">
              <text class="test-name">{{ item.ok ? '✓' : '✗' }} {{ item.provider || '未知供应商' }} / {{ item.model || '未配置模型' }}</text>
              <text class="test-detail">{{ item.ok ? ('可用 · ' + item.ms + ' ms') : item.error }}</text>
            </view>
          </view>
          <view class="recognition-flow"><view class="flow-start"><text class="flow-caption">先初筛并查库</text><text>OCR.space 提取产品编码</text></view><view class="flow-outcomes"><view><text class="badge badge-ocr">已有产品</text><text>载入最新 BOM</text></view><view><text class="badge badge-ai">新产品 / 主动识别</text><text>按下方顺序使用原图识别</text></view></view></view>
          <view class="mes-description panel-intro">在供应商连接中添加或更换模型。上一项失败后继续下一项，成功即停止。</view>
          <view v-if="!form.modelChain.length" class="empty">尚未添加完整识别模型，请在供应商中选择后加入。</view>
          <view v-for="(step, index) in form.modelChain" :key="step.id" class="model-step" :class="{ paused: !step.enabled, 'editing-step': editingStepId === step.id }">
            <view class="step-body"><text class="number">{{ index + 1 }}</text><view class="step-info"><view class="step-heading"><text class="provider-name">{{ providerName(step.providerId) }}</text><text class="field-note">{{ step.enabled ? '启用' : '已停用' }}</text></view><view class="model-detail"><text class="model-kind">图片</text><text>{{ modelName(step.providerId, step.model) }}</text></view><view class="model-detail"><text class="model-kind">文本</text><text>{{ modelName(step.providerId, step.textModel) }}</text></view><view v-if="modelStatus(step)" class="step-warning">{{ modelStatus(step) }}</view></view></view>
            <view class="mes-actions step-actions"><switch :checked="step.enabled" :disabled="busy" @change="step.enabled = !!$event.detail.value" /><button size="mini" :disabled="busy" @click="editStep(step)">更换模型</button><button size="mini" :disabled="busy || index === 0" @click="move('modelChain', index, -1)">上移</button><button size="mini" :disabled="busy || index === form.modelChain.length - 1" @click="move('modelChain', index, 1)">下移</button><button size="mini" :disabled="busy" @click="removeStep(step.id)">移除</button></view>
          </view>
          <view v-if="enabledSteps > Number(form.maxModelCalls)" class="budget-note">启用了 {{ enabledSteps }} 个模型步骤，单次最多请求 {{ form.maxModelCalls }} 次。备用步骤仅在剩余额度内执行。</view>
        </view>
        <view class="panel">
          <view class="panel-heading"><view class="heading-title"><text class="section-number">03</text><view class="panel-title">Prompt 模板</view></view><button size="mini" :disabled="busy" @click="form[promptTab] = promptDefaults[promptTab]">恢复当前默认模板</button></view>
          <view class="mes-description">内容识别使用包装指令单模板，BOM 与订单补充规则分别追加到主模板。</view>
          <view class="prompt-tabs"><button v-for="tab in promptTabs" :key="tab.key" size="mini" :class="{ selected: promptTab === tab.key }" :disabled="busy" @click="promptTab = tab.key">{{ tab.label }}</button></view>
          <textarea v-model="form[promptTab]" class="prompt-editor" :disabled="busy" :maxlength="20000" placeholder="请输入识别提示词" />
          <view class="prompt-footer"><text>保留 raw_text / structured_info 格式，无法识别的字段填 null。</text><text>{{ (form[promptTab] || '').length }} / 20000</text></view>
          <view class="mes-description">产品 BOM 录入产品编码、产品名称、包装规格和材料清单。修改模板后，旧模板的模型结果不会直接复用。</view>
        </view>
        <view class="mes-footer"><button type="primary" :disabled="busy" @click="save">{{ saving ? '保存中…' : '保存配置' }}</button><text class="mes-description">供应商、识别顺序和模板统一保存。</text></view>
      </view>
      <view class="ocr-aside">
        <view class="panel summary-panel"><view class="panel-title">当前配置</view><view class="summary-metrics"><view><text class="metric-value">{{ enabledSteps }}</text><text>启用模型步骤</text></view><view><text class="metric-value">{{ form.maxModelCalls }}</text><text>单次请求上限</text></view></view><view class="protection-item"><text class="protection-mark">✓</text><text>已有产品跳过 AI</text></view><view class="protection-item"><text class="protection-mark">✓</text><text>图片哈希校验，按需上传</text></view><view class="protection-item"><text class="protection-mark">✓</text><text>OCR 用预处理图，AI 用原图</text></view></view>
        <view class="panel"><view class="panel-title">费用与保护</view><view v-for="field in limits" :key="field.key" class="mes-field limit-field"><text class="mes-field-label">{{ field.label }}</text><input v-model="form[field.key]" type="number" :placeholder="field.placeholder" :disabled="busy" /></view><view class="mes-description">单次模型请求上限 1～6，包含失败与重试；每个模型默认尝试 2 次（可设 1～3）。结果复用分钟独立配置，默认 10080。每日上限为 0 表示不限额；OCR.space 使用自身额度。</view></view>
        <view class="panel"><view class="panel-title">今日用量</view><view class="summary-metrics usage-metrics"><view><text class="metric-value">{{ usage.globalUsed }}</text><text>模型调用</text></view><view><text class="metric-value">{{ usage.globalLimit || '不限' }}</text><text>全局上限</text></view><view><text class="metric-value">{{ usage.ownKeyUsers }}</text><text>自带 Key 用户</text></view></view><view class="mes-description">模型调用含重试、不含缓存命中；自带 Key 用户使用自己的额度，不占内置限额。</view></view>
      </view>
    </view>
    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->
  </view>
</template>
<script>
import { callMes, requireMesAdmin } from '@/utils/mes-api.js';
const KEY_PLACEHOLDER = /^[*＊•●]+$/;
export default {
  data() {
    return {
      ready: false, authorized: false, loading: false, saving: false, refreshing: '', error: '', updatedAt: 0,
      usage: { date: '', globalUsed: 0, globalLimit: 0, ownKeyUsers: 0 },
      testing: false, testResults: [],
      providerCatalog: {}, promptDefaults: {}, catalogs: {}, catalogMessages: {}, catalogSources: {}, modelChoices: {}, editingStepId: '', promptTab: 'contentPrompt',
      form: { providers: [], modelChain: [], screenEngines: [2], maxModelCalls: 2, contentPrompt: '', bomPrompt: '', orderPrompt: '', maxAttempts: 2, dedupMinutes: 10080, timeout: 35000, dailyLimit: 200, userDailyLimit: 100 },
      engineOptions: [{ value: 2, text: '引擎 2 · 通用识别' }, { value: 3, text: '引擎 3 · 表格 / 手写' }, { value: 1, text: '引擎 1 · 旧版兼容' }],
      promptTabs: [{ key: 'contentPrompt', label: '内容识别' }, { key: 'bomPrompt', label: 'BOM 补充规则' }, { key: 'orderPrompt', label: '订单补充规则' }],
      limits: [{ key: 'maxModelCalls', label: '单次最多模型请求', placeholder: '1～6' }, { key: 'timeout', label: '单次超时（毫秒）', placeholder: '5000～60000' }, { key: 'maxAttempts', label: '每个模型最多尝试', placeholder: '1～3，含首次' }, { key: 'dailyLimit', label: '模型全局每日上限', placeholder: '0=不限' }, { key: 'userDailyLimit', label: '模型每人每日上限', placeholder: '0=不限' }, { key: 'dedupMinutes', label: '结果复用（分钟）', placeholder: '10080（7 天）' }]
    };
  },
  computed: {
    busy() { return this.loading || this.saving || !!this.refreshing; },
    providerTypes() { return Object.entries(this.providerCatalog).filter(([type]) => type !== 'ocrspace').map(([value, provider]) => ({ value, text: provider.label })); },
    enabledSteps() { return this.form.modelChain.filter(step => step.enabled && this.form.providers.some(provider => provider.id === step.providerId && provider.enabled)).length; },
    editingStepIndex() { return this.form.modelChain.findIndex(step => step.id === this.editingStepId); }
  },
  async onLoad() {
    try { await requireMesAdmin(); this.authorized = true; await this.load(); }
    catch (error) { this.error = error.message; }
  },
  methods: {
    newId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); },
    providerName(id) { return (this.form.providers.find(provider => provider.id === id) || {}).name || '请选择供应商'; },
    modelName(providerId, id) { return ((this.catalogs[providerId] || []).find(model => model.id === id) || {}).name || id; },
    keyStatus(provider) {
      if (provider.keyEditing && provider.apiKey) return '新 Key 待保存';
      if (provider.keyEditing && provider.keySet) return '正在更换 Key';
      return provider.keySet ? 'Key 已保存' : '未配置 Key';
    },
    catalogLabel(provider) {
      const count = (this.catalogs[provider.id] || []).length;
      return this.catalogSources[provider.id] === 'api' ? '账号模型 · ' + count + ' 个' : count ? '预置模型 · ' + count + ' 个' : '尚未获取模型';
    },
    modelsFor(providerId, vision) {
      const models = this.catalogs[providerId] || [];
      const options = models.filter(model => !vision || model.vision !== false).map(model => ({ value: model.id, text: model.name + (vision && model.vision == null ? '（图片能力待确认）' : '') }));
      const choice = this.modelChoices[providerId] || {}, current = vision ? choice.model : choice.textModel;
      if (current && !options.some(model => model.value === current)) options.unshift({ value: current, text: current + '（已配置 ID）' });
      return options;
    },
    selectedCapability(provider) {
      const selected = (this.catalogs[provider.id] || []).find(model => model.id === (this.modelChoices[provider.id] || {}).model);
      if (!selected) return '可手动填写模型 ID，请确认图片识别能力。';
      if (selected.vision === false) return '当前图片模型仅支持文本，请更换图片模型。';
      return selected.vision === true ? '图片模型支持原图识别；文本模型用于 OCR 文本导入。' : '供应商未声明图片能力，请确认所选模型支持图片。';
    },
    modelStatus(step) {
      const provider = this.form.providers.find(item => item.id === step.providerId);
      if (!provider || !provider.enabled) return '供应商已停用，此步骤会跳过。';
      if (!provider.apiKey && !provider.keySet) return '尚未配置供应商 Key，此步骤会跳过。';
      return '';
    },
    /** 只提交新输入的密钥；固定星号仅用于显示，永远不作为密钥发送。 */
    providerPayload(provider) {
      const { id, type, name, apiUrl, enabled } = provider, payload = { id, type, name, apiUrl, enabled };
      if (provider.keyEditing) {
        const apiKey = String(provider.apiKey || '').trim();
        if (KEY_PLACEHOLDER.test(apiKey)) throw new Error(name + '：星号不是有效的 API Key，请重新输入。');
        if (!apiKey && provider.keySet) throw new Error(name + '：请填写新 Key，或取消更换。');
        if (apiKey) payload.apiKey = apiKey;
      }
      return payload;
    },
    resetCatalog(provider) {
      this.catalogs = { ...this.catalogs, [provider.id]: (this.providerCatalog[provider.type] || {}).models || [] };
      this.catalogSources = { ...this.catalogSources, [provider.id]: 'builtin' };
      this.catalogMessages = { ...this.catalogMessages, [provider.id]: '' };
    },
    beginKeyEdit(provider) { provider.apiKey = ''; provider.keyEditing = true; },
    cancelKeyEdit(provider) { provider.apiKey = ''; provider.keyEditing = false; this.resetCatalog(provider); },
    changeKey(provider, event) { provider.apiKey = event.detail.value; this.resetCatalog(provider); },
    changeEndpoint(provider, event) {
      if (provider.apiUrl === event.detail.value) return;
      provider.apiUrl = event.detail.value; provider.apiKey = '';
      provider.keySet = provider.savedType === provider.type && provider.savedApiUrl === provider.apiUrl && provider.savedKeySet;
      provider.keyEditing = !provider.keySet; this.resetCatalog(provider);
    },
    changeEngine(index, value) {
      const previous = this.form.screenEngines[index], duplicate = this.form.screenEngines.findIndex((engine, position) => engine === value && position !== index);
      if (duplicate >= 0) this.form.screenEngines.splice(duplicate, 1, previous);
      this.form.screenEngines.splice(index, 1, value); this.error = '';
    },
    move(key, index, direction) {
      const other = index + direction;
      if (other < 0 || other >= this.form[key].length) return;
      const copy = this.form[key].slice(); [copy[index], copy[other]] = [copy[other], copy[index]]; this.form[key] = copy;
    },
    addEngine() { const value = [3, 2, 1].find(engine => !this.form.screenEngines.includes(engine)); if (value) this.form.screenEngines.push(value); },
    createModelChoice(provider, step) {
      const models = this.catalogs[provider.id] || [], image = models.find(model => model.vision !== false);
      return { model: step ? step.model : image ? image.id : '', textModel: step ? step.textModel : image ? image.id : models[0] ? models[0].id : '', manual: false };
    },
    applyModelChoice(provider) {
      this.error = '';
      try {
        const payload = this.providerPayload(provider);
        if (!payload.apiKey && !provider.keySet) throw new Error('请先为 ' + provider.name + ' 配置 API Key。');
        const choice = this.modelChoices[provider.id], model = String(choice.model || '').trim(), textModel = String(choice.textModel || '').trim();
        if (!model || !textModel || model.length > 180 || textModel.length > 180) throw new Error('请选择图片模型和文本模型，或填写有效模型 ID。');
        const selected = (this.catalogs[provider.id] || []).find(item => item.id === model);
        if (selected && selected.vision === false) throw new Error('所选图片模型仅支持文本，请选择支持图片的模型。');
        const duplicate = this.form.modelChain.findIndex(step => step.id !== this.editingStepId && step.providerId === provider.id && step.model === model && step.textModel === textModel);
        if (duplicate >= 0) throw new Error('这组模型已在识别顺序第 ' + (duplicate + 1) + ' 项，无需重复添加。');
        if (this.editingStepId) {
          const step = this.form.modelChain.find(item => item.id === this.editingStepId);
          if (!step) throw new Error('当前步骤已移除，请重新选择。');
          Object.assign(step, { providerId: provider.id, model, textModel }); this.editingStepId = '';
        } else {
          if (this.form.modelChain.length >= 6) throw new Error('识别顺序最多配置 6 项。');
          this.form.modelChain.push({ id: this.newId('model'), providerId: provider.id, model, textModel, enabled: true });
        }
        uni.showToast({ title: '已更新识别顺序，保存后生效', icon: 'none' });
      } catch (error) { this.error = error.message; uni.showToast({ title: error.message, icon: 'none' }); }
    },
    editStep(step) {
      const provider = this.form.providers.find(item => item.id === step.providerId); if (!provider) return;
      this.editingStepId = step.id; this.modelChoices = { ...this.modelChoices, [provider.id]: this.createModelChoice(provider, step) };
      uni.pageScrollTo({ selector: '#supplier-' + provider.id, duration: 200 });
    },
    removeStep(id) { this.form.modelChain = this.form.modelChain.filter(step => step.id !== id); if (this.editingStepId === id) this.editingStepId = ''; },
    addProvider() {
      if (this.form.providers.length >= 8) return;
      const provider = { id: this.newId('provider'), type: 'custom', name: '新供应商', apiUrl: '', apiKey: '', keySet: false, keyEditing: true, savedType: '', savedApiUrl: '', savedKeySet: false, enabled: true };
      this.resetCatalog(provider); this.modelChoices = { ...this.modelChoices, [provider.id]: this.createModelChoice(provider) }; this.form.providers.push(provider);
    },
    changeType(provider, type) {
      if (provider.type === type || !this.providerCatalog[type]) return;
      provider.type = type; provider.name = this.providerCatalog[type].label; provider.apiUrl = this.providerCatalog[type].apiUrl; provider.apiKey = '';
      provider.keySet = provider.savedType === type && provider.savedApiUrl === provider.apiUrl && provider.savedKeySet; provider.keyEditing = !provider.keySet;
      this.resetCatalog(provider); const choice = this.createModelChoice(provider); this.modelChoices = { ...this.modelChoices, [provider.id]: choice };
      this.form.modelChain.filter(step => step.providerId === provider.id).forEach(step => { step.model = choice.model; step.textModel = choice.textModel; });
    },
    removeProvider(id) {
      this.form.providers = this.form.providers.filter(provider => provider.id !== id);
      this.form.modelChain.filter(step => step.providerId === id).forEach(step => this.removeStep(step.id));
      delete this.modelChoices[id]; delete this.catalogs[id]; delete this.catalogMessages[id]; delete this.catalogSources[id];
    },
    /** 更换中的空密钥不回退到旧密钥，获取结果只显示在对应供应商内。 */
    async refreshModels(provider) {
      if (this.busy) return; this.error = ''; let payload;
      try {
        payload = this.providerPayload(provider);
        if (!payload.apiKey && !provider.keySet) throw new Error('请先填写 ' + provider.name + ' 的 API Key。');
      } catch (error) {
        this.catalogMessages = { ...this.catalogMessages, [provider.id]: error.message };
        this.catalogSources = { ...this.catalogSources, [provider.id]: 'error' };
        return;
      }
      this.refreshing = provider.id;
      try {
        const result = await callMes('doc-ocr', 'getModels', { forceRefresh: true, provider: payload });
        this.catalogs = { ...this.catalogs, [provider.id]: result.models || [] }; this.catalogSources = { ...this.catalogSources, [provider.id]: result.source };
        this.catalogMessages = { ...this.catalogMessages, [provider.id]: result.message || ('已读取 ' + (result.models || []).length + ' 个模型') };
        const choice = this.modelChoices[provider.id]; if (!choice.model && !choice.textModel) this.modelChoices = { ...this.modelChoices, [provider.id]: this.createModelChoice(provider) };
      } catch (error) {
        this.resetCatalog(provider);
        this.catalogMessages = { ...this.catalogMessages, [provider.id]: error.message };
        this.catalogSources = { ...this.catalogSources, [provider.id]: 'error' };
      }
      finally { this.refreshing = ''; }
    },
    async load({ keepCatalogs = false } = {}) {
      if (this.loading || this.refreshing) return false; this.loading = true; this.error = '';
      try {
        const result = await callMes('doc-ocr', 'getConfig');
        if (!result.config || !Array.isArray(result.config.providers)) throw new Error('请先上传本次更新的 doc-ocr 与 ocr-config 公共模块');
        const previous = this.form.providers; this.providerCatalog = result.providerCatalog; this.promptDefaults = result.promptDefaults; this.updatedAt = result.updatedAt || 0;
        this.usage = Object.assign({}, this.usage, result.usage || {});
        const providers = result.config.providers.map(({ id, type, name, apiUrl, enabled, keySet }) => ({ id, type, name, apiUrl, enabled, keySet: !!keySet, apiKey: '', keyEditing: !keySet, savedType: type, savedApiUrl: apiUrl, savedKeySet: !!keySet }));
        const catalogs = {}, messages = {}, sources = {};
        for (const provider of providers) {
          const same = keepCatalogs && previous.some(item => item.id === provider.id && item.type === provider.type && item.apiUrl === provider.apiUrl);
          catalogs[provider.id] = same && this.catalogs[provider.id] || (this.providerCatalog[provider.type] || {}).models || [];
          messages[provider.id] = same && this.catalogMessages[provider.id] || ''; sources[provider.id] = same && this.catalogSources[provider.id] || 'builtin';
        }
        this.catalogs = catalogs; this.catalogMessages = messages; this.catalogSources = sources;
        this.form = { ...this.form, ...result.config, providers, modelChain: result.config.modelChain.map(step => ({ ...step })), screenEngines: result.config.screenEngines.slice() };
        const choices = {}; for (const provider of providers) choices[provider.id] = this.createModelChoice(provider, this.form.modelChain.find(step => step.providerId === provider.id));
        this.modelChoices = choices; this.editingStepId = ''; this.ready = true; return true;
      } catch (error) { this.error = error.message; return false; }
      finally { this.loading = false; }
    },
    /** 对每个启用步骤发一次极小的文本请求，验证 Key / 模型名 / 地址 / 网络。 */
    async testConnections() {
      if (this.busy || this.testing || !this.ready) return;
      this.testing = true; this.error = ''; this.testResults = [];
      try {
        const result = await callMes('doc-ocr', 'testModel');
        this.testResults = Array.isArray(result.results) ? result.results : [];
        if (!this.testResults.length) this.error = '没有启用的模型步骤，请先在识别顺序中添加';
      } catch (error) { this.error = error.message; }
      finally { this.testing = false; }
    },
    /** 一键把识别顺序设为 DeepSeek 官方 Flash → 硅基流动 DeepSeek Flash 双通道。 */
    applyDeepseekFlashChain() {
      if (this.busy || !this.ready) return;
      const FLASH_MODEL = { deepseek: 'deepseek-flash', siliconflow: 'deepseek-ai/DeepSeek-V4.1-Flash' };
      const steps = [];
      for (const type of ['deepseek', 'siliconflow']) {
        const provider = this.form.providers.find(item => item.type === type && item.enabled !== false);
        if (!provider) continue;
        const model = FLASH_MODEL[type];
        steps.push({ id: this.newId('step'), providerId: provider.id, model, textModel: model, enabled: true });
      }
      if (steps.length < 2) {
        uni.showToast({ title: '请先在供应商连接中启用 DeepSeek 与硅基流动', icon: 'none' });
        return;
      }
      this.form.modelChain = steps;
      this.form.maxModelCalls = Math.max(Number(this.form.maxModelCalls) || 1, 2);
      uni.showToast({ title: '已配置双通顺序，保存后生效', icon: 'none' });
    },
    async save() {
      if (this.busy || !this.ready) return; this.error = ''; this.saving = true;
      try {
        const config = { ...this.form, providers: this.form.providers.map(provider => this.providerPayload(provider)) };
        for (const field of this.limits) {
          if (config[field.key] === '' || !Number.isFinite(Number(config[field.key])) || Number(config[field.key]) < 0) throw new Error(field.label + '须为非负数');
          config[field.key] = Number(config[field.key]);
        }
        await callMes('doc-ocr', 'setConfig', { config, expectedUpdatedAt: this.updatedAt });
        for (const provider of this.form.providers) { if (provider.apiKey) provider.keySet = true; provider.apiKey = ''; provider.keyEditing = !provider.keySet; }
        const loaded = await this.load({ keepCatalogs: true }); if (!loaded) this.ready = false;
        uni.showToast({ title: loaded ? '配置已保存' : '已保存，请重新加载配置', icon: 'none' });
      } catch (error) { this.error = error.message; }
      finally { this.saving = false; }
    }
  }
};
</script>
<style lang="scss" scoped>
@import '@/common/mes.scss';
.ocr-page { background: $uni-bg-color-grey; min-height: 100vh; }
.ocr-layout { display: flex; flex-wrap: wrap; gap: 1.2rem; align-items: flex-start; }
.ocr-main { flex: 1 1 44rem; min-width: 0; } .ocr-aside { flex: 1 1 16rem; min-width: 0; max-width: 20rem; }
.panel { background: $uni-bg-color; border: 1px solid $uni-table-border-color; border-radius: .65rem; padding: 1.3rem; margin-bottom: 1.2rem; }
.panel-heading, .provider-heading, .model-catalog-heading, .model-selection-footer { display: flex; justify-content: space-between; gap: .8rem; align-items: center; flex-wrap: wrap; }
.panel-heading button, .model-catalog-heading button, .model-selection-footer button, .key-control button, .edit-notice button { margin: 0; }
.heading-title, .provider-identity, .catalog-summary, .step-heading { display: flex; align-items: center; flex-wrap: wrap; gap: .65rem; }
.panel-title { font-size: 1.05rem; font-weight: 650; color: $uni-text-color; } .section-number { color: $uni-color-primary; font-size: .78rem; font-weight: 650; }
.panel-intro { margin-bottom: 1rem; } .field-note, .control-label, .connection-status { font-size: .75rem; color: $uni-text-color-grey; line-height: 1.5; }
.provider-card { border: 1px solid $uni-table-border-color; border-radius: .45rem; padding: 1.1rem; margin-top: 1rem; } .provider-heading { margin-bottom: 1rem; }
.provider-name { font-weight: 600; font-size: .95rem; color: $uni-text-color; } .badge { display: inline-flex; align-items: center; border-radius: .25rem; padding: .18rem .45rem; font-size: .7rem; white-space: nowrap; }
.badge-ocr { background: rgba($uni-color-success, .08); color: $uni-color-success; } .badge-ai { background: rgba($uni-color-primary, .08); color: $uni-color-primary; } .configured { color: $uni-color-success; }
.connection-fields, .model-fields, .manual-models { gap: .8rem; margin-bottom: .8rem; } .connection-fields .service-field, .connection-fields .name-field { flex: 1 1 10rem; } .connection-fields .key-field { flex: 2 1 20rem; }
.field-heading { display: flex; justify-content: space-between; gap: .5rem; } .key-control { display: flex; align-items: center; gap: .6rem; } .key-control input { flex: 1; min-width: 0; } .key-control button { flex-shrink: 0; }
.masked-key { letter-spacing: .22rem; color: $uni-text-color; } .key-note { margin-top: .4rem; } .endpoint { margin-bottom: .8rem; } .endpoint-text { font-family: monospace; font-size: .75rem; color: $uni-text-color-grey; word-break: break-all; margin-bottom: .8rem; }
.provider-models, .ocr-engines { border-top: 1px solid $uni-table-border-color; padding-top: .9rem; } .model-catalog-heading { margin-bottom: .9rem; } .subsection-title { font-size: .85rem; font-weight: 600; color: $uni-text-color; }
.catalog-message { font-size: .78rem; color: $uni-color-success; line-height: 1.6; background: rgba($uni-color-success, .06); padding: .55rem .7rem; border-radius: .3rem; margin-bottom: .8rem; } .catalog-error { color: $uni-color-warning; background: rgba($uni-color-warning, .07); }
.model-fields .mes-field, .manual-models .mes-field { flex: 1 1 15rem; } .selection-caption { display: flex; flex: 1 1 18rem; align-items: center; flex-wrap: wrap; gap: .4rem .7rem; color: $uni-text-color-grey; font-size: .75rem; line-height: 1.6; }
.text-button { background: transparent; color: $uni-color-primary; font-size: .75rem; padding: 0; line-height: 1.8; } .text-button::after { border: 0; }
.engine-row { display: flex; gap: .7rem; align-items: center; flex-wrap: wrap; margin-bottom: .7rem; } .select-wrap { flex: 1 1 12rem; min-width: 0; }
.number { display: inline-flex; align-items: center; justify-content: center; min-width: 1.7rem; min-height: 1.7rem; border-radius: .35rem; font-size: .8rem; background: rgba($uni-color-primary, .08); color: $uni-color-primary; flex-shrink: 0; }
.recognition-flow { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; background: $uni-bg-color-grey; padding: .9rem 1rem; border-radius: .4rem; margin: 1rem 0; font-size: .8rem; } .flow-start { display: flex; flex-direction: column; gap: .4rem; flex: 1 1 12rem; } .flow-caption { font-size: .72rem; color: $uni-text-color-grey; }
.flow-outcomes { flex: 2 1 24rem; display: flex; gap: .7rem; flex-wrap: wrap; } .flow-outcomes > view { display: flex; flex: 1 1 11rem; align-items: center; gap: .6rem; flex-wrap: wrap; }
.model-step { border: 1px solid $uni-table-border-color; border-left: .2rem solid $uni-color-primary; border-radius: .4rem; padding: 1rem; margin-bottom: .8rem; display: flex; gap: .8rem 1rem; justify-content: space-between; align-items: center; flex-wrap: wrap; } .paused { border-left-color: $uni-border-color; } .editing-step { background: rgba($uni-color-primary, .04); }
.step-body { display: flex; align-items: flex-start; gap: .7rem; flex: 1 1 23rem; min-width: 0; } .step-info { flex: 1; min-width: 0; } .step-heading { margin-bottom: .5rem; } .model-detail { display: flex; gap: .5rem; font-size: .8rem; line-height: 1.6; color: $uni-text-color; word-break: break-word; } .model-kind { color: $uni-text-color-grey; flex-shrink: 0; }
.step-warning { color: $uni-color-warning; font-size: .75rem; margin-top: .4rem; } .step-actions { gap: .4rem; }
.edit-notice, .budget-note { padding: .75rem .9rem; background: rgba($uni-color-warning, .07); color: $uni-color-warning; border-radius: .3rem; font-size: .8rem; line-height: 1.6; } .edit-notice { display: flex; align-items: center; justify-content: space-between; gap: .5rem; flex-wrap: wrap; }
.empty { background: $uni-bg-color-grey; padding: 1rem; color: $uni-text-color-grey; font-size: .85rem; }
.prompt-tabs { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0 .8rem; } .prompt-tabs button { margin: 0; } .prompt-tabs .selected { background: $uni-color-primary; color: $uni-text-color-inverse; }
.prompt-editor { width: 100%; height: 24rem; box-sizing: border-box; padding: .9rem; border: 1px solid $uni-table-border-color; border-radius: .4rem; background: $uni-bg-color-grey; font-family: monospace; font-size: .82rem; line-height: 1.65; } .prompt-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: .5rem; font-size: .75rem; color: $uni-text-color-grey; margin-top: .6rem; }
.switch-row { display: flex; justify-content: space-between; gap: .8rem; align-items: center; margin: 1rem 0; font-size: .85rem; } .limit-field { margin-top: 1rem; }
.test-results { margin: .8rem 0 1rem; border: 1px solid $uni-table-border-color; border-radius: .6rem; overflow: hidden; } .test-row { display: flex; justify-content: space-between; gap: 1rem; padding: .55rem .8rem; font-size: .82rem; border-bottom: 1px solid $uni-table-border-color; } .test-row:last-child { border-bottom: none; } .test-row .test-name { color: #1f7a4d; font-weight: 600; } .test-row.bad .test-name { color: #c0392b; } .test-row .test-detail { color: #6b7671; word-break: break-all; text-align: right; }
.summary-metrics { display: flex; gap: 1rem; margin: 1.1rem 0; padding-bottom: 1rem; border-bottom: 1px solid $uni-table-border-color; } .summary-metrics > view { display: flex; flex: 1; flex-direction: column; gap: .3rem; font-size: .73rem; color: $uni-text-color-grey; } .metric-value { font-size: 1.7rem; line-height: 1.2; color: $uni-color-primary; font-weight: 650; }
.protection-item { display: flex; align-items: center; gap: .5rem; font-size: .78rem; line-height: 1.6; margin-top: .6rem; color: $uni-text-color; } .protection-mark { color: $uni-color-success; } .error-banner { padding: .8rem 1rem; background: rgba($uni-color-error, .06); border-radius: .4rem; }
@media (max-width: 1100px) { .ocr-aside { max-width: 100%; flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 1rem; } .ocr-aside .panel { flex: 1 1 17rem; min-width: 0; } }
@media (max-width: 600px) { .panel { padding: 1rem; } .provider-card { padding: .9rem; } .connection-fields .mes-field, .model-fields .mes-field, .manual-models .mes-field { flex-basis: 100%; } .step-actions { margin-left: 2.4rem; } .model-selection-footer > button { width: 100%; } .prompt-editor { height: 22rem; } }
</style>
