import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type FormPayload = {
  name: string;
  email: string;
  phone: string;
  message: string;
};

async function parsePayload(req: NextRequest): Promise<Partial<FormPayload>> {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const json = await req.json().catch(() => ({}));
    return json as Partial<FormPayload>;
  }

  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      data[key] = value;
    }
  });
  return data as Partial<FormPayload>;
}

async function sendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${errText}`);
  }

  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'Server misconfigured: missing RESEND_API_KEY' },
        { status: 500 }
      );
    }

    const payload = await parsePayload(req);
    const name = (payload.name || '').toString().trim();
    const email = (payload.email || '').toString().trim();
    const phone = (payload.phone || '').toString().trim();
    const message = (payload.message || '').toString().trim();

    if (!name || !email || !message) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: name, email, message' },
        { status: 400 }
      );
    }

    const fromAddress = process.env.MAIL_FROM || 'PA Form Handler <onboarding@resend.dev>';
    const ownerInbox = process.env.OWNER_INBOX || 'propertyloanwizard@gmail.com';

    const ownerHtml = `
      <h2>New form submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br/>')}</p>
    `;

    const userHtml = `
      <h2>Thanks, ${name}!</h2>
      <p>We received your message and will get back to you shortly.</p>
      <p><em>Your message:</em></p>
      <blockquote>${message.replace(/\n/g, '<br/>')}</blockquote>
    `;

    await Promise.all([
      sendEmail({
        apiKey,
        from: fromAddress,
        to: ownerInbox,
        subject: `New form submission from ${name}`,
        html: ownerHtml,
        replyTo: email,
      }),
      sendEmail({
        apiKey,
        from: fromAddress,
        to: email,
        subject: 'We received your message',
        html: userHtml,
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'submit-form' });
}
