const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ADMIN = path.resolve(__dirname, '..');
const ROOT = path.resolve(ADMIN, '..');
const APP = ROOT + '/mes-uniapp';
/** 真实数据目录：命令行参数 → MES_ROSTER_INPUT → <工作区>/排班表；都没有则跳过（exit 0），保证 CI/本地可直接跑。 */
function resolveInput() {
  const candidates = [process.argv[2], process.env.MES_ROSTER_INPUT, path.join(ROOT, '排班表')].filter(Boolean);
  for (const candidate of candidates) {
    try { if (fs.statSync(candidate).isDirectory()) return candidate; } catch (_) {}
  }
  if (process.argv[2]) console.log('注意：命令行指定的目录不存在：' + process.argv[2]);
  if (process.env.MES_ROSTER_INPUT) console.log('注意：MES_ROSTER_INPUT 目录不存在：' + process.env.MES_ROSTER_INPUT);
  return '';
}
const INPUT = resolveInput();
if (!INPUT) {
  console.log('SKIP 6 月排班真实数据回放：未找到排班表目录（不视为失败）。');
  console.log('用法：npm run test:roster -- <排班表目录>  或  MES_ROSTER_INPUT=<目录> node tests/june-roster.test.cjs');
  console.log('默认还会查找：' + path.join(ROOT, '排班表'));
  process.exit(0);
}
const OUTPUT = process.env.MES_ROSTER_REPORT || path.join(require('node:os').tmpdir(), 'mes-june-replay-results.json');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const getField = (row, key) => key.split('.').reduce((value, part) => value == null ? undefined : value[part], row);
const predicate = (op, value) => ({ op, value, and(other) { return predicate('and', [this, other]); } });
const matchValue = (actual, expected) => {
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  if (expected && expected.op) {
    switch (expected.op) {
      case 'and': return expected.value.every(item => matchValue(actual, item));
      case 'or': return expected.value.some(item => matchValue(actual, item));
      case 'eq': return actual === expected.value;
      case 'neq': return actual !== expected.value;
      case 'exists': return (actual !== undefined) === expected.value;
      case 'lt': return actual < expected.value;
      case 'lte': return actual <= expected.value;
      case 'gt': return actual > expected.value;
      case 'gte': return actual >= expected.value;
      case 'in': return Array.isArray(actual) ? actual.some(item => expected.value.includes(item)) : expected.value.includes(actual);
    }
  }
  return actual === expected;
};
function createDb() {
  const store = new Map();
  const ensure = name => { if (!store.has(name)) store.set(name, new Map()); return store.get(name); };
  const command = Object.fromEntries(['eq','neq','exists','lt','lte','gt','gte','in','inc'].map(op => [op, value => predicate(op, value)]));
  command.and = (...values) => predicate('and', values.flat());
  command.or = (...values) => predicate('or', values.flat());
  const matches = (row, condition) => {
    if (!condition) return true;
    if (condition.op === 'and') return condition.value.every(item => matches(row, item));
    if (condition.op === 'or') return condition.value.some(item => matches(row, item));
    return Object.entries(condition).every(([key, value]) => matchValue(getField(row, key), value));
  };
  return { store, ensure, command, RegExp: ({regexp, options}) => new RegExp(regexp, options), collection(name) {
    const query = condition => {
      let offset = 0, size = Infinity, orders = [], fields = null;
      const rows = () => [...ensure(name).values()].filter(row => matches(row, condition));
      const q = {
        where: value => query(value),
        skip(value) { offset = value; return q; }, limit(value) { size = value; return q; },
        orderBy(key, direction) { orders.push([key, direction]); return q; }, field(value) { fields = value; return q; },
        async count() { return {total: rows().length}; },
        async get() { let result = rows().sort((a,b) => { for (const [key, direction] of orders) { const x = getField(a,key), y = getField(b,key); const value = x > y ? 1 : x < y ? -1 : 0; if (value) return direction === 'desc' ? -value : value; } return 0; }).slice(offset, offset + size).map(clone); if (fields) result = result.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key === '_id' || fields[key]))); return {data:result}; },
        async add(value) { if (ensure(name).has(value._id)) throw new Error('duplicate key'); ensure(name).set(value._id, clone(value)); return {id:value._id}; },
        async update(values) { let updated = 0; for (const [id,row] of ensure(name)) if (matches(row,condition)) { const next = {...row}; for (const [key,value] of Object.entries(values)) next[key] = value && value.op === 'inc' ? (Number(row[key]) || 0) + value.value : clone(value); ensure(name).set(id,next); updated++; } return {updated}; },
        doc(id) { return {get: () => query({_id:id}).get(), field: value => query({_id:id}).field(value), update: value => query({_id:id}).update(value), async set(value) { ensure(name).set(id,{...clone(value),_id:id}); return {updated:1}; }}; }
      }; return q;
    }; return query(null);
  }};
}
class ClientError extends Error { constructor(message, code) { super(message); this.code = code; } }
// mes-common 的规则由 tools/sync-shared.mjs 从 shared/logic 生成（唯一来源），测试必须用真实规则，
// 只注入 ClientError；空桩会让云端新增校验（如 scheduleBatchIsValid）在测试里变成 undefined。
const common = {ClientError, ...require(APP + '/uniCloud-alipay/cloudfunctions/common/mes-common/rules.js')};
const cloudCache = new Map();
function cloudLoad(file) {
  file = file.endsWith('.js') ? file : file + '.js';
  if (cloudCache.has(file)) return cloudCache.get(file).exports;
  const module = {exports:{}}; cloudCache.set(file,module);
  const localRequire = name => {
    if (name === 'mes-common') return common;
    if (name.startsWith('mes-document-store')) return cloudLoad(APP + '/uniCloud-alipay/cloudfunctions/common/' + (name === 'mes-document-store' ? name + '/index' : name));
    if (name.startsWith('.')) return cloudLoad(path.resolve(path.dirname(file),name));
    return require(name);
  };
  vm.runInThisContext('(function(require,module,exports){' + fs.readFileSync(file,'utf8') + '\n})', {filename:file})(localRequire,module,module.exports);
  return module.exports;
}
const db = createDb();
const execute = cloudLoad(APP + '/uniCloud-alipay/cloudfunctions/common/mes-operations/index').execute;
const AUTH = {uid:'roster-test-admin',role:['admin']};
let loseImportResponse = false;
const callOperations = async (action, payload = {}) => {
  const result = await execute(db, AUTH, {...payload, action});
  if (action === 'importSchedules' && loseImportResponse) { loseImportResponse = false; throw new Error('模拟云端保存成功但响应丢失'); }
  return result;
};
const storage = new Map();
const uni = {getStorageSync:key => storage.get(key), setStorageSync:(key,value) => storage.set(key,value), setNavigationBarTitle() {}, showToast() {}, navigateTo() {}};
const frontCache = new Map();
function frontLoad(file) {
  if (file.endsWith('.vue')) return {};
  if (file.endsWith('/utils/mes-api.js')) return {requireMesAdmin:async()=>AUTH, callMes:(_, action, payload)=>callOperations(action,payload), confirmMes:async()=>true, formatMesDate: value=>String(value)};
  if (frontCache.has(file)) return frontCache.get(file);
  const exported = {}, names = [];
  let source = fs.readFileSync(file,'utf8');
  source = source.replace(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?$/gm, (_, binding, specifier) => {
    const dependency = frontLoad(specifier.startsWith('@/') ? ADMIN + '/' + specifier.slice(2) : path.resolve(path.dirname(file),specifier));
    const variable = '__dep' + names.length; names.push([variable,dependency]);
    return binding.startsWith('{') ? 'const ' + binding + ' = ' + variable + ';' : 'const ' + binding + ' = ' + variable + '.default;';
  });
  const publicNames = [];
  source = source.replace(/export\s+(?=(?:async\s+)?function\s|const\s|let\s|class\s)/g, '');
  const original = fs.readFileSync(file,'utf8');
  for (const found of original.matchAll(/export\s+(?:(?:async\s+)?function|const|let|class)\s+(\w+)/g)) publicNames.push(found[1]);
  source = source.replace(/export default\s+([^;]+);?/g, 'exports.default = $1;');
  source += '\nObject.assign(exports, {' + publicNames.join(',') + '});';
  const context = {console, setTimeout, clearTimeout, btoa:global.btoa, atob:global.atob, Uint8Array, Int16Array, Int32Array, ArrayBuffer, Buffer, uni, exports:exported, ...Object.fromEntries(names)};
  vm.runInNewContext(source,context,{filename:file});
  frontCache.set(file,exported); return exported;
}
function makePage() {
  const file = ADMIN + '/pages/mes/operations/schedules.vue';
  let script = fs.readFileSync(file,'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const context = {console, setTimeout, clearTimeout, uni};
  script = script.replace(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?$/gm, (_,binding,name) => { const dep = frontLoad(ADMIN + '/' + name.slice(2)); if (binding.startsWith('{')) for (const key of binding.replace(/[{}]/g,'').split(',').map(value=>value.trim())) context[key] = dep[key]; else context[binding] = {}; return ''; }).replace('export default','component =');
  vm.runInNewContext(script,context,{filename:file});
  const component = context.component;
  const {reactive, computed} = require(process.env.MES_TEST_VUE_REACTIVITY || '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli-vite/node_modules/@vue/reactivity');
  const state = reactive(component.data());
  for (const [key,fn] of Object.entries(component.methods || {})) state[key] = fn.bind(state);
  for (const [key,fn] of Object.entries(component.computed || {})) { const value = computed(fn.bind(state)); Object.defineProperty(state,key,{get:()=>value.value}); }
  return state;
}
const results = {input:INPUT, checks:[], files:[], problems:[]};
async function check(name, fn) { try { await fn(); results.checks.push({name,ok:true}); console.log('PASS ' + name); } catch (error) { results.checks.push({name,ok:false,message:error.message}); console.error('FAIL ' + name + ': ' + error.stack); } }
const values = name => [...db.ensure('mes_ops_' + name).values()];
function applyApprovedNotes(state) {
  for (const sheet of state.sheets) {
    if (sheet.fileName.startsWith('排班表_2026-06-11')) sheet.rows[27][5] = sheet.rows[27][5].replace('陈火烽','陈火锋');
    if (sheet.fileName.startsWith('排班表_2026-06-13')) sheet.rows[19][5] = sheet.rows[19][5].replace('高东明','高冬明');
  }
}
function reviewApprovedTimes(state) {
  for (const row of state.problemRows) {
    if (row.record?.date !== '2026-06-26' || !row.reviewReason.includes('结束后下班')) continue;
    state.reviewRow(row); Object.assign(state.reviewForm,{startTime:'08:00',endTime:'16:00',startDayOffset:0,endDayOffset:0}); state.saveReview();
    assert.equal(state.reviewError,'');
  }
}
(async () => {
  db.ensure('uni-id-users').set(AUTH.uid,{_id:AUTH.uid,username:'排班测试管理员',status:0});
  const workshop = await callOperations('saveCatalog',{type:'workshops',expectedVersion:0,record:{code:'TEST301',name:'测试车间'}});
  const state = makePage(); await state.reload(); assert.equal(state.error,'');
  state.batchSettings.workshopId = workshop._id;
  const files = fs.readdirSync(INPUT).filter(name => name.endsWith('.xlsx')).sort().map(name => { const buffer = fs.readFileSync(path.join(INPUT,name)); return {name,size:buffer.length,arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)}; });
  await state.loadFiles(files);
  results.files = clone(state.importFiles);
  await check('25个原始文件的SHA-256与独立计算一致且不误判重复',async()=> { assert.equal(files.length,25); for (let i=0;i<files.length;i++) { assert.equal(state.importFiles[i].fileHash,crypto.createHash('sha256').update(fs.readFileSync(path.join(INPUT,files[i].name))).digest('hex')); assert.equal(state.importFiles[i].error,''); assert.equal(state.importFiles[i].duplicateOf,''); } assert.equal(new Set(state.importFiles.map(row=>row.fileHash)).size,25); });
  // 以实际页面创建标准班次，再进行完整预览。
  if (!state.catalogs.shifts.length) {
    const {SHIFT_PRESETS} = frontLoad(ADMIN + '/utils/shift-presets.js');
    for (const preset of SHIFT_PRESETS) await callOperations('saveCatalog',{type:'shifts',expectedVersion:0,record:preset});
    await state.reload(); await state.preview();
  }
  await check('所有文件自动识别且不需要选择工序映射',async()=> { assert.equal(state.importError,''); assert.equal(state.previewReady,true); assert.equal(state.sheets.filter(row=>row.selected).length,25); assert.equal(state.dateSources.length,25); assert.equal(state.versionConflicts.length,0); assert.equal(state.processPlans.filter(row=>row.state==='error').length,0); });
  results.problems = clone(state.problemRows.map(row=>({file:row.sourceFile,line:row.line,name:row.personName,date:row.record?.date,process:row.processName,error:row.error,batchError:row.batchError,reviewReason:row.reviewReason,record:row.record})));
  results.summary = {previews:state.previews.length,eligible:state.eligibleCount,problems:state.problemRows.length,dates:state.daySummaries.map(row=>row.date),processes:state.processPlans.length};
  await check('6月22日12:00上班按12:00–20:00生成',async()=> { const rows = state.checkedPreviews.filter(row=>row.record?.date==='2026-06-22' && row.processName==='小罐装连线'); assert.ok(rows.length); const timed = rows.filter(row=>row.timeRule.includes('仅写上班时间')); assert.ok(timed.length); for (const row of timed) { assert.equal(row.record.startTime,'12:00'); assert.equal(row.record.endTime,'20:00'); } });
  await check('8/12小时夜班保留正确的次日偏移',async()=> { const rows = state.checkedPreviews.filter(row=>row.record?.kind==='work' && !row.error && !row.batchError); assert.ok(rows.some(row=>row.record.startTime==='20:00')); assert.ok(rows.some(row=>row.record.startTime==='00:00')); for (const row of rows) { if (row.record.startTime==='20:00' && row.record.endTime==='08:00') assert.equal(row.record.endDayOffset,1); if (row.record.startTime==='00:00' && row.record.endTime==='08:00') { assert.equal(row.record.startDayOffset,1); assert.equal(row.record.endDayOffset,1); } } });
  await check('完整日表预览没有被静默丢弃的错误记录',async()=> { assert.equal(state.eligibleCount + state.problemRows.length,state.previews.length); });
  await check('原始表的4条未核对记录阻止整批写入',async()=> { assert.equal(state.problemRows.length,4); await state.importRows(); assert.ok(state.importError.includes('完整日表须全部记录通过核对')); assert.equal(values('schedules').length,0); });
  results.approvedAdjustments = ['6月11日备注陈火烽按人员栏陈火锋处理','6月13日备注高东明按人员栏高冬明处理','6月26日两道工序结束后下班预设08:00–16:00，员工可修改实际时间'];
  applyApprovedNotes(state); await state.preview(); reviewApprovedTimes(state);
  await check('经用户确认处理后所有预览均可导入',async()=> { assert.equal(state.importError,''); assert.equal(state.problemRows.length,0); assert.equal(state.eligibleCount,state.previews.length); });
  await check('两处确认的姓名应用对应12小时起止时间',async()=> { const a=state.checkedPreviews.find(row=>row.record?.date==='2026-06-11' && row.personName==='陈火锋' && row.processName==='大罐装连线'); const b=state.checkedPreviews.find(row=>row.record?.date==='2026-06-13' && row.personName==='高冬明' && row.processName==='大罐装连线'); assert.equal(a.record.startTime,'08:00'); assert.equal(a.record.endTime,'20:00'); assert.equal(b.record.startTime,'20:00'); assert.equal(b.record.endTime,'08:00'); });
  const expectedAttendance = new Map();
  for (const row of state.checkedPreviews) {
    const r=row.record; const key=JSON.stringify([r.date,r.personName,r.shiftId||'']);
    const hours=r.kind==='work' ? ((r.endDayOffset*24 + Number(r.endTime.slice(0,2)) + Number(r.endTime.slice(3))/60) - (r.startDayOffset*24 + Number(r.startTime.slice(0,2)) + Number(r.startTime.slice(3))/60)) : 0;
    if (!expectedAttendance.has(key)) expectedAttendance.set(key,{date:r.date,name:r.personName,kind:r.kind,hours,processIds:new Set()});
    const current=expectedAttendance.get(key); assert.equal(current.hours,hours); if (r.kind==='work') current.processIds.add(r.processId);
  }
  const expectedHours=[...expectedAttendance.values()].reduce((sum,row)=>sum+row.hours,0);
  const expectedPersonDays=new Set([...expectedAttendance.values()].filter(row=>row.kind==='work').map(row=>row.date+'|'+row.name)).size;
  results.expected={schedules:state.previews.length,attendance:expectedAttendance.size,people:new Set([...expectedAttendance.values()].map(row=>row.name)).size,hours:expectedHours,personDays:expectedPersonDays};
  results.resolvedSummary={previews:state.previews.length,eligible:state.eligibleCount,problems:state.problemRows.length};
  fs.writeFileSync(OUTPUT,JSON.stringify(results,null,2));
  if (state.problemRows.length) console.log('NEEDS_REVIEW ' + state.problemRows.length + ' rows. Details: ' + OUTPUT);
  else {
    loseImportResponse=true;
    await state.importRows();
    const firstAccepted=values('schedules').map(row=>({_id:row._id,version:row.version}));
    await check('首批保存后的响应丢失可见且不清理旧记录',async()=> { assert.ok(state.importError.includes('模拟云端保存成功但响应丢失')); assert.equal(firstAccepted.length,20); });
    console.log('PROGRESS resuming ' + results.expected.schedules + ' schedules');
    await state.importRows();
    results.import = {stage:state.importStage,error:state.importError,notice:state.importNotice,schedules:values('schedules').length,attendance:values('attendance').length,personnel:values('personnel').length,processes:values('processes').length,versions:values('versions').length};
    if (state.importError) { fs.writeFileSync(OUTPUT,JSON.stringify(results,null,2)); throw new Error(state.importError); }
    await check('完整25天写入及考勤同步成功',async()=> { assert.equal(state.importError,''); assert.equal(state.importStage,'完成'); assert.equal(values('schedules').length,state.previews.length); assert.ok(values('attendance').length); });
    await check('重试已保存的20条不重复新增版本',async()=> { for (const previous of firstAccepted) assert.equal(db.ensure('mes_ops_schedules').get(previous._id).version,previous.version); });
    await check('考勤逐人逐班与独立工时去重计算一致',async()=> { assert.ok(Number.isFinite(expectedHours)); assert.equal(values('attendance').length,expectedAttendance.size); for (const row of values('attendance')) { const expected=expectedAttendance.get(JSON.stringify([row.date,row.personName,row.shiftId||''])); assert.ok(expected); assert.equal(row.workHours,expected.hours); assert.deepEqual([...row.processIds].sort(),[...expected.processIds].sort()); } });
    await check('6月27日只有11人出勤，其余已知人员自动休息',async()=> { const day=values('attendance').filter(row=>row.date==='2026-06-27'); assert.equal(day.filter(row=>row.kind==='work').length,11); assert.equal(day.filter(row=>row.kind==='rest').length,results.expected.people-11); });
    await check('未上传的6月5/19/20/21/28日不生成排班和考勤',async()=> { for (const date of ['2026-06-05','2026-06-19','2026-06-20','2026-06-21','2026-06-28']) { assert.ok(!values('schedules').some(row=>row.date===date)); assert.ok(!values('attendance').some(row=>row.date===date)); } });
    const month=await callOperations('attendanceSummary',{periodType:'month',period:'2026-06'}), year=await callOperations('attendanceSummary',{periodType:'year',period:'2026'});
    results.statistics={hours:month.workHours,personDays:month.attendanceDays,people:month.persons.length,processParticipation:month.processes.reduce((sum,row)=>sum+row.count,0)};
    await check('月度与年度统计按去重出勤天数和总工时汇总',async()=> { assert.equal(month.workHours,expectedHours); assert.equal(month.attendanceDays,expectedPersonDays); assert.equal(year.workHours,month.workHours); assert.equal(year.attendanceDays,month.attendanceDays); });
    const beforeCounts={schedules:values('schedules').length,attendance:values('attendance').length,personnel:values('personnel').length};
    const second=makePage(); await second.reload(); await second.loadFiles(files); applyApprovedNotes(second); await second.preview(); reviewApprovedTimes(second);
    console.log('PROGRESS repeated import'); await second.importRows();
    await check('相同25个文件重新导入不增加人员、排班、考勤和工时',async()=> { assert.equal(second.importError,''); assert.equal(second.importStage,'完成'); assert.equal(values('schedules').length,beforeCounts.schedules); assert.equal(values('attendance').length,beforeCounts.attendance); assert.equal(values('personnel').length,beforeCounts.personnel); const summary=await callOperations('attendanceSummary',{period:'2026-06'}); assert.equal(summary.workHours,expectedHours); assert.equal(summary.attendanceDays,expectedPersonDays); });
    const dup=makePage(); await dup.reload(); await dup.loadFiles([files[0],{...files[0],name:'重复副本.xlsx'}]);
    await check('真正相同字节的文件副本会被跳过',async()=> { assert.equal(dup.importFiles[1].duplicateOf,files[0].name); assert.equal(dup.sheets.filter(row=>row.selected).length,1); });
    const target=values('attendance').find(row=>row.kind==='work' && row.workHours===8 && row.processIds.length===1 && values('attendance').filter(other=>other.personId===row.personId && other.date===row.date).length===1);
    const person=db.ensure('mes_ops_personnel').get(target.personId);
    db.ensure('uni-id-users').set('test-operator',{_id:'test-operator',status:0,username:'测试操作员'});
    await callOperations('saveCatalog',{type:'personnel',expectedVersion:person.version,record:{...person,uid:'test-operator',scopeRole:'operator',changeReason:'测试本人出勤权限'}});
    const own=(action,payload)=>execute(db,{uid:'test-operator',role:[]},{...payload,action});
    const changed=await own('saveAttendance',{record:{...target,endTime:'17:00',changeReason:''},expectedVersion:target.version,requestId:'test-user-attendance-edit'});
    await check('操作员直接修改本人实际时间，无需确认出勤',async()=> { assert.equal(changed.workHours,9); assert.equal(changed.status,'recorded'); assert.equal(changed.edited,true); });
    const schedule=values('schedules').find(row=>row.personId===target.personId && row.date===target.date && row.processId===target.processIds[0]);
    await callOperations('saveSchedule',{record:{...schedule,endTime:'20:00',changeReason:'测试重新排班产生冲突'},expectedVersion:schedule.version});
    const conflicted=db.ensure('mes_ops_attendance').get(target._id);
    await check('新排班保留本人修改并生成可选择的冲突',async()=> { assert.ok(conflicted.conflict); assert.equal(conflicted.conflict.retained.workHours,9); assert.equal(conflicted.conflict.incoming.workHours,12); await assert.rejects(callOperations('resolveAttendanceConflict',{id:target._id,choice:'retained',expectedVersion:conflicted.version,requestId:'test-admin-resolve-conflict'}),error=>error.code===403); });
    const chosen=await own('resolveAttendanceConflict',{id:target._id,choice:'retained',expectedVersion:conflicted.version,requestId:'test-user-resolve-conflict'});
    await check('本人保留原修改后统计采用9小时，历史可追溯',async()=> { assert.equal(chosen.workHours,9); assert.equal(chosen.conflict,null); const history=await own('attendanceHistory',{id:target._id}); assert.ok(history.versions.length>=4); assert.ok(history.versions.some(row=>row.conflict)); });
    db.ensure('mes_ops_personnel').get(target.personId).scopeRole='team_lead';
    await check('历史班组长账号按操作员生效且不能排班',async()=> { const base=await own('bootstrap',{}); assert.equal(base.profile.scopeRole,'operator'); assert.equal(base.catalogs.teams,undefined); await assert.rejects(own('saveSchedule',{record:{...schedule,changeReason:'旧角色越权测试'},expectedVersion:schedule.version+1}),error=>error.code===403); });
  }
  await check('测试结束后原始25个Excel字节保持不变',async()=> { for (const file of results.files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(INPUT,file.name))).digest('hex'),file.fileHash); });
  fs.writeFileSync(OUTPUT,JSON.stringify(results,null,2));
  console.log(JSON.stringify({summary:results.summary,import:results.import,passed:results.checks.filter(row=>row.ok).length,failed:results.checks.filter(row=>!row.ok).length,report:OUTPUT}));
  process.exitCode = results.checks.some(row=>!row.ok) ? 1 : 0;
})().catch(error=>{console.error(error.stack);fs.writeFileSync(OUTPUT,JSON.stringify({...results,fatal:error.stack},null,2));process.exitCode=1;});
