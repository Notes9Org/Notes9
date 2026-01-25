"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, BookOpen, FlaskConical, LayoutDashboard, Settings, TestTube2, FileText, ChevronRight, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

const features = [
    {
        id: "projects",
        title: "Projects",
        description: "Organize your research into structured projects. Learn how to create, manage, and collaborate on scientific initiatives.",
        content: (
            <div className="space-y-6">
                <div className="space-y-4">
                    <p>Notes9 Projects allow you to organize your research initiatives logically. A project serves as the parent container for all your experiments, data, and notes.</p>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                            Creating a New Project
                        </h4>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground ml-2">
                            <li>Navigate to the <span className="font-medium text-foreground">Projects</span> page from the main sidebar.</li>
                            <li>Click the <span className="font-medium text-foreground">"New Project"</span> button.</li>
                            <li>Enter the <span className="font-medium text-foreground">Project Name</span> (Required) and a detailed description describing the research goals.</li>
                            <li>Set the <span className="font-medium text-foreground">Status</span> (e.g., Planning, Active) and <span className="font-medium text-foreground">Priority</span> level.</li>
                            <li>Define the <span className="font-medium text-foreground">Start Date</span> and target <span className="font-medium text-foreground">End Date</span> for timeline tracking.</li>
                            <li>Click <span className="font-medium text-foreground">"Create Project"</span> to initialize the workspace.</li>
                        </ol>
                    </div>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
                            Managing Projects
                        </h4>
                        <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-2">
                            <li><strong>Dashboard:</strong> View key metrics, timeline progress, and recent activity.</li>
                            <li><strong>Team:</strong> Manage collaborators and roles (Owner, Editor, Viewer).</li>
                            <li><strong>Settings:</strong> Update project metadata or archive completed projects.</li>
                        </ul>
                    </div>
                </div>
            </div>
        ),
        icon: LayoutDashboard,
        demoUrl: "https://www.youtube.com/watch?v=Nl7LIaDW_8Y",
        docsUrl: "#",
    },
    {
        id: "experiments",
        title: "Experiments",
        description: "Track experimental procedures, improved status management, and real-time progress monitoring.",
        content: (
            <div className="space-y-6">
                <div className="space-y-4">
                    <p>Experiments are the core execution units in Notes9. They capture the specific methodology, data, and results for a scientific test.</p>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                            Designing an Experiment
                        </h4>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground ml-2">
                            <li>Go to the <span className="font-medium text-foreground">Experiments</span> page and click <span className="font-medium text-foreground">"Create New Experiment"</span>.</li>
                            <li>Provide a descriptive <span className="font-medium text-foreground">Name</span> and select the parent <span className="font-medium text-foreground">Project</span>.</li>
                            <li>Optionally link a <span className="font-medium text-foreground">Protocol</span> to automatically import standard steps.</li>
                            <li>Use the rich text editor to detail the <strong>Methodology</strong> and <strong>Hypothesis</strong>.</li>
                            <li>Set the <span className="font-medium text-foreground">Status</span> (Planned, In Progress) and expected dates.</li>
                            <li>Click <span className="font-medium text-foreground">"Create Experiment"</span>.</li>
                        </ol>
                    </div>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
                            Execution & Tracking
                        </h4>
                        <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-2">
                            <li><strong>Data Entry:</strong> Record real-time data directly in the experiment log.</li>
                            <li><strong>Protocol Deviations:</strong> Note any changes from the standard procedure.</li>
                            <li><strong>Results:</strong> Attach files, images, or raw data outputs.</li>
                        </ul>
                    </div>
                </div>
            </div>
        ),
        icon: FlaskConical,
        demoUrl: "#",
        docsUrl: "#",
    },
    {
        id: "protocols",
        title: "Protocols",
        description: "Create and manage Standard Operating Procedures (SOPs). Version control and template management for consistency.",
        content: (
            <div className="space-y-6">
                <div className="space-y-4">
                    <p>Standard Operating Procedures (SOPs) are essential for reproducibility. The Protocols module lets you version and manage these standards.</p>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                            Creating a Protocol
                        </h4>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground ml-2">
                            <li>Navigate to <span className="font-medium text-foreground">Protocols</span> &gt; <span className="font-medium text-foreground">"New Protocol"</span>.</li>
                            <li>Enter the <span className="font-medium text-foreground">Name</span> and <span className="font-medium text-foreground">Version</span> (e.g., v1.0).</li>
                            <li>Select a <span className="font-medium text-foreground">Category</span> (e.g., Sample Prep, Analysis, Safety).</li>
                            <li>Write the step-by-step procedure in the editor.</li>
                            <li>Toggle <span className="font-medium text-foreground">"Active"</span> to make it available for experiments.</li>
                            <li>Click <span className="font-medium text-foreground">"Create Protocol"</span>.</li>
                        </ol>
                    </div>
                </div>
            </div>
        ),
        icon: FileText,
        demoUrl: "#",
        docsUrl: "#",
    },
    {
        id: "samples",
        title: "Samples",
        description: "Complete inventory management for biological samples, reagents, and chemicals with comprehensive tracking.",
        content: (
            <div className="space-y-6">
                <div className="space-y-4">
                    <p>Track your physical inventory with the Samples module. Manage storage locations, usage, and biological properties.</p>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                            Registering a New Sample
                        </h4>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground ml-2">
                            <li>Go to <span className="font-medium text-foreground">Samples</span> and click <span className="font-medium text-foreground">"New Sample"</span>.</li>
                            <li>Enter or <span className="font-medium text-foreground">Generate</span> a unique <strong>Sample Code</strong>.</li>
                            <li>Select the <span className="font-medium text-foreground">Sample Type</span> (e.g., DNA, Blood, Chemical).</li>
                            <li>Input storage details: <span className="font-medium text-foreground">Location</span> and <span className="font-medium text-foreground">Condition</span> (e.g., -80°C).</li>
                            <li>(Optional) Link the sample to an origin <span className="font-medium text-foreground">Experiment</span>.</li>
                            <li>Click <span className="font-medium text-foreground">"Create Sample"</span> to save to inventory.</li>
                        </ol>
                    </div>
                </div>
            </div>
        ),
        icon: TestTube2,
        demoUrl: "#",
        docsUrl: "#",
    },
    {
        id: "lab-notes",
        title: "Lab Notes",
        description: "Digital notebook for recording daily observations, experimental data, and research notes securely.",
        content: (
            <div className="space-y-6">
                <div className="space-y-4">
                    <p>Lab Notes act as your digital daily diary. Unlike other modules, notes are primarily created within the context of an experiment.</p>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                            Recording Observations
                        </h4>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground ml-2">
                            <li>Navigate to the specific <strong>Experiment</strong> you are working on.</li>
                            <li>Locate the <span className="font-medium text-foreground">"Lab Notes"</span> section within the experiment view.</li>
                            <li>Click <span className="font-medium text-foreground">"Add Note"</span> or start typing in the daily log.</li>
                            <li>Your inputs are automatically timestamped and linked to the experiment.</li>
                            <li>(View Only) The main <span className="font-medium text-foreground">Lab Notes</span> page provides a read-only chronological feed of all notes across projects.</li>
                        </ol>
                    </div>
                </div>
            </div>
        ),
        icon: BookOpen,
        demoUrl: "#",
        docsUrl: "#",
    },
    {
        id: "literature-reviews",
        title: "Literature Reviews",
        description: "Manage your bibliography and reading list. Store citations, abstracts, and personal reviews of relevant literature.",
        content: (
            <div className="space-y-6">
                <div className="space-y-4">
                    <p>Keep your research grounded in the latest science. The Literature Reviews module allows you to build a personal library of references.</p>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                            Automated Search & Staging
                        </h4>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground ml-2">
                            <li>Navigate to <span className="font-medium text-foreground">Literature Reviews</span> and select the <span className="font-medium text-foreground">Search</span> tab.</li>
                            <li>Enter keywords to query live databases (PubMed, BioRxiv, MedRxiv).</li>
                            <li>Review search results and click <span className="font-medium text-foreground">"Stage"</span> on relevant papers.</li>
                            <li>Switch to the <span className="font-medium text-foreground">Staging</span> tab to review your selected list.</li>
                            <li>Click <span className="font-medium text-foreground">"Save to Repository"</span> to permanently add them to your library.</li>
                        </ol>
                    </div>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
                            Manual Entry
                        </h4>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground ml-2">
                            <li>Click <span className="font-medium text-foreground">"Add Reference"</span> from the main view.</li>
                            <li>Fill in the <strong>Citation Details</strong> (Title, Authors, Journal, DOI) manually.</li>
                            <li>Add your <strong>Personal Notes</strong> and relevance rating.</li>
                            <li>Save to your repository.</li>
                        </ol>
                    </div>
                </div>
            </div>
        ),
        icon: BookOpen,
        demoUrl: "#",
        docsUrl: "#",
    },
    {
        id: "catalyst",
        title: "Catalyst AI",
        description: "Your intelligent research assistant. Analyze data, draft protocols, and brainstorm hypotheses with advanced AI models.",
        content: (
            <div className="space-y-6">
                <div className="space-y-4">
                    <p>Catalyst AI accelerates your research by acting as an always-available scientific partner.</p>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                            Starting a Session
                        </h4>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground ml-2">
                            <li>Click <span className="font-medium text-foreground">Catalyst</span> in the navigation bar.</li>
                            <li>Type your query in the chat input (e.g., "Design a protocol for PCR...").</li>
                            <li>(Optional) Attach files (PDFs, CSVs) for the AI to analyze.</li>
                            <li>Select your preferred AI model from the dropdown if needed.</li>
                        </ol>
                    </div>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
                            Capabilities
                        </h4>
                        <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-2">
                            <li><strong>Literature Synthesis:</strong> Summarize uploaded papers.</li>
                            <li><strong>Data Analysis:</strong> Interpret trends in your experimental data.</li>
                            <li><strong>Drafting:</strong> Generate text for grants, papers, or protocols.</li>
                        </ul>
                    </div>
                </div>
            </div>
        ),
        icon: Sparkles,
        demoUrl: "#",
        docsUrl: "#",
    },
    {
        id: "settings",
        title: "Settings",
        description: "Configure your workspace, manage team members, and customize your lab environment preferences.",
        content: (
            <div className="space-y-6">
                <div className="space-y-4">
                    <p>Customize your Notes9 experience and manage your account security.</p>

                    <div className="space-y-4 pt-2">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                            Configuration Options
                        </h4>
                        <ul className="list-disc list-inside space-y-3 text-sm text-muted-foreground ml-2">
                            <li><strong>Profile:</strong> View your user role and personal details.</li>
                            <li><strong>Account:</strong> Change your password or sign out of the session.</li>
                            <li><strong>Preferences:</strong> Toggle between <span className="font-medium text-foreground">Dark</span> and <span className="font-medium text-foreground">Light</span> modes to suit your lab environment.</li>
                        </ul>
                    </div>
                </div>
            </div>
        ),
        icon: Settings,
        demoUrl: "#",
        docsUrl: "#",
    },
]

const faqs = [
    {
        question: "How do I reset my password?",
        answer: "You can update your password from the Settings page under the Account tab. If you cannot log in, use the 'Forgot Password' link on the sign-in screen to receive a reset email."
    },
    {
        question: "Is my data secure?",
        answer: "Yes, Notes9 uses enterprise-grade encryption for all data at rest and in transit. Your experimental data is stored securely and backed up daily."
    },
    {
        question: "Can I collaborate with my team?",
        answer: "Absolutely. You can invite team members to your Projects with specific roles (Viewer, Editor, Owner) to control access and manage collaboration."
    },
    {
        question: "What databases does Literature Search use?",
        answer: "Our Literature Review module connects to major open-access databases including PubMed, BioRxiv, and MedRxiv to provide real-time search results."
    },
    {
        question: "What file formats does Catalyst AI support?",
        answer: "Catalyst AI currently supports analysis of PDF documents (for literature), CSV files (for data analysis), and plain text files. We are working on adding support for more formats."
    },
    {
        question: "Can I access Notes9 on mobile?",
        answer: "Yes, Notes9 is built as a responsive web application that works seamlessly on tablets and mobile devices, allowing you to check experiments and add notes on the go."
    },
]

export default function ResourcesPage() {
    const [activeId, setActiveId] = React.useState(features[0].id)
    const activeFeature = features.find(f => f.id === activeId) || features[0]

    return (
        <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12 max-w-7xl mx-auto h-full">

                {/* Sidebar Navigation */}
                <div className="md:col-span-3 lg:col-span-3 space-y-6">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-4 hidden md:block">Contents</h2>
                    <div className="flex overflow-x-auto md:flex-col gap-2 pb-4 md:pb-0 scrollbar-hide border-b md:border-b-0 border-border">
                        {features.map((feature) => (
                            <button
                                key={feature.id}
                                onClick={() => setActiveId(feature.id)}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all whitespace-nowrap md:whitespace-normal text-left md:border-l-2",
                                    activeId === feature.id
                                        ? "md:border-primary text-primary"
                                        : "md:border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <span className={cn("hidden md:block w-full truncate", activeId !== feature.id && "pl-0.5")}>
                                    {feature.title}
                                </span>
                                <span className="md:hidden">
                                    {feature.title}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="md:col-span-9 lg:col-span-9">
                    <div className="max-w-4xl">
                        {/* Document Header */}
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <div className="flex items-center gap-3 text-primary mb-2">
                                    <activeFeature.icon className="h-6 w-6" />
                                    <span className="text-sm font-medium uppercase tracking-wider">Resource</span>
                                </div>
                                <h1 className="text-4xl font-bold tracking-tight text-foreground">{activeFeature.title}</h1>
                            </div>
                        </div>

                        {/* Document Page */}
                        <div id="document-content" className="bg-background border border-border shadow-sm p-8 md:p-12 rounded-lg min-h-[600px]">
                            <div className="prose prose-lg prose-stone dark:prose-invert max-w-none">
                                <h2 className="text-3xl font-bold mb-4 border-b pb-2">{activeFeature.title} Guide</h2>
                                <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                                    {activeFeature.description}
                                </p>

                                {activeFeature.content}

                                <div className="not-prose mt-12 pt-8 border-t border-border/50 text-sm text-muted-foreground flex justify-between items-center">
                                    <span>Notes9 Documentation</span>
                                    <span>{new Date().getFullYear()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* FAQ Section */}
                    <div className="max-w-4xl mt-16 pt-8 border-t border-border">
                        <h2 className="text-2xl font-bold tracking-tight text-foreground mb-6">Frequently Asked Questions</h2>
                        <Accordion type="single" collapsible className="w-full">
                            {faqs.map((faq, index) => (
                                <AccordionItem key={index} value={`item-${index}`}>
                                    <AccordionTrigger className="text-left font-medium">{faq.question}</AccordionTrigger>
                                    <AccordionContent className="text-muted-foreground">
                                        {faq.answer}
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </div>
                </div>
            </div>
        </div>
    )
}
