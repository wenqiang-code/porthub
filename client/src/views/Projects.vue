<template>
  <div class="projects-page">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索名称 / 描述 / 路径 / 端口" clearable style="width: 240px" />
      <el-select v-model="filterCategory" placeholder="全部类别" clearable style="width: 140px">
        <el-option v-for="c in CATEGORIES" :key="c.value" :label="c.label" :value="c.value" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 120px">
        <el-option label="运行中" value="active" />
        <el-option label="已停止" value="stopped" />
        <el-option label="已归档" value="archived" />
      </el-select>
      <div style="flex: 1"></div>
      <el-select v-model="density" style="width: 96px" size="small">
        <el-option label="紧凑行高" value="compact" />
        <el-option label="默认行高" value="default" />
        <el-option label="宽松行高" value="large" />
      </el-select>
      <el-select v-model="tableHeight" style="width: 110px" size="small">
        <el-option label="高度自适应" value="auto" />
        <el-option label="高度 50vh" value="50vh" />
        <el-option label="高度 70vh" value="70vh" />
        <el-option label="高度 90vh" value="90vh" />
      </el-select>
      <el-button :icon="Search" @click="openScan">扫描导入</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建项目</el-button>
    </div>

    <!-- 批量操作栏 -->
    <transition name="el-fade-in">
      <div class="batch-bar" v-if="selected.length">
        <el-tag effect="dark">已选 {{ selected.length }} 项</el-tag>
        <el-select v-model="batchParent" placeholder="挂载到项目…" style="width: 160px" filterable>
          <el-option label="提升为根项目" value="__none__" />
          <el-option v-for="r in rootProjects" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <el-button size="small" :disabled="!batchParent" @click="doBatch('setParent', batchParent === '__none__' ? '' : batchParent)">挂载</el-button>
        <el-select v-model="batchStatus" placeholder="设置状态…" style="width: 120px">
          <el-option label="运行中" value="active" />
          <el-option label="已停止" value="stopped" />
          <el-option label="已归档" value="archived" />
        </el-select>
        <el-button size="small" :disabled="!batchStatus" @click="doBatch('setStatus', batchStatus)">应用</el-button>
        <el-popconfirm :title="`批量删除 ${selected.length} 个项目(含子项目)并回收端口?`" @confirm="doBatch('delete')">
          <template #reference>
            <el-button size="small" type="danger">批量删除</el-button>
          </template>
        </el-popconfirm>
        <div style="flex: 1"></div>
        <el-button size="small" text @click="clearSelection">取消选择</el-button>
      </div>
    </transition>

    <!-- 项目树形表格 -->
    <div class="table-card">
    <el-table
      ref="tableRef" v-loading="loading" row-key="id" :size="tableSize"
      :data="treeData" :tree-props="{ children: 'children' }" default-expand-all
      :height="tableHeight === 'auto' ? '100%' : undefined"
      :max-height="tableHeight === 'auto' ? undefined : tableHeight"
      :class="'density-' + density"
      stripe style="width: 100%" @selection-change="selected = $event"
    >
      <el-table-column type="selection" width="45" reserve-selection />
      <el-table-column label="端口" width="100" sortable :sort-by="row => row.port || 0">
        <template #default="{ row }">
          <a
            v-if="row.port" class="port-chip" target="_blank" rel="noopener"
            :href="`http://localhost:${row.port}`" :title="`打开 http://localhost:${row.port}`"
            @click.stop
          >{{ row.port }}</a>
          <span v-else class="noport">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="项目 / 子项目" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <el-icon v-if="!row.parentId" class="root-icon"><FolderOpened /></el-icon>
          <el-icon v-else class="sub-icon"><Document /></el-icon>
          <b v-if="!row.parentId">{{ row.name }}</b>
          <span v-else>{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag :type="row.parentId ? 'info' : 'warning'" effect="plain" size="small">
            {{ row.parentId ? '子项目' : '根项目' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="类别" width="100">
        <template #default="{ row }">
          <el-tag :type="CATEGORY_TAG[row.category] || 'info'" size="small">{{ CATEGORY_LABEL[row.category] || row.category }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[row.status] || 'info'" effect="plain" size="small">{{ STATUS_LABEL[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="path" label="路径" min-width="200" show-overflow-tooltip />
      <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip />
      <el-table-column label="操作" width="360" fixed="right">
        <template #default="{ row }">
          <el-button size="small" plain @click="fetchConfig(row)">配置</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="warning" plain :disabled="!row.port" @click="reallocate(row)">换端口</el-button>
          <el-button size="small" type="danger" plain :disabled="!row.port" :loading="stoppingId === row.id" @click="stopPort(row)">停止</el-button>
          <el-popconfirm
            :title="childCount(row) ? `删除「${row.name}」及其 ${childCount(row)} 个子项目并回收所有端口?` : `删除「${row.name}」并回收端口?`"
            width="260" @confirm="remove(row)"
          >
            <template #reference>
              <el-button size="small" type="danger" plain>删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂无项目,点击右上角新建或扫描导入" />
      </template>
    </el-table>
    </div>

    <!-- 新建对话框 -->
    <el-dialog v-model="createVisible" title="新建项目" width="540px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="层级">
          <el-radio-group v-model="form.isSub">
            <el-radio :value="false">根项目(工作目录)</el-radio>
            <el-radio :value="true">子项目(模块)</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.isSub" label="所属项目" required>
          <el-select v-model="form.parent" style="width: 100%" filterable allow-create default-first-option placeholder="选择或输入根项目名">
            <el-option v-for="r in rootProjects" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" :placeholder="form.isSub ? '如 shop-web' : '如 shop(项目根目录)'" />
        </el-form-item>
        <el-form-item label="占用端口">
          <el-switch v-model="form.occupyPort" />
          <span class="hint">{{ form.occupyPort ? '该项目需要监听端口' : '纯目录/根项目,不占用端口' }}</span>
        </el-form-item>
        <template v-if="form.occupyPort">
          <el-form-item label="类别">
            <el-select v-model="form.category" style="width: 100%" @change="previewPort">
              <el-option v-for="c in CATEGORIES" :key="c.value" :label="c.label" :value="c.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="端口">
            <el-radio-group v-model="portMode">
              <el-radio value="auto">自动分配</el-radio>
              <el-radio value="manual">指定端口</el-radio>
            </el-radio-group>
            <div v-if="portMode === 'auto'" class="port-preview">
              将分配端口: <el-tag type="success" effect="dark">{{ nextPort ?? '端口池已满' }}</el-tag>
            </div>
            <el-input-number v-else v-model="form.port" :min="1" :max="65535" style="margin-top: 8px" />
          </el-form-item>
        </template>
        <el-form-item label="路径">
          <el-input v-model="form.path" placeholder="如 D:\projects\shop" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="create">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editVisible" title="编辑项目" width="540px">
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="端口">
          <el-tag v-if="editForm.port" effect="dark">{{ editForm.port }}</el-tag>
          <span v-else class="hint">不占用端口</span>
          <span v-if="editForm.port" class="hint">(换端口请使用列表中的“换端口”按钮)</span>
        </el-form-item>
        <el-form-item label="所属项目">
          <el-select v-model="editForm.parentId" style="width: 100%" clearable filterable placeholder="留空则为根项目">
            <el-option v-for="r in editParentOptions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="类别">
          <el-select v-model="editForm.category" style="width: 100%">
            <el-option v-for="c in CATEGORIES" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width: 100%">
            <el-option label="运行中" value="active" />
            <el-option label="已停止" value="stopped" />
            <el-option label="已归档" value="archived" />
          </el-select>
        </el-form-item>
        <el-form-item label="路径"><el-input v-model="editForm.path" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="editForm.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 公共服务配置对话框 -->
    <el-dialog v-model="configVisible" :title="`公共服务配置 · ${configProject?.name || ''}`" width="620px">
      <div v-if="configLoading" class="config-loading"><el-icon class="is-loading"><Loading /></el-icon> 正在获取…</div>
      <template v-else>
        <el-alert v-if="!configEnvLines.length" type="info" :closable="false" title="尚未配置任何公共服务,请先在「公共服务」页添加" />
        <template v-else>
          <div class="config-head">
            <span class="hint">可写入 .env / application.yml;schema、命名空间等动态资源已自动分配(幂等,重复获取结果一致)</span>
            <el-button size="small" :icon="CopyDocument" @click="copyConfig">复制</el-button>
          </div>
          <pre class="config-pre">{{ configEnvLines.join('\n') }}</pre>
        </template>
      </template>
    </el-dialog>

    <!-- 扫描导入对话框 -->
    <el-dialog v-model="scanVisible" title="扫描磁盘项目并纳管" width="880px">
      <div class="scan-bar">
        <el-input v-model="scanRoot" placeholder="项目根目录, 如 D:\projects\shop" style="width: 340px" />
        <el-tooltip content="目录递归深度" placement="top">
          <el-input-number v-model="scanDepth" :min="1" :max="4" />
        </el-tooltip>
        <el-select v-model="scanParent" placeholder="挂载到项目(可选)" clearable filterable style="width: 170px">
          <el-option v-for="r in rootProjects" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <el-button type="primary" :loading="scanning" @click="doScan(false)">扫描</el-button>
        <el-button type="success" :loading="scanning" :disabled="!scanReport.length" @click="doScan(true)">一键注册全部</el-button>
      </div>
      <el-alert type="info" :closable="false" class="scan-tip">
        若扫描的根目录本身含 package.json,注册时会自动把它作为根项目,扫描到的模块挂为其子项目。
      </el-alert>
      <el-table :data="scanReport" v-loading="scanning" max-height="400" style="width: 100%">
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="SCAN_STATUS_TAG[row.status] || 'info'" effect="plain" size="small">
              {{ SCAN_STATUS_LABEL[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="探测端口" width="90">
          <template #default="{ row }">{{ row.detectedPort ?? '未探测到' }}</template>
        </el-table-column>
        <el-table-column label="登记端口" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.registeredPort" effect="dark" size="small">{{ row.registeredPort }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="项目名" min-width="130" show-overflow-tooltip />
        <el-table-column label="类别" width="90">
          <template #default="{ row }">
            <el-tag :type="CATEGORY_TAG[row.category] || 'info'" size="small">{{ CATEGORY_LABEL[row.category] || row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路径" min-width="200" show-overflow-tooltip />
        <el-table-column prop="note" label="说明" min-width="170" show-overflow-tooltip />
        <template #empty><el-empty description="输入根目录后点击扫描" /></template>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, FolderOpened, Document, CopyDocument, Loading } from '@element-plus/icons-vue';
import { api, CATEGORIES, CATEGORY_LABEL, CATEGORY_TAG, STATUS_LABEL, STATUS_TAG } from '../api';

const tableRef = ref(null);
const selected = ref([]);
const density = ref(localStorage.getItem('pm_density') || 'compact');
const tableHeight = ref(localStorage.getItem('pm_table_height') || 'auto');
const tableSize = computed(() => ({ compact: 'small', default: 'default', large: 'large' }[density.value]));
watch(density, v => localStorage.setItem('pm_density', v));
watch(tableHeight, v => localStorage.setItem('pm_table_height', v));
const batchParent = ref('');
const batchStatus = ref('');
const projects = ref([]);
const loading = ref(false);
const keyword = ref('');
const filterCategory = ref('');
const filterStatus = ref('');

const createVisible = ref(false);
const editVisible = ref(false);
const submitting = ref(false);
const portMode = ref('auto');
const nextPort = ref(null);

const SCAN_STATUS_LABEL = {
  registered: '已登记', unregistered: '未登记', conflict: '端口冲突',
  imported: '已导入', adjusted: '已调端口', error: '失败'
};
const SCAN_STATUS_TAG = {
  registered: 'success', unregistered: 'info', conflict: 'warning',
  imported: 'success', adjusted: 'warning', error: 'danger'
};

const scanVisible = ref(false);
const scanRoot = ref('D:\\projects');
const scanDepth = ref(1);
const scanParent = ref('');
const scanning = ref(false);
const scanReport = ref([]);

const emptyForm = () => ({
  isSub: false, parent: '', name: '', occupyPort: false,
  category: 'web', description: '', path: '', port: 3000
});
const form = ref(emptyForm());
const editForm = ref({});

const rootProjects = computed(() => projects.value.filter(p => !p.parentId));

/** 编辑时可选的父项目: 根项目且排除自己和自己的后代 */
const editParentOptions = computed(() => {
  if (!editForm.value.id) return rootProjects.value;
  const descendants = new Set();
  const queue = [editForm.value.id];
  while (queue.length) {
    const cur = queue.shift();
    projects.value.filter(p => p.parentId === cur).forEach(c => {
      descendants.add(c.id);
      queue.push(c.id);
    });
  }
  return rootProjects.value.filter(r => r.id !== editForm.value.id && !descendants.has(r.id));
});

/** 过滤 + 保留祖先,构建树 */
const treeData = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  let list = projects.value.filter(p => {
    if (filterCategory.value && p.category !== filterCategory.value) return false;
    if (filterStatus.value && p.status !== filterStatus.value) return false;
    if (kw && !(
      p.name.toLowerCase().includes(kw) ||
      (p.description || '').toLowerCase().includes(kw) ||
      (p.path || '').toLowerCase().includes(kw) ||
      String(p.port || '').includes(kw)
    )) return false;
    return true;
  });
  // 匹配到的子项目,其祖先也要保留(否则树上挂不上去)
  const keep = new Map(list.map(p => [p.id, p]));
  list.forEach(p => {
    let cur = p;
    while (cur.parentId) {
      const par = projects.value.find(x => x.id === cur.parentId);
      if (!par || keep.has(par.id)) break;
      keep.set(par.id, par);
      cur = par;
    }
  });
  const map = new Map([...keep.values()].map(p => [p.id, { ...p, children: [] }]));
  const roots = [];
  map.forEach(node => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
});

function childCount(row) {
  return projects.value.filter(p => p.parentId === row.id).length;
}

async function load() {
  loading.value = true;
  try {
    projects.value = await api.listProjects();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}

async function previewPort() {
  try {
    const r = await api.nextPort(form.value.category);
    nextPort.value = r.port;
  } catch {
    nextPort.value = null;
  }
}

function openCreate() {
  form.value = emptyForm();
  portMode.value = 'auto';
  createVisible.value = true;
  previewPort();
}

async function create() {
  if (!form.value.name.trim()) return ElMessage.warning('请填写名称');
  if (form.value.isSub && !form.value.parent) return ElMessage.warning('请选择所属项目');
  submitting.value = true;
  try {
    const body = {
      name: form.value.name,
      description: form.value.description,
      path: form.value.path
    };
    if (form.value.isSub) body.parent = form.value.parent;
    if (form.value.occupyPort) {
      body.category = form.value.category;
      if (portMode.value === 'manual') body.port = form.value.port;
    } else {
      body.noPort = true;
    }
    const p = await api.createProject(body);
    ElMessage.success(p.port ? `项目创建成功,分配端口 ${p.port}` : `项目 "${p.name}" 创建成功(不占端口)`);
    createVisible.value = false;
    load();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    submitting.value = false;
  }
}

function openEdit(row) {
  editForm.value = { ...row };
  editVisible.value = true;
}

async function saveEdit() {
  submitting.value = true;
  try {
    const { id, name, category, status, path, description, parentId } = editForm.value;
    await api.updateProject(id, { name, category, status, path, description, parent: parentId || '' });
    ElMessage.success('已保存');
    editVisible.value = false;
    load();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    submitting.value = false;
  }
}

function clearSelection() {
  tableRef.value && tableRef.value.clearSelection();
}

async function doBatch(action, value) {
  const ids = selected.value.map(p => p.id);
  if (!ids.length) return;
  try {
    const r = await api.batchProjects({ ids, action, value });
    if (action === 'delete') {
      ElMessage.success(`已删除 ${r.affected} 个项目,回收端口 ${r.releasedPorts.join(', ') || '无'}`);
    } else {
      ElMessage.success(`批量操作完成,影响 ${r.affected} 个项目`);
    }
    batchParent.value = '';
    batchStatus.value = '';
    clearSelection();
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

const configVisible = ref(false);
const configLoading = ref(false);
const configProject = ref(null);
const configEnvLines = ref([]);

async function fetchConfig(row) {
  configProject.value = row;
  configVisible.value = true;
  configLoading.value = true;
  configEnvLines.value = [];
  try {
    const r = await api.provision({ projectName: row.name });
    configEnvLines.value = Object.entries(r.env).map(([k, v]) => `${k}=${v}`);
  } catch (e) {
    ElMessage.error(e.message);
    configVisible.value = false;
  } finally {
    configLoading.value = false;
  }
}

async function copyConfig() {
  try {
    await navigator.clipboard.writeText(configEnvLines.value.join('\n'));
    ElMessage.success('已复制到剪贴板');
  } catch {
    ElMessage.error('复制失败,请手动选择复制');
  }
}

function openScan() {
  scanReport.value = [];
  scanVisible.value = true;
}

async function doScan(register) {
  if (!scanRoot.value.trim()) return ElMessage.warning('请填写项目根目录');
  scanning.value = true;
  try {
    const res = await api.scanProjects({
      root: scanRoot.value.trim(),
      depth: scanDepth.value,
      register,
      parent: scanParent.value || undefined
    });
    scanReport.value = res.items || res;
    if (register) {
      const adjusted = scanReport.value.filter(r => r.status === 'adjusted');
      ElMessage.success(
        `导入完成${adjusted.length ? `,其中 ${adjusted.length} 个项目端口冲突已自动调整` : ''}`
      );
      load();
    }
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    scanning.value = false;
  }
}

const stoppingId = ref('');

/** 停止: 结束占用该项目端口的本机进程 */
async function stopPort(row) {
  stoppingId.value = row.id;
  try {
    const { owners } = await api.portOwner(row.port);
    if (!owners.length) {
      ElMessage.info(`端口 ${row.port} 当前未被任何进程占用`);
      return;
    }
    const desc = owners.map(o => `${o.name || '未知进程'} (PID ${o.pid})`).join('、');
    await ElMessageBox.confirm(
      `端口 ${row.port} 正被 ${desc} 占用,确定结束该进程?`,
      '停止端口进程',
      { type: 'warning', confirmButtonText: '结束进程', cancelButtonText: '取消' }
    );
    const r = await api.killPort(row.port);
    ElMessage.success(`已结束 ${r.killed.map(o => `${o.name || '进程'}(PID ${o.pid})`).join('、')},端口 ${row.port} 已释放`);
  } catch (e) {
    if (e !== 'cancel' && e?.message !== 'cancel') ElMessage.error(e.message || e);
  } finally {
    stoppingId.value = '';
  }
}

async function reallocate(row) {
  try {
    await ElMessageBox.confirm(`将释放端口 ${row.port} 并重新分配新端口,确定?`, '换端口', { type: 'warning' });
  } catch { return; }
  try {
    const r = await api.reallocate(row.id);
    ElMessage.success(`端口已从 ${r.oldPort} 更换为 ${r.project.port}`);
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function remove(row) {
  try {
    const r = await api.deleteProject(row.id);
    ElMessage.success(`已删除 ${r.removedCount} 个项目,回收端口 ${r.releasedPorts.join(', ') || '无'}`);
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(load);
</script>

<style scoped>
.projects-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; align-items: center; flex-shrink: 0; }
.batch-bar { flex-shrink: 0; }
.table-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius);
  box-shadow: var(--pm-shadow);
  padding: 6px 12px 12px;
}
.batch-bar {
  display: flex; gap: 10px; align-items: center;
  background: #fff;
  border: 1px solid var(--pm-border);
  border-left: 3px solid var(--pm-accent);
  border-radius: 10px;
  box-shadow: var(--pm-shadow);
  padding: 8px 14px;
  margin-bottom: 12px;
}
.port-chip {
  display: inline-block;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-weight: 600;
  font-size: 12.5px;
  color: #fff;
  background: #1c2333;
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.3px;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease;
}
.port-chip:hover { background: #3b4a6b; }
.noport { color: #d0d4dc; }
.port-preview { margin-top: 8px; }
.hint { margin-left: 8px; color: #999; font-size: 12px; }
.root-icon { color: #e6a23c; vertical-align: -2px; margin-right: 4px; }
.sub-icon { color: #909399; vertical-align: -2px; margin-right: 4px; }
.scan-bar { display: flex; gap: 12px; margin-bottom: 12px; align-items: center; }
.scan-tip { margin-bottom: 12px; }
.config-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.config-pre {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.8;
  background: #10141c;
  color: #d7e0ee;
  border-radius: 10px;
  padding: 14px 16px;
  overflow: auto;
  max-height: 380px;
  white-space: pre-wrap;
  word-break: break-all;
}
.config-loading { display: flex; align-items: center; gap: 8px; color: var(--pm-text-3); padding: 30px 0; justify-content: center; }

/* 行高密度 */
.density-compact :deep(.el-table__cell) { padding: 5px 0 !important; }
.density-compact :deep(.cell) { line-height: 22px; }
.density-large :deep(.el-table__cell) { padding: 14px 0 !important; }

/* 表格细节 */
:deep(.el-table) { --el-table-row-hover-bg-color: #f6f8ff; }
:deep(.el-table__row) { transition: background 0.15s ease; }
:deep(.el-table__indent) + .cell { }
</style>
