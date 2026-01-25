# Oxford Integration - Quick Reference Checklist

**Print this and bring it to the meeting!** ✅

---

## 🎯 Opening Statement (30 seconds)

> "Notes9 is a modern Laboratory Information Management System built with Next.js and PostgreSQL. It's currently a working prototype that manages experiments, samples, protocols, and lab documentation with an AI assistant. We're ready to discuss integrating it into Oxford's infrastructure with proper SSO, security hardening, and deployment planning."

---

## ❓ Questions You'll Be Asked (Prepare These!)

### Authentication (100% will be asked)
- [ ] **"How do users log in?"**
  - Current: Email/password via Supabase Auth
  - Need: SAML/Shibboleth SSO integration
  - Timeline: 2-4 weeks to implement

- [ ] **"Do you support our SSO?"**
  - Yes, with Shibboleth/SAML (standard for UK universities)
  - Need: Your IdP metadata XML and test account
  - Can provide: Our SP metadata and ACS URL

- [ ] **"How do you handle user provisioning?"**
  - Recommend: Just-In-Time (JIT) provisioning
  - User created automatically on first SSO login
  - Can also support: SCIM if required

### Security (95% will be asked)
- [ ] **"Where is data stored?"**
  - Current: Supabase (can be US or EU region)
  - Can deploy: On your infrastructure (Docker)
  - Encryption: At rest (AES-256) and in transit (TLS 1.3)

- [ ] **"How do you isolate department data?"**
  - ✅ ALREADY IMPLEMENTED: Row Level Security (RLS)
  - Database enforces data isolation automatically
  - Each user only sees their organization's data

- [ ] **"Are you GDPR compliant?"**
  - Mostly yes: Data minimization, encryption, security
  - Need to add: Privacy policy, deletion API, DPA
  - Timeline: 2 weeks

- [ ] **"What about sensitive research data?"**
  - Have: Basic encryption, access controls
  - Can add: Field-level encryption, audit logging, data classification
  - For highly sensitive: Additional compliance review needed

### Infrastructure (90% will be asked)
- [ ] **"Where will this run?"**
  - Option A: We host (SaaS) - Vercel/AWS
  - Option B: You host (On-prem) - Docker container
  - Option C: Your cloud - AWS/Azure/GCP
  - Recommend: Discuss requirements first

- [ ] **"What are the technical requirements?"**
  - **Compute:** 4 vCPU, 8 GB RAM (per instance)
  - **Database:** 4 vCPU, 16 GB RAM, 500 GB SSD
  - **Storage:** 100 GB initial (S3-compatible)
  - **Scale:** 2-10 instances (auto-scaling)

- [ ] **"How do we deploy updates?"**
  - Will provide: Docker container + Kubernetes configs
  - Deployment: Blue-green (zero downtime)
  - Testing: Staging environment first
  - Rollback: Automated if health checks fail

### Integration (80% will be asked)
- [ ] **"Can this integrate with our existing systems?"**
  - Have: REST API (currently internal only)
  - Can provide: Public API with documentation
  - Can consume: Your APIs (need specifications)
  - Standards: JSON, REST, potentially SOAP if required

- [ ] **"What about data import/export?"**
  - Import: CSV, JSON (can add others)
  - Export: DOCX (have), CSV/PDF (can add)
  - Bulk operations: Need to implement
  - Format: Can match your requirements

- [ ] **"How does it embed in our portal?"**
  - Option A: iFrame (simple but limited)
  - Option B: Standalone + SSO (recommended)
  - Option C: API only (you build UI)

### Performance (70% will be asked)
- [ ] **"How many users can it support?"**
  - Current: ~100 concurrent (development)
  - Target: 500+ concurrent users
  - Scalability: Horizontal scaling (add servers)
  - Testing: Will perform load testing

- [ ] **"What about uptime?"**
  - Target: 99.9% (43 minutes downtime/month)
  - Monitoring: Sentry, Uptime Robot, health checks
  - Support: Define SLA based on your needs

### Data Management (60% will be asked)
- [ ] **"How is data backed up?"**
  - Current: Supabase daily backups
  - Production: Daily backups to separate location
  - Retention: 30 days (configurable)
  - Recovery: Point-in-time restore

- [ ] **"Can we get data out if we leave?"**
  - Yes: Full data export via API
  - Format: JSON, CSV, or your preferred format
  - Includes: All research data, files, metadata
  - No lock-in: Standard PostgreSQL database

- [ ] **"How long is data retained?"**
  - Current: Forever (no policy)
  - Recommend: Define based on your requirements
  - Can implement: Soft delete + archival
  - Compliance: Match your institutional policies

---

## 🤔 Questions YOU Should Ask THEM

### Critical Questions:
1. [ ] **"Which SSO provider do you use?"** (Shibboleth/SAML/Other?)
2. [ ] **"What's your preferred hosting?"** (AWS/Azure/On-prem?)
3. [ ] **"What's your expected user count?"** (50/500/5000?)
4. [ ] **"Must data stay in UK?"** (GDPR/data residency)
5. [ ] **"What's your timeline?"** (Urgent/3 months/6 months?)

### Important Questions:
6. [ ] **"Who's the technical contact?"** (Get name and email!)
7. [ ] **"Do you have a test environment?"** (For integration testing)
8. [ ] **"What's your deployment process?"** (Change management)
9. [ ] **"What monitoring tools do you use?"** (Grafana/Nagios/etc?)
10. [ ] **"What's your budget range?"** (For scoping)

### Nice-to-Know:
11. [ ] **"Any existing LIMS we should integrate with?"**
12. [ ] **"Do you need multi-factor authentication?"**
13. [ ] **"What's your incident response process?"**
14. [ ] **"Are there export control concerns?"** (Defense research)
15. [ ] **"Who handles support after deployment?"** (Us/You/Shared?)

---

## 📊 Your Tech Stack (Know This Cold!)

```
┌─────────────────────────────────────────┐
│  FRONTEND                               │
│  - Next.js 16 (React 19)               │
│  - Tailwind CSS v4                     │
│  - TypeScript                          │
└────────────┬────────────────────────────┘
             │ HTTPS
┌────────────▼────────────────────────────┐
│  BACKEND (Next.js API Routes)          │
│  - Node.js 20                          │
│  - API routes for data access          │
│  - AI integration (Gemini)             │
└────────┬────────────┬───────────────────┘
         │            │
         ▼            ▼
┌─────────────┐  ┌──────────────┐
│  DATABASE   │  │  AI SERVICE  │
│  Supabase   │  │  Gemini API  │
│  PostgreSQL │  │              │
│  + Storage  │  │              │
└─────────────┘  └──────────────┘
```

---

## 🚨 Red Flags to Avoid

### DON'T Say:
- ❌ "This is just a prototype" (say "working prototype, ready for production hardening")
- ❌ "I don't know" (say "Let me research that and get back to you")
- ❌ "That's impossible" (say "That's complex, let's discuss approaches")
- ❌ "It works on my machine" (say "We'll provide containerized deployment")
- ❌ "That'll take 6 months" (understand requirements first)

### DO Say:
- ✅ "Let me make sure I understand your requirements..."
- ✅ "That's a great question, I want to give you accurate information..."
- ✅ "Here's what we have now, here's what we'd need to add..."
- ✅ "What's your priority: time to deployment, cost, or features?"
- ✅ "Can I follow up with a detailed proposal?"

---

## 📝 Things to Document During Meeting

### Technical Requirements:
- [ ] SSO Provider: _________________
- [ ] Hosting Preference: _________________
- [ ] User Count: _________________
- [ ] Data Residency: _________________
- [ ] Integration Needs: _________________

### Contacts:
- [ ] Technical Lead: _________________ (email: _______)
- [ ] Project Manager: _________________ (email: _______)
- [ ] Security Contact: _________________ (email: _______)
- [ ] Procurement: _________________ (email: _______)

### Timeline:
- [ ] Target Go-Live: _________________
- [ ] Pilot Start: _________________
- [ ] Testing Period: _________________
- [ ] Next Meeting: _________________

### Budget:
- [ ] Budget Range: _________________
- [ ] Hosting: Their infrastructure or ours?
- [ ] Support Included: Yes / No / TBD
- [ ] Training Required: Yes / No / TBD

---

## 🎯 Success Metrics

### What a Good Meeting Looks Like:
- ✅ They understand what your system does
- ✅ You understand their requirements
- ✅ Clear next steps defined
- ✅ Technical contacts exchanged
- ✅ Rough timeline agreed
- ✅ They want to schedule follow-up

### What to Achieve:
- [ ] Get SSO metadata (or contact for it)
- [ ] Get access to test environment (if applicable)
- [ ] Schedule technical deep-dive session
- [ ] Agree on pilot scope (e.g., 10 users, Chemistry dept)
- [ ] Get written requirements document timeline

---

## ⏰ After Meeting (Within 24 Hours)

### Immediate Actions:
- [ ] Send thank-you email
- [ ] Send meeting notes/summary
- [ ] Document all requirements discussed
- [ ] Research any unknowns you need to clarify
- [ ] Prepare technical proposal outline

### Follow-Up (Within 1 Week):
- [ ] Send detailed technical proposal
- [ ] Provide cost estimates
- [ ] Create deployment timeline
- [ ] Draft SSO integration plan
- [ ] Identify any blockers/risks

---

## 💡 Quick Answers to Common Questions

**"How long to deploy?"**
> "SSO integration: 2-4 weeks. Security hardening and testing: 4-6 weeks. Pilot deployment: 2-4 weeks. Total: 2-3 months for production-ready deployment, depending on your requirements."

**"What does it cost?"**
> "Depends on hosting model. If we host: $10-50/user/year. If you host: one-time license ($20-50K) plus annual support (20% of license). Let's discuss your preferred approach and I'll provide detailed pricing."

**"What if something breaks?"**
> "We'll define an SLA with response times based on severity. Typical: Critical issues (system down) within 1 hour, high priority within 4 hours, normal within 1 business day. We'll provide monitoring, documentation, and knowledge transfer to your team."

**"Can you customize feature X?"**
> "Absolutely. The system is built on modern, modular architecture. After we agree on core deployment, we can discuss customizations. Typical custom features take 1-4 weeks depending on complexity."

**"Why Next.js and not [old technology]?"**
> "Next.js is the industry-standard modern web framework used by NASA, Netflix, and major universities. It provides excellent performance, security, and developer experience. More importantly, it means your IT team can easily maintain and extend it with standard web developers."

---

## 🔑 Key Numbers to Remember

### Technical:
- **Database:** PostgreSQL 14+
- **Node:** v20
- **Min Hardware:** 4 vCPU, 8 GB RAM
- **Storage:** ~1 GB per 100 users/year
- **Concurrent Users:** 500+ (target)
- **API Response Time:** <200ms (p95)
- **Uptime Target:** 99.9%

### Timeline:
- **SSO Integration:** 2-4 weeks
- **Security Audit:** 2-3 weeks
- **Load Testing:** 1-2 weeks
- **Pilot Deployment:** 2-4 weeks
- **Full Production:** 2-3 months

### Costs (Ballpark):
- **Hosting (us):** $250-1500/month
- **Hosting (them):** Their infrastructure costs
- **License:** $20-50K one-time
- **Support:** 20% annually
- **Per User (SaaS):** $10-50/year

---

## 🎓 Last-Minute Prep (10 Minutes Before)

### Mental Checklist:
- [ ] Review your tech stack
- [ ] Remember: It's a conversation, not interrogation
- [ ] Have questions ready for them
- [ ] Notebook + pen ready
- [ ] Positive attitude!

### Opening Small Talk:
- Ask about their current lab management process
- Show genuine interest in their research
- Mention you've worked with academic institutions (if true)
- Be friendly but professional

### Closing:
- Thank them for their time
- Confirm next steps
- Ask for business cards/contact info
- Offer to send meeting summary
- Express enthusiasm about potential partnership

---

## 📞 Emergency Reference

**If you get completely stuck on a question:**

> "That's an excellent technical question. I want to give you a thoroughly researched answer rather than guessing. Can I note that down and send you a detailed response by [tomorrow/end of week]? I'd rather be accurate than fast on something this important."

**This is professional and shows you care about accuracy.**

---

## ✅ Final Confidence Check

### You've Got This Because:
- ✅ Your app actually works (not vaporware)
- ✅ You're using proven, modern technologies
- ✅ You've implemented Row Level Security (many apps don't!)
- ✅ Your architecture is solid
- ✅ You're prepared with this guide
- ✅ You're honest about current state vs. production needs

### Remember:
> **They need a solution. You have a solution. The meeting is about finding if it's the right fit.**

You're not just asking for their approval — you're also evaluating if this is a project you want to take on.

---

**Now go nail that meeting!** 🚀💪

**Pro Tip:** Print this checklist and the main guide. Having physical notes to reference shows preparation and professionalism.
