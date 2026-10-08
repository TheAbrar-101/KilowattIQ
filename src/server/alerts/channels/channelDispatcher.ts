/**
 * Channel Dispatcher - Multi-Channel Alert Router
 * 
 * Purpose:
 * Evaluates recipient contact methods, enforces user quiet hours,
 * routes notifications across Email (Resend), SMS (Local BD Gateway),
 * WhatsApp (Twilio), and Web Push (VAPID), and compiles delivery logs.
 */

import {
  AlertRecord,
  ChannelDeliveryResult,
  NotificationChannel,
  UserAlertPreferences,
  QuietHoursConfig,
} from '../types';
import { EmailResendChannel } from './emailResend';
import { SmsBdGatewayChannel } from './smsBdGateway';
import { WhatsAppTwilioChannel } from './whatsAppTwilio';
import { WebPushVapidChannel } from './webPushVapid';

export class ChannelDispatcher {
  private emailChannel = new EmailResendChannel();
  private smsChannel = new SmsBdGatewayChannel();
  private whatsAppChannel = new WhatsAppTwilioChannel();
  private webPushChannel = new WebPushVapidChannel();

  /**
   * Evaluates if the current local time falls within configured quiet hours.
   * Quiet hours often cross midnight (e.g. 23:00 to 07:00).
   */
  isQuietHoursActive(quietHours: QuietHoursConfig, date: Date = new Date()): boolean {
    if (!quietHours || !quietHours.enabled) return false;

    try {
      // Format current time in the user's target timezone (defaults to Asia/Dhaka)
      const tz = quietHours.timezone || 'Asia/Dhaka';
      const timeStr = date.toLocaleTimeString('en-US', {
        timeZone: tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });

      const [curH, curM] = timeStr.split(':').map(Number);
      const [startH, startM] = quietHours.startTime.split(':').map(Number);
      const [endH, endM] = quietHours.endTime.split(':').map(Number);

      const curMinutes = curH * 60 + curM;
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (startMinutes <= endMinutes) {
        // Same-day window (e.g. 13:00 to 15:00)
        return curMinutes >= startMinutes && curMinutes <= endMinutes;
      } else {
        // Overnight window (e.g. 23:00 to 07:00)
        return curMinutes >= startMinutes || curMinutes <= endMinutes;
      }
    } catch {
      return false;
    }
  }

  /**
   * Dispatches an alert record to all enabled notification channels for a user.
   * If quiet hours are active, suppresses audible channels (SMS, WhatsApp) unless CRITICAL.
   */
  async dispatch(
    alert: AlertRecord,
    preferences: UserAlertPreferences
  ): Promise<{
    deliveries: ChannelDeliveryResult[];
    quietHoursSuppressed: boolean;
  }> {
    const deliveries: ChannelDeliveryResult[] = [];
    const isQuiet = this.isQuietHoursActive(preferences.quietHours);

    // Critical alerts bypass quiet hours; warnings and info respect sleep periods
    const allowAudible = !isQuiet || alert.severity === 'CRITICAL';

    const defaultEmail = preferences.contacts.email || 'consumer@kilowattiq.local';
    const defaultPhone = preferences.contacts.phone || '+8801711000000';
    const defaultWhatsApp = preferences.contacts.whatsappNumber || defaultPhone;

    // 1. Email Channel
    if (preferences.enabledChannels.EMAIL) {
      const res = await this.emailChannel.send(defaultEmail, alert);
      deliveries.push(res);
      if (res.success) alert.channelsSent.push('EMAIL');
    }

    // 2. SMS Channel (Local BD Gateway)
    if (preferences.enabledChannels.SMS) {
      if (allowAudible) {
        const res = await this.smsChannel.send(defaultPhone, alert);
        deliveries.push(res);
        if (res.success) alert.channelsSent.push('SMS');
      } else {
        deliveries.push({
          channel: 'SMS',
          success: false,
          provider: 'Local BD SMS Gateway',
          error: 'Suppressed due to active Quiet Hours (23:00 - 07:00)',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 3. WhatsApp Channel (Twilio)
    if (preferences.enabledChannels.WHATSAPP) {
      if (allowAudible) {
        const res = await this.whatsAppChannel.send(defaultWhatsApp, alert);
        deliveries.push(res);
        if (res.success) alert.channelsSent.push('WHATSAPP');
      } else {
        deliveries.push({
          channel: 'WHATSAPP',
          success: false,
          provider: 'Twilio WhatsApp',
          error: 'Suppressed due to active Quiet Hours (23:00 - 07:00)',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 4. Web Push Channel (VAPID)
    if (preferences.enabledChannels.WEB_PUSH) {
      const res = await this.webPushChannel.send(preferences.contacts.pushSubscription, alert);
      deliveries.push(res);
      if (res.success) alert.channelsSent.push('WEB_PUSH');
    }

    return {
      deliveries,
      quietHoursSuppressed: isQuiet && !allowAudible,
    };
  }
}
