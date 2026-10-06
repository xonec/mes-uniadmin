export default {
  login: {
    url: '/uni_modules/uni-id-pages/pages/login/login-withpwd', // 登录页面路径
  },
  index: {
    url: '/pages/mes/products/list', // 登录后进入产品物料管理
  },
  error: {
    url: '/pages/error/404', // 404 Not Found 错误页面路径
  },
  navBar: {
    // 顶部导航
    title: '生产管理后台',
    logo: '/static/logo.png', // 左侧 Logo
    langs: [{ text: '中文简体', lang: 'zh-Hans' }],
    themes: [
      {
        text: '默认',
        value: 'default',
      },
      {
        text: '绿柔',
        value: 'green',
      },
    ],
    debug: {
      enable: process.env.NODE_ENV !== 'production', //是否显示错误信息
      engine: [
        {
          // 搜索引擎配置（每条错误信息后，会自动生成搜索链接，点击后跳转至搜索引擎）
          name: '百度',
          url: 'https://www.baidu.com/baidu?wd=ERR_MSG',
        },
        {
          name: '谷歌',
          url: 'https://www.google.com/search?q=ERR_MSG',
        },
      ],
    },
  },
  sideBar: {
    // 左侧菜单
    cloudMenuWhere: "enable==true && (menu_id=='system_management' || menu_id=='system_user' || menu_id=='system_role' || menu_id=='system_permission' || menu_id=='system_menu' || menu_id=='system_app' || menu_id=='system_update' || menu_id=='safety_statistics' || menu_id=='safety_statistics_user_log')",
    // 业务菜单优先展示，系统菜单继续按原有权限过滤
    staticMenu: [
      {
        menu_id: 'mes', text: 'MES 业务管理', icon: 'admin-icons-fl-xitong', url: '',
        children: [
          { menu_id: 'mes-products', text: '产品物料 / BOM', icon: 'admin-icons-table', value: '/pages/mes/products/list' },
          { menu_id: 'mes-orders', text: '生产订单', icon: 'admin-icons-table', value: '/pages/mes/orders/list' },
          { menu_id: 'mes-packaging', text: '客户与包装方案', icon: 'admin-icons-table', value: '/pages/mes/packaging/manage' },
          { menu_id: 'mes-trace', text: '批号追溯', icon: 'admin-icons-table', value: '/pages/mes/orders/trace' },
          { menu_id: 'mes-ocr', text: 'OCR 配置', icon: 'admin-icons-setting', value: '/pages/mes/ocr/config' }
        ]
      },

    ],
  },
  uniStat: {},
};
