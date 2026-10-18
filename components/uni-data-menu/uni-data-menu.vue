<template>
  <view>
    <uni-nav-menu :active="activeValue" activeKey="value" :activeTextColor="activeTextColor" :activeBackgroundColor="activeBackgroundColor" :uniqueOpened="uniqueOpened" @select="onSelect">
      <uni-menu-sidebar :data="menuTree"></uni-menu-sidebar>
    </uni-nav-menu>
    <view v-if="menuError" class="menu-load-error"><text>系统菜单读取失败</text><button size="mini" @click="load">重新读取</button></view>
  </view>
</template>

<script setup>
  import { computed, getCurrentInstance, onBeforeMount, ref, watch } from 'vue';
  import { useStore } from 'vuex';
  import { buildMenus } from './util.js';
  import { getMenuLocation, getMenuTrail, menuBreadcrumbs } from '@/utils/admin-menu.js';

  defineOptions({ mixins: [uniCloud.mixinDatacom] });

  const props = defineProps({
    // 当前激活菜单的 url
    value: {
      type: String,
      default: '',
    },
    // 当前激活菜单的文字颜色
    activeTextColor: {
      type: String,
      default: '#42B983',
    },
    activeBackgroundColor: { type: String, default: 'inherit' },
    menuTransform: { type: Function, default: null },
    // 是否只保持一个子菜单的展开
    uniqueOpened: {
      type: Boolean,
      default: false,
    },
    staticMenu: {
      type: Array,
      default() {
        return [];
      },
    },
  });

  const emitEvent = defineEmits(['select', 'input']);
  const store = useStore();
  const { proxy } = getCurrentInstance();
  const userMenu = ref([]);
  const menuError = ref('');
  const menuTree = computed(() => props.menuTransform ? props.menuTransform(props.staticMenu, userMenu.value) : [...props.staticMenu, ...userMenu.value]);
  const currentPath = computed(() => (proxy.$route && proxy.$route.fullPath) || props.value);
  const location = computed(() => getMenuLocation(menuTree.value, currentPath.value));
  const activeValue = computed(() => location.value ? location.value.item.value : props.value);

  const setRoutes = (routes) => store.dispatch('app/setRoutes', routes);
  const hasLocalData = (value) => Array.isArray(value) && value.length > 0;

  const getUserMenu = (menuList) => {
    const { permission = [], role = [] } = uniCloud.getCurrentUserInfo();
    menuList = menuList.map(item => ({ ...item }));
    menuList.forEach((item) => {
      if (!menuList.some((subMenuItem) => subMenuItem.parent_id === item.menu_id)) {
        item.isLeafNode = true;
      }
    });

    if (!role.includes('admin')) {
      menuList = menuList.filter((item) => {
        if (item.isLeafNode) {
          if (item.permission && item.permission.length) {
            return item.permission.some((item) => permission.indexOf(item) > -1);
          }
          return false;
        }
        return true;
      });
    }
    return buildMenus(menuList);
  };

  const onSelect = (menu) => {
    const routes = menuBreadcrumbs(getMenuTrail(menuTree.value, menu.menu_id));
    emitEvent('select', menu, routes);
    emitEvent('input', menu.value);
  };

  const load = () => {
    if (proxy.mixinDatacomLoading === true) return;
    proxy.mixinDatacomLoading = true;
    menuError.value = '';
    return proxy
      .mixinDatacomGet()
      .then((res) => {
        proxy.mixinDatacomLoading = false;
        userMenu.value = getUserMenu(res.result.data);
      })
      .catch((err) => {
        proxy.mixinDatacomLoading = false;
        proxy.mixinDatacomErrorMessage = err;
        menuError.value = err.message || '读取失败';
        userMenu.value = [];
      });
  };

  watch(
    () => proxy.localdata,
    (value) => {
      if (hasLocalData(value)) userMenu.value = value;
    },
    { immediate: true }
  );

  watch(
    location,
    (value) => setRoutes(value ? value.routes : []),
    { immediate: true }
  );

  onBeforeMount(() => {
    if (!hasLocalData(proxy.localdata)) load();
  });

  defineExpose({ load });
</script>

<style lang="scss">
.menu-load-error { padding: 12px; color: $uni-text-color-grey; font-size: 12px; }
.menu-load-error button { display: block; margin: 8px 0 0; font-size: 12px; }
</style>
