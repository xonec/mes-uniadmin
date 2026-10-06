<template><MesRecordEditor v-if="ready" kind="orders" :record-key="recordKey" /></template>
<script>
import MesRecordEditor from '@/components/mes/MesRecordEditor.vue';
export default { components: { MesRecordEditor }, data() { return { ready: false, recordKey: '' }; }, onLoad(options) { this.recordKey = options.key || ''; this.ready = true; } };
</script>
