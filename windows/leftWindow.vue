<template>
  <scroll-view class="sidebar" scroll-y="true">
    <uni-data-menu
      ref="menu"
      :value="currentMenu"
      :staticMenu="staticMenu"
      :menuTransform="mergeAdminMenus"
      collection="opendb-admin-menus"
      :page-size="500"
      :field="field"
      :where="menuWhere"
      orderby="sort asc"
      active-text-color="#006A62"
      active-background-color="#E6F2ED"
      @select="select"
    >
    </uni-data-menu>
  </scroll-view>
</template>

<script setup>
  import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue';
  import { store as uniIdStore } from '@/uni_modules/uni-id-pages/common/store.js';
  import config from '@/admin.config.js';
  import { mergeAdminMenus } from '@/utils/admin-menu.js';

  const { proxy } = getCurrentInstance();
  const menu = ref(null);
  const staticMenu = config.sideBar.staticMenu;
  const menuWhere = config.sideBar.cloudMenuWhere || 'enable==true';
  const field = 'url as value, name as text, menu_id, parent_id, sort, icon, permission';
  const currentMenu = ref('/');
  const userInfo = computed(() => uniIdStore.userInfo);

  const clickMenuItem = (targetUrl) => {
    let url = targetUrl;
    // #ifdef H5
    if (url.indexOf('http') === 0) return window.open(url);
    // #endif

    if (url[0] !== '/' && url.indexOf('http') !== 0) url = '/' + url;
    // #ifndef H5
    if (url === '/') url = config.index.url;
    // #endif
    uni.redirectTo({
      url,
      fail: () => {
        uni.showModal({
          title: '提示',
          content: '页面 ' + url + ' 跳转失败',
          showCancel: false,
        });
      },
    });
  };

  const select = (event) => {
    if (!event.value) return;
    clickMenuItem(event.value);
    // #ifdef H5
    uni.hideLeftWindow();
    // #endif
  };

  // #ifdef H5
  watch(
    () => proxy.$route,
    (route) => {
      if (route && route.fullPath) currentMenu.value = route.fullPath;
    },
    { immediate: true }
  );
  // #endif

  watch(userInfo, (value) => {
    if (value) {
      nextTick(() => {
        if (menu.value) menu.value.load();
      });
    }
  });
</script>

<style lang="scss">
  .sidebar {
    position: fixed;
    // top: var(--top-window-height); // useless
    width: 240px;
    height: calc(100vh - (var(--top-window-height)));
    box-sizing: border-box;
    border-right: 1px solid $uni-border-color;
    background-color: #fff;
    padding: 12px 10px 24px;
  }
  .sidebar .uni-nav-menu {
    width: 100%;
    font-size: 13px;
  }
  .sidebar .uni-menu-item,
  .sidebar .uni-sub-menu__title {
    min-height: 42px;
    height: auto;
    line-height: 1.45;
    padding-top: 10px;
    padding-bottom: 10px;
    padding-right: 12px;
    margin: 3px 0;
    border-radius: 7px;
    box-sizing: border-box;
  }
  .sidebar .uni-menu-item .menu-label,
  .sidebar .uni-sub-menu .menu-label {
    min-width: 0;
    white-space: normal;
  }
  .sidebar .uni-menu-item:hover,
  .sidebar .uni-sub-menu__title:hover {
    background: #F1F5F3;
  }
  .sidebar .uni-menu-item.is-active {
    font-weight: 600;
  }
  .sidebar .uni-sub-menu__content {
    background: #fff !important;
  }
  .sidebar .uni-sub-menu.is-open > .uni-sub-menu__title {
    font-weight: 600;
  }
  .sidebar .uni-sub-menu__title-sub {
    color: $uni-text-color !important;
  }
  .sidebar .sidebar-item-icon {
    display: block;
    width: 18px;
    flex-shrink: 0;
    font-size: 16px;
  }
  .sidebar .uni-menu-item:focus-visible,
  .sidebar .uni-sub-menu__title:focus-visible {
    outline: 2px solid $uni-color-primary;
    outline-offset: -2px;
  }
  /* #ifdef H5 */
  .sidebar ::-webkit-scrollbar {
    display: none;
    // scrollbar-width: thin;
  }
  /* #endif */

  .sidebar .menu-label {
    margin-left: 9px;
  }
</style>
