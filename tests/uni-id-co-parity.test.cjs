// 两份 uni-id-co 副本一致性（node 运行：node tests/uni-id-co-parity.test.cjs）
// mes-uniapp 与 mes-uniadmin 各有一份 uni-id-pages；定制过的文件必须逐字节一致，否则部署后会行为分叉。
// 另外确认已下线的账号迁移模块不再出现在任一副本里。

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SIBLING = path.resolve(ROOT, '..', 'mes-uniapp')
const ADMIN_BASE = path.join(ROOT, 'uni_modules/uni-id-pages/uniCloud/cloudfunctions/uni-id-co')
const UNIAPP_BASE = path.join(SIBLING, 'uni_modules/uni-id-pages/uniCloud/cloudfunctions/uni-id-co')

const FILES = [
  'config/permission.js',
  'index.obj.js',
  'module/admin/add-user.js',
  'module/admin/index.js',
  'module/admin/employee-accounts.js',
  'module/admin/legacy-account-merge.js'
]

let passed = 0, failed = 0
async function test(name, fn) {
    try { await fn(); passed++; console.log('  ✓ ' + name) }
    catch (error) { failed++; console.error('  ✗ ' + name); console.error('    ' + (error && error.message || error)); }
}

;(async () => {
    console.log('\nuni-id-co 两份副本一致性')

    await test('定制文件在两个工程中逐字节一致', async () => {
        for (const file of FILES) {
            const adminFile = path.join(ADMIN_BASE, file)
            const uniappFile = path.join(UNIAPP_BASE, file)
            assert.ok(fs.existsSync(adminFile), 'mes-uniadmin 缺少 ' + file)
            assert.ok(fs.existsSync(uniappFile), 'mes-uniapp 缺少 ' + file)
            const admin = fs.readFileSync(adminFile)
            const uniapp = fs.readFileSync(uniappFile)
            assert.equal(admin.equals(uniapp), true, file + ' 两份内容不一致')
        }
    })

    await test('账号迁移模块已从两份副本删除（含 index.js 注册）', async () => {
        for (const base of [ADMIN_BASE, UNIAPP_BASE]) {
            assert.equal(fs.existsSync(path.join(base, 'module/admin/account-migration.js')), false)
            const index = fs.readFileSync(path.join(base, 'module/admin/index.js'), 'utf8')
            assert.equal(index.includes('account-migration'), false)
        }
    })

    await test('新员工账号接口已注册（云对象导出 + 管理员权限）', async () => {
        for (const base of [ADMIN_BASE, UNIAPP_BASE]) {
            const obj = fs.readFileSync(path.join(base, 'index.obj.js'), 'utf8')
            assert.match(obj, /updateEmployeeAccount/)
            assert.match(obj, /listEmployeeAccounts/)
            assert.match(obj, /migrateEmployeeAccountIds/)
            const permission = fs.readFileSync(path.join(base, 'config/permission.js'), 'utf8')
            assert.match(permission, /updateEmployeeAccount: \{ role: \['admin'\] \}/)
            assert.match(permission, /listEmployeeAccounts: \{ role: \['admin'\] \}/)
            assert.match(permission, /migrateEmployeeAccountIds: \{ role: \['admin'\] \}/)
        }
    })

    console.log('\n' + passed + ' passed, ' + failed + ' failed')
    process.exit(failed ? 1 : 0)
})()
