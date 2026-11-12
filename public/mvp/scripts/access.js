'use strict';

// Interactive design fixture only. Production authentication and permissions
// must be supplied and enforced by a server, never by this preview model.
const PERMISSION_LABELS = {
  chat: '대화·자료 전달', donors: '후원 친구 열람', publish: '활동 소식 발행',
  broadcast: '전체 공지', profile: '팀 정보 수정', members: '구성원·권한 관리'
};
const ALL_TEAM_PERMISSIONS = Object.keys(PERMISSION_LABELS);
const PREVIEW_SCENARIOS = {
  owner: {label:'개인 + 두 팀 운영 + 전체 운영관리', description:'모든 진입 위치를 한 계정에서 확인', memberships:[{teamId:'haebom',role:'팀 관리자',permissions:[...ALL_TEAM_PERMISSIONS]},{teamId:'onsoop',role:'팀 관리자',permissions:[...ALL_TEAM_PERMISSIONS]}], operations:{teams:['haebom','onsoop','daon'],manageAdmins:true}},
  supporter: {label:'개인 이용자', description:'개인 공간만 표시', memberships:[], operations:null},
  member: {label:'참여팀 담당자',description:'해봄 대화·소식 이용, 관리 메뉴 없음',memberships:[{teamId:'haebom',role:'팀 담당자',permissions:['chat','publish']}],operations:null},
  teamOwner: {label:'두 참여팀 관리자',description:'해봄·온숲을 전환, 전체 운영관리 없음',memberships:[{teamId:'haebom',role:'팀 관리자',permissions:[...ALL_TEAM_PERMISSIONS]},{teamId:'onsoop',role:'팀 관리자',permissions:[...ALL_TEAM_PERMISSIONS]}],operations:null},
  operator: {label:'배정된 팀의 운영 담당자',description:'해봄의 접수 자료만 표시, 관리자 권한 설정 없음',memberships:[],operations:{teams:['haebom'],manageAdmins:false}}
};
function readPreference(key,fallback){try{return localStorage.getItem('modua-ui:'+key)||fallback;}catch{return fallback;}}
function savePreference(key,value){try{localStorage.setItem('modua-ui:'+key,value);}catch{}}
const access = {signedIn:false,scenario:'owner',memberships:[],operations:null,space:'personal',unread:{personal:3,'team:haebom':2,'team:onsoop':1,operations:2},notification:{},members:{},operators:[]};
state.workspaceTeamId = null;
state.workspaceDrafts = {};
for(const t of teams){
  access.members[t.id] = [
    {id:'self',name:me.name,role:'팀 관리자',permissions:[...ALL_TEAM_PERMISSIONS],status:'활동 중'},
    {id:'member-'+t.id,name:t.id==='haebom'?'박서연':'이도윤',role:'팀 담당자',permissions:['chat','publish'],status:'활동 중'},
    {id:'helper-'+t.id,name:t.id==='haebom'?'김유진':'정수아',role:'자료 담당자',permissions:['chat'],status:'활동 중'}
  ];
}
access.operators=[{id:'ops-self',name:me.name,scope:['haebom','onsoop','daon'],status:'활동 중',master:true},{id:'ops-haneul',name:'김하늘',scope:['haebom'],status:'활동 중',master:false}];
function membership(id=state.workspaceTeamId){return access.memberships.find(m=>m.teamId===id);}
function teamCan(permission,id=state.workspaceTeamId){return access.signedIn && !!membership(id)?.permissions.includes(permission);}
function inOperations(){return access.signedIn && access.space==='operations' && !!access.operations;}
function canManageTeam(){return state.role==='team' && ['profile','members'].some(p=>teamCan(p));}
function teamDonors(){return donors.slice(0,team(state.workspaceTeamId).supporters);}
function newChatContacts(){
  if(state.role!=='team')return [...teams,...people];
  const colleagues=access.members[state.workspaceTeamId].filter(m=>m.id!=='self'&&m.status==='활동 중').map(m=>({...m,short:m.name.slice(-2),color:'blue',bio:'내부 구성원 · '+m.role}));
  return [...colleagues,...(teamCan('donors')?teamDonors().slice(0,8):[])];
}
function allowedSubmissions(){return submissions.filter(s=>inOperations()?access.operations.teams.includes(s.team):state.role==='team'&&s.team===state.workspaceTeamId);}
function canReadSubmission(id){return allowedSubmissions().some(s=>s.id===id);}
function availableSpaces(){
  return [{key:'personal',name:me.name,caption:'내 개인 공간',identity:me},...access.memberships.map(m=>({key:'team:'+m.teamId,name:team(m.teamId).name,caption:m.role,identity:team(m.teamId)})),...(access.operations?[{key:'operations',name:'모두의기부 운영관리',caption:access.operations.manageAdmins?'전체 운영관리':'배정된 팀 운영',identity:{id:'admin',name:'모두의기부',short:'운영',color:'official'}}]:[])];
}
function spaceExists(key){return availableSpaces().some(s=>s.key===key);}
function currentSpace(){return availableSpaces().find(s=>s.key===access.space)||availableSpaces()[0];}
function currentWorkspaceIdentity(){return currentSpace().identity;}
function useScenario(key){
  if(!PREVIEW_SCENARIOS[key])return;
  access.scenario=key;
  const fixture=JSON.parse(JSON.stringify(PREVIEW_SCENARIOS[key]));
  access.memberships=fixture.memberships; access.operations=fixture.operations;
}
function preserveDraft(){const field=document.querySelector('#message-input');if(field)state.workspaceDrafts[access.space+':'+state.room]=field.value;}
function switchWorkspace(key,{remember=true}={}){
  if(!access.signedIn||!spaceExists(key)){toast('이 공간을 이용할 권한이 없습니다.');return false;}
  preserveDraft();closeWorkspaceMenu();closeModal();access.space=key;
  state.role=key==='personal'?'supporter':key==='operations'?'admin':'team';
  state.workspaceTeamId=state.role==='team'?key.slice(5):null;
  state.view=state.role==='admin'?'inbox':'chats';state.mobileOpen=false;
  state.profilePerson=null;state.friendQuery='';state.friendLimit=20;
  state.chatFilter='all';state.adminFilter='all';state.profileFilter='all';state.newsFilter='all';
  state.room=accessRooms()[0]?.id||'';
  if(remember)savePreference('space:'+access.scenario,key);
  render();return true;
}
function reconcilePermissions(){
  if(!spaceExists(access.space)){access.space='personal';state.role='supporter';state.workspaceTeamId=null;state.view='chats';state.room='haebom-chat';state.mobileOpen=false;closeModal();closeWorkspaceMenu();savePreference('space:'+access.scenario,'personal');}
  if(!allowedView(state.view))state.view=state.role==='admin'?'inbox':'chats';
}
function accessNavItems(){
  if(state.role==='admin')return [['inbox','inbox','업무함'],['submissions','file','접수 자료'],['ops-teams','friends','참여팀'],...(access.operations?.manageAdmins?[['ops-access','settings','권한 관리']]:[])];
  return [...(state.role==='supporter'||teamCan('donors')?[['friends','friends','친구']]:[]),['chats','chat','대화'],['news','news','소식'],['profile','profile',state.role==='team'?'팀 프로필':'내 프로필']];
}
function allowedView(view){return access.signedIn&&(accessNavItems().some(n=>n[0]===view)||view==='team'||view==='team-manage'&&canManageTeam());}
function workspaceButton(){const s=currentSpace();return `<button class="workspace-trigger" data-access="open-space" aria-haspopup="dialog" aria-expanded="false" aria-controls="space-menu" aria-label="${esc(s.name)}, 공간 선택">${avatar(s.identity,'sm')}<span class="workspace-copy"><strong>${esc(s.name)}</strong><small>${esc(s.caption)}</small></span>${icon('down')}</button>`;}
function screenActionMarkup(){
  if(!access.signedIn)return '';
  if(state.view==='friends'){
    if(state.role==='supporter')return iconButton('addfriend','add-friend','친구 추가');
    return teamCan('broadcast')?`<button type="button" class="btn light" data-action="broadcast">${icon('megaphone')}전체 공지</button>`:'';
  }
  if(state.view==='chats')return state.role!=='team'||teamCan('chat')?iconButton('edit','new-chat','새 대화'):'';
  if(state.view==='inbox')return iconButton('search','focus-search','업무함 검색');
  if(state.view==='news')return state.role==='supporter'||teamCan('publish')?`<button type="button" class="btn light" data-action="compose-post">${icon('plus')}${state.role==='team'?'소식 올리기':'활동 올리기'}</button>`:'';
  if(state.view==='profile'){
    if(state.role==='team')return canManageTeam()?'<button type="button" class="btn light" data-access="team-manage">팀 관리</button>':'';
    return state.profilePerson?'':iconButton('settings','profile-settings','프로필 공개 설정');
  }
  if(state.view==='submissions')return `<span class="context-count" aria-label="전체 접수 ${allowedSubmissions().length}건">${allowedSubmissions().length}건</span>`;
  if(state.view==='ops-teams')return `<span class="context-count" aria-label="담당 참여팀 ${access.operations?.teams.length||0}개">${access.operations?.teams.length||0}개 팀</span>`;
  if(state.view==='ops-access')return `<span class="context-count" aria-label="운영 담당자 ${access.operators.length}명">${access.operators.length}명</span>`;
  return '';
}
function renderMobileContext(){
  document.body.classList.toggle('chat-room-open',['chats','inbox'].includes(state.view)&&state.mobileOpen);
  const actions=screenActionMarkup();
  document.querySelector('#mobile-context').innerHTML=workspaceButton()+(actions?`<div class="context-actions">${actions}</div>`:'');
}
function renderAccessShell(){
  const items=accessNavItems();
  document.body.classList.remove('signed-out');document.querySelector('#login-surface').hidden=true;
  renderMobileContext();
  const badge=key=>(key==='chats'||key==='inbox')&&access.unread[access.space]>0?`<span class="badge">${access.unread[access.space]}</span>`:'';
  document.querySelector('#sidebar').innerHTML=`${workspaceButton()}<nav class="nav-list" aria-label="주요 메뉴">${items.map(([key,i,label])=>`<button class="nav-item ${state.view===key?'active':''}" data-view="${key}">${icon(i)}<span>${label}</span>${badge(key)}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="modua-wordmark">modua<span>모두아</span></div><button class="sidebar-setting" data-access="account-settings">${icon('settings')}계정 설정</button></div>`;
  document.querySelector('#mobile-nav').innerHTML=items.map(([key,i,label])=>`<button data-view="${key}" class="${state.view===key?'active':''}">${icon(i)}<span>${label}</span>${badge(key)}</button>`).join('');
  document.querySelector('#preview-status').textContent='화면 미리보기 · 예시 데이터';
}
function openWorkspaceMenu(){
  if(!access.signedIn)return;
  preserveDraft();const spaces=availableSpaces(),modalEl=document.querySelector('#space-menu');
  const row=s=>`<button class="space-row ${s.key===access.space?'selected':''}" data-access="select-space" data-space="${s.key}" aria-pressed="${s.key===access.space}">${avatar(s.identity,'sm')}<span><strong>${esc(s.name)}</strong><small>${esc(s.caption)}</small></span>${access.unread[s.key]?`<b class="space-unread">${access.unread[s.key]}</b>`:''}${s.key===access.space?icon('check'):''}</button>`;
  modalEl.innerHTML=`<div class="sheet-handle"></div><div class="space-title"><h2>이용 공간</h2><button class="icon-btn" data-access="close-space" aria-label="공간 선택 닫기">${icon('close')}</button></div><div class="space-options">${row(spaces[0])}${access.memberships.length?'<p class="space-section">운영 중인 참여팀</p>':''}${spaces.filter(s=>s.key.startsWith('team:')).map(row).join('')}${access.operations?'<p class="space-section">서비스 운영</p>'+row(spaces.find(s=>s.key==='operations')):''}</div><div class="space-footer"><button data-access="account-settings">${icon('settings')}계정 설정</button><button data-access="logout">로그아웃</button></div>`;
  document.querySelectorAll('.workspace-trigger').forEach(b=>b.setAttribute('aria-expanded','true'));
  if(!modalEl.open)modalEl.showModal();
}
function closeWorkspaceMenu(){const d=document.querySelector('#space-menu');if(d?.open)d.close();document.querySelectorAll('.workspace-trigger').forEach(b=>b.setAttribute('aria-expanded','false'));}
function accessRooms(){
  if(state.role==='admin')return allowedSubmissions().map(s=>({id:s.room,title:team(s.team).name,peer:team(s.team),time:s.time,preview:s.title,kind:'ops',submission:s}));
  if(state.role==='team'){
    const t=team(state.workspaceTeamId),opsId=t.id==='haebom'?'ops':t.id==='onsoop'?'ops-forest':'ops-dog',internal='internal-'+t.id,personId='team:'+t.id+':jimin';
    messages[internal]??=[{system:t.name+'의 내부 구성원만 참여하는 대화방입니다.'},{from:'colleague',text:'이번 주 활동 자료를 이곳에 모아주세요.',time:'09:10',senderName:t.id==='haebom'?'박서연':'이도윤'}];
    messages[personId]??=[{from:'supporter',text:'이번 달 소식 잘 봤습니다. 앞으로도 응원할게요!',time:'12:40'}];
    return [{id:opsId,title:'모두의기부',peer:{id:'admin',name:'모두의기부',short:'모두',color:'official'},kind:'ops',time:'14:35',preview:'운영 자료와 접수 상태를 확인하세요.',unread:1},{id:internal,title:t.short+' 운영팀',peer:{id:internal,name:t.short+' 운영팀',short:'내부',color:'blue'},kind:'internal',time:'09:10',preview:'이번 주 활동 자료를 이곳에 모아주세요.',count:access.members[t.id].filter(m=>m.status==='활동 중').length},...(teamCan('donors')?[{id:personId,title:'지민',peer:me,kind:'person',time:'12:40',preview:'앞으로도 응원할게요!'}]:[]),...state.groupRooms.filter(g=>g.role==='team'&&g.teamId===t.id)];
  }
  return [{id:'haebom-chat',title:team('haebom').name,peer:team('haebom'),kind:'team',time:'14:28',preview:'늘 따뜻한 마음으로 함께해 주셔서 감사합니다!',unread:2},{id:'minji-chat',title:'서민지',peer:people[0],kind:'person',time:'13:02',preview:'이번 주말에도 봉사 활동 같이 갈까요?'},{id:'onsoop-chat',title:'온숲',peer:team('onsoop'),kind:'team',time:'11:31',preview:'사진을 보냈습니다.',unread:1},{id:'group-volunteer',title:'토요일, 함께 걷기',peer:{name:'봉사모임',short:'함께',color:'forest'},kind:'group',time:'10:02',preview:'저도 함께할게요 🙌',count:5},{id:'daon-chat',title:'다온동물보호소',peer:team('daon'),kind:'team',time:'어제',preview:'따뜻한 하루를 보냈어요.'},...state.groupRooms.filter(g=>g.role==='supporter')];
}
function renderLogin(){
  document.body.classList.add('signed-out');const login=document.querySelector('#login-surface');login.hidden=false;
  document.querySelector('#preview-status').textContent='로그인 체험 · 예시 계정';
  login.innerHTML=`<div class="login-brand-panel"><div class="login-wordmark">modua<span>모두아</span></div><div class="login-photo"><img src="${images.classroom}" alt="함께 그림을 그리는 아이들"><span>함께한 순간이 이어지는 곳.</span></div></div><div class="login-content"><div class="login-mobile-brand">modua<span>모두아</span></div><div class="login-box"><p class="login-eyebrow">모두아 로그인 체험</p><h1>우리의 대화가<br>이어지는 곳.</h1><div class="login-actions"><button class="social-login kakao" data-access="login" data-provider="kakao"><b aria-hidden="true">${icon('chat')}</b>카카오 로그인 체험</button><button class="social-login google" data-access="login" data-provider="google"><b aria-hidden="true">G</b>Google 로그인 체험</button><button class="social-login apple" data-access="login" data-provider="apple">Apple 로그인 체험</button></div><p class="login-policy">예시 계정으로 화면을 체험합니다.</p></div><p class="login-footer">MODUA · 모두의기부</p></div>`;
}
function previewLogin(){
  access.signedIn=true;
  const last=readPreference('space:'+access.scenario,'personal');
  switchWorkspace(spaceExists(last)?last:'personal');
  toast('예시 계정으로 체험을 시작합니다.');
}
function previewSettings(){
  closeWorkspaceMenu();openModal(`${modalHeader('미리보기 설정')}<div class="modal-body"><p class="intro">계정이 서버에서 받은 권한을 가정해 화면을 확인합니다. 실제 계정의 권한은 변경되지 않습니다.</p><div class="scenario-list">${Object.entries(PREVIEW_SCENARIOS).map(([id,s])=>`<button class="scenario-option ${access.scenario===id?'selected':''}" data-access="scenario" data-id="${id}"><span><strong>${s.label}</strong><small>${s.description}</small></span>${access.scenario===id?icon('check'):''}</button>`).join('')}</div><div class="preview-checks"><button class="btn wide" data-access="show-login">로그인 화면 체험하기</button>${access.signedIn&&access.space!=='personal'?'<button class="btn wide" data-access="revoke-current">현재 공간의 권한 회수 확인</button>':''}</div><p class="modal-note">SNS 인증·서버 권한 검사·메시지 발송은 연결 전입니다. 변경한 예시 업무 데이터는 새로고침하면 초기화됩니다.</p></div>`);
}
function accountSettings(){closeWorkspaceMenu();openModal(`${modalHeader('계정 설정')}<div class="modal-body"><div class="account-summary">${avatar(me,'big')}<div><h3>${esc(me.name)}</h3><p>개인 계정</p></div></div><button class="settings-link" data-access="personal-profile"><span>내 프로필 편집</span>${icon('chevron')}</button><button class="settings-link" data-access="notification"><span>알림 설정</span>${icon('chevron')}</button><button class="settings-link" data-access="logout"><span>로그아웃</span>${icon('chevron')}</button></div>`);}
function notificationSettings(){
  const key=access.space,config=access.notification[key]||{chat:true,news:true};
  openModal(`${modalHeader('알림 설정')}<form id="notification-form" data-space="${esc(key)}"><div class="modal-body"><p class="intro">${esc(currentSpace().name)}</p><label class="switch-row"><span>새 메시지 알림</span><input type="checkbox" name="chat" ${config.chat?'checked':''}></label><label class="switch-row"><span>새 소식 알림</span><input type="checkbox" name="news" ${config.news?'checked':''}></label></div><div class="modal-foot"><button class="btn primary">저장</button></div></form>`);
}
function renderTeamManagement(){
  if(!canManageTeam()){state.view='profile';render();return;}
  const t=team(state.workspaceTeamId),members=access.members[t.id];
  document.querySelector('#main').innerHTML=`<div class="page management-page team-management"><header class="detail-topline"><button type="button" class="icon-btn" data-view="profile" aria-label="팀 프로필로">${icon('back')}</button><h1>팀 관리</h1></header><div class="management-summary"><div><strong>${t.supporters}</strong><span>후원 친구</span></div><div><strong>${members.filter(m=>m.status==='활동 중').length}</strong><span>운영 구성원</span></div></div>${teamCan('members')?`<section class="management-section"><div class="section-heading"><h2>구성원·권한</h2><button class="btn light" data-access="invite-member">구성원 초대</button></div><div class="member-list">${members.map(m=>`<div class="member-row">${avatar({name:m.name,short:m.name.slice(-2),color:m.id==='self'?'':'blue'},'sm')}<div class="member-copy"><strong>${esc(m.name)}${m.id==='self'?'<span class="self-tag">나</span>':''}</strong><p>${esc(m.role)} · ${esc(m.status)}</p><small>${m.permissions.map(p=>PERMISSION_LABELS[p]).join(' · ')}</small></div>${m.id==='self'?'<span class="status-pill">팀 관리자</span>':`<button class="btn" data-access="edit-member" data-id="${m.id}">관리</button>`}</div>`).join('')}</div></section>`:''}<section class="management-section"><h2>팀 설정</h2>${teamCan('profile')?`<button class="settings-link" data-action="edit-profile"><span><strong>팀 정보</strong><small>이름·프로필 사진·소개</small></span>${icon('chevron')}</button>`:''}<button class="settings-link" data-access="notification"><span><strong>알림</strong><small>이 팀의 새 메시지와 소식</small></span>${icon('chevron')}</button></section></div>`;
}
function memberDialog(id){
  if(!teamCan('members'))return;const m=access.members[state.workspaceTeamId].find(x=>x.id===id);if(!m||m.id==='self')return;
  openModal(`${modalHeader('구성원 권한')}<form id="member-form" data-id="${id}" data-team="${state.workspaceTeamId}"><div class="modal-body"><h3>${esc(m.name)}</h3><p class="intro">${esc(team(state.workspaceTeamId).name)}</p><label class="field"><span>역할 이름</span><input name="role" value="${esc(m.role)}" required maxlength="20"></label><div class="permission-list">${Object.entries(PERMISSION_LABELS).map(([p,label])=>`<label class="permission-option"><input type="checkbox" name="permission" value="${p}" ${m.permissions.includes(p)?'checked':''}><span>${label}</span></label>`).join('')}</div><label class="field"><span>상태</span><select name="status"><option ${m.status==='활동 중'?'selected':''}>활동 중</option><option ${m.status==='권한 회수'?'selected':''}>권한 회수</option></select></label></div><div class="modal-foot"><button type="button" class="btn" data-action="close-modal">취소</button><button class="btn primary">저장</button></div></form>`);
}
function inviteMember(){if(!teamCan('members'))return;openModal(`${modalHeader('구성원 초대')}<form id="invite-member-form" data-team="${state.workspaceTeamId}"><div class="modal-body"><p class="intro">${esc(team(state.workspaceTeamId).name)}</p><label class="field"><span>이름</span><input name="name" required maxlength="24" placeholder="초대할 구성원 이름"></label><label class="field"><span>역할</span><select name="role"><option value="member">팀 담당자 · 대화와 소식 발행</option><option value="materials">자료 담당자 · 대화와 자료 전달</option></select></label><p class="modal-note">초대 상태를 확인하는 화면 시안입니다. 실제 초대는 발송되지 않습니다.</p></div><div class="modal-foot"><button type="button" class="btn" data-action="close-modal">취소</button><button class="btn primary">초대 대기 상태 확인</button></div></form>`);}
function renderOperationsTeams(){
  const list=teams.filter(t=>access.operations?.teams.includes(t.id));document.querySelector('#main').innerHTML=`<div class="page management-page root-page ops-teams-page"><h1 class="visually-hidden">참여팀</h1><div class="desktop-screen-actions compact-count-row">${screenActionMarkup()}</div><div class="ops-team-list">${list.map(t=>{const rows=allowedSubmissions().filter(s=>s.team===t.id);return `<button class="ops-team-card" data-access="ops-team" data-id="${t.id}">${avatar(t,'big')}<div><h2>${esc(t.name)}</h2><p>${esc(t.category)} · 후원 친구 ${t.supporters}명</p><span>접수 ${rows.length}건 · 미완료 ${rows.filter(s=>s.status!=='완료').length}건</span></div>${icon('chevron')}</button>`;}).join('')}</div></div>`;
}
function renderOperationsAccess(){
  if(!inOperations()||!access.operations.manageAdmins){state.view='inbox';render();return;}
  document.querySelector('#main').innerHTML=`<div class="page management-page root-page ops-access-page"><h1 class="visually-hidden">관리자·권한 관리</h1><div class="desktop-screen-actions compact-count-row">${screenActionMarkup()}</div><div class="member-list">${access.operators.map(o=>`<div class="member-row">${avatar({name:o.name,short:o.name.slice(-2),color:'blue'},'sm')}<div class="member-copy"><strong>${esc(o.name)}${o.master?'<span class="self-tag">나</span>':''}</strong><p>${o.master?'전체 운영관리':o.scope.map(id=>team(id).name).join(' · ')} · ${o.status}</p></div>${o.master?'<span class="status-pill review">권한 관리 가능</span>':`<button class="btn" data-access="edit-operator" data-id="${o.id}">관리</button>`}</div>`).join('')}</div></div>`;
}
function operatorDialog(id){if(!inOperations()||!access.operations.manageAdmins)return;const o=access.operators.find(o=>o.id===id);if(!o||o.master)return;openModal(`${modalHeader('운영 담당 범위')}<form id="operator-form" data-id="${id}"><div class="modal-body"><h3>${esc(o.name)}</h3><p class="intro">배정한 팀의 운영 대화와 자료를 확인할 수 있습니다.</p>${teams.map(t=>`<label class="permission-option"><input type="checkbox" name="team" value="${t.id}" ${o.scope.includes(t.id)?'checked':''}><span>${esc(t.name)}</span></label>`).join('')}<label class="field"><span>상태</span><select name="status"><option ${o.status==='활동 중'?'selected':''}>활동 중</option><option ${o.status==='권한 회수'?'selected':''}>권한 회수</option></select></label></div><div class="modal-foot"><button type="button" class="btn" data-action="close-modal">취소</button><button class="btn primary">저장</button></div></form>`);}
function actionAllowed(action,button){
  if(action==='close-modal')return true;
  if(!access.signedIn)return false;
  if(['review','internal-note'].includes(action))return inOperations()&&canReadSubmission(button.dataset.id);
  if(action==='submission')return canReadSubmission(button.dataset.id);
  if(action==='broadcast')return state.role==='team'&&teamCan('broadcast');
  if(action==='compose-post')return state.role==='supporter'||state.role==='team'&&teamCan('publish');
  if(action==='edit-profile')return state.role==='supporter'||state.role==='team'&&teamCan('profile');
  if(action==='unpublish')return state.role==='team'&&teamCan('publish')&&posts.find(p=>p.id===button.dataset.id)?.team===state.workspaceTeamId;
  if(['person','friend-chat'].includes(action)&&state.role==='team'&&button.dataset.id?.startsWith('donor-'))return teamCan('donors');
  if(['profile-settings','add-friend','accept-friend','reject-friend'].includes(action))return state.role==='supporter';
  if(['attach','new-chat','new-group','share-to-room'].includes(action))return state.role!=='team'||teamCan('chat');
  return true;
}
function applyVisiblePermissions(){renderMobileContext();document.querySelectorAll('#main [data-action],#mobile-context [data-action]').forEach(b=>{if(!actionAllowed(b.dataset.action,b))b.hidden=true;});}
function enhanceChat(){
  applyVisiblePermissions();const room=activeRoom(),note=document.querySelector('.composer-note');
  if(note){note.className='composer-note sender-context';note.innerHTML=`${avatar(currentIdentity(),'sm')}<span><strong>${esc(room?.kind==='internal'?me.name+' · '+team(state.workspaceTeamId).short:currentIdentity().name)}</strong> 이름으로 전송</span>`;}
  const field=document.querySelector('#message-input');if(field){field.value=state.workspaceDrafts[access.space+':'+state.room]||'';}
  if(room?.kind==='internal'){
    const desc=document.querySelector('.chat-header .chat-identity p');if(desc)desc.textContent='내부 구성원 '+room.count+'명';
    const notice=document.querySelector('.chat-notice');if(notice)notice.innerHTML=`${icon('lock')}이 팀의 내부 구성원만 참여합니다.<button data-action="group-info">방 정보</button>`;
    const info=document.querySelector('.chat-info');if(info)info.innerHTML=`<div class="info-profile">${avatar(room.peer,'big')}<h3>${esc(room.title)}</h3><p>내부 구성원만 참여합니다.</p></div>${access.members[state.workspaceTeamId].filter(m=>m.status==='활동 중').map(m=>`<div class="internal-member"><strong>${esc(m.name)}</strong><span>${esc(m.role)}</span></div>`).join('')}`;
  }
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-access]');
  if(b){e.preventDefault();e.stopImmediatePropagation();const action=b.dataset.access,id=b.dataset.id;
    if(action==='preview-settings')previewSettings();
    else if(action==='open-space')openWorkspaceMenu();
    else if(action==='close-space')closeWorkspaceMenu();
    else if(action==='select-space')switchWorkspace(b.dataset.space);
    else if(action==='login')previewLogin();
    else if(action==='show-login'||action==='logout'){preserveDraft();closeModal();closeWorkspaceMenu();access.signedIn=false;renderLogin();}
    else if(action==='scenario'){useScenario(id);closeModal();if(access.signedIn){switchWorkspace('personal');toast('선택한 권한 구성으로 화면을 확인합니다.');}else renderLogin();}
    else if(action==='revoke-current'){const key=access.space;if(key.startsWith('team:'))access.memberships=access.memberships.filter(m=>m.teamId!==state.workspaceTeamId);else if(key==='operations')access.operations=null;closeModal();reconcilePermissions();render();toast('접근 권한이 변경되어 개인 공간으로 돌아왔습니다.');}
    else if(action==='account-settings')accountSettings();
    else if(action==='personal-profile'){switchWorkspace('personal');state.view='profile';render();editProfile();}
    else if(action==='notification')notificationSettings();
    else if(action==='team-manage'){if(canManageTeam()){state.view='team-manage';render();}}
    else if(action==='edit-member')memberDialog(id);
    else if(action==='invite-member')inviteMember();
    else if(action==='edit-operator')operatorDialog(id);
    else if(action==='ops-team'){const s=allowedSubmissions().find(s=>s.team===id);if(s)openRoom(s.room);}
    return;
  }
  const original=e.target.closest('[data-action]');if(original&&!actionAllowed(original.dataset.action,original)){e.preventDefault();e.stopImmediatePropagation();toast('이 기능을 이용할 권한이 없습니다.');return;}
  const view=e.target.closest('[data-view]');if(view&&!allowedView(view.dataset.view)){e.preventDefault();e.stopImmediatePropagation();toast('이 메뉴를 이용할 권한이 없습니다.');}
},true);
document.addEventListener('submit',e=>{
  const f=e.target,data=new FormData(f);
  const localForms=['member-form','invite-member-form','notification-form','operator-form'];
  if(localForms.includes(f.id)){
    e.preventDefault();e.stopImmediatePropagation();if(!access.signedIn)return;
    if(f.id==='member-form'&&teamCan('members',f.dataset.team)){
      const m=access.members[f.dataset.team].find(m=>m.id===f.dataset.id);if(!m||m.id==='self')return;
      m.role=String(data.get('role')).trim();m.status=String(data.get('status'));m.permissions=m.status==='권한 회수'?[]:data.getAll('permission').filter(p=>ALL_TEAM_PERMISSIONS.includes(p));closeModal();render();toast('구성원 권한을 미리보기에 반영했습니다.');
    } else if(f.id==='invite-member-form'&&teamCan('members',f.dataset.team)){
      access.members[f.dataset.team].push({id:'invited-'+Date.now(),name:String(data.get('name')).trim(),role:data.get('role')==='materials'?'자료 담당자':'팀 담당자',permissions:data.get('role')==='materials'?['chat']:['chat','publish'],status:'초대 대기'});closeModal();render();toast('초대 대기 상태를 미리보기에 추가했습니다.');
    } else if(f.id==='notification-form'){
      access.notification[f.dataset.space]={chat:data.has('chat'),news:data.has('news')};closeModal();toast('이 공간의 알림 설정을 저장했습니다.');
    } else if(f.id==='operator-form'&&inOperations()&&access.operations.manageAdmins){
      const o=access.operators.find(o=>o.id===f.dataset.id);if(!o||o.master)return;o.status=String(data.get('status'));o.scope=o.status==='권한 회수'?[]:data.getAll('team').filter(id=>teams.some(t=>t.id===id));closeModal();render();toast('운영 담당 범위를 미리보기에 반영했습니다.');
    }return;
  }
  const permission=f.id==='post-form'?'publish':f.id==='broadcast-form'?'broadcast':f.id==='profile-form'?'profile':f.id==='chat-form'||f.id==='group-form'?'chat':null;
  if(!access.signedIn||permission&&state.role==='team'&&!teamCan(permission)||['review-form','note-form'].includes(f.id)&&(!inOperations()||!canReadSubmission(f.dataset.id))){e.preventDefault();e.stopImmediatePropagation();toast('이 작업을 처리할 권한이 없습니다.');}
},true);
document.querySelector('#space-menu').addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeWorkspaceMenu();}});
document.querySelector('#space-menu').addEventListener('close',()=>document.querySelectorAll('.workspace-trigger').forEach(b=>b.setAttribute('aria-expanded','false')));
const originalRenderChat=renderChat;
renderChat=function(){originalRenderChat();enhanceChat();};
const originalRenderNews=renderNews;
renderNews=function(){originalRenderNews();applyVisiblePermissions();};
const originalRenderProfile=renderProfile;
renderProfile=function(){originalRenderProfile();applyVisiblePermissions();};
const originalRenderTeamPage=renderTeamPage;
renderTeamPage=function(own=false){originalRenderTeamPage(own);applyVisiblePermissions();};
const originalRenderFriends=renderFriends;
renderFriends=function(){originalRenderFriends();applyVisiblePermissions();};
const originalRoomInfo=roomInfo;
roomInfo=function(){const r=activeRoom();if(r.kind!=='internal'){originalRoomInfo();return;}openModal(`${modalHeader('내부 대화방')}<div class="modal-body"><h3>${esc(r.title)}</h3><p class="intro">${esc(team(state.workspaceTeamId).name)}의 내부 구성원만 참여합니다.</p>${access.members[state.workspaceTeamId].filter(m=>m.status==='활동 중').map(m=>`<div class="internal-member"><strong>${esc(m.name)}</strong><span>${esc(m.role)}</span></div>`).join('')}</div>`);};
function initializeAccessUI(){useScenario('owner');renderLogin();registerAppTools();}
initializeAccessUI();
