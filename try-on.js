'use strict';

(() => {
  const trigger = document.querySelector('[data-try-on]');
  const scriptUrl = document.currentScript.src;
  const assetUrl = (path) => new URL('assets/try-on/' + path, scriptUrl).href;
  const previewLimit = 1600;
  const maxFileSize = 25 * 1024 * 1024;

  const dialog = document.createElement('dialog');
  dialog.className = 'fitting';
  dialog.setAttribute('aria-labelledby', 'fitting-title');
  dialog.innerHTML = `
    <div class="fitting-header">
      <div>
        <p class="fitting-costume"></p>
        <h2 id="fitting-title">Примерка по фото</h2>
      </div>
      <button type="button" class="fitting-close" aria-label="Закрыть примерку">×</button>
    </div>
    <div class="fitting-start">
      <span class="fitting-star" aria-hidden="true">✦</span>
      <p>Выберите фото одного человека в полный рост анфас. Оставьте немного места над головой и под ногами.</p>
      <button type="button" class="button button-dark" data-pick>Выбрать фото</button>
    </div>
    <div class="fitting-editor" hidden>
      <div class="fitting-preview">
        <canvas role="img" aria-label="Предпросмотр костюма на выбранном фото"></canvas>
      </div>
      <div class="fitting-controls">
        <p>Перетащите костюм на фото или настройте его положение ползунками.</p>
        <label><span>По горизонтали <output></output></span><input type="range" data-setting="x" min="-100" max="100" value="0"></label>
        <label><span>По вертикали <output></output></span><input type="range" data-setting="y" min="-100" max="100" value="0"></label>
        <label><span>Масштаб <output></output></span><input type="range" data-setting="scale" min="25" max="250" value="100"></label>
        <label><span>Поворот <output></output></span><input type="range" data-setting="angle" min="-90" max="90" value="0"></label>
        <div class="fitting-actions">
          <button type="button" class="button button-outline" data-compare aria-pressed="false">Без костюма</button>
          <button type="button" class="button button-outline" data-reset>Сбросить подгонку</button>
          <button type="button" class="button button-dark" data-pick>Заменить фото</button>
        </div>
      </div>
    </div>
    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif" hidden>
    <p class="fitting-status" role="status"></p>
    <p class="fitting-privacy">Фото остаётся на устройстве. Примерка показывает образ. Размер уточняйте у проката.</p>
  `;
  document.body.append(dialog);

  const find = (selector) => dialog.querySelector(selector);
  const canvas = find('canvas');
  const context = canvas.getContext('2d');
  const fileInput = find('input[type="file"]');
  const status = find('.fitting-status');
  const start = find('.fitting-start');
  const editor = find('.fitting-editor');
  const compare = find('[data-compare]');
  const sliders = [...dialog.querySelectorAll('[data-setting]')];
  const neutral = { x: 0, y: 0, scale: 100, angle: 0 };

  find('.fitting-costume').textContent = document.querySelector('h1').textContent;

  let photo;
  let costumePromise;
  let costume;
  let detectorPromise;
  let fit;
  let initialFit;
  let settings = { ...neutral };
  let edited = false;
  let originalVisible = false;
  let drag;
  let request = 0;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function loadCostume() {
    costumePromise ??= loadImage(assetUrl(trigger.dataset.tryOn + '.webp')).catch((error) => {
      costumePromise = undefined;
      throw error;
    });
    return costumePromise;
  }

  function loadDetector() {
    detectorPromise ??= import(assetUrl('mediapipe/vision_bundle.mjs')).then(async (vision) => {
      const fileset = await vision.FilesetResolver.forVisionTasks(assetUrl('mediapipe/wasm'));
      return vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: assetUrl('mediapipe/pose_landmarker_lite.task'), delegate: 'CPU' },
        runningMode: 'IMAGE',
        numPoses: 1
      });
    }).catch((error) => {
      detectorPromise = undefined;
      throw error;
    });
    return detectorPromise;
  }

  function resizePhoto(img) {
    const source = document.createElement('canvas');
    const ratio = Math.min(1, previewLimit / Math.max(img.naturalWidth, img.naturalHeight));
    source.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    source.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    source.getContext('2d').drawImage(img, 0, 0, source.width, source.height);
    return source;
  }

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  // Anchor, width across the shoulders, and lower hem in the costume cutout.
  const garment = {
    princess: { shoulderY: .06, shoulders: .42, hem: .98, length: .94 },
    rabbit: { shoulderY: .065, shoulders: .50, hem: .98, length: .78 },
    snowman: { shoulderY: .075, shoulders: .49, hem: .98, length: .93 },
    'snow-maiden': { shoulderY: .08, shoulders: .48, hem: .98, length: .96 },
    jester: { shoulderY: .07, shoulders: .53, hem: .98, length: .97 },
    'baba-yaga': { shoulderY: .065, shoulders: .45, hem: .98, length: .98 },
    reindeer: { shoulderY: .32, shoulders: .58, hem: .98, length: 1, mascot: true },
    dragon: { shoulderY: .34, shoulders: .48, hem: .98, length: 1, mascot: true }
  }[trigger.dataset.tryOn];

  function makeFit(x, y, shoulderToHem, angle = 0, shoulderWidth) {
    const height = shoulderToHem / (garment.hem - garment.shoulderY);
    const naturalWidth = height * costume.naturalWidth / costume.naturalHeight;
    const width = shoulderWidth
      ? clamp(shoulderWidth / garment.shoulders, naturalWidth * .78, naturalWidth * 1.23)
      : naturalWidth;
    return { x, y, width, height, angle };
  }

  function fitToPose(landmarks) {
    const point = (index) => {
      const p = landmarks[index];
      if (!p || (p.visibility ?? 1) < .45 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null;
      return { x: p.x * canvas.width, y: p.y * canvas.height };
    };
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const first = point(11);
    const second = point(12);
    if (!first || !second) return null;
    const [left, right] = first.x <= second.x ? [first, second] : [second, first];
    const shoulders = mid(left, right);
    const hips = [point(23), point(24)].filter(Boolean);
    const ankles = [point(27), point(28)].filter(Boolean);
    const shoulderWidth = Math.hypot(right.x - left.x, right.y - left.y);
    const hipY = hips.length ? hips.reduce((sum, hip) => sum + hip.y, 0) / hips.length : 0;
    const ankleY = ankles.length ? Math.max(...ankles.map((ankle) => ankle.y)) : 0;
    const torso = hipY - shoulders.y;
    const body = ankleY > shoulders.y ? ankleY - shoulders.y : torso * 2.55;
    if (shoulderWidth < canvas.width * .025 || body < canvas.height * .1) return null;
    const angle = clamp(Math.atan2(right.y - left.y, right.x - left.x), -.45, .45);
    if (garment.mascot) {
      const toes = [point(31), point(32)].filter(Boolean);
      const bottom = Math.min(canvas.height * .99, Math.max(shoulders.y + body * 1.11, ...toes.map((toe) => toe.y)));
      const naturalHeight = (bottom - shoulders.y) / (garment.hem - garment.shoulderY);
      const top = Math.max(canvas.height * .015, shoulders.y - naturalHeight * garment.shoulderY);
      const height = (bottom - top) / garment.hem;
      return makeFit(shoulders.x, top + height * garment.shoulderY, height * (garment.hem - garment.shoulderY), angle, shoulderWidth);
    }
    return makeFit(shoulders.x, shoulders.y, body * garment.length, angle, shoulderWidth);
  }

  function draw() {
    if (!photo || !fit) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo, 0, 0);
    if (originalVisible) return;

    const scale = settings.scale / 100;
    const width = fit.width * scale;
    const height = fit.height * scale;
    context.save();
    context.translate(fit.x + settings.x * canvas.width / 100, fit.y + settings.y * canvas.height / 100);
    context.rotate(fit.angle + settings.angle * Math.PI / 180);
    context.drawImage(costume, -width / 2, -height * garment.shoulderY, width, height);
    context.restore();
  }

  function updateControls() {
    for (const slider of sliders) {
      const setting = slider.dataset.setting;
      const unit = setting === 'angle' ? '°' : '%';
      slider.value = settings[setting];
      slider.previousElementSibling.querySelector('output').textContent = slider.value + unit;
    }
    compare.setAttribute('aria-pressed', String(originalVisible));
    compare.textContent = originalVisible ? 'Показать костюм' : 'Без костюма';
  }

  async function choosePhoto(file) {
    const current = ++request;
    if (file.size > maxFileSize) {
      status.textContent = 'Фото больше 25 МБ. Выберите файл меньшего размера.';
      return;
    }
    if (!file.size || /\.svgz?$/i.test(file.name) || file.type === 'image/svg+xml') {
      status.textContent = 'Выберите фото в формате JPG, PNG или WebP.';
      return;
    }

    status.textContent = 'Открываем фото…';
    const url = URL.createObjectURL(file);
    let img;
    try {
      img = await loadImage(url);
    } catch {
      if (current === request) status.textContent = 'Не удалось открыть фото. Попробуйте JPG, PNG или WebP.';
      return;
    } finally {
      URL.revokeObjectURL(url);
    }
    if (current !== request) return;

    try {
      costume = await loadCostume();
    } catch {
      if (current === request) status.textContent = 'Изображение костюма не загрузилось. Выберите фото ещё раз.';
      return;
    }
    if (current !== request) return;

    photo = resizePhoto(img);
    canvas.width = photo.width;
    canvas.height = photo.height;
    settings = { ...neutral };
    originalVisible = false;
    edited = false;
    fit = makeFit(canvas.width * .5, canvas.height * .3, canvas.height * .56 * garment.length);
    initialFit = fit;
    start.hidden = true;
    editor.hidden = false;
    status.textContent = 'Определяем позу…';
    updateControls();
    draw();

    try {
      const detector = await loadDetector();
      if (current !== request) return;
      const points = detector.detect(photo).landmarks[0];
      const automaticFit = points && fitToPose(points);
      if (automaticFit) {
        initialFit = automaticFit;
        if (!edited) {
          fit = automaticFit;
          draw();
        }
        status.textContent = edited ? 'Поза найдена. Чтобы применить автоподгонку, сбросьте настройки.' : 'Костюм наложен по позе.';
      } else {
        status.textContent = 'Не удалось уверенно определить позу. Подгоните костюм вручную.';
      }
    } catch {
      if (current === request) status.textContent = 'Автоподгонка недоступна. Подгоните костюм вручную.';
    }
  }

  trigger.addEventListener('click', () => dialog.showModal());
  find('.fitting-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    request++;
    photo = undefined;
    fit = undefined;
    initialFit = undefined;
    drag = undefined;
    canvas.width = canvas.height = 1;
    status.textContent = '';
    editor.hidden = true;
    start.hidden = false;
  });

  for (const button of dialog.querySelectorAll('[data-pick]')) {
    button.addEventListener('click', () => fileInput.click());
  }
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (file) void choosePhoto(file);
  });

  for (const slider of sliders) {
    slider.addEventListener('input', () => {
      edited = true;
      settings[slider.dataset.setting] = Number(slider.value);
      originalVisible = false;
      updateControls();
      draw();
    });
  }

  compare.addEventListener('click', () => {
    originalVisible = !originalVisible;
    updateControls();
    draw();
  });

  find('[data-reset]').addEventListener('click', () => {
    if (fit !== initialFit) status.textContent = 'Костюм наложен по позе.';
    edited = false;
    originalVisible = false;
    fit = initialFit;
    settings = { ...neutral };
    updateControls();
    draw();
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (!fit || originalVisible || drag || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX: settings.x, offsetY: settings.y };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const bounds = canvas.getBoundingClientRect();
    settings.x = clamp(Math.round(drag.offsetX + 100 * (event.clientX - drag.x) / bounds.width), -100, 100);
    settings.y = clamp(Math.round(drag.offsetY + 100 * (event.clientY - drag.y) / bounds.height), -100, 100);
    edited = true;
    updateControls();
    draw();
  });
  canvas.addEventListener('lostpointercapture', () => { drag = undefined; });
})();
