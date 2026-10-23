import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { Reminders } from './types';

type NotificationsModule = typeof import('expo-notifications');

// Expo Go on Android doesn't ship the notifications native module, and importing it there
// crashes the app. Load it lazily and skip phone notifications in that case; the installed
// app (development or production build) has it.
const notificationsSupported =
  Platform.OS !== 'web' && !(Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

let loaded: Promise<NotificationsModule | null> | null = null;
function loadNotifications() {
  if (!loaded) {
    loaded = notificationsSupported
      ? import('expo-notifications').then((Notifications) => {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            }),
          });
          return Notifications;
        })
      : Promise.resolve(null);
  }
  return loaded;
}

const REMINDER_HOUR = 8; // morning reminder time

// Re-schedules local reminders from the latest server data: a morning summary for today
// and tomorrow, plus a 1-hour-before alert for each job that has a time.
export async function scheduleJobReminders(r: Reminders) {
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) {
      const req = await Notifications.requestPermissionsAsync();
      if (!req.granted) return;
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('jobs', {
        name: 'Job reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    const at = (dayOffset: number, hour: number, minute = 0) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute);
      return d;
    };
    const schedule = async (date: Date, title: string, body: string) => {
      if (date <= now) return;
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'jobs' },
      });
    };
    const summary = (jobs: Reminders['today']) =>
      jobs.map((j) => `${j.scheduled_time ?? ''} ${j.customer_name} (${j.job_type})`.trim()).join('\n');

    if (r.tomorrow.length) {
      await schedule(at(1, REMINDER_HOUR), `${r.tomorrow.length} job(s) today`, summary(r.tomorrow));
      await schedule(at(0, 18), `Tomorrow: ${r.tomorrow.length} job(s)`, summary(r.tomorrow));
    }
    if (r.today.length) {
      await schedule(at(0, REMINDER_HOUR), `${r.today.length} job(s) today`, summary(r.today));
    }
    for (const [offset, jobs] of [
      [0, r.today],
      [1, r.tomorrow],
    ] as const) {
      for (const j of jobs) {
        if (!j.scheduled_time) continue;
        const [h, m] = j.scheduled_time.split(':').map(Number);
        const d = at(offset, h, m);
        d.setHours(d.getHours() - 1);
        await schedule(d, `In 1 hour: ${j.customer_name}`, `${j.job_type} · ${j.address ?? ''}`);
      }
    }
    // KIV follow-ups: remind the salesman/admin to call the customer on the follow-up date.
    for (const [offset, day] of [
      [0, addDaysStr(0)],
      [1, addDaysStr(1)],
    ] as const) {
      const due = r.kiv.filter((j) => j.kiv_follow_up_date && (offset === 0 ? j.kiv_follow_up_date <= day : j.kiv_follow_up_date === day));
      if (due.length) {
        await schedule(
          at(offset, 9),
          `${due.length} KIV job(s) to follow up`,
          due.map((j) => `${j.customer_name}: ${j.kiv_reason ?? ''}`).join('\n')
        );
      }
    }

    const contracts = r.upcoming_contracts?.filter((c) => c.next_service_date <= addDaysStr(7)) ?? [];
    if (contracts.length) {
      await schedule(
        at(1, REMINDER_HOUR, 5),
        `${contracts.length} contract servicing due this week`,
        contracts.map((c) => `${c.next_service_date} ${c.customer_name}`).join('\n')
      );
    }
  } catch (e) {
    console.warn('Could not schedule reminders', e);
  }
}

function addDaysStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
