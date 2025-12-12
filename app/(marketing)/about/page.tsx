"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Sparkles, Users, Crosshair, Trophy, MapPin, Send } from "lucide-react"

export default function AboutPage() {
  const founders = [
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
      role: "CSO (Science)",
      background:
        "Research Assistant at the Jenner Institute, University of Oxford, working on malaria vaccine development and protein engineering. Experienced in end-to-end experimental design, biophysical characterisation, and collaborative translational research.",
      education: "MRes Pharmaceutical Research – UCL; Bachelor of Pharmacy – BITS Pilani",
    },
    {
      name: "Bhaskar Kandregula",
      role: "CSO (Strategy)",
      background:
        "Formulation scientist with experience in nanoparticle-based drug delivery, and forecasting for pharmaceutical portfolios. Former analyst at PharmaACE working at the interface of science, strategy, and health economics.",
      education: "MS Pharmaceutical Sciences – University of Maryland, Baltimore; BA Pharmacy – BITS Pilani",
    },
    {
      name: "Hari Hara Nithin Reddy Manupati",
      role: "CEO",
      background:
        "Applied AI developer with expertise in document-processing pipelines, information retrieval, and human–computer interaction. Has contributed to production AI systems at Equifax and multiple early-stage technology startups.",
      education: "Master of International Business – Hult International Business School; BA Pharmacy – BITS Pilani",
    },
  ]

  return (
    <div className="relative overflow-hidden">
      {/* Animated background */}
      <div className="hero-particles"></div>

      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-32 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute -bottom-40 -left-32 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "2s" }}
        ></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-20">
        {/* Hero Section */}
        <div className="mx-auto max-w-4xl text-center mb-16">
          <Badge variant="secondary" className="mb-6 text-sm font-medium glass text-solid">
            <Users className="mr-2 h-4 w-4" />
            About Notes9
          </Badge>

          <h1 className="text-4xl font-bold tracking-tight text-solid sm:text-6xl text-balance">
            An Agentic AI Workspace for Experimental Scientific Research
          </h1>

          <p className="mt-6 text-xl text-solid max-w-3xl mx-auto text-pretty font-light">
            Notes9 is an AI-native electronic lab notebook and laboratory information platform that unifies
            experimental records, Inventory management, literature, data analysis, and reporting in a single, structured workspace for
            research teams.
          </p>
        </div>

        {/* Mission & Vision */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          <Card className="p-8 glass border-2 border-white/20">
            <div className="flex items-center mb-4">
              <Crosshair className="h-8 w-8 text-blue-400 mr-3" />
              <h2 className="text-2xl font-bold text-solid">Our Mission</h2>
            </div>
            <p className="text-solid font-light leading-relaxed">
              To design an AI-augmented research environment that reduces manual overhead, strengthens
              reproducibility, and helps scientists move from hypothesis to robust, well-documented results with
              fewer fragmented tools and fewer avoidable errors.
            </p>
          </Card>

          <Card className="p-8 glass border-2 border-white/20">
            <div className="flex items-center mb-4">
              <Sparkles className="h-8 w-8 text-blue-400 mr-3" />
              <h2 className="text-2xl font-bold text-solid">Our Vision</h2>
            </div>
            <p className="text-solid font-light leading-relaxed">
              We envision every research group working alongside an AI assistant that understands their projects,
              preserves institutional knowledge, and provides transparent, auditable support across literature
              review, inventory management, experiment planning, data analysis, and scientific reporting and communication.
            </p>
          </Card>
        </div>

        {/* Founding Team */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-solid mb-4">Founding Team</h2>
            <p className="text-solid font-light max-w-2xl mx-auto">
              Notes9 is led by a multidisciplinary group of scientists and engineers with backgrounds in
              pharmaceutical sciences, AI, and software development. The team has collaborated for many years
              across academic and industry settings and now focuses on building rigorous, researcher-centric tools.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {founders.map((founder, index) => (
              <Card
                key={index}
                className="p-6 glass border-2 border-white/20 hover:border-white/30 transition-all"
              >
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-solid mb-1">{founder.name}</h3>
                  <Badge variant="secondary" className="text-xs glass text-solid">
                    {founder.role}
                  </Badge>
                </div>
                <p className="text-sm text-solid font-light mb-4 leading-relaxed">
                  {founder.background}
                </p>
                <div className="text-xs text-solid">
                  <strong>Education:</strong> {founder.education}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Company Story */}
        <Card className="p-8 glass border-2 border-white/20 mb-16">
          <div className="flex items-center mb-6">
            <Trophy className="h-8 w-8 text-blue-400 mr-3" />
            <h2 className="text-2xl font-bold text-solid">Our Story</h2>
          </div>
          <div className="space-y-4 text-solid font-light leading-relaxed">
            <p>
              Notes9 emerged directly from the day-to-day experience of working in academic and industrial
              laboratories. As bench scientists and data scientists, we repeatedly encountered the same pattern:
              project-critical knowledge was scattered across paper notebooks, PDFs, slide decks, and ad-hoc
              spreadsheets, making it difficult to compare experiments, reproduce results, or hand projects over to
              new team members.
            </p>
            <p>
              Conventional ELNs improved record-keeping but did little to help researchers reason with their data or
              integrate literature, protocols, and analyses into a coherent, queryable whole. In parallel, modern
              language models showed promise, but generic chat interfaces lacked the structure, traceability, and
              domain awareness required for serious laboratory work.
            </p>
            <p>
              Notes9 is our response to this gap: an agentic AI layer built on top of a structured research workspace.
              The platform is being developed to assist with literature triage, experiment design, data curation and
              analysis, and preparation of reports and manuscripts—while preserving clear provenance, versioning,
              and human oversight.
            </p>
            <p>
              We are currently refining the platform in collaboration with early research partners and iterating on the
              product with feedback from scientists, lab managers, and research-IT teams across diverse domains.
            </p>
          </div>
        </Card>

        {/* Contact */}
        <div className="text-center">
          <Card className="p-8 glass border-2 border-white/20 max-w-2xl mx-auto">
            <div className="flex items-center justify-center mb-4">
              <Send className="h-8 w-8 text-blue-400 mr-3" />
              <h2 className="text-2xl font-bold text-solid">Get in Touch</h2>
            </div>
            <p className="text-solid font-light mb-6">
              Notes9 is currently in an early-access phase. If you are interested in collaborating as a design partner
              lab, providing feedback on the platform, or learning more about our roadmap, we would be glad to
              hear from you.
            </p>
            <div className="flex items-center justify-center space-x-2 text-solid">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">Distributed team · United States & United Kingdom</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}


