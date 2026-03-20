"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

export const BentoGrid = ({
    className,
    children,
}: {
    className?: string
    children?: React.ReactNode
}) => {
    return (
        <div
            className={cn(
                "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto",
                className
            )}
        >
            {children}
        </div>
    )
}

export const BentoGridItem = ({
    className,
    title,
    description,
    header,
    icon,
}: {
    className?: string
    title?: string | React.ReactNode
    description?: string | React.ReactNode
    header?: React.ReactNode
    icon?: React.ReactNode
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            viewport={{ once: true }}
            className={cn(
                "row-span-1 flex h-full flex-col justify-between space-y-4 overflow-hidden rounded-2xl border border-border/50 bg-card/80 p-5 backdrop-blur-sm transition-shadow duration-300 hover:shadow-md dark:bg-card/60",
                className
            )}
        >
            {header}
            <div>
                {icon}
                <div className="mb-2 mt-3 text-lg font-semibold text-foreground">
                    {title}
                </div>
                <div className="text-sm leading-6 text-muted-foreground">
                    {description}
                </div>
            </div>
        </motion.div>
    )
}
