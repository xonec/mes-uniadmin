import * as uniIdPagesStore from '@/uni_modules/uni-id-pages/common/store';
import { callMes } from '@/utils/mes-api.js';
export default {
  namespaced: true,
  state: {},
  mutations: {},
  actions: {
    async getUserInfo() {
      const userInfo = await callMes('user-admin', 'profile');
      uniIdPagesStore.mutations.setUserInfo(userInfo, { cover: true });
      return userInfo;
    },
  },
};
