/**
 * SMS Notification Channel - Local Bangladesh Gateway Adapter
 * 
 * Purpose:
 * Dispatches concise SMS alerts to Bangladeshi mobile numbers (+8801XXXXXXXXX)
 * compatible with local BD telecom aggregators (Onnorokom SMS, SSL Wireless, Greenweb).
 */

import { AlertRecord, ChannelDeliveryResult } from '../types';

export class SmsBdGatewayChannel {
  private apiUrl: string;
  private apiKey: string;
  private senderId: string;

  constructor() {
    this.apiUrl = process.env.BD_SMS_GATEWAY_URL || 'https://api.sms-bangladesh.com/v1/send';
    this.apiKey = process.env.BD_SMS_API_KEY || '';
    this.senderId = process.env.BD_SMS_SENDER_ID || 'KilowattIQ';
  }

  async send(recipientPhone: string, alert: AlertRecord): Promise<ChannelDeliveryResult> {
    const timestamp = new Date().toISOString();

    // Clean and validate Bangladeshi phone number format
    let formattedPhone = recipientPhone.replace(/[\s\-()]/g, '');
    if (formattedPhone.startsWith('01')) {
      formattedPhone = `+88${formattedPhone}`;
    } else if (formattedPhone.startsWith('8801')) {
      formattedPhone = `+${formattedPhone}`;
    }

    // Concise, non-alarming SMS text with both English and Bangla context
    const smsContent = `[KilowattIQ] ${alert.title}: ${alert.message}. শান্তভাবে সমাধান করতে অ্যাপ দেখুন।`;

    if (this.apiKey) {
      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
          },
          body: JSON.stringify({
            recipient: formattedPhone,
            sender_id: this.senderId,
            message: smsContent,
            type: 'unicode',
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          return {
            channel: 'SMS',
            success: true,
            provider: 'Local BD SMS Gateway',
            messageId: data.message_id || `bd-sms-${Date.now()}`,
            timestamp,
          };
        } else {
          return {
            channel: 'SMS',
            success: false,
            provider: 'Local BD SMS Gateway',
            error: data.message || 'SMS Gateway rejected request',
            timestamp,
          };
        }
      } catch (err: any) {
        return {
          channel: 'SMS',
          success: false,
          provider: 'Local BD SMS Gateway',
          error: err.message || 'SMS connection failed',
          timestamp,
        };
      }
    }

    // Calming mock delivery mode
    return {
      channel: 'SMS',
      success: true,
      provider: 'Local BD SMS Gateway (Simulated)',
      messageId: `bd-sms-sim-${Date.now()}`,
      timestamp,
    };
  }
}
