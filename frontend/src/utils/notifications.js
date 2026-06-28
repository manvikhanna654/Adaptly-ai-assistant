/**
 * Smart Browser Reminders
 * Manages notification permissions and study reminder scheduling.
 */

const PREF_KEY = 'study_reminder_prefs';
const ENABLED_KEY = 'study_reminders_enabled';

/**
 * Request notification permission (call after onboarding completes).
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  return result;
}

/**
 * Save user study preferences (peak_time string like "morning", "evening").
 */
export function saveStudyPreferences({ peakTime, subjectName, durationMin }) {
  const prefs = { peakTime, subjectName, durationMin };
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

/**
 * Get/set reminder toggle.
 */
export function setRemindersEnabled(enabled) {
  localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
}

export function getRemindersEnabled() {
  return localStorage.getItem(ENABLED_KEY) !== '0'; // default on
}

/**
 * Compute milliseconds until the next study window start.
 * peak_time: 'morning'=7AM, 'afternoon'=13PM, 'evening'=18PM, 'night'=21PM
 */
function msUntilStudyWindow(peakTime) {
  const hours = { morning: 7, afternoon: 13, evening: 18, night: 21 };
  const targetHour = hours[peakTime] ?? 9;

  const now = new Date();
  const target = new Date();
  target.setHours(targetHour, 0, 0, 0);

  if (target <= now) {
    // Already passed today; schedule for tomorrow
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

let reminderTimeoutId = null;

/**
 * Schedule a browser notification for the user's study window.
 */
export function scheduleStudyReminder({ peakTime, subjectName, durationMin }) {
  if (!getRemindersEnabled()) return;
  if (Notification.permission !== 'granted') return;

  // Cancel any existing scheduled notification
  if (reminderTimeoutId !== null) {
    clearTimeout(reminderTimeoutId);
    reminderTimeoutId = null;
  }

  const delay = msUntilStudyWindow(peakTime);
  reminderTimeoutId = setTimeout(() => {
    // Skip if app is focused
    if (document.hasFocus()) return;
    try {
      new Notification('Time to study 📚', {
        body: `Your next session: ${subjectName || 'Planned'} · ${durationMin || 25} min`,
        icon: '/favicon.ico',
        tag: 'study-reminder',
        requireInteraction: false,
      });
    } catch (_) {}
    // Re-schedule for next day
    scheduleStudyReminder({ peakTime, subjectName, durationMin });
  }, delay);
}

/**
 * Cancel all scheduled reminders.
 */
export function cancelReminders() {
  if (reminderTimeoutId !== null) {
    clearTimeout(reminderTimeoutId);
    reminderTimeoutId = null;
  }
}

/**
 * Initialize reminders on app load (reads from localStorage).
 */
export function initReminders(subjects = []) {
  if (!getRemindersEnabled()) return;
  const rawPrefs = localStorage.getItem(PREF_KEY);
  if (!rawPrefs) return;
  try {
    const prefs = JSON.parse(rawPrefs);
    const topSubject = subjects[0]?.name || 'Study session';
    scheduleStudyReminder({
      peakTime: prefs.peakTime || 'morning',
      subjectName: topSubject,
      durationMin: prefs.durationMin || 25,
    });
  } catch (_) {}
}
