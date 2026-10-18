import { ADMIN_MENU } from '@/utils/admin-menu.js';

export default {
  login: {
    url: '/uni_modules/uni-id-pages/pages/login/login-withpwd', // 登录页面路径
  },
  index: {
    url: '/pages/mes/operations/dashboard', // 登录后进入工作台
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
    // 业务入口与已授权的云端系统入口合并展示。
    staticMenu: ADMIN_MENU,
  },
  uniStat: {},
};
