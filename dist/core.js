/** 微信 `requestVirtualPayment` fail 中用户取消支付的 errCode */
export const VIRTUAL_PAY_ERR_USER_CANCEL = -2;
export const DEBUG_PREFIX = '[MpWeixinVirtualPay]';
/**
 * 将 `signData` 转为微信接口要求的 JSON 字符串。
 */
export function signDataToJsonString(signData) {
    if (typeof signData === 'string') {
        return signData;
    }
    return JSON.stringify(signData);
}
/**
 * 延迟
 * @param ms 延迟时间（ms）
 * @returns 延迟后的 Promise
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * 从 `wx.getDeviceInfo().system`（如 `iOS 17.2.1`）解析 iOS 主版本；兼容纯数字前缀串（如 Uni 侧曾出现的 `15.x`）；无法解析时为 NaN。
 */
export function parseIosMajorFromSystemString(system) {
    const m = /iOS\s+(\d+)/i.exec(system);
    if (m) {
        return Number.parseInt(m[1], 10);
    }
    return Number.parseInt(system, 10);
}
/**
 * 按段比较语义化版本号（如 `2.19.2`）。
 * @returns `1` 大于，`-1` 小于，`0` 相等；非法输入为 `0`
 */
export function compareVersion(_v1, _v2) {
    if (typeof _v1 !== 'string' || typeof _v2 !== 'string')
        return 0;
    const v1 = _v1.split('.');
    const v2 = _v2.split('.');
    const len = Math.max(v1.length, v2.length);
    while (v1.length < len) {
        v1.push('0');
    }
    while (v2.length < len) {
        v2.push('0');
    }
    for (let i = 0; i < len; i++) {
        const num1 = Number.parseInt(v1[i], 10);
        const num2 = Number.parseInt(v2[i], 10);
        if (num1 > num2) {
            return 1;
        }
        else if (num1 < num2) {
            return -1;
        }
    }
    return 0;
}
export function createVirtualPayUserCancelError(errMsg) {
    const e = new Error(errMsg ?? '用户取消支付');
    e.errCode = VIRTUAL_PAY_ERR_USER_CANCEL;
    return e;
}
export function toFailure(e) {
    if (e instanceof Error) {
        return { status: 'failed', message: e.message, error: e };
    }
    return { status: 'failed', message: String(e), error: null };
}
export function rejectFlow(failure) {
    const e = new Error(failure.message ?? failure.error?.message ?? failure.status);
    e.virtualPaymentFailure = failure;
    return e;
}
/**
 * 运行时判断是否为微信小程序：依赖微信原生 `wx`。
 * `wx.getAccountInfoSync().miniProgram` 仅在小程序运行环境存在，可区分于仅注入 JSSDK `wx` 的 WebView 等场景。
 * @see https://developers.weixin.qq.com/miniprogram/dev/api/open-api/account-info/wx.getAccountInfoSync.html
 */
export function isMpWeixinRuntime() {
    try {
        const wxApi = (typeof globalThis !== 'undefined'
            ? globalThis.wx
            : undefined);
        if (!wxApi || typeof wxApi.getAccountInfoSync !== 'function') {
            return false;
        }
        const account = wxApi.getAccountInfoSync();
        return account != null && account.miniProgram != null;
    }
    catch {
        return false;
    }
}
export function computeVirtualPayAvailabilitySnapshot(input) {
    const { sdkVersion, osName, weixinVersion, osVersion } = input;
    const sdkCompare2192 = compareVersion(sdkVersion, '2.19.2');
    const iosMajorParsed = parseIosMajorFromSystemString(osVersion);
    const iosWechatOk = compareVersion(weixinVersion, '8.0.68') >= 0;
    const iosSystemOk = iosMajorParsed >= 15;
    let canIUseRequestVirtualPayment = false;
    if (isMpWeixinRuntime()) {
        canIUseRequestVirtualPayment = wx.canIUse('requestVirtualPayment');
    }
    const baseGateOk = sdkCompare2192 >= 0 || canIUseRequestVirtualPayment;
    let ok = false;
    let reason = '';
    if (!isMpWeixinRuntime()) {
        ok = false;
        reason = '当前非微信小程序运行时（无微信原生 wx 或 wx.getAccountInfoSync().miniProgram），不包含微信小程序虚拟支付能力';
    }
    else if (!baseGateOk) {
        ok = false;
        reason = `基础库门槛未通过：需 SDKVersion ≥ 2.19.2（与 2.19.2 比较为 ${sdkCompare2192}，≥0 为通过）或 canIUse('requestVirtualPayment') 为 true；当前 canIUse(requestVirtualPayment)=${canIUseRequestVirtualPayment}`;
    }
    else if (osName === 'ios') {
        ok = iosWechatOk && iosSystemOk;
        reason = ok
            ? `iOS：基础库 gate 通过，且微信版本 ≥8.0.68（与 8.0.68 比较为 ${compareVersion(weixinVersion, '8.0.68')}）且系统主版本 ≥15（解析为 ${iosMajorParsed}）`
            : `iOS 额外条件未通过：需微信 ≥8.0.68（与 8.0.68 比较为 ${compareVersion(weixinVersion, '8.0.68')}）且系统主版本 ≥15；当前微信=${weixinVersion}，系统串=${osVersion}，主版本=${iosMajorParsed}`;
    }
    else {
        ok = true;
        reason = `非 iOS（osName=${osName}），基础库 gate 已通过即可使用虚拟支付`;
    }
    return {
        ok,
        reason,
        sdkVersion,
        sdkCompare2192,
        canIUseRequestVirtualPayment,
        baseGateOk,
        osName,
        weixinVersion,
        osVersion,
        iosMajorParsed,
        iosWechatOk,
        iosSystemOk,
    };
}
/**
 * 判断当前环境是否支持微信小程序虚拟支付能力。
 *
 * 仅做能力检测，不会发起支付请求。判定口径与 `createVirtualPayment` 一致。
 */
export function isVirtualPayAvailable() {
    if (!isMpWeixinRuntime()) {
        return false;
    }
    try {
        const app = wx.getAppBaseInfo();
        const device = wx.getDeviceInfo();
        return computeVirtualPayAvailabilitySnapshot({
            sdkVersion: app.SDKVersion,
            osName: device.platform,
            weixinVersion: app.version,
            osVersion: device.system,
        }).ok;
    }
    catch {
        return false;
    }
}
