import { useEffect, useMemo, useRef, useState } from 'react';
import { REPO, pull, push, verifyToken } from './gh';
import { Ring, Tag, Sheet, PulseDot, TAG_LIST } from './ui';

/* ───────────── утилиты ───────────── */
const LS_TOKEN = 'tt.token';
const LS_DATA = 'tt.data.v1';

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dateStr(new Date());

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEK_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
const WEEK_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtPill(s) {
  const d = parseDate(s);
  return `${WEEK_SHORT[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()}`;
}
function fmtFull(s) {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEK_FULL[d.getDay()]}`;
}
const toMin = (hm) => (hm ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) : null);

function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_DATA));
    if (d && Array.isArray(d.tasks)) return d;
  } catch (e) { /* пусто */ }
  return { tasks: [], updatedAt: 0 };
}
function saveLocal(doc) {
  localStorage.setItem(LS_DATA, JSON.stringify(doc));
}

const SYNC_LABELS = {
  off: 'синк выключен',
  connecting: 'подключаюсь…',
  pulling: 'обновляю…',
  pushing: 'сохраняю…',
  synced: 'синхронизировано',
  offline: 'офлайн — изменения в телефоне',
  badtoken: 'токен не подошёл',
  error: 'ошибка синка',
};

/* ───────────── приложение ───────────── */
export default function App() {
  const [doc, setDoc] = useState(loadLocal);
  const [viewDate, setViewDate] = useState(todayStr());
  const [token, setToken] = useState(() => localStorage.getItem(LS_TOKEN) || '');
  const [sync, setSync] = useState(() => ({ state: localStorage.getItem(LS_TOKEN) ? 'connecting' : 'off', msg: '' }));
  const [sheet, setSheet] = useState(null); // {task?} — редактирование, {date} — новое
  const [settingsOpen, setSettingsOpen] = useState(false);
  const shaRef = useRef(null);
  const pushTimer = useRef(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  /* —— запись мутаций + отложенный пуш —— */
  const mutate = (fn) => {
    setDoc((prev) => {
      const next = { ...fn(prev), updatedAt: Date.now() };
      saveLocal(next);
      if (token) schedulePush(next);
      return next;
    });
  };

  const schedulePush = (docArg) => {
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => doPush(docArg), 1200);
  };

  const doPush = async (docArg) => {
    const d = docArg || docRef.current;
    if (!token || !d) return;
    setSync((s) => (s.state === 'synced' || s.state === 'pushing' ? { state: 'pushing' } : s));
    try {
      const sha = await push(token, d, shaRef.current);
      shaRef.current = sha;
      setSync({ state: 'synced' });
    } catch (e) {
      if (e.kind === 'conflict') {
        // кто-то обновил файл раньше нас — перечитываем sha и пишем поверх
        try {
          const { sha } = await pull(token);
          shaRef.current = sha;
          const sha2 = await push(token, d, sha);
          shaRef.current = sha2;
          setSync({ state: 'synced' });
        } catch (e2) {
          setSync({ state: e2.kind === 'offline' ? 'offline' : 'error', msg: e2.message });
        }
      } else {
        setSync({ state: e.kind === 'offline' ? 'offline' : e.kind === 'badtoken' ? 'badtoken' : 'error', msg: e.message });
      }
    }
  };

  /* —— первичная синхронизация при старте / смене токена —— */
  useEffect(() => {
    if (!token) { setSync({ state: 'off' }); return; }
    let alive = true;
    (async () => {
      setSync({ state: 'connecting' });
      try {
        await verifyToken(token);
        const { data, sha } = await pull(token);
        if (!alive) return;
        shaRef.current = sha;
        const local = loadLocal();
        let use;
        if (data && (data.updatedAt || 0) > (local.updatedAt || 0)) {
          use = data;
          saveLocal(use);
          setDoc(use);
        } else {
          use = local;
          setDoc(use);
          if (local.tasks.length || local.updatedAt) {
            setSync({ state: 'pushing' });
            const newSha = await push(token, use, sha);
            shaRef.current = newSha;
          }
        }
        if (alive) setSync({ state: 'synced' });
      } catch (e) {
        if (!alive) return;
        setSync({ state: e.kind === 'offline' ? 'offline' : e.kind === 'badtoken' ? 'badtoken' : 'error', msg: e.message });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* —— мутации задач —— */
  const addTask = (fields) => mutate((p) => ({
    tasks: [...p.tasks, {
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
      title: fields.title, date: fields.date, start: fields.start, end: fields.end,
      tag: fields.tag, done: false, createdAt: Date.now(), updatedAt: Date.now(),
    }],
  }));
  const updateTask = (id, patch) => mutate((p) => ({
    tasks: p.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
  }));
  const deleteTask = (id) => mutate((p) => ({ tasks: p.tasks.filter((t) => t.id !== id) }));
  const toggleDone = (id) => mutate((p) => ({
    tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: !t.done, updatedAt: Date.now() } : t)),
  }));

  /* —— производные данные —— */
  const today = todayStr();
  const dayTasks = useMemo(() => {
    const list = doc.tasks.filter((t) => t.date === viewDate);
    return list.sort((a, b) => {
      const sa = a.start ? toMin(a.start) : 1e9;
      const sb = b.start ? toMin(b.start) : 1e9;
      return sa - sb || (a.createdAt || 0) - (b.createdAt || 0);
    });
  }, [doc, viewDate]);

  const overdue = useMemo(() => {
    if (viewDate !== today) return [];
    return doc.tasks.filter((t) => t.date < today && !t.done)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [doc, viewDate, today]);

  const doneCount = dayTasks.filter((t) => t.done).length;

  const hero = useMemo(() => {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const open = dayTasks.filter((t) => !t.done);
    const current = open.find((t) => t.start && t.end && toMin(t.start) <= nowMin && nowMin < toMin(t.end));
    if (current) return { task: current, mode: 'now' };
    const next = open.find((t) => t.start && toMin(t.start) > nowMin) || open[0];
    if (next) return { task: next, mode: 'next' };
    return null;
  }, [dayTasks]);

  const allDone = dayTasks.length > 0 && doneCount === dayTasks.length;

  /* —— шторка задачи —— */
  const openNew = () => setSheet({ date: viewDate });

  return (
    <div className="app">
      <div className="blob blob1" aria-hidden="true" />
      <div className="blob blob2" aria-hidden="true" />

      <header className="head">
        <div className="head-row">
          <div className="datenav">
            <button className="navbtn" onClick={() => setViewDate(shiftDay(viewDate, -1))} aria-label="Предыдущий день">
              <Chevron dir="left" />
            </button>
            <button className="datepill" onClick={() => setViewDate(todayStr())} title="Вернуться к сегодня">
              {fmtPill(viewDate)}
              {viewDate !== today && <span className="not-today">· вернуться?</span>}
            </button>
            <button className="navbtn" onClick={() => setViewDate(shiftDay(viewDate, 1))} aria-label="Следующий день">
              <Chevron dir="right" />
            </button>
          </div>
          <button className="gear" onClick={() => setSettingsOpen(true)} aria-label="Настройки синхронизации">
            <GearIcon />
          </button>
        </div>
        <div className="meta-row">
          <span className={`sync-chip s-${sync.state}`} title={sync.msg || ''}>
            <span className="sync-dot" aria-hidden="true" />
            {SYNC_LABELS[sync.state] || sync.state}
          </span>
          <span className="count"><b>{doneCount} из {dayTasks.length}</b> сделано</span>
        </div>
        <div className="full-date">{fmtFull(viewDate)}</div>
      </header>

      <div className="desk">
        <div className="desk-main">
          {hero && (
            <section className="hero" aria-label="Текущее дело">
              <Ring done={doneCount} total={dayTasks.length} />
              <div className="hero-txt">
                <div className="hero-label">
                  {hero.mode === 'now' ? (<><PulseDot /> СЕЙЧАС</>) : 'ДАЛЬШЕ'}
                </div>
                <div className="hero-title">{hero.task.title}</div>
                <div className="hero-sub">
                  {hero.task.start ? `${hero.task.start}${hero.task.end ? '–' + hero.task.end : ''} · ` : ''}
                  <Tag t={hero.task.tag} />
                </div>
              </div>
            </section>
          )}
          {allDone && (
            <section className="hero hero-done" aria-label="Все дела сделаны">
              <span className="done-emoji">🎉</span>
              <div className="hero-txt">
                <div className="hero-title">Всё сделано!</div>
                <div className="hero-sub">{doneCount} {plural(doneCount, 'дело', 'дела', 'дел')} закрыто — отдыхай</div>
              </div>
            </section>
          )}

          <main className="list">
            {overdue.length > 0 && (
              <>
                <div className="sec-title">Просрочено</div>
                {overdue.map((t) => (
                  <TaskRow key={t.id} task={{ ...t, overdue: true }} onToggle={() => toggleDone(t.id)} onEdit={() => setSheet({ task: t })} />
                ))}
              </>
            )}
            {dayTasks.length > 0 ? (
              <>
                <div className="sec-title">Дела дня</div>
                {dayTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={() => toggleDone(t.id)} onEdit={() => setSheet({ task: t })} />
                ))}
              </>
            ) : (
              <div className="empty">
                <div className="empty-emoji">🗂️</div>
                <div className="empty-title">На этот день дел нет</div>
                <div className="empty-sub">Добавь первое дело кнопкой внизу</div>
                <button className="btn-primary" onClick={openNew}>Добавить дело</button>
              </div>
            )}
          </main>
        </div>

        <aside className="desk-side">
          <WeekCard viewDate={viewDate} tasks={doc.tasks} onPick={setViewDate} today={today} />
        </aside>
      </div>

      <button className="addbar" onClick={openNew}>
        <span className="addbar-plus">＋</span>
        <span>Добавить дело…</span>
      </button>

      {sheet && (
        <TaskSheet
          init={sheet.task || { date: sheet.date, tag: 'work' }}
          isNew={!sheet.task}
          onClose={() => setSheet(null)}
          onSave={(fields) => {
            if (sheet.task) updateTask(sheet.task.id, fields);
            else addTask(fields);
            setSheet(null);
          }}
          onDelete={() => { deleteTask(sheet.task.id); setSheet(null); }}
        />
      )}
      {settingsOpen && (
        <SettingsSheet
          sync={sync}
          token={token}
          onClose={() => setSettingsOpen(false)}
          onSave={(t) => { setToken(t); setSettingsOpen(false); }}
          onDisable={() => { localStorage.removeItem(LS_TOKEN); setToken(''); shaRef.current = null; setSettingsOpen(false); }}
        />
      )}
    </div>
  );
}

function shiftDay(s, delta) {
  const d = parseDate(s);
  d.setDate(d.getDate() + delta);
  return dateStr(d);
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/* ───────────── строка задачи ───────────── */
function TaskRow({ task, onToggle, onEdit }) {
  return (
    <div className={`chip ${task.done ? 'done' : ''} ${task.overdue ? 'late' : ''} appear`}>
      <button
        className="check"
        onClick={onToggle}
        aria-pressed={task.done}
        aria-label={`${task.done ? 'Вернуть' : 'Выполнить'}: ${task.title}`}
      />
      <button className="chip-body" onClick={onEdit} aria-label={`Редактировать: ${task.title}`}>
        <div className="chip-title">{task.title}</div>
        <div className="chip-sub">
          {task.start && <span className="chip-time">{task.start}{task.end ? '–' + task.end : ''}</span>}
          <Tag t={task.tag} late={task.overdue} />
        </div>
      </button>
    </div>
  );
}

/* ───────────── обзор недели (десктоп) ───────────── */
const WEEK_MON = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

function WeekCard({ viewDate, tasks, onPick, today }) {
  const days = useMemo(() => {
    const d = parseDate(viewDate);
    const dow = (d.getDay() + 6) % 7; // 0 = понедельник
    const monday = new Date(d);
    monday.setDate(d.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      const ds = dateStr(dd);
      const dayTasks = tasks.filter((t) => t.date === ds);
      return {
        ds,
        label: WEEK_MON[i],
        num: dd.getDate(),
        done: dayTasks.filter((t) => t.done).length,
        total: dayTasks.length,
        isToday: ds === today,
        isSel: ds === viewDate,
        isPast: ds < today,
      };
    });
  }, [tasks, viewDate, today]);

  const totals = days.reduce((a, x) => ({ done: a.done + x.done, total: a.total + x.total }), { done: 0, total: 0 });

  return (
    <div className="week-card" aria-label="Обзор недели">
      <div className="wc-head">Неделя</div>
      <div className="wc-days">
        {days.map((d) => (
          <button
            key={d.ds}
            className={`wc-day ${d.isSel ? 'sel' : ''} ${d.isToday ? 'today' : ''} ${d.isPast ? 'past' : ''}`}
            onClick={() => onPick(d.ds)}
            aria-label={`${d.label} ${d.num}: ${d.done} из ${d.total} сделано`}
            aria-pressed={d.isSel}
          >
            <span className="wc-label">{d.label}</span>
            <span className="wc-num">{d.num}</span>
            <span className="wc-bar"><i style={{ width: (d.total ? Math.round((d.done / d.total) * 100) : 0) + '%' }} /></span>
            <span className="wc-count">{d.done}/{d.total}</span>
          </button>
        ))}
      </div>
      <div className="wc-foot"><span>за неделю</span><b>{totals.done} из {totals.total}</b></div>
    </div>
  );
}

/* ───────────── шторка задачи ───────────── */
function TaskSheet({ init, isNew, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(init.title || '');
  const [start, setStart] = useState(init.start || '');
  const [end, setEnd] = useState(init.end || '');
  const [tag, setTag] = useState(init.tag || 'work');

  return (
    <Sheet onClose={onClose} title={isNew ? 'Новое дело' : 'Редактирование'}>
      <h3 className="sheet-title">{isNew ? 'Новое дело' : 'Редактировать'}</h3>
      <input
        className="field"
        placeholder="Что сделать?"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) onSave({ title: title.trim(), date: init.date, start: start || null, end: end || null, tag }); }}
      />
      <div className="time-row">
        <label className="time-label">с <input type="time" className="field time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="time-label">до <input type="time" className="field time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <div className="tagpick" role="radiogroup" aria-label="Категория">
        {TAG_LIST.map(([k, label]) => (
          <button
            key={k}
            className={`tagpick-chip ${tag === k ? 'active' : ''}`}
            onClick={() => setTag(k)}
            aria-pressed={tag === k}
          >{label}</button>
        ))}
      </div>
      <div className="sheet-actions">
        {!isNew && <button className="btn-danger" onClick={onDelete}>Удалить</button>}
        <button
          className="btn-primary"
          disabled={!title.trim()}
          onClick={() => onSave({ title: title.trim(), date: init.date, start: start || null, end: end || null, tag })}
        >Сохранить</button>
      </div>
    </Sheet>
  );
}

/* ───────────── настройки синхронизации ───────────── */
function SettingsSheet({ sync, token, onClose, onSave, onDisable }) {
  const [val, setVal] = useState(token);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const t = val.trim();
    if (!t) { setErr('Вставь токен'); return; }
    setChecking(true);
    setErr('');
    try {
      await verifyToken(t);
      localStorage.setItem('tt.token', t);
      onSave(t);
    } catch (e) {
      setErr(e.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Sheet onClose={onClose} title="Синхронизация">
      <h3 className="sheet-title">Синхронизация</h3>
      <p className="settings-text">
        Данные хранятся в приватном репо <b>{REPO}</b> (файл <code>data/timetable.json</code>)
        и синхронизируются через GitHub API. Нужен личный токен с доступом к этому репо.
      </p>
      <ol className="settings-steps">
        <li>Открой <b>github.com/settings/personal-access-tokens/new</b></li>
        <li>Repository access — <b>Only select repositories → timetable</b></li>
        <li>Permissions → <b>Contents: Read and write</b></li>
        <li>Создай токен и вставь его сюда</li>
      </ol>
      <input
        className="field mono"
        type="password"
        placeholder="github_pat_…"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        autoComplete="off"
      />
      {sync.state === 'offline' && <div className="sync-note warn">Сейчас офлайн: изменения сохранены на устройстве и уедут при подключении</div>}
      {err && <div className="sync-note err">{err}</div>}
      <div className="sheet-actions">
        {token && <button className="btn-ghost" onClick={onDisable}>Выключить синк</button>}
        <button className="btn-primary" onClick={save} disabled={checking}>
          {checking ? 'Проверяю…' : 'Сохранить и проверить'}
        </button>
      </div>
    </Sheet>
  );
}

/* ───────────── мелкие иконки ───────────── */
function Chevron({ dir }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
