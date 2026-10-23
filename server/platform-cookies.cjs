const REQUIRED_DOUYIN_COOKIES = new Set([
  'ttwid', 'uid_tt', 'uid_tt_ss', 'UIFID', 'UIFID_TEMP', 'web_sign_token', 'x_tt_token',
  'sessionid', 'sessionid_ss', 'sid_guard', 'sid_tt', 'passport_csrf_token', 'passport_csrf_token_default',
  'odin_tt', 's_v_web_id',
]);

const REQUIRED_BILIBILI_COOKIES = new Set([
  'CURRENT_QUALITY', 'DedeUserID', 'DedeUserID__ckMd5', 'SESSDATA', 'bili_jct', 'sid', 'buvid3', 'buvid4',
]);

const REQUIRED_XIAOHONGSHU_COOKIES = new Set([
  'a1', 'webId', 'gid', 'web_session', 'id_token', 'xsecappid',
  'abRequestId', 'acw_tc', 'websectiga', 'sec_poison_id',
]);

const ALL_REQUIRED_COOKIES = new Set([
  ...REQUIRED_DOUYIN_COOKIES,
  ...REQUIRED_BILIBILI_COOKIES,
  ...REQUIRED_XIAOHONGSHU_COOKIES,
]);

const COOKIE_PLATFORM_CONFIG = {
  douyin: {
    label: '抖音',
    encryptedKey: 'cookieEncrypted',
    metaKey: 'cookieMeta',
    domain: '.douyin.com',
    domainPattern: /(^|\.)douyin\.com$/i,
    loginNames: ['sessionid', 'sessionid_ss'],
    essentials: 'ttwid、sessionid、UIFID',
    loginUrl: 'https://www.douyin.com/',
  },
  bilibili: {
    label: 'B站',
    encryptedKey: 'bilibiliCookieEncrypted',
    metaKey: 'bilibiliCookieMeta',
    domain: '.bilibili.com',
    domainPattern: /(^|\.)bilibili\.com$/i,
    loginNames: ['SESSDATA'],
    essentials: 'SESSDATA、bili_jct、DedeUserID',
    loginUrl: 'https://www.bilibili.com/',
  },
  xiaohongshu: {
    label: '小红书',
    encryptedKey: 'xiaohongshuCookieEncrypted',
    metaKey: 'xiaohongshuCookieMeta',
    domain: '.xiaohongshu.com',
    domainPattern: /(^|\.)xiaohongshu\.com$/i,
    loginNames: ['web_session', 'id_token'],
    essentials: 'a1、web_session、webId',
    loginUrl: 'https://www.xiaohongshu.com/',
  },
};

function platformConfig(platform) {
  return COOKIE_PLATFORM_CONFIG[platform] || COOKIE_PLATFORM_CONFIG.douyin;
}

function splitTableLine(line) {
  if (!line.trim().startsWith('|')) return null;
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  if (cells.length < 2 || /^[-: ]+$/.test(cells[0])) return null;
  return { name: cells[0], value: cells[1], domain: cells[2] || '' };
}

function normalizeCookieInput(raw, forcedPlatform = '') {
  const candidates = [];
  const input = String(raw || '').trim();
  if (!input) throw new Error('请粘贴 Cookie 内容');

  try {
    const parsed = JSON.parse(input);
    const list = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.cookies) ? parsed.cookies
      : parsed?.name && parsed.value != null ? [parsed]
      : parsed && typeof parsed === 'object' ? Object.entries(parsed).map(([name, value]) => ({ name, value })) : [];
    for (const item of list) {
      if (item && typeof item.name === 'string' && ['string', 'number'].includes(typeof item.value)) {
        candidates.push({ name: String(item.name), value: String(item.value), domain: String(item.domain || '') });
      }
    }
  } catch {}

  // Older single-line settings inputs removed newlines from Netscape exports.
  // Recover complete records using their domain/flags/path/expiry columns.
  const netscape = /(?:^|\s)(?:#HttpOnly_)?([.a-zA-Z0-9-]+)\t(TRUE|FALSE)\t([^\t\s]+)\t(TRUE|FALSE)\t(-?\d+)\t([^\t\s]+)\t([^\s]+)/g;
  const netscapeRecords = [...input.matchAll(netscape)];
  for (const match of netscapeRecords) {
    candidates.push({ domain: match[1], name: match[6], value: match[7] });
  }
  const hasNetscapeRecords = netscapeRecords.length > 0;

  for (const line of input.split(/\r?\n/)) {
    const table = splitTableLine(line);
    if (table) candidates.push(table);
    const normalizedLine = line.replace(/^#HttpOnly_/, '');
    const columns = normalizedLine.split('\t').map((cell) => cell.trim());
    if (columns.length >= 2 && !normalizedLine.startsWith('#') && !hasNetscapeRecords) {
      if (ALL_REQUIRED_COOKIES.has(columns[0])) {
        // Chromium DevTools copies cookies as Name, Value, Domain, Path, ...
        candidates.push({ name: columns[0], value: columns[1], domain: columns[2] || '' });
      } else if (columns.length >= 7 && ALL_REQUIRED_COOKIES.has(columns[5])) {
        // Netscape format stores Name and Value in columns 6 and 7.
        candidates.push({ domain: columns[0], name: columns[5], value: columns[6] });
      }
    }
    if (columns.length < 2) {
      // Some copy paths collapse the DevTools table into spaces instead of tabs.
      const spaced = normalizedLine.trim().split(/\s+/);
      if (spaced.length >= 2 && ALL_REQUIRED_COOKIES.has(spaced[0])) {
        candidates.push({ name: spaced[0], value: spaced[1], domain: spaced[2] || '' });
      }
    }
  }

  // Network panel -> "Copy as cURL" carries the complete Cookie header,
  // including HttpOnly entries that the Application panel table may not copy.
  const headerMatch = input.match(/(?:^|(?<=[\s"'\-,]))cookie\s*:\s*(?:"([^"]*)"|'([^']*)'|([^"'\r\n]*))/i);
  const embedded = headerMatch && (headerMatch[1] ?? headerMatch[2] ?? headerMatch[3] ?? '');
  if (embedded && embedded.includes('=')) {
    for (const part of embedded.split(';')) {
      const at = part.indexOf('=');
      if (at > 0) candidates.push({ name: part.slice(0, at).trim(), value: part.slice(at + 1).trim(), domain: '' });
    }
  }

  if (!candidates.length) {
    const source = input.replace(/^cookie\s*:\s*/i, '').replace(/[\r\n]+/g, ';');
    for (const part of source.split(';')) {
      const at = part.indexOf('=');
      if (at > 0) candidates.push({ name: part.slice(0, at).trim(), value: part.slice(at + 1).trim(), domain: '' });
    }
  }

  const inferredXiaohongshu = candidates.some((cookie) => REQUIRED_XIAOHONGSHU_COOKIES.has(cookie.name));
  const inferredBilibili = candidates.some((cookie) => REQUIRED_BILIBILI_COOKIES.has(cookie.name));
  const platform = forcedPlatform || (inferredXiaohongshu ? 'xiaohongshu' : inferredBilibili ? 'bilibili' : 'douyin');
  const config = platformConfig(platform);
  const allowed = platform === 'xiaohongshu'
    ? REQUIRED_XIAOHONGSHU_COOKIES
    : platform === 'bilibili'
      ? REQUIRED_BILIBILI_COOKIES
      : REQUIRED_DOUYIN_COOKIES;
  const chosen = new Map();
  for (const cookie of candidates) {
    if (!allowed.has(cookie.name) || !cookie.value) continue;
    // Plugin exports may contain multiple sites. Never forward another site's
    // same-named session cookie to this platform.
    if (cookie.domain && !config.domainPattern.test(cookie.domain)) continue;
    if (/[;\r\n\x00-\x1f\x7f]/.test(cookie.value)) continue;
    const old = chosen.get(cookie.name);
    const score = config.domainPattern.test(cookie.domain) ? 2 : cookie.domain ? 1 : 0;
    const oldScore = old && config.domainPattern.test(old.domain) ? 2 : old?.domain ? 1 : 0;
    if (!old || score >= oldScore) chosen.set(cookie.name, cookie);
  }

  if (!chosen.size) {
    throw new Error(`这段内容里没有${config.label}需要的关键字段（关键字段包括 ${config.essentials}）。已保留原有 Cookie，未做替换。`);
  }
  const header = [...chosen.values()].map(({ name, value }) => `${name}=${value}`).join('; ');
  return { platform, header, names: [...chosen.keys()], count: chosen.size };
}
module.exports = { normalizeCookieInput };
