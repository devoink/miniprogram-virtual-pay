/** 虚拟支付流程失败时的统一结构（`createVirtualPayment` reject 的 Error 上挂 `virtualPaymentFailure`）。 */
export interface VirtualPaymentFailure {
    status: 'not_supported' | 'failed' | 'canceled';
    message?: string;
    error: Error | null;
}
/** `rejectFlow` 抛出的 Error 形态 */
export type VirtualPaymentFlowRejectError = Error & {
    virtualPaymentFailure: VirtualPaymentFailure;
};
/** 调用方在 `prepareVirtualPayment` 中返回的五元组 */
export interface VirtualPaymentPayload {
    orderid: string;
    mode: string;
    paySig: string;
    /** 对象或 JSON 字符串，发起支付前会序列化为字符串 */
    signData: unknown;
    signature: string;
}
export type PrepareVirtualPaymentFn = () => Promise<VirtualPaymentPayload>;
/**
 * 单次轮询：通过 `end()` / `next()` 只表达「本轮是否结束」，不通过返回值携带业务结果。
 * - `end()`：结束轮询，整体成功，`createVirtualPayment` resolve 为微信 `success` 结果。
 * - `next()`：未结束，间隔后继续下一轮。
 * - 在回调内 `throw`：整体失败，`createVirtualPayment` reject。
 */
export type PollOrderQueryFn = (params: {
    orderid: string;
    end: () => void;
    next: () => void;
}) => void | Promise<void>;
export interface PollOrderOptions {
    query: PollOrderQueryFn;
    /** 两次查询之间的间隔（ms），默认 1500 */
    intervalMs?: number;
    /** 最大轮询次数（含第 1 次），默认 60；最后一轮仍 `next` 则 reject「订单状态查询超时」 */
    maxAttempts?: number;
}
/** `isVirtualPayAvailable` 内部判定快照（供调试日志与单元理解，不对外导出） */
export interface VirtualPayAvailabilitySnapshot {
    ok: boolean;
    /** 人类可读结论 */
    reason: string;
    sdkVersion: string;
    /** `compareVersion(sdkVersion, '2.19.2')` */
    sdkCompare2192: number;
    canIUseRequestVirtualPayment: boolean;
    baseGateOk: boolean;
    /** 来自 `wx.getDeviceInfo().platform`（如 `ios` / `android`） */
    osName: string;
    weixinVersion: string;
    /** 来自 `wx.getDeviceInfo().system`（操作系统及版本文案） */
    osVersion: string;
    iosMajorParsed: number;
    iosWechatOk: boolean;
    iosSystemOk: boolean;
}
export type PollOrderRoundOutcome = 'end' | 'next';
export interface UserCancelError extends Error {
    errCode: number;
}
