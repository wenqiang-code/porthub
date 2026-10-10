# Projects Manager —— Kimi 项目与端口管理中心

解决 Kimi 每生成一个新项目就占用一个新端口、端口越来越乱的问题:
**所有新项目统一在这里登记并申请端口**,分配规则集中管理、可配置、可扩展。

## 功能

- **层级模型**: 项目(Kimi 工作的根目录) → 子项目(模块,各自可有端口);根项目可不占端口,删除根项目级联删除子项目并回收所有端口
- **项目管理**: 树形表格展示层级;创建/编辑/删除项目,记录名称、父项目、类别、路径、描述、状态、端口
- **批量管理**: 多选项目后批量删除(回收端口)/挂载到项目/修改状态/修改类别;CLI 可按 id 列表、父项目或全部项目批量操作
- **公共服务**: 统一维护 MySQL/Redis/Nacos 等服务的连接信息;项目创建时一键获取配置,mysql schema、nacos namespace、redis db 等动态资源按项目自动分配(幂等、互不冲突);类型注册表可扩展
- **端口分配**: 创建项目时自动分配端口;删除项目自动回收端口
- **分配策略可插拔**:
  - `segmented` 分段分配(默认): web→3000-3999, api→4000-4999, service→5000-5999, tool→8000-8999,段内取最小可用端口
  - `sequential` 全局顺序分配
  - `random` 段内随机分配
  - 扩展新策略只需在 `server/allocator.js` 的 `STRATEGIES` 中加一个函数
- **端口池总览**: 各分段使用率可视化,端口占用检查(含本机实际占用探测)
- **保留端口**: 永不分配(如管理服务自身的 9000)
- **注册纳管**: Kimi 运行/操作任何项目前,先把项目当前端口注册进池;端口合规则原样登记,冲突或不合规则自动调整并返回新端口
- **扫描导入**: 扫描磁盘目录发现所有项目(解析 .env / vite.config / package.json scripts 探测端口),一键批量纳管,冲突自动调整
- **CLI 工具**: `cli/portctl.js`,Kimi 通过它申请/注册/释放端口,输出机器可读 JSON

## 快速开始

```powershell
# 首次: 安装依赖并构建前端
npm run setup

# 启动(管理服务固定占用 9000 端口)
npm start
```

打开 http://localhost:9000 即可使用 Web 界面。

首次登录默认账号为 `admin`，密码为 `admin`。生产部署请通过 `PM_ADMIN_USERNAME`、`PM_ADMIN_PASSWORD` 和 `PM_AUTH_SECRET` 环境变量覆盖默认值，避免使用默认凭据。

### Docker 部署

使用 Docker Compose 构建并启动，项目数据会保存到 `projectsmanager-data` 卷中：

```bash
docker compose up -d --build
```

打开 http://localhost:9000 即可访问。停止容器但保留数据：

```bash
docker compose down
```

如需修改管理服务端口，可同时修改 `docker-compose.yml` 中的端口映射和 `PM_PORT`，例如 `9001:9001` 与 `PM_PORT: 9001`。

### 一键启动 / 停止 / 重启(后台运行)

根目录提供一键脚本,双击 `.bat` 或命令行执行均可:

| 文件 | 作用 |
|---|---|
| `start.bat` | 后台启动(隐藏窗口,日志写入 `.run/`) |
| `stop.bat` | 停止服务 |
| `restart.bat` | 重启服务 |
| `status.bat` | 查看运行状态与健康检查 |

也可以直接用 PowerShell 调用: `powershell -NoProfile -ExecutionPolicy Bypass -File .\pmctl.ps1 start\|stop\|restart\|status`。
端口可用环境变量 `PM_PORT` 覆盖(默认 9000)。

开发模式(前端热更新,端口 5173 代理到 9000):

```powershell
npm run dev:server   # 终端 1
npm run dev:client   # 终端 2
```

## Kimi 申请端口的方式

### 方式一: CLI(推荐)

```powershell
# 新项目开工前,申请端口(输出最后一行是 JSON,port 字段即分配结果)
node cli/portctl.js request --name my-app --category web --path D:\projects\my-app

# 预览下一个可分配端口
node cli/portctl.js next --category web

# 检查某端口状态
node cli/portctl.js check --port 3000

# 项目废弃,删除并回收端口
node cli/portctl.js release --name my-app

# 其他: list / pool
```

服务端地址默认 `http://localhost:9000`,可用环境变量 `PM_API` 覆盖。

#### 运行/操作已有项目前: 注册端口(必须)

```powershell
# 根目录先登记为根项目(不占端口)
node cli/portctl.js register --name my-app --path D:\projects\my-app
# 模块注册端口并挂到根项目下
node cli/portctl.js register --name my-app-web --port 5173 --parent my-app
# 输出 changed=false → 端口合规, 直接用
# 输出 changed=true  → 端口冲突/不合规, 必须把项目配置改为返回的新端口再运行
```

#### 公共服务配置(项目获取连接信息)

```powershell
node cli/portctl.js services                    # 查看已配置的公共服务
node cli/portctl.js config --name my-app        # 获取全部服务配置(KEY=VALUE + JSON)
node cli/portctl.js config --name my-app --services mysql,nacos
```

返回的 env 可直接写入 `.env` 或转成 `application.yml`;mysql schema、nacos namespace、redis db 按项目幂等分配。

#### 批量管理已有项目

```powershell
# 按父项目批量操作(也支持 --ids id1,id2 或 --all)
node cli/portctl.js batch --parent my-app --action setStatus --value stopped
node cli/portctl.js batch --ids id1,id2 --action setParent --value other-root
node cli/portctl.js batch --parent old-app --action delete          # 批量删除并回收端口
```

Web 界面「项目管理」勾选表格前的复选框即可出现批量操作栏。

#### 批量纳管磁盘上的项目

```powershell
node cli/portctl.js scan --root D:\projects              # 预览, 不修改数据
node cli/portctl.js scan --root D:\projects --register   # 一键注册, 冲突自动调整
```

也可以在 Web 界面「项目管理 → 扫描导入已有项目」中操作。

### 方式二: HTTP API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 项目列表(支持 keyword/parent/category/status 过滤,parent=none 表示只看根项目) |
| POST | `/api/projects` | 创建项目 `{name, category?, parent?, noPort?, port?, path?}` |
| POST | `/api/projects/register` | 注册/纳管 `{name, port?, parent?, path?}`,不传 port 登记为根项目;冲突自动调整 |
| POST | `/api/projects/batch` | 批量操作 `{ids, action: delete/setParent/setStatus/setCategory, value?}` |
| GET/POST | `/api/services` | 公共服务列表 / 新增 `{type, name, config}` |
| PUT/DELETE | `/api/services/:id` | 更新 / 删除服务(级联释放分配记录) |
| GET | `/api/services/types` | 服务类型注册表(字段与可分配资源) |
| GET | `/api/services/:id/allocations` | 服务的动态资源分配记录 |
| DELETE | `/api/services/allocations/:id` | 释放单条分配 |
| POST | `/api/services/provision` | 项目获取配置 `{projectName, serviceIds?}`,幂等分配动态资源 |
| POST | `/api/projects/scan` | 扫描磁盘项目 `{root, depth?, register?}` |
| PUT | `/api/projects/:id` | 更新项目 |
| POST | `/api/projects/:id/reallocate` | 释放旧端口并重新分配 |
| DELETE | `/api/projects/:id` | 删除项目并回收端口 |
| GET | `/api/ports/pool` | 端口池总览 |
| GET | `/api/ports/next?category=web` | 预览下一个可分配端口 |
| GET | `/api/ports/check/:port` | 检查端口(保留/已分配/本机占用) |
| GET/PUT | `/api/settings` | 读取/更新策略、保留端口、分段配置 |

## 目录结构

```
projectsmanager/
├── server/              # Express 后端
│   ├── index.js         # 入口,托管 API 与前端构建产物
│   ├── store.js         # JSON 持久化(原子写入,接口稳定,可换 SQLite)
│   ├── allocator.js     # 端口分配器(策略模式,可插拔扩展)
│   ├── registrar.js     # 注册纳管逻辑(端口合规裁决 + 冲突自动调整)
│   ├── scanner.js       # 磁盘项目扫描与端口探测
│   ├── parents.js       # 父子层级解析(自动创建根项目、防环、级联收集)
│   ├── services.js      # 公共服务类型注册表与动态资源分配(schema/namespace/db)
│   └── routes/          # projects / ports / settings / services 路由
├── client/              # Vue3 + Element Plus 前端
│   └── src/views/       # Projects / Ports / Settings 三个页面
├── cli/portctl.js       # Kimi 申请端口的命令行工具
├── pmctl.ps1            # 一键启动/停止/重启/状态脚本(start.bat 等为其双击入口)
├── AGENTS.md            # 给 Kimi 的端口申请规范
└── package.json         # 便捷脚本
```

## 端口分配规则说明

1. 管理服务自身固定使用 **9000**(保留,不可申请,可用 `PM_PORT` 环境变量改)
2. 项目端口按类别分段分配,段内取最小可用端口,删除项目后端口立即回收复用
3. 分段配置、保留端口、分配策略均可在「分配策略」页面或 `/api/settings` 修改,
   修改时会自动校验: 分段不重叠、已分配端口不落空、保留端口不冲突
4. 端口池满时返回 507,提示调整分段配置

## 让规则真正生效

把根目录 `AGENTS.md` 的内容复制到 Kimi 的全局指令(如 `C:\Users\<你>\.kimi\AGENTS.md`)
或每个项目工作区的 `AGENTS.md` 中,Kimi 在创建任何新项目前就会先申请端口。
