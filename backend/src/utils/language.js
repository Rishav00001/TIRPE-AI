const SUPPORTED_LANGUAGES = ['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa'];

const LANGUAGE_NAMES = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  bn: 'Bengali',
  mr: 'Marathi',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
};

const DRIVER_LABELS = {
  en: {
    crowd_load: 'crowd load',
    weather_environment: 'weather and AQI',
    traffic: 'traffic pressure',
    social_signal: 'social media surge',
  },
  hi: {
    crowd_load: 'भीड़ दबाव',
    weather_environment: 'मौसम और AQI',
    traffic: 'ट्रैफिक दबाव',
    social_signal: 'सोशल मीडिया वृद्धि',
  },
};

const SUMMARY_TEMPLATES = {
  en: {
    red: ({ locationName, driver, utilization }) => `${locationName} is in red risk. Main pressure comes from ${driver}. Expected capacity utilization is ${utilization}%.`,
    yellow: ({ locationName, driver, utilization }) => `${locationName} is in yellow risk. Monitor ${driver} closely. Expected capacity utilization is ${utilization}%.`,
    green: ({ locationName, driver, utilization }) => `${locationName} is currently green risk with controlled ${driver}. Expected capacity utilization is ${utilization}%.`,
  },
  hi: {
    red: ({ locationName, driver, utilization }) => `${locationName} रेड जोखिम में है। मुख्य दबाव ${driver} से आ रहा है। अनुमानित क्षमता उपयोग ${utilization}% है।`,
    yellow: ({ locationName, driver, utilization }) => `${locationName} येलो जोखिम में है। ${driver} पर करीबी निगरानी रखें। अनुमानित क्षमता उपयोग ${utilization}% है।`,
    green: ({ locationName, driver, utilization }) => `${locationName} फिलहाल ग्रीन जोखिम में है और ${driver} नियंत्रित है। अनुमानित क्षमता उपयोग ${utilization}% है।`,
  },
};

const MITIGATION_COPY = {
  en: {
    advisory_controlled: 'Risk is within controlled thresholds.',
    advisory_red: 'Risk exceeds red threshold. Immediate mitigation recommended.',
    monitor: 'Maintain active monitoring; no crowd escalation required yet.',
    monitor_min: 'Maintain active monitoring; no escalation required.',
    action_staggered: 'Implement staggered entry windows in 30-minute slots.',
    action_shuttle: 'Activate shuttle movement from satellite parking zones.',
    action_parking: 'Apply selective parking restrictions around core perimeter.',
    action_aqi: 'Issue AQI health advisory and prioritize masks/indoor holding areas for vulnerable visitors.',
    action_weather: 'Activate weather safety plan with shelter routing, rain gear kiosks, and extra field marshals.',
  },
  hi: {
    advisory_controlled: 'जोखिम नियंत्रित सीमा में है।',
    advisory_red: 'जोखिम रेड थ्रेशोल्ड से ऊपर है। तुरंत शमन कार्रवाई आवश्यक है।',
    monitor: 'सक्रिय निगरानी जारी रखें; अभी भीड़ वृद्धि नियंत्रण में है।',
    monitor_min: 'सक्रिय निगरानी जारी रखें; अभी एस्केलेशन आवश्यक नहीं है।',
    action_staggered: '30 मिनट स्लॉट में चरणबद्ध प्रवेश लागू करें।',
    action_shuttle: 'सैटेलाइट पार्किंग से शटल संचालन सक्रिय करें।',
    action_parking: 'मुख्य परिधि के आसपास चयनित पार्किंग प्रतिबंध लागू करें।',
    action_aqi: 'AQI स्वास्थ्य सलाह जारी करें और संवेदनशील आगंतुकों के लिए मास्क/इनडोर होल्डिंग प्राथमिकता दें।',
    action_weather: 'शेल्टर रूटिंग, रेन गियर कियोस्क और अतिरिक्त फील्ड मार्शल के साथ मौसम सुरक्षा योजना सक्रिय करें।',
  },
};

function normalizeLanguage(code) {
  const normalized = String(code || '').trim().toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(normalized)) {
    return normalized;
  }
  return 'en';
}

function getLanguageName(code) {
  const normalized = normalizeLanguage(code);
  return LANGUAGE_NAMES[normalized] || LANGUAGE_NAMES.en;
}

function getDriverLabel(key, language = 'en') {
  const normalized = normalizeLanguage(language);
  return DRIVER_LABELS[normalized]?.[key] || DRIVER_LABELS.en[key] || key;
}

function buildPlainSummary({
  language = 'en',
  locationName,
  riskScore,
  dominantDriverKey,
  capacityUtilizationPct,
}) {
  const normalized = normalizeLanguage(language);
  const templates = SUMMARY_TEMPLATES[normalized] || SUMMARY_TEMPLATES.en;
  const driver = getDriverLabel(dominantDriverKey, normalized);
  const utilization = Number(capacityUtilizationPct || 0).toFixed(1);

  if (riskScore > 70) {
    return templates.red({ locationName, driver, utilization });
  }

  if (riskScore >= 40) {
    return templates.yellow({ locationName, driver, utilization });
  }

  return templates.green({ locationName, driver, utilization });
}

function getMitigationCopy(language = 'en') {
  const normalized = normalizeLanguage(language);
  return MITIGATION_COPY[normalized] || MITIGATION_COPY.en;
}

module.exports = {
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  getLanguageName,
  getDriverLabel,
  buildPlainSummary,
  getMitigationCopy,
};

