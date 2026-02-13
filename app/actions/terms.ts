"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { CURRENT_TERMS_VERSION } from "@/lib/constants"

export async function acceptTermsAction() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        throw new Error("User not authenticated")
    }

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
