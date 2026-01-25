"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { LucideIcon } from "lucide-react"

interface FeaturePoint {
    icon: LucideIcon
    title: string
    description: string
}

interface PlatformFeatureProps {
    title: string
    description: string
    icon: LucideIcon
    features: FeaturePoint[]
    images: string[] // [Main Image, Background Image]
    align?: "left" | "right" // Text alignment relative to screen (default: left layout = Text Left, Image Right)
    index: number // For animation delay
}

export function PlatformFeature({
    title,
    description,
    icon: Icon,
    features,
    images,
    align = "left",
    index,
}: PlatformFeatureProps) {
    const isImageRight = align === "left"

    return (
        <section className={cn("py-24 overflow-hidden", index % 2 === 1 ? "bg-muted/30 border-y border-border/40" : "bg-background")}>
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center")}>
                    {/* Text Content */}
                    <motion.div
                        initial={{ opacity: 0, x: isImageRight ? -20 : 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        viewport={{ once: true }}
                        className={cn("space-y-8", !isImageRight && "lg:order-2")}
                    >
                        <div className="space-y-6">
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center",
                                index % 2 === 0 ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                            )}>
                                <Icon className="h-6 w-6" />
                            </div>

                            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
                                {title}
                            </h2>

                            <p className="text-lg text-muted-foreground leading-relaxed text-pretty">
                                {description}
                            </p>
                        </div>

                        <ul className="space-y-6">
                            {features.map((feature, i) => (
                                <li key={i} className="flex gap-4">
                                    <div className="mt-1 bg-primary/10 p-2 rounded-lg h-fit">
                                        <feature.icon className="h-5 w-5 text-primary flex-shrink-0" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-foreground mb-1">
                                            {feature.title}
                                        </h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {feature.description}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    {/* Image Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, rotateY: isImageRight ? 10 : -10 }}
                        whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
                        transition={{ duration: 0.8, type: "spring", bounce: 0.2 }}
                        viewport={{ once: true }}
                        className={cn("relative mx-auto w-full max-w-[600px] perspective-1000", !isImageRight && "lg:order-1")}
                    >
                        {/* Background Image (The "Tab") */}
                        {images.length > 1 && (
                            <div
                                className={cn(
                                    "absolute top-0 w-full aspect-[16/10] rounded-xl border border-border/40 bg-muted shadow-xl overflow-hidden z-0",
                                    isImageRight ? "-right-6 -translate-y-6 rotate-3 scale-95 opacity-60" : "-left-6 -translate-y-6 -rotate-3 scale-95 opacity-60"
                                )}
                            >
                                <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10" />
                                <img
                                    src={`/${images[1]}`}
                                    alt="Background Tab"
                                    className="w-full h-full object-cover object-top"
                                />
                            </div>
                        )}

                        {/* Foreground Image */}
                        <div className="relative z-10 w-full aspect-[16/10] rounded-xl border border-border/60 bg-background shadow-2xl overflow-hidden group">
                            {/* Browser Chrome / Header Mockup */}
                            <div className="h-8 bg-muted/80 backdrop-blur border-b border-border/40 flex items-center px-4 gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                                <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
                            </div>
                            <img
                                src={`/${images[0]}`}
                                alt={title}
                                className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                            />

                            {/* Optional: Glow effect behind */}
                            <div className={cn(
                                "absolute -inset-4 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-xl blur-2xl -z-10 opacity-40 animate-pulse",
                            )}></div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    )
}
