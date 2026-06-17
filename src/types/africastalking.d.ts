/**
 * Minimal ambient declaration for the `africastalking` SDK (v0.8, ships no
 * types). Covers only the SMS surface the NotificationsService uses.
 */
declare module 'africastalking' {
  interface ATRecipient {
    statusCode?: number;
    number?: string;
    status: string; // 'Success' | 'Failed' | ...
    cost: string; // e.g. "KES 0.8000"
    messageId: string;
  }

  interface SmsSendResult {
    SMSMessageData?: {
      Message?: string;
      Recipients?: ATRecipient[];
    };
  }

  interface SmsClient {
    send(opts: {
      to: string[];
      message: string;
      from?: string;
    }): Promise<SmsSendResult>;
  }

  interface ATClient {
    SMS: SmsClient;
  }

  function AfricasTalking(creds: { username: string; apiKey: string }): ATClient;

  export = AfricasTalking;
}
