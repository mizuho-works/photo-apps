'use strict';
const $ = id => document.getElementById(id);
const MAX_PHOTOS = 12;
const cameraIcon = new Image();
cameraIcon.src = 'icons/camera-white.svg';
cameraIcon.onload = () => render();
const canvas = $('preview');
const state = { photos: Array(MAX_PHOTOS).fill(null), count: 12, ratio: 4 / 3, frame: 'grid-3', custom: null, loading: false, editing: -1, target: null, tool: null };
const status = message => { $('status').textContent = message; if (message) setTimeout(() => { if ($('status').textContent === message) $('status').textContent = ''; }, 4500); };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const imageUrls = new Set();
const history = []; let historyIndex = -1;
function snapshot() {
  return { photos: state.photos.map(photo => photo ? { ...photo } : null), count: state.count, ratio: state.ratio, frame: state.frame, custom: state.custom ? { ...state.custom } : null,
    controls: Object.fromEntries(['outer', 'gap', 'rounding', 'background'].map(id => [id, $(id).value])) };
}
function historyKey(value) { return JSON.stringify(value, (key, v) => key === 'image' ? undefined : v); }
function updateHistoryButtons() {
  $('undo').disabled = state.loading || historyIndex <= 0;
  $('redo').disabled = state.loading || historyIndex >= history.length - 1;
}
function recordHistory() {
  const value = snapshot();
  if (historyIndex >= 0 && historyKey(value) === historyKey(history[historyIndex])) { updateHistoryButtons(); return; }
  history.splice(historyIndex + 1); history.push(value);
  if (history.length > 30) history.shift();
  historyIndex = history.length - 1;
  const used = new Set([...state.photos, ...history.flatMap(item => item.photos)].filter(Boolean).map(photo => photo.url));
  for (const url of imageUrls) if (!used.has(url)) { URL.revokeObjectURL(url); imageUrls.delete(url); }
  updateHistoryButtons();
}
function restoreHistory(direction) {
  const index = historyIndex + direction;
  if (state.loading || index < 0 || index >= history.length) return;
  historyIndex = index; const value = history[index];
  Object.assign(state, { photos: value.photos.map(photo => photo ? { ...photo } : null), count: value.count, ratio: value.ratio, frame: value.frame, custom: value.custom ? { ...value.custom } : null });
  for (const [id, v] of Object.entries(value.controls)) { $(id).value = v; if ($(`${id}-value`)) $(`${id}-value`).value = `${v} px`; }
  document.querySelectorAll('[data-ratio]').forEach(button => { const selected = Math.abs(Number(button.dataset.ratio) - state.ratio) < .00001; button.setAttribute('aria-pressed', String(selected)); if (selected) $('ratio-label').textContent = button.dataset.label; });
  countButtons(); frameGallery(); updateSwatches(); render();
  status(direction < 0 ? '元に戻しました。' : 'やり直しました。');
}
$('undo').onclick = () => restoreHistory(-1);
$('redo').onclick = () => restoreHistory(1);
for (const id of ['outer', 'gap', 'rounding', 'background']) $(id).addEventListener('change', recordHistory);

function grid(n, cols) {
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols), count = Math.min(cols, n - row * cols);
    return { x: (i % cols) / count, y: row / rows, w: 1 / count, h: 1 / rows };
  });
}
function presets(n) {
  const items = [];
  const options = [...new Set([Math.min(3, n), 1, 2, 3, 4, 5, 6, n])].filter(c => c <= n);
  options.forEach(c => items.push({ id: `grid-${c}`, name: `${Math.ceil(n / c)}段 × ${c}列`, boxes: grid(n, c) }));
  if (n > 1) {
    for (const split of [.5, .65]) for (const vertical of [false, true]) for (const flip of [false, true]) {
      const boxes = [{ x: 0, y: 0, w: split, h: 1 }, ...grid(n - 1, Math.min(n - 1, n > 5 ? 2 : 1)).map(b => ({ x: split + b.x * (1 - split), y: b.y, w: b.w * (1 - split), h: b.h }))];
      const transformed = boxes.map(b => {
        const a = flip ? { ...b, x: 1 - b.x - b.w } : b;
        return vertical ? { x: a.y, y: a.x, w: a.h, h: a.w } : a;
      });
      items.push({ id: `hero-${split}-${vertical}-${flip}`, name: '大きな1枚', boxes: transformed });
    }
  }
  return items;
}
function normalizedBoxes() {
  if (state.frame === 'custom' && state.custom) return grid(state.count, state.custom.cols);
  const all = presets(state.count);
  return (all.find(p => p.id === state.frame) || all[0]).boxes;
}
function boxesFor(width, height) {
  const scale = Math.max(width, height) / 1600;
  const outer = Number($('outer').value) * scale, gap = Number($('gap').value) * scale;
  const innerW = width - outer * 2, innerH = height - outer * 2;
  return normalizedBoxes().map(b => {
    const left = b.x > .0001 ? gap / 2 : 0, top = b.y > .0001 ? gap / 2 : 0;
    const right = b.x + b.w < .9999 ? gap / 2 : 0, bottom = b.y + b.h < .9999 ? gap / 2 : 0;
    return { x: outer + b.x * innerW + left, y: outer + b.y * innerH + top, w: Math.max(1, b.w * innerW - left - right), h: Math.max(1, b.h * innerH - top - bottom) };
  });
}
function photoGeometry(photo, box) {
  const scale = Math.max(box.w / photo.image.width, box.h / photo.image.height) * photo.zoom;
  const w = photo.image.width * scale, h = photo.image.height * scale;
  return { x: box.x + (box.w - w) / 2 + photo.x * box.w, y: box.y + (box.h - h) / 2 + photo.y * box.h, w, h };
}
function drawPhoto(ctx, photo, box, rounding = 0) {
  const p = photoGeometry(photo, box);
  ctx.save(); ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(rounding, box.w / 2, box.h / 2)); ctx.clip();
  ctx.drawImage(photo.image, p.x, p.y, p.w, p.h); ctx.restore();
}
function drawPlaceholder(ctx, box, i) {
  const { x, y, w, h } = box;
  ctx.fillStyle = '#535353'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 0); ctx.fill();
  const unit = Math.min(w / 7, h / 5, 45), cx = x + w / 2, cy = y + h / 2 - unit * .25;
  if (cameraIcon.complete && cameraIcon.naturalWidth) ctx.drawImage(cameraIcon, cx - unit, cy - unit, unit * 2, unit * 2);
  ctx.fillStyle = '#ddd'; ctx.textAlign = 'center'; ctx.font = `${Math.min(22, w / 11, h / 9)}px sans-serif`;
  ctx.fillText(`写真を選択 ${i + 1}`, cx, cy + unit * 1.4);
}
function drawCollage(target, placeholders) {
  const ctx = target.getContext('2d'); ctx.fillStyle = $('background').value; ctx.fillRect(0, 0, target.width, target.height);
  const rounding = Number($('rounding').value) * Math.max(target.width, target.height) / 1600;
  boxesFor(target.width, target.height).forEach((box, i) => {
    if (state.photos[i]) drawPhoto(ctx, state.photos[i], box, rounding);
    else if (placeholders) drawPlaceholder(ctx, box, i);
  });
}
function sizeCanvas(target, longest) {
  target.width = Math.round(state.ratio >= 1 ? longest : longest * state.ratio);
  target.height = Math.round(state.ratio >= 1 ? longest / state.ratio : longest);
}
function render() {
  sizeCanvas(canvas, 1600);
  const area = $('preview-area');
  const availableWidth = Math.max(40, (area.clientWidth || window.innerWidth || 390) - 56);
  const availableHeight = Math.max(40, (area.clientHeight || window.innerHeight * .55) - 28);
  canvas.parentElement.style.width = `${Math.floor(Math.min(availableWidth, availableHeight * state.ratio))}px`;
  canvas.parentElement.style.aspectRatio = String(state.ratio);
  drawCollage(canvas, true);
  const filled = state.photos.slice(0, state.count).filter(Boolean).length;
  $('photo-count').textContent = `${filled} / ${state.count}枚`;
  $('save').disabled = !filled || state.loading;
  $('settings-save').disabled = !filled || state.loading;
  updateHistoryButtons();
}
function showTool(name) {
  state.tool = name;
  document.querySelectorAll('.tool-panel').forEach(panel => { panel.hidden = panel.id !== `panel-${name}`; });
  document.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === name)));
  $('panel-header').hidden = !name;
  $('counts').hidden = name !== 'frames';
  $('panel-title').textContent = ({ frames: 'フレーム', spacing: '外枠と余白', background: '背景', ratio: '全体の比率' })[name] || '';
  render();
}
$('panel-close').onclick = () => showTool(null);
function frameGallery() {
  const gallery = $('frame-gallery'); gallery.replaceChildren();
  const all = presets(state.count);
  if (state.custom && state.frame === 'custom') all.unshift({ id: 'custom', name: `${state.custom.rows}段 × ${state.custom.cols}列`, boxes: normalizedBoxes() });
  for (const frame of all) {
    const button = document.createElement('button'); button.className = 'frame'; button.dataset.name = frame.name;
    button.setAttribute('aria-label', `${frame.name}のフレーム`); button.setAttribute('aria-pressed', String(frame.id === state.frame));
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('aria-hidden', 'true');
    frame.boxes.forEach(b => {
      const rect = document.createElementNS(ns, 'rect');
      for (const [attr, value] of Object.entries({ x: b.x * 100 + 1.5, y: b.y * 100 + 1.5, width: Math.max(1, b.w * 100 - 3), height: Math.max(1, b.h * 100 - 3), rx: 3 })) rect.setAttribute(attr, value);
      svg.append(rect);
    });
    button.append(svg); button.onclick = () => { state.frame = frame.id; frameGallery(); render(); recordHistory(); }; gallery.append(button);
  }
}
function countButtons() {
  $('counts').replaceChildren();
  for (let n = 1; n <= MAX_PHOTOS; n++) {
    const button = document.createElement('button'); button.textContent = n; button.setAttribute('aria-label', `${n}枚のフレーム`); button.setAttribute('aria-pressed', String(state.count === n));
    button.onclick = () => {
      state.count = n; state.frame = `grid-${Math.min(n, 3)}`; state.custom = null;
      countButtons(); frameGallery(); render(); recordHistory();
      status(state.photos.slice(n).some(Boolean) ? '枠に収まらない写真は、枚数を戻すと再び表示されます。' : '');
    };
    $('counts').append(button);
  }
}
function selectFiles(index = null) { state.target = index; $('photos').click(); }
canvas.addEventListener('click', event => {
  if (state.loading) return;
  const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) * canvas.width / rect.width, y = (event.clientY - rect.top) * canvas.height / rect.height;
  const i = boxesFor(canvas.width, canvas.height).findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  showTool(null);
  if (i >= 0) state.photos[i] ? openEditor(i) : selectFiles(i);
});
canvas.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const i = state.photos.slice(0, state.count).findIndex(Boolean); if (i >= 0) openEditor(i); else selectFiles(0); } });
$('photos').addEventListener('change', async event => {
  if (state.loading) return;
  const files = Array.from(event.target.files); event.target.value = '';
  if (!files.length) { state.target = null; return; }
  const slots = [];
  if (state.target !== null) slots.push(state.target);
  for (let i = 0; i < MAX_PHOTOS; i++) if (!state.photos[i] && !slots.includes(i)) slots.push(i);
  state.target = null;
  showTool(null);
  if (!slots.length) { status('最大12枚です。写真をタップすると変更・削除できます。'); return; }
  state.loading = true; $('photos').disabled = true; render(); status('写真を読み込んでいます…');
  let failed = 0, loaded = 0;
  for (const file of files.slice(0, slots.length)) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const i = slots[loaded]; 
      imageUrls.add(url);
      state.photos[i] = { image, url, name: file.name, zoom: 1, x: 0, y: 0 }; loaded++;
      if (i >= state.count) { state.count = i + 1; state.frame = `grid-${Math.min(state.count, 3)}`; state.custom = null; }
    } catch { URL.revokeObjectURL(url); failed++; }
  }
  state.loading = false; $('photos').disabled = false; countButtons(); frameGallery(); render(); recordHistory();
  status(failed ? `${failed}枚を読み込めませんでした。JPEG・PNGでお試しください。` : files.length > slots.length ? '最大12枚まで追加しました。' : '写真をタップすると拡大・縮小・位置調整ができます。');
});
$('photos').addEventListener('cancel', () => { state.target = null; });
document.querySelector('label[for="photos"]').addEventListener('click', () => { state.target = null; });

function editPhoto() { return state.photos[state.editing]; }
function renderEditor() {
  const photo = editPhoto(); if (!photo) return;
  const box = boxesFor(canvas.width, canvas.height)[state.editing], target = $('edit-canvas');
  const factor = 800 / Math.max(box.w, box.h); target.width = Math.round(box.w * factor); target.height = Math.round(box.h * factor);
  const ctx = target.getContext('2d'); ctx.fillStyle = $('background').value; ctx.fillRect(0, 0, target.width, target.height);
  drawPhoto(ctx, photo, { x: 0, y: 0, w: target.width, h: target.height });
  $('zoom').value = Math.round(photo.zoom * 100); $('zoom-value').value = `${Math.round(photo.zoom * 100)}%`;
  $('position-x').value = Math.round(photo.x * 100); $('position-y').value = Math.round(photo.y * 100);
}
function openEditor(i) {
  if (state.loading) return;
  showTool(null); state.editing = i; $('edit-title').textContent = `${i + 1}枚目の写真を調整`; renderEditor(); $('photo-editor').showModal();
}
for (const [id, field] of [['zoom', 'zoom'], ['position-x', 'x'], ['position-y', 'y']]) {
  $(id).addEventListener('input', () => { const photo = editPhoto(); if (photo) { photo[field] = Number($(id).value) / 100; renderEditor(); render(); } });
}
$('edit-done').onclick = () => $('photo-editor').close();
$('photo-editor').addEventListener('close', () => { pointers.clear(); state.editing = -1; recordHistory(); });
$('edit-reset').onclick = () => { const photo = editPhoto(); if (photo) { Object.assign(photo, { zoom: 1, x: 0, y: 0 }); renderEditor(); render(); } };
$('edit-delete').onclick = () => { const photo = editPhoto(); if (!photo) return; state.photos[state.editing] = null; $('photo-editor').close(); render(); status('写真を削除しました。'); };
$('edit-replace').onclick = () => { const i = state.editing; $('photo-editor').close(); selectFiles(i); };
const pointers = new Map(); let gesture = null;
function startGesture() {
  const photo = editPhoto(); if (!photo || !pointers.size) { gesture = null; return; }
  const points = [...pointers.values()];
  gesture = { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length, distance: points.length > 1 ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0, zoom: photo.zoom, px: photo.x, py: photo.y };
}
$('edit-canvas').addEventListener('pointerdown', event => { if (pointers.size >= 2) return; event.preventDefault(); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); event.currentTarget.setPointerCapture(event.pointerId); startGesture(); });
$('edit-canvas').addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId) || !gesture || !editPhoto()) return;
  event.preventDefault(); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const points = [...pointers.values()], rect = event.currentTarget.getBoundingClientRect(), photo = editPhoto();
  const x = points.reduce((s, p) => s + p.x, 0) / points.length, y = points.reduce((s, p) => s + p.y, 0) / points.length;
  photo.x = clamp(gesture.px + (x - gesture.x) / rect.width, -1, 1); photo.y = clamp(gesture.py + (y - gesture.y) / rect.height, -1, 1);
  if (points.length > 1 && gesture.distance > 0) photo.zoom = clamp(gesture.zoom * Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) / gesture.distance, .25, 4);
  renderEditor(); render();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('edit-canvas').addEventListener(name, event => { pointers.delete(event.pointerId); startGesture(); });

document.querySelectorAll('[data-tool]').forEach(button => { button.onclick = () => showTool(state.tool === button.dataset.tool ? null : button.dataset.tool); });
$('ratio-top').onclick = () => { showTool('ratio'); $('panel-ratio').scrollIntoView({ block: 'nearest' }); };
document.querySelectorAll('[data-ratio]').forEach(button => { button.onclick = () => {
  state.ratio = Number(button.dataset.ratio); $('ratio-label').textContent = button.dataset.label;
  document.querySelectorAll('[data-ratio]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); render(); recordHistory();
}; });
for (const id of ['outer', 'gap', 'rounding']) $(id).addEventListener('input', () => { $(`${id}-value`).value = `${$(id).value} px`; render(); });
function updateSwatches() { document.querySelectorAll('.swatch').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === $('background').value))); }
for (const color of ['#ffffff', '#000000', '#535353', '#fff3e0', '#ffdce8', '#dceaff', '#dff2df', '#e6ddff']) {
  const button = document.createElement('button'); button.className = 'swatch'; button.style.background = color; button.dataset.color = color; button.setAttribute('aria-label', `背景色 ${color}`);
  button.onclick = () => { $('background').value = color; updateSwatches(); render(); recordHistory(); }; $('swatches').append(button);
}
$('background').addEventListener('input', () => { updateSwatches(); render(); });
function openCustom() { $('custom-error').textContent = ''; $('custom-dialog').showModal(); }
$('custom-open').onclick = openCustom; $('create-open').onclick = openCustom;
$('custom-form').addEventListener('submit', event => {
  event.preventDefault(); const rows = Number($('custom-rows').value), cols = Number($('custom-cols').value);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows * cols > MAX_PHOTOS) { $('custom-error').textContent = '縦 × 横が1〜12枚になるように指定してください。'; return; }
  state.count = rows * cols; state.custom = { rows, cols }; state.frame = 'custom';
  countButtons(); frameGallery(); render(); recordHistory(); showTool('frames'); $('custom-dialog').close(); status(`${rows}段 × ${cols}列のフレームを作成しました。`);
});
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });
$('settings').onclick = () => $('settings-dialog').showModal();
async function saveImage() {
  if (state.loading || !state.photos.slice(0, state.count).some(Boolean)) return;
  $('save').disabled = true; $('settings-save').disabled = true;
  const target = document.createElement('canvas'); sizeCanvas(target, Number($('resolution').value)); drawCollage(target, false);
  try {
    const blob = await new Promise(resolve => target.toBlob(resolve, 'image/png')); if (!blob) throw new Error('画像を生成できませんでした。');
    const name = `motto-${new Date().toISOString().slice(0, 10)}.png`, file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.userActivation?.isActive) {
      await navigator.share({ files: [file], title: 'motto コラージュ' }); status('共有メニューから画像を保存できます。');
    } else {
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000); status('PNG画像をダウンロードしました。');
    }
  } catch (error) { if (error.name !== 'AbortError') status('保存できませんでした。もう一度お試しください。'); }
  finally { render(); }
}
$('save').onclick = saveImage; $('settings-save').onclick = () => { $('settings-dialog').close(); saveImage(); };
window.addEventListener('resize', render);
countButtons(); frameGallery(); updateSwatches(); showTool(null); recordHistory();
