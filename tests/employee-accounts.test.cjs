// uni-id-co 员工账号：登录账号与工号分离（node 运行：node tests/employee-accounts.test.cjs）
// 覆盖：稳定 _id、employeeNo/account 校验、建号与回读、getEmployeeAccounts、listEmployeeAccounts、
//       一次性 id 迁移（备份/幂等/dryRun/中断恢复）、管理员权限。

const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'uni_modules/uni-id-pages/uniCloud/cloudfunctions/uni-id-co/module/admin/employee-accounts.js')
const ID_A = '110101199003071234'
const ID_B = '110101199205123456'
const ID_C = '11010119881130222X'

function createDb(tables = {}) {
    const store = {}
    for (const [name, rows] of Object.entries(tables)) store[name] = rows.map(row => ({ ...row }))
    const ensure = name => { if (!store[name]) store[name] = []; return store[name] }
    const command = {
        in: values => ({ $in: values }),
        or: values => ({ $or: values }),
        and: values => ({ $and: values }),
        neq: value => ({ $neq: value }),
        exists: () => ({ $exists: true }),
        RegExp: ({ regexp, options }) => ({ $regex: regexp, $options: options || '' })
    }
    function matches(row, condition) {
        if (!condition || typeof condition !== 'object') return true
        if ('$and' in condition) return condition.$and.every(item => matches(row, item))
        if ('$or' in condition) return condition.$or.some(item => matches(row, item))
        return Object.keys(condition).every(key => {
            const node = condition[key]
            const isNode = node && typeof node === 'object'
            if (isNode && '$in' in node) return (node.$in || []).includes(row[key])
            if (isNode && '$or' in node) return node.$or.some(item => matches(row, item))
            if (isNode && '$and' in node) return node.$and.every(item => matches(row, item))
            if (isNode && '$neq' in node) return row[key] !== node.$neq
            if (isNode && '$regex' in node) return new RegExp(node.$regex, node.$options).test(String(row[key] == null ? '' : row[key]))
            if (isNode && '$exists' in node) return row[key] !== undefined
            return row[key] === node
        })
    }
    const failures = {}
    const checkUnique = (name, doc, excludeId) => {
        const rows = ensure(name).filter(row => row._id !== excludeId)
        if (name === 'mes_employee_accounts') {
            if (doc.employeeNo && rows.some(row => row.employeeNo === doc.employeeNo)) throw new Error('duplicate employeeNo')
            if (doc.idCard && rows.some(row => row.idCard === doc.idCard)) throw new Error('duplicate idCard')
        }
        if (name === 'uni-id-users' && doc.username && rows.some(row => row.username === doc.username)) throw new Error('duplicate username')
    }
    const collection = name => {
        const run = condition => ensure(name).filter(row => matches(row, condition))
        const query = condition => {
            const state = { condition, order: [], skip: 0, limit: 1000 }
            const api = {
                where(next) { state.condition = next; return api },
                orderBy(field, direction) { state.order.push([field, direction]); return api },
                skip(value) { state.skip = value; return api },
                limit(value) { state.limit = value; return api },
                field() { return api },
                async get() {
                    let rows = run(state.condition).map(row => ({ ...row }))
                    for (const [field, direction] of state.order.slice().reverse()) {
                        rows.sort((left, right) => String(left[field] == null ? '' : left[field]).localeCompare(String(right[field] == null ? '' : right[field])) * (direction === 'desc' ? -1 : 1))
                    }
                    return { data: rows.slice(state.skip, state.skip + state.limit) }
                },
                async count() { return { total: run(state.condition).length } }
            }
            return api
        }
        const base = query(null)
        base.doc = id => ({
            field() { return base.doc(id) },
            async get() { const row = ensure(name).find(item => item._id === id); return { data: row ? [{ ...row }] : [] } },
            async update(patch) {
                if (failures[name + ':' + id]) { delete failures[name + ':' + id]; throw new Error('mock write failed') }
                const row = ensure(name).find(item => item._id === id)
                if (!row) throw new Error('update missing')
                Object.assign(row, patch)
                return { updated: 1 }
            },
            async set(payload) {
                checkUnique(name, payload, id)
                const index = ensure(name).findIndex(item => item._id === id)
                const row = { _id: id, ...payload }
                if (index >= 0) ensure(name)[index] = row
                else ensure(name).push(row)
                return { updated: 1 }
            },
            async remove() {
                const rows = ensure(name)
                const index = rows.findIndex(item => item._id === id)
                if (index >= 0) rows.splice(index, 1)
                return { deleted: index >= 0 ? 1 : 0 }
            }
        })
        base.add = async doc => {
            if (ensure(name).some(row => row._id === doc._id)) throw new Error('duplicate key')
            checkUnique(name, doc, null)
            ensure(name).push({ ...doc })
            return { id: doc._id }
        }
        return base
    }
    const db = { collection, command, RegExp: ({ regexp, options }) => ({ $regex: regexp, $options: options || '' }) }
    return { db, store, ensure, failures }
}

function load(tables) {
    const fake = createDb(tables)
    const createdUsers = []
    const updatedUsers = []
    const original = Module._load
    Module._load = function (request) {
        if (request === '../../common/constants') {
            const db = fake.db
            return { db, userCollection: db.collection('uni-id-users') }
        }
        if (request === '../../common/utils') return { checkIdCard: value => /^\d{17}[\dX]$/.test(String(value)) }
        if (request === './update-user') {
            return async function (params) {
                updatedUsers.push(params)
                const users = fake.ensure('uni-id-users')
                const user = users.find(row => row._id === params.uid)
                if (!user) throw { errCode: 'uni-id-user-not-exists' }
                if (params.username && users.some(row => row.username === params.username && row._id !== params.uid)) throw { errCode: 'uni-id-account-exists' }
                if (params.username) user.username = params.username
                if (params.nickname) user.nickname = params.nickname
                return { errCode: 0 }
            }
        }
        if (request === './add-user') {
            return async function (params) {
                createdUsers.push(params)
                const users = fake.ensure('uni-id-users')
                if (users.some(row => row.username === params.username)) throw { errCode: 'uni-id-account-exists' }
                const uid = 'uid:' + params.username
                users.push({ _id: uid, username: params.username, nickname: params.nickname, status: params.status, role: params.role })
                return { uid }
            }
        }
        return original.apply(this, arguments)
    }
    delete require.cache[TARGET]
    const module = require(TARGET)
    Module._load = original
    const context = role => ({
        middleware: { auth: async () => {}, validate: () => {} },
        authInfo: { uid: 'admin', role: [role] }
    })
    return { module, store: fake.store, ensure: fake.ensure, failures: fake.failures, createdUsers, updatedUsers, admin: context('admin'), guest: context('user') }
}

const adminContext = (loaded) => loaded.admin

let passed = 0, failed = 0
async function test(name, fn) {
    try { await fn(); passed++; console.log('  ✓ ' + name) }
    catch (error) { failed++; console.error('  ✗ ' + name); console.error('    ' + (error && error.message || error)) }
}

;(async () => {
    console.log('\nuni-id-co 员工账号（工号与登录账号分离）')

    await test('preview：工号与账号分离，account 缺省等于工号', async () => {
        const loaded = load({})
        const withAccount = await loaded.module.previewEmployeeAccount.call(loaded.admin, { employeeNo: '123456', account: 'zhangsan', name: '张三', idCard: ID_A })
        assert.equal(withAccount.errCode, 0)
        assert.equal(withAccount.state, 'ready')
        assert.equal(withAccount.employeeNo, '123456')
        assert.equal(withAccount.account, 'zhangsan')
        const defaultAccount = await loaded.module.previewEmployeeAccount.call(loaded.admin, { employeeNo: '123457', name: '李四', idCard: ID_B })
        assert.equal(defaultAccount.state, 'ready')
        assert.equal(defaultAccount.account, '123457')
    })

    await test('preview：工号/账号/身份证三类占用分别给出可读冲突', async () => {
        const loaded = load({
            mes_employee_accounts: [
                { _id: 'emp:uid:old', employeeNo: '122377', account: '122377', name: '王五', idCard: ID_C, uid: 'uid:old', state: 'ready' }
            ],
            'uni-id-users': [{ _id: 'uid:old', username: '122377', nickname: '王五', status: 0 }]
        })
        const sameNo = await loaded.module.previewEmployeeAccount.call(loaded.admin, { employeeNo: '122377', name: '别人', idCard: ID_A })
        assert.equal(sameNo.state, 'conflict')
        const usedAccount = await loaded.module.previewEmployeeAccount.call(loaded.admin, { employeeNo: '122378', account: '122377', name: '李四', idCard: ID_A })
        assert.equal(usedAccount.state, 'conflict')
        assert.match(usedAccount.message, /登录账号/)
        const sameIdCard = await loaded.module.previewEmployeeAccount.call(loaded.admin, { employeeNo: '122379', name: '赵六', idCard: ID_C })
        assert.equal(sameIdCard.state, 'conflict')
        assert.match(sameIdCard.message, /身份证/)
    })

    await test('create：账号=username、档案 _id=emp:<uid>、employeeNo 独立保存、初始密码=账号', async () => {
        const loaded = load({})
        const result = await loaded.module.createEmployeeAccount.call(loaded.admin, { employeeNo: '123456', account: 'zhangsan', name: '张三', idCard: ID_A })
        assert.equal(result.errCode, 0)
        assert.equal(result.state, 'created')
        assert.equal(result.uid, 'uid:zhangsan')
        assert.equal(result.account, 'zhangsan')
        assert.equal(loaded.createdUsers.length, 1)
        assert.equal(loaded.createdUsers[0].username, 'zhangsan')
        assert.equal(loaded.createdUsers[0].password, 'zhangsan')
        const rows = loaded.ensure('mes_employee_accounts')
        assert.equal(rows.length, 1)
        assert.equal(rows[0]._id, 'emp:uid:zhangsan')
        assert.equal(rows[0].employeeNo, '123456')
        assert.equal(rows[0].account, 'zhangsan')
        assert.equal(rows[0].uid, 'uid:zhangsan')
        assert.equal(rows[0].state, 'ready')
    })

    await test('create：重复请求回读 existing，不重置密码、不重建账号', async () => {
        const loaded = load({})
        await loaded.module.createEmployeeAccount.call(loaded.admin, { employeeNo: '123456', account: 'zhangsan', name: '张三', idCard: ID_A })
        const again = await loaded.module.createEmployeeAccount.call(loaded.admin, { employeeNo: '123456', account: 'zhangsan', name: '张三', idCard: ID_A })
        assert.equal(again.state, 'existing')
        assert.equal(again.account, 'zhangsan')
        assert.equal(loaded.createdUsers.length, 1)
        assert.equal(loaded.ensure('mes_employee_accounts').length, 1)
    })

    await test('getEmployeeAccounts / listEmployeeAccounts：按 uid 关联账号并返回 account', async () => {
        const loaded = load({})
        await loaded.module.createEmployeeAccount.call(loaded.admin, { employeeNo: '123456', account: 'zhangsan', name: '张三', idCard: ID_A })
        const got = await loaded.module.getEmployeeAccounts.call(loaded.admin, { uids: ['uid:zhangsan'] })
        assert.equal(got.errCode, 0)
        assert.equal(got.rows.length, 1)
        assert.equal(got.rows[0].employeeNo, '123456')
        assert.equal(got.rows[0].account, 'zhangsan')
        const listed = await loaded.module.listEmployeeAccounts.call(loaded.admin, { page: 1, pageSize: 20, keyword: '张三' })
        assert.equal(listed.errCode, 0)
        assert.equal(listed.total, 1)
        assert.equal(listed.rows[0].account, 'zhangsan')
    })

    await test('账号已改（不再等于工号）时：默认预检回读 existing，显式传不同账号才冲突', async () => {
        const loaded = load({
            mes_employee_accounts: [
                { _id: 'emp:uid:u1', employeeNo: '122377', account: '13900000000', name: '王五', idCard: ID_C, uid: 'uid:u1', state: 'ready' }
            ],
            'uni-id-users': [{ _id: 'uid:u1', username: '13900000000', nickname: '王五', status: 0 }]
        })
        const defaulted = await loaded.module.previewEmployeeAccount.call(loaded.admin, { employeeNo: '122377', name: '王五', idCard: ID_C })
        assert.equal(defaulted.state, 'existing')
        assert.equal(defaulted.account, '13900000000')
        const explicit = await loaded.module.previewEmployeeAccount.call(loaded.admin, { employeeNo: '122377', account: 'other-account', name: '王五', idCard: ID_C })
        assert.equal(explicit.state, 'conflict')
        assert.match(explicit.message, /已绑定账号/)
    })

    await test('权限：非管理员不能预检/建号/列表/迁移', async () => {
        const loaded = load({})
        const assertRejected = async fn => {
            try { await fn() } catch (error) { assert.equal(error.errCode, 'EMPLOYEE_ACCOUNT_ERROR'); return }
            assert.fail('应当拒绝非管理员')
        }
        await assertRejected(() => loaded.module.previewEmployeeAccount.call(loaded.guest, { employeeNo: '123456', name: '张三', idCard: ID_A }))
        await assertRejected(() => loaded.module.createEmployeeAccount.call(loaded.guest, { employeeNo: '123456', name: '张三', idCard: ID_A }))
        await assertRejected(() => loaded.module.updateEmployeeAccount.call(loaded.guest, { uid: 'uid:x', name: '张三' }))
        await assertRejected(() => loaded.module.listEmployeeAccounts.call(loaded.guest, {}))
        await assertRejected(() => loaded.module.migrateEmployeeAccountIds.call(loaded.guest, {}))
    })

    await test('迁移：旧 _id=工号 → emp:<uid>/emp:<工号>，写备份、可重复执行', async () => {
        const loaded = load({
            mes_employee_accounts: [
                { _id: '122377', employeeNo: '122377', name: '张三', idCard: ID_A, uid: 'u1', state: 'ready' },
                { _id: '122378', name: '李四', idCard: ID_B, uid: '', state: 'preparing' },
                { _id: 'emp:u9', employeeNo: '122379', name: '王五', idCard: ID_C, uid: 'u9', state: 'ready' }
            ],
            'uni-id-users': [{ _id: 'u1', username: '122377', nickname: '张三', status: 0 }]
        })
        const first = await loaded.module.migrateEmployeeAccountIds.call(loaded.admin, {})
        assert.equal(first.errCode, 0)
        assert.equal(first.migrated, 2)
        assert.equal(first.already, 1)
        assert.equal(first.failed.length, 0)
        const rows = loaded.ensure('mes_employee_accounts')
        const ids = rows.map(row => row._id).sort()
        assert.deepEqual(ids, ['emp:122378', 'emp:u1', 'emp:u9'])
        const migrated = rows.find(row => row._id === 'emp:u1')
        assert.equal(migrated.employeeNo, '122377')
        assert.equal(migrated.account, '122377')
        const backups = loaded.ensure('mes_employee_account_backups')
        assert.equal(backups.length, 2)
        assert.ok(backups.some(row => row._id === 'backup:122377' && row.newId === 'emp:u1'))
        assert.equal(backups.find(row => row.oldId === '122377').snapshot.employeeNo, '122377')
        assert.equal(first.planned, 2)
        assert.deepEqual(first.plan.map(item => item.action).sort(), ['move', 'move'])
        assert.deepEqual(first.plan.map(item => item.oldId).sort(), ['122377', '122378'])
        assert.ok(first.plan.every(item => item.targetExists === false && item.newId && item.employeeNo))
        const second = await loaded.module.migrateEmployeeAccountIds.call(loaded.admin, {})
        assert.equal(second.migrated, 0)
        assert.equal(second.already, 3)
        assert.equal(second.planned, 0)
        assert.equal(loaded.ensure('mes_employee_accounts').length, 3)
    })

    await test('迁移：dryRun 只出计划不写库；中断后可按备份恢复', async () => {
        const loaded = load({
            mes_employee_accounts: [{ _id: '122377', employeeNo: '122377', name: '张三', idCard: ID_A, uid: 'u1', state: 'ready' }]
        })
        const dry = await loaded.module.migrateEmployeeAccountIds.call(loaded.admin, { dryRun: true })
        assert.equal(dry.dryRun, true)
        assert.equal(dry.plan.length, 1)
        assert.equal(dry.planned, 1)
        assert.deepEqual(dry.plan[0], { oldId: '122377', newId: 'emp:u1', employeeNo: '122377', uid: 'u1', targetExists: false, action: 'move' })
        assert.equal(loaded.ensure('mes_employee_accounts')[0]._id, '122377')
        assert.equal(loaded.ensure('mes_employee_account_backups').length, 0)
        // 模拟「备份已写、旧档已删、新档未写」的中断状态
        loaded.ensure('mes_employee_account_backups').push({
            _id: 'backup:122377', oldId: '122377', newId: 'emp:u1', employeeNo: '122377', uid: 'u1',
            snapshot: { _id: '122377', employeeNo: '122377', name: '张三', idCard: ID_A, uid: 'u1', state: 'ready' },
            at: Date.now(), by: 'admin'
        })
        loaded.ensure('mes_employee_accounts').splice(0, 1)
        const recovered = await loaded.module.migrateEmployeeAccountIds.call(loaded.admin, {})
        assert.equal(recovered.recovered, 1)
        assert.ok(recovered.plan.some(item => item.action === 'recover' && item.oldId === '122377' && item.newId === 'emp:u1'))
        assert.equal(loaded.ensure('mes_employee_accounts')[0]._id, 'emp:u1')
    })

    await test('迁移计划：目标已存在标记 targetExists、缺工号标记 skip', async () => {
        const loaded = load({
            mes_employee_accounts: [
                { _id: '122390', employeeNo: '122390', name: '旧档', idCard: ID_A, uid: 'u3', state: 'ready' },
                { _id: 'emp:u3', employeeNo: '122390', name: '旧档', idCard: ID_A, uid: 'u3', state: 'ready' },
                { _id: 'broken', uid: 'u4', state: 'preparing' }
            ]
        })
        const dry = await loaded.module.migrateEmployeeAccountIds.call(loaded.admin, { dryRun: true })
        const existing = dry.plan.find(item => item.oldId === '122390')
        assert.equal(existing.action, 'delete-old')
        assert.equal(existing.targetExists, true)
        assert.equal(existing.newId, 'emp:u3')
        const broken = dry.plan.find(item => item.oldId === 'broken')
        assert.equal(broken.action, 'skip')
        assert.match(broken.reason, /缺少工号/)
        assert.equal(dry.failed.length, 1)
    })

    /** 建两个员工，供修改接口用例复用。 */
    async function seedTwo(loaded) {
        await loaded.module.createEmployeeAccount.call(loaded.admin, { employeeNo: '123456', account: 'zhangsan', name: '张三', idCard: ID_A })
        await loaded.module.createEmployeeAccount.call(loaded.admin, { employeeNo: '123457', account: 'lisi', name: '李四', idCard: ID_B })
        return loaded
    }

    await test('update：改工号成功（登录账号不动、_id 不动）', async () => {
        const loaded = await seedTwo(load({}))
        const before = loaded.ensure('mes_employee_accounts').find(row => row.uid === 'uid:zhangsan')
        const result = await loaded.module.updateEmployeeAccount.call(loaded.admin, { uid: 'uid:zhangsan', employeeNo: '654321' })
        assert.equal(result.errCode, 0)
        assert.deepEqual(result.changed, ['employeeNo'])
        assert.equal(result.employee.employeeNo, '654321')
        assert.equal(result.employee.account, 'zhangsan')
        const after = loaded.ensure('mes_employee_accounts').find(row => row.uid === 'uid:zhangsan')
        assert.equal(after._id, before._id, '稳定 id 不随工号变化')
        assert.equal(after.employeeNo, '654321')
        assert.equal(loaded.ensure('uni-id-users').find(row => row._id === 'uid:zhangsan').username, 'zhangsan')
    })

    await test('update：改账号成功，uni-id username 同步、密码不变、档案 account 镜像', async () => {
        const loaded = await seedTwo(load({}))
        const result = await loaded.module.updateEmployeeAccount.call(loaded.admin, { uid: 'uid:zhangsan', account: 'zhang.san01' })
        assert.equal(result.errCode, 0)
        assert.deepEqual(result.changed, ['account'])
        assert.equal(result.employee.account, 'zhang.san01')
        const user = loaded.ensure('uni-id-users').find(row => row._id === 'uid:zhangsan')
        assert.equal(user.username, 'zhang.san01')
        const profile = loaded.ensure('mes_employee_accounts').find(row => row.uid === 'uid:zhangsan')
        assert.equal(profile.account, 'zhang.san01')
        assert.equal(loaded.updatedUsers.length, 1)
        assert.deepEqual(Object.keys(loaded.updatedUsers[0]).sort(), ['uid', 'username'])
        assert.equal(loaded.updatedUsers[0].password, undefined)
    })

    await test('update：工号/账号冲突返回可读错误', async () => {
        const loaded = await seedTwo(load({}))
        const sameNo = await loaded.module.updateEmployeeAccount.call(loaded.admin, { uid: 'uid:zhangsan', employeeNo: '123457' }).catch(error => error)
        assert.equal(sameNo.errCode, 'EMPLOYEE_ACCOUNT_ERROR')
        assert.match(sameNo.errMsg, /工号已被其他员工使用/)
        const sameAccount = await loaded.module.updateEmployeeAccount.call(loaded.admin, { uid: 'uid:zhangsan', account: 'lisi' }).catch(error => error)
        assert.equal(sameAccount.errCode, 'EMPLOYEE_ACCOUNT_ERROR')
        assert.match(sameAccount.errMsg, /登录账号已被其他账号使用/)
    })

    await test('update：管理员保护（不能改管理员档案、不能改成管理员账号）', async () => {
        const state = seedTwo(load({}))
        const two = await state
        const adminProfile = { _id: 'emp:uid:admin', employeeNo: '122400', account: 'boss', name: '管理员', idCard: ID_C, uid: 'uid:admin', state: 'ready' }
        two.ensure('mes_employee_accounts').push(adminProfile)
        two.ensure('uni-id-users').push({ _id: 'uid:admin', username: 'boss', nickname: '管理员', status: 0, role: ['admin'] })
        const targetAdmin = await two.module.updateEmployeeAccount.call(two.admin, { uid: 'uid:admin', name: '改名' }).catch(error => error)
        assert.equal(targetAdmin.errCode, 'EMPLOYEE_ACCOUNT_ERROR')
        assert.match(targetAdmin.errMsg, /不能修改管理员账号/)
        const toAdmin = await two.module.updateEmployeeAccount.call(two.admin, { uid: 'uid:zhangsan', account: 'boss' }).catch(error => error)
        assert.equal(toAdmin.errCode, 'EMPLOYEE_ACCOUNT_ERROR')
        assert.match(toAdmin.errMsg, /管理员账号/)
    })

    await test('update：未传字段不变；只传一个字段；可用工号定位', async () => {
        const loaded = await seedTwo(load({}))
        const before = { ...loaded.ensure('mes_employee_accounts').find(row => row.uid === 'uid:zhangsan') }
        const named = await loaded.module.updateEmployeeAccount.call(loaded.admin, { uid: 'uid:zhangsan', name: '张三丰' })
        assert.deepEqual(named.changed, ['name'])
        assert.equal(named.employee.name, '张三丰')
        const after = loaded.ensure('mes_employee_accounts').find(row => row.uid === 'uid:zhangsan')
        assert.equal(after.employeeNo, before.employeeNo)
        assert.equal(after.account, before.account)
        assert.equal(after.idCard, before.idCard)
        const located = await loaded.module.updateEmployeeAccount.call(loaded.admin, { employeeNo: '123457', name: '李四改' })
        assert.equal(located.errCode, 0)
        assert.deepEqual(located.changed, ['name'])
        assert.equal(located.employee.employeeNo, '123457')
        const noop = await loaded.module.updateEmployeeAccount.call(loaded.admin, { uid: 'uid:zhangsan' })
        assert.deepEqual(noop.changed, [])
    })

    await test('update：档案写入失败会回滚登录账号', async () => {
        const loaded = await seedTwo(load({}))
        const profile = loaded.ensure('mes_employee_accounts').find(row => row.uid === 'uid:zhangsan')
        loaded.failures['mes_employee_accounts:' + profile._id] = true
        const failed = await loaded.module.updateEmployeeAccount.call(loaded.admin, { uid: 'uid:zhangsan', account: 'zhang.san02' }).catch(error => error)
        assert.equal(failed.errCode, 'EMPLOYEE_ACCOUNT_ERROR')
        assert.match(failed.errMsg, /员工档案更新失败/)
        const user = loaded.ensure('uni-id-users').find(row => row._id === 'uid:zhangsan')
        assert.equal(user.username, 'zhangsan', '登录账号应回滚到原值')
        assert.equal(loaded.updatedUsers.length, 2)
        assert.equal(loaded.updatedUsers[1].username, 'zhangsan')
    })

    console.log('\n' + passed + ' passed, ' + failed + ' failed')
    process.exit(failed ? 1 : 0)
})()
