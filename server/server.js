import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4174);
const attempts = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '24kb' }));
app.use(express.urlencoded({ extended: false, limit: '24kb' }));
app.use(express.static(path.join(root, 'public'), { extensions: ['html'], maxAge: 0 }));

function clean(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((time) => now - time < 10 * 60_000);
  recent.push(now); attempts.set(ip, recent);
  return recent.length > 5;
}

function validate(raw) {
  const data = {
    name: clean(raw.name, 100), company: clean(raw.company, 200), phone: clean(raw.phone, 50),
    email: clean(raw.email, 254), message: clean(raw.message, 3000), model: clean(raw.model, 80), website: clean(raw.website, 200),
  };
  if (data.website) return { spam: true };
  if (data.name.length < 2) return { error: 'Укажите имя.' };
  if (!data.phone && !data.email) return { error: 'Укажите телефон или email.' };
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { error: 'Проверьте email.' };
  if (!raw.consent) return { error: 'Необходимо согласие на обработку данных.' };
  return { data };
}

async function sendMail(subject, text, replyTo) {
  const required = ['RESEND_API_KEY', 'MAIL_FROM', 'MAIL_TO'];
  if (!required.every((key) => process.env[key])) return { configured: false, ok: false };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [process.env.MAIL_TO], subject, text, reply_to: replyTo || undefined }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email API returned ${response.status}`);
  return { configured: true, ok: true };
}

async function sendTelegram(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return { configured: false, ok: false };
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
  return { configured: true, ok: true };
}

app.post('/api/request', async (req, res) => {
  if (rateLimited(req.ip || 'unknown')) return res.status(429).json({ message: 'Слишком много попыток. Повторите позже.' });
  const result = validate(req.body || {});
  if (result.spam) return res.status(202).json({ message: 'Заявка принята.' });
  if (result.error) return res.status(422).json({ message: result.error });

  const id = crypto.randomUUID().slice(0, 8).toUpperCase();
  const data = result.data;
  const text = [`Заявка ${id}`, `Модель: ${data.model || 'не указана'}`, `Имя: ${data.name}`, `Компания: ${data.company || 'не указана'}`, `Телефон: ${data.phone || 'не указан'}`, `Email: ${data.email || 'не указан'}`, `Сообщение: ${data.message || 'нет'}`, `Время: ${new Date().toISOString()}`].join('\n');
  const subject = `Заявка ${id}${data.model ? ` — ${data.model}` : ''}`;
  const channels = await Promise.allSettled([sendMail(subject, text, data.email), sendTelegram(text)]);
  const states = channels.map((entry) => entry.status === 'fulfilled' ? entry.value : { configured: true, ok: false });
  const configured = states.filter((state) => state.configured);
  const delivered = configured.filter((state) => state.ok).length;

  if (!configured.length) return res.status(503).json({ message: 'Демонстрационный режим: каналы доставки ещё не настроены.' });
  const partialAllowed = process.env.ALLOW_PARTIAL_DELIVERY !== 'false';
  const success = delivered === configured.length || (partialAllowed && delivered > 0);
  if (!success) {
    console.error(`[request:${id}] delivery failed`, states.map((state) => ({ configured: state.configured, ok: state.ok })));
    return res.status(502).json({ message: 'Не удалось доставить заявку. Попробуйте ещё раз или свяжитесь с нами напрямую.' });
  }
  if (delivered < configured.length) console.warn(`[request:${id}] one delivery channel failed`);
  return res.status(202).json({ message: `Заявка ${id} принята. Мы свяжемся с вами по указанным контактам.` });
});

app.use((req, res) => res.status(404).sendFile(path.join(root, 'public', '404.html')));

app.listen(port, () => console.log(`SIDA Belarus: http://localhost:${port}`));
