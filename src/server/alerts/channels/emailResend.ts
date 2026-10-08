/**
 * Email Notification Channel - Resend Provider Adapter
 * 
 * Purpose:
 * Formats and dispatches calm, high-contrast energy alert emails using Resend.
 * Falls back to logged mock delivery if RESEND_API_KEY is not configured.
 */

import { AlertRecord, ChannelDeliveryResult } from '../types';

export class EmailResendChannel {
  private apiKey: string;
  private senderEmail: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || '';
    this.senderEmail = process.env.RESEND_FROM_EMAIL || 'KilowattIQ Alerts <alerts@kilowattiq.com>';
  }

  async send(recipientEmail: string, alert: AlertRecord): Promise<ChannelDeliveryResult> {
    const timestamp = new Date().toISOString();

    const subject = `KilowattIQ Notice: ${alert.title}`;
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #0f172a; color: #cbd5e1; border-radius: 16px; padding: 28px; border: 1px solid #1e293b;">
        <div style="border-bottom: 1px solid #1e293b; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: -0.02em;">KILOWATTIQ • কিলোওয়াট আইকিউ</h2>
          <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px;">Residential Energy Intelligence & Tariff Optimization</p>
        </div>
        
        <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
          <span style="display: inline-block; background: #d97706; color: #ffffff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; margin-bottom: 8px;">
            ${alert.severity} NOTICE
          </span>
          <h3 style="margin: 0 0 6px 0; color: #fbbf24; font-size: 16px; font-weight: 700;">${alert.title}</h3>
          <p style="margin: 0; color: #e2e8f0; font-size: 13px; line-height: 1.6;">${alert.message}</p>
          <p style="margin: 6px 0 0 0; color: #cbd5e1; font-size: 13px; line-height: 1.6;">${alert.messageBn}</p>
        </div>

        <div style="font-family: 'Courier New', monospace; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; padding-top: 14px;">
          Alert ID: ${alert.id} • Rule: ${alert.ruleType} • Time: ${alert.timestamp}
        </div>
      </div>
    `;

    if (this.apiKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.senderEmail,
            to: [recipientEmail],
            subject,
            html: htmlBody,
          }),
        });

        const data = await response.json();
        if (response.ok) {
          return {
            channel: 'EMAIL',
            success: true,
            provider: 'Resend',
            messageId: data.id,
            timestamp,
          };
        } else {
          return {
            channel: 'EMAIL',
            success: false,
            provider: 'Resend',
            error: data.message || 'Resend API returned an error',
            timestamp,
          };
        }
      } catch (err: any) {
        return {
          channel: 'EMAIL',
          success: false,
          provider: 'Resend',
          error: err.message || 'Network error reaching Resend API',
          timestamp,
        };
      }
    }

    // Calming mock delivery mode
    return {
      channel: 'EMAIL',
      success: true,
      provider: 'Resend (Simulated/Mock)',
      messageId: `resend-sim-${Date.now()}`,
      timestamp,
    };
  }
}
