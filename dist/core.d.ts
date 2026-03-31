import type { UserCancelError, VirtualPayAvailabilitySnapshot, VirtualPaymentFailure, VirtualPaymentFlowRejectError } from './types';
/** 微信 `requestVirtualPayment` fail 中用户取消支付的 errCode */
export declare const VIRTUAL_PAY_ERR_USER_CANCEL = -2;
export declare const DEBUG_PREFIX = "[MpWeixinVirtualPay]";
/**
 * 将 `signData` 转为微信接口要求的 JSON 字符串。
 */
export declare function signDataToJsonString(signData: unknown): string;
/**
 * 延迟
 * @param ms 延迟时间（ms）
 * @returns 延迟后的 Promise
 */
export declare function delay(ms: number): Promise<void>;
/**
 * 从 `wx.getDeviceInfo().system`（如 `iOS 17.2.1`）解析 iOS 主版本；兼容纯数字前缀串（如 Uni 侧曾出现的 `15.x`）；无法解析时为 NaN。
 */
export declare function parseIosMajorFromSystemString(system: string): number;
/**
 * 按段比较语义化版本号（如 `2.19.2`）。
 * @returns `1` 大于，`-1` 小于，`0` 相等；非法输入为 `0`
 */
export declare function compareVersion(_v1: string, _v2: string): number;
export declare function createVirtualPayUserCancelError(errMsg?: string): UserCancelError;
export declare function toFailure(e: unknown): VirtualPaymentFailure;
export declare function rejectFlow(failure: VirtualPaymentFailure): VirtualPaymentFlowRejectError;
/**
 * 运行时判断是否为微信小程序：依赖微信原生 `wx`。
 * `wx.getAccountInfoSync().miniProgram` 仅在小程序运行环境存在，可区分于仅注入 JSSDK `wx` 的 WebView 等场景。
 * @see https://developers.weixin.qq.com/miniprogram/dev/api/open-api/account-info/wx.getAccountInfoSync.html
 */
export declare function isMpWeixinRuntime(): boolean;
export declare function computeVirtualPayAvailabilitySnapshot(input: {
    sdkVersion: string;
    osName: string;
    weixinVersion: string;
    osVersion: string;
}): VirtualPayAvailabilitySnapshot;
/**
 * 判断当前环境是否支持微信小程序虚拟支付能力。
 *
 * 仅做能力检测，不会发起支付请求。判定口径与 `createVirtualPayment` 一致。
 */
export declare function isVirtualPayAvailable(): boolean;
