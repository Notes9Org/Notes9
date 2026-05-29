"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { revalidatePath } from "next/cache"
import { CURRENT_TERMS_VERSION } from "@/lib/constants"

export async function acceptTermsAction() {
    const user = await getCurrentUser()
    if (!user) {
        throw new Error("User not authenticated")
    }
    const supabase = await createClient()

    const { error } = await supabase.auth.updateUser({
        data: {
            terms_accepted_version: CURRENT_TERMS_VERSION,
            terms_accepted_at: new Date().toISOString(),
        },
    })

    if (error) {
        throw new Error(error.message)
    }

    revalidatePath("/", "layout")
    return { success: true }
}
