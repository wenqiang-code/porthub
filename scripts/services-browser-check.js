// Run after starting services-fixture.js on a PortHub-allocated PM_TEST_PORT.
// Set AGENT_BROWSER_CLI to the installed agent-browser executable (or JS launcher).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const port = Number(process.env.PM_TEST_PORT);
const cli = process.env.AGENT_BROWSER_CLI;
if (!port || !cli || !fs.existsSync(cli)) throw new Error('PM_TEST_PORT and AGENT_BROWSER_CLI are required');
const base = `http://127.0.0.1:${port}`;
const session = 'pm-services-regression';
const outputDir = path.resolve('.run/services-acceptance');
fs.mkdirSync(outputDir, { recursive: true });
function browser(args, input) {
  // A browser daemon can inherit stdout on Windows; a file avoids waiting for its pipe to close.
  const outputFile = path.join(outputDir, 'command-output.txt');
  const fd = fs.openSync(outputFile, 'w');
  try {
    const isJs = cli.endsWith('.js');
    execFileSync(isJs ? process.execPath : cli, [...(isJs ? [cli] : []), '--session', session, ...args], {
      encoding: 'utf8', input, timeout: 45000, stdio: ['pipe', fd, 'inherit'], windowsHide: true
    });
  } catch (error) {
    throw new Error(`${args[0]} failed: ${fs.readFileSync(outputFile, 'utf8')}`, { cause: error });
  } finally { fs.closeSync(fd); }
  return fs.readFileSync(outputFile, 'utf8').trim();
}
function evaluate(code) {
  const result = JSON.parse(browser(['eval', '--stdin', '--json'], `(async () => { ${code} })()`));
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data.result;
}
async function request(method, url, body) {
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json; charset=utf-8', Connection: 'close' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  return { status: response.status, data };
}
function report(name, result) { console.log(`PASS ${name}${result ? ': ' + JSON.stringify(result) : ''}`); }

(async () => {
  const health = await request('GET', '/api/health');
  if (!health.data.isolated) throw new Error('Refusing to test against a non-isolated server');
  await request('PUT', '/api/services/custom-test', { name: '分类配置验收服务', config: { API_SERVER: '测试服务器', PORT: 8080,
    ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`TEST_${i}`, `测试值 ${i}`])) }, configMeta: {}, configCategories: [], icon: null });
  browser(['open', `${base}/services`]);
  browser(['wait', '--load', 'networkidle']);
  browser(['snapshot', '-i']);
  evaluate(`
    window.qa = {
      check(value, message) { if (!value) throw new Error(message); },
      async wait(check, label) {
        const until = Date.now() + 8000;
        while (!check()) { if (Date.now() > until) throw new Error(label || 'UI timeout'); await new Promise(resolve => setTimeout(resolve, 30)); }
      },
      async settle() {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
          .map(animation => animation.finished.catch(() => {})));
      },
      click(text, scope = document) {
        const button = [...scope.querySelectorAll('button')].find(el => el.textContent.trim() === text && el.getBoundingClientRect().height);
        if (!button) throw new Error('Missing button: ' + text);
        button.click();
      },
      fill(selector, text, scope = document) {
        const input = scope.querySelector(selector);
        if (!input) throw new Error('Missing input: ' + selector);
        const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
      async category(name) {
        this.click('新增', document.querySelector('.category-panel'));
        await this.wait(() => document.querySelector('.el-message-box input'), 'category prompt');
        this.fill('.el-message-box input', name);
        this.click('确定', document.querySelector('.el-message-box'));
        await this.wait(() => [...document.querySelectorAll('.category-option')].some(el => el.textContent.includes(name)));
        await this.settle();
      },
      pickCategory(name) {
        const option = [...document.querySelectorAll('.category-option')].find(el => el.querySelector('span').textContent === name);
        this.check(option, 'Missing category ' + name); option.click();
      }
    };
  `);

  for (const [width, height] of [[1440, 900], [2560, 1080], [1280, 540]]) {
    browser(['set', 'viewport', String(width), String(height)]);
    const layout = evaluate(`
      const root = document.documentElement, list = document.querySelector('.services-content'), toolbar = document.querySelector('.toolbar');
      qa.check(root.scrollWidth === root.clientWidth && root.scrollHeight === innerHeight, 'Page overflow');
      const top = toolbar.getBoundingClientRect().top;
      list.scrollTop = 1000; await qa.settle();
      qa.check(toolbar.getBoundingClientRect().top === top, 'Toolbar moved');
      list.scrollTop = 0;
      qa.click('分类配置验收服务'); await qa.settle();
      const dialog = document.querySelector('.service-editor'), content = document.querySelector('.config-scroll');
      qa.check(dialog.getBoundingClientRect().bottom <= innerHeight, 'Dialog outside viewport');
      for (const el of [dialog, content, document.querySelector('.el-dialog__body'), document.querySelector('.config-workspace')]) {
        qa.check(el.scrollWidth <= el.clientWidth + 1, 'Horizontal overflow in ' + el.className);
      }
      const footer = document.querySelector('.service-editor .el-dialog__footer');
      const footerTop = footer.getBoundingClientRect().top;
      content.scrollTop = 500; await qa.settle();
      qa.check(content.scrollTop > 0 && Math.abs(footer.getBoundingClientRect().top - footerTop) < 1,
        'Wrong scroll container: ' + JSON.stringify({ scroll: content.scrollTop, height: content.clientHeight, total: content.scrollHeight, footerTop, after: footer.getBoundingClientRect().top }));
      qa.check(document.querySelector('.service-editor .el-dialog__body').scrollTop === 0, 'Nested body scroll');
      content.scrollTop = 0;
      return { viewport: [innerWidth, innerHeight], configHeight: content.clientHeight, dialogHeight: dialog.clientHeight };
    `);
    browser(['screenshot', path.join(outputDir, `editor-${width}x${height}.png`)]);
    report('responsive layout', layout);
    evaluate(`qa.click('取消', document.querySelector('.service-editor')); await qa.settle();`);
  }

  browser(['set', 'viewport', '1440', '900']);
  browser(['click', '.svc-card:first-child .svc-icon']);
  browser(['wait', '--load', 'networkidle']);
  evaluate(`
    await qa.settle();
    qa.check(document.querySelector('.service-editor'), 'Icon should open editor');
    await qa.category('连接信息');
    qa.pickCategory('未分类'); await qa.settle();
    const row = document.querySelector('.config-item');
    qa.fill('input[aria-label="配置标签"]', '服务器地址', row);
    qa.fill('textarea[aria-label="配置备注"]', '中文备注，保留原始值', row);
    row.querySelector('.el-select').click();
    await qa.wait(() => [...document.querySelectorAll('[role="option"]')].some(el => el.textContent.trim() === '连接信息'));
    [...document.querySelectorAll('[role="option"]')].find(el => el.textContent.trim() === '连接信息').click();
    await qa.settle();
    qa.check(!document.querySelector('.config-item').textContent.includes('服务器地址'), 'Moved row still in original category');
    document.querySelector('.config-scroll').scrollTop = 300;
    qa.pickCategory('连接信息'); await qa.settle();
    qa.check(document.querySelector('.config-scroll').scrollTop === 0, 'Category switch did not reset scroll');
    qa.check(document.querySelector('input[aria-label="配置标签"]').value === '服务器地址', 'Draft lost after category switch');
    qa.check([...document.querySelectorAll('.category-actions button')].find(el => el.textContent.trim() === '删除空分类').disabled, 'Nonempty category can be deleted');
    qa.click('重命名', document.querySelector('.category-panel'));
    await qa.wait(() => document.querySelector('.el-message-box input'));
    qa.fill('.el-message-box input', '网络连接'); qa.click('确定', document.querySelector('.el-message-box')); await qa.settle();
    await qa.category('待删除分类');
    qa.click('删除空分类', document.querySelector('.category-panel')); await qa.settle();
    qa.check(!document.querySelector('.category-list').textContent.includes('待删除分类'), 'Empty category not removed');
    await qa.category('保留空分类');
    qa.pickCategory('网络连接'); await qa.settle();
    qa.click('保存', document.querySelector('.service-editor'));
    await qa.wait(() => !document.querySelector('.service-editor')?.getBoundingClientRect().height, 'Save did not close dialog');
    await qa.settle();
    qa.check(!document.querySelector('.service-editor')?.getBoundingClientRect().height, 'Save did not close dialog');
  `);
  const saved = (await request('GET', '/api/services')).data.find(service => service.id === 'custom-test');
  if (saved.config.PORT !== 8080 || saved.configMeta.API_SERVER.category !== '网络连接'
    || saved.configMeta.API_SERVER.label !== '服务器地址' || !saved.configCategories.includes('保留空分类')) throw new Error('Saved category payload mismatch');
  report('category add, rename, move, delete, empty category persistence and numeric preservation');
  evaluate(`
    qa.click('分类配置验收服务'); await qa.settle();
    qa.pickCategory('网络连接'); await qa.settle();
    qa.fill('input[aria-label="配置标签"]', '取消的修改');
    qa.click('取消', document.querySelector('.service-editor')); await qa.settle();
    qa.click('分类配置验收服务'); await qa.settle();
    qa.check(document.querySelector('input[aria-label="配置标签"]').value === '服务器地址', 'Cancel mutated original data');
    qa.click('添加配置项', document.querySelector('.config-heading')); await qa.settle();
    const newRow = [...document.querySelectorAll('.config-item')].at(-1);
    qa.fill('input[aria-label="配置名称 KEY"]', ' PORT ', newRow);
    qa.click('保存', document.querySelector('.service-editor')); await qa.settle();
    qa.check(document.querySelector('.form-error').textContent.includes('重复'), 'Duplicate KEY was not rejected');
    qa.check(document.querySelector('.config-item.invalid'), 'Invalid row was not highlighted');
    qa.click('删除', newRow); await qa.settle();
  `);
  report('cancel isolation and cross-category duplicate KEY validation');

  evaluate(`
    window.uploadTestIcon = async function(type = 'image/png', invalid = false, oversized = false) {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 160;
      const context = canvas.getContext('2d'); context.fillStyle = type === 'image/webp' ? '#16a34a' : '#4f6df5'; context.fillRect(0, 0, 320, 160);
      const blob = invalid ? new Blob(['invalid image'], {type}) : oversized ? new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], {type}) : await new Promise(resolve => canvas.toBlob(resolve, type));
      const input = document.querySelector('input[type="file"]');
      const data = new DataTransfer(); data.items.add(new File([blob], 'test-image', {type}));
      input.files = data.files; input.dispatchEvent(new Event('change', {bubbles:true}));
      await qa.settle();
    };
    await uploadTestIcon('image/svg+xml', true);
    qa.check(document.querySelector('.form-error').textContent.includes('PNG'), 'Invalid format accepted');
    await uploadTestIcon('image/png', false, true);
    qa.check(document.querySelector('.form-error').textContent.includes('2MB'), 'Oversized upload accepted');
    await uploadTestIcon('image/png', true);
    qa.check(document.querySelector('.form-error').textContent.includes('解码'), 'Corrupt image accepted');
    await uploadTestIcon('image/jpeg');
    await qa.wait(() => document.querySelector('.icon-preview img'));
    const image = document.querySelector('.icon-preview img');
    qa.check(image.src.startsWith('data:image/png;base64,'), 'Image not normalized');
    qa.check(image.naturalWidth === 128 && image.naturalHeight === 64, 'Image dimensions not preserved');
    qa.click('保存', document.querySelector('.service-editor'));
    await qa.wait(() => !document.querySelector('.service-editor')?.getBoundingClientRect().height, 'Icon rejected by backend');
    await qa.settle();
  `);
  const withIcon = (await request('GET', '/api/services')).data.find(service => service.id === 'custom-test');
  if (!withIcon.icon?.startsWith('data:image/png;base64,')) throw new Error('Uploaded icon missing from storage');
  report('invalid, oversized, corrupt uploads and JPEG to PNG normalization');
  evaluate(`
    qa.click('分类配置验收服务'); await qa.settle();
    await uploadTestIcon('image/webp');
    await qa.wait(() => document.querySelector('.icon-preview img'));
    qa.click('保存', document.querySelector('.service-editor'));
    await qa.wait(() => !document.querySelector('.service-editor')?.getBoundingClientRect().height);
    qa.click('MySQL 图标验收'); await qa.settle();
    qa.check(document.querySelector('.builtin-config'), 'Built-in service fields missing');
    await uploadTestIcon('image/png');
    await qa.wait(() => document.querySelector('.icon-preview img'));
    qa.click('保存', document.querySelector('.service-editor'));
    await qa.wait(() => !document.querySelector('.service-editor')?.getBoundingClientRect().height);
    qa.click('分类配置验收服务'); await qa.settle();
    qa.click('恢复默认', document.querySelector('.service-editor'));
    qa.click('取消', document.querySelector('.service-editor')); await qa.settle();
  `);
  const replacement = (await request('GET', '/api/services')).data;
  if (replacement.find(service => service.id === 'custom-test').icon === withIcon.icon) throw new Error('WebP replacement not saved');
  if (!replacement.find(service => service.id === 'mysql-test').icon) throw new Error('Built-in service icon not saved');
  report('WebP replacement, PNG upload for built-in service, cancel icon change');
  browser(['reload']);
  browser(['wait', '--load', 'networkidle']);
  // Page reload discards QA helpers; the remaining checks use self-contained snippets.
  evaluate(`
    const image = document.querySelector('.svc-card:first-child .svc-icon img');
    if (!image?.src.startsWith('data:image/png;base64,')) throw new Error('Icon not restored after reload');
  `);
  browser(['click', '.svc-card:first-child .el-switch']);
  browser(['wait', '--load', 'networkidle']);
  evaluate(`if (document.querySelector('.service-editor')?.getBoundingClientRect().height) throw new Error('Switch opened dialog');`);
  browser(['click', '.svc-card:first-child .el-switch']);
  browser(['click', '.svc-card:first-child .svc-more']);
  evaluate(`if (document.querySelector('.service-editor')?.getBoundingClientRect().height) throw new Error('Menu opened dialog');`);
  browser(['press', 'Escape']);
  browser(['focus', '.svc-card:first-child .svc-name']);
  browser(['press', 'Enter']);
  browser(['wait', '--load', 'networkidle']);
  browser(['network', 'route', `${base}/api/services/custom-test`, '--abort']);
  evaluate(`
    await new Promise(resolve => setTimeout(resolve, 350));
    const dialog = document.querySelector('.service-editor');
    if (!dialog?.getBoundingClientRect().height) throw new Error('Keyboard did not open editor');
    const button = [...dialog.querySelectorAll('button')].find(el => el.textContent.trim() === '保存'); button.click();
    await new Promise(resolve => setTimeout(resolve, 700));
    if (!dialog.getBoundingClientRect().height || !dialog.querySelector('.form-error')) throw new Error('Failure did not retain draft');
  `);
  browser(['network', 'unroute', `${base}/api/services/custom-test`]);
  evaluate(`
    const dialog = document.querySelector('.service-editor');
    [...dialog.querySelectorAll('button')].find(el => el.textContent.trim() === '恢复默认').click();
    [...dialog.querySelectorAll('button')].find(el => el.textContent.trim() === '保存').click();
    await new Promise(resolve => setTimeout(resolve, 700));
  `);
  const reset = (await request('GET', '/api/services')).data.find(service => service.id === 'custom-test');
  if (reset.icon !== null || reset.config.PORT !== 8080) throw new Error('Restore default icon failed');
  report('icon survives refresh, keyboard entry, failed save preserves draft, restore default');

  await request('PUT', '/api/services/custom-test', { configCategories: ['网络连接', ...Array.from({ length: 30 }, (_, i) => `分类 ${i}`)] });
  browser(['reload']);
  browser(['wait', '--load', 'networkidle']);
  browser(['set', 'viewport', '1280', '540']);
  browser(['click', '.svc-card:first-child .svc-name']);
  browser(['wait', '--load', 'networkidle']);
  evaluate(`
    await new Promise(resolve => setTimeout(resolve, 500));
    const nav = document.querySelector('.category-list'), content = document.querySelector('.config-scroll');
    const contentTop = content.scrollTop;
    nav.scrollTop = 300;
    if (!nav.scrollTop || content.scrollTop !== contentTop) throw new Error('Category navigation must scroll independently');
    [...document.querySelectorAll('.config-heading button')].find(el => el.textContent.trim() === '添加配置项').click();
    await new Promise(resolve => setTimeout(resolve, 300));
    const dialog = document.querySelector('.service-editor');
    if (dialog.scrollTop || document.querySelector('.service-form').scrollTop || document.documentElement.scrollTop) throw new Error('Adding row scrolled dialog shell');
    [...dialog.querySelectorAll('.el-dialog__footer button')].find(el => el.textContent.trim() === '取消').click();
  `);
  report('many categories scroll independently and adding rows does not scroll the page shell');

  const large = await request('POST', '/api/services', { type: 'custom', name: `large-payload-${Date.now()}`, config: { LARGE: 'x'.repeat(120000) } });
  if (large.status !== 201) throw new Error('Service create limit not expanded');
  const oversized = await request('PUT', '/api/services/custom-test', { config: { LARGE: 'x'.repeat(1100000) } });
  if (oversized.status !== 413) throw new Error('Service write limit not enforced');
  const standard = await request('POST', '/api/services/provision', { projectName: 'x'.repeat(120000) });
  if (standard.status !== 413) throw new Error('Non-service-write limit was expanded');
  report('HTTP JSON request limits are restricted to service writes');
  const errors = browser(['errors']);
  if (errors && !/No (page )?errors/i.test(errors)) console.log('Browser diagnostics:', errors);
  console.log('Browser acceptance passed. Screenshots:', outputDir);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  browser(['close']);
});
