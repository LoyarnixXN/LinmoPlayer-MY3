const songs = [];
let currentSong = null;
let isPlaying = false;
let objectUrl = null;
let settingsSection = null;
let pluginDetailsOpen = false;
const preferences = { autoplayNext: false, backgroundPlayback: true };
try { Object.assign(preferences, JSON.parse(localStorage.getItem('linmo-preferences') || '{}')); } catch {}
const audio = new Audio();
audio.preload = 'metadata';
audio.addEventListener('play', () => { isPlaying = true; render(); });
audio.addEventListener('pause', () => { isPlaying = false; render(); });
audio.addEventListener('ended', () => {
  const currentIndex = currentSong ? songs.indexOf(currentSong) : -1;
  const nextSong = preferences.autoplayNext && currentIndex >= 0 ? songs[currentIndex + 1] : null;
  if (nextSong) playSong(nextSong);
  else { isPlaying = false; render(); }
});

const pageSubtitles = {
  home: '本地音乐',
  library: '音乐库',
  plugins: '插件中心',
  settings: '应用设置',
};
const onboardingSlides = [
  { icon: '♫', eyebrow: '1 / 3', title: '导入本地音乐', body: '请选择设备中的 MP3、M4A 或 WAV 音频文件。', action: '导入音乐' },
  { icon: '▶', eyebrow: '2 / 3', title: '播放与控制', body: '选择任意曲目即可播放，可通过底部播放器进行暂停与继续。', action: '下一步' },
  { icon: '◈', eyebrow: '3 / 3', title: '插件扩展', body: '后续可通过插件接入外部音源，当前版本仅支持本地音乐。', action: '开始使用' },
];
let onboardingStep = 0;
const scrollContainer = document.querySelector('.main-content');
const scrollRail = document.querySelector('#scroll-rail');
const scrollThumb = document.querySelector('#scroll-thumb');
let isDraggingScrollThumb = false;
const windowApi = window.linmoDesktop?.window;
const pluginAccounts = [];

function cover(glyph, extra = '') { return `<div class="cover ${extra}">${glyph}</div>`; }
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
  const trackHeight = scrollRail.clientHeight;
  const thumbHeight = Math.max(28, Math.min(44, trackHeight * scrollContainer.clientHeight / scrollContainer.scrollHeight));
  const maxThumbOffset = trackHeight - thumbHeight;
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
  const maxThumbOffset = rect.height - scrollThumb.offsetHeight;
  if (maxScroll <= 0 || maxThumbOffset <= 0) return;
  const offset = Math.max(0, Math.min(maxThumbOffset, clientY - rect.top - scrollThumb.offsetHeight / 2));
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
  trigger.innerHTML = profileAvatar();
  menu.innerHTML = `<div class="profile-menu-header"><div class="eyebrow">ACCOUNT</div><strong>${pluginAccounts.length ? '插件账户' : '未登录'}</strong><small>${pluginAccounts.length ? '由已连接的插件提供' : '本地模式'}</small></div><div class="profile-menu-divider"></div><div class="profile-menu-row"><span>账户状态</span><span>${pluginAccounts.length ? '已连接' : '未登录'}</span></div><div class="profile-menu-row"><span>已连接插件</span><span>${pluginAccounts.length} 个</span></div><div class="profile-menu-note">安装并连接插件后，插件提供的头像会显示在这里。</div>`;
}
function renderOnboarding() {
  const root = document.querySelector('#onboarding');
  if (onboardingCompleted()) return;
  const slide = onboardingSlides[onboardingStep];
  root.hidden = false;
  root.innerHTML = `<div class="onboarding-card"><div class="onboarding-icon">${slide.icon}</div><div class="eyebrow">${slide.eyebrow}</div><h2>${slide.title}</h2><p>${slide.body}</p><div class="onboarding-dots">${onboardingSlides.map((_, index) => `<span class="onboarding-dot ${index === onboardingStep ? 'active' : ''}"></span>`).join('')}</div><div class="onboarding-actions"><button class="primary-button" id="onboarding-primary">${slide.action} ${onboardingStep === 2 ? '✓' : '→'}</button>${onboardingStep < 2 ? '<button class="skip-button" id="onboarding-skip">跳过引导</button>' : ''}</div></div>`;
  document.querySelector('#onboarding-primary').addEventListener('click', () => { if (onboardingStep === 0) importFiles(); if (onboardingStep === onboardingSlides.length - 1) finishOnboarding(); else { onboardingStep += 1; renderOnboarding(); } });
  document.querySelector('#onboarding-skip')?.addEventListener('click', finishOnboarding);
}
function addFiles(fileList) {
  [...fileList].forEach((file) => {
    songs.push({ title: file.name.replace(/\.[^/.]+$/, ''), artist: '本地文件', album: '', glyph: '♫', file });
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
    currentSong = song;
  }
  audio.play().catch(() => { isPlaying = false; render(); });
  render();
}
function togglePlaying() {
  if (!currentSong) return importFiles();
  if (audio.paused) audio.play().catch(() => undefined);
  else audio.pause();
}
function renderHome() {
  const home = document.querySelector('#page-home');
  if (!songs.length) {
    home.innerHTML = `<div class="hero"><div class="eyebrow">本地音乐</div><h2>开始使用 Linmo Player</h2><p>导入本地音频文件后，即可在此管理和播放。</p><button class="primary-button" id="hero-import">导入本地音乐</button><div class="orb"></div></div><div class="empty compact">${cover('♫', 'empty-icon')}<h2>暂无音乐</h2><p>当前尚未导入音频文件。</p><button class="outline-button" id="empty-import">导入本地音乐</button></div>`;
    document.querySelector('#hero-import').addEventListener('click', importFiles);
    document.querySelector('#empty-import').addEventListener('click', importFiles);
    return;
  }
  home.innerHTML = `<div class="hero"><div class="eyebrow">本地音乐</div><h2>本地音乐播放</h2><p>当前内容为已导入的本地音频文件。</p><button class="primary-button" id="hero-play">${isPlaying ? '暂停 Ⅱ' : '播放 ▶'}</button><div class="orb"></div></div><div class="section-heading"><h3>本地音乐</h3><button class="text-button" id="more-import">继续导入</button></div><div class="song-list">${songs.map((song, index) => `<div class="song-row" data-song-index="${index}">${cover(song.glyph, 'small')}<div class="song-copy"><div class="song-title">${song.title}</div><div class="song-artist">${song.artist}${song.album ? ` · ${song.album}` : ''}</div></div><span class="muted">${currentSong === song ? '♫' : '•••'}</span></div>`).join('')}</div>`;
  document.querySelector('#hero-play').addEventListener('click', togglePlaying);
  document.querySelector('#more-import').addEventListener('click', importFiles);
  document.querySelectorAll('[data-song-index]').forEach((row) => row.addEventListener('click', () => playSong(songs[Number(row.dataset.songIndex)])));
}
function renderLibrary() {
  const library = document.querySelector('#page-library');
  library.innerHTML = `<div class="section-heading"><h2 class="library-title">音乐库</h2><button class="text-button" id="library-import">导入本地音乐</button></div><div class="chip-row"><span class="chip selected">本地文件</span></div>${songs.length ? `<div class="song-list">${songs.map((song, index) => `<div class="song-row" data-library-song-index="${index}">${cover(song.glyph, 'small')}<div class="song-copy"><div class="song-title">${song.title}</div><div class="song-artist">${song.artist}</div></div></div>`).join('')}</div>` : `<div class="empty compact">${cover('♫', 'empty-icon')}<h2>暂无音乐</h2><p>导入本地音频文件后，内容将显示在此处。</p></div>`}`;
  document.querySelector('#library-import').addEventListener('click', importFiles);
  document.querySelectorAll('[data-library-song-index]').forEach((row) => row.addEventListener('click', () => playSong(songs[Number(row.dataset.librarySongIndex)])));
}
function renderPlugins() {
  const root = document.querySelector('#page-plugins');
  if (pluginDetailsOpen) {
    root.innerHTML = `<div class="settings-detail"><button class="text-button settings-back" id="plugin-back">‹ 返回插件中心</button><div class="eyebrow">PLUGIN API</div><h2>插件说明</h2><p class="settings-description">插件用于接入外部音源，并将内容转换为 Linmo Player 的统一格式。</p><div class="settings-note">当前版本暂不安装或运行第三方插件。插件接口仅作为后续扩展预留。</div></div>`;
    document.querySelector('#plugin-back').addEventListener('click', () => { pluginDetailsOpen = false; renderPlugins(); });
    return;
  }
  root.innerHTML = `<div class="empty">${cover('◈', 'empty-icon')}<h2>插件中心</h2><p>当前尚未安装音源插件。后续可通过独立插件入口接入外部音源。</p><button class="outline-button" id="plugin-docs">查看插件说明</button><small>当前版本仅支持本地音乐</small></div>`;
  document.querySelector('#plugin-docs').addEventListener('click', () => { pluginDetailsOpen = true; renderPlugins(); });
}
function renderSettings() {
  const root = document.querySelector('#page-settings');
  if (!settingsSection) {
    const settings = [['playback', '播放设置', '音质和播放方式'], ['library', '本地音乐', '导入文件与音乐库'], ['privacy', '隐私与安全', '本地数据和插件权限']];
    root.innerHTML = `<div class="section-heading"><h2 class="library-title">应用设置</h2></div><div class="settings">${settings.map(([id, title, body]) => `<button type="button" class="setting" data-setting="${id}"><span><strong>${title}</strong><p>${body}</p></span><span class="chevron">›</span></button>`).join('')}</div>`;
    root.querySelectorAll('[data-setting]').forEach((button) => button.addEventListener('click', () => { settingsSection = button.dataset.setting; renderSettings(); }));
    return;
  }
  const detail = {
    playback: { eyebrow: 'PLAYBACK', title: '播放设置', description: '配置播放器的默认行为。', body: `<div class="settings-option"><span><strong>自动播放下一首</strong><p>当前曲目结束后自动播放下一首。</p></span><button class="settings-toggle ${preferences.autoplayNext ? 'active' : ''}" data-preference="autoplayNext" aria-label="自动播放下一首" aria-pressed="${preferences.autoplayNext}"></button></div><div class="settings-option"><span><strong>后台播放</strong><p>切换到其他窗口时继续播放音频。</p></span><button class="settings-toggle ${preferences.backgroundPlayback ? 'active' : ''}" data-preference="backgroundPlayback" aria-label="后台播放" aria-pressed="${preferences.backgroundPlayback}"></button></div>` },
    library: { eyebrow: 'LOCAL MUSIC', title: '本地音乐', description: '管理当前会话中导入的音频文件。', body: `<div class="settings-option"><span><strong>当前音乐数量</strong><p>${songs.length} 首本地音乐</p></span></div><div class="settings-note">导入的文件仅在当前运行期间可用，关闭应用后不会自动保留。</div><button type="button" class="outline-button settings-action" id="clear-library">清空当前歌库</button>` },
    privacy: { eyebrow: 'PRIVACY', title: '隐私与安全', description: 'Linmo Player 默认在本地处理音乐和应用数据。', body: `<div class="settings-note">当前版本不会上传本地音乐文件，也不会连接第三方音源。</div><div class="settings-option"><span><strong>新手引导</strong><p>重新查看首次使用说明。</p></span><button type="button" class="outline-button settings-action" id="reset-onboarding">重新查看</button></div>` },
  }[settingsSection];
  root.innerHTML = `<div class="settings-detail"><button class="text-button settings-back" id="settings-back">‹ 返回应用设置</button><div class="eyebrow">${detail.eyebrow}</div><h2>${detail.title}</h2><p class="settings-description">${detail.description}</p>${detail.body}</div>`;
  document.querySelector('#settings-back').addEventListener('click', () => { settingsSection = null; renderSettings(); });
  root.querySelectorAll('[data-preference]').forEach((button) => button.addEventListener('click', () => { const key = button.dataset.preference; preferences[key] = !preferences[key]; savePreferences(); renderSettings(); }));
  document.querySelector('#clear-library')?.addEventListener('click', clearLibrary);
  document.querySelector('#reset-onboarding')?.addEventListener('click', resetOnboarding);
}
function renderMiniPlayer() {
  const mini = document.querySelector('#mini-player');
  if (!currentSong) { mini.innerHTML = '<span class="mini-empty">还没有正在播放的歌曲</span>'; return; }
  mini.innerHTML = `${cover(currentSong.glyph, 'small')}<div class="mini-copy"><strong>${currentSong.title}</strong><small>${currentSong.artist}</small></div><button class="play-button" id="mini-play" aria-label="${isPlaying ? '暂停' : '播放'}">${isPlaying ? 'Ⅱ' : '▶'}</button><span class="muted">»</span>`;
  document.querySelector('#mini-play').addEventListener('click', togglePlaying);
}
function render() { renderHome(); renderLibrary(); renderPlugins(); renderSettings(); renderMiniPlayer(); requestAnimationFrame(updateScrollIndicator); }
document.querySelector('#audio-files').addEventListener('change', (event) => { if (event.target.files?.length) addFiles(event.target.files); event.target.value = ''; });
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => { const page = button.dataset.page; document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button)); document.querySelectorAll('.page').forEach((item) => item.classList.toggle('active', item.id === `page-${page}`)); document.querySelector('#page-subtitle').textContent = pageSubtitles[page]; requestAnimationFrame(updateScrollIndicator); }));
document.querySelector('#window-minimize')?.addEventListener('click', () => windowApi?.minimize());
document.querySelector('#window-maximize')?.addEventListener('click', () => windowApi?.toggleMaximize());
document.querySelector('#window-close')?.addEventListener('click', () => windowApi?.close());
renderProfileMenu();
document.querySelector('#profile-trigger')?.addEventListener('click', (event) => { event.stopPropagation(); const menu = document.querySelector('#profile-menu'); const trigger = document.querySelector('#profile-trigger'); const isOpen = !menu.hidden; menu.hidden = isOpen; trigger.setAttribute('aria-expanded', String(!isOpen)); });
document.addEventListener('click', (event) => { const wrap = document.querySelector('.profile-wrap'); const menu = document.querySelector('#profile-menu'); const trigger = document.querySelector('#profile-trigger'); if (wrap && !wrap.contains(event.target) && menu && !menu.hidden) { menu.hidden = true; trigger?.setAttribute('aria-expanded', 'false'); } });
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
