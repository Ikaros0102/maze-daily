import { register } from 'node:module';
try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {}

class MockAudioParam {
  constructor(initialValue = 0) {
    this.value = initialValue;
    this.events = [];
  }
  setValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'setValueAtTime', value: val, time });
    return this;
  }
  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'linearRampToValueAtTime', value: val, time });
    return this;
  }
  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'exponentialRampToValueAtTime', value: val, time });
    return this;
  }
  setTargetAtTime(target, time, tau) {
    this.value = target;
    this.events.push({ type: 'setTargetAtTime', target, time, tau });
    return this;
  }
  cancelScheduledValues(time) {
    this.events.push({ type: 'cancelScheduledValues', time });
    return this;
  }
}

class MockAudioNode {
  constructor(ctx) {
    this.context = ctx;
    this.destinations = new Set();
    this.channelCount = 2;
    this.channelCountMode = 'max';
  }
  connect(dest) {
    this.destinations.add(dest);
    return dest;
  }
  disconnect() {
    this.destinations.clear();
  }
}

class MockGainNode extends MockAudioNode {
  constructor(ctx, initialGain = 1.0) {
    super(ctx);
    this.gain = new MockAudioParam(initialGain);
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.buffer = null;
    this.loop = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.started = false;
    this.stopped = false;
    this.startTime = null;
    this.onended = null;
  }
  start(time = 0) {
    this.started = true;
    this.startTime = time;
    this.context.activeSources.push(this);
  }
  stop() {
    this.stopped = true;
    const idx = this.context.activeSources.indexOf(this);
    if (idx !== -1) this.context.activeSources.splice(idx, 1);
    if (this.onended) queueMicrotask(() => this.onended?.());
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new MockGainNode(this, 1.0);
    this.activeSources = [];
  }
  createGain() { return new MockGainNode(this); }
  createStereoPanner() { return { pan: new MockAudioParam(0), connect() {}, disconnect() {} }; }
  createBiquadFilter() { return { frequency: new MockAudioParam(20000), connect() {}, disconnect() {} }; }
  createBufferSource() { return new MockAudioBufferSourceNode(this); }
  decodeAudioData(buffer, success) {
    const mockAudioBuffer = { duration: 12.0, length: 529200, numberOfChannels: 2, sampleRate: 44100 };
    if (success) success(mockAudioBuffer);
    return Promise.resolve(mockAudioBuffer);
  }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

class MockLocalStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

class MockCache {
  constructor(name) { this.name = name; this.map = new Map(); }
  async put(req, resp) { this.map.set(typeof req === 'string' ? req : req.url, resp); }
  async match(req) { return this.map.get(typeof req === 'string' ? req : req.url) || null; }
}

class MockCacheStorage {
  constructor() { this.caches = new Map(); }
  async open(name) {
    let c = this.caches.get(name);
    if (!c) { c = new MockCache(name); this.caches.set(name, c); }
    return c;
  }
  async has(name) { return this.caches.has(name); }
  async delete(name) { return this.caches.delete(name); }
  async keys() { return Array.from(this.caches.keys()); }
}

globalThis.window = {
  localStorage: new MockLocalStorage(),
  AudioContext: MockAudioContext,
  caches: new MockCacheStorage(),
  location: { href: 'http://localhost:5173/' },
};
globalThis.localStorage = globalThis.window.localStorage;
globalThis.caches = globalThis.window.caches;
globalThis.document = { baseURI: 'http://localhost:5173/', documentElement: { lang: 'en' } };
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  headers: new Map([['content-type', 'audio/mp4'], ['content-length', '500000']]),
  arrayBuffer: async () => new ArrayBuffer(2048),
  clone: function() { return this; },
});

const { StemPlayer } = await import('../src/modules/audioNav/stems.ts');

async function testHangingPromise() {
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  player.start();

  console.log('Initiating switchPack(organic)...');
  const p1 = player.switchPack('organic');

  // Wait 50ms so p1 completes isAudioPackCachedAndValid and enters the 500ms crossfade setTimeout
  await new Promise((r) => setTimeout(r, 50));

  console.log('Initiating switchPack(synth) while p1 is in crossfade wait...');
  const p2 = player.switchPack('synth');

  // Let's see if p1 resolves within 600ms
  let p1Resolved = false;
  let p1Val = null;
  p1.then((val) => {
    p1Resolved = true;
    p1Val = val;
    console.log('p1 resolved with:', val);
  });

  const p2Result = await p2;
  console.log('p2 resolved with:', p2Result);

  // Wait another 600ms
  await new Promise((r) => setTimeout(r, 600));

  console.log('Is p1 resolved?', p1Resolved, 'Value:', p1Val);
}

testHangingPromise();
