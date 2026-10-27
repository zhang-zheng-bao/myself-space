const $ = (selector) => document.querySelector(selector);
let state;
let settingsReturnView = 'download';
function selectSettingsSection(section) {
  const labels = { general: '常规', cookies: '平台 Cookie', speech: '语音服务', minimax: '语音生成', voices: '音色管理', history: '历史记录' };
  if (!labels[section]) return;
  document.querySelectorAll('[data-settings-panel]').forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== section; });
  document.querySelectorAll('[data-settings-section]').forEach(button => {
    const active = button.dataset.settingsSection === section;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('#settingsSectionTitle').textContent = labels[section];
  $('#saveSettingsButton').hidden = section !== 'general';
}
let mode = 'video';
let cookiePlatform = 'douyin';
let parsedResults = [];
let mediaSelections = new Map();
let cookieInputTimer;
let cookieInputRevision = 0;
let pendingCookieProfiles;
let consumedSpeechJobs = new Set();
let activeSpeechJobIds = new Set();
let voiceReferencePath = '';
let voiceReferenceLabel = '';
window.addEventListener('wanchuang-audio-selected',event=>{voiceReferenceLabel=event.detail.name;});
let cloneStep = 1;
let cloneBusy = false;
function renderCloneFlow(step=cloneStep, focus=false) {
  cloneStep=step;
  const minimax=state?.settings.minimax || {};
  const enabled=minimax.cloneEnabled !== false;
  document.querySelectorAll('[data-clone-step]').forEach(item=>{
    const number=Number(item.dataset.cloneStep);
    item.classList.toggle('is-complete',number<step);
    if(number===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
  });
  for(const [index,name] of ['Upload','Settings','Complete'].entries()) $('#clone'+name+'Step').hidden=index+1!==step;
  $('#cloneAvailability').hidden=enabled;
  $('#cloneControls').disabled=!enabled||cloneBusy;
  $('#cloneNextStep').disabled=!voiceReferencePath||cloneBusy||!enabled;
  if(focus) $('#clone'+['Upload','Settings','Complete'][step-1]+'Heading').focus();
}
let voiceOutputPath = '';
let voiceAudioObjectUrl = '';
let voiceCategory = 'favorites';
let manageVoicesCategory = 'all';
let historyKind = 'voice';
let historyReturnView = 'settings';
let voiceEmotion = '';
const VIEW_COPY = {
  download: {
    icon: 'download',
    title: '素材采集',
    headline: '让灵感，即刻靠岸。',
    eyebrow: '01 / COLLECT',
    subtitle: '视频、图文、封面。把值得留下的，留在手边。',
  },
  speech: {
    icon: 'audio-lines',
    title: '语音识别',
    headline: '让声音，跃然纸上。',
    eyebrow: '02 / TRANSCRIBE',
    subtitle: '从一段视频，到一份可以继续创作的文稿。',
  },
  voice: {
    icon: 'audio-waveform',
    title: '声音生成',
    headline: '让每一种声音，都有回响。',
    eyebrow: '03 / VOICE',
    subtitle: '选择已有音色，把文字变成自然语音。',
  },
  voiceClone: {
    icon: 'mic-vocal',
    title: '声音克隆',
    headline: '创建你的专属音色。',
    eyebrow: '04 / CLONE',
    subtitle: '上传一段人声样本，创建可反复使用的账号音色。',
  },
  voiceHistory: {
    icon: 'history',
    title: '历史记录',
    headline: '声音历史',
    eyebrow: 'HISTORY',
    subtitle: '查看当前浏览器的生成历史。',
  },
  settings: {
    icon: 'settings-2',
    title: '设置',
    headline: '按你的习惯。',
    eyebrow: '05 / PREFERENCES',
    subtitle: '保存位置、平台连接，以及你的语音服务。',
  },
};

function icon(name) {
  return `<i data-lucide="${name}"></i>`;
}

function renderIcons() {
  window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '';
}

function errorMessage(error) {
  return String(error?.message || error || '操作失败')
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
    .replace(/(?:科大)?讯飞|iflytek/gi,'语音识别服务').replace(/mini?max/gi,'语音生成服务');
}

function friendlyVoiceError(message) {
  const value = String(message || '');
  if (/speech 2\.8 don'?t support whisper/i.test(value)) return '当前语音模型不支持耳语；点击重试会自动切换兼容模型';
  if (/speech 2\.8 don'?t support fluent/i.test(value)) return '当前语音模型不支持流畅模式；点击重试会自动切换兼容模型';
  return value;
}

function cleanSharedText(value) {
  const urls = String(value || '').match(/https?:\/\/[^\s，。！？、]+/gi) || [];
  return [...new Set(urls.map((url) => url.replace(/[)\]}>"']+$/g, '')))].join('\n');
}

function voiceAudioUrlFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (voiceAudioObjectUrl) URL.revokeObjectURL(voiceAudioObjectUrl);
  voiceAudioObjectUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  return voiceAudioObjectUrl;
}

function historyActionButton(action, title, iconName, handler, danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `compact-job-action history-${action}${danger ? ' danger' : ''}`;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.innerHTML = icon(iconName);
  button.addEventListener('click', handler);
  return button;
}

function historyFileActions(kind, item, full = false) {
  const controls = document.createElement('div');
  controls.className = 'history-actions';
  if (item.status === '已完成') {
    controls.append(historyActionButton('download', '下载结果文件', 'download', () => window.webDownloads.downloadItem(kind,item)));

  }
  if (kind === 'voice' && item.status === '失败') {
    controls.append(historyActionButton('retry', '使用原参数重新生成', 'rotate-cw', () => retryVoiceHistoryItem(item)));
  }
  if (full) controls.append(historyActionButton('remove', '仅移除历史记录', 'x', () => window.clipHarbor.removeHistoryRecord(kind, item.id)));
  return controls;
}

async function playVoiceHistoryItem(item) {
  try {
    const result = await window.clipHarbor.readVoiceHistoryAudio(item.id);
    voiceOutputPath = result.outputPath;
    const onHistoryPage = document.body.dataset.view === 'voiceHistory';
    const audio = $(onHistoryPage ? '#voiceHistoryAudio' : '#voiceAudio');
    audio.src = voiceAudioUrlFromBase64(result.audioBase64);
    if (onHistoryPage) {
      $('#voiceHistoryPlayer').hidden = false;
      $('#voiceHistoryPlayerName').textContent = `${item.text || item.voiceId} · ${item.voiceId}`;
    } else {
      $('#voiceResultEmpty').hidden = true;
      $('#voiceResultReady').hidden = false;
      $('#voiceResultName').textContent = `${item.voiceId} · 历史记录`;
    }
    await audio.play();
  } catch (error) {
    const message = errorMessage(error);
    if (document.body.dataset.view === 'voiceHistory') $('#voiceHistoryPlayerName').textContent = message;
    else {
      $('#voiceGenerateStatus').className = 'parse-status bad';
      $('#voiceGenerateStatus').textContent = message;
    }
  }
}

function retryVoiceHistoryItem(item) {
  setActiveView('voice');
  $('#voiceText').value = item.text || '';
  $('#voiceCharCount').textContent = $('#voiceText').value.length;
  $('#voiceId').value = item.voiceId || '';
  const retryEmotion = item.emotion || '';
  document.querySelector(`[data-emotion="${retryEmotion}"]`)?.click();
  $('#generateVoiceButton').click();
}

function createVoiceHistoryItem(item, full = false) {
  const node = document.createElement('article');
  node.className = `voice-history-item ${statusClass(item.status)}${full ? ' full' : ''}`;
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'voice-history-play';
  play.title = item.status === '已完成' ? '播放这段语音' : item.status;
  play.innerHTML = icon(item.status === '已完成' ? 'play' : item.status === '失败' ? 'triangle-alert' : 'loader-circle');
  play.disabled = item.status !== '已完成';
  play.addEventListener('click', () => playVoiceHistoryItem(item));
  const copy = document.createElement('div');
  copy.className = 'voice-history-copy';
  const title = document.createElement('strong');
  title.textContent = item.text || '语音生成';
  const meta = document.createElement('span');
  const duration = item.durationMs ? ` · ${(item.durationMs / 1000).toFixed(1)} 秒` : '';
  const model = full && item.model ? ` · ${item.model}` : '';
  meta.textContent = friendlyVoiceError(item.error) || `${item.voiceId}${duration}${model} · ${formatDate(item.finishedAt || item.createdAt)}`;
  copy.append(title, meta);
  node.append(play, copy, historyFileActions('voice', item, full));
  return node;
}

function renderVoiceHistory(history = []) {
  state.voiceHistory = history;
  const list = $('#voiceHistoryList');
  list.replaceChildren(...history.slice(0, 3).map((item) => createVoiceHistoryItem(item)));
  $('#voiceHistoryCount').textContent = `${history.length} 条`;
  $('#voiceHistoryEmpty').hidden = history.length > 0;
  $('#openVoiceHistory').hidden = history.length <= 3;
  renderHistoryPage();
  renderIcons();
}

function openHistoryPage(kind, returnView = 'voice') {
  historyKind = kind;
  historyReturnView = returnView;
  $('#backFromVoiceHistory').innerHTML = `${icon('arrow-left')}返回${returnView === 'settings' ? '设置' : '声音生成'}`;
  $('#historyMessage').textContent = '';
  setActiveView('voiceHistory');
  renderHistoryPage();
}

function renderHistoryPage() {
  if (!state) return;
  const records = historyKind === 'voice' ? state.voiceHistory || [] : (state.jobs || []).filter(item => (item.type || 'download') === historyKind).slice().reverse();
  document.querySelectorAll('[data-history-kind]').forEach(button => {
    const active = button.dataset.historyKind === historyKind;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $('#voiceHistoryPageCount').textContent = `${records.length} 条记录`;
  $('#voiceHistoryPageEmpty').hidden = records.length > 0;
  if (historyKind !== 'voice') {
    $('#voiceHistoryPlayer').hidden = true;
    $('#voiceHistoryAudio').pause();
  }
  $('#clearHistoryButton').disabled = !records.some(item => ['已完成', '失败', '已取消'].includes(item.status));
  const nodes = records.map(item => {
    if (historyKind === 'voice') return createVoiceHistoryItem(item, true);
    const row = document.createElement('article');
    row.className = 'voice-history-item full';
    const avatar = document.createElement('span');
    avatar.className = 'voice-avatar';
    avatar.innerHTML = icon(historyKind === 'speech' ? 'mic' : 'download');
    const copy = document.createElement('div');
    copy.className = 'voice-history-copy';
    const title = document.createElement('strong');
    title.textContent = item.resolved?.title || item.url || '本地任务';
    const meta = document.createElement('span');
    meta.textContent = `${item.status} · ${formatDate(item.finishedAt || item.createdAt)}${item.error ? ` · ${item.error}` : ''}`;
    copy.append(title, meta);
    const actions = ['已完成', '失败', '已取消'].includes(item.status) ? historyFileActions(historyKind, item, true) : document.createElement('span');
    row.append(avatar, copy, actions);
    return row;
  });
  $('#voiceHistoryPageList').replaceChildren(...nodes);
  renderIcons();
}

function platformLabel(platform) {
  return platform === 'xiaohongshu' ? '小红书' : platform === 'bilibili' ? 'B站' : '抖音';
}

function setActiveView(view) {
 if(view==='settings'){document.getElementById('webStatus').textContent='服务凭证由网站管理员配置，请联系管理员检查应用配置。';return;}
  const current = VIEW_COPY[view] ? view : 'download';
  if (current === 'settings' && document.body.dataset.view !== 'settings') settingsReturnView = document.body.dataset.view || 'download';
  document.querySelectorAll('.feature-tab').forEach((item) => {
    const active = item.dataset.view === current || (current === 'voiceHistory' && item.dataset.view === historyReturnView);
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  for (const name of Object.keys(VIEW_COPY)) {
    const panel = document.querySelector(`#${name}View`);
    if (panel) panel.hidden = name !== current;
  }
  const copy = VIEW_COPY[current];
  document.body.dataset.view = current;
  $('#viewTitle').textContent = copy.title;
  document.title = `${copy.title} · 万创核心`;
  if (current === 'speech') {
    renderSpeechJobs(state?.jobs || []);
    $('#speechInput').focus();
  }
  if (current === 'voice') renderMinimaxMeta();
  if (current === 'settings') {
    if (state) {
      $('#outputDir').value = state.settings.outputDir;
      $('#concurrency').value = state.settings.concurrency;
    }
    renderCookieMeta();
    renderSpeechMeta();
    renderMinimaxMeta();
  }
  renderIcons();
}

function resetParse() {
  parsedResults = [];
  mediaSelections = new Map();
  $('#downloadButton').hidden = true;
  $('#downloadButton').disabled = false;
  $('#parseStatus').textContent = '';
  $('#parseStatus').className = 'parse-status';
  $('#previewPanel').hidden = true;
  $('#previewList').innerHTML = '';
}

function renderTools() {
  $('#toolStatus').innerHTML = `
    <span class="tool-pill ${state.tools.ytDlp ? 'ok' : 'bad'}">yt-dlp</span>
    <span class="tool-pill ${state.tools.ffmpeg ? 'ok' : 'bad'}">FFmpeg</span>
    <span class="tool-pill ${state.tools.browser ? 'ok' : 'bad'}">浏览器解析</span>
    <span class="tool-pill ${state.settings.speech?.configured ? 'ok' : 'bad'}">语音转写</span>
    <span class="tool-pill ${state.settings.minimax?.configured ? 'ok' : 'bad'}">语音生成</span>`;
}

function updatePreviewSummary() {
  const imageResults = parsedResults.filter((result) => result.kind === 'images');
  const selectedImages = imageResults.reduce((total, result) => total + (mediaSelections.get(result.url)?.size || 0), 0);
  const visibleVideoCount = parsedResults.flatMap(visibleMedia).filter((item) => item.type === 'video').length;
  const visibleCoverCount = parsedResults.flatMap(visibleMedia).filter((item) => item.type === 'image' && item.cover).length;
  const parts = [];
  if (selectedImages) parts.push(`已选 ${selectedImages} 张图片`);
  if (visibleVideoCount) parts.push(`${visibleVideoCount} 个视频`);
  if (visibleCoverCount) parts.push(`${visibleCoverCount} 个封面`);
  $('#previewSummary').textContent = parts.join(' · ') || '尚未选择内容';
  const hasSelection = parsedResults.some((result) => result.kind !== 'images' || mediaSelections.get(result.url)?.size);
  $('#downloadButton').disabled = !hasSelection;
}

function visibleMedia(result) {
  if (result.kind === 'images' || mode === 'both') return result.media;
  if (mode === 'cover') return result.media.filter((item) => item.type === 'image' && item.cover);
  return result.media.filter((item) => item.type === 'video');
}

function attachImageFallback(tile, image) {
  const fallback = document.createElement('span');
  fallback.className = 'media-fallback';
  fallback.innerHTML = icon('image-off');
  image.addEventListener('load', () => tile.classList.remove('media-error'), { once: true });
  image.addEventListener('error', () => tile.classList.add('media-error'), { once: true });
  tile.appendChild(fallback);
}

function openMediaViewer(result, item) {
  const dialog = $('#mediaViewer');
  const content = $('#mediaViewerContent');
  content.replaceChildren();
  $('#mediaViewerTitle').textContent = result.title || '素材预览';
  $('#mediaViewerMessage').textContent = '';
  const media = document.createElement(item.type === 'video' ? 'video' : 'img');
  if (item.type === 'video') {
    media.controls = true;
    media.preload = 'metadata';
    media.playsInline = true;
    if (item.preview || result.cover) media.poster = item.preview || result.cover;
    media.src = item.url || '';
    media.addEventListener('error', () => {
      $('#mediaViewerMessage').textContent = '此视频暂时无法在线播放，可能受到平台限制。请下载后查看。';
    });
  } else {
    media.alt = result.title || '图片预览';
    media.src = item.url || item.preview;
    let usedFallback = false;
    media.addEventListener('error', () => {
      if (!usedFallback && item.preview && item.preview !== item.url) {
        usedFallback = true;
        media.src = item.preview;
      } else $('#mediaViewerMessage').textContent = '图片加载失败，请重新解析链接后重试。';
    });
  }
  content.append(media);
  if (!dialog.open) dialog.showModal();
  $('#closeMediaViewer').focus();
}

$('#closeMediaViewer').addEventListener('click', () => $('#mediaViewer').close());
$('#mediaViewer').addEventListener('click', (event) => {
  if (event.target !== event.currentTarget) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
});
$('#mediaViewer').addEventListener('close', () => {
  const video = $('#mediaViewerContent video');
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  $('#mediaViewerContent').replaceChildren();
  $('#mediaViewerMessage').textContent = '';
});

function addExpandButton(tile, result, item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'media-expand';
  button.setAttribute('aria-label', `放大预览：${result.title || (item.type === 'video' ? '视频' : '图片')}`);
  button.title = '点击放大预览';
  button.innerHTML = icon(item.type === 'video' ? 'play' : 'maximize-2');
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    tile.querySelector('video')?.pause();
    openMediaViewer(result, item);
  });
  tile.append(button);
}

function previewMediaNode(result, item, index) {
  if (item.type === 'image') {
    const selectable = result.kind === 'images';
    const tile = document.createElement(selectable ? 'label' : 'div');
    tile.className = selectable ? 'media-tile selected' : 'media-tile cover-tile';
    tile.setAttribute('aria-label', selectable ? `${result.title} 第 ${index + 1} 张` : `${result.title} 封面`);
    const image = document.createElement('img');
    image.src = item.preview || item.url;
    image.alt = '';
    image.loading = 'lazy';
    attachImageFallback(tile, image);
    if (selectable) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = mediaSelections.get(result.url)?.has(index + 1) || false;
      checkbox.setAttribute('aria-label', `选择第 ${index + 1} 张图片`);
      const order = document.createElement('span');
      order.className = 'media-order';
      order.textContent = String(index + 1);
      const checkmark = document.createElement('span');
      checkmark.className = 'media-check';
      checkmark.innerHTML = icon('check');
      checkbox.addEventListener('change', () => {
        const selected = mediaSelections.get(result.url) || new Set();
        if (checkbox.checked) selected.add(index + 1);
        else selected.delete(index + 1);
        mediaSelections.set(result.url, selected);
        tile.classList.toggle('selected', checkbox.checked);
        updatePreviewSummary();
      });
      tile.append(checkbox, image, order, checkmark);
    } else {
      const badge = document.createElement('span');
      badge.className = 'media-kind';
      badge.textContent = '封面';
      tile.append(image, badge);
    }
    addExpandButton(tile, result, item);
    return tile;
  }

  const tile = document.createElement('div');
  tile.className = 'media-tile video-tile';
  if (item.previewable && item.url) {
    const video = document.createElement('video');
    video.src = item.url;
    video.controls = true;
    video.preload = 'metadata';
    if (item.preview) video.poster = item.preview;
    tile.appendChild(video);
  } else {
    const image = document.createElement('img');
    image.src = item.preview || result.cover;
    image.alt = '';
    image.loading = 'lazy';
    const play = document.createElement('span');
    play.className = 'video-placeholder';
    play.innerHTML = icon('play');
    attachImageFallback(tile, image);
    tile.append(image, play);
  }
  const badge = document.createElement('span');
  badge.className = 'media-kind';
  badge.textContent = result.duration ? `${Math.floor(result.duration / 60)}:${String(result.duration % 60).padStart(2, '0')}` : '视频';
  tile.appendChild(badge);
  addExpandButton(tile, result, item);
  return tile;
}

function renderPreview() {
  const panel = $('#previewPanel');
  const list = $('#previewList');
  list.innerHTML = '';
  panel.hidden = parsedResults.length === 0;
  $('#imageSelectionActions').hidden = !parsedResults.some((result) => result.kind === 'images');
  if (!parsedResults.length) return;

  for (const result of parsedResults) {
    const group = document.createElement('article');
    group.className = 'preview-group';
    const heading = document.createElement('div');
    heading.className = 'preview-group-heading';
    const title = document.createElement('strong');
    title.textContent = result.title;
    const meta = document.createElement('span');
    const media = visibleMedia(result);
    if (!media.length) continue;
    const mediaSummary = result.kind === 'images'
      ? `${media.length} 张图片`
      : mode === 'cover'
        ? '封面'
        : mode === 'video'
          ? '视频'
          : '视频 · 封面';
    meta.textContent = `${result.platform} · ${mediaSummary}${result.author ? ` · ${result.author}` : ''}`;
    heading.append(title, meta);

    const grid = document.createElement('div');
    grid.className = 'preview-media-grid';
    media.forEach((item, index) => grid.appendChild(previewMediaNode(result, item, index)));
    group.append(heading, grid);
    list.appendChild(group);
  }
  updatePreviewSummary();
  renderIcons();
}

function renderCookieMeta() {
  const profiles = state.settings.cookieProfiles || [];
  const meta = profiles.find((item) => item.platform === cookiePlatform);
  const platformName = platformLabel(cookiePlatform);
  $('#cookiePlatformName').textContent = platformName;
  $('#cookieInput').placeholder = `粘贴${platformName} Cookie`;
  $('#cookieBadge').textContent = meta?.status || '未配置';
  $('#cookieBadge').classList.toggle('ok', ['有效', '可用', '登录有效', '下载可用'].includes(meta?.status));
  $('#cookieBadge').classList.toggle('checking', meta?.status === '检查中');
  $('#validateCookieButton').disabled = !meta?.configured || meta?.status === '检查中';
  $('#authorizeCookieButton').disabled = meta?.status === '检查中';
  if (!$('#cookieInput').value.trim()) {
    $('#cookieFields').classList.remove('warn');
    $('#cookieFields').textContent = meta?.configured
      ? `已保存 ${meta.names.length} 个字段：${meta.names.join('、')}\n${meta.fields.summary}`
      : '尚无已保存的 Cookie';
    $('#cookieFields').classList.toggle('bad', Boolean(meta?.configured && !meta.fields.downloadReady));
  }
  $('#cookieMeta').textContent = meta?.configured
    ? `${meta.updatedAt ? `保存 ${formatDate(meta.updatedAt)}` : ''}${meta.checkedAt ? ` · 验证 ${formatDate(meta.checkedAt)}` : ''}${meta.message ? ` · ${meta.message}` : ''}`
    : 'Cookie 只保存在本机，并使用 Windows 安全存储加密。';
}

function renderSpeechMeta() {
  const speech = state.settings.speech || { configured: false, status: '未配置' };
  $('#iflytekAppId').value = speech.appId || '';
  $('#iflytekApiKey').value = '';
  $('#iflytekApiSecret').value = '';
  $('#speechBadge').textContent = speech.status || (speech.configured ? '已配置' : '未配置');
  $('#speechBadge').classList.toggle('ok', ['有效', '已配置'].includes(speech.status));
  $('#speechBadge').classList.toggle('checking', speech.status === '检查中');
  $('#validateSpeechButton').disabled = !speech.configured;
  $('#speechMeta').textContent = speech.configured
    ? `${speech.appId ? `APPID ${speech.appId} · ` : ''}${speech.checkedAt ? `验证 ${formatDate(speech.checkedAt)}` : '尚未在线验证'}${speech.message ? ` · ${speech.message}` : ''}`
    : '凭证只保存在本机，并使用 Windows 安全存储加密。';
}

function renderMinimaxMeta() {
  if (!state) return;
  const minimax = state.settings.minimax || { configured: false, models: [], status: '未配置' };
  $('#minimaxApiKey').value = '';
  $('#minimaxBadge').textContent = minimax.status || '未配置';
  $('#minimaxBadge').className = `status-badge${['有效', '已配置'].includes(minimax.status) ? ' ok' : ''}`;
  $('#minimaxConnectionBadge').textContent = minimax.configured ? '语音服务已连接' : '语音服务未连接';
  $('#minimaxConnectionBadge').className = `status-badge${minimax.configured ? ' ok' : ''}`;
  $('#refreshMinimaxButton').disabled = !minimax.configured;
  $('#refreshVoiceModels').disabled = !minimax.configured;
  $('#minimaxMeta').textContent = minimax.configured
    ? `${minimax.accountModelCount || 0} 个账号自定义音色${minimax.checkedAt ? ` · 刷新 ${formatDate(minimax.checkedAt)}` : ''}${minimax.message ? ` · ${minimax.message}` : ''}`
    : '连接后可直接读取账号中的克隆音色、生成音色与系统音色。';
  renderVoicePicker();
  renderVoiceManagement();
  $('#cloneConnectionBadge').textContent = minimax.configured ? '语音服务已连接' : '未连接';
  $('#cloneConnectionBadge').className = `status-badge${minimax.configured ? ' ok' : ''}`;
  renderCloneFlow();
}

function renderVoiceManagement() {
  if (!state) return;
  const minimax = state.settings.minimax || {};
  const hidden = new Set(minimax.hiddenVoices || []);
  const query = $('#manageVoicesSearch').value.trim().toLowerCase();
  const models = [...(minimax.models || [])];
  for (const id of hidden) if (!models.some(model => model.id === id)) models.push({ id, name: id, type: 'unknown' });
  const filtered = models.filter(model => (manageVoicesCategory !== 'hidden' || hidden.has(model.id)) && `${model.name || ''} ${model.id}`.toLowerCase().includes(query));
  $('#manageVoicesCount').textContent = `${models.length} 个音色 · ${hidden.size} 个已隐藏 · 当前显示 ${filtered.length} 个`;
  document.querySelectorAll('[data-manage-voices]').forEach(button => {
    const active = button.dataset.manageVoices === manageVoicesCategory;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const list = $('#manageVoicesList');
  list.replaceChildren();
  for (const model of filtered) {
    const row = document.createElement('div');
    row.className = `manage-voice-row${hidden.has(model.id) ? ' is-hidden' : ''}`;
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = model.name && model.name!==model.id ? model.name : '未命名音色';
    const detail = document.createElement('small');
    detail.textContent = model.type === 'system' ? '系统音色' : '我的音色';
    copy.append(name, detail);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'voice-visibility-switch';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(!hidden.has(model.id)));
    toggle.setAttribute('aria-label', `启用音色 ${model.name || model.id}`);
    toggle.title = hidden.has(model.id) ? '恢复音色' : '禁用并隐藏音色';
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      try {
        const hide = !hidden.has(model.id);
        state.settings.minimax = await window.clipHarbor.setMinimaxVoiceHidden({ id: model.id, hidden: hide });
        if (hide && $('#voiceId').value.trim() === model.id) $('#voiceId').value = '';
        renderVoicePicker();
        renderVoiceManagement();
        $('#manageVoicesMessage').textContent = hide ? '已禁用并隐藏，刷新音色或重启后仍然生效。' : '已恢复，可在声音生成中选择。';
      } catch (error) {
        $('#manageVoicesMessage').textContent = errorMessage(error);
        toggle.disabled = false;
      }
    });
    row.append(copy, toggle);
    list.append(row);
  }
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'cookie-meta';
    empty.textContent = !models.length ? '暂无音色，请联系管理员同步音色。' : manageVoicesCategory === 'hidden' ? '没有匹配的隐藏音色。' : '没有匹配的音色。';
    list.append(empty);
  }
}

function selectedVoiceModel() {
  const id = $('#voiceId').value.trim();
  return (state.settings.minimax?.models || []).find((model) => model.id === id);
}

function renderVoicePicker() {
  if (!state) return;
  const minimax = state.settings.minimax || { models: [], favorites: [] };
  const favorites = new Set(minimax.favorites || []);
  const hidden = new Set(minimax.hiddenVoices || []);
  const query = ($('#voicePickerSearch')?.value || '').trim().toLowerCase();
  const selected = selectedVoiceModel();
  $('#voicePickerLabel').textContent = selected
    ? (selected.name && selected.name!==selected.id ? selected.name : '未命名音色')
    : '选择音色';
  document.querySelectorAll('[data-voice-category]').forEach((button) => {
    button.classList.toggle('active', button.dataset.voiceCategory === voiceCategory);
  });
  let models = (minimax.models || []).filter(model => !hidden.has(model.id));
  if (voiceCategory === 'favorites') models = models.filter((model) => favorites.has(model.id));
  else if (voiceCategory === 'mine') models = models.filter((model) => model.type !== 'system');
  else models = models.filter((model) => model.type === 'system');
  if (query) models = models.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(query));
  const list = $('#voicePickerList');
  list.innerHTML = '';
  if (!models.length) {
    const empty = document.createElement('div');
    empty.className = 'voice-picker-empty';
    empty.innerHTML = voiceCategory === 'favorites'
      ? `${icon('star')}<span>还没有收藏音色</span><small>到“我的音色”或“系统音色”点星号收藏</small>`
      : `${icon('search-x')}<span>没有匹配的音色</span>`;
    list.appendChild(empty);
  }
  for (const model of models) {
    const row = document.createElement('div');
    row.className = `voice-picker-row${selected?.id === model.id ? ' selected' : ''}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(selected?.id === model.id));
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'voice-picker-choice';
    choose.innerHTML = `<span class="voice-avatar">${icon(model.type === 'system' ? 'waves' : 'mic-2')}</span><span><strong></strong><small></small></span>${selected?.id === model.id ? icon('check') : ''}`;
    choose.querySelector('strong').textContent = model.name && model.name!==model.id ? model.name : '未命名音色';
    choose.querySelector('small').textContent = model.type === 'system' ? '系统音色' : '账号音色';
    choose.addEventListener('click', () => {
      $('#voiceId').value = model.id;
      closeVoicePicker();
      renderVoicePicker();
    });
    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.className = `voice-favorite${favorites.has(model.id) ? ' active' : ''}`;
    favorite.title = favorites.has(model.id) ? '取消收藏' : '收藏到本机';
    favorite.setAttribute('aria-label', favorite.title);
    favorite.innerHTML = icon('star');
    favorite.addEventListener('click', async () => {
      if (favorites.has(model.id)) favorites.delete(model.id); else favorites.add(model.id);
      state.settings.minimax = await window.clipHarbor.saveMinimaxFavorites([...favorites]);
      renderVoicePicker();
    });
    row.append(choose, favorite);
    list.appendChild(row);
  }
  renderIcons();
}

function closeVoicePicker() {
  $('#voicePickerPanel').hidden = true;
  $('#voicePickerButton').setAttribute('aria-expanded', 'false');
  $('#voicePicker').classList.remove('open');
}

function positionVoicePicker() {
  const panel = $('#voicePickerPanel');
  if (panel.hidden) return;
  const trigger = $('#voicePickerButton').getBoundingClientRect();
  const margin = 12;
  const gap = 8;
  const availableBelow = window.innerHeight - trigger.bottom - margin - gap;
  const availableAbove = trigger.top - margin - gap;
  const openBelow = availableBelow >= 260 || availableBelow >= availableAbove;
  const availableHeight = Math.max(190, openBelow ? availableBelow : availableAbove);
  const width = Math.min(570, window.innerWidth - margin * 2);
  const left = Math.max(margin, Math.min(trigger.left, window.innerWidth - width - margin));
  panel.style.width = `${width}px`;
  panel.style.left = `${left}px`;
  panel.style.right = 'auto';
  panel.style.maxHeight = `${Math.min(438, availableHeight)}px`;
  panel.style.top = openBelow ? `${trigger.bottom + gap}px` : 'auto';
  panel.style.bottom = openBelow ? 'auto' : `${window.innerHeight - trigger.top + gap}px`;
  panel.classList.toggle('opens-up', !openBelow);
}

function statusClass(status) {
  if (status === '已完成') return 'done';
  if (status === '失败') return 'failed';
  return '';
}

function renderSpeechJobList(speechJobs) {
  const list = $('#speechJobList');
  list.innerHTML = '';
  $('#speechEmptyJobs').hidden = speechJobs.length > 0;

  for (const job of [...speechJobs].reverse()) {
    const node = document.createElement('div');
    node.className = `compact-job ${statusClass(job.status)}`;
    node.title = job.url;

    const dot = document.createElement('span');
    dot.className = 'compact-job-dot';

    const main = document.createElement('div');
    main.className = 'compact-job-main';
    const name = document.createElement('strong');
    name.textContent = job.url.replace(/^https?:\/\//i, '');
    const detail = document.createElement('span');
    detail.textContent = job.error
      || (job.status === '已完成'
        ? `文稿与字幕已生成 · ${formatDate(job.finishedAt || job.createdAt)}`
        : job.status === '已取消'
          ? '任务已取消'
          : `${job.status} · ${job.progress || 0}%`);
    main.append(name, detail);

    let actions;
    if (!['已完成', '失败', '已取消'].includes(job.status)) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'compact-job-action';
      action.title = '取消';
      action.setAttribute('aria-label', `取消 ${name.textContent}`);
      action.innerHTML = icon('square');
      action.addEventListener('click', () => window.clipHarbor.cancelJob(job.id));
      actions = action;
    } else if (job.status === '已完成') {
      actions = historyFileActions('speech', job);
    } else {
      actions = document.createElement('div');
      actions.className = 'history-actions';
      const action = historyActionButton('retry', '重试', 'rotate-cw', () => window.clipHarbor.retryJob(job.id));
      action.title = '重试';
      actions.append(action);
    }

    node.append(dot, main, actions);
    list.appendChild(node);
  }
}

let speechSubmitting = false;
function renderSpeechJobs(jobs) {
  const speechJobs = jobs.filter((job) => job.type === 'speech');
  const sessionJobs = speechJobs.filter((job) => activeSpeechJobIds.has(job.id));
  const active = speechJobs.filter((job) => !['已完成', '失败', '已取消'].includes(job.status));
  const completedJobs = sessionJobs.filter((job) => job.status === '已完成' && job.transcriptText);
  const newResults = completedJobs.filter((job) => !consumedSpeechJobs.has(job.id));
  const latest = active.at(-1) || speechJobs.at(-1);
  const progress = active.length
    ? Math.max(0, Math.min(100, latest?.progress || 0))
    : latest?.status === '已完成'
      ? 100
      : Math.max(0, Math.min(100, latest?.progress || 0));

  $('#speechJobCount').textContent = `${speechJobs.length} 个任务`;
  $('#speechJobCount').classList.toggle('ok', completedJobs.length === speechJobs.length && speechJobs.length > 0);
  $('#speechProgressFill').style.width = `${progress}%`;
  $('#speechProgressValue').textContent = `${progress}%`;
  renderSpeechJobList(speechJobs);

  if (completedJobs.length) {
    $('#speechInput').value = completedJobs.map((job) => job.transcriptText.trim()).filter(Boolean).join('\n\n');
    newResults.forEach((job) => consumedSpeechJobs.add(job.id));
    $('#speechTaskStatus').className = 'parse-status ok';
    $('#speechTaskStatus').textContent = '识别完成';
    $('#speechTaskDetail').textContent = `已识别 ${completedJobs.length} 个视频，结果已填入输入框`;
  } else if (active.length) {
    const current = active.at(-1);
    if (current.transcriptText) $('#speechInput').value = current.transcriptText;
    $('#speechTaskStatus').className = 'parse-status';
    $('#speechTaskStatus').textContent = `${current.status} ${current.progress || 0}%`;
    $('#speechTaskDetail').textContent = current.speechChunks
      ? `按静音分段 · 已完成 ${current.speechChunks.completed}/${current.speechChunks.discovered} 段 · 最多 ${current.speechChunks.concurrency} 段并发`
      : current.status;
  } else {
    // A refresh must still surface failures from this browser's persisted
    // history. Otherwise an old failed task leaves its 1% progress visible
    // with no explanation.
    const last = sessionJobs.at(-1) || speechJobs.at(-1);
    if (last?.status === '失败') {
      $('#speechTaskStatus').className = 'parse-status bad';
      $('#speechTaskStatus').textContent = '识别失败';
      $('#speechTaskDetail').textContent = errorMessage(last.error || '请重试');
    } else if (last?.status === '已完成') {
      $('#speechTaskStatus').className = 'parse-status ok';
      $('#speechTaskStatus').textContent = '识别完成';
      $('#speechTaskDetail').textContent = '结果已填入输入框，TXT 与 SRT 已保存';
    } else if (last?.status === '已取消') {
      $('#speechTaskStatus').className = 'parse-status';
      $('#speechTaskStatus').textContent = '识别已取消';
      $('#speechTaskDetail').textContent = last.transcriptText ? '已识别的文稿已保留，可重新开始识别' : '任务已取消，可重新开始识别';
    } else if (!sessionJobs.length) {
      $('#speechTaskStatus').className = 'parse-status';
      $('#speechTaskStatus').textContent = '';
      $('#speechTaskDetail').textContent = speechJobs.length ? `已保存 ${speechJobs.length} 条本地识别历史` : '支持抖音、B站、小红书和央视视频';
    }
  }
  $('#speechStartButton').disabled = speechSubmitting || active.length > 0;
}

function renderJobs(jobs) {
  state.jobs = jobs;
  renderHistoryPage();
  renderSpeechJobs(jobs);
  const downloadJobs = jobs.filter((job) => job.type !== 'speech');
  const list = $('#jobList');
  list.innerHTML = '';
  $('#emptyState').hidden = downloadJobs.length > 0;
  list.classList.toggle('has-jobs', downloadJobs.length > 0);
  const active = downloadJobs.filter((job) => !['已完成', '失败', '已取消'].includes(job.status)).length;
  const done = downloadJobs.filter((job) => job.status === '已完成').length;
  $('#queueSummary').textContent = downloadJobs.length ? `${downloadJobs.length} 项 · ${active} 进行中 · ${done} 已完成` : '暂无任务';

  for (const job of downloadJobs) {
    const node = $('#jobTemplate').content.firstElementChild.cloneNode(true);
    const jobClass = statusClass(job.status);
    if (jobClass) node.classList.add(jobClass);
    const imageJob = job.resolved?.kind === 'images';
    const speechJob = job.type === 'speech';
    node.querySelector('.job-icon').innerHTML = icon(speechJob ? 'mic' : imageJob || job.mode === 'cover' ? 'image' : job.mode === 'both' ? 'copy-plus' : 'video');
    node.querySelector('.job-url').textContent = job.url;
    node.querySelector('.job-status').textContent = job.status;
    node.querySelector('.progress-fill').style.width = `${job.progress || 0}%`;
    const historyTime = formatDate(job.finishedAt || job.createdAt);
    const jobDescription = job.error || (speechJob
      ? job.status === '已完成' ? '文稿已生成' : '语音识别'
      : imageJob
        ? `已选 ${job.selectedMedia?.length || job.resolved?.media?.length || 0} 张图片`
        : job.mode === 'video'
          ? '视频'
          : job.mode === 'cover'
            ? '封面'
            : '视频和封面');
    node.querySelector('.job-detail').textContent = `${jobDescription}${historyTime ? ` · ${historyTime}` : ''}`;
    node.querySelector('.job-percent').textContent = `${job.progress || 0}%`;
    const controls = node.querySelector('.job-controls');
    if (['失败', '已取消'].includes(job.status)) {
      controls.innerHTML = `<button class="icon-button retry" title="重试" aria-label="重试">${icon('rotate-cw')}</button>`;
      controls.querySelector('button').addEventListener('click', () => window.clipHarbor.retryJob(job.id));
    } else if (!['已完成'].includes(job.status)) {
      controls.innerHTML = `<button class="icon-button cancel" title="取消" aria-label="取消">${icon('square')}</button>`;
      controls.querySelector('button').addEventListener('click', () => window.clipHarbor.cancelJob(job.id));
    } else {
      controls.replaceChildren(historyFileActions('download', job));
    }
    list.appendChild(node);
  }
  renderIcons();
}

async function initialize() {
  state = await window.clipHarbor.getState();
  if (pendingCookieProfiles) state.settings.cookieProfiles = pendingCookieProfiles;
  renderTools();
  renderCookieMeta();
  renderSpeechMeta();
  renderMinimaxMeta();
  renderJobs(state.jobs);
  renderVoiceHistory(state.voiceHistory || []);
  $('#outputDir').value = state.settings.outputDir;
  $('#concurrency').value = state.settings.concurrency;
}

document.querySelectorAll('.segment').forEach((button) => {
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...document.querySelectorAll('.segment')];
    const index = buttons.indexOf(button);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click();
    buttons[next].focus();
  });
  button.addEventListener('click', () => {
    document.querySelectorAll('.segment').forEach((item) => {
      item.classList.remove('active');
      item.setAttribute('aria-checked', String(item === button));
    });
    button.classList.add('active');
    mode = button.dataset.mode;
    if (parsedResults.length) renderPreview();
  });
});

$('#urlInput').addEventListener('input', resetParse);
$('#urlInput').addEventListener('paste', () => {
  setTimeout(() => {
    const cleaned = cleanSharedText($('#urlInput').value);
    if (cleaned) $('#urlInput').value = cleaned;
    resetParse();
  });
});

$('#pasteButton').addEventListener('click', async () => {
  const text = await navigator.clipboard.readText();
  const cleaned = cleanSharedText(text);
  $('#urlInput').value = [$('#urlInput').value.trim(), cleaned].filter(Boolean).join('\n');
  resetParse();
});

$('#parseButton').addEventListener('click', async () => {
  const cleaned = cleanSharedText($('#urlInput').value);
  if (!cleaned) return $('#urlInput').focus();
  $('#urlInput').value = cleaned;
  resetParse();
  $('#parseButton').disabled = true;
  $('#parseStatus').textContent = '正在解析...';
  try {
    const results = await window.clipHarbor.parseMedia(cleaned);
    if (cleanSharedText($('#urlInput').value) !== cleaned) return;
    const succeeded = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    parsedResults = succeeded;
    mediaSelections = new Map(succeeded
      .filter((result) => result.kind === 'images')
      .map((result) => [result.url, new Set(result.media.map((_item, index) => index + 1))]));
    $('#downloadButton').hidden = parsedResults.length === 0;
    renderPreview();
    $('#parseStatus').className = `parse-status ${failed.length ? 'bad' : 'ok'}`;
    $('#parseStatus').textContent = failed.length
      ? `${succeeded.length} 个成功，${failed.length} 个失败：${failed[0].error}`
      : `解析成功：${succeeded.map((result) => result.title).join('；')}`;
  } catch (error) {
    $('#parseStatus').className = 'parse-status bad';
    $('#parseStatus').textContent = errorMessage(error);
  } finally {
    $('#parseButton').disabled = false;
  }
});

$('#downloadButton').addEventListener('click', async () => {
  if (!parsedResults.length) return $('#urlInput').focus();
  const items = parsedResults.map((result) => ({
    url: result.url,
    resolved: result,
    selectedMedia: [...(mediaSelections.get(result.url) || [])],
  }));
  const optimistic = items.map((item) => ({
    id: `pending-${crypto.randomUUID()}`,
    url: item.url,
    mode,
    status: '准备下载',
    progress: 0,
    error: '',
  }));
  renderJobs([...state.jobs, ...optimistic]);
  $('#urlInput').value = '';
  try {
    renderJobs(await window.clipHarbor.addJobs({ items, mode }));
    resetParse();
  } catch (error) {
    renderJobs(state.jobs.filter((job) => !String(job.id).startsWith('pending-')));
    $('#urlInput').value = items.map((item) => item.url).join('\n');
    alert(errorMessage(error));
  }
});

$('#speechInput').addEventListener('paste', () => {
  setTimeout(() => {
    const cleaned = cleanSharedText($('#speechInput').value);
    if (cleaned) $('#speechInput').value = cleaned;
  });
});

$('#speechPasteButton').addEventListener('click', async () => {
  const text = await navigator.clipboard.readText();
  const cleaned = cleanSharedText(text);
  $('#speechInput').value = cleaned || text.trim();
  $('#speechTaskStatus').className = 'parse-status';
  $('#speechTaskStatus').textContent = cleaned ? '链接已清洗' : '剪贴板中没有链接';
  $('#speechInput').focus();
});

$('#speechStartButton').addEventListener('click', async () => {
  const urls = [...new Set((($('#speechInput').value || '').match(/https?:\/\/[^\s，。！？、]+/gi) || [])
    .map((url) => url.replace(/[)\]}>"']+$/g, '')))];
  if (!urls.length) {
    $('#speechTaskStatus').className = 'parse-status bad';
    $('#speechTaskStatus').textContent = '请先粘贴视频链接';
    return;
  }
  if (!state.settings.speech?.configured) {
    $('#speechTaskStatus').className='parse-status bad';
    $('#speechTaskStatus').textContent='语音转写尚未配置，请联系管理员';
    setActiveView('settings');
    selectSettingsSection('speech');
    return;
  }
  if (!state.tools.ffmpeg) {
    $('#speechTaskStatus').className = 'parse-status bad';
    $('#speechTaskStatus').textContent = '没有找到 ffmpeg';
    return;
  }
  if (speechSubmitting) return;
  speechSubmitting = true;
  $('#speechStartButton').disabled = true;
  activeSpeechJobIds = new Set();
  consumedSpeechJobs = new Set();
  $('#speechInput').value = urls.join('\n');
  try {
    $('#speechTaskStatus').className = 'parse-status';
    $('#speechTaskStatus').textContent = '正在检查音频时长…';
    const parsed = await window.clipHarbor.parseMedia(urls.join('\n'));
    const items = [];
    for (const url of urls) {
      const media = parsed.find(item => item.url === url);
      if (!media?.ok) throw new Error(media?.error || '无法读取音频时长，请重试');
      let fullRecognition = false;
      const duration = Number(media.duration) || 0;
      if (duration > 300 || !duration) {
        const dialog = $('#speechLengthDialog');
        $('#speechLengthTitle').textContent = duration ? '音频时间过长，是否完整识别？' : '音频时长未知，是否完整识别？';
        $('#speechLengthDescription').textContent = `${media.title || '当前视频'}${duration ? ` · 时长约 ${Math.floor(duration/60)} 分 ${Math.round(duration%60)} 秒` : ' · 暂时无法确认时长'}`;
        dialog.returnValue = '';
        const choice = new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), {once:true}));
        dialog.showModal();
        fullRecognition = (await choice) === 'full';
      }
      items.push({url,fullRecognition});
    }
    const beforeIds = new Set((state.jobs || []).map((job) => job.id));
    const jobs = await window.clipHarbor.addJobs({ items, mode: 'transcript', type: 'speech' });
    activeSpeechJobIds = new Set(jobs
      .filter((job) => job.type === 'speech' && !beforeIds.has(job.id))
      .map((job) => job.id));
    renderJobs(jobs);
    $('#speechTaskStatus').className = 'parse-status';
    $('#speechTaskStatus').textContent = '任务已开始';
  } catch (error) {
    $('#speechTaskStatus').className = 'parse-status bad';
    $('#speechTaskStatus').textContent = errorMessage(error);
  } finally {
    speechSubmitting = false;
    $('#speechStartButton').disabled = (state.jobs || []).some(job => job.type === 'speech' && !['已完成','失败','已取消'].includes(job.status));
  }
});

$('#clearSpeechTextButton').addEventListener('click', () => {
  activeSpeechJobIds = new Set();
  consumedSpeechJobs = new Set();
  $('#speechInput').value = '';
  $('#speechTaskStatus').className = 'parse-status';
  $('#speechTaskStatus').textContent = '';
  $('#speechTaskDetail').textContent = '支持抖音、B站、小红书和央视视频';
  $('#speechJobCount').textContent = '0 个任务';
  $('#speechJobCount').classList.remove('ok');
  $('#speechProgressFill').style.width = '0%';
  $('#speechProgressValue').textContent = '0%';
  renderSpeechJobList([]);
  $('#speechInput').focus();
});

document.querySelectorAll('.feature-tab').forEach((button) => {
  button.addEventListener('click', () => setActiveView(button.dataset.view));
});

$('#selectAllMediaButton').addEventListener('click', () => {
  for (const result of parsedResults.filter((item) => item.kind === 'images')) {
    mediaSelections.set(result.url, new Set(result.media.map((_item, index) => index + 1)));
  }
  renderPreview();
});

$('#clearMediaButton').addEventListener('click', () => {
  for (const result of parsedResults.filter((item) => item.kind === 'images')) {
    mediaSelections.set(result.url, new Set());
  }
  renderPreview();
});

$('#chooseFolderButton').addEventListener('click', async () => {
  const folder = await window.clipHarbor.chooseFolder();
  if (folder) $('#outputDir').value = folder;
});

document.querySelectorAll('.cookie-tab').forEach((button) => {
  button.addEventListener('click', () => {
    clearTimeout(cookieInputTimer);
    cookieInputRevision += 1;
    document.querySelectorAll('.cookie-tab').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    cookiePlatform = button.dataset.platform;
    $('#cookieInput').value = '';
    $('#settingsMessage').textContent = '';
    renderCookieMeta();
  });
});

async function saveAndValidateCookie() {
  clearTimeout(cookieInputTimer);
  const platform = cookiePlatform;
  const raw = $('#cookieInput').value;
  const revision = cookieInputRevision;
  if (!raw.trim()) return;
  try {
    $('#settingsMessage').textContent = '正在保存并在线验证...';
    state.settings.cookieProfiles = await window.clipHarbor.importCookies({ platform, raw });
    if (revision !== cookieInputRevision || platform !== cookiePlatform) return;
    $('#cookieInput').value = '';
    const meta = state.settings.cookieProfiles.find((item) => item.platform === platform);
    $('#settingsMessage').textContent = `已加密保存 · ${meta?.status || '验证完成'}`;
    renderCookieMeta();
  } catch (error) {
    if (revision === cookieInputRevision && platform === cookiePlatform) $('#settingsMessage').textContent = errorMessage(error);
  }
}

$('#cookieInput').addEventListener('input', async () => {
  clearTimeout(cookieInputTimer);
  const revision = ++cookieInputRevision;
  const raw = $('#cookieInput').value;
  if (!raw.trim()) return renderCookieMeta();
  try {
    const preview = await window.clipHarbor.inspectCookies({ platform: cookiePlatform, raw });
    if (revision !== cookieInputRevision) return;
    $('#cookieFields').textContent = `识别 ${preview.count} 个字段：${preview.names.join('、')}\n${preview.fields.summary}`;
    $('#cookieFields').classList.remove('warn');
    $('#cookieFields').classList.toggle('bad', !preview.fields.downloadReady);
    $('#settingsMessage').textContent = '即将自动保存并验证...';
    cookieInputTimer = setTimeout(saveAndValidateCookie, 700);
  } catch (error) {
    if (revision !== cookieInputRevision) return;
    const saved = (state.settings.cookieProfiles || []).find((item) => item.platform === cookiePlatform);
    $('#cookieFields').textContent = errorMessage(error);
    $('#cookieFields').classList.remove('bad');
    $('#cookieFields').classList.add('warn');
    $('#settingsMessage').textContent = saved?.configured
      ? `当前仍在使用已保存的 Cookie（${saved.status || '已保存'}）`
      : '尚未保存此平台 Cookie';
  }
});

$('#importCookieButton').addEventListener('click', saveAndValidateCookie);
$('#authorizeCookieButton').addEventListener('click', async () => {
  const button = $('#authorizeCookieButton');
  button.disabled = true;
  $('#settingsMessage').textContent = `正在打开${platformLabel(cookiePlatform)}授权窗口；登录成功后会自动完成…`;
  try {
    state.settings.cookieProfiles = await window.clipHarbor.authorizeCookies(cookiePlatform);
    $('#cookieInput').value = '';
    renderCookieMeta();
    renderTools();
    $('#settingsMessage').textContent = `${platformLabel(cookiePlatform)}浏览器授权成功，Cookie 已加密保存`;
  } catch (error) {
    $('#settingsMessage').textContent = errorMessage(error);
  } finally {
    button.disabled = false;
  }
});
$('#validateCookieButton').addEventListener('click', async () => {
  try {
    state.settings.cookieProfiles = await window.clipHarbor.validateCookies(cookiePlatform);
    renderCookieMeta();
  } catch (error) { $('#settingsMessage').textContent = errorMessage(error); }
});

$('#clearCookieButton').addEventListener('click', async () => {
  clearTimeout(cookieInputTimer);
  cookieInputRevision += 1;
  $('#cookieInput').value = '';
  await window.clipHarbor.clearCookies(cookiePlatform);
  state.settings.cookieProfiles = (await window.clipHarbor.getState()).settings.cookieProfiles;
  renderCookieMeta();
  $('#settingsMessage').textContent = '本机 Cookie 已清除';
});

$('#saveSpeechButton').addEventListener('click', async () => {
  const payload = {
    appId: $('#iflytekAppId').value.trim(),
    apiKey: $('#iflytekApiKey').value.trim(),
    apiSecret: $('#iflytekApiSecret').value.trim(),
  };
  if (!payload.appId || !payload.apiKey || !payload.apiSecret) {
    $('#settingsMessage').textContent = '请完整填写 APPID、APIKey 和 APISecret';
    return;
  }
  try {
    $('#speechBadge').textContent = '检查中';
    $('#speechBadge').className = 'status-badge checking';
    $('#settingsMessage').textContent = '正在验证语音转写服务...';
    state.settings.speech = await window.clipHarbor.saveSpeechConfig(payload);
    renderSpeechMeta();
    renderTools();
    $('#settingsMessage').textContent = '语音识别配置已加密保存';
  } catch (error) {
    const speech = state.settings.speech || { configured: false, status: '未配置' };
    $('#speechBadge').textContent = speech.status || '未配置';
    $('#speechBadge').className = `status-badge${['有效', '已配置'].includes(speech.status) ? ' ok' : ''}`;
    $('#settingsMessage').textContent = errorMessage(error);
  }
});

$('#validateSpeechButton').addEventListener('click', async () => {
  try {
    $('#speechBadge').textContent = '检查中';
    $('#speechBadge').className = 'status-badge checking';
    state.settings.speech = await window.clipHarbor.validateSpeechConfig();
    renderSpeechMeta();
    renderTools();
    $('#settingsMessage').textContent = '语音转写服务连接正常';
  } catch (error) {
    state.settings.speech = (await window.clipHarbor.getState()).settings.speech;
    renderSpeechMeta();
    $('#settingsMessage').textContent = errorMessage(error);
  }
});

$('#clearSpeechButton').addEventListener('click', async () => {
  state.settings.speech = await window.clipHarbor.clearSpeechConfig();
  renderSpeechMeta();
  renderTools();
  $('#settingsMessage').textContent = '语音识别配置已清除';
});

async function refreshMinimaxVoiceModels(showSettingsMessage = false) {
  const target = showSettingsMessage ? $('#settingsMessage') : $('#voiceGenerateStatus');
  try {
    target.className = showSettingsMessage ? 'settings-message' : 'parse-status';
    target.textContent = '正在读取账号音色…';
    state.settings.minimax = await window.clipHarbor.refreshMinimaxModels();
    renderMinimaxMeta();
    renderTools();
    target.textContent = `刷新完成 · ${state.settings.minimax.accountModelCount} 个账号自定义音色`;
  } catch (error) {
    target.className = showSettingsMessage ? 'settings-message' : 'parse-status bad';
    target.textContent = errorMessage(error);
  }
}

$('#saveMinimaxButton').addEventListener('click', async () => {
  const payload = { apiKey: $('#minimaxApiKey').value.trim() };
  if (!payload.apiKey) return void ($('#settingsMessage').textContent = '请输入语音生成服务凭证');
  try {
    $('#minimaxBadge').textContent = '连接中';
    $('#minimaxBadge').className = 'status-badge checking';
    $('#settingsMessage').textContent = '正在验证账号并读取音色…';
    state.settings.minimax = await window.clipHarbor.saveMinimaxConfig(payload);
    renderMinimaxMeta();
    renderTools();
    $('#settingsMessage').textContent = `语音生成配置已加密保存 · 读取到 ${state.settings.minimax.accountModelCount} 个自定义音色`;
  } catch (error) {
    renderMinimaxMeta();
    $('#settingsMessage').textContent = errorMessage(error);
  }
});

$('#refreshMinimaxButton').addEventListener('click', () => refreshMinimaxVoiceModels(true));
$('#refreshVoiceModels').addEventListener('click', () => refreshMinimaxVoiceModels(false));
$('#clearMinimaxButton').addEventListener('click', async () => {
  state.settings.minimax = await window.clipHarbor.clearMinimaxConfig();
  renderMinimaxMeta();
  renderTools();
  $('#settingsMessage').textContent = '语音生成配置已清除';
});

$('#voiceText').addEventListener('input', () => { $('#voiceCharCount').textContent = $('#voiceText').value.length; });
document.querySelectorAll('[data-emotion]').forEach((button) => button.addEventListener('click', () => {
  voiceEmotion = button.dataset.emotion;
  const hints = {
    '': '模型根据文本自动判断', happy: '明亮、愉悦、有感染力', sad: '低落、克制、带有悲伤感',
    angry: '强烈、急促、带有怒意', fearful: '紧张、不安、带有恐惧感', disgusted: '厌烦、排斥、带有嫌恶感',
    surprised: '意外、上扬、充满惊讶', calm: '平稳、舒缓、自然克制', fluent: '连贯、清晰、适合长文', whisper: '轻声耳语、贴近耳边',
  };
  document.querySelectorAll('[data-emotion]').forEach((item) => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-checked', String(active));
  });
  $('#emotionHint').textContent = hints[voiceEmotion];
}));
$('#voicePickerButton').addEventListener('click', () => {
  const panel = $('#voicePickerPanel');
  const opening = panel.hidden;
  if (opening) {
    panel.hidden = false;
    $('#voicePicker').classList.add('open');
    $('#voicePickerButton').setAttribute('aria-expanded', 'true');
    renderVoicePicker();
    positionVoicePicker();
    setTimeout(() => $('#voicePickerSearch').focus());
  } else closeVoicePicker();
});
document.querySelectorAll('[data-voice-category]').forEach((button) => button.addEventListener('click', () => {
  voiceCategory = button.dataset.voiceCategory;
  renderVoicePicker();
}));
$('#voicePickerSearch').addEventListener('input', renderVoicePicker);
$('#voiceId').addEventListener('input', renderVoicePicker);
document.addEventListener('pointerdown', (event) => {
  if (!$('#voicePicker').contains(event.target)) closeVoicePicker();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#voicePickerPanel').hidden) {
    closeVoicePicker();
    $('#voicePickerButton').focus();
  }
});
window.addEventListener('resize', positionVoicePicker);
document.addEventListener('scroll', positionVoicePicker, true);
$('#chooseVoiceReference').addEventListener('click', async () => {
  if(state.settings.minimax?.cloneEnabled===false)return;
  $('#chooseVoiceReference').disabled=true;
  const previousStatus=$('#voiceCloneStatus').textContent;
  $('#voiceCloneStatus').className='parse-status';
  $('#voiceCloneStatus').textContent='请选择音频，选择后将上传到服务器…';
  const selected = await window.clipHarbor.chooseAudio();
  $('#chooseVoiceReference').disabled=false;
  if (!selected) {if($('#voiceCloneStatus').textContent==='请选择音频，选择后将上传到服务器…')$('#voiceCloneStatus').textContent=previousStatus;return;}
  voiceReferencePath = selected;
  $('#voiceReferenceName').textContent = voiceReferenceLabel || selected.split(/[\\/]/).pop();
  $('#cloneSampleSummary').textContent=$('#voiceReferenceName').textContent;
  $('#clearVoiceReference').hidden = false;
  $('#voiceCloneStatus').className='parse-status ok';
  $('#voiceCloneStatus').textContent='样本已上传，可以进入下一步。';
  renderCloneFlow();
});
$('#clearVoiceReference').addEventListener('click', () => {
  voiceReferencePath = '';
  $('#voiceReferenceName').textContent = '尚未选择音频';
  $('#clearVoiceReference').hidden = true;
  $('#voiceCloneStatus').textContent='';
  renderCloneFlow(1);
});
$('#cloneNextStep').addEventListener('click',()=>{if(voiceReferencePath){$('#voiceCloneStatus').textContent='';renderCloneFlow(2,true);}});
for(const id of ['clonePreviousStep','cloneChangeSample']) $('#'+id).addEventListener('click',()=>renderCloneFlow(1,true));
$('#cloneStartAgain').addEventListener('click',()=>{
  voiceReferencePath='';$('#voiceReferenceName').textContent='尚未选择音频';$('#cloneVoiceId').value='';$('#clearVoiceReference').hidden=true;$('#voiceCloneStatus').textContent='';renderCloneFlow(1,true);
});
$('#cloneVoiceButton').addEventListener('click', async () => {
  if(state.settings.minimax?.cloneEnabled===false){window.dispatchEvent(new CustomEvent('wanchuang-error',{detail:'管理员已关闭音色克隆'}));return;}
  if (!state.settings.minimax?.configured) {
    $('#voiceCloneStatus').className = 'parse-status bad';
    $('#voiceCloneStatus').textContent = '语音生成尚未配置，请联系管理员';
    window.dispatchEvent(new CustomEvent('wanchuang-error',{detail:$('#voiceCloneStatus').textContent}));
    return;
  }
  if (!voiceReferencePath) {
    window.dispatchEvent(new CustomEvent('wanchuang-error',{detail:'请先选择参考音频'}));
    return;
  }
  const voiceId = $('#cloneVoiceId').value.trim();
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(voiceId)) {
    window.dispatchEvent(new CustomEvent('wanchuang-error',{detail:'音色 ID 需为 8–20 位英文、数字、下划线或短横线'}));
    $('#cloneVoiceId').focus();return;
  }
  const button = $('#cloneVoiceButton');
  cloneBusy=true;renderCloneFlow();
  button.disabled = true;
  $('#voiceCloneStatus').className = 'parse-status';
  $('#voiceCloneStatus').textContent = '正在上传样本并创建音色…';
  try {
    const result = await window.clipHarbor.cloneVoice({ refPath: voiceReferencePath, voiceId, noise: $('#voiceNoise').checked });
    state.settings.minimax = result.profile;
    renderMinimaxMeta();
    renderTools();
    $('#voiceCloneStatus').className = 'parse-status ok';
    $('#voiceCloneStatus').textContent = '音色创建成功，已刷新列表';
    renderCloneFlow(3,true);
  } catch (error) {
    $('#voiceCloneStatus').className = 'parse-status bad';
    $('#voiceCloneStatus').textContent = errorMessage(error);
  } finally { cloneBusy=false;button.disabled = false;renderCloneFlow(); renderIcons(); }
});
$('#goVoiceGenerate').addEventListener('click', () => setActiveView('voice'));
$('#generateVoiceButton').addEventListener('click', async () => {
  if (!state.settings.minimax?.configured) {
    setActiveView('settings');
    selectSettingsSection('minimax');
    $('#voiceGenerateStatus').className='parse-status bad';
    $('#voiceGenerateStatus').textContent='语音生成尚未配置，请联系管理员';
    return;
  }
  const button = $('#generateVoiceButton');
  const status = $('#voiceGenerateStatus');
  button.disabled = true;
  status.className = 'parse-status';
    status.textContent = '正在调用已有音色生成…';
  try {
    const result = await window.clipHarbor.generateVoice({
      text: $('#voiceText').value,
      voiceId: $('#voiceId').value,
      emotion: voiceEmotion,
    });
    voiceOutputPath = result.outputPath;
    state.settings.minimax = result.profile;
    state.voiceHistory = result.history || state.voiceHistory;
    renderMinimaxMeta();
    renderVoiceHistory(state.voiceHistory);
    $('#voiceResultEmpty').hidden = true;
    $('#voiceResultReady').hidden = false;
    const audio = $('#voiceAudio');
    const initialDuration = result.durationMs ? ` · ${(result.durationMs / 1000).toFixed(1)} 秒` : '';
    $('#voiceResultName').textContent = `${result.voiceId}${initialDuration} · 已保存`;
    audio.src = voiceAudioUrlFromBase64(result.audioBase64);
    audio.load();
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) $('#voiceResultName').textContent = `${result.voiceId} · ${audio.duration.toFixed(1)} 秒 · 已保存`;
    };
    audio.onerror = () => {
      status.className = 'parse-status bad';
      status.textContent = '音频已保存，但播放器加载失败；可点击“打开文件”播放';
    };
    status.className = 'parse-status ok';
    status.textContent = '生成完成';
  } catch (error) {
    status.className = 'parse-status bad';
    status.textContent = errorMessage(error);
  } finally {
    button.disabled = false;
    renderIcons();
  }
});
$('#openVoiceOutput').addEventListener('click', () => window.clipHarbor.openPath(voiceOutputPath || state.settings.outputDir));
$('#openVoiceHistory').addEventListener('click', () => openHistoryPage('voice', 'voice'));
$('#backFromVoiceHistory').addEventListener('click', () => {
  setActiveView(historyReturnView);
  if (historyReturnView === 'settings') selectSettingsSection('history');
});
document.querySelectorAll('[data-open-history]').forEach(button => button.addEventListener('click', () => openHistoryPage(button.dataset.openHistory)));
document.querySelectorAll('[data-history-kind]').forEach(button => button.addEventListener('click', () => {
  historyKind = button.dataset.historyKind;
  $('#historyMessage').textContent = '';
  renderHistoryPage();
}));
$('#clearHistoryButton').addEventListener('click', async () => {
  const button = $('#clearHistoryButton');
  button.disabled = true;
  try {
    const result = await window.clipHarbor.clearHistory(historyKind);
    state.voiceHistory = result.voiceHistory;
    renderJobs(result.jobs);
    renderVoiceHistory(result.voiceHistory);
    $('#historyMessage').textContent = '已清除当前浏览器的已结束记录。';
  } catch (error) {
    $('#historyMessage').textContent = errorMessage(error);
  } finally { renderHistoryPage(); }
});
$('#manageVoicesSearch').addEventListener('input', renderVoiceManagement);
document.querySelectorAll('[data-manage-voices]').forEach(button => button.addEventListener('click', () => {
  manageVoicesCategory = button.dataset.manageVoices;
  renderVoiceManagement();
}));

$('#saveSettingsButton').addEventListener('click', async (event) => {
  event.preventDefault();
  state.settings = await window.clipHarbor.saveSettings({ outputDir: $('#outputDir').value, concurrency: $('#concurrency').value });
  $('#settingsMessage').textContent = '基础设置已保存';
});

$('#openFolderButton').addEventListener('click', () => window.clipHarbor.openPath(state.settings.outputDir));
window.clipHarbor.onJobsChanged(renderJobs);
window.clipHarbor.onVoiceHistoryChanged(renderVoiceHistory);
window.clipHarbor.onCookieStatus((profiles) => {
  pendingCookieProfiles = profiles;
  if (!state) return;
  state.settings.cookieProfiles = profiles;
  renderCookieMeta();
});

initialize().then(() => {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  setActiveView(['download', 'speech', 'voice', 'voiceClone'].includes(view) ? view : 'download');
  const requestedMode = params.get('mode');
  if (['video', 'cover', 'both'].includes(requestedMode)) {
    document.querySelector('.segment[data-mode="' + requestedMode + '"]')?.click();
  }
});
document.querySelectorAll('[data-settings-section]').forEach(button => button.addEventListener('click', () => selectSettingsSection(button.dataset.settingsSection)));
$('#backFromSettings').addEventListener('click', () => {
  setActiveView(settingsReturnView);
  document.querySelector(`.feature-tab[data-view="${settingsReturnView}"]`)?.focus();
});
