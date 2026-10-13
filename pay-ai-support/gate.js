// Client-side login gate shared by every page in this prototype.
// GitHub Pages can't do server-side Basic auth, so this only keeps casual visitors out. Only the hash is stored.
(() => {
  const H = '386c24563b9256a0cb0f39148b85b0663cff50b23e4dd0b8a9a5e3a4a6675ee8';
  try { if (sessionStorage.getItem('payAuth') === H) return; } catch (e) {}
  const field = 'width:100%;padding:12px;font-size:16px;border:1px solid #e3e3e3;border-radius:8px;box-sizing:border-box';
  const gate = document.createElement('div');
  gate.style.cssText = 'position:fixed;inset:0;background:#f5f5f7;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif';
  gate.innerHTML = `<form style="background:#fff;padding:24px;border-radius:12px;width:100%;max-width:320px;box-shadow:0 2px 12px rgba(0,0,0,.08);color:#222">
      <h2 style="margin-top:0;font-size:18px">ログイン</h2>
      <label style="display:block;font-size:13px;font-weight:600;margin:12px 0 6px">ID</label><input name="uid" autocomplete="username" style="${field}">
      <label style="display:block;font-size:13px;font-weight:600;margin:12px 0 6px">パスワード</label><input name="upw" type="password" autocomplete="current-password" style="${field}">
      <div class="gerr" style="color:#d0021b;font-size:12px;min-height:1em;margin-top:6px"></div>
      <button style="width:100%;margin-top:16px;padding:14px;font-size:16px;font-weight:700;border:0;border-radius:24px;background:#e60033;color:#fff;cursor:pointer">ログイン</button>
    </form>`;
  document.body.appendChild(gate);
  const form = gate.querySelector('form');
  form.onsubmit = async e => {
    e.preventDefault();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(form.uid.value + ':' + form.upw.value));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hex !== H) { gate.querySelector('.gerr').textContent = 'IDまたはパスワードが違います'; return; }
    try { sessionStorage.setItem('payAuth', H); } catch (e) {}
    gate.remove();
  };
})();
