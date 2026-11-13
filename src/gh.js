// Слой синхронизации через GitHub Contents API
// Данные живут в приватном репо как data/timetable.json

export const REPO = 'LeBWa219/timetable';
const REMOTE_PATH = 'data/timetable.json';
const API = 'https://api.github.com';
const BRANCH = 'main';

function headers(token) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function b64Decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function b64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function ghFetch(token, path, options = {}) {
  let res;
  try {
    res = await fetch(API + path, { ...options, headers: { ...headers(token), ...(options.headers || {}) } });
  } catch (e) {
    const err = new Error('Нет соединения с GitHub');
    err.kind = 'offline';
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    const err = new Error('Токен не подошёл — проверь его права');
    err.kind = 'badtoken';
    err.status = res.status;
    throw err;
  }
  return res;
}

// Токен подходит и репо доступно?
export async function verifyToken(token) {
  const res = await ghFetch(token, `/repos/${REPO}`);
  if (!res.ok) {
    const err = new Error(res.status === 404 ? 'Репозиторий недоступен для этого токена' : `GitHub ответил ${res.status}`);
    err.kind = 'badtoken';
    throw err;
  }
  return true;
}

// Забрать данные. Возвращает { data, sha } — data=null, если файла ещё нет
export async function pull(token) {
  const res = await ghFetch(token, `/repos/${REPO}/contents/${REMOTE_PATH}?ref=${BRANCH}`);
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) {
    const err = new Error('Не удалось скачать данные (' + res.status + ')');
    err.kind = 'error';
    throw err;
  }
  const j = await res.json();
  let data = null;
  if (j.content) {
    try {
      data = JSON.parse(b64Decode(j.content));
    } catch {
      data = { tasks: [], updatedAt: 0 };
    }
  }
  return { data, sha: j.sha };
}

// Записать данные. Возвращает новый sha.
export async function push(token, data, sha) {
  const body = {
    message: 'timetable: sync',
    content: b64Encode(JSON.stringify(data, null, 2)),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await ghFetch(token, `/repos/${REPO}/contents/${REMOTE_PATH}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const err = new Error('Конфликт версий');
    err.kind = 'conflict';
    throw err;
  }
  if (!res.ok) {
    const err = new Error('Не удалось записать данные (' + res.status + ')');
    err.kind = 'error';
    throw err;
  }
  const j = await res.json();
  return j.content && j.content.sha;
}
