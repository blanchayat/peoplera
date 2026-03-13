module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { candidatesAnalyzed, onboardingPlansGenerated, employeesMonitored, planCost, avgSalary } = req.body;

  const avgSal = avgSalary || 60000;
  const badHireCost = avgSal * 0.3;
  const onboardingTimeSaved = onboardingPlansGenerated * 8 * 75;
  const burnoutPreventionValue = Math.round(employeesMonitored * 0.15) * avgSal * 0.5;
  const hrTimeSaved = (candidatesAnalyzed * 0.5 + onboardingPlansGenerated * 2 + employeesMonitored * 0.25) * 75;
  const totalValue = badHireCost + onboardingTimeSaved + burnoutPreventionValue + hrTimeSaved;
  const roi = planCost > 0 ? Math.round(((totalValue - planCost) / planCost) * 100) : 0;

  return res.status(200).json({
    badHireCostPrevented: Math.round(badHireCost),
    onboardingTimeSaved: Math.round(onboardingTimeSaved),
    burnoutPreventionValue: Math.round(burnoutPreventionValue),
    hrTimeSaved: Math.round(hrTimeSaved),
    totalValue: Math.round(totalValue),
    roi,
    monthlyCost: planCost
  });
};
