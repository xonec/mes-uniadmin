<template>
  <view class="gantt">
    <view v-if="loading" class="gantt-loading">加载中…</view>
    <view class="gantt-toolbar">
      <text class="gantt-range">{{ rangeLabel }}</text>
      <view class="gantt-toolbar-actions">
        <text class="gantt-legend"><text class="gantt-dot gantt-dot--confirmed" />已确认<text class="gantt-dot gantt-dot--draft" />草稿</text>
        <button v-if="todayLeft !== null" size="mini" @click="scrollToToday">定位今天</button>
      </view>
    </view>
    <view v-if="!rows.length" class="gantt-empty">暂无订单。<text class="gantt-empty-hint">先在列表视图新增订单，再填写计划起止时间。</text></view>
    <view v-else-if="!scheduledRows.length" class="gantt-empty">还没有订单填写计划起止时间。<text class="gantt-empty-hint">填写后横条会按 计划开始 → 计划结束 显示在这里。</text></view>
    <view v-else class="gantt-scroll" ref="scroller">
      <view class="gantt-header">
        <view class="gantt-label gantt-label--head">
          <text class="gantt-label-title">订单 / 产品</text>
        </view>
        <view class="gantt-track gantt-track--head" :style="{ width: totalWidth + 'px' }">
          <view class="gantt-months">
            <view v-for="band in monthBands" :key="band.key" class="gantt-month" :style="{ left: band.left + 'px', width: band.width + 'px' }">{{ band.label }}</view>
          </view>
          <view class="gantt-ticks">
            <view v-for="tick in ticks" :key="tick.key" class="gantt-tick" :class="{ 'is-weekend': tick.weekend, 'is-major': tick.major }" :style="{ left: tick.left + 'px', width: tick.width + 'px' }"><text class="gantt-tick-label">{{ tick.label }}</text></view>
          </view>
          <view v-if="todayLeft !== null" class="gantt-today gantt-today--head" :style="{ left: todayLeft + 'px' }" />
        </view>
      </view>

      <view
        v-for="row in scheduledRows"
        :key="row.orderNo"
        class="gantt-row"
        @click="$emit('open', row)"
      >
        <view class="gantt-label">
          <view class="gantt-label-line">
            <text class="gantt-order">{{ row.orderNo }}</text>
            <OrderStatusTag :status="row.orderStatus" :enabled="row.enabled !== false" />
          </view>
          <text class="gantt-product">{{ row.productName || '—' }}</text>
          <text class="gantt-meta">{{ row.batchNo || '—' }} · {{ barRange(row) }}</text>
        </view>
        <view class="gantt-track" :style="{ width: totalWidth + 'px' }">
          <view class="gantt-grid">
            <view v-for="tick in ticks" :key="tick.key" class="gantt-grid-cell" :class="{ 'is-weekend': tick.weekend, 'is-major': tick.major }" :style="{ left: tick.left + 'px', width: tick.width + 'px' }" />
          </view>
          <view class="gantt-bar" :class="'gantt-bar--' + tone(row)" :style="{ left: barLeft(row) + 'px', width: barWidth(row) + 'px' }" :title="barTitle(row)">
            <text v-if="barWidth(row) >= 78" class="gantt-bar-text">{{ row.orderNo }}</text>
          </view>
          <view v-if="todayLeft !== null" class="gantt-today" :style="{ left: todayLeft + 'px' }" />
        </view>
      </view>
    </view>

    <view v-if="rows.length" class="gantt-unscheduled">
      <view class="gantt-unscheduled-head">
        <text class="gantt-unscheduled-title">未排期</text>
        <text class="gantt-unscheduled-count">{{ unscheduledRows.length }} 单</text>
        <text class="gantt-unscheduled-hint">缺少计划起止时间的订单，点击可打开抽屉补填计划时间。</text>
      </view>
      <view v-if="unscheduledRows.length" class="gantt-chips">
        <view v-for="row in unscheduledRows" :key="row.orderNo" class="gantt-chip" @click="$emit('open', row)">
          <OrderStatusTag :status="row.orderStatus" :enabled="row.enabled !== false" />
          <text class="gantt-chip-order">{{ row.orderNo }}</text>
          <text class="gantt-chip-name">{{ row.productName || '—' }}</text>
        </view>
      </view>
      <text v-else class="gantt-none">全部订单都已排期。</text>
    </view>
  </view>
</template>
<script>
import OrderStatusTag from './OrderStatusTag.vue';

const DAY = 86400000;
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

/** 订单级甘特：一条横条 = 一张订单的 planStartAt → planEndAt，纯 CSS 定位，无外部依赖。 */
export default {
  name: 'OrderGantt',
  components: { OrderStatusTag },
  props: {
    rows: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
  },
  emits: ['open'],
  data() { return { dayWidth: 44, scale: 'day' }; },
  computed: {
    scheduledRows() {
      return this.rows.filter(row => this.validRange(row)).sort((a, b) => a.planStartAt - b.planStartAt);
    },
    unscheduledRows() {
      return this.rows.filter(row => !this.validRange(row));
    },
    bounds() {
      const starts = this.scheduledRows.map(row => row.planStartAt);
      const ends = this.scheduledRows.map(row => row.planEndAt);
      const today = this.startOfDay(Date.now());
      if (!starts.length) return { start: this.startOfDay(today - 3 * DAY), end: this.startOfDay(today + 10 * DAY) };
      const start = this.startOfDay(Math.min(...starts));
      const end = this.startOfDay(Math.max(...ends)) + DAY;
      return { start, end };
    },
    spanDays() { return Math.max(1, Math.round((this.bounds.end - this.bounds.start) / DAY)); },
    totalWidth() { return Math.max(720, this.spanDays * this.dayWidth); },
    ticks() {
      const list = [];
      for (let index = 0; index < this.spanDays; index++) {
        const day = this.bounds.start + index * DAY;
        const date = new Date(day);
        const weekStart = date.getDay() === 1;
        list.push({
          key: 'day-' + index,
          label: !weekStart && this.scale === 'week' ? '' : this.pad(date.getMonth() + 1) + '/' + this.pad(date.getDate()),
          left: index * this.dayWidth,
          width: Math.min(this.dayWidth, this.totalWidth - index * this.dayWidth),
          weekend: date.getDay() === 0 || date.getDay() === 6,
          major: this.scale === 'week' ? weekStart : index === 0
        });
      }
      return list;
    },
    monthBands() {
      const bands = [];
      const end = this.bounds.end;
      let cursor = new Date(this.bounds.start);
      let index = 0;
      while (cursor.getTime() < end && index < 62) {
        const year = cursor.getFullYear(), month = cursor.getMonth();
        const monthStart = new Date(year, month, 1).getTime();
        const nextMonth = new Date(year, month + 1, 1).getTime();
        const from = Math.max(this.bounds.start, monthStart);
        const to = Math.min(end, nextMonth);
        bands.push({
          key: 'month-' + month,
          label: year + ' 年 ' + (month + 1) + ' 月',
          left: ((from - this.bounds.start) / DAY) * this.dayWidth,
          width: ((to - from) / DAY) * this.dayWidth
        });
        cursor = new Date(year, month + 1, 1);
        index++;
      }
      return bands;
    },
    rangeLabel() {
      if (!this.scheduledRows.length) return '暂无排期订单';
      return this.monthDay(this.bounds.start) + ' — ' + this.monthDay(this.bounds.end - DAY) + ' · ' + this.scaleLabel;
    },
    scaleLabel() { return this.scale === 'week' ? '周刻度' : '日刻度'; },
    todayLeft() {
      const today = this.startOfDay(Date.now());
      if (today < this.bounds.start || today >= this.bounds.end) return null;
      return ((today - this.bounds.start) / DAY) * this.dayWidth;
    }
  },
  watch: {
    spanDays: {
      immediate: true,
      handler(days) {
        this.scale = days > 45 ? 'week' : 'day';
        this.dayWidth = days > 45 ? Math.max(26, Math.min(44, Math.round(900 / days))) : 44;
      }
    }
  },
  mounted() { this.$nextTick(this.scrollToToday); },
  methods: {
    pad(value) { return String(value).padStart(2, '0'); },
    startOfDay(value) { const date = new Date(value); date.setHours(0, 0, 0, 0); return date.getTime(); },
    monthDay(value) { const date = new Date(value); return date.getFullYear() + '-' + this.pad(date.getMonth() + 1) + '-' + this.pad(date.getDate()); },
    validRange(row) {
      const start = Number(row.planStartAt), end = Number(row.planEndAt);
      return Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > start;
    },
    tone(row) {
      if (row.enabled === false) return 'disabled';
      return row.orderStatus === 'confirmed' ? 'confirmed' : 'draft';
    },
    barLeft(row) { return ((row.planStartAt - this.bounds.start) / DAY) * this.dayWidth; },
    barWidth(row) { return Math.max(6, ((row.planEndAt - row.planStartAt) / DAY) * this.dayWidth); },
    barRange(row) { return this.monthDay(row.planStartAt) + ' → ' + this.monthDay(row.planEndAt); },
    barTitle(row) { return row.orderNo + ' ' + this.barRange(row) + ' · ' + (this.tone(row) === 'confirmed' ? '已确认' : this.tone(row) === 'disabled' ? '已停用' : '草稿'); },
    scrollToToday() {
      // #ifdef H5
      const scroller = this.$refs.scroller && this.$refs.scroller.$el ? this.$refs.scroller.$el : this.$refs.scroller;
      const node = scroller && (scroller.$el || scroller);
      if (!node) return;
      const target = this.todayLeft;
      if (target != null) node.scrollLeft = Math.max(0, target - node.clientWidth / 2);
      // #endif
    }
  }
};
</script>
<style lang="scss" scoped>
@import '@/common/mes.scss';
.gantt { border: 1px solid $uni-border-color; border-radius: .5rem; background: $uni-bg-color; overflow: hidden; }
.gantt-loading { padding: .8rem 1rem; color: $uni-text-color-grey; font-size: .8rem; }
.gantt-toolbar { display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding: .7rem 1rem; border-bottom: 1px solid $uni-border-color; background: $uni-bg-color-grey; }
.gantt-range { font-size: .8rem; color: $uni-text-color-grey; }
.gantt-toolbar-actions { display: flex; align-items: center; gap: .8rem; }
.gantt-toolbar-actions button { margin: 0; }
.gantt-legend { display: inline-flex; align-items: center; gap: .35rem; font-size: .75rem; color: $uni-text-color-grey; }
.gantt-dot { width: .55rem; height: .55rem; border-radius: .12rem; display: inline-block; }
.gantt-dot--confirmed { background: #008577; margin-left: .3rem; }
.gantt-dot--draft { background: #6c8ad6; }
.gantt-scroll { overflow-x: auto; overflow-y: hidden; }
.gantt-header { display: flex; position: sticky; top: 0; z-index: 3; background: $uni-bg-color; border-bottom: 1px solid $uni-border-color; }
.gantt-label { position: sticky; left: 0; z-index: 2; flex: 0 0 16rem; width: 16rem; box-sizing: border-box; padding: .5rem .8rem; background: $uni-bg-color; border-right: 1px solid $uni-border-color; }
.gantt-label--head { background: $uni-bg-color-grey; z-index: 4; }
.gantt-label-title { font-size: .78rem; color: $uni-text-color-grey; }
.gantt-track { position: relative; flex: 0 0 auto; }
.gantt-track--head { height: 3.2rem; background: $uni-bg-color; }
.gantt-months { position: absolute; top: 0; left: 0; right: 0; height: 1.5rem; border-bottom: 1px solid $uni-border-color; }
.gantt-month { position: absolute; top: 0; height: 1.5rem; line-height: 1.5rem; padding-left: .45rem; font-size: .72rem; color: $uni-text-color-grey; border-left: 1px solid $uni-border-color; box-sizing: border-box; white-space: nowrap; overflow: hidden; }
.gantt-ticks { position: absolute; top: 1.5rem; left: 0; right: 0; height: 1.7rem; }
.gantt-tick { position: absolute; top: 0; height: 1.7rem; line-height: 1.7rem; text-align: center; font-size: .68rem; color: $uni-text-color-grey; border-left: 1px solid rgba(0, 0, 0, .04); box-sizing: border-box; }
.gantt-tick.is-weekend { background: rgba(0, 0, 0, .022); }
.gantt-tick.is-major { border-left-color: $uni-border-color; }
.gantt-row { display: flex; align-items: stretch; min-height: 3.6rem; border-bottom: 1px solid rgba(0, 0, 0, .045); cursor: pointer; }
.gantt-row:hover .gantt-label { background: rgba(0, 133, 119, .045); }
.gantt-row:hover .gantt-track { background: rgba(0, 133, 119, .028); }
.gantt-label-line { display: flex; align-items: center; gap: .4rem; }
.gantt-order { font-family: monospace; font-size: .82rem; font-weight: 600; color: $uni-text-color; }
.gantt-product { display: block; font-size: .76rem; color: $uni-text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gantt-meta { display: block; font-size: .7rem; color: $uni-text-color-grey; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gantt-grid { position: absolute; top: 0; bottom: 0; left: 0; right: 0; }
.gantt-grid-cell { position: absolute; top: 0; bottom: 0; border-left: 1px solid rgba(0, 0, 0, .035); box-sizing: border-box; }
.gantt-grid-cell.is-weekend { background: rgba(0, 0, 0, .018); }
.gantt-grid-cell.is-major { border-left-color: rgba(0, 0, 0, .1); }
.gantt-bar { position: absolute; top: 50%; transform: translateY(-50%); height: 1.45rem; border-radius: .28rem; display: flex; align-items: center; padding: 0 .45rem; box-sizing: border-box; overflow: hidden; box-shadow: 0 1px 2px rgba(0, 0, 0, .08); }
.gantt-bar--confirmed { background: #008577; color: #fff; }
.gantt-bar--draft { background: #6c8ad6; color: #fff; }
.gantt-bar--disabled { background: #b9bec7; color: #fff; }
.gantt-bar-text { font-size: .7rem; font-family: monospace; }
.gantt-today { position: absolute; top: 0; bottom: 0; width: 2px; background: #e14545; opacity: .7; z-index: 1; pointer-events: none; }
.gantt-today--head { bottom: auto; height: 3.2rem; }
.gantt-none { padding: .9rem 1rem; color: $uni-text-color-grey; font-size: .8rem; }
.gantt-empty { padding: 2rem 1rem; text-align: center; color: $uni-text-color-grey; }
.gantt-empty-hint { display: block; font-size: .78rem; margin-top: .4rem; }
.gantt-unscheduled { border-top: 1px solid $uni-border-color; padding: .9rem 1rem 1rem; background: #fafbfc; }
.gantt-unscheduled-head { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; margin-bottom: .7rem; }
.gantt-unscheduled-title { font-size: .86rem; font-weight: 650; color: $uni-text-color; }
.gantt-unscheduled-count { font-size: .76rem; color: $uni-color-warning; }
.gantt-unscheduled-hint { font-size: .72rem; color: $uni-text-color-grey; }
.gantt-chips { display: flex; flex-wrap: wrap; gap: .5rem; }
.gantt-chip { display: inline-flex; align-items: center; gap: .4rem; max-width: 22rem; padding: .4rem .6rem; border: 1px solid $uni-border-color; border-radius: .35rem; background: $uni-bg-color; cursor: pointer; }
.gantt-chip:hover { border-color: rgba(0, 133, 119, .5); }
.gantt-chip-order { font-family: monospace; font-size: .78rem; color: $uni-text-color; }
.gantt-chip-name { font-size: .74rem; color: $uni-text-color-grey; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
