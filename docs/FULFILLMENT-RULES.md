# D05：V1 履约、预约与配送规则

政策版本：`v1-fulfillment-2026-10-03`。本文件维护用户确认的履约政策及技术边界；当前实现/验收查[CURRENT-STATUS](CURRENT-STATUS.md)，资料缺项查[EXTERNAL-DEPENDENCIES](EXTERNAL-DEPENDENCIES.md)。

## 用户已确认的规则与门店资料

| 项目 | 已确认值 / 来源 |
|---|---|
| 履约方式 | 到店自取 PICKUP / 商家配送 DELIVERY |
| 时间段 | 两种方式均 30 分钟；技术网格每小时 :00 / :30 |
| 自取容量 | 每时段最大 3 单 |
| 配送容量 | 每时段最大 1 单；与自取独立 |
| 容量单位 | ORDER；每订单占一个对应模式名额，不按商品件数 |
| 配送方式 | 门店自行配送 STORE_SELF；不接骑手系统 |
| 范围 | 门店中心半径 20 km = 20000 米，含边界 |
| 配送费 | 0 元 = 0 分，FLAT，无附加阶梯收费 |
| 配送时间含义 | 预计配送时间段 ESTIMATED，不承诺具体分钟送达 |
| 最终判断 | 地址范围、时段有效性和容量占用由云端最终校验；客户端结果不是权威 |
| 门店地址 | 用户提供：安徽省合肥市庐江县X085沙溪派出所南侧约50米 |
| 营业时间 | 用户提供：每天 08:00 至 21:00；按中国当地时区 Asia/Shanghai 记录 |

门店原始点：经度117.2886、纬度31.1498，用户提供高德GCJ-02坐标。距离模型使用可信WGS84，必须由可信服务转换/核验；不得把原始点直接标为verified，也不得编造verifiedAt。

正式经营参数未配置时，参数化算法可以验证，但不得据此生成可购买报价；待确认项统一登记在EXTERNAL-DEPENDENCIES。

## 时间与时段身份

当前 V1 国内门店范围，纯模型只支持 Asia/Shanghai，使用当代（2000 年起）的 UTC+8 时间。数据库保存 UTC 毫秒；serviceDate 为门店当地合法 YYYY-MM-DD，weekday 周一=1。拒绝无效日历、过去日期、窗口外日期及错误时区，不以运行机 / 客户端时区截日期。此模块不声称支持历史时区或其他地区 DST；跨时区扩展须显式升级。

营业窗口在 08:00–21:00 内，start/end 都按半小时对齐，且同日 start<end；V1 跨午夜策略 REJECT，不默认把 21:00 后时间算下一天。正常完整营业日每模式 26 段：08:00–08:30 至 20:30–21:00；**没有 21:00–21:30 段**。配置可关闭或缩短某日某模式，不能未经政策升级延长至已确认营业时间外。

weeklyWindows 明确每个营业日 / 模式，dateOverrides 优先且每日期 / 模式唯一；closed=true 时 windows=[]，缩短营业则 closed=false 且非空有效窗口。不重叠，缺当日窗口就无可约时段，不隐式全天营业。用户已确认每天营业，正式周日历应覆盖周一至周日两模式各 08:00–21:00；临时停业用 dateOverrides 明确配置。测试日历保持隔离，不作为完整发布配置。

最短提前量取门店与选中产品要求的最大值。未知提前量 / 最大未来天数不填 0 或 14；这些只能作为明确测试参数。最大预约天数相对当地 today，末日含边界；开始时刻必须严格晚于 now+最大提前量，确保有正的付款窗口。截止等于当前时刻的时段不可继续下单。

slot ID = scopedDocumentId('slot',[environment,storeId,fulfillment,serviceDate,startAt,endAt])；不含 policyVersion。模式决定独立资源，同一真实时间段修改配置版本不会另开新 ID 获得第二份容量。更新政策时保留已占用计数并检查当前版本 / 最大容量，禁止删除重建清空预约。政策版本仍存 slot / appointmentSnapshot，并与当前发布配置复核。

buildSlotDefinitions 只返回时段定义，含 minLeadTimeMinutes 内部计算值；不是可直接落库的完整资源，也不是可售承诺。实际 slot_inventory 必须由受控初始化 / 版本管理创建并保留历史占用；缺记录 resolveAppointment 拒绝，不能让报价临时假造库存为零占用。

## 容量与 D04 衔接

slot_inventory.capacityUnit=ORDER，自取 capacityTotal=3，配送=1。已 HELD + CONFIRMED + CONSUMED 都计入容量；满额无法继续下单。自取或配送一个满额不影响另一个，按资源 ID 独立原子裁决。完成订单不能通过立即回补允许同一时段超过累计容量；退款不是自动释放或重开时段的指令。已付取消何时回补仍须明确经营策略；未核实付款不释放，遵循 D01 / D04。

resolveAppointment 重建当前合法定义，核对真实 slot 的 ID / 门店 / 模式 / 日期 / 时区 / 起止 / policyVersion / ORDER 单位 / 容量，检查 OPEN、当前占用与剩余量。返回 appointmentSnapshot（保持 D02 字段名）以及 SLOT 请求 quantity=1/expectedVersion；实际 order 服务将其与 D03 聚合 STOCK 请求一起交 D04 事务提交。纯函数快照过后余额可变化，所以客户端或函数计算通过都不代表已占用。

付款截止 `min(now+paymentHoldMinutes, startAt-minLeadTimeMinutes)`；无明确支付保留时长不补默认，deadline 必须 > now。创建订单时复核当前时间和最新配置，存统一 paymentDeadlineAt，资源 expiresAt 一致；到期仍先核实支付结果再释放。报价时效与支付占用是不同概念。

## 20 km 免费范围与可信坐标边界

当前技术算法版本 `haversine-r6371000-v1`：对服务端统一的 WGS84 经纬度计算球面直线距离，技术球半径取 6371000 米；不是道路里程、车程或骑手报价。所有商业范围 / 运费值来自用户确认，算法版本用于复现判断。改算法必须升级规则版本并重报价，不悄悄改变历史订单。

Location 五字段 longitude/latitude/coordinateSystem/source/verifiedAt 均需合法，verifiedAt 不得晚于服务端 now。source/verifiedAt 字段本身不证明可信，未来服务须由受控定位 / 地理编码 / 核验链构造，不能接收客户端声称已核验的对象。门店或地址位置为 null 时拒绝范围评估；地址行政文字正确不等于已在范围内。

当前只接受 WGS84，GCJ02 / 其他来源须先在可信服务显式转换 / 核验，不能混用坐标或只改 coordinateSystem 标签。真实地图来源与转换尚未接入；没有默认经纬度。来源系统须随地图选点资料登记。

distance<=20000 米含边界，计算采用仅机器精度级浮点容差，不向外扩几十 / 几百米；超过边界 1 mm 的回归被拒绝。允许范围内 feeCents 固定 0。evaluateDeliveryRange 返回冻结的距离 / 范围 / 0 费 / 算法 / 预计时间语义 / 门店自行配送结果，不生成虚假 evaluationId 或占容量；订单 deliverySnapshot 的 ruleId/ruleVersion/evaluationId/addressFingerprint 由未来服务端产生并绑定当前报价与地址。

界面后续展示“预计配送时间段”，不展示精准分钟到达承诺；当前没有修改 Home、Checkout 或订单 UI。顾客范围展示仅辅助，服务端创建订单重校验范围、时段、容量与版本，并以真实事务最终裁决。

## 实现与证据入口

对应源码：[fulfillment-model.js](../cloudfunctions/_shared/fulfillment-model.js)。以源码和相关测试核对实现；历史D05证据按[阶段二记录](archive/stages/phase-2.md#phase-2-execution)定位，不在规则库重复维护测试数量或下一步。
