/// <reference types="miniprogram-api-typings" />
import type { PollOrderOptions, PrepareVirtualPaymentFn, VirtualPaymentFailure } from './types';
interface MpWeixinVirtualPayOptions {
    /** 为 `true` 时在控制台输出 `[MpWeixinVirtualPay]` 前缀的调试日志（流程节点、轮询、`isVirtualPayAvailable` 依据）。 */
    debug?: boolean;
    /** 可选。在通过 `isVirtualPayAvailable` 之后、`prepareVirtualPayment` 之前执行（如登录、埋点、风控）。 */
    beforePrepare?: () => Promise<unknown>;
    /** 返回 `orderid` 及 `mode` / `paySig` / `signData` / `signature`。 */
    prepareVirtualPayment: PrepareVirtualPaymentFn;
    /**
     * 可选。`success` 之后按间隔调用 `query`，直至 `end()`、抛错或超出 `maxAttempts`。
     * 不传则微信成功即结束。
     */
    pollOrder?: PollOrderOptions;
}
/**
 * 微信小程序虚拟支付封装，对应微信客户端 API {@link https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html | wx.requestVirtualPayment}。
 *
 * **你需要做的**：在 `prepareVirtualPayment` 里请求自己的服务端，返回订单号与签名等字段；本库不发起业务 HTTP，也不内置下单逻辑。
 *
 * **可选配置**：`beforePrepare`（发起支付前的钩子）、`pollOrder`（支付成功后按你的接口轮询订单是否终态）、`debug: true`（输出带 `[MpWeixinVirtualPay]` 前缀的排查日志）。
 */
export declare class MpWeixinVirtualPay {
    private readonly debug;
    private readonly sdkVersion;
    private readonly osName;
    private readonly version;
    private readonly osVersion;
    private readonly beforePrepare?;
    private readonly prepareVirtualPayment;
    private readonly pollOrder?;
    constructor(options: MpWeixinVirtualPayOptions);
    private dbg;
    /**
     * 从 `createVirtualPayment` reject 的 Error 上读取统一失败结构（若为本库包装）。
     */
    static getFailure(err: unknown): VirtualPaymentFailure | undefined;
    /**
     * 是否为用户取消（`status === 'canceled'`，对应微信 fail `errCode === -2`）。
     */
    static isUserCancelError(err: unknown): boolean;
    /**
     * 发起虚拟支付。
     *
     * `isVirtualPayAvailable` => 判断是否支持虚拟支付
     *           ↓
     * `beforePrepare`（若有） => 在准备虚拟支付之前执行
     *           ↓
     * `prepareVirtualPayment` => 准备虚拟支付
     *           ↓
     * `wx.requestVirtualPayment` => 发起虚拟支付
     *           ↓
     *（若配置了 `pollOrder`）轮询 `query` 直至终态 => 轮询订单状态
     *           ↓
     * 返回微信 `success` 入参
     *
     * @returns 成功 resolve 为微信 `success` 入参；失败 reject 的 Error 上可 {@link MpWeixinVirtualPay.getFailure} 读取 `VirtualPaymentFailure`。
     */
    createVirtualPayment(): Promise<WechatMiniprogram.RequestCommonPaymentSuccessCallbackResult>;
    /**
     * 计算当前环境是否具备虚拟支付能力，并给出与 `MpWeixinVirtualPay` 内判断逻辑一致的依据字段。
     * 非微信小程序运行时为 `ok: false`。
     */
    private computeVirtualPayAvailabilitySnapshot;
}
export {};
