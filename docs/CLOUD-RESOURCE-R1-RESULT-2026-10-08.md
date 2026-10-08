# R1 空集合、规则与索引执行结果（2026-10-08）

来源：[主流程资源清单](CLOUD-RESOURCE-MANIFEST-2026-10-08.md)。环境 cloudbase-d8gwtxzm64150b7e0，AppID wx154f791a17268ace，ap-shanghai，实际 RuntimeBackends.nosql=true、postgresql/mysql=false。以下只证明资源结构准备，不代表 D04/D06、真实身份落库或业务验收通过。

## 执行与回读

执行窗口时间约 2026-10-08 10:50–10:55（Asia/Hong_Kong）；证据保存时间 2026-10-08T02:52:25.458Z（UTC）。三个集合先前均不存在：微信和管理端列表均 total=0。平台创建成功；本轮没有写入文档。

| 集合 | 原已存在 | 规则实际回读 | 指定业务索引实际回读 | 回读文档数 |
|---|---|---|---|---|
| users | 否 | CUSTOM，read=false、write=false | uq_user_identity：environment ASC → appId ASC → openId ASC，Unique=true | 0 |
| admin_roles | 否 | CUSTOM，read=false、write=false | ix_role_subject_status：subjectId ASC → status ASC，Unique=false | 0 |
| audit_logs | 否 | CUSTOM，read=false、write=false | 未新增业务查询索引 | 0 |

创建请求：users 35600c8c-de5e-4fc1-a7ae-c5998c08409a；admin_roles a30fe39e-85ea-472a-8b21-ce3b2b94a8b5；audit_logs 6445d2af-fade-4cd4-8631-6c00d1b5e32a。索引创建请求：users 96aca127-6e44-4ecc-aa3c-97343fa33707；admin_roles e486c4e8-f43e-4084-ae8d-702bd2c55883。各项成功，未收到云 API 错误码。最终列表请求 50b7abd6-33c7-47af-80af-202617bb1af9。

## 差异和验收限制

1. 平台创建集合时默认生成 _id_ 和 _openid_1 两个索引。audit_logs 的实际 IndexCount=2，users/admin_roles 各为3；_openid_1 不是本窗口额外添加。遵守清单“不删除平台默认索引”，全部保留，未为 audit_logs 猜建业务查询索引。
2. 两个指定索引已在 describeCollection/listIndexes 读回，字段顺序、Direction="1"、Unique 标志严格一致，Size=8192；未降为普通索引。工具未提供显式 Building/Ready/Failed 状态，构建完成状态仍需控制台或受控 SDK 确認，不虚报已完成构建验收。Accesses.Since 是平台返回的访问统计起始时间，不当作精确集合创建时间。
3. 工具对默认 _id_ 返回 Unique=false；不修改该索引，不用该字段证明 _id 的 create-if-absent/并发语义。确定性 _id 与复合唯一性仍由主流程实际 SDK 验证。
4. 原生客户端只读拒绝验证尝试在数据库执行前被微信工具 APPID_ERROR 阻断：Cannot read properties of undefined (reading '0')；编译隔离页同样报错。该项 NOT_RUN（工具阻塞），不能当作权限拒绝成功。记录见 [工具失败](qa/cloud-resource-r1-2026-10-08/client-read-denial.txt)。没有继续写操作或模拟返回。

管理入口接受并回读了 {"read":false,"write":false}。按官方规则，create/update/delete 继承 write；这里只核验配置，服务端仍须可信身份及当前角色鉴权。[规则文档](https://docs.cloudbase.net/database/security-rules)、[索引 API 字段](https://cloud.tencent.com/document/product/876/127964)。

## 返回主流程

可继续实现可信平台身份 → users 的稳定映射/create-if-absent，以及 admin_roles 当前授权加载。不要用当前 user.me 的追踪 subjectHash 当用户主键，也不要手填 users/管理员伪装落库完成。

保持 NOT_RUN：实际 SDK 写读与复合 unique 冲突/并发、确定性 _id、跨集合事务/回滚/权限有效性、客户端越权负读与直写、角色撤销竞争；R2–R5；真机与独立 test 环境。索引显式构建状态未取得。这些不能由空集合/规则/索引存在替代。

[完整脱敏资源证据](qa/cloud-resource-r1-2026-10-08/resource-evidence.json)保存创建/规则/索引请求标识、实际回读及差异。没有打印集合文档或完整 OPENID、没有导入资料/授予管理员/删除数据/资金操作。未改 UI、业务 handler、草稿规则文件或主流程实现；共享配置核对仍 development/shell。既有未提交改动全部保留，无提交/推送/上传。
