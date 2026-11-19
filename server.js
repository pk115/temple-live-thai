const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { normalizeGiftPayload, getGiftComboDelta } = require('./lib/tiktok-gift-payload.cjs');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'merit-state.json');

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. ชุดเซียมซี วัดศักดิ์สิทธิ์ (FORTUNE STICKS DECK)
// ============================================================================
const FORTUNE_DECK = [
  {
    number: 1,
    rank: 'ชั้นยอดเยี่ยม',
    title: 'อาทิตย์อุทัยแดนบูรพา',
    poem: 'ตะวันขึ้นทิศบูรพาส่องฟ้าดิน\nบุปผาบานสะพรั่งทั่วกิ่งก้านรับวสันต์\nยศศักดิ์ทรัพย์สินสมบูรณ์พูนผล\nครอบครัวสุขสงบ บุญลาภคงอยู่',
    meaning: 'ทุกสิ่งที่ตั้งใจล้วนสำเร็จเป็นมงคลยิ่ง การงานราบรื่น มีผู้ใหญ่อุปถัมภ์ ครอบครัวอบอุ่นปรองดอง',
    ttsSummary: 'เซียมซีใบที่ 1 ชั้นยอดเยี่ยม อาทิตย์อุทัยแดนบูรพา ทุกสิ่งที่ตั้งใจล้วนสำเร็จเป็นมงคลยิ่ง ยศศักดิ์ทรัพย์สินสมบูรณ์ มีผู้ใหญ่อุปถัมภ์'
  },
  {
    number: 8,
    rank: 'ดีเลิศ',
    title: 'ดอกบัวทองบานอบอวล',
    poem: 'บัวทองบานสะพรั่งกลางสระใส\nกลิ่นหอมฟุ้งไปทั่วแผ่นดิน\nใจศรัทธาจุดธูปอธิษฐาน\nฟ้าพุทธรับรู้สมดังปอง',
    meaning: 'ใจดีย่อมพบบุญวาสนา ขอทรัพย์ได้ทรัพย์ ขอความสงบได้ความสงบ โรคภัยสลายหาย',
    ttsSummary: 'เซียมซีใบที่ 8 ดีเลิศ ดอกบัวทองบานอบอวล ใจดีย่อมพบบุญวาสนา ขอทรัพย์ได้ทรัพย์ ขอความสงบได้ความสงบ'
  },
  {
    number: 12,
    rank: 'มงคลยิ่ง',
    title: 'มังกรพบเมฆา',
    poem: 'มังกรศักดิ์สิทธิ์พบเมฆาเขียว\nข้ามประตูมังกรชื่อเสียงรุ่งเรือง\nโยมมีใจมั่นทำความดีงาม\nบุญหนาลาภเพิ่มพูนทั่วครอบครัว',
    meaning: 'ดวงชะตากำลังพุ่งแรง สอบได้ที่ ค้าขายเจริญ พบโอกาสใหญ่เปลี่ยนชีวิต',
    ttsSummary: 'เซียมซีใบที่ 12 มงคลยิ่ง มังกรพบเมฆา ดวงชะตากำลังพุ่งแรง สอบได้ที่ ค้าขายเจริญ'
  },
  {
    number: 18,
    rank: 'ดีเลิศ',
    title: 'ลมวสันต์สมใจ',
    poem: 'ลมต้องใบเรือแล่นข้ามคลื่นไกล\nท่าฝั่งสงบแสงตะวันงดงาม\nทรัพย์สินเหลือเฟือ คู่ครองดีมี\nสี่ฤดูรุ่งเรืองเปี่ยมสุขใจ',
    meaning: 'เดินทางไกลพบโชค ค้าขายคล่อง ความรักราบรื่น ญาติมิตรสุขภาพแข็งแรง',
    ttsSummary: 'เซียมซีใบที่ 18 ดีเลิศ ลมวสันต์สมใจ แล่นใบลมดี ทรัพย์สินเหลือเฟือ คู่ครองดี'
  },
  {
    number: 24,
    rank: 'ดีปานกลาง',
    title: 'ฝนซา ฟ้าใส',
    poem: 'ฝนผ่านฟ้ากลับสว่างใสงาม\nอุปสรรคถอยห่างรับบุญใหม่มา\nรักษาใจศรัทธาอย่าท้อถอย\nดอกหอมผลหวานมาครบบริบูรณ์',
    meaning: 'ความยากลำบากเก่ากำลังผ่านไป โชคใหม่กำลังมา จงอดทนและตั้งสติให้สงบ',
    ttsSummary: 'เซียมซีใบที่ 24 ดีปานกลาง ฝนซา ฟ้าใส ฝนผ่านฟ้ากลับสว่าง อุปสรรคถอยห่าง รับบุญใหม่'
  },
  {
    number: 36,
    rank: 'ชั้นยอดเยี่ยม',
    title: 'ดาวบุญส่องสว่าง',
    poem: 'ดาวบุญสว่างไสวกลางคืนวันเพ็ญ\nพระกรุณาโปรดตลอดปี\nทรัพย์สินมาเคาะประตูเองโดยธรรมชาติ\nร้อยสิ่งสมใจ หมื่นสิ่งเป็นมงคล',
    meaning: 'ดาวบุญส่องดวง ภัยผ่านพ้น ทรัพย์สินพอเพียง ครอบครัวรุ่งเรือง',
    ttsSummary: 'เซียมซีใบที่ 36 ชั้นยอดเยี่ยม ดาวบุญส่องสว่าง ดาวบุญส่องดวง ทรัพย์สินมาเคาะประตูเอง ร้อยสิ่งสมใจ'
  },
  {
    number: 52,
    rank: 'ดีเลิศ',
    title: 'หยกล้ำค่าเปล่งประกาย',
    poem: 'หยกล้ำค่าเปล่งแสงเจิดจรัส\nเพียรขัดเกลามานานบัดนี้ได้เวลา\nมิตรแท้พบกันช่วยพยุงส่ง\nหน้าที่การงานรุ่งโรจน์สว่างไสว',
    meaning: 'ความพยายามที่ผ่านมาจะได้รับผลตอบแทนสมควร มีคนดีช่วยเหลือทั้งการงานและชีวิต',
    ttsSummary: 'เซียมซีใบที่ 52 ดีเลิศ หยกล้ำค่าเปล่งประกาย ความพยายามที่ผ่านมาจะได้รับผลตอบแทน หน้าที่การงานรุ่งโรจน์'
  },
  {
    number: 68,
    rank: 'มงคลยิ่ง',
    title: 'ม้าทรัพย์มาพร้อมกัน',
    poem: 'ม้าทรัพย์คู่เคียงมาถึงเรือนชาน\nค้าขายทำกินเบ่งบานดั่งบุปผา\nใจจริงบริจาคเพิ่มพูนบุญ\nมั่งมีศรีสุขทั่วทั้งครอบครัว',
    meaning: 'เซียมซีมงคลด้านทรัพย์และการค้า ควรทำความดีมากๆ เพื่อให้บุญมั่นคงยั่งยืน',
    ttsSummary: 'เซียมซีใบที่ 68 มงคลยิ่ง ม้าทรัพย์มาพร้อมกัน มงคลด้านทรัพย์และการค้า มั่งมีศรีสุขทั่วทั้งครอบครัว'
  },
  {
    number: 81,
    rank: 'ดีเลิศ',
    title: 'จันทร์เต็มดวงกลางฟ้า',
    poem: 'จันทร์เต็มดวงสว่างกลางฟ้าสารท\nส่องทั่วทิศไร้เมฆหมอก\nความรักสมบูรณ์ ครอบครัวปรองดอง\nใจสงบ หมื่นสิ่งไร้กังวล',
    meaning: 'ความรักและครอบครัวดีเยี่ยม คนโสดมีโอกาสพบคนถูกใจ ครอบครัวมีข่าวดี',
    ttsSummary: 'เซียมซีใบที่ 81 ดีเลิศ จันทร์เต็มดวงกลางฟ้า ความรักสมบูรณ์ ครอบครัวปรองดอง ใจสงบหมื่นสิ่งเป็นมงคล'
  },
  {
    number: 99,
    rank: 'ชั้นยอดเยี่ยม',
    title: 'หมื่นสิ่งสำเร็จสมบูรณ์',
    poem: 'เก้าชั้นเมฆขาวรัศมีสว่าง\nพระพุทธองค์เมตตาโปรดชาวโลก\nโยมใจศรัทธาน้อมถวายสักการะ\nอายุยืนยาวตลอดชีวิตสุขสวัสดิ์',
    meaning: 'เซียมซีสูงสุดเป็นมงคล สุขภาพแข็งแรงอายุยืน ยศศักดิ์รุ่งเรือง หมื่นสิ่งสำเร็จสมบูรณ์',
    ttsSummary: 'เซียมซีใบที่ 99 ชั้นยอดเยี่ยม หมื่นสิ่งสำเร็จสมบูรณ์ เซียมซีสูงสุดเป็นมงคล สุขภาพแข็งแรงอายุยืน หมื่นสิ่งสำเร็จดังใจ'
  }
];

// ============================================================================
// 2. ZEROTTS PYTHON WORKER MANAGER (VOICE: PREMWADEE)
// ============================================================================
class ZeroTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'premwadee';
    this.voices = ['premwadee'];
    this.model = 'edge-tts';
    this.pending = new Map();
    this.inflight = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    if (process.env.DISABLE_ZEROTTS_WORKER === '1') {
      this.status = 'disabled';
      return;
    }
    this.startWorker();
  }

  resolvePythonBin() {
    const venvPy = path.join(__dirname, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPy)) return venvPy;
    return 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    const scriptPath = path.join(__dirname, 'tts_worker.py');
    console.log(`[ZeroTTS] เริ่มทำงาน worker ด้วย ${pyBin} (เสียงเริ่มต้น: Premwadee)...`);

    this.status = 'loading';
    this.proc = spawn(pyBin, [scriptPath], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      let lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleWorkerLine(line.trim());
      }
    });

    this.proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString('utf8').trim();
      if (msg) console.log(`[ZeroTTS stderr] ${msg}`);
    });

    this.proc.on('exit', (code) => {
      console.warn(`[ZeroTTS] Worker หยุดทำงานด้วยรหัส ${code}`);
      this.ready = false;
      this.status = 'stopped';
      for (const [, item] of this.pending) {
        clearTimeout(item.timer);
        item.resolve({ ok: false, error: 'ZeroTTS worker exited' });
      }
      this.pending.clear();
    });
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'status') {
        this.status = msg.status;
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.voice = msg.voice || 'premwadee';
        this.voices = msg.voices || ['premwadee'];
        this.model = msg.model || this.model;
        console.log(`[ZeroTTS] พร้อมใช้งานหลัง ${msg.loadSec} วินาที! เสียง: ${this.voice} (${this.voices.join(', ')})`);
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          entry.resolve(msg);
        }
      } else if (msg.type === 'error') {
        console.error('[ZeroTTS Error]', msg.error);
        this.status = 'error';
        broadcastNotification('tts.status', this.getStatus());
      }
    } catch (err) {
      console.log('[ZeroTTS stdout]', line);
    }
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      engine: 'Edge TTS (th-TH)',
      voice: state.settings.ttsVoice || this.voice || 'premwadee',
      voices: this.voices,
      model: this.model
    };
  }

  synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return Promise.resolve({ ok: false, error: 'Empty text' });
    const voice = (voiceOverride || state.settings.ttsVoice || 'premwadee').toLowerCase();
    const dedupKey = `${voice}::${cleanText}`;

    if (this.inflight.has(dedupKey)) {
      return this.inflight.get(dedupKey);
    }

    const promise = new Promise((resolve) => {
      if (!this.proc || !this.ready) {
        return resolve({ ok: false, error: `ZeroTTS อยู่ในสถานะ: ${this.status}` });
      }
      const id = ++this.reqCounter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ZeroTTS synthesis timeout' });
      }, 30000);

      this.pending.set(id, { resolve, timer });
      const payload = JSON.stringify({ id, text: cleanText, voice }) + '\n';
      this.proc.stdin.write(payload);
    }).finally(() => {
      this.inflight.delete(dedupKey);
    });

    this.inflight.set(dedupKey, promise);
    return promise;
  }
}

// ============================================================================
// 3. สถานะวัดออนไลน์ & กระดานทองแห่งบุญ
// ============================================================================
const DEFAULT_STATE = {
  totalIncense: 108,
  totalMerit: 1080,
  woodenFishHits: 360,
  bellRings: 36,
  lanternCount: 18,
  fortuneCount: 12,
  activeIncenseSticks: 9,
  haloIntensity: 0.45,
  offerings: {
    lotus: 3,
    fruit: 2,
    lamp: 2,
    dragon: 1
  },
  devotees: {},
  recentEvents: [],
  settings: {
    ttsEnabled: true,
    ttsVoice: 'premwadee',
    bgMusicEnabled: true,
    sfxEnabled: true,
    smokeDensity: 1.0,
    autoSim: false,
    autoSimIntervalMs: 9500
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: '',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...saved,
        devotees: saved.devotees || {},
        offerings: { ...DEFAULT_STATE.offerings, ...(saved.offerings || {}) },
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    }
  } catch (e) {
    console.warn('[State] อ่าน merit-state.json ไม่ได้ ใช้ค่าเริ่มต้น:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      totalIncense: state.totalIncense,
      totalMerit: state.totalMerit,
      woodenFishHits: state.woodenFishHits,
      bellRings: state.bellRings,
      lanternCount: state.lanternCount,
      fortuneCount: state.fortuneCount,
      activeIncenseSticks: state.activeIncenseSticks,
      offerings: state.offerings,
      devotees: state.devotees,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] บันทึกไฟล์ผิดพลาด:', e.message);
    });
  }, 1200);
}

function getLeaderboard(limit = 6) {
  return Object.values(state.devotees)
    .sort((a, b) => b.merit - a.merit)
    .slice(0, limit)
    .map((d, index) => ({
      rank: index + 1,
      name: d.name,
      uniqueId: d.uniqueId,
      avatar: d.avatar || '',
      merit: d.merit,
      incense: d.incense || 0,
      lastWish: d.lastWish || ''
    }));
}
// ตัวกรองอักขระแปลก (Cuneiform, Zalgo, Braille, สแปม) และคำไม่สุภาพ; อนุญาตอักษรไทย (U+0E00-U+0E7F) และเวียดนามเดิม
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}\uFDFD\u2800-\u28FF\u2580-\u259F]|[\u0300-\u036F]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_VI_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\u0E00-\u0E7F\s.,!?]/g;
const ALLOWED_VI_NAME_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\u0E00-\u0E7F\s._-]/g;
const VI_LETTER_RE = /[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\u0E01-\u0E4E]/g;
const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|i cư|lừa đảo|lừa à|te-le gram|telegram|bố là trùm)/i;

function isBlockedSpamOrToxic(raw) {
  if (!raw) return true;
  const s = String(raw);
  if (WEIRD_SPAM_RE.test(s)) return true;
  if (BAD_WORDS_RE.test(s)) return true;
  return false;
}

function sanitizeUserName(rawName) {
  const normalized = String(rawName || '')
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_NAME_RE, ' ')
    .replace(/(.)\1{3,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 26);

  if (!normalized || BAD_WORDS_RE.test(normalized)) {
    return 'ผู้ร่วมบุญผู้มีบุญวาสนา';
  }
  const letters = normalized.match(VI_LETTER_RE) || [];
  if (letters.length < 2) {
    return 'ผู้ร่วมบุญผู้มีบุญวาสนา';
  }
  return normalized;
}

function sanitizeWishText(rawWish) {
  if (!rawWish) return '';
  const cleaned = String(rawWish)
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_TEXT_RE, ' ')
    .replace(/([.,!?])\1+/g, '$1')
    .replace(/(.)\1{2,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .replace(/^[.,!?\s-]+|[.,!?\s-]+$/g, '')
    .slice(0, 120);

  if (!cleaned || BAD_WORDS_RE.test(cleaned)) return '';
  const letters = cleaned.match(VI_LETTER_RE) || [];
  if (letters.length < 2) return '';
  return cleaned;
}

function recordDevotee(user, uniqueId, avatar, meritDelta, incenseDelta = 0, giftDelta = 0, wish = '') {
  const displayName = sanitizeUserName(user || uniqueId);
  const cleanWish = sanitizeWishText(wish);
  const key = (uniqueId || displayName).slice(0, 40);
  if (!state.devotees[key]) {
    state.devotees[key] = {
      name: displayName,
      uniqueId: uniqueId || displayName.toLowerCase().replace(/\s+/g, ''),
      avatar: avatar || '',
      merit: 0,
      incense: 0,
      gifts: 0,
      lastWish: ''
    };
  }
  const dev = state.devotees[key];
  dev.name = displayName;
  if (avatar) dev.avatar = avatar;
  dev.merit += meritDelta;
  dev.incense += incenseDelta;
  dev.gifts += giftDelta;
  if (cleanWish) dev.lastWish = cleanWish;

  state.totalMerit += meritDelta;
  state.haloIntensity = Math.min(1.0, 0.35 + (state.totalMerit % 1000) / 1400);
  return dev;
}

function pushEventLog(evt) {
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...evt
  };
  state.recentEvents.unshift(entry);
  if (state.recentEvents.length > 35) {
    state.recentEvents.length = 35;
  }
  return entry;
}

function getPublicState() {
  return {
    totalIncense: state.totalIncense,
    totalMerit: state.totalMerit,
    woodenFishHits: state.woodenFishHits,
    bellRings: state.bellRings,
    lanternCount: state.lanternCount,
    fortuneCount: state.fortuneCount,
    activeIncenseSticks: state.activeIncenseSticks,
    haloIntensity: state.haloIntensity,
    offerings: state.offerings,
    leaderboard: getLeaderboard(24),
    recentEvents: state.recentEvents.slice(0, 15),
    settings: state.settings,
    tiktok: state.tiktok,
    tts: zeroTts ? zeroTts.getStatus() : { ready: false, status: 'init', voice: 'premwadee' }
  };
}

// ============================================================================
// 4. พิธีกรรมโต้ตอบ (RITUAL HANDLERS)
// ============================================================================
const Rituals = {
  burnIncense(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 3));
    const wish = sanitizeWishText(params.wish) || 'ขอน้อมจุดธูปบูชาพระพุทธ ขอความสงบสุขและเป็นมงคล';
    const merit = count * 5;

    state.totalIncense += count;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + count);
    const devotee = recordDevotee(user, uniqueId, avatar, merit, count, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `นะโม อมิตาพุทธ อนุโมทนาโยม ${devotee.name} ที่ตั้งใจจุดธูปหอม ${count} ดอก ${wish}.`;

    const event = pushEventLog({
      type: 'burnIncense',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'premwadee'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  strikeWoodenFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const merit = count;

    state.woodenFishHits += count;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0);

    const event = pushEventLog({
      type: 'strikeWoodenFish',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit,
      ttsText: params.ttsText || ''
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  ringBell(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 1));
    const wish = sanitizeWishText(params.wish) || 'ตีระฆังปัญญา ขอให้กิเลสสลาย ปัญญาสว่างไสว';
    const merit = count * 10;

    state.bellRings += count;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0, wish);

    const ttsText = params.readTts
      ? `โยม ${devotee.name} ตีระฆังใหญ่อธิษฐานว่า ${wish}.`
      : '';

    const event = pushEventLog({
      type: 'ringBell',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'premwadee'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  sendPrayer(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'ขอให้บ้านเมืองสงบสุข ครอบครัวแข็งแรงมีความสุข';
    const merit = 10;

    state.lanternCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 1, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `คำอธิษฐานของโยม ${devotee.name} ${wish}. นะโม อมิตาพุทธ.`;

    const event = pushEventLog({
      type: 'sendPrayer',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      wish,
      merit,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'premwadee'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  offerGift(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(1, Number(params.coins) || 10);
    const giftType = ['lotus', 'fruit', 'lamp', 'dragon'].includes(params.giftType)
      ? params.giftType
      : (coins >= 100 ? 'dragon' : coins >= 20 ? 'fruit' : coins >= 5 ? 'lamp' : 'lotus');

    const giftLabels = {
      lotus: 'แท่นดอกบัวทอง',
      fruit: 'พานผลไม้ห้าสิริมงคล',
      lamp: 'ประทีปแก้วแห่งปัญญา',
      dragon: 'มหาพิธีมังกรทองถวายพระพุทธ'
    };
    const giftName = params.giftName || giftLabels[giftType];
    const multiplier = coins >= 100 ? 50 : coins >= 10 ? 30 : 20;
    const merit = Math.max(20, coins * multiplier);

    state.offerings[giftType] = (state.offerings[giftType] || 0) + 1;
    state.totalIncense += 3;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + 3);

    const wish = params.wish || `ถวาย ${giftName} แด่พระรัตนตรัย`;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 3, 1, wish);

    const ttsText = params.readTts === false
      ? ''
      : `บุญหาที่สุดมิได้! อนุโมทนาโยม ${devotee.name} ที่ตั้งจิตถวาย ${giftName} สะสมบุญเพิ่ม ${merit} แต้ม ขอพระพุทธเจ้าทรงคุ้มครองให้โยมสมหวังมงคลทุกประการ`;

    const event = pushEventLog({
      type: giftType === 'dragon' ? 'grandCeremony' : 'offerGift',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      giftType,
      giftId: params.giftId == null ? '' : String(params.giftId).slice(0, 80),
      giftName,
      giftGroupId: params.giftGroupId ? String(params.giftGroupId).slice(0, 180) : '',
      giftComboDelta: Math.max(1, Number(params.giftComboDelta) || 1),
      giftRepeatCount: Math.max(1, Number(params.giftRepeatCount) || 1),
      giftRepeatEnd: Boolean(params.giftRepeatEnd),
      giftStreakable: Boolean(params.giftStreakable),
      coins,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'premwadee'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  drawFortune(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const topic = sanitizeWishText(params.topic) || 'ครอบครัว ทรัพย์สิน และความสงบสุข';
    const fortune = FORTUNE_DECK[Math.floor(Math.random() * FORTUNE_DECK.length)];
    const merit = 10;

    state.fortuneCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0, `เสี่ยงเซียมซี: ใบที่ ${fortune.number} (${fortune.rank})`);

    const ttsText = params.readTts === false
      ? ''
      : `โยม ${devotee.name} เพิ่งเสี่ยงได้ ${fortune.ttsSummary}`;

    const event = pushEventLog({
      type: 'drawFortune',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      topic,
      fortune,
      merit,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'premwadee'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  grandCeremony(params = {}) {
    return this.offerGift({
      ...params,
      giftType: 'dragon',
      coins: Math.max(100, Number(params.coins) || 199),
      giftName: params.giftName || 'มหาพิธีรัศมีหมื่นวา'
    });
  },

  updateSettings(params = {}) {
    state.settings = {
      ...state.settings,
      ...params
    };
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    }
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  },

  resetMerit() {
    state.totalIncense = 9;
    state.totalMerit = 0;
    state.woodenFishHits = 0;
    state.bellRings = 0;
    state.lanternCount = 0;
    state.fortuneCount = 0;
    state.activeIncenseSticks = 3;
    state.offerings = { lotus: 1, fruit: 1, lamp: 1, dragon: 0 };
    state.devotees = {};
    state.recentEvents = [];
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 5. TIKTOK LIVE CONNECTOR & COMMENT PARSER
// ============================================================================
let tiktokConn = null;

const commentCooldownMap = new Map();

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || isBlockedSpamOrToxic(raw)) {
    return null;
  }

  const cleanWish = sanitizeWishText(raw);
  if (!cleanWish || cleanWish.length < 3) {
    return null;
  }

  // กันคนเดียวสแปมคอมเมนต์จนคิว TTS ตัน (คูลดาวน์ 3.5 วินาที/คน)
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 3500) {
      return null;
    }
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 600) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);
  const lower = cleanWish.toLowerCase();

  // 1. เสี่ยงเซียมซี / Xin xăm / Gieo quẻ
  if (
    lower.includes('xin xăm') ||
    lower.includes('xin xam') ||
    lower.includes('gieo quẻ') ||
    lower.includes('gieo que') ||
    lower.includes('rút quẻ') ||
    lower.includes('rut que') ||
    lower.includes('quẻ') ||
    lower.includes('que') ||
    lower.includes('เซียมซี') ||
    lower.includes('ดูดวง')
  ) {
    return Rituals.drawFortune({ user: cleanUser, uniqueId, avatar, topic: cleanWish });
  }

  // 2. ตีระฆัง / Thỉnh chuông
  if (lower.includes('chuông') || lower.includes('chuong') || lower.includes('thỉnh chuông') || lower.includes('ระฆัง')) {
    return Rituals.ringBell({ user: cleanUser, uniqueId, avatar, count: 1, wish: cleanWish, readTts: true });
  }

  // 3. เคาะระฆังไม้ / Gõ mõ
  if (lower.includes('gõ mõ') || lower.includes('go mo') || lower.includes('tụng kinh') || lower.includes('เคาะระฆังไม้') || lower.includes('ไม้เคาะ') || lower.includes('สวดมนต์')) {
    return Rituals.strikeWoodenFish({ user: cleanUser, uniqueId, avatar, count: 3 });
  }

  // 4. จุดธูป ไหว้พระ / Thắp hương / Bái Phật
  if (
    lower.includes('thắp hương') ||
    lower.includes('thap huong') ||
    lower.includes('dâng hương') ||
    lower.includes('dang huong') ||
    lower.includes('bái phật') ||
    lower.includes('bai phat') ||
    lower.includes('lạy phật') ||
    lower.includes('lay phat') ||
    lower.includes('จุดธูป') ||
    lower.includes('ไหว้พระ') ||
    lower.includes('กราบพระ')
  ) {
    return Rituals.burnIncense({ user: cleanUser, uniqueId, avatar, count: 3, wish: cleanWish });
  }

  // 5. ขอพร อธิษฐาน / Cầu nguyện / ลอยกระทง
  if (
    lower.includes('cầu') ||
    lower.includes('cau ') ||
    lower.includes('nguyện') ||
    lower.includes('nguyen') ||
    lower.includes('nam mô') ||
    lower.includes('nam mo') ||
    lower.includes('mô phật') ||
    lower.includes('mo phat') ||
    lower.includes('a di đà') ||
    lower.includes('a di da') ||
    lower.includes('bình an') ||
    lower.includes('tài lộc') ||
    lower.includes('chúc') ||
    lower.includes('ขอพร') ||
    lower.includes('อธิษฐาน') ||
    lower.includes('นะโม') ||
    lower.includes('สาธุ') ||
    lower.includes('อมิตาพุทธ')
  ) {
    return Rituals.sendPrayer({ user: cleanUser, uniqueId, avatar, wish: cleanWish });
  }

  return Rituals.burnIncense({ user: cleanUser, uniqueId, avatar, count: 1, wish: cleanWish });
}

const giftComboTracker = new Map();

async function resolveTikTokUsername(rawInput) {
  let input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('กรุณากรอก @username หรือลิงก์ TikTok Live ที่ต้องการเชื่อมต่อ');
  }
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('tiktok.com/')) {
    const urlToFetch = input.startsWith('http') ? input : `https://${input}`;
    const directMatch = urlToFetch.match(/tiktok\.com\/@([^/?#]+)/i);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }
    try {
      const resp = await fetch(urlToFetch, { redirect: 'follow' });
      const finalUrl = resp.url || '';
      const resolvedMatch = finalUrl.match(/tiktok\.com\/@([^/?#]+)/i);
      if (resolvedMatch && resolvedMatch[1]) {
        return resolvedMatch[1];
      }
    } catch (e) {
      console.warn('[TikTok URL Resolve Warning]', e.message);
    }
  }
  return input.replace(/^@/, '').split(/[/?#]/)[0].trim();
}

function extractUserFromEvent(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'ผู้ร่วมบุญ';
  const avatar =
    u.profilePictureUrl ||
    u.avatarLarge?.urlList?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { user, uniqueId, avatar };
}

async function connectTikTokLive(usernameOrUrl) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('ไม่พบ @username ที่ถูกต้องจากข้อมูลที่กรอก');
  }

  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  // A reconnect starts a new streak session; never carry cumulative counts
  // across rooms/connections even if TikTok reuses a group ID.
  giftComboTracker.clear();

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('temple.state', getPublicState());

  const connection = new TikTokLiveConnection(cleanUser, {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });
  tiktokConn = connection;

  const isCurrentConnection = () => tiktokConn === connection;

  connection.on(ControlEvent.CONNECTED, (roomState) => {
    if (!isCurrentConnection()) return;
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    console.log(`[TikTok Live] เชื่อมต่อห้อง @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('temple.state', getPublicState());
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    if (!isCurrentConnection()) return;
    giftComboTracker.clear();
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    console.log(`[TikTok Live] ตัดการเชื่อมต่อ @${cleanUser}`);
    broadcastNotification('temple.state', getPublicState());
  });

  connection.on(ControlEvent.ERROR, (err) => {
    if (!isCurrentConnection()) return;
    state.tiktok.lastError = err?.message || String(err);
    console.warn('[TikTok Live Warning]', state.tiktok.lastError);
    broadcastNotification('temple.state', getPublicState());
  });

  connection.on(WebcastEvent.ROOM_USER, (data) => {
    if (!isCurrentConnection()) return;
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('temple.viewerCount', { viewerCount });
    }
  });

  connection.on(WebcastEvent.MEMBER, (data) => {
    if (!isCurrentConnection()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    recordDevotee(user, uniqueId, avatar, 1, 0, 0, 'เข้าพระอุโบสถกราบพระ');
    broadcastNotification('temple.state', getPublicState());
  });

  connection.on(WebcastEvent.CHAT, (data) => {
    if (!isCurrentConnection()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    parseViewerComment(commentText, user, uniqueId, avatar);
  });

  connection.on(WebcastEvent.LIKE, (data) => {
    if (!isCurrentConnection()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const likeCount = Math.min(15, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1)));
    Rituals.strikeWoodenFish({ user, uniqueId, avatar, count: likeCount });
  });

  const handleSocialEvent = (data) => {
    if (!isCurrentConnection()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    Rituals.ringBell({
      user,
      uniqueId,
      avatar,
      count: 1,
      wish: 'มีบุญได้พบกันที่ร่มกาสาวพัสตร์ ขอให้สงบสุขและโชคดี',
      readTts: false
    });
  };
  connection.on(WebcastEvent.FOLLOW, handleSocialEvent);
  connection.on(WebcastEvent.SHARE, handleSocialEvent);
  connection.on(WebcastEvent.SOCIAL, (data) => {
    if (!isCurrentConnection()) return;
    const action = String(data?.action || '');
    const disp = String(data?.common?.displayText?.displayType || data?.displayType || '').toLowerCase();
    if (action === '1' || action === '3' || disp.includes('follow') || disp.includes('share')) {
      handleSocialEvent(data);
    }
  });

  connection.on(WebcastEvent.GIFT, (data) => {
    if (!isCurrentConnection()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftPayload = normalizeGiftPayload(data, uniqueId);
    const {
      giftId, giftName: rawGiftName, diamondCount, repeatCount, repeatEnd, groupId
    } = giftPayload;

    const deltaCount = getGiftComboDelta(giftComboTracker, giftPayload);
    if (deltaCount <= 0) {
      // A duplicate final frame still closes the browser-side visual streak,
      // even though it must not create another reward or ritual event.
      if (repeatEnd && groupId) {
        broadcastNotification('temple.gift-streak-end', { groupId });
      }
      return;
    }

    const totalCoins = diamondCount * deltaCount;
    const displayGiftName = rawGiftName
      ? (deltaCount > 1 ? `${deltaCount}x ${rawGiftName}` : rawGiftName)
      : '';

    console.log(`[TikTok Gift] ${user} ส่ง ${displayGiftName || 'ของขวัญไม่ทราบชื่อ'} (${totalCoins} เหรียญ)`);
    console.log('[TikTok Gift Payload]', {
      giftId: giftId || null,
      giftName: rawGiftName || null,
      diamondCount,
      repeatCount,
      repeatEnd,
      comboDelta: deltaCount,
      groupId
    });

    Rituals.offerGift({
      user,
      uniqueId,
      avatar,
      giftId,
      coins: totalCoins,
      giftName: displayGiftName,
      giftGroupId: groupId,
      giftComboDelta: deltaCount,
      giftRepeatCount: repeatCount,
      giftRepeatEnd: repeatEnd,
      giftStreakable: giftPayload.streakable,
      wish: `ขอน้อมถวาย ${displayGiftName || 'เครื่องสักการะ'} กราบพระอมิตาภพุทธเจ้า`
    });
  });

  try {
    const roomState = await connection.connect();
    if (!isCurrentConnection()) return state.tiktok;
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    broadcastNotification('temple.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    const message = err?.message || 'เชื่อมต่อห้อง Live ไม่ได้ (ตรวจสอบว่าบัญชีกำลังไลฟ์อยู่หรือไม่)';
    if (isCurrentConnection()) {
      giftComboTracker.clear();
      state.tiktok.connected = false;
      state.tiktok.connecting = false;
      state.tiktok.lastError = message;
      broadcastNotification('temple.state', getPublicState());
    }
    throw new Error(message);
  }
}

function disconnectTikTokLive() {
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  giftComboTracker.clear();
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  broadcastNotification('temple.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 6. AUTO-SIMULATION ENGINE (โหมดจำลองผู้ชมอัตโนมัติ)
// ============================================================================
let autoSimTimer = null;
const SIM_DEVOTEES = [
  { user: 'สมศรี ใจดี', uniqueId: 'ngocanh.98', wish: 'ลูกขออธิษฐานให้พ่อแม่แข็งแรงสงบสุขเสมอ' },
  { user: 'ธนกร มั่งมี', uniqueId: 'minhquan_bds', wish: 'ขอให้เดือนใหม่งานราบรื่น ทรัพย์สินคล่องตัว' },
  { user: 'ใจเย็น สบายดี', uniqueId: 'tam_an_99', wish: 'นะโม อมิตาพุทธ ขอให้โลกสงบสุข สรรพสัตว์เป็นสุข' },
  { user: 'วิชัย รุ่งเรือง', uniqueId: 'hoangnam.dev', wish: 'ขอให้สอบได้คะแนนสูง การงานก้าวหน้า' },
  { user: 'พิมพ์ชนก ศรีสุข', uniqueId: 'thanhha.lotus', wish: 'ขอให้ครอบครัวอบอุ่น ลูกหลานเป็นเด็กดีเรียนเก่ง' },
  { user: 'ประสิทธิ์ เจริญพร', uniqueId: 'ducthinh88', wish: 'ขอเสี่ยงเซียมซีเรื่องโชคลาภต้นปี' }
];

function runSingleSimulationStep() {
  const pick = SIM_DEVOTEES[Math.floor(Math.random() * SIM_DEVOTEES.length)];
  const roll = Math.random();
  if (roll < 0.30) {
    Rituals.burnIncense({ user: pick.user, uniqueId: pick.uniqueId, count: 3, wish: pick.wish });
  } else if (roll < 0.55) {
    Rituals.sendPrayer({ user: pick.user, uniqueId: pick.uniqueId, wish: pick.wish });
  } else if (roll < 0.75) {
    Rituals.drawFortune({ user: pick.user, uniqueId: pick.uniqueId, topic: pick.wish });
  } else if (roll < 0.90) {
    Rituals.offerGift({ user: pick.user, uniqueId: pick.uniqueId, giftType: 'lotus', coins: 15, giftName: 'ดอกบัวทองบริสุทธิ์' });
  } else {
    Rituals.ringBell({ user: pick.user, uniqueId: pick.uniqueId, count: 1, wish: pick.wish, readTts: true });
  }
}

function configureAutoSim(enabled) {
  state.settings.autoSim = Boolean(enabled);
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  if (state.settings.autoSim) {
    runSingleSimulationStep();
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 9500);
  }
}

// ============================================================================
// 7. JSON-RPC 2.0 DISPATCHER
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    case 'temple.getState':
      return getPublicState();
    case 'temple.burnIncense':
      return Rituals.burnIncense(params);
    case 'temple.strikeWoodenFish':
      return Rituals.strikeWoodenFish(params);
    case 'temple.ringBell':
      return Rituals.ringBell(params);
    case 'temple.sendPrayer':
      return Rituals.sendPrayer(params);
    case 'temple.offerGift':
      return Rituals.offerGift(params);
    case 'temple.drawFortune':
      return Rituals.drawFortune(params);
    case 'temple.grandCeremony':
      return Rituals.grandCeremony(params);
    case 'temple.updateSettings':
      return Rituals.updateSettings(params);
    case 'temple.resetMerit':
      return Rituals.resetMerit();
    case 'temple.comment':
      return parseViewerComment(params.comment, params.user, params.uniqueId, params.avatar);
    case 'temple.speak': {
      const res = await zeroTts.synthesize(params.text, params.voice || 'premwadee');
      if (res.ok && params.broadcast !== false) {
        broadcastNotification('tts.play', {
          text: params.text,
          voice: res.voice,
          url: res.url
        });
      }
      return res;
    }
    case 'temple.ttsStatus':
      return zeroTts.getStatus();
    case 'live.connect':
      return await connectTikTokLive(params.username);
    case 'live.disconnect':
      return disconnectTikTokLive();
    case 'live.setAutoSim':
      configureAutoSim(Boolean(params.enabled));
      saveState();
      broadcastNotification('temple.state', getPublicState());
      return getPublicState();
    default:
      throw new Error(`ไม่พบเมธอด JSON-RPC: ${method}`);
  }
}

// ============================================================================
// 8. EXPRESS + WEBSOCKET SERVER
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/tts-cache', express.static(TTS_CACHE_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// HTTP JSON-RPC 2.0 Endpoint
app.post('/rpc', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC Request: ขาด method' }
    });
  }
  try {
    const result = await handleRpcCall(method, params || {});
    res.json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      result
    });
  } catch (err) {
    res.status(200).json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      error: { code: -32000, message: err.message || 'Server error' }
    });
  }
});

// ZeroTTS HTTP Endpoint (Premwadee default)
app.all('/api/tts', async (req, res) => {
  const text = (req.body?.text || req.query?.text || '').trim();
  const voice = (req.body?.voice || req.query?.voice || state.settings.ttsVoice || 'premwadee').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'ขาดข้อความที่ต้องอ่าน' });
  }
  const result = await zeroTts.synthesize(text, voice);
  res.json(result);
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'temple.state',
      params: getPublicState()
    })
  );

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

const zeroTts = new ZeroTTSManager();

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`🪷 วัดออนไลน์ TIKTOK LIVE RPC เริ่มทำงานแล้ว`);
  console.log(`📺 หน้าจอไลฟ์ (9:16 OBS): http://localhost:${PORT}`);
  console.log(`🎛️ แผงควบคุม RPC Admin: http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint   : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  // Visual/browser audits can opt out of external live connections.
  if (process.env.DISABLE_TIKTOK_AUTOCONNECT !== '1') {
    // เชื่อมต่ออัตโนมัติเมื่อกำหนด TIKTOK_USER หรือเคยเชื่อมต่อไว้
    const defaultChannel = process.env.TIKTOK_USER || state.tiktok?.username || '';
    if (defaultChannel) {
      connectTikTokLive(defaultChannel).catch((err) => {
        console.warn(`[Auto-Connect @${defaultChannel}] ยังเชื่อมต่อไม่ได้ทันที:`, err.message);
      });
    }
  }
});
