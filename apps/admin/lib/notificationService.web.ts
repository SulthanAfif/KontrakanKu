let audio: AudioContext | null = null;
let soundEnabled = true;
let notification: Notification | null = null;
let openCallback: (() => void) | null = null;

function chime() {
  if (!soundEnabled || !audio || audio.state !== "running") return;
  const start = audio.currentTime;
  [660, 880].forEach((frequency, index) => {
    const oscillator = audio!.createOscillator();
    const gain = audio!.createGain();
    const time = start + index * .18;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(.12, time + .015);
    gain.gain.exponentialRampToValueAtTime(.001, time + .3);
    oscillator.connect(gain);
    gain.connect(audio!.destination);
    oscillator.start(time);
    oscillator.stop(time + .32);
  });
}

export async function enableNotifications(_userId: string, sound: boolean): Promise<string> {
  soundEnabled = sound;
  if (typeof AudioContext !== "undefined") {
    audio ??= new AudioContext();
    await audio.resume();
  }
  if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
  return "Notifikasi aktif selama tab admin terbuka. Bunyi mengikuti pengaturan browser.";
}

export async function setNotificationSound(enabled: boolean): Promise<void> { soundEnabled = enabled; }

export async function restoreNotifications(_userId: string, _sound: boolean): Promise<string | null> { return null; }

export async function presentNotification(title: string, body: string, id: number, test = false) {
  chime();
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      notification = new Notification(title, { body, tag: `admin-${id}`, icon: "/favicon.ico", silent: true });
      notification.onclick = () => { window.focus(); if (!test) openCallback?.(); notification?.close(); };
    } catch { /* Some mobile browsers only support service-worker notifications. The inbox remains available. */ }
  }
}

export function onNotificationOpen(callback: () => void) {
  openCallback = callback;
  return () => { openCallback = null; notification?.close(); };
}

export async function unregisterNotifications() {
  notification?.close();
  await audio?.close();
  audio = null;
}
