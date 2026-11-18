"use strict";

// Modern controls only. Domain validation and timing remain in final-appeals.js.
(function (root) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const format = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  let opened = false;
  function open({state, language, onSave, getSettings, getElapsed, listIndex = 0}) {
    if (opened) return;
    opened = true;
    const text = (ru, en) => language === "en" ? en : ru;
    const api = root.FDVFinalAppeals, previousFocus = document.activeElement;
    const currentState = () => ({...state, draftSettings:getSettings ? getSettings() : state.draftSettings, elapsed:getElapsed ? getElapsed() : state.elapsedBeforePause});
    const classic = api.isClassic(state);
    const clone = plan => ({...plan, entries:plan.entries.map(entry => ({...entry}))});
    let blocks = api.plans(state).map(clone), editor = null, busy = false;
    const newBlock = () => ({id:`ar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`,afterCycle:api.anchor(currentState(),getElapsed?.()),entries:[],completed:false,solo:false,placement:"flow",listIndex});
    if (!blocks.length) editor = newBlock();
    if (!document.getElementById("finalAppealStyles")) {
      const style = document.createElement("style"); style.id = "finalAppealStyles";
      style.textContent = `
        .final-appeal-overlay{position:fixed;inset:0;z-index:10000;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px}
        .final-appeal-dialog{--ar-height:36px;background:var(--panel,#181e27);color:var(--text,#e9eef5);border:1px solid #525e70;border-radius:12px;width:min(100%,1000px);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 16px 70px #0008}
        .final-appeal-head{padding:16px;display:flex;gap:12px;align-items:center}.final-appeal-dialog h2{font-size:1.25rem;margin:0}.final-appeal-close{margin-left:auto}
        .final-appeal-help{margin:0 16px 12px;color:var(--muted,#a8b1bf);line-height:1.45;font-size:.9rem}.final-appeal-body{overflow:auto;padding:0 16px 16px;overscroll-behavior:contain}
        .final-appeal-block{border:1px solid #465266;border-radius:8px;margin:0 0 14px;padding:12px}.final-appeal-block-head{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:10px}
        .final-appeal-block-head>strong{height:var(--ar-height);display:flex;align-items:center}.final-appeal-options{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;align-items:center}.final-appeal-options>label:first-child{display:flex;flex-direction:row;align-items:center;gap:8px;min-height:36px}.final-appeal-options>label:first-child input{width:20px;height:20px;margin:0;accent-color:var(--cyan,#49c6e5)}.final-appeal-options>.final-appeal-after{flex:1;min-width:280px}.final-appeal-options{align-items:flex-end}.final-appeal-options small{flex-basis:100%;color:var(--muted,#a8b1bf)}.final-appeal-dialog select{box-sizing:border-box;min-height:36px;max-width:100%;background:var(--panel,#181e27);color:inherit;border:1px solid #525e70;border-radius:5px;font:inherit;padding:5px}.final-appeal-after{display:flex;flex-direction:column;gap:5px;margin:0}
        .final-appeal-dialog button{box-sizing:border-box;min-height:var(--ar-height);padding:5px 12px;font:inherit}.final-appeal-block-head>button{height:var(--ar-height)}
        .final-appeal-dialog input[type=number]{box-sizing:border-box;height:var(--ar-height);width:90px;padding:5px 7px;font:inherit;appearance:auto}.final-appeal-dialog input[type=number]::-webkit-inner-spin-button{opacity:1}
        .final-appeal-options+.final-appeal-scroll{max-height:max(120px,min(40vh,calc(92vh - 410px)))}.final-appeal-scroll{overflow:auto;max-height:45vh}.final-appeal-table{border-collapse:collapse;width:100%;font-size:.9rem}.final-appeal-table th{position:sticky;top:0;background:var(--panel,#181e27);z-index:1}
        .final-appeal-table th,.final-appeal-table td{border-bottom:1px solid #384253;padding:7px 6px;text-align:center;white-space:nowrap}.final-appeal-table td:first-child,.final-appeal-table th:first-child{text-align:left;min-width:180px;white-space:normal}
        .final-appeal-table input[type=checkbox]{width:20px;height:20px;margin:0;vertical-align:middle;accent-color:var(--cyan,#49c6e5)}.final-appeal-table input[type=number]{width:66px;text-align:center}
        .final-appeal-time{display:inline-flex;align-items:center;gap:5px}.final-appeal-table small,.final-appeal-summary-status{display:block;color:var(--muted,#a8b1bf)}
        .final-appeal-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}.final-appeal-error{color:var(--red,#f05a59);flex:1;min-width:180px}.final-appeal-error:empty{display:none}
        .final-appeal-selected{background:#26d07c12}.final-appeal-dialog input:disabled{opacity:.35}.final-appeal-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .final-appeal-summary-info{flex:1;min-width:180px;line-height:1.5}.final-appeal-summary-info strong{display:block}.final-appeal-summary-buttons{display:flex;gap:8px}
      `;
      document.head.append(style);
    }
    const overlay = document.createElement("div"); overlay.className = "final-appeal-overlay";
    overlay.innerHTML = `<section class="final-appeal-dialog" role="dialog" aria-modal="true" aria-labelledby="finalAppealTitle"><div class="final-appeal-head"><h2 id="finalAppealTitle">${text("Дополнительные ротации","Additional rotations")}</h2><button type="button" data-ar-close class="final-appeal-close">${text("Закрыть","Close")}</button></div><p class="final-appeal-help">${text("Общий таймер — максимальное назначенное время. Все спортсмены заканчивают одновременно; спортсмен с меньшим временем начинает позже. Стартовые сигналы включаются судьёй вручную. Сохранение и отмена относятся к отдельной допротации.","The common timer uses the longest assigned time. All athletes finish together; shorter attempts start later. The judge enables start signals manually. Save and Cancel apply to an individual rotation.")}</p><div class="final-appeal-body" data-ar-body></div></section>`;
    if (classic) overlay.querySelector(".final-appeal-help").textContent = text("Без одиночного выхода сохраняется обычное время ротации. Спортсмен начинает, когда на таймере остаётся назначенное ему время; остальные продолжают по потоку. Для одиночной попытки поток останавливается и таймер показывает её время. Стартовые сигналы включаются судьёй вручную.","Shared-flow attempts preserve the regular rotation time. The athlete starts when their awarded time remains; other athletes continue in the flow. An exclusive attempt stops the flow and uses its own time. The judge enables start signals manually.");
    document.body.append(overlay);
    const body = overlay.querySelector("[data-ar-body]");
    function close(){if(busy)return;opened=false;overlay.remove();document.removeEventListener("keydown",keyHandler,true);previousFocus?.focus();}
    function keyHandler(event){
      if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();close();}
      if(event.key==="Tab"){
        const fields=[...overlay.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled)")];
        if(event.shiftKey&&document.activeElement===fields[0]){event.preventDefault();fields[fields.length-1]?.focus();}
        else if(!event.shiftKey&&document.activeElement===fields[fields.length-1]){event.preventDefault();fields[0]?.focus();}
      }
    }
    document.addEventListener("keydown",keyHandler,true);
    function rowDraft(block,li,pi){
      let entry=block.entries.find(entry=>entry.listIndex===li&&entry.participantIndex===pi);
      if(!entry){entry={listIndex:li,participantIndex:pi,route:-1,minutesText:"",secondsText:"",startSignal:false};block.entries.push(entry);}
      if(entry.minutesText===undefined){entry.minutesText=String(Math.floor(entry.timeSeconds/60));entry.secondsText=String(entry.timeSeconds%60).padStart(2,"0");}
      return entry;
    }
    const athleteName = entry => state.startLists[entry.listIndex]?.rows[entry.participantIndex]?.join(" · ") || "—";
    function renderEditor(block, index){
      const lists=state.startLists,maxRoutes=Math.max(1,...lists.filter(Boolean).map(list=>list.routeCount)),limit=api.maximumTime(currentState());
      const rows=block.kind === "empty" ? "" : lists.map((list,li)=>list?list.rows.map((row,pi)=>{
        if((list.excludedParticipants||[]).includes(pi))return "";
        const entry=rowDraft(block,li,pi);
        return `<tr data-ar-list="${li}" data-ar-athlete="${pi}"><td>${escape(row.join(" · "))}${lists.filter(Boolean).length>1?`<small>${escape(list.title||`${text("Список","List")} ${li+1}`)}</small>`:""}</td>${Array.from({length:maxRoutes},(_,route)=>`<td>${route<list.routeCount?`<input type="checkbox" data-ar-route="${route}" aria-label="${text("Трасса","Boulder")} ${route+1}"${entry.route===route?" checked":""}>`:"—"}</td>`).join("")}<td><span class="final-appeal-time"><input type="number" min="0" max="${Math.floor(limit/60)}" step="1" data-ar-minutes placeholder="${text("мин","min")}" aria-label="${text("Минуты","Minutes")}" value="${escape(entry.minutesText)}"><span>:</span><input type="number" min="0" max="59" step="1" data-ar-seconds placeholder="${text("сек","sec")}" aria-label="${text("Секунды","Seconds")}" value="${escape(entry.secondsText)}"></span></td><td><input type="checkbox" data-ar-start aria-label="${text("Стартовый сигнал","Start signal")}"${entry.startSignal?" checked":""}></td></tr>`;
      }).join(""):"").join("");
      const empty = block.kind === "empty";
      const controls = empty ? `<label class="final-appeal-after"><span>${text("Список","List")}</span><select data-ar-list-select>${lists.map((list,li)=>list?`<option value="${li}"${li===block.listIndex?" selected":""}>${escape(list.title||`${text("Список","List")} ${li+1}`)}</option>`:"").join("")}</select></label><p>${text("Пустая строка создаёт пропуск в потоке. Время обычной ротации сохраняется.","An empty row reserves a gap in the flow. The regular rotation time is preserved.")}</p>` : classic ? `<div class="final-appeal-options"><label><input type="checkbox" data-ar-solo${block.solo?" checked":""}> ${text("Лезет только один спортсмен","Only one athlete climbs")}</label><label class="final-appeal-after"><span>${text("Размещение повторного выхода","Repeat placement")}</span><select data-ar-placement${block.solo?" disabled":""}><option value="flow"${block.placement!=="immediate"?" selected":""}>${text("Слот в потоке","Slot in the flow")}</option><option value="immediate"${block.placement==="immediate"?" selected":""}>${text("Выход сразу после указанной ротации","Climb immediately after the specified rotation")}</option></select></label><small>${block.solo?text("Поток остановится для отдельной попытки. После неё продолжите обычные ротации кнопкой «Старт».","The flow stops for an exclusive attempt. Afterwards use Start to resume regular rotations."):block.placement==="immediate"?text("Спортсмен выходит в следующую ротацию на выбранной трассе. Её поток сдвигается, остальные трассы продолжают работать.","The athlete climbs on the selected boulder in the next rotation. Its following flow shifts; other boulders continue."):text("Слот вставляется в начало потока и проходит к выбранной трассе. Номер фактического выхода будет указан после сохранения.","The slot enters the front of the flow and reaches the selected boulder later. The actual repeat cycle appears after saving.")}</small></div>` : "";
      return `<section class="final-appeal-block" data-ar-block="${index}" data-ar-id="${escape(block.id)}" data-ar-editor><div class="final-appeal-block-head"><strong>${empty?text("Пустая ротация","Empty rotation"):text("Допротация","A/R")} ${index+1}</strong><label class="final-appeal-after"><span>${text("После ротации","After rotation")}</span><input data-ar-after type="number" min="0" max="9999" step="1" value="${escape(block.afterCycle)}"></label><button type="button" data-ar-remove>${text("Удалить","Remove")}</button>${!blocks.some(item=>item.id===block.id)?`<button type="button" data-ar-toggle-empty>${empty?text("Выбрать спортсмена","Assign athlete"):text("Добавить пустую ротацию","Add empty rotation")}</button>`:""}</div>${controls}${empty?"":`<div class="final-appeal-scroll"><table class="final-appeal-table"><thead><tr><th>${text("Спортсмен","Athlete")}</th>${Array.from({length:maxRoutes},(_,i)=>`<th>${i+1}</th>`).join("")}<th>${text("Время: мин : сек","Time: min : sec")}</th><th>${text("Стартовый<br>сигнал","Start<br>signal")}</th></tr></thead><tbody>${rows}</tbody></table></div>`}<div class="final-appeal-actions"><span class="final-appeal-error" data-ar-error role="alert"></span><button type="button" data-ar-cancel>${text("Отмена","Cancel")}</button><button type="button" data-ar-save>${text("Сохранить","Save")}</button></div></section>`;
    }
    function render(){
      const visible=blocks.map(block=>editor?.id===block.id?editor:block);
      if(editor&&!visible.some(block=>block.id===editor.id))visible.push(editor);
      body.innerHTML=visible.map((block,index)=>{
        if(editor?.id===block.id)return renderEditor(editor,index);
        const current=api.active(state)?.id===block.id;
        const projection = classic && !block.solo ? state.startLists.flatMap((list,li)=>list?root.FDVRotationSlots.build(state,li,list).slots.filter(slot=>slot.planId===block.id):[]) : [];
        const completed = block.completed || (projection.length && projection.every(slot=>Math.max(...slot.cycles.filter(Number.isFinite)) < api.anchor(currentState(),getElapsed?.())));
        const modeLabel = block.kind === "empty" ? text("Пустая ротация","Empty rotation") : classic ? block.solo ? text("Лезет только один спортсмен","Only one athlete climbs") : block.placement === "immediate" ? text("Сразу после ротации","Immediately after the rotation") : text("Слот в потоке","Slot in the flow") : "";
        const status=current?(state.completed?text("Завершена","Completed"):state.running?text("Выполняется","Running"):text("Текущая","Current")):completed?text("Завершена","Completed"):text("Запланирована","Planned");
        return `<section class="final-appeal-block final-appeal-summary" data-ar-block="${index}" data-ar-id="${escape(block.id)}" data-ar-summary><div class="final-appeal-summary-info"><strong>${text("Допротация","A/R")} ${index+1} · ${text("после ротации","after rotation")} ${block.afterCycle}</strong>${modeLabel?`<small>${modeLabel}</small>`:""}${block.entries.map(entry=>`<div class="final-appeal-summary-athlete">${escape(athleteName(entry))} — ${text("Трасса","Boulder")} ${entry.route+1}, ${format(entry.timeSeconds)}${entry.startSignal?" ♪":""}${projection.length?` · ${text("ротация","cycle")} ${projection.find(slot=>slot.participantIndex===entry.participantIndex&&slot.listIndex===entry.listIndex)?.cycles[entry.route]}`:""}</div>`).join("")}<small class="final-appeal-summary-status">${status}</small></div><div class="final-appeal-summary-buttons"><button type="button" data-ar-edit${editor?" disabled":""}>${text("Редактировать","Edit")}</button><button type="button" data-ar-remove${editor?" disabled":""}>${text("Удалить","Remove")}</button></div><span class="final-appeal-error" data-ar-error role="alert"></span></section>`;
      }).join("")+(editor?"":`<button type="button" data-ar-add>＋ ${text("Добавить ротацию","Add rotation")}</button> <button type="button" data-ar-add-empty>＋ ${text("Добавить пустую ротацию","Add empty rotation")}</button>`);
      updateControls();
    }
    function updateControls(){
      if(!editor)return;
      body.querySelectorAll("[data-ar-athlete]").forEach(row=>{
        const li=Number(row.dataset.arList),pi=Number(row.dataset.arAthlete),entry=rowDraft(editor,li,pi);
        row.classList.toggle("final-appeal-selected",entry.route>=0);
        row.querySelectorAll("[data-ar-route]").forEach(input=>{
          const route=Number(input.dataset.arRoute),other=entry.route>=0&&entry.route!==route;
          const occupied=editor.entries.some(e=>(e.listIndex===li&&e.participantIndex!==pi&&e.route===route)
            || api.oneAthlete(currentState(),editor)&&e.route>=0&&(e.listIndex!==li||e.participantIndex!==pi));
          input.disabled=(other||occupied)&&!input.checked;input.title=other?text("Для спортсмена можно выбрать только одну трассу","Choose only one boulder for an athlete"):occupied?api.oneAthlete(currentState(),editor)?text("В этой допротации может выступать только один спортсмен","Only one athlete may climb in this extra rotation"):text("На эту трассу уже назначен другой спортсмен","Another athlete is assigned to this boulder"):"";
          input.parentElement.title=input.title;
        });
        row.querySelectorAll("[data-ar-minutes],[data-ar-seconds],[data-ar-start]").forEach(input=>{input.disabled=entry.route<0;});
      });
    }
    function showError(section, exception){
      const limit=format(api.maximumTime(currentState()));
      const messages={"rotation-conflict":text("На выбранную трассу и ротацию уже назначен повторный выход. Измените ротацию или трассу.","A repeat attempt already occupies this boulder and cycle. Change the cycle or boulder."),"rotation-one-athlete":text("В этой допротации может выступать только один спортсмен.","Only one athlete may climb in this extra rotation."),"rotation-time":text(`Введите время от 0:01 до ${limit} для каждого выбранного спортсмена. Максимум задан временем обычной ротации.`,`Enter a time from 0:01 to ${limit} for every assigned athlete. The regular rotation time sets the maximum.`),"rotation-empty":text("Выберите хотя бы одного спортсмена или нажмите «Отмена».","Assign at least one athlete or choose Cancel."),"rotation-after":text("Для новой допротации укажите текущую или будущую ротацию, либо последнюю завершённую при остановленном таймере.","For a new extra rotation use the current or a future rotation, or the last completed rotation when idle."),"rotation-locked":text("Эта допротация сейчас выполняется. Остановите её перед сохранением или удалением.","This extra rotation is running. Stop it before saving or removing it."),"rotation-missing":text("Допротация уже удалена. Закройте окно и откройте снова.","The rotation was removed. Close and reopen this window.")};
      section.querySelector("[data-ar-error]").textContent=messages[exception.message]||text("Не удалось сохранить. Проверьте назначения и соединение с сервером.","Could not save. Check assignments and the server connection.");
    }
    async function commit(section, replacement, removeId){
      if(busy)return;
      const id=removeId||replacement.id,latest=api.plans(state),existed=blocks.some(block=>block.id===id);
      try{
        if(existed&&!latest.some(block=>block.id===id))throw Error("rotation-missing");
        const rotations=latest.filter(block=>block.id!==id);
        if(replacement){const index=latest.findIndex(block=>block.id===id);rotations.splice(index<0?rotations.length:index,0,replacement);}
        api.normalize(rotations,currentState());
        busy=true;section.querySelectorAll("button,input,select").forEach(control=>{control.disabled=true;});
        if(await onSave(rotations)!==true)throw Error("rotation-save");
        blocks=api.plans(state).map(clone);editor=null;render();
      }catch(exception){section.querySelectorAll("button,input").forEach(control=>{control.disabled=false;});updateControls();showError(section,exception);}
      finally{busy=false;}
    }
    function serializeEditor(){
      return {id:editor.id,afterCycle:Number(editor.afterCycle),kind:editor.kind,listIndex:editor.listIndex,solo:editor.solo,placement:editor.placement,entries:editor.kind==="empty"?[]:editor.entries.filter(entry=>entry.route>=0).map(entry=>{
        const minutes=entry.minutesText.trim(),seconds=entry.secondsText.trim();
        if(!minutes&&!seconds||minutes&&!/^\d+$/.test(minutes)||seconds&&!/^\d+$/.test(seconds)||Number(seconds)>59)throw Error("rotation-time");
        return {listIndex:entry.listIndex,participantIndex:entry.participantIndex,route:entry.route,timeSeconds:Number(minutes)*60+Number(seconds),startSignal:entry.startSignal};
      }),completed:editor.completed};
    }
    body.addEventListener("input",event=>{
      if(!editor||busy)return;
      if(event.target.matches("[data-ar-after]")){editor.afterCycle=event.target.value;return;}
      if(event.target.matches("[data-ar-placement]")){editor.placement=event.target.value;render();return;}
      if(event.target.matches("[data-ar-solo]")){editor.solo=event.target.checked;render();return;}
      if(event.target.matches("[data-ar-list-select]")){editor.listIndex=Number(event.target.value);return;}
      const row=event.target.closest("[data-ar-athlete]");if(!row)return;
      const entry=rowDraft(editor,Number(row.dataset.arList),Number(row.dataset.arAthlete));
      if(event.target.matches("[data-ar-route]")){entry.route=event.target.checked?Number(event.target.dataset.arRoute):-1;updateControls();}
      if(event.target.matches("[data-ar-minutes]"))entry.minutesText=event.target.value;
      if(event.target.matches("[data-ar-seconds]"))entry.secondsText=event.target.value;
      if(event.target.matches("[data-ar-start]"))entry.startSignal=event.target.checked;
      event.target.closest("[data-ar-block]").querySelector("[data-ar-error]").textContent="";
    });
    body.addEventListener("click",async event=>{
      if(busy)return;
      if(event.target.closest("[data-ar-add-empty]")){editor={...newBlock(),kind:"empty"};render();return;}
      if(event.target.closest("[data-ar-toggle-empty]")){editor.kind=editor.kind==="empty"?undefined:"empty";render();return;}
      if(event.target.closest("[data-ar-add]")){editor=newBlock();render();body.querySelector("[data-ar-after]")?.focus();return;}
      const section=event.target.closest("[data-ar-block]");if(!section)return;
      const id=section.dataset.arId;
      if(event.target.closest("[data-ar-edit]")){const plan=api.plans(state).find(plan=>plan.id===id);if(plan){editor=clone(plan);render();body.querySelector("[data-ar-after]")?.focus();}return;}
      if(event.target.closest("[data-ar-cancel]")){editor=null;blocks=api.plans(state).map(clone);render();return;}
      if(event.target.closest("[data-ar-remove]")){
        if(!blocks.some(block=>block.id===id)){editor=null;render();}else await commit(section,null,id);
        return;
      }
      if(event.target.closest("[data-ar-save]")){
        try{
          const plan=serializeEditor();
          if(!plan.entries.length && plan.kind!=="empty"){
            if(blocks.some(block=>block.id===id))await commit(section,null,id);
            else{editor=null;render();}
          }else await commit(section,plan);
        }catch(exception){showError(section,exception);}
      }
    });
    overlay.querySelector("[data-ar-close]").addEventListener("click",close);
    render();overlay.querySelector("[data-ar-after]")?.focus();
  }
  root.FDVFinalAppealDialog={open};
})(window);


