/** 调用同一空间内由生产助手工程维护的 MES 云函数。 */
export async function callMes(name, action, payload = {}) {
  const response = await uniCloud.callFunction({
    name, timeout: (name === 'doc-ocr' && action === 'recognize') || (name === 'production-orders' && action === 'commitSourceImages') ? 210000 : 60000,
    data: { ...payload, action, uniIdToken: uni.getStorageSync('uni_id_token') }
  });
  const result = response && response.result;
  if (!result || typeof result.code !== 'number') throw new Error('服务返回异常，请重试');
  if (result.code !== 0) {
    if (result.code === 401) {
      uni.removeStorageSync('uni_id_token');
      uni.removeStorageSync('uni-id-pages-userInfo');
      uni.redirectTo({ url: '/uni_modules/uni-id-pages/pages/login/login-withpwd' });
    }
    const error = new Error(result.message || '操作失败');
    error.code = result.code;
    throw error;
  }
  return result.data;
}

/** 进入 MES 管理页面前，向服务端确认当前账号角色。 */
export async function requireMesAdmin() {
  const user = await callMes('user-admin', 'profile');
  if (!(user.role || []).includes('admin')) throw new Error('此页面需要管理员账号，请切换账号后访问');
  return user;
}

/** 格式化列表时间戳。 */
export function formatMesDate(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { hour12: false });
}

/** 显示明确的更新或停用确认。 */
export function confirmMes(title, content) {
  return new Promise(resolve => uni.showModal({ title, content, success: result => resolve(result.confirm), fail: () => resolve(false) }));
}
