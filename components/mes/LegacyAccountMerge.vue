<template>
  <view class="account-merge">
    <view class="heading"><view><text class="title">旧账号合并到工号账号</text><view class="note">仅处理已核对的6组。保留新账号密码和身份证；迁移数据归属，保留原操作人与备份，核对后删除旧账号。</view></view><button size="mini" :disabled="busy" @click="preview">预览合并数据</button></view>
    <view v-if="error" class="error">{{ error }}</view>
    <view v-if="progress" class="note" role="status">{{ progress }}</view>
    <template v-if="loaded">
      <uni-table border><uni-tr><uni-th>原账号</uni-th><uni-th>姓名</uni-th><uni-th>新工号账号</uni-th><uni-th>关联数据</uni-th><uni-th>结果</uni-th></uni-tr><uni-tr v-for="row in rows" :key="row.sourceUsername"><uni-td>{{ row.sourceUsername }}</uni-td><uni-td>{{ row.name }}</uni-td><uni-td>{{ row.employeeNo }}</uni-td><uni-td><view v-for="(count, name) in row.counts" :key="name">{{ collectionNames[name] || name }}：{{ count }}</view><text v-if="!row.total">无待迁移的业务归属</text><view v-if="row.profileFields && row.profileFields.length">账号资料：{{ row.profileFields.join('、') }}</view></uni-td><uni-td><text :class="{ error: row.state === 'conflict' }">{{ statusText(row) }}</text></uni-td></uni-tr></uni-table>
      <view class="actions"><text class="note">超级管理员、xuchangshun 和 ceshipd 不在本次操作范围。</text><button size="mini" type="warn" :disabled="busy || !canMerge" @click="merge">迁移并删除这6个旧账号</button></view>
    </template>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { request } from '@/js_sdk/uni-admin/request.js';
const emit = defineEmits(['changed']);
const pairs = [
  ['fanhaiping', '122377', '范海萍'], ['yujiayuan', '124720', '于家园'],
  ['luyeqin', '123898', '陆业钦'], ['zhuzhao', '121361', '朱钊'],
  ['dinglei', '127557', '丁磊'], ['jiangxiaohui', '122777', '蒋小辉']
];
const rows = ref([]), loaded = ref(false), busy = ref(false), error = ref(''), progress = ref('');
const collectionNames = { production_records: '生产记录', production_orders: '生产订单', production_drafts: '生产草稿', mes_ops_personnel: '人员档案', mes_ops_bindings: '人员绑定', mes_ops_claims: '人员认领', mes_ops_handovers: '交接班', mes_ops_attendance: '考勤记录', mes_ops_jobs: '生产工单', mes_ops_schedules: '排班', mes_ops_exceptions: '生产异常', source_documents: '原始单据', source_image_assets: '单据图片', ocr_quota: 'OCR使用计数' };
const canMerge = computed(() => loaded.value && rows.value.length === pairs.length && rows.value.every(row => ['ready', 'prepared', 'migrating', 'readyToDelete', 'complete'].includes(row.state)) && rows.value.some(row => row.state !== 'complete'));
const payload = row => ({ sourceUsername: row.sourceUsername, employeeNo: row.employeeNo });
const message = cause => cause && (cause.errMsg || cause.message) || '请求失败，已停止，请重新预览';
function statusText(row) { return row.conflicts && row.conflicts.length ? row.conflicts.join('；') : row.state === 'ready' ? '可合并' : row.message || row.state; }
/** 预览仅发起只读服务端核对；任一账号冲突时禁止批量迁移。 */
async function preview() {
  if (busy.value) return;
  busy.value = true; error.value = ''; loaded.value = false; rows.value = [];
  try {
    for (const [sourceUsername, employeeNo, name] of pairs) {
      progress.value = '正在核对：' + name;
      const result = await request('previewLegacyAccountMerge', { sourceUsername, employeeNo });
      if (!result || !result.state) throw new Error('合并预览返回不完整');
      rows.value.push({ name, ...result });
    }
    loaded.value = true; progress.value = '预览完成。数据变化后将要求重新预览，不会覆盖冲突记录。';
  } catch (cause) { error.value = message(cause); progress.value = '预览中断，未启动账号迁移。'; }
  finally { busy.value = false; }
}
/** 按账号串行执行；服务端保存备份与游标，中断后可通过预览继续。 */
async function merge() {
  if (busy.value || !canMerge.value) return;
  busy.value = true; error.value = '';
  try {
    for (const row of rows.value) {
      if (row.state === 'complete') continue;
      progress.value = '正在迁移：' + row.name;
      let result = await request('startLegacyAccountMerge', { ...payload(row), planHash: row.planHash });
      Object.assign(row, result);
      while (!['readyToDelete', 'complete'].includes(row.state)) {
        result = await request('continueLegacyAccountMerge', { mergeId: row.mergeId });
        if (!result || !result.state) throw new Error('迁移结果不完整，请回读');
        Object.assign(row, result); progress.value = row.name + '：' + row.completed + ' / ' + row.total;
      }
      if (row.state === 'readyToDelete') Object.assign(row, await request('finalizeLegacyAccountMerge', { mergeId: row.mergeId }));
    }
    progress.value = '6组账号已迁移并删除旧账号，请再次预览回读核对。';
  } catch (cause) { error.value = message(cause); progress.value = '已停止。迁移清单和备份保留，请重新预览核对后继续。'; }
  finally { busy.value = false; emit('changed'); }
}
</script>

<style lang="scss" scoped>
.account-merge { margin-bottom: 1rem; padding: 1rem; border: 1px solid $uni-border-color; border-radius: .5rem; background: $uni-bg-color; }
.heading, .actions { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.title { font-size: 1rem; font-weight: 600; }
.note { margin: .5rem 0; color: $uni-text-color-grey; line-height: 1.6; }
.error { color: $uni-color-error; line-height: 1.6; }
.actions { margin-top: .75rem; }
button { margin: 0; }
</style>
