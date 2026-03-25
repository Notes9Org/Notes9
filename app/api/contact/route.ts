import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { resend } from "@/lib/resend"

export const runtime = "nodejs"

const contactSchema = z.object({
  email: z.string().email(),
  subject: z.string().min(3).max(160),
  context: z.string().min(10).max(5000),
  company: z.string().max(200).optional().default(""),
})

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

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service is not configured yet." },
        { status: 503 }
      )
    }

    const toEmail = process.env.CONTACT_TO_EMAIL || "admin@notes9.com"

    const data = await resend.emails.send({
      from: 'Notes9 Team <no-reply@resend.dev>', // You should update this to your verified domain later
      to: [toEmail],
      subject: `[Notes9 Contact] ${subject}`,
      replyTo: email,
      text: `New Notes9 marketing contact form submission\n\nFrom: ${email}\nSubject: ${subject}\n\nMessage:\n${context.trim()}`,
    })

    if (data.error) {
       console.error("Resend error:", data.error)
       throw new Error("Resend failed to send email")
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Contact route error:", error)
    return NextResponse.json(
      { error: "We could not send your message right now." },
      { status: 500 }
    )
  }
}
