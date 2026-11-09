import { createServer, type Server, type Socket } from "node:net";

export interface CapturedMail { from: string; to: string[]; data: string }

/** Minimaler SMTP-Server für Tests: nimmt Mails ohne TLS/Anmeldung an und legt sie in `mails` ab. */
export async function startSmtpSink(port = 0): Promise<{ server: Server; port: number; mails: CapturedMail[]; close: () => Promise<void> }> {
  const mails: CapturedMail[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    let buffer = "";
    let inData = false;
    let current: CapturedMail = { from: "", to: [], data: "" };
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 sink ready");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          current.data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          mails.push(current);
          current = { from: "", to: [], data: "" };
          reply("250 queued");
          continue;
        }
        const eol = buffer.indexOf("\r\n");
        if (eol === -1) return;
        const line = buffer.slice(0, eol);
        buffer = buffer.slice(eol + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") reply("250 sink");
        else if (cmd === "MAIL") { current.from = /<([^>]*)>/.exec(line)?.[1] ?? ""; reply("250 ok"); }
        else if (cmd === "RCPT") { current.to.push(/<([^>]*)>/.exec(line)?.[1] ?? ""); reply("250 ok"); }
        else if (cmd === "DATA") { inData = true; reply("354 go"); }
        else if (cmd === "QUIT") { reply("221 bye"); socket.end(); }
        else reply("250 ok");
      }
    });
    socket.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  return {
    server, mails, port: typeof address === "object" && address ? address.port : port,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); for (const socket of sockets) socket.destroy(); }),
  };
}
