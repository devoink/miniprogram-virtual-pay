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
  status: 'not_supported' | 'failed' | 'canceled'
  message?: string
  error: Error | null
}

/** `rejectFlow` 抛出的 Error 形态 */
type VirtualPaymentFlowRejectError = Error & { virtualPaymentFailure: VirtualPaymentFailure }

/** 调用方在 `prepareVirtualPayment` 中返回的五元组 */
interface VirtualPaymentPayload {
  orderid: string
  mode: string
  paySig: string
  /** 对象或 JSON 字符串，发起支付前会序列化为字符串 */
  signData: unknown
  signature: string
}

type PrepareVirtualPaymentFn = () => Promise<VirtualPaymentPayload>

/**
 * 单次轮询：通过 `end()` / `next()` 只表达「本轮是否结束」，不通过返回值携带业务结果。
 * - `end()`：结束轮询，整体成功，`createVirtualPayment` resolve 为微信 `success` 结果。
 * - `next()`：未结束，间隔后继续下一轮。
 * - 在回调内 `throw`：整体失败，`createVirtualPayment` reject。
 */
type PollOrderQueryFn = (params: {
  orderid: string
  end: () => void
  next: () => void
}) => void | Promise<void>

interface PollOrderOptions {
  query: PollOrderQueryFn
  /** 两次查询之间的间隔（ms），默认 1500 */
  intervalMs?: number
  /** 最大轮询次数（含第 1 次），默认 60；最后一轮仍 `next()` 则 reject「订单状态查询超时」 */
  maxAttempts?: number
}

interface MpWeixinVirtualPayOptions {
  /** 为 `true` 时在控制台输出 `[MpWeixinVirtualPay]` 前缀的调试日志（流程节点、轮询、`isVirtualPayAvailable` 依据）。 */
  debug?: boolean
  /** 可选。在通过 `isVirtualPayAvailable` 之后、`prepareVirtualPayment` 之前执行（如登录、埋点、风控）。 */
  beforePrepare?: () => Promise<unknown>
  /** 返回 `orderid` 及 `mode` / `paySig` / `signData` / `signature`。 */
  prepareVirtualPayment: PrepareVirtualPaymentFn
  /**
   * 可选。`success` 之后按间隔调用 `query`，直至 `end()`、抛错或超出 `maxAttempts`。
   * 不传则微信成功即结束。
   */
  pollOrder?: PollOrderOptions
}

/** `isVirtualPayAvailable` 内部判定快照（供调试日志与单元理解，不对外导出） */
interface VirtualPayAvailabilitySnapshot {
  ok: boolean
  /** 人类可读结论 */
  reason: string
  sdkVersion: string
  /** `compareVersion(sdkVersion, '2.19.2')` */
  sdkCompare2192: number
  canIUseRequestVirtualPayment: boolean
  baseGateOk: boolean
  /** 来自 `wx.getDeviceInfo().platform`（如 `ios` / `android`），与历史字段名 `osName` 对应 */
  osName: string
  weixinVersion: string
  /** 来自 `wx.getDeviceInfo().system`（操作系统及版本文案） */
  osVersion: string
  iosMajorParsed: number
  iosWechatOk: boolean
  iosSystemOk: boolean
}

type PollOrderRoundOutcome = 'end' | 'next'

interface UserCancelError extends Error {
  errCode: number
}

/** 微信 `requestVirtualPayment` fail 中用户取消支付的 errCode */
const VIRTUAL_PAY_ERR_USER_CANCEL = -2

/**
 * 将 `signData` 转为微信接口要求的 JSON 字符串。
 */
function signDataToJsonString(signData: unknown): string {
  if (typeof signData === 'string') {
    return signData
  }
  return JSON.stringify(signData)
}

/**
 * 延迟
 * @param ms 延迟时间（ms）
 * @returns 延迟后的 Promise
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 从 `wx.getDeviceInfo().system`（如 `iOS 17.2.1`）解析 iOS 主版本；兼容纯数字前缀串（如 Uni 侧曾出现的 `15.x`）；无法解析时为 NaN。
 */
function parseIosMajorFromSystemString(system: string): number {
  const m = /iOS\s+(\d+)/i.exec(system)
  if (m) {
    return Number.parseInt(m[1], 10)
  }
  return Number.parseInt(system, 10)
}

function createVirtualPayUserCancelError(errMsg?: string): UserCancelError {
  const e = new Error(errMsg ?? '用户取消支付') as UserCancelError
  e.errCode = VIRTUAL_PAY_ERR_USER_CANCEL
  return e
}

function toFailure(e: unknown): VirtualPaymentFailure {
  if (e instanceof Error) {
    return { status: 'failed', message: e.message, error: e }
  }
  return { status: 'failed', message: String(e), error: null }
}

function rejectFlow(failure: VirtualPaymentFailure): VirtualPaymentFlowRejectError {
  const e = new Error(failure.message ?? failure.error?.message ?? failure.status) as VirtualPaymentFlowRejectError
  e.virtualPaymentFailure = failure
  return e
}

const DEBUG_PREFIX = '[MpWeixinVirtualPay]'

/**
 * 运行时判断是否为微信小程序：依赖微信原生 `wx`。
 * `wx.getAccountInfoSync().miniProgram` 仅在小程序运行环境存在，可区分于仅注入 JSSDK `wx` 的 WebView 等场景。
 * @see https://developers.weixin.qq.com/miniprogram/dev/api/open-api/account-info/wx.getAccountInfoSync.html
 */
function isMpWeixinRuntime(): boolean {
  try {
    const wxApi = (typeof globalThis !== 'undefined'
      ? (globalThis as { wx?: { getAccountInfoSync?: () => { miniProgram?: unknown } } }).wx
      : undefined)
    if (!wxApi || typeof wxApi.getAccountInfoSync !== 'function') {
      return false
    }
    const account = wxApi.getAccountInfoSync()
    return account != null && account.miniProgram != null
  }
  catch {
    return false
  }
}

/**
 * 微信小程序虚拟支付（仅依赖微信 `wx` API，无项目内 HTTP）。
 */
export class MpWeixinVirtualPay {
  private readonly debug: boolean
  private readonly sdkVersion: string
  private readonly osName: string
  private readonly version: string
  private readonly osVersion: string
  private readonly beforePrepare?: () => Promise<unknown>
  private readonly prepareVirtualPayment: PrepareVirtualPaymentFn
  private readonly pollOrder?: PollOrderOptions

  constructor(options: MpWeixinVirtualPayOptions) {
    this.debug = options.debug ?? false
    this.beforePrepare = options.beforePrepare
    this.prepareVirtualPayment = options.prepareVirtualPayment
    this.pollOrder = options.pollOrder
    const app = wx.getAppBaseInfo()
    const device = wx.getDeviceInfo()
    this.sdkVersion = app.SDKVersion
    this.version = app.version
    this.osName = device.platform
    this.osVersion = device.system
  }

  private dbg(...args: unknown[]): void {
    if (!this.debug) {
      return
    }
    console.warn(DEBUG_PREFIX, ...args)
  }

  /**
   * 从 `createVirtualPayment` reject 的 Error 上读取统一失败结构（若为本库包装）。
   */
  public static getFailure(err: unknown): VirtualPaymentFailure | undefined {
    if (typeof err !== 'object' || err === null) {
      return undefined
    }
    return (err as { virtualPaymentFailure?: VirtualPaymentFailure }).virtualPaymentFailure
  }

  /**
   * 是否为用户取消（`status === 'canceled'`，对应微信 fail `errCode === -2`）。
   */
  public static isUserCancelError(err: unknown): boolean {
    const f = MpWeixinVirtualPay.getFailure(err)
    if (f?.status === 'canceled') {
      return true
    }
    return typeof err === 'object' && err !== null && (err as { errCode?: number }).errCode === VIRTUAL_PAY_ERR_USER_CANCEL
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
   * @returns 成功 resolve 为微信 `success` 入参；失败 reject 的 Error 上可 {@link MpWeixinVirtualPay.getFailure} 读取 {@link VirtualPaymentFailure}。
   */
  public async createVirtualPayment(): Promise<WechatMiniprogram.RequestCommonPaymentSuccessCallbackResult> {
    this.dbg('createVirtualPayment 开始')
    if (!isMpWeixinRuntime()) {
      this.dbg('非微信小程序运行时，createVirtualPayment 直接 not_supported')
      throw rejectFlow({
        status: 'not_supported',
        message: '虚拟支付仅支持微信小程序',
        error: null,
      })
    }
    try {
      const availability = this.computeVirtualPayAvailabilitySnapshot()
      this.dbg('isVirtualPayAvailability 判定', availability)
      if (!availability.ok) {
        throw rejectFlow({
          status: 'not_supported',
          message: '当前环境不支持虚拟支付',
          error: null,
        })
      }

      if (this.beforePrepare) {
        this.dbg('beforePrepare 执行前')
        await this.beforePrepare()
        this.dbg('beforePrepare 执行完毕')
      }

      this.dbg('prepareVirtualPayment 请求中…')
      const { orderid, mode, paySig, signData, signature } = await this.prepareVirtualPayment()
      const signDataStr = signDataToJsonString(signData)
      this.dbg('prepareVirtualPayment 完成', {
        orderid,
        mode,
        paySigLength: typeof paySig === 'string' ? paySig.length : 0,
        signDataLength: signDataStr.length,
        signatureLength: typeof signature === 'string' ? signature.length : 0,
      })

      const wxResult = await new Promise<WechatMiniprogram.RequestCommonPaymentSuccessCallbackResult>((resolve, reject) => {
        this.dbg('wx.requestVirtualPayment 发起')
        wx.requestVirtualPayment({
          mode,
          paySig,
          signData: signDataStr,
          signature,
          success: (result: WechatMiniprogram.RequestCommonPaymentSuccessCallbackResult) => {
            this.dbg('requestVirtualPayment success', result)
            resolve(result)
          },
          fail: (err: WechatMiniprogram.RequestVirtualPaymentFailCallbackErr) => {
            this.dbg('requestVirtualPayment fail', err)
            if (err?.errCode === VIRTUAL_PAY_ERR_USER_CANCEL) {
              const inner = createVirtualPayUserCancelError(err.errMsg)
              reject(rejectFlow({
                status: 'canceled',
                message: err.errMsg,
                error: inner,
              }))
              return
            }
            const inner = new Error(err?.errMsg ?? '虚拟支付失败')
            reject(rejectFlow({
              status: 'failed',
              message: err?.errMsg ?? '虚拟支付失败',
              error: inner,
            }))
          },
        } as unknown as WechatMiniprogram.RequestVirtualPaymentOption)
      })

      if (this.pollOrder) {
        const { query, intervalMs = 1500, maxAttempts = 60 } = this.pollOrder
        this.dbg('pollOrder 开始', { orderid, intervalMs, maxAttempts })

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          this.dbg(`pollOrder 第 ${attempt + 1}/${maxAttempts} 次 query 调用前`)
          const outcome = await new Promise<PollOrderRoundOutcome>((resolve, reject) => {
            let settled = false
            const end = () => {
              if (settled) {
                return
              }
              settled = true
              resolve('end')
            }
            const next = () => {
              if (settled) {
                return
              }
              settled = true
              resolve('next')
            }
            Promise.resolve(query({ orderid, end, next })).catch((e) => {
              reject(rejectFlow(toFailure(e)))
            })
          })

          this.dbg(`pollOrder 第 ${attempt + 1}/${maxAttempts} 次 outcome`, outcome)

          if (outcome === 'end') {
            this.dbg('pollOrder 结束（end），返回微信 success 结果')
            return wxResult
          }

          if (attempt < maxAttempts - 1) {
            this.dbg(`pollOrder 等待 ${intervalMs}ms 后下一轮`)
            await delay(intervalMs)
          }
        }

        this.dbg('pollOrder 已达 maxAttempts，仍未 end，判定为订单状态查询超时')
        throw rejectFlow({
          status: 'failed',
          message: '订单状态查询超时',
          error: null,
        })
      }

      this.dbg('createVirtualPayment 成功（未配置 pollOrder 或流程结束）')
      return wxResult
    }
    catch (e) {
      this.dbg('createVirtualPayment catch', e)
      if (e && typeof e === 'object' && 'virtualPaymentFailure' in (e as object)) {
        throw e
      }
      throw rejectFlow(toFailure(e))
    }
  }

  /**
   * 按段比较语义化版本号（如 `2.19.2`）。
   * @returns `1` 大于，`-1` 小于，`0` 相等；非法输入为 `0`
   */
  private compareVersion(_v1: string, _v2: string): number {
    if (typeof _v1 !== 'string' || typeof _v2 !== 'string')
      return 0

    const v1 = _v1.split('.')
    const v2 = _v2.split('.')
    const len = Math.max(v1.length, v2.length)

    while (v1.length < len) {
      v1.push('0')
    }
    while (v2.length < len) {
      v2.push('0')
    }

    for (let i = 0; i < len; i++) {
      const num1 = Number.parseInt(v1[i], 10)
      const num2 = Number.parseInt(v2[i], 10)

      if (num1 > num2) {
        return 1
      }
      else if (num1 < num2) {
        return -1
      }
    }

    return 0
  }

  /**
   * 计算当前环境是否具备虚拟支付能力，并给出与 {@link MpWeixinVirtualPay} 内判断逻辑一致的依据字段。
   * 非微信小程序运行时为 `ok: false`。
   */
  private computeVirtualPayAvailabilitySnapshot(): VirtualPayAvailabilitySnapshot {
    const sdkVersion = this.sdkVersion
    const osName = this.osName
    const weixinVersion = this.version
    const osVersion = this.osVersion
    const sdkCompare2192 = this.compareVersion(sdkVersion, '2.19.2')
    const iosMajorParsed = parseIosMajorFromSystemString(osVersion)
    const iosWechatOk = this.compareVersion(weixinVersion, '8.0.68') >= 0
    const iosSystemOk = iosMajorParsed >= 15

    let canIUseRequestVirtualPayment = false
    if (isMpWeixinRuntime()) {
      canIUseRequestVirtualPayment = wx.canIUse('requestVirtualPayment')
    }

    const baseGateOk = sdkCompare2192 >= 0 || canIUseRequestVirtualPayment

    let ok = false
    let reason = ''

    if (!isMpWeixinRuntime()) {
      ok = false
      reason = '当前非微信小程序运行时（无微信原生 wx 或 wx.getAccountInfoSync().miniProgram），不包含微信小程序虚拟支付能力'
    }
    else if (!baseGateOk) {
      ok = false
      reason = `基础库门槛未通过：需 SDKVersion ≥ 2.19.2（与 2.19.2 比较为 ${sdkCompare2192}，≥0 为通过）或 canIUse('requestVirtualPayment') 为 true；当前 canIUse(requestVirtualPayment)=${canIUseRequestVirtualPayment}`
    }
    else if (osName === 'ios') {
      ok = iosWechatOk && iosSystemOk
      reason = ok
        ? `iOS：基础库 gate 通过，且微信版本 ≥8.0.68（与 8.0.68 比较为 ${this.compareVersion(weixinVersion, '8.0.68')}）且系统主版本 ≥15（解析为 ${iosMajorParsed}）`
        : `iOS 额外条件未通过：需微信 ≥8.0.68（与 8.0.68 比较为 ${this.compareVersion(weixinVersion, '8.0.68')}）且系统主版本 ≥15；当前微信=${weixinVersion}，系统串=${osVersion}，主版本=${iosMajorParsed}`
    }
    else {
      ok = true
      reason = `非 iOS（osName=${osName}），基础库 gate 已通过即可使用虚拟支付`
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
    }
  }
}
