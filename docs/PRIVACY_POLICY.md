# Halcyon Subdomain Registry — Privacy Policy

**Effective Date:** [INSERT DATE]
**Last Updated:** [INSERT DATE]

---

## 1. Introduction

This Privacy Policy explains how Halcyon Subdomain Registry ("HSR," "we," "us," or "our") collects, uses, stores, and protects information when you use our platform, including subdomain registration, NFT services, the secondary marketplace, and all related services (the "Service").

HSR is designed with privacy in mind. We do not require personal accounts, email addresses, or personal identifying information. Authentication is performed exclusively through cryptocurrency wallet signatures. However, certain data is necessarily collected through your use of the Service and the underlying blockchain infrastructure.

This policy complies with the General Data Protection Regulation (EU) 2016/679 ("GDPR"), the UK GDPR, and applicable data protection laws. Where you are located in the European Economic Area (EEA), United Kingdom, or another jurisdiction with similar data protection laws, you have specific rights detailed in Section 7.

---

## 2. Data Controller

The data controller responsible for your information is:

**Halcyon Subdomain Registry**
Email: [INSERT DPO/CONTACT EMAIL]
Address: [INSERT ADDRESS]

For data protection inquiries, contact our Data Protection Officer at [INSERT DPO EMAIL].

---

## 3. Information We Collect

### 3.1 Blockchain and Wallet Data

| Data | Source | Purpose |
|------|--------|---------|
| Public wallet address | Your Web3 wallet (e.g., MetaMask) | Authentication, transaction processing, NFT ownership verification |
| Transaction hashes | Flare Network blockchain | Transaction records, escrow processing, dispute resolution |
| NFT ownership records | Flare Network smart contracts | Subdomain ownership verification, marketplace functionality |
| Smart contract interactions | Flare Network blockchain | Service execution (registration, renewal, marketplace trades) |
| Wallet signature data | EIP-191 message signing | Session authentication — signatures are verified, not stored |

**Important:** Blockchain data is inherently public. Your wallet address, transaction history, and NFT holdings on the Flare Network are visible to anyone with access to a block explorer. HSR has no ability to delete, modify, or restrict access to on-chain data. This is a fundamental property of blockchain technology, not a choice made by HSR.

### 3.2 DNS and Domain Data

| Data | Source | Purpose |
|------|--------|---------|
| Subdomain registration records | Platform activity | DNS zone management via PowerDNS |
| DNS zone configurations | Platform / user input | Resolving subdomains on Handshake network |
| NS and glue records | Platform activity | DNS delegation and resolution |
| DNS propagation status | Automated monitoring | Verifying registration completion |

### 3.3 NFT and Content Data

| Data | Source | Purpose |
|------|--------|---------|
| AI art generation prompts | User-selected themes | Generating NFT artwork |
| Generation parameters (seed, model, style) | Platform | Reproducibility and regeneration |
| NFT metadata (name, description, attributes) | Platform-generated | ERC-721 token metadata |
| IPFS content identifiers (CIDs) | Pinata / NFT.storage | Permanent storage of NFT artwork and metadata |

### 3.4 Technical and Usage Data

| Data | Source | Purpose |
|------|--------|---------|
| IP address | Server logs | Rate limiting, abuse prevention, security |
| Browser type and version | HTTP headers | Compatibility and debugging |
| Device type | HTTP headers | Responsive design optimization |
| Pages visited and actions taken | Server logs | Platform stability and error detection |
| Timestamps | Server logs | Security auditing and debugging |
| Referral source | HTTP headers | Understanding how users find the platform |

### 3.5 Data We Do NOT Collect

HSR does **not** collect:

- Names, email addresses, or phone numbers (unless you voluntarily provide them in support requests)
- Government-issued identification
- Physical addresses
- Financial information beyond on-chain transaction data
- Social media profiles or credentials
- Biometric data
- Data from minors (the Service is not directed at individuals under 18)

---

## 4. How We Use Your Information

### 4.1 Legal Bases for Processing (GDPR Article 6)

| Purpose | Legal Basis | Details |
|---------|-------------|---------|
| Processing subdomain registrations and NFT minting | Contract performance (Art. 6(1)(b)) | Necessary to deliver the Service you requested |
| DNS zone management and resolution | Contract performance (Art. 6(1)(b)) | Core service functionality |
| Marketplace transaction processing | Contract performance (Art. 6(1)(b)) | Executing trades, enforcing royalties and fees |
| Smart contract escrow and verification | Contract performance (Art. 6(1)(b)) | Securing funds during DNS verification |
| Security monitoring and abuse prevention | Legitimate interest (Art. 6(1)(f)) | Protecting the platform and its users |
| Rate limiting and DDoS protection | Legitimate interest (Art. 6(1)(f)) | Maintaining service availability |
| Platform stability and error detection | Legitimate interest (Art. 6(1)(f)) | Identifying and resolving technical issues |
| Responding to support inquiries | Legitimate interest (Art. 6(1)(f)) | Providing user assistance |
| Compliance with legal obligations | Legal obligation (Art. 6(1)(c)) | Responding to lawful requests from authorities |
| Analytics (if enabled, see Section 5) | Consent (Art. 6(1)(a)) | Understanding platform usage patterns |

### 4.2 We Do NOT Use Your Data For

- Targeted advertising or ad profiling
- Selling or renting data to third parties
- Building personal profiles beyond wallet-based service records
- Automated decision-making with legal or significant effects (GDPR Article 22)
- Marketing communications (we have no email or contact mechanism by default)

---

## 5. Analytics and Tracking

### 5.1 Current Analytics Practices

HSR uses minimal server-side logging for platform stability and security purposes. This includes:

- Request counts and error rates (aggregated)
- API endpoint performance metrics
- GPU generation queue and processing metrics
- DNS propagation success rates

These logs contain IP addresses and timestamps for security purposes but are not used for user profiling or behavioral tracking.

### 5.2 Third-Party Analytics

HSR does **not** currently use third-party analytics services (e.g., Google Analytics, Mixpanel, Amplitude). If third-party analytics are implemented in the future, this policy will be updated and, where required, consent will be obtained prior to activation.

### 5.3 No Cross-Site Tracking

HSR does not engage in cross-site tracking, fingerprinting, or any form of surveillance advertising.

---

## 6. Cookies and Local Storage

### 6.1 What We Use

HSR uses minimal browser storage mechanisms:

| Type | Name/Purpose | Duration | Category |
|------|-------------|----------|----------|
| Local Storage | Wallet connection state | Session / until disconnect | Strictly Necessary |
| Local Storage | UI preferences (theme, layout) | Persistent | Strictly Necessary |
| Local Storage | Active project selection | Persistent | Strictly Necessary |
| Session Storage | Temporary transaction state | Browser session | Strictly Necessary |

### 6.2 What We Do NOT Use

- Third-party tracking cookies
- Advertising cookies
- Social media tracking pixels
- Cross-domain cookies
- Persistent analytics cookies

### 6.3 Cookie Consent

All storage mechanisms used by HSR are classified as "strictly necessary" for the Service to function. Under GDPR Recital 30 and the ePrivacy Directive, strictly necessary cookies do not require consent. If HSR introduces non-essential cookies in the future, a cookie consent mechanism will be implemented before activation.

### 6.4 Managing Browser Storage

You can clear all HSR-related local storage through your browser's developer tools or settings. Note that clearing local storage will disconnect your wallet session and reset UI preferences.

---

## 7. Your Rights Under GDPR

If you are located in the EEA, UK, or a jurisdiction with equivalent data protection laws, you have the following rights regarding your personal data:

### 7.1 Right of Access (Article 15)

You have the right to request a copy of the personal data HSR holds about you. Since our primary identifier is your wallet address, your request must be submitted from the wallet address in question (via signed message) to verify identity.

**What we can provide:**
- Off-chain data associated with your wallet address (DNS records, generation history, support correspondence)
- Server log excerpts related to your IP address (if identifiable)

**What we cannot provide:**
- On-chain data is already publicly accessible via any Flare Network block explorer
- IPFS content is publicly accessible via any IPFS gateway

### 7.2 Right to Rectification (Article 16)

You have the right to request correction of inaccurate personal data. Due to the immutable nature of blockchain records and IPFS content, rectification is limited to off-chain data stored in our databases (e.g., DNS configurations, support records).

### 7.3 Right to Erasure / Right to Be Forgotten (Article 17)

You may request deletion of your personal data. HSR will comply where feasible, with the following limitations:

**Data we can delete:**
- Server logs containing your IP address (after retention period or upon request)
- Off-chain database records (DNS configurations, generation history, cached metadata)
- Support correspondence

**Data we cannot delete:**
- Blockchain transaction records — these are immutable and distributed across the Flare Network. HSR has no technical ability to modify or erase on-chain data.
- IPFS-pinned content — IPFS is a distributed protocol. HSR can unpin content from our IPFS nodes (Pinata, NFT.storage), but copies may persist on other IPFS nodes. Unpinning does not guarantee deletion.
- Data required for legal compliance or the establishment, exercise, or defense of legal claims.

Erasure of off-chain data may affect your ability to use the Service (e.g., DNS resolution will cease if zone records are deleted).

### 7.4 Right to Restriction of Processing (Article 18)

You may request that HSR restrict processing of your data while a dispute is resolved (e.g., accuracy of data, legitimacy of processing). During restriction, data is stored but not actively processed.

### 7.5 Right to Data Portability (Article 20)

You have the right to receive your personal data in a structured, commonly used, machine-readable format. HSR will provide data in JSON format upon request, including:

- Subdomain registration records
- DNS zone configurations
- NFT metadata and generation parameters
- Transaction history (mirrored from on-chain records)

On-chain data is inherently portable — it can be read directly from the Flare Network by any compatible application.

### 7.6 Right to Object (Article 21)

You have the right to object to processing based on legitimate interests (Section 4.1). HSR will cease processing unless we demonstrate compelling legitimate grounds that override your interests.

### 7.7 Right to Withdraw Consent (Article 7(3))

Where processing is based on consent (e.g., optional analytics), you may withdraw consent at any time. Withdrawal does not affect the lawfulness of processing performed prior to withdrawal.

### 7.8 Exercising Your Rights

To exercise any of these rights, contact us at [INSERT DPO EMAIL] with:

- Your public wallet address
- A signed message from that wallet proving ownership (we will provide the message to sign)
- A description of your request

We will respond within **thirty (30) days** of receiving a verified request. If your request is complex, we may extend this by an additional sixty (60) days with notice.

There is no fee for exercising your rights unless requests are manifestly unfounded or excessive, in which case a reasonable fee may be charged.

### 7.9 Right to Lodge a Complaint

You have the right to lodge a complaint with a supervisory authority. If you are in the EEA, you can find your local authority at: https://edpb.europa.eu/about-edpb/about-edpb/members_en

---

## 8. Data Retention

| Data Category | Retention Period | Justification |
|--------------|-----------------|---------------|
| Blockchain data (on-chain) | Permanent (immutable) | Inherent to blockchain technology |
| IPFS content (pinned) | Duration of active registration + 90 days | Service delivery; unpinned after grace period |
| DNS zone records | Duration of active registration + 60-day grace period | Service delivery |
| Server access logs (IP, timestamps) | 90 days | Security monitoring and abuse prevention |
| API request logs | 30 days | Debugging and performance monitoring |
| AI generation history (prompts, seeds) | Duration of active registration | Regeneration capability |
| Support correspondence | 2 years from last interaction | Dispute resolution and service improvement |
| Marketplace transaction records (off-chain) | 5 years | Financial record-keeping and dispute resolution |
| Rate limiting data | 24 hours | Abuse prevention |

After retention periods expire, data is permanently deleted from HSR systems during routine maintenance cycles. Deletion occurs within thirty (30) days of the retention period expiring.

---

## 9. Third-Party Services and Data Sharing

HSR integrates with the following third-party services to deliver the platform:

### 9.1 Blockchain Infrastructure

| Service | Data Shared | Purpose |
|---------|-------------|---------|
| **Flare Network** (RPC nodes) | Wallet address, transaction data | Transaction broadcasting and blockchain queries |
| **Handshake (HNS)** nodes | Domain records | TLD ownership verification and DNS root zone |
| **FTSO (Flare Time Series Oracle)** | None (read-only) | FLR/USD price feed for pricing |

Blockchain networks are decentralized. Data submitted to these networks is publicly accessible and not controlled by any single entity.

### 9.2 Storage Services

| Service | Data Shared | Purpose | Privacy Policy |
|---------|-------------|---------|----------------|
| **Pinata** | NFT images, metadata JSON | IPFS pinning for NFT permanence | https://www.pinata.cloud/privacy-policy |
| **NFT.storage** | NFT images, metadata JSON | Redundant IPFS/Filecoin storage | https://nft.storage/privacy |

Content uploaded to IPFS is content-addressed and may be replicated across the distributed network. HSR can unpin content from our accounts but cannot guarantee removal from all IPFS nodes.

### 9.3 DNS Infrastructure

| Service | Data Shared | Purpose |
|---------|-------------|---------|
| **PowerDNS** (self-hosted) | Domain records, IP addresses | Authoritative DNS for HSR-managed TLDs |
| **Unbound** (self-hosted) | DNS queries | Recursive DNS resolution |

DNS infrastructure is self-hosted on HSR-controlled servers. DNS query logs follow the retention schedule in Section 8.

### 9.4 Data We Do NOT Share

HSR does **not**:

- Sell personal data to any third party.
- Share data with advertising networks.
- Provide data to data brokers.
- Share data with analytics providers (unless disclosed and consented to).
- Transfer data to third parties for their own marketing purposes.

### 9.5 Legal Disclosure

HSR may disclose data if required by law, regulation, legal process, or governmental request. We will make reasonable efforts to notify affected users unless prohibited by law or court order.

---

## 10. Data Security

### 10.1 Measures We Take

- Server infrastructure secured with firewall rules (UFW) and SSH key authentication
- API rate limiting to prevent abuse
- Smart contracts audited for reentrancy and access control vulnerabilities
- Database access restricted to application layer only
- HTTPS encryption for all web traffic
- No storage of private keys, seed phrases, or wallet credentials — authentication is performed via cryptographic message signing

### 10.2 Measures You Should Take

- Never share your wallet private keys or seed phrases with anyone, including HSR
- Use a hardware wallet for high-value NFT holdings
- Verify you are interacting with official HSR smart contract addresses
- Keep your browser and wallet software up to date
- Be aware of phishing attempts impersonating HSR

### 10.3 Breach Notification

In the event of a data breach affecting your personal data, HSR will:

- Notify the relevant supervisory authority within 72 hours (GDPR Article 33)
- Notify affected users without undue delay if the breach poses a high risk to their rights and freedoms (GDPR Article 34)
- Document the breach, its effects, and remedial actions taken

---

## 11. International Data Transfers

HSR servers are located in [INSERT COUNTRY]. If you access the Service from outside this jurisdiction, your data may be transferred to and processed in [INSERT COUNTRY].

For transfers of personal data from the EEA or UK, HSR relies on:

- Standard Contractual Clauses (SCCs) approved by the European Commission, where applicable
- The necessity of the transfer for the performance of a contract (GDPR Article 49(1)(b)), specifically for blockchain transaction processing which is inherently cross-border

Blockchain data is, by its nature, globally distributed and not subject to geographic restriction.

---

## 12. Children's Privacy

The Service is not directed at individuals under the age of 18. HSR does not knowingly collect personal data from minors. Since we do not collect age-related information and authentication is wallet-based, we cannot independently verify age. If we become aware that data has been collected from a minor, we will take steps to delete it.

---

## 13. Changes to This Policy

HSR may update this Privacy Policy at any time. Changes will be indicated by updating the "Last Updated" date at the top of this document. For material changes that significantly affect how we process your data, we will make reasonable efforts to provide notice through the platform.

Continued use of the Service after changes constitutes acceptance of the revised policy. We encourage you to review this policy periodically.

---

## 14. Contact Us

For privacy-related questions, data requests, or concerns:

**Data Protection Officer**
Halcyon Subdomain Registry
Email: [INSERT DPO EMAIL]

For GDPR rights requests, please include your wallet address and a signed verification message. We will respond within 30 days.

---

*This Privacy Policy is effective as of the date stated above and applies to all users of the Halcyon Subdomain Registry platform.*
