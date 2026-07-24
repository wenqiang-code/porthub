/**
 * 本机进程工具 —— 查询端口占用进程 / 结束进程。
 *
 * Windows: netstat -ano 解析 LISTENING 行拿 PID,tasklist 查进程名,taskkill 结束。
 * 其他平台: lsof 拿 PID,process.kill 结束。
 */
const { execFile } = require('child_process');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout);
    });
  });
}

/** 根据 PID 查进程名(失败返回空串) */
async function processName(pid) {
  try {
    if (process.platform === 'win32') {
      const out = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
      const m = out.match(/^"([^"]+)"/);
      return m ? m[1] : '';
    }
    const out = await run('ps', ['-p', String(pid), '-o', 'comm=']);
    return out.trim();
  } catch {
    return '';
  }
}

/**
 * 查找正在监听指定端口的本机进程。
 * 返回 [{ pid, name }] (可能多个,如 IPv4/IPv6 分别监听同端口)。
 */
async function findPortOwners(port) {
  const pids = new Set();
  if (process.platform === 'win32') {
    const out = await run('netstat', ['-ano', '-p', 'tcp']);
    for (const line of out.split(/\r?\n/)) {
      const cols = line.trim().split(/\s+/);
      // 形如: TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  12345
      if (cols.length >= 5 && cols[3].toUpperCase() === 'LISTENING') {
        const local = cols[1];
        const p = Number(local.slice(local.lastIndexOf(':') + 1));
        if (p === port) pids.add(Number(cols[4]));
      }
    }
  } else {
    let out = '';
    try {
      out = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
    } catch {
      return []; // lsof 无匹配时以非零码退出
    }
    out.split(/\r?\n/).forEach(s => {
      const pid = Number(s.trim());
      if (pid) pids.add(pid);
    });
  }
  const owners = [];
  for (const pid of pids) {
    owners.push({ pid, name: await processName(pid) });
  }
  return owners;
}

/** 强制结束指定 PID 的进程。 */
async function killPid(pid) {
  if (process.platform === 'win32') {
    await run('taskkill', ['/PID', String(pid), '/F']);
  } else {
    process.kill(pid, 'SIGKILL');
  }
}

module.exports = { findPortOwners, killPid, processName };
