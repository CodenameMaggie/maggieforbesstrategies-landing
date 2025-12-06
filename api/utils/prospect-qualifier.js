/**
 * PHASE 3: Rule-Based Prospect Qualification
 * No AI needed for 80% of prospects - pure business logic
 * AI only for edge cases
 */

/**
 * Qualify a prospect based on hard-coded business rules
 * Returns: { qualified: boolean, priority: string, reasons: [], pain_points: [] }
 */
function qualifyProspect(prospect) {
  const {
    companyName,
    recentSignal,
    industry,
    companySize,
    fundingAmount,
    signalType,
    signalDate
  } = prospect;

  // Extract numeric values
  const funding = extractFundingAmount(recentSignal);
  const employees = extractEmployeeCount(companySize);
  const daysOld = signalDate ? daysSince(signalDate) : 30;

  const qualification = {
    qualified: false,
    priority: 'low',
    score: 0,
    reasons: [],
    pain_points: [],
    approach_angle: '',
    use_ai: false  // Only true if we need AI to decide
  };

  // RULE 1: Funding Amount (Most Important)
  if (funding >= 50000000) {  // $50M+
    qualification.score += 50;
    qualification.reasons.push('Major funding ($50M+) indicates rapid scaling needs');
    qualification.pain_points.push('Scaling operations from startup to enterprise');
    qualification.pain_points.push('Building executive team and leadership structure');
    qualification.pain_points.push('Implementing enterprise-grade processes');
  } else if (funding >= 20000000) {  // $20M+
    qualification.score += 35;
    qualification.reasons.push('Significant funding ($20M+) signals growth phase');
    qualification.pain_points.push('Professionalizing operations');
    qualification.pain_points.push('Scaling team from 50 to 200+');
  } else if (funding >= 5000000) {  // $5M+
    qualification.score += 20;
    qualification.reasons.push('Series A/B funding indicates product-market fit achieved');
    qualification.pain_points.push('First-time scaling challenges');
  }

  // RULE 2: Recency (Time-sensitive)
  if (daysOld <= 7) {
    qualification.score += 25;
    qualification.reasons.push('Very recent signal (within 7 days) - strike while hot');
  } else if (daysOld <= 30) {
    qualification.score += 15;
    qualification.reasons.push('Recent signal (within 30 days) - good timing');
  } else if (daysOld <= 60) {
    qualification.score += 5;
  }

  // RULE 3: Signal Type
  if (signalType === 'funding' || recentSignal.toLowerCase().includes('raised')) {
    qualification.score += 15;
    qualification.approach_angle = 'Post-funding scaling strategy';
  } else if (signalType === 'executive_hiring' || recentSignal.toLowerCase().includes('hired ceo') || recentSignal.toLowerCase().includes('hired coo')) {
    qualification.score += 20;
    qualification.reasons.push('New C-level hire signals organizational transformation');
    qualification.pain_points.push('Leadership transition management');
    qualification.approach_angle = 'Executive transition support';
  } else if (signalType === 'expansion' || recentSignal.toLowerCase().includes('expansion') || recentSignal.toLowerCase().includes('new market')) {
    qualification.score += 15;
    qualification.approach_angle = 'Market expansion strategy';
  } else if (signalType === 'acquisition' || recentSignal.toLowerCase().includes('acquired')) {
    qualification.score += 25;
    qualification.reasons.push('M&A activity requires integration expertise');
    qualification.pain_points.push('Post-acquisition integration');
    qualification.pain_points.push('Culture alignment');
    qualification.approach_angle = 'M&A integration consulting';
  }

  // RULE 4: Company Size (Ideal Range)
  if (employees >= 50 && employees <= 500) {
    qualification.score += 15;
    qualification.reasons.push('Ideal company size (50-500) - big enough to need help, small enough to be agile');
  } else if (employees >= 20 && employees <= 1000) {
    qualification.score += 10;
  } else if (employees > 1000) {
    qualification.score += 5;
    qualification.reasons.push('Large company - may have internal resources, but high deal value');
  }

  // RULE 5: Industry Fit
  const highValueIndustries = ['saas', 'software', 'technology', 'fintech', 'healthtech', 'cleantech', 'enterprise'];
  const industryLower = (industry || '').toLowerCase();

  if (highValueIndustries.some(ind => industryLower.includes(ind))) {
    qualification.score += 10;
    qualification.reasons.push('High-value industry with strong margins');
  }

  // RULE 6: Series Stage (from signal)
  if (recentSignal.match(/series [b-d]/i)) {
    qualification.score += 10;
    qualification.reasons.push('Series B+ indicates proven business model, scaling phase');
  } else if (recentSignal.match(/series a/i)) {
    qualification.score += 5;
  }

  // QUALIFICATION THRESHOLDS
  if (qualification.score >= 70) {
    qualification.qualified = true;
    qualification.priority = 'high';
  } else if (qualification.score >= 50) {
    qualification.qualified = true;
    qualification.priority = 'medium';
  } else if (qualification.score >= 30) {
    qualification.qualified = true;
    qualification.priority = 'low';
  } else {
    // Edge case - not enough info, use AI
    qualification.use_ai = true;
    qualification.qualified = false;
  }

  // Default pain points if none identified
  if (qualification.pain_points.length === 0) {
    qualification.pain_points = [
      'Operational efficiency at scale',
      'Strategic planning and execution',
      'Leadership development'
    ];
  }

  // Default approach angle
  if (!qualification.approach_angle) {
    qualification.approach_angle = 'Strategic growth consulting';
  }

  return qualification;
}

/**
 * Extract funding amount from signal text
 */
function extractFundingAmount(signal) {
  if (!signal) return 0;

  // Match patterns like "$50M", "$50 million", "50M", etc.
  const patterns = [
    /\$(\d+(?:\.\d+)?)\s*(?:million|M)/i,
    /(\d+(?:\.\d+)?)\s*(?:million|M)/i,
    /\$(\d+(?:\.\d+)?)\s*(?:billion|B)/i,
    /(\d+(?:\.\d+)?)\s*(?:billion|B)/i
  ];

  for (const pattern of patterns) {
    const match = signal.match(pattern);
    if (match) {
      const amount = parseFloat(match[1]);
      // Convert billions to millions
      if (pattern.toString().includes('billion') || pattern.toString().includes('B')) {
        return amount * 1000000000;
      }
      return amount * 1000000;
    }
  }

  return 0;
}

/**
 * Extract employee count from company size string
 */
function extractEmployeeCount(sizeStr) {
  if (!sizeStr) return 0;

  // Match patterns like "50-200", "100+", "500 employees", etc.
  const rangeMatch = sizeStr.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    // Return midpoint of range
    return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2;
  }

  const plusMatch = sizeStr.match(/(\d+)\+/);
  if (plusMatch) {
    return parseInt(plusMatch[1]);
  }

  const numberMatch = sizeStr.match(/(\d+)/);
  if (numberMatch) {
    return parseInt(numberMatch[1]);
  }

  return 0;
}

/**
 * Calculate days since a date
 */
function daysSince(dateStr) {
  if (!dateStr) return 999;

  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (e) {
    return 999;
  }
}

module.exports = {
  qualifyProspect,
  extractFundingAmount,
  extractEmployeeCount
};
