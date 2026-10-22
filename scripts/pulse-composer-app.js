/* Canonical editor source; embedded in pulse-studio.html by sync-pulse-studio.mjs. */
(() => {
  'use strict';
  const C = globalThis.PulseComposerCore, A = globalThis.PulseAudioEngine;
  const $ = id => document.getElementById(id);
  const KEY = 'miniPulseComposerV1', SHELF = 'miniPulseComposerShelfV1';
  const names = ['底鼓', '军鼓', '踩镲', '低音', '和弦', '主奏'];
  const colors = ['#e997c6', '#7adbd5', '#efcc78', '#a9d391', '#b5a3ec', '#efaa88'];
  const letters = ['A', 'B', 'C', 'D'];
  let project = C.createProject(), current = 0, selected = {track:0,step:0};
  let undo = [], redo = [], cells = [], trackControls = [], exporting = false;
  let lastExport = null, lastPlayback = null, mode = 'composer', starting = false, scope = null, playbackToken = 0;
  let shelf = [null, null, null], saveWarning = '', bootWarning = '';
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) project = C.sanitize(JSON.parse(raw));
  } catch { bootWarning = '无法读取草稿，已打开起始乐段。原损坏草稿未被覆盖；请先导出作品备份。'; }
  try {
    const stored = JSON.parse(localStorage.getItem(SHELF) || 'null');
    if (Array.isArray(stored)) shelf = Array.from({length:3}, (_,i) => {
      try { return stored[i] ? C.sanitize(stored[i]) : null; } catch { return null; }
    });
  } catch { /* The three explicit saves remain optional when storage is blocked. */ }
  const clone = value => JSON.parse(JSON.stringify(value));
  function message(text) { $('cMessage').textContent = text; }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(project)); saveWarning = ''; }
    catch { saveWarning = '浏览器无法保存，请导出工程码备份；本局仍可继续。'; }
    $('cSaveState').textContent = saveWarning || '草稿已自动保存 · 仅当前浏览器';
  }
  function clearPlayhead() {
    for (const row of cells) for (const cell of row) cell.classList.remove('now');
    for (const item of $('cOrder').children) item.classList.remove('playing');
  }
  const player = A.createPlayer({
    onStep(info) {
      clearPlayhead();
      if (info.pattern === current) for (const row of cells) row[info.step].classList.add('now');
      // A compiled bar can be repeated inside one arrangement entry.
      let offset = 0;
      const index = project.order.findIndex(item => { offset += item.repeats; return info.bar < offset; });
      if (scope === 'song' && index >= 0) $('cOrder').children[index]?.classList.add('playing');
    },
    onState(state) {
      if (state.state === 'stopped') { starting = false; scope = null; clearPlayhead(); }
      updateTransport();
    },
    onError(error) { starting = false; scope = null; message('试听已停止：' + (error.message || error)); updateTransport(); }
  });
  function stop(reason) {
    playbackToken++;
    player.stop(); starting = false; scope = null; clearPlayhead(); updateTransport();
    if (reason) message(reason);
  }
  function updateTransport() {
    const running = starting || player.status().state === 'playing';
    $('cStop').disabled = !running;
    $('cPlayPattern').setAttribute('aria-pressed', String(running && scope === 'pattern'));
    $('cPlaySong').setAttribute('aria-pressed', String(running && scope === 'song'));
    $('cPlayPattern').textContent = running && scope === 'pattern' ? '■ 停止乐段' : '▶ 试听乐段';
    $('cPlaySong').textContent = running && scope === 'song' ? '■ 停止整曲' : '▶ 试听整曲';
  }
  function change(mutator, text) {
    try {
      const next = clone(project); mutator(next); const clean = C.sanitize(next);
      if (JSON.stringify(clean) === JSON.stringify(project)) return;
      const wasPlaying = starting || player.status().state === 'playing';
      stop(); undo.push(clone(project)); if (undo.length > 60) undo.shift(); redo = [];
      project = clean; persist(); draw();
      message((text || '已修改。') + (wasPlaying ? ' 编辑后已停止试听，再播放会使用最新作品。' : ''));
    } catch (error) { draw(); message(error.message); }
  }
  function replace(next, text) {
    const clean = C.sanitize(next); stop(); undo.push(clone(project)); if (undo.length > 60) undo.shift();
    redo = []; project = clean; current = 0; selected = {track:0,step:0}; persist(); draw(); message(text);
  }
  function history(back) {
    const source = back ? undo : redo, target = back ? redo : undo;
    if (!source.length) return;
    stop(); target.push(clone(project)); project = source.pop(); persist(); draw();
    message(back ? '已撤销，包括音高、编排和配置。' : '已重做。');
  }
  function noteName(midi) { return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((midi%12)+12)%12] + (Math.floor(midi/12)-1); }
  function pitch(track, degree) {
    const scale = project.scale === 'major' ? [0,2,4,5,7,9,11,12] : [0,2,3,5,7,8,10,12];
    return project.root + (track === 3 ? -12 : track === 5 ? 12 : 0) + scale[degree];
  }
  function initGrid() {
    const grid = $('cSeq'), header = document.createElement('div'); header.className = 'c-grid-row';
    header.append(document.createElement('span'));
    for (let i=0;i<16;i++) { const cell = document.createElement('span'); cell.className = 'c-grid-head'; cell.textContent = i%4===0 ? String(i/4+1)+'.1' : String(i%4+1); header.append(cell); }
    grid.append(header);
    for (let r=0;r<6;r++) {
      const row = document.createElement('div'); row.className = 'c-grid-row';
      const label = document.createElement('div'); label.className = 'c-track';
      const title = document.createElement('b'); title.textContent = names[r]; label.append(title);
      const gain = document.createElement('input'); gain.type = 'range'; gain.min = '0'; gain.max = '100'; gain.step = '1'; gain.setAttribute('aria-label', names[r]+'音量');
      gain.onchange = () => change(p => { p.tracks[r].gain = Number(gain.value)/100; }, names[r]+'音量已修改。'); label.append(gain);
      const mute = document.createElement('button'); mute.type='button'; mute.textContent='M'; mute.setAttribute('aria-label', names[r]+'静音');
      mute.onclick=()=>change(p=>{p.tracks[r].mute=!p.tracks[r].mute;}, names[r]+(project.tracks[r].mute?'取消静音。':'已静音。')); label.append(mute);
      const solo = document.createElement('button'); solo.type='button'; solo.textContent='S'; solo.setAttribute('aria-label', names[r]+'独奏');
      solo.onclick=()=>change(p=>{p.tracks[r].solo=!p.tracks[r].solo;}, names[r]+(project.tracks[r].solo?'取消独奏。':'已独奏。')); label.append(solo);
      row.append(label); trackControls.push({gain,mute,solo}); const rowCells=[];
      for(let i=0;i<16;i++) {
        const cell=document.createElement('button'); cell.type='button'; cell.style.setProperty('--track',colors[r]); cell.dataset.track=r;cell.dataset.step=i;
        const dot=document.createElement('span'); dot.className='c-dot'; const caption=document.createElement('span'); cell.append(dot,caption);
        cell.onclick=()=>{selected={track:r,step:i};change(p=>{p.patterns[current].steps[r][i]=(p.patterns[current].steps[r][i]+1)%4;},'已修改'+names[r]+'第'+(i+1)+'格。');drawSelection();};
        cell.onkeydown=event=>{
          const delta={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]}[event.key];
          if(!delta)return;event.preventDefault();selected={track:Math.max(0,Math.min(5,r+delta[0])),step:(i+delta[1]+16)%16};drawSelection();cells[selected.track][selected.step].focus();
        };
        rowCells.push(cell);row.append(cell);
      }
      cells.push(rowCells);grid.append(row);
    }
  }
  function drawSelection() {
    const {track:r,step:i}=selected, section=project.patterns[current];
    for(let t=0;t<6;t++)for(let n=0;n<16;n++)cells[t][n].classList.toggle('selected',t===r&&n===i);
    $('cSelected').textContent=names[r]+' · 第 '+(i+1)+' 格';$('cVelocity').value=section.steps[r][i];
    $('cDegree').replaceChildren(...Array.from({length:8},(_,d)=>{const o=document.createElement('option');o.value=d;o.textContent=(d+1)+'级 · '+noteName(pitch(r,d));return o;}));
    $('cDegree').value=section.notes[r][i];$('cDegree').disabled=r<3;
  }
  function drawOrder() {
    const list=$('cOrder');list.replaceChildren();
    project.order.forEach((item,index)=>{
      const li=document.createElement('li'),label=document.createElement('label');label.textContent='段落 '+(index+1);li.append(label);
      const pat=document.createElement('select');pat.setAttribute('aria-label','段落'+(index+1)+'乐段');
      project.patterns.forEach((p,i)=>{const o=document.createElement('option');o.value=i;o.textContent=letters[i]+' · '+p.name;pat.append(o);});pat.value=item.pattern;
      pat.onchange=()=>change(p=>{p.order[index].pattern=Number(pat.value);},'已修改段落引用。');li.append(pat);
      const repeats=document.createElement('select');repeats.setAttribute('aria-label','段落'+(index+1)+'重复次数');
      for(let n=1;n<=4;n++){const o=document.createElement('option');o.value=n;o.textContent='重复 '+n+' 小节';repeats.append(o);}repeats.value=item.repeats;
      repeats.onchange=()=>change(p=>{p.order[index].repeats=Number(repeats.value);},'已修改段落长度。');li.append(repeats);
      const row=document.createElement('div');row.className='row';
      for(const [title,text,delta]of [['前移','←',-1],['后移','→',1],['删除','×',0]]){
        const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=text;b.setAttribute('aria-label',title+'段落'+(index+1));
        b.disabled=delta<0?index===0:delta>0?index===project.order.length-1:project.order.length===1;
        b.onclick=()=>change(p=>{if(delta){[p.order[index],p.order[index+delta]]=[p.order[index+delta],p.order[index]];}else p.order.splice(index,1);},'歌曲编排已修改。');row.append(b);
      }
      li.append(row);list.append(li);
    });
  }
  function draw() {
    $('cTitle').value=project.title;$('cPatternName').value=project.patterns[current].name;
    $('cBpm').value=project.bpm;$('cSwing').value=Math.round(project.swing*100);$('cSwingText').textContent=Math.round(project.swing*100)+'%';
    $('cKit').value=project.kit;$('cScale').value=project.scale;
    // Imported projects can use any legal chromatic root, not only the quick choices.
    for(const option of [...$('cRoot').options])if(option.dataset.imported)option.remove();
    if(![...$('cRoot').options].some(o=>Number(o.value)===project.root)){const o=document.createElement('option');o.value=project.root;o.textContent=noteName(project.root);o.dataset.imported='true';$('cRoot').append(o);}
    $('cRoot').value=project.root;$('cVolume').value=Math.round(project.volume*100);$('cVolumeText').textContent=Math.round(project.volume*100)+'%';
    $('cPatterns').replaceChildren(...project.patterns.map((p,i)=>{
      const b=document.createElement('button');b.type='button';b.className='c-pattern'+(i===current?' active':'');b.dataset.pattern=i;b.setAttribute('aria-pressed',String(i===current));
      const title=document.createElement('b');title.textContent=letters[i]+' · '+p.name;const sub=document.createElement('small');sub.textContent=p.steps.flat().filter(Boolean).length+' 个音符';b.append(title,sub);
      b.onclick=()=>{stop();current=i;draw();$('cPatterns').children[i].focus({preventScroll:true});message('正在编辑 '+letters[i]+' 段。切换已停止试听；修改会同步到所有引用。');};return b;
    }));
    const pattern=project.patterns[current];
    for(let r=0;r<6;r++){
      const track=project.tracks[r],control=trackControls[r];control.gain.value=Math.round(track.gain*100);control.mute.classList.toggle('active',track.mute);control.solo.classList.toggle('active',track.solo);control.mute.setAttribute('aria-pressed',String(track.mute));control.solo.setAttribute('aria-pressed',String(track.solo));
      for(let i=0;i<16;i++){const v=pattern.steps[r][i],cell=cells[r][i];cell.className='c-step level-'+v+(i%4===0?' bar':'');cell.lastChild.textContent=v?(r>=3?noteName(pitch(r,pattern.notes[r][i])):['','轻','正','重'][v]):'·';cell.setAttribute('aria-label',names[r]+' 第'+(i+1)+'格 力度'+v+(r>=3?' 音高'+noteName(pitch(r,pattern.notes[r][i])):''));}
    }
    drawSelection();drawOrder();const timeline=C.compile(project),bars=project.order.reduce((n,p)=>n+p.repeats,0);
    $('cTotals').textContent=bars+' 小节 · '+timeline.duration.toFixed(1)+' 秒 · 最多 32 小节 / 180 秒';
    const used=project.patterns.filter(p=>p.steps.some(row=>row.some(Boolean))).length;
    $('cSummary').textContent=used+' 个有音符的乐段 · '+project.order.length+' 个编排条目。'+(project.tracks.some(t=>t.solo)?'当前有独奏轨道，其余轨道不发声。':'音符数不代表作品质量，听见你的取舍才是重点。');
    $('cMeter').replaceChildren(...Array.from({length:16},(_,i)=>{const bar=document.createElement('i');bar.style.height=(3+pattern.steps.reduce((n,row)=>n+row[i],0)*2.6)+'px';return bar;}));
    $('cUndo').disabled=!undo.length;$('cRedo').disabled=!redo.length;$('cAppend').disabled=project.order.length>=16||bars>=32;
    for(let i=0;i<3;i++)$('cShelf').options[i].textContent='作品架 '+(i+1)+(shelf[i]?' · '+shelf[i].title:' · 空');
    updateTransport();
  }
  async function play(kind) {
    if((starting||player.status().state==='playing')&&scope===kind){stop('已停止试听。');return;}
    stop(); scope=kind;starting=true;updateTransport();
    const token=++playbackToken;
    try { const snapshot=C.sanitize(project),timeline=C.compile(snapshot,kind==='pattern'?{pattern:current}:{});lastPlayback={projectCode:C.encode(snapshot),scope:kind,events:timeline.steps.reduce((n,s)=>n+s.events.length,0)};
      await player.start(timeline,{loop:$('cLoop').checked,volume:snapshot.volume});if(token!==playbackToken)return;starting=false;updateTransport();
      if(player.status().state==='playing')message(kind==='pattern'?'正在试听当前乐段。编辑会停止试听。':'正在试听整曲编排。白框跟随音频时钟，切到后台会停止。');
    } catch(error) { if(token!==playbackToken)return;starting=false;scope=null;message('无法播放：'+error.message);updateTransport(); }
  }
  function download(blob,name) { const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000); }
  function filename(){return (project.title||'pulse-song').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,64);}
  async function exportWav() {
    if(exporting)return;exporting=true;$('cWav').disabled=true;stop();
    const snapshot=C.sanitize(project),timeline=C.compile(snapshot),code=C.encode(snapshot),file=filename();
    message('正在本地渲染 '+timeline.duration.toFixed(1)+' 秒作品；导出使用此刻快照。');
    try {
      const buffer=await A.render(timeline,{volume:snapshot.volume,sampleRate:44100,tail:.6});
      const wav=C.pcmWav([buffer.getChannelData(0)],buffer.sampleRate);
      lastExport={projectCode:code,musicalDuration:timeline.duration,duration:buffer.duration,frames:buffer.length,sampleRate:buffer.sampleRate,peak:wav.peak,gain:wav.gain,bytes:wav.bytes.length,events:timeline.steps.reduce((n,s)=>n+s.events.length,0)};
      download(new Blob([wav.bytes],{type:'audio/wav'}),file+'.wav');
      message('WAV 已导出 · 单声道 44.1kHz / PCM16 · '+buffer.duration.toFixed(1)+' 秒'+(wav.gain<1?' · 已整体衰减防削波。':wav.peak===0?' · 当前作品为静音。':'。'));
    } catch(error) { message('导出失败，工程保持不变：'+error.message+'。可先下载工程码备份。'); }
    finally {exporting=false;$('cWav').disabled=false;}
  }
  function openProject() {stop();$('cProjectModal').classList.remove('hidden');$('cProjectText').value=C.encode(project);$('cProjectFeedback').textContent='工程只在本地生成；工程码不是加密数据。';$('cProjectClose').focus();}
  function closeProject() {$('cProjectModal').classList.add('hidden');$('cProject').focus();}
  function parseProject(text){const clean=text.trim();if(clean.startsWith('PULSE2.'))return C.fromLegacy(clean);if(clean.startsWith('{'))return C.sanitize(JSON.parse(clean));return C.decode(clean);}
  function switchMode(next){stop();globalThis.__pulseStudio?.stop?.();mode=next;$('composerApp').hidden=next!=='composer';$('legacyApp').hidden=next!=='practice';$('composerModeBtn').classList.toggle('active',next==='composer');$('practiceModeBtn').classList.toggle('active',next==='practice');}
  $('composerModeBtn').onclick=()=>switchMode('composer');$('practiceModeBtn').onclick=()=>switchMode('practice');
  $('cPlayPattern').onclick=()=>play('pattern');$('cPlaySong').onclick=()=>play('song');$('cStop').onclick=()=>stop('已停止试听。');
  $('cUndo').onclick=()=>history(true);$('cRedo').onclick=()=>history(false);
  $('cTitle').onchange=()=>change(p=>{p.title=$('cTitle').value;},'作品已改名。');$('cPatternName').onchange=()=>change(p=>{p.patterns[current].name=$('cPatternName').value;},'乐段已改名。');
  for(const [id,key]of [['cBpm','bpm'],['cKit','kit'],['cRoot','root']])$(id).onchange=()=>{change(p=>{p[key]=Number($(id).value);},'设置已更新。');draw();};
  $('cSwing').oninput=()=>{$('cSwingText').textContent=$('cSwing').value+'%';};$('cSwing').onchange=()=>change(p=>{p.swing=Number($('cSwing').value)/100;},'Swing 已修改，成对细分总时长不变。');
  $('cScale').onchange=()=>change(p=>{p.scale=$('cScale').value;},'音阶已修改。');$('cVolume').oninput=()=>{$('cVolumeText').textContent=$('cVolume').value+'%';};$('cVolume').onchange=()=>change(p=>{p.volume=Number($('cVolume').value)/100;},'总音量已修改。');
  $('cVelocity').onchange=()=>change(p=>{p.patterns[current].steps[selected.track][selected.step]=Number($('cVelocity').value);},'音符力度已修改。');
  $('cDegree').onchange=()=>change(p=>{p.patterns[current].notes[selected.track][selected.step]=Number($('cDegree').value);},'旋律音级已修改。');
  $('cEraseNote').onclick=()=>change(p=>{p.patterns[current].steps[selected.track][selected.step]=0;},'已清除此格。');
  $('cShiftLeft').onclick=()=>change(p=>Object.assign(p,C.transform(p,current,'left',0)),'当前乐段循环左移一格。');$('cShiftRight').onclick=()=>change(p=>Object.assign(p,C.transform(p,current,'right',0)),'当前乐段循环右移一格。');
  $('cVariation').onclick=()=>{const seed=Number($('cSeed').value);if(!Number.isInteger(seed)||seed<0||seed>4294967295){message('变奏种子需要 0–4294967295 的整数。');return;}change(p=>Object.assign(p,C.transform(p,current,'variation',seed)),'已做种子 '+seed+' 的变奏；只影响当前段，可撤销。');};
  $('cCopy').onclick=()=>{const target=Number($('cCopyTarget').value);if(target===current){message('请选择另一个目标乐段。');return;}if(project.patterns[target].steps.some(row=>row.some(Boolean))&&!confirm('覆盖 '+letters[target]+' 段现有音符？之后可以撤销。'))return;change(p=>{const name=p.patterns[target].name;p.patterns[target]=clone(p.patterns[current]);p.patterns[target].name=name;},'已深拷贝到 '+letters[target]+' 段，后续可分别编辑。');};
  $('cClear').onclick=()=>{if(confirm('清空当前乐段？可以撤销，其他乐段不变。'))change(p=>{p.patterns[current].steps=C.blank().patterns[0].steps;},'当前乐段已清空。');};
  $('cAppend').onclick=()=>change(p=>{p.order.push({pattern:current,repeats:1});},'已将当前段加入歌曲末尾。');$('cLoop').onchange=()=>stop('循环选项已修改，重新播放后生效。');
  $('cShelfSave').onclick=()=>{const i=Number($('cShelf').value);if(shelf[i]&&!confirm('覆盖作品架 '+(i+1)+' 的“'+shelf[i].title+'”？'))return;const next=shelf.map(p=>p?clone(p):null);next[i]=C.sanitize(project);try{localStorage.setItem(SHELF,JSON.stringify(next));shelf=next;draw();message('完整工程已保存到作品架 '+(i+1)+'。');}catch{message('作品架写入失败；当前草稿未改变，请导出工程码。');}};
  $('cShelfLoad').onclick=()=>{const item=shelf[Number($('cShelf').value)];if(!item){message('这个作品架为空。');return;}replace(item,'完整工程已载入；可以撤销恢复之前作品。');};
  $('cNew').onclick=()=>{if(confirm('新建空白作品？当前工程可撤销恢复，也建议先下载备份。'))replace(C.blank(),'已新建空白作品。');};
  $('cProject').onclick=openProject;$('cProjectClose').onclick=closeProject;
  $('cProjectCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('cProjectText').value);$('cProjectFeedback').textContent='已复制当前文本。';}catch{$('cProjectText').select();$('cProjectFeedback').textContent='剪贴板不可用，请手动复制选中的工程码。';}};
  $('cProjectDownload').onclick=()=>download(new Blob([C.encode(project)],{type:'text/plain;charset=utf-8'}),filename()+'.pulse.txt');
  $('cProjectImport').onclick=()=>{try{const text=$('cProjectText').value;if(text.length>100000)throw Error('工程文件过大');const next=parseProject(text);replace(next,text.trim().startsWith('PULSE2.')?'旧作品槽已迁移到 A–C，旧档未记录速度，按 112 BPM 恢复。':'工程验证成功，完整设置已恢复；可以撤销。');$('cProjectFeedback').textContent='导入成功。';}catch(error){$('cProjectFeedback').textContent='导入被拒绝，原工程未改变：'+error.message;}};
  $('cProjectFile').onchange=async()=>{const file=$('cProjectFile').files?.[0];if(!file)return;try{if(file.size>100000)throw Error('工程文件超过 100KB');$('cProjectText').value=await file.text();$('cProjectFeedback').textContent='文件已读取，点击“验证并导入”才会替换。';}catch(error){$('cProjectFeedback').textContent=error.message;}finally{$('cProjectFile').value='';}};
  $('cLegacyImport').onclick=()=>{try{replace(C.fromLegacy(globalThis.__pulseStudio.encode()),'已读取巡演三个作品槽至 A–C；原巡演不变，BPM 采用 112。');}catch(error){message('旧作品无法迁移：'+error.message);}};
  $('cWav').onclick=exportWav;
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop('页面转入后台，试听已停止，草稿保持不变。');globalThis.__pulseStudio?.stop?.();}});
  window.addEventListener('blur',()=>{stop();globalThis.__pulseStudio?.stop?.();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&mode==='composer'){event.preventDefault();if(!$('cProjectModal').classList.contains('hidden'))closeProject();else stop('已停止试听。');return;}
    if(mode!=='composer'||!$('cProjectModal').classList.contains('hidden')||/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target.tagName))return;
    if(event.code==='Space'&&!event.repeat){event.preventDefault();play('pattern');}
  });
  $('cProjectModal').addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;const list=[...$('cProjectModal').querySelectorAll('button,input,textarea')].filter(n=>!n.disabled),first=list[0],last=list.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  globalThis.__pulseComposer={state:()=>C.sanitize(project),current:()=>current,selected:()=>({...selected}),transport:()=>player.status(),lastExport:()=>lastExport,lastPlayback:()=>lastPlayback,mode:()=>mode};
  initGrid();draw();$('cSaveState').textContent=bootWarning?'草稿未覆盖 · 请先备份': '自动保存到当前浏览器 · 编辑后保存';if(bootWarning)message(bootWarning);
})();
