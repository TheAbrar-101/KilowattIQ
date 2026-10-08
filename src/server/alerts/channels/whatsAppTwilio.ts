/**
 * WhatsApp Notification Channel - Twilio Adapter
 * 
 * Purpose:
 * Sends rich text and structured notifications over WhatsApp via Twilio's API.
 * Uses calm formatting with emoji indicators and clear step-by-step guidance.
 */

import { AlertRecord, ChannelDeliveryResult } from '../types';

export class WhatsAppTwilioChannel {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  }

  async send(recipientPhone: string, alert: AlertRecord): Promise<ChannelDeliveryResult> {
    const timestamp = new Date().toISOString();

    let formattedPhone = recipientPhone.replace(/[\s\-()]/g, '');
    if (formattedPhone.startsWith('01')) {
      formattedPhone = `+88${formattedPhone}`;
    }
    const toNumber = formattedPhone.startsWith('whatsapp:') ? formattedPhone : `whatsapp:${formattedPhone}`;

    const body = `*⚡ KilowattIQ Energy Notice*\n` +
      `*${alert.title}*\n\n` +
      `${alert.message}\n` +
      `_${alert.messageBn}_\n\n` +
      `📊 Severity: ${alert.severity}\n` +
      `🕒 Recorded: ${new Date(alert.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}\n` +
      `Tap your KilowattIQ dashboard for calm, optimal recommendations.`;

    if (this.accountSid && this.authToken) {
      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
        const params = new URLSearchParams();
        params.append('From', this.fromNumber);
        params.append('To', toNumber);
        params.append('Body', body);

        const basicAuth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        const data = await response.json();
        if (response.ok) {
          return {
            channel: 'WHATSAPP',
            success: true,
            provider: 'Twilio WhatsApp',
            messageId: data.sid,
            timestamp,
          };
        } else {
          return {
            channel: 'WHATSAPP',
            success: false,
            provider: 'Twilio WhatsApp',
            error: data.message || 'Twilio WhatsApp error',
            timestamp,
          };
        }
      } catch (err: any) {
        return {
          channel: 'WHATSAPP',
          success: false,
          provider: 'Twilio WhatsApp',
          error: err.message || 'Twilio connection failed',
          timestamp,
        };
      }
    }

    return {
      channel: 'WHATSAPP',
      success: true,
      provider: 'Twilio WhatsApp (Simulated)',
      messageId: `twilio-wa-sim-${Date.now()}`,
      timestamp,
    };
  }
}
