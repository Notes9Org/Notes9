"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Github, Twitter, Linkedin, Youtube, Mail, MapPin, Phone } from "lucide-react"
import Image from "next/image"

const footerLinks = {
  product: [
    { name: "Platform Overview", href: "#" },
    { name: "Integration Catalog", href: "#" },
    { name: "API Reference", href: "#" },
    { name: "Security & Compliance", href: "#" },
  ],
  solutions: [
    { name: "Biotech & Pharma", href: "#" },
    { name: "Materials Science", href: "#" },
    { name: "Academic Research", href: "#" },
    { name: "Quality Control", href: "#" },
  ],
  resources: [
    { name: "Documentation", href: "#" },
    { name: "Case Studies", href: "#" },
    { name: "Blog", href: "#" },
    { name: "Research Papers", href: "#" },
  ],
  company: [
    { name: "About Us", href: "#" },
    { name: "Careers", href: "#" },
    { name: "Press Kit", href: "#" },
    { name: "Partner Program", href: "#" },
  ],
}

export function Footer() {
  return (
    <footer id="contact" className="glass-dark border-t border-white/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12">
          {/* Company Info */}
          <div className="lg:col-span-1">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <Image
                  src="/notes9-logo.png"
                  alt="Notes9"
                  width={24}
                  height={24}
                  className="brightness-0 invert"
                />
              </div>
              <span className="text-xl font-bold text-solid tracking-wider">Notes9</span>
            </div>

            <p className="text-solid mb-6 text-sm leading-relaxed opacity-90">
              Empowering researchers worldwide with agentic intelligence that accelerates scientific discovery and
              improves human knowledge.
            </p>

            <div className="space-y-2 text-sm">
              <div className="flex items-center space-x-2">
                <MapPin className="h-4 w-4 text-blue-400" />
                <span className="text-solid opacity-90">San Francisco, CA</span>
              </div>
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-blue-400" />
                <span className="text-solid opacity-90">hello@notes9.com</span>
              </div>
              <div className="flex items-center space-x-2">
                <Phone className="h-4 w-4 text-blue-400" />
                <span className="text-solid opacity-90">1-800-NOTES9-AI</span>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div>
                <h3 className="font-semibold text-solid mb-4">Product</h3>
                <ul className="space-y-2">
                  {footerLinks.product.map((link) => (
                    <li key={link.name}>
                      <a href={link.href} className="text-sm text-solid opacity-90 hover:text-blue-300 transition-colors">
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-solid mb-4">Solutions</h3>
                <ul className="space-y-2">
                  {footerLinks.solutions.map((link) => (
                    <li key={link.name}>
                      <a href={link.href} className="text-sm text-solid opacity-90 hover:text-blue-300 transition-colors">
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-solid mb-4">Resources</h3>
                <ul className="space-y-2">
                  {footerLinks.resources.map((link) => (
                    <li key={link.name}>
                      <a href={link.href} className="text-sm text-solid opacity-90 hover:text-blue-300 transition-colors">
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-solid mb-4">Company</h3>
                <ul className="space-y-2">
                  {footerLinks.company.map((link) => (
                    <li key={link.name}>
                      <a href={link.href} className="text-sm text-solid opacity-90 hover:text-blue-300 transition-colors">
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Newsletter */}
          <div className="lg:col-span-1">
            <h3 className="font-semibold text-solid mb-4">Research Insights Newsletter</h3>
            <p className="text-sm text-solid opacity-90 mb-4">Weekly AI and research trends delivered to your inbox</p>
            <div className="flex space-x-2">
              <Input
                placeholder="Enter your email"
                className="glass border-white/20 text-solid placeholder:text-white/60"
              />
              <Button size="sm" className="glass-card text-solid hover:bg-white/30 border-white/30">
                Subscribe
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-white/20 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-6 text-sm text-solid opacity-90">
              <span>© 2025 Notes9, Inc. All rights reserved.</span>
              <div className="flex space-x-4">
                <a href="#" className="hover:text-blue-300 transition-colors">
                  Privacy Policy
                </a>
                <a href="#" className="hover:text-blue-300 transition-colors">
                  Terms of Service
                </a>
                <a href="#" className="hover:text-blue-300 transition-colors">
                  AI Ethics Policy
                </a>
              </div>
            </div>

            <div className="flex space-x-4">
              <a href="#" className="text-solid opacity-90 hover:text-blue-300 transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-solid opacity-90 hover:text-blue-300 transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="text-solid opacity-90 hover:text-blue-300 transition-colors">
                <Github className="h-5 w-5" />
              </a>
              <a href="#" className="text-solid opacity-90 hover:text-blue-300 transition-colors">
                <Youtube className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
