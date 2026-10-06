<template>
  <view class="photo-import">
    <view class="photo-heading">{{ purpose === 'bom' ? '从包装指令单录入产品物料' : '从包装指令单录入生产订单' }}</view>
    <view class="photo-note">同一产品或指令单最多 6 张照片，请先选择编码清晰的首页。识别完成后核对所有字段和物料行。</view>
    <view class="photo-note">OCR.space 使用预处理图片提取产品编码；大模型使用所选原图识别完整内容。重复照片自动去重，已有识别结果直接复用。产品基本信息复用档案；订单材料按客户方案或本次单据核对，新产品自动识别；编码未识别时也可主动使用大模型。</view>
    <view class="photo-actions">
      <button size="mini" :disabled="busy || disabled" @click="choose(['camera'])">相机拍照</button>
      <button size="mini" :disabled="busy || disabled" @click="choose(['album'])">相册 / 选择照片</button>
      <button size="mini" v-if="images.length" :disabled="busy || disabled" @click="clearPhotos">清空照片</button>
      <button size="mini" type="primary" :disabled="busy || disabled || !images.length || photosRecognized || needsProductCodeConfirmation" @click="recognize()">{{ recognizing ? '正在识别，请稍候…' : needsProductCodeConfirmation ? '初筛未确认编码' : photosRecognized ? '已识别，请直接核对' : '初筛并识别' }}</button>
      <button v-if="purpose === 'order' && photosRecognized" size="mini" :disabled="busy || disabled" @click="recognize('', true)">完整识别本单（使用模型额度）</button>
    </view>
    <view class="photo-preview" v-if="images.length">
      <image v-for="(image, index) in images" :key="index" :src="image.path" mode="aspectFit" @click="preview(index)" />
    </view>
    <view v-if="error" class="photo-error">{{ error }}</view>
    <view v-if="recognitionMessage" class="photo-note recognition-message">{{ recognitionMessage }}</view>
    <view v-if="recognitionDocument && recognitionDocument.raw_text" class="recognition-transcript">
      <view class="transcript-heading"><text>单据完整识别内容</text><button size="mini" @click="showRawText = !showRawText">{{ showRawText ? '收起' : '展开核对' }}</button></view>
      <text v-if="showRawText" selectable class="transcript-text">{{ recognitionDocument.raw_text }}</text>
    </view>
    <view v-if="needsProductCodeConfirmation" class="code-confirmation">
      <view v-if="canUseModelFallback">
        <button size="mini" type="primary" :disabled="busy || disabled" @click="recognizeWithModel">{{ recognizing ? '大模型识别中…' : '使用大模型识别' }}</button>
        <view class="photo-note">自动提取产品编码、名称、包装规格和材料清单，使用大模型额度；同组照片有缓存时优先复用。</view>
      </view>
      <text class="confirmation-label">确认产品编码 *</text>
      <input v-model="confirmedProductCode" :disabled="busy || disabled || !!expectedProductCode" maxlength="10" placeholder="请核对并填写 10 位纯数字" />
      <view class="photo-note">确认后将查询产品档案；库中无该编码时将使用大模型额度，并替换当前录入内容。</view>
      <button size="mini" type="primary" :disabled="busy || disabled" @click="confirmProductCode">确认编码并继续</button>
    </view>
    <view class="photo-note">初筛找到已有档案（含停用档案）时跳过大模型；编码未识别时，可选择大模型自动识别或手动确认编码。订单保留本次订单号、批号和产量。</view>
  </view>
</template>
<script>
import { chooseOcrImages, ocrImageIdentity } from '@/utils/ocr-image.js';
import { recognizeOcr, archiveOcrSource } from '@/utils/ocr-client.js';
import { callMes } from '@/utils/mes-api.js';
export default {
  props: { purpose: { type: String, default: 'bom' }, expectedProductCode: { type: String, default: '' }, acceptResult: { type: Function, default: null }, disabled: Boolean },
  data() { return { images: [], lastRecognizedImages: [], recognizedPurpose: '', needsProductCodeConfirmation: false, canUseModelFallback: false, confirmedProductCode: '', recognitionMessage: '', recognitionDocument: null, showRawText: false, choosing: false, recognizing: false, error: '' }; },
  computed: {
    busy() { return this.choosing || this.recognizing; },
    photosRecognized() { return this.recognizedPurpose === this.purpose && this.lastRecognizedImages.length > 0 && this.images.length === this.lastRecognizedImages.length && this.images.every((image, index) => ocrImageIdentity(image) === this.lastRecognizedImages[index]); }
  },
  watch: { purpose() { this.resetRecognition(); }, expectedProductCode() { this.resetRecognition(); } },
  methods: {
    archiveSource(result) { return archiveOcrSource(callMes, this.images, result); },
    resetRecognition() { this.lastRecognizedImages = []; this.recognizedPurpose = ''; this.needsProductCodeConfirmation = false; this.canUseModelFallback = false; this.confirmedProductCode = ''; this.recognitionMessage = ''; this.recognitionDocument = null; this.showRawText = false; this.$emit('confirmation-change', false); },
    clearPhotos() { if (this.busy || this.disabled) return; this.images = []; this.resetRecognition(); },
    async choose(sourceType) {
      if (this.busy || this.disabled) return;
      this.choosing = true; this.error = ''; this.$emit('busy', true);
      try {
        const previous = this.images;
        this.images = await chooseOcrImages(sourceType, previous);
        if (this.images.length !== previous.length || this.images.some((image, index) => ocrImageIdentity(image) !== ocrImageIdentity(previous[index]))) this.resetRecognition();
      }
      catch (error) { if (!/cancel/i.test(error.errMsg || error.message || '')) this.error = error.message || '读取图片失败，请重试'; }
      finally { this.choosing = false; this.$emit('busy', false); }
    },
    preview(index) { uni.previewImage({ urls: this.images.map(image => image.path), current: this.images[index].path }); },
    async confirmProductCode() {
      if (this.busy || this.disabled || !this.needsProductCodeConfirmation) return;
      const code = String(this.confirmedProductCode || '').trim();
      if (!/^\d{10}$/.test(code)) { this.error = '请确认 10 位纯数字产品编码'; return; }
      if (this.purpose === 'bom' && this.expectedProductCode && code !== this.expectedProductCode) { this.error = '确认的产品编码与当前产品不一致，请在新增页面导入'; return; }
      await this.recognize(code);
    },
    /** 初筛未确认编码时，主动用大模型识别，无需先手填编码。 */
    async recognizeWithModel() {
      if (this.busy || this.disabled || !this.canUseModelFallback || !this.needsProductCodeConfirmation) return;
      await this.recognize('', true);
    },
    async recognize(confirmedProductCode = '', useModel = false) {
      const code = String(confirmedProductCode || '').trim();
      if (this.busy || this.disabled || (this.photosRecognized && !useModel) || !this.images.length || (this.needsProductCodeConfirmation && !code && !useModel)) return;
      if (code && !/^\d{10}$/.test(code)) { this.error = '请确认 10 位纯数字产品编码'; return; }
      this.recognizing = true; this.error = ''; this.$emit('busy', true);
      try {
        const result = await recognizeOcr(callMes, this.images, this.purpose, { ...(useModel ? { useModel: true } : {}), ...(code ? { confirmedProductCode: code } : {}), ...(this.purpose === 'bom' && this.expectedProductCode ? { expectedProductCode: this.expectedProductCode } : {}) });
        this.recognitionMessage = typeof result.message === 'string' ? result.message : '';
        this.needsProductCodeConfirmation = result.needsProductCodeConfirmation === true;
        this.canUseModelFallback = result.canUseModelFallback === true || (this.needsProductCodeConfirmation && ['ocrspace', 'local'].includes(result.recognitionSource));
        this.$emit('confirmation-change', this.needsProductCodeConfirmation);
        this.confirmedProductCode = this.expectedProductCode || String(result.productCode || code || '').trim();
        if (this.acceptResult && await this.acceptResult(result) === false) { this.lastRecognizedImages = []; return; }
        this.recognitionDocument = result.recognitionDocument || null;
        this.$emit('recognized', result);
        this.lastRecognizedImages = !this.needsProductCodeConfirmation && (result.archiveMatched || result.modelUsed || result.recognitionSource === 'cache') ? this.images.map(ocrImageIdentity) : []; this.recognizedPurpose = this.purpose;
        const title = this.needsProductCodeConfirmation ? (this.canUseModelFallback ? '可使用大模型或确认编码' : '请确认产品编码后继续') : result.archiveMatched ? (result.modelUsed ? '本单完整识别完成' : '已载入产品信息，未调用大模型') : result.recognitionSource === 'cache' ? '已复用识别结果，请核对' : result.modelUsed ? '识别完成，请核对' : '初筛完成，请核对';
        uni.showToast({ title, icon: 'none' });
      } catch (error) { this.error = error.message || '识别失败，请重试'; }
      finally { this.recognizing = false; this.$emit('busy', false); }
    }
  }
};
</script>
<style lang="scss" scoped>
.photo-import { padding: 1rem; border: 1px dashed $uni-color-primary; border-radius: .4rem; margin-bottom: 1.5rem; }
.photo-heading { font-size: 1rem; font-weight: 600; }
.photo-note { margin: .6rem 0; color: $uni-text-color-grey; font-size: .85rem; line-height: 1.6; }
.photo-actions { display: flex; flex-wrap: wrap; gap: .6rem; }
.photo-actions button { margin: 0; }
.photo-preview { display: flex; flex-wrap: wrap; gap: .7rem; margin-top: 1rem; }
.photo-preview image { width: 7rem; height: 9rem; background: $uni-bg-color-grey; cursor: pointer; }
.photo-error { color: $uni-color-error; margin-top: .7rem; }
.recognition-message { color: $uni-color-primary; }
.recognition-transcript { margin-top: .8rem; padding: .8rem; background: $uni-bg-color-grey; border-radius: .4rem; }
.transcript-heading { display: flex; align-items: center; justify-content: space-between; gap: .6rem; }
.transcript-heading button { margin: 0; }
.transcript-text { display: block; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 28rem; overflow-y: auto; font-size: .85rem; line-height: 1.7; margin-top: .8rem; }
.code-confirmation { margin-top: .8rem; padding: .8rem; background: $uni-bg-color-grey; border-radius: .4rem; }
.confirmation-label { display: block; margin-bottom: .4rem; }
.code-confirmation input { padding: .5rem; background: $uni-bg-color; border-radius: .3rem; margin-bottom: .5rem; }
.code-confirmation button { margin: 0; }
</style>
