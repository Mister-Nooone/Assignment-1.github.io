(() => {
  'use strict';

  const root = document.body;
  const SETTING = root.dataset.setting || 'generic';
  const PREFIX = `rpg_${SETTING}_`;
  const STORAGE_KEY = `${PREFIX}character_v3`;
  const DB_NAME = `${PREFIX}local_db`;
  const DB_STORE = 'portrait';
  const CHAT_KEY = `${PREFIX}chat_v1`;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const SHOP_CONFIG = {
    cyberpunk: {
      seller: 'Продавец',
      currency: 'евродолларов',
      insufficient: [
        'Ты чё, за лоха меня держишь, чумба?',
        'Я тебе одну вещь скажу, только ты не обижайся: приходи попозже...',
        'Значит, не судьба'
      ]
    },
    ivanhoe: {
      seller: 'Торговец',
      currency: 'монет',
      insufficient: [
        'Собирай милостыню в другом месте, н\'вах',
        'Ну, на нет и суда нет, как говорится',
        'Сегодня не твой день'
      ]
    }
  }[SETTING] || { seller: 'Торговец', currency: 'монет', insufficient: ['Не хватает денег.'] };

  const defaultCharacter = {
    fullName: '', className: '', race: '', age: '', height: '', weight: '',
    biography: '', personality: '',
    wallet: SETTING === 'ivanhoe' ? { gold: 0, silver: 0 } : 0,
    stats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    inventory: [{ item: '', quantity: 1, damage: '', notes: '' }]
  };

  let character = loadCharacter();
  let currentPopup = null;

  function cloneDefault() {
    return JSON.parse(JSON.stringify(defaultCharacter));
  }

  function loadCharacter() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefault();
      const data = JSON.parse(raw);
      return {
        ...cloneDefault(), ...data,
        stats: { ...defaultCharacter.stats, ...(data.stats || {}) },
        inventory: Array.isArray(data.inventory) && data.inventory.length ? data.inventory : cloneDefault().inventory,
        wallet: SETTING === 'ivanhoe'
          ? { ...defaultCharacter.wallet, ...(data.wallet || {}) }
          : Number.isFinite(Number(data.wallet)) ? Number(data.wallet) : 0
      };
    } catch { return cloneDefault(); }
  }

  function saveCharacter(showStatus = false) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(character));
    if (showStatus) flashStatus('character-status', 'Лист персонажа сохранён локально.');
    updateWalletUI();
  }

  function flashStatus(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.textContent = ''; }, 3000);
  }

  function openPopup(id) {
    const popup = document.getElementById(id);
    if (!popup) return;
    currentPopup = popup;
    popup.classList.add('is-open');
    popup.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closePopup(popup = currentPopup) {
    if (!popup) return;
    popup.classList.remove('is-open');
    popup.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.popup.is-open')) document.body.classList.remove('modal-open');
    currentPopup = null;
  }

  $$('.box[data-popup]').forEach(box => {
    box.addEventListener('click', e => {
      if (e.target.closest('button, input, textarea, select, a')) return;
      openPopup(box.dataset.popup);
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPopup(box.dataset.popup); }
    });
  });

  $$('.popup-close, .popup-backdrop').forEach(el => el.addEventListener('click', () => closePopup(el.closest('.popup'))));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });

  $$('.settings-btn').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const dropdown = btn.closest('.settings-dropdown');
    dropdown.classList.toggle('open');
    btn.setAttribute('aria-expanded', dropdown.classList.contains('open'));
  }));
  document.addEventListener('click', () => $$('.settings-dropdown.open').forEach(d => d.classList.remove('open')));

  window.navigateTo = url => { window.location.href = url; };

  const musicButton = $('#music-icon');
  const audio = $('#background-music');
  if (musicButton && audio) {
    musicButton.addEventListener('click', async () => {
      if (audio.paused) {
        try { await audio.play(); } catch {}
        musicButton.classList.add('playing');
        musicButton.setAttribute('aria-label', 'Выключить музыку');
        const img = $('img', musicButton); if (img) img.src = 'mus-on3.png';
      } else {
        audio.pause();
        musicButton.classList.remove('playing');
        musicButton.setAttribute('aria-label', 'Включить музыку');
        const img = $('img', musicButton); if (img) img.src = 'mus-off.png';
      }
    });
  }

  function modifier(value) { return Math.floor((Number(value) - 10) / 2); }
  function modifierText(value) { const m = modifier(value); return m >= 0 ? `+${m}` : `${m}`; }

  function bindCharacterForm() {
    const form = $('#character-form');
    if (!form) return;
    ['fullName','className','race','age','height','weight','biography','personality','characterNotes'].forEach(key => {
      const field = form.elements[key];
      if (!field) return;
      field.value = character[key] ?? '';
      field.addEventListener('input', () => { character[key] = field.value; saveCharacter(false); updateChatIdentity(); });
    });

    $$('[data-stat]', form).forEach(input => {
      const stat = input.dataset.stat;
      input.value = character.stats[stat] ?? 10;
      const sync = () => {
        let value = Number(input.value);
        if (!Number.isFinite(value)) value = 10;
        value = Math.max(1, Math.min(20, Math.trunc(value)));
        input.value = value;
        character.stats[stat] = value;
        const mod = $(`[data-modifier="${stat}"]`, input.closest('.stat-card'));
        if (mod) mod.textContent = modifierText(value);
        saveCharacter(false);
      };
      input.addEventListener('input', sync); input.addEventListener('blur', sync);
      const mod = $(`[data-modifier="${stat}"]`, input.closest('.stat-card'));
      if (mod) mod.textContent = modifierText(input.value);
    });

    renderInventory();
    renderWalletControls();
    bindPortrait();

    $('#save-character')?.addEventListener('click', () => saveCharacter(true));
    $('#add-inventory')?.addEventListener('click', () => {
      character.inventory.push({ item: '', quantity: 1, damage: '', notes: '' });
      saveCharacter(false); renderInventory();
    });

    $('#export-character')?.addEventListener('click', exportCharacter);
    $('#import-character')?.addEventListener('change', e => importCharacter(e.target.files?.[0]));
  }

  function renderInventory() {
    const body = $('#inventory-body'); if (!body) return;
    body.innerHTML = '';
    character.inventory.forEach((entry, index) => {
      const tr = document.createElement('tr');
      tr.appendChild(inputCell('Название предмета', entry.item, v => entry.item = v));
      const qty = document.createElement('input'); qty.type = 'number'; qty.min = '1'; qty.max = '999'; qty.step = '1'; qty.value = entry.quantity || 1;
      qty.addEventListener('input', () => { qty.value = Math.max(1, Math.min(999, Math.trunc(Number(qty.value) || 1))); entry.quantity = Number(qty.value); saveCharacter(false); });
      const qcell = document.createElement('td'); qcell.appendChild(qty); tr.appendChild(qcell);

      const dcell = document.createElement('td'); dcell.className = 'damage-cell';
      const damage = document.createElement('input'); damage.type = 'text'; damage.placeholder = '1d8'; damage.value = entry.damage || '';
      damage.addEventListener('input', () => { entry.damage = damage.value; saveCharacter(false); });
      const roll = document.createElement('button'); roll.type = 'button'; roll.className = 'dice-button'; roll.textContent = '🎲'; roll.title = 'Бросить урон';
      roll.addEventListener('click', e => { e.stopPropagation(); rollDamage(entry.damage || damage.value); });
      dcell.append(damage, roll); tr.appendChild(dcell);
      tr.appendChild(inputCell('Примечание', entry.notes, v => entry.notes = v));

      const delCell = document.createElement('td');
      const del = document.createElement('button'); del.type = 'button'; del.className = 'delete-button'; del.textContent = '×';
      del.addEventListener('click', () => { character.inventory.splice(index,1); if (!character.inventory.length) character.inventory.push({ item:'', quantity:1, damage:'', notes:'' }); saveCharacter(false); renderInventory(); });
      delCell.appendChild(del); tr.appendChild(delCell);
      body.appendChild(tr);
    });
  }

  function inputCell(placeholder, value, onInput) {
    const cell = document.createElement('td'); const input = document.createElement('input'); input.type = 'text'; input.placeholder = placeholder; input.value = value || '';
    input.addEventListener('input', () => { onInput(input.value); saveCharacter(false); }); cell.appendChild(input); return cell;
  }

  function renderWalletControls() {
    const wallet = $('#wallet-value');
    if (!wallet) return;
    if (SETTING === 'ivanhoe') {
      wallet.innerHTML = `<div class="wallet-amount"><strong id="wallet-gold">0</strong> золотых · <strong id="wallet-silver">0</strong> серебряных</div><div class="wallet-actions"><button type="button" data-money="gold" data-delta="-1">− зол.</button><button type="button" data-money="gold" data-delta="1">+ зол.</button><button type="button" data-money="silver" data-delta="-1">− сер.</button><button type="button" data-money="silver" data-delta="1">+ сер.</button><input id="wallet-silver-custom" type="number" step="1" placeholder="± серебро"><button type="button" id="wallet-silver-apply">Применить</button></div>`;
      $$('[data-money]', wallet).forEach(btn => btn.addEventListener('click', () => {
        character.wallet[btn.dataset.money] = Math.max(0, Number(character.wallet[btn.dataset.money] || 0) + Number(btn.dataset.delta));
        normalizeMoney(); saveCharacter(false);
      }));
      $('#wallet-silver-apply')?.addEventListener('click', () => { const v=Number($('#wallet-silver-custom').value); if(Number.isFinite(v)){ character.wallet.silver += Math.trunc(v); normalizeMoney(); saveCharacter(false); } $('#wallet-silver-custom').value=''; });
    } else {
      wallet.innerHTML = `<div class="wallet-amount"><strong id="wallet-cyber">0</strong> евродолларов</div><div class="wallet-actions"><button type="button" data-wallet-delta="-10">− 10</button><button type="button" data-wallet-delta="10">+ 10</button><input id="wallet-custom" type="number" step="1" placeholder="± сумма"><button type="button" id="wallet-add-custom">Применить</button></div>`;
      $$('[data-wallet-delta]', wallet).forEach(btn => btn.addEventListener('click', () => { character.wallet = Math.max(0, Number(character.wallet || 0) + Number(btn.dataset.walletDelta)); saveCharacter(false); }));
      $('#wallet-add-custom')?.addEventListener('click', () => { const v = Number($('#wallet-custom').value); if (Number.isFinite(v)) character.wallet = Math.max(0, Number(character.wallet || 0) + Math.trunc(v)); $('#wallet-custom').value=''; saveCharacter(false); });
    }
    updateWalletUI();
  }

  function normalizeMoney() {
    character.wallet.gold = Math.max(0, Math.trunc(Number(character.wallet.gold) || 0));
    character.wallet.silver = Math.max(0, Math.trunc(Number(character.wallet.silver) || 0));
    if (character.wallet.silver >= 10) { character.wallet.gold += Math.floor(character.wallet.silver / 10); character.wallet.silver %= 10; }
    while (character.wallet.silver < 0) { if (character.wallet.gold <= 0) { character.wallet.silver = 0; break; } character.wallet.gold--; character.wallet.silver += 10; }
  }

  function updateWalletUI() {
    if (SETTING === 'ivanhoe') {
      normalizeMoney(); if ($('#wallet-gold')) $('#wallet-gold').textContent = character.wallet.gold; if ($('#wallet-silver')) $('#wallet-silver').textContent = character.wallet.silver;
    } else if ($('#wallet-cyber')) $('#wallet-cyber').textContent = Math.trunc(Number(character.wallet || 0));
  }

  function walletValue() { return SETTING === 'ivanhoe' ? Number(character.wallet.gold || 0) * 10 + Number(character.wallet.silver || 0) : Number(character.wallet || 0); }
  function priceValue(text) {
    const n = Number((String(text).match(/[\d,.]+/) || ['0'])[0].replace(',', '.')) || 0;
    if (SETTING === 'ivanhoe') return /золот/i.test(text) ? n * 10 : n;
    return n;
  }
  function pay(price) {
    if (SETTING === 'ivanhoe') {
      let total = walletValue() - price; if (total < 0) return false;
      character.wallet.gold = Math.floor(total / 10); character.wallet.silver = total % 10;
    } else character.wallet = Math.max(0, walletValue() - price);
    saveCharacter(false); updateWalletUI(); return true;
  }

  function bindShop() {
    const table = $('.shop-table'); if (!table) return;
    $$('tbody tr', table).forEach(row => {
      row.classList.add('shop-row');
      row.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const cells = [...row.cells].map(c => c.textContent.trim());
        const item = cells[1] || 'предмет'; const damage = cells[2] || ''; const price = cells[cells.length - 1] || '';
        showPurchase(row, item, damage, price);
      });
    });
  }

  function showPurchase(row, item, damage, priceText) {
    $$('.purchase-popover').forEach(x => x.remove());
    const pop = document.createElement('div'); pop.className = 'purchase-popover';
    pop.innerHTML = `<strong>Приобрести?</strong><div><button type="button" data-buy="yes">Да</button><button type="button" data-buy="no">Нет</button></div>`;
    row.cells[row.cells.length - 1].appendChild(pop);
    pop.querySelector('[data-buy="no"]').addEventListener('click', e => { e.stopPropagation(); pop.remove(); });
    pop.querySelector('[data-buy="yes"]').addEventListener('click', e => {
      e.stopPropagation();
      const price = priceValue(priceText);
      if (walletValue() >= price) {
        pay(price); addToInventory(item, damage); addChatMessage('system', `Приобретено: ${item} — ${priceText}.`); pop.remove();
      } else {
        const line = SHOP_CONFIG.insufficient[Math.floor(Math.random() * SHOP_CONFIG.insufficient.length)];
        addChatMessage('seller', line); pop.remove();
      }
    });
  }

  function addToInventory(item, damage) {
    const existing = character.inventory.find(x => x.item === item && x.damage === damage);
    if (existing) existing.quantity = Number(existing.quantity || 0) + 1;
    else character.inventory.push({ item, quantity: 1, damage, notes: 'Куплено в магазине' });
    saveCharacter(false); renderInventory();
  }

  function parseDice(formula) {
    const clean = String(formula || '').trim().toLowerCase().replace(/\s+/g, '');
    const match = clean.match(/^(\d*)d(\d+)([+-]\d+)?$/); if (!match) return null;
    return { count: Math.max(1, Math.min(100, Number(match[1] || 1))), sides: Math.max(1, Math.min(1000, Number(match[2]))), bonus: Number(match[3] || 0) };
  }
  function rollDamage(formula) {
    const dice = parseDice(formula); if (!dice) return showDiceResult('?', 'invalid');
    let total = dice.bonus; for (let i=0;i<dice.count;i++) total += Math.floor(Math.random()*dice.sides)+1;
    showDiceResult(total, total < 8 ? 'low' : total > 15 ? 'high' : 'mid');
  }
  function showDiceResult(result, tone) {
    $('.dice-result')?.remove(); const el = document.createElement('div'); el.className = `dice-result ${tone}`; el.textContent = result; document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show')); setTimeout(() => el.classList.add('fade'), 4300); setTimeout(() => el.remove(), 5000);
  }

  function openImageDB() {
    return new Promise((resolve,reject) => { const req=indexedDB.open(DB_NAME,1); req.onupgradeneeded=()=>req.result.createObjectStore(DB_STORE); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
  }
  async function getPortrait() {
    try { const db=await openImageDB(); return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get('portrait');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); } catch { return null; }
  }
  async function putPortrait(file) {
    const db=await openImageDB(); await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(file,'portrait');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  }
  async function deletePortrait() {
    try { const db=await openImageDB(); await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete('portrait');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); } catch {}
    const preview=$('#portrait-preview'); if(preview?._url) URL.revokeObjectURL(preview._url); if(preview){preview.removeAttribute('src');preview.classList.remove('has-image');} $('#delete-portrait')?.classList.add('hidden'); flashStatus('portrait-status','Портрет удалён.');
  }
  async function loadPortrait() {
    const preview=$('#portrait-preview'); if(!preview)return; const file=await getPortrait(); if(!file)return; if(preview._url)URL.revokeObjectURL(preview._url); preview._url=URL.createObjectURL(file); preview.src=preview._url; preview.classList.add('has-image'); $('#delete-portrait')?.classList.remove('hidden');
  }
  function bindPortrait() {
    const input=$('#portrait-input'); if(!input)return; input.addEventListener('change', async()=>{const file=input.files?.[0];if(!file)return;if(!['image/png','image/jpeg'].includes(file.type)){flashStatus('portrait-status','Допустимы только PNG и JPG.');input.value='';return;}if(file.size>3*1024*1024){flashStatus('portrait-status','Файл превышает лимит 3 МБ.');input.value='';return;}try{await putPortrait(file);await loadPortrait();flashStatus('portrait-status','Портрет сохранён локально.');}catch{flashStatus('portrait-status','Не удалось сохранить портрет.');}}); $('#delete-portrait')?.addEventListener('click',deletePortrait); loadPortrait();
  }

  async function exportCharacter() {
    const data = { ...character, setting: SETTING, exportedAt: new Date().toISOString() };
    const portrait = await getPortrait();
    if (portrait) data.portraitData = await blobToDataURL(portrait);
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${SETTING}-character.json`; a.click(); URL.revokeObjectURL(url);
  }
  function blobToDataURL(blob) { return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);}); }
  function dataURLToBlob(dataURL) { const [meta,b64]=dataURL.split(','); const mime=(meta.match(/data:([^;]+)/)||[])[1]||'image/png'; const bytes=atob(b64); const arr=new Uint8Array(bytes.length); for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i); return new Blob([arr],{type:mime}); }
  async function importCharacter(file) {
    if(!file)return; try { const data=JSON.parse(await file.text()); character={...cloneDefault(),...data,stats:{...defaultCharacter.stats,...(data.stats||{})},inventory:Array.isArray(data.inventory)&&data.inventory.length?data.inventory:cloneDefault().inventory}; if(SETTING==='ivanhoe') character.wallet={...defaultCharacter.wallet,...(data.wallet||{})}; else character.wallet=Number(data.wallet)||0; delete character.portraitData; localStorage.setItem(STORAGE_KEY,JSON.stringify(character)); if(data.portraitData){const blob=dataURLToBlob(data.portraitData);if(blob.size>3*1024*1024)throw new Error('portrait-too-large');await putPortrait(blob);} renderAllCharacterUI(); flashStatus('character-status','JSON успешно импортирован.'); } catch { flashStatus('character-status','Не удалось импортировать JSON. Проверьте файл.'); } file.value='';
  }
  function renderAllCharacterUI() {
    const form=$('#character-form'); if(!form)return; ['fullName','className','race','age','height','weight','biography','personality','characterNotes'].forEach(k=>{if(form.elements[k])form.elements[k].value=character[k]??'';}); $$('[data-stat]',form).forEach(i=>{i.value=character.stats[i.dataset.stat]??10;const m=$(`[data-modifier="${i.dataset.stat}"]`,i.closest('.stat-card'));if(m)m.textContent=modifierText(i.value);}); renderInventory(); renderWalletControls(); updateChatIdentity(); loadPortrait();
  }

  function loadChat() { try { const data=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]'); return Array.isArray(data)?data:[]; } catch { return []; } }
  let chat = loadChat();
  function saveChat() { localStorage.setItem(CHAT_KEY,JSON.stringify(chat)); }
  function characterName() { return character.fullName?.trim() || 'Персонаж'; }
  function addChatMessage(type,text) { chat.push({type,text,time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}); if(chat.length>100)chat=chat.slice(-100); saveChat(); renderChat(); }
  function updateChatIdentity() { $$('.chat-author.player').forEach(el=>el.textContent=characterName()); }
  function renderChat() {
    const box=$('#chat-messages'); if(!box)return; box.innerHTML=''; chat.forEach(m=>{const msg=document.createElement('div');msg.className=`chat-message ${m.type}`;const author=document.createElement('strong');author.className='chat-author';author.textContent=m.type==='player'?characterName():m.type==='seller'?SHOP_CONFIG.seller:'Система';const body=document.createElement('span');body.textContent=m.text;msg.append(author,body);box.appendChild(msg);});box.scrollTop=box.scrollHeight;
  }
  function bindChat() { const form=$('#chat-form'); const input=$('#chat-input'); if(!form||!input)return; form.addEventListener('submit',e=>{e.preventDefault();const text=input.value.trim();if(!text)return;addChatMessage('player',text);input.value=''; setTimeout(() => addChatMessage('seller', SETTING === 'cyberpunk' ? 'Глянь витрину, чумба. Может, найдёшь что по карману.' : 'Погляди товар, путник; коли что приглянется — спрашивай.'), 350);}); renderChat(); }

  function init() { bindCharacterForm(); bindShop(); bindChat(); }
  document.addEventListener('DOMContentLoaded', init);
})();
