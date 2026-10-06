<template><MesRecordList ref="records" kind="products" /></template>
<script>
import MesRecordList from '@/components/mes/MesRecordList.vue';
export default { components: { MesRecordList }, onShow() { if (this.$refs.records) this.$refs.records.reload(); } };
</script>
