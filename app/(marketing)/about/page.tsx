"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Sparkles, Users, Crosshair, Trophy, MapPin, Send } from "lucide-react"

export default function AboutPage() {
  const founders = [
    {
      name: "Nitheesh Yanamandala",
      role: "CFO (Product)",
      background:
        "Summer Research Intern at Ionis Pharmaceuticals with expertise in PBPK modeling and pharmaceutical sciences. Registered Patent Agent in India.",
      education: "MA Pharmaceutical Sciences - University at Buffalo, BA Pharmacy - BITS Pilani",
    },
    {
      name: "Venkata Ramana Reddy Duggempudi",
      role: "AI Engineer",
      background:
        "Specialist in agentic AI models and clinical trial data extraction. Research experience at University at Buffalo with focus on healthcare AI applications.",
      education: "MA Artificial Intelligence - University at Buffalo",
    },
    {
      name: "Vaishnav Pavan Kumar Achalla",
      role: "CSO (Science)",
      background:
        "Research Assistant at Jenner Institute, Oxford. Expert in malaria vaccine development and protein engineering with multiple peer-reviewed publications.",
      education: "Master of Research Pharmaceutical Research - UCL, Bachelor of Pharmacy - BITS Pilani",
    },
    {
      name: "Bhaskar Kandregula",
      role: "CEO (Strategy)",
      background:
        "Formulation Scientist with expertise in nanoparticle formulation and pharmaceutical forecasting. Former analyst at PharmaACE.",
      education: "MS Pharmaceutical Sciences - University of Maryland Baltimore, BA Pharmacy - BITS Pilani",
    },
    {
      name: "Hari Hara Nithin Reddy Manupati",
      role: "CTO",
      background:
        "AI Developer with expertise in document processing systems and brain-computer interfaces. Published researcher with experience at Equifax and multiple AI startups.",
      education: "Master of International Business - Hult International Business School, BA Pharmacy - BITS Pilani",
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
            Pioneering Agentic AI for Scientific Research
          </h1>

          <p className="mt-6 text-xl text-solid max-w-3xl mx-auto text-pretty font-light">
            We're building the first truly intelligent ELN+LIMS platform that doesn't just store data—it thinks
            alongside researchers to accelerate scientific discovery.
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
              To eliminate the manual drudgery that slows down scientific research by creating AI that proactively
              assists researchers throughout their entire workflow—from literature review to final reporting.
            </p>
          </Card>

          <Card className="p-8 glass border-2 border-white/20">
            <div className="flex items-center mb-4">
              <Sparkles className="h-8 w-8 text-blue-400 mr-3" />
              <h2 className="text-2xl font-bold text-solid">Our Vision</h2>
            </div>
            <p className="text-solid font-light leading-relaxed">
              A future where every researcher has an AI assistant that understands their work, anticipates their
              needs, and helps them focus on what matters most—making groundbreaking discoveries.
            </p>
          </Card>
        </div>

        {/* Founding Team */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-solid mb-4">Meet Our Founding Team</h2>
            <p className="text-solid font-light max-w-2xl mx-auto">
              Five researchers with deep pharmaceutical and biotech expertise, united by 8+ years of friendship and a
              shared vision to transform scientific research.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {founders.map((founder, index) => (
              <Card key={index} className="p-6 glass border-2 border-white/20 hover:border-white/30 transition-all">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-solid mb-1">{founder.name}</h3>
                  <Badge variant="secondary" className="text-xs glass text-solid">
                    {founder.role}
                  </Badge>
                </div>
                <p className="text-sm text-solid font-light mb-4 leading-relaxed">{founder.background}</p>
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
              Notes9 was born from a shared frustration experienced by our founding team during their pharmaceutical
              and biotech research careers. As active researchers, we discovered that while our individual challenges
              seemed unique, they all stemmed from the same core inefficiencies: fragmented data, manual workflow
              bottlenecks, and the endless time spent sifting through lab notebooks and research articles.
            </p>
            <p>
              Our breakthrough came when we realized we were all independently arriving at the same solution—an AI
              assistant that could proactively help with research workflows. This wasn't just a useful tool we wanted
              to build; it was a critical need we experienced daily.
            </p>
            <p>
              After conducting interviews with researchers across 15+ labs and 20+ industry professionals, we
              confirmed our hypothesis: researchers everywhere were wasting critical time on manual tasks that
              intelligent systems could handle. This validation drove us to create Notes9—not just another ELN, but a
              true "knowledge clone" for researchers.
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
              Interested in learning more about Notes9 or joining our mission to transform scientific research?
            </p>
            <div className="flex items-center justify-center space-x-2 text-solid">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">Distributed Team • US & UK</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

