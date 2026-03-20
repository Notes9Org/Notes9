"use client"

import { useEffect, useState } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import { useTheme } from "next-themes"

export function AppTour() {
    const [mounted, setMounted] = useState(false)
    const { resolvedTheme } = useTheme()

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!mounted) return

        // Check if user has already seen the tour
        const hasSeenTour = localStorage.getItem("notes9_tour_completed")
        if (hasSeenTour) return

        const isDarkMode = resolvedTheme === "dark"

        const renderMascot = (htmlContent: string) => `
            <div style="display: flex; gap: 12px; align-items: flex-start; margin-top: 8px;">
                <img src="/notes9-mascot.png" class="tour-mascot-animate" alt="Notes9 Mascot" style="width: 52px; height: 52px; object-fit: contain; flex-shrink: 0; border-radius: 50%;" />
                <div style="font-size: 14px; line-height: 1.5;">${htmlContent}</div>
            </div>
        `

        const driverObj = driver({
            showProgress: true,
            animate: true,
            smoothScroll: true,
            showButtons: ["next", "previous", "close"],
            allowClose: false,
            overlayOpacity: 0.65,
            popoverClass: "driverjs-theme-researcher",
            steps: [
                {
                    popover: {
                        title: "Notes9 Research Workspace",
                        description: renderMascot("Welcome to your digital laboratory notebook! I'll be your guide. Let's take a brief tour to familiarize you with the core layout."),
                        side: "top",
                        align: "center"
                    }
                },
                {
                    element: "#tour-main-nav",
                    popover: {
                        title: "Unified Workspace",
                        description: renderMascot(`Your entire lab flow is here. 
                        <ul style="margin-top: 8px; margin-bottom: 0; padding-left: 20px; list-style-type: disc;">
                            <li><b>Projects</b>: High-level initiatives</li>
                            <li><b>Experiments</b>: Scientific procedures inside projects</li>
                            <li><b>Lab Notes</b>: Daily observations and raw data</li>
                            <li><b>Inventory</b>: Centralized Samples & Equipment</li>
                        </ul>`),
                        side: "right",
                        align: "start"
                    }
                },
                {
                    element: "a[href='/projects']",
                    popover: {
                        title: "1. Projects (Start Here)",
                        description: renderMascot("Everything in Notes9 follows a strict hierarchy. <b>You must create a Project first.</b> Projects act as the high-level parent containers for all your subsequent research."),
                        side: "right",
                        align: "center"
                    }
                },
                {
                    element: "a[href='/experiments']",
                    popover: {
                        title: "2. Experiments",
                        description: renderMascot("Once you have a Project, you can create Experiments inside it. Log structured procedures, parameters, and results specifically tied to that parent Project."),
                        side: "right",
                        align: "center"
                    }
                },
                {
                    element: "a[href='/lab-notes']",
                    popover: {
                        title: "3. Lab Notes",
                        description: renderMascot("Finally, use Lab Notes for your daily observations tied to an Experiment! <br/><br/><b>Features include:</b><br/>• <b>Cite with AI:</b> Instantly query and cite literature.<br/>• <b>Protocol Linking:</b> Embed reusable SOPs directly.<br/>• <b>Commenting:</b> Collaborate with inline text highlights."),
                        side: "right",
                        align: "center"
                    }
                },
                {
                    element: "a[href='/samples']",
                    popover: {
                        title: "Samples",
                        description: renderMascot("Manage your biological, chemical, and physical inventory. Track physical locations and sample lineage."),
                        side: "right",
                        align: "center"
                    }
                },
                {
                    element: "a[href='/equipment']",
                    popover: {
                        title: "Equipment",
                        description: renderMascot("Log instruments, track maintenance schedules, and book usage times directly tied to your experiments."),
                        side: "right",
                        align: "center"
                    }
                },
                {
                    element: "a[href='/protocols']",
                    popover: {
                        title: "Protocols",
                        description: renderMascot("Standard Operating Procedures (SOPs). Define repeatable steps and reuse them across different experiments."),
                        side: "right",
                        align: "center"
                    }
                },
                {
                    element: "a[href='/literature-reviews']",
                    popover: {
                        title: "Literature Reviews",
                        description: renderMascot("Search for millions of Open Access papers, add them to your library, and have me summarize or extract data directly from them."),
                        side: "right",
                        align: "center"
                    }
                },
                {
                    element: "#tour-search",
                    popover: {
                        title: "Global Discovery",
                        description: renderMascot("Quickly locate any Document, Sample, or Experiment across your entire workspace. Just press <b>Cmd+K</b> anywhere to jump here."),
                        side: "right",
                        align: "start"
                    }
                },
                {
                    element: "#tour-create-new",
                    popover: {
                        title: "Start Organizing",
                        description: renderMascot("Click here to create your first Project. You can create new entities directly from their respective tracking pages."),
                        side: "bottom",
                        align: "end"
                    }
                },
                {
                    element: "#tour-ai-toggle",
                    popover: {
                        title: "Intelligent Assistant",
                        description: renderMascot("Click this sparkles icon to toggle my intelligent AI sidebar! I can analyze your notes, help design experiments, and query literature."),
                        side: "bottom",
                        align: "end"
                    }
                },
                {
                    element: "#tour-ai-chat",
                    popover: {
                        title: "Context-Aware AI Chat",
                        description: renderMascot("Ask complex biomedical questions, upload attachments for extraction, or instruct me to draft protocols directly into the editor."),
                        side: "left",
                        align: "end"
                    }
                },
                {
                    element: "#tour-ai-mode",
                    popover: {
                        title: "Specialized Agents",
                        description: renderMascot("Toggle between <b>General</b> mode for broad web-search capabilities, and <b>Notes9</b> mode to rely strictly on your lab's proprietary data and uploaded papers."),
                        side: "top",
                        align: "start"
                    }
                },
                {
                    element: "#tour-theme-toggle",
                    popover: {
                        title: "Personalized Environment",
                        description: renderMascot("Toggle between light and dark modes. Everything is set up for you—enjoy standardizing your research with Notes9!"),
                        side: "bottom",
                        align: "end"
                    }
                }
            ],
            onDestroyStarted: () => {
                localStorage.setItem("notes9_tour_completed", "true")
                driverObj.destroy()
            }
        })

        // Slight delay to ensure DOM is fully rendered and animations settle before tour starts
        const timer = setTimeout(() => {
            driverObj.drive()
        }, 1200)

        return () => {
            clearTimeout(timer)
            driverObj.destroy()
        }
    }, [mounted, resolvedTheme])

    return null
}
