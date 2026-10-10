#!/usr/bin/env node
/**
 * portctl —— Kimi 申请/注册/管理端口的命令行工具。
 *
 * 层级模型: 项目(Kimi 工作的根目录) → 子项目(模块,各自可有端口)。
 *
 * 用法:
 *   node cli/portctl.js request --name <名> [--category web|api|service|tool] [--parent <父项目>] [--path "..."] [--port 3123] [--no-port]
 *   node cli/portctl.js register --name <名> [--port <当前使用端口>] [--parent <父项目>] [--category ...] [--path "..."]
 *        # 运行/操作项目前必须调用; 不传 --port 表示登记根项目/目录; changed=true 时必须改项目端口配置
 *   node cli/portctl.js scan --root <目录> [--depth 2] [--register] [--parent <父项目>]
 *        # 扫描磁盘上的项目; 若 root 含 package.json,自动作为根项目,模块挂为其子项目
 *   node cli/portctl.js release --name <名>                # 删除项目(含其子项目)并回收端口
 *   node cli/portctl.js batch --action <delete|setParent|setStatus|setCategory> [--value <值>]
 *        [--ids id1,id2 | --parent <父项目> | --all]       # 批量操作
 *   node cli/portctl.js list [--parent <父项目>]            # 树形列出项目
 *   node cli/portctl.js check --port 3001                  # 检查端口状态
 *   node cli/portctl.js next [--category web]              # 预览下一个可分配端口
 *   node cli/portctl.js pool                               # 端口池总览
 *   node cli/portctl.js services                           # 公共服务列表(mysql/redis/nacos…)
 *   node cli/portctl.js config --name <项目名> [--services mysql,redis]
 *        # 获取项目的公共服务配置; 动态资源(schema/namespace/db)幂等分配
 *
 * 服务端地址默认 http://localhost:9000,可用环境变量 PM_API 覆盖。
 * 输出最后一行始终是机器可读的 JSON,便于脚本解析。
 */
const API = process.env.PM_API || 'http://localhost:9000';
let authToken = process.env.PM_AUTH_TOKEN || '';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(argv[i]);
    }
  }
  return args;
}

async function call(method, url, body) {
  if (!authToken && url !== '/api/auth/login') {
    const login = await fetch(API + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: process.env.PM_ADMIN_USERNAME || 'admin', password: process.env.PM_ADMIN_PASSWORD || 'admin' })
    });
    if (login.ok) authToken = (login.headers.get('set-cookie') || '').match(/pm_session=([^;]+)/)?.[1] || '';
  }
  const res = await fetch(API + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authToken ? { Authorization: `Bearer ${decodeURIComponent(authToken)}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function out(data, humanLines = []) {
  humanLines.forEach(l => console.log(l));
  console.log(JSON.stringify(data)); // 最后一行固定为 JSON,便于 Kimi 解析
}

/** 以树形打印项目列表 */
function printTree(list) {
  const roots = list.filter(p => !p.parentId);
  const byParent = new Map();
  list.forEach(p => {
    if (p.parentId) {
      if (!byParent.has(p.parentId)) byParent.set(p.parentId, []);
      byParent.get(p.parentId).push(p);
    }
  });
  function line(p, prefix) {
    const port = p.port ? String(p.port) : '(无端口)';
    console.log(`${prefix}${port.padEnd(8)} ${p.category.padEnd(8)} ${p.status.padEnd(8)} ${p.name}  ${p.path || ''}`);
    (byParent.get(p.id) || []).forEach(c => line(c, prefix + '  └─ '));
  }
  roots.forEach(r => line(r, ''));
  // 父级不在当前列表里的孤儿(过滤场景)
  list.filter(p => p.parentId && !list.some(x => x.id === p.parentId)).forEach(p => line(p, ''));
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (cmd) {
    case 'request': {
      if (!args.name) throw new Error('缺少 --name 参数');
      const body = { name: args.name };
      if (args.category) body.category = args.category;
      if (args.parent) body.parent = args.parent;
      if (args.description) body.description = args.description;
      if (args.path) body.path = args.path;
      if (args.port) body.port = Number(args.port);
      if (args['no-port']) body.noPort = true;
      const proj = await call('POST', '/api/projects', body);
      out(proj, proj.port
        ? [`✔ 项目 "${proj.name}" 创建成功,分配端口: ${proj.port}`, `  请让该项目监听端口 ${proj.port}`]
        : [`✔ 根项目 "${proj.name}" 创建成功(不占用端口)`]);
      break;
    }
    case 'register': {
      if (!args.name) throw new Error('缺少 --name 参数');
      const body = { name: args.name };
      if (args.port) body.port = Number(args.port);
      if (args.category) body.category = args.category;
      if (args.parent) body.parent = args.parent;
      if (args.path) body.path = args.path;
      if (args.description) body.description = args.description;
      const r = await call('POST', '/api/projects/register', body);
      const lines = [];
      if (!r.project.port) {
        lines.push(`✔ 项目 "${r.project.name}" 已登记(根项目/目录,不占用端口)`);
      } else if (r.changed) {
        lines.push(`⚠ 端口冲突/不合规: ${r.reason}`);
        lines.push(`✔ 已为 "${r.project.name}" 重新分配端口: ${r.project.port}`);
        lines.push(`  必须立即把项目的端口配置改为 ${r.project.port} 再运行!`);
      } else {
        lines.push(`✔ 项目 "${r.project.name}" 已登记,端口 ${r.project.port} 可继续使用`);
      }
      if (r.hostOccupied) lines.push(`  提示: 端口 ${r.project.port} 当前在本机被占用(很可能就是该项目自己在运行)`);
      out(r, lines);
      break;
    }
    case 'scan': {
      if (!args.root) throw new Error('缺少 --root 参数');
      const body = { root: args.root };
      if (args.depth) body.depth = Number(args.depth);
      if (args.register) body.register = true;
      if (args.parent) body.parent = args.parent;
      const res = await call('POST', '/api/projects/scan', body);
      if (res.rootProject) console.log(`根项目: ${res.rootProject.name} (${res.rootProject.path})`);
      res.items.forEach(it => {
        const port = it.registeredPort ?? it.detectedPort ?? '-';
        console.log(`[${it.status.padEnd(12)}] ${String(port).padEnd(6)} ${it.name}  ${it.path}${it.note ? '  (' + it.note + ')' : ''}`);
      });
      out(res);
      break;
    }
    case 'release': {
      if (!args.name) throw new Error('缺少 --name 参数');
      const list = await call('GET', '/api/projects?keyword=' + encodeURIComponent(args.name));
      const proj = list.find(p => p.name === args.name);
      if (!proj) throw new Error(`项目 "${args.name}" 不存在`);
      const r = await call('DELETE', '/api/projects/' + proj.id);
      out(r, [`✔ 已删除 "${args.name}"(共 ${r.removedCount} 个项目,含子项目),回收端口: ${r.releasedPorts.join(', ') || '无'}`]);
      break;
    }
    case 'batch': {
      if (!args.action) throw new Error('缺少 --action 参数(delete / setParent / setStatus / setCategory)');
      let ids = null;
      if (args.ids) {
        ids = String(args.ids).split(',').map(s => s.trim()).filter(Boolean);
      } else {
        let url = '/api/projects';
        if (args.parent) {
          const all = await call('GET', '/api/projects');
          const parent = all.find(x => x.name === args.parent || x.id === args.parent || x.path === args.parent);
          if (!parent) throw new Error(`父项目 "${args.parent}" 不存在`);
          url += '?parent=' + encodeURIComponent(parent.id);
        }
        const list = await call('GET', url);
        ids = list.map(p => p.id);
      }
      if (ids.length === 0) throw new Error('没有匹配的项目');
      const body = { ids, action: args.action };
      if (args.value !== undefined && args.value !== true) body.value = args.value;
      const r = await call('POST', '/api/projects/batch', body);
      const lines = [`✔ 批量 ${args.action} 完成,影响 ${r.affected} 个项目`];
      if (r.releasedPorts && r.releasedPorts.length) lines.push(`  已回收端口: ${r.releasedPorts.join(', ')}`);
      out(r, lines);
      break;
    }
    case 'list': {
      let url = '/api/projects';
      if (args.parent) {
        const all = await call('GET', '/api/projects');
        const parent = all.find(x => x.name === args.parent || x.id === args.parent || x.path === args.parent);
        if (!parent) throw new Error(`父项目 "${args.parent}" 不存在`);
        // 父项目自身 + 其子项目
        const children = await call('GET', '/api/projects?parent=' + encodeURIComponent(parent.id));
        out([parent, ...children], []);
        printTree([parent, ...children]);
        break;
      }
      const list = await call('GET', url);
      printTree(list);
      out(list);
      break;
    }
    case 'services': {
      const list = await call('GET', '/api/services');
      list.forEach(s => {
        const addr = s.config && s.config.host ? `${s.config.host}:${s.config.port || ''}` : '';
        const st = s.enabled === false ? '停用' : '启用';
        console.log(`${st} ${s.type.padEnd(8)} ${s.name.padEnd(16)} ${addr.padEnd(22)} 分配数 ${s.allocCount}`);
      });
      out(list);
      break;
    }
    case 'config': {
      if (!args.name) throw new Error('缺少 --name 参数');
      const body = { projectName: args.name };
      if (args.services) body.serviceIds = String(args.services).split(',').map(s => s.trim());
      const r = await call('POST', '/api/services/provision', body);
      if (r.skippedDisabled && r.skippedDisabled.length) {
        console.log(`(已跳过停用的服务: ${r.skippedDisabled.join(', ')})`);
      }
      const keys = Object.keys(r.env);
      if (!keys.length) {
        console.log('(尚未配置任何公共服务, 请先在 PortHub「公共服务」页添加)');
      } else {
        keys.forEach(k => console.log(`${k}=${r.env[k]}`));
      }
      out(r);
      break;
    }
    case 'check': {
      if (!args.port) throw new Error('缺少 --port 参数');
      const r = await call('GET', '/api/ports/check/' + Number(args.port));
      out(r, [
        `端口 ${r.port}: reserved=${r.reserved}, allocatedTo=${r.allocatedTo ? r.allocatedTo.name : '无'}, hostFree=${r.hostFree}`
      ]);
      break;
    }
    case 'next': {
      const q = args.category ? '?category=' + encodeURIComponent(args.category) : '';
      const r = await call('GET', '/api/ports/next' + q);
      out(r, [`下一个可分配端口(${r.category}/${r.strategy}): ${r.port}`]);
      break;
    }
    case 'pool': {
      const pool = await call('GET', '/api/ports/pool');
      pool.forEach(s => console.log(`${s.category.padEnd(8)} ${s.start}-${s.end}  已用 ${s.usedCount}/${s.total}  空闲 ${s.freeCount}`));
      out(pool);
      break;
    }
    default:
      console.log(__filename.split(/[\\/]/).pop() + ' —— 命令: request | register | scan | release | batch | list | services | config | check | next | pool');
      console.log('示例: node cli/portctl.js register --name my-web --port 3000 --parent my-project --path D:\\projects\\my-project');
      process.exit(cmd ? 1 : 0);
  }
}

main().catch(err => {
  console.error('✘ ' + err.message);
  console.log(JSON.stringify({ error: err.message, status: err.status || null }));
  process.exit(1);
});
