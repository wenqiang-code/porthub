/**
 * 公共服务注册表 —— MySQL / Redis / Nacos / 自定义。
 *
 * 每种服务类型声明:
 *  - fields:    连接信息字段(前端据此动态渲染表单,secret 字段用密码框)
 *  - resources: 可按项目动态分配的资源(mysql schema / nacos namespace / redis db)
 *               allocate(projectName, taken:Set) 返回一个不冲突的新值
 *
 * 扩展新服务类型: 在 SERVICE_TYPES 中增加一项即可,前后端自动支持。
 */
const crypto = require('crypto');

/** 项目名 → 合法标识符(小写字母/数字/下划线) */
function sanitize(name) {
  const s = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || 'app';
}

/** 生成不冲突的名称: base, base_2, base_3 … */
function uniqueName(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** 取范围内第一个空闲整数 */
function nextInt(taken, min, max) {
  for (let i = min; i <= max; i++) {
    if (!taken.has(String(i))) return String(i);
  }
  throw new Error(`可用 ${min}-${max} 已分配完`);
}

const SERVICE_TYPES = {
  mysql: {
    label: 'MySQL',
    fields: [
      { key: 'host', label: '主机', default: '127.0.0.1' },
      { key: 'port', label: '端口', default: 3306 },
      { key: 'username', label: '账号', default: 'root' },
      { key: 'password', label: '密码', secret: true }
    ],
    resources: {
      schema: {
        label: 'Schema',
        allocate: (projectName, taken) => uniqueName(sanitize(projectName), taken)
      }
    }
  },
  postgresql: {
    label: 'PostgreSQL',
    fields: [
      { key: 'host', label: '主机', default: '127.0.0.1' },
      { key: 'port', label: '端口', default: 5432 },
      { key: 'username', label: '账号', default: 'postgres' },
      { key: 'password', label: '密码', secret: true },
      { key: 'sslmode', label: 'SSL 模式', default: 'require' }
    ],
    resources: {
      database: {
        label: '数据库',
        allocate: (projectName, taken) => uniqueName(sanitize(projectName), taken)
      }
    }
  },
  redis: {
    label: 'Redis',
    fields: [
      { key: 'host', label: '主机', default: '127.0.0.1' },
      { key: 'port', label: '端口', default: 6379 },
      { key: 'password', label: '密码', secret: true }
    ],
    resources: {
      db: {
        label: 'DB 索引',
        allocate: (projectName, taken) => nextInt(taken, 0, 15)
      }
    }
  },
  nacos: {
    label: 'Nacos',
    fields: [
      { key: 'host', label: '主机', default: '127.0.0.1' },
      { key: 'port', label: '端口', default: 8848 },
      { key: 'username', label: '账号', default: 'nacos' },
      { key: 'password', label: '密码', secret: true }
    ],
    resources: {
      namespace: {
        label: '命名空间',
        allocate: () => crypto.randomUUID()
      }
    }
  },
  mongodb: {
    label: 'MongoDB',
    fields: [
      { key: 'host', label: '主机', default: '127.0.0.1' },
      { key: 'port', label: '端口', default: 27017 },
      { key: 'username', label: '账号' },
      { key: 'password', label: '密码', secret: true }
    ],
    resources: {
      database: {
        label: '数据库',
        allocate: (projectName, taken) => uniqueName(sanitize(projectName), taken)
      }
    }
  },
  rocketmq: {
    label: 'RocketMQ',
    fields: [
      { key: 'host', label: 'NameServer 主机', default: '127.0.0.1' },
      { key: 'port', label: 'NameServer 端口', default: 9876 },
      { key: 'access_key', label: 'AccessKey' },
      { key: 'secret_key', label: 'SecretKey', secret: true }
    ],
    resources: {
      topic: {
        label: 'Topic',
        allocate: (projectName, taken) => uniqueName(sanitize(projectName), taken)
      },
      consumer_group: {
        label: '消费组',
        allocate: (projectName, taken) => uniqueName(`${sanitize(projectName)}_group`, taken)
      }
    }
  },
  rabbitmq: {
    label: 'RabbitMQ',
    fields: [
      { key: 'host', label: '主机', default: '127.0.0.1' },
      { key: 'port', label: '端口', default: 5672 },
      { key: 'username', label: '账号', default: 'guest' },
      { key: 'password', label: '密码', secret: true }
    ],
    resources: {
      vhost: {
        label: 'Virtual Host',
        allocate: (projectName, taken) => uniqueName(`/${sanitize(projectName)}`, taken)
      }
    }
  },
  kafka: {
    label: 'Kafka',
    fields: [
      { key: 'host', label: '主机', default: '127.0.0.1' },
      { key: 'port', label: '端口', default: 9092 },
      { key: 'username', label: '账号(SASL)' },
      { key: 'password', label: '密码', secret: true }
    ],
    resources: {
      topic: {
        label: 'Topic',
        allocate: (projectName, taken) => uniqueName(sanitize(projectName), taken)
      },
      group_id: {
        label: '消费组 ID',
        allocate: (projectName, taken) => uniqueName(`${sanitize(projectName)}_group`, taken)
      }
    }
  },
  elasticsearch: {
    label: 'Elasticsearch',
    fields: [
      { key: 'host', label: '主机', default: '127.0.0.1' },
      { key: 'port', label: '端口', default: 9200 },
      { key: 'username', label: '账号', default: 'elastic' },
      { key: 'password', label: '密码', secret: true }
    ],
    resources: {
      index_prefix: {
        label: '索引前缀',
        allocate: (projectName, taken) => uniqueName(sanitize(projectName), taken)
      }
    }
  },
  minio: {
    label: 'MinIO',
    fields: [
      { key: 'host', label: '主机', default: '127.0.0.1' },
      { key: 'port', label: '端口', default: 9000 },
      { key: 'access_key', label: 'AccessKey', default: 'minioadmin' },
      { key: 'secret_key', label: 'SecretKey', secret: true }
    ],
    resources: {
      bucket: {
        label: 'Bucket',
        allocate: (projectName, taken) => uniqueName(sanitize(projectName).replace(/_/g, '-'), taken)
      }
    }
  },
  cross_compile: {
    label: '交叉编译环境',
    fields: [
      { key: 'host', label: 'SSH 主机' },
      { key: 'port', label: 'SSH 端口', default: 22 },
      { key: 'username', label: 'SSH 账号', default: 'root' },
      { key: 'password', label: 'SSH 密码', secret: true },
      { key: 'ssh_host_key_sha256', label: 'SSH 主机指纹' },
      { key: 'os', label: '操作系统' },
      { key: 'host_arch', label: '宿主架构' },
      { key: 'capabilities', label: '能力' },
      { key: 'toolchains', label: '工具链' },
      { key: 'default_ndk', label: '默认 NDK 路径' },
      { key: 'ndk_roots', label: 'NDK 路径' },
      { key: 'target_abis', label: '目标 ABI' },
      { key: 'target_triples', label: '目标三元组' },
      { key: 'cmake_toolchain', label: 'CMake 工具链文件' },
      { key: 'build_tools', label: '构建工具' },
      { key: 'workspace_roots', label: '工作目录' },
      { key: 'notes', label: '备注' }
    ],
    resources: {}
  },
  custom: {
    label: '自定义服务',
    fields: [], // config 为自由 key-value
    resources: {}
  }
};

/**
 * 为项目在某服务上分配全部可分配资源(幂等: 已分配过的直接复用)。
 * 需在 store.update 的可写上下文中调用。
 */
function allocateResources(db, service, projectName) {
  const type = SERVICE_TYPES[service.type];
  const result = {};
  if (!type) return result;
  for (const [resKey, resDef] of Object.entries(type.resources || {})) {
    const existing = db.allocations.find(
      a => a.serviceId === service.id && a.projectName === projectName && a.resource === resKey
    );
    if (existing) {
      result[resKey] = existing.value;
      continue;
    }
    const taken = new Set(
      db.allocations.filter(a => a.serviceId === service.id && a.resource === resKey).map(a => a.value)
    );
    const value = resDef.allocate(projectName, taken);
    db.allocations.push({
      id: crypto.randomUUID(),
      serviceId: service.id,
      projectName,
      resource: resKey,
      value,
      createdAt: new Date().toISOString()
    });
    result[resKey] = value;
  }
  return result;
}

/** 把服务的连接信息 + 分配的资源拍平成环境变量形式 */
function toEnv(service, resources) {
  const prefix = service.type.toUpperCase();
  const env = {};
  for (const [k, v] of Object.entries(service.config || {})) {
    if (v !== undefined && v !== null && v !== '') {
      env[`${prefix}_${k.toUpperCase()}`] = String(v);
    }
  }
  if (service.config && service.config.host && service.config.port) {
    env[`${prefix}_SERVER_ADDR`] = `${service.config.host}:${service.config.port}`;
  }
  for (const [k, v] of Object.entries(resources || {})) {
    env[`${prefix}_${k.toUpperCase()}`] = String(v);
  }
  if (service.type === 'postgresql' && service.config && resources && resources.database) {
    const { host, port, username, password, sslmode = 'require' } = service.config;
    if (host && port && username && password) {
      const credentials = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
      env.DATABASE_URL = `postgres://${credentials}@${host}:${port}/${encodeURIComponent(resources.database)}?sslmode=${encodeURIComponent(sslmode)}`;
    }
  }
  return env;
}

module.exports = { SERVICE_TYPES, allocateResources, toEnv, sanitize };
