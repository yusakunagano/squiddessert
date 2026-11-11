// ニャーズの 3D キャラクター（three.js r128 の基本図形だけで組み立てた猫）。外部のモデルファイルは使わない。
// window.NyaCat.setState("idle" | "thinking" | "happy") で動きを切り替え、window.NyaCat.speak(text) で、その長さに合わせて口をぱくぱく動かす。
// three.js や WebGL が使えないときは何もしない（ページ側の絵文字 🐱 がそのまま残る）。
(function () {
  "use strict";
  const host = document.getElementById("cat3d");
  if (!host || typeof THREE === "undefined") return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    return;
  }
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SIZE = 128;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(SIZE, SIZE);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);
  document.documentElement.classList.add("cat3d-on");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.35, 7.2);
  camera.lookAt(0, 1.05, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c7b0, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(2.5, 4, 5);
  scene.add(sun);

  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
  const ORANGE = mat(0xf2a65a), CREAM = mat(0xfff1dc), DARK = mat(0x2a2230), PINK = mat(0xf59bb0), STRIPE = mat(0xd9853b), WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const ball = (r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), material);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    return m;
  };

  const root = new THREE.Group();
  scene.add(root);

  // からだ・むね・前あし
  const body = ball(0.8, ORANGE, 0, 0.72, 0, 1, 0.95, 0.92);
  root.add(body);
  root.add(ball(0.5, CREAM, 0, 0.62, 0.5, 1, 1.05, 0.7));
  const pawL = ball(0.2, CREAM, -0.3, 0.2, 0.7, 1, 0.8, 1.15), pawR = ball(0.2, CREAM, 0.3, 0.2, 0.7, 1, 0.8, 1.15);
  root.add(pawL, pawR);

  // しっぽ：丸い節をつなげて、しなるように動かす
  const SEG = 8, tail = [];
  for (let i = 0; i < SEG; i++) {
    const m = ball(0.15 - i * 0.008, i === SEG - 1 ? CREAM : i % 3 === 2 ? STRIPE : ORANGE);
    root.add(m); tail.push(m);
  }

  // あたま
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0.2);
  root.add(head);
  head.add(ball(0.62, ORANGE, 0, 0, 0, 1.12, 0.95, 1));
  [-1, 1].forEach((s) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 4), ORANGE);
    ear.position.set(s * 0.4, 0.58, -0.02); ear.rotation.z = -s * 0.35; ear.rotation.y = Math.PI / 4;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.32, 4), PINK);
    inner.position.set(s * 0.4, 0.53, 0.08); inner.rotation.copy(ear.rotation);
    head.add(ear, inner);
  });
  const eyes = new THREE.Group();
  [-1, 1].forEach((s) => {
    const eye = ball(0.1, DARK, s * 0.25, 0.04, 0.55, 1, 1.25, 0.8);
    eye.add(ball(0.035, WHITE, 0.03, 0.05, 0.07));
    eyes.add(eye);
  });
  head.add(eyes);
  head.add(ball(0.19, CREAM, -0.11, -0.22, 0.47, 1, 0.85, 0.8), ball(0.19, CREAM, 0.11, -0.22, 0.47, 1, 0.85, 0.8));
  head.add(ball(0.065, PINK, 0, -0.1, 0.62, 1.2, 0.8, 0.8));
  [-1, 1].forEach((s) => {
    head.add(ball(0.09, PINK, s * 0.42, -0.14, 0.42, 1.3, 0.8, 0.4)); // ほっぺ
    for (let i = -1; i <= 1; i++) { // ひげ
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), CREAM);
      w.position.set(s * 0.42, -0.2 + i * 0.07, 0.5); w.rotation.z = Math.PI / 2 + s * i * 0.18; w.rotation.y = -s * 0.5;
      head.add(w);
    }
  });
  // 口：ふだんは「ω」の形に閉じていて、しゃべるときは開く（中に舌）
  const closedMouth = new THREE.Group();
  [-1, 1].forEach((s) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 6, 16, Math.PI), DARK);
    arc.position.set(s * 0.055, -0.155, 0.6); arc.rotation.z = Math.PI;
    closedMouth.add(arc);
  });
  head.add(closedMouth);
  const mouth = ball(0.14, DARK, 0, -0.23, 0.58, 1, 0.01, 0.55);
  const tongue = ball(0.06, PINK, 0, -0.07, 0.04, 1, 0.6, 0.7);
  mouth.add(tongue);
  head.add(mouth);
  let talkUntil = 0, mouthOpen = 0;

  [-0.14, 0, 0.14].forEach((x) => { // ひたいのしま
    const st = ball(0.035, STRIPE, x, 0.46, 0.38, 0.8, 3.2, 0.5); st.rotation.x = -0.6;
    head.add(st);
  });

  // 毛糸玉：考え中だけ出て、猫の前を左右に転がる（猫は目で追う）
  const yarn = ball(0.17, mat(0xe0457b), 0, 0.17, 1.05);
  [0, Math.PI / 2].forEach((r) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.011, 6, 24), mat(0xf7a8c4));
    band.rotation.y = r; band.rotation.x = 0.6; yarn.add(band);
  });
  yarn.visible = false;
  scene.add(yarn);

  // 動きの状態
  let state = "idle", happyUntil = 0;
  let blinkAt = 2, blinkEnd = 0;
  let look = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
  window.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(window.innerWidth, 1) * 2;
    const dy = (e.clientY - (r.top + r.height / 2)) / Math.max(window.innerHeight, 1) * 2;
    aim.x = Math.max(-1, Math.min(1, dx)); aim.y = Math.max(-1, Math.min(1, dy));
  }, { passive: true });

  function pose(t) {
    const thinking = state === "thinking", happy = state === "happy" && t < happyUntil;
    if (state === "happy" && !happy) state = "idle";
    const breathe = Math.sin(t * 2);
    body.scale.y = 0.95 * (1 + 0.025 * breathe);

    // 全体のはずみ：考え中は小さくはずみ、うれしいときは大きく跳ぶ
    const hop = happy ? Math.abs(Math.sin((happyUntil - t) * 7)) * 0.32 : thinking ? Math.abs(Math.sin(t * 5)) * 0.1 : 0;
    root.position.y = hop;

    // あたま：ポインタのほうを向く。考え中は首をかしげ、うれしいときはうなずく
    const yx = Math.sin(t * 2.2) * 0.95;
    yarn.visible = thinking;
    if (thinking) { yarn.position.x = yx; yarn.rotation.z = -yx * 6; }
    const ax = thinking ? yx * 0.9 : aim.x, ay = thinking ? 0.5 : aim.y; // 考え中は毛糸玉を目で追う
    look.x += (ax - look.x) * 0.12; look.y += (ay - look.y) * 0.08;
    head.position.y = 1.62 + 0.015 * breathe;
    head.rotation.y = look.x * 0.55;
    head.rotation.x = look.y * 0.3 + (happy ? Math.sin(t * 14) * 0.12 : 0);
    head.rotation.z = thinking ? Math.sin(t * 2.5) * 0.18 : -look.x * 0.06;

    // まばたき（考え中は、すこし目を細める）
    if (t > blinkAt) { blinkEnd = t + 0.13; blinkAt = t + 2 + Math.random() * 3; }
    const blink = t < blinkEnd ? 0.1 : happy ? 0.35 : thinking ? 0.8 : 1;
    eyes.scale.y += (blink - eyes.scale.y) * 0.4;

    // 口：しゃべっているあいだ、母音のように不規則に開け閉めする。閉じるときは「ω」に戻る
    const talking = t < talkUntil;
    const target = talking ? 0.3 + 0.7 * Math.abs(Math.sin(t * 12)) * (0.65 + 0.35 * Math.sin(t * 4.7)) : 0;
    mouthOpen += (target - mouthOpen) * 0.5;
    mouth.scale.set(1 - mouthOpen * 0.15, Math.max(0.01, mouthOpen * 1.2), 0.55);
    mouth.visible = mouthOpen > 0.06;
    closedMouth.visible = !mouth.visible;
    if (talking) head.rotation.x += Math.sin(t * 6) * 0.04;

    // 前あし：考え中は右あしでぽんぽんする
    pawR.position.y = 0.2 + (thinking ? Math.max(0, Math.sin(t * 9)) * 0.22 : 0);
    pawR.position.z = 0.7 + (thinking ? Math.max(0, Math.sin(t * 9)) * 0.12 : 0);

    // しっぽ：ふだんはゆっくり、考え中・うれしいときは速く大きく
    const speed = thinking || happy ? 6 : talking ? 3 : 1.6, amp = thinking || happy ? 0.55 : talking ? 0.4 : 0.28;
    // 体の右がわから外に出て、上へカーブする。ふるときは角度をゆらす
    let x = 0.62, y = 0.28, ang = -0.35;
    tail.forEach((seg, i) => {
      ang += 0.2 + Math.sin(t * speed - i * 0.6) * amp * 0.3;
      x += Math.cos(ang) * 0.17; y += Math.sin(ang) * 0.17;
      seg.position.set(x, y, -0.1 - i * 0.01);
    });
  }

  let t0 = performance.now();
  function frame(now) {
    pose((now - t0) / 1000);
    renderer.render(scene, camera);
    if (!reduced) requestAnimationFrame(frame);
  }
  if (reduced) { pose(0); renderer.render(scene, camera); } else requestAnimationFrame(frame);

  window.NyaCat = {
    // 返事の長さに合わせて、口を動かす（長くても 7 秒まで）。はじめに小さく跳ぶ
    speak(text) {
      const now = (performance.now() - t0) / 1000;
      state = "happy"; happyUntil = now + 0.7;
      talkUntil = now + Math.min(7, 0.5 + String(text || "").length * 0.09);
      if (reduced) { pose(now); renderer.render(scene, camera); }
    },
    setState(next) {
      state = next;
      if (next !== "happy") talkUntil = 0; // 考え中などに切り替えたら、口は閉じる
      if (next === "happy") happyUntil = (performance.now() - t0) / 1000 + 1.4;
      if (reduced) { pose((performance.now() - t0) / 1000); renderer.render(scene, camera); }
    },
  };
})();
