// Open the existing MVP at the selected service screen for the introduction.
function introScreen(config){
 useScenario('owner');access.signedIn=true;document.body.classList.remove('signed-out');document.querySelector('#login-surface').hidden=true;
 const space=config.role==='team'?'team:haebom':config.role==='admin'?'operations':'personal';
 switchWorkspace(space,{remember:false});
 const view=config.view||(config.role==='admin'?'submissions':'news');
 if(allowedView(view)){navigate(view);if(view==='chats'&&config.open==='true')openRoom(state.room);}
}
const introParams=Object.fromEntries(new URLSearchParams(location.search));
if(introParams.intro==='1'){
 if(window.parent!==window)document.documentElement.classList.add('intro-embed');
 introScreen(introParams);
}
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='modua-screen')return;introScreen(e.data);});
