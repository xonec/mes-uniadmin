<template>
  <view class="employee-import">
    <view class="employee-import-heading"><view><text class="employee-import-title">员工账号批量创建</text><view class="employee-import-note">工号必填；登录账号可选（留空默认取工号，唯一）。身份证在后台完整显示，用户端不提供身份证查询。</view></view><button size="mini" :disabled="busy" @click="choose">选择人员 Excel</button></view>
    <view v-if="fileName" class="employee-import-note">{{ fileName }} · {{ rows.length }} 人 · 待创建 {{ readyCount }} · 已有 / 已创建 {{ completedCount }} · 需处理 {{ issueCount }}</view>
    <view v-if="error" class="employee-import-error">{{ error }}</view>
    <view v-if="progress" class="employee-import-note" role="status">{{ progress }}</view>
    <template v-if="rows.length">
      <view class="employee-import-actions"><button size="mini" :disabled="busy" @click="preview">重新核对云端账号</button><button size="mini" type="primary" :disabled="busy || !readyCount || hasUncheckedRows" @click="create">{{ busy ? '处理中…' : '创建 ' + readyCount + ' 个账号' }}</button></view>
      <view class="employee-import-table"><uni-table border emptyText="暂无人员"><uni-tr><uni-th>工号</uni-th><uni-th>登录账号</uni-th><uni-th>姓名</uni-th><uni-th>身份证</uni-th><uni-th>来源</uni-th><uni-th>状态</uni-th></uni-tr><uni-tr v-for="row in rows" :key="row.sourceSheet + ':' + row.line"><uni-td>{{ row.employeeNo }}</uni-td><uni-td>{{ row.account || '默认 = 工号' }}</uni-td><uni-td>{{ row.name }}</uni-td><uni-td>{{ row.idCard }}</uni-td><uni-td>{{ row.sourceSheet }} · 第 {{ row.line }} 行</uni-td><uni-td><text :class="{ 'employee-import-error': ['invalid', 'conflict', 'error'].includes(row.state) }">{{ row.message || '待核对' }}</text></uni-td></uni-tr></uni-table></view>
    </template>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { request } from '@/js_sdk/uni-admin/request.js';
import { readEmployeeAccounts } from '@/utils/employee-account-import.js';
const emit = defineEmits(['created']);
const rows = ref([]), fileName = ref(''), busy = ref(false), error = ref(''), progress = ref('');
const readyCount = computed(() => rows.value.filter(row => row.state === 'ready').length);
const completedCount = computed(() => rows.value.filter(row => ['created', 'existing'].includes(row.state)).length);
const issueCount = computed(() => rows.value.filter(row => ['invalid', 'conflict', 'error'].includes(row.state)).length);
const hasUncheckedRows = computed(() => rows.value.some(row => !['ready', 'existing', 'created', 'invalid', 'conflict'].includes(row.state)));
/** 登录账号：留空则不带 account，由服务端按契约默认取工号。 */
const payload = row => ({ employeeNo: row.employeeNo, name: row.name, idCard: row.idCard, ...(row.account ? { account: row.account } : {}) });
const errorMessage = cause => cause && (cause.errMsg || cause.message) || '请求失败，请重新核对云端结果';

/** 选择本地文件，仅三项建号资料参与后续接口请求。 */
async function choose() {
  if (busy.value) return;
  error.value = '';
  try {
    const selected = await new Promise((resolve, reject) => uni.chooseFile({ count: 1, extension: ['xlsx', 'xls', 'csv'], success: resolve, fail: reject }));
    const file = selected.tempFiles[0];
    busy.value = true;
    rows.value = []; fileName.value = ''; progress.value = '';
    rows.value = await readEmployeeAccounts(file);
    fileName.value = file.name || '人员表';
  } catch (cause) { if (!/cancel/i.test(String(cause && cause.errMsg || ''))) error.value = errorMessage(cause); return; }
  finally { busy.value = false; }
  await preview();
}

/** 云端预检不写入资料；任一请求失败则停止，保留结果供重试。 */
async function preview() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  rows.value.forEach(row => { if (row.state !== 'invalid') { row.state = 'pending'; row.message = '待核对'; } });
  try {
    for (const [index, row] of rows.value.entries()) {
      if (row.state === 'invalid') continue;
      progress.value = '正在核对 ' + (index + 1) + ' / ' + rows.value.length;
      const result = await request('previewEmployeeAccount', payload(row));
      if (!result || !['ready', 'existing', 'conflict'].includes(result.state)) throw new Error('云端预检结果不完整，请重新核对');
      row.state = result.state; row.message = result.message;
    }
    progress.value = '云端核对完成；已有账号不修改密码，资料冲突需人工处理。';
  } catch (cause) { error.value = errorMessage(cause); progress.value = '核对中断，请重试；未核对记录不能创建。'; }
  finally { busy.value = false; }
}

/** 按行建号并展示服务端结果，中断后重新核对即可安全重试。 */
async function create() {
  if (busy.value || !readyCount.value || hasUncheckedRows.value) return;
  busy.value = true; error.value = '';
  const selected = rows.value.filter(row => row.state === 'ready');
  let changed = false;
  try {
    for (const [index, row] of selected.entries()) {
      progress.value = '正在创建 ' + (index + 1) + ' / ' + selected.length;
      try {
        const result = await request('createEmployeeAccount', payload(row));
        if (!result || !['created', 'existing', 'conflict'].includes(result.state)) throw new Error('云端建号结果不完整，请重新核对');
        row.state = result.state; row.message = result.message;
        changed = changed || result.state === 'created' || result.state === 'existing';
      } catch (cause) { row.state = 'error'; row.message = '结果未确认，请重新核对云端账号'; throw cause; }
    }
    progress.value = '批量创建结束，结果见下表。';
  } catch (cause) { error.value = errorMessage(cause); progress.value = '已停止后续创建，请先重新核对云端账号。'; }
  finally { busy.value = false; if (changed) emit('created'); }
}
</script>

<style lang="scss" scoped>
.employee-import { margin-bottom: 1rem; padding: 1rem; border: 1px solid $uni-border-color; background: $uni-bg-color; border-radius: .5rem; }
.employee-import-heading { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
.employee-import-title { font-size: 1rem; font-weight: 600; }
.employee-import-note { margin-top: .5rem; color: $uni-text-color-grey; line-height: 1.6; }
.employee-import-error { color: $uni-color-error; line-height: 1.6; }
.employee-import-actions { display: flex; flex-wrap: wrap; gap: .75rem; margin: .75rem 0; }
.employee-import-actions button, .employee-import-heading button { margin: 0; }
.employee-import-table { max-height: 32rem; overflow: auto; }
</style>
