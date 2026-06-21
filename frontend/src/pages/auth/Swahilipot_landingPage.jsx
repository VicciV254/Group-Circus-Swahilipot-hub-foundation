import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { useNavigate } from 'react-router-dom';
import spLogo from "../assets/sph-logo.png";

/* ─────────────────── DESIGN TOKENS ─────────────────── */
const T = {
  navy: "#123d7d",
  navyMid: "#12233E",
  navyLight: "#b30c7b",
  gold: "#C9973A",
  goldLight: "#E8B84B",
  goldPale: "#FFF8E7",
  cream: "#FAFAF6",
  offWhite: "#F5F3EE",
  text: "#1A1A1A",
  textMuted: "#666",
  textLight: "#999",
  red: "#C0392B",
  green: "#1DB954",
  border: "rgba(0,0,0,0.08)",
  white: "#ffffff",
};

/* ─────────────────── DATA ─────────────────── */
const NAV_SECTIONS = ["Home", "About", /*"Programmes",*/ "Studios", "News", "FM Live", "Programs", "Impacts", "Contact"];

const STATS = [
  { value: "91.7", unit: "FM", label: "Swahilipot FM" },
  { value: "10,000+", unit: "", label: "Youth Empowered" },
  { value: "150+", unit: "", label: "Startups Supported" },
  { value: "2016", unit: "", label: "Founded" },
];

const PROGRAMMES = [
  {
    code: "DRB", badge: "Flagship",
    title: "Diploma in Radio Broadcasting",
    duration: "2 Years", intake: "January & September",
    fee: "KES 95,000 / year",
    desc: "Master live presenting, production engineering, and full station management. Train on our licensed 98.4 FM facility from your first week — not in simulations.",
    modules: ["Live Presenting & Voice", "Production & Editing", "Station Management", "FM Technology", "Media Law & Ethics", "Digital Journalism"],
    icon: "🎙",
    color: T.navy,
  },
  {
    code: "DJN", badge: "High Demand",
    title: "Diploma in Journalism & News",
    duration: "2 Years", intake: "January & September",
    fee: "KES 90,000 / year",
    desc: "From field reporting and investigative journalism to editorial workflow and broadcast news production. Work with our fully equipped 30-seat digital newsroom.",
    modules: ["Reporting & Interviewing", "Multimedia Storytelling", "Editorial Judgment", "Photojournalism", "Broadcast News Presenting", "Data Journalism"],
    icon: "📰",
    color: "#1B4F72",
  },
  {
    code: "DVP", badge: "",
    title: "Diploma in Video Production",
    duration: "2 Years", intake: "January",
    fee: "KES 110,000 / year",
    desc: "Cinematography, editing, documentary production and broadcast television in our professional 4-camera HD studio and videography suites with full post-production capability.",
    modules: ["Cinematography", "Non-Linear Editing", "Documentary Filmmaking", "Lighting & Studio Ops", "Motion Graphics", "Distribution & Streaming"],
    icon: "🎬",
    color: "#4A235A",
  },
  {
    code: "DAE", badge: "Flexible Entry",
    title: "Diploma in Audio Engineering",
    duration: "18 Months", intake: "Any Month",
    fee: "KES 80,000 / year",
    desc: "Sound design, studio recording, live sound reinforcement and DAW mastery. Graduate with a professional portfolio recorded in our Neve-equipped studios.",
    modules: ["Studio Recording", "Mixing & Mastering", "Live Sound", "DAW Proficiency", "Acoustics", "Music Production"],
    icon: "🎚",
    color: "#1A5276",
  },
  {
    code: "DMM", badge: "New 2026",
    title: "Diploma in Digital Media & Marketing",
    duration: "18 Months", intake: "January & September",
    fee: "KES 85,000 / year",
    desc: "Social media strategy, content creation, audience analytics, and digital campaign management for the modern media landscape.",
    modules: ["Social Media Strategy", "Content Production", "SEO & Analytics", "Brand Communication", "Podcast Production", "Influencer & Creator Economy"],
    icon: "📱",
    color: "#0B5345",
  },
  {
    code: "SC", badge: "",
    title: "Short Courses & CPD",
    duration: "2 – 12 Weeks", intake: "Rolling",
    fee: "From KES 15,000",
    desc: "Industry-focused short courses for working professionals. Podcast production, drone videography, newsroom systems, and social media content.",
    modules: ["Podcast Fundamentals", "Drone Videography", "Newsroom Tech", "Live Streaming", "Voice & Presentation", "Social Content"],
    icon: "⚡",
    color: "#784212",
  },
]

const NEWS_ITEMS = [
  { id: 1, cat: "Innovation", date: "2 Jun 2026", title: "Young Innovators Showcase Award-Winning Solutions at Swahilipot Hub", excerpt: "Youth innovators presented groundbreaking technology and community-driven solutions during the annual innovation showcase, attracting industry leaders, mentors, and investors from across the region.", readTime: "3 min", featured: true },
  { id: 2, cat: "Technology", date: "28 May 2026", title: "New Digital Learning Lab Opens to Support Emerging Technologies", excerpt: "The newly launched innovation lab provides access to modern equipment, collaborative workspaces, and resources for software development, artificial intelligence, robotics, and digital creativity.", readTime: "4 min", featured: true },
  { id: 3, cat: "Programs", date: "20 May 2026", title: "Applications Open for Digital Skills and Entrepreneurship Programs", excerpt: "Young people are invited to apply for upcoming training programs focused on software development, digital design, entrepreneurship, and innovation leadership.", readTime: "2 min", featured: false },
  { id: 4, cat: "Partnerships", date: "15 May 2026", title: "Swahilipot Hub Partners with Industry Leaders to Expand Opportunities", excerpt: "New strategic partnerships will provide mentorship, internship opportunities, and career development pathways for youth participating in Swahilipot Hub programs.", readTime: "3 min", featured: false },
  { id: 5, cat: "Events", date: "8 May 2026", title: "Community Innovation Day Scheduled for 14 June 2026", excerpt: "Students, innovators, entrepreneurs, and community members are invited to explore projects, attend workshops, and engage with technology demonstrations and networking sessions.", readTime: "2 min", featured: false },
  { id: 6, cat: "Community", date: "1 May 2026", title: "Digital Skills Initiative Reaches Hundreds of Youth Across the Coast Region", excerpt: "Swahilipot Hub continues to empower young people through hands-on training, mentorship, and innovation programs designed to build future-ready skills and create lasting community impact.", readTime: "5 min", featured: false },
];
const FACILITIES = [
  { name: "Software Development Lab", desc: "A collaborative workspace equipped for web development, mobile applications, cloud computing, and software engineering projects led by young innovators.", icon: "💻", area: "Technology Wing" },
  { name: "Creative Design Studio", desc: "Modern digital design space for graphic design, UI/UX, branding, animation, and content creation using industry-standard tools.", icon: "🎨", area: "Creative Wing" },
  { name: "Innovation & Startup Hub", desc: "A dedicated space where entrepreneurs, innovators, and changemakers develop ideas, receive mentorship, and build sustainable ventures.", icon: "🚀", area: "Innovation Centre" },
  { name: "Digital Media Lab", desc: "Equipped for photography, videography, digital storytelling, content production, and multimedia communication projects.", icon: "📸", area: "Media Centre" },
  { name: "Emerging Technologies Lab", desc: "Hands-on learning environment focused on artificial intelligence, robotics, IoT, automation, and future technologies.", icon: "🤖", area: "Technology Wing" },
  { name: "Training & Learning Centre", desc: "Flexible training rooms used for workshops, coding bootcamps, digital skills programs, and professional development sessions.", icon: "📚", area: "Learning Block" },
  { name: "Community Collaboration Space", desc: "An open environment designed for networking, teamwork, hackathons, innovation challenges, and community engagement activities.", icon: "🤝", area: "Main Hub" },
  { name: "Events & Makers Space", desc: "A multifunctional venue for exhibitions, product showcases, entrepreneurship events, creative performances, and youth forums.", icon: "🎤", area: "Community Centre" },
];

/* ─────────────────── IMPACTS & SUCCESS STORIES DATA ─────────────────── */
const SUCCESS_STORIES = [
  { name: "Maria Kimani", role: "Tech Entrepreneur", programme: "Tech Incubation", title: "Maria's Tech Journey", quote: "Swahilipot Hub gave me the skills and confidence to start my own tech company. Today, I employ five other youths from my community." },
  { name: "James Odhiambo", role: "Visual Artist", programme: "Arts Programme", title: "James' Art Collective", quote: "The arts program at Swahilipot helped me find my voice. Our collective now showcases East African art internationally." },
  { name: "Joan Otieno", role: "Travel Entrepreneur", programme: "Mentorship Programme", title: "Joan's Coastal Ventures", quote: "My life's passion is offering unique travel experiences to local and international tourists who visit Mombasa — Swahilipot mentorship helped me turn that passion into a business." },
  { name: "Nancy Moraa", role: "Communications, Swahilipot Hub", programme: "Mentorship Programme", title: "From Mentee to the Team", quote: "When you are given the opportunity to nurture your talent and grow yourself, do not relent. Continuous nurturing and mentorship gave me a strong base for my future." },
];

const IMPACT_STATS = [
  { value: "87%", label: "of participants find employment within 6 months" },
  { value: "90%", label: "of our startups survive beyond 2 years" },
  { value: "65%", label: "of our members are from underserved communities" },
  { value: "4.8/5", label: "average satisfaction rating from participants" },
];

/*
 * Per-year impact report data.
 * The Download button first tries to fetch a real PDF from
 * /reports/impact-report-<year>.pdf (drop your official PDFs in public/reports/).
 * If the file isn't found, it generates a PDF from the data below instead,
 * so the button always gives the user a document.
 */
const IMPACT_REPORTS = {
  2025: {
    youthReached: "36,000+", hubs: "55 youth hubs", mentors: "114 mentors & case managers",
    highlights: [
      "166% increase in formal employment among tracked participants",
      "85% rise in self-employment, with incomes nearly doubled",
      "Case management programme passed 10,000 young people across 5 cohorts",
      "Expansion underway into Nairobi and Kitui counties",
    ],
  },
  2024: {
    youthReached: "20,000+", hubs: "40 youth hubs", mentors: "90 mentors & case managers",
    highlights: [
      "87% of participants found employment within 6 months",
      "90% of incubated startups survived beyond 2 years",
      "65% of members drawn from underserved communities",
      "4.8/5 average satisfaction rating from participants",
    ],
  },
  2023: {
    youthReached: "8,000+", hubs: "20 youth hubs", mentors: "60 mentors & case managers",
    highlights: [
      "Youth Hub Network launched across Mombasa, Kilifi and Kwale",
      "Case management psychosocial support track introduced",
      "Hilton Foundation partnership for youth hubs and career pathways began",
    ],
  },
  2022: {
    youthReached: "4,000+", hubs: "8 youth hubs", mentors: "35 mentors",
    highlights: [
      "Over 4,000 members mentored, 65% of them youth",
      "GOYN Mombasa anchor-partner programmes scaled up",
      "Mombasa Plastics Prize Incubator supported green innovators",
    ],
  },
  2021: {
    youthReached: "2,500+", hubs: "4 youth hubs", mentors: "20 mentors",
    highlights: [
      "Digital skills and entrepreneurship training expanded post-pandemic",
      "Creative economy programmes connected artists to paying markets",
      "Community open days resumed at the Old Town hub",
    ],
  },
};

const REPORT_YEARS = Object.keys(IMPACT_REPORTS).sort((a, b) => b - a);

/* ─────────────────── SWAHILIPOT FM — WEEKLY SCHEDULE ───────────────────
 * Real Swahilipot FM programme grid. Keyed by JS day index (0=Sunday … 6=Saturday).
 * A show runs from its start time until the next show on the same day begins.
 */
const WEEKDAY_BASE = [
  { time: "06:00", show: "The Breakfast Club", type: "live" },
  { time: "10:00", show: "Kick Off", type: "live" },
  { time: "11:00", show: "Swahilipot Cafe", type: "live" },
  { time: "14:00", show: "Vibe with Kams in Swahili", type: "live" },
  { time: "15:00", show: "Swahilipot Drive Show", type: "live" },
  { time: "19:00", show: "Beyond The Ballot", type: "news" },
  { time: "21:00", show: "The Night Shift", type: "music" },
];

const WEEKLY_SCHEDULE = {
  0: [ // Sunday
    { time: "11:00", show: "Vibes and Music", type: "music" },
  ],
  1: WEEKDAY_BASE, // Monday
  2: WEEKDAY_BASE, // Tuesday
  3: WEEKDAY_BASE, // Wednesday
  4: WEEKDAY_BASE, // Thursday
  5: [ // Friday — Request Hour replaces Kick Off
    { time: "06:00", show: "The Breakfast Club", type: "live" },
    { time: "10:00", show: "Request Hour", type: "live" },
    { time: "11:00", show: "Swahilipot Cafe", type: "live" },
    { time: "14:00", show: "Vibe with Kams in Swahili", type: "live" },
    { time: "15:00", show: "Swahilipot Drive Show", type: "live" },
    { time: "19:00", show: "Beyond The Ballot", type: "news" },
    { time: "21:00", show: "The Night Shift", type: "music" },
  ],
  6: [ // Saturday
    { time: "08:00", show: "Mikuki ya Maneno", type: "live" },
    { time: "10:00", show: "Teenz Connect", type: "live" },
    { time: "12:00", show: "Swahilipot Aroma", type: "live" },
    { time: "15:00", show: "Kick Off", type: "live" },
    { time: "19:00", show: "Saturday Night Wave", type: "music" },
  ],
};

const showStartHour = (s) => {
  const [h, m] = s.time.split(":").map(Number);
  return h + (m || 0) / 60;
};

/** Returns { current, next } for the given moment based on the real weekly grid. */
function getNowPlaying(now = new Date()) {
  const shows = WEEKLY_SCHEDULE[now.getDay()] || [];
  const hour = now.getHours() + now.getMinutes() / 60;
  let current = null;
  let next = null;
  for (const s of shows) {
    if (showStartHour(s) <= hour) current = s;
    else { next = s; break; }
  }
  return { current, next };
}

/** True if `s` is the show airing right now on the given day. */
function isShowOnNow(s, day, now = new Date()) {
  if (day !== now.getDay()) return false;
  const { current } = getNowPlaying(now);
  return !!current && current.show === s.show && current.time === s.time;
}

/* ─────────────────── SHARED RADIO STORE ───────────────────
 * One audio element + one state shared by EVERY Live button on the page
 * (hero widget, FM page widgets, floating badge). Press play anywhere and
 * all of them switch to ON AIR together; stop anywhere and all show OFF AIR.
 */
const STREAM_URL = "https://swahilipotfm.out.airtime.pro:8000/swahilipotfm_b";

const radioStore = {
  state: { onAir: false, elapsed: 0, listeners: 3840 },
  subs: new Set(),
  audio: null,
  timer: null,

  emit(patch) {
    this.state = { ...this.state, ...patch };
    this.subs.forEach((fn) => fn());
  },

  getAudio() {
    if (!this.audio && typeof window !== "undefined") {
      this.audio = new window.Audio(STREAM_URL);
      this.audio.preload = "none";
      this.audio.addEventListener("playing", () => this.emit({ onAir: true }));
      this.audio.addEventListener("pause", () => this.emit({ onAir: false, elapsed: 0 }));
      this.audio.addEventListener("error", () => this.emit({ onAir: false }));
    }
    return this.audio;
  },

  async toggle() {
    const a = this.getAudio();
    if (!a) return;
    try {
      if (this.state.onAir) {
        a.pause();
        a.currentTime = 0;
      } else {
        await a.play();
      }
    } catch (err) {
      this.emit({ onAir: false });
    }
  },

  subscribe(fn) {
    this.subs.add(fn);
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.emit({
          elapsed: this.state.onAir ? this.state.elapsed + 1 : 0,
          listeners: this.state.listeners + Math.floor(Math.random() * 7) - 3,
        });
      }, 1000);
    }
    return () => {
      this.subs.delete(fn);
      if (this.subs.size === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
    };
  },

  getSnapshot() { return this.state; },
};

/** Hook: every component using this sees the SAME radio state. */
function useRadio() {
  const state = useSyncExternalStore(
    (fn) => radioStore.subscribe(fn),
    () => radioStore.getSnapshot(),
    () => radioStore.getSnapshot(),
  );
  return { ...state, toggle: () => radioStore.toggle() };
}

/*
 * Swahilipot Hub leadership & team — names documented in public sources
 * (swahilipothub.co.ke and partner publications). Verify titles against the
 * official Board Members page and add/adjust entries there as needed.
 */
const TEAM = [
  { name: "Mahmoud Noor", role: "Founder & Chief Mentor (Mentor 001)", dept: "Leadership" },
  { name: "Hillary Mutuma", role: "Case Management Lead", dept: "Programs" },
  { name: "Zuhra Shariff", role: "Human Resources", dept: "Administration" },
  { name: "Nancy Moraa", role: "Communications & Corporate Affairs", dept: "Communications" },
];

/* ─────────────────── HOOKS ─────────────────── */
function useInView(threshold = 0.12) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

function FadeIn({ children, delay = 0, y = 24, className = "", style = {} }) {
  const [ref, vis] = useInView();
  return (
    <div ref={ref} className={className} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0)" : `translateY(${y}px)`,
      transition: `opacity 0.65s cubic-bezier(.4,0,.2,1) ${delay}s, transform 0.65s cubic-bezier(.4,0,.2,1) ${delay}s`,
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ─────────────────── PDF REPORT DOWNLOAD HELPERS ─────────────────── */
/** Loads jsPDF from CDN once and caches it on window. */
function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => (window.jspdf && window.jspdf.jsPDF) ? resolve(window.jspdf.jsPDF) : reject(new Error("jsPDF failed to initialise"));
    s.onerror = () => reject(new Error("Could not load PDF library"));
    document.head.appendChild(s);
  });
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Builds a branded PDF for the given year from IMPACT_REPORTS data. */
async function generateImpactPdf(year) {
  const jsPDF = await loadJsPDF();
  const data = IMPACT_REPORTS[year];
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 56; // margin
  let y = 0;

  // Header band
  doc.setFillColor(10, 22, 40); // navy
  doc.rect(0, 0, W, 150, "F");
  doc.setFillColor(201, 151, 58); // gold rule
  doc.rect(0, 150, W, 4, "F");

  doc.setTextColor(201, 151, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("SWAHILIPOT HUB FOUNDATION  ·  MOMBASA, KENYA", M, 52);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(30);
  doc.text(`Impact Report ${year}`, M, 96);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(220, 220, 220);
  doc.text("Empowering youth through technology, arts & entrepreneurship", M, 122);

  y = 196;

  // Key figures
  doc.setTextColor(201, 151, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("BY THE NUMBERS", M, y);
  y += 22;

  const figures = [
    ["Youth reached", data.youthReached],
    ["Network", data.hubs],
    ["Support team", data.mentors],
  ];
  doc.setFontSize(12);
  figures.forEach(([label, val]) => {
    doc.setTextColor(26, 26, 26);
    doc.setFont("helvetica", "bold");
    doc.text(String(val), M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    doc.text(`  —  ${label}`, M + doc.getTextWidth(String(val)), y);
    y += 22;
  });

  y += 18;

  // Highlights
  doc.setTextColor(201, 151, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("HIGHLIGHTS OF THE YEAR", M, y);
  y += 22;

  doc.setFontSize(12);
  data.highlights.forEach((h) => {
    doc.setTextColor(201, 151, 58);
    doc.text("•", M, y);
    doc.setTextColor(26, 26, 26);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(h, W - M * 2 - 16);
    doc.text(lines, M + 16, y);
    y += lines.length * 16 + 8;
  });

  y += 18;

  // Standing impact metrics
  doc.setTextColor(201, 151, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PROGRAMME OUTCOMES", M, y);
  y += 22;
  doc.setFontSize(12);
  IMPACT_STATS.forEach((s) => {
    doc.setTextColor(26, 26, 26);
    doc.setFont("helvetica", "bold");
    doc.text(s.value, M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    const lines = doc.splitTextToSize(s.label, W - M * 2 - 70);
    doc.text(lines, M + 64, y);
    y += Math.max(lines.length * 16, 16) + 8;
  });

  // Footer
  const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(201, 151, 58);
  doc.setLineWidth(1);
  doc.line(M, H - 70, W - M, H - 70);
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text("Swahilipot Hub Foundation · Swahili Cultural Centre, Old Town, Mombasa · info@swahilipothub.co.ke", M, H - 50);
  doc.text(`Generated ${new Date().toLocaleDateString("en-KE")} · swahilipothub.co.ke`, M, H - 36);

  doc.save(`Swahilipot-Impact-Report-${year}.pdf`);
}

/**
 * Tries to fetch the official PDF for a year from /reports/impact-report-<year>.pdf.
 * Falls back to generating one from IMPACT_REPORTS data if it doesn't exist.
 */
async function downloadImpactReport(year) {
  try {
    const res = await fetch(`/reports/impact-report-${year}.pdf`);
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (res.ok && type.includes("pdf")) {
      const blob = await res.blob();
      triggerBlobDownload(blob, `Swahilipot-Impact-Report-${year}.pdf`);
      return "server";
    }
    throw new Error("No server PDF");
  } catch {
    await generateImpactPdf(year);
    return "generated";
  }
}

/* ─────────────────── GLOBAL STYLES ─────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400;1,600&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { font-family: 'DM Sans', sans-serif; background: ${T.cream}; color: ${T.text}; }
  .display { font-family: 'Playfair Display', Georgia, serif; }
  .italic { font-style: italic; }

  .btn-primary {
    display: inline-block; background: ${T.gold}; color: ${T.navy}; padding: 13px 28px;
    border: none; cursor: pointer; font-size: 14px; font-family: 'DM Sans', sans-serif;
    font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
    transition: background 0.2s, transform 0.15s; text-decoration: none;
  }
  .btn-primary:hover { background: ${T.goldLight}; transform: translateY(-1px); }
  .btn-primary:disabled { opacity: 0.6; cursor: wait; transform: none; }
  .btn-navy {
    display: inline-block; background: ${T.navy}; color: #fff; padding: 13px 28px;
    border: none; cursor: pointer; font-size: 14px; font-family: 'DM Sans', sans-serif;
    font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
    transition: background 0.2s, transform 0.15s; text-decoration: none;
  }
  .btn-navy:hover { background: ${T.navyLight}; transform: translateY(-1px); }
  .btn-outline {
    display: inline-block; background: transparent; color: ${T.navy}; padding: 12px 28px;
    border: 1.5px solid ${T.navy}; cursor: pointer; font-size: 14px;
    font-family: 'DM Sans', sans-serif; font-weight: 600; letter-spacing: 0.04em;
    text-transform: uppercase; transition: all 0.2s; text-decoration: none;
  }
  .btn-outline:hover { background: ${T.navy}; color: #fff; }
  .btn-outline-white {
    display: inline-block; background: transparent; color: #fff; padding: 12px 28px;
    border: 1.5px solid rgba(255,255,255,0.45); cursor: pointer; font-size: 14px;
    font-family: 'DM Sans', sans-serif; font-weight: 600; letter-spacing: 0.04em;
    text-transform: uppercase; transition: all 0.2s; text-decoration: none;
  }
  .btn-outline-white:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.7); }

  .section-eyebrow {
    display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.18em;
    text-transform: uppercase; color: ${T.gold}; margin-bottom: 14px;
  }
  .section-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(30px, 3.5vw, 52px); font-weight: 700; color: ${T.navy};
    line-height: 1.15;
  }
  .section-title-white {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(30px, 3.5vw, 52px); font-weight: 700; color: #fff;
    line-height: 1.15;
  }
  .divider { width: 48px; height: 3px; background: ${T.gold}; margin: 20px 0 28px; }

  .input-field {
    width: 100%; padding: 13px 16px; border: 1.5px solid rgba(0,0,0,0.12);
    font-size: 15px; font-family: 'DM Sans', sans-serif; background: #fff;
    color: ${T.text}; outline: none; transition: border-color 0.2s;
    border-radius: 0;
  }
  .input-field:focus { border-color: ${T.navy}; }
  .input-field::placeholder { color: ${T.textLight}; }

  .nav-link {
    font-size: 13px; font-weight: 500; letter-spacing: 0.04em; color: rgba(255,255,255,0.75);
    cursor: pointer; transition: color 0.15s; text-decoration: none; padding: 4px 0;
    border-bottom: 1.5px solid transparent; transition: color 0.15s, border-color 0.15s;
  }
  .nav-link:hover, .nav-link.active { color: #fff; border-bottom-color: ${T.gold}; }

  .card-hover { transition: transform 0.25s, box-shadow 0.25s; }
  .card-hover:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(0,0,0,0.1); }

  .tag {
    display: inline-block; padding: 3px 10px; font-size: 11px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .tag-gold { background: ${T.goldPale}; color: ${T.gold}; }
  .tag-navy { background: rgba(10,22,40,0.08); color: ${T.navy}; }
  .tag-green { background: #E8F8EE; color: #1A7A40; }
  .tag-red { background: #FDE8E8; color: ${T.red}; }

  /* FM Live pulse */
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.4)} }
  @keyframes slideDown { from{opacity:0;transform:translateY(-12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes ticker { 0%{transform:translateX(100%)} 100%{transform:translateX(-100%)} }
  @keyframes barGrow { from{transform:scaleY(0)} to{transform:scaleY(1)} }

  .on-air-pulse { animation: pulse 2s infinite; }
  .slide-down { animation: slideDown 0.35s cubic-bezier(.4,0,.2,1) forwards; }
  .fade-in-anim { animation: fadeIn 0.4s ease forwards; }

  /* Grid helpers */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
  .three-col { display: grid; grid-template-columns: repeat(3,1fr); gap: 32px; }
  .four-col { display: grid; grid-template-columns: repeat(4,1fr); gap: 24px; }
  @media (max-width: 900px) {
    .two-col { grid-template-columns: 1fr; gap: 32px; }
    .three-col { grid-template-columns: 1fr 1fr; }
    .four-col { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 600px) {
    .three-col, .four-col { grid-template-columns: 1fr; }
  }

  /* Ticker */
  .ticker-wrap { overflow: hidden; white-space: nowrap; }
  .ticker-text { display: inline-block; animation: ticker 40s linear infinite; }

  /* FM audio bars */
  .audio-bar {
    display: inline-block; width: 3px; background: ${T.green};
    transform-origin: bottom; border-radius: 2px;
    animation: barGrow 0.8s ease-in-out infinite alternate;
  }

  /* Image placeholders */
  .img-placeholder {
    background: linear-gradient(135deg, ${T.navyMid} 0%, ${T.navy} 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 3rem;
  }

  /* Mobile nav */
  .mobile-menu {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: ${T.navy}; z-index: 200; padding: 80px 32px 32px;
    display: flex; flex-direction: column; gap: 8px;
    animation: slideDown 0.3s ease;
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: ${T.offWhite}; }
  ::-webkit-scrollbar-thumb { background: ${T.navyLight}; border-radius: 3px; }

  /* ───────── RESPONSIVE LAYOUT ───────── */
  img, iframe, video { max-width: 100%; }

  /* Navbar */
  .nav-wrap { padding: 0 4%; }
  .nav-brand { display: flex; align-items: center; gap: 50px; cursor: pointer; }
  .nav-brand img { margin-right: 30px; }
  .nav-links-desktop { display: flex; gap: 28px; align-items: center; }
  .nav-burger {
    display: none; background: transparent; border: 1px solid rgba(255,255,255,0.25);
    color: #fff; font-size: 18px; padding: 6px 12px; cursor: pointer; line-height: 1;
    font-family: 'DM Sans', sans-serif;
  }
  @media (max-width: 1150px) {
    .nav-links-desktop { display: none; }
    .nav-burger { display: flex; align-items: center; }
    .nav-brand { gap: 12px; }
    .nav-brand img { margin-right: 0; height: 32px !important; }
    .nav-login { display: none; }
  }
  @media (max-width: 480px) {
    .nav-brand-title { font-size: 18px !important; }
  }
  .mobile-menu { overflow-y: auto; }

  /* Hero */
  .hero-content {
    padding-top: 180px; padding-bottom: 120px;
    display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 80px; align-items: center;
  }
  @media (max-width: 1000px) {
    .hero-content { grid-template-columns: 1fr; gap: 48px; padding-top: 150px; padding-bottom: 80px; }
  }
  @media (max-width: 700px) {
    .hero-content { padding-top: 140px; padding-bottom: 64px; }
    .scroll-indicator { display: none; }
  }

  /* News featured card */
  .news-featured-grid { display: grid; grid-template-columns: 1fr 1fr; }
  @media (max-width: 900px) { .news-featured-grid { grid-template-columns: 1fr; } }

  /* CTA strips with content + button */
  .cta-grid { display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: center; }
  @media (max-width: 800px) { .cta-grid { grid-template-columns: 1fr; } }

  /* Footer */
  .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 48px; }
  @media (max-width: 1000px) { .footer-grid { grid-template-columns: 1fr 1fr; gap: 36px; } }
  @media (max-width: 580px) { .footer-grid { grid-template-columns: 1fr; } }
  .footer-bottom { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; }
  @media (max-width: 700px) { .footer-bottom { grid-template-columns: 1fr; gap: 12px; } }

  /* Tighter section rhythm + smaller type on phones */
  @media (max-width: 700px) {
    section { padding-top: 72px !important; padding-bottom: 64px !important; }
    footer { padding-top: 56px !important; }
    .section-title, .section-title-white { font-size: clamp(26px, 8vw, 34px); }
    .card-pad { padding: 24px 18px !important; }
    h1.display { font-size: clamp(30px, 9.5vw, 44px) !important; }
    .hero-stats { display: grid !important; grid-template-columns: 1fr 1fr; gap: 20px !important; }
  }
  @media (max-width: 480px) {
    .two-col { gap: 24px; }
    .nav-events { display: none; }
    .nav-brand img { height: 28px !important; }
  }
  @media (max-width: 380px) {
    .nav-brand-sub { display: none; }
  }

  /* ───────── FLUID TYPOGRAPHY ─────────
     Text steps down with screen width. Inline styles set px values, so these
     breakpoint rules use !important to win on smaller screens. */
  @media (max-width: 1000px) {
    p { font-size: 15px !important; }
    blockquote { font-size: 18px !important; }
  }
  @media (max-width: 700px) {
    p { font-size: 14px !important; }
    blockquote { font-size: 16px !important; }
    h3 { font-size: 17px !important; }
    h4 { font-size: 14px !important; }
    .section-eyebrow { font-size: 10px; letter-spacing: 0.14em; }
    .btn-primary, .btn-navy, .btn-outline, .btn-outline-white {
      font-size: 12px !important; padding: 11px 20px;
    }
    /* 16px stops iOS Safari from auto-zooming when an input is focused */
    .input-field { font-size: 16px !important; }
    .tag { font-size: 10px; }
  }
  @media (max-width: 480px) {
    p { font-size: 13.5px !important; }
    blockquote { font-size: 15px !important; }
    .nav-link { font-size: 11px; }
  }

  /* Never allow sideways scroll on phones */
  html, body { overflow-x: hidden; max-width: 100vw; }

  /* Compact FM bar: wrap instead of overflowing */
  .fm-compact { flex-wrap: wrap; }
  .fm-compact .fm-show-name {
    flex: 1; min-width: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
`;
/* ─────────────────── FM Live Widget ──────────────────── */
function FMLiveWidget({ compact = false }) {
  const { onAir, elapsed, listeners, toggle } = useRadio();

  // Re-check the schedule every 30s so the show name flips over on time
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const { current, next } = getNowPlaying(now);
  const showName = current ? current.show : next ? `Up Next: ${next.show} (${next.time})` : "Music & Replays";
  const showSub = current ? `Live on Swahilipot FM` : next ? "Station resumes shortly" : "Swahilipot FM";

  const fmt = (s) =>
    `${Math.floor(s / 3600)
      .toString()
      .padStart(2, "0")}:${Math.floor((s % 3600) / 60)
        .toString()
        .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  if (compact)
    return (
      <div
        className="fm-compact"
        style={{
          background: onAir ? T.navy : "#1a0a0a",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 20 }}>
          {[1, 0.6, 1, 0.4, 0.8, 0.5, 0.9, 0.3].map((h, i) => (
            <div
              key={i}
              className="audio-bar"
              style={{
                height: onAir ? `${h * 20}px` : "4px",
                animationDuration: `${0.5 + i * 0.15}s`,
                background: onAir ? T.green : "#555",
              }}
            />
          ))}
        </div>

        <span
          style={{
            color: onAir ? T.green : "#888",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.15em",
          }}
        >
          {onAir ? "ON AIR · SWAHILIPOT FM" : "OFF AIR"}
        </span>

        <span className="fm-show-name" style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
          {showName}
        </span>

        <button
          onClick={toggle}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
        >
          {onAir ? "⏸ Stop" : "▶ Play"}
        </button>
      </div>
    );

  return (
    <div
      style={{
        background: onAir ? T.navy : "#1a0a0a",
        borderRadius: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: onAir ? T.green : T.red,
          padding: "6px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          className={onAir ? "on-air-pulse" : ""}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#fff",
          }}
        />

        <span
          style={{
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.2em",
          }}
        >
          {onAir ? "ON AIR — SWAHILIPOT FM" : "OFF AIR"}
        </span>

        <span
          style={{
            marginLeft: "auto",
            color: "rgba(255,255,255,0.7)",
            fontSize: 11,
          }}
        >
          {fmt(elapsed)}
        </span>
      </div>

      <div className="card-pad" style={{ padding: "24px 28px" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 20, height: 40 }}>
          {[0.5, 0.8, 1, 0.6, 0.9, 0.4, 0.7, 1, 0.5, 0.6, 0.8, 0.3].map((h, i) => (
            <div
              key={i}
              className="audio-bar"
              style={{
                height: onAir ? `${h * 40}px` : "4px",
                animationDuration: `${0.4 + i * 0.1}s`,
                background: onAir ? T.green : "#333",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
              Now Playing
            </div>

            <div style={{ color: "#fff", fontSize: "clamp(16px, 4vw, 20px)", fontFamily: "'Playfair Display',serif" }}>
              {showName}
            </div>

            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
              {showSub}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
              Listeners
            </div>

            <div style={{ color: T.gold, fontSize: "clamp(19px, 5vw, 24px)", fontWeight: 700 }}>
              {listeners.toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button
            className="btn-outline-white"
            style={{ padding: "8px 16px", fontSize: 12 }}
            onClick={toggle}
          >
            {onAir ? "⏸ Stop Live" : "▶ Listen Live"}
          </button>
        </div>
      </div>
    </div>
  );
}
/* ─────────────────── HERO ─────────────────── */
function HeroSection({ onNav }) {
  const [tick, setTick] = useState(0);
  const { onAir } = useRadio();
  const TICKERS = ["Swahilipot FM — Streaming Live Daily", "Community Open Days — Monday to Saturday, Free Entry", "36,000+ Youth Reached Across the Coast Region", "New Programs in Tech, Arts & Entrepreneurship — Apply Now", "Community Innovation Day — 14 June 2026"];
  useEffect(() => { const t = setInterval(() => setTick(x => (x + 1) % TICKERS.length), 5000); return () => clearInterval(t); }, []);

  return (
    <section id="home" style={{ position: "relative", minHeight: "100vh", background: T.navy, overflow: "hidden" }}>
      {/* Background texture */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(ellipse at 60% 40%, rgba(201,151,58,0.07) 0%, transparent 65%), radial-gradient(ellipse at 10% 80%, rgba(29,185,84,0.04) 0%, transparent 50%)`, pointerEvents: "none" }} />
      {/* Grid overlay */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`, backgroundSize: "60px 60px", pointerEvents: "none" }} />

      {/* Ticker */}
      <div style={{ position: "absolute", top: 72, left: 0, right: 0, background: "rgba(201,151,58,0.15)", borderTop: `1px solid rgba(201,151,58,0.2)`, borderBottom: `1px solid rgba(201,151,58,0.2)`, padding: "8px 0", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ flexShrink: 0, background: T.gold, padding: "2px 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: T.navy, textTransform: "uppercase", zIndex: 1 }}>LATEST</div>
          <div className="ticker-wrap" style={{ flex: 1 }}>
            <div className="ticker-text" style={{ color: T.gold, fontSize: 12, fontWeight: 500, letterSpacing: "0.05em" }}>
              {TICKERS.join("   ·   ")}   ·   {TICKERS.join("   ·   ")}
            </div>
          </div>
        </div>
      </div>

      {/* Main hero content */}
      <div className="hero-content" style={{ maxWidth: 1320, margin: "0 auto", paddingLeft: "5%", paddingRight: "5%" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.05)", border: `1px solid rgba(201,151,58,0.25)`, padding: "6px 16px 6px 8px", marginBottom: 32 }}>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 14 }}>
              {[0.5, 1, 0.7, 0.9, 0.4].map((h, i) => (
                <div key={i} className="audio-bar" style={{ height: onAir ? `${h * 14}px` : "3px", animationDuration: `${0.5 + i * 0.15}s`, background: onAir ? T.green : "#666" }} />
              ))}
            </div>
            <span style={{ color: onAir ? T.gold : "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em" }}>SWAHILIPOT FM · {onAir ? "ON AIR" : "OFF AIR"}</span>
          </div>

          <h1 className="display" style={{ fontSize: "clamp(40px,5.5vw,80px)", fontWeight: 900, color: "#fff", lineHeight: 1.05, marginBottom: 20 }}>
            Where Kenya's<br />
            <span style={{ color: T.gold, fontStyle: "italic" }}>Digital Innovators</span><br />
            Are Built.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "clamp(15px, 2.4vw, 18px)", lineHeight: 1.75, maxWidth: 520, marginBottom: 40, fontWeight: 300 }}>
            Swahilipot Hub Foundation is a vibrant innovation and creative technology hub in Mombasa that empowers young people through digital skills training, entrepreneurship, innovation, arts, and community-driven programs, while providing a collaborative space where ideas are nurtured into impactful solutions that drive personal growth and positive community transformation.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={() => onNav("programs")} style={{ fontSize: 14, padding: "15px 32px" }}>Explore Programs</button>
            <button className="btn-outline-white" onClick={() => onNav("studios")} style={{ fontSize: 14, padding: "15px 32px" }}>Visit Our Spaces</button>
          </div>
          <div className="hero-stats" style={{ display: "flex", gap: 40, marginTop: 52, paddingTop: 40, borderTop: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
            {STATS.map(s => (
              <div key={s.label}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span className="display" style={{ fontSize: "clamp(24px, 6vw, 32px)", fontWeight: 700, color: "#fff" }}>{s.value}</span>
                  {s.unit && <span style={{ color: T.gold, fontSize: 20, fontWeight: 700 }}>{s.unit}</span>}
                </div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, letterSpacing: "0.05em", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div>
          <FMLiveWidget />
          <div style={{ marginTop: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", padding: "20px 24px" }}>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>Today's Schedule</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(WEEKLY_SCHEDULE[new Date().getDay()] || []).slice(0, 5).map((s, i, arr) => {
                const isCurrent = isShowOnNow(s, new Date().getDay());
                return (
                  <div key={`${s.time}-${s.show}`} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, minWidth: 38, fontVariantNumeric: "tabular-nums" }}>{s.time}</span>
                    {isCurrent && <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, flexShrink: 0 }} />}
                    <span style={{ color: isCurrent ? "#fff" : "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: isCurrent ? 600 : 400, flex: 1 }}>{s.show}</span>
                  </div>
                );
              })}
            </div>
            <button className="btn-outline-white" onClick={() => onNav("fm-live")} style={{ width: "100%", textAlign: "center", marginTop: 16, fontSize: 12, padding: "10px" }}>Full Schedule →</button>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="scroll-indicator" style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>Scroll</span>
        <div style={{ width: 1, height: 40, background: "linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)" }} />
      </div>
    </section>
  );
}

/* ─────────────────── ABOUT ─────────────────── */
function AboutSection() {
  return (
    <section id="about" style={{ padding: "120px 5%", background: T.cream }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div className="two-col" style={{ alignItems: "center" }}>
          <FadeIn>
            <div>
              <span className="section-eyebrow">About the Hub</span>
              <h2 className="section-title">East Africa's Leading<br /><span className="italic" style={{ color: T.gold }}>Innovation & Creative</span><br />Technology Hub</h2>
              <div className="divider" />
              <p style={{ color: T.textMuted, fontSize: 16, lineHeight: 1.85, marginBottom: 20 }}>
                Swahilipot Hub Foundation is a youth-focused innovation and creative technology hub based in Mombasa that empowers young people through digital skills training, technology, entrepreneurship, arts, and community-driven programs, creating a space where ideas are transformed into impactful real-world solutions.
              </p>
              <p style={{ color: T.textMuted, fontSize: 16, lineHeight: 1.85, marginBottom: 36 }}>
                We provide access to mentorship, collaborative workspaces, and capacity-building programs in software development, design, media, and innovation. Our community of innovators, creators, and entrepreneurs works on real projects that solve local challenges while connecting to global opportunities.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {[
                  ["🚀", "Innovation Hub", "Youth-led technology and creative innovation space"],
                  ["💻", "Digital Skills Training", "Software development, design, and emerging technologies"],
                  ["🎨", "Creative Economy", "Media, arts, and content creation empowerment"],
                  ["🤝", "Community Impact", "Programs focused on solving real local challenges"],
                ].map(([icon, title, sub]) => (
                  <div key={title} style={{ background: "#fff", padding: "20px 22px", border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.navy, marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 12, color: T.textLight }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.15}>
            <div>
              <div className="img-placeholder" style={{ width: "100%", aspectRatio: "4/3", marginBottom: 16, background: `linear-gradient(135deg, ${T.navyMid} 0%, ${T.navy} 100%)`, position: "relative", overflow: "hidden" }}>
                <span style={{ fontSize: 72 }}>🚀</span>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.7))", padding: "32px 28px" }}>
                  <div style={{ color: "#0935c7", fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 600 }}>Swahilipot Innovation Hub</div>
                  <div style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 13, marginTop: 4 }}>Empowering Youth Through Technology, Creativity & Innovation</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[["🚀", "100+ Programs", "Hackathons, training & incubations"], ["👩‍💻", "Community Members", "Developers, designers & creators"], ["📍", "Mombasa", "Swahilipot Hub, Coast Region"], ["🌍", "Impact Driven", "Youth empowerment across East Africa"]].map(([icon, v, l]) => (
                  <div key={v} style={{ background: T.offWhite, padding: "16px 18px", display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 20 }}>{icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: T.navy }}>{v}</div>
                      <div style={{ fontSize: 12, color: T.textLight }}>{l}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>

        {/* Team */}
        <FadeIn delay={0.1} style={{ marginTop: 80 }}>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 64 }}>
            <span className="section-eyebrow">Leadership & Team</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24, marginTop: 36 }}>
              {TEAM.map(m => (
                <div key={m.name} className="card-hover" style={{ background: "#fff", border: `1px solid ${T.border}`, padding: "24px 20px", textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: T.navy, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22, color: "#fff", fontFamily: "'Playfair Display',serif", fontWeight: 700 }}>
                    {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: T.navy, marginBottom: 4 }}>{m.name}</div>
                  <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 4 }}>{m.role}</div>
                  <span className="tag tag-navy" style={{ fontSize: 10 }}>{m.dept}</span>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─────────────────── PROGRAMMES ─────────────────── */
function ProgrammesSection() {
  const [active, setActive] = useState(null);
  return (
    <section id="programmes" style={{ padding: "120px 5%", background: "#fff" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ marginBottom: 56 }}>
            <span className="section-eyebrow">Academic Programmes</span>
            <h2 className="section-title">Diplomas Built for<br /><span className="italic" style={{ color: T.gold }}>Real Industry</span></h2>
            <div className="divider" />
            <p style={{ color: T.textMuted, fontSize: 16, maxWidth: 520, lineHeight: 1.75 }}>
              Every programme is co-designed with media industry employers. Students work in live production environments from week one.
            </p>
          </div>
        </FadeIn>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px,1fr))", gap: 24 }}>
          {PROGRAMMES.map((p, i) => (
            <FadeIn key={p.code} delay={i * 0.06}>
              <div
                className="card-hover"
                style={{ background: "#fff", border: `1px solid ${T.border}`, cursor: "pointer", transition: "all 0.25s", overflow: "hidden", borderTop: active === p.code ? `3px solid ${T.gold}` : `3px solid transparent` }}
                onClick={() => setActive(active === p.code ? null : p.code)}
              >
                <div style={{ padding: "28px 28px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div style={{ background: p.color, width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{p.icon}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="tag tag-navy" style={{ fontSize: 10 }}>{p.code}</span>
                      {p.badge && <span className="tag tag-gold" style={{ fontSize: 10 }}>{p.badge}</span>}
                    </div>
                  </div>
                  <h3 className="display" style={{ fontSize: 18, fontWeight: 700, color: T.navy, lineHeight: 1.3, marginBottom: 10 }}>{p.title}</h3>
                  <p style={{ color: T.textMuted, fontSize: 14, lineHeight: 1.75, marginBottom: 20 }}>{p.desc}</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${T.border}` }}>
                  {[["⏱", p.duration, "Duration"], ["📅", p.intake, "Intake"], ["💰", p.fee, "Tuition"]].slice(0, 2).map(([icon, val, label]) => (
                    <div key={label} style={{ padding: "16px 20px", borderRight: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 10, color: T.textLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.navy }}>{val}</div>
                    </div>
                  ))}
                </div>
                {active === p.code && (
                  <div className="slide-down" style={{ borderTop: `1px solid ${T.border}`, padding: "20px 28px", background: T.offWhite }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.textLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Core Modules</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                      {p.modules.map(m => (
                        <span key={m} style={{ background: "#fff", border: `1px solid ${T.border}`, padding: "5px 12px", fontSize: 12, color: T.navy }}>{m}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                      <span style={{ fontSize: 13, color: T.textMuted }}>💰 {p.fee}</span>
                    </div>
                    <button className="btn-navy" style={{ marginTop: 16, padding: "10px 20px", fontSize: 12, width: "100%", textAlign: "center" }}>
                      Request Prospectus →
                    </button>
                  </div>
                )}
                <div style={{ padding: "12px 20px", background: active === p.code ? T.gold : "transparent", textAlign: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: active === p.code ? T.navy : T.gold, letterSpacing: "0.06em" }}>
                    {active === p.code ? "▲ Close" : "▼ View Modules"}
                  </span>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Call to action */}
        <FadeIn delay={0.1}>
          <div className="cta-grid card-pad" style={{ marginTop: 64, background: T.navy, padding: "52px 48px" }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Not sure which programme?</div>
              <div className="display" style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>Speak with our Academic Advisors</div>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 8 }}>Book a free 30-minute session. We'll help you choose the right pathway for your career goals.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button className="btn-primary" style={{ whiteSpace: "nowrap" }}>Book a Consultation</button>
              <button className="btn-outline-white" style={{ whiteSpace: "nowrap", fontSize: 12 }}>Download Prospectus</button>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─────────────────── STUDIOS / FACILITIES ─────────────────── */
function StudiosSection({ onNav }) {
  const [active, setActive] = useState(0);
  return (
    <section id="studios" style={{ padding: "120px 5%", background: T.offWhite }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ marginBottom: 56 }}>
            <span className="section-eyebrow">Innovation Spaces</span>
            <h2 className="section-title">Creative Spaces &<br /><span className="italic" style={{ color: T.gold }}>Innovation Labs</span></h2>
            <div className="divider" />
          </div>
        </FadeIn>
        <div className="two-col" style={{ alignItems: "start" }}>
          <div>
            {FACILITIES.map((f, i) => (
              <FadeIn key={f.name} delay={i * 0.05}>
                <div
                  onClick={() => setActive(i)}
                  style={{ background: active === i ? T.navy : "#fff", border: `1px solid ${active === i ? "transparent" : T.border}`, padding: "20px 24px", marginBottom: 8, cursor: "pointer", transition: "all 0.2s", display: "flex", gap: 20, alignItems: "center" }}
                >
                  <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, background: active === i ? "rgba(255,255,255,0.08)" : T.offWhite }}>{f.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: active === i ? "#fff" : T.navy, marginBottom: 4 }}>{f.name}</div>
                    <div style={{ fontSize: 12, color: active === i ? "rgba(255,255,255,0.5)" : T.textLight }}>{f.area}</div>
                  </div>
                  {active === i && <span style={{ color: T.gold, fontSize: 18 }}>→</span>}
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={0.1}>
            <div style={{ position: "sticky", top: 100 }}>
              <div className="img-placeholder" style={{ width: "100%", aspectRatio: "16/10", background: `linear-gradient(135deg, ${T.navyMid}, ${T.navy})`, position: "relative" }}>
                <span style={{ fontSize: 80 }}>{FACILITIES[active].icon}</span>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)" }} />
                <div style={{ position: "absolute", bottom: 24, left: 28, right: 28 }}>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>{FACILITIES[active].area}</div>
                  <div className="display" style={{ color: "#fff", fontSize: "clamp(18px, 4.5vw, 24px)", fontWeight: 700 }}>{FACILITIES[active].name}</div>
                </div>
              </div>
              <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderTop: "none", padding: "28px 32px" }}>
                <p style={{ color: T.textMuted, fontSize: 15, lineHeight: 1.8, marginBottom: 24 }}>{FACILITIES[active].desc}</p>
                <div style={{ display: "flex", gap: 12 }}>
                  <button className="btn-navy" style={{ fontSize: 12, padding: "10px 20px" }} onClick={() => onNav("programs")}>Explore Programs</button>
                  <button className="btn-outline" style={{ fontSize: 12, padding: "10px 20px" }} onClick={() => window.open("https://www.swahilipothub.co.ke/events", "_blank")}>View Activities</button>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>

        {/* Open day CTA */}
        <FadeIn delay={0.1}>
          <div className="card-pad" style={{ marginTop: 64, background: T.gold, padding: "40px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", color: T.navy, textTransform: "uppercase", marginBottom: 6 }}>Community Open Days: — Monday - Saturday</div>
              <div className="display" style={{ fontSize: "clamp(19px, 4.5vw, 26px)", fontWeight: 700, color: T.navy }}>Explore Innovation Labs. Meet Creators. Experience Technology in Action.</div>
            </div>
            <button className="btn-navy" style={{ whiteSpace: "nowrap", padding: "15px 32px" }} onClick={() => onNav("programs")}>Register Free →</button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─────────────────── NEWS ─────────────────── */
function NewsSection() {
  const [filter, setFilter] = useState("All");
  const cats = ["All", ...Array.from(new Set(NEWS_ITEMS.map(n => n.cat)))];
  const filtered = filter === "All" ? NEWS_ITEMS : NEWS_ITEMS.filter(n => n.cat === filter);
  const featured = filtered.find(n => n.featured) || filtered[0];
  const rest = filtered.filter(n => n.id !== (featured?.id));

  return (
    <section id="news" style={{ padding: "120px 5%", background: "#fff" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 40, flexWrap: "wrap", gap: 16 }}>
            <div>
              <span className="section-eyebrow">Latest Updates</span>
              <h2 className="section-title" style={{ marginBottom: 0 }}>From the Hub<br /><span className="italic" style={{ color: T.gold }}> &amp; Community</span></h2>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {cats.map(c => (
                <button key={c} onClick={() => setFilter(c)} style={{ background: filter === c ? T.navy : "transparent", color: filter === c ? "#fff" : T.navy, border: `1.5px solid ${filter === c ? T.navy : T.border}`, padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s" }}>{c}</button>
              ))}
            </div>
          </div>
        </FadeIn>

        {featured && (
          <FadeIn>
            <div className="news-featured-grid" style={{ gap: 0, background: T.navy, marginBottom: 24, overflow: "hidden" }}>
              <div className="img-placeholder" style={{ aspectRatio: "4/3", background: `linear-gradient(135deg, ${T.navyMid}, ${T.navy})`, borderRight: `1px solid rgba(255,255,255,0.05)` }}>
                <span style={{ fontSize: 64 }}>📰</span>
              </div>
              <div className="card-pad" style={{ padding: "40px 44px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
                  <span className="tag" style={{ background: "rgba(201,151,58,0.15)", color: T.gold }}>{featured.cat}</span>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{featured.date}</span>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>· {featured.readTime} read</span>
                </div>
                <h3 className="display" style={{ fontSize: "clamp(18px,2vw,26px)", fontWeight: 700, color: "#fff", lineHeight: 1.35, marginBottom: 16 }}>{featured.title}</h3>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, lineHeight: 1.8 }}>{featured.excerpt}</p>
              </div>
            </div>
          </FadeIn>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {rest.map((n, i) => (
            <FadeIn key={n.id} delay={i * 0.07}>
              <div className="card-hover" style={{ background: "#fff", border: `1px solid ${T.border}`, overflow: "hidden", cursor: "pointer" }}>
                <div className="img-placeholder" style={{ height: 160, background: T.offWhite, fontSize: 36 }}>
                  {n.cat === "FM Station" ? "📡" : n.cat === "Admissions" ? "📋" : n.cat === "Industry" ? "🤝" : n.cat === "Events" ? "📅" : "📊"}
                </div>
                <div style={{ padding: "20px 22px" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <span className="tag tag-navy" style={{ fontSize: 10 }}>{n.cat}</span>
                    <span style={{ color: T.textLight, fontSize: 11 }}>{n.date}</span>
                  </div>
                  <h4 style={{ fontWeight: 600, fontSize: 15, color: T.navy, lineHeight: 1.4, marginBottom: 8 }}>{n.title}</h4>
                  <p style={{ color: T.textMuted, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>{n.excerpt.slice(0, 110)}…</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                    <span style={{ color: T.textLight, fontSize: 11 }}>{n.readTime} read</span>
                    <span style={{ color: T.gold, fontSize: 12, fontWeight: 600 }}>Read More →</span>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── FM LIVE PAGE ─────────────────── */
function FMLiveSection() {
  const [day, setDay] = useState(new Date().getDay());
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const TYPE_COLORS = { live: "#E8F8EE", music: "#EEF2FF", news: "#FFF8E1" };
  const TYPE_TEXT = { live: "#1A7A40", music: "#3B3B9A", news: "#8B6A00" };

  return (
    <section id="fm-live" style={{ padding: "120px 5%", background: T.navy }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48, flexWrap: "wrap", gap: 16 }}>
            <div>
              <span className="section-eyebrow">Swahilipot FM</span>
              <h2 className="section-title-white">Live Broadcasting<br /><span className="italic" style={{ color: T.gold }}>& Programme Schedule</span></h2>
            </div>
            <FMLiveWidget compact />
          </div>
        </FadeIn>

        <div className="two-col" style={{ alignItems: "start" }}>
          <FadeIn>
            <div>
              <FMLiveWidget />
              <div style={{ marginTop: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", padding: "24px" }}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>About Our FM Station</div>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 1.8, marginBottom: 16 }}>
                  Swahilipot FM is a youth-run community radio station based at the Swahilipot Hub in Old Town, Mombasa. Run by young presenters, producers and journalists from our programs, it amplifies youth voices, community stories and coastal culture — broadcasting daily on air and streaming online.
                </p>
                {[["Station", "Swahilipot FM"], ["Base", "Swahilipot Hub, Old Town, Mombasa"], ["Coverage", "Mombasa & the Coast region + online stream"], ["Run by", "Youth presenters, producers & journalists"], ["Listen", "On air & streaming via swahilipothub.co.ke"], ["Format", "Youth Talk, Music, Community News, Culture"]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{k}</span>
                    <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                {DAYS.map((d, i) => (
                  <button key={d} onClick={() => setDay(i)} style={{ background: day === i ? T.gold : "rgba(255,255,255,0.06)", color: day === i ? T.navy : "rgba(255,255,255,0.5)", border: day === i ? "none" : "1px solid rgba(255,255,255,0.08)", padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.04em", transition: "all 0.15s" }}>
                    {d.slice(0, 3).toUpperCase()}
                  </button>
                ))}
              </div>
              <div style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                {(WEEKLY_SCHEDULE[day] || []).map((s, i, arr) => {
                  const isNow = isShowOnNow(s, day);
                  return (
                    <div key={`${s.time}-${s.show}`} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 16, padding: "16px 20px", background: isNow ? "rgba(201,151,58,0.1)" : "transparent", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center" }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{s.time}</span>
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                          {isNow && <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />}
                          <span style={{ color: isNow ? "#fff" : "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: isNow ? 600 : 400 }}>{s.show}</span>
                        </div>
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Swahilipot FM</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", background: isNow ? "rgba(29,185,84,0.15)" : s.type === "news" ? "rgba(255,200,50,0.1)" : "rgba(255,255,255,0.06)", color: isNow ? T.green : s.type === "news" ? "#FFCC00" : "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {isNow ? "LIVE" : s.type}
                      </span>
                    </div>
                  );
                })}
                {(WEEKLY_SCHEDULE[day] || []).length === 0 && (
                  <div style={{ padding: "24px 20px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No scheduled shows — enjoy our music mix all day.</div>
                )}
              </div>
            </div>
          </FadeIn>
        </div>

        {/* Programs / careers CTA — nav "Programs" scrolls here */}
        <FadeIn delay={0.1}>
          <div id="programs" className="card-pad" style={{ marginTop: 60, scrollMarginTop: 90, background: "rgba(201,151,58,0.08)", border: "1px solid rgba(201,151,58,0.2)", padding: "40px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24 }}>
            <div>
              <div style={{ color: T.gold, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>Programs & Opportunities</div>
              <div className="display" style={{ color: "#fff", fontSize: "clamp(18px, 4.5vw, 22px)", fontWeight: 700 }}>Join the Swahilipot Team</div>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 8 }}>  Explore career, internship, and volunteer opportunities at Swahilipot Hub.</p>

            </div>
            <button
              className="btn-primary"
              style={{ whiteSpace: "nowrap" }}
              onClick={() =>
                window.open(
                  "https://www.swahilipothub.co.ke/careers",
                  "_blank"
                )
              }
            >
              Explore Careers
            </button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─────────────────── ADMISSIONS ─────────────────── */
function AdmissionsSection() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", phone: "", programme: "", intake: "", kcse: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const STEPS = [
    { n: 1, title: "Choose Your Programme", icon: "📚" },
    { n: 2, title: "Check Requirements", icon: "✅" },
    { n: 3, title: "Submit Application", icon: "📝" },
    { n: 4, title: "Interview & Offer", icon: "🎓" },
    { n: 5, title: "Enrolment", icon: "🏆" },
  ];

  return (
    <section id="admissions" style={{ padding: "120px 5%", background: T.offWhite }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ marginBottom: 60 }}>
            <span className="section-eyebrow">Admissions 2026</span>
            <h2 className="section-title">Join Us.<br /><span className="italic" style={{ color: T.gold }}>Become a Broadcaster.</span></h2>
            <div className="divider" />
          </div>
        </FadeIn>

        {/* Process steps */}
        <FadeIn>
          <div style={{ display: "flex", gap: 0, marginBottom: 64, overflowX: "auto", paddingBottom: 8 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} onClick={() => setStep(s.n)} style={{ flex: 1, minWidth: 160, cursor: "pointer" }}>
                <div style={{ height: 4, background: s.n <= step ? T.gold : T.border, transition: "background 0.3s" }} />
                <div style={{ padding: "16px 20px", background: s.n === step ? "#fff" : "transparent", border: s.n === step ? `1px solid ${T.border}` : "1px solid transparent", transition: "all 0.2s" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: s.n <= step ? T.navy : T.textLight, marginBottom: 4 }}>Step {s.n}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: s.n <= step ? T.navy : T.textLight, lineHeight: 1.3 }}>{s.title}</div>
                </div>
              </div>
            ))}
          </div>
        </FadeIn>

        <div className="two-col" style={{ alignItems: "start" }}>
          <FadeIn>
            <div>
              {/* Entry requirements */}
              <div className="card-pad" style={{ background: "#fff", border: `1px solid ${T.border}`, padding: "36px 36px", marginBottom: 24 }}>
                <div className="display" style={{ fontSize: 20, fontWeight: 700, color: T.navy, marginBottom: 20 }}>Entry Requirements</div>
                {[
                  ["Minimum Academic Entry", "KCSE Grade C- (minus) or equivalent qualification", "✅"],
                  ["Age Requirement", "Applicants must be 17 years or older at time of enrolment", "✅"],
                  ["Documents Required", "Original KCSE Certificate, National ID/Passport, 2 passport photos, birth certificate", "📋"],
                  ["Application Fee", "KES 1,000 (non-refundable) — waived for early applicants before 31 July", "💳"],
                  ["Scholarships", "Bursaries and partner-funded scholarships available for eligible youth", "🎓"],
                  ["Medical Requirements", "Medical certificate confirming fitness for studio environments", "🏥"],
                ].map(([label, val, icon]) => (
                  <div key={label} style={{ display: "flex", gap: 16, padding: "16px 0", borderBottom: `1px solid ${T.border}`, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: T.navy, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.65 }}>{val}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Fees */}
              <div className="card-pad" style={{ background: T.navy, padding: "28px 36px" }}>
                <div className="display" style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Tuition Fees 2026</div>
                {PROGRAMMES.slice(0, 4).map(p => (
                  <div key={p.code} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{p.title.replace("Diploma in ", "")}</span>
                    <span style={{ color: T.gold, fontSize: 13, fontWeight: 600 }}>{p.fee}</span>
                  </div>
                ))}
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 16, lineHeight: 1.7 }}>
                  Fees inclusive of studio time, equipment access, and industry visits. Payment in two or three instalments available. Bursary support processed directly for eligible participants.
                </p>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className="card-pad" style={{ background: "#fff", border: `1px solid ${T.border}`, padding: "36px 36px" }}>
              {submitted ? (
                <div className="fade-in-anim" style={{ textAlign: "center", padding: "32px 0" }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
                  <div className="display" style={{ fontSize: 24, fontWeight: 700, color: T.navy, marginBottom: 12 }}>Application Received!</div>
                  <p style={{ color: T.textMuted, fontSize: 14, lineHeight: 1.75, marginBottom: 24 }}>
                    Thank you, {form.name}. We've received your application for {form.programme}. Our admissions team will contact you at {form.email} within 3 working days.
                  </p>
                  <div style={{ background: T.offWhite, padding: "20px 24px", textAlign: "left", marginBottom: 24 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: T.navy, marginBottom: 12 }}>Reference: BMI/2026/{Math.floor(Math.random() * 9000 + 1000)}</div>
                    <div style={{ color: T.textMuted, fontSize: 13 }}>Keep this reference for your records. Next step: We will call you for a brief 15-minute admissions interview.</div>
                  </div>
                  <button className="btn-outline" onClick={() => { setSubmitted(false); setForm({ name: "", email: "", phone: "", programme: "", intake: "", kcse: "", message: "" }); }}>Submit Another Application</button>
                </div>
              ) : (
                <>
                  <div className="display" style={{ fontSize: 20, fontWeight: 700, color: T.navy, marginBottom: 6 }}>Apply Online</div>
                  <p style={{ color: T.textMuted, fontSize: 13, marginBottom: 28 }}>Takes under 5 minutes. Applications for September 2026 are open.</p>
                  {[
                    ["Full Name *", "name", "text", "e.g. Amina Hassan"],
                    ["Email Address *", "email", "email", "your@email.com"],
                    ["Phone Number *", "phone", "tel", "+254 700 000 000"],
                  ].map(([label, key, type, ph]) => (
                    <div key={key} style={{ marginBottom: 16 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textLight, marginBottom: 6 }}>{label}</label>
                      <input className="input-field" type={type} placeholder={ph} value={form[key]} onChange={e => upd(key, e.target.value)} />
                    </div>
                  ))}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textLight, marginBottom: 6 }}>Programme of Interest *</label>
                    <select className="input-field" style={{ appearance: "none", cursor: "pointer" }} value={form.programme} onChange={e => upd("programme", e.target.value)}>
                      <option value="">Select a programme…</option>
                      {PROGRAMMES.map(p => <option key={p.code} value={p.title}>{p.title}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textLight, marginBottom: 6 }}>Preferred Intake</label>
                    <select className="input-field" style={{ appearance: "none", cursor: "pointer" }} value={form.intake} onChange={e => upd("intake", e.target.value)}>
                      <option value="">Select intake…</option>
                      <option>September 2026</option>
                      <option>January 2027</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textLight, marginBottom: 6 }}>KCSE Grade or Highest Qualification</label>
                    <input className="input-field" type="text" placeholder="e.g. C+ or Diploma in Communication" value={form.kcse} onChange={e => upd("kcse", e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textLight, marginBottom: 6 }}>Why do you want to study here? (Optional)</label>
                    <textarea className="input-field" rows={3} placeholder="Tell us about your media interests…" style={{ resize: "vertical" }} value={form.message} onChange={e => upd("message", e.target.value)} />
                  </div>
                  <button
                    className="btn-primary"
                    style={{ width: "100%", textAlign: "center", padding: "15px", fontSize: 14 }}
                    onClick={() => { if (form.name && form.email && form.phone && form.programme) setSubmitted(true); }}
                  >
                    Submit Application →
                  </button>
                  <p style={{ color: T.textLight, fontSize: 11, textAlign: "center", marginTop: 12, lineHeight: 1.7 }}>
                    By submitting you agree to our Privacy Policy. We will contact you within 3 working days.
                  </p>
                </>
              )}
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── IMPACTS & SUCCESS STORIES (replaces Alumni) ─────────────────── */
function ImpactsSection() {
  const [active, setActive] = useState(0);
  const [reportYear, setReportYear] = useState(REPORT_YEARS[0]);
  const [dlStatus, setDlStatus] = useState("idle"); // idle | loading | done | error

  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % SUCCESS_STORIES.length), 6000);
    return () => clearInterval(t);
  }, []);

  const handleDownload = async () => {
    setDlStatus("loading");
    try {
      await downloadImpactReport(reportYear);
      setDlStatus("done");
      setTimeout(() => setDlStatus("idle"), 4000);
    } catch (err) {
      console.error("Report download failed:", err);
      setDlStatus("error");
      setTimeout(() => setDlStatus("idle"), 4000);
    }
  };

  return (
    <section id="impacts" style={{ padding: "120px 5%", background: T.navy }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 56, flexWrap: "wrap", gap: 16 }}>
            <div>
              <span className="section-eyebrow">Real Lives Changed</span>
              <h2 className="section-title-white">Impacts &<br /><span className="italic" style={{ color: T.gold }}>Success Stories</span></h2>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 15, lineHeight: 1.8, maxWidth: 480, marginTop: 16 }}>
                Our impact goes beyond numbers. Here are real stories of youths whose lives have been transformed through our programs.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {SUCCESS_STORIES.map((_, i) => (
                <div key={i} onClick={() => setActive(i)} style={{ width: active === i ? 32 : 8, height: 8, background: active === i ? T.gold : "rgba(255,255,255,0.2)", cursor: "pointer", transition: "all 0.3s", borderRadius: 4 }} />
              ))}
            </div>
          </div>
        </FadeIn>

        <div className="two-col" style={{ alignItems: "start" }}>
          {/* LEFT — Success stories */}
          <div>
            <FadeIn>
              <div className="card-pad" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderLeft: `4px solid ${T.gold}`, padding: "44px 48px" }}>
                <div style={{ color: T.gold, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>{SUCCESS_STORIES[active].title}</div>
                <blockquote className="display" style={{ fontSize: "clamp(17px,1.8vw,22px)", fontWeight: 400, fontStyle: "italic", color: "rgba(255,255,255,0.85)", lineHeight: 1.7, marginBottom: 32 }}>
                  "{SUCCESS_STORIES[active].quote}"
                </blockquote>
                <div style={{ display: "flex", gap: 16, alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 24 }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: T.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontFamily: "'Playfair Display',serif", fontWeight: 700, color: T.navy, flexShrink: 0 }}>
                    {SUCCESS_STORIES[active].name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{SUCCESS_STORIES[active].name}</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{SUCCESS_STORIES[active].role}</div>
                    <div style={{ color: T.gold, fontSize: 11, marginTop: 3 }}>{SUCCESS_STORIES[active].programme}</div>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Other stories */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              {SUCCESS_STORIES.filter((_, i) => i !== active).map((s, i) => (
                <FadeIn key={s.name} delay={i * 0.07}>
                  <div onClick={() => setActive(SUCCESS_STORIES.indexOf(s))} className="card-hover" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "18px 22px", cursor: "pointer", display: "flex", gap: 16, alignItems: "center" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontFamily: "'Playfair Display',serif", fontWeight: 700, color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>
                      {s.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{s.role}</div>
                    </div>
                    <span style={{ color: T.gold, fontSize: 11, flexShrink: 0 }}>{s.title} →</span>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>

          {/* RIGHT — Impact numbers + report download */}
          <div>
            <FadeIn delay={0.1}>
              <div className="card-pad" style={{ background: "rgba(201,151,58,0.08)", border: "1px solid rgba(201,151,58,0.25)", padding: "36px 40px" }}>
                <div style={{ color: T.gold, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>By the Numbers</div>
                <div className="display" style={{ color: "#fff", fontSize: "clamp(21px, 5vw, 26px)", fontWeight: 700, marginBottom: 12 }}>Impact Report</div>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1.75, marginBottom: 28 }}>
                  Our annual impact reports showcase the measurable change we're making in communities across East Africa.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
                  {IMPACT_STATS.map(s => (
                    <div key={s.label} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", padding: "20px 18px", textAlign: "center" }}>
                      <div className="display" style={{ color: "#fff", fontSize: "clamp(23px, 6vw, 30px)", fontWeight: 700, marginBottom: 6 }}>{s.value}</div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 1.55 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Download by year */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 24 }}>
                  <label style={{ display: "block", color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
                    Select report year
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                    {REPORT_YEARS.map(y => (
                      <button
                        key={y}
                        onClick={() => setReportYear(y)}
                        style={{
                          background: reportYear === y ? T.gold : "rgba(255,255,255,0.06)",
                          color: reportYear === y ? T.navy : "rgba(255,255,255,0.55)",
                          border: reportYear === y ? "none" : "1px solid rgba(255,255,255,0.1)",
                          padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                          fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.04em", transition: "all 0.15s",
                        }}
                      >
                        {y}
                      </button>
                    ))}
                  </div>

                  {/* Quick preview of selected year */}
                  <div style={{ background: "rgba(10,22,40,0.5)", border: "1px solid rgba(255,255,255,0.06)", padding: "14px 18px", marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Youth reached in {reportYear}</span>
                      <span style={{ color: T.gold, fontSize: 13, fontWeight: 700 }}>{IMPACT_REPORTS[reportYear].youthReached}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Network</span>
                      <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{IMPACT_REPORTS[reportYear].hubs}</span>
                    </div>
                  </div>

                  <button
                    className="btn-primary"
                    style={{ width: "100%", textAlign: "center", padding: "15px", fontSize: 13 }}
                    onClick={handleDownload}
                    disabled={dlStatus === "loading"}
                  >
                    {dlStatus === "loading" ? "Preparing PDF…"
                      : dlStatus === "done" ? "✓ Downloaded!"
                        : dlStatus === "error" ? "Download failed — try again"
                          : `⬇ Download ${reportYear} Impact Report (PDF)`}
                  </button>
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
                    Reports are fetched from our archive when available, or compiled live from our impact data.
                  </p>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>

        {/* Partners strip (kept from original, reframed for the Hub) */}
        <FadeIn delay={0.1}>
          <div style={{ marginTop: 64, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 48 }}>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", textAlign: "center", marginBottom: 28 }}>Our Youth Build Careers & Ventures With</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
              {["Conrad N. Hilton Foundation", "Imaginable Futures", "GOYN Mombasa", "County Government of Mombasa", "ICT Authority", "National Museums of Kenya", "Tony Elumelu Foundation", "DataKind", "Cisco", "Seacom"].map(e => (
                <div key={e} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)", padding: "10px 20px", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{e}</div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─────────────────── CONTACT ─────────────────── */
const SWAHILIPOT_EMAIL = "info@swahilipothub.co.ke";

function ContactSection() {
  const [sent, setSent] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [msg, setMsg] = useState({ name: "", email: "", phone: "", type: "General Enquiry", body: "" });
  const upd = (k, v) => setMsg(m => ({ ...m, [k]: v }));

  const [sending, setSending] = useState(false);
  const [sentVia, setSentVia] = useState("direct"); // "direct" | "mailto"

  /*
   * Sends the message to Swahilipot's main email (SWAHILIPOT_EMAIL).
   *
   * Primary path: FormSubmit (https://formsubmit.co) — a free relay that
   * emails form submissions to the address in the URL. No account or API key.
   * ONE-TIME SETUP: the very FIRST submission triggers an activation email
   * to SWAHILIPOT_EMAIL's inbox; someone must click "Activate" in it once.
   * After that, every submission lands in the inbox automatically.
   *
   * Fallback: if the network call fails (offline, blocked, etc.), we open
   * the visitor's email app pre-addressed instead, so no message is lost.
   *
   * TIP FOR TESTING: temporarily change SWAHILIPOT_EMAIL above to your own
   * address, submit the form, click the activation link FormSubmit sends
   * you, then submit again — the message will arrive in your inbox.
   */
  const handleSend = async () => {
    if (!msg.name || !msg.email || !msg.body) return;
    setSending(true);
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${SWAHILIPOT_EMAIL}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: msg.name,
          email: msg.email,
          phone: msg.phone || "—",
          enquiry_type: msg.type,
          message: msg.body,
          _subject: `[Website] ${msg.type} — ${msg.name}`,
          _template: "table",
          _captcha: "false",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === "false" || data.success === false) throw new Error("relay failed");
      setSentVia("direct");
      setSent(true);
    } catch (err) {
      console.warn("FormSubmit failed, falling back to mailto:", err);
      const subject = encodeURIComponent(`[Website] ${msg.type} — ${msg.name}`);
      const body = encodeURIComponent(
        `Name: ${msg.name}\nEmail: ${msg.email}\nPhone: ${msg.phone || "—"}\nEnquiry type: ${msg.type}\n\n${msg.body}`
      );
      window.location.href = `mailto:${SWAHILIPOT_EMAIL}?subject=${subject}&body=${body}`;
      setSentVia("mailto");
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="contact" style={{ padding: "120px 5%", background: "#fff" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ marginBottom: 60 }}>
            <span className="section-eyebrow">Get in Touch</span>
            <h2 className="section-title">We're Here.<br /><span className="italic" style={{ color: T.gold }}>Let's Talk.</span></h2>
            <div className="divider" />
          </div>
        </FadeIn>
        <div className="two-col" style={{ alignItems: "start" }}>
          <FadeIn>
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 40 }}>
                {[
                  { icon: "📍", label: "Address", val: "Swahili Cultural Centre, Sir Mbarak Hinaway Rd", sub: "Old Town, Mombasa, Kenya" },
                  { icon: "📞", label: "Phone", val: "+254 11 4635505", sub: "Mon–Sat, working hours" },
                  { icon: "✉", label: "Email", val: "info@swahilipothub.co.ke", sub: "We respond as soon as we can" },
                  { icon: "📻", label: "Radio", val: "Swahilipot FM", sub: "Youth-run community radio · live & streaming" },
                  { icon: "🌐", label: "Website", val: "www.swahilipothub.co.ke", sub: "Programs, events & opportunities" },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", gap: 20, alignItems: "flex-start", padding: "20px 24px", background: T.offWhite }}>
                    <div style={{ width: 44, height: 44, background: T.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{item.icon}</div>
                    <div>
                      <div style={{ fontSize: 10, color: T.textLight, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 15, color: T.navy, fontWeight: 600, marginBottom: 2 }}>{item.val}</div>
                      <div style={{ fontSize: 12, color: T.textLight }}>{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Map — opens embedded inside this box, no new tab or popup */}
              <div style={{ background: T.navy, height: 300, position: "relative", overflow: "hidden" }}>
                {showMap ? (
                  <>
                    <iframe
                      title="Swahilipot Hub Foundation location"
                      src="https://maps.google.com/maps?q=Swahilipot+Hub+Foundation,+Mombasa,+Kenya&z=17&output=embed"
                      style={{ width: "100%", height: "100%", border: 0, display: "block" }}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                    <button
                      onClick={() => setShowMap(false)}
                      style={{ position: "absolute", top: 10, right: 10, background: T.navy, color: "#fff", border: "none", padding: "6px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }}
                    >
                      ✕ Hide Map
                    </button>
                  </>
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`, backgroundSize: "30px 30px" }} />
                    <div style={{ textAlign: "center", position: "relative" }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📍</div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Swahilipot Hub · Old Town, Mombasa</div>
                      <button className="btn-outline-white" style={{ marginTop: 16, fontSize: 11, padding: "8px 20px" }} onClick={() => setShowMap(true)}>Open in Google Maps</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.15}>
            {sent ? (
              <div style={{ background: "#fff", border: `1px solid ${T.border}`, padding: "48px 40px", textAlign: "center" }} className="fade-in-anim card-pad">
                <div style={{ fontSize: 48, marginBottom: 16 }}>✉</div>
                <div className="display" style={{ fontSize: "clamp(18px, 4.5vw, 22px)", fontWeight: 700, color: T.navy, marginBottom: 12 }}>
                  {sentVia === "direct" ? "Message Sent!" : "Almost There!"}
                </div>
                <p style={{ color: T.textMuted, fontSize: 14, lineHeight: 1.75, marginBottom: 24 }}>
                  {sentVia === "direct"
                    ? <>Your message has been delivered to <strong>{SWAHILIPOT_EMAIL}</strong>. We'll get back to you as soon as we can. For urgent matters call +254 11 4635505.</>
                    : <>We couldn't send automatically, so your email app has opened with your message addressed to <strong>{SWAHILIPOT_EMAIL}</strong> — just press send there to deliver it.</>}
                </p>
                <button className="btn-outline" onClick={() => { setSent(false); setMsg({ name: "", email: "", phone: "", type: "General Enquiry", body: "" }); }}>Write Another Message</button>
              </div>
            ) : (
              <div className="card-pad" style={{ background: "#fff", border: `1px solid ${T.border}`, padding: "40px 40px" }}>
                <div className="display" style={{ fontSize: "clamp(17px, 4vw, 20px)", fontWeight: 700, color: T.navy, marginBottom: 6 }}>Send Us a Message</div>
                <p style={{ color: T.textMuted, fontSize: 13, marginBottom: 24 }}>Your message goes straight to {SWAHILIPOT_EMAIL}.</p>
                {[["Full Name *", "name", "text", "e.g. Amina Hassan"], ["Email Address *", "email", "email", "your@email.com"], ["Phone Number", "phone", "tel", "+254 700 000 000"]].map(([label, key, type, ph]) => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textLight, marginBottom: 6 }}>{label}</label>
                    <input className="input-field" type={type} placeholder={ph} value={msg[key]} onChange={e => upd(key, e.target.value)} />
                  </div>
                ))}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textLight, marginBottom: 6 }}>Enquiry Type</label>
                  <select className="input-field" style={{ appearance: "none", cursor: "pointer" }} value={msg.type} onChange={e => upd("type", e.target.value)}>
                    <option>General Enquiry</option>
                    <option>Programs & Training</option>
                    <option>Partnerships & Sponsorship</option>
                    <option>Swahilipot FM</option>
                    <option>Media & Press</option>
                    <option>Volunteering & Internships</option>
                    <option>Impact & Community Programmes</option>
                    <option>Feedback</option>
                    <option>Other</option>
                  </select>
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textLight, marginBottom: 6 }}>Message *</label>
                  <textarea className="input-field" rows={5} placeholder="How can we help you?" style={{ resize: "vertical" }} value={msg.body} onChange={e => upd("body", e.target.value)} />
                </div>
                <button className="btn-primary" style={{ width: "100%", textAlign: "center", fontSize: 14, padding: "15px" }} onClick={handleSend} disabled={sending}>
                  {sending ? "Sending…" : "Send Message →"}
                </button>
                <div style={{ display: "flex", gap: 24, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: T.textLight, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Delivered To</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: T.navy }}>{SWAHILIPOT_EMAIL}</div>
                  </div>
                  <div style={{ width: 1, background: T.border }} />
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: T.textLight, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Open Days</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: T.navy }}>Mon–Sat</div>
                  </div>
                </div>
              </div>
            )}
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── FOOTER ─────────────────── */
function Footer({ onNav }) {
  const { onAir } = useRadio();
  /*
   * Footer links. Each link either scrolls to a section on this page
   * (section: "about" etc.) or opens an external URL (href: "https://…").
   */
  const FOOTER_COLS = [
    {
      title: "Quick Links",
      links: [
        { label: "About Us", section: "about" },
        { label: "Innovation Spaces", section: "studios" },
        { label: "News & Updates", section: "news" },
        { label: "FM Live", section: "fm-live" },
        { label: "Impacts & Success Stories", section: "impacts" },
        { label: "Contact Us", section: "contact" },
      ],
    },
    {
      title: "Our Programs",
      links: [
        { label: "Digital Skills Training", section: "studios" },
        { label: "Entrepreneurship & Incubation", section: "studios" },
        { label: "Creative Arts & Media", section: "studios" },
        { label: "Mentorship & Case Management", section: "impacts" },
        { label: "Community Open Days", section: "studios" },
      ],
    },
    {
      title: "Get Involved",
      links: [
        { label: "Careers & Internships", href: "https://www.swahilipothub.co.ke/careers" },
        { label: "Volunteer With Us", section: "contact" },
        { label: "Partner With Us", section: "contact" },
        { label: "Visit the Hub", section: "contact" },
        { label: "Download Impact Report", section: "impacts" },
      ],
    },
  ];

  const followLink = (l) => {
    if (l.href) window.open(l.href, "_blank");
    else if (l.section) onNav(l.section);
  };

  return (
    <footer style={{ background: T.navy, padding: "72px 5% 32px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        {/* Top CTA strip */}
        <div className="card-pad" style={{ background: T.gold, padding: "28px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 56 }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(17px, 4vw, 20px)", fontWeight: 700, color: T.navy }}>Be Part of the Change</div>
            <div style={{ color: "rgba(10,22,40,0.6)", fontSize: 14, marginTop: 4 }}>Join our programs in technology, arts and entrepreneurship — open to youth across the Coast region.</div>
          </div>
          <button className="btn-navy" onClick={() => onNav("contact")} style={{ whiteSpace: "nowrap" }}>Get in Touch →</button>
        </div>

        <div className="footer-grid">
          <div>
            <div className="display" style={{ fontSize: "clamp(17px, 4vw, 20px)", fontWeight: 700, color: "#fff", marginBottom: 4 }}>Swahilipot Hub Foundation</div>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 20 }}>Old Town, Mombasa, Kenya · Est. 2016</div>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, lineHeight: 1.8, maxWidth: 280 }}>
              A technology, creatives and heritage space empowering youth across Kenya's coastal region through digital skills, entrepreneurship, arts and community-driven innovation.
            </p>
            <div style={{ marginTop: 20 }}>
              {[
                ["📍", "Swahili Cultural Centre, Sir Mbarak Hinaway Rd"],
                ["✉", "info@swahilipothub.co.ke"],
                ["📞", "+254 11 4635505"],
              ].map(([icon, val]) => (
                <div key={val} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13 }}>{icon}</span>
                  <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, color: T.gold, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Tune In</div>
              <div onClick={() => onNav("fm-live")} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 14 }}>
                  {[0.5, 1, 0.7, 0.9, 0.4].map((h, i) => (
                    <div key={i} className="audio-bar" style={{ height: onAir ? `${h * 14}px` : "3px", animationDuration: `${0.5 + i * 0.15}s`, background: onAir ? T.green : "#555" }} />
                  ))}
                </div>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Swahilipot FM · {onAir ? "On Air" : "Off Air"}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              {[
                ["f", "https://www.facebook.com/Swahilipothub"],
                ["𝕏", "https://x.com/swahilipothub"],
                ["in", "https://ke.linkedin.com/company/swahilipot-hub"],
                ["▶", "https://www.youtube.com/@swahilipothubfoundation"],
              ].map(([s, url]) => (
                <div key={s} onClick={() => window.open(url, "_blank")} style={{ width: 34, height: 34, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.5)", transition: "background 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
                  onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}>
                  {s}
                </div>
              ))}
            </div>
          </div>
          {FOOTER_COLS.map(col => (
            <div key={col.title}>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 18 }}>{col.title}</div>
              {col.links.map(l => (
                <div key={l.label} style={{ marginBottom: 10 }}>
                  <a
                    onClick={() => followLink(l)}
                    style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, textDecoration: "none", transition: "color 0.15s", lineHeight: 1.6, cursor: "pointer" }}
                    onMouseOver={e => e.target.style.color = "rgba(255,255,255,0.7)"}
                    onMouseOut={e => e.target.style.color = "rgba(255,255,255,0.35)"}>
                    {l.label}{l.href ? " ↗" : ""}
                  </a>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-bottom" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 24 }}>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
           © 2026 Swahilipot Hub Foundation. Registered Non-Profit Organization, Mombasa, Kenya. All Rights Reserved.
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {["Privacy Policy", "Terms of Use", "Cookie Policy", "Accessibility"].map(l => (
              <a key={l} href="#" style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, textDecoration: "none" }}
                onMouseOver={e => e.target.style.color = "rgba(255,255,255,0.4)"}
                onMouseOut={e => e.target.style.color = "rgba(255,255,255,0.2)"}>
                {l}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────── BACK TO TOP / FLOATING FM ─────────────────── */
function FloatingElements({ onNav }) {
  const [show, setShow] = useState(false);
  const [showFM, setShowFM] = useState(false);
  const { onAir } = useRadio();
  useEffect(() => {
    const h = () => { setShow(window.scrollY > 600); };
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);
  return (
    <>
      {show && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ position: "fixed", bottom: 96, right: 24, width: 44, height: 44, background: T.navy, color: "#fff", border: "none", fontSize: 18, cursor: "pointer", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>↑</button>
      )}
      {/* Floating FM badge — matches the shared radio state */}
      <div style={{ position: "fixed", bottom: 24, right: show ? 76 : 24, zIndex: 100, transition: "right 0.3s" }}>
        <div onClick={() => setShowFM(s => !s)} style={{ background: onAir ? T.green : "#333", padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 12 }}>
            {[0.5, 1, 0.6].map((h, i) => (
              <div key={i} className="audio-bar" style={{ height: onAir ? `${h * 12}px` : "3px", animationDuration: `${0.5 + i * 0.2}s`, background: onAir ? "#fff" : "#777" }} />
            ))}
          </div>
          <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>{onAir ? "ON AIR" : "OFF AIR"}</span>
        </div>
        {showFM && (
          <div className="slide-down" style={{ position: "absolute", bottom: "100%", right: 0, width: 280, marginBottom: 8 }}>
            <FMLiveWidget />
          </div>
        )}
      </div>
    </>
  );
}

/* ─────────────────── NAVBAR ─────────────────── */
function Navbar({ onNav, currentSection, navigate }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
		<>
			<nav
				style={{
					position: "fixed",
					top: 0,
					left: 0,
					right: 0,
					zIndex: 150,
					background: scrolled ? "rgba(10,22,40,0.97)" : "rgba(10,22,40,0.85)",
					backdropFilter: "blur(12px)",
					borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
					transition: "all 0.3s",
					height: 72,
					display: "flex",
					alignItems: "center",
					padding: "0",
				}}>
				<div
					className="nav-wrap"
					style={{
						maxWidth: 1800,
						width: "100%",
						margin: "0 auto",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 16,
					}}>
					<div className="nav-brand" onClick={() => onNav("home")}>
						<img
							src={spLogo}
							alt="Swahilipot Hub Foundation"
							style={{
								height: 40,
								width: "auto",
								objectFit: "contain",
							}}
						/>

						<div>
							<div
								className="display nav-brand-title"
								style={{
									fontSize: 24,
									fontWeight: 1000,
									color: "#00AEEF",
									lineHeight: 1.1,
								}}></div>

							<div
								className="nav-brand-sub"
								style={{
									fontSize: 9,
									letterSpacing: "0.22em",
									textTransform: "uppercase",
									color: T.gold,
								}}></div>
						</div>
					</div>
					<div className="nav-links-desktop">
						{NAV_SECTIONS.filter((n) => n && n !== "Home").map((n) => (
							<a
								key={n}
								className={`nav-link${currentSection === n.toLowerCase().replace(" ", "-") ? " active" : ""}`}
								onClick={() => {
									onNav(n.toLowerCase().replace(" ", "-"));
									setMobileOpen(false);
								}}
								style={{ fontSize: 12 }}>
								{n}
							</a>
						))}
					</div>
					<div
						style={{
							display: "flex",
							gap: 10,
							alignItems: "center",
							flexShrink: 0,
						}}>
						<a
							className="nav-login"
							onClick={() => navigate("/login")}
							style={{
								color: "rgba(255,255,255,0.5)",
								fontSize: 12,
								textDecoration: "none",
								padding: "8px 14px",
								border: "1px solid rgba(255,255,255,0.1)",
								cursor: "pointer",
							}}>
							Login
						</a>
						<button
							className="btn-primary nav-events"
							onClick={() =>
								window.open("https://www.swahilipothub.co.ke/events", "_blank")
							}
							style={{ padding: "9px 18px", fontSize: 12 }}>
							Events
						</button>
						<button
							className="nav-burger"
							aria-label="Open menu"
							onClick={() => setMobileOpen(true)}>
							☰
						</button>
					</div>
				</div>
			</nav>
			{mobileOpen && (
				<div className="mobile-menu">
					<div
						onClick={() => setMobileOpen(false)}
						style={{
							position: "absolute",
							top: 20,
							right: 20,
							color: "rgba(255,255,255,0.5)",
							fontSize: 24,
							cursor: "pointer",
						}}>
						✕
					</div>
					{NAV_SECTIONS.filter(Boolean).map((n) => (
						<a
							key={n}
							onClick={() => {
								onNav(n.toLowerCase().replace(" ", "-"));
								setMobileOpen(false);
							}}
							style={{
								color: "rgba(255,255,255,0.7)",
								fontSize: 20,
								fontFamily: "'Playfair Display',serif",
								padding: "12px 0",
								borderBottom: "1px solid rgba(255,255,255,0.06)",
								cursor: "pointer",
								textDecoration: "none",
							}}>
							{n}
						</a>
					))}
					<button
						className="btn-primary"
						style={{ marginTop: 16, padding: "15px" }}
						onClick={() => {
							window.open("https://www.swahilipothub.co.ke/events", "_blank");
							setMobileOpen(false);
						}}>
						Events
					</button>
					<button
						className="btn-outline-white"
						style={{ marginTop: 10, padding: "13px" }}
						onClick={() => {
							navigate("/login");
							setMobileOpen(false);
						}}>
						Login
					</button>
				</div>
			)}
		</>
	);
}

/* ─────────────────── COOKIE BANNER ─────────────────── */
function CookieBanner() {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(10,22,40,0.97)", borderTop: `2px solid ${T.gold}`, padding: "16px 5%", zIndex: 180, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.7, flex: 1 }}>
        We use cookies to improve your experience, personalise content, and analyse our traffic in accordance with the Kenya Data Protection Act 2019.
        <a href="#" style={{ color: T.gold, marginLeft: 4 }}>Learn more</a>
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn-outline-white" style={{ fontSize: 11, padding: "8px 18px" }} onClick={() => setShown(false)}>Decline</button>
        <button className="btn-primary" style={{ fontSize: 11, padding: "8px 18px" }} onClick={() => setShown(false)}>Accept All</button>
      </div>
    </div>
  );
}

/* ─────────────────── ROOT ─────────────────── */
export default function BroadcastInstitutionSite() {
  const [section, setSection] = useState("home");
  const navigate = useNavigate();

  const navTo = useCallback((id) => {
    setSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Intersection observer to track active section
  useEffect(() => {
    const ids = ["home", "about", "studios", "news", "fm-live", "programs", "impacts", "contact"];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) setSection(e.target.id); });
    }, { threshold: 0.3 });
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  return (
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif",
        background: T.cream,
        color: T.text,
        overflowX: "hidden",
      }}>
      <style>{GLOBAL_CSS}</style>
      <Navbar onNav={navTo} currentSection={section} navigate={navigate} />
      <HeroSection onNav={navTo} />
      <AboutSection />
      {/* <ProgrammesSection /> */}
      <StudiosSection onNav={navTo} />
      <NewsSection />
      <FMLiveSection />
      {/*<AdmissionsSection />*/}
      <ImpactsSection />
      <ContactSection />
      <Footer onNav={navTo} />
      <FloatingElements onNav={navTo} />
      <CookieBanner />
    </div>
  );
}
