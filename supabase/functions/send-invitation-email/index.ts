// supabase/functions/send-invitation-email/index.ts
// Deno-based Edge Function triggered by Database Webhook on org_invitations INSERT
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

interface WebhookPayload {
  type: "INSERT";
  table: "org_invitations";
  record: {
    id: string;
    organization_id: string;
    email: string;
    role_id: string;
    token: string;
    status: string;
    invited_by: string;
  };
}

/**
 * Builds a responsive HTML email template for organization invitations.
 * Exported for testability.
 */
export function buildInvitationEmailHtml(params: {
  orgName: string;
  roleName: string;
  inviterName: string;
  inviteUrl: string;
}): string {
  const { orgName, roleName, inviterName, inviteUrl } = params;

  const escapedOrgName = orgName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escapedRoleName = roleName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escapedInviterName = inviterName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escapedInviteUrl = inviteUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>You're invited to join ${escapedOrgName} on Notes9</title>
  <!--[if mso]>
  <style>table,td{font-family:Arial,sans-serif;}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.02em;">Notes9</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;font-weight:600;">You're invited!</h2>
              <p style="margin:0 0 24px;color:#52525b;font-size:15px;line-height:1.6;">
                <strong style="color:#18181b;">${escapedInviterName}</strong> has invited you to join
                <strong style="color:#18181b;">${escapedOrgName}</strong> on Notes9 as a
                <strong style="color:#18181b;">${escapedRoleName}</strong>.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${escapedInviteUrl}" target="_blank" style="display:inline-block;background-color:#18181b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;mso-padding-alt:0;">
                      <!--[if mso]><i style="mso-font-width:150%;mso-text-raise:18pt;">&nbsp;</i><![endif]-->
                      <span style="mso-text-raise:9pt;">Accept Invitation</span>
                      <!--[if mso]><i style="mso-font-width:150%;">&nbsp;</i><![endif]-->
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;color:#71717a;font-size:13px;line-height:1.5;">
                If the button above doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;word-break:break-all;">
                <a href="${escapedInviteUrl}" style="color:#2563eb;font-size:13px;text-decoration:underline;">${escapedInviteUrl}</a>
              </p>
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />
              <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.5;">
                This invitation was sent to you by ${escapedInviterName} from ${escapedOrgName}.
                If you weren't expecting this email, you can safely ignore it.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#fafafa;padding:20px 40px;text-align:center;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">&copy; Notes9. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req: Request) => {
  const payload: WebhookPayload = await req.json();
  const { record } = payload;

  // Only process pending invitations
  if (record.status !== "pending") {
    return new Response("Skipped: not pending", { status: 200 });
  }

  // Handle missing RESEND_API_KEY gracefully
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("Missing RESEND_API_KEY environment variable");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabase
      .from("org_invitations")
      .update({ status: "failed" })
      .eq("id", record.id);

    return new Response(
      JSON.stringify({ error: "Missing RESEND_API_KEY", status: "failed" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch org name, role name, inviter name in parallel
  const [{ data: org }, { data: role }, { data: inviter }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name")
      .eq("id", record.organization_id)
      .single(),
    supabase
      .from("org_roles")
      .select("name")
      .eq("id", record.role_id)
      .single(),
    supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", record.invited_by)
      .single(),
  ]);

  const appUrl = Deno.env.get("APP_URL") || "https://notes9.com";
  const inviteUrl = `${appUrl}/auth/invite?token=${record.token}`;
  const fromEmail =
    Deno.env.get("RESEND_FROM_EMAIL") || "Notes9 <no-reply@notes9.com>";

  try {
    // Send email via Resend REST API
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [record.email],
        subject: `You're invited to join ${org?.name || "a lab"} on Notes9`,
        html: buildInvitationEmailHtml({
          orgName: org?.name || "a lab",
          roleName: role?.name || "Member",
          inviterName: inviter
            ? `${inviter.first_name} ${inviter.last_name}`.trim()
            : "A colleague",
          inviteUrl,
        }),
      }),
    });

    // Update invitation status based on result
    const newStatus = resendRes.ok ? "sent" : "failed";
    await supabase
      .from("org_invitations")
      .update({ status: newStatus })
      .eq("id", record.id);

    return new Response(JSON.stringify({ status: newStatus }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to send invitation email:", error);

    // Update status to failed on any error
    await supabase
      .from("org_invitations")
      .update({ status: "failed" })
      .eq("id", record.id);

    return new Response(JSON.stringify({ status: "failed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
