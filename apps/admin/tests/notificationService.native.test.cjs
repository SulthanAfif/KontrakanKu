const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function service({ pushConfigured = false, granted = true, tokenGate } = {}) {
  const channels = [];
  const scheduled = [];
  const writes = [];
  const storage = new Map();
  let handler;
  let requestedToken = 0;
  const state = { currentState: "active" };
  const notifications = {
    AndroidImportance: { HIGH: 4, DEFAULT: 3 },
    setNotificationHandler(value) { handler = value; },
    async setNotificationChannelAsync(id, config) { channels.push({ id, ...config }); },
    async getPermissionsAsync() { return { granted }; },
    async requestPermissionsAsync() { return { granted }; },
    async getExpoPushTokenAsync() { requestedToken++; if (tokenGate) await tokenGate; return { data: "ExpoPushToken[test-device]" }; },
    async scheduleNotificationAsync(value) { scheduled.push(value); },
    async dismissAllNotificationsAsync() {},
  };
  const modules = {
    "react-native": { AppState: state, Platform: { OS: "android" } },
    "expo-constants": { default: { expoConfig: { extra: { pushConfigured, eas: { projectId: "project" } } } } },
    "expo-device": { isDevice: true },
    "expo-notifications": notifications,
    "@react-native-async-storage/async-storage": { default: {
      async getItem(key) { return storage.get(key) ?? null; },
      async setItem(key, value) { storage.set(key, value); },
      async removeItem(key) { storage.delete(key); },
    } },
    "./supabase": { supabase: { from() { return {
      async upsert(value) { writes.push({ action: "register", value }); return {}; },
      delete() { return { async eq(_column, value) { writes.push({ action: "delete", value }); return {}; } }; },
      update(value) { return { async eq() { writes.push({ action: "sound", value }); return {}; } }; },
    }; } } },
  };
  const context = { exports: {}, require(name) { if (!(name in modules)) throw new Error(`Unexpected module: ${name}`); return modules[name]; } };
  const source = readFileSync(path.join(__dirname, "../lib/notificationService.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(outputText, context);
  return { api: context.exports, channels, scheduled, writes, state, storage, get handler() { return handler; }, get requestedToken() { return requestedToken; } };
}

test("APK without Firebase supports local notifications without requesting a remote token", async () => {
  const ctx = service();
  const message = await ctx.api.enableNotifications("admin", true);
  assert.match(message, /Firebase/);
  assert.equal(ctx.requestedToken, 0);
  await ctx.api.presentNotification("Booking", "Review", 1);
  assert.equal(ctx.scheduled.length, 1);
  assert.equal(ctx.scheduled[0].content.sound, "default");
  assert.equal(ctx.scheduled[0].trigger.channelId, "booking-alerts");
  await ctx.api.setNotificationSound(false);
  await ctx.api.presentNotification("Booking", "Review", 2);
  assert.equal(ctx.scheduled[1].content.sound, false);
  assert.equal(ctx.scheduled[1].trigger.channelId, "booking-silent");
});

test("foreground push and local alerts cannot both play a sound", async () => {
  const ctx = service();
  const remote = await ctx.handler.handleNotification({ request: { content: { data: { screen: "Booking" } } } });
  assert.equal(remote.shouldPlaySound, false);
  const local = await ctx.handler.handleNotification({ request: { content: { data: { local: true } } } });
  assert.equal(local.shouldPlaySound, true);
  ctx.state.currentState = "background";
  await ctx.api.presentNotification("Booking", "Review", 1);
  assert.equal(ctx.scheduled.length, 0, "background uses remote push, not another local alert");
  const background = await ctx.handler.handleNotification({ request: { content: {} } });
  assert.equal(background.shouldShowBanner, true);
});

test("logout waits for registration and then removes its token", async () => {
  let resolveToken;
  const tokenGate = new Promise((resolve) => { resolveToken = resolve; });
  const ctx = service({ pushConfigured: true, tokenGate });
  const enabling = ctx.api.enableNotifications("admin", true);
  await new Promise((resolve) => setImmediate(resolve));
  const logout = ctx.api.unregisterNotifications();
  assert.equal(ctx.writes.length, 0);
  resolveToken();
  await Promise.all([enabling, logout]);
  assert.deepEqual(ctx.writes.map((write) => write.action), ["register", "delete"]);
  assert.equal(ctx.storage.size, 0);
});

test("denied Android permission cannot register a device or schedule an alert", async () => {
  const ctx = service({ pushConfigured: true, granted: false });
  await assert.rejects(ctx.api.enableNotifications("admin", true), /Izin notifikasi/);
  await ctx.api.presentNotification("Booking", "Review", 1);
  assert.equal(ctx.requestedToken, 0);
  assert.equal(ctx.scheduled.length, 0);
});
