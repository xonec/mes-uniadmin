import { callMes } from './mes-api.js';

/** 调用生产执行管理接口，权限由服务端按真实账号校验。 */
export function callOperations(action, payload = {}) { return callMes('production-operations', action, payload); }

/** 建立尚未加载时的空基础资料。 */
export function emptyCatalogs() { return { workshops: [], processes: [], shifts: [], personnel: [], resources: [] }; }

/** 返回本地日期，避免跨时区转成前一天。 */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 为同一操作保留请求编号；修改内容后建立新的操作编号。 */
export function operationRequest(previous, payload) {
  const fingerprint = JSON.stringify(payload);
  if (previous && previous.fingerprint === fingerprint) return previous;
  return { fingerprint, id: 'admin-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) };
}

/** 将基础记录转换为选择项；编辑时保留已停用记录以供核对。 */
export function options(records, selected = '') {
  const chosen = Array.isArray(selected) ? selected : [selected];
  return (records || []).filter(item => item.enabled !== false || chosen.includes(item._id)).map(item => ({ value: item._id, text: `${item.code ? item.code + ' · ' : ''}${item.name}${item.enabled === false ? '（已停用）' : ''}` }));
}

/** 按记录编号显示名称，失效引用明确标记。 */
export function catalogName(catalogs, type, id) {
  if (!id) return '—';
  const item = (catalogs[type] || []).find(row => row._id === id);
  return item ? item.name : '资料已失效';
}

export const unitOptions = [{ value: 'bottle', text: '瓶 / 罐' }, { value: 'case', text: '件 / 箱' }, { value: 'piece', text: '条 / 片 / 粒' }];
export const jobStates = [{ value: '', text: '全部状态' }, { value: 'planned', text: '待开工' }, { value: 'running', text: '生产中' }, { value: 'paused', text: '已暂停' }, { value: 'completed', text: '已完工' }];
export const handoverStates = [{ value: '', text: '全部状态' }, { value: 'draft', text: '草稿' }, { value: 'submitted', text: '待接班' }, { value: 'received', text: '已接班' }];

/** 显示工单、交接班及异常的业务状态。 */
export function stateName(state) { return ({ planned: '待开工', running: '生产中', paused: '已暂停', completed: '已完工', draft: '草稿', submitted: '待接班', received: '已接班', open: '待处理', resolved: '已处理' })[state] || state || '—'; }

/** 显示实际冻结的工单单位。 */
export function unitName(unit) { return (unitOptions.find(row => row.value === unit) || {}).text || unit || '—'; }

/** 导出 CSV，转义引号并阻止表格公式被执行。 */
export function exportCsv(filename, columns, rows) {
  const cell = value => {
    let content = value == null ? '' : String(value);
    if (/^[\s]*[=+\-@]/.test(content)) content = "'" + content;
    return '"' + content.replace(/"/g, '""') + '"';
  };
  const csv = '\ufeff' + [columns.map(column => cell(column.label)).join(','), ...rows.map(row => columns.map(column => cell(row[column.key])).join(','))].join('\r\n');
  // #ifdef H5
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return;
  // #endif
  // #ifndef H5
  uni.setClipboardData({ data: csv });
  // #endif
}
