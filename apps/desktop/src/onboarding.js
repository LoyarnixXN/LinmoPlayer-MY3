/** Three-step onboarding overlay. */

import { state, patchSettings } from './state.js';
import { icon } from './icons.js';
import { qs } from './ui.js';

const steps = [
  {
    icon: 'music',
    title: '导入本地音乐',
    body: '选择电脑中的音频文件或整个文件夹，支持 MP3、FLAC、M4A、WAV 等格式。',
    action: '导入音乐',
  },
  {
    icon: 'play',
    title: '播放与控制',
    body: '点击任意歌曲开始播放；底部播放器可以暂停、切换、拖动进度和调节音量。',
    action: '下一步',
  },
  {
    icon: 'plugins',
    title: '用插件扩展播放器',
    body: '在插件中心导入声明式插件 ZIP：接入在线音源、登录账号、更换主题与字体。',
    action: '开始使用',
  },
];

let step = 0;
let overlayBound = false;

export function onboardingDone() {
  return state.settings.onboardingDone === true;
}

export function startOnboarding(force = false) {
  if (onboardingDone() && !force) return;
  step = 0;
  render();
}

function render() {
  const root = qs('#onboarding');
  if (!root) return;
  root.hidden = false;
  root.classList.add('is-open');
  const current = steps[step];
  root.innerHTML = `<div class="onboarding-card" role="dialog" aria-modal="true" aria-label="新手引导">
      <div class="onboarding-icon">${icon(current.icon)}</div>
      <div class="eyebrow">${step + 1} / ${steps.length}</div>
      <h2>${current.title}</h2>
      <p>${current.body}</p>
      <div class="onboarding-dots">${steps
        .map(
          (_, index) => `<span class="onboarding-dot ${index === step ? 'is-active' : ''}"></span>`,
        )
        .join('')}</div>
      <div class="onboarding-actions">
        <button type="button" class="filled-button ripple" id="onboarding-primary">${current.action} ${icon(step === steps.length - 1 ? 'check' : 'arrowRight', 'button-icon')}</button>
        <button type="button" class="text-button" id="onboarding-skip">跳过</button>
      </div>
    </div>`;
  qs('#onboarding-primary', root).addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (step === 0) {
      const { importAudioFiles } = await import('./views-main.js');
      button.disabled = true;
      await importAudioFiles();
      button.disabled = false;
    }
    if (step === steps.length - 1) finish();
    else {
      step += 1;
      render();
    }
  });
  qs('#onboarding-skip', root).addEventListener('click', finish);
}

function finish() {
  patchSettings({ onboardingDone: true });
  const root = qs('#onboarding');
  if (!root) return;
  root.classList.remove('is-open');
  window.setTimeout(() => {
    root.hidden = true;
    root.innerHTML = '';
  }, 260);
}

export function initOnboarding() {
  if (overlayBound) return;
  overlayBound = true;
  startOnboarding();
}
