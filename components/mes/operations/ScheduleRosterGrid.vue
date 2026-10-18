<template>
  <view class="roster-scroll">
    <view v-if="!groups.length" class="roster-empty">当天暂无排班</view>
    <view v-else class="roster-grid">
      <view class="roster-row roster-heading"><text>工序名称</text><text>批次</text><text>早班人员</text><text>中班人员</text><text>晚班人员</text><text>备注</text></view>
      <view v-for="group in groups" :key="group.id" class="roster-row">
        <view class="roster-process">{{ group.processName }}</view>
        <view class="roster-batches"><template v-if="batchLinks"><button v-for="batch in group.batches" :key="batch" class="roster-batch" size="mini" :disabled="disabled" @click.stop="$emit('batch', batch)">{{ batch }}</button><text v-if="!group.batches.length" class="roster-muted">—</text></template><template v-else><text v-for="batch in group.batches" :key="batch">{{ batch }}</text><text v-if="!group.batches.length" class="roster-muted">—</text></template></view>
        <view v-if="group.id.startsWith('absence:')" class="roster-absence"><button v-for="person in group.slots.early" :key="person.id" class="roster-person" size="mini" :disabled="disabled" @click="$emit('select', person)">{{ person.name }}</button><text class="roster-muted">{{ group.processName }} · 0 小时</text></view>
        <template v-else><view v-for="slot in ['early', 'middle', 'late']" :key="slot" class="roster-people"><button v-for="person in group.slots[slot]" :key="person.id" class="roster-person" :class="{ 'has-issue': hasIssue(person) }" size="mini" :disabled="disabled" :title="period(person.record)" @click="$emit('select', person)">{{ person.name }}</button><text v-if="!group.slots[slot].length" class="roster-muted">—</text></view></template>
        <view class="roster-notes"><text v-for="note in group.notes" :key="note">{{ note }}</text><text v-if="!group.notes.length" class="roster-muted">—</text></view>
      </view>
    </view>
  </view>
</template>
<script>
import { shiftTimeLabel } from '@/utils/shift-presets.js';
export default {
  props: { groups: { type: Array, default: () => [] }, disabled: { type: Boolean, default: false }, batchLinks: { type: Boolean, default: false } },
  emits: ['select', 'batch'],
  methods: {
    period: shiftTimeLabel,
    hasIssue(person) { const row = person.source; return !!(row.error || row.batchError || row.requiresPersonSelection && !row.record.personId || row.needsTimeReview && !row.timeReviewed); }
  }
};
</script>
<style lang="scss" scoped>
.roster-scroll { overflow-x: auto; margin-top: .9rem; border: 1px solid $uni-border-color; border-radius: .45rem; }
.roster-grid { min-width: 58rem; font-size: .8rem; }
.roster-row { display: grid; grid-template-columns: minmax(9rem, 1fr) minmax(9rem, 1fr) repeat(3, minmax(10rem, 1.25fr)) minmax(12rem, 1.4fr); border-bottom: 1px solid $uni-border-color; }
.roster-row:last-child { border-bottom: 0; }
.roster-row > view, .roster-heading > text { min-width: 0; padding: .65rem .7rem; border-right: 1px solid $uni-border-color; line-height: 1.65; overflow-wrap: anywhere; }
.roster-row > :last-child { border-right: 0; }
.roster-heading { background: $uni-bg-color-grey; color: $uni-text-color-grey; font-weight: 600; }
.roster-process { font-weight: 600; }
.roster-row:hover { background: rgba($uni-color-primary, .025); }
.roster-people, .roster-absence { display: flex; flex-wrap: wrap; align-content: flex-start; align-items: center; gap: .3rem; }
.roster-absence { grid-column: span 3; }
.roster-person { margin: 0; padding: .05rem .4rem; background: $uni-bg-color-grey; color: $uni-text-color; font-size: .75rem; line-height: 1.8; border: 1px solid transparent; }
.roster-person::after { border: 0; }
.roster-person:hover, .roster-person:focus-visible { border-color: $uni-color-primary; color: $uni-color-primary; outline: 0; }
.roster-person.has-issue { border-color: $uni-color-warning; color: darken($uni-color-warning, 22%); background: rgba($uni-color-warning, .08); }
.roster-batches, .roster-notes { display: flex; flex-direction: column; gap: .3rem; }
.roster-batches > text:not(.roster-muted) { font-family: ui-monospace, monospace; font-size: .72rem; color: $uni-color-primary; background: rgba($uni-color-primary, .07); border-radius: .2rem; padding: .1rem .35rem; }
.roster-batch { align-self: flex-start; margin: 0; padding: .05rem .4rem; font-family: ui-monospace, monospace; font-size: .72rem; line-height: 1.8; color: $uni-color-primary; background: rgba($uni-color-primary, .07); border: 1px solid transparent; }
.roster-batch::after { border: 0; }
.roster-batch:hover, .roster-batch:focus-visible { border-color: $uni-color-primary; text-decoration: underline; outline: 0; }
.roster-notes { white-space: pre-wrap; color: $uni-text-color-grey; font-size: .75rem; }
.roster-muted, .roster-empty { color: $uni-text-color-grey; }
.roster-empty { text-align: center; padding: 2.8rem 1rem; font-size: .85rem; }
</style>
