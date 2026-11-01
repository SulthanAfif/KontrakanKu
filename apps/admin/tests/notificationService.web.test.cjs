const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function service(permission = "granted", unsupported = false) {
  const notes = [];
  const banners = [];
  let focusCount = 0;
  let closeCount = 0;
  class AudioContext {
    state = "suspended";
    currentTime = 0;
    destination = {};
    async resume() { this.state = "running"; }
    async close() { this.state = "closed"; closeCount++; }
    createOscillator() { return { frequency: {}, connect() {}, start() { notes.push(true); }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  class Notification {
    static permission = permission;
    static async requestPermission() { return Notification.permission; }
    constructor(title, options) { this.title = title; this.options = options; banners.push(this); }
    close() { this.closed = true; }
  }
  const context = {
    exports: {},
    window: { focus() { focusCount++; }, ...(unsupported ? {} : { Notification }) },
    ...(unsupported ? {} : { AudioContext, Notification }),
  };
  const source = readFileSync(path.join(__dirname, "../lib/notificationService.web.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(outputText, context);
  return { api: context.exports, notes, banners, get focusCount() { return focusCount; }, get closeCount() { return closeCount; } };
}

test("activation unlocks sound; a muted alert still appears without sound", async () => {
  const { api, notes, banners } = service();
  await api.enableNotifications("admin", true);
  await api.presentNotification("New booking", "Review booking", 1);
  assert.equal(notes.length, 2);
  assert.equal(banners.length, 1);
  assert.equal(banners[0].options.silent, true, "avoid the browser adding a second sound");
  await api.setNotificationSound(false);
  await api.presentNotification("New booking", "Review booking", 2);
  assert.equal(notes.length, 2);
  assert.equal(banners.length, 2);
});

test("denied browser permissions preserve sound without creating a system banner", async () => {
  const { api, notes, banners } = service("denied");
  await api.enableNotifications("admin", true);
  await api.presentNotification("New booking", "Review booking", 1);
  assert.equal(notes.length, 2);
  assert.equal(banners.length, 0);
});

test("a notification opens bookings; a test notification never navigates", async () => {
  const ctx = service();
  let opened = 0;
  const dispose = ctx.api.onNotificationOpen(() => opened++);
  await ctx.api.enableNotifications("admin", true);
  await ctx.api.presentNotification("Test", "Test", 0, true);
  ctx.banners[0].onclick();
  assert.equal(opened, 0);
  await ctx.api.presentNotification("Booking", "Review", 1);
  ctx.banners[1].onclick();
  assert.equal(opened, 1);
  assert.equal(ctx.focusCount, 2);
  dispose();
  await ctx.api.unregisterNotifications();
  await ctx.api.presentNotification("After logout", "Review", 2);
  assert.equal(ctx.notes.length, 4, "logout closes the audio context");
  assert.equal(ctx.closeCount, 1);
});

test("unsupported browser APIs do not break the inbox", async () => {
  const { api, notes, banners } = service("granted", true);
  await api.enableNotifications("admin", true);
  await api.presentNotification("Booking", "Review", 1);
  await api.unregisterNotifications();
  assert.equal(notes.length, 0);
  assert.equal(banners.length, 0);
});
