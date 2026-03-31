/// <reference types="miniprogram-api-typings" />
/**
 * 微信小程序虚拟支付（`wx.requestVirtualPayment`）封装。
 *
 * 不包含业务 HTTP；下单与拉签名由调用方通过 `prepareVirtualPayment` 注入。
 * 微信客户端支付成功不代表服务端订单已终态，可通过 `pollOrder` 轮询订单接口由调用方自行判定。
 *
 * 构造选项 `debug: true` 时通过 `console.warn` 输出 `[MpWeixinVirtualPay]` 前缀的调试信息（含可用性判定依据）。
 *
 * 使用微信原生全局 `wx`（如 `wx.getAccountInfoSync().miniProgram`）做「是否微信小程序」运行时判断，不依赖 UniApp 的 `uniPlatform`；不依赖条件编译，便于作为 npm 依赖被微信原生小程序与 UniApp 打包。
 *
 * @see https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html
 *
 * 类型：依赖 `miniprogram-api-typings`（全局 `wx` 与 `WechatMiniprogram.*`）。UniApp 小程序端同样具备 `wx`，无需 `@dcloudio/types`。
 */
/** 虚拟支付流程失败时的统一结构（`createVirtualPayment` reject 的 Error 上挂 `virtualPaymentFailure`）。 */
export interface VirtualPaymentFailure {
    status: 'not_supported' | 'failed' | 'canceled';
    message?: string;
    error: Error | null;
}
/** 调用方在 `prepareVirtualPayment` 中返回的五元组 */
interface VirtualPaymentPayload {
    orderid: string;
    mode: string;
    paySig: string;
    /** 对象或 JSON 字符串，发起支付前会序列化为字符串 */
    signData: unknown;
    signature: string;
}
type PrepareVirtualPaymentFn = () => Promise<VirtualPaymentPayload>;
/**
 * 单次轮询：通过 `end()` / `next()` 只表达「本轮是否结束」，不通过返回值携带业务结果。
 * - `end()`：结束轮询，整体成功，`createVirtualPayment` resolve 为微信 `success` 结果。
 * - `next()`：未结束，间隔后继续下一轮。
 * - 在回调内 `throw`：整体失败，`createVirtualPayment` reject。
 */
type PollOrderQueryFn = (params: {
    orderid: string;
    end: () => void;
    next: () => void;
}) => void | Promise<void>;
interface PollOrderOptions {
    query: PollOrderQueryFn;
    /** 两次查询之间的间隔（ms），默认 1500 */
    intervalMs?: number;
    /** 最大轮询次数（含第 1 次），默认 60；最后一轮仍 `next()` 则 reject「订单状态查询超时」 */
    maxAttempts?: number;
}
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
 * 微信小程序虚拟支付（仅依赖微信 `wx` API，无项目内 HTTP）。
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
     * @returns 成功 resolve 为微信 `success` 入参；失败 reject 的 Error 上可 {@link MpWeixinVirtualPay.getFailure} 读取 {@link VirtualPaymentFailure}。
     */
    createVirtualPayment(): Promise<WechatMiniprogram.RequestCommonPaymentSuccessCallbackResult>;
    /**
     * 按段比较语义化版本号（如 `2.19.2`）。
     * @returns `1` 大于，`-1` 小于，`0` 相等；非法输入为 `0`
     */
    private compareVersion;
    /**
     * 计算当前环境是否具备虚拟支付能力，并给出与 {@link MpWeixinVirtualPay} 内判断逻辑一致的依据字段。
     * 非微信小程序运行时为 `ok: false`。
     */
    private computeVirtualPayAvailabilitySnapshot;
}
export {};
//# sourceMappingURL=index.d.ts.map