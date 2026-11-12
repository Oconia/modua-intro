const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const shareIcon='<svg viewBox="0 0 24 24"><path d="M12 16V3m-5 5 5-5 5 5M4 13v8h16v-8"/></svg>';
const videos = JSON.parse($('#media-data').textContent);
function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
function card(video, index) {
  const { title, poster, duration, id, publisher } = video;
  const label = escapeText(title);
  return `<article class="media-card">
    <button class="video-cover" data-video="${index}" aria-label="${label} 보기">
      <img src="${escapeText(poster)}" alt="${label} 영상 포스터" loading="lazy"><span class="play" aria-hidden="true">▶</span>
      ${duration ? `<span class="duration">${escapeText(duration)}</span>` : ''}</button>
    <div class="media-meta"><div><button data-video="${index}"><h3>${label}</h3></button><p>${escapeText(publisher)}</p></div>
      <button class="share" data-share="${escapeText(id)}" aria-label="${label} 공유">${shareIcon}</button></div></article>`;
}
function renderCards() {
  $('#video-grid').innerHTML = videos.map((video, index) => video.short ? '' : card(video, index)).join('');
  $('#short-grid').innerHTML = videos.map((video, index) => video.short ? card(video, index) : '').join('');
}
renderCards();
const screens = {
  personal: [['news', '소식'], ['chats', '대화'], ['friends', '친구'], ['profile', '프로필']],
  team: [['chats', '대화'], ['news', '소식'], ['profile', '팀 프로필'], ['team-manage', '팀 관리']],
  admin: [['submissions', '접수 자료'], ['inbox', '업무함'], ['ops-teams', '참여팀'], ['ops-access', '권한 관리']],
};
let currentRole = 'personal';
let currentView = 'news';
function setScreen(role, view) {
  currentRole = role;
  const menu = screens[role];
  currentView = menu.find(([key]) => key === view)?.[0] ?? menu[0][0];
  $$('[data-role]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.role === role)));
  $('#feature-tabs').innerHTML = menu.map(([key, label]) =>
    `<button aria-pressed="${key === currentView}" data-view="${key}">${label}</button>`
  ).join('');
  $('#app-frame').contentWindow.postMessage({type:'modua-screen',role,view:currentView},location.origin);$('#full-app').href=`mvp/app.html?intro=1&role=${role}&view=${currentView}`;
}
$$('[data-role]').forEach(b=>b.addEventListener('click',()=>setScreen(b.dataset.role)));$('#feature-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setScreen(currentRole,b.dataset.view);});$('#app-frame').addEventListener('load',()=>setScreen(currentRole,currentView));
$$('[data-display]').forEach(b=>b.addEventListener('click',()=>{$('#demo-body').classList.toggle('desktop',b.dataset.display==='desktop');$$('[data-display]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}));$('#show-profile').addEventListener('click',()=>setScreen('personal','profile'));
const menuButton = $('.menu');
function setMenuOpen(open) {
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  $('#site-nav').classList.toggle('open', open);
}
menuButton.addEventListener('click', () => setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true'));
$$('#site-nav a').forEach(link => link.addEventListener('click', () => setMenuOpen(false)));
const introHistoryKey = 'moduaIntroViewer';
let activeVideo = -1;
let dialogStack = [];
let savedY = 0;
let focusBefore;
let timer;
const initialViewerState = history.state?.[introHistoryKey];
try { history.scrollRestoration = 'manual'; } catch {}

function recordViewerHistory(method, state) {
  try {
    history[method]({ ...history.state, [introHistoryKey]: state }, '');
    return true;
  } catch {
    return false;
  }
}

function showDialog(id, tracked) {
  dialogStack.push({ id, tracked });
  $('#' + id).showModal();
  if (id === 'video-dialog') startVideo(videos[activeVideo]);
  document.documentElement.style.overflow = 'hidden';
}

function openDialog(id) {
  if ($('#' + id).open) return;
  if (!dialogStack.length) {
    savedY = scrollY;
    focusBefore = document.activeElement;
    recordViewerHistory('replaceState', { listY: savedY });
  }
  const tracked = recordViewerHistory('pushState', {
    dialog: id,
    videoId: videos[activeVideo]?.id,
    listY: savedY,
  });
  showDialog(id, tracked);
}

function reconcileDialog(id) {
  const wasOpen = dialogStack.length > 0;
  while (dialogStack.length && dialogStack.at(-1).id !== id) {
    const { id: closedId } = dialogStack.pop();
    $('#' + closedId).close();
    if (closedId === 'video-dialog') {
      resetPlayback();
    }
  }
  if (wasOpen && !dialogStack.length) {
    document.documentElement.style.overflow = '';
    scrollTo({ top: savedY, behavior: 'instant' });
    focusBefore?.focus({ preventScroll: true });
  }
}

function closeDialog() {
  const closing = dialogStack.at(-1);
  if (!closing) return;
  reconcileDialog(dialogStack.at(-2)?.id);
  if (closing.tracked && history.state?.[introHistoryKey]?.dialog === closing.id) history.back();
}

function syncViewerHistory(state) {
  const entry = state?.[introHistoryKey];
  const active = dialogStack.at(-1)?.id;
  if (entry?.dialog === 'share-dialog' && !$('#share-dialog').open && $('#share-url').value) {
    showDialog('share-dialog', true);
    return;
  }
  reconcileDialog(entry?.dialog);
  const restoredIndex = entry?.videoId ? videos.findIndex(video => video.id === entry.videoId) : entry?.videoIndex;
  if (entry?.dialog === 'video-dialog' && !viewer.open && videos[restoredIndex]) {
    savedY = entry.listY;
    renderVideo(restoredIndex);
    showDialog('video-dialog', true);
  } else if (!entry?.dialog && !active && Number.isFinite(entry?.listY)) {
    scrollTo({ top: entry.listY, behavior: 'instant' });
  }
}

addEventListener('popstate', event => syncViewerHistory(event.state));
$$('[data-close]').forEach(button => button.addEventListener('click', closeDialog));
$$('dialog').forEach(dialog => {
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || dialog.id === 'video-dialog') return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
  });
});
const viewer = $('#video-dialog');
const player = $('#viewer-video');
const poster = $('#viewer-poster');
const embedTemplate = $('#viewer-embed');
const stage = $('.viewer-stage');
const playToggle = $('#viewer-toggle');
const playOnStage = $('#viewer-play');
const progress = $('#viewer-progress');
const soundToggle = $('#viewer-sound');
const mediaBase = 'https://media.modua.co.kr/';

function playbackTime(seconds) {
  const elapsed = Math.floor(seconds || 0);
  return Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0');
}

let playbackRequest = 0;
let preferMuted = false;
let embedded;
let youtubeApiPromise;

function updatePlaybackControls() {
  const playing = !player.paused && !player.ended;
  const label = playing ? '일시정지' : '영상 재생';
  playToggle.setAttribute('aria-label', label);
  playToggle.querySelector('path').setAttribute('d', playing ? 'M9 5v14m6-14v14' : 'm8 5 11 7-11 7Z');
  const mode = viewer.dataset.playback;
  playOnStage.hidden = mode !== 'blocked' && (mode !== 'local' || playing);
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  progress.max = duration;
  progress.disabled = !duration;
  progress.value = player.currentTime;
  progress.setAttribute('aria-valuetext', playbackTime(player.currentTime) + ' / ' + playbackTime(duration));
  $('#viewer-time').value = playbackTime(player.currentTime);
  soundToggle.setAttribute('aria-label', player.muted ? '음소거 해제' : '음소거');
  soundToggle.querySelector('path').setAttribute('d', player.muted
    ? 'M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6'
    : 'M11 5 6 9H3v6h3l5 4V5Zm5 3a6 6 0 0 1 0 8m2-11a10 10 0 0 1 0 14');
}

function resetPlayback() {
  playbackRequest++;
  viewer.dataset.playback = 'loading';
  player.pause();
  if (player.hasAttribute('src')) {
    player.removeAttribute('src');
    player.load();
  }
  const previous = embedded;
  embedded = undefined;
  if (previous) {
    try { previous.controller?.destroy(); } catch {}
    previous.frame.remove();
  }
  player.hidden = true;
  poster.hidden = false;
  playOnStage.hidden = true;
  delete stage.dataset.embedded;
}

async function playLocal() {
  const request = playbackRequest;
  try {
    await player.play();
  } catch (error) {
    if (request !== playbackRequest) return;
    if (error.name === 'NotAllowedError' && !player.muted) {
      player.muted = true;
      return playLocal();
    }
    viewer.dataset.playback = 'blocked';
    updatePlaybackControls();
    return;
  }
  if (request !== playbackRequest || player.paused) return;
  viewer.dataset.playback = 'local';
  player.hidden = false;
  poster.hidden = true;
  updatePlaybackControls();
}

function youtubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise(resolve => {
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.addEventListener('error', () => {
        script.remove();
        youtubeApiPromise = undefined;
        resolve(null);
      }, { once: true });
      document.head.append(script);
    });
  }
  return youtubeApiPromise;
}

function startEmbedded(video) {
  const frame = embedTemplate.content.firstElementChild.cloneNode();
  const url = new URL(`https://www.youtube-nocookie.com/embed/${video.youtubeId}`);
  url.search = new URLSearchParams({
    autoplay: '1', mute: preferMuted ? '1' : '0', playsinline: '1', rel: '0',
    enablejsapi: '1', origin: location.origin,
  });
  frame.title = video.title;
  frame.src = url.href;
  const attempt = { frame, muted: preferMuted };
  embedded = attempt;
  viewer.dataset.playback = 'embedded';
  stage.dataset.embedded = '';
  poster.hidden = true;
  stage.append(frame);

  youtubeApi().then(api => {
    if (!api?.Player || embedded !== attempt) return;
    attempt.controller = new api.Player(frame, {
      events: {
        onReady({ target }) {
          if (embedded !== attempt) return;
          const { UNSTARTED, CUED, PAUSED } = api.PlayerState;
          if (![UNSTARTED, CUED, PAUSED].includes(target.getPlayerState())) return;
          if (attempt.muted) target.mute();
          else target.unMute();
          target.playVideo();
        },
        onAutoplayBlocked({ target }) {
          if (embedded !== attempt || attempt.muted) return;
          attempt.muted = true;
          target.mute();
          target.playVideo();
        },
      },
    });
  }).catch(() => {
    // The embedded player can still use its own playback controls.
  });
}

function startVideo(v) {
  if (!v) return;
  if (v.youtubeId) {
    startEmbedded(v);
    return;
  }
  player.muted = preferMuted;
  player.hidden = false;
  player.src = `media/${v.id}.mp4`;
  playLocal();
}

function togglePlayback() {
  const mode = viewer.dataset.playback;
  if (mode !== 'local' && mode !== 'blocked') return;
  if (player.paused || player.ended) {
    player.muted = preferMuted;
    playLocal();
  } else player.pause();
}

for (const event of ['play', 'pause', 'ended', 'loadedmetadata', 'timeupdate', 'volumechange']) {
  player.addEventListener(event, updatePlaybackControls);
}
stage.addEventListener('click', event => {
  if (event.target.closest('button') && event.target.closest('button') !== playOnStage) return;
  togglePlayback();
});
playToggle.addEventListener('click', togglePlayback);
soundToggle.addEventListener('click', () => {
  preferMuted = !player.muted;
  player.muted = preferMuted;
});
progress.addEventListener('input', () => { player.currentTime = Number(progress.value); });

function renderVideo(index) {
  const v = videos[index];
  if (!v) return;
  resetPlayback();
  activeVideo = index;
  viewer.dataset.orientation = v.short ? 'portrait' : 'landscape';
  viewer.style.setProperty('--video-ratio', String(v.width / v.height));
  $('#viewer-title').textContent = v.title;
  $('#viewer-publisher').textContent = v.publisher || '';
  poster.src = v.poster;
  updatePlaybackControls();
  const entry = history.state?.[introHistoryKey];
  if (viewer.open && entry?.dialog === 'video-dialog') {
    recordViewerHistory('replaceState', { ...entry, videoId: v.id });
  }
  if (viewer.open) startVideo(v);
}

function openVideo(index) {
  if (viewer.open) return;
  renderVideo(index);
  openDialog('video-dialog');
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let stepAnimation;
function stepVideo(step) {
  const next = activeVideo + step;
  if (!videos[next]) return;
  renderVideo(next);
  if (reducedMotion.matches) return;
  stepAnimation?.cancel();
  stepAnimation = stage.animate(
    [{ transform: `translateY(${step * 14}%)`, opacity: .55 }, { transform: 'translateY(0)', opacity: 1 }],
    { duration: 200, easing: 'ease-out' },
  );
}

document.addEventListener('click', event => {
  const videoButton = event.target.closest('[data-video]');
  if (videoButton) openVideo(Number(videoButton.dataset.video));
  const shareButton = event.target.closest('[data-share]');
  if (shareButton) shareItem(shareButton.dataset.share);
});
$('#viewer-share').addEventListener('click', () => shareItem(videos[activeVideo]?.id));

viewer.addEventListener('keydown', event => {
  if (event.target === progress || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  stepVideo(event.key === 'ArrowDown' ? 1 : -1);
});

let viewerGesture;
let suppressViewerClick = false;
viewer.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  suppressViewerClick = false;
  const target = event.target;
  const control = target.closest('button, a[href], input');
  if (control === progress) return;
  viewerGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, control };
  (control ?? target).setPointerCapture(event.pointerId);
});
viewer.addEventListener('pointerup', event => {
  if (viewerGesture?.id !== event.pointerId) return;
  const { x, y, control } = viewerGesture;
  const dx = event.clientX - x;
  const dy = event.clientY - y;
  viewerGesture = undefined;
  suppressViewerClick = Math.hypot(dx, dy) >= 12;
  if (control?.matches('.viewer-close, #viewer-share')) return;
  if (Math.abs(dy) >= 42 && Math.abs(dy) > Math.abs(dx)) stepVideo(dy < 0 ? 1 : -1);
});
for (const event of ['pointercancel', 'lostpointercapture']) {
  viewer.addEventListener(event, () => { viewerGesture = undefined; });
}
viewer.addEventListener('click', event => {
  if (!suppressViewerClick || event.detail === 0) return;
  suppressViewerClick = false;
  event.preventDefault();
  event.stopPropagation();
}, true);
viewer.addEventListener('close', () => {
  viewerGesture = undefined;
  suppressViewerClick = false;
  stepAnimation?.cancel();
});
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
async function shareItem(id) {
  const video = videos.find(item => item.id === id);
  const isMedia = id === 'media';
  const shareId = video?.id ?? (isMedia ? 'media' : 'page');
  const siteRoot = new URL('./', document.baseURI);
  const extension = siteRoot.hostname === 'modua.co.kr' ? '' : '.html';
  const route = shareId === 'page' ? './' : `share/${shareId}${extension}`;
  const title = video ? `${video.title} | 모두아 미디어` :
    isMedia ? '모두아 미디어' : '모두아 | 후원 그다음의 이야기';
  const description = shareId === 'page' ?
    '후원으로 친구가 되고, 대화로 가까워지는 곳.' : '모두아 미디어에서 함께한 이야기를 만나보세요.';
  const url = video?.youtubeId
    ? new URL(`share/${video.mediaKey}.html`, mediaBase).href
    : new URL(route, siteRoot).href;
  if (navigator.share) {
    try {
      await navigator.share({ title, text: description, url });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }

  const cover = video?.sharePoster || `share/thumbs/${shareId}.jpg`;
  $('#share-cover').src = cover;
  $('#share-cover').alt = title;
  $('#save-share-cover').href = cover;
  $('#save-share-cover').download = `MODUA-${shareId}-SNS.jpg`;
  $('#share-url').value = url;
  $('#share-title').textContent = video ? '이 영상 공유하기' :
    isMedia ? '모두아 미디어 공유하기' : '모두아 공유하기';
  openDialog('share-dialog');
}

$('#copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#share-url').value);toast('주소를 복사했어요.');}catch{$('#share-url').select();toast('주소를 선택했어요. 복사해서 공유해 주세요.');}});
$('.role-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=$$('[data-role]');let i=tabs.indexOf(document.activeElement);if(i<0)return;e.preventDefault();i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[i].focus();tabs[i].click();});
setScreen('personal', 'news');
async function loadMonthlyMedia() {
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    const response = await fetch('media-feed.json', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return;
    const { items } = await response.json();
    if (!Array.isArray(items)) return;
    const added = items.filter(item => !videos.some(video => video.mediaKey === item.mediaKey));
    if (!added.length) return;
    videos.push(...added);
    const activeCard = document.activeElement?.closest('[data-video], [data-share]');
    const attr = activeCard?.hasAttribute('data-video') ? 'data-video' : 'data-share';
    const value = activeCard?.getAttribute(attr);
    renderCards();
    if (value !== undefined && value !== null) {
      document.querySelector(`[${attr}="${CSS.escape(value)}"]`)?.focus({ preventScroll: true });
    }
  } catch {}
}

const shareEntry = document.body.dataset.shareEntry;
const requestedVideo = new URLSearchParams(location.search).get('video') ?? shareEntry;
const monthlyMediaReady = loadMonthlyMedia();
function restoreInitialView() {
  const videoIndex = videos.findIndex(item => item.id === requestedVideo);
  if (initialViewerState && !initialViewerState.dialog && Number.isFinite(initialViewerState.listY)) {
    document.fonts.ready.then(() => scrollTo({ top: initialViewerState.listY, behavior: 'instant' }));
  } else if (initialViewerState?.dialog === 'video-dialog') {
    document.fonts.ready.then(() => syncViewerHistory(history.state));
  } else if (shareEntry === 'media' || videoIndex >= 0) {
    document.fonts.ready.then(() => {
      $('#media').scrollIntoView({ behavior: 'instant' });
      if (videoIndex >= 0) {
        renderVideo(videoIndex);
        openDialog('video-dialog');
      }
    });
  }
}
if (requestedVideo?.startsWith('remote-') || initialViewerState?.videoId?.startsWith('remote-')) {
  monthlyMediaReady.then(restoreInitialView);
} else {
  restoreInitialView();
}
