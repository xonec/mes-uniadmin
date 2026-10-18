const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const admin = path.resolve(__dirname, '..');
const root = path.resolve(admin, '..');
const emptyCatalogs = () => Object.fromEntries(['workshops','processes','shifts','personnel','resources'].map(key => [key, []]));
let passed = 0, failed = 0;
/** 使用模拟服务运行独立回归用例。 */
async function test(name, fn) { try { await fn(); passed++; console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.stack); } }
/** 仅执行页面脚本及计算属性，不启动浏览器或请求真实云服务。 */
function page(name, overrides = {}, filename) {
  let script = fs.readFileSync(filename || admin + '/pages/mes/operations/' + name + '.vue', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const context = { console, setTimeout, clearTimeout, today: () => '2026-10-09', emptyCatalogs, unitName: value => value, options: rows => rows.map(row => ({value:row._id,text:row.name})), requireMesAdmin: async () => ({_id:'admin',role:['admin']}), callOperations: async () => ({catalogs: emptyCatalogs(), profile:{isAdmin:true}, list:[],total:0,rows:[],totals:[]}), callMes: async () => ({list:[],hasMore:false}), SHIFT_PRESETS: [], DAY_OPTIONS: [], jobStates: [], handoverStates: [], ...overrides };
  script = script.replace(/^import (.*?) from .*?;?$/gm, (_, names) => { for (const name of names.replace(/[{}]/g,'').split(',').map(x=>x.trim()).filter(Boolean)) if (!(name in context)) context[name] = () => {}; return ''; }).replace('export default', 'result =');
  vm.runInNewContext(script, context);
  const component = context.result, state = component.data();
  state.watchers = component.watch || {};
  for (const [key, fn] of Object.entries(component.methods || {})) state[key] = fn.bind(state);
  for (const [key, def] of Object.entries(component.computed || {})) Object.defineProperty(state,key,{get:(typeof def === 'function' ? def : def.get).bind(state),set: def.set && def.set.bind(state)});
  return state;
}
(async () => {
  for (const [name, method] of [['dashboard','reload'],['jobs','reload'],['reports','reload'],['foundation','load'],['attendance','search'],['handovers','reload'],['exceptions','reload'],['audit','load'],['schedules','reload']]) {
    await test(name + ' 初始化失败后允许重试', async () => {
      let fail = true;
      const state = page(name,{requireMesAdmin: async()=>{if(fail)throw new Error('模拟鉴权断连');return {_id:'admin'};},callOperations:async()=>{if(fail)throw new Error('模拟服务断连');return {catalogs:emptyCatalogs(),profile:{isAdmin:true},list:[],total:0,rows:[],totals:[]};}});
      await state[method](); assert.ok(state.error); assert.ok(!state.loading && !state.busy);
      fail = false; await state[method](); assert.equal(state.error,''); assert.equal(state.authorized,true);
    });
  }
  await test('人员与账号入口、页面与人员资料类型已删除', async () => {
    const menu = fs.readFileSync(admin + '/utils/admin-menu.js', 'utf8');
    assert.ok(!/人员与账号/.test(menu));
    assert.ok(!/type=personnel/.test(menu));
    const pagesJson = fs.readFileSync(admin + '/pages.json', 'utf8');
    assert.ok(!/pages\/mes\/operations\/accounts/.test(pagesJson));
    assert.ok(!/pages\/mes\/operations\/personnel-claims/.test(pagesJson));
    assert.ok(!fs.existsSync(admin + '/pages/mes/operations/accounts.vue'));
    assert.ok(!fs.existsSync(admin + '/pages/mes/operations/personnel-claims.vue'));
    const foundation = fs.readFileSync(admin + '/pages/mes/operations/foundation.vue', 'utf8');
    assert.ok(!/'personnel'/.test(foundation));
  });
  await test('月度与年度切换保留所选月份', async () => {
    const state = page('attendance');
    state.filters.period = '2026-05';
    state.watchers['filters.periodType'].call(state, 'year');
    assert.equal(state.filters.period, '2026');
    state.filters.period = '2025';
    state.watchers['filters.periodType'].call(state, 'month');
    assert.equal(state.filters.period, '2025-05');
  });
  for (const [from,to,valid] of [['2026-01-01','2026-01-31',true],['2026-01-01','2026-02-01',false],['2026-10-09','2026-10-08',false],['2026-02-29','2026-03-01',false],['2028-02-29','2028-03-01',true],['','2026-10-09',false]]) await test('报表日期 ' + from + '/' + to,async()=>{let calls=0;const state=page('reports',{callOperations:async()=>{calls++;return {rows:[],totals:[]};}});state.dateFrom=from;state.dateTo=to;await state.reload();assert.equal(calls,valid?1:0);assert.equal(!!state.error,!valid);});
  await test('报表导出使用成功查询范围',async()=>{let filename='';const state=page('reports',{exportCsv:name=>filename=name});await state.reload();state.dateFrom='2026-10-01';state.exportReport();assert.ok(filename.includes('2026-10-09_2026-10-09'));});
  const miniFile = root + '/mes-uniapp/pages/operations/attendance.vue';
  const mini = overrides => {
    const state = page('attendance', { operationDate: () => '2026-10-10', operationsPage: {}, operationRequest: () => 'test-request', uni: { pageScrollTo() {} }, loadOperations: async (state, fetch, apply) => apply(await fetch()), ...overrides }, miniFile);
    state.loading = false; state.saving = false;
    return state;
  };
  await test('小程序考勤没有旧确认状态和接口', async () => {
    assert.ok(!/confirmAttendance|confirmedHours|待确认|本人已确认|确认本人出勤/.test(fs.readFileSync(miniFile, 'utf8')));
  });
  await test('小程序年度查询与统计仅请求本人', async () => {
    const calls = [];
    const state = mini({ callOperations: async (action, payload) => { calls.push({ action, payload }); return action === 'bootstrap' ? {profile:{personId:'p1',workshopId:'w1'},catalogs:{personnel:[{_id:'p1',name:'本人'}]}} : action === 'myAttendance' ? {list:[{_id:'a1'}],total:1} : {processes:[],workHours:8}; } });
    state.periodType = 'year'; state.period = '2026'; await state.load();
    assert.equal(calls.find(row => row.action === 'attendanceSummary').payload.own, true);
    assert.equal(calls.find(row => row.action === 'myAttendance').payload.periodType, 'year');
    assert.equal(state.rows[0]._id, 'a1');
  });
  await test('小程序员工不填原因也直接保存多工序记录', async () => {
    const calls = []; const state = mini({callOperations:async (action,payload)=>{calls.push({action,payload});}});
    state.load = async () => {}; state.edit({_id:'a1',version:3,date:'2026-10-10',kind:'work',shiftId:'s1',processIds:['p1','p2'],startTime:'08:00',endTime:'16:00',startDayOffset:0,endDayOffset:0});
    await state.save(); assert.equal(calls.length,1); assert.equal(calls[0].action,'saveAttendance');
    assert.equal(calls[0].payload.expectedVersion,3); assert.equal(calls[0].payload.record.changeReason,'');
    assert.equal(calls[0].payload.record.processIds.length,2); assert.equal(state.selectedHours,8);
  });
  await test('小程序休息记录清空班次和工序', async () => {
    let payload; const state = mini({callOperations:async (_,value)=>{payload=value;}}); state.load=async()=>{}; state.edit(); state.form.kind='rest'; state.form.shiftId='old'; state.form.processIds=['old']; await state.save(); assert.equal(payload.record.shiftId,''); assert.equal(payload.record.processIds.length,0); assert.equal(payload.expectedVersion,0);
  });
  await test('小程序实际时间支持12小时跨夜和8小时次日夜班', async () => {
    const state=mini(); Object.assign(state.form,{startTime:'20:00',endTime:'08:00',startDayOffset:0,endDayOffset:1}); assert.equal(state.selectedHours,12);
    Object.assign(state.form,{startTime:'00:00',endTime:'08:00',startDayOffset:1,endDayOffset:1}); assert.equal(state.selectedHours,8);
  });
  await test('小程序工序选择覆盖本人车间启用工序', async () => {
    const state=mini(); state.profile={workshopId:'w1',processIds:['p1']}; state.catalogs={processes:[{_id:'p1',workshopId:'w1'},{_id:'p2',workshopId:'w1'},{_id:'p3',workshopId:'w2'},{_id:'p4',workshopId:'w1',enabled:false}]}; assert.equal(state.processes.map(row=>row._id).join(','),'p1,p2');
  });
  await test('小程序冲突只保存本人选择的整条记录', async () => {
    let sent; const state=mini({callOperations:async(action,payload)=>{sent={action,payload};}}); state.load=async()=>{}; await state.resolveConflict({_id:'a1',version:4},'retained'); assert.equal(sent.action,'resolveAttendanceConflict'); assert.equal(sent.payload.choice,'retained'); assert.equal(sent.payload.expectedVersion,4);
  });
  const {createMemoryDb} = require(root+'/mes-uniapp/tests/helpers/memory-db.cjs');
  const db=createMemoryDb();
  for(let i=0;i<450;i++)db.ensure('uni-id-users').set('u'+String(i).padStart(4,'0'),{_id:'u'+String(i).padStart(4,'0'),username:'name'+i,status:i<200?1:0,password:'SHOULD_NOT_RETURN',register_date:i});
  db.ensure('uni-id-users').set('legacy',{_id:'legacy',username:'legacy'});
  const c={exports:{},console,uniCloud:{database:()=>db},require:()=>({checkAdmin:async(_,token)=>token==='admin'?{}:{errCode:403,message:'禁止'},ok:data=>({code:0,data}),fail:(code,message)=>({code,message})})};
  vm.runInNewContext(fs.readFileSync(root+'/mes-uniapp/uniCloud-alipay/cloudfunctions/user-admin/index.js','utf8'),c);
  await test('账号分页超过200人且不被封禁账号占位',async()=>{const ids=[];for(let page=1;;page++){const result=await c.exports.main({action:'listUsers',uniIdToken:'admin',normalOnly:true,page,pageSize:100});assert.equal(result.code,0);assert.ok(!JSON.stringify(result).includes('SHOULD_NOT_RETURN'));ids.push(...result.data.list.map(row=>row._id));if(!result.data.hasMore)break;}assert.equal(ids.length,251);assert.equal(new Set(ids).size,251);});
  await test('账号列表拒绝非管理员',async()=>{assert.equal((await c.exports.main({action:'listUsers',uniIdToken:'user',page:1})).code,403);});
  console.log(JSON.stringify({passed,failed})); process.exitCode=failed?1:0;
})();
