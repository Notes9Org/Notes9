import net from "node:net"
import tls from "node:tls"

type SMTPConfig = {
  host: string
  port: number
  secure: boolean
  username?: string
  password?: string
  from: string
  to: string
}

type SMTPResponse = {
  code: number
  message: string
}

type SocketLike = net.Socket | tls.TLSSocket

function normalizeLine(line: string) {
  return line.replace(/\r?\n/g, "\r\n")
}

function dotStuff(value: string) {
  return normalizeLine(value)
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n")
}

function parseResponse(buffer: string): SMTPResponse | null {
  if (!buffer.endsWith("\r\n")) return null

  const lines = buffer.split("\r\n").filter(Boolean)
  if (lines.length === 0) return null

  const first = /^(\d{3})([ -])/.exec(lines[0])
  if (!first) return null

  const code = first[1]
  const last = new RegExp(`^${code} `)
  if (!last.test(lines[lines.length - 1])) return null

  return {
    code: Number(code),
    message: lines.join("\n"),
  }
}

class SMTPConnection {
  private socket: SocketLike
  private buffer = ""

  constructor(socket: SocketLike) {
    this.socket = socket
  }

  private async waitForResponse(timeoutMs = 15000): Promise<SMTPResponse> {
    return await new Promise<SMTPResponse>((resolve, reject) => {
      const onData = (chunk: Buffer | string) => {
        this.buffer += chunk.toString()
        const parsed = parseResponse(this.buffer)
        if (!parsed) return
        cleanup()
        this.buffer = ""
        resolve(parsed)
      }

      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }

      const onClose = () => {
        cleanup()
        reject(new Error("SMTP connection closed unexpectedly"))
      }

      const timer = setTimeout(() => {
        cleanup()
        reject(new Error("SMTP response timed out"))
      }, timeoutMs)

      const cleanup = () => {
        clearTimeout(timer)
        this.socket.off("data", onData)
        this.socket.off("error", onError)
        this.socket.off("close", onClose)
      }

      this.socket.on("data", onData)
      this.socket.on("error", onError)
      this.socket.on("close", onClose)
    })
  }

  async expect(expectedCodes: number | number[]) {
    const response = await this.waitForResponse()
    const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes]
    if (!codes.includes(response.code)) {
      throw new Error(`SMTP error ${response.code}: ${response.message}`)
    }
    return response
  }

  async send(line: string, expectedCodes: number | number[]) {
    this.socket.write(`${line}\r\n`)
    return await this.expect(expectedCodes)
  }

  upgradeToTLS(host: string) {
    const upgraded = tls.connect({
      socket: this.socket,
      host,
      servername: host,
    })
    this.socket = upgraded
    this.buffer = ""
  }

  close() {
    this.socket.end()
  }
}

async function openConnection(host: string, port: number, secure: boolean) {
  const socket = await new Promise<SocketLike>((resolve, reject) => {
    const onError = (error: Error) => reject(error)

    if (secure) {
      const tlsSocket = tls.connect({ host, port, servername: host }, () => resolve(tlsSocket))
      tlsSocket.once("error", onError)
      return
    }

    const plainSocket = net.createConnection({ host, port }, () => resolve(plainSocket))
    plainSocket.once("error", onError)
  })

  return new SMTPConnection(socket)
}

export async function sendSMTPMessage(
  config: SMTPConfig,
  message: { subject: string; text: string; replyTo?: string }
) {
  const connection = await openConnection(config.host, config.port, config.secure)

  try {
    await connection.expect(220)
    await connection.send("EHLO notes9.local", 250)

    if (!config.secure) {
      await connection.send("STARTTLS", 220)
      connection.upgradeToTLS(config.host)
      await connection.send("EHLO notes9.local", 250)
    }

    if (config.username && config.password) {
      await connection.send("AUTH LOGIN", 334)
      await connection.send(Buffer.from(config.username).toString("base64"), 334)
      await connection.send(Buffer.from(config.password).toString("base64"), 235)
    }

    await connection.send(`MAIL FROM:<${config.from}>`, 250)
    await connection.send(`RCPT TO:<${config.to}>`, [250, 251])
    await connection.send("DATA", 354)

    const headers = [
      `From: ${config.from}`,
      `To: ${config.to}`,
      `Subject: ${message.subject}`,
      message.replyTo ? `Reply-To: ${message.replyTo}` : "",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
    ]
      .filter(Boolean)
      .join("\r\n")

    const payload = `${headers}\r\n\r\n${dotStuff(message.text)}\r\n.`
    await connection.send(payload, 250)
    await connection.send("QUIT", 221)
  } finally {
    connection.close()
  }
}
