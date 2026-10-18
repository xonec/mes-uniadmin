<template>
  <MesRecordEditor
    ref="editor"
    kind="orders"
    :record-key="recordKey"
    embedded
    show-plan-fields
    @saved="$emit('saved', $event)"
    @cancel="$emit('cancel')"
  />
</template>
<script>
import MesRecordEditor from '@/components/mes/MesRecordEditor.vue';

/**
 * 订单表单面板：抽屉内复用 MesRecordEditor 的订单表单（embedded 模式）。
 * 独立页 /pages/mes/orders/edit 仍用 MesRecordEditor 页模式，产品页行为不受影响。
 */
export default {
  name: 'OrderFormPanel',
  components: { MesRecordEditor },
  props: { recordKey: { type: String, default: '' } },
  emits: ['saved', 'cancel'],
  methods: {
    /** 供抽屉底部按钮需要时程序化保存（当前保存按钮在表单内，保留接口以便联调计划时间字段）。 */
    save() { return this.$refs.editor && this.$refs.editor.save(); }
  }
};
</script>
