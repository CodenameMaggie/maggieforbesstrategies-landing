/**
 * PHASE 3: Smart Outreach Templates
 * No AI needed - template selection based on qualification data
 * AI only for edge cases or personalization requests
 */

/**
 * Generate personalized outreach email based on prospect qualification
 */
function generateOutreach(prospect, qualification) {
  const {
    companyName,
    contactPerson,
    recentSignal,
    industry
  } = prospect;

  const {
    priority,
    approach_angle,
    pain_points,
    reasons
  } = qualification;

  // Extract funding amount for personalization
  const fundingMatch = recentSignal.match(/\$?(\d+(?:\.\d+)?)\s*(?:million|M|billion|B)/i);
  const fundingText = fundingMatch ? fundingMatch[0] : 'recent funding';

  // Select template based on signal type and priority
  let template;

  if (recentSignal.toLowerCase().includes('acquisition') || recentSignal.toLowerCase().includes('acquired')) {
    template = acquisitionTemplate;
  } else if (recentSignal.toLowerCase().includes('hired ceo') || recentSignal.toLowerCase().includes('hired coo')) {
    template = executiveHireTemplate;
  } else if (recentSignal.toLowerCase().includes('expansion') || recentSignal.toLowerCase().includes('new market')) {
    template = expansionTemplate;
  } else if (recentSignal.toLowerCase().includes('raised') || recentSignal.toLowerCase().includes('series')) {
    template = fundingTemplate;
  } else {
    template = genericGrowthTemplate;
  }

  // Fill in template with prospect data
  const email = template({
    contactPerson: extractFirstName(contactPerson),
    companyName,
    fundingText,
    signal: recentSignal,
    painPoint1: pain_points[0] || 'operational scalability',
    painPoint2: pain_points[1] || 'strategic execution',
    painPoint3: pain_points[2] || 'leadership development',
    industry: industry || 'your industry',
    approachAngle: approach_angle
  });

  return {
    subject: generateSubject(prospect, qualification),
    body: email,
    priority: priority
  };
}

/**
 * Subject Line Generator
 */
function generateSubject(prospect, qualification) {
  const { companyName, recentSignal } = prospect;
  const { approach_angle } = qualification;

  const fundingMatch = recentSignal.match(/\$?(\d+(?:\.\d+)?)\s*(?:million|M|billion|B)/i);

  if (fundingMatch) {
    return `Re: ${companyName} ${fundingMatch[0]} raise`;
  } else if (recentSignal.toLowerCase().includes('acquisition')) {
    return `M&A integration at ${companyName}`;
  } else if (recentSignal.toLowerCase().includes('hired')) {
    return `Supporting ${companyName}'s leadership transition`;
  } else {
    return `Strategic growth at ${companyName}`;
  }
}

/**
 * Extract first name from full name
 */
function extractFirstName(fullName) {
  if (!fullName) return 'there';

  // Handle "CEO - Company" format
  if (fullName.startsWith('CEO -')) {
    return 'there';
  }

  const parts = fullName.trim().split(' ');
  return parts[0];
}

/**
 * TEMPLATE: Funding Announcement
 */
const fundingTemplate = (data) => `Hi ${data.contactPerson},

Saw ${data.companyName} raised ${data.fundingText}—congrats on the milestone.

Companies scaling post-${data.fundingText} typically hit three predictable friction points:

1. ${data.painPoint1}
2. ${data.painPoint2}
3. ${data.painPoint3}

We've helped similar organizations navigate exactly this inflection point. Most discover they need external strategic support not because they lack capability—but because they're too embedded in execution to architect the system from above.

Would a 15-minute conversation about ${data.approachAngle} be valuable?

Best,
Maggie Forbes
Strategic Growth Architecture
maggieforbesstrategies.com`;

/**
 * TEMPLATE: Executive Hiring
 */
const executiveHireTemplate = (data) => `Hi ${data.contactPerson},

Noticed ${data.companyName}'s recent leadership changes.

Executive transitions create unique strategic windows. The challenge isn't talent—it's ensuring new leadership has the infrastructure and strategic framework to execute at velocity.

Organizations at this stage typically need:
- Leadership alignment and role clarity
- Strategic planning frameworks that scale
- Operational systems that support autonomous execution

We specialize in architecting growth systems during these exact transitions.

Worth a brief conversation?

Best,
Maggie Forbes
Strategic Growth Architecture
maggieforbesstrategies.com`;

/**
 * TEMPLATE: Acquisition/M&A
 */
const acquisitionTemplate = (data) => `Hi ${data.contactPerson},

Saw the ${data.companyName} acquisition news.

M&A integration is where most strategic value is won or lost. The real work starts after the announcement—aligning cultures, integrating systems, maintaining momentum while managing transformation.

Post-acquisition, organizations need:
- Integration roadmaps that preserve value
- Cultural alignment frameworks
- Operational consolidation without disruption

We've guided several organizations through this exact phase.

15-minute conversation about integration strategy?

Best,
Maggie Forbes
Strategic Growth Architecture
maggieforbesstrategies.com`;

/**
 * TEMPLATE: Market Expansion
 */
const expansionTemplate = (data) => `Hi ${data.contactPerson},

Following ${data.companyName}'s expansion into new markets.

Geographic/vertical expansion introduces complexity most organizations underestimate. It's not just sales—it's operational architecture, local execution frameworks, and strategic coordination across distributed teams.

Expansion requires:
- Scalable go-to-market frameworks
- Distributed operational models
- Strategic oversight without centralized bottlenecks

We've helped organizations architect expansion that scales.

Worth discussing your expansion strategy?

Best,
Maggie Forbes
Strategic Growth Architecture
maggieforbesstrategies.com`;

/**
 * TEMPLATE: Generic Growth Signal
 */
const genericGrowthTemplate = (data) => `Hi ${data.contactPerson},

Been following ${data.companyName}'s trajectory in ${data.industry}.

Organizations at your growth stage typically face a specific challenge: the infrastructure that got you here constrains further scaling. Every strategic initiative requires founder involvement. Quarterly performance depends on relationships rather than systems.

We specialize in architecting intelligent growth systems that create predictable opportunity flow without operational chaos.

Worth a conversation about strategic growth architecture?

Best,
Maggie Forbes
Strategic Growth Architecture
maggieforbesstrategies.com`;

module.exports = {
  generateOutreach
};
