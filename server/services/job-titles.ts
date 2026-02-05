/**
 * Job Titles Service - Dynamic global job title search
 * Uses ESCO API (European Skills, Competences, Qualifications and Occupations)
 * Fallback to local data if API fails
 */

// ESCO API - Free European Commission API for occupations
const ESCO_API_BASE = "https://ec.europa.eu/esco/api";

interface ESCOOccupation {
  uri: string;
  title: string;
  className: string;
}

interface ESCOSearchResult {
  _embedded?: {
    results?: Array<{
      uri: string;
      title: string;
      className: string;
    }>;
  };
  total?: number;
}

/**
 * Search job titles using ESCO API (Free, no API key required)
 */
export async function searchJobTitlesFromAPI(query: string, limit: number = 15): Promise<string[]> {
  try {
    const url = `${ESCO_API_BASE}/search?text=${encodeURIComponent(query)}&type=occupation&language=en&full=false&limit=${limit}`;
    
    console.log(`[ESCO API] Fetching: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`[ESCO API] Error: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data: ESCOSearchResult = await response.json();
    
    console.log(`[ESCO API] Response total: ${data.total}, results: ${data._embedded?.results?.length || 0}`);
    
    if (data._embedded?.results) {
      const titles = data._embedded.results
        .filter(r => r.className === 'Occupation')
        .map(r => r.title)
        .slice(0, limit);
      
      console.log(`[ESCO API] Filtered titles: ${titles.length}`);
      return titles;
    }
    
    return [];
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('[ESCO API] Request timed out');
    } else {
      console.error('[ESCO API] Fetch error:', error.message || error);
    }
    return [];
  }
}

// Fallback: Comprehensive list of job titles organized by category
const JOB_TITLES_BY_CATEGORY: Record<string, string[]> = {
  // Software Engineering
  "Software Engineering": [
    "Software Engineer", "Senior Software Engineer", "Staff Software Engineer", 
    "Principal Software Engineer", "Lead Software Engineer", "Software Architect",
    "Software Developer", "Senior Software Developer", "Junior Software Developer",
    "Associate Software Engineer", "Engineering Manager", "Director of Engineering",
    "VP of Engineering", "CTO", "Chief Technology Officer", "Technical Lead",
  ],
  
  // Frontend Development
  "Frontend Development": [
    "Frontend Developer", "Front End Developer", "Frontend Engineer",
    "Senior Frontend Developer", "Senior Frontend Engineer", "Lead Frontend Developer",
    "Principal Frontend Engineer", "Staff Frontend Engineer",
    "React Developer", "React.js Developer", "React Engineer", "Senior React Developer",
    "Vue.js Developer", "Vue Developer", "Senior Vue Developer",
    "Angular Developer", "Angular Engineer", "Senior Angular Developer",
    "JavaScript Developer", "Senior JavaScript Developer", "TypeScript Developer",
    "UI Developer", "UI Engineer", "Web Developer", "Senior Web Developer",
    "Next.js Developer", "Svelte Developer", "Ember.js Developer",
  ],
  
  // Backend Development
  "Backend Development": [
    "Backend Developer", "Back End Developer", "Backend Engineer",
    "Senior Backend Developer", "Senior Backend Engineer", "Lead Backend Developer",
    "Node.js Developer", "Senior Node.js Developer", "Node.js Engineer",
    "Python Developer", "Senior Python Developer", "Python Engineer",
    "Java Developer", "Senior Java Developer", "Java Engineer",
    "Go Developer", "Golang Developer", "Senior Go Developer",
    "Ruby Developer", "Ruby on Rails Developer", "Rails Developer",
    "PHP Developer", "Senior PHP Developer", "Laravel Developer",
    ".NET Developer", "Senior .NET Developer", ".NET Engineer",
    "C# Developer", "Senior C# Developer", "C# Engineer",
    "Scala Developer", "Kotlin Developer", "Rust Developer",
    "C++ Developer", "Senior C++ Developer", "C Developer",
    "API Developer", "Microservices Developer",
  ],
  
  // Full Stack Development
  "Full Stack Development": [
    "Full Stack Developer", "Fullstack Developer", "Full Stack Engineer",
    "Senior Full Stack Developer", "Senior Fullstack Developer", "Senior Full Stack Engineer",
    "Lead Full Stack Developer", "Staff Full Stack Engineer",
    "MERN Stack Developer", "MEAN Stack Developer", "LAMP Stack Developer",
    "Full Stack JavaScript Developer", "Full Stack Python Developer",
    "Full Stack Java Developer", "Full Stack .NET Developer",
  ],
  
  // Mobile Development
  "Mobile Development": [
    "Mobile Developer", "Mobile Engineer", "Mobile Application Developer",
    "Senior Mobile Developer", "Lead Mobile Developer",
    "iOS Developer", "Senior iOS Developer", "iOS Engineer", "Lead iOS Developer",
    "Android Developer", "Senior Android Developer", "Android Engineer", "Lead Android Developer",
    "React Native Developer", "Senior React Native Developer",
    "Flutter Developer", "Senior Flutter Developer",
    "Swift Developer", "Kotlin Android Developer",
    "Cross Platform Developer", "Hybrid Mobile Developer",
  ],
  
  // DevOps & Cloud
  "DevOps & Cloud": [
    "DevOps Engineer", "Senior DevOps Engineer", "Lead DevOps Engineer",
    "DevOps Architect", "DevOps Manager", "DevOps Specialist",
    "Site Reliability Engineer", "SRE", "Senior SRE",
    "Cloud Engineer", "Senior Cloud Engineer", "Cloud Architect",
    "AWS Engineer", "AWS Solutions Architect", "AWS DevOps Engineer",
    "Azure Engineer", "Azure Solutions Architect", "Azure DevOps Engineer",
    "GCP Engineer", "Google Cloud Engineer", "Google Cloud Architect",
    "Platform Engineer", "Senior Platform Engineer",
    "Infrastructure Engineer", "Senior Infrastructure Engineer",
    "Release Engineer", "Build Engineer", "CI/CD Engineer",
    "Kubernetes Engineer", "Docker Engineer", "Container Engineer",
  ],
  
  // Data & Analytics
  "Data & Analytics": [
    "Data Engineer", "Senior Data Engineer", "Lead Data Engineer",
    "Data Scientist", "Senior Data Scientist", "Lead Data Scientist",
    "Data Analyst", "Senior Data Analyst", "Business Data Analyst",
    "Machine Learning Engineer", "ML Engineer", "Senior ML Engineer",
    "AI Engineer", "AI/ML Engineer", "Deep Learning Engineer",
    "NLP Engineer", "Computer Vision Engineer",
    "Business Intelligence Analyst", "BI Analyst", "BI Developer",
    "ETL Developer", "Data Warehouse Engineer",
    "Big Data Engineer", "Hadoop Developer", "Spark Developer",
    "Analytics Engineer", "Data Analytics Engineer",
    "Quantitative Analyst", "Research Scientist",
  ],
  
  // QA & Testing
  "QA & Testing": [
    "QA Engineer", "Quality Assurance Engineer", "Senior QA Engineer",
    "QA Analyst", "Quality Analyst", "Test Analyst",
    "Test Engineer", "Senior Test Engineer", "Lead Test Engineer",
    "SDET", "Software Development Engineer in Test", "Senior SDET",
    "Automation Engineer", "Test Automation Engineer", "QA Automation Engineer",
    "Manual Tester", "Manual QA Engineer",
    "Performance Test Engineer", "Load Test Engineer",
    "Security Tester", "Penetration Tester",
    "QA Lead", "QA Manager", "Test Manager",
  ],
  
  // Security
  "Security": [
    "Security Engineer", "Senior Security Engineer", "Lead Security Engineer",
    "Cybersecurity Engineer", "Cybersecurity Analyst",
    "Information Security Analyst", "InfoSec Analyst",
    "Security Analyst", "Senior Security Analyst",
    "Application Security Engineer", "AppSec Engineer",
    "Network Security Engineer", "Cloud Security Engineer",
    "Security Architect", "Security Consultant",
    "Penetration Tester", "Ethical Hacker",
    "SOC Analyst", "Security Operations Analyst",
    "CISO", "Chief Information Security Officer",
  ],
  
  // Database
  "Database": [
    "Database Administrator", "DBA", "Senior DBA",
    "Database Developer", "Database Engineer",
    "SQL Developer", "Senior SQL Developer",
    "MongoDB Developer", "PostgreSQL Developer",
    "Oracle DBA", "MySQL DBA", "SQL Server DBA",
    "Data Architect", "Database Architect",
  ],
  
  // Systems & Infrastructure
  "Systems & Infrastructure": [
    "Systems Engineer", "Senior Systems Engineer",
    "Systems Administrator", "System Administrator", "Senior Sysadmin",
    "Linux Administrator", "Linux Engineer", "Senior Linux Administrator",
    "Windows Administrator", "Windows Engineer",
    "Network Engineer", "Senior Network Engineer", "Network Administrator",
    "IT Support Engineer", "IT Administrator",
    "Technical Support Engineer", "Support Engineer",
  ],
  
  // Design
  "Design": [
    "UI Designer", "Senior UI Designer", "Lead UI Designer",
    "UX Designer", "Senior UX Designer", "Lead UX Designer",
    "UI/UX Designer", "Product Designer", "Senior Product Designer",
    "Lead Designer", "Design Lead", "Principal Designer",
    "Visual Designer", "Senior Visual Designer",
    "Interaction Designer", "UX Researcher", "Senior UX Researcher",
    "Graphic Designer", "Senior Graphic Designer",
    "Web Designer", "Digital Designer",
    "Design Manager", "Head of Design", "Design Director",
    "Creative Director", "Art Director",
  ],
  
  // Product Management
  "Product Management": [
    "Product Manager", "Senior Product Manager", "Lead Product Manager",
    "Principal Product Manager", "Group Product Manager",
    "Technical Product Manager", "Senior Technical Product Manager",
    "Associate Product Manager", "APM", "Junior Product Manager",
    "Product Owner", "Senior Product Owner",
    "Director of Product", "VP of Product", "Head of Product",
    "Chief Product Officer", "CPO",
    "Product Analyst", "Product Operations Manager",
  ],
  
  // Project Management
  "Project Management": [
    "Project Manager", "Senior Project Manager", "Lead Project Manager",
    "Technical Project Manager", "IT Project Manager",
    "Program Manager", "Senior Program Manager",
    "Technical Program Manager", "TPM", "Senior TPM",
    "Scrum Master", "Senior Scrum Master", "Certified Scrum Master",
    "Agile Coach", "Agile Project Manager",
    "Delivery Manager", "Engineering Program Manager",
    "PMO Manager", "Portfolio Manager",
  ],
  
  // Marketing
  "Marketing": [
    "Marketing Manager", "Senior Marketing Manager",
    "Digital Marketing Manager", "Digital Marketing Specialist",
    "Content Marketing Manager", "Content Strategist",
    "Growth Marketing Manager", "Growth Manager", "Growth Hacker",
    "Performance Marketing Manager", "Paid Media Manager",
    "SEO Specialist", "SEO Manager", "SEO Analyst",
    "SEM Specialist", "SEM Manager", "PPC Specialist",
    "Social Media Manager", "Social Media Specialist",
    "Email Marketing Manager", "Marketing Automation Specialist",
    "Brand Manager", "Brand Strategist",
    "Marketing Analyst", "Marketing Data Analyst",
    "Content Writer", "Copywriter", "Senior Copywriter",
    "Marketing Director", "VP of Marketing", "CMO", "Chief Marketing Officer",
  ],
  
  // Sales
  "Sales": [
    "Sales Representative", "Sales Executive", "Sales Associate",
    "Account Executive", "Senior Account Executive", "Enterprise Account Executive",
    "Sales Manager", "Senior Sales Manager", "Regional Sales Manager",
    "Business Development Representative", "BDR",
    "Sales Development Representative", "SDR",
    "Account Manager", "Senior Account Manager", "Key Account Manager",
    "Inside Sales Representative", "Outside Sales Representative",
    "Sales Engineer", "Pre-Sales Engineer", "Solutions Engineer",
    "Sales Director", "VP of Sales", "Head of Sales",
    "Chief Revenue Officer", "CRO",
  ],
  
  // Customer Success
  "Customer Success": [
    "Customer Success Manager", "CSM", "Senior Customer Success Manager",
    "Customer Success Associate", "Customer Success Specialist",
    "Customer Support Representative", "Customer Service Representative",
    "Technical Support Specialist", "Technical Support Engineer",
    "Support Engineer", "Senior Support Engineer",
    "Help Desk Analyst", "Help Desk Technician",
    "Customer Experience Manager", "CX Manager",
    "Implementation Specialist", "Onboarding Specialist",
    "Customer Success Director", "VP of Customer Success",
  ],
  
  // HR & Recruiting
  "HR & Recruiting": [
    "HR Manager", "Human Resources Manager", "Senior HR Manager",
    "HR Business Partner", "HRBP", "Senior HRBP",
    "HR Generalist", "Senior HR Generalist",
    "Recruiter", "Technical Recruiter", "Senior Recruiter",
    "Talent Acquisition Specialist", "Talent Acquisition Manager",
    "Sourcer", "Recruiting Coordinator",
    "People Operations Manager", "People Partner",
    "HR Director", "VP of HR", "VP of People",
    "Chief People Officer", "CHRO",
    "Compensation Analyst", "Benefits Specialist",
    "Learning & Development Manager", "Training Manager",
  ],
  
  // Finance & Accounting
  "Finance & Accounting": [
    "Financial Analyst", "Senior Financial Analyst",
    "Accountant", "Senior Accountant", "Staff Accountant",
    "Finance Manager", "Senior Finance Manager",
    "Controller", "Assistant Controller",
    "FP&A Analyst", "FP&A Manager",
    "Treasury Analyst", "Tax Analyst",
    "Accounts Payable Specialist", "Accounts Receivable Specialist",
    "Bookkeeper", "Payroll Specialist",
    "Finance Director", "VP of Finance",
    "CFO", "Chief Financial Officer",
  ],
  
  // Operations
  "Operations": [
    "Operations Manager", "Senior Operations Manager",
    "Business Operations Manager", "Operations Analyst",
    "Operations Coordinator", "Operations Specialist",
    "Process Improvement Manager", "Business Process Analyst",
    "Supply Chain Manager", "Logistics Manager",
    "Facilities Manager", "Office Manager",
    "Operations Director", "VP of Operations",
    "COO", "Chief Operating Officer",
  ],
  
  // Executive
  "Executive": [
    "CEO", "Chief Executive Officer",
    "CTO", "Chief Technology Officer",
    "CFO", "Chief Financial Officer",
    "COO", "Chief Operating Officer",
    "CMO", "Chief Marketing Officer",
    "CPO", "Chief Product Officer",
    "CRO", "Chief Revenue Officer",
    "CISO", "Chief Information Security Officer",
    "CIO", "Chief Information Officer",
    "Founder", "Co-Founder",
    "Managing Director", "General Manager",
    "President", "Vice President",
  ],
  
  // Consulting
  "Consulting": [
    "Consultant", "Senior Consultant", "Lead Consultant",
    "Management Consultant", "Strategy Consultant",
    "Business Analyst", "Senior Business Analyst",
    "Business Consultant", "Technical Consultant",
    "Solutions Architect", "Senior Solutions Architect",
    "Enterprise Architect", "Technical Architect",
    "Implementation Consultant", "Functional Consultant",
  ],
  
  // Other Technical
  "Other Technical": [
    "Technical Writer", "Senior Technical Writer",
    "Documentation Engineer", "Documentation Specialist",
    "Developer Advocate", "Developer Relations Engineer",
    "Developer Experience Engineer", "DX Engineer",
    "Solutions Engineer", "Customer Engineer",
    "Integration Engineer", "Implementation Engineer",
    "Embedded Systems Engineer", "Firmware Engineer",
    "Hardware Engineer", "Electronics Engineer",
    "Robotics Engineer", "IoT Engineer",
    "Blockchain Developer", "Smart Contract Developer",
    "Game Developer", "Unity Developer", "Unreal Developer",
    "Graphics Programmer", "3D Developer",
    "AR/VR Developer", "XR Developer",
  ],
};

// Flatten all job titles into a single array with metadata
interface JobTitleEntry {
  title: string;
  category: string;
  keywords: string[];
}

let jobTitlesCache: JobTitleEntry[] | null = null;

function getAllJobTitles(): JobTitleEntry[] {
  if (jobTitlesCache) return jobTitlesCache;
  
  const entries: JobTitleEntry[] = [];
  
  for (const [category, titles] of Object.entries(JOB_TITLES_BY_CATEGORY)) {
    for (const title of titles) {
      // Generate keywords from title
      const keywords = title.toLowerCase()
        .split(/[\s\/\-\.]+/)
        .filter(w => w.length > 1);
      
      entries.push({ title, category, keywords });
    }
  }
  
  jobTitlesCache = entries;
  return entries;
}

// Common abbreviations and their expansions
const ABBREVIATIONS: Record<string, string[]> = {
  "sr": ["senior"],
  "jr": ["junior"],
  "mgr": ["manager"],
  "eng": ["engineer", "engineering"],
  "dev": ["developer", "development"],
  "swe": ["software engineer"],
  "sde": ["software development engineer", "software developer"],
  "pm": ["product manager", "project manager"],
  "tpm": ["technical program manager"],
  "ui": ["user interface"],
  "ux": ["user experience"],
  "qa": ["quality assurance"],
  "sdet": ["software development engineer in test"],
  "sre": ["site reliability engineer"],
  "dba": ["database administrator"],
  "ml": ["machine learning"],
  "ai": ["artificial intelligence"],
  "bi": ["business intelligence"],
  "hr": ["human resources"],
  "it": ["information technology"],
  "vp": ["vice president"],
  "cto": ["chief technology officer"],
  "ceo": ["chief executive officer"],
  "cfo": ["chief financial officer"],
  "coo": ["chief operating officer"],
  "cmo": ["chief marketing officer"],
  "fe": ["frontend", "front end"],
  "be": ["backend", "back end"],
  "fs": ["full stack", "fullstack"],
  "bdr": ["business development representative"],
  "sdr": ["sales development representative"],
  "csm": ["customer success manager"],
  "aws": ["amazon web services"],
  "gcp": ["google cloud platform"],
};

function expandQuery(query: string): string[] {
  const q = query.toLowerCase().trim();
  const terms = [q];
  
  // Check for abbreviation expansions
  const words = q.split(/\s+/);
  for (const word of words) {
    if (ABBREVIATIONS[word]) {
      for (const expansion of ABBREVIATIONS[word]) {
        terms.push(q.replace(word, expansion));
      }
    }
  }
  
  // Also check if query itself is an abbreviation
  if (ABBREVIATIONS[q]) {
    terms.push(...ABBREVIATIONS[q]);
  }
  
  return Array.from(new Set(terms));
}

/**
 * Search job titles with fuzzy matching
 */
export function searchJobTitles(query: string, limit: number = 15): string[] {
  const q = (query || "").trim().toLowerCase();
  
  if (!q || q.length < 1) return [];
  
  const allTitles = getAllJobTitles();
  const expandedQueries = expandQuery(q);
  
  interface ScoredResult {
    title: string;
    score: number;
  }
  
  const results: ScoredResult[] = [];
  const seenTitles = new Set<string>();
  
  for (const entry of allTitles) {
    const titleLower = entry.title.toLowerCase();
    
    if (seenTitles.has(entry.title)) continue;
    
    let maxScore = 0;
    
    for (const searchTerm of expandedQueries) {
      // Exact match
      if (titleLower === searchTerm) {
        maxScore = Math.max(maxScore, 100);
      }
      // Starts with
      else if (titleLower.startsWith(searchTerm)) {
        maxScore = Math.max(maxScore, 80);
      }
      // Word starts with
      else if (entry.keywords.some(k => k.startsWith(searchTerm))) {
        maxScore = Math.max(maxScore, 70);
      }
      // Contains
      else if (titleLower.includes(searchTerm)) {
        maxScore = Math.max(maxScore, 50);
      }
      // Keyword contains
      else if (entry.keywords.some(k => k.includes(searchTerm))) {
        maxScore = Math.max(maxScore, 40);
      }
    }
    
    if (maxScore > 0) {
      seenTitles.add(entry.title);
      // Boost shorter titles (more specific)
      const lengthBonus = Math.max(0, 20 - entry.title.length / 3);
      results.push({ title: entry.title, score: maxScore + lengthBonus });
    }
  }
  
  // Sort by score descending, then by title length
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.length - b.title.length;
  });
  
  return results.slice(0, limit).map(r => r.title);
}

/**
 * Search job titles - uses local data with optional API enhancement
 * This is the main function to use for dynamic search
 */
export async function searchJobTitlesDynamic(query: string, limit: number = 15): Promise<string[]> {
  const q = (query || "").trim();
  if (!q || q.length < 1) return [];
  
  // Get local results first (fast and reliable)
  const localResults = searchJobTitles(q, limit);
  
  console.log(`[searchJobTitlesDynamic] Local results for "${q}": ${localResults.length}`);
  
  // If we have enough local results, return them
  if (localResults.length >= 5) {
    return localResults;
  }
  
  // Try ESCO API to supplement results
  try {
    const apiResults = await searchJobTitlesFromAPI(q, limit);
    
    if (apiResults.length > 0) {
      // Merge and deduplicate
      const combined = [...localResults];
      for (const api of apiResults) {
        if (!combined.some(r => r.toLowerCase() === api.toLowerCase())) {
          combined.push(api);
        }
      }
      
      return combined.slice(0, limit);
    }
  } catch (error) {
    console.error('[searchJobTitlesDynamic] API error, using local results:', error);
  }
  
  return localResults;
}

/**
 * Get job titles by category
 */
export function getJobTitlesByCategory(category: string): string[] {
  return JOB_TITLES_BY_CATEGORY[category] || [];
}

/**
 * Get all categories
 */
export function getCategories(): string[] {
  return Object.keys(JOB_TITLES_BY_CATEGORY);
}
