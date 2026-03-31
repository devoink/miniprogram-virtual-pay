import { DEBUG_PREFIX, VIRTUAL_PAY_ERR_USER_CANCEL, computeVirtualPayAvailabilitySnapshot, createVirtualPayUserCancelError, delay, isMpWeixinRuntime, rejectFlow, signDataToJsonString, toFailure, } from './core';
/**
 * 微信小程序虚拟支付封装，对应微信客户端 API {@link https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html | wx.requestVirtualPayment}。
 *
 * **你需要做的**：在 `prepareVirtualPayment` 里请求自己的服务端，返回订单号与签名等字段；本库不发起业务 HTTP，也不内置下单逻辑。
 *
 * **可选配置**：`beforePrepare`（发起支付前的钩子）、`pollOrder`（支付成功后按你的接口轮询订单是否终态）、`debug: true`（输出带 `[MpWeixinVirtualPay]` 前缀的排查日志）。
 */
export class MpWeixinVirtualPay {
    constructor(options) {
        this.debug = options.debug ?? false;
        this.beforePrepare = options.beforePrepare;
        this.prepareVirtualPayment = options.prepareVirtualPayment;
        this.pollOrder = options.pollOrder;
        const app = wx.getAppBaseInfo();
        const device = wx.getDeviceInfo();
        this.sdkVersion = app.SDKVersion;
        this.version = app.version;
        this.osName = device.platform;
        this.osVersion = device.system;
    }
    dbg(...args) {
        if (!this.debug) {
            return;
        }
        console.warn(DEBUG_PREFIX, ...args);
    }
    /**
     * 从 `createVirtualPayment` reject 的 Error 上读取统一失败结构（若为本库包装）。
     */
    static getFailure(err) {
        if (typeof err !== 'object' || err === null) {
            return undefined;
        }
        return err.virtualPaymentFailure;
    }
    /**
     * 是否为用户取消（`status === 'canceled'`，对应微信 fail `errCode === -2`）。
     */
    static isUserCancelError(err) {
        const f = MpWeixinVirtualPay.getFailure(err);
        if (f?.status === 'canceled') {
            return true;
        }
        return typeof err === 'object' && err !== null && err.errCode === VIRTUAL_PAY_ERR_USER_CANCEL;
    }
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
    async createVirtualPayment() {
        this.dbg('createVirtualPayment 开始');
        if (!isMpWeixinRuntime()) {
            this.dbg('非微信小程序运行时，createVirtualPayment 直接 not_supported');
            throw rejectFlow({
                status: 'not_supported',
                message: '虚拟支付仅支持微信小程序',
                error: null,
            });
        }
        try {
            const availability = this.computeVirtualPayAvailabilitySnapshot();
            this.dbg('isVirtualPayAvailability 判定', availability);
            if (!availability.ok) {
                throw rejectFlow({
                    status: 'not_supported',
                    message: '当前环境不支持虚拟支付',
                    error: null,
                });
            }
            if (this.beforePrepare) {
                this.dbg('beforePrepare 执行前');
                await this.beforePrepare();
                this.dbg('beforePrepare 执行完毕');
            }
            this.dbg('prepareVirtualPayment 请求中…');
            const { orderid, mode, paySig, signData, signature } = await this.prepareVirtualPayment();
            const signDataStr = signDataToJsonString(signData);
            this.dbg('prepareVirtualPayment 完成', {
                orderid,
                mode,
                paySigLength: typeof paySig === 'string' ? paySig.length : 0,
                signDataLength: signDataStr.length,
                signatureLength: typeof signature === 'string' ? signature.length : 0,
            });
            const wxResult = await new Promise((resolve, reject) => {
                this.dbg('wx.requestVirtualPayment 发起');
                wx.requestVirtualPayment({
                    mode,
                    paySig,
                    signData: signDataStr,
                    signature,
                    success: (result) => {
                        this.dbg('requestVirtualPayment success', result);
                        resolve(result);
                    },
                    fail: (err) => {
                        this.dbg('requestVirtualPayment fail', err);
                        if (err?.errCode === VIRTUAL_PAY_ERR_USER_CANCEL) {
                            const inner = createVirtualPayUserCancelError(err.errMsg);
                            reject(rejectFlow({
                                status: 'canceled',
                                message: err.errMsg,
                                error: inner,
                            }));
                            return;
                        }
                        const inner = new Error(err?.errMsg ?? '虚拟支付失败');
                        reject(rejectFlow({
                            status: 'failed',
                            message: err?.errMsg ?? '虚拟支付失败',
                            error: inner,
                        }));
                    },
                });
            });
            if (this.pollOrder) {
                const { query, intervalMs = 1500, maxAttempts = 60 } = this.pollOrder;
                this.dbg('pollOrder 开始', { orderid, intervalMs, maxAttempts });
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    this.dbg(`pollOrder 第 ${attempt + 1}/${maxAttempts} 次 query 调用前`);
                    const outcome = await new Promise((resolve, reject) => {
                        let settled = false;
                        const end = () => {
                            if (settled) {
                                return;
                            }
                            settled = true;
                            resolve('end');
                        };
                        const next = () => {
                            if (settled) {
                                return;
                            }
                            settled = true;
                            resolve('next');
                        };
                        Promise.resolve(query({ orderid, end, next })).catch((e) => {
                            reject(rejectFlow(toFailure(e)));
                        });
                    });
                    this.dbg(`pollOrder 第 ${attempt + 1}/${maxAttempts} 次 outcome`, outcome);
                    if (outcome === 'end') {
                        this.dbg('pollOrder 结束（end），返回微信 success 结果');
                        return wxResult;
                    }
                    if (attempt < maxAttempts - 1) {
                        this.dbg(`pollOrder 等待 ${intervalMs}ms 后下一轮`);
                        await delay(intervalMs);
                    }
                }
                this.dbg('pollOrder 已达 maxAttempts，仍未 end，判定为订单状态查询超时');
                throw rejectFlow({
                    status: 'failed',
                    message: '订单状态查询超时',
                    error: null,
                });
            }
            this.dbg('createVirtualPayment 成功（未配置 pollOrder 或流程结束）');
            return wxResult;
        }
        catch (e) {
            this.dbg('createVirtualPayment catch', e);
            if (e && typeof e === 'object' && 'virtualPaymentFailure' in e) {
                throw e;
            }
            throw rejectFlow(toFailure(e));
        }
    }
    /**
     * 计算当前环境是否具备虚拟支付能力，并给出与 `MpWeixinVirtualPay` 内判断逻辑一致的依据字段。
     * 非微信小程序运行时为 `ok: false`。
     */
    computeVirtualPayAvailabilitySnapshot() {
        return computeVirtualPayAvailabilitySnapshot({
            sdkVersion: this.sdkVersion,
            osName: this.osName,
            weixinVersion: this.version,
            osVersion: this.osVersion,
        });
    }
}
