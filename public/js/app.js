// ===========================
// SocialMap — Client App
// ===========================

const socket = io();

// State
let myProfile = null;
let myMarker = null;
let map = null;
let markers = {};
let users = {};
let currentCallTarget = null;
let peerConnection = null;
let localStream = null;
let isMicMuted = false;
let isCamOff = false;

// Chat state
let currentDmTarget = null;         // socket ID of current DM partner
let dmHistory = {};                  // { socketId: [messages] }
let globalHistory = [];
let globalUnread = 0;
let dmUnread = {};                   // { socketId: count }
let typingTimers = {};

// ── DOM refs ──
const setupScreen   = document.getElementById('setup-screen');
const mapScreen     = document.getElementById('map-screen');
const nameInput     = document.getElementById('nameInput');
const bioInput      = document.getElementById('bioInput');
const avatarInput   = document.getElementById('avatarInput');
const avatarPreview = document.getElementById('avatarPreview');
const avatarUpload  = document.getElementById('avatarUpload');
const joinBtn       = document.getElementById('joinBtn');
const onlineCount   = document.getElementById('onlineCount');
const userList      = document.getElementById('userList');
const sidebar       = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const closeSidebar  = document.getElementById('closeSidebar');
const profilePopup  = document.getElementById('profilePopup');
const closePopup    = document.getElementById('closePopup');
const callBtn       = document.getElementById('callBtn');
const dmBtn         = document.getElementById('dmBtn');
const incomingCall  = document.getElementById('incomingCall');
const acceptCall    = document.getElementById('acceptCall');
const rejectCall    = document.getElementById('rejectCall');
const videoScreen   = document.getElementById('videoScreen');
const localVideo    = document.getElementById('localVideo');
const remoteVideo   = document.getElementById('remoteVideo');
const endCall       = document.getElementById('endCall');
const toggleMic     = document.getElementById('toggleMic');
const toggleCam     = document.getElementById('toggleCam');
const callStatus    = document.getElementById('callStatus');
const callerNameDisplay = document.getElementById('callerNameDisplay');
const myAvatarSmall = document.getElementById('myAvatarSmall');

// Chat DOM
const globalChat       = document.getElementById('globalChat');
const dmChat           = document.getElementById('dmChat');
const globalMessages   = document.getElementById('globalMessages');
const dmMessages       = document.getElementById('dmMessages');
const globalMsgInput   = document.getElementById('globalMsgInput');
const dmMsgInput       = document.getElementById('dmMsgInput');
const sendGlobal       = document.getElementById('sendGlobal');
const sendDm           = document.getElementById('sendDm');
const closeGlobalChat  = document.getElementById('closeGlobalChat');
const closeDmChat      = document.getElementById('closeDmChat');
const globalChatToggle = document.getElementById('globalChatToggle');
const globalBadge      = document.getElementById('globalBadge');
const globalTyping     = document.getElementById('globalTyping');
const dmTyping         = document.getElementById('dmTyping');
const dmHeaderName     = document.getElementById('dmHeaderName');
const dmHeaderAvatar   = document.getElementById('dmHeaderAvatar');

let uploadedAvatarUrl = null;

// ── Avatar upload ──
avatarUpload.addEventListener('click', () => avatarInput.click());
avatarInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('avatar', file);
  try {
    const res = await fetch('/upload-avatar', { method: 'POST', body: formData });
    const data = await res.json();
    uploadedAvatarUrl = data.url;
    avatarPreview.innerHTML = `<img src="${uploadedAvatarUrl}" alt="avatar">`;
  } catch (err) { console.error('Avatar upload failed:', err); }
});

// ── Join ──
joinBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); nameInput.style.borderColor = '#ff4757'; return; }
  nameInput.style.borderColor = '';
  joinBtn.querySelector('.btn-text').hidden = true;
  joinBtn.querySelector('.btn-loading').hidden = false;
  joinBtn.disabled = true;
  try {
    const pos = await getLocation();
    myProfile = { name, bio: bioInput.value.trim(), avatar: uploadedAvatarUrl, lat: pos.coords.latitude, lng: pos.coords.longitude };
    switchToMap();
  } catch (err) {
    alert('Could not get location. Please allow location access and try again.');
    joinBtn.querySelector('.btn-text').hidden = false;
    joinBtn.querySelector('.btn-loading').hidden = true;
    joinBtn.disabled = false;
  }
});

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('No geolocation'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
  });
}

function switchToMap() {
  setupScreen.classList.remove('active');
  mapScreen.classList.add('active');
  initMap();
  socket.emit('user:join', myProfile);
  updateMyAvatarSmall();
  startLocationTracking();
}

function updateMyAvatarSmall() {
  if (myProfile.avatar) {
    myAvatarSmall.innerHTML = `<img src="${myProfile.avatar}" alt="">`;
  } else {
    myAvatarSmall.innerHTML = `<div style="width:38px;height:38px;border-radius:50%;background:var(--accent2);display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-size:0.9rem;">${myProfile.name[0].toUpperCase()}</div>`;
  }
}

// ── Map ──
function initMap() {
  map = L.map('map', { center: [myProfile.lat, myProfile.lng], zoom: 5 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(map);
  myMarker = addMarker(socket.id, myProfile, true);
}

function addMarker(id, user, isMe = false) {
  const initial = (user.name || '?')[0].toUpperCase();
  const color = stringToColor(user.name || id);
  const markerHtml = user.avatar
    ? `<div class="custom-marker ${isMe ? 'my-marker' : ''}" style="background:${color}"><img src="${user.avatar}" alt=""></div>`
    : `<div class="custom-marker ${isMe ? 'my-marker' : ''}" style="background:${color}"><div class="marker-initials">${initial}</div></div>`;
  const icon = L.divIcon({ html: markerHtml, className: '', iconSize: [46,46], iconAnchor: [23,46], popupAnchor: [0,-50] });
  const marker = L.marker([user.lat, user.lng], { icon }).addTo(map);
  if (!isMe) marker.on('click', () => openProfile(id));
  else marker.bindPopup(`<strong>You</strong><br>${user.name}`);
  return marker;
}

function removeMarker(id) {
  if (markers[id]) { map.removeLayer(markers[id]); delete markers[id]; }
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#7c3aed','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#14b8a6'];
  return colors[Math.abs(hash) % colors.length];
}

function startLocationTracking() {
  navigator.geolocation.watchPosition((pos) => {
    const { latitude: lat, longitude: lng } = pos.coords;
    myProfile.lat = lat; myProfile.lng = lng;
    if (myMarker) myMarker.setLatLng([lat, lng]);
    socket.emit('user:location', { lat, lng });
  }, null, { enableHighAccuracy: true, maximumAge: 5000 });
}

// ── Sidebar ──
sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
closeSidebar.addEventListener('click', () => sidebar.classList.remove('open'));

function renderUserList() {
  const all = Object.values(users);
  onlineCount.textContent = all.length + 1;
  userList.innerHTML = '';
  all.forEach(u => {
    const hasUnread = (dmUnread[u.id] || 0) > 0;
    const div = document.createElement('div');
    div.className = `user-item${hasUnread ? ' has-unread' : ''}`;
    div.innerHTML = `
      <div class="user-item-avatar" style="background:${stringToColor(u.name)}">
        ${u.avatar ? `<img src="${u.avatar}" alt="">` : u.name[0].toUpperCase()}
      </div>
      <div class="user-item-info">
        <div class="user-item-name">${escHtml(u.name)}</div>
        <div class="user-item-bio">${escHtml(u.bio || 'No bio')}</div>
      </div>
      ${hasUnread ? `<div style="background:var(--accent);color:var(--bg);font-size:0.65rem;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;">${dmUnread[u.id]}</div>` : '<div class="user-item-dot"></div>'}
    `;
    div.addEventListener('click', () => { openProfile(u.id); sidebar.classList.remove('open'); });
    userList.appendChild(div);
  });
}

// ── Profile popup ──
let selectedUserId = null;

function openProfile(id) {
  const u = users[id];
  if (!u) return;
  selectedUserId = id;
  document.getElementById('popupAvatar').src = u.avatar || '';
  document.getElementById('popupAvatar').style.display = u.avatar ? 'block' : 'none';
  document.getElementById('popupAvatarFallback').textContent = u.name[0].toUpperCase();
  document.getElementById('popupAvatarFallback').style.display = u.avatar ? 'none' : 'flex';
  document.getElementById('popupName').textContent = u.name;
  document.getElementById('popupBio').textContent = u.bio || 'No bio yet';
  document.getElementById('popupLocation').textContent = `📍 ${u.lat?.toFixed(2)}, ${u.lng?.toFixed(2)}`;
  profilePopup.hidden = false;
  if (map && u.lat && u.lng) map.flyTo([u.lat, u.lng], 8, { duration: 1 });
}

closePopup.addEventListener('click', () => { profilePopup.hidden = true; selectedUserId = null; });
profilePopup.addEventListener('click', (e) => { if (e.target === profilePopup) { profilePopup.hidden = true; selectedUserId = null; } });

callBtn.addEventListener('click', () => {
  if (!selectedUserId) return;
  profilePopup.hidden = true;
  initiateCall(selectedUserId);
});

dmBtn.addEventListener('click', () => {
  if (!selectedUserId) return;
  profilePopup.hidden = true;
  openDm(selectedUserId);
});

// ── Socket events ──
socket.on('users:list', (list) => {
  list.forEach(u => {
    if (u.id === socket.id) return;
    users[u.id] = u;
    markers[u.id] = addMarker(u.id, u);
  });
  renderUserList();
});

socket.on('user:joined', (u) => {
  users[u.id] = u;
  markers[u.id] = addMarker(u.id, u);
  renderUserList();
  showToast(`${u.name} joined`);
});

socket.on('user:left', (id) => {
  const u = users[id];
  if (u) showToast(`${u.name} left`);
  delete users[id];
  removeMarker(id);
  // Clean up DM if open
  if (currentDmTarget === id) { dmChat.classList.remove('open'); currentDmTarget = null; }
  delete dmUnread[id];
  renderUserList();
});

socket.on('user:moved', ({ id, lat, lng }) => {
  if (users[id]) { users[id].lat = lat; users[id].lng = lng; }
  if (markers[id]) markers[id].setLatLng([lat, lng]);
});

// ── CHAT ──

// Global chat
globalChatToggle.addEventListener('click', () => {
  const isOpen = globalChat.classList.toggle('open');
  globalChatToggle.classList.toggle('active', isOpen);
  if (isOpen) {
    globalUnread = 0;
    globalBadge.hidden = true;
    globalMessages.scrollTop = globalMessages.scrollHeight;
    globalMsgInput.focus();
  }
});
closeGlobalChat.addEventListener('click', () => {
  globalChat.classList.remove('open');
  globalChatToggle.classList.remove('active');
});

function sendGlobalMsg() {
  const text = globalMsgInput.value.trim();
  if (!text) return;
  socket.emit('chat:global', { text });
  globalMsgInput.value = '';
  socket.emit('chat:typing', { isTyping: false });
}
sendGlobal.addEventListener('click', sendGlobalMsg);
globalMsgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendGlobalMsg(); });

let globalTypingTimer = null;
globalMsgInput.addEventListener('input', () => {
  socket.emit('chat:typing', { isTyping: true });
  clearTimeout(globalTypingTimer);
  globalTypingTimer = setTimeout(() => socket.emit('chat:typing', { isTyping: false }), 1500);
});

socket.on('chat:global', (msg) => {
  globalHistory.push(msg);
  const isMe = msg.from === socket.id;
  appendMsg(globalMessages, msg, isMe);
  if (!globalChat.classList.contains('open')) {
    globalUnread++;
    globalBadge.hidden = false;
    globalBadge.textContent = globalUnread > 9 ? '9+' : globalUnread;
    if (!isMe) showToast(`${msg.name}: ${msg.text.slice(0,40)}`);
  }
});

// Typing in global
const globalTypingUsers = new Set();
socket.on('chat:typing', ({ from, name, isTyping }) => {
  if (from === socket.id) return;
  // Is this for global or DM?
  // No 'to' means global
  if (isTyping) globalTypingUsers.add(name);
  else globalTypingUsers.delete(name);
  updateGlobalTyping();
});

function updateGlobalTyping() {
  const arr = [...globalTypingUsers];
  if (arr.length === 0) globalTyping.textContent = '';
  else if (arr.length === 1) globalTyping.textContent = `${arr[0]} is typing...`;
  else globalTyping.textContent = `${arr.slice(0,-1).join(', ')} and ${arr[arr.length-1]} are typing...`;
}

// DM chat
function openDm(targetId) {
  const u = users[targetId];
  if (!u) return;
  currentDmTarget = targetId;
  dmUnread[targetId] = 0;
  renderUserList();

  // Header
  dmHeaderName.textContent = u.name;
  if (u.avatar) {
    dmHeaderAvatar.innerHTML = `<img src="${u.avatar}" alt="">`;
  } else {
    dmHeaderAvatar.innerHTML = u.name[0].toUpperCase();
    dmHeaderAvatar.style.background = stringToColor(u.name);
  }

  // Render history
  dmMessages.innerHTML = '';
  (dmHistory[targetId] || []).forEach(msg => appendMsg(dmMessages, msg, msg.from === socket.id));

  dmChat.classList.add('open');
  dmMessages.scrollTop = dmMessages.scrollHeight;
  dmMsgInput.focus();
}

closeDmChat.addEventListener('click', () => {
  dmChat.classList.remove('open');
  currentDmTarget = null;
});

function sendDmMsg() {
  const text = dmMsgInput.value.trim();
  if (!text || !currentDmTarget) return;
  socket.emit('chat:dm', { to: currentDmTarget, text });
  dmMsgInput.value = '';
  socket.emit('chat:typing', { to: currentDmTarget, isTyping: false });
}
sendDm.addEventListener('click', sendDmMsg);
dmMsgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendDmMsg(); });

let dmTypingTimer = null;
dmMsgInput.addEventListener('input', () => {
  if (!currentDmTarget) return;
  socket.emit('chat:typing', { to: currentDmTarget, isTyping: true });
  clearTimeout(dmTypingTimer);
  dmTypingTimer = setTimeout(() => socket.emit('chat:typing', { to: currentDmTarget, isTyping: false }), 1500);
});

socket.on('chat:dm', (msg) => {
  const partnerId = msg.from === socket.id ? currentDmTarget : msg.from;
  if (!dmHistory[partnerId]) dmHistory[partnerId] = [];
  // Avoid duplicate if sender echoed
  const last = dmHistory[partnerId].slice(-1)[0];
  if (last && last.id === msg.id) return;
  dmHistory[partnerId].push(msg);

  const isMe = msg.from === socket.id;
  if (currentDmTarget === partnerId && dmChat.classList.contains('open')) {
    appendMsg(dmMessages, msg, isMe);
  } else if (!isMe) {
    dmUnread[msg.from] = (dmUnread[msg.from] || 0) + 1;
    renderUserList();
    showToast(`💬 ${msg.name}: ${msg.text.slice(0,40)}`);
  }
});

// DM typing indicator (server sends to specific user)
// We reuse chat:typing event — if msg has a `to` field and from=partner it's DM
// Actually server broadcasts to 'to' only, so if I receive it, it's for me
// We need a separate event for DM typing
socket.on('chat:typing:dm', ({ from, name, isTyping }) => {
  if (from !== currentDmTarget) return;
  dmTyping.textContent = isTyping ? `${name} is typing...` : '';
});

// ── Render message ──
function appendMsg(container, msg, isMe) {
  const u = isMe ? myProfile : (users[msg.from] || { name: msg.name, avatar: msg.avatar });
  const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const avatarHtml = u.avatar
    ? `<img src="${u.avatar}" alt="">`
    : u.name[0].toUpperCase();

  const div = document.createElement('div');
  div.className = `msg-row ${isMe ? 'me' : ''}`;
  div.innerHTML = `
    <div class="msg-avatar" style="background:${stringToColor(u.name || '?')}">${avatarHtml}</div>
    <div class="msg-bubble-wrap">
      ${!isMe ? `<div class="msg-name">${escHtml(msg.name)}</div>` : ''}
      <div class="msg-bubble">${escHtml(msg.text)}</div>
      <div class="msg-time">${time}</div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ── WEBRTC ──
const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

async function initiateCall(targetId) {
  currentCallTarget = targetId;
  socket.emit('call:request', { to: targetId });
  showCallingUI(users[targetId]);
}

function showCallingUI(user) {
  incomingCall.hidden = false;
  document.getElementById('incomingName').textContent = `Calling ${user?.name || '...'}`;
  document.getElementById('incomingAvatar').textContent = user?.avatar ? '' : (user?.name?.[0] || '?');
  if (user?.avatar) document.getElementById('incomingAvatar').innerHTML = `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;">`;
  document.querySelector('.call-card p').textContent = '';
  acceptCall.hidden = true;
  rejectCall.textContent = '❌ Cancel';
}

socket.on('call:incoming', async ({ from, caller }) => {
  currentCallTarget = from;
  incomingCall.hidden = false;
  document.getElementById('incomingName').textContent = caller?.name || 'Someone';
  document.getElementById('incomingAvatar').textContent = caller?.avatar ? '' : (caller?.name?.[0] || '?');
  if (caller?.avatar) document.getElementById('incomingAvatar').innerHTML = `<img src="${caller.avatar}" style="width:100%;height:100%;object-fit:cover;">`;
  document.querySelector('.call-card p').textContent = 'is calling you...';
  acceptCall.hidden = false;
  rejectCall.textContent = '❌ Decline';
});

acceptCall.addEventListener('click', async () => {
  incomingCall.hidden = true;
  await startCall(false);
  socket.emit('call:accept', { to: currentCallTarget });
});

rejectCall.addEventListener('click', () => {
  incomingCall.hidden = true;
  socket.emit('call:reject', { to: currentCallTarget });
  currentCallTarget = null;
});

socket.on('call:accepted', async ({ from }) => {
  currentCallTarget = from;
  incomingCall.hidden = true;
  await startCall(true);
});

socket.on('call:rejected', () => { incomingCall.hidden = true; currentCallTarget = null; showToast('Call declined'); });
socket.on('call:ended', () => { endCallCleanup(); showToast('Call ended'); });

async function startCall(isInitiator) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    videoScreen.hidden = false;
    callerNameDisplay.textContent = users[currentCallTarget]?.name || 'Calling...';
    callStatus.textContent = 'Connecting...';

    peerConnection = new RTCPeerConnection(ICE_SERVERS);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (e) => {
      remoteVideo.srcObject = e.streams[0];
      callStatus.textContent = 'Connected ✓';
      setTimeout(() => { callStatus.style.display = 'none'; }, 2000);
    };

    peerConnection.onicecandidate = (e) => {
      if (e.candidate) socket.emit('webrtc:ice', { to: currentCallTarget, candidate: e.candidate });
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (['disconnected','failed','closed'].includes(peerConnection.iceConnectionState)) endCallCleanup();
    };

    if (isInitiator) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('webrtc:offer', { to: currentCallTarget, offer });
    }
  } catch (err) {
    console.error('Call error:', err);
    showToast('Could not start camera/mic');
    endCallCleanup();
  }
}

socket.on('webrtc:offer', async ({ from, offer }) => {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('webrtc:answer', { to: from, answer });
});

socket.on('webrtc:answer', async ({ answer }) => {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(answer);
});

socket.on('webrtc:ice', async ({ candidate }) => {
  if (!peerConnection) return;
  try { await peerConnection.addIceCandidate(candidate); } catch {}
});

endCall.addEventListener('click', () => { socket.emit('call:end', { to: currentCallTarget }); endCallCleanup(); });

toggleMic.addEventListener('click', () => {
  if (!localStream) return;
  isMicMuted = !isMicMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
  toggleMic.textContent = isMicMuted ? '🔇' : '🎤';
  toggleMic.classList.toggle('muted', isMicMuted);
});

toggleCam.addEventListener('click', () => {
  if (!localStream) return;
  isCamOff = !isCamOff;
  localStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
  toggleCam.textContent = isCamOff ? '🚫' : '📷';
  toggleCam.classList.toggle('muted', isCamOff);
});

function endCallCleanup() {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  videoScreen.hidden = true;
  callStatus.style.display = '';
  callStatus.textContent = 'Connecting...';
  currentCallTarget = null;
  isMicMuted = false; isCamOff = false;
  toggleMic.textContent = '🎤';
  toggleCam.textContent = '📷';
}

// ── Toast ──
function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(15,22,35,0.95);border:1px solid rgba(255,255,255,0.1);color:white;padding:10px 20px;border-radius:50px;font-size:0.85rem;z-index:9999;animation:fadeIn 0.3s ease;pointer-events:none;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
