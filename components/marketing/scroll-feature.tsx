"use client"

import { useRef } from "react"
import { useScroll, useTransform, motion } from "framer-motion"
import { LucideIcon } from "lucide-react"

interface FeatureProps {
    title: string
    description: string
    icon: LucideIcon
    image: string
    align?: "left" | "right"
}

export function ScrollFeature({ title, description, icon: Icon, image, align = "left" }: FeatureProps) {
    const ref = useRef<HTMLDivElement>(null)
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start end", "end start"],
    })

    // Parallax effect with 3D rotation
    const y = useTransform(scrollYProgress, [0, 1], [-30, 30])
    const opacity = useTransform(scrollYProgress, [0, 0.2, 0.9, 1], [0, 1, 1, 0])
    const scale = useTransform(scrollYProgress, [0, 0.2, 0.9, 1], [0.92, 1, 1, 0.92])
    // Subtle 3D rotation based on scroll position - enters tilted, straightens out
    const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [10, 0, -10])

    const isLeft = align === "left"

    return (
        <section ref={ref} className="min-h-[90vh] flex items-center justify-center py-20 overflow-hidden bg-background">
            <div className="container mx-auto px-4 md:px-6">
                <div className={`flex flex-col lg:flex-row items-center gap-12 lg:gap-24 ${!isLeft ? 'lg:flex-row-reverse' : ''}`}>

                    {/* Text Content */}
                    <div className="flex-1 space-y-8 z-10 max-w-xl">
                        <motion.div
                            initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            viewport={{ once: true }}
                            className="space-y-6"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center text-primary mb-6 shadow-sm">
                                <Icon className="w-7 h-7" />
                            </div>
                            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground text-balance leading-tight">
                                {title}
                            </h2>
                            <p className="text-xl text-muted-foreground leading-relaxed">
                                {description}
                            </p>
                            <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: "100px" }}
                                transition={{ delay: 0.5, duration: 0.5 }}
                                className="h-1 bg-gradient-to-r from-primary/80 to-primary/20 rounded-full mt-8"
                            />
                        </motion.div>
                    </div>

                    {/* Image Content - 16:10 Aspect Ratio for Screenshots */}
                    <div className="flex-1 w-full perspective-1000">
                        <motion.div
                            style={{ y, opacity, scale, rotateX }}
                            className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden border border-border/40 shadow-2xl bg-muted/50 backdrop-blur-sm group"
                        >
                            {/* Glossy Reflection Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/0 pointer-events-none z-20" />

                            {/* Browser Header */}
                            <div className="absolute top-0 left-0 w-full h-10 bg-background/95 backdrop-blur-md border-b border-border/50 flex items-center px-4 gap-2 z-20">
                                <div className="flex gap-2 opacity-80">
                                    <div className="w-3 h-3 rounded-full bg-[#FF5F57] border border-[#E0443E]" />
                                    <div className="w-3 h-3 rounded-full bg-[#FEBC2E] border border-[#D89E24]" />
                                    <div className="w-3 h-3 rounded-full bg-[#28C840] border border-[#1AAB29]" />
                                </div>
                                {/* Mock Search Bar */}
                                <div className="ml-4 flex-1 max-w-[60%] h-6 bg-muted/50 rounded-md flex items-center justify-center text-[10px] text-muted-foreground/50 font-medium">
                                    notes9.app/{image.split('.')[0]}
                                </div>
                            </div>

                            {/* The Screenshot */}
                            <img
                                src={`/${image}`}
                                alt={title}
                                className="w-full h-full object-cover object-top pt-10 transition-transform duration-700 group-hover:scale-[1.02]"
                            />

                            {/* Ambient Glow Behind */}
                            <div className={`absolute -inset-1 bg-gradient-to-r from-primary/30 to-purple-500/30 rounded-3xl blur-2xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
                        </motion.div>
                    </div>

                </div>
            </div>
        </section>
    )
}
