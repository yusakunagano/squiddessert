// Nyaaz の 3D キャラクター（three.js r128 の基本図形だけで作った、ふわふわの猫）。外部のモデルファイルは使わない。
// ふわふわの毛は、少しずつ大きくした半透明でない殻（シェル）を重ねて表現している。
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
  const SIZE = 190;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(SIZE, SIZE);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);
  document.documentElement.classList.add("cat3d-on");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 1.0, 7.6);
  camera.lookAt(0, 1.0, 0);
  scene.add(new THREE.HemisphereLight(0xf3dfc6, 0xb39574, 0.8));
  const sun = new THREE.DirectionalLight(0xfff1e0, 0.34);
  sun.position.set(2, 4, 6);
  scene.add(sun);

  const solid = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
  const FACE = solid(0xf7d8ca), DARK = solid(0x2b2326), PINK = solid(0xf2a3a6), CHEEK = solid(0xf5a4a2), INNER = solid(0xf3b9b6);
  const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const ball = (r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), material);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    return m;
  };

  // ふわふわの毛：細かいノイズを透明度に使い、外側の殻ほど毛先だけが残るようにする
  const noise = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 4);
    return t;
  })();
  const SHELLS = 14, ROOT = new THREE.Color(0xc9a67d), TIP = new THREE.Color(0xe9d1b0);
  function fur(geometry, spread = 0.07) {
    const g = new THREE.Group();
    for (let i = 0; i < SHELLS; i++) {
      const k = i / (SHELLS - 1);
      const m = new THREE.MeshStandardMaterial({ color: ROOT.clone().lerp(TIP, k), roughness: 1, alphaMap: noise, alphaTest: i === 0 ? 0 : 0.1 + 0.72 * k });
      const mesh = new THREE.Mesh(geometry, m);
      mesh.scale.setScalar(1 + k * spread);
      g.add(mesh);
    }
    return g;
  }

  const root = new THREE.Group();
  scene.add(root);

  // からだ：頭とからだがひとつながりの、たまご形のふわふわ
  const body = fur(new THREE.SphereGeometry(1, 40, 28));
  body.scale.set(0.95, 1.12, 0.92); body.position.set(0, 0.95, 0);
  root.add(body);

  // 耳
  const ears = [-1, 1].map((s) => {
    const e = new THREE.Group();
    e.position.set(s * 0.56, 2.0, 0.02); e.rotation.z = -s * 0.42;
    const f = fur(new THREE.ConeGeometry(0.32, 0.55, 28), 0.08);
    e.add(f);
    const inner = ball(0.15, INNER, 0, -0.04, 0.2, 0.9, 1.5, 0.25);
    e.add(inner);
    root.add(e);
    return e;
  });

  // 顔：毛のない、なめらかなたまご形（ここだけつるっとしている）
  const face = new THREE.Group();
  face.position.set(0, 1.0, 0.78);
  face.add(ball(0.68, FACE, 0, 0, 0, 1, 0.8, 0.36));
  const eyes = new THREE.Group();
  [-1, 1].forEach((s) => {
    const eye = ball(0.07, DARK, s * 0.25, 0.1, 0.205, 1, 1.25, 0.6);
    eye.add(ball(0.02, WHITE, 0.018, 0.03, 0.045));
    eyes.add(eye);
  });
  face.add(eyes);
  [-1, 1].forEach((s) => face.add(ball(0.11, CHEEK, s * 0.43, -0.1, 0.12, 1.3, 0.8, 0.3)));
  face.add(ball(0.03, PINK, 0, -0.01, 0.235, 1.3, 0.8, 0.8));
  // 口：ふだんは小さな「ω」。しゃべるときは開く（中に舌）
  const closedMouth = new THREE.Group();
  [-1, 1].forEach((s) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16, Math.PI), DARK);
    arc.position.set(s * 0.04, -0.075, 0.233); arc.rotation.z = Math.PI;
    closedMouth.add(arc);
  });
  face.add(closedMouth);
  const mouth = ball(0.085, DARK, 0, -0.14, 0.21, 1, 0.01, 0.5);
  mouth.add(ball(0.05, PINK, 0, -0.05, 0.03, 1, 0.6, 0.7));
  face.add(mouth);
  root.add(face);
  let talkUntil = 0, mouthOpen = 0;

  // 毛糸玉：考え中だけ出て、猫の前を左右に転がる（猫は目で追う）
  const yarn = ball(0.17, solid(0xe0457b), 0, 0.2, 1.1);
  [0, Math.PI / 2].forEach((r) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.011, 6, 24), solid(0xf7a8c4));
    band.rotation.y = r; band.rotation.x = 0.6; yarn.add(band);
  });
  yarn.visible = false;
  scene.add(yarn);

  // 動きの状態
  let state = "idle", happyUntil = 0;
  let blinkAt = 2, blinkEnd = 0, earAt = 3, earEnd = 0, earSide = 0;
  const look = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
  window.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(window.innerWidth, 1) * 2;
    const dy = (e.clientY - (r.top + r.height / 2)) / Math.max(window.innerHeight, 1) * 2;
    aim.x = Math.max(-1, Math.min(1, dx)); aim.y = Math.max(-1, Math.min(1, dy));
  }, { passive: true });

  function pose(t) {
    const thinking = state === "thinking", happy = state === "happy" && t < happyUntil, talking = t < talkUntil;
    if (state === "happy" && !happy) state = "idle";
    const breathe = Math.sin(t * 2);
    root.scale.set(1 - 0.008 * breathe, 1 + 0.018 * breathe, 1);

    // 全体のはずみ：考え中は小さくはずみ、うれしいときは大きく跳ぶ
    const hop = happy ? Math.abs(Math.sin((happyUntil - t) * 7)) * 0.3 : thinking ? Math.abs(Math.sin(t * 5)) * 0.08 : talking ? Math.abs(Math.sin(t * 6)) * 0.03 : 0;
    root.position.y = hop;

    // 向き：ポインタのほうへ。考え中は毛糸玉を目で追い、体を左右にゆらす
    const yx = Math.sin(t * 2.2) * 0.95;
    yarn.visible = thinking;
    if (thinking) { yarn.position.x = yx; yarn.rotation.z = -yx * 6; }
    const ax = thinking ? yx * 0.9 : aim.x, ay = thinking ? 0.4 : aim.y;
    look.x += (ax - look.x) * 0.12; look.y += (ay - look.y) * 0.08;
    root.rotation.y = look.x * 0.4;
    root.rotation.x = look.y * 0.18 + (happy ? Math.sin(t * 14) * 0.05 : 0);
    root.rotation.z = thinking ? Math.sin(t * 3) * 0.07 : 0;
    eyes.position.x = look.x * 0.045; eyes.position.y = -look.y * 0.02;

    // まばたき（考え中は目を細め、うれしいときはにっこり）
    if (t > blinkAt) { blinkEnd = t + 0.13; blinkAt = t + 2 + Math.random() * 3; }
    const blink = t < blinkEnd ? 0.1 : happy ? 0.3 : thinking ? 0.8 : 1;
    eyes.scale.y += (blink - eyes.scale.y) * 0.4;

    // 耳：ときどきぴくっと動く。うれしいとき・考え中は小刻みに動く
    if (t > earAt) { earEnd = t + 0.35; earAt = t + 3 + Math.random() * 4; earSide = Math.random() < 0.5 ? 0 : 1; }
    ears.forEach((e, i) => {
      const s = i === 0 ? -1 : 1;
      const twitch = t < earEnd && i === earSide ? Math.sin((earEnd - t) * 28) * 0.12 : 0;
      const wiggle = happy || thinking ? Math.sin(t * 9 + i) * 0.05 : 0;
      e.rotation.z = -s * 0.42 + twitch + wiggle;
    });

    // 口：しゃべっているあいだ、母音のように不規則に開け閉めする。閉じるときは「ω」に戻る
    const target = talking ? 0.3 + 0.7 * Math.abs(Math.sin(t * 12)) * (0.65 + 0.35 * Math.sin(t * 4.7)) : 0;
    mouthOpen += (target - mouthOpen) * 0.5;
    mouth.scale.set(1 - mouthOpen * 0.12, Math.max(0.01, mouthOpen * 1.2), 0.5);
    mouth.visible = mouthOpen > 0.06;
    closedMouth.visible = !mouth.visible;
  }

  const t0 = performance.now();
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
