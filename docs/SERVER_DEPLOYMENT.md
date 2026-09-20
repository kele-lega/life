# 自建云服务器部署

这份说明把现有 Next.js Web/PWA 部署到自己的 Linux 云主机。  
Android APK 是本地静态壳，不把用户记录上传到这台服务器。

仓库：https://github.com/kele-lega/life.git

## 服务器实际提供什么

- 网页应用（记录、日记、时间线、日历、搜索、生活地图、账户页）
- 可选：同源 AI 提取 `/api/*`
- 可选：账号登录、手动云备份 `/api/cloud/*`、可靠云副本 `/api/replica/*`

不提供：

- 双向同步
- 把 IndexedDB 里的随笔/日记自动搬到服务器数据库
- 生产 Android 通过 `server.url` 套现网

记录默认仍在用户设备的 IndexedDB。换域名不会带走旧数据。部署代码不等于迁移个人记录。

## 1. 主机要求

- Ubuntu 22.04 / 24.04（或其他 systemd Linux）
- 公网 IP 与已解析的 HTTPS 域名：`https://life.kelelega.dpdns.org`
- Node.js **24.x**（>= 24.15）
- nginx
- 防火墙放行 80/443

不要用静态文件托管（纯 Nginx 目录、GitHub Pages）发布 `.next`。Web 需要 Node 运行时，因为存在 `/api` 与动态 `/diary/[id]`。

## 2. 安装 Node 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
node -v   # 应显示 v24.x
```

## 3. 拉取代码

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin life
sudo mkdir -p /opt/life
sudo chown "$USER":"$USER" /opt/life
git clone https://github.com/kele-lega/life.git /opt/life
cd /opt/life
git checkout main
npm ci
```

`.env*` 已被 Git 忽略，密钥只能放在服务器本地。

## 4. 环境变量

```bash
cp .env.example .env.local
chmod 600 .env.local
```

最小可运行：不填任何密钥。本地记录、导出 `.life.zip`、从文件恢复都可以用。

若启用 AI 提取，填写服务端变量（禁止 `NEXT_PUBLIC_`）：

```bash
AI_PROVIDER=openai
AI_API_KEY=...
AI_MODEL=gpt-5.6-terra
AI_BASE_URL=https://api.openai.com/v1
AI_ALLOWED_ORIGIN=https://life.kelelega.dpdns.org
```

`AI_ALLOWED_ORIGIN` 必须与浏览器地址栏源完全一致。

若启用账户登录、手动云备份或 16B.1 可靠云副本，再填写 Cloud Foundation 变量。本机部署可用用户名密码（`CLOUD_ACCOUNTS`）与本地对象目录，不必使用邮箱 OTP。其中：

```bash
CLOUD_APP_ORIGIN=https://life.kelelega.dpdns.org
CLOUD_OBJECT_ENV=prod
NEXT_PUBLIC_LIFE_CLOUD_API_ORIGIN=https://life.kelelega.dpdns.org
```

`CLOUD_APP_ORIGIN` 必须是精确 Origin：HTTPS、无路径、无尾斜杠。`NEXT_PUBLIC_LIFE_CLOUD_API_ORIGIN` 只给 Android APK 在 `native:web` 时烘焙；Web/PWA 走同源 `/api/replica`，不要把 `https://localhost` 加入 CORS/CSRF 白名单。`npm run cloud:migrate` 现包含 `004-replica.sql`。绑定账户不会自动改写本机记录；断网或 Session 过期不得阻止本地保存。Replica 是增量可靠副本，不能替代 16A 手动不可变备份。

## 5. 构建并试运行

```bash
cd /opt/life
npm run build
PORT=3000 npm run start -- --hostname 127.0.0.1 --port 3000
```

本机应能打开 `http://127.0.0.1:3000`。确认后停掉前台进程，改用 systemd。

## 6. systemd

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
Environment=PORT=3000
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R life:life /opt/life
sudo systemctl daemon-reload
sudo systemctl enable --now life
sudo systemctl status life
```

`.env.local` 放在 `/opt/life` 后，`next start` 会自动读取。不要把该文件提交进 Git。

## 7. nginx + HTTPS

`/etc/nginx/sites-available/life`：

```nginx
server {
    listen 80;
    server_name life.kelelega.dpdns.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name life.kelelega.dpdns.org;

    ssl_certificate     /etc/letsencrypt/live/life.kelelega.dpdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/life.kelelega.dpdns.org/privkey.pem;

    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/life /etc/nginx/sites-enabled/life
sudo nginx -t
sudo systemctl reload nginx
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d life.kelelega.dpdns.org
```

证书申请前可先只开 80，再让 certbot 写入 SSL。

## 8. 更新发布

```bash
cd /opt/life
sudo -u life git pull --ff-only origin main
sudo -u life npm ci
sudo -u life npm run build
sudo systemctl restart life
```

发布只更新程序。不会读取、迁移或覆盖任何人的浏览器 IndexedDB。

## 9. 账号数据怎么保存

| 方式 | 是否要登录 | 数据在哪 | 用途 |
| --- | --- | --- | --- |
| 本机 IndexedDB | 否 | 当前浏览器 / Android WebView | 日常记录，local-first 主库 |
| 导出 `.life.zip` | 否 | 用户下载的文件 | 换设备、备份 |
| 手动云备份 | 是（邮箱 OTP） | PostgreSQL 目录 + 私有对象存储 | 不可变完整快照 |
| 双向同步 | 未实现 | — | 不要自建 |

正确搬家顺序：本机记录 → 导出 zip 或手动云备份 → 新设备恢复到**独立生活库** → 确认后再打开恢复库。原库不会被覆盖。

Android 应用 ID 为 `app.kelelega.life`，数据在 App 自己的 WebView origin（`https://localhost`），与电脑浏览器、正式网页域名都不共用。

## 10. Android APK

APK 不在这台云服务器上构建，也不把现网设为 Capacitor `server.url`。

在开发机：

```powershell
npm ci
npm run native:web
npx cap sync android
```

用 JDK 21 + Android SDK 编译：

```powershell
cd android
.\gradlew.bat assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`  
该文件已被 Git 忽略，不要提交密钥库或 `local.properties`。

## 11. 上线检查

1. `https://life.kelelega.dpdns.org` 能打开首页并保存一条随笔。
2. 刷新后原文仍在。
3. `/account` 能导出 `.life.zip`。
4. 未配置云服务时，账户页提示云不可用，本地导出/恢复仍可用。
5. 未配置 AI 时，保存记录成功，整理失败不得导致保存失败。
6. 不要放宽现有 CORS、CSRF、Cookie 边界。

当前正式站状态见 [部署状态](DEPLOYMENT.md)。Cloud Foundation 操作见 [PHASE16A_CLOUD_OPERATIONS.md](PHASE16A_CLOUD_OPERATIONS.md)。
