import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { sendSMTPMessage } from "@/lib/smtp"

export const runtime = "nodejs"

const contactSchema = z.object({
  email: z.string().email(),
  subject: z.string().min(3).max(160),
  context: z.string().min(10).max(5000),
  company: z.string().max(200).optional().default(""),
})

function getSMTPConfig() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const secure = (process.env.SMTP_SECURE || "false").toLowerCase() === "true" || port === 465
  const username = process.env.SMTP_USER
  const password = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  const to = process.env.CONTACT_TO_EMAIL || "admin@notes9.com"

  if (!host || !port || !from) {
    return null
  }

  return {
    host,
    port,
    secure,
    username,
    password,
    from,
    to,
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json()
    const parsed = contactSchema.safeParse(json)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid contact request." }, { status: 400 })
    }

    const { email, subject, context, company } = parsed.data

    // Hidden field honeypot: any value likely indicates automated spam.
    if (company.trim()) {
      return NextResponse.json({ ok: true })
    }

    const smtpConfig = getSMTPConfig()
    if (!smtpConfig) {
      return NextResponse.json(
        { error: "Email service is not configured yet." },
        { status: 503 }
      )
    }

    const message = [
      "New Notes9 marketing contact form submission",
      "",
      `From: ${email}`,
      `Subject: ${subject}`,
      "",
      "Message:",
      context.trim(),
    ].join("\n")

    await sendSMTPMessage(smtpConfig, {
      subject: `[Notes9 Contact] ${subject}`,
      text: message,
      replyTo: email,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Contact route error:", error)
    return NextResponse.json(
      { error: "We could not send your message right now." },
      { status: 500 }
    )
  }
}
