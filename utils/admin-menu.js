const FOUNDATION = '/pages/mes/operations/foundation';

export const ADMIN_MENU = [
  { menu_id: 'ops-execution', text: '现场执行', icon: 'admin-icons-shijianfenxi', children: [
    { menu_id: 'ops-dashboard', text: '工作台', icon: 'admin-icons-overview', value: '/pages/mes/operations/dashboard' },
    { menu_id: 'ops-schedules', text: '生产计划', icon: 'admin-icons-shijianfenxi', value: '/pages/mes/operations/schedules' },
    { menu_id: 'ops-jobs', text: '工单执行', icon: 'admin-icons-channel', value: '/pages/mes/operations/jobs', relatedRoutes: [{ value: '/pages/mes/operations/job-detail', text: '工单详情' }] },
    { menu_id: 'ops-handovers', text: '交接班', icon: 'admin-icons-scene', value: '/pages/mes/operations/handovers' },
    { menu_id: 'ops-exceptions', text: '生产异常', icon: 'admin-icons-cuowutongji', value: '/pages/mes/operations/exceptions' },
    { menu_id: 'ops-attendance', text: '考勤记录与统计', icon: 'admin-icons-tongji', value: '/pages/mes/operations/attendance' }
  ] },
  { menu_id: 'mes-order-trace', text: '订单与追溯', icon: 'admin-icons-doc', children: [
    { menu_id: 'mes-orders', text: '生产订单', icon: 'admin-icons-table', value: '/pages/mes/orders/list', relatedRoutes: [{ value: '/pages/mes/orders/edit', text: '订单详情' }] },
    { menu_id: 'mes-trace', text: '批次追溯', icon: 'admin-icons-shijianfenxi1', value: '/pages/mes/orders/trace' }
  ] },
  { menu_id: 'mes-foundation', text: '基础数据', icon: 'admin-icons-ziyuan', children: [
    { menu_id: 'mes-products', text: '产品物料 / BOM', icon: 'admin-icons-table', value: '/pages/mes/products/list', relatedRoutes: [{ value: '/pages/mes/products/edit', text: '产品详情' }] },
    { menu_id: 'mes-packaging', text: '客户与包装方案', icon: 'admin-icons-manager-user', value: '/pages/mes/packaging/manage' },
    { menu_id: 'ops-processes', text: '工序信息', icon: 'admin-icons-channel', value: FOUNDATION + '?type=processes' },
    { menu_id: 'ops-workshops', text: '车间信息', icon: 'admin-icons-scene', value: FOUNDATION + '?type=workshops' },
    { menu_id: 'ops-shifts', text: '班次设置', icon: 'admin-icons-shijianfenxi', value: FOUNDATION + '?type=shifts' },
    { menu_id: 'ops-equipment', text: '设备信息', icon: 'admin-icons-shebeitongji', value: FOUNDATION + '?type=resources&kind=equipment' },
    { menu_id: 'ops-mould', text: '模具信息', icon: 'admin-icons-ziyuan', value: FOUNDATION + '?type=resources&kind=mould' }
  ] },
  { menu_id: 'ops-insights', text: '报表与日志', icon: 'admin-icons-stat', children: [
    { menu_id: 'ops-reports', text: '报表中心', icon: 'admin-icons-stat', value: '/pages/mes/operations/reports' },
    { menu_id: 'ops-audit', text: '操作日志', icon: 'admin-icons-safety', value: '/pages/mes/operations/audit' }
  ] },
  { menu_id: 'system_management', text: '系统管理', icon: 'admin-icons-xitongguanli', children: [
    { menu_id: 'mes-ocr', text: 'OCR 配置', icon: 'admin-icons-doc', value: '/pages/mes/ocr/config' }
  ] }
];

function cloneMenu(items) {
  return items.map(item => ({ ...item, ...(item.children ? { children: cloneMenu(item.children) } : {}) }));
}

function flatten(items) {
  return items.flatMap(item => [item, ...flatten(item.children || [])]);
}

/** 云端菜单先按权限筛选，此处只重组已经可见的入口。 */
export function mergeAdminMenus(staticMenu, authorizedCloudMenu) {
  const result = cloneMenu(staticMenu);
  const system = result.find(item => item.menu_id === 'system_management');
  if (!system) return [...result, ...authorizedCloudMenu];
  const cloudItems = flatten(authorizedCloudMenu);
  const take = (id, text) => {
    const source = cloudItems.find(item => item.menu_id === id && item.value);
    return source ? { ...source, text, children: undefined } : null;
  };
  const accounts = [
    take('system_user', '用户账号'), take('system_role', '角色管理'),
    take('system_permission', '权限管理'), take('system_menu', '菜单配置'),
    take('safety_statistics_user_log', '登录日志')
  ].filter(Boolean);
  if (accounts.length) system.children.splice(1, 0, { menu_id: 'system-accounts', text: '账号与权限', icon: 'admin-icons-manager-permission', children: accounts });
  const versions = [take('system_app', '应用信息'), take('system_update', '版本发布')].filter(Boolean);
  if (versions.length) system.children.push({ menu_id: 'system-versions', text: '应用版本', icon: 'admin-icons-manager-app', children: versions });
  return result;
}

function routeParts(value) {
  const [path = '/', search = ''] = String(value || '/').split('?');
  const query = {};
  const decode = value => { try { return decodeURIComponent(value.replace(/\+/g, ' ')); } catch (_) { return value; } };
  search.split('&').filter(Boolean).forEach(part => {
    const separator = part.indexOf('=');
    query[decode(separator < 0 ? part : part.slice(0, separator))] = decode(separator < 0 ? '' : part.slice(separator + 1));
  });
  return { path: path.replace(/\/$/, '') || '/', query };
}

export function getMenuTrail(items, menuId, ancestors = []) {
  for (const item of items) {
    const trail = [...ancestors, item];
    if (item.menu_id === menuId) return trail;
    const nested = getMenuTrail(item.children || [], menuId, trail);
    if (nested.length) return nested;
  }
  return [];
}

export function menuBreadcrumbs(trail) {
  return trail.map(item => ({ name: item.text, ...(item.value ? { to: { path: item.value } } : {}) }));
}

/** 同一个页面的不同分类要独立匹配，详情页沿用对应列表入口。 */
export function getMenuLocation(items, fullPath) {
  const current = routeParts(fullPath);
  if (current.path === FOUNDATION) {
    if (!current.query.type || current.query.type === 'teams') current.query.type = 'workshops';
    if (current.query.type === 'resources' && !current.query.kind) current.query.kind = 'equipment';
  }
  let best = null;
  const visit = (nodes, ancestors) => nodes.forEach(item => {
    const trail = [...ancestors, item];
    const candidates = [{ value: item.value }, ...(item.relatedRoutes || [])];
    candidates.forEach((candidate, index) => {
      if (!candidate.value) return;
      const target = routeParts(candidate.value);
      const keys = Object.keys(target.query);
      if (target.path !== current.path || !keys.every(key => current.query[key] === target.query[key])) return;
      const score = keys.length * 10 + (index === 0 ? 2 : 1);
      if (best && best.score >= score) return;
      const routes = menuBreadcrumbs(trail);
      if (index > 0 && candidate.text) routes.push({ name: candidate.text });
      best = { score, item, routes };
    });
    visit(item.children || [], trail);
  });
  visit(items, []);
  return best;
}
