import React from 'react'

export function PrivacyContent() {
    return (
        <div className="prose dark:prose-invert max-w-none space-y-6">
            <div>
                <h1 className="text-3xl font-bold mb-2">Notes9 Data Terms & Privacy Notice</h1>
                <p className="text-muted-foreground">
                    <strong>Effective date:</strong> From the date of User Registration with Notes9 website<br />
                    <strong>Supplier:</strong> Notes9 project team (“Notes9”, “we”, “us”)<br />
                    <strong>Contact:</strong> admin@notes9.com
                </p>
            </div>

            <section>
                <h2 className="text-xl font-semibold mb-3">1. Purpose of this pilot</h2>
                <p>
                    Notes9 is running a limited pilot to evaluate a research workflow tool for creating and organising lab notes, protocols, and literature-linked research records.
                </p>
                <p>
                    This pilot is a beta evaluation. It is not intended for clinical care, patient management, or regulated GMP/GLP recordkeeping.
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">2. Pilot restrictions (what you must NOT upload)</h2>
                <p>
                    To keep the pilot low-risk and appropriate for early-stage testing, you agree not to upload or store in Notes9 during the pilot:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>Patient data or any data derived from clinical records</li>
                    <li>Special category personal data (e.g., health data about identifiable individuals, genetic/biometric identifiers, ethnicity, religion, etc.)</li>
                    <li>Payment card data</li>
                    <li>Highly sensitive organisational information classified as confidential/restricted (e.g., secrets, security designs, credentials, export-controlled data)</li>
                    <li>Any content you do not have the right to process or share</li>
                </ul>
                <p className="mt-2">
                    If you are unsure whether data is allowed, treat it as disallowed and contact your organisation data administrator.
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">3. Roles: who is Controller / Processor</h2>
                <p>
                    For research content you upload (“Customer Content”), the organisation or your lab/institute/company or firm typically determines why and how that content is processed. In that case:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>The organisation/university/Insitute/lab/company is the Data Controller</li>
                    <li>Notes9 is the Data Processor, processing Customer Content only on documented instructions from the Controller</li>
                </ul>
                <p className="mt-2">
                    For account and service administration data (e.g., login email, basic usage logs), Notes9 may act as a Data Controller to operate the service.
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">4. What data we collect</h2>
                <h3 className="text-lg font-medium mt-4 mb-2">4.1 Account & admin data (service operation)</h3>
                <ul className="list-disc pl-6 space-y-1">
                    <li>Name and email address (for accounts)</li>
                    <li>Organisation/department (if provided)</li>
                    <li>Authentication and access logs (e.g., sign-in time, device/browser metadata)</li>
                    <li>Basic support communications (messages you send to us)</li>
                </ul>

                <h3 className="text-lg font-medium mt-4 mb-2">4.2 Customer Content (research content you upload)</h3>
                <ul className="list-disc pl-6 space-y-1">
                    <li>Notes, protocols, experiment metadata</li>
                    <li>Attachments you upload (files, images, tables)</li>
                    <li>Links/annotations to papers or internal references</li>
                </ul>

                <h3 className="text-lg font-medium mt-4 mb-2">4.3 What we do NOT want in the pilot</h3>
                <p>
                    See Section 2 (disallowed data). We also strongly discourage storing direct identifiers about third parties.
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">5. How we use data (and lawful basis)</h2>
                <h3 className="text-lg font-medium mt-4 mb-2">5.1 Account & admin data</h3>
                <p>We use account/admin data to:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>provide access to the pilot service</li>
                    <li>maintain security, prevent abuse, and troubleshoot</li>
                    <li>communicate essential service messages</li>
                </ul>
                <p className="mt-2">
                    Lawful basis typically includes performance of a contract (providing the service) and legitimate interests (security and service improvement).
                </p>

                <h3 className="text-lg font-medium mt-4 mb-2">5.2 Customer Content</h3>
                <p>
                    We process Customer Content to provide the features you use (storage, retrieval, collaboration, search, and optional AI functions if enabled by your pilot admin).
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">6. AI features (pilot-safe version)</h2>
                <p>If AI features are enabled for your pilot:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>Customer Content may be processed to generate outputs (summaries, suggestions, structured fields).</li>
                    <li>We do not use Customer Content to train general-purpose models unless the Controller explicitly opts in in writing.</li>
                    <li>We will maintain a list of sub-processors used for AI or hosting and will provide it to the University on request (and/or publish it).</li>
                    <li>If your pilot requires that no content leaves a specific region or that no third-party AI processors are used, Notes9 will configure the pilot accordingly (where technically feasible) and document the configuration.</li>
                </ul>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">7. Security measures (baseline commitments for the pilot)</h2>
                <p>During the pilot, Notes9 will implement reasonable technical and organisational measures, including:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>access limited to authorised personnel on a need-to-know basis</li>
                    <li>encryption of data in transit using modern TLS</li>
                    <li>separation of customer environments where applicable</li>
                    <li>logging and monitoring aimed at detecting unauthorised access or malicious behaviour</li>
                    <li>vulnerability management and patching processes prioritised by risk</li>
                </ul>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">8. Incident management and notification</h2>
                <p>If we become aware of a suspected or confirmed security incident affecting University data in the pilot, we will:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>notify the University pilot owner without undue delay, and</li>
                    <li>provide available details on scope, data affected, containment steps, and recommended actions</li>
                </ul>
                <p className="mt-2">
                    Where the Organisation requires rapid notification for incidents, we will work to meet those timelines and coordinate with the nominated security contacts.
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">9. Data retention and deletion</h2>
                <p>
                    Customer Content is retained only for the pilot period or if a user wants to delete their account of Notes9, unless the organisation/user requests an extension in writing.
                </p>
                <p className="mt-2">
                    At pilot completion or termination, Notes9 will, upon instruction:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>return Customer Content in a reasonable export format, and/or</li>
                    <li>securely delete Customer Content from active systems within 14 days of account deletion.</li>
                </ul>
                <p className="mt-2">
                    Backups (if used) will be overwritten/expired on a rolling basis within 28 days
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">10. Sub-processors and where data is processed</h2>
                <p>
                    Notes9 may use vetted service providers (e.g., hosting, logging, email). We will provide a current sub-processor list on request.
                </p>
                <p className="mt-2">
                    Data location (pilot): USA / UK / EU region<br />
                    If data is transferred outside the USA/UK/EU, we will use appropriate safeguards (e.g., contractual protections) and disclose this to the Controller.
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">11. Your responsibilities</h2>
                <p>You agree to:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>follow the Pilot Restrictions (Section 2)</li>
                    <li>use strong passwords and enable MFA (if offered)</li>
                    <li>promptly report suspected account compromise to <a href="mailto:admin@notes9.com" className="text-primary hover:underline">admin@notes9.com</a></li>
                    <li>ensure you have rights/permissions to upload the content you upload</li>
                </ul>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">12. Individual rights and how requests are handled</h2>
                <p>Because the organisation is typically the Controller for Customer Content:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>requests to access/erase/rectify Customer Content should usually be directed to your organisational contact</li>
                    <li>Notes9 will assist the Controller to respond to valid requests where applicable</li>
                </ul>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">13. Confidentiality</h2>
                <p>
                    We treat Customer Content as confidential and do not disclose it to third parties except:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>to sub-processors needed to deliver the service</li>
                    <li>where required by law</li>
                    <li>with the Controller’s instructions/consent</li>
                </ul>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">14. Changes to these terms</h2>
                <p>
                    We may update these Pilot Terms to reflect pilot learnings or security requirements. If changes materially affect data handling, we will notify the organisations's owner.
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3">15. Contact and complaints</h2>
                <p>
                    Privacy: <a href="mailto:admin@notes9.com" className="text-primary hover:underline">admin@notes9.com</a><br />
                    Security: <a href="mailto:admin@notes9.com" className="text-primary hover:underline">admin@notes9.com</a>
                </p>
                <p className="mt-2">
                    Organisational users may also raise concerns through their Organisational channels.
                </p>
            </section>
        </div>
    )
}
