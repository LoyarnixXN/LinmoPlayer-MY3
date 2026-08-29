const songs = [];
let currentSong = null;
let isPlaying = false;
let objectUrl = null;
let settingsSection = null;
let pluginDetailsOpen = false;
let libraryCategory = 'all';
let pluginCategory = 'all';
const pluginCategories = [['all', '全部'], ['installed', '已安装'], ['sources', '音源'], ['tools', '工具']];
let pluginCatalog = [];
try { pluginCatalog = JSON.parse(localStorage.getItem('linmo-plugins') || '[]'); } catch { pluginCatalog = []; }
const preferences = { autoplayNext: false, backgroundPlayback: true, playbackMode: 'sequence', volume: 0.8, muted: false };
try { Object.assign(preferences, JSON.parse(localStorage.getItem('linmo-preferences') || '{}')); } catch {}
const playbackModes = ['sequence', 'repeat-all', 'shuffle', 'repeat-one'];
if (!playbackModes.includes(preferences.playbackMode)) preferences.playbackMode = 'sequence';
const audio = new Audio();
audio.preload = 'metadata';
const savedVolume = Number(preferences.volume);
audio.volume = Number.isFinite(savedVolume) ? Math.max(0, Math.min(1, savedVolume)) : 0.8;
audio.muted = Boolean(preferences.muted);
let lastVolume = audio.volume > 0 ? audio.volume : 0.8;
audio.addEventListener('play', () => { isPlaying = true; render(); });
audio.addEventListener('pause', () => { isPlaying = false; render(); });
audio.addEventListener('ended', () => {
  const nextSong = preferences.autoplayNext ? getPlaybackNextSong() : null;
  if (nextSong) playSong(nextSong);
  else { isPlaying = false; audio.currentTime = 0; render(); }
});
audio.addEventListener('timeupdate', updateMiniProgress);
audio.addEventListener('loadedmetadata', updateMiniProgress);

const pageSubtitles = {
  home: '本地音乐',
  library: '音乐库',
  plugins: '插件中心',
  settings: '应用设置',
};
const onboardingSlides = [
  { icon: 'music', eyebrow: '1 / 3', title: '导入本地音乐', body: '请选择设备中的 MP3、M4A 或 WAV 音频文件。', action: '导入音乐' },
  { icon: 'play', eyebrow: '2 / 3', title: '播放与控制', body: '选择任意曲目即可播放，可通过底部播放器进行暂停与继续。', action: '下一步' },
  { icon: 'plugins', eyebrow: '3 / 3', title: '插件扩展', body: '后续可通过插件接入外部音源，当前版本仅支持本地音乐。', action: '开始使用' },
];
let onboardingStep = 0;
const scrollContainer = document.querySelector('.main-content');
const scrollRail = document.querySelector('#scroll-rail');
const scrollThumb = document.querySelector('#scroll-thumb');
let isDraggingScrollThumb = false;
const windowApi = window.linmoDesktop?.window;
const pluginAccounts = [];
let profileCloseTimer = 0;

function savePlugins() { try { localStorage.setItem('linmo-plugins', JSON.stringify(pluginCatalog)); } catch {} }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }
function normalizePluginManifest(input) {
  const manifest = input?.manifest || input;
  const capabilities = Array.isArray(manifest?.capabilities) ? [...new Set(manifest.capabilities)] : [];
  const supportedCapabilities = ['search', 'playback', 'lyrics', 'playlists', 'account', 'recommendations'];
  if (!manifest || typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(manifest.id)) throw new Error('插件 ID 需使用 2—64 位小写字母、数字、点、短横线或下划线。');
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) throw new Error('插件名称不能为空。');
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) throw new Error('插件版本不能为空。');
  if (String(manifest.hostApiVersion).split('.')[0] !== '1') throw new Error('插件需要不兼容的宿主 API 版本。');
  if (capabilities.some((capability) => !supportedCapabilities.includes(capability))) throw new Error('插件声明了未支持的能力。');
  return { id: manifest.id, name: manifest.name.trim(), version: manifest.version.trim(), hostApiVersion: String(manifest.hostApiVersion), capabilities, description: typeof manifest.description === 'string' ? manifest.description.trim() : '未提供插件说明。', category: capabilities.some((capability) => ['search', 'playback', 'lyrics', 'recommendations'].includes(capability)) ? 'sources' : 'tools', installed: true, enabled: false };
}
function importPluginFiles(fileList) {
  [...fileList].forEach((file) => {
    file.text().then((text) => {
      try {
        const plugin = normalizePluginManifest(JSON.parse(text));
        const existing = pluginCatalog.findIndex((item) => item.id === plugin.id);
        if (existing >= 0) pluginCatalog[existing] = { ...pluginCatalog[existing], ...plugin, installed: true };
        else pluginCatalog.push(plugin);
        savePlugins();
        renderProfileMenu();
        renderPlugins();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '插件清单无法读取。');
      }
    }).catch(() => window.alert('插件清单无法读取。'));
  });
}
function togglePlugin(pluginId) { const plugin = pluginCatalog.find((item) => item.id === pluginId); if (!plugin) return; plugin.enabled = !plugin.enabled; savePlugins(); renderProfileMenu(); renderPlugins(); }
function removePlugin(pluginId) { pluginCatalog = pluginCatalog.filter((plugin) => plugin.id !== pluginId); savePlugins(); renderProfileMenu(); renderPlugins(); }

document.addEventListener('selectstart', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && (target.matches('input, textarea, [contenteditable="true"]') || target.closest('input, textarea, [contenteditable="true"]'))) return;
  event.preventDefault();
});

const iconPaths = {
  home: '<path d="m3.5 10 8.5-6.5 8.5 6.5v9.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z"/><path d="M8.5 20.5v-6h7v6"/>',
  library: '<path d="M5 4.5v15"/><path d="M8 5.5a2 2 0 0 1 2-2h8.5v15H10a2 2 0 0 0-2 2"/><path d="M10 18.5h8.5"/>',
  plugins: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.41 1.41-.06-.06A1.7 1.7 0 0 0 16.45 18a1.7 1.7 0 0 0-1 .99V19a1.7 1.7 0 0 0-1.7 1.7v.08h-2v-.08A1.7 1.7 0 0 0 10.05 19a1.7 1.7 0 0 0-1-.99 1.7 1.7 0 0 0-1.88.34l-.06.06L5.7 17l.06-.06A1.7 1.7 0 0 0 6.1 15a1.7 1.7 0 0 0-.99-1H5a1.7 1.7 0 0 0-1.7-1.7v-2H5a1.7 1.7 0 0 0 1.1-1 1.7 1.7 0 0 0-.34-1.88L5.7 7.36l1.41-1.41.06.06A1.7 1.7 0 0 0 9.05 6a1.7 1.7 0 0 0 1-1V5a1.7 1.7 0 0 0 1.7-1.7h.5A1.7 1.7 0 0 0 13.95 5v.08a1.7 1.7 0 0 0 1 1 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.41 1.41-.06.06A1.7 1.7 0 0 0 18 9.03a1.7 1.7 0 0 0 1 .99h.08v2H19a1.7 1.7 0 0 0-1.6 1.1"/>',
  music: '<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="3"/><circle cx="16.5" cy="16" r="3"/>',
  play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 5v14M17 5v14"/>',
  arrowLeft: '<path d="m15 18-6-6 6-6"/><path d="M9 12h10"/>',
  arrowRight: '<path d="m9 6 6 6-6 6"/><path d="M5 12h10"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  previous: '<path d="m16 6-6 6 6 6M8 6v12"/>',
  next: '<path d="m8 6 6 6-6 6M16 6v12"/>',
  volume: '<path d="M4 10v4h3l4 3V7l-4 3Z"/><path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.5 7.5 0 0 1 0 10"/>',
  volumeMute: '<path d="M4 10v4h3l4 3V7l-4 3Z"/><path d="m16 10 4 4M20 10l-4 4"/>',
  shuffle: '<path d="M4 7h3c4 0 6 10 10 10h3M17 5l3 2-3 2M4 17h3c1.3 0 2.3-1.2 3.1-2.7M17 15l3 2-3 2"/>',
  repeat: '<path d="m17 4 3 3-3 3M20 7H8a4 4 0 0 0-4 4v1M7 20l-3-3 3-3M4 17h12a4 4 0 0 0 4-4v-1"/>',
  repeatOne: '<path d="m17 4 3 3-3 3M20 7H8a4 4 0 0 0-4 4v1M7 20l-3-3 3-3M4 17h12a4 4 0 0 0 4-4v-1"/><path d="M12 9v6M10.5 10l1.5-1v6"/>',
  list: '<path d="M5 6h14M5 12h14M5 18h14"/>',
  minimize: '<path d="M5 12h14"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
function icon(name, extra = '') { return `<svg class="ui-icon ${extra}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPaths[name] || iconPaths.music}</svg>`; }
function cover(iconName = 'music', extra = '') { return `<div class="cover ${extra}">${icon(iconName)}</div>`; }
function savePreferences() { try { localStorage.setItem('linmo-preferences', JSON.stringify(preferences)); } catch {} }
function clearLibrary() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  songs.length = 0;
  currentSong = null;
  isPlaying = false;
  settingsSection = null;
  render();
}
function resetOnboarding() {
  try { localStorage.removeItem('linmo-onboarding-complete'); } catch {}
  onboardingStep = 0;
  renderOnboarding();
}
function updateScrollIndicator() {
  if (!scrollContainer || !scrollRail || !scrollThumb) return;
  const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
  if (maxScroll <= 2) {
    scrollRail.hidden = true;
    return;
  }
  scrollRail.hidden = false;
  const railStyle = getComputedStyle(scrollRail);
  const innerHeight = scrollRail.clientHeight - parseFloat(railStyle.paddingTop) - parseFloat(railStyle.paddingBottom);
  const trackHeight = Math.max(0, innerHeight);
  const thumbHeight = Math.max(28, Math.min(44, trackHeight * scrollContainer.clientHeight / scrollContainer.scrollHeight));
  const maxThumbOffset = Math.max(0, trackHeight - thumbHeight);
  const thumbOffset = maxScroll ? (scrollContainer.scrollTop / maxScroll) * maxThumbOffset : 0;
  scrollThumb.style.height = `${thumbHeight}px`;
  scrollThumb.style.transform = `translateY(${thumbOffset}px)`;
  scrollRail.setAttribute('aria-valuenow', String(Math.round(scrollContainer.scrollTop)));
  scrollRail.setAttribute('aria-valuemax', String(Math.max(0, Math.round(maxScroll))));
}
function scrollFromPointer(clientY) {
  if (!scrollContainer || !scrollRail || !scrollThumb) return;
  const rect = scrollRail.getBoundingClientRect();
  const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
  const railStyle = getComputedStyle(scrollRail);
  const innerHeight = scrollRail.clientHeight - parseFloat(railStyle.paddingTop) - parseFloat(railStyle.paddingBottom);
  const maxThumbOffset = Math.max(0, innerHeight - scrollThumb.offsetHeight);
  if (maxScroll <= 0 || maxThumbOffset <= 0) return;
  const borderTop = parseFloat(railStyle.borderTopWidth);
  const offset = Math.max(0, Math.min(maxThumbOffset, clientY - rect.top - borderTop - parseFloat(railStyle.paddingTop) - scrollThumb.offsetHeight / 2));
  scrollContainer.scrollTop = (offset / maxThumbOffset) * maxScroll;
}
function importFiles() { document.querySelector('#audio-files').click(); }
function onboardingCompleted() { try { return localStorage.getItem('linmo-onboarding-complete') === '1'; } catch { return false; } }
function finishOnboarding() {
  try { localStorage.setItem('linmo-onboarding-complete', '1'); } catch {}
  const root = document.querySelector('#onboarding');
  root.classList.add('is-leaving');
  root.querySelector('.onboarding-card')?.classList.add('is-leaving');
  window.setTimeout(() => { root.hidden = true; root.classList.remove('is-leaving'); }, 240);
}
function profileAvatar() {
  const account = pluginAccounts[0];
  return account?.avatarUrl ? `<img src="${account.avatarUrl}" alt="" />` : '?';
}
function renderProfileMenu() {
  const trigger = document.querySelector('#profile-trigger');
  const menu = document.querySelector('#profile-menu');
  if (!trigger || !menu) return;
  const enabledPluginCount = pluginCatalog.filter((plugin) => plugin.enabled).length;
  trigger.innerHTML = profileAvatar();
  menu.innerHTML = `<div class="profile-menu-header"><div class="eyebrow">ACCOUNT</div><strong>${pluginAccounts.length ? '插件账户' : '未登录'}</strong><small>${pluginAccounts.length ? '由已连接的插件提供' : '本地模式'}</small></div><div class="profile-menu-divider"></div><div class="profile-menu-row"><span>账户状态</span><span>${pluginAccounts.length ? '已连接' : '未登录'}</span></div><div class="profile-menu-row"><span>已启用插件</span><span>${enabledPluginCount} 个</span></div><div class="profile-menu-note">启用插件后，插件提供的账户信息和头像将显示在这里。</div>`;
}
function setProfileMenuOpen(open) {
  const menu = document.querySelector('#profile-menu');
  const trigger = document.querySelector('#profile-trigger');
  if (!menu || !trigger) return;
  window.clearTimeout(profileCloseTimer);
  if (open) {
    menu.hidden = false;
    menu.classList.remove('is-closing', 'is-opening');
    void menu.offsetWidth;
    menu.classList.add('is-opening');
    trigger.setAttribute('aria-expanded', 'true');
    return;
  }
  if (menu.hidden || menu.classList.contains('is-closing')) return;
  menu.classList.remove('is-opening');
  menu.classList.add('is-closing');
  trigger.setAttribute('aria-expanded', 'false');
  profileCloseTimer = window.setTimeout(() => {
    menu.hidden = true;
    menu.classList.remove('is-closing');
  }, 180);
}
function renderOnboarding() {
  const root = document.querySelector('#onboarding');
  if (onboardingCompleted()) return;
  const slide = onboardingSlides[onboardingStep];
  root.hidden = false;
  root.innerHTML = `<div class="onboarding-card"><div class="onboarding-icon">${icon(slide.icon)}</div><div class="eyebrow">${slide.eyebrow}</div><h2>${slide.title}</h2><p>${slide.body}</p><div class="onboarding-dots">${onboardingSlides.map((_, index) => `<span class="onboarding-dot ${index === onboardingStep ? 'active' : ''}"></span>`).join('')}</div><div class="onboarding-actions"><button class="primary-button" id="onboarding-primary">${slide.action} ${icon(onboardingStep === 2 ? 'check' : 'arrowRight', 'button-icon')}</button>${onboardingStep < 2 ? '<button class="skip-button" id="onboarding-skip">跳过引导</button>' : ''}</div></div>`;
  document.querySelector('#onboarding-primary').addEventListener('click', () => { if (onboardingStep === 0) importFiles(); if (onboardingStep === onboardingSlides.length - 1) finishOnboarding(); else { onboardingStep += 1; renderOnboarding(); } });
  document.querySelector('#onboarding-skip')?.addEventListener('click', finishOnboarding);
}
function addFiles(fileList) {
  [...fileList].forEach((file) => {
    songs.push({ title: file.name.replace(/\.[^/.]+$/, ''), artist: '本地文件', album: '', glyph: 'music', file });
  });
  if (!currentSong && songs[0]) playSong(songs[0]);
  else render();
}
function playSong(song) {
  if (!song) return;
  if (currentSong !== song) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(song.file);
    audio.src = objectUrl;
    audio.currentTime = 0;
    currentSong = song;
  } else if (audio.ended) audio.currentTime = 0;
  audio.play().catch(() => { isPlaying = false; render(); });
  render();
}
function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
function updateMiniProgress() {
  const progress = document.querySelector('#mini-progress');
  const current = document.querySelector('#mini-current-time');
  const duration = document.querySelector('#mini-duration');
  const previous = document.querySelector('[data-player-action="previous"]');
  const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0;
  if (progress) progress.value = String(hasDuration ? Math.max(0, Math.min(100, audio.currentTime / audio.duration * 100)) : 0);
  if (current) current.textContent = formatTime(audio.currentTime);
  if (duration) duration.textContent = formatTime(audio.duration);
  if (previous && currentSong) {
    previous.disabled = !(audio.currentTime > 3 || songs.indexOf(currentSong) > 0);
    previous.setAttribute('aria-label', audio.currentTime > 3 ? '重新播放当前歌曲' : '上一首');
  }
}
function playAdjacent(direction) {
  const index = currentSong ? songs.indexOf(currentSong) : -1;
  if (!songs.length) return;
  if (preferences.playbackMode === 'shuffle') {
    const candidates = songs.filter((song) => song !== currentSong);
    const target = candidates[Math.floor(Math.random() * candidates.length)] || songs[0];
    playSong(target);
    return;
  }
  let targetIndex = index >= 0 ? index + direction : 0;
  if (preferences.playbackMode === 'repeat-all') targetIndex = (targetIndex + songs.length) % songs.length;
  const target = songs[targetIndex];
  if (target) playSong(target);
}
function getPlaybackNextSong() {
  if (!currentSong || !songs.length) return null;
  const index = songs.indexOf(currentSong);
  if (preferences.playbackMode === 'repeat-one') return currentSong;
  if (preferences.playbackMode === 'shuffle') {
    const candidates = songs.filter((song) => song !== currentSong);
    return candidates[Math.floor(Math.random() * candidates.length)] || currentSong;
  }
  if (preferences.playbackMode === 'repeat-all') return songs[(index + 1) % songs.length];
  return songs[index + 1] || null;
}
function getPlaybackModeLabel() {
  return { sequence: '顺序播放', 'repeat-all': '列表循环', shuffle: '随机播放', 'repeat-one': '单曲循环' }[preferences.playbackMode];
}
function getPlaybackModeIcon() {
  return { sequence: 'list', 'repeat-all': 'repeat', shuffle: 'shuffle', 'repeat-one': 'repeatOne' }[preferences.playbackMode];
}
function cyclePlaybackMode() {
  const currentIndex = playbackModes.indexOf(preferences.playbackMode);
  preferences.playbackMode = playbackModes[(currentIndex + 1) % playbackModes.length];
  savePreferences();
  renderMiniPlayer();
  if (settingsSection === 'playback') renderSettings();
}
function playPrevious() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    updateMiniProgress();
    return;
  }
  playAdjacent(-1);
}
function seekAudio(value) {
  if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, Number(value) / 100 * audio.duration));
}
function togglePlaying() {
  if (!currentSong) return importFiles();
  if (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.05) audio.currentTime = 0;
  if (audio.paused) audio.play().catch(() => undefined);
  else audio.pause();
}
function setVolume(value) {
  const nextVolume = Math.max(0, Math.min(1, Number(value)));
  audio.volume = nextVolume;
  audio.muted = false;
  if (nextVolume > 0) lastVolume = nextVolume;
  preferences.volume = nextVolume;
  preferences.muted = false;
  savePreferences();
  updateVolumeControl();
}
function toggleMute() {
  if (audio.muted || audio.volume === 0) {
    audio.muted = false;
    audio.volume = lastVolume;
    preferences.volume = audio.volume;
    preferences.muted = false;
  } else {
    preferences.volume = audio.volume;
    audio.muted = true;
    preferences.muted = true;
  }
  savePreferences();
  updateVolumeControl();
}
function updateVolumeControl() {
  const button = document.querySelector('[data-player-action="mute"]');
  const slider = document.querySelector('.volume-slider');
  const muted = audio.muted || audio.volume === 0;
  if (button) {
    button.setAttribute('aria-label', muted ? '取消静音' : '静音');
    button.setAttribute('aria-pressed', String(muted));
    button.innerHTML = icon(muted ? 'volumeMute' : 'volume');
  }
  if (slider) slider.value = String(muted ? 0 : audio.volume);
}
function renderHome() {
  const home = document.querySelector('#page-home');
  if (!songs.length) {
    home.innerHTML = `<div class="hero"><div class="eyebrow">本地音乐</div><h2>开始使用 Linmo Player</h2><p>导入本地音频文件后，即可在此管理和播放。</p><button class="primary-button" id="hero-import">导入本地音乐</button><div class="orb"></div></div><div class="empty compact">${cover('music', 'empty-icon')}<h2>暂无音乐</h2><p>当前尚未导入音频文件。</p><button class="outline-button" id="empty-import">导入本地音乐</button></div>`;
    document.querySelector('#hero-import').addEventListener('click', importFiles);
    document.querySelector('#empty-import').addEventListener('click', importFiles);
    return;
  }
  home.innerHTML = `<div class="hero"><div class="eyebrow">本地音乐</div><h2>本地音乐播放</h2><p>当前内容为已导入的本地音频文件。</p><button class="primary-button" id="hero-play">${isPlaying ? '暂停' : '播放'} ${icon(isPlaying ? 'pause' : 'play', 'button-icon')}</button><div class="orb"></div></div><div class="section-heading"><h3>本地音乐</h3><button class="text-button" id="more-import">继续导入</button></div><div class="song-list">${songs.map((song, index) => `<div class="song-row" data-song-index="${index}">${cover(song.glyph, 'small')}<div class="song-copy"><div class="song-title">${song.title}</div><div class="song-artist">${song.artist}${song.album ? ` · ${song.album}` : ''}</div></div><span class="muted">${icon(currentSong === song ? 'music' : 'more', 'row-icon')}</span></div>`).join('')}</div>`;
  document.querySelector('#hero-play').addEventListener('click', togglePlaying);
  document.querySelector('#more-import').addEventListener('click', importFiles);
  document.querySelectorAll('[data-song-index]').forEach((row) => row.addEventListener('click', () => playSong(songs[Number(row.dataset.songIndex)])));
}
function renderLibrary() {
  const library = document.querySelector('#page-library');
  const categories = [['all', '全部'], ['songs', '歌曲'], ['albums', '专辑'], ['artists', '歌手']];
  const filterMarkup = categories.map(([id, label]) => `<button type="button" class="library-filter ${libraryCategory === id ? 'active' : ''}" data-library-category="${id}">${label}</button>`).join('');
  const albumCount = new Set(songs.map((song) => song.album).filter(Boolean)).size;
  const artistCount = new Set(songs.map((song) => song.artist).filter((artist) => artist && artist !== '本地文件')).size;
  const extensions = [...new Set(songs.map((song) => song.file?.name?.split('.').pop()?.toUpperCase()).filter(Boolean))];
  const statsMarkup = [['曲目', songs.length, '已导入音频'], ['专辑', albumCount, albumCount ? '已识别' : '等待元数据'], ['歌手', artistCount, artistCount ? '已识别' : '等待元数据'], ['格式', extensions.length ? extensions.join(' / ') : '—', '文件格式']].map(([label, value, caption]) => `<div class="library-stat"><span>${label}</span><strong>${value}</strong><small>${caption}</small></div>`).join('');
  let content = `<div class="library-empty-state"><div class="empty-icon">${icon('music')}</div><div><h2>暂无音乐</h2><p>当前音乐库为空，导入本地音频文件后将在此显示。</p><div class="library-empty-meta"><span>支持格式</span><strong>MP3 · M4A · WAV</strong></div></div><button class="outline-button" id="library-empty-import">导入本地音乐</button></div>`;
  if (songs.length) {
    if (libraryCategory === 'albums' || libraryCategory === 'artists') {
      const groups = new Map();
      songs.forEach((song) => {
        const label = libraryCategory === 'albums' ? (song.album || '未知专辑') : (song.artist || '未知歌手');
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(song);
      });
      content = [...groups.entries()].map(([label, group]) => `<section class="library-group"><div class="library-group-heading"><h3>${label}</h3><span>${group.length} 首</span></div><div class="song-list">${group.map((song) => { const index = songs.indexOf(song); return `<div class="song-row" data-library-song-index="${index}">${cover(song.glyph, 'small')}<div class="song-copy"><div class="song-title">${song.title}</div><div class="song-artist">${song.artist}${song.album ? ` · ${song.album}` : ''}</div></div></div>`; }).join('')}</div></section>`).join('');
    } else {
      content = `<div class="song-list">${songs.map((song, index) => `<div class="song-row" data-library-song-index="${index}">${cover(song.glyph, 'small')}<div class="song-copy"><div class="song-title">${song.title}</div><div class="song-artist">${song.artist}${song.album ? ` · ${song.album}` : ''}</div></div></div>`).join('')}</div>`;
    }
  }
  library.innerHTML = `<div class="section-heading library-actions"><span class="muted">本地会话</span><button class="text-button" id="library-import">导入本地音乐</button></div><div class="library-stats">${statsMarkup}</div><div class="library-filters">${filterMarkup}</div>${content}`;
  document.querySelector('#library-import').addEventListener('click', importFiles);
  document.querySelector('#library-empty-import')?.addEventListener('click', importFiles);
  document.querySelectorAll('[data-library-category]').forEach((button) => button.addEventListener('click', () => { libraryCategory = button.dataset.libraryCategory; renderLibrary(); }));
  document.querySelectorAll('[data-library-song-index]').forEach((row) => row.addEventListener('click', () => playSong(songs[Number(row.dataset.librarySongIndex)])));
}
function renderPlugins() {
  const root = document.querySelector('#page-plugins');
  if (pluginDetailsOpen) {
    root.innerHTML = `<div class="settings-detail"><button class="text-button settings-back" id="plugin-back">${icon('arrowLeft', 'back-icon')}返回插件中心</button><div class="eyebrow">PLUGIN API</div><h2>插件说明</h2><p class="settings-description">插件通过统一契约接入搜索、播放、歌词、歌单和账户等能力，并由宿主统一管理。</p><div class="settings-note">导入插件清单后，可在插件中心查看版本、能力范围并控制启用状态。插件只能调用清单中声明的宿主能力。</div></div>`;
    document.querySelector('#plugin-back').addEventListener('click', () => { pluginDetailsOpen = false; renderPlugins(); });
    return;
  }
  const filterMarkup = pluginCategories.map(([id, label]) => `<button type="button" class="library-filter ${pluginCategory === id ? 'active' : ''}" data-plugin-category="${id}">${label}</button>`).join('');
  const filteredPlugins = pluginCatalog.filter((plugin) => pluginCategory === 'all' || plugin.category === pluginCategory || (pluginCategory === 'installed' && plugin.installed));
  const content = filteredPlugins.length ? `<div class="plugin-grid">${filteredPlugins.map((plugin) => `<article class="plugin-card">${cover('plugins', 'small')}<div class="plugin-copy"><strong>${escapeHtml(plugin.name)}</strong><p>${escapeHtml(plugin.description)}</p><small>v${escapeHtml(plugin.version)} · ${plugin.enabled ? '已启用' : '已停用'}</small><div class="plugin-capabilities">${plugin.capabilities.map((capability) => `<span>${escapeHtml(capability)}</span>`).join('')}</div></div><div class="plugin-card-actions"><button class="plugin-toggle ${plugin.enabled ? 'active' : ''}" type="button" data-plugin-toggle="${escapeHtml(plugin.id)}">${plugin.enabled ? '停用' : '启用'}</button><button class="text-button plugin-remove" type="button" data-plugin-remove="${escapeHtml(plugin.id)}">卸载</button></div></article>`).join('')}</div>` : `<div class="empty compact plugin-empty">${cover('plugins', 'empty-icon')}<h2>${pluginCategory === 'all' ? '暂无已导入插件' : '此分类暂无插件'}</h2><p>${pluginCategory === 'all' ? '导入插件清单后，可在此管理插件版本、能力与启用状态。' : '当前没有符合此分类的插件。'}</p><button class="outline-button" id="plugin-import-empty">导入插件</button><button class="text-button" id="plugin-docs">查看插件说明</button></div>`;
  root.innerHTML = `<div class="section-heading library-actions"><span class="muted">${pluginCatalog.length} 个插件</span><div class="plugin-actions"><button class="text-button" id="plugin-import">导入插件</button><button class="text-button" id="plugin-docs-top">插件说明</button></div></div><div class="library-filters">${filterMarkup}</div>${content}`;
  document.querySelector('#plugin-import')?.addEventListener('click', () => document.querySelector('#plugin-files').click());
  document.querySelector('#plugin-import-empty')?.addEventListener('click', () => document.querySelector('#plugin-files').click());
  document.querySelector('#plugin-docs-top')?.addEventListener('click', () => { pluginDetailsOpen = true; renderPlugins(); });
  document.querySelector('#plugin-docs')?.addEventListener('click', () => { pluginDetailsOpen = true; renderPlugins(); });
  document.querySelectorAll('[data-plugin-toggle]').forEach((button) => button.addEventListener('click', () => togglePlugin(button.dataset.pluginToggle)));
  document.querySelectorAll('[data-plugin-remove]').forEach((button) => button.addEventListener('click', () => removePlugin(button.dataset.pluginRemove)));
  document.querySelectorAll('[data-plugin-category]').forEach((button) => button.addEventListener('click', () => { pluginCategory = button.dataset.pluginCategory; renderPlugins(); }));
}
function renderSettings() {
  const root = document.querySelector('#page-settings');
  if (!settingsSection) {
    const settings = [['playback', '播放设置', '音质和播放方式'], ['library', '本地音乐', '导入文件与音乐库'], ['privacy', '隐私与安全', '本地数据和插件权限']];
    root.innerHTML = `<div class="settings">${settings.map(([id, title, body]) => `<button type="button" class="setting" data-setting="${id}"><span><strong>${title}</strong><p>${body}</p></span><span class="chevron">›</span></button>`).join('')}</div>`;
    root.querySelectorAll('[data-setting]').forEach((button) => button.addEventListener('click', () => { settingsSection = button.dataset.setting; renderSettings(); }));
    return;
  }
  const detail = {
    playback: { eyebrow: 'PLAYBACK', title: '播放设置', description: '配置播放器的默认行为。', body: `<div class="settings-option"><span><strong>自动播放下一首</strong><p>当前曲目结束后自动播放下一首。</p></span><button class="settings-toggle ${preferences.autoplayNext ? 'active' : ''}" data-preference="autoplayNext" aria-label="自动播放下一首" aria-pressed="${preferences.autoplayNext}"></button></div><div class="settings-option"><span><strong>播放方式</strong><p>当前模式：${getPlaybackModeLabel()}</p></span><select class="settings-select" id="playback-mode" aria-label="播放方式"><option value="sequence" ${preferences.playbackMode === 'sequence' ? 'selected' : ''}>顺序播放</option><option value="repeat-all" ${preferences.playbackMode === 'repeat-all' ? 'selected' : ''}>列表循环</option><option value="shuffle" ${preferences.playbackMode === 'shuffle' ? 'selected' : ''}>随机播放</option><option value="repeat-one" ${preferences.playbackMode === 'repeat-one' ? 'selected' : ''}>单曲循环</option></select></div><div class="settings-option"><span><strong>后台播放</strong><p>切换到其他窗口时继续播放音频。</p></span><button class="settings-toggle ${preferences.backgroundPlayback ? 'active' : ''}" data-preference="backgroundPlayback" aria-label="后台播放" aria-pressed="${preferences.backgroundPlayback}"></button></div>` },
    library: { eyebrow: 'LOCAL MUSIC', title: '本地音乐', description: '管理当前会话中导入的音频文件。', body: `<div class="settings-option"><span><strong>当前音乐数量</strong><p>${songs.length} 首本地音乐</p></span></div><div class="settings-note">导入的文件仅在当前运行期间可用，关闭应用后不会自动保留。</div><button type="button" class="outline-button settings-action" id="clear-library">清空当前歌库</button>` },
    privacy: { eyebrow: 'PRIVACY', title: '隐私与安全', description: 'Linmo Player 的代码、插件契约与数据处理边界公开可审查。', body: `<div class="settings-note">本项目采用开源架构，音乐文件、插件配置与播放器偏好均由本地应用管理。你可以自行审查源代码、插件清单和权限声明。</div><div class="settings-option"><span><strong>新手引导</strong><p>重新查看首次使用说明。</p></span><button type="button" class="outline-button settings-action" id="reset-onboarding">重新查看</button></div>` },
  }[settingsSection];
  root.innerHTML = `<div class="settings-detail"><button class="text-button settings-back" id="settings-back">${icon('arrowLeft', 'back-icon')}返回应用设置</button><div class="eyebrow">${detail.eyebrow}</div><h2>${detail.title}</h2><p class="settings-description">${detail.description}</p>${detail.body}</div>`;
  document.querySelector('#settings-back').addEventListener('click', () => { settingsSection = null; renderSettings(); });
  root.querySelectorAll('[data-preference]').forEach((button) => button.addEventListener('click', () => { const key = button.dataset.preference; preferences[key] = !preferences[key]; savePreferences(); button.classList.toggle('active', preferences[key]); button.setAttribute('aria-pressed', String(preferences[key])); }));
  document.querySelector('#playback-mode')?.addEventListener('change', (event) => { preferences.playbackMode = event.target.value; savePreferences(); renderMiniPlayer(); renderSettings(); });
  document.querySelector('#clear-library')?.addEventListener('click', clearLibrary);
  document.querySelector('#reset-onboarding')?.addEventListener('click', resetOnboarding);
}
function renderMiniPlayer() {
  const mini = document.querySelector('#mini-player');
  const songMarkup = currentSong ? `${cover(currentSong.glyph, 'small')}<div class="mini-copy"><strong>${currentSong.title}</strong><small>${currentSong.artist}${currentSong.album ? ` · ${currentSong.album}` : ''}</small></div>` : `${cover('music', 'small mini-placeholder')}<div class="mini-copy"><strong>未选择歌曲</strong><small>导入音乐后可开始播放</small></div>`;
  const songIndex = currentSong ? songs.indexOf(currentSong) : -1;
  const previousEnabled = Boolean(currentSong && (audio.currentTime > 3 || songIndex > 0));
  const nextEnabled = Boolean(currentSong && songIndex >= 0 && songIndex < songs.length - 1);
  const muted = audio.muted || audio.volume === 0;
  mini.innerHTML = `<div class="mini-now-playing">${songMarkup}</div><div class="mini-center-controls"><div class="mini-buttons"><button class="player-control mode-control ${preferences.playbackMode !== 'sequence' ? 'active' : ''}" data-player-action="mode" aria-label="播放方式：${getPlaybackModeLabel()}" title="播放方式：${getPlaybackModeLabel()}">${icon(getPlaybackModeIcon())}</button><button class="player-control" data-player-action="previous" aria-label="${audio.currentTime > 3 ? '重新播放当前歌曲' : '上一首'}" ${previousEnabled ? '' : 'disabled'}>${icon('previous')}</button><button class="play-button" id="mini-play" aria-label="${isPlaying ? '暂停' : '播放'}" ${currentSong ? '' : 'disabled'}>${icon(isPlaying ? 'pause' : 'play', 'player-icon')}</button><button class="player-control" data-player-action="next" aria-label="下一首" ${nextEnabled ? '' : 'disabled'}>${icon('next')}</button></div><div class="mini-progress-row"><span id="mini-current-time">${formatTime(audio.currentTime)}</span><input id="mini-progress" class="mini-progress" type="range" min="0" max="100" step="0.1" value="0" aria-label="播放进度" ${currentSong ? '' : 'disabled'} /><span id="mini-duration">${formatTime(audio.duration)}</span></div></div><div class="mini-volume"><button class="player-control volume-button" data-player-action="mute" aria-label="${muted ? '取消静音' : '静音'}" aria-pressed="${muted}">${icon(muted ? 'volumeMute' : 'volume')}</button><input class="volume-slider" type="range" min="0" max="1" step="0.01" value="${muted ? 0 : audio.volume}" aria-label="音量" /></div>`;
  document.querySelector('#mini-play')?.addEventListener('click', togglePlaying);
  document.querySelector('[data-player-action="mode"]')?.addEventListener('click', cyclePlaybackMode);
  document.querySelector('[data-player-action="previous"]')?.addEventListener('click', playPrevious);
  document.querySelector('[data-player-action="next"]')?.addEventListener('click', () => playAdjacent(1));
  document.querySelector('[data-player-action="mute"]')?.addEventListener('click', toggleMute);
  document.querySelector('#mini-progress')?.addEventListener('input', (event) => seekAudio(event.target.value));
  document.querySelector('.volume-slider')?.addEventListener('input', (event) => setVolume(event.target.value));
  updateMiniProgress();
}
function render() { renderHome(); renderLibrary(); renderPlugins(); renderSettings(); renderMiniPlayer(); requestAnimationFrame(updateScrollIndicator); }
document.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon || 'music'); });
document.querySelector('#audio-files').addEventListener('change', (event) => { if (event.target.files?.length) addFiles(event.target.files); event.target.value = ''; });
document.querySelector('#plugin-files')?.addEventListener('change', (event) => { if (event.target.files?.length) importPluginFiles(event.target.files); event.target.value = ''; });
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => { const page = button.dataset.page; document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button)); document.querySelectorAll('.page').forEach((item) => item.classList.toggle('active', item.id === `page-${page}`)); document.querySelector('#page-subtitle').textContent = pageSubtitles[page]; requestAnimationFrame(updateScrollIndicator); }));
document.querySelector('#window-minimize')?.addEventListener('click', () => windowApi?.minimize());
document.querySelector('#window-maximize')?.addEventListener('click', () => windowApi?.toggleMaximize());
document.querySelector('#window-close')?.addEventListener('click', () => windowApi?.close());
renderProfileMenu();
document.querySelector('#profile-trigger')?.addEventListener('click', (event) => { event.stopPropagation(); const menu = document.querySelector('#profile-menu'); const isOpen = Boolean(menu && !menu.hidden && !menu.classList.contains('is-closing')); setProfileMenuOpen(!isOpen); });
document.addEventListener('click', (event) => { const wrap = document.querySelector('.profile-wrap'); if (wrap && !wrap.contains(event.target)) setProfileMenuOpen(false); });
document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]')) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlaying(); }
  if (event.key === 'ArrowLeft' && currentSong) { event.preventDefault(); seekAudio((audio.currentTime - 5) / Math.max(audio.duration, 1) * 100); }
  if (event.key === 'ArrowRight' && currentSong) { event.preventDefault(); seekAudio((audio.currentTime + 5) / Math.max(audio.duration, 1) * 100); }
  if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleMute(); }
});
scrollContainer?.addEventListener('scroll', updateScrollIndicator, { passive: true });
window.addEventListener('resize', updateScrollIndicator);
window.addEventListener('blur', () => { if (!preferences.backgroundPlayback && isPlaying) audio.pause(); });
scrollRail?.addEventListener('pointerdown', (event) => {
  if (event.target !== scrollThumb) scrollFromPointer(event.clientY);
});
scrollThumb?.addEventListener('pointerdown', (event) => {
  isDraggingScrollThumb = true;
  scrollThumb.setPointerCapture(event.pointerId);
  event.preventDefault();
});
scrollThumb?.addEventListener('pointermove', (event) => {
  if (isDraggingScrollThumb) scrollFromPointer(event.clientY);
});
scrollThumb?.addEventListener('pointerup', () => { isDraggingScrollThumb = false; });
render();
renderOnboarding();
