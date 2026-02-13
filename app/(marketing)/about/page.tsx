"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ContactForm } from "@/components/marketing/contact-form"
import { Users, Crosshair, Trophy, MapPin, Send, School, FlaskConical, Target, GraduationCap } from "lucide-react"
import { motion } from "framer-motion"

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
}

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } }
}

export default function AboutPage() {
  const founders = [
    {
      name: "Hari Hara Nithin Reddy Manupati",
      role: "CEO",
      background:
        "Applied AI developer with expertise in document-processing pipelines, information retrieval, and human–computer interaction. Has contributed to production AI systems at Equifax and multiple early-stage technology startups.",
      education: "Master of International Business – Hult International Business School; BA Pharmacy – BITS Pilani",
    },
    {
      name: "Nitheesh Yanamandala",
      role: "CPO (Product)",
      background:
        "Pharmaceutical science Phd Scholar focusing on PBPK modeling, translational pharmacokinetics, and dose projection. Industry and academic experience bridging quantitative modelling with drug development strategy. Registered Patent Agent in India.",
      education: "MS Pharmaceutical Sciences – University at Buffalo; BA Pharmacy – BITS Pilani",
    },
    {
      name: "Naga Sai Praneeth Nalajala",
      role: "CTO",
      background:
        "Full-stack engineer currently working at Asanify, where he builds and maintains production SaaS platforms for HR and payroll. Experienced in designing scalable web architectures, setting up robust developer tooling, and translating product requirements into reliable, ship-ready features.",
      education: "BE Electrical and Electronics Engineering – BITS Pilani",
    },
    {
      name: "Venkata Ramana Reddy Duggempudi",
      role: "AI Engineer",
      background:
        "Machine learning engineer specialising in agentic AI systems and clinical-trial data extraction. Research experience in healthcare AI applications, model evaluation, and deployment in regulated environments.",
      education: "MS Artificial Intelligence – University at Buffalo",
    },
    {
      name: "Vaishnav Pavan Kumar Achalla",
      role: "Advisor",
      background:
        "Research Assistant at the Jenner Institute, University of Oxford, working on malaria vaccine development and protein engineering. Experienced in end-to-end experimental design, biophysical characterisation, and collaborative translational research.",
      education: "MRes Pharmaceutical Research – UCL; Bachelor of Pharmacy – BITS Pilani",
    },
    {
      name: "Bhaskar Kandregula",
      role: "Advisor",
      background:
        "Formulation scientist with experience in nanoparticle-based drug delivery, and forecasting for pharmaceutical portfolios. Former analyst at PharmaACE working at the interface of science, strategy, and health economics.",
      education: "MS Pharmaceutical Sciences – University of Maryland, Baltimore; BA Pharmacy – BITS Pilani",
    },
  ]

  return (
    <div className="bg-background min-h-screen overflow-hidden">
      {/* Subtle Grid Background - Animated */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
        className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none h-[500px] mask-gradient-to-b from-black to-transparent"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-16 sm:py-24">
        {/* Hero Section */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="mx-auto max-w-4xl text-center mb-20"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Badge variant="outline" className="mb-6 text-sm font-medium border-primary/20 bg-primary/5 text-primary backdrop-blur-sm">
              <Users className="mr-2 h-4 w-4" />
              About Notes9
            </Badge>
          </motion.div>

          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance mb-6">
            Agentic AI for <span className="text-primary">Scientific Research</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-3xl mx-auto text-pretty font-light leading-relaxed">
            Notes9 is an AI-native electronic lab notebook that unifies experimental records, inventory management, literature, and analysis in a single, structured workspace.
          </p>
        </motion.div>

        {/* Mission & Vision - With Tilt */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
          className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-20"
        >
          <motion.div variants={fadeInUp} className="h-full">
            <Card className="h-full border-border/60 bg-card/80 backdrop-blur-md shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center gap-4">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl"
                >
                  <Target className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </motion.div>
                <CardTitle className="text-2xl">Our Mission</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed text-lg">
                  To design an AI-augmented research environment that reduces manual overhead, strengthens reproducibility, and helps scientists move from hypothesis to robust results with fewer fragmented tools.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp} className="h-full">
            <Card className="h-full border-border/60 bg-card/80 backdrop-blur-md shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center gap-4">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: -5 }}
                  className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl"
                >
                  <FlaskConical className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </motion.div>
                <CardTitle className="text-2xl">Our Vision</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed text-lg">
                  We envision every research group working alongside an AI assistant that understands their projects, preserves institutional knowledge, and provides transparent support across the entire discovery lifecycle.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Company Story */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mb-24 max-w-4xl mx-auto bg-gradient-to-b from-muted/30 to-muted/10 p-8 md:p-12 rounded-3xl border border-border/40 backdrop-blur-md shadow-2xl"
        >
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground">Our Story</h2>
          </div>
          <div className="prose prose-lg dark:prose-invert mx-auto text-muted-foreground">
            <p className="mb-4">
              Notes9 emerged directly from the day-to-day experience of working in academic and industrial laboratories. As bench scientists and data scientists, we repeatedly encountered the same pattern: project-critical knowledge scattered across paper notebooks, PDFs, and ad-hoc spreadsheets.
            </p>
            <p className="mb-4">
              Conventional ELNs improved record-keeping but did little to help researchers reason with their data. Generic LLMs showed promise but lacked the domain awareness required for serious rigor.
            </p>
            <p>
              Notes9 is our response: an agentic AI layer built on top of a structured research workspace, designed to assist with literature triage, experiment design, data curation, and analysis—while preserving clear provenance and oversight.
            </p>
          </div>
        </motion.div>

        {/* Team Summary */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-4">Our Team</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Notes9 is led by a multidisciplinary group of scientists and engineers with backgrounds in pharmaceutical sciences, AI, and software development.
            </p>
          </div>
        </div>

        {/* Founding Team Cards */}
        <div className="mb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {founders.map((founder, index) => (
              <Card
                key={index}
                className="border-border/60 bg-card shadow-sm hover:shadow-md transition-shadow"
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{founder.name}</CardTitle>
                  <Badge variant="outline" className="w-fit text-xs border-primary/30 bg-primary/5 text-primary">
                    {founder.role}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {founder.background}
                  </p>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                    <GraduationCap className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{founder.education}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Contact */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center pb-20"
        >
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">Get in Touch</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg mb-8">
              Notes9 is currently in an early-access phase. We are actively seeking design partner labs and investment opportunities.
            </p>
          </div>
          <ContactForm />
          <div className="flex items-center justify-center space-x-2 text-muted-foreground bg-muted/50 py-2 px-4 rounded-full w-fit mx-auto mt-12">
            <MapPin className="h-4 w-4" />
            <span className="text-sm">Distributed team · United States & United Kingdom</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
