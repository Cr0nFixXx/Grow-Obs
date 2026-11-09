#!/usr/bin/env node
// Test-Mailserver für die E2E-Suite (B-87): nimmt SMTP an (Port 2525, ohne TLS/Anmeldung) und gibt die Mails per HTTP
// aus (GET http://127.0.0.1:2526/mails, DELETE leert). Läuft nur lokal/in CI, nie in Produktion.
import { createServer as createHttp } from "node:http";
import { createServer as createSmtp } from "node:net";

const SMTP_PORT = Number(process.env.MAIL_SINK_SMTP_PORT ?? 2525);
const HTTP_PORT = Number(process.env.MAIL_SINK_HTTP_PORT ?? 2526);
let mails = [];

createSmtp((socket) => {
  socket.setEncoding("utf8");
  let buffer = "";
  let inData = false;
  let current = { to: [], data: "" };
  const reply = (line) => socket.write(`${line}\r\n`);
  reply("220 sink ready");
  socket.on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
      if (inData) {
        const end = buffer.indexOf("\r\n.\r\n");
        if (end === -1) return;
        current.data = buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        inData = false;
        mails.push(current);
        current = { to: [], data: "" };
        reply("250 queued");
        continue;
      }
      const eol = buffer.indexOf("\r\n");
      if (eol === -1) return;
      const line = buffer.slice(0, eol);
      buffer = buffer.slice(eol + 2);
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "RCPT") { current.to.push(/<([^>]*)>/.exec(line)?.[1] ?? ""); reply("250 ok"); }
      else if (cmd === "DATA") { inData = true; reply("354 go"); }
      else if (cmd === "QUIT") { reply("221 bye"); socket.end(); }
      else reply("250 ok");
    }
  });
  socket.on("error", () => undefined);
}).listen(SMTP_PORT, "127.0.0.1");

createHttp((req, res) => {
  if (req.method === "DELETE") { mails = []; res.writeHead(204).end(); return; }
  // Quoted-Printable-Zeilenumbrüche (=\r\n) und =3D auflösen, damit Links im Klartext lesbar sind.
  const decode = (raw) => raw.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(mails.map((mail) => ({ to: mail.to, body: decode(mail.data) }))));
}).listen(HTTP_PORT, "127.0.0.1");
