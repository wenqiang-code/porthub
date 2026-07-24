# AGENTS.md —— 端口管理规范(所有项目必须遵守)

## 层级模型

**项目 = Kimi 工作的根目录; 项目下的模块(前端/后端/微服务) = 该项目的子项目,各自可以申请自己的端口。**

- 进入一个项目目录工作时,先把根目录登记为**根项目**(不占端口):
  ```powershell
  node D:\projects\npm\kimi\projectsmanager\cli\portctl.js register --name <项目名> --path <根目录>
  ```
- 目录下每个需要端口的模块登记为**子项目**,用 `--parent` 挂到根项目下:
  ```powershell
  node D:\projects\npm\kimi\projectsmanager\cli\portctl.js register --name <模块名> --port <模块端口> --parent <项目名> --path <模块路径>
  ```

## 强制规则一: 新项目必须先申请端口

**在创建任何需要监听端口的新项目/模块之前,必须先向项目管理中心申请端口号,严禁自行随意指定端口。**

项目管理中心运行在 `http://localhost:9000`(可用环境变量 `PM_API` 覆盖)。

## 强制规则二: 运行或操作已有项目前必须先注册端口

**每次要运行、调试、修改一个项目时(无论是否本系统创建),都必须先把该项目使用的端口注册到端口池。**

```powershell
node D:\projects\npm\kimi\projectsmanager\cli\portctl.js register --name <模块名> --port <当前使用的端口> --parent <项目名> --path <模块路径>
```

同一项目的所有模块必须使用相同的 `--parent`,形成统一的层级。

输出最后一行是 JSON,必须检查:

- `changed: false` → 端口合规,项目可按原端口运行。
- `changed: true` → 端口冲突或不合规(见 `reason` 字段),**必须先把项目配置(vite.config / .env / package.json scripts 等)里的端口改为返回的 `project.port`,再运行项目**。严禁无视调整结果继续用旧端口。
- `hostOccupied: true` → 该端口当前被本机进程占用(很可能就是项目自己在跑),注意先停掉旧进程。

## 强制规则三: 公共服务配置必须从 PortHub 获取

**项目需要 MySQL / Redis / Nacos 等公共服务时,严禁自行硬编码连接信息,必须从 PortHub 获取;schema、命名空间等动态资源由 PortHub 统一分配。**

```powershell
node D:\projects\npm\kimi\projectsmanager\cli\portctl.js config --name <项目名>
```

- 输出为 `KEY=VALUE` 环境变量行 + 最后一行完整 JSON,直接写入项目的 `.env` 或转换为 `application.yml`。
- 动态资源幂等分配: 同一项目重复获取,schema / namespace / redis db 不变;不同项目互不冲突。
- 可用 `--services mysql,redis` 只取部分服务;`portctl.js services` 查看已配置的公共服务。

## 批量纳管

需要把某个目录下的所有项目一次性纳入管理时:

```powershell
# 先预览(不修改任何数据),看清哪些项目端口合规/冲突
node D:\projects\npm\kimi\projectsmanager\cli\portctl.js scan --root D:\projects

# 确认后一键注册全部,冲突端口会被自动调整并在输出中标注
# 若 root 目录本身含 package.json,会自动作为根项目,扫描到的模块挂为其子项目
node D:\projects\npm\kimi\projectsmanager\cli\portctl.js scan --root D:\projects --register
```

### 申请流程

1. 新项目开工时,先登记根项目(如尚不存在),再为需要端口的模块申请端口:

   ```powershell
   # 根项目(不占端口,只需一次)
   node D:\projects\npm\kimi\projectsmanager\cli\portctl.js register --name <项目名> --path <根目录>
   # 模块申请端口
   node D:\projects\npm\kimi\projectsmanager\cli\portctl.js request --name <模块名> --category <web|api|service|tool> --parent <项目名> --path <模块路径>
   ```

2. 输出最后一行是 JSON,取其中 `port` 字段作为该项目**唯一允许使用**的端口。

3. 项目内的 dev server / 后端服务必须监听申请到的端口(vite/webpack/express 等都要显式配置该端口)。

4. 如果项目被废弃删除,必须回收端口:

   ```powershell
   node D:\projects\npm\kimi\projectsmanager\cli\portctl.js release --name <项目名>
   ```

### 类别选择

| category | 适用 | 默认端口段 |
|---|---|---|
| `web` | 前端 / 全栈 Web 项目 | 3000-3999 |
| `api` | 后端 / API 服务 | 4000-4999 |
| `service` | 微服务 / 长驻进程 | 5000-5999 |
| `tool` | 工具 / 其他 | 8000-8999 |

### 注意事项

- 端口 **9000** 是管理中心的保留端口,任何项目不得使用。
- 申请失败(409 重名 / 507 池满)时,先 `list` 检查现有项目,不要绕过分配器。
- 如需查看端口占用情况: `node ...\cli\portctl.js pool` 或 `check --port <端口>`。
- 若管理中心未运行,先启动它: `npm --prefix D:\projects\npm\kimi\projectsmanager start`。
