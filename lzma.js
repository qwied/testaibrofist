/* AIBROFIST — распаковка LZMA (формат .lzma / lzma-alone).
   Оригинальный brofist.io сохраняет карты именно так: 5 байт настроек,
   8 байт длины и дальше поток. Ни в браузере, ни в Node такого декодера
   нет, поэтому он написан здесь целиком. Только распаковка — сжатие
   для импорта не нужно. */
(function (root) {
  'use strict';

  var kTopValue = 1 << 24;
  var kNumBitModelTotalBits = 11;
  var kNumMoveBits = 5;
  var PROB_INIT = (1 << kNumBitModelTotalBits) >>> 1;   // 1024

  var kNumPosBitsMax = 4;
  var kNumStates = 12;
  var kNumLenToPosStates = 4;
  var kNumAlignBits = 4;
  var kEndPosModelIndex = 14;
  var kNumFullDistances = 1 << (kEndPosModelIndex >>> 1);
  var kMatchMinLen = 2;

  function RangeDecoder(buf, pos) {
    this.buf = buf;
    this.pos = pos;
    this.range = 0xFFFFFFFF;
    this.code = 0;
    this.corrupted = false;
    if (buf[pos] !== 0) this.corrupted = true;
    this.pos++;
    for (var i = 0; i < 4; i++) this.code = ((this.code << 8) | this.buf[this.pos++]) >>> 0;
  }

  RangeDecoder.prototype.normalize = function () {
    if (this.range < kTopValue) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | (this.buf[this.pos++] | 0)) >>> 0;
    }
  };

  RangeDecoder.prototype.decodeDirectBits = function (numBits) {
    var res = 0;
    do {
      this.range = this.range >>> 1;
      this.code = (this.code - this.range) >>> 0;
      var t = 0 - (this.code >>> 31);
      this.code = (this.code + (this.range & t)) >>> 0;
      if (this.code === this.range) this.corrupted = true;
      this.normalize();
      res = ((res << 1) + t + 1) >>> 0;
    } while (--numBits);
    return res;
  };

  RangeDecoder.prototype.decodeBit = function (probs, index) {
    var v = probs[index];
    var bound = ((this.range >>> kNumBitModelTotalBits) * v) >>> 0;
    var sym;
    // сравнение беззнаковое
    if ((this.code >>> 0) < (bound >>> 0)) {
      v += ((1 << kNumBitModelTotalBits) - v) >>> kNumMoveBits;
      this.range = bound;
      sym = 0;
    } else {
      v -= v >>> kNumMoveBits;
      this.code = (this.code - bound) >>> 0;
      this.range = (this.range - bound) >>> 0;
      sym = 1;
    }
    probs[index] = v;
    this.normalize();
    return sym;
  };

  function bitTreeDecode(rc, probs, offset, numBits) {
    var m = 1;
    for (var i = 0; i < numBits; i++) m = (m << 1) + rc.decodeBit(probs, offset + m);
    return m - (1 << numBits);
  }

  function bitTreeReverseDecode(rc, probs, offset, numBits) {
    var m = 1, sym = 0;
    for (var i = 0; i < numBits; i++) {
      var b = rc.decodeBit(probs, offset + m);
      m = (m << 1) + b;
      sym |= b << i;
    }
    return sym;
  }

  function LenDecoder() {
    this.choice = new Uint16Array(2);
    this.lowCoder = new Uint16Array(16 * 8);
    this.midCoder = new Uint16Array(16 * 8);
    this.highCoder = new Uint16Array(256);
    this.reset();
  }
  LenDecoder.prototype.reset = function () {
    this.choice.fill(PROB_INIT);
    this.lowCoder.fill(PROB_INIT);
    this.midCoder.fill(PROB_INIT);
    this.highCoder.fill(PROB_INIT);
  };
  LenDecoder.prototype.decode = function (rc, posState) {
    if (rc.decodeBit(this.choice, 0) === 0)
      return bitTreeDecode(rc, this.lowCoder, posState * 8, 3);
    if (rc.decodeBit(this.choice, 1) === 0)
      return 8 + bitTreeDecode(rc, this.midCoder, posState * 8, 3);
    return 16 + bitTreeDecode(rc, this.highCoder, 0, 8);
  };

  /**
   * Распаковать поток LZMA-alone.
   * @param {Uint8Array|Array} input  байты файла (можно со знаком, как в .txt из игры)
   * @returns {Uint8Array}
   */
  function decompress(input) {
    var buf;
    if (input instanceof Uint8Array) buf = input;
    else {
      buf = new Uint8Array(input.length);
      for (var q = 0; q < input.length; q++) buf[q] = input[q] & 0xFF;
    }
    if (buf.length < 13) throw new Error('Файл слишком короткий для LZMA');

    var props = buf[0];
    if (props >= 9 * 5 * 5) throw new Error('Неверные настройки LZMA');
    var lc = props % 9;
    var rest = (props / 9) | 0;
    var lp = rest % 5;
    var pb = (rest / 5) | 0;

    var dictSize = (buf[1] | (buf[2] << 8) | (buf[3] << 16) | (buf[4] << 24)) >>> 0;
    if (dictSize < (1 << 12)) dictSize = 1 << 12;

    var outSize = 0, unknownSize = true;
    for (var i = 0; i < 8; i++) {
      if (buf[5 + i] !== 0xFF) unknownSize = false;
    }
    if (!unknownSize) {
      // размер до 2^53 хватает с запасом
      outSize = 0;
      for (var j = 7; j >= 0; j--) outSize = outSize * 256 + buf[5 + j];
    }
    if (outSize > 64 * 1024 * 1024) throw new Error('Слишком большой файл');

    var out = unknownSize ? [] : new Uint8Array(outSize);
    var outPos = 0;
    var put = unknownSize
      ? function (b) { out.push(b); outPos++; }
      : function (b) { out[outPos++] = b; };
    var get = unknownSize
      ? function (dist) { return out[outPos - dist]; }
      : function (dist) { return out[outPos - dist]; };

    var rc = new RangeDecoder(buf, 13);

    var numPosStates = 1 << pb;
    var posMask = numPosStates - 1;
    var lpMask = (1 << lp) - 1;

    var litProbs = new Uint16Array(0x300 << (lc + lp));
    litProbs.fill(PROB_INIT);

    var isMatch = new Uint16Array(kNumStates << kNumPosBitsMax);
    var isRep = new Uint16Array(kNumStates);
    var isRepG0 = new Uint16Array(kNumStates);
    var isRepG1 = new Uint16Array(kNumStates);
    var isRepG2 = new Uint16Array(kNumStates);
    var isRep0Long = new Uint16Array(kNumStates << kNumPosBitsMax);
    var posSlotDecoder = new Uint16Array(kNumLenToPosStates * 64);
    var posDecoders = new Uint16Array(1 + kNumFullDistances - kEndPosModelIndex);
    var alignDecoder = new Uint16Array(1 << kNumAlignBits);
    [isMatch, isRep, isRepG0, isRepG1, isRepG2, isRep0Long,
     posSlotDecoder, posDecoders, alignDecoder].forEach(function (a) { a.fill(PROB_INIT); });

    var lenDec = new LenDecoder();
    var repLenDec = new LenDecoder();

    var state = 0;
    var rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;

    for (;;) {
      if (!unknownSize && outPos >= outSize) break;
      if (rc.pos > buf.length + 8) throw new Error('Поток LZMA оборван');

      var posState = outPos & posMask;

      if (rc.decodeBit(isMatch, (state << kNumPosBitsMax) + posState) === 0) {
        // ---- литерал ----
        var prevByte = outPos === 0 ? 0 : get(1);
        var litState = (((outPos & lpMask) << lc) + (prevByte >>> (8 - lc))) >>> 0;
        var probsOff = 0x300 * litState;
        var symbol = 1;
        if (state >= 7) {
          var matchByte = get(rep0 + 1);
          do {
            var matchBit = (matchByte >>> 7) & 1;
            matchByte = (matchByte << 1) & 0xFF;
            var bit = rc.decodeBit(litProbs, probsOff + ((1 + matchBit) << 8) + symbol);
            symbol = (symbol << 1) | bit;
            if (matchBit !== bit) {
              while (symbol < 0x100) symbol = (symbol << 1) | rc.decodeBit(litProbs, probsOff + symbol);
              break;
            }
          } while (symbol < 0x100);
        }
        while (symbol < 0x100) symbol = (symbol << 1) | rc.decodeBit(litProbs, probsOff + symbol);
        put(symbol & 0xFF);
        state = state < 4 ? 0 : (state < 10 ? state - 3 : state - 6);
        continue;
      }

      var len;
      if (rc.decodeBit(isRep, state) !== 0) {
        // ---- повтор прежнего расстояния ----
        if (outPos === 0) throw new Error('Поток LZMA повреждён');
        if (rc.decodeBit(isRepG0, state) === 0) {
          if (rc.decodeBit(isRep0Long, (state << kNumPosBitsMax) + posState) === 0) {
            state = state < 7 ? 9 : 11;
            put(get(rep0 + 1));
            continue;
          }
        } else {
          var dist;
          if (rc.decodeBit(isRepG1, state) === 0) dist = rep1;
          else {
            if (rc.decodeBit(isRepG2, state) === 0) dist = rep2;
            else { dist = rep3; rep3 = rep2; }
            rep2 = rep1;
          }
          rep1 = rep0; rep0 = dist;
        }
        len = repLenDec.decode(rc, posState) + kMatchMinLen;
        state = state < 7 ? 8 : 11;
      } else {
        // ---- новое совпадение ----
        rep3 = rep2; rep2 = rep1; rep1 = rep0;
        len = lenDec.decode(rc, posState);
        state = state < 7 ? 7 : 10;

        var lenState = len < kNumLenToPosStates ? len : kNumLenToPosStates - 1;
        var posSlot = bitTreeDecode(rc, posSlotDecoder, lenState * 64, 6);
        if (posSlot < 4) rep0 = posSlot;
        else {
          var numDirect = (posSlot >>> 1) - 1;
          rep0 = (2 | (posSlot & 1)) << numDirect;
          if (posSlot < kEndPosModelIndex) {
            rep0 += bitTreeReverseDecode(rc, posDecoders, rep0 - posSlot, numDirect);
          } else {
            rep0 += rc.decodeDirectBits(numDirect - kNumAlignBits) * (1 << kNumAlignBits);
            rep0 += bitTreeReverseDecode(rc, alignDecoder, 0, kNumAlignBits);
            rep0 = rep0 >>> 0;
          }
        }
        if (rep0 === 0xFFFFFFFF) break;          // маркер конца потока
        len += kMatchMinLen;
      }

      if (rep0 + 1 > outPos) throw new Error('Поток LZMA повреждён (ссылка за начало)');
      var dst = rep0 + 1;
      while (len-- > 0) {
        put(get(dst));
        if (!unknownSize && outPos >= outSize) break;
      }
    }

    return unknownSize ? Uint8Array.from(out) : out;
  }

  function decompressToString(input) {
    var bytes = decompress(input);
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }

  var api = { decompress: decompress, decompressToString: decompressToString };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BFLZMA = api;
})(typeof window !== 'undefined' ? window : globalThis);
