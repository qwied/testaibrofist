/* Рисование косметики (см. cosmShop.js на сервере): шляпы, плащи и крылья, свечение — на самой
   фигурке; след и питомец — в мире, позади игрока. Фигурка — голова-круг сверху и тело ниже
   (figure() в движке), w×h ≈ 30×100; face — куда смотрит (1 вправо, −1 влево). */
(function () {
  'use strict';
  var NAMES = {
    hat_party: 'Party hat', hat_cap: 'Cap', hat_beanie: 'Beanie', hat_top: 'Top hat', hat_crown: 'Crown',
    cape_red: 'Red cape', cape_blue: 'Blue cape', wings_bat: 'Bat wings', wings_angel: 'Angel wings',
    trail_spark: 'Sparkle trail', trail_fire: 'Fire trail', trail_rainbow: 'Rainbow trail',
    pet_slime: 'Pet slime', pet_cat: 'Pet cat', pet_dog: 'Pet dog',
    death_confetti: 'Confetti death', death_ghost: 'Ghost death', glow_rgb: 'Rainbow glow',
    nick_gold: 'Golden nick', nick_glow: 'Glowing nick'
  };
  function hat(ctx, id, w, h, face) {
    var r = w / 2, cx = w / 2, top = 0;
    ctx.save();
    if (id === 'hat_party') {
      ctx.fillStyle = '#ec4899'; ctx.beginPath(); ctx.moveTo(cx - r * 0.75, top + r * 0.35); ctx.lineTo(cx + r * 0.75, top + r * 0.35); ctx.lineTo(cx + r * 0.1, top - r * 1.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx - r * 0.45, top - r * 0.2); ctx.lineTo(cx + r * 0.5, top - r * 0.05); ctx.stroke();
      ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(cx + r * 0.1, top - r * 1.5, r * 0.22, 0, 6.2832); ctx.fill();
    } else if (id === 'hat_cap') {
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(cx, top + r * 0.55, r * 1.02, Math.PI, 0); ctx.fill();
      ctx.fillRect(face > 0 ? cx : cx - r * 1.75, top + r * 0.4, r * 0.75 + r, r * 0.25);
    } else if (id === 'hat_beanie') {
      ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.arc(cx, top + r * 0.6, r * 1.04, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#93c5fd'; ctx.fillRect(cx - r * 1.04, top + r * 0.4, r * 2.08, r * 0.32);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, top - r * 0.5, r * 0.3, 0, 6.2832); ctx.fill();
    } else if (id === 'hat_top') {
      ctx.fillStyle = '#111827'; ctx.fillRect(cx - r * 1.35, top + r * 0.2, r * 2.7, r * 0.25);
      ctx.fillRect(cx - r * 0.8, top - r * 1.5, r * 1.6, r * 1.75);
      ctx.fillStyle = '#dc2626'; ctx.fillRect(cx - r * 0.8, top - r * 0.15, r * 1.6, r * 0.28);
    } else if (id === 'hat_crown') {
      ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#a16207'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx - r * 0.95, top + r * 0.35); ctx.lineTo(cx - r * 0.95, top - r * 0.75); ctx.lineTo(cx - r * 0.45, top - r * 0.2);
      ctx.lineTo(cx, top - r * 1.05); ctx.lineTo(cx + r * 0.45, top - r * 0.2); ctx.lineTo(cx + r * 0.95, top - r * 0.75); ctx.lineTo(cx + r * 0.95, top + r * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(cx, top - r * 0.05, r * 0.16, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
  function back(ctx, id, w, h, face, t) {
    var cx = w / 2, sh = h * 0.34, wave = Math.sin(t / 160) * 3;
    ctx.save();
    if (id === 'cape_red' || id === 'cape_blue') {
      ctx.fillStyle = id === 'cape_red' ? '#dc2626' : '#2563eb';
      var bx = cx - face * w * 0.15;
      ctx.beginPath(); ctx.moveTo(bx - w * 0.45, sh); ctx.lineTo(bx + w * 0.45, sh);
      ctx.quadraticCurveTo(bx - face * w * 0.6, h * 0.62, bx - face * w * 0.9 + wave, h * 0.9);
      ctx.lineTo(bx - face * w * 0.2 + wave, h * 0.92); ctx.closePath(); ctx.fill();
    } else if (id === 'wings_angel' || id === 'wings_bat') {
      var flap = Math.sin(t / 220) * 0.18, col = id === 'wings_angel' ? '#ffffff' : '#312e81', edge = id === 'wings_angel' ? '#cbd5e1' : '#1e1b4b';
      [-1, 1].forEach(function (s) {
        ctx.save(); ctx.translate(cx + s * w * 0.3, h * 0.42); ctx.rotate(s * (0.5 + flap));
        ctx.fillStyle = col; ctx.strokeStyle = edge; ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (id === 'wings_angel') ctx.ellipse(s * w * 0.6, -h * 0.05, w * 0.7, h * 0.16, 0, 0, 6.2832);
        else { ctx.moveTo(0, 0); ctx.lineTo(s * w * 1.3, -h * 0.18); ctx.lineTo(s * w * 1.1, h * 0.02); ctx.lineTo(s * w * 0.8, -h * 0.02); ctx.lineTo(s * w * 0.6, h * 0.08); ctx.lineTo(s * w * 0.35, 0.01 * h); ctx.closePath(); }
        ctx.fill(); ctx.stroke(); ctx.restore();
      });
    }
    ctx.restore();
  }
  function glow(ctx, w, h, t) {
    ctx.save();
    ctx.strokeStyle = 'hsl(' + ((t / 8) % 360) + ',95%,55%)'; ctx.lineWidth = 4; ctx.globalAlpha *= 0.85;
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2 + 3, 0, 6.2832); ctx.stroke();
    ctx.strokeRect(-3, w + 2, w + 6, h - w + 1);
    ctx.restore();
  }
  // слои на фигурке: 'back' — до неё (плащ, крылья, свечение), 'front' — после (шляпа)
  function drawFig(ctx, c, w, h, face, layer, t) {
    if (!c) return;
    t = t || Date.now(); face = face < 0 ? -1 : 1;
    if (layer === 'back') { if (c.glow) glow(ctx, w, h, t); if (c.back) back(ctx, c.back, w, h, face, t); }
    else if (c.hat) hat(ctx, c.hat, w, h, face);
  }
  // след: список точек мира (последние позиции ног игрока), старые — бледнее
  function drawTrail(ctx, id, pts, t) {
    if (!id || !pts || pts.length < 2) return;
    ctx.save();
    for (var i = 0; i < pts.length; i++) {
      var k = i / pts.length, p = pts[i];
      ctx.globalAlpha = k * 0.8;
      if (id === 'trail_fire') ctx.fillStyle = 'hsl(' + (10 + k * 40) + ',100%,' + (45 + k * 15) + '%)';
      else if (id === 'trail_rainbow') ctx.fillStyle = 'hsl(' + ((i * 26 + t / 6) % 360) + ',95%,58%)';
      else ctx.fillStyle = i % 2 ? '#fde68a' : '#facc15';
      var r = (id === 'trail_spark' ? 2.5 : 5) * (0.4 + k);
      ctx.beginPath(); ctx.arc(p[0] + (id === 'trail_spark' ? Math.sin(i * 2.1) * 5 : 0), p[1] - (id === 'trail_fire' ? (1 - k) * 12 : 0), r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
  // питомец стоит у ног (x — середина, y — пол), face — куда смотрит
  function drawPet(ctx, id, x, y, face, t) {
    if (!id) return;
    var bob = Math.abs(Math.sin(t / 180)) * 3;
    ctx.save(); ctx.translate(x, y); ctx.scale(face < 0 ? -1 : 1, 1);
    if (id === 'pet_slime') {
      var sq = 1 + Math.sin(t / 160) * 0.08;
      ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.ellipse(0, -9 * sq, 12 / sq, 9 * sq, 0, Math.PI, 0); ctx.lineTo(12 / sq, 0); ctx.lineTo(-12 / sq, 0); ctx.fill();
      ctx.fillStyle = '#111827'; ctx.fillRect(2, -12, 2.5, 3.5); ctx.fillRect(7, -12, 2.5, 3.5);
    } else {
      var col = id === 'pet_cat' ? '#f97316' : '#a16207';
      ctx.translate(0, -bob);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, -10, 12, 7, 0, 0, 6.2832); ctx.fill();          // тело
      ctx.fillRect(-9, -6, 3, 6); ctx.fillRect(6, -6, 3, 6);                           // лапы
      ctx.beginPath(); ctx.arc(12, -17, 6.5, 0, 6.2832); ctx.fill();                   // голова
      if (id === 'pet_cat') { ctx.beginPath(); ctx.moveTo(8, -21); ctx.lineTo(9, -27); ctx.lineTo(12.5, -22); ctx.moveTo(13, -22); ctx.lineTo(16, -27); ctx.lineTo(17, -20); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(8.5, -15, 2.5, 5, 0.3, 0, 6.2832); ctx.fill(); }
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-11, -11); ctx.quadraticCurveTo(-18, -18 + Math.sin(t / 150) * 4, -16, -24); ctx.stroke(); // хвост
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(14.5, -18, 1.3, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
  // превью вещи для магазина: маленькая фигурка с надетой вещью
  function preview(cv, id) {
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, slot = id.split('_')[0];
    ctx.clearRect(0, 0, W, H);
    var c = {}; c[slot === 'cape' || slot === 'wings' ? 'back' : slot] = id;
    var w = 18, h = 60, x0 = W / 2 - w / 2, y0 = H - h - 6, t = Date.now();
    if (slot === 'trail') { var pts = []; for (var i = 0; i < 12; i++) pts.push([10 + i * 3.4, H - 8 - Math.sin(i / 2) * 4]); ctx.save(); drawTrail(ctx, id, pts, t); ctx.restore(); }
    ctx.save(); ctx.translate(x0, y0);
    drawFig(ctx, c, w, h, 1, 'back', t);
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2, 0, 6.2832); ctx.fill(); ctx.fillRect(0, w + 2, w, h - w - 2);
    drawFig(ctx, c, w, h, 1, 'front', t);
    ctx.restore();
    if (slot === 'pet') drawPet(ctx, id, W / 2 + 22, H - 6, -1, t);
    if (slot === 'nick') {
      ctx.save(); ctx.font = '700 16px sans-serif'; ctx.textAlign = 'center';
      nickStyle(ctx, id, Date.now()); ctx.fillText('Nick', W / 2, 18); ctx.restore();
    }
    if (slot === 'death') { for (var j = 0; j < 14; j++) { ctx.fillStyle = id === 'death_ghost' ? 'rgba(226,232,240,.9)' : 'hsl(' + j * 26 + ',90%,55%)'; ctx.fillRect(W / 2 + Math.cos(j) * 26, H / 2 + Math.sin(j * 1.7) * 22, 4, 4); } }
  }
  // ник под фигурой: золотой или переливающийся со свечением (идея «светящийся текст»)
  function nickStyle(ctx, id, t) {
    if (id === 'nick_gold') { ctx.fillStyle = '#f59e0b'; ctx.shadowColor = 'rgba(245,158,11,.8)'; ctx.shadowBlur = 6; }
    else if (id === 'nick_glow') { var c = 'hsl(' + ((t / 10) % 360) + ',95%,60%)'; ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 12; }
  }
  window.BFCosm = { nickStyle: nickStyle, NAMES: NAMES, drawFig: drawFig, drawTrail: drawTrail, drawPet: drawPet, preview: preview };
})();
