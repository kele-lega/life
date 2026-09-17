# Life 云服务器部署指南

部署目标：两个测试账号登录，设备先写本机，再上传按账号隔离的云副本；用户主动下载并完整校验后，确认切换到新的本机生活库。当前认证明确为测试阶段。部署使用本仓库 Next.js、PostgreSQL Replica、私有 S3 兼容存储和既有 `.life.zip` Backup，不增加另一套云系统。

## 1. 架构与边界

```text
Web / Android（本机 Dexie v7，七张业务表 + durable outbox）
  ├─ 本地导出 / 文件恢复：.life.zip，不依赖登录
  ├─ /api/replica：认证、单写者上传、状态、显式完整恢复
  │    ├─ PostgreSQL：账户、会话哈希、七类 Replica、mutationId、tombstone
  │    └─ 私有对象存储：原图，字节数与 SHA-256 校验
  └─ Web /api/cloud：手动完整 Backup 与恢复目录
```

- 业务主库始终是设备上的 Dexie。登录不上传；首次明确确认上传后，后续本机提交由 outbox 异步发送。断网、会话过期或云故障不阻塞本机记录。
- 服务端从验证后的 Cookie / Bearer 身份选择 `accountId`，通过账户条件和 PostgreSQL RLS 隔离七类数据及对象。`X-Life-Account` 只检查身份一致性。
- 恢复全部七类数据与原图到新的 `life-restore-*` 库。缺图、摘要或关系错误会停止恢复。当前库保留；用户确认切换时检查快照水位，再提升 writer epoch。旧写者随后收到 `409 fenced`。
- 无多设备实时合并、云端主库、SQLite 或新 AI。原文、指纹、审核状态、删除状态和时间戳保留；`.life.zip` 格式不变。
- 开发、预发布、生产使用不同数据库、私有 bucket、凭据和 `CLOUD_OBJECT_ENV`；前缀本身不能隔离共享数据库中的同名账户。
- 部署 AI 只需代码和本指南。真实 Life 正文数据库、Storage Secret、迁移账户与登录凭据由操作者在秘密管理系统配置；不给 Cloud AI / Coding AI 真实正文数据库的直接访问权限。

## 2. 主机与代码

Linux + Node **24.15 至 24.x**、npm、PostgreSQL、私有 HTTPS S3 兼容 endpoint、nginx、有效 HTTPS 域名。Android 开发机另需 JDK 21 与 Android SDK。Web 需要 Node 运行时，不能只发布静态 `out/`。

使用包含本功能、已经审阅的代码版本。服务器运行用户示例为 `life`，目录为 `/opt/life`。首次部署：

```bash
git clone https://github.com/kele-lega/life.git /opt/life
cd /opt/life
git checkout <已审阅的提交或标签>
npm ci
umask 077
cp .env.example .env.local
chmod 600 .env.local
```

已有 `.env.local` 时直接编辑，不执行复制覆盖。不要将生产秘密放在开发机、构建工作区或 Git。服务运行用户需有应用目录和 `.env.local` 的读取权限。

## 3. 服务端环境

在服务器 `.env.local` 或服务秘密环境中填写真实值，以下是变量名与格式说明。不要直接部署占位值。

| 变量 | 配置 |
| --- | --- |
| `CLOUD_AUTH_MODE` | `test-password`，只开放 `kele` / `wzj` |
| `CLOUD_TEST_KELE_PASSWORD_HASH` | 初始化脚本生成的 scrypt 哈希 |
| `CLOUD_TEST_WZJ_PASSWORD_HASH` | 初始化脚本生成的独立 scrypt 哈希 |
| `CLOUD_APP_ORIGIN` | 精确 Web HTTPS Origin，例如 `https://life.example.com`，无路径或尾斜杠 |
| `CLOUD_DATABASE_URL` | 受限应用 LOGIN 的 PostgreSQL 连接串，不能是 owner / superuser / worker |
| `CLOUD_S3_REGION` | 私有存储服务要求的 region |
| `CLOUD_S3_BUCKET` | 当前环境的私有 bucket |
| `CLOUD_S3_ENDPOINT` | HTTPS S3 兼容地址；Supabase 示例 `https://<project-ref>.storage.supabase.co/storage/v1/s3` |
| `CLOUD_S3_ACCESS_KEY_ID` | 服务端对象访问凭据 |
| `CLOUD_S3_SECRET_ACCESS_KEY` | 服务端对象访问 Secret |
| `CLOUD_OBJECT_ENV` | `prod` / `staging` / `dev`，显式设置 |
| `CLOUD_ACCOUNT_QUOTA_BYTES` | 完整 Backup 预留总额度，默认 5368709120；不能当作 Replica 总量配额承诺 |
| `CLOUD_MIGRATION_DATABASE_URL` | 仅迁移时提供的独立管理员连接串，不注入 HTTP 服务 |
| `CLOUD_WORKER_DATABASE_URL` | 独立 Backup 校验 LOGIN，仅 worker 使用 |

测试密码模式不需要 `CLOUD_AUTH_URL`、`CLOUD_AUTH_KEY`、SMTP 或 OTP。未设置 `CLOUD_AUTH_MODE` 时仍是原 Supabase 模式；测试模式关闭两组 API 的 OTP、callback 和 refresh 入口，并拒绝其他 provider 的旧会话。不要把正式 Auth 与测试 provider 的账户映射当作自动迁移；未来替换身份验证时保留内部 Account ID，Dexie / Replica / 业务模型不需改动。

`NEXT_PUBLIC_LIFE_CLOUD_API_ORIGIN` 是唯一需写入 APK 的公开 API Origin，见第 7 节。密码、密码哈希、数据库连接串、对象 Secret 和 AI Key 均不得使用 `NEXT_PUBLIC_` 前缀。此阶段无需配置 AI。

## 4. PostgreSQL 初始化

由数据库操作者提供迁移连接，顺序执行现有四个 migration。此命令只需要 `CLOUD_MIGRATION_DATABASE_URL`，不需要先有应用/worker LOGIN：

```bash
npm run cloud:migrate
```

实际顺序：

1. `infrastructure/cloud/001-foundation.sql`：账户、Session、Backup 元数据和 RLS。
2. `002-roles.sql`：`life_cloud_app` / `life_cloud_worker` 两个 NOLOGIN 能力角色。
3. `003-immutable-snapshots.sql`：完整 Backup 的不可变保护。
4. `004-replica.sql`：writer / epoch、mutation log、原图目录、七张 Replica 表及 RLS。

密码认证复用现有 accounts / sessions，不需要第五个 migration。应用请求和构建不会执行 DDL。

由 DBA 建立两个不同的 LOGIN，分别授予一个能力角色。通过数据库秘密管理界面设置强随机数据库密码；不要把密码写在 SQL 历史、Git 或 AI 对话中：

```sql
CREATE ROLE life_cloud_app_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT life_cloud_app TO life_cloud_app_login;
CREATE ROLE life_cloud_worker_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT life_cloud_worker TO life_cloud_worker_login;
```

设置密码后将各自连接串放入相应秘密环境。HTTP LOGIN 不能是 schema/table owner，不能属于 worker，也不能绕过 RLS。远端 PostgreSQL 验证 TLS；当前适配器包含 Supabase Root CA，不要使用 `rejectUnauthorized=false` 或开发机绝对 CA 路径。其他数据库供应商需按其 CA 配置并验证连接，不能靠关闭验证解决。

迁移身份可执行以下无正文检查：

```sql
SELECT version FROM life_cloud.schema_migrations ORDER BY version;
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles WHERE rolname IN ('life_cloud_app_login','life_cloud_worker_login');
```

预期 migration 为 1、2、3、4；两个 LOGIN 的高权限标志均为 false。迁移后移除 HTTP 服务环境中的迁移连接串。

## 5. 初始化两个测试账号

测试阶段只开放 `kele` 和 `wzj`。初始口令由操作者通过服务器秘密通道提供，与产品任务书一致；**不得写入 Git、APK、公开前端或本指南**。这不是程序默认值，也不是公开注册能力；必须在服务器显式初始化。脚本只生成带独立随机盐的 scrypt 哈希，不连接数据库、不输出明文密码。账户在首次成功登录时建立，以 provider `life-test-password` 和固定 username subject 唯一映射到稳定 UUID；重启、重复登录或更换哈希不会改变 Account ID。

密码不能写死在客户端、APK 或公开前端代码中。服务端只能保存密码哈希或通过服务器环境配置初始化。每个账号必须拥有稳定独立的 accountId。

在服务器受控终端中隐藏输入两次密码；当前阶段两次均输入秘密通道中的初始测试口令：

```bash
read -r -s -p 'kele initial password: ' CLOUD_TEST_KELE_PASSWORD
printf '\n'
read -r -s -p 'wzj initial password: ' CLOUD_TEST_WZJ_PASSWORD
printf '\n'
export CLOUD_TEST_KELE_PASSWORD CLOUD_TEST_WZJ_PASSWORD
node_modules/.bin/tsx scripts/cloud-init-test-accounts.ts > /tmp/life-test-account-hashes.env
unset CLOUD_TEST_KELE_PASSWORD CLOUD_TEST_WZJ_PASSWORD
chmod 600 /tmp/life-test-account-hashes.env
```

将生成文件中的 `CLOUD_AUTH_MODE` 与两个 `*_PASSWORD_HASH` 值通过服务器编辑器/秘密管理系统填入配置，避免在聊天中展示。确认配置后删除这个临时文件。脚本还支持 `npm run cloud:init-test-accounts -- --stdin`，从受控管道读取 JSON `{"kele":"…","wzj":"…"}`；不要在 shell 命令行写密码。运行 `npm run cloud:init-test-accounts -- --help` 查看接口。

测试模式 Session 有效期 30 天，退出撤销服务端会话；过期需重新登录。更改哈希后重启 Node 进程。哈希轮换保留账号 UUID，也不会自动撤销已签发会话；需要强制所有设备重新登录时，由操作者按账户撤销 sessions。未来正式认证应替换此测试 provider。

## 6. 私有对象存储

1. 为当前环境创建私有 bucket，关闭公开读取，启用服务商静态加密。备份与 Replica 使用不同对象前缀；Replica 对象为 `{env}/replica/{accountId}/…`。
2. 服务端凭据只授予所需对象读写；应用无对象删除入口。保留已完成 Backup 对象，不给它们配置自动过期。Supabase S3 不要求 Versioning。
3. Web 存储 CORS 只允许 `CLOUD_APP_ORIGIN`，方法 GET/PUT，允许上传头 `content-type`、`x-amz-checksum-sha256`。不要增加 `https://localhost`；Android 使用 CapacitorHttp。
4. 验证 S3 实现支持签名 PUT 的 Content-Length / Content-Type / SHA-256 checksum，以及原字节 GET。服务端上传确认会重新读取对象并检查长度和摘要；恢复端还会再次验证。
5. 单张 Replica 原图上限 32 MiB，单 mutation 上限 4 MiB；超限停止云上传并保留本机原图。完整恢复还受现有归档和设备可用空间上限约束，不会截断恢复。

对象 URL 有效期 180 秒，是短期能力链接。API 退出后立即拒绝旧 Session；退出前已签发的 URL 仍可能在这 180 秒内有效。不要记录、分享或缓存签名 URL。不要让代理记录请求正文、Authorization、Cookie、密码或签名查询串。

PostgreSQL 备份不包含 bucket 原图。分别配置数据库 PITR/独立备份和对象副本，并在隔离环境核对恢复关系、所有原图及 SHA-256。

## 7. Web 与 Android 构建

在没有服务器秘密的构建环境运行检查，Web / native 构建必须顺序执行：

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Web 使用 `npm run start -- --hostname 127.0.0.1 --port 3000` 启动，运行时注入第 3 节配置。不要把 `out/` 当作 Web 服务部署。Netlify 部署使用仓库 `netlify.toml` 的 `npx next build --webpack` 设置。

Android 在干净构建环境只提供公开 API Origin：

```powershell
$env:NEXT_PUBLIC_LIFE_CLOUD_API_ORIGIN = 'https://life.example.com'
npm run test:native-static
npx cap sync android
$env:JAVA_HOME = '<JDK 21 安装目录>'
$env:ANDROID_HOME = '<Android SDK 安装目录>'
& .\android\gradlew.bat -p android assembleDebug
```

APK：`android/app/build/outputs/apk/debug/app-debug.apk`，包名 `app.kelelega.life`。这是 debug 测试包。修改 API Origin 后必须重新导出、同步和构建，服务器运行时改环境变量不会改变已安装 APK。APK 使用本地静态资源和 Dexie，不配置远程 `server.url`，不包含服务端 API 或服务器 `.env`。

## 8. Node 服务与 HTTPS

`/etc/systemd/system/life.service`：

```ini
[Unit]
Description=Life Next.js
After=network.target

[Service]
Type=simple
User=life
WorkingDirectory=/opt/life
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Next 运行时读取该目录 `.env.local`。用 `sudo systemctl daemon-reload` 和 `sudo systemctl enable --now life` 启动。进程只监听 loopback，由 nginx 提供公网 HTTPS。先配置域名解析和 HTTP 站点，再用 certbot 获取证书，最后启用 HTTPS；不要在证书文件不存在时加载引用它的 nginx 配置。

已取得证书后的 nginx 示例：

```nginx
server {
    listen 80;
    server_name life.example.com;
    return 301 https://life.example.com$request_uri;
}
server {
    listen 443 ssl;
    server_name life.example.com;
    ssl_certificate /etc/letsencrypt/live/life.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/life.example.com/privkey.pem;
    client_max_body_size 8m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 90s;
    }
}
```

原图直接传到私有存储，不经过 nginx JSON API。公网只放行 80/443；Node 和数据库无需对公众开放。`sudo nginx -t` 后重载。不要在代理层通配开放 CORS，也不要把原生 `https://localhost` 加入 Web Cookie/CSRF 白名单。

完整 Backup 的独立校验任务可在服务器定时执行 `npm run cloud:verify`。使用独立 worker 身份和配置；HTTP 服务不持有 worker/迁移身份。未部署 worker 时用户页面仍可推进校验，但关闭页面后不能保证自动完成。

## 9. 健康检查与验收

未登录只读取配置状态，不输出正文或秘密：

```bash
curl --fail --silent --show-error https://life.example.com/api/cloud/account
curl --fail --silent --show-error https://life.example.com/api/replica/account
```

预期均为 `configured: true`、`authMode: "test-password"`、`account: null`。未配置时可能返回 HTTP 200 且 `configured: false`，监控必须检查 JSON，不能只检查状态码。这两个入口检查配置、数据库角色和相应 migration；不证明 S3 写读成功。无会话访问 `/api/replica/status` 应返回 401。认证请求与响应均应为 `Cache-Control: no-store`。

用两个全新浏览器上下文和指定测试账号执行以下步骤，内容只用合成数据；不要打开个人工作库做演练：

1. 错误密码拒绝；`kele` / `wzj` 正确登录。Web Cookie 为 HttpOnly/Secure/SameSite；Web 响应不含 accessToken。Native 使用 HTTPS Bearer，重启应用仍识别已保存会话。
2. kele 创建含原图的 Moment、Append、Diary，以及已有 Fake Lab 的 Job / Proposal / LifeEvent，包含已审核、软删除与恢复状态。确认先保存本机，首次上传需要明确同意归属。
3. 断网继续保存，退出/重启应用后检查本机记录和 pending 仍在；联网或手动重试完成，状态和最近同步时间来自已确认进度。重复发送同一个 mutationId 不增加云提交数。
4. 查看 `/account` 的本机七类数量、待上传数、云端数量和最近同步。上传确认后，所有原图长度和 SHA-256 必须一致。
5. 退出 kele，再登录 wzj：不显示 kele 生活库和云记录，不上传 kele 的 outbox；wzj 请求 kele 的对象/备份/账号不获授权。相同业务 ID 也只能作用于当前账号。
6. 重新登录 kele，在有本地数据时点击“从云端恢复/同步”。恢复完成后原库仍是当前库，只有明确“确认切换到恢复的生活库”才切换。对照七表 IDs / 原文 / 时间戳 / tombstone / 指纹 / Proposal 状态及每张原图。断流、缺图、错误摘要时应停止，无半成品可切换。
7. 在下载与确认切换间产生新的云提交，应返回 `snapshot_stale`，不提前 fence 当前写者；重新下载后再确认。成功切换后旧写者上传为 `409 fenced`，本机记录仍可用。
8. 独立验证 `.life.zip` 导出/文件恢复和 Web“备份现在”：完整 Backup 校验后可恢复，旧完整快照不因 Replica 上传或软删除而改变。关页后 worker 能继续验证已提交 Backup。

自动化：`npm test` 使用隔离 IndexedDB、PGlite 和内存对象存储；`npm run test:e2e` 使用合成浏览器数据与测试云适配器；它们不替代真实域名、TLS、S3 权限/CORS和实体设备验收。旧 `cloud:otp` / `cloud:replica-drill` 等脚本使用 Supabase OTP，不适用于测试密码模式，不要用它们验证本模式。

## 10. 常见故障

| 现象/错误码 | 处理 |
| --- | --- |
| 显示邮箱登录而非用户名 | 确认服务端 `CLOUD_AUTH_MODE=test-password` 并重启；APK 确认指向新部署 |
| `configured: false` / `cloud_unconfigured` | 检查必需环境变量、两个哈希格式和 S3 endpoint；不要打印秘密来排错 |
| `unsafe_database_role` | HTTP 使用了 owner/superuser/worker，改为独立 app LOGIN |
| `migration_required` | 用迁移身份按 001→004 执行，重新检查版本表 |
| 401 / 登录过期 | 重新登录；旧 Session 不授权；本机保存和文件导出仍可用 |
| `rate_limit` | 等待登录限流窗口，检查代理是否可靠覆盖来源 IP；不要取消限流 |
| `account_changed` / `binding_mismatch` | 停止当前云操作，重新打开账户页并核对账户与库，不改 accountId 绕过 |
| `fenced` / `writer_exists` | 另一生活库持有写权限。先导出本机新记录，明确恢复云副本后切换；不自动合并 |
| `snapshot_stale` | 云端在恢复期间更新，重新下载并确认；旧本机库保留 |
| 原图签名/CORS/摘要失败 | 检查私有 bucket、精确 Origin、上传头、服务商 checksum 支持和服务器时钟 |
| `blob_too_large` / 空间不足 | 本机原图保留，释放设备空间或使用受支持大小；不以跳过图片完成恢复 |
| 退出时断网 | 本机立即清理有效登录并隔离原库；联网后先重试撤销，再允许新的云操作 |
| 多标签页阻止切换 | 先保存并关闭其他 Life 标签页；不清空 IndexedDB 排错 |
| Android API 不通 | 核对 APK 烘焙 HTTPS Origin、证书、DNS、服务器版本；重新构建不会替用户上传记录 |

部署后保留应用日志中的状态码与非内容错误码即可。不要提交 `.env*`、密码/哈希、数据库连接串、Session/OTP、私钥、签名 URL、APK keystore 或真实 Life 数据。完成本指南中的往返验收后停止；不开始多设备实时冲突合并。
