// Browser compatibility only. No desktop credentials, paths or stored jobs are imported.
(() => {
  const state = {
    settings: { outputDir: '网页版服务尚未接通', concurrency: 2, cookieProfiles: [],
      speech: { configured: false, status: '未接通' },
      minimax: { configured: false, status: '未接通', models: [], favorites: [] } },
    tools: { ytDlp: false, ffmpeg: false, browser: false }, jobs: [], voiceHistory: [],
  };
  const message = '网页版服务尚未接通，请使用桌面版执行此操作。当前不会保存任何凭证或创建任务。';
  const unavailable = async () => {
    document.getElementById('webStatus').textContent = message;
    throw new Error(message);
  };
  const api = { getState: async () => structuredClone(state),
    onJobsChanged: () => {}, onVoiceHistoryChanged: () => {}, onCookieStatus: () => {} };
  for (const method of ['chooseFolder', 'chooseAudio', 'saveSettings', 'importCookies', 'inspectCookies',
    'validateCookies', 'authorizeCookies', 'clearCookies', 'saveSpeechConfig', 'validateSpeechConfig',
    'clearSpeechConfig', 'saveMinimaxConfig', 'refreshMinimaxModels', 'saveMinimaxFavorites',
    'clearMinimaxConfig', 'generateVoice', 'readVoiceHistoryAudio', 'parseMedia', 'addJobs',
    'cancelJob', 'retryJob', 'clearFinished', 'revealHistoryFile', 'removeHistoryRecord',
    'deleteHistoryFiles', 'openPath']) api[method] = unavailable;
  window.clipHarbor = Object.freeze(api);
  // Original desktop handlers sometimes rely on IPC's rejection handling.
  window.addEventListener('unhandledrejection', event => {
    if (event.reason?.message === message) event.preventDefault();
  });
  document.querySelectorAll('input[type="password"], #cookieInput, #iflytekAppId').forEach(input => {
    input.disabled = true;
    input.placeholder = '网页版暂不接收凭证';
  });
})();
